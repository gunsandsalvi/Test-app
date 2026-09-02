/**
 * W — the wire family (§5-WIRES). W1: the week's money wires are exactly what settlement executed
 * (a payment row is a projection of a wire, never the other way round). W2+ arrive with the
 * asset kinds: a holding's change is the replay of its wires.
 */
import { GameState } from '../../types';
import { AuditFinding, B } from './types';
import { AuditSnapshot } from './snapshot';

export function auditWires(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const w = state.lastWires; const s = state.lastSettlement;
  if (!w) { out.push({ family: 'W', check: 'W1 the week has a wire journal', week, message: 'no wires were recorded this week' }); return out; }
  // What settled this week = this week's money wires, less the tail recorded after the last pass
  // (it settles next week), plus last week's tail (it settled this week).
  const moneyUSD = (w.valueUSDByKind.MONEY ?? 0) - w.moneyPendingUSD + (prev?.moneyPendingUSD ?? 0);
  if (s && Math.abs(moneyUSD - s.grossUSD) > Math.max(1e3, s.grossUSD * 1e-9)) {
    out.push({ family: 'W', check: 'W1 money wires = settlement gross', week, usd: moneyUSD - s.grossUSD, message: `money wires ${B(moneyUSD)} against settlement's gross ${B(s.grossUSD)} — a payment row with no wire, or a wire no pass settled` });
  }
  return out;
}
