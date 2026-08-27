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
 * - How a real institutional entity actually decides what to buy, tactically, within that
 *   long-term-guide target: computeEntityAttractiveness below combines fair value (an issuer's
 *   spread versus a fundamental fair-value estimate, itself adjusted for current market/credit
 *   conditions — not priced in a vacuum), recent spread momentum, this entity's own mandate
 *   (real insurers and pension funds run investment-grade-only books and structurally avoid
 *   high-yield paper), and duration/maturity fit against this entity's own real liability profile
 *   — the target allocation is only the long-term guide for how much total capital sits in this
 *   asset class; which specific issuers get that capital is driven by these real characteristics.
 * - How the cleared price maps onto this asset class's quoted statistic (OAS moves opposite
 *   price — no realism floor or ceiling, purely a function of real demand versus govies).
 *
 * This adapter only covers each issuer's FIXED-rate tranches (real corporate bonds). Floating
 * tranches are real leveraged loans — a genuinely different market with a different investor
 * base (CLOs/loan funds, not bond funds) and different technicals — and get their own real
 * clearing (07d-leveraged-loan-clearing.ts), not a byproduct split of this one's fills.
 *
 * The actual auction — per-participant tilted index weighting, dealer inventory absorption and
 * pressure, price-impact-to-statistic conversion — lives once in the shared engine; sovereign
 * bonds, loans, and equity plug into the same engine as their own adapters rather than
 * re-implementing it.
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
} from './asset-allocation';
import { WeeklyStepContext } from './context';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

// The entity's OWN book (its actual current corp-bond + loan holdings) drifts toward its real,
// bottom-up-derived target at this slow pace — a policy allocation is a long-term guide real
// institutions rebalance toward gradually, not a number they instantly chase every week.
const STRATEGIC_TARGET_DRIFT_RATE = 0.05;
// Within that slow-moving budget, how fast a participant rotates toward its currently most
// attractive names — tactical name selection is real and moves faster than the overall budget.
const MAX_WEEKLY_SPREAD_MOVE_PCT = 0.25;
const WEEKLY_TACTICAL_REBALANCE_RATE = 0.20;
const MAX_VALUE_TILT = 0.4;
const MAX_MOMENTUM_TILT = 0.15;
const MAX_DURATION_TILT = 0.15;
// How much a tightening/loosening real credit-conditions backdrop (reg.bankingSector's own
// -1..+1 index) shifts what "fair value" means right now — real credit investors price a bond
// against the current market, not against an idiosyncratic PD estimate in a vacuum.
const CREDIT_CONDITIONS_FAIR_VALUE_SENSITIVITY_BPS = 150;
// Net weekly order flow equal to this many multiples of an issuer's own total debt outstanding
// is needed to move its bond price 100% — corporate bonds are less liquid than the equivalent
// large-cap equity float, hence a shallower depth than EQUITY_LIQUIDITY_DEPTH (6).
const BOND_LIQUIDITY_DEPTH = 3;
// The dealer's own standing inventory creates its own convergence pressure each week (a dealer
// sitting long leans its quotes to sell it back down, and vice versa) — real market-making
// inventory-risk behavior, not client flow.
const DEALER_INVENTORY_PRESSURE_RATE = 0.15;
// Bid/ask spread the dealer desk earns on the gross flow it facilitates, credited as real
// trading revenue to the named banks' own equity (split by bankMarketShare).
const DEALER_SPREAD_BPS = 15;
// Real insurers and pension funds overwhelmingly run investment-grade-only mandates in
// practice — a genuine structural avoidance of high-yield paper, not a soft preference.
const IG_MANDATE_HY_AVOIDANCE_TILT = -0.7;

function fixedDebtUSD(comp: Company): number {
  return (comp.debtTranches || []).filter((t) => t.rateType === 'FIXED').reduce((s, t) => s + t.principalUSD, 0);
}

function creditDurationYears(comp: Company): number {
  const fixedTranches = (comp.debtTranches || []).filter((t) => t.rateType === 'FIXED');
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
function computeEntityAttractiveness(entity: InstitutionalEntity, comp: Company, creditConditionsIndex: number): number {
  const fairSpread = computeExpectedLossSpreadBps(comp) + creditConditionsIndex * CREDIT_CONDITIONS_FAIR_VALUE_SENSITIVITY_BPS;
  const valueSignal = clamp((comp.oasSpreadBps - fairSpread) / 1000, -MAX_VALUE_TILT, MAX_VALUE_TILT);

  const history = comp.oasSpreadBpsHistory || [];
  const recentSpreadChangeBps = history.length >= 4 ? comp.oasSpreadBps - history[history.length - 4] : 0;
  const momentumSignal = clamp(-recentSpreadChangeBps / 2000, -MAX_MOMENTUM_TILT, MAX_MOMENTUM_TILT);

  const mandateSignal =
    (entity.entityType === 'INSURER' || entity.entityType === 'PENSION_FUND') && getRatingBucket(comp.creditRating) === 'HY'
      ? IG_MANDATE_HY_AVOIDANCE_TILT
      : 0;

  const durationGapYears = Math.abs(creditDurationYears(comp) - preferredDurationYears(entity));
  const durationSignal = clamp(MAX_DURATION_TILT - durationGapYears * 0.05, -MAX_DURATION_TILT, MAX_DURATION_TILT);

  return clamp(valueSignal + momentumSignal + mandateSignal + durationSignal, -1, 1);
}

export function runCorporateBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && fixedDebtUSD(c) > 0
    );
    if (regionCompanies.length === 0) return;

    const totalOutstandingUSD = regionCompanies.reduce((s, c) => s + fixedDebtUSD(c), 0) || 1;
    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;

    // The float genuinely in play is what the bidders below can hold between them. The rest of
    // each issue sits with holders who do not bid in this auction, and was never for sale.
    const tradableShare = reg.corpBondOwnership.institutionalShare;
    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: fixedDebtUSD(c),
      tradableFloatUSD: fixedDebtUSD(c) * tradableShare,
      currentStat: c.oasSpreadBps,
      statKind: 'YIELD_LIKE',
      durationYears: creditDurationYears(c),
      // No floor and no ceiling. The floor is an outcome: every bidder's reservation already
      // covers its own expected loss and capital cost, so demand tighter than that is genuinely
      // zero. The ceiling is an outcome too: the distressed regime below always has a bid at
      // SOME price — as the level widens, the implied cash price falls until the buyer's IRR on
      // expected recovery clears — so the widening arrests where that bid stands, not where a
      // bound says.
    }));

    const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId);
    const otherHoldingsByEntity = new Map<string, ItemizedHolding[]>();
    const currentHoldingByCompanyByEntity = new Map<string, Map<string, number>>();

    regionEntities.forEach((entity) => {
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

    // Who structurally owns THIS name, as opposed to who owns the market. The two differ, and the
    // difference is the whole shape of the high-yield market: a name's float is held by whoever
    // has appetite for its rating, so as a credit falls below investment grade its register does
    // not shrink — it ROTATES, out of the regulated books that will only run a small sleeve of it
    // and into the dedicated high-yield and distressed funds that exist to own exactly this.
    //
    // Modelled the wrong way this was measurably destructive. Applying the sub-investment-grade
    // sleeve factor to each holder's market-wide share only ever subtracted: it took away the
    // insurers' and pension funds' demand for a downgraded name without giving anyone else more
    // of it, so total structural appetite came to ~94% of the float and every sub-IG name pinned
    // at its recovery-implied ceiling — BB, B and CCC all printing the identical 1,745bp, which is
    // an absence of buyers rather than a judgement about credit.
    //
    // Normalising the appetite weights per name is what makes it a rotation. Structural sizes then
    // sum to the float for every issuer at every rating, and rating decides the MIX of the
    // register, which is what it really decides.
    const structuralShareByEntityByCompany = new Map<string, Map<string, number>>();
    regionCompanies.forEach((c) => {
      const subIG = !isInvestmentGrade(c.creditRating);
      const weightByEntity = new Map<string, number>();
      let totalWeight = 0;
      regionEntities.forEach((e) => {
        const w =
          (rawEntityTargets.get(e.id) ?? 0) * (subIG ? subInvestmentGradeSizeFactor(e.entityType) : 1);
        weightByEntity.set(e.id, w);
        totalWeight += w;
      });
      const shareByEntity = new Map<string, number>();
      regionEntities.forEach((e) => {
        shareByEntity.set(e.id, totalWeight > 0 ? (weightByEntity.get(e.id) ?? 0) / totalWeight : 0);
      });
      structuralShareByEntityByCompany.set(c.id, shareByEntity);
    });

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;

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
        const annualPd = computeAnnualDefaultProbability(c);
        const reservationBps = entity.entityType === 'HEDGE_FUND'
          ? computeDistressedReservationSpreadBps({
              annualDefaultProbability: annualPd,
              recoveryRate: CREDIT_RECOVERY_RATE,
              durationYears: creditDurationYears(c),
            })
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              expectedLossBps: annualPd * (1 - CREDIT_RECOVERY_RATE) * 10000,
              capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, creditDurationYears(c)),
              creditConditionsIndex,
            });
        const structuralSizeUSD =
          fixedDebtUSD(c) * tradableShare * (structuralShareByEntityByCompany.get(c.id)?.get(entity.id) ?? 0);
        const overweightMultiple =
          entity.entityType === 'HEDGE_FUND' ? DISTRESSED_CONVICTION_MULTIPLE : MAX_OVERWEIGHT_MULTIPLE;
        demandByInstrumentId.set(c.id, {
          reservationStat: reservationBps,
          maxHoldingUSD: structuralSizeUSD * overweightMultiple,
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
        });
      });

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    const result = clearFinancialAsset(instruments, participants, priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
    });

    // Apply: real cleared OAS, mutated in place so stage 8 (which runs next) reads it as this
    // week's already-real value rather than recomputing one. Also extend each company's rolling
    // spread history (see computeEntityAttractiveness's momentum signal).
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
    if (regionEntities.length > 0) {
      const updatedEntitiesById = new Map<string, InstitutionalEntity>();
      regionEntities.forEach((entity) => {
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
          bankEquityUSD: existingSheet.bankEquityUSD + result.totalDealerRevenueUSD * share,
        };
      });
    }
  });
}
