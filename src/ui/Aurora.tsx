/**
 * AU — THE PHONE SHELL. One full-screen panel; the command bar at the bottom with autocomplete
 * over the resolver; a back stack per panel; swipe between the panels you have open; long-press
 * an identifier to open it in a new panel. The shell owns the clock (Step / Run 3 months / Run /
 * Stop) and the tape; every function reads the world through the registries and nothing else.
 *
 * Strictly read-only against the engine: the world is `GameState` through typed selectors; the
 * workspace (panels, stacks, recents) lives here and in localStorage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState } from '../types';
import { createInitialGameState } from '../engine/simulation';
import { advanceWeeklyStep } from '../engine/simulation/core';
import { setClearingWorkersWeb, webWorkersAvailable } from '../engine/simulation/stages/clearing-worker-pool-web';
import { World, ObjectRef, Tape, newTape, recordTape, worldOf, searchObjects, labelOf, refOfIdentifier, objectOf, refKey } from './world';
import { FUNCTIONS, FUNCTION_NAMES, DEFAULT_FUNCTION, functionsFor } from './functions';
import { Nav, T, mono, Hint, Card } from './ui';
import { formatDate } from './calendar';

interface Frame { ref: ObjectRef; fn: string; args: Record<string, string> }
interface Panel { id: number; stack: Frame[] }

const RECENTS_KEY = 'aurora.recents';
const RUN_MONTHS_WEEKS = 13;

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); } catch { return []; }
}
function saveRecents(r: string[]): void {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(r.slice(0, 8))); } catch { /* private window */ }
}

/** `krln chart oas` → the object, the function word, and the rest as the function's series/tab. */
function parseCommand(world: World, text: string): { frame?: Frame; hits: ReturnType<typeof searchObjects>; fnWord?: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { hits: [] };
  const fnIdx = tokens.findIndex((t, i) => i > 0 && FUNCTION_NAMES.includes(t.toLowerCase()));
  const fnWord = fnIdx >= 0 ? tokens[fnIdx].toLowerCase() : undefined;
  const objectTokens = fnIdx >= 0 ? tokens.slice(0, fnIdx) : tokens;
  const rest = fnIdx >= 0 ? tokens.slice(fnIdx + 1) : [];
  // The longest leading run that resolves exactly is the object; what follows it is an argument.
  for (let n = objectTokens.length; n >= 1; n--) {
    const q = objectTokens.slice(0, n).join(' ');
    const exact = refOfIdentifier(world, q) ?? refOfIdentifier(world, q.toUpperCase());
    if (exact) {
      const extra = [...objectTokens.slice(n), ...rest].join(' ');
      const args: Record<string, string> = {};
      if (extra) { args.series = extra; args.tab = extra; args.path = extra; }
      return { frame: { ref: exact, fn: fnWord ?? DEFAULT_FUNCTION, args }, hits: [], fnWord };
    }
  }
  const hits = searchObjects(world, objectTokens.join(' '));
  return { hits, fnWord };
}

export default function Aurora() {
  const tapeRef = useRef<Tape>(newTape());
  const [state, setState] = useState<GameState>(() => { const s = createInitialGameState(); recordTape(tapeRef.current, s); return s; });
  const stateRef = useRef(state);
  stateRef.current = state;
  const world = useMemo(() => worldOf(state, tapeRef.current), [state]);

  const [panels, setPanels] = useState<Panel[]>(() => [{ id: 1, stack: [] }]);
  const [panelIdx, setPanelIdx] = useState(0);
  const [command, setCommand] = useState('');
  const [barOpen, setBarOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [stepMs, setStepMs] = useState<number | undefined>(undefined);
  const runningRef = useRef(false);
  const nextId = useRef(2);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (webWorkersAvailable()) setClearingWorkersWeb(navigator.hardwareConcurrency ?? 2); }, []);

  // ---- the clock ----
  const stepOnce = useCallback(() => {
    const t0 = performance.now();
    const next = advanceWeeklyStep(stateRef.current);
    recordTape(tapeRef.current, next);
    stateRef.current = next;
    setStepMs(performance.now() - t0);
    setState(next);
  }, []);
  useEffect(() => {
    if (!running) { runningRef.current = false; return; }
    runningRef.current = true;
    let cancelled = false;
    const tick = () => {
      if (cancelled || !runningRef.current) return;
      if (target !== undefined && stateRef.current.currentWeek >= target) { setRunning(false); return; }
      try { stepOnce(); } catch (e) { console.error(e); setRunning(false); return; }
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
    return () => { cancelled = true; };
  }, [running, target, stepOnce]);

  // ---- navigation ----
  const panel = panels[panelIdx];
  const frame = panel.stack[panel.stack.length - 1];
  const remember = useCallback((f: Frame) => {
    const text = `${labelOf(world, f.ref).ticker.toLowerCase()} ${f.fn}${f.args.series ? ' ' + f.args.series : ''}`;
    setRecents((r) => { const next = [text, ...r.filter((x) => x !== text)]; saveRecents(next); return next; });
  }, [world]);
  const nav: Nav = useMemo(() => ({
    open: (ref, fn = DEFAULT_FUNCTION, args = {}) => {
      const f = { ref, fn, args };
      setPanels((ps) => ps.map((p, i) => (i === panelIdx ? { ...p, stack: [...p.stack, f] } : p)));
      remember(f); setBarOpen(false); setCommand('');
    },
    openNew: (ref, fn = DEFAULT_FUNCTION, args = {}) => {
      const f = { ref, fn, args };
      setPanels((ps) => { const next = [...ps]; next.splice(panelIdx + 1, 0, { id: nextId.current++, stack: [f] }); return next; });
      setPanelIdx((i) => i + 1); remember(f); setBarOpen(false); setCommand('');
    },
    go: (fn, args = {}) => {
      setPanels((ps) => ps.map((p, i) => {
        if (i !== panelIdx || p.stack.length === 0) return p;
        const cur = p.stack[p.stack.length - 1];
        return { ...p, stack: [...p.stack, { ref: cur.ref, fn, args: { ...(fn === cur.fn ? cur.args : {}), ...args } }] };
      }));
    },
  }), [panelIdx, remember]);
  const back = () => setPanels((ps) => ps.map((p, i) => (i === panelIdx && p.stack.length > 0 ? { ...p, stack: p.stack.slice(0, -1) } : p)));
  const closePanel = () => { if (panels.length === 1) { setPanels([{ id: nextId.current++, stack: [] }]); return; } setPanels((ps) => ps.filter((_, i) => i !== panelIdx)); setPanelIdx((i) => Math.max(0, i - 1)); };

  // ---- swipe between panels ----
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = undefined; if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && panelIdx < panels.length - 1) setPanelIdx(panelIdx + 1);
    if (dx > 0 && panelIdx > 0) setPanelIdx(panelIdx - 1);
  };

  // ---- the command bar ----
  const parsed = useMemo(() => parseCommand(world, command), [world, command]);
  const submit = () => {
    const p = parseCommand(world, command);
    if (p.frame) { nav.open(p.frame.ref, p.frame.fn, p.frame.args); return; }
    if (p.hits.length > 0) nav.open(p.hits[0].ref, p.fnWord ?? DEFAULT_FUNCTION, {});
  };
  useEffect(() => { if (barOpen) inputRef.current?.focus(); }, [barOpen]);

  const fnModule = frame ? FUNCTIONS[frame.fn] : undefined;
  const label = frame ? labelOf(world, frame.ref) : undefined;
  const gone = frame ? !objectOf(world, frame.ref) : false;
  const trail = panel.stack.map((f) => `${labelOf(world, f.ref).ticker.toLowerCase()} ${f.fn}`).join(' › ');

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, color: T.text, fontFamily: '"Manrope", system-ui, sans-serif', fontSize: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 16px 0 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span onClick={frame ? back : undefined} style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: frame ? T.muted : T.hint, cursor: frame ? 'pointer' : undefined }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </span>
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ ...mono, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{label ? label.ticker : 'aurora'}</span>
          <span style={{ color: T.muted, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{frame ? frame.fn : 'object function'}</span>
        </div>
        {panels.length > 1 ? <span style={{ ...mono, fontSize: 11, color: T.hint }}>{panelIdx + 1}/{panels.length}</span> : null}
        <span style={{ ...mono, fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{formatDate(state.currentWeek - (state.burnInWeeks ?? 0))}</span>
      </div>

      {/* body */}
      <div className="aurora-body" style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 12px 16px 12px' }}>
        {!frame ? (
          <Home world={world} nav={nav} recents={recents} onRecent={(r) => { setCommand(r); setBarOpen(true); }} stepMs={stepMs} />
        ) : gone ? (
          <Card style={{ padding: 14, color: T.muted }}>{label?.ticker} is no longer in the world this week.</Card>
        ) : fnModule ? (
          fnModule.appliesTo.includes(frame.ref.type)
            ? fnModule.render({ world, ref: frame.ref, args: frame.args, nav })
            : <Card style={{ padding: 14, color: T.muted }}><b>{frame.fn}</b> does not apply to a {frame.ref.type}. Try {functionsFor(frame.ref.type).map((f) => f.name).join(', ')}.</Card>
        ) : (
          <Card style={{ padding: 14, color: T.muted }}>no function called <b>{frame.fn}</b> — the words are {FUNCTION_NAMES.join(', ')}.</Card>
        )}
        {frame ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 4px 0 4px' }}>
            {functionsFor(frame.ref.type).map((f) => (
              <span key={f.name} onClick={() => nav.go(f.name)} style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px', borderRadius: 8, background: f.name === frame.fn ? T.text : T.card, color: f.name === frame.fn ? T.bg : '#c7cdd6', border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{f.name}</span>
            ))}
            <span onClick={closePanel} style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px', borderRadius: 8, color: T.hint, fontSize: 13, cursor: 'pointer' }}>close panel</span>
          </div>
        ) : null}
        {frame ? <Hint style={{ ...mono, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>← {trail}</Hint> : null}
      </div>

      {/* clock */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0 12px', flexShrink: 0 }}>
        <ClockButton label="step" onTap={() => { if (!running) stepOnce(); }} disabled={running} />
        <ClockButton label="run 3 months" onTap={() => { setTarget(stateRef.current.currentWeek + RUN_MONTHS_WEEKS); setRunning(true); }} disabled={running} />
        <ClockButton label={running ? 'running…' : 'run'} onTap={() => { setTarget(undefined); setRunning(true); }} disabled={running} primary />
        <ClockButton label="■" onTap={() => setRunning(false)} disabled={!running} />
      </div>

      {/* command bar */}
      <div style={{ padding: '8px 12px 14px 12px', borderTop: `1px solid ${T.border}`, marginTop: 8, flexShrink: 0, background: T.bg }}>
        {barOpen && command.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {parsed.frame ? (
              <Card style={{ padding: '0 12px', height: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <span onClick={submit} style={{ ...mono, color: T.accent }}>{labelOf(world, parsed.frame.ref).ticker} {parsed.frame.fn}{parsed.frame.args.series ? ` ${parsed.frame.args.series}` : ''}</span>
                <Hint>{labelOf(world, parsed.frame.ref).name} · {labelOf(world, parsed.frame.ref).kind}</Hint>
              </Card>
            ) : null}
            {parsed.hits.length > 0 ? (
              <Card style={{ overflow: 'hidden' }}>
                {parsed.hits.slice(0, 8).map((h) => (
                  <div key={refKey(h.ref)} onClick={() => nav.open(h.ref, parsed.fnWord ?? DEFAULT_FUNCTION, {})} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr) minmax(0, 0.8fr)', gap: 8, alignItems: 'center', height: 44, padding: '0 12px', borderBottom: `1px solid ${T.rule}`, cursor: 'pointer' }}>
                    <span style={{ ...mono, color: T.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label.ticker}</span>
                    <span style={{ color: T.muted, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label.name}</span>
                    <Hint style={{ textAlign: 'right' }}>{h.label.kind}{h.label.region ? ` · ${h.label.region}` : ''}</Hint>
                  </div>
                ))}
              </Card>
            ) : null}
            {!parsed.frame && parsed.hits.length === 0 ? <Hint style={{ padding: '0 4px' }}>nothing named “{command}” — a ticker, a name, or a region (usa, eur, uk, jpn).</Hint> : null}
            {parsed.frame || parsed.hits.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {functionsFor((parsed.frame ?? parsed.hits[0]).ref.type).map((f) => (
                  <span key={f.name} onClick={() => nav.open((parsed.frame ?? parsed.hits[0]).ref, f.name, parsed.frame?.args ?? {})} style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: '#c7cdd6', cursor: 'pointer' }}>{f.name}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', borderRadius: 10, background: T.card, border: `1px solid ${barOpen ? T.accent : T.input}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <input
            ref={inputRef} value={command}
            onChange={(e) => { setCommand(e.target.value); setBarOpen(true); }}
            onFocus={() => setBarOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setBarOpen(false); setCommand(''); } }}
            placeholder="object function"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ flexGrow: 1, background: 'transparent', border: 'none', outline: 'none', color: T.text, ...mono, fontSize: 15 }}
          />
          {command ? <span onClick={() => { setCommand(''); setBarOpen(false); }} style={{ color: T.hint, cursor: 'pointer' }}>✕</span> : null}
        </div>
      </div>
    </div>
  );
}

function ClockButton({ label, onTap, disabled, primary }: { label: string; onTap: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <span onClick={disabled ? undefined : onTap} style={{ flexGrow: label === '■' ? 0 : 1, textAlign: 'center', padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: primary ? T.text : T.card, color: primary ? T.bg : disabled ? T.hint : '#c7cdd6', fontSize: 13, fontWeight: 600, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{label}</span>
  );
}

function Home({ world, nav, recents, onRecent, stepMs }: { world: World; nav: Nav; recents: string[]; onRecent: (r: string) => void; stepMs?: number }) {
  const regions = Object.keys(world.state.regions);
  const banks = world.state.companies.filter((c) => c.isBankEntity && c.bankBalanceSheet && !c.isDefaulted);
  const biggest = [...world.state.companies].filter((c) => !c.isDefaulted && !c.mergerAcquired && c.listingStatus !== 'PRIVATE').sort((a, b) => b.marketCap - a.marketCap).slice(0, 6);
  const Chip = ({ text, onTap }: { text: string; onTap: () => void }) => (
    <span onClick={onTap} style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: '#c7cdd6', cursor: 'pointer', ...mono }}>{text}</span>
  );
  return (<>
    <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: 24, fontWeight: 500 }}>the world, {formatDate(world.state.currentWeek - (world.state.burnInWeeks ?? 0))}</div>
      <Hint>{world.state.companies.length} companies · {world.state.institutionalEntities.length} institutions · {regions.length} regions{stepMs !== undefined ? ` · last step ${(stepMs / 1000).toFixed(2)} s` : ''}</Hint>
    </div>
    <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '4px 4px 0' }}>regions</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{regions.map((r) => <Chip key={r} text={r.toLowerCase()} onTap={() => nav.open({ type: 'region', id: r })} />)}</div>
    <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '4px 4px 0' }}>banks</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{banks.map((b) => <Chip key={b.id} text={b.ticker.toLowerCase()} onTap={() => nav.open({ type: 'company', id: b.id })} />)}</div>
    <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '4px 4px 0' }}>largest by market cap</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{biggest.map((c) => <Chip key={c.id} text={c.ticker.toLowerCase()} onTap={() => nav.open({ type: 'company', id: c.id })} />)}</div>
    {recents.length > 0 ? (<>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '4px 4px 0' }}>recent</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{recents.map((r) => <Chip key={r} text={r} onTap={() => onRecent(r)} />)}</div>
    </>) : null}
    <Hint style={{ padding: '4px 4px 0' }}>type an object and a function — <span style={mono}>krln overview</span>, <span style={mono}>usa chart 10y</span>, <span style={mono}>voul statements</span>. Long-press any name to open it beside this one; swipe to move between panels. The bench is at <a href="#bench" style={{ color: T.accent }}>#bench</a>.</Hint>
  </>);
}
