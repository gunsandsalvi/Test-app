/**
 * §5-STRUCT step 4 — THE ASSET REGISTRY. One line per kind.
 *
 * The pattern is `stages/profiles/index.ts`, which is already right and already in this repo: a
 * `Record<Kind, Module>` where each kind is a module and adding one is a file plus a line. Nothing
 * else in the engine dispatches that way, and the cost was counted in §7.229 — a new security type
 * has to be taught to **75 comparison sites across 17 files**, none of which the compiler will
 * point you at, because `assetType` is a string and a missing case is a silent fallthrough.
 *
 * What lives here is what every kind must ANSWER, not what any one kind happens to need:
 * how it is classified on a balance sheet, whether it carries a coupon, whether it can be lent.
 * A question only one kind can answer belongs on that kind's own module, not in this interface.
 *
 * WHY A REGISTRY AND NOT A SWITCH. A switch is written once per question and has to be found again
 * for every new kind; a registry is written once per KIND and answers every question. The
 * difference only shows up when someone adds the twelfth asset type in eighteen months and has no
 * way to know where the eleven answers live.
 */

import { AssetType } from '../instruments';

/** Where an instrument sits when a book is summed by class. */
export type AssetClass = 'EQUITY' | 'CREDIT' | 'SOVEREIGN' | 'DERIVATIVE' | 'COMMODITY' | 'CASH_LIKE';

export interface AssetModule {
  /** For the balance-sheet and NAV views that sum a book by class. */
  readonly assetClass: AssetClass;
  /** Does it pay a periodic coupon (so CAL accrues it between payment dates)? */
  readonly carriesCoupon: boolean;
  /** Can it be borrowed against, or lent out for a fee? */
  readonly lendable: boolean;
  /** Is its value a claim on an issuer that can default? */
  readonly hasCreditRisk: boolean;
  /** Does it have a price, or only a stat (a spread, a rate) that a price is derived from? */
  readonly quotedAs: 'PRICE' | 'YIELD_LIKE' | 'SPREAD_LIKE';
}

/**
 * ONE LINE PER KIND. A new asset type is a row here; every reader below keeps working, and any
 * reader that genuinely needs new behaviour gets it by adding a field to `AssetModule`, which the
 * compiler then demands for every existing kind. That is the property a string tag cannot have.
 */
export const ASSET_REGISTRY: Record<AssetType, AssetModule> = {
  EQUITY:         { assetClass: 'EQUITY',     carriesCoupon: false, lendable: true,  hasCreditRisk: false, quotedAs: 'PRICE' },
  CORP_BOND:      { assetClass: 'CREDIT',     carriesCoupon: true,  lendable: true,  hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE' },
  LEVERAGED_LOAN: { assetClass: 'CREDIT',     carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE' },
  SOV_BOND:       { assetClass: 'SOVEREIGN',  carriesCoupon: true,  lendable: true,  hasCreditRisk: false, quotedAs: 'YIELD_LIKE' },
  CDS:            { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE' },
  IRS:            { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: false, quotedAs: 'YIELD_LIKE' },
  TRS:            { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE' },
  XCS:            { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: false, quotedAs: 'YIELD_LIKE' },
  COMMODITY:      { assetClass: 'COMMODITY',  carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE' },
  OPTION:         { assetClass: 'DERIVATIVE', carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE' },
  FX_SPOT:        { assetClass: 'CASH_LIKE',  carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE' },
};

/** The one lookup. A caller that cannot find its question here should add a field, not a switch. */
export function assetModule(type: AssetType): AssetModule {
  return ASSET_REGISTRY[type];
}

export const assetClassOf = (type: AssetType): AssetClass => ASSET_REGISTRY[type].assetClass;
export const carriesCoupon = (type: AssetType): boolean => ASSET_REGISTRY[type].carriesCoupon;
export const isLendable = (type: AssetType): boolean => ASSET_REGISTRY[type].lendable;
export const hasCreditRisk = (type: AssetType): boolean => ASSET_REGISTRY[type].hasCreditRisk;

/**
 * §5-STRUCT step 4 — AND THE OTHER THREE TAXONOMIES.
 *
 * `AssetType` is not the only name this model has for "what kind of instrument is this". There are
 * four, for one real thing (§1.3):
 *
 *   `AssetType`                              11 members, named, in `domain/instruments.ts`
 *   `ItemizedHolding.instrumentType`          7 members, ANONYMOUS inline union in `domain/banking.ts`
 *   `EstateClaim.instrumentType`              5 members, ANONYMOUS inline union in `domain/estate.ts`
 *   `PrimaryOfferingInstrumentType`           3 members, named, in `domain/primary-market.ts`
 *
 * And they disagree: a government bond is `SOV_BOND` in one and `GOV_BOND` in another, while
 * `COMMERCIAL_PAPER`, `PE_FUND_INTEREST`, `ETF_SHARE` and `BANK_FACILITY` each exist in some and
 * not others. Two of the four have no name at all, so nothing can even be counted against them.
 *
 * The union below is the reconciliation — every member any of the four can hold — and the map gives
 * each one an asset class. It is deliberately a superset rather than a replacement: replacing them
 * means touching every holding, claim and offering in the engine, and that is a migration, not a
 * definition. What this buys today is that a reader summing a book by class asks ONE function, and
 * a new instrument gets its class in one place instead of four.
 */
export type HoldingType =
  | 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'SOV_BOND'
  | 'COMMERCIAL_PAPER' | 'PE_FUND_INTEREST' | 'ETF_SHARE' | 'BANK_FACILITY';

const HOLDING_CLASS: Record<HoldingType, AssetClass> = {
  EQUITY: 'EQUITY',
  ETF_SHARE: 'EQUITY',
  /** An ownership claim on another entity in the same sector. Its own class, because summing it
   *  into a sector aggregate double-counts the portfolio companies underneath it. */
  PE_FUND_INTEREST: 'EQUITY',
  CORP_BOND: 'CREDIT',
  /** CP: an issuer's short paper is corporate credit like its bonds, whatever book prices it. */
  COMMERCIAL_PAPER: 'CREDIT',
  LEVERAGED_LOAN: 'CREDIT',
  BANK_FACILITY: 'CREDIT',
  GOV_BOND: 'SOVEREIGN',
  SOV_BOND: 'SOVEREIGN',
};

export const holdingClassOf = (type: string): AssetClass | undefined =>
  HOLDING_CLASS[type as HoldingType];

/**
 * THE OTHER THREE TAXONOMIES, DERIVED FROM THE SUPERSET (step 4's first migration slice).
 * Each was an inline union spelled out where its struct lives — two with no name at all, so
 * nothing could be counted against them and a new member joined one and silently missed the
 * others. They are Exclude/Extract views of `HoldingType` now: one superset owns the members,
 * the compiler connects all four, and a kind added to the superset must be placed in (or
 * excluded from) each view deliberately.
 */
/** What the institutional register can hold. No SOV_BOND (the register's sovereign rows carry
 *  GOV_BOND) and no BANK_FACILITY (a facility is a bank-book loan, never a register position). */
export type ItemizedHoldingType = Exclude<HoldingType, 'SOV_BOND' | 'BANK_FACILITY'>;
/** What an estate owes claims against: the corporate capital structure. A sovereign cannot file,
 *  and claims on vehicles resolve at the vehicle, not in a corporate workout. */
export type EstateClaimType =
  Exclude<HoldingType, 'SOV_BOND' | 'GOV_BOND' | 'PE_FUND_INTEREST' | 'ETF_SHARE'>;
/** What the primary market can bring to market (sovereign issuance has its own calendar). */
export type PrimaryOfferingType = Extract<HoldingType, 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY'>;

/** True for the ownership claims that must NOT be summed into a sector's holdings of others. */
export const isIntraSectorClaim = (type: string): boolean => type === 'PE_FUND_INTEREST';

/** Hedged under a fixed-income FX mandate (fx-hedging): the bond-book classes a real
 *  liability-matcher's currency policy covers. CP is excluded — 13-week paper's FX exposure
 *  dies with the paper. */
const HOLDING_HEDGED_AS_FIXED_INCOME: Record<HoldingType, boolean> = {
  EQUITY: false, ETF_SHARE: false, PE_FUND_INTEREST: false, COMMERCIAL_PAPER: false,
  BANK_FACILITY: false, CORP_BOND: true, LEVERAGED_LOAN: true, GOV_BOND: true, SOV_BOND: true,
};
export const hedgedAsFixedIncome = (type: string): boolean =>
  HOLDING_HEDGED_AS_FIXED_INCOME[type as HoldingType] ?? false;

/** Carries fixed-RATE duration a swap can substitute for (07g's receiver gap): fixed-coupon
 *  paper only — a leveraged loan floats and commercial paper is too short to count. */
const HOLDING_CARRIES_RATE_DURATION: Record<HoldingType, boolean> = {
  EQUITY: false, ETF_SHARE: false, PE_FUND_INTEREST: false, COMMERCIAL_PAPER: false,
  BANK_FACILITY: false, LEVERAGED_LOAN: false, CORP_BOND: true, GOV_BOND: true, SOV_BOND: true,
};
export const carriesRateDuration = (type: string): boolean =>
  HOLDING_CARRIES_RATE_DURATION[type as HoldingType] ?? false;

/**
 * Claims on VEHICLES (fund shares, fund interests) rather than on issuers. The ownership views
 * measure who holds an ISSUER's paper; a claim on a fund is a layer above and summing it there
 * double-counts the portfolio underneath (§7.241 — this fact lived as an if-chain's silence).
 */
const HOLDING_IS_VEHICLE_CLAIM: Record<HoldingType, boolean> = {
  EQUITY: false, CORP_BOND: false, LEVERAGED_LOAN: false, GOV_BOND: false, SOV_BOND: false,
  COMMERCIAL_PAPER: false, BANK_FACILITY: false,
  PE_FUND_INTEREST: true, ETF_SHARE: true,
};
export const isVehicleClaim = (type: string): boolean =>
  HOLDING_IS_VEHICLE_CLAIM[type as HoldingType] ?? false;

/** The register's issuer-equity rows — the identity question three corporate-action sites ask
 *  (a holder's stake in one named issuer). Lives here so the fact is the registry's, not a
 *  literal comparison repeated per site (§7.283). */
export const isIssuerEquityRow = (h: { instrumentType?: string }): boolean =>
  h.instrumentType === 'EQUITY';

/** §5-WIRES W2 — the UNIT a holding of this kind moves in: a share count at a price (the register's
 *  `quantityShares`; the wire's quantity is shares, its price the cleared level), or FACE at par
 *  (the wire's quantity is dollars at 1). The one fact the ledger, the primary and a merger's
 *  exchange all need, owned here. */
export const heldInShares = (type: string): boolean =>
  type === 'EQUITY' || type === 'ETF_SHARE' || type === 'MMF_SHARE' || type === 'PE_FUND_INTEREST';

/** §5-WIRES W3 — the kind of paper a debt tranche IS: a bank facility on the lender's book, commercial
 *  paper, a floating-rate loan, or a fixed-rate bond. The tranche ledger's wires carry this kind
 *  (a tranche is the issuer's record of that paper, not a kind of its own). */
export const trancheKindOf = (t: { isBankFacility?: boolean; isCommercialPaper?: boolean; rateType: 'FIXED' | 'FLOATING' }):
  'BANK_FACILITY' | 'COMMERCIAL_PAPER' | 'LEVERAGED_LOAN' | 'CORP_BOND' =>
  t.isBankFacility ? 'BANK_FACILITY' : t.isCommercialPaper ? 'COMMERCIAL_PAPER' : t.rateType === 'FLOATING' ? 'LEVERAGED_LOAN' : 'CORP_BOND';
/** The kinds of paper a ladder row can be — what W3's ladder identity covers. */
export const isTrancheKind = (kind: string): boolean =>
  kind === 'BANK_FACILITY' || kind === 'COMMERCIAL_PAPER' || kind === 'LEVERAGED_LOAN' || kind === 'CORP_BOND';
