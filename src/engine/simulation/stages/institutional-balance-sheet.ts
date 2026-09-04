import { entityCashOf } from '../../ledger/accounts';
/**
 * The institutional balance sheet: the link between the money in the system and the price of
 * assets (plan ).
 *
 * Before this module existed, an institution's bid was bounded by a policy ceiling and by
 * nothing else. Measured, entity cash went from +5.7% of assets to −10% by week 20 and stayed
 * there — the sector was running ~10% leverage that nobody decided on, buying with money it did
 * not have. And `totalAssetsUSD`, the size weight behind every entity's structural share in all
 * three clearing stages, was written once at initialization and never again.
 *
 * Three real mechanisms fix this, together:
 *
 *  1. **Income.** Holders receive the coupon the issuer pays. Companies have always EXPENSED
 *     their debt interest (stage 08); the receiving side simply did not exist — dollars leaving
 *     one real book and arriving nowhere, the exact "1$ is 1$" hole rule 4 exists to catch.
 *     Corporate bond coupons and loan interest are credited weekly here off the issuer's own
 *     real tranche terms. Sovereign coupons are deliberately NOT credited: the government does
 *     not pay them yet (its interest expense does not exist — /BP5), and crediting the
 *     holder without debiting the payer would create money.
 *
 *  2. **Marking.** `totalAssetsUSD` becomes what it is: cash plus the book, recomputed weekly
 *     after the clearing stages. A derived sum, not a stored parameter.
 *
 *  3. **Budgets.** What an entity can ADD to its positions in a week is its real available
 *     cash — plus the leverage its type genuinely runs, which for everyone except a hedge fund
 *     is none. The budget is apportioned across asset classes by the entity's own allocation
 *     targets, and within a class across names by structural size, in each clearing adapter.
 *     Selling releases real cash (the engine's cash legs already do this), which is then
 *     genuinely available to buy something else — the cross-asset substitution the whole
 *     relative-value framework depends on.
 */

import { institutionProfile } from '../../../domain/institution-profiles';

import { bookHeadOf } from '../../../engine2/holdings';
import { RegionId, InstitutionalEntity, Company, GameState } from '../../../types';
import { institutionTotalAssetsLocal as totalAssetsRead } from '../../../domain/institutions';
import { V2World, ensureV2 } from '../../../engine2/world';
import { isActiveCompany } from '../../../domain/company';
import { mandatePctOf } from '../../../domain/institutions';
import { publicComparableEvMultiple } from './pe-lifecycle';
import { WeeklyStepContext } from './context';
import { pendingSettlementUSD } from './settlement';
import { ladderTotalUSD } from '../../../engine2/tranches';
import { materializeGovLadder } from '../../../engine2/tranches';

/**
 * Balance-sheet leverage each type genuinely runs, as a fraction of total assets. A hedge fund
 * finances positions (prime brokerage); real money does not. This is a structural fact of each
 * balance sheet, not a tuning knob: it lets a hedge fund's cash run temporarily negative up to
 * its financing capacity, and nobody else's.
 */
/**
 * HF1 — LEVERAGE_ALLOWANCE is gone for the one type that used it. A hedge fund's borrowing is now
 * a real prime-brokerage line from a named bank (domain/prime-brokerage.ts): sized by the fund's
 * own capital against the haircut on its own book, bounded by the broker's balance sheet, priced,
 * and withdrawable. Every other entity type borrowed nothing, and still does — an insurer, a
 * pension fund, an index fund and a $1-NAV money fund are all unlevered by construction, and a PE
 * fund's leverage lives on its portfolio companies' own ladders.
 */

/**
 * An entity's real purchasing capacity right now, across all asset classes.
 *
 * WS6's overnight repo lending (`repoLentLocal`) is deliberately NOT counted: the cash is
 * genuinely out the door for the week — a bank is funding its book with it — and counting a
 * receivable as spendable would let the entity buy securities with money it had already lent.
 * It is part of the BOOK (markInstitutionalBooks), never of the budget.
 */
export function availablePurchaseCapacityUSD(entity: InstitutionalEntity, cashLocal: number, totalAssetsUSD: number, unsettledUSD = 0): number {
  // HF1: what its prime broker will actually lend it this week, less what it has already drawn.
  // Negative when the line has been CUT below the draw — which makes the fund a net seller in
  // this week's auctions, at whatever they clear, which is what a margin call is.
  // Whether a kind levers, and through what, is a registry fact.
  const allowanceUSD = institutionProfile(entity.entityType).leverage === 'PRIME_BROKERAGE'
    ? (entity.primeBrokerageAvailableUSD ?? 0)
    : 0;
  // A fund does not spend to the last dollar: it runs a CASH SLEEVE, and what it invests is the
  // excess over it. The target is the entity's own `cashPct` — already its stated policy, so no
  // number is invented here — and keeping it is what makes a balance a MANAGED position rather
  // than the residue of whatever the week's auctions did to it. Without this, entity cash was a
  // clearing residual swinging 72B → 23B → 32B → 18B week to week, and once institutional
  // balances became real bank liabilities (SETL5) that swing went straight into bank reserves
  //. Below the sleeve an entity is a net seller, which is what a fund short of cash is.
  const sleeveTargetUSD = Math.max(0, entity.assetAllocationTarget?.cashPct ?? 0) * Math.max(0, totalAssetsUSD);
  // Plus what this week's already-agreed trades will settle — negative once the fund has
  // committed, so the five books cannot each spend the same balance. The clearing legs are
  // payment instructions now (stages/book-settlement.ts) and the cash moves at the settlement
  // pass, so the unsettled position is where a commitment lives until then.
  const investableCashUSD = Math.max(0, cashLocal + unsettledUSD - sleeveTargetUSD);
  return investableCashUSD + allowanceUSD;
}

/**
 * The slice of that capacity an entity brings to ONE asset class's auction this week, split by
 * its own allocation targets over the invested classes. The clearing stages run in sequence and
 * each books its trades as unsettled commitments, so the next stage reads capacity net of what
 * the previous one actually agreed — the ordering is the settlement reality, not an artifact.
 */
export function stagePurchaseBudgetUSD(
  ctx: WeeklyStepContext,
  entity: InstitutionalEntity,
  /** D: the entity's live total assets (`institutionTotalAssetsLocal`), the sleeve's base. */
  totalAssetsUSD: number,
  assetClass: 'CORP_BOND' | 'GOV_BOND' | 'LEVERAGED_LOAN',
  unsettledUSD = 0
): number {
  const t = entity.assetAllocationTarget;
  const investedPcts = t.corpBondPct + t.govBondPct + t.loanPct;
  if (investedPcts <= 0) return 0;
  const classPct = mandatePctOf(t, assetClass);
  return availablePurchaseCapacityUSD(entity, entityCashOf(ctx.v2, entity), totalAssetsUSD, unsettledUSD) * (classPct / investedPcts);
}

/**
 * Report each entity's real portfolio income for the week, at the issuer's own real terms.
 *
 * INCOME, not cash. Every coupon in this model is now a payment from a named issuer that lands on
 * a date (SETL4 for corporates, CAL for sovereigns), and this is the accrual beside it: what the
 * entity EARNED, whether or not a coupon fell due. Runs before the clearing stages, so the week's
 * earnings can size the week's bids.
 */
export function accrueInstitutionalIncome(ctx: WeeklyStepContext): void {
  // The sovereign ladder is a pure function of one region's stack and was being walked
  // once per gov-bond ROW — the same arithmetic once, memoized for the week.
  const sovCouponByRegion = new Map<string, Map<string, number>>();

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    let weeklyIncomeUSD = 0;
    // CAL — SOVEREIGN COUPONS ARE ON THE CALENDAR NOW (`sovereign-calendar.ts`), so they are no
    // longer credited here. Interest accrues to whoever holds the paper that week and the
    // bond's coupon date turns the balance into cash, with the TREASURY on the same dates —
    // which is the pass this comment used to say had to happen all at once. It did.
    //
    // What is still reported here is the INCOME, because an income statement is smooth: the
    // accrual is the entity's earnings for the week whether or not a coupon fell due (rule 8 — an
    // expense and a payment are different numbers with different periods).
    entity.itemizedHoldings.forEach((h) => {
      if (h.instrumentType !== 'GOV_BOND') return;
      const issuerReg = ctx.updatedRegions[h.issuerRegion];
      if (!issuerReg) return;
      // §3.13-SOV row 3: the coupon is THIS BOND's, off the ladder. It used to be the
      // face-weighted average of whatever group the id parsed into, so a holder of a 2% rung
      // was paid its neighbours' coupon.
      let cb = sovCouponByRegion.get(h.issuerRegion);
      if (!cb) {
        cb = new Map(materializeGovLadder(ctx.v2, h.issuerRegion).map((t) => [t.id, t.couponRate] as const));
        sovCouponByRegion.set(h.issuerRegion, cb);
      }
      const couponRate = cb.get(h.instrumentId);
      if (couponRate === undefined) return;
      weeklyIncomeUSD += ((h.quantityOrNotionalLocal ?? 0) * couponRate) / 52;
    });
    // A week with no income is written as ZERO, not skipped. Returned unchanged, the field kept
    // last week's number for ever and every reader — the pension entitlement above all — credited
    // income that was never earned again.
    if (weeklyIncomeUSD <= 0 && !(entity.lastWeeklyInvestmentIncomeUSD ?? 0)) return entity;
    // Stage 08 reports this on the listed shell rather than inventing a portfolio yield of its own.
    return { ...entity, lastWeeklyInvestmentIncomeUSD: Math.max(0, weeklyIncomeUSD) };
  });
}

/**
 * D — THE READ. An entity's total assets, live: cash, receivables, overnight cash lent,
 * the stock-loan book and the register's rows (a sponsor's portfolio at the public comparable).
 * While the clearing store is live the rows are the week's opening register and the books' cash
 * legs are in the receivable, so the receivable is left out until the write-back — the opening
 * book, not a half-settled one. Replaces `markInstitutionalBooks`, the week-end mark that every
 * sizing pass read a week stale.
 */
export function institutionBookUSD(v2: V2World, entityId: string): number {
  let holdingsUSD = 0;
  const H = v2.holdings;
  for (let r = bookHeadOf(v2, entityId); r >= 0; r = H.next[r]) holdingsUSD += H.qtyLocal[r];
  return holdingsUSD;
}

const evMultipleMemo = new WeakMap<object, Map<RegionId, number>>();
function comparableMultiple(memoKey: object, region: RegionId, listed: Company[]): number {
  let m = evMultipleMemo.get(memoKey);
  if (!m) { m = new Map(); evMultipleMemo.set(memoKey, m); }
  let v = m.get(region);
  if (v === undefined) { v = publicComparableEvMultiple(region, listed); m.set(region, v); }
  return v;
}

/** HC4: a sponsor's assets are its portfolio companies at the public comparable, at its stake. */
function sponsorPortfolioUSD(entity: InstitutionalEntity, evMultiple: number, privateById: Map<string, Company>, v2: V2World): number {
  if (!entity.peFund) return 0;
  return entity.peFund.portfolioCompanyIds.reduce((a, id) => {
    const c = privateById.get(id);
    if (!c || c.isDefaulted) return a;
    return a + Math.max(0, evMultiple * c.ebitda - ladderTotalUSD(v2, c.id)) * (c.ownership?.peSponsorPct ?? 0);
  }, 0);
}

export function institutionTotalAssetsLocal(ctx: WeeklyStepContext, entity: InstitutionalEntity): number {
  const pendingUSD = ctx.holdingsStore ? 0 : pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id });
  const portfolioUSD = entity.entityType === 'PRIVATE_EQUITY' && entity.peFund
    ? sponsorPortfolioUSD(entity, comparableMultiple(ctx, entity.region, ctx.prevActiveFirms), privateFirmIndex(ctx), ctx.v2)
    : 0;
  return totalAssetsRead(entity, entityCashOf(ctx.v2, entity), institutionBookUSD(ctx.v2, entity.id), pendingUSD, portfolioUSD);
}
const privateIndexMemo = new WeakMap<object, Map<string, Company>>();
function privateFirmIndex(ctx: WeeklyStepContext): Map<string, Company> {
  let m = privateIndexMemo.get(ctx);
  if (!m) { m = new Map(ctx.prevActivePrivateFirms.map((c) => [c.id, c])); privateIndexMemo.set(ctx, m); }
  return m;
}

/** The same read off a closed state (the UI, the harness): nothing is pending between weeks. */
export function institutionTotalAssetsFromState(state: GameState, entity: InstitutionalEntity): number {
  const v2 = ensureV2(state);
  const portfolioUSD = entity.entityType === 'PRIVATE_EQUITY' && entity.peFund
    ? sponsorPortfolioUSD(entity, comparableMultiple(state, entity.region, state.companies.filter((c) => isActiveCompany(c))),
        new Map(state.companies.filter((c) => !c.isBankEntity).map((c) => [c.id, c])), v2)
    : 0;
  return totalAssetsRead(entity, entityCashOf(v2, entity), institutionBookUSD(v2, entity.id), 0, portfolioUSD);
}
