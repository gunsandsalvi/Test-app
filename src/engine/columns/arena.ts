/**
 * SCALE wave 2, phase 1 — THE PER-WEEK ARENA.
 *
 * Decision 4: a kernel allocates nothing. Scratch — plans, schedules, per-stage index buffers —
 * comes from a preallocated typed array with a bump pointer and is handed back all at once when the
 * week ends. Measured motivation: garbage collection is a steady 8.5–8.9% of every profile of this
 * engine, and much of the "self time" the big stages are charged is allocation wearing a function's
 * name.
 *
 * A slice handed out is a VIEW, valid until the next `reset`. Nothing may keep one across a week
 * boundary — that is the single rule, and the reason the reset is explicit rather than automatic.
 */
export class Arena {
  private f64Store: Float64Array;
  private i32Store: Int32Array;
  private f64Top = 0;
  private i32Top = 0;

  constructor(f64Capacity = 1 << 20, i32Capacity = 1 << 20) {
    this.f64Store = new Float64Array(f64Capacity);
    this.i32Store = new Int32Array(i32Capacity);
  }

  /** `n` doubles, zeroed, valid until the next reset. */
  f64(n: number): Float64Array {
    if (this.f64Top + n > this.f64Store.length) this.growF64(this.f64Top + n);
    const view = this.f64Store.subarray(this.f64Top, this.f64Top + n);
    this.f64Top += n;
    view.fill(0);
    return view;
  }

  /** `n` int32s, zeroed, valid until the next reset. */
  i32(n: number): Int32Array {
    if (this.i32Top + n > this.i32Store.length) this.growI32(this.i32Top + n);
    const view = this.i32Store.subarray(this.i32Top, this.i32Top + n);
    this.i32Top += n;
    view.fill(0);
    return view;
  }

  /** Hand the whole week's scratch back. Every view previously returned is now dead. */
  reset(): void {
    this.f64Top = 0;
    this.i32Top = 0;
  }

  /** High-water marks, for sizing the arena against what the week actually used. */
  get used(): { f64: number; i32: number } { return { f64: this.f64Top, i32: this.i32Top }; }

  private growF64(wanted: number): void {
    const next = new Float64Array(Math.max(wanted, this.f64Store.length * 2));
    next.set(this.f64Store.subarray(0, this.f64Top));
    this.f64Store = next;
  }

  private growI32(wanted: number): void {
    const next = new Int32Array(Math.max(wanted, this.i32Store.length * 2));
    next.set(this.i32Store.subarray(0, this.i32Top));
    this.i32Store = next;
  }
}
