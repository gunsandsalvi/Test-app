/**
 * §3.26b-i — DWELLINGS EXIST: the owner-occupied stock is UNITS with an owner.
 *
 * The stock was `population / 2.5 × ownershipRate × medianHomePrice`, computed identically in two
 * places, and the ownership rate was a constant written once at the seed: the number of dwellings
 * moved only when the population did, and the houses built this week did not exist next week.
 * The register is `HousingMarket.ownerOccupiedUnits` — the household sector's dwellings, in units,
 * seeded once and thereafter moved only by what changes hands (a HOUSE wire, `ledger/
 * dwelling-ledger.ts`). The two numbers the model used to carry are READS of it here: the
 * ownership rate against the households there are, and the stock's value at this week's price.
 */
import { AVERAGE_HOUSEHOLD_SIZE } from './region-macro';
import type { RegionId } from './geography';

/** The households a population is: one owner of the division the housing reads share. */
export const householdsCountOf = (population: number): number =>
  Math.max(1, Math.max(0, population) / AVERAGE_HOUSEHOLD_SIZE);

/** The owner-occupier share of households — a READ of the register, never a rate that is written. */
export const ownershipRateOf = (hm: { ownerOccupiedUnits: number }, population: number): number =>
  Math.max(0, hm.ownerOccupiedUnits) / householdsCountOf(population);

/** What the household sector's dwellings are worth at this week's cleared price. */
export const housingStockValueLocal = (hm: { ownerOccupiedUnits: number; medianHomePriceLocal: number }): number =>
  Math.max(0, hm.ownerOccupiedUnits) * Math.max(0, hm.medianHomePriceLocal);

/** The asset a HOUSE wire names: a region's dwellings (A1.a — location is the identity there is). */
export const dwellingAssetOf = (region: RegionId): string => `DWELLING:${region}`;
export const DWELLING_ASSET_PREFIX = 'DWELLING:';
