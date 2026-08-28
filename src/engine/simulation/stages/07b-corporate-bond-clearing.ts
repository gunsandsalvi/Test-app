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
import { computeExpectedLossSpreadBps, computeAnnualDefaultProbability, getRatingBucket, distributeRealTargetByWeight, CREDIT_RECOVERY_RATE } from './shared-helpers';
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
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';

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
const DEALER_SPREAD_BPS = 15;
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
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    // HC2: the named private tier's paper trades here alongside the public universe — the
    // market prices an issuer's credit, not its listing status. Private issuers arrived with
    // their tradable float already seeded onto these same holders (initialization), so their
    // first clearing week opens with genuine small gaps, not a systemic buy-in.
    const regionCompanies = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
      (c) => c.region === regionId && isActiveCompany(c) && fixedDebtUSD(c) > 0
    );
    if (regionCompanies.length === 0) return;

    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;

    // The float genuinely in play is what the bidders below can hold between them. The rest of
    // each issue sits with holders who do not bid in this auction, and was never for sale.
    const tradableShare = reg.corpBondOwnership.institutionalShare;
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
    // The offering enters at FULL size: `tradableShare` describes passive holders of the
    // OUTSTANDING stock, and a new issue has none — all of it is for sale to the bidders here,
    // which is exactly what the engine adds to the float it must clear (see 07d).
    const offeringSizeUSD = (c: Company) => offeringsByIssuerId.get(c.id)?.sizeUSD ?? 0;
    const liveTradableFloatUSD = (c: Company) => fixedDebtUSD(c) * tradableShare + offeringSizeUSD(c);
    const totalOutstandingUSD =
      regionCompanies.reduce((s, c) => s + fixedDebtUSD(c) + offeringSizeUSD(c), 0) || 1;

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: fixedDebtUSD(c),
      tradableFloatUSD: fixedDebtUSD(c) * tradableShare,
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
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType !== 'ETF'
    );
    const regionIndexFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'ETF' && e.etf
        && INDEX_DEFINITIONS.some((d) => d.id === e.etf!.indexId && d.assetClass === 'CORP_BOND')
    );
    const bookEntities = [...regionEntities, ...regionIndexFunds];
    const otherHoldingsByEntity = new Map<string, ItemizedHolding[]>();
    const currentHoldingByCompanyByEntity = new Map<string, Map<string, number>>();

    bookEntities.forEach((entity) => {
      const currentHoldingByCompany = new Map<string, number>();
      const otherHoldings: ItemizedHolding[] = [];
      entity.itemizedHoldings.forEach((h) => {
        if (h.instrumentType === 'CORP_BOND') {
          currentHoldingByCompany.set(h.instrumentId, (currentHoldingByCompany.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        } else {
          otherHoldings.push(h);
        }
      });
      otherHoldingsByEntity.set(entity.id, otherHoldings);
      currentHoldingByCompanyByEntity.set(entity.id, currentHoldingByCompany);
    });

    // Real, bottom-up aggregate: the institutional sector's actual share of the real corporate
    // debt market (reg.corpBondOwnership.institutionalShare, already a stable, real calibration
    // used elsewhere in this codebase), never an independently-summed entity-level number that
    // could come out larger than the market and need a cap.
    const totalRealInstitutionalTargetUSD = reg.corpBondOwnership.institutionalShare * totalOutstandingUSD;
    const rawEntityTargets = distributeRealTargetByWeight(
      regionEntities.map((e) => ({ id: e.id, sizeWeight: e.totalAssetsUSD, targetPct: e.assetAllocationTarget.corpBondPct })),
      totalRealInstitutionalTargetUSD
    );

    // Per-company quantities memoized ONCE per region-week, never inside the participants loop
    // (§6's optimization rule): the structural PD reads the debt ladder and revenue history and
    // was being recomputed once per entity x company — 4x the work for identical answers.
    const pdByCompanyId = new Map<string, number>();
    regionCompanies.forEach((c) => pdByCompanyId.set(c.id, computeAnnualDefaultProbability(c)));

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;
      const entityShareOfSector = rawEntityTargets.get(entity.id) ?? 0;
      const sectorTotal = totalRealInstitutionalTargetUSD || 1;
      // The entity's real budget for this auction (S11): available cash plus its type's genuine
      // leverage capacity, sliced to this asset class by its own targets, then directed at the
      // names where paper is actually changing hands — a live offering, or the gap between what
      // this holder targets and what it already owns. A bid is a claim on money; this is the
      // money. Apportioning it across the whole STOCK instead gave a new issue a slice the size
      // of its issuer's index weight rather than of the deal, which starved the primary market by
      // construction (see the same fix and its measurement in 07d).
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'CORP_BOND');
      const cashDemandWeightByCompany = new Map<string, number>();
      let totalCashDemandWeightUSD = 0;
      regionCompanies.forEach((c) => {
        const f = !isInvestmentGrade(c.creditRating) ? subInvestmentGradeSizeFactor(entity.entityType) : 1;
        const structuralUSD = liveTradableFloatUSD(c) * (entityShareOfSector / sectorTotal) * f;
        const gapToTargetUSD = Math.max(0, structuralUSD - (currentHoldingByCompany.get(c.id) ?? 0));
        const weightUSD = offeringSizeUSD(c) + gapToTargetUSD;
        cashDemandWeightByCompany.set(c.id, weightUSD);
        totalCashDemandWeightUSD += weightUSD;
      });

      // This entity's terms, per issuer. The reservation spread is the RV economics used as what
      // they always were — a PRICE. Below the level that covers this issuer's own expected loss
      // and the capital the position consumes at this entity's own required return, it does not
      // want the bond at all; above it, it scales into its policy size. The old engine used the
      // same numbers to nudge a quantity target, which is why spreads could settle through zero:
      // a nudged quota still has to be filled at whatever price results.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      regionCompanies.forEach((c) => {
        // Rating enters this book in the two places it really acts: the capital the position
        // consumes (stepping by notch and scaling with duration — see
        // spreadRiskCapitalChargeRate) and the size of the sub-IG sleeve the holder will run.
        // It is deliberately NOT a prohibition — see subInvestmentGradeSizeFactor for what
        // modelling it as one did to high-yield clearing.
        const subIG = !isInvestmentGrade(c.creditRating);
        // Two pricing regimes, one issuer hazard. Regulated holders price spread vs expected
        // loss + capital cost; the distressed fund prices cash price vs discounted expected
        // recovery (see computeDistressedReservationSpreadBps) — naturally absent from
        // performing paper, always present at some price for broken paper.
        const annualPd = pdByCompanyId.get(c.id)!;
        const reservationBps = entity.entityType === 'HEDGE_FUND'
          ? computeDistressedReservationSpreadBps({
              annualDefaultProbability: annualPd,
              recoveryRate: CREDIT_RECOVERY_RATE,
              durationYears: creditDurationYears(c),
            })
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              requiredReturn: entityRequiredReturn(entity),
              expectedLossBps: annualPd * (1 - CREDIT_RECOVERY_RATE) * 10000,
              capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, creditDurationYears(c)),
              creditConditionsIndex,
            });
        // Structural size is the entity's own share of the name at its sub-IG sleeve factor —
        // no per-name renormalisation (deleted per §7.19 item 2, now that budgets and the
        // distressed regime exist): demand meets float when real buyers with real money choose
        // to hold it, and the dealer absorbs any genuine residual.
        const sizeFactor = subIG ? subInvestmentGradeSizeFactor(entity.entityType) : 1;
        const structuralSizeUSD =
          liveTradableFloatUSD(c) * (entityShareOfSector / sectorTotal) * sizeFactor;
        const overweightMultiple =
          entity.entityType === 'HEDGE_FUND' ? DISTRESSED_CONVICTION_MULTIPLE : MAX_OVERWEIGHT_MULTIPLE;
        demandByInstrumentId.set(c.id, {
          reservationStat: reservationBps,
          maxHoldingUSD: structuralSizeUSD * overweightMultiple,
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
          maxNetPurchaseUSD:
            classBudgetUSD *
            (totalCashDemandWeightUSD > 0
              ? (cashDemandWeightByCompany.get(c.id) ?? 0) / totalCashDemandWeightUSD
              : 0),
        });
      });

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId };
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
      regionIndexFunds, ctx.updatedMarketIndexes, bookIndexIds
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
          indexFundDemand(targetUSD, Math.max(0, fund.cashUSD ?? 0) * c.weight, 'YIELD_LIKE')
        );
      });
      return {
        id: fund.id,
        currentHoldingsByInstrumentId: currentHoldingByCompanyByEntity.get(fund.id) ?? new Map<string, number>(),
        demandByInstrumentId,
      };
    });

    const result = clearFinancialAsset(instruments, [...participants, ...indexFundParticipants], priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);
    // WS8: settle this week's priced offerings — lead bank pays the unsold residual and takes
    // the fee; stage 08 posts the issuer's proceeds and creates the tranche at cleared terms.
    settlePricedOfferings(regionId, 'CORP_BOND', offeringsByIssuerId, result, ctx, (o) => o.sizeUSD);

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
    if (bookEntities.length > 0) {
      const updatedEntitiesById = new Map<string, InstitutionalEntity>();
      bookEntities.forEach((entity) => {
        const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
        const newCorpHoldings: ItemizedHolding[] = [];
        newHoldings.forEach((newHoldingUSD, companyId) => {
          if (newHoldingUSD > 1) newCorpHoldings.push({ instrumentId: companyId, instrumentType: 'CORP_BOND', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD });
        });
        updatedEntitiesById.set(entity.id, {
          ...entity,
          cashUSD: (entity.cashUSD ?? 0) + (result.netCashDeltaByParticipantId.get(entity.id) ?? 0),
          itemizedHoldings: [...(otherHoldingsByEntity.get(entity.id) ?? []), ...newCorpHoldings],
        });
      });
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => updatedEntitiesById.get(e.id) ?? e);
    }

    // Apply: real dealer inventory, and real trading revenue credited to each named bank's own
    // equity by market share — the same per-bank crediting pattern as the SRF/ON RRP facility
    // interest in 02b-bank-diversification.ts.
    const newDealerInventory: { companyId: string; inventoryUSD: number }[] = [];
    result.newDealerInventoryById.forEach((inventoryUSD, companyId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ companyId, inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, corpBondDealerInventory: newDealerInventory };

    if (result.totalDealerRevenueUSD > 0) {
      const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
      regionBanks.forEach((bank) => {
        const share = bank.bankMarketShare ?? 1 / Math.max(1, regionBanks.length);
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
        ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
          ...existingSheet,
          // The desk's earnings are money the clients actually paid (their cash legs already
          // deduct the fee), so the bank receives CASH, not just a bookkeeping equity credit —
          // an equity write with no cash leg breaks the balance-sheet identity the invariants
          // harness now asserts per bank per week.
          bankEquityUSD: existingSheet.bankEquityUSD + result.totalDealerRevenueUSD * share,
          cashReservesUSD: existingSheet.cashReservesUSD + result.totalDealerRevenueUSD * share,
        };
      });
    }
  });
}
