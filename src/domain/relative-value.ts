/**
 * §3.17e-ii-a — THE REGISTRY OF COMPARABLES, and the book that reads it.
 *
 * An arbitrage is not a flag. It is TWO PRICES FOR THE SAME RISK, and every such pair in this
 * world is already declared, because the audit measures them (§3 step 17f). A COMPARABLE is two
 * priced things and the relationship that should hold between them: a READ (what the two prices
 * disagree by, annualised, and what holding the pair costs), and two LEGS (what to buy and what
 * to sell, each at the price that keeps the edge). The relative-value book — a hedge fund with
 * the `RELATIVE_VALUE` strategy — reads the registry, sizes each pair by its edge net of carry
 * against the capital its broker will finance, and places BOTH legs in the markets that clear
 * them (rule 5). A new asset class joins by declaring its comparable, never by growing a flag.
 *
 * THE FIRST ENTRY is the government bond basis: the future against the cash bond carried at the
 * repo rate (`bond-future.ts:bondFuturesCarryPrice`). Future rich: long the deliverable, financed
 * on the prime-brokerage line, short the line. The book is CAPITAL-CONSTRAINED and can LOSE — the
 * position is what its cash and its broker's haircut carry, its futures post real margin, and its
 * legs clear against everyone else's — which is what makes it a mechanism and not a clamp: a
 * basis that survives it is a finding, and one that only survived because nobody could trade it
 * was never a price.
 */

import type { RegionId } from './geography';
import type { EntityId, InstrumentId } from './ids';
import { bondFuturesCarryPrice } from './derivatives/classes/bond-future';

/** The markets a leg can clear in. A comparable joins by naming the two its legs need. */
type ComparableMarket = 'SOVEREIGN_CASH' | 'BOND_FUTURE' | 'CORP_BOND_CASH' | 'CDS_PROTECTION' | 'CDS_INDEX_PROTECTION' | 'IRS_FIXED';

/** One leg of a pair, as the market that clears it reads it: a size (+ long / − short, in face),
 *  the price it is worth doing at (a long buys below it, a short sells above it), how far past
 *  that it takes to reach full size, and — for a cash leg — the money it may spend. */
export interface RelativeValueLeg {
  market: ComparableMarket;
  regionId: RegionId;
  instrumentId: InstrumentId;
  faceLocal: number;
  reservationPrice: number;
  fullSizePriceRange: number;
  budgetLocal: number;
  /** §3.17e-ii-b — a CUT: the leg comes off at whatever the book clears, not at a price of the
   *  fund's choosing (the line no longer carries it, or the pair has lost what it was margined for). */
  forced?: boolean;
}

/**
 * §3.17e-ii-b — WHAT THE PAIR HAS MADE OR LOST: the cash leg's mark over its lots' basis, plus
 * what the future leg has already settled to the fund as variation margin (a short is paid the
 * fall and pays the rise, so its settled mark is signed to it here).
 */
export const pairPnLLocal = (args: { cashValueLocal: number; cashBasisLocal: number; futuresSettledToFundLocal: number }): number =>
  (args.cashValueLocal - args.cashBasisLocal) + args.futuresSettledToFundLocal;

/**
 * §3.17e-ii-b — THE STOP. The pair is cut whole when it has lost more than the initial margin
 * its future leg posted: the house's own measure of the move the position can make before it can
 * be closed (§3.17-ii), so a loss past it is the pair moving further than it was carried for.
 * No tolerance of the fund's own — the limit to arbitrage is the margin identity.
 */
export const stoppedOut = (pnlLocal: number, marginPostedLocal: number): boolean =>
  marginPostedLocal > 0 && pnlLocal < -marginPostedLocal;

/** What a comparable reads this week: the disagreement, annualised in bps of the pair's face, and
 *  what carrying the pair costs per year in the same unit. */
interface ComparableRead { deviationBps: number; carryBps: number }

/** The edge: what is left of the disagreement after carrying it. */
export const edgeBps = (r: ComparableRead): number => r.deviationBps - r.carryBps;

/** §3.17e-iii-a — what a book needs to BORROW to be short a cash instrument: the units beyond what
 *  it holds, stated for the lending book that clears the borrow. */
export interface BorrowNeed { entityId: EntityId; regionId: RegionId; instrumentId: InstrumentId; units: number }

/**
 * §3.17e-iii-a — THE SIGNED TARGET. A pair has two directions and each has its own carry: long
 * the cash leg pays the financing, short it pays the borrow. The book takes the direction whose
 * edge is there — the long trade first, the mirror when the future is cheap — and none when
 * neither pays. + is the long-cash trade, − its mirror, as a share of what the book can carry.
 */
export function arbTargetShare(longEdgeBps: number, mirrorEdgeBps: number, weeklyMoveBps: number): number {
  if (longEdgeBps > 0) return arbSizeShare(longEdgeBps, weeklyMoveBps);
  if (mirrorEdgeBps > 0) return -arbSizeShare(mirrorEdgeBps, weeklyMoveBps);
  return 0;
}

/** How much of its capacity the book commits: it scales in over the move the relationship can
 *  make in a week — past that the edge is plainly there and it takes all it can carry. */
export function arbSizeShare(edge: number, weeklyMoveBps: number): number {
  if (!(edge > 0)) return 0;
  return Math.max(0, Math.min(1, edge / Math.max(1e-9, weeklyMoveBps)));
}

/** The position the fund's capital carries: its own spendable cash plus what its broker will
 *  still lend against it — the broker's haircut is already in that number (HF1). */
export const arbCapacityLocal = (spendableLocal: number, primeBrokerageAvailableLocal: number | undefined): number =>
  Math.max(0, spendableLocal) + Math.max(0, primeBrokerageAvailableLocal ?? 0);

/** The net basis (print less carry, per unit of face) as a rate on the cash price over the weeks
 *  to delivery, in bps a year — the one annualisation the book and the audit (X2) both read. */
export function bondBasisDeviationBps(netBasis: number, cashPrice: number, yearsToDelivery: number): number {
  const T = Math.max(1 / 52, yearsToDelivery);
  return (netBasis / Math.max(1e-9, cashPrice) / T) * 10000;
}

/**
 * THE BOND BASIS, READ. The net basis (print less carry, per unit of face) as a rate on the cash
 * price over the weeks to delivery; against it, the financing the fund pays ABOVE the repo rate
 * the carry price already assumes, and the return it needs on the margin the short posts.
 */
export function bondBasisRead(args: {
  netBasis: number; cashPrice: number; yearsToDelivery: number;
  financingRateAnnual: number; repoRateAnnual: number; marginRate: number; requiredReturnAnnual: number;
}): ComparableRead {
  const deviationBps = bondBasisDeviationBps(args.netBasis, args.cashPrice, args.yearsToDelivery);
  const carryBps = Math.max(0, args.financingRateAnnual - args.repoRateAnnual) * 10000
    + Math.max(0, args.marginRate) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return { deviationBps, carryBps };
}

/**
 * §3.17e-iii-a — THE BOND BASIS, READ FROM THE OTHER SIDE. A cheap future is long the line and
 * SHORT the cash bond: the disagreement is the same number with its sign turned, and carrying the
 * mirror costs the borrow fee on the paper (the lending book's own print, in bps of its value a
 * year) and the return the long's margin needs. Nothing is financed: the sale funds itself.
 */
export function bondBasisMirrorRead(args: {
  netBasis: number; cashPrice: number; yearsToDelivery: number;
  borrowFeeBps: number; marginRate: number; requiredReturnAnnual: number;
}): ComparableRead {
  const deviationBps = -bondBasisDeviationBps(args.netBasis, args.cashPrice, args.yearsToDelivery);
  const carryBps = Math.max(0, args.borrowFeeBps) + Math.max(0, args.marginRate) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return { deviationBps, carryBps };
}

/**
 * THE BOND BASIS, AS TWO LEGS. The cash leg buys the deliverable up to the price at which the
 * future still pays the carry; the future leg sells the line down to the carry price plus that
 * same cost. Both scale in over the line's own weekly move.
 */
export function bondBasisLegs(args: {
  regionId: RegionId; bondId: InstrumentId; futureId: InstrumentId; faceLocal: number;
  cashPrice: number; futurePrice: number; couponRate: number; repoRateAnnual: number; yearsToDelivery: number;
  carryBps: number; weeklyPriceMove: number; budgetLocal: number;
}): { cash: RelativeValueLeg; future: RelativeValueLeg } {
  const T = Math.max(1 / 52, args.yearsToDelivery);
  const carryCostPrice = (args.carryBps / 10000) * T * args.cashPrice;
  const cashMax = (args.futurePrice + Math.max(0, args.couponRate) * T - carryCostPrice) / (1 + Math.max(0, args.repoRateAnnual) * T);
  const futureMin = bondFuturesCarryPrice({ cashPrice: args.cashPrice, couponRate: args.couponRate, repoRateAnnual: args.repoRateAnnual, yearsToDelivery: T }) + carryCostPrice;
  const range = Math.max(1e-6, args.weeklyPriceMove);
  return {
    cash: { market: 'SOVEREIGN_CASH', regionId: args.regionId, instrumentId: args.bondId, faceLocal: args.faceLocal, reservationPrice: cashMax, fullSizePriceRange: range, budgetLocal: args.budgetLocal },
    future: { market: 'BOND_FUTURE', regionId: args.regionId, instrumentId: args.futureId, faceLocal: -args.faceLocal, reservationPrice: futureMin, fullSizePriceRange: range, budgetLocal: 0 },
  };
}

/**
 * §3.17f-i — THE CDS–CASH BASIS, READ. Protection on a name against the name's own cash paper at
 * the same point: a bond that pays more than its protection costs is the negative-basis trade —
 * long the bond, financed on the line, and long protection on it — earning the difference for
 * no credit risk. The disagreement is the rung's spread less the protection's, annualised as
 * both are; the carry is the financing above repo and the return the protection's margin needs.
 */
export function cdsBasisRead(args: {
  cashSpreadBps: number; cdsSpreadBps: number;
  financingRateAnnual: number; repoRateAnnual: number; marginRate: number; requiredReturnAnnual: number;
}): ComparableRead {
  const deviationBps = args.cashSpreadBps - args.cdsSpreadBps;
  const carryBps = Math.max(0, args.financingRateAnnual - args.repoRateAnnual) * 10000
    + Math.max(0, args.marginRate) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return { deviationBps, carryBps };
}

/**
 * §3.17f-i — THE CDS–CASH BASIS, AS TWO LEGS. The cash leg buys the rung down to the spread at
 * which it still pays the protection plus the carry (stated as the price that spread implies on
 * the rung); the protection leg buys cover up to the rung's spread less the carry (stated in
 * bps, the level that book clears). A negative face on the protection leg is protection BOUGHT
 * — the credit sold — as a negative face on a line is a short.
 */
export function cdsBasisLegs(args: {
  regionId: RegionId; bondId: InstrumentId; cdsInstrumentId: InstrumentId; faceLocal: number;
  cashSpreadBps: number; cdsSpreadBps: number; carryBps: number; weeklyMoveBps: number;
  priceAtSpread: (spreadBps: number) => number; budgetLocal: number;
}): { cash: RelativeValueLeg; protection: RelativeValueLeg } {
  // Bought down to the spread that still pays cover plus carry; sold (the mirror) at any price
  // the book clears, as a target.
  const cashMaxSpread = args.faceLocal >= 0 ? args.cdsSpreadBps + args.carryBps : args.cdsSpreadBps - args.carryBps;
  const range = Math.max(1e-6, args.weeklyMoveBps);
  const cashReservation = args.priceAtSpread(cashMaxSpread);
  return {
    cash: {
      market: 'CORP_BOND_CASH', regionId: args.regionId, instrumentId: args.bondId, faceLocal: args.faceLocal,
      reservationPrice: cashReservation, fullSizePriceRange: Math.max(1e-6, Math.abs(cashReservation - args.priceAtSpread(cashMaxSpread + range))), budgetLocal: args.budgetLocal,
    },
    protection: {
      market: 'CDS_PROTECTION', regionId: args.regionId, instrumentId: args.cdsInstrumentId, faceLocal: -args.faceLocal,
      // Bought up to the rung less the carry; written (§3.17f-v, the mirror) down to the rung plus it.
      reservationPrice: args.faceLocal >= 0 ? args.cashSpreadBps - args.carryBps : args.cashSpreadBps + args.carryBps, fullSizePriceRange: range, budgetLocal: 0,
    },
  };
}

/**
 * §3.17f-ii — THE INDEX AGAINST ITS NAMES, READ. A line on a basket against the basket's own
 * names at the same tenor: the disagreement is the index print less the equal-weighted mean of
 * the names' prints; the carry is the return the margin on BOTH legs needs — nothing is funded,
 * both legs are protection. + is the index rich (write the index, buy the names); the mirror is
 * the same number with its sign turned.
 */
export function indexArbRead(args: { indexPrintBps: number; namesMeanBps: number; indexMarginRate: number; namesMarginRate: number; requiredReturnAnnual: number }): { long: ComparableRead; mirror: ComparableRead } {
  const deviationBps = args.indexPrintBps - args.namesMeanBps;
  const carryBps = (Math.max(0, args.indexMarginRate) + Math.max(0, args.namesMarginRate)) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return { long: { deviationBps, carryBps }, mirror: { deviationBps: -deviationBps, carryBps } };
}

/**
 * §3.17f-ii — THE INDEX AGAINST ITS NAMES, AS LEGS. A signed face on the index line (+ written,
 * − bought) and the opposite face spread equal-weighted over the names. The index is written
 * down to the names' mean plus the carry and bought up to it less the carry; each name's cover is
 * bought up to its own print plus what the pair has to spare, written down to its print less it.
 */
export function indexArbLegs(args: {
  regionId: RegionId; indexInstrumentId: InstrumentId; names: { instrumentId: InstrumentId; printBps: number }[];
  faceLocal: number; indexPrintBps: number; namesMeanBps: number; carryBps: number; weeklyMoveBps: number;
}): { index: RelativeValueLeg; names: RelativeValueLeg[] } {
  const range = Math.max(1e-6, args.weeklyMoveBps);
  const spare = Math.max(0, Math.abs(args.indexPrintBps - args.namesMeanBps) - args.carryBps);
  const indexReservation = args.faceLocal >= 0 ? args.namesMeanBps + args.carryBps : args.namesMeanBps - args.carryBps;
  const n = Math.max(1, args.names.length);
  return {
    index: { market: 'CDS_INDEX_PROTECTION', regionId: args.regionId, instrumentId: args.indexInstrumentId, faceLocal: args.faceLocal, reservationPrice: indexReservation, fullSizePriceRange: range, budgetLocal: 0 },
    names: args.names.map((nm) => ({
      market: 'CDS_PROTECTION' as const, regionId: args.regionId, instrumentId: nm.instrumentId, faceLocal: -args.faceLocal / n,
      reservationPrice: args.faceLocal >= 0 ? nm.printBps + spare : nm.printBps - spare, fullSizePriceRange: range, budgetLocal: 0,
    })),
  };
}

/**
 * §3.17f-iii — THE SWAP SPREAD, READ. The par rate on secured overnight money against the
 * government's own yield at the same tenor. A swap paying more than the bond is RECEIVED against
 * the bond sold short — the floating leg pays the repo the sale's collateral earns — carrying the
 * paper's borrow fee and the swap's margin; the mirror pays fixed against the bond bought on the
 * line, carrying the financing above repo and the margin.
 */
export function swapSpreadRead(args: {
  swapSpreadBps: number; borrowFeeBps: number; financingRateAnnual: number; repoRateAnnual: number; marginRate: number; requiredReturnAnnual: number;
}): { long: ComparableRead; mirror: ComparableRead } {
  const marginBps = Math.max(0, args.marginRate) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return {
    long: { deviationBps: args.swapSpreadBps, carryBps: Math.max(0, args.borrowFeeBps) + marginBps },
    mirror: { deviationBps: -args.swapSpreadBps, carryBps: Math.max(0, args.financingRateAnnual - args.repoRateAnnual) * 10000 + marginBps },
  };
}

/**
 * §3.17f-iii — THE SWAP SPREAD, AS TWO LEGS. + is receive fixed (long the swap line) against the
 * bond short; − is pay fixed against the bond long. The swap is received down to the bond's yield
 * plus the carry and paid up to it less the carry, in bps; the bond long buys up to the price the
 * par rate less the carry implies, the bond short is a target at what the auction clears.
 */
export function swapSpreadLegs(args: {
  regionId: RegionId; swapInstrumentId: InstrumentId; bondId: InstrumentId; faceLocal: number;
  govYieldBps: number; parBps: number; carryBps: number; weeklyMoveBps: number;
  priceAtYieldBps: (yieldBps: number) => number; cashPrice: number; budgetLocal: number;
}): { swap: RelativeValueLeg; bond: RelativeValueLeg } {
  const range = Math.max(1e-6, args.weeklyMoveBps);
  const receive = args.faceLocal >= 0;
  const bondReservation = receive ? args.cashPrice : args.priceAtYieldBps(args.parBps - args.carryBps);
  return {
    swap: { market: 'IRS_FIXED', regionId: args.regionId, instrumentId: args.swapInstrumentId, faceLocal: args.faceLocal, reservationPrice: receive ? args.govYieldBps + args.carryBps : args.govYieldBps - args.carryBps, fullSizePriceRange: range, budgetLocal: 0 },
    bond: { market: 'SOVEREIGN_CASH', regionId: args.regionId, instrumentId: args.bondId, faceLocal: -args.faceLocal, reservationPrice: bondReservation, fullSizePriceRange: Math.max(1e-6, Math.abs(bondReservation - args.priceAtYieldBps(args.parBps - args.carryBps + range))), budgetLocal: args.budgetLocal },
  };
}

/** Two legs of one book on one instrument in one market are one leg: the faces add, the money
 *  adds, the level is the larger leg's, and a cut anywhere is a cut. */
export function mergeLegs<L extends RelativeValueLeg & { entityId: string }>(legs: readonly L[]): L[] {
  const byKey = new Map<string, L>();
  legs.forEach((l) => {
    const k = `${l.entityId}|${l.market}|${l.instrumentId}`;
    const have = byKey.get(k);
    if (!have) { byKey.set(k, { ...l }); return; }
    const bigger = Math.abs(l.faceLocal) > Math.abs(have.faceLocal) ? l : have;
    byKey.set(k, { ...have, faceLocal: have.faceLocal + l.faceLocal, budgetLocal: have.budgetLocal + l.budgetLocal, reservationPrice: bigger.reservationPrice, fullSizePriceRange: bigger.fullSizePriceRange, forced: have.forced || l.forced });
  });
  return Array.from(byKey.values()).filter((l) => Math.abs(l.faceLocal) > 1);
}

/**
 * §3.17f-v — SENIORITY ACROSS ONE ISSUER'S CAPITAL STRUCTURE, READ. A junior claim must pay more
 * than the senior of the same borrower at the same date; where it pays LESS the senior is bought
 * and the junior sold — borrowed through the lending book — carrying the junior's borrow fee and
 * the senior's financing above repo. One direction: a junior paying MORE is a seniority premium,
 * which has no bound to arbitrage.
 */
export function seniorityRead(args: { seniorSpreadBps: number; subSpreadBps: number; borrowFeeBps: number; financingRateAnnual: number; repoRateAnnual: number }): ComparableRead {
  return {
    deviationBps: args.seniorSpreadBps - args.subSpreadBps,
    carryBps: Math.max(0, args.borrowFeeBps) + Math.max(0, args.financingRateAnnual - args.repoRateAnnual) * 10000,
  };
}

/** §3.17f-v — the senior bought down to the spread that still pays the junior's plus the carry;
 *  the junior a target sold at what the book clears (and borrowed beyond what is held). */
export function seniorityLegs(args: {
  regionId: RegionId; seniorId: InstrumentId; subId: InstrumentId; faceLocal: number;
  subSpreadBps: number; carryBps: number; weeklyMoveBps: number; seniorPriceAtSpread: (bps: number) => number; subPrice: number; budgetLocal: number;
}): { senior: RelativeValueLeg; sub: RelativeValueLeg } {
  const range = Math.max(1e-6, args.weeklyMoveBps);
  const seniorReservation = args.seniorPriceAtSpread(args.subSpreadBps + args.carryBps);
  return {
    senior: { market: 'CORP_BOND_CASH', regionId: args.regionId, instrumentId: args.seniorId, faceLocal: args.faceLocal, reservationPrice: seniorReservation, fullSizePriceRange: Math.max(1e-6, Math.abs(seniorReservation - args.seniorPriceAtSpread(args.subSpreadBps + args.carryBps + range))), budgetLocal: args.budgetLocal },
    sub: { market: 'CORP_BOND_CASH', regionId: args.regionId, instrumentId: args.subId, faceLocal: -args.faceLocal, reservationPrice: args.subPrice, fullSizePriceRange: range, budgetLocal: 0 },
  };
}
