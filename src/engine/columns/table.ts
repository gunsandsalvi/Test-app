/**
 * SCALE wave 2, phase 1 — THE COLUMN TABLE.
 *
 * A table is a set of named typed-array columns over ONE `SharedArrayBuffer`, and a row is an
 * `int32` index into all of them. This is the primitive the rest of wave 2 is built from: entities
 * stop being objects, so a stage stops chasing pointers and a worker can take the buffer without
 * anything being cloned (§7.777's "the clone numbers say why workers cannot touch it" is a
 * statement about the object graph, and this is what stops it being true).
 *
 * **One buffer per table, columns laid out end to end.** Growth allocates a larger buffer and
 * copies; it is rare (a firm is born, a holding is opened) and amortised by doubling. Every column
 * of a table therefore shares a backing store, which is what makes handing a table to a worker a
 * single transfer rather than one per field.
 *
 * **Determinism.** Rows are visited in index order, always. A freed row is recorded on a free list
 * and reused in LIFO order, which is deterministic for a given sequence of frees — the same seed
 * produces the same layout, so a sharded reduction over row ranges is reproducible.
 */

export type ColumnKind = 'f64' | 'i32' | 'u8';

export interface ColumnSpec {
  name: string;
  kind: ColumnKind;
}

const BYTES: Record<ColumnKind, number> = { f64: 8, i32: 4, u8: 1 };

type AnyColumn = Float64Array | Int32Array | Uint8Array;

export class Table {
  readonly name: string;
  readonly specs: readonly ColumnSpec[];
  /** Rows in use, including any on the free list below them. Iterate `0 … length`. */
  length = 0;
  private capacity: number;
  private buffer: SharedArrayBuffer | ArrayBuffer;
  private columns = new Map<string, AnyColumn>();
  private freeRows: number[] = [];

  constructor(name: string, specs: ColumnSpec[], capacity = 1024) {
    this.name = name;
    this.specs = specs;
    this.capacity = Math.max(1, capacity);
    this.buffer = allocBuffer(byteLengthFor(specs, this.capacity));
    this.layout();
  }

  /** Column byte offsets are recomputed whenever the buffer is replaced. */
  private layout(): void {
    let offset = 0;
    this.columns.clear();
    for (const spec of this.specs) {
      // Each column starts 8-byte aligned so a Float64Array view is always legal.
      offset = (offset + 7) & ~7;
      const bytes = BYTES[spec.kind] * this.capacity;
      const buf = this.buffer;
      this.columns.set(spec.name,
        spec.kind === 'f64' ? new Float64Array(buf, offset, this.capacity)
          : spec.kind === 'i32' ? new Int32Array(buf, offset, this.capacity)
            : new Uint8Array(buf, offset, this.capacity));
      offset += bytes;
    }
  }

  f64(name: string): Float64Array { return this.columns.get(name) as Float64Array; }
  i32(name: string): Int32Array { return this.columns.get(name) as Int32Array; }
  u8(name: string): Uint8Array { return this.columns.get(name) as Uint8Array; }

  /** The whole table's backing store — what a worker is handed. */
  get store(): SharedArrayBuffer | ArrayBuffer { return this.buffer; }

  /** A row index, reused from the free list if one is waiting. Its columns are zeroed. */
  addRow(): number {
    const reused = this.freeRows.pop();
    if (reused !== undefined) { this.zeroRow(reused); return reused; }
    if (this.length === this.capacity) this.grow(this.capacity * 2);
    const row = this.length;
    this.length++;
    this.zeroRow(row);
    return row;
  }

  /** Retire a row. Its index is reused later; nothing else moves, so no other row's id changes. */
  removeRow(row: number): void {
    if (row < 0 || row >= this.length) return;
    this.zeroRow(row);
    this.freeRows.push(row);
  }

  private zeroRow(row: number): void {
    this.columns.forEach((col) => { col[row] = 0; });
  }

  /** Grow to at least `wanted` rows, preserving every value and every row id. */
  grow(wanted: number): void {
    if (wanted <= this.capacity) return;
    const nextCapacity = Math.max(wanted, this.capacity * 2);
    const previous = new Map<string, AnyColumn>();
    this.columns.forEach((col, key) => previous.set(key, col.slice() as AnyColumn));
    const usedRows = this.length;
    this.capacity = nextCapacity;
    this.buffer = allocBuffer(byteLengthFor(this.specs, nextCapacity));
    this.layout();
    previous.forEach((old, key) => {
      (this.columns.get(key) as AnyColumn).set(old.subarray(0, usedRows) as never, 0);
    });
  }

  /** Rows in use minus the retired ones — what a count of real entities means. */
  get liveRows(): number { return this.length - this.freeRows.length; }
}

function byteLengthFor(specs: readonly ColumnSpec[], capacity: number): number {
  let offset = 0;
  for (const spec of specs) {
    offset = (offset + 7) & ~7;
    offset += BYTES[spec.kind] * capacity;
  }
  return (offset + 7) & ~7;
}

/** SharedArrayBuffer where the runtime allows it (phase 4 needs it); a plain buffer otherwise, so
 *  the browser build and any host without cross-origin isolation still runs. */
function allocBuffer(bytes: number): SharedArrayBuffer | ArrayBuffer {
  const SAB = (globalThis as { SharedArrayBuffer?: SharedArrayBufferConstructor }).SharedArrayBuffer;
  return SAB ? new SAB(bytes) : new ArrayBuffer(bytes);
}
