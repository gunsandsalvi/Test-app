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
}

export const INSTITUTION_PROFILES: Record<InstitutionalEntityType, InstitutionProfile> = {
  INSURER:           { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE' },
  ASSET_MANAGER:     { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE' },
  PENSION_FUND:      { picksOwnNames: false, investsInEtfs: true,  leverage: 'NONE' },
  HEDGE_FUND:        { picksOwnNames: true,  investsInEtfs: true,  leverage: 'PRIME_BROKERAGE' },
  PRIVATE_EQUITY:    { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE' },
  MONEY_MARKET_FUND: { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE' },
  ETF:               { picksOwnNames: false, investsInEtfs: false, leverage: 'NONE' },
};

export const institutionProfile = (t: InstitutionalEntityType): InstitutionProfile =>
  INSTITUTION_PROFILES[t];
