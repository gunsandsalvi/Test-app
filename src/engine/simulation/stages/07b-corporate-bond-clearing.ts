/**
 * Stage 7b: Corporate Bond Real Clearing
 *
 * Foundational correction (Wall Street): a bond's price must be the actual result of real supply
 * and demand, not a formula that outputs a spread directly. OAS is a STATISTIC computed from the
 * cleared price, never the primitive that sets it.
 *
 * §3.13 — THE INSTRUMENT IS THE TRANCHE, WHAT CLEARS IS ITS PRICE, AND THERE IS NO SUCH THING AS
 * AN ISSUER'S SPREAD (user, 2026-09-04: *"there shouldn't be any spread per issuer. The spread is
 * per asset, assets with different maturities should have different risk levels and so different
 * spreads. There is no spread quantity associated with an issuer aside from the CDS."*). This
 * book used to price ONE instrument per ISSUER and clear a SPREAD, and all three halves of that
 * were the same mistake:
 *
 *   - a SPREAD IS NOT A PRICE. `financial-clearing-engine` values a fill at `unitValueLocal = 1`
 *     for anything that is not PRICE_LIKE, so every corporate bond in the model changed hands at
 *     FACE whatever its coupon and whatever the market said. That is "credit always trades at
 *     par" (rule 3), and it is the defect §9.13-SOV row 4 removed from the sovereign;
 *   - an ISSUER IS NOT A PIECE OF PAPER. A 4.75% 2031 and a 3% 2029 of one borrower are two
 *     instruments with two prices; pricing the borrower forced a SPLIT that invented a mapping
 *     back onto the register's tranche rows, and that invention IS `O7` (holders claiming past a
 *     tranche's face) and `O8` (a position keyed as though a company were a security). The file
 *     that did it died with the last book that needed it (§9.13-CREDIT row 4);
 *   - and ONE SPREAD PER BORROWER IS NO TERM STRUCTURE. Every holder's reservation was computed
 *     against a single blended issuer duration, so a two-year rung and a thirty-year rung of the
 *     same name were required to pay the same spread. The arithmetic to do better was already
 *     here and was being fed the wrong argument: spread-risk capital scales with the PAPER's own
 *     duration and the distressed bid discounts over the PAPER's own life, so handing each
 *     tranche its own remaining life produces an upward-sloping curve for a performing credit and
 *     an inverted one for a distressed name, out of the hazard the model already had and with no
 *     new parameter.
 *
 * Nothing about anyone's REASON changes. A credit buyer's reservation genuinely is a SPREAD — it
 * covers the issuer's expected loss and the capital THIS paper consumes — so it still computes
 * one, and then states it as the PRICE that spread implies on this tranche's own cash flows
 * against the region's cleared curve. What changes is what the auction solves for, what a fill is
 * worth, and what the paper is called.
 *
 * The cleared price is DEPOSITED per tranche (`engine2/prices.ts`), so next week's session, the
 * register's mark, the index and every borrower's cost of money read the number this auction
 * printed rather than re-deriving one. `Company.oasSpreadBps` is GONE: what replaced it is the
 * issuer's own credit curve, read off its own paper at whatever maturity the caller means
 * (`engine/credit-price.ts`).
 *
 * This is the corporate-bond adapter over the generalized, asset-agnostic clearing engine (see
 * financial-clearing-engine.ts) — it owns only what's specific to corporate bonds:
 *
 * - Who the real participants are (named institutional entities, banks as dealer).
 * - Each entity's real, bottom-up total target — never an independently-computed number that
 *   could exceed the real market and need a cap.
 * - Each participant's DEMAND SCHEDULE per TRANCHE (§7.16's engine): a reservation spread built
 *   from the issuer's own structural default probability and this paper's own capital charge (or,
 *   for distressed paper, the recovery arithmetic of the fund bidding it), restated as the price
 *   it implies, the size it scales in over, and its real weekly budget (S11).
 *
 * This adapter only covers FIXED-rate capital-markets tranches (real corporate bonds). Floating
 * tranches are real leveraged loans — a genuinely different market with a different investor
 * base (CLOs/loan funds, not bond funds) and different technicals — and get their own real
 * clearing (07d-leveraged-loan-clearing.ts), not a byproduct split of this one's fills — and since
 * §9.13-CREDIT row 3 they clear a PRICE per tranche there, in this same shape.
 *
 * The actual auction — the demand-schedule solve, cores-first rationing, cash legs, dealer
 * residual — lives once in the shared engine; sovereign bonds, bills, loans, equity and the
 * repo session plug into the same engine as their own adapters rather than re-implementing it.
 *
 * Must run after stage 2b (bank diversification, so named banks and their dealer inventory
 * carry-forward already reflect this week) and before stage 8 (company fundamentals), which
 * reads this book's cleared prices as already-real values rather than computing any itself.
 */

import { hedgeFundStrategyProfile } from '../../../domain/institution-profiles';
import { InstrumentId } from '../../../domain/ids';
import { GameState, RegionId, Company, PrimaryOffering } from '../../../types';
import { ensureV2, V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_CP, TR_FACILITY, issuerIdOf, trancheScheduleOf, trancheIdOf } from '../../../engine2/tranches';
import { setClearedPrice, clearedPriceOf } from '../../../engine2/prices';
import { primaryTrancheId, STANDARD_CORP_TENOR_YEARS } from '../../../domain/primary-market';
import { isActiveCompany, accruedPerFace, defaultPeriodWeeks, banksOf } from '../../../domain/company';
import { computeAnnualDefaultProbability, creditRecoveryRate, moveCorporateAccrued } from './shared-helpers';
import { priceFromSpreadBps, zeroRateAt } from '../../../domain/pricing';
import type { PaperTerms, ZeroCurve } from '../../../domain/pricing';
import { issuerSpreadAt, CreditPriceWorld } from '../../credit-price';
import {
  computeReservationSpreadBps,
  fullSizeSpreadRangeBpsOf,
  isInvestmentGrade,
  subInvestmentGradeSizeFactor,
  spreadRiskCapitalChargeRate,
  maxOverweightMultipleOf,
  computeDistressedReservationSpreadBps,
  entityRequiredReturn,
} from './asset-allocation';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetLocal } from './institutional-balance-sheet';
import { institutionUnsettledLessCollateralLocal, institutionSpendableLocal, PartyRef } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, accruedOnFills, participantPartyOf, parHoldingRow, writeBackClearedFills } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, deskTickersOf, totalDeskCapacityLocal } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { openDemandStaging, claimDemandRow, setDemand, clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, positionsByInstrument, setTradableFloat } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<InstrumentId, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';

import { indexFundDemand, indexFundsForBook, bookIndexIdsOf, indexFundsSeatedIn } from './etf-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/derivatives/classes/fx-forward';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { reconcileHolderPrincipal } from './holder-paydown';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';

/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['corporate bond'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'corporate bond';
// Real insurers and pension funds overwhelmingly run investment-grade-only mandates in
// practice — a genuine structural avoidance of high-yield paper, not a soft preference.

/**
 * The ladder rows this book prices: an issuer's own capital-markets FIXED paper — the same three
 * flags the register's CORP_BOND rows name, in ONE place. A bank facility is its lender's
 * itemized loan and commercial paper is 07f's book, so neither is for sale here.
 */
const isBondRow = (flags: number): boolean => !(flags & (TR_FLOATING | TR_CP | TR_FACILITY));

// §7.311 — ladder reads on rows (chain order = array order, so every fold is float-identical).
function fixedDebtLocal(v2: V2World, comp: Company): number {
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if (isBondRow(S.flags[r])) sum += S.principalLocal[r];
  }
  return sum;
}

// §3.18's `07b:110-119` is GONE with the issuer instrument: `creditDurationYears` blended an
// issuer's whole ladder into one number, multiplied it by a magic 0.75 and clamped it to [1, 8].
// There is nothing left for it to be the duration OF — every schedule below is struck on the
// tranche's own remaining life, which the row already states exactly.

export function runCorporateBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const regionIds = REGION_IDS;
  const week = ctx.nextWeek;

  // SCALE: fixedDebtLocal filters and reduces a company's whole ladder per call, and the stage
  // used to call it ~14k times a week (four full-universe region sweeps included). Nothing in
  // this stage changes a ladder, so one computation per company per run is the same number.
  const fixedDebtById = new Map<string, number>();
  const fixedDebtOf = (c: Company): number => {
    let v = fixedDebtById.get(c.id);
    if (v === undefined) { v = fixedDebtLocal(v2, c); fixedDebtById.set(c.id, v); }
    return v;
  };
  // Loop-invariant for the same reason — hoisted from the per-region iteration (it was four
  // identical full-universe sweeps per region, sixteen a week).
  const corpStockByRegion: Record<string, number> = {};
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    corpStockByRegion[r] = ctx.prevActiveFirms
      .filter((c) => c.region === r).reduce((a, c) => a + fixedDebtOf(c), 0);
  });
  // The credit-curve read, for the one thing that genuinely needs a borrower-level number: what a
  // brand-new deal's coupon is struck at. It reads the issuer's OWN printed paper.
  const companyById = new Map<string, Company>();
  ctx.updatedCompanies.forEach((c) => companyById.set(c.id, c));
  ctx.prevActiveFirms.forEach((c) => { if (!companyById.has(c.id)) companyById.set(c.id, c); });
  ctx.prevActivePrivateFirms.forEach((c) => { if (!companyById.has(c.id)) companyById.set(c.id, c); });
  const creditWorld: CreditPriceWorld = {
    issuerById: (id: string) => companyById.get(id),
    regionById: (r: string) => ctx.updatedRegions[r as RegionId],
  };

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    // §3.13: the curve standing at WEEK START — what a real session prices against, and the same
    // one 07c strikes its sovereign bonds on. `sovereign-curve.ts` republishes it after this
    // stage from what this week's sovereign sessions cleared.
    const curve: ZeroCurve = reg.zeroRates;
    // HC2: the named private tier's paper trades here alongside the public universe — the
    // market prices an issuer's credit, not its listing status. Private issuers arrived with
    // their tradable float already seeded onto these same holders (initialization), so their
    // first clearing week opens with genuine small gaps, not a systemic buy-in.
    const regionActive = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
      (c) => c.region === regionId && isActiveCompany(c)
    );
    if (regionActive.length === 0) return;
    // Every issuer whose paper a holder in this region's book could be carrying — INCLUDING one
    // whose fixed ladder has run off entirely, because a claim on retired paper is still a claim
    // and it is repaid below rather than migrated onto the borrower's other bonds.
    const regionIssuerIds = new Set(regionActive.map((c) => c.id));

    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;

    // WS8: this week's primary offerings in THIS book — new fixed-rate paper priced alongside
    // the outstanding stock. The issuer's walk-away rides on the instrument; the engine
    // re-solves without the offering when it is pulled.
    const offeringsByIssuerId = new Map<string, PrimaryOffering>();
    ctx.primaryOfferingsWorking.forEach((o) => {
      if (o.region === regionId && o.instrumentType === 'CORP_BOND') offeringsByIssuerId.set(o.issuerId, o);
    });

    // ---- The issuers: what a CREDIT VIEW is about. ----
    // A hazard and a rating belong to the FIRM, so they are resolved once per issuer; everything
    // that varies with the paper is resolved per tranche below. The structural PD reads the debt
    // ladder and revenue history and was being recomputed once per entity × company — 4x the work
    // for identical answers (§6's optimization rule).
    //
    // ONE OWNER (§6.1's duplicate row): the recovery this book prices is the region's own
    // REALISED experience blended with the prior (`creditRecoveryRate`) — the same basis the
    // loan book and the CDS leg already price on.
    const regionRecoveryRate = creditRecoveryRate(reg);
    const issuers = regionActive.filter((c) => fixedDebtOf(c) > 0 || offeringsByIssuerId.has(c.id));
    const companyTerms = issuers.map((c) => {
      const annualPd = computeAnnualDefaultProbability(v2, c);
      return {
        id: c.id,
        comp: c,
        creditRating: c.creditRating,
        annualPd,
        subIG: !isInvestmentGrade(c.creditRating),
        expectedLossBps: annualPd * (1 - regionRecoveryRate) * 10000,
      };
    });
    const ciById = new Map(companyTerms.map((t, ci) => [t.id, ci]));

    /**
     * §3.13 — THE INSTRUMENTS ARE THE TRANCHES. Each carries its own coupon, its own remaining
     * life, its own capital charge and its own price. The issuer-level register split has nothing
     * left to do on this book: a fill already names the paper it bought.
     */
    type BondInstrument = {
      id: InstrumentId; ci: number;
      /** Face outstanding — 0 for a deal that has not priced yet. */
      faceLocal: number;
      /** This week's offering ON THIS PAPER — non-zero only for the primary. */
      offeringLocal: number;
      terms: PaperTerms;
      tenorYears: number;
      /** Spread-risk capital against THIS paper's own duration — the term structure's source. */
      capitalChargeRate: number;
      /** The distressed bid's reservation, discounted over THIS paper's own life. */
      distressedReservationBps: number;
      isPrimary: boolean;
    };
    const S = v2.tranches;
    const bonds: BondInstrument[] = [];
    const bondOf = (ci: number, id: InstrumentId, faceLocal: number, offeringLocal: number, terms: PaperTerms, isPrimary: boolean): BondInstrument => {
      const tenorYears = terms.weeksToMaturity / 52;
      return {
        id, ci, faceLocal, offeringLocal, terms, tenorYears, isPrimary,
        capitalChargeRate: spreadRiskCapitalChargeRate(companyTerms[ci].creditRating, tenorYears),
        distressedReservationBps: computeDistressedReservationSpreadBps({
          annualDefaultProbability: companyTerms[ci].annualPd,
          recoveryRate: regionRecoveryRate,
          durationYears: tenorYears,
        }),
      };
    };
    // §3.13b / `bond.md` N9.b — WHAT ONE UNIT OF FACE HAS ACCRUED. This auction clears a CLEAN
    // price, so the interest that has run since each tranche's own last coupon date is paid by the
    // buyer to the seller on top of it, and re-keys on the accrual ledger with the paper. It is
    // read at the CURRENT week, not next: `applyHolderInterestAccruals` runs in stage 08, after
    // this book, so the ledger these balances move on stands at what it accrued through last week.
    const accruedPerFaceById = new Map<InstrumentId, number>();
    companyTerms.forEach((t, ci) => {
      for (const r of ladderRowsOf(v2, t.id)) {
        if (!isBondRow(S.flags[r]) || !(S.principalLocal[r] > 0.01)) continue;
        const weeksToMaturity = S.maturityWeek[r] - week;
        // Paper that is due redeems at its face; it does not trade for a price.
        if (!(weeksToMaturity > 0)) continue;
        const id = trancheIdOf(v2, r);
        const couponRate = Number.isNaN(S.couponRate[r]) ? 0 : S.couponRate[r];
        accruedPerFaceById.set(id, accruedPerFace({
          originationWeek: S.originationWeek[r],
          paymentAnchorWeek: Number.isNaN(S.paymentAnchorWeek[r]) ? undefined : S.paymentAnchorWeek[r],
          paymentsPerYear: Number.isNaN(S.paymentsPerYear[r]) ? undefined : S.paymentsPerYear[r],
          rateType: 'FIXED',
        }, couponRate, state.currentWeek));
        bonds.push(bondOf(ci, id, S.principalLocal[r], 0, {
          annualCouponRate: couponRate,
          periodWeeks: trancheScheduleOf(S, r).periodWeeks,
          weeksToMaturity,
        }, false));
      }
    });
    // WS8 — A DEAL IS ITS OWN PIECE OF PAPER, and the book prices it beside the outstanding
    // stock. It is STRUCK AT PAR against the issuer's own credit curve at the tenor it is being
    // sold at — which is what a new corporate bond IS: the coupon is fixed at launch and the
    // market decides what it will pay for it. The concession the book demands then shows up
    // where it belongs, as a price below par, and the issuer receives price × face instead of
    // par whatever it cleared. The walk-away is the issuer's own indifference spread restated as
    // the price it implies, so a deal is pulled when the market asks a bigger concession than the
    // borrower will wear.
    const primaryTermsById = new Map<string, { couponRate: number; maturityWeek: number }>();
    offeringsByIssuerId.forEach((o, issuerId) => {
      const ci = ciById.get(issuerId);
      if (ci === undefined || !(o.sizeLocal > 0)) return;
      const sovAt = zeroRateAt(curve, STANDARD_CORP_TENOR_YEARS);
      // A DEBUT has no credit curve to read, and inventing one for it is what this replaces: it
      // launches on the price talk it published, which is what price talk is for.
      const talkBps = issuerSpreadAt(creditWorld, v2, issuerId, week, STANDARD_CORP_TENOR_YEARS)?.spreadBps
        ?? o.indicativeStat ?? o.walkAwayStat;
      const couponRate = sovAt + talkBps / 10000;
      const id = primaryTrancheId(issuerId, o.purpose, week);
      primaryTermsById.set(id, { couponRate, maturityWeek: week + STANDARD_CORP_TENOR_YEARS * 52 });
      bonds.push(bondOf(ci, id, 0, o.sizeLocal, {
        annualCouponRate: couponRate,
        // The period the tranche stage 08 issues will carry, from the one owner of that default.
        periodWeeks: defaultPeriodWeeks({ originationWeek: week, rateType: 'FIXED' }),
        weeksToMaturity: STANDARD_CORP_TENOR_YEARS * 52,
      }, true));
    });
    if (bonds.length === 0) return;
    const nB = bonds.length;

    /** A reservation stated in spread, restated as the price it implies on THIS bond. */
    const priceAtSpread = (b: BondInstrument, spreadBps: number): number =>
      priceFromSpreadBps(b.terms, curve, spreadBps);
    /**
     * Where the instrument stands before this session: what it last cleared at; for paper no
     * auction has printed, the price its ISSUER's own curve implies at this bond's own tenor; and
     * for a borrower with no printed paper at all, par — which is what every birth in this model
     * is struck at, and what the seed deposits for its aged ladders.
     */
    const openingPrice = bonds.map((b) => {
      const stored = b.isPrimary ? undefined : clearedPriceOf(v2, b.id);
      if (stored !== undefined && stored > 0) return stored;
      const curveBps = issuerSpreadAt(creditWorld, v2, companyTerms[b.ci].id, week, b.tenorYears)?.spreadBps;
      const px = curveBps === undefined ? 1 : priceAtSpread(b, curveBps);
      return px > 0 && isFinite(px) ? px : 1;
    });

    const instruments: ClearingInstrument[] = bonds.map((b, bi) => ({
      id: b.id,
      outstandingLocal: b.faceLocal,
      tradableFloatLocal: b.faceLocal,
      currentStat: openingPrice[bi],      // price per unit of face
      statKind: 'PRICE_LIKE',
      durationYears: b.tenorYears,
      primaryOfferingLocal: b.offeringLocal > 0 ? b.offeringLocal : undefined,
      primaryWithdrawStat: b.isPrimary
        ? priceAtSpread(b, offeringsByIssuerId.get(companyTerms[b.ci].id)!.walkAwayStat)
        : undefined,
      // No floor and no ceiling. The floor is an outcome: every bidder's reservation already
      // covers its own expected loss and capital cost, so demand richer than that is genuinely
      // zero. The ceiling is an outcome too: the distressed regime below always has a bid at
      // SOME price — as the price falls the buyer's IRR on expected recovery clears — so the
      // fall arrests where that bid stands, not where a bound says.
    }));

    // Index funds are ordinary holders with an extraordinary schedule — they buy their benchmark
    // weight at whatever the market asks — so they are excluded from the allocator population here
    // and given their own demand below.
    // XB1: every region's institutions bid, bounded by their own mandate rather than by an
    // ownership share assigned to their region.
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.entityType !== 'ETF'
        && mandateWeightForIssuer(e.entityType, e.region, regionId, corpStockByRegion) > 0
    );
    // §3.13-READ D6: the SAME predicate `bookIndexIds` uses below. This filter matched on asset
    // class alone, so a fund tracking a foreign credit index was seated and then given no demand.
    const regionIndexFunds = indexFundsSeatedIn(ctx.updatedInstitutionalEntities, 'CORP_BOND', regionId, true);
    const bookEntities = [...regionEntities, ...regionIndexFunds];

    // SCALE C1: positions come off the shared store's CORP_BOND rows — one claim-scan per
    // entity instead of a sweep of its whole book. XB1 / §7.34 still holds: only paper of THIS
    // region's issuers is claimed (a JPN insurer's JPN bonds stay unclaimed and pass through the
    // write-back untouched, exactly as the old "other holdings" partition carried them).
    //
    // §3.13: a row names its TRANCHE, and the claim is made on the issuer that tranche names —
    // permanently, so a row naming paper that has already retired is still claimed here and
    // repaid by its borrower below. It used to be folded into the issuer's total and silently
    // re-keyed onto whatever OTHER bonds that borrower still had outstanding, which is half of
    // what `O7` counts.
    const store = ctx.holdingsStore!;
    const bondFaceById = new Map(bonds.map((b) => [b.id, b.faceLocal]));
    const claimedByEntity = new Map<string, Map<InstrumentId, number>>();
    bookEntities.forEach((entity) => {
      const claimed = new Map<InstrumentId, number>();
      store.scan(entity.id, 'CORP_BOND', (h) => {
        if (!regionIssuerIds.has(issuerIdOf(v2, h.instrumentId))) return false;
        // A book trades FACE, and `units` IS the face (`domain/banking.ts`) — one lane, carried
        // through the store, so what this claims is what the register holds.
        const faceLocal = h.units;
        claimed.set(h.instrumentId, (claimed.get(h.instrumentId) ?? 0) + faceLocal);
        return true;
      });
      claimedByEntity.set(entity.id, claimed);
    });

    // §7.259 — settle the borrowers' retired principal ON THE HOLDERS before this book clears
    // (see holder-paydown.ts; same defect and same fix as the loan book in 07d). Keyed by the
    // PAPER now, so a tranche that matured is repaid at its own face rather than netted against
    // the borrower's other bonds — and the desks' own positions, which have always been stored
    // per tranche, are finally on the same key the outstanding is measured on.
    const regionBanksEarly = banksOf(ctx.prevActiveFirms, regionId);
    const outstandingByInstrumentId = new Map(bonds.filter((b) => !b.isPrimary).map((b) => [b.id, b.faceLocal]));
    const issuerOfInstrument = new Map<InstrumentId, Company>();
    bonds.forEach((b) => issuerOfInstrument.set(b.id, companyTerms[b.ci].comp));
    claimedByEntity.forEach((claimed) => claimed.forEach((_face, instrumentId) => {
      if (outstandingByInstrumentId.has(instrumentId)) return;
      // Paper this book is not pricing: it has retired. Its holders are owed their face.
      outstandingByInstrumentId.set(instrumentId, 0);
      const issuer = companyById.get(issuerIdOf(v2, instrumentId));
      if (issuer) issuerOfInstrument.set(instrumentId, issuer);
    }));
    reconcileHolderPrincipal({
      ctx, regionId,
      outstandingByInstrumentId,
      issuerOfInstrument,
      holdingsByEntity: claimedByEntity,
      banks: regionBanksEarly,
      deskBook: BOOK, instrumentType: 'CORP_BOND',
      reason: 'bond principal paydown to holders',
    });

    // OWN7, first half: the float is what this book's holders hold, and the INSTITUTIONS' half of
    // it is known here. It is set before the desks are built rather than after, because a desk is
    // sized against the LIVE float — leaving `tradableFloatLocal` at the whole outstanding until
    // after the desk build gave every desk capacity against an issue that is not for sale, and a
    // float of zero makes `buildDealerDeskParticipants` hand back no desk at all.
    const heldByInstitutionsLocal = positionsByInstrument(claimedByEntity.values(), (id) => bondFaceById.has(id));
    setTradableFloat(instruments, heldByInstitutionsLocal);

    // XB1: each entity's target is ITS OWN book — assets x its corporate-credit allocation x
    // what its mandate allows in this issuer's market. The imposed institutional share,
    // renormalized across a fixed holder set, decided the answer the auction should produce.
    const rawEntityTargets = new Map<string, number>(
      regionEntities.map((e) => [
        e.id,
        institutionTotalAssetsLocal(ctx, e) * e.assetAllocationTarget.corpBondPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, corpStockByRegion),
      ])
    );
    // Identical for every entity; the old code re-reduced it inside each entity's closure.
    const sectorTotal = Array.from(rawEntityTargets.values()).reduce((a, v) => a + v, 0) || 1;
    // §4.C direct-to-pack — demand written straight into the engine's staging; no
    // ParticipantDemand objects exist for this book at all.
    const DS = openDemandStaging(nB);

    // §4.C Stage I — the pair loops on dense columns (the 07e slice's shape, §7.327 (1)): the
    // per-(entity, name) holding probe becomes an array read; iteration order is `bonds` order in
    // both passes, so every float accumulates exactly as before.
    const biById = new Map(bonds.map((b, bi) => [b.id, bi]));
    const heldArr = new Float64Array(nB);
    const heldTouched: number[] = [];

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const claimed = claimedByEntity.get(entity.id)!;
      heldTouched.length = 0;
      claimed.forEach((faceLocal, id) => {
        const bi = biById.get(id);
        if (bi !== undefined) { heldArr[bi] = faceLocal; heldTouched.push(bi); }
      });
      const entityShareOfSector = rawEntityTargets.get(entity.id) ?? 0;
      // Per-entity invariants of the per-name loops below.
      const entityShare = entityShareOfSector / sectorTotal;
      const entitySubIGFactor = subInvestmentGradeSizeFactor(entity.entityType);
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
      // discounted expected recovery instead of expected loss, and running the conviction size
      // that goes with it, is one strategy — the credit long-short book beside it is an ordinary
      // relative-value buyer and prices like one.
      const strategy = hedgeFundStrategyProfile(entity);
      const overweightMultiple = strategy?.convictionMultiple ?? maxOverweightMultipleOf(entity);
      // XB2: hedged, so a foreign buyer's requirement carries the CIP cost of the hedge.
      const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
        ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate);
      const fullSizeRangeBps = fullSizeSpreadRangeBpsOf(entity);
      // The entity's real budget for this auction (S11): available cash plus its type's genuine
      // leverage capacity, sliced to this asset class by its own targets, then directed at the
      // paper that is actually changing hands — a live offering, or the gap between what this
      // holder targets and what it already owns. A bid is a claim on money; this is the money.
      const classBudgetLocal = stagePurchaseBudgetLocal(ctx, entity, institutionTotalAssetsLocal(ctx, entity), 'CORP_BOND', institutionUnsettledLessCollateralLocal(ctx, entity.id));
      // SCALE: indexed by `bonds` position, not a Map keyed by id — both loops already walk
      // `bonds` in order, so the id was pure overhead.
      const cashDemandWeightByIndex = new Float64Array(nB);
      let totalCashDemandWeightLocal = 0;
      for (let bi = 0; bi < nB; bi++) {
        const b = bonds[bi];
        const f = companyTerms[b.ci].subIG ? entitySubIGFactor : 1;
        const structuralLocal = (b.faceLocal + b.offeringLocal) * entityShare * f;
        const gapToTargetLocal = Math.max(0, structuralLocal - heldArr[bi]);
        const weightLocal = b.offeringLocal + gapToTargetLocal;
        cashDemandWeightByIndex[bi] = weightLocal;
        totalCashDemandWeightLocal += weightLocal;
      }

      // This entity's terms, PER PIECE OF PAPER. The reservation spread is the RV economics used
      // as what they always were — a PRICE. Below the level that covers this issuer's own
      // expected loss and the capital THIS paper consumes at this entity's own required return,
      // it does not want the bond at all; above it, it scales into its policy size. Two tranches
      // of one borrower get two answers, because the capital a position consumes is its own
      // duration's, and that difference IS the issuer's credit term structure.
      const demandRow = claimDemandRow(DS);
      for (let bi = 0; bi < nB; bi++) {
        const b = bonds[bi];
        const t = companyTerms[b.ci];
        // Two pricing regimes, one issuer hazard: regulated holders price spread vs expected
        // loss + capital cost; the distressed fund prices vs discounted expected recovery.
        const reservationBps = (strategy?.pricesOffRecovery
          ? b.distressedReservationBps
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn,
              expectedLossBps: t.expectedLossBps,
              capitalChargeRate: b.capitalChargeRate,
              creditConditionsIndex,
            })) + hedgeAdjBps;
        // A willingness-to-move stated in spread, restated as the price move it implies on THIS
        // bond at its own level. Duration does the conversion, which is what duration IS.
        const reservationPrice = priceAtSpread(b, reservationBps);
        const rangePrice = Math.max(1e-9, Math.abs(reservationPrice - priceAtSpread(b, reservationBps + fullSizeRangeBps)));
        const sizeFactor = t.subIG ? entitySubIGFactor : 1;
        const structuralSizeLocal = (b.faceLocal + b.offeringLocal) * entityShare * sizeFactor;
        // The bound is posted in FACE, and the money it stands for buys that face at the price
        // this book opened at — the same commitment 07e's index funds make, and for the same
        // reason: the cash constraint has to be expressible in the unit the auction allocates.
        setDemand(DS, demandRow, bi,
          reservationPrice,
          rangePrice,
          structuralSizeLocal * overweightMultiple,
          (classBudgetLocal *
            (totalCashDemandWeightLocal > 0
              ? cashDemandWeightByIndex[bi] / totalCashDemandWeightLocal
              : 0)) / Math.max(1e-9, openingPrice[bi]),
          0);
      }
      for (const bi of heldTouched) heldArr[bi] = 0;

      return { id: entity.id, currentHoldingsByInstrumentId: claimed, demandByInstrumentId: EMPTY_DEMAND_MAP, demandRow };
    });

    const priorDealerInventoryById = new Map<InstrumentId, number>();
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.instrumentId, p.inventoryLocal));

    // ETF: the index funds tracking this book's benchmarks. A fund posts a SIZE with no
    // reservation level — its benchmark weight at whatever the market is asking — which is the
    // one demand shape the engine could not previously express and a large real force in credit.
    // A credit index weights by MARKET VALUE, so a constituent's weight is spread over that
    // issuer's own bonds by what each is worth — the index owns the paper, not the borrower.
    const bookIndexIds = bookIndexIdsOf('CORP_BOND', regionId);
    const bondsByIssuerId = new Map<string, number[]>();
    bonds.forEach((b, bi) => {
      const key = companyTerms[b.ci].id;
      const list = bondsByIssuerId.get(key);
      if (list) list.push(bi); else bondsByIssuerId.set(key, [bi]);
    });
    const indexFundParticipants: ClearingParticipant[] = indexFundsForBook(
      ctx.v2,
      regionIndexFunds, ctx.updatedMarketIndexes, bookIndexIds, (e) => store.currentHoldingsLocal(e.id)
    ).map(({ fund, index, investableLocal }) => {
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      // A CREDIT index fund is a real buyer in the primary, unlike its equity counterpart. A bond
      // index admits a new issue at the next rebalance, and a fund that waits has to chase it in
      // the aftermarket — so it takes its proportional share at issue. (Equity index funds do the
      // opposite and buy at INCLUSION, which is why they are famously absent from IPOs; that
      // behaviour falls out of the quarterly rebalance without any special case.)
      const fundShareOfIndex = index.totalValueLocal > 0 ? investableLocal / index.totalValueLocal : 0;
      index.constituents.forEach((c) => {
        const list = bondsByIssuerId.get(c.instrumentId);
        if (!list || list.length === 0) return;
        let valueLocal = 0;
        list.forEach((bi) => { valueLocal += (bonds[bi].faceLocal + bonds[bi].offeringLocal) * openingPrice[bi]; });
        if (!(valueLocal > 0)) return;
        list.forEach((bi) => {
          const b = bonds[bi];
          const shareOfIssuer = ((b.faceLocal + b.offeringLocal) * openingPrice[bi]) / valueLocal;
          const targetValueLocal = investableLocal * c.weight * shareOfIssuer
            + b.offeringLocal * openingPrice[bi] * fundShareOfIndex;
          const px = Math.max(1e-9, openingPrice[bi]);
          demandByInstrumentId.set(
            b.id,
            // §7.270: the kernel's cash leg is traded PLUS the dealer fee, so a bound spent to
            // the last dollar overdraws by spread × gross — the fee rides outside the bound. A
            // fund that never walks away rides the bound exactly; shave it by the spread.
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

    // G3a: the market makers, one per named bank, sized by that bank's own leverage headroom
    // and funded by its own reserves. They are ordinary participants — the residual with no
    // owner this replaces is documented in domain/dealer-desk.ts.
    const regionBanks = banksOf(ctx.prevActiveFirms, regionId);
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      unitPriceOf: (i) => openingPrice[i],
    });
    const deskTickers = deskTickersOf(deskParticipants);

    // OWN7, second half: the desks' own books join the float now that they exist. A holder
    // outside this book keeps its position, so its paper was never for sale — and the residual no
    // named book holds at all was never for sale either, because there is no seller to decrement.
    const deskHeldLocal = positionsByInstrument(deskParticipants.map((d) => d.currentHoldingsByInstrumentId));
    setTradableFloat(instruments, heldByInstitutionsLocal, deskHeldLocal);

    const allParticipants = [...participants, ...indexFundParticipants, ...deskParticipants];
    const result = clearFinancialAsset(instruments, allParticipants, priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      // OWN7: the float here is a stock these participants already hold, so an unsold
      // position stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    // §4.C int flip — participant index for the dense holdings matrix (a fund filtered out of
    // the book has no row, exactly as it had no map entry).
    const piById = new Map(allParticipants.map((pp, pi) => [pp.id, pi]));
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `corporate bond:${id}`));
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} corporate bond`);

    /**
     * THE PRINT, DEPOSITED — but only where there was something to trade.
     *
     * A book with no float and no offering has no clearing level: the solve's target is zero, no
     * segment crosses it, and what comes back is the numerical bracket (§3.21). Depositing that
     * would put a 1%-of-par or 100×-par print on paper nobody bought or sold. Such an instrument
     * KEEPS the price it had, which is the honest answer and the one §3.21 asks every adapter to
     * be able to give.
     */
    const clearedPriceById = new Map<InstrumentId, number>();
    for (let bi = 0; bi < nB; bi++) {
      const b = bonds[bi];
      const outcome = result.primaryOutcomeById.get(b.id);
      const placedLocal = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeLocal) : 0;
      const tradedSomething = instruments[bi].tradableFloatLocal > 0 || placedLocal > 0;
      const px = result.newStatByIndex[bi];
      const printed = tradedSomething && px > 0 && isFinite(px);
      clearedPriceById.set(b.id, printed ? px : openingPrice[bi]);
      if (printed) setClearedPrice(v2, b.id, px);
    }

    // WS8: settle this week's priced offerings — lead bank pays the unsold residual and takes
    // the fee; stage 08 issues the tranche at the terms this book struck and priced.
    // G3c: the lead quotes THIS deal — the desks' own spread, plus what a week's price move can
    // cost on the residual the desks cannot absorb.
    const bookCapacityLocal = totalDeskCapacityLocal(ctx, regionBanks, BOOK);
    // §7.259: the settlement call moved BELOW applyDealerDeskFills — called here it landed the
    // lead's residual on its desk between the clearing and the rebuild-from-fills, which
    // deleted it with no cash leg and charged it to equity as a phantom fee (see 07d).

    // Apply: each entity's real new CORP_BOND holdings. The rows name the TRANCHE the auction
    // priced — the issuer-level split that had to invent them is deleted (§9.13-CREDIT row 4).
    // SCALE C1: the entities here ARE the store's working copies, and the fill rows are appended
    // to the store for the single write-back after 07e. SETL6: the cash leg is settled below as
    // payment instructions, not mutated here.
    const holdingRow = parHoldingRow('CORP_BOND', regionId);
    writeBackClearedFills({
      store, entities: bookEntities, piById, claimedByEntity, result,
      instrumentIdOfColumn: (bi) => bonds[bi].id, priced: bondFaceById, row: holdingRow,
    });

    // Apply: each desk's inventory, onto the bank that carried it. The regional array is now
    // the DERIVED sum of the named desks — nothing decides off it (G3a).
    const deskViewByInstrument = applyDealerDeskFills({
      piById, ctx, banks: regionBanks, book: BOOK, instruments, result,
      // Only ids this session priced reach here (`applyDealerDeskFills` tests `clearedIds` before
      // every call); par is the answer for anything else, which is what a book nobody printed is
      // carried at everywhere else in this model.
      unitPriceOf: (id) => clearedPriceById.get(id) ?? 1,
    });
    // §7.259: AFTER the fills application, so the lead's residual survives to next week's
    // clearing as a real prior position.
    settlePricedOfferings(regionId, 'CORP_BOND', offeringsByIssuerId, result, ctx,
      (o, clearedPrice) => o.sizeLocal * clearedPrice,
      (o, clearedPrice) => underwritingFeeBps({
        bookSpreadBps: DEALER_SPREAD_BPS,
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'PRICE_LIKE', currentStat: clearedPrice,
          // The concession THIS deal conceded: what the book paid against the par it was struck
          // at. A deal that prices through par cost the underwriter nothing to guarantee.
          weeklyMovePct: Math.abs(clearedPrice - 1),
        }),
        dealSizeLocal: o.sizeLocal,
        deskCapacityLocal: bookCapacityLocal,
      }),
      BOOK,
      {
        instrumentIdOf: (o) => primaryTrancheId(o.issuerId, o.purpose, week),
        unitPriceOfStat: (clearedPrice) => clearedPrice,
        // The paper the market priced is the paper that gets issued: stage 08 takes these terms
        // rather than re-striking a coupon off a curve this book has already moved past.
        termsOf: (o) => primaryTermsById.get(primaryTrancheId(o.issuerId, o.purpose, week)),
      });
    const newDealerInventory: { instrumentId: InstrumentId; inventoryLocal: number }[] = [];
    deskViewByInstrument.forEach((inventoryLocal, instrumentId) => {
      if (Math.abs(inventoryLocal) > 1) newDealerInventory.push({ instrumentId, inventoryLocal });
    });
    reg.bankingSector = { ...reg.bankingSector, corpBondDealerInventory: newDealerInventory };

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
    // ONE reading of who a participant is, for both halves of its settlement: the money and the
    // accrual ledger's key. The weekly accrual walk names its holders the same way
    // (`shared-helpers.ts:applyHolderInterestAccruals` — an institution's own id, a desk's
    // participant id), so a balance moved here is a balance that walk will find.
    const partyOfParticipant = participantPartyOf({ regionId, entityIds, deskTickers });
    // §3.13b: the accrued travels with the face — the ledger half here, the cash half below,
    // through the same clearing house as the paper. 13b could not do this on the corporate side
    // because the auction named a COMPANY and the ledger names a tranche, so there was no
    // per-tranche face delta for the accrued to ride; row 1 made every fill name its paper.
    const accruedLeg = accruedOnFills(
      allParticipants, result.newParticipantHoldings,
      (id) => accruedPerFaceById.get(id) ?? 0,
      (instrumentId, participantId, usd) => moveCorporateAccrued(
        ctx.holderAccruedInterestLocal, 'CORP_BOND', instrumentId, participantId, usd)
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
      // The net per instrument is ITS OWN borrower's: this book has one issuer per piece of paper,
      // not one for the book. A deal struck this week has accrued nothing, so the only net here is
      // seasoned paper's — and a secondary session redistributes a fixed float, so it is dust.
      { ...accruedLeg, issuerOf: issuerPartyOf }
    );
  });
}
