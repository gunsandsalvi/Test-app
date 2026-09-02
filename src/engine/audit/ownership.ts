/** O — OWNERSHIP. Every asset has exactly one owner and every owner exists. */

import { GameState, RegionId } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, sum } from './types';
import { marketCapOf } from '../../domain/company';

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
      if (Math.abs(h - o) > Math.max(5e7, o * 0.02)) out.push({ family: 'O', check: `O1 ${k === 'corp' ? 'bonds' : k === 'loan' ? 'loans' : k === 'sov' ? 'sovereign' : 'paper'} held = outstanding`, week, usd: h - o, message: `${r}: books hold ${B(h)} of ${B(o)} outstanding (${pct(o > 0 ? h / o - 1 : 0)}) — ${h > o ? 'a ledger mints claims' : 'paper with no owner'}` });
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
    if (c.sharesOutstanding > 0 && hs > c.sharesOutstanding * 1.02) { over++; overUSD += (hs - c.sharesOutstanding) * c.stockPrice; }
    if (c.stockPrice > 0 && c.sharesOutstanding > 0) { const cap = c.stockPrice * c.sharesOutstanding; if (Math.abs(cap - marketCapOf(c)) > cap * 0.02) { capN++; capGap += Math.abs(cap - marketCapOf(c)); } }
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
  let orphan = 0, orphanUSD = 0, merged = 0, mergedUSD = 0, deadHolders = 0;
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) { if (e.itemizedHoldings.length) deadHolders++; return; }
    e.itemizedHoldings.forEach((h) => {
      const v = h.quantityOrNotionalUSD ?? 0;
      if (h.instrumentType === 'GOV_BOND') return;
      const c = live.get(h.instrumentId);
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

/** O4 — bank loans and the borrowers' ladders are the same facilities. */
function o4(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const onBanks = new Map<string, number>();
  let orphanLoans = 0, orphanUSD = 0;
  const byId = new Map(state.companies.map((c) => [c.id, c]));
  state.companies.forEach((b) => {
    const bs = b.bankBalanceSheet; if (!b.isBankEntity || !bs || !isActiveCompany(b)) return;
    (bs.businessLoans ?? []).forEach((l) => {
      if (l.borrowerKind !== 'COMPANY_FACILITY') return;
      const c = byId.get(l.borrowerId);
      if (!c || !isActiveCompany(c)) { orphanLoans++; orphanUSD += l.principalUSD; return; }
      onBanks.set(l.borrowerId, (onBanks.get(l.borrowerId) ?? 0) + l.principalUSD);
    });
  });
  let mismatch = 0, mismatchUSD = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const onLadder = sum((c.debtTranches ?? []).filter((t) => t.isBankFacility), (t) => t.principalUSD);
    const onBank = onBanks.get(c.id) ?? 0;
    if (Math.abs(onLadder - onBank) > Math.max(1e6, onLadder * 0.02)) { mismatch++; mismatchUSD += onLadder - onBank; }
  });
  if (orphanLoans) out.push({ family: 'O', check: 'O4 every loan has a live borrower', week, usd: orphanUSD, message: `${orphanLoans} bank loans (${B(orphanUSD)}) are to firms that are gone or dead` });
  if (mismatch) out.push({ family: 'O', check: 'O4 facilities on ladders = loans on banks', week, usd: mismatchUSD, message: `${mismatch} borrowers' facility tranches differ from the banks' loans by ${B(mismatchUSD)} net` });
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
  (state.marketIndexes ?? []).forEach((x) => { const w = sum(x.constituents, (c) => c.weight); if (x.constituents.length && Math.abs(w - 1) > 0.02) badIndex++; });
  if (badIndex) out.push({ family: 'O', check: 'O5 index weights sum to one', week, usd: badIndex, message: `${badIndex} indices' weights do not sum to one` });
  let deadShip = 0;
  const idOrTicker = (key: string) => tickers.get(key) ?? state.companies.find((c) => c.id === key);
  (state.goodsInTransit ?? []).forEach((g) => { const b = tickers.get(g.buyerTicker); if (!b || !isActiveCompany(b)) deadShip++; else if (!String(g.sellerKey).startsWith('PRIVATE') && !idOrTicker(String(g.sellerKey).replace(/^.*:/, ''))) deadShip++; });
  if (deadShip) out.push({ family: 'O', check: 'O5 shipments have live buyer and seller', week, usd: deadShip, message: `${deadShip} consignments in transit to or from a firm that is gone` });
  return out;
}

export function auditOwnership(state: GameState, week: number): AuditFinding[] {
  return [...o1(state, week), ...o2(state, week), ...o3(state, week), ...o4(state, week), ...o5(state, week)];
}
export type { RegionId };
