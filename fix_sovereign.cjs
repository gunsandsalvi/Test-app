const fs = require('fs');

const lines = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8').split('\n');

let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const updatedBankingSector = { ...reg.bankingSector };')) start = i;
  if (lines[i].includes('bankingSector: updatedBankingSector,')) {
    if (start !== -1 && end === -1) end = i;
  }
}

if (start !== -1 && end !== -1) {
  lines.splice(start, end - start + 1, 
    "    const updatedBankingSector = { ...reg.bankingSector };",
    "    const updatedInstitutionalSector = { ...reg.institutionalSector };",
    "",
    "    // Market-funded deficit routes to bond holdings (institutional + bank)",
    "    if (issuanceCalendarWeek) {",
    "      updatedBankingSector.sovereignBondHoldingsUSD += quarterlyFundingNeedUSD * 0.40;",
    "      updatedInstitutionalSector.sovBondHoldingsUSD += quarterlyFundingNeedUSD * 0.60;",
    "    } else {",
    "      updatedBankingSector.sovereignBondHoldingsUSD += marketFundedDeficitUSD * 0.40;",
    "      updatedInstitutionalSector.sovBondHoldingsUSD += marketFundedDeficitUSD * 0.60;",
    "    }",
    "",
    "    if (updatedBankingSector.centralBankReservesUSD < 0) throw new Error(\"Invariant Violation: centralBankReservesUSD cannot be negative\");",
    "    updatedBankingSector.centralBankReservesUSD = Number(updatedBankingSector.centralBankReservesUSD.toFixed(0));",
    "",
    "    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);",
    "    const debtToGdpPctBottomUp = newDerivedNominalGdpUSD > 0 ? totalGovDebtUSD / newDerivedNominalGdpUSD : (reg.debtToGdpPctBottomUp || 0);",
    "",
    "    updatedRegions[regionId] = {",
    "      ...reg,",
    "      gdpGrowth: finalGdpGrowth,",
    "      estimatedNominalGdpUSD: newDerivedNominalGdpUSD,",
    "      derivedNominalGdpUSD: newDerivedNominalGdpUSD,",
    "      gdpGrowthBottomUp: Number(gdpGrowthBottomUp.toFixed(4)),",
    "      smoothedWeeklyGrowthRate: smoothedWeeklyRate,",
    "      lastWeekNominalGdpUSD: newDerivedNominalGdpUSD,",
    "      nominalGdpHistory: reg.nominalGdpHistory || [],",
    "      consumptionComponentUSD,",
    "      investmentComponentUSD,",
    "      govDebtTranches: [...liveTranches, ...newTranches],",
    "      debtToGdpPctBottomUp,",
    "      pendingUnfundedDeficitUSD: nextPendingUnfundedDeficitUSD,",
    "      bankingSector: updatedBankingSector,",
    "      institutionalSector: updatedInstitutionalSector,"
  );
  fs.writeFileSync('src/engine/simulation/core.ts', lines.join('\n'));
  console.log("Success");
} else {
  console.log("Could not find block");
}
