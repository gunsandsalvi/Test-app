/**
 * G3 — one dealer system: a market-making desk that a named bank OWNS.
 *
 * What this replaces. Every cleared book had a "dealer" that was three things at once and none
 * of them a business: a residual (`tradableFloat - allocated`) computed by the engine, an array
 * written onto `reg.bankingSector` and copied verbatim onto all four banks' sheets by 02b, and a
 * P&L split by `bankMarketShare`. No bank decided to carry the position, no bank's capital
 * constrained it, and — once the cleared books settled through a clearing house (SETL6) — its
 * cash counterparty was the boundary, because a desk with no owner has no reserves to pay with.
 * Two rules at once: rule 3 (one real thing with two representations) and rule 13 (ownership is
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
 *     stops absorbing, and the level gaps — which is what a supply curve IS, and the mechanism
 *     §6's damper defect says is missing.
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
export const DEALER_DESK_SHARE_OF_BALANCE_SHEET = 0.25;

/** One name a desk is long (or short, when negative) in one book. */
export interface DealerDeskPosition {
  instrumentId: string;
  inventoryUSD: number;
}

/** A bank's market-making inventory, by book ('corporate bond', 'sovereign bond', ...). */
export type DealerDeskInventory = Record<string, DealerDeskPosition[]>;

const DESK_SUFFIX = '::DESK';

/** The clearing-participant id of a bank's desk — distinct from the bank's own investment book,
 *  which participates under the plain ticker (07c) and is a genuinely different business. */
export function dealerDeskParticipantId(ticker: string): string {
  return `${ticker}${DESK_SUFFIX}`;
}

/** The owning bank's ticker, or undefined if this participant is not a desk. */
export function dealerDeskTicker(participantId: string): string | undefined {
  return participantId.endsWith(DESK_SUFFIX)
    ? participantId.slice(0, -DESK_SUFFIX.length)
    : undefined;
}

/** Gross inventory a bank's desks carry across every book — what its capital is already renting
 *  out. Gross, not net: a short is a position too, and it consumes the same balance sheet. */
export function dealerDeskGrossUSD(inventory: DealerDeskInventory | undefined, exceptBook?: string): number {
  if (!inventory) return 0;
  let grossUSD = 0;
  Object.entries(inventory).forEach(([book, positions]) => {
    if (book === exceptBook) return;
    positions.forEach((p) => { grossUSD += Math.abs(p.inventoryUSD); });
  });
  return grossUSD;
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
export function dealerDeskCapacityUSD(args: {
  balanceSheetCapacityUSD: number;
  leverageHeadroomUSD: number;
  inventory: DealerDeskInventory | undefined;
  book: string;
}): number {
  const committedUSD = Math.max(0, args.balanceSheetCapacityUSD) * DEALER_DESK_SHARE_OF_BALANCE_SHEET;
  const otherBooksUSD = dealerDeskGrossUSD(args.inventory, args.book);
  const thisBookUSD = Math.max(0, dealerDeskGrossUSD(args.inventory) - otherBooksUSD);
  return Math.max(0, Math.min(
    committedUSD - otherBooksUSD,
    Math.max(0, args.leverageHeadroomUSD) + thisBookUSD
  ));
}

/** The regional view a UI (and the pre-G3 readers) still want: every desk's position in one
 *  book, summed by name. Derived — no one writes it, and nothing may decide off it. */
export function regionalDeskView(
  inventories: (DealerDeskInventory | undefined)[],
  book: string
): Map<string, number> {
  const byInstrument = new Map<string, number>();
  inventories.forEach((inv) => {
    (inv?.[book] ?? []).forEach((p) => {
      byInstrument.set(p.instrumentId, (byInstrument.get(p.instrumentId) ?? 0) + p.inventoryUSD);
    });
  });
  return byInstrument;
}
