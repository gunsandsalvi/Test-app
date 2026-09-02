/**
 * §4.C STAGE II — THE COMPANY ROW STORE (the spine).
 *
 * Every scalar fact about a firm as a typed lane, row = the firm's index in `state.companies`.
 * Stage II.1 ships it as a REFRESH-AT-USE-POINT structure: one linear pass over the objects
 * fills every lane right before a consuming stage reads them, so validity is by construction
 * (§7.320's seam rule) and no writer needs finding yet. At ~2,500 firms × ~90 lanes the refresh
 * is a few milliseconds — what it buys is that the seam builders stop re-reading the object
 * graph field by field (buildBackLanes ALIASES its 1:1 lanes from here), and later stages'
 * readers flip one file at a time. The authority flip (writers → columns, objects → views) is
 * Stage II.4 and does not start until the readers are on rows.
 *
 * Lanes are SharedArrayBuffer-backed (§1.24) so the pool ships nothing when sharding lands;
 * growth copies (§7.309's wipe). NaN = the field was undefined (the exact `??` replay
 * convention every prior seam used); optional booleans carry 2 = undefined.
 */
import { GameState, Company } from '../types';
import { V2World, ensureV2 } from './world';

const F64_FIELDS = [
  // capital / production
  'customerConcentration', 'supplierConcentration', 'revenueVolatility', 'technicalReservesUSD',
  'aumUSD', 'managementFeeRate', 'insurancePremiumsWrittenUSD', 'insuranceClaimsPaidUSD',
  'cumulativeOutputUnits', 'learningMultiplier', 'lastLearningGrowthAnnual', 'mothballedPpeShare',
  'idleStreakWeeks', 'mothballedStreakWeeks', 'baselineAnnualRevenue', 'annualRevenue',
  'antitrustWeeksAboveThreshold', 'employeeCount', 'previousEmployeeCount', 'baselineEmployeeCount',
  'baselineNetPpeUSD', 'payrollWeeklyUSD', 'realInputConsumptionCostWeeklyUSD', 'ebitda',
  'baselineEbitdaMargin', 'ebit', 'netIncome', 'eps', 'sharesOutstanding', 'cash', 'totalDebt',
  'currentLiabilities', 'capex', 'previousCapex', 'maintenanceCapex', 'growthCapex', 'grossPPEUSD',
  'accumulatedDepreciationUSD', 'capexCommissionedLastWeekUSD', 'rndExpense',
  'baselineGrowthCapexToRevenueRatio', 'maintenanceShortfallStreak', 'executionQuality',
  // clocks / market
  'earningsWeekModulo', 'lastEarningsReportWeek', 'lastEarningsSurprisePct', 'mmfSharesUSD',
  'lastOpportunisticOfferingWeek', 'pendingLboEquityUSD', 'pendingIpoShares', 'lastRecapWeek',
  'bornWeek', 'leverage', 'interestCoverage', 'recoveryRate', 'baselineRecoveryRate', 'stockPrice',
  'forwardPE', 'marketCap', 'dividendYield', 'baselineDividendYield', 'bankMarketShare',
  'bankRiskFactor', 'defaultedWeek', 'institutionalMarketShare', 'beta', 'seniorBondYield',
  'oasSpreadBps', 'cdsSpreadBps', 'cdsBasisBps', 'shortInterestShares',
  'inputSupplyConstraintFactor', 'recentFulfillmentEMA', 'deliveryReliability',
  'recurringRevenueBaseUSD', '_targetProductionUSD', 'accruedTaxLiabilityUSD', 'bankResolvedWeek',
  'taxLossCarryforwardUSD', 'taxBasisPpeUSD', 'deferredTaxLiabilityUSD', 'lastWeekSalesUSD',
  'offeredWageIndex', 'unfilledVacancyShare', 'lastWeekPurchasesUSD', 'expectedEbitdaUSD',
] as const;

const BOOL_FIELDS = [
  'isBankEntity', 'isInstitutionalEntity', 'reportedThisWeek', 'isDefaulted', 'mergerAcquired',
] as const;

/** String-valued scalars kept as raw string lanes (undefined stays undefined); interned int
 *  refs join when a consumer needs them. `lastManagementCommentary` is UI prose — not laned. */
const STR_FIELDS = [
  'id', 'ticker', 'name', 'region', 'sector', 'creditRating', 'homeBankTicker', 'parentTicker',
  'primarySubUnitId', 'listingStatus', 'institutionalRole', 'institutionalEntityType',
  'hedgeFundStrategy', 'producedCommodityId', 'acquiredByTicker', 'pendingLboSponsorId',
  'pendingRecapSponsorId', 'pendingIpoSponsorId',
] as const;

export type CompanyF64Field = (typeof F64_FIELDS)[number];
export type CompanyBoolField = (typeof BOOL_FIELDS)[number];
export type CompanyStrField = (typeof STR_FIELDS)[number];

export interface CompanyStore {
  n: number;
  cap: number;
  num: Record<CompanyF64Field, Float64Array>;
  flag: Record<CompanyBoolField, Uint8Array>;
  str: Record<CompanyStrField, (string | undefined)[]>;
  /** Bumped by every refresh; readers may memo against it. */
  epoch: number;
}

// Browsers hide the SharedArrayBuffer global without cross-origin isolation (e.g. plain static
// hosting); a plain buffer is identical single-threaded, and the pools that need SAB are
// Node-only anyway.
const SAB: SharedArrayBufferConstructor | ArrayBufferConstructor =
  (globalThis as { SharedArrayBuffer?: SharedArrayBufferConstructor }).SharedArrayBuffer ?? ArrayBuffer;
const sabF64 = (cap: number) => new Float64Array(new SAB(cap * 8));
const sabU8 = (cap: number) => new Uint8Array(new SAB(Math.max(1, cap)));

function alloc(cap: number): CompanyStore {
  const num = {} as CompanyStore['num'];
  for (const f of F64_FIELDS) num[f] = sabF64(cap);
  const flag = {} as CompanyStore['flag'];
  for (const f of BOOL_FIELDS) flag[f] = sabU8(cap);
  const str = {} as CompanyStore['str'];
  for (const f of STR_FIELDS) str[f] = new Array(cap);
  return { n: 0, cap, num, flag, str, epoch: 0 };
}

// Keyed by the persistent V2World — the GameState OBJECT is rebuilt every week (stage 13's
// `{...state}`), so keying on it re-allocated the whole SAB store weekly (measured ~11.5 ms/wk
// of pure allocation before this line learned that fact).
let storeByState = new WeakMap<V2World, CompanyStore>();

/** Test seam: forget cached stores (batteries clone whole states). */
export function resetCompanyStores(): void { storeByState = new WeakMap(); }

/**
 * Fill every lane from the object graph. One pass, no allocation once at capacity; growth
 * copies (§7.309). Call at a consuming stage's top — validity is then by construction.
 */
export function refreshCompanyStore(state: GameState): CompanyStore {
  const companies = state.companies;
  const key = ensureV2(state);
  const n = companies.length;
  let S = storeByState.get(key);
  if (!S || S.cap < n) {
    const grown = alloc(Math.max(n, S ? S.cap * 2 : 0, 1 << 12));
    if (S) {
      // copy-on-grow — never a fresh half-filled lane mid-life (§7.309's wipe)
      for (const f of F64_FIELDS) grown.num[f].set(S.num[f]);
      for (const f of BOOL_FIELDS) grown.flag[f].set(S.flag[f]);
      for (const f of STR_FIELDS) for (let i = 0; i < S.n; i++) grown.str[f][i] = S.str[f][i];
    }
    S = grown;
    storeByState.set(key, S);
  }
  S.n = n;
  const num = S.num, flag = S.flag, str = S.str;
  for (let i = 0; i < n; i++) {
    const c = companies[i] as unknown as Record<string, unknown>;
    for (const f of F64_FIELDS) {
      const v = c[f];
      num[f][i] = v === undefined ? NaN : (v as number);
    }
    for (const f of BOOL_FIELDS) {
      const v = c[f];
      flag[f][i] = v === undefined ? 2 : (v ? 1 : 0);
    }
    for (const f of STR_FIELDS) str[f][i] = c[f] as string | undefined;
  }
  S.epoch++;
  return S;
}

/** Re-sync one firm's row after a mid-week writer (the future II.4 per-writer sync site). */
export function syncCompanyRow(S: CompanyStore, comp: Company, row: number): void {
  const c = comp as unknown as Record<string, unknown>;
  for (const f of F64_FIELDS) {
    const v = c[f];
    S.num[f][row] = v === undefined ? NaN : (v as number);
  }
  for (const f of BOOL_FIELDS) {
    const v = c[f];
    S.flag[f][row] = v === undefined ? 2 : (v ? 1 : 0);
  }
  for (const f of STR_FIELDS) S.str[f][row] = c[f] as string | undefined;
}

/**
 * COMPANY_SYNC_CHECK=1 — compare every lane against the objects and throw on the first
 * mismatch (undefined ≡ NaN / flag 2). The instrument that finds unsynced writers once the
 * store stops refreshing at every use point (Stage II.4's staging).
 */
export function checkCompanyStore(state: GameState, where: string): void {
  const S = storeByState.get(ensureV2(state));
  if (!S) return;
  const companies = state.companies;
  for (let i = 0; i < Math.min(S.n, companies.length); i++) {
    const c = companies[i] as unknown as Record<string, unknown>;
    for (const f of F64_FIELDS) {
      const o = c[f] as number | undefined;
      const l = S.num[f][i];
      const same = o === undefined ? Number.isNaN(l) : (o === l || (Number.isNaN(o) && Number.isNaN(l)));
      if (!same) throw new Error(`COMPANY_SYNC_CHECK ${where}: row ${i} (${companies[i].ticker}) field ${f}: object ${o} vs lane ${l}`);
    }
    for (const f of BOOL_FIELDS) {
      const o = c[f] as boolean | undefined;
      const l = S.flag[f][i];
      if ((o === undefined ? 2 : o ? 1 : 0) !== l) throw new Error(`COMPANY_SYNC_CHECK ${where}: row ${i} field ${f}: object ${o} vs lane ${l}`);
    }
    for (const f of STR_FIELDS) {
      if ((c[f] as string | undefined) !== S.str[f][i]) throw new Error(`COMPANY_SYNC_CHECK ${where}: row ${i} field ${f}: object ${String(c[f])} vs lane ${String(S.str[f][i])}`);
    }
  }
}

/** §4.C II.4 — one field's lane re-synced over the whole roster (a writer stage's cheap
 *  postlude: ~2,500 reads). Strings and flags route by field kind automatically. */
export function syncCompanyField(state: GameState, field: CompanyF64Field | CompanyBoolField | CompanyStrField): void {
  const S = storeByState.get(ensureV2(state));
  if (!S) return;
  const companies = state.companies;
  const m = Math.min(S.n, companies.length);
  if ((F64_FIELDS as readonly string[]).includes(field)) {
    const lane = S.num[field as CompanyF64Field];
    for (let i = 0; i < m; i++) {
      const v = (companies[i] as unknown as Record<string, unknown>)[field] as number | undefined;
      lane[i] = v === undefined ? NaN : v;
    }
  } else if ((BOOL_FIELDS as readonly string[]).includes(field)) {
    const lane = S.flag[field as CompanyBoolField];
    for (let i = 0; i < m; i++) {
      const v = (companies[i] as unknown as Record<string, unknown>)[field] as boolean | undefined;
      lane[i] = v === undefined ? 2 : v ? 1 : 0;
    }
  } else {
    const lane = S.str[field as CompanyStrField];
    for (let i = 0; i < m; i++) lane[i] = (companies[i] as unknown as Record<string, unknown>)[field] as string | undefined;
  }
}

/**
 * §4.C II.4 TRUST MODE — the store is kept current by the writer sync mesh (core.ts) and the
 * per-firm row sync at stage 08's write-back, so the weekly full refresh dies: only rows the
 * roster APPENDED since last week (births) fill here. COMPANY_SYNC_CHECK=1 verifies the mesh.
 */
export function trustCompanyStore(state: GameState): CompanyStore {
  const S = storeByState.get(ensureV2(state));
  if (!S) return refreshCompanyStore(state);
  const companies = state.companies;
  if (companies.length > S.cap) return refreshCompanyStore(state); // grow path re-fills
  for (let i = S.n; i < companies.length; i++) syncCompanyRow(S, companies[i], i);
  S.n = companies.length;
  S.epoch++;
  return S;
}

/** The store for this world, if it exists yet (the II.4 sync sites need it without forcing). */
export function companyStoreOf(state: GameState): CompanyStore | undefined {
  return storeByState.get(ensureV2(state));
}

// --- §4.C II.4 writer hunt -------------------------------------------------------------------
const staleSeen = new Set<string>();
const staleByStage = new Map<string, Set<string>>();

/**
 * COMPANY_STORE_AUDIT=1 — after every stage, record which fields FIRST went stale at which
 * stage (subsequent stages re-reporting the same staleness are not the writer). One short run
 * names every writer the II.4 dual-write must cover; printed at each week's last stage.
 */
export function auditCompanyStore(state: GameState, stage: string): void {
  const S = storeByState.get(ensureV2(state));
  if (!S) return;
  const companies = state.companies;
  const cur = new Set<string>();
  const m = Math.min(S.n, companies.length);
  for (const f of F64_FIELDS) {
    const lane = S.num[f];
    for (let i = 0; i < m; i++) {
      const o = (companies[i] as unknown as Record<string, unknown>)[f] as number | undefined;
      const l = lane[i];
      const same = o === undefined ? Number.isNaN(l) : (o === l || (Number.isNaN(o) && Number.isNaN(l)));
      if (!same) { cur.add(f); break; }
    }
  }
  for (const f of BOOL_FIELDS) {
    const lane = S.flag[f];
    for (let i = 0; i < m; i++) {
      const o = (companies[i] as unknown as Record<string, unknown>)[f] as boolean | undefined;
      if ((o === undefined ? 2 : o ? 1 : 0) !== lane[i]) { cur.add(f); break; }
    }
  }
  for (const f of STR_FIELDS) {
    const lane = S.str[f];
    for (let i = 0; i < m; i++) {
      if (((companies[i] as unknown as Record<string, unknown>)[f] as string | undefined) !== lane[i]) { cur.add(f); break; }
    }
  }
  if (companies.length !== S.n) cur.add('(roster length)');
  for (const f of cur) {
    if (!staleSeen.has(f)) {
      staleSeen.add(f);
      let set = staleByStage.get(stage);
      if (!set) { set = new Set(); staleByStage.set(stage, set); }
      set.add(f);
    }
  }
  for (const f of [...staleSeen]) if (!cur.has(f)) staleSeen.delete(f); // refresh healed it
  if (stage === '13-news-and-turn-summary') {
    for (const [st, fields] of staleByStage) {
      console.log(`[company-store-audit] ${st}: ${[...fields].sort().join(' ')}`);
    }
  }
}
