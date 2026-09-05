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
import type { V2World } from '../../engine2/world';
import { rowsOfKind, relinkKind, materializeDerivative, derivativeRowOf, writeDerivativeRow, writeSettledMark, writeDerivativeParties } from '../../engine2/obligations';
import type { WeeklyStepContext } from '../simulation/stages/context';
import type { DerivativeContract, DerivativeParty } from '../../domain/derivatives/contract';
import type { RepoContract } from '../../domain/repo';
import type { SecurityLoan } from '../../domain/securities-lending';
import type { PrimeBrokerageLine } from '../../domain/prime-brokerage';
import type { TradeInvoice } from '../../domain/trade-invoice';
import { bankPartyOf, companyPartyOf } from '../../domain/party';
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
type Rowed = DerivativeContract & { [ROW]?: number };
const tagRow = (c: DerivativeContract, r: number): DerivativeContract => {
  Object.defineProperty(c, ROW, { value: r, enumerable: false, writable: true, configurable: true });
  return c;
};
const rowOfContract = (c: DerivativeContract): number => {
  const r = (c as Rowed)[ROW];
  return r === undefined ? defect(`derivative ${c.id} is not on the contract store`) : r;
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
    return r;
  });
  relinkKind(ctx.v2, 'DERIVATIVE', rows);
  ctx.derivativesBook = kept;
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

/** The region's repo book, as the session or a novation leaves it: every lender and borrower resolves. */
export function publishRepoBook(reg: { repoBook?: RepoContract[] }, book: RepoContract[]): void {
  book.forEach((c) => { resolvePartyRef(c.lender, `repo ${c.id} lender`); resolvePartyRef(bankPartyOf(c.borrowerId), `repo ${c.id} borrower`); });
  reg.repoBook = book;
}

/** The region's stock-loan book: every lender and borrower resolves. */
export function publishSecurityLoanBook(reg: { securityLoanBook?: SecurityLoan[] }, book: SecurityLoan[]): void {
  book.forEach((l) => { resolvePartyRef(l.lender, `stock loan ${l.id} lender`); resolvePartyRef(l.borrower, `stock loan ${l.id} borrower`); });
  reg.securityLoanBook = book;
}

/** The region's prime-brokerage book: every broker and fund resolves. */
export function publishPrimeBrokerageBook(reg: { primeBrokerageBook?: PrimeBrokerageLine[] }, book: PrimeBrokerageLine[]): void {
  book.forEach((l) => { resolvePartyRef(bankPartyOf(l.brokerId), `prime brokerage line ${l.id} broker`); resolvePartyRef({ kind: 'INSTITUTION', id: l.fundId }, `prime brokerage line ${l.id} fund`); });
  reg.primeBrokerageBook = book;
}

/** The week's invoices join the outstanding book: every seller and buyer resolves. */
export function bookTradeInvoices(state: { tradeInvoices?: TradeInvoice[] }, invoices: readonly TradeInvoice[]): void {
  if (!state.tradeInvoices) state.tradeInvoices = [];
  for (const inv of invoices) {
    resolvePartyRef(companyPartyOf(inv.sellerId), `trade invoice seller`);
    resolvePartyRef(companyPartyOf(inv.buyerId), `trade invoice buyer`);
    state.tradeInvoices.push(inv);
  }
}

/** What is still owed after the week's settlement: the invoices not yet paid or written off. */
export function settleTradeInvoices(state: { tradeInvoices?: TradeInvoice[] }, stillOutstanding: TradeInvoice[]): void {
  state.tradeInvoices = stillOutstanding;
}

/** A capital call draws on a limited partner's commitment; the payment beside it is the LP's. */
export function drawCommitment(c: { committedLocal: number; drawnLocal: number }, amountLocal: number): void {
  if (!(amountLocal > 0) || !Number.isFinite(amountLocal)) return defect(`capital call of ${amountLocal}`);
  c.drawnLocal += amountLocal;
}

/** A distribution returns drawn capital: the commitment becomes available to draw again. */
export function returnCommitment(c: { committedLocal: number; drawnLocal: number }, amountLocal: number): void {
  if (!(amountLocal > 0) || !Number.isFinite(amountLocal)) return defect(`distribution of ${amountLocal}`);
  c.drawnLocal = Math.max(0, c.drawnLocal - amountLocal);
}
