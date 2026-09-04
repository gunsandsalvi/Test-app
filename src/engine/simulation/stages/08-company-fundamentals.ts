/**
 * Stage 8: Company Fundamentals
 *
 * Evolves every company's full weekly financial state: revenue (bank/insurer/asset-manager
 * specialty profiles, or the generic demand/margin/production model), maintenance and growth
 * capex, credit rating and OAS spread, debt refinancing/prepayment, quarterly earnings,
 * equity price (holder-class rebalancing flow), buybacks, and the resulting balance sheet.
 * The single largest and most interdependent stage. (The `ARCHITECTURE.md` this line used to
 * point at does not exist in this tree; `docs/MASTER_PLAN.md` §2 is the map.)
 */

import {
  GameState, Company, NewsItem, RegionId,
} from '../../../types';
import { currencyOfId } from '../../../engine2/world';
import { buildEntityIndex } from '../../ledger/entity-index';
import { isActiveCompany, getOutputInventoryLocal, banksOf } from '../../../domain/company';
import { applyPendingCorporateActionSettlements, applyHolderInterestAccruals } from './shared-helpers';
import { openCorporateSweepBooks, settleCorporateSweepBooks } from './money-market-fund';
import { PrimaryOffering, chooseLeadBank } from '../../../domain/primary-market';
import { leadBankAllocator } from './dealer-desks';
import { WeeklyStepContext, EarningsReport } from './context';
import { PaymentJournal, newPaymentJournal, journalPush, journalAppendRow, applyPendingLeg } from './settlement';
import { runShardedVoid } from '../../columns/kernel';
import { annualCarryingCostRateOf } from '../../../domain/industry-registry';
import { getRngState, setRngState } from '../../rng';
import { runStage08FrontPass } from '../../../engine2/stage08-front';
import { ensureV2 } from '../../../engine2/world';
import { makeStage08BackKernel, learnTraceRows, bypassTraceByLabel, boundaryTraceByFirm , s08k, runBackCoreA, runBackCoreB, runMmfRedemption, rebuildBackCoreA, applyCapCompWrites } from '../../../engine2/stage08-back';
import { buildBackLanes } from '../../../engine2/stage08-lanes';
import { trustCompanyStore, checkCompanyStore, syncCompanyRow } from '../../../engine2/company-store';
import { backWorkerCount, dispatchBackA, collectBackA } from '../../../engine2/back-pool';
import type { BackAShardOut } from '../../../engine2/back-worker';
import type { EntityId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';
import { asTicker } from '../../../domain/ids';

/** SCALE / DECLARED RELABEL (§7.304, the drift acceptance): decimal rounding by arithmetic
 *  instead of a string round-trip; ULP-edge differences from toFixed accepted. */
const roundN = (v: number, pow: number) => Math.round(v * pow) / pow;


/** SCALE: the supply list's own derived indexes, memoised on the array that produced them. */
interface GroupedSupply {
  byCustomer: Map<string, { supplierCompanyId: string; category: string; weeklyVolumeLocal: number; relationshipStrength: number }[]>;
  categoriesBySupplier: Map<EntityId, Set<string>>;
}
const groupedSupplyByList = new WeakMap<object, GroupedSupply>();

function groupSupplyRelationships(
  updatedRegions: Record<string, { supplyRelationships?: unknown[] } | undefined>
): GroupedSupply {
  const lists: unknown[][] = [];
  (Object.keys(updatedRegions) as string[]).forEach((rid) => {
    const l = updatedRegions[rid]?.supplyRelationships;
    if (l && l.length > 0) lists.push(l);
  });
  // One memo key for the whole world: the regions' four lists are replaced together, so any one
  // of them being new means the grouping is stale. The first list stands for the set.
  const key = lists.length > 0 ? (lists[0] as unknown as object) : undefined;
  if (key) {
    const memo = groupedSupplyByList.get(key);
    if (memo) return memo;
  }
  const byCustomer = new Map<string, never[]>() as unknown as GroupedSupply['byCustomer'];
  const categoriesBySupplier = new Map<EntityId, Set<string>>();
  lists.forEach((list) => {
    (list as { customerCompanyId: EntityId; supplierCompanyId: EntityId; category: string }[]).forEach((rel) => {
      const existing = byCustomer.get(rel.customerCompanyId);
      if (existing) existing.push(rel as never); else byCustomer.set(rel.customerCompanyId, [rel as never]);
      let set = categoriesBySupplier.get(rel.supplierCompanyId);
      if (!set) { set = new Set(); categoriesBySupplier.set(rel.supplierCompanyId, set); }
      set.add(rel.category);
    });
  });
  const out: GroupedSupply = { byCustomer, categoriesBySupplier };
  if (key) groupedSupplyByList.set(key, out);
  return out;
}

// §7.315's method — name the term before converting: a per-phase split of this stage's 280 ms
// (12wk profile). One-run diagnostic, free when off.
const S08_PROF = typeof process !== 'undefined' && process.env?.S08_PROF === '1';

export function runCompanyFundamentalsStage(state: GameState, ctx: WeeklyStepContext): void {
  const __p0 = S08_PROF ? performance.now() : 0;
  const { nextWeek, currentWeekMod13, companyUpdates, prevActiveFirms, updatedRegions, systemicStressFactorGlobal } = ctx;
  let refinanceNews: NewsItem[] = [];
  const retainCashLedger = process.env.CASH_LEDGER === '1';
  bypassTraceByLabel.clear();
  boundaryTraceByFirm.clear();

  // Per-week indices, built once (see the plan's optimization rule: memoize per-week derived
  // values at the top of a stage, never inside a per-company loop). Each of these was a full
  // scan of a multi-thousand-element array executed once per company.
  // §3.13-BOOK (c-then-2): the institutions from the ONE builder. `firmById` stays its own map:
  // it indexes `prevActiveFirms` — the ACTIVE, PUBLICLY LISTED subset this stage runs over — which
  // is a filter and therefore a claim, not a lookup (see `ledger/entity-index.ts`).
  const { institutionById: entityById } = buildEntityIndex([], state.institutionalEntities);
  const firmById = new Map(prevActiveFirms.map(c => [c.id, c]));
  // CRD-R1 — the median issuer's revenue, so SCALE in the rating is relative to the firms a
  // credit is actually rated against rather than a stated size (§7.184).
  const regionMedianRevenueLocal = (() => {
    const revs = prevActiveFirms.map(c => c.annualRevenue).filter(r => r > 0).sort((a, b) => a - b);
    return revs.length > 0 ? revs[Math.floor(revs.length / 2)] : 1;
  })();
  // SCALE: the one cross-company read in the loop below. Companies are now updated IN PLACE,
  // so a customer processed after its supplier would otherwise read the supplier's POST-update
  // book; snapshot the two supplier figures the relationship shock needs before anything moves,
  // which is exactly what the old rebuild-a-fresh-object week gave every reader.
  const supplierShockStats = new Map<string, { annualRevenue: number; invUSDByCategory: Map<string, number> }>();
  // Supply relationships indexed by customer. This was a full scan of the region's relationship
  // list for EVERY company — the same O(companies x list) shape that made corporate-action
  // settlement 12% of the weekly step. One grouping pass instead.
  //
  // SCALE: THE GROUPING IS CACHED ON THE RELATIONSHIP LIST ITSELF. There are ~165,000
  // relationships and `formSupplyRelationships` rebuilds them **every thirteenth week** — but this
  // grouped all 165,000 of them WEEKLY, and with them the set of (supplier, category) pairs the
  // shock statistics are keyed on. Both are properties of the relationship list, so both are
  // memoised against that array's identity: when stage 03 regenerates the list it hands over a new
  // array, and the memo lapses with it. What stays weekly is the only part that is actually
  // weekly — each supplier's CURRENT revenue and inventory, read over the distinct pairs rather
  // than over every relationship.
  const grouped = groupSupplyRelationships(updatedRegions);
  const supplyRelsByCustomer = grouped.byCustomer;
  grouped.categoriesBySupplier.forEach((categories, supplierId) => {
    const supplier = firmById.get(supplierId);
    if (!supplier) return;
    const invUSDByCategory = new Map<string, number>();
    categories.forEach((category) => {
      invUSDByCategory.set(category, getOutputInventoryLocal(supplier, category));
    });
    supplierShockStats.set(supplierId, { annualRevenue: supplier.annualRevenue, invUSDByCategory });
  });
  const suppliedSubUnitsByRegion = new Map<string, Set<string>>();
  prevActiveFirms.forEach(c => {
    let set = suppliedSubUnitsByRegion.get(c.region);
    if (!set) { set = new Set<string>(); suppliedSubUnitsByRegion.set(c.region, set); }
    (c.productLines || []).forEach(pl => set!.add(pl.subUnitId));
  });

  // IND16 — WHAT WAREHOUSING EARNS THIS WEEK, computed BEFORE any firm's own week so the sector
  // that holds the goods recognises the revenue in the same week the firms holding costs are
  // charged. Doing it inside the per-firm loop would have booked a distributor's income out of
  // whichever firms happened to be processed before it.
  const carryingCostByTicker = new Map<Ticker, number>();
  prevActiveFirms.forEach(c => {
    let total = 0;
    Object.entries(c.outputInventoryBySubUnit || {}).forEach(([su, inv]) => {
      total += (inv as { valueLocal: number }).valueLocal * (annualCarryingCostRateOf(su) / 52);
    });
    if (total > 0) carryingCostByTicker.set(c.ticker, total);
  });
  carryingCostByTicker.forEach((costLocal, ticker) => {
    const owner = prevActiveFirms.find(c => c.ticker === ticker);
    if (!owner) return;
    ctx.channelShareByRegion[owner.region]?.forEach((share, holderTicker) => {
      if (holderTicker === ticker) return; // a distributor warehouses its own stock
      const amountLocal = costLocal * share;
      if (amountLocal > 0) {
        ctx.channelMarginRevenue[holderTicker] = (ctx.channelMarginRevenue[holderTicker] ?? 0) + amountLocal;
      }
    });
  });

  // WS7: per-region redemption capacity for the treasury sweeps below — the funds' real cash.
  const mmfSweepBooks = openCorporateSweepBooks(ctx);

  // WS8: this week's priced offerings, indexed by issuer, and the pending queue by issuer so a
  // company never runs two books at once. Lead banks are chosen per region from the named banks.
  const primarySettlementByIssuerId = new Map<string, { offering: PrimaryOffering; clearedStat: number; struckTerms?: { couponRate: number; maturityWeek: number }; withdrawn: boolean; marketTakeLocal: number; issuedLocal: number; proceedsLocal: number }>();
  ctx.primarySettlements.forEach((s) => primarySettlementByIssuerId.set(s.offering.issuerId, s));
  const pendingOfferingIssuerIds = new Set(ctx.primaryOfferingsWorking.map((o) => o.issuerId));
  // G3c: mandates go to the bank that carries the issuer's credit, and — with no incumbent —
  // to the desk that can still underwrite. Both are measured here, per region, once a week.
  const leadAllocatorByRegion = new Map<string, ReturnType<typeof leadBankAllocator>>();
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    leadAllocatorByRegion.set(r, leadBankAllocator(
      ctx, banksOf(ctx.prevActiveFirms, r), 'corporate bond'
    ));
  });
  /** Who leads this issuer's deal — re-asked every time, so the mandate can be lost. */
  const leadBankFor = (comp: Company, sizeLocal: number): Ticker => {
    const alloc = leadAllocatorByRegion.get(comp.region);
    if (!alloc) return comp.homeBankTicker ?? asTicker('');
    const ticker = chooseLeadBank(comp.id, alloc.candidatesFor(comp.id));
    if (ticker) alloc.award(ticker, sizeLocal);
    return ticker || (comp.homeBankTicker ?? asTicker(''));
  };
  const enqueueOffering = (o: PrimaryOffering) => {
    ctx.primaryOfferingsWorking.push(o);
    pendingOfferingIssuerIds.add(o.issuerId);
  };

  // ENGINE V2 — the kernel's FRONT HALF (through the income statement) runs here as a pass over
  // all rows before the object kernel below touches any firm; legal because the loop is
  // order-invariant (the note below) and firms interact only through the frozen snapshots this
  // pass receives. The pass makes each firm's one front-half draw in the firm's own entity
  // scope and captures the stream position; the loop below resumes from it.
  const v2 = ensureV2(state);
  // §4.C Stage II.1 — the company row store, refreshed before the front pass so every scalar
  // lane is current by construction; the seam and the back lanes read/alias its columns.
  const companyStore = trustCompanyStore(state);
  if (process.env.COMPANY_SYNC_CHECK === '1') checkCompanyStore(state, 'stage-08 top (trust)');
  const F = runStage08FrontPass(state.companies, {
    v2, nextWeek, companyUpdates, updatedRegions,
    supplyRelsByCustomer, supplierShockStats, suppliedSubUnitsByRegion, companyStore,
  });
  const __p1 = S08_PROF ? performance.now() : 0;

  // SCALE/§7.222 — ONE COMPANY'S WEEK, AND IT DEPENDS ON NOTHING ABOUT WHERE IT SITS.
  // The loop below is order-invariant: reversing it leaves every aggregate identical to
  // seventeen significant digits, with the only residual difference two ULP of float-summation
  // associativity in the accumulators, which the ordered combine removes. That property is what
  // makes the stage shardable, and it is NOT free — it holds because each company opens its own
  // random stream (rng.ts's `beginEntityScope`) instead of drawing from wherever the shared
  // stream happens to have reached. Before that, reversing this loop moved aggregate net income
  // by 2.0% and killed a different firm.
  //
  // If you add a draw, a contended resource, or a read of another company's live book to this
  // kernel, you break that property. The test is one line: run the loop backwards and hash the
  // world.
  // §7.317 steps 1.1-1.2 — the back seam: one pass reads every firm's capital-block inputs
  // into typed lanes before the shard loop; the core reads rows, not objects.
  const backLanes = buildBackLanes(state.companies, updatedRegions, companyUpdates, new Set(state.institutionalEntities.map(e => e.id)), ctx.carrierFreightRevenue, ctx.channelMarginRevenue, companyStore, v2);
  const backDeps: import('../../../engine2/stage08-back').BackKernelDeps = {
    state, ctx, v2, F, backLanes, nextWeek, currentWeekMod13, updatedRegions, companyUpdates, entityById,
    regionMedianRevenueLocal, systemicStressFactorGlobal, retainCashLedger, mmfSweepBooks,
    primarySettlementByIssuerId, pendingOfferingIssuerIds, leadBankFor, enqueueOffering,
    pushNews: (n: NewsItem) => refinanceNews.push(n),
  };
  const companyWeekKernel = makeStage08BackKernel(backDeps);

  // SCALE wave 2 — THE COMPANY WEEK AS A SHARDED KERNEL (columns/kernel.ts).
  //
  // Contiguous row ranges, each with its OWN accumulators, folded back **in shard order**. That
  // ordering is the whole of determinism here: float addition is not associative, so a reduction
  // reproduces only if the shards combine in a fixed order — and row ranges give exactly that.
  // Executed inline today, so this is bit-identical to the serial loop it replaces; what it buys
  // is that the stage no longer has a single mutable accumulator threading every company to the
  // next, which is what a worker cannot have.
  //
  // TWO SERIALISATION POINTS REMAIN, both deliberate and both named so they are not forgotten:
  // `mmfSweepBooks` (a fund's finite cash, drawn down as companies redeem) and
  // `leadAllocatorByRegion` (a desk's capacity, consumed as mandates are awarded). Both are real
  // contended resources — first come really is first served — so neither can be a per-shard
  // accumulator. Before the worker step they must move OUT of the kernel and INTO the combine,
  // where the draw happens in row order. §7.222 measured that neither binds in the opening weeks,
  // which is why the stage is order-invariant today; that is a fact about the current world, not
  // a property to rely on.
  const companyRows = state.companies;
  const updatedCompanies: Company[] = new Array(companyRows.length);

  interface CompanyShardAccumulators {
    defaulted: Ticker[];
    ratings: WeeklyStepContext['ratingChanges'];
    earnings: EarningsReport[];
    offerings: PrimaryOffering[];
    news: NewsItem[];
    taxAccrued: Record<string, number>;
    journal: PaymentJournal;
    // §7.317 — the holder-register channels, shard-isolated like the tax maps so the kernel
    // touches no shared mutable: accruals and cash merge by per-key ADDITION, the settlement
    // ratios by per-key MULTIPLICATION (their compose rule), the payout set by ordered union —
    // each in shard order = firm order, float-identical to the inline writes.
    holderAccruals: Map<string, number>;
    holderCash: Map<string, number>;
    holderPayout: Set<string>;
    holderSettlements: Map<string, number>;
  }

  /** The current accumulator set, by reference — §7.321 primitives shared by the shard path
   *  and the barrier path. */
  const snapshotAccums = (): CompanyShardAccumulators => ({
    defaulted: ctx.defaultedTickers,
    ratings: ctx.ratingChanges,
    earnings: ctx.earningsReportedThisTurn,
    offerings: ctx.primaryOfferingsWorking,
    news: refinanceNews,
    taxAccrued: ctx.taxAccruedByRegion,
    journal: ctx.paymentJournal,
    holderAccruals: ctx.pendingHolderAccrualLocal,
    holderCash: ctx.pendingHolderCashLocal,
    holderPayout: ctx.pendingHolderAccrualPayout,
    holderSettlements: ctx.pendingHolderSettlements,
  });
  const installAccums = (a: CompanyShardAccumulators): void => {
    ctx.defaultedTickers = a.defaulted;
    ctx.ratingChanges = a.ratings;
    ctx.earningsReportedThisTurn = a.earnings;
    ctx.primaryOfferingsWorking = a.offerings;
    refinanceNews = a.news;
    ctx.taxAccruedByRegion = a.taxAccrued;
    ctx.paymentJournal = a.journal;
    ctx.pendingHolderAccrualLocal = a.holderAccruals;
    ctx.pendingHolderCashLocal = a.holderCash;
    ctx.pendingHolderAccrualPayout = a.holderPayout;
    ctx.pendingHolderSettlements = a.holderSettlements;
  };
  /** Point the shared accumulators at this shard's own, and hand back what they were. */
  const openShard = (): CompanyShardAccumulators => {
    const held = snapshotAccums();
    installAccums({
      defaulted: [], ratings: [], earnings: [], offerings: [], news: [],
      taxAccrued: {}, journal: newPaymentJournal(),
      holderAccruals: new Map(), holderCash: new Map(),
      holderPayout: new Set(), holderSettlements: new Map(),
    });
    return held;
  };

  /** Fold `mine` into the CURRENT accumulators, in order — the §7.321 merge primitive. */
  const mergeAccums = (mine: CompanyShardAccumulators, deferMergeAppliesNet = false): void => {

    for (const t of mine.defaulted) ctx.defaultedTickers.push(t);
    for (const r of mine.ratings) ctx.ratingChanges.push(r);
    for (const e of mine.earnings) ctx.earningsReportedThisTurn.push(e);
    for (const o of mine.offerings) ctx.primaryOfferingsWorking.push(o);
    for (const n of mine.news) refinanceNews.push(n);
    for (const r of Object.keys(mine.taxAccrued)) {
      ctx.taxAccruedByRegion[r] = (ctx.taxAccruedByRegion[r] ?? 0) + mine.taxAccrued[r];
    }
    const j = ctx.paymentJournal;
    for (let k = 0; k < mine.journal.n; k++) {
      // §5-WIRES W1: the shard's rows were wired when it journaled them — fold the ROWS.
      journalAppendRow(j, mine.journal.payerId[k], mine.journal.payeeId[k],
        mine.journal.amount[k], currencyOfId(mine.journal.currencyId[k]), mine.journal.reasonId[k], mine.journal.settleWeek[k]);
      // §7.321 barrier mode: the running net, applied here in the merged (= original) leg
      // order; in normal shard mode emission already applied it and this replay must not.
      if (deferMergeAppliesNet) applyPendingLeg(ctx, mine.journal.payerId[k], mine.journal.payeeId[k], mine.journal.amount[k], currencyOfId(mine.journal.currencyId[k]), mine.journal.settleWeek[k]);
    }
    mine.holderAccruals.forEach((v, k) => {
      ctx.pendingHolderAccrualLocal.set(k, (ctx.pendingHolderAccrualLocal.get(k) ?? 0) + v);
    });
    mine.holderCash.forEach((v, k) => {
      ctx.pendingHolderCashLocal.set(k, (ctx.pendingHolderCashLocal.get(k) ?? 0) + v);
    });
    mine.holderPayout.forEach((k) => ctx.pendingHolderAccrualPayout.add(k));
    mine.holderSettlements.forEach((v, k) => {
      ctx.pendingHolderSettlements.set(k, (ctx.pendingHolderSettlements.get(k) ?? 1) * v);
    });
  };
  /** Fold this shard's accumulators onto the ones it displaced, in shard order. */
  const closeShard = (held: CompanyShardAccumulators): void => {
    const mine = snapshotAccums();
    installAccums(held);
    mergeAccums(mine);
  };

  // §7.321/323 — BACK_BARRIER=1: the POOL'S EXECUTION ORDER, run serially and byte-gated
  // before any worker exists (the §7.316 vacuous-test lesson, inverted): all core-A in row
  // order, then every liquidity redemption, then all core-B (each under the stream core-A left
  // for the firm — the PROFILE branch draws in A), then every post — with each phase's
  // emissions captured PER FIRM and folded back as [A, red, B, post] per firm in row order, so
  // the journal and every accumulator reproduce the interleaved loop exactly.
  if (process.env.BACK_BARRIER === '1' || backWorkerCount() >= 2) {
    const n = companyRows.length;
    // §7.325 — PHASE-LEVEL CAPTURE. The §7.324 per-firm capture allocated ~12 objects (a fresh
    // PaymentJournal among them) per firm per phase and merged Maps per firm — measured at ~10x
    // the kernel itself (serial ~110ms/wk, barrier ~1,150ms/wk). Same oracle semantics, new
    // mechanism: ONE accumulator set per phase, per-firm END OFFSETS into every family, and one
    // firm-major replay appending exactly the captured entries in [A, red, B, post] order per
    // firm. The Map families are sliceable because every kernel holder key carries the firm's
    // own companyId (one writer per key) and Maps preserve insertion order; the TAX maps are
    // not (many firms add into one region key), so the walk reports its two exact amounts per
    // row via d.taxCapture and the replay adds those same floats in firm order — a delta
    // recovered by subtraction would be a different float (§7.324's lesson).
    interface PhaseMarks {
      def: Int32Array; ratings: Int32Array; earnings: Int32Array;
      offerings: Int32Array; news: Int32Array; journalN: Int32Array;
      hAcc: Int32Array; hCash: Int32Array; hPay: Int32Array; hSettle: Int32Array;
    }
    const runPhase = (body: (i: number) => void): { acc: CompanyShardAccumulators; marks: PhaseMarks } => {
      const held = openShard();
      const acc = snapshotAccums();
      const marks: PhaseMarks = {
        def: new Int32Array(n), ratings: new Int32Array(n),
        earnings: new Int32Array(n), offerings: new Int32Array(n), news: new Int32Array(n),
        journalN: new Int32Array(n), hAcc: new Int32Array(n), hCash: new Int32Array(n),
        hPay: new Int32Array(n), hSettle: new Int32Array(n),
      };
      for (let i = 0; i < n; i++) {
        body(i);
        marks.def[i] = acc.defaulted.length;
        marks.ratings[i] = acc.ratings.length; marks.earnings[i] = acc.earnings.length;
        marks.offerings[i] = acc.offerings.length; marks.news[i] = acc.news.length;
        marks.journalN[i] = acc.journal.n; marks.hAcc[i] = acc.holderAccruals.size;
        marks.hCash[i] = acc.holderCash.size; marks.hPay[i] = acc.holderPayout.size;
        marks.hSettle[i] = acc.holderSettlements.size;
      }
      installAccums(held);
      return { acc, marks };
    };
    const aRes: (ReturnType<typeof runBackCoreA> | undefined)[] = new Array(n);
    const bRes: (ReturnType<typeof runBackCoreB> | undefined)[] = new Array(n);
    const streamAfterA: (ReturnType<typeof getRngState> | undefined)[] = new Array(n);
    const redPaid = new Float64Array(n);
    const sweepDelta = new Float64Array(n);
    const taxCapture = {
      accrueLocal: new Float64Array(n).fill(NaN),
    };
    backDeps.taxCapture = taxCapture;
    // §7.325 W2 — the A POOL: workers run core-A for every active non-profile firm while the
    // main thread runs the ~75 profile firms' A (their deep object reads and RNG draws are
    // main-side by §7.318 D). Worker emissions come back as §7.325-shaped segments and fold
    // into the same firm-major replay; a dead pool falls back to running those firms serially
    // in a second captured phase — the world is identical on every path.
    const __w0 = S08_PROF ? performance.now() : 0;
    const dispatch = backWorkerCount() >= 2 ? dispatchBackA({
      lanes: backLanes, F, updatedRegions,
      channelShareByRegion: ctx.channelShareByRegion,
      nextWeek, currentWeekMod13,
    }) : null;
    const __w1 = S08_PROF ? performance.now() : 0;
    const ambient = getRngState();
    ctx.deferPendingNet = true;
    const aCap = runPhase((i) => {
      const comp = companyRows[i];
      if (!isActiveCompany(comp)) return;
      if (dispatch && F.isProfile[i] !== 1) return; // the pool's firm
      setRngState(F.rngAfter[i]);
      aRes[i] = runBackCoreA(comp, i, backDeps);
      streamAfterA[i] = getRngState();
    });
    let aCapRetry: ReturnType<typeof runPhase> | null = null;
    let shardByRow: (BackAShardOut | null)[] | null = null;
    const __w2 = S08_PROF ? performance.now() : 0;
    let __w3 = __w2;
    if (dispatch) {
      const shards = collectBackA(dispatch);
      __w3 = S08_PROF ? performance.now() : 0;
      if (!shards) {
        // Pool died mid-week: run its firms serially under the same capture. Correct either way.
        aCapRetry = runPhase((i) => {
          const comp = companyRows[i];
          if (!isActiveCompany(comp) || F.isProfile[i] === 1 || aRes[i]) return;
          setRngState(F.rngAfter[i]);
          aRes[i] = runBackCoreA(comp, i, backDeps);
          streamAfterA[i] = getRngState();
        });
      } else {
        shardByRow = new Array(n).fill(null);
        for (const sh of shards) {
          for (let i = sh.lo; i < sh.hi; i++) {
            shardByRow[i] = sh;
            if (!Number.isNaN(sh.taxAccrue[i])) taxCapture.accrueLocal[i] = sh.taxAccrue[i];
            const cross = sh.crossings[i];
            if (cross) {
              // The full A crossing, rebuilt: fresh poster continuing the worker's exact cash
              // value, closures on the REAL ctx, pass-throughs from main's own F.
              aRes[i] = rebuildBackCoreA(cross, i, backDeps);
              streamAfterA[i] = F.rngAfter[i]; // non-profile A is draw-free (§7.317)
              applyCapCompWrites(companyRows[i], aRes[i]!.cap, backLanes, i);
            }
          }
        }
      }
    }
    if (S08_PROF && dispatch) {
      console.log(`[s08w] dispatch ${(__w1 - __w0).toFixed(1)} profileA ${(__w2 - __w1).toFixed(1)}`
        + ` collect ${(__w3 - __w2).toFixed(1)} rebuild ${(performance.now() - __w3).toFixed(1)}`);
    }
    const redCap = runPhase((i) => {
      if (!aRes[i]) return;
      redPaid[i] = runMmfRedemption(companyRows[i], i, backDeps, aRes[i]!);
    });
    const bCap = runPhase((i) => {
      if (!aRes[i]) return;
      setRngState(streamAfterA[i]!);
      bRes[i] = runBackCoreB(companyRows[i], i, backDeps, aRes[i]!);
    });
    backDeps.onSweepDelta = (row, deltaLocal) => { sweepDelta[row] = deltaLocal; };
    const postCap = runPhase((i) => {
      const comp = companyRows[i];
      if (!aRes[i]) { updatedCompanies[i] = companyWeekKernel(comp, i); syncCompanyRow(companyStore, updatedCompanies[i], i); return; }
      updatedCompanies[i] = companyWeekKernel(comp, i, { ...aRes[i]!, ...bRes[i]! });
      syncCompanyRow(companyStore, updatedCompanies[i], i); // II.4 dual-write: lanes stay current
    });
    backDeps.onSweepDelta = undefined;
    backDeps.taxCapture = undefined;
    setRngState(ambient);
    ctx.deferPendingNet = false;
    // The firm-major replay: each firm's captured entries land in [A, red, B, post] order,
    // reproducing the interleaved loop's journal and accumulator content exactly.
    const phases = aCapRetry
      ? [aCap, aCapRetry, redCap, bCap, postCap]
      : [aCap, redCap, bCap, postCap];
    /** Index in `phases` after which a pool shard's A segment replays (before red). */
    const shardAfter = aCapRetry ? 1 : 0;
    const nPhases = phases.length;
    const slices = phases.map((ph) => ({
      hAcc: [...ph.acc.holderAccruals], hCash: [...ph.acc.holderCash],
      hPay: [...ph.acc.holderPayout], hSettle: [...ph.acc.holderSettlements],
    }));
    /** One pool shard's A segment for firm `i` — canonical ids by construction (back-pool's
     *  pre-intern + seeding), so legs replay exactly like a main-side capture's. */
    const replayShardA = (sh: BackAShardOut, i: number): void => {
      const st = (m: Int32Array) => (i > sh.lo ? m[i - 1] : 0);
      for (let k = st(sh.journalMark); k < sh.journalMark[i]; k++) {
        journalPush(ctx.paymentJournal, sh.journalPayer[k], sh.journalPayee[k], sh.journalAmount[k], currencyOfId(sh.journalCurrency[k]), sh.journalReason[k], sh.journalSettle[k]);
        applyPendingLeg(ctx, sh.journalPayer[k], sh.journalPayee[k], sh.journalAmount[k], currencyOfId(sh.journalCurrency[k]), sh.journalSettle[k]);
      }
      for (let k = st(sh.holderAccMark); k < sh.holderAccMark[i]; k++) {
        const [key, v] = sh.holderAcc[k];
        ctx.pendingHolderAccrualLocal.set(key, (ctx.pendingHolderAccrualLocal.get(key) ?? 0) + v);
      }
      for (let k = st(sh.holderCashMark); k < sh.holderCashMark[i]; k++) {
        const [key, v] = sh.holderCash[k];
        ctx.pendingHolderCashLocal.set(key, (ctx.pendingHolderCashLocal.get(key) ?? 0) + v);
      }
      for (let k = st(sh.holderPayMark); k < sh.holderPayMark[i]; k++) ctx.pendingHolderAccrualPayout.add(sh.holderPay[k]);
    };
    for (let i = 0; i < n; i++) {
      for (let p = 0; p < nPhases; p++) {
        if (p === shardAfter + 1 && shardByRow && shardByRow[i]) replayShardA(shardByRow[i]!, i);
        const { acc, marks } = phases[p];
        const sl = slices[p];
        const s = (m: Int32Array) => (i > 0 ? m[i - 1] : 0);
        for (let k = s(marks.def); k < marks.def[i]; k++) ctx.defaultedTickers.push(acc.defaulted[k]);
        for (let k = s(marks.ratings); k < marks.ratings[i]; k++) ctx.ratingChanges.push(acc.ratings[k]);
        for (let k = s(marks.earnings); k < marks.earnings[i]; k++) ctx.earningsReportedThisTurn.push(acc.earnings[k]);
        for (let k = s(marks.offerings); k < marks.offerings[i]; k++) ctx.primaryOfferingsWorking.push(acc.offerings[k]);
        for (let k = s(marks.news); k < marks.news[i]; k++) refinanceNews.push(acc.news[k]);
        const J = acc.journal;
        for (let k = s(marks.journalN); k < marks.journalN[i]; k++) {
          journalAppendRow(ctx.paymentJournal, J.payerId[k], J.payeeId[k], J.amount[k], currencyOfId(J.currencyId[k]), J.reasonId[k], J.settleWeek[k]);
          applyPendingLeg(ctx, J.payerId[k], J.payeeId[k], J.amount[k], currencyOfId(J.currencyId[k]), J.settleWeek[k]);
        }
        for (let k = s(marks.hAcc); k < marks.hAcc[i]; k++) {
          const [key, v] = sl.hAcc[k];
          ctx.pendingHolderAccrualLocal.set(key, (ctx.pendingHolderAccrualLocal.get(key) ?? 0) + v);
        }
        for (let k = s(marks.hCash); k < marks.hCash[i]; k++) {
          const [key, v] = sl.hCash[k];
          ctx.pendingHolderCashLocal.set(key, (ctx.pendingHolderCashLocal.get(key) ?? 0) + v);
        }
        for (let k = s(marks.hPay); k < marks.hPay[i]; k++) ctx.pendingHolderAccrualPayout.add(sl.hPay[k]);
        for (let k = s(marks.hSettle); k < marks.hSettle[i]; k++) {
          const [key, v] = sl.hSettle[k];
          ctx.pendingHolderSettlements.set(key, (ctx.pendingHolderSettlements.get(key) ?? 1) * v);
        }
      }
      const regKey = backLanes.region[i];
      if (!Number.isNaN(taxCapture.accrueLocal[i])) {
        ctx.taxAccruedByRegion[regKey] = (ctx.taxAccruedByRegion[regKey] ?? 0) + taxCapture.accrueLocal[i];
      }
    }
    // §7.321 — the region books' netInflow REBUILT on the exact per-firm deltas in the
    // interleaved loop's order [red_i, sweep_i] per firm, so the settle-time float sum keeps
    // the serial tree bit-exactly (the 13wk ULP cascade this replaces was the record's).
    mmfSweepBooks.forEach((b) => { b.netInflowLocal = 0; });
    for (let i = 0; i < n; i++) {
      const b = mmfSweepBooks.get(backLanes.region[i]);
      if (!b) continue;
      if (redPaid[i] > 0) b.netInflowLocal -= redPaid[i];
      if (sweepDelta[i] !== 0) b.netInflowLocal += sweepDelta[i];
    }
  } else {
  runShardedVoid(companyRows.length, (range) => {
    const held = openShard();
    for (let i = range.lo; i < range.hi; i++) {
      const comp = companyRows[i];
      // ENGINE V2 — resume this firm's entity-scoped stream where the front pass left it
      // (after the front half's one draw), so the kernel's remaining draws are unchanged.
      const savedStream = getRngState();
      setRngState(F.rngAfter[i]);
      updatedCompanies[i] = companyWeekKernel(comp, i);
      syncCompanyRow(companyStore, updatedCompanies[i], i); // II.4 dual-write: lanes stay current
      setRngState(savedStream);
    }
    closeShard(held);
  });
  }
  ctx.updatedCompanies = updatedCompanies;
  const __p2 = S08_PROF ? performance.now() : 0;

  // Every corporate action this stage recorded reaches the real books here, in one pass.
  // WS7: the funds receive/pay the week's net corporate sweep money.
  settleCorporateSweepBooks(mmfSweepBooks, ctx);
  const __p2a = S08_PROF ? performance.now() : 0;

  applyPendingCorporateActionSettlements(ctx);
  const __p2b = S08_PROF ? performance.now() : 0;
  // CAL: the week's interest accruals onto the register, and the coupon dates that clear them.
  applyHolderInterestAccruals(ctx);
  const __p3 = S08_PROF ? performance.now() : 0;
  if (S08_PROF) {
    console.log(`[s08] front+indexes ${(__p1 - __p0).toFixed(0)} kernel ${(__p2 - __p1).toFixed(0)}`
      + ` sweeps ${(__p2a - __p2).toFixed(0)} corp-actions ${(__p2b - __p2a).toFixed(0)} accruals ${(__p3 - __p2b).toFixed(0)}`);
    if (process.env?.S08K_PROF === '1') {
      console.log(`[s08k] capital ${s08k.capital.toFixed(0)} cash ${s08k.cash.toFixed(0)} debt ${s08k.debt.toFixed(0)} tail ${s08k.tail.toFixed(0)}`);
      s08k.capital = 0; s08k.cash = 0; s08k.debt = 0; s08k.tail = 0;
    }
  }

  // §4.0 Tier 1 item 9 — A MARKET SHARE IS A RATIO, AND RATIOS SUM TO ONE. Each line's share
  // walked its own competitiveness rate independently, so the category sum drifted: a death
  // took its share to the grave (JPN semiconductors summed 45%) and a uniformly-competitive
  // category compounded above one (EUR passenger_vehicles 108%). Renormalized per
  // (region, sub-unit) after the loop: relative competitiveness decides RELATIVE share —
  // a gain is now genuinely at someone's expense — and a dead supplier's share redistributes
  // to the survivors, which is the §7.152 stand-in until DYN's real entry replaces it.
  // Runs on the merged roster in row order, so the sharded kernel stays order-invariant.
  {
    const shareSumByKey = new Map<string, number>();
    ctx.updatedCompanies.forEach((c) => {
      if (!isActiveCompany(c)) return;
      (c.productLines || []).forEach((pl) => {
        const key = `${c.region}:${pl.subUnitId}`;
        shareSumByKey.set(key, (shareSumByKey.get(key) ?? 0) + (pl.categoryMarketShare ?? 0));
      });
    });
    // SCALE §7.303 — in place, like every other write in this stage: the { ...c } spread here
    // cloned ~73 fields per touched firm per week AND left the roster holding different objects
    // than prevActiveFirms (the twin-object trap §7.302 fell into). The lines array itself is
    // fresh (replacement semantics for the persisted array, per the batteries' clone rule).
    ctx.updatedCompanies.forEach((c) => {
      if (!isActiveCompany(c) || !(c.productLines || []).length) return;
      let touched = false;
      const lines = (c.productLines || []).map((pl) => {
        const sum = shareSumByKey.get(`${c.region}:${pl.subUnitId}`) ?? 0;
        if (!(sum > 1e-9) || Math.abs(sum - 1) < 1e-9) return pl;
        touched = true;
        return { ...pl, categoryMarketShare: roundN(pl.categoryMarketShare / sum, 1e6) };
      });
      if (touched) c.productLines = lines;
    });
  }

  ctx.newsItems.push(...refinanceNews);

  if (process.env.LEARN_TRACE === '1' && learnTraceRows.length > 0) {
    const ms = learnTraceRows.map((r) => r.m).sort((a, b) => a - b);
    const gs = learnTraceRows.map((r) => r.g).filter((g) => g >= 0).sort((a, b) => a - b);
    const q = (xs: number[], p: number) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0;
    console.log(`  [learn] w${nextWeek} n=${learnTraceRows.length} multiplier p50 ${q(ms, 0.5).toFixed(4)}`
      + ` p90 ${q(ms, 0.9).toFixed(4)} max ${q(ms, 1).toFixed(4)}`
      + ` | growth/yr p50 ${(q(gs, 0.5) * 100).toFixed(2)}% p90 ${(q(gs, 0.9) * 100).toFixed(2)}% max ${(q(gs, 1) * 100).toFixed(2)}%`);
    learnTraceRows.length = 0;
  }
  if (process.env.BYPASS_TRACE === '1' && bypassTraceByLabel.size > 0) {
    const rows = Array.from(bypassTraceByLabel.entries())
      .filter(([, usd]) => Math.abs(usd) > 10e6)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([key, usd]) => `${key} ${(usd / 1e6).toFixed(1)}M`);
    console.log(`  [bypass] w${nextWeek} settle:false legs :: ${rows.slice(0, 14).join(' | ')}`);
  }
  if (process.env.BOUNDARY_TRACE === '1' && boundaryTraceByFirm.size > 0) {
    const rows = Array.from(boundaryTraceByFirm.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, usd]) => `${key} ${(usd / 1e6).toFixed(1)}M`);
    const totalLocal = Array.from(boundaryTraceByFirm.values()).reduce((a, v) => a + v, 0);
    console.log(`  [boundary] w${nextWeek} non-auction receipts ${(totalLocal / 1e9).toFixed(2)}B :: ${rows.slice(0, 12).join(' | ')}`);
  }
}
