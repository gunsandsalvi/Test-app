/**
 * Stage 3: Category Demand Targets
 *
 * Computes each region's C+I+G demand target per industry sub-unit and smooths the prior
 * week's demand level toward it; also (re)forms supplier/customer relationships quarterly.
 */

import { GameState, RegionId } from '../../../types';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { CAPEX_SUPPLIER_WEIGHTS } from '../../../domain/market-microstructure';
import { formSupplyRelationships } from './shared-helpers';
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

    // Compute active GDP components for bottom-up demand targets
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const G = reg.governmentSpendingUSD * 52 * 0.35 * (1 + reg.fiscalStanceScore * 0.25);
    const rawCorporateDemandBase = ctx.prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const I = newLaggedCorporateDemandBase;

    let totalHhWeight = 0;
    let totalGovWeight = 0;
    let totalCorpWeight = 0;

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
        totalHhWeight += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const allTargets: Record<string, number> = {};
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
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
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
      (reg.categoryDemand as any)[cat] = {
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

    // Supply Relationships
    if (state.currentWeek % 13 === 0 || !reg.supplyRelationships || reg.supplyRelationships.length === 0) {
      reg.supplyRelationships = formSupplyRelationships(regionId, ctx.prevActiveFirms);
    }
  });
}
