/**
 * Generalized Financial Asset Clearing Engine
 *
 * Wall Street foundational correction: every tradable financial asset's price must be the real
 * result of supply and demand — named participants compare their real holdings against a real,
 * bottom-up target, tilt across instruments by their own multi-factor view of what's attractive
 * to buy more of right now, banks sit in the middle as the dealer absorbing the net of that real
 * order flow onto their own persistent inventory, and the resulting price move is converted into
 * whatever quoted statistic that asset class uses (OAS, discount margin, a sovereign yield, an
 * equity multiple) — the statistic is derived from the cleared price, never the other way round.
 *
 * Two things this engine deliberately does NOT do, both per explicit correction:
 *   - It does not clamp or rescale a participant's target to fit the market. A participant's
 *     targetTotalUSD must already be a real, bottom-up, structurally-bounded number by the time
 *     it reaches here (see each adapter's own derivation) — if it isn't, that's a bug in the
 *     adapter's target derivation to fix at the source, not something for this engine to paper
 *     over with a cap.
 *   - It does not use one shared "rich/cheap" signal applied identically to every participant.
 *     Real institutions don't share one view of what's attractive — each participant supplies
 *     its own per-instrument attractiveness (see ClearingParticipant.attractivenessByInstrumentId),
 *     built from whatever mix of value, momentum, credit/rating trajectory, and duration/maturity
 *     fit is real for that participant type. A target allocation is a long-term policy guide for
 *     how much total capital sits in this asset class; which specific instruments that capital
 *     actually buys is a tactical decision driven by those characteristics, not the target itself.
 *
 * This is asset-class-agnostic on purpose. Corporate bonds, sovereign bonds, leveraged loans, and
 * eventually equity all run through this exact same auction; only two things differ per asset
 * class, and they're supplied by the caller rather than hardcoded here:
 *   1. what counts as a "participant", its real bottom-up target, and its own attractiveness view
 *      of each instrument,
 *   2. the quoted statistic's kind (yield/spread-like, converted via duration; or price-like,
 *      moving directly with the price-impact percentage) and its direction of travel relative
 *      to price — plus any genuinely mathematical bound (there is no realism floor or ceiling).
 * Adding a new asset class (or a new participant type, e.g. hedge funds, foreign flows) means
 * writing a small adapter that builds these inputs, not re-implementing the auction.
 */

export interface ClearingInstrument {
  id: string;
  // Total float/face value outstanding — the real denominator for both index weighting (how
  // much of the asset-class universe this instrument represents) and liquidity depth (how much
  // net flow it takes, relative to its own size, to move its price).
  outstandingUSD: number;
  // The instrument's current quoted statistic — oasSpreadBps, discountMarginBps, a sovereign
  // yield in bps (YIELD_LIKE), or the price itself, e.g. stockPrice (PRICE_LIKE) — read here
  // only to compute this week's new value from real flow.
  currentStat: number;
  // YIELD_LIKE statistics (a spread or yield in bps) move via duration math: a price-impact
  // percentage converts into a bps change in the statistic, and it moves opposite price (net
  // buying -> price up -> yield/spread down). PRICE_LIKE statistics (the traded price itself,
  // e.g. equity) just move by the price-impact percentage directly, no duration involved — the
  // statistic *is* the price, there's nothing to invert.
  statKind: 'YIELD_LIKE' | 'PRICE_LIKE';
  // How sensitive the quoted statistic is to a price move (bond/loan duration in years) — only
  // meaningful for YIELD_LIKE statistics; ignored for PRICE_LIKE ones.
  durationYears: number;
  // Does the quoted statistic rise (+1) or fall (-1) when price rises on net buying? Yield and
  // spread statistics are -1 (price up -> yield/spread down); a price-like statistic is +1.
  statDirection: 1 | -1;
  // Bounds on the resulting statistic. Real markets don't impose an artificial floor or ceiling
  // on a spread or a price beyond basic mathematical sanity (finiteness) — the actual minimum or
  // maximum is whatever real supply and demand clears to. Omit for no bound; only pass a real,
  // mathematically-necessary limit (e.g. a price can't go negative).
  minStat?: number;
  maxStat?: number;
}

export interface ClearingParticipant {
  id: string;
  // This participant's real, bottom-up total target allocation to the asset class as a whole —
  // a slow-moving policy anchor (see this asset class's adapter for how it's derived and why it
  // must already be structurally consistent with the real market size, not an independent
  // number this engine then has to cap). Distributed across instruments by this participant's
  // own tilted index weight below.
  targetTotalUSD: number;
  currentHoldingsByInstrumentId: Map<string, number>;
  // This participant's own real, multi-factor view of each instrument, normalized to [-1, 1]:
  // positive means this participant currently finds this instrument attractive to hold more of
  // (cheap versus its own fair-value view, constructive momentum, favorable rating trajectory
  // for its own mandate, a good duration/maturity fit for its own liabilities or benchmark);
  // negative means the opposite. Not computed here — this is real information specific to both
  // the participant and the instrument, supplied by the asset-specific adapter.
  attractivenessByInstrumentId: Map<string, number>;
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
}

export interface ClearingResult {
  newStatById: Map<string, number>;
  // participantId -> instrumentId -> new real holding in USD (only instruments with a
  // non-negligible resulting holding are present).
  newParticipantHoldings: Map<string, Map<string, number>>;
  newDealerInventoryById: Map<string, number>;
  totalDealerRevenueUSD: number;
  // participantId -> the real cash this participant's trading moved this week: positive when it
  // sold more than it bought, negative when it bought, always net of the bid/ask it paid the
  // dealer. Securities do not change hands for free — every fill has a cash leg, and without it
  // a participant's holdings grow while its balance sheet stays put, which is only a market on
  // one side of the ledger. Adapters are responsible for applying this to whatever each
  // participant type actually holds cash in.
  netCashDeltaByParticipantId: Map<string, number>;
}

/**
 * Runs one week's real clearing auction for a single asset class in a single region: every
 * participant trades a real fraction of its own target-vs-actual gap (tilted, per instrument, by
 * its own real attractiveness view), the bank dealer desk absorbs the net of that flow onto its
 * own persistent inventory (also leaning its quotes against whatever it's already carrying), and
 * each instrument's quoted statistic is derived from the resulting real price move.
 */
export function clearFinancialAsset(
  instruments: ClearingInstrument[],
  participants: ClearingParticipant[],
  priorDealerInventoryById: Map<string, number>,
  params: ClearingParams
): ClearingResult {
  const totalOutstandingUSD = instruments.reduce((s, i) => s + i.outstandingUSD, 0) || 1;

  const netDemandById = new Map<string, number>();
  instruments.forEach((inst) => netDemandById.set(inst.id, 0));

  const newParticipantHoldings = new Map<string, Map<string, number>>();
  const netCashDeltaByParticipantId = new Map<string, number>();
  let totalClientFeesUSD = 0;
  participants.forEach((p) => {
    // Each participant tilts its OWN index-style weighting across instruments by its OWN
    // attractiveness view, normalized within its own book — not a single shared ranking every
    // participant is forced to agree with.
    const tiltedWeightById = new Map<string, number>();
    let tiltedWeightSum = 0;
    instruments.forEach((inst) => {
      const baseWeight = inst.outstandingUSD / totalOutstandingUSD;
      const attractiveness = p.attractivenessByInstrumentId.get(inst.id) ?? 0;
      const tilted = Math.max(0.0001, baseWeight * (1 + attractiveness));
      tiltedWeightById.set(inst.id, tilted);
      tiltedWeightSum += tilted;
    });

    const holdings = new Map<string, number>();
    let participantCashDeltaUSD = 0;
    instruments.forEach((inst) => {
      const tiltedWeight = (tiltedWeightById.get(inst.id) ?? 0) / (tiltedWeightSum || 1);
      const targetUSD = p.targetTotalUSD * tiltedWeight;
      const currentUSD = p.currentHoldingsByInstrumentId.get(inst.id) ?? 0;
      const fillUSD = (targetUSD - currentUSD) * params.weeklyRebalanceRate;
      netDemandById.set(inst.id, (netDemandById.get(inst.id) ?? 0) + fillUSD);

      // The cash leg of this fill: buying costs cash, selling raises it, and either way the
      // dealer takes its bid/ask off the top of the participant's own GROSS trade.
      const feeUSD = Math.abs(fillUSD) * (params.dealerSpreadBps / 10000);
      participantCashDeltaUSD -= fillUSD + feeUSD;
      totalClientFeesUSD += feeUSD;

      const newHoldingUSD = Math.max(0, currentUSD + fillUSD);
      if (newHoldingUSD > 1) holdings.set(inst.id, newHoldingUSD);
    });
    newParticipantHoldings.set(p.id, holdings);
    netCashDeltaByParticipantId.set(p.id, participantCashDeltaUSD);
  });

  const newStatById = new Map<string, number>();
  const newDealerInventoryById = new Map<string, number>();
  let totalDealerRevenueUSD = 0;

  instruments.forEach((inst) => {
    const clientNetDemandUSD = netDemandById.get(inst.id) ?? 0;
    const oldInventoryUSD = priorDealerInventoryById.get(inst.id) ?? 0;

    const totalNetBuyPressureUSD = clientNetDemandUSD - oldInventoryUSD * params.dealerInventoryPressureRate;
    const priceImpactPct = totalNetBuyPressureUSD / (inst.outstandingUSD * params.liquidityDepth);
    const rawNewStat = inst.statKind === 'PRICE_LIKE'
      ? inst.currentStat * (1 + inst.statDirection * priceImpactPct)
      : inst.currentStat + inst.statDirection * (priceImpactPct / Math.max(0.1, inst.durationYears)) * 10000;
    const minStat = inst.minStat ?? -Infinity;
    const maxStat = inst.maxStat ?? Infinity;
    newStatById.set(
      inst.id,
      isFinite(rawNewStat) ? Number(Math.max(minStat, Math.min(maxStat, rawNewStat)).toFixed(4)) : inst.currentStat
    );

    const newInventoryUSD = oldInventoryUSD - clientNetDemandUSD;
    newDealerInventoryById.set(inst.id, Number(newInventoryUSD.toFixed(0)));
  });

  // The desk earns the spread on every client trade it facilitates, which is the sum of what the
  // clients actually paid above — not the spread on their NET, which is what this used to charge.
  // Netting a buyer against a seller is the dealer's whole business; it does not mean the desk
  // waived its bid/ask on both sides. Taking the two figures from the same place also means the
  // money clients pay and the money the desk receives are the same money.
  totalDealerRevenueUSD = totalClientFeesUSD;

  return { newStatById, newParticipantHoldings, newDealerInventoryById, totalDealerRevenueUSD, netCashDeltaByParticipantId };
}
