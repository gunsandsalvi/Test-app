/**
 * §5-STRUCT step 2 — A FIRM'S STOCKS FOR ONE WEEK.
 *
 * Fifth object out of the company kernel: what holding goods costs, and what consuming inputs
 * draws down. Both were inline, and both are rules about the world rather than bookkeeping.
 *
 * WHAT THE CARRYING COST IS. A warehouse is not free: stock loses value at its good's own rate
 * every week it sits. That charge is real money and it reaches a real payee — IND16 makes the
 * distribution sector the recipient — so this function reports the cost per sub-unit and the
 * caller settles it. Reporting rather than settling is the split the whole project runs on (§1.4).
 *
 * A NOTE ON ALIASING, because it is load-bearing and looks like a bug. The input lots are ALIASED,
 * not copied. Nothing mutates a lot array in place — the drawdown sorts a `.slice()` and REPLACES
 * the entry, and next week's writers copy-on-first-touch before appending. A defensive copy here
 * duplicated every lot in the world every week (~55,000 and growing), all of it garbage.
 */

export interface OutputStock { unitsHeld: number; valueUSD: number }

/** A real purchase: units bought at a price, in a week. The three facts FIFO needs. */
export interface CostedLot { unitsHeld: number; unitPriceUSD: number; acquiredWeek: number }

/**
 * A week of carrying cost on the output warehouse. Returns the new stock AND the charge, because
 * the charge has a payee and the stock does not.
 */
export function chargeCarryingCost(
  stock: Record<string, OutputStock>,
  annualRateOf: (subUnitId: string) => number
): { stock: Record<string, OutputStock>; totalCostUSD: number } {
  let totalCostUSD = 0;
  const out: Record<string, OutputStock> = {};
  for (const [subUnitId, inv] of Object.entries(stock)) {
    const costUSD = inv.valueUSD * (annualRateOf(subUnitId) / 52);
    totalCostUSD += costUSD;
    out[subUnitId] = { unitsHeld: inv.unitsHeld, valueUSD: Math.max(0, inv.valueUSD - costUSD) };
  }
  return { stock: out, totalCostUSD };
}

/**
 * FIFO — CONSUME THE OLDEST REAL LOT FIRST, AND REPORT WHAT IT COST.
 *
 * A company holding units bought from three different sellers at three different prices draws down
 * the earliest purchase first, the way physical inventory actually gets used. **The cost reported
 * is what those units COST, not what they are worth now** — which is the whole reason lots exist
 * rather than one blended average: a firm that bought cheap into a risen market earns the
 * difference and one that bought dear eats it, and an average destroys both.
 *
 * A partial lot is split rather than rounded away, so no units are created or destroyed at the
 * boundary. The sort is inside because FIFO is the rule, not the caller's choice.
 */
export function consumeLotsFifo<T extends CostedLot>(
  lots: T[],
  unitsWanted: number
): { remaining: T[]; unitsTaken: number; costUSD: number; costsUSD: number[]; availableUnits: number } {
  // SCALE §7.303 — lots are appended in week order, so they arrive sorted almost always; the
  // unconditional slice().sort() paid an allocation and an O(n log n) pass per firm-sub-unit-
  // week for nothing. One linear check keeps the sorted guarantee and the same order exactly.
  let isSorted = true;
  for (let i = 1; i < lots.length; i++) {
    if (lots[i].acquiredWeek < lots[i - 1].acquiredWeek) { isSorted = false; break; }
  }
  const sorted = isSorted ? lots : lots.slice().sort((a, b) => a.acquiredWeek - b.acquiredWeek);
  const availableUnits = sorted.reduce((s, lot) => s + lot.unitsHeld, 0);
  let left = Math.min(availableUnits, Math.max(0, unitsWanted));
  let unitsTaken = 0;
  let costUSD = 0;
  // PER-LOT costs, in consumption order, because the caller folds them into a running total that
  // spans several sub-units — and floating-point addition is not associative, so summing here and
  // adding once changes the world at the third decimal. The three-week fingerprint caught exactly
  // this, twice (§7.237). An extraction that reorders arithmetic is not a refactor.
  const costsUSD: number[] = [];
  const remaining: T[] = [];
  for (const lot of sorted) {
    if (left <= 0.0001) { remaining.push(lot); continue; }
    const take = Math.min(lot.unitsHeld, left);
    left -= take;
    unitsTaken += take;
    const lotCostUSD = take * lot.unitPriceUSD;
    costsUSD.push(lotCostUSD);
    costUSD += lotCostUSD;
    const unitsLeftInLot = lot.unitsHeld - take;
    if (unitsLeftInLot > 0.0001) remaining.push({ ...lot, unitsHeld: unitsLeftInLot });
  }
  return { remaining, unitsTaken, costUSD, costsUSD, availableUnits };
}

/** How much of what a line needed its stock could actually cover. 1 = fully supplied. */
export function fulfillmentRatio(availableUnits: number, neededUnits: number): number {
  return neededUnits > 0 ? Math.min(1, availableUnits / neededUnits) : 1;
}
