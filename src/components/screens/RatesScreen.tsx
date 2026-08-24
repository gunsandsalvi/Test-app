import React, { useState } from 'react';
import { GameState, RegionId, GovDebtTranche } from '../../types';
import { calculateNelsonSiegelZeroRate } from '../../engine/nelsonSiegel';
import { calculateParSwapRate, priceCorporateBond } from '../../engine/pricing';

export const RatesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('USA');
  const reg = state.regions[selectedRegion];

  // Government Bonds
  const sovereignRiskPremiumBps = reg.sovereignRating === 'AAA' ? 0 : reg.sovereignRating === 'AA' ? 15 : reg.sovereignRating === 'A' ? 35 : reg.sovereignRating === 'BBB' ? 70 : 150;
  
  const govBonds = (reg.govDebtTranches || []).map((t: GovDebtTranche) => {
    const remainingTenorYears = Math.max(0.01, (t.maturityWeek - state.currentWeek) / 52);
    const bondPricing = priceCorporateBond(remainingTenorYears, t.couponRate, reg.yieldCurveParams, sovereignRiskPremiumBps, false, 0.40);
    const cleanName = `${selectedRegion} ${remainingTenorYears.toFixed(1)}Y (due wk ${t.maturityWeek})`;
    
    return {
      id: t.id,
      name: `Gov Bond`,
      ticker: cleanName,
      region: selectedRegion,
      price: bondPricing.price,
      ytm: bondPricing.yieldToMaturity,
      duration: bondPricing.duration,
      tenor: remainingTenorYears,
      change: 0,
      type: 'bond',
      obj: {
        assetType: 'SOV_BOND',
        id: t.id,
        symbol: t.id,
        name: cleanName,
        region: selectedRegion,
        price: bondPricing.price,
        quoteUnit: '% Par',
        details: { tenorYears: remainingTenorYears, fixedRate: t.couponRate, rateType: 'FIXED' }
      }
    };
  });

  // IRS for the region
  const { parRate: irs5y } = calculateParSwapRate(5, reg.yieldCurveParams);
  const irsInstrument = {
    assetType: 'IRS',
    id: `IRS_5Y_${selectedRegion}`,
    symbol: `IRS ${selectedRegion} 5Y`,
    name: `${selectedRegion} 5Y Interest Rate Swap`,
    region: selectedRegion,
    price: irs5y * 100,
    quoteUnit: '% Fixed Rate',
    details: { tenorYears: 5, fixedRate: irs5y }
  };

  // Yield Curve Chart parameters
  const tenors = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];
  const rates = tenors.map(t => calculateNelsonSiegelZeroRate(t, reg.yieldCurveParams));
  
  const minRate = Math.min(0, ...rates);
  const maxRate = Math.max(...rates, 0.05); // cap at 5% min visual
  const range = maxRate - minRate || 0.01;

  const width = 300;
  const chartWidth = width - 32;
  const height = 150;
  
  const pts = rates.map((r, i) => `${(i / (tenors.length - 1)) * chartWidth},${height - ((r - minRate) / range) * height}`).join(' ');

  const handleChartClick = (tenor: number) => {
    // Find closest Gov Bond
    let closestBond = null;
    let minDiff = Infinity;
    for (const b of govBonds) {
       const diff = Math.abs(b.tenor - tenor);
       if (diff < minDiff && diff < 1.0) {
          minDiff = diff;
          closestBond = b;
       }
    }
    if (closestBond) {
      onOpenTrade(closestBond.obj);
    } else {
      onOpenTrade(irsInstrument);
    }
  };

  return (
    <div className="p-3 space-y-4 pb-20">
      {/* Region Selector */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        {(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(r => (
          <button
            key={r}
            onClick={() => setSelectedRegion(r)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              selectedRegion === r
                ? 'bg-[var(--text-primary)] text-[var(--bg-void)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] space-y-4">
         <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedRegion} Yield Curve</h3>
         <div className="relative mx-auto ml-8" style={{ width: width - 32, height }}>
            <div className="absolute left-[-32px] top-0 h-full flex flex-col justify-between text-[9px] text-[var(--text-tertiary)]">
               <span>{(maxRate * 100).toFixed(1)}%</span>
               <span>{(((maxRate + minRate) / 2) * 100).toFixed(1)}%</span>
               <span>{(minRate * 100).toFixed(1)}%</span>
            </div>
            <svg width={chartWidth} height={height} className="overflow-visible">
               <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />
               {rates.map((r, i) => (
                  <circle 
                     key={i} 
                     cx={(i / (tenors.length - 1)) * chartWidth} 
                     cy={height - ((r - minRate) / range) * height} 
                     r={8} 
                     fill="transparent"
                     stroke="#c4b5fd"
                     strokeWidth="2"
                     className="cursor-pointer hover:stroke-white hover:fill-white/20 transition-all"
                     onClick={() => handleChartClick(tenors[i])}
                  />
               ))}
               {/* Plot Gov Bonds roughly on the curve */}
               {govBonds.map(b => {
                  const xRatio = tenors.findIndex(t => t >= b.tenor);
                  const lowerI = Math.max(0, xRatio - 1);
                  const upperI = xRatio === -1 ? tenors.length - 1 : xRatio;
                  const span = tenors[upperI] - tenors[lowerI] || 1;
                  const frac = (b.tenor - tenors[lowerI]) / span;
                  const cx = ((lowerI + frac) / (tenors.length - 1)) * chartWidth;
                  const estimatedYield = b.obj.details.fixedRate || 0;
                  const cy = height - ((estimatedYield - minRate) / range) * height;
                  
                  return (
                     <circle 
                        key={b.id} 
                        cx={cx} 
                        cy={cy} 
                        r={4} 
                        fill="#3b82f6"
                        className="cursor-pointer hover:fill-white transition-all shadow-md"
                        onClick={() => onOpenTrade(b.obj)}
                     >
                        <title>{b.name}</title>
                     </circle>
                  )
               })}
            </svg>
            <div className="absolute bottom-[-20px] w-full flex justify-between text-[9px] text-[var(--text-tertiary)]">
               <span>3M</span>
               <span>2Y</span>
               <span>10Y</span>
               <span>30Y</span>
            </div>
         </div>
         <div className="flex justify-between text-[10px] pt-4 mt-6 border-t border-[var(--border-hairline)]">
            <span>2Y: {(rates[tenors.indexOf(2)] * 100).toFixed(2)}%</span>
            <span>10Y: {(rates[tenors.indexOf(10)] * 100).toFixed(2)}%</span>
            <span className={rates[tenors.indexOf(2)] > rates[tenors.indexOf(10)] ? 'text-[var(--signal-negative)]' : 'text-[var(--signal-positive)]'}>
               2s10s: {((rates[tenors.indexOf(10)] - rates[tenors.indexOf(2)]) * 100).toFixed(2)}%
            </span>
         </div>
         <div className="pt-2 flex justify-between text-xs text-[var(--text-secondary)]">
            <span>Policy Rate: {(reg.policyRate * 100).toFixed(2)}%</span>
            <span>Regime: {reg.cycleRegime}</span>
         </div>
      </div>

      {/* Trailing 26W 2Y & 10Y Curve Shape Chart */}
      {(() => {
        const history26 = (reg.historicalZeroCurves || []).slice(-26);
        if (history26.length === 0) return null;
        const first = history26[0];
        const last = history26[history26.length - 1];
        const initialSlope = first.tenor10Y - first.tenor2Y;
        const currentSlope = last.tenor10Y - last.tenor2Y;
        const slopeState = currentSlope > initialSlope + 0.0005 ? 'Steepening' : currentSlope < initialSlope - 0.0005 ? 'Flattening' : 'Stable';

        const allRates26 = history26.flatMap(h => [h.tenor2Y, h.tenor10Y]);
        const min26 = Math.min(...allRates26);
        const max26 = Math.max(...allRates26);
        const range26 = max26 - min26 || 0.01;
        const h26Width = width - 32;
        const h26Height = 80;

        const pts2Y = history26.map((h, i) => `${(i / Math.max(1, history26.length - 1)) * h26Width},${h26Height - ((h.tenor2Y - min26) / range26) * h26Height}`).join(' ');
        const pts10Y = history26.map((h, i) => `${(i / Math.max(1, history26.length - 1)) * h26Width},${h26Height - ((h.tenor10Y - min26) / range26) * h26Height}`).join(' ');

        return (
          <div className="p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Yield Curve Dynamics (Trailing 26W)</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${slopeState === 'Steepening' ? 'bg-[var(--signal-positive)]/20 text-[var(--signal-positive)]' : slopeState === 'Flattening' ? 'bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]' : 'bg-[var(--bg-highlight)] text-[var(--text-tertiary)]'}`}>
                {slopeState}
              </span>
            </div>
            <div className="relative mx-auto" style={{ width: h26Width, height: h26Height }}>
              <svg width={h26Width} height={h26Height} className="overflow-visible">
                <polyline points={pts2Y} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
                <polyline points={pts10Y} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> 2Y Zero</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> 10Y Zero</span>
              </div>
              <span>2s10s Change: {((currentSlope - initialSlope) * 100).toFixed(2)}%</span>
            </div>
          </div>
        );
      })()}

      {/* IRS / CDS Basis */}
      <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] space-y-2">
         <h3 className="text-xs font-bold text-[var(--text-primary)]">Derivatives & Swaps</h3>
         <div 
            onClick={() => onOpenTrade(irsInstrument)}
            className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-hairline)] cursor-pointer hover:border-[var(--text-tertiary)] transition-colors"
         >
            <div>
               <div className="text-xs font-bold text-[var(--text-primary)]">{irsInstrument.symbol}</div>
               <div className="text-[10px] text-[var(--text-tertiary)]">{irsInstrument.name}</div>
            </div>
            <div className="text-right">
               <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">
                  {irsInstrument.price.toFixed(3)}
               </div>
               <div className="text-[10px] font-bold text-[var(--text-tertiary)]">
                  % Fixed
               </div>
            </div>
         </div>
      </div>
      
      {/* List of Gov Bonds */}
      <div className="space-y-2">
         <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider pl-1 pt-2">Government Debt</h3>
         {govBonds.map(a => (
            <div key={a.id} onClick={() => onOpenTrade(a.obj)} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform">
               <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">{a.ticker}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{a.name}</div>
               </div>
               <div className="text-right">
                  <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">
                     {a.price.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-[var(--text-tertiary)]">
                     YTM {(a.ytm * 100).toFixed(2)}% · Dur {a.duration.toFixed(1)}y
                  </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  );
};
