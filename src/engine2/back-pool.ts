/**
 * §7.325 W2 — a synchronous worker pool for the BACK kernel's A phase, on the front pool's
 * proven skeleton (§7.305): jobs on MessagePorts, an Atomics doorbell per worker, any failure
 * marks the pool dead and the caller runs the same firms serially — the world is identical
 * either way, because both paths run the SAME `runBackCoreA` and the §7.325 firm-major replay
 * folds worker emissions exactly where the serial walk's went.
 *
 * IDENTITY DISCIPLINE (the design that removed all id remapping): before dispatch the main
 * thread PRE-INTERNS, per firm in row order, every party core-A can emit — self, unmodeled,
 * household and government of the region, the home bank and its credit, the vehicle
 * institution — and the A walk's settled reason labels; each worker's intern tables are then
 * seeded with the full table deltas in id order, so every id a worker writes is canonical.
 * A worker whose tables grow anyway throws, killing the pool for the run (correctness first).
 *
 * Split API so the main thread can run the ~75 profile firms' A while the workers run:
 * `dispatchBackA` posts the jobs, `collectBackA` blocks on the doorbells.
 */
import { BackLanes } from './stage08-lanes.ts';
import { bankCreditPartyOfTicker, bankPartyOfTicker, companyPartyOfTicker } from '../domain/party';
import { FrontPass } from './stage08-front.ts';
import type { BackAShardOut } from './back-worker.ts';
import { partyId, partyTableSize, partyRefsFrom } from '../engine/ledger/party';
import { internReason, reasonTableSize, reasonTextsFrom } from '../engine/simulation/stages/settlement';
import { WeeklyStepContext } from '../engine/simulation/stages/context';
import { asEntityId } from '../domain/ids';

interface PoolWorker {
  worker: import('worker_threads').Worker;
  port: import('worker_threads').MessagePort;
  doorbell: Int32Array;
  failed: boolean;
  sentParties: number;
  sentReasons: number;
}

let pool: PoolWorker[] | null = null;
let poolUnavailable = false;
let engagedLogged = false;
let receiveMessageOnPortFn: ((port: unknown) => { message: unknown } | undefined) | null = null;

export function backWorkerCount(): number {
  if (typeof process === 'undefined' || !process.versions?.node) return 0;
  const n = Number(process.env?.BACK_WORKERS ?? 0);
  return Number.isFinite(n) && n >= 2 ? Math.min(16, Math.floor(n)) : 0;
}

/** The env-gated diagnostics accumulate in module state a worker cannot share — serial only. */
function debugEnvBlocksPool(): boolean {
  const e = process.env;
  return e.CASH_LEDGER === '1' || e.LEARN_TRACE === '1' || e.BYPASS_TRACE === '1'
    || e.BOUNDARY_TRACE === '1';
}

function ensurePool(): PoolWorker[] | null {
  if (pool) return pool;
  if (poolUnavailable) return null;
  const count = backWorkerCount();
  if (!count || typeof process === 'undefined' || !process.versions?.node) {
    poolUnavailable = true;
    return null;
  }
  try {
    const wt = (process as unknown as { getBuiltinModule?: (m: string) => unknown })
      .getBuiltinModule?.('worker_threads') as typeof import('worker_threads') | undefined;
    if (!wt) { poolUnavailable = true; return null; }
    receiveMessageOnPortFn = wt.receiveMessageOnPort as never;
    const workerUrl = new URL('./back-worker.ts', import.meta.url);
    pool = [];
    for (let i = 0; i < count; i++) {
      const channel = new wt.MessageChannel();
      const doorbell = new Int32Array(new SharedArrayBuffer(4));
      const worker = new wt.Worker(workerUrl, {
        workerData: { port: channel.port2, doorbell },
        transferList: [channel.port2],
        execArgv: process.execArgv,
      });
      const entry: PoolWorker = { worker, port: channel.port1, doorbell, failed: false, sentParties: 0, sentReasons: 0 };
      worker.on('error', (err) => {
        entry.failed = true;
        if (!poolUnavailable) console.error(`[back-pool] worker error, falling back to serial: ${err?.message ?? err}`);
        poolUnavailable = true;
      });
      worker.on('exit', (code) => { if (code !== 0) { entry.failed = true; poolUnavailable = true; } });
      worker.unref();
      pool.push(entry);
    }
    return pool;
  } catch {
    poolUnavailable = true;
    return null;
  }
}

/** The A walk's settled reason labels — every label `runCashWalk`/`makeCashPoster` can intern.
 *  (settle:false legs never reach `internReason`, so they are deliberately absent.) */
const A_REASON_LABELS = [
  'wages paid to households',
  'inventory carrying cost',
  'facility interest to the lending bank',
  'cash taxes (quarterly remittance)',
  'maintenance funding draw (new tranche proceeds)',
  'operating receipts drawn from the vehicle',
  'operating costs borne by the vehicle',
];

/** Pre-intern, per firm in row order, every party core-A can emit — a memo hit after each
 *  party's first week, so this is cheap; what it buys is that no worker ever assigns an id. */
function preInternBackA(L: BackLanes): void {
  for (const label of A_REASON_LABELS) internReason(label);
  for (let i = 0; i < L.n; i++) {
    partyId(companyPartyOfTicker(L.ticker[i]));
    partyId({ kind: 'HOUSEHOLD', region: L.region[i] });
    partyId({ kind: 'GOVERNMENT', region: L.region[i] });
    const bank = L.homeBankId[i];
    if (bank) {
      partyId(bankPartyOfTicker(bank));
      partyId(bankCreditPartyOfTicker(bank));
    }
    if (L.hasVehicle[i] === 1) partyId({ kind: 'INSTITUTION', id: asEntityId(L.companyId[i]) });
  }
}

/** Strip an object to its typed-array/primitive lanes (object-ref lanes stay main-side). */
function typedLanesOf<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (ArrayBuffer.isView(v) || typeof v === 'number' || typeof v === 'string') out[k] = v;
  }
  return out;
}

export interface BackADispatch {
  w: number;
  ranges: { lo: number; hi: number }[];
}

/**
 * Post the week's A jobs. Returns null when the pool is unavailable or blocked — the caller
 * runs every firm serially, exactly as before.
 */
export function dispatchBackA(args: {
  lanes: BackLanes;
  F: FrontPass;
  updatedRegions: WeeklyStepContext['updatedRegions'];
  channelShareByRegion: WeeklyStepContext['channelShareByRegion'];
  nextWeek: number;
  currentWeekMod13: number;
}): BackADispatch | null {
  if (debugEnvBlocksPool()) return null;
  const workers = ensurePool();
  if (!workers || !receiveMessageOnPortFn) return null;
  const n = args.lanes.n;
  const w = Math.min(workers.length, Math.max(1, Math.floor(n / 64)));
  if (w < 2) return null;

  preInternBackA(args.lanes);

  const regions: Record<string, { effectiveTaxRate: number; bankingSector: { bankCapitalRatio: number } }> = {};
  for (const [r, reg] of Object.entries(args.updatedRegions)) {
    regions[r] = {
      effectiveTaxRate: reg.effectiveTaxRate,
      bankingSector: { bankCapitalRatio: reg.bankingSector.bankCapitalRatio },
    };
  }
  const f = typedLanesOf(args.F);

  const per = Math.ceil(n / w);
  const ranges: { lo: number; hi: number }[] = [];
  for (let i = 0; i < w; i++) {
    const lo = i * per;
    const hi = Math.min(n, lo + per);
    ranges.push({ lo, hi });
    const entry = workers[i];
    const partyRefs = partyRefsFrom(entry.sentParties);
    const reasonTexts = reasonTextsFrom(entry.sentReasons);
    Atomics.store(entry.doorbell, 0, 0);
    entry.port.postMessage({
      lanes: args.lanes, f, regions,
      channelShareByRegion: args.channelShareByRegion,
      nextWeek: args.nextWeek, currentWeekMod13: args.currentWeekMod13,
      partyRefs, partySeedFrom: entry.sentParties,
      reasonTexts, reasonSeedFrom: entry.sentReasons,
      lo, hi,
    });
    entry.sentParties = partyTableSize();
    entry.sentReasons = reasonTableSize();
  }
  if (!engagedLogged) {
    engagedLogged = true;
    console.error(`[back-pool] engaged: ${w} A shards over ${n} firms`);
  }
  return { w, ranges };
}

/** Block on the doorbells; null on any failure (the caller re-runs those firms serially). */
export function collectBackA(dispatch: BackADispatch): BackAShardOut[] | null {
  const workers = pool;
  if (!workers || !receiveMessageOnPortFn) return null;
  const out: BackAShardOut[] = [];
  for (let i = 0; i < dispatch.w; i++) {
    let waited = 0;
    while (Atomics.load(workers[i].doorbell, 0) === 0) {
      if (workers[i].failed || poolUnavailable || waited > 20000) { poolUnavailable = true; return null; }
      Atomics.wait(workers[i].doorbell, 0, 0, 250);
      waited += 250;
    }
    const msg = receiveMessageOnPortFn(workers[i].port);
    if (!msg) { poolUnavailable = true; return null; }
    out.push(msg.message as BackAShardOut);
  }
  return out;
}
