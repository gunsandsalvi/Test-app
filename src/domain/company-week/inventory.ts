/**
 * §5-STRUCT step 2 — HOW MUCH OF WHAT A LINE NEEDED ITS STOCK COULD COVER.
 *
 * What is left of this module. It carried two more functions — `chargeCarryingCost`, a week of
 * warehouse cost on the output stock, and `consumeLotsFifo`, the input drawdown — and **neither
 * was reachable from any week**: the live carrying charge is `front-core.ts`'s own lane (mirrored
 * in `native/kernels.c`) and the live drawdown is `engine2/lots.ts:consumeFifoOnViews` over the
 * register's lot columns (§3.13-BOOK f3). Two representations of each thing, one of them dead
 * (rule 4), and `test/inventory.test.ts` pinned the dead pair while the live lane's own tests in
 * the same file covered the rule anyway. §3.13-INV-i deleted them: the write fence it widened is
 * what made a dead writer of a stock row visible at all.
 */

/** How much of what a line needed its stock could actually cover. 1 = fully supplied. */
export function fulfillmentRatio(availableUnits: number, neededUnits: number): number {
  return neededUnits > 0 ? Math.min(1, availableUnits / neededUnits) : 1;
}
