/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertOctagon,
  BookOpen,
  Briefcase,
  FastForward,
  Globe,
  Newspaper,
  RotateCcw,
  Smartphone,
  TrendingUp,
} from 'lucide-react';

import { Company, GameState, Position } from './types';
import { advanceWeeklyStep, createInitialGameState } from './engine/simulation';
import { StatusBar } from './components/StatusBar';
import { OverflowMenu } from './components/OverflowMenu';
import { BriefingScreen } from './components/screens/BriefingScreen';
import { WorldScreen } from './components/screens/WorldScreen';
import { CorporatesScreen } from './components/screens/CorporatesScreen';
import { RatesScreen } from './components/screens/RatesScreen';
import { FxScreen } from './components/screens/FxScreen';
import { CommoditiesScreen } from './components/screens/CommoditiesScreen';
import { MyBookScreen } from './components/screens/MyBookScreen';
import { TradeTicketModal } from './components/TradeTicketModal';
import { NewsDrawer } from './components/NewsDrawer';
import { TurnSummaryModal } from './components/TurnSummaryModal';
import { ManualModal } from './components/ManualModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { InteractiveChartModal } from './components/InteractiveChartModal';

export type Destination = 'briefing' | 'world' | 'market' | 'book';
export type MarketSubScreen = 'corporates' | 'rates' | 'fx' | 'commodities';

export default function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState());
  const [prevState, setPrevState] = useState<GameState | null>(null);
  const [destination, setDestination] = useState<Destination>('briefing');
  const [marketSub, setMarketSub] = useState<MarketSubScreen>('corporates');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const handleNavigate = (dest: Destination, payload?: any) => {
    setDestination(dest);
    if (payload?.companyId) {
       const c = state.companies.find(x => x.id === payload.companyId);
       if (c) setSelectedCompany(c);
    } else if (payload?.companyTicker) {
       const c = state.companies.find(x => x.ticker === payload.companyTicker);
       if (c) setSelectedCompany(c);
    }
    if (payload?.marketSub) {
       setMarketSub(payload.marketSub);
    }
  };
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [isStatusBarExpanded, setIsStatusBarExpanded] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [showTurnSummary, setShowTurnSummary] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeChartData, setActiveChartData] = useState<{
    id: string;
    title: string;
    subtitle?: string;
    currentValue: number;
    unit?: string;
    historicalSeries: number[];
  } | null>(null);
  const [isDesktopFrame, setIsDesktopFrame] = useState(true);

  useEffect(() => {
    let interval: any = null;
    if (isAutoAdvancing && !state.isGameOver) {
      interval = setInterval(() => {
        setPrevState(state);
        setState((prev) => advanceWeeklyStep(prev));
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoAdvancing, state]);

  const handleAdvanceWeek = useCallback(() => {
    if (state.isGameOver) return;
    setPrevState(state);
    setState((prev) => advanceWeeklyStep(prev));
    setShowTurnSummary(true);
  }, [state]);

  const handleOpenTrade = (instrument: any) => {
    setState((prev) => ({
      ...prev,
      selectedInstrument: instrument,
      isTradeModalOpen: true,
    }));
  };

  const handleCloseTradeModal = () => {
    setState((prev) => ({
      ...prev,
      isTradeModalOpen: false,
      selectedInstrument: null,
    }));
  };

  const handleExecuteTrade = (
    posData: Omit<
      Position,
      'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'
    >,
    executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string }
  ) => {
    setState((prev) => {
      const newPos: Position = {
        ...posData,
        id: `pos_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        openedWeek: prev.currentWeek,
        unrealizedPnL: 0,
        realizedPnL: 0,
        maintenanceMargin: posData.marginRequirement * 0.7,
        weeklyFinancingCost: 0,
      };

      // Spread transaction fee
      const spreadBps = 15;
      const spreadFee = (posData.notional * spreadBps) / 10000;
      const updatedCash = prev.portfolio.cashUSD - spreadFee;

      const updatedPositions = [newPos, ...prev.portfolio.positions];
      const totalMarginReq = updatedPositions.reduce((s, p) => s + p.marginRequirement, 0);
      const totalMaintMargin = updatedPositions.reduce((s, p) => s + p.maintenanceMargin, 0);

      const navUSD = updatedCash + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
      const marginUtilizationPct = navUSD > 0 ? Math.round((totalMarginReq / navUSD) * 100) : 100;

      const updatedRegions = { ...prev.regions };
      if (executionDetails && executionDetails.counterpartyFeeUSD > 0) {
        const region = updatedRegions[posData.region];
        if (region) {
          // Find instrument in bank or institutional
          const instrumentId = posData.trancheId || posData.symbol;
          // Actually, we don't need to manually debit the quantity if it's too complex because we don't have the exact exact security quantity.
          // The prompt says: "and debit the sourced amount from whichever entity's itemizedHoldings/securityHoldings it came from (bank inventory first, then the largest institutional holder) — crediting the bank's bankEquityUSD with the fee."
          
          let remainingToSource = posData.notional;
          let newBankHoldings = [...region.bankingSector.itemizedHoldings];
          let newInstHoldings = [...region.institutionalSector.itemizedHoldings];
          
          // First, deduct from bank
          newBankHoldings = newBankHoldings.map(h => {
            if (h.instrumentId === instrumentId && remainingToSource > 0) {
              const deduction = Math.min(h.quantityOrNotionalUSD, remainingToSource);
              remainingToSource -= deduction;
              return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD - deduction };
            }
            return h;
          }).filter(h => h.quantityOrNotionalUSD > 0.01);
          
          // Then deduct from institutional
          if (remainingToSource > 0) {
             newInstHoldings = newInstHoldings.map(h => {
              if (h.instrumentId === instrumentId && remainingToSource > 0) {
                const deduction = Math.min(h.quantityOrNotionalUSD, remainingToSource);
                remainingToSource -= deduction;
                return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD - deduction };
              }
              return h;
             }).filter(h => h.quantityOrNotionalUSD > 0.01);
          }
          
          updatedRegions[posData.region] = {
            ...region,
            bankingSector: {
               ...region.bankingSector,
               bankEquityUSD: region.bankingSector.bankEquityUSD + executionDetails.counterpartyFeeUSD,
               itemizedHoldings: newBankHoldings
            },
            institutionalSector: {
               ...region.institutionalSector,
               itemizedHoldings: newInstHoldings
            }
          };
        }
      }

      return {
        ...prev,
        regions: updatedRegions,
        isTradeModalOpen: false,
        selectedInstrument: null,
        portfolio: {
          ...prev.portfolio,
          cashUSD: updatedCash,
          navUSD,
          positions: updatedPositions,
          totalRequiredMarginUSD: totalMarginReq,
          maintenanceMarginUSD: totalMaintMargin,
          marginUtilizationPct,
        },
      };
    });
  };

  const handleResetGame = () => {
    setState(createInitialGameState());
    setSelectedCompany(null);
    setIsAutoAdvancing(false);
    setShowTurnSummary(false);
    setShowManual(false);
    setShowDiagnostics(false);
    setActiveChartData(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans antialiased selection:bg-blue-500 selection:text-white">
      {/* Desktop Frame Controls (Only visible on wide screens) */}
      <div className="hidden lg:flex items-center justify-between w-full max-w-5xl px-4 py-2 text-xs text-slate-400 border-b border-slate-900">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-200">Global Financial Markets Simulator & Quant Desk</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDiagnostics(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 transition-colors font-mono"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Engine Debugger</span>
          </button>
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-blue-300 border border-slate-800 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Desk Cheatsheet</span>
          </button>
          <button
            onClick={() => setIsDesktopFrame(!isDesktopFrame)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isDesktopFrame ? 'Phone Viewport (9:19.5)' : 'Expand Width'}</span>
          </button>
          <button
            onClick={handleResetGame}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restart Sim</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container (Mobile 9:19.5 or Responsive Full Screen) */}
      <div
        className={`w-full bg-slate-950 flex flex-col relative transition-all ${
          isDesktopFrame
            ? 'max-w-[440px] h-[94vh] max-h-[960px] rounded-3xl border-4 border-slate-800/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden my-auto'
            : 'max-w-2xl min-h-screen border-x border-slate-900'
        }`}
      >
        {/* Expandable Status Bar */}
        <StatusBar
          state={state}
          isExpanded={isStatusBarExpanded}
          onToggleExpanded={() => setIsStatusBarExpanded(p => !p)}
          onAdvanceWeek={handleAdvanceWeek}
          isAutoAdvancing={isAutoAdvancing}
          onToggleAutoAdvance={() => setIsAutoAdvancing(!isAutoAdvancing)}
          onOpenOverflow={() => setIsOverflowOpen(true)}
        />
        {isOverflowOpen && (
          <OverflowMenu
            state={state}
            onClose={() => setIsOverflowOpen(false)}
            onRestart={handleResetGame}
          />
        )}

        {/* Scrollable Content View */}
        <main className="flex-1 overflow-y-auto scroll-smooth no-scrollbar">
          {destination === 'briefing' && <BriefingScreen state={state} prevState={prevState} onNavigate={handleNavigate} />}
          {destination === 'world' && <WorldScreen state={state} prevState={prevState} onNavigate={handleNavigate} />}
          {destination === 'market' && (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-1 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] shrink-0">
                {[
                  { id: 'corporates', label: 'Corporates' },
                  { id: 'rates', label: 'Rates' },
                  { id: 'fx', label: 'FX' },
                  { id: 'commodities', label: 'Commodities' },
                ].map(s => (
                  <button key={s.id} onClick={() => setMarketSub(s.id as MarketSubScreen)}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold ${marketSub===s.id ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar relative">
                {marketSub === 'corporates' && <CorporatesScreen state={state} onOpenTrade={handleOpenTrade} selectedCompany={selectedCompany} onSelectCompany={setSelectedCompany} />}
                {marketSub === 'rates' && <RatesScreen state={state} onOpenTrade={handleOpenTrade} />}
                {marketSub === 'fx' && <FxScreen state={state} onOpenTrade={handleOpenTrade} onNavigate={handleNavigate} />}
                {marketSub === 'commodities' && <CommoditiesScreen state={state} onOpenTrade={handleOpenTrade} />}
              </div>
            </div>
          )}
          {destination === 'book' && <MyBookScreen state={state} prevState={prevState} onNavigate={handleNavigate} />}
        </main>

        {/* Expandable News Ticker Drawer */}
        <NewsDrawer
          state={state}
          isOpen={state.isNewsDrawerOpen}
          onToggle={() =>
            setState((prev) => ({ ...prev, isNewsDrawerOpen: !prev.isNewsDrawerOpen }))
          }
          onOpenTrade={handleOpenTrade}
        />

        {/* Primary Action Footer: Advance to Next Week */}
        <footer className="bg-slate-900 border-t border-slate-800 p-2.5 sticky bottom-14 z-20 shadow-2xl flex items-center gap-2">
          <button
            id="btn-advance-week"
            onClick={handleAdvanceWeek}
            disabled={state.isGameOver}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-extrabold text-xs tracking-wider shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FastForward className="w-4 h-4" />
            <span>ADVANCE TO NEXT WEEK (T → T+1)</span>
          </button>
        </footer>

        {/* 4-Destination Navigation Shell */}
        <nav className="sticky bottom-0 left-0 right-0 bg-[var(--bg-panel)] border-t border-[var(--border-hairline)] flex items-center h-14 z-30">
          {[
            { id: 'briefing', label: 'Briefing', icon: Newspaper },
            { id: 'world', label: 'World', icon: Globe },
            { id: 'market', label: 'Market', icon: TrendingUp },
            { id: 'book', label: 'My Book', icon: Briefcase },
          ].map(d => (
            <button key={d.id} onClick={() => setDestination(d.id as Destination)}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-0.5 ${destination===d.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
              <d.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{d.label}</span>
            </button>
          ))}
        </nav>

        {/* Trade Ticket Bottom Sheet Modal */}
        {state.isTradeModalOpen && state.selectedInstrument && (
          <TradeTicketModal
            instrument={state.selectedInstrument}
            state={state}
            onClose={handleCloseTradeModal}
            onExecuteTrade={handleExecuteTrade}
          />
        )}

        {/* Turn Settlement Summary Modal */}
        {showTurnSummary && (
          <TurnSummaryModal state={state} onClose={() => setShowTurnSummary(false)} />
        )}

        {/* Quant Desk Manual & Cheatsheet Modal */}
        {showManual && (
          <ManualModal onClose={() => setShowManual(false)} />
        )}

        {/* Developer Diagnostics / Vector Inspector Modal */}
        {showDiagnostics && (
          <DiagnosticsModal state={state} onClose={() => setShowDiagnostics(false)} />
        )}

        {/* Interactive 52W Fullscreen Chart Modal */}
        {activeChartData && (
          <InteractiveChartModal
            data={activeChartData}
            currentWeek={state.currentWeek}
            onClose={() => setActiveChartData(null)}
          />
        )}

        {/* Game Over Modal */}
        {state.isGameOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in">
            <div className="w-full max-w-sm bg-slate-900 border border-rose-500/50 rounded-2xl p-5 text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 mx-auto flex items-center justify-center">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">FUND LIQUIDATED</h3>
                <p className="text-xs text-rose-300 mt-1 leading-relaxed">
                  {state.gameOverReason || 'Net Asset Value breached regulatory capital thresholds.'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
                Final Surviving Period: Week {state.currentWeek} • {state.year}
              </div>
              <button
                onClick={handleResetGame}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all"
              >
                Start New Fund ($25.0M)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
