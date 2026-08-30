/**
 * SCALE wave 2, phase 2 — THE REGISTER AS COLUMNS.
 *
 * ~110,000 positions held as five typed-array columns plus two CSR groupings — by holder and by
 * instrument — because the register is a bipartite graph and every week traverses it BOTH ways.
 * The `RegisterIndex` this replaces held positions INTO the object graph, so a sweep still chased
 * a pointer per row to read a quantity; here the quantity is in the column and the object is not
 * touched at all.
 *
 * **Built from the graph, and rebuilt on the same five writers** that already invalidate the index
 * (stages/register-index.ts). The object arrays remain the source of truth for WRITES during this
 * phase; the table is the read path. That is the strangler seam: readers move one at a time, and
 * a writer that forgets to invalidate shows up as a stale read rather than as corruption, because
 * nothing writes through the table yet.
 *
 * Rows are grouped by holder, and within a holder in the holder's own array order, so any sweep
 * over the table accumulates in exactly the order the nested walk did.
 */

import { InstitutionalEntity, ItemizedHolding } from '../../types';
import { Table } from './table';
import { INSTRUMENT_IDS, ENTITY_IDS } from './intern';

/** The instrument types, in the order the by-type grouping uses. */
export const HOLDING_TYPES: ItemizedHolding['instrumentType'][] = [
  'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'PE_FUND_INTEREST', 'ETF_SHARE',
];
const TYPE_CODE = new Map<string, number>(HOLDING_TYPES.map((t, i) => [t, i]));

export const HOLDING_REGIONS = ['USA', 'EUR', 'UK', 'JPN'] as const;
const REGION_CODE = new Map<string, number>(HOLDING_REGIONS.map((r, i) => [r, i]));

export class HoldingsTable {
  readonly table: Table;
  /** The entities this table was built from, in the order its `entityRow` refers to. */
  entities: InstitutionalEntity[] = [];
  /** `byHolder[holderStart[e] … holderStart[e+1]]` are entity `e`'s rows, in its own array order. */
  holderStart: Int32Array = new Int32Array(1);
  /** `byType[typeStart[t] … typeStart[t+1]]` are the rows of instrument type `t`. */
  byType: Int32Array = new Int32Array(0);
  typeStart: Int32Array = new Int32Array(HOLDING_TYPES.length + 1);
  /** Rows holding a given instrument id — the transpose, for "who holds X". */
  private byInstrument = new Map<number, number[]>();

  constructor() {
    this.table = new Table('holdings', [
      { name: 'entityRow', kind: 'i32' },
      { name: 'instrumentId', kind: 'i32' },
      { name: 'rowInHolder', kind: 'i32' },
      { name: 'instrumentType', kind: 'u8' },
      { name: 'issuerRegion', kind: 'u8' },
      { name: 'qtyUSD', kind: 'f64' },
      { name: 'shares', kind: 'f64' },
    ], 1 << 17);
  }

  get rows(): number { return this.table.length; }
  get entityRow(): Int32Array { return this.table.i32('entityRow'); }
  get instrumentId(): Int32Array { return this.table.i32('instrumentId'); }
  get rowInHolder(): Int32Array { return this.table.i32('rowInHolder'); }
  get instrumentType(): Uint8Array { return this.table.u8('instrumentType'); }
  get issuerRegion(): Uint8Array { return this.table.u8('issuerRegion'); }
  get qtyUSD(): Float64Array { return this.table.f64('qtyUSD'); }
  get shares(): Float64Array { return this.table.f64('shares'); }

  /** Rows of one instrument, or an empty list. */
  rowsOfInstrument(instrumentText: string): readonly number[] {
    const id = INSTRUMENT_IDS.peek(instrumentText);
    return id < 0 ? EMPTY : (this.byInstrument.get(id) ?? EMPTY);
  }

  /** The slice of `byType` carrying one instrument type. */
  typeRange(type: ItemizedHolding['instrumentType']): [number, number] {
    const code = TYPE_CODE.get(type);
    if (code === undefined) return [0, 0];
    return [this.typeStart[code], this.typeStart[code + 1]];
  }

  /** The live object behind a row — for readers not yet converted off the graph. */
  holdingAt(row: number): ItemizedHolding | undefined {
    const entity = this.entities[this.entityRow[row]];
    return entity?.itemizedHoldings?.[this.rowInHolder[row]];
  }

  /** Rebuild from the object graph. One pass to count, one to fill; nothing else allocates. */
  build(entities: InstitutionalEntity[]): void {
    this.entities = entities;
    let total = 0;
    for (let e = 0; e < entities.length; e++) total += entities[e].itemizedHoldings?.length ?? 0;
    this.table.grow(Math.max(1, total));
    this.table.length = total;

    const entityRow = this.entityRow, instrumentId = this.instrumentId;
    const rowInHolder = this.rowInHolder, instrumentType = this.instrumentType;
    const issuerRegion = this.issuerRegion, qtyUSD = this.qtyUSD, shares = this.shares;

    if (this.holderStart.length !== entities.length + 1) {
      this.holderStart = new Int32Array(entities.length + 1);
    }
    const typeCounts = new Int32Array(HOLDING_TYPES.length);
    this.byInstrument.clear();

    let at = 0;
    for (let e = 0; e < entities.length; e++) {
      this.holderStart[e] = at;
      const book = entities[e].itemizedHoldings;
      if (!book) continue;
      for (let r = 0; r < book.length; r++) {
        const h = book[r];
        const code = TYPE_CODE.get(h.instrumentType);
        if (code === undefined) continue;
        const iid = INSTRUMENT_IDS.id(h.instrumentId);
        entityRow[at] = e;
        instrumentId[at] = iid;
        rowInHolder[at] = r;
        instrumentType[at] = code;
        issuerRegion[at] = REGION_CODE.get(h.issuerRegion) ?? 0;
        qtyUSD[at] = h.quantityOrNotionalUSD ?? 0;
        shares[at] = h.quantityShares ?? 0;
        typeCounts[code]++;
        const list = this.byInstrument.get(iid);
        if (list) list.push(at); else this.byInstrument.set(iid, [at]);
        at++;
      }
      // Interning the holder's id here means every later stage can key by an integer.
      ENTITY_IDS.id(entities[e].id);
    }
    this.holderStart[entities.length] = at;
    this.table.length = at;

    // Counting sort into the by-type grouping; register order is preserved inside a type, which
    // is what keeps every converted sweep accumulating exactly as the nested walk did.
    this.typeStart[0] = 0;
    for (let t = 0; t < HOLDING_TYPES.length; t++) this.typeStart[t + 1] = this.typeStart[t] + typeCounts[t];
    if (this.byType.length < at) this.byType = new Int32Array(Math.max(at, 1 << 17));
    const cursor = Int32Array.from(this.typeStart.subarray(0, HOLDING_TYPES.length));
    for (let i = 0; i < at; i++) this.byType[cursor[instrumentType[i]]++] = i;
  }
}

const EMPTY: readonly number[] = [];
