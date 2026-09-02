/** O — OWNERSHIP. Every asset has exactly one owner and every owner exists. */

import { GameState, RegionId } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, sum } from './types';
import { marketCapOf } from '../../domain/company';
import { ensureV2 } from '../../engine2/world';
import { AUDIT_BOOKS_TOLERANCE } from '../../domain/stated';
import { TR_FACILITY, TR_CP, TR_FLOATING, ladderRowsOf, issuerIdOf, isTrancheId, trancheRowOf } from '../../engine2/tranches';
import { bookHeadOf } from '../../engine2/holdings';

/** O1 — two-sided: what the books hold of each debt class equals what is outstanding, in both directions. */
function o1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  type Book = { corp: number; loan: number; sov: number; cp: number };
  const held: Record<string, Book> = {}; const outstanding: Record<string, Book> = {};
  REGION_IDS.forEach((r) => { held[r] = { corp: 0, loan: 0, sov: 0, cp: 0 }; outstanding[r] = { corp: 0, loan: 0, sov: 0, cp: 0 }; });
  const regionById = new Map(state.companies.map((c) => [c.id, c.region]));
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    const o = outstanding[c.region]; if (!o) return;
    (c.debtTranches ?? []).forEach((t) => {
      if (t.isBankFacility) return; // on a bank's loan book, tested in O4
      if (t.isCommercialPaper) o.cp += t.principalUSD; else if (t.rateType === 'FIXED') o.corp += t.principalUSD; else o.loan += t.principalUSD;
    });
  });
  // §5-CLOSE O1: paper issued THIS week is in the auction (07c/07f place it next week, and what
  // they cannot place is withdrawn from the ladder); it is offered, not yet anyone's, and not
  // yet owed to nobody either. Everything older must have a holder.
  REGION_IDS.forEach((r) => { outstanding[r].sov = sum((state.regions[r]?.govDebtTranches ?? []).filter((t) => t.originationWeek < state.currentWeek), (t) => t.principalUSD); });
  const add = (h: { instrumentType: string; issuerRegion: string; quantityOrNotionalUSD?: number }) => {
    const b = held[h.issuerRegion]; if (!b) return; const v = h.quantityOrNotionalUSD ?? 0;
    if (h.instrumentType === 'CORP_BOND') b.corp += v; else if (h.instrumentType === 'LEVERAGED_LOAN') b.loan += v; else if (h.instrumentType === 'GOV_BOND') b.sov += v; else if (h.instrumentType === 'COMMERCIAL_PAPER') b.cp += v;
  };
  state.institutionalEntities.forEach((e) => { if (!e.isDefaulted) e.itemizedHoldings.forEach(add); });
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    ((c as unknown as { treasuryHoldings?: { instrumentType: string; issuerRegion: string; quantityOrNotionalUSD?: number }[] }).treasuryHoldings ?? []).forEach(add);
    const bs = c.bankBalanceSheet; if (!bs || c.isDefaulted) return;
    held[c.region].sov += sum(Object.values(bs.sovereignBondHoldingsByTenor ?? {}), (v) => Number(v) || 0);
    (bs.dealerDeskInventory?.['commercial paper'] ?? []).forEach((p) => { held[c.region].cp += p.inventoryUSD; });
  });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r]; if (!reg) return;
    (reg.bankingSector.corpBondDealerInventory ?? []).forEach((p) => { held[r].corp += p.inventoryUSD; });
    (reg.bankingSector.loanDealerInventory ?? []).forEach((p) => { held[r].loan += p.inventoryUSD; });
    (reg.bankingSector.sovBondDealerInventory ?? []).forEach((p) => { held[r].sov += p.inventoryUSD; });
    held[r].sov += sum(Object.values(reg.centralBankSheet?.sovereignHoldingsByTenor ?? {}), (v) => Number(v) || 0);
    void regionById;
    (['corp', 'loan', 'sov', 'cp'] as const).forEach((k) => {
      const h = held[r][k], o = outstanding[r][k];
      if (o <= 0 && h <= 0) return;
      if (Math.abs(h - o) > Math.max(5e7, o * AUDIT_BOOKS_TOLERANCE)) out.push({ family: 'O', check: `O1 ${k === 'corp' ? 'bonds' : k === 'loan' ? 'loans' : k === 'sov' ? 'sovereign' : 'paper'} held = outstanding`, week, usd: h - o, message: `${r}: books hold ${B(h)} of ${B(o)} outstanding (${pct(o > 0 ? h / o - 1 : 0)}) — ${h > o ? 'a ledger mints claims' : 'paper with no owner'}` });
    });
  });
  return out;
}

/** O2 — shares: the register's count never exceeds the issue, and market cap is price × shares. */
function o2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const heldShares = new Map<string, number>();
  state.institutionalEntities.forEach((e) => { if (e.isDefaulted) return; e.itemizedHoldings.forEach((h) => { if (h.instrumentType === 'EQUITY' && h.quantityShares) heldShares.set(h.instrumentId, (heldShares.get(h.instrumentId) ?? 0) + h.quantityShares); }); });
  let over = 0, overUSD = 0, capGap = 0, capN = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const hs = heldShares.get(c.id) ?? 0;
    if (c.sharesOutstanding > 0 && hs > c.sharesOutstanding * (1 + AUDIT_BOOKS_TOLERANCE)) { over++; overUSD += (hs - c.sharesOutstanding) * c.stockPrice; }
    if (c.stockPrice > 0 && c.sharesOutstanding > 0) { const cap = c.stockPrice * c.sharesOutstanding; if (Math.abs(cap - marketCapOf(c)) > cap * AUDIT_BOOKS_TOLERANCE) { capN++; capGap += Math.abs(cap - marketCapOf(c)); } }
  });
  if (over) out.push({ family: 'O', check: 'O2 shares held ≤ issued', week, usd: overUSD, message: `${over} firms have more shares on the register than they issued (${B(overUSD)} of phantom stock)` });
  if (capN) out.push({ family: 'O', check: 'O2 market cap = price × shares', week, usd: capGap, message: `${capN} firms' market cap differs from price × shares by ${B(capGap)} in all` });
  return out;
}

/** O3 — register integrity: every row names a live instrument and a live holder; nothing references an acquired firm. */
function o3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const live = new Map(state.companies.map((c) => [c.id, c]));
  const ent = new Map(state.institutionalEntities.map((e) => [e.id, e]));
  const v2o3 = ensureV2(state); // 13b: a row names a tranche or its issuer
  let orphan = 0, orphanUSD = 0, merged = 0, mergedUSD = 0, deadHolders = 0;
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) { if (e.itemizedHoldings.length) deadHolders++; return; }
    e.itemizedHoldings.forEach((h) => {
      const v = h.quantityOrNotionalUSD ?? 0;
      if (h.instrumentType === 'GOV_BOND') return;
      const c = live.get(issuerIdOf(v2o3, h.instrumentId));
      // 13b: a tranche's row is live only while the tranche is (retired paper on a book is an orphan).
      if (c && isTrancheId(v2o3, h.instrumentId) && trancheRowOf(v2o3, h.instrumentId) === undefined) { orphan++; orphanUSD += v; return; }
      if (c) { if (c.mergerAcquired) { merged++; mergedUSD += v; } return; }
      if (ent.get(h.instrumentId)) return;
      if (h.instrumentType === 'PE_FUND_INTEREST' || h.instrumentType === 'ETF_SHARE') return;
      orphan++; orphanUSD += v;
    });
  });
  if (orphan) out.push({ family: 'O', check: 'O3 register rows name a live instrument', week, usd: orphanUSD, message: `${orphan} rows (${B(orphanUSD)}) name an instrument that does not exist` });
  if (merged) out.push({ family: 'O', check: 'O3 no row on an acquired firm', week, usd: mergedUSD, message: `${merged} rows (${B(mergedUSD)}) still sit on firms a merger absorbed` });
  if (deadHolders) out.push({ family: 'O', check: 'O3 dead holders hold nothing', week, usd: deadHolders, message: `${deadHolders} defaulted funds still carry a book` });
  return out;
}

/** O4 — every facility has a live borrower and a live lender. §5-FINALIZATION step 10: the
 *  lender's book IS the facility rows on the borrowers' ladders (there is no second list to
 *  disagree with), so what is left to check is that each row names a borrower that is active
 *  or in an open estate, and a lender that still has a sheet. */
function o4(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const S = v2.tranches;
  const byId = new Map(state.companies.map((c) => [c.id, c]));
  const bankByTicker = new Map(state.companies.filter((c) => c.isBankEntity).map((c) => [c.ticker, c]));
  const openEstates = new Set((state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  let orphanLoans = 0, orphanUSD = 0, lenderless = 0, lenderlessUSD = 0;
  for (let r = 0; r < S.used; r++) {
    if (!(S.flags[r] & TR_FACILITY) || S.bankRef[r] < 0 || S.issuerRef[r] < 0 || !(S.principalUSD[r] > 0.01)) continue;
    const c = byId.get(v2.internedStrings[S.issuerRef[r]]);
    if (!c || !(isActiveCompany(c) || openEstates.has(c.id))) { orphanLoans++; orphanUSD += S.principalUSD[r]; }
    const b = bankByTicker.get(v2.internedStrings[S.bankRef[r]]);
    if (!b || !b.bankBalanceSheet || !isActiveCompany(b)) { lenderless++; lenderlessUSD += S.principalUSD[r]; }
  }
  if (orphanLoans) out.push({ family: 'O', check: 'O4 every facility has a live borrower', week, usd: orphanUSD, message: `${orphanLoans} facilities (${B(orphanUSD)}) sit on the ladders of firms that are gone or dead with no open estate` });
  if (lenderless) out.push({ family: 'O', check: 'O4 every facility has a live lender', week, usd: lenderlessUSD, message: `${lenderless} facilities (${B(lenderlessUSD)}) name a lender that has no sheet` });
  return out;
}

/** O6 — corporate paper held = corporate paper issued: per region and kind, the register's rows plus
 *  every named desk's inventory against the ladders' face (an acquired firm's ladder is the
 *  acquirer's; a defaulted issuer's paper is still a claim). The corporate twin of O1. */
function o6(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const S = v2.tranches, H = v2.holdings;
  const KINDS = ['CORP_BOND', 'LEVERAGED_LOAN', 'COMMERCIAL_PAPER'] as const;
  const kindOfFlags = (f: number): typeof KINDS[number] | undefined =>
    (f & TR_FACILITY) ? undefined : (f & TR_CP) ? 'COMMERCIAL_PAPER' : (f & TR_FLOATING) ? 'LEVERAGED_LOAN' : 'CORP_BOND';
  const issued = new Map<string, number>(), held = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    for (const r of ladderRowsOf(v2, c.id)) { const k = kindOfFlags(S.flags[r]); if (k) add(issued, `${c.region}|${k}`, S.principalUSD[r]); }
  });
  const kindRefs = new Map(KINDS.map((k) => [v2.internedIdByString.get(k), k] as const));
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      const k = kindRefs.get(H.typeRef[r]); if (!k) continue;
      add(held, `${v2.internedStrings[H.regionRef[r]]}|${k}`, H.qtyUSD[r]);
    }
  });
  const DESK_BOOKS: Record<string, typeof KINDS[number]> = { 'corporate bond': 'CORP_BOND', 'leveraged loan': 'LEVERAGED_LOAN', 'commercial paper': 'COMMERCIAL_PAPER' };
  state.companies.forEach((b) => {
    const inv = b.bankBalanceSheet?.dealerDeskInventory; if (!inv || !isActiveCompany(b)) return;
    Object.entries(DESK_BOOKS).forEach(([book, k]) => (inv[book] ?? []).forEach((p) => add(held, `${b.region}|${k}`, p.inventoryUSD)));
  });
  const gaps: string[] = []; let gapUSD = 0;
  new Set([...issued.keys(), ...held.keys()]).forEach((key) => {
    const i = issued.get(key) ?? 0, h = held.get(key) ?? 0;
    if (Math.abs(h - i) > Math.max(1e7, i * AUDIT_BOOKS_TOLERANCE)) { gaps.push(`${key.replace('|', ' ')} held ${B(h)} of ${B(i)}`); gapUSD += h - i; }
  });
  if (gaps.length) out.push({ family: 'O', check: 'O6 corporate paper held = issued', week, usd: gapUSD, message: `${gaps.length} region-kinds' books differ from the ladders (${gaps.slice(0, 4).join(' | ')}${gaps.length > 4 ? ' | …' : ''})` });
  return out;
}

/** O5 — contracts, estates, indices, shipments: parties alive, claims bounded, weights whole. */
function o5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const tickers = new Map(state.companies.map((c) => [c.ticker, c]));
  const ents = new Map(state.institutionalEntities.map((e) => [e.id, e]));
  let deadParty = 0, deadUSD = 0;
  (state.derivativesBook ?? []).forEach((k) => {
    const alive = (p: { kind: string; ticker?: string; id?: string }) => p.kind === 'INSTITUTION' ? !!ents.get(p.id!) && !ents.get(p.id!)!.isDefaulted : !!tickers.get(p.ticker!) && isActiveCompany(tickers.get(p.ticker!)!);
    if (!alive(k.a as never) || !alive(k.b as never)) { deadParty++; deadUSD += k.notionalUSD; }
  });
  if (deadParty) out.push({ family: 'O', check: 'O5 contracts have two live parties', week, usd: deadUSD, message: `${deadParty} contracts (${B(deadUSD)}) have a dead or missing party` });
  let overRecovered = 0;
  (state.estates ?? []).forEach((e) => { e.claims.forEach((c) => { if (c.recoveredUSD > c.principalUSD * 1.001 + 1) overRecovered++; }); });
  if (overRecovered) out.push({ family: 'O', check: 'O5 recovered ≤ owed', week, usd: overRecovered, message: `${overRecovered} estate claims recovered more than they were owed` });
  let badIndex = 0;
  (state.marketIndexes ?? []).forEach((x) => { const w = sum(x.constituents, (c) => c.weight); if (x.constituents.length && Math.abs(w - 1) > AUDIT_BOOKS_TOLERANCE) badIndex++; });
  if (badIndex) out.push({ family: 'O', check: 'O5 index weights sum to one', week, usd: badIndex, message: `${badIndex} indices' weights do not sum to one` });
  let deadShip = 0;
  const idOrTicker = (key: string) => tickers.get(key) ?? state.companies.find((c) => c.id === key);
  // Step 8: a dead buyer with an OPEN estate still takes delivery — the receiver liquidates it.
  const openEstates = new Set((state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  (state.goodsInTransit ?? []).forEach((g) => { const b = tickers.get(g.buyerTicker); if (!b || !(isActiveCompany(b) || openEstates.has(b.id))) deadShip++; else if (!String(g.sellerKey).startsWith('PRIVATE') && !idOrTicker(String(g.sellerKey).replace(/^.*:/, ''))) deadShip++; });
  if (deadShip) out.push({ family: 'O', check: 'O5 shipments have live buyer and seller', week, usd: deadShip, message: `${deadShip} consignments in transit to or from a firm that is gone` });
  return out;
}

export function auditOwnership(state: GameState, week: number): AuditFinding[] {
  return [...o1(state, week), ...o2(state, week), ...o3(state, week), ...o4(state, week), ...o5(state, week), ...o6(state, week)];
}
export type { RegionId };
