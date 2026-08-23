import { NelsonSiegelParams, calculateTenorZeroRates } from '../nelsonSiegel';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, BankingSector } from '../../types';
import { evolveBankingSector } from './banking';
import { evolveRegionalWeather } from './weather';
import { generate52WeekHistory } from './utils';

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

  const weatherGdpShock = updatedWeather.gdpImpactPct * weatherDecay;

  // Micro-to-Macro Transmission:
  // 1. Aggregate Corporate CapEx produces realistic incremental additions to national GDP (bounded -0.5% to +0.5%)
  const capexGdpFeedback = microFeedback.capexGdpContribution;
  
  // 2. Margin compression forces hiring freezes, cooling wage inflation
  const laborCooling = microFeedback.marginCompression * 0.15;
  
  // 3. Fiscal deficit > 6% injects supply-side term premium
  const fiscalDeficitTermPremium = region.fiscalDeficitPctGdp > 0.06 ? (region.fiscalDeficitPctGdp - 0.06) * 0.4 : 0;

  const infNoise = (Math.random() - 0.5) * 0.0008 + globalShock.inflationShock + weatherInfShock * 0.20 - laborCooling * 0.0008;

  // --- GDP CALCULATION REWRITE ---
  const potentialGdp = region.potentialGdpGrowth;
  
  // 1. Autoregressive AR(1) base with mean-reversion to potential GDP
  const gdpPersistence = region.cycleRegime === 'Recession' ? 0.75 : 0.85; // Strong gravity pulling back to potential
  const noiseMultiplier = region.cycleRegime === 'Recession' ? 1.5 : 1.0;
  const stochasticNoise = (Math.random() - 0.5) * 0.001 * noiseMultiplier; // +/- 5 bps random variation (increased in recession)
  const baseGdp = (region.gdpGrowth * gdpPersistence) + (potentialGdp * (1 - gdpPersistence)) + stochasticNoise + globalShock.gdpShock + weatherGdpShock * 0.20;

  // 2. Incremental bounded shocks (Annualized bps)
  const capexContribAnnual = capexGdpFeedback; // Already bounded and annualized in simulation.ts
  const prevHS = region.householdState || { consumerConfidence: 100, wageGrowth: region.wageGrowth, savingsRate: 0.06, realConsumptionGrowth: 0.02, householdDebtToIncomeRatio: 1.05, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15 };
  const consumerContribAnnual = Math.max(-0.002, Math.min(0.002, (prevHS.consumerConfidence - 100) * 0.0001)); // Max +/- 20 bps

  // Real Rate Demand Channel
  const realRateGap = (region.policyRate - region.inflation) - region.neutralRate;
  const monetaryDrag = Math.max(-0.025, Math.min(0.025, -realRateGap * 0.60));

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
    newStructuralDeficitPctGdp = Math.max(0.01, Math.min(0.12, region.structuralDeficitPctGdp + stanceChange * 0.05));
  }
  const fiscalImpulse = newFiscalStanceScore * 0.006;

  // Process recession shocks
  let scheduledShock = 0;
  const remainingShocks = region.recessionShockQueue.filter(s => {
    if (s.week === week) {
      scheduledShock += s.shock;
      return false;
    }
    return true;
  });

  // 3. Set new GDP Growth: Must be absolute rate, NOT compounded
  const updatedGdpGrowth = baseGdp + capexContribAnnual + consumerContribAnnual + monetaryDrag + fiscalImpulse + scheduledShock;

  // 4. Absolute hard clamp to prevent runaway simulation
  const newGdpGrowth = Math.max(-0.02, Math.min(0.045, updatedGdpGrowth)); // Bounded between -2.0% and +4.5%

  let newInflation = Math.max(0.0050, Math.min(0.20, Number((region.inflation + infNoise).toFixed(4))));

  const cyclicalDeficitComponent = (potentialGdp - newGdpGrowth) * 0.6; // wider deficit as growth falls below potential
  const newFiscalDeficitPctGdp = Math.max(-0.02, Math.min(0.15, newStructuralDeficitPctGdp + cyclicalDeficitComponent));

  const newEstimatedNominalGdpUSD = region.estimatedNominalGdpUSD * (1 + (newGdpGrowth + newInflation) / 52); // nominal = real + inflation

  // Tax rate is a slow second fiscal lever — austerity nudges it up, stimulus nudges it down, same cadence as fiscalStanceScore
  const taxRateDrift = week % 13 === 0 ? -newFiscalStanceScore * 0.001 : 0;
  const newEffectiveTaxRate = Math.max(0.15, Math.min(0.45, region.effectiveTaxRate + taxRateDrift));

  const newGovernmentRevenueUSD = newEstimatedNominalGdpUSD * newEffectiveTaxRate / 52; // weekly flow
  const newGovernmentSpendingUSD = newGovernmentRevenueUSD + (newEstimatedNominalGdpUSD * newFiscalDeficitPctGdp) / 52; // spending = revenue + deficit, by definition

  let newCycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery' = 'Slowdown';
  if (newGdpGrowth < 0) newCycleRegime = 'Recession';
  else if (newGdpGrowth > potentialGdp + 0.005) newCycleRegime = region.cycleRegime === 'Recession' ? 'Recovery' : 'Expansion';
  else if (region.cycleRegime === 'Recession' && newGdpGrowth >= 0) newCycleRegime = 'Recovery';

  const participationDrift = newCycleRegime === 'Recession' ? -0.0003 : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
  const newParticipation = Math.max(0.55, Math.min(0.68, region.laborForceParticipation + participationDrift));

  // Slow demographic drift — independent of the business cycle
  const nonEmployableDrift = (Math.random() - 0.5) * 0.00002; // tiny, structural, not cycle-driven
  const newNonEmployablePct = Math.max(0.28, Math.min(0.45, region.nonEmployablePct + nonEmployableDrift));
  const totalLaborForce = region.totalPopulation * (1 - newNonEmployablePct) * newParticipation;

  // Government employment responds to real spending growth
  const spendingGrowthRate = region.governmentSpendingUSD > 0 ? (newGovernmentSpendingUSD - region.governmentSpendingUSD) / region.governmentSpendingUSD : 0;
  const govEmploymentGrowthRate = Math.max(-0.001, Math.min(0.001, spendingGrowthRate * 0.3));
  const newGovernmentEmployment = Math.max(1, Math.round(region.governmentEmployment * (1 + govEmploymentGrowthRate)));

  // SME sector breathes in sync with the tracked-company health signal, scaled down (SMEs are less volatile than large-cap panel)
  const untrackedCyclicalGrowth = microFeedback.trackedHealthSignal * 0.01;
  const targetUntracked = totalLaborForce * (1 - region.unemploymentRate) - microFeedback.publicCompanyEmployment - newGovernmentEmployment;
  const meanReversionPull = (targetUntracked - region.untrackedPrivateEmployment) / Math.max(1, region.untrackedPrivateEmployment) * 0.05;
  const untrackedGrowthRate = Math.max(-0.003, Math.min(0.003, untrackedCyclicalGrowth + meanReversionPull));
  const newUntrackedPrivateEmployment = Math.max(1, Math.round(region.untrackedPrivateEmployment * (1 + untrackedGrowthRate)));

  // Bottom-up labor-force identity residual (Phase 1 diagnostic)
  const totalEmployed = microFeedback.publicCompanyEmployment + newGovernmentEmployment + newUntrackedPrivateEmployment;
  const newUnemploymentRateBottomUp = totalLaborForce > 0 ? Math.max(0, Math.min(1, (totalLaborForce - totalEmployed) / totalLaborForce)) : region.unemploymentRateBottomUp;

  let newPotentialGdpGrowth = region.potentialGdpGrowth;
  if (week % 52 === 0) {
    const laborForceTrend = (newParticipation - region.laborForceParticipation) * 52;
    const capexIntensityTrend = Math.max(-0.0015, Math.min(0.0015, microFeedback.capexGdpContribution * 0.15));
    const potentialGdpDrift = laborForceTrend * 0.3 + capexIntensityTrend;
    newPotentialGdpGrowth = Math.max(0.003, Math.min(0.035, Number((region.potentialGdpGrowth + potentialGdpDrift).toFixed(4))));
  }

  const potentialGdpDelta = newPotentialGdpGrowth - region.potentialGdpGrowth;
  const newNeutralRate = Number((region.neutralRate + potentialGdpDelta).toFixed(4));

  const newNairu = week % 52 === 0
    ? Math.max(0.02, Math.min(0.09, Number((region.nairu + (newParticipation - region.laborForceParticipation) * 52 * 0.15).toFixed(4))))
    : region.nairu;

  const baseUnempChange = (potentialGdp - newGdpGrowth) * 0.25 + microFeedback.bottomUpUnemploymentDelta + (microFeedback.marginCompression > 0 ? 0.0004 : -0.0002);
  const participationEffect = -(newParticipation - region.laborForceParticipation) * 0.5;
  const newUnemployment = Math.max(0.032, Math.min(0.100, Number((region.unemploymentRate + baseUnempChange + participationEffect).toFixed(3))));
  const unempDelta = newUnemployment - region.unemploymentRate;

  // Consumer & Household Sector Simulation
  const nairu = newNairu; 
  const slackGap = nairu - newUnemployment;
  const taperedSlackEffect = slackGap > 0.01 ? 0.01 + (slackGap - 0.01) * 0.3 : slackGap;
  const newWageGrowth = Math.max(0.0, Math.min(0.08, 0.025 + 0.8 * taperedSlackEffect + 0.1 * region.expectedInflation));
  
  const cciUnempMultiplier = (newCycleRegime === 'Recession' || newCycleRegime === 'Slowdown') && unempDelta > 0 ? 0.75 : 0.5;
  const contagionHit = microFeedback.creditContagionBps > 50 ? (microFeedback.creditContagionBps / 100) * 0.5 : 0;
  const cciEquilibrium = 100 + (newWageGrowth - region.inflation) * 150 - Math.max(0, newUnemployment - nairu) * 300 - Math.max(0, region.expectedInflation - piStar) * 100;
  const cciReversion = (cciEquilibrium - prevHS.consumerConfidence) * 0.05;
  const newCCI = Math.max(60, Math.min(140, prevHS.consumerConfidence + cciReversion + 0.3 * (newWageGrowth - region.inflation) * 100 + 0.1 * (equityReturn * 100) - cciUnempMultiplier * unempDelta * 100 - contagionHit));

  const savingsBaseline = 0.05 + Math.max(0, region.expectedInflation - piStar) * 0.5;
  const newSavingsRate = Math.max(0.02, Math.min(0.18, savingsBaseline + 0.2 * (region.policyRate - newNeutralRate) - 0.1 * ((newCCI - 100) / 100)));
  const creditTighteningConsumerAddOn = Math.max(0, region.bankingSector.creditConditionsIndex) * 0.02;
  const debtServiceBurden = prevHS.householdDebtToIncomeRatio * (region.laggedPolicyRateEMA + creditTighteningConsumerAddOn) * 0.04;
  const equityWealthEffect = equityReturn * 0.02;
  const newRealConsumptionGrowth = (1 - newSavingsRate) * (newWageGrowth - region.inflation) * (newCCI / 100) + equityWealthEffect - debtServiceBurden;

  const wealthSignal = Math.max(-0.02, Math.min(0.02, equityReturn * 0.3 + (newCCI - 100) / 100 * 0.01));
  const targetLuxuryShare = Math.max(0.05, Math.min(0.30, prevHS.luxurySpendShare + wealthSignal));
  const targetStapleShare = Math.max(0.25, Math.min(0.55, prevHS.stapleSpendShare - wealthSignal * 0.6));
  const newLuxuryShare = Number((prevHS.luxurySpendShare * 0.95 + targetLuxuryShare * 0.05).toFixed(4));
  const newStapleShare = Number((prevHS.stapleSpendShare * 0.95 + targetStapleShare * 0.05).toFixed(4));
  const newStandardShare = Number(Math.max(0.15, 1 - newLuxuryShare - newStapleShare).toFixed(4));

  const wagePushInflation = (newWageGrowth - 0.015) * 0.8;
  
  // Wage-push inflation adds to CPI (scaled for weekly turn)
  newInflation = Math.max(0.0050, Math.min(0.20, Number((newInflation + wagePushInflation * 0.02).toFixed(4))));
  const newCoreInflation = Number((newInflation * 0.92 + wagePushInflation * 0.1).toFixed(4));
  const newExpectedInflation = region.expectedInflation * 0.9 + newInflation * 0.1;

  // Calibrated Inertial Taylor Rule:
  // Target: i*_t = r* + pi_t + 0.5(pi_t - pi*) + 0.5(y_t - y*)
  const rStar = region.neutralRate; // US: 1.00%, UK: 0.75%, EU: 0.50%, JP: -0.25%
  
  const output_gap = Math.max(-0.03, Math.min(0.03, newGdpGrowth - potentialGdp));
  const inflation_gap = Math.max(-0.02, Math.min(0.04, newExpectedInflation - piStar));
  const taylorTarget = rStar + newExpectedInflation + 0.5 * inflation_gap + 0.5 * output_gap;

  let rateChanged = false;
  let newPolicyRate = region.policyRate;
  let rateDeltaBps = 0;
  let newInflationDeviationStreak = region.inflationDeviationStreak || 0;

  // Central banks evaluate policy rates strictly once per quarter (every 13 weeks) or off-cycle if drastically behind curve
  const isMeeting = (week % 13 === 0) || Math.abs(taylorTarget - region.policyRate) > 0.03;
  if (isMeeting) {
    const isAboveTarget = region.inflation > piStar + 0.01; // meaningfully above target, not just noise
    newInflationDeviationStreak = isAboveTarget ? (region.inflationDeviationStreak || 0) + 1 : Math.max(0, (region.inflationDeviationStreak || 0) - 2);
    const escalationMultiplier = 1 + Math.min(1.0, newInflationDeviationStreak * 0.08); // up to 2x step size after ~12-13 quarters (3 years) persistently above target

    const rawQuarterlyDelta = taylorTarget - region.policyRate;
    let meetingDecisionBps = 0;
    
    // Clamp the quarterly policy move to standard discrete steps
    if (rawQuarterlyDelta >= 0.0200) meetingDecisionBps = 0.0150 * escalationMultiplier;       // +150 bps
    else if (rawQuarterlyDelta >= 0.0100) meetingDecisionBps = 0.0100 * escalationMultiplier;  // +100 bps
    else if (rawQuarterlyDelta >= 0.0035) meetingDecisionBps = 0.0050 * escalationMultiplier;       // +50 bps
    else if (rawQuarterlyDelta >= 0.0010) meetingDecisionBps = 0.0025 * escalationMultiplier;  // +25 bps
    else if (rawQuarterlyDelta <= -0.0200) meetingDecisionBps = -0.0150;// -150 bps
    else if (rawQuarterlyDelta <= -0.0100) meetingDecisionBps = -0.0100;// -100 bps
    else if (rawQuarterlyDelta <= -0.0035) meetingDecisionBps = -0.0050;// -50 bps
    else if (rawQuarterlyDelta <= -0.0010) meetingDecisionBps = -0.0025;// -25 bps

    newPolicyRate = Math.max(0.00, Math.min(0.30, region.policyRate + meetingDecisionBps));
    if (region.id === 'JPN') newPolicyRate = Math.max(-0.001, Math.min(0.025, newPolicyRate));

    if (newPolicyRate !== region.policyRate) {
      rateChanged = true;
      rateDeltaBps = Math.round((newPolicyRate - region.policyRate) * 10000);
    }
  }

  const smoothedTargetRate = taylorTarget; // Used for dot plot and curve parameters

  // --- DIAGNOSTIC TELEMETRY OUTPUT ---
  const capexBps = Math.round(capexContribAnnual * 10000);
  const consBps = Math.round(consumerContribAnnual * 10000);
  const outGapBps = Math.round(output_gap * 10000);
  const infGapBps = Math.round(inflation_gap * 10000);
  
  const diagnosticString = `Prior GDP: ${(region.gdpGrowth * 100).toFixed(2)}% | CapEx Boost: ${capexBps > 0 ? '+' : ''}${capexBps} bps | Cons Demand: ${consBps > 0 ? '+' : ''}${consBps} bps | Net Realized GDP: ${(newGdpGrowth * 100).toFixed(2)}%
Potential GDP: ${(potentialGdp * 100).toFixed(2)}% | Output Gap: ${outGapBps > 0 ? '+' : ''}${outGapBps} bps | CPI: ${(newInflation * 100).toFixed(2)}% (Gap ${infGapBps > 0 ? '+' : ''}${infGapBps} bps)
Taylor Target: ${(taylorTarget * 100).toFixed(2)}% | Current Policy: ${(region.policyRate * 100).toFixed(2)}% | Meeting Decision: ${rateChanged ? `${rateDeltaBps > 0 ? '+' : ''}${rateDeltaBps} bps -> ${(newPolicyRate * 100).toFixed(2)}%` : 'Hold'}`;

  // Dot Plot projections converging toward Taylor target & long-run neutral
  const dotPlot1Y = Number((newPolicyRate * 0.4 + smoothedTargetRate * 0.6).toFixed(4));
  const dotPlot2Y = Number((smoothedTargetRate * 0.35 + (rStar + piStar) * 0.65).toFixed(4));

  const qePace = newCycleRegime === 'Recession' ? 10e9 : (newCycleRegime === 'Expansion' ? -3e9 : 0);
  const cbFloor = 300e9; // Structural floor for central bank assets (currency in circulation & baseline reserves)
  const newCbBalance = Math.max(cbFloor, region.centralBankBalanceSheet + qePace);
  const cbChangePct = (newCbBalance - region.centralBankBalanceSheet) / Math.max(cbFloor, region.centralBankBalanceSheet);
  const qePremium = Math.max(-0.01, Math.min(0.01, cbChangePct * -0.5));

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

  const newBalanceSheetStance = Math.max(-1, Math.min(1, -cbChangePct * 10));
  const newBankingSector = evolveBankingSector(region.bankingSector, microFeedback.businessLoanBookInputUSD, prevHS.householdDebtToIncomeRatio, region.estimatedHouseholdIncomeUSD, newSavingsRate, newPolicyRate, microFeedback.creditContagionBps, newUnemployment, newZeroRates.tenor10Y, newBalanceSheetStance, newGdpGrowth);
  const newEstimatedHouseholdIncomeUSD = Number((region.estimatedHouseholdIncomeUSD * (1 + newGdpGrowth / 52)).toFixed(0));

  const updatedRegion: Region = {
    ...region,
    cycleRegime: newCycleRegime,
    inversionWeeksCount: newInversionCount,
    recessionShockQueue: remainingShocks,
    centralBankBalanceSheet: newCbBalance,
    balanceSheetStance: newBalanceSheetStance,
    structuralDeficitPctGdp: newStructuralDeficitPctGdp,
    fiscalDeficitPctGdp: newFiscalDeficitPctGdp,
    fiscalStanceScore: newFiscalStanceScore,
    sovereignRating: newSovereignRating,
    laggedPolicyRateEMA: region.laggedPolicyRateEMA * 0.96 + newPolicyRate * 0.04,
    laborForceParticipation: newParticipation,
    inflationDeviationStreak: newInflationDeviationStreak,
    potentialGdpGrowth: newPotentialGdpGrowth,
    neutralRate: newNeutralRate,
    nairu: newNairu,
    policyRate: newPolicyRate,
    inflation: newInflation,
    coreInflation: newCoreInflation,
    expectedInflation: newExpectedInflation,
    gdpGrowth: newGdpGrowth,
    wageGrowth: Number(newWageGrowth.toFixed(4)),
    debtToGdpPct: newDebtToGdpPct,
    unemploymentRate: newUnemployment,
    totalPopulation: region.totalPopulation,
    nonEmployablePct: newNonEmployablePct,
    governmentEmployment: newGovernmentEmployment,
    untrackedPrivateEmployment: newUntrackedPrivateEmployment,
    unemploymentRateBottomUp: Number(newUnemploymentRateBottomUp.toFixed(4)),
    estimatedNominalGdpUSD: newEstimatedNominalGdpUSD,
    effectiveTaxRate: newEffectiveTaxRate,
    governmentRevenueUSD: newGovernmentRevenueUSD,
    governmentSpendingUSD: newGovernmentSpendingUSD,
    householdState: {
      consumerConfidence: newCCI,
      wageGrowth: newWageGrowth,
      savingsRate: newSavingsRate,
      realConsumptionGrowth: newRealConsumptionGrowth,
      householdDebtToIncomeRatio: prevHS.householdDebtToIncomeRatio,
        stapleSpendShare: newStapleShare, standardSpendShare: newStandardShare, luxurySpendShare: newLuxuryShare,
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

  const tradeShock = Math.max(-0.005, Math.min(0.005, ((baseRegion.tradeBalance - quoteRegion.tradeBalance) / 1e12) * 0.002));

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

export function evolveCommodity(
  comm: Commodity,
  globalGrowth: number,
  rfUSD: number,
  regions: Record<RegionId, Region>
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
  const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(drift)).toFixed(2)));
  const change1W = Number((newSpot - comm.spotPrice).toFixed(2));

  const f1M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 1 / 12).toFixed(2));
  const f3M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 3 / 12).toFixed(2));
  const f6M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 6 / 12).toFixed(2));

  const hist = [...comm.historicalPrices.slice(-51), newSpot];

  const inventoryLevelPct = Math.max(20, Math.min(80, Math.round(comm.inventoryLevelPct + (Math.random() - 0.5) * 3 - (weatherBoost > 0 ? 4 : 0))));
  const supplyDemandBalance = inventoryLevelPct < 40 ? 'Deficit (Tight Supply)' : inventoryLevelPct > 60 ? 'Surplus (Oversupplied)' : 'Balanced';

  return {
    ...comm,
    spotPrice: newSpot,
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
