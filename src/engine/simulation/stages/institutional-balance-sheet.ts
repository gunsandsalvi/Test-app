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

import { Company, InstitutionalEntity, InstitutionalEntityType } from '../../../types';
import { publicComparableEvMultiple } from './pe-lifecycle';
import { WeeklyStepContext } from './context';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey } from './shared-helpers';

/**
 * Balance-sheet leverage each type genuinely runs, as a fraction of total assets. A hedge fund
 * finances positions (prime brokerage); real money does not. This is a structural fact of each
 * balance sheet, not a tuning knob: it lets a hedge fund's cash run temporarily negative up to
 * its financing capacity, and nobody else's.
 */
const LEVERAGE_ALLOWANCE: Record<InstitutionalEntityType, number> = {
  INSURER: 0,
  PENSION_FUND: 0,
  ASSET_MANAGER: 0,
  HEDGE_FUND: 0.5,
  // The fund itself does not lever; the leverage lives on the portfolio companies' own ladders.
  PRIVATE_EQUITY: 0,
  // An index fund holds exactly what it was given money for. It cannot borrow to buy more of its
  // benchmark — that would be a leveraged product, which is a different fund.
  ETF: 0,
  // A $1-NAV fund is unlevered by construction.
  MONEY_MARKET_FUND: 0,
};

/**
 * An entity's real purchasing capacity right now, across all asset classes.
 *
 * WS6's overnight repo lending (`repoLentUSD`) is deliberately NOT counted: the cash is
 * genuinely out the door for the week — a bank is funding its book with it — and counting a
 * receivable as spendable would let the entity buy securities with money it had already lent.
 * It is part of the BOOK (markInstitutionalBooks), never of the budget.
 */
export function availablePurchaseCapacityUSD(entity: InstitutionalEntity): number {
  const allowanceUSD = LEVERAGE_ALLOWANCE[entity.entityType] * Math.max(0, entity.totalAssetsUSD);
  return Math.max(0, (entity.cashUSD ?? 0) + allowanceUSD);
}

/**
 * The slice of that capacity an entity brings to ONE asset class's auction this week, split by
 * its own allocation targets over the invested classes. The clearing stages run in sequence and
 * each applies its real cash deltas immediately, so the next stage reads capacity net of what
 * the previous one actually spent — the ordering is the settlement reality, not an artifact.
 */
export function stagePurchaseBudgetUSD(
  entity: InstitutionalEntity,
  assetClass: 'CORP_BOND' | 'GOV_BOND' | 'LEVERAGED_LOAN'
): number {
  const t = entity.assetAllocationTarget;
  const investedPcts = t.corpBondPct + t.govBondPct + t.loanPct;
  if (investedPcts <= 0) return 0;
  const classPct =
    assetClass === 'CORP_BOND' ? t.corpBondPct : assetClass === 'GOV_BOND' ? t.govBondPct : t.loanPct;
  return availablePurchaseCapacityUSD(entity) * (classPct / investedPcts);
}

/**
 * Credit each entity its real portfolio income for the week, at the issuer's own real terms.
 * The payer's side already exists (stage 08 expenses every tranche's interest), so this leg
 * completes a flow rather than creating one. Runs before the clearing stages so the week's
 * income can fund the week's bids.
 */
export function accrueInstitutionalIncome(ctx: WeeklyStepContext): void {
  const companyById = new Map<string, Company>(
    [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].map((c) => [c.id, c]));

  // SCALE: every one of these is a pure function of one issuer's (or one region's) ladder, and
  // was being recomputed once per HOLDING — the same ladder walked once per holder of the same
  // paper, and the whole sovereign ladder once per gov-bond row. Same arithmetic once, memoized
  // for the week; every holding then reads the identical number it always did.
  const avgFixedCouponByIssuer = new Map<string, number | null>();
  const avgFloatMarginBpsByIssuer = new Map<string, number | null>();
  const sovCouponByRegion = new Map<string, Record<string, number>>();
  const avgFixedCouponOf = (issuer: Company): number | null => {
    let memo = avgFixedCouponByIssuer.get(issuer.id);
    if (memo === undefined) {
      const fixed = (issuer.debtTranches || []).filter((t) => t.rateType === 'FIXED');
      const principal = fixed.reduce((a, t) => a + t.principalUSD, 0);
      memo = principal <= 0 ? null
        : fixed.reduce((a, t) => a + t.principalUSD * (t.couponRate ?? 0.05), 0) / principal;
      avgFixedCouponByIssuer.set(issuer.id, memo);
    }
    return memo;
  };
  const avgFloatMarginBpsOf = (issuer: Company): number | null => {
    let memo = avgFloatMarginBpsByIssuer.get(issuer.id);
    if (memo === undefined) {
      // G2: bank facilities pay their interest to the lending BANK, not to loan-market
      // holders — excluded here exactly as they are from 07d's float.
      const floating = (issuer.debtTranches || []).filter((t) => t.rateType === 'FLOATING' && !t.isBankFacility);
      const principal = floating.reduce((a, t) => a + t.principalUSD, 0);
      memo = principal <= 0 ? null
        : floating.reduce((a, t) => a + t.principalUSD * (t.floatingMarginBps ?? 200), 0) / principal;
      avgFloatMarginBpsByIssuer.set(issuer.id, memo);
    }
    return memo;
  };

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    let weeklyIncomeUSD = 0;
    entity.itemizedHoldings.forEach((h) => {
      const notional = h.quantityOrNotionalUSD ?? 0;
      if (notional <= 0) return;
      const issuer = companyById.get((h as { instrumentId?: string }).instrumentId ?? '');
      if (!issuer) return;
      if (h.instrumentType === 'CORP_BOND') {
        const avgCoupon = avgFixedCouponOf(issuer);
        if (avgCoupon === null) return;
        weeklyIncomeUSD += (notional * avgCoupon) / 52;
      } else if (h.instrumentType === 'LEVERAGED_LOAN') {
        const avgMarginBps = avgFloatMarginBpsOf(issuer);
        if (avgMarginBps === null) return;
        const regionPolicyRate = ctx.updatedRegions[entity.region]?.policyRate ?? 0.03;
        weeklyIncomeUSD += (notional * (regionPolicyRate + avgMarginBps / 10000)) / 52;
      }
    });
    // PUB1: sovereign coupons are REAL now — paid at each bucket's weighted-average coupon off
    // the issuing region's own debt stack, and debited from that government's account in stage
    // 11. This replaces the WS7-era bill carry, which credited holders while the government paid
    // nothing (the §6 asymmetric-boundary row).
    entity.itemizedHoldings.forEach((h) => {
      if (h.instrumentType !== 'GOV_BOND') return;
      const issuerReg = ctx.updatedRegions[h.issuerRegion];
      if (!issuerReg) return;
      const bucket = h.instrumentId.replace(`${h.issuerRegion}-GOV-`, '');
      let cb = sovCouponByRegion.get(h.issuerRegion);
      if (!cb) { cb = sovereignCouponByBucket(issuerReg.govDebtTranches, sovBucketKey); sovCouponByRegion.set(h.issuerRegion, cb); }
      const coupon = cb[bucket] ?? 0;
      weeklyIncomeUSD += ((h.quantityOrNotionalUSD ?? 0) * coupon) / 52;
    });
    if (weeklyIncomeUSD <= 0) return entity;
    // Recorded as well as credited: the entity's income statement and its cash are the same
    // event, and stage 08 reports it on the listed shell rather than inventing a portfolio yield
    // of its own (HH1b — one institution, not two).
    return {
      ...entity,
      cashUSD: (entity.cashUSD ?? 0) + weeklyIncomeUSD,
      lastWeeklyInvestmentIncomeUSD: weeklyIncomeUSD,
    };
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
      return { ...entity, totalAssetsUSD: Math.round((entity.cashUSD ?? 0) + (entity.repoLentUSD ?? 0) + portfolioUSD) };
    }
    const holdingsUSD = entity.itemizedHoldings.reduce(
      (a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0);
    // Cash lent overnight (WS6) is still the entity's money — a secured claim maturing next
    // session, not a security; leaving it out would mark the book down by the position's size
    // every week and back up the week after.
    return { ...entity, totalAssetsUSD: (entity.cashUSD ?? 0) + (entity.repoLentUSD ?? 0) + holdingsUSD };
  });
}
