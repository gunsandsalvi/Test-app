/**
 * Stage 5: Generalized Unit Bidding & Contract Market
 *
 * For every industry sub-unit: settles existing supply contracts, then runs an open bid/offer
 * clearing auction for the residual (household/government aggregate demand plus corporate open
 * demand against supplier open offers), and probabilistically forms new long-term B2B supply
 * contracts from matched participants.
 *
 * XB3a — every sub-unit clears in FIVE books, not one: a single WORLD book that all four regions
 * bid and offer into, and one LOCAL book per region. What splits a participant between them is
 * `CATEGORY_TRADABILITY`, the continuous parameter the model already carried: a firm offers that
 * share of its output into the world and keeps the rest at home, and a buyer sources the same
 * share of its need abroad. Trade is then what it is in reality — a fill whose buyer and seller
 * sit in different regions — rather than a separate formula crediting a region a slice of another
 * region's demand.
 *
 * Production, inventory and the cash ledger are settled ONCE per firm per sub-unit against the
 * sum of its fills in both books. Splitting a firm across two auctions and letting each settle
 * its own inventory would have each write clobber the other (§7.5).
 */

import { GameState, Region, RegionId, UnitBid, UnitOffer, SupplyContract, Company } from '../../../types';
import { categoryPriceTier, householdBudgetReachMultiple, householdDemandLadder } from '../../../domain/industry';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../constants';
import { isStorable, purchaseKindOf, productionLeadWeeksOf, commissioningLeadWeeksOf, seasonalFactor } from '../../../domain/industry-registry';
import { pay, PartyRef } from './settlement';
import { CATEGORY_INPUT_REQUIREMENTS, CAPEX_SUPPLIER_WEIGHTS } from '../../../domain/market-microstructure';
import { channelMarginRate, shelfPriceUSD, DISTRIBUTION_SUBUNIT_ID } from '../../../domain/distribution';
import { subUnitSpecOf } from '../../../domain/industry-registry';
import { industryOfSubUnit, smePoolSubUnits, smePoolRecipeInputs, firmInputIntensities } from '../../../domain/industry-registry';
import { profileKeyOf } from './profiles';
import { isActiveCompany, getOutputInventoryUnits, getOutputInventoryUSD, InputLot } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { random, beginEntityScope, endEntityScope } from '../../rng';
import { capacityMixShares } from '../../../domain/sme-pool';
import { clearDoubleAuction, AuctionBid, AuctionOffer, AuctionFill } from './double-auction';
import { convertLocal, localToUsd, fromTable, snapshotFxToUsd, FxToUsd } from '../../../domain/currency';
import { laneKey, laneTransitWeeks } from '../../../domain/carrier';
import { laneDistanceNm } from '../../../domain/geography';
import { SourcingSplit } from './sourcing-intent';
import { chooseInvoiceRegion, invoiceCurrencyOf } from '../../../domain/invoice-currency';
import { paymentTermWeeks } from '../../../domain/trade-invoice';
import { computeAnnualDefaultProbability } from './shared-helpers';
import { getFxToUsd } from './06-fx-and-trade';
import { GOVERNMENT_BID_PRICE_TOLERANCE } from '../../../domain/government';
import { realizedAnnualVol } from '../../../domain/volatility';

export const MARKET_REGION_IDS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

// 1$ is 1$ Phase 3: a private-sector "company ID" for the auction — distinguishable from any
// real ticker so the post-clearing crediting step can tell it apart from a real company sale.
// XB3a qualifies it by region: four regions each run a MANUFACTURING segment, and in the world
// book they are four different counterparties bidding against each other.
const privateSegmentOfferId = (regionId: RegionId, industry: string) => `PRIVATE:${regionId}:${industry}`;
/**
 * Share of a buyer's real weekly input need it locks under a long-term contract when one forms;
 * the rest stays spot-purchased.
 *
 * RULE 4/13, OPEN: "real procurement splits roughly this way" is an observed outcome. How much a
 * buyer contracts is a DECISION against the risk it is hedging — supply reliability, price
 * volatility, its own inventory — and CHAIN makes exactly that decision real by sending
 * orders rather than demand upstream. Owner: CHAIN.
 */
const CONTRACTED_DEMAND_SHARE = 0.6;

/**
 * IND11 — how long a buyer tolerates a supplier that cannot deliver before it terminates.
 *
 * A quarter. It is a term of the contract rather than a behavioural dial: a cure period is what
 * a supply agreement actually contains, and the alternative — terminating on the first missed
 * week — would make every transient stockout fatal and every relationship meaningless.
 */
const CONTRACT_NON_PERFORMANCE_WEEKS = 13;

/**
 * IND11 — a contract at least this long is INDEXED to the market it was struck against.
 *
 * A year. Below it the parties live with the price they agreed; above it neither side will wear
 * an open-ended bet on inflation, which is why real long-term supply agreements carry an
 * escalation clause and short ones do not.
 */
const CONTRACT_INDEXATION_MIN_WEEKS = 52;

/**
 * IND14 — the floor under a supplier's sourcing weight.
 *
 * Not a rescue and not a band on the record itself, which is measured and unbounded: it is the
 * statement that a buyer who has never dealt with a firm cannot know it is unreliable, so
 * SOMEBODY tries it. Without it a firm that missed a quarter could never win another contract
 * from anyone, ever, and the model has no re-entry mechanism to bring it back (that is DYN's).
 */
const SUPPLIER_MIN_SOURCING_WEIGHT = 0.05;

/**
 * IND17 — the share of work in progress that the CUSTOMER funds.
 *
 * A contract term, in the same family as the cure period above: long-cycle supply agreements are
 * paid on progress because no supplier will carry a year of someone else's build on its own
 * balance sheet, and no buyer will hand over the whole price before anything exists. Which side
 * funds how much is negotiated, and 30% is the middle of it. A good made on demand has no work
 * in progress to fund, so it carries no deposit at all — the lead does that filtering, not a
 * category list.
 */
const PROGRESS_PAYMENT_SHARE = 0.30;

// 1$ is 1$ Phase 2: this company's real weekly need for inputSubUnitId, from the same literal
// recipe (CATEGORY_INPUT_REQUIREMENTS) that 08-company-fundamentals.ts uses to draw down input
// inventory — bidding to this real, recipe-derived need (instead of a generic revenue-share
// slice of aggregate corporate demand) is what makes what a company buys here actually match
// what it consumes there, rather than two independently-sized, unrelated numbers.
function computeRecipeInputNeedUSD(comp: Company, inputSubUnitId: string): number {
  // §7.122 step 4: a firm that sells no product still buys — a bank's premises, software and
  // professional services come from its profile's basket. One accessor for both cases, so a firm
  // cannot be charged for an input in stage 08 that it never bid for here (rule 14).
  const intensity = firmInputIntensities(comp.productLines, profileKeyOf(comp))[inputSubUnitId];
  if (!intensity) return 0;
  return (comp.annualRevenue / 52) * intensity;
}

/**
 * SETL-C: who a settlement key actually is. The goods auction has always known the pairing —
 * which buyer took which seller's lot — and stage 08 only ever saw each side's weekly total, so
 * the payment lost its counterparty on the way (§7.90's category C). This turns a key back into
 * the party that holds the money.
 */
function partyOfKey(key: string, regionId: RegionId, lookup: GlobalFirmLookup): PartyRef {
  const comp = lookup.byKey.get(key);
  if (comp) return { kind: 'COMPANY', ticker: comp.ticker };
  if (key.startsWith('HOUSEHOLD')) return { kind: 'HOUSEHOLD', region: regionId };
  if (key.startsWith('GOVERNMENT') || key.startsWith('GOV')) return { kind: 'GOVERNMENT', region: regionId };
  // SEG2a: a segment key is a real party now — its sales proceeds land on the pool's own book
  // instead of the boundary. The key embeds the segment's OWN region (it can sell into another
  // region's book), so parse it rather than trusting the market's origin.
  if (key.startsWith('PRIVATE:')) {
    const [, segRegion, industry] = key.split(':');
    return { kind: 'SEGMENT', region: segRegion as RegionId, industry };
  }
  // Seed suppliers are real sellers with no cash ledger of their own yet — named to the
  // boundary until a project gives them one.
  return { kind: 'UNMODELED', region: regionId };
}

function setOutputInventory(update: any, subUnitId: string, unitsHeld: number, unitPriceUSD: number) {
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  // IND1: a good that cannot be held is never held. Software is copied on demand and a building
  // is made where it stands — neither has a warehouse, so unsold capacity is capacity that went
  // unused, not stock. (It used to accumulate as inventory and decay like steel, §7.50.)
  const held = isStorable(subUnitId) ? unitsHeld : 0;
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: held, valueUSD: held * unitPriceUSD };
}

// 1$ is 1$ Phase 2/6: credit a real purchase onto the buyer's persisted input inventory as a
// NEW LOT — appended on top of whatever this same company already holds (and whatever it
// already bought this same week via a different subUnitId's auction pass or a different real
// seller), not merged into one blended average, since the whole point is to keep each real
// purchase's real counterparty and real price distinguishable (see domain/company.ts's
// InputLot doc comment) rather than collapsing them the moment they're credited.
function addInputInventory(update: any, baseComp: Company, subUnitId: string, sellerId: string, addedUnits: number, addedValueUSD: number, week: number) {
  if (addedUnits <= 0.0001) return;
  // IND1: only material that will be CONSUMED is inventory. A machine delivered is capital; a
  // general operating purchase is used and expensed. Writing all three as lots is what made a
  // third of the world's purchases immortal (§6's lot leak).
  const kind = purchaseKindOf(subUnitId);
  if (kind === 'CAPITAL_GOOD') {
    // IND13 — a capital good that has ARRIVED is not yet plant. It is installed and commissioned
    // first, so it lands as construction in progress with the week it enters service on it.
    if (!update.capexUnderConstruction) update.capexUnderConstruction = [];
    update.capexUnderConstruction.push({
      valueUSD: addedValueUSD,
      entersServiceWeek: week + commissioningLeadWeeksOf(subUnitId),
    });
    return;
  }
  if (kind === 'OPERATING') return;
  if (!update.inputInventoryBySubUnit) update.inputInventoryBySubUnit = {};
  // Copy the persisted lots ONCE on first touch, then push into the week-local array in place.
  // The old form rebuilt the whole array per lot — O(k²) copying for a buyer credited k lots in a
  // week, all of it garbage — for a list whose final contents and order are exactly these.
  let lots: InputLot[] | undefined = update.inputInventoryBySubUnit[subUnitId];
  if (!lots) {
    lots = [...(baseComp.inputInventoryBySubUnit?.[subUnitId] ?? [])];
    update.inputInventoryBySubUnit[subUnitId] = lots;
  }
  lots.push({ sellerId, unitsHeld: addedUnits, unitPriceUSD: addedValueUSD / addedUnits, acquiredWeek: week });
}

/** One week's lot in a production pipeline: what was started, and what it cost to start it. */
interface WipLot { units: number; valueUSD: number }

/**
 * IND10 — advance one product line's production pipeline by a week.
 *
 * A firm STARTS `startedUnits` this week at `startedCostUSD`, and what it has to SELL this week
 * is whatever it started `productionLeadWeeks` ago. Those are two different numbers the moment
 * anything changes, and the gap between them is the whole mechanism: demand arrives, output
 * cannot, and price moves instead. With a lead of zero the two collapse into one, which is what
 * every good in the model did before this existed.
 *
 * FIRST TOUCH SEEDS THE PIPELINE FULL. A firm that has never run this line is treated as already
 * in steady state — `lead` weeks of work in progress at this week's rate — rather than as one
 * that has just broken ground. The alternative is a year of zero output from every construction
 * firm at week one, which is an opening condition nobody chose and not a statement about
 * production time (§7.4: a stated table survives only until the mechanism has something in it).
 */
function advanceProductionPipeline(
  existing: WipLot[] | undefined,
  leadWeeks: number,
  startedUnits: number,
  startedCostUSD: number
): { arrivedUnits: number; arrivedValueUSD: number; queue: WipLot[] } {
  if (leadWeeks <= 0) {
    return { arrivedUnits: startedUnits, arrivedValueUSD: startedCostUSD, queue: [] };
  }
  const queue = existing
    ? existing.slice()
    : Array.from({ length: leadWeeks }, () => ({ units: startedUnits, valueUSD: startedCostUSD }));
  const arrived = queue.shift() ?? { units: 0, valueUSD: 0 };
  queue.push({ units: startedUnits, valueUSD: startedCostUSD });
  return { arrivedUnits: arrived.units, arrivedValueUSD: arrived.valueUSD, queue };
}

/**
 * Everything about a region's firms that does not change between one sub-unit's auction and the
 * next, computed once per region per week.
 *
 * Why this exists: every one of these lists used to be rebuilt inside each sub-unit's auction —
 * a full scan of the region's firms (and of each firm's product lines) per sub-unit, per region,
 * per week. At ~40 sub-units x 4 regions that is the same ~2,000-firm array walked hundreds of
 * times a week to answer questions whose answers were identical every time.
 *
 * The lists are read-only within a week: the auction mutates `companyUpdates`, never the firm
 * objects these index, so one build per region is correct as well as faster.
 */
interface RegionMarketIndex {
  activeFirms: Company[];
  /**
   * Firms that genuinely consume each recipe-input sub-unit. Built by walking each firm's own
   * product lines ONCE and recording the inputs its industry requires — the inverse of asking,
   * for every sub-unit market, which of the region's ~500 firms happen to need it. Same answer,
   * O(firms x lines) instead of O(sub-units x firms x lines).
   */
  recipeInputBuyersBySubUnit: Map<string, Company[]>;
  /** subUnitId -> the firms that produce it (built from one pass over every firm's lines). */
  suppliersBySubUnit: Map<string, Company[]>;
  /** Firms with real capex, the customer base for every capital-goods category. */
  capexBuyers: Company[];
}

/**
 * Counterparty lookups spanning EVERY region, not just one.
 *
 * XB3a made these global: a supply contract struck in the world book has a supplier in one
 * region and a customer in another, and settling it needs to find both. A per-region map would
 * silently drop the foreign leg — the contract would survive and transfer nothing.
 */
interface GlobalFirmLookup {
  byTicker: Map<string, Company>;
  byId: Map<string, Company>;
  /** SCALE: one probe for a key that may be a ticker OR an id (contracts store either).
   * Ids are inserted first and tickers after, so on any collision the ticker wins — exactly
   * the `byTicker.get(k) ?? byId.get(k)` resolution this replaces, at half the probes. */
  byKey: Map<string, Company>;
}

function buildMarketIndexes(ctx: WeeklyStepContext): {
  byRegion: Record<RegionId, RegionMarketIndex>;
  lookup: GlobalFirmLookup;
} {
  const byRegion = {} as Record<RegionId, RegionMarketIndex>;
  MARKET_REGION_IDS.forEach(r => {
    byRegion[r] = {
      activeFirms: [],
      recipeInputBuyersBySubUnit: new Map(),
      suppliersBySubUnit: new Map(),
      capexBuyers: [],
    };
  });
  const lookup: GlobalFirmLookup = { byTicker: new Map(), byId: new Map(), byKey: new Map() };

  // HC3: the goods market has never cared who owns a supplier's equity — public and private
  // firms bid and offer in the same real auction.
  const walk = (c: Company) => {
    if (!isActiveCompany(c)) return;
    const index = byRegion[c.region as RegionId];
    if (!index) return;
    lookup.byTicker.set(c.ticker, c);
    lookup.byId.set(c.id, c);
    if (!lookup.byTicker.has(c.id)) lookup.byKey.set(c.id, c);
    lookup.byKey.set(c.ticker, c);
    index.activeFirms.push(c);
    if ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0) > 0) index.capexBuyers.push(c);
    (c.productLines || []).forEach((l) => {
      const arr = index.suppliersBySubUnit.get(l.subUnitId);
      if (arr) arr.push(c); else index.suppliersBySubUnit.set(l.subUnitId, [c]);
    });
    // §7.122 step 4: registered as a BUYER from its own input basket — its products' recipes if
    // it makes anything, its profile's basket if it does not. Selling and buying were the same
    // field before, so a bank (correctly given no product line by IND-R2) bought nothing either.
    // A firm with two lines needing the same input is one buyer, not two: the need is summed by
    // computeRecipeInputNeedUSD when it bids.
    Object.keys(firmInputIntensities(c.productLines, profileKeyOf(c))).forEach(inputSubUnitId => {
      const buyers = index.recipeInputBuyersBySubUnit.get(inputSubUnitId);
      if (buyers) { if (buyers[buyers.length - 1] !== c) buyers.push(c); }
      else index.recipeInputBuyersBySubUnit.set(inputSubUnitId, [c]);
    });
  };
  ctx.prevActiveFirms.forEach(walk);
  ctx.prevActivePrivateFirms.forEach(walk);
  return { byRegion, lookup };
}

/**
 * What the sourcing intent and the freight market decided earlier in the week, which is what the
 * goods auction needs to know to price a foreign quote against a domestic one.
 */
interface SourcingContext {
  splitByRegionSubUnit: Map<string, SourcingSplit>;
  /** Cleared freight per tonne by lane, each in that lane's own money. */
  freightRateByLane: Record<string, number>;
  unitMassTonnes: Record<string, number>;
  fxToUsd: FxToUsd;
  /** XB6 — how deep each currency pair is, which is what the invoice currency is priced on. */
  fxPairIlliquidity: Record<string, number>;
  quotedPairs: { base: RegionId; quote: RegionId }[];
  /** Whether that week's book for a good left unfilled DEMAND rather than unsold supply — which
   *  is what decides who can insist on being paid in their own money. */
  sellerIsShort: (subUnitId: string, origin: RegionId) => boolean;
  /** Per-week memoisation: the buyer's structural PD is deterministic within a week and the lot
   *  loop asked for it once per LOT — ~14k evaluations for ~2k distinct buyers. Same inputs,
   *  same answers, byte-identical world. (Invoice-region memoisation lives per sub-unit pass.) */
  buyerAnnualPdByTicker: Map<string, number>;
}

/**
 * A supplier's whole week for one sub-unit, decided ONCE: how much the plant makes, how much of
 * that (plus the warehouse) is available to the open market, and the least it will take for it.
 * The world book and the home book then each get their share of the same real output — the firm
 * does not produce twice because it sells in two places.
 */
interface SupplyPlan {
  key: string;
  regionId: RegionId;
  company?: Company;
  industry?: string;
  initialInventoryUnits: number;
  /** IND10 — what the firm STARTS this week. It becomes sellable `productionLeadWeeks` later. */
  targetProductionUnits: number;
  targetProductionUSD: number;
  /** IND10 — what came OUT of the pipeline this week: what it can actually sell. */
  arrivedProductionUnits: number;
  /** IND10 — the line's pipeline after this week's advance, to be persisted. */
  wipQueue?: WipLot[];
  openOfferUnits: number;
  minPriceUSD: number;
}

/** A buyer's whole week for one sub-unit, decided once, for the same reason. */
interface DemandPlan {
  key?: string;
  regionId: RegionId;
  company?: Company;
  isHouseholdAggregate?: boolean;
  isGovernmentAggregate?: boolean;
  demandUnits: number;
  maxPriceUSD: number;
}

/** A settlement key for a participant that is not a Company: the aggregates, by region. */
const householdKey = (regionId: RegionId) => `HOUSEHOLD:${regionId}`;
const governmentKey = (regionId: RegionId) => `GOVERNMENT:${regionId}`;

interface BookResult {
  clearedPriceUSD: number;
  clearedUnits: number;
  salesByKey: Map<string, AuctionFill>;
  purchasesByKey: Map<string, AuctionFill>;
  householdFillUnitsByRegion: Record<string, number>;
  governmentSpendUSDByRegion: Record<string, number>;
  lotsByBuyer: Map<string, { sellerKey: string; sellerRegion: RegionId; units: number }[]>;
  inMoneyBidKeys: Set<string>;
  inMoneyOfferKeys: Set<string>;
}

const EMPTY_BOOK = (anchorPrice: number): BookResult => ({
  clearedPriceUSD: anchorPrice,
  clearedUnits: 0,
  salesByKey: new Map(),
  purchasesByKey: new Map(),
  householdFillUnitsByRegion: {},
  governmentSpendUSDByRegion: {},
  lotsByBuyer: new Map(),
  inMoneyBidKeys: new Set(),
  inMoneyOfferKeys: new Set(),
});

/**
 * The goods market's wrapper over the shared double auction (`double-auction.ts`): it hands the
 * auction plain keyed bids and offers, then puts the goods-specific meaning back on the result —
 * whose household bought, whose treasury was debited, and which region each lot's seller sat in.
 */
function clearBook(
  bids: UnitBid[],
  offers: UnitOffer[],
  anchorPrice: number,
  offerRegionByKey: Map<string, RegionId>
): BookResult {
  const bidRegionByKey = new Map<string, RegionId>();
  const auctionBids: AuctionBid[] = bids.map(b => {
    const key = b.companyId
      ?? (b.isHouseholdAggregate ? householdKey(b.regionId) : governmentKey(b.regionId));
    bidRegionByKey.set(key, b.regionId);
    return { key, quantity: b.quantityUnits, maxPrice: b.maxPriceUSD };
  });
  const auctionOffers: AuctionOffer[] = offers.map(o => ({
    key: o.companyId, quantity: o.quantityUnits, minPrice: o.minPriceUSD,
  }));

  const cleared = clearDoubleAuction(auctionBids, auctionOffers, anchorPrice);

  const result = EMPTY_BOOK(cleared.clearedPrice);
  result.clearedUnits = cleared.clearedQuantity;
  result.salesByKey = cleared.sales;
  result.purchasesByKey = cleared.purchases;
  cleared.inMoneyBids.forEach(b => result.inMoneyBidKeys.add(b.key));
  cleared.inMoneyOffers.forEach(o => result.inMoneyOfferKeys.add(o.key));

  cleared.purchases.forEach((fill, key) => {
    const region = bidRegionByKey.get(key);
    if (!region) return;
    if (key === householdKey(region)) {
      result.householdFillUnitsByRegion[region] = (result.householdFillUnitsByRegion[region] ?? 0) + fill.quantity;
    } else if (key === governmentKey(region)) {
      result.governmentSpendUSDByRegion[region] = (result.governmentSpendUSDByRegion[region] ?? 0) + fill.amount;
    }
  });

  cleared.lotsByBuyer.forEach((lots, buyerKey) => {
    result.lotsByBuyer.set(buyerKey, lots.map(l => ({
      sellerKey: l.sellerKey,
      sellerRegion: offerRegionByKey.get(l.sellerKey) ?? (bidRegionByKey.get(buyerKey) as RegionId),
      units: l.quantity,
    })));
  });

  return result;
}

/**
 * Settle every live contract for this sub-unit in one region's book.
 *
 * Contracts are bilateral and already named, so they transfer before the open market opens and
 * are not split by tradability — a contract IS a locked cross-border or domestic deal, whichever
 * it was struck as. A contract is filed in its CUSTOMER's region, and the counterparty lookup
 * spans every region so the foreign leg of one struck in the world book still settles.
 */
function settleContracts(
  ctx: WeeklyStepContext,
  subUnitId: string,
  ownContracts: SupplyContract[],
  lookup: GlobalFirmLookup,
  regionReferencePrice: Record<RegionId, number>,
  contractSalesUnitsBySupplier: Record<string, number>,
  availableBySupplier: Map<string, number>
): SupplyContract[] {
  const { companyUpdates, nextWeek } = ctx;
  const remainingContracts: SupplyContract[] = [];

  // SCALE: for..of — the profiler put ~38 ms/week on this loop's callback dispatch alone at
  // ~74k live contracts; a plain loop is the same iteration in the same order.
  for (const contract of ownContracts) {
    const supplier = lookup.byKey.get(contract.supplierCompanyId);
    const customer = lookup.byKey.get(contract.customerCompanyId);
    if (!supplier || !customer) continue;

    if (!isActiveCompany(supplier)) {
      // Supplier default shock propagates directly to named contract counterparties first
      if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};
      const custUp = companyUpdates[customer.ticker];
      custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, 0.70);
      continue;
    }
    if (!isActiveCompany(customer)) continue;

    contract.weeksRemaining -= 1;

    const marketPriceUSD = regionReferencePrice[customer.region as RegionId] ?? contract.priceUSD;

    /**
     * IND11 — THE BUYER'S COVER MEASURE. When a contract ends with units still owed, the buyer
     * must buy them in the open market, so its loss is what the market charges over the price it
     * was promised. This is contract law's own remedy rather than a chosen penalty rate: there
     * is no free coefficient in it, and when the market has moved the buyer's way the breach
     * costs the seller nothing, which is exactly right.
     */
    const settleUndeliveredBacklog = () => {
      const shortfallUnits = contract.backlogUnits ?? 0;
      const buyerLossUSD = shortfallUnits * Math.max(0, marketPriceUSD - contract.priceUSD);
      if (buyerLossUSD > 0.01) {
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker: supplier.ticker },
          payee: { kind: 'COMPANY', ticker: customer.ticker },
          amountUSD: buyerLossUSD,
          reason: 'non-performance damages',
        });
      }
    };

    // Expiry is settled BEFORE this week's delivery: a contract does not ship in the week its
    // term runs out, which is what it did before IND11 and still does. What is new is that
    // running out of term while still owing units is a BREACH rather than a quiet deletion.
    if (contract.weeksRemaining < 0) { settleUndeliveredBacklog(); continue; }

    // IND11 — INDEXATION. A long contract's price moves with the market it was struck against,
    // in proportion, so a decade of input-cost inflation is not silently assigned to the seller
    // (or a decade of deflation to the buyer). A fixed-price contract carries no base and does
    // not move — that is what makes it a different instrument, not a worse one.
    if (contract.escalationBaseUSD && contract.escalationBaseUSD > 0.0001) {
      contract.priceUSD = Number(
        (contract.priceUSD * (marketPriceUSD / contract.escalationBaseUSD)).toFixed(4)
      );
      contract.escalationBaseUSD = marketPriceUSD;
    }

    // IND11 — THE ORDER SURVIVES THE WEEK IT WAS NOT FILLED. What the supplier owes is this
    // week's quantity PLUS whatever it failed to ship before. The shortfall used to vanish: the
    // seller simply did not deliver, nobody was owed anything, and a chronic under-deliverer
    // was indistinguishable from a punctual one the following Monday.
    const openingBacklogUnits = contract.backlogUnits ?? 0;
    const owedUnits = contract.quantityUnitsPerWeek + openingBacklogUnits;

    // IND11 — THE BUYER CANCELS WHAT IT NO LONGER NEEDS, AND PAYS FOR IT. A committed order is
    // not a wish: when the buyer's own demand collapses, the units on order stop being wanted
    // and the backlog is walked away from. This is the amplifier that makes capital-goods
    // downturns violent — orders are not merely absent, they are TAKEN BACK — and it cannot
    // happen unless a backlog exists to cancel.
    //
    // The buyer's real weekly need is its own recipe requirement at its current revenue, which
    // is the same number its open-market bid is built from. Anything committed above that need
    // is cancelled.
    let cancelledUnits = 0;
    if (openingBacklogUnits > 0.0001) {
      const needUSD = computeRecipeInputNeedUSD(customer, subUnitId);
      const needUnits = marketPriceUSD > 0.0001 ? needUSD / marketPriceUSD : owedUnits;
      const excessUnits = owedUnits - needUnits;
      if (excessUnits > 0.0001) {
        cancelledUnits = Math.min(openingBacklogUnits, excessUnits);
        // THE SELLER'S COVER MEASURE. It must now resell those units into the open market, so
        // its loss is the contract price it was promised less the market price it can get. This
        // is contract law's own remedy, not a chosen penalty rate: there is no free coefficient
        // here, and when the market has moved the seller's way the cancellation costs nothing,
        // which is exactly right.
        const sellerLossUSD = cancelledUnits * Math.max(0, contract.priceUSD - marketPriceUSD);
        if (sellerLossUSD > 0.01) {
          pay(ctx, {
            payer: { kind: 'COMPANY', ticker: customer.ticker },
            payee: { kind: 'COMPANY', ticker: supplier.ticker },
            amountUSD: sellerLossUSD,
            reason: 'order cancellation damages',
          });
        }
      }
    }
    const owedAfterCancellationUnits = owedUnits - cancelledUnits;

    // What this supplier still has to give, this week, across every contract it holds. A
    // supplier with no plan for this line is not producing it and has only its warehouse.
    const supplierUnits = availableBySupplier.get(supplier.ticker)
      ?? availableBySupplier.get(supplier.id)
      ?? getOutputInventoryUnits(supplier, subUnitId);
    const actualTransacted = Math.min(owedAfterCancellationUnits, supplierUnits);
    availableBySupplier.set(supplier.ticker, supplierUnits - actualTransacted);
    contract.backlogUnits = Math.max(0, owedAfterCancellationUnits - actualTransacted);
    const paymentUSD = actualTransacted * contract.priceUSD;

    // IND17 — PROGRESS PAYMENTS. What the customer has already paid ahead settles this delivery
    // first; only the balance moves as cash. The deposit then tracks the work still in the
    // pipeline: `lead x weekly value x share`, topped back up each week, which is what a
    // progress-payment schedule IS. A firm building for a year collects most of the price
    // before it hands anything over, and that is the funding its working capital runs on.
    const targetDepositUSD = productionLeadWeeksOf(subUnitId)
      * contract.quantityUnitsPerWeek * contract.priceUSD * PROGRESS_PAYMENT_SHARE;
    const appliedFromDepositUSD = Math.min(contract.prepaidUSD ?? 0, paymentUSD);
    contract.prepaidUSD = (contract.prepaidUSD ?? 0) - appliedFromDepositUSD;
    const topUpUSD = Math.max(0, targetDepositUSD - contract.prepaidUSD);
    contract.prepaidUSD += topUpUSD;
    if (topUpUSD > 0.01) {
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: customer.ticker },
        payee: { kind: 'COMPANY', ticker: supplier.ticker },
        amountUSD: topUpUSD,
        reason: 'contract progress payment',
      });
    }
    // The fill rate is measured against THIS WEEK's obligation: shipping down a backlog is
    // catching up, not over-performing, so it cannot read above 1.
    const fillRate = contract.quantityUnitsPerWeek > 0
      ? Math.min(1, actualTransacted / contract.quantityUnitsPerWeek) : 1.0;
    contract.shortWeeks = fillRate < 0.95 ? (contract.shortWeeks ?? 0) + 1 : 0;

    if (!companyUpdates[supplier.ticker]) companyUpdates[supplier.ticker] = {};
    if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};

    const supUp = companyUpdates[supplier.ticker];
    // The contract leg's own inventory write. For a supplier that still produces this sub-unit
    // the open-market settlement below overwrites it with the full week's arithmetic; for one
    // that has stopped producing and is only working off a live contract, this is the only write
    // there is — and without it the units ship and the warehouse is never debited. That supplier
    // has no plan, so its balance above is its warehouse alone, which is what this writes down.
    setOutputInventory(
      supUp, subUnitId,
      Math.max(0, supplierUnits - actualTransacted),
      regionReferencePrice[supplier.region as RegionId] ?? contract.priceUSD
    );
    supUp.salesUnits = (supUp.salesUnits ?? 0) + actualTransacted;
    supUp.salesUSD = (supUp.salesUSD ?? 0) + paymentUSD;
    // supUp.salesUnits/salesUSD are deliberately cross-sub-unit totals (other consumers want a
    // company's whole-business sales) — but the inventory settlement below needs THIS sub-unit's
    // contract sales specifically, so track that separately rather than reading the total.
    contractSalesUnitsBySupplier[supplier.ticker] = (contractSalesUnitsBySupplier[supplier.ticker] ?? 0) + actualTransacted;
    // IND14 — the supplier's own delivery record, kept where the delivery happens: what it owed
    // this week against what it shipped. Stage 08 smooths it onto the firm.
    supUp._contractOwedUnits = (supUp._contractOwedUnits ?? 0) + contract.quantityUnitsPerWeek;
    supUp._contractDeliveredUnits = (supUp._contractDeliveredUnits ?? 0) + Math.min(actualTransacted, contract.quantityUnitsPerWeek);

    const custUp = companyUpdates[customer.ticker];
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + actualTransacted;
    custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + paymentUSD;
    if (purchaseKindOf(subUnitId) === 'CAPITAL_GOOD') custUp.capexPurchasesUSD = (custUp.capexPurchasesUSD ?? 0) + paymentUSD;
    // SETL-C: a contract delivery is a payment between two named firms.
    pay(ctx, {
      payer: { kind: 'COMPANY', ticker: customer.ticker },
      payee: { kind: 'COMPANY', ticker: supplier.ticker },
      // IND17 — net of what was already paid ahead. Charging the full price again would collect
      // for the same goods twice.
      amountUSD: paymentUSD - appliedFromDepositUSD,
      reason: 'contract delivery',
    });
    addInputInventory(custUp, customer, subUnitId, supplier.ticker, actualTransacted, paymentUSD, nextWeek);

    if (fillRate < 0.95) {
      // Named shock propagation: reduced fill rate constrains customer capacity directly
      // CAP — THE 0.3 FLOOR IS GONE (rule 2). A firm whose inputs are rationed to nothing must be
      // able to stop: the floor said every firm could always run at three tenths on inputs it did
      // not have, which is production out of nothing. Stage 08 already measures real physical
      // fulfilment from the lots actually held, so the constraint has a real basis to be.
      custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0, fillRate));
    }

    // IND11 — TERMINATION FOR NON-PERFORMANCE. A supplier that has missed its obligation for a
    // full quarter loses the contract: the buyer re-sources through the merit order, which is
    // where the open market already is. Damages settle on whatever it was still owed.
    if ((contract.shortWeeks ?? 0) >= CONTRACT_NON_PERFORMANCE_WEEKS) {
      settleUndeliveredBacklog();
      continue;
    }

    remainingContracts.push(contract);
  }

  return remainingContracts;
}

/**
 * What every supplier in one region will make and offer this week — the decision the firm takes
 * once, before it is split across the two books it sells into.
 */
function buildRegionSupplyPlans(
  subUnitId: string,
  reg: Region,
  regionId: RegionId,
  index: RegionMarketIndex,
  referencePriceUSD: number,
  supplierExpectedUnitPriceUSD: number,
  week: number,
  isCapexSupplierCategory: boolean,
  capexSupplierWeight: number | undefined
): SupplyPlan[] {
  const plans: SupplyPlan[] = [];
  const suppliers = index.suppliersBySubUnit.get(subUnitId) ?? [];

  suppliers.forEach(comp => {
    const line = (comp.productLines || []).find(l => l.subUnitId === subUnitId)!;
    const warehouseCapacityUSD = comp.annualRevenue * 0.15;
    const currentInvUSD = getOutputInventoryUSD(comp, subUnitId);
    // A hard on/off switch here (full production, then a sudden drop to 30% once inventory
    // crosses one threshold) is a bang-bang controller with no hysteresis — it doesn't damp
    // toward equilibrium, it oscillates around the threshold forever (backlog clears -> snap
    // back to full production -> oversupply -> throttle again), producing multi-x week-to-week
    // swings in real cleared sales even when underlying demand is stable. A continuous response
    // that scales down smoothly as the inventory/capacity ratio grows converges instead.
    const inventoryToCapacityRatio = currentInvUSD / Math.max(1, warehouseCapacityUSD);
    // CAP: the 0.3 floor is gone (rule 2). A plant with a full warehouse and nowhere to sell
    // stops; it does not keep running at three tenths forever. Zero is a real production
    // decision, and it was the one this throttle could not express.
    const productionThrottle = Math.min(1.0, Math.max(0, 1.0 - (inventoryToCapacityRatio - 1.0) * 0.7));
    const priceSignal = (supplierExpectedUnitPriceUSD / referencePriceUSD) - 1.0;
    // CAP — THE [0.5, 2.0] BAND IS GONE (rule 2). It bounded how far a firm would run its plant
    // against the price it expects, which is a DECISION, and the band was standing in for the
    // decision's own limits: a firm cannot run above its plant (the capacity term), cannot staff
    // beyond its headcount (IND15), and will not produce below unit cost at all (the
    // cost-covering rule below, which is CAP's own mechanism and now fires). Three real bounds,
    // so the stated one has nothing left to protect. Negative response is still not a thing —
    // a plant cannot run backwards.
    const productionResponseFactor = Math.max(0, 1.0 + priceSignal * 1.5);

    // Production is capacity x utilisation, in UNITS. The previous version sized production in
    // dollars (annualRevenue/52) and divided by the CURRENT price, so a doubling of price halved
    // the units the same plant produced — supply fell as price rose, which is the wrong sign and
    // closes a positive feedback loop (§7.28). Real capacity is physical: what price changes is
    // how hard the plant is run (productionResponseFactor) and whether the warehouse is already
    // full (productionThrottle), never how much the plant can make.
    // CAP — CAPACITY IS READ OFF PP&E, NOT WALKED (§7.177, restored now its blocker is closed).
    //
    // It was a RATE applied to its own prior value, which accumulates every error it is ever
    // given and drifts from the capital it is supposed to describe. A plant is not a rate: it is
    // what the capital can make. The line carries its own capital productivity — units a week per
    // dollar of net PP&E, fixed the first time it trades — and capacity is that times the capital
    // it has now. IND1/IND13 already grow PP&E by what was DELIVERED and COMMISSIONED, so
    // capacity simply reads the result.
    //
    // Stage 05 runs BEFORE stage 08 on week 1, so `grossPPEUSD` is not set yet: it carries stage
    // 08's own opening fallback here, or the ratio would be fixed against a one-dollar plant.
    const grossPPEForCapacityUSD = comp.grossPPEUSD
      ?? (comp.annualRevenue * (SECTOR_PPE_INTENSITY[comp.sector] ?? 0.5));
    const netPPEForCapacityUSD = Math.max(1,
      grossPPEForCapacityUSD - (comp.accumulatedDepreciationUSD ?? (grossPPEForCapacityUSD * 0.45)));
    if (!(line.unitsPerNetPpeDollar! > 0)) {
      const openingCapacityUnits =
        ((comp.baselineAnnualRevenue || comp.annualRevenue) / 52) * (line.revenueShare ?? 1.0) / referencePriceUSD;
      line.unitsPerNetPpeDollar =
        openingCapacityUnits / (netPPEForCapacityUSD * (line.revenueShare ?? 1.0));
    }
    line.weeklyCapacityUnits = Math.max(0.0001,
      line.unitsPerNetPpeDollar! * netPPEForCapacityUSD * (line.revenueShare ?? 1.0));
    const baseMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const costRate = Math.max(0, 1 - baseMargin);
    const weeklyOperatingCostUSD = Math.max(0, (comp.annualRevenue - comp.ebitda) / 52) * (line.revenueShare ?? 1.0);

    // CAP — A FIRM THAT CANNOT COVER UNIT COST STOPS PRODUCING.
    //
    // This is §5-CAP's own mechanism and the half §7.129 recorded as missing: an investment
    // response without a production-stopping rule is half a control loop. The throttle above
    // answers "is my warehouse full"; nothing answered "does making one more unit lose money".
    // A firm facing a price below what the unit costs it idles the plant — that is what makes a
    // downturn end, because supply leaves until the price recovers, and it is why the clamp CAP0
    // removed had to go first: while EBITDA could not be negative, this could never fire.
    //
    // Unit cost is the same dollar figure the offer floor uses (§7.130), so a firm never produces
    // something it would then refuse to sell.
    // IND15 — LABOUR CONSTRAINS OUTPUT. Production is what the plant AND the staffed hours allow.
    //
    // Until now it was the plant alone, so a firm that could not hire produced exactly as much as
    // one fully staffed, and the labour market was decorative: vacancies went unfilled with no
    // consequence anywhere in the goods economy. A firm short of half its people makes half its
    // output, which is also what turns a hiring shortage into an inflationary force rather than a
    // statistic.
    //
    // The staffing ratio is the firm's OWN headcount against the headcount its baseline output
    // needed — both measured, no new field — so a firm that has shed staff cannot ship what it
    // used to and one that hired can.
    const staffedShare = (comp.baselineEmployeeCount ?? 0) > 0
      ? Math.max(0, (comp.employeeCount ?? 0) / comp.baselineEmployeeCount!)
      : 1;
    // IND18 — what the plant can make THIS WEEK. A harvest is not a decision: the crop ripens
    // once a year and no price makes it ripen twice. Averages to 1 over the year, so this moves
    // output around the calendar and never adds any.
    const seasonalPlantFactor = seasonalFactor(subUnitId, week, 'production');
    // IND18/RULE 9 — THE CALENDAR MOVES OUTPUT; IT DOES NOT DECIDE SOLVENCY.
    //
    // The shutdown test below asks whether the price covers what a unit costs to make, and it was
    // being asked at the SEASONAL week's volume against a FULL week's operating cost. Those are
    // two different periodicities (§1.9). A harvest good in its low season makes 70% of its normal
    // output and still pays 100% of its wages, so its "unit cost" printed 1/0.70 = 1.43x the real
    // one, and the seed — which is struck at break-even by construction — flipped straight to the
    // idle branch.
    //
    // MEASURED, and this is what it cost: at WEEK ONE, all 49 of the USA's agricultural_commodities
    // producers were idle (cost 96.35 against a price of 88.95) and 45 of 46 residential_construction
    // producers were idle (21202 against 20923) — margins of 8% and 1.3% against a seasonal factor
    // of 0.702 and 0.750. Both categories delivered ZERO units into a market demanding millions,
    // their prices cleared at the households' reservation, and that is the 29% inflation the world
    // opens with, which the labour market then reads as collapsing real revenue and answers with
    // layoffs. Sixty weeks later: EUR unemployment 66%, inflation 2266%, market shares at 2%.
    //
    // The seasonal factor averages to 1 over the year — it redistributes output and never adds
    // any, as its own comment says. So it cannot belong in the firm's economics. The test is asked
    // on the plant's NORMAL-season volume, which is the basis its costs were struck on; the
    // calendar then says how much of that ripens this week. No clamp, no floor: the comparison
    // simply gets its units right.
    const normalSeasonUnits = line.weeklyCapacityUnits! * productionResponseFactor * productionThrottle;
    const staffedNormalSeasonUnits = Math.min(normalSeasonUnits, normalSeasonUnits * staffedShare);
    const prospectiveUnitCostUSD = staffedNormalSeasonUnits > 0.0001
      ? weeklyOperatingCostUSD / staffedNormalSeasonUnits
      : Infinity;
    const coversUnitCost = supplierExpectedUnitPriceUSD >= prospectiveUnitCostUSD;
    const uncappedProductionUnits = staffedNormalSeasonUnits * seasonalPlantFactor;
    const targetProductionUnits = coversUnitCost ? uncappedProductionUnits : 0;
    const currentUnits = getOutputInventoryUnits(comp, subUnitId);
    // IND10 — the firm offers what it HAS plus what its plant FINISHED this week, not what it
    // started. For a good made on demand these are the same number and nothing changes; for a
    // 26-week build the offer is what was begun half a year ago, which is the point.
    const pipeline = advanceProductionPipeline(
      comp.wipBySubUnit?.[subUnitId],
      productionLeadWeeksOf(subUnitId),
      targetProductionUnits,
      coversUnitCost ? weeklyOperatingCostUSD : 0
    );
    // The caller trims this to what the contracts left behind, once they have settled against
    // the same stock (§7.148). Here it is simply everything the firm can sell.
    const openOfferUnits = Math.max(0, pipeline.arrivedUnits + currentUnits);

    // CAP / RULE 15 — THE SELLER'S FLOOR IS ITS COST IN DOLLARS, NOT A FRACTION OF THE MARKET.
    //
    // `minPriceUSD` was `referencePriceUSD x costRate x (1 + premium)` — a reservation price
    // defined as a share of the CURRENT market price. So when the price fell, every seller's
    // floor fell with it, which lowered the clearing price, which lowered next week's reference:
    // a downward ratchet with nothing real underneath it. It is why a market with **8x excess
    // demand still printed a falling price** (§7.127) — the shortage could not stop the fall
    // because no seller was ever unwilling.
    //
    // A firm's cost is a dollar figure: the wages it pays, the input lots it consumed, the opex
    // it carries. IND3 made all three real (§7.121), so the floor can be what it actually costs
    // to make a unit — and a price below it means the firm does not sell, which is CAP's stated
    // mechanism arriving where it belongs, on the offer.
    //
    // The [0.40, 0.98] band on the cost rate goes with it: it existed because the margin it read
    // was a stated number that could be anything, and since IND3 it is the residual of real
    // costs (rule 2).
    const ratingPdMap: Record<string, number> = {
      'AAA': 0.0002, 'AA': 0.001, 'A': 0.003, 'BBB': 0.01, 'BB': 0.03, 'B': 0.08, 'CCC': 0.20
    };
    const pd = ratingPdMap[comp.creditRating] ?? 0.03;
    const expectedLoss = pd * 0.60;
    const costOfCapital = 0.05 + expectedLoss;

    // IND6 — SHARE VERSUS MARGIN, expressed only through the real offer price.
    //
    // Every seller asked cost plus the same premium, so no firm could choose to buy share by
    // pricing keener than its rivals — the one lever that actually moves share in an auction that
    // fills cheaper offers first. The posture is not a stated per-company variable and not a
    // synthetic share target: it is the firm's OWN inventory position, which stage 05 already
    // computes. A warehouse filling up is a firm that is not selling, and it gives up margin to
    // move the stock; a firm with nothing left holds out for its full premium.
    //
    // The floor beneath it is the contribution-margin bound: at full inventory the premium goes to
    // zero and the ask is unit cost (§7.130), never below — a firm gives up profit to win share,
    // not money.
    const inventoryPricePressure = Math.min(1, Math.max(0, inventoryToCapacityRatio));
    const marginPremium = costOfCapital * 1.5 * (1 - inventoryPricePressure);

    plans.push({
      key: comp.ticker,
      regionId,
      company: comp,
      initialInventoryUnits: currentUnits,
      targetProductionUnits,
      targetProductionUSD: targetProductionUnits * referencePriceUSD,
      arrivedProductionUnits: pipeline.arrivedUnits,
      wipQueue: pipeline.queue,
      openOfferUnits,
      // Cost per unit of what this plant actually makes, in dollars. Falls back to the
      // reference-anchored form only when the line has no production to divide by.
      minPriceUSD: targetProductionUnits > 0.0001
        ? (weeklyOperatingCostUSD / targetProductionUnits) * (1 + marginPremium)
        : referencePriceUSD * costRate * (1 + marginPremium),
    });
  });

  // ---- SEG-B: the SME pool of the industry that PRODUCES this sub-unit offers into it. ----
  //
  // What this replaces: two hardcoded tables (PRIVATE_SEGMENT_SUPPLY_CATEGORIES for two
  // sub-units, CAPEX_CATEGORY_PRIVATE_SEGMENT for five) that let five buckets sell into 7 of the
  // registry's 36 sub-units and left four of them, ~32% of employment, selling nothing at all.
  // Now every sub-unit has a pool behind it, because every sub-unit has a parent industry.
  //
  // The pool's capacity for THIS sub-unit is its own weekly revenue allocated by its product
  // mix: what it measurably sold here last week (SEG-D's `salesDerivedAnnualRevenueUSDBySubUnit`),
  // and at the cold start the sub-unit's share of its industry's own demand — so a pool puts its
  // capacity where the demand is instead of against a fixed 8% share of one category.
  //
  // It prices off its OWN unit cost, which its margin defines. A thin-margin pool has less room
  // to undercut, which is the real reason small firms in low-margin trades are price-takers.
  {
    const owningIndustry = industryOfSubUnit(subUnitId);
    const pool = owningIndustry ? reg.smePools?.find(p => p.industry === owningIndustry) : undefined;
    if (pool && owningIndustry) {
      const siblings = smePoolSubUnits(owningIndustry);
      const measured = pool.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
      const measuredTotal = siblings.reduce((a, su) => a + Math.max(0, measured[su.unitId] ?? 0), 0);
      // §5-STRUCT step 3 — the rule lives on the pool (domain/sme-pool.ts), not here. What used to
      // sit inline gave a sub-unit the pool had never sold into a share of exactly zero, for ever
      // (§7.229): no offer produces no measurement produces no offer.
      const mixShare = capacityMixShares(siblings.map((su) => ({
        subUnitId: su.unitId,
        demandLevelUSD: reg.categoryDemand[su.unitId]?.demandLevelUSD ?? 0,
        measuredRevenueUSD: Math.max(0, measured[su.unitId] ?? 0),
      }))).get(subUnitId) ?? 0;
      // Capacity is sized off the pool's GOODS revenue — what it actually sells in these books —
      // not its total, which includes services that never pass through an auction.
      const goodsRevenueUSD = measuredTotal > 0 ? measuredTotal : pool.annualRevenueUSD;
      const poolOfferUnits = ((goodsRevenueUSD / 52) * mixShare) / referencePriceUSD;
      if (poolOfferUnits > 0.001) {
        plans.push({
          key: privateSegmentOfferId(regionId, owningIndustry),
          regionId,
          industry: owningIndustry,
          initialInventoryUnits: 0,
          // IND10 — a pool's offer is a RATE (its own measured weekly goods revenue), not a
          // stock drawn down from a warehouse, so there is no production start for a lead time
          // to sit between. Its lag is the measurement's own, one week.
          targetProductionUnits: 0,
          targetProductionUSD: 0,
          arrivedProductionUnits: 0,
          openOfferUnits: poolOfferUnits,
          // Its own unit cost: a pool earning a 9% margin cannot sell below 91 cents on the
          // dollar of the reference price and stay solvent.
          // CAP — the half-the-reference floor is gone (rule 2). It existed because `marginPct`
          // could be anything; since IND3 a margin is the residual of real costs, so `1 − margin`
          // IS the pool's unit cost and needs no floor under it. A cost cannot be negative.
          minPriceUSD: referencePriceUSD * Math.max(0, 1 - pool.marginPct),
        });
      }
    }
  }

  return plans;
}

/** What every buyer in one region wants this week, before it is split across the two books. */
function buildRegionDemandPlans(
  subUnitId: string,
  reg: Region,
  regionId: RegionId,
  index: RegionMarketIndex,
  referencePriceUSD: number,
  contractUnitsByCustomer: Map<string, number>,
  isCapexSupplierCategory: boolean,
  capexSupplierWeight: number | undefined,
  isRecipeInputCategory: boolean,
  govShare: number,
  hhShare: number,
  week: number
): DemandPlan[] {
  const plans: DemandPlan[] = [];
  const demandState = reg.categoryDemand[subUnitId];
  const suppliers = index.suppliersBySubUnit.get(subUnitId) ?? [];
  const supplierSet = suppliers.length > 0 ? new Set(suppliers) : null;

  // Real, complete corporate demand for every OTHER category (see 03-category-demand.ts's
  // corporateDemandUSD — the same buyerMix/aggregate-investment math that feeds the region's
  // C+I+G identity, not a hand-picked per-category intensity list that only covered a handful
  // of categories and let every other one starve for real corporate buyers).
  const hasCorporateDemand = (demandState.corporateDemandUSD ?? 0) > 0;
  // Capital-goods categories draw from the pre-indexed capex buyers; everything else scans the
  // region's firms once. A producer of the category is never also its customer.
  const candidatePool = isCapexSupplierCategory
    ? index.capexBuyers
    : isRecipeInputCategory
      ? (index.recipeInputBuyersBySubUnit.get(subUnitId) ?? [])
      : index.activeFirms;
  const customers = candidatePool.filter(c => {
    if (supplierSet?.has(c)) return false;
    if (isCapexSupplierCategory || isRecipeInputCategory) return true;
    return hasCorporateDemand;
  });
  const totalCustomerRevenueUSD = customers.reduce((s, c) => s + c.annualRevenue, 0) || 1;

  customers.forEach(comp => {
    let demandUSD = 0;
    if (isCapexSupplierCategory) {
      const realCapexUSD = (comp.maintenanceCapex ?? 0) + (comp.growthCapex ?? 0);
      demandUSD = (realCapexUSD / 52) * capexSupplierWeight!;
    } else if (isRecipeInputCategory) {
      demandUSD = computeRecipeInputNeedUSD(comp, subUnitId);
    } else {
      // This company's real named bid is its revenue share of the category's real total
      // corporate demand — every company that could plausibly buy this category gets a bid
      // sized to its own scale, and the bids sum exactly to the real regional total.
      demandUSD = ((demandState.corporateDemandUSD ?? 0) / 52) * (comp.annualRevenue / totalCustomerRevenueUSD);
    }
    const contractPurchases = (contractUnitsByCustomer.get(comp.ticker) ?? 0) + (contractUnitsByCustomer.get(comp.id) ?? 0);
    const openBidUnits = Math.max(0, (demandUSD / referencePriceUSD) - contractPurchases);
    if (openBidUnits <= 0.001) return;

    const cashRatio = comp.cash / Math.max(1, comp.annualRevenue);
    // A cash-strapped buyer discounting its OWN bid price used to be the mechanism here —
    // but under pro-rata clearing every in-the-money bid gets the same fill ratio regardless
    // of how far above the clearing price it sits, so a discounted bid is either fully in the
    // money like everyone else, or (once the clearing price rises past it) shut out entirely.
    // That produced a compounding death spiral with no recovery path: low cash -> lower bid
    // price -> shut out -> can't get inputs -> less revenue -> less cash. A capital-constrained
    // real buyer instead orders LESS at a normal market price (real capital rationing), so
    // whatever it does order actually clears.
    const cashConstrainedQtyModifier = cashRatio < 0.02 ? 0.70 : 1.0;
    const cashRichPricePremium = cashRatio > 0.15 ? 1.15 : 1.0;

    plans.push({
      key: comp.ticker,
      regionId,
      company: comp,
      demandUnits: openBidUnits * cashConstrainedQtyModifier,
      maxPriceUSD: referencePriceUSD * (0.95 + random() * 0.1) * cashRichPricePremium,
    });
  });

  // 1$ is 1$ Phase 3 (demand-side): the private sector spends real capex too — every segment
  // bids for capital-goods categories from its own real capexUSD, so a segment's capex dollars
  // land on a real named supplier instead of being credited as an ambient revenue bump.
  if (isCapexSupplierCategory) {
    (reg.smePools || []).forEach(segment => {
      const segCapexUSD = segment.capexUSD ?? 0;
      if (segCapexUSD <= 0) return;
      const demandUnits = ((segCapexUSD / 52) * capexSupplierWeight!) / referencePriceUSD;
      if (demandUnits <= 0.001) return;
      plans.push({
        key: privateSegmentOfferId(regionId, segment.industry),
        regionId,
        demandUnits,
        maxPriceUSD: referencePriceUSD * (0.95 + random() * 0.1),
      });
    });
  }

  // ---- SEG-B: EVERY pool buys its own industry's recipe inputs. ----
  //
  // What this replaces: one hardcoded branch in which the MANUFACTURING bucket bought
  // IndustrialsMachinery's recipe, under a comment saying the other four buckets were "left out"
  // because guessing their inputs "is BP1's job to retire". BP1 closed and never retired it, so
  // four of five buckets bought nothing — pure sellers, with input costs that existed only as a
  // margin subtracted from revenue. Now a pool consumes its OWN industry's recipe, the same
  // literal `recipeInputs` a named firm of that industry consumes, so it competes for inputs in
  // the same books it sells into.
  if (isRecipeInputCategory) {
    (reg.smePools || []).forEach(pool => {
      // CHAIN-D: blended over what this pool actually SELLS, because its industry's products no
      // longer share one recipe. A pool with no sales yet falls back to an equal split.
      const intensity = smePoolRecipeInputs(pool.industry, pool.salesDerivedAnnualRevenueUSDBySubUnit)[subUnitId];
      if (!intensity) return;
      const demandUnits = ((pool.annualRevenueUSD / 52) * intensity) / referencePriceUSD;
      if (demandUnits <= 0.001) return;
      plans.push({
        key: privateSegmentOfferId(regionId, pool.industry),
        regionId,
        demandUnits,
        maxPriceUSD: referencePriceUSD * (0.95 + random() * 0.1),
      });
    });
  }

  // Government Aggregate Bid — PUB1e: the treasury's OWN weekly budget for this category, set by
  // stage 03 from the real primary budget net of debt service. It used to be re-derived here as
  // a share of the smoothed demand level, which is a different number from the one stage 03
  // allocated and from the one the treasury's account was debited by.
  const govBudgetWeeklyUSD = reg.governmentProcurementBudgetByCategory?.[subUnitId]
    ?? (demandState.demandLevelUSD * govShare) / 52;
  if (govShare > 0 && govBudgetWeeklyUSD > 0) {
    const govDemandUnits = govBudgetWeeklyUSD / referencePriceUSD;
    if (govDemandUnits > 0.001) {
      plans.push({
        regionId,
        isGovernmentAggregate: true,
        demandUnits: govDemandUnits,
        maxPriceUSD: referencePriceUSD * (1 + GOVERNMENT_BID_PRICE_TOLERANCE),
      });
    }
  }

  // Household Aggregate Bid
  if (hhShare > 0) {
    // IND18 — coats in winter, gifts in December. The seasonal swing is on the HOUSEHOLD leg
    // because that is where a retail peak lives; a firm's demand for its own inputs follows its
    // own production, which already carries the production side of the same calendar.
    // IND16: a household's money buys what it buys AT THE SHELF, which is the landed price plus
    // what the channel charges to hold the stock it is buying out of. Dividing the budget by the
    // factory-gate price was the model paying no one to move the goods.
    const channelMargin = channelMarginRate(subUnitId, reg.zeroRates?.tenor3M ?? reg.policyRate ?? 0);
    const shelfPrice = shelfPriceUSD(referencePriceUSD, subUnitId, reg.zeroRates?.tenor3M ?? reg.policyRate ?? 0);
    let hhDemandUnits = ((demandState.demandLevelUSD * hhShare) / 52) / shelfPrice
      * seasonalFactor(subUnitId, week, 'demand');

    if (subUnitId === 'passenger_vehicles') {
      const initialStock = reg.householdState.durableGoodsStockUnits ?? (((demandState.demandLevelUSD * hhShare) / shelfPrice) * 3.5);
      const scrappageRate = 0.12 / 52;
      const replacementDemandUnits = initialStock * scrappageRate;
      const targetStock = (reg.estimatedHouseholdIncomeUSD * (1 - reg.householdState.savingsRate) * 0.10) / shelfPrice;
      const expansionDemandUnits = Math.max(0, (targetStock - initialStock) * 0.05);
      hhDemandUnits = replacementDemandUnits + expansionDemandUnits;
      // Scrappage happens once a week, not once per book: the stock is retired here and this
      // week's fills are added back after both books have cleared.
      reg.householdState.durableGoodsStockUnits = initialStock - replacementDemandUnits;
    }

    if (hhDemandUnits > 0.001) {
      // COH4 — THE HOUSEHOLD POSTS A SCHEDULE, NOT A QUANTITY AT A CEILING.
      //
      // It used to bid its whole week's units at one price: the going price times a frozen
      // constant times a chosen per-tier elasticity. A step cannot express a demand curve, so
      // that single number was standing in for a whole schedule — which is why the two honest
      // derivations of it differed by two orders of magnitude (rule 15).
      //
      // The ladder is the curve: saturating at what the household physically has use for, and
      // sloping down because `units = money / price` and the money is finite. Every input is
      // measured. **No elasticity, no premium and no price ceiling anywhere** — a household facing
      // a dearer luxury buys less of it, which the curve says on its own.
      const hs = reg.householdState;
      const budgetReachMultiple = householdBudgetReachMultiple(categoryPriceTier(subUnitId), {
        STAPLE: hs.stapleSpendShare, STANDARD: hs.standardSpendShare, LUXURY: hs.luxurySpendShare,
      });
      // What it has use for: the registry's own per-capita consumption intensity, which is the
      // primitive IND-R3 put there for exactly this and which nothing outside the seed read.
      const perCapitaAnnual = subUnitSpecOf(subUnitId)?.householdUnitsPerCapitaAnnual ?? 0;
      const satiationUnits = perCapitaAnnual > 0
        ? (perCapitaAnnual * Math.max(0, reg.totalPopulation)) / 52
          * seasonalFactor(subUnitId, week, 'demand')
        : 0;
      // IND16: this book clears at the FACTORY GATE, so every rung is the factory-gate price the
      // household's willingness to pay leaves once the channel has taken its cut.
      householdDemandLadder({
        weeklyBudgetUSD: hhDemandUnits * shelfPrice,
        referencePriceUSD,
        budgetReachMultiple,
        satiationUnits,
      }).forEach((rung) => {
        if (rung.units <= 0.001) return;
        plans.push({
          regionId,
          isHouseholdAggregate: true,
          demandUnits: rung.units,
          maxPriceUSD: rung.maxPriceUSD / (1 + channelMargin),
        });
      });
    }
  }

  return plans;
}

/**
 * One sub-unit's whole week, across the world book and the four local books.
 *
 * Returns each region's surviving contract book for this sub-unit.
 */
/**
 * One sub-unit's whole week, across the four producing regions' books.
 *
 * XB3a-3: there is no world book. Each region's suppliers offer EX-WORKS into their own market,
 * and every region's buyers bid into all four at their own LANDED cost — the ex-works price
 * converted into their money, plus what it costs to get it there. One price per book, and the
 * wedge sits on each buyer's own reservation, which is exactly how it works: a mill quotes at the
 * gate and the buyer pays the freight.
 */
function runSubUnitMarkets(
  ctx: WeeklyStepContext,
  subUnitId: string,
  govShare: number,
  hhShare: number,
  indexes: Record<RegionId, RegionMarketIndex>,
  lookup: GlobalFirmLookup,
  contractsByRegion: Record<RegionId, SupplyContract[]>,
  sourcing: SourcingContext
): Record<RegionId, SupplyContract[]> {
  const { companyUpdates, nextWeek } = ctx;

  const isRecipeInputCategory = Object.values(CATEGORY_INPUT_REQUIREMENTS).some(reqs => (reqs as any)?.[subUnitId] !== undefined);
  const capexSupplierWeight = CAPEX_SUPPLIER_WEIGHTS[subUnitId];
  const isCapexSupplierCategory = capexSupplierWeight !== undefined;
  const massTonnes = sourcing.unitMassTonnes[subUnitId] ?? 0;

  // --- 1. Each book's anchor price, read before anything this week moves it.
  const anchorPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId];
    const published = demandState?.unitPriceUSD ?? 0;
    anchorPrice[regionId] = published > 0 ? published : 1;
  });

  // --- 2. What every supplier will MAKE and FINISH this week, decided before its contracts are
  //        filled.
  //
  // IND11 EXPOSED AN ORDERING DEFECT OLDER THAN ITSELF. Contracts used to settle here, first,
  // against `getOutputInventoryUnits` — which is LAST week's closing stock. This week's
  // production only reached the warehouse at step 8, after the auction. So a firm's own output
  // was never available to its own committed orders: a contract could be filled only out of
  // whatever the previous week's auction happened to leave unsold, and since the offer already
  // reserved the contract volume, what it left was exactly the shortfall. Every contract in the
  // economy under-delivered, forever, and NOBODY NOTICED because an unfilled order evaporated
  // (69% of the book was short at week 10 the moment backlog started accumulating).
  //
  // A firm ships its commitments out of what it has plus what it just finished. That is the
  // order now: produce, deliver the contracts, auction the rest.
  const supplyPlans: SupplyPlan[] = [];
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const demandState = reg.categoryDemand[subUnitId];
    if (!demandState) return;
    const prevSmoothed = demandState.smoothedUnitPriceUSD ?? 0;
    const smoothedBasis = prevSmoothed > 0 ? prevSmoothed : anchorPrice[regionId];
    demandState.smoothedUnitPriceUSD = smoothedBasis * 0.75 + anchorPrice[regionId] * 0.25;

    supplyPlans.push(...buildRegionSupplyPlans(
      subUnitId, reg, regionId, indexes[regionId], anchorPrice[regionId], demandState.smoothedUnitPriceUSD,
      nextWeek, isCapexSupplierCategory, capexSupplierWeight
    ));
  });

  // --- 3. Contracts settle, against what each supplier actually HAS: its opening stock plus
  //        what its plant finished this week. The balance is drawn down as it ships, so a
  //        supplier with three contracts cannot deliver the same units to all three — which is
  //        what reading the warehouse fresh inside each contract used to let it do.
  const availableBySupplier = new Map<string, number>();
  supplyPlans.forEach(p => {
    if (!p.company) return;
    availableBySupplier.set(p.key, p.initialInventoryUnits + p.arrivedProductionUnits);
  });
  const contractSalesUnitsBySupplier: Record<string, number> = {};
  const survivingContracts = {} as Record<RegionId, SupplyContract[]>;
  MARKET_REGION_IDS.forEach(regionId => {
    survivingContracts[regionId] = settleContracts(
      ctx, subUnitId, contractsByRegion[regionId] ?? [], lookup, anchorPrice,
      contractSalesUnitsBySupplier, availableBySupplier
    );
  });

  // --- 4. What every buyer wants, net of the contract volume it is already committed to.
  const contractUnitsByCustomer = new Map<string, number>();
  MARKET_REGION_IDS.forEach(regionId => {
    survivingContracts[regionId].forEach(c => {
      contractUnitsByCustomer.set(c.customerCompanyId, (contractUnitsByCustomer.get(c.customerCompanyId) ?? 0) + c.quantityUnitsPerWeek);
    });
  });

  const demandPlans: DemandPlan[] = [];
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const demandState = reg.categoryDemand[subUnitId];
    if (!demandState) return;
    demandPlans.push(...buildRegionDemandPlans(
      subUnitId, reg, regionId, indexes[regionId], anchorPrice[regionId],
      contractUnitsByCustomer, isCapexSupplierCategory, capexSupplierWeight, isRecipeInputCategory,
      govShare, hhShare, nextWeek
    ));
  });

  // The open market gets what the contracts did not take. A supplier not in the plans (one that
  // has stopped producing this line) never offered anything to adjust.
  supplyPlans.forEach(p => {
    if (!p.company) return;
    p.openOfferUnits = Math.max(0, availableBySupplier.get(p.key) ?? 0);
  });

  const offerRegionByKey = new Map<string, RegionId>();
  supplyPlans.forEach(p => offerRegionByKey.set(p.key, p.regionId));

  // --- 4. Where each region intends to buy this good, from the sourcing intent. A buyer with no
  //        intent on record sources at home, which is what it does when it has looked at nothing.
  const originShareCache = new Map<RegionId, Record<string, number>>();
  const originShare = (buyerRegion: RegionId): Record<string, number> => {
    const cached = originShareCache.get(buyerRegion);
    if (cached) return cached;
    const split = sourcing.splitByRegionSubUnit.get(`${buyerRegion}|${subUnitId}`);
    const shares: Record<string, number> = {};
    let total = 0;
    if (split) MARKET_REGION_IDS.forEach(o => { total += split.unitsByOrigin[o] ?? 0; });
    if (!(total > 0)) { shares[buyerRegion] = 1; originShareCache.set(buyerRegion, shares); return shares; }
    MARKET_REGION_IDS.forEach(o => {
      const u = split!.unitsByOrigin[o] ?? 0;
      if (u > 0) shares[o] = u / total;
    });
    originShareCache.set(buyerRegion, shares);
    return shares;
  };

  /** What it costs this buyer, in ITS money, to bring one unit in from that origin. All sixteen
   *  values are fixed for this sub-unit's whole pass (rate, mass, fx), so they are computed once
   *  by the identical expression and the per-lot call becomes a table read — the closure it
   *  replaces built a lane-key string and ran two rate lookups per LOT. */
  const freightPUMatrix = new Map<RegionId, Map<RegionId, number>>();
  MARKET_REGION_IDS.forEach(origin => {
    const row = new Map<RegionId, number>();
    MARKET_REGION_IDS.forEach(buyer => {
      row.set(buyer, !(massTonnes > 0) ? 0
        : convertLocal((sourcing.freightRateByLane[laneKey(origin, buyer)] ?? 0) * massTonnes, origin, buyer, sourcing.fxToUsd));
    });
    freightPUMatrix.set(origin, row);
  });
  const freightPerUnitBuyerMoney = (origin: RegionId, buyer: RegionId): number =>
    freightPUMatrix.get(origin)!.get(buyer)!;
  // Invoice currency per (origin, buyer) is fixed within this sub-unit's pass; the per-lot
  // string-keyed lookup this replaces allocated a key per cross-border lot.
  const invoiceRegionCache = new Map<RegionId, Map<RegionId, RegionId>>();

  // --- 5. Build the four books. Suppliers offer only at home; buyers bid everywhere they intend.
  const bidsByOrigin = {} as Record<RegionId, UnitBid[]>;
  const offersByOrigin = {} as Record<RegionId, UnitOffer[]>;
  MARKET_REGION_IDS.forEach(r => { bidsByOrigin[r] = []; offersByOrigin[r] = []; });

  supplyPlans.forEach(plan => {
    if (plan.openOfferUnits <= 0.001) return;
    offersByOrigin[plan.regionId].push({
      companyId: plan.key, regionId: plan.regionId,
      quantityUnits: plan.openOfferUnits, minPriceUSD: plan.minPriceUSD,
    });
  });

  demandPlans.forEach(plan => {
    if (plan.demandUnits <= 0.001) return;
    const shares = originShare(plan.regionId);
    Object.keys(shares).forEach(originKey => {
      const origin = originKey as RegionId;
      const units = plan.demandUnits * shares[origin];
      if (units <= 0.001) return;
      // The buyer's ceiling is what it will pay DELIVERED, in its own money. What it can offer at
      // the far gate is that less the freight, converted into the seller's money — which is the
      // whole of landed-cost sourcing, expressed as a reservation.
      const exWorksCeilingBuyerMoney = plan.maxPriceUSD - freightPerUnitBuyerMoney(origin, plan.regionId);
      if (!(exWorksCeilingBuyerMoney > 0)) return;
      bidsByOrigin[origin].push({
        companyId: plan.key,
        isHouseholdAggregate: plan.isHouseholdAggregate,
        isGovernmentAggregate: plan.isGovernmentAggregate,
        regionId: plan.regionId,
        quantityUnits: units,
        maxPriceUSD: convertLocal(exWorksCeilingBuyerMoney, plan.regionId, origin, sourcing.fxToUsd),
      });
    });
  });

  const results = {} as Record<RegionId, BookResult>;
  MARKET_REGION_IDS.forEach(origin => {
    results[origin] = clearBook(bidsByOrigin[origin], offersByOrigin[origin], anchorPrice[origin], offerRegionByKey);
  });

  // --- 6. Trade, and the freight it took. An export is a fill whose buyer sat elsewhere.
  const shippedTonnesByLane: Record<string, number> = {};
  MARKET_REGION_IDS.forEach(origin => {
    const book = results[origin];
    if (book.clearedUnits <= 0.0001) return;
    book.lotsByBuyer.forEach((lots, buyerKey) => {
      const buyerRegion = buyerRegionOfKey(buyerKey, lookup);
      if (!buyerRegion) return;
      lots.forEach(lot => {
        if (lot.sellerRegion === buyerRegion) {
          // A domestic sale still has to be carried, and that is a real cost on a real haul.
          if (massTonnes > 0) {
            const key = laneKey(lot.sellerRegion, buyerRegion);
            shippedTonnesByLane[key] = (shippedTonnesByLane[key] ?? 0) + lot.units * massTonnes;
          }
          return;
        }
        const valueBuyerMoney = convertLocal(lot.units * book.clearedPriceUSD, lot.sellerRegion, buyerRegion, sourcing.fxToUsd);
        // Trade is reported in USD, because a world total in four different monies is not a total.
        ctx.bilateralTradeWeeklyUSD[lot.sellerRegion][buyerRegion] +=
          localToUsd(valueBuyerMoney, buyerRegion, sourcing.fxToUsd);
        if (massTonnes > 0) {
          const key = laneKey(lot.sellerRegion, buyerRegion);
          shippedTonnesByLane[key] = (shippedTonnesByLane[key] ?? 0) + lot.units * massTonnes;
        }
      });
    });
  });
  Object.keys(shippedTonnesByLane).forEach(key => {
    ctx.shippedTonnesByLane[key] = (ctx.shippedTonnesByLane[key] ?? 0) + shippedTonnesByLane[key];
  });

  // --- 7. Each region's published price: what its own buyers actually paid, delivered, in their
  //        own money. It is a MEASUREMENT of transactions and never an input to one.
  const paidValue = {} as Record<RegionId, number>;
  const paidUnits = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(r => { paidValue[r] = 0; paidUnits[r] = 0; });
  MARKET_REGION_IDS.forEach(origin => {
    const book = results[origin];
    if (book.clearedUnits <= 0.0001) return;
    book.lotsByBuyer.forEach((lots, buyerKey) => {
      const buyerRegion = buyerRegionOfKey(buyerKey, lookup);
      if (!buyerRegion) return;
      lots.forEach(lot => {
        const exWorksBuyerMoney = convertLocal(book.clearedPriceUSD, lot.sellerRegion, buyerRegion, sourcing.fxToUsd);
        const landed = exWorksBuyerMoney + freightPerUnitBuyerMoney(lot.sellerRegion, buyerRegion);
        paidValue[buyerRegion] += lot.units * landed;
        paidUnits[buyerRegion] += lot.units;
      });
    });
  });
  const publishedPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(r => {
    publishedPrice[r] = paidUnits[r] > 0.0001 ? paidValue[r] / paidUnits[r] : results[r].clearedPriceUSD;
  });

  // --- 8. Settle production, inventory and cash ONCE per supplier. A seller books its own money.
  supplyPlans.forEach(plan => {
    const sale = results[plan.regionId].salesByKey.get(plan.key);
    const soldUnits = sale?.quantity ?? 0;
    const soldValue = sale?.amount ?? 0;
    if (!plan.company) return;
    const comp = plan.company;
    if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
    const supUp = companyUpdates[comp.ticker];
    const contractSalesUnitsThisSubUnit = contractSalesUnitsBySupplier[comp.ticker] ?? 0;
    setOutputInventory(
      supUp, subUnitId,
      // IND10 — what lands in the warehouse is what the pipeline FINISHED, not what was started.
      Math.max(0, plan.initialInventoryUnits + plan.arrivedProductionUnits - contractSalesUnitsThisSubUnit - soldUnits),
      results[plan.regionId].clearedPriceUSD
    );
    if (plan.wipQueue) {
      if (!supUp.wipBySubUnit) supUp.wipBySubUnit = { ...(comp.wipBySubUnit ?? {}) };
      supUp.wipBySubUnit[subUnitId] = plan.wipQueue;
    }
    if (soldUnits > 0) {
      supUp.salesUnits = (supUp.salesUnits ?? 0) + soldUnits;
      supUp.salesUSD = (supUp.salesUSD ?? 0) + soldValue;
    }
    supUp._targetProductionUSD = (supUp._targetProductionUSD ?? 0) + plan.targetProductionUSD;
  });

  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    // SEG-B/D: the pool's revenue is what it MEASURABLY SOLD. One book keyed by sub-unit —
    // the old pair (a supply book and a capex book) existed only because a bucket could be
    // credited through two different hardcoded routes, and each route's write subtracted the
    // other's prior contribution as if it were its own.
    const owningIndustry = industryOfSubUnit(subUnitId);
    const pool = owningIndustry ? reg.smePools?.find(p => p.industry === owningIndustry) : undefined;
    if (pool && owningIndustry) {
      const amountUSD = results[regionId].salesByKey.get(privateSegmentOfferId(regionId, owningIndustry))?.amount ?? 0;
      const newAnnualizedUSD = amountUSD * 52;
      // The BOOK is this pool's goods mix and its goods revenue. The pool's TOTAL revenue is
      // owned by the sme-pools stage, which measures it from every receipt — a pool sells
      // services too, and crediting only its auction sales here made the same number mean two
      // different things depending on which stage last wrote it (rule 3).
      const book = pool.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
      book[subUnitId] = newAnnualizedUSD;
      pool.salesDerivedAnnualRevenueUSDBySubUnit = book;
    }
  });

  // --- 9. Settle every buyer once, in ITS money, at the landed cost it actually paid.
  const deferredPurchaseUSD = new Map<string, number>();
  const deferredSaleKeyed = new Map<string, number>();
  // Who actually bought anywhere this week — plans absent from every book write nothing and are
  // skipped before the per-origin walk (bit-exact: they returned with no writes anyway).
  const purchasedKeys = new Set<string>();
  MARKET_REGION_IDS.forEach(origin => results[origin].purchasesByKey.forEach((_, k) => purchasedKeys.add(k)));
  demandPlans.forEach(plan => {
    if (!plan.company || !plan.key) return;
    if (!purchasedKeys.has(plan.key)) return;
    const comp = plan.company;
    let units = 0;
    let landedCost = 0;
    MARKET_REGION_IDS.forEach(origin => {
      const book = results[origin];
      const buy = book.purchasesByKey.get(plan.key!);
      if (!buy || buy.quantity <= 0.0001) return;
      // A lot bought abroad is paid for in the seller's money and carried home; both legs land on
      // this buyer's books in its own money.
      const exWorksBuyerMoney = convertLocal(book.clearedPriceUSD, origin, plan.regionId, sourcing.fxToUsd);
      const perUnit = exWorksBuyerMoney + freightPerUnitBuyerMoney(origin, plan.regionId);
      units += buy.quantity;
      landedCost += buy.quantity * perUnit;
      // XB3a-4: what was bought is not yet what has arrived. A consignment is in transit for as
      // long as the lane physically takes, and only lands on the buyer's input inventory when it
      // gets there. Domestic hauls that complete inside the week land immediately, which is what
      // a same-week road delivery is.
      const transit = laneTransitWeeks(origin, plan.regionId, laneDistanceNm(origin, plan.regionId));
      const arrivalWeek = nextWeek + Math.round(transit);
      (book.lotsByBuyer.get(plan.key!) ?? []).forEach(l => {
        if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
        // SETL-C: the auction knows exactly who bought whose lot, so the payment keeps its
        // counterparty instead of both sides netting through the boundary.
        // The buyer pays LANDED cost; the seller receives only ex-works. The difference is the
        // freight, which belongs to the carriers — paid on shipped tonnage further down this
        // stage, so it is named here rather than handed to the seller.
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker: comp.ticker },
          payee: partyOfKey(l.sellerKey, origin, lookup),
          amountUSD: l.units * exWorksBuyerMoney,
          reason: 'goods purchase (ex-works)',
        });
        // XB3a-2/CASH: THE CARRIER IS PAID BY THE BUYER, by name. The carriers have been real
        // companies since XB3a-2 — real fleets, real fuel at the refined-product price, real crew
        // through the labour market, listed equity, a home bank — but this leg paid the boundary
        // and the carrier's freight then arrived on its books as `non-auction operating receipts`,
        // also from the boundary. Two anonymous ends of one payment whose parties are both known.
        //
        // It is also ONE quantity now (rule 3). The carriers' revenue used to be re-derived from
        // `shippedTonnesByLane x rate x share` further down this stage — a second computation of
        // the same freight, in the carrier's money rather than the buyer's, which could not agree
        // with what any buyer was charged. What a carrier earned is what its customers paid it.
        const freightUSD = l.units * (perUnit - exWorksBuyerMoney);
        if (freightUSD > 0) {
          const lane = laneKey(origin, plan.regionId);
          const shares = ctx.freightClearing?.carrierShareByLane.get(lane);
          let paidUSD = 0;
          shares?.forEach((share, carrierTicker) => {
            const amountUSD = freightUSD * share;
            if (!(amountUSD > 0)) return;
            paidUSD += amountUSD;
            ctx.carrierFreightRevenue[carrierTicker] = (ctx.carrierFreightRevenue[carrierTicker] ?? 0) + amountUSD;
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: comp.ticker },
              payee: { kind: 'COMPANY', ticker: carrierTicker },
              amountUSD,
              reason: 'freight paid to the carrier',
            });
          });
          // A lane no carrier serves is priced at the SPEC marginal rate (what it would cost to
          // sail it), and the goods still moved. There is nobody to pay, so it stays a declared
          // boundary line — and one that shrinks to nothing as the fleet reaches every lane.
          const unservedUSD = freightUSD - paidUSD;
          if (unservedUSD > 0.01) {
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: comp.ticker },
              payee: { kind: 'UNMODELED', region: plan.regionId },
              amountUSD: unservedUSD,
              reason: 'freight on a lane no carrier serves',
            });
          }
        }
        if (arrivalWeek <= nextWeek) {
          addInputInventory(companyUpdates[comp.ticker], comp, subUnitId, l.sellerKey, l.units, l.units * perUnit, nextWeek);
        } else {
          ctx.shipmentsDispatched.push({
            buyerTicker: comp.ticker, sellerKey: l.sellerKey, subUnitId,
            units: l.units, landedCostPerUnit: perUnit, arrivalWeek,
          });
        }
        // XB3a-5: a cross-border sale between two real books is INVOICED — in whichever currency
        // costs the pair least to carry the risk in, on terms the buyer's own credit supports —
        // and the cash follows when it falls due. A lot whose buyer is a household or government
        // aggregate has no cash leg here to defer, so deferring one would invent an exposure.
        const seller = lookup.byTicker.get(l.sellerKey);
        if (!seller) return;
        // IND12 — DOMESTIC TRADE CREDIT. The whole machinery below — terms set by the buyer's own
        // credit, a receivable on one book and a payable on the other, cash that follows when it
        // falls due, and a write-off when a counterparty dies — was built for XB3a-5 and then
        // gated to CROSS-BORDER sales by this one line. Trade credit outstanding exceeds bank
        // credit in reality, and almost all of it is domestic: a B2B sale at home is on terms for
        // exactly the same reason a B2B sale abroad is, and it is the channel through which one
        // customer's default reaches its suppliers' books.
        //
        // A domestic pair invoices in its OWN currency, which is not a choice to be made: both
        // sides are in that money already, so there is no exposure to place and nothing for
        // `chooseInvoiceRegion` to weigh. That is the ONE difference between the two cases.
        const isDomestic = origin === plan.regionId;
        let invoiceRegion: RegionId;
        if (isDomestic) {
          invoiceRegion = plan.regionId;
        } else {
          let invRow = invoiceRegionCache.get(origin);
          if (!invRow) { invRow = new Map(); invoiceRegionCache.set(origin, invRow); }
          const cached = invRow.get(plan.regionId);
          if (cached === undefined) {
            invoiceRegion = chooseInvoiceRegion({
              sellerRegion: origin,
              buyerRegion: plan.regionId,
              candidates: MARKET_REGION_IDS,
              illiquidity: sourcing.fxPairIlliquidity,
              quotedPairs: sourcing.quotedPairs,
              sellerIsShort: sourcing.sellerIsShort(subUnitId, origin),
            });
            invRow.set(plan.regionId, invoiceRegion);
          } else {
            invoiceRegion = cached;
          }
        }
        const currency = invoiceCurrencyOf(invoiceRegion);
        const usdPerCurrency = sourcing.fxToUsd(invoiceRegion);
        if (!(usdPerCurrency > 0)) return;
        // IND12 — the invoice is what the SELLER is owed: ex-works, not landed. The freight in
        // `perUnit` belongs to the carrier and was paid to it above, so putting it on the
        // receivable had the seller lending its customer money the carrier had already taken.
        // It is also the amount the ex-works payment leg moves, so the credit extended below
        // and the cash collected at maturity are the same figure in the same units.
        const invoicedUSD = l.units * exWorksBuyerMoney;
        let buyerPd = sourcing.buyerAnnualPdByTicker.get(comp.ticker);
        if (buyerPd === undefined) {
          buyerPd = computeAnnualDefaultProbability(comp);
          sourcing.buyerAnnualPdByTicker.set(comp.ticker, buyerPd);
        }
        const termWeeks = paymentTermWeeks({
          buyerAnnualDefaultProbability: buyerPd,
          recoveryRate: seller.recoveryRate ?? 0.4,
          sellerMarginShare: Math.max(0, (seller.ebitda ?? 0) / Math.max(1, seller.annualRevenue ?? 1)),
          sellerCashUSD: seller.cash ?? 0,
          sellerWeeklySalesUSD: (seller.annualRevenue ?? 0) / 52,
        });
        ctx.tradeInvoicesBooked.push({
          sellerTicker: l.sellerKey, sellerRegion: origin,
          buyerTicker: comp.ticker, buyerRegion: plan.regionId,
          subUnitId, currency,
          amountCurrency: invoicedUSD / usdPerCurrency,
          bookedUsdPerCurrency: usdPerCurrency,
          weekBooked: nextWeek,
          weekDue: nextWeek + termWeeks,
        });
        deferredPurchaseUSD.set(plan.key!, (deferredPurchaseUSD.get(plan.key!) ?? 0) + invoicedUSD);
        deferredSaleKeyed.set(l.sellerKey, (deferredSaleKeyed.get(l.sellerKey) ?? 0) + invoicedUSD);
        // CASH — trade credit is a loan between two NAMED firms, so it moves between them.
        // The buyer paid ex-works above, as it must (the seller's revenue is recognised at
        // delivery); the seller hands it straight back as the credit it agreed to extend, and
        // takes it again when the invoice falls due (trade-settlement.ts). Both legs used to be
        // posted against the UNMODELED boundary on stage 08's cash walk — 9.2B gross over ten
        // weeks passing through a counterparty that does not exist, when the counterparty is
        // right here and has a name.
        pay(ctx, {
          payer: partyOfKey(l.sellerKey, origin, lookup),
          payee: { kind: 'COMPANY', ticker: comp.ticker },
          amountUSD: invoicedUSD,
          reason: 'trade credit extended',
        });
      });
    });
    if (units <= 0.0001) return;
    if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
    const custUp = companyUpdates[comp.ticker];
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + units;
    custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + landedCost;
    if (purchaseKindOf(subUnitId) === 'CAPITAL_GOOD') custUp.capexPurchasesUSD = (custUp.capexPurchasesUSD ?? 0) + landedCost;
    const owed = deferredPurchaseUSD.get(plan.key!) ?? 0;
    if (owed > 0) custUp.tradePayableBookedUSD = (custUp.tradePayableBookedUSD ?? 0) + owed;
  });
  // The mirror on the sellers: revenue is recognised at delivery in full; what is deferred is the
  // CASH, which stage 08's ledger backs out until the invoice settles.
  deferredSaleKeyed.forEach((amount, sellerKey) => {
    const seller = lookup.byTicker.get(sellerKey);
    if (!seller || !(amount > 0)) return;
    if (!companyUpdates[seller.ticker]) companyUpdates[seller.ticker] = {};
    companyUpdates[seller.ticker].tradeReceivableBookedUSD =
      (companyUpdates[seller.ticker].tradeReceivableBookedUSD ?? 0) + amount;
  });

  // SETL-C: the AGGREGATE buyers pay too. A seller's revenue includes what households and the
  // government took, and routing only the company buyers' payments left those sellers credited
  // with revenue nobody had paid. Households and the treasury are real account holders, so each
  // book's non-corporate fills are paid to its sellers pro rata by what each actually sold.
  MARKET_REGION_IDS.forEach(origin => {
    const book = results[origin];
    const sellerTotalUSD = Array.from(book.salesByKey.values()).reduce((a, v) => a + v.amount, 0);
    if (!(sellerTotalUSD > 0)) return;
    let corporatePaidUSD = 0;
    // SEG2b: the segments pay for what THEY buy (capex bids, recipe inputs), pro rata to the
    // book's sellers like the other aggregate buyers. Their fills used to sit inside the
    // household/government remainder below — in `sellerTotalUSD` but in nobody's claim — so the
    // two real aggregate buyers were billed for the tier's purchases on top of their own.
    let segmentPaidUSD = 0;
    const segmentBuysByKey = new Map<string, number>();
    book.purchasesByKey.forEach((buy, key) => {
      if (lookup.byKey.get(key)) { corporatePaidUSD += buy.amount; return; }
      if (key.startsWith('PRIVATE:')) {
        segmentPaidUSD += buy.amount;
        segmentBuysByKey.set(key, (segmentBuysByKey.get(key) ?? 0) + buy.amount);
      }
    });
    segmentBuysByKey.forEach((amountUSD, segKey) => {
      const segParty = partyOfKey(segKey, origin, lookup);
      book.salesByKey.forEach((sale, sellerKey) => {
        pay(ctx, {
          payer: segParty,
          payee: partyOfKey(sellerKey, origin, lookup),
          amountUSD: amountUSD * (sale.amount / sellerTotalUSD),
          reason: 'segment goods purchase',
        });
      });
    });
    const aggregateUSD = Math.max(0, sellerTotalUSD - corporatePaidUSD - segmentPaidUSD);
    if (!(aggregateUSD > 0)) return;
    // Split what remains between the two aggregate buyers by what each actually took.
    const hhUnitsAll = MARKET_REGION_IDS.reduce((a, r) => a + (book.householdFillUnitsByRegion[r] ?? 0), 0);
    const govUsdAll = MARKET_REGION_IDS.reduce((a, r) => a + (book.governmentSpendUSDByRegion[r] ?? 0), 0);
    const hhUsdAll = hhUnitsAll * book.clearedPriceUSD;
    const claimUSD = hhUsdAll + govUsdAll;
    if (!(claimUSD > 0)) return;
    book.salesByKey.forEach((sale, sellerKey) => {
      const sellerShare = sale.amount / sellerTotalUSD;
      MARKET_REGION_IDS.forEach(buyerRegion => {
        const hhUSD = ((book.householdFillUnitsByRegion[buyerRegion] ?? 0) * book.clearedPriceUSD / claimUSD) * aggregateUSD * sellerShare;
        const govUSD = ((book.governmentSpendUSDByRegion[buyerRegion] ?? 0) / claimUSD) * aggregateUSD * sellerShare;
        pay(ctx, { payer: { kind: 'HOUSEHOLD', region: buyerRegion }, payee: partyOfKey(sellerKey, origin, lookup), amountUSD: hhUSD, reason: 'household goods purchase' });
        // IND16: AND THE CHANNEL'S CUT, paid by the household that bought out of its stock, to
        // the firms that held it — by name, exactly as the carriers are paid their freight. The
        // producer received the factory gate above; this is the rest of what the household spent.
        // A household's distribution spend used to reach this sector as a buyer-mix share of the
        // logistics book instead, which paid it for the same work in a second place (rule 3).
        const buyerReg = ctx.updatedRegions[buyerRegion];
        const channelUSD = hhUSD * channelMarginRate(
          subUnitId, buyerReg?.zeroRates?.tenor3M ?? buyerReg?.policyRate ?? 0);
        if (channelUSD > 0) {
          const shares = ctx.channelShareByRegion[buyerRegion];
          shares?.forEach((share, distributorTicker) => {
            const amountUSD = channelUSD * share;
            if (!(amountUSD > 0)) return;
            ctx.channelMarginRevenue[distributorTicker] = (ctx.channelMarginRevenue[distributorTicker] ?? 0) + amountUSD;
            pay(ctx, {
              payer: { kind: 'HOUSEHOLD', region: buyerRegion },
              payee: { kind: 'COMPANY', ticker: distributorTicker },
              amountUSD,
              reason: 'distribution margin paid to the channel',
            });
          });
          // A region with no distribution firm has no channel to pay and no margin is charged —
          // nothing goes to the boundary here, because the margin only exists where somebody
          // earns it.
        }
        pay(ctx, { payer: { kind: 'GOVERNMENT', region: buyerRegion }, payee: partyOfKey(sellerKey, origin, lookup), amountUSD: govUSD, reason: 'government procurement' });
      });
    });
  });

  // --- 10. Aggregate buyers: the household durable stock and the treasury's realized spend.
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    let hhUnits = 0;
    let govSpend = 0;
    MARKET_REGION_IDS.forEach(origin => {
      hhUnits += results[origin].householdFillUnitsByRegion[regionId] ?? 0;
      const spendOriginMoney = results[origin].governmentSpendUSDByRegion[regionId] ?? 0;
      govSpend += convertLocal(spendOriginMoney, origin, regionId, sourcing.fxToUsd);
    });
    if (subUnitId === 'passenger_vehicles' && hhUnits > 0) {
      reg.householdState.durableGoodsStockUnits = (reg.householdState.durableGoodsStockUnits ?? 0) + hhUnits;
    }
    if (govSpend > 0) reg.governmentProcurementSpentUSD = (reg.governmentProcurementSpentUSD ?? 0) + govSpend;
  });

  // --- 11. Contract formation, once per buyer per week across the books it bought in.
  formContracts(subUnitId, results, supplyPlans, demandPlans, publishedPrice, survivingContracts);

  // --- 12. Publish the week's prices and metrics.
  // SCALE: one pass over the plans instead of a filtered reduce per region — each plan belongs
  // to exactly one region, so every region's total receives the same additions in the same order.
  const demandUnitsByRegion = new Map<RegionId, number>();
  demandPlans.forEach(p => {
    demandUnitsByRegion.set(p.regionId, (demandUnitsByRegion.get(p.regionId) ?? 0) + p.demandUnits);
  });
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId];
    if (!demandState) return;
    demandState.exWorksUnitPriceUSD = Number(results[regionId].clearedPriceUSD.toFixed(2));
    demandState.unitPriceUSD = Number(publishedPrice[regionId].toFixed(2));
    // IND16: the third price level, and the one a household actually faces. Ex-works is what the
    // producer received, `unitPriceUSD` is what it cost delivered — what a BUSINESS pays for its
    // inputs — and this is what it costs on a shelf, once the channel's cover is paid for. Three
    // real steps, each with a real payee; recipes and the price indices keep reading the landed
    // one, because that is genuinely what a firm pays.
    const reg05 = ctx.updatedRegions[regionId];
    demandState.shelfUnitPriceUSD = Number(shelfPriceUSD(
      publishedPrice[regionId], subUnitId, reg05?.zeroRates?.tenor3M ?? reg05?.policyRate ?? 0).toFixed(2));

    const contracts = survivingContracts[regionId];
    const contractUnits = contracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
    demandState.totalUnitsSuppliedThisWeek = results[regionId].clearedUnits + contractUnits;
    demandState.totalUnitsDemandedThisWeek = (demandUnitsByRegion.get(regionId) ?? 0) + contractUnits;
    const landedPrice = demandState.unitPriceUSD ?? 0;
    const priorBase = demandState.baseUnitPriceUSD ?? 0;
    const basePrice = priorBase > 0 ? priorBase : landedPrice;
    demandState.baseUnitPriceUSD = basePrice;
    demandState.clearedInputPriceIndex = Number((landedPrice / basePrice).toFixed(4));
  });

    return survivingContracts;
}

/** Which region a settlement key buys for. Company tickers are globally unique; the aggregate
 *  and private-segment keys carry their region in the key itself. */
function buyerRegionOfKey(key: string, lookup: GlobalFirmLookup): RegionId | undefined {
  const company = lookup.byTicker.get(key);
  if (company) return company.region as RegionId;
  const parts = key.split(':');
  if (parts.length >= 2) {
    const candidate = parts[1] as RegionId;
    if (MARKET_REGION_IDS.includes(candidate)) return candidate;
  }
  return undefined;
}

function formContracts(
  subUnitId: string,
  results: Record<RegionId, BookResult>,
  supplyPlans: SupplyPlan[],
  demandPlans: DemandPlan[],
  regionPublishedPrice: Record<RegionId, number>,
  survivingContracts: Record<RegionId, SupplyContract[]>
): void {
  const inMoneyOfferKeys = new Set<string>();
  const inMoneyBidKeys = new Set<string>();
  MARKET_REGION_IDS.forEach(r => {
    results[r].inMoneyOfferKeys.forEach(k => inMoneyOfferKeys.add(k));
    results[r].inMoneyBidKeys.forEach(k => inMoneyBidKeys.add(k));
  });

  const candidateSuppliers = supplyPlans.filter(p => p.company && inMoneyOfferKeys.has(p.key));
  if (candidateSuppliers.length === 0) return;
  // IND14 — RELIABILITY IS PRICED INTO SOURCING. Who a buyer contracts with was a uniform random
  // draw over everyone in the money: a supplier that had failed to deliver for a year was as
  // likely to win the next contract as one that never missed. The merit order already prices
  // landed cost; this is the other half of a real sourcing decision, and IND11's delivery record
  // is what makes it measurable rather than asserted.
  //
  // The weight is the record itself — a supplier that ships 60% of what it owes is drawn 60% as
  // often as a perfect one — with a floor, because a firm nobody can ever contract with again
  // could never recover, and the model has no re-entry for that (DYN's).
  const reliabilityWeights = candidateSuppliers.map(p =>
    Math.max(SUPPLIER_MIN_SOURCING_WEIGHT, Math.min(1, p.company!.deliveryReliability ?? 1)));
  const reliabilityTotal = reliabilityWeights.reduce((a, w) => a + w, 0);
  const drawSupplier = (): SupplyPlan => {
    let x = random() * reliabilityTotal;
    for (let i = 0; i < candidateSuppliers.length; i++) {
      x -= reliabilityWeights[i];
      if (x <= 0) return candidateSuppliers[i];
    }
    return candidateSuppliers[candidateSuppliers.length - 1];
  };
  const totalSuppliersRevenue = supplyPlans.reduce((s, p) => s + (p.company?.annualRevenue ?? 0), 0);

  demandPlans.forEach(bidPlan => {
    if (!bidPlan.company || !bidPlan.key || !inMoneyBidKeys.has(bidPlan.key)) return;
    const supplierPlan = drawSupplier();
    if (random() >= 0.15) return;
    const supplierComp = supplierPlan.company!;
    const customerComp = bidPlan.company;

    const supplierMarketShare = supplierComp.annualRevenue / Math.max(1, totalSuppliersRevenue);
    const relativeSize = customerComp.annualRevenue / Math.max(1, supplierComp.annualRevenue);
    const supplierPowerFactor = 0.5 + (supplierMarketShare - 0.25) * 0.5;
    const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
    let contractPrice = regionPublishedPrice[bidPlan.regionId] * (1.0 - (customerBargainingPower - 0.3) * 0.05);
    let duration = 12 + Math.floor(random() * 40);

    // Hedging for revenue volatility
    const revHist = customerComp.revenueHistory || [];
    let revVol = 0;
    if (revHist.length > 3) {
      const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
      const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
      revVol = Math.sqrt(varRev) / meanRev;
    }
    if (revVol > 0.05) {
      duration = 52 + Math.floor(random() * 52); // Seek longer contracts
      const impliedPd = Math.max(0, Math.min(1, 1 / (1 + Math.exp(customerComp.interestCoverage * 0.8 - customerComp.leverage * 0.4))));
      const costOfCapital = 0.05 + (impliedPd * 0.60);
      contractPrice *= (1.0 + costOfCapital * 0.20);
    }

    // A contract is the locked-price form of the buyer's REAL demand — never an independent
    // quantity. The previous sizing was a hardcoded random ladder (2,000–12,000 units/week
    // regardless of who was buying), which for a five-figure-per-unit input committed a buyer to
    // tens of millions a week it had no use for. Invisible for as long as cash never settled;
    // the S5 ledger exposed it immediately (§7.24). The buyer locks a share of the weekly need
    // its own bid already expresses, capped by what this supplier actually offered.
    const baseContractUnits = Math.min(bidPlan.demandUnits * CONTRACTED_DEMAND_SHARE, supplierPlan.openOfferUnits);
    if (baseContractUnits <= 0.001) return;

    survivingContracts[bidPlan.regionId].push({
      supplierCompanyId: supplierPlan.key,
      customerCompanyId: bidPlan.key,
      subUnitId,
      priceUSD: Number(contractPrice.toFixed(2)),
      quantityUnitsPerWeek: Number(baseContractUnits.toFixed(2)),
      weeksRemaining: duration,
      backlogUnits: 0,
      shortWeeks: 0,
      // IND11 — a long contract is indexed to the price it was struck against; a short one is
      // not. Which of the two a firm signs is decided here, by the term it wanted.
      escalationBaseUSD: duration >= CONTRACT_INDEXATION_MIN_WEEKS
        ? regionPublishedPrice[bidPlan.regionId] : undefined,
    });
  });
}



export function runUnitBiddingStage(state: GameState, ctx: WeeklyStepContext): void {
  const { byRegion: indexes, lookup } = buildMarketIndexes(ctx);

  MARKET_REGION_IDS.forEach(exporter => {
    MARKET_REGION_IDS.forEach(importer => { ctx.bilateralTradeWeeklyUSD[exporter][importer] = 0; });
  });
  ctx.shippedTonnesByLane = {};
  ctx.carrierFreightRevenue = {};
  // IND16: who runs the channel in each region, weighted by the size of each firm's own
  // distribution line — the same sector that sells the service, earning the margin households pay
  // inside the shelf price rather than buying-mix revenue it was being paid twice for.
  ctx.channelMarginRevenue = {};
  ctx.channelShareByRegion = {};
  MARKET_REGION_IDS.forEach((regionId) => {
    const weights = new Map<string, number>();
    let total = 0;
    ctx.prevActiveFirms.forEach((c) => {
      if (c.region !== regionId) return;
      const w = (c.productLines || []).reduce((a, line) => (
        line.subUnitId === DISTRIBUTION_SUBUNIT_ID
          ? a + Math.max(0, c.annualRevenue) * (line.revenueShare ?? 0) : a), 0);
      if (w > 0) { weights.set(c.ticker, w); total += w; }
    });
    if (total > 0) weights.forEach((w, t) => weights.set(t, w / total));
    ctx.channelShareByRegion[regionId] = total > 0 ? weights : new Map();
  });
  ctx.carrierTonneNm = {};
  ctx.shipmentsDispatched = [];
  ctx.tradeInvoicesBooked = [];

  const sourcing: SourcingContext = {
    splitByRegionSubUnit: ctx.sourcingSplitByRegionSubUnit,
    freightRateByLane: ctx.freightRatePerTonneLaneMoneyByLane,
    unitMassTonnes: state.unitMassTonnes,
    // Snapshotted ONCE: getFxToUsd scans the pair list per call, and stage 05 converts per LOT.
    // Same values, one table lookup instead of a linear search (rates are fixed within the pass).
    fxToUsd: fromTable(snapshotFxToUsd(MARKET_REGION_IDS, (r) => getFxToUsd(state.fxPairs, r))),
    fxPairIlliquidity: state.fxPairIlliquidity ?? {},
    quotedPairs: state.fxPairs.map(p => ({ base: p.base, quote: p.quote })),
    sellerIsShort: (subUnitId: string, origin: RegionId) => {
      const d = ctx.updatedRegions[origin]?.categoryDemand[subUnitId];
      return (Number(d?.totalUnitsDemandedThisWeek) || 0) > (Number(d?.totalUnitsSuppliedThisWeek) || 0);
    },
    buyerAnnualPdByTicker: new Map(),
  };

  const contractsByRegionBySubUnit = {} as Record<RegionId, Map<string, SupplyContract[]>>;
  MARKET_REGION_IDS.forEach(regionId => {
    const map = new Map<string, SupplyContract[]>();
    (ctx.updatedRegions[regionId].activeContracts || []).forEach(c => {
      const bucket = map.get(c.subUnitId);
      if (bucket) bucket.push(c); else map.set(c.subUnitId, [c]);
    });
    contractsByRegionBySubUnit[regionId] = map;
  });

  // §7.222 — each market draws from its OWN stream, not from wherever the shared one has reached.
  // This does NOT make the loop parallel: §7.222 measured that stage 05 stays order-dependent with
  // the scope in place, because the markets are coupled through each firm's single budget, spent
  // market by market (see §6.1's declaration-order row). What the scope fixes is the separate
  // defect it exposed — a market's bid noise was a function of its position in a source file's
  // declaration list rather than of the market.
  Object.values(INDUSTRY_SUBUNITS).flat().forEach(subUnit => {
    const savedStream = beginEntityScope(subUnit.unitId, ctx.nextWeek);
    const own = {} as Record<RegionId, SupplyContract[]>;
    MARKET_REGION_IDS.forEach(r => { own[r] = contractsByRegionBySubUnit[r].get(subUnit.unitId) ?? []; });
    const survivors = runSubUnitMarkets(
      ctx, subUnit.unitId,
      subUnit.buyerMix.GOVERNMENT ?? 0, subUnit.buyerMix.HOUSEHOLD ?? 0,
      indexes, lookup, own, sourcing
    );
    MARKET_REGION_IDS.forEach(r => { contractsByRegionBySubUnit[r].set(subUnit.unitId, survivors[r]); });
    endEntityScope(savedStream);
  });

  MARKET_REGION_IDS.forEach(regionId => {
    const reassembled: SupplyContract[] = [];
    contractsByRegionBySubUnit[regionId].forEach(bucket => { bucket.forEach(c => reassembled.push(c)); });
    ctx.updatedRegions[regionId].activeContracts = reassembled;
  });

  // Carriers are paid for what actually SHIPPED, not for what was booked — booked space that went
  // unused earns nothing, which is what a spot charter is. The MONEY for it moved above, from the
  // buyers, at the moment each lot was priced; what is left here is the physical work done, which
  // is what the fleet's utilisation and its scrapping/ordering decisions read.
  const clearing = ctx.freightClearing;
  if (clearing) {
    Object.keys(ctx.shippedTonnesByLane).forEach(lane => {
      const tonnes = ctx.shippedTonnesByLane[lane];
      if (!(tonnes > 0)) return;
      const origin = lane.split('>')[0] as RegionId;
      const shares = clearing.carrierShareByLane.get(lane);
      if (!shares || shares.size === 0) return;
      shares.forEach((share, ticker) => {
        if (!lookup.byTicker.get(ticker)) return;
        ctx.carrierTonneNm[ticker] = (ctx.carrierTonneNm[ticker] ?? 0)
          + tonnes * share * laneDistanceNm(origin, lane.split('>')[1] as RegionId);
      });
    });
  }

  // Everything dispatched this week joins what is already on the water — appended in place, the
  // same order the spread produced, without copying tens of thousands of live entries weekly.
  if (!state.goodsInTransit) state.goodsInTransit = [];
  for (const sh of ctx.shipmentsDispatched) state.goodsInTransit.push(sh);
  if (!state.tradeInvoices) state.tradeInvoices = [];
  for (const inv of ctx.tradeInvoicesBooked) state.tradeInvoices.push(inv);

  // DER/rule 3: ONE realised-vol estimator (domain/volatility.ts). The local copy that stood here
  // carried its own 0.16 fallback, so a market with too little history was reported as being at
  // exactly its own baseline — which reads as "no excess vol" whether that is true or unknown.
  // Unknown is now unknown: no history, no component.
  const realizedIndexVol = realizedAnnualVol(state.compositeIndices.usaComposite.historical, 13);
  const baselineVol = 0.16;
  const usaRegime = ctx.updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  ctx.marketVolComponent = (realizedIndexVol === undefined
    ? 0
    : Math.max(0, realizedIndexVol - baselineVol) * 0.5) + regimeVolPremium;
}
