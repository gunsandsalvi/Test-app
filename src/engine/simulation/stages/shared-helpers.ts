/**
 * Small pure helper functions shared by two or more weekly-step stages (credit spread /
 * rating-bucket demand premia, occupation labor demand, ownership-share targets, and
 * itemized-holdings attribution). Kept together here rather than duplicated per stage.
 */

import { Company, Region, PrivateSectorSegment } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX } from '../../../domain/region-macro';

// Holder-class rebalancing coefficients (see computeTargetOwnershipShares below).
const EQUITY_ATTRACTIVENESS_SENSITIVITY = 0.6;
const EQUITY_BANK_SENSITIVITY = 0.10;
const FOREIGN_GROWTH_SENSITIVITY = 3.0;

export function computeExpectedLossSpreadBps(comp: Company): number {
  const interestExpense = comp.debtTranches?.reduce((sum, t) => {
    const rate = t.rateType === 'FIXED'
      ? (t.couponRate ?? 0.05)
      : (0.05 + (t.floatingMarginBps ?? 200) / 10000);
    return sum + t.principalUSD * rate;
  }, 0) || 1;
  const coverage = comp.ebitda / interestExpense;
  const leverage = comp.totalDebt / (comp.ebitda || 1);
  const score = leverage - coverage;
  const pd = 1 / (1 + Math.exp(-score));
  const recoveryRate = 0.4;
  return pd * (1 - recoveryRate) * 10000;
}

export function getRatingBucket(rating: string): 'IG' | 'HY' {
  return ['AAA', 'AA', 'A', 'BBB'].includes(rating) ? 'IG' : 'HY';
}

export function computeBucketDemandPremiumBps(bucket: 'IG' | 'HY', reg: Region, allCompaniesInBucket: Company[]): number {
  const demand = reg.laggedCorporateDemandBase ?? 100; // Use lagged corporate demand as proxy for corporate bond demand
  const supply = allCompaniesInBucket.reduce((sum, c) => sum + (c.totalDebt ?? 0), 0) || 100;
  const ratio = demand / supply;
  return (1 - ratio) * 200;
}

export function computeOccupationDemand(companies: Company[], privateSegments: PrivateSectorSegment[], regionId: string, governmentEmployment?: number): Record<string, number> {
  const demand: Record<string, number> = {
    GENERAL: 0,
    SKILLED_TRADES: 0,
    TECHNICAL_ENGINEERING: 0,
    SPECIALIZED_PROFESSIONAL: 0,
    MANAGERIAL_FINANCIAL: 0,
  };

  companies.filter(c => c.region === regionId && isActiveCompany(c)).forEach(c => {
    const mix = SECTOR_OCCUPATION_MIX[c.sector];
    if (!mix) { demand.GENERAL += c.employeeCount; return; }
    Object.keys(mix).forEach((occ) => {
      demand[occ] += c.employeeCount * ((mix as any)[occ] ?? 0);
    });
  });

  (privateSegments || []).forEach(seg => {
    const mix = PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType];
    if (!mix) { demand.GENERAL += seg.employment; return; }
    Object.keys(mix).forEach((occ) => {
      demand[occ] += seg.employment * ((mix as any)[occ] ?? 0);
    });
  });

  if (governmentEmployment) {
    demand.GENERAL += governmentEmployment * 0.6;
    demand.MANAGERIAL_FINANCIAL += governmentEmployment * 0.4;
  }

  return demand;
}

export function formSupplyRelationships(regionId: string, companies: Company[]): Company[] {
  return companies;
}

export function computeTargetOwnershipShares(assetClass: string, regionId: string, region: Region, allRegions: Record<string, Region>): { bankShare: number; institutionalShare: number; foreignShare: Record<string, number>; centralBankShare: number } {
  if (assetClass !== 'equity') {
    const current = (region as any)[`${assetClass}Ownership`] ?? region.equityOwnership;
    return {
      bankShare: current.bankShare,
      institutionalShare: current.institutionalShare,
      foreignShare: current.foreignShare,
      centralBankShare: current.centralBankShare,
    };
  }

  const current = region.equityOwnership;
  const equityAttractiveness = (region.gdpGrowth + region.inflation) - region.zeroRates.tenor10Y;
  const institutionalShare = Math.max(0.10, Math.min(0.65, current.institutionalShare + equityAttractiveness * EQUITY_ATTRACTIVENESS_SENSITIVITY));
  const bankShare = Math.max(0.01, Math.min(0.10, current.bankShare + equityAttractiveness * EQUITY_BANK_SENSITIVITY));

  const foreignShare: Record<string, number> = {};
  Object.keys(current.foreignShare).forEach((r) => {
    if (r === regionId) { foreignShare[r] = 0; return; }
    const otherRegion = allRegions[r];
    const growthDifferential = otherRegion ? (otherRegion.gdpGrowth - region.gdpGrowth) : 0;
    const base = (current.foreignShare as any)[r] ?? 0.05;
    foreignShare[r] = Math.max(0, base * (1 + growthDifferential * FOREIGN_GROWTH_SENSITIVITY));
  });

  return { bankShare, institutionalShare, foreignShare, centralBankShare: current.centralBankShare };
}

export function computeSupplyDemandPremium(
  shares: any,
  capacities: { bank: number, institutional: number },
  totalOutstanding: number
): number {
  const demand = (capacities.bank * (shares.bankShare ?? 0.25)) + (capacities.institutional * (shares.institutionalShare ?? 0.25));
  const supply = totalOutstanding || 1;
  const ratio = demand / supply;
  return (1 - ratio) * 200;
}

export function attributeItemizedHoldings(entities: any, portfolio: any): any[] {
  return [];
}
