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
import { computeOccupationDemand, computeTargetOwnershipShares } from './shared-helpers';
import { WeeklyStepContext } from './context';

// Bank/institutional/foreign/central-bank ownership is capped well under 100% so household
// (the implicit residual everywhere ownership is displayed) always retains a real floor,
// rather than being squeezed to exactly 0.
const MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE = 0.85;

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

    // (The sovereign "auction premium" that used to be computed here is gone along with the
    // curve write it fed. It compared an ownership SHARE times sector EQUITY against total
    // principal outstanding — quantities that are not commensurable — to synthesise a yield
    // premium. The real version of that comparison is the auction itself, in 07c, where real
    // demand meets real supply.)

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

      // Bank/institutional/foreign/central-bank shares are meant to leave a real residual for
      // household ownership (every other ownership display in the app computes household as
      // 1 - these four) — only rescale them down when they'd otherwise exceed a cap that
      // guarantees household keeps a minimum floor, rather than always normalizing to exactly
      // 1.0. Forcing the sum to 1.0 unconditionally (the previous behavior) made household's
      // share exactly 0 by construction on every run, and inflated institutional/bank/foreign
      // shares well above their calibrated starting values (e.g. equity institutionalShare
      // divided by a pre-normalization sum of ~0.6 jumps to ~0.42/0.6 ≈ 0.70 immediately).
      const totalSharesSum = updatedShares.bankShare + updatedShares.institutionalShare + Object.values(updatedShares.foreignShare).reduce((a, b) => a + b, 0) + updatedShares.centralBankShare;
      if (totalSharesSum > MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE) {
        const scale = MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE / totalSharesSum;
        updatedShares.bankShare *= scale;
        updatedShares.institutionalShare *= scale;
        Object.keys(updatedShares.foreignShare).forEach(r => {
          updatedShares.foreignShare[r as RegionId] *= scale;
        });
        updatedShares.centralBankShare *= scale;
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
