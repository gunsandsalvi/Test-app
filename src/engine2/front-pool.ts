/**
 * ENGINE V2 — a synchronous worker pool for the front core (§7.305, the worker chain), on the
 * clearing pool's proven skeleton: jobs go out on MessagePorts, the main thread blocks on an
 * Atomics doorbell per worker with a hard timeout, and any failure marks the pool dead so the
 * caller falls back to the serial core — the world is identical either way, because both paths
 * run the SAME `runFrontCore` over disjoint row ranges with per-firm RNG opened by stream word.
 *
 * The lot table is the one shared MUTABLE structure the core touches, so the pool works on a
 * SharedArrayBuffer MIRROR of its columns: copied in before the shards run (a memcpy), copied
 * back after, with fully-consumed rows returned through per-shard dead sinks and merged onto
 * the free list here, in shard order. Rows are per-firm chains, shards are firm ranges, so no
 * two workers ever touch the same row.
 *
 * Node-only and opt-in (FRONT_WORKERS=n): the browser build never touches this module.
 */
import { FrontSeam, FrontCoreOut } from './front-core';
import { FrontPass } from './stage08-front';
import { LotViews, freeLotRows } from './lots';
import { V2World } from './world';

interface PoolWorker {
  worker: import('worker_threads').Worker;
  port: import('worker_threads').MessagePort;
  doorbell: Int32Array;
  failed: boolean;
}

let pool: PoolWorker[] | null = null;
let poolUnavailable = false;
let receiveMessageOnPortFn: ((port: unknown) => { message: unknown } | undefined) | null = null;

export function frontWorkerCount(): number {
  if (typeof process === 'undefined' || !process.versions?.node) return 0;
  const n = Number(process.env?.FRONT_WORKERS ?? 0);
  return Number.isFinite(n) && n >= 2 ? Math.min(16, Math.floor(n)) : 0;
}

function ensurePool(): PoolWorker[] | null {
  if (pool) return pool;
  if (poolUnavailable) return null;
  const count = frontWorkerCount();
  if (!count || typeof process === 'undefined' || !process.versions?.node) {
    poolUnavailable = true;
    return null;
  }
  try {
    const wt = (process as unknown as { getBuiltinModule?: (m: string) => unknown })
      .getBuiltinModule?.('worker_threads') as typeof import('worker_threads') | undefined;
    if (!wt) { poolUnavailable = true; return null; }
    receiveMessageOnPortFn = wt.receiveMessageOnPort as never;
    const workerUrl = new URL('./front-worker.ts', import.meta.url);
    pool = [];
    for (let i = 0; i < count; i++) {
      const channel = new wt.MessageChannel();
      const doorbell = new Int32Array(new SharedArrayBuffer(4));
      const worker = new wt.Worker(workerUrl, {
        workerData: { port: channel.port2, doorbell },
        transferList: [channel.port2],
        execArgv: process.execArgv,
      });
      const entry: PoolWorker = { worker, port: channel.port1, doorbell, failed: false };
      worker.on('error', (err) => {
        entry.failed = true;
        if (!poolUnavailable) console.error(`[front-pool] worker error, falling back to serial: ${err?.message ?? err}`);
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

/** The shared lot mirror, kept across weeks and grown as the store grows. */
let mirror: LotViews | null = null;
let mirrorRowCap = 0;
let mirrorSlotCap = 0;

function ensureMirror(rowCap: number, slotCap: number): LotViews {
  if (!mirror || mirrorRowCap < rowCap || mirrorSlotCap < slotCap) {
    mirrorRowCap = Math.max(rowCap, mirrorRowCap * 2, 1 << 12);
    mirrorSlotCap = Math.max(slotCap, mirrorSlotCap * 2, 1 << 12);
    mirror = {
      units: new Float64Array(new SharedArrayBuffer(mirrorRowCap * 8)),
      priceUSD: new Float64Array(new SharedArrayBuffer(mirrorRowCap * 8)),
      acquiredWeek: new Int32Array(new SharedArrayBuffer(mirrorRowCap * 4)),
      next: new Int32Array(new SharedArrayBuffer(mirrorRowCap * 4)),
      head: new Int32Array(new SharedArrayBuffer(mirrorSlotCap * 4)),
      tail: new Int32Array(new SharedArrayBuffer(mirrorSlotCap * 4)),
    };
  }
  return mirror;
}

/** Strip an object to its typed-array lanes (the worker writes through the shared memory; the
 *  object-ref lanes belong to the main thread's POST phase and never travel). */
function typedLanesOf<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (ArrayBuffer.isView(v) || typeof v === 'number' || typeof v === 'string' || Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Run the front core over [0, n) split across the pool. Returns true when the shards ran (lanes
 * updated in place); false when the pool is unavailable and the caller must run serially.
 */
export function runFrontSharded(S: FrontSeam, O: FrontCoreOut, F: FrontPass, v2: V2World): boolean {
  const workers = ensurePool();
  if (!workers || !receiveMessageOnPortFn) return false;
  const n = S.n;
  const w = Math.min(workers.length, Math.max(1, Math.floor(n / 64)));
  if (w < 2) return false;

  const L = v2.lots;
  const M = ensureMirror(L.cap, L.head.length);
  M.units.set(L.units);
  M.priceUSD.set(L.priceUSD);
  M.acquiredWeek.set(L.acquiredWeek);
  M.next.set(L.next);
  M.head.set(L.head);
  M.tail.set(L.tail);

  const seamLanes = typedLanesOf(S);
  const outLanes = typedLanesOf(O);
  const fLanes = typedLanesOf(F);
  const lotViews: LotViews = M;

  const per = Math.ceil(n / w);
  for (let i = 0; i < w; i++) {
    const lo = i * per;
    const hi = Math.min(n, lo + per);
    Atomics.store(workers[i].doorbell, 0, 0);
    workers[i].port.postMessage({ seam: seamLanes, out: outLanes, f: fLanes, lots: lotViews, lo, hi });
  }
  const deadByShard: number[][] = [];
  for (let i = 0; i < w; i++) {
    let waited = 0;
    while (Atomics.load(workers[i].doorbell, 0) === 0) {
      if (workers[i].failed || poolUnavailable || waited > 10000) { poolUnavailable = true; return false; }
      Atomics.wait(workers[i].doorbell, 0, 0, 250);
      waited += 250;
    }
    const msg = receiveMessageOnPortFn(workers[i].port);
    if (!msg) { poolUnavailable = true; return false; }
    deadByShard.push((msg.message as { dead: number[] }).dead);
  }

  // Copy the mutated lot columns home, then merge the dead rows in shard order.
  L.units.set(M.units.subarray(0, L.cap));
  L.priceUSD.set(M.priceUSD.subarray(0, L.cap));
  L.acquiredWeek.set(M.acquiredWeek.subarray(0, L.cap));
  L.next.set(M.next.subarray(0, L.cap));
  L.head.set(M.head.subarray(0, L.head.length));
  L.tail.set(M.tail.subarray(0, L.tail.length));
  for (const dead of deadByShard) freeLotRows(v2, dead);
  return true;
}
