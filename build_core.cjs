const fs = require('fs');

const imports = `import { GameState, Company, Region, Position, FxPair, AssetOwnershipShares, ItemizedHolding, PrivateSectorSegment, SupplyContract, SegmentFinancial } from '../../types';
import { RegionId, OccupationType, OccupationPool, Sector } from '../../types';
import { Industry, INDUSTRY_SUBUNITS, CATEGORY_TRADABILITY, CATEGORY_INPUT_REQUIREMENTS, PRIVATE_SEGMENT_OCCUPATION_MIX, SECTOR_OCCUPATION_MIX, CORPORATE_DEMAND_INTENSITY } from '../../domain/industry';
import { calculateBlackScholesGreeks } from './blackScholes';
import { calculateExpectedCarry } from './carryCalculator';
import { calculateNelsonSiegelZeroRate, priceCorporateBond, priceSovereignBond } from './nelsonSiegel';
import { getUnifiedInitialMarginRate } from './dealers';
import { formatMoney, formatQuarterFilingDate } from './formatters';
import { evolveRegionMacro } from './macroEngine';
import { determineCreditRating } from './credit';
import { checkForIPO } from './ipo';
import { checkForMerger } from './merger';
import { generateHeadline, generateGenericNews } from './newsGenerator';
import { isActiveCompany } from '../../domain/company';
import { getSimulationDate } from './formatters';
`;

const moduleHelpers = `
export function computeExpectedLossSpreadBps(comp: Company): number {
  const coverage = comp.financials.interestCoverage ?? 1;
  const leverage = comp.financials.leverageRatio ?? 1;
  const score = leverage - coverage;
  const pd = 1 / (1 + Math.exp(-score));
  const recoveryRate = 0.4;
  return pd * (1 - recoveryRate) * 10000;
}

export function getRatingBucket(rating: string): 'IG' | 'HY' {
  return ['AAA', 'AA', 'A', 'BBB'].includes(rating) ? 'IG' : 'HY';
}

export function computeBucketDemandPremiumBps(bucket: 'IG' | 'HY', reg: Region, allCompaniesInBucket: Company[]): number {
  const demand = reg.macroValues.corporateDemand?.[bucket] ?? 100;
  const supply = allCompaniesInBucket.reduce((sum, c) => sum + (c.financials.totalDebtUSD ?? 0), 0) || 100;
  const ratio = demand / supply;
  return (1 - ratio) * 200;
}

export function computeOccupationDemand(companies: Company[], privateSegments: PrivateSectorSegment[], regionId: RegionId, governmentEmployment?: number): Record<OccupationType, number> {
  const demand = { Management: 0, Professional: 0, Service: 0, Sales: 0, Office: 0, Farming: 0, Construction: 0, Maintenance: 0, Production: 0, Transportation: 0 } as Record<OccupationType, number>;
  return demand;
}

export function formSupplyRelationships(regionId: RegionId, companies: Company[]): Company[] {
  return companies;
}

export function computeTargetOwnershipShares(assetClass: string, regionId: RegionId, region: Region, allRegions: Record<RegionId, Region>): AssetOwnershipShares {
  return { DomesticBank: 0.25, DomesticInstitutional: 0.25, DomesticHousehold: 0.25, Foreign: 0.25 } as AssetOwnershipShares;
}

export function computeSupplyDemandPremium(demand: number, supply: number): number {
  const ratio = supply > 0 ? demand / supply : 1;
  return (1 - ratio) * 200;
}

export function attributeItemizedHoldings(entities: any[], portfolio: any) {
}

export const STANDARD_CORP_TENOR_YEARS = 5;

export function advanceWeeklyStep(state: GameState): GameState {
`;

const prologue = `
  const nextWeek = state.currentWeek + 1;
  const currentWeekMod13 = ((nextWeek - 1) % 13) + 1;
  const companyUpdates: Record<string, Partial<Company>> = {};
  const prevActiveFirms = state.companies.filter(isActiveCompany);
  const recentIPOs: any[] = [];
  const recentMergers: any[] = [];
  const diagnosticLogs: any[] = [];
  const newsItems: any[] = [];
  const rateChanges: any[] = [];
  const ratingChanges: any[] = [];
  const earningsReportedThisTurn: any[] = [];
  const defaultedTickers: any[] = [];
  const mergerNews: any[] = [];
  const updatedRegions = { ...state.regions };
  const updatedFxPairs = [...state.fxPairs];
  const updatedCompanies = [...state.companies];
  const updatedInstitutionalEntities = [...state.institutionalEntities];
  const updatedCommodities = [...state.commodities];
  const updatedCompositeIndices = { ...state.compositeIndices };
  let marketVolPremium = state.marketVolPremium || 0;
`;

const epilogue = `
  const updatedPortfolio = { ...state.portfolio };
  const updatedNewsFeed = [...state.newsFeed, ...newsItems].slice(-100);
  const updatedDiagnosticsLogs = [...state.diagnosticsLogs, ...diagnosticLogs].slice(-100);
  const year = state.year + (currentWeekMod13 === 13 && nextWeek % 52 === 0 ? 1 : 0);
  const turnSummary: any = { turn: nextWeek };
  const isGameOver = false;
  const gameOverReason = null;

  return { 
    ...state, 
    currentWeek: nextWeek, 
    year, 
    regions: updatedRegions, 
    fxPairs: updatedFxPairs, 
    companies: updatedCompanies, 
    institutionalEntities: updatedInstitutionalEntities, 
    commodities: updatedCommodities, 
    compositeIndices: updatedCompositeIndices, 
    recentIPOs, 
    recentMergers, 
    marketVolPremium, 
    portfolio: updatedPortfolio, 
    newsFeed: updatedNewsFeed, 
    diagnosticsLogs: updatedDiagnosticsLogs, 
    turnSummary, 
    isGameOver, 
    gameOverReason 
  };
}
`;

const stages = [
  '01-macro-feedback.ts', '02-region-macro.ts', '03-category-demand.ts',
  '04-input-output.ts', '05-unit-bidding.ts', '06-fx-and-trade.ts',
  '07-commodities.ts', '08-company-fundamentals.ts', '09-concentration-risk.ts',
  '10-ipo-and-ma.ts', '11-fiscal-and-sovereign-debt.ts', '12-portfolio-and-positions.ts',
  '13-news-and-turn-summary.ts'
];

let body = '';

for (const stage of stages) {
  if (fs.existsSync('src/engine/simulation/stages/' + stage)) {
    const content = fs.readFileSync('src/engine/simulation/stages/' + stage, 'utf8');
    let match = content.match(/export function \w+\([^)]*\)(?:\s*:\s*\w+)?\s*\{([\s\S]*?)return ctx;/);
    if (match) {
      let stageBody = match[1];
      stageBody = stageBody.replace(/let\s+state\s*=\s*ctx\.state;/g, '');
      stageBody = stageBody.replace(/const\s+state\s*=\s*ctx\.state;/g, '');
      stageBody = stageBody.replace(/let\s+[a-zA-Z0-9_]+\s*=\s*ctx\.[a-zA-Z0-9_]+;/g, '');
      stageBody = stageBody.replace(/ctx\.[a-zA-Z0-9_]+\s*=\s*[a-zA-Z0-9_]+;/g, '');
      stageBody = stageBody.replace(/\/\/ We will extract variables from ctx/g, '');
      stageBody = stageBody.replace(/\/\/ \(We will let typescript complain and manually fix it, or just use any\)/g, '');
      
      body += `\n    // === STAGE ${stage} ===\n` + stageBody;
    }
  }
}

fs.writeFileSync('src/engine/simulation/core.ts', imports + moduleHelpers + prologue + body + epilogue);
console.log('Created src/engine/simulation/core.ts');
