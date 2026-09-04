import { householdDepositsOf, bankReservesOf, bankDepositLines } from '../../ledger/accounts';
import { addDepositLines, ZERO_DEPOSIT_LINES, regionLoanBooksLocal } from '../../../domain/banking';
import { facilityBookOf, materializeGovLadder } from '../../../engine2/tranches';
/**
 * Stage 2: Region Macro Evolution
 *
 * Evolves each region's macro state (GDP, inflation, wages, policy rate, yield curve) via
 * evolveRegionMacro, and captures the equity holder-class flow consumed by stage 8's price
 * mechanism.
 */

import { GameState, RegionId } from '../../../types';
import { getSimulationDate } from '../../formatters';
import { evolveRegionMacro } from '../../macro/evolution';
import { computeOccupationDemand } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { random } from '../../rng';
import { marketCapOf } from '../../../domain/company';

/**
 * What households received and paid over the whole of LAST week: every wage, transfer and
 * dividend that landed on the household sector, less the tax they remitted, plus the interest
 * their banks paid them.
 *
 * It is read here, at the top of the week, from the completed prior report. It used to be
 * recorded mid-week by the household balance sheet stage, which runs before the close and so saw
 * only the intraday pass — every household flow the close and the funding cycle settled was
 * simply lost. Reading it here costs no extra staleness (the number was already a week old by
 * the time this stage consumed it) and retires the three region fields that carried it.
 */
function householdWeekOf(
  ctx: WeeklyStepContext, regionId: RegionId, depositInterestLocal: number
): { receiptsLocal: number; taxPaidLocal: number; dividendsLocal: number } | undefined {
  const flows = ctx.priorWeekFlows.householdFlowsByRegion.get(regionId);
  if (!flows) return undefined;
  let receiptsLocal = depositInterestLocal;
  let taxPaidLocal = 0;
  let dividendsLocal = 0;
  flows.forEach((amountLocal, reason) => {
    if (amountLocal > 0) {
      receiptsLocal += amountLocal;
      if (reason === 'dividend to the public float') dividendsLocal += amountLocal;
      return;
    }
    if (reason.includes('tax')) taxPaidLocal += -amountLocal;
  });
  return { receiptsLocal, taxPaidLocal, dividendsLocal };
}

export function runRegionMacroStage(state: GameState, ctx: WeeklyStepContext): void {
  const globalInflationShock = (random() - 0.5) * 0.0008;
  const globalGdpShock = (random() - 0.5) * 0.001;

  ctx.updatedRegions = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (state.compositeIndices.usaComposite.change1W / Math.max(1, state.compositeIndices.usaComposite.value)) || 0;
    if (regionId === 'EUR') equityRet = (state.compositeIndices.eurComposite.change1W / Math.max(1, state.compositeIndices.eurComposite.value)) || 0;
    if (regionId === 'UK') equityRet = (state.compositeIndices.ukComposite.change1W / Math.max(1, state.compositeIndices.ukComposite.value)) || 0;
    if (regionId === 'JPN') equityRet = (state.compositeIndices.jpnComposite.change1W / Math.max(1, state.compositeIndices.jpnComposite.value)) || 0;

    const regionFirms = ctx.prevActiveFirms.filter(f => f.region === regionId);

    // Employment change is measured over the SAME universe on both sides — public and
    // private firms together (the segments carry only the SME residual now). An asymmetric pair
    // here read the private tier's arrival as a mass layoff and pinned unemployment at its cap.
    const employmentFirms = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(f => f.region === regionId);
    const regionEmployment = employmentFirms.reduce((sum, f) => sum + f.employeeCount, 0);
    const regionEmploymentLastWeek = state.companies.filter(f => f.region === regionId).reduce((sum, f) => sum + (f.previousEmployeeCount || f.employeeCount), 0);
    const employmentChangePct = (regionEmployment - regionEmploymentLastWeek) / Math.max(1, regionEmploymentLastWeek);
    const bottomUpUnemploymentDelta = -employmentChangePct * 0.1;

    const totalRegionalCapEx = regionFirms.reduce((sum, f) => sum + (f.capex || 0), 0);
    const baseGdp = state.regions[regionId].estimatedNominalGdpLocal;
    const baselineExpectedCapEx = (baseGdp * 0.03) / 52;
    const capexDeltaDollars = totalRegionalCapEx - baselineExpectedCapEx;
    const capexGdpImpactWeekly = capexDeltaDollars / baseGdp;
    const boundedGdpContribution = (capexGdpImpactWeekly * 52);

    const regionOccDemand = computeOccupationDemand(
      // Private firms are real employers with real sector occupation mixes; the segments
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

    // What the region's listed equity actually pays — market-cap-weighted, real state.
    const regionListed = state.companies.filter(
      (c) => c.region === regionId && !c.isDefaulted && (marketCapOf(c) ?? 0) > 0
    );
    const regionMcap = regionListed.reduce((a, c) => a + marketCapOf(c), 0);
    const regionAvgDividendYield = regionMcap > 0
      ? regionListed.reduce((a, c) => a + (c.dividendYield ?? 0) * marketCapOf(c), 0) / regionMcap
      : 0;

    const { updatedRegion, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      {
        capexGdpContribution: boundedGdpContribution,
        bottomUpUnemploymentDelta,
        trackedHealthSignal: ctx.regionTrackedHealthSignal[regionId],
        publicCompanyEmployment: ctx.regionPublicCompanyEmployment[regionId],
        occupationDemand: regionOccDemand,
        avgListedDividendYieldAnnual: regionAvgDividendYield,
        householdDepositsLocal: householdDepositsOf(ctx.v2, regionId),
        bankReservesLocal: ctx.updatedCompanies.reduce((a, c) => a + (c.region === regionId && c.isBankEntity && c.bankBalanceSheet ? bankReservesOf(ctx.v2, c.ticker) : 0), 0),
        bankDepositLines: ctx.updatedCompanies.reduce((a, c) => (c.region === regionId && c.isBankEntity && c.bankBalanceSheet ? addDepositLines(a, bankDepositLines(ctx, c.ticker)) : a), ZERO_DEPOSIT_LINES),
        bankLoanBooks: regionLoanBooksLocal(ctx.updatedCompanies.filter((c) => c.region === regionId && c.isBankEntity && !!c.bankBalanceSheet), (b) => facilityBookOf(ctx.v2, b.ticker)),
        householdWeek: householdWeekOf(ctx, regionId, state.regions[regionId].householdDepositInterestWeeklyLocal ?? 0),
        // §3.13-SOV row 2: the ladder is the store's, read here and passed in.
        govLadder: materializeGovLadder(ctx.v2, regionId),
      },
      ctx.nextWeek,
      equityRet,
      state.commodities,
      // What this region produces is what its weather can take from it.
      ctx.prevActiveFirms
    );
    ctx.updatedRegions[regionId] = updatedRegion;

    // The macro institutional-sector accrual is deleted. It applied a flat
    // investmentIncomeMarginPct to three aggregates and accreted the result into sector cash and
    // sector equity every week — a second, formula-driven income stream running beside the real
    // one (every entity is credited its real coupons at its issuers' real terms), and a second
    // writer of numbers that are now derived from the real books each week in holdings-view.ts.
    // Two representations of one real thing; the real one survives.

    // The three ownership shares are no longer drifted here. They were an input that
    // decided real things (three books' float, every bank's sovereign target, household direct
    // equity) while owning nothing; they are now measured off the real books in stage 11.

    if (isMeeting) {
      ctx.rateChanges.push({ region: regionId, deltaBps: rateDeltaBps });
    }

    // Add Macro Diagnostic Telemetry to Log
    ctx.diagnosticLogs.push({
      week: ctx.nextWeek,
      // The WORLD'S date, not the operator's clock. A wall-clock timestamp inside GameState made
      // two same-seed runs hash differently and masked a real determinism check.
      timestamp: getSimulationDate(ctx.nextWeek).toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  // Cross-border spillover, keyed off REAL balance-sheet policy instead of the retired
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
