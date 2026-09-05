/** O — OWNERSHIP. Every asset has exactly one owner and every owner exists. */

import { GameState, RegionId } from '../../types';
import { derivativesOf, repoBookOf, primeBrokerageBookOf, tradeInvoicesOf, liveObligationPartiesOf, securityLoanBookOf, ccpSheetAt } from '../ledger/contract-ledger';
import { accountKey } from '../ledger/accounts';
import { ccpOwnCapitalLocal } from '../../domain/clearing-house';
import type { CurrencyCode } from '../../domain/geography';
import { deskRowsOf } from '../desk-register';
import { issuedSharesOf } from '../../engine2/instruments';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, sum, floatDust, floatDustLocal } from './types';
import { ensureV2, entityOf, regionOf, typeRefOf } from '../../engine2/world';
import { TR_FACILITY, TR_CP, TR_FLOATING, ladderRowsOf, issuerIdOf, isTrancheId, trancheRowOf, trancheKindOfRow, trancheIdOf } from '../../engine2/tranches';
import { materializeBook, instrumentIdAt, rowUnits, rowLotUnits } from '../../engine2/holdings';
import { householdBookId } from '../ledger/holdings-ledger';
import { EntityIndex, buildEntityIndex } from '../ledger/entity-index';
import { sovereignHeldByClass, forEachSovereignPosition, lienFaceByBond } from '../sovereign-register';
import { PLEDGE_ROUNDING_TOLERANCE_LOCAL } from '../../domain/collateral';
import { holdingClassOf } from '../../domain/assets';
import { materializeGovLadder } from '../../engine2/tranches';
import { isTrancheKind } from '../../domain/assets';
import { bookHeadOf } from '../../engine2/holdings';
import { equityIssuerId } from '../../domain/instrument-keys';
import { asEntityId, asTicker } from '../../domain/ids';
import { assertNever } from '../../domain/defect';
import { partyFromKey } from '../ledger/party';
import type { PartyRef } from '../../domain/party';
import type { EntityId, InstrumentId } from '../../domain/ids';

/** Which of O1's four buckets a ladder row falls in. `BANK_FACILITY` is absent, not zero: it is
 *  on the lending bank's loan book and O4 is the check that tests it there. */
const O1_BUCKET_BY_TRANCHE_KIND: Partial<Record<
  ReturnType<typeof trancheKindOfRow>, 'corp' | 'loan' | 'cp'
>> = { CORP_BOND: 'corp', LEVERAGED_LOAN: 'loan', COMMERCIAL_PAPER: 'cp' };

/**
 * §3.13-BOOK (c-then-1) — THE AUDIT'S PARTY INDEX: THE ONE BUILDER, MEMOISED ON THE STATE.
 *
 * §3.13-READ D9 found `o1`, `o3`, `o4` and `o5` each building their own company-by-id,
 * company-by-ticker and entity-by-id maps — nine index builds over the same two arrays in one
 * pass — and memoised them here. The SHAPE is now `ledger/entity-index.ts`, shared with the
 * engine; what stays here is the memo, because this is the one place a memo is sound: the audit
 * runs at the close over a world no stage is still writing, and `auditWeek` is handed a fresh
 * state object each week. See `entity-index.ts` for why the engine's own is not cached.
 */
const AUDIT_PARTY_INDEX = new WeakMap<GameState, EntityIndex>();
function partyIndexOfState(state: GameState): EntityIndex {
  const hit = AUDIT_PARTY_INDEX.get(state);
  if (hit) return hit;
  const index = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
  AUDIT_PARTY_INDEX.set(state, index);
  return index;
}

/** One region's debt books, by class, in FACE. */
type OwnershipBook = { corp: number; loan: number; sov: number; cp: number };

/**
 * §3.13-READ A9/A10/A11 — WHAT IS HELD AND WHAT IS OUTSTANDING, of every debt class, by the
 * ISSUER's region, and the only walk that answers it.
 *
 * O1's measurement is extracted here because the harness carried a second copy of it that had
 * rotted apart on four separate counts, and every one of them made the harness's answer the wrong
 * one: it summed the row's MONEY where this reads its FACE (so every basis point of credit spread
 * was reported as paper that does not exist, the moment credit stopped printing at par); it added
 * the register's `GOV_BOND` rows AND the banks' own sovereign books, double-counting the overlap;
 * it counted paper issued THIS week, which is still in the auction and is nobody's yet; and it
 * tested one side only, so "paper with no owner" could not fail. It also had no `isBankFacility`
 * guard, so drawn facilities — which O4 tests on the lender's book — landed in the corporate and
 * loan buckets as well.
 *
 * The sovereign arm is `sovereignHeldByClass`, which is the ONE walk over the four stores a
 * government holding can sit in. The harness open-coded it twice and reached three of them.
 */
export function ownershipCoverage(
  state: GameState
): { held: Record<string, OwnershipBook>; outstanding: Record<string, OwnershipBook>; terms: Record<string, OwnershipBook> } {
  type Book = OwnershipBook;
  const held: Record<string, Book> = {}; const outstanding: Record<string, Book> = {};
  /** §3.27-i: how many terms each side's sum added — what its float dust is derived from. */
  const terms: Record<string, Book> = {};
  REGION_IDS.forEach((r) => { held[r] = { corp: 0, loan: 0, sov: 0, cp: 0 }; outstanding[r] = { corp: 0, loan: 0, sov: 0, cp: 0 }; terms[r] = { corp: 0, loan: 0, sov: 0, cp: 0 }; });
  const v2o1 = ensureV2(state);
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    const o = outstanding[c.region]; if (!o) return;
    // §3.13-READ C5: THE LADDER STORE, and the kind rule read from `trancheKindOfRow` rather
    // than open-coded a twelfth time. `debtTranches` is only refreshed at `core.ts:450`, so the
    // object read was correct here (the audit runs at the close) but was a rule-4 duplicate of
    // the rows the check's other side already walks.
    for (const r of ladderRowsOf(v2o1, c.id)) {
      // A facility has no bucket here on purpose: it sits on a bank's loan book and O4 tests it
      // there. Keyed rather than switched, so this stays one statement of the mapping and adds
      // no literal comparison against an instrument type (`check-hygiene.sh`'s ratchet).
      const bucket = O1_BUCKET_BY_TRANCHE_KIND[trancheKindOfRow(v2o1, r)];
      if (bucket) { o[bucket] += v2o1.tranches.principalLocal[r]; terms[c.region][bucket]++; }
    }
  });
  // Paper issued THIS week is in the auction (07c/07f place it next week, and what
  // they cannot place is withdrawn from the ladder); it is offered, not yet anyone's, and not
  // yet owed to nobody either. Everything older must have a holder.
  // §3.13-SOV row 2: the sovereign outstanding comes from the ONE store now.
  REGION_IDS.forEach((r) => { const rungs = materializeGovLadder(ensureV2(state), r).filter((t) => t.originationWeek < state.currentWeek); outstanding[r].sov = sum(rungs, (t) => t.principalLocal); terms[r].sov += rungs.length; });
  // §9.13-CREDIT row 5 — THE FACE, BECAUSE A LADDER CARRIES FACE. This read the row's money,
  // which was the same number only while nothing marked credit; comparing a mark to a ladder
  // reports every basis point of spread as paper that does not exist. `units` is the face.
  const add = (h: { instrumentType: string; issuerRegion: string; units?: number; quantityOrNotionalLocal?: number }) => {
    const b = held[h.issuerRegion]; if (!b) return; const v = h.units ?? h.quantityOrNotionalLocal ?? 0;
    // GOV_BOND is deliberately absent: the sovereign arm is one walk over all four stores below
    // (§9.13-OUTSIDE), and adding the register's rows here as well would count them twice.
    const n = terms[h.issuerRegion];
    if (h.instrumentType === 'CORP_BOND') { b.corp += v; n.corp++; } else if (h.instrumentType === 'LEVERAGED_LOAN') { b.loan += v; n.loan++; } else if (h.instrumentType === 'COMMERCIAL_PAPER') { b.cp += v; n.cp++; }
  };
  state.institutionalEntities.forEach((e) => { if (!e.isDefaulted) materializeBook(v2o1, e.id).forEach(add); });
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    // §3.13-BOOK d3c: a company's own book is its register rows (bills today; `add` keeps its
    // credit kinds, so a treasury that ever held corporate paper would count here).
    materializeBook(v2o1, c.id).forEach(add);
    const bs = c.bankBalanceSheet; if (!bs || c.isDefaulted) return;
    // §9.13-CREDIT row 5 — THE DESKS, READ OFF THE BANKS THAT CARRY THEM. This used to take the
    // three REGIONAL arrays, a derived roll-up (deleted, §3.13-BOOK d3e) that kept only the
    // money — so the check read one representation for the corporate books and another for CP,
    // and neither could report a face. A desk carries its book AT MARKET, so its face is `units`,
    // and O6 has always read the per-bank books; now both sides of the O family agree.
    // §3.13-BOOK d3d: the desk's rows, off the register, in face.
    const deskFace = (kind: string): number => { const rows = deskRowsOf(v2o1, c.id, kind); terms[c.region][kind === 'COMMERCIAL_PAPER' ? 'cp' : kind === 'CORP_BOND' ? 'corp' : 'loan'] += rows.length; return rows.reduce((a, p) => a + p.units, 0); };
    held[c.region].cp += deskFace('COMMERCIAL_PAPER');
    held[c.region].corp += deskFace('CORP_BOND');
    held[c.region].loan += deskFace('LEVERAGED_LOAN');
  });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r]; if (!reg) return;
    // §9.13-OUTSIDE: the sovereign side is ONE walk over the four stores a government holding can
    // sit in (`engine/sovereign-register.ts`) — the register (institutions and households), the
    // banks' own books, their desks and the central bank. This check enumerated three of them in
    // three different places and read the register's rows for a fourth.
    const sovByClass = sovereignHeldByClass(ensureV2(state), state, r);
    held[r].sov = sovByClass.REGISTER + sovByClass.BANK + sovByClass.DESK
      + sovByClass.CENTRAL_BANK + sovByClass.TREASURY;
    terms[r].sov += state.institutionalEntities.length + state.companies.length + 5;
    // §3.13-BOOK (c-then-2): a `regionById` map over every company stood here, kept alive only by
    // a `void` to silence the linter — a full index build every audit pass, read by nothing. The
    // sovereign walk above answers by region already. Deleted.
  });
  return { held, outstanding, terms };
}

/** O1 — two-sided: what the books hold of each debt class equals what is outstanding, in both directions. */
function o1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const { held, outstanding, terms } = ownershipCoverage(state);
  REGION_IDS.forEach((r) => {
    (['corp', 'loan', 'sov', 'cp'] as const).forEach((k) => {
      const h = held[r][k], o = outstanding[r][k];
      if (o <= 0 && h <= 0) return;
      if (Math.abs(h - o) > floatDustLocal(Math.abs(h) + Math.abs(o), terms[r][k])) out.push({ family: 'O', check: `O1 ${k === 'corp' ? 'bonds' : k === 'loan' ? 'loans' : k === 'sov' ? 'sovereign' : 'paper'} held = outstanding`, week, usd: h - o, message: `${r}: books hold ${B(h)} of ${B(o)} outstanding (${pct(o > 0 ? h / o - 1 : 0)}) — ${h > o ? 'a ledger mints claims' : 'paper with no owner'}` });
    });
  });
  return out;
}

/** O2 — shares: the register's count never exceeds the issue. */
function o2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const heldShares = new Map<string, number>();
  const heldRows = new Map<string, number>(); // §3.27-i: the terms each issuer's sum added
  const v2o2r = ensureV2(state); // §3.13-READ C5: the rows, not the week-end mirror of them
  state.institutionalEntities.forEach((e) => { if (e.isDefaulted) return; materializeBook(v2o2r, e.id).forEach((h) => { if (h.instrumentType === 'EQUITY' && h.quantityShares) { heldRows.set(h.instrumentId, (heldRows.get(h.instrumentId) ?? 0) + 1); } if (h.instrumentType === 'EQUITY' && h.quantityShares) heldShares.set(h.instrumentId, (heldShares.get(h.instrumentId) ?? 0) + h.quantityShares); }); });
  // §9.13-EQUITY — AND THE HOUSEHOLD SECTOR'S BOOK, which holds most of the register's shares and
  // has no object array to walk (the rows are its only representation). Counting the institutions
  // alone made this check a comparison of a fraction of the register against the whole issue, so
  // "the register's count never exceeds the issue" could not fail however far the register drifted
  // — and the household half was where the drift used to be absorbed, silently, as a residual.
  {
    const v2o2 = ensureV2(state);
    const H = v2o2.holdings;
    const equityRef = typeRefOf(v2o2, 'EQUITY');
    if (equityRef >= 0) {
      REGION_IDS.forEach((region) => {
        for (let r = bookHeadOf(v2o2, householdBookId(region)); r >= 0; r = H.next[r]) {
          if (H.typeRef[r] !== equityRef || Number.isNaN(H.shares[r])) continue;
          const id = instrumentIdAt(v2o2, r);
          heldShares.set(id, (heldShares.get(id) ?? 0) + H.shares[r]);
          heldRows.set(id, (heldRows.get(id) ?? 0) + 1);
        }
      });
    }
  }
  let over = 0, overLocal = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const hs = heldShares.get(c.id) ?? 0;
    // §3.13-BOOK dIV: the issued side is the instrument index's count — B2's real issued amount.
    const issued = issuedSharesOf(v2o2r, c.id);
    if (issued > 0 && hs - issued > floatDust(hs + issued, heldRows.get(c.id) ?? 1)) { over++; overLocal += (hs - issued) * c.stockPrice; }
  });
  if (over) out.push({ family: 'O', check: 'O2 shares held ≤ issued', week, usd: overLocal, message: `${over} firms have more shares on the register than they issued (${B(overLocal)} of phantom stock)` });
  return out;
}

/** O3 — register integrity: every row names a live instrument and a live holder; nothing references an acquired firm. */
function o3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const { companyById: live, institutionById: ent } = partyIndexOfState(state);
  const v2o3 = ensureV2(state); // 13b: a row names a tranche or its issuer
  let orphan = 0, orphanLocal = 0, merged = 0, mergedLocal = 0, deadHolders = 0;
  state.institutionalEntities.forEach((e) => {
    const book = materializeBook(v2o3, e.id); // §3.13-READ C5: the rows
    if (e.isDefaulted) { if (book.length) deadHolders++; return; }
    book.forEach((h) => {
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
      // §3.13-BOOK dIII: a fund's share names its FUND on the instrument index, and a share
      // whose fund is gone is an orphan — the one this check used to exempt by type
      // (`the-register.md` A1.b), because the crossing was a cast of the id and nothing could
      // say whether the entity it named was a fund that had ever existed.
      if (ent.get(issuerIdOf(v2o3, h.instrumentId))) return;
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
  const { companyById: byId } = partyIndexOfState(state);
  const bankById = new Map(state.companies.filter((c) => c.isBankEntity).map((c) => [c.id, c]));
  const openEstates = new Set((state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  let orphanLoans = 0, orphanLocal = 0, lenderless = 0, lenderlessLocal = 0;
  for (let r = 0; r < S.used; r++) {
    if (!(S.flags[r] & TR_FACILITY) || S.bankRef[r] < 0 || S.issuerRef[r] < 0 || !(S.principalLocal[r] > 0.01)) continue;
    const c = byId.get(entityOf(v2, S.issuerRef[r]));
    if (!c || !(isActiveCompany(c) || openEstates.has(c.id))) { orphanLoans++; orphanLocal += S.principalLocal[r]; }
    const b = bankById.get(entityOf(v2, S.bankRef[r]));
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
  const termsByKey = new Map<string, number>(); // §3.27-i: what each key's sums added
  const add = (m: Map<string, number>, k: string, v: number) => { m.set(k, (m.get(k) ?? 0) + v); termsByKey.set(k, (termsByKey.get(k) ?? 0) + 1); };
  state.companies.forEach((c) => {
    if (c.mergerAcquired) return;
    for (const r of ladderRowsOf(v2, c.id)) { const k = kindOfFlags(S.flags[r]); if (k) add(issued, `${c.region}|${k}`, S.principalLocal[r]); }
  });
  const kindRefs = new Map(KINDS.map((k) => [typeRefOf(v2, k), k] as const));
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      const k = kindRefs.get(H.typeRef[r]); if (!k) continue;
      // The ladders below carry FACE; `units` is the register's own.
      add(held, `${regionOf(v2, H.regionRef[r])}|${k}`, rowUnits(H, r));
    }
  });
  const DESK_KINDS: readonly (typeof KINDS[number])[] = ['CORP_BOND', 'LEVERAGED_LOAN', 'COMMERCIAL_PAPER'];
  state.companies.forEach((b) => {
    if (!b.bankBalanceSheet || !isActiveCompany(b)) return;
    // §3.13-BOOK d3d: the desk's rows, off the register, in face.
    DESK_KINDS.forEach((k) => deskRowsOf(v2, b.id, k).forEach((p) => add(held, `${b.region}|${k}`, p.units)));
  });
  const gaps: string[] = []; let gapLocal = 0;
  new Set([...issued.keys(), ...held.keys()]).forEach((key) => {
    const i = issued.get(key) ?? 0, h = held.get(key) ?? 0;
    if (Math.abs(h - i) > floatDustLocal(Math.abs(h) + Math.abs(i), termsByKey.get(key) ?? 1)) { gaps.push(`${key.replace('|', ' ')} held ${B(h)} of ${B(i)}`); gapLocal += h - i; }
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
      // The claim is FACE, and `units` is where the register keeps it (§9.13-CREDIT row 5).
      const usd = h.units;
      if (!(usd > 0)) return;
      claimedByTranche.set(h.instrumentId, (claimedByTranche.get(h.instrumentId) ?? 0) + usd);
      rowsByTranche.set(h.instrumentId, (rowsByTranche.get(h.instrumentId) ?? 0) + 1);
    });
  });
  // §3.13-READ C5: the ladder store — the same rows this check's held side is measured against.
  const v2f = ensureV2(state);
  const faceById = new Map<string, number>();
  state.companies.forEach((c) => {
    for (const r of ladderRowsOf(v2f, c.id)) {
      const id = trancheIdOf(v2f, r);
      faceById.set(id, (faceById.get(id) ?? 0) + v2f.tranches.principalLocal[r]);
    }
  });
  const over: [string, number][] = [];
  let overLocal = 0;
  claimedByTranche.forEach((claimedLocal, id) => {
    const faceLocal = faceById.get(id);
    // A row naming the ISSUER rather than a tranche has no single ladder row behind it; O6 owns
    // that comparison at the region-and-kind level.
    if (faceLocal === undefined) return;
    const dust = floatDustLocal(faceLocal + claimedLocal, (rowsByTranche.get(id) ?? 1) + 1); // rule 7: the arithmetic's own error, no more
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
 * Every arm below is a place the policy could be broken, counted rather than argued about. The
 * desks used to be the large one — the register keyed credit by tranche and the desks keyed the
 * same paper by the issuer, because a credit book's clearing INSTRUMENT was the company — and
 * §9.13-CREDIT rows 1, 3 and 4 closed it by making every credit book price the PAPER. The arm
 * stays, because a check that only exists while it fires proves nothing about the week it does
 * not.
 */
function o8(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const companyIds = new Set(state.companies.map((c) => c.id));
  const entityIds = new Set(state.institutionalEntities.map((e) => e.id));

  // 1. The desks' credit books against the register's key.
  const CREDIT_KINDS = ['CORP_BOND', 'LEVERAGED_LOAN', 'COMMERCIAL_PAPER'];
  let issuerKeyed = 0, issuerKeyedLocal = 0, trancheKeyed = 0, trancheKeyedLocal = 0;
  state.companies.forEach((b) => {
    if (!b.bankBalanceSheet || !isActiveCompany(b)) return;
    // §3.13-BOOK d3d: the desk's rows, off the register.
    CREDIT_KINDS.forEach((k) => deskRowsOf(v2, b.id, k).forEach((p) => {
      if (isTrancheId(v2, p.instrumentId)) { trancheKeyed++; trancheKeyedLocal += p.inventoryLocal; }
      else { issuerKeyed++; issuerKeyedLocal += p.inventoryLocal; }
    }));
  });
  if (issuerKeyed > 0) {
    out.push({ family: 'O', check: 'O8 one thing, one key: the desks', week, usd: issuerKeyedLocal, message: `${issuerKeyed} desk credit positions worth ${B(issuerKeyedLocal)} are keyed by ISSUER where the register keys the same paper by TRANCHE (${trancheKeyed} worth ${B(trancheKeyedLocal)} name a tranche) — every desk-to-register move wires two names for one asset` });
  }

  // 2. EVERY PARTY-KEYED STORE names parties that exist — §3.13-BOOK (c-then-4).
  //
  // This arm read the derivatives book alone, and after (c-then-3b) it read it WRONG: it took
  // `p.ticker` off arms that no longer carry one, through a structural cast the compiler could
  // not see into, so every firm party would have counted as dead. `the-register.md` D2's finding
  // was exactly that nothing else was being looked at. One resolver now — a `PartyRef` is a VIEW
  // of the entity store, so "does this party exist" is one lookup per arm — walked over every
  // store that names a party: the derivative book, the repo book, the prime-brokerage lines, the
  // estates' claims, the trade invoices, the consignments, the two accrual ledgers, and the
  // account store's own party table. Each is counted on its own line, because a dead party in a
  // repo contract and a dead party in an accrual ledger are different failures with different
  // owners.
  const { companyById, institutionById } = partyIndexOfState(state);
  const regions = new Set<string>(REGION_IDS);
  const partyExists = (ref: PartyRef): boolean => {
    switch (ref.kind) {
      case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': return companyById.has(ref.id);
      case 'INSTITUTION': return institutionById.has(ref.id);
      case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': case 'CCP': return regions.has(ref.region);
      default: return assertNever(ref, 'o8.partyExists');
    }
  };
  const entityExists = (id: EntityId): boolean => companyById.has(id) || institutionById.has(id);
  const dead = new Map<string, number>();
  const bump = (store: string) => dead.set(store, (dead.get(store) ?? 0) + 1);

  let deadRef = 0;
  derivativesOf(ensureV2(state)).forEach((c) => {
    if (!partyExists(c.a)) bump('derivative contracts');
    if (!partyExists(c.b)) bump('derivative contracts');
    // §3.13-BOOK dIIb: a reference is typed by class — only the issuer arm names a company.
    if ((c.reference.kind === 'ISSUER' || c.reference.kind === 'SHARES') && !companyById.has(c.reference.issuerId)) deadRef++;
  });
  REGION_IDS.forEach((r) => {
    repoBookOf(ensureV2(state), r).forEach((c) => { // §3.13-BOOK d4c-ii: the store's rows
      if (!entityExists(c.borrowerId)) bump('repo borrowers');
      if (!partyExists(c.lender)) bump('repo lenders'); // §3.13-BOOK d4a: the window is a party with a region
    });
    // §3.13-BOOK d4c-iv: the store's rows.
    primeBrokerageBookOf(ensureV2(state), r).forEach((l) => {
      if (!companyById.has(l.brokerId)) bump('prime-brokerage brokers');
      if (!institutionById.has(asEntityId(l.fundId))) bump('prime-brokerage funds');
    });
  });
  (state.estates ?? []).forEach((e) => e.claims.forEach((cl) => { if (!partyExists(cl.holder)) bump('estate claim holders'); }));
  tradeInvoicesOf(ensureV2(state)).forEach((inv) => {
    if (!entityExists(inv.buyerId)) bump('invoice buyers');
    if (!entityExists(inv.sellerId)) bump('invoice sellers');
  });
  (state.goodsInTransit ?? []).forEach((sh) => {
    if (!entityExists(sh.buyerId)) bump('consignment buyers');
    if (sh.carrierId !== undefined && !companyById.has(sh.carrierId)) bump('consignment carriers');
  });
  // §3.13-BOOK f4a: corporate accrued interest is a column of the register row it accrues on —
  // its holder is the row's book, which O3 and O14 hold to account; nothing to check here.
  // The account store's own party table: every key it ever interned is a party that exists.
  // (A resolved bank keeps its rows until the merger's `moveBankReserves` empties them, so this is
  // the arm that will fire on a re-key that missed the ledger — the failure `rekeyBankLinks`
  // exists to prevent.)
  v2.refs.partyKeys.strings.forEach((k) => {
    const ref = partyFromKey(k);
    if (ref === undefined || !partyExists(ref)) bump('account-store parties');
  });

  dead.forEach((n, store) => {
    out.push({ family: 'O', check: `O8 one thing, one key: ${store}`, week, usd: n, message: `${n} party references in ${store} resolve to no entity, region or bank — a key that resolves in no store` });
  });
  if (deadRef > 0) out.push({ family: 'O', check: 'O8 one thing, one key: contract references', week, usd: deadRef, message: `${deadRef} CDS name a reference entity that is no company id — the credit is written on a key that resolves in no store` });

  // 3. Every register row's instrument id resolves in exactly one of the spaces the policy allows.
  let unresolvable = 0, unresolvableLocal = 0;
  // §3.13-SOV row 3: sovereign ids are TRANCHE ids in the same store, so `isTrancheId` answers
  // for them. The `/-GOV-/` escape hatch that used to sit here passed any id merely SHAPED like
  // government paper — the one id space this check could not actually check.
  state.institutionalEntities.forEach((e) => {
    materializeBook(v2, e.id).forEach((h) => {
      const id = h.instrumentId;
      // §3.13-BOOK (c2a): a listed company's equity is keyed by the company itself, so this
      // arm crosses the instrument space into the entity space — named, and now countable.
      // §3.13-BOOK (c2b): the last arm is the FUND-SHARE crossing — an ETF's or a PE fund's
      // interest is keyed by the fund ENTITY on the register, so an instrument id that names
      // nothing else is checked against the entity table. Slice (d)'s index ends the guessing.
      const known = isTrancheId(v2, id) || companyIds.has(equityIssuerId(id)) || entityIds.has(asEntityId(id));
      if (!known) { unresolvable++; unresolvableLocal += h.quantityOrNotionalLocal ?? 0; }
    });
  });
  if (unresolvable > 0) out.push({ family: 'O', check: 'O8 one thing, one key: register rows', week, usd: unresolvableLocal, message: `${unresolvable} register rows worth ${B(unresolvableLocal)} name an id that is no tranche, company or fund — a key that resolves in no store` });
  return out;
}

/** O5 — contracts, estates, indices, shipments: parties alive, claims bounded, weights whole. */
function o5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const { companyByTicker: tickers, companyById: byId5, institutionById: ents } = partyIndexOfState(state);
  // A dead firm with an OPEN estate is still a party: its receiver collects what it is owed.
  const openEstates = new Set((state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  // §3.13-BOOK d4c-vi: ONE liveness check over every kind on the contract store — a derivative,
  // a repo, a stock loan, a prime-brokerage line, a trade invoice, a capital commitment — each
  // as its two parties. §3.13-BOOK d4a: a party is a `PartyRef` arm keyed by ENTITY id
  // (c-then-3b); this read the firm arms by a `ticker` they no longer carry, so every firm party
  // read as dead.
  const alive = (p: PartyRef | undefined): boolean => {
    if (p === undefined) return false;
    switch (p.kind) {
      case 'INSTITUTION': { const e = ents.get(p.id); return !!e && !e.isDefaulted; }
      case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': { const c = byId5.get(p.id); return !!c && (isActiveCompany(c) || openEstates.has(c.id)); }
      case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': case 'CCP': return true;
      default: return assertNever(p, 'o5.alive');
    }
  };
  const deadByKind = new Map<string, { n: number; usd: number }>();
  liveObligationPartiesOf(ensureV2(state)).forEach((o) => {
    if (alive(o.a) && alive(o.b)) return;
    const d = deadByKind.get(o.kind) ?? { n: 0, usd: 0 };
    d.n++; d.usd += o.notional; deadByKind.set(o.kind, d);
  });
  deadByKind.forEach((d, kind) => {
    out.push({ family: 'O', check: 'O5 contracts have two live parties', week, usd: d.usd, message: `${d.n} ${kind} contracts (${B(d.usd)}) have a dead or missing party` });
  });
  let overRecovered = 0;
  (state.estates ?? []).forEach((e) => { e.claims.forEach((c) => { if (c.recoveredLocal - c.principalLocal > floatDustLocal(c.recoveredLocal + c.principalLocal, 2)) overRecovered++; }); });
  if (overRecovered) out.push({ family: 'O', check: 'O5 recovered ≤ owed', week, usd: overRecovered, message: `${overRecovered} estate claims recovered more than they were owed` });
  let badIndex = 0;
  (state.marketIndexes ?? []).forEach((x) => { const w = sum(x.constituents, (c) => c.weight); if (x.constituents.length && Math.abs(w - 1) > floatDust(1 + sum(x.constituents, (c) => Math.abs(c.weight)), x.constituents.length)) badIndex++; });
  if (badIndex) out.push({ family: 'O', check: 'O5 index weights sum to one', week, usd: badIndex, message: `${badIndex} indices' weights do not sum to one` });
  // The two halves are counted apart, because they are not the same finding. A dead BUYER is a
  // consignment that will be scrapped on arrival rather than landed on nobody, so what it
  // measures is how long the model carries goods for a consignee that cannot take them. A dead
  // SELLER is a shipment that is perfectly deliverable — the goods left before the firm died and
  // the live buyer will receive them — so a count there is a question about the check.
  let deadBuyerShip = 0, deadSellerShip = 0;
  // A goods-book key is a TICKER or an ID — the one place two id spaces share a key on purpose
  // (`05-unit-bidding.ts:GlobalFirmLookup.byKey`), so both are tried. §3.13-BOOK (c-then-3b): the
  // second try was a full scan of every company PER SHIPMENT; it is the index's other half.
  const idOrTicker = (key: string) => tickers.get(asTicker(key)) ?? byId5.get(asEntityId(key));
  // A dead buyer with an OPEN estate still takes delivery — the receiver liquidates it.
  const estateOf = new Map((state.estates ?? []).map((e) => [e.companyId, e]));
  const why = new Map<string, number>();
  const bump = (k: string) => why.set(k, (why.get(k) ?? 0) + 1);
  (state.goodsInTransit ?? []).forEach((g) => {
    const b = byId5.get(g.buyerId);
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

/**
 * O12 — §3.13-BOOK d5a. A LIEN IS WHAT THE REPO BOOK PLEDGED. Per bank and bond, the register's
 * lien units equal the face the bank's open repo contracts pledge of that bond: the book is the
 * one writer of the liens, so a gap is a write that bypassed it.
 */
function o12(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const pledgedByBank = new Map<string, Map<string, number>>();
  REGION_IDS.forEach((r) => repoBookOf(v2, r).forEach((c) => {
    const byBond = pledgedByBank.get(c.borrowerId) ?? new Map<string, number>();
    c.collateral.forEach((p) => byBond.set(p.bondId, (byBond.get(p.bondId) ?? 0) + p.faceLocal));
    pledgedByBank.set(c.borrowerId, byBond);
  }));
  let off = 0, offLocal = 0;
  state.companies.forEach((c) => {
    if (!c.isBankEntity) return;
    const liens = lienFaceByBond(v2, c.id);
    const pledged = pledgedByBank.get(c.id) ?? new Map<string, number>();
    new Set<string>([...liens.keys(), ...pledged.keys()]).forEach((bondId) => {
      const gap = Math.abs((liens.get(bondId as InstrumentId) ?? 0) - (pledged.get(bondId) ?? 0));
      if (gap > PLEDGE_ROUNDING_TOLERANCE_LOCAL) { off++; offLocal += gap; }
    });
  });
  if (off) out.push({ family: 'O', check: 'O12 liens equal pledges', week, usd: offLocal, message: `${off} bank-bond liens (${B(offLocal)}) disagree with the repo book's pledges` });
  return out;
}

/**
 * O13 — §3.13-BOOK d5b. AN ACCOUNT LIEN IS THE CLAIM THAT BINDS IT. Per account row, the lien
 * equals what the books say the party only holds: a lender's stock-loan collateral per money.
 * (d5c's other claim — a dealer's initial margin on its live derivatives — is gone with
 * §3.17-iv-a: the margin is the clearing house's cash, and O15 holds it to the contracts.) The
 * books are the liens' only writers, so a gap is a write that bypassed them, or a claim with no lien.
 */
function o13(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const expected = new Map<string, number>();
  const claim = (party: PartyRef, currency: CurrencyCode, usd: number) => {
    const k = accountKey(party, currency);
    expected.set(k, (expected.get(k) ?? 0) + usd);
  };
  REGION_IDS.forEach((r) => securityLoanBookOf(v2, r).forEach((l) => {
    if (l.lender.kind === 'INSTITUTION') claim(l.lender, l.currency, Math.max(0, l.collateralLocal));
  }));
  let off = 0, offLocal = 0;
  const seen = new Set<string>();
  const A = v2.accounts;
  for (let r = 0; r < A.n; r++) {
    const k = v2.refs.accountKeys.strings[A.keyRef[r]];
    seen.add(k);
    const gap = Math.abs(A.lien[r] - (expected.get(k) ?? 0));
    if (gap > 1) { off++; offLocal += gap; }
  }
  expected.forEach((usd, k) => { if (!seen.has(k) && usd > 1) { off++; offLocal += usd; } });
  if (off) out.push({ family: 'O', check: 'O13 account liens equal the claims that bind them', week, usd: offLocal, message: `${off} account rows (${B(offLocal)}) carry a lien that disagrees with the collateral and margin the books say they hold` });
  return out;
}

/**
 * O15 — §3.17-iv-a, c-i. THE CLEARING HOUSE HOLDS WHAT ITS MEMBERS PUT WITH IT. Per region, the
 * CCP's cash at the banks covers the initial margin its live contracts posted to it AND the
 * default fund its members paid in: the postings and the true-ups are the inflows, the releases
 * and the refunds the outflows, so cash below the two is a payment the lifecycle did not make, a
 * contract that posted nothing it claims to have — or, §3.17-iv-b, a survivor the house paid for
 * a member that ceased to exist, which is the loss 17-iv-c-ii's waterfall gives an order to.
 * Cash ABOVE the two is the house's own capital (`ccpOwnCapitalLocal`).
 */
function o15(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  REGION_IDS.forEach((r) => {
    const sheet = ccpSheetAt(v2, r);
    const shortLocal = -ccpOwnCapitalLocal(sheet);
    if (shortLocal > floatDustLocal(Math.abs(shortLocal), 4)) out.push({ family: 'O', check: 'O15 the clearing house holds what its members put with it', week, usd: shortLocal, message: `${r}: the clearing house holds ${B(sheet.cashLocal)} against ${B(sheet.marginHeldLocal)} of members' initial margin and ${B(sheet.defaultFundLocal)} of default fund — ${B(shortLocal)} short` });
  });
  return out;
}

/**
 * O14 — §3.13-BOOK f1. A ROW IS ITS LOTS. Every live register row's units equal the sum of the
 * lots under it: the writers keep the chain, and a row whose chain disagrees is a write that
 * moved units without moving lots — the invariant the basis reads (f2) stand on.
 */
function o14(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const H = v2.holdings;
  let off = 0, offUnits = 0;
  for (let r = 0; r < H.used; r++) {
    if (H.typeRef[r] < 0) continue;
    const units = rowUnits(H, r);
    const gap = Math.abs(rowLotUnits(v2, r) - units);
    if (gap > floatDust(Math.abs(units) + rowLotUnits(v2, r), 2)) { off++; offUnits += gap; }
  }
  if (off) out.push({ family: 'O', check: 'O14 a row is its lots', week, usd: offUnits, message: `${off} register rows hold units their lots do not account for (${offUnits.toFixed(3)} units in all)` });
  return out;
}

export function auditOwnership(state: GameState, week: number): AuditFinding[] {
  return [...o1(state, week), ...o2(state, week), ...o3(state, week), ...o4(state, week), ...o5(state, week), ...o6(state, week), ...o7(state, week), ...o8(state, week), ...o9(state, week), ...o10(state, week), ...o11(state, week), ...o12(state, week), ...o13(state, week), ...o14(state, week), ...o15(state, week)];
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
  const book = derivativesOf(ensureV2(state));
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
  // §9.13-OUTSIDE: ONE walk over the four stores a sovereign holding can sit in
  // (`engine/sovereign-register.ts`). This check enumerated all four itself — which is what made
  // it, and the four other places that do the same walk, able to fall out of date about which
  // stores exist. The household sector's book arrived in §9.13-EQUITY and only this walk knew.
  REGION_IDS.forEach((r) => {
    forEachSovereignPosition(v2, state, r, (p) => check(p.bondId, Math.abs(p.faceLocal), `${p.holderClass.toLowerCase()} ${p.holderKey}`));
  });
  if (strayRows > 0) {
    out.push({ family: 'O', check: 'O11 a sovereign holding names a bond', week, usd: strayLocal,
      message: `${strayRows} sovereign positions worth ${B(strayLocal)} name an id no government ladder carries (${examples.join(' | ')}) — a claim on paper that does not exist` });
  }
  return out;
}
