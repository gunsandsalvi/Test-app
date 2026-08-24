import React from 'react';
import { GameState } from '../../types';
import { WhyDrilldown } from '../shared/WhyDrilldown';

export const BriefingScreen: React.FC<{ state: GameState, onNavigate: (dest: any) => void }> = ({ state, onNavigate }) => {
  const currentWeek = state.currentWeek;
  
  // Find interesting events for the briefing
  const activeAnomalies = Object.values(state.regions).map(r => r.weather).filter(w => w && w.type !== 'Normal');
  
  const defaults = state.companies.filter(c => state.turnSummary?.defaultedCompanies?.includes(c.ticker));
  
  // Recent IPOs
  const recentIPOs = state.recentIPOs?.filter(i => i.week >= currentWeek - 4) || [];

  return (
    <div className="p-3 space-y-6 pb-20">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Weekly Briefing</h2>
        <p className="text-xs text-[var(--text-tertiary)]">Week {currentWeek} • {state.year}</p>
      </div>

      <div className="space-y-4">
        {defaults.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--signal-negative)]/10 border border-[var(--signal-negative)]/30 space-y-2">
            <h3 className="text-[11px] font-bold text-[var(--signal-negative)] uppercase tracking-wider">Credit Events</h3>
            {defaults.map(c => (
              <div key={c.id} className="text-sm text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)]">{c.name} ({c.ticker})</span> has defaulted this week.
              </div>
            ))}
          </div>
        )}

        {recentIPOs.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
            <h3 className="text-[11px] font-bold text-[var(--region-usa)] uppercase tracking-wider">Recent IPOs</h3>
            {recentIPOs.map((ipo, i) => (
              <div key={i} className="text-sm text-[var(--text-secondary)] border-b border-[var(--border-hairline)] last:border-0 pb-2 last:pb-0">
                <span className="font-bold text-[var(--text-primary)]">{ipo.name} ({ipo.ticker})</span> debuted in week {ipo.week}.
              </div>
            ))}
          </div>
        )}

        {activeAnomalies.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
            <h3 className="text-[11px] font-bold text-[var(--signal-positive)] uppercase tracking-wider">Global Anomalies</h3>
            {activeAnomalies.map((w, i) => (
              <div key={i} className="text-sm text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)]">{w.region}</span>: {w.title} ({w.type} - {w.severity})
                <div className="text-xs mt-1 text-[var(--text-tertiary)]">Impact: {(w.gdpImpactPct * 100).toFixed(2)}% GDP</div>
              </div>
            ))}
          </div>
        )}

        {defaults.length === 0 && recentIPOs.length === 0 && activeAnomalies.length === 0 && (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)] border border-dashed border-[var(--border-hairline)] rounded-xl">
            No extraordinary events to report this week. Markets are operating normally.
          </div>
        )}
      </div>

      <div className="pt-4 space-y-2">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Quick Market Read</h3>
        <WhyDrilldown
          headline="Global Equities"
          value={state.compositeIndices?.us500?.value?.toFixed(2) || '0.00'}
          signal={(state.compositeIndices?.us500?.value || 0) > (state.compositeIndices?.us500?.historical[0] || 0) ? 'positive' : 'negative'}
          contributors={[
            { label: 'US 500', value: state.compositeIndices?.us500?.value?.toFixed(2) || '0', signal: 'neutral' },
            { label: 'EU Stoxx', value: state.compositeIndices?.euStoxx?.value?.toFixed(2) || '0', signal: 'neutral' },
            { label: 'UK 100', value: state.compositeIndices?.uk100?.value?.toFixed(2) || '0', signal: 'neutral' },
            { label: 'JP 225', value: state.compositeIndices?.jp225?.value?.toFixed(2) || '0', signal: 'neutral' }
          ]}
        />
      </div>
    </div>
  );
};
