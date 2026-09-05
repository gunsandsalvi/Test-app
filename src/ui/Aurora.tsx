/**
 * AU — THE PHONE SHELL. One full-screen panel; the command bar at the bottom; a back stack per
 * panel; swipe between the panels you have open; long-press an identifier to open it in a new
 * panel. The shell owns the clock (Step / Run 3 months / Run / Stop) and the tape; every function
 * reads the world through the registries and nothing else.
 *
 * The command grammar: `<object>` opens it; `<object> <function> [arg]` opens it there; with an
 * object open, a bare `<function> [arg]` applies to it (`chart 10y`, `statements treasury`,
 * `peers banks`). A function word may be a unique prefix (`stat`). `type:id` names one exactly.
 *
 * Strictly read-only against the engine: the world is `GameState` through typed selectors; the
 * workspace (panels, stacks, recents) lives here and in localStorage.
 */

import { stateDepositLines } from '../engine/ledger/accounts';
import { ensureV2 } from '../engine2/world';
import { marketCapAt } from '../engine2/instruments';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, InstitutionalEntity } from '../types';
import { createInitialGameState } from '../engine/simulation';
import { advanceWeeklyStep } from '../engine/simulation/core';
import { setClearingWorkersWeb, webWorkersAvailable } from '../engine/simulation/stages/clearing-worker-pool-web';
import { World, Tape, newTape, recordTape, worldOf, displayWeek } from './world';
import { ObjectRef, ObjectType, refKey, sameRef } from './types';
import { OBJECTS, OBJECT_TYPES, searchObjects, labelOf, refOfIdentifier, objectOf, headlineOf, moduleOf, kindOfWord } from './objects';
import { FUNCTIONS, DEFAULT_FUNCTION, functionsFor, functionNamed } from './functions';
import { FunctionModule } from './fn';
import { Nav, T, mono, Hint, Card } from './ui';
import { formatDate } from './calendar';
import { storiesFor, Story } from './functions/news';
import { isActiveCompany, banksOf } from '../domain/company';
import { institutionTotalAssetsFromState } from '../engine/simulation/stages/institutional-balance-sheet';

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

const argsFor = (fn: FunctionModule | undefined, extra: string): Record<string, string> => {
  if (!extra) return {};
  const key = fn?.argKey ?? 'tab';
  return { [key]: extra };
};

interface Parsed {
  /** A command that resolves exactly. */
  frame?: Frame;
  /** Object candidates when the words do not resolve exactly. */
  hits: ReturnType<typeof searchObjects>;
  /** The function word found, if any. */
  fn?: FunctionModule;
  /** Function candidates for the current object when the text reads as a function prefix. */
  fnHits: FunctionModule[];
  /** A kind named by its word that has no instance this week. */
  emptyKind?: ObjectType;
}

/** `krln chart oas` → the object, the function, the rest; `chart oas` on an open object → the same. */
function parseCommand(world: World, text: string, current?: ObjectRef): Parsed {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { hits: [], fnHits: current ? functionsFor(current.type) : [] };
  // The longest leading run that names one object exactly; what follows is the function and its argument.
  for (let n = tokens.length; n >= 1; n--) {
    const q = tokens.slice(0, n).join(' ');
    const exact = refOfIdentifier(world, q) ?? refOfIdentifier(world, q.toUpperCase());
    if (!exact) continue;
    const rest = tokens.slice(n);
    const f = rest.length ? functionNamed(rest[0], exact.type) : undefined;
    // Words after the object that are not a function are not an argument to the overview: search instead.
    if (rest.length && !f) continue;
    const extra = (f ? rest.slice(1) : rest).join(' ');
    return { frame: { ref: exact, fn: f?.name ?? DEFAULT_FUNCTION, args: argsFor(f, extra) }, hits: [], fn: f, fnHits: [] };
  }
  // A bare function on the open object.
  if (current) {
    const f = functionNamed(tokens[0], current.type);
    if (f) return { frame: { ref: current, fn: f.name, args: argsFor(f, tokens.slice(1).join(' ')) }, hits: [], fn: f, fnHits: [] };
    const fnHits = tokens.length === 1 ? functionsFor(current.type).filter((x) => x.name.startsWith(tokens[0].toLowerCase())) : [];
    if (fnHits.length > 0) return { hits: searchObjects(world, tokens[0], 4), fnHits };
  }
  // A kind's word alone: the screener over all of them.
  const kind = kindOfWord(world, text);
  if (kind) return kind.ref ? { frame: { ref: kind.ref, fn: moduleOf(kind.type).peers ? 'peers' : DEFAULT_FUNCTION, args: kind.tab ? { tab: kind.tab } : {} }, hits: [], fnHits: [] } : { hits: [], fnHits: [], emptyKind: kind.type };
  // Words that do not resolve: a search, with a trailing function word honoured.
  const fnIdx = tokens.findIndex((t, i) => i > 0 && functionNamed(t) !== undefined);
  const fn = fnIdx >= 0 ? functionNamed(tokens[fnIdx]) : undefined;
  return { hits: searchObjects(world, (fnIdx >= 0 ? tokens.slice(0, fnIdx) : tokens).join(' ')), fn, fnHits: [] };
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
  const bodyRef = useRef<HTMLDivElement>(null);
  // §3.14-SHELL — THE KEYBOARD MOVES THE BAR, NOT THE PAGE. The shell is a fixed column over the
  // LAYOUT viewport; an on-screen keyboard shrinks the VISUAL viewport and the browser scrolls it
  // to keep the focused input in view, which used to push the header, the strip and the panel up
  // with the bar. So the shell counter-moves by the visual viewport's offset (it holds still on
  // screen) and the bar alone moves up by the keyboard's height, off the visual viewport.
  const keyboard = useVisualViewport();

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
  const frame = panel.stack.at(-1);
  const remember = useCallback((f: Frame) => {
    const arg = Object.values(f.args)[0];
    const text = `${labelOf(world, f.ref).ticker.toLowerCase()}${f.fn !== DEFAULT_FUNCTION ? ' ' + f.fn : ''}${arg ? ' ' + arg : ''}`;
    setRecents((r) => { const next = [text, ...r.filter((x) => x !== text)]; saveRecents(next); return next; });
  }, [world]);
  const push = useCallback((f: Frame) => {
    setPanels((ps) => ps.map((p, i) => {
      if (i !== panelIdx) return p;
      const top = p.stack.at(-1);
      // The same page again is not a new page.
      if (top && sameRef(top.ref, f.ref) && top.fn === f.fn && JSON.stringify(top.args) === JSON.stringify(f.args)) return p;
      return { ...p, stack: [...p.stack, f] };
    }));
    bodyRef.current?.scrollTo({ top: 0 });
  }, [panelIdx]);
  const nav: Nav = useMemo(() => ({
    open: (ref, fn = DEFAULT_FUNCTION, args = {}) => {
      const f = { ref, fn, args };
      push(f); remember(f); setBarOpen(false); setCommand('');
    },
    openNew: (ref, fn = DEFAULT_FUNCTION, args = {}) => {
      const f = { ref, fn, args };
      setPanels((ps) => { const next = [...ps]; next.splice(panelIdx + 1, 0, { id: nextId.current++, stack: [f] }); return next; });
      setPanelIdx((i) => i + 1); remember(f); setBarOpen(false); setCommand('');
    },
    go: (fn, args = {}) => {
      const cur = panels.at(panelIdx)?.stack.at(-1);
      if (!cur) return;
      const f = { ref: cur.ref, fn, args: { ...(fn === cur.fn ? cur.args : {}), ...args } };
      push(f); if (fn !== cur.fn) remember(f);
      setBarOpen(false); setCommand('');
    },
  }), [panelIdx, panels, push, remember]);
  const back = () => setPanels((ps) => ps.map((p, i) => (i === panelIdx && p.stack.length > 0 ? { ...p, stack: p.stack.slice(0, -1) } : p)));
  const home = () => setPanels((ps) => ps.map((p, i) => (i === panelIdx ? { ...p, stack: [] } : p)));
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
  const parsed = useMemo(() => parseCommand(world, command, frame?.ref), [world, command, frame?.ref]);
  const submit = () => {
    inputRef.current?.blur();
    const p = parseCommand(world, command, frame?.ref);
    if (p.frame) { nav.open(p.frame.ref, p.frame.fn, p.frame.args); return; }
    if (p.fnHits.length > 0 && frame) { nav.go(p.fnHits[0].name); return; }
    if (p.hits.length > 0) { const h = p.hits[0]; nav.open(h.ref, p.fn && p.fn.appliesTo.includes(h.ref.type) ? p.fn.name : DEFAULT_FUNCTION, {}); }
  };
  useEffect(() => { if (barOpen) inputRef.current?.focus(); }, [barOpen]);

  const fnModule = frame ? FUNCTIONS[frame.fn] : undefined;
  const label = frame ? labelOf(world, frame.ref) : undefined;
  const gone = frame ? objectOf(world, frame.ref) === undefined : false;
  const argText = frame ? Object.values(frame.args)[0] : undefined;
  const trail = panel.stack.slice(0, -1).map((f, i, arr) => {
    const prev = i > 0 ? arr[i - 1] : undefined;
    const t = labelOf(world, f.ref).ticker.toLowerCase();
    if (prev && sameRef(prev.ref, f.ref)) return prev.fn === f.fn ? '' : f.fn;
    return `${t}${f.fn !== DEFAULT_FUNCTION ? ' ' + f.fn : ''}`;
  }).filter(Boolean).join(' › ');
  const strip = frame ? functionsFor(frame.ref.type) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, color: T.text, fontFamily: '"Manrope", system-ui, sans-serif', fontSize: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', transform: keyboard.offsetTop ? `translateY(${keyboard.offsetTop}px)` : undefined }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 14px 0 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span onClick={frame ? back : undefined} title="back" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: frame ? T.text : T.hint, cursor: frame ? 'pointer' : undefined }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </span>
        <span onClick={frame ? home : undefined} title="home" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: frame ? T.muted : T.hint, cursor: frame ? 'pointer' : undefined }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
        </span>
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ ...mono, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label ? label.ticker : 'aurora'}</span>
          <span style={{ color: T.muted, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{frame ? frame.fn : ''}{argText ? <span style={{ color: T.hint, fontWeight: 400 }}> {argText}</span> : null}</span>
        </div>
        {panels.length > 1 ? <span style={{ ...mono, fontSize: 11, color: T.hint }}>{panelIdx + 1}/{panels.length}</span> : null}
        <span style={{ ...mono, fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{formatDate(displayWeek(state))}</span>
      </div>
      {/* the function strip: the object is chosen — this is how you look at it */}
      {frame ? (
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {strip.map((f) => (
            <span key={f.name} onClick={() => nav.go(f.name)} style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: f.name === frame.fn ? T.text : T.muted, borderBottom: `2px solid ${f.name === frame.fn ? T.accent : 'transparent'}`, cursor: 'pointer', flexShrink: 0 }}>{f.name}</span>
          ))}
          <span style={{ flexGrow: 1 }} />
          <span onClick={closePanel} title="close this panel" style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 12px', fontSize: 13, color: T.hint, cursor: 'pointer', flexShrink: 0 }}>✕</span>
        </div>
      ) : null}

      {/* body */}
      <div ref={bodyRef} className="aurora-body" style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 12px 16px 12px' }}>
        {!frame ? (
          <Home world={world} nav={nav} recents={recents} onRecent={(r) => { setCommand(r); setBarOpen(true); }} stepMs={stepMs} />
        ) : gone ? (
          <Card style={{ padding: 14, color: T.muted }}>{label?.ticker} is no longer in the world this week.</Card>
        ) : fnModule ? (
          fnModule.appliesTo.includes(frame.ref.type)
            ? fnModule.render({ world, ref: frame.ref, args: frame.args, nav })
            : <Card style={{ padding: 14, color: T.muted }}><b>{frame.fn}</b> does not apply to a {moduleOf(frame.ref.type).words[0]}. Here you have {strip.map((f) => f.name).join(', ')}.</Card>
        ) : (
          <Card style={{ padding: 14, color: T.muted }}>no function called <b>{frame.fn}</b> — here you have {strip.map((f) => f.name).join(', ')}.</Card>
        )}
        {frame && trail ? <Hint style={{ ...mono, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>← {trail}</Hint> : null}
      </div>

      {/* clock */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0 12px', flexShrink: 0 }}>
        <ClockButton label="step" onTap={() => { if (!running) stepOnce(); }} disabled={running} />
        <ClockButton label="run 3 months" onTap={() => { setTarget(stateRef.current.currentWeek + RUN_MONTHS_WEEKS); setRunning(true); }} disabled={running} />
        <ClockButton label={running ? 'running…' : 'run'} onTap={() => { setTarget(undefined); setRunning(true); }} disabled={running} primary />
        <ClockButton label="■" onTap={() => setRunning(false)} disabled={!running} />
      </div>

      {/* command bar — tracks the keyboard (§3.14-SHELL) */}
      <div style={{ padding: '8px 12px 14px 12px', borderTop: `1px solid ${T.border}`, marginTop: 8, flexShrink: 0, background: T.bg, transform: keyboard.height ? `translateY(-${keyboard.height}px)` : undefined }}>
        {barOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {parsed.frame ? (
              <Card style={{ padding: '0 12px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} >
                <span onClick={submit} style={{ ...mono, color: T.accent, whiteSpace: 'nowrap' }}>{labelOf(world, parsed.frame.ref).ticker} {parsed.frame.fn}{Object.values(parsed.frame.args)[0] ? ` ${Object.values(parsed.frame.args)[0]}` : ''}</span>
                <Hint style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(world, parsed.frame.ref).name} · {labelOf(world, parsed.frame.ref).kind} · {FUNCTIONS[parsed.frame.fn]?.blurb}</Hint>
              </Card>
            ) : null}
            {/* the functions of the open object: the menu */}
            {frame && !parsed.frame && (parsed.fnHits.length > 0) ? (<>
              <Hint style={{ padding: '0 4px' }}>{command.trim() ? 'functions' : `on ${label?.ticker}`}</Hint>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {parsed.fnHits.map((f) => (
                  <span key={f.name} onClick={() => nav.go(f.name)} style={{ display: 'inline-flex', flexDirection: 'column', justifyContent: 'center', minHeight: 40, padding: '4px 12px', borderRadius: 8, background: T.card, border: `1px solid ${f.name === frame.fn ? T.accent : T.border}`, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#c7cdd6' }}>{f.name}</span>
                    <Hint>{f.blurb}</Hint>
                  </span>
                ))}
              </div>
            </>) : null}
            {parsed.hits.length > 0 ? (<>
              {frame && parsed.fnHits.length > 0 ? <Hint style={{ padding: '0 4px' }}>objects</Hint> : null}
              <Card style={{ overflow: 'hidden' }}>
                {parsed.hits.slice(0, 8).map((h) => (
                  <div key={refKey(h.ref)} className="aurora-hit" onClick={() => nav.open(h.ref, parsed.fn && parsed.fn.appliesTo.includes(h.ref.type) ? parsed.fn.name : DEFAULT_FUNCTION, {})} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 0.8fr)', gap: 8, alignItems: 'center', minHeight: 44, padding: '4px 12px', borderBottom: `1px solid ${T.rule}`, cursor: 'pointer' }}>
                    <span style={{ ...mono, color: T.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{h.label.ticker}</span>
                    <span style={{ color: T.muted, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label.name}</span>
                    <Hint style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label.kind}{h.label.region && !h.label.ticker.startsWith(h.label.region) ? ` · ${h.label.region}` : ''}</Hint>
                  </div>
                ))}
              </Card>
            </>) : null}
            {parsed.emptyKind ? <Hint style={{ padding: '0 4px' }}>no {moduleOf(parsed.emptyKind).words[1]} in the world this week.</Hint> : null}
            {command.trim() && !parsed.frame && !parsed.emptyKind && parsed.hits.length === 0 && parsed.fnHits.length === 0 ? <Hint style={{ padding: '0 4px' }}>nothing named “{command}” — a ticker, a name, a region (usa, eur, uk, jpn), a market (usa apparel), a pair (eur/usd), a commodity (oil), a kind (banks, pension, curve){frame ? `, or a function on ${label?.ticker}: ${strip.map((f) => f.name).join(', ')}` : ''}.</Hint> : null}
            {parsed.frame && !parsed.fn && !command.includes(' ') ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {functionsFor(parsed.frame.ref.type).map((f) => (
                  <span key={f.name} onClick={() => nav.open(parsed.frame!.ref, f.name, {})} style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: '#c7cdd6', cursor: 'pointer' }}>{f.name}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', borderRadius: 10, background: T.card, border: `1px solid ${barOpen ? T.accent : T.input}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <input
            ref={inputRef} value={command} aria-label="command"
            onChange={(e) => { setCommand(e.target.value); setBarOpen(true); }}
            onFocus={() => setBarOpen(true)} onClick={() => setBarOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setBarOpen(false); setCommand(''); inputRef.current?.blur(); } }}
            placeholder={frame ? `a function on ${label?.ticker} (${strip.slice(1, 4).map((f) => f.name).join(', ')}…) or another object` : 'an object, then a function (krln news · usa chart 10y)'}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ flexGrow: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: T.text, ...mono, fontSize: 15 }}
          />
          {command || barOpen ? <span onClick={() => { setCommand(''); setBarOpen(false); inputRef.current?.blur(); }} style={{ color: T.hint, cursor: 'pointer' }}>✕</span> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * §3.14-SHELL — what the on-screen keyboard did to the visual viewport: how far the browser
 * scrolled it (`offsetTop`) and how much of the layout viewport it covers (`height`, the keyboard's
 * own height; zero when the visual viewport is the whole layout viewport). Read off
 * `window.visualViewport` on its own events; a browser without it reports nothing and the shell
 * stays as it was.
 */
function useVisualViewport(): { offsetTop: number; height: number } {
  const [vv, setVv] = useState({ offsetTop: 0, height: 0 });
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const read = () => {
      const height = Math.max(0, Math.round(window.innerHeight - v.height));
      const offsetTop = Math.max(0, Math.round(v.offsetTop));
      setVv((prev) => (prev.offsetTop === offsetTop && prev.height === height ? prev : { offsetTop, height }));
    };
    v.addEventListener('resize', read);
    v.addEventListener('scroll', read);
    read();
    return () => { v.removeEventListener('resize', read); v.removeEventListener('scroll', read); };
  }, []);
  return vv;
}

function ClockButton({ label, onTap, disabled, primary }: { label: string; onTap: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <span onClick={disabled ? undefined : onTap} style={{ flexGrow: label === '■' ? 0 : 1, textAlign: 'center', padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: primary ? T.text : T.card, color: primary ? T.bg : disabled ? T.hint : '#c7cdd6', fontSize: 13, fontWeight: 600, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{label}</span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '6px 4px 0' }}>{children}</div>;
}

/** A chip with the object's headline number under its handle. */
function ObjectChip({ world, refv, nav, text, dense }: { world: World; refv: ObjectRef; nav: Nav; text?: string; dense?: boolean }) {
  const l = labelOf(world, refv);
  const h = headlineOf(world, refv);
  return (
    <span onClick={() => nav.open(refv)} onContextMenu={(e) => { e.preventDefault(); nav.openNew(refv); }} style={{ display: 'inline-flex', flexDirection: 'column', justifyContent: 'center', minHeight: 44, padding: '4px 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, cursor: 'pointer', minWidth: 0 }}>
      <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: '#c7cdd6', whiteSpace: 'nowrap' }}>{text ?? l.ticker.toLowerCase()}</span>
      {h ? <Hint style={{ ...mono, color: h.neg ? T.neg : T.hint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.value}{h.sub && !dense ? ` ${h.sub}` : ''}</Hint> : null}
    </span>
  );
}

function Home({ world, nav, recents, onRecent, stepMs }: { world: World; nav: Nav; recents: string[]; onRecent: (r: string) => void; stepMs?: number }) {
  const regions = Object.keys(world.state.regions);
  const banks = banksOf(world.state.companies).sort((a, b) => stateDepositLines(world.state, b).householdLocal - stateDepositLines(world.state, a).householdLocal);
  const biggest = [...world.state.companies].filter((c) => isActiveCompany(c) && !c.isBankEntity && c.listingStatus !== 'PRIVATE').sort((a, b) => marketCapAt(ensureV2(world.state), b) - marketCapAt(ensureV2(world.state), a)).slice(0, 6);
  const assetsOf = (e: InstitutionalEntity) => institutionTotalAssetsFromState(world.state, e);
  const funds = [...world.state.institutionalEntities].filter((e) => !e.isDefaulted).sort((a, b) => assetsOf(b) - assetsOf(a)).slice(0, 6);
  const live = world.state.companies.filter((c) => isActiveCompany(c)).length;
  const kinds: { type: ObjectType; text: string }[] = OBJECT_TYPES
    .filter((t) => OBJECTS[t].searchable && !['company', 'institution', 'region'].includes(t))
    .map((t) => ({ type: t, text: OBJECTS[t].words[1] }));
  const firstOf = (type: ObjectType): ObjectRef | undefined => { const x = moduleOf(type).list(world).at(0); return x ? { type, id: x.id } : undefined; };
  const Chip = ({ text, onTap, sub }: { text: string; onTap: () => void; sub?: string }) => (
    <span onClick={onTap} style={{ display: 'inline-flex', flexDirection: 'column', justifyContent: 'center', minHeight: 40, padding: '4px 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, cursor: 'pointer' }}>
      <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: '#c7cdd6' }}>{text}</span>
      {sub ? <Hint>{sub}</Hint> : null}
    </span>
  );
  const top = storiesFor(world, undefined, 6);
  return (<>
    <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: 24, fontWeight: 500 }}>the world, {formatDate(displayWeek(world.state))}</div>
      <Hint>{live} firms · {world.state.institutionalEntities.filter((e) => !e.isDefaulted).length} funds · {regions.length} regions{stepMs !== undefined ? ` · last step ${(stepMs / 1000).toFixed(2)} s` : ''}</Hint>
    </div>
    {top.length > 0 ? (<>
      <Label>what happened</Label>
      <Card style={{ overflow: 'hidden' }}>{top.map((it) => <Story key={it.id} item={it} world={world} nav={nav} compact />)}</Card>
    </>) : null}
    <Label>regions · unemployment</Label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>{regions.map((r) => <ObjectChip key={r} world={world} refv={{ type: 'region', id: r }} nav={nav} dense />)}</div>
    <Label>the curves · 10y</Label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>{regions.map((r) => <ObjectChip key={r} world={world} refv={{ type: 'curve', id: r }} nav={nav} text={`${r.toLowerCase()} curve`} dense />)}</div>
    <Label>the central banks · policy rate</Label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>{regions.map((r) => <ObjectChip key={r} world={world} refv={{ type: 'centralbank', id: r }} nav={nav} text={`${r.toLowerCase()} cb`} dense />)}</div>
    <Label>commodities · currencies</Label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {world.state.commodities.map((c) => <ObjectChip key={c.id} world={world} refv={{ type: 'commodity', id: c.id }} nav={nav} />)}
      {world.state.fxPairs.map((p) => <ObjectChip key={p.pair} world={world} refv={{ type: 'fx', id: p.pair }} nav={nav} text={p.pair.toLowerCase()} />)}
    </div>
    <Label>banks</Label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{banks.map((b) => <ObjectChip key={b.id} world={world} refv={{ type: 'company', id: b.id }} nav={nav} />)}</div>
    <Label>largest firms</Label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{biggest.map((c) => <ObjectChip key={c.id} world={world} refv={{ type: 'company', id: c.id }} nav={nav} />)}</div>
    <Label>largest funds</Label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{funds.map((e) => <ObjectChip key={e.id} world={world} refv={{ type: 'institution', id: e.id }} nav={nav} />)}</div>
    <Label>every kind</Label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {kinds.map((k) => { const n = moduleOf(k.type).list(world).length; const first = firstOf(k.type); return first ? <Chip key={k.type} text={k.text} sub={`${n}`} onTap={() => nav.open(first, moduleOf(k.type).peers ? 'peers' : DEFAULT_FUNCTION)} /> : null; })}
    </div>
    {recents.length > 0 ? (<>
      <Label>recent</Label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{recents.map((r) => <Chip key={r} text={r} onTap={() => onRecent(r)} />)}</div>
    </>) : null}
    <Hint style={{ padding: '4px 4px 0', lineHeight: 1.5 }}>type an object — <span style={mono}>krln</span>, <span style={mono}>usa apparel</span>, <span style={mono}>eur/usd</span>, <span style={mono}>oil</span> — and a function: <span style={mono}>krln news</span>, <span style={mono}>usa chart 10y</span>. With an object open, a function alone applies to it: <span style={mono}>statements</span>, <span style={mono}>peers banks</span>, <span style={mono}>chart oas</span>. Long-press a name to open it beside this one; swipe to move between panels. The bench is at <a href="#bench" style={{ color: T.accent }}>#bench</a>.</Hint>
  </>);
}
