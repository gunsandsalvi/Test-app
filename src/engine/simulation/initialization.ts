
import { createSeedCategoryDemandState, CAPEX_SUPPLIER_WEIGHTS } from '../../domain/market-microstructure';
import { getSimulationDate } from '../formatters';
import { publicComparableEvMultiple } from './stages/pe-lifecycle';
import { INDEX_DEFINITIONS } from '../../domain/indexes';
import { PREMIUM_TO_SURPLUS_RATIO, INSTITUTIONAL_CAPITAL_RATIO } from '../../domain/institutions';
import { ETF_EXPENSE_RATIO_ANNUAL } from '../../domain/etf';
import { migrateSmeDebtAtSeed, migrateHouseholdDebtAtSeed, applyBankFundingSplit } from './stages/bank-lending';
import { leverageHeadroomUSD } from '../macro/banking';
import { EFFECTIVE_TAX_RATE } from '../macro/initialization';

/**
 * OWN6 — the institutional sector's OPENING BOOK, and the one thing it is not.
 *
 * `OWNERSHIP_SHARES` is gone: ownership is measured off the real books each week (OWN1) and
 * nothing weekly reads a share to decide anything any more. What is left is a cold-start
 * problem the deletion does not solve. The weekly shape is "an institution holds what it
 * bought"; at week 0 there is no purchase history, so the opening register has to be placed,
 * and the size of the institutional sector is what decides how much of it institutions get.
 *
 * That size is CIRCULAR in the seed today: an entity's `totalAssetsUSD` is
 * `institutionalMarketShare x the sector aggregate`, and the sector aggregate is these three
 * numbers times the market. Breaking it means anchoring an institution on what it OWES — the
 * pension and insurance claims households hold against it — and `beneficiaryLiabilityUSD` is
 * currently derived from assets, so that anchor does not exist yet.
 *
 * So this stays, named for exactly what it is: a SEED, read once at week 0, never weekly, with
 * its closing slice recorded in §6. It is not an ownership share and nothing may treat it as
 * one — `equityOwnership` and its siblings open at zero and are measured at the end of week 1.
 *
 * THE SOVEREIGN SLICE IS GONE TOO, and for the reason the bank pass below already states in its
 * own comment: banks are the residual holder of what the central bank and the institutions do not
 * take, and their leverage headroom caps them well short of it. Measured at week 0, the named
 * books held 79.6% of every region's sovereign stock and 20.4% — 137B in the USA alone — belonged
 * to NOBODY. That residual is §7.124's, it is what OWN7 had to carve back out of the float so the
 * ledger stopped minting claims, and it is what made a maturing tranche pay 55B to the UNMODELED
 * boundary under `sovereign redemption (unmodeled holders)`. A bond nobody holds is not a bond.
 * The institutions take whatever the central bank and the capital-constrained banks leave, because
 * in this model they ARE the household and foreign-official holders — pensions and insurers is
 * how those sectors own government paper. The share is computed after the bank pass, from what is
 * actually left, rather than stated in front of it.
 *
 * THE CREDIT SLICE IS GONE, and it was never a cold-start problem. `corpBond: 0.45` sized the
 * institutions' opening credit book at 45% of a debt stock that counts every tranche — floating,
 * bank facilities, commercial paper, public and private alike — and then placed the whole of it
 * on the PUBLIC FIXED paper only. Measured at week 0: institutions opened holding 132% of the
 * USA corporate bond stock, 127% of the EUR, 126% of the UK, 120% of the JPN. The register was
 * minting claims before the first week ran, and the desks then hid it by going short into the
 * boundary (measured -9.3B in two weeks) rather than the ledger check catching it.
 *
 * A bond book has no unnamed holder to leave room for: its participants are the institutions and
 * the dealer desks, and the desks open flat. So the institutions open with the WHOLE tradable
 * stock — exactly what the HC2 private-tier pass below already does, and exactly the instrument
 * 07b and 07d clear (fixed ex-commercial-paper; floating ex-bank-facility). Equity and
 * sovereigns keep a slice because those books DO have holders this model does not name yet —
 * founders, households, foreign official — and OWN7's float rule is what keeps their paper out
 * of the auction rather than a share pretending to own it.
 */
const INSTITUTIONAL_OPENING_BOOK_SHARE = { equity: 0.42 };

import { isActiveCompany } from '../../domain/company';
import { restingVacancies } from '../../domain/region-macro';
import { centralBankAssetsUSD, centralBankCurrencyResidualUSD, unbackedBankCashUSD, CENTRAL_BANK_SOVEREIGN_SHARE } from '../../domain/central-bank';
import { reconcileEmploymentView } from './stages/labor-market';
import { LABOR_SHARE_OF_OUTPUT } from '../bootstrap/national-accounts';
import { weeklyWageBillUSD } from '../bootstrap/labor-and-wages';
import { SECTOR_OCCUPATION_MIX } from '../../domain/region-macro';
import { EQUITY_RISK_PREMIUM } from '../equity-valuation';
import { mandateAllocator } from '../../domain/primary-market';
import { RegionId, Region, Portfolio, OccupationType, Company, COMMODITY_CATEGORY_LINKAGE, BASE_COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, HedgeFundStrategy, AssetAllocationTarget, ItemizedHolding, INDUSTRY_SUBUNITS } from '../../types';
import { dealersFromBanks } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies, generatePrivateCompanies, dealProductLinesAndHeadcount } from '../companyGenerator';
import { generatePrivateFirmSeeds } from '../bootstrap/private-firms';
import { INDUSTRY_REGISTRY, smePoolEmployment, totalOutputFromFinalDemand } from '../../domain/industry-registry';
import { getRegionProductivityPerCapitaUSD, remainingLifeExpectancyYears, RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS } from '../bootstrap/population';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand, attributeItemizedHoldings, distributeRealTargetByWeight } from './stages/shared-helpers';
import { unitMassTonnes } from '../../domain/goods-physical';
import { generateCarriers, seedFreightDemand, specMarginalRatesByLane } from '../bootstrap/carriers';
import { runFreightClearing } from './stages/freight-clearing';
import { getFxToUsd } from './stages/06-fx-and-trade';
import { convertLocal, localToUsd } from '../../domain/currency';
import { laneTransitWeeks } from '../../domain/carrier';
import { laneDistanceNm } from '../../domain/geography';
import { InTransitShipment } from './stages/goods-arrival';
import { buildCpiBasket, CPI_BASE_LEVEL } from './stages/price-index';
import { refreshRegionalHoldingsView, measuredOwnershipAllRegions, ownershipSharesFromRegister } from './stages/holdings-view';
import { sovBucketKey } from './stages/shared-helpers';
import { setSimulationSeed, getRngState, setRngState, DEFAULT_SIMULATION_SEED } from '../rng';
import { deriveSubUnitUnitPrice } from '../bootstrap/category-demand';
import { getBaseAnnualWageUSD } from '../bootstrap/labor-and-wages';
import { decomposeGovernmentSpending, governmentObligationsWeeklyUSD } from '../../domain/government';
import {
  computeExpenditureGdpUSD,
  GOV_PROCUREMENT_SHARE_OF_SPENDING,
  computeHouseholdDisposableIncomeUSD,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';

/**
 * Build a world. The same seed always builds the same world and, stepped the same number of
 * weeks, reaches the same state — which is what makes any before/after measurement of this
 * simulation mean anything (see engine/rng.ts).
 */
/**
 * One unit's physical mass, per sub-unit, fixed for the life of the world (XB3a-1).
 *
 * A "unit" here is an abstract bundle worth roughly the same across every good, so what it
 * physically weighs is that bundle's value divided by the material's own value density. The
 * bundle value is averaged across the four regions because mass is a property of the good, not
 * of where it happens to be priced.
 */
function seedUnitMassTonnes(regions: Record<RegionId, Region>): Record<string, number> {
  const regionIds = Object.keys(regions) as RegionId[];
  const masses: Record<string, number> = {};
  Object.values(INDUSTRY_SUBUNITS).flat().forEach((subUnit) => {
    const prices = regionIds
      .map((r) => (regions[r].categoryDemand[subUnit.unitId] as any)?.unitPriceUSD)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length === 0) return;
    const meanPriceUSD = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    masses[subUnit.unitId] = unitMassTonnes(subUnit.unitId, meanPriceUSD);
  });
  return masses;
}

/**
 * SUPPLY/CHAIN — THE SEED'S DEMAND VECTOR, AND THE FIXED POINT IT CLOSES.
 *
 * Extracted from `createInitialGameState` so it can be run more than once. It is the
 * AUTHORITATIVE copy of the C + I + G identity (§7.120's third): it runs after the firms and the
 * government exist, so its `G` is the real procurement budget and its `I` the firms' own capex,
 * where the placeholder in `macro/initialization.ts` could only use GDP shares.
 *
 * **Why it has to be callable twice.** A firm's revenue is derived from its primary category's
 * DEMAND SEED, and its capex from its revenue — while `I`, which sizes the capital-goods half of
 * that demand seed, is the sum of exactly those capexes. Firm size and investment demand each
 * determine the other, and the seed resolved it by simply using the placeholder for one side:
 * the capital-goods industries were built for a GDP-share investment number and then asked to
 * supply the real one. Measured, that is 1.29x more capex bid than built for, four of five
 * capital-goods categories in permanent shortage at 65-174% over base price (§7.168, §7.178),
 * plant shrinking because nobody can make the machines, and — through the cost of capital the
 * labour market sheds against — a share of the ~29% unemployment that has been blocking
 * unrelated work (§7.179).
 *
 * `solveSeedInvestmentFixedPoint` below iterates the two against each other until they agree.
 */
export function seedRegionCategoryDemand(
  reg: Region,
  regionId: RegionId,
  companies: Company[]
): void {
    const hs = reg.householdState;
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    // §7.4: the seed uses the SAME procurement owner the weekly stage does, so week 0's
    // government demand and week 1's are the same shape.
    const G = decomposeGovernmentSpending(
      reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyUSD ?? 0
    ).procurementBudgetUSD * 52;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;
    const I = corpBase;

    let totalHhWeight = 0;
    let totalGovWeight = 0;
    let totalCorpWeight = 0;

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        totalHhWeight += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const regionFirmCount = companies.filter(c => c.region === regionId).length;
    const govBudgetByCategory: Record<string, number> = {};

    // CHAIN-E — THE THIRD COPY OF THE C + I + G IDENTITY, and the one that wins.
    //
    // This is the authoritative seed: it runs after firms and the government exist, so its G is
    // the real procurement budget and its I the firms' real capex, where `macro/initialization.ts`
    // could only use GDP-share placeholders. It then OVERWRITES that earlier seed wholesale.
    //
    // The identity therefore lives in three places — the placeholder seed, here, and the weekly
    // rebuild in `03-category-demand.ts` — and the intermediate-demand solve was added to the
    // other two and missed here (§7.120). Because this copy is the one that survives, the model
    // ran on FINAL demand only regardless: measured, the placeholder seed produced 1,481B of
    // total output for the USA and this line replaced it with 567B, so every firm was sized
    // against a market 2.6x larger than the one it then had to sell into. Rule 3, and the reason
    // the same fix has to be made three times is itself the defect.
    const finalDemandBySubUnit: Record<string, number> = {};
    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        govBudgetByCategory[su.unitId] = suGovDemand / 52;
        // SUPPLY/CHAIN — INVESTMENT GOES WHERE CAPEX IS ACTUALLY SPENT.
        //
        // `I` used to be spread across EVERY corporate-bought good by its corporate buyer-mix
        // weight, while stage 05's firms bid their capex only into the five CAPITAL-GOODS
        // categories by `capexBasketWeight`. **Two different allocations of the same investment
        // number**, and the capital-goods industries were therefore built for a fraction of what
        // would be bid at them: measured 54.0B/yr sized against 83.6B/yr bid, 1.55x, with four of
        // five categories in permanent shortage (§7.168).
        //
        // A corporate purchase of a NON-capital good is intermediate demand, not final demand,
        // and the Leontief solve below already produces it from the recipes — so putting it here
        // as well was counting it twice from the other side.
        const capexWeight = CAPEX_SUPPLIER_WEIGHTS[su.unitId] ?? 0;
        finalDemandBySubUnit[su.unitId] =
          (totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0)
          + suGovDemand
          + capexWeight * I;
      });
    });
    const totalOutputBySubUnit = totalOutputFromFinalDemand(finalDemandBySubUnit);

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const demandLevelUSD = totalOutputBySubUnit[su.unitId] ?? finalDemandBySubUnit[su.unitId];
        (reg.categoryDemand as any)[su.unitId] = createSeedCategoryDemandState(
          demandLevelUSD,
          reg.gdpGrowth ?? 0.02,
          // §7.127: FINAL demand prices the good; total output is the quantity behind it.
          deriveSubUnitUnitPrice(finalDemandBySubUnit[su.unitId] ?? 0, su.buyerMix, reg.totalPopulation, regionFirmCount, su.unitId)
        );
      });
    });

    // SUPPLY/CHAIN — RE-DEAL THE PRODUCER BASE, now that this region's demand is the real one.
    //
    // The firm universe was dealt against the PLACEHOLDER seed in `macro/initialization.ts`,
    // whose `I` is a GDP share; the vector just written above uses the government's real
    // procurement budget and the firms' OWN capex. Dealing against the first and selling into the
    // second is how the capital-goods sub-units came to be built for 1.29x less than would be bid
    // at them, with four of five in permanent shortage at 65-174% over base (§7.168, §7.178) —
    // and the plan called that a genuine fixed point.
    //
    // It closes in ONE pass, because the coupling is one-directional: a firm's revenue, PP&E and
    // therefore its capex are all set before any line is dealt, so `I` does not move when the
    // lines move. The deal draws no RNG, so nothing is relabelled (rule 10).
    dealProductLinesAndHeadcount(
      companies.filter(c => c.region === regionId),
      (_r, unitId) => Number((reg.categoryDemand as any)?.[unitId]?.demandLevelUSD) || 0
    );

    // PUB1e: the budget stage 05 bids in week 1, seeded here so it is never empty.
    reg.governmentProcurementBudgetByCategory = govBudgetByCategory;
    reg.governmentProcurementSpentUSD = 0;
}

/**
 * SUPPLY/CHAIN — iterate firm size and investment demand until they are the same number.
 *
 * Each pass generates the firm universe against the current demand vector, reads the investment
 * that universe actually implies (`Σ capex`), and rewrites the vector from it. The map is a
 * strong contraction — capital-goods makers are a slice of the economy, so a change in their
 * demand moves total capex by much less than itself — and it settles in a few passes.
 *
 * **The RNG is rewound before every pass**, so the universe that survives is bit-for-bit the one
 * a single generation against the converged vector would have produced. Without that the
 * iteration would consume the stream and relabel the world (rule 10); with it, the extra passes
 * are invisible to everything downstream.
 */
const SEED_INVESTMENT_TOLERANCE = 0.01;
const SEED_INVESTMENT_MAX_PASSES = 6;

export function solveSeedInvestmentFixedPoint(
  regions: Record<RegionId, Region>,
  generate: () => Company[],
  rewindRng: () => void
): Company[] {
  let companies = generate();
  for (let pass = 0; pass < SEED_INVESTMENT_MAX_PASSES; pass++) {
    let worstDrift = 0;
    (Object.keys(regions) as RegionId[]).forEach((regionId) => {
      const reg = regions[regionId];
      const before = reg.laggedCorporateDemandBase ?? 0;
      seedRegionCategoryDemand(reg, regionId, companies);
      const after = reg.laggedCorporateDemandBase ?? 0;
      const denom = Math.max(1, Math.abs(after));
      worstDrift = Math.max(worstDrift, Math.abs(after - before) / denom);
    });
    if (worstDrift <= SEED_INVESTMENT_TOLERANCE) break;
    rewindRng();
    companies = generate();
  }
  return companies;
}

export function createInitialGameState(seed: number = DEFAULT_SIMULATION_SEED): GameState {
  setSimulationSeed(seed);
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  // §6 hoist: the generator reads seed primitives from the regions this function just built,
  // instead of rebuilding four fresh regions per company.
  //
  // SUPPLY/CHAIN — and it runs until FIRM SIZE and INVESTMENT DEMAND agree. A firm's revenue is
  // derived from its primary category's demand seed and its capex from that revenue, while `I` —
  // which sizes the capital-goods half of the demand seed — is the sum of exactly those capexes.
  // The seed used to resolve that circle by using a GDP-share placeholder for one side and the
  // real number for the other, which is why the capital-goods industries were built for 1.29x
  // less than would be bid at them (§7.168, §7.178). The RNG is rewound before each pass, so the
  // universe that survives is the one a single generation against the converged vector produces.
  // The rewind restores the stream position as it stands HERE, not the seed itself: the region
  // and FX builders above may draw, so re-seeding would hand the generator a different stream
  // than a single pass would have. Snapshot, restore, and the surviving universe is identical.
  const rngBeforeFirms = getRngState();
  const companies = solveSeedInvestmentFixedPoint(
    regions,
    () => generateInitialCompanies(regions),
    () => setRngState(rngBeforeFirms)
  );

  // ---- HC Wave 1: the named private tier (HC1 generation + HC3 carves) ----
  // Generated FIRST, so every bootstrap computation below sees one consistent, already-carved
  // world: private firms are real companies in `companies` (listingStatus 'PRIVATE'), and each
  // segment aggregate has already surrendered exactly what its named tier now carries — debt
  // (HC1), employment, revenue and capex (HC3) — never both counting the same real thing.
  // Public-only computations (the holdings candidate lists) gate explicitly where they occur.
  const privateFirmsByRegion = new Map<RegionId, Company[]>();
  {
    const allTickers = new Set(companies.map(c => c.ticker));
    const allNames = new Set(companies.map(c => c.name));
    (Object.keys(regions) as RegionId[]).forEach(regionId => {
      const reg = regions[regionId];
      const segs = reg.smePools || [];
      const seeds = generatePrivateFirmSeeds(regionId, segs);
      const firms = generatePrivateCompanies(regionId, seeds, reg.policyRate, allTickers, allNames);

      // HC3b: the named private tier SELLS. It was held out with a measurement — injecting its
      // supply into markets sized for public supply cost 10-22% of growth — and what changed is
      // that the markets are no longer sized that way: SEG put an SME pool behind every one of
      // the registry's sub-units, and SVC added the service categories where most of this tier
      // actually trades. The tier's output is carved OUT of its pool rather than added on top
      // (HC's conservation rule), so total supply is unchanged by naming a firm.
      //
      // Each firm is dealt its pool's own goods mix — the sub-units of its industry, weighted by
      // the region's real demand for each — the same rule a birth uses.
      segs.forEach(seg => {
        const segIdx = seeds.map((sd, i) => sd.industry === seg.industry ? i : -1).filter(i => i >= 0);
        const segFirms = segIdx.map(i => firms[i]);
        const subUnits = INDUSTRY_REGISTRY[seg.industry].subUnits;
        const demandOf = (id: string) => reg.categoryDemand[id]?.demandLevelUSD ?? 0;
        const demandTotal = subUnits.reduce((a, su) => a + demandOf(su.unitId), 0);
        segFirms.forEach(f => {
          f.productLines = subUnits.map(su => ({
            industry: seg.industry,
            subUnitId: su.unitId,
            revenueShare: demandTotal > 0 ? demandOf(su.unitId) / demandTotal : 1 / Math.max(1, subUnits.length),
            competitiveness: 0,
            categoryMarketShare: 0,
          })).filter(l => l.revenueShare > 0);
        });
        // The carves. Debt: serviceable ladders only (see HC1's finding on the segment debt
        // primitive). Revenue, employment and capex: exactly what the named tier now carries.
        const namedRevenueUSD = segFirms.reduce((a, f) => a + f.annualRevenue, 0);
        seg.debtUSD = Math.round(Math.max(0, seg.debtUSD - segFirms.reduce((a, f) => a + f.totalDebt, 0)));
        seg.employment = Math.max(1000, Math.round(seg.employment - segFirms.reduce((a, f) => a + f.employeeCount, 0)));
        seg.annualRevenueUSD = Math.max(1, Math.round(seg.annualRevenueUSD - namedRevenueUSD));
        seg.capexUSD = Math.round(Math.max(0, seg.capexUSD - segFirms.reduce((a, f) => a + f.capex, 0)));
      });

      // SEG/HH: a pool employs the headcount its OWN revenue supports — recomputed here because
      // the carve above just changed that revenue. It is not handed the labor force's leftovers;
      // the residual form this replaces left the pools carrying every worker the named firms and
      // the government did not, against revenue the named tier had just been carved out of,
      // measured as a layoff cascade from 3.86M to 1.44M workers in twenty weeks.
      //
      // §7.119: it now uses the ONE headcount rule (`smePoolEmployment` — value added over output
      // per worker, the same function the two named generators call) instead of a second
      // derivation off the named tier's revenue per worker, which silently overwrote the pools'
      // own and made the seed's headcount rule differ by tier.
      segs.forEach(seg => {
        seg.employment = smePoolEmployment(seg.industry, seg.annualRevenueUSD, getRegionProductivityPerCapitaUSD(regionId));
      });

      privateFirmsByRegion.set(regionId, firms);
      companies.push(...firms);

      // HC3b: every seller's share of every market it is in, recomputed now that the private
      // tier is in those markets too. The generator computed shares over the public tier alone
      // (it ran before these firms existed), and stage 08 SCALES this number weekly — so a firm
      // left at zero could never gain any share at all, and the public firms' shares would have
      // been claims on a market they no longer have to themselves.
      const regionSellers = companies.filter(c => c.region === regionId && !c.isBankEntity);
      const marketUSD = new Map<string, number>();
      regionSellers.forEach(c => (c.productLines || []).forEach(l => {
        marketUSD.set(l.subUnitId, (marketUSD.get(l.subUnitId) ?? 0) + l.revenueShare * c.annualRevenue);
      }));
      regionSellers.forEach(c => (c.productLines || []).forEach(l => {
        const totalUSD = marketUSD.get(l.subUnitId) ?? 0;
        l.categoryMarketShare = totalUSD > 0 ? Number(((l.revenueShare * c.annualRevenue) / totalUSD).toFixed(6)) : 0;
      }));
    });
  }

  const institutionalEntities: InstitutionalEntity[] = [];

  // corpBondPct + loanPct together are each type's total real corporate-credit appetite (same
  // totals as before this split: INSURER 0.35, ASSET_MANAGER 0.20, PENSION_FUND 0.30) — real
  // insurers/pension funds rarely hold broadly syndicated loans directly, while real loan
  // funds/CLOs are predominantly an asset-manager product.
  const allocationTargets: Record<InstitutionalEntityType, AssetAllocationTarget> = {
    INSURER: { govBondPct: 0.50, corpBondPct: 0.32, loanPct: 0.03, equityPct: 0.10, cashPct: 0.05 },
    ASSET_MANAGER: { govBondPct: 0.10, corpBondPct: 0.12, loanPct: 0.08, equityPct: 0.65, cashPct: 0.05 },
    PENSION_FUND: { govBondPct: 0.25, corpBondPct: 0.25, loanPct: 0.05, equityPct: 0.40, cashPct: 0.05 },
    // A credit hedge fund is the opposite balance sheet to an insurer: almost no sovereigns (it
    // is not there to match liabilities), the sector's heaviest corporate-credit and loan
    // weights, and a large cash sleeve that is real dry powder — the reason it can still bid
    // when everyone else is at their mandate limit.
    HEDGE_FUND: { govBondPct: 0.05, corpBondPct: 0.40, loanPct: 0.22, equityPct: 0.18, cashPct: 0.15 },
    // A money fund's whole book IS the cash sleeve: bills and overnight money through the same
    // machinery every entity's sleeve already uses (07f's bill share, WS6's repo/RRP split).
    // Zero term weights keep it out of the bond/loan/equity auctions entirely.
    MONEY_MARKET_FUND: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
    // An index fund's allocation IS its index; it holds one asset class and no cash sleeve
    // beyond what settlement needs. The weights here are never read for an ETF — its target is
    // the benchmark's own membership — and exist so the type map stays total.
    ETF: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
    // A PE fund holds companies and dry powder, not securities: zero weights keep it out of the
    // bond/loan/sovereign auctions entirely (no demand schedule, no budget). Its real assets are
    // its portfolio stakes, marked in peFund below.
    PRIVATE_EQUITY: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
  };

  // HF1: each hedge-fund STRATEGY has its own book, because that is what the strategy is. Only
  // the four weights differ; every one of them is a mandate primitive of exactly the kind the
  // other entity types already state (rule 19's PREFERENCE category).
  const HEDGE_FUND_TARGETS: Record<HedgeFundStrategy, AssetAllocationTarget> = {
    // Rates and FX: a large liquid book against which to run directional risk, and the biggest
    // cash sleeve of the four, because its positions are margin and its dry powder is the point.
    GLOBAL_MACRO: { govBondPct: 0.45, corpBondPct: 0.05, loanPct: 0, equityPct: 0.20, cashPct: 0.30 },
    LONG_SHORT_EQUITY: { govBondPct: 0.02, corpBondPct: 0.03, loanPct: 0, equityPct: 0.80, cashPct: 0.15 },
    LONG_SHORT_CREDIT: { govBondPct: 0.03, corpBondPct: 0.52, loanPct: 0.30, equityPct: 0, cashPct: 0.15 },
    // The distressed book is the one that must be able to bid when everyone else is at their
    // limit, which is what its unusually large sleeve is for.
    DISTRESSED: { govBondPct: 0, corpBondPct: 0.40, loanPct: 0.35, equityPct: 0, cashPct: 0.25 },
  };
  const targetFor = (role: InstitutionalEntityType, strategy?: HedgeFundStrategy) =>
    (role === 'HEDGE_FUND' && strategy ? HEDGE_FUND_TARGETS[strategy] : allocationTargets[role]);

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    // SUPPLY/CHAIN: the demand vector and the producer base are already converged against each
    // other (`solveSeedInvestmentFixedPoint`, run before the private tier). This call writes the
    // final vector onto the region from the universe that survived, so nothing downstream reads a
    // pass that was rewound.
    seedRegionCategoryDemand(reg, regionId, companies);

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);

    const totalMarketCap = regionCompanies.reduce((s, c) => s + c.marketCap, 0);
    // FRM: the ratio is measured now, and it is seeded from the stack macro/initialization built
    // — so this reads the same number rather than the walked field it used to.
    const totalSovDebt = reg.debtToGdpPctBottomUp * reg.derivedNominalGdpUSD;

    reg.institutionalSector.equityHoldingsUSD = Number((INSTITUTIONAL_OPENING_BOOK_SHARE.equity * totalMarketCap).toFixed(0));
    // OWN6: the sovereign pool is the RESIDUAL, set after the bank pass below once the central
    // bank's and the banks' books are known. Opened at zero so the bank pass reserves nothing.
    reg.institutionalSector.sovBondHoldingsUSD = 0;
    // The credit book is placed whole, off the candidate lists below rather than off a share of
    // `totalCorpDebt` — see INSTITUTIONAL_OPENING_BOOK_SHARE's doc for what that share minted.

    // Compile holding candidates for individual institutional entities and macro sectors
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies.filter(c => c.listingStatus !== 'PRIVATE').map(c => ({
      id: c.id,
      type: 'EQUITY',
      region: regionId,
      outstandingUSD: c.marketCap
    }));

    // Keyed by company id (aggregated across that issuer's own tranches), not per-tranche —
    // matches how the real corporate-bond clearing engine (07b-corporate-bond-clearing.ts)
    // tracks a participant's exposure per issuer, since all of an issuer's tranches reprice
    // together off one real cleared oasSpreadBps. A per-tranche key here would never match that
    // stage's per-company lookups, silently resetting every entity's real starting position to
    // zero on its very first real clearing week.
    // Real bonds are an issuer's FIXED-rate tranches only — floating tranches are real leveraged
    // loans, a genuinely different market with its own real clearing and its own candidate list
    // (loanCandidates below) — see 07b-corporate-bond-clearing.ts / 07d-leveraged-loan-clearing.ts.
    // Candidate lists stay PUBLIC: the macro holdings aggregates were calibrated against the
    // public market, and the private tier's paper is seeded separately in the engines' own
    // shape (the HC2 block below).
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .map(c => ({ id: c.id, type: 'CORP_BOND' as const, region: regionId, outstandingUSD: (c.debtTranches || []).filter(t => t.rateType === 'FIXED' && !t.isCommercialPaper).reduce((s, t) => s + t.principalUSD, 0) }))
      .filter(c => c.outstandingUSD > 0);
    const totalCorpCandidatesUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;
    // OWN6: the opening credit book is the tradable stock itself. Placed here, once the candidate
    // list that defines that stock exists — holdings-view.ts rederives this scalar from the
    // entities' own books every week after, so the seed must open in the same shape.
    reg.institutionalSector.corpBondHoldingsUSD = Number(totalCorpCandidatesUSD.toFixed(0));

    const loanCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .map(c => ({ id: c.id, type: 'LEVERAGED_LOAN' as const, region: regionId, outstandingUSD: (c.debtTranches || []).filter(t => t.rateType === 'FLOATING' && !t.isBankFacility).reduce((s, t) => s + t.principalUSD, 0) }))
      .filter(c => c.outstandingUSD > 0);
    const totalLoanCandidatesUSD = loanCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;
    const attributeLoanHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      loanCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalLoanCandidatesUSD) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalUSD: shareUSD * (c.outstandingUSD / totalLoanCandidatesUSD),
        }));
    // Proportional-by-size, not attributeItemizedHoldings' size-sorted-greedy-with-a-40%-cap
    // fill: the real weekly clearing engine (07b-corporate-bond-clearing.ts) distributes an
    // entity's target across issuers by real debt-outstanding weight (tilted only by real
    // attractiveness, which is ~neutral at cold start); seeding the same shape here means an
    // entity's real week-1 gap per issuer is genuinely small, instead of the greedy fill
    // concentrating holdings in the 2-3 biggest issuers and leaving every smaller one to open
    // with an artificial, systemic buy gap on its first real clearing week.
    const attributeCorpBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      corpCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalUSD: shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD),
        }));

    // Equity is seeded in SHARES, proportional to each name's market cap — the same shape
    // 07e-equity-clearing.ts builds its structural demand in (§7.4). The greedy size-sorted fill
    // used before concentrated every entity's book in the two or three largest names, so week 1
    // opened with a systemic buy gap in every smaller name; and it stored dollars only, which is
    // the circularity the share registry exists to kill — a book whose size depends on the price
    // it is supposed to set (#28).
    const totalEquityCandidatesUSD = equityCandidates.reduce((s2, c) => s2 + c.outstandingUSD, 0) || 1;
    const equityPriceById = new Map(regionCompanies.map(c => [c.id, c.stockPrice]));
    const attributeEquityHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      equityCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalEquityCandidatesUSD) > 1)
        .map(c => {
          const nameUSD = shareUSD * (c.outstandingUSD / totalEquityCandidatesUSD);
          return {
            instrumentId: c.id,
            instrumentType: c.type,
            issuerRegion: c.region,
            quantityShares: nameUSD / Math.max(0.01, equityPriceById.get(c.id) ?? 1),
            quantityOrNotionalUSD: nameUSD,
          };
        });

    const govDebtTranches = reg.govDebtTranches || [];
    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = govDebtTranches.map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));

    // Keyed by the same tenor-bucket ids the real sovereign-bond clearing engine
    // (07c-sovereign-bond-clearing.ts) uses (`${region}-GOV-t2/t5/t10/t30`), not per-tranche —
    // individual gov debt tranches roll off and reissue quarterly, so a per-tranche key here
    // would suffer the exact same silent reset-to-zero problem the corporate-bond seed had.
    // Keyed by sovBucketKey — bills (b13/b26/b52, WS5) and bonds (t2..t30) alike, so the seed
    // covers the same seven buckets the weekly engines clear (07f clears the bills, 07c the
    // bonds) and no bucket opens with a phantom gap.
    const sovBucketOutstandingUSD = new Map<string, number>();
    govDebtTranches.forEach(gt => {
      const key = sovBucketKey(gt.tenorAtIssuanceYears);
      sovBucketOutstandingUSD.set(key, (sovBucketOutstandingUSD.get(key) ?? 0) + gt.principalUSD);
    });
    const totalSovBucketedUSD = Array.from(sovBucketOutstandingUSD.values()).reduce((s, v) => s + v, 0) || 1;
    const attributeSovBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      Array.from(sovBucketOutstandingUSD.entries())
        .filter(([, bucketUSD]) => shareUSD * (bucketUSD / totalSovBucketedUSD) > 1)
        .map(([key, bucketUSD]) => ({
          instrumentId: `${regionId}-GOV-${key}`,
          instrumentType: 'GOV_BOND' as const,
          issuerRegion: regionId,
          quantityOrNotionalUSD: shareUSD * (bucketUSD / totalSovBucketedUSD),
        }));

    // Seed each named bank's real sovereign book across the same tenor buckets the weekly
    // auction clears, with the same outstanding-weighted split across tenors.
    //
    // This was missing: banks carried a scalar `sovereignBondHoldingsUSD` but an EMPTY
    // `sovereignBondHoldingsByTenor`, and 07c reads the buckets. So every bank opened ~$147B
    // below its own target in a $670B market and bought into it every single week, which the
    // auction could only express as a monotonic slide in yields — the whole banking sector
    // permanently on the bid. Two representations of one book, and the engine was reading the
    // empty one. Seed shape must match engine shape.
    const regionBanksForSov = regionCompanies.filter(c => c.isBankEntity && c.bankBalanceSheet);
    if (regionBanksForSov.length > 0 && totalSovBucketedUSD > 1) {
      // OWN6: a bank opens with the sovereign book its OWN EQUITY supports under the leverage
      // floor, not with `sovBondOwnership.bankShare x the market`. Its other assets are already
      // on the sheet at this point and its funding is derived from the asset side below, so
      // capital is the constraint that is genuinely available here — and it is the same one
      // 07c applies from week 1, which is what §7.4 asks of a seed. Banks are the residual
      // holder of the stock the central bank and the institutions do not take; where the
      // cohort's headroom cannot absorb that residual it is rationed pro-rata, never forced.
      const headroomByBank = new Map(regionBanksForSov.map(b =>
        [b.ticker, leverageHeadroomUSD(b.bankBalanceSheet!)]));
      const totalHeadroomUSD = Array.from(headroomByBank.values()).reduce((a, v) => a + v, 0);
      const takenByOthersUSD = (reg.institutionalSector.sovBondHoldingsUSD || 0)
        + totalSovBucketedUSD * CENTRAL_BANK_SOVEREIGN_SHARE;
      const availableToBanksUSD = Math.max(0, totalSovBucketedUSD - takenByOthersUSD);
      const bankSovTotalUSD = Math.min(totalHeadroomUSD, availableToBanksUSD);
      const perBankTargets = new Map(regionBanksForSov.map(b => [
        b.ticker,
        totalHeadroomUSD > 0 ? bankSovTotalUSD * ((headroomByBank.get(b.ticker) ?? 0) / totalHeadroomUSD) : 0,
      ]));
      regionBanksForSov.forEach(bank => {
        const targetUSD = perBankTargets.get(bank.ticker) ?? 0;
        const byTenor: Record<string, number> = {};
        sovBucketOutstandingUSD.forEach((bucketUSD_, key) => {
          const bucketUSD = targetUSD * (bucketUSD_ / totalSovBucketedUSD);
          if (bucketUSD > 1) byTenor[key] = bucketUSD;
        });
        bank.bankBalanceSheet!.sovereignBondHoldingsByTenor = byTenor;
        bank.bankBalanceSheet!.sovereignBondHoldingsUSD = Number(
          Object.values(byTenor).reduce((sum, v) => sum + v, 0).toFixed(0)
        );
        // §7.4, applied to the FUNDING side this time. This sovereign book is seeded from the
        // market (the bank share of the real outstanding stock — the S2 fix), but the deposit
        // seed still came from a GDP ratio chosen when the sov book was a 2%-of-GDP scalar.
        // Nobody reconciled the two, so the balance sheet opened ~139B short (USA) and the old
        // evolution's Math.max plug manufactured the difference every week. Cash now moves only
        // by named flows, so the sheet must BALANCE at birth: deposits are seeded as the funding
        // the asset side actually requires — assets minus equity — the same shape the weekly
        // ledger maintains from here on. G2 later replaces this stock with real loan-created
        // deposits and real household flows.
        const bs = bank.bankBalanceSheet!;
        bs.depositsUSD = Number((
          bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD +
          bs.cashReservesUSD - bs.bankEquityUSD
        ).toFixed(0));
      });

      // The region aggregate is the derived sum of the named banks (the 02b/S7 doctrine),
      // re-projected here so week 0 reads the same books week 1 will.
      const aggByTenor: Record<string, number> = {};
      regionBanksForSov.forEach(b => {
        Object.entries(b.bankBalanceSheet!.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => {
          aggByTenor[k] = (aggByTenor[k] ?? 0) + v;
        });
      });
      const sumBank = (f: (bs: import('../../types').BankingSector) => number) =>
        Number(regionBanksForSov.reduce((sum, b) => sum + f(b.bankBalanceSheet!), 0).toFixed(0));
      reg.bankingSector.sovereignBondHoldingsByTenor = aggByTenor;
      reg.bankingSector.sovereignBondHoldingsUSD = sumBank(bs => bs.sovereignBondHoldingsUSD);
      // OWN6/OWN7: whatever the central bank and the capital-constrained banks left is the
      // institutions'. Every bond now has a holder, which is what stops the float minting claims
      // and stops a redemption paying somebody who is not there.
      reg.institutionalSector.sovBondHoldingsUSD = Number(Math.max(0,
        totalSovBucketedUSD
        - totalSovBucketedUSD * CENTRAL_BANK_SOVEREIGN_SHARE
        - reg.bankingSector.sovereignBondHoldingsUSD).toFixed(0));
      reg.bankingSector.depositsUSD = sumBank(bs => bs.depositsUSD);
      reg.bankingSector.cashReservesUSD = sumBank(bs => bs.cashReservesUSD);
      reg.bankingSector.bankEquityUSD = sumBank(bs => bs.bankEquityUSD);
      reg.bankingSector.businessLoanBookUSD = sumBank(bs => bs.businessLoanBookUSD);
      reg.bankingSector.consumerLoanBookUSD = sumBank(bs => bs.consumerLoanBookUSD);
    }

    // G2 slice 1: itemize the business book onto real borrowers, and recalibrate the SME
    // seed scalar (`debtUSD = 2 x revenue`, ~17.8x EBITDA — §6's unpriced primitive) down to
    // what the pools can service AND the banks' capital can carry.
    const regionBanksForLending = regionCompanies.filter(c => c.isBankEntity && c.bankBalanceSheet);
    if (regionBanksForLending.length > 0) {
      migrateSmeDebtAtSeed(regionId, reg, regionBanksForLending);
      // HH3: the household debt the region already carries becomes real mortgage / card / term
      // pools on the same named banks, replacing the consumer scalar (which covered 11.67% of
      // the same debt and owed the rest to nobody). Equity tops up at each bank's own opening
      // capital ratio and deposits re-derive as the balancing funding — §7.4's discipline: the
      // seed opens in the exact shape the weekly lending pass maintains.
      migrateHouseholdDebtAtSeed(regionId, reg, regionBanksForLending);
      // HH4b: the seed residual of the budget recycle — the slice of debt service whose return
      // path to household income is not yet built (bank retained earnings, institutional
      // dividend passthrough). Derived once so the seed consumption budget nets to exactly the
      // pre-HH4b one: real receipts at seed are deposit interest (direct equity is marked from
      // zero by the first weekly pass), and the residual covers the rest of debt service.
      {
        const hs = reg.householdState;
        const annualDsUSD = (hs.weeklyDebtServiceUSD ?? 0) * 52;
        const seedDepositInterestUSD = (hs.depositsUSD ?? 0) * (reg.policyRate * 0.6);
        hs.unmodeledCapitalReceiptShareOfIncome = reg.estimatedHouseholdIncomeUSD > 0
          ? Number((Math.max(0, annualDsUSD - seedDepositInterestUSD) / reg.estimatedHouseholdIncomeUSD).toFixed(6))
          : 0;
        hs.capitalReceiptsAnnualUSD = Number(annualDsUSD.toFixed(0));
      }
      reg.bankingSector.businessLoanBookUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.businessLoanBookUSD, 0);
      reg.bankingSector.consumerLoanBookUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.consumerLoanBookUSD, 0);
      reg.bankingSector.bankEquityUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.bankEquityUSD, 0);
      reg.bankingSector.depositsUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0);
      reg.bankingSector.wholesaleFundingUSD = regionBanksForLending.reduce((a, b) => a + (b.bankBalanceSheet!.wholesaleFundingUSD ?? 0), 0);

      // PUB2 (§7.4): close the central bank's balance sheet at birth, now that the banks whose
      // cash is its reserve liability exist. Currency is the residual; the weekly stage
      // re-derives it by the same arithmetic.
      const cbSheet = reg.centralBankSheet;
      if (cbSheet) {
        const reservesUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.cashReservesUSD, 0);
        cbSheet.currencyInCirculationUSD = Number(centralBankCurrencyResidualUSD(cbSheet, reservesUSD).toFixed(0));
        cbSheet.unbackedBankCashUSD = Number(unbackedBankCashUSD(cbSheet, reservesUSD).toFixed(0));
        reg.centralBankBalanceSheet = Number(centralBankAssetsUSD(cbSheet).toFixed(0));
      }

      // Every company banks somewhere: its cash IS a deposit at its house bank (the same
      // relationship lead WS8 mandates for its offerings, so one firm has one bank).
      // G3c: a house bank is won, not drawn. Each relationship consumes the winner's balance
      // sheet, so the region's firms spread across its banks in proportion to the equity each
      // one actually has — the hash of the firm's id this replaces spread them too, but on
      // nothing any bank did.
      const houseBanks = mandateAllocator(regionBanksForLending.map(b => ({
        ticker: b.ticker, bankMarketShare: b.bankMarketShare,
        capacityUSD: b.bankBalanceSheet?.bankEquityUSD ?? 0,
      })));
      regionCompanies.forEach(c => {
        if (c.isBankEntity) return;
        c.homeBankTicker = houseBanks.pick(c.id, Math.max(0, c.cash));
      });
      const corpDepositsByBank = new Map<string, number>();
      regionCompanies.forEach(c => {
        if (c.isBankEntity || !c.homeBankTicker) return;
        corpDepositsByBank.set(c.homeBankTicker, (corpDepositsByBank.get(c.homeBankTicker) ?? 0) + Math.max(0, c.cash));
      });
      // SEG1: the segment pools get their own money, sized by the named private tier's measured
      // cash/revenue ratio — the tier's small firms hold working balances like its named ones
      // do. The balance sits across the region's banks pro-rata by market share (small firms
      // bank everywhere), and each bank holds the reserves behind it, exactly like the
      // corporate line below.
      {
        const namedPrivate = regionCompanies.filter(c => !c.isBankEntity && c.listingStatus === 'PRIVATE');
        const tierRevenueUSD = namedPrivate.reduce((a, c) => a + Math.max(0, c.annualRevenue), 0);
        const tierCashUSD = namedPrivate.reduce((a, c) => a + Math.max(0, c.cash), 0);
        const cashToRevenue = tierRevenueUSD > 0 ? tierCashUSD / tierRevenueUSD : 0.08;
        (reg.smePools || []).forEach(seg => {
          seg.cashUSD = Math.round(Math.max(0, seg.annualRevenueUSD) * cashToRevenue);
        });
      }
      const segmentCashTotalUSD = (reg.smePools || []).reduce((a, s) => a + (s.cashUSD ?? 0), 0);
      const bankShareTotal = regionBanksForLending.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
      regionBanksForLending.forEach(b => {
        const corpUSD = Math.round(corpDepositsByBank.get(b.ticker) ?? 0);
        b.bankBalanceSheet!.corporateDepositsUSD = corpUSD;
        const smeUSD = bankShareTotal > 0
          ? Math.round(segmentCashTotalUSD * ((b.bankMarketShare ?? 0) / bankShareTotal))
          : Math.round(segmentCashTotalUSD / regionBanksForLending.length);
        b.bankBalanceSheet!.smeDepositsUSD = smeUSD;
        // SETL2 (§7.4 — the seed must open in the shape the weekly engine maintains): a corporate
        // balance is a real liability now, so the bank holds the real asset behind it. The money
        // its customers deposited is central-bank money, exactly as a week-1 deposit inflow would
        // be. Without this the sheet opens short by the whole corporate line.
        b.bankBalanceSheet!.cashReservesUSD += corpUSD + smeUSD;
        // Now that the corporate leg is known, the funding identity is re-derived: wholesale is
        // the residual AFTER real deposits, not a plug carrying money the companies already
        // lent this bank (§7.4 — the seed must open in the shape the weekly engine maintains).
        applyBankFundingSplit(b.bankBalanceSheet!, Math.round((reg.householdState.depositsUSD ?? 0) * (b.bankMarketShare ?? 1 / regionBanksForLending.length)));
      });
      reg.bankingSector.corporateDepositsUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.corporateDepositsUSD, 0);
      reg.bankingSector.depositsUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0);
      reg.bankingSector.wholesaleFundingUSD = regionBanksForLending.reduce((a, b) => a + (b.bankBalanceSheet!.wholesaleFundingUSD ?? 0), 0);
    }

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(reg.institutionalSector.corpBondHoldingsUSD, corpCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.sovBondHoldingsUSD, sovCandidates),
      ...attributeEquityHoldingsProportionally(reg.institutionalSector.equityHoldingsUSD),
    ];

    // Build the individual InstitutionalEntity objects mapping to regional Companies
    const regionalInstCompanies = regionCompanies.filter(c => c.isInstitutionalEntity);

    // Real, bottom-up aggregate: the institutional sector's actual share of the real corporate
    // debt market (already a stable, real calibration used elsewhere in this codebase) — never
    // an independently-summed entity-level number that could come out larger than the market.
    // Each entity's own corpBondPct is a relative weight on this real, already-bounded pool (how
    // much MORE or LESS of it this entity wants versus its peers), not a free-standing dollar
    // target that could exceed the pool — see distributeRealTargetByWeight's doc comment. This
    // is the exact same derivation the real weekly clearing engine
    // (07b-corporate-bond-clearing.ts) uses, so week 1 starts already consistent with it instead
    // of needing a one-time correction on its first real week.
    const rawEntityCorpTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: targetFor(role, comp.hedgeFundStrategy).corpBondPct };
        }),
      reg.institutionalSector.corpBondHoldingsUSD || 0
    );
    // Same real, bottom-up derivation for sovereign bonds (govBondPct as a relative weight on
    // the real institutional sovereign-debt pool) — matches 07c-sovereign-bond-clearing.ts.
    const rawEntitySovTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: targetFor(role, comp.hedgeFundStrategy).govBondPct };
        }),
      reg.institutionalSector.sovBondHoldingsUSD || 0
    );
    // Leveraged loans open at the same institutional weight as the sibling bond market, applied
    // to the real bottom-up floating-debt stock.
    const rawEntityLoanTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: targetFor(role, comp.hedgeFundStrategy).loanPct };
        }),
      totalLoanCandidatesUSD
    );

    regionalInstCompanies.forEach(comp => {
      const role = comp.institutionalEntityType;
      if (!role) return;

      const share = comp.institutionalMarketShare ?? 0.33;
      const macroSector = reg.institutionalSector;
      const totalMacroAssetsUSD =
        (macroSector.equityHoldingsUSD || 0) +
        (macroSector.corpBondHoldingsUSD || 0) +
        (macroSector.sovBondHoldingsUSD || 0) +
        (macroSector.cashUSD || 0);

      // COH2 — A PENSION FUND IS AS BIG AS THE ENTITLEMENTS IT OWES, and at week 0 that stock is
      // derived rather than left circular.
      //
      // `beneficiaryLiabilityUSD` was reversed weekly — it accumulates from real contributions,
      // benefits and investment return — but the SEED still fell back to `totalAssets −
      // equityCapital`, so week 0 anchored the obligation on the holdings after all, which is the
      // circularity `INSTITUTIONAL_OPENING_BOOK_SHARE`'s own doc names as the reason it survives.
      //
      // The stock follows from the age structure and nothing else. In a stationary population the
      // entitlement stock is the contribution FLOW times how long a contributed dollar stays in
      // the system: it waits out the rest of a working life and is then drawn down over the years
      // a retiree actually has, so averaged over contribution ages that is
      // `(workingLife + drawdown) / 2`. The flow is the life-cycle saving rate the cohorts
      // already use — the retired share of the population (§7.181, §7.169) — so no number is
      // stated here that the demography does not already say.
      const pensionEntitlementStockUSD = (() => {
        const retiredShare = Math.max(0, Math.min(1,
          reg.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0.2));
        const annualContributionsUSD = Math.max(0, reg.estimatedHouseholdIncomeUSD) * retiredShare;
        const workingLifeYears = Math.max(1, RETIREMENT_AGE_YEARS - WORKFORCE_ENTRY_AGE_YEARS);
        const drawdownYears = Math.max(1, remainingLifeExpectancyYears(RETIREMENT_AGE_YEARS));
        return annualContributionsUSD * ((workingLifeYears + drawdownYears) / 2);
      })();
      const pensionShareNorm = regionalInstCompanies
        .filter(c => c.institutionalEntityType === 'PENSION_FUND')
        .reduce((a, c) => a + (c.institutionalMarketShare ?? 0.33), 0);
      // The fund's own capital is its SURPLUS against what it owes — the number that means
      // something — and its assets are the two together. Every other entity type keeps the
      // sector-share sizing: an asset manager owes nobody an entitlement, it runs other people's
      // money, and what anchors IT is HH4's household fund holdings (COH2's remaining half).
      const isPensionFund = role === 'PENSION_FUND';
      const beneficiaryLiabilityUSD = isPensionFund && pensionShareNorm > 0
        ? pensionEntitlementStockUSD * ((comp.institutionalMarketShare ?? 0.33) / pensionShareNorm)
        : undefined;
      const totalAssetsUSD = beneficiaryLiabilityUSD !== undefined
        ? beneficiaryLiabilityUSD / (1 - INSTITUTIONAL_CAPITAL_RATIO)
        : totalMacroAssetsUSD * share;
      const equityCapitalUSD = totalAssetsUSD * INSTITUTIONAL_CAPITAL_RATIO;

      const entCorpShareUSD = rawEntityCorpTargetsUSD.get(comp.id) ?? 0;
      const entSovShareUSD = rawEntitySovTargetsUSD.get(comp.id) ?? 0;
      const entLoanShareUSD = rawEntityLoanTargetsUSD.get(comp.id) ?? 0;
      const entEquityShareUSD = (macroSector.equityHoldingsUSD || 0) * share;

      const itemizedHoldings = [
        ...attributeCorpBondHoldingsProportionally(entCorpShareUSD),
        ...attributeSovBondHoldingsProportionally(entSovShareUSD),
        ...attributeLoanHoldingsProportionally(entLoanShareUSD),
        ...attributeEquityHoldingsProportionally(entEquityShareUSD),
      ];

      institutionalEntities.push({
        id: comp.id,
        name: comp.name,
        ticker: comp.ticker,
        region: regionId,
        entityType: role,
        // HF1: a hedge fund's strategy decides which markets it is actually in.
        hedgeFundStrategy: comp.hedgeFundStrategy,
        financialStatementProfile: comp.financialStatementProfile,
        totalAssetsUSD,
        beneficiaryLiabilityUSD,
        // Real opening cash: the entity's own policy cash weight against its own book. Every
        // clearing fill from here on settles against this balance.
        cashUSD: totalAssetsUSD * targetFor(role, comp.hedgeFundStrategy).cashPct,
        equityCapitalUSD,
        sharesOutstanding: comp.sharesOutstanding,
        stockPrice: comp.stockPrice,
        itemizedHoldings,
        assetAllocationTarget: targetFor(role, comp.hedgeFundStrategy),
        isDefaulted: comp.isDefaulted,
        historicalPrices: [...comp.historicalPrices],
      });
    });

    // The same effective rate the macro bootstrap uses, so the seed's after-tax shape matches
    // what stage 08 will produce from week 1.
    // TAXR: an institution is taxed on its earnings like any other company, so it opens on the
    // same rate rather than on a second copy of the number (rule 3).
    const INSTITUTIONAL_EFFECTIVE_TAX_RATE = EFFECTIVE_TAX_RATE;
    // ---- HH1b: seed an institution at the size it actually manages (§7.4, seed shape = engine
    // shape). The Company shell and the InstitutionalEntity are the SAME firm, and their two
    // notions of AUM disagreed: the generator seeded `aumUSD` as a multiple of an operating
    // company's revenue, while the entity's `totalAssetsUSD` is its real marked book. Stage 08
    // reads the entity, so week 1 replaced the seeded revenue with a fee on a book orders of
    // magnitude larger — the company did not grow, the model switched formulas.
    //
    // Measured: the four hedge funds' fee revenue rose 29x in sixty weeks while their book SHRANK
    // 76.8B → 62.4B, and those four were the last four violations in the invariants harness,
    // logged for a year as "#18 revenue runaway". It was never a runaway; it was a cold start.
    regionalInstCompanies.forEach(comp => {
      const isManager = comp.financialStatementProfile === 'ASSET_MANAGER';
      const isInsurer = comp.financialStatementProfile === 'INSURER';
      if (!isManager && !isInsurer) return;
      const entity = institutionalEntities.find(e => e.id === comp.id);
      if (!entity) return;
      if (isManager && !(comp.managementFeeRate > 0)) return;
      // A manager's revenue is a fee on the book it runs; an insurer's is the premium its own
      // capital lets it write. Both read the entity, because both ARE the entity.
      if (isManager) comp.aumUSD = entity.totalAssetsUSD;
      const revenueUSD = isManager
        ? Math.max(10, comp.aumUSD! * comp.managementFeeRate!)
        : Math.max(10, Math.max(0, entity.equityCapitalUSD) * PREMIUM_TO_SURPLUS_RATIO);
      if (isInsurer) {
        comp.insurancePremiumsWrittenUSD = revenueUSD;
        comp.technicalReservesUSD = Math.max(0, entity.totalAssetsUSD - entity.equityCapitalUSD);
      }
      const ebitdaUSD = revenueUSD * (isManager ? 0.35 : 0.15);
      comp.annualRevenue = revenueUSD;
      comp.baselineAnnualRevenue = revenueUSD;
      comp.revenueHistory = [revenueUSD];
      comp.ebitda = ebitdaUSD;
      comp.ebit = Math.max(1, ebitdaUSD);
      comp.netIncome = comp.ebit * (1 - INSTITUTIONAL_EFFECTIVE_TAX_RATE);
      comp.eps = comp.sharesOutstanding > 0 ? Number((comp.netIncome / comp.sharesOutstanding).toFixed(2)) : 0;
    });

    // ---- HH5: ONE employment identity at week 0 (§7.4). ----
    // This block used to end in a NOTE that said, in short, "these pools imply 11-14%
    // unemployment while the region reports 4.5%; reconciling them is the labor market's own
    // rebuild, not this item." This IS that rebuild, so the reconciliation happens here.
    //
    // Three primitives were seeded independently and never made to agree: the generator's own
    // firm headcounts, government employment as a share of population, and the private SEGMENTS
    // as a share of total employment. The segments are the right residual — they ARE the
    // "everything that is not a named firm or the government" tier — so their employment is
    // what the reported rate requires once the other two are counted.
    const totalLaborForce = reg.totalPopulation * (1 - reg.nonEmployablePct) * reg.laborForceParticipation;
    // HH: employment is what employers actually employ, and UNEMPLOYMENT IS THE RESIDUAL — not
    // the other way round. The block deleted here did the reverse: it took a target employment
    // level from the region's assumed unemployment rate and handed the pools whatever the real
    // firms and the government did not employ, which is how the tier came to carry headcount its
    // revenue could not pay for. The rate is now read off the real employment stock below.

    // The labor-force MIX opens at the mix employers actually demand. It used to be that mix
    // times a table of per-occupation "slack multipliers" (1.04 to 1.12), and that arbitrary
    // differential was not harmless: it left TECHNICAL_ENGINEERING with literally zero job
    // seekers against 169k unfilled vacancies and wage growth pinned at its +13% cap, while
    // GENERAL carried 678k unemployed and falling wages — a structural mismatch the world was
    // BORN with, indistinguishable at a glance from one it had produced. Uniform slack means
    // any mismatch after week 0 is one the economy really generated, which is what the
    // retraining flow exists to work on.
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.smePools, regionId, reg.governmentEmployment) as Record<OccupationType, number>;
    const week1DemandTotal = Object.values(week1OccDemand).reduce((s, v) => s + v, 0);
    (Object.keys(reg.occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
      reg.occupationLaborForceShare[occ] = week1DemandTotal > 0
        ? (week1OccDemand[occ] ?? 0) / week1DemandTotal
        : 0.2;
    });

    // The pools then open through the SAME reconciler the engine runs every week — §7.4 in its
    // strictest form: not "the same shape" but the same code — and the vacancy stock opens at
    // the market's rest point rather than at zero (see restingVacancies).
    reconcileEmploymentView(reg, regionCompanies.filter(c => isActiveCompany(c)));
    (Object.keys(reg.occupationPools) as OccupationType[]).forEach((occ) => {
      const supply = totalLaborForce * (reg.occupationLaborForceShare[occ] ?? 0.2);
      const employedInOcc = reg.occupationPools[occ].employed;
      reg.occupationPools[occ].vacancies = Math.round(
        restingVacancies(employedInOcc, Math.max(1, supply - employedInOcc))
      );
    });
    // Once the vacancy stock exists, read the market's statistics off it (the first call above
    // saw zero vacancies and would otherwise leave tightness reading 0.00 at week 0).
    reconcileEmploymentView(reg, regionCompanies.filter(c => isActiveCompany(c)));

    // LAB — the seed wage level is the one the region's employers can AFFORD (§7.4: the seed
    // opens in the shape the engine maintains).
    //
    // The wage table is scaled so that paying it across the BASELINE OCCUPATION MIX costs the
    // IND-R5 (§7.4: seed by the engine's own code). A bank's revenue was a Pareto draw from the
    // same small-firm curve every company uses, with no relation to the balance sheet it was
    // about to be given: measured, a USA bank opened at 1.68B against 7.47B of NIM-implied
    // revenue, and `bankProfile`'s 85/15 blend then spent YEARS climbing toward its real scale.
    // Two costs, both real. Every consumer read that convergence as output growth — the labor
    // market's hiring signal among them. And its payroll was sized for the bank it is, not the
    // bank its revenue said it was: 11.6k staff costing ~7.5B a year against 1.68B of revenue,
    // so the first week's P&L showed a loss so large the affordability rule cut the entire
    // workforce to the one-employee floor by week 3 (§7.108, §7.109).
    //
    // A bank's opening revenue IS what its opening balance sheet earns.
    regionCompanies.filter(c => c.isBankEntity && c.bankBalanceSheet).forEach((c) => {
      const sheet = c.bankBalanceSheet!;
      const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {})
        .reduce((a, v) => a + (Number(v) || 0), 0);
      const earningAssetsUSD = sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD;
      const nimRevenueUSD = earningAssetsUSD * reg.bankingSector.netInterestMarginPct;
      if (!(nimRevenueUSD > 0)) return;
      c.annualRevenue = Number(nimRevenueUSD.toFixed(0));
      c.baselineAnnualRevenue = c.annualRevenue;
      c.ebitda = Number((c.annualRevenue * (c.baselineEbitdaMargin ?? 0.40)).toFixed(0));
      c.ebit = c.ebitda;
      c.revenueHistory = [];
    });

    // labor share of output — a per-capita accounting construction. It is then paid per EMPLOYED
    // WORKER by firms whose earnings are their own, and the two do not agree: the table implied a
    // payroll the firms did not have the output to fund. That was invisible while wages were not
    // a real cost; once they were, it became a layoff cascade.
    //
    // So the level is solved from the employers' own books instead. Payroll scales linearly in
    // the wage index, so the index at which the region's firms exactly earn their cost of capital
    // has a closed form:
    //
    //     w = [ SUM ebitda + SUM basePayroll - SUM capitalCharge ] / SUM basePayroll
    //
    // Above it firms are shedding from week 1; below it they are hiring. The labor market moves
    // it from there like any other price — this only decides where the world opens.
    const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
    {
      const unitPools = Object.fromEntries((Object.keys(reg.occupationPools) as OccupationType[])
        .map(o => [o, { wageIndex: 1 }])) as Record<OccupationType, { wageIndex: number }>;
      let ebitdaUSD = 0; let basePayrollUSD = 0; let capitalChargeUSD = 0;
      regionCompanies.filter(c => !c.isBankEntity && isActiveCompany(c)).forEach(c => {
        ebitdaUSD += c.ebitda;
        basePayrollUSD += weeklyWageBillUSD(
          c.employeeCount, SECTOR_OCCUPATION_MIX[c.sector] ?? { GENERAL: 1.0 },
          baseAnnualWageUSD, unitPools, 1.0
        ) * 52;
        const netPpeUSD = Math.max(0, (c.grossPPEUSD ?? 0) - (c.accumulatedDepreciationUSD ?? 0));
        capitalChargeUSD += netPpeUSD * Math.max(0, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + (c.beta ?? 1) * EQUITY_RISK_PREMIUM);
      });
      if (basePayrollUSD > 0) {
        const affordableIndex = (ebitdaUSD + basePayrollUSD - capitalChargeUSD) / basePayrollUSD;
        if (affordableIndex > 0 && isFinite(affordableIndex)) {
          (Object.keys(reg.occupationPools) as OccupationType[]).forEach((occ) => {
            reg.occupationPools[occ].wageIndex = Number(affordableIndex.toFixed(5));
          });
        }
      }
    }
    const realWageIncomeUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce(
      (sum, occ) => sum + baseAnnualWageUSD[occ] * reg.occupationPools[occ].wageIndex * reg.occupationPools[occ].employed, 0
    );
    const realEmployedForWages = (Object.keys(reg.occupationPools) as OccupationType[])
      .reduce((sum, occ) => sum + reg.occupationPools[occ].employed, 0);
    const realUnemploymentBenefitsUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce((sum, occ) => {
      const unemployedInPool = totalLaborForce * (reg.occupationLaborForceShare[occ] ?? 0) - reg.occupationPools[occ].employed;
      return sum + baseAnnualWageUSD[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
    }, 0);
    // §7.4: this restatement is the SECOND computation of household income at seed (the macro
    // bootstrap does the first), so it must read the same transfer number or it silently
    // overwrites the first with a different economy. It used to re-derive transfers from the
    // spending budget while omitting debt service — a PUB1a leftover that won for six slices.
    // PUB3b: there is now one transfer number and both callers read it.
    const seedObligations = governmentObligationsWeeklyUSD({
      interestWeeklyUSD: reg.governmentInterestWeeklyUSD ?? 0,
      payrollWeeklyUSD: reg.governmentPayrollWeeklyUSD ?? 0,
      unemploymentBenefitsWeeklyUSD: realUnemploymentBenefitsUSD / 52,
      retiredPopulation: reg.totalPopulation * (reg.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0),
      averageAnnualWageUSD: realEmployedForWages > 0 ? realWageIncomeUSD / realEmployedForWages : 0,
      fiscalStanceScore: reg.fiscalStanceScore,
    });
    reg.governmentSpendingUSD = Number(seedObligations.totalUSD.toFixed(0));
    reg.estimatedHouseholdIncomeUSD = Number(computeHouseholdDisposableIncomeUSD({
      wageIncomeUSD: realWageIncomeUSD,
      transfersWeeklyUSD: seedObligations.transfersUSD,
    }).toFixed(0));

    // With income now on its real footing, restate the reported GDP series to what this
    // economy's own components actually sum to. estimatedNominalGdpUSD stays the supply-side
    // potential-output anchor it always was (it sizes the wage table, the government's budget
    // and the bank balance-sheet ratios); what gets reported, compared year-over-year and fed to
    // the Taylor rule is the real bottom-up measure, and it has to start where the real economy
    // starts or the difference is read as growth.
    const regionFirms = regionCompanies.filter(c => !c.isDefaulted && !c.mergerAcquired);
    const trackedInvestmentUSD = regionFirms.reduce((sum, c) => sum + c.maintenanceCapex + c.growthCapex, 0);
    const trackedEmployment = regionFirms.reduce((sum, c) => sum + c.employeeCount, 0);
    const privateEmployment = (reg.smePools || []).reduce((sum, seg) => sum + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + privateEmployment) / trackedEmployment : 1;
    const { gdpUSD: bottomUpGdpUSD } = computeExpenditureGdpUSD({
      householdIncomeUSD: reg.estimatedHouseholdIncomeUSD,
      savingsRate: reg.householdState.savingsRate,
      investmentUSD: trackedInvestmentUSD * investmentScaleFactor,
      // PUB1e/PUB3b: G is the procurement budget the government will actually bid, annualised —
      // the same number stage 05 bids and stage 11 debits the account by.
      governmentPurchasesUSD: seedObligations.procurementBudgetUSD * 52,
      netExportsUSD: reg.exportsUSD - reg.importsUSD,
    });
    // Build the real consumer basket now that every sub-unit carries its bootstrapped price.
    // Weights are what households actually spend on each good; base prices are today's.
    reg.cpiBasket = buildCpiBasket(reg, 1, CPI_BASE_LEVEL);

    reg.derivedNominalGdpUSD = Number(bottomUpGdpUSD.toFixed(0));
    reg.lastWeekNominalGdpUSD = reg.derivedNominalGdpUSD;
    const nominalTrendGrowth = reg.potentialGdpGrowth + reg.targetInflation;
    reg.nominalGdpHistory = reg.nominalGdpHistory.map((_, i, arr) =>
      Number((reg.derivedNominalGdpUSD * Math.pow(1 + nominalTrendGrowth, (i - (arr.length - 1)) / 52)).toFixed(0))
    );
  });

  // XB3a-2: the logistics sector, which this economy did not have. The fleet is sized by running
  // the sourcing intent against the bootstrap economy, and the carriers' books are built on the
  // rate that auction actually clears — so freight opens somewhere a week of this simulation
  // would produce rather than on an artifact of a guessed fleet (§7.4).
  const seededUnitMassTonnes = seedUnitMassTonnes(regions);
  const seedFxToUsd = (regionId: RegionId) => getFxToUsd(fxPairs, regionId);
  const carrierTickers = new Set<string>(companies.map(c => c.ticker));
  const carrierNames = new Set<string>(companies.map(c => c.name));
  const carriers = generateCarriers(regions, seededUnitMassTonnes, seedFxToUsd, carrierTickers, carrierNames);
  companies.push(...carriers);
  const seededFreightRates = (() => {
    const { bookings } = seedFreightDemand(regions, seededUnitMassTonnes, seedFxToUsd);
    // Open the regions on their real trade position rather than at zero exports and zero imports.
    // Net exports are a real component of the expenditure identity, and starting them at zero made
    // week 1 read the entire structural balance as a collapse in output. This is the engine's own
    // sourcing decision, taken once at seed prices — not a parallel formula (§7.4).
    (Object.keys(regions) as RegionId[]).forEach(r => { regions[r].exportsUSD = 0; regions[r].importsUSD = 0; });
    bookings.forEach(b => {
      if (b.from === b.to) return;
      const exWorks = Number((regions[b.from].categoryDemand[b.subUnitId] as any)?.unitPriceUSD) || 0;
      const valueUSD = localToUsd(b.units * exWorks, b.from, seedFxToUsd) * 52;
      regions[b.from].exportsUSD += valueUSD;
      regions[b.to].importsUSD += valueUSD;
    });
    (Object.keys(regions) as RegionId[]).forEach(r => {
      regions[r].exportsUSD = Number(regions[r].exportsUSD.toFixed(0));
      regions[r].importsUSD = Number(regions[r].importsUSD.toFixed(0));
      regions[r].tradeBalance = regions[r].exportsUSD - regions[r].importsUSD;
    });
    const clearing = runFreightClearing({
      carriers, regions, unitMassTonnes: seededUnitMassTonnes, bookings, fxToUsd: seedFxToUsd,
    });
    // A lane no carrier serves still needs a price to be evaluated against, or a route can never
    // open: what it would cost to sail is the honest answer until somebody does.
    return { ...specMarginalRatesByLane(regions, seededUnitMassTonnes), ...clearing.ratePerTonneLaneMoneyByLane };
  })();

  // The consignments already at sea on the day the simulation opens.
  const seededPipeline: InTransitShipment[] = [];
  {
    const { bookings } = seedFreightDemand(regions, seededUnitMassTonnes, seedFxToUsd);
    const buyersByRegion = {} as Record<RegionId, typeof companies>;
    (Object.keys(regions) as RegionId[]).forEach(r => {
      buyersByRegion[r] = companies.filter(c => c.region === r && (c.productLines || []).length > 0);
    });
    bookings.forEach(b => {
      const transit = Math.round(laneTransitWeeks(b.from, b.to, laneDistanceNm(b.from, b.to)));
      if (transit <= 0) return;
      const pool = buyersByRegion[b.to];
      if (!pool || pool.length === 0) return;
      const exWorks = Number((regions[b.from].categoryDemand[b.subUnitId] as any)?.unitPriceUSD) || 0;
      const perUnit = convertLocal(exWorks, b.from, b.to, seedFxToUsd);
      // One week's worth arriving in each of the next `transit` weeks: what a lane in steady
      // state is carrying.
      for (let wk = 1; wk <= transit; wk++) {
        const buyer = pool[(wk + b.subUnitId.length) % pool.length];
        seededPipeline.push({
          buyerTicker: buyer.ticker,
          sellerKey: `${b.from}_SEED_SUPPLIER`,
          subUnitId: b.subUnitId,
          units: b.units / transit,
          landedCostPerUnit: perUnit,
          arrivalWeek: wk,
        });
      }
    });
  }

  // XB5: the central banks' FX reserves, seeded at a real reserve-adequacy standard — three
  // months of import cover, which is the metric reserve managers actually hold to — and split
  // across the currencies each region actually buys from. A level, not a target: from week 1
  // intervention spends and accumulates them, and a bank at zero stops being able to bid.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const cb = regions[regionId].centralBankSheet;
    if (!cb) return;
    const quarterlyImportsUSD = (regions[regionId].importsUSD ?? 0) / 4;
    if (!(quarterlyImportsUSD > 0)) { cb.fxReservesByRegion = {}; return; }
    const sourcesUSD: Record<string, number> = {};
    let totalSourced = 0;
    (Object.keys(regions) as RegionId[]).forEach(origin => {
      if (origin === regionId) return;
      const x = regions[origin].exportsUSD ?? 0;
      sourcesUSD[origin] = x;
      totalSourced += x;
    });
    const book: Record<string, number> = {};
    (Object.keys(sourcesUSD) as RegionId[]).forEach(origin => {
      const share = totalSourced > 0 ? sourcesUSD[origin] / totalSourced : 1 / 3;
      book[origin] = Number((quarterlyImportsUSD * share).toFixed(0));
    });
    cb.fxReservesByRegion = book;
  });

  // SETL5: an institution banks like anyone else. Placed here, after every entity exists and
  // after the bank sheets are built, so the relationship and the reserves behind these balances
  // open in the shape the weekly engine maintains (§7.4). Until now institutional cash sat
  // outside the banking system, which is the blind spot that let a 64B double-count pass (§7.90).
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const reg = regions[regionId];
    const regionBanks = companies.filter(c => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    if (regionBanks.length === 0) return;
    const byBank = new Map<string, number>();
    const houseBanks = mandateAllocator(regionBanks.map(b => ({
      ticker: b.ticker, bankMarketShare: b.bankMarketShare, capacityUSD: b.bankBalanceSheet!.bankEquityUSD,
    })));
    institutionalEntities.forEach(e => {
      if (e.region !== regionId) return;
      e.homeBankTicker = houseBanks.pick(e.id, Math.max(0, e.cashUSD ?? 0));
      byBank.set(e.homeBankTicker, (byBank.get(e.homeBankTicker) ?? 0) + Math.max(0, e.cashUSD ?? 0));
    });
    regionBanks.forEach(b => {
      const instUSD = Math.round(byBank.get(b.ticker) ?? 0);
      b.bankBalanceSheet!.institutionalDepositsUSD = instUSD;
      b.bankBalanceSheet!.cashReservesUSD += instUSD;
      applyBankFundingSplit(b.bankBalanceSheet!, Math.round((reg.householdState.depositsUSD ?? 0) * (b.bankMarketShare ?? 1 / regionBanks.length)));
    });
    reg.bankingSector.institutionalDepositsUSD = regionBanks.reduce((a, b) => a + (b.bankBalanceSheet!.institutionalDepositsUSD ?? 0), 0);
    reg.bankingSector.depositsUSD = regionBanks.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0);
    reg.bankingSector.wholesaleFundingUSD = regionBanks.reduce((a, b) => a + (b.bankBalanceSheet!.wholesaleFundingUSD ?? 0), 0);
  });

  const commodities = getInitialCommodities();
  const allGeneratedCompanies = companies;
  // Calibrate the working linkage from the FROZEN base shares (§6: the old in-place mutation
  // meant a second world built in the same process re-calibrated already-calibrated values).
  Object.keys(BASE_COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
    const base = BASE_COMMODITY_CATEGORY_LINKAGE[commodityId];
    const calibratedShare = calibrateIntensityShare(commodityId, allGeneratedCompanies, regions, base.subUnitId);
    COMMODITY_CATEGORY_LINKAGE[commodityId] = { ...base, intensityShare: calibratedShare };
  });

  // G3b: the dealers the player trades with ARE the named banks' desks.
  const dealers = dealersFromBanks(companies);
  const compositeIndices = calculateCompositeIndices(companies, regions, commodities);
  const recentIPOs: { ticker: string; name: string; category: string; week: number }[] = [];
  const recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[] = [];

  const startingCash = 25_000_000; // $25M USD Hedge Fund Starting Capital
  const portfolio: Portfolio = {
    cashUSD: startingCash,
    startingCapitalUSD: startingCash,
    navUSD: startingCash,
    previousNavUSD: startingCash,
    historicalNav: [startingCash],
    historicalBenchmarks: [
      {
        week: 1,
        nav: startingCash,
        benchmark6040: startingCash,
        cashHurdle: startingCash,
      },
    ],
    positions: [],
    closedPositionsCount: 0,
    realizedPnLTotal: 0,
    cumulativeAttribution: {
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    lastWeekAttribution: {
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    totalRequiredMarginUSD: 0,
    maintenanceMarginUSD: 0,
    marginUtilizationPct: 0,
    isMarginCall: false,
    marginCallWarning: null,
    totalLeverage: 0,
    netDeltaUSD: 0,
    netGammaUSD: 0,
    netVegaUSD: 0,
    netDV01USD: 0,
  };

  

  // ---- HC4: private equity sponsors become real owners ----
  // The sponsor-style leverage has existed since HC1 (it is where the economy's B/BB paper
  // lives); HC4 gives it its real owner. Two funds per region hold the levered cohort; the LPs
  // behind them are the same real institutions, holding fund interests recorded under the same
  // doctrine as HC2's float seeding — the stakes existed, the owners were unmodeled, no cash
  // moves at recognition. Committed-but-undrawn capital is a real claim on named LPs that HC6's
  // deal flow will draw through the budget machinery like any other payment.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const firms = privateFirmsByRegion.get(regionId) ?? [];
    const sponsorable = firms.filter(f => f.leverage >= 4.2 && !f.isDefaulted);
    if (sponsorable.length === 0) return;
    const lps = institutionalEntities.filter(e => e.region === regionId &&
      (e.entityType === 'INSURER' || e.entityType === 'PENSION_FUND' || e.entityType === 'ASSET_MANAGER'));
    const lpWeightSum = lps.reduce((a, e) => a + e.totalAssetsUSD, 0) || 1;
    // The seed marks the sponsored stakes at the same multiple the running mark uses — what the
    // region's LISTED comps are worth per dollar of EBITDA — so week 0's NAV is not a different
    // valuation from week 1's. A bare `8 *` here and in the weekly mark was one company valued
    // two ways, and it made every seeded holding's entry basis a number nothing had cleared.
    const seedEvMultiple = publicComparableEvMultiple(regionId, companies);
    const stakeValue = (f: Company) => Math.max(0, seedEvMultiple * f.ebitda - f.totalDebt) * 0.75;

    // WS7: one money market fund per region. Born EMPTY — no fabricated share stock (§7.4's
    // seed-shape rule read the other way: the honest seed for a market the flows create is
    // zero, the same doctrine as WS5's CP program). Corporate sweeps and the household
    // yield-gap flow build its book; its bills/repo/RRP deployment rides the sleeve machinery
    // every entity already has.
    institutionalEntities.push({
      id: `${regionId}_MMF_1`,
      name: `${regionId} Government Money Market Fund`,
      ticker: `MMF1`,
      region: regionId,
      entityType: 'MONEY_MARKET_FUND',
      totalAssetsUSD: 0,
      equityCapitalUSD: 0,
      sharesOutstanding: 1,
      stockPrice: 0,
      itemizedHoldings: [],
      cashUSD: 0,
      assetAllocationTarget: allocationTargets.MONEY_MARKET_FUND,
      isDefaulted: false,
      historicalPrices: [],
      mmfSharesOutstandingUSD: 0,
      mmfNetYieldAnnual: 0,
    });

    // ---- ETF: one index fund per index, sponsored by the region's asset managers ----
    // Born EMPTY, same doctrine as the money fund above: a fund's shares are created by real
    // demand through a real authorised participant, so seeding a share stock would be inventing
    // the flow the mechanism exists to produce.
    //
    // Sponsorship interleaves the region's index list across its managers, so each house runs a
    // MIX of equity and credit rather than one becoming the equity shop and another the bond
    // shop. That is what real fund complexes look like, and it is what "no monolines" means.
    const regionManagers = institutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'ASSET_MANAGER'
    );
    if (regionManagers.length > 0) {
      const regionIndexes = INDEX_DEFINITIONS.filter((d) => d.region === regionId);
      // Global funds are sponsored out of the largest house in each of the first regions, so the
      // global complex is not concentrated in one manager either.
      const globalIndexes = regionId === 'USA'
        ? INDEX_DEFINITIONS.filter((d) => !d.region)
        : [];
      [...regionIndexes, ...globalIndexes].forEach((def, i) => {
        const sponsor = regionManagers[i % regionManagers.length];
        const expenseClass = def.assetClass;
        institutionalEntities.push({
          id: `${def.id}_ETF`,
          name: `${def.name} Index Fund`,
          ticker: `${def.id.replace(/_/g, '').slice(0, 5)}X`,
          region: regionId,
          entityType: 'ETF',
          totalAssetsUSD: 0,
          equityCapitalUSD: 0,
          sharesOutstanding: 0,
          stockPrice: 0,
          itemizedHoldings: [],
          cashUSD: 0,
          assetAllocationTarget: allocationTargets.ETF,
          isDefaulted: false,
          historicalPrices: [],
          etf: {
            indexId: def.id,
            sponsorEntityId: sponsor.id,
            sharesOutstanding: 0,
            expenseRatioAnnual: ETF_EXPENSE_RATIO_ANNUAL[expenseClass],
            unmetFlowShare: 0,
          },
        });
      });
    }

    for (let fundIdx = 0; fundIdx < 2; fundIdx++) {
      const portfolio = sponsorable.filter((_, i) => i % 2 === fundIdx);
      if (portfolio.length === 0) continue;
      const fundId = `${regionId}_PEFUND_${fundIdx + 1}`;
      const investedUSD = Math.round(portfolio.reduce((a, f) => a + stakeValue(f), 0));
      // Real funds keep ~a third of commitments undrawn — the dry powder HC6 calls.
      const committedUSD = Math.round(investedUSD / 0.65);
      portfolio.forEach(f => {
        // The entry basis is recorded, not defaulted: these stakes were bought at the market the
        // world opens with, and HC6's exit test asks whether the market later pays MORE than that.
        f.ownership = {
          founderPct: 0.25, peSponsorId: fundId, peSponsorPct: 0.75,
          acquiredWeek: 0, entryEvMultiple: seedEvMultiple,
        };
      });
      institutionalEntities.push({
        id: fundId,
        name: `${regionId} Capital Partners ${['I', 'II'][fundIdx]}`,
        ticker: `PEF${fundIdx + 1}`,
        region: regionId,
        entityType: 'PRIVATE_EQUITY',
        totalAssetsUSD: investedUSD,
        equityCapitalUSD: investedUSD,
        sharesOutstanding: 1,
        stockPrice: 0,
        itemizedHoldings: [],
        cashUSD: 0,
        assetAllocationTarget: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
        isDefaulted: false,
        historicalPrices: [],
        peFund: {
          portfolioCompanyIds: portfolio.map(f => f.id),
          lpCommitments: lps.map(e => ({
            lpEntityId: e.id,
            committedUSD: Math.round(committedUSD * (e.totalAssetsUSD / lpWeightSum)),
            drawnUSD: Math.round(investedUSD * (e.totalAssetsUSD / lpWeightSum)),
          })),
        },
      });
      lps.forEach(e => {
        const interestUSD = Math.round(investedUSD * (e.totalAssetsUSD / lpWeightSum));
        if (interestUSD > 1) {
          e.itemizedHoldings.push({ instrumentId: fundId, instrumentType: 'PE_FUND_INTEREST', issuerRegion: regionId, quantityOrNotionalUSD: interestUSD });
          e.totalAssetsUSD += interestUSD;
        }
      });
    }
  });

  // ---- HC2: the private tier's tradable float seeded onto its real holders ----
  // Runs last because it needs the institutional entities built above. The paper existed before
  // the market did — the claims were simply held by nobody the model named. Institutions hold
  // the tradable share from week 0 in the same proportional shape the clearing engines produce
  // (lesson §7.4), no cash moves (recognising an existing stock, not a purchase), and S11's
  // weekly mark carries the enlarged books from week 1.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const reg = regions[regionId];
    const firms = privateFirmsByRegion.get(regionId) ?? [];
    const regionEntities = institutionalEntities.filter(e => e.region === regionId);
    // OWN6 / §7.4: the seed must place exactly the instrument the weekly books clear. 07b
    // excludes commercial paper (07f's market) and 07d excludes bank facilities (they sit on a
    // named bank's itemized book), so the placement here excludes them too — and places the
    // WHOLE remaining stock, which is the float those books now clear (OWN2). It used to place
    // `corpBondOwnership.institutionalShare` of a ladder that included both, so the private
    // tier opened with a gap in the paper that IS traded and a double count in the paper that
    // is not.
    const fixedOf = (f: Company) => (f.debtTranches || [])
      .filter(t => t.rateType === 'FIXED' && !t.isCommercialPaper).reduce((a, t) => a + t.principalUSD, 0);
    const floatOf = (f: Company) => (f.debtTranches || [])
      .filter(t => t.rateType === 'FLOATING' && !t.isBankFacility).reduce((a, t) => a + t.principalUSD, 0);
    const IG = ['AAA', 'AA', 'A', 'BBB'];
    const sleeve = (t: InstitutionalEntityType, ig: boolean) =>
      ig ? 1 : t === 'INSURER' ? 0.08 : t === 'PENSION_FUND' ? 0.10 : t === 'ASSET_MANAGER' ? 2.0 : 4.0;
    firms.forEach(f => {
      const ig = IG.includes(f.creditRating);
      (['CORP_BOND', 'LEVERAGED_LOAN'] as const).forEach(kind => {
        const outstanding = kind === 'CORP_BOND' ? fixedOf(f) : floatOf(f);
        if (outstanding <= 0) return;
        const tradable = outstanding;
        const weights = regionEntities.map(e => {
          const pct = kind === 'CORP_BOND' ? e.assetAllocationTarget.corpBondPct : e.assetAllocationTarget.loanPct;
          return e.totalAssetsUSD * pct * sleeve(e.entityType, ig);
        });
        const wSum = weights.reduce((a, b) => a + b, 0) || 1;
        regionEntities.forEach((e, i) => {
          const qty = tradable * (weights[i] / wSum);
          if (qty > 1) {
            e.itemizedHoldings.push({ instrumentId: f.id, instrumentType: kind, issuerRegion: regionId, quantityOrNotionalUSD: Math.round(qty) });
            e.totalAssetsUSD += Math.round(qty);
          }
        });
      });
    });
  });

  // ---- SETL5b: NOTHING is born unbanked. ----
  //
  // The two home-bank passes above run in the middle of this function, and three kinds of holder
  // are created after them: the carriers (freight companies), the money-market funds and the
  // ETFs. They therefore held their money nowhere. Settlement counts a payment to a holder with
  // no bank as UNRESOLVED — money leaving the system — which is exactly the §7.86 defect's
  // shape, and it was measured at 11.7B a WEEK for the money funds alone plus 12 unbanked
  // carriers, hidden until the SME pools started trading with everyone.
  //
  // The relationship is chosen the same way the passes above choose it, and the money is put
  // where it now sits: on the bank's own funding line, with the reserves behind it.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const reg = regions[regionId];
    const regionBanks = companies.filter(c => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    if (regionBanks.length === 0) return;
    const lateHouseBanks = mandateAllocator(regionBanks.map(b => ({
      ticker: b.ticker, bankMarketShare: b.bankMarketShare, capacityUSD: b.bankBalanceSheet!.bankEquityUSD,
    })));
    const lateCorporateByBank = new Map<string, number>();
    const lateInstitutionalByBank = new Map<string, number>();
    companies.forEach(c => {
      if (c.region !== regionId || c.isBankEntity || c.homeBankTicker) return;
      c.homeBankTicker = lateHouseBanks.pick(c.id, Math.max(0, c.cash));
      lateCorporateByBank.set(c.homeBankTicker, (lateCorporateByBank.get(c.homeBankTicker) ?? 0) + Math.max(0, c.cash));
    });
    institutionalEntities.forEach(e => {
      if (e.region !== regionId || e.homeBankTicker) return;
      e.homeBankTicker = lateHouseBanks.pick(e.id, Math.max(0, e.cashUSD ?? 0));
      lateInstitutionalByBank.set(e.homeBankTicker, (lateInstitutionalByBank.get(e.homeBankTicker) ?? 0) + Math.max(0, e.cashUSD ?? 0));
    });
    if (lateCorporateByBank.size === 0 && lateInstitutionalByBank.size === 0) return;
    regionBanks.forEach(b => {
      const sheet = b.bankBalanceSheet!;
      const corpUSD = Math.round(lateCorporateByBank.get(b.ticker) ?? 0);
      const instUSD = Math.round(lateInstitutionalByBank.get(b.ticker) ?? 0);
      sheet.corporateDepositsUSD += corpUSD;
      sheet.institutionalDepositsUSD = (sheet.institutionalDepositsUSD ?? 0) + instUSD;
      sheet.cashReservesUSD += corpUSD + instUSD;
      applyBankFundingSplit(sheet, Math.round((reg.householdState.depositsUSD ?? 0) * (b.bankMarketShare ?? 1 / regionBanks.length)));
    });
    reg.bankingSector.corporateDepositsUSD = regionBanks.reduce((a, b) => a + b.bankBalanceSheet!.corporateDepositsUSD, 0);
    reg.bankingSector.institutionalDepositsUSD = regionBanks.reduce((a, b) => a + (b.bankBalanceSheet!.institutionalDepositsUSD ?? 0), 0);
    reg.bankingSector.depositsUSD = regionBanks.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0);
    reg.bankingSector.wholesaleFundingUSD = regionBanks.reduce((a, b) => a + (b.bankBalanceSheet!.wholesaleFundingUSD ?? 0), 0);
    reg.bankingSector.cashReservesUSD = regionBanks.reduce((a, b) => a + b.bankBalanceSheet!.cashReservesUSD, 0);
  });

  // S7: project the real seeded books onto the sector aggregates before the first week runs, so
  // week 0's displayed numbers are the same derivation every later week uses. The aggregates
  // written earlier in this function are the SEEDS the entity targets were sized against (they
  // have to exist first); this replaces them with what the resulting real books actually hold —
  // notably including the HC private tier, which the share-times-outstanding seeds never saw.
  {
    const seeded = { regions, companies, institutionalEntities } as unknown as GameState;
    // OWN1: and the ownership register, from the same seeded books — so week 0 shows the same
    // measurement stage 11 will take at the end of week 1, rather than an empty one.
    const ownershipByRegion = measuredOwnershipAllRegions(seeded);
    (Object.keys(regions) as RegionId[]).forEach(regionId => {
      refreshRegionalHoldingsView(seeded, regionId, regions[regionId]);
      const m = ownershipByRegion[regionId];
      regions[regionId].equityOwnership = ownershipSharesFromRegister(m.equity);
      regions[regionId].corpBondOwnership = ownershipSharesFromRegister(m.corpBond);
      regions[regionId].sovBondOwnership = ownershipSharesFromRegister(m.sovBond);
    });
  }

  return {
    currentWeek: 1,
    year: 2026,
    rngSeed: seed,
    rngState: getRngState(),
    primaryOfferings: [],
    unitMassTonnes: seededUnitMassTonnes,
    freightRatePerTonneLaneMoneyByLane: seededFreightRates,
    // Opens empty: no pair has traded yet, so none has revealed its depth.
    fxPairIlliquidity: {},
    tradeInvoices: [],
    // The pipeline opens FULL, because a running economy's is. Every lane that takes weeks to
    // cross has weeks of cargo on it at any moment, and opening at zero means the first arrivals
    // land a month in — measured, that starved importers of inputs, collapsed the trade the
    // carriers live on, and defaulted the entire fleet by week twelve. A §7.4 cold start, not an
    // economic result. Seeded from the engine's own opening sourcing decision, spread over the
    // weeks each voyage actually takes.
    goodsInTransit: seededPipeline,
    // Born EMPTY: the first weekly pass strikes every index's membership from the market that
    // actually exists, at base 100. Seeding a constituent list here would be a second, stated
    // version of a rule the engine already runs (§7.4's seed-shape rule).
    marketIndexes: [],
    regions,
    fxPairs,
    companies,
    institutionalEntities,
    commodities,
    compositeIndices,
    recentIPOs,
    recentMergers,
    dealers,
    portfolio,
    newsFeed: [
      {
        id: 'init_welcome',
        week: 1,
        title: 'Institutional Quant Trading Desk Initialized | Jan 05, 2026',
        description:
          'Portfolio unencumbered capital: $25,000,000 USD. Multi-region Nelson-Siegel curves, 200 corporate issuers, 3 Dealer axes, asynchronous quarterly earnings, and full Greeks attribution online.',
        category: 'MACRO',
        impactBadge: '[SYSTEM INIT]',
        urgent: true,
      },
    ],
    turnSummary: null,
    isTradeModalOpen: false,
    selectedInstrument: null,
    isNewsDrawerOpen: false,
    diagnosticsLogs: [
      {
        week: 1,
        // Sim calendar, never wall clock — see 02-region-macro's twin comment.
        timestamp: getSimulationDate(1).toISOString(),
        category: 'EXECUTION',
        message: 'Engine Initialized: Multi-Region Macro <-> Micro Feedback Loop Active (Jan 05, 2026)',
        deltaText: '200 Corporate Issuers • 4 Nelson-Siegel Yield Curves • 9 Commodities Desk',
        data: { capitalUSD: startingCash, regionsCount: 4, firmsCount: companies.length },
      },
    ],
    isGameOver: false,
    gameOverReason: null,
  };
}



