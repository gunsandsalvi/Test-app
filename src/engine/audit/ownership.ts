/** O — OWNERSHIP. Every asset has exactly one owner and every owner exists. */

import { GameState, RegionId } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, sum } from './types';
import { marketCapOf } from '../../domain/company';
import { ensureV2 } from '../../engine2/world';
import { AUDIT_BOOKS_TOLERANCE } from '../../domain/stated';
import { TR_FACILITY, TR_CP, TR_FLOATING, ladderRowsOf, issuerIdOf, isTrancheId, trancheRowOf } from '../../engine2/tranches';
import { materializeBook } from '../../engine2/holdings';
import { holdingClassOf } from '../../domain/assets';
import { materializeGovLadder } from '../../engine2/tranches';
import { isTrancheKind } from '../../domain/assets';
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
      if (t.isCommercialPaper) o.cp += t.principalLocal; else if (t.rateType === 'FIXED') o.corp += t.principalLocal; else o.loan += t.principalLocal;
    });
  });
  // Paper issued THIS week is in the auction (07c/07f place it next week, and what
  // they cannot place is withdrawn from the ladder); it is offered, not yet anyone's, and not
  // yet owed to nobody either. Everything older must have a holder.
  // §3.13-SOV row 2: the sovereign outstanding comes from the ONE store now.
  REGION_IDS.forEach((r) => { outstanding[r].sov = sum(materializeGovLadder(ensureV2(state), r).filter((t) => t.originationWeek < state.currentWeek), (t) => t.principalLocal); });
  // The VALUE, which is still the face: nothing marks credit yet (§9.13 part 3). When the mark
  // lands this must read `faceLocal` — a ladder carries face, and comparing a mark to it would
  // report every basis point of spread as paper that does not exist.
  const add = (h: { instrumentType: string; issuerRegion: string; quantityOrNotionalLocal?: number }) => {
    const b = held[h.issuerRegion]; if (!b) return; const v = h.quantityOrNotionalLocal ?? 0;
    if (h.instrumentType === 'CORP_BOND') b.corp += v; else if (h.instrumentType === 'LEVERAGED_LOAN') b.loan += v; else if (h.instrumentType === 'GOV_BOND') b.sov += v; else if (h.instrumentType === 'COMMERCIAL_PAPER') b.cp += v;
  };
  state.institutionalEntities.forEach((e) => { if (!e.isDefaulted) e.itemizedHoldings.forEach(add); });
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    ((c as unknown as { treasuryHoldings?: { instrumentType: string; issuerRegion: string; quantityOrNotionalLocal?: number }[] }).treasuryHoldings ?? []).forEach(add);
    const bs = c.bankBalanceSheet; if (!bs || c.isDefaulted) return;
    held[c.region].sov += sum(Object.values(bs.sovereignBondHoldingsByBond ?? {}), (v) => Number(v) || 0);
    (bs.dealerDeskInventory?.['commercial paper'] ?? []).forEach((p) => { held[c.region].cp += p.inventoryLocal; });
  });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r]; if (!reg) return;
    (reg.bankingSector.corpBondDealerInventory ?? []).forEach((p) => { held[r].corp += p.inventoryLocal; });
    (reg.bankingSector.loanDealerInventory ?? []).forEach((p) => { held[r].loan += p.inventoryLocal; });
    (reg.bankingSector.sovBondDealerInventory ?? []).forEach((p) => { held[r].sov += p.inventoryLocal; });
    held[r].sov += sum(Object.values(reg.centralBankSheet?.sovereignHoldingsByBond ?? {}), (v) => Number(v) || 0);
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
  let over = 0, overLocal = 0, capGap = 0, capN = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const hs = heldShares.get(c.id) ?? 0;
    if (c.sharesOutstanding > 0 && hs > c.sharesOutstanding * (1 + AUDIT_BOOKS_TOLERANCE)) { over++; overLocal += (hs - c.sharesOutstanding) * c.stockPrice; }
    if (c.stockPrice > 0 && c.sharesOutstanding > 0) { const cap = c.stockPrice * c.sharesOutstanding; if (Math.abs(cap - marketCapOf(c)) > cap * AUDIT_BOOKS_TOLERANCE) { capN++; capGap += Math.abs(cap - marketCapOf(c)); } }
  });
  if (over) out.push({ family: 'O', check: 'O2 shares held ≤ issued', week, usd: overLocal, message: `${over} firms have more shares on the register than they issued (${B(overLocal)} of phantom stock)` });
  if (capN) out.push({ family: 'O', check: 'O2 market cap = price × shares', week, usd: capGap, message: `${capN} firms' market cap differs from price × shares by ${B(capGap)} in all` });
  return out;
}

/** O3 — register integrity: every row names a live instrument and a live holder; nothing references an acquired firm. */
function o3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const live = new Map(state.companies.map((c) => [c.id, c]));
  const ent = new Map(state.institutionalEntities.map((e) => [e.id, e]));
  const v2o3 = ensureV2(state); // 13b: a row names a tranche or its issuer
  let orphan = 0, orphanLocal = 0, merged = 0, mergedLocal = 0, deadHolders = 0;
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) { if (e.itemizedHoldings.length) deadHolders++; return; }
    e.itemizedHoldings.forEach((h) => {
      const v = h.quantityOrNotionalLocal ?? 0;
      // §3.13-SOV row 3: a sovereign row names a bond on a GOVERNMENT's ladder, and this check
      // resolves an issuer against `state.companies`, where no government sits. O11 owns those
      // rows and holds them to the same standard against the government ladders. This used to be
      // a bare `instrumentType === 'GOV_BOND'` carve-out with nothing behind it.
      if (holdingClassOf(h.instrumentType) === 'SOVEREIGN') return;
      const c = live.get(issuerIdOf(v2o3, h.instrumentId));
      // 13b: a tranche's row is live only while the tranche is (retired paper on a book is an orphan).
      if (c && isTrancheId(v2o3, h.instrumentId) && trancheRowOf(v2o3, h.instrumentId) === undefined) { orphan++; orphanLocal += v; return; }
      if (c) { if (c.mergerAcquired) { merged++; mergedLocal += v; } return; }
      if (ent.get(h.instrumentId)) return;
      if (h.instrumentType === 'PE_FUND_INTEREST' || h.instrumentType === 'ETF_SHARE') return;
      orphan++; orphanLocal += v;
    });
  });
  if (orphan) out.push({ family: 'O', check: 'O3 register rows name a live instrument', week, usd: orphanLocal, message: `${orphan} rows (${B(orphanLocal)}) name an instrument that does not exist` });
  if (merged) out.push({ family: 'O', check: 'O3 no row on an acquired firm', week, usd: mergedLocal, message: `${merged} rows (${B(mergedLocal)}) still sit on firms a merger absorbed` });
  if (deadHolders) out.push({ family: 'O', check: 'O3 dead holders hold nothing', week, usd: deadHolders, message: `${deadHolders} defaulted funds still carry a book` });
  return out;
}

/** O4 — every facility has a live borrower and a live lender. The
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
  let orphanLoans = 0, orphanLocal = 0, lenderless = 0, lenderlessLocal = 0;
  for (let r = 0; r < S.used; r++) {
    if (!(S.flags[r] & TR_FACILITY) || S.bankRef[r] < 0 || S.issuerRef[r] < 0 || !(S.principalLocal[r] > 0.01)) continue;
    const c = byId.get(v2.internedStrings[S.issuerRef[r]]);
    if (!c || !(isActiveCompany(c) || openEstates.has(c.id))) { orphanLoans++; orphanLocal += S.principalLocal[r]; }
    const b = bankByTicker.get(v2.internedStrings[S.bankRef[r]]);
    if (!b || !b.bankBalanceSheet || !isActiveCompany(b)) { lenderless++; lenderlessLocal += S.principalLocal[r]; }
  }
  if (orphanLoans) out.push({ family: 'O', check: 'O4 every facility has a live borrower', week, usd: orphanLocal, message: `${orphanLoans} facilities (${B(orphanLocal)}) sit on the ladders of firms that are gone or dead with no open estate` });
  if (lenderless) out.push({ family: 'O', check: 'O4 every facility has a live lender', week, usd: lenderlessLocal, message: `${lenderless} facilities (${B(lenderlessLocal)}) name a lender that has no sheet` });
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
    for (const r of ladderRowsOf(v2, c.id)) { const k = kindOfFlags(S.flags[r]); if (k) add(issued, `${c.region}|${k}`, S.principalLocal[r]); }
  });
  const kindRefs = new Map(KINDS.map((k) => [v2.internedIdByString.get(k), k] as const));
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      const k = kindRefs.get(H.typeRef[r]); if (!k) continue;
      add(held, `${v2.internedStrings[H.regionRef[r]]}|${k}`, H.qtyLocal[r]);
    }
  });
  const DESK_BOOKS: Record<string, typeof KINDS[number]> = { 'corporate bond': 'CORP_BOND', 'leveraged loan': 'LEVERAGED_LOAN', 'commercial paper': 'COMMERCIAL_PAPER' };
  state.companies.forEach((b) => {
    const inv = b.bankBalanceSheet?.dealerDeskInventory; if (!inv || !isActiveCompany(b)) return;
    Object.entries(DESK_BOOKS).forEach(([book, k]) => (inv[book] ?? []).forEach((p) => add(held, `${b.region}|${k}`, p.inventoryLocal)));
  });
  const gaps: string[] = []; let gapLocal = 0;
  new Set([...issued.keys(), ...held.keys()]).forEach((key) => {
    const i = issued.get(key) ?? 0, h = held.get(key) ?? 0;
    if (Math.abs(h - i) > Math.max(1e7, i * AUDIT_BOOKS_TOLERANCE)) { gaps.push(`${key.replace('|', ' ')} held ${B(h)} of ${B(i)}`); gapLocal += h - i; }
  });
  if (gaps.length) out.push({ family: 'O', check: 'O6 corporate paper held = issued', week, usd: gapLocal, message: `${gaps.length} region-kinds' books differ from the ladders (${gaps.slice(0, 4).join(' | ')}${gaps.length > 4 ? ' | …' : ''})` });
  return out;
}

/**
 * O7 — NO TRANCHE IS CLAIMED BEYOND ITS FACE. The register's credit rows name a tranche; the
 * ladder says how much of that tranche exists. Holders cannot hold more of it than was issued.
 *
 * This was only ever discovered when an ESTATE opened on the issuer (`estate-resolution.ts`'s
 * register-versus-ladder guard), which crashes the run and only fires for a firm that happens to
 * die. Measured here every week for every issuer, it is a number instead of a landmine.
 * The tolerance is float dust on the sum actually accumulated — the claims are added one row at a
 * time, so it scales with the count of rows and the size of the face, never with a percentage
 * (rule 7).
 */
function o7(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const claimedByTranche = new Map<string, number>();
  const rowsByTranche = new Map<string, number>();
  state.institutionalEntities.forEach((e) => {
    materializeBook(v2, e.id).forEach((h) => {
      if (!isTrancheKind(h.instrumentType)) return;
      // The claim is FACE; when the mark lands this reads `faceLocal` (§9.13 part 3).
      const usd = h.quantityOrNotionalLocal ?? 0;
      if (!(usd > 0)) return;
      claimedByTranche.set(h.instrumentId, (claimedByTranche.get(h.instrumentId) ?? 0) + usd);
      rowsByTranche.set(h.instrumentId, (rowsByTranche.get(h.instrumentId) ?? 0) + 1);
    });
  });
  const faceById = new Map<string, number>();
  state.companies.forEach((c) => {
    (c.debtTranches ?? []).forEach((t) => faceById.set(t.id, (faceById.get(t.id) ?? 0) + t.principalLocal));
  });
  const over: [string, number][] = [];
  let overLocal = 0;
  claimedByTranche.forEach((claimedLocal, id) => {
    const faceLocal = faceById.get(id);
    // A row naming the ISSUER rather than a tranche has no single ladder row behind it; O6 owns
    // that comparison at the region-and-kind level.
    if (faceLocal === undefined) return;
    const dust = 1e-9 * Math.max(1, faceLocal, claimedLocal) * Math.max(1, rowsByTranche.get(id) ?? 1);
    if (claimedLocal - faceLocal > dust) { over.push([id, claimedLocal - faceLocal]); overLocal += claimedLocal - faceLocal; }
  });
  if (over.length) {
    over.sort((a, b) => b[1] - a[1]);
    out.push({ family: 'O', check: 'O7 no tranche is claimed beyond its face', week, usd: overLocal, message: `${over.length} tranches are claimed beyond what was issued, by ${B(overLocal)} in total (${over.slice(0, 3).map(([id, d]) => `${id} +${(d / 1e6).toFixed(3)}M`).join(' | ')}) — the register holds paper no ladder carries` });
  }
  return out;
}

/**
 * O8 — ONE THING, ONE KEY (rule 4, and the keying policy in §3 step 12).
 *
 * THE POLICY, stated once so a check can test it:
 *   · a COMPANY is its `id`; its `ticker` is a display name and a party address, never a key
 *     into a store;
 *   · an INSTITUTION is its `id`;
 *   · a PIECE OF PAPER is the instrument it is — a TRANCHE id for credit, the company id for
 *     equity, the TRANCHE id for a sovereign too, the fund's id for a fund share;
 *   · a GOOD is its sub-unit id, a CONTRACT its own id, and what a contract is ON is keyed the
 *     way that thing is keyed above.
 *
 * Every arm below is a place the policy is broken, counted rather than argued about. The desks
 * are the large one: the register keys credit by tranche and the desks key the same paper by the
 * issuer, because a credit book's clearing INSTRUMENT is the company (`dealer-desks.ts:104` keys
 * the book by `inst.id`, and 07b's instruments are `regionCompanies`). That is step 13's to
 * close; the rest are here to prove they are not also broken.
 */
function o8(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const companyIds = new Set(state.companies.map((c) => c.id));
  const tickers = new Set(state.companies.map((c) => c.ticker));
  const entityIds = new Set(state.institutionalEntities.map((e) => e.id));

  // 1. The desks' credit books against the register's key.
  const CREDIT_BOOKS = ['corporate bond', 'leveraged loan', 'commercial paper'];
  let issuerKeyed = 0, issuerKeyedLocal = 0, trancheKeyed = 0, trancheKeyedLocal = 0;
  state.companies.forEach((b) => {
    const inv = b.bankBalanceSheet?.dealerDeskInventory;
    if (!inv || !isActiveCompany(b)) return;
    CREDIT_BOOKS.forEach((book) => (inv[book] ?? []).forEach((p) => {
      if (isTrancheId(v2, p.instrumentId)) { trancheKeyed++; trancheKeyedLocal += p.inventoryLocal; }
      else { issuerKeyed++; issuerKeyedLocal += p.inventoryLocal; }
    }));
  });
  if (issuerKeyed > 0) {
    out.push({ family: 'O', check: 'O8 one thing, one key: the desks', week, usd: issuerKeyedLocal, message: `${issuerKeyed} desk credit positions worth ${B(issuerKeyedLocal)} are keyed by ISSUER where the register keys the same paper by TRANCHE (${trancheKeyed} worth ${B(trancheKeyedLocal)} name a tranche) — every desk-to-register move wires two names for one asset` });
  }

  // 2. A contract's parties and its reference resolve in the space each is supposed to be in.
  let deadParty = 0, deadRef = 0;
  (state.derivativesBook ?? []).forEach((c) => {
    ([c.a, c.b] as { kind: string; ticker?: string; id?: string }[]).forEach((p) => {
      const ok = p.kind === 'INSTITUTION' ? entityIds.has(p.id!) : tickers.has(p.ticker!);
      if (!ok) deadParty++;
    });
    // A CDS names the issuer it is written on by COMPANY ID; the futures and FX classes name a
    // commodity or a region, which are their own spaces and are not company keys.
    if (c.classId === 'CDS' && !companyIds.has(c.referenceId)) deadRef++;
  });
  if (deadParty > 0) out.push({ family: 'O', check: 'O8 one thing, one key: contract parties', week, usd: deadParty, message: `${deadParty} contract party references resolve to nothing — a ticker used where an id belongs, or the other way round` });
  if (deadRef > 0) out.push({ family: 'O', check: 'O8 one thing, one key: contract references', week, usd: deadRef, message: `${deadRef} CDS name a reference entity that is no company id — the credit is written on a key that resolves in no store` });

  // 3. Every register row's instrument id resolves in exactly one of the spaces the policy allows.
  let unresolvable = 0, unresolvableLocal = 0;
  // §3.13-SOV row 3: sovereign ids are TRANCHE ids in the same store, so `isTrancheId` answers
  // for them. The `/-GOV-/` escape hatch that used to sit here passed any id merely SHAPED like
  // government paper — the one id space this check could not actually check.
  state.institutionalEntities.forEach((e) => {
    materializeBook(v2, e.id).forEach((h) => {
      const id = h.instrumentId;
      const known = isTrancheId(v2, id) || companyIds.has(id) || entityIds.has(id);
      if (!known) { unresolvable++; unresolvableLocal += h.quantityOrNotionalLocal ?? 0; }
    });
  });
  if (unresolvable > 0) out.push({ family: 'O', check: 'O8 one thing, one key: register rows', week, usd: unresolvableLocal, message: `${unresolvable} register rows worth ${B(unresolvableLocal)} name an id that is no tranche, company or fund — a key that resolves in no store` });
  return out;
}

/** O5 — contracts, estates, indices, shipments: parties alive, claims bounded, weights whole. */
function o5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const tickers = new Map(state.companies.map((c) => [c.ticker, c]));
  const ents = new Map(state.institutionalEntities.map((e) => [e.id, e]));
  let deadParty = 0, deadLocal = 0;
  (state.derivativesBook ?? []).forEach((k) => {
    const alive = (p: { kind: string; ticker?: string; id?: string }) => p.kind === 'INSTITUTION' ? !!ents.get(p.id!) && !ents.get(p.id!)!.isDefaulted : !!tickers.get(p.ticker!) && isActiveCompany(tickers.get(p.ticker!)!);
    if (!alive(k.a as never) || !alive(k.b as never)) { deadParty++; deadLocal += k.notional; }
  });
  if (deadParty) out.push({ family: 'O', check: 'O5 contracts have two live parties', week, usd: deadLocal, message: `${deadParty} contracts (${B(deadLocal)}) have a dead or missing party` });
  let overRecovered = 0;
  (state.estates ?? []).forEach((e) => { e.claims.forEach((c) => { if (c.recoveredLocal > c.principalLocal * 1.001 + 1) overRecovered++; }); });
  if (overRecovered) out.push({ family: 'O', check: 'O5 recovered ≤ owed', week, usd: overRecovered, message: `${overRecovered} estate claims recovered more than they were owed` });
  let badIndex = 0;
  (state.marketIndexes ?? []).forEach((x) => { const w = sum(x.constituents, (c) => c.weight); if (x.constituents.length && Math.abs(w - 1) > AUDIT_BOOKS_TOLERANCE) badIndex++; });
  if (badIndex) out.push({ family: 'O', check: 'O5 index weights sum to one', week, usd: badIndex, message: `${badIndex} indices' weights do not sum to one` });
  // The two halves are counted apart, because they are not the same finding. A dead BUYER is a
  // consignment that will be scrapped on arrival rather than landed on nobody, so what it
  // measures is how long the model carries goods for a consignee that cannot take them. A dead
  // SELLER is a shipment that is perfectly deliverable — the goods left before the firm died and
  // the live buyer will receive them — so a count there is a question about the check.
  let deadBuyerShip = 0, deadSellerShip = 0;
  const idOrTicker = (key: string) => tickers.get(key) ?? state.companies.find((c) => c.id === key);
  // A dead buyer with an OPEN estate still takes delivery — the receiver liquidates it.
  const openEstates = new Set((state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  const estateOf = new Map((state.estates ?? []).map((e) => [e.companyId, e]));
  const why = new Map<string, number>();
  const bump = (k: string) => why.set(k, (why.get(k) ?? 0) + 1);
  (state.goodsInTransit ?? []).forEach((g) => {
    const b = tickers.get(g.buyerTicker);
    if (!b || !(isActiveCompany(b) || openEstates.has(b.id))) {
      deadBuyerShip++;
      const landed = g.arrivalWeek <= week ? 'landed' : 'afloat';
      if (!b) bump(`not in companies/${landed}`);
      else if (b.mergerAcquired) bump(`merger-acquired/${landed}`);
      else if (b.isBankEntity) bump(`bank/${landed}`);
      else if (estateOf.get(b.id)?.closedWeek !== undefined) bump(`estate closed/${landed}`);
      else if (estateOf.has(b.id)) bump(`estate still open/${landed}`);
      else bump(`dead, no estate opened/${landed}`);
      return;
    }
    if (!String(g.sellerKey).startsWith('PRIVATE') && !idOrTicker(String(g.sellerKey).replace(/^.*:/, ''))) deadSellerShip++;
  });
  const deadShip = deadBuyerShip + deadSellerShip;
  const breakdown = [...why.entries()].sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  if (deadShip) out.push({ family: 'O', check: 'O5 shipments have live buyer and seller', week, usd: deadShip, message: `${deadShip} consignments in transit to or from a firm that is gone (${deadBuyerShip} to a dead buyer${breakdown ? `: ${breakdown}` : ''}; ${deadSellerShip} from a dead seller)` });
  return out;
}

export function auditOwnership(state: GameState, week: number): AuditFinding[] {
  return [...o1(state, week), ...o2(state, week), ...o3(state, week), ...o4(state, week), ...o5(state, week), ...o6(state, week), ...o7(state, week), ...o8(state, week), ...o9(state, week), ...o10(state, week), ...o11(state, week)];
}
export type { RegionId };

/**
 * O9 / O10 — §3.37-ZEROSUM. THE TWO-SIDEDNESS OF THE CLAIMS THAT ARE NOT HOLDINGS.
 *
 * `Σ held = issued` (O1, O6) proves the register. Two whole classes of claim never go through the
 * register and had no equivalent proof:
 *
 * O9 — A DERIVATIVE IS AN ASSET TO ONE PARTY AND A LIABILITY TO THE OTHER, ALWAYS
 * (`docs/instruments/derivative.md` D1.b). It is the invariant that distinguishes a derivative
 * from a security, and it was unchecked. Walking the parties rather than the contracts is the
 * point: a contract booked onto one side only, or onto the same party twice, nets to zero when
 * you sum the contracts and does not when you sum the parties.
 * It also reports the notional whose class NEVER MARKS — `markToMarketUSDToA` returns null for
 * CDS and IRS, so their value moves and never becomes cash, and there is nothing for the zero-sum
 * to be about. That is a real gap (D8, and `the-derivative-layer.md` D2), not a passing check.
 *
 * O10 — A RECEIVABLE IS SOMEBODY'S PAYABLE (`trade-credit.md` A1, C4). One line, and the cheapest
 * possible proof that trade credit is two-sided at all.
 */
function o9(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const book = state.derivativesBook ?? [];
  const markByParty = new Map<string, number>();
  const keyOf = (p: { kind: string; ticker?: string; id?: string }): string => `${p.kind}:${p.ticker ?? p.id ?? '?'}`;
  let unmarkedNotionalLocal = 0, unmarkedN = 0, selfFaced = 0;
  book.forEach((c) => {
    const a = keyOf(c.a as never), b = keyOf(c.b as never);
    if (a === b) selfFaced++;
    if (c.settledMarkLocal === undefined) { unmarkedN++; unmarkedNotionalLocal += c.notional; return; }
    markByParty.set(a, (markByParty.get(a) ?? 0) + c.settledMarkLocal);
    markByParty.set(b, (markByParty.get(b) ?? 0) - c.settledMarkLocal);
  });
  let net = 0, grossLocal = 0;
  markByParty.forEach((v) => { net += v; grossLocal += Math.abs(v); });
  if (Math.abs(net) > 1e3) {
    out.push({ family: 'O', check: 'O9 derivative marks net to zero across parties', week, usd: net,
      message: `the parties' derivative marks sum to ${B(net)} rather than zero on ${B(grossLocal)} gross — a contract booked to one side only, or to the same party twice` });
  }
  if (selfFaced > 0) {
    out.push({ family: 'O', check: 'O9 no contract faces itself', week, usd: selfFaced,
      message: `${selfFaced} contracts name the same party on both sides — a position that cannot lose` });
  }
  if (unmarkedN > 0) {
    out.push({ family: 'O', check: 'O9 every derivative carries a mark', week, usd: unmarkedNotionalLocal,
      message: `${unmarkedN} live contracts on ${B(unmarkedNotionalLocal)} of notional carry no mark at all (CDS and IRS return null from markToMarketUSDToA) — their value moves and never becomes cash, so no variation margin passes and no counterparty exposure is measured` });
  }
  return out;
}

function o10(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  let receivableLocal = 0, payableLocal = 0, filed = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const bs = c.historicalFundamentals?.[c.historicalFundamentals.length - 1]?.balanceSheet;
    if (!bs) return;
    filed++;
    receivableLocal += bs.accountsReceivable ?? 0;
    payableLocal += bs.accountsPayable ?? 0;
  });
  const gap = receivableLocal - payableLocal;
  if (filed > 0 && Math.abs(gap) > 1e6) {
    out.push({ family: 'O', check: 'O10 every receivable is somebody\'s payable', week, usd: gap,
      message: `${filed} firms file ${B(receivableLocal)} of receivables against ${B(payableLocal)} of payables — a ${B(gap)} claim on nobody (a receivable names no debtor and a payable names no creditor, so neither is a two-sided claim)` });
  }
  return out;
}

/**
 * O11 — §3.13-SOV row 3. EVERY SOVEREIGN HOLDING NAMES A BOND.
 *
 * A corporate bond's holder is a register row naming a TRANCHE, and `O6`/`O7`/`O8` hold that to
 * account. A government bond's holder used to be one of four stores keyed by a TENOR BUCKET —
 * banks', the central bank's, the desks' and the institutional register's — and a bucket is not an
 * instrument: no issue date, no coupon of its own, no maturity. **You could not ask who held a
 * given government bond**, and the clearest evidence it was a hole rather than a style sat in this
 * file: `o3` opened with `if (h.instrumentType === 'GOV_BOND') return;`, carving out exactly the
 * asset class that had no instrument to be checked against.
 *
 * Now every store keys by bond id, so this check is the invariant rather than the measurement: a
 * holding whose id is on no ladder is a claim on paper that does not exist. It counts all four
 * stores, because the whole point of row 3 is that they speak ONE id space.
 */
function o11(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const live = new Set<string>();
  REGION_IDS.forEach((r) => materializeGovLadder(v2, r).forEach((tr) => live.add(tr.id)));
  let strayLocal = 0, strayRows = 0;
  const examples: string[] = [];
  const check = (id: string, usd: number, where: string) => {
    if (!(usd > 0) || live.has(id)) return;
    strayLocal += usd; strayRows++;
    if (examples.length < 3) examples.push(`${where} ${id} ${B(usd)}`);
  };
  state.companies.forEach((c) => {
    if (!isActiveCompany(c) || !c.bankBalanceSheet) return;
    Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByBond ?? {})
      .forEach(([id, v]) => check(id, Number(v) || 0, `bank ${c.ticker}`));
  });
  REGION_IDS.forEach((r) => {
    Object.entries(state.regions[r]?.centralBankSheet?.sovereignHoldingsByBond ?? {})
      .forEach(([id, v]) => check(id, Number(v) || 0, `CB ${r}`));
    (state.regions[r]?.bankingSector?.sovBondDealerInventory ?? [])
      .forEach((pos) => check(pos.bondId, Math.abs(pos.inventoryLocal || 0), `desk ${r}`));
  });
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    // The registry says which kinds are sovereign; asking it rather than naming one also catches
    // SOV_BOND, which is the same instrument under the model's other name for it.
    materializeBook(v2, e.id).forEach((h) => {
      if (holdingClassOf(h.instrumentType) !== 'SOVEREIGN') return;
      check(h.instrumentId, h.quantityOrNotionalLocal ?? 0, `register ${e.id}`);
    });
  });
  if (strayRows > 0) {
    out.push({ family: 'O', check: 'O11 a sovereign holding names a bond', week, usd: strayLocal,
      message: `${strayRows} sovereign positions worth ${B(strayLocal)} name an id no government ladder carries (${examples.join(' | ')}) — a claim on paper that does not exist` });
  }
  return out;
}
