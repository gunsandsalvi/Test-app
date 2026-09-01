/**
 * Stage 7d: Leveraged Loan Real Clearing
 *
 * Foundational correction (Wall Street): a loan's discount margin must be the actual result of
 * real supply and demand — exactly like corporate bonds, but a genuinely different real market.
 * Floating-rate leveraged loans are bought predominantly by CLOs and loan-fund vehicles (an
 * asset-manager product), not the same bond-fund investor base that buys an issuer's fixed-rate
 * paper — insurers and pension funds barely touch broadly syndicated loans directly in reality.
 * See AssetAllocationTarget.loanPct (carved out of each entity's total corporate-credit
 * appetite, split from corpBondPct at initialization).
 *
 * Instruments are each issuer's own FLOATING-rate tranches (the real leveraged loan; FIXED
 * tranches are real bonds, cleared separately in 07b-corporate-bond-clearing.ts). Fair value for
 * a loan is anchored on that same issuer's own real, already-cleared bond spread
 * (comp.oasSpreadBps, from 07b, which runs first) discounted for the loan's real senior-secured
 * structural seniority — the same issuer's credit risk, priced at its own real technicals.
 *
 * Banks play the dealer role (loanDealerInventory) exactly as they do for corporate bonds — real
 * market-making on the syndicated/traded portion, distinct from a bank's own real business loan
 * book (businessLoanBookUSD), which is driven by real lending activity, not a portfolio
 * allocation decision this engine models.
 *
 * Must run after 07b (so comp.oasSpreadBps is already real this week) and before stage 8, which
 * reads comp.leveragedLoan.discountMarginBps/pricePar as already-real, already-cleared values.
 */

import { GameState, RegionId, ItemizedHolding, InstitutionalEntity, Company } from '../../../types';
import { ensureV2, V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_FACILITY } from '../../../engine2/tranches';
import { isActiveCompany } from '../../../domain/company';
import {
  computeReservationSpreadBps,
  FULL_SIZE_SPREAD_RANGE_BPS,
  MAX_OVERWEIGHT_MULTIPLE,
  DISTRESSED_CONVICTION_MULTIPLE,
  computeDistressedReservationSpreadBps,
  spreadRiskCapitalChargeRate,
  entityRequiredReturn,
} from './asset-allocation';
import { computeAnnualDefaultProbability, creditRecoveryRate } from './shared-helpers';
import { distributeRealTargetByWeight } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetUSD } from './institutional-balance-sheet';
import { pendingSettlementUSD } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf, totalDeskCapacityUSD } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand , YIELD_LIKE_MIN_WEEKLY_MOVE_BPS } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<string, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/fx-hedging';
import { REGION_IDS } from '../../../domain/geography';
import { reconcileHolderPrincipal } from './holder-paydown';

const MAX_WEEKLY_SPREAD_MOVE_PCT = 0.25;
const STRATEGIC_TARGET_DRIFT_RATE = 0.05;
const WEEKLY_TACTICAL_REBALANCE_RATE = 0.20;
// Senior-secured first-lien loans trade at a real, structural discount to the same issuer's
// unsecured bond spread — collateral and seniority mean less loss given default.
const SENIOR_LIEN_DISCOUNT = 0.85;
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['leveraged loan'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'leveraged loan';

function floatingDebtUSD(v2: V2World, comp: Company): number {
  // G2: bank FACILITIES (revolvers, maintenance bridges) are excluded — they are loans on a
  // named bank's itemized book, not syndicated paper this market can hold. Counting them here
  // was the §6 double-count: the same principal on the bank book AND in institutional
  // holdings, expensed once by the issuer and received twice.
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if ((S.flags[r] & TR_FLOATING) && !(S.flags[r] & TR_FACILITY)) sum += S.principalUSD[r];
  }
  return sum;
}

function loanCreditDurationYears(comp: Company): number {
  return Math.min(4.0, Math.max(1.0, (comp.leveragedLoan?.tenorYears ?? 5) * 0.7));
}

export function runLeveragedLoanClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const regionIds = REGION_IDS;

  // SCALE: same per-run memo and hoist as 07b — floatingDebtUSD walks the ladder per call and
  // nothing in this stage changes a ladder.
  const floatingDebtById = new Map<string, number>();
  const floatingDebtOf = (c: Company): number => {
    let v = floatingDebtById.get(c.id);
    if (v === undefined) { v = floatingDebtUSD(v2, c); floatingDebtById.set(c.id, v); }
    return v;
  };
  const loanStockByRegion: Record<string, number> = {};
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    loanStockByRegion[r] = ctx.prevActiveFirms
      .filter((c) => c.region === r).reduce((a, c) => a + floatingDebtOf(c), 0);
  });

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];

    // This stage owns whether a loan quote exists at all, because it owns the loan market. A
    // company has a quote exactly while it has floating-rate debt: the syndicate opens one when
    // the loan is drawn and there is nothing left to quote once it is repaid. Without this the
    // quote outlived the loan, and since the clearing below (rightly) skips a company with no
    // floating debt, those orphaned quotes froze at whatever level generation gave them and then
    // reported themselves as live prices for the rest of the run.
    // WS8/HC6: an issuer bringing its FIRST loan (an LBO financing, a term-out) is a
    // loan-market name the week it launches — it has no float yet, and a book that only knows
    // existing borrowers can never price a debut. Without this the offering sat in the queue
    // forever: the instrument was never in the book, so it was never priced, settled or pulled
    // (measured: 767 offering-weeks of LBO financings stuck, zero deals done).
    const debutIssuerIds = new Set(
      ctx.primaryOfferingsWorking
        .filter((o) => o.region === regionId && o.instrumentType === 'LEVERAGED_LOAN')
        .map((o) => o.issuerId)
    );
    [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].forEach((c) => {
      if (c.region !== regionId || !isActiveCompany(c)) return;
      const hasLoan = floatingDebtOf(c) > 0 || debutIssuerIds.has(c.id);
      if (!hasLoan) {
        if (c.leveragedLoan) c.leveragedLoan = undefined;
        return;
      }
      if (c.leveragedLoan) return;
      // A newly drawn loan opens at the issuer's own credit, priced off its bonds at the senior
      // lien's discount — the same relationship the clearing below maintains thereafter — so it
      // enters the auction already consistent with the rest of that issuer's capital structure.
      const openingMarginBps = Math.round(c.oasSpreadBps * SENIOR_LIEN_DISCOUNT);
      c.leveragedLoan = {
        quotedMarginBps: openingMarginBps,
        referenceBenchmark:
          regionId === 'USA' ? 'SOFR' : regionId === 'EUR' ? 'EURIBOR' : regionId === 'UK' ? 'SONIA' : 'TONA',
        pricePar: 100,
        discountMarginBps: openingMarginBps,
        tenorYears: 5,
        seniority: 'Senior Secured First Lien',
        recoveryRate: 1 - SENIOR_LIEN_DISCOUNT * (1 - creditRecoveryRate(reg)),
      };
    });

    // HC2: private issuers' loans trade here too — and in reality the leveraged-loan market is
    // MOSTLY private, sponsor-owned issuers; the public-only version was the anomaly.
    const regionCompanies = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
      (c) => c.region === regionId && isActiveCompany(c) && !!c.leveragedLoan
        && (floatingDebtOf(c) > 0 || debutIssuerIds.has(c.id))
    );
    if (regionCompanies.length === 0) return;

    // OWN2 claimed the float here was the whole outstanding, on the grounds that
    // `floatingDebtUSD` already removes every bank FACILITY. Removing the one non-participant it
    // could name is not the same as naming every participant: measured over ten weeks, the desks
    // absorbed 2.7B of loan paper sold by NOBODY. The shrink is applied below, once the desks
    // exist — the float is what this book's holders hold between them, nothing more.
    // WS8: primary loan offerings priced alongside the outstanding stock (HC6's LBO/recap
    // financings arrive through this same gate).
    const offeringsByIssuerId = new Map<string, import('../../../types').PrimaryOffering>();
    ctx.primaryOfferingsWorking.forEach((o) => {
      if (o.region === regionId && o.instrumentType === 'LEVERAGED_LOAN') offeringsByIssuerId.set(o.issuerId, o);
    });

    // The size an allocator targets is the size of the instrument that will EXIST once the deal
    // prices: outstanding stock PLUS the paper on offer. Sizing the schedules off the outstanding
    // stock alone made the demand side mechanically incapable of absorbing new supply — every
    // ceiling was a multiple of the PRE-issue float, so any offering material next to it drove
    // the solve past the issuer's walk-away and the deal was pulled. Measured: every LBO
    // financing withdrawn (500 offering-weeks, zero deals in 120 weeks), and the recap book
    // placing only where the deal happened to be small against the stock. A real benchmark
    // reweights when a new issue enters it. What the book still cannot do is pay with money it
    // does not have: `maxNetPurchaseUSD` is untouched, so a deal the market cannot fund is still
    // pulled — which is the honest reason for a deal to fail.
    const offeringSizeUSD = (c: Company) => offeringsByIssuerId.get(c.id)?.sizeUSD ?? 0;
    const liveTradableFloatUSD = (c: Company) => floatingDebtOf(c) + offeringSizeUSD(c);

    const totalOutstandingUSD =
      regionCompanies.reduce((s, c) => s + floatingDebtOf(c) + offeringSizeUSD(c), 0) || 1;

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: floatingDebtOf(c),
      tradableFloatUSD: floatingDebtOf(c),
      currentStat: c.leveragedLoan!.discountMarginBps,
      statKind: 'YIELD_LIKE',
      durationYears: loanCreditDurationYears(c),
      primaryOfferingUSD: offeringsByIssuerId.get(c.id)?.sizeUSD,
      primaryWithdrawStat: offeringsByIssuerId.get(c.id)?.walkAwayStat,
      // No ceiling — same reasoning as the bond book (07b): the distressed regime always bids at
      // some price, and where it stands is where a widening arrests.
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
    const issuerIdsThisRegion = new Set(regionCompanies.map((c) => c.id));
    const currentHoldingByCompanyByEntity = new Map<string, Map<string, number>>();

    // SCALE C1: positions come off the shared store's LEVERAGED_LOAN rows — one claim-scan per
    // entity. XB1 / §7.34 still holds: only THIS region's paper is claimed; everything else
    // passes through the write-back untouched.
    const store = ctx.holdingsStore!;
    bookEntities.forEach((entity) => {
      const currentHoldingByCompany = new Map<string, number>();
      store.scan(entity.id, 'LEVERAGED_LOAN', (h) => {
        if (!issuerIdsThisRegion.has(h.instrumentId)) return false;
        currentHoldingByCompany.set(h.instrumentId, (currentHoldingByCompany.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        return true;
      });
      currentHoldingByCompanyByEntity.set(entity.id, currentHoldingByCompany);
    });

    // §7.259 — settle the borrowers' retired principal ON THE HOLDERS before this book clears:
    // scale every position to the issuer's real outstanding and pay the difference in cash
    // (see holder-paydown.ts). Without this, every maturity/prepayment left the books holding
    // claims on principal already repaid, and the loan ledger minted 2–3% within weeks.
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    reconcileHolderPrincipal({
      ctx, regionId,
      outstandingByIssuerId: new Map(regionCompanies.map((c) => [c.id, floatingDebtOf(c)])),
      issuerById: new Map(regionCompanies.map((c) => [c.id, c])),
      holdingsByEntity: currentHoldingByCompanyByEntity,
      banks: regionBanks,
      deskBook: BOOK,
      reason: 'loan principal paydown to holders',
    });
    // OWN7, first half: the float is what this book's holders hold, and the INSTITUTIONS' half of
    // it is known here. It is set before the desks are built rather than after, because a desk is
    // sized against the LIVE float — leaving `tradableFloatUSD` at the whole outstanding until
    // after the desk build gave every desk capacity against an issue that is not for sale, and a
    // float of zero makes `buildDealerDeskParticipants` hand back no desk at all.
    const heldByInstitutionsUSD = new Map<string, number>();
    currentHoldingByCompanyByEntity.forEach((byCompany) => byCompany.forEach((usd, id) => {
      if (usd > 0) heldByInstitutionsUSD.set(id, (heldByInstitutionsUSD.get(id) ?? 0) + usd);
    }));
    instruments.forEach((inst) => { inst.tradableFloatUSD = heldByInstitutionsUSD.get(inst.id) ?? 0; });

    // XB1: each entity's own book decides its target — assets x loan allocation x mandate.
    const rawEntityTargets = new Map<string, number>(
      regionEntities.map((e) => [
        e.id,
        e.totalAssetsUSD * e.assetAllocationTarget.loanPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, loanStockByRegion),
      ])
    );

    // Same per-region memoization as 07b — see the optimization note in the plan's §6.
    const pdByCompanyId = new Map<string, number>();
    regionCompanies.forEach((c) => pdByCompanyId.set(c.id, computeAnnualDefaultProbability(v2, c)));

    // Per-company terms hoisted out of the per-entity loops — same expressions once instead of
    // per (entity x name) pair; see 07b's twin comment.
    const loanRecoveryRate = 1 - SENIOR_LIEN_DISCOUNT * (1 - creditRecoveryRate(reg));
    const companyTerms = regionCompanies.map((c) => {
      const annualPd = pdByCompanyId.get(c.id)!;
      const durationYears = loanCreditDurationYears(c);
      return {
        id: c.id,
        liveFloatUSD: liveTradableFloatUSD(c),
        offeringUSD: offeringSizeUSD(c),
        expectedLossBps: annualPd * (1 - loanRecoveryRate) * 10000,
        capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, durationYears) * SENIOR_LIEN_DISCOUNT,
        distressedReservationBps: computeDistressedReservationSpreadBps({
          annualDefaultProbability: annualPd,
          recoveryRate: loanRecoveryRate,
          durationYears,
        }),
      };
    });
    const sectorTotal = Array.from(rawEntityTargets.values()).reduce((a, v) => a + v, 0) || 1;

    // §4.C Stage I — dense pair loops (07b/07e's shape, §7.327 (1)): the per-(entity, name)
    // holding probe becomes an array read; both passes keep companyTerms order, so every float
    // accumulates exactly as before.
    const tiById = new Map<string, number>();
    companyTerms.forEach((t, ti) => tiById.set(t.id, ti));
    const heldArr = new Float64Array(companyTerms.length);
    const heldTouched: number[] = [];

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;
      heldTouched.length = 0;
      currentHoldingByCompany.forEach((usd, id) => {
        const ti = tiById.get(id);
        if (ti !== undefined) { heldArr[ti] = usd; heldTouched.push(ti); }
      });
      const entityShareOfSector = rawEntityTargets.get(entity.id) ?? 0;
      const entityShare = entityShareOfSector / sectorTotal;
      const requiredReturn = entityRequiredReturn(entity);
      // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
      // discounted expected recovery instead of expected loss, and running the conviction size
      // that goes with it, is one strategy — the credit long-short book beside it is an ordinary
      // relative-value buyer and prices like one.
      const isHedgeFund = entity.entityType === 'HEDGE_FUND' && entity.hedgeFundStrategy === 'DISTRESSED';
      const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
        ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate);
      const overweightMultiple = isHedgeFund ? DISTRESSED_CONVICTION_MULTIPLE : MAX_OVERWEIGHT_MULTIPLE;
      // The entity's real money for this auction (S11), directed at the names where paper is
      // actually changing hands: a live offering, or the gap between what this holder targets and
      // what it already owns. A name it is already at target in, with nothing on offer, needs
      // none of this week's cash — and splitting the class budget across the entire STOCK
      // instead starved the primary market by construction, because a new issue's slice was its
      // issuer's index weight rather than its own size. Measured on an LBO financing: the book
      // could HOLD it (53.7M of capacity against a 40.1M post-issue float) but could only FUND
      // 14.0M, so the solve ran past the sponsor's walk-away and every deal was pulled.
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'LEVERAGED_LOAN', pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id }));
      // SCALE: indexed by companyTerms position, not a Map keyed by id — both loops already
      // walk companyTerms in order, so the id was pure overhead.
      const cashDemandWeightByIndex = new Float64Array(companyTerms.length);
      let totalCashDemandWeightUSD = 0;
      for (let ti = 0; ti < companyTerms.length; ti++) {
        const t = companyTerms[ti];
        const structuralUSD = t.liveFloatUSD * entityShare;
        const gapToTargetUSD = Math.max(0, structuralUSD - heldArr[ti]);
        const weightUSD = t.offeringUSD + gapToTargetUSD;
        cashDemandWeightByIndex[ti] = weightUSD;
        totalCashDemandWeightUSD += weightUSD;
      }

      // Same terms as the bond book, at the loan's own economics: a first-lien loan's collateral
      // means less is expected to be lost on it and less capital is tied up holding it, so it
      // clears its cost at a tighter margin than the same issuer's unsecured paper. That is the
      // structural relationship between the two markets, expressed where it belongs — in what
      // each set of holders will pay — rather than as a fixed multiple between two statistics.
      const demandByIndex: (ParticipantDemand | undefined)[] = new Array(companyTerms.length);
      for (let ti = 0; ti < companyTerms.length; ti++) {
        const t = companyTerms[ti];
        // The loan's recovery is derived from the same senior-lien discount that scales its
        // expected loss, and the collateral that raises recovery also lowers the capital its
        // spread risk consumes — one lien, both consequences (terms hoisted above).
        const reservationBps = isHedgeFund
          ? t.distressedReservationBps
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn,
              expectedLossBps: t.expectedLossBps,
              capitalChargeRate: t.capitalChargeRate,
              creditConditionsIndex: reg.bankingSector.creditConditionsIndex ?? 0,
            });
        const structuralSizeUSD = t.liveFloatUSD * entityShare;
        demandByIndex[ti] = {
          // XB2: a cross-border loan is hedged like a bond — the CIP cost is in the requirement.
          reservationStat: reservationBps + hedgeAdjBps,
          maxHoldingUSD: structuralSizeUSD * overweightMultiple,
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
          maxNetPurchaseUSD:
            classBudgetUSD *
            (totalCashDemandWeightUSD > 0
              ? cashDemandWeightByIndex[ti] / totalCashDemandWeightUSD
              : 0),
        };
      }
      for (const ti of heldTouched) heldArr[ti] = 0;

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId: EMPTY_DEMAND_MAP, demandByIndex };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.loanDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    // ETF: the index funds tracking this book's benchmarks. A fund posts a SIZE with no
    // reservation level — its benchmark weight at whatever the market is asking — which is the
    // one demand shape the engine could not previously express and a large real force in credit.
    const bookIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'LEVERAGED_LOAN' && d.region === regionId)
      .map((d) => d.id);
    const indexFundParticipants: ClearingParticipant[] = indexFundsForBook(
      regionIndexFunds, ctx.updatedMarketIndexes, bookIndexIds, (e) => store.currentHoldingsUSD(e.id)
    ).map(({ fund, index, investableUSD }) => {
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      // A CREDIT index fund is a real buyer in the primary, unlike its equity counterpart. A bond
      // index admits a new issue at the next rebalance, and a fund that waits has to chase it in
      // the aftermarket — so it takes its proportional share at issue. (Equity index funds do the
      // opposite and buy at INCLUSION, which is why they are famously absent from IPOs; that
      // behaviour falls out of the quarterly rebalance without any special case.)
      const fundShareOfIndex = index.totalValueUSD > 0 ? investableUSD / index.totalValueUSD : 0;
      index.constituents.forEach((c) => {
        const offeringUSD = offeringsByIssuerId.get(c.instrumentId)?.sizeUSD ?? 0;
        const targetUSD = investableUSD * c.weight + offeringUSD * fundShareOfIndex;
        demandByInstrumentId.set(
          c.instrumentId,
          // §7.270: shaved by the dealer spread — the kernel's cash leg is traded PLUS fee,
          // and a bound spent exactly overdraws by spread × gross (see 07b).
          indexFundDemand(targetUSD, Math.max(0, (fund.cashUSD ?? 0) + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: fund.id })) * c.weight / (1 + DEALER_SPREAD_BPS / 10000), 'YIELD_LIKE')
        );
      });
      return {
        id: fund.id,
        currentHoldingsByInstrumentId: currentHoldingByCompanyByEntity.get(fund.id) ?? new Map<string, number>(),
        demandByInstrumentId,
      };
    });

    // G3a: the named banks' loan-trading desks, sized by their own headroom.
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
    });
    const deskTickers = deskTickersOf(deskParticipants);

    // OWN7, second half: the desks' own books join the float now that they exist. A holder
    // outside this book keeps its position, so its paper was never for sale — and the residual no
    // named book holds at all was never for sale either, because there is no seller to decrement.
    const deskHeldUSD = new Map<string, number>();
    deskParticipants.forEach((d) => d.currentHoldingsByInstrumentId.forEach((usd, id) => {
      if (usd > 0) deskHeldUSD.set(id, (deskHeldUSD.get(id) ?? 0) + usd);
    }));
    instruments.forEach((inst) => {
      inst.tradableFloatUSD = (heldByInstitutionsUSD.get(inst.id) ?? 0) + (deskHeldUSD.get(inst.id) ?? 0);
    });

    const allParticipants = [...participants, ...indexFundParticipants, ...deskParticipants];
    const result = clearFinancialAsset(instruments, allParticipants, priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
      // OWN7: the float here is a stock these participants already hold, so an unsold
      // position stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `leveraged loan:${id}`));
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} leveraged loan`);
    // G3c: quoted per deal — the desks' spread plus a week's spread move through the loan's own
    // duration, on the residual the desks cannot absorb.
    const bookCapacityUSD = totalDeskCapacityUSD(ctx, regionBanks, BOOK);
    const durationById = new Map(regionCompanies.map((c) => [c.id, loanCreditDurationYears(c)]));
    // §7.259: the settlement (which lands the lead's unsold residual on its desk inventory)
    // moved BELOW applyDealerDeskFills. Called here — between the clearing and the fills
    // application — the residual arrived on the sheet only for the rebuild-from-fills to delete
    // it the same instant: no cash leg (the kernel never saw the position), and the fee formula
    // then charged the whole residual to the lead's EQUITY as a phantom spread. The lead paid
    // for the paper twice — reserves via the residual payment, equity via the fee — and held
    // nothing. Measured: 1.6–3.1B/week per lead bank, every region, the whole life of the
    // desks; it is what drained the UK cohort to CCC (§7.259).

    // Apply: real cleared discount margin + derived price-to-par, mutated in place so stage 8
    // reads it as an already-real value. Also extend the rolling history for momentum.
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    // §4.C int flip — instruments[i] IS regionCompanies[i]; map insertion order was index order.
    const piById = new Map(allParticipants.map((pp, pi) => [pp.id, pi]));
    for (let ii = 0; ii < result.nInstruments; ii++) {
      const newDiscountMarginBps = result.newStatByIndex[ii];
      const comp = regionCompanies[ii];
      if (!comp.leveragedLoan) continue;
      const history = [...(comp.leveragedLoan.discountMarginBpsHistory || []), comp.leveragedLoan.discountMarginBps];
      const marginDeltaBps = newDiscountMarginBps - comp.leveragedLoan.quotedMarginBps;
      const creditDuration = loanCreditDurationYears(comp);
      comp.leveragedLoan = {
        ...comp.leveragedLoan,
        discountMarginBps: newDiscountMarginBps,
        pricePar: Number((100 - (marginDeltaBps / 10000) * creditDuration * 100).toFixed(2)),
        discountMarginBpsHistory: history.slice(-8),
      };
    }

    // Apply: each entity's real new LEVERAGED_LOAN holdings.
    // SCALE C1: fills append to the store for the single write-back after 07e. SETL6: the cash
    // leg is settled below as payment instructions.
    bookEntities.forEach((entity) => {
      const pi = piById.get(entity.id);
      const newLoanHoldings: ItemizedHolding[] = [];
      if (pi !== undefined) {
        const base = pi * result.nInstruments;
        for (let ii = 0; ii < result.nInstruments; ii++) {
          const newHoldingUSD = result.holdingsMatrix[base + ii];
          if (newHoldingUSD > 1) newLoanHoldings.push({ instrumentId: regionCompanies[ii].id, instrumentType: 'LEVERAGED_LOAN', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD });
        }
      }
      store.append(entity.id, newLoanHoldings);
    });

    // Apply: real dealer inventory.
    // G3a: owned by the desks that took it; the regional array is the derived sum.
    const deskViewByCompany = applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });
    // §7.259: AFTER the fills application, so the residual written onto the lead's desk
    // survives to next week's clearing — where the build hands it to the kernel as a real prior
    // position that can be genuinely sold.
    settlePricedOfferings(regionId, 'LEVERAGED_LOAN', offeringsByIssuerId, result, ctx, (o) => o.sizeUSD,
      (o, clearedStat) => underwritingFeeBps({
        bookSpreadBps: DEALER_SPREAD_BPS,
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'YIELD_LIKE', currentStat: clearedStat,
          maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
          minWeeklyStatMoveBps: YIELD_LIKE_MIN_WEEKLY_MOVE_BPS,
          durationYears: durationById.get(o.issuerId) ?? 0,
        }),
        dealSizeUSD: o.sizeUSD,
        deskCapacityUSD: bookCapacityUSD,
      }),
      BOOK);
    const newDealerInventory: { companyId: string; inventoryUSD: number }[] = [];
    deskViewByCompany.forEach((inventoryUSD, companyId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ companyId, inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, loanDealerInventory: newDealerInventory };

    // SETL6: the book's whole cash side, through the clearing house.
    const entityIds = new Set(bookEntities.map((e) => e.id));
    settleClearedBook(
      ctx, regionId, BOOK,
      result.netCashDeltaByParticipantId,
      (id) => (entityIds.has(id) ? { kind: 'INSTITUTION', id } : dealerDeskPartyOf(id, deskTickers)),
      { netCashUSD: result.dealerNetCashUSD, feeUSD: result.totalDealerRevenueUSD },
      feeDesksForRegion(ctx, regionId),
      // WS8: the CCP pays each issuer for the paper its deal actually placed.
      primaryTakes(result, (issuerId) => {
        const issuer = companyById.get(issuerId);
        return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
      })
    );
  });
}
