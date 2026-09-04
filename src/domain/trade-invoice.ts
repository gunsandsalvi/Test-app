/**
 * A cross-border sale delivered and not yet paid for (XB3a-5).
 *
 * The goods move when the auction clears; the money follows on the terms the two firms agreed,
 * which is what makes transaction FX exposure exist at all. The invoice is denominated in the
 * market's own emergent invoice currency (see invoice-currency.ts), so whichever party is not
 * invoicing in its own money carries a real gain or loss between delivery and payment: it
 * collects, or pays, whatever that currency is worth at settlement rather than what it was worth
 * at delivery.
 *
 * No re-denomination anywhere. Revenue and cost are recognised at delivery exactly as before, in
 * each firm's own money; what changes is the size of the cash that eventually moves.
 */

import { RegionId } from './geography';

export interface TradeInvoice {
  sellerTicker: string;
  sellerRegion: RegionId;
  buyerTicker: string;
  buyerRegion: RegionId;
  subUnitId: string;
  /** The market's emergent invoice currency — nobody's default, an outcome. */
  currency: string;
  /** Face amount owed, in the invoice currency. */
  amountCurrency: number;
  /** USD per unit of `currency` when the invoice was struck: the rate the sale was booked at. */
  bookedUsdPerCurrency: number;
  weekBooked: number;
  /** When payment falls due. Derived from the buyer's own credit, not from a table. */
  weekDue: number;
}

/**
 * How long a seller will wait to be paid.
 *
 * Trade credit is credit: the seller is lending the buyer the price of the goods, unsecured, and
 * it bears the buyer's default risk for the whole term. So it extends terms exactly as far as the
 * margin on the sale covers the expected loss over them — beyond that point it is selling at a
 * loss in expectation, which no seller does knowingly.
 *
 * Every input is real and already in the model: the buyer's own structural default probability
 * (§7.20), the recovery this model prices credit at, and the seller's own margin. There is no
 * table of "net 30 / net 60 / net 90" here, and there does not need to be — a strong buyer gets
 * long terms because it is cheap to lend to, and a weak one gets short terms or none, which is
 * what the terms in a real trade contract are FOR.
 */
export function paymentTermWeeks(args: {
  buyerAnnualDefaultProbability: number;
  recoveryRate: number;
  sellerMarginShare: number;
  /** The seller's own cash, and what a week of its sales costs it to carry. */
  sellerCashLocal: number;
  sellerWeeklySalesLocal: number;
}): number {
  const { buyerAnnualDefaultProbability, recoveryRate, sellerMarginShare,
    sellerCashLocal, sellerWeeklySalesLocal } = args;

  // What the seller can afford to LOSE: terms stop where the margin stops covering the expected
  // credit loss over them.
  const lossGivenDefault = Math.max(0, 1 - Math.max(0, Math.min(1, recoveryRate)));
  const expectedLossPerWeek = (Math.max(0, buyerAnnualDefaultProbability) / 52) * lossGivenDefault;
  const creditAffordableWeeks = expectedLossPerWeek > 0
    ? Math.max(0, sellerMarginShare) / expectedLossPerWeek
    : Infinity;

  // What the seller can afford to FUND, which is the constraint that actually binds on a strong
  // buyer. A receivable is the seller lending its own working capital, so it can carry only as
  // many weeks of its own sales as its cash covers. Without this the arithmetic above hands a
  // near-riskless buyer terms of 4.4e17 weeks — which is not generous credit, it is a missing
  // mechanism (rule 6: find what should compensate, do not clamp the symptom).
  const fundingAffordableWeeks = sellerWeeklySalesLocal > 0
    ? Math.max(0, sellerCashLocal) / sellerWeeklySalesLocal
    : 0;

  const weeks = Math.min(creditAffordableWeeks, fundingAffordableWeeks);
  return Number.isFinite(weeks) ? Math.max(1, Math.floor(weeks)) : 1;
}
