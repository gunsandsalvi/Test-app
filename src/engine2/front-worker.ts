/**
 * Worker-thread side of the front core (§7.305, the worker chain).
 *
 * Receives a job — the seam, core-out and pass lanes as SharedArrayBuffer-backed views plus a
 * mirror of the lot columns and a row range — and runs the SAME `runFrontCore` the serial path
 * runs (one module, one arithmetic). Fully-consumed lot rows go back through the dead sink so
 * the shared free list is never touched off the main thread. Node-only; the browser build never
 * imports this file.
 */
import { parentPort, workerData } from 'worker_threads';
import { runFrontCore, FrontSeam, FrontCoreOut } from './front-core.ts';
import { LotViews } from './lots.ts';
import { FrontPass } from './stage08-front.ts';

void parentPort;

interface Job {
  seam: FrontSeam;
  out: FrontCoreOut;
  f: FrontPass;
  lots: LotViews;
  lo: number;
  hi: number;
}

const { port, doorbell } = workerData as { port: import('worker_threads').MessagePort; doorbell: Int32Array };

port.on('message', (job: Job) => {
  const dead: number[] = [];
  runFrontCore(job.seam, job.out, job.f, job.lots, null, dead, job.lo, job.hi);
  port.postMessage({ dead });
  Atomics.store(doorbell, 0, 1);
  Atomics.notify(doorbell, 0);
});
