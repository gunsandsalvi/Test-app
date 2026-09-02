/**
 * SCALE wave 2, phase 3 — THE COMPANY TABLE.
 *
 * 2,496 rows against the fields the weekly engine actually reads and writes in bulk. Decision 1 of
 * the design, and the largest single item in the profile sits on it:
 * `runCompanyFundamentalsStage` is ~196 ms with a **78 µs per-company floor** — the p10, not the
 * tail — over an 1,800-line body.
 *
 * **What this table is FOR, stated plainly, because the measurement changed the answer.** The
 * per-line profile of that body is flat: no line above 0.85%, work spread over ~1,800 lines. V8
 * reads a field off a monomorphic object in about a nanosecond, so converting those reads to
 * typed-array loads is NOT where a 10× comes from. What the table buys is the three things the
 * object graph cannot give at any speed:
 *
 *   - **cache locality** on the bulk sweeps that read one field across every company;
 *   - **no allocation**, so the arena can retire the GC that is a steady 8.5–8.9% of every profile;
 *   - and the one that matters most — **a state a worker can take without cloning**, which is the
 *     whole of §7.777's objection and the only route to using the other three cores.
 *
 * So this phase is the ENABLER for phase 4, not a speedup on its own, and the projection should be
 * read that way: the company table's return is collected when the body shards, not when it lands.
 *
 * **The seam.** Columns are synchronised from the objects before the stage and back after it, at
 * ~2 ms for the whole universe — cheap enough that readers and writers can migrate one at a time
 * with the objects staying authoritative until the last one moves.
 */

import { Company } from '../../types';
import { Table } from './table';
import { TICKERS, COMPANY_IDS } from './intern';
import { REGION_IDS } from '../../domain/geography';

export const COMPANY_REGIONS = REGION_IDS;
const REGION_CODE = new Map<string, number>(COMPANY_REGIONS.map((r, i) => [r, i]));

/** The columns, in one place so the sync and the kernels cannot disagree about the set. */
const NUMERIC_FIELDS = [
  'annualRevenue', 'baselineAnnualRevenue', 'ebitda', 'cash',
  'stockPrice', 'sharesOutstanding', 'employeeCount', 'previousEmployeeCount',
  'baselineEmployeeCount', 'grossPPEUSD', 'accumulatedDepreciationUSD', 'maintenanceCapex',
  'growthCapex', 'capex', 'previousCapex', 'offeredWageIndex', 'unfilledVacancyShare',
  'inputSupplyConstraintFactor', 'executionQuality', 'oasSpreadBps',
  'revenueVolatility', 'forwardPE', 'baselineRecoveryRate', 'baselineDividendYield',
] as const;
type NumericField = typeof NUMERIC_FIELDS[number];

export class CompanyTable {
  readonly table: Table;
  /** The objects this table mirrors, in row order. */
  companies: Company[] = [];
  /** Row per interned ticker, so a lookup by name is an array index. */
  private rowByTicker: Int32Array = new Int32Array(0);

  constructor() {
    this.table = new Table('companies', [
      { name: 'tickerId', kind: 'i32' },
      { name: 'companyId', kind: 'i32' },
      { name: 'region', kind: 'u8' },
      { name: 'flags', kind: 'u8' },
      ...NUMERIC_FIELDS.map((f) => ({ name: f, kind: 'f64' as const })),
    ], 4096);
  }

  get rows(): number { return this.table.length; }
  col(field: NumericField): Float64Array { return this.table.f64(field); }
  get region(): Uint8Array { return this.table.u8('region'); }
  get flags(): Uint8Array { return this.table.u8('flags'); }
  get tickerId(): Int32Array { return this.table.i32('tickerId'); }

  /** Bit 0 = active, bit 1 = bank, bit 2 = defaulted, bit 3 = merger-acquired. */
  static readonly ACTIVE = 1;
  static readonly BANK = 2;
  static readonly DEFAULTED = 4;
  static readonly ACQUIRED = 8;

  rowOfTicker(ticker: string): number {
    const id = TICKERS.peek(ticker);
    return id < 0 || id >= this.rowByTicker.length ? -1 : this.rowByTicker[id];
  }

  /** Read the objects into the columns. Row order IS `companies` order, so a kernel that walks
   *  rows visits firms in exactly the order the object loop did. */
  syncIn(companies: Company[]): void {
    this.companies = companies;
    this.table.grow(Math.max(1, companies.length));
    this.table.length = companies.length;
    const tickerId = this.tickerId, companyId = this.table.i32('companyId');
    const region = this.region, flags = this.flags;
    const cols = NUMERIC_FIELDS.map((f) => this.col(f));
    let maxTicker = 0;
    for (let i = 0; i < companies.length; i++) {
      const c = companies[i] as unknown as Record<string, unknown>;
      const tid = TICKERS.id(companies[i].ticker);
      tickerId[i] = tid;
      if (tid > maxTicker) maxTicker = tid;
      companyId[i] = COMPANY_IDS.id(companies[i].id);
      region[i] = REGION_CODE.get(companies[i].region) ?? 0;
      flags[i] = (companies[i].isDefaulted ? CompanyTable.DEFAULTED : 0)
        | (companies[i].isBankEntity ? CompanyTable.BANK : 0)
        | ((companies[i] as { mergerAcquired?: boolean }).mergerAcquired ? CompanyTable.ACQUIRED : 0)
        | (!companies[i].isDefaulted && !(companies[i] as { mergerAcquired?: boolean }).mergerAcquired
          ? CompanyTable.ACTIVE : 0);
      for (let f = 0; f < NUMERIC_FIELDS.length; f++) {
        const v = c[NUMERIC_FIELDS[f]];
        cols[f][i] = typeof v === 'number' && isFinite(v) ? v : 0;
      }
    }
    if (this.rowByTicker.length <= maxTicker) this.rowByTicker = new Int32Array(maxTicker + 1024).fill(-1);
    else this.rowByTicker.fill(-1);
    for (let i = 0; i < companies.length; i++) this.rowByTicker[tickerId[i]] = i;
  }

  /** Write the columns back onto the objects — the other half of the seam, until the objects go. */
  syncOut(): void {
    const cols = NUMERIC_FIELDS.map((f) => this.col(f));
    for (let i = 0; i < this.companies.length; i++) {
      const c = this.companies[i] as unknown as Record<string, unknown>;
      for (let f = 0; f < NUMERIC_FIELDS.length; f++) c[NUMERIC_FIELDS[f]] = cols[f][i];
    }
  }
}
