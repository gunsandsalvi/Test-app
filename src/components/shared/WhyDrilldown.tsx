import React, { useState } from 'react';

export interface Contributor {
  label: string;
  value: string | React.ReactNode;
  signal: 'positive' | 'negative' | 'neutral';
  onTap?: () => void;
  contributors?: Contributor[];
}

export interface WhyDrilldownProps {
  headline: string;
  value: string;
  signal: 'positive' | 'negative' | 'neutral';
  contributors: Contributor[];
}

const ContributorRow: React.FC<{ c: Contributor }> = ({ c }) => {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = c.contributors && c.contributors.length > 0;
  
  return (
    <div className="space-y-1">
      <div 
        onClick={(e) => { 
          e.stopPropagation(); 
          if (isExpandable) setExpanded(!expanded);
          c.onTap?.(); 
        }} 
        className={`flex items-center justify-between text-[11px] ${isExpandable ? 'cursor-pointer hover:bg-[var(--bg-highlight)] -mx-1 px-1 rounded' : ''}`}
      >
        <span className="text-[var(--text-secondary)]">{c.label} {isExpandable && (expanded ? '▼' : '▶')}</span>
        <span className="font-[var(--font-numeric)]" style={{color: c.signal==='positive'?'var(--signal-positive)':c.signal==='negative'?'var(--signal-negative)':'var(--text-tertiary)'}}>{c.value}</span>
      </div>
      {expanded && c.contributors && (
        <div className="pl-3 border-l border-[var(--border-hairline)] ml-1 space-y-1 mt-1">
          {c.contributors.map((child, i) => (
             <ContributorRow key={i} c={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export const WhyDrilldown: React.FC<WhyDrilldownProps> = ({ headline, value, signal, contributors }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div onClick={() => setExpanded(!expanded)} className="bg-[var(--bg-elevated)] rounded-xl p-3 border border-[var(--border-hairline)] transition-all cursor-pointer">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wide">{headline}</span>
        <span className={`text-lg font-bold font-[var(--font-numeric)]`} style={{color: signal==='positive'?'var(--signal-positive)':signal==='negative'?'var(--signal-negative)':'var(--text-primary)'}}>{value}</span>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
          {contributors.map((c, i) => (
            <ContributorRow key={i} c={c} />
          ))}
        </div>
      )}
    </div>
  );
};
