/**
 * Stage 3: Category Demand Targets
 *
 * Computes each region's C+I+G demand target per industry sub-unit and smooths the prior
 * week's demand level toward it; also (re)forms supplier/customer relationships quarterly.
 */

import { GameState, RegionId } from '../../../types';
import { categoryPriceTier, HouseholdPriceTier } from '../../../domain/industry';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { CAPEX_SUPPLIER_WEIGHTS } from '../../../domain/market-microstructure';
import { formSupplyRelationships } from './shared-helpers';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../../bootstrap/national-accounts';
import { decomposeGovernmentSpending } from '../../../domain/government';
import { WeeklyStepContext } from './context';

export function runCategoryDemandStage(state: GameState, ctx: WeeklyStepContext): void {
  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];
    const hs = reg.householdState;

    const categorySupplyGrowth: Record<string, number> = {};
    (Object.keys(reg.categoryDemand) as string[]).forEach(cat => {
      const firmsInCat = ctx.prevActiveFirms.filter(f => f.region === regionId && (f.productLines || []).some(l => l.subUnitId === cat));
      if (firmsInCat.length === 0) { categorySupplyGrowth[cat] = 0; return; }
      categorySupplyGrowth[cat] = firmsInCat.reduce((s, f) => {
        const line = f.productLines.find(l => l.subUnitId === cat)!;
        return s + (f.growthCapex / Math.max(1, f.annualRevenue)) * line.revenueShare;
      }, 0) / firmsInCat.length;
    });

    // Compute active GDP components for bottom-up demand targets.
    // HH4b: C is the SUM OF THE COHORT BUDGETS — disposable income less savings, less the real
    // debt service the households actually owe (HH3's books), plus the capital receipts that
    // recycle it (deposit interest, dividends, the named seed residual). At seed the debit and
    // the credit net out by construction; from week 1 a rate hike raises the middle's debt
    // service ahead of the top's receipts, and household demand genuinely tightens.
    const cohorts = hs.cohorts ?? [];
    const C = cohorts.length > 0
      ? cohorts.reduce((a, c) => a + c.consumptionBudgetUSD, 0)
      : reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    // Government purchases only — the transfer share of outlays reaches demand through C, not
    // here. PUB1e: ONE owner of the procurement budget, including the fiscal stance, so the
    // goods market cannot bid for a stimulus the treasury never pays for.
    const govBudget = decomposeGovernmentSpending(
      reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyUSD ?? 0
    );
    const G = govBudget.procurementBudgetUSD * 52;
    // HC3: private firms' capex is real corporate demand like anyone else's (their segments'
    // capexUSD was reduced by exactly this at the carve).
    const rawCorporateDemandBase = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const I = newLaggedCorporateDemandBase;

    let totalGovWeight = 0;
    let totalCorpWeight = 0;
    // HH4b: the household pool allocates BY PRICE TIER — each tier of categories draws on the
    // slice of C the cohorts' real spend mixes assign it (the derived staple/standard/luxury
    // shares), normalized within the tier's own buyerMix weights. The mixes are calibrated so
    // this opens exactly where the flat allocation stood (§7.4); it moves when the cohort mix
    // does — a boom that lifts top-tier budgets pulls demand toward luxury categories because
    // that is where the marginal dollar goes.
    const hhWeightByTier: Record<HouseholdPriceTier, number> = { STAPLE: 0, STANDARD: 0, LUXURY: 0 };
    const spendShareByTier: Record<HouseholdPriceTier, number> = {
      STAPLE: hs.stapleSpendShare, STANDARD: hs.standardSpendShare, LUXURY: hs.luxurySpendShare,
    };

    // Capital-goods categories (heavy_equipment, industrial_automation, commercial_construction,
    // enterprise_software, commercial_fleet) are excluded from the abstract CORPORATE pool here —
    // their demand comes from real, named per-company capex bids in 05-unit-bidding.ts instead
    // (each buyer's actual weekly capex $, bid directly against real supplier companies or the
    // private sector — see PRIVATE_SEGMENT_SUPPLY_CATEGORIES/CAPEX_CATEGORY_PRIVATE_SEGMENT),
    // not an anonymous share of aggregate I. Leaving them in both channels would double-count
    // the same capex dollars.
    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        if (CAPEX_SUPPLIER_WEIGHTS[su.unitId] !== undefined) return;
        hhWeightByTier[categoryPriceTier(su.unitId)] += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const allTargets: Record<string, number> = {};
    const govBudgetByCategory: Record<string, number> = {};
    const smoothingByCategory: Record<string, number> = {};
    const corporateDemandByCategory: Record<string, number> = {};

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        if (CAPEX_SUPPLIER_WEIGHTS[su.unitId] !== undefined) {
          // These categories' real demand/growth signal now comes entirely from stage05's real
          // per-company capex bids and Phase 1's real-sales revenue reconciliation, not from
          // this stage's statistical demandLevelUSD/demandGrowthAnnual — this placeholder just
          // carries the level forward unchanged (no growth signal from here) so the field stays
          // a sane, non-zero number for anything that still reads it (e.g. the commodities UI).
          // No corporateDemandUSD here either — these categories' real bids in stage05 are
          // sized directly from each buyer's own capex, not from a generic corporate-demand
          // share, to avoid double-counting.
          allTargets[su.unitId] = reg.categoryDemand[su.unitId as keyof typeof reg.categoryDemand]?.demandLevelUSD ?? (I * CAPEX_SUPPLIER_WEIGHTS[su.unitId]);
          smoothingByCategory[su.unitId] = 0.08;
          return;
        }
        const tier = categoryPriceTier(su.unitId);
        const suHhDemand = hhWeightByTier[tier] > 0
          ? (su.buyerMix.HOUSEHOLD / hhWeightByTier[tier]) * C * spendShareByTier[tier]
          : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        // PUB1e: stage 05 bids exactly this, weekly (rule 9 — the period is in the name).
        govBudgetByCategory[su.unitId] = suGovDemand / 52;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        allTargets[su.unitId] = suHhDemand + suGovDemand + suCorpDemand;
        corporateDemandByCategory[su.unitId] = suCorpDemand;

        if (su.buyerMix.HOUSEHOLD > 0.5) smoothingByCategory[su.unitId] = 0.1;
        else if (su.buyerMix.GOVERNMENT > 0.5) smoothingByCategory[su.unitId] = 0.05;
        else smoothingByCategory[su.unitId] = 0.08;
      });
    });

    Object.keys(allTargets).forEach((cat) => {
      const target = allTargets[cat]!;
      if (isNaN(target)) {
        ctx.diagnosticLogs.push({
          week: ctx.nextWeek,
          level: 'ERROR',
          message: `NaN target demand for category ${cat} in region ${regionId}. C=${C}, G=${G}, I=${I}`,
        });
      }
      const smoothing = smoothingByCategory[cat] ?? 0.1;
      const existingEntry = reg.categoryDemand[cat as keyof typeof reg.categoryDemand];
      const hasPriorDemand = Boolean(existingEntry && existingEntry.demandLevelUSD > 0);
      const prevLevel = hasPriorDemand ? existingEntry.demandLevelUSD : target;
      const newLevel = hasPriorDemand ? prevLevel * (1 - smoothing) + target * smoothing : target;
      const isStartupTransition = (state.currentWeek <= 1) || prevLevel < newLevel * 0.2 || newLevel < prevLevel * 0.2;
      const rawGrowthAnnual = hasPriorDemand && prevLevel > 0 && !isStartupTransition ? ((newLevel / prevLevel) - 1) * 52 : 0;
      const growthAnnual = Number.isFinite(rawGrowthAnnual) ? rawGrowthAnnual : 0;
      const prevHistory = existingEntry?.demandHistory ?? [];
      const crowdingIntensity = Math.max(0, Math.min(1, (categorySupplyGrowth[cat] ?? 0) * 8 - (target ? growthAnnual : 0)));
      // Spread the existing entry first: this stage owns the demand-side fields it sets below and
      // nothing else. Rebuilding the object from scratch silently dropped every field owned by a
      // later stage — above all `unitPriceUSD`, the real cleared price 05-unit-bidding.ts writes.
      // That price is bootstrapped per sub-unit (deriveSubUnitUnitPrice, ~$70k/unit for some
      // categories); losing it meant stage 05 fell back to its `Math.max(1, seed || 1)` default
      // from week 1 onward and every price in the economy silently rebased to a ~$1 scale, one
      // week into every run. Anything comparing a price across that boundary — a price index
      // most of all — was comparing two different units.
      (reg.categoryDemand as any)[cat] = {
        ...(existingEntry ?? {}),
        demandLevelUSD: newLevel,
        demandGrowthAnnual: growthAnnual,
        demandHistory: [...prevHistory.slice(-25), newLevel],
        crowdingIntensity,
        inventoryLevelUSD: existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
        inputCostPressure: existingEntry?.inputCostPressure ?? 0,
        clearedInputPriceIndex: existingEntry?.clearedInputPriceIndex ?? 1.0,
        upstreamScarcityIndex: existingEntry?.upstreamScarcityIndex ?? 1.0,
        lastWeekInventoryLevelUSD: existingEntry?.lastWeekInventoryLevelUSD ?? existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
        corporateDemandUSD: corporateDemandByCategory[cat] ?? 0,
      };
    });

    // PUB1e: publish the budget stage 05 will bid, and reset last week's realized spend.
    reg.governmentProcurementBudgetByCategory = govBudgetByCategory;
    reg.governmentProcurementSpentUSD = 0;

    // Supply Relationships
    if (state.currentWeek % 13 === 0 || !reg.supplyRelationships || reg.supplyRelationships.length === 0) {
      reg.supplyRelationships = formSupplyRelationships(regionId, ctx.prevActiveFirms);
    }
  });
}
