import React, { useState } from 'react';
import { GameState, RegionId, ProductCategory, INDUSTRY_SUBUNITS, Industry } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';

export const EconomyDashboard: React.FC<{ state: GameState }> = ({ state }) => {
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('USA');
  const regions: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const reg = state.regions[selectedRegion];

  // Aggregates across companies in selected region
  const regionCompanies = state.companies.filter(c => c.region === selectedRegion);
  const totalRev = regionCompanies.reduce((s, c) => s + c.annualRevenue, 0);
  const totalEbitda = regionCompanies.reduce((s, c) => s + c.ebitda, 0);
  const totalDebt = regionCompanies.reduce((s, c) => s + c.totalDebt, 0);
  const avgLeverage = regionCompanies.length > 0 ? totalDebt / Math.max(1, totalEbitda) : 0;

  const categories: ProductCategory[] = [
    'Energy', 'MaterialsChemicals', 'IndustrialsMachinery', 'AerospaceDefense',
    'AutomotiveTransport', 'TechHardwareSemis', 'SoftwareDigitalServices',
    'Telecommunications', 'HealthcarePharma', 'ConsumerStaples',
    'ConsumerDiscretionaryRetail', 'LuxuryGoods', 'MediaEntertainment',
    'RealEstateConstruction'
  ];

  const calcShares = (ao: any) => {
    const foreignSum = (Object.values(ao.foreignShare) as number[]).reduce((a, b) => a + b, 0);
    const cbShare = ao.centralBankShare || 0;
    const hhShare = Math.max(0, 1 - ao.bankShare - ao.institutionalShare - cbShare - foreignSum);
    return {
      bank: ao.bankShare * 100,
      inst: ao.institutionalShare * 100,
      cb: cbShare * 100,
      hh: hhShare * 100,
      foreign: foreignSum * 100
    };
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto pb-24">
      <div className="flex justify-between items-center pb-2 border-b border-[var(--border-hairline)]">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Global Economy Dashboard</h2>
          <p className="text-xs text-[var(--text-tertiary)]">Macroeconomic & Corporate Sector Aggregates</p>
        </div>
        <div className="flex space-x-1">
          {regions.map(r => (
            <button
              key={r}
              onClick={() => setSelectedRegion(r)}
              className={`px-3 py-1 text-xs font-bold rounded ${selectedRegion === r ? 'bg-[var(--region-usa)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Cross-Regional Comparison Card */}
      <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
        <div className="text-xs font-bold uppercase text-[var(--text-tertiary)]">Macro Overview Across Regions</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[var(--text-tertiary)]">
                <th className="py-1">Region</th>
                <th className="py-1 text-right">GDP Growth</th>
                <th className="py-1 text-right">Inflation</th>
                <th className="py-1 text-right">Policy Rate</th>
                <th className="py-1 text-right">Credit Index</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r => {
                const rData = state.regions[r];
                return (
                  <tr key={r} className={`border-b border-[var(--border-hairline)] ${r === selectedRegion ? 'bg-white/5' : ''}`}>
                    <td className="py-1.5 font-bold">{r}</td>
                    <td className="py-1.5 text-right font-[var(--font-numeric)]">{formatPercent(rData.gdpGrowth, { isDecimal: true })}</td>
                    <td className="py-1.5 text-right font-[var(--font-numeric)]">{formatPercent(rData.inflation, { isDecimal: true })}</td>
                    <td className="py-1.5 text-right font-[var(--font-numeric)]">{formatPercent(rData.policyRate, { isDecimal: true })}</td>
                    <td className="py-1.5 text-right font-[var(--font-numeric)]">{rData.bankingSector.creditConditionsIndex.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regional Corporate Sector Financial Aggregates */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Total Corporate Revenue (Annual)</div>
          <div className="text-base font-bold font-[var(--font-numeric)] mt-1">{formatCurrency(totalRev, { compact: true })}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Total EBITDA (Annual)</div>
          <div className="text-base font-bold font-[var(--font-numeric)] mt-1">{formatCurrency(totalEbitda, { compact: true })}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Total Debt</div>
          <div className="text-base font-bold font-[var(--font-numeric)] mt-1">{formatCurrency(totalDebt, { compact: true })}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Avg Leverage</div>
          <div className="text-base font-bold font-[var(--font-numeric)] mt-1">{avgLeverage.toFixed(2)}x</div>
        </div>
      </div>

      {/* Product Category Demand breakdown */}
      <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
        <div className="text-xs font-bold uppercase text-[var(--text-tertiary)]">{selectedRegion} Product Category Demand (Annual)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {categories.map(cat => {
            const subUnits = INDUSTRY_SUBUNITS[cat as Industry] || [];
            if (subUnits.length === 0) return null;
            const demandLevelUSD = subUnits.reduce((s, su) => s + (reg.categoryDemand[su.unitId]?.demandLevelUSD ?? 0), 0);
            const demandGrowthAnnual = subUnits.reduce((s, su) => s + (reg.categoryDemand[su.unitId]?.demandGrowthAnnual ?? 0), 0) / subUnits.length;
            const crowdingIntensity = subUnits.reduce((s, su) => s + (reg.categoryDemand[su.unitId]?.crowdingIntensity ?? 0), 0) / subUnits.length;

            return (
              <div key={cat} className="p-2 rounded bg-black/20 border border-[var(--border-hairline)] flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{cat.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">Growth: {formatPercent(demandGrowthAnnual, { isDecimal: true })}</div>
                </div>
                <div className="text-right">
                  <div className="font-[var(--font-numeric)] font-bold">{formatCurrency(demandLevelUSD, { compact: true })}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">Crowding: {crowdingIntensity.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ownership Shares Across Asset Classes */}
      <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
        <div className="text-xs font-bold uppercase text-[var(--text-tertiary)]">{selectedRegion} Asset Ownership Distribution</div>

        {/* Corporate Bonds */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-bold">Corporate Bonds</span>
            <span className="text-[var(--text-tertiary)] font-mono text-[10px]">Bank / Inst / CB / HH / Foreign</span>
          </div>
          {(() => {
            const sh = calcShares(reg.corpBondOwnership);
            return (
              <div className="h-3 rounded overflow-hidden flex bg-black/30">
                <div style={{ width: `${sh.bank}%` }} className="bg-blue-500" title="Bank" />
                <div style={{ width: `${sh.inst}%` }} className="bg-purple-500" title="Institutional" />
                <div style={{ width: `${sh.cb}%` }} className="bg-slate-400" title="Central Bank" />
                <div style={{ width: `${sh.hh}%` }} className="bg-emerald-500" title="Household" />
                <div style={{ width: `${sh.foreign}%` }} className="bg-amber-500" title="Foreign" />
              </div>
            );
          })()}
        </div>

        {/* Sovereign Bonds */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-bold">Sovereign Bonds</span>
            <span className="text-[var(--text-tertiary)] font-mono text-[10px]">Bank / Inst / CB / HH / Foreign</span>
          </div>
          {(() => {
            const sh = calcShares(reg.sovBondOwnership);
            return (
              <div className="h-3 rounded overflow-hidden flex bg-black/30">
                <div style={{ width: `${sh.bank}%` }} className="bg-blue-500" title="Bank" />
                <div style={{ width: `${sh.inst}%` }} className="bg-purple-500" title="Institutional" />
                <div style={{ width: `${sh.cb}%` }} className="bg-slate-400" title="Central Bank" />
                <div style={{ width: `${sh.hh}%` }} className="bg-emerald-500" title="Household" />
                <div style={{ width: `${sh.foreign}%` }} className="bg-amber-500" title="Foreign" />
              </div>
            );
          })()}
        </div>

        {/* Equities */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-bold">Equities</span>
            <span className="text-[var(--text-tertiary)] font-mono text-[10px]">Bank / Inst / CB / HH / Foreign</span>
          </div>
          {(() => {
            const sh = calcShares(reg.equityOwnership);
            return (
              <div className="h-3 rounded overflow-hidden flex bg-black/30">
                <div style={{ width: `${sh.bank}%` }} className="bg-blue-500" title="Bank" />
                <div style={{ width: `${sh.inst}%` }} className="bg-purple-500" title="Institutional" />
                <div style={{ width: `${sh.cb}%` }} className="bg-slate-400" title="Central Bank" />
                <div style={{ width: `${sh.hh}%` }} className="bg-emerald-500" title="Household" />
                <div style={{ width: `${sh.foreign}%` }} className="bg-amber-500" title="Foreign" />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
