import { Company, CreditRating, RegionId, Sector, DebtTranche, FundamentalSnapshot, ProductCategory, QuarterlyIncomeStatement, QuarterlyBalanceSheet, INDUSTRY_SUBUNITS, Industry, FinancialStatementProfile } from '../types';
import { RATING_OAS_SPREADS, SECTOR_BENCHMARKS, priceEquity } from './pricing';
import { getInitialRegions } from './macro/initialization';
import { FirmSeedTemplate, generateFirmSeeds, generateUniqueName, generateUniqueTicker } from './bootstrap/firms';
import { getRegionProductivityPerCapitaUSD } from './bootstrap/population';

export const FIXED_SHARE_BY_RATING: Record<CreditRating, number> = {
  AAA: 0.90, AA: 0.85, A: 0.75, BBB: 0.60, BB: 0.40, B: 0.20, CCC: 0.10, D: 0,
};

export function getCategoryDemandSeedUSD(category: string, region: RegionId): number {
  const income = getInitialRegions()[region]?.estimatedHouseholdIncomeUSD ?? 10_000_000_000_000;
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

export function deriveInitialRevenueUSD(
  _category: ProductCategory,
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
  return regionCategoryDemandSeedUSD * (rankWeight / totalRankWeight) * 0.35;
}


// generateUniqueName / generateUniqueTicker now live in ./bootstrap/firms (imported above)
// so the padding-clone loop below and the generative firm seeds share one implementation.

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
): FundamentalSnapshot {
  const revQ = annualRevenue / 4;
  const ebitdaQ = ebitda / 4;
  const ebitdaMargin = ebitda / Math.max(1, annualRevenue);
  const cogs = revQ * (1 - ebitdaMargin - 0.12);
  const sgaExpense = revQ * 0.12;
  const grossProfit = revQ - cogs;
  const daQuarterly = Math.max(1, (maintenanceCapex + growthCapex) / 4 * 0.8);
  const interestExpense = totalDebt * (oasSpreadBps / 10000 + 0.03) / 4;
  const pretaxIncome = ebitdaQ - daQuarterly - interestExpense;
  const taxExpense = Math.max(0, pretaxIncome * 0.21);
  const netIncQ = netIncome / 4;
  const epsQ = eps / 4;

  const incomeStatement: QuarterlyIncomeStatement = {
    revenue: revQ,
    cogs,
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
  const netPPE = totalDebt * 0.7;
  const totalAssets = cash + accountsReceivable + finishedGoodsInventoryUSD + netPPE;
  const shortTermDebt = totalDebt * 0.15;
  const longTermDebt = totalDebt * 0.85;
  const totalLiabilities = accountsPayable + totalDebt;
  const shareholdersEquity = totalAssets - totalLiabilities;

  const balanceSheet: QuarterlyBalanceSheet = {
    cash,
    treasuryHoldingsUSD,
    accountsReceivable,
    finishedGoodsInventoryUSD,
    netPPE,
    totalAssets,
    accountsPayable,
    shortTermDebt,
    longTermDebt,
    totalLiabilities,
    shareholdersEquity,
  };

  const prevWC = prevSnapshot
    ? prevSnapshot.balanceSheet.accountsReceivable + prevSnapshot.balanceSheet.finishedGoodsInventoryUSD - prevSnapshot.balanceSheet.accountsPayable
    : workingCapitalUSD;
  const currentWC = accountsReceivable + finishedGoodsInventoryUSD - accountsPayable;
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

function generateDebtTranches(ticker: string, debtBase: number, initialRating: CreditRating, policyRate: number = 0.045): DebtTranche[] {
  const fixedShare = FIXED_SHARE_BY_RATING[initialRating] ?? 0.5;
  const trancheWeights = [0.35, 0.35, 0.30];
  const maturityWeeks = [260, 520, 780]; // 5, 10, 15 years out
  const baseSpreadBps = RATING_OAS_SPREADS[initialRating]?.baseBps ?? 150;
  const basePolicyRate = policyRate;
  let cumulativePrincipalAssigned = 0;
  return maturityWeeks.map((maturityWeek, i) => {
    const principalUSD = debtBase * trancheWeights[i];
    // Deterministic rule: assign FIXED as long as cumulative principal assigned so far is still under the fixedShare target.
    const isFixed = cumulativePrincipalAssigned < fixedShare * debtBase;
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
        }
      : {
          id: `${ticker}-T${i + 1}`,
          principalUSD,
          rateType: 'FLOATING' as const,
          floatingMarginBps: Math.round(baseSpreadBps * 0.85),
          originationWeek: 0,
          maturityWeek,
          seniority: 'SENIOR' as const,
        };
  });
}


const SUBUNIT_TO_CATEGORY: Record<string, string> = {
  food_beverage: 'StapleHousehold',
  household_essentials: 'StapleHousehold',
  apparel_retail: 'StandardHousehold',
  home_furnishings: 'StandardHousehold',
  consumer_devices: 'StandardHousehold',
  consumer_software: 'StandardHousehold',
  passenger_vehicles: 'StandardHousehold',
  residential_construction: 'StandardHousehold',
  luxury_goods: 'LuxuryHousehold',
  media_content: 'LuxuryHousehold',
  heavy_equipment: 'CorporateIndustrial',
  industrial_automation: 'CorporateIndustrial',
  industrial_chemicals: 'CorporateIndustrial',
  agricultural_chemicals: 'CorporateIndustrial',
  specialty_metals: 'CorporateIndustrial',
  refined_products: 'CorporateIndustrial',
  upstream_extraction: 'CorporateIndustrial',
  commercial_aerospace: 'CorporateIndustrial',
  commercial_fleet: 'CorporateIndustrial',
  enterprise_software: 'CorporateTech',
  semiconductors: 'CorporateTech',
  network_infrastructure: 'CorporateTech',
  defense_systems: 'GovernmentDefense',
  pharmaceuticals: 'GovernmentHealthcare',
  medtech_devices: 'GovernmentHealthcare',
  commercial_construction: 'GovernmentInfrastructure',
};

/**
 * Generate the full initial company roster: each region's seed firms come from the
 * generative firms.ts bootstrap module (Pareto-ranked per sector, plus bank/insurer/asset
 * manager/pension-fund specialty roles and commodity producers), then padded out with
 * procedurally scaled clones up to the per-region target count below.
 */
export function generateInitialCompanies(): Company[] {
  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const companies: Company[] = [];

  regions.forEach((region) => {
    const regionPolicyRate = getInitialRegions()[region]?.policyRate ?? 0.045;
    const regionProductivityPerCapita = getRegionProductivityPerCapitaUSD(region);
    let templates: FirmSeedTemplate[] = generateFirmSeeds(region);



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

      const regionDemandSeed = getCategoryDemandSeedUSD(primaryCat, region);
      let derivedRevBase = deriveInitialRevenueUSD(primaryCat, regionDemandSeed, rankInCategory >= 0 ? rankInCategory : 0, totalInCategory || 1);

      if (rawTmpl.sector === 'Banks') {
        const bankShare = rawTmpl.bankMarketShare ?? 0.25;
        const initRegs = getInitialRegions();
        const initReg = initRegs[region];
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
      const revPerEmployeeMultiple: Record<string, number> = {
        Tech: 4.0,
        Financials: 5.0,
        Industrials: 1.5,
        Energy: 7.5,
        Consumer: 1.0,
        Healthcare: 2.0,
        Utilities: 6.0,
      };
      const revPerEmployee = regionProductivityPerCapita * (revPerEmployeeMultiple[tmpl.sector] ?? 2.5);
      const employeeCount = Math.max(100, Math.round(tmpl.revBase / revPerEmployee));
      
      const interestRate = 0.045;
      const interestExpense = Math.max(1, tmpl.debtBase * interestRate);
      const taxRate = 0.21;
      const netIncome = Math.max(5, (ebit - interestExpense) * (1 - taxRate));
      const eps = Number((netIncome / tmpl.shares).toFixed(2));
      

      const leverage = Number((tmpl.debtBase / Math.max(1, ebitda)).toFixed(2));
      const interestCoverage = Number((ebit / interestExpense).toFixed(2));
      
      const sectorConfig = SECTOR_BENCHMARKS[tmpl.sector];
      const stockPrice = Number(priceEquity(eps, sectorConfig.basePE, 0.0, false).toFixed(2));
      
      const oasSpreadBps = RATING_OAS_SPREADS[tmpl.initialRating].baseBps;
      const cdsSpreadBps = oasSpreadBps + Math.floor(Math.random() * 10 - 5);
      
      const historicalPrices: number[] = [stockPrice];
      const marketCap = tmpl.shares * stockPrice;

      const snapQ1 = buildQuarterlyFundamentalSnapshot(-3, "Q1 '25", 'Mar 31, 2025', tmpl.revBase * 0.94, ebitda * 0.93, netIncome * 0.91, eps * 0.92, tmpl.cashBase * 0.95, tmpl.debtBase * 1.02, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap);
      const snapQ2 = buildQuarterlyFundamentalSnapshot(-2, "Q2 '25", 'Jun 30, 2025', tmpl.revBase * 0.96, ebitda * 0.95, netIncome * 0.94, eps * 0.95, tmpl.cashBase * 0.97, tmpl.debtBase * 1.01, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ1);
      const snapQ3 = buildQuarterlyFundamentalSnapshot(-1, "Q3 '25", 'Sep 30, 2025', tmpl.revBase * 0.98, ebitda * 0.97, netIncome * 0.97, eps * 0.98, tmpl.cashBase * 0.99, tmpl.debtBase * 1.00, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ2);
      const snapQ4 = buildQuarterlyFundamentalSnapshot(1, "Q4 '25", 'Dec 31, 2025', tmpl.revBase, ebitda, netIncome, eps, tmpl.cashBase, tmpl.debtBase, 0, 0, tmpl.revBase * 0.02, tmpl.revBase * 0.03, oasSpreadBps, 0.02, marketCap, snapQ3);

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

      const capex = Math.round(tmpl.revBase * 0.06);
      const maintenanceCapex = Math.round(capex * 0.6); // maintenance is the majority baseline for a mature company at generation
      const growthCapex = capex - maintenanceCapex;

      
      let financialStatementProfile: FinancialStatementProfile = 'STANDARD_OPERATING';
      if (tmpl.sector === 'Banks') financialStatementProfile = 'BANK';
      else if (tmpl.institutionalRole === 'INSURER') financialStatementProfile = 'INSURER';
      else if (tmpl.institutionalRole === 'ASSET_MANAGER' || tmpl.institutionalRole === 'PENSION_FUND') financialStatementProfile = 'ASSET_MANAGER';
      else if ((tmpl.sector as string) === 'RealEstate' || (tmpl as any).producedCommodityId === 'commercial_construction') financialStatementProfile = 'REIT';
      
      const company: Company = {
        financialStatementProfile,
        technicalReservesUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase * 4 : undefined,
        insurancePremiumsWrittenUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase : undefined,
        insuranceClaimsPaidUSD: financialStatementProfile === 'INSURER' ? tmpl.revBase * 0.70 : undefined,
        aumUSD: financialStatementProfile === 'ASSET_MANAGER' ? tmpl.revBase * 60 : undefined,
        managementFeeRate: financialStatementProfile === 'ASSET_MANAGER' ? 0.0075 : undefined,
        id: `${region}_${tmpl.ticker}`,
        ticker: tmpl.ticker,
        name: tmpl.name,
        region,
        sector: tmpl.sector,
        
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
        debtTranches: generateDebtTranches(tmpl.ticker, tmpl.debtBase, tmpl.initialRating, regionPolicyRate),
        capex,
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
        
        leveragedLoan: {
          quotedMarginBps,
          referenceBenchmark: loanRef,
          pricePar: 98.75,
          discountMarginBps,
          tenorYears: 5,
          seniority: 'Senior Secured First Lien',
          recoveryRate: 0.65,
        },
        
        leverage,
        interestCoverage,
        creditRating: tmpl.initialRating,
        ratingHistory: [tmpl.initialRating],
        isDefaulted: false,
        recoveryRate: 0.40,
        baselineRecoveryRate: 0.40,
        
        stockPrice,
        historicalPrices,
        forwardPE: sectorConfig.basePE,
        marketCap: Number((stockPrice * tmpl.shares).toFixed(0)),
        dividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        baselineDividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        bankMarketShare: tmpl.bankMarketShare,
        isBankEntity: tmpl.sector === 'Banks',
        isInstitutionalEntity: !!tmpl.institutionalRole,
        institutionalEntityType: tmpl.institutionalRole as any,
        institutionalRole: (tmpl.institutionalRole ?? null) as any,
        institutionalMarketShare: tmpl.institutionalMarketShare,
        beta: tmpl.beta,
        
        seniorBondYield: 0.05 + oasSpreadBps / 10000,
        oasSpreadBps,
        cdsSpreadBps,
        sentiment: 0.0,
        inputSupplyConstraintFactor: 1.0,
        finishedGoodsInventoryUSD: 0,
        inventoryCarryingCostRate: 0.02,
        recentFulfillmentEMA: 1.0,
        treasuryHoldings: [],
        producedCommodityId: (tmpl as any).producedCommodityId,
      };

      companies.push(company);
    });
    const targetCount = 200;
    const baseCompanies = companies.filter(c => c.region === region);
    const existingTickers = new Set(companies.map(c => c.ticker));
    const existingNames = new Set(companies.map(c => c.name));
    while (companies.filter(c => c.region === region).length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      const newTicker = generateUniqueTicker(existingTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingNames);
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + Math.random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      
      const newCompany = {
        financialStatementProfile: parent.financialStatementProfile,
        technicalReservesUSD: parent.technicalReservesUSD,
        aumUSD: parent.aumUSD,
        managementFeeRate: parent.managementFeeRate,
        insurancePremiumsWrittenUSD: parent.insurancePremiumsWrittenUSD,
        insuranceClaimsPaidUSD: parent.insuranceClaimsPaidUSD,

        ...parent,
        id: parent.id + "-" + Math.random().toString(36).substring(2, 9),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        historicalPrices: [...parent.historicalPrices],
        historicalFundamentals: [...parent.historicalFundamentals]
      };
      companies.push(newCompany as any);
    }

  });

  
  // G1: Assign Product Lines & Category Market Share
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
      comps.forEach((c) => {
        let lines: any[] = [];
        
        if (sector === 'Tech') {
          lines = [
            { industry: 'SoftwareDigitalServices', subUnitId: 'enterprise_software', revenueShare: 0.55, competitiveness: 0 },
            { industry: 'TechHardwareSemis', subUnitId: 'semiconductors', revenueShare: 0.30, competitiveness: 0 },
            { industry: 'TechHardwareSemis', subUnitId: 'consumer_devices', revenueShare: 0.15, competitiveness: 0 }
          ];
        } else if (sector === 'Energy') {
          lines = [
            { industry: 'Energy', subUnitId: 'upstream_extraction', revenueShare: 0.60, competitiveness: 0 },
            { industry: 'Energy', subUnitId: 'refined_products', revenueShare: 0.40, competitiveness: 0 }
          ];
        } else if (sector === 'Industrials') {
          if (comps.indexOf(c) % 2 === 1) {
            lines = [
              { industry: 'AerospaceDefense', subUnitId: 'defense_systems', revenueShare: 0.50, competitiveness: 0 },
              { industry: 'AerospaceDefense', subUnitId: 'commercial_aerospace', revenueShare: 0.30, competitiveness: 0 },
              { industry: 'IndustrialsMachinery', subUnitId: 'heavy_equipment', revenueShare: 0.20, competitiveness: 0 }
            ];
          } else {
            lines = [
              { industry: 'IndustrialsMachinery', subUnitId: 'heavy_equipment', revenueShare: 0.50, competitiveness: 0 },
              { industry: 'IndustrialsMachinery', subUnitId: 'industrial_automation', revenueShare: 0.30, competitiveness: 0 },
              { industry: 'MaterialsChemicals', subUnitId: 'industrial_chemicals', revenueShare: 0.20, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Consumer') {
          const isMegaCap = c.baselineAnnualRevenue > 100000;
          if (isMegaCap) {
            lines = [
              { industry: 'ConsumerStaples', subUnitId: 'food_beverage', revenueShare: 0.40, competitiveness: 0 },
              { industry: 'HealthcarePharma', subUnitId: 'pharmaceuticals', revenueShare: 0.30, competitiveness: 0 },
              { industry: 'AutomotiveTransport', subUnitId: 'passenger_vehicles', revenueShare: 0.15, competitiveness: 0 },
              { industry: 'ConsumerDiscretionaryRetail', subUnitId: 'apparel_retail', revenueShare: 0.15, competitiveness: 0 }
            ];
          } else {
            lines = [
              { industry: 'ConsumerStaples', subUnitId: 'food_beverage', revenueShare: 0.35, competitiveness: 0 },
              { industry: 'HealthcarePharma', subUnitId: 'pharmaceuticals', revenueShare: 0.25, competitiveness: 0 },
              { industry: 'AutomotiveTransport', subUnitId: 'passenger_vehicles', revenueShare: 0.20, competitiveness: 0 },
              { industry: 'ConsumerDiscretionaryRetail', subUnitId: 'apparel_retail', revenueShare: 0.20, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Financials' || sector === 'Banks') {
          lines = [
            { industry: 'SoftwareDigitalServices', subUnitId: 'enterprise_software', revenueShare: 1.0, competitiveness: 0 }
          ];
        }

        c.productLines = lines.map(line => ({
          ...line,
          category: SUBUNIT_TO_CATEGORY[line.subUnitId]
        }));
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
        if (c.primarySubUnitId === 'industrial_automation') {
          c.finishedGoodsUnits = 15;
        } else if (c.primarySubUnitId === 'passenger_vehicles') {
          c.finishedGoodsUnits = 50;
        } else if (c.primarySubUnitId === 'pharmaceuticals') {
          c.finishedGoodsUnits = 5000;
        }
      }
    });
  });

  return companies;
}


const USED_NAMES = new Set<string>();

export function generateUniqueCompanyName(_region: string, _category: string): { ticker: string, name: string } {
  const prefixes = ['Global', 'Quantum', 'Nexus', 'Aero', 'Stratos', 'Nova', 'Titan', 'Zenith', 'Horizon', 'Apex', 'Pearl', 'Obsidian', 'Astral', 'Galactic', 'Orion', 'Meridian', 'Crown', 'Heritage'];
  const suffixes = ['Industries', 'Tech', 'Systems', 'Holdings', 'Group', 'Networks', 'Dynamics', 'Logistics', 'Stores', 'Brands'];
  
  let attempts = 0;
  while (attempts < 100) {
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${p} ${s}`;
    const ticker = (p.substring(0,2) + s.substring(0,2)).toUpperCase();
    
    if (!USED_NAMES.has(name) && !USED_NAMES.has(ticker)) {
      USED_NAMES.add(name);
      USED_NAMES.add(ticker);
      return { ticker, name };
    }
    attempts++;
  }
  
  const fbName = `NewEntrant ${Math.floor(Math.random()*1000)}`;
  const fbTicker = `NEW${Math.floor(Math.random()*1000)}`;
  USED_NAMES.add(fbName);
  USED_NAMES.add(fbTicker);
  return { ticker: fbTicker, name: fbName };
}

export function generateIPOCompany(regionId: RegionId, category: string, categoryDemandUSD: number, week: number, policyRate: number = 0.045): Company {
  const revBase = categoryDemandUSD * (0.02 + Math.random() * 0.03); 
  const ebitdaMargin = 0.15 + Math.random() * 0.15;
  const shares = Math.floor(revBase * 10);
  const { ticker, name } = generateUniqueCompanyName(regionId, category);
  
  let industry: Industry = 'SoftwareDigitalServices';
  for (const [ind, subUnits] of Object.entries(INDUSTRY_SUBUNITS)) {
    if (subUnits.some(su => su.unitId === category)) {
      industry = ind as Industry;
      break;
    }
  }

  const sectorMap: Record<Industry, Sector> = {
    Energy: 'Energy',
    MaterialsChemicals: 'Industrials',
    IndustrialsMachinery: 'Industrials',
    AerospaceDefense: 'Industrials',
    AutomotiveTransport: 'Industrials',
    TechHardwareSemis: 'Tech',
    SoftwareDigitalServices: 'Tech',
    Telecommunications: 'Tech',
    HealthcarePharma: 'Consumer',
    ConsumerStaples: 'Consumer',
    ConsumerDiscretionaryRetail: 'Consumer',
    LuxuryGoods: 'Consumer',
    MediaEntertainment: 'Consumer',
    RealEstateConstruction: 'Industrials',
  };
  
  const sector = sectorMap[industry] ?? 'Tech';
  const initialRating: CreditRating = Math.random() > 0.5 ? 'BB' : 'B';
  const debtBase = revBase * 1.5;
  
  const ebitda = revBase * ebitdaMargin;
  const da = revBase * 0.05;
  const ebit = Math.max(10, ebitda - da);
  const employeeCount = Math.max(100, Math.round(revBase / 500_000));
  const debtTranches = generateDebtTranches(ticker, debtBase, initialRating, policyRate);
  const capex = Math.round(revBase * 0.06);
  const maintenanceCapex = Math.round(capex * 0.3); // newly-public growth-stage company spends more on expansion than upkeep
  const growthCapex = capex - maintenanceCapex;
  
  const eps = Number(((ebitda * 0.5) / Math.max(1, shares)).toFixed(4));
  const IPO_POP = 0.08;
  const stockPrice = Math.max(0.5, Number((eps * SECTOR_BENCHMARKS[sector].basePE * (1 + IPO_POP)).toFixed(2)));
  const marketCap = shares * stockPrice;
  const forwardPE = SECTOR_BENCHMARKS[sector].basePE;

  return {
    id: `comp_${ticker}_${Date.now()}_${week}`,
    ticker, name, region: regionId, sector,
    baselineAnnualRevenue: revBase, annualRevenue: revBase,
    previousEmployeeCount: employeeCount, employeeCount,
    ebitda, baselineEbitdaMargin: ebitda / Math.max(1, revBase), ebit, netIncome: ebitda * 0.5, eps,
    sharesOutstanding: shares, currentLiabilities: Math.round(debtBase * 0.25 + revBase * 0.08),
    totalDebt: debtBase, cash: revBase * 0.5,
    capex,
    maintenanceCapex,
    growthCapex,
    baselineGrowthCapexToRevenueRatio: growthCapex / Math.max(1, revBase),
    maintenanceShortfallStreak: 0,
    executionQuality: 1.0,
    occupationMixDrift: {},
    creditRating: initialRating, isDefaulted: false, oasSpreadBps: 300, cdsSpreadBps: 300,
    seniorBondYield: 0.08, stockPrice, historicalPrices: Array(52).fill(stockPrice), forwardPE,
    marketCap, dividendYield: 0, baselineDividendYield: 0, beta: 1.2, recoveryRate: 0.40,
    baselineRecoveryRate: 0.40, debtTranches,
    productLines: [{ industry, subUnitId: category, revenueShare: 1.0, competitiveness: 0.3, previousCategoryMarketShare: 0.02, categoryMarketShare: 0.02 }],
    leverage: debtBase / Math.max(1, ebitda),
    interestCoverage: ebit / Math.max(0.5, debtBase * 0.06),
    earningsWeekModulo: week % 13,
    lastEarningsReportWeek: week,
    reportedThisWeek: false,
    historicalFundamentals: [],
    baselineEmployeeCount: employeeCount,
    dealerConsensus: {
      alpha: { eps, revenue: revBase },
      beta: { eps, revenue: revBase },
      gamma: { eps, revenue: revBase },
      consensusEps: eps,
      consensusRevenue: revBase,
    },
    lastEarningsSurprisePct: 0,
    lastManagementCommentary: 'Newly public company; management outlined initial growth strategy at IPO.',
    leveragedLoan: {
      quotedMarginBps: 300,
      referenceBenchmark: 'SOFR',
      pricePar: 99.0,
      discountMarginBps: 300,
      tenorYears: 5,
      seniority: 'Senior Secured First Lien',
      recoveryRate: 0.40,
    },
    ratingHistory: [initialRating],
    institutionalRole: null,
    sentiment: 0.0,
    inputSupplyConstraintFactor: 1.0,
    finishedGoodsInventoryUSD: 0,
    inventoryCarryingCostRate: 0.02,
    recentFulfillmentEMA: 1.0,
    treasuryHoldings: [],
  };
}
