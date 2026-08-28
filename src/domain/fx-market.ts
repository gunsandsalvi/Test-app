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
 * The numéraire is the USD, so what clears is each region's currency VALUE in USD and every pair
 * is derived from two of those. Four independently drifting pairs could violate triangular
 * arbitrage; three cleared values cannot.
 */

/**
 * A speculator's reservation: how far the currency must move from its recent level before taking
 * the other side is worth the risk. Below that deviation it wants none — the same shape every
 * other book in this model uses, and the reason a price settles rather than sliding on a slope.
 */
export const SPECULATOR_RESERVATION_MOVE_PCT = 1.2;

/** How much further past its reservation it takes to pull a speculator in at full size. */
export const SPECULATOR_FULL_SIZE_RANGE_PCT = 4.0;

/** Share of its book a hedge fund will risk in one currency — the CAP on its position, not a slope. */
export const SPECULATOR_FX_RISK_BUDGET = 0.15;

/**
 * A central bank smooths; it does not defend a level. So it wants none until the move is large,
 * and its size is bounded by real reserves.
 */
export const CENTRAL_BANK_RESERVATION_MOVE_PCT = 3.0;
export const CENTRAL_BANK_FULL_SIZE_RANGE_PCT = 5.0;
export const CENTRAL_BANK_FX_INTERVENTION_SHARE = 0.10;

/** The rate is a PRICE_LIKE statistic: demand falls as the currency gets dearer. */
export const FX_STAT_KIND = 'PRICE_LIKE' as const;

/**
 * The damper on a single week's move — discrete-time smoothing, exactly as the clearing engine
 * uses it elsewhere, and NOT a bound the price is allowed to rest on. When the elastic side
 * cannot absorb the flow the engine clears at the saturation point and the dealers carry the
 * residual; it does not park the rate on this limit and call it a price.
 */
export const MAX_WEEKLY_FX_MOVE_PCT = 8;
