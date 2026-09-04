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
 * - Each entity's real, bottom-up total target (see deriveEntityTargetsLocal below) — never an
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

import { hedgeFundStrategyProfile } from '../../../domain/institution-profiles';
import { GameState, RegionId, ItemizedHolding, Company } from '../../../types';
import { ringPush, rowOf, ensureV2, V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_CP, issuerIdOf } from '../../../engine2/tranches';
import { splitAcrossTranches, primarySliceOf } from './register-split';
import { primaryTrancheId } from '../../../domain/primary-market';
import { isActiveCompany } from '../../../domain/company';
import { computeAnnualDefaultProbability, creditRecoveryRate } from './shared-helpers';
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
import { institutionUnsettledLessCollateralLocal, institutionSpendableLocal } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf, totalDeskCapacityLocal } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { openDemandStaging, claimDemandRow, setDemand, clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, YIELD_LIKE_MIN_WEEKLY_MOVE_BPS } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<string, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/derivatives/classes/fx-forward';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { reconcileHolderPrincipal } from './holder-paydown';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';

// Within that slow-moving budget, how fast a participant rotates toward its currently most
// How much a tightening/loosening real credit-conditions backdrop (reg.bankingSector's own
// -1..+1 index) shifts what "fair value" means right now — real credit investors price a bond
// against the current market, not against an idiosyncratic PD estimate in a vacuum.
// Bid/ask spread the dealer desk earns on the gross flow it facilitates, credited as real
// trading revenue to the named banks' own equity (split by bankMarketShare).
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['corporate bond'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'corporate bond';
// Real insurers and pension funds overwhelmingly run investment-grade-only mandates in
// practice — a genuine structural avoidance of high-yield paper, not a soft preference.

// §7.311 — ladder reads on rows (chain order = array order, so every fold is float-identical).
function fixedDebtLocal(v2: V2World, comp: Company): number {
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if (!(S.flags[r] & (TR_FLOATING | TR_CP))) sum += S.principalLocal[r];
  }
  return sum;
}

function creditDurationYears(v2: V2World, comp: Company): number {
  const S = v2.tranches;
  const totalFixed = fixedDebtLocal(v2, comp);
  let weighted = 0;
  let count = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if (S.flags[r] & (TR_FLOATING | TR_CP)) continue;
    count++;
    const tenorYears = Math.max(0.5, (S.maturityWeek[r] - S.originationWeek[r]) / 52);
    weighted += tenorYears * S.principalLocal[r];
  }
  if (count === 0 || totalFixed <= 0) return 3.5;
  return Math.max(1.0, Math.min(8.0, (weighted / totalFixed) * 0.75));
}

// Credit-book duration preference is the kind registry's `preferredCreditDurationYears` row.


/**
 * How attractive THIS entity finds THIS issuer's bonds right now — a real, multi-factor tactical
 * view, not the target allocation itself. Combines: value (cheap/rich versus a fair-value
 * estimate that is itself adjusted for current credit conditions), recent momentum (a name
 * that's been widening fast is a riskier "catch the falling knife" buy even where it already
 * looks cheap), this entity's own mandate (IG-only funds structurally avoid high-yield), and
 * duration/maturity fit against this entity's own real liability/benchmark profile.
 */

export function runCorporateBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const regionIds = REGION_IDS;

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
    // The cash constraint is untouched: `maxNetPurchaseLocal` still decides whether the market can
    // actually pay for the deal, which is the honest reason for one to fail.
    const offeringSizeLocal = (c: Company) => offeringsByIssuerId.get(c.id)?.sizeLocal ?? 0;
    const liveTradableFloatLocal = (c: Company) => fixedDebtOf(c) + offeringSizeLocal(c);

    const priorOasById = new Map(regionCompanies.map((c) => [c.id, c.oasSpreadBps]));
    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingLocal: fixedDebtOf(c),
      tradableFloatLocal: fixedDebtOf(c),
      currentStat: c.oasSpreadBps,
      statKind: 'YIELD_LIKE',
      durationYears: creditDurationYears(v2, c),
      primaryOfferingLocal: offeringsByIssuerId.get(c.id)?.sizeLocal,
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
        const issuerId = issuerIdOf(v2, h.instrumentId); // 13b: a row names a tranche or its issuer
        if (!issuerIdsThisRegion.has(issuerId)) return false;
        // A book trades PAR amounts. This reads the value because nothing marks credit yet;
        // when the mark lands it reads `faceLocal`, or a price move looks like a trade.
        currentHoldingByCompany.set(issuerId, (currentHoldingByCompany.get(issuerId) ?? 0) + h.quantityOrNotionalLocal);
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
      issuerById: new Map(regionCompanies.map((c) => [c.id, c])),
      holdingsByEntity: currentHoldingByCompanyByEntity,
      banks: regionBanksEarly,
      deskBook: BOOK, instrumentType: 'CORP_BOND',
      reason: 'bond principal paydown to holders',
    });
    // OWN7, first half: the float is what this book's holders hold, and the INSTITUTIONS' half of
    // it is known here. It is set before the desks are built rather than after, because a desk is
    // sized against the LIVE float — leaving `tradableFloatLocal` at the whole outstanding until
    // after the desk build gave every desk capacity against an issue that is not for sale, and a
    // float of zero makes `buildDealerDeskParticipants` hand back no desk at all.
    const heldByInstitutionsLocal = new Map<string, number>();
    currentHoldingByCompanyByEntity.forEach((byCompany) => byCompany.forEach((usd, id) => {
      if (usd > 0) heldByInstitutionsLocal.set(id, (heldByInstitutionsLocal.get(id) ?? 0) + usd);
    }));
    instruments.forEach((inst) => { inst.tradableFloatLocal = heldByInstitutionsLocal.get(inst.id) ?? 0; });

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

    // Per-company quantities memoized ONCE per region-week, never inside the participants loop
    // (§6's optimization rule): the structural PD reads the debt ladder and revenue history and
    // was being recomputed once per entity x company — 4x the work for identical answers.
    const pdByCompanyId = new Map<string, number>();
    regionCompanies.forEach((c) => pdByCompanyId.set(c.id, computeAnnualDefaultProbability(v2, c)));

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
      const durationYears = creditDurationYears(v2, c);
      return {
        id: c.id,
        creditRating: c.creditRating,
        subIG: !isInvestmentGrade(c.creditRating),
        liveFloatLocal: liveTradableFloatLocal(c),
        offeringLocal: offeringSizeLocal(c),
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
    // §4.C direct-to-pack — demand written straight into the engine's staging; no
    // ParticipantDemand objects exist for this book at all.
    const DS = openDemandStaging(companyTerms.length);

    // §4.C Stage I — the pair loops on dense columns (the 07e slice's shape, §7.327 (1)): the
    // per-(entity, name) holding probe becomes an array read; iteration order is companyTerms
    // order in both passes, so every float accumulates exactly as before.
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
      // Per-entity invariants of the per-name loops below.
      const entityShare = entityShareOfSector / sectorTotal;
      const entitySubIGFactor = subInvestmentGradeSizeFactor(entity.entityType);
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
      // discounted expected recovery instead of expected loss, and running the conviction size
      // that goes with it, is one strategy — the credit long-short book beside it is an ordinary
      // relative-value buyer and prices like one.
      const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
        ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate);
      const strategy = hedgeFundStrategyProfile(entity);
      const overweightMultiple = strategy?.convictionMultiple ?? maxOverweightMultipleOf(entity);
      // The entity's real budget for this auction (S11): available cash plus its type's genuine
      // leverage capacity, sliced to this asset class by its own targets, then directed at the
      // names where paper is actually changing hands — a live offering, or the gap between what
      // this holder targets and what it already owns. A bid is a claim on money; this is the
      // money. Apportioning it across the whole STOCK instead gave a new issue a slice the size
      // of its issuer's index weight rather than of the deal, which starved the primary market by
      // construction (see the same fix and its measurement in 07d).
      const classBudgetLocal = stagePurchaseBudgetLocal(ctx, entity, institutionTotalAssetsLocal(ctx, entity), 'CORP_BOND', institutionUnsettledLessCollateralLocal(ctx, entity.id));
      // SCALE: indexed by companyTerms position, not a Map keyed by id — both loops already
      // walk companyTerms in order, so the id was pure overhead.
      const cashDemandWeightByIndex = new Float64Array(companyTerms.length);
      let totalCashDemandWeightLocal = 0;
      for (let ti = 0; ti < companyTerms.length; ti++) {
        const t = companyTerms[ti];
        const f = t.subIG ? entitySubIGFactor : 1;
        const structuralLocal = t.liveFloatLocal * entityShare * f;
        const gapToTargetLocal = Math.max(0, structuralLocal - heldArr[ti]);
        const weightLocal = t.offeringLocal + gapToTargetLocal;
        cashDemandWeightByIndex[ti] = weightLocal;
        totalCashDemandWeightLocal += weightLocal;
      }

      // This entity's terms, per issuer. The reservation spread is the RV economics used as what
      // they always were — a PRICE. Below the level that covers this issuer's own expected loss
      // and the capital the position consumes at this entity's own required return, it does not
      // want the bond at all; above it, it scales into its policy size. The old engine used the
      // same numbers to nudge a quantity target, which is why spreads could settle through zero:
      // a nudged quota still has to be filled at whatever price results.
      const demandRow = claimDemandRow(DS);
      for (let ti = 0; ti < companyTerms.length; ti++) {
        const t = companyTerms[ti];
        // Rating enters this book in the two places it really acts: the capital the position
        // consumes and the size of the sub-IG sleeve the holder will run — never a prohibition
        // (see subInvestmentGradeSizeFactor for what modelling it as one did to HY clearing).
        // Two pricing regimes, one issuer hazard: regulated holders price spread vs expected
        // loss + capital cost; the distressed fund prices vs discounted expected recovery.
        const reservationBps = strategy?.pricesOffRecovery
          ? t.distressedReservationBps
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn,
              expectedLossBps: t.expectedLossBps,
              capitalChargeRate: t.capitalChargeRate,
              creditConditionsIndex,
            });
        const sizeFactor = t.subIG ? entitySubIGFactor : 1;
        const structuralSizeLocal = t.liveFloatLocal * entityShare * sizeFactor;
        // XB2: hedged, so a foreign buyer's requirement carries the CIP cost of the hedge.
        setDemand(DS, demandRow, ti,
          reservationBps + hedgeAdjBps,
          fullSizeSpreadRangeBpsOf(entity),
          structuralSizeLocal * overweightMultiple,
          classBudgetLocal *
            (totalCashDemandWeightLocal > 0
              ? cashDemandWeightByIndex[ti] / totalCashDemandWeightLocal
              : 0),
          0);
      }
      for (const ti of heldTouched) heldArr[ti] = 0;

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId: EMPTY_DEMAND_MAP, demandRow };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryLocal));

    // ETF: the index funds tracking this book's benchmarks. A fund posts a SIZE with no
    // reservation level — its benchmark weight at whatever the market is asking — which is the
    // one demand shape the engine could not previously express and a large real force in credit.
    const bookIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'CORP_BOND' && d.region === regionId)
      .map((d) => d.id);
    const indexFundParticipants: ClearingParticipant[] = indexFundsForBook(
      ctx.v2,
      regionIndexFunds, ctx.updatedMarketIndexes, bookIndexIds, (e) => store.currentHoldingsLocal(e.id)
    ).map(({ fund, index, investableLocal }) => {
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      // A CREDIT index fund is a real buyer in the primary, unlike its equity counterpart. A bond
      // index admits a new issue at the next rebalance, and a fund that waits has to chase it in
      // the aftermarket — so it takes its proportional share at issue. (Equity index funds do the
      // opposite and buy at INCLUSION, which is why they are famously absent from IPOs; that
      // behaviour falls out of the quarterly rebalance without any special case.)
      const fundShareOfIndex = index.totalValueLocal > 0 ? investableLocal / index.totalValueLocal : 0;
      index.constituents.forEach((c) => {
        const offeringLocal = offeringsByIssuerId.get(c.instrumentId)?.sizeLocal ?? 0;
        const targetLocal = investableLocal * c.weight + offeringLocal * fundShareOfIndex;
        demandByInstrumentId.set(
          c.instrumentId,
          // §7.270: the kernel's cash leg is traded PLUS the dealer fee, so a bound spent to
          // the last dollar overdraws by spread × gross — the fee rides outside the bound. A
          // fund that never walks away rides the bound exactly; shave it by the spread.
          indexFundDemand(targetLocal, institutionSpendableLocal(ctx, fund) * c.weight / (1 + DEALER_SPREAD_BPS / 10000), 'YIELD_LIKE')
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
    const deskHeldLocal = new Map<string, number>();
    deskParticipants.forEach((d) => d.currentHoldingsByInstrumentId.forEach((usd, id) => {
      if (usd > 0) deskHeldLocal.set(id, (deskHeldLocal.get(id) ?? 0) + usd);
    }));
    instruments.forEach((inst) => {
      inst.tradableFloatLocal = (heldByInstitutionsLocal.get(inst.id) ?? 0) + (deskHeldLocal.get(inst.id) ?? 0);
    });

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
    // WS8: settle this week's priced offerings — lead bank pays the unsold residual and takes
    // the fee; stage 08 posts the issuer's proceeds and creates the tranche at cleared terms.
    // G3c: the lead quotes THIS deal — the desks' own spread, plus what a week's spread move
    // through the deal's own duration can cost on the residual the desks cannot absorb.
    const bookCapacityLocal = totalDeskCapacityLocal(ctx, regionBanks, BOOK);
    const durationById = new Map(regionCompanies.map((c) => [c.id, creditDurationYears(v2, c)]));
    // §7.259: the settlement call moved BELOW applyDealerDeskFills — called here it landed the
    // lead's residual on its desk between the clearing and the rebuild-from-fills, which
    // deleted it with no cash leg and charged it to equity as a phantom fee (see 07d).

    // Apply: real cleared OAS, mutated in place so stage 8 (which runs next) reads it as this
    // week's already-real value rather than recomputing one. Also extend each company's rolling
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    // §4.C int flip — instruments[i] IS regionCompanies[i]; the map's insertion order was this
    // index order, so the walk and its floats are unchanged.
    for (let ii = 0; ii < result.nInstruments; ii++) {
      const comp = regionCompanies[ii];
      v2.oasRing = ringPush(v2.oasRing, rowOf(v2, comp.id), comp.oasSpreadBps);
      comp.oasSpreadBps = result.newStatByIndex[ii];
    }

    // Apply: each entity's real new CORP_BOND holdings. Loans are a genuinely different real
    // market (different investor base, different technicals) and get their own real clearing
    // (07d-leveraged-loan-clearing.ts), not a byproduct split of this fill.
    // SCALE C1: the entities here ARE the store's working copies, and the fill rows are appended
    // to the store for the single write-back after 07e. SETL6: the cash leg is settled below as
    // payment instructions, not mutated here.
    // 13b: the rows name TRANCHES. What every participant bought this session, per issuer, is the
    // denominator of the primary's slices (register-split.ts).
    const boughtByInstrument = new Float64Array(result.nInstruments);
    allParticipants.forEach((p, pi) => {
      const base = pi * result.nInstruments;
      for (let ii = 0; ii < result.nInstruments; ii++) {
        const bought = result.holdingsMatrix[base + ii] - (p.currentHoldingsByInstrumentId.get(regionCompanies[ii].id) ?? 0);
        if (bought > 0) boughtByInstrument[ii] += bought;
      }
    });
    bookEntities.forEach((entity) => {
      const pi = piById.get(entity.id);
      const newCorpHoldings: ItemizedHolding[] = [];
      if (pi !== undefined) {
        const base = pi * result.nInstruments;
        const prior = currentHoldingByCompanyByEntity.get(entity.id);
        for (let ii = 0; ii < result.nInstruments; ii++) {
          const newHoldingLocal = result.holdingsMatrix[base + ii];
          if (!(newHoldingLocal > 1)) continue;
          const issuerId = regionCompanies[ii].id;
          const outcome = result.primaryOutcomeById.get(issuerId);
          const offering = offeringsByIssuerId.get(issuerId);
          const primary = outcome && !outcome.withdrawn && offering
            ? { trancheId: primaryTrancheId(issuerId, offering.purpose, ctx.nextWeek), sliceLocal: primarySliceOf(newHoldingLocal - (prior?.get(issuerId) ?? 0), boughtByInstrument[ii], outcome.marketTakeLocal) }
            : undefined;
          splitAcrossTranches(v2, issuerId, 'CORP_BOND', newHoldingLocal, primary).forEach((t) => {
            // Written in par space; `credit-marking` prices it before anything reads a value.
            if (t.usd > 1) newCorpHoldings.push({ instrumentId: t.instrumentId, instrumentType: 'CORP_BOND', issuerRegion: regionId, quantityOrNotionalLocal: t.usd, faceLocal: t.usd, units: t.usd });
          });
        }
      }
      store.append(entity.id, newCorpHoldings);
    });

    // Apply: each desk's inventory, onto the bank that carried it. The regional array is now
    // the DERIVED sum of the named desks — nothing decides off it (G3a).
    const deskViewByCompany = applyDealerDeskFills({ piById, ctx, banks: regionBanks, book: BOOK, instruments, result });
    // §7.259: AFTER the fills application, so the lead's residual survives to next week's
    // clearing as a real prior position.
    settlePricedOfferings(regionId, 'CORP_BOND', offeringsByIssuerId, result, ctx, (o) => o.sizeLocal,
      (o, clearedStat) => underwritingFeeBps({
        bookSpreadBps: DEALER_SPREAD_BPS,
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'YIELD_LIKE', currentStat: clearedStat,
          weeklyMovePct: Math.abs(clearedStat - (priorOasById.get(o.issuerId) ?? clearedStat)) / Math.max(1, Math.abs(clearedStat)),
          minWeeklyStatMoveBps: YIELD_LIKE_MIN_WEEKLY_MOVE_BPS,
          durationYears: durationById.get(o.issuerId) ?? 0,
        }),
        dealSizeLocal: o.sizeLocal,
        deskCapacityLocal: bookCapacityLocal,
      }),
      BOOK);
    const newDealerInventory: { companyId: string; inventoryLocal: number }[] = [];
    deskViewByCompany.forEach((inventoryLocal, companyId) => {
      if (Math.abs(inventoryLocal) > 1) newDealerInventory.push({ companyId, inventoryLocal });
    });
    reg.bankingSector = { ...reg.bankingSector, corpBondDealerInventory: newDealerInventory };

    // SETL6: the book's whole cash side, through the clearing house.
    const entityIds = new Set(bookEntities.map((e) => e.id));
    settleClearedBook(
      ctx, regionId, currencyOf(regionId), BOOK,
      result.netCashDeltaByParticipantId,
      (id) => (entityIds.has(id) ? { kind: 'INSTITUTION', id } : dealerDeskPartyOf(id, deskTickers)),
      { netCashLocal: result.dealerNetCashLocal, feeLocal: result.totalDealerRevenueLocal },
      feeDesksForRegion(ctx, regionId),
      // WS8: the CCP pays each issuer for the paper its deal actually placed.
      // The paper's leg is the tranche's own wire (issuer → house at issue, W3) — no asset here.
      primaryTakes(result, (issuerId) => {
        const issuer = companyById.get(issuerId);
        return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
      })
    );
  });
}
