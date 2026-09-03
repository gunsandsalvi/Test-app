/**
 * Worker-thread side of the clearing kernel (§5-SCALE, worker-parallel clearing books).
 *
 * Receives a job — a SharedArrayBuffer holding the packed clearing plus a shard range — runs the
 * SAME `runClearingKernel` the serial path runs (one module, one arithmetic), posts the shard
 * result back, and rings the doorbell. Node-only; the browser build never imports this file.
 */
import { workerData } from 'worker_threads';
import { runClearingKernel } from './financial-clearing-engine.ts';

interface Job {
  sab: SharedArrayBuffer;
  n: number;
  pCount: number;
  dealerSpreadBps: number;
  maxWeeklyStatMovePct: number; // always NaN: no cap (§5-CLOSE)
  unsoldStaysWithHolder: boolean;
  from: number;
  to: number;
}

const { port, doorbell } = workerData as { port: import('worker_threads').MessagePort; doorbell: Int32Array };

// Rebuild the packed views over the shared memory. Instruments/participants are not needed here:
// the kernel reads only the packed arrays, which is the whole point of packing.
const shapePacked = (job: Job) => packViewsOnly(job);

function packViewsOnly(job: Job) {
  const { sab, n, pCount } = job;
  let off = 0;
  const f64 = (len: number) => { const v = new Float64Array(sab, off, len); off += len * 8; return v; };
  const np = n * pCount;
  const float = f64(n), offering = f64(n), withdrawStat = f64(n), currentStat = f64(n);
  const dRes = f64(np), dRange = f64(np), dMaxH = f64(np), dMaxNet = f64(np), dMinH = f64(np), prevHolding = f64(np);
  const u8 = (len: number) => { const v = new Uint8Array(sab, off, len); off += len; return v; };
  const yieldLike = u8(n), skip = u8(n), present = u8(np);
  const damperStreak = u8(n);
  return {
    n, pCount, float, offering, withdrawStat, currentStat, yieldLike, damperStreak, skip,
    present, dRes, dRange, dMaxH, dMaxNet, dMinH, prevHolding,
    dealerSpreadBps: job.dealerSpreadBps,
    maxWeeklyStatMovePct: job.maxWeeklyStatMovePct,
    unsoldStaysWithHolder: job.unsoldStaysWithHolder === true,
  };
}

port.on('message', (job: Job) => {
  const packed = shapePacked(job);
  const shard = runClearingKernel(packed as never, job.from, job.to);
  // Trim the fill arrays to what was actually written before shipping them back.
  const result = {
    from: shard.from,
    to: shard.to,
    clearedStat: shard.clearedStat,
    damper: shard.damper,
    dealerInventory: shard.dealerInventory,
    primaryWithdrawn: shard.primaryWithdrawn,
    primaryMarketTake: shard.primaryMarketTake,
    hasPrimary: shard.hasPrimary,
    fillInst: shard.fillInst.subarray(0, shard.fillCount),
    fillPart: shard.fillPart.subarray(0, shard.fillCount),
    fillFilled: shard.fillFilled.subarray(0, shard.fillCount),
    fillTraded: shard.fillTraded.subarray(0, shard.fillCount),
    fillFee: shard.fillFee.subarray(0, shard.fillCount),
    fillCount: shard.fillCount,
  };
  port.postMessage(result);
  Atomics.store(doorbell, 0, 1);
  Atomics.notify(doorbell, 0);
});
