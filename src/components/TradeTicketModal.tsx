import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Percent,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { GameState, Position, TradeableInstrument, Region } from '../types';
import { calculateDynamicSpreadBps, getUnifiedInitialMarginRate } from '../engine/dealers';
import { calculateExpectedCarry } from '../engine/carryCalculator';
import { calculateBlackScholesGreeks } from '../engine/blackScholes';
import { calculateNelsonSiegelZeroRate } from '../engine/nelsonSiegel';
import { formatCurrency as formatCurrencyCentral, formatPercent } from '../engine/formatters';

interface TradeTicketModalProps {
  instrument: TradeableInstrument;
  state: GameState;
  onClose: () => void;
  onExecuteTrade: (position: Omit<Position, 'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'>, executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }) => void;
}

export const TradeTicketModal: React.FC<TradeTicketModalProps> = ({
  instrument,
  state,
  onClose,
  onExecuteTrade,
}) => {
  const [selectedDealerId, setSelectedDealerId] = useState<string>('alpha');
  const [notionalUSD, setNotionalUSD] = useState<number>(1_000_000); // Default $1M
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');

  const [showAdvanced, setShowAdvanced] = useState(false);

  const dealer = state.dealers.find((d) => d.id === selectedDealerId) || state.dealers[0];
  const region = state.regions[instrument.region];
  const policyRate = region?.policyRate ?? 0.0475;

  // Calculate dynamic spread & axe discount
  const { spreadBps, hasAxeDiscount, originalSpreadBps } = useMemo(() => {
    return calculateDynamicSpreadBps(dealer, instrument.assetType, notionalUSD, 0.20);
  }, [dealer, instrument.assetType, notionalUSD]);

  // Transaction spread cost
  const spreadCostUSD = (notionalUSD * spreadBps) / 10000;

  // Unified PB margin requirement
  const initialMarginRate = getUnifiedInitialMarginRate(instrument.assetType);
  const initialMarginUSD = useMemo(() => {
    if (instrument.assetType === 'OPTION') {
      return direction === 'BUY'
        ? (notionalUSD / Math.max(0.1, instrument.price)) * instrument.price
        : notionalUSD * 0.20;
    }
    return notionalUSD * initialMarginRate;
  }, [instrument.assetType, notionalUSD, initialMarginRate, instrument.price, direction]);

  const freeCashUSD = state.portfolio.cashUSD - state.portfolio.totalRequiredMarginUSD;
  const hasCash = freeCashUSD >= initialMarginUSD + spreadCostUSD;
  
  const dealerExposure = state.portfolio.positions
    .filter(p => p.dealerId === dealer.id)
    .reduce((sum, p) => sum + p.notional, 0);
  const hasDealerLimit = (dealerExposure + notionalUSD) <= dealer.creditLimitUSD;
  
  const canAfford = hasCash && hasDealerLimit && !state.portfolio.isMarginCall;

  // Compute Expected 1-Week Carry
  const carryEstimate = useMemo(() => {
    let thetaPerContract: number | undefined;
    if (instrument.assetType === 'OPTION') {
      const weeksToExpiry = instrument.details.expiryWeek !== undefined
        ? Math.max(1, instrument.details.expiryWeek - state.currentWeek)
        : 8; // the dealer's standard listed-contract tenor when the ticket carries none
      const greeks = calculateBlackScholesGreeks(
        instrument.details.strike || instrument.price,
        instrument.details.strike || instrument.price,
        weeksToExpiry / 52,
        policyRate,
        instrument.details.impliedVol || 0.3,
        instrument.details.optionType || 'CALL'
      );
      thetaPerContract = (greeks.theta * 7) / 365;
    }

    return calculateExpectedCarry(
      instrument.assetType,
      direction === 'BUY'
        ? (instrument.assetType === 'IRS' ? 'PAY_FIXED' : instrument.assetType === 'CDS' ? 'BUY_PROTECTION' : 'BUY')
        : (instrument.assetType === 'IRS' ? 'RECEIVE_FIXED' : instrument.assetType === 'CDS' ? 'SELL_PROTECTION' : 'SELL'),
      notionalUSD,
      {
        policyRate,
        couponRate: instrument.details.couponRate,
        dividendYield: instrument.details.dividendYield,
        convenienceYield: instrument.details.convenienceYield,
        cdsSpreadBps: instrument.details.cdsSpreadBps || instrument.price,
        fixedRate: instrument.details.couponRate || instrument.price,
        floatingRate: policyRate,
        thetaPerContractUSD: thetaPerContract,
        quantity: notionalUSD / Math.max(1, instrument.price),
      }
    );
  }, [instrument, direction, notionalUSD, policyRate]);

  // Payoff simulation data points (-10% to +10%)
  const payoffScenarios = useMemo(() => {
    const scenarios = [-0.10, -0.05, 0, +0.05, +0.10];
    const isLong = direction === 'BUY';

    return scenarios.map((pct) => {
      let estPnLUSD = 0;

      if (instrument.assetType === 'OPTION') {
        const S0 = instrument.details.strike || instrument.price;
        const S_shock = S0 * (1 + pct);
        const K = instrument.details.strike || instrument.price;
        const isCall = instrument.details.optionType === 'CALL';
        const intrinsic = isCall ? Math.max(0, S_shock - K) : Math.max(0, K - S_shock);
        const contracts = notionalUSD / Math.max(1, instrument.price);
        const payoffAtExpiry = isLong
          ? (intrinsic - instrument.price) * contracts
          : (instrument.price - intrinsic) * contracts;
        estPnLUSD = payoffAtExpiry;
      } else if (instrument.assetType === 'IRS') {
        // §6: the scenario grid for rates products is in BASIS POINTS (pct 0.10 → 10bp), and
        // the label below now says so — it used to print "±10%" while computing ±10bp.
        const bpsMove = pct * 100;
        const dv01 = (notionalUSD * 4.5) / 10000; // ~4.5 duration for 5Y swap
        estPnLUSD = isLong ? bpsMove * dv01 : -bpsMove * dv01;
      } else if (instrument.assetType === 'CDS') {
        // Spread move
        const spreadMove = pct * 100;
        const spreadDv01 = (notionalUSD * 4.0) / 10000;
        estPnLUSD = isLong ? spreadMove * spreadDv01 : -spreadMove * spreadDv01;
      } else {
        // Delta one asset
        estPnLUSD = isLong ? notionalUSD * pct : -notionalUSD * pct;
      }

      return {
        label: (instrument.assetType === 'IRS' || instrument.assetType === 'CDS')
          ? `${pct >= 0 ? '+' : ''}${Math.round(pct * 100)}bp`
          : formatPercent(pct, { isDecimal: true, showSign: true, precision: 0 }),
        pnlUSD: estPnLUSD,
      };
    });
  }, [instrument, direction, notionalUSD]);

  // Direction labels
  const getDirectionLabels = () => {
    switch (instrument.assetType) {
      case 'IRS':
        return { buy: 'Pay Fixed (Rates Up)', sell: 'Receive Fixed (Rates Down)' };
      case 'CDS':
        return { buy: 'Buy Protection (Short Credit)', sell: 'Sell Protection (Long Credit)' };
      case 'XCS':
        return { buy: 'Pay Foreign / Rec USD', sell: 'Pay USD / Rec Foreign' };
      case 'OPTION':
        return { buy: 'Buy Option (Long Vol)', sell: 'Sell Option (Short Vol)' };
      default:
        return { buy: 'Buy / Long', sell: 'Sell / Short' };
    }
  };

  const labels = getDirectionLabels();

  
  // S9: the fill comes off the real DEALER INVENTORY the clearing engines maintain — the desk's
  // actual axe in this instrument — not the sector itemizedHoldings, which are a derived view
  // (S7) rebuilt from the real books every week and therefore not a position anyone can trade
  // against. The side matters: a buyer lifts the offer, a seller hits the bid. The previous
  // version marked the fill UP for both, so a round trip lost the spread twice.
  const resolveCounterpartyFill = (instrument: any, quantityUSD: number, region: Region, spreadCostUSD: number, isBuy: boolean) => {
    const instrumentKey = instrument.details?.trancheId ?? instrument.id ?? instrument.symbol;
    const deskBooks = [
      ...(region.bankingSector.corpBondDealerInventory ?? []),
      ...(region.bankingSector.loanDealerInventory ?? []),
    ];
    const deskInventoryUSD = deskBooks
      .filter((p: any) => p.companyId === instrumentKey || p.companyId === instrument.id || p.companyId === instrument.symbol)
      .reduce((s: number, p: any) => s + Math.max(0, p.inventoryUSD), 0);
    const sideSign = isBuy ? 1 : -1;
    if (deskInventoryUSD >= quantityUSD) {
      // The desk has the axe: it fills from its own book at the quoted side, no sourcing fee.
      return { fillPrice: instrument.price, counterpartyFeeUSD: 0, sourcedFrom: 'Dealer inventory', spreadCostUSD };
    }
    // The desk must go find the paper (or place it), and charges for the intermediation.
    const shortfallUSD = quantityUSD - deskInventoryUSD;
    const intermediationFeeRate = 0.0015;
    return {
      fillPrice: instrument.price * (1 + sideSign * intermediationFeeRate),
      counterpartyFeeUSD: shortfallUSD * intermediationFeeRate,
      sourcedFrom: 'Dealer intermediated (sourced externally)',
      spreadCostUSD,
    };
  };

  const executionDetails = useMemo(() => resolveCounterpartyFill(instrument, notionalUSD, region, spreadCostUSD, direction === 'BUY'), [instrument, notionalUSD, region, spreadCostUSD, direction]);

  const handleConfirm = () => {
    if (!canAfford) return;

    let tradeDirection: Position['direction'] = 'LONG';
    if (instrument.assetType === 'IRS') {
      tradeDirection = direction === 'BUY' ? 'PAY_FIXED' : 'RECEIVE_FIXED';
    } else if (instrument.assetType === 'CDS') {
      tradeDirection = direction === 'BUY' ? 'BUY_PROTECTION' : 'SELL_PROTECTION';
    } else {
      tradeDirection = direction === 'BUY' ? 'LONG' : 'SHORT';
    }

    const quantity =
      instrument.assetType === 'EQUITY' || instrument.assetType === 'COMMODITY' || instrument.assetType === 'OPTION'
        ? notionalUSD / Math.max(0.01, instrument.price)
        : notionalUSD;

    onExecuteTrade({
      assetType: instrument.assetType,
      symbol: instrument.symbol,
      name: instrument.name,
      region: instrument.region,
      dealerId: selectedDealerId,
      direction: tradeDirection,
      quantity,
      entryPrice: executionDetails.fillPrice,
      currentPrice: executionDetails.fillPrice,
      notional: notionalUSD,
      marginRequirement: initialMarginUSD,
      expectedWeeklyCarryUSD: carryEstimate.weeklyCarryUSD,
      tenorYears: instrument.details.tenorYears,
      maturityWeek: instrument.details.tenorYears ? state.currentWeek + Math.round(instrument.details.tenorYears * 52) : undefined,
      fixedRate: instrument.details.fixedRate ?? instrument.details.couponRate,
      trancheId: instrument.details.trancheId,
      rateType: instrument.details.rateType,
      entryOasSpreadBps: instrument.details.oasSpreadBps,
      entryPolicyRate: state.regions[instrument.region]?.policyRate,
      entryBenchmarkYield: instrument.details.tenorYears && state.regions[instrument.region]?.yieldCurveParams
        ? calculateNelsonSiegelZeroRate(instrument.details.tenorYears, state.regions[instrument.region].yieldCurveParams)
        : undefined,
      strike: instrument.details.strike,
      optionType: instrument.details.optionType,
      expiryWeek: instrument.details.expiryWeek ?? (state.currentWeek + 8),
      impliedVol: instrument.details.impliedVol,
      delta: instrument.details.delta,
      gamma: instrument.details.gamma,
      vega: instrument.details.vega,
    }, executionDetails);
  };

  const formatCurrency = (val: number) => {
    return formatCurrencyCentral(val, { compact: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 space-y-3.5 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold font-mono text-base text-white">{instrument.symbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                {instrument.assetType}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                {instrument.region}
              </span>
            </div>
            <h3 className="text-xs text-slate-300 mt-0.5">{instrument.name}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicative Execution Quote */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">Indicative Market Quote</span>
            <span className="text-[10px] text-slate-500 font-mono">Reference pricing engine</span>
          </div>
          <div className="text-right">
            <span className="text-sm font-extrabold font-mono text-white">
              {instrument.assetType === 'IRS'
                ? `${(instrument.price * 100).toFixed(3)}% Par`
                : instrument.assetType === 'CDS'
                ? `${instrument.price} bps`
                : `$${instrument.price.toFixed(2)}`}
            </span>
            <span className="text-[9px] text-slate-400 block font-mono">{instrument.quoteUnit}</span>
          </div>
        </div>

        {/* Trade Direction Selection */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection('BUY')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              direction === 'BUY'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{labels.buy}</span>
          </button>

          <button
            onClick={() => setDirection('SELL')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              direction === 'SELL'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40 ring-1 ring-rose-400'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>{labels.sell}</span>
          </button>
        </div>

        {/* Order Size / Notional */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Order Notional:</span>
            <span className="font-extrabold font-mono text-white text-sm">
              {formatCurrency(notionalUSD)}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {[250_000, 500_000, 1_000_000, 5_000_000, 10_000_000].map((amt) => (
              <button
                key={amt}
                onClick={() => setNotionalUSD(amt)}
                className={`py-1 rounded-lg text-[10px] font-bold font-mono transition-all ${
                  notionalUSD === amt
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {formatCurrency(amt)}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={100_000}
            max={25_000_000}
            step={100_000}
            value={notionalUSD}
            onChange={(e) => setNotionalUSD(Number(e.target.value))}
            className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Expected 1-Week Carry Calculator Module */}
        <div
          className={`p-2.5 rounded-xl border transition-colors ${
            carryEstimate.weeklyCarryUSD >= 0
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-rose-950/20 border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-200">Expected 1-Week Carry</span>
            </div>
            <div className="text-right font-mono">
              <span
                className={`text-xs font-extrabold ${
                  carryEstimate.weeklyCarryUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {carryEstimate.weeklyCarryUSD >= 0 ? '+' : ''}
                {formatCurrency(carryEstimate.weeklyCarryUSD)}/wk
              </span>
              <span className="text-[9px] text-slate-400 block">
                ({carryEstimate.annualizedCarryPct >= 0 ? '+' : ''}
                {carryEstimate.annualizedCarryPct.toFixed(2)}% p.a.)
              </span>
            </div>
          </div>
          <div className="text-[9px] text-slate-400 mt-1 font-mono flex items-center justify-between border-t border-slate-800/80 pt-1">
            <span>Carry Flow:</span>
            <span className="text-slate-300 truncate max-w-[240px]">
              {carryEstimate.components.description}
            </span>
          </div>
        </div>

        
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors">
          {showAdvanced ? 'Hide' : 'Show'} advanced (dealer, spread, payoff) <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-3 border-t border-slate-800">
            {/* Dealer Selection Counterparties (With Inventory Axes) */}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Counterparty Dealer & Axe:</span>
            <span className="text-[10px] text-slate-500">Unified PB Margin</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {state.dealers.map((d) => {
              const isSelected = selectedDealerId === d.id;
              const hasAxe = d.axeAssetClasses.includes(instrument.assetType);

              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDealerId(d.id)}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-950/40 text-white ring-1 ring-blue-500'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white truncate">{d.name.split(' ')[0]}</span>
                    {hasAxe && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
                    )}
                  </div>
                  <div className="text-[9px] text-indigo-300 font-mono mt-0.5 truncate font-semibold">
                    {d.axeBadge}
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">
                    {hasAxe ? `-${Math.round(d.axeDiscountPct * 100)}% Spread` : `${d.baseSpreadBps} bps base`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Axe Discount Banner */}
          {hasAxeDiscount && (
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-[10px] text-emerald-300">
              <span className="flex items-center gap-1 font-semibold">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Dealer {dealer.name.split(' ')[0]} Inventory Axe Applied
              </span>
              <span className="font-mono font-bold">
                {spreadBps} bps (was {originalSpreadBps} bps)
              </span>
            </div>
          )}
        </div>

        {/* Visual Payoff & PnL Simulator */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Payoff Scenario Simulator
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Underlying Move vs PnL</span>
          </div>

          <div className="grid grid-cols-5 gap-1 text-center font-mono">
            {payoffScenarios.map((sc, idx) => {
              const isPos = sc.pnlUSD >= 0;
              return (
                <div key={idx} className="p-1 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">{sc.label}</span>
                  <span
                    className={`text-[9px] font-bold block mt-0.5 ${
                      isPos ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPos ? '+' : ''}
                    {formatCurrency(sc.pnlUSD)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Execution Spread:</span>
              <span className="text-amber-400 font-bold">{spreadBps} bps</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Estimated Spread Cost:</span>
              <span className="text-slate-200">${spreadCostUSD.toFixed(0)}</span>
            </div>
          </div>
        </div>
        )}
        
        {/* Always visible margin required */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono mt-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>Estimated Total Cost (Spread):</span>
            <span className="text-slate-200">${spreadCostUSD.toFixed(0)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80">
            <span>Initial Margin Required:</span>
            <span className="text-emerald-400 font-extrabold">{formatCurrency(initialMarginUSD)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Unencumbered Cash:</span>
            {/* §6: the affordability gate uses cash net of required margin — show that number,
                not raw cash that overstates what this ticket can commit. */}
            <span className="text-slate-300">{formatCurrency(freeCashUSD)}</span>
          </div>
        </div>

        {state.portfolio.isMarginCall && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>ACCOUNT IN MARGIN CALL: New risk positions blocked until required maintenance margin is restored.</span>
          </div>
        )}

        {!hasCash && !state.portfolio.isMarginCall && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Insufficient cash for required initial margin + spread cost.</span>
          </div>
        )}
        
        {hasCash && !hasDealerLimit && !state.portfolio.isMarginCall && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Trade exceeds available counterparty credit limit with {dealer.name}.</span>
          </div>
        )}

        
        {/* Execution Sourcing SourcedFrom info */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono mt-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>Execution Source:</span>
            <span className="text-emerald-400">{executionDetails.sourcedFrom}</span>
          </div>
          {executionDetails.counterpartyFeeUSD > 0 && (
            <div className="flex items-center justify-between text-slate-400">
              <span>Intermediation Fee:</span>
              <span className="text-rose-400">-{formatCurrencyCentral(executionDetails.counterpartyFeeUSD)}</span>
            </div>
          )}
        </div>
        
        {/* Execute Button */}

        <button
          id="btn-confirm-trade"
          onClick={handleConfirm}
          disabled={!canAfford}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40 text-white font-extrabold text-xs tracking-wide shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-1.5"
        >
          <Zap className="w-4 h-4" />
          <span>EXECUTE ORDER ({formatCurrency(notionalUSD)})</span>
        </button>
      </div>
    </div>
  );
};
