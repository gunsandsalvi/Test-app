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
import { GameState } from '../../types';
import { BankingSector } from '../../domain/banking';
import { partyOf } from '../ledger/party';
import { reasonText } from './stages/settlement';

const TOLERANCE_USD = 5e6; // the harness's own threshold
const NOISE_FLOOR_USD = 1e5; // per-stage deltas below this are rounding, not a leg

export function bankIdentityTraceEnabled(): boolean {
  return process.env.BANK_IDENTITY_TRACE === '1';
}

/** Liability/equity fields carry +1 into the residual, asset fields −1. */
const FIELD_SIGNS: Record<string, 1 | -1> = {
  depositsUSD: 1, corporateDepositsUSD: 1, institutionalDepositsUSD: 1, clientMarginUSD: 1,
  smeDepositsUSD: 1, centralBankLoanUSD: 1, bankEquityUSD: 1, srfBorrowingUSD: 1, repoBorrowedUSD: 1,
  businessLoanBookUSD: -1, consumerLoanBookUSD: -1, sovHoldingsUSD: -1, cashReservesUSD: -1,
  repoLentUSD: -1, onRrpLendingUSD: -1, sovereignAccruedCouponUSD: -1, deskInventoryAbsUSD: -1,
  primeBrokerageLoansUSD: -1,
};

export function fieldsOf(bs: BankingSector): Record<string, number> {
  return {
    depositsUSD: bs.depositsUSD, corporateDepositsUSD: bs.corporateDepositsUSD ?? 0,
    institutionalDepositsUSD: bs.institutionalDepositsUSD ?? 0,
    clientMarginUSD: bs.clientMarginUSD ?? 0, smeDepositsUSD: bs.smeDepositsUSD ?? 0,
    centralBankLoanUSD: bs.centralBankLoanUSD ?? 0, bankEquityUSD: bs.bankEquityUSD,
    srfBorrowingUSD: bs.srfBorrowingUSD ?? 0, repoBorrowedUSD: bs.repoBorrowedUSD ?? 0,
    businessLoanBookUSD: bs.businessLoanBookUSD, consumerLoanBookUSD: bs.consumerLoanBookUSD,
    sovHoldingsUSD: Object.values(bs.sovereignBondHoldingsByTenor || {})
      .reduce((a: number, v) => a + (Number(v) || 0), 0),
    cashReservesUSD: bs.cashReservesUSD, repoLentUSD: bs.repoLentUSD ?? 0,
    onRrpLendingUSD: bs.onRrpLendingUSD ?? 0,
    sovereignAccruedCouponUSD: bs.sovereignAccruedCouponUSD ?? 0,
    deskInventoryAbsUSD: Object.values((bs.dealerDeskInventory || {}) as Record<string, { inventoryUSD: number }[]>)
      .reduce((a: number, rows) => a + rows.reduce((b, r) => b + Math.abs(r.inventoryUSD), 0), 0),
    primeBrokerageLoansUSD: bs.primeBrokerageLoansUSD ?? 0,
  };
}

export function residualOf(bs: BankingSector, signedDesk = false): number {
  const sovUSD = Object.values(bs.sovereignBondHoldingsByTenor || {})
    .reduce((a: number, v) => a + (Number(v) || 0), 0);
  return (
    bs.depositsUSD + (bs.corporateDepositsUSD ?? 0) + (bs.institutionalDepositsUSD ?? 0)
    + (bs.clientMarginUSD ?? 0) + (bs.smeDepositsUSD ?? 0) + (bs.centralBankLoanUSD ?? 0)
    + bs.bankEquityUSD + (bs.srfBorrowingUSD ?? 0) + (bs.repoBorrowedUSD ?? 0)
    - bs.businessLoanBookUSD - bs.consumerLoanBookUSD - sovUSD - bs.cashReservesUSD
    - (bs.repoLentUSD ?? 0) - (bs.onRrpLendingUSD ?? 0)
    - (bs.sovereignAccruedCouponUSD ?? 0)
    // The harness counts a desk row at Math.abs — a SHORT counted as an asset. trade.ts books
    // cash on the SIGNED delta, so if a desk sits net short the two conventions differ by twice
    // the short. `signedDesk` computes the signed variant so a run can print both and show
    // whether the episodic M-scale breaks are exactly that convention gap.
    - Object.values((bs.dealerDeskInventory || {}) as Record<string, { inventoryUSD: number }[]>)
        .reduce((a: number, rows) => a + rows.reduce(
          (b, r) => b + (signedDesk ? r.inventoryUSD : Math.abs(r.inventoryUSD)), 0), 0)
    - (bs.primeBrokerageLoansUSD ?? 0)
  );
}

export class BankIdentityTrace {
  private last = new Map<string, number>();
  private signedLast = new Map<string, number>();
  private open = new Map<string, number>();
  private contributions = new Map<string, Map<string, number>>();
  private focusTicker = process.env.BANK_IDENTITY_TRACE_BANK || undefined;
  private focusFields: Record<string, number> | undefined;
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
      out.set(c.ticker, residualOf(sheet));
      this.signedLast.set(c.ticker, residualOf(sheet, true));
    });
    return out;
  }

  /** Per-field deltas for the focus bank, printed per stage — the leg-level view. */
  private traceFocus(stage: string, ctx: WeeklyStepContext): void {
    if (!this.focusTicker) return;
    const c = ctx.updatedCompanies.find((x) => x.ticker === this.focusTicker);
    const sheet = (!ctx.bankSheetChannelClosed && ctx.companyUpdates[this.focusTicker]?.bankBalanceSheet)
      || c?.bankBalanceSheet;
    if (!sheet) return;
    const now = fieldsOf(sheet);
    if (this.focusFields) {
      const parts: string[] = [];
      let residualDelta = 0;
      Object.keys(now).forEach((k) => {
        const d = now[k] - (this.focusFields as Record<string, number>)[k];
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
    const j = ctx.paymentJournal;
    const byKey = new Map<string, number>();
    for (let i = 0; i < j.amountUSD.length; i++) {
      const payer = partyOf(j.payerId[i]);
      const payee = partyOf(j.payeeId[i]);
      const touch = (ref: typeof payer, sign: 1 | -1) => {
        if ((ref.kind === 'BANK' || ref.kind === 'BANK_SECURITIES' || ref.kind === 'BANK_CREDIT')
          && ref.ticker === this.focusTicker) {
          const key = `${ref.kind} :: ${reasonText(j.reasonId[i])}`;
          byKey.set(key, (byKey.get(key) ?? 0) + sign * j.amountUSD[i]);
        }
      };
      touch(payer, -1);
      touch(payee, 1);
    }
    const rows = Array.from(byKey.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([k, usd]) => `${k} ${(usd / 1e6).toFixed(3)}M`);
    console.log(`  [id-journal] w${ctx.nextWeek} ${this.focusTicker} before-${stage}`
      + ` (journal ${j.amountUSD.length} rows, ${byKey.size} netted for focus):`
      + (rows.length ? `\n    ${rows.join('\n    ')}` : ' <none>'));
  }

  /** The focus institution's cash after each stage, and — before each settlement pass — the
   *  journal's net for it by reason, so an overdraft names the leg that dug it. */
  private traceInstitution(stage: string, ctx: WeeklyStepContext): void {
    if (!this.focusInstitutionId) return;
    const e = ctx.updatedInstitutionalEntities.find(
      (x) => x.id === this.focusInstitutionId || (x as { ticker?: string }).ticker === this.focusInstitutionId);
    if (!e) return;
    const cash = e.cashUSD ?? 0;
    if (this.focusInstitutionCash !== undefined && Math.abs(cash - this.focusInstitutionCash) > 1e4) {
      console.log(`  [inst] w${ctx.nextWeek} ${this.focusInstitutionId} ${stage} cash `
        + `${(this.focusInstitutionCash / 1e6).toFixed(2)}M -> ${(cash / 1e6).toFixed(2)}M`);
    }
    this.focusInstitutionCash = cash;
    if (stage !== '08-company-fundamentals' && stage !== 'labor-reconciliation') return;
    const j = ctx.paymentJournal;
    const byReason = new Map<string, number>();
    for (let i = 0; i < j.amountUSD.length; i++) {
      const payer = partyOf(j.payerId[i]);
      const payee = partyOf(j.payeeId[i]);
      const touch = (ref: typeof payer, sign: 1 | -1) => {
        if (ref.kind === 'INSTITUTION' && ref.id === e.id) {
          const key = reasonText(j.reasonId[i]);
          byReason.set(key, (byReason.get(key) ?? 0) + sign * j.amountUSD[i]);
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
      if (Math.abs(delta) < NOISE_FLOOR_USD) return;
      const byStage = this.contributions.get(ticker) ?? new Map<string, number>();
      byStage.set(stage, (byStage.get(stage) ?? 0) + delta);
      this.contributions.set(ticker, byStage);
    });
    this.last = now;
  }

  report(week: number): void {
    this.last.forEach((finalResidual, ticker) => {
      if (Math.abs(finalResidual) <= TOLERANCE_USD) return;
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
