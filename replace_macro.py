import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

old1 = """
  const participationDrift = newCycleRegime === 'Recession' ? -0.0003 : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
  const newParticipation = Math.max(0.55, Math.min(0.68, region.laborForceParticipation + participationDrift));

  const baseUnempChange = (potentialGdp - newGdpGrowth) * 0.25 + microFeedback.bottomUpUnemploymentDelta + (microFeedback.marginCompression > 0 ? 0.0004 : -0.0002);
  const participationEffect = -(newParticipation - region.laborForceParticipation) * 0.5;
  const newUnemployment = Math.max(0.032, Math.min(0.100, Number((region.unemploymentRate + baseUnempChange + participationEffect).toFixed(3))));
  const unempDelta = newUnemployment - region.unemploymentRate;

  // Consumer & Household Sector Simulation
  const nairu = 0.045; 
"""

new1 = """
  const participationDrift = newCycleRegime === 'Recession' ? -0.0003 : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
  const newParticipation = Math.max(0.55, Math.min(0.68, region.laborForceParticipation + participationDrift));

  let newPotentialGdpGrowth = region.potentialGdpGrowth;
  if (week % 52 === 0) {
    const laborForceTrend = (newParticipation - region.laborForceParticipation) * 52;
    const capexIntensityTrend = Math.max(-0.002, Math.min(0.002, microFeedback.capexGdpContribution * 0.3));
    const potentialGdpDrift = laborForceTrend * 0.3 + capexIntensityTrend;
    newPotentialGdpGrowth = Math.max(0.003, Math.min(0.035, Number((region.potentialGdpGrowth + potentialGdpDrift).toFixed(4))));
  }

  const potentialGdpDelta = newPotentialGdpGrowth - region.potentialGdpGrowth;
  const newNeutralRate = Number((region.neutralRate + potentialGdpDelta).toFixed(4));

  const newNairu = week % 52 === 0
    ? Math.max(0.02, Math.min(0.09, Number((region.nairu + (newParticipation - region.laborForceParticipation) * 0.15).toFixed(4))))
    : region.nairu;

  const baseUnempChange = (potentialGdp - newGdpGrowth) * 0.25 + microFeedback.bottomUpUnemploymentDelta + (microFeedback.marginCompression > 0 ? 0.0004 : -0.0002);
  const participationEffect = -(newParticipation - region.laborForceParticipation) * 0.5;
  const newUnemployment = Math.max(0.032, Math.min(0.100, Number((region.unemploymentRate + baseUnempChange + participationEffect).toFixed(3))));
  const unempDelta = newUnemployment - region.unemploymentRate;

  // Consumer & Household Sector Simulation
  const nairu = newNairu;
"""

old2 = """
  const cciMeanReversion = (100 - prevHS.consumerConfidence) * 0.015;
  const newCCI = Math.max(60, Math.min(140, prevHS.consumerConfidence + cciMeanReversion + 0.3 * (newWageGrowth - region.inflation) * 100 + 0.1 * (equityReturn * 100) - cciUnempMultiplier * unempDelta * 100 - contagionHit));

  const newSavingsRate = Math.max(0.02, Math.min(0.18, 0.06 + 0.2 * (region.policyRate - 0.02) - 0.1 * ((newCCI - 100) / 100)));
"""

new2 = """
  const cciEquilibrium = 100 + (newWageGrowth - region.inflation) * 150 - Math.max(0, newUnemployment - nairu) * 300 - Math.max(0, region.expectedInflation - piStar) * 100;
  const cciReversion = (cciEquilibrium - prevHS.consumerConfidence) * 0.05;
  const newCCI = Math.max(60, Math.min(140, prevHS.consumerConfidence + cciReversion + 0.3 * (newWageGrowth - region.inflation) * 100 + 0.1 * (equityReturn * 100) - cciUnempMultiplier * unempDelta * 100 - contagionHit));

  const savingsBaseline = 0.05 + Math.max(0, region.expectedInflation - piStar) * 0.5;
  const newSavingsRate = Math.max(0.02, Math.min(0.18, savingsBaseline + 0.2 * (region.policyRate - newNeutralRate) - 0.1 * ((newCCI - 100) / 100)));
"""

old3 = """
    sovereignRating: newSovereignRating,
    laggedPolicyRateEMA: region.laggedPolicyRateEMA * 0.96 + newPolicyRate * 0.04,
    laborForceParticipation: newParticipation,
    policyRate: newPolicyRate,
"""

new3 = """
    sovereignRating: newSovereignRating,
    laggedPolicyRateEMA: region.laggedPolicyRateEMA * 0.96 + newPolicyRate * 0.04,
    laborForceParticipation: newParticipation,
    potentialGdpGrowth: newPotentialGdpGrowth,
    neutralRate: newNeutralRate,
    nairu: newNairu,
    policyRate: newPolicyRate,
"""

if old1.strip() in text and old2.strip() in text and old3.strip() in text:
    text = text.replace(old1.strip(), new1.strip())
    text = text.replace(old2.strip(), new2.strip())
    text = text.replace(old3.strip(), new3.strip())
    with open('src/engine/macroEngine.ts', 'w') as f:
        f.write(text)
    print("Done")
else:
    print("Not found")

