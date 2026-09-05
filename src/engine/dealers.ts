/**
 * G3b — the player's dealers ARE the named banks' desks.
 *
 * What this replaces: three invented counterparties (Alpha, Beta, Gamma) with declared axes,
 * a `baseSpreadBps x spreadMultiplier`, an `axeDiscountPct` and a stated credit limit — a second
 * dealer system with no balance sheet, quoting the player while the banks ran real inventories
 * in the clearing books. Rule 3: one real thing, two representations, and only one of them
 * could ever run out.
 *
 * Now there is one. Each named bank is a dealer the player can trade with. Its AXE is where it
 * is actually long paper this week, read off its own desk inventory — which is what an axe means
 * — so it changes as the desk's book changes rather than being a fixed label. Its credit limit
 * is its real dealer capacity, so a desk that is full genuinely cannot take the other side. And
 * the spread it quotes is the one its book charges everyone else, plus the impact the order has
 * on the desk's own schedule.
 */

import { AssetType, Company, Dealer } from '../types';
import type { V2World } from '../engine2/world';
import { deskRowsOf, deskGrossLocal } from './desk-register';
import { assertNever } from '../domain/defect';
import { dealerDeskCapacityLocal, DESK_SPREAD_BPS_BY_BOOK, DESK_BOOK_KIND } from '../domain/dealer-desk';

export { DESK_SPREAD_BPS_BY_BOOK };
import { BASEL_MIN_LEVERAGE_RATIO, leverageHeadroomLocal } from './macro/banking';
import { banksOf } from '../domain/company';

/** The desk book each tradable asset class lands in — the same names the clearing adapters use.
 *  FX spot consumes the desk through a PFE add-on rather than at notional, as the FX forward book
 *  does. §3.17b-ii: the six derivative kinds are gone from the position layer — a derivative is a
 *  contract on the one book. */
export const DESK_BOOK_BY_ASSET_TYPE: Record<AssetType, string> = {
  EQUITY: 'equity',
  CORP_BOND: 'corporate bond',
  LEVERAGED_LOAN: 'leveraged loan',
  GOV_BOND: 'sovereign bond',
  FX_SPOT: 'derivatives',
};

const DEALER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];
const ALL_ASSET_CLASSES = Object.keys(DESK_BOOK_BY_ASSET_TYPE) as AssetType[];

/** The region's named banks, as the desks a player can deal with. Derived every week. */
export function dealersFromBanks(
  /** §3.13-BOOK d3d: the world whose register the desks' rows live on. */
  v2: V2World,
  /** A3.6c: a bank's reserves — its account in the week (`bankReservesOf`), its opening stash at the seed. */
  reservesOf: (bank: Company) => number,
  /** Step 10: the bank's facility book — its rows on the borrowers' ladders (`facilityBookOf`). */
  facilityBookOf: (bank: Company) => number,
  /** §3.13-BOOK d3b/d3d: what the bank's register books put on its sheet — its own sovereign
   *  book at the mark plus its desks' gross (`bankBookAssetsLocal`; the seed's stash before). */
  bookAssetsOf: (bank: Company) => number,
  banks: Company[]
): Dealer[] {
  return banksOf(banks)
    .map((bank, i) => {
      const sheet = bank.bankBalanceSheet!;
      const grossLocal = deskGrossLocal(v2, bank.id);
      const capacityLocal = dealerDeskCapacityLocal({
        balanceSheetCapacityLocal: sheet.bankEquityLocal / BASEL_MIN_LEVERAGE_RATIO,
        leverageHeadroomLocal: leverageHeadroomLocal(sheet, reservesOf(bank), facilityBookOf(bank), bookAssetsOf(bank)),
        grossLocal,
        thisBookGrossLocal: 0,
      });
      // The axe: the books this desk is genuinely long, so the classes it can fill from stock.
      const netByKind = new Map<string, number>();
      deskRowsOf(v2, bank.id).forEach((r) => netByKind.set(r.kind, (netByKind.get(r.kind) ?? 0) + r.inventoryLocal));
      const longBooks = new Set(
        Object.entries(DESK_BOOK_KIND).filter(([, kind]) => (netByKind.get(kind) ?? 0) > 0).map(([book]) => book)
      );
      const axeAssetClasses = ALL_ASSET_CLASSES.filter((a) => longBooks.has(DESK_BOOK_BY_ASSET_TYPE[a]));
      return {
        id: bank.ticker,
        name: bank.name,
        tagline: `${bank.region} dealer desk`,
        inventoryAxe: axeAssetClasses.length > 0 ? `Long: ${axeAssetClasses.join(', ')}` : 'Flat',
        axeBadge: axeAssetClasses.length > 0 ? 'Axe: has the paper' : 'No axe',
        axeDescription: 'Fills from its own book where it is long; elsewhere it has to source the '
          + 'paper and its own schedule prices the size.',
        axeAssetClasses,
        creditLimitLocal: Math.round(capacityLocal),
        currentExposureLocal: Math.round(grossLocal),
        acceptedAssetClasses: ALL_ASSET_CLASSES,
        color: DEALER_COLORS[i % DEALER_COLORS.length],
      };
    });
}

/** What this desk holds of one instrument right now. */
export function deskInventoryLocal(v2: V2World, bank: Company | undefined, book: string, instrumentId: string): number {
  const kind = DESK_BOOK_KIND[book];
  if (!bank || kind === undefined) return 0;
  return deskRowsOf(v2, bank.id, kind).filter((r) => r.instrumentId === instrumentId).reduce((a, r) => a + r.inventoryLocal, 0);
}

/**
 * The desk's quote for one player order, in bps away from the market.
 *
 * Two terms, both the desk's own. The SPREAD is what its book charges every participant, half of
 * it on each side. The IMPACT is the desk's own schedule: it goes from its current inventory to
 * full capacity across one spread, so an order that consumes a share of its capacity moves the
 * level by that share of the spread. An order the desk can fill from stock has no impact — that
 * is what an axe IS, and it falls out rather than being granted as a discount.
 */
export function quoteDeskFillBps(args: {
  bookSpreadBps: number;
  /** What the desk is long in this instrument (negative = short). */
  deskInventoryLocal: number;
  /** What it could still take on, across all its books. */
  deskCapacityLocal: number;
  orderLocal: number;
  isBuy: boolean;
}): { spreadBps: number; impactBps: number; totalBps: number } {
  const spreadBps = args.bookSpreadBps / 2;
  // Buying, the desk sells from stock first and sources the rest; selling, everything it takes
  // is new inventory.
  const sourcedLocal = args.isBuy
    ? Math.max(0, args.orderLocal - Math.max(0, args.deskInventoryLocal))
    : args.orderLocal;
  const impactBps = args.deskCapacityLocal > 0
    ? args.bookSpreadBps * (sourcedLocal / args.deskCapacityLocal)
    : args.bookSpreadBps * 10; // a full desk quotes a level nobody wants to trade at
  return { spreadBps, impactBps, totalBps: spreadBps + impactBps };
}

/**
 * Standard Unified Margin Requirements across Prime Brokers:
 * Eliminates arbitrary dealer leverage and enforces unified regulatory PB margin rules.
 */
export function getUnifiedInitialMarginRate(assetType: AssetType): number {
  switch (assetType) {
    case 'GOV_BOND':
      return 0.05; // 20x sovereign bond leverage
    case 'CORP_BOND':
    case 'LEVERAGED_LOAN':
      return 0.10; // 10x IG/HY corporate debt leverage
    case 'FX_SPOT':
      return 0.05; // 20x FX spot margin
    case 'EQUITY':
      return 0.15; // ~6.6x equity margin
    default:
      // §7.241: the old `return 0.15` handed a new asset type an invented margin silently.
      // A new AssetType member now fails to COMPILE here until a real margin is set.
      return assertNever(assetType, 'unified initial margin rate');
  }
}
