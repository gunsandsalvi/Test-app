/**
 * BENCH SHELL — the whole UI is one control row and one copy-pasteable report.
 *
 * Purpose: measure the engine in real browser conditions. Run / Stop / Restart drive the
 * weekly step on the main thread (yielding between weeks so the tab stays responsive); every
 * week is profiled per stage (`advanceWeeklyStepProfiled`, one performance.now per stage), and
 * the report below is plain monospace text built for copy-paste into an issue or the plan.
 *
 * The previous product UI was removed deliberately (it was scheduled for removal); nothing
 * else renders here.
 */
import { useEffect, useRef, useState } from 'react';
import { GameState } from './types';
import { createInitialGameState } from './engine/simulation';
import { advanceWeeklyStepProfiled } from './engine/simulation/core';
import { setClearingWorkersWeb, webWorkersAvailable } from './engine/simulation/stages/clearing-worker-pool-web';
import { cashOf } from './engine/ledger/accounts';
import { ensureV2 } from './engine2/world';

interface WeekSample {
  week: number;
  ms: number;
  stages: { stage: string; ms: number }[];
}

/** Steady-state means skip the warm-up weeks, matching the harness's convention. */
const WARMUP_WEEKS = 3;

/** Cheap deterministic world checksum; equal digests at a checkpoint mean two runs (e.g.
 *  workers on vs off) computed the identical world. */
function worldDigest(state: GameState): string {
  let sum = 0;
  const v2 = ensureV2(state);
  for (const c of state.companies) sum += c.stockPrice + cashOf(v2, c);
  return sum.toPrecision(17);
}
const DIGEST_WEEKS = [1, 5, 10, 20, 50];

function buildReport(
  samples: WeekSample[], running: boolean, error: string | null,
  workers: number, digests: Map<number, string>,
): string {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const lines: string[] = [];
  lines.push(`ENGINE BENCH ${new Date().toISOString()}`);
  lines.push(`ua: ${nav?.userAgent ?? 'n/a'}`);
  lines.push(`cores (hardwareConcurrency): ${nav?.hardwareConcurrency ?? 'n/a'}`
    + ` | crossOriginIsolated (SharedArrayBuffer usable): ${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'n/a'}`);
  if (mem) lines.push(`js heap: ${(mem.usedJSHeapSize / 1e6).toFixed(0)}MB used / ${(mem.jsHeapSizeLimit / 1e6).toFixed(0)}MB limit`);
  lines.push(`clearing workers: ${workers === 0 ? 'off (serial)' : workers}`);
  lines.push(`status: ${running ? 'RUNNING' : 'STOPPED'} | weeks run: ${samples.length}`);
  if (digests.size > 0) {
    lines.push(`world digest @wk: ${[...digests.entries()].map(([w, d]) => `${w}=${d}`).join(' ')}`);
  }
  if (error) lines.push(`ERROR: ${error}`);
  if (samples.length === 0) return lines.join('\n');

  const all = samples.map((s) => s.ms);
  const steady = samples.slice(WARMUP_WEEKS).map((s) => s.ms);
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  // Median is the headline: phones throttle backgrounded tabs into multi-second outlier
  // weeks that poison a mean but leave the median untouched.
  const median = (v: number[]) => {
    if (!v.length) return NaN;
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  lines.push(`last week: ${all[all.length - 1].toFixed(0)}ms`
    + ` | steady median (wk>${WARMUP_WEEKS}): ${steady.length ? median(steady).toFixed(0) : 'n/a'}ms`
    + ` | steady mean: ${steady.length ? mean(steady).toFixed(0) : 'n/a'}ms`
    + ` | min/max: ${Math.min(...all).toFixed(0)}/${Math.max(...all).toFixed(0)}ms`);

  // Per-stage steady-state means, largest first ("usage for each branch"), computed only over
  // non-outlier weeks (>3x the steady median = OS throttling, not the engine).
  const cut = 3 * median(steady);
  const kept = samples.slice(WARMUP_WEEKS).filter((s) => s.ms <= cut);
  const dropped = Math.max(0, samples.length - WARMUP_WEEKS - kept.length);
  if (dropped > 0) lines.push(`outlier weeks excluded from stage means: ${dropped} (>${cut.toFixed(0)}ms)`);
  const byStage = new Map<string, { total: number; n: number }>();
  for (const s of kept) {
    for (const t of s.stages) {
      const e = byStage.get(t.stage) ?? { total: 0, n: 0 };
      e.total += t.ms; e.n++;
      byStage.set(t.stage, e);
    }
  }
  if (byStage.size > 0) {
    const weekMean = mean(kept.map((s) => s.ms));
    const rows = [...byStage.entries()]
      .map(([stage, e]) => ({ stage, mean: e.total / e.n }))
      .sort((a, b) => b.mean - a.mean);
    lines.push('stage means (steady):');
    for (const r of rows) {
      lines.push(`  ${r.mean.toFixed(1).padStart(8)}ms  ${((100 * r.mean) / weekMean).toFixed(1).padStart(5)}%  ${r.stage}`);
    }
  }
  lines.push(`per-week ms: ${all.map((m) => m.toFixed(0)).join(' ')}`);
  return lines.join('\n');
}

export default function App() {
  const stateRef = useRef<GameState | null>(null);
  const runningRef = useRef(false);
  const samplesRef = useRef<WeekSample[]>([]);
  const [, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState(0);
  const digestsRef = useRef(new Map<number, string>());

  const onWorkers = (n: number) => {
    setWorkers(n);
    setClearingWorkersWeb(n);
  };

  // Default to every available thread; the dropdown stays for A/B against fewer (the main
  // thread spin-waits during shards, so max is not guaranteed to beat max-1 — measure it).
  useEffect(() => {
    if (webWorkersAvailable()) onWorkers(navigator.hardwareConcurrency);
  }, []);

  const fail = (e: unknown) => {
    runningRef.current = false;
    setRunning(false);
    setSeeding(false);
    setError(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));
  };

  const loop = () => {
    if (!runningRef.current || !stateRef.current) return;
    try {
      const t0 = performance.now();
      const r = advanceWeeklyStepProfiled(stateRef.current, { profile: true });
      const ms = performance.now() - t0;
      stateRef.current = r.state;
      samplesRef.current.push({ week: r.state.currentWeek, ms, stages: r.timings });
      if (DIGEST_WEEKS.includes(samplesRef.current.length)) {
        digestsRef.current.set(samplesRef.current.length, worldDigest(r.state));
      }
    } catch (e) {
      fail(e);
      return;
    }
    setTick((t) => t + 1);
    // Yield to the browser between weeks so Stop stays clickable and paints happen.
    setTimeout(loop, 0);
  };

  const onRun = () => {
    if (runningRef.current || seeding) return;
    setError(null);
    if (!stateRef.current) {
      // Seed on the next tick so the "Seeding…" label paints before the thread blocks.
      setSeeding(true);
      setTimeout(() => {
        try {
          stateRef.current = createInitialGameState();
        } catch (e) {
          fail(e);
          return;
        }
        setSeeding(false);
        runningRef.current = true;
        setRunning(true);
        setTimeout(loop, 0);
      }, 30);
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setTimeout(loop, 0);
  };
  const onStop = () => {
    runningRef.current = false;
    setRunning(false);
  };
  const onRestart = () => {
    runningRef.current = false;
    setRunning(false);
    stateRef.current = null;
    samplesRef.current = [];
    digestsRef.current = new Map();
    setError(null);
    setTick((t) => t + 1);
  };

  useEffect(() => () => { runningRef.current = false; }, []);

  const report = buildReport(samplesRef.current, running, error, workers, digestsRef.current);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Selection fallback: the <pre> below is selectable; nothing else to do.
    }
  };

  const btn: React.CSSProperties = {
    padding: '8px 18px', marginRight: 8, fontSize: 14, cursor: 'pointer',
    border: '1px solid #888', borderRadius: 6, background: '#f5f5f5',
  };
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900 }}>
      <div style={{ marginBottom: 12 }}>
        <button style={btn} onClick={onRun} disabled={running || seeding}>
          {seeding ? 'Seeding…' : running ? 'Running' : 'Run'}
        </button>
        <button style={btn} onClick={onStop} disabled={!running}>Stop</button>
        <button style={btn} onClick={onRestart}>Restart</button>
        <button style={btn} onClick={onCopy}>{copied ? 'Copied ✓' : 'Copy report'}</button>
        {webWorkersAvailable() && (
          <label style={{ fontSize: 14, marginLeft: 4 }}>
            workers:{' '}
            <select
              value={workers}
              onChange={(e) => onWorkers(Number(e.target.value))}
              style={{ fontSize: 14, padding: '6px 8px' }}
            >
              {[...new Set([0, 2, 4,
                Math.max(2, navigator.hardwareConcurrency - 1),
                Math.max(2, navigator.hardwareConcurrency)])]
                .sort((a, b) => a - b)
                .map((n) => <option key={n} value={n}>{n === 0 ? 'off' : n}</option>)}
            </select>
          </label>
        )}
      </div>
      <pre style={{
        background: '#111', color: '#d6f2d6', padding: 12, borderRadius: 6,
        fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', userSelect: 'text',
        minHeight: 200, overflowX: 'auto',
      }}>{report}</pre>
    </div>
  );
}
