/**
 * Cross-border invoices come due (XB3a-5).
 *
 * The goods were delivered weeks ago on the terms the two firms agreed, and this is where the
 * money moves — at what the invoice currency is worth NOW rather than what it was worth then.
 * The difference is transaction FX exposure, and it is real cash: a seller invoicing in someone
 * else's money collects less than it booked when that currency falls, and a buyer paying in a
 * currency that is not its own pays more when it rises. Neither side was re-denominated; only
 * the cash changed.
 *
 * It runs before the goods auction rather than after the FX market, for two reasons: the ledger
 * that turns these into real cash is stage 08's, which has not run yet at this point in the week;
 * and the rate it settles at is then the last one the FX market actually cleared, which is the
 * rate a payment made today would really use.
 */

import { GameState, RegionId } from '../../../types';
import { companyPartyOfTicker } from '../../../domain/party';
import { CURRENCY_BY_REGION, CurrencyCode } from '../../../domain/geography';
import { isActiveCompany } from '../../../domain/company';
import { TradeInvoice } from '../../../domain/trade-invoice';
import { WeeklyStepContext } from './context';
import { getFxToUsd } from './06-fx-and-trade';
import { pay } from './settlement';
import type { Ticker } from '../../../domain/ids';

export function runTradeSettlementStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.tradeInvoiceFxGainLocal = 0;
  ctx.tradeInvoiceWriteOffLocal = 0;
  const outstanding = state.tradeInvoices ?? [];
  if (outstanding.length === 0) return;

  const usdPerCurrency: Record<string, number> = {};
  (Object.keys(CURRENCY_BY_REGION) as RegionId[]).forEach(r => {
    usdPerCurrency[CURRENCY_BY_REGION[r]] = getFxToUsd(state.fxPairs, r);
  });
  const activeByTicker = new Map<Ticker, boolean>();
  state.companies.forEach(c => activeByTicker.set(c.ticker, isActiveCompany(c)));

  const stillOutstanding: TradeInvoice[] = [];
  const { companyUpdates } = ctx;

  outstanding.forEach((invoice) => {
    if (invoice.weekDue > state.currentWeek) { stillOutstanding.push(invoice); return; }

    const bookedLocal = invoice.amountCurrency * invoice.bookedUsdPerCurrency;

    // §7.286 — a dead BUYER kills the invoice (paying a seller out of a buyer that no longer
    // exists would mint the money; the unpaid receivable is the seller's real loss). A dead
    // SELLER's invoice is different: the buyer is alive and really owes it, and the money
    // belongs to the seller's ESTATE — it collects onto the dead firm's account, which is
    // where the workout now draws its distributions from. Killing it here wrote off a
    // receivable the estate was simultaneously "collecting" from the UNMODELED boundary —
    // the same claim represented twice, one copy funded by nobody.
    if (!activeByTicker.get(invoice.buyerTicker)) {
      ctx.tradeInvoiceWriteOffLocal += bookedLocal;
      return;
    }

    const rateNow = usdPerCurrency[invoice.currency];
    const settledLocal = rateNow > 0 && isFinite(rateNow) ? invoice.amountCurrency * rateNow : bookedLocal;

    const seller = companyUpdates[invoice.sellerTicker] ?? (companyUpdates[invoice.sellerTicker] = {});
    seller.tradeReceivableCollectedLocal = (seller.tradeReceivableCollectedLocal ?? 0) + settledLocal;
    const buyer = companyUpdates[invoice.buyerTicker] ?? (companyUpdates[invoice.buyerTicker] = {});
    buyer.tradePayableSettledLocal = (buyer.tradePayableSettledLocal ?? 0) + settledLocal;
    // CASH: the money goes from the buyer to the seller, because that is who owes whom. Stage
    // 08 used to post each side against the UNMODELED boundary and let the two halves find each
    // other in the aggregate — a payment whose counterparty is known has no business at a
    // boundary. It settles at TODAY's rate, which is where the transaction FX exposure lands.
    pay(ctx, {
      payer: companyPartyOfTicker(invoice.buyerTicker),
      payee: companyPartyOfTicker(invoice.sellerTicker),
      amount: settledLocal,
      currency: invoice.currency as CurrencyCode,
      reason: 'trade invoice settled',
    });

    // Both legs move by the same amount, so the pair nets to zero and no money is created. What
    // each side FEELS is the gap against what it booked, and that gap is only ever zero for a
    // party invoicing in its own currency.
    ctx.tradeInvoiceFxGainLocal += settledLocal - bookedLocal;
  });

  state.tradeInvoices = stillOutstanding;
}
