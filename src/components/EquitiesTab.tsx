import { formatCurrency } from '../engine/formatters';
import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Filter,
  Layers,
  Search,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { Company, CreditRating, GameState, RegionId, Sector, TradeableInstrument } from '../types';

interface EquitiesTabProps {
  state: GameState;
  onOpenTrade: (instrument: TradeableInstrument) => void;
  onSelectCompany: (company: Company) => void;
  onOpenChart?: (chartData: any) => void;
}

export const EquitiesTab: React.FC<EquitiesTabProps> = ({
  state,
  onOpenTrade,
  onSelectCompany,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionId | 'ALL'>('ALL');
  const [selectedSector, setSelectedSector] = useState<Sector | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'mcap' | 'price' | 'change' | 'leverage' | 'pe'>('mcap');

  const filteredCompanies = useMemo(() => {
    return state.companies
      .filter((c) => {
        if (selectedRegion !== 'ALL' && c.region !== selectedRegion) return false;
        if (selectedSector !== 'ALL' && c.sector !== selectedSector) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isDefaulted && !b.isDefaulted) return 1;
        if (!a.isDefaulted && b.isDefaulted) return -1;

        if (sortBy === 'mcap') return b.marketCap - a.marketCap;
        if (sortBy === 'price') return b.stockPrice - a.stockPrice;
        if (sortBy === 'leverage') return b.leverage - a.leverage;
        if (sortBy === 'pe') return a.forwardPE - b.forwardPE;
        if (sortBy === 'change') {
          const aChg = a.historicalPrices.length >= 2
            ? (a.stockPrice - a.historicalPrices[a.historicalPrices.length - 2]) / (a.historicalPrices[a.historicalPrices.length - 2] || 1)
            : 0;
          const bChg = b.historicalPrices.length >= 2
            ? (b.stockPrice - b.historicalPrices[b.historicalPrices.length - 2]) / (b.historicalPrices[b.historicalPrices.length - 2] || 1)
            : 0;
          return bChg - aChg;
        }
        return 0;
      });
  }, [state.companies, selectedRegion, selectedSector, searchQuery, sortBy]);

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
      {/* Search & Filter Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search 200 listed tickers or names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Region & Sector Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
          <span className="text-[10px] text-slate-500 font-semibold uppercase shrink-0">Region:</span>
          {(['ALL', 'USA', 'UK', 'EUR', 'JPN'] as (RegionId | 'ALL')[]).map((reg) => (
            <button
              key={reg}
              onClick={() => setSelectedRegion(reg)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 transition-colors ${
                selectedRegion === reg
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Sector:</span>
            {(['ALL', 'Tech', 'Energy', 'Financials', 'Industrials', 'Consumer'] as (Sector | 'ALL')[]).map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-semibold shrink-0 transition-colors ${
                  selectedSector === sec
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-500 font-semibold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] text-slate-300 focus:outline-none"
            >
              <option value="mcap">Market Cap</option>
              <option value="change">1W Return</option>
              <option value="price">Share Price</option>
              <option value="leverage">Debt Leverage</option>
              <option value="pe">P/E Ratio</option>
            </select>
          </div>
        </div>
      </div>

      {/* Issuers Count Summary */}
      <div className="flex items-center justify-between px-1 text-[10px] text-slate-400 font-medium">
        <span>Showing {filteredCompanies.length} of {state.companies.length} Issuers</span>
        <span>Tap row for 3-Statement sheet</span>
      </div>

      {/* Companies List */}
      <div className="space-y-2">
        {filteredCompanies.map((comp) => {
          const hist = comp.historicalPrices;
          const prevPrice = hist.length >= 2 ? hist[hist.length - 2] : comp.stockPrice;
          const chgUSD = comp.stockPrice - prevPrice;
          const chgPct = prevPrice > 0 ? (chgUSD / prevPrice) * 100 : 0;
          const isUp = chgUSD >= 0;

          // Sparkline mini SVG
          const minP = Math.min(...hist);
          const maxP = Math.max(...hist);
          const range = maxP - minP || 1;
          const sparkPoints = hist
            .map((p, idx) => {
              const x = (idx / (hist.length - 1)) * 48;
              const y = 18 - ((p - minP) / range) * 16;
              return `${x},${y}`;
            })
            .join(' ');

          return (
            <div
              key={comp.id}
              className={`bg-slate-900 border rounded-xl p-3 transition-all ${
                comp.isDefaulted
                  ? 'border-rose-500/50 bg-rose-950/20 opacity-75'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header: Ticker, Name, Badges */}
              <div className="flex items-start justify-between">
                <div
                  onClick={() => onSelectCompany(comp)}
                  className="flex-1 cursor-pointer pr-2"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold font-mono text-sm text-white">{comp.ticker}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                      {comp.region}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400">
                      {comp.sector}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRatingBadgeColor(
                        comp.creditRating
                      )}`}
                    >
                      {comp.creditRating}
                    </span>
                    {comp.isDefaulted && (
                      <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-rose-600 text-white animate-pulse">
                        DEFAULTED
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs text-slate-300 mt-0.5 truncate max-w-[210px]">{comp.name}</h4>
                </div>

                {/* Price & Return */}
                <div className="text-right">
                  <div className="text-sm font-extrabold font-mono text-white">
                    ${comp.stockPrice.toFixed(2)}
                  </div>
                  <div
                    className={`flex items-center justify-end text-[10px] font-bold font-mono ${
                      isUp ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {isUp ? '+' : ''}{chgPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Fundamentals Row & Sparkline */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-2.5 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[8px]">P/E</span>
                    <span className="text-slate-200 font-semibold">{comp.forwardPE.toFixed(1)}x</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">EPS</span>
                    <span className="text-slate-200 font-semibold">${comp.eps.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">DEBT/EBITDA</span>
                    <span className={`font-semibold ${comp.leverage > 5 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {comp.leverage.toFixed(1)}x
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">MCAP</span>
                    <span className="text-slate-200 font-semibold">{formatCurrency(comp.marketCap, { compact: true })}</span>
                  </div>
                </div>

                {/* Mini Sparkline */}
                <div className="flex items-center gap-2">
                  <svg className="w-12 h-5 overflow-visible">
                    <polyline
                      fill="none"
                      stroke={isUp ? '#34d399' : '#f87171'}
                      strokeWidth="1.5"
                      points={sparkPoints}
                    />
                  </svg>

                  {/* Quick Trade Button */}
                  <button
                    id={`btn-trade-equity-${comp.ticker}`}
                    onClick={() =>
                      onOpenTrade({
                        assetType: 'EQUITY',
                        id: comp.id,
                        symbol: comp.ticker,
                        name: comp.name,
                        region: comp.region,
                        price: comp.stockPrice,
                        quoteUnit: 'USD',
                        details: {
                          sector: comp.sector,
                          rating: comp.creditRating,
                          leverage: comp.leverage,
                        },
                      })
                    }
                    disabled={comp.isDefaulted}
                    className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-[10px] font-bold transition-all disabled:opacity-40"
                  >
                    Trade
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
