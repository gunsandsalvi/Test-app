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
import { PrimaryOfferingType } from './assets';

export type PrimaryOfferingInstrumentType = PrimaryOfferingType;

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
   * The issuer's own price talk, in the book's statistic — used only by a DEBUT, which has no
   * prior print for the book to reference. A listed name's last cleared price and an existing
   * borrower's standing quote already serve this purpose, so they leave it unset.
   */
  indicativeStat?: number;
  /**
   * EQUITY only: the issuer's full share registry once the deal prices. The allocators size to
   * the company that will exist, and per-share fundamentals divide by this count — a debut's
   * `sharesOutstanding` is still zero until settlement, so the book cannot read it from there.
   */
  postIssueSharesOutstanding?: number;
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
  /**
   * HC Wave 2 — the DEAL this financing is for, carried on the offering itself. An earlier
   * version marked the intent with `pending*` fields on the Company and lost it every week:
   * stage 08 rebuilds each company from an explicit field list, so anything not named there is
   * dropped (measured: 767 offering-weeks of LBO financings that could never settle). The
   * offering persists in GameState, so the deal rides with its own financing.
   */
  peDeal?: {
    kind: 'LBO' | 'TAKE_PRIVATE' | 'RECAP' | 'IPO';
    sponsorId: string;
    /** LBO and TAKE_PRIVATE: the sponsor's equity cheque, paid from dry powder at settlement. */
    equityUSD?: number;
    /** TAKE_PRIVATE: what the sponsor pays each public shareholder to tender. */
    takeoutPricePerShare?: number;
  };
}

/**
 * Underwriting fees by instrument, in bps of size. Ordered the way real placement difficulty
 * orders them: loans need syndication, equity needs a book of new owners.
 *
 * G3c closed the rule-1 defect: the fee is now QUOTED per deal by `underwritingFeeBps` below,
 * out of the book's own spread and what the underwriter can lose on the residual it expects to
 * hold. This table survives as the fallback for a quote made before the deal's own numbers are
 * known — and as the check on the derivation, which reproduces all three of its levels.
 */
export const UNDERWRITING_FEE_BPS: Record<PrimaryOfferingInstrumentType, number> = {
  CORP_BOND: 50,
  LEVERAGED_LOAN: 150,
  EQUITY: 300,
};

/**
 * G3c — what an underwriting mandate is actually worth, quoted rather than read off a table.
 *
 * A firm-commitment underwriter sells two things and the fee is the price of both. It makes a
 * market in the paper, so it earns the same bid/ask its desk earns in the secondary. And it
 * GUARANTEES the price: whatever the book does not take, the lead owns at the agreed level, and
 * carries it into a market that can move against it before it distributes. So:
 *
 *     fee = the desks' own spread  +  what it can lose on the residual it expects to hold
 *
 * Every term is something the model already prints. The spread is the book's own. The move is
 * the book's own one-week move — for a credit book, that spread move through the deal's
 * duration, which is what turns a widening into a price. The residual share is what the desks
 * cannot absorb: a deal small against the market's live dealer capacity places itself, and one
 * large against it is placed at the underwriter's risk. A fee therefore falls when banks have
 * balance sheet and rises when they do not, and it is bid per DEAL rather than per asset class.
 *
 * The table above survives only as the fallback for a quote made before any of that is known.
 */
export function underwritingFeeBps(args: {
  /** The desks' own secondary bid/ask in this book, in bps. */
  bookSpreadBps: number;
  /** What the paper's PRICE can move against the underwriter in one week, in bps. */
  oneWeekPriceRiskBps: number;
  /** The deal, against the dealer capacity live in this book right now. */
  dealSizeUSD: number;
  deskCapacityUSD: number;
}): number {
  const residualShare = args.dealSizeUSD > 0
    ? args.dealSizeUSD / (args.dealSizeUSD + Math.max(0, args.deskCapacityUSD))
    : 0;
  return Math.max(1, args.bookSpreadBps + residualShare * Math.max(0, args.oneWeekPriceRiskBps));
}

/**
 * The price risk a book's own one-week move puts on paper the underwriter is left holding.
 *
 * PRICE_LIKE books move in price already. A YIELD_LIKE book moves in yield or spread, and what
 * turns that into money is the deal's own duration — the same arithmetic the credit desks use
 * everywhere else.
 */
export function oneWeekPriceRiskBps(args: {
  statKind: 'PRICE_LIKE' | 'YIELD_LIKE';
  currentStat: number;
  /** §5-CLOSE: the one-week move the desk MEASURED for this name (this week's cleared level
   *  against last week's, as a fraction of the level) — there is no cap to read it off. */
  weeklyMovePct: number;
  minWeeklyStatMoveBps?: number;
  durationYears?: number;
}): number {
  const movePct = Math.max(0, args.weeklyMovePct);
  const moveInStat = Math.abs(args.currentStat) * movePct;
  if (args.statKind === 'PRICE_LIKE') return movePct * 10000;
  return (moveInStat + (args.minWeeklyStatMoveBps ?? 0)) * Math.max(0, args.durationYears ?? 0);
}

/**
 * The issuer's house bank — G3c: a relationship, not a draw.
 *
 * What this replaces: a stable hash of the issuer id, weighted by deposit share. Nothing the
 * bank DID won it the mandate — not its price, not its balance sheet, not whether it had ever
 * lent to this issuer — and because the hash never changed, no issuer ever moved. Rule 13: a
 * mandate is an outcome.
 *
 * A mandate now follows, in order, the two things that really decide it:
 *   1. **The credit relationship the bank already has.** The lender carrying this issuer's
 *      facilities knows the credit and gets the call. This is what makes a mandate LOSABLE: the
 *      relationship is measured off the banks' own itemized loan books every time it is asked,
 *      so a bank that lets a facility run off loses the mandate to the one that wrote the next.
 *   2. **The balance sheet to place the deal.** With no incumbent, the mandate goes to the desk
 *      that can actually underwrite it — free dealer capacity, which the caller decrements as it
 *      hands mandates out, so a bank that has taken deals on stops winning them.
 * Market share is the last resort, for a caller that knows neither, and the issuer id only ever
 * breaks an exact tie, so the choice is stable across a week's passes.
 */
export interface LeadBankCandidate {
  ticker: string;
  bankMarketShare?: number;
  /** What this bank already lends this issuer — the relationship, measured. */
  relationshipUSD?: number;
  /** What its desk could still underwrite; the caller decrements it as mandates are won. */
  freeCapacityUSD?: number;
}

export function chooseLeadBank(issuerId: string, banks: LeadBankCandidate[]): string {
  if (banks.length === 0) return '';
  let hash = 0;
  for (let i = 0; i < issuerId.length; i++) hash = ((hash << 5) - hash + issuerId.charCodeAt(i)) | 0;
  const tieBreak = (hash >>> 0) % banks.length;
  const rank = (b: LeadBankCandidate, i: number): number[] => [
    Math.max(0, b.relationshipUSD ?? 0),
    Math.max(0, b.freeCapacityUSD ?? 0),
    b.bankMarketShare ?? 0,
    banks.length - ((i - tieBreak + banks.length) % banks.length),
  ];
  let best = banks[0];
  let bestRank = rank(banks[0], 0);
  banks.forEach((b, i) => {
    const r = rank(b, i);
    for (let k = 0; k < r.length; k++) {
      if (r[k] > bestRank[k]) { best = b; bestRank = r; return; }
      if (r[k] < bestRank[k]) return;
    }
  });
  return best.ticker;
}

/**
 * G3c — hand out a pass's mandates (or house-bank relationships) without any bank winning them
 * all. Each award consumes the winner's capacity, so the allocation spreads across the region's
 * banks in proportion to the balance sheet each actually has — the same quantity that decides
 * whether a bank could serve the client at all, in place of a hash of the client's id.
 */
export function mandateAllocator(banks: { ticker: string; bankMarketShare?: number; capacityUSD: number }[]) {
  const freeUSD = new Map(banks.map((b) => [b.ticker, Math.max(0, b.capacityUSD)]));
  return {
    pick(clientId: string, sizeUSD: number, relationshipUSD?: (ticker: string) => number): string {
      const ticker = chooseLeadBank(clientId, banks.map((b) => ({
        ticker: b.ticker,
        bankMarketShare: b.bankMarketShare,
        relationshipUSD: relationshipUSD ? relationshipUSD(b.ticker) : 0,
        freeCapacityUSD: freeUSD.get(b.ticker) ?? 0,
      })));
      if (ticker) freeUSD.set(ticker, Math.max(0, (freeUSD.get(ticker) ?? 0) - Math.max(0, sizeUSD)));
      return ticker;
    },
  };
}
