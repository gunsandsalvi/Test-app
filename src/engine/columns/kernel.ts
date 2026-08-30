/**
 * SCALE wave 2, phase 4 — KERNELS AND SHARDING.
 *
 * A kernel is a pure function over a RANGE OF ROWS. It reads columns, writes columns, and
 * accumulates anything it cannot write per-row into a per-shard accumulator that is combined
 * afterwards **in shard order**. That last clause is the whole of determinism: floating-point
 * addition is not associative, so a reduction is reproducible only if the shards are combined in a
 * fixed order, and row-range shards give exactly that.
 *
 * **This is not a new idea in this codebase — it is the clearing engine's.**
 * `financial-clearing-engine.ts` shards its kernel across a worker pool and is byte-identical to
 * the serial path, which is why it is the one part of the engine that barely appears in a profile.
 * Wave 2's claim is only that the same treatment applies to the rest once the state stops being an
 * object graph.
 *
 * **Why the worker path is not wired here yet.** A worker can take a `SharedArrayBuffer` for free,
 * but it cannot take the object graph, and the stages this would pay for most still read regions,
 * `companyUpdates` and the payment journal as objects. So `runSharded` executes shards inline
 * today and the shape — ranges, per-shard accumulators, ordered combine — is what phase 5 hands to
 * the pool. Writing it this way now means the conversion of each stage is a conversion, not a
 * rewrite twice.
 */

/** How many shards a kernel should split into on this host. */
export function shardCount(): number {
  const cpus = (globalThis as { navigator?: { hardwareConcurrency?: number } })
    .navigator?.hardwareConcurrency;
  const n = typeof cpus === 'number' && cpus > 0 ? cpus : 4;
  return Math.max(1, Math.min(16, n));
}

export interface ShardRange {
  /** First row, inclusive. */
  lo: number;
  /** Last row, exclusive. */
  hi: number;
  /** 0-based shard index — the order every reduction must be combined in. */
  index: number;
}

/** Split `rows` into `shards` contiguous ranges. Earlier shards take the remainder, so the split
 *  is a pure function of (rows, shards) and therefore reproducible. */
export function shardRanges(rows: number, shards = shardCount()): ShardRange[] {
  const n = Math.max(1, Math.min(shards, Math.max(1, rows)));
  const base = Math.floor(rows / n);
  const extra = rows % n;
  const out: ShardRange[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push({ lo: at, hi: at + size, index: i });
    at += size;
  }
  return out;
}

/**
 * Run `kernel` over every row of a table, sharded, and fold the per-shard results **in shard
 * order**. `combine` must be associative in INTENT — it does not have to be associative in
 * floating point, because the order it is applied in is fixed.
 */
export function runSharded<T>(
  rows: number,
  kernel: (range: ShardRange) => T,
  combine: (accumulated: T | undefined, shardResult: T, index: number) => T,
  shards = shardCount()
): T | undefined {
  const ranges = shardRanges(rows, shards);
  let acc: T | undefined;
  // Inline today; a worker pool later. The ORDER is the invariant, not where the work happens.
  for (let i = 0; i < ranges.length; i++) {
    acc = combine(acc, kernel(ranges[i]), i);
  }
  return acc;
}

/** A kernel with nothing to reduce — the common case for a per-row column write. */
export function runShardedVoid(
  rows: number,
  kernel: (range: ShardRange) => void,
  shards = shardCount()
): void {
  const ranges = shardRanges(rows, shards);
  for (let i = 0; i < ranges.length; i++) kernel(ranges[i]);
}
