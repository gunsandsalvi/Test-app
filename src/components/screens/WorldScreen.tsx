import React, { useState } from 'react';
import { GameState, RegionId } from '../../types';
import { WhyDrilldown } from '../shared/WhyDrilldown';

export const WorldScreen: React.FC<{ state: GameState }> = ({ state }) => {
  const [activeRegion, setActiveRegion] = useState<RegionId>('USA');
  const reg = state.regions[activeRegion];

  // GDP Contributors
  const gdp = reg.derivedNominalGdpUSD || reg.estimatedNominalGdpUSD;
  const c = reg.consumptionComponentUSD || (gdp * 0.68);
  const i = reg.investmentComponentUSD || (gdp * 0.17);
  const g = reg.governmentSpendingUSD || (gdp * 0.18);
  const nx = reg.tradeBalance || (gdp * -0.03);

  const formatPct = (val: number) => (val * 100).toFixed(1) + '%';
  const formatBln = (val: number) => '$' + (val / 1000).toFixed(1) + 'B';
  const getSignal = (val: number): 'positive' | 'negative' | 'neutral' => val > 0.005 ? 'positive' : val < -0.005 ? 'negative' : 'neutral';

  return (
    <div className="p-3 space-y-4 pb-20">
      <div className="flex items-center gap-2">
        {(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(r => (
          <button
            key={r}
            onClick={() => setActiveRegion(r)}
            className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${activeRegion === r ? 'text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            style={{ backgroundColor: activeRegion === r ? `var(--region-${r.toLowerCase()})` : 'var(--bg-elevated)' }}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <WhyDrilldown
          headline="GDP Growth (Annualized)"
          value={formatPct(reg.gdpGrowth)}
          signal={getSignal(reg.gdpGrowth)}
          contributors={[
            { label: 'Consumption (C)', value: formatBln(c), signal: 'positive' },
            { label: 'Investment (I)', value: formatBln(i), signal: 'positive' },
            { label: 'Gov Spending (G)', value: formatBln(g), signal: 'neutral' },
            { label: 'Net Exports (NX)', value: formatBln(nx), signal: nx > 0 ? 'positive' : 'negative' }
          ]}
        />

        <WhyDrilldown
          headline="Inflation (CPI YoY)"
          value={formatPct(reg.inflation)}
          signal={reg.inflation > reg.targetInflation * 1.5 ? 'negative' : 'neutral'}
          contributors={[
            { label: 'Wage-Price Factor', value: formatPct(reg.wageGrowth), signal: reg.wageGrowth > 0.04 ? 'positive' : 'neutral' },
            { label: 'Monetary Factor', value: formatPct(reg.policyRate), signal: 'neutral' }
          ]}
        />

        <WhyDrilldown
          headline="Unemployment Rate"
          value={formatPct(reg.unemploymentRate)}
          signal={reg.unemploymentRate > 0.06 ? 'negative' : 'neutral'}
          contributors={[
            { label: 'Private Sector', value: `${(reg.privateSectorSegments.reduce((s, seg) => s + seg.employment, 0) / 1000).toFixed(1)}k`, signal: 'positive' },
            { label: 'Government', value: `${(reg.governmentEmployment / 1000).toFixed(1)}k`, signal: 'neutral' },
            { label: 'Public Companies', value: `${(state.companies.filter(c => c.region === activeRegion).reduce((s, comp) => s + (comp.employeeCount ?? 0), 0) / 1000).toFixed(1)}k`, signal: 'positive' }
          ]}
        />
        
        <WhyDrilldown
          headline="Government Deficit"
          value={formatPct(reg.fiscalDeficitPctGdp)}
          signal={reg.fiscalDeficitPctGdp > 0.05 ? 'negative' : 'neutral'}
          contributors={[
            { label: 'Spending', value: formatBln(reg.governmentSpendingUSD), signal: 'neutral' },
            { label: 'Revenue', value: formatBln(reg.governmentRevenueUSD), signal: 'positive' },
            { label: 'Debt to GDP', value: formatPct(reg.debtToGdpPct), signal: 'negative' }
          ]}
        />
      </div>
    </div>
  );
};
