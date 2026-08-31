/**
 * §5-STRUCT step 3 — PLEDGED COLLATERAL, AS AN OBJECT.
 *
 * §6.1's over-pledge row: a bank pledging more of a tenor bucket than it holds, 130 violations
 * across three banks in sixty weeks, almost all in BILL buckets. §7.226 shows why it survived two
 * attempts: the rule "a pledge cannot exceed the holding" existed in two places that could not see
 * each other — `reconcileRepoPledges` inside the repo stage, and the harness's own check — with
 * DIFFERENT tolerances (1 dollar against 1e6) and no shared notion of what "held" means. Moving the
 * reconcile to a different point in the week cut the symptom and broke the bank identity instead.
 *
 * One object. It answers what is pledged, what is held, and what is over-pledged, and both the
 * engine and the harness ask it. A rule with one implementation cannot disagree with itself.
 */

/** A pledge of a tenor bucket's paper against a secured borrowing. */
export interface Pledge {
  bucketKey: string;
  faceUSD: number;
}

export interface CollateralPosition {
  /** What this holder has pledged, by bucket. */
  pledgedByBucket: Map<string, number>;
  /** What it actually holds, by bucket. */
  heldByBucket: Map<string, number>;
}

/** Total face pledged in a bucket across every contract this borrower has open. */
export function pledgedFaceByBucket(
  contracts: { borrowerTicker: string; collateral: Pledge[] }[],
  ticker: string
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of contracts) {
    if (c.borrowerTicker !== ticker) continue;
    for (const p of c.collateral) out.set(p.bucketKey, (out.get(p.bucketKey) ?? 0) + p.faceUSD);
  }
  return out;
}

/**
 * THE SHORTFALL, with ONE tolerance.
 *
 * The tolerance is a rounding allowance and nothing else: face amounts are rounded to the dollar in
 * several places, so a bucket may disagree by cents without anything being wrong. It is NOT a
 * cushion for a real over-pledge, which is why it is one dollar and not one million — the engine's
 * reconcile used 1 and the harness used 1e6, so a bank could be a million dollars over-pledged,
 * pass the reconcile, and fail the check in the same week.
 */
export const PLEDGE_ROUNDING_TOLERANCE_USD = 1;

export function overPledgedByBucket(position: CollateralPosition): Map<string, number> {
  const out = new Map<string, number>();
  position.pledgedByBucket.forEach((faceUSD, bucketKey) => {
    const heldUSD = position.heldByBucket.get(bucketKey) ?? 0;
    const excessUSD = faceUSD - heldUSD;
    if (excessUSD > PLEDGE_ROUNDING_TOLERANCE_USD) out.set(bucketKey, excessUSD);
  });
  return out;
}

/** Is this holder's book self-consistent? The invariant, in one place, for engine and harness. */
export function isFullyBacked(position: CollateralPosition): boolean {
  return overPledgedByBucket(position).size === 0;
}
