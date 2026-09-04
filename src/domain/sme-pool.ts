/**
 * §5-STRUCT step 3 — AN SME POOL, AND WHERE IT PUTS ITS CAPACITY.
 *
 * The specimen defect of the whole audit (§7.229). The pool's mix rule was twelve inline lines in
 * the middle of `05-unit-bidding.ts`: take the measured mix whenever the pool has measured
 * ANYTHING. A sub-unit it had never sold into had no entry, so its share was zero, so it offered
 * nothing, so it never sold there, so it never got an entry. A closed loop with no way out — and
 * the writer sets the entry to 0 on a week that clears nothing, so a pool that enters and misses
 * once is locked out again permanently.
 *
 * MEASURED: the ConsumerStaples pool carries 28% of its industry's activity and offered ZERO units
 * into `household_essentials` — the largest weight in the household basket — from week one and for
 * ever. Nothing could see it, because there was no object to ask and no unit to test.
 *
 * THE RULE, once, testable, in the open: a pool puts capacity where the DEMAND is, corrected by
 * where it has measurably been selling, and the weight on the correction is how much of its
 * industry's demand its own book actually speaks for. A pool that has sold across the whole
 * industry trusts its book completely; one that has sold nowhere has nothing to trust and follows
 * the demand. No constant — the trust IS the coverage.
 */

/** One sub-unit's demand and what this pool has measurably sold into it. */
export interface PoolSubUnitObservation {
  subUnitId: string;
  demandLevelAnnualLocal: number;
  measuredRevenueLocal: number;
}

/**
 * How this pool splits its goods revenue across the sub-units of its industry. The shares sum to 1
 * over sub-units with positive demand, which is the property that made the old rule's silent zero
 * impossible to notice: a share of zero is indistinguishable from "no demand here" unless something
 * checks the sum.
 */
export function capacityMixShares(observations: PoolSubUnitObservation[]): Map<string, number> {
  const out = new Map<string, number>();
  const demandTotal = observations.reduce((a, o) => a + Math.max(0, o.demandLevelAnnualLocal), 0);
  const measuredTotal = observations.reduce((a, o) => a + Math.max(0, o.measuredRevenueLocal), 0);
  if (observations.length === 0) return out;
  if (!(demandTotal > 0)) {
    const even = 1 / observations.length;
    observations.forEach((o) => out.set(o.subUnitId, even));
    return out;
  }
  // How much of the industry's demand this pool's book actually speaks for.
  const coveredDemandLocal = observations.reduce(
    (a, o) => a + (o.measuredRevenueLocal > 0 ? Math.max(0, o.demandLevelAnnualLocal) : 0), 0);
  const trust = Math.min(1, coveredDemandLocal / demandTotal);
  observations.forEach((o) => {
    const demandShare = Math.max(0, o.demandLevelAnnualLocal) / demandTotal;
    const measuredShare = measuredTotal > 0 ? Math.max(0, o.measuredRevenueLocal) / measuredTotal : 0;
    out.set(o.subUnitId, trust * measuredShare + (1 - trust) * demandShare);
  });
  return out;
}

/**
 * THE INVARIANT THE OLD RULE BROKE, as a function anything can assert: a pool with demand in front
 * of it allocates capacity to it. A zero share against positive demand is a lock, not a decision.
 */
export function subUnitsLockedOut(observations: PoolSubUnitObservation[]): string[] {
  const shares = capacityMixShares(observations);
  return observations
    .filter((o) => o.demandLevelAnnualLocal > 0 && !((shares.get(o.subUnitId) ?? 0) > 0))
    .map((o) => o.subUnitId);
}
