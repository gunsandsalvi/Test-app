/**
 * Web Worker side of the clearing kernel — the browser twin of clearing-worker.ts.
 *
 * Same kernel, same shard semantics, different transport: the main thread cannot receive a
 * postMessage while the synchronous week step runs, so the shard result is COPIED into a
 * pre-agreed region of a shared output buffer and completion is signalled on an Atomics
 * doorbell at the head of that buffer. Layout is fixed here and mirrored in
 * clearing-worker-pool-web.ts; readiness is announced once by postMessage (delivered between
 * weeks, when the main thread yields).
 */
import { runClearingKernel } from './financial-clearing-engine';

interface WebJob {
  sab: SharedArrayBuffer;
  out: SharedArrayBuffer;
  n: number;
  pCount: number;
  unsoldStaysWithHolder: boolean;
  from: number;
  to: number;
}

function packViewsOnly(job: WebJob) {
  const { sab, n, pCount } = job;
  let off = 0;
  const f64 = (len: number) => { const v = new Float64Array(sab, off, len); off += len * 8; return v; };
  const np = n * pCount;
  const float = f64(n), offering = f64(n), withdrawStat = f64(n), currentStat = f64(n);
  const dRes = f64(np), dRange = f64(np), dMaxH = f64(np), dMaxNet = f64(np), dMinH = f64(np), prevHolding = f64(np);
  const u8 = (len: number) => { const v = new Uint8Array(sab, off, len); off += len; return v; };
  const yieldLike = u8(n), skip = u8(n), present = u8(np);
  return {
    n, pCount, float, offering, withdrawStat, currentStat, yieldLike, skip,
    present, dRes, dRange, dMaxH, dMaxNet, dMinH, prevHolding,
    unsoldStaysWithHolder: job.unsoldStaysWithHolder === true,
  };
}

self.onmessage = (ev: MessageEvent<WebJob>) => {
  const job = ev.data;
  const shard = runClearingKernel(packViewsOnly(job) as never, job.from, job.to);
  const span = job.to - job.from;
  const cap = span * job.pCount;
  // Mirror of the pool's outLayout: header (2×i32, padded to 8), F64 lanes, I32 lanes, U8 lanes.
  let off = 8;
  const f64 = (len: number) => { const v = new Float64Array(job.out, off, len); off += len * 8; return v; };
  f64(span).set(shard.clearedStat);
  f64(span).set(shard.dealerInventory);
  f64(span).set(shard.primaryMarketTake);
  f64(cap).set(shard.fillFilled.subarray(0, shard.fillCount));
  f64(cap).set(shard.fillTraded.subarray(0, shard.fillCount));
  const i32 = (len: number) => { const v = new Int32Array(job.out, off, len); off += len * 4; return v; };
  i32(cap).set(shard.fillInst.subarray(0, shard.fillCount));
  i32(cap).set(shard.fillPart.subarray(0, shard.fillCount));
  const u8 = (len: number) => { const v = new Uint8Array(job.out, off, len); off += len; return v; };
  u8(span).set(shard.primaryWithdrawn);
  u8(span).set(shard.hasPrimary);
  u8(span).set(shard.uncleared);
  const header = new Int32Array(job.out, 0, 2);
  header[1] = shard.fillCount;
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0);
};

// Announce readiness so the pool only dispatches to workers whose script has evaluated.
(self as unknown as Worker).postMessage('ready');
