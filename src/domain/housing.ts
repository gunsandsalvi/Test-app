/**
 * §3.26b-i — DWELLINGS EXIST: the owner-occupied stock is UNITS with an owner.
 *
 * The stock was `population / 2.5 × ownershipRate × medianHomePrice`, computed identically in two
 * places, and the ownership rate was a constant written once at the seed: the number of dwellings
 * moved only when the population did, and the houses built this week did not exist next week.
 * The register was `HousingMarket.ownerOccupiedUnits`, seeded once and moved only by what changes
 * hands. §3.13-BOOK g-i put it ON THE REGISTER: the household sector's dwellings are a row of kind
 * DWELLING on its own book, in units, whose lots are the houses at the price each was bought at —
 * one writer (`ledger/dwelling-ledger.ts:moveDwellings`, a wire and the row in one operation)
 * and one read (`dwellingUnitsOf`). The two numbers the model used to carry are reads of that
 * read: the ownership rate against the households there are, and the stock's value at this
 * week's price.
 */
import { AVERAGE_HOUSEHOLD_SIZE } from './region-macro';
import type { RegionId } from './geography';
import { asInstrumentId, type InstrumentId } from './ids';

/** The households a population is: one owner of the division the housing reads share. */
export const householdsCountOf = (population: number): number =>
  Math.max(1, Math.max(0, population) / AVERAGE_HOUSEHOLD_SIZE);

/** The owner-occupier share of households — a READ of the register, never a rate that is written. */
export const ownershipRateOf = (dwellingUnits: number, population: number): number =>
  Math.max(0, dwellingUnits) / householdsCountOf(population);

/** What the household sector's dwellings are worth at this week's cleared price. */
export const housingStockValueLocal = (dwellingUnits: number, medianHomePriceLocal: number): number =>
  Math.max(0, dwellingUnits) * Math.max(0, medianHomePriceLocal);

/** The instrument a region's dwellings are: one asset per region, keyed by location (A1.a —
 *  location is the identity there is), on the household sector's book. */
export const DWELLING_ASSET_PREFIX = 'DWELLING:';
export const dwellingInstrumentId = (region: RegionId): InstrumentId => asInstrumentId(`${DWELLING_ASSET_PREFIX}${region}`);
