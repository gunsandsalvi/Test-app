import React from 'react';
import { NelsonSiegelParams } from '../../types';
import { calculateTenorZeroRates } from '../../engine/nelsonSiegel';

export const Sparkline: React.FC<{ data: number[], width?: number, height?: number, color?: string, strokeWidth?: number }> = ({ data, width = 60, height = 20, color = '#3b82f6', strokeWidth = 1.5 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * width},${height - ((d - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export const SegmentedBar: React.FC<{ segments: { value: number, color: string, label?: string }[], height?: number }> = ({ segments, height = 8 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-sm" style={{ height }}>
      {segments.map((seg, i) => (
        <div key={i} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }} title={seg.label} />
      ))}
    </div>
  );
};

export const RegimeCompass: React.FC<{ regime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery', size?: number }> = ({ regime, size = 60 }) => {
  const r = size / 2;
  const activeDot = {
    'Expansion': { cx: r + r/2, cy: r - r/2, c: '#10b981' },
    'Slowdown': { cx: r + r/2, cy: r + r/2, c: '#f59e0b' },
    'Recession': { cx: r - r/2, cy: r + r/2, c: '#ef4444' },
    'Recovery': { cx: r - r/2, cy: r - r/2, c: '#3b82f6' }
  }[regime];
  return (
    <svg width={size} height={size} className="bg-slate-900 rounded-md border border-slate-800">
      <line x1={0} y1={r} x2={size} y2={r} stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
      <line x1={r} y1={0} x2={r} y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
      <text x={size-2} y={r-4} fontSize="8" fill="#64748b" textAnchor="end">Growth+</text>
      <text x={2} y={r-4} fontSize="8" fill="#64748b" textAnchor="start">Growth-</text>
      <text x={r+4} y={10} fontSize="8" fill="#64748b" textAnchor="start">Inf+</text>
      <text x={r+4} y={size-4} fontSize="8" fill="#64748b" textAnchor="start">Inf-</text>
      <circle cx={activeDot.cx} cy={activeDot.cy} r={4} fill={activeDot.c} className="animate-pulse shadow-[0_0_8px_currentColor]" />
    </svg>
  );
};

export const CreditConditionsMeter: React.FC<{ index: number, width?: number }> = ({ index, width = 100 }) => {
  // index usually between -2 (loose) and +2 (tight)
  const norm = Math.max(0, Math.min(1, (index + 2) / 4));
  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <div className="flex justify-between text-[8px] text-slate-500 font-bold uppercase">
        <span>Loose</span>
        <span>Tight</span>
      </div>
      <div className="relative h-2 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full">
        <div className="absolute top-[-2px] bottom-[-2px] w-1 bg-white shadow-sm border border-slate-900 rounded-full transition-all duration-300" style={{ left: `calc(${norm * 100}% - 2px)` }} />
      </div>
    </div>
  );
};

export const YieldCurveChart: React.FC<{ params: NelsonSiegelParams, width?: number, height?: number }> = ({ params, width = 120, height = 60 }) => {
  const tenors = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];
  const rates = calculateTenorZeroRates(params);
  const minRate = Math.min(0, ...rates);
  const maxRate = Math.max(...rates, 0.05); // cap at 5% min visual
  const range = maxRate - minRate || 0.01;
  const pts = rates.map((r, i) => `${(i / (tenors.length - 1)) * width},${height - ((r - minRate) / range) * height}`).join(' ');

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />
        {rates.map((r, i) => (
          <circle key={i} cx={(i / (tenors.length - 1)) * width} cy={height - ((r - minRate) / range) * height} r={1.5} fill="#c4b5fd" />
        ))}
      </svg>
      <div className="absolute bottom-[-14px] w-full flex justify-between text-[8px] text-slate-500">
        <span>3M</span>
        <span>10Y</span>
        <span>30Y</span>
      </div>
    </div>
  );
};
