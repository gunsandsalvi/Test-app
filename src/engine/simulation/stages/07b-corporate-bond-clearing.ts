/**
 * Stage 7b: Corporate Bond Real Clearing
 *
 * Foundational correction (Wall Street): a bond's price/spread must be the actual result of
 * real supply and demand, not a formula that outputs a spread directly. OAS/discount margin is
 * a STATISTIC computed from the cleared price, never the primitive that sets it.
 *
 * This is the corporate-bond adapter over the generalized, asset-agnostic clearing engine (see
 * financial-clearing-engine.ts) — it owns only what's specific to corporate bonds:
 *
 * - Who the real participants are (named institutional entities, banks as dealer).
 * - Each entity's real, bottom-up total target (see deriveEntityTargetsUSD below) — never an
 *   independently-computed number that could exceed the real market and need a cap.
 * - Each participant's DEMAND SCHEDULE per issuer (§7.16's engine): a reservation spread built
 *   from the issuer's own structural default probability, the entity's rating- and
 *   duration-granular capital charge and required return on that capital (or, for distressed
 *   paper, the recovery arithmetic of the fund bidding it), the size it scales in over, and
 *   its real weekly budget (S11). The auction bisects for the spread where total demanded
 *   quantity equals the real tradable float.
 * - How the cleared price maps onto this asset class's quoted statistic (OAS moves opposite
 *   price — no realism floor or ceiling, purely a function of real demand versus govies).
 *
 * This adapter only covers each issuer's FIXED-rate tranches (real corporate bonds). Floating
 * tranches are real leveraged loans — a genuinely different market with a different investor
 * base (CLOs/loan funds, not bond funds) and different technicals — and get their own real
 * clearing (07d-leveraged-loan-clearing.ts), not a byproduct split of this one's fills.
 *
 * The actual auction — the demand-schedule solve, cores-first rationing, cash legs, dealer
 * residual — lives once in the shared engine; sovereign bonds, bills, loans, equity and the
 * repo session plug into the same engine as their own adapters rather than re-implementing it.
 *
 * Foreign and household participation in corporate bonds, and hedge funds bidding for
 * distressed issuers specifically, are follow-on slices (see PROJECT_WALL_STREET.md) — this
 * slice's real participants are named institutional entities and the bank dealer desk.
 *
 * Must run after stage 2b (bank diversification, so named banks and their dealer inventory
 * carry-forward already reflect this week) and before stage 8 (company fundamentals), which
 * reads comp.oasSpreadBps as an already-real, already-cleared value rather than computing one
 * itself.
 */

import { GameState, RegionId, ItemizedHolding, InstitutionalEntity, Company } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { computeExpectedLossSpreadBps, computeAnnualDefaultProbability, getRatingBucket, distributeRealTargetByWeight, creditRecoveryRate } from './shared-helpers';
import {
  computeReservationSpreadBps,
  FULL_SIZE_SPREAD_RANGE_BPS,
  isInvestmentGrade,
  subInvestmentGradeSizeFactor,
  spreadRiskCapitalChargeRate,
  MAX_OVERWEIGHT_MULTIPLE,
  DISTRESSED_CONVICTION_MULTIPLE,
  computeDistressedReservationSpreadBps,
  entityRequiredReturn,
} from './asset-allocation';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetUSD } from './institutional-balance-sheet';
import { pendingSettlementUSD } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf, totalDeskCapacityUSD } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, YIELD_LIKE_MIN_WEEKLY_MOVE_BPS } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<string, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/fx-hedging';
import { REGION_IDS } from '../../../domain/geography';
import { reconcileHolderPrincipal } from './holder-paydown';

// Within that slow-moving budget, how fast a participant rotates toward its currently most
// attractive names — tactical name selection is real and moves faster than the overall budget.
const MAX_WEEKLY_SPREAD_MOVE_PCT = 0.25;
const MAX_VALUE_TILT = 0.4;
// How much a tightening/loosening real credit-conditions backdrop (reg.bankingSector's own
// -1..+1 index) shifts what "fair value" means right now — real credit investors price a bond
// against the current market, not against an idiosyncratic PD estimate in a vacuum.
const CREDIT_CONDITIONS_FAIR_VALUE_SENSITIVITY_BPS = 150;
// Bid/ask spread the dealer desk earns on the gross flow it facilitates, credited as real
// trading revenue to the named banks' own equity (split by bankMarketShare).
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['corporate bond'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'corporate bond';
// Real insurers and pension funds overwhelmingly run investment-grade-only mandates in
// practice — a genuine structural avoidance of high-yield paper, not a soft preference.
const IG_MANDATE_HY_AVOIDANCE_TILT = -0.7;

function fixedDebtUSD(comp: Company): number {
  return (comp.debtTranches || []).filter((t) => t.rateType === 'FIXED' && !t.isCommercialPaper).reduce((s, t) => s + t.principalUSD, 0);
}

function creditDurationYears(comp: Company): number {
  const fixedTranches = (comp.debtTranches || []).filter((t) => t.rateType === 'FIXED' && !t.isCommercialPaper);
  const totalFixed = fixedDebtUSD(comp);
  if (fixedTranches.length === 0 || totalFixed <= 0) return 3.5;
  const weightedTenor = fixedTranches.reduce((s, t) => {
    const tenorYears = Math.max(0.5, (t.maturityWeek - t.originationWeek) / 52);
    return s + tenorYears * t.principalUSD;
  }, 0) / totalFixed;
  return Math.max(1.0, Math.min(8.0, weightedTenor * 0.75));
}

// Real insurers and pension funds carry long-dated liabilities and real asset-liability-matching
// mandates that favor longer-duration paper; asset managers run closer to benchmark-neutral.
function preferredDurationYears(entity: InstitutionalEntity): number {
  return entity.entityType === 'ASSET_MANAGER' ? 4.0 : 6.0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * How attractive THIS entity finds THIS issuer's bonds right now — a real, multi-factor tactical
 * view, not the target allocation itself. Combines: value (cheap/rich versus a fair-value
 * estimate that is itself adjusted for current credit conditions), recent momentum (a name
 * that's been widening fast is a riskier "catch the falling knife" buy even where it already
 * looks cheap), this entity's own mandate (IG-only funds structurally avoid high-yield), and
 * duration/maturity fit against this entity's own real liability/benchmark profile.
 */

export function runCorporateBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds = REGION_IDS;

  // SCALE: fixedDebtUSD filters and reduces a company's whole ladder per call, and the stage
  // used to call it ~14k times a week (four full-universe region sweeps included). Nothing in
  // this stage changes a ladder, so one computation per company per run is the same number.
  const fixedDebtById = new Map<string, number>();
  const fixedDebtOf = (c: Company): number => {
    let v = fixedDebtById.get(c.id);
    if (v === undefined) { v = fixedDebtUSD(c); fixedDebtById.set(c.id, v); }
    return v;
  };
  // Loop-invariant for the same reason — hoisted from the per-region iteration (it was four
  // identical full-universe sweeps per region, sixteen a week).
  const corpStockByRegion: Record<string, number> = {};
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    corpStockByRegion[r] = ctx.prevActiveFirms
      .filter((c) => c.region === r).reduce((a, c) => a + fixedDebtOf(c), 0);
  });

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    // HC2: the named private tier's paper trades here alongside the public universe — the
    // market prices an issuer's credit, not its listing status. Private issuers arrived with
    // their tradable float already seeded onto these same holders (initialization), so their
    // first clearing week opens with genuine small gaps, not a systemic buy-in.
    const regionCompanies = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
      (c) => c.region === regionId && isActiveCompany(c) && fixedDebtOf(c) > 0
    );
    if (regionCompanies.length === 0) return;

    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;

    // OWN2 claimed the float here was the whole outstanding, because this instrument is
    // "already net of what does not trade in it". MEASUREMENT FALSIFIED IT: over ten weeks the
    // desks took on 5.7B of corporate paper sold by NOBODY — an UNMODELED counterparty on the
    // sell side of every auction. The book's holders are the institutions and the desks; the
    // outstanding they do not hold between them belongs to nobody in this model, and handing
    // it to the bidders mints a claim. The shrink is applied below, once the desks exist.
    // WS8: this week's primary offerings in THIS book — new fixed-rate paper priced alongside
    // the outstanding stock. The issuer's walk-away rides on the instrument; the engine
    // re-solves without the offering when it is pulled.
    const offeringsByIssuerId = new Map<string, import('../../../types').PrimaryOffering>();
    ctx.primaryOfferingsWorking.forEach((o) => {
      if (o.region === regionId && o.instrumentType === 'CORP_BOND') offeringsByIssuerId.set(o.issuerId, o);
    });

    // An allocator sizes to the instrument that will EXIST once the deal prices — the
    // outstanding stock plus the paper on offer — because that is what its benchmark will hold.
    // Sizing off the outstanding stock alone left the demand side mechanically unable to absorb
    // new supply at any spread (see the same fix in 07d, where it withdrew every LBO financing).
    // The cash constraint is untouched: `maxNetPurchaseUSD` still decides whether the market can
    // actually pay for the deal, which is the honest reason for one to fail.
    const offeringSizeUSD = (c: Company) => offeringsByIssuerId.get(c.id)?.sizeUSD ?? 0;
    const liveTradableFloatUSD = (c: Company) => fixedDebtOf(c) + offeringSizeUSD(c);
    const totalOutstandingUSD =
      regionCompanies.reduce((s, c) => s + fixedDebtOf(c) + offeringSizeUSD(c), 0) || 1;

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: fixedDebtOf(c),
      tradableFloatUSD: fixedDebtOf(c),
      currentStat: c.oasSpreadBps,
      statKind: 'YIELD_LIKE',
      durationYears: creditDurationYears(c),
      primaryOfferingUSD: offeringsByIssuerId.get(c.id)?.sizeUSD,
      primaryWithdrawStat: offeringsByIssuerId.get(c.id)?.walkAwayStat,
      // No floor and no ceiling. The floor is an outcome: every bidder's reservation already
      // covers its own expected loss and capital cost, so demand tighter than that is genuinely
      // zero. The ceiling is an outcome too: the distressed regime below always has a bid at
      // SOME price — as the level widens, the implied cash price falls until the buyer's IRR on
      // expected recovery clears — so the widening arrests where that bid stands, not where a
      // bound says.
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
    const regionIndexFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'ETF' && e.etf
        && INDEX_DEFINITIONS.some((d) => d.id === e.etf!.indexId && d.assetClass === 'CORP_BOND')
    );
    const bookEntities = [...regionEntities, ...regionIndexFunds];
    const issuerIdsThisRegion = new Set(regionCompanies.map((c) => c.id));
    const currentHoldingByCompanyByEntity = new Map<string, Map<string, number>>();

    // SCALE C1: positions come off the shared store's CORP_BOND rows — one claim-scan per
    // entity instead of a sweep of its whole book. XB1 / §7.34 still holds: only THIS region's
    // paper is claimed (a JPN insurer's JPN bonds stay unclaimed and pass through the
    // write-back untouched, exactly as the old "other holdings" partition carried them).
    const store = ctx.holdingsStore!;
    bookEntities.forEach((entity) => {
      const currentHoldingByCompany = new Map<string, number>();
      store.scan(entity.id, 'CORP_BOND', (h) => {
        if (!issuerIdsThisRegion.has(h.instrumentId)) return false;
        currentHoldingByCompany.set(h.instrumentId, (currentHoldingByCompany.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        return true;
      });
      currentHoldingByCompanyByEntity.set(entity.id, currentHoldingByCompany);
    });

    // §7.259 — settle the borrowers' retired principal ON THE HOLDERS before this book clears
    // (see holder-paydown.ts; same defect and same fix as the loan book in 07d).
    const regionBanksEarly = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    reconcileHolderPrincipal({
      ctx, regionId,
      outstandingByIssuerId: new Map(regionCompanies.map((c) => [c.id, fixedDebtOf(c)])),
      holdingsByEntity: currentHoldingByCompanyByEntity,
      banks: regionBanksEarly,
      deskBook: BOOK,
      reason: 'bond principal paydown to holders',
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

    // XB1: each entity's target is ITS OWN book — assets x its corporate-credit allocation x
    // what its mandate allows in this issuer's market. The imposed institutional share,
    // renormalized across a fixed holder set, decided the answer the auction should produce.
    const rawEntityTargets = new Map<string, number>(
      regionEntities.map((e) => [
        e.id,
        e.totalAssetsUSD * e.assetAllocationTarget.corpBondPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, corpStockByRegion),
      ])
    );

    // Per-company quantities memoized ONCE per region-week, never inside the participants loop
    // (§6's optimization rule): the structural PD reads the debt ladder and revenue history and
    // was being recomputed once per entity x company — 4x the work for identical answers.
    const pdByCompanyId = new Map<string, number>();
    regionCompanies.forEach((c) => pdByCompanyId.set(c.id, computeAnnualDefaultProbability(c)));

    // Everything about a COMPANY that the per-entity loops below were recomputing per pair —
    // ~35 entities x ~350 names x 4 regions of identical answers per week. Hoisted once, same
    // expressions, same values (§7.32's optimization discipline; the profiler put this adapter
    // at 120 ms/week of self time).
    // ONE OWNER (§6.1's duplicate row): the recovery this book prices is the region's own
    // REALISED experience blended with the prior (`creditRecoveryRate`) — the same basis the
    // loan book and the CDS leg already price on. Pricing a fixed 0.4 here while resolutions
    // ran elsewhere was one market disagreeing with the world it clears in, and the CDS-cash
    // basis partly measured that disagreement.
    const regionRecoveryRate = creditRecoveryRate(reg);
    const companyTerms = regionCompanies.map((c) => {
      const annualPd = pdByCompanyId.get(c.id)!;
      const durationYears = creditDurationYears(c);
      return {
        id: c.id,
        creditRating: c.creditRating,
        subIG: !isInvestmentGrade(c.creditRating),
        liveFloatUSD: liveTradableFloatUSD(c),
        offeringUSD: offeringSizeUSD(c),
        expectedLossBps: annualPd * (1 - regionRecoveryRate) * 10000,
        capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, durationYears),
        distressedReservationBps: computeDistressedReservationSpreadBps({
          annualDefaultProbability: annualPd,
          recoveryRate: regionRecoveryRate,
          durationYears,
        }),
      };
    });
    // Identical for every entity; the old code re-reduced it inside each entity's closure.
    const sectorTotal = Array.from(rawEntityTargets.values()).reduce((a, v) => a + v, 0) || 1;

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;
      const entityShareOfSector = rawEntityTargets.get(entity.id) ?? 0;
      // Per-entity invariants of the per-name loops below.
      const entityShare = entityShareOfSector / sectorTotal;
      const entitySubIGFactor = subInvestmentGradeSizeFactor(entity.entityType);
      const requiredReturn = entityRequiredReturn(entity);
      // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
      // discounted expected recovery instead of expected loss, and running the conviction size
      // that goes with it, is one strategy — the credit long-short book beside it is an ordinary
      // relative-value buyer and prices like one.
      const isHedgeFund = entity.entityType === 'HEDGE_FUND' && entity.hedgeFundStrategy === 'DISTRESSED';
      const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
        ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate);
      const overweightMultiple = isHedgeFund ? DISTRESSED_CONVICTION_MULTIPLE : MAX_OVERWEIGHT_MULTIPLE;
      // The entity's real budget for this auction (S11): available cash plus its type's genuine
      // leverage capacity, sliced to this asset class by its own targets, then directed at the
      // names where paper is actually changing hands — a live offering, or the gap between what
      // this holder targets and what it already owns. A bid is a claim on money; this is the
      // money. Apportioning it across the whole STOCK instead gave a new issue a slice the size
      // of its issuer's index weight rather than of the deal, which starved the primary market by
      // construction (see the same fix and its measurement in 07d).
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'CORP_BOND', pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id }));
      // SCALE: indexed by companyTerms position, not a Map keyed by id — both loops already
      // walk companyTerms in order, so the id was pure overhead.
      const cashDemandWeightByIndex = new Float64Array(companyTerms.length);
      let totalCashDemandWeightUSD = 0;
      companyTerms.forEach((t, ti) => {
        const f = t.subIG ? entitySubIGFactor : 1;
        const structuralUSD = t.liveFloatUSD * entityShare * f;
        const gapToTargetUSD = Math.max(0, structuralUSD - (currentHoldingByCompany.get(t.id) ?? 0));
        const weightUSD = t.offeringUSD + gapToTargetUSD;
        cashDemandWeightByIndex[ti] = weightUSD;
        totalCashDemandWeightUSD += weightUSD;
      });

      // This entity's terms, per issuer. The reservation spread is the RV economics used as what
      // they always were — a PRICE. Below the level that covers this issuer's own expected loss
      // and the capital the position consumes at this entity's own required return, it does not
      // want the bond at all; above it, it scales into its policy size. The old engine used the
      // same numbers to nudge a quantity target, which is why spreads could settle through zero:
      // a nudged quota still has to be filled at whatever price results.
      const demandByIndex: (ParticipantDemand | undefined)[] = new Array(companyTerms.length);
      companyTerms.forEach((t, ti) => {
        // Rating enters this book in the two places it really acts: the capital the position
        // consumes and the size of the sub-IG sleeve the holder will run — never a prohibition
        // (see subInvestmentGradeSizeFactor for what modelling it as one did to HY clearing).
        // Two pricing regimes, one issuer hazard: regulated holders price spread vs expected
        // loss + capital cost; the distressed fund prices vs discounted expected recovery.
        const reservationBps = isHedgeFund
          ? t.distressedReservationBps
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn,
              expectedLossBps: t.expectedLossBps,
              capitalChargeRate: t.capitalChargeRate,
              creditConditionsIndex,
            });
        const sizeFactor = t.subIG ? entitySubIGFactor : 1;
        const structuralSizeUSD = t.liveFloatUSD * entityShare * sizeFactor;
        demandByIndex[ti] = {
          // XB2: hedged, so a foreign buyer's requirement carries the CIP cost of the hedge.
          reservationStat: reservationBps + hedgeAdjBps,
          maxHoldingUSD: structuralSizeUSD * overweightMultiple,
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
          maxNetPurchaseUSD:
            classBudgetUSD *
            (totalCashDemandWeightUSD > 0
              ? cashDemandWeightByIndex[ti] / totalCashDemandWeightUSD
              : 0),
        };
      });

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId: EMPTY_DEMAND_MAP, demandByIndex };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    // ETF: the index funds tracking this book's benchmarks. A fund posts a SIZE with no
    // reservation level — its benchmark weight at whatever the market is asking — which is the
    // one demand shape the engine could not previously express and a large real force in credit.
    const bookIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'CORP_BOND' && d.region === regionId)
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
          // §7.270: the kernel's cash leg is traded PLUS the dealer fee, so a bound spent to
          // the last dollar overdraws by spread × gross — the fee rides outside the bound. A
          // fund that never walks away rides the bound exactly; shave it by the spread.
          indexFundDemand(targetUSD, Math.max(0, (fund.cashUSD ?? 0) + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: fund.id })) * c.weight / (1 + DEALER_SPREAD_BPS / 10000), 'YIELD_LIKE')
        );
      });
      return {
        id: fund.id,
        currentHoldingsByInstrumentId: currentHoldingByCompanyByEntity.get(fund.id) ?? new Map<string, number>(),
        demandByInstrumentId,
      };
    });

    // G3a: the market makers, one per named bank, sized by that bank's own leverage headroom
    // and funded by its own reserves. They are ordinary participants — the residual with no
    // owner this replaces is documented in domain/dealer-desk.ts.
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
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

    const result = clearFinancialAsset(instruments, [...participants, ...indexFundParticipants, ...deskParticipants], priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
      // OWN7: the float here is a stock these participants already hold, so an unsold
      // position stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} corporate bond`);
    // WS8: settle this week's priced offerings — lead bank pays the unsold residual and takes
    // the fee; stage 08 posts the issuer's proceeds and creates the tranche at cleared terms.
    // G3c: the lead quotes THIS deal — the desks' own spread, plus what a week's spread move
    // through the deal's own duration can cost on the residual the desks cannot absorb.
    const bookCapacityUSD = totalDeskCapacityUSD(ctx, regionBanks, BOOK);
    const durationById = new Map(regionCompanies.map((c) => [c.id, creditDurationYears(c)]));
    // §7.259: the settlement call moved BELOW applyDealerDeskFills — called here it landed the
    // lead's residual on its desk between the clearing and the rebuild-from-fills, which
    // deleted it with no cash leg and charged it to equity as a phantom fee (see 07d).

    // Apply: real cleared OAS, mutated in place so stage 8 (which runs next) reads it as this
    // week's already-real value rather than recomputing one. Also extend each company's rolling
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    result.newStatById.forEach((newOasBps, companyId) => {
      const comp = companyById.get(companyId);
      if (!comp) return;
      const history = [...(comp.oasSpreadBpsHistory || []), comp.oasSpreadBps];
      comp.oasSpreadBpsHistory = history.slice(-8);
      comp.oasSpreadBps = newOasBps;
    });

    // Apply: each entity's real new CORP_BOND holdings. Loans are a genuinely different real
    // market (different investor base, different technicals) and get their own real clearing
    // (07d-leveraged-loan-clearing.ts), not a byproduct split of this fill.
    // SCALE C1: the entities here ARE the store's working copies, and the fill rows are appended
    // to the store for the single write-back after 07e. SETL6: the cash leg is settled below as
    // payment instructions, not mutated here.
    bookEntities.forEach((entity) => {
      const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
      const newCorpHoldings: ItemizedHolding[] = [];
      newHoldings.forEach((newHoldingUSD, companyId) => {
        if (newHoldingUSD > 1) newCorpHoldings.push({ instrumentId: companyId, instrumentType: 'CORP_BOND', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD });
      });
      store.append(entity.id, newCorpHoldings);
    });

    // Apply: each desk's inventory, onto the bank that carried it. The regional array is now
    // the DERIVED sum of the named desks — nothing decides off it (G3a).
    const deskViewByCompany = applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });
    // §7.259: AFTER the fills application, so the lead's residual survives to next week's
    // clearing as a real prior position.
    settlePricedOfferings(regionId, 'CORP_BOND', offeringsByIssuerId, result, ctx, (o) => o.sizeUSD,
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
    reg.bankingSector = { ...reg.bankingSector, corpBondDealerInventory: newDealerInventory };

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
