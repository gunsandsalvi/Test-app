import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Globe,
  Landmark,
  Newspaper,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { GameState, NewsItem, TradeableInstrument } from '../types';
import { cleanLatexTokens, formatSimulationDate } from '../engine/formatters';

interface NewsDrawerProps {
  state: GameState;
  isOpen: boolean;
  onToggle: () => void;
  onOpenTrade?: (instrument: TradeableInstrument) => void;
}

export const NewsDrawer: React.FC<NewsDrawerProps> = ({
  state,
  isOpen,
  onToggle,
  onOpenTrade,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const latestNews = state.newsFeed[0];

  const getCategoryIcon = (cat: NewsItem['category']) => {
    switch (cat) {
      case 'EARNINGS':
        return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      case 'CENTRAL_BANK':
        return <Landmark className="w-3.5 h-3.5 text-blue-400" />;
      case 'CREDIT':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
      case 'WEATHER':
        return <CloudRain className="w-3.5 h-3.5 text-cyan-400" />;
      case 'MACRO':
        return <Globe className="w-3.5 h-3.5 text-indigo-400" />;
      case 'COMMODITY':
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Newspaper className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const filteredNews = state.newsFeed.filter((item) => {
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'EARNINGS') return item.category === 'EARNINGS';
    if (filterCategory === 'MACRO_CB') return item.category === 'MACRO' || item.category === 'CENTRAL_BANK';
    if (filterCategory === 'CREDIT') return item.category === 'CREDIT';
    if (filterCategory === 'COMMODITY_WEATHER') return item.category === 'COMMODITY' || item.category === 'WEATHER';
    return true;
  });

  const handleNewsTradeShortcut = (item: NewsItem) => {
    if (!onOpenTrade) return;

    if (item.tradeShortcut) {
      onOpenTrade(item.tradeShortcut);
      onToggle();
      return;
    }

    if (item.affectedTicker) {
      const comp = state.companies.find((c) => c.ticker === item.affectedTicker);
      if (comp) {
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
          },
        });
        onToggle();
        return;
      }
    }

    if (item.category === 'COMMODITY') {
      const oil = state.commodities.find((c) => c.symbol === 'ENERGY_ALPHA') || state.commodities[0];
      if (oil) {
        onOpenTrade({
          assetType: 'COMMODITY',
          id: oil.id,
          symbol: oil.symbol,
          name: oil.name,
          region: 'USA',
          price: oil.spotPrice,
          quoteUnit: oil.unit,
          details: {},
        });
        onToggle();
        return;
      }
    }

    if (item.impactRegion) {
      const reg = state.regions[item.impactRegion];
      if (reg) {
        onOpenTrade({
          assetType: 'IRS',
          id: `${item.impactRegion}_IRS_5Y`,
          symbol: `${item.impactRegion} 5Y IRS`,
          name: `${reg.name} 5Y Interest Rate Swap`,
          region: item.impactRegion,
          price: reg.zeroRates.tenor5Y,
          quoteUnit: '% Par',
          details: {
            tenorYears: 5,
            couponRate: reg.zeroRates.tenor5Y,
          },
        });
        onToggle();
      }
    }
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 z-30 max-w-md mx-auto px-2 pointer-events-auto">
      {/* Floating Ticker Bar */}
      <div
        onClick={onToggle}
        className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 text-slate-100 shadow-xl cursor-pointer hover:border-slate-700 transition-all flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1 rounded bg-blue-500/20 text-blue-400 shrink-0">
            <Newspaper className="w-3.5 h-3.5" />
          </div>
          {latestNews ? (
            <div className="truncate text-xs">
              <span className="font-bold text-white mr-1.5 truncate">
                {cleanLatexTokens(latestNews.title)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">No breaking headlines</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-[10px] text-slate-400">
          <span>{state.newsFeed.length}</span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </div>
      </div>

      {/* Expanded News Feed Modal / Drawer */}
      {isOpen && (
        <div className="mt-2 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 max-h-[65vh] overflow-y-auto space-y-2.5 shadow-2xl animate-in slide-in-from-bottom-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <Newspaper className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-white">Global Macro & Corporate News Wire</h3>
            </div>
            <button
              onClick={onToggle}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-bold">
            <button
              onClick={() => setFilterCategory('ALL')}
              className={`px-2 py-1 rounded-lg shrink-0 transition-all ${
                filterCategory === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All ({state.newsFeed.length})
            </button>
            <button
              onClick={() => setFilterCategory('EARNINGS')}
              className={`px-2 py-1 rounded-lg shrink-0 transition-all ${
                filterCategory === 'EARNINGS'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Earnings ({state.newsFeed.filter((n) => n.category === 'EARNINGS').length})
            </button>
            <button
              onClick={() => setFilterCategory('MACRO_CB')}
              className={`px-2 py-1 rounded-lg shrink-0 transition-all ${
                filterCategory === 'MACRO_CB'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Macro & Rates
            </button>
            <button
              onClick={() => setFilterCategory('CREDIT')}
              className={`px-2 py-1 rounded-lg shrink-0 transition-all ${
                filterCategory === 'CREDIT'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Credit & Default
            </button>
            <button
              onClick={() => setFilterCategory('COMMODITY_WEATHER')}
              className={`px-2 py-1 rounded-lg shrink-0 transition-all ${
                filterCategory === 'COMMODITY_WEATHER'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Commodity & Climate
            </button>
          </div>

          <div className="space-y-2">
            {filteredNews.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getCategoryIcon(item.category)}
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                      {item.category}
                    </span>
                    {item.impactRegion && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/60 text-slate-400">
                        {item.impactRegion}
                      </span>
                    )}
                    {item.impactSector && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/60 text-slate-400">
                        {item.impactSector}
                      </span>
                    )}
                    {item.urgent && (
                      <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-rose-600 text-white animate-pulse">
                        BREAKING
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-slate-400">{formatSimulationDate(item.week)}</span>
                </div>

                <h4 className="text-xs font-bold text-slate-100">{cleanLatexTokens(item.title)}</h4>
                <p className={`text-[11px] text-slate-400 leading-relaxed ${item.impactBadge === '[DIAGNOSTIC]' ? 'whitespace-pre-wrap font-mono text-[10px]' : ''}`}>
                  {cleanLatexTokens(item.description)}
                </p>

                {/* Impact Badge & Trade Catalyst Shortcut */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                  {item.impactBadge ? (
                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Impact: {cleanLatexTokens(item.impactBadge)}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-500">Global Catalyst</span>
                  )}

                  {onOpenTrade && (
                    <button
                      onClick={() => handleNewsTradeShortcut(item)}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-lg border border-blue-500/30 transition-all active:scale-95"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Trade Event</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
