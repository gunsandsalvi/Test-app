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
import { CURRENCY_BY_REGION } from '../../../domain/geography';
import { isActiveCompany } from '../../../domain/company';
import { TradeInvoice } from '../../../domain/trade-invoice';
import { WeeklyStepContext } from './context';
import { getFxToUsd } from './06-fx-and-trade';

export function runTradeSettlementStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.tradeInvoiceFxGainUSD = 0;
  ctx.tradeInvoiceWriteOffUSD = 0;
  const outstanding = state.tradeInvoices ?? [];
  if (outstanding.length === 0) return;

  const usdPerCurrency: Record<string, number> = {};
  (Object.keys(CURRENCY_BY_REGION) as RegionId[]).forEach(r => {
    usdPerCurrency[CURRENCY_BY_REGION[r]] = getFxToUsd(state.fxPairs, r);
  });
  const activeByTicker = new Map<string, boolean>();
  state.companies.forEach(c => activeByTicker.set(c.ticker, isActiveCompany(c)));

  const stillOutstanding: TradeInvoice[] = [];
  const { companyUpdates } = ctx;

  outstanding.forEach((invoice) => {
    if (invoice.weekDue > state.currentWeek) { stillOutstanding.push(invoice); return; }

    const bookedUSD = invoice.amountCurrency * invoice.bookedUsdPerCurrency;

    // A defaulted counterparty on EITHER side kills the invoice rather than settling half of it.
    // Paying a seller out of a buyer that no longer exists would mint the money; an unpaid trade
    // receivable is a real loss, and whose loss it is belongs to G5's estates.
    if (!activeByTicker.get(invoice.sellerTicker) || !activeByTicker.get(invoice.buyerTicker)) {
      ctx.tradeInvoiceWriteOffUSD += bookedUSD;
      return;
    }

    const rateNow = usdPerCurrency[invoice.currency];
    const settledUSD = rateNow > 0 && isFinite(rateNow) ? invoice.amountCurrency * rateNow : bookedUSD;

    const seller = companyUpdates[invoice.sellerTicker] ?? (companyUpdates[invoice.sellerTicker] = {});
    seller.tradeReceivableCollectedUSD = (seller.tradeReceivableCollectedUSD ?? 0) + settledUSD;
    const buyer = companyUpdates[invoice.buyerTicker] ?? (companyUpdates[invoice.buyerTicker] = {});
    buyer.tradePayableSettledUSD = (buyer.tradePayableSettledUSD ?? 0) + settledUSD;

    // Both legs move by the same amount, so the pair nets to zero and no money is created. What
    // each side FEELS is the gap against what it booked, and that gap is only ever zero for a
    // party invoicing in its own currency.
    ctx.tradeInvoiceFxGainUSD += settledUSD - bookedUSD;
  });

  state.tradeInvoices = stillOutstanding;
}
