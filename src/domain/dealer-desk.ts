/**
 * G3 — one dealer system: a market-making desk that a named bank OWNS.
 *
 * What this replaces. Every cleared book had a "dealer" that was three things at once and none
 * of them a business: a residual (`tradableFloat - allocated`) computed by the engine, an array
 * written onto `reg.bankingSector` and copied verbatim onto all four banks' sheets by 02b, and a
 * P&L split by `bankMarketShare`. No bank decided to carry the position, no bank's capital
 * constrained it, and — once the cleared books settled through a clearing house (SETL6) — its
 * cash counterparty was the boundary, because a desk with no owner has no reserves to pay with.
 * Two rules at once: rule 4 (one real thing with two representations) and rule 2 (ownership is
 * an outcome, not an assignment).
 *
 * What it is instead. A desk is an ORDINARY PARTICIPANT in its book's auction, one per named
 * bank, with a schedule that is what a market maker actually does:
 *
 *   - **It quotes two ways around where the market already is.** Its reservation level is set so
 *     that at THIS week's printed level it wants exactly the inventory it already carries. It
 *     buys as the level moves in its favour and sells as it moves away — inventory-driven price
 *     discovery, not a view.
 *   - **It scales in over its own quoted spread.** The bid/ask the desk charges the book is the
 *     same number that says how far the level must travel for the desk to go from flat to full:
 *     a desk absorbs the week's order imbalance around its quote, and only when the imbalance
 *     exhausts its capacity does the level have to move to find real holders.
 *   - **Its size is its own capital.** Cash inventory consumes leverage capacity one-for-one
 *     (unlike the FX desk's PFE add-on), so capacity is a share of the bank's own leverage
 *     headroom, less what the bank's desks already carry across every book. A desk that is full
 *     stops absorbing, and the level gaps — which is what a supply curve IS.
 *
 * Because the desk is a participant, the engine already gives it everything: prior holdings, a
 * cash leg in `netCashDeltaByParticipantId`, and fills that ARE its new inventory. The adapters
 * route its participant id to `BANK_SECURITIES`, so the position is funded out of the owning
 * bank's reserves and the `<book> dealer inventory` boundary line shrinks to whatever the desks
 * did not take.
 */

/**
 * The share of the balance sheet its OWN EQUITY supports that a bank commits to dealer
 * inventory, across every cash desk it runs.
 *
 * Rule 19: a stated PREFERENCE primitive, and the only one this project adds — the bank's own
 * business-mix choice between renting balance sheet to market-making and lending it. Note the
 * base: it is a share of the whole sheet the equity supports, not of the UNUSED headroom. A
 * share of headroom would let the desk take a quarter of what is left every week forever, each
 * week's take shrinking the base for the next, converging on the entire balance sheet — a
 * commitment has to be measured against the whole sheet or it is not a commitment.
 */
import type { ItemizedHolding } from './banking';
import type { InstrumentId, Ticker } from './ids';
import { asTicker } from './ids';

const DEALER_DESK_SHARE_OF_BALANCE_SHEET = 0.25;

/**
 * §3.26-e-i/ii: what is left of this table is the FX conversion pip (`fx-funding.ts`,
 * `05-unit-bidding.ts`) and the ETF basket's assembly cost (`etf-flows.ts`) — §3 step 26-e-iii
 * deletes it. It was the fee every book charged on the mid (gone, 26-e-i) and the width of every
 * desk's schedule (`deskScheduleWidth` below, 26-e-ii).
 */
export const DESK_SPREAD_BPS_BY_BOOK: Record<string, number> = {
  'sovereign bond': 5,
  bill: 2,               // the tightest market there is
  'commercial paper': 5, // short, high-grade, but a credit — wider than a bill, tighter than a bond
  'corporate bond': 15,
  'leveraged loan': 20,  // loan secondary markets trade wider than investment grade
  equity: 8,
  commodity: 15,
  derivatives: 20,
  // §7.282: spot FX for corporate flow — majors trade tighter than any bond but a client
  // conversion still pays a pip; 2bps sits with the bill book, which is the right company.
  fx: 2,
};

/** One name a desk is long (or short, when negative) in one book. */
export interface DealerDeskPosition {
  /**
   * §3.13-BOOK slice (a): the paper the desk holds, in the INSTRUMENT id space — the same key the
   * register and the price table use. It is a brand because `clearingKeyOf` used to roll these up
   * to the ISSUER and hand the result back as if it were still an instrument key, which made every
   * desk read flat at the start of every session (§9.13-CREDIT row 4). The compiler now refuses
   * that substitution.
   */
  instrumentId: InstrumentId;
  /** Marked to this week's cleared level. A trading book is carried at market, not at cost. */
  inventoryLocal: number;
  /**
   * THE POSITION ITSELF, in the instrument's own unit — shares for equity, FACE for credit and
   * sovereigns. `inventoryLocal` is this times the current price, and the difference week to week
   * is real trading P&L; without it the mark showed up as a phantom fee and the per-bank identity
   * drifted by it.
   *
   * §9.13-CREDIT row 5: it is written for EVERY book now, not only the share books this comment
   * used to name — the credit books have printed prices other than par since row 1, so a desk's
   * money and its paper are two numbers there too, and everything that compares a desk position
   * to a LADDER (`O1`, `O6`, the coupon split, the principal paydown) reads this one.
   */
  units?: number;
}

/** §3.13-BOOK d3d: the register kind each desk book carries — the wire's asset kind, and the
 *  row's type on the bank's securities book. A desk's inventory is no longer a field on the
 *  sheet (`engine/desk-register.ts` reads the rows); a BOOK is a market name, a KIND is what the
 *  register stores, and the two sovereign books share one kind. */
export const DESK_BOOK_KIND: Record<string, ItemizedHolding['instrumentType']> = {
  'corporate bond': 'CORP_BOND', 'sovereign bond': 'GOV_BOND', bill: 'GOV_BOND',
  'leveraged loan': 'LEVERAGED_LOAN', equity: 'EQUITY', 'commercial paper': 'COMMERCIAL_PAPER',
};

const DESK_SUFFIX = '::DESK';

/** The clearing-participant id of a bank's desk — distinct from the bank's own investment book,
 *  which participates under the plain ticker (07c) and is a genuinely different business. */
export function dealerDeskParticipantId(ticker: Ticker): string {
  return `${ticker}${DESK_SUFFIX}`;
}

/** The owning bank's ticker, or undefined if this participant is not a desk. */
export function dealerDeskTicker(participantId: string): Ticker | undefined {
  return participantId.endsWith(DESK_SUFFIX)
    ? asTicker(participantId.slice(0, -DESK_SUFFIX.length))
    : undefined;
}

/**
 * What this desk can still take on, given its bank's own equity and what the bank's desks
 * already carry. Zero when the bank is full — and a full desk is why a level has to move to
 * clear, which no residual-with-no-owner could express.
 *
 * Two real bounds, both read off the bank's own sheet. The COMMITMENT: a share of the balance
 * sheet its equity supports, less what its other desks already hold. The HEADROOM: what the
 * leverage floor still allows at all, whatever the commitment says. The book being cleared right
 * now is netted out of both — this week's schedule replaces that position rather than adding to
 * it, so charging the desk for paper it is about to sell would shrink its capacity by its own
 * starting inventory.
 */
export function dealerDeskCapacityLocal(args: {
  balanceSheetCapacityLocal: number;
  leverageHeadroomLocal: number;
  /** §3.13-BOOK d3d: what the bank's desks carry across every book, gross (a short is a
   *  position too, and it consumes the same balance sheet) — `deskGrossLocal` off the register. */
  grossLocal: number;
  /** The part of that gross in the book being cleared now, netted out of both bounds. */
  thisBookGrossLocal: number;
}): number {
  const committedLocal = Math.max(0, args.balanceSheetCapacityLocal) * DEALER_DESK_SHARE_OF_BALANCE_SHEET;
  const thisBookLocal = Math.max(0, args.thisBookGrossLocal);
  const otherBooksLocal = Math.max(0, args.grossLocal - thisBookLocal);
  return Math.max(0, Math.min(
    committedLocal - otherBooksLocal,
    Math.max(0, args.leverageHeadroomLocal) + thisBookLocal
  ));
}

/**
 * §3.26-e-ii — THE WIDTH OF A DESK'S SCHEDULE IS WHAT CARRYING THE POSITION COSTS IT.
 *
 * A desk's schedule runs from its neutral level to full capacity over a width, and that width is
 * the compensation it needs per unit of inventory it takes on until it re-quotes a week later:
 * what financing the position costs it for that week — the region's own cleared repo rate — plus
 * the risk it bears over that week, the instrument's own measured weekly move at this bank's own
 * risk aversion (`domain/preferences.ts`). No stated width: a name that moved 3% last week is
 * quoted three times wider than one that moved 1%, a risk-averse board quotes wider than a bold
 * one, and a market that has not printed twice is quoted on its financing alone. That is what
 * replaced nine literal real-market widths (dealer-desks C3, C5; the-clearing-engine E3).
 *
 * Returned in the book's own statistic: a price distance for a PRICE_LIKE book, a yield or spread
 * distance in bps for a YIELD_LIKE one (the value cost per unit of duration).
 */
export function deskScheduleWidth(args: {
  statKind: 'PRICE_LIKE' | 'YIELD_LIKE';
  currentStat: number;
  durationYears: number;
  repoRateAnnual: number;
  /** The instrument's last measured one-week move, as a fraction of its level; undefined before it has printed twice. */
  measuredWeeklyMove: number | undefined;
  riskAversion: number;
}): number {
  const financingShare = Math.max(0, args.repoRateAnnual) / 52;
  const riskShare = Math.max(0, args.measuredWeeklyMove ?? 0) * Math.max(0, args.riskAversion);
  const costShare = financingShare + riskShare;
  if (args.statKind === 'PRICE_LIKE') return Math.max(1e-9, Math.abs(args.currentStat) * costShare);
  const durationYears = Math.max(1 / 52, args.durationYears);
  return Math.max(1e-9, (costShare / durationYears) * 10000);
}
