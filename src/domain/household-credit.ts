/**
 * CRD x COH — which households are in which CREDIT tier, joined to the balance sheets those
 * households actually have.
 *
 * **What was missing.** The credit tiers migrated on delinquency alone: a share of each tier went
 * delinquent and dropped a rung, a share cured and climbed one. That mechanism is right and stays
 * — it is what a credit file does — but the RATE at which households went delinquent was four
 * stated multipliers (1.5 / 0.8 / 0.3 / 0.1 on the region's stress), and the debt each tier
 * carried was the region's whole household debt split by HEAD COUNT, so a subprime household and
 * a super-prime one owed exactly the same amount. Both are claims about the answer (rule 2), and
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

/**
 * A NODE of a population laid out on one axis — a share of the people, and where they sit.
 * `bufferBands` and `wageBands` are both this shape, because it is the same operation.
 */
export interface PopulationNode {
  shareOfPopulation: number;
  /** The value that orders the axis: months of buffer, a wage premium, anything measured. */
  value: number;
  /** An optional second quantity carried along, summed rather than averaged (debt, say). */
  carried?: number;
}

/**
 * Lay a set of band shares along a population ranked by `value`, and return each band's own
 * share-weighted mean of it (plus its share of the carried total).
 *
 * This is the general form of "two partitions of one population go on ONE AXIS rather than being
 * mapped to each other". It is used twice: to give a CREDIT tier the balance sheets of the
 * households in its band of the buffer ranking, and to give a WEALTH tier the wages of the
 * workers in its band of the earnings ranking. One operation, one implementation (rule 4).
 *
 * `nodes` may arrive in any order — they are sorted here, ascending, because the axis is the
 * value and nothing else. `bandShares` must be ordered lowest band first.
 */
export function bandMeansOverDistribution(
  nodes: PopulationNode[],
  bandShares: number[]
): { mean: number; carriedShare: number }[] {
  const sorted = [...nodes]
    .filter((n) => n.shareOfPopulation > 0)
    .sort((a, b) => a.value - b.value);
  const totalPopulation = sorted.reduce((a, n) => a + n.shareOfPopulation, 0);
  const totalCarried = sorted.reduce((a, n) => a + Math.max(0, n.carried ?? 0), 0);
  if (!(totalPopulation > 0)) return bandShares.map(() => ({ mean: 0, carriedShare: 0 }));

  const totalBand = bandShares.reduce((a, s) => a + Math.max(0, s), 0) || 1;
  const out: { mean: number; carriedShare: number }[] = [];
  let nodeIndex = 0;
  let nodeConsumed = 0;

  bandShares.forEach((rawShare) => {
    let want = (Math.max(0, rawShare) / totalBand) * totalPopulation;
    let weighted = 0;
    let carried = 0;
    let taken = 0;
    while (want > 1e-12 && nodeIndex < sorted.length) {
      const node = sorted[nodeIndex];
      const available = node.shareOfPopulation - nodeConsumed;
      const slice = Math.min(available, want);
      if (slice > 0) {
        weighted += node.value * slice;
        carried += Math.max(0, node.carried ?? 0) * (slice / node.shareOfPopulation);
        taken += slice;
        want -= slice;
        nodeConsumed += slice;
      }
      if (node.shareOfPopulation - nodeConsumed <= 1e-12) { nodeIndex++; nodeConsumed = 0; }
    }
    out.push({
      mean: taken > 0 ? weighted / taken : 0,
      carriedShare: totalCarried > 0 ? carried / totalCarried : 0,
    });
  });
  return out;
}

/** One band of the population on the buffer axis. */
export interface BufferBand {
  shareOfHouseholds: number;
  /** Months of its own spending this band could cover out of what it holds liquid. */
  bufferMonths: number;
  debtLocal: number;
}

/**
 * How many months of its own spending a tier could cover from its liquid stock. Income stands in
 * for spending because a household's outgoings are what its income funds, and both are annual on
 * the same cross-section (rule 8).
 */
export function bufferMonthsOf(tier: {
  liquidSavingsUSD?: number; shareOfIncomeUSD?: number;
}): number {
  const monthlyUSD = Math.max(0, tier.shareOfIncomeUSD ?? 0) / 12;
  if (!(monthlyUSD > 0)) return 0;
  return Math.max(0, tier.liquidSavingsUSD ?? 0) / monthlyUSD;
}

/**
 * Lay the credit tiers along the population ranked by BUFFER, and hand each one the balance sheet
 * of the households in its band. `creditShares` must be ordered worst file first: the households
 * with the least room are the ones whose files are impaired.
 */
export function joinCreditTiersToBalanceSheets(
  wealthBands: BufferBand[],
  creditShares: number[]
): { bufferMonths: number; debtShare: number }[] {
  const bands = bandMeansOverDistribution(
    wealthBands.map((b) => ({
      shareOfPopulation: b.shareOfHouseholds,
      value: b.bufferMonths,
      carried: b.debtLocal,
    })),
    creditShares
  );
  return bands.map((b) => ({ bufferMonths: b.mean, debtShare: b.carriedShare }));
}

/**
 * How exposed a band is to a shock: a household with no buffer misses a payment when its income
 * moves against it, and one with months of cover does not. This is what the four stated arrival
 * multipliers were describing, measured off the balance sheets instead.
 */
export function delinquencyExposureOf(bufferMonths: number): number {
  return 1 / (1 + Math.max(0, bufferMonths));
}
