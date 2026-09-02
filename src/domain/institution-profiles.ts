/**
 * THE INSTITUTION-KIND REGISTRY (§7.241) — `profiles/index.ts`'s "one line per kind", one level
 * up. Behaviour keyed on `entityType` used to live as inline switches across 21 files (64 sites,
 * §7.229), so a new kind — and §6.1's manager/vehicle row says new kinds ARE wanted — had to be
 * taught to every one, and a missed site was a silent wrong default: the new fund would index
 * like a pension and lever like an insurer. A fact about a kind is a row here; the compiler
 * demands the row for every kind, and a new member fails to build until its facts are stated.
 *
 * Facts only, migrated site by site under the literal-comparison ratchet. Genuinely per-kind
 * BEHAVIOUR (a method, not a flag) earns a function field when the first one migrates.
 */

import type { InstitutionalEntityType, InstitutionalEntity, AssetAllocationTarget, HedgeFundStrategy } from './institutions';

export interface InstitutionProfile {
  /** Picks names itself, so an index overlay that averages them away adds nothing it wants. */
  readonly picksOwnNames: boolean;
  /** May hold ETF shares as a portfolio position (a fund does not buy funds of itself). */
  readonly investsInEtfs: boolean;
  /** Where this kind's borrowing allowance comes from. */
  readonly leverage: 'NONE' | 'PRIME_BROKERAGE';
  /** Long-dated liabilities force asset-liability matching: this kind receives fixed in the swap
   *  book and hedges its foreign FIXED-INCOME book at the mandate ratio (equity hedging is the
   *  separate two-axis rule in domain/derivatives/classes/fx-forward.ts). */
  readonly liabilityDriven: boolean;
  /** Its beneficiaries are households — its liability is a household claim, so the household
   *  balance sheet attributes its net assets. Everything else either has a named holder already
   *  or is somebody's equity rather than somebody's claim. */
  readonly beneficiariesAreHouseholds: boolean;
  /** May its mandate carry sovereign DURATION at all? A $1-NAV fund and an equity/credit wrapper
   *  cannot (§7.72's lesson: with bottom-up targets the MMF bid its full government allocation
   *  into the BOND auction and broke its NAV in four regions). */
  readonly sovereignDurationMandate: boolean;
  /** Share of its policy government-bond allocation held at ANY yield, because the liabilities
   *  require the match; an asset manager runs a benchmark it can deviate from but not abandon;
   *  a hedge fund or sponsor has no such obligation. */
  readonly sovereignCoreShare: number;
  /** Duration preference in the CREDIT book: liability-matchers favor longer paper; an asset
   *  manager runs closer to benchmark-neutral. */
  readonly preferredCreditDurationYears: number;
  /** Sub-investment-grade sleeve, per dollar of structural corporate share. Regulated books are
   *  not IG-only — what keeps them structurally light in high yield is the capital charge, not a
   *  ban (a ban legislated the HY buyer base out of existence and ran the auction to its search
   *  bound). Above 1 for asset managers ON PURPOSE: the dedicated high-yield/loan fund complex
   *  makes their HY appetite a multiple of their IG appetite — without it the HY float exceeded
   *  its whole buyer base and every name cleared at saturation. */
  readonly subInvestmentGradeSizeFactor: number;
  /** Writes CDS protection: an unfunded long is exactly the trade a credit book wants. */
  readonly sellsCdsProtection: boolean;
  /** The kind's policy allocation (rule 5: a long-term guide, never the week's trade). A hedge
   *  fund's is its STRATEGY's (below); corpBondPct + loanPct is the kind's corporate-credit
   *  appetite. A money fund's whole book is the cash sleeve; an ETF's target is its index and
   *  these weights are never read for it; a PE fund holds companies, not securities. */
  readonly targets: AssetAllocationTarget;
  /** §7.347 — the first per-kind BEHAVIOUR field: the hurdle a liability-driven kind derives
   *  from its own liabilities (an insurer's cost of float, a pension's benefit need), or
   *  undefined when the flows have not been struck yet and the stated hurdle stands. */
  readonly liabilityHurdle?: (entity: InstitutionalEntity, statedHurdle: number) => number | undefined;
}

/** An insurer's hurdle is what its float costs it: the underwriting result over the reserves. */
function insurerHurdle(entity: InstitutionalEntity, stated: number): number | undefined {
  const liabilityUSD = entity.beneficiaryLiabilityUSD ?? 0;
  if (!(liabilityUSD > 0) || entity.lastAnnualUnderwritingResultUSD === undefined) return undefined;
  const costOfFloatAnnual = -entity.lastAnnualUnderwritingResultUSD / liabilityUSD;
  return Math.max(0.02, Math.min(0.30, stated + costOfFloatAnnual));
}
/** A pension's hurdle is the return its benefit outflow needs on the assets it has, scaled by
 *  how far funded it is. */
function pensionHurdle(entity: InstitutionalEntity): number | undefined {
  const liabilityUSD = entity.beneficiaryLiabilityUSD ?? 0;
  const benefitOutflowAnnual = entity.lastAnnualBenefitOutflowUSD ?? 0;
  if (!(liabilityUSD > 0) || !(benefitOutflowAnnual > 0)) return undefined;
  const fundedRatio = entity.totalAssetsUSD / liabilityUSD;
  const need = (benefitOutflowAnnual / Math.max(1, entity.totalAssetsUSD)) / Math.max(0.2, fundedRatio);
  return Math.max(0.02, Math.min(0.30, need));
}

export const INSTITUTION_PROFILES: Record<InstitutionalEntityType, InstitutionProfile> = {
  INSURER:           { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: true,  beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.70, preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 0.08, sellsCdsProtection: false, targets: { govBondPct: 0.50, corpBondPct: 0.32, loanPct: 0.03, equityPct: 0.10, cashPct: 0.05 }, liabilityHurdle: insurerHurdle },
  ASSET_MANAGER:     { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.40, preferredCreditDurationYears: 4.0, subInvestmentGradeSizeFactor: 2.0,  sellsCdsProtection: true , targets: { govBondPct: 0.10, corpBondPct: 0.12, loanPct: 0.08, equityPct: 0.65, cashPct: 0.05 } },
  PENSION_FUND:      { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: true,  beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.75, preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 0.10, sellsCdsProtection: false, targets: { govBondPct: 0.25, corpBondPct: 0.25, loanPct: 0.05, equityPct: 0.40, cashPct: 0.05 }, liabilityHurdle: pensionHurdle },
  HEDGE_FUND:        { picksOwnNames: true,  investsInEtfs: true,  leverage: 'PRIME_BROKERAGE', liabilityDriven: false, beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: true , targets: { govBondPct: 0.05, corpBondPct: 0.40, loanPct: 0.22, equityPct: 0.18, cashPct: 0.15 } },
  PRIVATE_EQUITY:    { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: true,  sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false, targets: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 } },
  MONEY_MARKET_FUND: { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: false, sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false, targets: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 } },
  ETF:               { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: false, sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false, targets: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 } },
};

export const institutionProfile = (t: InstitutionalEntityType): InstitutionProfile =>
  INSTITUTION_PROFILES[t];

/**
 * §7.347 — THE HEDGE-FUND STRATEGY REGISTRY. A strategy IS a book plus what it does with it;
 * the four things a stage used to ask with `hedgeFundStrategy === '…'` are facts here. Only the
 * four weights are stated primitives (rule 19's PREFERENCE kind, like every other kind's
 * mandate); the flags say which markets the book shows up in.
 */
export interface HedgeFundStrategyProfile {
  readonly targets: AssetAllocationTarget;
  /** How much more of one name than its size implies the book will take when paper is cheap
   *  enough to clear its hurdle — concentration IS the distressed strategy. Undefined = the
   *  ordinary overweight limit. */
  readonly convictionMultiple?: number;
  /** Prices credit off discounted expected RECOVERY rather than expected loss plus capital — the
   *  distressed book's second half; every other book is an ordinary relative-value buyer. */
  readonly pricesOffRecovery: boolean;
  /** Borrows stock to sell short (the securities-lending demand side). */
  readonly shortsEquity: boolean;
  /** Speculates in commodity futures, sized by the margin identity on its own capital. */
  readonly tradesCommodityFutures: boolean;
  /** Runs directional FX — the elastic side of an FX market. */
  readonly runsFxDirectional: boolean;
  /** Hedges the currency on its foreign equity; a macro book does not, the currency IS the trade. */
  readonly hedgesForeignEquity: boolean;
}

export const HEDGE_FUND_STRATEGY_PROFILES: Record<HedgeFundStrategy, HedgeFundStrategyProfile> = {
  // Rates and FX: a large liquid book against which to run directional risk, and the biggest
  // cash sleeve of the four, because its positions are margin and its dry powder is the point.
  GLOBAL_MACRO:      { targets: { govBondPct: 0.45, corpBondPct: 0.05, loanPct: 0,    equityPct: 0.20, cashPct: 0.30 }, pricesOffRecovery: false, shortsEquity: false, tradesCommodityFutures: true,  runsFxDirectional: true,  hedgesForeignEquity: false },
  LONG_SHORT_EQUITY: { targets: { govBondPct: 0.02, corpBondPct: 0.03, loanPct: 0,    equityPct: 0.80, cashPct: 0.15 }, pricesOffRecovery: false, shortsEquity: true,  tradesCommodityFutures: false, runsFxDirectional: false, hedgesForeignEquity: true  },
  LONG_SHORT_CREDIT: { targets: { govBondPct: 0.03, corpBondPct: 0.52, loanPct: 0.30, equityPct: 0,    cashPct: 0.15 }, pricesOffRecovery: false, shortsEquity: false, tradesCommodityFutures: false, runsFxDirectional: false, hedgesForeignEquity: true  },
  // The distressed book is the one that must be able to bid when everyone else is at their
  // limit, which is what its unusually large sleeve and its conviction size are for.
  DISTRESSED:        { targets: { govBondPct: 0,    corpBondPct: 0.40, loanPct: 0.35, equityPct: 0,    cashPct: 0.25 }, convictionMultiple: 4.0, pricesOffRecovery: true, shortsEquity: false, tradesCommodityFutures: false, runsFxDirectional: false, hedgesForeignEquity: true },
};

/** The strategy profile of a hedge fund; undefined for every other kind (or an unlabelled one). */
export function hedgeFundStrategyProfile(e: { entityType: InstitutionalEntityType; hedgeFundStrategy?: HedgeFundStrategy }): HedgeFundStrategyProfile | undefined {
  return e.entityType === 'HEDGE_FUND' && e.hedgeFundStrategy ? HEDGE_FUND_STRATEGY_PROFILES[e.hedgeFundStrategy] : undefined;
}

/** A kind's policy allocation — a hedge fund's is its strategy's. */
export function allocationTargetFor(role: InstitutionalEntityType, strategy?: HedgeFundStrategy): AssetAllocationTarget {
  return (role === 'HEDGE_FUND' && strategy ? HEDGE_FUND_STRATEGY_PROFILES[strategy].targets : INSTITUTION_PROFILES[role].targets);
}
