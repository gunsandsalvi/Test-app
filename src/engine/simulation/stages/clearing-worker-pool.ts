/**
 * A synchronous worker pool for the clearing kernel (§5-SCALE).
 *
 * The weekly step is synchronous and stays so: jobs go out on MessagePorts, the main thread
 * blocks on an Atomics doorbell per worker, and `receiveMessageOnPort` collects each shard
 * synchronously. Shards are contiguous instrument ranges collected in worker order, so the
 * ordered accumulation on the main thread walks fills in exactly the sequence the un-sharded
 * loop did — the same floating-point sums, bit for bit.
 *
 * Node-only and opt-in (CLEARING_WORKERS=n): the browser build never touches this module, and
 * with the pool off the serial path runs the identical kernel. Either way, one world.
 */
import type { PackedClearing, KernelShardResult } from './financial-clearing-engine';
import { registerShardedKernel } from './financial-clearing-engine';

interface PoolWorker {
  worker: import('worker_threads').Worker;
  port: import('worker_threads').MessagePort;
  doorbell: Int32Array;
  failed: boolean;
}

let pool: PoolWorker[] | null = null;
let poolUnavailable = false;
let receiveMessageOnPortFn: ((port: unknown) => { message: unknown } | undefined) | null = null;
let sharedBuffer: SharedArrayBuffer | null = null;

function clearingWorkerCount(): number {
  if (typeof process === 'undefined' || !process.versions.node) return 0;
  const n = Number(process.env.CLEARING_WORKERS ?? 0);
  return Number.isFinite(n) && n >= 2 ? Math.min(16, Math.floor(n)) : 0;
}

function ensurePool(): PoolWorker[] | null {
  if (pool) return pool;
  if (poolUnavailable) return null;
  const count = clearingWorkerCount();
  if (!count || typeof process === 'undefined' || !process.versions.node) {
    poolUnavailable = true;
    return null;
  }
  try {
    // Node's own escape hatch for builtins from ESM without a bundler-visible import — undefined
    // outside Node, which is exactly the gate we want for the browser build.
    const wt = (process as unknown as { getBuiltinModule?: (m: string) => unknown })
      .getBuiltinModule?.('worker_threads') as typeof import('worker_threads') | undefined;
    if (!wt) { poolUnavailable = true; return null; }
    receiveMessageOnPortFn = wt.receiveMessageOnPort as never;
    const workerUrl = new URL('./clearing-worker.ts', import.meta.url);
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
        if (!poolUnavailable) console.error(`[clearing-worker-pool] worker error, falling back to serial: ${err.message}`);
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

function sharedPackBuffer(bytes: number): SharedArrayBuffer | null {
  if (!ensurePool()) return null;
  if (!sharedBuffer || sharedBuffer.byteLength < bytes) {
    sharedBuffer = new SharedArrayBuffer(Math.ceil(bytes / 65536) * 65536);
  }
  return sharedBuffer;
}

/** Run the kernel over [0, n) split across the pool. Returns shards in instrument order, or
 *  null when the pool is unavailable (caller falls back to the serial kernel). */
function runShardedKernel(packed: PackedClearing, sab: SharedArrayBuffer): KernelShardResult[] | null {
  const workers = ensurePool();
  if (!workers || !receiveMessageOnPortFn) return null;
  const n = packed.n;
  const w = Math.min(workers.length, Math.max(1, Math.floor(n / 16)));
  if (w < 2) return null;
  const per = Math.ceil(n / w);
  const jobMeta = {
    sab, n, pCount: packed.pCount,
    // Must travel with the job: the worker rebuilds the packed struct from these fields, and a
    // flag left behind here would run a DIFFERENT market in the worker path than in the serial
    // one — silently, because the rebuilt object is handed to the kernel as `never`.
    unsoldStaysWithHolder: packed.unsoldStaysWithHolder,
  };
  for (let i = 0; i < w; i++) {
    const from = i * per;
    const to = Math.min(n, from + per);
    Atomics.store(workers[i].doorbell, 0, 0);
    workers[i].port.postMessage({ ...jobMeta, from, to });
  }
  const shards: KernelShardResult[] = [];
  for (let i = 0; i < w; i++) {
    // NEVER wait unbounded: a worker that failed to start would otherwise hang the whole run
    // (measured: it did — a >5 minute stall on a 15-second workload). Time out, mark the pool
    // dead, and let the caller take the serial path; the world is identical either way.
    let waited = 0;
    while (Atomics.load(workers[i].doorbell, 0) === 0) {
      if (workers[i].failed || poolUnavailable || waited > 10000) { poolUnavailable = true; return null; }
      Atomics.wait(workers[i].doorbell, 0, 0, 250);
      waited += 250;
    }
    const msg = receiveMessageOnPortFn(workers[i].port);
    if (!msg) { poolUnavailable = true; return null; }
    shards.push(msg.message as KernelShardResult);
  }
  return shards;
}

// Self-registration: importing this module (core.ts does, for its side effect) hands the engine
// the worker path. The engine itself imports nothing, so worker threads can load it alone.
registerShardedKernel({
  workerCount: clearingWorkerCount,
  sharedBuffer: sharedPackBuffer,
  run: runShardedKernel,
});
