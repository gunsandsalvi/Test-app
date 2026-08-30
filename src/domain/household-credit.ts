/**
 * CRD x COH — which households are in which CREDIT tier, joined to the balance sheets those
 * households actually have.
 *
 * **What was missing.** The credit tiers migrated on delinquency alone: a share of each tier went
 * delinquent and dropped a rung, a share cured and climbed one. That mechanism is right and stays
 * — it is what a credit file does — but the RATE at which households went delinquent was four
 * stated multipliers (1.5 / 0.8 / 0.3 / 0.1 on the region's stress), and the debt each tier
 * carried was the region's whole household debt split by HEAD COUNT, so a subprime household and
 * a super-prime one owed exactly the same amount. Both are claims about the answer (rule 13), and
 * both had a measurement sitting one file away: COH1 gave every wealth tier a LIQUID stock and a
 * debt stock of its own.
 *
 * **The join, with no mapping table.** Credit tiers and wealth tiers are two partitions of the
 * same households, so they do not need to be mapped to each other — they need to be put on one
 * axis. The axis is the BUFFER: how many months of its own spending a household could cover out
 * of what it holds liquid. Rank the wealth tiers by it, lay the credit tiers along the same
 * ranking cheapest-file-first, and each credit tier inherits the balance sheets of the households
 * that sit in its band. Nothing is assigned; the two cross-sections are read against each other.
 *
 * **What that buys.** A household with no buffer goes delinquent on a shock and one with three
 * months does not, so the arrival rate is the region's stress against the band's own buffer — the
 * four multipliers become a measurement. And a tier's debt is the debt of the households in it,
 * so a credit squeeze bites where the borrowing actually is.
 */

/** One band of the population on the buffer axis. */
export interface BufferBand {
  shareOfHouseholds: number;
  /** Months of its own spending this band could cover out of what it holds liquid. */
  bufferMonths: number;
  debtUSD: number;
}

/**
 * How many months of its own spending a tier could cover from its liquid stock. Income stands in
 * for spending because a household's outgoings are what its income funds, and both are annual on
 * the same cross-section (rule 9).
 */
export function bufferMonthsOf(tier: {
  liquidSavingsUSD?: number; shareOfIncomeUSD?: number;
}): number {
  const monthlyUSD = Math.max(0, tier.shareOfIncomeUSD ?? 0) / 12;
  if (!(monthlyUSD > 0)) return 0;
  return Math.max(0, tier.liquidSavingsUSD ?? 0) / monthlyUSD;
}

/**
 * Lay a set of credit-tier shares along the population ranked by buffer, and hand each one the
 * balance sheet of the households in its band.
 *
 * `wealthBands` may arrive in any order — it is sorted here, ascending, because the axis is the
 * buffer and nothing else. `creditShares` must be ordered worst file first: the households with
 * the least room are the ones whose files are impaired.
 */
export function joinCreditTiersToBalanceSheets(
  wealthBands: BufferBand[],
  creditShares: number[]
): { bufferMonths: number; debtShare: number }[] {
  const bands = [...wealthBands]
    .filter((b) => b.shareOfHouseholds > 0)
    .sort((a, b) => a.bufferMonths - b.bufferMonths);
  const totalHouseholds = bands.reduce((a, b) => a + b.shareOfHouseholds, 0);
  const totalDebtUSD = bands.reduce((a, b) => a + Math.max(0, b.debtUSD), 0);
  if (!(totalHouseholds > 0)) return creditShares.map(() => ({ bufferMonths: 0, debtShare: 0 }));

  const totalCreditShare = creditShares.reduce((a, s) => a + Math.max(0, s), 0) || 1;
  const out: { bufferMonths: number; debtShare: number }[] = [];
  let cursor = 0;           // how far into the ranked population we have walked, in household share
  let bandIndex = 0;
  let bandConsumed = 0;     // how much of the current wealth band is already spoken for

  creditShares.forEach((rawShare) => {
    // The slice of the ranked population this credit tier occupies.
    let want = (Math.max(0, rawShare) / totalCreditShare) * totalHouseholds;
    let weightedBuffer = 0;
    let debtUSD = 0;
    let taken = 0;
    while (want > 1e-9 && bandIndex < bands.length) {
      const band = bands[bandIndex];
      const available = band.shareOfHouseholds - bandConsumed;
      const slice = Math.min(available, want);
      if (slice > 0) {
        weightedBuffer += band.bufferMonths * slice;
        debtUSD += Math.max(0, band.debtUSD) * (slice / band.shareOfHouseholds);
        taken += slice;
        want -= slice;
        bandConsumed += slice;
        cursor += slice;
      }
      if (band.shareOfHouseholds - bandConsumed <= 1e-9) { bandIndex++; bandConsumed = 0; }
    }
    out.push({
      bufferMonths: taken > 0 ? weightedBuffer / taken : 0,
      debtShare: totalDebtUSD > 0 ? debtUSD / totalDebtUSD : 0,
    });
  });
  void cursor;
  return out;
}

/**
 * How exposed a band is to a shock: a household with no buffer misses a payment when its income
 * moves against it, and one with months of cover does not. This is what the four stated arrival
 * multipliers were describing, measured off the balance sheets instead.
 */
export function delinquencyExposureOf(bufferMonths: number): number {
  return 1 / (1 + Math.max(0, bufferMonths));
}
