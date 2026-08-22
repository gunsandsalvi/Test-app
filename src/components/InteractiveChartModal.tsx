import React, { useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  Layers,
  LineChart,
  Maximize2,
  Minimize2,
  Percent,
  Sliders,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatSimulationDate, formatSimulationDateShort, formatStockPrice } from '../engine/formatters';

interface InteractiveChartModalProps {
  data: {
    id: string;
    title: string;
    subtitle?: string;
    currentValue: number;
    unit?: string;
    historicalSeries: number[];
  };
  currentWeek?: number;
  onClose: () => void;
}

export const InteractiveChartModal: React.FC<InteractiveChartModalProps> = ({ data, currentWeek = 1, onClose }) => {
  const [timeRange, setTimeRange] = useState<'13W' | '26W' | '52W' | 'ALL'>('52W');
  const [showSma20, setShowSma20] = useState<boolean>(true);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rawSeries = data?.historicalSeries?.length > 0 ? data.historicalSeries : [data?.currentValue ?? 0];
  const series = rawSeries.map((v) => (typeof v === 'number' && !isNaN(v) ? v : 0));
  const count =
    timeRange === '13W'
      ? 13
      : timeRange === '26W'
      ? 26
      : timeRange === '52W'
      ? 52
      : series.length;

  const displayData = series.slice(-Math.min(series.length, Math.max(1, count)));
  const minVal = displayData.length > 0 ? Math.min(...displayData) : 0;
  const maxVal = displayData.length > 0 ? Math.max(...displayData) : 0;
  const spread = maxVal - minVal || 1;

  // Simple Moving Average (20 period or relative)
  const smaPeriod = Math.min(20, Math.max(3, Math.floor(displayData.length / 2)));
  const smaData: (number | null)[] = displayData.map((val, idx, arr) => {
    if (idx < smaPeriod - 1) return null;
    const windowSlice = arr.slice(idx - smaPeriod + 1, idx + 1);
    const avg = windowSlice.reduce((s, v) => s + v, 0) / smaPeriod;
    return avg;
  });

  const svgWidth = 420;
  const svgHeight = 180;
  const paddingX = 20;
  const paddingY = 24;

  const getCoordinates = (index: number, value: number) => {
    const x = paddingX + (index / Math.max(1, displayData.length - 1)) * (svgWidth - paddingX * 2);
    const y =
      svgHeight - paddingY - ((value - minVal) / spread) * (svgHeight - paddingY * 2);
    return { x, y };
  };

  const linePath = displayData.reduce((acc, val, idx) => {
    const { x, y } = getCoordinates(idx, val);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const areaPath = `${linePath} L ${svgWidth - paddingX} ${svgHeight - paddingY} L ${paddingX} ${
    svgHeight - paddingY
  } Z`;

  // SMA Path
  let smaPath = '';
  let startedSma = false;
  smaData.forEach((val, idx) => {
    if (val === null) return;
    const { x, y } = getCoordinates(idx, val);
    if (!startedSma) {
      smaPath = `M ${x} ${y}`;
      startedSma = true;
    } else {
      smaPath += ` L ${x} ${y}`;
    }
  });

  const activeHoverValue =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayData.length
      ? displayData[hoverIndex]
      : (data?.currentValue ?? displayData[displayData.length - 1] ?? 0);

  const startValue = displayData[0] ?? data?.currentValue ?? 0;
  const changeSinceStart = activeHoverValue - startValue;
  const pctSinceStart = startValue !== 0 ? (changeSinceStart / startValue) * 100 : 0;
  const isPositive = pctSinceStart >= 0;

  // Calculate calendar date for hovered point
  const hoverPointWeek =
    hoverIndex !== null
      ? currentWeek - (displayData.length - 1 - hoverIndex)
      : currentWeek;
  const hoverDateLabel = formatSimulationDate(hoverPointWeek);
  const startDateLabel = formatSimulationDate(currentWeek - (displayData.length - 1));
  const endDateLabel = formatSimulationDate(currentWeek);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 animate-in fade-in font-sans">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-4 sm:p-5 space-y-4 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold font-mono text-base sm:text-lg text-white">
                {data.title}
              </span>
            </div>
            {data.subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{data.subtitle}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Price & Change Display */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
              {data.unit === '$' ? formatCurrency(activeHoverValue) : `${activeHoverValue.toFixed(2)}${data.unit || ''}`}
            </div>
            <div
              className={`flex items-center gap-1 text-xs font-mono font-bold mt-1 ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>
                {isPositive ? '+' : ''}
                {pctSinceStart.toFixed(2)}% ({isPositive ? '+' : ''}
                {changeSinceStart.toFixed(2)})
              </span>
              <span className="text-slate-500 font-normal">in period</span>
            </div>
          </div>

          {/* Time Range Pills (13W, 26W, 52W, ALL) */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono font-bold">
            {(['13W', '26W', '52W', 'ALL'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 rounded-lg transition-all ${
                  timeRange === range
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive SVG Chart Container */}
        <div className="relative bg-slate-950 rounded-2xl p-3 border border-slate-800/80 select-none">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-44 sm:h-52 overflow-visible cursor-crosshair"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = e.clientX - rect.left;
              const normalizedX = (relX / rect.width) * svgWidth;
              const idx = Math.round(
                ((normalizedX - paddingX) / (svgWidth - paddingX * 2)) * (displayData.length - 1)
              );
              if (idx >= 0 && idx < displayData.length) {
                setHoverIndex(idx);
              }
            }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity="0.35" />
                <stop offset="100%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Guidelines */}
            <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={paddingX} y1={svgHeight / 2} x2={svgWidth - paddingX} y2={svgHeight / 2} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={paddingX} y1={svgHeight - paddingY} x2={svgWidth - paddingX} y2={svgHeight - paddingY} stroke="#334155" strokeWidth="1" />

            {/* Area Fill */}
            <path d={areaPath} fill="url(#chartGradient)" />

            {/* Main Price Line */}
            <path
              d={linePath}
              fill="none"
              stroke={isPositive ? '#10b981' : '#f43f5e'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* SMA Line */}
            {showSma20 && smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
            )}

            {/* Hover Cursor Vertical Line and Indicator Dot */}
            {hoverIndex !== null && (
              <g>
                <line
                  x1={getCoordinates(hoverIndex, displayData[hoverIndex]).x}
                  y1={paddingY}
                  x2={getCoordinates(hoverIndex, displayData[hoverIndex]).x}
                  y2={svgHeight - paddingY}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={getCoordinates(hoverIndex, displayData[hoverIndex]).x}
                  cy={getCoordinates(hoverIndex, displayData[hoverIndex]).y}
                  r="5"
                  fill="#ffffff"
                  stroke={isPositive ? '#10b981' : '#f43f5e'}
                  strokeWidth="2.5"
                />
                
                {/* Tooltip text showing MMM DD, YYYY */}
                <text
                  x={getCoordinates(hoverIndex, displayData[hoverIndex]).x}
                  y={paddingY - 10}
                  fill="#fff"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor={hoverIndex > displayData.length / 2 ? "end" : "start"}
                  className="pointer-events-none drop-shadow-md"
                >
                  {hoverDateLabel}
                </text>
              </g>
            )}

            {/* X-Axis Calendar Labels */}
            {(() => {
              const numLabels = Math.min(5, displayData.length);
              if (numLabels <= 1) return null;
              
              const labels = [];
              for (let i = 0; i < numLabels; i++) {
                const fraction = i / (numLabels - 1);
                const x = paddingX + fraction * (svgWidth - paddingX * 2);
                const dataIdx = Math.round(fraction * (displayData.length - 1));
                const weekNum = currentWeek - (displayData.length - 1 - dataIdx);
                const shortDate = formatSimulationDateShort(weekNum);
                
                labels.push(
                  <text
                    key={`xaxis-${i}`}
                    x={x}
                    y={svgHeight - paddingY + 12}
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="monospace"
                    textAnchor={i === 0 ? "start" : i === numLabels - 1 ? "end" : "middle"}
                  >
                    {shortDate}
                  </text>
                );
              }
              return <g>{labels}</g>;
            })()}
          </svg>

          {/* Min, Max Labels */}
          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 pt-3 border-t border-slate-900 px-1">
            <span>Low: {minVal.toFixed(2)}</span>
            <span>High: {maxVal.toFixed(2)}</span>
          </div>
        </div>

        {/* Technical Indicators Bar */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSma20(!showSma20)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                showSma20
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>SMA (20-Period)</span>
            </button>
          </div>

          <span className="text-[10px] text-slate-500 font-mono">Continuous Weekly Close (Calendar Series)</span>
        </div>
      </div>
    </div>
  );
};
