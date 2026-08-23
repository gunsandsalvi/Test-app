/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertOctagon,
  BarChart3,
  BookOpen,
  ChevronRight,
  CreditCard,
  FastForward,
  Flame,
  Globe,
  Layers,
  LineChart,
  Newspaper,
  Percent,
  RefreshCw,
  RotateCcw,
  Shield,
  Smartphone,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { Company, GameState, Position, TradeableInstrument } from './types';
import { advanceWeeklyStep, createInitialGameState } from './engine/simulation';
import { StatusBar } from './components/StatusBar';
import { OverflowMenu } from './components/OverflowMenu';
import { MacroTab } from './components/MacroTab';
import { IndicesTab } from './components/IndicesTab';
import { EquitiesTab } from './components/EquitiesTab';
import { BondsCdsTab } from './components/BondsCdsTab';
import { CommoditiesTab } from './components/CommoditiesTab';
import { DerivativesTab } from './components/DerivativesTab';
import { PortfolioRiskTab } from './components/PortfolioRiskTab';
import { CorporateIntelligenceTab } from './components/CorporateIntelligenceTab';
import { TradeTicketModal } from './components/TradeTicketModal';
import { NewsDrawer } from './components/NewsDrawer';
import { CompanyDetailModal } from './components/CompanyDetailModal';
import { TurnSummaryModal } from './components/TurnSummaryModal';
import { ManualModal } from './components/ManualModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { InteractiveChartModal } from './components/InteractiveChartModal';

export default function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState());
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [isStatusBarExpanded, setIsStatusBarExpanded] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [riskView, setRiskView] = useState<'portfolio' | 'intel'>('portfolio');
  const [lastTradableMarketsTab, setLastTradableMarketsTab] = useState<'equities' | 'commodities' | 'bonds_cds' | 'derivatives'>('equities');
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

  // Auto-advance loop if enabled
  useEffect(() => {
    let interval: any = null;
    if (isAutoAdvancing && !state.isGameOver) {
      interval = setInterval(() => {
        setState((prev) => advanceWeeklyStep(prev));
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoAdvancing, state.isGameOver]);

  const handleAdvanceWeek = useCallback(() => {
    if (state.isGameOver) return;
    setState((prev) => {
      const next = advanceWeeklyStep(prev);
      return next;
    });
    setShowTurnSummary(true);
  }, [state.isGameOver]);

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
    >
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

      return {
        ...prev,
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

  const handleClosePosition = (positionId: string) => {
    setState((prev) => {
      const pos = prev.portfolio.positions.find((p) => p.id === positionId);
      if (!pos) return prev;

      const realizedDelta = pos.unrealizedPnL;
      const remainingPositions = prev.portfolio.positions.filter((p) => p.id !== positionId);

      const updatedRealizedTotal = prev.portfolio.realizedPnLTotal + realizedDelta;
      const updatedCash = prev.portfolio.cashUSD + realizedDelta;

      const totalMarginReq = remainingPositions.reduce((s, p) => s + p.marginRequirement, 0);
      const totalMaintMargin = remainingPositions.reduce((s, p) => s + p.maintenanceMargin, 0);
      const currentNav = updatedCash + remainingPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
      const marginUtilizationPct = currentNav > 0 ? Math.round((totalMarginReq / currentNav) * 100) : 0;

      return {
        ...prev,
        portfolio: {
          ...prev.portfolio,
          cashUSD: updatedCash,
          navUSD: currentNav,
          positions: remainingPositions,
          closedPositionsCount: prev.portfolio.closedPositionsCount + 1,
          realizedPnLTotal: updatedRealizedTotal,
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
        
        {/* Segmented 4-Group Navigation Tab Bar */}
        <nav className="flex items-center justify-between gap-1 p-2 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider shrink-0">
          <button
            id="nav-tab-macro"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'macro' }))}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'macro'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Macro</span>
          </button>
          
          <button
            id="nav-tab-indices"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'indices' }))}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'indices'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Indices</span>
          </button>
          
          <button
            id="nav-tab-markets"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: lastTradableMarketsTab }))}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              ['equities', 'commodities', 'bonds_cds', 'derivatives'].includes(state.selectedTab)
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Markets</span>
          </button>
          
          <button
            id="nav-tab-risk"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'risk' }))}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'risk'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Risk ({state.portfolio.positions.length})</span>
          </button>
        </nav>

        {/* Tradable Markets Sub-Navigation Pill Row */}
        {['equities', 'commodities', 'bonds_cds', 'derivatives'].includes(state.selectedTab) && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/70 text-[10px] font-semibold">
            <button
              id="subnav-equities"
              onClick={() => {
                setLastTradableMarketsTab('equities');
                setState((prev) => ({ ...prev, selectedTab: 'equities' }));
              }}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                state.selectedTab === 'equities'
                  ? 'bg-slate-800 text-white shadow-inner font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <LineChart className="w-3 h-3 text-emerald-400" />
              <span>Equities</span>
            </button>
            <button
              id="subnav-commodities"
              onClick={() => {
                setLastTradableMarketsTab('commodities');
                setState((prev) => ({ ...prev, selectedTab: 'commodities' }));
              }}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                state.selectedTab === 'commodities'
                  ? 'bg-slate-800 text-white shadow-inner font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Commodities</span>
            </button>
            <button
              id="subnav-bonds_cds"
              onClick={() => {
                setLastTradableMarketsTab('bonds_cds');
                setState((prev) => ({ ...prev, selectedTab: 'bonds_cds' }));
              }}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                state.selectedTab === 'bonds_cds'
                  ? 'bg-slate-800 text-white shadow-inner font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Shield className="w-3 h-3 text-indigo-400" />
              <span>Bonds & Loans</span>
            </button>
            <button
              id="subnav-derivatives"
              onClick={() => {
                setLastTradableMarketsTab('derivatives');
                setState((prev) => ({ ...prev, selectedTab: 'derivatives' }));
              }}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                state.selectedTab === 'derivatives'
                  ? 'bg-slate-800 text-white shadow-inner font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Zap className="w-3 h-3 text-violet-400" />
              <span>Derivatives</span>
            </button>
          </div>
        )}

        {/* Scrollable Tab Content View */}
        <main className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth no-scrollbar pb-24">
          {state.selectedTab === 'macro' && (
            <MacroTab
              state={state}
              onOpenTrade={handleOpenTrade}
              onOpenChart={(chartData) => setActiveChartData(chartData)}
            />
          )}
          {state.selectedTab === 'indices' && (
            <IndicesTab state={state} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'equities' && (
            <EquitiesTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'commodities' && (
            <CommoditiesTab state={state} onOpenTrade={handleOpenTrade} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'bonds_cds' && (
            <BondsCdsTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'derivatives' && (
            <DerivativesTab state={state} onOpenTrade={handleOpenTrade} />
          )}
          {state.selectedTab === 'risk' && (
            <div className="flex flex-col gap-3">
              <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
                <button
                  onClick={() => setRiskView('portfolio')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    riskView === 'portfolio' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Portfolio Risk
                </button>
                <button
                  onClick={() => setRiskView('intel')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    riskView === 'intel' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Corporate Intel
                </button>
              </div>
              {riskView === 'portfolio' ? (
                <PortfolioRiskTab state={state} onClosePosition={handleClosePosition} />
              ) : (
                <CorporateIntelligenceTab state={state} />
              )}
            </div>
          )}
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
        <footer className="bg-slate-900 border-t border-slate-800 p-2.5 sticky bottom-0 z-20 shadow-2xl flex items-center gap-2">
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

        {/* Trade Ticket Bottom Sheet Modal */}
        {state.isTradeModalOpen && state.selectedInstrument && (
          <TradeTicketModal
            instrument={state.selectedInstrument}
            state={state}
            onClose={handleCloseTradeModal}
            onExecuteTrade={handleExecuteTrade}
          />
        )}

        {/* Company 3-Statement Detail Sheet Modal */}
        {selectedCompany && (
          <CompanyDetailModal
            company={selectedCompany}
            currentWeek={state.currentWeek}
            state={state}
            onClose={() => setSelectedCompany(null)}
            onOpenTrade={handleOpenTrade}
            onOpenChart={(chartData) => setActiveChartData(chartData)}
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
