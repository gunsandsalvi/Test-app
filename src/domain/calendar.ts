/**
 * §3.15-iv — THE ONE CALENDAR. The engine counts weeks; a date is a READ of a week against one
 * epoch, and this is the epoch: week 0 is 1 January 2027 (§5-AU, user rule — the UI never shows
 * a week). Before this file the engine's formatters counted from 5 January 2026 and the UI from
 * here, so a trace and the screen disagreed by a year about when a bond matured. Nothing else may
 * hold a start date.
 */

const EPOCH_UTC = Date.UTC(2027, 0, 1);
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** The date a week begins, UTC. A negative week is clamped to the epoch. */
export function dateOfWeek(week: number): Date {
  return new Date(EPOCH_UTC + Math.max(0, week) * WEEK_MS);
}

/** The calendar year a week falls in — a maturity's year in a name (§3.14). */
export const yearOfWeek = (week: number): number => dateOfWeek(week).getUTCFullYear();
