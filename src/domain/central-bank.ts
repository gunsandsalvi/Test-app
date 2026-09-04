/**
 * The central bank as a real counterparty, and the Treasury General Account.
 *
 * Replaces two scalars that stood in for a balance sheet: `centralBankReservesLocal` (seeded at a
 * phantom 1e12 and drifted by a stance multiplier, sitting beside real per-bank cash) and
 * `centralBankBalanceSheet` (a GDP ratio drifting on the same stance).
 *
 * The TGA is the point. A treasury account is a LIABILITY OF THE CENTRAL BANK, not a number on
 * the government — so every dollar moving into it comes out of bank reserves, and every dollar
 * the government spends puts one back. That is why tax dates and heavy issuance weeks tighten
 * money markets, and it is a mechanism this model can feel because WS6's repo market exists.
 *
 * The CB is the one balance sheet allowed to be special: no capital constraint, never defaults.
 */

import { RegionId } from './geography';
import { CurrencyCode, NUMERAIRE } from './geography';
import { FxTable, PARITY_FX, fromNumeraire } from './currency';

export interface CentralBank {
  /** Real holdings of each foreign currency, in USD. Buying your own currency SPENDS these;
   *  selling it accumulates them. A central bank at zero cannot defend its currency, which is
   *  what makes a defence fail. */
  fxReservesByRegion?: Record<string, number>;
  region: RegionId;
  /** Assets: the real sovereign book, by tenor bucket. Clears in 07c like any other holder. */
  /** Asset: the unsecured loans to banks drawn at the funding close (the lender of
   *  last resort). Equals the sum of the banks' `centralBankLoanLocal`. */
  loansToBanksLocal: number;
  /** C4b — OFFICIAL SETTLEMENT. When a payer in this region pays a payee in another,
   *  reserves leave this central bank's system and appear in the other's; the receiving central
   *  bank has credited its bank and holds a CLAIM on the paying one, which has a foreign
   *  official DEPOSIT. One signed line per book: positive = claims on other central banks (an
   *  asset), negative = their deposits here (a liability, carried on the asset side with its
   *  sign). Written by settlement from the instructions themselves; sums to zero across the
   *  world by construction, which the audit asserts. */
  /** §3.13c — one of the FEW fields whose USD suffix is literally true: a claim on another
   *  central bank is one bilateral number, so it is carried in the numéraire on both sides and
   *  the world's sum is exactly zero whatever the rates then do. Every other line on this sheet
   *  is in the region's own money, and `centralBankAssetsLocal` converts this one to match. */
  foreignOfficialClaimsUSD: number;
  /** C5 — Asset: what the standing repo facility has LENT the banks (the CB's seat in
   *  the repo session; each draw creates reserves against pledged collateral). Derived from the
   *  region's repo book by the session that writes it — one writer. */
  standingFacilityLentLocal: number;
  /** LIABILITY: cash the non-banks have parked at the overnight reverse repo window. The other
   *  side of the corridor from `standingFacilityLentLocal`, and the reason the administered floor
   *  is a real rate: the money leaves the institution's account and is not spendable while it
   *  sits here. Written by the repo session, one writer, and returned with interest the
   *  following week. */
  reverseRepoBorrowedLocal: number;
  /** §3.13c-REVAL — THE REVALUATION ACCOUNT, in this region's own money. Two lines on this sheet
   *  are held in the numéraire rather than locally — the official claim on other central banks
   *  (which has to be, or the world's bilateral sum is an exchange rate) and the FX reserves,
   *  which are foreign currency by definition — so when a rate moves their worth in this book
   *  changes while nothing else does. That difference is a real unrealised gain, and a central
   *  bank carries exactly this account for it. It is NOT remitted: the note above about keeping
   *  no retained earnings is about INCOME, and a translation gain is not income until it is
   *  realised. Without it the M1 identity broke by the revaluation every week a rate moved. */
  fxRevaluationLocal?: number;
  /** A3.5 — the treasury's account (a liability) and the WAYS AND MEANS advance (an
   *  asset: the treasury cannot overdraw; when its payments exceed its account the central bank
   *  advances the difference at the policy rate, and the next money in repays it) are the two
   *  signs of ONE account row (`treasuryAccountOf`/`waysAndMeansOf`, ledger/accounts.ts). No
   *  field carries either. */
  /** This week's interest INCOME on the lender-of-last-resort loans (02b) and on the
   *  standing facility's repo contracts (the repo session), remitted with the coupons: the
   *  central bank keeps no retained earnings, so its assets are exactly its liabilities. */
  lastLoanInterestLocal?: number;
  lastStandingFacilityInterestLocal?: number;
  /** C5 — last week's reverse-repo interest the window paid the funds (a central-bank
   *  expense, netted in the remittance like the interest on reserves). */
  lastReverseRepoInterestLocal?: number;
  /** Liability: notes in circulation — the slow, non-operational part of the balance sheet. */
  currencyInCirculationLocal: number;
  /** Last week's accretion on the bill book — a discount bill's income, which pays no coupon. */
  lastBillAccretionLocal?: number;
  /** This week's coupon income on the sovereign book, and the interest paid on reserves — the
   *  two largest lines of the remittance, reported like the four smaller ones beside them so the
   *  whole income statement can be read off the sheet instead of recomputed. */
  lastCouponIncomeLocal?: number;
  lastInterestOnReservesLocal?: number;
  /** Last week's remittance to the treasury: every income line above less every expense line. */
  lastRemittanceLocal: number;
  /** Last week's net reserve movement caused by TGA flows (negative = drained from banks). */
  lastReserveDrainLocal: number;
  /**
   * Next week's open-market order, by tenor bucket. The CB is a real bidder in 07c and
   * 07f, so its policy is a QUANTITY the auction must price against everyone else's demand —
   * not a premium added to a curve.
   */
  plannedPurchasesByBond: Record<string, number>;
  /** Share of last week's redemptions put back to work. Below 1 is QT; the runoff is real supply. */
  reinvestmentShare: number;
  /** What the auctions actually filled last week — the order is an intention, the fill is the fact. */
  lastOpenMarketPurchasesLocal: number;
  /** The order those fills were struck against, kept so the two can be compared after stage 11
   * has already written next week's. */
  lastOrderPlacedLocal: number;
}

/** Share of the sovereign stock the central bank holds at seed. */
export const CENTRAL_BANK_SOVEREIGN_SHARE = 0.15;
/**
 * Weeks of spending the treasury keeps on hand. Sized to the real dry spell: since
 * receipts on real calendars (monthly withholding and payroll, quarterly business and
 * consumption tax), the treasury pays out smoothly and is paid in lumps, and a four-week buffer
 * ran the account negative by week 10. A real treasury either holds a bigger balance or issues
 * cash-management bills to bridge; this is the first, and the second is PUB's issuance slice.
 */
export const TGA_TARGET_WEEKS_OF_SPENDING = 10;

/** Foreign currency this central bank actually holds, in USD. */
export function centralBankFxReservesLocal(cb: CentralBank): number {
  return Object.values(cb.fxReservesByRegion || {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

/**
 * The whole asset side: the domestic sovereign book PLUS the FX reserves.
 *
 * These are split because the central bank used to intervene in the currency market with the
 * size of its DOMESTIC BOND BOOK. A central bank does not sell its own government's paper to
 * defend its currency — it sells reserves, and when the reserves are gone the defence ends. That
 * is the mechanism a balance-sheet scalar cannot express, and it is the whole reason a currency
 * peg ever breaks.
 */
export function centralBankAssetsLocal(sovereignBookLocal: number, cb: CentralBank, waysAndMeansLocal: number, money: CurrencyCode = NUMERAIRE, fx: FxTable = PARITY_FX): number {
  // §3.13-BOOK d3a: the sovereign book is REGISTER ROWS (`sovereign-register.ts:centralBankBookLocal`),
  // handed in — this file is domain and does not read the store.
  return sovereignBookLocal + centralBankFxReservesLocal(cb) + (cb.loansToBanksLocal ?? 0)
    // §3.13c: the one line on this sheet held in the numéraire, brought to the book's own money.
    + fromNumeraire(cb.foreignOfficialClaimsUSD ?? 0, money, fx) + (cb.standingFacilityLentLocal ?? 0) + waysAndMeansLocal;
}

/**
 * THE IDENTITY: assets = reserves + treasury account + currency + the reverse repo window's
 * take, every week, to the dollar. Reserves are the banks' own cash (a derived input, one
 * representation); currency is a
 * STORED liability that moves only when the central bank issues it — never a residual that
 * closes the book, because a residual is where money appears from nowhere. The residual is
 * what the audit prints (M1) until every reserve movement has a purchase behind it.
 */
export function centralBankIdentityResidualLocal(sovereignBookLocal: number, cb: CentralBank, bankReservesLocal: number, treasuryAccountLocal: number, waysAndMeansLocal: number): number {
  return centralBankLiabilitiesLocal(cb, bankReservesLocal, treasuryAccountLocal) - centralBankAssetsLocal(sovereignBookLocal, cb, waysAndMeansLocal);
}

/** Reserves, the treasury's account, the currency it has issued, and what the non-banks have
 *  parked at the reverse repo window. */
export function centralBankLiabilitiesLocal(cb: CentralBank, bankReservesLocal: number, treasuryAccountLocal: number): number {
  return bankReservesLocal + treasuryAccountLocal + cb.currencyInCirculationLocal + (cb.reverseRepoBorrowedLocal ?? 0)
    + (cb.fxRevaluationLocal ?? 0);
}

/**
 * Remittance: what the CB earns on its portfolio less what it pays on reserves, returned to the
 * treasury. Negative when the policy rate exceeds the portfolio's yield — the real and famous
 * phenomenon of a central bank remitting nothing after a hiking cycle, which this reproduces for
 * free rather than modelling separately.
 */
export function remittanceLocal(
  couponIncomeWeeklyLocal: number,
  /** The interest on reserves the central bank actually PAID this week, accumulated by 02b as
   *  it pays each bank — not a rate on a stock, and not a later re-sum of the banks' own fields. */
  interestOnReservesPaidLocal: number
): number {
  return couponIncomeWeeklyLocal - interestOnReservesPaidLocal;
}

/**
 * The floor the policy rate cannot go below. Must match the clamp on the Taylor rule in
 * macro/evolution.ts: when the rule wants a rate below this, the rate tool is out of room and
 * the balance sheet is the only instrument left. That is what QE is FOR.
 */
export const EFFECTIVE_LOWER_BOUND = -0.01;

/**
 * How much balance sheet substitutes for a rate cut the floor blocks: buying this share of the
 * sovereign stock over a year stands in for one percentage point of easing.
 */
export const QE_STOCK_SHARE_PER_RATE_POINT_ANNUAL = 0.10;

/**
 * The largest run rate a purchase program is announced at, as a share of the sovereign stock per
 * year. A central bank commits to a pace and holds it; it does not scale purchases without limit
 * with the depth of the rule's gap. The referent is generous — the Fed's peak Treasury purchases
 * ran near 5% of that market a year, so this is roughly double the largest real program.
 *
 * It exists because the rule below is otherwise unbounded in the blocked cut: a deflation deep
 * enough to want a -5% policy rate ordered 40% of the stock a year, and the measured result was
 * the 2Y clearing at -2.6%.
 */
export const QE_MAX_PACE_ANNUAL_SHARE_OF_STOCK = 0.10;

/** Room above the floor at which the rate tool is working again, so the book can normalize. */
export const RATE_TOOL_HEADROOM = 0.02;

/**
 * The most of its own sovereign market a central bank will own. The referent is the extreme real
 * case — the Bank of Japan, holding roughly half of all JGBs after two decades of easing — and
 * the reason it is a bound at all is that a central bank owning the whole float has destroyed the
 * market whose price it is trying to influence.
 *
 * Without it the rule is unbounded in the blocked cut: a deflation deep enough to want a -5%
 * policy rate orders 40% of the stock a year, and the measured result was the central bank
 * taking 31% of the market in 30 weeks and clearing the 2Y at -2.6%.
 */
export const CENTRAL_BANK_MAX_STOCK_SHARE = 0.50;

/**
 * The week's open-market decision: how much of what matured goes back to work, and how much new
 * paper to buy on top. Three regimes, and the default is the boring one.
 *
 *  **QE** the rule wants a rate the floor forbids. Reinvest everything and buy a flow scaled
 *    to the easing that cannot be delivered.
 *  **QT** the rate tool has room again AND the book sits above the share it was built at.
 *    Reinvest only part of what matures; the rest is real supply 07c has to find a buyer for,
 *    which is what makes QT a market event rather than an announcement.
 *  **Neither** reinvest in full. The book holds its LEVEL and lets its share of a growing
 *    stock drift, which is what a central bank not using the balance sheet actually does.
 */
export function openMarketPolicy(args: {
  policyRate: number;
  /** The Taylor rule's UNCLAMPED target — the rate the rule wanted before the floor bound it. */
  taylorTargetRate: number;
  bookLocal: number;
  sovereignStockLocal: number;
}): { reinvestmentShare: number; netPurchaseLocal: number } {
  const bookShare = args.sovereignStockLocal > 0 ? args.bookLocal / args.sovereignStockLocal : 0;
  const blockedCutPoints = Math.max(0, EFFECTIVE_LOWER_BOUND - args.taylorTargetRate) * 100;
  if (blockedCutPoints > 0) {
    const headroomLocal = Math.max(
      0, args.sovereignStockLocal * CENTRAL_BANK_MAX_STOCK_SHARE - args.bookLocal
    );
    const wantedLocal = (args.sovereignStockLocal *
      Math.min(QE_STOCK_SHARE_PER_RATE_POINT_ANNUAL * blockedCutPoints, QE_MAX_PACE_ANNUAL_SHARE_OF_STOCK)) / 52;
    return { reinvestmentShare: 1, netPurchaseLocal: Math.min(wantedLocal, headroomLocal) };
  }
  const canNormalize = args.policyRate > EFFECTIVE_LOWER_BOUND + RATE_TOOL_HEADROOM;
  if (canNormalize && bookShare > CENTRAL_BANK_SOVEREIGN_SHARE) {
    // Runoff is capped by what actually matures — a central bank cannot shrink faster than its
    // paper comes due without selling, which is a different and rarer operation.
    const excess = (bookShare - CENTRAL_BANK_SOVEREIGN_SHARE) / CENTRAL_BANK_SOVEREIGN_SHARE;
    return { reinvestmentShare: Math.max(0, 1 - excess), netPurchaseLocal: 0 };
  }
  return { reinvestmentShare: 1, netPurchaseLocal: 0 };
}

/**
 * The bill program responds to the treasury's cash position.
 *
 * The gap this closes: the government spends every week but raises bond financing on a QUARTERLY
 * calendar (stage 11 accumulates `pendingUnfundedDeficitLocal` for 13 weeks), so between auctions
 * the TGA absorbs the entire shortfall. That works while the buffer is large enough and fails the
 * moment obligations grow — measured, the account ran to −497.5B once spending was indexed to
 * real wages. A negative treasury account is not a fiscal outcome, it is a MISSING INSTRUMENT.
 *
 * **Not a cash-management bill, despite what this was first called.** A real CMB is a distinct
 * instrument because a real bill calendar is FIXED — announced sizes on announced dates — so an
 * unexpected gap cannot be met by enlarging Thursday's auction, and the treasury goes off-calendar
 * at an odd maturity and a small yield concession. This model has no fixed calendar: bills already
 * issue every week at a freely varying size. So the extra size is simply a bigger regular auction,
 * and naming it a CMB claimed a distinction the code does not make.
 */
export function cashPositionBillIssuanceLocal(args: {
  treasuryAccountLocal: number;
  /** Weekly outlays, which set the size of the operating balance the treasury wants. */
  weeklyOutlaysLocal: number;
}): number {
  const targetLocal = Math.max(0, args.weeklyOutlaysLocal) * TGA_TARGET_WEEKS_OF_SPENDING;
  const shortfallLocal = targetLocal - args.treasuryAccountLocal;
  if (shortfallLocal <= 0) return 0;
  return shortfallLocal * CASH_BRIDGE_CLOSE_RATE_WEEKLY;
}

/**
 * Share of a cash shortfall bridged per week. A treasury does not raise a quarter's worth of
 * operating balance in one auction — it rebuilds over several, which is also what keeps the
 * bill program's size a smooth supply the market can absorb rather than a cliff.
 */
export const CASH_BRIDGE_CLOSE_RATE_WEEKLY = 0.34;
