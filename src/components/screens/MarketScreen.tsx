import React, { useState, useMemo } from 'react';
import { GameState, Company, DebtTranche, Commodity, FxPair } from '../../types';
import { priceCorporateBond, priceLeveragedLoan, calculateParSwapRate } from '../../engine/pricing';
import { calculateBlackScholesGreeks } from '../../engine/blackScholes';

type FilterType = 'equities' | 'bonds' | 'commodities' | 'fx' | 'derivatives';

export const MarketScreen: React.FC<{ 
  state: GameState, 
  prevState?: GameState | null, 
  onOpenTrade: (i: any) => void,
  externalFilter?: 'equities' | 'bonds' | 'commodities' | 'fx' | 'derivatives',
  setExternalFilter?: (f: 'equities' | 'bonds' | 'commodities' | 'fx' | 'derivatives') => void,
  onNavigate?: (dest: any, payload?: any) => void
}> = ({ state, prevState, onOpenTrade, externalFilter, setExternalFilter, onNavigate }) => {
  const [internalFilter, setInternalFilter] = useState<FilterType>('equities');
  const filter = externalFilter || internalFilter;
  
  const handleSetFilter = (f: FilterType) => {
    setInternalFilter(f);
    if (setExternalFilter) setExternalFilter(f);
  };

  const assets = useMemo(() => {
    if (filter === 'equities') {
      return state.companies
        .filter((c: Company) => !c.isDefaulted && c.stockPrice > 0)
        .sort((a: Company, b: Company) => b.marketCap - a.marketCap)
        .slice(0, 50)
        .map((c: Company) => ({
          id: c.id,
          name: c.name,
          ticker: c.ticker,
          region: c.region,
          price: c.stockPrice,
          change: c.stockPrice - (c.historicalPrices[0] || c.stockPrice),
          type: 'equity',
          obj: c
        }));
    }
    if (filter === 'bonds') {
      return state.companies
        .filter((c: Company) => !c.isDefaulted)
        .flatMap((c: Company) => (c.debtTranches || []).map((d: DebtTranche) => {
          const isFixed = d.rateType === 'FIXED';
          const remainingTenorYears = Math.max(0.01, (d.maturityWeek - state.currentWeek) / 52);
          const sovParams = state.regions[c.region].yieldCurveParams;
          const livePrice = c.isDefaulted
            ? (isFixed ? c.recoveryRate * 100 : 65.0)
            : isFixed
              ? priceCorporateBond(remainingTenorYears, d.couponRate ?? 0.05, sovParams, c.oasSpreadBps, c.isDefaulted, c.recoveryRate).price
              : priceLeveragedLoan(d.floatingMarginBps ?? 200, c.oasSpreadBps, remainingTenorYears, c.isDefaulted, c.recoveryRate).pricePar;
          return {
            id: d.id,
            name: `${c.ticker} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Bond' : 'Loan'}`,
            ticker: d.id,
            region: c.region,
            price: livePrice,
            change: 0,
            type: 'bond',
            obj: {
              assetType: isFixed ? 'CORP_BOND' : 'LEV_LOAN',
              id: d.id, symbol: d.id,
              name: `${c.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
              region: c.region, price: livePrice, quoteUnit: isFixed ? '% Par' : 'pts of par',
              details: { trancheId: d.id, tenorYears: remainingTenorYears, fixedRate: d.couponRate ?? 0, rateType: d.rateType, oasSpreadBps: c.oasSpreadBps, rating: c.creditRating, sector: c.sector },
            },
          };
        })).slice(0, 50);
    }
    if (filter === 'commodities') {
      return Object.values(state.commodities || {}).map((c: Commodity) => ({
        id: c.id,
        name: c.name,
        ticker: c.id,
        region: 'Global',
        price: c.spotPrice,
        change: c.spotPrice - (c.historicalPrices[0] || c.spotPrice),
        type: 'commodity',
        obj: c
      }));
    }
    if (filter === 'fx') {
      return (state.fxPairs || []).map((fx: FxPair) => ({
        id: fx.pair,
        name: `${fx.pair} Spot`,
        ticker: fx.pair,
        region: fx.base,
        price: fx.rate,
        change: fx.rate - (fx.historicalRates[0] || fx.rate),
        type: 'fx',
        obj: fx
      }));
    }
    if (filter === 'derivatives') {
       const derivAssets: any[] = [];
       // IRS
       Object.values(state.regions).forEach(reg => {
         const { parRate: fixedRate } = calculateParSwapRate(5, reg.yieldCurveParams);
         derivAssets.push({
           id: `IRS_5Y_${reg.id}`,
           name: `${reg.id} 5Y Interest Rate Swap`,
           ticker: `IRS ${reg.id}`,
           region: reg.id,
           price: fixedRate * 100,
           change: 0,
           type: 'derivative',
           obj: {
             assetType: 'IRS',
             id: `IRS_5Y_${reg.id}`,
             symbol: `IRS ${reg.id} 5Y`,
             name: `${reg.id} 5Y Interest Rate Swap`,
             region: reg.id,
             price: fixedRate * 100,
             quoteUnit: '% Fixed Rate',
             details: { tenorYears: 5, fixedRate }
           }
         });
       });
       // XCS
       (state.fxPairs || []).forEach((fx: FxPair) => {
         const basisBps = fx.basisSpreadBps || 0;
         derivAssets.push({
           id: `XCS_${fx.pair}`,
           name: `${fx.pair} 5Y Basis Swap`,
           ticker: `XCS ${fx.pair}`,
           region: fx.base,
           price: basisBps,
           change: 0,
           type: 'derivative',
           obj: {
             assetType: 'XCS',
             id: `XCS_${fx.pair}`,
             symbol: fx.pair,
             name: `${fx.pair} Cross-Currency Basis Swap`,
             region: fx.base,
             price: basisBps,
             quoteUnit: 'bps Basis',
             details: { tenorYears: 5 }
           }
         });
       });
       // CDS & Options for top 5 companies
       state.companies
        .filter((c: Company) => !c.isDefaulted && c.stockPrice > 0)
        .sort((a: Company, b: Company) => b.marketCap - a.marketCap)
        .slice(0, 5)
        .forEach(c => {
          const cdsSpread = c.oasSpreadBps;
          derivAssets.push({
            id: `CDS_5Y_${c.ticker}`,
            name: `${c.name} 5Y CDS`,
            ticker: `CDS ${c.ticker}`,
            region: c.region,
            price: cdsSpread,
            change: 0,
            type: 'derivative',
            obj: {
              assetType: 'CDS',
              id: `CDS_5Y_${c.ticker}`,
              symbol: `CDS ${c.ticker} 5Y`,
              name: `${c.name} 5Y Credit Default Swap`,
              region: c.region,
              price: cdsSpread,
              quoteUnit: 'bps Spread',
              details: { tenorYears: 5 }
            }
          });
          
          const timeToExpiry = 8 / 52;
          const rf = state.regions[c.region].policyRate;
          const vol = state.marketVolPremium !== undefined ? 0.25 + state.marketVolPremium : 0.25;
          const callBsm = calculateBlackScholesGreeks(c.stockPrice, c.stockPrice, timeToExpiry, rf, vol, 'CALL');
          
          derivAssets.push({
            id: `${c.id}_CALL_ATM`,
            name: `${c.name} ATM Call (8W)`,
            ticker: `${c.ticker} CALL`,
            region: c.region,
            price: callBsm.price,
            change: 0,
            type: 'derivative',
            obj: {
              assetType: 'OPTION',
              id: `${c.id}_CALL_${c.stockPrice}`,
              symbol: `${c.ticker} C${c.stockPrice.toFixed(0)}`,
              name: `${c.name} Call $${c.stockPrice.toFixed(0)}`,
              region: c.region,
              price: callBsm.price,
              quoteUnit: 'Premium/sh',
              details: {
                strike: c.stockPrice,
                optionType: 'CALL',
                impliedVol: vol,
                delta: callBsm.delta,
                gamma: callBsm.gamma,
                vega: callBsm.vega
              }
            }
          });
        });
       return derivAssets;
    }
    return [];
  }, [state, filter]);

  return (
    <div className="p-3 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Markets</h2>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        {(['equities', 'bonds', 'commodities', 'fx', 'derivatives'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => handleSetFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-colors ${
              filter === f 
                ? 'bg-[var(--text-primary)] text-[var(--bg-void)]' 
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {assets.map(a => (
          <div key={a.id} onClick={() => onOpenTrade(a.obj)} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">{a.ticker}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{a.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">
                {a.price > 10 ? a.price.toFixed(2) : a.price.toFixed(4)}
              </div>
              <div className={`text-[10px] font-bold ${a.change > 0 ? 'text-[var(--signal-positive)]' : a.change < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                {a.change > 0 ? '+' : ''}{a.change.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
