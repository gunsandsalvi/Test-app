/**
 * SCALE wave 2, phase 2 — THE REGISTER AS COLUMNS.
 *
 * ~110,000 positions held as typed-array columns grouped by instrument type, because the accrual
 * pass sweeps one type at a time and a nested walk over the object graph costs a pointer chase
 * per row to read one quantity. Here the quantity is in the column and no holding object is
 * touched at all.
 *
 * §3.13-READ B1 — THE OBJECT-GRAPH HALF IS GONE. This class carried two builders. `build()` read
 * the `itemizedHoldings` arrays; `buildFromRows` reads the persistent row mirror. `build()` was
 * unreachable: its only entry point is `getHoldingsTable`, whose `ctx.v2` is a REQUIRED field of
 * `WeeklyStepContext`, so the row path was always taken. With it went everything only it
 * maintained — the by-instrument transpose (`rowsOfInstrument`, which threw for the row path
 * anyway), `holdingAt` (the last reader that resolved a row back to an object), `holderStart`,
 * and the `rowInHolder`, `issuerRegion`, `shares` and `qtyLocal` columns, none of which the
 * table's one weekly consumer reads.
 *
 * What is left is what that consumer asks for: rows grouped by type, in register order within a
 * type, carrying the instrument, the holder and the FACE.
 */

import { InstitutionalEntity, ItemizedHolding } from '../../types';
import { Table } from './table';
import { INSTRUMENT_IDS } from './intern';
import { V2World, internType, instrumentOf } from '../../engine2/world';
import { bookHeadOf, rowUnits } from '../../engine2/holdings';

/** v2-intern-id → INSTRUMENT_IDS id. Both pools assign ids in first-sight order and never reuse
 *  them, so a translation, once made, holds for the life of the world — the memo never
 *  invalidates. Keyed weakly per world because batteries clone whole states. */
const INSTR_ID_MEMO = new WeakMap<V2World, number[]>();

/** The instrument types, in the order the by-type grouping uses. */
const HOLDING_TYPES: ItemizedHolding['instrumentType'][] = [
  'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'PE_FUND_INTEREST', 'ETF_SHARE',
];

export class HoldingsTable {
  readonly table: Table;
  /** `byType[typeStart[t] … typeStart[t+1]]` are the rows of instrument type `t`. */
  byType: Int32Array = new Int32Array(0);
  typeStart: Int32Array = new Int32Array(HOLDING_TYPES.length + 1);

  constructor() {
    this.table = new Table('holdings', [
      { name: 'entityRow', kind: 'i32' },
      { name: 'instrumentId', kind: 'i32' },
      { name: 'instrumentType', kind: 'u8' },
      { name: 'units', kind: 'f64' },
      // §3.13-BOOK f4a: the register row behind the table row, for the writes that land on it.
      { name: 'registerRow', kind: 'i32' },
    ], 1 << 17);
  }

  get rows(): number { return this.table.length; }
  get entityRow(): Int32Array { return this.table.i32('entityRow'); }
  get instrumentId(): Int32Array { return this.table.i32('instrumentId'); }
  get instrumentType(): Uint8Array { return this.table.u8('instrumentType'); }
  /** §9.13-CREDIT row 5 — HOW MUCH PAPER. A coupon follows FACE and a mark follows price, so a
   *  walk that apportions an issuer's week over its holders reads this: at par the face and the
   *  money are the same number, and everywhere else they are not. */
  get units(): Float64Array { return this.table.f64('units'); }
  get registerRow(): Int32Array { return this.table.i32('registerRow'); }

  /** The slice of `byType` carrying one instrument type. */
  typeRange(type: ItemizedHolding['instrumentType']): [number, number] {
    const code = HOLDING_TYPES.indexOf(type);
    if (code < 0) return [0, 0];
    return [this.typeStart[code], this.typeStart[code + 1]];
  }

  /**
   * §7.307 holdings flip — build from the PERSISTENT ROWS (engine2/holdings), which are the
   * register: every column fill is typed-array loads plus interned-int translation, and no
   * holding object is touched. Chain order = book order, so every grouping comes out in register
   * order.
   */
  buildFromRows(v2: V2World, entities: InstitutionalEntity[]): void {
    const H = v2.holdings;
    const typeCode: number[] = [];
    HOLDING_TYPES.forEach((t, i) => { typeCode[internType(v2, t)] = i; });
    let instrMemo = INSTR_ID_MEMO.get(v2);
    if (!instrMemo) { instrMemo = []; INSTR_ID_MEMO.set(v2, instrMemo); }

    let total = 0;
    for (let e = 0; e < entities.length; e++) {
      for (let r = bookHeadOf(v2, entities[e].id); r >= 0; r = H.next[r]) total++;
    }
    this.table.grow(Math.max(1, total));
    this.table.length = total;

    const entityRow = this.entityRow, instrumentId = this.instrumentId;
    const instrumentType = this.instrumentType, unitsCol = this.units, registerRow = this.registerRow;
    const typeCounts = new Int32Array(HOLDING_TYPES.length);

    let at = 0;
    for (let e = 0; e < entities.length; e++) {
      for (let r = bookHeadOf(v2, entities[e].id); r >= 0; r = H.next[r]) {
        const code = typeCode[H.typeRef[r]];
        if (code === undefined) continue;
        const ref = H.instrRef[r];
        let iid = instrMemo[ref];
        if (iid === undefined) { iid = INSTRUMENT_IDS.id(instrumentOf(v2, ref)); instrMemo[ref] = iid; }
        entityRow[at] = e;
        instrumentId[at] = iid;
        instrumentType[at] = code;
        unitsCol[at] = rowUnits(H, r);
        registerRow[at] = r;
        typeCounts[code]++;
        at++;
      }
    }
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
