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
import { WeeklyStepContext } from './context';

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
};

/** An entity's real purchasing capacity right now, across all asset classes. */
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

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    let weeklyIncomeUSD = 0;
    entity.itemizedHoldings.forEach((h) => {
      const notional = h.quantityOrNotionalUSD ?? 0;
      if (notional <= 0) return;
      const issuer = companyById.get((h as { instrumentId?: string }).instrumentId ?? '');
      if (!issuer) return;
      if (h.instrumentType === 'CORP_BOND') {
        const fixed = (issuer.debtTranches || []).filter((t) => t.rateType === 'FIXED');
        const principal = fixed.reduce((a, t) => a + t.principalUSD, 0);
        if (principal <= 0) return;
        const avgCoupon = fixed.reduce((a, t) => a + t.principalUSD * (t.couponRate ?? 0.05), 0) / principal;
        weeklyIncomeUSD += (notional * avgCoupon) / 52;
      } else if (h.instrumentType === 'LEVERAGED_LOAN') {
        const floating = (issuer.debtTranches || []).filter((t) => t.rateType === 'FLOATING');
        const principal = floating.reduce((a, t) => a + t.principalUSD, 0);
        if (principal <= 0) return;
        const avgMarginBps = floating.reduce((a, t) => a + t.principalUSD * (t.floatingMarginBps ?? 200), 0) / principal;
        const regionPolicyRate = ctx.updatedRegions[entity.region]?.policyRate ?? 0.03;
        weeklyIncomeUSD += (notional * (regionPolicyRate + avgMarginBps / 10000)) / 52;
      }
      // Sovereign coupons: none, on purpose — see the module comment.
    });
    if (weeklyIncomeUSD <= 0) return entity;
    return { ...entity, cashUSD: (entity.cashUSD ?? 0) + weeklyIncomeUSD };
  });
}

/**
 * Mark every entity's total assets to its real book: cash plus holdings. Runs after the last
 * clearing stage, so next week's structural shares are sized by this week's actual close.
 * (Holdings are carried at notional — bonds near par; real equity marks arrive with WS4's
 * share registry.)
 */
export function markInstitutionalBooks(ctx: WeeklyStepContext): void {
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    const holdingsUSD = entity.itemizedHoldings.reduce(
      (a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0);
    return { ...entity, totalAssetsUSD: (entity.cashUSD ?? 0) + holdingsUSD };
  });
}
