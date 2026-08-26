/**
 * Stage 2: Region Macro Evolution
 *
 * Evolves each region's macro state (GDP, inflation, wages, policy rate, yield curve) via
 * evolveRegionMacro, then drifts equity/corp-bond/sov-bond ownership shares toward their
 * target allocations (computeTargetOwnershipShares) and captures the equity holder-class
 * flow consumed by stage 8's price mechanism.
 */

import { GameState, RegionId } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { evolveRegionMacro } from '../../macro/evolution';
import { computeOccupationDemand, computeSupplyDemandPremium, computeTargetOwnershipShares } from './shared-helpers';
import { WeeklyStepContext } from './context';

export function runRegionMacroStage(state: GameState, ctx: WeeklyStepContext): void {
  const globalInflationShock = (Math.random() - 0.5) * 0.0008;
  const globalGdpShock = (Math.random() - 0.5) * 0.001;

  ctx.updatedRegions = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (state.compositeIndices.us500.change1W / Math.max(1, state.compositeIndices.us500.value)) || 0;
    if (regionId === 'EUR') equityRet = (state.compositeIndices.euStoxx.change1W / Math.max(1, state.compositeIndices.euStoxx.value)) || 0;
    if (regionId === 'UK') equityRet = (state.compositeIndices.uk100.change1W / Math.max(1, state.compositeIndices.uk100.value)) || 0;
    if (regionId === 'JPN') equityRet = (state.compositeIndices.jp225.change1W / Math.max(1, state.compositeIndices.jp225.value)) || 0;

    const regionFirms = ctx.prevActiveFirms.filter(f => f.region === regionId);

    const regionEmployment = regionFirms.reduce((sum, f) => sum + f.employeeCount, 0);
    const regionEmploymentLastWeek = state.companies.filter(f => f.region === regionId).reduce((sum, f) => sum + (f.previousEmployeeCount || f.employeeCount), 0);
    const employmentChangePct = (regionEmployment - regionEmploymentLastWeek) / Math.max(1, regionEmploymentLastWeek);
    const bottomUpUnemploymentDelta = -employmentChangePct * 0.1;

    const totalRegionalCapEx = regionFirms.reduce((sum, f) => sum + (f.capex || 0), 0);
    const baseGdp = state.regions[regionId].estimatedNominalGdpUSD;
    const baselineExpectedCapEx = (baseGdp * 0.03) / 52;
    const capexDeltaDollars = totalRegionalCapEx - baselineExpectedCapEx;
    const capexGdpImpactWeekly = capexDeltaDollars / baseGdp;
    const boundedGdpContribution = (capexGdpImpactWeekly * 52);

    const regionOccDemand = computeOccupationDemand(
      ctx.prevActiveFirms,
      state.regions[regionId].privateSectorSegments,
      regionId,
      state.regions[regionId].governmentEmployment
    );

    const maturedTranchesPrev = (state.regions[regionId].govDebtTranches || []).filter(t => t.maturityWeek <= ctx.nextWeek);
    const maturedPrincipalUSDPrev = maturedTranchesPrev.reduce((s, t) => s + t.principalUSD, 0);
    const weeklyDeficitUSDPrev = Math.max(0, state.regions[regionId].governmentSpendingUSD - state.regions[regionId].governmentRevenueUSD) + maturedPrincipalUSDPrev;
    const monetizationSharePrev = ((state.regions[regionId].balanceSheetStance ?? 0) * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSDPrev * monetizationSharePrev;

    // Auction-outcome driver for the yield curve level: compare outstanding sovereign supply
    // against bank/institutional absorption capacity, using the same demand/supply premium
    // pattern as corporate bond pricing and the same ownership shares the 40/60 issuance
    // split allocates holdings against.
    const totalGovDebtUSDPrev = (state.regions[regionId].govDebtTranches || []).reduce((s, t) => s + t.principalUSD, 0);
    const sovereignAuctionPremiumBps = computeSupplyDemandPremium(
      state.regions[regionId].sovBondOwnership,
      { bank: state.regions[regionId].bankingSector.bankEquityUSD, institutional: state.regions[regionId].institutionalSector.sectorEquityUSD },
      totalGovDebtUSDPrev
    );

    const { updatedRegion, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      {
        capexGdpContribution: boundedGdpContribution,
        bottomUpUnemploymentDelta,
        businessLoanBookInputUSD: ctx.regionFloatingPrincipal[regionId],
        trackedHealthSignal: ctx.regionTrackedHealthSignal[regionId],
        publicCompanyEmployment: ctx.regionPublicCompanyEmployment[regionId],
        occupationDemand: regionOccDemand,
        monetizedAmountUSD, marginCompression: 0, creditContagionBps: 0,
        sovereignAuctionPremiumBps,
      },
      ctx.nextWeek,
      equityRet,
      state.commodities
    );
    ctx.updatedRegions[regionId] = updatedRegion;

    if (updatedRegion.institutionalSector) {
      const macroSector = updatedRegion.institutionalSector;
      const investmentIncomeUSD =
        ((macroSector.equityHoldingsUSD || 0) +
         (macroSector.corpBondHoldingsUSD || 0) +
         (macroSector.sovBondHoldingsUSD || 0)) *
        ((macroSector.investmentIncomeMarginPct || 0.03) / 52);

      macroSector.cashUSD = (macroSector.cashUSD || 0) + investmentIncomeUSD;
      macroSector.sectorEquityUSD = (macroSector.sectorEquityUSD || 0) + investmentIncomeUSD;
    }

    (['equity', 'corpBond', 'sovBond'] as const).forEach(assetClass => {
      const fieldName = `${assetClass}Ownership` as 'equityOwnership' | 'corpBondOwnership' | 'sovBondOwnership';
      const target = computeTargetOwnershipShares(assetClass, regionId, updatedRegion, state.regions);
      const current = updatedRegion[fieldName];
      const updatedShares = {
        bankShare: current.bankShare + (target.bankShare - current.bankShare) * 0.05,
        institutionalShare: current.institutionalShare + (target.institutionalShare - current.institutionalShare) * 0.05,
        foreignShare: Object.fromEntries((['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(r => [r, current.foreignShare[r] + ((target.foreignShare[r] ?? 0) - current.foreignShare[r]) * 0.05])) as Record<RegionId, number>,
        centralBankShare: current.centralBankShare + (target.centralBankShare - current.centralBankShare) * 0.05,
      };

      if (assetClass === 'equity') {
        const totalRegionEquityCapUSD = state.companies.filter(c => c.region === regionId && isActiveCompany(c)).reduce((s, c) => s + c.marketCap, 0);
        const foreignShareDelta = Object.keys(updatedShares.foreignShare).reduce((s, r) => s + (updatedShares.foreignShare[r as RegionId] - current.foreignShare[r as RegionId]), 0);
        const shareDelta = (updatedShares.bankShare - current.bankShare) + (updatedShares.institutionalShare - current.institutionalShare) + foreignShareDelta;
        ctx.regionEquityNetFlowUSD[regionId] = shareDelta * totalRegionEquityCapUSD;
      }

      const totalSharesSum = updatedShares.bankShare + updatedShares.institutionalShare + Object.values(updatedShares.foreignShare).reduce((a, b) => a + b, 0) + updatedShares.centralBankShare;
      if (totalSharesSum > 0) {
        updatedShares.bankShare /= totalSharesSum;
        updatedShares.institutionalShare /= totalSharesSum;
        Object.keys(updatedShares.foreignShare).forEach(r => {
          updatedShares.foreignShare[r as RegionId] /= totalSharesSum;
        });
        updatedShares.centralBankShare /= totalSharesSum;
      }
      updatedRegion[fieldName] = updatedShares;
    });
    if (isMeeting) {
      ctx.rateChanges.push({ region: regionId, deltaBps: rateDeltaBps });
    }

    // Add Macro Diagnostic Telemetry to Log
    ctx.diagnosticLogs.push({
      week: ctx.nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  // V7: Cross-border reserve / balance-sheet stance spillover effect
  const allRegionIds = Object.keys(ctx.updatedRegions) as RegionId[];
  const globalStanceAvg = allRegionIds.reduce((s, r) => s + (ctx.updatedRegions[r].balanceSheetStance ?? 0), 0) / Math.max(1, allRegionIds.length);
  allRegionIds.forEach(r => {
    const spilloverEffect = (globalStanceAvg - (ctx.updatedRegions[r].balanceSheetStance ?? 0)) * 0.05; // pulled gently toward the global average
    ctx.updatedRegions[r].creditConditionsSpilloverAdjustment = spilloverEffect;
  });
}
