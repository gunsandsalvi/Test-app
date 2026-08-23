import React, { useState } from 'react';
import { CapitalStructureBar } from './charts/Charts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  DollarSign,
  FileText,
  History,
  Layers,
  LineChart,
  Percent,
  Radio,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { Company, CreditRating, TradeableInstrument } from '../types';
import {
  formatBps,
  formatCurrency,
  formatMultiple,
  formatPercent,
  formatStockPrice,
  formatSimulationDate,
  formatQuarterFilingDate,
} from '../engine/formatters';

interface CompanyDetailModalProps {
  company: Company;
  currentWeek: number;
  onClose: () => void;
  onOpenTrade: (instrument: any) => void;
  onOpenChart?: (chartData: {
    id: string;
    title: string;
    subtitle?: string;
    currentValue: number;
    unit?: string;
    historicalSeries: number[];
  }) => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  company,
  currentWeek,
  onClose,
  onOpenTrade,
  onOpenChart,
}) => {
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'MARGINS' | 'EARNINGS_HUB' | 'CAPITAL_STRUCTURE' | 'HISTORY_STATEMENTS'
  >('OVERVIEW');

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

  const fundamentals = company.historicalFundamentals || [];
  const consensus = company.dealerConsensus;

  // Margin metrics calculations
  const grossMargin = 0.52; // Sector benchmark proxy
  const ebitdaMargin = company.annualRevenue > 0 ? company.ebitda / company.annualRevenue : 0;
  const netMargin = company.annualRevenue > 0 ? company.netIncome / company.annualRevenue : 0;
  const fcf = company.ebitda - company.capex - (company.totalDebt * (company.debtInterestRate || 0.05));
  const fcfConversion = company.ebitda > 0 ? fcf / company.ebitda : 0;
  const estimatedEquity = Math.max(10, company.marketCap * 0.6);
  const roe = company.netIncome / estimatedEquity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl p-4 space-y-3.5 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold font-mono text-lg text-white">{company.ticker}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRatingBadgeColor(
                  company.creditRating
                )}`}
              >
                Rating: {company.creditRating}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {company.region}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                {company.sector}
              </span>
              {company.isDefaulted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold animate-pulse">
                  DEFAULTED (D)
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-200 mt-0.5">{company.name}</h3>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenChart && (
              <button
                onClick={() =>
                  onOpenChart({
                    id: company.ticker,
                    title: `${company.name} (${company.ticker})`,
                    subtitle: `${company.region} • ${company.sector} • Equity Price`,
                    currentValue: company.stockPrice,
                    unit: '$',
                    historicalSeries: company.historicalPrices,
                  })
                }
                className="p-1.5 rounded-lg bg-slate-950 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 border border-slate-800 transition-colors"
                title="View 52W Stock Chart"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher */}
        <div className="grid grid-cols-5 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-bold text-center">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'OVERVIEW' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('MARGINS')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'MARGINS' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Margins
          </button>
          <button
            onClick={() => setActiveTab('EARNINGS_HUB')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'EARNINGS_HUB' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Earnings
          </button>
          <button
            onClick={() => setActiveTab('CAPITAL_STRUCTURE')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'CAPITAL_STRUCTURE' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Cap Struct
          </button>
          <button
            onClick={() => setActiveTab('HISTORY_STATEMENTS')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-0.5 ${
              activeTab === 'HISTORY_STATEMENTS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3 h-3" />
            <span>4Q Stmt</span>
          </button>
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-3">
            {/* Quick Price Banner */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-mono block">Stock Price</span>
                <span className="text-xl font-extrabold text-white font-mono">
                  {formatStockPrice(company.stockPrice)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 uppercase font-mono block">Market Cap</span>
                <span className="text-sm font-bold text-cyan-300 font-mono">
                  {formatCurrency(company.marketCap, { compact: true })}
                </span>
              </div>
            </div>

            {/* Corporate Fundamentals */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Corporate Fundamental Metrics
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">Annual Revenue</span>
                  <span className="text-white font-bold">{formatCurrency(company.annualRevenue, { compact: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">EBITDA</span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(company.ebitda, { compact: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">Operating EBIT</span>
                  <span className="text-white font-bold">{formatCurrency(company.ebit, { compact: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">Net Income</span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(company.netIncome, { compact: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">Cash & Liquidity</span>
                  <span className="text-blue-400 font-bold">{formatCurrency(company.cash, { compact: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-[9px] text-slate-500 uppercase block">Total Funded Debt</span>
                  <span className="text-amber-400 font-bold">{formatCurrency(company.totalDebt, { compact: true })}</span>
                </div>
              </div>
            </div>

            {/* Solvency & Credit Spreads */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Solvency, Ratios & Spreads
                </h4>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono text-center">
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-slate-500 text-[8px] block uppercase">Leverage</span>
                  <span className="text-xs font-bold text-white">{formatMultiple(company.leverage)}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-slate-500 text-[8px] block uppercase">Coverage</span>
                  <span className="text-xs font-bold text-emerald-400">{formatMultiple(company.interestCoverage)}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-slate-500 text-[8px] block uppercase">OAS Spread</span>
                  <span className="text-xs font-bold text-indigo-400">{formatBps(company.oasSpreadBps, { showSign: true })}</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900/80">
                  <span className="text-slate-500 text-[8px] block uppercase">CDS Spread</span>
                  <span className="text-xs font-bold text-purple-400">{formatBps(company.cdsSpreadBps)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MARGIN & EFFICIENCY DASHBOARD */}
        {activeTab === 'MARGINS' && (
          <div className="space-y-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Operating Margin & Capital Efficiency
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-cyan-400">Current Run-Rate</span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                {/* Gross Margin */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-300 font-sans font-medium block text-xs">Gross Margin</span>
                    <span className="text-[10px] text-slate-500">Gross Profit / Revenue</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{formatPercent(grossMargin, { isDecimal: true })}</span>
                  </div>
                </div>

                {/* EBITDA Margin */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-300 font-sans font-medium block text-xs">EBITDA Margin</span>
                    <span className="text-[10px] text-slate-500">Operating Cash Conversion</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-400">{formatPercent(ebitdaMargin, { isDecimal: true })}</span>
                  </div>
                </div>

                {/* Net Profit Margin */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-300 font-sans font-medium block text-xs">Net Profit Margin</span>
                    <span className="text-[10px] text-slate-500">Bottom-line Yield</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-cyan-300">{formatPercent(netMargin, { isDecimal: true })}</span>
                  </div>
                </div>

                {/* FCF Conversion */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-300 font-sans font-medium block text-xs">Free Cash Flow Conversion</span>
                    <span className="text-[10px] text-slate-500">(EBITDA - CapEx - Interest) / EBITDA</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-purple-300">{formatPercent(fcfConversion, { isDecimal: true })}</span>
                  </div>
                </div>

                {/* ROE */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-300 font-sans font-medium block text-xs">Return on Equity (ROE)</span>
                    <span className="text-[10px] text-slate-500">Net Income / Book Value</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-amber-300">{formatPercent(roe, { isDecimal: true })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EARNINGS HUB TAB */}
        {activeTab === 'EARNINGS_HUB' && (() => {
          const weeksUntilReport = (company.earningsWeekModulo - (currentWeek % 13) + 13) % 13;
          const reportWeek = currentWeek + weeksUntilReport;
          const quarterIdx = Math.floor((reportWeek - 1) / 13) + 4;
          const reportDateStr = formatSimulationDate(reportWeek);
          const reportQuarterStr = formatQuarterFilingDate(quarterIdx).split(' ')[0] + " '" + formatQuarterFilingDate(quarterIdx).split(' ')[1].replace("'", ""); // e.g. Q1 '26

          return (
          <div className="space-y-3">
            {/* Earnings Schedule & Surprise Banner */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Quarterly Earnings Cycle
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Reports on: {reportDateStr} ({reportQuarterStr})
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Last Earnings Surprise:</span>
                  <span
                    className={`font-mono font-bold ${
                      company.lastEarningsSurprisePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {company.lastEarningsSurprisePct >= 0 ? '+' : ''}
                    {formatPercent(company.lastEarningsSurprisePct, { isDecimal: true, showSign: true })} Surprise
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 italic border-t border-slate-800/80 pt-1.5">
                  &ldquo;{company.lastManagementCommentary || 'In-line quarterly operating performance.'}&rdquo;
                </div>
              </div>
            </div>

            {/* 3-Dealer Consensus Forecast Deck */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  3-Dealer Consensus Forecast
                </span>
                <span className="text-[10px] font-mono text-blue-400">Forward Estimates</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                <div className="p-2 rounded-xl bg-slate-900 border border-blue-500/30">
                  <span className="text-[9px] text-blue-400 font-bold block">Alpha (Quant)</span>
                  <div className="text-white font-bold text-xs mt-1">EPS: ${consensus.alpha.eps}</div>
                  <div className="text-slate-400 text-[9px]">Rev: {formatCurrency(consensus.alpha.revenue, { compact: true })}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-900 border border-emerald-500/30">
                  <span className="text-[9px] text-emerald-400 font-bold block">Beta (Macro)</span>
                  <div className="text-white font-bold text-xs mt-1">EPS: ${consensus.beta.eps}</div>
                  <div className="text-slate-400 text-[9px]">Rev: {formatCurrency(consensus.beta.revenue, { compact: true })}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-900 border border-purple-500/30">
                  <span className="text-[9px] text-purple-400 font-bold block">Gamma (Flow)</span>
                  <div className="text-white font-bold text-xs mt-1">EPS: ${consensus.gamma.eps}</div>
                  <div className="text-slate-400 text-[9px]">Rev: {formatCurrency(consensus.gamma.revenue, { compact: true })}</div>
                </div>
              </div>

              <div className="p-2 bg-slate-900/90 rounded-lg flex items-center justify-between text-xs font-mono border border-slate-800">
                <span className="text-slate-400 font-sans font-medium">Consensus Average:</span>
                <span className="font-bold text-white">
                  EPS ${consensus.consensusEps} • Rev {formatCurrency(consensus.consensusRevenue, { compact: true })}
                </span>
              </div>
            </div>
          </div>
          );
        })()}

        {/* CAPITAL STRUCTURE DECK */}
        {activeTab === 'CAPITAL_STRUCTURE' && (
          <div className="space-y-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Multi-Asset Capital Structure Deck
            </span>

            {/* 1. Common Equity */}
            <div
              onClick={() => {
                onClose();
                onOpenTrade({
                  assetType: 'EQUITY',
                  id: company.id,
                  symbol: company.ticker,
                  name: company.name,
                  region: company.region,
                  price: company.stockPrice,
                  quoteUnit: 'USD',
                  details: {
                    sector: company.sector,
                    rating: company.creditRating,
                    dividendYield: company.dividendYield,
                    beta: company.beta,
                  },
                });
              }}
              className="p-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-white">Common Equity</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                    Beta: {company.beta}x
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Price: {formatStockPrice(company.stockPrice)} • P/E: {company.forwardPE}x
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold font-mono text-blue-400">Trade Equity</span>
                <div className="text-[9px] text-slate-500">1.0x-5.0x Margin</div>
              </div>
            </div>

{/* Capital structure summary */}
            <CapitalStructureBar tranches={company.debtTranches || []} currentWeek={currentWeek} />

            {/* Debt Tranches — one row per real tranche */}
            {company.debtTranches?.map((tranche) => {
              const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - currentWeek) / 52);
              const isFixed = tranche.rateType === 'FIXED';
              const rateDesc = isFixed ? `${((tranche.couponRate ?? 0) * 100).toFixed(1)}% Fixed` : `Floating +${tranche.floatingMarginBps}bps`;
              return (
                <div
                  key={tranche.id}
                  onClick={() => {
                    onClose();
                    onOpenTrade({
                      assetType: isFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
                      id: tranche.id, symbol: tranche.id,
                      name: `${company.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
                      region: company.region,
                      price: company.isDefaulted ? (isFixed ? company.recoveryRate * 100 : 65.0) : 100,
                      quoteUnit: isFixed ? '% Par' : 'pts of par',
                      details: { trancheId: tranche.id, tenorYears: remainingTenorYears, fixedRate: tranche.couponRate ?? 0, rateType: tranche.rateType, oasSpreadBps: company.oasSpreadBps, rating: company.creditRating, sector: company.sector },
                    });
                  }}
                  className="p-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs text-white">{remainingTenorYears.toFixed(1)}Y {rateDesc}</span>
                    <div className="text-[10px] text-slate-400 font-mono">due wk {tranche.maturityWeek}</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold font-mono ${isFixed ? 'text-indigo-400' : 'text-amber-400'}`}>Trade {isFixed ? 'Bond' : 'Loan'}</span>
                    <div className="text-[9px] text-slate-500">{isFixed ? '15x' : '10x'} PB Lev</div>
                  </div>
                </div>
              );
            })}
            {/* 4. 5Y Credit Default Swap (CDS) */}
            <div
              onClick={() => {
                onClose();
                onOpenTrade({
                  assetType: 'CDS',
                  id: `${company.id}_CDS`,
                  symbol: `${company.ticker}-CDS`,
                  name: `${company.name} 5Y Senior CDS`,
                  region: company.region,
                  price: company.cdsSpreadBps,
                  quoteUnit: 'bps/yr',
                  details: {
                    sector: company.sector,
                    rating: company.creditRating,
                    tenorYears: 5,
                    cdsSpreadBps: company.cdsSpreadBps,
                  },
                });
              }}
              className="p-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-white">5Y Credit Default Swap (CDS)</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono">
                    {formatBps(company.cdsSpreadBps)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">Buy / Sell Default Protection • Recovery: {formatPercent(company.recoveryRate, { isDecimal: true })}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold font-mono text-rose-400">Trade CDS</span>
                <div className="text-[9px] text-slate-500">20x PB Lev</div>
              </div>
            </div>
          </div>
        )}

        {/* QUARTERLY STATEMENTS TAB */}
        {activeTab === 'HISTORY_STATEMENTS' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Quarterly Financial Statement History
                </h4>
              </div>
              <span className="text-[9px] text-slate-400 font-mono">Filing Progression</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-right">
                    <th className="text-left py-1 font-semibold">Metric</th>
                    {fundamentals.slice(-4).map((f, i) => (
                      <th key={i} className="py-1 font-semibold text-slate-300">
                        {f.filingPeriod || `Q${(i % 4) + 1} '25`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-200">
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Revenue</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-bold text-white">${(f.annualRevenue / 4).toFixed(0)}M</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">EBITDA</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-emerald-400">${(f.ebitda / 4).toFixed(1)}M</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Net Income</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1">${(f.netIncome / 4).toFixed(1)}M</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Total Debt</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-amber-400">${f.totalDebt.toFixed(0)}M</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Leverage</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-semibold">{f.leverage.toFixed(2)}x</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Coverage</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-emerald-400">{f.interestCoverage.toFixed(1)}x</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-1 text-slate-400 font-sans text-left">Rating</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-bold text-blue-300">{f.creditRating}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
