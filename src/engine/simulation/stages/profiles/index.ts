/** The profile registry — one line per kind (rule 17). */

import { ProfileModule } from './types';
import { FinancialStatementProfile } from '../../../../domain/company';
import { bankProfile } from './bank';
import { insurerProfile } from './insurer';
import { assetManagerProfile } from './asset-manager';
import { carrierProfile } from './carrier';

/**
 * Keyed over the WHOLE union so a new profile member fails to compile until a row here names
 * it (§7.241 found `'REIT'` was a legal member with no module, silently booking as a goods
 * firm). A `null` row is a declared decision — the stage-08 inline P&L serves that kind — not
 * an omission the compiler cannot see.
 */
export const PROFILE_REGISTRY: Record<FinancialStatementProfile, ProfileModule | null> = {
  BANK: bankProfile,
  INSURER: insurerProfile,
  ASSET_MANAGER: assetManagerProfile,
  CARRIER: carrierProfile,
  STANDARD_OPERATING: null,
  // §7.241: a REIT has no module and books as an ordinary operating firm today. That gap is now
  // visible here instead of silent; building the module is IND-family work, not a registry edit.
  REIT: null,
};

export { profileKeyOf } from './types';
export type { ProfileInput, ProfilePnl, ProfileModule } from './types';
