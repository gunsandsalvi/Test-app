import React, { useState } from 'react';
import { GameState, ProductCategory } from '../types';
import { formatPercent } from '../engine/formatters';

interface CorporateIntelligenceTabProps {
  state: GameState;
}

export const CorporateIntelligenceTab: React.FC<CorporateIntelligenceTabProps> = ({ state }) => {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('StapleHousehold');

  const categories: ProductCategory[] = [
    'StapleHousehold', 'StandardHousehold', 'LuxuryHousehold',
    'GovernmentDefense', 'GovernmentInfrastructure', 'GovernmentHealthcare',
    'CorporateIndustrial', 'CorporateTech'
  ];

  const companiesInCategory = state.companies.filter(c => !c.isDefaulted && c.productLines?.some(l => l.category === selectedCategory));

  const sortedByCategoryShare = [...companiesInCategory].sort((a, b) => {
    const shareA = (a.productLines || []).find(l => l.category === selectedCategory)?.categoryMarketShare ?? 0;
    const shareB = (b.productLines || []).find(l => l.category === selectedCategory)?.categoryMarketShare ?? 0;
    return shareB - shareA;
  });

  const biggestSurprises = [...state.companies]
    .filter(c => !c.isDefaulted && c.lastEarningsSurprisePct !== undefined)
    .sort((a, b) => Math.abs(b.lastEarningsSurprisePct || 0) - Math.abs(a.lastEarningsSurprisePct || 0))
    .slice(0, 5);

  const recentUpgrades = [...state.companies]
    .filter(c => !c.isDefaulted && c.ratingHistory && c.ratingHistory.length >= 2 && c.ratingHistory[c.ratingHistory.length - 1] !== c.ratingHistory[c.ratingHistory.length - 2])
    .slice(0, 5);

  const biggestShareMovers = [...state.companies]
    .filter(c => !c.isDefaulted && c.productLines && c.productLines.length > 0)
    .sort((a, b) => {
      const aMaxShareMove = Math.max(...(a.productLines || []).map(l => Math.abs(l.categoryMarketShare - (l.previousCategoryMarketShare || l.categoryMarketShare))));
      const bMaxShareMove = Math.max(...(b.productLines || []).map(l => Math.abs(l.categoryMarketShare - (l.previousCategoryMarketShare || l.categoryMarketShare))));
      return bMaxShareMove - aMaxShareMove;
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4 text-white overflow-y-auto pb-20 no-scrollbar">
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-slate-950 p-2 rounded border border-slate-800">
          <span className="text-slate-500">Share-gaining</span>
          <div className="font-bold text-emerald-400">{formatPercent(state.compositeIndices.marketBreadth, { isDecimal: false })}</div>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800">
          <span className="text-slate-500">Global credit</span>
          <div className="font-bold">{state.compositeIndices.globalCreditComposite.value.toFixed(1)}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px]">
        {[
          { label: 'Tech', i: state.compositeIndices.techIndex },
          { label: 'Fin', i: state.compositeIndices.financialsIndex },
          { label: 'Energy', i: state.compositeIndices.energyIndex },
          { label: 'Ind', i: state.compositeIndices.industrialsIndex },
        ].map(s => (
          <div key={s.label} className="bg-slate-950 p-1.5 rounded border border-slate-800 text-center">
            <span className="text-slate-500 block">{s.label}</span>
            <span className="font-bold block">{s.i.value.toFixed(1)}</span>
            <span className={s.i.change1W >= 0 ? 'text-emerald-400 text-[8px]' : 'text-rose-400 text-[8px]'}>
              {s.i.change1W >= 0 ? '+' : ''}{s.i.change1W.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Category Leaderboards</h3>
        <div className="flex flex-wrap gap-1 mb-3">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${
                selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.replace('Household', ' HH').replace('Government', 'Gov ')}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {sortedByCategoryShare.slice(0, 10).map((c) => {
            const line = (c.productLines || []).find(l => l.category === selectedCategory)!;
            return (
              <div key={c.ticker} className="flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-lg text-[11px]">
                <span className="font-bold text-white">{c.ticker}</span>
                <div className="flex items-center gap-2">
                  <span>{(line.categoryMarketShare * 100).toFixed(1)}%</span>
                  <span className={line.competitiveness > 0 ? 'text-emerald-400' : 'text-rose-400'}>{line.competitiveness > 0 ? '▲' : '▼'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Market Movers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-bold mb-1">Top Earnings Surprises</h4>
            {biggestSurprises.map(c => (
              <div key={c.ticker} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850 text-[10px]">
                <span className="font-bold">{c.ticker}</span>
                <span className={(c.lastEarningsSurprisePct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {formatPercent(c.lastEarningsSurprisePct, { isDecimal: true })}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-bold mb-1">Recent Rating Migrations</h4>
            {recentUpgrades.map(c => (
              <div key={c.ticker} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850 text-[10px]">
                <span className="font-bold">{c.ticker}</span>
                <span className="text-amber-400">{c.ratingHistory[c.ratingHistory.length - 2]} → {c.creditRating}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-bold mb-1">Top Share Movers</h4>
            {biggestShareMovers.map(c => {
              const line = (c.productLines || []).reduce((max, l) => Math.abs(l.categoryMarketShare - (l.previousCategoryMarketShare || l.categoryMarketShare)) > Math.abs(max.categoryMarketShare - (max.previousCategoryMarketShare || max.categoryMarketShare)) ? l : max, (c.productLines || [])[0]);
              const move = line.categoryMarketShare - (line.previousCategoryMarketShare || line.categoryMarketShare);
              return (
                <div key={c.ticker} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850 text-[10px]">
                  <span className="font-bold">{c.ticker}</span>
                  <span className={move >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{move >= 0 ? '+' : ''}{(move * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">IPO Pipeline & Activity</h3>
        <div className="space-y-1">
          {(!state.recentIPOs || state.recentIPOs.length === 0) ? (
             <div className="text-[10px] text-slate-500 text-center py-2">No recent IPO activity.</div>
          ) : [...state.recentIPOs].reverse().map((ipo, idx) => (
            <div key={`${ipo.ticker}-${idx}`} className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-850 text-[11px]">
              <div className="flex gap-2 items-center">
                <span className="font-bold text-white">{ipo.ticker}</span>
                <span className="text-slate-400 text-[10px] truncate max-w-[150px]">{ipo.name}</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px]">{ipo.category.replace('Household', ' HH').replace('Government', 'Gov ')}</span>
                <span className="text-slate-500 text-[9px]">wk {ipo.week}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
