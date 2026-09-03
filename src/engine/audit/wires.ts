/**
 * W — the wire family. W1: the week's money wires are exactly what settlement executed
 * (a payment row is a projection of a wire, never the other way round). W2+ arrive with the
 * asset kinds: a holding's change is the replay of its wires.
 */
import { GameState } from '../../types';
import { AuditFinding, B } from './types';
import { AuditSnapshot, ladderUSDByKey, ladderUSDByTicker, goodsUnitsByKey, registerQtyByKind } from './snapshot';
import { isTrancheKind } from '../../domain/assets';
import { ensureV2 } from '../../engine2/world';
import { issuerIdOf } from '../../engine2/tranches';

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
  if (nets.length > 0 && process.env.W2_TRACE === '1') {
    console.log(`  [w2-trace] w${week}: ` + nets.map(([k, n]) => `${k.replace('|', ' ')} ${B(n)}`).join(' | '));
    const byAsset = Object.entries(w.houseNetUSDByAsset ?? {}).filter(([, n]) => Math.abs(n) > 1e5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const v2w = ensureV2(state);
    nets.forEach(([k]) => {
      const top = byAsset.filter(([ak]) => ak.startsWith(k + '|')).slice(0, 6).map(([ak, n]) => `${ak.slice(k.length + 1)} ${(n / 1e6).toFixed(1)}M`);
      if (top.length) console.log(`    [w2-asset] ${k.replace('|', ' ')}: ${top.join(' | ')}`);
      // By ISSUER: a tranche resolves to its issuer, so a desk's issuer-keyed leg and the
      // register's tranche-keyed legs of the same paper net here; what remains names the issuer.
      const byIssuer = new Map<string, number>();
      Object.entries(w.houseNetUSDByAsset ?? {}).forEach(([ak, n]) => {
        if (!ak.startsWith(k + '|')) return;
        const iss = issuerIdOf(v2w, ak.slice(k.length + 1));
        byIssuer.set(iss, (byIssuer.get(iss) ?? 0) + n);
      });
      const topIss = [...byIssuer.entries()].filter(([, n]) => Math.abs(n) > 1e5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
      if (topIss.length) console.log(`    [w2-issuer] ${k.replace('|', ' ')}: ${topIss.map(([i, n]) => `${i} ${(n / 1e6).toFixed(1)}M`).join(' | ')}`);
    });
  }
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
  // W4: the goods identity — per region and sub-unit, in units, the stock's change is what was
  // produced less consumed and scrapped, plus what the wires brought in less what they took out.
  if (prev?.goodsUnitsByKey) {
    const now = goodsUnitsByKey(state);
    const flows = w.goodsFlowByKey ?? {}; const nets = w.goodsNetUnitsByKey ?? {};
    const keys = new Set([...Object.keys(now), ...Object.keys(prev.goodsUnitsByKey), ...Object.keys(flows), ...Object.keys(nets)]);
    const gaps: [string, number][] = [];
    keys.forEach((key) => {
      const delta = (now[key] ?? 0) - (prev.goodsUnitsByKey![key] ?? 0);
      const f = flows[key]; const explained = (f ? f.producedUnits - f.consumedUnits - f.scrappedUnits : 0) + (nets[key] ?? 0);
      // The tolerance is floating-point dust on the GROSS flow (a lot's 0.0001u residue, the sum
      // of thousands of products), never a share of the stock.
      const gross = (f ? f.producedUnits + f.consumedUnits + f.scrappedUnits : 0) + Math.abs(nets[key] ?? 0) + Math.abs(delta);
      if (Math.abs(delta - explained) > Math.max(0.5, gross * 1e-6)) gaps.push([key, delta - explained]);
    });
    if (gaps.length > 0 && process.env.GOODS_TRACE === '1') {
      // The decomposition of the worst gaps: stock by part (output, lots, transit) before and
      // after, the transformations, the wires' net.
      gaps.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const partsNow: Record<string, [number, number, number]> = {}; goodsUnitsByKey(state, partsNow);
      gaps.slice(0, 5).forEach(([key, g]) => {
        const f = flows[key]; const pn = partsNow[key] ?? [0, 0, 0];
        const [rg, sb] = key.split('|');
        let receipts = 0;
        const byId = new Map(state.companies.map((c) => [c.id, c]));
        Object.entries((state as { lotReceiptsTrace?: Record<string, number> }).lotReceiptsTrace ?? {}).forEach(([k, u]) => { const [cid, s2] = k.split('|'); if (s2 === sb && byId.get(cid)?.region === rg) receipts += u; });
        if (rg === 'USA' && sb === 'electricity') {
          const byTicker = new Map(state.companies.map((c) => [c.ticker, c]));
          const inBy: Record<string, number> = {}; const reasonsBy: Record<string, Set<string>> = {};
          Object.entries(w.goodsInByTicker ?? {}).forEach(([k, u]) => { const [tk, s2, rs] = k.split('|'); if (s2 !== sb) return; const c = byTicker.get(tk); if (c?.region !== rg) return; inBy[tk] = (inBy[tk] ?? 0) + u; (reasonsBy[tk] ??= new Set()).add(rs); });
          const recBy: Record<string, number> = {};
          Object.entries((state as { lotReceiptsTrace?: Record<string, number> }).lotReceiptsTrace ?? {}).forEach(([k, u]) => { const [cid, s2] = k.split('|'); if (s2 !== sb) return; const c = byId.get(cid); if (c?.region === rg) recBy[c.ticker] = (recBy[c.ticker] ?? 0) + u; });
          const rows = Object.keys({ ...inBy, ...recBy }).map((tk) => [tk, (inBy[tk] ?? 0) - (recBy[tk] ?? 0)] as [string, number]).filter(([, d]) => Math.abs(d) > 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
          const kinds = Object.entries(w.goodsInByTicker ?? {}).filter(([k]) => k.startsWith(`${rg}|${sb}|KIND:`)).map(([k, u]) => `${k.split('KIND:')[1]} ${u.toFixed(1)}`).join(', ');
          console.log(`  [goods-kind-trace] in by holder kind: ${kinds}; in transit now: ${(state.goodsInTransit ?? []).filter((s2) => s2.subUnitId === sb).length} consignments`);
          console.log(`  [goods-firm-trace] ${rows.length} firms off: ` + rows.slice(0, 6).map(([tk, d]) => `${tk} ${d.toFixed(1)} in ${(inBy[tk] ?? 0).toFixed(1)} rec ${(recBy[tk] ?? 0).toFixed(1)} [${[...(reasonsBy[tk] ?? [])].join(',')}] ${byTicker.get(tk)?.isDefaulted ? 'DEAD' : ''}${byTicker.get(tk)?.sector ?? ''}`).join(' | '));
        }
        console.log(`  [goods-trace] w${week} ${key.replace('|', ' ')}: wires in ${(w.goodsInUnitsByKey?.[key] ?? 0).toFixed(1)} out ${(w.goodsOutUnitsByKey?.[key] ?? 0).toFixed(1)} delivered ${(w.goodsDeliveredByKey?.[key] ?? 0).toFixed(1)} | lot receipts ${receipts.toFixed(1)} | gap ${g.toFixed(1)} | stock prev ${(prev.goodsUnitsByKey![key] ?? 0).toFixed(1)} now ${(now[key] ?? 0).toFixed(1)} (out ${pn[0].toFixed(1)} lots ${pn[1].toFixed(1)} transit ${pn[2].toFixed(1)}) | produced ${(f?.producedUnits ?? 0).toFixed(1)} consumed ${(f?.consumedUnits ?? 0).toFixed(1)} scrapped ${(f?.scrappedUnits ?? 0).toFixed(1)} | wires net ${(nets[key] ?? 0).toFixed(1)}`);
      });
    }
    if (gaps.length > 0) {
      gaps.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const units = gaps.reduce((a, [, g]) => a + Math.abs(g), 0);
      out.push({ family: 'W', check: 'W4 wires reproduce the goods stock', week, usd: units, message: `${gaps.length} region-goods' stock moved by other than production, consumption and wires (${gaps.slice(0, 4).map(([k, g]) => `${k.replace('|', ' ')} ${g.toFixed(1)}u`).join(' | ')}${gaps.length > 4 ? ' | …' : ''}) — goods that moved with no wire, or were made or used with no record` });
    }
  }
  // W5: the REGISTER's change is the replay of its wires — in the asset's own unit, shares, so
  // that a re-mark cannot move it. Only institutions hold register rows, so what the register
  // took in is what the wires delivered to an institution net of what they took away.
  if (prev?.registerQtyByKind) {
    const now = registerQtyByKind(state);
    const net = w.registerNetQtyByKind ?? {};
    const gaps: [string, number][] = [];
    new Set([...Object.keys(now), ...Object.keys(prev.registerQtyByKind), ...Object.keys(net)]).forEach((kind) => {
      if (!(kind in now) && !(kind in prev.registerQtyByKind!)) return;
      const delta = (now[kind] ?? 0) - (prev.registerQtyByKind![kind] ?? 0);
      const wired = net[kind] ?? 0;
      // Dust on the GROSS moved, never a share of the position.
      const gross = Math.abs(delta) + Math.abs(wired) + (now[kind] ?? 0);
      if (Math.abs(delta - wired) > Math.max(1e-3, gross * 1e-9)) gaps.push([kind, delta - wired]);
    });
    if (gaps.length > 0 && process.env.W5_TRACE === '1' && prev.registerQtyByHolder) {
      // WHICH BOOK. One number per asset kind cannot name a cause; the per-holder decomposition
      // can, the way LADDER_TRACE gives W3 its per-issuer one.
      const nowH: Record<string, number> = {};
      registerQtyByKind(state, nowH);
      const netH = w.registerNetQtyByHolder ?? {};
      // The per-holder net is kept for EVERY asset kind; the register's own read counts only the
      // share-held ones. Comparing them whole made every book that ever touched a bond look
      // billions off, so the decomposition is filtered to the kinds W5 actually checks.
      const checkedKinds = new Set([...Object.keys(now), ...Object.keys(prev.registerQtyByKind!)]);
      const rows: [string, number][] = [];
      new Set([...Object.keys(nowH), ...Object.keys(prev.registerQtyByHolder), ...Object.keys(netH)]).forEach((hk) => {
        if (!checkedKinds.has(hk.slice(hk.indexOf('|') + 1))) return;
        const d = (nowH[hk] ?? 0) - (prev.registerQtyByHolder![hk] ?? 0) - (netH[hk] ?? 0);
        if (Math.abs(d) > 1e-3) rows.push([hk, d]);
      });
      rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const byId = new Map((state.institutionalEntities ?? []).map((e) => [e.id, e]));
      const sumGaps = rows.reduce((a, [, d]) => a + d, 0);
      const grossGaps = rows.reduce((a, [, d]) => a + Math.abs(d), 0);
      console.log(`  [w5-trace] w${week}: ${rows.length} books off their wires, net ${sumGaps.toFixed(1)} vs the kind-level ${gaps.map(([k, g]) => `${k} ${g.toFixed(1)}`).join(',')}, gross ${grossGaps.toFixed(0)} — ` + rows.slice(0, 6).map(([hk, d]) => {
        const id = hk.split('|')[0]; const e = byId.get(id);
        return `${e ? `${e.entityType}:${e.ticker ?? id}` : `GONE:${id}`} ${d.toFixed(1)}`;
      }).join(' | '));
    }
    if (gaps.length > 0) {
      const worst = gaps.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
      out.push({ family: 'W', check: 'W5 wires reproduce the register', week, usd: gaps.reduce((a, [, g]) => a + Math.abs(g), 0), message: `${gaps.length} asset kinds' register holdings moved by other than their wires (${gaps.map(([k, g]) => `${k} ${g.toFixed(3)}`).slice(0, 4).join(' | ')}) — a position booked without a wire, or a wire no book took; worst ${worst[0]}` });
    }
  }
  return out;
}
