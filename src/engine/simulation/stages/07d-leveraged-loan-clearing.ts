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
import { isActiveCompany } from '../../../domain/company';
import {
  computeReservationSpreadBps,
  FULL_SIZE_SPREAD_RANGE_BPS,
  MAX_OVERWEIGHT_MULTIPLE,
  DISTRESSED_CONVICTION_MULTIPLE,
  computeDistressedReservationSpreadBps,
  spreadRiskCapitalChargeRate,
} from './asset-allocation';
import { computeExpectedLossSpreadBps, computeAnnualDefaultProbability, CREDIT_RECOVERY_RATE } from './shared-helpers';
import { distributeRealTargetByWeight } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetUSD } from './institutional-balance-sheet';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

const MAX_WEEKLY_SPREAD_MOVE_PCT = 0.25;
const STRATEGIC_TARGET_DRIFT_RATE = 0.05;
const WEEKLY_TACTICAL_REBALANCE_RATE = 0.20;
// Senior-secured first-lien loans trade at a real, structural discount to the same issuer's
// unsecured bond spread — collateral and seniority mean less loss given default.
const SENIOR_LIEN_DISCOUNT = 0.85;
const DEALER_SPREAD_BPS = 20; // loan secondary markets trade a bit wider than investment-grade bonds

function floatingDebtUSD(comp: Company): number {
  return (comp.debtTranches || []).filter((t) => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
}

function loanCreditDurationYears(comp: Company): number {
  return Math.min(4.0, Math.max(1.0, (comp.leveragedLoan?.tenorYears ?? 5) * 0.7));
}

export function runLeveragedLoanClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];

    // This stage owns whether a loan quote exists at all, because it owns the loan market. A
    // company has a quote exactly while it has floating-rate debt: the syndicate opens one when
    // the loan is drawn and there is nothing left to quote once it is repaid. Without this the
    // quote outlived the loan, and since the clearing below (rightly) skips a company with no
    // floating debt, those orphaned quotes froze at whatever level generation gave them and then
    // reported themselves as live prices for the rest of the run.
    ctx.prevActiveFirms.forEach((c) => {
      if (c.region !== regionId || !isActiveCompany(c)) return;
      const hasLoan = floatingDebtUSD(c) > 0;
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
        recoveryRate: 1 - SENIOR_LIEN_DISCOUNT * (1 - CREDIT_RECOVERY_RATE),
      };
    });

    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && floatingDebtUSD(c) > 0 && !!c.leveragedLoan
    );
    if (regionCompanies.length === 0) return;

    const totalOutstandingUSD = regionCompanies.reduce((s, c) => s + floatingDebtUSD(c), 0) || 1;

    const tradableShare = reg.corpBondOwnership.institutionalShare;
    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: floatingDebtUSD(c),
      tradableFloatUSD: floatingDebtUSD(c) * tradableShare,
      currentStat: c.leveragedLoan!.discountMarginBps,
      statKind: 'YIELD_LIKE',
      durationYears: loanCreditDurationYears(c),
      // No ceiling — same reasoning as the bond book (07b): the distressed regime always bids at
      // some price, and where it stands is where a widening arrests.
    }));

    const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId);
    const otherHoldingsByEntity = new Map<string, ItemizedHolding[]>();
    const currentHoldingByCompanyByEntity = new Map<string, Map<string, number>>();

    regionEntities.forEach((entity) => {
      const currentHoldingByCompany = new Map<string, number>();
      const otherHoldings: ItemizedHolding[] = [];
      entity.itemizedHoldings.forEach((h) => {
        if (h.instrumentType === 'LEVERAGED_LOAN') {
          currentHoldingByCompany.set(h.instrumentId, (currentHoldingByCompany.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        } else {
          otherHoldings.push(h);
        }
      });
      otherHoldingsByEntity.set(entity.id, otherHoldings);
      currentHoldingByCompanyByEntity.set(entity.id, currentHoldingByCompany);
    });

    // Real, bottom-up aggregate: no dedicated region-level loan ownership share is tracked, so
    // this reuses corpBondOwnership.institutionalShare (the same institutional-vs-market share
    // that governs the sibling corporate-bond market) as a real, defensible proxy — never an
    // independently-summed entity-level number.
    const totalRealInstitutionalTargetUSD = reg.corpBondOwnership.institutionalShare * totalOutstandingUSD;
    const rawEntityTargets = distributeRealTargetByWeight(
      regionEntities.map((e) => ({ id: e.id, sizeWeight: e.totalAssetsUSD, targetPct: e.assetAllocationTarget.loanPct })),
      totalRealInstitutionalTargetUSD
    );

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;
      const entityShareOfSector = rawEntityTargets.get(entity.id) ?? 0;
      const sectorTotal = totalRealInstitutionalTargetUSD || 1;
      // The entity's real money for this auction (S11), split across names by structural size.
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'LEVERAGED_LOAN');
      let totalStructuralSizeUSD = 0;
      regionCompanies.forEach((c) => {
        totalStructuralSizeUSD += floatingDebtUSD(c) * tradableShare * (entityShareOfSector / sectorTotal);
      });

      // Same terms as the bond book, at the loan's own economics: a first-lien loan's collateral
      // means less is expected to be lost on it and less capital is tied up holding it, so it
      // clears its cost at a tighter margin than the same issuer's unsecured paper. That is the
      // structural relationship between the two markets, expressed where it belongs — in what
      // each set of holders will pay — rather than as a fixed multiple between two statistics.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      regionCompanies.forEach((c) => {
        // The loan's recovery is derived from the same senior-lien discount that scales its
        // expected loss: a loss 0.85x the unsecured claim's IS a recovery that much higher.
        // Derived rather than stated so the two cannot drift apart.
        const annualPd = computeAnnualDefaultProbability(c);
        const loanRecoveryRate = 1 - SENIOR_LIEN_DISCOUNT * (1 - CREDIT_RECOVERY_RATE);
        const reservationBps = entity.entityType === 'HEDGE_FUND'
          ? computeDistressedReservationSpreadBps({
              annualDefaultProbability: annualPd,
              recoveryRate: loanRecoveryRate,
              durationYears: loanCreditDurationYears(c),
            })
          : computeReservationSpreadBps({
              entityType: entity.entityType,
              expectedLossBps: annualPd * (1 - loanRecoveryRate) * 10000,
              // Same rating x duration schedule as the bond book at the secured discount: the
              // collateral that raises the loan's recovery also lowers the capital its spread
              // risk consumes — one lien, both consequences.
              capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, loanCreditDurationYears(c)) * SENIOR_LIEN_DISCOUNT,
              creditConditionsIndex: reg.bankingSector.creditConditionsIndex ?? 0,
            });
        const structuralSizeUSD = floatingDebtUSD(c) * tradableShare * (entityShareOfSector / sectorTotal);
        demandByInstrumentId.set(c.id, {
          reservationStat: reservationBps,
          maxHoldingUSD:
            structuralSizeUSD *
            (entity.entityType === 'HEDGE_FUND' ? DISTRESSED_CONVICTION_MULTIPLE : MAX_OVERWEIGHT_MULTIPLE),
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
          maxNetPurchaseUSD:
            classBudgetUSD * (totalStructuralSizeUSD > 0 ? structuralSizeUSD / totalStructuralSizeUSD : 0),
        });
      });

      return { id: entity.id, currentHoldingsByInstrumentId: currentHoldingByCompany, demandByInstrumentId };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.loanDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    const result = clearFinancialAsset(instruments, participants, priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_SPREAD_MOVE_PCT,
    });

    // Apply: real cleared discount margin + derived price-to-par, mutated in place so stage 8
    // reads it as an already-real value. Also extend the rolling history for momentum.
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    result.newStatById.forEach((newDiscountMarginBps, companyId) => {
      const comp = companyById.get(companyId);
      if (!comp) return;
      if (!comp.leveragedLoan) return;
      const history = [...(comp.leveragedLoan.discountMarginBpsHistory || []), comp.leveragedLoan.discountMarginBps];
      const marginDeltaBps = newDiscountMarginBps - comp.leveragedLoan.quotedMarginBps;
      const creditDuration = loanCreditDurationYears(comp);
      comp.leveragedLoan = {
        ...comp.leveragedLoan,
        discountMarginBps: newDiscountMarginBps,
        pricePar: Number((100 - (marginDeltaBps / 10000) * creditDuration * 100).toFixed(2)),
        discountMarginBpsHistory: history.slice(-8),
      };
    });

    // Apply: each entity's real new LEVERAGED_LOAN holdings.
    if (regionEntities.length > 0) {
      const updatedEntitiesById = new Map<string, InstitutionalEntity>();
      regionEntities.forEach((entity) => {
        const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
        const newLoanHoldings: ItemizedHolding[] = [];
        newHoldings.forEach((newHoldingUSD, companyId) => {
          if (newHoldingUSD > 1) newLoanHoldings.push({ instrumentId: companyId, instrumentType: 'LEVERAGED_LOAN', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD });
        });
        updatedEntitiesById.set(entity.id, {
          ...entity,
          cashUSD: (entity.cashUSD ?? 0) + (result.netCashDeltaByParticipantId.get(entity.id) ?? 0),
          itemizedHoldings: [...(otherHoldingsByEntity.get(entity.id) ?? []), ...newLoanHoldings],
        });
      });
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => updatedEntitiesById.get(e.id) ?? e);
    }

    // Apply: real dealer inventory + trading revenue, credited to each named bank by market share.
    const newDealerInventory: { companyId: string; inventoryUSD: number }[] = [];
    result.newDealerInventoryById.forEach((inventoryUSD, companyId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ companyId, inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, loanDealerInventory: newDealerInventory };

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
