import React, { useMemo } from 'react';
import { GameState } from '../../types';
import { WhyDrilldown } from '../shared/WhyDrilldown';
import { formatCurrency, formatPercent } from '../../engine/formatters';

type Destination = 'briefing' | 'world' | 'market' | 'book';

interface BriefingItem {
  id: string;
  severity: number; // 0-10, higher is worse/more urgent
  category: 'URGENT' | 'MACRO' | 'MICRO' | 'M&A' | 'IPO';
  title: string;
  description: string;
  targetDest: Destination;
}

export const BriefingScreen: React.FC<{ state: GameState, prevState?: GameState | null, onNavigate: (dest: Destination) => void }> = ({ state, prevState, onNavigate }) => {
  const currentWeek = state.currentWeek;

  const items = useMemo(() => {
    const generated: BriefingItem[] = [];

    // M&A Events (this week)
    if (state.recentMergers) {
      const thisWeekMergers = state.recentMergers.filter(m => m.week === currentWeek);
      for (const m of thisWeekMergers) {
        generated.push({
          id: `ma-${m.acquirerTicker}-${m.targetTicker}`,
          severity: 6,
          category: 'M&A',
          title: `M&A: ${m.acquirerName} acquires ${m.targetName}`,
          description: `Consolidation in sector. Deal valued at ${formatCurrency(m.dealValueUSD, { compact: true })}.`,
          targetDest: 'market'
        });
      }
    }

    // IPOs
    if (state.recentIPOs) {
      const thisWeekIPOs = state.recentIPOs.filter(i => i.week === currentWeek);
      for (const ipo of thisWeekIPOs) {
        generated.push({
          id: `ipo-${ipo.ticker}`,
          severity: 4,
          category: 'IPO',
          title: `New Listing: ${ipo.name} (${ipo.ticker})`,
          description: `Began trading this week in ${ipo.category}.`,
          targetDest: 'market'
        });
      }
    }

    // Defaults
    const defaults = state.companies.filter(c => state.turnSummary?.defaultedCompanies?.includes(c.ticker));
    for (const c of defaults) {
      generated.push({
        id: `def-${c.ticker}`,
        severity: 10,
        category: 'URGENT',
        title: `DEFAULT: ${c.name} (${c.ticker})`,
        description: `Company has defaulted on obligations and halted trading.`,
        targetDest: 'market'
      });
    }

    // Company Distress
    const distressed = state.companies.filter(c => !c.isDefaulted && c.maintenanceShortfallStreak > 3);
    for (const c of distressed) {
      generated.push({
        id: `dist-${c.ticker}`,
        severity: 7,
        category: 'MICRO',
        title: `Distress Alert: ${c.name} (${c.ticker})`,
        description: `Maintenance capex shortfall streak reached ${c.maintenanceShortfallStreak} weeks. Operational quality degrading.`,
        targetDest: 'market'
      });
    }

    // Macro changes (need prevState)
    if (prevState) {
      for (const regId of Object.keys(state.regions) as (keyof typeof state.regions)[]) {
        const reg = state.regions[regId];
        const prevReg = prevState.regions[regId];

        // Sovereign Rating
        if (reg.sovereignRating !== prevReg.sovereignRating) {
          generated.push({
            id: `sov-${regId}`,
            severity: 9,
            category: 'URGENT',
            title: `Sovereign Rating Change: ${regId}`,
            description: `${regId} debt re-rated from ${prevReg.sovereignRating} to ${reg.sovereignRating}.`,
            targetDest: 'world'
          });
        }

        // Cycle Regime
        if (reg.cycleRegime !== prevReg.cycleRegime) {
          generated.push({
            id: `regime-${regId}`,
            severity: 8,
            category: 'MACRO',
            title: `Regime Shift: ${regId}`,
            description: `Economy transitioned from ${prevReg.cycleRegime} to ${reg.cycleRegime}.`,
            targetDest: 'world'
          });
        }

        // Occupation Pool Tightness
        for (const occId of Object.keys(reg.occupationPools) as (keyof typeof reg.occupationPools)[]) {
          const pool = reg.occupationPools[occId];
          const prevPool = prevReg.occupationPools[occId];
          if (pool.wageGrowthAnnual > 0.08 && prevPool.wageGrowthAnnual <= 0.08) {
            generated.push({
              id: `occ-${regId}-${occId}`,
              severity: 6,
              category: 'MACRO',
              title: `Labor Squeeze: ${regId} ${occId.replace('_', ' ')}`,
              description: `Wage growth spiked above 8% (${formatPercent(pool.wageGrowthAnnual)}). Severe labor shortage.`,
              targetDest: 'world'
            });
          }
        }

        // Category Crowding / Supply Chain
        for (const catId of Object.keys(reg.categoryDemand)) {
          const cat = reg.categoryDemand[catId];
          const prevCat = prevReg.categoryDemand[catId];
          if (cat.clearedInputPriceIndex && prevCat.clearedInputPriceIndex && (cat.clearedInputPriceIndex - prevCat.clearedInputPriceIndex) > 0.05) {
            generated.push({
              id: `supply-${regId}-${catId}`,
              severity: 5,
              category: 'MACRO',
              title: `Supply Chain Shock: ${regId} ${catId}`,
              description: `Input costs surged week-over-week. Scarcity detected.`,
              targetDest: 'world'
            });
          }
          if (cat.crowdingIntensity > 1.2 && prevCat.crowdingIntensity <= 1.2) {
             generated.push({
              id: `crowd-${regId}-${catId}`,
              severity: 5,
              category: 'MICRO',
              title: `Overcrowded Market: ${regId} ${catId}`,
              description: `Extreme competitive crowding detected. Margins likely to compress.`,
              targetDest: 'world'
            });
          }
        }
      }
    }

    // Weather / Anomalies
    const activeAnomalies = Object.values(state.regions).map(r => ({ r: r.id, w: r.weather })).filter(x => x.w && x.w.type !== 'Normal');
    for (const a of activeAnomalies) {
      generated.push({
        id: `wea-${a.r}`,
        severity: 8,
        category: 'URGENT',
        title: `Anomaly: ${a.w.title} (${a.r})`,
        description: `Severity: ${a.w.severity}. Expected GDP Impact: ${formatPercent(a.w.gdpImpactPct, { showSign: true })}.`,
        targetDest: 'world'
      });
    }

    return generated.sort((a, b) => b.severity - a.severity);
  }, [state, prevState, currentWeek]);

  return (
    <div className="p-3 space-y-6 pb-20">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Weekly Briefing</h2>
        <p className="text-xs text-[var(--text-tertiary)]">Week {currentWeek} • {state.year}</p>
      </div>

      <div className="space-y-3">
        {items.length > 0 ? (
          items.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.targetDest)}
              className="w-full text-left p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--text-tertiary)] transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  item.severity >= 8 ? 'bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]' :
                  item.severity >= 6 ? 'bg-[var(--signal-neutral)]/20 text-[var(--signal-neutral)]' :
                  'bg-[var(--bg-panel)] text-[var(--text-tertiary)]'
                }`}>
                  {item.category}
                </span>
                <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">{item.title}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
            </button>
          ))
        ) : (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)] border border-dashed border-[var(--border-hairline)] rounded-xl">
            No extraordinary events to report this week. Markets are operating normally.
          </div>
        )}
      </div>

      <div className="pt-4 space-y-2">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Quick Market Read</h3>
        <WhyDrilldown
          headline="Global Equities"
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
    </div>
  );
};
