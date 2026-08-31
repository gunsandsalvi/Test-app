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

import { InstitutionalEntityType } from './institutions';

export interface InstitutionProfile {
  /** Picks names itself, so an index overlay that averages them away adds nothing it wants. */
  readonly picksOwnNames: boolean;
  /** May hold ETF shares as a portfolio position (a fund does not buy funds of itself). */
  readonly investsInEtfs: boolean;
  /** Where this kind's borrowing allowance comes from. */
  readonly leverage: 'NONE' | 'PRIME_BROKERAGE';
  /** Long-dated liabilities force asset-liability matching: this kind receives fixed in the swap
   *  book and hedges its foreign FIXED-INCOME book at the mandate ratio (equity hedging is the
   *  separate two-axis rule in domain/fx-hedging.ts). */
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
}

export const INSTITUTION_PROFILES: Record<InstitutionalEntityType, InstitutionProfile> = {
  INSURER:           { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: true,  beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.70, preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 0.08, sellsCdsProtection: false },
  ASSET_MANAGER:     { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.40, preferredCreditDurationYears: 4.0, subInvestmentGradeSizeFactor: 2.0,  sellsCdsProtection: true  },
  PENSION_FUND:      { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE',            liabilityDriven: true,  beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0.75, preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 0.10, sellsCdsProtection: false },
  HEDGE_FUND:        { picksOwnNames: true,  investsInEtfs: true,  leverage: 'PRIME_BROKERAGE', liabilityDriven: false, beneficiariesAreHouseholds: true,  sovereignDurationMandate: true,  sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: true  },
  PRIVATE_EQUITY:    { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: true,  sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false },
  MONEY_MARKET_FUND: { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: false, sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false },
  ETF:               { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE',            liabilityDriven: false, beneficiariesAreHouseholds: false, sovereignDurationMandate: false, sovereignCoreShare: 0,    preferredCreditDurationYears: 6.0, subInvestmentGradeSizeFactor: 1.0,  sellsCdsProtection: false },
};

export const institutionProfile = (t: InstitutionalEntityType): InstitutionProfile =>
  INSTITUTION_PROFILES[t];
