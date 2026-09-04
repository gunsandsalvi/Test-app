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
import { REGION_IDS } from '../../domain/geography';
import { V2World, internString } from '../../engine2/world';
import { bookHeadOf } from '../../engine2/holdings';

/** v2-intern-id → INSTRUMENT_IDS id. Both pools assign ids in first-sight order and never reuse
 *  them, so a translation, once made, holds for the life of the world — the memo never
 *  invalidates. Keyed weakly per world because batteries clone whole states. */
const INSTR_ID_MEMO = new WeakMap<V2World, number[]>();

/** The instrument types, in the order the by-type grouping uses. */
export const HOLDING_TYPES: ItemizedHolding['instrumentType'][] = [
  'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'PE_FUND_INTEREST', 'ETF_SHARE',
];
const TYPE_CODE = new Map<string, number>(HOLDING_TYPES.map((t, i) => [t, i]));

export const HOLDING_REGIONS = REGION_IDS;
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
      { name: 'qtyLocal', kind: 'f64' },
      { name: 'shares', kind: 'f64' },
      { name: 'units', kind: 'f64' },
    ], 1 << 17);
  }

  get rows(): number { return this.table.length; }
  get entityRow(): Int32Array { return this.table.i32('entityRow'); }
  get instrumentId(): Int32Array { return this.table.i32('instrumentId'); }
  get rowInHolder(): Int32Array { return this.table.i32('rowInHolder'); }
  get instrumentType(): Uint8Array { return this.table.u8('instrumentType'); }
  get issuerRegion(): Uint8Array { return this.table.u8('issuerRegion'); }
  get qtyLocal(): Float64Array { return this.table.f64('qtyLocal'); }
  get shares(): Float64Array { return this.table.f64('shares'); }
  /** §9.13-CREDIT row 5 — HOW MUCH PAPER, beside what it is worth. A coupon follows FACE and a
   *  mark follows price, so a walk that apportions an issuer's week over its holders reads this
   *  and not `qtyLocal`: at par they are the same number, and everywhere else they are not. */
  get units(): Float64Array { return this.table.f64('units'); }

  /** §7.315: buildFromRows builds only what its consumers read; the transpose is one of the
   *  features with NO current consumer and is skipped there — a future caller fails loudly
   *  here instead of silently reading an empty index. */
  private hasInstrumentTranspose = true;

  /** Rows of one instrument, or an empty list. */
  rowsOfInstrument(instrumentText: string): readonly number[] {
    if (!this.hasInstrumentTranspose) {
      throw new Error('HoldingsTable: built without the by-instrument transpose (buildFromRows) — extend buildFromRows before using rowsOfInstrument');
    }
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
    const issuerRegion = this.issuerRegion, qtyLocal = this.qtyLocal, shares = this.shares;
    const units = this.units;

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
        qtyLocal[at] = h.quantityOrNotionalLocal ?? 0;
        shares[at] = h.quantityShares ?? 0;
        units[at] = h.units;
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

  /**
   * §7.307 holdings flip — rebuild from the PERSISTENT ROW MIRROR (engine2/holdings) instead of
   * the object graph: every column fill is typed-array loads plus interned-int translation, and
   * no holding object is touched. Valid wherever the mirror is current — after the clearing
   * write-back, since every writer syncs at its own site (HOLDINGS_SYNC_CHECK proves it).
   * Chain order = book order, so `rowInHolder` and every grouping come out exactly as `build`'s.
   */
  buildFromRows(v2: V2World, entities: InstitutionalEntity[]): void {
    this.entities = entities;
    const H = v2.holdings;
    const typeCode: number[] = [];
    HOLDING_TYPES.forEach((t, i) => { typeCode[internString(v2, t)] = i; });
    let instrMemo = INSTR_ID_MEMO.get(v2);
    if (!instrMemo) { instrMemo = []; INSTR_ID_MEMO.set(v2, instrMemo); }

    // §7.315: only the columns the table's ONE weekly consumer reads (the accrual pass:
    // byType/typeRange, instrumentId, qtyLocal, entityRow). The by-instrument transpose, shares,
    // issuerRegion and rowInHolder had no consumer and cost ~110k Map ops and column fills a
    // week; rowsOfInstrument throws if asked for the skipped index.
    let total = 0;
    for (let e = 0; e < entities.length; e++) {
      for (let r = bookHeadOf(v2, entities[e].id); r >= 0; r = H.next[r]) total++;
    }
    this.table.grow(Math.max(1, total));
    this.table.length = total;

    const entityRow = this.entityRow, instrumentId = this.instrumentId;
    const instrumentType = this.instrumentType, qtyLocal = this.qtyLocal;
    const unitsCol = this.units;

    const typeCounts = new Int32Array(HOLDING_TYPES.length);
    this.byInstrument.clear();
    this.hasInstrumentTranspose = false;

    let at = 0;
    for (let e = 0; e < entities.length; e++) {
      for (let r = bookHeadOf(v2, entities[e].id); r >= 0; r = H.next[r]) {
        const code = typeCode[H.typeRef[r]];
        if (code === undefined) continue;
        const ref = H.instrRef[r];
        let iid = instrMemo[ref];
        if (iid === undefined) { iid = INSTRUMENT_IDS.id(v2.internedStrings[ref]); instrMemo[ref] = iid; }
        entityRow[at] = e;
        instrumentId[at] = iid;
        instrumentType[at] = code;
        qtyLocal[at] = H.qtyLocal[r];
        unitsCol[at] = Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r];
        typeCounts[code]++;
        at++;
      }
    }
    this.table.length = at;

    this.typeStart[0] = 0;
    for (let t = 0; t < HOLDING_TYPES.length; t++) this.typeStart[t + 1] = this.typeStart[t] + typeCounts[t];
    if (this.byType.length < at) this.byType = new Int32Array(Math.max(at, 1 << 17));
    const cursor = Int32Array.from(this.typeStart.subarray(0, HOLDING_TYPES.length));
    const instrumentTypeCol = this.instrumentType;
    for (let i = 0; i < at; i++) this.byType[cursor[instrumentTypeCol[i]]++] = i;
  }
}

const EMPTY: readonly number[] = [];
