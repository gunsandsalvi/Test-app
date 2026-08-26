import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Sparkline } from '../charts/Charts';

function formatCompact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export const TapToChart: React.FC<{ label: string; value: string | React.ReactNode; history?: number[]; onExpand?: () => void; color?: string }> = ({ label, value, history, onExpand, color }) => {
  const [showChart, setShowChart] = useState(false);
  const hasHistory = !!history && history.length > 1;
  const trendColor = color ?? (hasHistory && history![history!.length - 1] >= history![0] ? 'var(--signal-positive)' : 'var(--signal-negative)');

  return (
    <div onClick={() => hasHistory ? setShowChart(!showChart) : onExpand?.()} className="cursor-pointer group">
      <div className="flex items-center justify-between group-hover:bg-[var(--bg-elevated)] p-1 -m-1 rounded transition-colors">
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-2">
          {hasHistory && (
             <div className="w-16 h-4">
               <Sparkline data={history} color={trendColor} />
             </div>
          )}
          <span className="font-[var(--font-numeric)] font-bold">{value}</span>
          {hasHistory && (
            <ChevronDown className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform ${showChart ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>
      {showChart && history && (
        <div className="mt-2 h-28 bg-[var(--bg-elevated)] rounded border border-[var(--border-hairline)] p-2 flex flex-col">
           <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] font-mono mb-1">
             <span>Min {formatCompact(Math.min(...history))}</span>
             <span>{history.length} periods</span>
             <span>Max {formatCompact(Math.max(...history))}</span>
           </div>
           <div className="flex-1 w-full flex items-end gap-[1px]">
             {history.map((h, i) => {
                const min = Math.min(...history);
                const max = Math.max(...history);
                const rng = max - min || 1;
                const pct = ((h - min) / rng) * 100;
                return (
                  <div key={i} className="flex-1 rounded-t opacity-80" style={{ height: `${Math.max(4, pct)}%`, backgroundColor: trendColor }} />
                )
             })}
           </div>
        </div>
      )}
    </div>
  );
};
