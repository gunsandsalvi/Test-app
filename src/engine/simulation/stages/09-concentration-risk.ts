
import { isActiveCompany } from '../../../domain/company';
import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche, SupplyRelationship } from '../../../types';
import { SECTOR_BENCHMARKS, priceEquity, priceCorporateBond, priceInterestRateSwap, priceCreditDefaultSwap, priceLeveragedLoan, priceCrossCurrencyBasisSwap } from '../../pricing';
import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../../nelsonSiegel';
import { EarningsReportEvent, generateWeeklyNews } from '../../newsGenerator';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../../formatters';
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateBlackScholesGreeks } from '../../blackScholes';
import { calculateExpectedCarry } from '../../carryCalculator';
import { CORPORATE_DEMAND_INTENSITY } from "../../domain/industry";
import { GameState, Company, Region, RegionId, Position, FxPair, CATEGORY_TRADABILITY, OccupationType, OccupationPool, SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX, PrivateSectorSegment, CATEGORY_INPUT_REQUIREMENTS, AssetOwnershipShares, ItemizedHolding, INDUSTRY_SUBUNITS, Industry, UnitBid, UnitOffer, SupplyContract, SegmentFinancial } from '../../../types';
import { determineCreditRating } from '../credit';
import { checkForIPO } from '../ipo';
import { checkForMerger } from '../merger';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from '../constants';
import { evolveRegionMacro, evolveFxPair, evolveCommodity, calculateCompositeIndices } from '../../macroEngine';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot } from '../../companyGenerator';
import { PipelineContext } from '../pipeline';


export function runStage_09_concentration_risk(ctx: PipelineContext): PipelineContext {
    let updatedCompanies = ctx.updatedCompanies;
    let updatedRegions = ctx.updatedRegions;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // PART BAA: Compute concentration risk flags (>40% threshold) from real activeContracts
  updatedCompanies.forEach(comp => {
    const flags: string[] = [];
    const reg = updatedRegions[comp.region];
    const contracts = reg?.activeContracts || [];
    
    // Supplier concentration
    const asSupplier = contracts.filter(c => c.supplierCompanyId === comp.ticker || c.supplierCompanyId === comp.id);
    const totalSupplierVal = asSupplier.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalSupplierVal > 0) {
      const custTotals: Record<string, number> = {};
      asSupplier.forEach(c => {
        custTotals[c.customerCompanyId] = (custTotals[c.customerCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(custTotals).forEach(([custTicker, val]) => {
        const share = val / totalSupplierVal;
        if (share > 0.40) {
          const custComp = updatedCompanies.find(x => x.ticker === custTicker || x.id === custTicker);
          const custName = custComp?.name || custTicker;
          flags.push(`High Customer Concentration: ${custName} (${(share * 100).toFixed(0)}% of contract revenue)`);
        }
      });
    }

    // Customer concentration
    const asCustomer = contracts.filter(c => c.customerCompanyId === comp.ticker || c.customerCompanyId === comp.id);
    const totalCustomerVal = asCustomer.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalCustomerVal > 0) {
      const supTotals: Record<string, number> = {};
      asCustomer.forEach(c => {
        supTotals[c.supplierCompanyId] = (supTotals[c.supplierCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(supTotals).forEach(([supTicker, val]) => {
        const share = val / totalCustomerVal;
        if (share > 0.40) {
          const supComp = updatedCompanies.find(x => x.ticker === supTicker || x.id === supTicker);
          const supName = supComp?.name || supTicker;
          flags.push(`High Supplier Concentration: ${supName} (${(share * 100).toFixed(0)}% of input supply)`);
        }
      });
    }

    comp.concentrationRiskFlags = flags;
  });

        ctx.updatedCompanies = updatedCompanies;
    ctx.updatedRegions = updatedRegions;
    return ctx;
}
