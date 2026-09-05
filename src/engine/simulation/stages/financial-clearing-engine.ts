/**
 * Generalized Financial Asset Clearing Engine — a real double auction
 *
 * Every tradable financial asset's price must be the real result of supply meeting demand. The
 * first version of this engine did not do that, and the way it failed is worth stating plainly
 * because it is subtle: it asked each participant how far its holdings sat from a target
 * QUANTITY, traded a fraction of that gap, and moved the price by the resulting flow. The price
 * was therefore a *residual of a quantity target* — participants bought until they owned their
 * target share of a name and whatever level that left was the level. Nothing anywhere could say
 * "below this I will not buy", because nobody was ever pricing; they were filling a quota.
 *
 * Measured, that produced a market whose SHAPE was right and whose LEVEL was impossible:
 * corporate spreads ordered correctly by rating, with a rank correlation to issuer leverage of
 * 0.64-0.78, while the entire investment-grade cohort sat 150-180bp BELOW zero. The strongest
 * relationship in the data was not credit at all — it was the share of each name that
 * institutions had been driven to own (rank correlation -0.73).
 *
 * So this engine asks the only question that produces a price: **at what level would you hold
 * how much?** Each participant posts a real demand schedule per instrument — a reservation level
 * below which it will not hold at all, and a size it scales into as the level moves in its
 * favour — and the auction solves for the level at which total demanded quantity equals the real
 * tradable float. That is the same double auction `05-unit-bidding.ts` has always run for goods,
 * where buyers post a real maximum price; the goods market got this right and the financial one
 * did not.
 *
 * Two consequences worth noting, both of which the old engine could not deliver:
 *   - **A spread cannot settle below what holding it costs.** Not because anything clamps it, but
 *     because every participant's reservation level already covers its own expected loss and the
 *     capital the position consumes, so demand at a tighter level is genuinely zero. The floor is
 *     an outcome of the participants' economics, not a bound imposed on the price.
 *   - **A marginal buyer at the wides is expressible.** A fund that demands a very high return
 *     simply posts a high reservation level: absent when paper is expensive, bidding when it is
 *     cheap enough. That is what arrests a widening, and it is why distressed buyers belong in
 *     this framework rather than beside it.
 *
 * Asset-class-agnostic on purpose. Corporate bonds, sovereign bonds, loans and eventually equity
 * all run through this same auction; only the adapter differs — who participates, what their
 * reservation level and size are, and whether the quoted statistic rises or falls with price.
 */

// §3.13-BOOK slice (a). A TYPE-only import: `isolatedModules` erases it outright, so the
// "imports nothing at runtime" contract below (the worker thread loads this module alone) holds
// exactly as before — there is no emitted require, and the worker resolver never sees it.
import type { InstrumentId } from '../../../domain/ids';

/**
 * §3.13-READ D4 — THE FLOAT IS WHAT THIS BOOK'S HOLDERS HOLD, in two halves and five books.
 *
 * Every clearing book sets `tradableFloatLocal` twice: once from the INSTITUTIONS' claimed rows,
 * BEFORE the desks are built, and again once the desks exist, adding what they carry. The order
 * matters and is not obvious — a desk is sized against the LIVE float, so leaving the float at
 * the whole outstanding until after the desk build hands every desk capacity against paper that
 * is not for sale, and a float of zero hands back no desk at all. Five books wrote both halves
 * themselves: ten copies of "sum positive positions by instrument, then assign".
 */
export function positionsByInstrument(
  books: Iterable<ReadonlyMap<InstrumentId, number>>,
  /** 07b and 07d count only paper THIS session priced; the others count everything held. */
  include?: (instrumentId: InstrumentId) => boolean
): Map<InstrumentId, number> {
  const out = new Map<InstrumentId, number>();
  for (const book of books) {
    book.forEach((amount, id) => {
      if (!(amount > 0)) return;
      if (include && !include(id)) return;
      out.set(id, (out.get(id) ?? 0) + amount);
    });
  }
  return out;
}

/** Set each instrument's float to the sum of what the named books hold of it. */
export function setTradableFloat(
  instruments: readonly { id: InstrumentId; tradableFloatLocal: number }[],
  ...books: readonly ReadonlyMap<InstrumentId, number>[]
): void {
  instruments.forEach((inst) => {
    let floatLocal = 0;
    for (const book of books) floatLocal += book.get(inst.id) ?? 0;
    inst.tradableFloatLocal = floatLocal;
  });
}

export interface ClearingInstrument {
  /** §3.13-BOOK slice (a): what this book is pricing, in the INSTRUMENT id space. */
  id: InstrumentId;
  /** Face value outstanding — the real denominator for liquidity and index weighting. */
  outstandingLocal: number;
  /**
   * The part of that stock genuinely in play: what the participants below can hold between them.
   * The rest sits with passive holders (foreign official accounts, central banks, households)
   * who do not bid in this auction. The auction clears demand against THIS, not against the whole
   * issue, because the passive share was never for sale.
   */
  tradableFloatLocal: number;
  /** Last week's quoted statistic — the starting point for the solve, and the fallback. */
  currentStat: number;
  /**
   * YIELD_LIKE statistics (a spread or yield in bps) rise as the asset gets cheaper, so demand
   * INCREASES with the statistic. PRICE_LIKE statistics (the traded price itself, e.g. equity)
   * fall as it gets cheaper, so demand DECREASES with the statistic.
   */
  statKind: 'YIELD_LIKE' | 'PRICE_LIKE';
  /** Duration in years — retained for adapters that convert the cleared level into a price. */
  durationYears: number;
  /**
   * WS8 — a PRIMARY OFFERING in this week's book: new paper sold alongside the outstanding
   * stock, so the auction prices both together and the new issue concedes exactly as much as
   * real demand requires. Added to the tradable float for the solve and the allocation.
   */
  primaryOfferingLocal?: number;
  /**
   * The issuer's walk-away: the level beyond which it pulls the deal rather than pay it
   * (YIELD_LIKE: withdrawn if the solve clears ABOVE this; PRICE_LIKE: below). On withdrawal
   * the instrument re-solves WITHOUT the offering float — a pulled deal never traded, and the
   * market clears on the stock that actually exists. The issuer's own economics limit the
   * SIZE brought to market, never the price of the outstanding stock.
   */
  primaryWithdrawStat?: number;
}

/**
 * One participant's terms for one instrument: the level at which it starts to be interested, and
 * how much it takes as the level moves further its way. This is a demand curve, not a target.
 */
export interface ParticipantDemand {
  /**
   * The level at which this participant is indifferent. For a YIELD_LIKE statistic this is the
   * spread that exactly covers what holding the asset costs it — its expected loss plus the
   * capital it consumes times the return it needs on that capital. Tighter than this and it
   * holds none.
   */
  reservationStat: number;
  /** The most it would hold at any level — its mandate or policy ceiling for this name. */
  maxHoldingLocal: number;
  /** How far past the reservation level it takes to pull in that full size. */
  fullSizeStatRange: number;
  /**
   * The most this participant can ADD to its position this week, in dollars — its real budget
   * for this name (see the adapters' budget derivation: available cash plus whatever leverage
   * its type genuinely runs, apportioned across the names it wants). A bid is a claim on money;
   * without this, entities bought with cash they did not have and ran ~10% unchosen leverage
   * (§7.19 item on S11). A cash-constrained bidder rations QUANTITY, not price (§7.6) — the
   * reservation level is unchanged, only the size it can take at that level. Omitted = unbounded
   * (banks in 07c, whose real constraint is their reserve position, not a cash budget).
   */
  maxNetPurchaseLocal?: number;
  /**
   * The core this participant holds at ANY level — a mandate expressed as size, never as a price
   * (the same doctrine as the sub-investment-grade sleeve). An insurer matching claim reserves
   * and a pension fund matching a liability duration cannot liquidate their government book
   * because yields look poor this week: the liability is still there, and something has to match
   * it. Without this, a demand schedule that goes to zero when the reservation level is missed
   * let real-money holders sell an entire asset class in twenty weeks (§7.26).
   *
   * This is a floor on holdings, not on price: it says WHAT a mandate forces the holder to own,
   * and leaves WHERE it clears entirely to the auction. G6 replaces the modelled share with each
   * entity's real liability profile.
   */
  minHoldingLocal?: number;
}

export interface ClearingParticipant {
  /** §3.13-BOOK slice (a) leaves this a plain string: it is a PARTICIPANT key, not an instrument,
   *  and the entity id space is slice (b)'s to unify. The two maps below are instrument-keyed. */
  id: string;
  currentHoldingsByInstrumentId: Map<InstrumentId, number>;
  demandByInstrumentId: Map<InstrumentId, ParticipantDemand>;
  /** Dense alternative to the Map, aligned with the INSTRUMENTS array: adapters whose books
   *  cover every name (the credit and equity adapters post a schedule for each of ~350 names per
   *  entity) hand demand over by index and skip ~120k string-keyed Map inserts a week. When
   *  present it is authoritative for this participant; the Map stays for sparse participants. */
  demandByIndex?: (ParticipantDemand | undefined)[];
  /** §4.C Stage I direct-to-pack — the row this participant wrote in the engine's demand
   *  staging (claimDemandRow/setDemand): no ParticipantDemand objects exist at all; packClearing
   *  blits the row. Authoritative over both alternatives above when present. */
  demandRow?: number;
}

/** §4.C Stage I direct-to-pack — a REUSED per-book demand staging in the pack's own layout.
 *  Adapters claim a row per participant and write scalars; the pack blits rows. Epoch-guarded
 *  like the result scratch: a staging is valid until the next openDemandStaging call. */
export interface DemandStaging {
  n: number;
  rows: number;
  present: Uint8Array;
  res: Float64Array;
  range: Float64Array;
  maxH: Float64Array;
  maxNet: Float64Array;
  minH: Float64Array;
}
const stagingScratch: DemandStaging = {
  n: 0, rows: 0,
  present: new Uint8Array(1 << 16), res: new Float64Array(1 << 16), range: new Float64Array(1 << 16),
  maxH: new Float64Array(1 << 16), maxNet: new Float64Array(1 << 16), minH: new Float64Array(1 << 16),
};
export function openDemandStaging(n: number): DemandStaging {
  stagingScratch.n = n;
  stagingScratch.rows = 0;
  return stagingScratch;
}
export function claimDemandRow(D: DemandStaging): number {
  const row = D.rows++;
  const need = (row + 1) * D.n;
  if (D.present.length < need) {
    const cap = Math.max(need, D.present.length * 2);
    const gp = new Uint8Array(cap); gp.set(D.present);
    const g = (o: Float64Array) => { const a = new Float64Array(cap); a.set(o); return a; };
    D.present = gp; D.res = g(D.res); D.range = g(D.range); D.maxH = g(D.maxH); D.maxNet = g(D.maxNet); D.minH = g(D.minH);
  }
  D.present.fill(0, row * D.n, need);
  return row;
}
/** One (participant, instrument) schedule — the exact scalars packClearing stored per pair. */
export function setDemand(D: DemandStaging, row: number, i: number, reservationStat: number, fullSizeStatRange: number, maxHoldingLocal: number, maxNetPurchaseUSDOrNaN: number, minHoldingLocal: number): void {
  const at = row * D.n + i;
  D.present[at] = 1;
  D.res[at] = reservationStat;
  D.range[at] = fullSizeStatRange;
  D.maxH[at] = maxHoldingLocal;
  D.maxNet[at] = maxNetPurchaseUSDOrNaN;
  D.minH[at] = minHoldingLocal;
}

interface ClearingParams {
  /** Bid/ask the dealer desk earns on the gross flow it facilitates. */
  dealerSpreadBps: number;
  /**
   * How far the level may travel in a single week. Real markets gap, but they gap on news
   * arriving, and the schedules above already carry the news — this keeps one week's solve from
   * jumping to an equilibrium that the next week's schedules immediately walk back, which is a
   * numerical artifact of discrete time rather than a market behaviour.
   */
  /**
   * OWN7 — **an unsold holding stays with its holder.**
   *
   * Every book here allocates the float across the participants and hands whatever is left over
   * to a RESIDUAL DEALER: `tradableFloatLocal - allocatedLocal`, financed by nobody. Once OWN7's
   * float rule made the float exactly "what these participants hold between them", that residual
   * stopped being a market maker's inventory and became what it always was — a counterparty the
   * model does not name, buying paper from holders who could not find a real buyer. Measured at
   * the settlement boundary: 5.7B of corporate bonds, 4.5B of bills and 2.7B of loans over ten
   * weeks, plus the equity book's own line.
   *
   * Set this where the float is a STOCK the participants already own (07b/07c/07d/07e/07f). The
   * allocation is then rationed on BOTH sides — the same pro-rata the buyers have always had
   * when a book is oversubscribed, now applied to the sellers when it is undersubscribed — so
   * total holdings change only by what the primary offering actually placed. A seller that finds
   * no buyer keeps its paper, which is what happens in a real market and is a far more honest
   * illiquidity than an invisible bid.
   *
   * Leave it off where the float is an inelastic ORDER from outside the participant set — an
   * exporter's receipts in fx-clearing, a borrower's cash need in repo-clearing, one side of a
   * swap — because there the unabsorbed remainder is a REAL measurement (the flow that found no
   * counterparty) and the adapters read it as one.
   */
  unsoldStaysWithHolder?: boolean;
}

/** §3.21 — what a book printed, and whether it cleared there. */
export interface ClearedPrint { stat: number; uncleared?: UnclearedReason }

/**
 * §3.21 — READ A PRINT AND SAY SO. Returns the book's statistic for the instrument — last week's,
 * carried, when the book did not clear — and records an uncleared book on the week's list, which
 * the state keeps (`lastWeekUnclearedBooks`) and the news tells. `undefined` when the instrument
 * was not in the book.
 */
export function takePrint(week: { unclearedBooks: string[] }, result: ClearingResult, id: InstrumentId, label: string): number | undefined {
  const p = result.printById.get(id);
  if (p === undefined) return undefined;
  if (p.uncleared) week.unclearedBooks.push(`${label} ${id} ${p.uncleared}`);
  return p.stat;
}
/** The same by dense index: records and returns whether the instrument's book failed to clear. */
export function unclearedAt(week: { unclearedBooks: string[] }, result: ClearingResult, i: number, label: string): UnclearedReason | undefined {
  const reason = unclearedReasonOf(result.unclearedByIndex[i]);
  if (reason) week.unclearedBooks.push(`${label} #${i} ${reason}`);
  return reason;
}

export interface ClearingResult {
  /** §4.C Stage I int flip — dense views by instrument/participant INDEX (the build's own
   *  order). The string-keyed maps below are materialized FROM these after the shards run, in
   *  the same insertion order the per-fill writes had, and die when the last reader flips. */
  statByIndex: Float64Array;
  /** §3.21 — per instrument: 0 cleared, else the reason the solve found no level (`unclearedReasonOf`);
   *  `statByIndex` then carries last week's statistic. Every adapter reads its print through
   *  `takePrint` / `unclearedAt`, which is where a book says what it does about it. */
  unclearedByIndex: Uint8Array;
  dealerInventoryByIndex: Float64Array;
  primaryByIndex: ({ withdrawn: boolean; marketTakeLocal: number; clearedStat: number } | undefined)[];
  /** pi * nInstruments + i; only fills > $1 are written, so 0 means absent. */
  holdingsMatrix: Float64Array;
  nInstruments: number;
  /** §3.21 — the print with its outcome; a reader that wants the number alone goes through `takePrint`. */
  printById: Map<InstrumentId, ClearedPrint>;
  newParticipantHoldings: Map<string, Map<InstrumentId, number>>;
  newDealerInventoryById: Map<InstrumentId, number>;
  totalDealerRevenueLocal: number;
  netCashDeltaByParticipantId: Map<string, number>;
  /**
   * SETL6 — the DEALER's own cash leg: it is the counterparty to every fill, so it receives
   * exactly what the participants paid, fees included. Participants + dealer = 0 by
   * construction, which is what lets the whole book settle through one clearing house whose
   * residual must be zero. Split by the adapters: the fee half is the desks' revenue, the rest
   * funds the inventory the dealer was left holding.
   */
  dealerNetCashLocal: number;
  /**
   * WS8 — outcome of each instrument's primary offering, when it carried one: whether the
   * issuer withdrew at its walk-away, and how much of the new paper the PARTICIPANTS actually
   * took (the rest is the lead underwriter's residual — the adapter settles that against the
   * lead bank's real cash).
   */
  primaryOutcomeById: Map<InstrumentId, { withdrawn: boolean; marketTakeLocal: number; clearedStat: number }>;
  /**
   * GUARD — did ANY participant's ceiling leave room above what it already holds?
   *
   * A `maxHoldingLocal` that equals the position it is meant to bound is not a constraint, it is
   * an identity wearing a constraint's name, and the market it governs cannot trade: OWN8's
   * `investableSurplusLocal` was the balance-sheet identity rearranged, so no bank could ever buy
   * a bond and the repo market ran at zero volume for eight commits while every check passed.
   * False here means this book's demand side cannot grow at any price.
   */
  anyCeilingAboveHolding: boolean;
}

/**
 * What this participant would hold of this instrument at a given level — its schedule, capped by
 * what its money can actually buy this week (holdings it already has plus its real budget).
 * The cap is a constant in the level, so total demand stays monotonic and bisection stays exact.
 */

/**
 * Solves for the level at which the participants collectively want exactly the tradable float.
 * Total demand is monotonic in the level, so bisection is exact and cannot oscillate.
 *
 * Both bracket ends are numerical guards, deliberately far outside any real schedule: if every
 * participant's reservation level is above some spread, demand there is zero on its own and the
 * solve simply never goes there. Where demand cannot absorb the float at the level the schedules
 * do support, the market clears wide and the dealer is left holding the difference, which is
 * what a dealer of last resort actually is.
 */
/**
 * A participant's schedule with everything that does NOT depend on the level precomputed once.
 * The bisection evaluates total demand ~62 times per instrument, and the original recomputed the
 * range clamp, the affordability cap and the mandated core on every one of those evaluations for
 * every participant — including the majority with no interest in the instrument at all, whose
 * contribution is an exact +0. Same arithmetic, same participant order, byte-identical world
 * (§7.32's constraint); only the redundant work is gone.
 */
/**
 * Column layout, in module-scope scratch reused across instruments. The bisection reads these
 * ~62 times per instrument; flat Float64Array columns give V8 pure double loads with no property
 * lookups and no per-instrument allocation (the profiler put the GC at 187 ms/week — reuse is
 * half the point). Same expressions, same evaluation order, byte-identical world.
 */
let colReservation = new Float64Array(64);
let colRange = new Float64Array(64);
let colMaxHolding = new Float64Array(64);
let colAffordable = new Float64Array(64);
let colCore = new Float64Array(64);
let colCount = 0;

function growColumns(n: number) {
  if (n <= colReservation.length) return;
  let size = colReservation.length;
  while (size < n) size *= 2;
  // §7.309 — the grow MUST carry the columns already written: this is called incrementally
  // MID-BUILD (one column at a time), so a fresh array here silently zeroed every column below
  // the boundary for the first process call that crossed it — the first big book of every
  // process cleared on a half-blank demand schedule. Found by the native port's oracle differ.
  const g = (old: Float64Array) => { const a = new Float64Array(size); a.set(old); return a; };
  colReservation = g(colReservation);
  colRange = g(colRange);
  colMaxHolding = g(colMaxHolding);
  colAffordable = g(colAffordable);
  colCore = g(colCore);
}


/**
 * Indices 0..n-1 sorted ascending by (keys[i], i) — a TOTAL order (the index tiebreak makes
 * every pair comparable and distinct), so the permutation is a property of the data, not of the
 * algorithm: any correct sort returns the identical result, which is what lets a hand-rolled
 * merge sort replace the comparator-callback sort bit-for-bit (SCALE: the callback dispatch was
 * ~24 ms/week across the books' solves). A NaN key compares "greater" on both tests below and
 * sinks right deterministically.
 */
export function sortIndexByKey(keys: ArrayLike<number>, n: number): Int32Array {
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  if (n < 2) return a;
  const b = new Int32Array(n);
  let src = a, dst = b;
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += width * 2) {
      const mid = Math.min(lo + width, n);
      const hi = Math.min(lo + width * 2, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        const ii = src[i], jj = src[j];
        const ki = keys[ii], kj = keys[jj];
        if (ki < kj || (ki === kj && ii < jj)) dst[k++] = src[i++];
        else dst[k++] = src[j++];
      }
      while (i < mid) dst[k++] = src[i++];
      while (j < hi) dst[k++] = src[j++];
    }
    const t = src; src = dst; dst = t;
  }
  return src;
}

/**
 * §3.21 — THE SOLVE SAYS WHETHER IT CLEARED. There are books for which no clearing level exists:
 * no demand at any level (the segment walk finds no crossing), and level-independent mandated
 * cores that sum past the float (oversubscribed at the extreme). A total function over that
 * partial domain had to invent something, and what it invented was the bracket bound — −2000bp,
 * 100,000bp, 1% or 100× last week's price — printed straight onto the books. Now the solve
 * reports the outcome beside the number (`lastSolveOutcome`, read by the kernel right after the
 * call: a module variable, not an allocation, in the hot loop), and the kernel CARRIES last
 * week's statistic for an uncleared book while the allocation still rations the cores pro rata.
 * The saturation retreat stays: a book whose demand merely cannot absorb the float clears at the
 * least aggressive level at which every willing buyer has full size.
 */
export type UnclearedReason = 'NO_DEMAND' | 'OVERSUBSCRIBED';
export const SOLVE_CLEARED = 0, SOLVE_NO_DEMAND = 1, SOLVE_OVERSUBSCRIBED = 2;
let lastSolveOutcome = SOLVE_CLEARED;
export const unclearedReasonOf = (code: number): UnclearedReason | undefined =>
  code === SOLVE_NO_DEMAND ? 'NO_DEMAND' : code === SOLVE_OVERSUBSCRIBED ? 'OVERSUBSCRIBED' : undefined;

function solveClearingStat(
  inst: { statKind: ClearingInstrument['statKind']; tradableFloatLocal: number },
  bracketLow: number,
  bracketHigh: number
): number {
  lastSolveOutcome = SOLVE_CLEARED;
  const isYieldLike = inst.statKind === 'YIELD_LIKE';
  const n = colCount;

  // Work in an ORIENTED coordinate u where demand is non-decreasing: u = stat for YIELD_LIKE,
  // u = -stat for PRICE_LIKE. Each entry's demand in u is a clamped ramp — flat at its mandated
  // core below the level where its schedule clears the core, rising at maxHolding/range, flat at
  // min(maxHolding, affordable) above — so TOTAL demand is piecewise linear, and the level where
  // it equals the float is a point this can compute EXACTLY rather than approach by bisection.
  //
  // This replaces sixty blind halvings per instrument with one O(n log n) segment walk, and it is
  // not only faster but more honest: the bisection returned a 60-step approximation to the
  // crossing, and the approximation error was part of the world. Swapping it is a WORLD RELABEL —
  // every cleared level shifts in its last decimals, the same class of change as an RNG-stream
  // relabel (rule 11) — recorded in the plan at the commit that introduced it.
  const uLo = isYieldLike ? bracketLow : -bracketHigh;
  const uHi = isYieldLike ? bracketHigh : -bracketLow;
  const toStat = (u: number) => (isYieldLike ? u : -u);

  const demandAtU = (u: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const distanceIntoTheMoney = u - (isYieldLike ? colReservation[i] : -colReservation[i]);
      const fraction = Math.max(0, Math.min(1, distanceIntoTheMoney / colRange[i]));
      const wantedLocal = colMaxHolding[i] * fraction;
      sum += Math.max(colCore[i], Math.min(wantedLocal, colAffordable[i]));
    }
    return sum;
  };

  // Same saturation semantics as before: when the buyer base cannot absorb the float at any
  // level, the target retreats to just under total capacity and the crossing IS the saturation
  // point — the least aggressive level at which every willing buyer has taken full size. A bound
  // is not a price (§7.21, §7.75).
  const demandAtWideEnd = demandAtU(uHi);
  const targetLocal = Math.min(inst.tradableFloatLocal, demandAtWideEnd * 0.999999);
  if (!(demandAtWideEnd > 0)) { lastSolveOutcome = SOLVE_NO_DEMAND; return toStat(uHi); } // nobody wants any, at any level
  if (demandAtU(uLo) > targetLocal) { lastSolveOutcome = SOLVE_OVERSUBSCRIBED; return toStat(uLo); } // oversubscribed even at the extreme

  // Slope-change events: where each entry's ramp rises out of its core, and where it caps.
  // Parallel number arrays sorted through an index, not an array of {u, dSlope} objects — the
  // profiler put the object sort's comparator at ~24 ms/week across the books (SCALE). The
  // index tiebreak reproduces the stable sort's order exactly, so equal-u events add their
  // slope deltas in the same sequence and every solve returns the identical bits.
  const evU: number[] = [];
  const evD: number[] = [];
  let slopeAtLo = 0;
  for (let i = 0; i < n; i++) {
    const maxH = colMaxHolding[i];
    if (!(maxH > 0)) continue;
    const range = colRange[i];
    const slope = maxH / range;
    if (!isFinite(slope) || !(slope > 0)) continue;
    const uRes = isYieldLike ? colReservation[i] : -colReservation[i];
    const fCore = Math.min(1, colCore[i] / maxH);
    const fCap = Math.min(1, colAffordable[i] / maxH);
    if (!(fCap > fCore)) continue; // core meets cap: this entry is a constant, no slope anywhere
    const uRiseStart = uRes + range * fCore;
    const uRiseEnd = uRes + range * fCap;
    if (uRiseEnd <= uLo || uRiseStart >= uHi) {
      continue; // fully outside the bracket: contributes a constant across it
    }
    if (uRiseStart <= uLo) slopeAtLo += slope;
    else { evU.push(uRiseStart); evD.push(slope); }
    if (uRiseEnd < uHi) { evU.push(uRiseEnd); evD.push(-slope); }
  }
  const evCount = evU.length;
  const order = sortIndexByKey(evU, evCount);

  // Walk the segments from the low end until the target falls inside one, then solve linearly.
  let uCur = uLo;
  let dCur = demandAtU(uLo);
  let slope = slopeAtLo;
  for (let k = 0; k <= evCount; k++) {
    const uNext = k < evCount ? evU[order[k]] : uHi;
    if (uNext > uCur) {
      const dNext = dCur + slope * (uNext - uCur);
      if (dNext >= targetLocal && slope > 0) {
        const u = uCur + (targetLocal - dCur) / slope;
        return toStat(Math.max(uLo, Math.min(uHi, u)));
      }
      dCur = dNext;
      uCur = uNext;
    }
    if (k < evCount) slope += evD[order[k]];
  }
  // Numerically flat all the way with no crossing: there was no level to clear at.
  lastSolveOutcome = SOLVE_NO_DEMAND;
  return toStat(uHi);
}

/**
 * The packed, kernel form of a clearing call (XB-perf / §5-SCALE).
 *
 * Everything a book's clear needs, as flat typed arrays: instruments as columns, demand as a
 * dense (participant x instrument) matrix in PARTICIPANT ORDER, prior holdings likewise. Packing
 * exists because the per-instrument compute is fully independent — budgets are pre-sliced per
 * name by the adapters, so no instrument's outcome feeds another's inside one call — which makes
 * the kernel shardable across worker threads. The accumulation that IS order-sensitive (cash
 * deltas are floating-point sums) happens on the main thread, in instrument order, exactly as
 * the un-sharded loop did. NaN is the "absent" sentinel for the two optional demand fields,
 * because 0 is a legitimate value for both.
 */
export interface PackedClearing {
  n: number;
  pCount: number;
  // per instrument
  float: Float64Array;
  offering: Float64Array;
  withdrawStat: Float64Array; // NaN = none
  currentStat: Float64Array;
  yieldLike: Uint8Array;
  skip: Uint8Array; // nothing to sell: pass current stat through
  // per (participant x instrument), row-major by participant
  present: Uint8Array;
  dRes: Float64Array;
  dRange: Float64Array;
  dMaxH: Float64Array;
  dMaxNet: Float64Array; // NaN = unbounded
  dMinH: Float64Array;
  prevHolding: Float64Array;
  dealerSpreadBps: number;
  unsoldStaysWithHolder: boolean;
}

/** One shard's raw results, in (instrument, participant) order within the shard. */
export interface KernelShardResult {
  from: number;
  to: number;
  clearedStat: Float64Array;      // per instrument in [from, to)
  /** §3.21 — 0 cleared, 1 no demand, 2 oversubscribed; on 1 or 2 `clearedStat` is last week's, carried. */
  uncleared: Uint8Array;
  dealerInventory: Float64Array;
  primaryWithdrawn: Uint8Array;
  primaryMarketTake: Float64Array;
  hasPrimary: Uint8Array;
  // sparse fills, appended in (instrument, participant) order
  fillInst: Int32Array;
  fillPart: Int32Array;
  fillFilled: Float64Array;
  fillTraded: Float64Array;
  fillFee: Float64Array;
  fillCount: number;
}

/** Bytes a packed clearing occupies, so a caller can allocate it on shared memory. */
function packedClearingBytes(n: number, pCount: number): number {
  const f64 = 8 * (4 * n + 6 * n * pCount);
  const u8 = 3 * n + n * pCount;
  return f64 + u8 + 64; // alignment slack
}


function packClearing(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  params: ClearingParams,
  buffer?: ArrayBufferLike
): PackedClearing {
  const n = instruments.length;
  const pCount = participants.length;
  let packed: PackedClearing;
  if (buffer !== undefined) {
    // Laid out on the caller's buffer (a SharedArrayBuffer in the worker path) so every worker
    // reads the same memory with no copy. Float64 views first for alignment.
    let off = 0;
    const f64 = (len: number) => { const v = new Float64Array(buffer, off, len); off += len * 8; return v; };
    const np = n * pCount;
    const float = f64(n), offering = f64(n), withdrawStat = f64(n), currentStat = f64(n);
    const dRes = f64(np), dRange = f64(np), dMaxH = f64(np), dMaxNet = f64(np), dMinH = f64(np), prevHolding = f64(np);
    const u8 = (len: number) => { const v = new Uint8Array(buffer, off, len); off += len; return v; };
    const yieldLike = u8(n), skip = u8(n), present = u8(np);
    packed = {
      n, pCount, float, offering, withdrawStat, currentStat, yieldLike, skip,
      present, dRes, dRange, dMaxH, dMaxNet, dMinH, prevHolding,
      dealerSpreadBps: params.dealerSpreadBps,
      unsoldStaysWithHolder: params.unsoldStaysWithHolder === true,
    };
    // Shared memory is reused across calls; zero what the packers below only conditionally set.
    present.fill(0); skip.fill(0); yieldLike.fill(0);
    dRes.fill(0); dRange.fill(0); dMaxH.fill(0); dMaxNet.fill(0); dMinH.fill(0); prevHolding.fill(0);
  } else {
    packed = {
      n, pCount,
      float: new Float64Array(n),
      offering: new Float64Array(n),
      withdrawStat: new Float64Array(n),
      currentStat: new Float64Array(n),
      yieldLike: new Uint8Array(n),
      skip: new Uint8Array(n),
      present: new Uint8Array(n * pCount),
      dRes: new Float64Array(n * pCount),
      dRange: new Float64Array(n * pCount),
      dMaxH: new Float64Array(n * pCount),
      dMaxNet: new Float64Array(n * pCount),
      dMinH: new Float64Array(n * pCount),
      prevHolding: new Float64Array(n * pCount),
      dealerSpreadBps: params.dealerSpreadBps,
      unsoldStaysWithHolder: params.unsoldStaysWithHolder === true,
    };
  }
  instruments.forEach((inst, i) => {
    const offeringLocal = Math.max(0, inst.primaryOfferingLocal ?? 0);
    packed.float[i] = inst.tradableFloatLocal;
    packed.offering[i] = offeringLocal;
    packed.withdrawStat[i] = inst.primaryWithdrawStat === undefined ? Number.NaN : inst.primaryWithdrawStat;
    packed.currentStat[i] = inst.currentStat;
    packed.yieldLike[i] = inst.statKind === 'YIELD_LIKE' ? 1 : 0;
    packed.skip[i] = inst.tradableFloatLocal + offeringLocal > 0 ? 0 : 1;
  });
  participants.forEach((p, pi) => {
    const base = pi * n;
    if (p.demandRow !== undefined) {
      const D = stagingScratch;
      const src = p.demandRow * n;
      for (let i = 0; i < n; i++) {
        if (!D.present[src + i]) continue;
        packed.present[base + i] = 1;
        packed.dRes[base + i] = D.res[src + i];
        packed.dRange[base + i] = D.range[src + i];
        packed.dMaxH[base + i] = D.maxH[src + i];
        packed.dMaxNet[base + i] = D.maxNet[src + i];
        packed.dMinH[base + i] = D.minH[src + i];
      }
    } else if (p.demandByIndex !== undefined) {
      const arr = p.demandByIndex;
      for (let i = 0; i < n; i++) {
        const d = arr[i];
        if (!d) continue;
        packed.present[base + i] = 1;
        packed.dRes[base + i] = d.reservationStat;
        packed.dRange[base + i] = d.fullSizeStatRange;
        packed.dMaxH[base + i] = d.maxHoldingLocal;
        packed.dMaxNet[base + i] = d.maxNetPurchaseLocal === undefined ? Number.NaN : d.maxNetPurchaseLocal;
        packed.dMinH[base + i] = d.minHoldingLocal ?? 0;
      }
    } else {
      instruments.forEach((inst, i) => {
        const d = p.demandByInstrumentId.get(inst.id);
        if (!d) return;
        packed.present[base + i] = 1;
        packed.dRes[base + i] = d.reservationStat;
        packed.dRange[base + i] = d.fullSizeStatRange;
        packed.dMaxH[base + i] = d.maxHoldingLocal;
        packed.dMaxNet[base + i] = d.maxNetPurchaseLocal === undefined ? Number.NaN : d.maxNetPurchaseLocal;
        packed.dMinH[base + i] = d.minHoldingLocal ?? 0;
      });
    }
    p.currentHoldingsByInstrumentId.forEach((qty, instId) => {
      const i = instIndexOf(instruments, instId);
      if (i >= 0) packed.prevHolding[base + i] = qty;
    });
  });
  return packed;
}

// Holdings arrive keyed by instrument id; resolve against the call's own instruments. One map
// per call, rebuilt cheaply — ids are already unique within a book.
let instIndexCache: Map<string, number> | null = null;
let instIndexCacheFor: ClearingInstrument[] | null = null;
function instIndexOf(instruments: ClearingInstrument[], id: string): number {
  if (instIndexCacheFor !== instruments) {
    instIndexCache = new Map(instruments.map((inst, i) => [inst.id, i]));
    instIndexCacheFor = instruments;
  }
  return instIndexCache!.get(id) ?? -1;
}

/**
 * The per-instrument kernel over [from, to): pure arithmetic on the packed arrays, no Maps and
 * no objects, so it runs identically on the main thread and inside a worker. Fill rows are
 * appended in (instrument, participant) order — the exact order the un-sharded loop touched
 * them — so the main thread's accumulation reproduces today's floating-point sums bit for bit.
 */
export function runClearingKernel(packed: PackedClearing, from: number, to: number): KernelShardResult {
  const n = packed.n;
  const pCount = packed.pCount;
  growKernelScratch(pCount);
  const span = to - from;
  const out: KernelShardResult = {
    from, to,
    clearedStat: new Float64Array(span),
    uncleared: new Uint8Array(span),
    dealerInventory: new Float64Array(span),
    primaryWithdrawn: new Uint8Array(span),
    primaryMarketTake: new Float64Array(span),
    hasPrimary: new Uint8Array(span),
    fillInst: new Int32Array(span * pCount),
    fillPart: new Int32Array(span * pCount),
    fillFilled: new Float64Array(span * pCount),
    fillTraded: new Float64Array(span * pCount),
    fillFee: new Float64Array(span * pCount),
    fillCount: 0,
  };

  for (let i = from; i < to; i++) {
    const o = i - from;
    const currentStat = packed.currentStat[i];
    if (packed.skip[i]) {
      out.clearedStat[o] = currentStat;
      out.dealerInventory[o] = Number.NaN; // marker: no entry (matches the old early-return)
      continue;
    }
    const isYieldLike = packed.yieldLike[i] === 1;
    const offeringLocal = packed.offering[i];
    const bracketLow = isYieldLike ? -2000 : Math.max(1e-6, currentStat * 0.01);
    const bracketHigh = isYieldLike ? 100000 : currentStat * 100;

    // Build the solve columns for this instrument, in participant order.
    colCount = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      if (!packed.present[k]) continue;
      growColumns(colCount + 1);
      const range = Math.max(1e-6, packed.dRange[k]);
      const maxNet = packed.dMaxNet[k];
      const affordableLocal = Number.isNaN(maxNet)
        ? Infinity
        : packed.prevHolding[k] + Math.max(0, maxNet);
      colReservation[colCount] = packed.dRes[k];
      colRange[colCount] = range;
      colMaxHolding[colCount] = packed.dMaxH[k];
      colAffordable[colCount] = affordableLocal;
      colCore[colCount] = Math.min(packed.dMinH[k], affordableLocal);
      colCount++;
    }

    let liveFloatLocal = packed.float[i] + offeringLocal;
    let solvedStat = solveClearingStat(
      { statKind: isYieldLike ? 'YIELD_LIKE' : 'PRICE_LIKE', tradableFloatLocal: liveFloatLocal },
      bracketLow, bracketHigh
    );
    let outcome = lastSolveOutcome;
    let offeringWithdrawn = false;
    const withdrawStat = packed.withdrawStat[i];
    if (offeringLocal > 0 && !Number.isNaN(withdrawStat)) {
      const beyondWalkAway = isYieldLike ? solvedStat > withdrawStat : solvedStat < withdrawStat;
      if (beyondWalkAway) {
        offeringWithdrawn = true;
        liveFloatLocal = packed.float[i];
        solvedStat = solveClearingStat(
          { statKind: isYieldLike ? 'YIELD_LIKE' : 'PRICE_LIKE', tradableFloatLocal: liveFloatLocal },
          bracketLow, bracketHigh
        );
        outcome = lastSolveOutcome;
      }
    }
    // §3.21: an uncleared book carries last week's statistic; the outcome travels beside it.
    if (outcome !== SOLVE_CLEARED) solvedStat = currentStat;
    out.uncleared[o] = outcome;

    // §5-CLOSE (user, 2026-09-02): THERE IS NO CAP. The book prints where demand met supply
    // this week. The weekly move caps (18–25% by book, adaptive since §7.338, bounded since
    // §7.342) were clamps on prices; 1,346 names were pinned against them at once and the print
    // was the cap, not the market. A book with no other side now shows it as a price, and the
    // desks, the issuer and the float are what answer it — never a bound.
    // §3.13-SOV row 4 — THE PRINT'S RESOLUTION IS RELATIVE, BECAUSE THE STAT'S SCALE IS NOT KNOWN
    // HERE. This was `toFixed(4)`: an ABSOLUTE grid of 1e-4, which is invisible on a stat quoted
    // in basis points (1e-4 of a bp) and enormous on one quoted as a price near 1 — where it is a
    // whole basis point of PRICE, and on a 13-week bill four basis points of YIELD, which is more
    // than the weekly move. Measured when the bill book was converted to clear a price: the
    // 13-week print pinned at exactly 0.99030000 for every week of the run while the 26- and
    // 52-week prints, whose grids are two and four times finer in yield terms, still moved.
    //
    // Significant figures instead of decimal places. The intent was always to drop the last bits
    // of float noise rather than to impose a grid, and ten significant figures does that at any
    // scale this engine prints at.
    const clearedStat = Number(solvedStat.toPrecision(10));
    void isYieldLike;
    out.clearedStat[o] = isFinite(clearedStat) ? clearedStat : currentStat;

    // Settle: cores first, then the discretionary layer pro rata — identical arithmetic to the
    // un-sharded loop, participant order preserved.
    let wantedTotalLocal = 0;
    let coreTotalLocal = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      const previousLocal = packed.prevHolding[k];
      let filledLocal = 0;
      let coreLocal = 0;
      if (packed.present[k]) {
        const range = Math.max(1e-6, packed.dRange[k]);
        const distanceIntoTheMoney = isYieldLike ? clearedStat - packed.dRes[k] : packed.dRes[k] - clearedStat;
        const fraction = Math.max(0, Math.min(1, distanceIntoTheMoney / range));
        const wantedLocal = packed.dMaxH[k] * fraction;
        const maxNet = packed.dMaxNet[k];
        const affordableLocal = Number.isNaN(maxNet) ? Infinity : previousLocal + Math.max(0, maxNet);
        const mandatedCoreLocal = Math.min(packed.dMinH[k], affordableLocal);
        filledLocal = Math.max(mandatedCoreLocal, Math.min(wantedLocal, affordableLocal));
        coreLocal = Math.min(packed.dMinH[k], affordableLocal, filledLocal);
      }
      kernWanted[pi] = filledLocal;
      kernCore[pi] = coreLocal;
      wantedTotalLocal += filledLocal;
      coreTotalLocal += coreLocal;
    }
    const coreScale = coreTotalLocal > liveFloatLocal ? liveFloatLocal / coreTotalLocal : 1;
    const discretionaryFloatLocal = Math.max(0, liveFloatLocal - coreTotalLocal * coreScale);
    const discretionaryWantedLocal = wantedTotalLocal - coreTotalLocal;
    const discretionaryScale = discretionaryWantedLocal > discretionaryFloatLocal
      ? discretionaryFloatLocal / Math.max(1e-9, discretionaryWantedLocal)
      : 1;

    // What each participant would hold at the cleared level, and the two-sided flow that
    // implies. Held separately from the emit pass below because the SELL side has to be
    // rationed against the BUY side before either is booked (see unsoldStaysWithHolder).
    let priorTotalLocal = 0;
    let grossBuysLocal = 0;
    let grossSellsLocal = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      const previousLocal = packed.prevHolding[k];
      priorTotalLocal += previousLocal;
      const coreLocal = kernCore[pi] * coreScale;
      const discretionaryLocal = Math.max(0, kernWanted[pi] - kernCore[pi]);
      const filledLocal = coreLocal + discretionaryLocal * discretionaryScale;
      kernFilled[pi] = filledLocal;
      const tradedLocal = filledLocal - previousLocal;
      if (tradedLocal > 0) grossBuysLocal += tradedLocal; else grossSellsLocal -= tradedLocal;
    }

    // OWN7 — a trade needs two sides. Where the float is a stock these participants already own,
    // the only paper for sale is what one of them is selling, plus what the issuer brought: the
    // buyers can take no more than that, and the sellers can place no more than the buyers want.
    // Whichever side is larger is rationed pro rata — the identical treatment an oversubscribed
    // book has always given its buyers. Off (the flow books), both scales are 1 and the
    // unabsorbed remainder falls to the residual below, which is what those adapters measure.
    let buyScale = 1;
    let sellScale = 1;
    if (packed.unsoldStaysWithHolder) {
      const takeLocal = Math.max(0, Math.min(offeringLocal, grossBuysLocal - grossSellsLocal));
      const absorbableBuysLocal = grossSellsLocal + takeLocal;
      if (grossBuysLocal > absorbableBuysLocal) {
        buyScale = grossBuysLocal > 0 ? absorbableBuysLocal / grossBuysLocal : 1;
      } else if (grossSellsLocal > grossBuysLocal - takeLocal) {
        sellScale = grossSellsLocal > 0 ? Math.max(0, grossBuysLocal - takeLocal) / grossSellsLocal : 1;
      }
    }

    let allocatedLocal = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      const previousLocal = packed.prevHolding[k];
      const wantedTradeLocal = kernFilled[pi] - previousLocal;
      const tradedLocal = wantedTradeLocal > 0 ? wantedTradeLocal * buyScale : wantedTradeLocal * sellScale;
      const filledLocal = previousLocal + tradedLocal;
      const feeLocal = Math.abs(tradedLocal) * (packed.dealerSpreadBps / 10000);
      allocatedLocal += filledLocal;
      // Emit only rows that can move anything: a participant with no demand and no prior
      // holding contributes exact zeros everywhere (the old loop added -0-0 to its cash).
      if (packed.present[k] || previousLocal !== 0) {
        const f = out.fillCount++;
        out.fillInst[f] = i;
        out.fillPart[f] = pi;
        out.fillFilled[f] = filledLocal;
        out.fillTraded[f] = tradedLocal;
        out.fillFee[f] = feeLocal;
      }
    }
    // With both sides rationed there is nothing left over by construction, so there is no
    // residual dealer to name; the flow books keep theirs, and it is a real measurement there.
    out.dealerInventory[o] = packed.unsoldStaysWithHolder
      ? 0
      : Math.round((liveFloatLocal - allocatedLocal));

    if (offeringLocal > 0) {
      out.hasPrimary[o] = 1;
      out.primaryWithdrawn[o] = offeringWithdrawn ? 1 : 0;
      const marketTakeLocal = offeringWithdrawn
        ? 0
        : Math.max(0, Math.min(offeringLocal, allocatedLocal - priorTotalLocal));
      out.primaryMarketTake[o] = Math.round(marketTakeLocal);
    }
  }
  return out;
}

// Kernel scratch for the settle pass, module-scope like the solve columns.
let kernWanted = new Float64Array(64);
let kernCore = new Float64Array(64);
let kernFilled = new Float64Array(64);
function growKernelScratch(pCount: number) {
  if (pCount <= kernWanted.length) return;
  let size = kernWanted.length;
  while (size < pCount) size *= 2;
  kernWanted = new Float64Array(size);
  kernCore = new Float64Array(size);
  kernFilled = new Float64Array(size);
}

/**
 * Accumulate shard results into the result maps, in instrument order — the fill rows arrive in
 * (instrument, participant) order within each shard and shards are contiguous ranges walked in
 * order, so every floating-point sum here runs through the same terms in the same sequence the
 * un-sharded loop produced.
 */
function accumulateShard(
  shard: KernelShardResult,
  instruments: ClearingInstrument[],
  result: ClearingResult,
  // §4.C Stage I int flip — the shard lands on DENSE VIEWS only (no map writes in the fill
  // loop at all); `materializeResultMaps` rebuilds the string maps afterward in the exact
  // insertion order the per-fill writes had. Cash stays the §7.327 dense flush.
  cashByPi: Float64Array,
): void {
  const nI = result.nInstruments;
  for (let i = shard.from; i < shard.to; i++) {
    const o = i - shard.from;
    result.statByIndex[i] = shard.clearedStat[o];
    result.unclearedByIndex[i] = shard.uncleared[o];
    result.dealerInventoryByIndex[i] = shard.dealerInventory[o];
    if (shard.hasPrimary[o]) {
      result.primaryByIndex[i] = {
        withdrawn: shard.primaryWithdrawn[o] === 1,
        marketTakeLocal: shard.primaryMarketTake[o],
        clearedStat: shard.clearedStat[o],
      };
    }
  }
  let f = 0;
  // Fill rows are already globally ordered within the shard.
  for (; f < shard.fillCount; f++) {
    const filledLocal = shard.fillFilled[f];
    const tradedLocal = shard.fillTraded[f];
    const feeLocal = shard.fillFee[f];
    // Dust is a DOLLAR: a position worth a dollar or less is not carried. The unit here is the
    // book's — dollars on the credit books, SHARES on the equity book — so the test is in money
    // (units × the cleared price where the stat is a price). Measured at §7.373: `filledLocal > 1`
    // in units dropped 0.44 shares of a $279,800 name, $124k the holder was paid for by nobody.
    const fi = shard.fillInst[f];
    const unitValueLocal = instruments[fi].statKind === 'PRICE_LIKE' ? shard.clearedStat[fi - shard.from] : 1;
    if (filledLocal * unitValueLocal > 1) {
      const cell = shard.fillPart[f] * nI + fi;
      result.holdingsMatrix[cell] = filledLocal;
      noteDenseWrite(cell);
    }
    cashByPi[shard.fillPart[f]] = cashByPi[shard.fillPart[f]] - tradedLocal - feeLocal;
    result.totalDealerRevenueLocal += feeLocal;
    result.dealerNetCashLocal += tradedLocal + feeLocal;
  }
}

/**
 * GUARD: does at least one participant have room to grow at least one position? Early-exits on
 * the first one that does, so in a healthy book this costs a handful of comparisons; it walks
 * the whole demand set only when the answer is no, which is exactly the case worth knowing.
 */
function anyCeilingAboveHolding(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[]
): boolean {
  for (const p of participants) {
    if (p.demandRow !== undefined) {
      const D = stagingScratch;
      const src = p.demandRow * D.n;
      for (let i = 0; i < instruments.length; i++) {
        if (!D.present[src + i]) continue;
        const held = p.currentHoldingsByInstrumentId.get(instruments[i].id) ?? 0;
        if (D.maxH[src + i] > held + 1) return true;
      }
      continue;
    }
    for (let i = 0; i < instruments.length; i++) {
      const d = p.demandByIndex !== undefined
        ? p.demandByIndex[i]
        : p.demandByInstrumentId.get(instruments[i].id);
      if (!d) continue;
      const held = p.currentHoldingsByInstrumentId.get(instruments[i].id) ?? 0;
      if (d.maxHoldingLocal > held + 1) return true;
    }
  }
  return participants.length === 0;
}

/**
 * The worker pool injects itself here (see clearing-worker-pool.ts). The engine deliberately
 * imports NOTHING at runtime: the worker thread loads this module alone, and tsx's resolver
 * inside workers cannot follow extensionless relative imports — the dependency points the other
 * way instead.
 */
interface ShardedKernelApi {
  workerCount: () => number;
  sharedBuffer: (bytes: number) => SharedArrayBuffer | null;
  run: (packed: PackedClearing, sab: SharedArrayBuffer) => KernelShardResult[] | null;
}
let shardedKernel: ShardedKernelApi | null = null;
export function registerShardedKernel(api: ShardedKernelApi): void { shardedKernel = api; }

/**
 * §5-SCALE, the native-cores campaign (§7.308): a C port of `runClearingKernel`, verified
 * bit-equal on captured real books, injects itself here the same way the worker pool does —
 * this module still imports nothing. The JS kernel stays canonical; the native one must be
 * value-identical or it may not register (native-kernels.ts owns the gate).
 */
let denseScratch = new Float64Array(1 << 16);
let denseEpoch = 0;
// §4.C — the scratch is zeroed by REPLAYING what the last book wrote (fills are sparse; a full
// n×p zero-fill per book measured as a real regression at the Stage I boundary battery).
let denseWritten = new Int32Array(1 << 12);
let denseWrittenCount = 0;
function noteDenseWrite(cell: number): void {
  if (denseWrittenCount >= denseWritten.length) {
    const g = new Int32Array(denseWritten.length * 2); g.set(denseWritten); denseWritten = g;
  }
  denseWritten[denseWrittenCount++] = cell;
}
function ensureDenseScratch(size: number): Float64Array {
  denseEpoch++;
  if (denseScratch.length < size) {
    denseScratch = new Float64Array(Math.max(size, denseScratch.length * 2)); // fresh = zeroed
  } else {
    for (let k = 0; k < denseWrittenCount; k++) denseScratch[denseWritten[k]] = 0;
  }
  denseWrittenCount = 0;
  return denseScratch.subarray(0, size);
}

let nativeKernel: ((packed: PackedClearing, from: number, to: number) => KernelShardResult) | null = null;
export function registerNativeKernel(fn: typeof nativeKernel): void { nativeKernel = fn; }

export function clearFinancialAsset(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  params: ClearingParams
): ClearingResult {
  const nDense = instruments.length;
  const denseHold = ensureDenseScratch(nDense * participants.length);
  const myEpoch = denseEpoch;
  const instIds = instruments.map((i) => i.id);
  // §4.C int flip — the string maps are LAZY: built on first access from the dense views, in
  // the exact insertion order the per-fill writes had, so a book whose adapter reads only the
  // dense views never pays for them. The holdings scratch is REUSED across books, so touching a
  // stale result after the next book cleared is a defect and fails loudly here.
  let statMap: Map<InstrumentId, ClearedPrint> | null = null;
  let holdMaps: Map<string, Map<InstrumentId, number>> | null = null;
  let dealerMap: Map<InstrumentId, number> | null = null;
  let primaryMap: Map<InstrumentId, { withdrawn: boolean; marketTakeLocal: number; clearedStat: number }> | null = null;
  const assertFresh = (): void => {
    if (myEpoch !== denseEpoch) throw new Error('ClearingResult read after the next book cleared — the dense scratch is reused; consume each result before the next clearFinancialAsset call');
  };
  const result: ClearingResult = {
    statByIndex: new Float64Array(nDense),
    unclearedByIndex: new Uint8Array(nDense),
    dealerInventoryByIndex: new Float64Array(nDense).fill(NaN),
    primaryByIndex: new Array(nDense),
    holdingsMatrix: denseHold,
    nInstruments: nDense,
    get printById() {
      if (!statMap) {
        statMap = new Map();
        for (let i = 0; i < nDense; i++) {
          const reason = unclearedReasonOf(this.unclearedByIndex[i]);
          statMap.set(instIds[i], reason ? { stat: this.statByIndex[i], uncleared: reason } : { stat: this.statByIndex[i] });
        }
      }
      return statMap;
    },
    get newParticipantHoldings() {
      if (!holdMaps) {
        assertFresh();
        holdMaps = new Map();
        for (let pi = 0; pi < participants.length; pi++) {
          const m = new Map<InstrumentId, number>();
          const base = pi * nDense;
          for (let i = 0; i < nDense; i++) {
            const v = this.holdingsMatrix[base + i];
            if (v !== 0) m.set(instIds[i], v);
          }
          holdMaps.set(participants[pi].id, m);
        }
      }
      return holdMaps;
    },
    get newDealerInventoryById() {
      if (!dealerMap) {
        dealerMap = new Map();
        for (let i = 0; i < nDense; i++) {
          if (!Number.isNaN(this.dealerInventoryByIndex[i])) dealerMap.set(instIds[i], this.dealerInventoryByIndex[i]);
        }
      }
      return dealerMap;
    },
    get primaryOutcomeById() {
      if (!primaryMap) {
        primaryMap = new Map();
        for (let i = 0; i < nDense; i++) {
          const po = this.primaryByIndex[i];
          if (po) primaryMap.set(instIds[i], po);
        }
      }
      return primaryMap;
    },
    totalDealerRevenueLocal: 0,
    netCashDeltaByParticipantId: new Map(),
    dealerNetCashLocal: 0,
    anyCeilingAboveHolding: anyCeilingAboveHolding(instruments, participants),
  };
  participants.forEach((p) => {
    result.netCashDeltaByParticipantId.set(p.id, 0);
  });
  const cashByPi = new Float64Array(participants.length);
  const flushCash = () => {
    participants.forEach((p, pi) => result.netCashDeltaByParticipantId.set(p.id, cashByPi[pi]));
  };

  // Worker path (opt-in, Node-only): pack onto shared memory, shard the kernel across the pool,
  // accumulate the shards in instrument order. Serial path otherwise — the SAME kernel, so the
  // two paths are one arithmetic and the state hash cannot tell them apart.
  const n = instruments.length;
  const pCount = participants.length;
  if (n >= 32 && shardedKernel && shardedKernel.workerCount() > 0) {
    const sab = shardedKernel.sharedBuffer(packedClearingBytes(n, pCount));
    if (sab) {
      const packed = packClearing(instruments, participants, params, sab);
      const shards = shardedKernel.run(packed, sab);
      if (shards) {
        for (const shard of shards) accumulateShard(shard as never, instruments, result, cashByPi);
        flushCash();
        return result;
      }
      // Pool refused (too small, or a worker failed): the packed views are ordinary arrays to
      // the kernel, so fall straight through to the serial path on the same packing.
      growKernelScratch(pCount);
      const shard = (nativeKernel ?? runClearingKernel)(packed, 0, packed.n);
      accumulateShard(shard, instruments, result, cashByPi);
      flushCash();
      return result;
    }
  }

  const packed = packClearing(instruments, participants, params);
  growKernelScratch(packed.pCount);
  const shard = (nativeKernel ?? runClearingKernel)(packed, 0, packed.n);
  accumulateShard(shard, instruments, result, cashByPi);
  flushCash();
  return result;
}
