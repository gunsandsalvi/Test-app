/**
 * Stage 2: Region Macro Evolution
 *
 * Evolves each region's macro state (GDP, inflation, wages, policy rate, yield curve) via
 * evolveRegionMacro, then drifts equity/corp-bond/sov-bond ownership shares toward their
 * target allocations (computeTargetOwnershipShares) and captures the equity holder-class
 * flow consumed by stage 8's price mechanism.
 */

import { GameState, RegionId } from '../../../types';
import { getSimulationDate } from '../../formatters';
import { isActiveCompany } from '../../../domain/company';
import { evolveRegionMacro } from '../../macro/evolution';
import { computeOccupationDemand, computeTargetOwnershipShares } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { random } from '../../rng';

// Bank/institutional/foreign/central-bank ownership is capped well under 100% so household
// (the implicit residual everywhere ownership is displayed) always retains a real floor,
// rather than being squeezed to exactly 0.
const MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE = 0.85;

export function runRegionMacroStage(state: GameState, ctx: WeeklyStepContext): void {
  const globalInflationShock = (random() - 0.5) * 0.0008;
  const globalGdpShock = (random() - 0.5) * 0.001;

  ctx.updatedRegions = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (state.compositeIndices.us500.change1W / Math.max(1, state.compositeIndices.us500.value)) || 0;
    if (regionId === 'EUR') equityRet = (state.compositeIndices.euStoxx.change1W / Math.max(1, state.compositeIndices.euStoxx.value)) || 0;
    if (regionId === 'UK') equityRet = (state.compositeIndices.uk100.change1W / Math.max(1, state.compositeIndices.uk100.value)) || 0;
    if (regionId === 'JPN') equityRet = (state.compositeIndices.jp225.change1W / Math.max(1, state.compositeIndices.jp225.value)) || 0;

    const regionFirms = ctx.prevActiveFirms.filter(f => f.region === regionId);

    // HC3: employment change is measured over the SAME universe on both sides — public and
    // private firms together (the segments carry only the SME residual now). An asymmetric pair
    // here read the private tier's arrival as a mass layoff and pinned unemployment at its cap.
    const employmentFirms = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(f => f.region === regionId);
    const regionEmployment = employmentFirms.reduce((sum, f) => sum + f.employeeCount, 0);
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
      // HC3: private firms are real employers with real sector occupation mixes; the segments
      // supply only the SME residual's statistical demand.
      [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms],
      state.regions[regionId].smePools,
      regionId,
      state.regions[regionId].governmentEmployment
    );

    // (The sovereign "auction premium" that used to be computed here is gone along with the
    // curve write it fed. It compared an ownership SHARE times sector EQUITY against total
    // principal outstanding — quantities that are not commensurable — to synthesise a yield
    // premium. The real version of that comparison is the auction itself, in 07c, where real
    // demand meets real supply.)

    // HH4b: what the region's listed equity actually pays — market-cap-weighted, real state.
    const regionListed = state.companies.filter(
      (c) => c.region === regionId && !c.isDefaulted && (c.marketCap ?? 0) > 0
    );
    const regionMcap = regionListed.reduce((a, c) => a + c.marketCap, 0);
    const regionAvgDividendYield = regionMcap > 0
      ? regionListed.reduce((a, c) => a + (c.dividendYield ?? 0) * c.marketCap, 0) / regionMcap
      : 0;

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
        marginCompression: 0, creditContagionBps: 0,
        avgListedDividendYieldAnnual: regionAvgDividendYield,
      },
      ctx.nextWeek,
      equityRet,
      state.commodities
    );
    ctx.updatedRegions[regionId] = updatedRegion;

    // S7: the macro institutional-sector accrual is deleted. It applied a flat
    // investmentIncomeMarginPct to three aggregates and accreted the result into sector cash and
    // sector equity every week — a second, formula-driven income stream running beside the real
    // one (S11 credits every entity its real coupons at its issuers' real terms), and a second
    // writer of numbers that are now derived from the real books each week in holdings-view.ts.
    // Two representations of one real thing; the real one survives.

    (['equity', 'corpBond', 'sovBond'] as const).forEach(assetClass => {
      const fieldName = `${assetClass}Ownership` as 'equityOwnership' | 'corpBondOwnership' | 'sovBondOwnership';
      const target = computeTargetOwnershipShares(assetClass, regionId, updatedRegion, state.regions);
      const current = updatedRegion[fieldName];
      const updatedShares = {
        bankShare: current.bankShare + (target.bankShare - current.bankShare) * 0.05,
        institutionalShare: current.institutionalShare + (target.institutionalShare - current.institutionalShare) * 0.05,
        centralBankShare: current.centralBankShare + (target.centralBankShare - current.centralBankShare) * 0.05,
      };

      // Bank/institutional/central-bank shares are meant to leave a real residual for
      // household ownership (every other ownership display in the app computes household as
      // 1 - these four) — only rescale them down when they'd otherwise exceed a cap that
      // guarantees household keeps a minimum floor, rather than always normalizing to exactly
      // 1.0. Forcing the sum to 1.0 unconditionally (the previous behavior) made household's
      // share exactly 0 by construction on every run, and inflated institutional/bank/foreign
      // shares well above their calibrated starting values (e.g. equity institutionalShare
      // divided by a pre-normalization sum of ~0.6 jumps to ~0.42/0.6 ≈ 0.70 immediately).
      const totalSharesSum = updatedShares.bankShare + updatedShares.institutionalShare + updatedShares.centralBankShare;
      if (totalSharesSum > MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE) {
        const scale = MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE / totalSharesSum;
        updatedShares.bankShare *= scale;
        updatedShares.institutionalShare *= scale;
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
      // The WORLD'S date, not the operator's clock. A wall-clock timestamp inside GameState made
      // two same-seed runs hash differently and masked a real determinism check (§7.32).
      timestamp: getSimulationDate(ctx.nextWeek).toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  // Cross-border spillover, PUB2b: keyed off REAL balance-sheet policy instead of the retired
  // stance scalar. A central bank easing harder than the rest of the world loosens credit
  // conditions abroad; the observable is its reinvestment share, which is 1 when passive and
  // below 1 in QT.
  const allRegionIds = Object.keys(ctx.updatedRegions) as RegionId[];
  const stanceOf = (r: RegionId) => (ctx.updatedRegions[r].centralBankSheet?.reinvestmentShare ?? 1) - 1;
  const globalStanceAvg = allRegionIds.reduce((s, r) => s + stanceOf(r), 0) / Math.max(1, allRegionIds.length);
  allRegionIds.forEach(r => {
    ctx.updatedRegions[r].creditConditionsSpilloverAdjustment = (globalStanceAvg - stanceOf(r)) * 0.05;
  });
}
