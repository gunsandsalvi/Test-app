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
 * credits another, and the central bank's liabilities only ever move BETWEEN buckets (bank
 * reserves ↔ the treasury's account). Both are asserted at the end of every settlement run, and a
 * violation throws rather than silently plugging — the discipline §7.86 was found by.
 */

import { RegionId } from '../../../types';
import { WeeklyStepContext } from './context';

/** Who is paying or being paid. Every party either holds a deposit at a named bank, or is one of
 *  the two parties that bank at the central bank (the government and the central bank itself). */
export type PartyRef =
  | { kind: 'COMPANY'; ticker: string }
  | { kind: 'BANK'; ticker: string }
  /** SETL2b — the bank's own CREDIT, not its reserves. A loan does not move money from anywhere:
   *  the bank writes a loan on one side and a deposit on the other, and both appear at once. So
   *  a drawdown paid by BANK_CREDIT creates the borrower's balance WITHOUT any reserve leaving
   *  the lender — endogenous money, and the reason a banking system can fund itself. Reserves
   *  move only when the borrower then SPENDS it to a customer of another bank, which happens as
   *  an ordinary payment. (The loan asset stays owned by bank-lending.ts — one writer.) */
  | { kind: 'BANK_CREDIT'; ticker: string }
  | { kind: 'INSTITUTION'; id: string }
  | { kind: 'HOUSEHOLD'; region: RegionId }
  | { kind: 'GOVERNMENT'; region: RegionId }
  | { kind: 'CENTRAL_BANK'; region: RegionId }
  /** The named boundary: a counterparty this model does not have yet. Watched down, never
   *  netted away (§6's discipline for unmodeled lines). */
  | { kind: 'UNMODELED'; region: RegionId };

export interface PaymentInstruction {
  payer: PartyRef;
  payee: PartyRef;
  amountUSD: number;
  /** The named real flow — carried into the ledgers so a dollar is traceable to why it moved. */
  reason: string;
}

/** Record a payment. The only way a stage should move money. */
export function pay(ctx: WeeklyStepContext, instruction: PaymentInstruction): void {
  if (!(instruction.amountUSD > 0) || !isFinite(instruction.amountUSD)) return;
  ctx.paymentInstructions.push(instruction);
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
  /** Per-bank movement of the named boundary's balance. */
  unmodeledDepositDeltaByBank: Map<string, number>;
  /** Deposits created by this bank's own lending — they need no reserve settlement. */
  creditCreatedByBank: Map<string, number>;
  /** Household flows handed to HH4d's T+1 channel — settled by next week's bank pass, not here. */
  householdDeferredUSD: number;
  /** Money that could not be applied: a party that does not exist, or a holder with no bank.
   *  Must be zero. A non-zero value is money leaving the system — the §7.86 defect's shape. */
  unresolvedUSD: number;
}

const partyKey = (p: PartyRef): string =>
  p.kind === 'COMPANY' || p.kind === 'BANK' || p.kind === 'BANK_CREDIT' ? `${p.kind}:${p.ticker}`
    : p.kind === 'INSTITUTION' ? `INSTITUTION:${p.id}`
      : `${p.kind}:${p.region}`;

/**
 * Execute the week's instructions.
 *
 * Netting first, application second: a holder's many flows become one balance change, and a
 * bank's many customers become one reserve settlement — which is what a net settlement system
 * does, and what keeps this O(instructions) rather than O(instructions x books).
 */
export function runSettlementStage(ctx: WeeklyStepContext): SettlementReport {
  const instructions = ctx.paymentInstructions;
  const report: SettlementReport = {
    instructions: instructions.length,
    grossUSD: 0,
    depositDeltaByBank: new Map(),
    reserveDeltaByBank: new Map(),
    tgaDeltaByRegion: new Map(),
    unmodeledDeltaByRegion: new Map(),
    corporateDepositDeltaByBank: new Map(),
    unmodeledDepositDeltaByBank: new Map(),
    creditCreatedByBank: new Map(),
    householdDeferredUSD: 0,
    unresolvedUSD: 0,
  };
  if (instructions.length === 0) {
    ctx.lastSettlementReport = report;
    return report;
  }

  // ---- 1. Net every party's position. Order-independent by construction (addition), so the
  // result does not depend on the order stages happened to record their instructions.
  const netByParty = new Map<string, { party: PartyRef; deltaUSD: number }>();
  const add = (party: PartyRef, deltaUSD: number) => {
    const key = partyKey(party);
    const entry = netByParty.get(key);
    if (entry) entry.deltaUSD += deltaUSD;
    else netByParty.set(key, { party, deltaUSD });
  };
  instructions.forEach((i) => {
    report.grossUSD += i.amountUSD;
    add(i.payer, -i.amountUSD);
    add(i.payee, i.amountUSD);
  });

  // ---- 2. Apply each party's net change to the balance it actually holds, and record which
  // bank's book that balance sits on. A party banking at the central bank (the government) moves
  // the treasury account instead of a deposit.
  const companyByTicker = new Map(ctx.updatedCompanies.map((c) => [c.ticker, c]));
  const entityById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));

  netByParty.forEach(({ party, deltaUSD }) => {
    if (deltaUSD === 0) return;
    switch (party.kind) {
      case 'COMPANY': {
        const comp = companyByTicker.get(party.ticker);
        if (!comp) { report.unresolvedUSD += deltaUSD; return; }
        comp.cash += deltaUSD;
        creditBank(report, comp.homeBankTicker, deltaUSD);
        addTo(report.corporateDepositDeltaByBank, comp.homeBankTicker ?? '', deltaUSD);
        return;
      }
      case 'INSTITUTION': {
        const entity = entityById.get(party.id);
        if (!entity) { report.unresolvedUSD += deltaUSD; return; }
        entity.cashUSD = (entity.cashUSD ?? 0) + deltaUSD;
        creditBank(report, (entity as { homeBankTicker?: string }).homeBankTicker, deltaUSD);
        return;
      }
      case 'HOUSEHOLD': {
        const hs = ctx.updatedRegions[party.region]?.householdState;
        if (!hs) { report.unresolvedUSD += deltaUSD; return; }
        hs.depositsUSD = (hs.depositsUSD ?? 0) + deltaUSD;
        // HH4d already owns the household deposit hand-off: a stage moving them after the bank
        // pass records the flow here and the banks post it next week (T+1). So the bank leg is
        // NOT credited now — that would post the same dollar twice.
        hs.pendingBankSettlementUSD = (hs.pendingBankSettlementUSD ?? 0) + deltaUSD;
        report.householdDeferredUSD += deltaUSD;
        return;
      }
      case 'BANK': {
        // A bank paying on its OWN account (not a customer's) moves its reserves directly.
        addTo(report.reserveDeltaByBank, party.ticker, deltaUSD);
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
        if (banks.length === 0 || !(totalShare > 0)) { report.unresolvedUSD += deltaUSD; return; }
        banks.forEach((b) => {
          const shareUSD = deltaUSD * ((b.bankMarketShare ?? 0) / totalShare);
          addTo(report.depositDeltaByBank, b.ticker, shareUSD);
          addTo(report.unmodeledDepositDeltaByBank, b.ticker, shareUSD);
        });
        return;
      }
      case 'CENTRAL_BANK':
        // The central bank settles by issuing or extinguishing its own liability; nothing moves.
        return;
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
      corporateDepositsUSD: bank.bankBalanceSheet.corporateDepositsUSD
        + (report.corporateDepositDeltaByBank.get(ticker) ?? 0),
      unmodeledDepositsUSD: (bank.bankBalanceSheet.unmodeledDepositsUSD ?? 0)
        + (report.unmodeledDepositDeltaByBank.get(ticker) ?? 0),
    };
    const agg = ctx.updatedRegions[bank.region]?.bankingSector;
    if (agg) agg.cashReservesUSD += deltaUSD;
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
    const agg = ctx.updatedRegions[bank.region]?.bankingSector;
    if (agg) agg.businessLoanBookUSD += event.retire ? -event.principalUSD : event.principalUSD;
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

  ctx.lastSettlementReport = report;
  ctx.paymentInstructions = [];
  return report;
}

function creditBank(report: SettlementReport, bankTicker: string | undefined, deltaUSD: number): void {
  // A holder with no bank is a defect, not a rounding case: its money would leave the banking
  // system exactly the way corporate cash used to (§7.86). Counted, never dropped.
  if (!bankTicker) { report.unresolvedUSD += deltaUSD; return; }
  addTo(report.depositDeltaByBank, bankTicker, deltaUSD);
}

function addTo(map: Map<string, number>, key: string, deltaUSD: number): void {
  map.set(key, (map.get(key) ?? 0) + deltaUSD);
}

/**
 * The two things that must be true of any settlement run, asserted rather than assumed.
 *
 *  1. Money is conserved: every instruction moved a dollar from someone to someone.
 *  2. The central bank's liabilities only move between buckets — what leaves bank reserves
 *     arrives in the treasury's account and vice versa.
 *
 * Returns the residuals so a caller (the harness, or a probe) can assert them. Kept here rather
 * than in the harness so the layer carries its own proof.
 */
export function settlementResiduals(report: SettlementReport): {
  unresolvedUSD: number;
  centralBankResidualUSD: number;
} {
  let deposits = 0;
  report.depositDeltaByBank.forEach((v) => { deposits += v; });
  let tga = 0;
  report.tgaDeltaByRegion.forEach((v) => { tga += v; });
  let reserves = 0;
  report.reserveDeltaByBank.forEach((v) => { reserves += v; });
  return {
    // Every dollar found an account. Non-zero means money left the system.
    unresolvedUSD: report.unresolvedUSD,
    // The central bank's liabilities only moved between buckets: what the treasury took in came
    // out of bank reserves. Household flows are excluded because HH4d settles them next week.
    centralBankResidualUSD: reserves + tga - report.householdDeferredUSD,
  };
}
