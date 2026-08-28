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

export interface ClearingInstrument {
  id: string;
  /** Face value outstanding — the real denominator for liquidity and index weighting. */
  outstandingUSD: number;
  /**
   * The part of that stock genuinely in play: what the participants below can hold between them.
   * The rest sits with passive holders (foreign official accounts, central banks, households)
   * who do not bid in this auction. The auction clears demand against THIS, not against the whole
   * issue, because the passive share was never for sale.
   */
  tradableFloatUSD: number;
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
  primaryOfferingUSD?: number;
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
  maxHoldingUSD: number;
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
  maxNetPurchaseUSD?: number;
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
  minHoldingUSD?: number;
}

export interface ClearingParticipant {
  id: string;
  currentHoldingsByInstrumentId: Map<string, number>;
  demandByInstrumentId: Map<string, ParticipantDemand>;
  /** Dense alternative to the Map, aligned with the INSTRUMENTS array: adapters whose books
   *  cover every name (the credit and equity adapters post a schedule for each of ~350 names per
   *  entity) hand demand over by index and skip ~120k string-keyed Map inserts a week. When
   *  present it is authoritative for this participant; the Map stays for sparse participants. */
  demandByIndex?: (ParticipantDemand | undefined)[];
}

/**
 * The absolute floor the damper grants a YIELD_LIKE statistic's one-week move (the `+ 25` in
 * the damping arithmetic below). Exported with one owner because WS6's haircut derivation
 * needs the same number: the smallest repricing a lender must assume collateral can suffer in
 * one week is exactly the smallest move this engine will allow it to make.
 */
export const YIELD_LIKE_MIN_WEEKLY_MOVE_BPS = 25;

export interface ClearingParams {
  /** Bid/ask the dealer desk earns on the gross flow it facilitates. */
  dealerSpreadBps: number;
  /**
   * How far the level may travel in a single week. Real markets gap, but they gap on news
   * arriving, and the schedules above already carry the news — this keeps one week's solve from
   * jumping to an equilibrium that the next week's schedules immediately walk back, which is a
   * numerical artifact of discrete time rather than a market behaviour.
   */
  maxWeeklyStatMovePct: number;
}

export interface ClearingResult {
  newStatById: Map<string, number>;
  newParticipantHoldings: Map<string, Map<string, number>>;
  newDealerInventoryById: Map<string, number>;
  totalDealerRevenueUSD: number;
  netCashDeltaByParticipantId: Map<string, number>;
  /**
   * §6 damper diagnostic: instrument ids whose printed level was held away from the solved
   * level by `maxWeeklyStatMovePct` this week. The damper is legitimate discrete-time
   * smoothing, but it must never BIND persistently — a name clamped for weeks on end means
   * the posted schedules disagree with the printed level and the print is the damper, not
   * the market. The invariants harness tracks consecutive-week counts off this.
   */
  damperBoundInstrumentIds: string[];
  /**
   * WS8 — outcome of each instrument's primary offering, when it carried one: whether the
   * issuer withdrew at its walk-away, and how much of the new paper the PARTICIPANTS actually
   * took (the rest is the lead underwriter's residual — the adapter settles that against the
   * lead bank's real cash).
   */
  primaryOutcomeById: Map<string, { withdrawn: boolean; marketTakeUSD: number; clearedStat: number }>;
}

/**
 * What this participant would hold of this instrument at a given level — its schedule, capped by
 * what its money can actually buy this week (holdings it already has plus its real budget).
 * The cap is a constant in the level, so total demand stays monotonic and bisection stays exact.
 */
function demandAtStat(
  demand: ParticipantDemand,
  stat: number,
  statKind: ClearingInstrument['statKind'],
  previousHoldingUSD: number
): number {
  const range = Math.max(1e-6, demand.fullSizeStatRange);
  // A yield-like statistic gets more attractive as it RISES; a price-like one as it FALLS.
  const distanceIntoTheMoney = statKind === 'YIELD_LIKE'
    ? stat - demand.reservationStat
    : demand.reservationStat - stat;
  const fraction = Math.max(0, Math.min(1, distanceIntoTheMoney / range));
  const wantedUSD = demand.maxHoldingUSD * fraction;
  const affordableUSD = demand.maxNetPurchaseUSD === undefined
    ? Infinity
    : previousHoldingUSD + Math.max(0, demand.maxNetPurchaseUSD);
  // The mandated core is held at any level, but a mandate cannot conjure money: it is bounded by
  // what the participant can actually afford to hold.
  const mandatedCoreUSD = Math.min(demand.minHoldingUSD ?? 0, affordableUSD);
  return Math.max(mandatedCoreUSD, Math.min(wantedUSD, affordableUSD));
}

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
  colReservation = new Float64Array(size);
  colRange = new Float64Array(size);
  colMaxHolding = new Float64Array(size);
  colAffordable = new Float64Array(size);
  colCore = new Float64Array(size);
}

function pushPreparedDemand(demand: ParticipantDemand, previousHoldingUSD: number) {
  growColumns(colCount + 1);
  const range = Math.max(1e-6, demand.fullSizeStatRange);
  const affordableUSD = demand.maxNetPurchaseUSD === undefined
    ? Infinity
    : previousHoldingUSD + Math.max(0, demand.maxNetPurchaseUSD);
  colReservation[colCount] = demand.reservationStat;
  colRange[colCount] = range;
  colMaxHolding[colCount] = demand.maxHoldingUSD;
  colAffordable[colCount] = affordableUSD;
  colCore[colCount] = Math.min(demand.minHoldingUSD ?? 0, affordableUSD);
  colCount++;
}

function solveClearingStat(
  inst: { statKind: ClearingInstrument['statKind']; tradableFloatUSD: number },
  bracketLow: number,
  bracketHigh: number
): number {
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
  // relabel (rule 10) — recorded in the plan at the commit that introduced it.
  const uLo = isYieldLike ? bracketLow : -bracketHigh;
  const uHi = isYieldLike ? bracketHigh : -bracketLow;
  const toStat = (u: number) => (isYieldLike ? u : -u);

  const demandAtU = (u: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const distanceIntoTheMoney = u - (isYieldLike ? colReservation[i] : -colReservation[i]);
      const fraction = Math.max(0, Math.min(1, distanceIntoTheMoney / colRange[i]));
      const wantedUSD = colMaxHolding[i] * fraction;
      sum += Math.max(colCore[i], Math.min(wantedUSD, colAffordable[i]));
    }
    return sum;
  };

  // Same saturation semantics as before: when the buyer base cannot absorb the float at any
  // level, the target retreats to just under total capacity and the crossing IS the saturation
  // point — the least aggressive level at which every willing buyer has taken full size. A bound
  // is not a price (§7.21, §7.75).
  const demandAtWideEnd = demandAtU(uHi);
  const targetUSD = Math.min(inst.tradableFloatUSD, demandAtWideEnd * 0.999999);
  if (demandAtU(uLo) > targetUSD) return toStat(uLo); // oversubscribed even at the extreme

  // Slope-change events: where each entry's ramp rises out of its core, and where it caps.
  const events: { u: number; dSlope: number }[] = [];
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
    else events.push({ u: uRiseStart, dSlope: slope });
    if (uRiseEnd < uHi) events.push({ u: uRiseEnd, dSlope: -slope });
  }
  events.sort((a, b) => a.u - b.u);

  // Walk the segments from the low end until the target falls inside one, then solve linearly.
  let uCur = uLo;
  let dCur = demandAtU(uLo);
  let slope = slopeAtLo;
  for (let k = 0; k <= events.length; k++) {
    const uNext = k < events.length ? events[k].u : uHi;
    if (uNext > uCur) {
      const dNext = dCur + slope * (uNext - uCur);
      if (dNext >= targetUSD && slope > 0) {
        const u = uCur + (targetUSD - dCur) / slope;
        return toStat(Math.max(uLo, Math.min(uHi, u)));
      }
      dCur = dNext;
      uCur = uNext;
    }
    if (k < events.length) slope += events[k].dSlope;
  }
  // Numerically flat all the way (target met only at the wide end): the saturation point is there.
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
  maxWeeklyStatMovePct: number;
}

/** One shard's raw results, in (instrument, participant) order within the shard. */
export interface KernelShardResult {
  from: number;
  to: number;
  clearedStat: Float64Array;      // per instrument in [from, to)
  damper: Uint8Array;
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
export function packedClearingBytes(n: number, pCount: number): number {
  const f64 = 8 * (4 * n + 6 * n * pCount);
  const u8 = 2 * n + n * pCount;
  return f64 + u8 + 64; // alignment slack
}

export function packClearing(
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
      maxWeeklyStatMovePct: params.maxWeeklyStatMovePct ?? Number.NaN,
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
      maxWeeklyStatMovePct: params.maxWeeklyStatMovePct ?? Number.NaN,
    };
  }
  instruments.forEach((inst, i) => {
    const offeringUSD = Math.max(0, inst.primaryOfferingUSD ?? 0);
    packed.float[i] = inst.tradableFloatUSD;
    packed.offering[i] = offeringUSD;
    packed.withdrawStat[i] = inst.primaryWithdrawStat === undefined ? Number.NaN : inst.primaryWithdrawStat;
    packed.currentStat[i] = inst.currentStat;
    packed.yieldLike[i] = inst.statKind === 'YIELD_LIKE' ? 1 : 0;
    packed.skip[i] = inst.tradableFloatUSD + offeringUSD > 0 ? 0 : 1;
  });
  participants.forEach((p, pi) => {
    const base = pi * n;
    if (p.demandByIndex !== undefined) {
      const arr = p.demandByIndex;
      for (let i = 0; i < n; i++) {
        const d = arr[i];
        if (!d) continue;
        packed.present[base + i] = 1;
        packed.dRes[base + i] = d.reservationStat;
        packed.dRange[base + i] = d.fullSizeStatRange;
        packed.dMaxH[base + i] = d.maxHoldingUSD;
        packed.dMaxNet[base + i] = d.maxNetPurchaseUSD === undefined ? Number.NaN : d.maxNetPurchaseUSD;
        packed.dMinH[base + i] = d.minHoldingUSD ?? 0;
      }
    } else {
      instruments.forEach((inst, i) => {
        const d = p.demandByInstrumentId.get(inst.id);
        if (!d) return;
        packed.present[base + i] = 1;
        packed.dRes[base + i] = d.reservationStat;
        packed.dRange[base + i] = d.fullSizeStatRange;
        packed.dMaxH[base + i] = d.maxHoldingUSD;
        packed.dMaxNet[base + i] = d.maxNetPurchaseUSD === undefined ? Number.NaN : d.maxNetPurchaseUSD;
        packed.dMinH[base + i] = d.minHoldingUSD ?? 0;
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
    damper: new Uint8Array(span),
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
    const offeringUSD = packed.offering[i];
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
      const affordableUSD = Number.isNaN(maxNet)
        ? Infinity
        : packed.prevHolding[k] + Math.max(0, maxNet);
      colReservation[colCount] = packed.dRes[k];
      colRange[colCount] = range;
      colMaxHolding[colCount] = packed.dMaxH[k];
      colAffordable[colCount] = affordableUSD;
      colCore[colCount] = Math.min(packed.dMinH[k], affordableUSD);
      colCount++;
    }

    let liveFloatUSD = packed.float[i] + offeringUSD;
    let solvedStat = solveClearingStat(
      { statKind: isYieldLike ? 'YIELD_LIKE' : 'PRICE_LIKE', tradableFloatUSD: liveFloatUSD },
      bracketLow, bracketHigh
    );
    let offeringWithdrawn = false;
    const withdrawStat = packed.withdrawStat[i];
    if (offeringUSD > 0 && !Number.isNaN(withdrawStat)) {
      const beyondWalkAway = isYieldLike ? solvedStat > withdrawStat : solvedStat < withdrawStat;
      if (beyondWalkAway) {
        offeringWithdrawn = true;
        liveFloatUSD = packed.float[i];
        solvedStat = solveClearingStat(
          { statKind: isYieldLike ? 'YIELD_LIKE' : 'PRICE_LIKE', tradableFloatUSD: liveFloatUSD },
          bracketLow, bracketHigh
        );
      }
    }

    // Discrete-time damping, not a price bound: see maxWeeklyStatMovePct. Undamped when omitted.
    const maxMove = Number.isNaN(packed.maxWeeklyStatMovePct)
      ? Infinity
      : Math.abs(currentStat) * packed.maxWeeklyStatMovePct + (isYieldLike ? YIELD_LIKE_MIN_WEEKLY_MOVE_BPS : 0);
    const clearedStat = Number(
      Math.max(currentStat - maxMove, Math.min(currentStat + maxMove, solvedStat)).toFixed(4)
    );
    if (Math.abs(solvedStat - clearedStat) > Math.max(1e-6, Math.abs(solvedStat) * 1e-6)) {
      out.damper[o] = 1;
    }
    out.clearedStat[o] = isFinite(clearedStat) ? clearedStat : currentStat;

    // Settle: cores first, then the discretionary layer pro rata — identical arithmetic to the
    // un-sharded loop, participant order preserved.
    let wantedTotalUSD = 0;
    let coreTotalUSD = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      const previousUSD = packed.prevHolding[k];
      let filledUSD = 0;
      let coreUSD = 0;
      if (packed.present[k]) {
        const range = Math.max(1e-6, packed.dRange[k]);
        const distanceIntoTheMoney = isYieldLike ? clearedStat - packed.dRes[k] : packed.dRes[k] - clearedStat;
        const fraction = Math.max(0, Math.min(1, distanceIntoTheMoney / range));
        const wantedUSD = packed.dMaxH[k] * fraction;
        const maxNet = packed.dMaxNet[k];
        const affordableUSD = Number.isNaN(maxNet) ? Infinity : previousUSD + Math.max(0, maxNet);
        const mandatedCoreUSD = Math.min(packed.dMinH[k], affordableUSD);
        filledUSD = Math.max(mandatedCoreUSD, Math.min(wantedUSD, affordableUSD));
        coreUSD = Math.min(packed.dMinH[k], affordableUSD, filledUSD);
      }
      kernWanted[pi] = filledUSD;
      kernCore[pi] = coreUSD;
      wantedTotalUSD += filledUSD;
      coreTotalUSD += coreUSD;
    }
    const coreScale = coreTotalUSD > liveFloatUSD ? liveFloatUSD / coreTotalUSD : 1;
    const discretionaryFloatUSD = Math.max(0, liveFloatUSD - coreTotalUSD * coreScale);
    const discretionaryWantedUSD = wantedTotalUSD - coreTotalUSD;
    const discretionaryScale = discretionaryWantedUSD > discretionaryFloatUSD
      ? discretionaryFloatUSD / Math.max(1e-9, discretionaryWantedUSD)
      : 1;

    let allocatedUSD = 0;
    let priorTotalUSD = 0;
    for (let pi = 0; pi < pCount; pi++) {
      const k = pi * n + i;
      const previousUSD = packed.prevHolding[k];
      priorTotalUSD += previousUSD;
      const coreUSD = kernCore[pi] * coreScale;
      const discretionaryUSD = Math.max(0, kernWanted[pi] - kernCore[pi]);
      const filledUSD = coreUSD + discretionaryUSD * discretionaryScale;
      const tradedUSD = filledUSD - previousUSD;
      const feeUSD = Math.abs(tradedUSD) * (packed.dealerSpreadBps / 10000);
      allocatedUSD += filledUSD;
      // Emit only rows that can move anything: a participant with no demand and no prior
      // holding contributes exact zeros everywhere (the old loop added -0-0 to its cash).
      if (packed.present[k] || previousUSD !== 0) {
        const f = out.fillCount++;
        out.fillInst[f] = i;
        out.fillPart[f] = pi;
        out.fillFilled[f] = filledUSD;
        out.fillTraded[f] = tradedUSD;
        out.fillFee[f] = feeUSD;
      }
    }
    out.dealerInventory[o] = Number((liveFloatUSD - allocatedUSD).toFixed(0));

    if (offeringUSD > 0) {
      out.hasPrimary[o] = 1;
      out.primaryWithdrawn[o] = offeringWithdrawn ? 1 : 0;
      const marketTakeUSD = offeringWithdrawn
        ? 0
        : Math.max(0, Math.min(offeringUSD, allocatedUSD - priorTotalUSD));
      out.primaryMarketTake[o] = Number(marketTakeUSD.toFixed(0));
    }
  }
  return out;
}

// Kernel scratch for the settle pass, module-scope like the solve columns.
let kernWanted = new Float64Array(64);
let kernCore = new Float64Array(64);
function growKernelScratch(pCount: number) {
  if (pCount <= kernWanted.length) return;
  let size = kernWanted.length;
  while (size < pCount) size *= 2;
  kernWanted = new Float64Array(size);
  kernCore = new Float64Array(size);
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
  participants: ClearingParticipant[],
  result: ClearingResult
): void {
  for (let i = shard.from; i < shard.to; i++) {
    const o = i - shard.from;
    result.newStatById.set(instruments[i].id, shard.clearedStat[o]);
    if (shard.damper[o]) result.damperBoundInstrumentIds.push(instruments[i].id);
    if (!Number.isNaN(shard.dealerInventory[o])) {
      result.newDealerInventoryById.set(instruments[i].id, shard.dealerInventory[o]);
    }
    if (shard.hasPrimary[o]) {
      result.primaryOutcomeById.set(instruments[i].id, {
        withdrawn: shard.primaryWithdrawn[o] === 1,
        marketTakeUSD: shard.primaryMarketTake[o],
        clearedStat: shard.clearedStat[o],
      });
    }
  }
  let f = 0;
  // Fill rows are already globally ordered within the shard.
  for (; f < shard.fillCount; f++) {
    const pi = shard.fillPart[f];
    const p = participants[pi];
    const filledUSD = shard.fillFilled[f];
    const tradedUSD = shard.fillTraded[f];
    const feeUSD = shard.fillFee[f];
    if (filledUSD > 1) result.newParticipantHoldings.get(p.id)!.set(instruments[shard.fillInst[f]].id, filledUSD);
    result.netCashDeltaByParticipantId.set(p.id, (result.netCashDeltaByParticipantId.get(p.id) ?? 0) - tradedUSD - feeUSD);
    result.totalDealerRevenueUSD += feeUSD;
  }
}

/**
 * The worker pool injects itself here (see clearing-worker-pool.ts). The engine deliberately
 * imports NOTHING at runtime: the worker thread loads this module alone, and tsx's resolver
 * inside workers cannot follow extensionless relative imports — the dependency points the other
 * way instead.
 */
export interface ShardedKernelApi {
  workerCount: () => number;
  sharedBuffer: (bytes: number) => SharedArrayBuffer | null;
  run: (packed: PackedClearing, sab: SharedArrayBuffer) => KernelShardResult[] | null;
}
let shardedKernel: ShardedKernelApi | null = null;
export function registerShardedKernel(api: ShardedKernelApi): void { shardedKernel = api; }

export function clearFinancialAsset(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  priorDealerInventoryById: Map<string, number>,
  params: ClearingParams
): ClearingResult {
  void priorDealerInventoryById;
  const result: ClearingResult = {
    newStatById: new Map(),
    newParticipantHoldings: new Map(),
    newDealerInventoryById: new Map(),
    totalDealerRevenueUSD: 0,
    netCashDeltaByParticipantId: new Map(),
    damperBoundInstrumentIds: [],
    primaryOutcomeById: new Map(),
  };
  participants.forEach((p) => {
    result.newParticipantHoldings.set(p.id, new Map<string, number>());
    result.netCashDeltaByParticipantId.set(p.id, 0);
  });

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
        for (const shard of shards) accumulateShard(shard as never, instruments, participants, result);
        return result;
      }
      // Pool refused (too small, or a worker failed): the packed views are ordinary arrays to
      // the kernel, so fall straight through to the serial path on the same packing.
      growKernelScratch(pCount);
      const shard = runClearingKernel(packed, 0, packed.n);
      accumulateShard(shard, instruments, participants, result);
      return result;
    }
  }

  const packed = packClearing(instruments, participants, params);
  growKernelScratch(packed.pCount);
  const shard = runClearingKernel(packed, 0, packed.n);
  accumulateShard(shard, instruments, participants, result);
  return result;
}
