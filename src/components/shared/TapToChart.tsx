import React, { useState } from 'react';
import { Sparkline } from '../charts/Charts';

export const TapToChart: React.FC<{ label: string; value: string | React.ReactNode; history?: number[]; onExpand?: () => void; color?: string }> = ({ label, value, history, onExpand, color }) => {
  const [showChart, setShowChart] = useState(false);
  return (
    <div onClick={() => history && history.length > 1 ? setShowChart(!showChart) : onExpand?.()} className="cursor-pointer group">
      <div className="flex items-center justify-between group-hover:bg-[var(--bg-elevated)] p-1 -m-1 rounded transition-colors">
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-2">
          {history && history.length > 1 && (
             <div className="w-16 h-4 opacity-50">
               <Sparkline data={history} color={color || 'var(--text-secondary)'} />
             </div>
          )}
          <span className="font-[var(--font-numeric)] font-bold">{value}</span>
        </div>
      </div>
      {showChart && history && (
        <div className="mt-2 h-24 bg-[var(--bg-elevated)] rounded border border-[var(--border-hairline)] p-2">
           {/* Render full history chart inline */}
           <div className="h-full w-full flex items-end gap-[1px]">
             {history.map((h, i) => {
                const min = Math.min(...history);
                const max = Math.max(...history);
                const rng = max - min || 1;
                const pct = ((h - min) / rng) * 100;
                return (
                  <div key={i} className="flex-1 rounded-t opacity-80" style={{ height: `${Math.max(4, pct)}%`, backgroundColor: color || 'var(--text-tertiary)' }} />
                )
             })}
           </div>
        </div>
      )}
    </div>
  );
};
