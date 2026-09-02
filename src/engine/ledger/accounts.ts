/**
 * §5-WIRES A — ONE KIND OF ACCOUNT FOR EVERY PARTY.
 *
 * Today a balance is a differently-named field on five types resolved by settlement's nine-way
 * kind switch (`balance.ts` states the end-state noun). This module is the account STORE: one row
 * per (party, bank) — a company's deposit at its house bank, a bank's own reserves at the
 * central bank, the treasury's account there, the household sector's balance at each of its
 * region's banks (and the slice still in transit), a pool's balance at each bank by share — and
 * ONE rule that applies a settled payment row to it:
 *
 *   payer's row −a, payee's row +a; and where a row sits at a bank, that bank's own reserve row
 *   moves by the same amount — reserves leave the payer's bank and arrive at the payee's, the
 *   interbank settlement of the deposit that moved. A row at the central bank (a bank's own
 *   reserves, the treasury) IS the central-bank side, so it carries no second leg; a row with no
 *   bank (a clearing house, the central bank's own issuance, money in transit) carries none.
 *
 * SECOND SLICE — THE AUTHORITY OF THE PASS (§7.378). Settlement applies the settled rows to the
 * store and PROJECTS the books from it (`projectBooks`): a party's balance is its rows, a bank's
 * reserves its own row, a bank's deposit lines move by its depositors' rows, the treasury's
 * account and advance are the two signs of its net position. The nine-way switch keeps only its
 * tallies. The household sector's legs land on its region's banks by market share AT ONCE — the
 * T+1 transit (`pendingBankSettlementUSD`) is gone, and with it N's money in transit.
 *
 * FIRST SLICE — A MIRROR WITH A GATE (§7.377). The store is REBUILT from the balance fields
 * before every settlement pass, the pass applies each settled row to it beside the legacy
 * per-kind writes, and `compareToBooks` proves the two agree after the pass — per party, per
 * bank's reserves, per treasury. That is the same method W1 used for wires: land the structure,
 * gate it against what it will replace, then flip the readers (A2) and delete the fields.
 */
import { WeeklyStepContext } from '../simulation/stages/context';
import { PartyRef } from './party';
import { partyId, partyOf, partyKey, partyFromKey } from './party';
import { RegionId } from '../../domain/geography';
import { Company } from '../../domain/company';
import { InstitutionalEntity } from '../../domain/institutions';
import { DepositLines } from '../../domain/banking';
import { V2World, internString, ensureV2 } from '../../engine2/world';

// ---------------------------------------------------------------------------------------------
// THIRD SLICE — THE PERSISTENT ACCOUNTS, COMPANIES FIRST (A3.1, §7.384). A company's balance
// lives on the world (`v2.accounts`, keyed by the party's key interned in v2 — party ids are
// process-local), the mirror opens a company's pass row FROM it, the projection writes the pass's
// result back INTO it, and every reader takes `cashOf`; `Company.cash` no longer exists. A
// company the store has no row for opens at zero the first time a pass sees it (a newborn's
// balance arrives by payment — W6); the seed opens each firm's account where it wrote `cash`.
// ---------------------------------------------------------------------------------------------

function growPersistent(a: V2World['accounts']): void {
  const cap = a.keyRef.length * 2;
  const k = new Int32Array(cap); k.set(a.keyRef); a.keyRef = k;
  const b = new Float64Array(cap); b.set(a.balanceUSD); a.balanceUSD = b;
}

/** The party's persistent row, or -1. */
export function accountRowOf(v2: V2World, party: PartyRef): number {
  return v2.accounts.rowByKeyRef.get(internString(v2, partyKey(party))) ?? -1;
}

/** Open the party's account. Opening one that exists is a defect: a balance has one row. */
export function openAccount(v2: V2World, party: PartyRef, balanceUSD: number): number {
  const a = v2.accounts;
  const ref = internString(v2, partyKey(party));
  if (a.rowByKeyRef.has(ref)) throw new Error(`ENGINE DEFECT: account ${partyKey(party)} opened twice`);
  if (a.n >= a.keyRef.length) growPersistent(a);
  const r = a.n++;
  a.keyRef[r] = ref; a.balanceUSD[r] = balanceUSD;
  a.rowByKeyRef.set(ref, r);
  return r;
}

/** The party's row, opened at zero on first sight. */
export function ensureAccount(v2: V2World, party: PartyRef): number {
  const r = accountRowOf(v2, party);
  return r >= 0 ? r : openAccount(v2, party, 0);
}

/** The party's balance; a party with no account holds nothing. */
export function balanceOf(v2: V2World, party: PartyRef): number {
  const r = accountRowOf(v2, party);
  return r >= 0 ? v2.accounts.balanceUSD[r] : 0;
}

/**
 * A3.1's transitional write, for the one site that still SETS a balance by fiat: a resolved
 * bank's shell, whose company row was never money (a bank's goods-market self settles on its
 * reserves; the row carries the seed's number). A3's bank slice deletes the row and this.
 */
export function resetAccount(v2: V2World, party: PartyRef, balanceUSD: number): void {
  v2.accounts.balanceUSD[ensureAccount(v2, party)] = balanceUSD;
}

/**
 * THE OPENING CASH A GENERATED FIRM'S FOUNDERS PUT IN — stashed beside the firm at generation
 * (the same side channel the seed rings use, keyed by the object so the firm keeps its identity),
 * read by the seed to open the account and by a birth to pay it; never a field on the Company.
 */
const openingCashStash = new WeakMap<object, number>();
export function stashOpeningCash(comp: object, usd: number): void { openingCashStash.set(comp, usd); }
export function openingCashOf(comp: object): number { return openingCashStash.get(comp) ?? 0; }

// ---- A3.3/A3.4 — THE SECTOR PARTIES' ROWS, ONE PER BANK, CARRIED. A pool (an SME tier) and the
// household sector bank at every bank of their region: the balance is a row at each, moved by
// settlement's split of each leg and CARRIED week to week — never re-guessed from a total by
// this week's market shares (§7.378's half-backed shortcut). A bank's SME line is the sum of
// the pool rows at it; its household line the household sector's row at it. ----

/** The sector party's row at a bank, opened at zero on first sight. */
export function sectorRowAt(v2: V2World, party: PartyRef, bankTicker: string): number {
  const a = v2.accounts;
  const ref = internString(v2, partyKey(party));
  let byBank = a.bankRowsByParty.get(ref);
  if (!byBank) { byBank = new Map(); a.bankRowsByParty.set(ref, byBank); }
  let r = byBank.get(bankTicker);
  if (r === undefined) {
    if (a.n >= a.keyRef.length) growPersistent(a);
    r = a.n++;
    a.keyRef[r] = internString(v2, `${partyKey(party)}@${bankTicker}`); a.balanceUSD[r] = 0;
    byBank.set(bankTicker, r);
  }
  return r;
}

/** A sector party's balance: the sum of its rows across its region's banks. */
export function sectorCashOf(v2: V2World, party: PartyRef): number {
  const byBank = v2.accounts.bankRowsByParty.get(internString(v2, partyKey(party)));
  if (!byBank) return 0;
  let usd = 0; byBank.forEach((r) => { usd += v2.accounts.balanceUSD[r]; });
  return usd;
}
/** A pool's cash. */
export const poolCashOf = (v2: V2World, region: RegionId, industry: string): number =>
  sectorCashOf(v2, { kind: 'SEGMENT', region, industry: industry as never });
/** The household sector's deposits (A3.4). */
export const householdDepositsOf = (v2: V2World, region: RegionId): number =>
  sectorCashOf(v2, { kind: 'HOUSEHOLD', region });

/** A bank's line of one sector kind: every such party's row at it. */
function sectorDepositsAt(v2: V2World, bankTicker: string, kind: 'SEGMENT' | 'HOUSEHOLD'): number {
  let usd = 0;
  v2.accounts.bankRowsByParty.forEach((byBank, partyRef) => {
    if (!v2.internedStrings[partyRef].startsWith(kind + ':')) return;
    const r = byBank.get(bankTicker); if (r !== undefined) usd += v2.accounts.balanceUSD[r];
  });
  return usd;
}
/** A bank's SME deposit line: every pool's row at it. */
export const smeDepositsAt = (v2: V2World, bankTicker: string): number => sectorDepositsAt(v2, bankTicker, 'SEGMENT');
/** A bank's household deposit line: the household sector's row at it (A3.4). */
export const householdDepositsAt = (v2: V2World, bankTicker: string): number => sectorDepositsAt(v2, bankTicker, 'HOUSEHOLD');

// ---- A3.6c-ii — THE CORPORATE AND INSTITUTIONAL LINES ARE THE DEPOSITORS' ACCOUNTS. A bank's
// corporate line is the sum of the accounts of the firms whose house bank it is (a resolved
// bank's shell banks at its acquirer like any firm), its institutional line the sum of the
// institutions' — summed in the holders' order, the order the pass rows sum in, so the read
// is the number the projection used to write. No field carries either. ----

type Depositor = { homeBankTicker?: string };
/** A bank's corporate deposit line: every firm banking there, its account. */
export function corporateDepositsAt(v2: V2World, companies: readonly (Depositor & Pick<Company, 'ticker' | 'isBankEntity' | 'bankBalanceSheet'>)[], bankTicker: string): number {
  let usd = 0;
  for (const c of companies) {
    if (c.homeBankTicker !== bankTicker || (c.isBankEntity && c.bankBalanceSheet)) continue;
    usd += cashOf(v2, c);
  }
  return usd;
}
/** A bank's institutional deposit line: every institution banking there, its account. */
export function institutionalDepositsAt(v2: V2World, entities: readonly (Depositor & Pick<InstitutionalEntity, 'id'>)[], bankTicker: string): number {
  let usd = 0;
  for (const e of entities) if (e.homeBankTicker === bankTicker) usd += entityCashOf(v2, e);
  return usd;
}
/** A bank's four deposit lines, read off the ledger. */
export function depositLinesAt(
  v2: V2World,
  companies: readonly (Depositor & Pick<Company, 'ticker' | 'isBankEntity' | 'bankBalanceSheet'>)[],
  entities: readonly (Depositor & Pick<InstitutionalEntity, 'id'>)[],
  bankTicker: string
): DepositLines {
  return {
    householdUSD: householdDepositsAt(v2, bankTicker),
    corporateUSD: corporateDepositsAt(v2, companies, bankTicker),
    institutionalUSD: institutionalDepositsAt(v2, entities, bankTicker),
    smeUSD: smeDepositsAt(v2, bankTicker),
  };
}
/** The lines in the week: the pass's own holders. */
export const bankDepositLines = (ctx: WeeklyStepContext, bankTicker: string): DepositLines =>
  depositLinesAt(ctx.v2, ctx.updatedCompanies, ctx.updatedInstitutionalEntities, bankTicker);
/** The lines off a state (the audits, the UI, the harness). */
export const stateDepositLines = (state: { companies: readonly Company[]; institutionalEntities: readonly InstitutionalEntity[]; v2?: unknown }, bankTicker: string): DepositLines =>
  depositLinesAt(ensureV2(state as never), state.companies, state.institutionalEntities, bankTicker);

/**
 * A3.4 — A BANK'S OWN BOOK MOVES A SECTOR ROW. The household loan pass and the evolution move a
 * bank's household line directly (a loan creates the borrower's deposit, amortization and
 * interest destroy it, the bank's deposit interest credits it — §7.352, the bank's second money
 * engine as DEPOSIT events on its own sheet): each such move is the household row at that bank
 * moving by the same amount, so the line and the row cannot disagree. Retired when those
 * passes are account operations themselves (A3.6).
 */
export function adjustSectorRow(v2: V2World, party: PartyRef, bankTicker: string, deltaUSD: number): void {
  if (deltaUSD === 0) return;
  v2.accounts.balanceUSD[sectorRowAt(v2, party, bankTicker)] += deltaUSD;
}

/** A bank leaves (resolved, merged): every sector party's row at it joins its row at the assuming bank. */
export function moveSectorRowsToBank(v2: V2World, fromTicker: string, toTicker: string): void {
  v2.accounts.bankRowsByParty.forEach((byBank, partyRef) => {
    const r = byBank.get(fromTicker);
    if (r === undefined) return;
    const party = partyFromKey(v2.internedStrings[partyRef]);
    if (!party) return;
    const to = sectorRowAt(v2, party, toTicker);
    v2.accounts.balanceUSD[to] += v2.accounts.balanceUSD[r];
    v2.accounts.balanceUSD[r] = 0;
    byBank.delete(fromTicker);
  });
}

// ---- A3.6a — A BANK'S RESERVES ARE ITS ROW, CARRIED. The bank's own account at the central
// bank (`BANK:<ticker>`) lives on the world like every other party's: the seed opens it at the
// number close-seed strikes, the mirror opens the pass row FROM it, the projection writes the
// pass's result back INTO it and the sheet's `cashReservesUSD` from it. Every direct writer of
// the line between two passes — 02b's rounding of the evolved sheet, a merger moving a bank
// whole, the player's trade against a desk, the harness's reserve drain — is the row moving by
// the same amount (`adjustBankReserves`, `moveBankReserves`), the pattern A3.4's
// `adjustSectorRow` set; the mirror reports a line that moved without its row. The field's
// readers flip to `bankReservesOf` and the field dies in A3.6's next slice. ----

/** A bank's reserves: its account (A3.6c — the sheet carries no line; this is the one read). */
export function bankReservesOf(v2: V2World, bankTicker: string): number {
  return balanceOf(v2, { kind: 'BANK', ticker: bankTicker });
}

/** The bank's reserve row; a bank the seed did not open (no central bank in its region, a sheet
 *  scaled from the aggregate) opens at its line the first time a pass sees it. */
export function reserveRowOf(v2: V2World, bankTicker: string, openingUSD: number): number {
  const party: PartyRef = { kind: 'BANK', ticker: bankTicker };
  const r = accountRowOf(v2, party);
  return r >= 0 ? r : openAccount(v2, party, openingUSD);
}

/** A bank's own book moves its reserves line between passes: the row moves by the same amount.
 *  A bank with no row yet is opened at its line by the next mirror, which already carries the move. */
export function adjustBankReserves(v2: V2World, bankTicker: string, deltaUSD: number): void {
  if (deltaUSD === 0) return;
  const r = accountRowOf(v2, { kind: 'BANK', ticker: bankTicker });
  if (r >= 0) v2.accounts.balanceUSD[r] += deltaUSD;
}

/** A bank leaves whole (a merger): its reserves join the acquirer's row. */
export function moveBankReserves(v2: V2World, fromTicker: string, toTicker: string): void {
  const from = accountRowOf(v2, { kind: 'BANK', ticker: fromTicker });
  if (from < 0) return;
  const to = reserveRowOf(v2, toTicker, 0);
  v2.accounts.balanceUSD[to] += v2.accounts.balanceUSD[from];
  v2.accounts.balanceUSD[from] = 0;
}

/** An institutional entity's cash: its account (A3.2). */
export function entityCashOf(v2: V2World, e: Pick<InstitutionalEntity, 'id'>): number {
  return balanceOf(v2, { kind: 'INSTITUTION', id: e.id });
}

/** A company's cash: its account. (A bank with a sheet still reads its company row here — the
 *  seed's number, never moved, because its goods-market self settles on its reserves; A3's
 *  bank slice makes that read the reserves.) */
export function cashOf(v2: V2World, c: Pick<Company, 'ticker'>): number {
  return balanceOf(v2, { kind: 'COMPANY', ticker: c.ticker });
}

/** Which line of a bank's book (or of the central bank's) a row is. */
export const ACCOUNT_CLASSES = ['CORPORATE', 'INSTITUTIONAL', 'SME', 'HOUSEHOLD', 'RESERVES', 'TREASURY', 'CREATED', 'SECURITIES', 'VOID'] as const;
export type AccountClass = typeof ACCOUNT_CLASSES[number];

/** The bank a row sits at: a named bank, the central bank, or nowhere (transit, the house, issuance). */
export const AT_CENTRAL_BANK = -1;
export const AT_NOWHERE = -2;

export interface AccountStore {
  n: number;
  partyId: Int32Array;
  /** Index into `banks` (a ticker per index), or AT_CENTRAL_BANK / AT_NOWHERE. */
  bankIdx: Int32Array;
  classId: Int8Array;
  balanceUSD: Float64Array;
  /** The balance the row opened the pass with — a line moves by (balance − opening). */
  openingUSD: Float64Array;
  /** Bank tickers by index, and the row of each bank's OWN reserve account. */
  banks: string[];
  reserveRowOfBank: Int32Array;
  bankIdxOfTicker: Map<string, number>;
  /** The rows of a party, in order (one for most parties; per bank for the sector parties). */
  rowsOfParty: Map<number, number[]>;
  /** For the multi-row sector parties, how a payment splits across their rows. */
  splitOfParty: Map<number, Float64Array>;
}

function grow(s: AccountStore): void {
  const cap = s.partyId.length * 2;
  const gi = (o: Int32Array) => { const a = new Int32Array(cap); a.set(o); return a; };
  const g8 = (o: Int8Array) => { const a = new Int8Array(cap); a.set(o); return a; };
  const gf = (o: Float64Array) => { const a = new Float64Array(cap); a.set(o); return a; };
  s.partyId = gi(s.partyId); s.bankIdx = gi(s.bankIdx); s.classId = g8(s.classId); s.balanceUSD = gf(s.balanceUSD); s.openingUSD = gf(s.openingUSD);
}

export function newAccountStore(): AccountStore {
  const cap = 1 << 12;
  return {
    n: 0, partyId: new Int32Array(cap), bankIdx: new Int32Array(cap), classId: new Int8Array(cap), balanceUSD: new Float64Array(cap), openingUSD: new Float64Array(cap),
    banks: [], reserveRowOfBank: new Int32Array(0), bankIdxOfTicker: new Map(), rowsOfParty: new Map(), splitOfParty: new Map(),
  };
}

function bankIndex(s: AccountStore, ticker: string): number {
  let i = s.bankIdxOfTicker.get(ticker);
  if (i === undefined) { i = s.banks.length; s.banks.push(ticker); s.bankIdxOfTicker.set(ticker, i); }
  return i;
}

export function openRow(s: AccountStore, party: number, bankIdx: number, cls: AccountClass, balanceUSD: number): number {
  if (s.n >= s.partyId.length) grow(s);
  const r = s.n++;
  s.partyId[r] = party; s.bankIdx[r] = bankIdx; s.classId[r] = ACCOUNT_CLASSES.indexOf(cls); s.balanceUSD[r] = balanceUSD; s.openingUSD[r] = balanceUSD;
  const rows = s.rowsOfParty.get(party);
  if (rows) rows.push(r); else s.rowsOfParty.set(party, [r]);
  return r;
}

/** Σ of a party's rows — its balance across every bank it holds money at. */
export function balanceOfParty(s: AccountStore, party: number): number {
  const rows = s.rowsOfParty.get(party);
  if (!rows) return 0;
  let b = 0; for (const r of rows) b += s.balanceUSD[r];
  return b;
}

/**
 * The mirror: every balance the books carry today, as rows. Built from the fields as they stand
 * at the moment of the pass (the same objects settlement's legacy apply will write).
 */
export function buildAccountMirror(ctx: WeeklyStepContext): AccountStore {
  const s = newAccountStore();
  const banks = ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet);
  // Banks first: every other row may point at one, and a bank's own COMPANY party is its reserves.
  s.reserveRowOfBank = new Int32Array(Math.max(1, banks.length)).fill(-1);
  banks.forEach((b) => {
    const bi = bankIndex(s, b.ticker);
    if (s.reserveRowOfBank.length <= bi) { const a = new Int32Array(bi + 16).fill(-1); a.set(s.reserveRowOfBank); s.reserveRowOfBank = a; }
    // A3.6a/c: the pass row opens at the persistent row — the bank's reserves ARE that row.
    const row = openRow(s, partyId({ kind: 'BANK', ticker: b.ticker }), AT_CENTRAL_BANK, 'RESERVES', ctx.v2.accounts.balanceUSD[reserveRowOf(ctx.v2, b.ticker, 0)]);
    s.reserveRowOfBank[bi] = row;
    // The bank's COMPANY party (its goods-market self) settles on its own reserves.
    s.rowsOfParty.set(partyId({ kind: 'COMPANY', ticker: b.ticker }), [row]);
    // Its credit-creation and securities accounts: voids at the bank itself.
    openRow(s, partyId({ kind: 'BANK_CREDIT', ticker: b.ticker }), bi, 'CREATED', 0);
    openRow(s, partyId({ kind: 'BANK_SECURITIES', ticker: b.ticker }), bi, 'SECURITIES', 0);
  });
  const bankIdxOf = (ticker: string | undefined): number =>
    ticker !== undefined && s.bankIdxOfTicker.has(ticker) ? s.bankIdxOfTicker.get(ticker)! : AT_NOWHERE;
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity && c.bankBalanceSheet) return;
    // A3.1: the pass row opens at the persistent balance; a firm with no account yet opens at zero.
    const party: PartyRef = { kind: 'COMPANY', ticker: c.ticker };
    openRow(s, partyId(party), bankIdxOf(c.homeBankTicker), 'CORPORATE', ctx.v2.accounts.balanceUSD[ensureAccount(ctx.v2, party)]);
  });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    // A3.2: the pass row opens at the persistent balance; an entity with no account opens at zero.
    const party: PartyRef = { kind: 'INSTITUTION', id: e.id };
    openRow(s, partyId(party), bankIdxOf(e.homeBankTicker), 'INSTITUTIONAL', ctx.v2.accounts.balanceUSD[ensureAccount(ctx.v2, party)]);
  });
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region];
    if (!reg) return;
    const regionBanks = banks.filter((b) => b.region === region && !b.isDefaulted);
    const shareSum = regionBanks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
    // The household sector: its balance at each bank is that bank's household line, and a leg
    // lands on the banks by market share at once — the split the pools' legs always had.
    const hhParty: PartyRef = { kind: 'HOUSEHOLD', region };
    const hh = partyId(hhParty);
    const hhSplit: number[] = [];
    regionBanks.forEach((b) => {
      openRow(s, hh, s.bankIdxOfTicker.get(b.ticker)!, 'HOUSEHOLD', ctx.v2.accounts.balanceUSD[sectorRowAt(ctx.v2, hhParty, b.ticker)]);
      hhSplit.push(shareSum > 0 ? (b.bankMarketShare ?? 0) / shareSum : 1 / Math.max(1, regionBanks.length));
    });
    if (regionBanks.length === 0) { openRow(s, hh, AT_NOWHERE, 'HOUSEHOLD', householdDepositsOf(ctx.v2, region)); hhSplit.push(1); }
    s.splitOfParty.set(hh, Float64Array.from(hhSplit));
    // The pools: a CARRIED row at each bank (A3.3); a leg splits across them by market share.
    (reg.smePools ?? []).forEach((seg) => {
      const party: PartyRef = { kind: 'SEGMENT', region, industry: seg.industry };
      const p = partyId(party);
      const split: number[] = [];
      regionBanks.forEach((b) => {
        const sh = shareSum > 0 ? (b.bankMarketShare ?? 0) / shareSum : 1 / Math.max(1, regionBanks.length);
        openRow(s, p, s.bankIdxOfTicker.get(b.ticker)!, 'SME', ctx.v2.accounts.balanceUSD[sectorRowAt(ctx.v2, party, b.ticker)]);
        split.push(sh);
      });
      if (regionBanks.length === 0) { openRow(s, p, AT_NOWHERE, 'SME', poolCashOf(ctx.v2, region, seg.industry)); split.push(1); }
      s.splitOfParty.set(p, Float64Array.from(split));
    });
    const cb = reg.centralBankSheet;
    // The treasury's net position at the central bank: its account less the advance drawn.
    openRow(s, partyId({ kind: 'GOVERNMENT', region }), AT_CENTRAL_BANK, 'TREASURY', cb ? cb.treasuryAccountUSD - (cb.waysAndMeansUSD ?? 0) : 0);
    openRow(s, partyId({ kind: 'CENTRAL_BANK', region }), AT_NOWHERE, 'VOID', 0);
    openRow(s, partyId({ kind: 'CLEARING_HOUSE', region }), AT_NOWHERE, 'VOID', 0);
  });
  return s;
}

/** One settled row, by the one rule. A party the store has no row for is reported, not dropped. */
export function applySettledRow(s: AccountStore, payer: number, payee: number, amountUSD: number): boolean {
  const pr = s.rowsOfParty.get(payer), qr = s.rowsOfParty.get(payee);
  if (!pr || !qr) return false;
  side(s, payer, pr, -amountUSD);
  side(s, payee, qr, amountUSD);
  return true;
}

function side(s: AccountStore, party: number, rows: number[], deltaUSD: number): void {
  if (rows.length === 1) { leg(s, rows[0], deltaUSD); return; }
  const split = s.splitOfParty.get(party);
  for (let i = 0; i < rows.length; i++) { const w = split ? split[i] : 1 / rows.length; if (w !== 0) leg(s, rows[i], deltaUSD * w); }
}

function leg(s: AccountStore, row: number, deltaUSD: number): void {
  s.balanceUSD[row] += deltaUSD;
  const bi = s.bankIdx[row];
  if (bi >= 0) {
    const rr = s.reserveRowOfBank[bi];
    if (rr >= 0) s.balanceUSD[rr] += deltaUSD;
  }
}

/**
 * THE PROJECTION — the books, written from the store after a pass. Every balance field a party
 * carries is its rows; a bank's reserves are its own row and its deposit lines move by its
 * depositors' rows (by class); the treasury's account is the positive side of its net position
 * and the advance the negative (§5-CLOSE M4's rule, in one place). Equity is not a balance and
 * stays the pass's own (the bank's own-account legs are its income and expense).
 */
export function projectBooks(ctx: WeeklyStepContext, s: AccountStore): void {
  // A3.3/A3.4: the sector parties' pass rows land on their persistent per-bank rows FIRST — the
  // bank sheets below read the SME and household lines off them.
  const landSectorRows = (party: PartyRef) => {
    (s.rowsOfParty.get(partyId(party)) ?? []).forEach((r) => {
      const bi = s.bankIdx[r];
      if (bi >= 0) ctx.v2.accounts.balanceUSD[sectorRowAt(ctx.v2, party, s.banks[bi])] = s.balanceUSD[r];
    });
  };
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region]; if (!reg) return;
    landSectorRows({ kind: 'HOUSEHOLD', region });
    (reg.smePools ?? []).forEach((seg) => landSectorRows({ kind: 'SEGMENT', region, industry: seg.industry }));
  });
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity && c.bankBalanceSheet) {
      const bi = s.bankIdxOfTicker.get(c.ticker); if (bi === undefined) return;
      const rr = s.reserveRowOfBank[bi];
      const sheet = c.bankBalanceSheet;
      // A3.6a/c: the pass's result is the persistent row; the sheet carries no reserves line.
      ctx.v2.accounts.balanceUSD[reserveRowOf(ctx.v2, c.ticker, 0)] = s.balanceUSD[rr];
      c.bankBalanceSheet = {
        ...sheet,
        // A3.4: the household line IS the household sector's row at this bank (landed above).
        depositsUSD: householdDepositsAt(ctx.v2, c.ticker),
        // A3.6c-ii: the corporate and institutional lines are reads (`depositLinesAt`); no field.
        // A3.3: the SME line IS the pool rows at this bank (written back below, before this runs).
        smeDepositsUSD: smeDepositsAt(ctx.v2, c.ticker),
      };
      return;
    }
    // A3.1: the pass's result is the persistent balance.
    const party: PartyRef = { kind: 'COMPANY', ticker: c.ticker };
    ctx.v2.accounts.balanceUSD[ensureAccount(ctx.v2, party)] = balanceOfParty(s, partyId(party));
  });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    const party: PartyRef = { kind: 'INSTITUTION', id: e.id };
    ctx.v2.accounts.balanceUSD[ensureAccount(ctx.v2, party)] = balanceOfParty(s, partyId(party));
  });
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region]; if (!reg) return;
    const cb = reg.centralBankSheet;
    if (cb) {
      const net = balanceOfParty(s, partyId({ kind: 'GOVERNMENT', region }));
      cb.treasuryAccountUSD = Math.max(0, net);
      cb.waysAndMeansUSD = Math.max(0, -net);
    }
  });
}

export interface AccountMismatch { what: string; bookUSD: number; storeUSD: number }

/**
 * The gate: after the legacy apply, every balance the books carry against the store's rows.
 * Households and pools compare as sector totals (their per-bank rows are the A2 target); a bank's
 * reserves and the treasury's net position compare by name.
 */
export function compareToBooks(ctx: WeeklyStepContext, s: AccountStore): AccountMismatch[] {
  const out: AccountMismatch[] = [];
  const tol = (x: number) => Math.max(1, Math.abs(x) * 1e-9);
  const check = (what: string, bookUSD: number, storeUSD: number) => { if (Math.abs(bookUSD - storeUSD) > tol(bookUSD)) out.push({ what, bookUSD, storeUSD }); };
  // A3.1/A3.6: a company's balance and a bank's reserves ARE the store's (no field to disagree).
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region]; if (!reg) return;
    const cb = reg.centralBankSheet;
    if (cb) check(`${region} treasury`, cb.treasuryAccountUSD - (cb.waysAndMeansUSD ?? 0), balanceOfParty(s, partyId({ kind: 'GOVERNMENT', region })));
  });
  return out;
}

/** A row's party, for a report line. */
export const partyText = (id: number): string => { const p: PartyRef = partyOf(id); return 'ticker' in p ? `${p.kind}:${p.ticker}` : 'id' in p ? `${p.kind}:${p.id}` : 'industry' in p ? `${p.kind}:${p.region}:${p.industry}` : `${p.kind}:${p.region}`; };
