import React, { useState, useMemo } from 'react';
import { CreditConditionsMeter } from './charts/Charts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Filter,
  Layers,
  Percent,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { Company, CreditRating, GameState, RegionId, TradeableInstrument } from '../types';

interface BondsCdsTabProps {
  state: GameState;
  onOpenTrade: (instrument: TradeableInstrument) => void;
  onSelectCompany: (company: Company) => void;
  onOpenChart?: (chartData: any) => void;
}

export const BondsCdsTab: React.FC<BondsCdsTabProps> = ({
  state,
  onOpenTrade,
  onSelectCompany,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRating, setSelectedRating] = useState<CreditRating | 'ALL'>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<RegionId | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'CDS' | 'CASH_DEBT'>('CASH_DEBT');

  const filteredCompanies = useMemo(() => {
    return state.companies
      .filter((c) => {
        if (selectedRegion !== 'ALL' && c.region !== selectedRegion) return false;
        if (selectedRating !== 'ALL' && c.creditRating !== selectedRating) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (false /* Removed LEVERAGED_LOANS */) {
          return b.leveragedLoan.quotedMarginBps - a.leveragedLoan.quotedMarginBps;
        }
        return b.cdsSpreadBps - a.cdsSpreadBps;
      });
  }, [state.companies, selectedRating, selectedRegion, searchQuery, viewMode]);

  const getRatingBadgeColor = (rating: CreditRating) => {
    switch (rating) {
      case 'AAA':
      case 'AA':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'A':
      case 'BBB':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'BB':
      case 'B':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'CCC':
      case 'D':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
  };

  return (
    <div className="space-y-3 pb-20">
      {/* View Mode Toggle: Single-Name CDS vs Corporate Bonds vs Leveraged Loans */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-bold text-center">
        <button
          onClick={() => setViewMode('CDS')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CDS'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>CDS Swaps</span>
        </button>
        <button
          onClick={() => setViewMode('CASH_DEBT')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CASH_DEBT'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Cash Debt</span>
        </button>
      </div>

      {/* Search & Rating Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search issuer credit rating or ticker..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Rating Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
          <span className="text-[9px] text-slate-500 font-semibold uppercase shrink-0">Rating:</span>
          {(['ALL', 'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'] as (CreditRating | 'ALL')[]).map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRating(r)}
              className={`px-2 py-0.5 rounded-md font-semibold shrink-0 transition-colors ${
                selectedRating === r
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Credit Market Overview & Conditions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Corporate Credit Conditions</h3>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>{filteredCompanies.length} Credit Names</span>
            <span>Avg Rec: 40%</span>
          </div>
        </div>
        <CreditConditionsMeter index={(selectedRegion === 'ALL' ? undefined : state.regions[selectedRegion])?.bankingSector?.creditConditionsIndex || 0} width={120} />
      </div>

      {/* List of Credit Names */}
      <div className="space-y-2">
        {filteredCompanies.map((comp) => {

          const reg = state.regions[comp.region];
          const hazardRate = comp.isDefaulted ? 1.0 : (comp.oasSpreadBps / 10000) / (1 - comp.recoveryRate);
          return (
            <div
              key={comp.id}
              className={`bg-slate-900 border rounded-xl p-3 transition-all ${
                comp.isDefaulted
                  ? 'border-rose-500/60 bg-rose-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div onClick={() => onSelectCompany(comp)} className="cursor-pointer flex-1 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold font-mono text-sm text-white">{comp.ticker}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRatingBadgeColor(
                        comp.creditRating
                      )}`}
                    >
                      {comp.creditRating}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                      {comp.region}
                    </span>
                    <span className="text-[9px] text-slate-400">{comp.sector}</span>
                  </div>
                  <h4 className="text-xs text-slate-300 mt-0.5 truncate max-w-[210px]">{comp.name}</h4>
                </div>
                <div className="text-right">
                  {viewMode === 'CDS' && (
                    <>
                      <div className="text-sm font-extrabold font-mono text-purple-300">
                        {comp.isDefaulted ? 'DEFAULT' : `${comp.cdsSpreadBps} bps`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">5Y CDS Spread</div>
                    </>
                  )}
                  {viewMode === 'CASH_DEBT' && (
                    <>
                      <div className="text-sm font-extrabold font-mono text-indigo-300">
                        {comp.isDefaulted ? 'DEFAULT' : `${comp.oasSpreadBps} bps`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">Current OAS</div>
                    </>
                  )}
                </div>
              </div>

              {/* Credit Risk Metrics */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3 font-mono text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[8px]">OAS SPREAD</span>
                    <span className="text-slate-200 font-semibold">{comp.oasSpreadBps} bps</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">LEVERAGE</span>
                    <span className="text-slate-200 font-semibold">{comp.leverage.toFixed(1)}x</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">COVERAGE</span>
                    <span className={`font-semibold ${comp.interestCoverage < 1.5 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {comp.interestCoverage.toFixed(1)}x
                    </span>
                  </div>
                </div>
                {/* Trade Action Buttons */}
                <div className="flex items-center gap-1.5">
                  {viewMode === 'CDS' && (
                    <button
                      id={`btn-trade-cds-${comp.ticker}`}
                      onClick={() =>
                        onOpenTrade({
                          assetType: 'CDS',
                          id: `${comp.id}_CDS`,
                          symbol: comp.ticker,
                          name: `${comp.name} 5Y CDS`,
                          region: comp.region,
                          price: comp.cdsSpreadBps,
                          quoteUnit: 'bps',
                          details: {
                            tenorYears: 5,
                            cdsSpreadBps: comp.cdsSpreadBps,
                            oasSpreadBps: comp.oasSpreadBps,
                            rating: comp.creditRating,
                          },
                        })
                      }
                      disabled={comp.isDefaulted}
                      className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-[10px] font-bold shadow-sm transition-all disabled:opacity-40"
                    >
                      Trade CDS
                    </button>
                  )}
                </div>
              </div>

              {/* CASH DEBT TRANCHES */}
              {viewMode === 'CASH_DEBT' && (
                <div className="mt-3 space-y-1.5">
                  {comp.debtTranches?.map((tranche) => {
                    const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - state.currentWeek) / 52);
                    const isFixed = tranche.rateType === 'FIXED';
                    const rateDesc = isFixed 
                      ? `${((tranche.couponRate ?? 0) * 100).toFixed(1)}% Fixed`
                      : `Floating +${tranche.floatingMarginBps}bps`;
                    
                    return (
                      <div key={tranche.id} className="flex items-center justify-between bg-slate-800/50 p-2 rounded text-[10px] border border-slate-700/50">
                        <div className="font-mono text-slate-300 flex-1">
                          {comp.ticker} {remainingTenorYears.toFixed(1)}Y {rateDesc} <span className="text-slate-500 text-[9px]">(due wk {tranche.maturityWeek})</span>
                        </div>
                        <button
                          onClick={() => {
                            const assetType = isFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN';
                            onOpenTrade({
                              assetType,
                              id: tranche.id,
                              symbol: tranche.id,
                              name: `${comp.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
                              region: comp.region,
                              price: comp.isDefaulted ? (isFixed ? comp.recoveryRate * 100 : 65.0) : 100, // Roughly 100 before pricing
                              quoteUnit: isFixed ? '% Par' : 'pts of par',
                              details: {
                                trancheId: tranche.id,
                                tenorYears: remainingTenorYears,
                                fixedRate: tranche.couponRate ?? 0,
                                rateType: tranche.rateType,
                                oasSpreadBps: comp.oasSpreadBps,
                                rating: comp.creditRating,
                                sector: comp.sector
                              },
                            });
                          }}
                          disabled={comp.isDefaulted}
                          className={`px-2 py-1 rounded text-white font-bold shadow-sm transition-all disabled:opacity-40 ${isFixed ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                        >
                          Trade {isFixed ? 'Bond' : 'Loan'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
