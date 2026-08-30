import { Company, CreditRating, RegionId, Sector, DebtTranche, FundamentalSnapshot, ProductCategory, QuarterlyIncomeStatement, QuarterlyBalanceSheet, INDUSTRY_SUBUNITS, Industry, FinancialStatementProfile, COMMODITY_CATEGORY_LINKAGE } from '../types';
import { INDUSTRY_REGISTRY, subUnitsByProducingSector, ProducingSector, recipeIntensityOf, industryOfSubUnit } from '../domain/industry-registry';
import { defect } from '../domain/defect';
import { callProtectionForIssue } from '../domain/call-protection';
import { isInvestmentGrade } from './simulation/stages/asset-allocation';
import { RATING_OAS_SPREADS, SECTOR_BENCHMARKS } from './pricing';
import { getInitialRegions } from './macro/initialization';
import { FirmSeedTemplate, generateFirmSeeds, generateUniqueName, generateUniqueTicker } from './bootstrap/firms';
import { getRegionProductivityPerCapitaUSD } from './bootstrap/population';
import { SECTOR_PPE_INTENSITY, SECTOR_PPE_USEFUL_LIFE_YEARS } from './simulation/constants';
import { fairValuePerShare, REPRESENTATIVE_HOLDER_REQUIRED_RETURN } from './equity-valuation';
import { PrivateFirmSeed } from './bootstrap/private-firms';
import { determineCreditRating } from './simulation/credit';
import { random } from './rng';

export const FIXED_SHARE_BY_RATING: Record<CreditRating, number> = {
  AAA: 0.90, AA: 0.85, A: 0.75, BBB: 0.60, BB: 0.40, B: 0.20, CCC: 0.10, D: 0,
};

// Generic (sector-unaware) fallback used only by buildQuarterlyFundamentalSnapshot when a
// caller hasn't wired up a real PP&E figure — every real call site below passes one explicitly.
const DEFAULT_PPE_INTENSITY = 0.5;
// A freshly-generated company is seeded partway through its asset life, not brand new — this is
// the accumulated-depreciation fraction of gross PP&E used at that seed point.
const INITIAL_ACCUM_DEPRECIATION_FRACTION = 0.45;

export function getCategoryDemandSeedUSD(
  category: string,
  region: RegionId,
  // §6 hoist: callers inside generation pass the world they already built; rebuilding four
  // regions (and consuming their RNG draws) once per company was most of the cold start's
  // random stream spent on immediately-discarded objects.
  initialRegions: Record<RegionId, import('../types').Region> = getInitialRegions()
): number {
  const income = initialRegions[region]?.estimatedHouseholdIncomeUSD ?? 10_000_000_000_000;
  const consumption = income * 0.95;
  const govBase = income * 0.18;
  const corpBase = income * 0.08;

  switch (category) {
    case 'Energy': return consumption * 0.10;
    case 'MaterialsChemicals': return corpBase * 0.15;
    case 'IndustrialsMachinery': return corpBase * 0.35;
    case 'AerospaceDefense': return govBase * 0.25;
    case 'AutomotiveTransport': return consumption * 0.15;
    case 'TechHardwareSemis': return corpBase * 0.20;
    case 'SoftwareDigitalServices': return corpBase * 0.30;
    case 'Telecommunications': return consumption * 0.05;
    case 'HealthcarePharma': return govBase * 0.30;
    case 'ConsumerStaples': return consumption * 0.20;
    case 'ConsumerDiscretionaryRetail': return consumption * 0.15;
    case 'LuxuryGoods': return consumption * 0.10;
    case 'MediaEntertainment': return consumption * 0.05;
    case 'RealEstateConstruction': return consumption * 0.10;
    default: return consumption * 0.20;
  }
}

/**
 * CHAIN-E — THE TIERS PARTITION DEMAND; THEY DO NOT EACH TAKE A SHARE OF IT.
 *
 * The named tier's cut used to be a flat `0.35` while the SME segment took its industry's
 * `smeShareOfActivity` and the private tier carved out of THAT. Three independent claims on one
 * pot, summing to whatever they summed to: measured at seed, named firms took 93% of total output
 * and the pools another 36% — **129% between them** — because nothing made them add up.
 *
 * The registry already states the only split that is a structural fact: `smeShareOfActivity`, how
 * much of an industry is carried by firms too small to name. So the named tier's share is its
 * complement, exactly, and the private tier's carve happens inside the SME half where HC always
 * put it. The three tiers then partition total output by construction and cannot over- or
 * under-claim it (rule 13 — a share is an outcome of the one structural primitive, not a fourth
 * stated number).
 */
export function deriveInitialRevenueUSD(
  category: ProductCategory,
  regionCategoryDemandSeedUSD: number,
  companyRankInCategory: number,
  totalCompaniesInCategory: number
): number {
  const minWeightRatio = 0.02;
  const decayBase = totalCompaniesInCategory > 1
    ? Math.pow(minWeightRatio, 1 / (totalCompaniesInCategory - 1))
    : 1;
  const rankWeight = Math.pow(decayBase, companyRankInCategory);
  const totalRankWeight = Array.from({ length: totalCompaniesInCategory }, (_, i) => Math.pow(decayBase, i)).reduce((a, b) => a + b, 0);
  // `category` is an INDUSTRY key here and a sub-unit id at other call sites; accept either
  // rather than making the caller know which (it is the same question: whose industry is this).
  const industry = (INDUSTRY_REGISTRY as any)[category as string]
    ? (category as unknown as Industry)
    : industryOfSubUnit(category as string);
  if (!industry) defect(`deriveInitialRevenueUSD: ${String(category)} is neither an industry nor a sub-unit`);
  const namedTierShare = 1 - INDUSTRY_REGISTRY[industry].smeShareOfActivity;
  return regionCategoryDemandSeedUSD * (rankWeight / totalRankWeight) * namedTierShare;
}


// generateUniqueName / generateUniqueTicker now live in ./bootstrap/firms (imported above)
// so the padding-clone loop below and the generative firm seeds share one implementation.

// Real cost-driver dollar impacts this quarter (wage pressure, input-price shocks, capacity
// decay from deferred maintenance, competitive crowding) — passed through from the same
// per-week locals stage 08 already computes to move the blended EBITDA margin, so "where the
// costs are going" reconciles to genuine simulation signals rather than a flat formula.
export interface CogsCostDrivers {
  wagePressureUSD: number;
  inputPriceCostUSD: number;
  capacityDecayCostUSD: number;
  crowdingCostUSD: number;
}

export function buildQuarterlyFundamentalSnapshot(
  week: number,
  filingPeriod: string,
  filingDate: string,
  annualRevenue: number,
  ebitda: number,
  netIncome: number,
  eps: number,
  cash: number,
  totalDebt: number,
  treasuryHoldingsUSD: number = 0,
  finishedGoodsInventoryUSD: number = 0,
  maintenanceCapex: number = 0,
  growthCapex: number = 0,
  oasSpreadBps: number = 150,
  dividendYield: number = 0.02,
  marketCap: number = 1_000_000_000,
  prevSnapshot?: FundamentalSnapshot,
  debtIssuance: number = 0,
  debtRepayment: number = 0,
  buybacks: number = 0,
  // Real PP&E stock roll-forward (gross cost less accumulated depreciation) — a genuine asset
  // the company actually purchased and is running down, not a financing-side (debt) proxy.
  // Callers always seed/carry this from the company's own PP&E history; the fallback below only
  // covers a caller that hasn't been wired up yet, and is revenue-scaled (what this company
  // actually produces), never debt-scaled (an unrelated financing decision).
  grossPPEUSD?: number,
  accumulatedDepreciationUSD?: number,
  daQuarterlyOverride?: number,
  costDrivers?: CogsCostDrivers,
  // Real current-portion-of-debt split from this company's own debt tranche maturities, when
  // the caller has them (it always does once tranches exist) — replaces a flat 15/85 guess.
  shortTermDebtUSD?: number,
  // Real per-tranche interest (sum of each tranche's own coupon/floating rate x principal) —
  // the same figure the caller already used to compute net income, so this statement's interest
  // expense actually reconciles to it instead of re-deriving a second, disconnected number from
  // a flat spread-over-totalDebt formula.
  annualInterestOverride?: number,
  // 1$ is 1$ Phase 6: real held raw-material/input inventory value, as of this filing date (sum
  // of InputLot.unitsHeld * unitPriceUSD) — genuine asset value the balance sheet previously had
  // no line for at all, defaulting to 0 for the synthetic pre-history seed snapshots below.
  rawMaterialsInventoryUSD: number = 0,
): FundamentalSnapshot {
  const revQ = annualRevenue / 4;
  const ebitdaQ = ebitda / 4;
  const ebitdaMargin = ebitda / Math.max(1, annualRevenue);
  const cogs = revQ * (1 - ebitdaMargin - 0.12);
  const sgaExpense = revQ * 0.12;
  const grossProfit = revQ - cogs;
  const daQuarterly = daQuarterlyOverride ?? Math.max(1, (maintenanceCapex + growthCapex) / 4 * 0.8);
  const interestExpense = annualInterestOverride !== undefined ? annualInterestOverride / 4 : totalDebt * (oasSpreadBps / 10000 + 0.03) / 4;
  const pretaxIncome = ebitdaQ - daQuarterly - interestExpense;
  const taxExpense = Math.max(0, pretaxIncome * 0.21);
  const netIncQ = netIncome / 4;
  const epsQ = eps / 4;

  // Decompose COGS into the real drivers that moved this company's margin this quarter, plus a
  // residual "base cost of production" — never invented, always reconciles exactly to `cogs`.
  const rawDriverSum = costDrivers
    ? (costDrivers.wagePressureUSD + costDrivers.inputPriceCostUSD + costDrivers.capacityDecayCostUSD + costDrivers.crowdingCostUSD)
    : 0;
  const driverScale = rawDriverSum > 0 && rawDriverSum > cogs * 0.9 ? (cogs * 0.9) / rawDriverSum : 1;
  const cogsBreakdown: QuarterlyIncomeStatement['cogsBreakdown'] = costDrivers ? {
    wagePressureUSD: costDrivers.wagePressureUSD * driverScale,
    inputPriceCostUSD: costDrivers.inputPriceCostUSD * driverScale,
    capacityDecayCostUSD: costDrivers.capacityDecayCostUSD * driverScale,
    crowdingCostUSD: costDrivers.crowdingCostUSD * driverScale,
    baseCostUSD: cogs - rawDriverSum * driverScale,
  } : {
    wagePressureUSD: 0,
    inputPriceCostUSD: 0,
    capacityDecayCostUSD: 0,
    crowdingCostUSD: 0,
    baseCostUSD: cogs,
  };

  const incomeStatement: QuarterlyIncomeStatement = {
    revenue: revQ,
    cogs,
    cogsBreakdown,
    grossProfit,
    sgaExpense,
    ebitda: ebitdaQ,
    depreciationAmortization: daQuarterly,
    ebit: ebitdaQ - daQuarterly,
    interestExpense,
    pretaxIncome,
    taxExpense,
    netIncome: netIncQ,
    eps: epsQ,
  };

  const workingCapitalUSD = annualRevenue * 0.08;
  const accountsReceivable = workingCapitalUSD * 0.6;
  const accountsPayable = workingCapitalUSD * 0.4;
  const grossPPE = grossPPEUSD ?? (annualRevenue * DEFAULT_PPE_INTENSITY / (1 - INITIAL_ACCUM_DEPRECIATION_FRACTION));
  const accumulatedDepreciation = accumulatedDepreciationUSD ?? (grossPPE * INITIAL_ACCUM_DEPRECIATION_FRACTION);
  const netPPE = grossPPE - accumulatedDepreciation;
  const totalAssets = cash + accountsReceivable + finishedGoodsInventoryUSD + rawMaterialsInventoryUSD + netPPE;
  const shortTermDebt = shortTermDebtUSD ?? (totalDebt * 0.15);
  const longTermDebt = totalDebt - shortTermDebt;
  const totalLiabilities = accountsPayable + totalDebt;
  const shareholdersEquity = totalAssets - totalLiabilities;

  const balanceSheet: QuarterlyBalanceSheet = {
    cash,
    treasuryHoldingsUSD,
    accountsReceivable,
    finishedGoodsInventoryUSD,
    rawMaterialsInventoryUSD,
    grossPPE,
    accumulatedDepreciation,
    netPPE,
    totalAssets,
    accountsPayable,
    shortTermDebt,
    longTermDebt,
    totalLiabilities,
    shareholdersEquity,
  };

  const prevWC = prevSnapshot
    ? prevSnapshot.balanceSheet.accountsReceivable + prevSnapshot.balanceSheet.finishedGoodsInventoryUSD + prevSnapshot.balanceSheet.rawMaterialsInventoryUSD - prevSnapshot.balanceSheet.accountsPayable
    : workingCapitalUSD;
  const currentWC = accountsReceivable + finishedGoodsInventoryUSD + rawMaterialsInventoryUSD - accountsPayable;
  const changeInWorkingCapital = -(currentWC - prevWC);
  const cashFromOperations = netIncQ + daQuarterly + changeInWorkingCapital;

  const prevTreasury = prevSnapshot?.balanceSheet.treasuryHoldingsUSD ?? 0;
  const treasuryPurchases = -(treasuryHoldingsUSD - prevTreasury);
  const cashFromInvesting = -maintenanceCapex / 4 - growthCapex / 4 + treasuryPurchases;

  const dividendsPaid = -(dividendYield * marketCap / 4);
  const cashFromFinancing = dividendsPaid - buybacks + debtIssuance - debtRepayment;

  const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;

  const leverage = Number((totalDebt / Math.max(1, ebitda)).toFixed(2));
  const interestCoverage = Number(((ebitdaQ - daQuarterly) / Math.max(0.01, interestExpense)).toFixed(2));

  return {
    week,
    filingPeriod,
    filingDate,
    incomeStatement,
    balanceSheet,
    cashFlowStatement: {
      netIncome: netIncQ,
      daAddback: daQuarterly,
      changeInWorkingCapital,
      cashFromOperations,
      maintenanceCapex: -maintenanceCapex / 4,
      growthCapex: -growthCapex / 4,
      treasuryPurchases,
      cashFromInvesting,
      debtIssuance,
      debtRepayment,
      dividendsPaid,
      buybacks: -buybacks,
      cashFromFinancing,
      netChangeInCash,
    },
    leverage,
    interestCoverage,
    annualRevenue,
    ebitda,
    ebit: ebitda - daQuarterly * 4,
    netIncome,
    cash,
    totalDebt,
    eps,
  };
}

// Ladder shape scales with the firm's relative size (rank within its sector, 0 = largest) —
// a small firm realistically carries a simpler capital structure (one or two tranches) than a
// large anchor firm's fully laddered public debt stack, rather than every company regardless
// of size getting the same fixed 3-tranche, 5/10/15yr ladder.
function debtLadderShape(rank: number): { weights: number[]; maturityWeeks: number[] } {
  if (rank < 2) return { weights: [0.35, 0.35, 0.30], maturityWeeks: [260, 520, 780] }; // 5/10/15y
  if (rank < 5) return { weights: [0.60, 0.40], maturityWeeks: [260, 520] }; // 5/10y
  return { weights: [1.0], maturityWeeks: [364] }; // single blended 7y tranche
}

function generateDebtTranches(ticker: string, debtBase: number, initialRating: CreditRating, policyRate: number = 0.045, rank: number = 0): DebtTranche[] {
  const fixedShare = FIXED_SHARE_BY_RATING[initialRating] ?? 0.5;
  const { weights: trancheWeights, maturityWeeks } = debtLadderShape(rank);
  const baseSpreadBps = RATING_OAS_SPREADS[initialRating]?.baseBps ?? 150;
  const basePolicyRate = policyRate;
  let cumulativePrincipalAssigned = 0;
  return maturityWeeks.map((maturityWeek, i) => {
    const principalUSD = debtBase * trancheWeights[i];
    // Assign each rung to whichever side of the fixed/floating split its own principal mostly
    // falls in, by testing its MIDPOINT against the target rather than its starting edge.
    //
    // Testing the starting edge made the first rung FIXED unconditionally — cumulative principal
    // is zero at that point, so the test passed for every rating including CCC. Most issuers here
    // carry a single blended tranche (see debtLadderShape), so most issuers came out 100% fixed
    // and the floating float across the entire market was ZERO: the leveraged-loan market this
    // codebase prices, trades, clears in 07d and offers in the trade ticket did not contain a
    // single loan. Every company's discountMarginBps sat frozen at its seed while its OAS moved.
    //
    // FIXED_SHARE_BY_RATING was already right about the economics — investment-grade issuers fund
    // with bonds, sub-investment-grade issuers fund with floating-rate term loans, which is what
    // a leveraged loan IS. The midpoint test delivers that: a single-tranche CCC issuer (10%
    // fixed) now comes out floating, a single-tranche AA issuer (85%) fixed, and multi-rung
    // issuers land within a few points of their target share.
    const isFixed = (cumulativePrincipalAssigned + principalUSD / 2) < fixedShare * debtBase;
    cumulativePrincipalAssigned += principalUSD;
    return isFixed
      ? {
          id: `${ticker}-T${i + 1}`,
          principalUSD,
          rateType: 'FIXED' as const,
          couponRate: basePolicyRate + baseSpreadBps / 10000,
          originationWeek: 0,
          maturityWeek,
          seniority: 'SENIOR' as const,
          callProtection: callProtectionForIssue({ rateType: 'FIXED', isInvestmentGrade: isInvestmentGrade(initialRating) }),
        }
      : {
          id: `${ticker}-T${i + 1}`,
          principalUSD,
          rateType: 'FLOATING' as const,
          floatingMarginBps: Math.round(baseSpreadBps * 0.85),
          originationWeek: 0,
          maturityWeek,
          seniority: 'SENIOR' as const,
          callProtection: callProtectionForIssue({ rateType: 'FLOATING', isInvestmentGrade: isInvestmentGrade(initialRating) }),
        };
  });
}



/**
 * Generate the full initial company roster: each region's seed firms come from the
 * generative firms.ts bootstrap module (Pareto-ranked per sector, plus bank/insurer/asset
 * manager/pension-fund specialty roles and commodity producers), then padded out with
 * procedurally scaled clones up to the per-region target count below.
 */
export function generateInitialCompanies(
  initialRegions: Record<RegionId, import('../types').Region> = getInitialRegions()
): Company[] {
  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const companies: Company[] = [];
  // Shared across every region's seed generation so tickers/names are globally unique, not
  // just unique within one region — a per-region Set let e.g. USA and UK each independently
  // generate a firm named "TCGP".
  const existingSeedTickers = new Set<string>();
  const existingSeedNames = new Set<string>();

  regions.forEach((region) => {
    const regionPolicyRate = initialRegions[region]?.policyRate ?? 0.045;
    const regionProductivityPerCapita = getRegionProductivityPerCapitaUSD(region);
    let templates: FirmSeedTemplate[] = generateFirmSeeds(region, existingSeedTickers, existingSeedNames);



    // Group templates by primary category to rank them properly
    const categoryGroups: Record<string, FirmSeedTemplate[]> = {};
    templates.forEach((tmpl) => {
      let primaryCat = 'ConsumerStaples';
      if (tmpl.sector === 'Tech') primaryCat = 'SoftwareDigitalServices';
      else if (tmpl.sector === 'Energy') primaryCat = 'Energy';
      else if (tmpl.sector === 'Industrials') primaryCat = 'IndustrialsMachinery';
      else if (tmpl.sector === 'Financials' || tmpl.sector === 'Banks') primaryCat = 'SoftwareDigitalServices';
      else if (tmpl.sector === 'Consumer') primaryCat = 'ConsumerStaples';

      if (!categoryGroups[primaryCat]) categoryGroups[primaryCat] = [];
      categoryGroups[primaryCat].push(tmpl);
    });

    templates.forEach((rawTmpl) => {
      let primaryCat: ProductCategory = 'ConsumerStaples';
      if (rawTmpl.sector === 'Tech') primaryCat = 'SoftwareDigitalServices';
      else if (rawTmpl.sector === 'Energy') primaryCat = 'Energy';
      else if (rawTmpl.sector === 'Industrials') primaryCat = 'IndustrialsMachinery';
      else if (rawTmpl.sector === 'Financials' || rawTmpl.sector === 'Banks') primaryCat = 'SoftwareDigitalServices';
      else if (rawTmpl.sector === 'Consumer') primaryCat = 'ConsumerStaples';

      const group = categoryGroups[primaryCat];
      const rankInCategory = group.findIndex(t => t.ticker === rawTmpl.ticker);
      const totalInCategory = group.length;

      const regionDemandSeed = getCategoryDemandSeedUSD(primaryCat, region, initialRegions);
      let derivedRevBase = deriveInitialRevenueUSD(primaryCat, regionDemandSeed, rankInCategory >= 0 ? rankInCategory : 0, totalInCategory || 1);

      if (rawTmpl.sector === 'Banks') {
        // OWN5: the seed share is the cohort's own firm-size curve (bootstrap/firms.ts) and it
        // survives only until 02b measures the deposits each bank actually holds.
        const bankShare = rawTmpl.bankMarketShare ?? 0.25;
        const initReg = initialRegions[region];
        if (initReg?.bankingSector) {
          const bs = initReg.bankingSector;
          const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
          derivedRevBase = bs.netInterestMarginPct * totalAssets * bankShare * 2.2;
        }
      }

      const debtRatio = rawTmpl.debtBase / Math.max(1, rawTmpl.revBase);
      const cashRatio = rawTmpl.cashBase / Math.max(1, rawTmpl.revBase);
      const derivedDebtBase = derivedRevBase * debtRatio;
      const derivedCashBase = derivedRevBase * cashRatio;

      const rank0RevenueUSD = deriveInitialRevenueUSD(primaryCat, regionDemandSeed, 0, totalInCategory || 1);
      const revenueScaleVsRank0 = rank0RevenueUSD > 0 ? derivedRevBase / rank0RevenueUSD : 1;

      const tmpl: FirmSeedTemplate = {
        ...rawTmpl,
        revBase: derivedRevBase,
        debtBase: derivedDebtBase,
        cashBase: derivedCashBase,
        shares: Math.max(1_000_000, Math.round(rawTmpl.shares * 1_000_000 * revenueScaleVsRank0)),
      };

      const ebitda = tmpl.revBase * tmpl.ebitdaMargin;
      const da = tmpl.revBase * 0.05; // 5% depreciation & amortization
      const ebit = Math.max(10, ebitda - da);

      // Revenue-per-employee scales off the region's own generated productivity-per-worker
      // primitive (not a fixed real-world dollar figure) via a structural per-sector
      // capital-intensity multiple, so headcount stays consistent with the population/labor
      // primitives regardless of the region's absolute economic scale.
      // CHAIN-E: these are now the FALLBACK for a firm with no product lines — a bank, an
      // insurer, an asset manager. A firm that produces something has its multiple DERIVED from
      // what it produces, below, where its lines are known. A firm with no recipe has no derivable
      // one, so these stay stated and are the last of this table. **Owner: IND3/IND-R4**, with the
      // other stated financial ratios.
      const revPerEmployeeMultiple: Record<string, number> = {
        Tech: 4.0,
        Financials: 5.0,
        Industrials: 1.5,
        Energy: 7.5,
        Consumer: 1.0,
        Healthcare: 2.0,
        Utilities: 6.0,
      };
      // CHAIN-E — this comment used to end "the multiples follow the recipes, not the other way
      // round", with nothing deriving them. They do now: see the headcount pass after product
      // lines are assigned, which replaces this opening figure for every firm that produces
      // something. What is left here is the opening estimate a firm needs before its lines exist,
      // and the permanent value only for firms that never get any.
      const revPerEmployee = regionProductivityPerCapita * (revPerEmployeeMultiple[tmpl.sector] ?? 2.5);
      const employeeCount = Math.max(100, Math.round(tmpl.revBase / revPerEmployee));
      
      const interestRate = 0.045;
      const interestExpense = Math.max(1, tmpl.debtBase * interestRate);
      const taxRate = 0.21;
      const netIncome = Math.max(5, (ebit - interestExpense) * (1 - taxRate));
      const eps = Number((netIncome / tmpl.shares).toFixed(2));
      

      const leverage = Number((tmpl.debtBase / Math.max(1, ebitda)).toFixed(2));
      const interestCoverage = Number((ebit / interestExpense).toFixed(2));
      
      const capex = Math.round(tmpl.revBase * 0.06);
      const maintenanceCapex = Math.round(capex * 0.6); // maintenance is the majority baseline for a mature company at generation
      const growthCapex = capex - maintenanceCapex;

      const sectorConfig = SECTOR_BENCHMARKS[tmpl.sector];
      // Open the market at the price the market itself would set (§7.4: seed shape = engine
      // shape). The old `eps x sector basePE` capitalised earnings at ~1.5% net of growth while
      // every holder in 07e's auction capitalises them at 4-10%, so week 1 opened ~4x above any
      // real bid and the whole market spent ten weeks falling at its damping limit to get back.
      const seedGrossPPEUSD = tmpl.revBase * (SECTOR_PPE_INTENSITY[tmpl.sector] ?? DEFAULT_PPE_INTENSITY) / (1 - INITIAL_ACCUM_DEPRECIATION_FRACTION);
      const seedNetPPEUSD = seedGrossPPEUSD * (1 - INITIAL_ACCUM_DEPRECIATION_FRACTION);
      const stockPrice = Number(fairValuePerShare({
        annualEarningsUSD: netIncome,
        sharesOutstanding: tmpl.shares,
        // Book equity at the seed is the same identity the first filed balance sheet computes.
        bookEquityUSD: derivedCashBase + tmpl.revBase * 0.08 * 0.6 + seedNetPPEUSD - (tmpl.revBase * 0.08 * 0.4 + derivedDebtBase),
        netInvestmentRate: (growthCapex - seedGrossPPEUSD / (SECTOR_PPE_USEFUL_LIFE_YEARS[tmpl.sector] ?? 12)) / Math.max(1, seedNetPPEUSD),
        riskFreeRate: regionPolicyRate,
        beta: tmpl.beta,
        holderRequiredReturn: REPRESENTATIVE_HOLDER_REQUIRED_RETURN,
      }).toFixed(2));
      
      const oasSpreadBps = RATING_OAS_SPREADS[tmpl.initialRating].baseBps;
      const cdsSpreadBps = oasSpreadBps + Math.floor(random() * 10 - 5);
      
      const historicalPrices: number[] = [stockPrice];
      const marketCap = tmpl.shares * stockPrice;

      // Real PP&E seed: sized off this company's own production scale (sector capital
      // intensity x revenue), not off its debt — debt is a financing choice, unrelated to what
      // the asset side of the balance sheet actually is.
      const ppeIntensity = SECTOR_PPE_INTENSITY[tmpl.sector] ?? DEFAULT_PPE_INTENSITY;
      const initialGrossPPEUSD = tmpl.revBase * ppeIntensity / (1 - INITIAL_ACCUM_DEPRECIATION_FRACTION);
      const initialAccumulatedDepreciationUSD = initialGrossPPEUSD * INITIAL_ACCUM_DEPRECIATION_FRACTION;

      // Real debt tranches (with genuine maturities) generated once and reused for both the
      // seed snapshots' short/long-term split and the company's own capital structure — so a
      // freshly-generated company's "current portion of long-term debt" reflects its actual
      // ladder rather than a flat 15% guess.
      const debtTranches = generateDebtTranches(tmpl.ticker, tmpl.debtBase, tmpl.initialRating, regionPolicyRate, tmpl.rank);
      const initialShortTermDebtUSD = debtTranches.filter(t => t.maturityWeek <= 52).reduce((s, t) => s + t.principalUSD, 0);
      // Real per-tranche interest from the same ladder, not a flat spread-over-totalDebt guess.
      const initialAnnualInterest = debtTranches.reduce((s, t) => s + (t.rateType === 'FIXED'
        ? t.principalUSD * (t.couponRate ?? 0.05)
        : t.principalUSD * (regionPolicyRate + (t.floatingMarginBps ?? 200) / 10000)), 0);

      const snapQ1 = buildQuarterlyFundamentalSnapshot(-3, "Q1 '25", 'Mar 31, 2025', tmpl.revBase * 0.94, ebitda * 0.93, netIncome * 0.91, eps * 0.92, tmpl.cashBase * 0.95, tmpl.debtBase * 1.02, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, undefined, 0, 0, 0, initialGrossPPEUSD, initialAccumulatedDepreciationUSD, undefined, undefined, initialShortTermDebtUSD, initialAnnualInterest);
      const snapQ2 = buildQuarterlyFundamentalSnapshot(-2, "Q2 '25", 'Jun 30, 2025', tmpl.revBase * 0.96, ebitda * 0.95, netIncome * 0.94, eps * 0.95, tmpl.cashBase * 0.97, tmpl.debtBase * 1.01, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ1, 0, 0, 0, initialGrossPPEUSD, initialAccumulatedDepreciationUSD, undefined, undefined, initialShortTermDebtUSD, initialAnnualInterest);
      const snapQ3 = buildQuarterlyFundamentalSnapshot(-1, "Q3 '25", 'Sep 30, 2025', tmpl.revBase * 0.98, ebitda * 0.97, netIncome * 0.97, eps * 0.98, tmpl.cashBase * 0.99, tmpl.debtBase * 1.00, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ2, 0, 0, 0, initialGrossPPEUSD, initialAccumulatedDepreciationUSD, undefined, undefined, initialShortTermDebtUSD, initialAnnualInterest);
      const snapQ4 = buildQuarterlyFundamentalSnapshot(1, "Q4 '25", 'Dec 31, 2025', tmpl.revBase, ebitda, netIncome, eps, tmpl.cashBase, tmpl.debtBase, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ3, 0, 0, 0, initialGrossPPEUSD, initialAccumulatedDepreciationUSD, undefined, undefined, initialShortTermDebtUSD, initialAnnualInterest);

      const historicalFundamentals = [snapQ1, snapQ2, snapQ3, snapQ4];

      const quotedMarginBps = Math.round(oasSpreadBps * 0.85 + 35);
      const discountMarginBps = Math.round(oasSpreadBps * 0.85);
      const loanRef = region === 'USA' ? 'SOFR' : region === 'EUR' ? 'EURIBOR' : region === 'UK' ? 'SONIA' : 'TONA';
      const earningsWeekModulo = (companies.length % 13) + 1;
      
      const alphaEps = Number((eps * 0.97).toFixed(2));
      const betaEps = Number((eps * 1.01).toFixed(2));
      const gammaEps = Number((eps * 1.06).toFixed(2));
      const consensusEps = Number(((alphaEps + betaEps + gammaEps) / 3).toFixed(2));
      
      const alphaRev = Number((tmpl.revBase * 0.98).toFixed(1));
      const betaRev = Number((tmpl.revBase * 1.01).toFixed(1));
      const gammaRev = Number((tmpl.revBase * 1.05).toFixed(1));
      const consensusRev = Number(((alphaRev + betaRev + gammaRev) / 3).toFixed(1));

      let financialStatementProfile: FinancialStatementProfile = 'STANDARD_OPERATING';
      if (tmpl.sector === 'Banks') financialStatementProfile = 'BANK';
      else if (tmpl.institutionalRole === 'INSURER') financialStatementProfile = 'INSURER';
      else if (tmpl.institutionalRole === 'ASSET_MANAGER' || tmpl.institutionalRole === 'PENSION_FUND' || tmpl.institutionalRole === 'HEDGE_FUND') financialStatementProfile = 'ASSET_MANAGER';
      else if ((tmpl.sector as string) === 'RealEstate' || (tmpl as any).producedCommodityId === 'commercial_construction') financialStatementProfile = 'REIT';
      
      const company: Company = {
        financialStatementProfile,
        technicalReservesUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase * 4 : undefined,
        insurancePremiumsWrittenUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase : undefined,
        insuranceClaimsPaidUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase * 0.70 : undefined,
        // A hedge fund earns the same fee dollars off roughly a third of the assets: a 2-and-20
        // load is ~3x a long-only manager's flat fee, so the same revenue base implies far less
        // AUM. Modelled as the same fee-revenue profile with the real fee/AUM ratio inverted.
        aumUSD: financialStatementProfile === 'ASSET_MANAGER' ? tmpl.revBase * (tmpl.institutionalRole === 'HEDGE_FUND' ? 20 : 60) : undefined,
        managementFeeRate: financialStatementProfile === 'ASSET_MANAGER' ? (tmpl.institutionalRole === 'HEDGE_FUND' ? 0.0225 : 0.0075) : undefined,
        id: `${region}_${tmpl.ticker}`,
        ticker: tmpl.ticker,
        name: tmpl.name,
        region,
        sector: tmpl.sector,
        // GUARD: the seeded universe is the LISTED universe, and it has always relied on
        // `undefined` reading as PUBLIC. `isPubliclyListed` throws on a missing status now, so
        // the state every one of these firms is actually in is written down.
        listingStatus: 'PUBLIC',
        
        baselineAnnualRevenue: tmpl.revBase, annualRevenue: tmpl.revBase,
        employeeCount, previousEmployeeCount: employeeCount, baselineEmployeeCount: employeeCount,
        ebitda,
        baselineEbitdaMargin: ebitda / Math.max(1, tmpl.revBase),
        ebit,
        netIncome,
        eps,
        sharesOutstanding: tmpl.shares,
        cash: tmpl.cashBase,
        totalDebt: tmpl.debtBase,
        currentLiabilities: Math.round(tmpl.debtBase * 0.25 + tmpl.revBase * 0.08),
        debtTranches,
        capex,
        grossPPEUSD: initialGrossPPEUSD,
        accumulatedDepreciationUSD: initialAccumulatedDepreciationUSD,
        maintenanceCapex,
        growthCapex,
        baselineGrowthCapexToRevenueRatio: growthCapex / Math.max(1, tmpl.revBase),
        maintenanceShortfallStreak: 0,
        executionQuality: 1.0,
        occupationMixDrift: {},
        historicalFundamentals,
        
        earningsWeekModulo,
        lastEarningsReportWeek: 0,
        reportedThisWeek: false,
        dealerConsensus: {
          alpha: { eps: alphaEps, revenue: alphaRev },
          beta: { eps: betaEps, revenue: betaRev },
          gamma: { eps: gammaEps, revenue: gammaRev },
          consensusEps,
          consensusRevenue: consensusRev,
        },
        lastEarningsSurprisePct: 0,
        lastManagementCommentary: 'Management reaffirmed structural operating margins and disciplined leverage management.',
        
        // Only a company with floating-rate debt has a loan to quote. See Company.leveragedLoan.
        leveragedLoan: debtTranches.some((t) => t.rateType === 'FLOATING')
          ? {
              quotedMarginBps,
              referenceBenchmark: loanRef,
              pricePar: 98.75,
              discountMarginBps,
              tenorYears: 5,
              seniority: 'Senior Secured First Lien',
              recoveryRate: 0.65,
            }
          : undefined,
        
        leverage,
        interestCoverage,
        creditRating: tmpl.initialRating,
        ratingHistory: [tmpl.initialRating],
        isDefaulted: false,
        recoveryRate: 0.40,
        baselineRecoveryRate: 0.40,
        
        stockPrice,
        historicalPrices,
        forwardPE: eps > 0 ? Number((stockPrice / eps).toFixed(2)) : sectorConfig.basePE,
        marketCap: Number((stockPrice * tmpl.shares).toFixed(0)),
        dividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        baselineDividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        bankMarketShare: tmpl.bankMarketShare,
        // Wall Street Phase 1: this bank's own real starting balance sheet — its share of the
        // region's initial aggregate, not a value it will ever re-derive from that aggregate
        // again (02b-bank-diversification.ts evolves it independently from here on).
        bankBalanceSheet: tmpl.sector === 'Banks' ? (() => {
          const seedReg = initialRegions[region];
          const bs = seedReg?.bankingSector;
          const share = tmpl.bankMarketShare ?? 0.25;
          if (!bs) return undefined;
          return {
            businessLoanBookUSD: bs.businessLoanBookUSD * share,
            consumerLoanBookUSD: bs.consumerLoanBookUSD * share,
            depositsUSD: bs.depositsUSD * share,
            sovereignBondHoldingsUSD: bs.sovereignBondHoldingsUSD * share,
            cashReservesUSD: bs.cashReservesUSD * share,
            bankEquityUSD: bs.bankEquityUSD * share,
            bankCapitalRatio: bs.bankCapitalRatio,
            netInterestMarginPct: bs.netInterestMarginPct,
            loanLossProvisionRateAnnualPct: bs.loanLossProvisionRateAnnualPct,
            creditConditionsIndex: bs.creditConditionsIndex,
            centralBankReservesUSD: bs.centralBankReservesUSD * share,
            moneySupplyM2USD: bs.moneySupplyM2USD * share,
            itemizedHoldings: [],
            srfBorrowingUSD: 0,
            onRrpLendingUSD: 0,
            corpBondDealerInventory: [],
            sovereignBondHoldingsByTenor: {},
            sovBondDealerInventory: [],
            loanDealerInventory: [],
            repoLentUSD: 0,
            repoBorrowedUSD: 0,
            repoEncumberedCollateralUSD: 0,
            businessLoans: [],
            householdLoans: [],
            wholesaleFundingUSD: 0,
            corporateDepositsUSD: 0,
          };
        })() : undefined,
        // Persistent idiosyncratic risk: smaller/higher-rank banks run a real, generated risk
        // premium (concentrated commercial exposure is a genuine real-world pattern for
        // smaller/regional banks), not a random re-roll each week — seeded once, here.
        bankRiskFactor: tmpl.sector === 'Banks' ? Number((0.75 + tmpl.rank * 0.18 + (random() - 0.5) * 0.25).toFixed(3)) : undefined,
        isBankEntity: tmpl.sector === 'Banks',
        isInstitutionalEntity: !!tmpl.institutionalRole,
        institutionalEntityType: tmpl.institutionalRole as any,
        institutionalRole: (tmpl.institutionalRole ?? null) as any,
        institutionalMarketShare: tmpl.institutionalMarketShare,
        hedgeFundStrategy: tmpl.hedgeFundStrategy,
        beta: tmpl.beta,
        
        seniorBondYield: 0.05 + oasSpreadBps / 10000,
        oasSpreadBps,
        cdsSpreadBps,
        inputSupplyConstraintFactor: 1.0,
        outputInventoryBySubUnit: {},
        inputInventoryBySubUnit: {},
        recentFulfillmentEMA: 1.0,
        treasuryHoldings: [],
        producedCommodityId: (tmpl as any).producedCommodityId,
      };

      companies.push(company);
    });
    // Flat per region rather than scaled to region size, matching SECTOR_FIRM_COUNT's
    // rationale in bootstrap/firms.ts: this pads out the *number* of tradable names available
    // per region (breadth of the roster a player can pick from), not the region's economic
    // scale, which is already carried by each firm's own (region-scaled) revenue.
    const targetCount = 200;
    // Wall Street Phase 1 finding: a bank/institutional entity's marketShare (and, for banks,
    // bankBalanceSheet) is a real, calibrated figure meant to describe ONE specific named
    // institution — cloning it via `...parent` for roster padding duplicates that exact figure
    // under a new ticker rather than scaling it down (unlike revenue/debt/cash, which the clone
    // loop below does scale), so the SUM of bankMarketShare/institutionalMarketShare across all
    // "banks"/institutions in a region silently grows past 1.0 every time a padding clone picks
    // one as its parent. BANKS_PER_REGION/institutional counts are deliberately exact (4 banks,
    // 3 specialty institutions) — unlike generic sector companies, they aren't meant to be
    // padded out for roster depth, so excluded here rather than patched post hoc.
    const baseCompanies = companies.filter(c => c.region === region && !c.isBankEntity && !c.institutionalRole);
    // Reuse the same globally-shared sets as seed generation (not a fresh rebuild from
    // `companies`) — a per-call rebuild here would still miss a subsequent region's seed
    // tickers colliding with this region's padding clones, since seed generation and padding
    // used to track uniqueness in two disconnected sets.
    while (companies.filter(c => c.region === region).length < targetCount) {
      const parent = baseCompanies[Math.floor(random() * baseCompanies.length)];
      const newTicker = generateUniqueTicker(existingSeedTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingSeedNames);
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      
      const newCompany = {
        financialStatementProfile: parent.financialStatementProfile,
        technicalReservesUSD: parent.technicalReservesUSD,
        aumUSD: parent.aumUSD,
        managementFeeRate: parent.managementFeeRate,
        insurancePremiumsWrittenUSD: parent.insurancePremiumsWrittenUSD,
        insuranceClaimsPaidUSD: parent.insuranceClaimsPaidUSD,

        ...parent,
        id: parent.id + "-" + random().toString(36).substring(2, 9),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        grossPPEUSD: parent.grossPPEUSD * revenueScale,
        accumulatedDepreciationUSD: parent.accumulatedDepreciationUSD * revenueScale,
        employeeCount: newEmployeeCount,
        historicalPrices: [...parent.historicalPrices],
        historicalFundamentals: [...parent.historicalFundamentals]
      };
      companies.push(newCompany as any);
    }

  });

  
  // G1: Assign Product Lines & Category Market Share — dealt against the demand this seed has
  // so far, and dealt AGAIN by `simulation/initialization.ts` once the authoritative demand
  // vector (real procurement, real firm capex) exists. See the function's own doc.
  dealProductLinesAndHeadcount(companies, (region, unitId) =>
    Number((initialRegions[region]?.categoryDemand as any)?.[unitId]?.demandLevelUSD) || 0);

  return companies;
}


/**
 * SUPPLY/CHAIN — DEAL THE PRODUCER BASE AGAINST THE DEMAND THE ECONOMY WILL ACTUALLY STATE.
 *
 * This pass decides which sub-units each firm produces, what share of each category it holds, and
 * — through value added — how many people it employs. It is weighted by `demandLevelUSD`, so the
 * producer base converges on demand's own shape and a new sub-unit in the registry gets producers
 * with no generator edit (BP1b, rule 17).
 *
 * **It is exported because it has to run TWICE, and that closes a fixed point the plan called
 * genuine.** Category demand is seeded three times (§7.120): a placeholder in
 * `macro/initialization.ts` off GDP shares, then the authoritative one in
 * `simulation/initialization.ts` which runs after the firms exist and can therefore use the real
 * procurement budget and the firms' OWN capex as `I`. The firm universe was dealt against the
 * placeholder and the demand vector was then overwritten — so the capital-goods sub-units were
 * dealt the producers a GDP-share investment number implied, and then asked to supply the real
 * one. Measured: 1.29x more capex bid than built for, four of five categories in permanent
 * shortage at 65-174% over base price (§7.168, §7.178).
 *
 * **The coupling is one-directional, which is why one re-deal converges exactly.** A firm's SIZE
 * — its revenue, its PP&E, and therefore its capex — is set before any line is dealt, so `I` does
 * not move when the lines are re-dealt. Re-dealing against the authoritative vector is a fixed
 * point reached in one pass, not an iteration. It also draws no RNG: the deal is a deterministic
 * greedy over a sorted list, so running it twice relabels nothing (rule 10).
 */
export function dealProductLinesAndHeadcount(
  companies: Company[],
  demandLevelUSD: (region: RegionId, subUnitId: string) => number
): void {
  const categories: string[] = [];
  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      categories.push(su.unitId);
    });
  });

  const regionMap = new Map<string, Company[]>();
  companies.forEach(c => {
    if (!regionMap.has(c.region)) regionMap.set(c.region, []);
    regionMap.get(c.region)!.push(c);
  });

  regionMap.forEach((regionComps, _regionId) => {
    const sectorComps = new Map<string, Company[]>();
    regionComps.forEach(c => {
      if (!sectorComps.has(c.sector)) sectorComps.set(c.sector, []);
      sectorComps.get(c.sector)!.push(c);
    });

    sectorComps.forEach((comps, sector) => {
      comps.sort((a, b) => b.baselineAnnualRevenue - a.baselineAnnualRevenue);

      // BP1b (rule 17): lines are DEALT from the registry, weighted by this region's own seeded
      // demand — supply seeded to meet the demand the economy states (§7.4), so a new sub-unit
      // in the registry gets producers with no generator edit. Deterministic greedy: each firm
      // (largest first) takes the sub-units its sector currently under-serves most, so every
      // category's producer base converges to its demand share and coverage is an outcome.
      const sectorSubUnits = (subUnitsByProducingSector()[sector as ProducingSector] ?? [])
        .map(({ industry, su }) => ({
          industry, unitId: su.unitId,
          weightUSD: Math.max(0, demandLevelUSD(_regionId as RegionId, su.unitId)),
        }))
        .filter(x => x.weightUSD > 0);
      const totalWeightUSD = sectorSubUnits.reduce((a, x) => a + x.weightUSD, 0);
      const assignedUSD = new Map<string, number>();
      let assignedTotalUSD = 0;

      comps.forEach((c) => {
        let lines: any[] = [];

        // A producedCommodityId-tagged company was seeded to be a real producer of one modeled
        // commodity — it carries the matching line (from the registry's own linkage) or it never
        // shows up as a real supplier in 04/05 despite being a named seller on the trading desk.
        const commodityLinkage = c.producedCommodityId ? COMMODITY_CATEGORY_LINKAGE[c.producedCommodityId] : undefined;
        if (commodityLinkage) {
          const parent = (Object.entries(INDUSTRY_REGISTRY) as [Industry, { subUnits: { unitId: string }[] }][])
            .find(([, spec]) => spec.subUnits.some(su => su.unitId === commodityLinkage.subUnitId));
          if (parent) {
            lines = [{ industry: parent[0], subUnitId: commodityLinkage.subUnitId, revenueShare: 1.0, competitiveness: 0 }];
          }
        }

        // IND-R2: a financial firm gets NO product line. It used to get an `enterprise_software`
        // one as a revenue proxy, and a product line is what registers a supplier in stage 05's
        // index — so 16 banks and 24 institutions were offering enterprise software into the
        // goods auction, the category's shares summed to 646% against 400% for every other, and
        // the real software firms were diluted ~62%. It was incoherent besides: a bank routes to
        // `bankProfile`, which never accounts for producing anything, so the supply was real to
        // the auction and invisible to the producer's own P&L. Financial revenue comes from the
        // profiles, which is what they are for.
        if (lines.length === 0 && sectorSubUnits.length > 0 && totalWeightUSD > 0
            && sector !== 'Financials' && sector !== 'Banks') {
          const k = Math.min(3, sectorSubUnits.length);
          const scored = sectorSubUnits.map((x, idx) => ({
            x, idx,
            deficitUSD: (x.weightUSD / totalWeightUSD) * (assignedTotalUSD + c.baselineAnnualRevenue) - (assignedUSD.get(x.unitId) ?? 0),
          }));
          scored.sort((a, b) => (b.deficitUSD - a.deficitUSD) || (a.idx - b.idx));
          const picked = scored.slice(0, k);
          const pickedWeightUSD = picked.reduce((a, e) => a + e.x.weightUSD, 0) || 1;
          lines = picked.map(e => ({
            industry: e.x.industry, subUnitId: e.x.unitId,
            revenueShare: e.x.weightUSD / pickedWeightUSD, competitiveness: 0,
          }));
          picked.forEach(e => assignedUSD.set(e.x.unitId,
            (assignedUSD.get(e.x.unitId) ?? 0) + (e.x.weightUSD / pickedWeightUSD) * c.baselineAnnualRevenue));
          assignedTotalUSD += c.baselineAnnualRevenue;
        }

        c.productLines = lines;
      });
    });

    // Compute category market shares and initialize Region category demand
    const catTotals: Record<string, number> = {};
    categories.forEach(cat => catTotals[cat] = 0);

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        catTotals[line.subUnitId] += line.revenueShare * c.annualRevenue;
      });
    });

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        const catTotal = catTotals[line.subUnitId];
        line.categoryMarketShare = catTotal > 0 ? (line.revenueShare * c.annualRevenue) / catTotal : 0;
      });
      let maxLine: any = null;
      (c.productLines || []).forEach(line => {
        if (!maxLine || line.revenueShare > maxLine.revenueShare) {
          maxLine = line;
        }
      });
      if (maxLine) {
        c.primarySubUnitId = maxLine.subUnitId;
      }

      // CHAIN-E — HEADCOUNT IS VALUE ADDED OVER PRODUCTIVITY, and now it can be.
      //
      // `regionProductivityPerCapita` is value added per worker; `annualRevenue` is GROSS output.
      // Dividing one by the other needs the ratio between them, which is exactly
      // `1 / (1 - recipe intensity)` for what this firm actually makes — so the seven stated
      // per-sector multiples above were a guess at a number the registry now knows per product
      // (§7.117). Deriving it makes employment equal `Σ line revenue x (1 - a_line) /
      // productivity` — the firm's real value added over output per worker — so total employment
      // is pinned to what the economy PRODUCES rather than to gross output through a separate
      // multiple, and the two can no longer disagree.
      //
      // This is the half that makes CHAIN-E's demand change safe: intermediate demand raises
      // every producer's revenue, and without this headcount would rise with it and put
      // employment above the labour force (§6.1 records that exact failure from an earlier
      // attempt). Revenue rises, value added does not, and employment follows value added.
      const lines = c.productLines || [];
      if (lines.length > 0) {
        const productivityPerWorkerUSD = getRegionProductivityPerCapitaUSD(_regionId as RegionId);
        const valueAddedUSD = lines.reduce((sum, line) =>
          sum + c.annualRevenue * (line.revenueShare ?? 1) * (1 - recipeIntensityOf(line.subUnitId)), 0);
        c.employeeCount = Math.max(100, Math.round(valueAddedUSD / Math.max(1, productivityPerWorkerUSD)));
        c.baselineEmployeeCount = c.employeeCount;
      }
    });
  });
}


// HC7: `generateIPOCompany` is DELETED. It conjured a company out of a category's demand
// growth — a firm that had never existed, with fabricated fundamentals, appearing already
// public. An IPO is now what it is in reality: an existing private firm choosing to list,
// priced as a real WS8 equity offering in 07e's book (stages/pe-lifecycle.ts). Firm creation
// has exactly one path — born small in an SME pool (HC8), carved into a named private firm,
// public only by listing.

// ---------------------------------------------------------------------------------------------
// HC Wave 1 (HC1): named private firms — see bootstrap/private-firms.ts for the carve logic.
// One firm model: these are full Company objects with listingStatus 'PRIVATE'; the only fields
// that differ are the genuinely public-only ones (no traded equity, no consensus theater).
// HC8 reuses this same generator for BIRTHS — a firm born out of an SME pool is generated
// exactly like a Wave 1 carve, because it is one.
// ---------------------------------------------------------------------------------------------


export function generatePrivateCompanies(
  region: RegionId,
  seeds: PrivateFirmSeed[],
  regionPolicyRate: number,
  existingTickers: Set<string>,
  existingNames: Set<string>
): Company[] {
  return seeds.map((seed, idx) => {
    // SEG-A: a born firm's sector is its INDUSTRY's sector, straight from the registry — the
    // five-bucket map this replaces collapsed the tier into three sectors and filed healthcare
    // under "Consumer" as the "closest fit".
    const sector = INDUSTRY_REGISTRY[seed.industry].sector as Sector;
    const ticker = generateUniqueTicker(existingTickers);
    const name = generateUniqueName(`${region} ${sector}`, sector, existingNames);
    const revBase = Math.round(seed.annualRevenueUSD);
    const ebitda = Math.round(revBase * seed.ebitdaMargin);
    const debtBase = Math.round(ebitda * seed.leverage);
    // A provisional rating seeds the ladder's coupon economics; the REAL rating below comes from
    // the resulting real leverage and coverage, same model as everyone else.
    const provisionalRating: CreditRating = seed.leverage > 4.5 ? 'B' : seed.leverage > 3 ? 'BB' : 'BBB';
    const debtTranches = generateDebtTranches(ticker, debtBase, provisionalRating, regionPolicyRate, 3 + (idx % 5));
    const annualInterest = debtTranches.reduce((a, t) => a + (t.rateType === 'FIXED'
      ? t.principalUSD * (t.couponRate ?? 0.05)
      : t.principalUSD * (regionPolicyRate + (t.floatingMarginBps ?? 200) / 10000)), 0);
    const da = revBase * 0.045;
    const ebit = Math.max(1, ebitda - da);
    const coverage = ebit / Math.max(0.5, annualInterest);
    const rating = determineCreditRating(debtBase / Math.max(1, ebitda), coverage);
    const capex = Math.round(revBase * 0.05);
    const maintenanceCapex = Math.round(capex * 0.6);
    const ppeIntensity = SECTOR_PPE_INTENSITY[sector] ?? 0.5;
    const grossPPEUSD = Math.round(revBase * ppeIntensity / 0.65);

    return {
      id: `${region}_PRV_${ticker}`,
      ticker, name, region, sector,
      listingStatus: 'PRIVATE',
      // HC8: the pool this firm was carved from — births read it to find the right pool,
      // and a carve must always know which aggregate it came out of.
      smePoolIndustry: seed.industry,
      // Founder/family owned until HC4 assigns real PE sponsors to the sponsorStyle cohort —
      // the leverage is already theirs, the owner arrives with the PE entities.
      ownership: { founderPct: 1.0 },
      baselineAnnualRevenue: revBase, annualRevenue: revBase,
      previousEmployeeCount: seed.employeeCount, employeeCount: seed.employeeCount,
      baselineEmployeeCount: seed.employeeCount,
      ebitda, baselineEbitdaMargin: seed.ebitdaMargin, ebit,
      netIncome: Math.round((ebit - annualInterest) * 0.78),
      eps: 0,
      // No traded equity: private shares exist (founders hold them) but carry no market price.
      // Zero here is "unquoted", not "worthless" — every consumer of stockPrice/marketCap must
      // gate on isPubliclyListed, and the engine's gates run through ctx.prevActiveFirms.
      // A private company has NO traded share register: no share count, no price, no market cap,
      // and therefore no earnings PER SHARE. The fabricated 1,000,000 was a made-up number sitting
      // where a real one belongs — and a per-share figure that did not divide by it (`eps: 0`).
      // A real listing creates the registry for the first time (`postIssueSharesOutstanding`,
      // HC7), which is the only moment a share count should come into existence.
      sharesOutstanding: 0, stockPrice: 0, marketCap: 0,
      historicalPrices: [], forwardPE: 0,
      cash: Math.round(ebitda * 0.6),
      totalDebt: debtBase,
      currentLiabilities: Math.round(debtBase * 0.2 + revBase * 0.06),
      debtTranches,
      capex, maintenanceCapex, growthCapex: capex - maintenanceCapex,
      baselineGrowthCapexToRevenueRatio: (capex - maintenanceCapex) / Math.max(1, revBase),
      maintenanceShortfallStreak: 0,
      grossPPEUSD, accumulatedDepreciationUSD: Math.round(grossPPEUSD * 0.35),
      executionQuality: 1.0,
      occupationMixDrift: {},
      creditRating: rating, ratingHistory: [rating],
      isDefaulted: false,
      // Seeded from the same rating-keyed primitive the public bootstrap uses, so the name's
      // first real clearing week (HC2) starts from a defensible level instead of zero and the
      // weekly damper does not spend months walking it up from nothing.
      oasSpreadBps: RATING_OAS_SPREADS[rating].baseBps,
      cdsSpreadBps: RATING_OAS_SPREADS[rating].baseBps,
      seniorBondYield: 0,
      dividendYield: 0, baselineDividendYield: 0,
      beta: 1.0,
      recoveryRate: 0.40, baselineRecoveryRate: 0.40,
      // Goods-market participation arrives with HC3's conservation-checked handover; until then
      // the segments keep carrying this revenue in stage 05 and this array stays empty.
      // SEG-D: a BORN firm enters the world able to sell — its pool's own product mix, passed
      // in by the birth (pe-lifecycle.ts). It used to arrive with no product lines at all: a
      // company that could not participate in any auction, in any category, ever.
      //
      // The COLD-START tier deliberately still gets none. That is HC3b's call, made with a
      // measurement (injecting the whole named private tier's supply into markets sized for
      // public supply cost 10-22% of growth), and it is not SEG's to reverse in passing.
      productLines: (() => {
        const mix = seed.productMixBySubUnit;
        const mixTotalUSD = mix ? Object.values(mix).reduce((a, v) => a + Math.max(0, v), 0) : 0;
        if (!mix || mixTotalUSD <= 0) return [];
        return Object.entries(mix)
          .filter(([, v]) => v > 0)
          .map(([subUnitId, v]) => ({
            industry: seed.industry, subUnitId,
            revenueShare: v / mixTotalUSD,
            competitiveness: 0,
            // Set against the real market by the caller once the firm exists; a line with an
            // undefined share reads as NaN to every consumer of it.
            categoryMarketShare: 0,
          }));
      })(),
      leverage: debtBase / Math.max(1, ebitda),
      interestCoverage: coverage,
      // No quarterly reporting apparatus: a private firm does not report, is not covered, and
      // issues no guidance. The architecture said this from the start and the generator handed it
      // over anyway. An absent `earningsWeekModulo` is what turns stage 08's reporting path off.
      historicalFundamentals: [],
      leveragedLoan: undefined, // 07d opens a real quote when its floating debt enters the market (HC2)
      institutionalRole: null,
      inputSupplyConstraintFactor: 1.0,
      outputInventoryBySubUnit: {}, inputInventoryBySubUnit: {},
      recentFulfillmentEMA: 1.0,
      treasuryHoldings: [],
    } as unknown as Company;
  });
}
