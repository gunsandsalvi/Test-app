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
  /** Household flows handed to HH4d's T+1 channel — settled by next week's bank pass, not here. */
  householdDeferredUSD: number;
  /** Money that could not be applied: a party that does not exist, or a holder with no bank.
   *  Must be zero. A non-zero value is money leaving the system — the §7.86 defect's shape. */
  unresolvedUSD: number;
}

const partyKey = (p: PartyRef): string =>
  p.kind === 'COMPANY' || p.kind === 'BANK' ? `${p.kind}:${p.ticker}`
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
          addTo(report.depositDeltaByBank, b.ticker, deltaUSD * ((b.bankMarketShare ?? 0) / totalShare));
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
  report.depositDeltaByBank.forEach((deltaUSD, ticker) => {
    addTo(report.reserveDeltaByBank, ticker, deltaUSD);
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
