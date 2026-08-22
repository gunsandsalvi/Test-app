import React, { useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  ChevronRight,
  Coins,
  Cpu,
  Flame,
  Globe,
  Layers,
  Percent,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { GameState, RegionId, TradeableInstrument } from '../types';
import { calculateParSwapRate } from '../engine/pricing';
import { calculateBlackScholesGreeks } from '../engine/blackScholes';

interface DerivativesTabProps {
  state: GameState;
  onOpenTrade: (instrument: TradeableInstrument) => void;
}

export const DerivativesTab: React.FC<DerivativesTabProps> = ({
  state,
  onOpenTrade,
}) => {
  const [subTab, setSubTab] = useState<'IRS' | 'TRS' | 'XCS' | 'OPTIONS'>('IRS');
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('USA');
  const [selectedOptionTicker, setSelectedOptionTicker] = useState<string>('NVST');

  const region = state.regions[selectedRegion];
  const irsTenors = [
    { label: '2Y', years: 2 },
    { label: '5Y', years: 5 },
    { label: '10Y', years: 10 },
    { label: '30Y', years: 30 },
  ];

  // Options chain calculation for selected stock
  const selectedCompany = state.companies.find((c) => c.ticker === selectedOptionTicker) || state.companies[0];
  const spotS = selectedCompany.stockPrice;
  const rf = state.regions[selectedCompany.region].policyRate;
  const marketVol = state.marketVolPremium || 0;
  const vol = 0.30 + marketVol;
  const expiryWeek = state.currentWeek + 8; // 8 weeks (~2 months)
  const timeToExpiryYears = 8 / 52;

  const strikes = [
    Number((spotS * 0.90).toFixed(1)),
    Number((spotS * 0.95).toFixed(1)),
    Number((spotS * 1.00).toFixed(1)),
    Number((spotS * 1.05).toFixed(1)),
    Number((spotS * 1.10).toFixed(1)),
  ];

  return (
    <div className="space-y-3 pb-20">
      {/* Sub-tab navigation */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-bold">
        <button
          onClick={() => setSubTab('IRS')}
          className={`py-1.5 rounded-lg transition-all ${
            subTab === 'IRS' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          IRS Swaps
        </button>
        <button
          onClick={() => setSubTab('TRS')}
          className={`py-1.5 rounded-lg transition-all ${
            subTab === 'TRS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          TRS Equity
        </button>
        <button
          onClick={() => setSubTab('XCS')}
          className={`py-1.5 rounded-lg transition-all ${
            subTab === 'XCS' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          XCS Basis
        </button>
        <button
          onClick={() => setSubTab('OPTIONS')}
          className={`py-1.5 rounded-lg transition-all ${
            subTab === 'OPTIONS' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Options BSM
        </button>
      </div>

      {/* 1. Interest Rate Swaps (IRS) */}
      {subTab === 'IRS' && (
        <div className="space-y-3">
          {/* Region selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
            {(['USA', 'UK', 'EUR', 'JPN'] as RegionId[]).map((rId) => (
              <button
                key={rId}
                onClick={() => setSelectedRegion(rId)}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  selectedRegion === rId ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                {rId} ({state.regions[rId].currency})
              </button>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">{selectedRegion} Fixed-for-Floating IRS Ladder</h3>
                <p className="text-[10px] text-slate-400">Par swap rates discounted on Nelson-Siegel zero curve</p>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">
                Floating = Policy Rate
              </span>
            </div>

            <div className="space-y-2 mt-2">
              {irsTenors.map((t) => {
                const { parRate, dv01PerMillion } = calculateParSwapRate(t.years, region.yieldCurveParams);
                return (
                  <div
                    key={t.label}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{selectedRegion} {t.label} Par IRS</span>
                        <span className="text-[9px] text-slate-500 font-mono">Annually settled</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                        <span>Par Rate: <strong className="text-blue-400 font-bold">{(parRate * 100).toFixed(3)}%</strong></span>
                        <span>DV01: <strong className="text-slate-300">${dv01PerMillion.toFixed(0)}/1M</strong></span>
                      </div>
                    </div>

                    <button
                      id={`btn-trade-irs-${selectedRegion}-${t.label}`}
                      onClick={() =>
                        onOpenTrade({
                          assetType: 'IRS',
                          id: `${selectedRegion}_IRS_${t.label}`,
                          symbol: `${selectedRegion}_IRS_${t.label}`,
                          name: `${selectedRegion} ${t.label} Fixed/Float IRS`,
                          region: selectedRegion,
                          price: parRate,
                          quoteUnit: '% Fixed Rate',
                          details: {
                            tenorYears: t.years,
                            couponRate: parRate,
                          },
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all"
                    >
                      Trade Swap
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Total Return Swaps (TRS) */}
      {subTab === 'TRS' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">Total Return Swaps (Equity TRS)</h3>
                <p className="text-[10px] text-slate-400">Receive 100% stock total return vs paying Policy Rate + 75 bps financing</p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              {state.companies.slice(0, 8).map((comp) => {
                const financingRate = state.regions[comp.region].policyRate + 0.0075;
                return (
                  <div
                    key={comp.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{comp.ticker} TRS Contract</span>
                        <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-mono">{comp.region}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        Stock Price: <span className="text-white font-bold">${comp.stockPrice.toFixed(2)}</span> • Financing: <span className="text-amber-400 font-semibold">{(financingRate * 100).toFixed(2)}%</span>
                      </div>
                    </div>

                    <button
                      id={`btn-trade-trs-${comp.ticker}`}
                      onClick={() =>
                        onOpenTrade({
                          assetType: 'TRS',
                          id: `${comp.id}_TRS`,
                          symbol: comp.ticker,
                          name: `${comp.name} Equity TRS`,
                          region: comp.region,
                          price: comp.stockPrice,
                          quoteUnit: 'USD',
                          details: {
                            sector: comp.sector,
                            couponRate: financingRate,
                          },
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all"
                    >
                      Trade TRS
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Cross-Currency Basis Swaps (XCS) */}
      {subTab === 'XCS' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">Cross-Currency Basis Swaps (XCS)</h3>
                <p className="text-[10px] text-slate-400">Trade USD liquidity premia and inter-bank FX basis spreads</p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              {state.fxPairs.map((fx) => (
                <div
                  key={fx.pair}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{fx.pair} 5Y Basis Swap</span>
                      <span className="text-[10px] font-mono text-slate-400">Spot: {fx.rate.toFixed(4)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono">
                      Current Basis: <span className="text-amber-400 font-bold">{fx.basisSpreadBps} bps</span>
                    </div>
                  </div>

                  <button
                    id={`btn-trade-xcs-${fx.pair.replace('/', '-')}`}
                    onClick={() =>
                      onOpenTrade({
                        assetType: 'XCS',
                        id: `XCS_${fx.pair}`,
                        symbol: fx.pair,
                        name: `${fx.pair} Cross-Currency Basis Swap`,
                        region: fx.base,
                        price: fx.basisSpreadBps,
                        quoteUnit: 'bps Basis',
                        details: {
                          tenorYears: 5,
                        },
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all"
                  >
                    Trade Basis
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Options Chains with Analytical BSM Greeks */}
      {subTab === 'OPTIONS' && (
        <div className="space-y-3">
          {/* Stock picker for options */}
          <div className="flex items-center justify-between p-2 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-300 font-medium">Underlying Stock:</span>
            <select
              value={selectedOptionTicker}
              onChange={(e) => setSelectedOptionTicker(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-2 py-1 focus:outline-none"
            >
              {state.companies.map((c) => (
                <option key={c.ticker} value={c.ticker}>
                  {c.ticker} - {c.name.slice(0, 20)} (${c.stockPrice.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">{selectedOptionTicker} 8-Week Options Chain</h3>
                <p className="text-[10px] text-slate-400">
                  Spot: ${spotS.toFixed(2)} • Vol: {(vol * 100).toFixed(1)}% {marketVol > 0 ? `(Market Vol Premium: +${(marketVol * 100).toFixed(1)}%)` : ''} • Risk-Free: {(rf * 100).toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              {strikes.map((strike) => {
                const callBsm = calculateBlackScholesGreeks(spotS, strike, timeToExpiryYears, rf, vol, 'CALL');
                const putBsm = calculateBlackScholesGreeks(spotS, strike, timeToExpiryYears, rf, vol, 'PUT');

                return (
                  <div
                    key={strike}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px]"
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-slate-900">
                      <span className="font-mono font-extrabold text-xs text-amber-300">
                        STRIKE ${strike.toFixed(1)}
                      </span>
                      <span className="text-slate-500 font-mono text-[9px]">
                        {strike === spotS ? 'ATM' : strike < spotS ? 'ITM Call / OTM Put' : 'OTM Call / ITM Put'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {/* Call option */}
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 font-bold text-[11px]">CALL</span>
                          <span className="font-mono font-extrabold text-white text-xs">
                            ${callBsm.price.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono mt-1">
                          Δ: {callBsm.delta.toFixed(2)} • Γ: {callBsm.gamma.toFixed(3)} • ν: ${callBsm.vega.toFixed(2)}
                        </div>
                        <button
                          onClick={() =>
                            onOpenTrade({
                              assetType: 'OPTION',
                              id: `${selectedCompany.id}_CALL_${strike}`,
                              symbol: `${selectedOptionTicker} C${strike}`,
                              name: `${selectedCompany.name} Call $${strike}`,
                              region: selectedCompany.region,
                              price: callBsm.price,
                              quoteUnit: 'Premium/sh',
                              details: {
                                strike,
                                optionType: 'CALL',
                                impliedVol: vol,
                                delta: callBsm.delta,
                                gamma: callBsm.gamma,
                                vega: callBsm.vega,
                              },
                            })
                          }
                          className="mt-1.5 w-full py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-[9px] transition-all"
                        >
                          Trade Call
                        </button>
                      </div>

                      {/* Put option */}
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-rose-400 font-bold text-[11px]">PUT</span>
                          <span className="font-mono font-extrabold text-white text-xs">
                            ${putBsm.price.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono mt-1">
                          Δ: {putBsm.delta.toFixed(2)} • Γ: {putBsm.gamma.toFixed(3)} • ν: ${putBsm.vega.toFixed(2)}
                        </div>
                        <button
                          onClick={() =>
                            onOpenTrade({
                              assetType: 'OPTION',
                              id: `${selectedCompany.id}_PUT_${strike}`,
                              symbol: `${selectedOptionTicker} P${strike}`,
                              name: `${selectedCompany.name} Put $${strike}`,
                              region: selectedCompany.region,
                              price: putBsm.price,
                              quoteUnit: 'Premium/sh',
                              details: {
                                strike,
                                optionType: 'PUT',
                                impliedVol: vol,
                                delta: putBsm.delta,
                                gamma: putBsm.gamma,
                                vega: putBsm.vega,
                              },
                            })
                          }
                          className="mt-1.5 w-full py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-[9px] transition-all"
                        >
                          Trade Put
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
