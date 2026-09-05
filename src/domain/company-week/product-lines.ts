/**
 * §3.20d-ii — A PRODUCT LINE CAN BE EXITED. A firm's lines were fixed at the seed for life: a
 * line whose plant idled past the management's horizon had its plant mothballed and, four
 * horizons on, scrapped (`capital-programme.ts:capacityRetirement`), but the LINE stayed — it
 * kept its revenue share, kept posting offers at zero production, kept a category share.
 *
 * Exit is the decision the retirement implies, on the same clock. A line is idle in a week it
 * neither made nor sold a unit (both measured by the goods auction); the streak is the line's
 * own, and when it reaches the horizon the plant would be scrapped at, the line goes: its revenue
 * share to the firm's other lines in proportion to theirs, its category share back to the market.
 * A firm whose last line goes is a firm with nothing to sell — not a death by rule, a firm the
 * distress path will reach on its own books.
 */

import type { ProductLine } from '../company';

export interface LineExit {
  lines: ProductLine[];
  /** The lines that left this week, in the order they stood. */
  exited: ProductLine[];
}

export function exitIdleLines(
  lines: readonly ProductLine[],
  /** Whether each line made or sold a unit this week, by sub-unit; absent = did nothing. */
  activeBySubUnit: ReadonlyMap<string, boolean>,
  /** The management's exit horizon in weeks: the plant's own scrap clock. */
  horizonWeeks: number
): LineExit {
  const horizon = Math.max(1, Math.floor(horizonWeeks));
  const kept: ProductLine[] = [];
  const exited: ProductLine[] = [];
  lines.forEach((line) => {
    const active = activeBySubUnit.get(line.subUnitId) === true;
    const idleStreakWeeks = active ? 0 : (line.idleStreakWeeks ?? 0) + 1;
    if (idleStreakWeeks >= horizon) { exited.push({ ...line, idleStreakWeeks }); return; }
    kept.push(idleStreakWeeks > 0 ? { ...line, idleStreakWeeks } : { ...line, idleStreakWeeks: 0 });
  });
  if (exited.length === 0) return { lines: kept, exited };
  const keptShare = kept.reduce((a, l) => a + Math.max(0, l.revenueShare), 0);
  return {
    lines: kept.map((l) => ({ ...l, revenueShare: keptShare > 0 ? Math.max(0, l.revenueShare) / keptShare : 1 / kept.length })),
    exited,
  };
}
