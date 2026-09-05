/**
 * §3.24-i — THE MATCHES CLEAR ON THE WAGE.
 *
 * A week of search in one occupation of one region produces a number of matches (the matching
 * function, `region-macro.ts:MATCHING_EFFICIENCY`): meetings between a seeker and an open
 * position. They are scarce — fewer than the positions posted, almost always — and what
 * rations them is the wage. An employer posts its openings at the wage it offers, relative to
 * the occupation's going rate (`Company.offeredWageIndex`); the matches go to the highest bids
 * first, an equal bid shares pro rata, and the bid that took the last match is the price the
 * market printed. A bid below the seekers' reservation takes nothing — nobody accepts it
 * (§3.24-ii gives the seekers one; until then it is zero).
 *
 * What this replaced: one fill ratio per occupation, `min(1, hires / vacancies)`, applied
 * identically to every employer — so an offer 40% over the going rate filled the same share of
 * its postings as one 40% under, and the wage moved AFTER the allocation off the share it could
 * not fill. `labour.md` D1.
 */

export interface LabourBid {
  /** The employer's key: a firm's ticker, or a segment's bid key. */
  key: string;
  /** Positions posted in this occupation this week, in heads. */
  units: number;
  /** The wage it offers, relative to the occupation's going rate (1 = the going rate). */
  bidIndex: number;
}

export interface LabourAllocation {
  /** Matches each bid received, in heads. Only bids that received something are present. */
  filledByKey: Map<string, number>;
  /** Σ of the above. */
  filledUnits: number;
}

/**
 * Allocate `matches` heads across the bids: highest bid first, pro rata within an equal bid,
 * nothing to a bid below the reservation. A bid whose units are not positive posts nothing.
 */
export function clearLabourMatches(bids: readonly LabourBid[], matches: number, reservationIndex = 0): LabourAllocation {
  const filledByKey = new Map<string, number>();
  let remaining = Math.max(0, matches);
  let filledUnits = 0;
  const live = bids
    .filter((b) => b.units > 0 && b.bidIndex >= reservationIndex && Number.isFinite(b.bidIndex))
    .sort((a, b) => b.bidIndex - a.bidIndex);
  let i = 0;
  while (i < live.length && remaining > 0) {
    // One bid level at a time: every bid at this level is served before any below it.
    let j = i;
    let levelUnits = 0;
    while (j < live.length && live[j].bidIndex === live[i].bidIndex) { levelUnits += live[j].units; j++; }
    const share = remaining >= levelUnits ? 1 : remaining / levelUnits;
    for (let k = i; k < j; k++) {
      const got = live[k].units * share;
      if (got > 0) {
        filledByKey.set(live[k].key, (filledByKey.get(live[k].key) ?? 0) + got);
        filledUnits += got;
      }
    }
    remaining -= Math.min(remaining, levelUnits);
    i = j;
  }
  return { filledByKey, filledUnits };
}

/** The bids with what they have already received taken off — the book a second pass clears. */
export function remainingLabourBids(bids: readonly LabourBid[], filledByKey: ReadonlyMap<string, number>): LabourBid[] {
  return bids
    .map((b) => ({ ...b, units: b.units - (filledByKey.get(b.key) ?? 0) }))
    .filter((b) => b.units > 1e-9);
}

/**
 * The price the market printed: the lowest bid that received anything — the marginal bid.
 * `undefined` when nothing filled: no trade, no print (§3.21).
 */
export function labourPrintOf(bids: readonly LabourBid[], filledByKey: ReadonlyMap<string, number>): number | undefined {
  let marginal: number | undefined;
  bids.forEach((b) => {
    if (!((filledByKey.get(b.key) ?? 0) > 0)) return;
    if (marginal === undefined || b.bidIndex < marginal) marginal = b.bidIndex;
  });
  return marginal;
}
