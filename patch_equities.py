import sys

with open('src/components/EquitiesTab.tsx', 'r') as f:
    text = f.read()

# Top 3 Gainers and Losers
import_stat = """import React, { useState } from 'react';
import { GameState, Company, Sector, RegionId } from '../types';
import { ArrowUpRight, ArrowDownRight, TrendingUp, BarChart2, Activity } from 'lucide-react';
"""

text = text.replace("import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';", 
                    import_stat)

# Insert the new UI at the top
old_top = """      {/* Filter / Sort Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex flex-col gap-2 shadow-sm sticky top-0 z-10">"""

new_top = """      {/* Market Movers & Intelligence */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
          <div className="flex items-center gap-1.5 mb-2 text-emerald-400 border-b border-slate-800 pb-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider">Top Gainers</h3>
          </div>
          <div className="space-y-1">
            {[...state.companies].sort((a,b) => {
              const hA = a.historicalPrices;
              const chgA = hA.length >= 2 ? (a.stockPrice - hA[hA.length-2]) / hA[hA.length-2] : 0;
              const hB = b.historicalPrices;
              const chgB = hB.length >= 2 ? (b.stockPrice - hB[hB.length-2]) / hB[hB.length-2] : 0;
              return chgB - chgA;
            }).slice(0,3).map(c => {
              const hist = c.historicalPrices;
              const chg = hist.length >= 2 ? (c.stockPrice - hist[hist.length-2]) / hist[hist.length-2] : 0;
              return (
                <div key={c.id} className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-slate-300 font-bold">{c.ticker}</span>
                  <span className="text-emerald-400">+{((chg)*100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
          <div className="flex items-center gap-1.5 mb-2 text-rose-400 border-b border-slate-800 pb-1">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider">Top Losers</h3>
          </div>
          <div className="space-y-1">
            {[...state.companies].sort((a,b) => {
              const hA = a.historicalPrices;
              const chgA = hA.length >= 2 ? (a.stockPrice - hA[hA.length-2]) / hA[hA.length-2] : 0;
              const hB = b.historicalPrices;
              const chgB = hB.length >= 2 ? (b.stockPrice - hB[hB.length-2]) / hB[hB.length-2] : 0;
              return chgA - chgB;
            }).slice(0,3).map(c => {
              const hist = c.historicalPrices;
              const chg = hist.length >= 2 ? (c.stockPrice - hist[hist.length-2]) / hist[hist.length-2] : 0;
              return (
                <div key={c.id} className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-slate-300 font-bold">{c.ticker}</span>
                  <span className="text-rose-400">{((chg)*100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Category Leaders */}
      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
        <div className="flex items-center gap-1.5 mb-2 text-blue-400 border-b border-slate-800 pb-1">
          <BarChart2 className="w-3.5 h-3.5" />
          <h3 className="text-[10px] font-bold uppercase tracking-wider">Largest by Market Cap</h3>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {['Tech', 'Financials', 'Energy', 'Industrials'].map(sec => {
            const leader = [...state.companies].filter(c => c.sector === sec).sort((a,b) => b.marketCap - a.marketCap)[0];
            if (!leader) return null;
            return (
              <div key={sec} className="flex-1 min-w-[100px] bg-slate-950 border border-slate-800 p-1.5 rounded-lg">
                <div className="text-[8px] text-slate-500 uppercase">{sec}</div>
                <div className="flex justify-between items-center font-mono mt-0.5">
                  <span className="text-slate-300 font-bold text-[10px]">{leader.ticker}</span>
                  <span className="text-blue-400 text-[9px]">${(leader.marketCap/1000).toFixed(1)}B</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* IPO Ticker */}
      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl overflow-hidden flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
        <div className="text-[9px] font-mono text-amber-400 uppercase tracking-wider whitespace-nowrap overflow-hidden">
          <span className="inline-block animate-[marquee_15s_linear_infinite]">
            Upcoming IPOs: QuantStellar (QSTL) Q3 • NeoBank (NEO) Q4 • BioSynth (BIOX) under review •
          </span>
        </div>
      </div>

      {/* Filter / Sort Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex flex-col gap-2 shadow-sm sticky top-0 z-10">"""

if old_top in text:
    text = text.replace(old_top, new_top)

with open('src/components/EquitiesTab.tsx', 'w') as f:
    f.write(text)

