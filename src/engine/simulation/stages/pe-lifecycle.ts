import { V2World } from '../../../engine2/world';
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
 *   an LBO's financing is a real WS8 primary offering in the loan book (it can be WITHDRAWN,
 *     and a deal whose financing fails does not happen — real market access);
 *   an IPO is a real WS8 equity offering into 07e's book (a weak book prices low or pulls);
 *   the purchase price is the same EV/EBITDA arithmetic that already marks sponsor NAV
 *     weekly, so a portfolio is bought and marked on one valuation, not two;
 *   a birth is a CARVE from the SME pool (conservation, exactly as HC1's cutover), so the
 *     economy's totals never change because a firm was created.
 */

import { distributable } from '../../../domain/fund';
import { currencyOf } from '../../../domain/geography';
import { Company, InstitutionalEntity, Region, RegionId, DebtTranche, NewsItem } from '../../../types';
import { WeeklyStepContext } from './context';
import { buildEntityIndex } from '../../ledger/entity-index';
import { PrimaryOffering, mandateAllocator } from '../../../domain/primary-market';
import { isActiveCompany, banksOf } from '../../../domain/company';
import { random } from '../../rng';
import { companyFairValuePerShare } from '../../equity-valuation';
import { REQUIRED_RETURN_ON_CAPITAL } from './asset-allocation';
import { settleCorporateActionOnHolders, payHoldersCash } from './shared-helpers';
import { pay, institutionSpendableLocal } from './settlement';
import { smePoolSubUnits } from '../../../domain/industry-registry';
import { STANDARD_CORP_TENOR_YEARS } from '../../../domain/primary-market';
import { issuerSpreadAtOnCurve, IS_LOAN_ROW } from '../../credit-price';
import { facilityMarginBpsFor } from './bank-lending';
import { issueTranche } from '../../ledger/tranche-ledger';
import { marketCapOf } from '../../../domain/company';
import { ladderTotalLocal } from '../../../engine2/tranches';
import { cashOf, openingCashOf, entityCashOf, poolCashOf, obligationCurrencyOf } from '../../ledger/accounts';
import { issueHolding } from '../../ledger/holdings-ledger';
import { bumpRegister } from './register-index';
import { equityInstrumentId, birthFacilityTrancheId } from '../../../domain/instrument-keys';
import type { EntityId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';

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
  /**
   * §3.13-READ C1 — THE LADDER, READ BY THE CALLER. It cannot be read here, because the two kinds
   * of caller have two different sources and both are right. Inside a week the ladder is the
   * tranche STORE (`ladderTotalLocal`): `Company.debtTranches` is rebuilt from it once, at
   * `core.ts:450`, after every stage has run, so a mid-week read of the array is last week's
   * leverage. At the SEED it is the array: `buildSeededGameState` runs before
   * `openSeededMirrors`, so the store has no rows yet and the objects the generator wrote ARE the
   * source. Naming the read at the call site is what keeps the seed's choice a decision rather
   * than the accident it was when both sides silently took the array.
   */
  debtOf: (c: Company) => number,
  regionId: RegionId,
  listedCompanies: Company[]
): number {
  const inRegion: number[] = [];
  const everywhere: number[] = [];
  listedCompanies.forEach((c) => {
    if (!isActiveCompany(c) || c.listingStatus === 'PRIVATE' || !(c.ebitda > 0) || !(marketCapOf(c) > 0)) return;
    const m = (marketCapOf(c) + debtOf(c)) / c.ebitda;
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
/**
 * Share of the purchase price funded with new leveraged debt — the defining feature of an LBO.
 *
 * HF4 — the capital structure is now the OUTCOME, not the input. `LBO_DEBT_SHARE = 0.55` had a
 * sponsor using 55% debt in a shut market and a wide-open one alike, decided before the market
 * priced it. A real sponsor levers as far as the covenant allows and as far as lenders will fund
 * at a margin it accepts, and the machinery to answer that is already here: the financing is a
 * real primary offering in 07d, the sponsor rides a walk-away margin on it, and the deal simply
 * does not happen when the loan market will not clear inside it. So the ask is the covenant
 * maximum, the equity cheque is what is left, and the debt share of any completed deal is
 * whatever the market and the covenant between them produced.
 */
/** Leverage a sponsor will not exceed on a target, in debt/EBITDA — the lenders' covenant. */
const LBO_MAX_LEVERAGE = 6.0;
/** Weeks a sponsor holds before it will consider an exit. */
const MIN_HOLD_WEEKS = 78;
/**
 * THE FUND'S LIFE, and why a sponsor sells to another sponsor at all.
 *
 * A closed-end fund has a term: it draws capital, holds, and must return that capital to its LPs
 * by the end of it. That is a CONTRACT TERM, the same kind of primitive as a mortgage's or a
 * CDS's tenor, and it is the whole reason sponsor-to-sponsor sales happen in reality — the seller
 * is out of time, not out of conviction. Without it a holding could only leave by listing, and
 * names that as "the half of the capital-recycling loop a listing cannot provide": when the
 * public market is shut, a portfolio in this model simply never turned over.
 */
const PE_FUND_LIFE_WEEKS = 10 * 52;
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
 * `cashLocal` instead measured 0.01B across every sponsor in the world and made an LBO structurally
 * impossible; HC4 built `lpCommitments` for exactly this and left the call to HC6.
 */
export function dryPowderLocal(
  v2: V2World,
  sponsor: InstitutionalEntity,
  lpById: ReadonlyMap<EntityId, InstitutionalEntity>
): number {
  return (sponsor.peFund?.lpCommitments ?? []).reduce((sum, c) => {
    const undrawnLocal = Math.max(0, c.committedLocal - c.drawnLocal);
    const lp = lpById.get(c.lpEntityId);
    return sum + Math.min(undrawnLocal, Math.max(0, lp ? entityCashOf(v2, lp) : 0));
  }, 0);
}

/**
 * The CAPITAL CALL itself: real money leaves the named LPs' balance sheets pro rata to what each
 * has left to give, and the fund's drawn capital rises by the same amount. Returns what was
 * actually raised — a call that comes up short is a deal that does not close.
 */
/**
 * §3.13c — WHY A CAPITAL CALL READS THE SPONSOR'S MONEY, AND WHEN THAT STOPS BEING RIGHT.
 *
 * The other obligations in this model now carry their own denomination, because their payment
 * sites were re-deriving it from a proxy (a `SecurityLoan` from the issuer's region with a
 * fallback that threw; a `DerivativeContract` from a `regionId` that means something different in
 * each market). An LP commitment is not that case: a commitment is to the FUND and is payable in
 * the fund's money, so `obligationCurrencyOf(sponsor)` is the fact rather than a stand-in for it,
 * and a `currency` field here would be a second representation of the fund's own currency
 * (rule 4) with exactly one possible value.
 *
 * What makes it one value is a filter in the seed: `simulation/initialization.ts` matches LPs with
 * `e.region === regionId`, so every commitment is same-region by construction. **The day a
 * cross-border LP exists the commitment needs its own denomination** — the money is agreed at
 * subscription and the LP has to buy it — and this is the condition to watch for.
 */
/** §3.13-READ D9: the LP index is the CALLER'S — this is called once per deal inside the region
 *  loop, and it was re-indexing every institution in the world on each call, from an index the
 *  caller had already built two lines above its own loop. */
function callCapitalLocal(
  ctx: WeeklyStepContext,
  lpById: ReadonlyMap<string, InstitutionalEntity>,
  sponsorId: EntityId,
  requestedLocal: number
): number {
  const sponsor = ctx.updatedInstitutionalEntities.find((e) => e.id === sponsorId);
  if (!sponsor?.peFund || !(requestedLocal > 0)) return 0;
  const capacity = sponsor.peFund.lpCommitments.map((c) => {
    const lp = lpById.get(c.lpEntityId);
    // An LP's real budget is its cash PLUS what it has already committed to pay or is due
    // to receive at this week's settlement — the calls below are payments now, so without the
    // pending term two calls in one week could draw the same dollar twice.
    // §1.19: the one statement of what an institution can spend — which nets the stock-loan
    // collateral it is only HOLDING. This copy did not, so an LP could answer a capital call with
    // money that belongs to whoever it borrowed the stock from.
    const lpBudgetLocal = lp ? institutionSpendableLocal(ctx, lp) : 0;
    return {
      commitment: c,
      availableLocal: Math.min(Math.max(0, c.committedLocal - c.drawnLocal), lpBudgetLocal),
    };
  });
  const totalAvailableLocal = capacity.reduce((a, x) => a + x.availableLocal, 0);
  const calledLocal = Math.min(requestedLocal, totalAvailableLocal);
  if (!(calledLocal > 0)) return 0;

  capacity.forEach((x) => {
    if (!(x.availableLocal > 0)) return;
    const shareLocal = calledLocal * (x.availableLocal / totalAvailableLocal);
    x.commitment.drawnLocal += shareLocal;
    // The call is a PAYMENT — LP to fund — where it used to be a bare debit of the LP
    // with no credit to anyone, so the buy side of every sponsor-to-sponsor deal paid twice and
    // one purchase price was destroyed per deal. Both legs live in the journal now.
    pay(ctx, {
      payer: { kind: 'INSTITUTION', id: x.commitment.lpEntityId },
      payee: { kind: 'INSTITUTION', id: sponsorId },
      amount: shareLocal,
      currency: obligationCurrencyOf(ctx.v2, { kind: 'INSTITUTION', id: sponsorId }),
      reason: 'private fund capital call',
    });
  });
  return calledLocal;
}

/**
 * A DISTRIBUTION back to the LPs — recap proceeds and exit proceeds are not the fund's to keep.
 * The cash returns pro rata to drawn capital and reduces it, which is what a recallable
 * distribution really is: the commitment becomes available to deploy again.
 */
function distributeToLps(ctx: WeeklyStepContext, sponsorId: EntityId, amountLocal: number): void {
  const sponsor = ctx.updatedInstitutionalEntities.find((e) => e.id === sponsorId);
  if (!sponsor?.peFund || !(amountLocal > 0)) return;
  const totalDrawnLocal = sponsor.peFund.lpCommitments.reduce((a, c) => a + Math.max(0, c.drawnLocal), 0);
  if (!(totalDrawnLocal > 0)) return;
  // A FUND DISTRIBUTES WHAT IT HAS. `callCapitalLocal` above already bounds a call by the LPs'
  // real cash — "a call that comes up short is a deal that does not close" — and the
  // distribution side never got the same treatment. So a sponsor wired recap and exit proceeds
  // against `drawnLocal` alone and went negative: MEASURED, PEF1 paid 0.495B out of a 0.000B
  // balance at week 12 and carried the same -0.50B for the next forty weeks, the single largest
  // violation family in the 60-week harness. This is not a clamp on a price: it is the
  // constraint itself, and it is one side of an asymmetry rather than a new rule. What cannot be
  // wired stays undistributed, which leaves the commitment drawn — which is what an unpaid
  // distribution actually is.
  // step 3 — the rule is on the fund (domain/fund.ts), where the CALL side has always
  // had it: a fund moves what it has. measured what its absence cost — PEF1 wired 0.495B
  // out of a 0.000B account and carried -0.50B for forty weeks.
  // The fund's payable budget includes what settlement already owes or is owed it.
  // §1.19: same read. This copy dropped the collateral net AND the `max(0, …)` clamp, so a
  // sponsor whose pending settlement was negative handed `distributable` a NEGATIVE budget — the
  // case the paragraph above says this block exists to abolish.
  const sponsorBudgetLocal = institutionSpendableLocal(ctx, sponsor);
  const { payableLocal: paidLocal } = distributable(amountLocal, totalDrawnLocal, sponsorBudgetLocal);
  if (!(paidLocal > 0)) return;
  sponsor.peFund.lpCommitments.forEach((c) => {
    if (!(c.drawnLocal > 0)) return;
    const shareLocal = paidLocal * (c.drawnLocal / totalDrawnLocal);
    c.drawnLocal = Math.max(0, c.drawnLocal - shareLocal);
    // A distribution is a PAYMENT — fund to LP — not a pair of object rebuilds.
    pay(ctx, {
      payer: { kind: 'INSTITUTION', id: sponsorId },
      payee: { kind: 'INSTITUTION', id: c.lpEntityId },
      amount: shareLocal,
      currency: obligationCurrencyOf(ctx.v2, { kind: 'INSTITUTION', id: sponsorId }),
      reason: 'private fund distribution',
    });
  });
}

const ebitdaOf = (c: Company) => Math.max(0, c.ebitda);
const enterpriseValueLocal = (c: Company, evMultiple: number) => evMultiple * ebitdaOf(c);
/** §3.13-READ C1: the ladder is read from the STORE. `totalDebtOf` sums `Company.debtTranches`,
 *  which `core.ts:450` rebuilds once a week after every stage has run — so mid-week it is last
 *  week's ladder, and line 481 below already read the store for the same company in the same
 *  expression. One firm, two debts, four lines apart. */
const equityValueLocal = (v2: V2World, c: Company, evMultiple: number) =>
  Math.max(0, enterpriseValueLocal(c, evMultiple) - ladderTotalLocal(v2, c.id));

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

  // The sponsor's deals go to desks that can still underwrite them, and each award
  // consumes the winner's balance sheet.
  const leadBanks = mandateAllocator(banksOf(ctx.prevActiveFirms, regionId)
    .map((c) => ({
      ticker: c.ticker, bankMarketShare: c.bankMarketShare,
      capacityLocal: (ctx.companyUpdates[c.ticker]?.bankBalanceSheet ?? c.bankBalanceSheet)?.bankEquityLocal ?? 0,
    })));
  // §3.13-BOOK (c-then-2): the ONE builder, for both identities this pass resolves.
  const { companyById: byId, institutionById: lpById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  // One valuation for this region this week: what the public market pays for comparable listed
  // earnings. The purchase price, the exit test and HC4's NAV mark all read it, so a portfolio is
  // never bought on one number and marked on another. No comps at all means no basis on which to
  // price a private company, and therefore no deals this week.
  const markEvMultiple = publicComparableEvMultiple((c) => ladderTotalLocal(ctx.v2, c.id), regionId, ctx.updatedCompanies);
  if (!(markEvMultiple > 0)) return;
  const pendingIssuers = new Set(ctx.primaryOfferingsWorking.map((o) => o.issuerId));
  // §3.13 row 3: the region's loan market level, taken off the LOANS — each borrower's own
  // five-year point on its own loan curve, read from what its paper cleared at. A market with no
  // printed loan has no level, and the sponsor's own recap threshold stands in for one.
  const loanMarketDmBps = (() => {
    const dms = ctx.updatedCompanies
      .filter((c) => c.region === regionId && isActiveCompany(c))
      .map((c) => issuerSpreadAtOnCurve(ctx.v2, reg, c.id, ctx.nextWeek, STANDARD_CORP_TENOR_YEARS, IS_LOAN_ROW)?.spreadBps)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    return dms.length ? dms[Math.floor(dms.length / 2)] : RECAP_DM_THRESHOLD_BPS;
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

    const availablePowderLocal = dryPowderLocal(ctx.v2, sponsor, lpById);

    // ---- HC6a: dividend RECAP when the loan market is open. Real opportunistic supply — the
    // mechanism RVr identified as missing from the float's supply side. ----
    if (loanMarketDmBps < RECAP_DM_THRESHOLD_BPS) {
      const recapTarget = portfolio.find((c) => {
        if (pendingIssuers.has(c.id)) return false;
        const lev = ladderTotalLocal(ctx.v2, c.id) / Math.max(1, ebitdaOf(c));
        return ebitdaOf(c) > 0 && lev < LBO_MAX_LEVERAGE - 1 && nextWeek - (c.lastRecapWeek ?? -999) > 104;
      });
      if (recapTarget) {
        const headroomLocal = (LBO_MAX_LEVERAGE - ladderTotalLocal(ctx.v2, recapTarget.id) / Math.max(1, ebitdaOf(recapTarget))) * ebitdaOf(recapTarget);
        const recapLocal = Math.max(0, headroomLocal * 0.5);
        if (recapLocal > 1e6) {
          ctx.primaryOfferingsWorking.push({
            id: `PO-${recapTarget.id}-${nextWeek}-RECAP`,
            issuerId: recapTarget.id,
            issuerTicker: recapTarget.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeLocal: recapLocal,
            // A recap is discretionary: the sponsor walks if the market prices it wide.
            walkAwayStat: RECAP_DM_THRESHOLD_BPS,
            rateType: 'FLOATING',
            leadBankTicker: leadBanks.pick(recapTarget.id, recapLocal),
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
      return ebitdaOf(c) > 0 && equityValueLocal(ctx.v2, c, markEvMultiple) > 0;
    });
    if (listCandidate) {
      // What the public market pays for a comparable listed name, from real cleared prices.
      const peerEvMultiple = markEvMultiple;
      // What the fund actually paid. A sponsor with no recorded basis (a seeded holding whose
      // purchase predates the simulation) is treated as having bought at the standing mark.
      const entryMultiple = listCandidate.ownership?.entryEvMultiple ?? markEvMultiple;
      if (peerEvMultiple > entryMultiple * IPO_PREMIUM_OVER_ENTRY) {
        const impliedEquityLocal = Math.max(0, peerEvMultiple * ebitdaOf(listCandidate) - ladderTotalLocal(ctx.v2, listCandidate.id));
        // The registry the listing creates, and the price talk that follows from it. The share
        // count comes from the peers' own average price rather than a chosen number, so a listing
        // arrives at the denomination its market actually trades in.
        const peerPrices = ctx.updatedCompanies
          .filter((p) => p.region === regionId && p.listingStatus !== 'PRIVATE' && isActiveCompany(p) && p.stockPrice > 0)
          .map((p) => p.stockPrice)
          .sort((a, b) => a - b);
        const peerPrice = peerPrices.length ? peerPrices[Math.floor(peerPrices.length / 2)] : 0;
        const postIssueShares = Math.max(1, Math.round(impliedEquityLocal / Math.max(1, peerPrice)));
        const talkPerShare = impliedEquityLocal / postIssueShares;
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
          sizeLocal: sharesOffered,
          // The sponsor pulls the deal below its private hold value — a weak book is a pulled
          // IPO, which is exactly what happens in reality.
          walkAwayStat: talkPerShare / IPO_PREMIUM_OVER_ENTRY,
          indicativeStat: talkPerShare,
          postIssueSharesOutstanding: postIssueShares,
          leadBankTicker: leadBanks.pick(listCandidate.id, sharesOffered * talkPerShare),
          announcedWeek: nextWeek,
          peDeal: { kind: 'IPO', sponsorId: sponsor.id },
        } as PrimaryOffering);
        pendingIssuers.add(listCandidate.id);
      }
    }

    // ---- G5: EXIT BY SALE. The fund is out of TIME, which is what actually forces most private
    // exits — a closed-end fund must return its LPs' capital by the end of its term, and when the
    // public market will not take the company it sells it to a sponsor that still has capital to
    // deploy. That is the capital-recycling loop, and a listing alone cannot close it: with the
    // IPO test unmet a holding never left the portfolio at all.
    //
    // The price is the same one mark, sale and purchase all read this week (`markEvMultiple`), so
    // a company is never sold on one number and marked on another. The buyer pays with its own
    // called capital, the seller distributes the proceeds to ITS LPs, and the company's DEBT
    // stays where it is — which is what makes this a change of owner rather than a refinancing.
    const saleCandidate = portfolio.find((c) => {
      if (pendingIssuers.has(c.id) || c.listingStatus !== 'PRIVATE') return false;
      if (nextWeek - (c.ownership?.acquiredWeek ?? 0) < PE_FUND_LIFE_WEEKS) return false;
      return ebitdaOf(c) > 0 && equityValueLocal(ctx.v2, c, markEvMultiple) > 0;
    });
    if (saleCandidate) {
      const priceLocal = equityValueLocal(ctx.v2, saleCandidate, markEvMultiple);
      // Whichever OTHER sponsor in this region can actually fund it. A buyer that cannot pay is
      // not a buyer, so a company nobody can afford stays where it is — an illiquid exit window,
      // which is a real thing for a fund at the end of its life.
      const buyer = sponsors.find((s2) =>
        s2.id !== sponsor.id && !s2.isDefaulted
        && dryPowderLocal(ctx.v2, s2, lpById) >= priceLocal);
      if (buyer && priceLocal > 1e6) {
        const drawnLocal = callCapitalLocal(ctx, lpById, buyer.id, priceLocal);
        if (drawnLocal >= priceLocal * 0.999) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: buyer.id },
            payee: { kind: 'INSTITUTION', id: sponsor.id },
            amount: priceLocal,
            currency: obligationCurrencyOf(ctx.v2, { kind: 'INSTITUTION', id: sponsor.id }),
            reason: 'private company sold sponsor-to-sponsor',
          });
          distributeToLps(ctx, sponsor.id, priceLocal);
          sponsor.peFund!.portfolioCompanyIds = sponsor.peFund!.portfolioCompanyIds
            .filter((id) => id !== saleCandidate.id);
          buyer.peFund!.portfolioCompanyIds = [...buyer.peFund!.portfolioCompanyIds, saleCandidate.id];
          saleCandidate.ownership = {
            founderPct: saleCandidate.ownership?.founderPct ?? 0,
            ...(saleCandidate.ownership ?? {}),
            peSponsorId: buyer.id,
            acquiredWeek: nextWeek,
            entryEvMultiple: markEvMultiple,
          };
          pendingIssuers.add(saleCandidate.id);
          ctx.newsItems.push({
            id: `pe-sale-${saleCandidate.id}-${nextWeek}`,
            week: nextWeek,
            title: `${saleCandidate.name} Changes Hands in Sponsor-to-Sponsor Sale`,
            description: `${sponsor.name} sold ${saleCandidate.name} to ${buyer.name} at ${markEvMultiple.toFixed(1)}x EBITDA at the end of its fund's term.`,
            category: 'CREDIT',
            impactBadge: '[PRIVATE EQUITY]',
            impactRegion: regionId,
            impactSector: saleCandidate.sector,
            affectedTicker: saleCandidate.ticker,
            urgent: false,
          } as NewsItem);
        }
      }
    }

    // ---- HC6b: a NEW LBO when the fund has dry powder and a target it can lever. ----
    if (availablePowderLocal > 1e6) {
      const owned = new Set(sponsor.peFund!.portfolioCompanyIds);
      const target = ctx.updatedCompanies.find((c) =>
        c.region === regionId && c.listingStatus === 'PRIVATE' && isActiveCompany(c)
        && !owned.has(c.id) && !c.ownership?.peSponsorId && !pendingIssuers.has(c.id)
        && ebitdaOf(c) > 0
        && ladderTotalLocal(ctx.v2, c.id) / Math.max(1, ebitdaOf(c)) < LBO_MAX_LEVERAGE - 2
        && equityValueLocal(ctx.v2, c, markEvMultiple) > 0
        && equityValueLocal(ctx.v2, c, markEvMultiple)
             - Math.min(equityValueLocal(ctx.v2, c, markEvMultiple), Math.max(0, LBO_MAX_LEVERAGE * ebitdaOf(c) - ladderTotalLocal(ctx.v2, c.id)))
             < availablePowderLocal
      );
      if (target) {
        const priceLocal = equityValueLocal(ctx.v2, target, markEvMultiple);
        // As far as the covenant goes; the loan market decides whether it funds it.
        const debtLocal = Math.min(
          priceLocal,
          Math.max(0, LBO_MAX_LEVERAGE * ebitdaOf(target) - ladderTotalLocal(ctx.v2, target.id))
        );
        const equityLocal = priceLocal - debtLocal;
        if (equityLocal > 0 && equityLocal <= availablePowderLocal && debtLocal > 1e6) {
          // The financing is a REAL primary offering: if the loan market will not fund it at a
          // level the sponsor accepts, the deal does not happen.
          ctx.primaryOfferingsWorking.push({
            id: `PO-${target.id}-${nextWeek}-LBO`,
            issuerId: target.id,
            issuerTicker: target.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeLocal: debtLocal,
            walkAwayStat: RECAP_DM_THRESHOLD_BPS * 2,
            rateType: 'FLOATING',
            leadBankTicker: leadBanks.pick(target.id, debtLocal),
            announcedWeek: nextWeek,
            peDeal: { kind: 'LBO', sponsorId: sponsor.id, equityLocal },
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
    if (availablePowderLocal > 1e6) {
      const owned = new Set(sponsor.peFund!.portfolioCompanyIds);
      const riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04;
      const listedTarget = ctx.updatedCompanies.find((c) => {
        if (c.region !== regionId || !isActiveCompany(c) || c.listingStatus === 'PRIVATE') return false;
        if (c.isBankEntity || c.isInstitutionalEntity) return false;
        if (owned.has(c.id) || c.ownership?.peSponsorId || pendingIssuers.has(c.id)) return false;
        if (!(ebitdaOf(c) > 0) || !(c.sharesOutstanding > 0) || !(c.stockPrice > 0)) return false;
        return ladderTotalLocal(ctx.v2, c.id) / Math.max(1, ebitdaOf(c)) < LBO_MAX_LEVERAGE - 2;
      });
      if (listedTarget) {
        // What the most patient liquid-market holder thinks a share is worth — the price at which
        // the last seller is willing to tender. Never below the printed price: nobody sells the
        // market a discount.
        const patientValuePerShare = companyFairValuePerShare(
          listedTarget, cashOf(ctx.v2, listedTarget), riskFreeRate, PATIENT_HOLDER_REQUIRED_RETURN,
          ladderTotalLocal(ctx.v2, listedTarget.id)
        );
        const takeoutPricePerShare = Math.max(listedTarget.stockPrice, patientValuePerShare);
        const takeoutValueLocal = takeoutPricePerShare * listedTarget.sharesOutstanding;
        const debtLocal = Math.min(
          takeoutValueLocal,
          Math.max(0, LBO_MAX_LEVERAGE * ebitdaOf(listedTarget) - ladderTotalLocal(ctx.v2, listedTarget.id))
        );
        const equityLocal = takeoutValueLocal - debtLocal;
        // The sponsor's underwriting test: cash the business throws off after servicing the whole
        // post-deal stack, against the cheque it has to write. Its hurdle is higher than any
        // liquid holder's, which is why it needs the leverage to get there.
        const allInDebtLocal = ladderTotalLocal(ctx.v2, listedTarget.id) + debtLocal;
        // §3.13: the target's own five-year credit, read off its own paper; a private name with
        // nothing printed is underwritten at the sponsor's recap threshold, which is the price the
        // loan market has actually quoted this kind of deal.
        const debtCostAnnual = reg.policyRate
          + (issuerSpreadAtOnCurve(ctx.v2, reg, listedTarget.id, ctx.nextWeek, STANDARD_CORP_TENOR_YEARS)?.spreadBps
            ?? RECAP_DM_THRESHOLD_BPS) / 10000;
        const leveredCashFlowLocal = ebitdaOf(listedTarget) - allInDebtLocal * debtCostAnnual;
        const clearsHurdle =
          equityLocal > 0 && leveredCashFlowLocal / equityLocal > REQUIRED_RETURN_ON_CAPITAL.PRIVATE_EQUITY;
        if (clearsHurdle && equityLocal <= availablePowderLocal && debtLocal > 1e6) {
          ctx.primaryOfferingsWorking.push({
            id: `PO-${listedTarget.id}-${nextWeek}-TAKEPRIVATE`,
            issuerId: listedTarget.id,
            issuerTicker: listedTarget.ticker,
            region: regionId,
            instrumentType: 'LEVERAGED_LOAN',
            purpose: 'OPPORTUNISTIC',
            sizeLocal: debtLocal,
            walkAwayStat: RECAP_DM_THRESHOLD_BPS * 2,
            rateType: 'FLOATING',
            leadBankTicker: leadBanks.pick(listedTarget.id, debtLocal),
            announcedWeek: nextWeek,
            peDeal: { kind: 'TAKE_PRIVATE', sponsorId: sponsor.id, equityLocal, takeoutPricePerShare },
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
  // §3.13-READ D9: once for the whole pass, not once per deal inside `callCapitalLocal`.
  const { institutionById: lpById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  ctx.primarySettlements.forEach((settlement) => {
    const deal = settlement.offering.peDeal;
    if (!deal) return;
    const comp = ctx.updatedCompanies.find((c) => c.id === settlement.offering.issuerId);
    if (!comp) return;
    const failed = settlement.withdrawn || settlement.marketTakeLocal <= 0;

    if (deal.kind === 'LBO') {
      if (failed) return; // financing failed: the deal simply does not happen
      const equityLocal = deal.equityLocal ?? 0;
      // The cheque is real money called from the fund's LPs. A call that comes up short — an LP
      // that cannot fund what it committed — is a deal that does not close, so nothing is
      // half-drawn: what was raised goes back before the deal is abandoned.
      const calledLocal = callCapitalLocal(ctx, lpById, deal.sponsorId, equityLocal);
      if (calledLocal < equityLocal * 0.999) {
        if (calledLocal > 0) distributeToLps(ctx, deal.sponsorId, calledLocal);
        return;
      }
      // The SELLERS are paid. A private firm's owners are its founders, who live in the household
      // sector: the money leaves the fund and arrives as real household deposits, so the purchase
      // price is not destroyed on its way out of the institutional book.
      const sellerRegion = ctx.updatedRegions[comp.region];
      if (sellerRegion?.householdState) {
        // C4: a PAYMENT. The LPs' calls above landed on the sponsor's own book, so the
        // sponsor is the one payer of the purchase price and the founders' household sector is
        // the payee — settlement credits the deposit and records the banks' T+1 leg itself.
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id: deal.sponsorId },
          payee: { kind: 'HOUSEHOLD', region: comp.region },
          amount: calledLocal,
          currency: currencyOf(comp.region),
          reason: 'take-private proceeds to the founding households',
        });
        sellerRegion.householdState.netWorthLocal += calledLocal;
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
        entryEvMultiple: comp.ebitda > 0 ? (ladderTotalLocal(ctx.v2, comp.id) + equityLocal) / comp.ebitda : 0,
      };
      return;
    }

    if (deal.kind === 'TAKE_PRIVATE') {
      if (failed) return; // the loan market would not fund it: the company stays public
      const equityLocal = deal.equityLocal ?? 0;
      const pricePerShare = deal.takeoutPricePerShare ?? 0;
      const shares = comp.sharesOutstanding;
      if (!(pricePerShare > 0) || !(shares > 0)) return;
      const calledLocal = callCapitalLocal(ctx, lpById, deal.sponsorId, equityLocal);
      if (calledLocal < equityLocal * 0.999) {
        if (calledLocal > 0) distributeToLps(ctx, deal.sponsorId, calledLocal);
        return;
      }
      // The tender settles: every public shareholder is PAID for its stake and the register is
      // extinguished. This is the leg the equity market feels — institutions hand over shares and
      // receive cash they then have to put somewhere, which is why a take-private is a bid under
      // the whole market and not just under its target.
      const takeoutValueLocal = pricePerShare * shares;
      settleCorporateActionOnHolders(ctx, comp.id, 'EQUITY', shares, 0);
      payHoldersCash(ctx, comp.id, 'EQUITY', takeoutValueLocal);
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
      comp.sharesOutstanding = 0;
      comp.ownership = {
        founderPct: 0, peSponsorId: deal.sponsorId, peSponsorPct: 1, acquiredWeek: nextWeek,
        entryEvMultiple: comp.ebitda > 0 ? (ladderTotalLocal(ctx.v2, comp.id) + takeoutValueLocal) / comp.ebitda : 0,
      };
      if (process.env.CASH_LEDGER === '1') {
        comp.lastCashLedger = [
          ...(comp.lastCashLedger ?? []),
          { label: 'taken private: public register bought out', amountLocal: 0 },
        ];
      }
      return;
    }

    if (deal.kind === 'RECAP') {
      if (failed || settlement.proceedsLocal <= 0) return;
      // The recap dividend is a PAYMENT — the company (whose bond issue primary
      // settlement already paid it for) pays its sponsor — not a direct cash write on each side.
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: comp.ticker },
        payee: { kind: 'INSTITUTION', id: deal.sponsorId },
        amount: settlement.proceedsLocal,
        currency: currencyOf(comp.region),
        reason: 'dividend recap to sponsor',
      });
      // A recap's proceeds belong to the investors, not the manager: they go straight back out.
      distributeToLps(ctx, deal.sponsorId, settlement.proceedsLocal);
      return;
    }

    // IPO: the listing flag flips, the registry is real, the sponsor sells down.
    const shares = settlement.offering.postIssueSharesOutstanding ?? 0;
    if (failed || settlement.proceedsLocal <= 0 || shares <= 0) {
      // A pulled listing leaves the company private: the price talk 07e printed against its
      // debut instrument is not a price for a company nobody can buy.
      comp.stockPrice = 0;
      return;
    }
    comp.listingStatus = 'PUBLIC';
    comp.sharesOutstanding = shares;
    comp.stockPrice = Number(settlement.clearedStat.toFixed(2));
    // The direct `comp.cash += proceeds` that stood here was a DOUBLE CREDIT — primary
    // settlement already pays the issuer for the whole deal by instruction (the CCP for the
    // book's take, the lead for the residual). One payment, one arrival.
    // THE SPONSOR KEEPS WHAT IT DID NOT SELL, AS REAL SHARES. The listing places a quarter of
    // the company; the rest is still the fund's, and it now lives on the register like any other
    // institution's equity. Written as a flat 70% on the ownership record instead — a number
    // unrelated to what was actually placed — the retained stake left the fund's assets with no
    // sale and no cash (`sponsorPortfolioLocal` reads the portfolio list, which this pass empties),
    // and, unregistered, the same shares were counted as the public float and credited to
    // households. Ownership destroyed at one end and re-granted at the other.
    const offeredShares = settlement.offering.sizeLocal;
    const retainedShares = Math.max(0, shares - offeredShares);
    if (retainedShares > 0) {
      issueHolding(ctx.v2,
        { kind: 'COMPANY', ticker: comp.ticker },
        { kind: 'INSTITUTION', id: deal.sponsorId },
        {
          instrumentType: 'EQUITY', instrumentId: equityInstrumentId(comp.id), issuerRegion: comp.region as RegionId,
          valueLocal: retainedShares * comp.stockPrice, shares: retainedShares,
        },
        'ipo: the sponsor retains its unsold stake');
      bumpRegister(ctx);
    }
    comp.ownership = { ...(comp.ownership ?? { founderPct: 0.05 }), peSponsorPct: shares > 0 ? retainedShares / shares : 0 };
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
/**
 * W6 (B) — A FIRM IS BORN BY WIRES. The generator sketches a newborn with a debt base
 * nobody lent it; here that debt becomes what a private newborn's debt is — a FACILITY from its
 * home bank, priced off its own default probability at the bank's hurdle — issued by wire, booked
 * on the bank as a loan, and its proceeds paid to the firm. The pool's carve-out (written by the
 * caller) is the founders' contribution; the loan is the rest of the opening balance. Nothing
 * appears on a ladder from nowhere.
 */
function fundNewbornDebt(c: Company, reg: Region, ctx: WeeklyStepContext, nextWeek: number): void {
  const seeded = c.debtTranches ?? [];
  const debtLocal = seeded.reduce((a, t) => a + t.principalLocal, 0);
  c.debtTranches = [];
  if (!(debtLocal > 1) || !c.homeBankTicker) return;
  const bank = ctx.updatedCompanies.find((b) => b.ticker === c.homeBankTicker);
  const marginBps = facilityMarginBpsFor(ctx.v2, c, reg, bank);
  const tranche: DebtTranche = {
    id: birthFacilityTrancheId(c.id, nextWeek),
    principalLocal: Math.round(debtLocal),
    rateType: 'FLOATING',
    floatingMarginBps: marginBps,
    originationWeek: nextWeek,
    maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
    seniority: 'SENIOR',
    isBankFacility: true,
    facilityBankTicker: c.homeBankTicker,
  };
  issueTranche(ctx.v2, { id: c.id, ticker: c.ticker, region: c.region }, tranche, 'firm birth: facility lent by the home bank');
  pay(ctx, {
    payer: { kind: 'BANK_CREDIT', ticker: c.homeBankTicker },
    payee: { kind: 'COMPANY', ticker: c.ticker },
    amount: tranche.principalLocal,
    currency: currencyOf(c.region),
    reason: 'firm birth: facility proceeds',
  });
  c.debtTranches = [tranche];
}

export function runFirmBirthsForRegion(
  regionId: RegionId,
  reg: Region,
  ctx: WeeklyStepContext,
  nextWeek: number,
  generate: (regionId: RegionId, seeds: import('../../bootstrap/private-firms').PrivateFirmSeed[],
             policyRate: number, tickers: Set<Ticker>, names: Set<string>) => Company[]
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
    const seg = c.smePoolIndustry;
    if (seg) namedBySegment.set(seg, (namedBySegment.get(seg) ?? 0) + c.annualRevenue);
  });
  // ENTRY GOES WHERE THE EXPECTED PROFIT OF ENTERING IS: unserved demand TIMES the
  // margin earned serving it. The pool-vs-named ratio was the demand half alone, so entrants
  // chased size regardless of profitability; the pool's own measured margin is the other half,
  // and their PRODUCT needs no coefficient (rule 2). This is what makes category margins
  // mean-revert through entry instead of by assertion.
  // And it goes to EVERY pool where entering pays this quarter, not the one that pays
  // most: one firm per quarter per region was no supply response at all (a 0.4%-of-pool entrant
  // against a 30% shortage). The signal is unchanged — unserved demand × the pool's measured
  // margin, no coefficient — and every pool it is positive for gets an entrant, each a fraction
  // of a percent of its pool, in the order the signal ranks them.
  const candidates = segs
    .map((seg) => ({
      seg,
      ratio: (seg.annualRevenueLocal / Math.max(1, namedBySegment.get(seg.industry) ?? 1))
        * Math.max(0, seg.marginPct ?? 0),
    }))
    .filter((x) => x.seg.annualRevenueLocal > 0 && x.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);
  if (candidates.length === 0) return [];

  const tickers = new Set(ctx.updatedCompanies.map((c) => c.ticker));
  const names = new Set(ctx.updatedCompanies.map((c) => c.name));
  const born: Company[] = [];
  candidates.forEach(({ seg }) => {
    // Born SMALL — a new firm is a fraction of a percent of its pool, which is what a real
    // entrant is. Its leverage is what the SME pools actually carry (G2's serviceable ceiling),
    // so it enters the credit universe at a realistic rung rather than a chosen rating.
    const revenueLocal = seg.annualRevenueLocal * 0.004;
    if (revenueLocal < 1e6) return;
    const employees = Math.max(10, Math.round(seg.employment * (revenueLocal / Math.max(1, seg.annualRevenueLocal))));
    // SEG-D: the newborn sells what its pool sells — the pool's own measured mix by sub-unit, or
    // (before the pool has measured receipts) its industry's sub-units weighted by the region's
    // real demand for each, so a new firm opens where there is business to win.
    const measuredMix = seg.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
    const measuredTotalLocal = Object.values(measuredMix).reduce((a, v) => a + Math.max(0, v), 0);
    const productMixBySubUnit: Record<string, number> = measuredTotalLocal > 0
      ? { ...measuredMix }
      : Object.fromEntries(smePoolSubUnits(seg.industry)
        .map((su) => [su.unitId, reg.categoryDemand[su.unitId]?.demandLevelAnnualLocal ?? 0]));

    const newborn = generate(regionId, [{
      industry: seg.industry,
      productMixBySubUnit,
      annualRevenueLocal: revenueLocal,
      ebitdaMargin: seg.marginPct,
      leverage: 2.5,
      sponsorStyle: random() < 0.5,
      employeeCount: employees,
    }], reg.policyRate, tickers, names);
    if (newborn.length === 0) return;
    newborn.forEach((c) => { tickers.add(c.ticker); names.add(c.name); });

    // Conservation: the pool loses exactly what the firm gains.
    seg.annualRevenueLocal = Math.max(0, seg.annualRevenueLocal - revenueLocal);
    seg.employment = Math.max(1, seg.employment - employees);
    // The opening balance too. A born firm's working capital used to be conjured by the
    // generator; now it is CARVED from the pool's own money, as a payment through settlement
    // (this stage runs after the week's cutoff, so it lands next cycle — the firm is born with
    // its opening balance in transit, and the economy's total cash never moved).
    newborn.forEach((c) => {
      // W6: the home bank's facility (fundNewbornDebt, below) funds the opening balance
      // first; the pool carves out the founders' remainder.
      const loanLocal = (c.debtTranches ?? []).reduce((a, t) => a + t.principalLocal, 0);
      const openingCashLocal = Math.min(Math.max(0, openingCashOf(c) - loanLocal), Math.max(0, poolCashOf(ctx.v2, regionId, seg.industry)));
      if (openingCashLocal > 0) {
        pay(ctx, {
          payer: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
          payee: { kind: 'COMPANY', ticker: c.ticker },
          amount: openingCashLocal,
          currency: currencyOf(regionId),
          reason: 'firm birth: opening balance carved from pool',
        });
      }
      born.push(c);
    });
  });
  if (born.length === 0) return [];
  // Every firm banks somewhere. A company born without a house bank held its cash outside the
  // banking system entirely — its balance never reached any bank's funding, so the money existed
  // on the firm and nowhere else (rule 4's "1$ is 1$"). Measured: 12 unbanked firms at seed
  // growing with every birth cohort. The relationship is chosen the same way the seed chooses
  // it, so a born firm enters the world banked like every other.
  const banksForRelationship = mandateAllocator(banksOf(ctx.updatedCompanies, regionId)
    .map((b) => ({
      ticker: b.ticker, bankMarketShare: b.bankMarketShare,
      capacityLocal: (ctx.companyUpdates[b.ticker]?.bankBalanceSheet ?? b.bankBalanceSheet)?.bankEquityLocal ?? 0,
    })));
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
      const lineLocal = l.revenueShare * c.annualRevenue;
      const marketLocal = (regionSalesBySubUnit.get(l.subUnitId) ?? 0) + lineLocal;
      l.categoryMarketShare = marketLocal > 0 ? Number((lineLocal / marketLocal).toFixed(6)) : 0;
    });
  });

  born.forEach((c) => {
    c.bornWeek = nextWeek;
    if (!c.homeBankTicker) {
      c.homeBankTicker = banksForRelationship.pick(c.id, Math.max(0, openingCashOf(c)));
    }
    // §3.13-BOOK (c-then-2): the `ctx.issuerTickerById?.set(c.id, c.ticker)` that stood here is
    // GONE with the mirror it maintained. It existed because that map was built once at context
    // creation, so a firm born mid-week was invisible to every coupon and corporate-action
    // payment that week and the money flowed payer-less into the unbacked ledger. `core.ts:323`
    // pushes a newborn onto `updatedCompanies` in this same pass, and the readers now index THAT
    // — so the newborn is found with no registration step, which is the invariant the mirror
    // could only approximate by hand at every birth site.
    fundNewbornDebt(c, reg, ctx, nextWeek);
  });
  return born;
}
