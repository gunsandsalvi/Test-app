/**
 * §3.13-BOOK d4b — ONE DOOR FOR EVERY BILATERAL OBLIGATION.
 *
 * Six books hold contracts between two named parties — the derivatives book, the repo book, the
 * stock-loan book, the prime-brokerage book, the trade invoices and a private fund's capital
 * commitments — and each was written by its own stage with a bare array assignment, so a
 * contract on a party that did not exist was something `O5` or `O8` found a week later rather
 * than something the write refused. Every write goes through here now, as a NAMED operation:
 * a strike, a publish, a novation, a draw, a repayment, a settlement. Each resolves the parties it
 * names against the active wire world (§3.13-BOOK d2's resolver), the same door a payment and a
 * holding already pass, so a contract naming nobody defects at the site.
 *
 * The books keep their shapes and the stages keep their arithmetic; only the writes moved. One
 * columnar store for the six is slice d4c's.
 */
import type { InterbankLoan } from '../../domain/interbank';
import type { CentralBankLoan } from '../../domain/central-bank-loan';
import type { V2World } from '../../engine2/world';
import { kindEpochOf, writeInvoiceRow, materializeInvoice, writeCommitmentRow, writeDrawn, materializeCommitment, commitmentIdOf, liveObligationsOf, rowsOfKind, rowsOfKindInRegion, relinkKind, relinkKindInRegion, materializeDerivative, materializeRepo, writeInterbankRow, writeInterbankTerms, materializeInterbank, writeCentralBankLoanRow, writeCentralBankLoanTerms, materializeCentralBankLoan, materializeLoan, materializePrimeBrokerageLine, derivativeRowOf, writeDerivativeRow, writeSettledMark, writeDerivativeUnits, writeDerivativeSize, writeDerivativeParties, writeRepoRow, writeCcpFundRow, writeCcpFundAmount, materializeCcpFund, ccpFundIdOf, writeRepoTerms, writeLoanRow, writeLoanTerms, writePrimeBrokerageRow, writePrimeBrokerageTerms } from '../../engine2/obligations';
import type { RegionId } from '../../domain/geography';
import type { WeeklyStepContext } from '../simulation/stages/context';
import { derivativePartyKey, type DerivativeClassId, type DerivativeContract, type DerivativeParty } from '../../domain/derivatives/contract';
import { type RepoContract, encumberedFaceByBond } from '../../domain/repo';
import { setLien } from './holdings-ledger';
import { setAccountLien, ccpCashOf, obligationCurrencyOf } from './accounts';
import { ccpOfContract, ccpSheetOf, MEMBERS_PER_CONTRACT, type CcpSheet, type CcpFundContribution } from '../../domain/clearing-house';
import { convert } from '../../domain/currency';
import { REGION_IDS, currencyOf, type CurrencyCode } from '../../domain/geography';
import type { SecurityLoan } from '../../domain/securities-lending';
import type { PrimeBrokerageLine } from '../../domain/prime-brokerage';
import { bankPartyOf, companyPartyOf } from '../../domain/party';
import { initialMarginLocal } from '../../domain/derivatives/registry';
import type { TradeInvoice } from '../../domain/trade-invoice';
import type { LpCommitment } from '../../domain/commitment';
import type { EntityId, InstrumentId } from '../../domain/ids';
import { partyFromKey, partyKey, type PartyRef } from './party';
import { partyKeyOf } from '../../engine2/world';
import { resolvePartyRef } from './wire';
import { defect } from '../../domain/defect';

/**
 * §3.13-BOOK d4c-i — THE DERIVATIVES ARE ROWS OF THE CONTRACT STORE (`engine2/obligations.ts`).
 * The week's working copy is the store materialized once, on first touch, with each object
 * carrying its row; a strike writes rows and appends to the copy, the lifecycle's survivors are
 * relinked from the copy (and the marks they settled written back), a novation re-points rows.
 * `GameState.derivativesBook` is gone: the store rides the world into next week and every clone.
 */
const ROW: unique symbol = Symbol('obligation row');
type Rowed = { [ROW]?: number };
const tagRow = <T extends object>(c: T, r: number): T => {
  Object.defineProperty(c, ROW, { value: r, enumerable: false, writable: true, configurable: true });
  return c;
};
const rowOfContract = (c: DerivativeContract): number => {
  const r = (c as Rowed)[ROW];
  return r === undefined ? defect(`derivative ${c.id} is not on the contract store`) : r;
};

/**
 * §3.17-iv-a — THE CLEARING HOUSE'S SHEET, read off the books. Its cash is its rows at the
 * region's banks (`accounts.ts:ccpCashOf`); the margin it holds is the initial margin of every
 * live contract that clears in its money (`clearing-house.ts:ccpOfContract`), a fact of each
 * contract (§3.17-i) and never re-derived. §3.13-BOOK d5c's lien on the dealer's securities
 * account — set by every derivative write to the margin the dealer's live contracts carried —
 * is gone: the dealer holds no margin, the CCP does, and `O15` holds its cash to this read.
 */
export function ccpMarginHeldLocal(v2: V2World, region: RegionId): number {
  let total = 0;
  // §3.17-iv-b: both members post, so the house holds the contract's margin twice over.
  derivativesOf(v2).forEach((c) => { if (ccpOfContract(c).region === region) total += MEMBERS_PER_CONTRACT * initialMarginLocal(c); });
  return total;
}
export const ccpSheetAt = (v2: V2World, region: RegionId): CcpSheet => ccpSheetOf(ccpCashOf(v2, region), ccpMarginHeldLocal(v2, region), ccpFundLocal(v2, region));

/**
 * §3.17-iv-b — A MEMBER'S MARGIN AT THE HOUSE IS ITS ASSET: the initial margin of every live
 * contract it stands on, on either side, in the money asked for. A bank carries it on its sheet
 * beside its register books (`desk-register.ts:bankBookAssetsLocal`), because it posted from its
 * securities account and reserves left without equity moving.
 */
export function memberMarginPostedLocal(v2: V2World, party: DerivativeParty, into: CurrencyCode, /** Only contracts struck before this week (§3.17-v-i: a capacity read against cash that has already paid this week's postings). */ beforeWeek?: number): number {
  const key = derivativePartyKey(party);
  let total = 0;
  derivativesOf(v2).forEach((c) => {
    if (beforeWeek !== undefined && c.struckWeek >= beforeWeek) return;
    const sides = (derivativePartyKey(c.a) === key ? 1 : 0) + (derivativePartyKey(c.b) === key ? 1 : 0);
    if (sides) total += sides * convert(initialMarginLocal(c), c.currency, into, v2.fx);
  });
  return total;
}
/** A bank's margin at the house, in the money it keeps its books in. */
export const bankMarginAtHouseLocal = (v2: V2World, bankId: EntityId): number =>
  memberMarginPostedLocal(v2, bankPartyOf(bankId), obligationCurrencyOf(v2, bankPartyOf(bankId)));

/**
 * §3.17-iv-c-i — THE MEMBERS OF A HOUSE, and the margin each has at it: every party on a live
 * contract that clears in the house's money. The fund is sized and shared off this read.
 */
export function membersOfHouse(v2: V2World, region: RegionId): Map<string, { member: DerivativeParty; marginLocal: number }> {
  const out = new Map<string, { member: DerivativeParty; marginLocal: number }>();
  derivativesOf(v2).forEach((c) => {
    if (ccpOfContract(c).region !== region) return;
    [c.a, c.b].forEach((member) => {
      const key = derivativePartyKey(member);
      const row = out.get(key) ?? { member, marginLocal: 0 };
      row.marginLocal += initialMarginLocal(c);
      out.set(key, row);
    });
  });
  return out;
}

/**
 * §3.17-v-ii — THE MARKET VIEW: what a house clears and who carries it. Open interest per class
 * (contracts and notional, in the house's money), the house's sheet, and every member with the
 * margin and fund it has at the house and, per class, its gross and its NET position — the
 * class's first role (pays fixed, buys protection, long, hedger) counted long and the other
 * short, so a member on both sides of a class nets. One read off the store and the fund rows;
 * the region's UI shows it as a function and the harness prints it (`DRV_TRACE=1`).
 */
interface HouseClassView { contracts: number; notionalLocal: number }
interface HouseMemberClassView { contracts: number; grossLocal: number; netLocal: number }
export interface HouseMemberView {
  member: DerivativeParty;
  marginLocal: number;
  fundLocal: number;
  byClass: Partial<Record<DerivativeClassId, HouseMemberClassView>>;
}
interface HouseView {
  regionId: RegionId;
  sheet: CcpSheet;
  openInterest: Partial<Record<DerivativeClassId, HouseClassView>>;
  /** Members largest margin first. */
  members: HouseMemberView[];
}
export function houseViewOf(v2: V2World, region: RegionId): HouseView {
  const openInterest: Partial<Record<DerivativeClassId, HouseClassView>> = {};
  const byKey = new Map<string, HouseMemberView>();
  const memberOf = (p: DerivativeParty): HouseMemberView => {
    const key = derivativePartyKey(p);
    let m = byKey.get(key);
    if (!m) { m = { member: p, marginLocal: 0, fundLocal: 0, byClass: {} }; byKey.set(key, m); }
    return m;
  };
  derivativesOf(v2).forEach((c) => {
    if (ccpOfContract(c).region !== region) return;
    const oi = openInterest[c.classId] ?? (openInterest[c.classId] = { contracts: 0, notionalLocal: 0 });
    oi.contracts += 1; oi.notionalLocal += c.notional;
    ([['a', 1], ['b', -1]] as const).forEach(([side, sign]) => {
      const m = memberOf(c[side]);
      m.marginLocal += initialMarginLocal(c);
      const k = m.byClass[c.classId] ?? (m.byClass[c.classId] = { contracts: 0, grossLocal: 0, netLocal: 0 });
      k.contracts += 1; k.grossLocal += c.notional; k.netLocal += sign * c.notional;
    });
  });
  ccpFundOf(v2, region).forEach((f) => { memberOf(f.member).fundLocal += f.amountLocal; });
  const members = [...byKey.values()].sort((x, y) => y.marginLocal - x.marginLocal);
  return { regionId: region, sheet: ccpSheetAt(v2, region), openInterest, members };
}

/**
 * §3.17-iv-c-i — THE DEFAULT FUND IS ROWS OF THE CONTRACT STORE: one per member per house, read
 * as the contributions (memoised on the kind's epoch) and published whole — a member the store
 * holds takes its new amount, a new member gets a row, a member the fund no longer names is
 * freed (its money was returned by the caller).
 */
const ccpFundMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, CcpFundContribution[]> }>();
export function ccpFundOf(v2: V2World, region: RegionId): CcpFundContribution[] {
  const epoch = kindEpochOf(v2, 'CCP_FUND');
  let memo = ccpFundMemo.get(v2);
  if (!memo || memo.epoch !== epoch) { memo = { epoch, byRegion: new Map() }; ccpFundMemo.set(v2, memo); }
  let list = memo.byRegion.get(region);
  if (!list) { list = rowsOfKindInRegion(v2, 'CCP_FUND', region).map((r) => tagRow(materializeCcpFund(v2, r), r)); memo.byRegion.set(region, list); }
  return list;
}
export function publishCcpFund(v2: V2World, region: RegionId, contributions: readonly CcpFundContribution[]): void {
  const rows = contributions.map((c) => {
    if (c.regionId !== region) return defect(`default-fund contribution of ${c.regionId} published on ${region}'s fund`);
    if (!(c.amountLocal >= 0) || !Number.isFinite(c.amountLocal)) return defect(`default-fund contribution of ${c.amountLocal}`);
    resolvePartyRef(c.member, `default-fund member`);
    const r = derivativeRowOf(v2, ccpFundIdOf(region, partyKey(c.member)));
    if (r === undefined) return writeCcpFundRow(v2, c);
    writeCcpFundAmount(v2, r, c.amountLocal);
    return r;
  });
  relinkKindInRegion(v2, 'CCP_FUND', region, rows);
}
/** The fund, in the house's money. */
export const ccpFundLocal = (v2: V2World, region: RegionId): number => ccpFundOf(v2, region).reduce((a, c) => a + c.amountLocal, 0);
/** A member's contributions to every house, in the money asked for. */
function memberFundContributionLocal(v2: V2World, party: DerivativeParty, into: CurrencyCode): number {
  const key = derivativePartyKey(party);
  let total = 0;
  REGION_IDS.forEach((region) => ccpFundOf(v2, region).forEach((c) => { if (derivativePartyKey(c.member) === key) total += convert(c.amountLocal, currencyOf(region), into, v2.fx); }));
  return total;
}
/** §3.17-iv-c-i: what a bank has at the house altogether — its margin and its fund contribution —
 *  in the money it keeps its books in: the asset its sheet carries against the house. */
export const bankAtHouseLocal = (v2: V2World, bankId: EntityId): number => {
  const party = bankPartyOf(bankId);
  const into = obligationCurrencyOf(v2, party);
  return memberMarginPostedLocal(v2, party, into) + memberFundContributionLocal(v2, party, into);
};

/** Every live derivative, materialized in store order — the audits', the UI's and the harness's read. */
export function derivativesOf(v2: V2World): DerivativeContract[] {
  return rowsOfKind(v2, 'DERIVATIVE').map((r) => tagRow(materializeDerivative(v2, r), r));
}

/** One live contract by id. */
export function derivativeContractOf(v2: V2World, id: string): DerivativeContract | undefined {
  const r = derivativeRowOf(v2, id);
  return r === undefined ? undefined : tagRow(materializeDerivative(v2, r), r);
}

/** The live derivatives book for the week: the context's working copy, opened from the store. */
export function derivativesBookOf(ctx: WeeklyStepContext): DerivativeContract[] {
  if (!ctx.derivativesBook) ctx.derivativesBook = derivativesOf(ctx.v2);
  return ctx.derivativesBook;
}

/** A strike appends: both parties resolve, the rows are written, the standing index folds the tail. */
export function strikeDerivatives(ctx: WeeklyStepContext, struck: DerivativeContract[]): void {
  if (struck.length === 0) return;
  const book = derivativesBookOf(ctx);
  struck.forEach((c) => {
    resolvePartyRef(c.a, `derivative ${c.id} party a`); resolvePartyRef(c.b, `derivative ${c.id} party b`);
    tagRow(c, writeDerivativeRow(ctx.v2, c));
  });
  book.push(...struck);
  if (ctx.derivativeStanding?.book === book) ctx.derivativeStanding.index.extend(book);
}

/** The lifecycle's survivors after a settle or a close-out: their rows stay (marks written back),
 *  every other derivative row is freed, and the copy becomes the survivors. */
export function keepDerivatives(ctx: WeeklyStepContext, kept: DerivativeContract[]): void {
  const rows = kept.map((c) => {
    const r = rowOfContract(c);
    writeSettledMark(ctx.v2, r, c.settledMarkLocal);
    if (c.units !== ctx.v2.obligations.units[r] && !(c.units === undefined && Number.isNaN(ctx.v2.obligations.units[r]))) writeDerivativeUnits(ctx.v2, r, c.units);
    return r;
  });
  relinkKind(ctx.v2, 'DERIVATIVE', rows);
  ctx.derivativesBook = kept;
}

/**
 * §3.17e-iv — ONE contract re-seated and re-sized in place: a netted slice's seat passes to the
 * incoming member and its settled mark restarts at the print; the standing remainder keeps its
 * terms at the smaller size. The row is written and the working copy replaced, so the standing
 * index rebuilds on its next read.
 */
export function reseatDerivative(ctx: WeeklyStepContext, c: DerivativeContract, next: Pick<DerivativeContract, 'a' | 'b' | 'notional' | 'units' | 'initialMarginLocal' | 'settledMarkLocal'>): DerivativeContract {
  const r = rowOfContract(c);
  resolvePartyRef(next.a, `derivative ${c.id} re-seated party a`); resolvePartyRef(next.b, `derivative ${c.id} re-seated party b`);
  writeDerivativeParties(ctx.v2, r, next.a, next.b);
  writeDerivativeSize(ctx.v2, r, next.notional, next.units, next.initialMarginLocal);
  writeSettledMark(ctx.v2, r, next.settledMarkLocal);
  const updated = tagRow({ ...c, ...next }, r);
  ctx.derivativesBook = derivativesBookOf(ctx).map((x) => (x === c ? updated : x));
  ctx.derivativeStanding = undefined;
  return updated;
}

/** A novation: every contract naming the old party names the new one, which must exist. */
export function novateDerivatives(ctx: WeeklyStepContext, rekey: (p: DerivativeParty) => DerivativeParty): void {
  ctx.derivativesBook = derivativesBookOf(ctx).map((c) => {
    const a = rekey(c.a), b = rekey(c.b);
    if (a === c.a && b === c.b) return c;
    if (a !== c.a) resolvePartyRef(a, `derivative ${c.id} novated party a`);
    if (b !== c.b) resolvePartyRef(b, `derivative ${c.id} novated party b`);
    const r = rowOfContract(c);
    writeDerivativeParties(ctx.v2, r, a, b);
    return tagRow({ ...c, a, b }, r);
  });
}

/**
 * §3.13-BOOK d4c-ii — THE REPO BOOK IS ROWS OF THE CONTRACT STORE. A region's book is read as the
 * objects the session and the domain helpers walk (`repoBookOf`: the rows materialized, memoised
 * on the store's epoch so a week's many readers share one copy), and written back whole
 * (`publishRepoBook`: every contract resolves its parties; a contract the store holds takes its
 * current terms, a new one gets a row, and the region's rows the book no longer names are freed).
 * `Region.repoBook` is gone.
 */
const repoBookMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, RepoContract[]> }>();
export function repoBookOf(v2: V2World, regionId: RegionId): RepoContract[] {
  let memo = repoBookMemo.get(v2);
  if (!memo || memo.epoch !== v2.obligations.epoch) { memo = { epoch: v2.obligations.epoch, byRegion: new Map() }; repoBookMemo.set(v2, memo); }
  let book = memo.byRegion.get(regionId);
  if (!book) { book = rowsOfKindInRegion(v2, 'REPO', regionId).map((r) => materializeRepo(v2, r)); memo.byRegion.set(regionId, book); }
  return book;
}

/** §3.13-BOOK d5a — every borrower's pledged face, by bond, as the book states it. */
function pledgesByBorrower(book: readonly RepoContract[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  book.forEach((c) => { if (!out.has(c.borrowerId)) out.set(c.borrowerId, encumberedFaceByBond(book as RepoContract[], c.borrowerId)); });
  return out;
}

/** The region's repo book, as the session, a call or a novation leaves it. §3.13-BOOK d5a: the
 *  publish is the one writer of the register's LIENS — every bank the old or the new book names
 *  has its rows' liens set to exactly what the new book pledges of each bond. */
export function publishRepoBook(v2: V2World, regionId: RegionId, book: RepoContract[]): void {
  const before = pledgesByBorrower(repoBookOf(v2, regionId));
  const rows = book.map((c) => {
    if (c.regionId !== regionId) return defect(`repo ${c.id} of ${c.regionId} published on ${regionId}'s book`);
    resolvePartyRef(c.lender, `repo ${c.id} lender`); resolvePartyRef(bankPartyOf(c.borrowerId), `repo ${c.id} borrower`);
    const r = derivativeRowOf(v2, c.id);
    if (r === undefined) return writeRepoRow(v2, c);
    writeRepoTerms(v2, r, c);
    return r;
  });
  relinkKindInRegion(v2, 'REPO', regionId, rows);
  const after = pledgesByBorrower(book);
  new Set([...before.keys(), ...after.keys()]).forEach((bankId) => {
    const was = before.get(bankId) ?? new Map<string, number>(), now = after.get(bankId) ?? new Map<string, number>();
    new Set([...was.keys(), ...now.keys()]).forEach((bondId) => setLien(v2, bankId, 'GOV_BOND', bondId as InstrumentId, regionId, now.get(bondId) ?? 0));
  });
}

/** §3.20-LLR-a — THE CENTRAL BANK'S LOAN BOOK: a region's loans to its banks, rows of the
 *  contract store read and written the way the repo book is. */
const cbLoanBookMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, CentralBankLoan[]> }>();
export function centralBankLoanBookOf(v2: V2World, regionId: RegionId): CentralBankLoan[] {
  let memo = cbLoanBookMemo.get(v2);
  if (!memo || memo.epoch !== v2.obligations.epoch) { memo = { epoch: v2.obligations.epoch, byRegion: new Map() }; cbLoanBookMemo.set(v2, memo); }
  let book = memo.byRegion.get(regionId);
  if (!book) { book = rowsOfKindInRegion(v2, 'CB_LOAN', regionId).map((r) => materializeCentralBankLoan(v2, r)); memo.byRegion.set(regionId, book); }
  return book;
}
export function publishCentralBankLoanBook(v2: V2World, regionId: RegionId, book: CentralBankLoan[]): void {
  const rows = book.map((c) => {
    if (c.regionId !== regionId) return defect(`central bank loan ${c.id} of ${c.regionId} published on ${regionId}'s book`);
    resolvePartyRef(bankPartyOf(c.bankId), `central bank loan ${c.id} borrower`);
    const r = derivativeRowOf(v2, c.id);
    if (r === undefined) return writeCentralBankLoanRow(v2, c);
    writeCentralBankLoanTerms(v2, r, c);
    return r;
  });
  relinkKindInRegion(v2, 'CB_LOAN', regionId, rows);
}

/** §3.20b — THE INTERBANK BOOK: a region's unsecured bank-to-bank loans, rows of the contract
 *  store read and written the way the repo book is. */
const interbankBookMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, InterbankLoan[]> }>();
export function interbankBookOf(v2: V2World, regionId: RegionId): InterbankLoan[] {
  let memo = interbankBookMemo.get(v2);
  if (!memo || memo.epoch !== v2.obligations.epoch) { memo = { epoch: v2.obligations.epoch, byRegion: new Map() }; interbankBookMemo.set(v2, memo); }
  let book = memo.byRegion.get(regionId);
  if (!book) { book = rowsOfKindInRegion(v2, 'INTERBANK', regionId).map((r) => materializeInterbank(v2, r)); memo.byRegion.set(regionId, book); }
  return book;
}
export function publishInterbankBook(v2: V2World, regionId: RegionId, book: InterbankLoan[]): void {
  const rows = book.map((c) => {
    if (c.regionId !== regionId) return defect(`interbank loan ${c.id} of ${c.regionId} published on ${regionId}'s book`);
    resolvePartyRef(bankPartyOf(c.lenderId), `interbank ${c.id} lender`); resolvePartyRef(bankPartyOf(c.borrowerId), `interbank ${c.id} borrower`);
    const r = derivativeRowOf(v2, c.id);
    if (r === undefined) return writeInterbankRow(v2, c);
    writeInterbankTerms(v2, r, c);
    return r;
  });
  relinkKindInRegion(v2, 'INTERBANK', regionId, rows);
}

/**
 * §3.13-BOOK d4c-iii — THE STOCK-LOAN BOOK IS ROWS OF THE CONTRACT STORE, read and written the way
 * the repo book is: a region's loans materialized and memoised on the epoch, and the whole book
 * published back — every party resolves, a loan the store holds takes its current terms, a new
 * one gets a row, the region's rows the book no longer names are freed. `Region.securityLoanBook`
 * is gone.
 */
const loanBookMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, SecurityLoan[]> }>();
export function securityLoanBookOf(v2: V2World, regionId: RegionId): SecurityLoan[] {
  let memo = loanBookMemo.get(v2);
  if (!memo || memo.epoch !== v2.obligations.epoch) { memo = { epoch: v2.obligations.epoch, byRegion: new Map() }; loanBookMemo.set(v2, memo); }
  let book = memo.byRegion.get(regionId);
  if (!book) { book = rowsOfKindInRegion(v2, 'STOCK_LOAN', regionId).map((r) => materializeLoan(v2, r)); memo.byRegion.set(regionId, book); }
  return book;
}

/** §3.13-BOOK d5b — the collateral each lender holds, by currency, as a book states it. */
function collateralByLender(book: readonly SecurityLoan[], into = new Map<string, Map<CurrencyCode, number>>()): Map<string, Map<CurrencyCode, number>> {
  book.forEach((l) => {
    if (l.lender.kind !== 'INSTITUTION') return;
    const byCurrency = into.get(l.lender.id) ?? new Map<CurrencyCode, number>();
    byCurrency.set(l.currency, (byCurrency.get(l.currency) ?? 0) + Math.max(0, l.collateralLocal));
    into.set(l.lender.id, byCurrency);
  });
  return into;
}

/** The region's stock-loan book, as the session leaves it. §3.13-BOOK d5b: the publish is the one
 *  writer of the lenders' ACCOUNT liens — every lender the old or the new book names has its rows'
 *  liens set to the collateral its open loans, in every region, now carry in each money. */
export function publishSecurityLoanBook(v2: V2World, regionId: RegionId, book: SecurityLoan[]): void {
  const before = collateralByLender(securityLoanBookOf(v2, regionId));
  const rows = book.map((l) => {
    if (l.regionId !== regionId) return defect(`stock loan ${l.id} of ${l.regionId} published on ${regionId}'s book`);
    resolvePartyRef(l.lender, `stock loan ${l.id} lender`); resolvePartyRef(l.borrower, `stock loan ${l.id} borrower`);
    const r = derivativeRowOf(v2, l.id);
    if (r === undefined) return writeLoanRow(v2, l);
    writeLoanTerms(v2, r, l);
    return r;
  });
  relinkKindInRegion(v2, 'STOCK_LOAN', regionId, rows);
  const touched = new Set([...before.keys(), ...collateralByLender(book).keys()]);
  if (touched.size === 0) return;
  const now = new Map<string, Map<CurrencyCode, number>>();
  REGION_IDS.forEach((r) => collateralByLender(securityLoanBookOf(v2, r), now));
  touched.forEach((lenderId) => {
    const was = before.get(lenderId) ?? new Map<CurrencyCode, number>(), is = now.get(lenderId) ?? new Map<CurrencyCode, number>();
    new Set([...was.keys(), ...is.keys()]).forEach((currency) => setAccountLien(v2, { kind: 'INSTITUTION', id: lenderId as EntityId }, currency, is.get(currency) ?? 0));
  });
}

/**
 * §3.13-BOOK d4c-iv — THE PRIME-BROKERAGE BOOK IS ROWS OF THE CONTRACT STORE. A region's lines,
 * materialized and memoised on the store's epoch: the morning session, the two close sweeps, a
 * resolution's novation and `O8` all read one copy. A reader that means to CHANGE a line copies it
 * first — the memo's objects are the store's view, not a scratch book.
 */
const pbBookMemo = new WeakMap<V2World, { epoch: number; byRegion: Map<string, PrimeBrokerageLine[]> }>();
export function primeBrokerageBookOf(v2: V2World, regionId: RegionId): PrimeBrokerageLine[] {
  let memo = pbBookMemo.get(v2);
  if (!memo || memo.epoch !== v2.obligations.epoch) { memo = { epoch: v2.obligations.epoch, byRegion: new Map() }; pbBookMemo.set(v2, memo); }
  let book = memo.byRegion.get(regionId);
  if (!book) { book = rowsOfKindInRegion(v2, 'PRIME_BROKERAGE', regionId).map((r) => materializePrimeBrokerageLine(v2, r)); memo.byRegion.set(regionId, book); }
  return book;
}

/** The region's prime-brokerage book, as a session leaves it: every broker and fund resolves, a
 *  line the store holds takes its current terms, a new one gets a row, a repaid one is freed. */
export function publishPrimeBrokerageBook(v2: V2World, regionId: RegionId, book: PrimeBrokerageLine[]): void {
  const rows = book.map((l) => {
    if (l.regionId !== regionId) return defect(`prime brokerage line ${l.id} of ${l.regionId} published on ${regionId}'s book`);
    resolvePartyRef(bankPartyOf(l.brokerId), `prime brokerage line ${l.id} broker`); resolvePartyRef({ kind: 'INSTITUTION', id: l.fundId }, `prime brokerage line ${l.id} fund`);
    const r = derivativeRowOf(v2, l.id);
    if (r === undefined) return writePrimeBrokerageRow(v2, l);
    writePrimeBrokerageTerms(v2, r, l);
    return r;
  });
  relinkKindInRegion(v2, 'PRIME_BROKERAGE', regionId, rows);
}

/**
 * §3.13-BOOK d4c-v — THE TRADE INVOICES ARE ROWS OF THE CONTRACT STORE. The outstanding book is
 * the kind's rows materialized in insertion order and memoised on the KIND's epoch — a book of
 * ~170k invoices is not rebuilt because a derivative marked. Each object names its row (the tag),
 * which is how the settlement hands the survivors back. `GameState.tradeInvoices` is gone.
 */
const invoiceMemo = new WeakMap<V2World, { epoch: number; book: TradeInvoice[] }>();
export function tradeInvoicesOf(v2: V2World): TradeInvoice[] {
  const epoch = kindEpochOf(v2, 'TRADE_INVOICE');
  let memo = invoiceMemo.get(v2);
  if (!memo || memo.epoch !== epoch) {
    memo = { epoch, book: rowsOfKind(v2, 'TRADE_INVOICE').map((r) => tagRow(materializeInvoice(v2, r), r)) };
    invoiceMemo.set(v2, memo);
  }
  return memo.book;
}

/** The week's invoices join the outstanding book: every seller and buyer resolves. */
export function bookTradeInvoices(v2: V2World, invoices: readonly TradeInvoice[]): void {
  for (const inv of invoices) {
    resolvePartyRef(companyPartyOf(inv.sellerId), `trade invoice seller`);
    resolvePartyRef(companyPartyOf(inv.buyerId), `trade invoice buyer`);
    writeInvoiceRow(v2, inv);
  }
}

/** What is still owed after the week's settlement: the invoices not yet paid or written off,
 *  each one an object the book handed out; every other invoice row is freed. */
export function settleTradeInvoices(v2: V2World, stillOutstanding: readonly TradeInvoice[]): void {
  const rows = stillOutstanding.map((inv) => {
    const r = (inv as Rowed)[ROW];
    return r === undefined ? defect(`trade invoice ${inv.sellerId}>${inv.buyerId} is not on the contract store`) : r;
  });
  relinkKind(v2, 'TRADE_INVOICE', rows);
}

/**
 * §3.13-BOOK d4c-vi — THE CAPITAL COMMITMENTS ARE ROWS OF THE CONTRACT STORE. A fund's LPs are
 * its rows in insertion order, memoised on the kind's epoch; each object names its row, which is
 * how a call or a distribution finds the column it moves. `peFund.lpCommitments` is gone. The
 * seed's commitments ride a stash from the generator to `openSeededBooks`, like its books.
 */
const commitmentMemo = new WeakMap<V2World, { epoch: number; byFund: Map<string, LpCommitment[]> }>();
export function lpCommitmentsOf(v2: V2World, fundId: string): LpCommitment[] {
  const epoch = kindEpochOf(v2, 'COMMITMENT');
  let memo = commitmentMemo.get(v2);
  if (!memo || memo.epoch !== epoch) { memo = { epoch, byFund: new Map() }; commitmentMemo.set(v2, memo); }
  let list = memo.byFund.get(fundId);
  if (!list) {
    const fundKey = partyKey({ kind: 'INSTITUTION', id: fundId as EntityId });
    list = rowsOfKind(v2, 'COMMITMENT').filter((r) => partyKeyOf(v2, v2.obligations.aRef[r]) === fundKey)
      .map((r) => tagRow(materializeCommitment(v2, r), r));
    memo.byFund.set(fundId, list);
  }
  return list;
}

/** A commitment is struck: both institutions resolve, and a fund has one row per LP. */
export function commitCapital(v2: V2World, c: LpCommitment): void {
  resolvePartyRef({ kind: 'INSTITUTION', id: c.fundId }, `commitment to fund`); resolvePartyRef({ kind: 'INSTITUTION', id: c.lpEntityId }, `commitment from LP`);
  if (!(c.committedLocal >= 0) || !(c.drawnLocal >= 0)) return defect(`commitment ${commitmentIdOf(c.fundId, c.lpEntityId)} of ${c.committedLocal} with ${c.drawnLocal} drawn`);
  writeCommitmentRow(v2, c);
}

const seedCommitmentStash = new WeakMap<object, LpCommitment[]>();
/** The seed's commitments, stashed on the fund entity until the world they resolve against exists. */
export function stashSeedCommitments(fund: object, list: LpCommitment[]): void { seedCommitmentStash.set(fund, list); }
export function drainSeedCommitments(v2: V2World, funds: readonly object[]): void {
  funds.forEach((f) => { (seedCommitmentStash.get(f) ?? []).forEach((c) => commitCapital(v2, c)); seedCommitmentStash.delete(f); });
}

const rowOfCommitment = (c: LpCommitment): number => {
  const r = (c as Rowed)[ROW];
  return r === undefined ? defect(`commitment ${commitmentIdOf(c.fundId, c.lpEntityId)} is not on the contract store`) : r;
};

/** A capital call draws on a commitment: the drawn balance rises by what was called. */
export function drawCommitment(v2: V2World, c: LpCommitment, amountLocal: number): void {
  if (!(amountLocal > 0) || !Number.isFinite(amountLocal)) return defect(`capital call of ${amountLocal}`);
  writeDrawn(v2, rowOfCommitment(c), c.drawnLocal + amountLocal);
}

/** A distribution returns drawn capital: the commitment becomes available to draw again. */
export function returnCommitment(v2: V2World, c: LpCommitment, amountLocal: number): void {
  if (!(amountLocal > 0) || !Number.isFinite(amountLocal)) return defect(`distribution of ${amountLocal}`);
  writeDrawn(v2, rowOfCommitment(c), Math.max(0, c.drawnLocal - amountLocal));
}

/** §3.13-BOOK d4c-vi — every live obligation of every kind, its two parties resolved to refs: the
 *  one liveness check (`O5`) reads this and asks whether both are alive. */
export function liveObligationPartiesOf(v2: V2World): { kind: string; id: string; a: PartyRef | undefined; b: PartyRef | undefined; notional: number }[] {
  return liveObligationsOf(v2).map((o) => ({ kind: o.kind, id: o.id, a: partyFromKey(o.a), b: partyFromKey(o.b), notional: o.notional }));
}
