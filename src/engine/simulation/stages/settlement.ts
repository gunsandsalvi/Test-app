/**
 * THE SETTLEMENT LAYER (CASH / SETL1) — where money actually moves.
 *
 * Until now every stage moved cash by mutating whatever field it owned: a company's `cash`, an
 * entity's `cashUSD`, a bank's `cashReservesUSD`, the treasury's account. Nothing connected them,
 * which is exactly how corporate cash came to sit outside the banking system for the whole life
 * of the model — reported as `corporateDepositsUSD`, held by no bank, backed by no asset (§7.86).
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
import { WeeklyStepContext } from './context';

/** Who is paying or being paid. Every party either holds a deposit at a named bank, or is one of
 *  the two parties that bank at the central bank (the government and the central bank itself). */
export type { PartyRef } from '../../ledger/party';
import { PartyRef, partyId, partyOf } from '../../ledger/party';
import { PaymentCategory, categoryOfReason } from '../../ledger/payment-category';
import { assertNever } from '../../../domain/defect';

export interface PaymentInstruction {
  payer: PartyRef;
  payee: PartyRef;
  amountUSD: number;
  /** The named real flow — carried into the ledgers so a dollar is traceable to why it moved. */
  reason: string;
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
}

export function newPaymentJournal(): PaymentJournal {
  const cap = 1 << 12;
  return {
    n: 0,
    payerId: new Int32Array(cap),
    payeeId: new Int32Array(cap),
    amountUSD: new Float64Array(cap),
    reasonId: new Int32Array(cap),
  };
}

/** SCALE (§7.305 step 2) — one journal row, typed-array columns with doubling growth: the
 *  ~200k-and-growing number[] pushes a week were the settlement file's own measured mass. */
export function journalPush(j: PaymentJournal, payerId: number, payeeId: number, amountUSD: number, reasonId: number): void {
  if (j.n >= j.payerId.length) {
    const cap = j.payerId.length * 2;
    const gi = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old); return a; };
    const gf = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
    j.payerId = gi(j.payerId);
    j.payeeId = gi(j.payeeId);
    j.amountUSD = gf(j.amountUSD);
    j.reasonId = gi(j.reasonId);
  }
  j.payerId[j.n] = payerId;
  j.payeeId[j.n] = payeeId;
  j.amountUSD[j.n] = amountUSD;
  j.reasonId[j.n] = reasonId;
  j.n++;
}

const reasonIdByText = new Map<string, number>();
const reasonById: string[] = [];
// §7.276: classified ONCE, at intern time — the category rides beside the free text for the
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
/** §7.325 W2 — table size and texts-from-index, to seed a worker's reason table id-for-id. */
export const reasonTableSize = (): number => reasonById.length;
export const reasonTextsFrom = (from: number): string[] => reasonById.slice(from);
/** The category beside the free text (§7.276). */
export const reasonCategory = (id: number): PaymentCategory => reasonCategoryById[id];
/** Every reason this run has written that no category rule matches. The harness asserts this
 *  list is EMPTY — a new payment reason must land a rule in `payment-category.ts` first. */
export function unclassifiedReasons(): string[] {
  return reasonById.filter((_, i) => reasonCategoryById[i] === 'UNCLASSIFIED');
}
/** Append to the journal from a stage that holds only a slice of the context. Same encoding as
 *  `pay`, minus the running-net update, which those callers do not participate in. */
export function journalPayment(j: PaymentJournal, instruction: PaymentInstruction): void {
  if (!guardPayableAmount(instruction)) return;
  journalPush(j, partyId(instruction.payer), partyId(instruction.payee),
    instruction.amountUSD, internReason(instruction.reason));
}


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
 * §7.241: this guard used to silently drop NaN and negative amounts, which converted every
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
  journalPush(ctx.paymentJournal, payer, payee, instruction.amountUSD, internReason(instruction.reason));
  addPending(ctx, payer, -instruction.amountUSD);
  addPending(ctx, payee, instruction.amountUSD);
}

/**
 * SCALE §7.303 — the hot-loop form of `pay`: party and reason already interned by the caller
 * (hoisted once per company / per plan instead of two string-map probes per leg — the goods
 * auction and the cash walk emit ~400k legs a week). Same guard, same journal encoding, same
 * running-net update; a caller that cannot hoist keeps using `pay`.
 */
export function payByIds(
  ctx: WeeklyStepContext, payerId: number, payeeId: number, amountUSD: number, reasonId: number,
): void {
  if (!(amountUSD > 1e-9 && isFinite(amountUSD))) {
    if (amountUSD >= -1e-9 && amountUSD <= 1e-9) return; // exact zero or dust: an honest no-op
    throw new Error(`ENGINE DEFECT: payByIds reason#${reasonId} carries amountUSD=${amountUSD} — `
      + 'a NaN or negative amount is a sign/arithmetic error at the caller, not a payment');
  }
  journalPush(ctx.paymentJournal, payerId, payeeId, amountUSD, reasonId);
  addPending(ctx, payerId, -amountUSD);
  addPending(ctx, payeeId, amountUSD);
}

/** The running net, as a dense array indexed by party id. Touched ids are remembered so the
 *  week's reset is proportional to what moved rather than to the table's size. */
function addPending(ctx: WeeklyStepContext, id: number, deltaUSD: number): void {
  // §7.321 barrier mode: the running net is applied at MERGE time, leg by leg in the journal's
  // merged order (applyPendingLeg below), so per-party float sums keep the exact summation tree
  // the interleaved loop had. Emission-time application is suppressed inside the phase loops.
  if (ctx.deferPendingNet) return;
  const net = ctx.pendingNetById;
  if (net[id] === undefined) { net[id] = deltaUSD; ctx.pendingTouchedIds.push(id); return; }
  net[id] += deltaUSD;
}

/** §7.321 barrier merge: one journal leg's effect on the running net, applied in merged order. */
export function applyPendingLeg(ctx: WeeklyStepContext, payerId: number, payeeId: number, amountUSD: number): void {
  const net = ctx.pendingNetById;
  if (net[payerId] === undefined) { net[payerId] = -amountUSD; ctx.pendingTouchedIds.push(payerId); }
  else net[payerId] += -amountUSD;
  if (net[payeeId] === undefined) { net[payeeId] = amountUSD; ctx.pendingTouchedIds.push(payeeId); }
  else net[payeeId] += amountUSD;
}

/** Zero the week's running net. */
export function clearPendingNet(ctx: WeeklyStepContext): void {
  const net = ctx.pendingNetById;
  for (let i = 0; i < ctx.pendingTouchedIds.length; i++) net[ctx.pendingTouchedIds[i]] = undefined as unknown as number;
  ctx.pendingTouchedIds.length = 0;
}

/**
 * SETL6 — what a party has committed to pay or is due to receive at this week's settlement,
 * before it happens. A trade agreed today is a payable or a receivable until it settles, and
 * both belong on the balance sheet: a fund's assets include what it is owed, and its spending
 * power excludes what it has already committed. Without this the five clearing books would each
 * size their budget off the same unspent balance and buy the same dollar five times.
 */
export function pendingSettlementUSD(ctx: WeeklyStepContext, party: PartyRef): number {
  return ctx.pendingNetById[partyId(party)] ?? 0;
}

export interface SettlementReport {
  instructions: number;
  grossUSD: number;
  /** Net deposit change per bank ticker — what its customers' balances did on net. */
  depositDeltaByBank: Map<string, number>;
  /** Reserve movement per bank — what it had to settle across the central bank's books. */
  reserveDeltaByBank: Map<string, number>;
  /** Treasury account movement per region. */
  tgaDeltaByRegion: Map<string, number>;
  /** What flowed to (positive) or from (negative) counterparties that do not exist yet. */
  unmodeledDeltaByRegion: Map<string, number>;
  /** Per-bank movement of the corporate deposit line — the liability leg that moves with the
   *  reserves below, so asset and liability never drift apart. */
  corporateDepositDeltaByBank: Map<string, number>;
  /** Per-bank movement of the institutional deposit line. */
  institutionalDepositDeltaByBank: Map<string, number>;
  /** Per-bank movement of the named boundary's balance. */
  unmodeledDepositDeltaByBank: Map<string, number>;
  /** SEG1 — per-bank movement of the private-sector segment pools' deposit line. */
  smeDepositDeltaByBank: Map<string, number>;
  /** HH — every household flow this week, per region, keyed by the payment's own reason and
   *  signed from the household's side. Household INCOME is derived from this (see
   *  stages/household-balance-sheet.ts): what they were actually paid, not a labor-share
   *  identity. Free, like the pools' P&L — every household flow is already a payment. */
  householdFlowsByRegion: Map<string, Map<string, number>>;
  /** SEG-D — every pool flow this week, keyed `<region>:<industry>` then by the payment's own
   *  reason, signed from the pool's side. This is the pool's INCOME STATEMENT, and it is free:
   *  every pool flow is already a payment passing through here, so a new kind of pool flow shows
   *  up in its P&L without anything being instrumented (rule 17). */
  smePoolFlowsByPool: Map<string, Map<string, number>>;
  /** Payments to/from a bank on its own account — income and expense, so equity moves too. */
  bankEquityDeltaByBank: Map<string, number>;
  /** Deposits created by this bank's own lending — they need no reserve settlement. */
  creditCreatedByBank: Map<string, number>;
  /** The boundary, decomposed by the flow that hit it. §6 wants this line watched DOWN; you
   *  cannot watch down a number you cannot attribute, and each entry names a flow still missing
   *  its counterparty. Signed from the modelled economy's side: negative = paid out to nobody. */
  unmodeledByReason: Map<string, number>;
  /** Household flows handed to HH4d's T+1 channel — settled by next week's bank pass, not here. */
  householdDeferredUSD: number;
  /** SETL6 — what the cleared books' central counterparty was left holding. Must be zero. */
  clearingHouseResidualUSD: number;
  /** SETL6 — reserves the central bank ISSUED this week by paying for assets with money it
   *  created (an open-market purchase), less what it extinguished by selling. It is the one
   *  party whose payments are not funded from a balance, so the reserves that appear at the
   *  sellers' banks are new — and the identity below has to know that or it reads as a leak. */
  centralBankIssuanceUSD: number;
  /** What the central bank's own books were left holding — see `centralBankResidualUSD`. Zero. */
  centralBankResidualUSD: number;
  /** Money that could not be applied: a party that does not exist, or a holder with no bank.
   *  Must be zero. A non-zero value is money leaving the system — the §7.86 defect's shape. */
  unresolvedUSD: number;
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
    depositDeltaByBank: mergeMap(a.depositDeltaByBank, b.depositDeltaByBank),
    reserveDeltaByBank: mergeMap(a.reserveDeltaByBank, b.reserveDeltaByBank),
    tgaDeltaByRegion: mergeMap(a.tgaDeltaByRegion, b.tgaDeltaByRegion),
    unmodeledDeltaByRegion: mergeMap(a.unmodeledDeltaByRegion, b.unmodeledDeltaByRegion),
    corporateDepositDeltaByBank: mergeMap(a.corporateDepositDeltaByBank, b.corporateDepositDeltaByBank),
    institutionalDepositDeltaByBank: mergeMap(a.institutionalDepositDeltaByBank, b.institutionalDepositDeltaByBank),
    unmodeledDepositDeltaByBank: mergeMap(a.unmodeledDepositDeltaByBank, b.unmodeledDepositDeltaByBank),
    smeDepositDeltaByBank: mergeMap(a.smeDepositDeltaByBank, b.smeDepositDeltaByBank),
    smePoolFlowsByPool: mergeNested(a.smePoolFlowsByPool, b.smePoolFlowsByPool),
    householdFlowsByRegion: mergeNested(a.householdFlowsByRegion, b.householdFlowsByRegion),
    creditCreatedByBank: mergeMap(a.creditCreatedByBank, b.creditCreatedByBank),
    bankEquityDeltaByBank: mergeMap(a.bankEquityDeltaByBank, b.bankEquityDeltaByBank),
    unmodeledByReason: mergeMap(a.unmodeledByReason, b.unmodeledByReason),
    householdDeferredUSD: a.householdDeferredUSD + b.householdDeferredUSD,
    clearingHouseResidualUSD: a.clearingHouseResidualUSD + b.clearingHouseResidualUSD,
    centralBankIssuanceUSD: a.centralBankIssuanceUSD + b.centralBankIssuanceUSD,
    centralBankResidualUSD: a.centralBankResidualUSD + b.centralBankResidualUSD,
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
    depositDeltaByBank: new Map(),
    reserveDeltaByBank: new Map(),
    tgaDeltaByRegion: new Map(),
    unmodeledDeltaByRegion: new Map(),
    corporateDepositDeltaByBank: new Map(),
    institutionalDepositDeltaByBank: new Map(),
    unmodeledDepositDeltaByBank: new Map(),
    smeDepositDeltaByBank: new Map(),
    smePoolFlowsByPool: new Map(),
    householdFlowsByRegion: new Map(),
    creditCreatedByBank: new Map(),
    bankEquityDeltaByBank: new Map(),
    unmodeledByReason: new Map(),
    householdDeferredUSD: 0,
    clearingHouseResidualUSD: 0,
    centralBankIssuanceUSD: 0,
    centralBankResidualUSD: 0,
    unresolvedUSD: 0,
  };
  if (nInstructions === 0) {
    ctx.lastSettlementReport = priorReport ? mergeSettlementReports(priorReport, report) : report;
    return ctx.lastSettlementReport;
  }

  // ---- 1. Net every party's position. Order-independent by construction (addition), so the
  // result does not depend on the order stages happened to record their instructions.
  // SCALE: netted on the party's integer id — a dense array and a touched-list, not a hash map
  // keyed by a string rebuilt for each of ~290,000 legs a week.
  const netById: number[] = [];
  const netTouched: number[] = [];
  // The journal already carries the id; looking it up again from a reconstructed ref was half of
  // `partyId`'s calls for nothing.
  const add = (id: number, deltaUSD: number) => {
    if (netById[id] === undefined) { netById[id] = deltaUSD; netTouched.push(id); }
    else netById[id] += deltaUSD;
  };
  for (let n = 0; n < nInstructions; n++) {
    const amountUSD = journal.amountUSD[n];
    const payerIdx = journal.payerId[n];
    const payeeIdx = journal.payeeId[n];
    const payerRef = partyOf(payerIdx);
    const payeeRef = partyOf(payeeIdx);
    report.grossUSD += amountUSD;
    add(payerIdx, -amountUSD);
    add(payeeIdx, amountUSD);
    // The ledgers below key by the reason's TEXT, so it is un-interned only for the few payments
    // whose payer or payee is one of the kinds that keeps a per-reason ledger.
    const payerKind = payerRef.kind;
    const payeeKind = payeeRef.kind;
    if (payerKind === 'UNMODELED' || payeeKind === 'UNMODELED'
      || payerKind === 'SEGMENT' || payeeKind === 'SEGMENT'
      || payerKind === 'HOUSEHOLD' || payeeKind === 'HOUSEHOLD') {
      const reason = reasonText(journal.reasonId[n]);
      // Attribute the boundary as it is created, by the flow responsible.
      if (payerRef.kind === 'UNMODELED') addTo(report.unmodeledByReason, reason, amountUSD);
      if (payeeRef.kind === 'UNMODELED') addTo(report.unmodeledByReason, reason, -amountUSD);
      // SEG-D: the pools' income statement, built from the payments themselves.
      if (payerRef.kind === 'SEGMENT') addToPool(report, payerRef.region, payerRef.industry, reason, -amountUSD);
      if (payeeRef.kind === 'SEGMENT') addToPool(report, payeeRef.region, payeeRef.industry, reason, amountUSD);
      if (payerRef.kind === 'HOUSEHOLD') addToNested(report.householdFlowsByRegion, payerRef.region, reason, -amountUSD);
      if (payeeRef.kind === 'HOUSEHOLD') addToNested(report.householdFlowsByRegion, payeeRef.region, reason, amountUSD);
    }
  }

  // ---- 2. Apply each party's net change to the balance it actually holds, and record which
  // bank's book that balance sits on. A party banking at the central bank (the government) moves
  // the treasury account instead of a deposit.
  const companyByTicker = new Map(ctx.updatedCompanies.map((c) => [c.ticker, c]));
  const entityById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));

  netTouched.forEach((id) => {
    const party = partyOf(id);
    const deltaUSD = netById[id];
    if (deltaUSD === 0) return;
    switch (party.kind) {
      case 'COMPANY': {
        const comp = companyByTicker.get(party.ticker);
        if (!comp) {
          report.unresolvedUSD += deltaUSD;
          // UNRESOLVED_TRACE=1 — name the account a payment could not find, at the moment it
          // fails: the violation itself only carries the week's total.
          if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] COMPANY ${party.ticker} net ${(deltaUSD / 1e6).toFixed(2)}M found no account`);
          }
          return;
        }
        // A BANK trading on its own account is not a depositor — it has no home bank, because
        // it IS one. Its money is central-bank reserves and the other side is its own equity,
        // exactly as the BANK party below. Routing it as an ordinary company dropped every such
        // payment on the floor: a bank sells real services in the goods market (the financial
        // sector's proxy product lines), so 14.7B a week was leaving the system unresolved at
        // the point where `homeBankTicker` came back undefined.
        if (comp.isBankEntity && comp.bankBalanceSheet) {
          addTo(report.reserveDeltaByBank, comp.ticker, deltaUSD);
          addTo(report.bankEquityDeltaByBank, comp.ticker, deltaUSD);
          return;
        }
        comp.cash += deltaUSD;
        creditBank(report, comp.homeBankTicker, deltaUSD);
        addTo(report.corporateDepositDeltaByBank, comp.homeBankTicker ?? '', deltaUSD);
        return;
      }
      case 'INSTITUTION': {
        const entity = entityById.get(party.id);
        if (!entity) { report.unresolvedUSD += deltaUSD; if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] INSTITUTION ${party.id} net ${(deltaUSD / 1e6).toFixed(2)}M found no account ()`);
          } return; }
        entity.cashUSD = (entity.cashUSD ?? 0) + deltaUSD;
        creditBank(report, entity.homeBankTicker, deltaUSD);
        addTo(report.institutionalDepositDeltaByBank, entity.homeBankTicker ?? '', deltaUSD);
        return;
      }
      case 'SEGMENT': {
        // SEG1: the pool's balance moves, and the liability sits with the region's banks in
        // proportion to their size — same shape as the boundary's banking, but on a NAMED line
        // belonging to a real (aggregate) actor rather than to nobody.
        const seg = ctx.updatedRegions[party.region]?.smePools
          ?.find((s) => s.industry === party.industry);
        if (!seg) { report.unresolvedUSD += deltaUSD; if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] SEGMENT ${party.region}:${party.industry} net ${(deltaUSD / 1e6).toFixed(2)}M found no account (no pool)`);
          } return; }
        seg.cashUSD = (seg.cashUSD ?? 0) + deltaUSD;
        const segBanks = ctx.updatedCompanies.filter(
          (c) => c.region === party.region && c.isBankEntity && c.bankBalanceSheet && !c.isDefaulted
        );
        const segTotalShare = segBanks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
        if (segBanks.length === 0 || !(segTotalShare > 0)) { report.unresolvedUSD += deltaUSD; if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] SEGMENT ${party.region}:${party.industry} net ${(deltaUSD / 1e6).toFixed(2)}M found no account (no live bank)`);
          } return; }
        segBanks.forEach((b) => {
          const shareUSD = deltaUSD * ((b.bankMarketShare ?? 0) / segTotalShare);
          addTo(report.depositDeltaByBank, b.ticker, shareUSD);
          addTo(report.smeDepositDeltaByBank, b.ticker, shareUSD);
        });
        return;
      }
      case 'HOUSEHOLD': {
        const hs = ctx.updatedRegions[party.region]?.householdState;
        if (!hs) { report.unresolvedUSD += deltaUSD; if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] HOUSEHOLD ${party.region} net ${(deltaUSD / 1e6).toFixed(2)}M found no account (no household state)`);
          } return; }
        hs.depositsUSD = (hs.depositsUSD ?? 0) + deltaUSD;
        // HH4d already owns the household deposit hand-off: a stage moving them after the bank
        // pass records the flow here and the banks post it next week (T+1). So the bank leg is
        // NOT credited now — that would post the same dollar twice.
        hs.pendingBankSettlementUSD = (hs.pendingBankSettlementUSD ?? 0) + deltaUSD;
        report.householdDeferredUSD += deltaUSD;
        return;
      }
      case 'BANK': {
        // A bank paying or being paid on its OWN account — not a customer's — moves its reserves,
        // and because no deposit was created against them the other side is its EQUITY: this is
        // the bank's own income or expense (SETL4: facility interest arrives this way). Crediting
        // reserves alone would leave an asset with nothing behind it.
        addTo(report.reserveDeltaByBank, party.ticker, deltaUSD);
        addTo(report.bankEquityDeltaByBank, party.ticker, deltaUSD);
        return;
      }
      case 'BANK_SECURITIES': {
        // The bank's own book, not a customer's: reserves out, the security in — and the
        // clearing stage that recorded this writes the security in the same pass. No equity
        // leg, because nothing was earned or spent; one asset became another.
        addTo(report.reserveDeltaByBank, party.ticker, deltaUSD);
        return;
      }
      case 'CLEARING_HOUSE': {
        report.clearingHouseResidualUSD += deltaUSD;
        return;
      }
      case 'BANK_CREDIT': {
        // Nothing to debit: the money did not exist a moment ago. Recorded so the reserve leg
        // below knows this deposit was written rather than received.
        addTo(report.creditCreatedByBank, party.ticker, -deltaUSD);
        return;
      }
      case 'GOVERNMENT': {
        addTo(report.tgaDeltaByRegion, party.region, deltaUSD);
        return;
      }
      case 'UNMODELED': {
        // The boundary banks too. A counterparty this model has not built yet still holds its
        // money somewhere, so its balance sits with the region's banks in proportion to their
        // size — the line is a visible deposit stock to watch down (§6), not a hole in the
        // central bank's books.
        addTo(report.unmodeledDeltaByRegion, party.region, deltaUSD);
        const banks = ctx.updatedCompanies.filter(
          (c) => c.region === party.region && c.isBankEntity && c.bankBalanceSheet && !c.isDefaulted
        );
        const totalShare = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
        if (banks.length === 0 || !(totalShare > 0)) { report.unresolvedUSD += deltaUSD; if (process.env.UNRESOLVED_TRACE === '1') {
            console.log(`  [unresolved] UNMODELED ${party.region} net ${(deltaUSD / 1e6).toFixed(2)}M found no account (no live bank)`);
          } return; }
        banks.forEach((b) => {
          const shareUSD = deltaUSD * ((b.bankMarketShare ?? 0) / totalShare);
          addTo(report.depositDeltaByBank, b.ticker, shareUSD);
          addTo(report.unmodeledDepositDeltaByBank, b.ticker, shareUSD);
        });
        return;
      }
      case 'CENTRAL_BANK':
        // The central bank settles by issuing or extinguishing its own liability: it pays with
        // reserves it creates, so nothing is debited here and the reserves simply appear at the
        // payee's bank. Recorded because that is money entering the system, not moving within it.
        report.centralBankIssuanceUSD -= deltaUSD;
        return;
      default:
        // §7.241: without this, a new party kind's settled money fell through the switch and was
        // deleted without even touching `unresolvedUSD`. A new kind now fails to COMPILE here.
        return assertNever(party, `settlement apply for net delta ${deltaUSD}`);
    }
  });

  // ---- 3. Interbank settlement. A bank whose customers received more than they paid holds more
  // deposits and is owed reserves; one whose customers paid out owes them. Same-bank payments
  // have already netted to nothing inside each bank's own delta, so this is exactly the
  // cross-bank residual — which is what settles across the central bank's books.
  // Deposits a bank WROTE need no settlement; deposits it RECEIVED do. Subtracting its own
  // credit creation leaves exactly the cross-bank residual — and if a bank lends to someone who
  // banks elsewhere, the difference is a real reserve payment, which is also correct.
  const settlingBanks = new Set<string>([...report.depositDeltaByBank.keys(), ...report.creditCreatedByBank.keys()]);
  settlingBanks.forEach((ticker) => {
    const received = report.depositDeltaByBank.get(ticker) ?? 0;
    const written = report.creditCreatedByBank.get(ticker) ?? 0;
    addTo(report.reserveDeltaByBank, ticker, received - written);
  });

  // ---- 4. Apply it. A bank whose customers were paid holds more money and more reserves; the
  // one whose customers paid holds less of both. This is the leg that was missing entirely: the
  // deposit stock moved on the companies' books and no bank's balance sheet ever knew (§7.86).
  const bankByTicker = new Map(
    ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet).map((c) => [c.ticker, c])
  );
  report.reserveDeltaByBank.forEach((deltaUSD, ticker) => {
    const bank = bankByTicker.get(ticker);
    if (!bank?.bankBalanceSheet) { report.unresolvedUSD += deltaUSD; return; }
    // Asset and liability move in the same statement: the reserves that arrived ARE the balance
    // the customer now holds. Splitting these across stages is how they drift.
    bank.bankBalanceSheet = {
      ...bank.bankBalanceSheet,
      cashReservesUSD: bank.bankBalanceSheet.cashReservesUSD + deltaUSD,
      bankEquityUSD: bank.bankBalanceSheet.bankEquityUSD + (report.bankEquityDeltaByBank.get(ticker) ?? 0),
      corporateDepositsUSD: bank.bankBalanceSheet.corporateDepositsUSD
        + (report.corporateDepositDeltaByBank.get(ticker) ?? 0),
      institutionalDepositsUSD: (bank.bankBalanceSheet.institutionalDepositsUSD ?? 0)
        + (report.institutionalDepositDeltaByBank.get(ticker) ?? 0),
      unmodeledDepositsUSD: (bank.bankBalanceSheet.unmodeledDepositsUSD ?? 0)
        + (report.unmodeledDepositDeltaByBank.get(ticker) ?? 0),
      smeDepositsUSD: (bank.bankBalanceSheet.smeDepositsUSD ?? 0)
        + (report.smeDepositDeltaByBank.get(ticker) ?? 0),
    };
    const aggRegion = ctx.updatedRegions[bank.region];
    if (aggRegion) aggRegion.bankingSector = { ...aggRegion.bankingSector, cashReservesUSD: aggRegion.bankingSector.cashReservesUSD + deltaUSD };
  });

  // ---- 4b. SETL2b: a loan and the deposit it creates, in ONE statement. The borrower's balance
  // was written by the BANK_CREDIT leg above (no reserves moved); here the matching asset appears
  // on the same bank in the same week. Doing these a week apart is what broke the identity when
  // this was first attempted (§7.89) — the reconciliation in bank-lending.ts is level-based, so
  // once the loan is booked here it finds nothing left to do.
  ctx.creditEventsThisWeek.forEach((event) => {
    const bank = bankByTicker.get(event.bankTicker);
    if (!bank?.bankBalanceSheet) { report.unresolvedUSD += event.retire ? -event.principalUSD : event.principalUSD; return; }
    const sheet = bank.bankBalanceSheet;
    const loans = [...(sheet.businessLoans || [])];
    if (event.retire) {
      const idx = loans.findIndex((l) => l.id === event.trancheId);
      if (idx >= 0) loans.splice(idx, 1);
    } else {
      const existing = loans.findIndex((l) => l.id === event.trancheId);
      if (existing >= 0) loans[existing] = { ...loans[existing], principalUSD: event.principalUSD };
      else loans.push({
        id: event.trancheId,
        borrowerId: event.companyId,
        borrowerKind: 'COMPANY_FACILITY',
        principalUSD: event.principalUSD,
        marginBps: event.marginBps,
        originationWeek: event.originationWeek,
        termWeeks: event.termWeeks,
        status: 'PERFORMING',
      });
    }
    const bookUSD = loans.reduce((a, l) => a + l.principalUSD, 0);
    bank.bankBalanceSheet = { ...sheet, businessLoans: loans, businessLoanBookUSD: bookUSD };
    const aggRegion = ctx.updatedRegions[bank.region];
    if (aggRegion) aggRegion.bankingSector = { ...aggRegion.bankingSector, businessLoanBookUSD: aggRegion.bankingSector.businessLoanBookUSD + (event.retire ? -event.principalUSD : event.principalUSD) };
  });
  ctx.creditEventsThisWeek = [];

  // The treasury banks at the central bank, so its balance is a central-bank liability: what the
  // government collects has left the banking system's reserves, which is why a tax date tightens
  // money markets.
  report.tgaDeltaByRegion.forEach((deltaUSD, region) => {
    const cb = ctx.updatedRegions[region as RegionId]?.centralBankSheet;
    if (!cb) { report.unresolvedUSD += deltaUSD; return; }
    cb.treasuryAccountUSD += deltaUSD;
  });

  report.centralBankResidualUSD = centralBankResidualUSD(report);
  ctx.lastSettlementReport = priorReport ? mergeSettlementReports(priorReport, report) : report;
  ctx.paymentJournal = newPaymentJournal();
  clearPendingNet(ctx);
  return report;
}

function creditBank(report: SettlementReport, bankTicker: string | undefined, deltaUSD: number): void {
  // A holder with no bank is a defect, not a rounding case: its money would leave the banking
  // system exactly the way corporate cash used to (§7.86). Counted, never dropped.
  if (!bankTicker) { report.unresolvedUSD += deltaUSD; return; }
  addTo(report.depositDeltaByBank, bankTicker, deltaUSD);
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
 *
 * Household flows are ADDED back, not subtracted: HH4d settles them next week, so this week the
 * payer's bank has already lost the reserves while the household's balance sits outside any
 * bank's book — reserves are short by exactly what households were paid, and the identity has to
 * say so. (This function stood unused from the day it was written, with that sign the other way
 * round; nothing read it, so nothing caught it. It runs every week now.)
 */
function centralBankResidualUSD(report: SettlementReport): number {
  let tga = 0;
  report.tgaDeltaByRegion.forEach((v) => { tga += v; });
  let reserves = 0;
  report.reserveDeltaByBank.forEach((v) => { reserves += v; });
  return reserves + tga + report.householdDeferredUSD - report.centralBankIssuanceUSD;
}
