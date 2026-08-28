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
function solveClearingStat(
  inst: ClearingInstrument,
  participants: ClearingParticipant[],
  bracketLow: number,
  bracketHigh: number
): number {
  const totalDemandAt = (stat: number) =>
    participants.reduce((sum, p) => {
      const d = p.demandByInstrumentId.get(inst.id);
      return sum + (d ? demandAtStat(d, stat, inst.statKind, p.currentHoldingsByInstrumentId.get(inst.id) ?? 0) : 0);
    }, 0);

  // Demand rises with the statistic for YIELD_LIKE and falls for PRICE_LIKE; orient the search so
  // that `lo` is always the low-demand end.
  const lo = inst.statKind === 'YIELD_LIKE' ? bracketLow : bracketHigh;
  const hi = inst.statKind === 'YIELD_LIKE' ? bracketHigh : bracketLow;

  // When the participants' combined capacity cannot absorb the whole float at ANY level, there
  // is no crossing — and the honest clearing level is NOT the search bound (a bound is not a
  // price; that mistake is recorded in the plan). It is the SATURATION point: the least
  // aggressive level at which every willing buyer has taken its full size. Beyond it, a wider
  // level attracts not one more dollar of demand, so no economic force pushes the price there.
  // The dealer carries the genuine residual, which is what a dealer of last resort is — and the
  // cost of that warehousing becoming real capital and funding is G3's item, not a reason to
  // fake a wider print today.
  const demandAtWideEnd = totalDemandAt(hi);
  const targetUSD = Math.min(inst.tradableFloatUSD, demandAtWideEnd * 0.999999);
  if (totalDemandAt(lo) > targetUSD) return lo; // oversubscribed even at the extreme

  let a = lo;
  let b = hi;
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (totalDemandAt(mid) < targetUSD) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

export function clearFinancialAsset(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  priorDealerInventoryById: Map<string, number>,
  params: ClearingParams
): ClearingResult {
  const newStatById = new Map<string, number>();
  const newDealerInventoryById = new Map<string, number>();
  const newParticipantHoldings = new Map<string, Map<string, number>>();
  const netCashDeltaByParticipantId = new Map<string, number>();
  const damperBoundInstrumentIds: string[] = [];
  const primaryOutcomeById = new Map<string, { withdrawn: boolean; marketTakeUSD: number; clearedStat: number }>();
  participants.forEach((p) => {
    newParticipantHoldings.set(p.id, new Map<string, number>());
    netCashDeltaByParticipantId.set(p.id, 0);
  });
  let totalDealerRevenueUSD = 0;

  instruments.forEach((inst) => {
    const offeringUSD = Math.max(0, inst.primaryOfferingUSD ?? 0);
    // A DEBUT issuer — an LBO financing, a first term loan, an IPO — has NO outstanding stock:
    // its entire book is the offering itself. Gating on the outstanding float alone dropped it
    // before the solve, so it never got a primary outcome, was never settled or pulled, and the
    // offering sat queued forever (measured: 767 offering-weeks of LBO financings, zero deals
    // done in 120 weeks). A market with something to sell is a market.
    if (!(inst.tradableFloatUSD + offeringUSD > 0)) {
      newStatById.set(inst.id, inst.currentStat);
      return;
    }

    // Wide, non-economic search bounds. See solveClearingStat: the participants' own reservation
    // levels decide where the market can actually clear, not these.
    // NUMERICAL guards only, never economics — wide enough that no real schedule reaches them.
    // The demand side always contains a bid at some level (the distressed regime's recovery
    // arithmetic guarantees it for credit), so the solve finds a real crossing inside the
    // bracket; a solve that returns a bracket edge is a bug in an adapter's schedules, not a
    // market outcome, and the earlier version of this file that dressed the upper bound in a
    // recovery-value story is recorded in the plan as a mistake not to repeat.
    const isYieldLike = inst.statKind === 'YIELD_LIKE';
    const bracketLow = isYieldLike ? -2000 : Math.max(1e-6, inst.currentStat * 0.01);
    const bracketHigh = isYieldLike ? 100000 : inst.currentStat * 100;

    let liveFloatUSD = inst.tradableFloatUSD + offeringUSD;
    let solvedStat = solveClearingStat({ ...inst, tradableFloatUSD: liveFloatUSD }, participants, bracketLow, bracketHigh);
    let offeringWithdrawn = false;
    if (offeringUSD > 0 && inst.primaryWithdrawStat !== undefined) {
      const beyondWalkAway = isYieldLike
        ? solvedStat > inst.primaryWithdrawStat
        : solvedStat < inst.primaryWithdrawStat;
      if (beyondWalkAway) {
        // The deal is pulled before pricing: the market never absorbs the new paper, and the
        // outstanding stock clears on its own.
        offeringWithdrawn = true;
        liveFloatUSD = inst.tradableFloatUSD;
        solvedStat = solveClearingStat(inst, participants, bracketLow, bracketHigh);
      }
    }

    // Discrete-time damping, not a price bound: see maxWeeklyStatMovePct.
    const maxMove = Math.abs(inst.currentStat) * params.maxWeeklyStatMovePct + (isYieldLike ? YIELD_LIKE_MIN_WEEKLY_MOVE_BPS : 0);
    const clearedStat = Number(
      Math.max(inst.currentStat - maxMove, Math.min(inst.currentStat + maxMove, solvedStat)).toFixed(4)
    );
    if (Math.abs(solvedStat - clearedStat) > Math.max(1e-6, Math.abs(solvedStat) * 1e-6)) {
      damperBoundInstrumentIds.push(inst.id);
    }
    newStatById.set(inst.id, isFinite(clearedStat) ? clearedStat : inst.currentStat);

    // Everyone holds what they wanted at the level that cleared; the dealer carries any residual.
    //
    // The printed level is the DAMPED one, so at that level demand and float need not be equal —
    // damping is a discrete-time device and the market still has to settle a real quantity
    // against it. When the schedules want more than exists, the fills are rationed pro rata:
    // the same allocation rule the goods auction uses (#49), and the only honest one, because
    // nobody can be handed a security that was never issued. Without this, a level held below
    // its solve by the damping let every participant book its full unclamped size and the books
    // together claimed multiples of the float — measured at 200% of shares outstanding in the
    // equity slice, which is where it finally became impossible to miss.
    // §6 cores-first refinement: a mandated core (`minHoldingUSD` — the liability-driven
    // sovereign core, WS6's pledged collateral) is a SIZE the holder cannot go below, and the
    // old uniform pro-rata ration scaled fills straight through it (measured: pledged
    // collateral printing ~1% above holdings at late-horizon scale). Cores are satisfied
    // first; only the discretionary layer above them is rationed. If the cores alone exceed
    // the float, the ledger cannot honor them all and they scale together — that case is a
    // float-accounting bug upstream, not a market outcome.
    const wantedByParticipant = new Map<string, number>();
    const coreByParticipant = new Map<string, number>();
    let wantedTotalUSD = 0;
    let coreTotalUSD = 0;
    participants.forEach((p) => {
      const d = p.demandByInstrumentId.get(inst.id);
      const previousUSD = p.currentHoldingsByInstrumentId.get(inst.id) ?? 0;
      const filledUSD = d ? demandAtStat(d, clearedStat, inst.statKind, previousUSD) : 0;
      const affordableUSD = d?.maxNetPurchaseUSD === undefined
        ? Infinity
        : previousUSD + Math.max(0, d.maxNetPurchaseUSD);
      const coreUSD = Math.min(d?.minHoldingUSD ?? 0, affordableUSD, filledUSD);
      wantedByParticipant.set(p.id, filledUSD);
      coreByParticipant.set(p.id, coreUSD);
      wantedTotalUSD += filledUSD;
      coreTotalUSD += coreUSD;
    });
    const coreScale = coreTotalUSD > liveFloatUSD ? liveFloatUSD / coreTotalUSD : 1;
    const discretionaryFloatUSD = Math.max(0, liveFloatUSD - coreTotalUSD * coreScale);
    const discretionaryWantedUSD = wantedTotalUSD - coreTotalUSD;
    const discretionaryScale = discretionaryWantedUSD > discretionaryFloatUSD
      ? discretionaryFloatUSD / Math.max(1e-9, discretionaryWantedUSD)
      : 1;

    let allocatedUSD = 0;
    participants.forEach((p) => {
      const previousUSD = p.currentHoldingsByInstrumentId.get(inst.id) ?? 0;
      const coreUSD = (coreByParticipant.get(p.id) ?? 0) * coreScale;
      const discretionaryUSD = Math.max(0, (wantedByParticipant.get(p.id) ?? 0) - (coreByParticipant.get(p.id) ?? 0));
      const filledUSD = coreUSD + discretionaryUSD * discretionaryScale;
      const tradedUSD = filledUSD - previousUSD;
      const feeUSD = Math.abs(tradedUSD) * (params.dealerSpreadBps / 10000);

      if (filledUSD > 1) newParticipantHoldings.get(p.id)!.set(inst.id, filledUSD);
      netCashDeltaByParticipantId.set(p.id, (netCashDeltaByParticipantId.get(p.id) ?? 0) - tradedUSD - feeUSD);
      totalDealerRevenueUSD += feeUSD;
      allocatedUSD += filledUSD;
    });

    newDealerInventoryById.set(inst.id, Number((liveFloatUSD - allocatedUSD).toFixed(0)));

    if (offeringUSD > 0) {
      // What the participants actually ADDED this week, attributed to the new paper first —
      // capped at the offering (a fungible book cannot say which dollar bought which vintage,
      // but the primary cannot place more than its own size).
      let priorTotalUSD = 0;
      participants.forEach((p) => { priorTotalUSD += p.currentHoldingsByInstrumentId.get(inst.id) ?? 0; });
      const marketTakeUSD = offeringWithdrawn
        ? 0
        : Math.max(0, Math.min(offeringUSD, allocatedUSD - priorTotalUSD));
      primaryOutcomeById.set(inst.id, {
        withdrawn: offeringWithdrawn,
        marketTakeUSD: Number(marketTakeUSD.toFixed(0)),
        clearedStat,
      });
    }
  });

  return {
    newStatById,
    newParticipantHoldings,
    newDealerInventoryById,
    totalDealerRevenueUSD,
    netCashDeltaByParticipantId,
    damperBoundInstrumentIds,
    primaryOutcomeById,
  };
}
