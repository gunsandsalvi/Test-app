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

/**
 * §3.13-BOOK (e) — THE ONE KIND VOCABULARY. Four taxonomies said what kind of instrument a thing
 * was — the player's `AssetType`, the register's holding union, the estate's claim union, the
 * primary market's offering union — and then the wire's `AssetKind` and the index's
 * `InstrumentKind` beside them, disagreeing on whether a government bond is `SOV_BOND` or
 * `GOV_BOND` and on which of them a fund share or a bank facility even belonged to. This is the
 * list, and every other union in the model is an `Extract` or `Exclude` view of it: the register's
 * kinds, the seven book kinds the adapters mint an id for and clear, and the player's two classes
 * that have no engine market yet. The registry below answers every question for every member.
 */
export type InstrumentKind =
  // What the register holds.
  | 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'COMMERCIAL_PAPER' | 'BANK_FACILITY'
  | 'ETF_SHARE' | 'MMF_SHARE' | 'PE_FUND_INTEREST'
  // The books the adapters clear (§3.13-BOOK dII): nobody issues them, nobody holds them.
  | 'IRS' | 'CDS' | 'FX_SPOT' | 'XCS' | 'COMMODITY_FUTURE' | 'REPO' | 'SBL'
  // The player's two classes with no engine market behind them yet.
  | 'OPTION' | 'TRS'
  // §3.13-BOOK f3: a firm's input inventory — a good, on its own book, in the good's own units.
  | 'GOOD';

/** Where an instrument sits when a book is summed by class. */
export type AssetClass = 'EQUITY' | 'CREDIT' | 'SOVEREIGN' | 'DERIVATIVE' | 'COMMODITY' | 'CASH_LIKE' | 'GOODS';

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
  /**
   * WHAT A QUANTITY OF IT IS COUNTED IN. Rule 9 says periodicity and the unit of meaning are part
   * of a number; this is that rule applied to the quantity. A position is `units` of an
   * instrument and its value is `units × price` — so a kind that cannot say what its units ARE
   * has no honest way to be valued, and every such kind ended up storing a dollar total instead
   * and losing the price that made it.
   */
  readonly countedIn: UnitOfMeasure;
  /** A kind of paper a ladder row can be — the tranche ledger's wires carry it (W3). */
  readonly ladderPaper: boolean;
  /** A claim on a VEHICLE (a fund's shares, a fund interest) rather than on an issuer: the
   *  ownership views must not sum it into an issuer's paper, or the portfolio underneath is
   *  counted twice (§7.241). */
  readonly vehicleClaim: boolean;
  /** Hedged under a fixed-income FX mandate (fx-hedging): the bond-book classes a real
   *  liability-matcher's currency policy covers. CP is excluded — 13-week paper's FX exposure
   *  dies with the paper. */
  readonly hedgedAsFixedIncome: boolean;
  /** Carries fixed-RATE duration a swap can substitute for (07g's receiver gap): fixed-coupon
   *  paper only — a leveraged loan floats and commercial paper is too short to count. */
  readonly carriesRateDuration: boolean;
}

/**
 * The units a position can be counted in. Money is the degenerate one — a unit of money is a unit
 * of money, so its price is 1 BY DEFINITION and it is the only place in the tree a hard-coded 1
 * belongs.
 *
 * §3.13-BOOK (dI): a unit carries NO CURRENCY. `PAR_USD` said a bond's face was in dollars and
 * `USD` said money was; which money an instrument is denominated in is a column of the instrument
 * index (`engine2/instruments.ts:instrumentCurrencyOf`), read beside the unit, never folded into
 * it — a euro bond's face is a par unit like any other's.
 */
export type UnitOfMeasure =
  /** One unit of face: what a bond or a loan is a claim on, in the instrument's own money. Its PRICE is per unit of face. */
  | 'PAR'
  /** A share of a company or a fund. */
  | 'SHARES'
  /** A physical unit of a good — the sub-unit registry's own unit. */
  | 'GOODS_UNITS'
  /** One contract of a derivative class. */
  | 'CONTRACTS'
  /** A unit of money, whose price is one by definition; the money is the instrument's. */
  | 'MONEY';

/**
 * ONE LINE PER KIND. A new asset type is a row here; every reader below keeps working, and any
 * reader that genuinely needs new behaviour gets it by adding a field to `AssetModule`, which the
 * compiler then demands for every existing kind. That is the property a string tag cannot have.
 */
export const ASSET_REGISTRY: Record<InstrumentKind, AssetModule> = {
  EQUITY:           { assetClass: 'EQUITY',     carriesCoupon: false, lendable: true,  hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'SHARES',      ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  CORP_BOND:        { assetClass: 'CREDIT',     carriesCoupon: true,  lendable: true,  hasCreditRisk: true,  quotedAs: 'PRICE',       countedIn: 'PAR',         ladderPaper: true,  vehicleClaim: false, hedgedAsFixedIncome: true,  carriesRateDuration: true },
  LEVERAGED_LOAN:   { assetClass: 'CREDIT',     carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'PRICE',       countedIn: 'PAR',         ladderPaper: true,  vehicleClaim: false, hedgedAsFixedIncome: true,  carriesRateDuration: false },
  GOV_BOND:         { assetClass: 'SOVEREIGN',  carriesCoupon: true,  lendable: true,  hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'PAR',         ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: true,  carriesRateDuration: true },
  /** CP: an issuer's short paper is corporate credit like its bonds, whatever book prices it. */
  COMMERCIAL_PAPER: { assetClass: 'CREDIT',     carriesCoupon: false, lendable: true,  hasCreditRisk: true,  quotedAs: 'PRICE',       countedIn: 'PAR',         ladderPaper: true,  vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  /** A facility is a bank-book loan on the lender's ladder row, never a register position. */
  BANK_FACILITY:    { assetClass: 'CREDIT',     carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'YIELD_LIKE',  countedIn: 'PAR',         ladderPaper: true,  vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  ETF_SHARE:        { assetClass: 'EQUITY',     carriesCoupon: false, lendable: true,  hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'SHARES',      ladderPaper: false, vehicleClaim: true,  hedgedAsFixedIncome: false, carriesRateDuration: false },
  MMF_SHARE:        { assetClass: 'CASH_LIKE',  carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'SHARES',      ladderPaper: false, vehicleClaim: true,  hedgedAsFixedIncome: false, carriesRateDuration: false },
  /** An ownership claim on another entity in the same sector: summing it into a sector aggregate
   *  double-counts the portfolio companies underneath it (`isIntraSectorClaim`). */
  PE_FUND_INTEREST: { assetClass: 'EQUITY',     carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'SHARES',      ladderPaper: false, vehicleClaim: true,  hedgedAsFixedIncome: false, carriesRateDuration: false },
  IRS:              { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: false, quotedAs: 'YIELD_LIKE',  countedIn: 'CONTRACTS',   ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  CDS:              { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE', countedIn: 'CONTRACTS',   ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  FX_SPOT:          { assetClass: 'CASH_LIKE',  carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'MONEY',       ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  XCS:              { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: false, quotedAs: 'YIELD_LIKE',  countedIn: 'CONTRACTS',   ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  COMMODITY_FUTURE: { assetClass: 'COMMODITY',  carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'GOODS_UNITS', ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  /** A repo is money lent against paper: its size is cash and its price a rate. */
  REPO:             { assetClass: 'CASH_LIKE',  carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'YIELD_LIKE',  countedIn: 'MONEY',       ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  /** The stock-borrow book: shares out on loan, priced as a fee. */
  SBL:              { assetClass: 'EQUITY',     carriesCoupon: false, lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE', countedIn: 'SHARES',      ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  OPTION:           { assetClass: 'DERIVATIVE', carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'CONTRACTS',   ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  TRS:              { assetClass: 'DERIVATIVE', carriesCoupon: true,  lendable: false, hasCreditRisk: true,  quotedAs: 'SPREAD_LIKE', countedIn: 'CONTRACTS',   ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
  GOOD:             { assetClass: 'GOODS',      carriesCoupon: false, lendable: false, hasCreditRisk: false, quotedAs: 'PRICE',       countedIn: 'GOODS_UNITS', ladderPaper: false, vehicleClaim: false, hedgedAsFixedIncome: false, carriesRateDuration: false },
};

/** The one lookup. A caller that cannot find its question here should add a field, not a switch. */
export function assetModule(type: InstrumentKind): AssetModule {
  return ASSET_REGISTRY[type];
}

export const assetClassOf = (type: InstrumentKind): AssetClass => ASSET_REGISTRY[type].assetClass;
export const carriesCoupon = (type: InstrumentKind): boolean => ASSET_REGISTRY[type].carriesCoupon;
export const isLendable = (type: InstrumentKind): boolean => ASSET_REGISTRY[type].lendable;
/** What a quantity of this kind is counted in — the other half of every price. */
export const countedIn = (type: InstrumentKind): UnitOfMeasure => ASSET_REGISTRY[type].countedIn;
export const hasCreditRisk = (type: InstrumentKind): boolean => ASSET_REGISTRY[type].hasCreditRisk;
/** The registry's row for a kind named by a string a store carries; `undefined` for a name that is
 *  no kind — the caller decides what an unknown means, never a silent class. */
const moduleOf = (type: string): AssetModule | undefined => ASSET_REGISTRY[type as InstrumentKind];

/**
 * §5-STRUCT step 4 / §3.13-BOOK (e) — THE VIEWS. `AssetType` used to be one of four disagreeing
 * lists (a government bond was `SOV_BOND` there and `GOV_BOND` on the register; `COMMODITY` there
 * and `COMMODITY_FUTURE` on the index); the register's, the estate's and the primary market's
 * unions were reconciled by a superset beside them rather than replaced. Every one of them is a
 * view of `InstrumentKind` now, so a kind added to the list must be placed in (or excluded from)
 * each view deliberately, and a name no view carries does not compile.
 */
/** What can sit on a register book or a ladder row — the wire's instrument kinds. */
export type HoldingType = Extract<InstrumentKind,
  'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'COMMERCIAL_PAPER' | 'BANK_FACILITY'
  | 'ETF_SHARE' | 'MMF_SHARE' | 'PE_FUND_INTEREST'>;
/** What the institutional register can hold. No BANK_FACILITY: a facility is a bank-book loan on
 *  the lender's ladder row, never a register position. */
export type ItemizedHoldingType = Exclude<HoldingType, 'BANK_FACILITY'>;
/** What an estate owes claims against: the corporate capital structure. A sovereign cannot file,
 *  and claims on vehicles resolve at the vehicle, not in a corporate workout. */
export type EstateClaimType = Exclude<HoldingType, 'GOV_BOND' | 'PE_FUND_INTEREST' | 'ETF_SHARE' | 'MMF_SHARE'>;
/** What the primary market can bring to market (sovereign issuance has its own calendar). */
export type PrimaryOfferingType = Extract<HoldingType, 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY'>;

/** Where a kind a store names sits when a book is summed by class; `undefined` for a name that is
 *  no kind. */
export const holdingClassOf = (type: string): AssetClass | undefined => moduleOf(type)?.assetClass;

/** True for the ownership claims that must NOT be summed into a sector's holdings of others. */
export const isIntraSectorClaim = (type: string): boolean => type === 'PE_FUND_INTEREST';

export const hedgedAsFixedIncome = (type: string): boolean => moduleOf(type)?.hedgedAsFixedIncome ?? false;
export const carriesRateDuration = (type: string): boolean => moduleOf(type)?.carriesRateDuration ?? false;
export const isVehicleClaim = (type: string): boolean => moduleOf(type)?.vehicleClaim ?? false;

/** The register's issuer-equity rows — the identity question three corporate-action sites ask
 *  (a holder's stake in one named issuer). Lives here so the fact is the registry's, not a
 *  literal comparison repeated per site (§7.283). */
export const isIssuerEquityRow = (h: { instrumentType?: string }): boolean =>
  h.instrumentType === 'EQUITY';

/** §5-WIRES W2 — the UNIT a holding of this kind moves in: a share count at a price (the register's
 *  `quantityShares`; the wire's quantity is shares, its price the cleared level), or FACE at par
 *  (the wire's quantity is dollars at 1). The one fact the ledger, the primary and a merger's
 *  exchange all need, owned here. */
export const heldInShares = (type: string): boolean => moduleOf(type)?.countedIn === 'SHARES';

/** §5-WIRES W3 — the kind of paper a debt tranche IS: a bank facility on the lender's book, commercial
 *  paper, a floating-rate loan, or a fixed-rate bond. The tranche ledger's wires carry this kind
 *  (a tranche is the issuer's record of that paper, not a kind of its own). */
export const trancheKindOf = (t: { isBankFacility?: boolean; isCommercialPaper?: boolean; rateType: 'FIXED' | 'FLOATING' }):
  'BANK_FACILITY' | 'COMMERCIAL_PAPER' | 'LEVERAGED_LOAN' | 'CORP_BOND' =>
  t.isBankFacility ? 'BANK_FACILITY' : t.isCommercialPaper ? 'COMMERCIAL_PAPER' : t.rateType === 'FLOATING' ? 'LEVERAGED_LOAN' : 'CORP_BOND';
/** The kinds of paper a ladder row can be — what W3's ladder identity covers. */
export const isTrancheKind = (kind: string): boolean => moduleOf(kind)?.ladderPaper ?? false;
