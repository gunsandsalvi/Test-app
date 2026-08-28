/**
 * XB3a — cross-border invoices come due.
 *
 * Stage 05 delivered the goods a week ago and struck an invoice in the market's own emergent
 * currency. This is where it is paid, at what that currency is worth NOW rather than what it was
 * worth then. The difference is transaction FX exposure, and it is real money: a seller invoicing
 * in someone else's currency collects less than it booked when that currency falls, and the buyer
 * paying in a currency that is not its own pays more when it rises. Neither side was
 * re-denominated — revenue and cost were recognised in USD at delivery — only the cash moved.
 *
 * It runs BEFORE stage 05 rather than after fx-clearing, for two reasons: the ledger that turns
 * these into real cash is stage 08's, which has not run yet at this point in the week; and the
 * rate it settles at is then the last one the FX market actually cleared, which is the rate a
 * payment made today would really use.
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
    // Anything struck this week is not yet due: stage 05 has not run in this pass, so everything
    // that settles here was booked in an earlier one and carries exactly one week of exposure.
    if (invoice.weekBooked > state.currentWeek) { stillOutstanding.push(invoice); return; }

    const bookedUSD = invoice.amountCurrency * invoice.bookedUsdPerCurrency;

    // A defaulted counterparty on EITHER side kills the invoice rather than settling half of it.
    // Paying the seller out of a buyer that no longer exists would mint the money; a real
    // unpaid trade receivable is a loss to the seller, and whose loss it is belongs to G5's
    // estate rather than to a fiscal-week shortcut here.
    if (!activeByTicker.get(invoice.sellerTicker) || !activeByTicker.get(invoice.buyerTicker)) {
      ctx.tradeInvoiceWriteOffUSD += bookedUSD;
      return;
    }

    const rateNow = usdPerCurrency[invoice.currency];
    const settledUSD = rateNow > 0 && isFinite(rateNow)
      ? invoice.amountCurrency * rateNow
      : bookedUSD;

    const seller = companyUpdates[invoice.sellerTicker] ?? (companyUpdates[invoice.sellerTicker] = {});
    seller.tradeReceivableCollectedUSD = (seller.tradeReceivableCollectedUSD ?? 0) + settledUSD;

    const buyer = companyUpdates[invoice.buyerTicker] ?? (companyUpdates[invoice.buyerTicker] = {});
    buyer.tradePayableSettledUSD = (buyer.tradePayableSettledUSD ?? 0) + settledUSD;

    // Both legs move by the same USD amount, so the pair nets to zero and no money is created.
    // What each side FEELS is the gap against what it booked a week ago — the seller's collection
    // versus its recognised revenue, the buyer's payment versus its recognised cost. That gap is
    // the exposure, and it is only ever zero for a party invoicing in its own currency.
    ctx.tradeInvoiceFxGainUSD += settledUSD - bookedUSD;
  });

  state.tradeInvoices = stillOutstanding;
}
