/**
 * Small pure helper functions shared by two or more weekly-step stages (credit spread /
 * rating-bucket demand premia, occupation labor demand, ownership-share targets, and
 * itemized-holdings attribution). Kept together here rather than duplicated per stage.
 */

import { Company, Region, PrivateSectorSegment, RegionId, ItemizedHolding, SupplyRelationship, InstitutionalEntity } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';

// Holder-class rebalancing coefficients (see computeTargetOwnershipShares below).
const EQUITY_ATTRACTIVENESS_SENSITIVITY = 0.6;
const EQUITY_BANK_SENSITIVITY = 0.10;
const FOREIGN_GROWTH_SENSITIVITY = 3.0;

/**
 * The default trigger, defined once. A company defaults the week its cash goes negative while
 * its coverage sits below this floor (see stage 08's check, which imports this constant, and
 * credit.ts's rating ladder, which anchors its CCC boundary to the same number). Everything the
 * market charges for credit risk is priced off the probability of ENTERING this state — so the
 * trigger and the hazard priced against it must be one definition, not two.
 */
export const DEFAULT_COVERAGE_FLOOR = 0.8;

/** Expected relative EBITDA volatility per revenue volatility: margins amplify a revenue shock. */
const OPERATING_LEVERAGE = 2.0;
/**
 * Floor on annualized relative EBITDA volatility. Measured volatility comes from the company's
 * own revenue history, but early weeks have too little history to measure honestly, and a
 * deterministic bootstrap would otherwise imply zero risk for everyone. Real mature-company
 * EBITDA vol runs ~15-40% annualized; the floor sits at the calm end of that.
 */
const MIN_ANNUAL_EBITDA_VOL = 0.18;
const MAX_ANNUAL_EBITDA_VOL = 1.2;

/** Standard normal CDF (Abramowitz–Stegun; ~1e-7 accurate — plenty for a default probability). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return x >= 0 ? p : 1 - p;
}

/** Annualized relative EBITDA volatility, measured from the company's own revenue history. */
function annualEbitdaVol(comp: Company): number {
  const hist = comp.revenueHistory || [];
  if (hist.length < 8) return MIN_ANNUAL_EBITDA_VOL;
  const rel: number[] = [];
  for (let i = 1; i < hist.length; i++) {
    if (hist[i - 1] > 0) rel.push(hist[i] / hist[i - 1] - 1);
  }
  if (rel.length < 4) return MIN_ANNUAL_EBITDA_VOL;
  const mean = rel.reduce((a, b) => a + b, 0) / rel.length;
  const varc = rel.reduce((a, b) => a + (b - mean) ** 2, 0) / (rel.length - 1);
  const weeklyRevVol = Math.sqrt(varc);
  const annual = weeklyRevVol * Math.sqrt(52) * OPERATING_LEVERAGE;
  return Math.min(MAX_ANNUAL_EBITDA_VOL, Math.max(MIN_ANNUAL_EBITDA_VOL, annual));
}

/**
 * Annual probability of default as a STRUCTURAL FORECAST of the real trigger above — not a
 * fitted curve. The previous model was a logistic on (leverage − coverage) with a tuned cap,
 * midpoint and width: a shape with the right slope and no relationship to how default actually
 * happens in this simulation, so the market priced one risk while companies died of another
 * (§7.19 review item 1 in the plan).
 *
 * This asks the real question instead: how large a relative EBITDA shock, sustained for a year,
 * would put THIS company inside the trigger — and how likely is a shock that size given the
 * company's own measured volatility?
 *
 *   - The coverage half trips when EBITDA falls below floor × interest.
 *   - The cash half trips when the year's fixed outflows (interest, maintenance capex,
 *     dividends) exhaust the shocked EBITDA plus the cash pile.
 *   - The trigger is an AND, so the binding distance is the LARGER of the two shocks — which is
 *     why a leveraged company with a genuine cash pile is safer than its coverage alone says,
 *     exactly as a real credit desk would read it: runway matters.
 *
 * PD = Φ(−distance / σ). Every input is the company's own: its real ladder's interest, its real
 * cash, its real capex and dividends, its own measured revenue volatility. Dispersion between
 * two same-rated names is real information, not curve noise.
 */
export function computeAnnualDefaultProbability(comp: Company): number {
  const interest = comp.debtTranches?.reduce((sum, t) => {
    const rate = t.rateType === 'FIXED'
      ? (t.couponRate ?? 0.05)
      : (0.05 + (t.floatingMarginBps ?? 200) / 10000);
    return sum + t.principalUSD * rate;
  }, 0) || 1;
  const ebitda = Math.max(1, comp.ebitda);

  const shockToCoverage = 1 - (DEFAULT_COVERAGE_FLOOR * interest) / ebitda;
  // Dividends live on the quarterly snapshot (there is no annual field on Company) — annualize
  // the latest quarter. Zero when no snapshot exists yet.
  const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
  const dividendsAnnualUSD = (latestSnap?.cashFlowStatement?.dividendsPaid ?? 0) * 4;
  const fixedOutflowsUSD = interest + (comp.maintenanceCapex ?? 0) + dividendsAnnualUSD;
  const shockToCash = 1 - (fixedOutflowsUSD - Math.max(0, comp.cash)) / ebitda;
  const distance = Math.max(shockToCoverage, shockToCash);

  return normalCdf(-distance / annualEbitdaVol(comp));
}

export function computeExpectedLossSpreadBps(comp: Company): number {
  return computeAnnualDefaultProbability(comp) * (1 - CREDIT_RECOVERY_RATE) * 10000;
}

/**
 * What a defaulted senior unsecured claim is worth. Used in the expected-loss pricing above and
 * in the distressed buyer's recovery arithmetic (asset-allocation.ts) — one assumption, two
 * consumers, and G5 will eventually replace the constant with realized resolution outcomes.
 */
export const CREDIT_RECOVERY_RATE = 0.4;

export function getRatingBucket(rating: string): 'IG' | 'HY' {
  return ['AAA', 'AA', 'A', 'BBB'].includes(rating) ? 'IG' : 'HY';
}


export function computeOccupationDemand(companies: Company[], privateSegments: PrivateSectorSegment[], regionId: RegionId, governmentEmployment?: number): Record<string, number> {
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

export function formSupplyRelationships(regionId: RegionId, companies: Company[]): SupplyRelationship[] {
  const regionFirms = companies.filter(c => c.region === regionId && isActiveCompany(c));
  const relationships: SupplyRelationship[] = [];

  regionFirms.forEach(customer => {
    (customer.productLines || []).forEach(line => {
      const reqs = CATEGORY_INPUT_REQUIREMENTS[line.industry];
      if (!reqs) return;
      Object.entries(reqs).forEach(([inputSubUnitId, intensity]) => {
        if (!intensity) return;
        const suppliers = regionFirms.filter(s =>
          s.id !== customer.id && (s.productLines || []).some(l => l.subUnitId === inputSubUnitId)
        );
        if (suppliers.length === 0) return;
        const totalSupplierRevenue = suppliers.reduce((sum, s) => sum + s.annualRevenue, 0) || 1;
        const weeklyDemandUSD = (customer.annualRevenue / 52) * intensity * line.revenueShare;
        suppliers.forEach(supplier => {
          const relationshipStrength = supplier.annualRevenue / totalSupplierRevenue;
          relationships.push({
            supplierCompanyId: supplier.id,
            customerCompanyId: customer.id,
            category: inputSubUnitId,
            weeklyVolumeUSD: weeklyDemandUSD * relationshipStrength,
            relationshipStrength,
          });
        });
      });
    });
  });

  return relationships;
}

export function computeTargetOwnershipShares(assetClass: string, regionId: RegionId, region: Region, allRegions: Record<RegionId, Region>): { bankShare: number; institutionalShare: number; foreignShare: Record<string, number>; centralBankShare: number } {
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

export function distributeRealTargetByWeight(
  entities: { id: string; sizeWeight: number; targetPct: number }[],
  totalRealTargetUSD: number
): Map<string, number> {
  const weights = entities.map((e) => Math.max(0, e.sizeWeight * e.targetPct));
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const result = new Map<string, number>();
  entities.forEach((e, idx) => result.set(e.id, totalRealTargetUSD * (weights[idx] / weightSum)));
  return result;
}

export function attributeItemizedHoldings(
  sectorShareUSD: number,
  candidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[]
): ItemizedHolding[] {
  const sorted = [...candidates].sort((a, b) => b.outstandingUSD - a.outstandingUSD);
  let remaining = sectorShareUSD;
  const result: ItemizedHolding[] = [];
  for (const c of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(c.outstandingUSD * 0.4, remaining); // no single sector holds more than 40% of any one issue
    if (take > 0) {
      result.push({
        instrumentId: c.id,
        instrumentType: c.type,
        issuerRegion: c.region,
        quantityOrNotionalUSD: take,
      });
      remaining -= take;
    }
  }
  return result;
}

/**
 * Settles a corporate action against the people who actually hold the paper.
 *
 * When an issuer's debt stack changes — a tranche matures, refinances (possibly into a different
 * rate type, which moves the whole tranche between the bond market and the loan market), is
 * prepaid, or is consolidated by a merger — the amount of that issuer's paper in existence
 * changes. Whoever owned it has to change with it: matured paper leaves the holder's book, newly
 * issued paper is placed with the existing holder base pro rata.
 *
 * Without this, holdings and the real stock drift apart until they are unrelated. Measured before
 * this existed: by week 24, 130 of ~184 issuers had institutions holding MORE than the issuer's
 * entire remaining float, and since the clearing engine's price impact scales with flow over
 * float, trading those phantom positions against a shrunken (sometimes zero) float fanned
 * corporate spreads out to -1097/+1757bp and loan discount margins to -1783/+471bp. It is the
 * same defect that ran the two-year sovereign yield to 25% before 07c learned to redeem.
 *
 * Scaling by the ratio of new float to old preserves each holder's share of the issue exactly,
 * which is what a pro-rata redemption and a pro-rata placement do. An issuer going from no float
 * to some float is a genuinely new issue with no existing holder base to place into; the clearing
 * engine absorbs it over the following weeks.
 */
export function settleCorporateActionOnHolders(
  ctx: { updatedInstitutionalEntities: InstitutionalEntity[] },
  issuerId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN',
  oldFloatUSD: number,
  newFloatUSD: number
): void {
  if (!(oldFloatUSD > 0)) return;
  const ratio = Math.max(0, newFloatUSD) / oldFloatUSD;
  if (Math.abs(ratio - 1) < 1e-9) return;

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    let touched = false;
    const newHoldings = entity.itemizedHoldings
      .map((h) => {
        if (h.instrumentType !== instrumentType || h.instrumentId !== issuerId) return h;
        touched = true;
        return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * ratio };
      })
      .filter((h) => h.quantityOrNotionalUSD > 1);
    return touched ? { ...entity, itemizedHoldings: newHoldings } : entity;
  });
}
