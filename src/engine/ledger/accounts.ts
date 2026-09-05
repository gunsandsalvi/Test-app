/**
 * A — ONE KIND OF ACCOUNT FOR EVERY PARTY.
 *
 * A balance used to be a differently-named field on five types, resolved by settlement's nine-way
 * kind switch; both are gone (A3, A4 — –394). This module is the account STORE: one row
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
 * SECOND SLICE — THE AUTHORITY OF THE PASS. Settlement applies the settled rows to the
 * store and PROJECTS the books from it (`projectBooks`): a party's balance is its rows, a bank's
 * reserves its own row, a bank's deposit lines move by its depositors' rows, the treasury's
 * account and advance are the two signs of its net position. The nine-way switch keeps only its
 * tallies. The household sector's legs land on its region's banks by market share AT ONCE — the
 * T+1 transit (`pendingBankSettlementLocal`) is gone, and with it N's money in transit.
 *
 * §3.13c — AN ACCOUNT IS (PARTY, CURRENCY, BANK). A party used to have exactly one balance,
 * whose currency was implied by the region it sat in and read by nobody, so a payment across a
 * border took euros out of one row and put dollars into another and the ledger balanced. A row
 * now carries the money it holds; a party holds as many rows as it holds currencies; a payment
 * names its currency and lands on the rows of that currency, opening one at the party's own bank
 * the first time it is paid in a money it has never held. What a party is WORTH is then a
 * conversion (`cashOf`), at the rate the FX auction last cleared, and never a bare sum.
 *
 * FIRST SLICE — A MIRROR WITH A GATE. The store is REBUILT from the balance fields
 * before every settlement pass, the pass applies each settled row to it beside the legacy
 * per-kind writes, and `compareToBooks` proves the two agree after the pass — per party, per
 * bank's reserves, per treasury. That is the same method W1 used for wires: land the structure,
 * gate it against what it will replace, then flip the readers (A2) and delete the fields.
 */
import { WeeklyStepContext } from '../simulation/stages/context';
import type { EntityId } from '../../domain/ids';
import { bankCreditParty, bankParty, bankPartyOf, bankSecuritiesParty, ccpParty, companyParty } from '../../domain/party';
import { PartyRef } from './party';
import { partyId, partyOf, partyKey, partyFromKey } from './party';
import { RegionId, CurrencyCode, CURRENCY_CODES, currencyOf, NUMERAIRE } from '../../domain/geography';
import { FxTable, PARITY_FX, convert } from '../../domain/currency';
import { Company } from '../../domain/company';
import { GovDebtTranche } from '../../domain/region-macro';
import { InstitutionalEntity } from '../../domain/institutions';
import { DepositLines } from '../../domain/banking';
import { V2World, ensureV2, CURRENCY_ID, currencyOfId, internAccount, accountRefOf, internPartyKey, partyKeyRefOf, partyKeyOf, type PersistentAccounts } from '../../engine2/world';
import { newRefColumn, type AccountRef } from '../../engine2/refs';
import { asEntityId, type Ticker } from '../../domain/ids';

/** The ledger's own handle on the money store. Nothing else may hold one — see `ReadonlyAccounts`
 *  in `world.ts` for what it is protecting and why this store is the one that must be protected. */
export const mutableAccounts = (v2: V2World): PersistentAccounts => v2.accounts as PersistentAccounts;

// ---------------------------------------------------------------------------------------------
// THIRD SLICE — THE PERSISTENT ACCOUNTS, COMPANIES FIRST (A3.1, ). A company's balance
// lives on the world (`v2.accounts`, keyed by the party's key interned in v2 — party ids are
// process-local), the mirror opens a company's pass row FROM it, the projection writes the pass's
// result back INTO it, and every reader takes `cashOf`; `Company.cash` no longer exists. A
// company the store has no row for opens at zero the first time a pass sees it (a newborn's
// balance arrives by payment — W6); the seed opens each firm's account where it wrote `cash`.
// ---------------------------------------------------------------------------------------------

function growPersistent(a: PersistentAccounts): void {
  const cap = a.keyRef.length * 2;
  const k = newRefColumn<AccountRef>(cap); k.set(a.keyRef); a.keyRef = k;
  const b = new Float64Array(cap); b.set(a.balance); a.balance = b;
  const l = new Float64Array(cap); l.set(a.lien); a.lien = l;
  const c = new Int8Array(cap); c.set(a.currencyId); a.currencyId = c;
}

/** The one account key: who, and in what money. */
export const accountKey = (party: PartyRef, currency: CurrencyCode): string => `${partyKey(party)}|${currency}`;

/** The party's row in one currency, or -1. */
function accountRowOf(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const ref = accountRefOf(v2, accountKey(party, currency));
  return ref < 0 ? -1 : (v2.accounts.rowByKeyRef.get(ref) ?? -1);
}

/** Open the party's account in one currency. Opening one that exists is a defect: a balance has one row. */
export function openAccount(v2: V2World, party: PartyRef, currency: CurrencyCode, balance: number): number {
  const a = mutableAccounts(v2);
  const ref = internAccount(v2, accountKey(party, currency));
  if (a.rowByKeyRef.has(ref)) throw new Error(`ENGINE DEFECT: account ${accountKey(party, currency)} opened twice`);
  if (a.n >= a.keyRef.length) growPersistent(a);
  const r = a.n++;
  a.keyRef[r] = ref; a.balance[r] = balance; a.currencyId[r] = CURRENCY_ID[currency];
  a.rowByKeyRef.set(ref, r);
  const partyRef = internPartyKey(v2, partyKey(party));
  const rows = a.rowsByPartyRef.get(partyRef);
  if (rows) rows.push(r); else a.rowsByPartyRef.set(partyRef, [r]);
  if (!a.homeByPartyRef.has(partyRef)) a.homeByPartyRef.set(partyRef, CURRENCY_ID[currency]);
  return r;
}

/**
 * THE MONEY THIS PARTY KEEPS ITS BOOKS IN — the currency its first account was opened in, which
 * is the one the seed gave it. A party nobody has ever opened an account for keeps no books, and
 * this is `undefined` rather than a guessed dollar: every read of it returns zero in that case,
 * because a party with no account holds nothing and there is nothing to denominate.
 */
export function homeCurrencyOf(v2: V2World, party: PartyRef): CurrencyCode | undefined {
  const ref = partyKeyRefOf(v2, partyKey(party));
  if (ref < 0) return undefined;
  const id = v2.accounts.homeByPartyRef.get(ref);
  return id === undefined ? undefined : currencyOfId(id);
}

/** Declare the money a party keeps its books in, before it has been paid anything (the seed). */
export function setHomeCurrency(v2: V2World, party: PartyRef, currency: CurrencyCode): void {
  mutableAccounts(v2).homeByPartyRef.set(internPartyKey(v2, partyKey(party)), CURRENCY_ID[currency]);
}

/** The party's row in one currency, opened at zero on first sight. */
function ensureAccount(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const r = accountRowOf(v2, party, currency);
  return r >= 0 ? r : openAccount(v2, party, currency, 0);
}

/** The party's balance in ONE currency; a party with no such account holds none of it. */
export function balanceOf(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const r = accountRowOf(v2, party, currency);
  return r >= 0 ? v2.accounts.balance[r] : 0;
}

/**
 * What the party holds, expressed in ONE money: every currency row it has, converted at the rate
 * the FX auction last cleared. A holder of dollars and yen is worth one number only once someone
 * says in which money — that is the whole content of §3.13c, and why no read returns a bare sum.
 */
function balanceOfIn(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const ref = partyKeyRefOf(v2, partyKey(party));
  const rows = ref < 0 ? undefined : v2.accounts.rowsByPartyRef.get(ref);
  if (!rows) return 0;
  if (rows.length === 1) {
    const r = rows[0];
    return convert(v2.accounts.balance[r], currencyOfId(v2.accounts.currencyId[r]), currency, v2.fx);
  }
  let total = 0;
  for (const r of rows) total += convert(v2.accounts.balance[r], currencyOfId(v2.accounts.currencyId[r]), currency, v2.fx);
  return total;
}

/**
 * THE MONEY AN OBLIGATION IS DENOMINATED IN, named by its OWNER.
 *
 * A payment settles in the currency of the obligation behind it, and the obligation belongs to
 * somebody: a fund's capital call and its fees are in the fund's money, a bond's coupon in the
 * issuer's, a stock loan's collateral in the money the shares are quoted in. Pass the party that
 * OWNS the claim — not, reflexively, the payer: a capital call is paid BY the LP and owned BY the
 * fund, and reading the payer's books there would denominate the fund's call in the investor's
 * money.
 *
 * The money that party keeps its books in is a fact, not a convention: it is the currency its
 * account was opened in, which the seed took from its region. The numéraire appears only for a
 * party that has no account at all, which is a party that holds nothing.
 */
export function obligationCurrencyOf(v2: V2World, obligor: PartyRef): CurrencyCode {
  return homeCurrencyOf(v2, obligor) ?? NUMERAIRE;
}

/**
 * EVERY MONEY THIS PARTY HOLDS, and how much of each, in that money's own units. For the passes
 * that must move a whole position rather than its value — a resolution assuming a failed bank's
 * book takes over its FX position, it does not receive it netted into one currency.
 */
export function heldCurrenciesOf(v2: V2World, party: PartyRef): { currency: CurrencyCode; balance: number }[] {
  const ref = partyKeyRefOf(v2, partyKey(party));
  const rows = ref < 0 ? undefined : v2.accounts.rowsByPartyRef.get(ref);
  if (!rows) return [];
  return rows.map((r) => ({ currency: currencyOfId(v2.accounts.currencyId[r]), balance: v2.accounts.balance[r] }));
}

/**
 * §3.13-BOOK d5b — THE LIEN ON AN ACCOUNT. What of a row's balance the party only holds: the
 * stock-loan collateral it received and must return. One writer — the loan book's publish sets
 * every lender's lien, per currency, to the collateral its open loans carry — and one read every
 * spendable figure subtracts (`settlement.ts:stockLoanCollateralHeldLocal`).
 */
export function accountLienOf(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const r = accountRowOf(v2, party, currency);
  return r >= 0 ? v2.accounts.lien[r] : 0;
}

/** Set the lien on the party's row in one currency; a lien on a money the party has never held
 *  opens the row at zero, the way the first payment in that money would. */
export function setAccountLien(v2: V2World, party: PartyRef, currency: CurrencyCode, amount: number): void {
  if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error(`ENGINE DEFECT: lien of ${amount} on ${accountKey(party, currency)}`);
  const r = amount > 0 ? ensureAccount(v2, party, currency) : accountRowOf(v2, party, currency);
  if (r >= 0) mutableAccounts(v2).lien[r] = amount;
}

/** Every lien on the party's rows, summed in each row's own units — what its spendable reads net. */
export function partyLienLocal(v2: V2World, party: PartyRef): number {
  const ref = partyKeyRefOf(v2, partyKey(party));
  const rows = ref < 0 ? undefined : v2.accounts.rowsByPartyRef.get(ref);
  if (!rows) return 0;
  let total = 0;
  for (const r of rows) total += v2.accounts.lien[r];
  return total;
}

/** What the party holds, in the money it keeps its books in. */
function ownMoneyBalanceOf(v2: V2World, party: PartyRef): number {
  const home = homeCurrencyOf(v2, party);
  return home === undefined ? 0 : balanceOfIn(v2, party, home);
}

/** A balance SET by fiat — the harness's shocks only; no stage writes a balance. */
export function resetAccount(v2: V2World, party: PartyRef, currency: CurrencyCode, balance: number): void {
  mutableAccounts(v2).balance[ensureAccount(v2, party, currency)] = balance;
}

/**
 * THE OPENING CASH A GENERATED FIRM'S FOUNDERS PUT IN — stashed beside the firm at generation
 * (the same side channel the seed rings use, keyed by the object so the firm keeps its identity),
 * read by the seed to open the account and by a birth to pay it; never a field on the Company.
 */
const openingCashStash = new WeakMap<object, number>();
export function stashOpeningCash(comp: object, usd: number): void { openingCashStash.set(comp, usd); }
export function openingCashOf(comp: object): number { return openingCashStash.get(comp) ?? 0; }

/**
 * §3.13-SOV row 2 — THE SEED'S GOVERNMENT LADDER, and it is not a field.
 *
 * `Region.govDebtTranches` was the second of the sovereign's five parallel structures: a plain
 * array beside the one tranche store, written by three stages a week and read by fifteen callers.
 * The store is the ladder now. What is left is the SEED's need to build a ladder before the store
 * exists to hold it, which is the same need `stashOpeningCash` answers for an account — so it
 * rides the same kind of stash, and dies at `openSeededBooks` when the rows are issued. Nothing
 * in the weekly loop can read it, because a stash is not on the state.
 */
const seedGovLadderStash = new WeakMap<object, GovDebtTranche[]>();
export function stashSeedGovLadder(region: object, ladder: GovDebtTranche[]): void { seedGovLadderStash.set(region, ladder); }
export function seedGovLadderOf(region: object): GovDebtTranche[] { return seedGovLadderStash.get(region) ?? []; }

/** §3.13-BOOK d3a — THE SEED'S CENTRAL-BANK BOOK, and it is not a field. `CentralBank.
 *  sovereignHoldingsByBond` was a value-per-bond Record beside the register; the central bank's
 *  book is register rows now, opened by wire at `openSeededBooks`. What the seed sizes before the
 *  store exists rides this stash, like the government ladder above, and dies when the rows are
 *  issued. */
const seedCentralBankBookStash = new WeakMap<object, Record<string, number>>();
export function stashSeedCentralBankBook(sheet: object, byBond: Record<string, number>): void { seedCentralBankBookStash.set(sheet, byBond); }
export function seedCentralBankBookOf(sheet: object): Record<string, number> { return seedCentralBankBookStash.get(sheet) ?? {}; }

/** §3.13-BOOK d3b — THE SEED'S BANK SOVEREIGN BOOK, and it is not a field: each bank's opening
 *  book, bond by bond, sized by the seed (`initialization.ts` OWN6) and issued by wire at
 *  `openSeededBooks` onto the bank's own register book. */
const seedBankBookStash = new WeakMap<object, Record<string, number>>();
export function stashSeedBankBook(sheet: object, byBond: Record<string, number>): void { seedBankBookStash.set(sheet, byBond); }
export function seedBankBookOf(sheet: object): Record<string, number> { return seedBankBookStash.get(sheet) ?? {}; }
export const seedBankBookLocalOf = (sheet: object): number => Object.values(seedBankBookOf(sheet)).reduce((a, v) => a + (Number(v) || 0), 0);
/** The seed's PROVISIONAL regional sovereign-book scalar (a GDP ratio, `macro/initialization`),
 *  which sizes a bank's opening revenue before the real books are allocated. Never a field. */
const seedSovereignBookLocalStash = new WeakMap<object, number>();
export function stashSeedSovereignBookLocal(sheet: object, usd: number): void { seedSovereignBookLocalStash.set(sheet, usd); }
export function seedSovereignBookLocalOf(sheet: object): number { return seedSovereignBookLocalStash.get(sheet) ?? 0; }

/** A3.6c-iii — THE SEED'S PROVISIONAL HOUSEHOLD LINE of a bank sheet: sized as the funding
 *  residual while the seed builds the books (the migrations split by it), replaced by close-seed,
 *  which opens the household sector's row at each bank at the line it strikes. Never a field. */
const seedHouseholdLineStash = new WeakMap<object, number>();
export function stashSeedHouseholdLine(sheet: object, usd: number): void { seedHouseholdLineStash.set(sheet, usd); }
export function seedHouseholdLineOf(sheet: object): number { return seedHouseholdLineStash.get(sheet) ?? 0; }

// ---- A3.3/A3.4 — THE SECTOR PARTIES' ROWS, ONE PER BANK, CARRIED. A pool (an SME tier) and the
// household sector bank at every bank of their region: the balance is a row at each, moved by
// settlement's split of each leg and CARRIED week to week — never re-guessed from a total by
// this week's market shares. A bank's SME line is the sum of
// the pool rows at it; its household line the household sector's row at it. ----

/** How a sector party's per-bank rows are keyed: one row per bank AND per money held there. */
const bankSlot = (bankTicker: Ticker, currency: CurrencyCode): string => `${bankTicker}|${currency}`;

/** The sector party's row at a bank in one currency, opened at zero on first sight. */
function sectorRowAt(v2: V2World, party: PartyRef, bankTicker: Ticker, currency: CurrencyCode): number {
  const a = mutableAccounts(v2);
  const ref = internPartyKey(v2, partyKey(party));
  let byBank = a.bankRowsByParty.get(ref);
  if (!byBank) { byBank = new Map(); a.bankRowsByParty.set(ref, byBank); }
  const slot = bankSlot(bankTicker, currency);
  let r = byBank.get(slot);
  if (r === undefined) {
    if (a.n >= a.keyRef.length) growPersistent(a);
    r = a.n++;
    a.keyRef[r] = internAccount(v2, `${partyKey(party)}@${slot}`);
    a.balance[r] = 0; a.currencyId[r] = CURRENCY_ID[currency];
    byBank.set(slot, r);
  }
  return r;
}

/**
 * §3.13-BOOK d0 — THE SEED OPENS A SECTOR ROW AT A BANK. The one operation that SETS a sector
 * party's row (the household sector's line at each bank, a pool's row at each bank), used by the
 * seed's close and by nothing that runs in a week: a week moves a row by settlement's split of a
 * leg (`adjustSectorRow`) and never sets one. Before this the two seed sites reached through
 * `mutableAccounts` and wrote the column themselves — the wall's one door into the account store.
 */
export function openSectorRow(v2: V2World, party: PartyRef, bankTicker: Ticker, currency: CurrencyCode, balance: number): void {
  mutableAccounts(v2).balance[sectorRowAt(v2, party, bankTicker, currency)] = balance;
}

/** A sector party's balance across its banks, expressed in ONE money. */
function sectorCashOf(v2: V2World, party: PartyRef, currency: CurrencyCode): number {
  const ref = partyKeyRefOf(v2, partyKey(party));
  const byBank = ref < 0 ? undefined : v2.accounts.bankRowsByParty.get(ref);
  if (!byBank) return 0;
  let total = 0;
  byBank.forEach((r) => { total += convert(v2.accounts.balance[r], currencyOfId(v2.accounts.currencyId[r]), currency, v2.fx); });
  return total;
}
/** A pool's cash, in its own region's money. */
export const poolCashOf = (v2: V2World, region: RegionId, industry: string): number =>
  sectorCashOf(v2, { kind: 'SEGMENT', region, industry: industry as never }, currencyOf(region));
/** The household sector's deposits (A3.4), in its own region's money. */
export const householdDepositsOf = (v2: V2World, region: RegionId): number =>
  sectorCashOf(v2, { kind: 'HOUSEHOLD', region }, currencyOf(region));
/** §3.17-iv-a: the clearing house's cash across the region's banks, in the region's money. */
export const ccpCashOf = (v2: V2World, region: RegionId): number =>
  sectorCashOf(v2, ccpParty(region), currencyOf(region));

/** A bank's line of one sector kind: every such party's row at it, in the BANK's money — a
 *  deposit line is what the bank owes, and a bank keeps its book in one money. */
function sectorDepositsAt(v2: V2World, bankTicker: Ticker, kind: 'SEGMENT' | 'HOUSEHOLD' | 'CCP', currency: CurrencyCode): number {
  let total = 0;
  v2.accounts.bankRowsByParty.forEach((byBank, partyRef) => {
    if (!partyKeyOf(v2, partyRef).startsWith(kind + ':')) return;
    byBank.forEach((r, slot) => {
      if (!slot.startsWith(bankTicker + '|')) return;
      total += convert(v2.accounts.balance[r], currencyOfId(v2.accounts.currencyId[r]), currency, v2.fx);
    });
  });
  return total;
}
/** A bank's SME deposit line: every pool's row at it, in the bank's own money. The currency is
 *  the CALLER's to name — a bank's money is a fact about the bank, and every caller here holds
 *  the bank itself. (Deriving it from the bank's own account instead made the seed's funding
 *  residual read a line before the account existed: the SME line came back zero and the
 *  household residual swallowed it, 10.6B on the largest US bank.) */
const smeDepositsAt = (v2: V2World, bankTicker: Ticker, currency: CurrencyCode): number =>
  sectorDepositsAt(v2, bankTicker, 'SEGMENT', currency);
/** A bank's household deposit line: the household sector's row at it (A3.4). */
export const householdDepositsAt = (v2: V2World, bankTicker: Ticker, currency: CurrencyCode): number =>
  sectorDepositsAt(v2, bankTicker, 'HOUSEHOLD', currency);
/** §3.17-iv-a: the clearing house's row at a bank — the members' margin it keeps there. */
export const ccpDepositsAt = (v2: V2World, bankTicker: Ticker, currency: CurrencyCode): number =>
  sectorDepositsAt(v2, bankTicker, 'CCP', currency);

// ---- A3.6c-ii — THE CORPORATE AND INSTITUTIONAL LINES ARE THE DEPOSITORS' ACCOUNTS. A bank's
// corporate line is the sum of the accounts of the firms whose house bank it is (a resolved
// bank's shell banks at its acquirer like any firm), its institutional line the sum of the
// institutions' — summed in the holders' order, the order the pass rows sum in, so the read
// is the number the projection used to write. No field carries either. ----

/**
 * §3.13-BOOK (c-then-3b): `EntityId`, BECAUSE IT WAS `string` AND THAT COST A LIVE DEFECT.
 *
 * This re-declared `Company.homeBankTicker` as a bare `string`, so when the field became
 * `homeBankId` — an entity id — the two comparisons below still compiled and became **always
 * false**: every bank's corporate and institutional deposit line read ZERO, silently, and the
 * banks' balance sheets would have stopped closing with no error anywhere. `asTicker` at a map
 * boundary and an unbranded re-declaration of a branded field are the same hole, and this is the
 * second one this slice has found. A structural re-declaration of a domain field must carry the
 * domain type or it is a hole in the brand by construction.
 */
type Depositor = { homeBankId?: EntityId };
/** The bank a deposit line is read at: its identity in both spaces, and its money. */
type BankRef = { id: EntityId; ticker: Ticker; region?: RegionId };
/** A bank's corporate deposit line: every firm banking there, its account. */
function corporateDepositsAt(v2: V2World, companies: readonly (Depositor & Pick<Company, 'id' | 'isBankEntity' | 'bankBalanceSheet'>)[], bank: BankRef): number {
  let usd = 0;
  for (const c of companies) {
    if (c.homeBankId !== bank.id || (c.isBankEntity && c.bankBalanceSheet)) continue;
    usd += cashOf(v2, c);
  }
  return usd;
}
/** A bank's institutional deposit line: every institution banking there, its account. */
function institutionalDepositsAt(v2: V2World, entities: readonly (Depositor & Pick<InstitutionalEntity, 'id'>)[], bank: BankRef): number {
  let usd = 0;
  for (const e of entities) if (e.homeBankId === bank.id) usd += entityCashOf(v2, e);
  return usd;
}
/** A bank's four deposit lines, read off the ledger. */
export function depositLinesAt(
  v2: V2World,
  companies: readonly (Depositor & Pick<Company, 'id' | 'isBankEntity' | 'bankBalanceSheet'> & { region?: RegionId })[],
  entities: readonly (Depositor & Pick<InstitutionalEntity, 'id'>)[],
  bank: BankRef
): DepositLines {
  // §3.13-BOOK (c-then-3b): the bank's own money, off the bank. `bankMoneyOf` scanned every
  // company for the one whose ticker matched, per deposit-line read — a full scan to recover a
  // field the caller was already holding.
  const money = bank.region ? currencyOf(bank.region) : NUMERAIRE;
  return {
    householdLocal: householdDepositsAt(v2, bank.ticker, money),
    corporateLocal: corporateDepositsAt(v2, companies, bank),
    institutionalLocal: institutionalDepositsAt(v2, entities, bank),
    smeLocal: smeDepositsAt(v2, bank.ticker, money),
    ccpLocal: ccpDepositsAt(v2, bank.ticker, money),
  };
}
/** The lines in the week: the pass's own holders. */
export const bankDepositLines = (ctx: WeeklyStepContext, bank: BankRef): DepositLines =>
  depositLinesAt(ctx.v2, ctx.updatedCompanies, ctx.updatedInstitutionalEntities, bank);
/** The lines off a state (the audits, the UI, the harness). */
export const stateDepositLines = (state: { companies: readonly Company[]; institutionalEntities: readonly InstitutionalEntity[]; v2?: unknown }, bank: BankRef): DepositLines =>
  depositLinesAt(ensureV2(state as never), state.companies, state.institutionalEntities, bank);

/**
 * A3.4 — A BANK'S OWN BOOK MOVES A SECTOR ROW. The household loan pass and the evolution move a
 * bank's household line directly (a loan creates the borrower's deposit, amortization and
 * interest destroy it, the bank's deposit interest credits it —, the bank's second money
 * engine as DEPOSIT events on its own sheet): each such move is the household row at that bank
 * moving by the same amount, so the line and the row cannot disagree. Retired when those
 * passes are account operations themselves (A3.6).
 */
export function adjustSectorRow(v2: V2World, party: PartyRef, bankTicker: Ticker, currency: CurrencyCode, delta: number): void {
  if (delta === 0) return;
  mutableAccounts(v2).balance[sectorRowAt(v2, party, bankTicker, currency)] += delta;
}

/** A bank leaves (resolved, merged): every sector party's row at it joins its row at the assuming bank. */
export function moveSectorRowsToBank(v2: V2World, fromTicker: Ticker, toTicker: Ticker): void {
  v2.accounts.bankRowsByParty.forEach((byBank, partyRef) => {
    const party = partyFromKey(partyKeyOf(v2, partyRef));
    if (!party) return;
    // Each money moves to the same money at the assuming bank: an assumed deposit does not
    // change what it is denominated in, and converting one here would book an FX gain nobody made.
    [...byBank.keys()].filter((k) => k.startsWith(fromTicker + '|')).forEach((slot) => {
      const r = byBank.get(slot)!;
      const to = sectorRowAt(v2, party, toTicker, currencyOfId(v2.accounts.currencyId[r]));
      mutableAccounts(v2).balance[to] += v2.accounts.balance[r];
      mutableAccounts(v2).balance[r] = 0;
      byBank.delete(slot);
    });
  });
}

// ---- A3.6a — A BANK'S RESERVES ARE ITS ROW, CARRIED. The bank's own account at the central
// bank (`BANK:<ticker>`) lives on the world like every other party's: the seed opens it at the
// number close-seed strikes, the mirror opens the pass row FROM it, the projection writes the
// pass's result back INTO it and the sheet's `cashReservesLocal` from it. Every direct writer of
// the line between two passes — 02b's rounding of the evolved sheet, a merger moving a bank
// whole, the player's trade against a desk, the harness's reserve drain — is the row moving by
// the same amount (`adjustBankReserves`, `moveBankReserves`), the pattern A3.4's
// `adjustSectorRow` set; the mirror reports a line that moved without its row. The field's
// readers flip to `bankReservesOf` and the field dies in A3.6's next slice. ----

/** A bank's reserves, in its own money: every account it holds, converted at the cleared rate.
 *  (A3.6c — the sheet carries no line; this is the one read.) */
export function bankReservesOf(v2: V2World, bankId: EntityId): number {
  return ownMoneyBalanceOf(v2, bankPartyOf(bankId));
}

/** The bank's reserve row in ITS OWN money; a bank the seed did not open (no central bank in its
 *  region, a sheet scaled from the aggregate) opens at its line the first time a pass sees it. */
export function reserveRowOf(v2: V2World, bankId: EntityId, currency: CurrencyCode, opening: number): number {
  const party: PartyRef = bankPartyOf(bankId);
  const r = accountRowOf(v2, party, currency);
  return r >= 0 ? r : openAccount(v2, party, currency, opening);
}

/** A bank's own book moves its reserves line between passes: the row moves by the same amount.
 *  A bank with no row yet is opened at its line by the next mirror, which already carries the move. */
export function adjustBankReserves(v2: V2World, bankId: EntityId, delta: number): void {
  if (delta === 0) return;
  const party: PartyRef = bankPartyOf(bankId);
  const home = homeCurrencyOf(v2, party);
  if (home === undefined) return;
  const r = accountRowOf(v2, party, home);
  if (r >= 0) mutableAccounts(v2).balance[r] += delta;
}

/** A bank leaves whole (a merger): its reserves join the acquirer's rows, money by money. */
export function moveBankReserves(v2: V2World, fromBankId: EntityId, toBankId: EntityId): void {
  const from: PartyRef = bankPartyOf(fromBankId);
  const fromRef = partyKeyRefOf(v2, partyKey(from));
  const rows = fromRef < 0 ? undefined : v2.accounts.rowsByPartyRef.get(fromRef);
  if (!rows) return;
  rows.forEach((r) => {
    const cur = currencyOfId(v2.accounts.currencyId[r]);
    const to = reserveRowOf(v2, toBankId, cur, 0);
    mutableAccounts(v2).balance[to] += v2.accounts.balance[r];
    mutableAccounts(v2).balance[r] = 0;
  });
}

/** An institutional entity's cash, in its own money: its accounts, converted (A3.2). */
/** §3.13-BOOK (c2b): keyed by BOOK id, which is an entity's for an institution and
 *  `householdBookId(region)` for the household sector — `registerBooks` hands both, and the
 *  account store answers either. Not narrowed to `EntityId` for that reason. */
export function entityCashOf(v2: V2World, e: { id: string }): number {
  return ownMoneyBalanceOf(v2, { kind: 'INSTITUTION', id: asEntityId(e.id) });
}

// ---- A3.5 — THE TREASURY'S ACCOUNT IS ONE ROW. Its balance at the central bank and the
// ways-and-means advance are the two signs of the government party's net position: positive is
// the account, negative the advance drawn. The seed opens it at the operating balance; every
// pass moves it by the treasury's own payments; nothing else writes it. ----
export function treasuryNetOf(v2: V2World, region: RegionId): number {
  return balanceOfIn(v2, { kind: 'GOVERNMENT', region }, currencyOf(region));
}
/** The treasury's account at the central bank (a liability of the central bank). */
export function treasuryAccountOf(v2: V2World, region: RegionId): number { return Math.max(0, treasuryNetOf(v2, region)); }
/** The ways-and-means advance drawn (an asset of the central bank). */
export function waysAndMeansOf(v2: V2World, region: RegionId): number { return Math.max(0, -treasuryNetOf(v2, region)); }

/** A company's cash: its account. A bank's cash IS its reserves (A3.1b,, rule 4): its
 *  goods-market self settles on its reserve row and it has no company row at all. */
export function cashOf(v2: V2World, c: Pick<Company, 'id'> & { isBankEntity?: boolean; bankBalanceSheet?: unknown }): number {
  if (c.isBankEntity && c.bankBalanceSheet) return bankReservesOf(v2, c.id);
  return ownMoneyBalanceOf(v2, companyParty(c));
}

/** Which line of a bank's book (or of the central bank's) a row is. */
const ACCOUNT_CLASSES = ['CORPORATE', 'INSTITUTIONAL', 'SME', 'HOUSEHOLD', 'RESERVES', 'TREASURY', 'CREATED', 'SECURITIES', 'CCP', 'VOID'] as const;
type AccountClass = typeof ACCOUNT_CLASSES[number];

/** The bank a row sits at: a named bank, the central bank, or nowhere (transit, the house, issuance). */
const AT_CENTRAL_BANK = -1;
const AT_NOWHERE = -2;

interface AccountStore {
  n: number;
  partyId: Int32Array;
  /** Index into `banks` (a ticker per index), or AT_CENTRAL_BANK / AT_NOWHERE. */
  bankIdx: Int32Array;
  classId: Int8Array;
  /** Which money this row holds, as an index into CURRENCY_CODES. */
  currencyId: Int8Array;
  /** The row's balance, IN THE ROW'S OWN CURRENCY. */
  balance: Float64Array;
  /** The balance the row opened the pass with — a line moves by (balance − opening). */
  opening: Float64Array;
  /**
   * The pass's dense bank lane, and the row of each bank's OWN reserve account in its own money.
   *
   * §3.13-BOOK (c-then-3b): it holds the BANK, not one of its names. It was `Ticker[]`, so every
   * tally read off it came out keyed by ticker while every party that pointed AT a bank named it
   * by entity id — the one seam left after `homeBankId`, and the reason `bankIdxOf` needed a
   * translation table. Carrying both names costs one object per bank per pass and removes the
   * question of which name a consumer wanted: the tallies key by `id`, and the two sites that
   * need the register's or the persistent store's ticker take `.ticker` and say so.
   */
  banks: { id: EntityId; ticker: Ticker }[];
  reserveRowOfBank: Int32Array;
  bankIdxOfBank: Map<EntityId, number>;
  /** A bank's reserve row in a money that is not its own, opened the first time one arrives:
   *  `bankIdx * CURRENCY_CODES.length + currencyId` → row. A bank funding a euro deposit holds
   *  euro liquidity against it; netting that into its own reserves at the week's rate would
   *  book an FX position the bank never took. */
  foreignReserveRow: Map<number, number>;
  /** The rows of a party, in order, across every money it holds. */
  rowsOfParty: Map<number, number[]>;
  /** The rows of a party in ONE money, in bank order: party → currency id → rows. */
  rowsOfPartyCur: Map<number, Map<number, number[]>>;
  /** For the multi-row sector parties, how a payment splits across their rows. */
  splitOfParty: Map<number, Float64Array>;
  /** A4 — a bank's OWN-ACCOUNT parties (its BANK party and its goods-market self, both on its
   *  reserve row) by bank index, and each one's net over the pass: a bank's own income and
   *  expense, the one thing the rows' deltas cannot tell from a customer's money. */
  ownAccountBankOfParty: Map<number, number>;
  /** A bank's own income and expense over the pass, IN THE BANK'S OWN MONEY. A leg in another
   *  currency is converted on the way in: this is the one tally the rows' deltas cannot give
   *  (it is the difference between a bank's money and its customers'), so it is accumulated as
   *  it settles, and accumulating four currencies into it raw put a US bank's equity at −23.75B
   *  the first week its desk sold euros. */
  ownNetByParty: Map<number, number>;
  /** The rates this pass settles at — see `ctx.fx`, snapshotted at the week's open. */
  fx: FxTable;
}

function grow(s: AccountStore): void {
  const cap = s.partyId.length * 2;
  const gi = (o: Int32Array) => { const a = new Int32Array(cap); a.set(o); return a; };
  const g8 = (o: Int8Array) => { const a = new Int8Array(cap); a.set(o); return a; };
  const gf = (o: Float64Array) => { const a = new Float64Array(cap); a.set(o); return a; };
  s.partyId = gi(s.partyId); s.bankIdx = gi(s.bankIdx); s.classId = g8(s.classId);
  s.currencyId = g8(s.currencyId); s.balance = gf(s.balance); s.opening = gf(s.opening);
}

function newAccountStore(): AccountStore {
  const cap = 1 << 12;
  return {
    n: 0, partyId: new Int32Array(cap), bankIdx: new Int32Array(cap), classId: new Int8Array(cap),
    currencyId: new Int8Array(cap), balance: new Float64Array(cap), opening: new Float64Array(cap),
    banks: [], reserveRowOfBank: new Int32Array(0), bankIdxOfBank: new Map(), foreignReserveRow: new Map(),
    rowsOfParty: new Map(), rowsOfPartyCur: new Map(), splitOfParty: new Map(),
    ownAccountBankOfParty: new Map(), ownNetByParty: new Map(), fx: PARITY_FX,
  };
}

function bankIndex(s: AccountStore, bank: { id: EntityId; ticker: Ticker }): number {
  let i = s.bankIdxOfBank.get(bank.id);
  if (i === undefined) { i = s.banks.length; s.banks.push({ id: bank.id, ticker: bank.ticker }); s.bankIdxOfBank.set(bank.id, i); }
  return i;
}

function openRow(s: AccountStore, party: number, bankIdx: number, cls: AccountClass, currency: CurrencyCode, balance: number): number {
  if (s.n >= s.partyId.length) grow(s);
  const r = s.n++;
  const cur = CURRENCY_ID[currency];
  s.partyId[r] = party; s.bankIdx[r] = bankIdx; s.classId[r] = ACCOUNT_CLASSES.indexOf(cls);
  s.currencyId[r] = cur; s.balance[r] = balance; s.opening[r] = balance;
  const rows = s.rowsOfParty.get(party);
  if (rows) rows.push(r); else s.rowsOfParty.set(party, [r]);
  let byCur = s.rowsOfPartyCur.get(party);
  if (!byCur) { byCur = new Map(); s.rowsOfPartyCur.set(party, byCur); }
  const inCur = byCur.get(cur);
  if (inCur) inCur.push(r); else byCur.set(cur, [r]);
  return r;
}

/**
 * The party's rows in one money, opening them if it has never held it: one per bank it banks at,
 * in the same order as its home-money rows, so the split that spreads a sector leg across its
 * banks lines up. This is the moment a firm acquires a foreign-currency account, and it happens
 * because somebody paid it in that money — which is how it happens in the world.
 */
function rowsInCurrency(s: AccountStore, party: number, currency: CurrencyCode): number[] {
  const cur = CURRENCY_ID[currency];
  let byCur = s.rowsOfPartyCur.get(party);
  if (!byCur) { byCur = new Map(); s.rowsOfPartyCur.set(party, byCur); }
  const existing = byCur.get(cur);
  if (existing) return existing;
  const template = s.rowsOfParty.get(party);
  if (!template || template.length === 0) return [];
  // Mirror the party's FIRST money — its home rows — bank for bank.
  const homeCur = s.currencyId[template[0]];
  const homeRows = byCur.get(homeCur) ?? template;
  homeRows.forEach((r) => openRowRaw(s, party, s.bankIdx[r], s.classId[r], cur, 0));
  return byCur.get(cur) ?? [];
}

/**
 * `openRow` by raw ids — the internal form the on-demand foreign row uses. It registers the row
 * on BOTH indexes: `rowsOfParty` for the party's whole position and `rowsOfPartyCur` for the
 * money it holds. Registering only the first is how a foreign reserve row settled all week and
 * was then dropped by the projection, which reads per money.
 */
function openRowRaw(s: AccountStore, party: number, bankIdx: number, classId: number, cur: number, balance: number): number {
  if (s.n >= s.partyId.length) grow(s);
  const r = s.n++;
  s.partyId[r] = party; s.bankIdx[r] = bankIdx; s.classId[r] = classId;
  s.currencyId[r] = cur; s.balance[r] = balance; s.opening[r] = balance;
  const rows = s.rowsOfParty.get(party);
  if (rows) rows.push(r); else s.rowsOfParty.set(party, [r]);
  let byCur = s.rowsOfPartyCur.get(party);
  if (!byCur) { byCur = new Map(); s.rowsOfPartyCur.set(party, byCur); }
  const inCur = byCur.get(cur);
  if (inCur) inCur.push(r); else byCur.set(cur, [r]);
  return r;
}

/**
 * The mirror: every balance the books carry today, as rows. Built from the fields as they stand
 * at the moment of the pass (the same objects settlement's legacy apply will write).
 */
export function buildAccountMirror(ctx: WeeklyStepContext): AccountStore {
  const s = newAccountStore();
  s.fx = ctx.fx;
  const banks = ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet);
  const a = ctx.v2.accounts;
  /** Open a party's pass rows: its home money first, then every OTHER money it carried into the
   *  week — a firm paid in yen last week still holds yen this week, and a mirror that opened only
   *  its home row would settle that balance out of existence. */
  const openCarried = (party: PartyRef, bankIdx: number, cls: AccountClass, home: CurrencyCode): number => {
    const row = openRow(s, partyId(party), bankIdx, cls, home, ctx.v2.accounts.balance[ensureAccount(ctx.v2, party, home)]);
    (a.rowsByPartyRef.get(internPartyKey(ctx.v2, partyKey(party))) ?? []).forEach((pr) => {
      const cur = currencyOfId(a.currencyId[pr]);
      if (cur !== home) openRow(s, partyId(party), bankIdx, cls, cur, a.balance[pr]);
    });
    return row;
  };
  // Banks first: every other row may point at one, and a bank's own COMPANY party is its reserves.
  s.reserveRowOfBank = new Int32Array(Math.max(1, banks.length)).fill(-1);
  banks.forEach((b) => {
    const bi = bankIndex(s, b);
    if (s.reserveRowOfBank.length <= bi) { const arr = new Int32Array(bi + 16).fill(-1); arr.set(s.reserveRowOfBank); s.reserveRowOfBank = arr; }
    // A3.6a/c: the pass row opens at the persistent row — the bank's reserves ARE that row.
    const money = currencyOf(b.region);
    const ownAccount: PartyRef = bankParty(b);
    const row = openRow(s, partyId(ownAccount), AT_CENTRAL_BANK, 'RESERVES', money,
      ctx.v2.accounts.balance[reserveRowOf(ctx.v2, b.id, money, 0)]);
    s.reserveRowOfBank[bi] = row;
    // Any other money the bank carried into the week is its foreign liquidity row.
    (a.rowsByPartyRef.get(internPartyKey(ctx.v2, partyKey(ownAccount))) ?? []).forEach((pr) => {
      const cur = a.currencyId[pr];
      if (currencyOfId(cur) === money) return;
      s.foreignReserveRow.set(bi * CURRENCY_CODES.length + cur,
        openRow(s, partyId(ownAccount), AT_CENTRAL_BANK, 'RESERVES', currencyOfId(cur), a.balance[pr]));
    });
    // The bank's COMPANY party (its goods-market self) settles on its own reserves.
    s.rowsOfParty.set(partyId(companyParty(b)), s.rowsOfParty.get(partyId(ownAccount))!.slice());
    s.rowsOfPartyCur.set(partyId(companyParty(b)), new Map(s.rowsOfPartyCur.get(partyId(ownAccount))!));
    s.ownAccountBankOfParty.set(partyId(ownAccount), bi);
    s.ownAccountBankOfParty.set(partyId(companyParty(b)), bi);
    // Its credit-creation and securities accounts: voids at the bank itself.
    openRow(s, partyId(bankCreditParty(b)), bi, 'CREATED', money, 0);
    openRow(s, partyId(bankSecuritiesParty(b)), bi, 'SECURITIES', money, 0);
  });
  // §3.13-BOOK (c-then-3b): a party names its house bank by ENTITY id; the pass's dense bank
  // lane is still keyed by ticker, so this is where the two spaces meet. The lane's key is the
  // next commit in this slice — until then the translation is HERE, at one site, rather than at
  // every caller.
  // §3.13-BOOK (c-then-3b): ONE SPACE. A party names its house bank by entity id and the lane is
  // keyed by entity id, so the translation table that stood here — built per pass, from a lookup
  // in one name to a lookup in another — is gone rather than moved.
  const bankIdxOf = (bankId: EntityId | undefined): number =>
    (bankId !== undefined ? s.bankIdxOfBank.get(bankId) : undefined) ?? AT_NOWHERE;
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity && c.bankBalanceSheet) return;
    // A3.1: the pass row opens at the persistent balance; a firm with no account yet opens at zero.
    openCarried(companyParty(c), bankIdxOf(c.homeBankId), 'CORPORATE', currencyOf(c.region));
  });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    // A3.2: the pass row opens at the persistent balance; an entity with no account opens at zero.
    openCarried({ kind: 'INSTITUTION', id: e.id }, bankIdxOf(e.homeBankId), 'INSTITUTIONAL', currencyOf(e.region));
  });
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region];
    const money = currencyOf(region);
    const regionBanks = banks.filter((b) => b.region === region && !b.isDefaulted);
    const shareSum = regionBanks.reduce((acc, b) => acc + (b.bankMarketShare ?? 0), 0);
    // The household sector: its balance at each bank is that bank's household line, and a leg
    // lands on the banks by market share at once — the split the pools' legs always had.
    const hhParty: PartyRef = { kind: 'HOUSEHOLD', region };
    const hh = partyId(hhParty);
    const hhSplit: number[] = [];
    regionBanks.forEach((b) => {
      openRow(s, hh, s.bankIdxOfBank.get(b.id)!, 'HOUSEHOLD', money, ctx.v2.accounts.balance[sectorRowAt(ctx.v2, hhParty, b.ticker, money)]);
      hhSplit.push(shareSum > 0 ? (b.bankMarketShare ?? 0) / shareSum : 1 / Math.max(1, regionBanks.length));
    });
    if (regionBanks.length === 0) { openRow(s, hh, AT_NOWHERE, 'HOUSEHOLD', money, householdDepositsOf(ctx.v2, region)); hhSplit.push(1); }
    s.splitOfParty.set(hh, Float64Array.from(hhSplit));
    // The pools: a CARRIED row at each bank (A3.3); a leg splits across them by market share.
    (reg.smePools ?? []).forEach((seg) => {
      const party: PartyRef = { kind: 'SEGMENT', region, industry: seg.industry };
      const p = partyId(party);
      const split: number[] = [];
      regionBanks.forEach((b) => {
        const sh = shareSum > 0 ? (b.bankMarketShare ?? 0) / shareSum : 1 / Math.max(1, regionBanks.length);
        openRow(s, p, s.bankIdxOfBank.get(b.id)!, 'SME', money, ctx.v2.accounts.balance[sectorRowAt(ctx.v2, party, b.ticker, money)]);
        split.push(sh);
      });
      if (regionBanks.length === 0) { openRow(s, p, AT_NOWHERE, 'SME', money, poolCashOf(ctx.v2, region, seg.industry)); split.push(1); }
      s.splitOfParty.set(p, Float64Array.from(split));
    });
    // §3.17-iv-a: the clearing house — a CARRIED row at each bank like a pool's, its members'
    // margin landing on the banks by market share (a CCP keeps its cash across its settlement
    // banks; there is no house bank).
    {
      const ccp = ccpParty(region);
      // The house keeps its books in its region's money (a pending-net read converts into it).
      setHomeCurrency(ctx.v2, ccp, money);
      const p = partyId(ccp);
      const split: number[] = [];
      regionBanks.forEach((b) => {
        openRow(s, p, s.bankIdxOfBank.get(b.id)!, 'CCP', money, ctx.v2.accounts.balance[sectorRowAt(ctx.v2, ccp, b.ticker, money)]);
        split.push(shareSum > 0 ? (b.bankMarketShare ?? 0) / shareSum : 1 / Math.max(1, regionBanks.length));
      });
      if (regionBanks.length === 0) { openRow(s, p, AT_NOWHERE, 'CCP', money, ccpCashOf(ctx.v2, region)); split.push(1); }
      s.splitOfParty.set(p, Float64Array.from(split));
    }
    // A3.5: the treasury's net position at the central bank — its persistent row.
    openCarried({ kind: 'GOVERNMENT', region }, AT_CENTRAL_BANK, 'TREASURY', money);
    openRow(s, partyId({ kind: 'CENTRAL_BANK', region }), AT_NOWHERE, 'VOID', money, 0);
    openRow(s, partyId({ kind: 'CLEARING_HOUSE', region }), AT_NOWHERE, 'VOID', money, 0);
  });
  return s;
}

/**
 * ONE SETTLED ROW, BY THE ONE RULE — AND IT MOVES ONE CURRENCY.
 *
 * A payment is denominated in the money of the obligation behind it, and both legs move that
 * money: the payer pays euros, the payee receives euros, and the payee HOLDS them until it
 * decides otherwise. That is what a foreign-currency account is for, and it is the only version
 * of this in which a party can hold one.
 *
 * REJECTED, AND WHY (§3.13c-FX). The version before this converted each leg into the money that
 * side keeps its books in. It conserved value and closed every identity, and it was wrong three
 * ways: no party ever ended a week holding a second currency, so the per-currency account was
 * dead code; `fx-clearing.ts:108` ALREADY models the same conversion as the order flow that
 * clears the rate, so the ledger was a second representation of one event, priced at mid by
 * nobody; and `05-unit-bidding` already charges a desk spread on that flow, which the ledger's
 * free conversion undercut. A party that cannot pay in a money it lacks must BUY it — see
 * `fx-funding.ts` — and buying it is a trade with a counterparty and a price.
 */
export function applySettledRow(s: AccountStore, payer: number, payee: number, amount: number, currency: CurrencyCode): boolean {
  if (!s.rowsOfParty.has(payer) || !s.rowsOfParty.has(payee)) return false;
  const pr = rowsInCurrency(s, payer, currency), qr = rowsInCurrency(s, payee, currency);
  if (pr.length === 0 || qr.length === 0) return false;
  side(s, payer, pr, -amount);
  side(s, payee, qr, amount);
  return true;
}

function side(s: AccountStore, party: number, rows: number[], delta: number): void {
  const ownBank = s.ownAccountBankOfParty.get(party);
  if (ownBank !== undefined) {
    // In the BANK's money: a leg in a customer's currency is that bank's income all the same,
    // and it is worth what it converts to. Every row here shares one currency by construction.
    const reserveRow = s.reserveRowOfBank[ownBank];
    const into = reserveRow >= 0 ? currencyOfId(s.currencyId[reserveRow]) : currencyOfId(s.currencyId[rows[0]]);
    const own = convert(delta, currencyOfId(s.currencyId[rows[0]]), into, s.fx);
    s.ownNetByParty.set(party, (s.ownNetByParty.get(party) ?? 0) + own);
  }
  if (rows.length === 1) { leg(s, rows[0], delta); return; }
  const split = s.splitOfParty.get(party);
  for (let i = 0; i < rows.length; i++) { const w = split ? split[i] : 1 / rows.length; if (w !== 0) leg(s, rows[i], delta * w); }
}

function leg(s: AccountStore, row: number, delta: number): void {
  s.balance[row] += delta;
  const bi = s.bankIdx[row];
  if (bi >= 0) {
    const rr = reserveRowFor(s, bi, s.currencyId[row]);
    if (rr >= 0) s.balance[rr] += delta;
  }
}

/** The bank's reserve row in one money: its own account for its own currency, a liquidity row
 *  opened on demand for any other. Reserves settle in the money the deposit is denominated in. */
function reserveRowFor(s: AccountStore, bankIdx: number, cur: number): number {
  const own = s.reserveRowOfBank[bankIdx];
  if (own < 0 || s.currencyId[own] === cur) return own;
  const key = bankIdx * CURRENCY_CODES.length + cur;
  const existing = s.foreignReserveRow.get(key);
  if (existing !== undefined) return existing;
  const r = openRowRaw(s, s.partyId[own], AT_CENTRAL_BANK, ACCOUNT_CLASSES.indexOf('RESERVES'), cur, 0);
  s.foreignReserveRow.set(key, r);
  return r;
}

/** A4 — what the pass settled, read off the rows' deltas. */
interface SettledTallies {
  /** Reserve movement per bank — what it settled across the central bank's books. */
  reserveDeltaByBank: Map<EntityId, number>;
  /** Deposits created by this bank's own lending — they need no reserve settlement. */
  creditCreatedByBank: Map<EntityId, number>;
  /** Reserves a bank's own SECURITIES account paid (−) or received (+): one asset for another. */
  bankSecuritiesDeltaByBank: Map<EntityId, number>;
  /** Payments to/from a bank on its own account — income and expense, so equity moves too. */
  bankEquityDeltaByBank: Map<EntityId, number>;
  /** Treasury account movement per region. */
  tgaDeltaByRegion: Map<string, number>;
  /** Reserves the central bank ISSUED (paid for assets with money it created), less what it
   *  extinguished — the one party whose payments are not funded from a balance. IN THE NUMÉRAIRE:
   *  it sums four central banks' books, and four monies do not add. */
  centralBankIssuanceLocal: number;
  /** §3.13c — THE CENTRAL BANKS' IDENTITY, IN THE NUMÉRAIRE: every reserve row and every treasury
   *  row this pass moved, less what the central banks issued. Computed here rather than from the
   *  per-book maps because those are each in their OWN book's money and summing them across four
   *  currencies is the very mistake this step exists to remove. Must be zero. */
  centralBankResidualNumeraire: number;
  centralBankIssuanceByRegion: Map<string, number>;
  /** What the cleared books' central counterparty was left holding. Must be zero. */
  clearingHouseResidualLocal: number;
  /** Money that landed on a holder with no bank (a firm or fund with no house bank, a sector
   *  with no live bank in its region): counted, never dropped. Must be zero. */
  unresolvedLocal: number;
}

/**
 * A4 — THE TALLIES ARE READS OF THE ROWS' DELTAS. Settlement used to resolve every
 * party's net through a nine-way switch on its kind to find which bank line it moved and to
 * keep a dozen tallies beside the writes. The store already knows every row's bank and class
 * and every row's opening balance, so what the pass settled is one walk over the rows; a bank's
 * own-account nets (its income and expense) are the two parties on its reserve row, netted as
 * they settled (`ownNetByParty`) — the same two sums the switch kept, added in the same order.
 */
export function settledTallies(s: AccountStore, fx: FxTable): SettledTallies {
  const t: SettledTallies = {
    reserveDeltaByBank: new Map(), creditCreatedByBank: new Map(), bankSecuritiesDeltaByBank: new Map(),
    bankEquityDeltaByBank: new Map(), tgaDeltaByRegion: new Map(),
    centralBankIssuanceLocal: 0, centralBankResidualNumeraire: 0, centralBankIssuanceByRegion: new Map(),
    clearingHouseResidualLocal: 0, unresolvedLocal: 0,
  };
  const addTo = <K,>(m: Map<K, number>, k: K, d: number) => m.set(k, (m.get(k) ?? 0) + d);
  /** A row's move, in the money of the book that reports it. */
  const moved = (r: number, into: CurrencyCode): number =>
    convert(s.balance[r] - s.opening[r], currencyOfId(s.currencyId[r]), into, fx);
  s.banks.forEach((bank, bi) => {
    const rr = s.reserveRowOfBank[bi];
    if (rr < 0) return;
    const money = currencyOfId(s.currencyId[rr]);
    { const d = moved(rr, money); if (d !== 0) addTo(t.reserveDeltaByBank, bank.id, d); }
    t.centralBankResidualNumeraire += moved(rr, NUMERAIRE);
    // What it settled in every OTHER money is reserve movement too, at this pass's rate.
    CURRENCY_CODES.forEach((cur, ci) => {
      const fr = s.foreignReserveRow.get(bi * CURRENCY_CODES.length + ci);
      if (fr === undefined) return;
      const d = moved(fr, money); if (d !== 0) addTo(t.reserveDeltaByBank, bank.id, d);
      t.centralBankResidualNumeraire += moved(fr, NUMERAIRE);
    });
    const own = s.ownNetByParty.get(partyId(bankParty(bank))) ?? 0;
    const self = s.ownNetByParty.get(partyId(companyParty(bank))) ?? 0;
    if (own !== 0) addTo(t.bankEquityDeltaByBank, bank.id, own);
    if (self !== 0) addTo(t.bankEquityDeltaByBank, bank.id, self);
  });
  for (let r = 0; r < s.n; r++) {
    if (s.balance[r] === s.opening[r]) continue;
    const cls = ACCOUNT_CLASSES[s.classId[r]];
    const bi = s.bankIdx[r];
    // Every tally below is a book's own line, so each is read in that book's money: a bank's in
    // the bank's, a treasury's in its region's. A pass that moved two currencies reports one
    // number per book, converted at the rate that pass settled at, and never a bare sum.
    const into = bi >= 0 && s.reserveRowOfBank[bi] >= 0
      ? currencyOfId(s.currencyId[s.reserveRowOfBank[bi]])
      : currencyOfId(s.currencyId[r]);
    const d = moved(r, into);
    switch (cls) {
      case 'CREATED': addTo(t.creditCreatedByBank, s.banks[bi].id, -d); break;
      case 'SECURITIES': addTo(t.bankSecuritiesDeltaByBank, s.banks[bi].id, d); break;
      case 'TREASURY': {
        const p = partyOf(s.partyId[r]);
        if (p.kind === 'GOVERNMENT') { addTo(t.tgaDeltaByRegion, p.region, d); t.centralBankResidualNumeraire += moved(r, NUMERAIRE); }
        break;
      }
      case 'VOID': {
        const p = partyOf(s.partyId[r]);
        if (p.kind === 'CENTRAL_BANK') {
          t.centralBankIssuanceLocal -= moved(r, NUMERAIRE);
          t.centralBankResidualNumeraire += moved(r, NUMERAIRE);
          addTo(t.centralBankIssuanceByRegion, p.region, -d);
        }
        else if (p.kind === 'CLEARING_HOUSE') t.clearingHouseResidualLocal += d;
        break;
      }
      case 'CORPORATE': case 'INSTITUTIONAL': case 'SME': case 'HOUSEHOLD': case 'CCP':
        if (bi === AT_NOWHERE) t.unresolvedLocal += d;
        break;
      case 'RESERVES': break;
    }
  }
  return t;
}

/**
 * THE PROJECTION — the persistent accounts, written from the pass store after a pass: every
 * party's balance is its rows. No book carries a balance any more (A3.1–A3.5); equity is not a
 * balance and stays the pass's own (the bank's own-account legs are its income and expense).
 */
export function projectBooks(ctx: WeeklyStepContext, s: AccountStore): void {
  // A3.3/A3.4: the sector parties' pass rows land on their persistent per-bank rows FIRST — the
  // bank sheets below read the SME and household lines off them.
  const landSectorRows = (party: PartyRef) => {
    (s.rowsOfParty.get(partyId(party)) ?? []).forEach((r) => {
      const bi = s.bankIdx[r];
      if (bi >= 0) mutableAccounts(ctx.v2).balance[sectorRowAt(ctx.v2, party, s.banks[bi].ticker, currencyOfId(s.currencyId[r]))] = s.balance[r];
    });
  };
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region];
    landSectorRows({ kind: 'HOUSEHOLD', region });
    (reg.smePools ?? []).forEach((seg) => landSectorRows({ kind: 'SEGMENT', region, industry: seg.industry }));
    landSectorRows(ccpParty(region));
  });
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity && c.bankBalanceSheet) {
      const bi = s.bankIdxOfBank.get(c.id); if (bi === undefined) return;
      // A3.6: the pass's result is the persistent row; the sheet carries no reserves line and no
      // deposit line (the sector rows landed above ARE its household and SME lines). Its own
      // money and every other it settled in each land on their own row.
      landEveryMoney(ctx, s, bankParty(c));
      return;
    }
    // A3.1: the pass's result is the persistent balance, money by money.
    landEveryMoney(ctx, s, companyParty(c));
  });
  ctx.updatedInstitutionalEntities.forEach((e) => landEveryMoney(ctx, s, { kind: 'INSTITUTION', id: e.id }));
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((region) => {
    // A3.5: the pass's result is the persistent row; the two signs are reads.
    landEveryMoney(ctx, s, { kind: 'GOVERNMENT', region });
  });
}

/** A party's pass rows land on its persistent accounts, one per money — never netted together:
 *  a firm that ended the week holding dollars and yen holds both next week. */
function landEveryMoney(ctx: WeeklyStepContext, s: AccountStore, party: PartyRef): void {
  const byCur = s.rowsOfPartyCur.get(partyId(party));
  if (!byCur) return;
  byCur.forEach((rows, cur) => {
    let total = 0; for (const r of rows) total += s.balance[r];
    mutableAccounts(ctx.v2).balance[ensureAccount(ctx.v2, party, currencyOfId(cur))] = total;
  });
}
// A3.5: `compareToBooks` — the first slice's gate — is gone with the last field it
// compared: no book carries a balance any more.

