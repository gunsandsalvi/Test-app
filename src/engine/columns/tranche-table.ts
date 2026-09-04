/**
 * SCALE wave 2, phase 5 — THE DEBT LADDER AS COLUMNS.
 *
 * ~8,600 tranches, and they grow: measured 3,704 at seed and 8,610 by week 20, because every
 * refinancing, maintenance bridge and primary offering adds one. Stage 08 filters an issuer's
 * ladder half a dozen times per company per week (fixed vs floating, facility vs market, maturing
 * this week, within a year, bridges to term out), and each filter allocates.
 *
 * Held as columns with a CSR grouping by issuer, those become range walks with integer tests, and
 * the per-issuer slices are contiguous — which is also what lets the ladder be sharded by issuer
 * range in phase 4's harness.
 */

import { Table } from './table';
import { COMPANY_IDS } from './intern';

export const RATE_FIXED = 0;
export const RATE_FLOATING = 1;

/** Bit flags for the ladder's kinds, so the six filters become one integer test each. */
export const TRANCHE_BANK_FACILITY = 1;
export const TRANCHE_COMMERCIAL_PAPER = 2;
export const TRANCHE_DISCOUNT_BILL = 4;

export interface TrancheRowSource {
  issuerId: string;
  principalLocal: number;
  couponRate?: number;
  maturityWeek: number;
  rateType?: string;
  floatingMarginBps?: number;
  isBankFacility?: boolean;
  isCommercialPaper?: boolean;
}

export class TrancheTable {
  readonly table: Table;
  /** `rows[issuerStart[i] … issuerStart[i+1]]` is issuer row `i`'s ladder, in its own order. */
  issuerStart: Int32Array = new Int32Array(1);
  byIssuer: Int32Array = new Int32Array(0);

  constructor() {
    this.table = new Table('tranches', [
      { name: 'issuerId', kind: 'i32' },
      { name: 'maturityWeek', kind: 'i32' },
      { name: 'rateType', kind: 'u8' },
      { name: 'kindFlags', kind: 'u8' },
      { name: 'principalLocal', kind: 'f64' },
      { name: 'couponRate', kind: 'f64' },
      { name: 'floatingMarginBps', kind: 'f64' },
    ], 1 << 14);
  }

  get rows(): number { return this.table.length; }
  get issuerId(): Int32Array { return this.table.i32('issuerId'); }
  get maturityWeek(): Int32Array { return this.table.i32('maturityWeek'); }
  get rateType(): Uint8Array { return this.table.u8('rateType'); }
  get kindFlags(): Uint8Array { return this.table.u8('kindFlags'); }
  get principalLocal(): Float64Array { return this.table.f64('principalLocal'); }
  get couponRate(): Float64Array { return this.table.f64('couponRate'); }
  get floatingMarginBps(): Float64Array { return this.table.f64('floatingMarginBps'); }

  /** Fill from the issuers' own ladders, grouped by issuer so each one's rows are contiguous. */
  build(issuers: { id: string; debtTranches?: TrancheRowSource[] }[]): void {
    let total = 0;
    for (let i = 0; i < issuers.length; i++) total += issuers[i].debtTranches?.length ?? 0;
    this.table.grow(Math.max(1, total));
    this.table.length = total;
    if (this.issuerStart.length !== issuers.length + 1) {
      this.issuerStart = new Int32Array(issuers.length + 1);
    }
    const issuerId = this.issuerId, maturityWeek = this.maturityWeek, rateType = this.rateType;
    const kindFlags = this.kindFlags, principalLocal = this.principalLocal;
    const couponRate = this.couponRate, floatingMarginBps = this.floatingMarginBps;
    let at = 0;
    for (let i = 0; i < issuers.length; i++) {
      this.issuerStart[i] = at;
      const ladder = issuers[i].debtTranches;
      if (!ladder) continue;
      const iid = COMPANY_IDS.id(issuers[i].id);
      for (let t = 0; t < ladder.length; t++) {
        const tr = ladder[t];
        issuerId[at] = iid;
        maturityWeek[at] = tr.maturityWeek | 0;
        rateType[at] = tr.rateType === 'FLOATING' ? RATE_FLOATING : RATE_FIXED;
        kindFlags[at] = (tr.isBankFacility ? TRANCHE_BANK_FACILITY : 0)
          | (tr.isCommercialPaper ? TRANCHE_COMMERCIAL_PAPER : 0);
        principalLocal[at] = tr.principalLocal ?? 0;
        couponRate[at] = tr.couponRate ?? 0;
        floatingMarginBps[at] = tr.floatingMarginBps ?? 0;
        at++;
      }
    }
    this.issuerStart[issuers.length] = at;
    this.table.length = at;
  }
}
