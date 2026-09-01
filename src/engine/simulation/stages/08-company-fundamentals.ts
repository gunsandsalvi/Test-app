/**
 * Stage 8: Company Fundamentals
 *
 * Evolves every company's full weekly financial state: revenue (bank/insurer/asset-manager
 * specialty profiles, or the generic demand/margin/production model), maintenance and growth
 * capex, credit rating and OAS spread, debt refinancing/prepayment, quarterly earnings,
 * equity price (holder-class rebalancing flow), buybacks, and the resulting balance sheet.
 * The single largest and most interdependent stage — see ARCHITECTURE.md.
 */

import {
  GameState, Company, NewsItem, RegionId,
} from '../../../types';
import { isActiveCompany, getOutputInventoryUSD } from '../../../domain/company';
import { applyPendingCorporateActionSettlements, applyHolderInterestAccruals } from './shared-helpers';
import { openCorporateSweepBooks, settleCorporateSweepBooks } from './money-market-fund';
import { PrimaryOffering, chooseLeadBank } from '../../../domain/primary-market';
import { leadBankAllocator } from './dealer-desks';
import { WeeklyStepContext } from './context';
import { PaymentJournal, newPaymentJournal, journalPush } from './settlement';
import { runShardedVoid } from '../../columns/kernel';
import { annualCarryingCostRateOf } from '../../../domain/industry-registry';
import { getRngState, setRngState } from '../../rng';
import { runStage08FrontPass } from '../../../engine2/stage08-front';
import { ensureV2 } from '../../../engine2/world';
import { makeStage08BackKernel, learnTraceRows, bypassTraceByLabel, boundaryTraceByFirm } from '../../../engine2/stage08-back';

/** SCALE / DECLARED RELABEL (§7.304, the drift acceptance): decimal rounding by arithmetic
 *  instead of a string round-trip; ULP-edge differences from toFixed accepted. */
const roundN = (v: number, pow: number) => Math.round(v * pow) / pow;


/** SCALE: the supply list's own derived indexes, memoised on the array that produced them. */
interface GroupedSupply {
  byCustomer: Map<string, { supplierCompanyId: string; category: string; weeklyVolumeUSD: number; relationshipStrength: number }[]>;
  categoriesBySupplier: Map<string, Set<string>>;
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
  const categoriesBySupplier = new Map<string, Set<string>>();
  lists.forEach((list) => {
    (list as { customerCompanyId: string; supplierCompanyId: string; category: string }[]).forEach((rel) => {
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
  const { nextWeek, currentWeekMod13, companyUpdates, prevActiveFirms, updatedRegions, updatedCommodities, systemicStressFactorGlobal } = ctx;
  let refinanceNews: NewsItem[] = [];
  const retainCashLedger = process.env.CASH_LEDGER === '1';
  bypassTraceByLabel.clear();
  boundaryTraceByFirm.clear();

  // Per-week indices, built once (see the plan's optimization rule: memoize per-week derived
  // values at the top of a stage, never inside a per-company loop). Each of these was a full
  // scan of a multi-thousand-element array executed once per company.
  const entityById = new Map(state.institutionalEntities.map(e => [e.id, e]));
  const firmById = new Map(prevActiveFirms.map(c => [c.id, c]));
  // CRD-R1 — the median issuer's revenue, so SCALE in the rating is relative to the firms a
  // credit is actually rated against rather than a stated size (§7.184).
  const regionMedianRevenueUSD = (() => {
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
      invUSDByCategory.set(category, getOutputInventoryUSD(supplier, category));
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
  const carryingCostByTicker = new Map<string, number>();
  prevActiveFirms.forEach(c => {
    let total = 0;
    Object.entries(c.outputInventoryBySubUnit || {}).forEach(([su, inv]) => {
      total += (inv as { valueUSD: number }).valueUSD * (annualCarryingCostRateOf(su) / 52);
    });
    if (total > 0) carryingCostByTicker.set(c.ticker, total);
  });
  carryingCostByTicker.forEach((costUSD, ticker) => {
    const owner = prevActiveFirms.find(c => c.ticker === ticker);
    if (!owner) return;
    ctx.channelShareByRegion[owner.region]?.forEach((share, holderTicker) => {
      if (holderTicker === ticker) return; // a distributor warehouses its own stock
      const amountUSD = costUSD * share;
      if (amountUSD > 0) {
        ctx.channelMarginRevenue[holderTicker] = (ctx.channelMarginRevenue[holderTicker] ?? 0) + amountUSD;
      }
    });
  });

  // WS7: per-region redemption capacity for the treasury sweeps below — the funds' real cash.
  const mmfSweepBooks = openCorporateSweepBooks(ctx);

  // WS8: this week's priced offerings, indexed by issuer, and the pending queue by issuer so a
  // company never runs two books at once. Lead banks are chosen per region from the named banks.
  const primarySettlementByIssuerId = new Map<string, { offering: PrimaryOffering; clearedStat: number; withdrawn: boolean; marketTakeUSD: number; issuedUSD: number; proceedsUSD: number }>();
  ctx.primarySettlements.forEach((s) => primarySettlementByIssuerId.set(s.offering.issuerId, s));
  const pendingOfferingIssuerIds = new Set(ctx.primaryOfferingsWorking.map((o) => o.issuerId));
  // G3c: mandates go to the bank that carries the issuer's credit, and — with no incumbent —
  // to the desk that can still underwrite. Both are measured here, per region, once a week.
  const leadAllocatorByRegion = new Map<string, ReturnType<typeof leadBankAllocator>>();
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    leadAllocatorByRegion.set(r, leadBankAllocator(
      ctx, ctx.prevActiveFirms.filter((c) => c.isBankEntity && c.region === r && c.bankBalanceSheet), 'corporate bond'
    ));
  });
  /** Who leads this issuer's deal — re-asked every time, so the mandate can be lost. */
  const leadBankFor = (comp: Company, sizeUSD: number): string => {
    const alloc = leadAllocatorByRegion.get(comp.region);
    if (!alloc) return comp.homeBankTicker ?? '';
    const ticker = chooseLeadBank(comp.id, alloc.candidatesFor(comp.id));
    if (ticker) alloc.award(ticker, sizeUSD);
    return ticker || (comp.homeBankTicker ?? '');
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
  const F = runStage08FrontPass(state.companies, {
    v2, nextWeek, companyUpdates, updatedRegions,
    supplyRelsByCustomer, supplierShockStats, suppliedSubUnitsByRegion,
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
  const companyWeekKernel = makeStage08BackKernel({
    state, ctx, v2, F, nextWeek, currentWeekMod13, updatedRegions, companyUpdates, entityById,
    regionMedianRevenueUSD, systemicStressFactorGlobal, retainCashLedger, mmfSweepBooks,
    primarySettlementByIssuerId, pendingOfferingIssuerIds, leadBankFor, enqueueOffering,
    pushNews: (n: NewsItem) => refinanceNews.push(n),
  });

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
    creditEvents: WeeklyStepContext['creditEventsThisWeek'];
    defaulted: string[];
    ratings: WeeklyStepContext['ratingChanges'];
    earnings: unknown[];
    offerings: PrimaryOffering[];
    news: NewsItem[];
    taxAccrued: Record<string, number>;
    taxCollected: Record<string, number>;
    journal: PaymentJournal;
  }

  /** Point the shared accumulators at this shard's own, and hand back what they were. */
  const openShard = (): CompanyShardAccumulators => {
    const held: CompanyShardAccumulators = {
      creditEvents: ctx.creditEventsThisWeek,
      defaulted: ctx.defaultedTickers,
      ratings: ctx.ratingChanges,
      earnings: ctx.earningsReportedThisTurn,
      offerings: ctx.primaryOfferingsWorking,
      news: refinanceNews,
      taxAccrued: ctx.taxAccruedByRegion,
      taxCollected: ctx.taxCollectedByRegion,
      journal: ctx.paymentJournal,
    };
    ctx.creditEventsThisWeek = [];
    ctx.defaultedTickers = [];
    ctx.ratingChanges = [];
    ctx.earningsReportedThisTurn = [];
    ctx.primaryOfferingsWorking = [];
    refinanceNews = [];
    ctx.taxAccruedByRegion = {};
    ctx.taxCollectedByRegion = {};
    ctx.paymentJournal = newPaymentJournal();
    return held;
  };

  /** Fold this shard's accumulators onto the ones it displaced, in shard order. */
  const closeShard = (held: CompanyShardAccumulators): void => {
    const mine = {
      creditEvents: ctx.creditEventsThisWeek,
      defaulted: ctx.defaultedTickers,
      ratings: ctx.ratingChanges,
      earnings: ctx.earningsReportedThisTurn,
      offerings: ctx.primaryOfferingsWorking,
      news: refinanceNews,
      taxAccrued: ctx.taxAccruedByRegion,
      taxCollected: ctx.taxCollectedByRegion,
      journal: ctx.paymentJournal,
    };
    ctx.creditEventsThisWeek = held.creditEvents;
    ctx.defaultedTickers = held.defaulted;
    ctx.ratingChanges = held.ratings;
    ctx.earningsReportedThisTurn = held.earnings;
    ctx.primaryOfferingsWorking = held.offerings;
    refinanceNews = held.news;
    ctx.taxAccruedByRegion = held.taxAccrued;
    ctx.taxCollectedByRegion = held.taxCollected;
    ctx.paymentJournal = held.journal;

    for (const e of mine.creditEvents) ctx.creditEventsThisWeek.push(e);
    for (const t of mine.defaulted) ctx.defaultedTickers.push(t);
    for (const r of mine.ratings) ctx.ratingChanges.push(r);
    for (const e of mine.earnings) ctx.earningsReportedThisTurn.push(e);
    for (const o of mine.offerings) ctx.primaryOfferingsWorking.push(o);
    for (const n of mine.news) refinanceNews.push(n);
    for (const r of Object.keys(mine.taxAccrued)) {
      ctx.taxAccruedByRegion[r] = (ctx.taxAccruedByRegion[r] ?? 0) + mine.taxAccrued[r];
    }
    for (const r of Object.keys(mine.taxCollected)) {
      ctx.taxCollectedByRegion[r] = (ctx.taxCollectedByRegion[r] ?? 0) + mine.taxCollected[r];
    }
    const j = ctx.paymentJournal;
    for (let k = 0; k < mine.journal.n; k++) {
      journalPush(j, mine.journal.payerId[k], mine.journal.payeeId[k],
        mine.journal.amountUSD[k], mine.journal.reasonId[k]);
    }
  };

  runShardedVoid(companyRows.length, (range) => {
    const held = openShard();
    for (let i = range.lo; i < range.hi; i++) {
      const comp = companyRows[i];
      // ENGINE V2 — resume this firm's entity-scoped stream where the front pass left it
      // (after the front half's one draw), so the kernel's remaining draws are unchanged.
      const savedStream = getRngState();
      setRngState(F.rngAfter[i]);
      updatedCompanies[i] = companyWeekKernel(comp, i);
      setRngState(savedStream);
    }
    closeShard(held);
  });
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
    const totalUSD = Array.from(boundaryTraceByFirm.values()).reduce((a, v) => a + v, 0);
    console.log(`  [boundary] w${nextWeek} non-auction receipts ${(totalUSD / 1e9).toFixed(2)}B :: ${rows.slice(0, 12).join(' | ')}`);
  }
}
