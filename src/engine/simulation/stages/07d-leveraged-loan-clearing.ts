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
import { distributeRealTargetByWeight } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant } from './financial-clearing-engine';

const STRATEGIC_TARGET_DRIFT_RATE = 0.05;
const WEEKLY_TACTICAL_REBALANCE_RATE = 0.20;
const MAX_VALUE_TILT = 0.4;
const MAX_MOMENTUM_TILT = 0.15;
// Senior-secured first-lien loans trade at a real, structural discount to the same issuer's
// unsecured bond spread — collateral and seniority mean less loss given default.
const SENIOR_LIEN_DISCOUNT = 0.85;
const LOAN_LIQUIDITY_DEPTH = 3.5; // slightly thinner than corporate bonds (BOND_LIQUIDITY_DEPTH=3 there)
const DEALER_INVENTORY_PRESSURE_RATE = 0.15;
const DEALER_SPREAD_BPS = 20; // loan secondary markets trade a bit wider than investment-grade bonds

function floatingDebtUSD(comp: Company): number {
  return (comp.debtTranches || []).filter((t) => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
}

function loanCreditDurationYears(comp: Company): number {
  return Math.min(4.0, Math.max(1.0, (comp.leveragedLoan?.tenorYears ?? 5) * 0.7));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function computeEntityAttractiveness(comp: Company): number {
  const fairDiscountMarginBps = comp.oasSpreadBps * SENIOR_LIEN_DISCOUNT;
  const currentDM = comp.leveragedLoan.discountMarginBps;
  const valueSignal = clamp((currentDM - fairDiscountMarginBps) / 1000, -MAX_VALUE_TILT, MAX_VALUE_TILT);

  const history = comp.leveragedLoan.discountMarginBpsHistory || [];
  const recentChangeBps = history.length >= 4 ? currentDM - history[history.length - 4] : 0;
  const momentumSignal = clamp(-recentChangeBps / 2000, -MAX_MOMENTUM_TILT, MAX_MOMENTUM_TILT);

  return clamp(valueSignal + momentumSignal, -1, 1);
}

export function runLeveragedLoanClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && floatingDebtUSD(c) > 0
    );
    if (regionCompanies.length === 0) return;

    const totalOutstandingUSD = regionCompanies.reduce((s, c) => s + floatingDebtUSD(c), 0) || 1;

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: floatingDebtUSD(c),
      currentStat: c.leveragedLoan.discountMarginBps,
      statKind: 'YIELD_LIKE',
      durationYears: loanCreditDurationYears(c),
      statDirection: -1, // discount margin falls when net buying pushes the loan's price up
      // No floor or ceiling — purely a function of real demand vs. the issuer's own real credit
      // risk (comp.oasSpreadBps), not a realism bound.
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

    const attractivenessByCompany = new Map<string, number>();
    regionCompanies.forEach((c) => attractivenessByCompany.set(c.id, computeEntityAttractiveness(c)));

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = currentHoldingByCompanyByEntity.get(entity.id)!;
      const currentEntityTotalUSD = Array.from(currentHoldingByCompany.values()).reduce((s, v) => s + v, 0);
      const rawTargetUSD = rawEntityTargets.get(entity.id) ?? 0;
      const slowTargetTotalUSD = currentEntityTotalUSD + (rawTargetUSD - currentEntityTotalUSD) * STRATEGIC_TARGET_DRIFT_RATE;

      return {
        id: entity.id,
        targetTotalUSD: slowTargetTotalUSD,
        currentHoldingsByInstrumentId: currentHoldingByCompany,
        // Real loan investors don't hold sharply differing views of the same issuer the way bond
        // investors with different mandates/duration targets do — the same value+momentum view
        // applies to every entity here, so the same map is safely reused across participants.
        attractivenessByInstrumentId: attractivenessByCompany,
      };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.loanDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    const result = clearFinancialAsset(instruments, participants, priorDealerInventoryById, {
      weeklyRebalanceRate: WEEKLY_TACTICAL_REBALANCE_RATE,
      liquidityDepth: LOAN_LIQUIDITY_DEPTH,
      dealerInventoryPressureRate: DEALER_INVENTORY_PRESSURE_RATE,
      dealerSpreadBps: DEALER_SPREAD_BPS,
    });

    // Apply: real cleared discount margin + derived price-to-par, mutated in place so stage 8
    // reads it as an already-real value. Also extend the rolling history for momentum.
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    result.newStatById.forEach((newDiscountMarginBps, companyId) => {
      const comp = companyById.get(companyId);
      if (!comp) return;
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
