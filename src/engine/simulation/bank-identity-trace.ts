/**
 * BANK_IDENTITY_TRACE=1 — per-stage attribution for the M-scale identity drip (§6.1 USA-bank
 * row; §7.251 measured ~86 breaks across 13 banks from w14, pre-dating the channel revival).
 *
 * The harness proves the identity broke by week end; it cannot say WHICH stage moved one leg
 * without the other, because the sheet evolves through the week (the pre-08 channel, then the
 * live objects). This trace evaluates the harness's exact residual on the EVOLVING view after
 * every stage and accumulates the per-stage deltas; at week end it prints, for each bank whose
 * final residual exceeds the harness tolerance, the stages that moved it, largest first.
 *
 * Reading the output: a stage that records a payment instruction moves the residual now and
 * settlement moves it back — those legs appear as a matched ± pair across two stages and are
 * NOT the defect. The defect is the contribution with no partner: the stage whose delta
 * survives into the final residual.
 *
 * Instrument only: reads, no writes, off unless the env flag is set (the StageDependencyTrace
 * pattern). It duplicates the harness residual FORMULA by design — the two must agree for the
 * attribution to explain the harness's own violation.
 */

import { WeeklyStepContext } from './stages/context';
import { bankSovereignBookLocal } from '../sovereign-register';
import { deskGrossLocal, deskSignedLocal } from '../desk-register';
import { businessLoanBookOf, consumerLoanBookOf } from '../../domain/banking';
import { GameState } from '../../types';
import { BankingSector } from '../../domain/banking';
import { partyOf } from '../ledger/party';
import { reasonText } from './stages/settlement';
import { entityCashOf, bankReservesOf, bankDepositLines } from '../ledger/accounts';
import { DepositLines } from '../../domain/banking';
import { facilityBookOf } from '../../engine2/tranches';
import { asTicker } from '../../domain/ids';

const TOLERANCE_LOCAL = 5e6; // the harness's own threshold
const NOISE_FLOOR_LOCAL = 1e5; // per-stage deltas below this are rounding, not a leg

export function bankIdentityTraceEnabled(): boolean {
  return process.env.BANK_IDENTITY_TRACE === '1';
}

/**
 * Liability/equity fields carry +1 into the residual, asset fields −1.
 *
 * §3.13c — KEYED BY `fieldsOf`'S OWN KEYS, so the compiler holds the two in step. It was
 * `Record<string, …>`, and the correspondence lived in the fact that somebody typed the same
 * names twice: a field renamed on one side and not the other made `FIELD_SIGNS[k]` `undefined`,
 * `residualDelta` NaN, and this instrument silently stop attributing anything. That is the shape
 * that blocks the `…USD` rename — a field name in an UNCHECKED string is a rename this compiler
 * cannot verify — and it is why this is typed before the rename runs.
 */
const FIELD_SIGNS: Record<keyof ReturnType<typeof fieldsOf>, 1 | -1> = {
  depositsLocal: 1, corporateDepositsLocal: 1, institutionalDepositsLocal: 1, clientMarginLocal: 1,
  smeDepositsLocal: 1, centralBankLoanLocal: 1, bankEquityLocal: 1, srfBorrowingLocal: 1, repoBorrowedLocal: 1,
  businessLoanBookLocal: -1, consumerLoanBookLocal: -1, sovHoldingsLocal: -1, cashReservesLocal: -1,
  repoLentLocal: -1, onRrpLendingLocal: -1, sovereignAccruedCouponLocal: -1, deskInventoryAbsLocal: -1,
  primeBrokerageLoansLocal: -1,
};

/** §3.13c: the return type is INFERRED, so its keys are a literal union and `FIELD_SIGNS` below
 *  is checked against them. Annotated `Record<string, number>` it was not: `keyof string-record`
 *  is `string`, so every key matched and nothing was verified. */
export function fieldsOf(bs: BankingSector, cashLocal: number, lines: DepositLines, facilityBookLocal: number, sovLocal: number, deskGrossLocal: number) {
  return {
    depositsLocal: lines.householdLocal, corporateDepositsLocal: lines.corporateLocal,
    institutionalDepositsLocal: lines.institutionalLocal,
    clientMarginLocal: bs.clientMarginLocal ?? 0, smeDepositsLocal: lines.smeLocal,
    centralBankLoanLocal: bs.centralBankLoanLocal ?? 0, bankEquityLocal: bs.bankEquityLocal,
    srfBorrowingLocal: bs.srfBorrowingLocal ?? 0, repoBorrowedLocal: bs.repoBorrowedLocal ?? 0,
    businessLoanBookLocal: businessLoanBookOf(bs, facilityBookLocal), consumerLoanBookLocal: consumerLoanBookOf(bs),
    sovHoldingsLocal: sovLocal,
    cashReservesLocal: cashLocal, repoLentLocal: bs.repoLentLocal ?? 0,
    onRrpLendingLocal: bs.onRrpLendingLocal ?? 0,
    sovereignAccruedCouponLocal: bs.sovereignAccruedCouponLocal ?? 0,
    // §3.13-BOOK d3d: the desks' rows, off the register (`deskGrossLocal`), handed in like the book.
    deskInventoryAbsLocal: deskGrossLocal,
    primeBrokerageLoansLocal: bs.primeBrokerageLoansLocal ?? 0,
  };
}

export function residualOf(bs: BankingSector, cashLocal: number, lines: DepositLines, facilityBookLocal: number, sovLocal: number, deskLocal: number): number {
  return (
    lines.householdLocal + lines.corporateLocal + lines.institutionalLocal
    + (bs.clientMarginLocal ?? 0) + lines.smeLocal + (bs.centralBankLoanLocal ?? 0)
    + bs.bankEquityLocal + (bs.srfBorrowingLocal ?? 0) + (bs.repoBorrowedLocal ?? 0)
    - businessLoanBookOf(bs, facilityBookLocal) - consumerLoanBookOf(bs) - sovLocal - cashLocal
    - (bs.repoLentLocal ?? 0) - (bs.onRrpLendingLocal ?? 0)
    - (bs.sovereignAccruedCouponLocal ?? 0)
    // The harness counts a desk row at Math.abs — a SHORT counted as an asset. trade.ts books
    // cash on the SIGNED delta, so if a desk sits net short the two conventions differ by twice
    // the short. The caller hands in whichever it wants (`deskGrossLocal` / `deskSignedLocal`,
    // §3.13-BOOK d3d) so a run can print both and show whether the episodic M-scale breaks are
    // exactly that convention gap.
    - deskLocal
    - (bs.primeBrokerageLoansLocal ?? 0)
  );
}

export class BankIdentityTrace {
  private last = new Map<string, number>();
  private signedLast = new Map<string, number>();
  private open = new Map<string, number>();
  private contributions = new Map<string, Map<string, number>>();
  private focusTicker = process.env.BANK_IDENTITY_TRACE_BANK
    ? asTicker(process.env.BANK_IDENTITY_TRACE_BANK) : undefined;
  private focusFields: ReturnType<typeof fieldsOf> | undefined;
  /** INSTITUTION focus: journal net by reason plus the cash stock, per stage — for the
   *  overdraft family (a fund spending money it does not have). */
  private focusInstitutionId = process.env.BANK_IDENTITY_TRACE_INSTITUTION || undefined;
  private focusInstitutionCash: number | undefined;

  /** Seed the opening residuals so stage 01 is not charged with what last week left behind. */
  begin(state: GameState, ctx: WeeklyStepContext): void {
    this.last = this.residuals(state, ctx);
    this.open = new Map(this.last);
    this.focusFields = undefined;
    this.traceFocus('OPEN', ctx);
  }

  /** The evolving view: the channel's pending sheet before 08 consumes it, the live object after. */
  private residuals(state: GameState, ctx: WeeklyStepContext): Map<string, number> {
    const out = new Map<string, number>();
    ctx.updatedCompanies.forEach((c) => {
      if (!c.isBankEntity || c.isDefaulted || c.mergerAcquired) return;
      // Before stage 08 the channel carries the pending sheet; once 08 consumes it the channel
      // copy is STALE and the live object is the truth — preferring the channel there charged
      // every post-08 flow to the wrong basis (measured: B-scale phantom residuals).
      const sheet = (!ctx.bankSheetChannelClosed && ctx.companyUpdates[c.ticker]?.bankBalanceSheet)
        || c.bankBalanceSheet;
      if (!sheet) return;
      const lines = bankDepositLines(ctx, c);
      const facilityBookLocal = facilityBookOf(ctx.v2, c.id);
      out.set(c.ticker, residualOf(sheet, bankReservesOf(ctx.v2, c.id), lines, facilityBookLocal, bankSovereignBookLocal(ctx.v2, c.id), deskGrossLocal(ctx.v2, c.id)));
      this.signedLast.set(c.ticker, residualOf(sheet, bankReservesOf(ctx.v2, c.id), lines, facilityBookLocal, bankSovereignBookLocal(ctx.v2, c.id), deskSignedLocal(ctx.v2, c.id)));
    });
    return out;
  }

  /** Per-field deltas for the focus bank, printed per stage — the leg-level view. */
  private traceFocus(stage: string, ctx: WeeklyStepContext): void {
    if (!this.focusTicker) return;
    const c = ctx.updatedCompanies.find((x) => x.ticker === this.focusTicker);
    const sheet = (!ctx.bankSheetChannelClosed && ctx.companyUpdates[this.focusTicker]?.bankBalanceSheet)
      || c?.bankBalanceSheet;
    if (!sheet || !c) return;
    const now = fieldsOf(sheet, bankReservesOf(ctx.v2, c.id), bankDepositLines(ctx, c), facilityBookOf(ctx.v2, c.id), bankSovereignBookLocal(ctx.v2, c.id), deskGrossLocal(ctx.v2, c.id));
    if (this.focusFields) {
      const parts: string[] = [];
      let residualDelta = 0;
      const was = this.focusFields;
      (Object.keys(now) as (keyof typeof now)[]).forEach((k) => {
        const d = now[k] - was[k];
        if (Math.abs(d) < 1e4) return;
        residualDelta += d * FIELD_SIGNS[k];
        parts.push(`${k} ${d >= 0 ? '+' : ''}${(d / 1e6).toFixed(3)}M`);
      });
      // Print on ANY material field change, not only when the residual moved: a balanced
      // write (equity and an asset marked down together — an MTM loss, a write-off with its
      // book) leaves dR at zero and was exactly the shape this gate hid (a bank lost 2.67B of
      // equity in one week and no stage printed). The residual stays in the line as the
      // balance check; the FIELDS are what a focus trace is for.
      if (parts.length > 0) {
        console.log(`  [id-field] w${ctx.nextWeek} ${this.focusTicker} ${stage} dR ${(residualDelta / 1e6).toFixed(3)}M :: ${parts.join(' | ')}`);
      }
    }
    this.focusFields = now;
  }

  /** The journal the imminent settlement pass will apply, netted for the focus bank by
   *  (account-kind, reason) — the instruction-level view the field deltas must reconcile to. */
  private dumpJournal(stage: string, ctx: WeeklyStepContext): void {
    if (!this.focusTicker) return;
    // §3.13-BOOK (c-then-3b): the trace is configured by TICKER (an env var), the journal's
    // parties are entity ids — resolve once per dump.
    const focusBankId = ctx.updatedCompanies.find((x) => x.ticker === this.focusTicker)?.id;
    if (focusBankId === undefined) return;
    const j = ctx.paymentJournal;
    const byKey = new Map<string, number>();
    for (let i = 0; i < j.amount.length; i++) {
      const payer = partyOf(j.payerId[i]);
      const payee = partyOf(j.payeeId[i]);
      const touch = (ref: typeof payer, sign: 1 | -1) => {
        if ((ref.kind === 'BANK' || ref.kind === 'BANK_SECURITIES' || ref.kind === 'BANK_CREDIT')
          && ref.id === focusBankId) {
          const key = `${ref.kind} :: ${reasonText(j.reasonId[i])}`;
          byKey.set(key, (byKey.get(key) ?? 0) + sign * j.amount[i]);
        }
      };
      touch(payer, -1);
      touch(payee, 1);
    }
    const rows = Array.from(byKey.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([k, usd]) => `${k} ${(usd / 1e6).toFixed(3)}M`);
    console.log(`  [id-journal] w${ctx.nextWeek} ${this.focusTicker} before-${stage}`
      + ` (journal ${j.amount.length} rows, ${byKey.size} netted for focus):`
      + (rows.length ? `\n    ${rows.join('\n    ')}` : ' <none>'));
  }

  /** The focus institution's cash after each stage, and — before each settlement pass — the
   *  journal's net for it by reason, so an overdraft names the leg that dug it. */
  private traceInstitution(stage: string, ctx: WeeklyStepContext): void {
    if (!this.focusInstitutionId) return;
    const e = ctx.updatedInstitutionalEntities.find(
      (x) => x.id === this.focusInstitutionId || (x as { ticker?: string }).ticker === this.focusInstitutionId);
    if (!e) return;
    const cash = entityCashOf(ctx.v2, e);
    if (this.focusInstitutionCash !== undefined && Math.abs(cash - this.focusInstitutionCash) > 1e4) {
      console.log(`  [inst] w${ctx.nextWeek} ${this.focusInstitutionId} ${stage} cash `
        + `${(this.focusInstitutionCash / 1e6).toFixed(2)}M -> ${(cash / 1e6).toFixed(2)}M`);
    }
    this.focusInstitutionCash = cash;
    if (stage !== '08-company-fundamentals' && stage !== 'labor-reconciliation') return;
    const j = ctx.paymentJournal;
    const byReason = new Map<string, number>();
    for (let i = 0; i < j.amount.length; i++) {
      const payer = partyOf(j.payerId[i]);
      const payee = partyOf(j.payeeId[i]);
      const touch = (ref: typeof payer, sign: 1 | -1) => {
        if (ref.kind === 'INSTITUTION' && ref.id === e.id) {
          const key = reasonText(j.reasonId[i]);
          byReason.set(key, (byReason.get(key) ?? 0) + sign * j.amount[i]);
        }
      };
      touch(payer, -1);
      touch(payee, 1);
    }
    const rows = Array.from(byReason.entries())
      .filter(([, usd]) => Math.abs(usd) > 1e4)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([k, usd]) => `${k} ${(usd / 1e6).toFixed(2)}M`);
    if (rows.length > 0) {
      console.log(`  [inst-journal] w${ctx.nextWeek} ${this.focusInstitutionId} before-${stage}: ${rows.join(' | ')}`);
    }
  }

  afterStage(stage: string, state: GameState, ctx: WeeklyStepContext): void {
    if (stage === '08-company-fundamentals' || stage === 'labor-reconciliation') {
      this.dumpJournal(stage, ctx);
    }
    this.traceFocus(stage, ctx);
    this.traceInstitution(stage, ctx);
    const now = this.residuals(state, ctx);
    now.forEach((r, ticker) => {
      const delta = r - (this.last.get(ticker) ?? 0);
      if (Math.abs(delta) < NOISE_FLOOR_LOCAL) return;
      const byStage = this.contributions.get(ticker) ?? new Map<string, number>();
      byStage.set(stage, (byStage.get(stage) ?? 0) + delta);
      this.contributions.set(ticker, byStage);
    });
    this.last = now;
  }

  report(week: number): void {
    this.last.forEach((finalResidual, ticker) => {
      if (Math.abs(finalResidual) <= TOLERANCE_LOCAL) return;
      const openResidual = this.open.get(ticker) ?? 0;
      const byStage = Array.from((this.contributions.get(ticker) ?? new Map()).entries())
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .map(([stage, usd]) => `${stage} ${(usd / 1e6).toFixed(2)}M`)
        .join(' | ');
      console.log(
        `[id-trace] w${week} ${ticker} residual ${(finalResidual / 1e6).toFixed(2)}M`
        + ` (signed-desk ${((this.signedLast.get(ticker) ?? 0) / 1e6).toFixed(2)}M,`
        + ` opened ${(openResidual / 1e6).toFixed(2)}M) :: ${byStage}`
      );
    });
  }
}
