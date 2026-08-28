/**
 * WS9/XB2d — the FX market clears, because a currency somebody sells is a currency somebody buys.
 *
 * What this replaces: `evolveFxPair` moved every rate by a DRIFT — an interest differential, a
 * trade-imbalance term, an attractiveness comparison, and a noise term — and XB2c then added a
 * price-impact coefficient so the dealers' delta hedge could nudge it. None of that has a
 * counterparty. The desks sold currency into nothing: their position shrank, the price moved, and
 * the other side of the trade did not exist.
 *
 * Here a rate is the price at which the week's real demands sum to zero. Some participants are
 * price-INELASTIC — a desk flattening inventory, an insurer settling a bond purchase, an exporter
 * repatriating receipts — they need the currency and take the price. The elastic side is what
 * makes a market: speculators who take the position precisely BECAUSE the price moved far enough
 * to pay them, and central banks leaning against a disorderly move. When the inelastic side is
 * one-way and the elastic side is thin, the rate moves a long way — which is what a currency
 * crisis IS, and it is now something this model can produce rather than assume.
 *
 * The numéraire is the USD, so what clears is each region's currency VALUE in USD and every pair
 * is derived from two of those. Four independently drifting pairs could violate triangular
 * arbitrage; three cleared values cannot.
 */

/** One participant's willingness to buy or sell a currency this week. */
export interface FxDemandSchedule {
  participantId: string;
  /** Net USD-equivalent it wants to BUY at today's rate. Negative = wants to sell. */
  netDemandAtCurrentUSD: number;
  /**
   * How that demand changes per 1% APPRECIATION of the currency. Negative slopes downward — a
   * dearer currency is bought less — and it is the elastic participants' slopes that let the
   * market clear at all. An inelastic participant posts 0 and takes whatever price results.
   */
  slopeUSDPerPct: number;
}

/**
 * The move that clears the week: the appreciation at which every schedule sums to zero.
 *
 * `residualUSD` is what is left unmatched when the move is clamped — a market that could not
 * clear inside its limit, which the dealers carry as inventory. A large persistent residual is
 * the honest signal that the elastic side is too thin, not something to smooth away.
 */
export function clearCurrencyMovePct(
  schedules: FxDemandSchedule[],
  maxMovePct: number
): { movePct: number; residualUSD: number; grossDemandUSD: number } {
  const netUSD = schedules.reduce((a, s) => a + s.netDemandAtCurrentUSD, 0);
  const grossDemandUSD = schedules.reduce((a, s) => a + Math.abs(s.netDemandAtCurrentUSD), 0);
  const slope = schedules.reduce((a, s) => a + s.slopeUSDPerPct, 0);
  if (!(Math.abs(slope) > 0)) {
    // Nobody is price-sensitive: the price cannot clear anything and the dealers carry it all.
    return { movePct: 0, residualUSD: netUSD, grossDemandUSD };
  }
  // Excess demand is absorbed by appreciation: solve net + slope x move = 0.
  const raw = -netUSD / slope;
  const movePct = Math.max(-maxMovePct, Math.min(maxMovePct, raw));
  const residualUSD = netUSD + slope * movePct;
  return { movePct, residualUSD, grossDemandUSD };
}

/** Largest single-week move the market will price. Beyond this the residual goes to inventory. */
export const FX_MAX_WEEKLY_MOVE_PCT = 8;

/**
 * How hard a speculator leans against a move, per dollar of its risk capital, per 1% of
 * deviation. This is the SLOPE of the elastic side — the reason a rate settles somewhere rather
 * than running. Small per dollar; what makes it matter is how much capital is willing to play.
 */
export const SPECULATOR_SLOPE_PER_CAPITAL = 0.25;

/** Share of its book a hedge fund will put at risk in one currency. */
export const SPECULATOR_FX_RISK_BUDGET = 0.15;

/**
 * How hard a central bank leans against a disorderly move, per 1%. Reserve managers smooth; they
 * do not defend a level. Bounded by real reserves in the stage that builds the schedule.
 */
export const CENTRAL_BANK_FX_SLOPE_PER_RESERVE = 0.08;
