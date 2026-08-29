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
 * The elastic side's schedule: how far the currency must move before taking the other side is
 * worth the risk, how much further to pull it in at full size, and how much of its book it will
 * risk in one currency.
 *
 * RULE 13, OPEN: all three are chosen numbers, and between them they decide how much flow the FX
 * market can absorb — which is exactly what the damper above is pinning on. A speculator's
 * reservation should come from its own capital, its own view and the volatility it has actually
 * observed, the way every other participant in this model posts a schedule from its own book.
 * Owner: HF, which gives funds real strategies, then XB6.
 */
export const SPECULATOR_RESERVATION_MOVE_PCT = 1.2;
export const SPECULATOR_FULL_SIZE_RANGE_PCT = 4.0;
export const SPECULATOR_FX_RISK_BUDGET = 0.15;

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
export const CENTRAL_BANK_RESERVATION_MOVE_PCT =
  SPECULATOR_RESERVATION_MOVE_PCT + SPECULATOR_FULL_SIZE_RANGE_PCT;
export const CENTRAL_BANK_FULL_SIZE_RANGE_PCT = 5.0;
/** Share of the reserve book one week's operation may commit — desk capacity, drawn as spent. */
export const CENTRAL_BANK_FX_INTERVENTION_SHARE = 0.10;


/** The rate is a PRICE_LIKE statistic: demand falls as the currency gets dearer. */
export const FX_STAT_KIND = 'PRICE_LIKE' as const;

/**
 * The damper on a single week's move — intended as discrete-time smoothing, not a bound.
 *
 * IT IS NOT BEHAVING AS ONE, AND HAS BEEN MEASURED. Over 40 weeks the FX instrument printed
 * damper-bound in 38-39 of them per pair, with a minimum weekly move of -8.01% — this constant to
 * the second decimal, in the same direction week after week. The rate being published is the
 * damper, not a clearing level: "a bound is not a price" for the third time (§7.21, §7.75).
 * Re-measured after the FX mechanism sweep: still 9-28 pinned weeks per pair over 60. The cause
 * is that the inelastic float is systematically one-way and the elastic side below cannot absorb
 * it. Owner XB6. Do NOT widen this number — find the oversized flow.
 */
export const MAX_WEEKLY_FX_MOVE_PCT = 8;
