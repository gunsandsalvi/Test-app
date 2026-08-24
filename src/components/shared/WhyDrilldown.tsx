import React, { useState } from 'react';

export interface Contributor {
  label: string;
  value: string;
  signal: 'positive' | 'negative' | 'neutral';
  onTap?: () => void;
}

export interface WhyDrilldownProps {
  headline: string;
  value: string;
  signal: 'positive' | 'negative' | 'neutral';
  contributors: Contributor[];
}

export const WhyDrilldown: React.FC<WhyDrilldownProps> = ({ headline, value, signal, contributors }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div onClick={() => setExpanded(!expanded)} className="bg-[var(--bg-elevated)] rounded-xl p-3 border border-[var(--border-hairline)] active:scale-[0.99] transition-transform cursor-pointer">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wide">{headline}</span>
        <span className={`text-lg font-bold font-[var(--font-numeric)]`} style={{color: signal==='positive'?'var(--signal-positive)':signal==='negative'?'var(--signal-negative)':'var(--text-primary)'}}>{value}</span>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
          {contributors.map((c, i) => (
            <div key={i} onClick={(e) => { e.stopPropagation(); c.onTap?.(); }} className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-secondary)]">{c.label}</span>
              <span className="font-[var(--font-numeric)]" style={{color: c.signal==='positive'?'var(--signal-positive)':c.signal==='negative'?'var(--signal-negative)':'var(--text-tertiary)'}}>{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
