/**
 * A cross-border sale that has been delivered and not yet paid for (XB3a).
 *
 * The goods move in stage 05's world book; the money follows a week later, which is what makes
 * transaction FX exposure exist at all. The invoice is denominated in the market's own emergent
 * invoice currency (see invoice-currency.ts), so whoever is NOT invoicing in its own currency
 * carries a real gain or loss between delivery and payment: the seller collects, and the buyer
 * pays, whatever that currency is worth at settlement, not what it was worth at delivery.
 *
 * No re-denomination anywhere. Revenue and cost are recognised in USD at delivery exactly as
 * before; what changes is the size of the cash that eventually arrives.
 *
 * Both counterparties are named real companies. A cross-border fill whose buyer is a household
 * or government aggregate settles immediately instead, because those bids have no cash leg in
 * this stage to defer — deferring one side of a flow that only has one side would invent an
 * exposure rather than model one.
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
  /** Face amount, in the invoice currency. This is what is owed. */
  amountCurrency: number;
  /** USD per unit of `currency` when the invoice was struck: the rate the sale was booked at. */
  bookedUsdPerCurrency: number;
  /** The week the goods were delivered. Settles the following week. */
  weekBooked: number;
}
