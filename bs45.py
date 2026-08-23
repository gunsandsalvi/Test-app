import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

# BS4
old1 = """
    // Dynamic OAS credit spread & Leveraged Loan pricing
    const ratingSpreadConfig = RATING_OAS_SPREADS[newRating];
    const targetOasBps = ratingSpreadConfig.baseBps + (newLeverage > 4 ? (newLeverage - 4) * 50 : 0);
"""

new1 = """
    // Dynamic OAS credit spread & Leveraged Loan pricing
    const systemicCreditSpreadBps = Math.max(0, reg.bankingSector.creditConditionsIndex) * 150;
    const ratingSpreadConfig = RATING_OAS_SPREADS[newRating];
    const targetOasBps = ratingSpreadConfig.baseBps + (newLeverage > 4 ? (newLeverage - 4) * 50 : 0) + systemicCreditSpreadBps;
"""

# BS5
old2 = """
    // Consumer Revenue Beta
    let consumerRevBoost = 0;
    if (comp.sector === 'Consumer') consumerRevBoost = reg.householdState.realConsumptionGrowth * 1.6;
    else if (comp.sector === 'Tech') consumerRevBoost = reg.householdState.realConsumptionGrowth * 1.1;
    else consumerRevBoost = reg.householdState.realConsumptionGrowth * 0.4;
"""

new2 = """
    // Consumer Revenue Beta
    const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;
    const effectiveConsumptionGrowth = reg.householdState.realConsumptionGrowth - creditTighteningPenalty;
    let consumerRevBoost = 0;
    if (comp.sector === 'Consumer') consumerRevBoost = effectiveConsumptionGrowth * 1.6;
    else if (comp.sector === 'Tech') consumerRevBoost = effectiveConsumptionGrowth * 1.1;
    else consumerRevBoost = effectiveConsumptionGrowth * 0.4;
"""

if old1.strip() in text and old2.strip() in text:
    text = text.replace(old1.strip(), new1.strip())
    text = text.replace(old2.strip(), new2.strip())
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Done BS4 and BS5")
else:
    print("Not found BS4 or BS5")

