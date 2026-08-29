/**
 * HC Wave 2 — the corporate lifecycle: LBOs, dividend recaps, exits, real IPOs, births, and
 * sponsor equity wiped on default.
 *
 * Wave 1 made the hidden sector real firms. Wave 2 makes them a POPULATION with a life: a
 * sponsor buys one at a real price with real debt, recaps it when spreads are tight, exits it
 * by sale or by listing it, new firms are born out of the SME pools when a category's demand
 * grows past what its named firms serve, and a defaulted portfolio company wipes its sponsor's
 * equity first. Firm creation now has exactly one path — born small in a pool, carved into a
 * named private firm, and public only by choosing to list — so `generateIPOCompany`, the
 * synthetic generator that conjured a company out of a category's demand growth, is deleted.
 *
 * Everything prices through machinery that already exists rather than new formulas:
 *   - an LBO's financing is a real WS8 primary offering in the loan book (it can be WITHDRAWN,
 *     and a deal whose financing fails does not happen — real market access);
 *   - an IPO is a real WS8 equity offering into 07e's book (a weak book prices low or pulls);
 *   - the purchase price is the same EV/EBITDA arithmetic that already marks sponsor NAV
 *     weekly, so a portfolio is bought and marked on one valuation, not two;
 *   - a birth is a CARVE from the SME pool (conservation, exactly as HC1's cutover), so the
 *     economy's totals never change because a firm was created.
 */

import { Company, InstitutionalEntity, Region, RegionId, DebtTranche } from '../../../types';
import { WeeklyStepContext } from './context';
import { PrimaryOffering, chooseLeadBank } from '../../../domain/primary-market';
import { isActiveCompany } from '../../../domain/company';
import { random } from '../../rng';
import { companyFairValuePerShare } from '../../equity-valuation';
import { REQUIRED_RETURN_ON_CAPITAL } from './asset-allocation';
import { settleCorporateActionOnHolders, payHoldersCash } from './shared-helpers';
import { pay } from './settlement';
import { smePoolSubUnits } from '../../../domain/industry-registry';

/**
 * The lowest required return any liquid-market holder runs — the pension fund's. A buyer of the
 * WHOLE company has to clear the most optimistic holder's reservation, not the marginal one's,
 * which is what a control premium is.
 */
const PATIENT_HOLDER_REQUIRED_RETURN = Math.min(
  REQUIRED_RETURN_ON_CAPITAL.PENSION_FUND,
  REQUIRED_RETURN_ON_CAPITAL.INSURER,
  REQUIRED_RETURN_ON_CAPITAL.ASSET_MANAGER
);

/**
 * What a private company is WORTH: the multiple the public market is actually paying for
 * comparable listed earnings in the same region, read off CLEARED prices (07e) rather than
 * stated as a constant. A sponsor pays it and marks at it — one number for both, so a fund
 * cannot book a gain simply by buying.
 *
 * It replaces a fixed 8x that sat in two places, this file's deal arithmetic and the NAV mark in
 * institutional-balance-sheet.ts, and made the private sector's value independent of the market
 * it lives in: a sponsor's NAV could not fall when equities did, and an exit test against a fixed
 * private mark could never fire, because public comps in this world clear at 3.7-8.0x against it.
 * No illiquidity discount is applied on top — that would be another invented number; what the
 * comparable earnings fetch is what they fetch.
 */
export function publicComparableEvMultiple(
  regionId: RegionId,
  listedCompanies: Company[]
): number {
  const inRegion: number[] = [];
  const everywhere: number[] = [];
  listedCompanies.forEach((c) => {
    if (!isActiveCompany(c) || c.listingStatus === 'PRIVATE' || !(c.ebitda > 0) || !(c.marketCap > 0)) return;
    const m = (c.marketCap + c.totalDebt) / c.ebitda;
    everywhere.push(m);
    if (c.region === regionId) inRegion.push(m);
  });
  // The region's own comps where they exist; the wider market where a region has none. A median,
  // because a handful of broken names at either tail is not what the next deal prices against.
  const pool = inRegion.length > 0 ? inRegion : everywhere;
  if (pool.length === 0) return 0;
  pool.sort((a, b) => a - b);
  return pool[Math.floor(pool.length / 2)];
}
/** Share of the purchase price funded with new leveraged debt — the defining feature of an LBO. */
const LBO_DEBT_SHARE = 0.55;
/** Leverage a sponsor will not exceed on a target, in debt/EBITDA — the lenders' covenant. */
const LBO_MAX_LEVERAGE = 6.0;
/** Weeks a sponsor holds before it will consider an exit. */
const MIN_HOLD_WEEKS = 78;
/** Discount margin below which the loan market is "open" enough for a dividend recap. */
const RECAP_DM_THRESHOLD_BPS = 450;
/**
 * The premium over its OWN ENTRY BASIS a sponsor needs before it lists. The comparison that
 * matters to a fund is not an abstract discount to public comps — it is whether the market
 * will pay more than it paid. (An earlier version tested the peer multiple against the fixed
 * private mark and never fired once: measured, public comps trade at 4.4–7.9x EV/EBITDA in
 * this world against an 8x private mark, so on that test no sponsor would ever list. Nobody
 * IPOs into a falling market — but a fund that bought at 5x and sees 7x does.)
 */
const IPO_PREMIUM_OVER_ENTRY = 1.15;

/**
 * DRY POWDER — a fund does not sit on its investors' money, it CALLS it deal by deal. So the
 * capital a sponsor can deploy is what its named LPs have COMMITTED and not yet paid in, capped
 * by what those LPs can actually fund out of their own cash. Reading dry powder as the sponsor's
 * `cashUSD` instead measured 0.01B across every sponsor in the world and made an LBO structurally
 * impossible; HC4 built `lpCommitments` for exactly this and left the call to HC6.
 */
export function dryPowderUSD(
  sponsor: InstitutionalEntity,
  lpById: Map<string, InstitutionalEntity>
): number {
  return (sponsor.peFund?.lpCommitments ?? []).reduce((sum, c) => {
    const undrawnUSD = Math.max(0, c.committedUSD - c.drawnUSD);
    return sum + Math.min(undrawnUSD, Math.max(0, lpById.get(c.lpEntityId)?.cashUSD ?? 0));
  }, 0);
}

/**
 * The CAPITAL CALL itself: real money leaves the named LPs' balance sheets pro rata to what each
 * has left to give, and the fund's drawn capital rises by the same amount. Returns what was
 * actually raised — a call that comes up short is a deal that does not close.
 */
function callCapitalUSD(ctx: WeeklyStepContext, sponsorId: string, requestedUSD: number): number {
  const sponsor = ctx.updatedInstitutionalEntities.find((e) => e.id === sponsorId);
  if (!sponsor?.peFund || !(requestedUSD > 0)) return 0;
  const lpById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));
  const capacity = sponsor.peFund.lpCommitments.map((c) => ({
    commitment: c,
    availableUSD: Math.min(
      Math.max(0, c.committedUSD - c.drawnUSD),
      Math.max(0, lpById.get(c.lpEntityId)?.cashUSD ?? 0)
    ),
  }));
  const totalAvailableUSD = capacity.reduce((a, x) => a + x.availableUSD, 0);
  const calledUSD = Math.min(requestedUSD, totalAvailableUSD);
  if (!(calledUSD > 0)) return 0;

  const drawnByLp = new Map<string, number>();
  capacity.forEach((x) => {
    if (!(x.availableUSD > 0)) return;
    const shareUSD = calledUSD * (x.availableUSD / totalAvailableUSD);
    x.commitment.drawnUSD += shareUSD;
    drawnByLp.set(x.commitment.lpEntityId, (drawnByLp.get(x.commitment.lpEntityId) ?? 0) + shareUSD);
  });
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    const paidUSD = drawnByLp.get(e.id);
    return paidUSD ? { ...e, cashUSD: (e.cashUSD ?? 0) - paidUSD } : e;
  });
  return calledUSD;
}

/**
 * A DISTRIBUTION back to the LPs — recap proceeds and exit proceeds are not the fund's to keep.
 * The cash returns pro rata to drawn capital and reduces it, which is what a recallable
 * distribution really is: the commitment becomes available to deploy again.
 */
function distributeToLps(ctx: WeeklyStepContext, sponsorId: string, amountUSD: number): void {
  const sponsor = ctx.updatedInstitutionalEntities.find((e) => e.id === sponsorId);
  if (!sponsor?.peFund || !(amountUSD > 0)) return;
  const totalDrawnUSD = sponsor.peFund.lpCommitments.reduce((a, c) => a + Math.max(0, c.drawnUSD), 0);
  if (!(totalDrawnUSD > 0)) return;
  const paidUSD = Math.min(amountUSD, totalDrawnUSD);
  const creditByLp = new Map<string, number>();
  sponsor.peFund.lpCommitments.forEach((c) => {
    if (!(c.drawnUSD > 0)) return;
    const shareUSD = paidUSD * (c.drawnUSD / totalDrawnUSD);
    c.drawnUSD = Math.max(0, c.drawnUSD - shareUSD);
    creditByLp.set(c.lpEntityId, (creditByLp.get(c.lpEntityId) ?? 0) + shareUSD);
  });
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    const receivedUSD = creditByLp.get(e.id);
    if (receivedUSD) return { ...e, cashUSD: (e.cashUSD ?? 0) + receivedUSD };
    return e.id === sponsorId ? { ...e, cashUSD: (e.cashUSD ?? 0) - paidUSD } : e;
  });
}

const ebitdaOf = (c: Company) => Math.max(0, c.ebitda);
const enterpriseValueUSD = (c: Company, evMultiple: number) => evMultiple * ebitdaOf(c);
const equityValueUSD = (c: Company, evMultiple: number) =>
  Math.max(0, enterpriseValueUSD(c, evMultiple) - c.totalDebt);

/**
 * One region's weekly lifecycle pass. Runs after stage 08 (fundamentals are this week's) and
 * before stage 11's news, mutating `ctx.updatedCompanies`, the sponsor entities, and the
 * WS8 offering queue.
 */
export function runPeLifecycleForRegion(
  regionId: RegionId,
  reg: Region,
  ctx: WeeklyStepContext,
  nextWeek: number
): void {
  const sponsors = ctx.updatedInstitutionalEntities.filter(
    (e) => e.region === regionId && e.entityType === 'PRIVATE_EQUITY' && e.peFund && !e.isDefaulted
  );
  if (sponsors.length === 0) return;

  const banksForLeads = ctx.prevActiveFirms
    .filter((c) => c.region === regionId && c.isBankEntity)
    .map((c) => ({ ticker: c.ticker, bankMarketShare: c.bankMarketShare }));
  const byId = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  const lpById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));
  // One valuation for this region this week: what the public market pays for comparable listed
  // earnings. The purchase price, the exit test and HC4's NAV mark all read it, so a portfolio is
  // never bought on one number and marked on another. No comps at all means no basis on which to
  // price a private company, and therefore no deals this week.
  const markEvMultiple = publicComparableEvMultiple(regionId, ctx.updatedCompanies);
  if (!(markEvMultiple > 0)) return;
  const pendingIssuers = new Set(ctx.primaryOfferingsWorking.map((o) => o.issuerId));
  const loanMarketDmBps = (() => {
    const dms = ctx.updatedCompanies
      .filter((c) => c.region === regionId && c.leveragedLoan && isActiveCompany(c))
      .map((c) => c.leveragedLoan!.discountMarginBps)
      .sort((a, b) => a - b);
    return dms.length ? dms[Math.floor(dms.length / 2)] : 9999;
  })();

  sponsors.forEach((sponsor) => {
    const portfolio = sponsor.peFund!.portfolioCompanyIds
      .map((id) => byId.get(id))
      .filter((c): c is Company => !!c && isActiveCompany(c));

    // ---- HC9: a defaulted portfolio company wipes the sponsor's equity FIRST. ----
    const defaultedIds = sponsor.peFund!.portfolioCompanyIds.filter((id) => {
      const c = byId.get(id);
      return c && c.isDefaulted;
    });
    if (defaultedIds.length > 0) {
      // The stake is worth nothing — the lenders own what is left. Dropping it from the
      // portfolio IS the wipeout: HC4's NAV mark reads the portfolio, so the fund's assets
      // fall by exactly the equity that was lost, the week it was lost.
      sponsor.peFund!.portfolioCompanyIds = sponsor.peFund!.portfolioCompanyIds.filter(
        (id) => !defaultedIds.includes(id)
      );
      defaultedIds.forEach((id) => {
        const c = byId.get(id);
        if (c) c.ownership = { ...(c.ownership ?? { founderPct: 1 }), peSponsorId: undefined, peSponsorPct: 0 };
      });
    }

    const availablePowderUSD = dryPowderUSD(sponsor, lpById);

    // ---- HC6a: dividend RECAP when the loan market is open. Real opportunistic supply — the
    // mechanism RVr identified as missing from the float's supply side. ----
    if (loanMarketDmBps < RECAP_DM_THRESHOLD_BPS) {
      const recapTarget = portfolio.find((c) => {
        if (pendingIssuers.has(c.id)) return false;
        const lev = c.totalDebt / Math.max(1, ebitdaOf(c));
        return ebitdaOf(c) > 0 && lev < LBO_MAX_LEVERAGE - 1 && nextWeek - (c.lastRecapWeek ?? -999) > 104;
      });
      if (recapTarget) {
        const headroomUSD = (LBO_MAX_LEVERAGE - recapTarget.totalDebt / Math.max(1, ebitdaOf(recapTarget))) * ebitdaOf(recapTarget);
        const recapUSD = Math.max(0, headroomUSD * 0.5);
        if (recapUSD > 1e6) {
          ctx.primaryOfferingsWorking.push({
            id: `PO-${recapTarget.id}-${nextWeek}-RECAP`,
            issuerId: recapTarget.id,
            issuerTicker: recapTarget.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeUSD: recapUSD,
            // A recap is discretionary: the sponsor walks if the market prices it wide.
            walkAwayStat: RECAP_DM_THRESHOLD_BPS,
            rateType: 'FLOATING',
            leadBankTicker: chooseLeadBank(recapTarget.id, banksForLeads),
            announcedWeek: nextWeek,
            peDeal: { kind: 'RECAP', sponsorId: sponsor.id },
          } as PrimaryOffering);
          pendingIssuers.add(recapTarget.id);
          recapTarget.lastRecapWeek = nextWeek;
        }
      }
    }

    // ---- HC7: EXIT BY LISTING. A sponsor lists when the public market would value the company
    // above what it is worth held privately — the real motive, priced with WS4's arithmetic
    // (a listed peer's multiple against the private EV multiple the sponsor marks at). ----
    const listCandidate = portfolio.find((c) => {
      if (pendingIssuers.has(c.id) || c.listingStatus !== 'PRIVATE') return false;
      if (nextWeek - (c.ownership?.acquiredWeek ?? 0) < MIN_HOLD_WEEKS) return false;
      return ebitdaOf(c) > 0 && equityValueUSD(c, markEvMultiple) > 0;
    });
    if (listCandidate) {
      // What the public market pays for a comparable listed name, from real cleared prices.
      const peerEvMultiple = markEvMultiple;
      // What the fund actually paid. A sponsor with no recorded basis (a seeded holding whose
      // purchase predates the simulation) is treated as having bought at the standing mark.
      const entryMultiple = listCandidate.ownership?.entryEvMultiple ?? markEvMultiple;
      if (peerEvMultiple > entryMultiple * IPO_PREMIUM_OVER_ENTRY) {
        const impliedEquityUSD = Math.max(0, peerEvMultiple * ebitdaOf(listCandidate) - listCandidate.totalDebt);
        // The registry the listing creates, and the price talk that follows from it. The share
        // count comes from the peers' own average price rather than a chosen number, so a listing
        // arrives at the denomination its market actually trades in.
        const peerPrices = ctx.updatedCompanies
          .filter((p) => p.region === regionId && p.listingStatus !== 'PRIVATE' && isActiveCompany(p) && p.stockPrice > 0)
          .map((p) => p.stockPrice)
          .sort((a, b) => a - b);
        const peerPrice = peerPrices.length ? peerPrices[Math.floor(peerPrices.length / 2)] : 0;
        const postIssueShares = Math.max(1, Math.round(impliedEquityUSD / Math.max(1, peerPrice)));
        const talkPerShare = impliedEquityUSD / postIssueShares;
        // Primary shares: a quarter of the company, sold to fund growth and pay down debt.
        const sharesOffered = Math.max(1, Math.round(postIssueShares * 0.25));
        ctx.primaryOfferingsWorking.push({
          id: `PO-${listCandidate.id}-${nextWeek}-IPO`,
          issuerId: listCandidate.id,
          issuerTicker: listCandidate.ticker,
          region: regionId,
          instrumentType: 'EQUITY',
          purpose: 'IPO',
          // The equity book clears in SHARES: the size is a share count, not money.
          sizeUSD: sharesOffered,
          // The sponsor pulls the deal below its private hold value — a weak book is a pulled
          // IPO, which is exactly what happens in reality.
          walkAwayStat: talkPerShare / IPO_PREMIUM_OVER_ENTRY,
          indicativeStat: talkPerShare,
          postIssueSharesOutstanding: postIssueShares,
          leadBankTicker: chooseLeadBank(listCandidate.id, banksForLeads),
          announcedWeek: nextWeek,
          peDeal: { kind: 'IPO', sponsorId: sponsor.id },
        } as PrimaryOffering);
        pendingIssuers.add(listCandidate.id);
      }
    }

    // ---- HC6b: a NEW LBO when the fund has dry powder and a target it can lever. ----
    if (availablePowderUSD > 1e6) {
      const owned = new Set(sponsor.peFund!.portfolioCompanyIds);
      const target = ctx.updatedCompanies.find((c) =>
        c.region === regionId && c.listingStatus === 'PRIVATE' && isActiveCompany(c)
        && !owned.has(c.id) && !c.ownership?.peSponsorId && !pendingIssuers.has(c.id)
        && ebitdaOf(c) > 0
        && c.totalDebt / Math.max(1, ebitdaOf(c)) < LBO_MAX_LEVERAGE - 2
        && equityValueUSD(c, markEvMultiple) > 0
        && equityValueUSD(c, markEvMultiple) * (1 - LBO_DEBT_SHARE) < availablePowderUSD
      );
      if (target) {
        const priceUSD = equityValueUSD(target, markEvMultiple);
        const debtUSD = Math.min(
          priceUSD * LBO_DEBT_SHARE,
          Math.max(0, LBO_MAX_LEVERAGE * ebitdaOf(target) - target.totalDebt)
        );
        const equityUSD = priceUSD - debtUSD;
        if (equityUSD > 0 && equityUSD <= availablePowderUSD && debtUSD > 1e6) {
          // The financing is a REAL primary offering: if the loan market will not fund it at a
          // level the sponsor accepts, the deal does not happen.
          ctx.primaryOfferingsWorking.push({
            id: `PO-${target.id}-${nextWeek}-LBO`,
            issuerId: target.id,
            issuerTicker: target.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeUSD: debtUSD,
            walkAwayStat: RECAP_DM_THRESHOLD_BPS * 2,
            rateType: 'FLOATING',
            leadBankTicker: chooseLeadBank(target.id, banksForLeads),
            announcedWeek: nextWeek,
            peDeal: { kind: 'LBO', sponsorId: sponsor.id, equityUSD },
          } as PrimaryOffering);
          pendingIssuers.add(target.id);
        }
      }
    }

    // ---- HC6c: the TAKE-PRIVATE. A sponsor buys a LISTED company and delists it. This is the
    // only route by which private equity touches the public market, and without it LBO activity
    // was an economy running beside the equity market rather than in it: measured, a run with the
    // whole lifecycle switched off produced public multiples indistinguishable from one with it
    // (USA 4.32x vs 4.25x at week 90), and the ONE effect that did show up ran backwards — the
    // capital calls drained the insurers' and pensions' cash, cutting institutional equity
    // buying power 51.6B -> 53.4B against the control.
    //
    // The premium is not a chosen number. To buy every share you must clear the reservation of
    // the holder who values the company MOST, not the marginal one who sets the printed price —
    // and that is exactly where a control premium comes from. So the takeout is what a holder
    // with the lowest required return in the market would pay, and the sponsor does the deal only
    // when its OWN levered return still clears its higher hurdle. The consequence is the real
    // one: the sponsor bid appears when equities are CHEAP, because a lower price means a smaller
    // equity cheque and a higher levered yield on it.
    if (availablePowderUSD > 1e6) {
      const owned = new Set(sponsor.peFund!.portfolioCompanyIds);
      const riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04;
      const listedTarget = ctx.updatedCompanies.find((c) => {
        if (c.region !== regionId || !isActiveCompany(c) || c.listingStatus === 'PRIVATE') return false;
        if (c.isBankEntity || c.isInstitutionalEntity) return false;
        if (owned.has(c.id) || c.ownership?.peSponsorId || pendingIssuers.has(c.id)) return false;
        if (!(ebitdaOf(c) > 0) || !(c.sharesOutstanding > 0) || !(c.stockPrice > 0)) return false;
        return c.totalDebt / Math.max(1, ebitdaOf(c)) < LBO_MAX_LEVERAGE - 2;
      });
      if (listedTarget) {
        // What the most patient liquid-market holder thinks a share is worth — the price at which
        // the last seller is willing to tender. Never below the printed price: nobody sells the
        // market a discount.
        const patientValuePerShare = companyFairValuePerShare(
          listedTarget, riskFreeRate, PATIENT_HOLDER_REQUIRED_RETURN
        );
        const takeoutPricePerShare = Math.max(listedTarget.stockPrice, patientValuePerShare);
        const takeoutValueUSD = takeoutPricePerShare * listedTarget.sharesOutstanding;
        const debtUSD = Math.min(
          takeoutValueUSD * LBO_DEBT_SHARE,
          Math.max(0, LBO_MAX_LEVERAGE * ebitdaOf(listedTarget) - listedTarget.totalDebt)
        );
        const equityUSD = takeoutValueUSD - debtUSD;
        // The sponsor's underwriting test: cash the business throws off after servicing the whole
        // post-deal stack, against the cheque it has to write. Its hurdle is higher than any
        // liquid holder's, which is why it needs the leverage to get there.
        const allInDebtUSD = listedTarget.totalDebt + debtUSD;
        const debtCostAnnual = reg.policyRate + listedTarget.oasSpreadBps / 10000;
        const leveredCashFlowUSD = ebitdaOf(listedTarget) - allInDebtUSD * debtCostAnnual;
        const clearsHurdle =
          equityUSD > 0 && leveredCashFlowUSD / equityUSD > REQUIRED_RETURN_ON_CAPITAL.PRIVATE_EQUITY;
        if (clearsHurdle && equityUSD <= availablePowderUSD && debtUSD > 1e6) {
          ctx.primaryOfferingsWorking.push({
            id: `PO-${listedTarget.id}-${nextWeek}-TAKEPRIVATE`,
            issuerId: listedTarget.id,
            issuerTicker: listedTarget.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeUSD: debtUSD,
            walkAwayStat: RECAP_DM_THRESHOLD_BPS * 2,
            rateType: 'FLOATING',
            leadBankTicker: chooseLeadBank(listedTarget.id, banksForLeads),
            announcedWeek: nextWeek,
            peDeal: { kind: 'TAKE_PRIVATE', sponsorId: sponsor.id, equityUSD, takeoutPricePerShare },
          } as PrimaryOffering);
          pendingIssuers.add(listedTarget.id);
        }
      }
    }
  });
}

/**
 * Settle the lifecycle deals whose financing priced this week (called after the clearing
 * stages, from stage 08's settlement pass): the sponsor pays real equity from dry powder, the
 * company changes hands, a recap's proceeds leave as a real dividend, and an IPO flips the
 * listing flag with a real share registry.
 */
export function settlePeLifecycleDeals(ctx: WeeklyStepContext, nextWeek: number): void {
  ctx.primarySettlements.forEach((settlement) => {
    const deal = settlement.offering.peDeal;
    if (!deal) return;
    const comp = ctx.updatedCompanies.find((c) => c.id === settlement.offering.issuerId);
    if (!comp) return;
    const failed = settlement.withdrawn || settlement.marketTakeUSD <= 0;

    if (deal.kind === 'LBO') {
      if (failed) return; // financing failed: the deal simply does not happen
      const equityUSD = deal.equityUSD ?? 0;
      // The cheque is real money called from the fund's LPs. A call that comes up short — an LP
      // that cannot fund what it committed — is a deal that does not close, so nothing is
      // half-drawn: what was raised goes back before the deal is abandoned.
      const calledUSD = callCapitalUSD(ctx, deal.sponsorId, equityUSD);
      if (calledUSD < equityUSD * 0.999) {
        if (calledUSD > 0) distributeToLps(ctx, deal.sponsorId, calledUSD);
        return;
      }
      // The SELLERS are paid. A private firm's owners are its founders, who live in the household
      // sector: the money leaves the fund and arrives as real household deposits, so the purchase
      // price is not destroyed on its way out of the institutional book.
      const sellerRegion = ctx.updatedRegions[comp.region];
      if (sellerRegion?.householdState) {
        sellerRegion.householdState.depositsUSD += calledUSD;
        // HH4d: the banks post this deposit flow next week (T+1).
        sellerRegion.householdState.pendingBankSettlementUSD =
          (sellerRegion.householdState.pendingBankSettlementUSD ?? 0) + calledUSD;
        sellerRegion.householdState.netWorthUSD += calledUSD;
      }
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
        if (e.id !== deal.sponsorId || !e.peFund) return e;
        return {
          ...e,
          peFund: { ...e.peFund, portfolioCompanyIds: [...e.peFund.portfolioCompanyIds, comp.id] },
        };
      });
      comp.ownership = {
        founderPct: 0.05, peSponsorId: deal.sponsorId, peSponsorPct: 0.95, acquiredWeek: nextWeek,
        entryEvMultiple: comp.ebitda > 0 ? (comp.totalDebt + equityUSD) / comp.ebitda : 0,
      };
      return;
    }

    if (deal.kind === 'TAKE_PRIVATE') {
      if (failed) return; // the loan market would not fund it: the company stays public
      const equityUSD = deal.equityUSD ?? 0;
      const pricePerShare = deal.takeoutPricePerShare ?? 0;
      const shares = comp.sharesOutstanding;
      if (!(pricePerShare > 0) || !(shares > 0)) return;
      const calledUSD = callCapitalUSD(ctx, deal.sponsorId, equityUSD);
      if (calledUSD < equityUSD * 0.999) {
        if (calledUSD > 0) distributeToLps(ctx, deal.sponsorId, calledUSD);
        return;
      }
      // The tender settles: every public shareholder is PAID for its stake and the register is
      // extinguished. This is the leg the equity market feels — institutions hand over shares and
      // receive cash they then have to put somewhere, which is why a take-private is a bid under
      // the whole market and not just under its target.
      const takeoutValueUSD = pricePerShare * shares;
      settleCorporateActionOnHolders(ctx, comp.id, 'EQUITY', shares, 0);
      payHoldersCash(ctx, comp.id, 'EQUITY', takeoutValueUSD);
      // The sponsor funds the cheque; the debt raised alongside it is already on the company.
      // What the holders receive above the equity cheque is what the new debt paid for.
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
        if (e.id !== deal.sponsorId || !e.peFund) return e;
        return {
          ...e,
          peFund: { ...e.peFund, portfolioCompanyIds: [...e.peFund.portfolioCompanyIds, comp.id] },
        };
      });
      comp.listingStatus = 'PRIVATE';
      comp.stockPrice = 0;
      comp.marketCap = 0;
      comp.sharesOutstanding = 0;
      comp.ownership = {
        founderPct: 0, peSponsorId: deal.sponsorId, peSponsorPct: 1, acquiredWeek: nextWeek,
        entryEvMultiple: comp.ebitda > 0 ? (comp.totalDebt + takeoutValueUSD) / comp.ebitda : 0,
      };
      comp.lastCashLedger = [
        ...(comp.lastCashLedger ?? []),
        { label: 'taken private: public register bought out', amountUSD: 0 },
      ];
      return;
    }

    if (deal.kind === 'RECAP') {
      if (failed || settlement.proceedsUSD <= 0) return;
      comp.cash -= settlement.proceedsUSD;
      comp.lastCashLedger = [...(comp.lastCashLedger ?? []), { label: 'dividend recap to sponsor', amountUSD: -settlement.proceedsUSD }];
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) =>
        e.id === deal.sponsorId ? { ...e, cashUSD: (e.cashUSD ?? 0) + settlement.proceedsUSD } : e
      );
      // A recap's proceeds belong to the investors, not the manager: they go straight back out.
      distributeToLps(ctx, deal.sponsorId, settlement.proceedsUSD);
      return;
    }

    // IPO: the listing flag flips, the registry is real, the sponsor sells down.
    const shares = settlement.offering.postIssueSharesOutstanding ?? 0;
    if (failed || settlement.proceedsUSD <= 0 || shares <= 0) {
      // A pulled listing leaves the company private: the price talk 07e printed against its
      // debut instrument is not a price for a company nobody can buy.
      comp.stockPrice = 0;
      comp.marketCap = 0;
      return;
    }
    comp.listingStatus = 'PUBLIC';
    comp.sharesOutstanding = shares;
    comp.stockPrice = Number(settlement.clearedStat.toFixed(2));
    comp.marketCap = Number((shares * comp.stockPrice).toFixed(0));
    comp.cash += settlement.proceedsUSD;
    comp.lastCashLedger = [...(comp.lastCashLedger ?? []), { label: 'IPO primary proceeds', amountUSD: settlement.proceedsUSD }];
    comp.ownership = { ...(comp.ownership ?? { founderPct: 0.05 }), peSponsorPct: 0.70 };
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
      if (e.id !== deal.sponsorId || !e.peFund) return e;
      return { ...e, peFund: { ...e.peFund, portfolioCompanyIds: e.peFund.portfolioCompanyIds.filter((id) => id !== comp.id) } };
    });
  });
}

/**
 * HC8 — BIRTHS. A category whose SME pool has grown past what its named firms serve spawns a
 * new named private firm, CARVED from the pool (revenue, employment and debt leave the
 * aggregate exactly as they arrive on the firm — HC1's conservation rule, applied to creation
 * rather than cutover). This is the only path by which a firm now enters the world: born small
 * in a pool, carved into a named private firm, public only by choosing to list. With
 * `generateIPOCompany` deleted, nothing conjures a company out of a category's demand growth.
 */
export function runFirmBirthsForRegion(
  regionId: RegionId,
  reg: Region,
  ctx: WeeklyStepContext,
  nextWeek: number,
  generate: (regionId: RegionId, seeds: import('../../bootstrap/private-firms').PrivateFirmSeed[],
             policyRate: number, tickers: Set<string>, names: Set<string>) => Company[]
): Company[] {
  // Quarterly, like every other structural event in this simulation.
  if (nextWeek % 13 !== 0) return [];
  const segs = reg.smePools || [];
  if (segs.length === 0) return [];

  // The pool that has grown the most relative to the named tier it feeds — a real formation
  // signal (demand its incumbents are not serving), not a random draw.
  const namedBySegment = new Map<string, number>();
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== regionId || c.listingStatus !== 'PRIVATE' || !isActiveCompany(c)) return;
    const seg = (c as any).smePoolIndustry as string | undefined;
    if (seg) namedBySegment.set(seg, (namedBySegment.get(seg) ?? 0) + c.annualRevenue);
  });
  const candidate = segs
    .map((seg) => ({ seg, ratio: seg.annualRevenueUSD / Math.max(1, namedBySegment.get(seg.industry) ?? 1) }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (!candidate || candidate.seg.annualRevenueUSD <= 0) return [];

  // Born SMALL — a new firm is a fraction of a percent of its pool, which is what a real
  // entrant is. Its leverage is what the SME pools actually carry (G2's serviceable ceiling),
  // so it enters the credit universe at a realistic rung rather than a chosen rating.
  const seg = candidate.seg;
  const revenueUSD = seg.annualRevenueUSD * 0.004;
  if (revenueUSD < 1e6) return [];
  const employees = Math.max(10, Math.round(seg.employment * (revenueUSD / Math.max(1, seg.annualRevenueUSD))));
  const tickers = new Set(ctx.updatedCompanies.map((c) => c.ticker));
  const names = new Set(ctx.updatedCompanies.map((c) => c.name));
  // SEG-D: the newborn sells what its pool sells — the pool's own measured mix by sub-unit, or
  // (before the pool has measured receipts) its industry's sub-units weighted by the region's
  // real demand for each, so a new firm opens where there is business to win.
  const measuredMix = seg.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
  const measuredTotalUSD = Object.values(measuredMix).reduce((a, v) => a + Math.max(0, v), 0);
  const productMixBySubUnit: Record<string, number> = measuredTotalUSD > 0
    ? { ...measuredMix }
    : Object.fromEntries(smePoolSubUnits(seg.industry)
      .map((su) => [su.unitId, reg.categoryDemand[su.unitId]?.demandLevelUSD ?? 0]));

  const born = generate(regionId, [{
    industry: seg.industry,
    productMixBySubUnit,
    annualRevenueUSD: revenueUSD,
    ebitdaMargin: seg.marginPct,
    leverage: 2.5,
    sponsorStyle: random() < 0.5,
    employeeCount: employees,
  }], reg.policyRate, tickers, names);
  if (born.length === 0) return [];

  // Conservation: the pool loses exactly what the firm gains.
  seg.annualRevenueUSD = Math.max(0, seg.annualRevenueUSD - revenueUSD);
  seg.employment = Math.max(1, seg.employment - employees);
  // SEG1: the opening balance too. A born firm's working capital used to be conjured by the
  // generator; now it is CARVED from the pool's own money, as a payment through settlement
  // (this stage runs after the week's cutoff, so it lands next cycle — the firm is born with
  // its opening balance in transit, and the economy's total cash never moved).
  born.forEach((c) => {
    const openingCashUSD = Math.min(Math.max(0, c.cash), Math.max(0, seg.cashUSD ?? 0));
    c.cash = 0;
    if (openingCashUSD > 0) {
      pay(ctx, {
        payer: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
        payee: { kind: 'COMPANY', ticker: c.ticker },
        amountUSD: openingCashUSD,
        reason: 'firm birth: opening balance carved from pool',
      });
    }
  });
  // Every firm banks somewhere. A company born without a house bank held its cash outside the
  // banking system entirely — its balance never reached any bank's funding, so the money existed
  // on the firm and nowhere else (rule 3's "1$ is 1$"). Measured: 12 unbanked firms at seed
  // growing with every birth cohort. The relationship is chosen the same way the seed chooses
  // it, so a born firm enters the world banked like every other.
  const banksForRelationship = ctx.updatedCompanies
    .filter((b) => b.region === regionId && b.isBankEntity && isActiveCompany(b))
    .map((b) => ({ ticker: b.ticker, bankMarketShare: b.bankMarketShare }));
  // Its real share of each market it entered, measured against what the region's firms already
  // sell there — the weekly evolution scales this number, so a firm starting at zero could never
  // gain any share at all.
  const regionSalesBySubUnit = new Map<string, number>();
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== regionId || !isActiveCompany(c)) return;
    (c.productLines || []).forEach((l) => {
      regionSalesBySubUnit.set(l.subUnitId, (regionSalesBySubUnit.get(l.subUnitId) ?? 0) + l.revenueShare * c.annualRevenue);
    });
  });
  born.forEach((c) => {
    (c.productLines || []).forEach((l) => {
      const lineUSD = l.revenueShare * c.annualRevenue;
      const marketUSD = (regionSalesBySubUnit.get(l.subUnitId) ?? 0) + lineUSD;
      l.categoryMarketShare = marketUSD > 0 ? Number((lineUSD / marketUSD).toFixed(6)) : 0;
    });
  });

  born.forEach((c) => {
    (c as any).bornWeek = nextWeek;
    if (!c.homeBankTicker && banksForRelationship.length > 0) {
      c.homeBankTicker = chooseLeadBank(c.id, banksForRelationship);
    }
  });
  return born;
}
