/**
 * INDEXES — what an index fund tracks, defined as a RULE over cleared prices rather than a list.
 *
 * An index here is not a number someone maintains. It is a membership rule, a weighting rule, and
 * a rebalance calendar; run them over the market that actually exists this week and you get the
 * constituents, the weights and the level. Nothing about an index is stated except the rule.
 *
 * Two consequences the model needs and did not have:
 *   - **Inclusion is an event.** Membership is frozen between quarterly rebalances, so a company
 *     that lists, is promoted from small to large cap, or is taken private moves in or out on a
 *     known date, and the funds tracking it have to trade. That is why index inclusion moves a
 *     price in reality, and it is not expressible if membership is recomputed continuously.
 *   - **The large/small boundary is an outcome.** Large cap is the top share of AGGREGATE market
 *     cap, not a fixed count, so the line between the tiers moves when prices move and a company
 *     is promoted or relegated by its own performance rather than by a rank someone assigned.
 */

import { RegionId, REGION_IDS } from './geography';

export type IndexAssetClass = 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN';

export type IndexTier =
  /** Every eligible listed name in the scope. */
  | 'ALL_CAP'
  /** The names making up the top share of aggregate market cap. */
  | 'LARGE_CAP'
  /** The remainder — everything the large-cap cut leaves behind. */
  | 'SMALL_CAP'
  /** Investment-grade corporate bonds. */
  | 'IG'
  /** Sub-investment-grade corporate bonds. */
  | 'HY'
  /** Broadly syndicated floating-rate loans. */
  | 'LEV_LOAN';

export interface IndexDefinition {
  id: string;
  name: string;
  assetClass: IndexAssetClass;
  tier: IndexTier;
  /** `undefined` = global: the rule runs across every region at once. */
  region?: RegionId;
}

/**
 * The share of aggregate market cap that counts as LARGE. The rest is SMALL by construction, so
 * the two tiers partition ALL_CAP exactly. This is a published index METHODOLOGY — a rule an
 * index provider writes down — which is the kind of primitive rule 4 allows, not an observed
 * market outcome.
 */
export const LARGE_CAP_CUMULATIVE_SHARE = 0.70;

/** Structural events happen quarterly in this simulation; an index rebalance is one of them. */
export const INDEX_REBALANCE_WEEKS = 13;

/** The level every index starts at, so any two are comparable from inception. */
export const INDEX_BASE_LEVEL = 100;

const REGIONS = REGION_IDS;

/**
 * Every index this world publishes: three equity tiers per region and globally, and the three
 * credit books per region. Generated from the rule rather than listed, so adding a region adds
 * its indexes.
 */
export const INDEX_DEFINITIONS: IndexDefinition[] = [
  ...REGIONS.flatMap((region): IndexDefinition[] => [
    { id: `${region}_EQ_ALL`, name: `${region} All Cap`, assetClass: 'EQUITY', tier: 'ALL_CAP', region },
    { id: `${region}_EQ_LARGE`, name: `${region} Large Cap`, assetClass: 'EQUITY', tier: 'LARGE_CAP', region },
    { id: `${region}_EQ_SMALL`, name: `${region} Small Cap`, assetClass: 'EQUITY', tier: 'SMALL_CAP', region },
    { id: `${region}_IG`, name: `${region} Investment Grade`, assetClass: 'CORP_BOND', tier: 'IG', region },
    { id: `${region}_HY`, name: `${region} High Yield`, assetClass: 'CORP_BOND', tier: 'HY', region },
    { id: `${region}_LL`, name: `${region} Leveraged Loan`, assetClass: 'LEVERAGED_LOAN', tier: 'LEV_LOAN', region },
  ]),
  { id: 'GLOBAL_EQ_ALL', name: 'Global All Cap', assetClass: 'EQUITY', tier: 'ALL_CAP' },
  { id: 'GLOBAL_EQ_LARGE', name: 'Global Large Cap', assetClass: 'EQUITY', tier: 'LARGE_CAP' },
  { id: 'GLOBAL_EQ_SMALL', name: 'Global Small Cap', assetClass: 'EQUITY', tier: 'SMALL_CAP' },
];

/** One constituent's standing in an index: what the fund must hold, and in what proportion. */
export interface IndexConstituent {
  /** Company id — the instrument id in every clearing book. */
  instrumentId: string;
  /** Share of the index, 0..1, fixed at the last rebalance. */
  weight: number;
}

export interface MarketIndex {
  id: string;
  /** Constituents and weights as of the last rebalance — deliberately NOT recomputed weekly. */
  constituents: IndexConstituent[];
  /** Week the membership above was struck. */
  lastRebalanceWeek: number;
  /** Level, base 100 at inception, moved weekly by the constituents' own cleared prices. */
  level: number;
  /** Aggregate value of the constituents at this week's cleared prices — the fund's benchmark. */
  totalValueUSD: number;
}
