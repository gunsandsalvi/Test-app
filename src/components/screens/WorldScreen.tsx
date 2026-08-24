import React, { useState } from 'react';
import { GameState, RegionId, OccupationType, ProductCategory } from '../../types';
import { WhyDrilldown } from '../shared/WhyDrilldown';
import { SegmentedBar, Sparkline } from '../charts/Charts';
import { formatCurrency, formatPercent } from '../../engine/formatters';

export const WorldScreen: React.FC<{ state: GameState, prevState?: GameState | null }> = ({ state, prevState }) => {
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

  const formatPct = (val: number | undefined | null) => formatPercent(val, { precision: 2, showSign: true });
  const formatBln = (val: number | undefined | null) => formatCurrency(val, { compact: true, precision: 1 });

  // 1. GDP
  const nx = reg.exportsUSD - reg.importsUSD;
  const prevNx = prevReg ? prevReg.exportsUSD - prevReg.importsUSD : undefined;

  // 3. Unemployment Labor Force Identity
  const privateEmployment = reg.privateSectorSegments.reduce((s, seg) => s + seg.employment, 0);
  const prevPrivateEmployment = prevReg?.privateSectorSegments.reduce((s, seg) => s + seg.employment, 0);
  const publicEmployment = state.companies.filter(c => c.region === activeRegion).reduce((s, comp) => s + (comp.employeeCount ?? 0), 0);
  const prevPublicEmployment = prevState?.companies.filter(c => c.region === activeRegion).reduce((s, comp) => s + (comp.employeeCount ?? 0), 0);

  // 8. Government Debt Tranches
  const govDebtTotal = reg.govDebtTranches.reduce((sum, t) => sum + t.principalUSD, 0);
  const shortDebt = reg.govDebtTranches.filter(t => (t.maturityWeek - t.originationWeek) <= 104).reduce((sum, t) => sum + t.principalUSD, 0);
  const medDebt = reg.govDebtTranches.filter(t => (t.maturityWeek - t.originationWeek) > 104 && (t.maturityWeek - t.originationWeek) <= 520).reduce((sum, t) => sum + t.principalUSD, 0);
  const longDebt = reg.govDebtTranches.filter(t => (t.maturityWeek - t.originationWeek) > 520).reduce((sum, t) => sum + t.principalUSD, 0);

  const debtSegments = [
    { value: shortDebt, color: 'var(--region-usa)', label: 'Short' },
    { value: medDebt, color: 'var(--region-eur)', label: 'Med' },
    { value: longDebt, color: 'var(--region-uk)', label: 'Long' },
  ];

  return (
    <div className="p-3 space-y-6 pb-20">
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

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Macroeconomic Fundamentals</h3>
        
        <WhyDrilldown
          headline="GDP Growth (Annualized)"
          value={formatPct(reg.gdpGrowth)}
          signal={getSignal(reg.gdpGrowth, prevReg?.gdpGrowth)}
          contributors={[
            { label: 'Consumption (C)', value: formatBln(reg.consumptionComponentUSD), signal: getMultiplierSignal(reg.consumptionComponentUSD, prevReg?.consumptionComponentUSD) },
            { label: 'Investment (I)', value: formatBln(reg.investmentComponentUSD), signal: getMultiplierSignal(reg.investmentComponentUSD, prevReg?.investmentComponentUSD) },
            { label: 'Gov Spending (G)', value: formatBln(reg.governmentSpendingUSD * 52), signal: getMultiplierSignal(reg.governmentSpendingUSD, prevReg?.governmentSpendingUSD) },
            { label: 'Net Exports (NX)', value: formatBln(nx), signal: getSignal(nx, prevNx) }
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
            { label: 'Private Sector', value: Math.round(privateEmployment).toLocaleString(), signal: getMultiplierSignal(privateEmployment, prevPrivateEmployment) },
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
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)]">
          {(Object.entries(reg.occupationPools) as [OccupationType, typeof reg.occupationPools[OccupationType]][]).map(([occType, pool]) => (
            <div key={occType} className="p-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-[var(--text-primary)] capitalize">{occType.replace('_', ' ').toLowerCase()}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">Wage Idx: {pool.wageIndex.toFixed(2)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-bold font-[var(--font-numeric)] ${pool.wageGrowthAnnual > 0 ? 'text-[var(--signal-positive)]' : pool.wageGrowthAnnual < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                  {formatPct(pool.wageGrowthAnnual)}
                </span>
                <div className="w-16 h-4 opacity-50">
                  <Sparkline data={reg.historicalWageGrowth?.length ? reg.historicalWageGrowth : [pool.wageGrowthAnnual]} color="var(--text-secondary)" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Supply Chain & Demand</h3>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)] overflow-hidden">
          {Object.entries(reg.categoryDemand).map(([cat, demand]) => (
            <div key={cat} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-[var(--text-primary)]">{cat}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {demand.clearedInputPriceIndex !== undefined ? `Cost Idx: ${demand.clearedInputPriceIndex.toFixed(2)} | Crowd: ${demand.crowdingIntensity.toFixed(2)}` : 'Services'}
                </div>
              </div>
              <span className={`text-xs font-bold font-[var(--font-numeric)] ${demand.demandGrowthAnnual > 0 ? 'text-[var(--signal-positive)]' : demand.demandGrowthAnnual < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                {formatPct(demand.demandGrowthAnnual)}
              </span>
            </div>
          ))}
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
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatPercent(reg.debtToGdpPctBottomUp || reg.debtToGdpPct, { precision: 1 })}</div>
            </div>
          </div>
          <div className="h-2">
            <SegmentedBar segments={debtSegments} height={8} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Banking & Money Supply</h3>
        <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
          <div className="flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Bank Capital Ratio</span>
            <span className="text-xs font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatPercent(reg.bankingSector.bankCapitalRatio, { precision: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">CB Reserves</span>
            <span className="text-xs font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatBln(reg.bankingSector.centralBankReservesUSD)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-secondary)]">M2 Money Supply</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold ${getSignal(reg.bankingSector.moneySupplyM2USD, prevReg?.bankingSector?.moneySupplyM2USD) === 'positive' ? 'text-[var(--signal-positive)]' : 'text-[var(--text-tertiary)]'}`}>
                {getSignal(reg.bankingSector.moneySupplyM2USD, prevReg?.bankingSector?.moneySupplyM2USD) === 'positive' ? 'Growing' : 'Flat/Shrinking'}
              </span>
              <span className="text-xs font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatBln(reg.bankingSector.moneySupplyM2USD)}</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">CB Stance</span>
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
                <div className="text-[10px] text-[var(--text-tertiary)]">Margin: {formatPercent(seg.marginPct, { precision: 1 })}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
