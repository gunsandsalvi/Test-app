/**
 * The institutional balance sheet: the link between the money in the system and the price of
 * assets (plan §5-S11).
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
 *     one real book and arriving nowhere, the exact "1$ is 1$" hole rule 3 exists to catch.
 *     Corporate bond coupons and loan interest are credited weekly here off the issuer's own
 *     real tranche terms. Sovereign coupons are deliberately NOT credited: the government does
 *     not pay them yet (its interest expense does not exist — §5-S4r/BP5), and crediting the
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

import { govBucketKeyOf } from '../../../domain/sovereign-id';
import { RegionId, InstitutionalEntity } from '../../../types';
import { publicComparableEvMultiple } from './pe-lifecycle';
import { WeeklyStepContext } from './context';
import { pendingSettlementUSD } from './settlement';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey } from './shared-helpers';

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
 * WS6's overnight repo lending (`repoLentUSD`) is deliberately NOT counted: the cash is
 * genuinely out the door for the week — a bank is funding its book with it — and counting a
 * receivable as spendable would let the entity buy securities with money it had already lent.
 * It is part of the BOOK (markInstitutionalBooks), never of the budget.
 */
export function availablePurchaseCapacityUSD(entity: InstitutionalEntity, unsettledUSD = 0): number {
  // HF1: what its prime broker will actually lend it this week, less what it has already drawn.
  // Negative when the line has been CUT below the draw — which makes the fund a net seller in
  // this week's auctions, at whatever they clear, which is what a margin call is.
  const allowanceUSD = entity.entityType === 'HEDGE_FUND'
    ? (entity.primeBrokerageAvailableUSD ?? 0)
    : 0;
  // A fund does not spend to the last dollar: it runs a CASH SLEEVE, and what it invests is the
  // excess over it. The target is the entity's own `cashPct` — already its stated policy, so no
  // number is invented here — and keeping it is what makes a balance a MANAGED position rather
  // than the residue of whatever the week's auctions did to it. Without this, entity cash was a
  // clearing residual swinging 72B → 23B → 32B → 18B week to week, and once institutional
  // balances became real bank liabilities (SETL5) that swing went straight into bank reserves
  // (§7.91). Below the sleeve an entity is a net seller, which is what a fund short of cash is.
  const sleeveTargetUSD = Math.max(0, entity.assetAllocationTarget?.cashPct ?? 0) * Math.max(0, entity.totalAssetsUSD);
  // SETL6: plus what this week's already-agreed trades will settle — negative once the fund has
  // committed, so the five books cannot each spend the same balance. The clearing legs are
  // payment instructions now (stages/book-settlement.ts) and the cash moves at the settlement
  // pass, so the unsettled position is where a commitment lives until then.
  const investableCashUSD = Math.max(0, (entity.cashUSD ?? 0) + unsettledUSD - sleeveTargetUSD);
  return investableCashUSD + allowanceUSD;
}

/**
 * The slice of that capacity an entity brings to ONE asset class's auction this week, split by
 * its own allocation targets over the invested classes. The clearing stages run in sequence and
 * each books its trades as unsettled commitments, so the next stage reads capacity net of what
 * the previous one actually agreed — the ordering is the settlement reality, not an artifact.
 */
export function stagePurchaseBudgetUSD(
  entity: InstitutionalEntity,
  assetClass: 'CORP_BOND' | 'GOV_BOND' | 'LEVERAGED_LOAN',
  unsettledUSD = 0
): number {
  const t = entity.assetAllocationTarget;
  const investedPcts = t.corpBondPct + t.govBondPct + t.loanPct;
  if (investedPcts <= 0) return 0;
  const classPct =
    assetClass === 'CORP_BOND' ? t.corpBondPct : assetClass === 'GOV_BOND' ? t.govBondPct : t.loanPct;
  return availablePurchaseCapacityUSD(entity, unsettledUSD) * (classPct / investedPcts);
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
  // SCALE: the sovereign ladder is a pure function of one region's stack and was being walked
  // once per gov-bond ROW — the same arithmetic once, memoized for the week.
  const sovCouponByRegion = new Map<string, Record<string, number>>();

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    let weeklyIncomeUSD = 0;
    // CAL — SOVEREIGN COUPONS ARE ON THE CALENDAR NOW (`sovereign-calendar.ts`), so they are no
    // longer credited here. Interest accrues to whoever holds the paper that week and the
    // bucket's coupon date turns the balance into cash, with the TREASURY on the same dates —
    // which is the pass this comment used to say had to happen all at once. It did.
    //
    // What is still reported here is the INCOME, because an income statement is smooth: the
    // accrual is the entity's earnings for the week whether or not a coupon fell due (rule 9 — an
    // expense and a payment are different numbers with different periods).
    entity.itemizedHoldings.forEach((h) => {
      if (h.instrumentType !== 'GOV_BOND') return;
      const issuerReg = ctx.updatedRegions[h.issuerRegion];
      if (!issuerReg) return;
      const bucket = govBucketKeyOf(h.instrumentId, h.issuerRegion);
      if (!bucket) return;
      let cb = sovCouponByRegion.get(h.issuerRegion);
      if (!cb) { cb = sovereignCouponByBucket(issuerReg.govDebtTranches, sovBucketKey); sovCouponByRegion.set(h.issuerRegion, cb); }
      weeklyIncomeUSD += ((h.quantityOrNotionalUSD ?? 0) * (cb[bucket] ?? 0)) / 52;
    });
    if (weeklyIncomeUSD <= 0) return entity;
    // Stage 08 reports this on the listed shell rather than inventing a portfolio yield of its
    // own (HH1b — one institution, not two).
    return { ...entity, lastWeeklyInvestmentIncomeUSD: weeklyIncomeUSD };
  });
}

/**
 * Mark every entity's total assets to its real book: cash plus holdings. Runs after the last
 * clearing stage, so next week's structural shares are sized by this week's actual close.
 * (Holdings are carried at notional — bonds near par; real equity marks arrive with WS4's
 * share registry.)
 */
export function markInstitutionalBooks(ctx: WeeklyStepContext): void {
  const privateById = new Map(ctx.prevActivePrivateFirms.map((c) => [c.id, c]));
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    // HC4: a PE fund's assets are its portfolio companies, marked from their REAL earnings and
    // real debt (an EV multiple on EBITDA less the ladder, at the fund's stake) — the same two
    // numbers the credit market prices, so a portfolio company's deterioration hits its
    // sponsor's NAV the week it happens.
    if (entity.entityType === 'PRIVATE_EQUITY' && entity.peFund) {
      // The multiple is the one the PUBLIC market cleared this week for comparable listed
      // earnings, not a constant: a bare `8 *` sat here and in the deal arithmetic, so a
      // sponsor's NAV could not fall when equities did and a portfolio was bought on one
      // valuation and marked on another. One number, cleared, in one place.
      const evMultiple = publicComparableEvMultiple(entity.region, ctx.prevActiveFirms);
      const portfolioUSD = entity.peFund.portfolioCompanyIds.reduce((a, id) => {
        const c = privateById.get(id);
        if (!c || c.isDefaulted) return a;
        const stakePct = c.ownership?.peSponsorPct ?? 0;
        return a + Math.max(0, evMultiple * c.ebitda - c.totalDebt) * stakePct;
      }, 0);
      return { ...entity, totalAssetsUSD: Math.round((entity.cashUSD ?? 0)
        + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id })
        + (entity.repoLentUSD ?? 0) + (entity.stockLoanNetUSD ?? 0) + portfolioUSD) };
    }
    const holdingsUSD = entity.itemizedHoldings.reduce(
      (a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0);
    // SETL6: this stage runs before the settlement pass, so the week's cleared trades are still
    // unsettled — the securities are on the book and the cash has not moved. The receivable (or
    // payable) is the other leg, and leaving it out would mark every buyer up and every seller
    // down by the size of its own week's trading.
    const unsettledUSD = pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id });
    // Cash lent overnight (WS6) is still the entity's money — a secured claim maturing next
    // session, not a security; leaving it out would mark the book down by the position's size
    // every week and back up the week after.
    // HF: and its stock-loan book, which is the shares it is owed (or owes) against the cash
    // collateral standing behind them — zero the week a loan is struck, and the short's running
    // profit or loss every week after.
    return { ...entity, totalAssetsUSD: (entity.cashUSD ?? 0) + unsettledUSD + (entity.repoLentUSD ?? 0)
      + (entity.stockLoanNetUSD ?? 0) + holdingsUSD };
  });
}
