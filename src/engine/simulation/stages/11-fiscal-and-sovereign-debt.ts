
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


export function runStage_11_fiscal_and_sovereign_debt(ctx: PipelineContext): PipelineContext {
    let updatedRegions = ctx.updatedRegions;
    let updatedCompanies = ctx.updatedCompanies;
    let attributeItemizedHoldings = ctx.attributeItemizedHoldings;
    let regionIds = ctx.regionIds;
    let nextWeek = ctx.nextWeek;
    let rateChanges = ctx.rateChanges;
    let ratingChanges = ctx.ratingChanges;
    let defaultedTickers = ctx.defaultedTickers;
    let earningsReportedThisTurn = ctx.earningsReportedThisTurn;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // Part ME: Itemized holdings attribution
  (Object.keys(updatedRegions) as RegionId[]).forEach(regionId => {
    const reg = updatedRegions[regionId];
    const regionCompanies = updatedCompanies.filter(c => c.region === regionId && isActiveCompany(c));
    
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];
    
    regionCompanies.forEach(c => {
      equityCandidates.push({ id: c.id, type: 'EQUITY', region: regionId, outstandingUSD: c.marketCap });
      (c.debtTranches || []).forEach(t => {
        corpCandidates.push({
          id: t.id,
          type: t.rateType === 'FIXED' ? 'CORP_BOND' : 'LEVERAGED_LOAN',
          region: regionId,
          outstandingUSD: t.principalUSD
        });
      });
    });
    
    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = (reg.govDebtTranches || []).map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));
    
    const totalCorpUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalSovUSD = sovCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalEquityUSD = equityCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    
    // Banking Sector
    const bankCorpShareUSD = reg.corpBondOwnership.bankShare * totalCorpUSD;
    const bankSovShareUSD = reg.sovBondOwnership.bankShare * totalSovUSD;
    const bankEquityShareUSD = reg.equityOwnership.bankShare * totalEquityUSD;
    
    reg.bankingSector.itemizedHoldings = [
      ...attributeItemizedHoldings(bankCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(bankSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(bankEquityShareUSD, equityCandidates),
    ];
    
    // Institutional Sector
    const instCorpShareUSD = reg.corpBondOwnership.institutionalShare * totalCorpUSD;
    const instSovShareUSD = reg.sovBondOwnership.institutionalShare * totalSovUSD;
    const instEquityShareUSD = reg.equityOwnership.institutionalShare * totalEquityUSD;
    
    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(instCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(instSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(instEquityShareUSD, equityCandidates),
    ];
  });

  // Phase 4a: Derived nominal GDP parallel diagnostic
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // C — household consumption, already-established convention
    const consumptionComponentUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);

    // I — tracked company investment, scaled up to represent the whole private sector via Phase 1's employment split
    const trackedFirms = updatedCompanies.filter(f => f.region === regionId && isActiveCompany(f));
    const trackedInvestmentUSD = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = (reg.privateSectorSegments || []).reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentUSD = trackedInvestmentUSD * investmentScaleFactor;

    // G — government spending, already established in Phase 2 (weekly flow, annualize)
    const governmentComponentUSD = reg.governmentSpendingUSD * 52;

    // NX — net exports, already established in Phase 3 (already annualized-scale)
    const netExportsComponentUSD = reg.exportsUSD - reg.importsUSD;

    const rawGdpUSD = consumptionComponentUSD + investmentComponentUSD + governmentComponentUSD + netExportsComponentUSD;
    const newDerivedNominalGdpUSD = Math.max(1e11, isFinite(rawGdpUSD) ? rawGdpUSD : 1e12);
    const gdpLevelLastWeek = (reg as any).lastWeekNominalGdpUSD > 0 ? (reg as any).lastWeekNominalGdpUSD : newDerivedNominalGdpUSD;
    const isStartupTransition = gdpLevelLastWeek < newDerivedNominalGdpUSD * 0.2;
    const rawWeeklyRealGrowthRate = (!isStartupTransition && gdpLevelLastWeek > 0 && isFinite(newDerivedNominalGdpUSD) && isFinite(gdpLevelLastWeek))
      ? Math.max(-0.04, Math.min(0.04, (newDerivedNominalGdpUSD / gdpLevelLastWeek - 1) - (reg.inflation / 52)))
      : 0;
    const prevSmoothedWeeklyRate = (reg as any).smoothedWeeklyGrowthRate ?? rawWeeklyRealGrowthRate;
    const smoothedWeeklyRate = prevSmoothedWeeklyRate * 0.85 + rawWeeklyRealGrowthRate * 0.15; // real EMA smoothing — a single week's noise no longer dominates
    const gdpGrowthBottomUp = Math.pow(1 + smoothedWeeklyRate, 52) - 1;

    if (!isFinite(gdpGrowthBottomUp)) {
      throw new Error(`gdpGrowthBottomUp is non-finite for region ${regionId} at week ${nextWeek}: ${gdpGrowthBottomUp}. This must be fixed at its real source, not papered over with an assumed growth rate.`);
    }
    const finalGdpGrowth = gdpGrowthBottomUp;

    // Government Debt Tranches: roll-off and new issuance
    const maturedTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const liveTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek > nextWeek);
    const maturedPrincipalUSD = maturedTranches.reduce((s, t) => s + t.principalUSD, 0);

    const weeklyDeficitUSD = Math.max(0, reg.governmentSpendingUSD - reg.governmentRevenueUSD) + maturedPrincipalUSD;
    const monetizationShare = (reg.balanceSheetStance * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSD * monetizationShare;
    const marketFundedDeficitUSD = weeklyDeficitUSD - monetizedAmountUSD;

    // PART OD: Sovereign debt issued in large, infrequent blocks
    const currentUnfundedDeficitUSD = (reg.pendingUnfundedDeficitUSD ?? 0) + marketFundedDeficitUSD;
    const issuanceCalendarWeek = nextWeek % 13 === 0; // large blocks roughly quarterly, not every week
    
    let quarterlyFundingNeedUSD = 0;
    let nextPendingUnfundedDeficitUSD = currentUnfundedDeficitUSD;
    const newTranches: GovDebtTranche[] = [];

    // Curve-smart tenor allocation: read the actual yield curve shape already computed for this region.
    const curveSteepness = reg.zeroRates.tenor30Y - reg.zeroRates.tenor2Y;
    const baseWeights = { t2: 0.30, t5: 0.30, t10: 0.25, t30: 0.15 };
    const steepnessAdjustment = (curveSteepness * 3);
    const tenorWeights = {
      t2: Math.max(0.10, baseWeights.t2 + steepnessAdjustment * 0.5),
      t5: baseWeights.t5,
      t10: Math.max(0.10, baseWeights.t10 - steepnessAdjustment * 0.3),
      t30: Math.max(0.05, baseWeights.t30 - steepnessAdjustment * 0.2),
    };
    const weightSum = tenorWeights.t2 + tenorWeights.t5 + tenorWeights.t10 + tenorWeights.t30;

    if (issuanceCalendarWeek) {
      quarterlyFundingNeedUSD = currentUnfundedDeficitUSD; // roll up 13 weeks of accumulated need into one real issuance event
      nextPendingUnfundedDeficitUSD = 0;

      if (quarterlyFundingNeedUSD > 1000) {
        ([['t2', 2, 104], ['t5', 5, 260], ['t10', 10, 520], ['t30', 30, 1560]] as const).forEach(([key, tenorYears, tenorWeeks]) => {
          const principal = quarterlyFundingNeedUSD * (tenorWeights[key] / weightSum);
          if (principal < 100) return;
          newTranches.push({
            id: `${regionId}-GOV-${tenorYears}Y-${nextWeek}`,
            principalUSD: principal,
            couponRate: calculateNelsonSiegelZeroRate(tenorYears, reg.yieldCurveParams), // priced off the region's own real curve
            originationWeek: nextWeek,
            maturityWeek: nextWeek + tenorWeeks,
            tenorAtIssuanceYears: tenorYears,
          });
        });
      }
    }

    const updatedBankingSector = { ...reg.bankingSector };
    const updatedInstitutionalSector = { ...reg.institutionalSector };

    // Market-funded deficit routes to bond holdings (institutional + bank)
    if (issuanceCalendarWeek) {
      updatedBankingSector.sovereignBondHoldingsUSD += quarterlyFundingNeedUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += quarterlyFundingNeedUSD * 0.60;
    } else {
      updatedBankingSector.sovereignBondHoldingsUSD += marketFundedDeficitUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += marketFundedDeficitUSD * 0.60;
    }

    if (updatedBankingSector.centralBankReservesUSD < 0) throw new Error("Invariant Violation: centralBankReservesUSD cannot be negative");
    updatedBankingSector.centralBankReservesUSD = Number(updatedBankingSector.centralBankReservesUSD.toFixed(0));

    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);
    const debtToGdpPctBottomUp = newDerivedNominalGdpUSD > 0 ? totalGovDebtUSD / newDerivedNominalGdpUSD : (reg.debtToGdpPctBottomUp || 0);

    updatedRegions[regionId] = {
      ...reg,
      gdpGrowth: finalGdpGrowth,
      estimatedNominalGdpUSD: newDerivedNominalGdpUSD,
      derivedNominalGdpUSD: newDerivedNominalGdpUSD,
      gdpGrowthBottomUp: Number(gdpGrowthBottomUp.toFixed(4)),
      smoothedWeeklyGrowthRate: smoothedWeeklyRate,
      lastWeekNominalGdpUSD: newDerivedNominalGdpUSD,
      nominalGdpHistory: reg.nominalGdpHistory || [],
      consumptionComponentUSD,
      investmentComponentUSD,
      govDebtTranches: [...liveTranches, ...newTranches],
      debtToGdpPctBottomUp,
      pendingUnfundedDeficitUSD: nextPendingUnfundedDeficitUSD,
      bankingSector: updatedBankingSector,
      institutionalSector: updatedInstitutionalSector,
    };
  });

  const { newsItems, sectorSentimentShocks: _sectorSentimentShocks } = generateWeeklyNews(
    nextWeek,
    updatedRegions,
    updatedCompanies,
    rateChanges,
    ratingChanges,
    defaultedTickers,
    earningsReportedThisTurn
  );

        ctx.updatedRegions = updatedRegions;
    ctx.updatedCompanies = updatedCompanies;
    ctx.attributeItemizedHoldings = attributeItemizedHoldings;
    ctx.regionIds = regionIds;
    ctx.nextWeek = nextWeek;
    ctx.rateChanges = rateChanges;
    ctx.ratingChanges = ratingChanges;
    ctx.defaultedTickers = defaultedTickers;
    ctx.earningsReportedThisTurn = earningsReportedThisTurn;
    return ctx;
}
