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
import { categoryPriceTier, HOUSEHOLD_BID_BASE_PREMIUM, HOUSEHOLD_BID_PREMIUM_BY_TIER } from '../../../domain/industry';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { SECTOR_PPE_USEFUL_LIFE_YEARS } from '../constants';
import { CATEGORY_INPUT_REQUIREMENTS, PRIVATE_SEGMENT_SUPPLY_CATEGORIES, PRIVATE_SEGMENT_SUPPLY_SHARE, CAPEX_SUPPLIER_WEIGHTS, CAPEX_CATEGORY_PRIVATE_SEGMENT, CAPEX_PUBLIC_SUPPLY_SHARE } from '../../../domain/market-microstructure';
import { isActiveCompany, getOutputInventoryUnits, getOutputInventoryUSD, InputLot } from '../../../domain/company';
import { subUnitTradability, createSeedGlobalGoodsMarket, GlobalGoodsMarketState } from '../../../domain/global-goods';
import { WeeklyStepContext } from './context';
import { random, getRngState, setRngState } from '../../rng';
import { clearDoubleAuction, AuctionBid, AuctionOffer, AuctionFill } from './double-auction';
import { createInitialContext } from './context';
import { GOVERNMENT_BID_PRICE_TOLERANCE } from '../../../domain/government';

export const MARKET_REGION_IDS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

// 1$ is 1$ Phase 3: a private-sector "company ID" for the auction — distinguishable from any
// real ticker so the post-clearing crediting step can tell it apart from a real company sale.
// XB3a qualifies it by region: four regions each run a MANUFACTURING segment, and in the world
// book they are four different counterparties bidding against each other.
const privateSegmentOfferId = (regionId: RegionId, segmentType: string) => `PRIVATE:${regionId}:${segmentType}`;
// Share of a buyer's real weekly input need it locks under a long-term contract when one forms;
// the rest stays spot-purchased. Real procurement splits roughly this way.
const CONTRACTED_DEMAND_SHARE = 0.6;

// 1$ is 1$ Phase 2: this company's real weekly need for inputSubUnitId, from the same literal
// recipe (CATEGORY_INPUT_REQUIREMENTS) that 08-company-fundamentals.ts uses to draw down input
// inventory — bidding to this real, recipe-derived need (instead of a generic revenue-share
// slice of aggregate corporate demand) is what makes what a company buys here actually match
// what it consumes there, rather than two independently-sized, unrelated numbers.
function computeRecipeInputNeedUSD(comp: Company, inputSubUnitId: string): number {
  return (comp.productLines || []).reduce((sum, line) => {
    const reqs = CATEGORY_INPUT_REQUIREMENTS[line.industry];
    const intensity = reqs?.[inputSubUnitId];
    if (!intensity) return sum;
    return sum + (comp.annualRevenue / 52) * (line.revenueShare ?? 1.0) * intensity;
  }, 0);
}

function setOutputInventory(update: any, subUnitId: string, unitsHeld: number, unitPriceUSD: number) {
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld, valueUSD: unitsHeld * unitPriceUSD };
}

// 1$ is 1$ Phase 2/6: credit a real purchase onto the buyer's persisted input inventory as a
// NEW LOT — appended on top of whatever this same company already holds (and whatever it
// already bought this same week via a different subUnitId's auction pass or a different real
// seller), not merged into one blended average, since the whole point is to keep each real
// purchase's real counterparty and real price distinguishable (see domain/company.ts's
// InputLot doc comment) rather than collapsing them the moment they're credited.
function addInputInventory(update: any, baseComp: Company, subUnitId: string, sellerId: string, addedUnits: number, addedValueUSD: number, week: number) {
  if (addedUnits <= 0.0001) return;
  if (!update.inputInventoryBySubUnit) update.inputInventoryBySubUnit = {};
  const existingLots: InputLot[] = update.inputInventoryBySubUnit[subUnitId] ?? [...(baseComp.inputInventoryBySubUnit?.[subUnitId] ?? [])];
  update.inputInventoryBySubUnit[subUnitId] = [
    ...existingLots,
    { sellerId, unitsHeld: addedUnits, unitPriceUSD: addedValueUSD / addedUnits, acquiredWeek: week },
  ];
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
  const lookup: GlobalFirmLookup = { byTicker: new Map(), byId: new Map() };

  // HC3: the goods market has never cared who owns a supplier's equity — public and private
  // firms bid and offer in the same real auction.
  const walk = (c: Company) => {
    if (!isActiveCompany(c)) return;
    const index = byRegion[c.region as RegionId];
    if (!index) return;
    lookup.byTicker.set(c.ticker, c);
    lookup.byId.set(c.id, c);
    index.activeFirms.push(c);
    if ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0) > 0) index.capexBuyers.push(c);
    (c.productLines || []).forEach((l) => {
      const arr = index.suppliersBySubUnit.get(l.subUnitId);
      if (arr) arr.push(c); else index.suppliersBySubUnit.set(l.subUnitId, [c]);
      const reqs = CATEGORY_INPUT_REQUIREMENTS[l.industry];
      if (reqs) {
        Object.keys(reqs).forEach(inputSubUnitId => {
          if (!(reqs as any)[inputSubUnitId]) return;
          const buyers = index.recipeInputBuyersBySubUnit.get(inputSubUnitId);
          // A firm with two lines needing the same input is one buyer, not two: its need is
          // summed by computeRecipeInputNeedUSD when it bids.
          if (buyers) { if (buyers[buyers.length - 1] !== c) buyers.push(c); }
          else index.recipeInputBuyersBySubUnit.set(inputSubUnitId, [c]);
        });
      }
    });
  };
  ctx.prevActiveFirms.forEach(walk);
  ctx.prevActivePrivateFirms.forEach(walk);
  return { byRegion, lookup };
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
  segmentType?: string;
  initialInventoryUnits: number;
  targetProductionUnits: number;
  targetProductionUSD: number;
  contractSalesCommittedUnits: number;
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
  contractSalesUnitsBySupplier: Record<string, number>
): SupplyContract[] {
  const { companyUpdates, nextWeek } = ctx;
  const remainingContracts: SupplyContract[] = [];

  ownContracts.forEach(contract => {
    const supplier = lookup.byTicker.get(contract.supplierCompanyId) ?? lookup.byId.get(contract.supplierCompanyId);
    const customer = lookup.byTicker.get(contract.customerCompanyId) ?? lookup.byId.get(contract.customerCompanyId);
    if (!supplier || !customer) return;

    if (!isActiveCompany(supplier)) {
      // Supplier default shock propagates directly to named contract counterparties first
      if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};
      const custUp = companyUpdates[customer.ticker];
      custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, 0.70);
      return;
    }
    if (!isActiveCompany(customer)) return;

    contract.weeksRemaining -= 1;
    if (contract.weeksRemaining < 0) return;

    const supplierUnits = getOutputInventoryUnits(supplier, subUnitId);
    const actualTransacted = Math.min(contract.quantityUnitsPerWeek, supplierUnits);
    const paymentUSD = actualTransacted * contract.priceUSD;
    const fillRate = contract.quantityUnitsPerWeek > 0 ? actualTransacted / contract.quantityUnitsPerWeek : 1.0;

    if (!companyUpdates[supplier.ticker]) companyUpdates[supplier.ticker] = {};
    if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};

    const supUp = companyUpdates[supplier.ticker];
    // The contract leg's own inventory write. For a supplier that still produces this sub-unit
    // the open-market settlement below overwrites it with the full week's arithmetic; for one
    // that has stopped producing and is only working off a live contract, this is the only write
    // there is — and without it the units ship and the warehouse is never debited.
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

    const custUp = companyUpdates[customer.ticker];
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + actualTransacted;
    custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + paymentUSD;
    addInputInventory(custUp, customer, subUnitId, supplier.ticker, actualTransacted, paymentUSD, nextWeek);

    if (fillRate < 0.95) {
      // Named shock propagation: reduced fill rate constrains customer capacity directly
      custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0.3, fillRate));
    }

    remainingContracts.push(contract);
  });

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
  contractUnitsBySupplier: Map<string, number>,
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
    const productionThrottle = Math.max(0.3, Math.min(1.0, 1.0 - (inventoryToCapacityRatio - 1.0) * 0.7));
    const priceSignal = (supplierExpectedUnitPriceUSD / referencePriceUSD) - 1.0;
    const productionResponseFactor = Math.max(0.5, Math.min(2.0, 1.0 + priceSignal * 1.5));

    // Production is capacity x utilisation, in UNITS. The previous version sized production in
    // dollars (annualRevenue/52) and divided by the CURRENT price, so a doubling of price halved
    // the units the same plant produced — supply fell as price rose, which is the wrong sign and
    // closes a positive feedback loop (§7.28). Real capacity is physical: what price changes is
    // how hard the plant is run (productionResponseFactor) and whether the warehouse is already
    // full (productionThrottle), never how much the plant can make.
    if (!(line.weeklyCapacityUnits! > 0)) {
      // Seeded from this line's real baseline output at the price prevailing when it first
      // trades — at week 1 that is the bootstrap price, so capacity opens exactly where the old
      // dollar-anchored figure did and only the response to later price moves changes.
      line.weeklyCapacityUnits =
        ((comp.baselineAnnualRevenue || comp.annualRevenue) / 52) * (line.revenueShare ?? 1.0) / referencePriceUSD;
    } else {
      // Real net investment grows the plant: growth capex less depreciation, over the capital
      // stock. Both are nominal dollars, so the ratio is real and inflation cancels out of it.
      const grossPPE = comp.grossPPEUSD ?? 0;
      const netPPE = Math.max(1, grossPPE - (comp.accumulatedDepreciationUSD ?? 0));
      const weeklyDepreciationUSD = grossPPE / ((SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12) * 52);
      const netInvestmentRate = ((comp.growthCapex ?? 0) / 52 - weeklyDepreciationUSD) / netPPE;
      line.weeklyCapacityUnits = Math.max(
        0.0001,
        line.weeklyCapacityUnits! * (1 + Math.max(-0.02, Math.min(0.02, netInvestmentRate)))
      );
    }
    const targetProductionUnits = line.weeklyCapacityUnits! * productionResponseFactor * productionThrottle;
    const currentUnits = getOutputInventoryUnits(comp, subUnitId);
    const contractSales = (contractUnitsBySupplier.get(comp.ticker) ?? 0) + (contractUnitsBySupplier.get(comp.id) ?? 0);
    const openOfferUnits = Math.max(0, targetProductionUnits + currentUnits - contractSales);

    const baseMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const costRate = Math.max(0.40, Math.min(0.98, 1 - baseMargin));
    const ratingPdMap: Record<string, number> = {
      'AAA': 0.0002, 'AA': 0.001, 'A': 0.003, 'BBB': 0.01, 'BB': 0.03, 'B': 0.08, 'CCC': 0.20
    };
    const pd = ratingPdMap[comp.creditRating] ?? 0.03;
    const expectedLoss = pd * 0.60;
    const costOfCapital = 0.05 + expectedLoss;
    const marginPremium = costOfCapital * 1.5;

    plans.push({
      key: comp.ticker,
      regionId,
      company: comp,
      initialInventoryUnits: currentUnits,
      targetProductionUnits,
      targetProductionUSD: targetProductionUnits * referencePriceUSD,
      contractSalesCommittedUnits: contractSales,
      openOfferUnits,
      minPriceUSD: referencePriceUSD * costRate * (1 + marginPremium),
    });
  });

  // 1$ is 1$ Phase 3: a real, sellable private-sector offer for categories where public company
  // supply can be sparse or entirely absent (confirmed: specialty_metals had zero real
  // suppliers in a sampled region) — a genuine named counterparty, not a residual write-off.
  const privateSegmentType = PRIVATE_SEGMENT_SUPPLY_CATEGORIES[subUnitId];
  if (privateSegmentType) {
    const segment = reg.privateSectorSegments?.find(s => s.segmentType === privateSegmentType);
    if (segment) {
      const segmentOfferUnits = ((segment.annualRevenueUSD / 52) * PRIVATE_SEGMENT_SUPPLY_SHARE) / referencePriceUSD;
      if (segmentOfferUnits > 0.001) {
        plans.push({
          key: privateSegmentOfferId(regionId, privateSegmentType),
          regionId,
          segmentType: privateSegmentType,
          initialInventoryUnits: 0,
          targetProductionUnits: 0,
          targetProductionUSD: 0,
          contractSalesCommittedUnits: 0,
          openOfferUnits: segmentOfferUnits,
          minPriceUSD: referencePriceUSD * 0.90,
        });
      }
    }
  }

  // 1$ is 1$ Phase 4: for capital-goods categories, the private segment is a real seller of
  // whatever share of the region's aggregate real capex demand in-region public producers don't
  // cover — the same CAPEX_PUBLIC_SUPPLY_SHARE split, as a real price-competing offer in the
  // actual auction rather than an un-auctioned credit to the segment's revenue.
  const capexPrivateSegmentType = isCapexSupplierCategory ? CAPEX_CATEGORY_PRIVATE_SEGMENT[subUnitId] : undefined;
  if (capexPrivateSegmentType) {
    const capexSegment = reg.privateSectorSegments?.find(s => s.segmentType === capexPrivateSegmentType);
    if (capexSegment) {
      const totalRegionCapexUSD = index.activeFirms.reduce((s, c) => s + ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)), 0);
      const totalCategoryCapexDemandUSD = totalRegionCapexUSD * capexSupplierWeight!;
      const privateShareUSD = (1 - CAPEX_PUBLIC_SUPPLY_SHARE) * totalCategoryCapexDemandUSD;
      const capexSegmentOfferUnits = (privateShareUSD / 52) / referencePriceUSD;
      if (capexSegmentOfferUnits > 0.001) {
        plans.push({
          key: privateSegmentOfferId(regionId, capexPrivateSegmentType),
          regionId,
          segmentType: capexPrivateSegmentType,
          initialInventoryUnits: 0,
          targetProductionUnits: 0,
          targetProductionUSD: 0,
          contractSalesCommittedUnits: 0,
          openOfferUnits: capexSegmentOfferUnits,
          minPriceUSD: referencePriceUSD * 0.90,
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
  hhShare: number
): DemandPlan[] {
  const plans: DemandPlan[] = [];
  const demandState = reg.categoryDemand[subUnitId] as any;
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
    (reg.privateSectorSegments || []).forEach(segment => {
      const segCapexUSD = segment.capexUSD ?? 0;
      if (segCapexUSD <= 0) return;
      const demandUnits = ((segCapexUSD / 52) * capexSupplierWeight!) / referencePriceUSD;
      if (demandUnits <= 0.001) return;
      plans.push({
        key: privateSegmentOfferId(regionId, segment.segmentType),
        regionId,
        demandUnits,
        maxPriceUSD: referencePriceUSD * (0.95 + random() * 0.1),
      });
    });
  }

  // 1$ is 1$ Phase 3 (demand-side): the MANUFACTURING segment is the private-sector stand-in
  // for real industrial production — it already sells upstream_extraction/specialty_metals
  // output and capital-goods capacity — so it also consumes the same literal recipe inputs a
  // real IndustrialsMachinery company would, closing the loop on its supply-side role with a
  // real purchase instead of leaving it a pure seller with no input demand of its own. (The
  // other segment types are deliberately left out: which categories they'd plausibly consume
  // isn't grounded in the existing data, and guessing is BP1's job to retire.)
  if (isRecipeInputCategory) {
    const manufacturingSegment = reg.privateSectorSegments?.find(s => s.segmentType === 'MANUFACTURING');
    const intensity = CATEGORY_INPUT_REQUIREMENTS['IndustrialsMachinery']?.[subUnitId];
    if (manufacturingSegment && intensity) {
      const demandUnits = ((manufacturingSegment.annualRevenueUSD / 52) * intensity) / referencePriceUSD;
      if (demandUnits > 0.001) {
        plans.push({
          key: privateSegmentOfferId(regionId, 'MANUFACTURING'),
          regionId,
          demandUnits,
          maxPriceUSD: referencePriceUSD * (0.95 + random() * 0.1),
        });
      }
    }
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
    let hhDemandUnits = ((demandState.demandLevelUSD * hhShare) / 52) / referencePriceUSD;

    if (subUnitId === 'passenger_vehicles') {
      const initialStock = reg.householdState.durableGoodsStockUnits ?? (((demandState.demandLevelUSD * hhShare) / referencePriceUSD) * 3.5);
      const scrappageRate = 0.12 / 52;
      const replacementDemandUnits = initialStock * scrappageRate;
      const targetStock = (reg.estimatedHouseholdIncomeUSD * (1 - reg.householdState.savingsRate) * 0.10) / referencePriceUSD;
      const expansionDemandUnits = Math.max(0, (targetStock - initialStock) * 0.05);
      hhDemandUnits = replacementDemandUnits + expansionDemandUnits;
      // Scrappage happens once a week, not once per book: the stock is retired here and this
      // week's fills are added back after both books have cleared.
      reg.householdState.durableGoodsStockUnits = initialStock - replacementDemandUnits;
    }

    if (hhDemandUnits > 0.001) {
      // HH4b: the willingness-to-pay premium is a PRICE-TIER property, not one frozen number —
      // households pay up for staples when supply tightens (the bottom cohorts' inelastic
      // food-and-energy demand) and walk away from luxury at the same price move (the top
      // cohorts' discretionary swing).
      const priceElasticityPremium = HOUSEHOLD_BID_BASE_PREMIUM
        * HOUSEHOLD_BID_PREMIUM_BY_TIER[categoryPriceTier(subUnitId)];
      plans.push({
        regionId,
        isHouseholdAggregate: true,
        demandUnits: hhDemandUnits,
        maxPriceUSD: referencePriceUSD * (1.0 + priceElasticityPremium),
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
function runSubUnitMarkets(
  ctx: WeeklyStepContext,
  state: GameState,
  subUnitId: string,
  govShare: number,
  hhShare: number,
  indexes: Record<RegionId, RegionMarketIndex>,
  lookup: GlobalFirmLookup,
  contractsByRegion: Record<RegionId, SupplyContract[]>
): Record<RegionId, SupplyContract[]> {
  const { companyUpdates, nextWeek } = ctx;
  const tradability = subUnitTradability(subUnitId);

  const isRecipeInputCategory = Object.values(CATEGORY_INPUT_REQUIREMENTS).some(reqs => (reqs as any)?.[subUnitId] !== undefined);
  const capexSupplierWeight = CAPEX_SUPPLIER_WEIGHTS[subUnitId];
  const isCapexSupplierCategory = capexSupplierWeight !== undefined;

  // --- 1. Each book's anchor price, read before anything this week moves it.
  const regionReferencePrice = {} as Record<RegionId, number>;
  const regionLocalAnchorPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId] as any;
    const published = demandState?.unitPriceUSD;
    regionReferencePrice[regionId] = published > 0 ? published : 1;
    const local = demandState?.localUnitPriceUSD;
    regionLocalAnchorPrice[regionId] = local > 0 ? local : regionReferencePrice[regionId];
  });

  // --- 2. Contracts settle first, region by region, against a global counterparty lookup.
  const contractSalesUnitsBySupplier: Record<string, number> = {};
  const survivingContracts = {} as Record<RegionId, SupplyContract[]>;
  MARKET_REGION_IDS.forEach(regionId => {
    survivingContracts[regionId] = settleContracts(
      ctx, subUnitId, contractsByRegion[regionId] ?? [], lookup, regionReferencePrice, contractSalesUnitsBySupplier
    );
  });

  // A firm's contract commitments span every region's book once contracts can be cross-border,
  // so they are indexed across all four rather than per region.
  const contractUnitsBySupplier = new Map<string, number>();
  const contractUnitsByCustomer = new Map<string, number>();
  MARKET_REGION_IDS.forEach(regionId => {
    survivingContracts[regionId].forEach(c => {
      contractUnitsBySupplier.set(c.supplierCompanyId, (contractUnitsBySupplier.get(c.supplierCompanyId) ?? 0) + c.quantityUnitsPerWeek);
      contractUnitsByCustomer.set(c.customerCompanyId, (contractUnitsByCustomer.get(c.customerCompanyId) ?? 0) + c.quantityUnitsPerWeek);
    });
  });

  // --- 3. The world book's own price state.
  let globalMarket: GlobalGoodsMarketState | undefined = state.globalGoodsMarkets[subUnitId];
  if (tradability > 0 && !globalMarket) {
    // Opens on the supply-weighted average of the regions' own prices, so the world book's first
    // week starts where the goods it is about to trade are already priced rather than at an
    // invented level (§7.4).
    let num = 0, den = 0;
    MARKET_REGION_IDS.forEach(regionId => {
      const w = (indexes[regionId].suppliersBySubUnit.get(subUnitId) ?? []).reduce((s, c) => s + c.annualRevenue, 0) || 1;
      num += regionReferencePrice[regionId] * w;
      den += w;
    });
    globalMarket = createSeedGlobalGoodsMarket(subUnitId, den > 0 ? num / den : 1);
    state.globalGoodsMarkets[subUnitId] = globalMarket;
  }

  // Suppliers price their NEXT offer off the price this same clearing produces — a one-period
  // feedback loop. Combined with how elastic productionResponseFactor is, reacting to the raw,
  // single-week cleared price is the textbook cobweb-cycle setup: overproduce this week because
  // last week's price was high, crash the price, underproduce next week, repeat — with the
  // swings growing, not damping. Suppliers instead react to a slow-moving average (an
  // "expectation"), which is what breaks a cobweb cycle in practice.
  if (globalMarket) {
    if (!(globalMarket.smoothedUnitPriceUSD > 0)) globalMarket.smoothedUnitPriceUSD = globalMarket.unitPriceUSD;
    globalMarket.smoothedUnitPriceUSD = globalMarket.smoothedUnitPriceUSD * 0.75 + globalMarket.unitPriceUSD * 0.25;
    globalMarket.clearedUnitsThisWeek = 0;
    globalMarket.crossBorderValueUSD = 0;
  }

  // --- 4. Every participant's week, decided once.
  const supplyPlans: SupplyPlan[] = [];
  const demandPlans: DemandPlan[] = [];
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const demandState = reg.categoryDemand[subUnitId] as any;
    if (!demandState) return;
    if (!(demandState.localUnitPriceUSD > 0)) demandState.localUnitPriceUSD = regionLocalAnchorPrice[regionId];
    if (!(demandState.smoothedUnitPriceUSD > 0)) demandState.smoothedUnitPriceUSD = demandState.localUnitPriceUSD;
    demandState.smoothedUnitPriceUSD = demandState.smoothedUnitPriceUSD * 0.75 + demandState.localUnitPriceUSD * 0.25;

    // A firm sells into both books, so what it expects to be paid is the share-weighted blend of
    // the two expectations — the same split that decides where its output goes.
    const blendedExpectedPrice = globalMarket
      ? demandState.smoothedUnitPriceUSD * (1 - tradability) + globalMarket.smoothedUnitPriceUSD * tradability
      : demandState.smoothedUnitPriceUSD;

    supplyPlans.push(...buildRegionSupplyPlans(
      subUnitId, reg, regionId, indexes[regionId], regionReferencePrice[regionId], blendedExpectedPrice,
      contractUnitsBySupplier, isCapexSupplierCategory, capexSupplierWeight
    ));
    demandPlans.push(...buildRegionDemandPlans(
      subUnitId, reg, regionId, indexes[regionId], regionReferencePrice[regionId],
      contractUnitsByCustomer, isCapexSupplierCategory, capexSupplierWeight, isRecipeInputCategory,
      govShare, hhShare
    ));
  });

  const offerRegionByKey = new Map<string, RegionId>();
  supplyPlans.forEach(p => offerRegionByKey.set(p.key, p.regionId));
  const demandedUnitsByRegion = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(r => { demandedUnitsByRegion[r] = 0; });
  demandPlans.forEach(p => { demandedUnitsByRegion[p.regionId] += p.demandUnits; });

  // --- 5. Split each participant by tradability and clear the five books.
  const globalBids: UnitBid[] = [];
  const globalOffers: UnitOffer[] = [];
  const localBids = {} as Record<RegionId, UnitBid[]>;
  const localOffers = {} as Record<RegionId, UnitOffer[]>;
  MARKET_REGION_IDS.forEach(r => { localBids[r] = []; localOffers[r] = []; });

  supplyPlans.forEach(plan => {
    if (plan.openOfferUnits <= 0.001) return;
    const globalUnits = plan.openOfferUnits * tradability;
    const localUnits = plan.openOfferUnits - globalUnits;
    if (globalUnits > 0.001) globalOffers.push({ companyId: plan.key, regionId: plan.regionId, quantityUnits: globalUnits, minPriceUSD: plan.minPriceUSD });
    if (localUnits > 0.001) localOffers[plan.regionId].push({ companyId: plan.key, regionId: plan.regionId, quantityUnits: localUnits, minPriceUSD: plan.minPriceUSD });
  });
  demandPlans.forEach(plan => {
    if (plan.demandUnits <= 0.001) return;
    const globalUnits = plan.demandUnits * tradability;
    const localUnits = plan.demandUnits - globalUnits;
    const shape = (units: number): UnitBid => ({
      companyId: plan.key,
      isHouseholdAggregate: plan.isHouseholdAggregate,
      isGovernmentAggregate: plan.isGovernmentAggregate,
      regionId: plan.regionId,
      quantityUnits: units,
      maxPriceUSD: plan.maxPriceUSD,
    });
    if (globalUnits > 0.001) globalBids.push(shape(globalUnits));
    if (localUnits > 0.001) localBids[plan.regionId].push(shape(localUnits));
  });

  const globalResult = globalMarket
    ? clearBook(globalBids, globalOffers, globalMarket.unitPriceUSD, offerRegionByKey)
    : EMPTY_BOOK(0);
  const localResults = {} as Record<RegionId, BookResult>;
  MARKET_REGION_IDS.forEach(regionId => {
    localResults[regionId] = clearBook(localBids[regionId], localOffers[regionId], regionLocalAnchorPrice[regionId], offerRegionByKey);
  });

  // --- 6. Trade accounting: an export is a fill whose two sides sat in different regions.
  if (globalMarket && globalResult.clearedUnits > 0.0001) {
    globalMarket.clearedUnitsThisWeek = globalResult.clearedUnits;
    globalResult.lotsByBuyer.forEach((lots, buyerKey) => {
      const buyerRegion = buyerRegionOfKey(buyerKey, lookup);
      if (!buyerRegion) return;
      lots.forEach(lot => {
        if (lot.sellerRegion === buyerRegion) return;
        const valueUSD = lot.units * globalResult.clearedPriceUSD;
        ctx.bilateralTradeWeeklyUSD[lot.sellerRegion][buyerRegion] += valueUSD;
        globalMarket!.crossBorderValueUSD += valueUSD;
      });
    });
  }

  // --- 7. Each region's published price: what its buyers actually paid, across both books.
  const globalUnitsBoughtByRegion = sumPurchaseUnitsByRegion(globalResult, lookup);
  const regionPublishedPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(regionId => {
    const local = localResults[regionId];
    const globalUnitsBought = globalUnitsBoughtByRegion[regionId] ?? 0;
    const localUnits = local.clearedUnits;
    const num = localUnits * local.clearedPriceUSD + globalUnitsBought * globalResult.clearedPriceUSD;
    const den = localUnits + globalUnitsBought;
    regionPublishedPrice[regionId] = den > 0.0001
      ? num / den
      // Nothing traded in either book this week: the honest price is still what the two books
      // are asking, blended the way this region's trade actually splits.
      : (globalMarket ? local.clearedPriceUSD * (1 - tradability) + globalResult.clearedPriceUSD * tradability : local.clearedPriceUSD);
  });

  // --- 8. Settle production, inventory and cash ONCE per supplier, across both books.
  supplyPlans.forEach(plan => {
    const globalSale = globalResult.salesByKey.get(plan.key);
    const localSale = localResults[plan.regionId].salesByKey.get(plan.key);
    const soldUnits = (globalSale?.quantity ?? 0) + (localSale?.quantity ?? 0);
    const soldUSD = (globalSale?.amount ?? 0) + (localSale?.amount ?? 0);

    if (plan.company) {
      const comp = plan.company;
      if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
      const supUp = companyUpdates[comp.ticker];
      const contractSalesUnitsThisSubUnit = contractSalesUnitsBySupplier[comp.ticker] ?? 0;
      setOutputInventory(
        supUp, subUnitId,
        Math.max(0, plan.initialInventoryUnits + plan.targetProductionUnits - contractSalesUnitsThisSubUnit - soldUnits),
        regionPublishedPrice[plan.regionId]
      );
      if (soldUnits > 0) {
        supUp.salesUnits = (supUp.salesUnits ?? 0) + soldUnits;
        supUp.salesUSD = (supUp.salesUSD ?? 0) + soldUSD;
      }
      supUp._targetProductionUSD = (supUp._targetProductionUSD ?? 0) + plan.targetProductionUSD;
    }
  });

  // Credit each private segment's real cleared sale — not a Company, so it isn't in
  // companyUpdates; annualRevenueUSD is a run-rate (not an accumulator), so replace THIS
  // category's own prior contribution rather than stacking another annualized figure on top.
  // Tracked per sub-unit category (not one shared scalar) since multiple categories can route
  // to the same segment within the same week — see the field's own doc comment.
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const creditSegment = (segmentType: string | undefined, bookField: 'realSupplySalesDerivedAnnualRevenueUSDBySubUnit' | 'capexDerivedAnnualRevenueUSDBySubUnit') => {
      if (!segmentType) return;
      const segment = reg.privateSectorSegments?.find(s => s.segmentType === segmentType);
      if (!segment) return;
      const key = privateSegmentOfferId(regionId, segmentType);
      const amount = (globalResult.salesByKey.get(key)?.amount ?? 0) + (localResults[regionId].salesByKey.get(key)?.amount ?? 0);
      const newAnnualizedContribution = amount * 52;
      const book = (segment as any)[bookField] ?? {};
      const priorContribution = book[subUnitId] ?? 0;
      segment.annualRevenueUSD = Math.max(1, segment.annualRevenueUSD - priorContribution + newAnnualizedContribution);
      book[subUnitId] = newAnnualizedContribution;
      (segment as any)[bookField] = book;
    };
    creditSegment(PRIVATE_SEGMENT_SUPPLY_CATEGORIES[subUnitId], 'realSupplySalesDerivedAnnualRevenueUSDBySubUnit');
    creditSegment(isCapexSupplierCategory ? CAPEX_CATEGORY_PRIVATE_SEGMENT[subUnitId] : undefined, 'capexDerivedAnnualRevenueUSDBySubUnit');
  });

  // --- 9. Settle every buyer once, with real lots from whichever book each fill came from.
  demandPlans.forEach(plan => {
    if (!plan.company || !plan.key) return;
    const comp = plan.company;
    const globalBuy = globalResult.purchasesByKey.get(plan.key);
    const localBuy = localResults[plan.regionId].purchasesByKey.get(plan.key);
    const units = (globalBuy?.quantity ?? 0) + (localBuy?.quantity ?? 0);
    const amount = (globalBuy?.amount ?? 0) + (localBuy?.amount ?? 0);
    if (units <= 0.0001) return;

    if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
    const custUp = companyUpdates[comp.ticker];
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + units;
    custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + amount;
    (globalResult.lotsByBuyer.get(plan.key) ?? []).forEach(l => {
      addInputInventory(custUp, comp, subUnitId, l.sellerKey, l.units, l.units * globalResult.clearedPriceUSD, nextWeek);
    });
    (localResults[plan.regionId].lotsByBuyer.get(plan.key) ?? []).forEach(l => {
      addInputInventory(custUp, comp, subUnitId, l.sellerKey, l.units, l.units * localResults[plan.regionId].clearedPriceUSD, nextWeek);
    });
  });

  // --- 10. Aggregate buyers: the household durable stock and the treasury's realized spend.
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    if (subUnitId === 'passenger_vehicles') {
      const filled = (globalResult.householdFillUnitsByRegion[regionId] ?? 0) + (localResults[regionId].householdFillUnitsByRegion[regionId] ?? 0);
      if (filled > 0) reg.householdState.durableGoodsStockUnits = (reg.householdState.durableGoodsStockUnits ?? 0) + filled;
    }
    // PUB1e: what the government actually bought, at the price it actually paid. This is the
    // real G, and the treasury's account is debited by it in stage 11 — before, the goods moved
    // and no money left the government.
    const govSpend = (globalResult.governmentSpendUSDByRegion[regionId] ?? 0) + (localResults[regionId].governmentSpendUSDByRegion[regionId] ?? 0);
    if (govSpend > 0) reg.governmentProcurementSpentUSD = (reg.governmentProcurementSpentUSD ?? 0) + govSpend;
  });

  // --- 11. Contract formation, once per buyer per week across both books.
  formContracts(subUnitId, globalResult, localResults, supplyPlans, demandPlans, regionPublishedPrice, survivingContracts);

  // --- 12. Publish the week's prices and metrics.
  if (globalMarket) {
    globalMarket.unitPriceUSD = globalResult.clearedPriceUSD;
    if (!(globalMarket.baseUnitPriceUSD > 0)) globalMarket.baseUnitPriceUSD = globalResult.clearedPriceUSD;
  }
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId] as any;
    if (!demandState) return;
    const local = localResults[regionId];
    demandState.localUnitPriceUSD = Number(local.clearedPriceUSD.toFixed(2));
    demandState.unitPriceUSD = Number(regionPublishedPrice[regionId].toFixed(2));

    const contracts = survivingContracts[regionId];
    const contractUnits = contracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
    demandState.totalUnitsSuppliedThisWeek = local.clearedUnits + (globalUnitsBoughtByRegion[regionId] ?? 0) + contractUnits;
    // Each plan's demandUnits is the buyer's full requested amount (allocation is pro-rata,
    // computed separately), so this sum already is the region's whole open-market demand.
    demandState.totalUnitsDemandedThisWeek = demandedUnitsByRegion[regionId] + contractUnits;
    // S8: measured against a FIXED baseline, not against last week. The old form made this a
    // week-over-week change while every consumer read it as a level versus baseline (1.0 = at
    // baseline) — two periodicities in one field, exactly what rule 9 exists to catch.
    if (!(demandState.baseUnitPriceUSD > 0)) demandState.baseUnitPriceUSD = demandState.unitPriceUSD;
    demandState.clearedInputPriceIndex = Number((demandState.unitPriceUSD / demandState.baseUnitPriceUSD).toFixed(4));
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

/** Units each region's buyers took out of the world book this week — its real imports in units. */
function sumPurchaseUnitsByRegion(book: BookResult, lookup: GlobalFirmLookup): Record<string, number> {
  const units: Record<string, number> = {};
  book.lotsByBuyer.forEach((lots, buyerKey) => {
    const region = buyerRegionOfKey(buyerKey, lookup);
    if (!region) return;
    lots.forEach(l => { units[region] = (units[region] ?? 0) + l.units; });
  });
  return units;
}

/**
 * New long-term supply deals, from whoever actually transacted this week.
 *
 * Candidates are the participants in the money at their book's clearing price. A buyer that
 * cleared in BOTH books is still one buyer with one chance of striking a deal this week —
 * running formation per book would double the rate at which the economy contracts itself.
 * A contract is filed in its CUSTOMER's region.
 */
function formContracts(
  subUnitId: string,
  globalResult: BookResult,
  localResults: Record<RegionId, BookResult>,
  supplyPlans: SupplyPlan[],
  demandPlans: DemandPlan[],
  regionPublishedPrice: Record<RegionId, number>,
  survivingContracts: Record<RegionId, SupplyContract[]>
): void {
  const inMoneyOfferKeys = new Set<string>(globalResult.inMoneyOfferKeys);
  MARKET_REGION_IDS.forEach(r => localResults[r].inMoneyOfferKeys.forEach(k => inMoneyOfferKeys.add(k)));
  const inMoneyBidKeys = new Set<string>(globalResult.inMoneyBidKeys);
  MARKET_REGION_IDS.forEach(r => localResults[r].inMoneyBidKeys.forEach(k => inMoneyBidKeys.add(k)));

  const candidateSuppliers = supplyPlans.filter(p => p.company && inMoneyOfferKeys.has(p.key));
  if (candidateSuppliers.length === 0) return;
  const totalSuppliersRevenue = supplyPlans.reduce((s, p) => s + (p.company?.annualRevenue ?? 0), 0);

  demandPlans.forEach(bidPlan => {
    if (!bidPlan.company || !bidPlan.key || !inMoneyBidKeys.has(bidPlan.key)) return;
    const supplierPlan = candidateSuppliers[Math.floor(random() * candidateSuppliers.length)];
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
    });
  });
}

function computeRealizedVol(historicalValues: number[], window: number): number {
  const recent = historicalValues.slice(-window);
  if (recent.length < 3) return 0.16;
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) returns.push(Math.log(recent[i] / recent[i - 1]));
  }
  if (returns.length < 2) return 0.16;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(52);
}

export function runUnitBiddingStage(state: GameState, ctx: WeeklyStepContext): void {
  const { byRegion: indexes, lookup } = buildMarketIndexes(ctx);

  MARKET_REGION_IDS.forEach(exporter => {
    MARKET_REGION_IDS.forEach(importer => { ctx.bilateralTradeWeeklyUSD[exporter][importer] = 0; });
  });

  // Partition every region's contract book by sub-unit ONCE, so each market touches only its own
  // paper instead of walking the whole book to find it. Buckets for sub-units the loop never
  // visits are still carried through, so no contract is lost.
  const contractsByRegionBySubUnit = {} as Record<RegionId, Map<string, SupplyContract[]>>;
  MARKET_REGION_IDS.forEach(regionId => {
    const map = new Map<string, SupplyContract[]>();
    (ctx.updatedRegions[regionId].activeContracts || []).forEach(c => {
      const bucket = map.get(c.subUnitId);
      if (bucket) bucket.push(c); else map.set(c.subUnitId, [c]);
    });
    contractsByRegionBySubUnit[regionId] = map;
  });

  Object.values(INDUSTRY_SUBUNITS).flat().forEach(subUnit => {
    const own = {} as Record<RegionId, SupplyContract[]>;
    MARKET_REGION_IDS.forEach(r => { own[r] = contractsByRegionBySubUnit[r].get(subUnit.unitId) ?? []; });
    const survivors = runSubUnitMarkets(
      ctx, state, subUnit.unitId,
      subUnit.buyerMix.GOVERNMENT ?? 0, subUnit.buyerMix.HOUSEHOLD ?? 0,
      indexes, lookup, own
    );
    MARKET_REGION_IDS.forEach(r => { contractsByRegionBySubUnit[r].set(subUnit.unitId, survivors[r]); });
  });

  MARKET_REGION_IDS.forEach(regionId => {
    const reassembled: SupplyContract[] = [];
    contractsByRegionBySubUnit[regionId].forEach(bucket => { bucket.forEach(c => reassembled.push(c)); });
    ctx.updatedRegions[regionId].activeContracts = reassembled;
  });

  const realizedIndexVol = computeRealizedVol(state.compositeIndices.us500.historical ?? [], 13);
  const baselineVol = 0.16;
  const usaRegime = ctx.updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  ctx.marketVolComponent = Math.max(0, realizedIndexVol - baselineVol) * 0.5 + regimeVolPremium;
}

/**
 * The opening trade position, measured by RUNNING the market rather than by describing it.
 *
 * §7.4's strictest form: seed by calling the engine's own code, not by writing something that
 * resembles its output. The alternative — a formula that estimates what the world book would
 * clear — would be exactly the second representation XB3a exists to delete, and it would drift
 * from the auction the first time either changed.
 *
 * The run happens on a structural copy, so every mutation a real week makes (cleared prices,
 * capacity seeding, contracts, scrappage, segment revenue) lands on the copy and is discarded;
 * only the cross-border flows are read back. The RNG position is restored afterwards, so week 1
 * draws exactly what it would have drawn had this never run.
 *
 * It matters because net exports are a real component of the expenditure identity: opening every
 * region at zero trade made week 1 step straight to the structural balance, which for the USA is
 * several percent of output that the GDP series could only read as a collapse in growth.
 */
export function measureOpeningTradeWeeklyUSD(
  companies: Company[],
  regions: Record<RegionId, Region>
): Record<RegionId, { exportsWeeklyUSD: number; importsWeeklyUSD: number }> {
  const rngStateBefore = getRngState();
  const probeState = {
    currentWeek: 0,
    companies: structuredClone(companies),
    regions: structuredClone(regions),
    globalGoodsMarkets: {},
    fxPairs: [],
    institutionalEntities: [],
    commodities: [],
    marketIndexes: [],
    primaryOfferings: [],
    marketVolPremium: 0,
    portfolio: { positions: [] },
    compositeIndices: { us500: { historical: [] } },
  } as unknown as GameState;

  const ctx = createInitialContext(probeState);
  runUnitBiddingStage(probeState, ctx);
  setRngState(rngStateBefore);

  const opening = {} as Record<RegionId, { exportsWeeklyUSD: number; importsWeeklyUSD: number }>;
  MARKET_REGION_IDS.forEach(regionId => {
    let exportsWeeklyUSD = 0;
    let importsWeeklyUSD = 0;
    MARKET_REGION_IDS.forEach(counterparty => {
      if (counterparty === regionId) return;
      exportsWeeklyUSD += ctx.bilateralTradeWeeklyUSD[regionId][counterparty];
      importsWeeklyUSD += ctx.bilateralTradeWeeklyUSD[counterparty][regionId];
    });
    opening[regionId] = { exportsWeeklyUSD, importsWeeklyUSD };
  });
  return opening;
}
