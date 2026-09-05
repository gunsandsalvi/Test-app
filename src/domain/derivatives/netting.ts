/**
 * §3.17e-iv — OFFSETTING LINES NET AT THE HOUSE. A member that reverses on a line — short
 * contracts standing, a long struck against them — does not carry both at the house, each
 * margined: a real clearing house nets a member's positions on one line and returns the margin.
 * The PLAN is pure: which slices of which standing contracts a new one offsets, oldest first, by
 * the seat the member gives up. The lifecycle executes it — the slice closes at the print, the
 * member's margin comes back, and the new counterparty takes the seat for the slice.
 *
 * A LINE is one contract's identity: class, region, money, reference, tenor and MATURITY — the
 * futures' delivery, an option's expiry. Two swaps struck on different weeks are two lines, and
 * they stand gross, as a cleared swap book's do until a compression run.
 */

import type { DerivativeContract, DerivativeParty } from './contract';
import { derivativePartyKey, referenceKeyOf } from './contract';

export const lineKeyOf = (c: DerivativeContract): string =>
  `${c.classId}|${c.regionId}|${c.currency}|${referenceKeyOf(c.reference)}|${c.termKey}|${c.maturityWeek}`;

const same = (p: DerivativeParty, q: DerivativeParty): boolean => derivativePartyKey(p) === derivativePartyKey(q);

/** One slice of a standing contract a new one offsets: the seat given up ('a' or 'b' of the
 *  standing contract), the notional netted, and the member taking the seat. */
export interface Offset { standingId: string; seat: 'a' | 'b'; notional: number; incoming: DerivativeParty }

/**
 * The offsets one new contract makes against the standing book, and what of it still stands.
 * The member on the new contract's A side nets the standing contracts where it is B on the same
 * line, and vice versa; each standing contract is drawn on once, oldest first.
 */
export function planOffsets(c: DerivativeContract, standing: readonly DerivativeContract[], drawn: ReadonlySet<string> = new Set()): { offsets: Offset[]; remainingNotional: number } {
  const offsets: Offset[] = [];
  let remaining = c.notional;
  const line = lineKeyOf(c);
  for (const s of standing) {
    if (remaining <= 0) break;
    if (drawn.has(s.id) || s.id === c.id || lineKeyOf(s) !== line) continue;
    const seat: 'a' | 'b' | undefined = same(s.b, c.a) ? 'b' : same(s.a, c.b) ? 'a' : undefined;
    if (!seat) continue;
    const incoming = seat === 'b' ? c.b : c.a;
    // The two members of the new contract cannot both be netting the same standing one's seats
    // unless it is between them already — then it closes whole for both, and the incoming seat
    // is the one it already holds.
    const notional = Math.min(remaining, s.notional);
    offsets.push({ standingId: s.id, seat, notional, incoming });
    remaining -= notional;
  }
  return { offsets, remainingNotional: remaining };
}
