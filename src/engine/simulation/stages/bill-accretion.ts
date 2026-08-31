/**
 * PUB3d — a discount bill's return, paid the way a discount bill actually pays it.
 *
 * A bill has no coupon. Its holder buys below par and is made whole at redemption, so the return
 * arrives as the position ACCRETING toward face over the bill's life. That accretion is income:
 * the asset grows and equity grows with it, and no cash moves until the bill matures — which is
 * exactly why a bill's cash flow profile differs from a bond's.
 *
 * The conservation this preserves: the government receives discounted proceeds at issue and repays
 * FACE at redemption. The difference is its whole cost, and it equals the accretion its holders
 * accumulated over the same period. Remove one leg without the other and the model either mints
 * money or destroys it — which is why bills stopped paying coupons and started accreting in the
 * same change.
 */

import { govBucketKeyOf } from '../../../domain/sovereign-id';
import { RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { isActiveCompany } from '../../../domain/company';
import { SOV_BILL_BUCKETS } from './shared-helpers';

/** Weekly accretion factor for a bill bucket, off the region's own cleared bill curve. */
function weeklyAccretionRate(reg: any, bucketKey: string): number {
  const bucket = SOV_BILL_BUCKETS.find((b) => b.key === bucketKey);
  if (!bucket) return 0;
  // The cleared short curve is what the market says this paper yields; accreting at anything else
  // would pay holders a return the auction did not price.
  const annual = bucket.years <= 0.3
    ? reg.zeroRates.tenor3M
    : reg.zeroRates.tenor3M + (reg.zeroRates.tenor2Y - reg.zeroRates.tenor3M) * (bucket.years / 2);
  return Math.max(-0.5, annual) / 52;
}

export function runBillAccretionStage(state: any, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg: any = ctx.updatedRegions[regionId];
    if (!reg) return;
    const rateByBucket = new Map<string, number>(SOV_BILL_BUCKETS.map((b) => [b.key as string, weeklyAccretionRate(reg, b.key)]));

    // Banks: the position grows and the gain is earnings. Both sides move, so the per-bank
    // balance-sheet identity holds without a cash leg.
    // §7.250 — THE LIVE SHEET, both sides. This stage runs AFTER stage 08, and only stage 08
    // ever applies `companyUpdates.bankBalanceSheet` — so writing the channel here wrote to
    // NOWHERE (the context dies with the week), and reading it first read the PRE-08 sheet,
    // erasing settlement's intraday deltas from the basis besides. Measured: the accreted b13
    // was written as 1,218.45M and the week ended at 1,217.28M — the banks' bills have never
    // accreted, silently, because both legs dropped together and no identity could break
    // (§7.103's trap, on the write side).
    ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
      if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return c;
      const existing = c.bankBalanceSheet;
      const byTenor = { ...(existing.sovereignBondHoldingsByTenor || {}) };
      let gainUSD = 0;
      rateByBucket.forEach((rate, key) => {
        const heldUSD = Number(byTenor[key]) || 0;
        if (heldUSD <= 0 || rate === 0) return;
        const accretedUSD = heldUSD * rate;
        byTenor[key] = heldUSD + accretedUSD;
        gainUSD += accretedUSD;
      });
      if (gainUSD === 0) return c;
      return {
        ...c,
        bankBalanceSheet: {
          ...existing,
          sovereignBondHoldingsByTenor: byTenor,
          sovereignBondHoldingsUSD: Math.round((Object.values(byTenor) as any[]).reduce((a: number, v: any) => a + (Number(v) || 0), 0)),
          bankEquityUSD: existing.bankEquityUSD + gainUSD,
        },
      };
    });

    // Institutions: the holding grows; the book's own marking treats it as the income it is.
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
      if (e.region !== regionId) return e;
      let touched = false;
      const holdings = e.itemizedHoldings.map((h) => {
        if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return h;
        const key = govBucketKeyOf(h.instrumentId, regionId);
        const rate = key ? rateByBucket.get(key) : undefined;
        if (!rate) return h;
        touched = true;
        return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * (1 + rate) };
      });
      return touched ? { ...e, itemizedHoldings: holdings } : e;
    });

    // The central bank's bill book accretes too — its income is remitted to the treasury, which
    // is the loop PUB2a built.
    const cb = reg.centralBankSheet;
    if (cb) {
      const book = { ...cb.sovereignHoldingsByTenor };
      let gainUSD = 0;
      rateByBucket.forEach((rate, key) => {
        const heldUSD = Number(book[key]) || 0;
        if (heldUSD <= 0 || rate === 0) return;
        book[key] = heldUSD * (1 + rate);
        gainUSD += heldUSD * rate;
      });
      if (gainUSD > 0) {
        cb.sovereignHoldingsByTenor = book;
        cb.lastBillAccretionUSD = Math.round(gainUSD);
      } else {
        cb.lastBillAccretionUSD = 0;
      }
    }
  });
}
