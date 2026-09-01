/**
 * ENGINE V2 — THE WORLD AS COLUMNS (SCALE campaign; the user's chosen scope, 2026-09-01:
 * FULL FIDELITY — every mechanism keeps existing, only the representation changes; numeric
 * drift from the rewrite is accepted, mechanism removal is not).
 *
 * One contiguous arena of typed arrays. No objects in the weekly path, no string keys, no
 * per-week allocation. Snapshot/restore is a memcpy — the battery-isolation lesson (§7.303)
 * designed in rather than leaned on.
 *
 * This file GROWS table-by-table as stages port (the strangler over columns): a table lands
 * here when its owning stage's columnar port needs it, with the full mechanism's detail —
 * FIFO lots stay lots, contracts stay contracts, the ladder stays a ladder. The unported
 * remainder of the week keeps reading the object world through sync seams until its turn.
 */

import { REGION_IDS } from '../domain/geography';
import { INDUSTRY_SUBUNITS } from '../domain/industry';

export const NREGIONS = REGION_IDS.length;

/** Every sub-unit the registry knows, in one fixed order — the goods axis. */
export const SUBUNITS: string[] = Object.values(INDUSTRY_SUBUNITS).flat().map((s) => s.unitId);
export const SUBUNIT_INDEX = new Map(SUBUNITS.map((u, i) => [u, i]));
export const NSUB = SUBUNITS.length;

export const OCCS = ['GENERAL', 'SKILLED_TRADES', 'TECHNICAL_ENGINEERING', 'SPECIALIZED_PROFESSIONAL', 'MANAGERIAL_FINANCIAL'] as const;
export const NOCC = OCCS.length;

/** Company flags. */
export const F_ACTIVE = 1, F_BANK = 2, F_DEFAULTED = 4, F_LISTED = 8, F_INSTITUTION = 16;

export interface WorldState {
  week: number;
  nFirms: number;
  /** One buffer; every column is a view into it. Snapshot = one slice copy. */
  buffer: ArrayBuffer;

  // ---- firms (row = firm) ----
  firmRegion: Uint8Array;
  firmFlags: Uint8Array;
  firmSector: Uint8Array; // index into SECTORS (below)
  // scalars (f64), one column each — the stage-08 census write-set core
  annualRevenue: Float64Array;
  baselineRevenue: Float64Array;
  ebitdaMargin: Float64Array;
  ebitda: Float64Array;
  ebit: Float64Array;
  netIncome: Float64Array;
  cash: Float64Array;
  totalDebt: Float64Array;
  debtRateAnnual: Float64Array;   // blended, walks with policy
  grossPPE: Float64Array;
  accumDep: Float64Array;
  usefulLife: Float64Array;
  employees: Float64Array;
  baselineEmployees: Float64Array;
  wageIndex: Float64Array;
  taxBasisPpe: Float64Array;
  taxCarryforward: Float64Array;
  deferredTax: Float64Array;
  accruedTax: Float64Array;
  cumOutputUnits: Float64Array;
  learningMult: Float64Array;
  lastLearningGrowth: Float64Array;
  mothballedShare: Float64Array;
  idleStreak: Float64Array;
  mothballStreak: Float64Array;
  maintCapex: Float64Array;
  growthCapex: Float64Array;
  competitiveness: Float64Array;
  marketCap: Float64Array;
  stockPrice: Float64Array;
  sharesOut: Float64Array;
  salesUSDWeek: Float64Array;     // cleared this week (scratch, persisted for reads)
  inputCostWeek: Float64Array;    // consumed this week
  payrollWeek: Float64Array;
  revHistory: Float64Array;       // ring, stride 13
  priceHistory: Float64Array;     // ring, stride 52

  // ---- firm product lines (CSR by firm) ----
  lineStart: Int32Array;          // nFirms+1
  lineSub: Int32Array;            // sub-unit index
  lineShare: Float64Array;        // revenue share
  lineCapacityUnits: Float64Array;// weekly capacity at full staffing
  lineMarketShare: Float64Array;

  // ---- goods markets (row = region*NSUB + sub) ----
  mktPrice: Float64Array;
  mktPriceSmoothed: Float64Array;
  mktUnitsDemanded: Float64Array;
  mktUnitsSupplied: Float64Array;
  mktHouseholdWeight: Float64Array; // static from registry buyer mix
  mktGovWeight: Float64Array;
  mktCorpIntensity: Float64Array;   // corporate units per firm per year

  // ---- input-output: recipe matrix (dense NSUB x NSUB is too big? ~200x200 = 40k f64 fine) ----
  recipe: Float64Array;             // recipe[out*NSUB+in] = $ input per $ output

  // ---- input stocks per firm x sub (sparse CSR by firm over its recipe inputs) ----
  invStart: Int32Array;
  invSub: Int32Array;
  invUnits: Float64Array;
  invValue: Float64Array;
  outUnits: Float64Array;           // finished stock per line (parallel to lines)
  outValue: Float64Array;

  // ---- regions ----
  policyRate: Float64Array;
  inflation: Float64Array;
  cpi: Float64Array;
  gdpWeekly: Float64Array;
  taxRateCorp: Float64Array;
  unemployment: Float64Array;
  laborForce: Float64Array;
  employed: Float64Array;
  wageAnnual: Float64Array;         // per region x occ (stride NOCC)
  hhIncomeWeekly: Float64Array;
  hhDeposits: Float64Array;
  hhBudgetWeekly: Float64Array;
  govBudgetWeekly: Float64Array;
  govDebt: Float64Array;
  govRate: Float64Array;
  taxCollectedWeek: Float64Array;

  // ---- banks (row = bank; CSR not needed, small) ----
  nBanks: number;
  bankRegion: Uint8Array;
  bankFirmRow: Int32Array;          // link to its firm row
  bankDeposits: Float64Array;
  bankLoans: Float64Array;
  bankReserves: Float64Array;
  bankEquity: Float64Array;
  bankWholesale: Float64Array;
}

export const SECTORS = ['Tech', 'Financials', 'Industrials', 'Energy', 'Consumer', 'Healthcare', 'Utilities', 'Banks', 'RealEstate', 'Other'] as const;
export const SECTOR_INDEX = new Map(SECTORS.map((s, i) => [s, i]));

interface ColSpec { name: keyof WorldState; kind: 'f64' | 'i32' | 'u8'; len: number }

/** Allocate every column out of ONE buffer so snapshot/restore is a single copy. */
export function allocWorld(nFirms: number, nLines: number, nInv: number, nBanks: number): WorldState {
  const R = NREGIONS;
  const specs: ColSpec[] = [
    { name: 'firmRegion', kind: 'u8', len: nFirms },
    { name: 'firmFlags', kind: 'u8', len: nFirms },
    { name: 'firmSector', kind: 'u8', len: nFirms },
    ...([
      'annualRevenue', 'baselineRevenue', 'ebitdaMargin', 'ebitda', 'ebit', 'netIncome', 'cash',
      'totalDebt', 'debtRateAnnual', 'grossPPE', 'accumDep', 'usefulLife', 'employees',
      'baselineEmployees', 'wageIndex', 'taxBasisPpe', 'taxCarryforward', 'deferredTax',
      'accruedTax', 'cumOutputUnits', 'learningMult', 'lastLearningGrowth', 'mothballedShare',
      'idleStreak', 'mothballStreak', 'maintCapex', 'growthCapex', 'competitiveness', 'marketCap',
      'stockPrice', 'sharesOut', 'salesUSDWeek', 'inputCostWeek', 'payrollWeek',
    ] as const).map((n) => ({ name: n, kind: 'f64' as const, len: nFirms })),
    { name: 'revHistory', kind: 'f64', len: nFirms * 13 },
    { name: 'priceHistory', kind: 'f64', len: nFirms * 52 },
    { name: 'lineStart', kind: 'i32', len: nFirms + 1 },
    { name: 'lineSub', kind: 'i32', len: nLines },
    { name: 'lineShare', kind: 'f64', len: nLines },
    { name: 'lineCapacityUnits', kind: 'f64', len: nLines },
    { name: 'lineMarketShare', kind: 'f64', len: nLines },
    { name: 'outUnits', kind: 'f64', len: nLines },
    { name: 'outValue', kind: 'f64', len: nLines },
    ...(['mktPrice', 'mktPriceSmoothed', 'mktUnitsDemanded', 'mktUnitsSupplied',
      'mktHouseholdWeight', 'mktGovWeight', 'mktCorpIntensity'] as const)
      .map((n) => ({ name: n, kind: 'f64' as const, len: R * NSUB })),
    { name: 'recipe', kind: 'f64', len: NSUB * NSUB },
    { name: 'invStart', kind: 'i32', len: nFirms + 1 },
    { name: 'invSub', kind: 'i32', len: nInv },
    { name: 'invUnits', kind: 'f64', len: nInv },
    { name: 'invValue', kind: 'f64', len: nInv },
    ...(['policyRate', 'inflation', 'cpi', 'gdpWeekly', 'taxRateCorp', 'unemployment',
      'laborForce', 'employed', 'hhIncomeWeekly', 'hhDeposits', 'hhBudgetWeekly',
      'govBudgetWeekly', 'govDebt', 'govRate', 'taxCollectedWeek'] as const)
      .map((n) => ({ name: n, kind: 'f64' as const, len: R })),
    { name: 'wageAnnual', kind: 'f64', len: R * NOCC },
    { name: 'bankRegion', kind: 'u8', len: nBanks },
    { name: 'bankFirmRow', kind: 'i32', len: nBanks },
    ...(['bankDeposits', 'bankLoans', 'bankReserves', 'bankEquity', 'bankWholesale'] as const)
      .map((n) => ({ name: n, kind: 'f64' as const, len: nBanks })),
  ];
  let bytes = 0;
  const offsets: number[] = [];
  for (const c of specs) {
    const sz = c.kind === 'f64' ? 8 : c.kind === 'i32' ? 4 : 1;
    bytes = Math.ceil(bytes / sz) * sz;
    offsets.push(bytes);
    bytes += c.len * sz;
  }
  const buffer = new ArrayBuffer(bytes);
  const world = { week: 0, nFirms, nBanks, buffer } as unknown as WorldState;
  specs.forEach((c, i) => {
    const view = c.kind === 'f64' ? new Float64Array(buffer, offsets[i], c.len)
      : c.kind === 'i32' ? new Int32Array(buffer, offsets[i], c.len)
        : new Uint8Array(buffer, offsets[i], c.len);
    (world as unknown as Record<string, unknown>)[c.name as string] = view;
  });
  return world;
}

/** The whole world, copied — the battery/counterfactual primitive. */
export function snapshotWorld(w: WorldState): ArrayBuffer {
  return w.buffer.slice(0);
}
export function restoreWorld(w: WorldState, snap: ArrayBuffer): void {
  new Uint8Array(w.buffer).set(new Uint8Array(snap));
}
