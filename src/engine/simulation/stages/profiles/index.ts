/** The profile registry — one line per kind (rule 17). */

import { ProfileModule } from './types';
import { bankProfile } from './bank';
import { insurerProfile } from './insurer';
import { assetManagerProfile } from './asset-manager';
import { carrierProfile } from './carrier';

export const PROFILE_REGISTRY: Record<string, ProfileModule> = {
  BANK: bankProfile,
  INSURER: insurerProfile,
  ASSET_MANAGER: assetManagerProfile,
  CARRIER: carrierProfile,
};

export { profileKeyOf } from './types';
export type { ProfileInput, ProfilePnl, ProfileModule } from './types';
