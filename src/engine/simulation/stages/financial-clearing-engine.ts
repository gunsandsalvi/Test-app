/**
 * Generalized Financial Asset Clearing Engine
 *
 * Wall Street foundational correction: every tradable financial asset's price must be the real
 * result of supply and demand — named participants compare their real holdings against their
 * real target allocation (tilted by how rich/cheap the asset currently looks versus their own
 * fundamental view), banks sit in the middle as the dealer absorbing the net of that real order
 * flow onto their own persistent inventory, and the resulting price move is converted into
 * whatever quoted statistic that asset class uses (OAS, discount margin, a sovereign yield, an
 * equity multiple) — the statistic is derived from the cleared price, never the other way round.
 *
 * This is asset-class-agnostic on purpose. Corporate bonds, sovereign bonds, leveraged loans, and
 * eventually equity all run through this exact same auction; only three things differ per asset
 * class, and they're supplied by the caller rather than hardcoded here:
 *   1. what counts as a "participant" and its real target allocation to this asset class,
 *   2. the rich/cheap tilt signal for each instrument (what "attractive to buy more of" means),
 *   3. the quoted statistic's direction of travel relative to price (a yield/spread-like stat
 *      falls when price rises; a price-like stat rises with it) and its real min/max bounds.
 * Adding a new asset class (or a new participant type, e.g. hedge funds, foreign flows) means
 * writing a small adapter that builds these inputs, not re-implementing the auction.
 */

export interface ClearingInstrument {
  id: string;
  // Total float/face value outstanding — the real denominator for both index weighting (how
  // much of the asset-class universe this instrument represents) and liquidity depth (how much
  // net flow it takes, relative to its own size, to move its price).
  outstandingUSD: number;
  // The instrument's current quoted statistic (oasSpreadBps, discountMarginBps, a sovereign
  // yield in bps, etc.) — read here only to compute this week's new value from real flow.
  currentStat: number;
  // Real information already normalized to [-1, 1] by the asset-specific caller: positive means
  // this instrument currently looks cheap/attractive relative to a fundamental view (draws extra
  // real buying interest); negative means rich (draws selling interest). Not computed here —
  // what "fair value" means is asset-class-specific.
  richCheapTiltSignal: number;
  // How sensitive the quoted statistic is to a price move (bond/loan duration in years; an
  // equivalent constant for other asset classes) — used to convert a price-impact percentage
  // into a change in the quoted statistic.
  durationYears: number;
  // Does the quoted statistic rise (+1) or fall (-1) when price rises on net buying? Yield and
  // spread statistics are -1 (price up -> yield/spread down); a price-like statistic is +1.
  statDirection: 1 | -1;
  minStat: number;
  maxStat: number;
}

export interface ClearingParticipant {
  id: string;
  // This participant's real total target allocation to the asset class as a whole (its own
  // assetAllocationTarget * its own totalAssetsUSD, or equivalent) — distributed across
  // instruments by tilted index weight below, not decided per-instrument by the caller.
  targetTotalUSD: number;
  currentHoldingsByInstrumentId: Map<string, number>;
}

export interface ClearingParams {
  // Share of a participant's real target-vs-actual gap that trades this week (real funds
  // rebalance gradually, not instantaneously).
  weeklyRebalanceRate: number;
  // Net weekly flow equal to this many multiples of an instrument's own outstanding value is
  // needed to move its price 100% — smaller means a shallower, more price-sensitive market.
  liquidityDepth: number;
  // The dealer's own standing inventory creates its own convergence pressure each week (real
  // market-making inventory-risk behavior: a dealer sitting long leans its quotes to sell it
  // back down, and vice versa).
  dealerInventoryPressureRate: number;
  // Bid/ask spread the dealer desk earns on the gross flow it facilitates.
  dealerSpreadBps: number;
  // Real participants' combined target claim on this asset class can never exceed this share of
  // what's actually outstanding — the same conservation constraint already enforced on region-
  // level ownership shares elsewhere (bank + institutional + foreign + central bank must leave a
  // real residual for household, never sum past ~1.0). Without it, a named participant's target
  // is computed independently of the real float actually available (e.g. an institutional
  // entity's total balance-sheet size, bootstrapped against regional GDP, has no guaranteed
  // relationship to the dollar amount of corporate debt actually outstanding) and can imply
  // wanting to own several times the entire market — which would otherwise show up as
  // permanent, saturating one-directional pressure instead of a real, bounded rebalancing flow.
  maxParticipantShareOfOutstanding: number;
}

export interface ClearingResult {
  newStatById: Map<string, number>;
  // participantId -> instrumentId -> new real holding in USD (only instruments with a
  // non-negligible resulting holding are present).
  newParticipantHoldings: Map<string, Map<string, number>>;
  newDealerInventoryById: Map<string, number>;
  totalDealerRevenueUSD: number;
}

/**
 * Runs one week's real clearing auction for a single asset class in a single region: every
 * participant trades a real fraction of its target-vs-actual gap (tilted toward instruments
 * that look cheap), the bank dealer desk absorbs the net of that flow onto its own persistent
 * inventory (also leaning its quotes against whatever it's already carrying), and each
 * instrument's quoted statistic is derived from the resulting real price move.
 */
export function clearFinancialAsset(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  priorDealerInventoryById: Map<string, number>,
  params: ClearingParams
): ClearingResult {
  const totalOutstandingUSD = instruments.reduce((s, i) => s + i.outstandingUSD, 0) || 1;

  // Real participants' combined target claim can't exceed a bounded share of what actually
  // exists (see maxParticipantShareOfOutstanding's doc comment) — rescale proportionally rather
  // than let an independently-bootstrapped balance-sheet size imply permanent, saturating
  // one-directional demand.
  const totalTargetUSD = participants.reduce((s, p) => s + p.targetTotalUSD, 0);
  const maxTotalTargetUSD = totalOutstandingUSD * params.maxParticipantShareOfOutstanding;
  const targetScale = totalTargetUSD > maxTotalTargetUSD && totalTargetUSD > 0 ? maxTotalTargetUSD / totalTargetUSD : 1;

  const tiltedWeightById = new Map<string, number>();
  let tiltedWeightSum = 0;
  instruments.forEach((inst) => {
    const baseWeight = inst.outstandingUSD / totalOutstandingUSD;
    const tilted = Math.max(0.0001, baseWeight * (1 + inst.richCheapTiltSignal));
    tiltedWeightById.set(inst.id, tilted);
    tiltedWeightSum += tilted;
  });

  const netDemandById = new Map<string, number>();
  instruments.forEach((inst) => netDemandById.set(inst.id, 0));

  const newParticipantHoldings = new Map<string, Map<string, number>>();
  participants.forEach((p) => {
    const holdings = new Map<string, number>();
    instruments.forEach((inst) => {
      const tiltedWeight = (tiltedWeightById.get(inst.id) ?? 0) / (tiltedWeightSum || 1);
      const targetUSD = p.targetTotalUSD * targetScale * tiltedWeight;
      const currentUSD = p.currentHoldingsByInstrumentId.get(inst.id) ?? 0;
      const fillUSD = (targetUSD - currentUSD) * params.weeklyRebalanceRate;
      netDemandById.set(inst.id, (netDemandById.get(inst.id) ?? 0) + fillUSD);

      const newHoldingUSD = Math.max(0, currentUSD + fillUSD);
      if (newHoldingUSD > 1) holdings.set(inst.id, newHoldingUSD);
    });
    newParticipantHoldings.set(p.id, holdings);
  });

  const newStatById = new Map<string, number>();
  const newDealerInventoryById = new Map<string, number>();
  let totalDealerRevenueUSD = 0;

  instruments.forEach((inst) => {
    const clientNetDemandUSD = netDemandById.get(inst.id) ?? 0;
    const oldInventoryUSD = priorDealerInventoryById.get(inst.id) ?? 0;

    const totalNetBuyPressureUSD = clientNetDemandUSD - oldInventoryUSD * params.dealerInventoryPressureRate;
    const priceImpactPct = totalNetBuyPressureUSD / (inst.outstandingUSD * params.liquidityDepth);
    const statDeltaMagnitude = (priceImpactPct / Math.max(0.1, inst.durationYears)) * 10000;
    const rawNewStat = inst.currentStat + inst.statDirection * statDeltaMagnitude;
    newStatById.set(
      inst.id,
      isFinite(rawNewStat) ? Number(Math.max(inst.minStat, Math.min(inst.maxStat, rawNewStat)).toFixed(2)) : inst.currentStat
    );

    const newInventoryUSD = oldInventoryUSD - clientNetDemandUSD;
    newDealerInventoryById.set(inst.id, Number(newInventoryUSD.toFixed(0)));

    totalDealerRevenueUSD += Math.abs(clientNetDemandUSD) * (params.dealerSpreadBps / 10000);
  });

  return { newStatById, newParticipantHoldings, newDealerInventoryById, totalDealerRevenueUSD };
}
