/**
 * AU — THE UI'S DATE FORMATS. The engine counts weeks; the UI never shows one (§5-AU, user rule).
 * §3.15-iv: the epoch is the domain's (`domain/calendar.ts`, week 0 = 1 January 2027) and this
 * file only spells a date; every date, month and duration on screen maps through here.
 */

import { dateOfWeek } from '../domain/calendar';
export { dateOfWeek, yearOfWeek } from '../domain/calendar';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Apr 2027" */
export function formatDate(week: number): string {
  const d = dateOfWeek(week);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Apr 2027" */
export function formatMonth(week: number): string {
  const d = dateOfWeek(week);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Apr" — the short axis label. */
export function formatMonthShort(week: number): string {
  return MONTHS[dateOfWeek(week).getUTCMonth()];
}

/** "Apr 27" — a due date in a narrow column. */
export function formatMonthYear(week: number): string {
  const d = dateOfWeek(week);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** A span of weeks as a duration in months or years, never weeks: "3 months", "1.5 years". */
export function formatSpan(weeks: number): string {
  if (weeks < 4) return 'under a month';
  const months = weeks / (52 / 12);
  if (months < 12) return `${Math.round(months)} month${Math.round(months) === 1 ? '' : 's'}`;
  const years = weeks / 52;
  return `${years.toFixed(years < 3 ? 1 : 0)} years`;
}

/** The change-window labels §1.8 asks for: month on month, year on year. */
export const WEEKS_PER_MONTH = 4;
export const WEEKS_PER_YEAR = 52;

/** The quarter a week falls in, on the UI calendar: "Q1 2027". */
export function quarterLabel(week: number): string {
  const d = dateOfWeek(week);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}
