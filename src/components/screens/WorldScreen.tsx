import React, { useState } from 'react';
import { GameState, RegionId, OccupationType, ProductCategory } from '../../types';
import { WhyDrilldown } from '../shared/WhyDrilldown';
import { TapToChart } from '../shared/TapToChart';
import { SegmentedBar } from '../charts/Charts';
import { formatCurrency, formatPercent } from '../../engine/formatters';

const SUPPLY_CHAIN_CATEGORIES: string[] = ['CorporateTech', 'StandardHousehold', 'LuxuryHousehold'];

export const WorldScreen: React.FC<{ state: GameState, prevState?: GameState | null, onNavigate?: (dest: any, payload?: any) => void }> = ({ state, prevState, onNavigate }) => {
  const [activeRegion, setActiveRegion] = useState<RegionId>('USA');
  const reg = state.regions[activeRegion];
  const prevReg = prevState?.regions[activeRegion];

  const getSignal = (current: number, previous?: number): 'positive' | 'negative' | 'neutral' => {
    if (previous === undefined || previous === null) return 'neutral';
    if (current > previous + 0.0001) return 'positive';
    if (current < previous - 0.0001) return 'negative';
    return 'neutral';
  };

  const getInverseSignal = (current: number, previous?: number): 'positive' | 'negative' | 'neutral' => {
    if (previous === undefined || previous === null) return 'neutral';
    if (current < previous - 0.0001) return 'positive';
    if (current > previous + 0.0001) return 'negative';
    return 'neutral';
  };

  const getMultiplierSignal = (current: number, previous?: number): 'positive' | 'negative' | 'neutral' => {
    if (previous === undefined || previous === null) return 'neutral';
    if (current > previous * 1.001) return 'positive';
    if (current < previous * 0.999) return 'negative';
    return 'neutral';
  };

  const formatPct = (val: number | undefined | null, showSign: boolean = false) => formatPercent(val, { isDecimal: true, precision: 2, showSign });
  const formatBln = (val: number | undefined | null) => formatCurrency(val, { compact: true, precision: 1 });

  // 1. GDP
  const nx = reg.exportsUSD - reg.importsUSD;

  // Investment derivation
  const publicCompanies = state.companies.filter(c => c.region === activeRegion && !c.isDefaulted);
  const trackedEmployment = publicCompanies.reduce((s, c) => s + (c.employeeCount || 0), 0);
  const publicInvestment = publicCompanies.reduce((s, c) => s + (c.maintenanceCapex || 0) + (c.growthCapex || 0), 0);

  // 3. Unemployment Labor Force Identity
  const privateEmployment = reg.privateSectorSegments.reduce((s, seg) => s + seg.employment, 0);
  const prevPrivateEmployment = prevReg?.privateSectorSegments.reduce((s, seg) => s + seg.employment, 0) || 0;
  const publicEmployment = publicCompanies.reduce((s, comp) => s + (comp.employeeCount ?? 0), 0);
  const prevPublicEmployment = prevState?.companies.filter(c => c.region === activeRegion && !c.isDefaulted).reduce((s, comp) => s + (comp.employeeCount ?? 0), 0) || 0;

  // 8. Government Debt Tranches
  const govDebtTotal = reg.govDebtTranches.reduce((sum, t) => sum + t.principalUSD, 0);
  const debtSegments = [...reg.govDebtTranches]
    .sort((a, b) => a.maturityWeek - b.maturityWeek)
    .map((t, i) => ({
      value: t.principalUSD,
      label: `${Math.round(Math.max(0, t.maturityWeek - state.currentWeek) / 52)}Y`,
      color: `hsl(${220 - (i % 10) * 15}, 60%, 50%)`
    }));

  const generateRegionStatus = (r: typeof reg): string => {
    const parts: string[] = [];
    if (r.cycleRegime === 'Recession' || r.cycleRegime === 'Slowdown') parts.push(`${r.cycleRegime} with unemployment at ${(r.unemploymentRate * 100).toFixed(1)}%`);
    else parts.push(`${r.cycleRegime}, GDP growing at ${(r.gdpGrowth * 100).toFixed(1)}%`);
    if (r.inflation > r.targetInflation * 1.3) parts.push('inflation running hot');
    if (r.bankingSector.creditConditionsIndex > 0.5) parts.push('credit conditions tight');
    return parts.join(' · ');
  };

  return (
    <div className="p-3 space-y-6 pb-20">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(r => (
            <button
              key={r}
              onClick={() => setActiveRegion(r)}
              className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${activeRegion === r ? 'text-[var(--bg-void)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
              style={{ backgroundColor: activeRegion === r ? `var(--region-${r.toLowerCase()})` : 'var(--bg-elevated)' }}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] italic px-1 pt-1">
          {generateRegionStatus(reg)}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Global Equities</h3>
        <WhyDrilldown
          headline="Composite Indices"
          value={state.compositeIndices?.us500?.value !== undefined ? state.compositeIndices.us500.value.toFixed(2) : '—'}
          signal={(state.compositeIndices?.us500?.value ?? 0) > (state.compositeIndices?.us500?.historical?.[0] ?? 0) ? 'positive' : ((state.compositeIndices?.us500?.value ?? 0) < (state.compositeIndices?.us500?.historical?.[0] ?? 0) ? 'negative' : 'neutral')}
          contributors={[
            { label: 'US 500', value: state.compositeIndices?.us500?.value !== undefined ? state.compositeIndices.us500.value.toFixed(2) : '—', signal: (state.compositeIndices?.us500?.value ?? 0) > (state.compositeIndices?.us500?.historical?.[0] ?? 0) ? 'positive' : ((state.compositeIndices?.us500?.value ?? 0) < (state.compositeIndices?.us500?.historical?.[0] ?? 0) ? 'negative' : 'neutral') },
            { label: 'EU Stoxx', value: state.compositeIndices?.euStoxx?.value !== undefined ? state.compositeIndices.euStoxx.value.toFixed(2) : '—', signal: (state.compositeIndices?.euStoxx?.value ?? 0) > (state.compositeIndices?.euStoxx?.historical?.[0] ?? 0) ? 'positive' : ((state.compositeIndices?.euStoxx?.value ?? 0) < (state.compositeIndices?.euStoxx?.historical?.[0] ?? 0) ? 'negative' : 'neutral') },
            { label: 'UK 100', value: state.compositeIndices?.uk100?.value !== undefined ? state.compositeIndices.uk100.value.toFixed(2) : '—', signal: (state.compositeIndices?.uk100?.value ?? 0) > (state.compositeIndices?.uk100?.historical?.[0] ?? 0) ? 'positive' : ((state.compositeIndices?.uk100?.value ?? 0) < (state.compositeIndices?.uk100?.historical?.[0] ?? 0) ? 'negative' : 'neutral') },
            { label: 'JP 225', value: state.compositeIndices?.jp225?.value !== undefined ? state.compositeIndices.jp225.value.toFixed(2) : '—', signal: (state.compositeIndices?.jp225?.value ?? 0) > (state.compositeIndices?.jp225?.historical?.[0] ?? 0) ? 'positive' : ((state.compositeIndices?.jp225?.value ?? 0) < (state.compositeIndices?.jp225?.historical?.[0] ?? 0) ? 'negative' : 'neutral') }
          ]}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Macroeconomic Fundamentals</h3>
        
        <WhyDrilldown
          headline="GDP Growth (Annualized)"
          value={formatPct(reg.gdpGrowth, true)}
          signal={getSignal(reg.gdpGrowth, prevReg?.gdpGrowth)}
          contributors={[
            { label: 'Consumption (C)', value: formatBln(reg.consumptionComponentUSD), signal: getSignal(reg.consumptionComponentUSD, prevReg?.consumptionComponentUSD) },
            { 
              label: 'Investment (I)', 
              value: formatBln(reg.investmentComponentUSD), 
              signal: getSignal(reg.investmentComponentUSD, prevReg?.investmentComponentUSD),
              contributors: [
                { label: 'Public Companies', value: formatBln(publicInvestment), signal: 'neutral' },
                ...reg.privateSectorSegments.map(seg => ({
                  label: seg.segmentType.replace('_', ' ').toLowerCase(),
                  value: formatBln((publicInvestment / (trackedEmployment || 1)) * seg.employment),
                  signal: 'neutral' as const
                }))
              ]
            },
            { label: 'Gov Spending (G)', value: formatBln(reg.governmentSpendingUSD * 52), signal: getSignal(reg.governmentSpendingUSD, prevReg?.governmentSpendingUSD) },
            { label: 'Net Exports (NX)', value: formatBln(nx), signal: nx >= 0 ? 'positive' : 'negative' }
          ]}
        />

        <WhyDrilldown
          headline="Inflation (CPI YoY)"
          value={formatPct(reg.inflation)}
          signal={getInverseSignal(reg.inflation, prevReg?.inflation)}
          contributors={[
            { label: 'Wage-Push Inflation', value: formatPct(reg.wagePushInflation), signal: getInverseSignal(reg.wagePushInflation, prevReg?.wagePushInflation) },
            { label: 'Monetary Pressure', value: formatPct(reg.monetaryInflationPressure), signal: getInverseSignal(reg.monetaryInflationPressure, prevReg?.monetaryInflationPressure) }
          ]}
        />

        <WhyDrilldown
          headline="Unemployment Rate"
          value={formatPct(reg.unemploymentRate)}
          signal={getInverseSignal(reg.unemploymentRate, prevReg?.unemploymentRate)}
          contributors={[
            { 
              label: 'Private Sector', 
              value: Math.round(privateEmployment).toLocaleString(), 
              signal: getMultiplierSignal(privateEmployment, prevPrivateEmployment),
              contributors: reg.privateSectorSegments.map(seg => ({
                label: seg.segmentType.replace('_', ' ').toLowerCase(),
                value: Math.round(seg.employment).toLocaleString(),
                signal: 'neutral' as const
              }))
            },
            { label: 'Government', value: Math.round(reg.governmentEmployment).toLocaleString(), signal: getMultiplierSignal(reg.governmentEmployment, prevReg?.governmentEmployment) },
            { label: 'Public Companies', value: Math.round(publicEmployment).toLocaleString(), signal: getMultiplierSignal(publicEmployment, prevPublicEmployment) }
          ]}
        />
        
        <WhyDrilldown
          headline="Government Deficit"
          value={formatPct(reg.fiscalDeficitPctGdp)}
          signal={getInverseSignal(reg.fiscalDeficitPctGdp, prevReg?.fiscalDeficitPctGdp)}
          contributors={[
            { label: 'Spending', value: formatBln(reg.governmentSpendingUSD), signal: getInverseSignal(reg.governmentSpendingUSD, prevReg?.governmentSpendingUSD) },
            { label: 'Revenue', value: formatBln(reg.governmentRevenueUSD), signal: getSignal(reg.governmentRevenueUSD, prevReg?.governmentRevenueUSD) }
          ]}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Composite Indicators</h3>
        <WhyDrilldown
          headline="PMI Composite"
          value={state.compositeIndices?.pmiComposite?.headline !== undefined ? state.compositeIndices.pmiComposite.headline.toFixed(1) : '—'}
          signal={getSignal(state.compositeIndices?.pmiComposite?.headline ?? 0, prevState?.compositeIndices?.pmiComposite?.headline)}
          contributors={[
            { label: 'Demand', value: state.compositeIndices?.pmiComposite?.demandComponent !== undefined ? state.compositeIndices.pmiComposite.demandComponent.toFixed(1) : '—', signal: getSignal(state.compositeIndices?.pmiComposite?.demandComponent ?? 0, prevState?.compositeIndices?.pmiComposite?.demandComponent) },
            { label: 'CapEx', value: state.compositeIndices?.pmiComposite?.capexComponent !== undefined ? state.compositeIndices.pmiComposite.capexComponent.toFixed(1) : '—', signal: getSignal(state.compositeIndices?.pmiComposite?.capexComponent ?? 0, prevState?.compositeIndices?.pmiComposite?.capexComponent) },
            { label: 'Employment', value: state.compositeIndices?.pmiComposite?.employmentComponent !== undefined ? state.compositeIndices.pmiComposite.employmentComponent.toFixed(1) : '—', signal: getSignal(state.compositeIndices?.pmiComposite?.employmentComponent ?? 0, prevState?.compositeIndices?.pmiComposite?.employmentComponent) }
          ]}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Labor Market (Occupations)</h3>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] p-3">
          <div className="flex items-end h-24 gap-1 mb-2">
            {(Object.entries(reg.occupationPools) as [OccupationType, typeof reg.occupationPools[OccupationType]][]).map(([occType, pool]) => {
              const h = Math.max(0, Math.min(100, pool.wageGrowthAnnual * 1000));
              return (
                <div key={occType} className="flex-1 flex flex-col justify-end items-center group relative cursor-pointer" title={occType}>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max(8, h)}%`,
                      backgroundColor: pool.wageGrowthAnnual > 0.08 ? 'var(--signal-negative)' : 'var(--region-usa)'
                    }}
                  ></div>
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[var(--bg-highlight)] text-xs p-1 rounded z-10 pointer-events-none">
                    {formatPct(pool.wageGrowthAnnual)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-[var(--text-secondary)] uppercase font-bold text-center">
            {(Object.keys(reg.occupationPools) as OccupationType[]).map(occType => (
               <div key={occType} className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={occType.replace('_', ' ').toLowerCase()}>
                 {occType.substring(0, 3)}
               </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Supply Chain & Demand</h3>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] overflow-hidden">
          <div className="h-24 w-full flex items-end gap-[2px] opacity-80 border-b border-[var(--border-hairline)] px-2 pt-2">
            {(reg.categoryDemand['StandardHousehold' as ProductCategory]?.demandHistory || []).map((_, i) => (
               <div key={i} className="flex-1 flex flex-col justify-end gap-[1px]">
                  {(Object.keys(reg.categoryDemand) as ProductCategory[]).map((cat, j) => {
                     const series = reg.categoryDemand[cat]?.demandHistory || [];
                     const h = series[i] || 0;
                     const seriesMax = Math.max(...series, 1);
                     const seriesMin = Math.min(...series, 0);
                     const range = seriesMax - seriesMin || 1;
                     const hPx = Math.max(1, Math.round(((h - seriesMin) / range) * 20));
                     return <div key={j} style={{ height: `${hPx}px`, backgroundColor: `hsl(${j * 40}, 60%, 50%)` }} />;
                  })}
               </div>
            ))}
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {(Object.entries(reg.categoryDemand) as [ProductCategory, typeof reg.categoryDemand[ProductCategory]][]).map(([cat, demand]) => (
              <div key={cat} className="p-3 flex items-center justify-between hover:bg-[var(--bg-highlight)] transition-colors">
                <div className="flex-1">
                  <TapToChart
                    label={cat}
                    value={<span className={`text-xs font-bold font-[var(--font-numeric)] ${demand.demandGrowthAnnual > 0 ? 'text-[var(--signal-positive)]' : demand.demandGrowthAnnual < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>{formatPct(demand.demandGrowthAnnual, true)}</span>}
                    history={demand.demandHistory}
                  />
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] ml-4 text-right">
                  {SUPPLY_CHAIN_CATEGORIES.includes(cat) && demand.clearedInputPriceIndex !== undefined ? `Cost: ${demand.clearedInputPriceIndex.toFixed(2)}` : 'No supply-chain linkage'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Government Debt Profile</h3>
        <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-xs text-[var(--text-secondary)]">Total Sovereign Debt</div>
              <div className="text-lg font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatBln(govDebtTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[var(--text-tertiary)]">Debt to GDP</div>
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatPercent(reg.debtToGdpPctBottomUp || reg.debtToGdpPct, { isDecimal: true, precision: 1 })}</div>
            </div>
          </div>
          <div className="h-2">
            <SegmentedBar segments={debtSegments} height={8} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Banking & Money Supply</h3>
        <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
          <TapToChart 
            label="Bank Capital Ratio" 
            value={formatPercent(reg.bankingSector.bankCapitalRatio, { isDecimal: true, precision: 2 })}
            history={undefined}
          />
          <TapToChart 
            label="M2 Money Supply" 
            value={formatBln(reg.bankingSector.moneySupplyM2USD)}
            history={undefined}
          />
          <div className="flex justify-between p-1">
            <span className="text-[11px] text-[var(--text-secondary)]">CB Reserves</span>
            <span className="text-xs font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatBln(reg.bankingSector.centralBankReservesUSD)}</span>
          </div>
          <div className="flex justify-between p-1">
            <span className="text-[11px] text-[var(--text-secondary)]">CB Stance</span>
            <span className={`text-xs font-bold ${reg.balanceSheetStance > 0 ? 'text-[var(--signal-positive)]' : reg.balanceSheetStance < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
              {reg.balanceSheetStance > 0 ? 'Quantitative Easing (QE)' : reg.balanceSheetStance < 0 ? 'Quantitative Tightening (QT)' : 'Neutral'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Private Sector Segments</h3>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)]">
          {reg.privateSectorSegments.map((seg) => (
            <div key={seg.segmentType} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-[var(--text-primary)] capitalize">{seg.segmentType.replace('_', ' ').toLowerCase()}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">Employees: {Math.round(seg.employment).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatBln(seg.annualRevenueUSD)}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">Margin: {formatPercent(seg.marginPct, { isDecimal: true, precision: 1 })}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
