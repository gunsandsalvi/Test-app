/**
 * WS9/XB2d — the FX market clears, because a currency somebody sells is a currency somebody buys.
 *
 * What this replaces: `evolveFxPair` moved every rate by a DRIFT — an interest differential, a
 * trade-imbalance term, an attractiveness comparison, and a noise term — and XB2c then added a
 * price-impact coefficient so the dealers' delta hedge could nudge it. None of that has a
 * counterparty. The desks sold currency into nothing: their position shrank, the price moved, and
 * the other side of the trade did not exist.
 *
 * It clears in the SAME engine every other asset class uses (financial-clearing-engine.ts): the
 * inelastic flow is the float that must find a buyer, the elastic accounts post real schedules —
 * a reservation level, a scale-in range, a position cap from their own capital, and a cash budget
 * — and the solve is the same bisection with saturation clearing and a dealer residual.
 *
 * The first version of this was a linear excess-demand solve with three invented slope
 * coefficients, clamped at a maximum weekly move. That clamp was the mistake the engine's own
 * comment already records: a bound is not a price.
 *
 * Here a rate is the price at which the week's real demands sum to zero. Some participants are
 * price-INELASTIC — a desk flattening inventory, an insurer settling a bond purchase, an exporter
 * repatriating receipts — they need the currency and take the price. The elastic side is what
 * makes a market: speculators who take the position precisely BECAUSE the price moved far enough
 * to pay them, and central banks leaning against a disorderly move. When the inelastic side is
 * one-way and the elastic side is thin, the rate moves a long way — which is what a currency
 * crisis IS, and it is now something this model can produce rather than assume.
 *
 * XB6 made every PAIR primary: each clears on its own book and its own flow, and triangular
 * consistency is an OUTCOME — held together by the bank desks' arbitrage capital, not by
 * construction. (This paragraph once said the USD was the numéraire and crosses were derived;
 * that construction is gone, and with it the built-in guarantee it provided.)
 */

/**
 * HF3 — the elastic side's schedule, from the speculator's own capital and the volatility it has
 * actually observed.
 *
 * What this replaces: three chosen numbers — a 1.2% required move, a 4% full-size range and a
 * 15% risk budget — which between them decided how much flow the FX market could absorb. None
 * of them was anything a fund did.
 *
 * All three are now readings:
 *   - **The move it needs** is one standard deviation of that pair's OWN observed weekly moves.
 *     Below its own noise there is nothing to trade; a quiet pair is tight and a volatile one is
 *     wide, which is what makes a market's depth its own property rather than a global constant.
 *   - **Full size** comes at two more sigma, the same mathematical scale the repo desk's haircuts
 *     use for the same reason — it is the move a lender, or a risk-taker, must actually assume.
 *   - **The size it will run** is the margin identity on its own capital at that pair's own
 *     haircut (2σ): `equity / haircut`. A speculator's position is limited by what its prime
 *     broker will finance (HF1), not by a share of assets nobody granted.
 */

/** The smallest weekly sigma a pair is assumed to have: with too little history to estimate one,
 *  the engine's own minimum repricing allowance stands in, exactly as the repo haircuts do. */
const MIN_FX_WEEKLY_SIGMA = 0.0025;

/** The move a speculator needs before there is anything to trade: the pair's own weekly noise. */
export function speculatorReservationMoveFrac(sigma: number): number { return sigma; }
/** And full size two sigma further out — the same scale a lender assumes for the same reason. */
export function speculatorFullSizeRangeFrac(sigma: number): number { return 2 * sigma; }
/** What its own capital supports at that pair's own haircut: the margin identity, again. */
export function speculatorMaxPositionLocal(fundEquityLocal: number, sigma: number): number {
  return Math.max(0, fundEquityLocal) / Math.max(MIN_FX_WEEKLY_SIGMA, 2 * sigma);
}

/** One standard deviation of a pair's own weekly moves, as a fraction of the level. */
export function fxWeeklySigma(historicalRates: number[] | undefined): number {
  const series = (historicalRates ?? []).filter((v) => Number.isFinite(v) && v > 0);
  const rets: number[] = [];
  for (let i = 1; i < series.length; i++) rets.push(series[i] / series[i - 1] - 1);
  if (rets.length < 2) return MIN_FX_WEEKLY_SIGMA;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  return Math.max(MIN_FX_WEEKLY_SIGMA, Math.sqrt(variance));
}

/**
 * A central bank counters DISORDERLY markets; it does not defend a level and it does not trade
 * inside the range where private capital still absorbs the flow. Major-currency central banks
 * intervene in spot FX rarely — the routine stress tool is the swap-line network (see §6; it
 * needs an FX funding market this model does not have yet) — and when they do step in it is
 * because the private elastic side is exhausted. So the reservation is DERIVED from exactly
 * that point: the move at which the speculators are fully deployed. Below it the central bank
 * has no bid at all; the 3.0 this replaces sat INSIDE the speculators' own scale-in range, which
 * made the central bank the market's first buyer every week rather than its last.
 */
export function centralBankReservationMoveFrac(sigma: number): number {
  return speculatorReservationMoveFrac(sigma) + speculatorFullSizeRangeFrac(sigma);
}
/** And it scales in over the same distance again: a bank that has started defending is committed
 *  across a move of the same size as the one that brought it in. */
export function centralBankFullSizeRangeFrac(sigma: number): number {
  return speculatorFullSizeRangeFrac(sigma);
}
/** Share of the reserve book one week's operation may commit — desk capacity, drawn as spent. */
export const CENTRAL_BANK_FX_INTERVENTION_SHARE = 0.10;


