/**
 * W — the wire family (§5-WIRES). W1: the week's money wires are exactly what settlement executed
 * (a payment row is a projection of a wire, never the other way round). W2+ arrive with the
 * asset kinds: a holding's change is the replay of its wires.
 */
import { GameState } from '../../types';
import { AuditFinding, B } from './types';
import { AuditSnapshot, ladderUSDByKey, ladderUSDByTicker } from './snapshot';
import { isTrancheKind } from '../../domain/assets';

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
  // W2: the clearing house is on both sides of every fill — what the issuers and sellers
  // delivered to it is what the buyers took from it, per region and asset kind. A net is a
  // holder whose fills no wire names (a leg still written on its own book).
  const nets = Object.entries(w.houseNetUSDByKey ?? {}).filter(([key, net]) => {
    const kind = key.split('|')[1];
    return Math.abs(net) > Math.max(1e4, (w.valueUSDByKind[kind] ?? 0) * 1e-6);
  });
  if (nets.length > 0) {
    const worst = nets.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
    const usd = nets.reduce((a, [, n]) => a + Math.abs(n), 0);
    out.push({ family: 'W', check: 'W2 the clearing house nets to zero per asset', week, usd, message: `${nets.length} region-kinds leave the clearing house holding paper (${nets.map(([k, n]) => `${k.replace('|', ' ')} ${B(n)}`).slice(0, 4).join(' | ')}${nets.length > 4 ? ' | …' : ''}) — a fill some holder books without a wire; worst ${worst[0].replace('|', ' ')}` });
  }
  // W3: the ladders' change is the replay of the issuers' wires — face issued minus face retired,
  // per region and kind of paper. A gap is a ladder written without a wire (a birth — B's gap —
  // or a writer the ledger does not own yet).
  if (prev?.ladderUSDByKey) {
    const now = ladderUSDByKey(state);
    const keys = new Set([...Object.keys(now), ...Object.keys(prev.ladderUSDByKey), ...Object.keys(w.issuerNetUSDByKey ?? {})]);
    const gaps: [string, number][] = [];
    keys.forEach((key) => {
      if (!isTrancheKind(key.split('|')[1])) return;
      const delta = (now[key] ?? 0) - (prev.ladderUSDByKey![key] ?? 0);
      const wired = w.issuerNetUSDByKey?.[key] ?? 0;
      if (Math.abs(delta - wired) > Math.max(1e4, Math.abs(delta) * 1e-6)) gaps.push([key, delta - wired]);
    });
    if (gaps.length > 0 && process.env.LADDER_TRACE === '1' && prev.ladderUSDByTicker) {
      // The per-issuer decomposition: which firms' ladders moved by other than their wires, and
      // whether the firm is new this week (a birth — B's gap) or gone.
      const nowT = ladderUSDByTicker(state);
      const byTicker = new Map(state.companies.map((c) => [c.ticker, c]));
      const rows: [string, number, string][] = [];
      new Set([...Object.keys(nowT), ...Object.keys(prev.ladderUSDByTicker), ...Object.keys(w.issuerNetUSDByTicker ?? {})]).forEach((key) => {
        const d = (nowT[key] ?? 0) - (prev.ladderUSDByTicker![key] ?? 0);
        const wired = w.issuerNetUSDByTicker?.[key] ?? 0;
        if (isTrancheKind(key.split('|')[1]) && Math.abs(d - wired) > 1e4) {
          const tk = key.split('|')[0]; const c = byTicker.get(tk);
          const tag = !(key in prev.ladderUSDByTicker!) && !(key.split('|')[0] in prev.ladderUSDByTicker!) ? 'NEW' : !c ? 'GONE' : c.isDefaulted ? 'DEFAULTED' : (c as { bornWeek?: number }).bornWeek === week ? 'BORN' : '';
          rows.push([key, d - wired, tag]);
        }
      });
      rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      console.log(`  [ladder-trace] w${week}: ${rows.length} issuers off their wires — ` + rows.slice(0, 12).map(([k, g, tag]) => `${k.replace('|', ' ')} ${B(g)}${tag ? ' ' + tag : ''}`).join(' | '));
    }
    if (gaps.length > 0) {
      const usd = gaps.reduce((a, [, g]) => a + Math.abs(g), 0);
      out.push({ family: 'W', check: 'W3 wires reproduce the ladders', week, usd, message: `${gaps.length} region-kinds' ladders moved by other than their wires (${gaps.map(([k, g]) => `${k.replace('|', ' ')} ${B(g)}`).slice(0, 4).join(' | ')}${gaps.length > 4 ? ' | …' : ''}) — face written on a ladder without a wire, or a wire no ladder took` });
    }
  }
  return out;
}
