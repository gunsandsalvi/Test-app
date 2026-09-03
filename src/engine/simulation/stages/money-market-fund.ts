import { entityCashOf } from '../../ledger/accounts';
/**
 * Money market funds: the missing dominant bid in the front-end books, funded by real
 * liabilities.
 *
 * The fund is an ordinary institutional entity whose whole book is the cash sleeve, so its
 * ASSET side costs almost nothing to build: the bill program (07f), the overnight repo session
 * and the RRP floor (WS6) already run every entity's idle cash through real markets — an MMF is
 * what an entity looks like when that sleeve is its entire balance sheet.
 *
 * The LIABILITY side is the real work, and both legs are real flows:
 *  **Corporate treasury sweeps** (stage 08's cash ledger): a company's cash above its own
 *    working-capital need — the same WORKING_CAPITAL_SHARE_OF_REVENUE its CP program sizes
 *    against — buys fund shares at the fixed $1 NAV; the moment operations need the money back
 *    the treasurer redeems, bounded by the fund's real available cash that week (an unfilled
 *    redemption carries to the next session while the fund's shrunken bill/repo bids convert
 *    assets back to cash — the "redemptions force real asset sales" mechanism, expressed
 *    through the same schedules that built the book).
 *  **The household yield-gap flow** (02b): the share of the weekly household savings flow
 *    that used to land in bank deposits moves toward whichever of the two rates is higher —
 *    deposits at the banks' deposit rate, or the fund's net yield. This is what finally makes
 *    banks COMPETE for funding: a hike the deposit beta lags flows straight out of deposits
 *    (G2 reads that outflow as a real funding-cost driver; MS replaces the flow split with real
 *    household choice).
 *
 * The QUOTED yield is structural and lags one week by construction — the book's own real
 * cleared rates (bill buckets at the cleared curve, repo at the cleared overnight rate, parked
 * cash at the RRP), minus the fee — which is why "tracks policy with a ~1-week lag" is the
 * verify condition rather than an assumption.
 */

import { pay } from './settlement';
import { govBucketKeyOf, isBillBucketKey } from '../../../domain/sovereign-id';
import { bookHeadOf } from '../../../engine2/holdings';
import { Company, InstitutionalEntity, Region, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { computeSovereignBookAnnualYield, ON_RRP_SPREAD_BPS } from '../../macro/banking';
import { CASH_SLEEVE_OVERNIGHT_SHARE } from './repo-clearing';
import { WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { REGION_IDS } from '../../../domain/geography';
import { institutionTotalAssetsUSD } from './institutional-balance-sheet';

/** The fund's annual expense ratio — a structural primitive like the deposit beta; G6/BP make
 * fees competitive between funds. */
export const MMF_FEE_ANNUAL = 0.003;
/** Yield gap at which the household savings flow has fully switched between deposits and the
 * fund. A stated primitive standing in for real household choice — MS owns replacing it. */
export const DEPOSIT_MMF_FULL_SWITCH_GAP = 0.01;

export function findRegionMmf(entities: InstitutionalEntity[], regionId: RegionId): InstitutionalEntity | undefined {
  return entities.find((e) => e.region === regionId && e.entityType === 'MONEY_MARKET_FUND' && !e.isDefaulted);
}

/**
 * The fund's structural net yield off its REAL current book at REAL cleared rates. An empty
 * fund quotes the floor its first dollar would earn (the RRP), net of fee — the honest opening
 * quote, and the reason the market can bootstrap itself when that beats the deposit rate.
 */
export function quoteMmfNetYieldAnnual(entity: InstitutionalEntity, cashUSD: number, reg: Region): number {
  const rrpRateAnnual = Math.max(0, reg.policyRate - ON_RRP_SPREAD_BPS / 10000);
  const repoRateAnnual = reg.repoRateAnnual ?? rrpRateAnnual;

  const billByTenor: Record<string, number> = {};
  let billUSD = 0;
  entity.itemizedHoldings.forEach((h) => {
    if (h.instrumentType !== 'GOV_BOND') return;
    const key = govBucketKeyOf(h.instrumentId, h.issuerRegion);
    if (!key || !isBillBucketKey(key)) return;
    billByTenor[key] = (billByTenor[key] ?? 0) + h.quantityOrNotionalUSD;
    billUSD += h.quantityOrNotionalUSD;
  });
  const billYieldAnnual = billUSD > 0 ? computeSovereignBookAnnualYield(billByTenor, reg.zeroRates) : 0;

  const repoLentUSD = entity.repoLentUSD ?? 0;
  // What is parked at the reverse repo window earns the floor; the cash still on the account
  // earns nothing until the next session decides where it goes.
  const rrpLentUSD = entity.rrpLentUSD ?? 0;
  const idleCashUSD = Math.max(0, cashUSD);
  const totalUSD = billUSD + repoLentUSD + rrpLentUSD + idleCashUSD;
  if (totalUSD <= 0) return Math.max(0, rrpRateAnnual - MMF_FEE_ANNUAL);

  const grossAnnual =
    (billUSD * billYieldAnnual + repoLentUSD * repoRateAnnual + rrpLentUSD * rrpRateAnnual) / totalUSD;
  return Math.max(0, grossAnnual - MMF_FEE_ANNUAL);
}

/**
 * The household leg, computed in 02b before the banks' deposit flow posts: how much of this
 * week's household savings flow goes to the fund instead of deposits. Returns the region
 * total; 02b passes each bank its share as a deposit-flow reduction and credits the fund here.
 */
export function divertHouseholdSavingsToMmf(
  regionId: RegionId,
  reg: Region,
  weeklySavingsDepositInflowUSD: number,
  ctx: WeeklyStepContext
): number {
  const mmf = findRegionMmf(ctx.updatedInstitutionalEntities, regionId);
  if (!mmf || weeklySavingsDepositInflowUSD <= 0) return 0;
  // What the banks actually decided to pay this week, not a second copy of a retired
  // beta. One number, one writer — the depositor's choice is between this and the fund's yield.
  const depositRateAnnual = reg.bankingSector.depositRateAnnual ?? 0;
  const gap = (mmf.mmfNetYieldAnnual ?? 0) - depositRateAnnual;
  if (gap <= 0) return 0;
  const divertedShare = Math.min(1, gap / DEPOSIT_MMF_FULL_SWITCH_GAP);
  const divertedUSD = weeklySavingsDepositInflowUSD * divertedShare;
  if (divertedUSD <= 0) return 0;

  // A REAL payment now. The household's deposit and the pending bank leg move at
  // settlement (T+1 to the banks, the same convention every post-bank-pass household flow
  // rides), the fund's cash and its home bank's institutional line move at the apply — and
  // `evolveBankingSector` no longer subtracts the diversion from the deposit flow itself,
  // which was the direct-mutation half this instruction replaces. The parameter it still
  // receives is the funding-pressure SIGNAL only.
  pay(ctx, {
    payer: { kind: 'HOUSEHOLD', region: regionId },
    payee: { kind: 'INSTITUTION', id: mmf.id },
    amountUSD: divertedUSD,
    reason: 'household savings into money fund',
  });
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.id !== mmf.id) return e;
    return {
      ...e,
      mmfSharesOutstandingUSD: (e.mmfSharesOutstandingUSD ?? 0) + divertedUSD,
    };
  });
  return divertedUSD;
}

/** Refresh each fund's quoted yield off its post-money-market-session book (02b, weekly). */
export function refreshMmfQuotes(regionId: RegionId, reg: Region, ctx: WeeklyStepContext): void {
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.region !== regionId || e.entityType !== 'MONEY_MARKET_FUND' || e.isDefaulted) return e;
    return { ...e, mmfNetYieldAnnual: Number(quoteMmfNetYieldAnnual(e, entityCashOf(ctx.v2, e), reg).toFixed(6)) };
  });
}

export interface CorporateSweepBook {
  /** Cash the fund can pay out to redeeming treasuries this week — its real available cash. */
  redeemableUSD: number;
  netInflowUSD: number;
}

/** Build the per-region redemption capacity before stage 08's company loop runs. */
export function openCorporateSweepBooks(ctx: WeeklyStepContext): Map<RegionId, CorporateSweepBook> {
  const books = new Map<RegionId, CorporateSweepBook>();
  REGION_IDS.forEach((regionId) => {
    const mmf = findRegionMmf(ctx.updatedInstitutionalEntities, regionId);
    if (!mmf) return;
    books.set(regionId, { redeemableUSD: Math.max(0, entityCashOf(ctx.v2, mmf)), netInflowUSD: 0 });
  });
  return books;
}

/**
 * One company's treasury decision inside stage 08's ledger: sweep cash above the
 * working-capital need into shares; redeem (bounded by the fund's real cash) when below it.
 * Returns the ledger amount (negative = cash out to the fund) and the share delta.
 */
export function corporateSweepDecision(
  comp: Company,
  cashAfterOperationsUSD: number,
  book: CorporateSweepBook | undefined
): { cashDeltaUSD: number; shareDeltaUSD: number } {
  if (!book) return { cashDeltaUSD: 0, shareDeltaUSD: 0 };
  const bufferUSD = comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
  const sharesUSD = comp.mmfSharesUSD ?? 0;

  if (cashAfterOperationsUSD > bufferUSD) {
    const sweepUSD = cashAfterOperationsUSD - bufferUSD;
    book.netInflowUSD += sweepUSD;
    // (user-authorized declared change): a sweep-in credits the fund's SHARE register and
    // settles as cash, but is NOT intraday liquidity to other redeemers — the redeemable pool is
    // the fund's OPENING cash, drawn down by redemptions only, and sweep money joins it at next
    // week's open (T+1, as a real corporate sweep deposit behaves). This is also what unhooks
    // the back kernel's redemption barrier from the post phase.
    return { cashDeltaUSD: -sweepUSD, shareDeltaUSD: sweepUSD };
  }
  if (cashAfterOperationsUSD < bufferUSD && sharesUSD > 0) {
    const wantedUSD = Math.min(sharesUSD, bufferUSD - cashAfterOperationsUSD);
    const paidUSD = Math.min(wantedUSD, book.redeemableUSD);
    if (paidUSD <= 0) return { cashDeltaUSD: 0, shareDeltaUSD: 0 };
    book.netInflowUSD -= paidUSD;
    book.redeemableUSD -= paidUSD;
    return { cashDeltaUSD: paidUSD, shareDeltaUSD: -paidUSD };
  }
  return { cashDeltaUSD: 0, shareDeltaUSD: 0 };
}

/** Settle the region books onto the funds after the company loop. */
export function settleCorporateSweepBooks(books: Map<RegionId, CorporateSweepBook>, ctx: WeeklyStepContext): void {
  if (books.size === 0) return;
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.entityType !== 'MONEY_MARKET_FUND') return e;
    const book = books.get(e.region);
    if (!book || book.netInflowUSD === 0) return e;
    // The CASH leg is settlement's now — the sweeping company names this fund as its
    // counterparty, so the money moves once. Crediting it here as well credited the fund and
    // left the payment at the boundary too, creating the amount twice over. What belongs here
    // is the SHARE register: the fund issues shares against the money it received.
    return {
      ...e,
      mmfSharesOutstandingUSD: Math.max(0, (e.mmfSharesOutstandingUSD ?? 0) + book.netInflowUSD),
    };
  });
}

/**
 * A stable-NAV fund's week: it pays its yield by ISSUING SHARES, and its fee LEAVES.
 *
 * The defect this closes: shares only ever moved on subscriptions and redemptions, while the
 * fund's assets grew every week by everything its book earned. So assets and shares diverged
 * without bound — measured 0.54% → 1.06% → 1.72% over 60 weeks, and it was not a slow drift but
 * an uncapped one. It only stayed inside the harness band because yields were low; XB1's larger
 * float raised them and the same defect crossed the band in four regions at once.
 *
 * A money fund holds its NAV at $1 by distributing income as new shares — a shareholder's dollar
 * becomes 1.0004 dollars of shares, never a share worth $1.0004. And the fee is the manager's
 * revenue, so it has to go somewhere real: it is paid to the region's asset managers, who are the
 * firms that actually run these funds.
 */
export function distributeMoneyFundIncome(ctx: WeeklyStepContext): void {
  const feeByRegion = new Map<RegionId, number>();
  const feePayerByRegion = new Map<RegionId, string>();
  // WHO THE NEW SHARES ARE ISSUED TO. This paid the yield by growing
  // `mmfSharesOutstandingUSD` and credited NO holder, so the fund's liability rose every week
  // while every holder's asset stood still: a one-sided flow (rule 14), measured at 2.5% of the
  // fund and compounding (41.39B outstanding against 40.34B held by week 6). The module's own
  // note says it closed an assets-versus-shares divergence — it closed it on the fund's side and
  // opened the same hole on the holders'.
  const issuedByRegion = new Map<RegionId, number>();
  const H = ctx.v2.holdings;
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.entityType !== 'MONEY_MARKET_FUND') return e;
    // holdings flip: row walk on the mirror.
    let holdingsUSD = 0;
    for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) holdingsUSD += H.qtyUSD[r];
    const bookUSD = entityCashOf(ctx.v2, e) + holdingsUSD + (e.repoLentUSD ?? 0) + (e.rrpLentUSD ?? 0);
    if (bookUSD <= 0) return e;
    const feeUSD = (bookUSD * MMF_FEE_ANNUAL) / 52;
    // A STABLE-NAV FUND DISTRIBUTES WHAT IT EARNED, NOT WHAT IT QUOTED.
    // This paid `bookUSD × mmfNetYieldAnnual`, a QUOTE, while the assets earned their realized
    // income — two derivations of one number (rule 3), and the share liability outran the book
    // by the gap, compounding (: 47 NAV-departure violations, book 2-3% under shares).
    // The $1-NAV identity is its own measure: the book's excess over the share liability, net
    // of the fee instruction below (whose cash leaves at the close), IS the undistributed
    // income. Distributing exactly that keeps book = shares by construction; a genuine LOSS
    // leaves book below shares and distributes nothing, which is what breaking the buck looks
    // like and exactly what the harness's departure check should catch.
    const paidToHoldersUSD = Math.max(0, bookUSD - feeUSD - (e.mmfSharesOutstandingUSD ?? 0));
    feeByRegion.set(e.region, (feeByRegion.get(e.region) ?? 0) + feeUSD);
    feePayerByRegion.set(e.region, e.id);
    issuedByRegion.set(e.region, (issuedByRegion.get(e.region) ?? 0) + paidToHoldersUSD);
    // The fee's cash leg is a payment now (fund → manager, below); only the SHARE
    // register — not money — is written here.
    return {
      ...e,
      mmfSharesOutstandingUSD: Math.max(0, (e.mmfSharesOutstandingUSD ?? 0) + paidToHoldersUSD),
    };
  });

  // The other leg: the new shares go to the holders that already own the fund, pro rata — the
  // region's corporate treasuries by their own `mmfSharesUSD` and the household sector by its.
  // A stable-NAV fund distributes income as SHARES, so a holder's dollar becomes 1.0004 dollars
  // of shares; that is a real claim arriving on a real book, not a number growing on the fund's.
  issuedByRegion.forEach((issuedUSD, regionId) => {
    if (!(issuedUSD > 0)) return;
    const reg = ctx.updatedRegions[regionId];
    const hhSharesUSD = Math.max(0, reg?.householdState?.mmfSharesUSD ?? 0);
    const corpSharesUSD = ctx.updatedCompanies.reduce(
      (a, c) => a + (c.region === regionId ? Math.max(0, c.mmfSharesUSD ?? 0) : 0), 0);
    const totalHeldUSD = hhSharesUSD + corpSharesUSD;
    if (totalHeldUSD <= 0) return;
    ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
      if (c.region !== regionId) return c;
      const held = Math.max(0, c.mmfSharesUSD ?? 0);
      if (held <= 0) return c;
      return Object.assign(c, { mmfSharesUSD: held + issuedUSD * (held / totalHeldUSD) });
    });
    if (reg?.householdState && hhSharesUSD > 0) {
      reg.householdState.mmfSharesUSD = hhSharesUSD + issuedUSD * (hhSharesUSD / totalHeldUSD);
    }
  });

  if (feeByRegion.size === 0) return;
  const managersByRegion = new Map<RegionId, { total: number }>();
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.entityType !== 'ASSET_MANAGER') return;
    const cur = managersByRegion.get(e.region) ?? { total: 0 };
    cur.total += Math.max(0, institutionTotalAssetsUSD(ctx, e));
    managersByRegion.set(e.region, cur);
  });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.entityType !== 'ASSET_MANAGER') return;
    const feeUSD = feeByRegion.get(e.region) ?? 0;
    const pool = managersByRegion.get(e.region)?.total ?? 0;
    const payerId = feePayerByRegion.get(e.region);
    if (feeUSD <= 0 || pool <= 0 || !payerId) return;
    // The management fee moves as a PAYMENT (fund → manager), not as two object rebuilds
    // no bank ever saw. Settlement carries both deposit legs.
    pay(ctx, {
      payer: { kind: 'INSTITUTION', id: payerId },
      payee: { kind: 'INSTITUTION', id: e.id },
      amountUSD: feeUSD * (Math.max(0, institutionTotalAssetsUSD(ctx, e)) / pool),
      reason: 'money fund management fee',
    });
  });
}
