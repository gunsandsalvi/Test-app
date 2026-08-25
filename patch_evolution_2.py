import re
import os

with open("src/engine/macro/evolution.ts", "r") as f:
    content = f.read()

# Private sector segment capital structure
segment_evo_old = """const newEmployment = Math.max(1, Math.round(seg.employment * (1 + employmentGrowthRate)));

      return {
        ...seg,
        annualRevenueUSD: newRevenue,
        marginPct: newMargin,
        employment: newEmployment
      };"""
segment_evo_new = """const segmentDebtServiceCoverage = seg.annualRevenueUSD * seg.marginPct / Math.max(1, (seg.debtUSD ?? (seg.annualRevenueUSD * 2)) * 0.08);
      const newDefaultRateAnnualPct = Math.max(0.005, Math.min(0.15, 0.02 + (1 / Math.max(0.5, segmentDebtServiceCoverage)) * 0.03 + reg.bankingSector.creditConditionsIndex * 0.02));
      const formationRate = Math.max(-0.002, Math.min(0.002, (demandSignal - newDefaultRateAnnualPct) * 0.1));
      const newEmployment = Math.max(1, Math.round(seg.employment * (1 + employmentGrowthRate + formationRate)));

      return {
        ...seg,
        annualRevenueUSD: newRevenue,
        marginPct: newMargin,
        employment: newEmployment,
        debtUSD: (seg.debtUSD ?? (seg.annualRevenueUSD * 2)),
        defaultRateAnnualPct: newDefaultRateAnnualPct,
        capexUSD: newRevenue * 0.05,
      };"""
content = content.replace(segment_evo_old, segment_evo_new)

# Occupation-linked credit risk
tier_old = """const householdStressSignal = (newUnemployment - region.nairu) * 0.02; // no clamp

  const updatedTiers = region.householdState.creditTierBooks.map(tier => {
    let newShare = tier.shareOfHouseholds;
    if (tier.tier === 'SUBPRIME') {
      newShare = tier.shareOfHouseholds + householdStressSignal * 0.5;
    } else if (tier.tier === 'SUPER_PRIME') {
      newShare = tier.shareOfHouseholds - householdStressSignal * 0.5;
    }"""
tier_new = """const householdStressSignal = (newUnemployment - region.nairu) * 0.02; // no clamp
  
  const specializedStress = (newOccupationPools.SPECIALIZED_PROFESSIONAL.wageGrowthAnnual < 0 ? 1 : 0) + (newOccupationPools.TECHNICAL_ENGINEERING.wageGrowthAnnual < 0 ? 1 : 0);
  const generalStress = (newOccupationPools.GENERAL.wageGrowthAnnual < 0 ? 1 : 0);

  const updatedTiers = region.householdState.creditTierBooks.map(tier => {
    let newShare = tier.shareOfHouseholds;
    const tierStress = householdStressSignal + (tier.tier === 'SUBPRIME' || tier.tier === 'NEAR_PRIME' ? generalStress * 0.01 : specializedStress * 0.01);
    
    if (tier.tier === 'SUBPRIME') {
      newShare = tier.shareOfHouseholds + tierStress * 0.5;
    } else if (tier.tier === 'SUPER_PRIME') {
      newShare = tier.shareOfHouseholds - tierStress * 0.5;
    }"""
content = content.replace(tier_old, tier_new)

content = content.replace("let newDelinquency = tier.delinquencyRatePct + householdStressSignal *", "let newDelinquency = tier.delinquencyRatePct + tierStress *")

with open("src/engine/macro/evolution.ts", "w") as f:
    f.write(content)

