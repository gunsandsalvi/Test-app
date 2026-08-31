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
import { isActiveCompany } from '../../../domain/company';
import { firmInputIntensities } from '../../../domain/industry-registry';
import { profileKeyOf } from './profiles';
import { decomposeGovernmentSpending } from '../../../domain/government';
import { pay } from './settlement';
import { SME_WAGE_GAP } from '../../bootstrap/firms';
import { weeklyWageBillUSD, getBaseAnnualWageUSD } from '../../bootstrap/labor-and-wages';
import { SECTOR_OCCUPATION_MIX } from '../../../domain/region-macro';
import { INDUSTRY_REGISTRY, totalOutputFromFinalDemand } from '../../../domain/industry-registry';
import { WeeklyStepContext } from './context';

export function runCategoryDemandStage(state: GameState, ctx: WeeklyStepContext): void {
  // SCALE: one pass over the firms' own product lines instead of a full firm-list filter per
  // (region, category) — same firms in the same (firm-list) order, so the per-category reduce
  // sees exactly the sequence the filter produced.
  const firmsByRegionCat = new Map<string, Map<string, typeof ctx.prevActiveFirms>>();
  ctx.prevActiveFirms.forEach(f => {
    let byCat = firmsByRegionCat.get(f.region);
    if (!byCat) { byCat = new Map(); firmsByRegionCat.set(f.region, byCat); }
    const seen = new Set<string>();
    (f.productLines || []).forEach(l => {
      if (seen.has(l.subUnitId)) return;
      seen.add(l.subUnitId);
      const bucket = byCat!.get(l.subUnitId);
      if (bucket) bucket.push(f); else byCat!.set(l.subUnitId, [f]);
    });
  });
  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];
    const hs = reg.householdState;

    const categorySupplyGrowth: Record<string, number> = {};
    (Object.keys(reg.categoryDemand) as string[]).forEach(cat => {
      const firmsInCat = firmsByRegionCat.get(regionId)?.get(cat) ?? [];
      if (firmsInCat.length === 0) { categorySupplyGrowth[cat] = 0; return; }
      categorySupplyGrowth[cat] = firmsInCat.reduce((s, f) => {
        // A firm with no product lines cannot be a supplier of this category; skipping is the
        // same outcome the `!` produced by accident, said on purpose.
        const line = (f.productLines ?? []).find(l => l.subUnitId === cat);
        if (!line) return s;
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
    // SETL-B: THE EMPLOYERS PAY. Household income used to be a derived statistic while the
    // deposits it implied were credited by a savings formula — two independent quantities for one
    // thing (rule 3). Companies now pay their payroll (stage 08), and the other two employers pay
    // here: the government out of its real account, and the private-sector tier from the boundary
    // until HC gives those segments a ledger of their own. Together these are the economy's wage
    // bill, and household deposits move by them instead of by a rate applied to an estimate.
    {
      const payrollUSD = reg.governmentPayrollWeeklyUSD ?? 0;
      if (payrollUSD > 0) {
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: { kind: 'HOUSEHOLD', region: regionId },
          amountUSD: payrollUSD,
          reason: 'government payroll',
        });
      }
      // HH: transfers are a PAYMENT. Unemployment benefits and the social programme used to
      // reach household INCOME through the accounting identity while never reaching household
      // CASH — a one-sided flow (rule 14) that only became visible when income became the sum of
      // what households actually receive.
      const transfersUSD = reg.governmentTransfersWeeklyUSD ?? 0;
      if (transfersUSD > 0) {
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: { kind: 'HOUSEHOLD', region: regionId },
          amountUSD: transfersUSD,
          reason: 'government transfers',
        });
      }
      // SEG2c/HH: each pool pays its own payroll, through the same one wage-bill computation
      // every employer uses — its headcount, in the occupations its industry's sector employs,
      // at the wage those occupations clear at, times the SME tier's own wage level.
      //
      // The residual-of-a-top-down-total form this replaced was the right bridge while the tier
      // had no ledger. It is the wrong one now: with books, an over-derived wage bill drains a
      // pool's cash and shows up as measurable distress instead of disappearing into a statistic.
      {
        const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
        (reg.smePools || []).forEach((pool) => {
          const wagesUSD = weeklyWageBillUSD(
            pool.employment,
            SECTOR_OCCUPATION_MIX[INDUSTRY_REGISTRY[pool.industry].sector as keyof typeof SECTOR_OCCUPATION_MIX] ?? { GENERAL: 1.0 },
            baseAnnualWageUSD,
            reg.occupationPools,
            1 - SME_WAGE_GAP
          );
          if (wagesUSD > 0) {
            pay(ctx, {
              payer: { kind: 'SEGMENT', region: regionId, industry: pool.industry },
              payee: { kind: 'HOUSEHOLD', region: regionId },
              amountUSD: wagesUSD,
              reason: 'private-sector tier wages',
            });
          }
        });
      }
    }

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

    // SUPPLY/CHAIN — the corporate input basket, summed from the firms that will bid it. This is
    // the same accessor stage 05 uses per firm, so the regional level and the bids that fill it
    // are one number rather than two (§7.180).
    const corpInputDemandByCategory: Record<string, number> = {};
    ctx.updatedCompanies.forEach((c) => {
      if (c.region !== regionId || !isActiveCompany(c)) return;
      const intensities = firmInputIntensities(c.productLines, profileKeyOf(c));
      Object.entries(intensities).forEach(([unitId, intensity]) => {
        corpInputDemandByCategory[unitId] =
          (corpInputDemandByCategory[unitId] ?? 0) + c.annualRevenue * (intensity ?? 0);
      });
    });

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        if (CAPEX_SUPPLIER_WEIGHTS[su.unitId] !== undefined) {
          // RULE 3 — INVESTMENT WAS REPRESENTED TWICE, and this is where the second copy lived.
          //
          // The level was CARRIED FORWARD UNCHANGED from the seed — a frozen placeholder — while
          // the real demand was each firm's own capex, bid directly in stage 05. So the
          // capital-goods industries were SIZED for one number and ASKED for another: measured
          // 54.0B/yr built against 83.6B/yr bid, **1.55x** (§7.168), and four of the five
          // categories in permanent shortage as a result.
          //
          // The level IS the firms' own capex now — a measurement of what they will actually bid,
          // not a statistic beside it. `corporateDemandUSD` still stays absent: stage 05 sizes
          // those bids from each buyer's capex directly, and adding a generic corporate share on
          // top would be the double count this comment originally warned about.
          const capexDemandUSD = ctx.updatedCompanies.reduce((a, c) => (
            c.region === regionId && isActiveCompany(c)
              ? a + ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)) * CAPEX_SUPPLIER_WEIGHTS[su.unitId]
              : a), 0);
          allTargets[su.unitId] = capexDemandUSD > 0
            ? capexDemandUSD
            : (reg.categoryDemand[su.unitId as keyof typeof reg.categoryDemand]?.demandLevelUSD ?? (I * CAPEX_SUPPLIER_WEIGHTS[su.unitId]));
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
        // SUPPLY/CHAIN — WHAT CORPORATES BUY OF A NON-CAPITAL GOOD IS NOT INVESTMENT.
        //
        // This sized it as a share of `I`, so the same investment number was allocated twice: once
        // here across every corporate-bought good by buyer mix, and once as the capital-goods
        // bids stage 05 actually places (§7.180). A corporate purchase of professional services or
        // premises is an OPERATING purchase — intermediate demand — and the level must be what
        // the firms will really bid, which stage 05 sizes from each firm's own input intensity.
        // Same number, one representation (rule 3).
        const suCorpDemand = corpInputDemandByCategory[su.unitId] ?? 0;
        allTargets[su.unitId] = suHhDemand + suGovDemand + suCorpDemand;
        corporateDemandByCategory[su.unitId] = suCorpDemand;

        if (su.buyerMix.HOUSEHOLD > 0.5) smoothingByCategory[su.unitId] = 0.1;
        else if (su.buyerMix.GOVERNMENT > 0.5) smoothingByCategory[su.unitId] = 0.05;
        else smoothingByCategory[su.unitId] = 0.08;
      });
    });

    // CHAIN-E — everything above is FINAL demand (C + I + G, corporate = investment only). A
    // product's real demand is that PLUS what other producers consume of it, and until this solve
    // existed the intermediate half had nowhere to live: firms bid for their inputs in stage 05
    // against a demand level that had no room for those bids (§7.117). Solved from the registry's
    // own BOM matrix, so it moves when a recipe does and cannot drift from it (rule 3).
    //
    // Capex categories keep their carried-forward level as their FINAL demand here — their final
    // half comes from real per-company capex bids in stage 05, not from this stage — but they are
    // inputs to other products too (heavy equipment into repair, enterprise software into several),
    // so they take the intermediate half like everything else.
    const totalOutputTargets = totalOutputFromFinalDemand(allTargets);
    Object.keys(allTargets).forEach((cat) => { allTargets[cat] = totalOutputTargets[cat] ?? allTargets[cat]!; });

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
