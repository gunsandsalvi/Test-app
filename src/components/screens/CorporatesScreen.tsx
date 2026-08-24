import React, { useState, useMemo } from 'react';
import { GameState, Company, RegionId, DebtTranche } from '../../types';
import { priceCorporateBond, priceLeveragedLoan, calculateParSwapRate } from '../../engine/pricing';
import { calculateBlackScholesGreeks } from '../../engine/blackScholes';
import { SegmentedBar } from '../charts/Charts';

export const CorporatesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'EQUITY' | 'DEBT' | 'CDS' | 'OPTIONS'>('EQUITY');

  const filtered = useMemo(() => {
    return state.companies.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.ticker.toLowerCase().includes(search.toLowerCase())
    );
  }, [state.companies, search]);

  const renderExpanded = (c: Company) => {
    // Equity
    const equityObj = {
      assetType: 'EQUITY',
      id: c.id, symbol: c.ticker, name: c.name, region: c.region,
      price: c.stockPrice, quoteUnit: 'USD',
      details: { sector: c.sector, eps: c.eps }
    };

    // Debt
    const tranches = (c.debtTranches || []).map((d: DebtTranche) => {
      const isFixed = d.rateType === 'FIXED';
      const remainingTenorYears = Math.max(0.01, (d.maturityWeek - state.currentWeek) / 52);
      const sovParams = state.regions[c.region].yieldCurveParams;
      const livePrice = c.isDefaulted
        ? (isFixed ? c.recoveryRate * 100 : 65.0)
        : isFixed
          ? priceCorporateBond(remainingTenorYears, d.couponRate ?? 0.05, sovParams, c.oasSpreadBps, c.isDefaulted, c.recoveryRate).price
          : priceLeveragedLoan(d.floatingMarginBps ?? 200, c.oasSpreadBps, remainingTenorYears, c.isDefaulted, c.recoveryRate).pricePar;
      
      return {
        ...d,
        livePrice,
        remainingTenorYears,
        obj: {
          assetType: isFixed ? 'CORP_BOND' : 'LEV_LOAN',
          id: d.id, symbol: d.id,
          name: `${c.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
          region: c.region, price: livePrice, quoteUnit: isFixed ? '% Par' : 'pts of par',
          details: { trancheId: d.id, tenorYears: remainingTenorYears, fixedRate: d.couponRate ?? 0, rateType: d.rateType, oasSpreadBps: c.oasSpreadBps, rating: c.creditRating, sector: c.sector },
        }
      };
    }).sort((a, b) => a.remainingTenorYears - b.remainingTenorYears);

    // CDS
    const cdsSpread = c.oasSpreadBps;
    const cdsObj = {
      assetType: 'CDS',
      id: `CDS_5Y_${c.ticker}`, symbol: `CDS ${c.ticker} 5Y`, name: `${c.name} 5Y CDS`,
      region: c.region, price: cdsSpread, quoteUnit: 'bps Spread',
      details: { tenorYears: 5 }
    };

    // Options
    const timeToExpiry = 8 / 52;
    const rf = state.regions[c.region].policyRate;
    const vol = state.marketVolPremium !== undefined ? 0.25 + state.marketVolPremium : 0.25;
    
    const callBsm = calculateBlackScholesGreeks(c.stockPrice, c.stockPrice, timeToExpiry, rf, vol, 'CALL');
    const putBsm = calculateBlackScholesGreeks(c.stockPrice, c.stockPrice, timeToExpiry, rf, vol, 'PUT');

    const callObj = {
      assetType: 'OPTION',
      id: `${c.id}_CALL_${c.stockPrice}`, symbol: `${c.ticker} C${c.stockPrice.toFixed(0)}`, name: `${c.name} Call $${c.stockPrice.toFixed(0)}`,
      region: c.region, price: callBsm.price, quoteUnit: 'Premium/sh',
      details: { strike: c.stockPrice, optionType: 'CALL', impliedVol: vol, delta: callBsm.delta, gamma: callBsm.gamma, vega: callBsm.vega }
    };
    
    const putObj = {
      assetType: 'OPTION',
      id: `${c.id}_PUT_${c.stockPrice}`, symbol: `${c.ticker} P${c.stockPrice.toFixed(0)}`, name: `${c.name} Put $${c.stockPrice.toFixed(0)}`,
      region: c.region, price: putBsm.price, quoteUnit: 'Premium/sh',
      details: { strike: c.stockPrice, optionType: 'PUT', impliedVol: vol, delta: putBsm.delta, gamma: putBsm.gamma, vega: putBsm.vega }
    };

    return (
      <div className="mt-3 p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-hairline)] space-y-4">
        {/* Sub Navigation */}
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-2">
          {(['EQUITY', 'DEBT', 'CDS', 'OPTIONS'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`text-xs font-bold px-2 py-1 rounded transition-colors ${activeTab === tab ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'EQUITY' && (
          <div className="space-y-3">
             <div className="flex justify-between items-center">
                <span className="text-2xl font-[var(--font-numeric)] text-[var(--text-primary)]">${c.stockPrice.toFixed(2)}</span>
                <button onClick={() => onOpenTrade(equityObj)} className="px-4 py-1.5 bg-[var(--text-primary)] text-[var(--bg-void)] text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                  Trade Equity
                </button>
             </div>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-[var(--bg-elevated)] rounded border border-[var(--border-hairline)]">
                   <div className="text-[10px] text-[var(--text-tertiary)]">Execution Quality</div>
                   <div className="font-bold text-[var(--text-primary)]">{(c.executionQuality * 100).toFixed(1)}%</div>
                </div>
                <div className="p-2 bg-[var(--bg-elevated)] rounded border border-[var(--border-hairline)]">
                   <div className="text-[10px] text-[var(--text-tertiary)]">P/E Ratio</div>
                   <div className="font-bold text-[var(--text-primary)]">{c.eps > 0 ? (c.stockPrice / c.eps).toFixed(1) : 'N/A'}</div>
                </div>
             </div>
             {c.productLines && c.productLines.length > 0 && (
                <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] mt-2">
                   <span>Primary Exposure: {c.productLines[0].category.replace(/([A-Z])/g, ' $1').trim()} ({(c.productLines[0].revenueShare * 100).toFixed(0)}% Rev)</span>
                   <span className="font-bold">Crowding: {state.regions[c.region].categoryDemand[c.productLines[0].category]?.crowdingIntensity.toFixed(2) || '1.00'}x</span>
                </div>
             )}
          </div>
        )}

        {activeTab === 'DEBT' && (
          <div className="space-y-4">
            {tranches.length > 0 ? (
              <>
                <div className="h-10 flex w-full rounded overflow-hidden">
                   {tranches.map((t, i) => (
                      <div 
                        key={t.id} 
                        onClick={() => onOpenTrade(t.obj)}
                        className="h-full flex items-center justify-center border-r border-[var(--bg-panel)] cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ 
                          width: `${Math.max(10, (t.principalUSD / (c.totalDebt || 1)) * 100)}%`, 
                          backgroundColor: t.rateType === 'FIXED' ? '#3b82f6' : '#10b981' 
                        }}
                        title={t.obj.name}
                      >
                         <span className="text-[8px] font-bold text-white uppercase">{t.rateType.substring(0,3)}</span>
                      </div>
                   ))}
                </div>
                <div className="space-y-2">
                   {tranches.map(t => (
                      <div key={t.id} onClick={() => onOpenTrade(t.obj)} className="flex items-center justify-between p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer hover:border-[var(--text-tertiary)] transition-colors">
                         <div>
                            <div className="text-xs font-bold text-[var(--text-primary)]">{t.obj.name}</div>
                            <div className="text-[9px] text-[var(--text-tertiary)]">Rate: {(t.obj.details.fixedRate! * 100).toFixed(2)}% | Prin: ${(t.principalUSD/1000).toFixed(1)}B</div>
                         </div>
                         <div className="text-right">
                            <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">{t.livePrice.toFixed(2)}</div>
                            <div className="text-[9px] text-[var(--text-tertiary)]">{t.obj.quoteUnit}</div>
                         </div>
                      </div>
                   ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-[var(--text-tertiary)] text-center p-4">No outstanding debt.</div>
            )}
          </div>
        )}

        {activeTab === 'CDS' && (
          <div className="space-y-3">
             <div className="flex justify-between items-center">
                <div>
                   <div className="text-2xl font-[var(--font-numeric)] text-[var(--text-primary)]">{cdsSpread.toFixed(0)} <span className="text-xs text-[var(--text-tertiary)]">bps</span></div>
                   <div className="text-xs font-bold text-[var(--signal-negative)]">5Y Default Risk</div>
                </div>
                <button onClick={() => onOpenTrade(cdsObj)} className="px-4 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs font-bold rounded-lg hover:border-[var(--text-tertiary)] transition-colors">
                  Trade CDS
                </button>
             </div>
             
             {/* CDS vs Bond Basis Visualization */}
             <div className="mt-4 p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-hairline)]">
                <div className="text-xs font-bold text-[var(--text-secondary)] mb-2">Credit Basis (OAS vs CDS)</div>
                <div className="relative h-4 w-full bg-[var(--bg-panel)] rounded-full overflow-hidden">
                   <div className="absolute top-0 left-0 h-full bg-blue-500/50 rounded-l-full" style={{ width: `${Math.min(100, (c.oasSpreadBps / 1000) * 100)}%` }} />
                   <div className="absolute top-0 left-0 h-full border-r-2 border-red-500" style={{ width: `${Math.min(100, (cdsSpread / 1000) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mt-1">
                   <span>Bond Implied (OAS)</span>
                   <span className="text-red-400">Derivative Implied (CDS)</span>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'OPTIONS' && (
          <div className="space-y-2">
             <div className="grid grid-cols-2 gap-2">
                <div onClick={() => onOpenTrade(callObj)} className="p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-hairline)] cursor-pointer hover:border-[var(--signal-positive)] transition-colors">
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-[var(--signal-positive)]">ATM Call</span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">${callObj.price.toFixed(2)}</span>
                   </div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">Strike: ${callObj.details.strike.toFixed(0)} • 8W</div>
                </div>
                <div onClick={() => onOpenTrade(putObj)} className="p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-hairline)] cursor-pointer hover:border-[var(--signal-negative)] transition-colors">
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-[var(--signal-negative)]">ATM Put</span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">${putObj.price.toFixed(2)}</span>
                   </div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">Strike: ${putObj.details.strike.toFixed(0)} • 8W</div>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 space-y-4 pb-20">
      <input 
        type="text" 
        placeholder="Search corporates..." 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
      />
      
      <div className="space-y-2">
        {filtered.slice(0, 50).map(c => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
               <div 
                 className="p-3 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform"
                 onClick={() => setExpandedId(isExpanded ? null : c.id)}
               >
                 <div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-[var(--text-primary)]">{c.ticker}</span>
                     {c.isDefaulted && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]">DEFAULT</span>}
                   </div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">{c.name}</div>
                 </div>
                 <div className="text-right">
                   <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">${c.stockPrice.toFixed(2)}</div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">{c.sector}</div>
                 </div>
               </div>
               
               {isExpanded && (
                 <div className="px-3 pb-3 border-t border-[var(--border-hairline)] bg-[var(--bg-void)]">
                   {renderExpanded(c)}
                 </div>
               )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
