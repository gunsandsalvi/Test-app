/**
 * THE SETTLEMENT LAYER (CASH / SETL1) — where money actually moves.
 *
 * Until now every stage moved cash by mutating whatever field it owned: a company's `cash`, an
 * entity's `cashUSD`, a bank's `cashReservesUSD`, the treasury's account. Nothing connected them,
 * which is exactly how corporate cash came to sit outside the banking system for the whole life
 * of the model — reported as `corporateDepositsUSD`, held by no bank, backed by no asset.
 * A leak like that cannot happen once there is one place money moves through.
 *
 * **The real mechanism this reproduces.** A deposit is a named bank's liability to a named
 * holder. Between two customers of the SAME bank a payment is a relabelling — the bank's book is
 * unchanged and no reserves move. Between customers of DIFFERENT banks the paying bank must
 * settle, and it settles in the one asset banks settle in: **central-bank reserves**. The
 * government banks at the central bank, so a tax payment moves money out of reserves and into the
 * treasury's account — which is why tax dates drain the money market, a real effect this model
 * can now feel. Real systems net multilateral positions and settle the residual; this settles
 * weekly, which is the engine's clock.
 *
 * **The shape (rule 17).** Stages do not move money. They RECORD AN INSTRUCTION — payer, payee,
 * amount, reason — and this stage executes all of them. A new kind of payment is one instruction
 * and no new plumbing. An instruction whose counterparty is not modelled yet names the
 * `UNMODELED` sector explicitly, so a boundary is a line with a size and an owner rather than
 * money quietly appearing (rule 13).
 *
 * **The gate.** Money is conserved by construction here: every instruction debits one account and
 * credits another; the central bank's liabilities only move BETWEEN buckets (bank reserves ↔ the
 * treasury's account) except where the central bank itself issues; and the cleared books'
 * counterparty is flat. All three residuals are computed at the end of every run, carried on the
 * report and on the state, and asserted by the harness every week — never plugged.
 */

import { RegionId } from '../../../types';
import { buildAccountMirror, applySettledRow, projectBooks, settledTallies, entityCashOf } from '../../ledger/accounts';
import { WeeklyStepContext } from './context';

/** Who is paying or being paid. Every party either holds a deposit at a named bank, or is one of
 *  the two parties that bank at the central bank (the government and the central bank itself). */
export type { PartyRef } from '../../ledger/party';
import { PartyRef, partyId, partyOf } from '../../ledger/party';
import { activeWireJournal, wirePush, MONEY_ASSET_ID, ASSET_KINDS } from '../../ledger/wire';
const MONEY_KIND_ID = ASSET_KINDS.indexOf('MONEY');
import { PaymentCategory, categoryOfReason } from '../../ledger/payment-category';
import { assertNever } from '../../../domain/defect';

export interface PaymentInstruction {
  payer: PartyRef;
  payee: PartyRef;
  amountUSD: number;
  /** The named real flow — carried into the ledgers so a dollar is traceable to why it moved. */
  reason: string;
  /** N — the week the money moves; this week when omitted. An obligation falling due
   *  later is a DATED wire in the journal, not a balance on a side map: settlement holds the row
   *  until its week, it counts against nobody's spendable balance until then, and what a party
   *  owes is the sum of its undue rows. */
  settleWeek?: number;
}

/**
 * SCALE wave 2, decision 5 — THE WEEK'S PAYMENTS AS COLUMNS.
 *
 * 145,000 payments a week, each an object holding two more objects. The journal is four parallel
 * arrays instead: payer id, payee id, amount, and an interned reason. The `pay` signature is
 * unchanged, so no call site moves — the instruction it is handed is read into the columns and
 * dropped, which is what takes the short-lived objects out of the nursery.
 *
 * The apply pass rebuilds a `PartyRef` from `partyRefById`: the first ref seen for an id, which is
 * structurally identical to every later one, because the id IS the identity.
 */
export interface PaymentJournal {
  /** Rows written; the arrays are capacity, `n` is the truth. */
  n: number;
  payerId: Int32Array;
  payeeId: Int32Array;
  amountUSD: Float64Array;
  reasonId: Int32Array;
  /** N: the week the row settles; a row dated past the pass's week is carried. */
  settleWeek: Int32Array;
}

export function newPaymentJournal(): PaymentJournal {
  const cap = 1 << 12;
  return {
    n: 0,
    payerId: new Int32Array(cap),
    payeeId: new Int32Array(cap),
    amountUSD: new Float64Array(cap),
    reasonId: new Int32Array(cap),
    settleWeek: new Int32Array(cap),
  };
}

/** N — CORPORATE TAX IS A DATED WIRE. The walk's weekly accrual is a row to the treasury
 *  dated at the quarter; what a firm has accrued and not paid is the sum of its undue rows, and
 *  what the treasury collects in a week is the sum of the rows that fall due. */
export const CORPORATE_TAX_REASON = 'cash taxes (accrued, due at the quarter)';
/** Σ of a payer's rows under one reason dated PAST `week` — what it owes and has not paid. */
export function undueOwedByPayerUSD(j: PaymentJournal, payerId: number, reasonId: number, week: number): number {
  let s = 0;
  for (let n = 0; n < j.n; n++) if (j.payerId[n] === payerId && j.reasonId[n] === reasonId && j.settleWeek[n] > week) s += j.amountUSD[n];
  return s;
}
/** Σ of the rows to one payee under one reason due AT OR BEFORE `week` — what falls due this pass. */
export function dueToPayeeUSD(j: PaymentJournal, payeeId: number, reasonId: number, week: number): number {
  let s = 0;
  for (let n = 0; n < j.n; n++) if (j.payeeId[n] === payeeId && j.reasonId[n] === reasonId && j.settleWeek[n] <= week) s += j.amountUSD[n];
  return s;
}

/** N: the week this step is settling — the wire journal's, the one clock. */
export const settlementWeek = (): number => activeWireJournal().week;
/** A row is due at a pass when its week is this week or earlier. */
export const rowDue = (j: PaymentJournal, n: number, week: number): boolean => j.settleWeek[n] <= week;

/** SCALE — one journal row, typed-array columns with doubling growth: the
 *  ~200k-and-growing number[] pushes a week were the settlement file's own measured mass. */
export function journalPush(j: PaymentJournal, payerId: number, payeeId: number, amountUSD: number, reasonId: number, settleWeek: number = activeWireJournal().week): void {
  // W1: a party "paying itself" moves nothing between parties — the SME tier buying
  // its own output, a firm's line consuming its own — so it is no wire and no row: an honest
  // no-op, not a defect (the wire ledger rejects a self-wire from a direct caller).
  if (payerId === payeeId) return;
  // W1: a money row IS a wire. The wire is written first, numbered; the payment journal
  // is settlement's projection of the week's money wires. N: both carry the row's week.
  wirePush(activeWireJournal(), payerId, payeeId, MONEY_KIND_ID, MONEY_ASSET_ID, amountUSD, 1, reasonId, settleWeek);
  journalAppendRow(j, payerId, payeeId, amountUSD, reasonId, settleWeek);
}

/**
 * W1 — the ROW ONLY, for a payment whose wire already exists: stage 08's in-process
 * shards journal through `journalPush` (wire written) into a shard journal that is then folded
 * into the week's; folding through `journalPush` wrote every shard row's wire TWICE (measured:
 * 180B a week of money wires with no settlement behind them — the whole of W1's line at
 * re-measure). A worker thread's rows come back through `journalPush` — its own wire
 * journal is scratch and dies with the job.
 */
export function journalAppendRow(j: PaymentJournal, payerId: number, payeeId: number, amountUSD: number, reasonId: number, settleWeek: number): void {
  if (j.n >= j.payerId.length) {
    const cap = j.payerId.length * 2;
    const gi = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old); return a; };
    const gf = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
    j.payerId = gi(j.payerId);
    j.payeeId = gi(j.payeeId);
    j.amountUSD = gf(j.amountUSD);
    j.reasonId = gi(j.reasonId);
    j.settleWeek = gi(j.settleWeek);
  }
  j.payerId[j.n] = payerId;
  j.payeeId[j.n] = payeeId;
  j.amountUSD[j.n] = amountUSD;
  j.reasonId[j.n] = reasonId;
  j.settleWeek[j.n] = settleWeek;
  j.n++;
}

const reasonIdByText = new Map<string, number>();
const reasonById: string[] = [];
// Classified ONCE, at intern time — the category rides beside the free text for the
// life of the process, so the rollup and the harness's no-orphans assertion cost nothing per
// payment.
const reasonCategoryById: PaymentCategory[] = [];
export function internReason(reason: string): number {
  const existing = reasonIdByText.get(reason);
  if (existing !== undefined) return existing;
  const id = reasonById.length;
  reasonIdByText.set(reason, id);
  reasonById.push(reason);
  reasonCategoryById.push(categoryOfReason(reason));
  return id;
}
/** The text behind an interned reason — the ledgers still key by it. */
export const reasonText = (id: number): string => reasonById[id];
/** W2 — table size and texts-from-index, to seed a worker's reason table id-for-id. */
export const reasonTableSize = (): number => reasonById.length;
export const reasonTextsFrom = (from: number): string[] => reasonById.slice(from);
/** The category beside the free text. */
export const reasonCategory = (id: number): PaymentCategory => reasonCategoryById[id];
/** Every reason this run has written that no category rule matches. The harness asserts this
 *  list is EMPTY — a new payment reason must land a rule in `payment-category.ts` first. */
export function unclassifiedReasons(): string[] {
  return reasonById.filter((_, i) => reasonCategoryById[i] === 'UNCLASSIFIED');
}
/** Append to the journal from a stage that holds only a slice of the context. Same encoding as
 *  `pay`, minus the running-net update, which those callers do not participate in. */
export function journalPayment(ctx: PendingNetCtx, instruction: PaymentInstruction): void {
  if (!guardPayableAmount(instruction)) return;
  const payer = partyId(instruction.payer);
  const payee = partyId(instruction.payee);
  journalPush(ctx.paymentJournal, payer, payee, instruction.amountUSD, internReason(instruction.reason));
  // ONE RUNNING NET. This wrote the journal and nothing else, so every payment the paying agent
  // made — the week's coupons, dividends and redemptions — was invisible to `pendingSettlementUSD`
  // until it settled. Repo's surplus, every bid sizer and the prime-brokerage sweep read that
  // number, and the close sweep had to re-derive the whole thing by walking the journal because
  // of it: two representations of one running total, the second one written to work around the
  // first one's hole.
  addPending(ctx, payer, -instruction.amountUSD);
  addPending(ctx, payee, instruction.amountUSD);
}

/** What a caller must carry for its payment to reach the week's running net. */
export type PendingNetCtx = Pick<WeeklyStepContext, 'paymentJournal' | 'pendingNetById' | 'pendingTouchedIds'>
  & { deferPendingNet?: boolean };


/**
 * Record a payment. The only way a stage should move money.
 *
 * SCALE, MEASURED AND REJECTED: coalescing on the way in — one row per (payer, payee, reason) —
 * looked obvious against **170,000–200,000 instructions a week**. It is not: 162,705 rows carry
 * 144,650 distinct triples, an 11% saving that does not pay for the key it costs to find. The
 * goods market really does have that many distinct counterparty relationships in a week, one per
 * lot, and that is a fact about the model rather than a defect in it.
 */
/**
 * This guard used to silently drop NaN and negative amounts, which converted every
 * upstream arithmetic defect in the codebase into quiet non-payment — the single worst silent
 * absorber found by the enforcement audit. A zero (or float dust below $1e-9) is an honest
 * no-op; anything else non-payable is a defect at the CALLER, named here so it fails where it
 * happens instead of as a conservation residue weeks later.
 */
function guardPayableAmount(instruction: PaymentInstruction): boolean {
  const amt = instruction.amountUSD;
  if (amt > 1e-9 && isFinite(amt)) return true;
  if (amt >= -1e-9 && amt <= 1e-9) return false; // exact zero or dust: an honest no-op
  throw new Error(`ENGINE DEFECT: payment '${instruction.reason}' carries amountUSD=${amt} — `
    + 'a NaN or negative amount is a sign/arithmetic error at the caller, not a payment');
}

export function pay(ctx: WeeklyStepContext, instruction: PaymentInstruction): void {
  if (!guardPayableAmount(instruction)) return;
  const payer = partyId(instruction.payer);
  const payee = partyId(instruction.payee);
  const week = settlementWeek();
  const settleWeek = instruction.settleWeek ?? week;
  journalPush(ctx.paymentJournal, payer, payee, instruction.amountUSD, internReason(instruction.reason), settleWeek);
  // N: a dated row is nobody's committed money until its week.
  if (settleWeek > week) return;
  addPending(ctx, payer, -instruction.amountUSD);
  addPending(ctx, payee, instruction.amountUSD);
}

/**
 * SCALE — the hot-loop form of `pay`: party and reason already interned by the caller
 * (hoisted once per company / per plan instead of two string-map probes per leg — the goods
 * auction and the cash walk emit ~400k legs a week). Same guard, same journal encoding, same
 * running-net update; a caller that cannot hoist keeps using `pay`.
 */
export function payByIds(
  ctx: WeeklyStepContext, payerId: number, payeeId: number, amountUSD: number, reasonId: number,
  settleWeek: number = settlementWeek(),
): void {
  if (!(amountUSD > 1e-9 && isFinite(amountUSD))) {
    if (amountUSD >= -1e-9 && amountUSD <= 1e-9) return; // exact zero or dust: an honest no-op
    throw new Error(`ENGINE DEFECT: payByIds reason#${reasonId} carries amountUSD=${amountUSD} — `
      + 'a NaN or negative amount is a sign/arithmetic error at the caller, not a payment');
  }
  journalPush(ctx.paymentJournal, payerId, payeeId, amountUSD, reasonId, settleWeek);
  if (settleWeek > settlementWeek()) return; // §5-WIRES N: dated — not committed until its week
  addPending(ctx, payerId, -amountUSD);
  addPending(ctx, payeeId, amountUSD);
}

/** The running net, as a dense array indexed by party id. Touched ids are remembered so the
 *  week's reset is proportional to what moved rather than to the table's size. */
function addPending(ctx: PendingNetCtx, id: number, deltaUSD: number): void {
  // barrier mode: the running net is applied at MERGE time, leg by leg in the journal's
  // merged order (applyPendingLeg below), so per-party float sums keep the exact summation tree
  // the interleaved loop had. Emission-time application is suppressed inside the phase loops.
  if (ctx.deferPendingNet) return;
  const net = ctx.pendingNetById;
  if (net[id] === undefined) { net[id] = deltaUSD; ctx.pendingTouchedIds.push(id); return; }
  net[id] += deltaUSD;
}

/** barrier merge: one journal leg's effect on the running net, applied in merged order. */
export function applyPendingLeg(ctx: WeeklyStepContext, payerId: number, payeeId: number, amountUSD: number, settleWeek: number = settlementWeek()): void {
  if (settleWeek > settlementWeek()) return; // §5-WIRES N: a dated leg commits nothing yet
  const net = ctx.pendingNetById;
  if (net[payerId] === undefined) { net[payerId] = -amountUSD; ctx.pendingTouchedIds.push(payerId); }
  else net[payerId] += -amountUSD;
  if (net[payeeId] === undefined) { net[payeeId] = amountUSD; ctx.pendingTouchedIds.push(payeeId); }
  else net[payeeId] += amountUSD;
}

/** Seed the running net from the journal's rows that are DUE in this pass — the carried
 *  instructions of earlier weeks, which nothing else would ever add. */
export function seedPendingNetFromJournal(ctx: PendingNetCtx, week: number): void {
  const j = ctx.paymentJournal;
  for (let n = 0; n < j.n; n++) {
    if (!rowDue(j, n, week)) continue;
    addPending(ctx, j.payerId[n], -j.amountUSD[n]);
    addPending(ctx, j.payeeId[n], j.amountUSD[n]);
  }
}

/** Zero the week's running net. */
export function clearPendingNet(ctx: WeeklyStepContext): void {
  const net = ctx.pendingNetById;
  for (let i = 0; i < ctx.pendingTouchedIds.length; i++) net[ctx.pendingTouchedIds[i]] = undefined as unknown as number;
  ctx.pendingTouchedIds.length = 0;
}

/**
 * What a party has committed to pay or is due to receive at this week's settlement,
 * before it happens. A trade agreed today is a payable or a receivable until it settles, and
 * both belong on the balance sheet: a fund's assets include what it is owed, and its spending
 * power excludes what it has already committed. Without this the five clearing books would each
 * size their budget off the same unspent balance and buy the same dollar five times.
 */
export function pendingSettlementUSD(ctx: WeeklyStepContext, party: PartyRef): number {
  return ctx.pendingNetById[partyId(party)] ?? 0;
}

/**
 * STOCK-LOAN COLLATERAL A LENDER HOLDS IS NOT ITS MONEY TO SPEND. A fund that lends
 * shares receives the borrower's cash and must hand it back when the shares return; it sits in
 * `cashUSD` beside the fund's own balance, and every book that sized a bid on `cash + pending`
 * spent it — the small-cap ETF bought equity with it, redeemed it away in kind, and then ran
 * ~10M under for fifteen weeks returning collateral it no longer had. Memoised per loan-book
 * array (the lending stage rebuilds the array when it writes).
 */
const collateralHeldByBook = new WeakMap<object, Map<string, number>>();
export function stockLoanCollateralHeldUSD(ctx: WeeklyStepContext, entityId: string): number {
  let heldUSD = 0;
  for (const reg of Object.values(ctx.updatedRegions)) {
    const book = reg?.securityLoanBook;
    if (!book || book.length === 0) continue;
    let byLender = collateralHeldByBook.get(book);
    if (!byLender) {
      byLender = new Map<string, number>();
      for (const loan of book) {
        if (loan.lender.kind !== 'INSTITUTION') continue;
        byLender.set(loan.lender.id, (byLender.get(loan.lender.id) ?? 0) + Math.max(0, loan.collateralUSD));
      }
      collateralHeldByBook.set(book, byLender);
    }
    heldUSD += byLender.get(entityId) ?? 0;
  }
  return heldUSD;
}

/** What an institution can put behind a bid this week: its balance, plus what settlement already
 *  owes it, less the stock-loan collateral it is only holding. Never negative. */
export function institutionSpendableUSD(ctx: WeeklyStepContext, entity: { id: string }, withPending = true): number {
  const pendingUSD = withPending ? pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id }) : 0;
  return Math.max(0, entityCashOf(ctx.v2, entity) + pendingUSD - stockLoanCollateralHeldUSD(ctx, entity.id));
}

/** The pending figure the class-budget rule takes, with the held collateral netted as if it were
 *  already owed — which it is. */
export function institutionUnsettledLessCollateralUSD(ctx: WeeklyStepContext, entityId: string): number {
  return pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entityId }) - stockLoanCollateralHeldUSD(ctx, entityId);
}

export interface SettlementReport {
  instructions: number;
  grossUSD: number;
  /** A4: the tallies below are `settledTallies` — reads of the account rows' deltas. */
  /** Reserve movement per bank — what it had to settle across the central bank's books. */
  reserveDeltaByBank: Map<string, number>;
  /** Treasury account movement per region. */
  tgaDeltaByRegion: Map<string, number>;
  /** HH — every household flow this week, per region, keyed by the payment's own reason and
   *  signed from the household's side. Household INCOME is derived from this (see
   *  stages/household-balance-sheet.ts): what they were actually paid, not a labor-share
   *  identity. Free, like the pools' P&L — every household flow is already a payment. */
  householdFlowsByRegion: Map<string, Map<string, number>>;
  /** C5 — the treasury's week, from the payments themselves: per region, by reason.
   *  The treasury's account moves by nothing else. */
  treasuryFlowsByRegion: Map<string, Map<string, number>>;
  /** SEG-D — every pool flow this week, keyed `<region>:<industry>` then by the payment's own
   *  reason, signed from the pool's side. This is the pool's INCOME STATEMENT, and it is free:
   *  every pool flow is already a payment passing through here, so a new kind of pool flow shows
   *  up in its P&L without anything being instrumented (rule 17). */
  smePoolFlowsByPool: Map<string, Map<string, number>>;
  /** Payments to/from a bank on its own account — income and expense, so equity moves too. */
  bankEquityDeltaByBank: Map<string, number>;
  /** Deposits created by this bank's own lending — they need no reserve settlement. */
  creditCreatedByBank: Map<string, number>;
  /** What the cleared books' central counterparty was left holding. Must be zero. */
  clearingHouseResidualUSD: number;
  /** Reserves the central bank ISSUED this week by paying for assets with money it
   *  created (an open-market purchase), less what it extinguished by selling. It is the one
   *  party whose payments are not funded from a balance, so the reserves that appear at the
   *  sellers' banks are new — and the identity below has to know that or it reads as a leak. */
  centralBankIssuanceUSD: number;
  /** M6 — the same, per region (the central bank a payment was drawn on). */
  centralBankIssuanceByRegion: Map<string, number>;
  /** M6 — reserves a bank's own SECURITIES account paid (−) or received (+): a desk
   *  buying paper from a fund destroys the fund's deposit, selling creates one. Own-account money
   *  the equity ledger above does not see (no P&L, one asset for another). */
  bankSecuritiesDeltaByBank: Map<string, number>;
  /** What the central bank's own books were left holding — see `centralBankResidualUSD`. Zero. */
  centralBankResidualUSD: number;
  /** C4b — per region, the money that arrived from other regions less what left for
   *  them, read off each instruction's two sides (a side with no region — the clearing house —
   *  contributes nothing; its legs attribute through their other side). Booked on the central
   *  banks as foreign official claims; sums to zero across regions by construction. */
  crossBorderByRegion: Map<string, number>;
  /** Money that could not be applied: a party that does not exist, or a holder with no bank.
   *  Must be zero. A non-zero value is money leaving the system — the defect's shape. */
  unresolvedUSD: number;
  /** A — the settled rows the store could not map to a party's row. Must be zero. */
  accountRowsUnmapped: number;
}

export { partyId, partyOf, partyKey, partyFromKey } from '../../ledger/party';

/**
 * Execute the week's instructions.
 *
 * Netting first, application second: a holder's many flows become one balance change, and a
 * bank's many customers become one reserve settlement — which is what a net settlement system
 * does, and what keeps this O(instructions) rather than O(instructions x books).
 */
/**
 * CASH — the week has TWO settlement cycles, and needs them.
 *
 * A single pass ran in the middle of the week, so every stage after it had nowhere to send a
 * payment instruction and moved the two balances itself instead. That is the structural reason
 * the migration stalled: not that those stages were written carelessly, but that posting was not
 * an option for them. The insurers, the money fund, the ETFs, the FX desks, the estates and the
 * treasury's redemptions all run after the mid-week pass.
 *
 * So it runs again at the close, and everything posted since settles then. A real day has an
 * intraday cycle and an end-of-day cycle for exactly this reason. The two reports MERGE, because
 * the invariants — the clearing house flat, nothing unresolved — are properties of the WEEK.
 */
export function mergeSettlementReports(a: SettlementReport, b: SettlementReport): SettlementReport {
  const mergeMap = <K>(x: Map<K, number>, y: Map<K, number>): Map<K, number> => {
    const out = new Map(x);
    y.forEach((v, k) => out.set(k, (out.get(k) ?? 0) + v));
    return out;
  };
  const mergeNested = <K>(x: Map<K, Map<string, number>>, y: Map<K, Map<string, number>>) => {
    const out = new Map(x);
    y.forEach((inner, k) => out.set(k, mergeMap(out.get(k) ?? new Map<string, number>(), inner)));
    return out;
  };
  return {
    ...b,
    instructions: a.instructions + b.instructions,
    grossUSD: a.grossUSD + b.grossUSD,
    reserveDeltaByBank: mergeMap(a.reserveDeltaByBank, b.reserveDeltaByBank),
    tgaDeltaByRegion: mergeMap(a.tgaDeltaByRegion, b.tgaDeltaByRegion),
    smePoolFlowsByPool: mergeNested(a.smePoolFlowsByPool, b.smePoolFlowsByPool),
    householdFlowsByRegion: mergeNested(a.householdFlowsByRegion, b.householdFlowsByRegion),
    treasuryFlowsByRegion: mergeNested(a.treasuryFlowsByRegion, b.treasuryFlowsByRegion),
    creditCreatedByBank: mergeMap(a.creditCreatedByBank, b.creditCreatedByBank),
    bankEquityDeltaByBank: mergeMap(a.bankEquityDeltaByBank, b.bankEquityDeltaByBank),
    clearingHouseResidualUSD: a.clearingHouseResidualUSD + b.clearingHouseResidualUSD,
    centralBankIssuanceUSD: a.centralBankIssuanceUSD + b.centralBankIssuanceUSD,
    centralBankIssuanceByRegion: mergeMap(a.centralBankIssuanceByRegion, b.centralBankIssuanceByRegion),
    bankSecuritiesDeltaByBank: mergeMap(a.bankSecuritiesDeltaByBank, b.bankSecuritiesDeltaByBank),
    centralBankResidualUSD: a.centralBankResidualUSD + b.centralBankResidualUSD,
    crossBorderByRegion: mergeMap(a.crossBorderByRegion, b.crossBorderByRegion),
    accountRowsUnmapped: a.accountRowsUnmapped + b.accountRowsUnmapped,
    unresolvedUSD: a.unresolvedUSD + b.unresolvedUSD,
  };
}

export function runSettlementStage(ctx: WeeklyStepContext): SettlementReport {
  const priorReport = ctx.lastSettlementReport;
  const journal = ctx.paymentJournal;
  const nInstructions = journal.n;
  const report: SettlementReport = {
    instructions: nInstructions,
    grossUSD: 0,
    reserveDeltaByBank: new Map(),
    tgaDeltaByRegion: new Map(),
    smePoolFlowsByPool: new Map(),
    householdFlowsByRegion: new Map(),
    treasuryFlowsByRegion: new Map(),
    creditCreatedByBank: new Map(),
    bankEquityDeltaByBank: new Map(),
    clearingHouseResidualUSD: 0,
    centralBankIssuanceUSD: 0,
    centralBankIssuanceByRegion: new Map(),
    bankSecuritiesDeltaByBank: new Map(),
    centralBankResidualUSD: 0,
    crossBorderByRegion: new Map(),
    unresolvedUSD: 0,
    accountRowsUnmapped: 0,
  };
  if (nInstructions === 0) {
    ctx.lastSettlementReport = priorReport ? mergeSettlementReports(priorReport, report) : report;
    return ctx.lastSettlementReport;
  }

  // ---- 1. Apply every due row to the account store by the one rule and keep the
  // per-reason ledgers the sector parties' income statements are built from.
  const companyByTicker = new Map(ctx.updatedCompanies.map((c) => [c.ticker, c]));
  const entityById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));
  // C4b — which central bank's system a side of a payment lives in. Every party but
  // the clearing house has one; the clearing house is the hub its legs pass through, so a leg
  // to or from it attributes through its other side and the hub itself contributes nothing.
  const regionOfParty = (ref: PartyRef): string | undefined => {
    switch (ref.kind) {
      case 'COMPANY': return companyByTicker.get(ref.ticker)?.region;
      case 'INSTITUTION': return entityById.get(ref.id)?.region;
      case 'BANK': case 'BANK_SECURITIES': case 'BANK_CREDIT': return companyByTicker.get(ref.ticker)?.region;
      case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': return ref.region;
      case 'CLEARING_HOUSE': return undefined;
      default: return assertNever(ref, 'regionOfParty');
    }
  };
  const traceUnresolved = process.env.UNRESOLVED_TRACE === '1';
  const sheetByTicker = traceUnresolved
    ? new Map(ctx.updatedCompanies.filter((c) => c.isBankEntity).map((c) => [c.ticker, !!c.bankBalanceSheet]))
    : undefined;
  const week = settlementWeek();
  // A: the pass store, opened from the persistent accounts, takes every settled row by
  // the one rule; the tallies are read off its rows' deltas (A4); the projection writes it back.
  const accounts = buildAccountMirror(ctx);
  for (let n = 0; n < nInstructions; n++) {
    if (!rowDue(journal, n, week)) continue; // §5-WIRES N: dated past this pass — carried below
    const amountUSD = journal.amountUSD[n];
    const payerIdx = journal.payerId[n];
    if (!applySettledRow(accounts, payerIdx, journal.payeeId[n], amountUSD)) report.accountRowsUnmapped++;
    const payeeIdx = journal.payeeId[n];
    const payerRef = partyOf(payerIdx);
    const payeeRef = partyOf(payeeIdx);
    report.grossUSD += amountUSD;
    if (sheetByTicker) {
      // A leg addressed to a bank that has no sheet any more (resolved, merged) is money with
      // no account; name the stage's reason here, where the leg is still legible.
      [payerRef, payeeRef].forEach((ref, side) => {
        if ((ref.kind === 'BANK' || ref.kind === 'BANK_SECURITIES' || ref.kind === 'BANK_CREDIT') && sheetByTicker.get(ref.ticker) === false) {
          console.log(`  [unresolved] ${ref.kind} ${ref.ticker} (${side === 0 ? 'payer' : 'payee'}) ${(amountUSD / 1e6).toFixed(3)}M '${reasonText(journal.reasonId[n])}' — no sheet`);
        }
      });
    }
    // C4b: the official-settlement leg. A same-region payment nets to nothing here; a
    // cross-region one is money leaving one central bank's system for another's.
    const payerRegion = regionOfParty(payerRef);
    const payeeRegion = regionOfParty(payeeRef);
    if (payerRegion !== payeeRegion) {
      if (payerRegion !== undefined) addTo(report.crossBorderByRegion, payerRegion, -amountUSD);
      if (payeeRegion !== undefined) addTo(report.crossBorderByRegion, payeeRegion, amountUSD);
    }
    // The ledgers below key by the reason's TEXT, so it is un-interned only for the few payments
    // whose payer or payee is one of the kinds that keeps a per-reason ledger.
    const payerKind = payerRef.kind;
    const payeeKind = payeeRef.kind;
    if (payerKind === 'SEGMENT' || payeeKind === 'SEGMENT'
      || payerKind === 'HOUSEHOLD' || payeeKind === 'HOUSEHOLD'
      || payerKind === 'GOVERNMENT' || payeeKind === 'GOVERNMENT') {
      const reason = reasonText(journal.reasonId[n]);
      // C5: the treasury's flow statement is its payments.
      if (payerRef.kind === 'GOVERNMENT') addToNested(report.treasuryFlowsByRegion, payerRef.region, reason, -amountUSD);
      if (payeeRef.kind === 'GOVERNMENT') addToNested(report.treasuryFlowsByRegion, payeeRef.region, reason, amountUSD);
      // SEG-D: the pools' income statement, built from the payments themselves.
      if (payerRef.kind === 'SEGMENT') addToPool(report, payerRef.region, payerRef.industry, reason, -amountUSD);
      if (payeeRef.kind === 'SEGMENT') addToPool(report, payeeRef.region, payeeRef.industry, reason, amountUSD);
      if (payerRef.kind === 'HOUSEHOLD') addToNested(report.householdFlowsByRegion, payerRef.region, reason, -amountUSD);
      if (payeeRef.kind === 'HOUSEHOLD') addToNested(report.householdFlowsByRegion, payeeRef.region, reason, amountUSD);
    }
  }

  // ---- 2. A4: what the pass settled, read off the rows — no per-kind resolution, no
  // second set of writes. A bank's reserves moved by its own row; its income and expense are
  // its own-account parties' nets; a deposit its credit wrote, the treasury's account, the
  // central bank's issuance and the clearing house's residual are the rows of those classes.
  {
    const t = settledTallies(accounts);
    report.reserveDeltaByBank = t.reserveDeltaByBank;
    report.creditCreatedByBank = t.creditCreatedByBank;
    report.bankSecuritiesDeltaByBank = t.bankSecuritiesDeltaByBank;
    report.bankEquityDeltaByBank = t.bankEquityDeltaByBank;
    report.tgaDeltaByRegion = t.tgaDeltaByRegion;
    report.centralBankIssuanceUSD = t.centralBankIssuanceUSD;
    report.centralBankIssuanceByRegion = t.centralBankIssuanceByRegion;
    report.clearingHouseResidualUSD = t.clearingHouseResidualUSD;
    report.unresolvedUSD += t.unresolvedUSD;
  }

  // ---- 3. Apply it. Every balance is the PROJECTION of the account store (`projectBooks`).
  // Equity is not a balance: the bank's own-account legs are its income and expense, and they
  // land here, on the sheet.
  const bankByTicker = new Map(
    ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet).map((c) => [c.ticker, c])
  );
  report.bankEquityDeltaByBank.forEach((equityDeltaUSD, ticker) => {
    const bank = bankByTicker.get(ticker);
    if (!bank?.bankBalanceSheet) { report.unresolvedUSD += equityDeltaUSD; return; }
    if (equityDeltaUSD !== 0) bank.bankBalanceSheet = { ...bank.bankBalanceSheet, bankEquityUSD: bank.bankBalanceSheet.bankEquityUSD + equityDeltaUSD };
  });
  projectBooks(ctx, accounts);

  // ---- 4a. C4b: OFFICIAL SETTLEMENT. Reserves that crossed a border were credited by
  // the receiving central bank against a claim on the paying one, whose own liability to it is
  // the same number with the other sign. Booked here, from the instructions, in the same pass
  // that moved the reserves — so every central bank's book closes every week and the world's
  // claims net to zero.
  report.crossBorderByRegion.forEach((deltaUSD, region) => {
    const cb = ctx.updatedRegions[region as keyof typeof ctx.updatedRegions]?.centralBankSheet;
    if (!cb) { report.unresolvedUSD += deltaUSD; return; }
    cb.foreignOfficialClaimsUSD = (cb.foreignOfficialClaimsUSD ?? 0) + deltaUSD;
  });

  // ---- 4b (retired, step 10). SETL2b booked a loan row on the lender here for
  // every facility written this week, so the loan and the deposit appeared in one statement.
  // The asset half is now the facility row itself on the borrower's ladder, written where the
  // draw is made; the lender's book is a read of those rows (`facilityBookOf`). The BANK_CREDIT
  // leg above still writes the deposit half with no reserve moving.

  // The treasury banks at the central bank, so its balance is a central-bank liability: what the
  // government collects has left the banking system's reserves, which is why a tax date tightens
  // money markets.
  // A2: the treasury's account and the advance are the two signs
  // of its net position at the central bank — projected above. A region the tallies name but
  // the store does not is money with no account.
  report.tgaDeltaByRegion.forEach((deltaUSD, region) => {
    if (!ctx.updatedRegions[region as RegionId]?.centralBankSheet) report.unresolvedUSD += deltaUSD;
  });

  report.centralBankResidualUSD = centralBankResidualUSD(report);
  ctx.lastSettlementReport = priorReport ? mergeSettlementReports(priorReport, report) : report;
  // N: the rows dated past this pass are CARRIED — the same journal, the same wires,
  // settled by the pass of their own week. Nothing else survives the pass.
  const carried = newPaymentJournal();
  for (let n = 0; n < nInstructions; n++) {
    if (rowDue(journal, n, week)) continue;
    journalAppendRow(carried, journal.payerId[n], journal.payeeId[n], journal.amountUSD[n], journal.reasonId[n], journal.settleWeek[n]);
  }
  ctx.paymentJournal = carried;
  clearPendingNet(ctx);
  return report;
}

function addToPool(report: SettlementReport, region: string, industry: string, reason: string, deltaUSD: number): void {
  addToNested(report.smePoolFlowsByPool, `${region}:${industry}`, reason, deltaUSD);
}

function addToNested(outer: Map<string, Map<string, number>>, key: string, reason: string, deltaUSD: number): void {
  let inner = outer.get(key);
  if (!inner) { inner = new Map(); outer.set(key, inner); }
  inner.set(reason, (inner.get(reason) ?? 0) + deltaUSD);
}

function addTo(map: Map<string, number>, key: string, deltaUSD: number): void {
  map.set(key, (map.get(key) ?? 0) + deltaUSD);
}

/**
 * The central bank's liabilities only move BETWEEN buckets: what the treasury took in came out
 * of bank reserves, and the central bank's own issuance is the one place new reserves come from.
 * (This function stood unused from the day it was written, with a sign the other way round;
 * nothing read it, so nothing caught it. It runs every week now. A2 retired the T+1
 * household channel it once added back.)
 */
function centralBankResidualUSD(report: SettlementReport): number {
  let tga = 0;
  report.tgaDeltaByRegion.forEach((v) => { tga += v; });
  let reserves = 0;
  report.reserveDeltaByBank.forEach((v) => { reserves += v; });
  return reserves + tga - report.centralBankIssuanceUSD;
}
