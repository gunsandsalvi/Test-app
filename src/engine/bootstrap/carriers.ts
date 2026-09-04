/**
 * The logistics sector, which this economy did not have (XB3a-2).
 *
 * Goods teleported: a purchase settled the week it cleared, from any seller, over no distance, at
 * no cost. So there was no freight bill on any buyer's books and no revenue on anybody's — an
 * entire sector, several percent of real output, simply absent. Carriers are not carved out of an
 * existing aggregate the way HC's private firms were, because there was no aggregate
 * carrying them: this adds a real sector that was missing, and the cost it puts on buyers is the
 * mirror of the revenue it puts on carriers.
 *
 * **The fleet is seeded at what the seed economy actually has to move**, by running the sourcing
 * intent once against the bootstrap prices and sizing capacity to the tonnage it books. That is
 * rule in its strict form — seed by calling the engine's own code — and it means the
 * freight market opens clearing somewhere a week of this simulation would actually produce,
 * rather than on a rate spike or collapse that is an artifact of a guessed fleet. It is a
 * starting condition and not a target: from week 1 capacity is an outcome of real ordering and
 * scrapping.
 */

import { Company, CreditRating, Region, RegionId } from '../../types';
import { stashSeedIssuedShares } from '../ledger/instrument-ledger';
import { stashOpeningCash } from '../ledger/accounts';
import { stashSeedRevenueHistory, stashSeedRing } from '../../engine2/world';
import { INDUSTRY_SUBUNITS } from '../../domain/industry';
import { laneDistanceNm } from '../../domain/geography';
import {
  CarrierFleet, FreightAsset, FREIGHT_ASSET_SPEC, freightModeForLane, laneKey, parseLaneKey,
  weeklyCapacityTonnes,
} from '../../domain/carrier';
import { carryRatesByRegion, computeSourcingIntent, LaneBooking, SOURCING_REGION_IDS } from '../simulation/stages/sourcing-intent';
import { FxToUsd } from '../../domain/currency';
import { EFFECTIVE_TAX_RATE } from '../macro/initialization';
import { determineCreditRating } from '../simulation/credit';
import { generateDebtTranches } from '../companyGenerator';
import { crewAnnualWageLocal, fuelPriceUsdPerTonne, runFreightClearing } from '../simulation/stages/freight-clearing';
import { RATING_OAS_SPREADS } from '../pricing';
import { fairValuePerShare, REPRESENTATIVE_HOLDER_REQUIRED_RETURN } from '../equity-valuation';
import { COVENANT_LEVERAGE_CEILING } from '../simulation/stages/corporate-financing';
import { generateUniqueTicker, generateUniqueName } from './firms';
import { carrierEntityId } from '../../domain/entity-keys';
import type { Ticker } from '../../domain/ids';

/**
 * How many carrier firms each region gets. Shipping is a concentrated industry everywhere — a
 * handful of operators per country run most of the tonnage — and the number matters only because
 * it decides how granular a failure is: one carrier going under should hurt a lane, not end it.
 */
const CARRIERS_PER_REGION = 3;

/**
 * What a lender advances against a hull. Ship finance is asset-based and this is the standard
 * advance rate against a vessel — a real lending primitive, of the same kind as the haircuts and
 * regulatory ratios rule 2 allows.
 */
const SHIP_FINANCE_LOAN_TO_VALUE = 0.55;

/** What one tonne costs to move on a lane using the standard equipment for it, before any
 *  carrier exists. The floor the intent is formed against on a lane that has never cleared. */
export function specMarginalRatePerTonneLaneMoney(
  from: RegionId,
  to: RegionId,
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>
): number {
  const distanceNm = laneDistanceNm(from, to);
  if (!(distanceNm > 0)) return 0;
  const mode = freightModeForLane(from, to);
  const spec = FREIGHT_ASSET_SPEC[mode];
  const fuelUsdPerTonne = fuelPriceUsdPerTonne(regions[from], unitMassTonnes);
  const wage = crewAnnualWageLocal(regions[from], from);

  const fuelPerTonneNm = (spec.fuelTonnesPerNm * fuelUsdPerTonne) / spec.capacityTonnes;
  const roundTripWeeks = (2 * distanceNm) / (spec.speedKnots * 24 * 7);
  const weeklyTonnes = roundTripWeeks > 0 ? spec.capacityTonnes / roundTripWeeks : spec.capacityTonnes;
  const weeklyTonneNm = weeklyTonnes * distanceNm;
  const crewPerTonneNm = weeklyTonneNm > 0 ? ((spec.crewCount * wage) / 52) / weeklyTonneNm : 0;
  return (fuelPerTonneNm + crewPerTonneNm) * distanceNm;
}

export function specMarginalRatesByLane(
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>
): Record<string, number> {
  const rates: Record<string, number> = {};
  SOURCING_REGION_IDS.forEach(from => {
    SOURCING_REGION_IDS.forEach(to => {
      rates[laneKey(from, to)] = specMarginalRatePerTonneLaneMoney(from, to, regions, unitMassTonnes);
    });
  });
  return rates;
}

/**
 * The tonnage the seed economy needs carried on each lane, from the same intent pass the weekly
 * step runs. Freight is priced at what it costs a carrier to sail, because no rate has cleared
 * yet and that is the honest expectation before one has.
 */
export function seedFreightDemand(
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>,
  fxToUsd: FxToUsd
): { tonnesByLane: Record<string, number>; bookings: LaneBooking[] } {
  const marginal = specMarginalRatesByLane(regions, unitMassTonnes);
  const { bookings } = computeSourcingIntent({
    regions,
    subUnitIds: Object.values(INDUSTRY_SUBUNITS).flat().map(su => su.unitId),
    unitMassTonnes,
    freightRatePerTonneLaneMoneyByLane: {},
    marginalRatePerTonneLaneMoneyByLane: marginal,
    fxToUsd,
    carryCostRatePerWeekByRegion: carryRatesByRegion(regions),
  });
  const tonnesByLane: Record<string, number> = {};
  bookings.forEach(b => {
    const key = laneKey(b.from, b.to);
    tonnesByLane[key] = (tonnesByLane[key] ?? 0) + b.tonnes;
  });
  return { tonnesByLane, bookings };
}

/** The equipment each lane needs to carry that tonnage, as whole hulls. */
function buildFleetForLanes(tonnesByLane: Record<string, number>, week: number): FreightAsset[] {
  const assets: FreightAsset[] = [];
  let serial = 0;
  Object.keys(tonnesByLane).forEach(key => {
    const tonnes = tonnesByLane[key];
    if (!(tonnes > 0)) return;
    const { from, to } = parseLaneKey(key);
    const distanceNm = laneDistanceNm(from, to);
    const mode = freightModeForLane(from, to);
    const spec = FREIGHT_ASSET_SPEC[mode];
    const prototype: FreightAsset = {
      id: 'proto', mode, capacityTonnes: spec.capacityTonnes, speedKnots: spec.speedKnots,
      fuelTonnesPerNm: spec.fuelTonnesPerNm, crewCount: spec.crewCount,
      laneFrom: from, laneTo: to, builtWeek: week,
    };
    const perAsset = weeklyCapacityTonnes(prototype, distanceNm);
    if (!(perAsset > 0)) return;
    // Whole hulls, rounded UP: you cannot charter two thirds of a ship, and the rounding is why
    // a thin lane runs structurally slack while a dense one runs tight.
    const count = Math.ceil(tonnes / perAsset);
    for (let i = 0; i < count; i++) {
      assets.push({ ...prototype, id: `${key}_${serial++}` });
    }
  });
  return assets;
}

/**
 * The carriers, with the fleet split among them.
 *
 * Domestic haulage is served by firms domiciled in that region — there is no foreign trucking
 * fleet on another country's roads. Ocean lanes are served by everyone, which is what shipping
 * actually looks like.
 */
export function generateCarriers(
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>,
  fxToUsd: FxToUsd,
  existingTickers: Set<Ticker>,
  existingNames: Set<string>
): Company[] {
  const { tonnesByLane, bookings } = seedFreightDemand(regions, unitMassTonnes, fxToUsd);
  const allAssets = buildFleetForLanes(tonnesByLane, 0);

  const carriers: { region: RegionId; assets: FreightAsset[] }[] = [];
  SOURCING_REGION_IDS.forEach(region => {
    for (let i = 0; i < CARRIERS_PER_REGION; i++) carriers.push({ region, assets: [] });
  });

  // Deal the hulls out. A domestic asset can only go to a carrier of that region; an ocean asset
  // to anyone, round-robin so no operator is handed a monopoly on a route by construction.
  let oceanCursor = 0;
  const domesticCursor: Record<string, number> = {};
  allAssets.forEach(asset => {
    if (asset.laneFrom === asset.laneTo) {
      const pool = carriers.filter(c => c.region === asset.laneFrom);
      if (pool.length === 0) return;
      const idx = (domesticCursor[asset.laneFrom] ?? 0) % pool.length;
      domesticCursor[asset.laneFrom] = idx + 1;
      pool[idx].assets.push(asset);
    } else {
      carriers[oceanCursor % carriers.length].assets.push(asset);
      oceanCursor++;
    }
  });

  const staffed = carriers.filter(c => c.assets.length > 0);

  // What the fleet actually EARNS has to come from the market, not from an assumption. Priced at
  // marginal cost a carrier books exactly zero EBITDA by construction — it would be seeded
  // insolvent, and every one of them would default in the first weeks for a reason that is pure
  // arithmetic. So the seed runs the real freight auction once against the same bookings the
  // fleet was sized from, and the carriers' books are built on the rate that clears.
  const provisional = staffed.map((c, i) => ({
    ticker: `SEED_CARRIER_${i}`,
    region: c.region,
    carrierFleet: { assets: c.assets, fuelInventoryTonnes: 0, lastWeekTonneNm: 0, lastWeekFreightRevenueLocal: 0 },
  })) as unknown as Company[];
  const clearing = runFreightClearing({ carriers: provisional, regions, unitMassTonnes, bookings, fxToUsd });

  return staffed.map((c, idx) => buildCarrierCompany(
    c.region, c.assets, idx, regions, unitMassTonnes,
    clearing.carrierRevenueLocal.get(`SEED_CARRIER_${idx}`) ?? 0,
    clearing.carrierTonnesCarried.get(`SEED_CARRIER_${idx}`) ?? 0,
    existingTickers, existingNames
  ));
}

/**
 * One carrier's books, derived from the fleet it owns rather than asserted.
 *
 * Revenue is what its capacity earns at the rate a carrier will accept — its own marginal cost —
 * which is the conservative end of what the market will actually clear at, so a carrier is never
 * seeded on an optimistic rate it has not yet won. Costs are the real fuel and crew that revenue
 * required. PP&E is what the hulls actually cost. Debt follows from the cash flow, at the same
 * coverage-and-leverage logic every other firm in this model is rated on: shipping is a
 * capital-intensive, cyclically-levered business, and here that is an arithmetic consequence of
 * owning thirty-five-million-dollar assets that earn by the week.
 */
function buildCarrierCompany(
  region: RegionId,
  assets: FreightAsset[],
  idx: number,
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>,
  clearedWeeklyRevenueLocal: number,
  clearedWeeklyTonnesCarried: number,
  existingTickers: Set<Ticker>,
  existingNames: Set<string>
): Company {
  const ticker = generateUniqueTicker(existingTickers);
  const name = generateUniqueName(`${region} Logistics`, 'Industrials', existingNames);

  const fuelUsdPerTonne = fuelPriceUsdPerTonne(regions[region], unitMassTonnes);
  const wage = crewAnnualWageLocal(regions[region], region);

  const annualRevenue = clearedWeeklyRevenueLocal * 52;
  let fullSailAnnualFuelCost = 0;
  let fleetWeeklyTonnes = 0;
  let grossPPELocal = 0;
  let crewCount = 0;
  assets.forEach(asset => {
    const distanceNm = laneDistanceNm(asset.laneFrom, asset.laneTo);
    const weeklyTonnes = weeklyCapacityTonnes(asset, distanceNm);
    const spec = FREIGHT_ASSET_SPEC[asset.mode];
    grossPPELocal += spec.capitalCostLocal;
    crewCount += asset.crewCount;
    fleetWeeklyTonnes += weeklyTonnes;
    // Voyages a week AT FULL SAIL, and what each burns — scaled to real utilization below.
    const voyagesPerWeek = asset.capacityTonnes > 0 ? weeklyTonnes / asset.capacityTonnes : 0;
    const weeklyFuelTonnes = voyagesPerWeek * asset.fuelTonnesPerNm * distanceNm;
    fullSailAnnualFuelCost += weeklyFuelTonnes * fuelUsdPerTonne * 52;
  });
  // /item 14 — FUEL BURNS AT THE UTILIZATION THE SEED AUCTION ACTUALLY CLEARED, not at
  // full sail. The weekly model already burns by real tonne-miles moved (carrier.ts profile);
  // the seed costed the fleet as if every hull sailed full while its revenue was the cleared
  // (partial) fill — so any carrier the round-robin dealt slack lanes seeded LOSSMAKING by a
  // unit error, opened with `max(0, ebitda)×0.6 = 0` cash, and was dead by week 2. Measured:
  // six of twelve carriers died exactly there, every run, before any market event.
  const seedUtilization = fleetWeeklyTonnes > 0
    ? Math.min(1, clearedWeeklyTonnesCarried / fleetWeeklyTonnes)
    : 0;
  const annualFuelCost = fullSailAnnualFuelCost * seedUtilization;
  const annualCrewCost = crewCount * wage;
  if (process.env.CARRIER_SEED === '1') {
    console.log(`  [car-seed] ${region} ${ticker} hulls ${assets.length} rev ${(annualRevenue / 1e6).toFixed(1)}M`
      + ` fuel ${((fullSailAnnualFuelCost * seedUtilization) / 1e6).toFixed(1)}M crew ${(annualCrewCost / 1e6).toFixed(1)}M`
      + ` (crewCount ${crewCount} wage ${(wage / 1e3).toFixed(0)}k) util ${seedUtilization.toFixed(2)}`
      + ` lanes ${[...new Set(assets.map((a) => `${a.laneFrom}>${a.laneTo}`))].join(',')}`);
  }
  const employeeCount = Math.max(1, crewCount);

  const ebitda = annualRevenue - annualFuelCost - annualCrewCost;
  const usefulLife = assets.length > 0 ? FREIGHT_ASSET_SPEC[assets[0].mode].usefulLifeYears : 20;
  const depreciation = grossPPELocal / usefulLife;
  const ebit = ebitda - depreciation;

  const policyRate = regions[region].policyRate ?? 0.045;
  // A ship is collateral, so the fleet is financed the way real tonnage is: against the asset, at
  // the loan-to-value a lender will advance against a hull. But a lender lends against the CASH
  // FLOW too, and whichever binds is the constraint — so the fleet's debt is also capped by the
  // covenant ceiling this model already applies to every other borrower (see
  // corporate-financing.ts). Without that second leg the seed produced carriers at 21x leverage,
  // which is not a shipping cycle, it is a cold start that defaults in the first weeks.
  const assetBackedLocal = grossPPELocal * SHIP_FINANCE_LOAN_TO_VALUE;
  const cashFlowBackedLocal = Math.max(0, ebitda) * COVENANT_LEVERAGE_CEILING.B;
  const debtBase = Math.round(Math.min(assetBackedLocal, cashFlowBackedLocal));
  const annualInterest = debtBase * (policyRate + 0.02);
  const coverage = annualInterest > 0 ? ebit / annualInterest : 99;
  const leverage = ebitda > 0 ? debtBase / ebitda : 99;
  // ONE OWNER: the rating ladder lives in simulation/credit.ts — this
  // file carried its own three-cutoff copy, so a carrier opened rated on different arithmetic
  // than the market re-rates it with a week later.
  const rating: CreditRating = determineCreditRating(leverage, coverage, { ebitdaLocal: ebitda });

  const fleet: CarrierFleet = {
    assets,
    fuelInventoryTonnes: 0,
    lastWeekTonneNm: 0,
    lastWeekFreightRevenueLocal: 0,
  };

  // Carriers are LISTED. The shipping majors are public companies in reality, and it is also what
  // puts them inside every mechanism the model already has — the weekly P&L pass, the rating
  // ladder, equity clearing, default — instead of needing a special case in each. Seeded through
  // the SAME valuation function the market itself prices with, never a multiple.
  const sharesOutstanding = Math.max(1, Math.round(grossPPELocal / 1000));
  const bookEquityLocal = grossPPELocal * (1 - 0.35) - debtBase + Math.max(0, ebitda) * 0.6;
  const stockPrice = Number(fairValuePerShare({
    annualEarningsLocal: Math.round((ebit - annualInterest) * (1 - EFFECTIVE_TAX_RATE)),
    sharesOutstanding,
    bookEquityLocal,
    netInvestmentRate: 0,
    riskFreeRate: policyRate,
    beta: 1.0,
    holderRequiredReturn: REPRESENTATIVE_HOLDER_REQUIRED_RETURN,
  }).toFixed(2));

  const __c = {
    id: carrierEntityId(region, ticker),
    ticker,
    name,
    region,
    sector: 'Industrials',
    financialStatementProfile: 'CARRIER',
    carrierFleet: fleet,
    listingStatus: 'PUBLIC',
    ownership: { founderPct: 0 },
    earningsWeekModulo: (idx % 13) + 1,
    baselineAnnualRevenue: annualRevenue, annualRevenue,
    previousEmployeeCount: employeeCount, employeeCount, baselineEmployeeCount: employeeCount,
    ebitda,
    baselineEbitdaMargin: annualRevenue > 0 ? ebitda / annualRevenue : 0,
    ebit,
    netIncome: Math.round((ebit - annualInterest) * (1 - EFFECTIVE_TAX_RATE)),
    eps: Number(((ebit - annualInterest) * (1 - EFFECTIVE_TAX_RATE) / sharesOutstanding).toFixed(2)),
    stockPrice, marketCap: stockPrice * sharesOutstanding,
    forwardPE: 0,
    currentLiabilities: Math.round(debtBase * 0.2),
    // A FLEET IS FINANCED, AND THE LADDER IS WHERE ITS DEBT LIVES. `totalDebt` stopped being a
    // field when the ladder became authoritative — the engine's lane is a read of the rows — so
    // a carrier seeded with `totalDebt: debtBase` and an EMPTY ladder opened with no debt at
    // all, while its seeded interest, coverage, leverage, rating, net income, eps and share
    // price were every one of them struck against that debt, and no lender held a dollar of it.
    // Its ship finance is now a real ladder, built by the same generator every other seeded
    // firm's is, so the rows exist and the metrics above describe them.
    debtTranches: generateDebtTranches(ticker, debtBase, rating, policyRate, idx),
    capex: Math.round(depreciation),
    maintenanceCapex: Math.round(depreciation),
    growthCapex: 0,
    baselineGrowthCapexToRevenueRatio: 0,
    maintenanceShortfallStreak: 0,
    grossPPELocal,
    accumulatedDepreciationLocal: Math.round(grossPPELocal * 0.35),
    executionQuality: 1.0,
    occupationMixDrift: {},
    creditRating: rating,
    isDefaulted: false,
    cdsSpreadBps: RATING_OAS_SPREADS[rating].baseBps,
    seniorBondYield: 0,
    dividendYield: 0, baselineDividendYield: 0,
    beta: 1.0,
    recoveryRate: 0.40, baselineRecoveryRate: 0.40,
    // A carrier sells freight, not units into the goods auction. Its purchases — fuel and new
    // hulls — are real bids there; its output is not.
    productLines: [],
    leverage,
    interestCoverage: coverage,
    historicalFundamentals: [],
    leveragedLoan: undefined,
    institutionalRole: null,
    inputSupplyConstraintFactor: 1.0,
    outputInventoryBySubUnit: {},
    recentFulfillmentEMA: 1.0,
    _carrierIndex: idx,
  } as unknown as Company;
  stashSeedRevenueHistory(__c, [annualRevenue]); // §4.C II.5 — lands on the ring at drain
  stashSeedRing(__c, 'rating', [rating]);
  stashSeedRing(__c, 'price', [stockPrice]);
  stashOpeningCash(__c, Math.round(Math.max(0, ebitda) * 0.6)); // §5-WIRES A3.1
  stashSeedIssuedShares(__c, sharesOutstanding); // §3.13-BOOK dIV
  return __c;
}
