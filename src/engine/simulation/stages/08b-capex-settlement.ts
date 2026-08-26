/**
 * Stage 8b: Capex Settlement
 *
 * Every active company's real weekly capex (maintenanceCapex + growthCapex, finalized this week
 * by stage 08) is a genuine purchase from real counterparties — not an abstract slice of
 * aggregate investment demand. This stage sums those real dollars per capital-goods category
 * (heavy_equipment, industrial_automation, commercial_construction, enterprise_software,
 * commercial_fleet) and routes them to:
 *   - real, named public companies producing that category in-region, via the category's own
 *     demandLevelUSD/demandGrowthAnnual — the same channel every other category already uses to
 *     turn demand into a producer's realized revenue (categoryDrivenGrowth in stage 08), so a
 *     supplier's growth genuinely tracks its real buyers' capex, and
 *   - the region's private/non-public sector segment for the portion no in-region public
 *     capacity exists for, credited directly since that segment sits outside the categoryDemand
 *     growth mechanism entirely.
 * Runs after company-fundamentals (08) so it settles against this week's real, final capex
 * figures rather than a lagged snapshot, and overwrites the capex-supplier categoryDemand
 * entries stage 03 left untouched earlier this same week.
 */

import { GameState, RegionId, PrivateSegmentType } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { CAPEX_SUPPLIER_WEIGHTS, CAPEX_CATEGORY_PRIVATE_SEGMENT, CAPEX_PUBLIC_SUPPLY_SHARE } from '../../../domain/market-microstructure';
import { WeeklyStepContext } from './context';

const CAPEX_SUBUNITS = Object.keys(CAPEX_SUPPLIER_WEIGHTS);

export function runCapexSettlementStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const regionFirms = ctx.updatedCompanies.filter(c => c.region === regionId && isActiveCompany(c));
    if (regionFirms.length === 0) return;

    // Annual figures throughout, matching every other component of categoryDemand.demandLevelUSD
    // (stage03's C/I/G are all annual; feeding a weekly $ amount into that same field understated
    // these categories' demand by 52x).
    const annualDemandBySubUnit: Record<string, number> = {};
    CAPEX_SUBUNITS.forEach(su => { annualDemandBySubUnit[su] = 0; });
    regionFirms.forEach(buyer => {
      const annualCapexUSD = buyer.maintenanceCapex + buyer.growthCapex;
      if (annualCapexUSD <= 0) return;
      CAPEX_SUBUNITS.forEach(su => {
        annualDemandBySubUnit[su] += annualCapexUSD * CAPEX_SUPPLIER_WEIGHTS[su];
      });
    });

    // Sum this week's private-sector share across every capex category first — several
    // categories can route to the same segment (e.g. heavy_equipment and industrial_automation
    // both fall to MANUFACTURING) — before touching annualRevenueUSD, since that field is a
    // run-rate this stage must replace, not an accumulator to add into per-category.
    const privateDemandBySegment: Partial<Record<PrivateSegmentType, number>> = {};

    CAPEX_SUBUNITS.forEach(subUnitId => {
      const totalDemandUSD = annualDemandBySubUnit[subUnitId];
      const hasPublicSuppliers = regionFirms.some(s => (s.productLines || []).some(l => l.subUnitId === subUnitId));
      const publicDemandUSD = hasPublicSuppliers ? totalDemandUSD * CAPEX_PUBLIC_SUPPLY_SHARE : 0;
      const privateDemandUSD = totalDemandUSD - publicDemandUSD;

      // Real public suppliers compete for publicDemandUSD through the same categoryDemand ->
      // categoryDrivenGrowth channel every other category uses — no separate direct credit here,
      // so a company's capex is never counted twice (once as demand signal, once as cash credit).
      // Only touch the entry when a real public producer exists in-region for it: some capital
      // goods (construction, fleet/logistics) are realistically dominated by private firms, and
      // there's no company for a "demand growth" figure to mean anything to — forcing the level
      // toward zero every week just produces a meaningless ratio-of-near-zero-numbers growth%.
      const entry = reg.categoryDemand[subUnitId as keyof typeof reg.categoryDemand] as any;
      if (entry && hasPublicSuppliers) {
        const prevLevel = entry.demandLevelUSD > 0 ? entry.demandLevelUSD : publicDemandUSD;
        const newLevel = prevLevel * 0.92 + publicDemandUSD * 0.08;
        const rawGrowthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
        entry.demandLevelUSD = newLevel;
        entry.demandGrowthAnnual = Number.isFinite(rawGrowthAnnual) ? rawGrowthAnnual : 0;
        entry.demandHistory = [...(entry.demandHistory || []).slice(-25), newLevel];
      }

      const segmentType = CAPEX_CATEGORY_PRIVATE_SEGMENT[subUnitId];
      privateDemandBySegment[segmentType] = (privateDemandBySegment[segmentType] ?? 0) + privateDemandUSD;
    });

    // annualRevenueUSD is a run-rate recomputed every week by evolveRegionMacro's own organic
    // formula (macro/evolution.ts), not an accumulator — so this week's capex contribution must
    // REPLACE last week's capex contribution, not stack another annualized figure on top of it.
    (reg.privateSectorSegments || []).forEach((segment) => {
      const newCapexContribution = privateDemandBySegment[segment.segmentType] ?? 0;
      const priorCapexContribution = segment.capexDerivedAnnualRevenueUSD ?? 0;
      segment.annualRevenueUSD = Math.max(1, segment.annualRevenueUSD - priorCapexContribution + newCapexContribution);
      segment.capexDerivedAnnualRevenueUSD = newCapexContribution;
    });
  });
}
