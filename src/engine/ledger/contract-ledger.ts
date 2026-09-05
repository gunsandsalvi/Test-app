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
import type { GameState } from '../../types';
import type { WeeklyStepContext } from '../simulation/stages/context';
import type { DerivativeContract, DerivativeParty } from '../../domain/derivatives/contract';
import type { RepoContract } from '../../domain/repo';
import type { SecurityLoan } from '../../domain/securities-lending';
import type { PrimeBrokerageLine } from '../../domain/prime-brokerage';
import type { TradeInvoice } from '../../domain/trade-invoice';
import { bankPartyOf, companyPartyOf } from '../../domain/party';
import { resolvePartyRef } from './wire';
import { defect } from '../../domain/defect';

/** The live derivatives book for the week: the context's working copy, opened from the state. */
export function derivativesBookOf(ctx: WeeklyStepContext, state: GameState): DerivativeContract[] {
  if (!ctx.derivativesBook) ctx.derivativesBook = [...(state.derivativesBook ?? [])];
  return ctx.derivativesBook;
}

/** A strike appends: both parties resolve, the standing index folds the tail and stays the book's. */
export function strikeDerivatives(ctx: WeeklyStepContext, state: GameState, struck: DerivativeContract[]): void {
  if (struck.length === 0) return;
  struck.forEach((c) => { resolvePartyRef(c.a, `derivative ${c.id} party a`); resolvePartyRef(c.b, `derivative ${c.id} party b`); });
  const book = derivativesBookOf(ctx, state);
  book.push(...struck);
  if (ctx.derivativeStanding?.book === book) ctx.derivativeStanding.index.extend(book);
}

/** The lifecycle's survivors after a settle or a close-out: the contracts that remain live. */
export function keepDerivatives(ctx: WeeklyStepContext, kept: DerivativeContract[]): void {
  ctx.derivativesBook = kept;
}

/** A novation: every contract naming the old party names the new one, which must exist. */
export function novateDerivatives(ctx: WeeklyStepContext, state: GameState, rekey: (p: DerivativeParty) => DerivativeParty): void {
  ctx.derivativesBook = derivativesBookOf(ctx, state).map((c) => {
    const a = rekey(c.a), b = rekey(c.b);
    if (a !== c.a) resolvePartyRef(a, `derivative ${c.id} novated party a`);
    if (b !== c.b) resolvePartyRef(b, `derivative ${c.id} novated party b`);
    return a === c.a && b === c.b ? c : { ...c, a, b };
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
