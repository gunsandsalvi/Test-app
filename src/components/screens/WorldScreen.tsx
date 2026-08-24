import React, { useState } from 'react';
import { GameState, RegionId, OccupationType } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';
import { SegmentedBar } from '../charts/Charts';

type WorldTab = 'overview' | 'growth' | 'labor' | 'supplychain' | 'fiscal' | 'banking' | 'private';

const WORLD_TAB_LABELS: Record<WorldTab, string> = {
  overview: 'Overview',
  growth: 'Growth & Cycle',
  labor: 'Labor Market',
  supplychain: 'Supply Chain',
  fiscal: 'Fiscal & Sovereign',
  banking: 'Banking Sector',
  private: 'Private Sector',
};

const OCCUPATION_SHORT_LABEL: Record<string, string> = {
  GENERAL: 'General Labor',
  SKILLED_TRADES: 'Skilled Trades',
  TECHNICAL_ENGINEERING: 'Tech & Eng',
  SPECIALIZED_PROFESSIONAL: 'Specialized Prof',
  MANAGERIAL_FINANCIAL: 'Managerial & Fin',
};

export const WorldScreen: React.FC<{ state: GameState, prevState?: GameState | null, onNavigate?: (dest: any, payload?: any) => void }> = ({ state, prevState, onNavigate }) => {
  const [activeRegion, setActiveRegion] = useState<RegionId>('USA');
  const [worldTab, setWorldTab] = useState<WorldTab>('overview');
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const reg = state.regions[activeRegion];
  const prevReg = prevState?.regions[activeRegion];

  const generateRegionStatus = (r: typeof reg): string => {
    const parts: string[] = [];
    if (r.cycleRegime === 'Recession' || r.cycleRegime === 'Slowdown') parts.push(`${r.cycleRegime} with unemployment at ${(r.unemploymentRate * 100).toFixed(1)}%`);
    else parts.push(`${r.cycleRegime}, GDP growing at ${(r.gdpGrowth * 100).toFixed(1)}%`);
    if (r.inflation > r.targetInflation * 1.3) parts.push('inflation running hot');
    if (r.bankingSector.creditConditionsIndex > 0.5) parts.push('credit conditions tight');
    return parts.join(' · ');
  };

  const c = reg.consumptionComponentUSD;
  const i = reg.investmentComponentUSD;
  const g = reg.governmentSpendingUSD * 52;
  const nx = reg.exportsUSD - reg.importsUSD;

  return (
    <div className="p-3 space-y-4 pb-20">
      {/* Persistent Region Selector & Status Line */}
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

      {/* World Tab Bar */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-[var(--border-hairline)] pb-1">
        {(['overview', 'growth', 'labor', 'supplychain', 'fiscal', 'banking', 'private'] as WorldTab[]).map(t => (
          <button
            key={t}
            onClick={() => setWorldTab(t)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase whitespace-nowrap transition-colors ${worldTab === t ? 'text-[var(--text-primary)] border-b-2 border-[var(--region-usa)]' : 'text-[var(--text-tertiary)]'}`}
          >
            {WORLD_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="space-y-3">
        {worldTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'GDP Growth', value: formatPercent(reg.gdpGrowth, { isDecimal: true, precision: 2, showSign: true }), signal: reg.gdpGrowth >= 0 ? 'positive' : 'negative' },
                { label: 'Inflation', value: formatPercent(reg.inflation, { isDecimal: true, precision: 2 }), signal: reg.inflation <= reg.targetInflation * 1.2 ? 'positive' : 'negative' },
                { label: 'Unemployment', value: formatPercent(reg.unemploymentRate, { isDecimal: true, precision: 2 }), signal: reg.unemploymentRate <= 0.06 ? 'positive' : 'negative' },
                { label: 'PMI Composite', value: state.compositeIndices?.pmiComposite?.headline?.toFixed(1) ?? '—', signal: (state.compositeIndices?.pmiComposite?.headline ?? 50) >= 50 ? 'positive' : 'negative' },
              ].map(tile => (
                <div key={tile.label} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                  <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">{tile.label}</div>
                  <div className={`text-lg font-bold font-[var(--font-numeric)] ${tile.signal === 'positive' ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                    {tile.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-1">
              <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">Cycle Regime & Policy</div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-[var(--text-primary)]">{reg.cycleRegime}</span>
                <span className="text-xs font-mono font-bold text-[var(--region-usa)]">Policy Rate: {formatPercent(reg.policyRate, { isDecimal: true })}</span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)]">
                Target Inflation: {formatPercent(reg.targetInflation, { isDecimal: true })} · Neutral Rate (r*): {formatPercent(reg.neutralRate, { isDecimal: true })}
              </div>
            </div>
          </>
        )}

        {worldTab === 'growth' && (
          <>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mb-1">GDP Component Breakdown (Annualized)</div>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2.5">
              {[
                { name: 'Consumption (C)', val: c, color: 'bg-blue-500', note: 'Household spending' },
                { name: 'Investment (I)', val: i, color: 'bg-emerald-500', note: 'Business & housing CapEx' },
                { name: 'Government (G)', val: g, color: 'bg-amber-500', note: 'Annualized public expenditure' },
                { name: 'Net Exports (NX)', val: nx, color: nx >= 0 ? 'bg-emerald-500' : 'bg-red-500', note: nx >= 0 ? 'Trade Surplus' : 'Trade Deficit' },
              ].map(comp => {
                const maxMag = Math.max(1, Math.abs(c), Math.abs(i), Math.abs(g), Math.abs(nx));
                const widthPct = Math.min(100, (Math.abs(comp.val) / maxMag) * 100);
                return (
                  <div key={comp.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--text-primary)]">{comp.name}</span>
                      <span className={`font-mono ${comp.val < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-primary)]'}`}>
                        {formatCurrency(comp.val, { compact: true, showSign: true })}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-panel)] overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${comp.color}`} style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="text-[9px] text-[var(--text-tertiary)]">{comp.note}</div>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mt-4 mb-1">PMI Subcomponents & Trends</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Demand', v: state.compositeIndices?.pmiComposite?.demandComponent, prevV: prevState?.compositeIndices?.pmiComposite?.demandComponent },
                { label: 'CapEx', v: state.compositeIndices?.pmiComposite?.capexComponent, prevV: prevState?.compositeIndices?.pmiComposite?.capexComponent },
                { label: 'Employment', v: state.compositeIndices?.pmiComposite?.employmentComponent, prevV: prevState?.compositeIndices?.pmiComposite?.employmentComponent },
              ].map(comp => {
                const diff = comp.prevV !== undefined && comp.v !== undefined ? comp.v - comp.prevV : 0;
                return (
                  <div key={comp.label} className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-center space-y-0.5">
                    <div className="text-[9px] text-[var(--text-tertiary)]">{comp.label}</div>
                    <div className={`text-sm font-bold font-[var(--font-numeric)] ${(comp.v ?? 50) >= 50 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                      {(comp.v ?? 0).toFixed(1)}
                    </div>
                    {diff !== 0 && (
                      <div className={`text-[9px] font-bold ${diff > 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                        {diff > 0 ? '▲ +' : '▼ '}{diff.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[9px] text-[var(--text-tertiary)] text-center mt-1">50 = neutral · above expansion, below contraction</div>
          </>
        )}

        {worldTab === 'labor' && (
          <>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mb-1">Wage Growth Leaderboard by Occupation</div>
            <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-hairline)] space-y-3">
              <div className="space-y-2">
                {(Object.entries(reg.occupationPools) as [OccupationType, any][]).map(([occ, pool]) => {
                  const widthPct = Math.max(5, Math.min(100, ((pool.wageGrowthAnnual + 0.02) / 0.18) * 100));
                  return (
                    <div key={occ} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-[var(--text-primary)]">{OCCUPATION_SHORT_LABEL[occ] ?? occ}</span>
                        <span className={`font-mono font-bold ${pool.wageGrowthAnnual > 0.05 ? 'text-[var(--signal-positive)]' : pool.wageGrowthAnnual < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-secondary)]'}`}>
                          {formatPercent(pool.wageGrowthAnnual, { isDecimal: true, showSign: true })}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-panel)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: pool.wageGrowthAnnual > 0.06 ? 'var(--signal-positive)' : pool.wageGrowthAnnual < 0 ? 'var(--signal-negative)' : 'var(--signal-neutral)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1">
                <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                  <span>Unemployment: <span className="font-bold text-[var(--text-primary)]">{formatPercent(reg.unemploymentRate, { isDecimal: true })}</span></span>
                  <span>Participation: <span className="font-bold text-[var(--text-primary)]">{formatPercent(reg.laborForceParticipation, { isDecimal: true })}</span></span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] italic">
                  {reg.unemploymentRate > 0.06
                    ? 'Slack building in general labor; wage growth decelerating.'
                    : 'Labor market tight; specialized roles commanding wage premiums.'}
                </div>
              </div>
            </div>
          </>
        )}

        {worldTab === 'supplychain' && (
          <>
            {[
              { title: 'Household Categories', items: ['StandardHousehold', 'LuxuryHousehold'] },
              { title: 'Corporate Categories', items: ['CorporateTech', 'CorporateIndustrial'] },
              { title: 'Government Categories', items: ['GovernmentDefense', 'Infrastructure', 'Healthcare'], isGov: true },
            ].map(group => (
              <div key={group.title} className="space-y-1.5">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mt-2">{group.title}</div>
                {group.items.map(catKey => {
                  const demand = reg.categoryDemand[catKey as keyof typeof reg.categoryDemand];
                  if (!demand) return null;
                  const hasLinkage = ['CorporateTech', 'StandardHousehold', 'LuxuryHousehold', 'CorporateIndustrial'].includes(catKey);
                  const inputPrice = demand.clearedInputPriceIndex ?? 1.0;

                  return (
                    <div key={catKey} className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{catKey}</span>
                        <span className={demand.demandGrowthAnnual >= 0 ? 'text-[var(--signal-positive)] text-xs font-bold' : 'text-[var(--signal-negative)] text-xs font-bold'}>
                          {formatPercent(demand.demandGrowthAnnual, { isDecimal: true, showSign: true })} YoY
                        </span>
                      </div>
                      {hasLinkage ? (
                        <div>
                          <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mb-0.5 font-mono">
                            <span>Input Cost Index</span>
                            <span className={inputPrice > 1.05 ? 'text-[var(--signal-negative)] font-bold' : inputPrice < 0.95 ? 'text-[var(--signal-positive)] font-bold' : ''}>
                              {inputPrice.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--bg-panel)] relative overflow-hidden">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-tertiary)]" />
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${Math.min(50, Math.abs(inputPrice - 1.0) * 100)}%`,
                              marginLeft: inputPrice >= 1.0 ? '50%' : `${50 - Math.min(50, Math.abs(inputPrice - 1.0) * 100)}%`,
                              backgroundColor: inputPrice > 1.0 ? 'var(--signal-negative)' : 'var(--signal-positive)',
                            }} />
                          </div>
                        </div>
                      ) : (
                        <div className="text-[9px] text-[var(--text-tertiary)] italic">
                          {group.isGov ? 'Demand moves directly with fiscal policy stance' : 'No supply-chain input linkage'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {worldTab === 'fiscal' && (
          <>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Sovereign Budget Operations (Annualized)</div>
              <div className="flex h-6 rounded overflow-hidden">
                <div style={{ width: `${Math.min(100, ((reg.governmentRevenueUSD * 52) / Math.max(1, reg.governmentSpendingUSD * 52)) * 100)}%` }} className="bg-[var(--signal-positive)] flex items-center justify-center text-[9px] font-bold text-white">
                  Revenue ({formatCurrency(reg.governmentRevenueUSD * 52, { compact: true })})
                </div>
                <div style={{ width: `${Math.max(0, 100 - ((reg.governmentRevenueUSD * 52) / Math.max(1, reg.governmentSpendingUSD * 52)) * 100)}%` }} className="bg-[var(--signal-negative)] flex items-center justify-center text-[9px] font-bold text-white">
                  Deficit
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                <span>Spending: {formatCurrency(reg.governmentSpendingUSD * 52, { compact: true })}/yr</span>
                <span>Debt/GDP Ratio: {formatPercent(reg.debtToGdpPct, { isDecimal: true })}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Sovereign Debt Maturity Ladder</div>
              {reg.govDebtTranches && reg.govDebtTranches.length > 0 ? (
                <>
                  <SegmentedBar
                    segments={[...reg.govDebtTranches]
                      .sort((a, b) => a.maturityWeek - b.maturityWeek)
                      .map((t, i) => ({
                        value: t.principalUSD,
                        label: `${t.tenorAtIssuanceYears}Y (${formatCurrency(t.principalUSD, { compact: true })})`,
                        color: `hsl(${210 + i * 25}, 70%, 50%)`
                      }))
                    }
                    total={reg.govDebtTranches.reduce((sum, t) => sum + t.principalUSD, 0)}
                    formatValue={val => formatCurrency(val, { compact: true })}
                  />
                  <div className="grid grid-cols-2 gap-1.5 pt-2">
                    {reg.govDebtTranches.map(t => (
                      <div key={t.id} className="p-2 rounded bg-[var(--bg-panel)] text-[10px] font-mono flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t.tenorAtIssuanceYears}Y Bond</span>
                        <span className="font-bold">{formatCurrency(t.principalUSD, { compact: true })}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[var(--text-tertiary)]">No sovereign debt tranches active.</div>
              )}
            </div>
          </>
        )}

        {worldTab === 'banking' && (
          <>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Bank Capital Ratio vs Floor</div>
              <div className="relative h-3 rounded-full bg-[var(--bg-panel)] overflow-hidden">
                <div className="absolute inset-y-0 rounded-full bg-[var(--region-usa)] transition-all" style={{ width: `${Math.min(100, reg.bankingSector.bankCapitalRatio * 400)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[var(--signal-negative)] z-10" style={{ left: `${0.08 * 400}%` }} title="8% Floor" />
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-mono flex justify-between">
                <span>Capital Ratio: <span className="font-bold text-[var(--text-primary)]">{formatPercent(reg.bankingSector.bankCapitalRatio, { isDecimal: true })}</span></span>
                <span className="text-[var(--signal-negative)]">Red line = 8% floor</span>
              </div>

              <div className="text-[10px] text-[var(--text-secondary)] italic p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-hairline)]">
                {reg.bankingSector.loanLossProvisionRateAnnualPct > 0.02
                  ? 'Capital ratio pressured by rising loan loss provisions.'
                  : reg.bankingSector.creditConditionsIndex > 0.5
                  ? 'Credit conditions tightening; loan originations moderating.'
                  : 'Banking sector capital buffers healthy with stable credit conditions.'}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[var(--border-hairline)]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Credit Conditions</span>
                  <span className="font-bold font-mono">{reg.bankingSector.creditConditionsIndex.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Net Int Margin</span>
                  <span className="font-bold font-mono">{formatPercent(reg.bankingSector.netInterestMarginPct, { isDecimal: true })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Loan Loss Prov</span>
                  <span className="font-bold font-mono">{formatPercent(reg.bankingSector.loanLossProvisionRateAnnualPct, { isDecimal: true })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Deposits</span>
                  <span className="font-bold font-mono">{formatCurrency(reg.bankingSector.depositsUSD, { compact: true })}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {worldTab === 'private' && (
          <>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Private Sector Segments (Revenue × Margin × Employment)</div>
              
              <div className="relative w-full aspect-[3/2] bg-[var(--bg-panel)] rounded-lg p-3 flex flex-col justify-between">
                <svg viewBox="0 0 300 180" className="w-full h-full overflow-visible">
                  {/* Grid Lines & Axis Ticks */}
                  <line x1="30" y1="150" x2="280" y2="150" stroke="var(--border-hairline)" strokeWidth="1" />
                  <line x1="30" y1="10" x2="30" y2="150" stroke="var(--border-hairline)" strokeWidth="1" />
                  
                  {/* X-axis Ticks (Margin) */}
                  <text x="30" y="162" fontSize="6" fill="var(--text-tertiary)" textAnchor="middle">0%</text>
                  <text x="155" y="162" fontSize="6" fill="var(--text-tertiary)" textAnchor="middle">10%</text>
                  <text x="280" y="162" fontSize="6" fill="var(--text-tertiary)" textAnchor="middle">20%+</text>

                  {/* Bubbles */}
                  {(() => {
                    const maxSegRevenue = Math.max(...reg.privateSectorSegments.map(s => s.annualRevenueUSD), 1);
                    return reg.privateSectorSegments.map((seg, i) => {
                      const x = 30 + Math.min(250, seg.marginPct * 1250);
                      const y = 150 - Math.min(130, (seg.annualRevenueUSD / maxSegRevenue) * 130);
                      const r = Math.max(10, Math.min(26, Math.sqrt(seg.employment) / 100));
                      const isSel = selectedSegment === seg.segmentType;

                      return (
                        <g key={seg.segmentType} onClick={() => setSelectedSegment(isSel ? null : seg.segmentType)} className="cursor-pointer">
                          <circle
                            cx={x}
                            cy={y}
                            r={r}
                            fill={`hsl(${i * 65 + 180}, 65%, 55%)`}
                            opacity={isSel ? 1 : 0.75}
                            stroke={isSel ? 'white' : 'var(--border-hairline)'}
                            strokeWidth={isSel ? 2 : 1}
                          />
                          <text x={x} y={y + 3} fontSize="7" textAnchor="middle" fill="white" fontWeight="bold">
                            {seg.segmentType.substring(0, 4)}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>
              </div>

              {/* Segment Legend & Detail Card */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {reg.privateSectorSegments.map((seg, i) => (
                  <button
                    key={seg.segmentType}
                    onClick={() => setSelectedSegment(selectedSegment === seg.segmentType ? null : seg.segmentType)}
                    className={`p-2 rounded-lg border text-left transition-colors ${selectedSegment === seg.segmentType ? 'bg-[var(--bg-panel)] border-[var(--text-primary)]' : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)]'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${i * 65 + 180}, 65%, 55%)` }} />
                      <span className="text-xs font-bold text-[var(--text-primary)]">{seg.segmentType}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1 font-mono">
                      Margin: {formatPercent(seg.marginPct, { isDecimal: true })} · Rev: {formatCurrency(seg.annualRevenueUSD, { compact: true })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
