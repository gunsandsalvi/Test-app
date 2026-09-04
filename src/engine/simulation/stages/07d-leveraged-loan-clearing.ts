/**
 * Stage 7d: Leveraged Loan Real Clearing
 *
 * Foundational correction (Wall Street): a loan's price must be the actual result of real supply
 * and demand — exactly like corporate bonds, but a genuinely different real market. Floating-rate
 * leveraged loans are bought predominantly by CLOs and loan-fund vehicles (an asset-manager
 * product), not the same bond-fund investor base that buys an issuer's fixed-rate paper — insurers
 * and pension funds barely touch broadly syndicated loans directly in reality. See
 * AssetAllocationTarget.loanPct (carved out of each entity's total corporate-credit appetite,
 * split from corpBondPct at initialization).
 *
 * §3.13 row 3 — THE INSTRUMENT IS THE LOAN AND WHAT CLEARS IS ITS PRICE, the same three-part
 * correction row 1 made to the bond book (read that header; this one states only what is the
 * LOAN's own):
 *
 *   - a DISCOUNT MARGIN is not a price. The engine valued a `YIELD_LIKE` fill at 1, so a unit of
 *     loan par changed hands at a dollar whatever the market said, and `pricePar` was a price
 *     LINEARISED out of the cleared margin (`100 − ΔDM × duration × 100`) — `bond.md` N7.b's
 *     forbidden direction, running, and reaching the loan index and the player's book;
 *   - an ISSUER is not a piece of paper, so the register's tranche rows had to be invented from
 *     an issuer-level fill by a split that is now deleted (§9.13-CREDIT row 4);
 *   - and one margin per borrower is no term structure, for the same reason: the capital a
 *     position consumes and the distressed bid's discount are both the PAPER's own duration's.
 *
 * `Company.leveragedLoan` is GONE with the same reasoning that deleted `oasSpreadBps`. Everything
 * it carried was one of three things: a price or spread, which is the paper's; a duplicate of what
 * the ladder already states (its quoted margin, its tenor); or a constant (its lien, its reference
 * label). A borrower's loan market is now its own LOAN CURVE, read off its own loans
 * (`credit-price.ts:issuerSpreadAtOnCurve` with `IS_LOAN_ROW`), and the structural relationship to
 * its bonds lives where it belongs — in what a first-lien holder's economics ask for, not in a
 * fixed multiple between two statistics.
 *
 * Banks play the dealer role (loanDealerInventory) exactly as they do for corporate bonds — real
 * market-making on the syndicated/traded portion, distinct from a bank's own real business loan
 * book (businessLoanBookLocal), which is driven by real lending activity, not a portfolio
 * allocation decision this engine models.
 *
 * Must run after 07b (a debut loan is struck off the issuer's own cleared bonds) and before
 * stage 8, which reads this book's cleared prices as already-real values.
 */

import { hedgeFundStrategyProfile } from '../../../domain/institution-profiles';
import { InstrumentId } from '../../../domain/ids';
import { GameState, RegionId, ItemizedHolding, Company, PrimaryOffering } from '../../../types';
import { ensureV2, V2World } from '../../../engine2/world';
import { ladderRowsOf, issuerIdOf, trancheScheduleOf, trancheIdOf } from '../../../engine2/tranches';
import { setClearedPrice, clearedPriceOf } from '../../../engine2/prices';
import { primaryTrancheId, STANDARD_CORP_TENOR_YEARS } from '../../../domain/primary-market';
import { issuerSpreadAtOnCurve, IS_LOAN_ROW } from '../../credit-price';
import { isActiveCompany, accruedPerFace, defaultPeriodWeeks, banksOf } from '../../../domain/company';
import { priceFromSpreadBps } from '../../../domain/pricing';
import type { PaperTerms } from '../../../domain/pricing';
import {
  computeReservationSpreadBps,
  fullSizeSpreadRangeBpsOf,
  maxOverweightMultipleOf,
  computeDistressedReservationSpreadBps,
  spreadRiskCapitalChargeRate,
  entityRequiredReturn,
} from './asset-allocation';
import { computeAnnualDefaultProbability, creditRecoveryRate, moveCorporateAccrued } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetLocal } from './institutional-balance-sheet';
import { institutionUnsettledLessCollateralLocal, institutionSpendableLocal, PartyRef } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, accruedOnFills, participantPartyOf } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, deskTickersOf, totalDeskCapacityLocal } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { openDemandStaging, claimDemandRow, setDemand, clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<InstrumentId, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/derivatives/classes/fx-forward';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { reconcileHolderPrincipal } from './holder-paydown';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';

/**
 * Senior-secured first-lien loans trade at a real, structural discount to the same issuer's
 * unsecured bond spread — collateral and seniority mean less loss given default. It reaches the
 * market through the HOLDERS' economics (a lower expected loss and a lower capital charge on the
 * same issuer's credit), never as a multiple applied to one statistic to make another.
 */
const SENIOR_LIEN_DISCOUNT = 0.85;
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['leveraged loan'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'leveraged loan';

/**
 * The ladder rows this book prices — an issuer's own syndicated FLOATING paper, the same three
 * flags the register's LEVERAGED_LOAN rows name, in ONE place.
 *
 * G2: bank FACILITIES (revolvers, maintenance bridges) are excluded — they are loans on a named
 * bank's itemized book, not syndicated paper this market can hold. Counting them here was the §6
 * double-count: the same principal on the bank book AND in institutional holdings, expensed once
 * by the issuer and received twice.
 */
const isLoanRow = IS_LOAN_ROW;

function floatingDebtLocal(v2: V2World, comp: Company): number {
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if (isLoanRow(S.flags[r])) sum += S.principalLocal[r];
  }
  return sum;
}

// §3.18's `07d:86-88` is GONE with the issuer instrument: `loanCreditDurationYears` took a stated
// 5-year tenor off the issuer's quote, multiplied it by a magic 0.7 and clamped it to [1, 4].
// There is nothing left for it to be the duration OF — every schedule below is struck on the
// loan's own remaining life, which its row already states exactly.

export function runLeveragedLoanClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const regionIds = REGION_IDS;
  const week = ctx.nextWeek;

  // SCALE: same per-run memo and hoist as 07b — floatingDebtLocal walks the ladder per call and
  // nothing in this stage changes a ladder.
  const floatingDebtById = new Map<string, number>();
  const floatingDebtOf = (c: Company): number => {
    let v = floatingDebtById.get(c.id);
    if (v === undefined) { v = floatingDebtLocal(v2, c); floatingDebtById.set(c.id, v); }
    return v;
  };
  const loanStockByRegion: Record<string, number> = {};
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    loanStockByRegion[r] = ctx.prevActiveFirms
      .filter((c) => c.region === r).reduce((a, c) => a + floatingDebtOf(c), 0);
  });
  const companyById = new Map<string, Company>();
  ctx.updatedCompanies.forEach((c) => companyById.set(c.id, c));
  ctx.prevActiveFirms.forEach((c) => { if (!companyById.has(c.id)) companyById.set(c.id, c); });
  ctx.prevActivePrivateFirms.forEach((c) => { if (!companyById.has(c.id)) companyById.set(c.id, c); });

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    const curve = reg.zeroRates;

    // WS8/HC6: an issuer bringing its FIRST loan (an LBO financing, a term-out) is a
    // loan-market name the week it launches — it has no float yet, and a book that only knows
    // existing borrowers can never price a debut. Without this the offering sat in the queue
    // forever: the instrument was never in the book, so it was never priced, settled or pulled
    // (measured: 767 offering-weeks of LBO financings stuck, zero deals done).
    const offeringsByIssuerId = new Map<string, PrimaryOffering>();
    ctx.primaryOfferingsWorking.forEach((o) => {
      if (o.region === regionId && o.instrumentType === 'LEVERAGED_LOAN') offeringsByIssuerId.set(o.issuerId, o);
    });

    // HC2: private issuers' loans trade here too — and in reality the leveraged-loan market is
    // MOSTLY private, sponsor-owned issuers; the public-only version was the anomaly.
    // §3.13 row 3: whether a borrower is in this book is a fact about its LADDER — it has
    // syndicated floating paper, or it is bringing some — not about whether a quote object was
    // opened for it. The open/clear bookkeeping that kept `leveragedLoan` in step with that fact
    // is gone with the field.
    const regionActive = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
      (c) => c.region === regionId && isActiveCompany(c)
    );
    if (regionActive.length === 0) return;
    const regionIssuerIds = new Set(regionActive.map((c) => c.id));

    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;
    // The loan's recovery is derived from the same senior-lien discount that scales its expected
    // loss, and the collateral that raises recovery also lowers the capital its spread risk
    // consumes — one lien, both consequences.
    const loanRecoveryRate = 1 - SENIOR_LIEN_DISCOUNT * (1 - creditRecoveryRate(reg));

    const issuers = regionActive.filter((c) => floatingDebtOf(c) > 0 || offeringsByIssuerId.has(c.id));
    const companyTerms = issuers.map((c) => {
      const annualPd = computeAnnualDefaultProbability(v2, c);
      return {
        id: c.id,
        comp: c,
        creditRating: c.creditRating,
        annualPd,
        expectedLossBps: annualPd * (1 - loanRecoveryRate) * 10000,
      };
    });
    const ciById = new Map(companyTerms.map((t, ci) => [t.id, ci]));

    /** §3.13 row 3 — THE INSTRUMENTS ARE THE LOANS, each with its own margin, life and price. */
    type LoanInstrument = {
      id: InstrumentId; ci: number;
      faceLocal: number;
      offeringLocal: number;
      terms: PaperTerms;
      tenorYears: number;
      /** Spread-risk capital against THIS loan's own duration, at the first lien's discount. */
      capitalChargeRate: number;
      distressedReservationBps: number;
      isPrimary: boolean;
    };
    const S = v2.tranches;
    const loans: LoanInstrument[] = [];
    const loanOf = (ci: number, id: InstrumentId, faceLocal: number, offeringLocal: number, terms: PaperTerms, isPrimary: boolean): LoanInstrument => {
      const tenorYears = terms.weeksToMaturity / 52;
      return {
        id, ci, faceLocal, offeringLocal, terms, tenorYears, isPrimary,
        capitalChargeRate: spreadRiskCapitalChargeRate(companyTerms[ci].creditRating, tenorYears) * SENIOR_LIEN_DISCOUNT,
        distressedReservationBps: computeDistressedReservationSpreadBps({
          annualDefaultProbability: companyTerms[ci].annualPd,
          recoveryRate: loanRecoveryRate,
          durationYears: tenorYears,
        }),
      };
    };
    // §3.13b / `bond.md` N9.b — what one unit of face has accrued, at the CURRENT week: the weekly
    // accrual runs in stage 08, after this book, so the ledger these balances move on stands at
    // what it accrued through last week. A floater's coupon is the reference plus its margin.
    const accruedPerFaceById = new Map<string, number>();
    companyTerms.forEach((t, ci) => {
      for (const r of ladderRowsOf(v2, t.id)) {
        if (!isLoanRow(S.flags[r]) || !(S.principalLocal[r] > 0.01)) continue;
        const weeksToMaturity = S.maturityWeek[r] - week;
        // Paper that is due redeems at its face; it does not trade for a price.
        if (!(weeksToMaturity > 0)) continue;
        const id = trancheIdOf(v2, r);
        const marginBps = Number.isNaN(S.floatingMarginBps[r]) ? 0 : S.floatingMarginBps[r];
        const couponRate = reg.policyRate + marginBps / 10000;
        accruedPerFaceById.set(id, accruedPerFace({
          originationWeek: S.originationWeek[r],
          paymentAnchorWeek: Number.isNaN(S.paymentAnchorWeek[r]) ? undefined : S.paymentAnchorWeek[r],
          paymentsPerYear: Number.isNaN(S.paymentsPerYear[r]) ? undefined : S.paymentsPerYear[r],
          rateType: 'FLOATING',
        }, couponRate, state.currentWeek));
        loans.push(loanOf(ci, id, S.principalLocal[r], 0, {
          annualCouponRate: couponRate,
          periodWeeks: trancheScheduleOf(S, r).periodWeeks,
          weeksToMaturity,
        }, false));
      }
    });
    // WS8 — A DEAL IS ITS OWN PIECE OF PAPER, struck at par against the borrower's own loan curve
    // at the tenor it is being syndicated at, its PRICE cleared beside the outstanding stock. A
    // debut has no loan curve, and what a first-lien holder will pay for its credit is what the
    // book is being asked; it launches on its own price talk, which is what price talk is for.
    const primaryTermsById = new Map<string, { marginBps: number; maturityWeek: number }>();
    offeringsByIssuerId.forEach((o, issuerId) => {
      const ci = ciById.get(issuerId);
      if (ci === undefined || !(o.sizeLocal > 0)) return;
      const talkBps = issuerSpreadAtOnCurve(v2, reg, issuerId, week, STANDARD_CORP_TENOR_YEARS, isLoanRow)?.spreadBps
        ?? o.indicativeStat ?? o.walkAwayStat;
      const marginBps = Math.round(talkBps);
      const id = primaryTrancheId(issuerId, o.purpose, week);
      primaryTermsById.set(id, { marginBps, maturityWeek: week + STANDARD_CORP_TENOR_YEARS * 52 });
      loans.push(loanOf(ci, id, 0, o.sizeLocal, {
        annualCouponRate: reg.policyRate + marginBps / 10000,
        // The period the tranche stage 08 issues will carry, from the one owner of that default.
        periodWeeks: defaultPeriodWeeks({ originationWeek: week, rateType: 'FLOATING' }),
        weeksToMaturity: STANDARD_CORP_TENOR_YEARS * 52,
      }, true));
    });
    if (loans.length === 0) return;
    const nL = loans.length;

    /** A reservation stated in discount margin, restated as the price it implies on THIS loan. */
    const priceAtSpread = (l: LoanInstrument, spreadBps: number): number =>
      priceFromSpreadBps(l.terms, curve, spreadBps);
    /**
     * Where the instrument stands before this session: what it last cleared at; for paper no
     * auction has printed, the price its borrower's own LOAN curve implies at this loan's tenor;
     * and for a borrower with no printed loan at all, par — which is what a loan struck at its own
     * market margin is worth, and what the seed deposits for its aged ladders.
     */
    const openingPrice = loans.map((l) => {
      const stored = l.isPrimary ? undefined : clearedPriceOf(v2, l.id);
      if (stored !== undefined && stored > 0) return stored;
      const curveBps = issuerSpreadAtOnCurve(v2, reg, companyTerms[l.ci].id, week, l.tenorYears, isLoanRow)?.spreadBps;
      const px = curveBps === undefined ? 1 : priceAtSpread(l, curveBps);
      return px > 0 && isFinite(px) ? px : 1;
    });

    const instruments: ClearingInstrument[] = loans.map((l, li) => ({
      id: l.id,
      outstandingLocal: l.faceLocal,
      tradableFloatLocal: l.faceLocal,
      currentStat: openingPrice[li],
      statKind: 'PRICE_LIKE',
      durationYears: l.tenorYears,
      primaryOfferingLocal: l.offeringLocal > 0 ? l.offeringLocal : undefined,
      primaryWithdrawStat: l.isPrimary
        ? priceAtSpread(l, offeringsByIssuerId.get(companyTerms[l.ci].id)!.walkAwayStat)
        : undefined,
      // No ceiling — same reasoning as the bond book (07b): the distressed regime always bids at
      // some price, and where it stands is where a fall arrests.
    }));

    // Index funds are ordinary holders with an extraordinary schedule — they buy their benchmark
    // weight at whatever the market asks — so they are excluded from the allocator population here
    // and given their own demand below.
    // XB1: cross-border loan buyers, bounded by mandate rather than by an assigned share.
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.entityType !== 'ETF'
        && mandateWeightForIssuer(e.entityType, e.region, regionId, loanStockByRegion) > 0
    );
    const regionIndexFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'ETF' && e.etf
        && INDEX_DEFINITIONS.some((d) => d.id === e.etf!.indexId && d.assetClass === 'LEVERAGED_LOAN')
    );
    const bookEntities = [...regionEntities, ...regionIndexFunds];

    // SCALE C1: positions come off the shared store's LEVERAGED_LOAN rows — one claim-scan per
    // entity. XB1 / §7.34 still holds: only paper of THIS region's issuers is claimed; everything
    // else passes through the write-back untouched.
    //
    // §3.13 row 3: a row names its TRANCHE, and the claim is made on the issuer that tranche names
    // — permanently, so a row naming a loan that has already retired is still claimed here and
    // repaid by its borrower below rather than re-keyed onto its other loans.
    const store = ctx.holdingsStore!;
    const loanFaceById = new Map(loans.map((l) => [l.id, l.faceLocal]));
    const claimedByEntity = new Map<string, Map<InstrumentId, number>>();
    bookEntities.forEach((entity) => {
      const claimed = new Map<InstrumentId, number>();
      store.scan(entity.id, 'LEVERAGED_LOAN', (h) => {
        if (!regionIssuerIds.has(issuerIdOf(v2, h.instrumentId))) return false;
        const faceLocal = h.units;
        claimed.set(h.instrumentId, (claimed.get(h.instrumentId) ?? 0) + faceLocal);
        return true;
      });
      claimedByEntity.set(entity.id, claimed);
    });

    // §7.259 — settle the borrowers' retired principal ON THE HOLDERS before this book clears:
    // scale every position to the paper's real outstanding and pay the difference in cash (see
    // holder-paydown.ts). Without this, every maturity/prepayment left the books holding claims on
    // principal already repaid, and the loan ledger minted 2–3% within weeks. Keyed by the PAPER
    // now, so a loan that matured is repaid at its own face and the desks — whose positions have
    // always been stored per tranche — are finally on the key the outstanding is measured on.
    const regionBanks = banksOf(ctx.prevActiveFirms, regionId);
    const outstandingByInstrumentId = new Map(loans.filter((l) => !l.isPrimary).map((l) => [l.id, l.faceLocal]));
    const issuerOfInstrument = new Map<InstrumentId, Company>();
    loans.forEach((l) => issuerOfInstrument.set(l.id, companyTerms[l.ci].comp));
    claimedByEntity.forEach((claimed) => claimed.forEach((_face, instrumentId) => {
      if (outstandingByInstrumentId.has(instrumentId)) return;
      outstandingByInstrumentId.set(instrumentId, 0);
      const issuer = companyById.get(issuerIdOf(v2, instrumentId));
      if (issuer) issuerOfInstrument.set(instrumentId, issuer);
    }));
    reconcileHolderPrincipal({
      ctx, regionId,
      outstandingByInstrumentId,
      issuerOfInstrument,
      holdingsByEntity: claimedByEntity,
      banks: regionBanks,
      deskBook: BOOK, instrumentType: 'LEVERAGED_LOAN',
      reason: 'loan principal paydown to holders',
    });

    // OWN7, first half: the float is what this book's holders hold, and the INSTITUTIONS' half of
    // it is known here. It is set before the desks are built rather than after, because a desk is
    // sized against the LIVE float — and a float of zero makes `buildDealerDeskParticipants` hand
    // back no desk at all.
    const heldByInstitutionsLocal = new Map<string, number>();
    claimedByEntity.forEach((claimed) => claimed.forEach((faceLocal, id) => {
      if (faceLocal > 0 && loanFaceById.has(id)) heldByInstitutionsLocal.set(id, (heldByInstitutionsLocal.get(id) ?? 0) + faceLocal);
    }));
    instruments.forEach((inst) => { inst.tradableFloatLocal = heldByInstitutionsLocal.get(inst.id) ?? 0; });

    // XB1: each entity's own book decides its target — assets x loan allocation x mandate.
    const rawEntityTargets = new Map<string, number>(
      regionEntities.map((e) => [
        e.id,
        institutionTotalAssetsLocal(ctx, e) * e.assetAllocationTarget.loanPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, loanStockByRegion),
      ])
    );
    const sectorTotal = Array.from(rawEntityTargets.values()).reduce((a, v) => a + v, 0) || 1;

    // §4.C direct-to-pack — demand written straight into the engine's staging.
    const DS = openDemandStaging(nL);
    const liById = new Map(loans.map((l, li) => [l.id, li]));
    const heldArr = new Float64Array(nL);
    const heldTouched: number[] = [];

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const claimed = claimedByEntity.get(entity.id)!;
      heldTouched.length = 0;
      claimed.forEach((faceLocal, id) => {
        const li = liById.get(id);
        if (li !== undefined) { heldArr[li] = faceLocal; heldTouched.push(li); }
      });
      const entityShare = (rawEntityTargets.get(entity.id) ?? 0) / sectorTotal;
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
      // discounted expected recovery instead of expected loss, and running the conviction size
      // that goes with it, is one strategy — the credit long-short book beside it is an ordinary
      // relative-value buyer and prices like one.
      const strategy = hedgeFundStrategyProfile(entity);
      const overweightMultiple = strategy?.convictionMultiple ?? maxOverweightMultipleOf(entity);
      // XB2: a cross-border loan is hedged like a bond — the CIP cost is in the requirement.
      const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
        ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate);
      const fullSizeRangeBps = fullSizeSpreadRangeBpsOf(entity);
      // The entity's real money for this auction (S11), directed at the paper that is actually
      // changing hands: a live offering, or the gap between what this holder targets and what it
      // already owns. A name it is already at target in, with nothing on offer, needs none of this
      // week's cash — and splitting the class budget across the entire STOCK instead starved the
      // primary market by construction, because a new issue's slice was its issuer's index weight
      // rather than its own size. Measured on an LBO financing: the book could HOLD it (53.7M of
      // capacity against a 40.1M post-issue float) but could only FUND 14.0M, so the solve ran past
      // the sponsor's walk-away and every deal was pulled.
      const classBudgetLocal = stagePurchaseBudgetLocal(ctx, entity, institutionTotalAssetsLocal(ctx, entity), 'LEVERAGED_LOAN', institutionUnsettledLessCollateralLocal(ctx, entity.id));
      const cashDemandWeightByIndex = new Float64Array(nL);
      let totalCashDemandWeightLocal = 0;
      for (let li = 0; li < nL; li++) {
        const l = loans[li];
        const structuralLocal = (l.faceLocal + l.offeringLocal) * entityShare;
        const gapToTargetLocal = Math.max(0, structuralLocal - heldArr[li]);
        const weightLocal = l.offeringLocal + gapToTargetLocal;
        cashDemandWeightByIndex[li] = weightLocal;
        totalCashDemandWeightLocal += weightLocal;
      }

      // Same terms as the bond book, at the loan's own economics: a first-lien loan's collateral
      // means less is expected to be lost on it and less capital is tied up holding it, so it
      // clears its cost at a tighter margin than the same issuer's unsecured paper. That is the
      // structural relationship between the two markets, expressed where it belongs — in what each
      // set of holders will pay — rather than as a fixed multiple between two statistics. And it
      // is asked PER LOAN, because the capital a position consumes is its own duration's.
      const demandRow = claimDemandRow(DS);
      for (let li = 0; li < nL; li++) {
        const l = loans[li];
        const t = companyTerms[l.ci];
        const reservationBps = (strategy?.pricesOffRecovery
          ? l.distressedReservationBps
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn,
              expectedLossBps: t.expectedLossBps,
              capitalChargeRate: l.capitalChargeRate,
              creditConditionsIndex,
            })) + hedgeAdjBps;
        const reservationPrice = priceAtSpread(l, reservationBps);
        const rangePrice = Math.max(1e-9, Math.abs(reservationPrice - priceAtSpread(l, reservationBps + fullSizeRangeBps)));
        const structuralSizeLocal = (l.faceLocal + l.offeringLocal) * entityShare;
        // The bound is posted in FACE, and the money it stands for buys that face at the price this
        // book opened at — the same commitment 07b's and 07e's bidders make.
        setDemand(DS, demandRow, li,
          reservationPrice,
          rangePrice,
          structuralSizeLocal * overweightMultiple,
          (classBudgetLocal *
            (totalCashDemandWeightLocal > 0
              ? cashDemandWeightByIndex[li] / totalCashDemandWeightLocal
              : 0)) / Math.max(1e-9, openingPrice[li]),
          0);
      }
      for (const li of heldTouched) heldArr[li] = 0;

      return { id: entity.id, currentHoldingsByInstrumentId: claimed, demandByInstrumentId: EMPTY_DEMAND_MAP, demandRow };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.loanDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.instrumentId, p.inventoryLocal));

    // ETF: the index funds tracking this book's benchmarks. A fund posts a SIZE with no
    // reservation level — its benchmark weight at whatever the market is asking — which is the
    // one demand shape the engine could not previously express and a large real force in credit.
    // A credit index weights by MARKET VALUE, so a constituent's weight is spread over that
    // borrower's own loans by what each is worth — the index owns the paper, not the borrower.
    const bookIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'LEVERAGED_LOAN' && d.region === regionId)
      .map((d) => d.id);
    const loansByIssuerId = new Map<string, number[]>();
    loans.forEach((l, li) => {
      const key = companyTerms[l.ci].id;
      const list = loansByIssuerId.get(key);
      if (list) list.push(li); else loansByIssuerId.set(key, [li]);
    });
    const indexFundParticipants: ClearingParticipant[] = indexFundsForBook(
      ctx.v2,
      regionIndexFunds, ctx.updatedMarketIndexes, bookIndexIds, (e) => store.currentHoldingsLocal(e.id)
    ).map(({ fund, index, investableLocal }) => {
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      // A CREDIT index fund is a real buyer in the primary, unlike its equity counterpart: a credit
      // index admits a new issue at the next rebalance, and a fund that waits has to chase it in
      // the aftermarket, so it takes its proportional share at issue.
      const fundShareOfIndex = index.totalValueLocal > 0 ? investableLocal / index.totalValueLocal : 0;
      index.constituents.forEach((c) => {
        const list = loansByIssuerId.get(c.instrumentId);
        if (!list || list.length === 0) return;
        let valueLocal = 0;
        list.forEach((li) => { valueLocal += (loans[li].faceLocal + loans[li].offeringLocal) * openingPrice[li]; });
        if (!(valueLocal > 0)) return;
        list.forEach((li) => {
          const l = loans[li];
          const shareOfIssuer = ((l.faceLocal + l.offeringLocal) * openingPrice[li]) / valueLocal;
          const targetValueLocal = investableLocal * c.weight * shareOfIssuer
            + l.offeringLocal * openingPrice[li] * fundShareOfIndex;
          const px = Math.max(1e-9, openingPrice[li]);
          demandByInstrumentId.set(
            l.id,
            // §7.270: shaved by the dealer spread — the kernel's cash leg is traded PLUS fee, and
            // a bound spent exactly overdraws by spread × gross (see 07b).
            indexFundDemand(
              targetValueLocal / px,
              (institutionSpendableLocal(ctx, fund) * c.weight * shareOfIssuer / (1 + DEALER_SPREAD_BPS / 10000)) / px,
              'PRICE_LIKE')
          );
        });
      });
      return {
        id: fund.id,
        currentHoldingsByInstrumentId: claimedByEntity.get(fund.id) ?? new Map<InstrumentId, number>(),
        demandByInstrumentId,
      };
    });

    // G3a: the named banks' loan-trading desks, sized by their own headroom.
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      unitPriceOf: (i) => openingPrice[i],
    });
    const deskTickers = deskTickersOf(deskParticipants);

    // OWN7, second half: the desks' own books join the float now that they exist. A holder outside
    // this book keeps its position, so its paper was never for sale — and the residual no named
    // book holds at all was never for sale either, because there is no seller to decrement.
    const deskHeldLocal = new Map<string, number>();
    deskParticipants.forEach((d) => d.currentHoldingsByInstrumentId.forEach((faceLocal, id) => {
      if (faceLocal > 0) deskHeldLocal.set(id, (deskHeldLocal.get(id) ?? 0) + faceLocal);
    }));
    instruments.forEach((inst) => {
      inst.tradableFloatLocal = (heldByInstitutionsLocal.get(inst.id) ?? 0) + (deskHeldLocal.get(inst.id) ?? 0);
    });

    const allParticipants = [...participants, ...indexFundParticipants, ...deskParticipants];
    const result = clearFinancialAsset(instruments, allParticipants, priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      // OWN7: the float here is a stock these participants already hold, so an unsold position
      // stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    const piById = new Map(allParticipants.map((pp, pi) => [pp.id, pi]));
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `leveraged loan:${id}`));
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} leveraged loan`);

    // THE PRINT, DEPOSITED — but only where there was something to trade. A book with no float and
    // no offering has no clearing level and what comes back is the numerical bracket (§3.21); such
    // an instrument keeps the price it had, which is the honest answer.
    const clearedPriceById = new Map<string, number>();
    for (let li = 0; li < nL; li++) {
      const l = loans[li];
      const outcome = result.primaryOutcomeById.get(l.id);
      const placedLocal = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeLocal) : 0;
      const tradedSomething = instruments[li].tradableFloatLocal > 0 || placedLocal > 0;
      const px = result.newStatByIndex[li];
      const printed = tradedSomething && px > 0 && isFinite(px);
      clearedPriceById.set(l.id, printed ? px : openingPrice[li]);
      if (printed) setClearedPrice(v2, l.id, px);
    }

    // G3c: quoted per deal — the desks' spread plus what a week's price move can cost on the
    // residual the desks cannot absorb.
    const bookCapacityLocal = totalDeskCapacityLocal(ctx, regionBanks, BOOK);

    // Apply: each entity's real new LEVERAGED_LOAN holdings. The rows name the TRANCHE the auction
    // priced — the issuer-level split that had to invent them is deleted (§9.13-CREDIT row 4).
    // SCALE C1: fills append to the store for the single write-back after 07e. SETL6: the cash leg
    // is settled below as payment instructions.
    const holdingRow = (instrumentId: InstrumentId, faceLocal: number): ItemizedHolding =>
      // Written in PAR space, as the bond book's and the sovereign's fills are: the row carries the
      // FACE it holds and the cash leg above paid the cleared price for it. `P5` measures the gap
      // until the mark lands — §3.13's item 4, which cannot land one book at a time.
      ({ instrumentId, instrumentType: 'LEVERAGED_LOAN', issuerRegion: regionId, quantityOrNotionalLocal: faceLocal, units: faceLocal });
    bookEntities.forEach((entity) => {
      const pi = piById.get(entity.id);
      const claimed = claimedByEntity.get(entity.id);
      const newLoanHoldings: ItemizedHolding[] = [];
      if (pi !== undefined) {
        const base = pi * result.nInstruments;
        for (let li = 0; li < result.nInstruments; li++) {
          const faceLocal = result.holdingsMatrix[base + li];
          if (faceLocal > 1) newLoanHoldings.push(holdingRow(loans[li].id, faceLocal));
        }
      }
      // A stage may only rewrite what it CLEARED (§7.34 / the WS5 bug): paper this book did not
      // price, and every row of an entity that ended up with no seat at all, sold nothing and must
      // therefore keep everything.
      if (claimed) claimed.forEach((faceLocal, instrumentId) => {
        if (!(faceLocal > 1)) return;
        if (pi !== undefined && loanFaceById.has(instrumentId)) return;
        newLoanHoldings.push(holdingRow(instrumentId, faceLocal));
      });
      store.append(entity.id, newLoanHoldings);
    });

    // Apply: real dealer inventory, owned by the desks that took it; the regional array is the
    // derived sum (G3a).
    const deskViewByInstrument = applyDealerDeskFills({
      piById, ctx, banks: regionBanks, book: BOOK, instruments, result,
      unitPriceOf: (id) => clearedPriceById.get(id) ?? 1,
    });
    // §7.259: the settlement (which lands the lead's unsold residual on its desk inventory) sits
    // BELOW applyDealerDeskFills. Called between the clearing and the fills application, the
    // residual arrived on the sheet only for the rebuild-from-fills to delete it the same instant:
    // no cash leg, and the fee formula then charged the whole residual to the lead's EQUITY as a
    // phantom spread. Measured: 1.6–3.1B/week per lead bank, every region.
    settlePricedOfferings(regionId, 'LEVERAGED_LOAN', offeringsByIssuerId, result, ctx,
      (o, clearedPrice) => o.sizeLocal * clearedPrice,
      (o, clearedPrice) => underwritingFeeBps({
        bookSpreadBps: DEALER_SPREAD_BPS,
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'PRICE_LIKE', currentStat: clearedPrice,
          // The concession THIS deal conceded, against the par it was struck at.
          weeklyMovePct: Math.abs(clearedPrice - 1),
        }),
        dealSizeLocal: o.sizeLocal,
        deskCapacityLocal: bookCapacityLocal,
      }),
      BOOK,
      {
        instrumentIdOf: (o) => primaryTrancheId(o.issuerId, o.purpose, week),
        unitPriceOfStat: (clearedPrice) => clearedPrice,
        // The paper the market priced is the paper that gets issued: stage 08 takes the margin this
        // book struck rather than reading the cleared statistic as one.
        termsOf: (o) => {
          const t = primaryTermsById.get(primaryTrancheId(o.issuerId, o.purpose, week));
          return t ? { couponRate: t.marginBps / 10000, maturityWeek: t.maturityWeek } : undefined;
        },
      });
    const newDealerInventory: { instrumentId: InstrumentId; inventoryLocal: number }[] = [];
    deskViewByInstrument.forEach((inventoryLocal, instrumentId) => {
      if (Math.abs(inventoryLocal) > 1) newDealerInventory.push({ instrumentId, inventoryLocal });
    });
    reg.bankingSector = { ...reg.bankingSector, loanDealerInventory: newDealerInventory };

    // SETL6: the book's whole cash side, through the clearing house.
    const entityIds = new Set(bookEntities.map((e) => e.id));
    /** §3.13-READ A7 — THE BORROWER BEHIND A PIECE OF THIS BOOK'S PAPER, read from the tranche
     *  store rather than from this session's universe. The map this used (`issuerIdOfInstrument`,
     *  built over the bonds/loans OFFERED this week) knows nothing about paper a participant
     *  carried in and no longer trades, and `settleClearedBook` turns an unknown issuer into a
     *  `defect()` on the accrued leg. It never fired only because `accruedPerFaceById` is
     *  book-scoped too and returned 0 first — one map guarding another map's gap. 07f already read
     *  the store here and could not fail that way; rule 19 says read the source, and the store is
     *  the source of who issued a tranche. */
    const issuerPartyOf = (instrumentId: InstrumentId): PartyRef | undefined => {
      const issuer = companyById.get(issuerIdOf(ctx.v2, instrumentId));
      return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
    };
    const partyOfParticipant = participantPartyOf({ regionId, entityIds, deskTickers });
    // §3.13b: the accrued travels with the face — the ledger half here, the cash half below,
    // through the same clearing house as the paper. A loan trades clean like a bond.
    const accruedLeg = accruedOnFills(
      allParticipants, result.newParticipantHoldings,
      (id) => accruedPerFaceById.get(id) ?? 0,
      (instrumentId, participantId, usd) => moveCorporateAccrued(
        ctx.holderAccruedInterestLocal, 'LEVERAGED_LOAN', instrumentId, participantId, usd)
    );
    settleClearedBook(
      ctx, regionId, currencyOf(regionId), BOOK,
      result.netCashDeltaByParticipantId,
      partyOfParticipant,
      { netCashLocal: result.dealerNetCashLocal, feeLocal: result.totalDealerRevenueLocal },
      feeDesksForRegion(ctx, regionId),
      // WS8: the CCP pays each issuer for the paper its deal actually placed, AT THE PRICE it
      // placed at — a deal that conceded raises less, which is what a concession is.
      // The paper's leg is the tranche's own wire (issuer → house at issue, W3) — no asset here.
      primaryTakes(result, issuerPartyOf, (takeLocal, clearedPrice) => takeLocal * clearedPrice),
      { ...accruedLeg, issuerOf: issuerPartyOf }
    );
  });
}
