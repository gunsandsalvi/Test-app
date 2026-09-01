/**
 * ENGINE V2 — lane allocation that can land on SharedArrayBuffers (§7.305, the worker chain).
 *
 * The front pass's lanes are ordinary typed arrays until a worker pool is in play; with the
 * pool on, the same allocators back every lane with a SharedArrayBuffer so a worker's writes
 * are the main thread's reads with no copy. The mode is set once per process, before the first
 * allocation (the scratch caches assume it never flips mid-run).
 */

let shared = false;

export function setSharedLanes(v: boolean): void {
  shared = v;
}

export const lane64 = (n: number): Float64Array =>
  shared ? new Float64Array(new SharedArrayBuffer(n * 8)) : new Float64Array(n);
export const lane32 = (n: number): Int32Array =>
  shared ? new Int32Array(new SharedArrayBuffer(n * 4)) : new Int32Array(n);
export const laneU32 = (n: number): Uint32Array =>
  shared ? new Uint32Array(new SharedArrayBuffer(n * 4)) : new Uint32Array(n);
export const lane8 = (n: number): Uint8Array =>
  shared ? new Uint8Array(new SharedArrayBuffer(n)) : new Uint8Array(n);
