import { NelsonSiegelParams, calculateTenorZeroRates } from '../nelsonSiegel';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, HouseholdState, PrivateSegmentType, OccupationType, OccupationPool, PRIVATE_SEGMENT_OCCUPATION_MIX, BASE_ANNUAL_WAGE_USD, Company, COMMODITY_CATEGORY_LINKAGE, WealthTier, WealthTierData, HousingMarket, LifeCycleStage, LifeCycleStageData } from '../../types';
import { evolveBankingSector } from './banking';
import { evolveRegionalWeather } from './weather';
import { createWealthDistribution, createHousingMarket, createLifeCycleDistribution } from './initialization';

export function getBlendedWageGrowth(mix: Partial<Record<OccupationType, number>>, pools: Record<OccupationType, OccupationPool>): number {
  if (!pools) return 0.03;
  return Object.entries(mix).reduce((s, [occ, share]) => s + (pools[occ as OccupationType]?.wageGrowthAnnual ?? 0.03) * (share ?? 0), 0);
}

function getSegmentDemandSignal(segmentType: PrivateSegmentType, reg: Region, _prevHS: HouseholdState): number {
  const cat = reg.categoryDemand as any;
  switch (segmentType) {
    case 'MANUFACTURING': {
      const g1 = cat.heavy_equipment?.demandGrowthAnnual ?? 0;
      const g2 = cat.industrial_automation?.demandGrowthAnnual ?? 0;
      const g3 = cat.industrial_chemicals?.demandGrowthAnnual ?? 0;
      return (g1 + g2 + g3) / 3;
    }
    case 'PROFESSIONAL_SERVICES': {
      const g1 = cat.enterprise_software?.demandGrowthAnnual ?? 0;
      const g2 = cat.network_infrastructure?.demandGrowthAnnual ?? 0;
      return (g1 + g2) / 2;
    }
    case 'RETAIL_TRADE': {
      const g1 = cat.food_beverage?.demandGrowthAnnual ?? 0;
      const g2 = cat.apparel_retail?.demandGrowthAnnual ?? 0;
      const g3 = cat.luxury_goods?.demandGrowthAnnual ?? 0;
      return (g1 + g2 + g3) / 3;
    }
    case 'CONSTRUCTION_REALESTATE': {
      return 0;
    }
    case 'HEALTHCARE_SERVICES': {
      const g1 = cat.pharmaceuticals?.demandGrowthAnnual ?? 0;
      const g2 = cat.medtech_devices?.demandGrowthAnnual ?? 0;
      return (g1 + g2) / 2;
    }
    default:
      return 0;
  }
}

function pushAndReadLagged(buffer: number[], newValue: number, lagWeeks: number): { updatedBuffer: number[]; laggedValue: number } {
  const updatedBuffer = [...buffer, newValue].slice(-8);
  const laggedValue = updatedBuffer.length > lagWeeks ? updatedBuffer[updatedBuffer.length - 1 - lagWeeks] : updatedBuffer[0] ?? newValue;
  return { updatedBuffer, laggedValue };
}

export function evolveRegionMacro(
  region: Region,
  globalShock: { gdpShock: number; inflationShock: number },
  microFeedback: {
    capexGdpContribution: number;
    marginCompression: number;
    creditContagionBps: number;
    bottomUpUnemploymentDelta: number;
    businessLoanBookInputUSD: number;
    trackedHealthSignal: number;
    publicCompanyEmployment: number;
    occupationDemand?: Record<OccupationType, number>;
    monetizedAmountUSD?: number;
  },
  week: number,
  equityReturn: number = 0,
  prevCommodities: Commodity[] = []
): {
  updatedRegion: Region;
  rateChanged: boolean;
  rateDeltaBps: number;
  isMeeting: boolean;
  diagnosticString: string;
} {
  const { updatedBuffer: newPolicyRateLagBuffer, laggedValue: laggedPolicyRate } = pushAndReadLagged(region.policyRateLagBuffer || [], region.policyRate, 6);
  const { updatedBuffer: newDemandShockLagBuffer, laggedValue: laggedDemandShock } = pushAndReadLagged(region.demandShockLagBuffer || [], globalShock.gdpShock, 4);
  
  const updatedWeather = evolveRegionalWeather(region.id, region.weather, week);

  const weatherDecay = Math.pow(0.55, Math.max(0, updatedWeather.weeksActive - 1));
  let weatherInfShock = updatedWeather.inflationImpactPct * weatherDecay;
  
  if (updatedWeather.affectedCommodityId && prevCommodities.length > 0) {
    const affectedComm = prevCommodities.find(c => c.id === updatedWeather.affectedCommodityId || c.symbol === updatedWeather.affectedCommodityId);
    if (affectedComm && affectedComm.historicalPrices.length >= 2) {
      const lastPrice = affectedComm.historicalPrices[affectedComm.historicalPrices.length - 1];
      const prevPrice = affectedComm.historicalPrices[affectedComm.historicalPrices.length - 2];
      const realizedCommodityChangePct = (lastPrice - prevPrice) / prevPrice;
      const consumptionBasketWeight = 0.03; // Assumed share of CPI basket
      weatherInfShock = (realizedCommodityChangePct * consumptionBasketWeight) * weatherDecay;
    }
  }

  // Micro-to-Macro Transmission:
  // 1. Margin compression forces hiring freezes, cooling wage inflation
  const laborCooling = microFeedback.marginCompression * 0.15;
  
  // 3. Fiscal deficit > 6% injects supply-side term premium
  const fiscalDeficitTermPremium = region.fiscalDeficitPctGdp > 0.06 ? (region.fiscalDeficitPctGdp - 0.06) * 0.4 : 0;

  const infNoise = (Math.random() - 0.5) * 0.0008 + globalShock.inflationShock + weatherInfShock * 0.20 - laborCooling * 0.0008;

  // GDP Growth is derived bottom-up from C+I+G+NX identity in simulation core (Phase 4)
  const potentialGdp = region.potentialGdpGrowth;
  const newGdpGrowth = region.gdpGrowth;

  const prevHS: HouseholdState = region.householdState || {
    consumerConfidence: 100,
    wageGrowth: region.wageGrowth,
    savingsRate: 0.06,
    realConsumptionGrowth: 0.02,
    householdDebtToIncomeRatio: 1.05,
    stapleSpendShare: 0.35,
    standardSpendShare: 0.50,
    luxurySpendShare: 0.15,
    depositsUSD: region.estimatedHouseholdIncomeUSD * 0.6,
    equityHoldingsUSD: region.estimatedHouseholdIncomeUSD * 1.5,
    mortgageDebtUSD: region.estimatedHouseholdIncomeUSD * 0.8,
    creditCardDebtUSD: region.estimatedHouseholdIncomeUSD * 0.05,
    otherConsumerLoanDebtUSD: region.estimatedHouseholdIncomeUSD * 0.1,
    netWorthUSD: region.estimatedHouseholdIncomeUSD * 1.0,
    creditTierBooks: [
      { tier: 'SUPER_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: 0, avgInterestRate: 0.06, delinquencyRatePct: 0.002 },
      { tier: 'PRIME', shareOfHouseholds: 0.35, debtBalanceUSD: 0, avgInterestRate: 0.12, delinquencyRatePct: 0.015 },
      { tier: 'NEAR_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: 0, avgInterestRate: 0.19, delinquencyRatePct: 0.045 },
      { tier: 'SUBPRIME', shareOfHouseholds: 0.15, debtBalanceUSD: 0, avgInterestRate: 0.28, delinquencyRatePct: 0.11 },
    ],
  };

  let newFiscalStanceScore = region.fiscalStanceScore;
  let newStructuralDeficitPctGdp = region.structuralDeficitPctGdp;
  const piStar = region.targetInflation;

  // Evaluate once per quarter, same cadence as monetary policy meetings
  if (week % 13 === 0) {
    if (region.cycleRegime === 'Recession' && region.unemploymentRate > 0.07) {
      newFiscalStanceScore = Math.min(1, region.fiscalStanceScore + 0.15); // stimulus package
    } else if (region.cycleRegime === 'Expansion' && region.inflation > piStar + 0.03) {
      newFiscalStanceScore = Math.max(-1, region.fiscalStanceScore - 0.10); // austerity/consolidation
    } else {
      newFiscalStanceScore = region.fiscalStanceScore * 0.95; // slow decay back to neutral
    }
    const stanceChange = newFiscalStanceScore - region.fiscalStanceScore;
    newStructuralDeficitPctGdp = (region.structuralDeficitPctGdp + stanceChange * 0.05);
  }

  // Process recession shocks
  const remainingShocks = region.recessionShockQueue.filter(s => s.week !== week);

  // 1. Autoregressive AR(1) base with anchor to target inflation piStar + supply noise
  const infPersistence = 0.98;
  const baseInflation = (region.inflation * infPersistence) + (piStar * (1 - infPersistence)) + infNoise;
  let newInflation = Number(baseInflation.toFixed(4));

  const smoothedAnnualizedGrowthForFiscal = ((region as any).smoothedWeeklyGrowthRate ?? newGdpGrowth / 52) * 52;
  const outputGap = potentialGdp - smoothedAnnualizedGrowthForFiscal;
  const targetCyclicalDeficitComponent = 0.15 * Math.tanh(outputGap * 2);
  const prevCyclicalDeficitComponent = (region as any).cyclicalDeficitComponent ?? targetCyclicalDeficitComponent;
  const cyclicalDeficitComponent = prevCyclicalDeficitComponent * 0.85 + targetCyclicalDeficitComponent * 0.15;
  const newFiscalDeficitPctGdp = newStructuralDeficitPctGdp + cyclicalDeficitComponent;

  const newEstimatedNominalGdpUSD = (region as any).lastWeekNominalGdpUSD > 0 ? (region as any).lastWeekNominalGdpUSD : region.estimatedNominalGdpUSD;

  // Tax rate is a slow second fiscal lever — austerity nudges it up, stimulus nudges it down, same cadence as fiscalStanceScore
  const taxRateDrift = week % 13 === 0 ? -newFiscalStanceScore * 0.001 : 0;
  const newEffectiveTaxRate = Math.max(0.10, Math.min(0.50, isFinite(region.effectiveTaxRate + taxRateDrift) ? region.effectiveTaxRate + taxRateDrift : 0.25));

  const newGovernmentRevenueUSD = Math.max(1e8, newEstimatedNominalGdpUSD * newEffectiveTaxRate / 52); // weekly flow
  const newGovernmentSpendingUSD = Math.max(1e8, newGovernmentRevenueUSD + (newEstimatedNominalGdpUSD * newFiscalDeficitPctGdp) / 52); // spending = revenue + deficit, by definition

  let newCycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery' = 'Slowdown';
  if (newGdpGrowth < 0) newCycleRegime = 'Recession';
  else if (newGdpGrowth > potentialGdp + 0.005) newCycleRegime = region.cycleRegime === 'Recession' ? 'Recovery' : 'Expansion';
  else if (region.cycleRegime === 'Recession' && newGdpGrowth >= 0) newCycleRegime = 'Recovery';

  const participationDrift = newCycleRegime === 'Recession' ? -0.0003 : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
  const newParticipation = (region.laborForceParticipation + participationDrift);

  // Slow demographic drift — independent of the business cycle
  const nonEmployableDrift = (Math.random() - 0.5) * 0.00002; // tiny, structural, not cycle-driven
  const newNonEmployablePct = (region.nonEmployablePct + nonEmployableDrift);

  // Government employment responds to real spending growth
  const spendingGrowthRate = region.governmentSpendingUSD > 0 ? (newGovernmentSpendingUSD - region.governmentSpendingUSD) / region.governmentSpendingUSD : 0;
  // Government spending has its own startup transient (near-zero/degenerate at generation, then jumping to
  // its real mature value once evolution first runs) — bidirectional, since the transient can show up as
  // either an anomalous spike or an anomalous collapse depending on which value is compared against which.
  const isGovSpendingStartupTransition = region.governmentSpendingUSD < newGovernmentSpendingUSD * 0.2 || newGovernmentSpendingUSD < region.governmentSpendingUSD * 0.2;
  const targetGovEmploymentGrowthRate = isGovSpendingStartupTransition ? 0 : (spendingGrowthRate * 0.3);
  const prevGovEmploymentGrowthRate = (region as any).govEmploymentGrowthRate ?? targetGovEmploymentGrowthRate;
  const govEmploymentGrowthRate = prevGovEmploymentGrowthRate * 0.85 + targetGovEmploymentGrowthRate * 0.15;
  const newGovernmentEmployment = Math.max(1, Math.round(region.governmentEmployment * (1 + govEmploymentGrowthRate)));

  let newPotentialGdpGrowth = region.potentialGdpGrowth;
  if (week % 52 === 0) {
    const laborForceTrend = (newParticipation - region.laborForceParticipation) * 52;
    const capexIntensityTrend = (microFeedback.capexGdpContribution * 0.15);
    const potentialGdpDrift = laborForceTrend * 0.3 + capexIntensityTrend;
    newPotentialGdpGrowth = (Number((region.potentialGdpGrowth + potentialGdpDrift).toFixed(4)));
  }

  const potentialGdpDelta = newPotentialGdpGrowth - region.potentialGdpGrowth;
  const newNeutralRate = Number((region.neutralRate + potentialGdpDelta).toFixed(4));

  const isHighUnemp = region.unemploymentRate > region.nairu + 0.005;
  const weeksAboveNairu = isHighUnemp ? (region.weeksAboveNairu ?? 0) + 1 : Math.max(0, (region.weeksAboveNairu ?? 0) - 2);
  const hysteresis = Math.min(0.015, weeksAboveNairu * 0.00005);
  const hysteresisDelta = isHighUnemp ? hysteresis / 52 : -hysteresis / 104;
  const baseNairu = week % 52 === 0
    ? (Number((region.nairu + (newParticipation - region.laborForceParticipation) * 52 * 0.15).toFixed(4)))
    : region.nairu;
  const newNairu = Number((baseNairu + hysteresisDelta).toFixed(4));

  const baseUnempChange = ((potentialGdp - newGdpGrowth) * 0.35) / 52 + microFeedback.bottomUpUnemploymentDelta + (microFeedback.marginCompression > 0 ? 0.0001 : 0) - laggedDemandShock * 0.1;
  const nairuPull = (newNairu - region.unemploymentRate) * 0.001;
  const participationEffect = -(newParticipation - region.laborForceParticipation) * 0.5;
  const newUnemployment = Math.max(0.015, Math.min(0.25, Number((region.unemploymentRate + baseUnempChange + nairuPull + participationEffect).toFixed(4))));
  const unempDelta = newUnemployment - region.unemploymentRate;

  // Consumer & Household Sector Simulation
  const nairu = newNairu; 
  const slackGap = nairu - newUnemployment;
  
  // Wage Lag (Part QC) - Smooth slackGap with EMA representing a multi-week lag structure
  const prevSmoothedSlackGap = region.smoothedSlackGap !== undefined ? region.smoothedSlackGap : slackGap;
  const newSmoothedSlackGap = prevSmoothedSlackGap * 0.85 + slackGap * 0.15;
  
  const taperedSlackEffect = newSmoothedSlackGap > 0.01 ? 0.01 + (newSmoothedSlackGap - 0.01) * 0.3 : newSmoothedSlackGap;
  const newWageGrowth = (0.025 + 0.8 * taperedSlackEffect + 0.1 * region.expectedInflation);
  const { updatedBuffer: newWageGrowthLagBuffer, laggedValue: laggedWageGrowth } = pushAndReadLagged(region.wageGrowthLagBuffer || [], newWageGrowth, 3);
  
  const cciUnempMultiplier = (newCycleRegime === 'Recession' || newCycleRegime === 'Slowdown') && unempDelta > 0 ? 0.75 : 0.5;
  const contagionHit = microFeedback.creditContagionBps > 50 ? (microFeedback.creditContagionBps / 100) * 0.5 : 0;
  const cciEquilibrium = 100 + (newWageGrowth - region.inflation) * 150 - Math.max(0, newUnemployment - nairu) * 200 - Math.max(0, region.expectedInflation - piStar) * 80 + laggedDemandShock * 1000;
  const cciReversion = (cciEquilibrium - prevHS.consumerConfidence) * 0.08;
  const unempShock = unempDelta > 0 ? cciUnempMultiplier * unempDelta * 100 : 0;
  const boundedEquityReturn = Math.max(-0.5, Math.min(0.5, isFinite(equityReturn) ? equityReturn : 0));
  const rawCCI = prevHS.consumerConfidence + cciReversion + 0.05 * (boundedEquityReturn * 100) - unempShock - contagionHit;
  const newCCI = isFinite(rawCCI) ? Math.max(30, Math.min(170, Number(rawCCI.toFixed(2)))) : 100;

  // Population Growth & Net Migration Dynamics (Part AG)
  const migrationAttractivenessSignal = Math.max(-0.01, Math.min(0.01, (((newCCI - 100) / 100) * 0.0006)));
  const birthRate = region.birthRateAnnual ?? 0.010;
  const deathRate = region.deathRateAnnual ?? 0.009;
  const migrationRate = region.netMigrationRateAnnual ?? 0.002;
  const netAnnualGrowthRate = Math.max(-0.03, Math.min(0.04, birthRate - deathRate + migrationRate + migrationAttractivenessSignal));
  const netPopulationGrowthRate = netAnnualGrowthRate / 52;
  const newTotalPopulation = Math.max(1, Math.round(region.totalPopulation * (1 + netPopulationGrowthRate)));
  const totalLaborForce = newTotalPopulation * (1 - newNonEmployablePct) * newParticipation;

  const savingsBaseline = 0.05 + Math.max(0, region.expectedInflation - piStar) * 0.5 - 0.1 * ((newCCI - 100) / 100);
  const realRateGap = laggedPolicyRate - newNeutralRate;
  const rateSavingsIncentive = (realRateGap * 0.4);
  const newSavingsRate = (savingsBaseline + rateSavingsIncentive);

  // Net new lending from banking sector expands deposits
  const estBusinessLoanBook = microFeedback.businessLoanBookInputUSD;
  const bankedConsumerDebtShare = 0.1167;
  const estConsumerLoanBook = prevHS.householdDebtToIncomeRatio * region.estimatedHouseholdIncomeUSD * bankedConsumerDebtShare;
  const netNewLending = Math.max(0, estBusinessLoanBook - region.bankingSector.businessLoanBookUSD) + Math.max(0, estConsumerLoanBook - region.bankingSector.consumerLoanBookUSD);

  // 1. Asset side
  // Savings flow into deposits + portion of new lending (loan disbursements, payroll funded by credit)
  const weeklySavingsUSD = (region.estimatedHouseholdIncomeUSD * newSavingsRate) / 52;
  const depositInterestUSD = (prevHS.depositsUSD || 0) * (region.policyRate * 0.6) / 52;
  const newDepositsUSD = Math.max(0, (prevHS.depositsUSD || 0) + weeklySavingsUSD + depositInterestUSD + netNewLending * 0.15);

  // Equities appreciate / depreciate with the region's market return
  const newEquityHoldingsUSD = Math.max(0, (prevHS.equityHoldingsUSD || 0) * (1 + equityReturn));

  // 2. Liability side
  // Principal paydown rates (weekly)
  const mortgagePaydownRate = 0.0004; // ~2% principal amortization/yr
  const otherLoanPaydownRate = 0.003; // ~15%/yr (auto, personal loans)
  const ccPaydownRate = 0.04;        // ~4%/wk revolving turnover

  // New borrowing demand scales with CCI and policy rate:
  const borrowingMultiplier = (
    1.0 + (newCCI - 100) / 100 * 0.5 - (region.policyRate - newNeutralRate) * 4
  );

  const weeklyNewMortgagesUSD = (prevHS.mortgageDebtUSD || 0) * mortgagePaydownRate * borrowingMultiplier;
  const weeklyNewCCDebtUSD = (prevHS.creditCardDebtUSD || 0) * ccPaydownRate * borrowingMultiplier;
  const weeklyNewOtherLoansUSD = (prevHS.otherConsumerLoanDebtUSD || 0) * otherLoanPaydownRate * borrowingMultiplier;

  const newMortgageDebtUSD = Math.max(0, (prevHS.mortgageDebtUSD || 0) * (1 - mortgagePaydownRate) + weeklyNewMortgagesUSD);
  const newCreditCardDebtUSD = Math.max(0, (prevHS.creditCardDebtUSD || 0) * (1 - ccPaydownRate) + weeklyNewCCDebtUSD);
  const newOtherLoanDebtUSD = Math.max(0, (prevHS.otherConsumerLoanDebtUSD || 0) * (1 - otherLoanPaydownRate) + weeklyNewOtherLoansUSD);

  // Occupation Pools & Retraining Dynamics (Stage 2: X3 & X4)
  const defaultOccupationShares: Record<OccupationType, number> = {
    GENERAL: 0.55,
    SKILLED_TRADES: 0.15,
    TECHNICAL_ENGINEERING: 0.12,
    SPECIALIZED_PROFESSIONAL: 0.08,
    MANAGERIAL_FINANCIAL: 0.10,
  };
  const currentLaborForceShares = region.occupationLaborForceShare || defaultOccupationShares;
  const currentOccupationPools = region.occupationPools || {
    GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
  };

  const occDemandInput = microFeedback.occupationDemand || {
    GENERAL: 0,
    SKILLED_TRADES: 0,
    TECHNICAL_ENGINEERING: 0,
    SPECIALIZED_PROFESSIONAL: 0,
    MANAGERIAL_FINANCIAL: 0,
  };

  const newOccupationPools = (Object.keys(currentOccupationPools) as OccupationType[]).reduce((acc, occ) => {
    const pool = currentOccupationPools[occ];
    const availableSupply = totalLaborForce * (currentLaborForceShares[occ] ?? defaultOccupationShares[occ]);
    const demandForThisOccupation = occDemandInput[occ] ?? 0;
    const rawTightness = availableSupply > 0 ? demandForThisOccupation / availableSupply : 1.0;
    const tightness = Math.max(0.2, Math.min(2.5, rawTightness));

    const targetWageGrowth = ((tightness - 0.92) * 0.4);
    const rawWageGrowthAnnual = pool.wageGrowthAnnual * 0.9 + targetWageGrowth * 0.1;
    const newWageGrowthAnnual = Math.max(-0.05, Math.min(0.15, rawWageGrowthAnnual));
    const newWageIndex = Math.max(0.1, Math.min(10.0, pool.wageIndex * (1 + newWageGrowthAnnual / 52)));
    acc[occ] = {
      employed: Math.min(availableSupply, demandForThisOccupation),
      wageIndex: Number(newWageIndex.toFixed(4)),
      wageGrowthAnnual: Number(newWageGrowthAnnual.toFixed(4)),
    };
    return acc;
  }, {} as Record<OccupationType, OccupationPool>);

  // X4: Retraining friction — slow, asymmetric flow between pools
  const avgWageIndex = (Object.values(newOccupationPools) as OccupationPool[]).reduce((s, p) => s + p.wageIndex, 0) / 5;
  const newLaborForceShares: Record<OccupationType, number> = { ...currentLaborForceShares };
  (Object.keys(newOccupationPools) as OccupationType[]).forEach(occ => {
    const wageGapVsAvg = newOccupationPools[occ].wageIndex / Math.max(0.01, avgWageIndex) - 1;
    const retrainingSpeed = occ === 'GENERAL' ? 0.015 : (occ === 'SPECIALIZED_PROFESSIONAL' || occ === 'TECHNICAL_ENGINEERING') ? 0.003 : 0.008;
    newLaborForceShares[occ] = ((currentLaborForceShares[occ] ?? defaultOccupationShares[occ]) + wageGapVsAvg * retrainingSpeed);
  });

  const shareSum = Object.values(newLaborForceShares).reduce((s, v) => s + v, 0);
  if (shareSum > 0) {
    (Object.keys(newLaborForceShares) as OccupationType[]).forEach(occ => {
      newLaborForceShares[occ] = Number((newLaborForceShares[occ] / shareSum).toFixed(4));
    });
  }

  // Private-Sector Segments evolution driven by specific demand signals & occupational wage costs
  const rawMortgageGrowthSignal = prevHS.mortgageDebtUSD > 0 ? (newMortgageDebtUSD / prevHS.mortgageDebtUSD - 1) * 52 : 0;
  const mortgageGrowthSignal = Number.isFinite(rawMortgageGrowthSignal) ? Math.max(-0.15, Math.min(0.20, rawMortgageGrowthSignal)) : 0;
  const seedMarginByType: Record<PrivateSegmentType, number> = {
    MANUFACTURING: 0.09,
    PROFESSIONAL_SERVICES: 0.14,
    RETAIL_TRADE: 0.05,
    CONSTRUCTION_REALESTATE: 0.10,
    HEALTHCARE_SERVICES: 0.12,
  };

  const newPrivateSectorSegments: any[] = (region.privateSectorSegments || []).map(seg => {
    const demandSignal = seg.segmentType === 'CONSTRUCTION_REALESTATE' ? mortgageGrowthSignal : getSegmentDemandSignal(seg.segmentType, region, prevHS);
    const employmentGrowthRate = Math.max(-0.04, Math.min(0.04, demandSignal * 0.05));
    const newEmployment = Math.max(1, Math.round(seg.employment * (1 + employmentGrowthRate / 52)));
    const revenueGrowthRate = Math.max(-0.04, Math.min(0.05, demandSignal * 0.06));
    const newAnnualRevenueUSD = Math.max(1, seg.annualRevenueUSD * (1 + revenueGrowthRate / 52));

    const segOccMix = PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType] ?? { GENERAL: 1.0 };
    const segWageGrowth = getBlendedWageGrowth(segOccMix, newOccupationPools);
    const wageDrag = Math.max(0, segWageGrowth - 0.028) * 0.05;

    const marginReversion = (seedMarginByType[seg.segmentType] - seg.marginPct) * 0.02; // pulls back toward each segment's realistic baseline
    const marginDrift = (demandSignal * 0.01) + marginReversion - wageDrag * 0.02;
    const newMarginPct = (seg.marginPct + marginDrift); // ceiling lowered from 0.30 to 0.22
    const segmentDebtServiceCoverage = newAnnualRevenueUSD * newMarginPct / Math.max(1, ((seg as any).debtUSD ?? (newAnnualRevenueUSD * 2)) * 0.08);
    const newDefaultRateAnnualPct = Math.max(0.005, Math.min(0.15, 0.02 + (1 / Math.max(0.5, segmentDebtServiceCoverage)) * 0.03 + region.bankingSector.creditConditionsIndex * 0.02));
    const formationRate = Math.max(-0.002, Math.min(0.002, (demandSignal - newDefaultRateAnnualPct) * 0.1));
    const finalEmployment = Math.max(1, Math.round(newEmployment * (1 + formationRate)));

    return {
      segmentType: seg.segmentType,
      employment: finalEmployment,
      annualRevenueUSD: Number(newAnnualRevenueUSD.toFixed(0)),
      marginPct: Number(newMarginPct.toFixed(4)),
      debtUSD: (seg as any).debtUSD ?? (newAnnualRevenueUSD * 2),
      defaultRateAnnualPct: newDefaultRateAnnualPct,
      capexUSD: newAnnualRevenueUSD * 0.05,
    };
  });

  const totalPrivateSegmentEmployment = newPrivateSectorSegments.reduce((s, seg) => s + seg.employment, 0);
  const totalEmployed = microFeedback.publicCompanyEmployment + newGovernmentEmployment + totalPrivateSegmentEmployment;
  const newUnemploymentRateBottomUp = totalLaborForce > 0 ? Math.max(0, Math.min(1, (totalLaborForce - totalEmployed) / totalLaborForce)) : region.unemploymentRateBottomUp;

  const totalHouseholdDebtUSD = newMortgageDebtUSD + newCreditCardDebtUSD + newOtherLoanDebtUSD;
  const newHouseholdDebtToIncomeRatio = region.estimatedHouseholdIncomeUSD > 0
    ? totalHouseholdDebtUSD / region.estimatedHouseholdIncomeUSD
    : prevHS.householdDebtToIncomeRatio;

  // 3. Net worth
  const newNetWorthUSD = newDepositsUSD + newEquityHoldingsUSD - totalHouseholdDebtUSD;
  const netWorthToIncomeRatio = region.estimatedHouseholdIncomeUSD > 0
    ? newNetWorthUSD / region.estimatedHouseholdIncomeUSD
    : 1.0;

  // 4. Wealth-effect correction in CCI & consumption:
  const balanceSheetWealthEffect = ((netWorthToIncomeRatio - 1.0) * 0.006);
  const creditFundedSpendingUSD = (weeklyNewCCDebtUSD + weeklyNewOtherLoansUSD) * 0.8; // credit directly buying goods
  const weeklyIncomeUSD = region.estimatedHouseholdIncomeUSD / 52;
  const creditSpendingBoostPct = weeklyIncomeUSD > 0 ? (creditFundedSpendingUSD / weeklyIncomeUSD) * 0.05 : 0;

  // Correct debtServiceBurden to use the real liability-weighted rate:
  const effectiveBorrowingRate = (
    newMortgageDebtUSD * (region.zeroRates.tenor5Y + 0.015) +
    newCreditCardDebtUSD * (region.policyRate + 0.14) +
    newOtherLoanDebtUSD * (region.policyRate + 0.05)
  ) / Math.max(1, totalHouseholdDebtUSD);

  const newDebtServiceBurden = (totalHouseholdDebtUSD * (effectiveBorrowingRate / 52)) / Math.max(1, weeklyIncomeUSD);
  const baselineDebtServiceBurden = 0.055; // Baseline ~5.5% debt service burden of household income
  const debtServiceDrag = (newDebtServiceBurden - baselineDebtServiceBurden) * 0.4;

  // Update newRealConsumptionGrowth with real balance-sheet channels:
  const trendConsumptionGrowth = region.potentialGdpGrowth * (newCCI / 100);
  const realWageGainEffect = (1 - newSavingsRate) * (laggedWageGrowth - region.inflation - 0.005);
  const newRealConsumptionGrowth = trendConsumptionGrowth
    + realWageGainEffect
    + balanceSheetWealthEffect
    + creditSpendingBoostPct
    - debtServiceDrag;

  const wealthSignal = (equityReturn * 0.3 + (newCCI - 100) / 100 * 0.01);
  const targetLuxuryShare = (prevHS.luxurySpendShare + wealthSignal);
  const targetStapleShare = (prevHS.stapleSpendShare - wealthSignal * 0.6);
  const newLuxuryShare = Number((prevHS.luxurySpendShare * 0.95 + targetLuxuryShare * 0.05).toFixed(4));
  const newStapleShare = Number((prevHS.stapleSpendShare * 0.95 + targetStapleShare * 0.05).toFixed(4));
  const newStandardShare = Number(Math.max(0.15, 1 - newLuxuryShare - newStapleShare).toFixed(4));

  const totalWageIncomeUSD = (Object.keys(newOccupationPools) as OccupationType[]).reduce((sum, occ) => {
    const pool = newOccupationPools[occ];
    return sum + BASE_ANNUAL_WAGE_USD[occ] * pool.wageIndex * pool.employed;
  }, 0);
  const unemploymentReplacementRate = 0.35;
  const unemploymentTransferIncomeUSD = (Object.keys(newOccupationPools) as OccupationType[]).reduce((sum, occ) => {
    const pool = newOccupationPools[occ];
    const availableSupplyForOcc = totalLaborForce * (currentLaborForceShares[occ] ?? defaultOccupationShares[occ]);
    const unemployedInPool = Math.max(0, availableSupplyForOcc - pool.employed);
    return sum + BASE_ANNUAL_WAGE_USD[occ] * pool.wageIndex * unemployedInPool * unemploymentReplacementRate;
  }, 0);
  const capitalIncomeUSD = totalWageIncomeUSD * 0.15;
  const newEstimatedHouseholdIncomeUSD = Number((totalWageIncomeUSD + unemploymentTransferIncomeUSD + capitalIncomeUSD).toFixed(0));

  const householdStressSignal = (newUnemployment - region.nairu) * 0.02; // no clamp
  
  const specializedStress = (newOccupationPools.SPECIALIZED_PROFESSIONAL.wageGrowthAnnual < 0 ? 1 : 0) + (newOccupationPools.TECHNICAL_ENGINEERING.wageGrowthAnnual < 0 ? 1 : 0);
  const generalStress = (newOccupationPools.GENERAL.wageGrowthAnnual < 0 ? 1 : 0);

  const shiftFraction = Math.max(0, householdStressSignal * 1.5); // fraction of each tier to shift down

  const superPrimePrev = region.householdState.creditTierBooks.find(t => t.tier === 'SUPER_PRIME')?.shareOfHouseholds ?? 0.25;
  const primePrev = region.householdState.creditTierBooks.find(t => t.tier === 'PRIME')?.shareOfHouseholds ?? 0.50;
  const nearPrimePrev = region.householdState.creditTierBooks.find(t => t.tier === 'NEAR_PRIME')?.shareOfHouseholds ?? 0.15;
  const subprimePrev = region.householdState.creditTierBooks.find(t => t.tier === 'SUBPRIME')?.shareOfHouseholds ?? 0.10;

  const superPrimeShift = superPrimePrev * shiftFraction;
  const newSuperPrime = Math.max(0.01, superPrimePrev - superPrimeShift);

  const primeShift = (primePrev + superPrimeShift) * shiftFraction;
  const newPrime = Math.max(0.01, (primePrev + superPrimeShift) - primeShift);

  const nearPrimeShift = (nearPrimePrev + primeShift) * shiftFraction;
  const newNearPrime = Math.max(0.01, (nearPrimePrev + primeShift) - nearPrimeShift);

  const newSubprime = Math.max(0.01, subprimePrev + nearPrimeShift);

  const updatedTiers = region.householdState.creditTierBooks.map(tier => {
    let newShare = tier.shareOfHouseholds;
    if (tier.tier === 'SUPER_PRIME') newShare = newSuperPrime;
    else if (tier.tier === 'PRIME') newShare = newPrime;
    else if (tier.tier === 'NEAR_PRIME') newShare = newNearPrime;
    else if (tier.tier === 'SUBPRIME') newShare = newSubprime;

    const tierStress = householdStressSignal + (tier.tier === 'SUBPRIME' || tier.tier === 'NEAR_PRIME' ? generalStress * 0.01 : specializedStress * 0.01);
    const cci = region.bankingSector.creditConditionsIndex;
    let newAvgInterestRate = tier.avgInterestRate;
    let newDelinquency = tier.delinquencyRatePct + tierStress * (tier.tier === 'SUBPRIME' ? 1.5 : tier.tier === 'NEAR_PRIME' ? 0.8 : tier.tier === 'PRIME' ? 0.3 : 0.1);

    if (tier.tier === 'SUBPRIME') {
      newAvgInterestRate = tier.avgInterestRate + cci * 0.05;
    } else if (tier.tier === 'NEAR_PRIME') {
      newAvgInterestRate = tier.avgInterestRate + cci * 0.03;
    } else if (tier.tier === 'PRIME') {
      newAvgInterestRate = tier.avgInterestRate + cci * 0.01;
    } else if (tier.tier === 'SUPER_PRIME') {
      newAvgInterestRate = tier.avgInterestRate + cci * 0.005;
    }
    
    newDelinquency = Math.max(0.001, newDelinquency);

    return {
      ...tier,
      shareOfHouseholds: newShare,
      avgInterestRate: Math.max(0.02, newAvgInterestRate),
      delinquencyRatePct: newDelinquency
    };
  });

  const totalShare = updatedTiers.reduce((s, t) => s + t.shareOfHouseholds, 0);
  const normalizedTiers = updatedTiers.map(t => ({
    ...t,
    shareOfHouseholds: t.shareOfHouseholds / totalShare,
    debtBalanceUSD: (newCreditCardDebtUSD + newOtherLoanDebtUSD) * (t.shareOfHouseholds / totalShare)
  }));

  // Central bank stance and banking sector evolution
  const targetBalanceSheetStance = (
    (Math.max(0, 0.07 - newUnemployment) * -8) +
    (Math.max(0, newUnemployment - 0.07) * 10) +
    (Math.max(0, newInflation - 0.04) * -6)
  );
  const newBalanceSheetStance = (region.balanceSheetStance ?? 0) * 0.95 + targetBalanceSheetStance * 0.05;
  const cbFloor = 300e9; // Structural floor for central bank assets (currency in circulation & baseline reserves)
  const newCbBalance = Math.max(cbFloor, region.centralBankBalanceSheet * (1 + newBalanceSheetStance * 0.001));
  const cbChangePct = (newCbBalance - region.centralBankBalanceSheet) / Math.max(cbFloor, region.centralBankBalanceSheet);

  const newBankingSector = evolveBankingSector(
    region.bankingSector,
    microFeedback.businessLoanBookInputUSD,
    prevHS.householdDebtToIncomeRatio,
    newEstimatedHouseholdIncomeUSD,
    newSavingsRate,
    region.policyRate,
    microFeedback.creditContagionBps,
    newUnemployment,
    region.zeroRates.tenor10Y,
    newBalanceSheetStance,
    newGdpGrowth,
    region.creditConditionsSpilloverAdjustment ?? 0,
    microFeedback.monetizedAmountUSD ?? 0,
    normalizedTiers
  );

  const prevM2 = region.bankingSector.moneySupplyM2USD > 0
    ? region.bankingSector.moneySupplyM2USD
    : (region.bankingSector.depositsUSD + (region.bankingSector.centralBankReservesUSD ?? 1.2e12) * 0.1);
  const m2GrowthRateAnnualized = prevM2 > 0
    ? ((newBankingSector.moneySupplyM2USD / prevM2) - 1) * 52
    : 0;
  const velocityFactor = (1.0 - Math.max(0, (100 - newCCI) / 100) * 0.6); // low confidence suppresses velocity, dampening inflation pass-through
  const monetaryInflationPressure = ((m2GrowthRateAnnualized - newGdpGrowth) * 0.15 * velocityFactor);

  const wagePushInflation = (newWageGrowth - 0.015) * 0.8;
  
  // Wage-push and monetary inflation add to CPI (scaled for weekly turn)
  newInflation = Number((newInflation + wagePushInflation * 0.005 + monetaryInflationPressure * 0.005).toFixed(4));
  newInflation = isFinite(newInflation) ? Number(Math.max(-0.20, Math.min(0.50, newInflation)).toFixed(4)) : 0.025;
  const rawCore = newInflation * 0.92 + wagePushInflation * 0.1;
  const newCoreInflation = isFinite(rawCore) ? Number(Math.max(-0.20, Math.min(0.50, rawCore)).toFixed(4)) : 0.025;
  const rawExp = region.expectedInflation * 0.9 + newInflation * 0.1;
  const newExpectedInflation = isFinite(rawExp) ? Number(Math.max(-0.20, Math.min(0.50, rawExp)).toFixed(4)) : 0.025;

  // Calibrated Inertial Taylor Rule:
  // Target: i*_t = r* + pi_t + 0.5(pi_t - pi*) + 0.5(y_t - y*)
  const rStar = region.neutralRate; // US: 1.00%, UK: 0.75%, EU: 0.50%, JP: -0.25%
  
  const output_gap = Math.max(-0.10, Math.min(0.10, newGdpGrowth - potentialGdp));
  const inflation_gap = Math.max(-0.10, Math.min(0.10, newExpectedInflation - piStar));
  const taylorTarget = rStar + newExpectedInflation + 0.5 * inflation_gap + 0.5 * output_gap;
  const clampedTaylorTarget = Math.max(-0.01, Math.min(0.20, taylorTarget));

  let rateChanged = false;
  let rateDeltaBps = 0;
  let newInflationDeviationStreak = region.inflationDeviationStreak || 0;

  // Policy Lag: Smooth movement toward Taylor Target each week (moves 15% of the way)
  let newPolicyRate = Math.max(-0.01, Math.min(0.20, region.policyRate + 0.15 * (clampedTaylorTarget - region.policyRate)));

  // Update inflation deviation streak
  const isAboveTarget = region.inflation > piStar + 0.01;
  newInflationDeviationStreak = isAboveTarget ? (region.inflationDeviationStreak || 0) + 1 : Math.max(0, (region.inflationDeviationStreak || 0) - 2);

  const isMeeting = (week % 13 === 0);

  if (Math.abs(newPolicyRate - region.policyRate) > 0.0001) {
    rateChanged = true;
    rateDeltaBps = Math.round((newPolicyRate - region.policyRate) * 10000);
  }

  const smoothedTargetRate = taylorTarget; // Used for dot plot and curve parameters

  // --- DIAGNOSTIC TELEMETRY OUTPUT ---
  const capexBps = Math.round((microFeedback.capexGdpContribution ?? 0) * 10000);
  const consBps = Math.round(((prevHS.consumerConfidence ?? 100) - 100) * 0.0001 * 10000);
  const outGapBps = Math.round(output_gap * 10000);
  const infGapBps = Math.round(inflation_gap * 10000);
  
  const diagnosticString = `Prior GDP: ${(region.gdpGrowth * 100).toFixed(2)}% | CapEx Boost: ${capexBps > 0 ? '+' : ''}${capexBps} bps | Cons Demand: ${consBps > 0 ? '+' : ''}${consBps} bps | Net Realized GDP: ${(newGdpGrowth * 100).toFixed(2)}%
Potential GDP: ${(potentialGdp * 100).toFixed(2)}% | Output Gap: ${outGapBps > 0 ? '+' : ''}${outGapBps} bps | CPI: ${(newInflation * 100).toFixed(2)}% (Gap ${infGapBps > 0 ? '+' : ''}${infGapBps} bps)
Taylor Target: ${(taylorTarget * 100).toFixed(2)}% | Current Policy: ${(region.policyRate * 100).toFixed(2)}% | Meeting Decision: ${rateChanged ? `${rateDeltaBps > 0 ? '+' : ''}${rateDeltaBps} bps -> ${(newPolicyRate * 100).toFixed(2)}%` : 'Hold'}`;

  // Dot Plot projections converging toward Taylor target & long-run neutral
  const dotPlot1Y = Number((newPolicyRate * 0.4 + smoothedTargetRate * 0.6).toFixed(4));
  const dotPlot2Y = Number((smoothedTargetRate * 0.35 + (rStar + piStar) * 0.65).toFixed(4));

  const qePremium = (cbChangePct * -0.5);

  // Update Nelson-Siegel yield curve parameters
  const targetBeta0 = 0.035 + (newInflation - piStar) * 0.4 + fiscalDeficitTermPremium * 0.4 + (microFeedback.creditContagionBps / 10000) * 0.2 + qePremium * 2;
  const newBeta0 = Math.max(
    0.012,
    region.yieldCurveParams.beta0 * 0.98 + targetBeta0 * 0.02 + (Math.random() - 0.5) * 0.0003
  );
  const newBeta1 = newPolicyRate - newBeta0 + (Math.random() - 0.5) * 0.0002;
  const targetBeta2 = (newGdpGrowth - region.potentialGdpGrowth) * 2.0;
  const newBeta2 =
    region.yieldCurveParams.beta2 * 0.95 + targetBeta2 * 0.05 + (Math.random() - 0.5) * 0.0003;

  const newCurveParams: NelsonSiegelParams = {
    beta0: newBeta0,
    beta1: newBeta1,
    beta2: newBeta2,
    lambda: region.yieldCurveParams.lambda,
  };

  const newZeroRates = calculateTenorZeroRates(newCurveParams);

  let newInversionCount = region.inversionWeeksCount;
  if (newZeroRates.tenor2Y > newZeroRates.tenor10Y) {
    newInversionCount++;
    if (newInversionCount === 8) {
      // Push shock 13 weeks out
      remainingShocks.push({ week: week + 13, shock: -0.015 });
    }
  } else {
    newInversionCount = 0;
  }

  const nominalGdpGrowthWeekly = (newGdpGrowth + newInflation) / 52; // real growth + inflation ≈ nominal growth
  const weeklyDebtToGdpChange = (newFiscalDeficitPctGdp / 52) - (nominalGdpGrowthWeekly * region.debtToGdpPct);
  const newDebtToGdpPct = Number((region.debtToGdpPct + weeklyDebtToGdpChange).toFixed(4));

  let newSovereignRating = region.sovereignRating;
  if (week % 26 === 0) {
    if (newDebtToGdpPct > 1.2 && newFiscalDeficitPctGdp > 0.05) {
      if (newSovereignRating === 'AAA') newSovereignRating = 'AA';
      else if (newSovereignRating === 'AA') newSovereignRating = 'A';
      else if (newSovereignRating === 'A') newSovereignRating = 'BBB';
    } else if (newDebtToGdpPct < 0.9 && newFiscalDeficitPctGdp < 0.03) {
      if (newSovereignRating === 'BBB') newSovereignRating = 'A';
      else if (newSovereignRating === 'A') newSovereignRating = 'AA';
      else if (newSovereignRating === 'AA') newSovereignRating = 'AAA';
    }
  }

  const histPolicy = [...region.historicalPolicyRates.slice(-51), newPolicyRate];
  const histInf = [...region.historicalInflation.slice(-51), newInflation];
  const histCore = [...(region.historicalCoreInflation || region.historicalInflation).slice(-51), newCoreInflation];
  const histGdp = [...region.historicalGdpGrowth.slice(-51), newGdpGrowth];
  const histWage = [...(region.historicalWageGrowth || region.historicalInflation).slice(-51), Number((newWageGrowth).toFixed(4))];
  const histDebt = [...(region.historicalDebtToGdp || [1.0]).slice(-51), newDebtToGdpPct];
  const histCurves = [...region.historicalZeroCurves.slice(-51), { week, ...newZeroRates }];

  // PROJ-13: Housing as a real asset class
  const prevHousing = region.housingMarket ?? createHousingMarket(region.id, region.estimatedHouseholdIncomeUSD);
  const resDemand = region.categoryDemand?.['residential_construction']?.demandLevelUSD ?? 1e9;
  const resSupply = region.categoryDemand?.['residential_construction']?.inventoryLevelUSD ?? (resDemand * 0.1);
  const supplyDemandRatio = resSupply / Math.max(1, resDemand);
  const creditFactor = Math.max(0.5, Math.min(1.5, 1.0 + (newPolicyRate < 0.05 ? 0.02 : -0.02)));
  const priceIndexDelta = (1.0 - supplyDemandRatio) * 0.002 * creditFactor;
  const newPriceIndex = Math.max(0.5, Math.min(3.0, prevHousing.priceIndex + priceIndexDelta));
  const newMedianHomePriceUSD = Math.round((prevHousing.baselineHomePriceUSD || 400000) * newPriceIndex);
  const histPrices = [...(prevHousing.historicalPrices || []).slice(-51), newMedianHomePriceUSD];

  const updatedHousingMarket: HousingMarket = {
    ...prevHousing,
    medianHomePriceUSD: newMedianHomePriceUSD,
    baselineHomePriceUSD: prevHousing.baselineHomePriceUSD || 400000,
    priceIndex: Number(newPriceIndex.toFixed(4)),
    historicalPrices: histPrices,
    mortgageOriginationVolumeUSD: Number((newEstimatedHouseholdIncomeUSD * 0.05 * creditFactor).toFixed(0)),
  };

  // PROJ-17: Life-cycle household structure
  const prevLifeCycle = region.lifeCycleDistribution ?? createLifeCycleDistribution();
  const updatedLifeCycle = { ...prevLifeCycle };
  const birthDrift = (birthRate / 52) * 0.1;
  const retirementDrift = 0.0003;
  const deathDrift = (deathRate / 52) * 0.1;

  let ecShare = Math.max(0.05, prevLifeCycle.EARLY_CAREER.shareOfPopulation + birthDrift - retirementDrift * 0.5);
  let peShare = Math.max(0.05, prevLifeCycle.PEAK_EARNING.shareOfPopulation + retirementDrift * 0.3 - retirementDrift * 0.5);
  let prShare = Math.max(0.05, prevLifeCycle.PRE_RETIREMENT.shareOfPopulation + retirementDrift * 0.5 - retirementDrift * 0.3);
  let retShare = Math.max(0.05, prevLifeCycle.RETIRED.shareOfPopulation + retirementDrift * 0.5 - deathDrift);

  const totalLifeCycleShare = ecShare + peShare + prShare + retShare;
  updatedLifeCycle.EARLY_CAREER = { ...prevLifeCycle.EARLY_CAREER, shareOfPopulation: ecShare / totalLifeCycleShare };
  updatedLifeCycle.PEAK_EARNING = { ...prevLifeCycle.PEAK_EARNING, shareOfPopulation: peShare / totalLifeCycleShare };
  updatedLifeCycle.PRE_RETIREMENT = { ...prevLifeCycle.PRE_RETIREMENT, shareOfPopulation: prShare / totalLifeCycleShare };
  updatedLifeCycle.RETIRED = { ...prevLifeCycle.RETIRED, shareOfPopulation: retShare / totalLifeCycleShare };

  // PROJ-11: Household wealth/income segmentation
  const prevWealthDist = region.wealthDistribution ?? createWealthDistribution(region.estimatedHouseholdIncomeUSD);
  const updatedWealthDist = { ...prevWealthDist };

  const tierOccMixes: Record<WealthTier, Partial<Record<OccupationType, number>>> = {
    TOP_1: { MANAGERIAL_FINANCIAL: 0.50, SPECIALIZED_PROFESSIONAL: 0.35, TECHNICAL_ENGINEERING: 0.15 },
    TOP_9: { MANAGERIAL_FINANCIAL: 0.30, SPECIALIZED_PROFESSIONAL: 0.40, TECHNICAL_ENGINEERING: 0.20, SKILLED_TRADES: 0.10 },
    NEXT_40: { SKILLED_TRADES: 0.35, GENERAL: 0.35, TECHNICAL_ENGINEERING: 0.15, MANAGERIAL_FINANCIAL: 0.15 },
    BOTTOM_50: { GENERAL: 0.60, SKILLED_TRADES: 0.30, TECHNICAL_ENGINEERING: 0.10 },
  };

  const tierHomeEquityShares: Record<WealthTier, number> = {
    TOP_1: 0.05,
    TOP_9: 0.30,
    NEXT_40: 0.55,
    BOTTOM_50: 0.10,
  };

  const tierMpc: Record<WealthTier, number> = {
    BOTTOM_50: 0.98,
    NEXT_40: 0.92,
    TOP_9: 0.75,
    TOP_1: 0.45,
  };

  let totalTierWeeklyConsumptionUSD = 0;

  (Object.keys(updatedWealthDist) as WealthTier[]).forEach(t => {
    const prevData = updatedWealthDist[t];
    const mix = tierOccMixes[t];
    const tierWageGrowth = getBlendedWageGrowth(mix, newOccupationPools);
    const newIncomeUSD = Math.max(1000, prevData.shareOfIncomeUSD * (1 + tierWageGrowth / 52));

    const equityGain = prevData.shareOfNetWorthUSD * prevData.equityExposureShare * equityReturn;
    const savingsGain = (newIncomeUSD / 52) * prevData.savingsRate;

    const homeEquityUSD = Math.round(updatedHousingMarket.medianHomePriceUSD * updatedHousingMarket.ownershipRatePct * (newTotalPopulation / 2.5) * prevData.shareOfHouseholds * tierHomeEquityShares[t]);
    
    // Retired drawdown for lower/middle tiers
    const retiredDrawdown = (t === 'BOTTOM_50' || t === 'NEXT_40') ? (prevData.shareOfNetWorthUSD * Math.abs(updatedLifeCycle.RETIRED.savingsRate) / 52) : 0;

    const newNetWorth = Math.max(100, prevData.shareOfNetWorthUSD + equityGain + savingsGain + (homeEquityUSD - (prevData.homeEquityUSD ?? homeEquityUSD)) - retiredDrawdown);

    updatedWealthDist[t] = {
      ...prevData,
      shareOfIncomeUSD: Number(newIncomeUSD.toFixed(0)),
      shareOfNetWorthUSD: Number(newNetWorth.toFixed(0)),
      homeEquityUSD: Number(homeEquityUSD.toFixed(0)),
    };

    const weeklyInc = newIncomeUSD / 52;
    const weeklyDisp = weeklyInc * (1 - prevData.savingsRate);
    totalTierWeeklyConsumptionUSD += weeklyDisp * tierMpc[t];
  });

  const derivedTierConsumptionUSD = totalTierWeeklyConsumptionUSD * 52;

  const updatedRegion: Region = {
    ...region,
    wealthDistribution: updatedWealthDist,
    housingMarket: updatedHousingMarket,
    lifeCycleDistribution: updatedLifeCycle,
    cycleRegime: newCycleRegime,
    inversionWeeksCount: newInversionCount,
    recessionShockQueue: remainingShocks,
    centralBankBalanceSheet: newCbBalance,
    balanceSheetStance: newBalanceSheetStance,
    structuralDeficitPctGdp: newStructuralDeficitPctGdp,
    cyclicalDeficitComponent,
    govEmploymentGrowthRate,
    fiscalDeficitPctGdp: newFiscalDeficitPctGdp,
    fiscalStanceScore: newFiscalStanceScore,
    sovereignRating: newSovereignRating,
    laggedPolicyRateEMA: region.laggedPolicyRateEMA * 0.96 + newPolicyRate * 0.04,
    laborForceParticipation: newParticipation,
    inflationDeviationStreak: newInflationDeviationStreak,
    smoothedSlackGap: newSmoothedSlackGap,
    policyRateLagBuffer: newPolicyRateLagBuffer,
    wageGrowthLagBuffer: newWageGrowthLagBuffer,
    demandShockLagBuffer: newDemandShockLagBuffer,
    potentialGdpGrowth: newPotentialGdpGrowth,
    neutralRate: newNeutralRate,
    nairu: newNairu,
    weeksAboveNairu,
    policyRate: newPolicyRate,
    inflation: newInflation,
    coreInflation: newCoreInflation,
    expectedInflation: newExpectedInflation,
    wagePushInflation,
    monetaryInflationPressure,
    gdpGrowth: newGdpGrowth,
    wageGrowth: Number(newWageGrowth.toFixed(4)),
    debtToGdpPct: newDebtToGdpPct,
    unemploymentRate: newUnemployment,
    totalPopulation: newTotalPopulation,
    birthRateAnnual: birthRate,
    deathRateAnnual: deathRate,
    netMigrationRateAnnual: migrationRate,
    nonEmployablePct: newNonEmployablePct,
    governmentEmployment: newGovernmentEmployment,
    privateSectorSegments: newPrivateSectorSegments as any,
    occupationPools: newOccupationPools,
    occupationLaborForceShare: newLaborForceShares,
    unemploymentRateBottomUp: Number(newUnemploymentRateBottomUp.toFixed(4)),
    estimatedNominalGdpUSD: newEstimatedNominalGdpUSD,
    derivedNominalGdpUSD: region.derivedNominalGdpUSD ?? newEstimatedNominalGdpUSD,
    gdpGrowthBottomUp: region.gdpGrowthBottomUp ?? 0,
    nominalGdpHistory: region.nominalGdpHistory ?? [],
    lastWeekNominalGdpUSD: region.lastWeekNominalGdpUSD ?? (region.derivedNominalGdpUSD || newEstimatedNominalGdpUSD),
    activeContracts: region.activeContracts ?? [],
    consumptionComponentUSD: region.consumptionComponentUSD ?? 0,
    investmentComponentUSD: region.investmentComponentUSD ?? 0,
    effectiveTaxRate: newEffectiveTaxRate,
    governmentRevenueUSD: newGovernmentRevenueUSD,
    governmentSpendingUSD: newGovernmentSpendingUSD,
    householdState: {
      consumerConfidence: newCCI,
      creditTierBooks: normalizedTiers,
      wageGrowth: newWageGrowth,
      savingsRate: newSavingsRate,
      realConsumptionGrowth: newRealConsumptionGrowth,
      householdDebtToIncomeRatio: newHouseholdDebtToIncomeRatio,
      stapleSpendShare: newStapleShare,
      standardSpendShare: newStandardShare,
      luxurySpendShare: newLuxuryShare,
      netWorthUSD: newNetWorthUSD,
      depositsUSD: newDepositsUSD,
      equityHoldingsUSD: newEquityHoldingsUSD,
      mortgageDebtUSD: newMortgageDebtUSD,
      creditCardDebtUSD: newCreditCardDebtUSD,
      otherConsumerLoanDebtUSD: newOtherLoanDebtUSD,
    },
    bankingSector: newBankingSector,
    estimatedHouseholdIncomeUSD: newEstimatedHouseholdIncomeUSD,
    dotPlot1Y,
    dotPlot2Y,
    exportsUSD: region.exportsUSD ?? 0,
    importsUSD: region.importsUSD ?? 0,
    tradeBalance: region.tradeBalance ?? 0,
    yieldCurveParams: newCurveParams,
    zeroRates: newZeroRates,
    weather: updatedWeather,
    historicalPolicyRates: histPolicy,
    historicalInflation: histInf,
    historicalCoreInflation: histCore,
    historicalGdpGrowth: histGdp,
    historicalWageGrowth: histWage,
    historicalDebtToGdp: histDebt,
    historicalZeroCurves: histCurves,
  };

  return { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString };
}

/**
 * FX Uncovered Interest Rate Parity with stochastic drift and trade balance shocks
 */

export function evolveFxPair(fx: FxPair, regions: Record<RegionId, Region>): FxPair {
  const dt = 1 / 52;
  const baseRegion = regions[fx.base];
  const quoteRegion = regions[fx.quote];

  const rDomestic = quoteRegion.policyRate;
  const rForeign = baseRegion.policyRate;

  const rateDiff = rDomestic - rForeign;
  const sigmaFx = 0.08;
  const eps = (Math.random() - 0.5) * Math.sqrt(dt) * 2;

  const rawTradeShock = (((baseRegion.tradeBalance - quoteRegion.tradeBalance) / 1e12) * 0.002); const tradeShock = Math.max(-0.05, Math.min(0.05, rawTradeShock));

  const drift = rateDiff * dt * 0.3 + sigmaFx * eps + tradeShock;
  const newRate = Number((fx.rate * Math.exp(drift)).toFixed(4));
  const change1W = Number((newRate - fx.rate).toFixed(4));

  const basisNoise = (Math.random() - 0.5) * 2.0;
  const newBasisBps = Math.round(fx.basisSpreadBps + basisNoise + (rDomestic - rForeign) * 20);

  const hist = [...fx.historicalRates.slice(-51), newRate];

  return {
    ...fx,
    rate: newRate,
    change1W,
    historicalRates: hist,
    basisSpreadBps: Math.min(-2, Math.max(-80, newBasisBps)),
  };
}

/**
 * Evolve Commodities with Weather & Supply/Demand shocks
 */

export function computePrivateSegmentCommoditySupplyUSD(commodityId: string, regions: Record<RegionId, Region>): number {
  return (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => {
    const segs = regions[r].privateSectorSegments.filter(seg => (seg.producedCommodityIds || []).includes(commodityId));
    return s + segs.reduce((s2, seg) => s2 + (seg.annualRevenueUSD * 0.008) / segs.length / 52, 0); // a tagged segment's real commodity-specific output is a small slice of its total revenue, not 15% of the whole sector
  }, 0);
}

export function calibrateIntensityShare(commodityId: string, allCompanies: Company[], regions: Record<RegionId, Region>, subUnitId: string): number {
  const producers = allCompanies.filter(c => {
    if (commodityId === 'industrial_automation') {
      return (c.productLines || []).some(l => l.subUnitId === 'industrial_automation') && !c.isDefaulted;
    }
    return c.producedCommodityId === commodityId && !c.isDefaulted;
  });
  const publicWeeklySupplyUSD = producers.reduce((s, c) => {
    if (commodityId === 'industrial_automation') {
      const line = (c.productLines || []).find(l => l.subUnitId === 'industrial_automation')!;
      return s + (c.annualRevenue * line.revenueShare * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52;
    }
    return s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52;
  }, 0);
  const privateWeeklySupplyUSD = commodityId === 'industrial_automation' ? 0 : computePrivateSegmentCommoditySupplyUSD(commodityId, regions);
  const weeklySupplyUSD = publicWeeklySupplyUSD + privateWeeklySupplyUSD;
  const totalCategoryDemandUSD = (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => s + ((regions[r].categoryDemand as any)[subUnitId]?.demandLevelUSD ?? 0), 0);
  return totalCategoryDemandUSD > 0 ? (weeklySupplyUSD * 52) / totalCategoryDemandUSD : 0.01;
}

function computeCommodityClearingRatio(commodityId: string, allCompanies: Company[], comm: Commodity, regions: Record<RegionId, Region>, privateSegmentSupplyUSD: number): { ratio: number; supplyUnits: number; demandUnits: number } {
  const producers = allCompanies.filter(c => c.producedCommodityId === commodityId && !c.isDefaulted);
  const publicWeeklySupplyUSD = producers.reduce((s, c) => s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52, 0);
  const weeklySupplyUSD = publicWeeklySupplyUSD + privateSegmentSupplyUSD;

  const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId] || COMMODITY_CATEGORY_LINKAGE[comm.symbol];
  const totalCategoryDemandUSD = linkage ? (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => {
    const catDemand = (regions[r].categoryDemand as any)[linkage.subUnitId];
    return s + (catDemand?.demandLevelUSD ?? 0);
  }, 0) : 0;
  const baselineWeeklyDemandUSD = (totalCategoryDemandUSD * (linkage?.intensityShare ?? 0)) / 52;

  const baselineHistoricalPrice = comm.historicalPrices.length > 0 ? comm.historicalPrices[0] : comm.spotPrice;
  const referencePrice = baselineHistoricalPrice > 0 ? baselineHistoricalPrice : comm.spotPrice;
  const priceRatio = referencePrice > 0 ? comm.spotPrice / referencePrice : 1.0;
  const demandElasticity = -0.7; // low spot prices stimulate real industrial & consumer demand
  const supplyElasticity = 0.5; // low spot prices cause real production curtailment

  const demandUnits = comm.spotPrice > 0 ? (baselineWeeklyDemandUSD / referencePrice) * Math.pow(priceRatio, demandElasticity) : 0;
  const supplyUnits = comm.spotPrice > 0 ? (weeklySupplyUSD / referencePrice) * Math.pow(priceRatio, supplyElasticity) : 0;

  const ratio = supplyUnits > 0.001 ? demandUnits / supplyUnits : 1.0;
  return { ratio, supplyUnits, demandUnits };
}

export function evolveCommodity(
  comm: Commodity,
  globalGrowth: number,
  rfUSD: number,
  regions: Record<RegionId, Region>,
  allCompanies: Company[]
): Commodity {
  const dt = 1 / 52;
  const demandShock = globalGrowth * 0.8;
  const randomEps = (Math.random() - 0.5) * comm.volatility * Math.sqrt(dt);

  let weatherBoost = 0;
  Object.values(regions).forEach((r) => {
    if (r.weather.affectedCommodityId === comm.id || r.weather.affectedCommodityId === comm.symbol) {
      const decay = Math.pow(0.55, Math.max(0, (r.weather.weeksActive || 0) - 1));
      weatherBoost += r.weather.commodityImpactPct * decay;
    }
  });

  const drift = demandShock * dt + randomEps + weatherBoost * dt * 4;
  
  const privateSegmentSupplyUSD = computePrivateSegmentCommoditySupplyUSD(comm.id, regions);
  const { ratio: clearingRatio, supplyUnits, demandUnits } = computeCommodityClearingRatio(comm.id, allCompanies, comm, regions, privateSegmentSupplyUSD);
  const supplyDemandDrift = Math.max(-0.04, Math.min(0.04, (clearingRatio - 1.0) * 0.12));
  const rawDriftExponent = drift * 0.4 + supplyDemandDrift;
  const safeDriftExponent = isFinite(rawDriftExponent) ? rawDriftExponent : 0;
  const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(safeDriftExponent)).toFixed(2))); // 0.5 floor stays
  
  const change1W = Number((newSpot - comm.spotPrice).toFixed(2));

  const f1M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 1 / 12).toFixed(2));
  const f3M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 3 / 12).toFixed(2));
  const f6M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 6 / 12).toFixed(2));

  const hist = [...comm.historicalPrices.slice(-51), newSpot];

  const inventoryLevelPct = (Math.round(comm.inventoryLevelPct + (Math.random() - 0.5) * 3 - (weatherBoost > 0 ? 4 : 0)));
  const supplyDemandBalance = inventoryLevelPct < 40 ? 'Deficit (Tight Supply)' : inventoryLevelPct > 60 ? 'Surplus (Oversupplied)' : 'Balanced';

  return {
    ...comm,
    spotPrice: newSpot,
    weeklySupplyUnits: supplyUnits,
    weeklyDemandUnits: demandUnits,
    change1W,
    historicalPrices: hist,
    futures1M: f1M,
    futures3M: f3M,
    futures6M: f6M,
    inventoryLevelPct,
    supplyDemandBalance,
  };
}

/**
 * Calculate Non-Tradable Composite Benchmark Indices
 */
