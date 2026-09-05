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
 * its own inventory would have each write clobber the other.
 */

import { moveDwellings } from '../../ledger/dwelling-ledger';
import { arrivePlant } from '../../ledger/plant-ledger';
import { GameState, Region, RegionId, UnitBid, UnitOffer, Company } from '../../../types';
import { bookTradeInvoices } from '../../ledger/contract-ledger';
import { bankParty, companyParty, companyPartyOf } from '../../../domain/party';
import { partyId } from '../../ledger/party';
import { defect } from '../../../domain/defect';
import { categoryPriceTier, householdBudgetReachMultiple, budgetDemandLadder, DEMAND_LADDER_RUNGS } from '../../../domain/industry';
import { patienceWeeksOf, riskAversionOf, expectationFromHistory, adaptiveExpectation } from '../../../domain/preferences';
import { TIER_SPEND_MIX } from '../../macro/household-cohorts';
import { subUnitYieldLossShareOf } from '../../macro/weather';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { plantEffectiveNetLocal } from '../../../domain/plant';
import { purchaseKindOf, productionLeadWeeksOf, commissioningLeadWeeksOf, seasonalFactor } from '../../../domain/industry-registry';
import { pay, payByIds, internReason, PartyRef } from './settlement';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { channelMarginRate, shelfPriceLocal, DISTRIBUTION_SUBUNIT_ID } from '../../../domain/distribution';
import { subUnitSpecOf } from '../../../domain/industry-registry';
import { industryOfSubUnit, smePoolSubUnits, smePoolRecipeInputs, firmInputIntensities, capitalMixOf, INDUSTRY_REGISTRY, isCapitalGood } from '../../../domain/industry-registry';
import { profileKeyOf } from './profiles';
import { isActiveCompany, getOutputInventoryUnits, getOutputInventoryLocal, fullStaffingCapHeads, banksOf } from '../../../domain/company';
import { WeeklyStepContext, CompanyWeekUpdate } from './context';
import { revHistLen, revHistAt, rowOf, V2World, ensureV2, partyKeyOf } from '../../../engine2/world';
import { deliverGoods, receiveInputLot, settleOutputInventory, setOutputStock, consumeGoods } from '../../ledger/goods-ledger';
import { contractRows, relinkChain, formContractRow, endOfWeekCompact, ageContractWeek, restrikeContract, setContractBacklog, applyContractDeposit, setContractShortWeeks, type ReadonlyContractTable } from '../../../engine2/contracts';
import { random, beginEntityScope, endEntityScope } from '../../rng';
import { capacityMixShares } from '../../../domain/sme-pool';
import { clearDoubleAuction, AuctionBid, AuctionOffer, AuctionFill } from './double-auction';
import { convertLocal, localToUsd, fromTable, snapshotFxToUsd, FxToUsd } from '../../../domain/currency';
import { laneKey, laneTransitWeeks } from '../../../domain/carrier';
import { laneDistanceNm, REGION_IDS, currencyOf } from '../../../domain/geography';
import { SourcingSplit } from './sourcing-intent';
import { chooseInvoiceRegion, invoiceCurrencyOf } from '../../../domain/invoice-currency';
import { fxConversionPipOf } from '../../../domain/dealer-desk';
import { costOfCapitalOf, riskFreeRateOf, weeklyCapitalChargeLocal } from '../../../domain/company-week/cost-of-capital';
import { paymentTermWeeks } from '../../../domain/trade-invoice';
import { computeAnnualDefaultProbability } from './shared-helpers';
import { getFxToUsd } from './06-fx-and-trade';
import { realizedAnnualVol, measuredWeeklyMove } from '../../../domain/volatility';
import { weeklyWageBillLocal, getBaseAnnualWageLocal } from '../../bootstrap/labor-and-wages';
import { SECTOR_OCCUPATION_MIX } from '../../../domain/region-macro';
import { cashOf } from '../../ledger/accounts';
import { type PartyKeyRef } from '../../../engine2/refs';
import type { Ticker, EntityId } from '../../../domain/ids';
import { asTicker } from '../../../domain/ids';

/** SCALE / DECLARED RELABEL: decimal rounding by arithmetic
 *  instead of a string round-trip; ULP-edge differences from toFixed accepted. */
const roundN = (v: number, pow: number) => Math.round(v * pow) / pow;


export const MARKET_REGION_IDS = REGION_IDS;

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
 * How long a buyer tolerates a supplier that cannot deliver before it terminates.
 *
 * A quarter. It is a term of the contract rather than a behavioural dial: a cure period is what
 * a supply agreement actually contains, and the alternative — terminating on the first missed
 * week — would make every transient stockout fatal and every relationship meaningless.
 */
const CONTRACT_NON_PERFORMANCE_WEEKS = 13;

/**
 * A contract at least this long is INDEXED to the market it was struck against.
 *
 * A year. Below it the parties live with the price they agreed; above it neither side will wear
 * an open-ended bet on inflation, which is why real long-term supply agreements carry an
 * escalation clause and short ones do not.
 */
const CONTRACT_INDEXATION_MIN_WEEKS = 52;

/**
 * The floor under a supplier's sourcing weight.
 *
 * Not a rescue and not a band on the record itself, which is measured and unbounded: it is the
 * statement that a buyer who has never dealt with a firm cannot know it is unreliable, so
 * SOMEBODY tries it. Without it a firm that missed a quarter could never win another contract
 * from anyone, ever, and the model has no re-entry mechanism to bring it back (that is DYN's).
 */
const SUPPLIER_MIN_SOURCING_WEIGHT = 0.05;

/**
 * The share of work in progress that the CUSTOMER funds.
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
// The intensity record was rebuilt PER LIVE CONTRACT (the settle walk's ~tens of
// thousands of calls a week, growing with the book); one build per firm per week is the same
// record, because comp.productLines and the profile only change at stage 08's write-back,
// after this stage has run. Week-stamped so a battery's re-run of a week cannot reuse a clone's
// stale entry (companies mutate in place; the WeakMap keys survive).
const INPUT_INTENSITIES_MEMO = new WeakMap<Company, { week: number; v: Partial<Record<string, number>> }>();
function firmIntensitiesWeekly(comp: Company, week: number): Partial<Record<string, number>> {
  const m = INPUT_INTENSITIES_MEMO.get(comp);
  if (m && m.week === week) return m.v;
  const v = firmInputIntensities(comp.productLines, profileKeyOf(comp));
  INPUT_INTENSITIES_MEMO.set(comp, { week, v });
  return v;
}
function computeRecipeInputNeedLocal(comp: Company, inputSubUnitId: string, week: number): number {
  // step 4: a firm that sells no product still buys — a bank's premises, software and
  // professional services come from its profile's basket. One accessor for both cases, so a firm
  // cannot be charged for an input in stage 08 that it never bid for here (rule 5).
  const intensity = firmIntensitiesWeekly(comp, week)[inputSubUnitId];
  if (!intensity) return 0;
  return (comp.annualRevenue / 52) * intensity;
}

/** fee-earning desks per region, memoised on the firm array's identity (a new
 *  week hands a new array, so the memo lapses with it). List order is the firms' own, which is
 *  what keeps the fee pay sequence and its floats identical to the inline filter's. */
const fxFeeBanksCache = new WeakMap<object, Map<string, { banks: Company[]; totalShare: number }>>();
/** §3.26-e-iii: the pair's measured weekly move between two regions' currencies; undefined before
 *  it has printed twice. A region's aggregate flow abroad reads the mean over its pairs. */
function fxPairMoveOf(ctx: WeeklyStepContext, a: RegionId, b: RegionId): number | undefined {
  const pair = ctx.updatedFxPairs.find((p) => (p.base === a && p.quote === b) || (p.base === b && p.quote === a));
  return measuredWeeklyMove(pair?.historicalRates);
}
function fxRegionMeanMoveOf(ctx: WeeklyStepContext, region: RegionId): number | undefined {
  const moves = ctx.updatedFxPairs.filter((p) => p.base === region || p.quote === region)
    .map((p) => measuredWeeklyMove(p.historicalRates)).filter((m): m is number => m !== undefined);
  return moves.length > 0 ? moves.reduce((a, m) => a + m, 0) / moves.length : undefined;
}
/** What THIS bank's desk charges to stand in for the other side for a week: its own width
 *  (`domain/dealer-desk.ts:fxConversionPipOf`) — financing at the cleared repo rate plus the
 *  pair's measured move at its own risk aversion. It replaced a stated 2bp. */
function fxPipOf(ctx: WeeklyStepContext, bank: Company, move: number | undefined): number {
  return fxConversionPipOf({
    repoRateAnnual: ctx.updatedRegions[bank.region].repoRateAnnual,
    measuredWeeklyMove: move,
    riskAversion: riskAversionOf(bank.management),
  });
}

function fxFeeBanksOf(firms: Company[], region: RegionId): { banks: Company[]; totalShare: number } {
  let byRegion = fxFeeBanksCache.get(firms);
  if (!byRegion) { byRegion = new Map(); fxFeeBanksCache.set(firms, byRegion); }
  let entry = byRegion.get(region);
  if (!entry) {
    const banks = banksOf(firms, region);
    const totalShare = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0) || banks.length;
    entry = { banks, totalShare };
    byRegion.set(region, entry);
  }
  return entry;
}

/**
 * SETL-C: who a settlement key actually is. The goods auction has always known the pairing —
 * which buyer took which seller's lot — and stage 08 only ever saw each side's weekly total, so
 * the payment lost its counterparty on the way. This turns a key back into
 * the party that holds the money.
 */
function partyOfKey(key: string, regionId: RegionId, lookup: GlobalFirmLookup): PartyRef {
  const comp = lookup.byKey.get(key);
  if (comp) return companyParty(comp);
  if (key.startsWith('HOUSEHOLD')) return { kind: 'HOUSEHOLD', region: regionId };
  if (key.startsWith('GOVERNMENT') || key.startsWith('GOV')) return { kind: 'GOVERNMENT', region: regionId };
  // A segment key is a real party now — its sales proceeds land on the pool's own book
  // instead of the boundary. The key embeds the segment's OWN region (it can sell into another
  // region's book), so parse it rather than trusting the market's origin.
  if (key.startsWith('PRIVATE:')) {
    const [, segRegion, industry] = key.split(':');
    return { kind: 'SEGMENT', region: segRegion as RegionId, industry };
  }
  // A seller that cannot be paid is a defect at the site that made the key.
  return defect(`seller key '${key}' (market region ${regionId}) names no party this model can pay`);
}

// W4: a firm's finished stock is written by the goods ledger only (`settleOutputInventory`
// at the week's settlement, `setOutputStock` for the contract deliveries' running balance).

// 1$ is 1$ Phase 2/6: credit a real purchase onto the buyer's persisted input inventory as a
// NEW LOT — appended on top of whatever this same company already holds (and whatever it
// already bought this same week via a different subUnitId's auction pass or a different real
// seller), not merged into one blended average, since the whole point is to keep each real
// purchase's real counterparty and real price distinguishable (see domain/company.ts's
// InputLot doc comment) rather than collapsing them the moment they're credited.
function addInputInventory(v2: V2World, update: CompanyWeekUpdate, baseComp: Company, subUnitId: string, sellerId: string, addedUnits: number, addedValueLocal: number, week: number, wireNo: number) {
  if (addedUnits <= 0.0001) return;
  // Only material that will be CONSUMED is inventory. A machine delivered is capital; a
  // general operating purchase is used and expensed. Writing all three as lots is what made a
  // third of the world's purchases immortal.
  const kind = purchaseKindOf(subUnitId, baseComp.productLines, profileKeyOf(baseComp)); // §3.26-f-iv-b: the buyer's question
  if (kind === 'CAPITAL_GOOD') {
    // A capital good that has ARRIVED is not yet plant. It is installed and commissioned
    // first, so it lands as construction in progress with the week it enters service on it.
    if (!update.capexUnderConstruction) update.capexUnderConstruction = [];
    update.capexUnderConstruction.push({
      valueLocal: addedValueLocal,
      entersServiceWeek: week + commissioningLeadWeeksOf(subUnitId),
      kind: subUnitId, // §3.26-f-iv-a: the vintage will know what it is
    });
    arrivePlant(baseComp.id, addedValueLocal); // §3.26-f-iii: W6's queue leg
    // W4: as GOODS the machine is consumed on receipt — it becomes plant, not stock.
    consumeGoods(baseComp.region, subUnitId, addedUnits);
    return;
  }
  // W4: an operating purchase is used the week it lands — consumed on receipt.
  if (kind === 'OPERATING') { consumeGoods(baseComp.region, subUnitId, addedUnits); return; }
  // ENGINE V2 — the lot lands on the persistent table, in stage order, which is the
  // same order the copy-on-first-touch week arrays used to carry. No copy, no write-back.
  receiveInputLot(v2, baseComp.id, baseComp.region, subUnitId, sellerId, addedUnits, addedValueLocal / addedUnits, week, wireNo);
}

/** One week's lot in a production pipeline: what was started, and what it cost to start it. */
interface WipLot { units: number; valueLocal: number }

/**
 * Advance one product line's production pipeline by a week.
 *
 * A firm STARTS `startedUnits` this week at `startedCostLocal`, and what it has to SELL this week
 * is whatever it started `productionLeadWeeks` ago. Those are two different numbers the moment
 * anything changes, and the gap between them is the whole mechanism: demand arrives, output
 * cannot, and price moves instead. With a lead of zero the two collapse into one, which is what
 * every good in the model did before this existed.
 *
 * FIRST TOUCH SEEDS THE PIPELINE FULL. A firm that has never run this line is treated as already
 * in steady state — `lead` weeks of work in progress at this week's rate — rather than as one
 * that has just broken ground. The alternative is a year of zero output from every construction
 * firm at week one, which is an opening condition nobody chose and not a statement about
 * production time (a stated table survives only until the mechanism has something in it).
 */
function advanceProductionPipeline(
  existing: WipLot[] | undefined,
  leadWeeks: number,
  startedUnits: number,
  startedCostLocal: number
): { arrivedUnits: number; arrivedValueLocal: number; queue: WipLot[] } {
  if (leadWeeks <= 0) {
    return { arrivedUnits: startedUnits, arrivedValueLocal: startedCostLocal, queue: [] };
  }
  const queue = existing
    ? existing.slice()
    : Array.from({ length: leadWeeks }, () => ({ units: startedUnits, valueLocal: startedCostLocal }));
  const arrived = queue.shift() ?? { units: 0, valueLocal: 0 };
  queue.push({ units: startedUnits, valueLocal: startedCostLocal });
  return { arrivedUnits: arrived.units, arrivedValueLocal: arrived.valueLocal, queue };
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
  /** The producing LINE per (sub-unit, firm), recorded at index build so the supply
   *  planner stops running a.find over each supplier's lines per market. First line wins,
   *  exactly as the find it replaces. */
  lineBySupplierBySubUnit: Map<string, Map<Company, NonNullable<Company['productLines']>[number]>>;
  /** Firms with real capex, the customer base for every capital-goods category. */
  capexBuyers: Company[];
  /** The firm's wage bill at current staffing, computed once per firm per week: the
   *  floor decomposition asked weeklyWageBillLocal once per LINE per market, with inputs
   *  that cannot change inside the stage (a supplier sits only in its own region's index). */
  currentPayrollByFirm: Map<Company, number>;
  /** §3.20-i-b — dead firms in an open workout, selling their stock at no reservation. A
   *  liquidation sale is a seller in the market where the buyers of the goods are; it makes
   *  nothing, buys nothing, and offers every row it holds until the rows are empty. */
  estateSellers: Set<Company>;
}

/**
 * Counterparty lookups spanning EVERY region, not just one.
 *
 * XB3a made these global: a supply contract struck in the world book has a supplier in one
 * region and a customer in another, and settling it needs to find both. A per-region map would
 * silently drop the foreign leg — the contract would survive and transfer nothing.
 */
interface GlobalFirmLookup {
  byTicker: Map<Ticker, Company>;
  byId: Map<EntityId, Company>;
  /**
   * One probe for a key that may be a ticker OR an id, because the goods book's buyer keys hold
   * EITHER — the one place in the model where two id spaces share a map on purpose, and the
   * reason `partyOfKey` can answer both. Ids go in first and tickers after, so a ticker wins any
   * collision: `byTicker.get(k) ?? byId.get(k)` at half the probes.
   *
   * §3.13-BOOK (c-then-2) — THE RULE NOW HOLDS REGARDLESS OF WALK ORDER. It was written inside
   * the walk as `if (!byTicker.has(asTicker(c.id))) byKey.set(c.id, c)`, which asked whether any
   * firm SEEN SO FAR had a ticker equal to this firm's id: a colliding firm later in the walk was
   * missed and the id won instead. The cast was also a lie the compiler now refuses — an entity
   * id branded as a ticker to compare across spaces. Both go away by filling the two spaces in
   * two passes, which is what the sentence above always said.
   */
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
      lineBySupplierBySubUnit: new Map(),
      capexBuyers: [],
      currentPayrollByFirm: new Map(),
      estateSellers: new Set(),
    };
  });
  const lookup: GlobalFirmLookup = { byTicker: new Map(), byId: new Map(), byKey: new Map() };

  // HC3: the goods market has never cared who owns a supplier's equity — public and private
  // firms bid and offer in the same real auction.
  const walk = (c: Company) => {
    if (!isActiveCompany(c)) return;
    const index = byRegion[c.region as RegionId];
    lookup.byTicker.set(c.ticker, c);
    lookup.byId.set(c.id, c);
    lookup.byKey.set(c.id, c); // ids first; the ticker pass below overwrites any collision
    index.activeFirms.push(c);
    if ((c.maintenanceCapex) + (c.growthCapex) > 0) index.capexBuyers.push(c);
    (c.productLines || []).forEach((l) => {
      const arr = index.suppliersBySubUnit.get(l.subUnitId);
      if (arr) arr.push(c); else index.suppliersBySubUnit.set(l.subUnitId, [c]);
      let lineByCo = index.lineBySupplierBySubUnit.get(l.subUnitId);
      if (!lineByCo) { lineByCo = new Map(); index.lineBySupplierBySubUnit.set(l.subUnitId, lineByCo); }
      if (!lineByCo.has(c)) lineByCo.set(c, l);
    });
    // step 4: registered as a BUYER from its own input basket — its products' recipes if
    // it makes anything, its profile's basket if it does not. Selling and buying were the same
    // field before, so a bank (correctly given no product line by IND-R2) bought nothing either.
    // A firm with two lines needing the same input is one buyer, not two: the need is summed by
    // computeRecipeInputNeedLocal when it bids.
    Object.keys(firmInputIntensities(c.productLines, profileKeyOf(c))).forEach(inputSubUnitId => {
      const buyers = index.recipeInputBuyersBySubUnit.get(inputSubUnitId);
      if (buyers) { if (buyers[buyers.length - 1] !== c) buyers.push(c); }
      else index.recipeInputBuyersBySubUnit.set(inputSubUnitId, [c]);
    });
  };
  ctx.prevActiveFirms.forEach(walk);
  ctx.prevActivePrivateFirms.forEach(walk);
  // §3.20-i-b — THE ESTATE SELLS IN THE GOODS AUCTION. A firm in an open workout is dead to every
  // other book, but its stock is real goods and the buyers of those goods are here. It is a
  // supplier of every row it holds, at no reservation, and nothing else: not a buyer, not a
  // capex buyer, no product line, no production.
  const openEstateIds = new Set((ctx.estates).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  if (openEstateIds.size > 0) {
    ctx.updatedCompanies.forEach((c) => {
      if (!openEstateIds.has(c.id)) return;
      const index = byRegion[c.region as RegionId];
      const rows = Object.entries(c.outputInventoryBySubUnit).filter(([, r]) => r !== undefined && r.unitsHeld > 0.0001);
      if (rows.length === 0) return;
      lookup.byTicker.set(c.ticker, c);
      lookup.byId.set(c.id, c);
      lookup.byKey.set(c.id, c);
      index.estateSellers.add(c);
      rows.forEach(([subUnitId]) => {
        const arr = index.suppliersBySubUnit.get(subUnitId);
        if (arr) arr.push(c); else index.suppliersBySubUnit.set(subUnitId, [c]);
      });
    });
  }
  // The ticker pass, AFTER every id is in: on a key that is both, the ticker wins.
  lookup.byTicker.forEach((c, ticker) => lookup.byKey.set(ticker, c));
  return { byRegion, lookup };
}

/**
 * What the sourcing intent and the freight market decided earlier in the week, which is what the
 * goods auction needs to know to price a foreign quote against a domestic one.
 */
interface SourcingContext {
  splitByRegionSubUnit: Map<string, SourcingSplit>;
  /** Cleared freight per tonne by lane, each in that lane's own money. */
  freightRateByLane: Partial<Record<string, number>>;
  unitMassTonnes: Record<string, number>;
  fxToUsd: FxToUsd;
  /** XB6 — how deep each currency pair is, which is what the invoice currency is priced on. */
  fxPairIlliquidity: Partial<Record<string, number>>;
  quotedPairs: { base: RegionId; quote: RegionId }[];
  /** Whether that week's book for a good left unfilled DEMAND rather than unsold supply — which
   *  is what decides who can insist on being paid in their own money. */
  sellerIsShort: (subUnitId: string, origin: RegionId) => boolean;
  /** Per-week memoisation: the buyer's structural PD is deterministic within a week and the lot
   *  loop asked for it once per LOT — ~14k evaluations for ~2k distinct buyers. Same inputs,
   *  same answers, byte-identical world. (Invoice-region memoisation lives per sub-unit pass.) */
  buyerAnnualPdByTicker: Map<Ticker, number>;
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
  /** What the firm STARTS this week. It becomes sellable `productionLeadWeeks` later. */
  targetProductionUnits: number;
  targetProductionLocal: number;
  /** What came OUT of the pipeline this week: what it can actually sell. */
  arrivedProductionUnits: number;
  /** The line's pipeline after this week's advance, to be persisted. */
  wipQueue?: WipLot[];
  openOfferUnits: number;
  minPriceLocal: number;
}

/** A buyer's whole week for one sub-unit, decided once, for the same reason. */
interface DemandPlan {
  key?: string;
  regionId: RegionId;
  company?: Company;
  isHouseholdAggregate?: boolean;
  isGovernmentAggregate?: boolean;
  demandUnits: number;
  maxPriceLocal: number;
  /** A BUDGET-ANCHORED demand curve, cut into rungs of falling reservation: the k-th
   *  slice of the want is worth budget/(k·step), so the quantity a buyer takes falls as the
   *  price rises and a shortage clears at budget/supply, ONCE. A plan without rungs is one
   *  inelastic bid at `maxPriceLocal` (the contract plans keep that shape). */
  rungs?: { units: number; maxPriceLocal: number }[];
}

/**
 * WHAT A BUYER CAN PAY, derived from its own books. Before this, a firm bid last
 * week's price ±5% (a cash-rich one +15%) and the treasury last week's price +50%, for a FIXED
 * quantity: reservation anchored to the print, not to any budget. In a short market the print
 * went to the cap every week and the cap moved with it — the compounding half of the inflation
 * the price-level work left standing (CPI 100 → 150 in 13 weeks: pharma ×2.4,
 * defence ×2.1, commercial rent ×2.4, all corporate- or treasury-bought). Now every buyer class
 * is on the one ladder households already used: a budget, a want, and how far above the going
 * price the budget can stretch. For a firm that is its margin cover — an input that is α of its
 * revenue can rise by m/α before the firm produces at a loss (m its EBITDA margin), so
 * reach = 1 + m/α; a capital-goods buyer and the treasury spend a budget and reach no further.
 */
function budgetRungs(budgetLocal: number, wantUnits: number, referencePriceLocal: number, reach: number): { units: number; maxPriceLocal: number }[] {
  return budgetDemandLadder({
    weeklyBudgetLocal: budgetLocal, referencePriceLocal, budgetReachMultiple: reach,
    satiationUnits: wantUnits, rungs: DEMAND_LADDER_RUNGS,
  });
}
function marginReach(comp: { annualRevenue: number; ebitda: number }, inputAnnualLocal: number): number {
  const alpha = comp.annualRevenue > 0 ? inputAnnualLocal / comp.annualRevenue : 0;
  const margin = comp.annualRevenue > 0 ? Math.max(0, comp.ebitda) / comp.annualRevenue : 0;
  return alpha > 0 ? 1 + margin / alpha : 1;
}

/** A settlement key for a participant that is not a Company: the aggregates, by region. */
const householdKey = (regionId: RegionId) => `HOUSEHOLD:${regionId}`;
const governmentKey = (regionId: RegionId) => `GOVERNMENT:${regionId}`;

interface BookResult {
  clearedPriceLocal: number;
  clearedUnits: number;
  salesByKey: Map<string, AuctionFill>;
  purchasesByKey: Map<string, AuctionFill>;
  householdFillUnitsByRegion: Record<string, number>;
  governmentSpendUSDByRegion: Record<string, number>;
  lotsByBuyer: Map<string, { sellerKey: Ticker; sellerRegion: RegionId; units: number }[]>;
  inMoneyBidKeys: Set<string>;
  inMoneyOfferKeys: Set<string>;
}

const EMPTY_BOOK = (anchorPrice: number): BookResult => ({
  clearedPriceLocal: anchorPrice,
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
    return { key, quantity: b.quantityUnits, maxPrice: b.maxPriceLocal };
  });
  const auctionOffers: AuctionOffer[] = offers.map(o => ({
    key: o.companyId, quantity: o.quantityUnits, minPrice: o.minPriceLocal,
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
      // §3.13-BOOK slice (c2c): the double auction's keys are OPAQUE to it — it matches whatever
      // strings the caller supplied. This caller supplied tickers, so this is where they become
      // tickers again, and the auction stays a generic matcher rather than learning about firms.
      sellerKey: asTicker(l.sellerKey),
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
interface WeekResolution {
  resolveRef: (refId: PartyKeyRef) => Company | undefined;
  /** partyId per firm, computed once per week (was two string-map probes per payment leg). */
  pidOf: (comp: Company) => number;
  /** The firm's CompanyWeekUpdate record, ensured once per firm per week (same identity the
   *  string-keyed probes produced). */
  updateOf: (comp: Company) => import('./context').CompanyWeekUpdate;
  /** Settlement pid for any seller key (company, segment, aggregate), per origin. */
  pidOfSeller: (key: string, origin: RegionId) => number;
  pidOfCarrier: (carrierId: EntityId) => number;
  hhPid: Map<RegionId, number>;
  govPid: Map<RegionId, number>;
}

/** The walk's reason ids, interned once per process (the interner is global and stable). */
const R_EXWORKS = internReason('goods purchase (ex-works)');
const R_FREIGHT = internReason('freight paid to the carrier');
const R_TRADE_CREDIT = internReason('trade credit extended');
const R_HH_GOODS = internReason('household goods purchase');
const R_CHANNEL = internReason('distribution margin paid to the channel');
const R_GOV_PROC = internReason('government procurement');
const R_FX_SPREAD = internReason('fx conversion spread');
const R_SEGMENT_GOODS = internReason('segment goods purchase');

// native cores — settleContracts in the seam pattern: PRE reads every object
// once into lanes; CORE is pure arithmetic over lanes and the contract columns (the portable
// piece: no object, no Map, no payment — mutates the columns exactly as the inline walk did);
// EFFECTS replays the rows in order emitting the identical payments and update writes. Float
// order preserved statement for statement; the oracle differ is the gate.

const CS_ALIVE = 0, CS_DEAD_MISSING = 1, CS_DEAD_SUPPLIER = 2, CS_DEAD_CUSTOMER = 3,
  CS_DEAD_EXPIRY = 4, CS_DEAD_TERMINATION = 5;

/** The portable core: per-row settlement arithmetic in chain order, draining each supplier's
 *  one balance sequentially (the coupling that makes this loop serial by construction). */
function settleContractsCore(
  // §3.13-BOOK d0: this core reads the contract book through the world's read view and makes its
  // five writes (the ageing, the escalation re-strike, the backlog, the progress deposit, the
  // short-weeks count) through the store's own operations. No handle is held here.
  v2: V2World, T: ReadonlyContractTable, rows: number[], contractLeadWeeks: number,
  preStatus: Uint8Array, supSlot: Int32Array, needLocal: Float64Array,
  marketPrice: Float64Array, avail: Float64Array,
  status: Uint8Array, buyerLoss: Float64Array, sellerLoss: Float64Array,
  actualT: Float64Array, paymentL: Float64Array, appliedL: Float64Array,
  topUpL: Float64Array, fillL: Float64Array, availAfter: Float64Array,
): void {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (preStatus[i] !== 0) { status[i] = preStatus[i]; continue; }

    const weeksLeft = ageContractWeek(v2, r);
    const marketPriceLocal = marketPrice[i];

    if (weeksLeft < 0) {
      buyerLoss[i] = T.backlogUnits[r] * Math.max(0, marketPriceLocal - T.priceLocal[r]);
      status[i] = CS_DEAD_EXPIRY;
      continue;
    }

    if (T.escalationBaseLocal[r] > 0.0001) {
      restrikeContract(v2, r, Number(
        (T.priceLocal[r] * (marketPriceLocal / T.escalationBaseLocal[r])).toFixed(4)
      ), marketPriceLocal);
    }

    const openingBacklogUnits = T.backlogUnits[r];
    const owedUnits = T.qtyPerWeek[r] + openingBacklogUnits;

    let cancelledUnits = 0;
    if (openingBacklogUnits > 0.0001) {
      const needUnits = marketPriceLocal > 0.0001 ? needLocal[i] / marketPriceLocal : owedUnits;
      const excessUnits = owedUnits - needUnits;
      if (excessUnits > 0.0001) {
        cancelledUnits = Math.min(openingBacklogUnits, excessUnits);
        sellerLoss[i] = cancelledUnits * Math.max(0, T.priceLocal[r] - marketPriceLocal);
      }
    }
    const owedAfterCancellationUnits = owedUnits - cancelledUnits;

    const supplierUnits = avail[supSlot[i]];
    const actualTransacted = Math.min(owedAfterCancellationUnits, supplierUnits);
    avail[supSlot[i]] = supplierUnits - actualTransacted;
    availAfter[i] = supplierUnits - actualTransacted;
    setContractBacklog(v2, r, Math.max(0, owedAfterCancellationUnits - actualTransacted));
    const paymentLocal = actualTransacted * T.priceLocal[r];

    const targetDepositLocal = contractLeadWeeks
      * T.qtyPerWeek[r] * T.priceLocal[r] * PROGRESS_PAYMENT_SHARE;
    const appliedFromDepositLocal = Math.min(T.prepaidLocal[r], paymentLocal);
    const topUpLocal = Math.max(0, targetDepositLocal - (T.prepaidLocal[r] - appliedFromDepositLocal));
    applyContractDeposit(v2, r, appliedFromDepositLocal, topUpLocal);
    const fillRate = T.qtyPerWeek[r] > 0
      ? Math.min(1, actualTransacted / T.qtyPerWeek[r]) : 1.0;
    setContractShortWeeks(v2, r, fillRate < 0.95 ? T.shortWeeks[r] + 1 : 0);

    actualT[i] = actualTransacted; paymentL[i] = paymentLocal;
    appliedL[i] = appliedFromDepositLocal; topUpL[i] = topUpLocal; fillL[i] = fillRate;

    if (T.shortWeeks[r] >= CONTRACT_NON_PERFORMANCE_WEEKS) {
      buyerLoss[i] = T.backlogUnits[r] * Math.max(0, marketPriceLocal - T.priceLocal[r]);
      status[i] = CS_DEAD_TERMINATION;
      continue;
    }
    status[i] = CS_ALIVE;
  }
}

function settleContracts(
  v2: V2World,
  ctx: WeeklyStepContext,
  subUnitId: string,
  region: RegionId,
  wk: WeekResolution,
  regionReferencePrice: Record<RegionId, number>,
  contractSalesUnitsBySupplier: Map<Company, number>,
  availableBySupplier: Map<Company, number>
): number[] {
  // §3.13-BOOK d0: the book is read through the world's view; its five writes are the store's
  // own operations (`contracts.ts`), and the handle this stage used to hold is gone.
  const T = v2.contracts;
  const { resolveRef, pidOf } = wk;
  const R_NONPERF = internReason('non-performance damages');
  const R_CANCEL = internReason('order cancellation damages');
  const R_PROGRESS = internReason('contract progress payment');
  const R_DELIVERY = internReason('contract delivery');

  const { nextWeek } = ctx;
  const __sp0 = S05_PROF ? performance.now() : 0;
  const rows = contractRows(v2, region, subUnitId);
  const survivors: number[] = [];
  const dead: number[] = [];
  // Per-sub-unit registry facts, read once instead of per contract.
  const contractLeadWeeks = productionLeadWeeksOf(subUnitId);
  const isCapitalGoodCategory = isCapitalGood(subUnitId);
  const m = rows.length;

  // ---- PRE: every object read, once, into lanes (refs resolve per unique ref per week).
  const supplierOf: (Company | undefined)[] = new Array(m);
  const customerOf: (Company | undefined)[] = new Array(m);
  const preStatus = new Uint8Array(m);
  const supSlot = new Int32Array(m);
  const needLocal = new Float64Array(m);
  const marketPrice = new Float64Array(m);
  const supRegPx = new Float64Array(m);
  const slotBySupplier = new Map<Company, number>();
  const slotSuppliers: Company[] = [];
  // Stage IV — customers slotted like suppliers: the recipe need is a per-(customer,
  // sub-unit, week) fact recomputed per CONTRACT (many contracts share a customer), and the
  // effects loop below re-probes updateOf/pidOf per row for the same few parties.
  const custSlotBy = new Map<Company, number>();
  const custSlots: Company[] = [];
  const custSlot = new Int32Array(m);
  const needBySlot: number[] = [];
  const custSlotOf = (customer: Company): number => {
    let cs = custSlotBy.get(customer);
    if (cs === undefined) {
      cs = custSlots.length;
      custSlotBy.set(customer, cs);
      custSlots.push(customer);
      needBySlot.push(computeRecipeInputNeedLocal(customer, subUnitId, nextWeek));
    }
    return cs;
  };
  for (let i = 0; i < m; i++) {
    const r = rows[i];
    const supplier = supplierOf[i] = resolveRef(T.supplierRef[r]);
    const customer = customerOf[i] = resolveRef(T.customerRef[r]);
    if (!supplier || !customer) { preStatus[i] = CS_DEAD_MISSING; continue; }
    if (!isActiveCompany(supplier)) {
      // needLocal gates the customer's constraint write in effects (rule 8: only a production
      // input throttles production.
      const cs = custSlotOf(customer);
      custSlot[i] = cs;
      needLocal[i] = needBySlot[cs];
      preStatus[i] = CS_DEAD_SUPPLIER;
      continue;
    }
    if (!isActiveCompany(customer)) { preStatus[i] = CS_DEAD_CUSTOMER; continue; }
    const cs = custSlotOf(customer);
    custSlot[i] = cs;
    needLocal[i] = needBySlot[cs];
    marketPrice[i] = regionReferencePrice[customer.region as RegionId];
    supRegPx[i] = regionReferencePrice[supplier.region as RegionId];
    let slot = slotBySupplier.get(supplier);
    if (slot === undefined) {
      slot = slotSuppliers.length;
      slotBySupplier.set(supplier, slot);
      slotSuppliers.push(supplier);
    }
    supSlot[i] = slot;
  }
  const avail = new Float64Array(slotSuppliers.length);
  for (let sIdx = 0; sIdx < slotSuppliers.length; sIdx++) {
    const supplier = slotSuppliers[sIdx];
    avail[sIdx] = availableBySupplier.get(supplier)
      ?? getOutputInventoryUnits(supplier, subUnitId);
  }

  // ---- CORE: the portable arithmetic, chain order, mutating the columns.
  const status = new Uint8Array(m);
  const buyerLoss = new Float64Array(m);
  const sellerLoss = new Float64Array(m);
  const actualT = new Float64Array(m);
  const paymentL = new Float64Array(m);
  const appliedL = new Float64Array(m);
  const topUpL = new Float64Array(m);
  const fillL = new Float64Array(m);
  const availAfter = new Float64Array(m);
  const __c0 = S05_PROF ? performance.now() : 0;
  if (S05_PROF) { s05Phase.settlePre += __c0 - __sp0; s05Phase.settleRows += m; }
  settleContractsCore(v2, T, rows, contractLeadWeeks, preStatus, supSlot, needLocal, marketPrice,
    avail, status, buyerLoss, sellerLoss, actualT, paymentL, appliedL, topUpL, fillL, availAfter);
  const __c1 = S05_PROF ? performance.now() : 0;
  if (S05_PROF) s05Phase.settleCore += __c1 - __c0;

  // ---- EFFECTS: replay in row order; the payment sequence and every object write matches the
  // inline walk leg for leg.
  // Per-slot lazy handles: updateOf CREATES a week record on first touch, so the caches fill
  // at exactly the old first-call sites (row order) and only the repeat probes disappear.
  const supUpC: (import('./context').CompanyWeekUpdate | undefined)[] = new Array(slotSuppliers.length);
  const custUpC: (import('./context').CompanyWeekUpdate | undefined)[] = new Array(custSlots.length);
  const supPidC = new Int32Array(slotSuppliers.length).fill(-1);
  const custPidC = new Int32Array(custSlots.length).fill(-1);
  for (let i = 0; i < m; i++) {
    const r = rows[i];
    const st = status[i];
    if (st === CS_DEAD_MISSING || st === CS_DEAD_CUSTOMER) { dead.push(r); continue; }
    const supplier = supplierOf[i]!;
    const customer = customerOf[i]!;
    const cs = custSlot[i];
    if (st === CS_DEAD_SUPPLIER) {
      if (needLocal[i] > 0) {
        const custUp = custUpC[cs] ?? (custUpC[cs] = wk.updateOf(customer));
        custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, 0.70);
      }
      dead.push(r);
      continue;
    }
    const ss = supSlot[i];
    const supPid = supPidC[ss] >= 0 ? supPidC[ss] : (supPidC[ss] = pidOf(supplier));
    const custPid = custPidC[cs] >= 0 ? custPidC[cs] : (custPidC[cs] = pidOf(customer));
    if (st === CS_DEAD_EXPIRY) {
      if (buyerLoss[i] > 0.01) payByIds(ctx, supPid, custPid, buyerLoss[i], currencyOf(customer.region), R_NONPERF);
      dead.push(r);
      continue;
    }
    if (sellerLoss[i] > 0.01) {
      payByIds(ctx, custPid, supPid, sellerLoss[i], currencyOf(customer.region), R_CANCEL);
    }
    availableBySupplier.set(supplier, availAfter[i]);
    if (topUpL[i] > 0.01) {
      payByIds(ctx, custPid, supPid, topUpL[i], currencyOf(customer.region), R_PROGRESS);
    }

    const supUp = supUpC[ss] ?? (supUpC[ss] = wk.updateOf(supplier));
    setOutputStock(supUp, subUnitId, Math.max(0, availAfter[i]), supRegPx[i]);
    supUp.salesUnits = (supUp.salesUnits ?? 0) + actualT[i];
    (supUp.salesUnitsBySubUnit ??= {})[subUnitId] = (supUp.salesUnitsBySubUnit[subUnitId] ?? 0) + actualT[i];
    supUp.salesLocal = (supUp.salesLocal ?? 0) + paymentL[i];
    contractSalesUnitsBySupplier.set(supplier, (contractSalesUnitsBySupplier.get(supplier) ?? 0) + actualT[i]);
    supUp._contractOwedUnits = (supUp._contractOwedUnits ?? 0) + T.qtyPerWeek[r];
    supUp._contractDeliveredUnits = (supUp._contractDeliveredUnits ?? 0) + Math.min(actualT[i], T.qtyPerWeek[r]);

    const custUp = custUpC[cs] ?? (custUpC[cs] = wk.updateOf(customer));
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + actualT[i];
    custUp.purchasesLocal = (custUp.purchasesLocal ?? 0) + paymentL[i];
    if (isCapitalGoodCategory) custUp.capexPurchasesLocal = (custUp.capexPurchasesLocal ?? 0) + paymentL[i];
    payByIds(ctx, custPid, supPid, paymentL[i] - appliedL[i], currencyOf(customer.region), R_DELIVERY);
    // W4: the goods move supplier → customer by wire; the lot lands with it.
    const deliveryWire = deliverGoods(companyParty(supplier), companyParty(customer), subUnitId, actualT[i], actualT[i] > 0 ? paymentL[i] / actualT[i] : 0, 'contract delivery');
    addInputInventory(v2, custUp, customer, subUnitId, supplier.ticker, actualT[i], paymentL[i], nextWeek, deliveryWire);

    if (fillL[i] < 0.95 && needLocal[i] > 0) {
      custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0, fillL[i]));
    }

    if (st === CS_DEAD_TERMINATION) {
      if (buyerLoss[i] > 0.01) payByIds(ctx, supPid, custPid, buyerLoss[i], currencyOf(customer.region), R_NONPERF);
      dead.push(r);
      continue;
    }
    survivors.push(r);
  }

  relinkChain(v2, region, subUnitId, survivors, dead);
  if (S05_PROF) s05Phase.settleEff += performance.now() - __c1;
  return survivors;
}

/**
 * What every supplier in one region will make and offer this week — the decision the firm takes
 * once, before it is split across the two books it sells into.
 */
/** CAT_TRACE seller-side summary for the traced sub-unit: why a market's offers are what they are. */
const catTraceSellers = { n: 0, idle: 0, capUnits: 0, targetUnits: 0, costs: [] as number[], expected: 0, staffed: 0, throttle: 0, opCost: 0 };

function buildRegionSupplyPlans(
  v2: V2World,
  subUnitId: string,
  reg: Region,
  regionId: RegionId,
  index: RegionMarketIndex,
  referencePriceLocal: number,
  supplierExpectedUnitPriceLocal: number,
  week: number,
  isCapexSupplierCategory: boolean,
  wk: WeekResolution
): SupplyPlan[] {
  const plans: SupplyPlan[] = [];
  const suppliers = index.suppliersBySubUnit.get(subUnitId) ?? [];
  const lineByCo = index.lineBySupplierBySubUnit.get(subUnitId);

  suppliers.forEach(comp => {
    // §3.20-i-b — a workout's stock: everything the row holds, at any price, no production.
    if (index.estateSellers.has(comp)) {
      const held = getOutputInventoryUnits(comp, subUnitId);
      if (held > 0.0001) {
        plans.push({
          key: comp.ticker, regionId, company: comp, initialInventoryUnits: held,
          targetProductionUnits: 0, targetProductionLocal: 0, arrivedProductionUnits: 0,
          openOfferUnits: held, minPriceLocal: 0,
        });
      }
      return;
    }
    const line = lineByCo!.get(comp)!;
    const warehouseCapacityLocal = comp.annualRevenue * 0.15;
    const currentInvLocal = getOutputInventoryLocal(comp, subUnitId);
    // A hard on/off switch here (full production, then a sudden drop to 30% once inventory
    // crosses one threshold) is a bang-bang controller with no hysteresis — it doesn't damp
    // toward equilibrium, it oscillates around the threshold forever (backlog clears -> snap
    // back to full production -> oversupply -> throttle again), producing multi-x week-to-week
    // swings in real cleared sales even when underlying demand is stable. A continuous response
    // that scales down smoothly as the inventory/capacity ratio grows converges instead.
    const inventoryToCapacityRatio = currentInvLocal / Math.max(1, warehouseCapacityLocal);
    // CAP: the 0.3 floor is gone (rule 6). A plant with a full warehouse and nowhere to sell
    // stops; it does not keep running at three tenths forever. Zero is a real production
    // decision, and it was the one this throttle could not express.
    const productionThrottle = Math.min(1.0, Math.max(0, 1.0 - (inventoryToCapacityRatio - 1.0) * 0.7));
    // THE PRICE-RESPONSE FACTOR IS DELETED, and it was defect one level up.
    //
    // `1 + 1.5 × (smoothedPrice/anchorPrice − 1)` read the LAG RATIO of one price series as a
    // level signal. At rest the two copies agree and the factor is exactly 1, so it decided
    // nothing in equilibrium — but when the price MOVED it acted with the wrong sign in both
    // directions: a spike put the slow copy far below the fast one and cut the plant toward
    // zero (measured: EUR housing supply ÷24 in one week, INTO 8x excess demand —
    // service spiral was largely this), while a crash ran the plant ABOVE capacity, which the
    // comment that stood here claimed the capacity term prevented (it multiplied capacity, so
    // it did not). fixed the same wrong-signed supply response in the units; this was the
    // remaining copy in the utilisation, with a stated ×1.5 no mechanism owns (rule 2).
    //
    // What legitimately decides how hard the plant runs is already here: capacity (the plant),
    // staffing (IND15), the warehouse throttle, and the cost-covering rule below (CAP's own
    // produce/idle decision, taken against the SMOOTHED expected price so one week's print
    // does not flip it). Utilisation between those bounds is 1: a plant whose price covers its
    // cost runs.

    // Production is capacity x utilisation, in UNITS. The previous version sized production in
    // dollars (annualRevenue/52) and divided by the CURRENT price, so a doubling of price halved
    // the units the same plant produced — supply fell as price rose, which is the wrong sign and
    // closes a positive feedback loop. Real capacity is physical: what price changes is
    // how hard the plant is run (productionResponseFactor) and whether the warehouse is already
    // full (productionThrottle), never how much the plant can make.
    // CAP — CAPACITY IS READ OFF PP&E, NOT WALKED.
    //
    // It was a RATE applied to its own prior value, which accumulates every error it is ever
    // given and drifts from the capital it is supposed to describe. A plant is not a rate: it is
    // what the capital can make. The line carries its own capital productivity — units a week per
    // dollar of net PP&E, fixed the first time it trades — and capacity is that times the capital
    // it has now. IND1/IND13 already grow PP&E by what was DELIVERED and COMMISSIONED, so
    // capacity simply reads the result — §3.26-f-ii: off the plant register, at this week;
    // §3.26-f-iv-c: the plant that SERVES this line — Leontief over the kinds its industry's
    // capital is made of (`capitalMixOf`), so a vintage of a kind the line does not use, or one
    // in excess of the scarcest kind, produces nothing for it.
    const netPPEForCapacityLocal = Math.max(1,
      plantEffectiveNetLocal(comp.plant, capitalMixOf([{ subUnitId, revenueShare: 1 }], profileKeyOf(comp)), week));
    if (!(line.unitsPerNetPpeDollar! > 0)) {
      const openingCapacityUnits =
        ((comp.baselineAnnualRevenue || comp.annualRevenue) / 52) * (line.revenueShare) / referencePriceLocal;
      // SAME VINTAGE ON BOTH SIDES (rule 8). The line's share belongs INSIDE the
      // anchor: dividing by the opening share here and re-multiplying by the CURRENT share on
      // every read made physical capacity track the line's revenue share week to week — plant
      // that evaporates because its PRICE moved. Measured on the CRE landlords: rental clears
      // unit-elastic (units × price constant), the other lines inflate, the share falls, and
      // capacity followed it 4,492 → 2,300 units in ten weeks while the price DOUBLED — the
      // ratchet in the capacity dimension. The comment above always said the rule:
      // capacity is the ratio times the capital it has NOW — the share re-multiplication was
      // the contradiction. Bit-identical at the anchor week; a line's capacity now moves with
      // the firm's PLANT (IND1/IND13's deliveries), never with its price.
      line.unitsPerNetPpeDollar = openingCapacityUnits / netPPEForCapacityLocal;
    }
    line.weeklyCapacityUnits = Math.max(0.0001,
      line.unitsPerNetPpeDollar! * netPPEForCapacityLocal);
    // CRE_SUPPLY_X=<n> — attribution probe only: scales this one category's capacity to test
    // whether the CRE shortage (price ×2 in 20 weeks, fill ~0.7) is the ratchet channel.
    if (subUnitId === 'commercial_rental_services' && Number(process.env.CRE_SUPPLY_X) > 0) {
      line.weeklyCapacityUnits *= Number(process.env.CRE_SUPPLY_X);
    }
    const baseMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const costRate = Math.max(0, 1 - baseMargin);
    // THE FLOOR'S WAGE COMPONENT IS THE WAGE BILL AT CURRENT STAFFING, NOT A TRAILING
    // TOTAL OVER CURRENT OUTPUT.
    //
    // `(annualRevenue − ebitda)/52` is the firm's measured weekly cost — real input lots, the
    // real wage bill, and the opening-books residual — but it TRAILS (the revenue is
    // annualized and the ebitda a week old) while the denominator below is CURRENT staffed
    // output. When the labour market sheds a firm's staff, its staffed units fall the same week
    // and the trailing wage bill inside this numerator does not, so unit cost jumps by
    // 1/staffedShare, the shutdown fires, and supply dies exactly when the price is rising:
    // measured as service spiral (EUR housing floors 39–65 → 904–1,679 in two weeks,
    // offers → 0, price ×48 in six). The ratchet, in the staffing dimension.
    //
    // So the basis is decomposed on stage 08's own persisted measurements: the wage component is
    // recomputed at CURRENT headcount and CURRENT wage indexes (same weeklyWageBillLocal owner as
    // the payroll it replaces — one representation), the input component is the real lots the
    // firm consumed, and the residual (rent-like other opex) is what remains of the trailing
    // total. A firm that sheds staff now sheds the wage half of its floor the same week its
    // output falls; the residual concentrating over fewer units is real operating leverage, not
    // a defect. NOT failed form: nothing here is per-head overhead — the residual is a
    // dollar level, and only the genuinely staff-shaped cost follows the staff.
    const trailingWeeklyCostLocal = Math.max(0, (comp.annualRevenue - comp.ebitda) / 52);
    let firmWeeklyCostLocal = trailingWeeklyCostLocal;
    let firmAvoidableCostLocal: number | undefined;
    if (comp.payrollWeeklyLocal !== undefined && comp.realInputConsumptionCostWeeklyLocal !== undefined) {
      let currentPayrollWeeklyLocal = index.currentPayrollByFirm.get(comp);
      if (currentPayrollWeeklyLocal === undefined) {
        currentPayrollWeeklyLocal = weeklyWageBillLocal(
          comp.employeeCount,
          SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 },
          getBaseAnnualWageLocal(regionId),
          reg.occupationPools,
          comp.offeredWageIndex ?? 1.0
        );
        index.currentPayrollByFirm.set(comp, currentPayrollWeeklyLocal);
      }
      const residualWeeklyLocal = Math.max(0,
        trailingWeeklyCostLocal - comp.payrollWeeklyLocal - comp.realInputConsumptionCostWeeklyLocal);
      firmWeeklyCostLocal = currentPayrollWeeklyLocal + comp.realInputConsumptionCostWeeklyLocal + residualWeeklyLocal;
      firmAvoidableCostLocal = comp.realInputConsumptionCostWeeklyLocal;
    }
    const weeklyOperatingCostLocal = firmWeeklyCostLocal * (line.revenueShare);
    // LVL — THE SHORT-RUN DECISION IS TAKEN ON AVOIDABLE COST.
    //
    // The week's wages are owed whether or not the plant runs (the labour market hires and sheds
    // on a weekly clock, — quantity weekly, price annual); what a firm SAVES by idling is
    // the inputs it would consume. The shutdown test asked whether price covered FULL cost, so
    // one week of dearer inputs against last week's price flipped whole industries off at once
    // (measured: every consumer-software producer in every region idled in the second market
    // week, unit cost 204 → 376 against an expected 325, supply 1.19M → 0.08M, the print ×3 on
    // the sliver) — a bang-bang rule with no hysteresis, exactly what the throttle comment above
    // warns of. A plant runs while the price covers what running it costs; a firm that cannot
    // cover its wages sheds them (the labour rule) and, persistently, mothballs. Until
    // stage 08 has measured the decomposition (week 1) the seed's break-even full cost stands.
    const weeklyAvoidableCostLocal = (firmAvoidableCostLocal ?? firmWeeklyCostLocal) * (line.revenueShare);

    // CAP — A FIRM THAT CANNOT COVER UNIT COST STOPS PRODUCING.
    //
    // This is own mechanism and the half recorded as missing: an investment
    // response without a production-stopping rule is half a control loop. The throttle above
    // answers "is my warehouse full"; nothing answered "does making one more unit lose money".
    // A firm facing a price below what the unit costs it idles the plant — that is what makes a
    // downturn end, because supply leaves until the price recovers, and it is why the clamp CAP0
    // removed had to go first: while EBITDA could not be negative, this could never fire.
    //
    // Unit cost is the same dollar figure the offer floor uses, so a firm never produces
    // something it would then refuse to sell.
    // LABOUR CONSTRAINS OUTPUT. Production is what the plant AND the staffed hours allow.
    //
    // Until now it was the plant alone, so a firm that could not hire produced exactly as much as
    // one fully staffed, and the labour market was decorative: vacancies went unfilled with no
    // consequence anywhere in the goods economy. A firm short of half its people makes half its
    // output, which is also what turns a hiring shortage into an inflationary force rather than a
    // statistic.
    //
    // The staffing ratio is the firm's OWN headcount against the headcount THIS plant needs at
    // full staffing — one derivation (domain/company.ts), the same ceiling the labour
    // market hires against (rule 4). Frozen at the seed headcount, a firm that built plant read
    // "fully staffed" at its old headcount and doubled output nobody worked for; scaled with
    // net PP&E, more plant needs more people to run it — which is what makes hiring the way a
    // grown firm's output actually grows.
    const staffedShare = Math.max(0, (comp.employeeCount) / fullStaffingCapHeads(comp, week));
    // What the plant can make THIS WEEK. A harvest is not a decision: the crop ripens
    // once a year and no price makes it ripen twice. Averages to 1 over the year, so this moves
    // output around the calendar and never adds any.
    const seasonalPlantFactor = seasonalFactor(subUnitId, week, 'production');
    // IND18/RULE 9 — THE CALENDAR MOVES OUTPUT; IT DOES NOT DECIDE SOLVENCY.
    //
    // The shutdown test below asks whether the price covers what a unit costs to make, and it was
    // being asked at the SEASONAL week's volume against a FULL week's operating cost. Those are
    // two different periodicities. A harvest good in its low season makes 70% of its normal
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
    // Mothballed plant is OFFLINE: its capacity is not there to staff or run until the
    // stock response brings it back (domain/company-week/capital-programme.ts). This is what
    // makes retired capacity's ABSENCE visible in supply, which is the mechanism's whole point.
    const onlineShare = 1 - Math.max(0, Math.min(1, comp.mothballedPpeShare ?? 0));
    const normalSeasonUnits = line.weeklyCapacityUnits! * productionThrottle * onlineShare;
    const staffedNormalSeasonUnits = Math.min(normalSeasonUnits, normalSeasonUnits * staffedShare);
    // THE MOTHBALL MOVES CAPACITY; IT MUST NOT DECIDE SOLVENCY (, the same
    // periodicity discipline as the seasonal factor below). Dividing the firm's cost by the
    // MOTHBALL-SHAVED volume made every mothball raise the measured unit cost that idled the
    // plant — a ratchet by construction, measured on the CRE landlords: capacity 4,492 → 2,300
    // in 20 weeks while their price DOUBLED. The test is asked at the plant's NORMAL staffed
    // volume — the basis its costs were struck on — and is bit-identical when nothing is
    // mothballed; what the firm OFFERS below is still only the online, staffed plant.
    const testVolumeUnits = line.weeklyCapacityUnits! * productionThrottle * Math.min(1, staffedShare);
    const prospectiveUnitCostLocal = testVolumeUnits > 0.0001
      ? weeklyAvoidableCostLocal / testVolumeUnits
      : Infinity;
    const coversUnitCost = supplierExpectedUnitPriceLocal >= prospectiveUnitCostLocal;
    // The week's idle record, measured where the test runs and nowhere else (rule 4):
    // stage 08's capacity-retirement rule integrates this into the mothball/scrap stock response.
    if (!coversUnitCost) {
      const up = wk.updateOf(comp);
      up.idleLineRevenueShare = (up.idleLineRevenueShare ?? 0) + Math.max(0, line.revenueShare);
    }
    const uncappedProductionUnits = staffedNormalSeasonUnits * seasonalPlantFactor;
    // PRODUCE TO SALES, NOT TO THE WAREHOUSE. The throttle above only bites once stock
    // exceeds the warehouse, so a firm in an oversupplied market ran its plant flat out into
    // seven weeks of unsold goods, paid wages and inputs for all of it, and died of cash (the
    // burn-in's EUR consumer sector). A plant makes what its management EXPECTS to sell — an
    // adaptive expectation of last week's units sold at its own horizon — plus the
    // stock it wants on hand, closed at 1/horizon a week. The stock it wants is the good's own
    // production lead of sales (the weeks it cannot respond in; at least one) — a TECHNOLOGY
    // primitive the registry already carries, no target-inventory constant. No sales record yet
    // (the seed's first week, a newborn's) means the plant's own volume, as before.
    const soldLastWeekUnits = comp.lastWeekSalesUnitsBySubUnit?.[subUnitId];
    let demandLedUnits = Infinity;
    if (soldLastWeekUnits !== undefined) {
      const memo = (comp.expectedSalesUnitsBySubUnit ??= {});
      const expectedSalesUnits = adaptiveExpectation(memo[subUnitId], soldLastWeekUnits, patienceWeeksOf(comp.management));
      memo[subUnitId] = expectedSalesUnits;
      const targetStockUnits = Math.max(1, productionLeadWeeksOf(subUnitId)) * expectedSalesUnits;
      const stockNowUnits = getOutputInventoryUnits(comp, subUnitId);
      demandLedUnits = Math.max(0,
        expectedSalesUnits + (targetStockUnits - stockNowUnits) / patienceWeeksOf(comp.management));
    }
    const plannedProductionUnits = Math.min(uncappedProductionUnits, demandLedUnits);
    if (uncappedProductionUnits > 0 && plannedProductionUnits < uncappedProductionUnits) {
      // The plant this decision did not need, in the line's revenue share — integrated by the
      // capacity-retirement rule (stage 08) into the mothball stock response, like the idle share.
      const up = wk.updateOf(comp);
      up.demandSlackRevenueShare = (up.demandSlackRevenueShare ?? 0)
        + Math.max(0, line.revenueShare) * (1 - plannedProductionUnits / uncappedProductionUnits);
    }
    const targetProductionUnits = coversUnitCost ? plannedProductionUnits : 0;
    if (process.env.CAT_TRACE === subUnitId) {
      const t = catTraceSellers;
      t.n++; if (!coversUnitCost) t.idle++;
      t.capUnits += line.weeklyCapacityUnits!; t.targetUnits += targetProductionUnits;
      t.costs.push(prospectiveUnitCostLocal); t.expected = supplierExpectedUnitPriceLocal;
      t.staffed += staffedShare; t.throttle += productionThrottle; t.opCost += weeklyOperatingCostLocal;
    }
    // The firm's experience accrues on what it STARTS making, measured here where
    // production is decided and nowhere else (rule 4).
    if (targetProductionUnits > 0) {
      const upl = wk.updateOf(comp);
      upl.producedUnitsThisWeek = (upl.producedUnitsThisWeek ?? 0) + targetProductionUnits;
      (upl.producedUnitsBySubUnit ??= {})[subUnitId] = (upl.producedUnitsBySubUnit[subUnitId] ?? 0) + targetProductionUnits;
    }
    // The plant's STRUCTURAL weekly rate, for the learning curve's seed anchor only.
    // Seeding the anchor off the first nonzero PRODUCED week annualized under-seeded any firm
    // whose first week was throttled, off-season or partly idle — and when its output then
    // normalized, ln(cum'/cum) read the recovery as years of learning at once: the
    // measured regression (USA u +3.8pts by w30 from this line's absence). Capacity is the
    // shape — a seeded firm has produced for years AT ITS PLANT'S SCALE.
    {
      const upl = wk.updateOf(comp);
      upl.plantCapacityUnitsThisWeek = (upl.plantCapacityUnitsThisWeek ?? 0) + line.weeklyCapacityUnits!;
    }
    const currentUnits = getOutputInventoryUnits(comp, subUnitId);
    // The firm offers what it HAS plus what its plant FINISHED this week, not what it
    // started. For a good made on demand these are the same number and nothing changes; for a
    // 26-week build the offer is what was begun half a year ago, which is the point.
    const pipeline = advanceProductionPipeline(
      comp.wipBySubUnit?.[subUnitId],
      productionLeadWeeksOf(subUnitId),
      targetProductionUnits,
      coversUnitCost ? weeklyOperatingCostLocal : 0
    );
    // §3.22 / goods.md B4 — YIELD: what the plant FINISHED is what the weather left of it. A
    // drought, a freeze-off or a flood in THIS region takes its stated share of the affected
    // commodity's harvest (`macro/weather.ts`), which is that commodity's value share of this
    // sub-unit's output. The lost units were paid for and never exist — that is what a loss is —
    // and the ledger records what actually arrived, so W4 holds without a scrap.
    const arrivedUnits = pipeline.arrivedUnits * (1 - subUnitYieldLossShareOf(reg.weather, subUnitId));
    // The caller trims this to what the contracts left behind, once they have settled against
    // the same stock. Here it is simply everything the firm can sell.
    const openOfferUnits = Math.max(0, arrivedUnits + currentUnits);

    // CAP / RULE 15 — THE SELLER'S FLOOR IS ITS COST IN DOLLARS, NOT A FRACTION OF THE MARKET.
    //
    // `minPriceLocal` was `referencePriceLocal x costRate x (1 + premium)` — a reservation price
    // defined as a share of the CURRENT market price. So when the price fell, every seller's
    // floor fell with it, which lowered the clearing price, which lowered next week's reference:
    // a downward ratchet with nothing real underneath it. It is why a market with **8x excess
    // demand still printed a falling price** the shortage could not stop the fall
    // because no seller was ever unwilling.
    //
    // A firm's cost is a dollar figure: the wages it pays, the input lots it consumed, the opex
    // it carries. IND3 made all three real, so the floor can be what it actually costs
    // to make a unit — and a price below it means the firm does not sell, which is CAP's stated
    // mechanism arriving where it belongs, on the offer.
    //
    // The [0.40, 0.98] band on the cost rate goes with it: it existed because the margin it read
    // was a stated number that could be anything, and since IND3 it is the residual of real
    // costs (rule 6).
    // §3.26-d: THE PREMIUM A UNIT MUST EARN IS THE RETURN THE PLANT REQUIRES, per unit — the
    // firm's own cost of capital (one owner, `domain/company-week/cost-of-capital.ts`) on its net
    // plant, this line's share of it, over the week's units. It was `(0.05 + pd × 0.60) × 1.5`: a
    // stated hurdle, a stated loss-given-default and a stated shape, beside the cost of capital the
    // labour stage already charged the same firm with.
    const lineCapitalChargeWeeklyLocal = weeklyCapitalChargeLocal(comp, riskFreeRateOf(reg), week) * Math.max(0, line.revenueShare);

    // SHARE VERSUS MARGIN, expressed only through the real offer price.
    //
    // Every seller asked cost plus the same premium, so no firm could choose to buy share by
    // pricing keener than its rivals — the one lever that actually moves share in an auction that
    // fills cheaper offers first. The posture is not a stated per-company variable and not a
    // synthetic share target: it is the firm's OWN inventory position, which stage 05 already
    // computes. A warehouse filling up is a firm that is not selling, and it gives up margin to
    // move the stock; a firm with nothing left holds out for its full premium.
    //
    // The floor beneath it is the contribution-margin bound: at full inventory the premium goes to
    // zero and the ask is unit cost, never below — a firm gives up profit to win share,
    // not money.
    const inventoryPricePressure = Math.min(1, Math.max(0, inventoryToCapacityRatio));

    plans.push({
      key: comp.ticker,
      regionId,
      company: comp,
      initialInventoryUnits: currentUnits,
      targetProductionUnits,
      targetProductionLocal: targetProductionUnits * referencePriceLocal,
      arrivedProductionUnits: arrivedUnits,
      wipQueue: pipeline.queue,
      openOfferUnits,
      // Cost per unit of what this plant actually makes, in dollars. Falls back to the
      // reference-anchored form only when the line has no production to divide by — marked up
      // by the firm's own cost of capital, the same rate the charge above is struck at.
      // The ask runs from FULL cost plus the plant's return (nothing in stock: hold out for it)
      // down to avoidable cost (warehouse full: move the stock, lose the return but not the
      // inputs) — IND6's posture with the floor where the short-run economics puts it.
      minPriceLocal: targetProductionUnits > 0.0001
        ? (weeklyAvoidableCostLocal / targetProductionUnits)
          + ((weeklyOperatingCostLocal + lineCapitalChargeWeeklyLocal) / targetProductionUnits - (weeklyAvoidableCostLocal / targetProductionUnits))
            * (1 - inventoryPricePressure)
        : referencePriceLocal * costRate * (1 + costOfCapitalOf(comp, riskFreeRateOf(reg))),
    });
  });

  if (process.env.CAT_TRACE === subUnitId && catTraceSellers.n > 0) {
    const t = catTraceSellers;
    const sorted = [...t.costs].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)];
    console.log(`  [cat-sellers] ${subUnitId} ${regionId} w${week} n${t.n} idle${t.idle} cap${(t.capUnits / 1e6).toFixed(2)}M target${(t.targetUnits / 1e6).toFixed(2)}M`
      + ` unitCost med${med.toFixed(0)} min${sorted[0].toFixed(0)} expectedPx${t.expected.toFixed(0)} staffed${(t.staffed / t.n).toFixed(2)} throttle${(t.throttle / t.n).toFixed(2)} opCost${(t.opCost / 1e6).toFixed(1)}M/wk`);
    catTraceSellers.n = 0; catTraceSellers.idle = 0; catTraceSellers.capUnits = 0; catTraceSellers.targetUnits = 0;
    catTraceSellers.costs = []; catTraceSellers.staffed = 0; catTraceSellers.throttle = 0; catTraceSellers.opCost = 0;
  }

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
    const pool = owningIndustry ? reg.smePools.find(p => p.industry === owningIndustry) : undefined;
    if (pool && owningIndustry) {
      const siblings = smePoolSubUnits(owningIndustry);
      const measured = pool.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
      const measuredTotal = siblings.reduce((a, su) => a + Math.max(0, measured[su.unitId] ?? 0), 0);
      // step 3 — the rule lives on the pool (domain/sme-pool.ts), not here. What used to
      // sit inline gave a sub-unit the pool had never sold into a share of exactly zero, for ever
      //no offer produces no measurement produces no offer.
      const mixShare = capacityMixShares(siblings.map((su) => ({
        subUnitId: su.unitId,
        demandLevelAnnualLocal: reg.categoryDemand[su.unitId]?.demandLevelAnnualLocal ?? 0,
        measuredRevenueLocal: Math.max(0, measured[su.unitId] ?? 0),
      }))).get(subUnitId) ?? 0;
      // Capacity is sized off the pool's GOODS revenue — what it actually sells in these books —
      // not its total, which includes services that never pass through an auction.
      const goodsRevenueLocal = measuredTotal > 0 ? measuredTotal : pool.annualRevenueLocal;
      const poolOfferUnits = ((goodsRevenueLocal / 52) * mixShare) / referencePriceLocal;
      if (poolOfferUnits > 0.001) {
        plans.push({
          key: privateSegmentOfferId(regionId, owningIndustry),
          regionId,
          industry: owningIndustry,
          initialInventoryUnits: 0,
          // A pool's offer is a RATE (its own measured weekly goods revenue), not a
          // stock drawn down from a warehouse, so there is no production start for a lead time
          // to sit between. Its lag is the measurement's own, one week.
          targetProductionUnits: 0,
          targetProductionLocal: 0,
          arrivedProductionUnits: 0,
          openOfferUnits: poolOfferUnits,
          // Its own unit cost: a pool earning a 9% margin cannot sell below 91 cents on the
          // dollar of the reference price and stay solvent.
          // CAP — the half-the-reference floor is gone (rule 6). It existed because `marginPct`
          // could be anything; since IND3 a margin is the residual of real costs, so `1 − margin`
          // IS the pool's unit cost and needs no floor under it. A cost cannot be negative.
          minPriceLocal: referencePriceLocal * Math.max(0, 1 - pool.marginPct),
        });
      }
    }
  }

  return plans;
}

/** What every buyer in one region wants this week, before it is split across the two books. */
function buildRegionDemandPlans(
  v2: V2World,
  subUnitId: string,
  reg: Region,
  regionId: RegionId,
  index: RegionMarketIndex,
  referencePriceLocal: number,
  contractUnitsByCustomer: Map<string, number>,
  isCapexSupplierCategory: boolean,
  isRecipeInputCategory: boolean,
  govShare: number,
  hhShare: number,
  week: number
): DemandPlan[] {
  const plans: DemandPlan[] = [];
  const demandState = reg.categoryDemand[subUnitId] ?? defect(`a demand plan for ${subUnitId} in a region that does not carry it`);
  const suppliers = index.suppliersBySubUnit.get(subUnitId) ?? [];
  const supplierSet = suppliers.length > 0 ? new Set(suppliers) : null;

  // Real, complete corporate demand for every OTHER category (see 03-category-demand.ts's
  // corporateDemandLocal — the same buyerMix/aggregate-investment math that feeds the region's
  // C+I+G identity, not a hand-picked per-category intensity list that only covered a handful
  // of categories and let every other one starve for real corporate buyers).
  const hasCorporateDemand = (demandState.corporateDemandLocal ?? 0) > 0;
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
  const totalCustomerRevenueLocal = customers.reduce((s, c) => s + c.annualRevenue, 0) || 1;

  customers.forEach(comp => {
    let demandLocal: number;
    if (isCapexSupplierCategory) {
      const realCapexLocal = (comp.maintenanceCapex) + (comp.growthCapex);
      // §3.26-f-iv-b: this buyer's capex in ITS industry's capital mix, not one basket for all.
      demandLocal = (realCapexLocal / 52) * (capitalMixOf(comp.productLines, profileKeyOf(comp))[subUnitId] ?? 0);
    } else if (isRecipeInputCategory) {
      demandLocal = computeRecipeInputNeedLocal(comp, subUnitId, week);
    } else {
      // This company's real named bid is its revenue share of the category's real total
      // corporate demand — every company that could plausibly buy this category gets a bid
      // sized to its own scale, and the bids sum exactly to the real regional total.
      demandLocal = ((demandState.corporateDemandLocal ?? 0) / 52) * (comp.annualRevenue / totalCustomerRevenueLocal);
    }
    const contractPurchases = (contractUnitsByCustomer.get(comp.ticker) ?? 0) + (contractUnitsByCustomer.get(comp.id) ?? 0);
    const openBidUnits = Math.max(0, (demandLocal / referencePriceLocal) - contractPurchases);
    if (openBidUnits <= 0.001) return;

    const cashRatio = cashOf(v2, comp) / Math.max(1, comp.annualRevenue);
    // The buyer's own horizon sets what it takes the price to BE: a patient buyer
    // anchors on the average of the last `patience` prints, an impatient one on last week's.
    // The cap on its ladder is reach × that expectation, so one short week moves a patient
    // buyer's reservation by a fraction of what it moves an impatient one's (ratchet
    // had every buyer anchored on the same print).
    const patienceWeeks = patienceWeeksOf(comp.management);
    const riskAversion = riskAversionOf(comp.management);
    const expectedPriceLocal = expectationFromHistory(demandState.priceHistory, referencePriceLocal, patienceWeeks);
    // A cash-strapped buyer discounting its OWN bid price used to be the mechanism here —
    // but under pro-rata clearing every in-the-money bid gets the same fill ratio regardless
    // of how far above the clearing price it sits, so a discounted bid is either fully in the
    // money like everyone else, or (once the clearing price rises past it) shut out entirely.
    // That produced a compounding death spiral with no recovery path: low cash -> lower bid
    // price -> shut out -> can't get inputs -> less revenue -> less cash. A capital-constrained
    // real buyer instead orders LESS at a normal market price (real capital rationing), so
    // whatever it does order actually clears.
    const cashConstrainedQtyModifier = cashRatio < 0.02 * riskAversion ? 0.70 : 1.0;
    const units = openBidUnits * cashConstrainedQtyModifier;
    const reach = isCapexSupplierCategory ? 1 : marginReach(comp, demandLocal * 52);
    plans.push({
      key: comp.ticker,
      regionId,
      company: comp,
      demandUnits: units,
      maxPriceLocal: expectedPriceLocal * reach,
      rungs: budgetRungs(units * referencePriceLocal, units, expectedPriceLocal, reach),
    });
  });

  // 1$ is 1$ Phase 3 (demand-side): the private sector spends real capex too — every segment
  // bids for capital-goods categories from its own real capexLocal, so a segment's capex dollars
  // land on a real named supplier instead of being credited as an ambient revenue bump.
  if (isCapexSupplierCategory) {
    reg.smePools.forEach(segment => {
      const segCapexLocal = segment.capexLocal;
      if (segCapexLocal <= 0) return;
      const demandUnits = ((segCapexLocal / 52) * (INDUSTRY_REGISTRY[segment.industry].capitalMix[subUnitId] ?? 0)) / referencePriceLocal;
      if (demandUnits <= 0.001) return;
      plans.push({
        key: privateSegmentOfferId(regionId, segment.industry),
        regionId,
        demandUnits,
        maxPriceLocal: referencePriceLocal,
        rungs: budgetRungs(demandUnits * referencePriceLocal, demandUnits, referencePriceLocal, 1),
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
    reg.smePools.forEach(pool => {
      // CHAIN-D: blended over what this pool actually SELLS, because its industry's products no
      // longer share one recipe. A pool with no sales yet falls back to an equal split.
      const intensity = smePoolRecipeInputs(pool.industry, pool.salesDerivedAnnualRevenueUSDBySubUnit)[subUnitId];
      if (!intensity) return;
      const demandUnits = ((pool.annualRevenueLocal / 52) * intensity) / referencePriceLocal;
      if (demandUnits <= 0.001) return;
      const poolReach = intensity > 0 ? 1 + Math.max(0, pool.marginPct) / intensity : 1;
      plans.push({
        key: privateSegmentOfferId(regionId, pool.industry),
        regionId,
        demandUnits,
        maxPriceLocal: referencePriceLocal * poolReach,
        rungs: budgetRungs(demandUnits * referencePriceLocal, demandUnits, referencePriceLocal, poolReach),
      });
    });
  }

  // Government Aggregate Bid — PUB1e: the treasury's OWN weekly budget for this category, set by
  // stage 03 from the real primary budget net of debt service.: the fallback that
  // re-derived it here as a share of the smoothed demand level is DELETED — it was the PUB1e
  // deletion surviving as a `??` arm, it went live for every capex category stage 03
  // dropped from the map, and a bid sized off the demand level has no appropriation behind it.
  // No published budget, no bid: a government cannot spend what nothing appropriated.
  const govBudgetWeeklyLocal = reg.governmentProcurementBudgetByCategory?.[subUnitId] ?? 0;
  if (govShare > 0 && govBudgetWeeklyLocal > 0) {
    const govDemandUnits = govBudgetWeeklyLocal / referencePriceLocal;
    if (govDemandUnits > 0.001) {
      plans.push({
        regionId,
        isGovernmentAggregate: true,
        demandUnits: govDemandUnits,
        maxPriceLocal: referencePriceLocal,
        rungs: budgetRungs(govBudgetWeeklyLocal, govDemandUnits, referencePriceLocal, 1),
      });
    }
  }

  // Household Aggregate Bid
  if (hhShare > 0) {
    // Coats in winter, gifts in December. The seasonal swing is on the HOUSEHOLD leg
    // because that is where a retail peak lives; a firm's demand for its own inputs follows its
    // own production, which already carries the production side of the same calendar.
    // A household's money buys what it buys AT THE SHELF, which is the landed price plus
    // what the channel charges to hold the stock it is buying out of. Dividing the budget by the
    // factory-gate price was the model paying no one to move the goods.
    const channelMargin = channelMarginRate(subUnitId, reg.zeroRates.tenor3M);
    const shelfPrice = shelfPriceLocal(referencePriceLocal, subUnitId, reg.zeroRates.tenor3M);
    // THE BUDGET IS THE MEASURED HOUSEHOLD LEG, NOT A SLICE OF THE DEMAND LEVEL (rule 4).
    //
    // `demandLevelAnnualLocal × hhShare` carved the household's money out of the category's TOTAL demand
    // a level that carries the corporate leg (firms' nominal revenues × input intensity) and
    // the Leontief intermediate half. In a category with persistent excess demand that closes a
    // loop with nothing real in it: the price rises → the buying industries' nominal revenues
    // rise → the corporate leg re-inflates the demand level → the household is handed a bigger
    // budget and its ladder's reservation climbs → the price rises. Measured as the EUR
    // electricity runaway: price ×119 in ten weeks while the UNIT shortage improved
    // 0.59→0.97 and capacity, staffing and supplier count all held flat — the demand level went
    // 19.9B→1,836B with the household bidding it. Stage 03 owns the household's real money — the
    // cohorts' consumption budgets, allocated by tier — and this ladder is sized from that leg
    // alone, so a household cannot outbid its own income no matter what the firms beside it pay.
    const hhAnnualBudgetLocal = demandState.householdDemandLocal ?? (demandState.demandLevelAnnualLocal * hhShare);
    let hhDemandUnits = (hhAnnualBudgetLocal / 52) / shelfPrice
      * seasonalFactor(subUnitId, week, 'demand');

    if (subUnitId === 'passenger_vehicles') {
      const initialStock = reg.householdState.durableGoodsStockUnits ?? ((hhAnnualBudgetLocal / shelfPrice) * 3.5);
      const scrappageRate = 0.12 / 52;
      const replacementDemandUnits = initialStock * scrappageRate;
      const targetStock = (reg.estimatedHouseholdIncomeLocal * (1 - reg.householdState.savingsRate) * 0.10) / shelfPrice;
      const expansionDemandUnits = Math.max(0, (targetStock - initialStock) * 0.05);
      hhDemandUnits = replacementDemandUnits + expansionDemandUnits;
      // Scrappage happens once a week, not once per book: the stock is retired here and this
      // week's fills are added back after both books have cleared.
      reg.householdState.durableGoodsStockUnits = initialStock - replacementDemandUnits;
    }

    if (hhDemandUnits > 0.001) {
      // THE HOUSEHOLD POSTS A SCHEDULE, NOT A QUANTITY AT A CEILING.
      //
      // It used to bid its whole week's units at one price: the going price times a frozen
      // constant times a chosen per-tier elasticity. A step cannot express a demand curve, so
      // that single number was standing in for a whole schedule — which is why the two honest
      // derivations of it differed by two orders of magnitude (rule 6).
      //
      // The ladder is the curve: saturating at what the household physically has use for, and
      // sloping down because `units = money / price` and the money is finite. Every input is
      // measured. **No elasticity, no premium and no price ceiling anywhere** a household facing
      // a dearer luxury buys less of it, which the curve says on its own.
      //
      // LVL — THE SLOPE IS THE COHORTS'. One regional ladder is a single step at the
      // reach-capped price (its rungs all truncate to the whole-want reservation, ), so a
      // short staple market jumped straight to the reach multiple with nothing in between — the
      // knife-edge behind the ×1.4-a-week climbs. The region's households are not one buyer: the
      // cohorts DIST built each have their own budget for this tier and their own reach, and
      // the poorest run out of money at a lower price than the richest. Posting one step PER
      // COHORT makes the aggregate a staircase — a demand curve with a measured slope and no
      // stated elasticity (: carry the distribution where the decision is nonlinear).
      const hs = reg.householdState;
      const tier = categoryPriceTier(subUnitId);
      // What it has use for: the registry's own per-capita consumption intensity, which is the
      // primitive IND-R3 put there for exactly this and which nothing outside the seed read.
      const perCapitaAnnual = subUnitSpecOf(subUnitId)?.householdUnitsPerCapitaAnnual ?? 0;
      const satiationUnits = perCapitaAnnual > 0
        ? (perCapitaAnnual * Math.max(0, reg.totalPopulation)) / 52
          * seasonalFactor(subUnitId, week, 'demand')
        : 0;
      const weeklyBudgetLocal = hhDemandUnits * shelfPrice;
      const slices: { budgetLocal: number; wantUnits: number; reach: number }[] = [];
      // The durable-stock category is a replacement flow, not a want; it keeps the one step.
      const cohorts = subUnitId === 'passenger_vehicles' ? [] : (hs.cohorts ?? []);
      if (cohorts.length > 0) {
        const mixKey = tier === 'STAPLE' ? 'staple' : tier === 'STANDARD' ? 'standard' : 'luxury';
        let weightSum = 0;
        let personSum = 0;
        const weights = cohorts.map((c) => {
          const w = Math.max(0, c.consumptionBudgetLocal) * TIER_SPEND_MIX[c.tier][mixKey];
          weightSum += w;
          personSum += Math.max(0, c.earnerCount);
          return w;
        });
        if (weightSum > 0 && personSum > 0) {
          cohorts.forEach((c, i) => {
            const share = weights[i] / weightSum;
            if (!(share > 0)) return;
            const mix = TIER_SPEND_MIX[c.tier];
            slices.push({
              budgetLocal: weeklyBudgetLocal * share,
              wantUnits: satiationUnits * (Math.max(0, c.earnerCount) / personSum),
              reach: householdBudgetReachMultiple(tier, { STAPLE: mix.staple, STANDARD: mix.standard, LUXURY: mix.luxury }),
            });
          });
        }
      }
      if (slices.length === 0) {
        slices.push({
          budgetLocal: weeklyBudgetLocal,
          wantUnits: satiationUnits,
          reach: householdBudgetReachMultiple(tier, {
            STAPLE: hs.stapleSpendShare, STANDARD: hs.standardSpendShare, LUXURY: hs.luxurySpendShare,
          }),
        });
      }
      // This book clears at the FACTORY GATE, so every rung is the factory-gate price the
      // household's willingness to pay leaves once the channel has taken its cut.
      slices.forEach((sl) => {
        budgetDemandLadder({
          weeklyBudgetLocal: sl.budgetLocal,
          referencePriceLocal,
          budgetReachMultiple: sl.reach,
          satiationUnits: sl.wantUnits,
        }).forEach((rung) => {
          if (rung.units <= 0.001) return;
          plans.push({
            regionId,
            isHouseholdAggregate: true,
            demandUnits: rung.units,
            maxPriceLocal: rung.maxPriceLocal / (1 + channelMargin),
          });
        });
      });
    }
  }

  // SEED_RECON=<subUnitId> — the seed-undersupply row's hand reconciliation, printed from
  // the plans themselves: every demand plan's buyer type and units, against the region's
  // supply, for one category in week 1 — so the ~14% (in units, ~47%) gap names its side.
  if (process.env.SEED_RECON === subUnitId && week <= 2) {
    let corpUnits = 0; let hhUnits = 0; let govUnits = 0; let segUnits = 0;
    plans.forEach((p) => {
      if (p.isHouseholdAggregate) hhUnits += p.demandUnits;
      else if (p.isGovernmentAggregate) govUnits += p.demandUnits;
      else if (p.company) corpUnits += p.demandUnits;
      else segUnits += p.demandUnits;
    });
    const cd = reg.categoryDemand[subUnitId];
    console.log(`  [recon] w1 ${regionId}:${subUnitId} demand plans (units/wk):`
      + ` corp ${(corpUnits / 1e6).toFixed(2)}M seg ${(segUnits / 1e6).toFixed(2)}M`
      + ` hh ${(hhUnits / 1e6).toFixed(2)}M gov ${(govUnits / 1e6).toFixed(2)}M`
      + ` total ${((corpUnits + segUnits + hhUnits + govUnits) / 1e6).toFixed(2)}M`
      + ` | demandLevel ${(((cd?.demandLevelAnnualLocal ?? 0) / 52) / Math.max(1e-9, referencePriceLocal) / 1e6).toFixed(2)}M`
      + ` @p${referencePriceLocal.toFixed(2)}`);
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
const s05Phase = { settleRows: 0, plans: 0, settle: 0, settleCore: 0, settlePre: 0, settleEff: 0, demand: 0, books: 0, trade: 0, sellers: 0, buyers: 0, tail: 0 };
const S05_PROF = typeof process !== 'undefined' && process.env.S05_PROF === '1';
// One-run diagnostic split INSIDE the buyers walk (method: name the term before
// converting anything). ~3 clock reads per lot — relative shares only, not absolute times.
const S05B_PROF = typeof process !== 'undefined' && process.env.S05B_PROF === '1';
const s05Buyers = { pay: 0, invoice: 0, lots: 0, planRest: 0 };
function runSubUnitMarkets(
  v2: V2World,
  ctx: WeeklyStepContext,
  subUnitId: string,
  govShare: number,
  hhShare: number,
  indexes: Record<RegionId, RegionMarketIndex>,
  lookup: GlobalFirmLookup,
  wk: WeekResolution,
  sourcing: SourcingContext
): void {
  const CT = v2.contracts;
  const { nextWeek } = ctx;

  const isRecipeInputCategory = Object.values(CATEGORY_INPUT_REQUIREMENTS).some(reqs => reqs?.[subUnitId] !== undefined);
  const isCapexSupplierCategory = isCapitalGood(subUnitId);
  const massTonnes = sourcing.unitMassTonnes[subUnitId] ?? 0;

  // --- 1. Each book's anchor price, read before anything this week moves it.
  const anchorPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId];
    const published = demandState?.unitPriceLocal ?? 0;
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
  const __t0 = S05_PROF ? performance.now() : 0;
  const supplyPlans: SupplyPlan[] = [];
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const demandState = reg.categoryDemand[subUnitId];
    if (!demandState) return;
    const prevSmoothed = demandState.smoothedUnitPriceLocal ?? 0;
    const smoothedBasis = prevSmoothed > 0 ? prevSmoothed : anchorPrice[regionId];
    demandState.smoothedUnitPriceLocal = smoothedBasis * 0.75 + anchorPrice[regionId] * 0.25;

    supplyPlans.push(...buildRegionSupplyPlans(
      v2,
      subUnitId, reg, regionId, indexes[regionId], anchorPrice[regionId], demandState.smoothedUnitPriceLocal,
      nextWeek, isCapexSupplierCategory, wk));
  });

  // --- 3. Contracts settle, against what each supplier actually HAS: its opening stock plus
  //        what its plant finished this week. The balance is drawn down as it ships, so a
  //        supplier with three contracts cannot deliver the same units to all three — which is
  //        what reading the warehouse fresh inside each contract used to let it do.
  const __t1 = S05_PROF ? performance.now() : 0;
  const availableBySupplier = new Map<Company, number>();
  supplyPlans.forEach(p => {
    if (!p.company) return;
    availableBySupplier.set(p.company, p.initialInventoryUnits + p.arrivedProductionUnits);
  });
  const contractSalesUnitsBySupplier = new Map<Company, number>();
  const survivingRows = {} as Record<RegionId, number[]>;
  MARKET_REGION_IDS.forEach(regionId => {
    survivingRows[regionId] = settleContracts(
      v2, ctx, subUnitId, regionId, wk, anchorPrice,
      contractSalesUnitsBySupplier, availableBySupplier
    );
  });

  const __t2 = S05_PROF ? performance.now() : 0;
  // --- 4. What every buyer wants, net of the contract volume it is already committed to.
  const contractUnitsByCustomer = new Map<string, number>();
  MARKET_REGION_IDS.forEach(regionId => {
    survivingRows[regionId].forEach(r => {
      const key = partyKeyOf(v2, CT.customerRef[r]);
      contractUnitsByCustomer.set(key, (contractUnitsByCustomer.get(key) ?? 0) + CT.qtyPerWeek[r]);
    });
  });

  const demandPlans: DemandPlan[] = [];
  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    const demandState = reg.categoryDemand[subUnitId];
    if (!demandState) return;
    demandPlans.push(...buildRegionDemandPlans(
      v2,
      subUnitId, reg, regionId, indexes[regionId], anchorPrice[regionId],
      contractUnitsByCustomer, isCapexSupplierCategory, isRecipeInputCategory,
      govShare, hhShare, nextWeek
    ));
  });

  // The open market gets what the contracts did not take. A supplier not in the plans (one that
  // has stopped producing this line) never offered anything to adjust.
  supplyPlans.forEach(p => {
    if (!p.company) return;
    p.openOfferUnits = Math.max(0, availableBySupplier.get(p.company) ?? 0);
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

  const __t3 = S05_PROF ? performance.now() : 0;
  // --- 5. Build the four books. Suppliers offer only at home; buyers bid everywhere they intend.
  const bidsByOrigin = {} as Record<RegionId, UnitBid[]>;
  const offersByOrigin = {} as Record<RegionId, UnitOffer[]>;
  MARKET_REGION_IDS.forEach(r => { bidsByOrigin[r] = []; offersByOrigin[r] = []; });

  supplyPlans.forEach(plan => {
    if (plan.openOfferUnits <= 0.001) return;
    offersByOrigin[plan.regionId].push({
      companyId: plan.key, regionId: plan.regionId,
      quantityUnits: plan.openOfferUnits, minPriceLocal: plan.minPriceLocal,
    });
  });

  demandPlans.forEach(plan => {
    if (plan.demandUnits <= 0.001) return;
    const shares = originShare(plan.regionId);
    // A plan with rungs is several bids under one key — the book sums a key's fills, so
    // the write-back below still sees one purchase per buyer.
    const rungs = plan.rungs ?? [{ units: plan.demandUnits, maxPriceLocal: plan.maxPriceLocal }];
    Object.keys(shares).forEach(originKey => {
      const origin = originKey as RegionId;
      rungs.forEach((rung) => {
        const units = rung.units * shares[origin];
        if (units <= 0.001) return;
        // The buyer's ceiling is what it will pay DELIVERED, in its own money. What it can offer at
        // the far gate is that less the freight, converted into the seller's money — which is the
        // whole of landed-cost sourcing, expressed as a reservation.
        const exWorksCeilingBuyerMoney = rung.maxPriceLocal - freightPerUnitBuyerMoney(origin, plan.regionId);
        if (!(exWorksCeilingBuyerMoney > 0)) return;
        bidsByOrigin[origin].push({
          companyId: plan.key,
          isHouseholdAggregate: plan.isHouseholdAggregate,
          isGovernmentAggregate: plan.isGovernmentAggregate,
          regionId: plan.regionId,
          quantityUnits: units,
          maxPriceLocal: convertLocal(exWorksCeilingBuyerMoney, plan.regionId, origin, sourcing.fxToUsd),
        });
      });
    });
  });

  const results = {} as Record<RegionId, BookResult>;
  MARKET_REGION_IDS.forEach(origin => {
    results[origin] = clearBook(bidsByOrigin[origin], offersByOrigin[origin], anchorPrice[origin], offerRegionByKey);
  });

  const __t4 = S05_PROF ? performance.now() : 0;
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
        const valueBuyerMoney = convertLocal(lot.units * book.clearedPriceLocal, lot.sellerRegion, buyerRegion, sourcing.fxToUsd);
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
        const exWorksBuyerMoney = convertLocal(book.clearedPriceLocal, lot.sellerRegion, buyerRegion, sourcing.fxToUsd);
        const landed = exWorksBuyerMoney + freightPerUnitBuyerMoney(lot.sellerRegion, buyerRegion);
        paidValue[buyerRegion] += lot.units * landed;
        paidUnits[buyerRegion] += lot.units;
      });
    });
  });
  const publishedPrice = {} as Record<RegionId, number>;
  MARKET_REGION_IDS.forEach(r => {
    publishedPrice[r] = paidUnits[r] > 0.0001 ? paidValue[r] / paidUnits[r] : results[r].clearedPriceLocal;
  });

  const __t5 = S05_PROF ? performance.now() : 0;
  /** What each seller was actually PAID this week, accumulated from the payment legs themselves
   *  the corporate buyers' below and the aggregate buyers' after them. It is what becomes the
   *  seller's revenue, so the statement and the account cannot disagree. */
  const paidToSellerByKey = new Map<string, number>();
  // --- 8. Settle production and inventory ONCE per supplier.
  supplyPlans.forEach(plan => {
    const sale = results[plan.regionId].salesByKey.get(plan.key);
    const soldUnits = sale?.quantity ?? 0;
    if (!plan.company) return;
    const comp = plan.company;
    const supUp = wk.updateOf(comp);
    const contractSalesUnitsThisSubUnit = contractSalesUnitsBySupplier.get(comp) ?? 0;
    // What lands in the warehouse is what the pipeline FINISHED, not what was started.
    // W4: the ledger records the production and sets the stock; every unit delivered
    // (contract or market) left by a wire written where the buyer was known.
    // §3.20-i-b — a dead seller's row is written on the firm itself: stage 08 skips a dead
    // firm, so a week update for it would land nowhere and the goods that left by wire would
    // still stand on the estate's row.
    settleOutputInventory(indexes[plan.regionId].estateSellers.has(comp) ? comp : supUp, plan.regionId, subUnitId, plan.initialInventoryUnits, plan.arrivedProductionUnits,
      contractSalesUnitsThisSubUnit, soldUnits, results[plan.regionId].clearedPriceLocal);
    if (plan.wipQueue) {
      if (!supUp.wipBySubUnit) supUp.wipBySubUnit = { ...(comp.wipBySubUnit ?? {}) };
      supUp.wipBySubUnit[subUnitId] = plan.wipQueue;
    }
    if (soldUnits > 0) {
      supUp.salesUnits = (supUp.salesUnits ?? 0) + soldUnits;
      (supUp.salesUnitsBySubUnit ??= {})[subUnitId] = (supUp.salesUnitsBySubUnit[subUnitId] ?? 0) + soldUnits;
    }
    supUp._targetProductionLocal = (supUp._targetProductionLocal ?? 0) + plan.targetProductionLocal;
  });

  MARKET_REGION_IDS.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    // SEG-B/D: the pool's revenue is what it MEASURABLY SOLD. One book keyed by sub-unit —
    // the old pair (a supply book and a capex book) existed only because a bucket could be
    // credited through two different hardcoded routes, and each route's write subtracted the
    // other's prior contribution as if it were its own.
    const owningIndustry = industryOfSubUnit(subUnitId);
    const pool = owningIndustry ? reg.smePools.find(p => p.industry === owningIndustry) : undefined;
    if (pool && owningIndustry) {
      const amountLocal = results[regionId].salesByKey.get(privateSegmentOfferId(regionId, owningIndustry))?.amount ?? 0;
      const newAnnualizedLocal = amountLocal * 52;
      // The BOOK is this pool's goods mix and its goods revenue. The pool's TOTAL revenue is
      // owned by the sme-pools stage, which measures it from every receipt — a pool sells
      // services too, and crediting only its auction sales here made the same number mean two
      // different things depending on which stage last wrote it (rule 4).
      const book = pool.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
      book[subUnitId] = newAnnualizedLocal;
      pool.salesDerivedAnnualRevenueUSDBySubUnit = book;
    }
  });

  const __t6 = S05_PROF ? performance.now() : 0;
  // --- 9. Settle every buyer once, in ITS money, at the landed cost it actually paid.
  const deferredPurchaseLocal = new Map<string, number>();
  const deferredSaleKeyed = new Map<string, number>();
  // Who actually bought anywhere this week — plans absent from every book write nothing and are
  // skipped before the per-origin walk (bit-exact: they returned with no writes anyway).
  const purchasedKeys = new Set<string>();
  MARKET_REGION_IDS.forEach(origin => results[origin].purchasesByKey.forEach((_, k) => purchasedKeys.add(k)));
  // SCALE — party and reason ids interned once per market instead of two string-map
  // probes per LEG (this walk emits the bulk of the week's ~170k instructions: ex-works,
  // freight, trade credit and the fx pip, per lot).
  // SCALE — the pid caches and aggregate ids live on the weekly bundle now:
  // they were rebuilt once per MARKET (~200 times a week) for values that are fixed all week.
  const { pidOfSeller, pidOfCarrier, hhPid, govPid } = wk;
  // Stage IV — per-(origin, buyer-region) facts hoisted to 4x4 matrices per market: the
  // ex-works conversion, the landed per-unit, and the transit arrival week were recomputed per
  // (plan, origin) pair (thousands of pure-function calls per market for 16 distinct values).
  // Same functions, same arguments, same floats.
  const exWorksM = new Map<RegionId, Map<RegionId, number>>();
  const arrivalM = new Map<RegionId, Map<RegionId, number>>();
  MARKET_REGION_IDS.forEach(origin => {
    const exRow = new Map<RegionId, number>();
    const arRow = new Map<RegionId, number>();
    MARKET_REGION_IDS.forEach(buyer => {
      exRow.set(buyer, convertLocal(results[origin].clearedPriceLocal, origin, buyer, sourcing.fxToUsd));
      arRow.set(buyer, nextWeek + Math.round(laneTransitWeeks(origin, buyer, laneDistanceNm(origin, buyer))));
    });
    exWorksM.set(origin, exRow);
    arrivalM.set(origin, arRow);
  });
  // The lane's carriers with pid and region resolved ONCE — built lazily at the lane's first
  // paying lot, so pid interning keeps the old first-use order.
  const laneCarrierCache = new Map<string, { share: number; id: EntityId; pid: number; region: RegionId | undefined }[] | undefined>();
  demandPlans.forEach(plan => {
    if (!plan.company || !plan.key) return;
    if (!purchasedKeys.has(plan.key)) return;
    const comp = plan.company;
    const buyerPid = wk.pidOf(comp);
    const buyerUpdate = wk.updateOf(comp);
    let units = 0;
    let landedCost = 0;
    MARKET_REGION_IDS.forEach(origin => {
      const book = results[origin];
      const buy = book.purchasesByKey.get(plan.key!);
      if (!buy || buy.quantity <= 0.0001) return;
      // A lot bought abroad is paid for in the seller's money and carried home; both legs land on
      // this buyer's books in its own money.
      const exWorksBuyerMoney = exWorksM.get(origin)!.get(plan.regionId)!;
      const perUnit = exWorksBuyerMoney + freightPerUnitBuyerMoney(origin, plan.regionId);
      units += buy.quantity;
      landedCost += buy.quantity * perUnit;
      // XB3a-4: what was bought is not yet what has arrived. A consignment is in transit for as
      // long as the lane physically takes, and only lands on the buyer's input inventory when it
      // gets there. Domestic hauls that complete inside the week land immediately, which is what
      // a same-week road delivery is.
      const arrivalWeek = arrivalM.get(origin)!.get(plan.regionId)!;
      // grind: the lane's carrier shares are a per-(origin, buyer-region) fact, probed
      // once here instead of once per LOT (~25k probes + key strings a week).
      const laneK = laneKey(origin, plan.regionId);
      let laneCarriers = laneCarrierCache.get(laneK);
      if (laneCarriers === undefined && !laneCarrierCache.has(laneK)) {
        const shares = ctx.freightClearing?.carrierShareByLane.get(laneK);
        if (shares) {
          laneCarriers = [];
          shares.forEach((share, carrierId) => {
            if (!(share > 0)) return; // a zero share never paid, so it never resolved either
            laneCarriers!.push({
              share, id: carrierId, pid: pidOfCarrier(carrierId),
              region: lookup.byId.get(carrierId)?.region,
            });
          });
        }
        laneCarrierCache.set(laneK, laneCarriers);
      }
      (book.lotsByBuyer.get(plan.key!) ?? []).forEach(l => {
        const __b0 = S05B_PROF ? performance.now() : 0;
        if (S05B_PROF) s05Buyers.lots++;
        // SETL-C: the auction knows exactly who bought whose lot, so the payment keeps its
        // counterparty instead of both sides netting through the boundary.
        // The buyer pays LANDED cost; the seller receives only ex-works. The difference is the
        // freight, which belongs to the carriers — paid on shipped tonnage further down this
        // stage, so it is named here rather than handed to the seller.
        const sellerPid = pidOfSeller(l.sellerKey, origin);
        const exWorksPaidLocal = l.units * exWorksBuyerMoney;
        payByIds(ctx, buyerPid, sellerPid, exWorksPaidLocal, currencyOf(plan.regionId), R_EXWORKS);
        // WHAT A SELLER EARNED IS WHAT ITS BUYERS PAID IT. A cross-border buyer pays in ITS
        // money and the seller booked the auction's origin-money value of the same lot, so the
        // revenue on its statement and the cash on its account differed by the exchange rate —
        // two representations of one sale. Recorded here, from the payment itself.
        paidToSellerByKey.set(l.sellerKey, (paidToSellerByKey.get(l.sellerKey) ?? 0) + exWorksPaidLocal);
        // XB3a-2/CASH: THE CARRIER IS PAID BY THE BUYER, by name. The carriers have been real
        // companies since XB3a-2 — real fleets, real fuel at the refined-product price, real crew
        // through the labour market, listed equity, a home bank — but this leg paid the boundary
        // and the carrier's freight then arrived on its books as `non-auction operating receipts`,
        // also from the boundary. Two anonymous ends of one payment whose parties are both known.
        //
        // It is also ONE quantity now (rule 4). The carriers' revenue used to be re-derived from
        // `shippedTonnesByLane x rate x share` further down this stage — a second computation of
        // the same freight, in the carrier's money rather than the buyer's, which could not agree
        // with what any buyer was charged. What a carrier earned is what its customers paid it.
        const freightLocal = l.units * (perUnit - exWorksBuyerMoney);
        if (freightLocal > 0) {
          let paidLocal = 0;
          laneCarriers?.forEach(({ share, id: carrierId, pid: carrierPid, region: carrierRegion }) => {
            const amountLocal = freightLocal * share;
            if (!(amountLocal > 0)) return;
            paidLocal += amountLocal;
            // money-locality: the freight leg is BUYER money, and a carrier serves lanes
            // whose buyers pay in four different monies — summing them raw made its revenue
            // line a currency salad and its margin an FX artifact. The carrier's income stat
            // accrues in the carrier's OWN money; the payment instruction below keeps today's
            // buyer-money convention until Money<C> lands at the pay seam.
            ctx.carrierFreightRevenue[carrierId] = (ctx.carrierFreightRevenue[carrierId] ?? 0)
              + (carrierRegion ? convertLocal(amountLocal, plan.regionId, carrierRegion, sourcing.fxToUsd) : amountLocal);
            payByIds(ctx, buyerPid, carrierPid, amountLocal, currencyOf(plan.regionId), R_FREIGHT);
          });
          // A lane no NAMED carrier serves is still sailed by SOMEBODY: the unnamed
          // small transporters the SME tier exists to represent. The freight pays the origin
          // region's transport pool — a real aggregate with a cash line and a bank, exactly the
          // counterparty the SEGMENT party kind was built for — instead of the boundary. The
          // line still shrinks to nothing as the named fleet reaches every lane; until then the
          // money reaches the sector that actually moved the goods.
          const unservedLocal = freightLocal - paidLocal;
          if (unservedLocal > 0.01) {
            pay(ctx, {
              payer: companyParty(comp),
              payee: { kind: 'SEGMENT', region: origin, industry: 'AutomotiveTransport' },
              amount: unservedLocal,
              currency: currencyOf(origin),
              reason: 'freight on a lane no carrier serves',
            });
          }
        }
        const __b1 = S05B_PROF ? performance.now() : 0;
        if (S05B_PROF) s05Buyers.pay += __b1 - __b0;
        const sellerParty = partyOfKey(l.sellerKey, origin, lookup);
        if (arrivalWeek <= nextWeek) {
          // W4: a same-week delivery moves seller → buyer by one wire.
          const w = deliverGoods(sellerParty, companyParty(comp), subUnitId, l.units, perUnit, 'goods sold: delivered');
          addInputInventory(v2, buyerUpdate, comp, subUnitId, l.sellerKey, l.units, l.units * perUnit, nextWeek, w);
        } else {
          // W4: a consignment is HELD BY ITS CARRIER while it moves — the lane's named
          // fleets by their shares, the origin's transport pool for the share no fleet serves —
          // and reaches the buyer at arrival (goods-arrival.ts). One consignment per holder.
          let consignedUnits = 0;
          laneCarriers?.forEach(({ id: carrierId, region: carrierRegion, share }) => {
            const units = l.units * share;
            if (!(units > 1e-9)) return;
            consignedUnits += units;
            deliverGoods(sellerParty, companyPartyOf(carrierId), subUnitId, units, perUnit, 'goods sold: consigned to the carrier');
            ctx.shipmentsDispatched.push({
              buyerId: comp.id, sellerKey: asTicker(l.sellerKey), subUnitId,
              units, landedCostPerUnit: perUnit, arrivalWeek, carrierId, carrierRegion: carrierRegion ?? origin,
            });
          });
          const poolUnits = l.units - consignedUnits;
          if (poolUnits > 1e-9) {
            deliverGoods(sellerParty, { kind: 'SEGMENT', region: origin, industry: 'AutomotiveTransport' }, subUnitId, poolUnits, perUnit, 'goods sold: consigned to the carrier');
            ctx.shipmentsDispatched.push({
              buyerId: comp.id, sellerKey: asTicker(l.sellerKey), subUnitId,
              units: poolUnits, landedCostPerUnit: perUnit, arrivalWeek, carrierRegion: origin,
            });
          }
        }
        // XB3a-5: a cross-border sale between two real books is INVOICED — in whichever currency
        // costs the pair least to carry the risk in, on terms the buyer's own credit supports —
        // and the cash follows when it falls due. A lot whose buyer is a household or government
        // aggregate has no cash leg here to defer, so deferring one would invent an exposure.
        const seller = lookup.byTicker.get(l.sellerKey);
        if (!seller) return;
        // DOMESTIC TRADE CREDIT. The whole machinery below — terms set by the buyer's own
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
        // The invoice is what the SELLER is owed: ex-works, not landed. The freight in
        // `perUnit` belongs to the carrier and was paid to it above, so putting it on the
        // receivable had the seller lending its customer money the carrier had already taken.
        // It is also the amount the ex-works payment leg moves, so the credit extended below
        // and the cash collected at maturity are the same figure in the same units.
        const invoicedLocal = l.units * exWorksBuyerMoney;
        let buyerPd = sourcing.buyerAnnualPdByTicker.get(comp.ticker);
        if (buyerPd === undefined) {
          buyerPd = computeAnnualDefaultProbability(v2, comp);
          sourcing.buyerAnnualPdByTicker.set(comp.ticker, buyerPd);
        }
        const termWeeks = paymentTermWeeks({
          buyerAnnualDefaultProbability: buyerPd,
          recoveryRate: seller.recoveryRate,
          sellerMarginShare: Math.max(0, (seller.ebitda) / Math.max(1, seller.annualRevenue)),
          sellerCashLocal: cashOf(v2, seller),
          sellerWeeklySalesLocal: (seller.annualRevenue) / 52,
        });
        ctx.tradeInvoicesBooked.push({
          sellerId: seller.id, sellerRegion: origin,
          buyerId: comp.id, buyerRegion: plan.regionId,
          subUnitId, currency,
          amountCurrency: invoicedLocal / usdPerCurrency,
          bookedUsdPerCurrency: usdPerCurrency,
          weekBooked: nextWeek,
          weekDue: nextWeek + termWeeks,
        });
        deferredPurchaseLocal.set(plan.key!, (deferredPurchaseLocal.get(plan.key!) ?? 0) + invoicedLocal);
        deferredSaleKeyed.set(l.sellerKey, (deferredSaleKeyed.get(l.sellerKey) ?? 0) + invoicedLocal);
        // CASH — trade credit is a loan between two NAMED firms, so it moves between them.
        // The buyer paid ex-works above, as it must (the seller's revenue is recognised at
        // delivery); the seller hands it straight back as the credit it agreed to extend, and
        // takes it again when the invoice falls due (trade-settlement.ts). Both legs used to be
        // posted against the UNMODELED boundary on stage 08's cash walk — 9.2B gross over ten
        // weeks passing through a counterparty that does not exist, when the counterparty is
        // right here and has a name.
        payByIds(ctx, sellerPid, buyerPid, invoicedLocal, currencyOf(plan.regionId), R_TRADE_CREDIT);
        if (S05B_PROF) s05Buyers.invoice += performance.now() - __b1;
        // THE FX SPREAD HAS A PAYER NOW. A cross-border trade converts the buyer's
        // money, and until here every real-economy conversion happened at MID: the desks that
        // make the market and warehouse its residual earned nothing on the flow that is most
        // of their business (row — crediting them a spread WITHOUT a payer would have
        // printed money). The payer is the converting firm; the pip goes to its home region's
        // banks — the desks whose fxDealerBook carries the other side — pro rata by market
        // share, landing cash + equity through settlement's own BANK leg like every other
        // dealer fee. Domestic trades convert nothing and pay nothing.
        if (!isDomestic) {
          if (invoicedLocal > 0.01) {
            // The region's desks, memoised on the firm array's identity:
            // this filtered all ~2,500 firms PER CROSS-BORDER INVOICE (same list order kept,
            // so the pay sequence and every float are the ones the inline filter produced).
            // §3.26-e-iii: each desk earns ITS OWN pip on its share of the flow.
            const { banks: buyerBanks, totalShare } = fxFeeBanksOf(ctx.prevActiveFirms, plan.regionId);
            const pairMove = fxPairMoveOf(ctx, plan.regionId, origin);
            buyerBanks.forEach((b) => {
              const share = totalShare > 0
                ? ((b.bankMarketShare ?? 0) || 1) / totalShare : 0;
              if (share <= 0) return;
              const fxFeeLocal = invoicedLocal * share * fxPipOf(ctx, b, pairMove);
              if (!(fxFeeLocal > 0.01)) return;
              pay(ctx, {
                payer: companyParty(comp),
                payee: bankParty(b),
                amount: fxFeeLocal,
                currency: currencyOf(comp.region),
                reason: 'fx conversion spread',
              });
            });
          }
        }
      });
    });
    if (units <= 0.0001) return;
    const custUp = wk.updateOf(comp);
    custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + units;
    custUp.purchasesLocal = (custUp.purchasesLocal ?? 0) + landedCost;
    if (isCapitalGood(subUnitId)) custUp.capexPurchasesLocal = (custUp.capexPurchasesLocal ?? 0) + landedCost;
    const owed = deferredPurchaseLocal.get(plan.key!) ?? 0;
    if (owed > 0) custUp.tradePayableBookedLocal = (custUp.tradePayableBookedLocal ?? 0) + owed;
  });
  // The mirror on the sellers: revenue is recognised at delivery in full; what is deferred is the
  // CASH, which stage 08's ledger backs out until the invoice settles.
  deferredSaleKeyed.forEach((amount, sellerKey) => {
    const seller = lookup.byTicker.get(asTicker(sellerKey));
    if (!seller || !(amount > 0)) return;
    const sellerUpdate = wk.updateOf(seller);
    sellerUpdate.tradeReceivableBookedLocal = (sellerUpdate.tradeReceivableBookedLocal ?? 0) + amount;
  });

  const __b2 = S05B_PROF ? performance.now() : 0;
  // BOTH LEGS OF ONE TRADE, SAME PAIRING. The goods move lot by lot with the seller that
  // actually sold them (the wire further down); the cash was spread across every seller in the
  // book pro rata to what each had sold, so a household paid sellers it never bought from. Worse,
  // its own bill was a RESIDUAL — the book's total less what the firms and the segments paid —
  // rather than what its fills cost, so any disagreement between the two was silently
  // redistributed across the sellers. The auction knows whose lot it was; that seller is paid.
  MARKET_REGION_IDS.forEach(origin => {
    const book = results[origin];
    /** Household spend and the cross-border part of each aggregate's, by buyer region: the
     *  channel's cut and the FX desks' pip are charged on them once the lots are walked. */
    const hhSpentByRegion = new Map<RegionId, number>();
    const hhAbroadByRegion = new Map<RegionId, number>();
    const govAbroadByRegion = new Map<RegionId, number>();
    const addTo = (m: Map<RegionId, number>, r: RegionId, usd: number) => m.set(r, (m.get(r) ?? 0) + usd);
    book.lotsByBuyer.forEach((lots, buyerKey) => {
      if (lookup.byKey.get(buyerKey)) return; // a firm's lots are paid in the buyer loop above
      const buyerRegion = buyerRegionOfKey(buyerKey, lookup);
      if (!buyerRegion) return;
      const buyerParty = partyOfKey(buyerKey, buyerRegion, lookup);
      const buyerPid = partyId(buyerParty);
      const reason = buyerParty.kind === 'HOUSEHOLD' ? R_HH_GOODS
        : buyerParty.kind === 'GOVERNMENT' ? R_GOV_PROC : R_SEGMENT_GOODS;
      lots.forEach((l) => {
        const amountLocal = l.units * book.clearedPriceLocal;
        if (!(amountLocal > 0)) return;
        payByIds(ctx, buyerPid, pidOfSeller(l.sellerKey, origin), amountLocal, currencyOf(origin), reason);
        paidToSellerByKey.set(l.sellerKey, (paidToSellerByKey.get(l.sellerKey) ?? 0) + amountLocal);
        if (buyerParty.kind === 'HOUSEHOLD') {
          addTo(hhSpentByRegion, buyerRegion, amountLocal);
          if (origin !== buyerRegion) addTo(hhAbroadByRegion, buyerRegion, amountLocal);
        } else if (buyerParty.kind === 'GOVERNMENT' && origin !== buyerRegion) {
          addTo(govAbroadByRegion, buyerRegion, amountLocal);
        }
      });
    });
    // THE CHANNEL'S CUT, paid by the household that bought out of its stock, to the firms that
    // held it — by name, exactly as the carriers are paid their freight. The producer received
    // the factory gate above; this is the rest of what the household spent.
    hhSpentByRegion.forEach((hhLocal, buyerRegion) => {
      const buyerReg = ctx.updatedRegions[buyerRegion];
      const channelLocal = hhLocal * channelMarginRate(
        subUnitId, buyerReg.zeroRates.tenor3M);
      if (!(channelLocal > 0)) return;
      // A region with no distribution firm has no channel to pay and no margin is charged.
      ctx.channelShareByRegion[buyerRegion].forEach((share, distributorId) => {
        const amountLocal = channelLocal * share;
        if (!(amountLocal > 0)) return;
        ctx.channelMarginRevenue[distributorId] = (ctx.channelMarginRevenue[distributorId] ?? 0) + amountLocal;
        payByIds(ctx, hhPid.get(buyerRegion)!, pidOfCarrier(distributorId), amountLocal, currencyOf(buyerRegion), R_CHANNEL);
      });
    });
    // The FX pip's LAST payers: a household or a treasury buying abroad converts through the
    // same desks (the buyer region's banks, pro rata) as any converting firm, at each desk's own
    // pip — §3.26-e-iii; the flow is an aggregate over origins, so the move it is priced on is
    // the mean over the region's pairs.
    MARKET_REGION_IDS.forEach((buyerRegion) => {
      const hhAbroadLocal = hhAbroadByRegion.get(buyerRegion) ?? 0;
      const govAbroadLocal = govAbroadByRegion.get(buyerRegion) ?? 0;
      if (!(hhAbroadLocal > 0.01 || govAbroadLocal > 0.01)) return;
      const { banks: fxBanks, totalShare } = fxFeeBanksOf(ctx.prevActiveFirms, buyerRegion);
      const regionMove = fxRegionMeanMoveOf(ctx, buyerRegion);
      fxBanks.forEach((b) => {
        const share = totalShare > 0 ? ((b.bankMarketShare ?? 0) || 1) / totalShare : 0;
        if (share <= 0) return;
        const pip = fxPipOf(ctx, b, regionMove);
        const bankPid = partyId(bankParty(b));
        const hhFeeLocal = hhAbroadLocal * share * pip;
        const govFeeLocal = govAbroadLocal * share * pip;
        if (hhFeeLocal > 0.01) payByIds(ctx, hhPid.get(buyerRegion)!, bankPid, hhFeeLocal, currencyOf(buyerRegion), R_FX_SPREAD);
        if (govFeeLocal > 0.01) payByIds(ctx, govPid.get(buyerRegion)!, bankPid, govFeeLocal, currencyOf(buyerRegion), R_FX_SPREAD);
      });
    });
  });

  // The sellers' revenue, read off what they were paid rather than off the auction's own book.
  paidToSellerByKey.forEach((usd, sellerKey) => {
    const seller = lookup.byTicker.get(asTicker(sellerKey));
    if (!seller || !(usd > 0)) return;
    const up = wk.updateOf(seller);
    up.salesLocal = (up.salesLocal ?? 0) + usd;
  });

  const __t7 = S05_PROF ? performance.now() : 0;
  if (S05B_PROF) s05Buyers.planRest += __t7 - __b2;
  // W4: what a household, a treasury or a segment pool bought leaves the seller by wire
  // too — to a SINK (consumed on receipt), so no stock lands anywhere. Written AFTER the money
  // legs above so every party is interned in the order it always was (the engine's fingerprint
  // reads party ids by first sight).
  if (process.env.GOODS_TRACE === '1') {
    MARKET_REGION_IDS.forEach(origin => {
      const book = results[origin];
      let sold = 0; book.salesByKey.forEach((s) => { sold += s.quantity; });
      let lots = 0; const byBuyerKind = { firm: 0, other: 0 };
      book.lotsByBuyer.forEach((ls, buyerKey) => { ls.forEach((l) => { lots += l.units; if (lookup.byKey.get(buyerKey)) byBuyerKind.firm += l.units; else byBuyerKind.other += l.units; }); });
      let bought = 0; book.purchasesByKey.forEach((p) => { bought += p.quantity; });
      if (Math.abs(sold - lots) > 1e-3 || Math.abs(bought - lots) > 1e-3) console.log(`  [book-trace] ${origin} ${subUnitId}: sold ${sold.toFixed(1)} bought ${bought.toFixed(1)} lots ${lots.toFixed(1)} (firms ${byBuyerKind.firm.toFixed(1)} other ${byBuyerKind.other.toFixed(1)}) cleared ${book.clearedUnits.toFixed(1)}`);
    });
  }
  MARKET_REGION_IDS.forEach(origin => {
    const book = results[origin];
    book.lotsByBuyer.forEach((lots, buyerKey) => {
      if (lookup.byKey.get(buyerKey)) return; // a firm's lots: the buyer loop below
      const buyerRegion = buyerRegionOfKey(buyerKey, lookup);
      if (!buyerRegion) return;
      const buyer = partyOfKey(buyerKey, buyerRegion, lookup);
      const reason = buyer.kind === 'HOUSEHOLD' ? 'household purchase' : buyer.kind === 'GOVERNMENT' ? 'government procurement' : 'goods sold to the segment';
      lots.forEach(l => {
        const sellerParty = partyOfKey(l.sellerKey, origin, lookup);
        deliverGoods(sellerParty, buyer, subUnitId, l.units, book.clearedPriceLocal, reason);
        // §3.26b-i — a household's purchase of a dwelling is the dwelling changing hands: the
        // GOOD wire above is the build consumed on receipt (W4's sink); the DWELLING wire is the
        // asset that now has an owner, and (§3.13-BOOK g-i) the sector's register row takes the
        // lot at the cleared price in the same operation (W7).
        if (subUnitId === 'residential_construction' && buyer.kind === 'HOUSEHOLD') {
          moveDwellings(ctx.v2, sellerParty, buyer, buyerRegion, l.units, book.clearedPriceLocal, 'household purchase of a new dwelling');
        }
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
    if (govSpend > 0) reg.governmentProcurementSpentLocal = (reg.governmentProcurementSpentLocal ?? 0) + govSpend;
  });

  // --- 11. Contract formation, once per buyer per week across the books it bought in.
  formContracts(v2, subUnitId, results, supplyPlans, demandPlans, publishedPrice);

  if (S05_PROF) {
    const __t8 = performance.now();
    s05Phase.plans += __t1 - __t0; s05Phase.settle += __t2 - __t1; s05Phase.demand += __t3 - __t2;
    s05Phase.books += __t4 - __t3; s05Phase.trade += __t5 - __t4; s05Phase.sellers += __t6 - __t5;
    s05Phase.buyers += __t7 - __t6; s05Phase.tail += __t8 - __t7;
  }
  // --- 12. Publish the week's prices and metrics.
  // One pass over the plans instead of a filtered reduce per region — each plan belongs
  // to exactly one region, so every region's total receives the same additions in the same order.
  const demandUnitsByRegion = new Map<RegionId, number>();
  demandPlans.forEach(p => {
    demandUnitsByRegion.set(p.regionId, (demandUnitsByRegion.get(p.regionId) ?? 0) + p.demandUnits);
  });
  MARKET_REGION_IDS.forEach(regionId => {
    const demandState = ctx.updatedRegions[regionId].categoryDemand[subUnitId];
    if (!demandState) return;
    demandState.exWorksUnitPriceLocal = roundN(results[regionId].clearedPriceLocal, 1e2);
    demandState.unitPriceLocal = roundN(publishedPrice[regionId], 1e2);
    // The category's own price, one entry per week, so a firm's real output growth can
    // be deflated by the price of what IT sells over the SAME window (rule 8 twice over: the
    // aggregate CPI is a different population AND a 52-week period against a 12-week growth).
    // 13 entries covers the labour stage's 12-week window.
    // A year of prints: the longest horizon a buyer's expectation reads over.
    demandState.priceHistory = [...(demandState.priceHistory ?? []).slice(-51), demandState.unitPriceLocal];
    // The third price level, and the one a household actually faces. Ex-works is what the
    // producer received, `unitPriceLocal` is what it cost delivered — what a BUSINESS pays for its
    // inputs — and this is what it costs on a shelf, once the channel's cover is paid for. Three
    // real steps, each with a real payee; recipes and the price indices keep reading the landed
    // one, because that is genuinely what a firm pays.
    const reg05 = ctx.updatedRegions[regionId];
    demandState.shelfUnitPriceLocal = roundN(shelfPriceLocal(
      publishedPrice[regionId], subUnitId, reg05.zeroRates.tenor3M), 1e2);

    // The published totals include the contracts FORMED this week (step 11 pushed into the
    // same array this line used to read), so the chain is re-walked, not the settle survivors.
    let contractUnits = 0;
    for (const r of contractRows(v2, regionId, subUnitId)) contractUnits += CT.qtyPerWeek[r];
    demandState.totalUnitsSuppliedThisWeek = results[regionId].clearedUnits + contractUnits;
    demandState.totalUnitsDemandedThisWeek = (demandUnitsByRegion.get(regionId) ?? 0) + contractUnits;
    // CAT_TRACE=<subUnitId> — one category's weekly price and fill, per region (probe).
    if (process.env.CAT_TRACE === subUnitId) {
      console.log(`  [cat] ${subUnitId} ${regionId} price ${demandState.unitPriceLocal}`
        + ` (exw ${demandState.exWorksUnitPriceLocal}) supplied ${Math.round(demandState.totalUnitsSuppliedThisWeek)}`
        + ` / demanded ${Math.round(demandState.totalUnitsDemandedThisWeek)}`);
    }
    const landedPrice = demandState.unitPriceLocal ?? 0;
    const priorBase = demandState.baseUnitPriceLocal ?? 0;
    const basePrice = priorBase > 0 ? priorBase : landedPrice;
    demandState.baseUnitPriceLocal = basePrice;
    demandState.clearedInputPriceIndex = roundN(landedPrice / basePrice, 1e4);
  });
}

/** Which region a settlement key buys for. Company tickers are globally unique; the aggregate
 *  and private-segment keys carry their region in the key itself. */
function buyerRegionOfKey(key: string, lookup: GlobalFirmLookup): RegionId | undefined {
  const company = lookup.byTicker.get(asTicker(key));
  if (company) return company.region as RegionId;
  const parts = key.split(':');
  if (parts.length >= 2) {
    const candidate = parts[1] as RegionId;
    if (MARKET_REGION_IDS.includes(candidate)) return candidate;
  }
  return undefined;
}

function formContracts(
  v2: V2World,
  subUnitId: string,
  results: Record<RegionId, BookResult>,
  supplyPlans: SupplyPlan[],
  demandPlans: DemandPlan[],
  regionPublishedPrice: Record<RegionId, number>
): void {
  const inMoneyOfferKeys = new Set<string>();
  const inMoneyBidKeys = new Set<string>();
  MARKET_REGION_IDS.forEach(r => {
    results[r].inMoneyOfferKeys.forEach(k => inMoneyOfferKeys.add(k));
    results[r].inMoneyBidKeys.forEach(k => inMoneyBidKeys.add(k));
  });

  const candidateSuppliers = supplyPlans.filter(p => p.company && inMoneyOfferKeys.has(p.key));
  if (candidateSuppliers.length === 0) return;
  // RELIABILITY IS PRICED INTO SOURCING. Who a buyer contracts with was a uniform random
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
    const custRow = rowOf(v2, customerComp.id);
    const revLen = revHistLen(v2, custRow);
    let revVol = 0;
    if (revLen > 3) {
      let sumRev = 0;
      for (let i = 0; i < revLen; i++) sumRev += revHistAt(v2, custRow, i);
      const meanRev = sumRev / revLen;
      let varSum = 0;
      for (let i = 0; i < revLen; i++) varSum += Math.pow(revHistAt(v2, custRow, i) - meanRev, 2);
      revVol = Math.sqrt(varSum / revLen) / meanRev;
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
    // the S5 ledger exposed it immediately. The buyer locks a share of the weekly need
    // its own bid already expresses, capped by what this supplier actually offered.
    const baseContractUnits = Math.min(bidPlan.demandUnits * CONTRACTED_DEMAND_SHARE, supplierPlan.openOfferUnits);
    if (baseContractUnits <= 0.001) return;

    // A long contract is indexed to the price it was struck against; a short one is
    // not (0 = fixed-price). Which of the two a firm signs is decided here, by the term it wanted.
    formContractRow(
      v2, bidPlan.regionId, subUnitId,
      supplierPlan.key, bidPlan.key!,
      roundN(contractPrice, 1e2),
      roundN(baseContractUnits, 1e2),
      duration,
      duration >= CONTRACT_INDEXATION_MIN_WEEKS ? regionPublishedPrice[bidPlan.regionId] : 0
    );
  });
}



export function runUnitBiddingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const { byRegion: indexes, lookup } = buildMarketIndexes(ctx);

  MARKET_REGION_IDS.forEach(exporter => {
    MARKET_REGION_IDS.forEach(importer => { ctx.bilateralTradeWeeklyUSD[exporter][importer] = 0; });
  });
  ctx.shippedTonnesByLane = {};
  ctx.carrierFreightRevenue = {};
  // Who runs the channel in each region, weighted by the size of each firm's own
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
          ? a + Math.max(0, c.annualRevenue) * (line.revenueShare) : a), 0);
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
    fxPairIlliquidity: state.fxPairIlliquidity,
    quotedPairs: state.fxPairs.map(p => ({ base: p.base, quote: p.quote })),
    sellerIsShort: (subUnitId: string, origin: RegionId) => {
      const d = ctx.updatedRegions[origin].categoryDemand[subUnitId];
      return (Number(d?.totalUnitsDemandedThisWeek) || 0) > (Number(d?.totalUnitsSuppliedThisWeek) || 0);
    },
    buyerAnnualPdByTicker: new Map(),
  };

  // ENGINE V2 — the contract book lives on the columnar table; the weekly grouping
  // and reassembly passes are gone with the object array they served. Refs resolve to firms
  // once per unique ref per week.
  const refCompCache = new Map<number, Company | undefined>();
  const pidByComp = new Map<Company, number>();
  const updByComp = new Map<Company, import('./context').CompanyWeekUpdate>();
  const sellerPidByKey = new Map<string, number>();
  const carrierPidByTicker = new Map<EntityId, number>();
  const hhPid = new Map<RegionId, number>();
  const govPid = new Map<RegionId, number>();
  MARKET_REGION_IDS.forEach((r) => {
    hhPid.set(r, partyId({ kind: 'HOUSEHOLD', region: r }));
    govPid.set(r, partyId({ kind: 'GOVERNMENT', region: r }));
  });
  const wk: WeekResolution = {
    resolveRef: (refId) => {
      if (refCompCache.has(refId)) return refCompCache.get(refId);
      const comp = lookup.byKey.get(partyKeyOf(v2, refId));
      refCompCache.set(refId, comp);
      return comp;
    },
    pidOf: (comp) => {
      let pid = pidByComp.get(comp);
      if (pid === undefined) { pid = partyId(companyParty(comp)); pidByComp.set(comp, pid); }
      return pid;
    },
    updateOf: (comp) => {
      let u = updByComp.get(comp);
      if (u === undefined) {
        u = ctx.companyUpdates[comp.ticker];
        if (!u) { u = {}; ctx.companyUpdates[comp.ticker] = u; }
        updByComp.set(comp, u);
      }
      return u;
    },
    pidOfSeller: (key, origin) => {
      const k = origin + '|' + key;
      let v = sellerPidByKey.get(k);
      if (v === undefined) { v = partyId(partyOfKey(key, origin, lookup)); sellerPidByKey.set(k, v); }
      return v;
    },
    pidOfCarrier: (carrierId) => {
      let v = carrierPidByTicker.get(carrierId);
      if (v === undefined) { v = partyId(companyPartyOf(carrierId)); carrierPidByTicker.set(carrierId, v); }
      return v;
    },
    hhPid,
    govPid,
  };

  // Each market draws from its OWN stream, not from wherever the shared one has reached.
  // This does NOT make the loop parallel: measured that stage 05 stays order-dependent with
  // the scope in place, because the markets are coupled through each firm's single budget, spent
  // market by market. What the scope fixes is the separate defect it exposed — a market's bid
  // noise was a function of its position in a source file's declaration list.
  //
  // THE OPENING ORDER IS ECONOMIC, NOT A FILE'S. The coupling is real (a
  // firm has one wallet); what was arbitrary was that a source file's declaration order decided
  // which market drew on it first (: reversing it moved week-1 GDP −0.12% and killed seven
  // firms by week 2). Markets now open UPSTREAM FIRST — descending corporate (intermediate)
  // buyer share, the same direction the week already runs (inputs are priced before the goods
  // made from them; a downstream buyer bids knowing its input costs) — with the unit id as the
  // stable, named tiebreak. Deterministic, derived from the registry's own economics, and
  // invariant to how the source file happens to list its industries.
  Object.values(INDUSTRY_SUBUNITS).flat()
    .slice()
    .sort((a, b) => {
      const upA = 1 - (a.buyerMix.GOVERNMENT) - (a.buyerMix.HOUSEHOLD);
      const upB = 1 - (b.buyerMix.GOVERNMENT) - (b.buyerMix.HOUSEHOLD);
      if (upA !== upB) return upB - upA;
      return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
    })
    .forEach(subUnit => {
    // THE CRE MARKET IS GATED, ON MEASUREMENT (the pattern: a gate stands or
    // falls on what a run shows, and this one closed). The dealt landlords and the registry
    // entry stand; the LIVE market alone carried +4.8pts of USA
    // unemployment and +32 CPI points by week 30 — a service spiral: the market
    // opens ~26% short (the seed-level row — measured INVARIANT to the stated intensity,
    // both sides derive from one level), corporate premises demand is nearly inelastic, supply
    // is buildings and cannot answer inside a year, and the compounding price leaks through
    // the shared industry's wage and revenue signals into the housing categories households
    // DO buy. REOPENING CONDITION, named: the level-row decision re-sizes the market
    // (or corporate premises demand gets a real elasticity).
    // REOPENED. The level row closed at its owner and
    // the re-measurement no longer shows the spiral: 30 weeks live vs gated, USA CPI 159.2 vs
    // 158.9, goods fill 0.763 vs 0.754, u 29.6/28.8/24.6/20.8 vs 28.9/31.2/23.1/25.3. The
    // market is live; CRE_MARKET_LIVE=0 gates it off for an A/B.
    if (process.env.CRE_MARKET_LIVE === '0' && subUnit.unitId === 'commercial_rental_services') return;
    const savedStream = beginEntityScope(subUnit.unitId, ctx.nextWeek);
    runSubUnitMarkets(
      v2, ctx, subUnit.unitId,
      subUnit.buyerMix.GOVERNMENT, subUnit.buyerMix.HOUSEHOLD,
      indexes, lookup, wk, sourcing
    );
    endEntityScope(savedStream);
  });

  // Week end: emptied buckets leave each region's bucket order, exactly as rebuilding the
  // group map from the reassembled array used to drop them.
  endOfWeekCompact(v2);

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
      shares.forEach((share, carrierId) => {
        if (!lookup.byId.get(carrierId)) return;
        ctx.carrierTonneNm[carrierId] = (ctx.carrierTonneNm[carrierId] ?? 0)
          + tonnes * share * laneDistanceNm(origin, lane.split('>')[1] as RegionId);
      });
    });
  }

  // Everything dispatched this week joins what is already on the water — appended in place, the
  // same order the spread produced, without copying tens of thousands of live entries weekly.
  for (const sh of ctx.shipmentsDispatched) state.goodsInTransit.push(sh);
  bookTradeInvoices(ctx.v2, ctx.tradeInvoicesBooked); // §3.13-BOOK d4b: the contract ledger's door

  // DER/rule 4: ONE realised-vol estimator (domain/volatility.ts). The local copy that stood here
  // carried its own 0.16 fallback, so a market with too little history was reported as being at
  // exactly its own baseline — which reads as "no excess vol" whether that is true or unknown.
  // Unknown is now unknown: no history, no component.
  if (S05_PROF) {
    const P = s05Phase;
    console.log(`[s05] plans ${P.plans.toFixed(0)} settle ${P.settle.toFixed(0)} (rows ${P.settleRows} pre ${P.settlePre.toFixed(0)} core ${P.settleCore.toFixed(0)} eff ${P.settleEff.toFixed(0)}) demand ${P.demand.toFixed(0)} books ${P.books.toFixed(0)} trade ${P.trade.toFixed(0)} sellers ${P.sellers.toFixed(0)} buyers ${P.buyers.toFixed(0)} tail+publish ${P.tail.toFixed(0)}`);
    if (S05B_PROF) {
      const B = s05Buyers;
      console.log(`[s05b] lots ${B.lots} pay ${B.pay.toFixed(0)} invoice+fx ${B.invoice.toFixed(0)} aggregate-payers ${B.planRest.toFixed(0)}`);
      B.lots = 0; B.pay = 0; B.invoice = 0; B.planRest = 0;
    }
    P.plans = 0; P.settle = 0; P.settleCore = 0; P.settlePre = 0; P.settleEff = 0; P.settleRows = 0; P.demand = 0; P.books = 0; P.trade = 0; P.sellers = 0; P.buyers = 0; P.tail = 0;
  }
  const realizedIndexVol = realizedAnnualVol(state.compositeIndices.usaComposite.historical, 13);
  const baselineVol = 0.16;
  const usaRegime = ctx.updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  ctx.marketVolComponent = (realizedIndexVol === undefined
    ? 0
    : Math.max(0, realizedIndexVol - baselineVol) * 0.5) + regimeVolPremium;
}
