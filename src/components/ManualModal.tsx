import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  DollarSign,
  FileText,
  Flame,
  Globe,
  HelpCircle,
  Landmark,
  Layers,
  Percent,
  Shield,
  Sparkles,
  Thermometer,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';

interface ManualModalProps {
  onClose: () => void;
}

export const ManualModal: React.FC<ManualModalProps> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<'MACRO' | 'DERIVATIVES' | 'CARRY_MARGIN' | 'DEALERS'>('MACRO');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Quant Trading Desk Manual</h3>
              <p className="text-[10px] text-slate-400">Institutional Market Mechanics & Reference Guide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-bold">
          <button
            onClick={() => setActiveSection('MACRO')}
            className={`py-1.5 rounded-lg transition-all ${
              activeSection === 'MACRO' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Macro & Rates
          </button>
          <button
            onClick={() => setActiveSection('DERIVATIVES')}
            className={`py-1.5 rounded-lg transition-all ${
              activeSection === 'DERIVATIVES' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Derivatives
          </button>
          <button
            onClick={() => setActiveSection('CARRY_MARGIN')}
            className={`py-1.5 rounded-lg transition-all ${
              activeSection === 'CARRY_MARGIN' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Carry & PB
          </button>
          <button
            onClick={() => setActiveSection('DEALERS')}
            className={`py-1.5 rounded-lg transition-all ${
              activeSection === 'DEALERS' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Axes & Flow
          </button>
        </div>

        {/* 1. Macro & Rates Section */}
        {activeSection === 'MACRO' && (
          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-blue-400" />
                Taylor Rule & Central Bank Reaction Function
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Central banks adjust their policy rate according to inflation and output gaps:
              </p>
              <div className="p-2 rounded bg-slate-900 font-mono text-[10px] text-emerald-400 border border-slate-800">
                r_t = r* + π_t + 0.5(π_t - π*) + 0.5(y_t - y*)
              </div>
              <p className="text-[10px] text-slate-400">
                When inflation exceeds target (2.0%), policy rates hike, causing short rates to rise and curve inversion.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
                Weather & Climate Transmission Channels
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Climate anomalies directly transmit to commodity prices and headline inflation:
              </p>
              <ul className="list-disc list-inside text-[10px] text-slate-400 space-y-1">
                <li><strong className="text-slate-200">Drought:</strong> Disrupts copper smelting & agriculture supply (shocks Wheat, Soybeans, Copper).</li>
                <li><strong className="text-slate-200">Polar Vortex:</strong> Surges residential heating demand, spiking Natural Gas futures (+15%).</li>
                <li><strong className="text-slate-200">Heatwave:</strong> Strains electric grids and cooling capacity.</li>
              </ul>
            </div>
          </div>
        )}

        {/* 2. Derivatives Section */}
        {activeSection === 'DERIVATIVES' && (
          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-indigo-400" />
                Interest Rate Swaps (IRS) & DV01
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong>Payer Swap (Pay Fixed):</strong> Profits when sovereign rates and inflation expectations rise.
                <br />
                <strong>Receiver Swap (Receive Fixed):</strong> Profits when central banks ease and rates drop.
              </p>
              <div className="p-1.5 rounded bg-slate-900 font-mono text-[10px] text-indigo-300">
                PnL = DV01 × ΔRate (bps) × Direction
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                Credit Default Swaps (CDS) & Basis Trading
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong>Buy Protection:</strong> Short credit risk. PnL surges if company is downgraded or enters distress.
                <br />
                <strong>Sell Protection:</strong> Long credit risk. Collect quarterly premium (positive carry).
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                Options Black-Scholes Greeks
              </h4>
              <ul className="text-[10px] text-slate-400 space-y-1 font-mono">
                <li><strong className="text-blue-400">Delta (Δ):</strong> Spot exposure ($ per $1 move in underlying).</li>
                <li><strong className="text-emerald-400">Gamma (Γ):</strong> Rate of change of delta (acceleration).</li>
                <li><strong className="text-purple-400">Vega (ν):</strong> PnL sensitivity to 1% shift in implied volatility.</li>
                <li><strong className="text-rose-400">Theta (θ):</strong> Weekly calendar time-decay cost.</li>
              </ul>
            </div>
          </div>
        )}

        {/* 3. Carry & Margin Section */}
        {activeSection === 'CARRY_MARGIN' && (
          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                1-Week Net Carry Mechanics
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Carry is the expected PnL earned assuming market prices and rates remain unchanged over 1 week:
              </p>
              <div className="p-2 rounded bg-slate-900 font-mono text-[10px] text-emerald-400 border border-slate-800">
                Weekly Carry = (Income Leg - Financing Leg) × (7 / 365)
              </div>
              <p className="text-[10px] text-slate-400">
                Positive carry trades steadily compound your fund's NAV each weekly step.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Unified Prime Broker Initial Margin
              </h4>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300 mt-1">
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Sovereign Bonds</span>
                  <span className="font-bold text-emerald-400">4% IM (25x)</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Interest Rate Swaps</span>
                  <span className="font-bold text-emerald-400">5% IM (20x)</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Corporate Bonds / CDS</span>
                  <span className="font-bold text-blue-400">10% IM (10x)</span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Equities & Options</span>
                  <span className="font-bold text-amber-400">20% IM (5x)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Dealer Axes Section */}
        {activeSection === 'DEALERS' && (
          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Counterparty Inventory Axes & Flow
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Dealers quote tighter bid-ask spreads when executing trades that match their desired inventory rebalancing:
              </p>

              <div className="space-y-1.5 mt-2">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="font-bold text-white block text-[11px]">Dealer Alpha (Credit/Rates Specialist)</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Offers <strong className="text-emerald-400">-50% spread discounts</strong> on Corporate Bonds, CDS, and Sovereign Rates.
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="font-bold text-white block text-[11px]">Dealer Beta (FX & Energy Specialist)</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Best liquidity and <strong className="text-emerald-400">-50% spread discounts</strong> on Cross-Currency Basis Swaps and Commodities.
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="font-bold text-white block text-[11px]">Dealer Gamma (Equities & Volatility Specialist)</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Tightest spreads and <strong className="text-emerald-400">-50% discounts</strong> on Single-Stock Options and Equity cash baskets.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/40 transition-all"
        >
          Return to Trading Desk
        </button>
      </div>
    </div>
  );
};
