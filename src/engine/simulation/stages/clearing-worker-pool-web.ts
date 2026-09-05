/**
 * Browser worker pool for the clearing kernel — the Web Worker twin of clearing-worker-pool.ts.
 *
 * Same sharding, same ordered accumulation (bit-identical sums), different plumbing for the two
 * things a browser forbids: `Atomics.wait` on the main thread (a bounded spin on the doorbell
 * instead) and receiving a worker's postMessage mid-step (each worker writes its shard into its
 * own shared output buffer instead; layout fixed in clearing-worker-web.ts).
 *
 * Requires cross-origin isolation (the coi-serviceworker shim provides it on static hosts) and
 * is opt-in from the bench UI via setClearingWorkersWeb(n); n=0 keeps the serial path. Any
 * failure marks the pool dead and the caller falls back to the identical serial kernel.
 */
import type { PackedClearing, KernelShardResult } from './financial-clearing-engine';
import { registerShardedKernel } from './financial-clearing-engine';

interface WebPoolWorker {
  worker: Worker;
  ready: boolean;
  out: SharedArrayBuffer | null;
}

let requested = 0;
let pool: WebPoolWorker[] | null = null;
let poolDead = false;
let sharedBuffer: SharedArrayBuffer | null = null;
let registered = false;

export function webWorkersAvailable(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true
    && typeof SharedArrayBuffer !== 'undefined' && typeof Worker !== 'undefined';
}

/** How many workers the pool is set to use (0 = serial path). */
function clearingWorkersWeb(): number {
  return poolDead ? 0 : requested;
}

/** Bench-UI entry point: size the pool (workers spawn eagerly so their scripts load while the
 *  user is still looking at the screen). Registration happens on the first enable, at runtime,
 *  so it always lands after the Node pool's import-time self-registration. */
export function setClearingWorkersWeb(n: number): void {
  if (!webWorkersAvailable()) { requested = 0; return; }
  requested = Math.max(0, Math.min(16, Math.floor(n)));
  if (pool) {
    for (const w of pool) w.worker.terminate();
    pool = null;
  }
  poolDead = false;
  if (requested >= 2) {
    ensurePool();
    if (!registered) {
      registered = true;
      registerShardedKernel({
        workerCount: clearingWorkersWeb,
        sharedBuffer: sharedPackBufferWeb,
        run: runShardedKernelWeb,
      });
    }
  }
}

function ensurePool(): WebPoolWorker[] | null {
  if (pool) return pool;
  if (poolDead || requested < 2) return null;
  try {
    pool = [];
    for (let i = 0; i < requested; i++) {
      const worker = new Worker(new URL('./clearing-worker-web.ts', import.meta.url), { type: 'module' });
      const entry: WebPoolWorker = { worker, ready: false, out: null };
      worker.onmessage = (ev) => { if (ev.data === 'ready') entry.ready = true; };
      worker.onerror = () => { poolDead = true; };
      pool.push(entry);
    }
    return pool;
  } catch {
    poolDead = true;
    return null;
  }
}

function sharedPackBufferWeb(bytes: number): SharedArrayBuffer | null {
  if (!ensurePool()) return null;
  if (!sharedBuffer || sharedBuffer.byteLength < bytes) {
    sharedBuffer = new SharedArrayBuffer(Math.ceil(bytes / 65536) * 65536);
  }
  return sharedBuffer;
}

/** Bytes of the per-worker output region for a shard of `span` instruments; mirrors the write
 *  order in clearing-worker-web.ts: header (8B), 6 F64 lanes, 2 I32 lanes, 3 U8 lanes. */
function outBytes(span: number, pCount: number): number {
  const cap = span * pCount;
  return 8 + (3 * span + 2 * cap) * 8 + 2 * cap * 4 + 3 * span;
}

function shardFromOut(out: SharedArrayBuffer, from: number, to: number, pCount: number): KernelShardResult {
  const span = to - from;
  const cap = span * pCount;
  const header = new Int32Array(out, 0, 2);
  const fillCount = header[1];
  let off = 8;
  const f64 = (len: number) => { const v = new Float64Array(out, off, len); off += len * 8; return v; };
  const clearedStat = f64(span), dealerInventory = f64(span), primaryMarketTake = f64(span);
  const fillFilled = f64(cap), fillTraded = f64(cap);
  const i32 = (len: number) => { const v = new Int32Array(out, off, len); off += len * 4; return v; };
  const fillInst = i32(cap), fillPart = i32(cap);
  const u8 = (len: number) => { const v = new Uint8Array(out, off, len); off += len; return v; };
  const primaryWithdrawn = u8(span), hasPrimary = u8(span);
  return {
    from, to, clearedStat, dealerInventory, primaryWithdrawn, primaryMarketTake, hasPrimary,
    fillInst: fillInst.subarray(0, fillCount),
    fillPart: fillPart.subarray(0, fillCount),
    fillFilled: fillFilled.subarray(0, fillCount),
    fillTraded: fillTraded.subarray(0, fillCount),
    fillCount,
  } as KernelShardResult;
}

function runShardedKernelWeb(packed: PackedClearing, sab: SharedArrayBuffer): KernelShardResult[] | null {
  const workers = ensurePool();
  if (!workers) return null;
  const readyWorkers = workers.filter((w) => w.ready);
  const n = packed.n;
  const w = Math.min(readyWorkers.length, Math.max(1, Math.floor(n / 16)));
  if (w < 2) return null; // workers still loading, or book too small — serial this week
  const per = Math.ceil(n / w);
  const jobMeta = {
    sab, n, pCount: packed.pCount,
    unsoldStaysWithHolder: packed.unsoldStaysWithHolder,
  };
  for (let i = 0; i < w; i++) {
    const from = i * per;
    const to = Math.min(n, from + per);
    const need = outBytes(to - from, packed.pCount);
    const entry = readyWorkers[i];
    if (!entry.out || entry.out.byteLength < need) {
      entry.out = new SharedArrayBuffer(Math.ceil(need / 65536) * 65536);
    }
    new Int32Array(entry.out, 0, 1)[0] = 0;
    entry.worker.postMessage({ ...jobMeta, out: entry.out, from, to });
  }
  const shards: KernelShardResult[] = [];
  for (let i = 0; i < w; i++) {
    const entry = readyWorkers[i];
    const header = new Int32Array(entry.out!, 0, 2);
    // The browser main thread may not Atomics.wait; a bounded spin costs one core for the few
    // milliseconds a shard takes and dies cleanly if a worker does.
    const t0 = performance.now();
    while (Atomics.load(header, 0) === 0) {
      if (poolDead || performance.now() - t0 > 10000) { poolDead = true; return null; }
    }
    const from = i * per;
    const to = Math.min(n, from + per);
    shards.push(shardFromOut(entry.out!, from, to, packed.pCount));
  }
  return shards;
}
