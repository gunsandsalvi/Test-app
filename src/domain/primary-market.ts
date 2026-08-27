/**
 * WS8 — the primary market: new paper reaches the world through a real offering that a real
 * bank places into the same auction that prices the outstanding stock.
 *
 * Before this existed, `decideCorporateFinancing`'s issuance settled instantly at the current
 * statistic and stage 08's maintenance/refi rolls priced at formula terms — supply arrived
 * with no concession, no underwriter, and no way to fail. Now an offering is a real object
 * with a real lifecycle: ENQUEUED by the issuer's own decision in one week, PRICED the next
 * week as extra float in the relevant clearing book (07b/07d/07e), and either SETTLED — the
 * issuer receives size minus the underwriting fee, the participants take what their schedules
 * wanted, and the LEAD BANK pays real cash for the unsold residual onto the dealer book (firm
 * commitment: underwriting risk is inventory risk) — or WITHDRAWN at the issuer's own
 * walk-away, in which case the market clears on the stock that actually exists and, for a
 * refinancing, the revolver catches the issuer at its penalty rate (the same real mechanism
 * WS5 built for a failed CP roll).
 */

import { RegionId } from './geography';

export type PrimaryOfferingInstrumentType = 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY';

export type PrimaryOfferingPurpose =
  /** CFO issuing into cheap spreads (the RV supply lever, now with a real market step). */
  | 'OPPORTUNISTIC'
  /** Rolling a maturing tranche — need-driven; the walk-away is the revolver's all-in cost. */
  | 'REFINANCE'
  /** Terming out accumulated revolver-style maintenance bridges into real term debt. */
  | 'MAINTENANCE_TERM_OUT'
  /** HC7: a private firm listing — primary shares into the 07e book. */
  | 'IPO';

export interface PrimaryOffering {
  id: string;
  issuerId: string;
  issuerTicker: string;
  region: RegionId;
  instrumentType: PrimaryOfferingInstrumentType;
  purpose: PrimaryOfferingPurpose;
  /** Face value offered (for EQUITY: the number of new SHARES — the equity book clears in shares). */
  sizeUSD: number;
  /**
   * The issuer's walk-away, in the book's own statistic (bps for credit, price for equity).
   * From the issuer's own economics: an opportunistic issuer walks where the after-tax cost
   * stops beating its use of proceeds; a refinancer walks where the market is worse than its
   * revolver. Never a bound on the outstanding stock's price.
   */
  walkAwayStat: number;
  /** For credit: the rate type the new tranche carries if placed. */
  rateType?: 'FIXED' | 'FLOATING';
  /** MAINTENANCE_TERM_OUT: the bridge tranche ids this offering retires at settlement. */
  refinancesTrancheIds?: string[];
  leadBankTicker: string;
  announcedWeek: number;
}

/**
 * Underwriting fees by instrument, in bps of size — structural primitives like the deposit
 * beta (BP2's industry profiles and G3's competing desks are where they become outcomes).
 * Ordered the way real placement difficulty orders them: loans need syndication, equity needs
 * a book of new owners.
 */
export const UNDERWRITING_FEE_BPS: Record<PrimaryOfferingInstrumentType, number> = {
  CORP_BOND: 50,
  LEVERAGED_LOAN: 150,
  EQUITY: 300,
};

/**
 * The issuer's house bank: deterministic, market-share-weighted by a stable hash of the issuer
 * id — relationship banking rather than an RNG draw, so the same issuer always mandates the
 * same lead and the fee flow is attributable across weeks.
 */
export function chooseLeadBank(
  issuerId: string,
  banks: { ticker: string; bankMarketShare?: number }[]
): string {
  if (banks.length === 0) return '';
  let hash = 0;
  for (let i = 0; i < issuerId.length; i++) hash = ((hash << 5) - hash + issuerId.charCodeAt(i)) | 0;
  const u = ((hash >>> 0) % 10000) / 10000;
  const totalShare = banks.reduce((a, b) => a + (b.bankMarketShare ?? 1 / banks.length), 0) || 1;
  let acc = 0;
  for (const b of banks) {
    acc += (b.bankMarketShare ?? 1 / banks.length) / totalShare;
    if (u <= acc) return b.ticker;
  }
  return banks[banks.length - 1].ticker;
}
