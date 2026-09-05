
import { createSeedCategoryDemandState, CAPEX_SUPPLIER_WEIGHTS } from '../../domain/market-microstructure';
import type { EntityId } from '../../domain/ids';
import { companyParty, bankPartyOf } from '../../domain/party';
import { stashSeedRevenueHistory, drainSeedRevenueHistories, drainSeedRings, peekSeedRing, typeRefOf } from '../../engine2/world';
import { dateOfWeek } from '../../domain/calendar';
import { publicComparableEvMultiple } from './stages/pe-lifecycle';
import { INDEX_DEFINITIONS } from '../../domain/indexes';
import { PREMIUM_TO_SURPLUS_RATIO, INSTITUTIONAL_CAPITAL_RATIO } from '../../domain/institutions';
import { ETF_EXPENSE_RATIO_ANNUAL } from '../../domain/etf';
import { migrateSmeDebtAtSeed, migrateHouseholdDebtAtSeed, applyBankFundingSplit, seedLoanBookShareLocal } from './stages/bank-lending';
import { loanBooksOf } from '../../domain/banking';
import { leverageHeadroomLocal } from '../macro/banking';
import { EFFECTIVE_TAX_RATE } from '../macro/initialization';
import { facilityBookOf } from '../../engine2/tranches';

/**
 * OWN6 — the institutional sector's OPENING BOOK, and the one thing it is not.
 *
 * `OWNERSHIP_SHARES` is gone: ownership is measured off the real books each week (OWN1) and
 * nothing weekly reads a share to decide anything any more. What is left is a cold-start
 * problem the deletion does not solve. The weekly shape is "an institution holds what it
 * bought"; at week 0 there is no purchase history, so the opening register has to be placed,
 * and the size of the institutional sector is what decides how much of it institutions get.
 *
 * That size is CIRCULAR in the seed today: an entity's `totalAssetsLocal` is
 * `institutionalMarketShare x the sector aggregate`, and the sector aggregate is these three
 * numbers times the market. Breaking it means anchoring an institution on what it OWES — the
 * pension and insurance claims households hold against it — and `beneficiaryLiabilityLocal` is
 * currently derived from assets, so that anchor does not exist yet.
 *
 * So this stays, named for exactly what it is: a SEED, read once at week 0, never weekly, with
 * its closing slice recorded in §6. It is not an ownership share and nothing may treat it as
 * one — `equityOwnership` and its siblings open at zero and are measured at the end of week 1.
 *
 * THE SOVEREIGN SLICE IS GONE TOO, and for the reason the bank pass below already states in its
 * own comment: banks are the residual holder of what the central bank and the institutions do not
 * take, and their leverage headroom caps them well short of it. Measured at week 0, the named
 * books held 79.6% of every region's sovereign stock and 20.4% — 137B in the USA alone — belonged
 * to NOBODY. That residual is §7.124's, it is what OWN7 had to carve back out of the float so the
 * ledger stopped minting claims, and it is what made a maturing tranche pay 55B to the UNMODELED
 * boundary under `sovereign redemption (unmodeled holders)`. A bond nobody holds is not a bond.
 * The institutions take whatever the central bank and the capital-constrained banks leave, because
 * in this model they ARE the household and foreign-official holders — pensions and insurers is
 * how those sectors own government paper. The share is computed after the bank pass, from what is
 * actually left, rather than stated in front of it.
 *
 * THE CREDIT SLICE IS GONE, and it was never a cold-start problem. `corpBond: 0.45` sized the
 * institutions' opening credit book at 45% of a debt stock that counts every tranche — floating,
 * bank facilities, commercial paper, public and private alike — and then placed the whole of it
 * on the PUBLIC FIXED paper only. Measured at week 0: institutions opened holding 132% of the
 * USA corporate bond stock, 127% of the EUR, 126% of the UK, 120% of the JPN. The register was
 * minting claims before the first week ran, and the desks then hid it by going short into the
 * boundary (measured -9.3B in two weeks) rather than the ledger check catching it.
 *
 * A bond book has no unnamed holder to leave room for: its participants are the institutions and
 * the dealer desks, and the desks open flat. So the institutions open with the WHOLE tradable
 * stock — exactly what the HC2 private-tier pass below already does, and exactly the instrument
 * 07b and 07d clear (fixed ex-commercial-paper; floating ex-bank-facility). Equity and
 * sovereigns keep a slice because those books DO have holders this model does not name yet —
 * founders, households, foreign official — and OWN7's float rule is what keeps their paper out
 * of the auction rather than a share pretending to own it.
 */
const INSTITUTIONAL_OPENING_BOOK_SHARE = { equity: 0.42 };

import { isActiveCompany, isPubliclyListed, managedEntityIdsOf, banksOf } from '../../domain/company';
import { restingVacancies } from '../../domain/region-macro';
import { closeSeedMoney, seedOpeningAccruals, seedOpeningCreditPrices } from '../bootstrap/close-seed';
import { centralBankAssetsLocal, CENTRAL_BANK_SOVEREIGN_SHARE } from '../../domain/central-bank';
import { reconcileEmploymentView } from './stages/labor-market';
import { weeklyWageBillLocal } from '../bootstrap/labor-and-wages';
import { SECTOR_OCCUPATION_MIX } from '../../domain/region-macro';
import { EQUITY_RISK_PREMIUM } from '../equity-valuation';
import { mandateAllocator, assignHouseBanks } from '../../domain/primary-market';
import { RegionId, Region, Portfolio, OccupationType, Company, COMMODITY_CATEGORY_LINKAGE, BASE_COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, ItemizedHolding, INDUSTRY_SUBUNITS, DebtTranche } from '../../types';
import { dealersFromBanks } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies, generatePrivateCompanies, dealProductLinesAndHeadcount, normalizeProducingSectorRevenue } from '../companyGenerator';
import { openAccount, openingCashOf, stashOpeningCash, stashSeedHouseholdLine, seedGovLadderOf, seedCentralBankBookOf, stashSeedBankBook, seedBankBookOf, seedBankBookLocalOf, openSectorRow } from '../ledger/accounts';
import { newWireJournal, setActiveWireJournal, setActiveWireWorld, hasActiveWireJournal, summarizeWires } from '../ledger/wire';
import { wireWorldOf } from '../ledger/wire-world';
import { registerCompanyEquity, registerFundShares, seedIssuedSharesOf } from '../ledger/instrument-ledger';
import { stashSeedCommitments, drainSeedCommitments } from '../ledger/contract-ledger';
import { issuedSharesOf } from '../../engine2/instruments';
import { seedLadder } from '../ledger/tranche-ledger';
import { seedBook, issuerOfHoldingRow } from '../ledger/holdings-ledger';
import { buildEntityIndex } from '../ledger/entity-index';
import type { PartyRef } from '../ledger/party';

import { reasonText } from './stages/settlement';
import { ensureV2 } from '../../engine2/world';
import { generatePrivateFirmSeeds } from '../bootstrap/private-firms';
import { INDUSTRY_REGISTRY, smePoolEmployment, industryOfSubUnit, seedDemandFromCIG } from '../../domain/industry-registry';
import { getRegionProductivityPerCapitaLocal, remainingLifeExpectancyYears, RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS } from '../bootstrap/population';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand, attributeItemizedHoldings, distributeRealTargetByWeight } from './stages/shared-helpers';
import { unitMassTonnes } from '../../domain/goods-physical';
import { defect } from '../../domain/defect';
import { generateCarriers, seedFreightDemand, specMarginalRatesByLane } from '../bootstrap/carriers';
import { runFreightClearing } from './stages/freight-clearing';
import { getFxToUsd, publishFxRatesNow } from './stages/06-fx-and-trade';
import { convertLocal, localToUsd } from '../../domain/currency';
import { laneTransitWeeks } from '../../domain/carrier';
import { laneDistanceNm, currencyOf, REGION_IDS } from '../../domain/geography';
import { bookHeadOf, instrumentIdAt } from '../../engine2/holdings';
import { InTransitShipment } from './stages/goods-arrival';
import { buildCpiBasket, CPI_BASE_LEVEL } from './stages/price-index';
import { burnInMode, burnIn } from './burn-in';
import { allocationTargetFor } from '../../domain/institution-profiles';
import { ensureManagements } from './stages/management-review';
import { advanceWeeklyStep } from './core';
import { refreshRegionalHoldingsView, measuredOwnershipAllRegions, ownershipSharesFromRegister } from './stages/holdings-view';
import { setSimulationSeed, getRngState, setRngState, DEFAULT_SIMULATION_SEED } from '../rng';
import { deriveSubUnitUnitPrice } from '../bootstrap/category-demand';
import { getBaseAnnualWageLocal } from '../bootstrap/labor-and-wages';
import { decomposeGovernmentSpending, governmentObligationsWeeklyLocal } from '../../domain/government';
import { marketCapOf, totalDebtOf } from '../../domain/company';
import { computeExpenditureGdpLocal, GOV_PROCUREMENT_SHARE_OF_SPENDING, computeHouseholdDisposableIncomeLocal, UNEMPLOYMENT_REPLACEMENT_RATE } from '../bootstrap/national-accounts';
import { seedInstitutionTotalAssetsLocal } from '../../domain/institutions';
import { equityInstrumentId, peFundInterestId, equityIssuerId } from '../../domain/instrument-keys';
import type { InstrumentId } from '../../domain/ids';
import { governmentIssuer, indexFundEntityId, moneyFundEntityId, peFundEntityId } from '../../domain/entity-keys';
import type { Ticker } from '../../domain/ids';
import { asTicker, asInstrumentId } from '../../domain/ids';

/**
 * Build a world. The same seed always builds the same world and, stepped the same number of
 * weeks, reaches the same state — which is what makes any before/after measurement of this
 * simulation mean anything (see engine/rng.ts).
 */
/**
 * One unit's physical mass, per sub-unit, fixed for the life of the world (XB3a-1).
 *
 * A "unit" here is an abstract bundle worth roughly the same across every good, so what it
 * physically weighs is that bundle's value divided by the material's own value density. The
 * bundle value is averaged across the four regions because mass is a property of the good, not
 * of where it happens to be priced.
 */
function seedUnitMassTonnes(regions: Record<RegionId, Region>): Record<string, number> {
  const regionIds = Object.keys(regions) as RegionId[];
  const masses: Record<string, number> = {};
  Object.values(INDUSTRY_SUBUNITS).flat().forEach((subUnit) => {
    const prices = regionIds
      .map((r) => regions[r].categoryDemand[subUnit.unitId]?.unitPriceLocal)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    // §7.241: a silent skip here left the sub-unit WEIGHTLESS — every reader defaults a missing
    // mass to zero, so its goods would ship with free freight forever (armed for DYN/PROD's
    // first runtime product line). A registry sub-unit no region prices at seed is a seed
    // defect, and it fails HERE, at the write site, per GUARD.
    if (prices.length === 0) {
      return defect(`no seeded price for sub-unit '${subUnit.unitId}' — its unit mass cannot derive`);
    }
    const meanPriceLocal = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    masses[subUnit.unitId] = unitMassTonnes(subUnit.unitId, meanPriceLocal);
  });
  return masses;
}

/**
 * SUPPLY/CHAIN — THE SEED'S DEMAND VECTOR, AND THE FIXED POINT IT CLOSES.
 *
 * Extracted from `createInitialGameState` so it can be run more than once. It is the
 * AUTHORITATIVE copy of the C + I + G identity (§7.120's third): it runs after the firms and the
 * government exist, so its `G` is the real procurement budget and its `I` the firms' own capex,
 * where the placeholder in `macro/initialization.ts` could only use GDP shares.
 *
 * **Why it has to be callable twice.** A firm's revenue is derived from its primary category's
 * DEMAND SEED, and its capex from its revenue — while `I`, which sizes the capital-goods half of
 * that demand seed, is the sum of exactly those capexes. Firm size and investment demand each
 * determine the other, and the seed resolved it by simply using the placeholder for one side:
 * the capital-goods industries were built for a GDP-share investment number and then asked to
 * supply the real one. Measured, that is 1.29x more capex bid than built for, four of five
 * capital-goods categories in permanent shortage at 65-174% over base price (§7.168, §7.178),
 * plant shrinking because nobody can make the machines, and — through the cost of capital the
 * labour market sheds against — a share of the ~29% unemployment that has been blocking
 * unrelated work (§7.179).
 *
 * `solveSeedInvestmentFixedPoint` below iterates the two against each other until they agree.
 */
function seedRegionCategoryDemand(
  reg: Region,
  regionId: RegionId,
  companies: Company[]
): void {
    const hs = reg.householdState;
    const C = reg.estimatedHouseholdIncomeLocal * (1 - hs.savingsRate);
    // §7.4: the seed uses the SAME procurement owner the weekly stage does, so week 0's
    // government demand and week 1's are the same shape.
    const G = decomposeGovernmentSpending(
      reg.governmentSpendingWeeklyLocal, reg.governmentInterestWeeklyLocal ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyLocal ?? 0
    ).procurementBudgetLocal * 52;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;
    const I = corpBase;

    const regionFirmCount = companies.filter(c => c.region === regionId).length;
    const govBudgetByCategory: Record<string, number> = {};

    // CHAIN-E — THE THIRD COPY OF THE C + I + G IDENTITY, and the one that wins.
    //
    // This is the authoritative seed: it runs after firms and the government exist, so its G is
    // the real procurement budget and its I the firms' real capex, where `macro/initialization.ts`
    // could only use GDP-share placeholders. It then OVERWRITES that earlier seed wholesale.
    //
    // The identity therefore lives in three places — the placeholder seed, here, and the weekly
    // rebuild in `03-category-demand.ts` — and the intermediate-demand solve was added to the
    // other two and missed here (§7.120). Because this copy is the one that survives, the model
    // ran on FINAL demand only regardless: measured, the placeholder seed produced 1,481B of
    // total output for the USA and this line replaced it with 567B, so every firm was sized
    // against a market 2.6x larger than the one it then had to sell into. Rule 3, and the reason
    // the same fix has to be made three times is itself the defect.
    const { householdBySubUnit: householdFinalDemandBySubUnit, governmentBySubUnit,
      finalBySubUnit: finalDemandBySubUnit, totalOutputBySubUnit } =
      seedDemandFromCIG(C, I, G, CAPEX_SUPPLIER_WEIGHTS);
    Object.entries(governmentBySubUnit).forEach(([unitId, annualLocal]) => {
      govBudgetByCategory[unitId] = annualLocal / 52;
    });

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const demandLevelAnnualLocal = totalOutputBySubUnit[su.unitId] ?? finalDemandBySubUnit[su.unitId];
        reg.categoryDemand[su.unitId] = createSeedCategoryDemandState(
          demandLevelAnnualLocal,
          reg.gdpGrowth ?? 0.02,
          // §7.127: FINAL demand prices the good; total output is the quantity behind it. The
          // intermediate slice is passed so a PURE intermediate prices off its producer buyers.
          deriveSubUnitUnitPrice(
            finalDemandBySubUnit[su.unitId] ?? 0, su.buyerMix, reg.totalPopulation, regionFirmCount, su.unitId,
            (totalOutputBySubUnit[su.unitId] ?? 0) - (finalDemandBySubUnit[su.unitId] ?? 0),
            householdFinalDemandBySubUnit[su.unitId] ?? 0
          )
        );
      });
    });

    // SUPPLY/CHAIN — RE-DEAL THE PRODUCER BASE, now that this region's demand is the real one.
    //
    // The firm universe was dealt against the PLACEHOLDER seed in `macro/initialization.ts`,
    // whose `I` is a GDP share; the vector just written above uses the government's real
    // procurement budget and the firms' OWN capex. Dealing against the first and selling into the
    // second is how the capital-goods sub-units came to be built for 1.29x less than would be bid
    // at them, with four of five in permanent shortage at 65-174% over base (§7.168, §7.178) —
    // and the plan called that a genuine fixed point.
    //
    // It closes in ONE pass, because the coupling is one-directional: a firm's revenue, PP&E and
    // therefore its capex are all set before any line is dealt, so `I` does not move when the
    // lines move. The deal draws no RNG, so nothing is relabelled (rule 11).
    // §7.227 — and BEFORE the deal, because the deal spreads each firm's revenue across the
    // sub-units its sector makes: get the sector totals right first, or the deal distributes the
    // wrong pot correctly.
    // The SME pools' real revenue, spread over the sub-units of the industry each pool covers in
    // proportion to those sub-units' own demand — the same mix rule stage 05 uses when a pool
    // decides where to put its capacity.
    const smeRevenueBySubUnit = new Map<string, number>();
    (reg.smePools ?? []).forEach((pool) => {
      const spec = INDUSTRY_REGISTRY[pool.industry];
      const subUnits: { unitId: string }[] = spec?.subUnits ?? [];
      const demandOf = (id: string) => Number(reg.categoryDemand[id]?.demandLevelAnnualLocal) || 0;
      const totalDemandLocal = subUnits.reduce((a, su) => a + demandOf(su.unitId), 0);
      if (!(totalDemandLocal > 0)) return;
      const poolRevenueLocal = Number(pool.annualRevenueLocal) || 0;
      subUnits.forEach((su) => {
        smeRevenueBySubUnit.set(su.unitId,
          (smeRevenueBySubUnit.get(su.unitId) ?? 0) + poolRevenueLocal * (demandOf(su.unitId) / totalDemandLocal));
      });
    });
    normalizeProducingSectorRevenue(
      companies.filter(c => c.region === regionId),
      (unitId) => Number(reg.categoryDemand[unitId]?.demandLevelAnnualLocal) || 0,
      (unitId) => smeRevenueBySubUnit.get(unitId) ?? 0
    );
    dealProductLinesAndHeadcount(
      companies.filter(c => c.region === regionId),
      (_r, unitId) => Number(reg.categoryDemand[unitId]?.demandLevelAnnualLocal) || 0,
      (_r, unitId) => smeRevenueBySubUnit.get(unitId) ?? 0
    );

    // PUB1e: the budget stage 05 bids in week 1, seeded here so it is never empty.
    reg.governmentProcurementBudgetByCategory = govBudgetByCategory;
    reg.governmentProcurementSpentLocal = 0;
}

/**
 * SUPPLY/CHAIN — iterate firm size and investment demand until they are the same number.
 *
 * Each pass generates the firm universe against the current demand vector, reads the investment
 * that universe actually implies (`Σ capex`), and rewrites the vector from it. The map is a
 * strong contraction — capital-goods makers are a slice of the economy, so a change in their
 * demand moves total capex by much less than itself — and it settles in a few passes.
 *
 * **The RNG is rewound before every pass**, so the universe that survives is bit-for-bit the one
 * a single generation against the converged vector would have produced. Without that the
 * iteration would consume the stream and relabel the world (rule 11); with it, the extra passes
 * are invisible to everything downstream.
 */
const SEED_INVESTMENT_TOLERANCE = 0.01;
const SEED_INVESTMENT_MAX_PASSES = 6;

function solveSeedInvestmentFixedPoint(
  regions: Record<RegionId, Region>,
  generate: () => Company[],
  rewindRng: () => void
): Company[] {
  let companies = generate();
  for (let pass = 0; pass < SEED_INVESTMENT_MAX_PASSES; pass++) {
    let worstDrift = 0;
    (Object.keys(regions) as RegionId[]).forEach((regionId) => {
      const reg = regions[regionId];
      const before = reg.laggedCorporateDemandBase ?? 0;
      seedRegionCategoryDemand(reg, regionId, companies);
      const after = reg.laggedCorporateDemandBase ?? 0;
      const denom = Math.max(1, Math.abs(after));
      worstDrift = Math.max(worstDrift, Math.abs(after - before) / denom);
    });
    if (worstDrift <= SEED_INVESTMENT_TOLERANCE) break;
    rewindRng();
    companies = generate();
  }
  return companies;
}

/** The world the seed is opening — set at the top of `createInitialGameState`, read by the seed's
 *  helpers below while it runs, carried by the state it returns. */
let seedV2: import('../../engine2/world').V2World;

/**
 * §3.37-SEED — THE SEED FINISHES ITSELF, BY WIRE, IN ITS OWN WEEK-0 JOURNAL.
 *
 * `docs/systems/the-seed.md` A1 asks for "a complete, consistent state: every party, every
 * account, every holding, every instrument, all present at once". It was not. The ladders and the
 * register were built on the objects, and their COLUMNAR mirrors were opened at the head of the
 * first weekly step (`core.ts`, "the ladders' catch-up, inside the journal"). Between this
 * function returning and week 1 running, 36,996 register rows worth 903.14B named tranches that
 * had no row — which is what the week-0 audit found the first time it was allowed to look.
 *
 * The catch-up sits where it does for a stated reason: it opens the ladders BY WIRE, and a wire
 * needs a live journal. That reason is real and it is why the naive fix was wrong — a bare
 * catch-up here (the mirror's `ensureLaddersSynced`, since deleted by §3.13-BOOK d1b) marked
 * every firm opened, which turned `core.ts`'s `seedLadder` into a no-op and left the ladders
 * standing with no wires behind them. Measured, that is exactly what happened: W3 "wires
 * reproduce the ladders" failed at week 1 for the full 260.74B of USA CORP_BOND. The WIRE is the
 * point.
 *
 * So the seed opens a journal of its own, numbered week 0, and does the opening itself. The
 * catch-up in `core.ts` stays exactly as it is — it is guarded on `synced` and is now a no-op for
 * anything the seed opened, while still catching every firm and fund BORN later, which is the
 * other half of what it is for.
 */
/** The treasury's issuer id in the tranche store — one per region, stable for the run. It is a
 *  GOVERNMENT party (`TrancheIssuer.kind`), so its wires name the treasury and not a company. */

function openSeededBooks(state: GameState): void {
  const v2 = ensureV2(state);
  // Nothing is active before the first week; the guard is here so this cannot silently steal a
  // journal if the seed is ever run from inside one.
  if (hasActiveWireJournal()) return;
  const j = newWireJournal((state as { nextWireId?: number }).nextWireId ?? 1, 0);
  setActiveWireJournal(j);
  // §3.13-BOOK d2: the seed is the first world the write is checked against — every opening
  // wire resolves its issuer, its holder and its instrument, or the seed throws where it is wrong.
  setActiveWireWorld(wireWorldOf(v2, state.companies, state.institutionalEntities ?? []));
  try {
    // §3.13-BOOK (dI): every company's equity and every fund's shares are DECLARED on the
    // instrument index before any wire names them — a wire resolves its instrument against the
    // index, so an undeclared equity would be refused at the site. The ladders declare their
    // own rungs as they are issued below.
    for (const c of state.companies) registerCompanyEquity(v2, c);
    for (const e of state.institutionalEntities ?? []) registerFundShares(v2, e);
    for (const c of state.companies) {
      if (!v2.tranches.synced.has(c.id)) seedLadder(v2, { id: c.id, ticker: c.ticker, region: c.region }, c.debtTranches);
    }
    // §3.13-SOV row 2 — THE SOVEREIGN LADDER JOINS THE ONE STORE, BY WIRE LIKE ANY OTHER.
    // `reg.govDebtTranches` is a plain array beside the engine2 store every corporate ladder
    // lives in; that is the second of the five parallel structures. Opening it here puts sovereign
    // paper under the same `Σ held = issued` and `wires reproduce the ladders` checks the
    // corporate ladders answer to (`the-register.md` B2, W3) — which it has never been under.
    (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
      const ladder = seedGovLadderOf(state.regions[regionId]);
      if (!ladder.length) return;
      seedLadder(v2, governmentIssuer(regionId), ladder);
    });
    const { companyById } = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
    const issuerOfHolding = (h: ItemizedHolding): PartyRef => issuerOfHoldingRow(v2, h, companyById);
    for (const e of state.institutionalEntities ?? []) {
      if (!v2.holdings.synced.has(e.id)) seedBook(v2, { kind: 'INSTITUTION', id: e.id }, e.itemizedHoldings, issuerOfHolding);
    }
    // §3.13-BOOK d4c-vi: the private funds' LP commitments, struck on the contract store now
    // that every institution they name resolves.
    drainSeedCommitments(v2, state.institutionalEntities ?? []);
    // §3.13-BOOK d3a — THE CENTRAL BANKS' BOOKS, opened by wire like every other holder's: each
    // bond the seed's close sized (`seedCentralBankBookOf`) is issued by the treasury to the
    // central bank at its face. The stash dies here; the rows are the book from now on.
    (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
      const cb = state.regions[regionId]?.centralBankSheet;
      if (!cb) return;
      const book: ItemizedHolding[] = Object.entries(seedCentralBankBookOf(cb))
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([id, v]) => ({ instrumentId: asInstrumentId(id), instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalLocal: Number(v), units: Number(v) }));
      seedBook(v2, { kind: 'CENTRAL_BANK', region: regionId }, book, issuerOfHolding);
    });
    // §3.13-BOOK d3b — THE BANKS' OWN BOOKS, the same way: each bond the seed allocated to a bank
    // (OWN6, `seedBankBookOf`) is issued by the treasury to the bank at its face.
    state.companies.forEach((c) => {
      if (!c.isBankEntity || !c.bankBalanceSheet) return;
      const book: ItemizedHolding[] = Object.entries(seedBankBookOf(c.bankBalanceSheet))
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([id, v]) => ({ instrumentId: asInstrumentId(id), instrumentType: 'GOV_BOND', issuerRegion: c.region, quantityOrNotionalLocal: Number(v), units: Number(v) }));
      seedBook(v2, bankPartyOf(c.id), book, issuerOfHolding);
    });
    // §9.13-EQUITY — AND THE HOUSEHOLD SECTOR'S BOOK, opened by wire like every other holder's.
    // Every share of every listed company is either on a named book or held directly by
    // households; the institutions' books have just been opened, so what is left of each issue is
    // the household sector's OPENING POSITION. From here it moves only by trade, like anyone
    // else's — it is never recomputed as a residual again, which is the whole point (rule 2).
    // The desks hold nothing at the seed: a dealer inventory is built from a bank's sheet in the
    // weekly sessions, so there is no third claimant to net out here.
    REGION_IDS.forEach((regionId) => {
      const heldShares = new Map<string, number>();
      const H = v2.holdings;
      const equityRef = typeRefOf(v2, 'EQUITY');
      if (equityRef >= 0) {
        for (const e of state.institutionalEntities ?? []) {
          for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
            if (H.typeRef[r] !== equityRef) continue;
            const id = instrumentIdAt(v2, r);
            heldShares.set(id, (heldShares.get(id) ?? 0) + (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]));
          }
        }
      }
      const book: ItemizedHolding[] = [];
      state.companies.forEach((c) => {
        if (c.region !== regionId || !isActiveCompany(c) || !isPubliclyListed(c)) return;
        const shares = issuedSharesOf(v2, c.id) - (heldShares.get(c.id) ?? 0);
        if (!(shares > 0) || !(c.stockPrice > 0)) return;
        book.push({
          instrumentId: equityInstrumentId(c.id), instrumentType: 'EQUITY', issuerRegion: regionId,
          quantityShares: shares, quantityOrNotionalLocal: shares * c.stockPrice, units: shares,
        });
      });
      seedBook(v2, { kind: 'HOUSEHOLD', region: regionId }, book, issuerOfHolding);
    });
    // The seed's wires are a real journal and the world carries it, so week 0 can be asked what
    // it wired exactly as any week is. There are no payments at the seed, so the pending money it
    // is netted against is zero.
    const { companyById: companyById2 } = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
    state.lastWires = summarizeWires(j, { numeraire: 0, byCurrency: {} }, (id: EntityId) => companyById2.get(id)?.region, reasonText, v2.fx);
    (state as { nextWireId?: number }).nextWireId = j.base + j.n;
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
}

/**
 * S7: project the real seeded books onto the sector aggregates before the first week runs, so
 * week 0's displayed numbers are the same derivation every later week uses. The aggregates
 * written inside `buildSeededGameState` are the SEEDS the entity targets were sized against (they
 * have to exist first); this replaces them with what the resulting real books actually hold —
 * notably including the HC private tier, which the share-times-outstanding seeds never saw.
 *
 * §3.13-BOOK d1: this runs AFTER `openSeededBooks`, on the state's own world. It used to run
 * inside `buildSeededGameState` on a throwaway host with no world at all, where the mirror's
 * catch-up copied the object arrays into an empty store so the view had rows to read — and every
 * account was absent there, so the sector's opening CASH projected as zero. The mirror is gone;
 * the view reads the register the seed just wired, and the cash it reads is the cash that was
 * opened.
 */
function projectSeededSectorViews(state: GameState): void {
  // OWN1: and the ownership register, from the same seeded books — so week 0 shows the same
  // measurement stage 11 will take at the end of week 1, rather than an empty one.
  const ownershipByRegion = measuredOwnershipAllRegions(state);
  (Object.keys(state.regions) as RegionId[]).forEach(regionId => {
    refreshRegionalHoldingsView(state, regionId, state.regions[regionId]);
    const m = ownershipByRegion[regionId];
    state.regions[regionId].equityOwnership = ownershipSharesFromRegister(m.equity);
    state.regions[regionId].corpBondOwnership = ownershipSharesFromRegister(m.corpBond);
    state.regions[regionId].sovBondOwnership = ownershipSharesFromRegister(m.sovBond);
  });
}

export function createInitialGameState(seed: number = DEFAULT_SIMULATION_SEED): GameState {
  // §5-WIRES A3: the persistent world is born with the seed — the accounts the seed opens below
  // (a firm's, an entity's, a pool's rows at its banks) live on it, and the state carries it.
  seedV2 = ensureV2({});
  const state = buildSeededGameState(seed);
  // §4.C II.5 — the seed's revenue histories land on the ring now that the world exists.
  drainSeedRevenueHistories(state);
  drainSeedRings(state);
  // §5-BRAINS — every deciding entity is born with its two preference primitives.
  ensureManagements(state.companies, state.institutionalEntities ?? [], 0);
  openSeededBooks(state);
  // §3.37-SEED / D2 and §3.13, AFTER THE BOOKS ARE OPEN (§3.13-BOOK d3b moved both here: they ran
  // inside `buildSeededGameState` against an empty store, so the accruals opened at zero for every
  // register holder and no seeded bond was priced). The accrual ledger opens at what the aged
  // ladders have actually accrued, on the rows the seed just wired; and every seeded bond opens
  // with a PRICE, so week 1's session prices each piece of paper from what its own aged cash flows
  // are worth rather than from one spread per borrower.
  seedOpeningAccruals(state.regions, state.companies, state.institutionalEntities, seedV2, 1);
  seedOpeningCreditPrices(state.regions, state.companies, seedV2, 1);
  projectSeededSectorViews(state);
  // §5-STRUCT step 6 — OFF unless asked for. Burn-in hands back a world the ENGINE produced rather
  // than one this function asserted, which is the end state for every §7.4 defect. It changes every
  // number in the project at once, so it is a switch someone turns deliberately after reading the
  // steady-state probe (engine/simulation/burn-in.ts), never a default.
  const mode = burnInMode();
  if (mode.mode === 'off') return state;
  // §7.345 — to convergence, calendar continuous (§7.294's reset is what broke the meeting cycle).
  return burnIn(state, advanceWeeklyStep, mode).state;
}

function buildSeededGameState(seed: number = DEFAULT_SIMULATION_SEED): GameState {
  setSimulationSeed(seed);
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  // §6 hoist: the generator reads seed primitives from the regions this function just built,
  // instead of rebuilding four fresh regions per company.
  //
  // SUPPLY/CHAIN — and it runs until FIRM SIZE and INVESTMENT DEMAND agree. A firm's revenue is
  // derived from its primary category's demand seed and its capex from that revenue, while `I` —
  // which sizes the capital-goods half of the demand seed — is the sum of exactly those capexes.
  // The seed used to resolve that circle by using a GDP-share placeholder for one side and the
  // real number for the other, which is why the capital-goods industries were built for 1.29x
  // less than would be bid at them (§7.168, §7.178). The RNG is rewound before each pass, so the
  // universe that survives is the one a single generation against the converged vector produces.
  // The rewind restores the stream position as it stands HERE, not the seed itself: the region
  // and FX builders above may draw, so re-seeding would hand the generator a different stream
  // than a single pass would have. Snapshot, restore, and the surviving universe is identical.
  const rngBeforeFirms = getRngState();
  const companies = solveSeedInvestmentFixedPoint(
    regions,
    () => generateInitialCompanies(regions),
    () => setRngState(rngBeforeFirms)
  );

  // ---- HC Wave 1: the named private tier (HC1 generation + HC3 carves) ----
  // Generated FIRST, so every bootstrap computation below sees one consistent, already-carved
  // world: private firms are real companies in `companies` (listingStatus 'PRIVATE'), and each
  // segment aggregate has already surrendered exactly what its named tier now carries — debt
  // (HC1), employment, revenue and capex (HC3) — never both counting the same real thing.
  // Public-only computations (the holdings candidate lists) gate explicitly where they occur.
  const privateFirmsByRegion = new Map<RegionId, Company[]>();
  {
    const allTickers = new Set(companies.map(c => c.ticker));
    const allNames = new Set(companies.map(c => c.name));
    (Object.keys(regions) as RegionId[]).forEach(regionId => {
      const reg = regions[regionId];
      const segs = reg.smePools || [];
      const seeds = generatePrivateFirmSeeds(regionId, segs);
      const firms = generatePrivateCompanies(regionId, seeds, reg.policyRate, allTickers, allNames);

      // HC3b: the named private tier SELLS. It was held out with a measurement — injecting its
      // supply into markets sized for public supply cost 10-22% of growth — and what changed is
      // that the markets are no longer sized that way: SEG put an SME pool behind every one of
      // the registry's sub-units, and SVC added the service categories where most of this tier
      // actually trades. The tier's output is carved OUT of its pool rather than added on top
      // (HC's conservation rule), so total supply is unchanged by naming a firm.
      //
      // Each firm is dealt its pool's own goods mix — the sub-units of its industry, weighted by
      // the region's real demand for each — the same rule a birth uses.
      segs.forEach(seg => {
        const segIdx = seeds.map((sd, i) => sd.industry === seg.industry ? i : -1).filter(i => i >= 0);
        const segFirms = segIdx.map(i => firms[i]);
        const subUnits = INDUSTRY_REGISTRY[seg.industry].subUnits;
        const demandOf = (id: string) => reg.categoryDemand[id]?.demandLevelAnnualLocal ?? 0;
        const demandTotal = subUnits.reduce((a, su) => a + demandOf(su.unitId), 0);
        segFirms.forEach(f => {
          f.productLines = subUnits.map(su => ({
            industry: seg.industry,
            subUnitId: su.unitId,
            revenueShare: demandTotal > 0 ? demandOf(su.unitId) / demandTotal : 1 / Math.max(1, subUnits.length),
            competitiveness: 0,
            categoryMarketShare: 0,
          })).filter(l => l.revenueShare > 0);
        });
        // The carves. Debt: serviceable ladders only (see HC1's finding on the segment debt
        // primitive). Revenue, employment and capex: exactly what the named tier now carries.
        const namedRevenueLocal = segFirms.reduce((a, f) => a + f.annualRevenue, 0);
        // §3.13-READ C1: the object, deliberately — pre-`openSeededBooks`, it is the source.
        seg.debtLocal = Math.round(Math.max(0, seg.debtLocal - segFirms.reduce((a, f) => a + totalDebtOf(f), 0)));
        seg.employment = Math.max(1000, Math.round(seg.employment - segFirms.reduce((a, f) => a + f.employeeCount, 0)));
        seg.annualRevenueLocal = Math.max(1, Math.round(seg.annualRevenueLocal - namedRevenueLocal));
        seg.capexLocal = Math.round(Math.max(0, seg.capexLocal - segFirms.reduce((a, f) => a + f.capex, 0)));
      });

      // SEG/HH: a pool employs the headcount its OWN revenue supports — recomputed here because
      // the carve above just changed that revenue. It is not handed the labor force's leftovers;
      // the residual form this replaces left the pools carrying every worker the named firms and
      // the government did not, against revenue the named tier had just been carved out of,
      // measured as a layoff cascade from 3.86M to 1.44M workers in twenty weeks.
      //
      // §7.119: it now uses the ONE headcount rule (`smePoolEmployment` — value added over output
      // per worker, the same function the two named generators call) instead of a second
      // derivation off the named tier's revenue per worker, which silently overwrote the pools'
      // own and made the seed's headcount rule differ by tier.
      segs.forEach(seg => {
        seg.employment = smePoolEmployment(seg.industry, seg.annualRevenueLocal, getRegionProductivityPerCapitaLocal(regionId));
      });

      privateFirmsByRegion.set(regionId, firms);
      companies.push(...firms);

      // HC3b: every seller's share of every market it is in, recomputed now that the private
      // tier is in those markets too. The generator computed shares over the public tier alone
      // (it ran before these firms existed), and stage 08 SCALES this number weekly — so a firm
      // left at zero could never gain any share at all, and the public firms' shares would have
      // been claims on a market they no longer have to themselves.
      const regionSellers = companies.filter(c => c.region === regionId && !c.isBankEntity);
      const marketLocal = new Map<string, number>();
      regionSellers.forEach(c => (c.productLines || []).forEach(l => {
        marketLocal.set(l.subUnitId, (marketLocal.get(l.subUnitId) ?? 0) + l.revenueShare * c.annualRevenue);
      }));
      regionSellers.forEach(c => (c.productLines || []).forEach(l => {
        const totalLocal = marketLocal.get(l.subUnitId) ?? 0;
        l.categoryMarketShare = totalLocal > 0 ? Number(((l.revenueShare * c.annualRevenue) / totalLocal).toFixed(6)) : 0;
      }));
    });
  }

  const institutionalEntities: InstitutionalEntity[] = [];

  // §7.347 — every kind's (and every hedge-fund strategy's) policy allocation is a registry fact
  // (domain/institution-profiles.ts); the seed reads it like every stage does.
  const targetFor = allocationTargetFor;

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    // SUPPLY/CHAIN: the demand vector and the producer base are already converged against each
    // other (`solveSeedInvestmentFixedPoint`, run before the private tier). This call writes the
    // final vector onto the region from the universe that survived, so nothing downstream reads a
    // pass that was rewound.
    seedRegionCategoryDemand(reg, regionId, companies);

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);

    const totalMarketCap = regionCompanies.reduce((s, c) => s + marketCapOf(c, seedIssuedSharesOf(c)), 0);
    // FRM: the ratio is measured now, and it is seeded from the stack macro/initialization built
    // — so this reads the same number rather than the walked field it used to.

    reg.institutionalSector.equityHoldingsLocal = Math.round((INSTITUTIONAL_OPENING_BOOK_SHARE.equity * totalMarketCap));
    // OWN6: the sovereign pool is the RESIDUAL, set after the bank pass below once the central
    // bank's and the banks' books are known. Opened at zero so the bank pass reserves nothing.
    reg.institutionalSector.sovBondHoldingsLocal = 0;
    // The credit book is placed whole, off the candidate lists below rather than off a share of
    // `totalCorpDebt` — see INSTITUTIONAL_OPENING_BOOK_SHARE's doc for what that share minted.

    // Compile holding candidates for individual institutional entities and macro sectors
    const equityCandidates: { id: InstrumentId; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingLocal: number }[] = regionCompanies.filter(c => c.listingStatus !== 'PRIVATE').map(c => ({
      id: equityInstrumentId(c.id),
      type: 'EQUITY',
      region: regionId,
      outstandingLocal: marketCapOf(c, seedIssuedSharesOf(c))
    }));

    // §3.13: keyed by TRANCHE, which is what 07b now clears and what the register names, so the
    // seed opens in exactly the shape the first clearing week reads (§7.4).
    // Real bonds are an issuer's FIXED-rate tranches only — floating tranches are real leveraged
    // loans, a genuinely different market with its own real clearing and its own candidate list
    // (loanCandidates below) — see 07b-corporate-bond-clearing.ts / 07d-leveraged-loan-clearing.ts.
    // Candidate lists stay PUBLIC: the macro holdings aggregates were calibrated against the
    // public market, and the private tier's paper is seeded separately in the engines' own
    // shape (the HC2 block below).
    // §5-FINALIZATION 13b: the candidates are the TRANCHES — a register row names the paper the
    // ladder's wires name; the per-issuer weight the books clear by is the sum of its tranches.
    const corpCandidates: { id: InstrumentId; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingLocal: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .flatMap(c => (c.debtTranches || []).filter(t => t.rateType === 'FIXED' && !t.isCommercialPaper && !t.isBankFacility)
        .map(t => ({ id: t.id, type: 'CORP_BOND' as const, region: regionId, outstandingLocal: t.principalLocal })))
      .filter(c => c.outstandingLocal > 0);
    const totalCorpCandidatesLocal = corpCandidates.reduce((s, c) => s + c.outstandingLocal, 0) || 1;
    // OWN6: the opening credit book is the tradable stock itself. Placed here, once the candidate
    // list that defines that stock exists — holdings-view.ts rederives this scalar from the
    // entities' own books every week after, so the seed must open in the same shape.
    reg.institutionalSector.corpBondHoldingsLocal = Math.round(totalCorpCandidatesLocal);

    const loanCandidates: { id: InstrumentId; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingLocal: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .flatMap(c => (c.debtTranches || []).filter(t => t.rateType === 'FLOATING' && !t.isBankFacility && !t.isCommercialPaper)
        .map(t => ({ id: t.id, type: 'LEVERAGED_LOAN' as const, region: regionId, outstandingLocal: t.principalLocal })))
      .filter(c => c.outstandingLocal > 0);
    const totalLoanCandidatesLocal = loanCandidates.reduce((s, c) => s + c.outstandingLocal, 0) || 1;
    const attributeLoanHoldingsProportionally = (shareLocal: number): ItemizedHolding[] =>
      loanCandidates
        .filter(c => shareLocal * (c.outstandingLocal / totalLoanCandidatesLocal) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalLocal: shareLocal * (c.outstandingLocal / totalLoanCandidatesLocal), units: shareLocal * (c.outstandingLocal / totalLoanCandidatesLocal),
        }));
    // Proportional-by-size, not attributeItemizedHoldings' size-sorted-greedy-with-a-40%-cap
    // fill: the real weekly clearing engine (07b-corporate-bond-clearing.ts) distributes an
    // entity's target across issuers by real debt-outstanding weight (tilted only by real
    // attractiveness, which is ~neutral at cold start); seeding the same shape here means an
    // entity's real week-1 gap per issuer is genuinely small, instead of the greedy fill
    // concentrating holdings in the 2-3 biggest issuers and leaving every smaller one to open
    // with an artificial, systemic buy gap on its first real clearing week.
    const attributeCorpBondHoldingsProportionally = (shareLocal: number): ItemizedHolding[] =>
      corpCandidates
        .filter(c => shareLocal * (c.outstandingLocal / totalCorpCandidatesLocal) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalLocal: shareLocal * (c.outstandingLocal / totalCorpCandidatesLocal), units: shareLocal * (c.outstandingLocal / totalCorpCandidatesLocal),
        }));

    // Equity is seeded in SHARES, proportional to each name's market cap — the same shape
    // 07e-equity-clearing.ts builds its structural demand in (§7.4). The greedy size-sorted fill
    // used before concentrated every entity's book in the two or three largest names, so week 1
    // opened with a systemic buy gap in every smaller name; and it stored dollars only, which is
    // the circularity the share registry exists to kill — a book whose size depends on the price
    // it is supposed to set (#28).
    const totalEquityCandidatesLocal = equityCandidates.reduce((s2, c) => s2 + c.outstandingLocal, 0) || 1;
    const equityPriceById = new Map(regionCompanies.map(c => [c.id, c.stockPrice]));
    // §5-CLOSE O2: the institutions can hold AT MOST THE ISSUE. The sector's equity budget is
    // spread over every listed name in proportion to its cap, so the fraction of each name it
    // ends up holding is the same everywhere: budget / total cap. Above one, the seed used to
    // write more shares onto the register than the firms had issued (193 firms, 18B of stock
    // nobody issued at week 1); now the allocation stops at the issue and the unplaced budget
    // stays as the entity's CASH — money it holds at its bank and will bid with in 07e.
    const equityFillRatio = Math.min(1, totalEquityCandidatesLocal / Math.max(1, reg.institutionalSector.equityHoldingsLocal || 0));
    const attributeEquityHoldingsProportionally = (shareLocal: number): ItemizedHolding[] =>
      equityCandidates
        .filter(c => shareLocal * equityFillRatio * (c.outstandingLocal / totalEquityCandidatesLocal) > 1)
        .map(c => {
          const nameLocal = shareLocal * equityFillRatio * (c.outstandingLocal / totalEquityCandidatesLocal);
          // SHARES are the quantity; the dollars are shares x price, which is why the division
          // happens once and both fields read the same number.
          // §3.13-BOOK (c2a): the candidate is an INSTRUMENT and the price map is keyed by ISSUER —
          // a listed equity's id is its issuer's, which is the crossing this names.
          const shares = nameLocal / Math.max(0.01, equityPriceById.get(equityIssuerId(c.id)) ?? 1);
          return {
            instrumentId: c.id,
            instrumentType: c.type,
            issuerRegion: c.region,
            quantityShares: shares,
            quantityOrNotionalLocal: nameLocal,
            units: shares,
          };
        });

    const govDebtTranches = seedGovLadderOf(reg);
    const sovCandidates: { id: InstrumentId; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingLocal: number }[] = govDebtTranches.map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingLocal: gt.principalLocal
    }));

    // §3.13-SOV row 3: the seed opens holdings in BONDS, the same ids 07c and 07f clear. It used
    // to open them in tenor buckets — `${regionId}-GOV-${bucketKey}` — an id naming a group, so no
    // seeded holder could be asked which bond it held and the seed and the auctions spoke two id
    // spaces for one instrument. A holder's share of each bond is that bond's share of the stock.
    const sovOutstandingByBond = new Map<InstrumentId, number>(
      govDebtTranches.filter((t) => t.principalLocal > 0).map((t) => [t.id, t.principalLocal])
    );
    const totalSovOutstandingLocal = Array.from(sovOutstandingByBond.values()).reduce((s, v) => s + v, 0) || 1;
    const attributeSovBondHoldingsProportionally = (shareLocal: number): ItemizedHolding[] =>
      Array.from(sovOutstandingByBond.entries())
        .filter(([, bondLocal]) => shareLocal * (bondLocal / totalSovOutstandingLocal) > 1)
        .map(([bondId, bondLocal]) => ({
          instrumentId: bondId,
          instrumentType: 'GOV_BOND' as const,
          issuerRegion: regionId,
          quantityOrNotionalLocal: shareLocal * (bondLocal / totalSovOutstandingLocal), units: shareLocal * (bondLocal / totalSovOutstandingLocal),
        }));

    // Seed each named bank's real sovereign book across the same bonds the weekly
    // auction clears, with the same outstanding-weighted split across tenors.
    //
    // This was missing: banks carried a scalar `sovereignBondHoldingsLocal` but an EMPTY
    // `sovereignBondHoldingsByBond`, and 07c reads that book. So every bank opened ~$147B
    // below its own target in a $670B market and bought into it every single week, which the
    // auction could only express as a monotonic slide in yields — the whole banking sector
    // permanently on the bid. Two representations of one book, and the engine was reading the
    // empty one. Seed shape must match engine shape.
    const regionBanksForSov = banksOf(regionCompanies);
    if (regionBanksForSov.length > 0 && totalSovOutstandingLocal > 1) {
      // OWN6: a bank opens with the sovereign book its OWN EQUITY supports under the leverage
      // floor, not with `sovBondOwnership.bankShare x the market`. Its other assets are already
      // on the sheet at this point and its funding is derived from the asset side below, so
      // capital is the constraint that is genuinely available here — and it is the same one
      // 07c applies from week 1, which is what §7.4 asks of a seed. Banks are the residual
      // holder of the stock the central bank and the institutions do not take; where the
      // cohort's headroom cannot absorb that residual it is rationed pro-rata, never forced.
      const headroomByBank = new Map(regionBanksForSov.map(b =>
        // The book is allocated just below, so the headroom here is struck with none of it — as it
        // was when the sheet's Record was still empty at this point.
        [b.ticker, leverageHeadroomLocal(b.bankBalanceSheet!, openingCashOf(b.bankBalanceSheet!), facilityBookOf(seedV2, b.id), 0)]));
      const totalHeadroomLocal = Array.from(headroomByBank.values()).reduce((a, v) => a + v, 0);
      const takenByOthersLocal = (reg.institutionalSector.sovBondHoldingsLocal || 0)
        + totalSovOutstandingLocal * CENTRAL_BANK_SOVEREIGN_SHARE;
      const availableToBanksLocal = Math.max(0, totalSovOutstandingLocal - takenByOthersLocal);
      const bankSovTotalLocal = Math.min(totalHeadroomLocal, availableToBanksLocal);
      const perBankTargets = new Map(regionBanksForSov.map(b => [
        b.ticker,
        totalHeadroomLocal > 0 ? bankSovTotalLocal * ((headroomByBank.get(b.ticker) ?? 0) / totalHeadroomLocal) : 0,
      ]));
      regionBanksForSov.forEach(bank => {
        const targetLocal = perBankTargets.get(bank.ticker) ?? 0;
        const byBond: Record<string, number> = {};
        sovOutstandingByBond.forEach((bondFaceLocal, bondId) => {
          const heldLocal = targetLocal * (bondFaceLocal / totalSovOutstandingLocal);
          if (heldLocal > 1) byBond[bondId] = heldLocal;
        });
        // §3.13-BOOK d3b: the bank's book is REGISTER ROWS, issued by wire at `openSeededBooks`
        // from this stash — not a field on the sheet.
        stashSeedBankBook(bank.bankBalanceSheet!, byBond);
        // §7.4, applied to the FUNDING side this time. This sovereign book is seeded from the
        // market (the bank share of the real outstanding stock — the S2 fix), but the deposit
        // seed still came from a GDP ratio chosen when the sov book was a 2%-of-GDP scalar.
        // Nobody reconciled the two, so the balance sheet opened ~139B short (USA) and the old
        // evolution's Math.max plug manufactured the difference every week. Cash now moves only
        // by named flows, so the sheet must BALANCE at birth: deposits are seeded as the funding
        // the asset side actually requires — assets minus equity — the same shape the weekly
        // ledger maintains from here on. G2 later replaces this stock with real loan-created
        // deposits and real household flows.
        const bs = bank.bankBalanceSheet!;
        // §5-WIRES D: the seed's STATED loan books (the rows arrive with the migrations below)
        // stand in the funding side here exactly as the stored scalars did.
        stashSeedHouseholdLine(bs, Math.round((
          seedLoanBookShareLocal(reg, bank, 'business') + seedLoanBookShareLocal(reg, bank, 'consumer') + seedBankBookLocalOf(bs) +
          openingCashOf(bs) - bs.bankEquityLocal
        )));
      });

      // The region aggregate is the derived sum of the named banks (the 02b/S7 doctrine),
      // re-projected here so week 0 reads the same books week 1 will. §3.13-BOOK d3b: it carries
      // no sovereign book — a regional sovereign figure is the sum of the banks' register rows.
      const sumBank = (f: (bs: import('../../types').BankingSector) => number) =>
        Math.round(regionBanksForSov.reduce((sum, b) => sum + f(b.bankBalanceSheet!), 0));
      reg.bankingSector = {
        ...reg.bankingSector,
        bankEquityLocal: sumBank(bs => bs.bankEquityLocal),
      };
      // OWN6/OWN7: whatever the central bank and the capital-constrained banks left is the
      // institutions'. Every bond now has a holder, which is what stops the float minting claims
      // and stops a redemption paying somebody who is not there.
      reg.institutionalSector.sovBondHoldingsLocal = Math.round(Math.max(0,
        totalSovOutstandingLocal
        - totalSovOutstandingLocal * CENTRAL_BANK_SOVEREIGN_SHARE
        - sumBank(bs => seedBankBookLocalOf(bs))));
    }

    // G2 slice 1: itemize the business book onto real borrowers, and recalibrate the SME
    // seed scalar (`debtLocal = 2 x revenue`, ~17.8x EBITDA — §6's unpriced primitive) down to
    // what the pools can service AND the banks' capital can carry.
    const regionBanksForLending = banksOf(regionCompanies);
    if (regionBanksForLending.length > 0) {
      migrateSmeDebtAtSeed(seedV2, regionId, reg, regionBanksForLending);
      // HH3: the household debt the region already carries becomes real mortgage / card / term
      // pools on the same named banks, replacing the consumer scalar (which covered 11.67% of
      // the same debt and owed the rest to nobody). Equity tops up at each bank's own opening
      // capital ratio and deposits re-derive as the balancing funding — §7.4's discipline: the
      // seed opens in the exact shape the weekly lending pass maintains.
      migrateHouseholdDebtAtSeed(seedV2, regionId, reg, regionBanksForLending);
      reg.bankingSector = {
        ...reg.bankingSector,
        bankEquityLocal: regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.bankEquityLocal, 0),
      };

      // PUB2 (§7.4): close the central bank's balance sheet at birth, now that the banks whose
      // cash is its reserve liability exist. Currency is the residual; the weekly stage
      // re-derives it by the same arithmetic.
      const cbSheet = reg.centralBankSheet;
      if (cbSheet) reg.centralBankBalanceSheet = Math.round(centralBankAssetsLocal(Object.values(seedCentralBankBookOf(cbSheet)).reduce((a, v) => a + (Number(v) || 0), 0), cbSheet, 0)); // no advance at birth; the book is the seed's stash until `openSeededBooks`

      // Every company banks somewhere: its cash IS a deposit at its house bank (the same
      // relationship lead WS8 mandates for its offerings, so one firm has one bank).
      // G3c: a house bank is won, not drawn. Each relationship consumes the winner's balance
      // sheet, so the region's firms spread across its banks in proportion to the equity each
      // one actually has — the hash of the firm's id this replaces spread them too, but on
      // nothing any bank did.
      const houseBanks = mandateAllocator(regionBanksForLending.map(b => ({
        id: b.id, bankMarketShare: b.bankMarketShare,
        capacityLocal: b.bankBalanceSheet?.bankEquityLocal ?? 0,
      })));
      // §3.13-READ D13: assigned and totalled in ONE pass — `pick` consumes the winner's
      // capacity, so the allocation depends on the order and the total has to come from the same
      // walk that made it. This was two loops, the second re-testing a `homeBankId` the first
      // had just set on every row.
      const corpDepositsByBank = assignHouseBanks(
        regionCompanies.filter(c => !c.isBankEntity), houseBanks, openingCashOf);
      // SEG1: the segment pools get their own money, sized by the named private tier's measured
      // cash/revenue ratio — the tier's small firms hold working balances like its named ones
      // do. The balance sits across the region's banks pro-rata by market share (small firms
      // bank everywhere), and each bank holds the reserves behind it, exactly like the
      // corporate line below.
      {
        const namedPrivate = regionCompanies.filter(c => !c.isBankEntity && c.listingStatus === 'PRIVATE');
        const tierRevenueLocal = namedPrivate.reduce((a, c) => a + Math.max(0, c.annualRevenue), 0);
        const tierCashLocal = namedPrivate.reduce((a, c) => a + Math.max(0, openingCashOf(c)), 0);
        const cashToRevenue = tierRevenueLocal > 0 ? tierCashLocal / tierRevenueLocal : 0.08;
        (reg.smePools || []).forEach(seg => {
          stashOpeningCash(seg, Math.round(Math.max(0, seg.annualRevenueLocal) * cashToRevenue));
        });
      }
      const bankShareTotal = regionBanksForLending.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
      regionBanksForLending.forEach(b => {
        const corpLocal = Math.round(corpDepositsByBank.get(b.ticker) ?? 0);
        // §5-WIRES A3.3: each pool's row at this bank opens at its share of the pool's opening
        // cash, and the bank's SME line is the sum of those rows — one number, two views.
        let smeLocal = 0;
        (reg.smePools || []).forEach((seg) => {
          const rowLocal = bankShareTotal > 0
            ? Math.round(openingCashOf(seg) * ((b.bankMarketShare ?? 0) / bankShareTotal))
            : Math.round(openingCashOf(seg) / regionBanksForLending.length);
          openSectorRow(seedV2, { kind: 'SEGMENT', region: regionId, industry: seg.industry }, b.ticker, currencyOf(regionId), rowLocal);
          smeLocal += rowLocal;
        });
        // SETL2 (§7.4 — the seed must open in the shape the weekly engine maintains): a corporate
        // balance is a real liability now, so the bank holds the real asset behind it. The money
        // its customers deposited is central-bank money, exactly as a week-1 deposit inflow would
        // be. Without this the sheet opens short by the whole corporate line.
        stashOpeningCash(b.bankBalanceSheet!, openingCashOf(b.bankBalanceSheet!) + corpLocal + smeLocal);
        // Now that the corporate leg is known, the funding identity is re-derived: wholesale is
        // the residual AFTER real deposits, not a plug carrying money the companies already
        // lent this bank (§7.4 — the seed must open in the shape the weekly engine maintains).
        applyBankFundingSplit(b.bankBalanceSheet!, openingCashOf(b.bankBalanceSheet!), facilityBookOf(seedV2, b.id), Math.round(openingCashOf(reg.householdState) * (b.bankMarketShare ?? 1 / regionBanksForLending.length)), seedBankBookLocalOf(b.bankBalanceSheet!));
      });
    }

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(reg.institutionalSector.corpBondHoldingsLocal, corpCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.sovBondHoldingsLocal, sovCandidates),
      ...attributeEquityHoldingsProportionally(reg.institutionalSector.equityHoldingsLocal),
    ];

    // Build the individual InstitutionalEntity objects mapping to regional Companies
    const regionalInstCompanies = regionCompanies.filter(c => c.isInstitutionalEntity);

    // Real, bottom-up aggregate: the institutional sector's actual share of the real corporate
    // debt market (already a stable, real calibration used elsewhere in this codebase) — never
    // an independently-summed entity-level number that could come out larger than the market.
    // Each entity's own corpBondPct is a relative weight on this real, already-bounded pool (how
    // much MORE or LESS of it this entity wants versus its peers), not a free-standing dollar
    // target that could exceed the pool — see distributeRealTargetByWeight's doc comment. This
    // is the exact same derivation the real weekly clearing engine
    // (07b-corporate-bond-clearing.ts) uses, so week 1 starts already consistent with it instead
    // of needing a one-time correction on its first real week.
    const rawEntityCorpTargetsLocal = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsLocal =
            (reg.institutionalSector.equityHoldingsLocal || 0) +
            (reg.institutionalSector.corpBondHoldingsLocal || 0) +
            (reg.institutionalSector.sovBondHoldingsLocal || 0) +
            (reg.institutionalSector.cashLocal || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsLocal * share, targetPct: targetFor(role, comp.hedgeFundStrategy).corpBondPct };
        }),
      reg.institutionalSector.corpBondHoldingsLocal || 0
    );
    // Same real, bottom-up derivation for sovereign bonds (govBondPct as a relative weight on
    // the real institutional sovereign-debt pool) — matches 07c-sovereign-bond-clearing.ts.
    const rawEntitySovTargetsLocal = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsLocal =
            (reg.institutionalSector.equityHoldingsLocal || 0) +
            (reg.institutionalSector.corpBondHoldingsLocal || 0) +
            (reg.institutionalSector.sovBondHoldingsLocal || 0) +
            (reg.institutionalSector.cashLocal || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsLocal * share, targetPct: targetFor(role, comp.hedgeFundStrategy).govBondPct };
        }),
      reg.institutionalSector.sovBondHoldingsLocal || 0
    );
    // Leveraged loans open at the same institutional weight as the sibling bond market, applied
    // to the real bottom-up floating-debt stock.
    const rawEntityLoanTargetsLocal = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsLocal =
            (reg.institutionalSector.equityHoldingsLocal || 0) +
            (reg.institutionalSector.corpBondHoldingsLocal || 0) +
            (reg.institutionalSector.sovBondHoldingsLocal || 0) +
            (reg.institutionalSector.cashLocal || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsLocal * share, targetPct: targetFor(role, comp.hedgeFundStrategy).loanPct };
        }),
      totalLoanCandidatesLocal
    );

    regionalInstCompanies.forEach(comp => {
      const role = comp.institutionalEntityType;
      if (!role) return;

      const share = comp.institutionalMarketShare ?? 0.33;
      const macroSector = reg.institutionalSector;
      const totalMacroAssetsLocal =
        (macroSector.equityHoldingsLocal || 0) +
        (macroSector.corpBondHoldingsLocal || 0) +
        (macroSector.sovBondHoldingsLocal || 0) +
        (macroSector.cashLocal || 0);

      // COH2 — A PENSION FUND IS AS BIG AS THE ENTITLEMENTS IT OWES, and at week 0 that stock is
      // derived rather than left circular.
      //
      // `beneficiaryLiabilityLocal` was reversed weekly — it accumulates from real contributions,
      // benefits and investment return — but the SEED still fell back to `totalAssets −
      // equityCapital`, so week 0 anchored the obligation on the holdings after all, which is the
      // circularity `INSTITUTIONAL_OPENING_BOOK_SHARE`'s own doc names as the reason it survives.
      //
      // The stock follows from the age structure and nothing else. In a stationary population the
      // entitlement stock is the contribution FLOW times how long a contributed dollar stays in
      // the system: it waits out the rest of a working life and is then drawn down over the years
      // a retiree actually has, so averaged over contribution ages that is
      // `(workingLife + drawdown) / 2`. The flow is the life-cycle saving rate the cohorts
      // already use — the retired share of the population (§7.181, §7.169) — so no number is
      // stated here that the demography does not already say.
      const pensionEntitlementStockLocal = (() => {
        const retiredShare = Math.max(0, Math.min(1,
          reg.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0.2));
        const annualContributionsLocal = Math.max(0, reg.estimatedHouseholdIncomeLocal) * retiredShare;
        const workingLifeYears = Math.max(1, RETIREMENT_AGE_YEARS - WORKFORCE_ENTRY_AGE_YEARS);
        const drawdownYears = Math.max(1, remainingLifeExpectancyYears(RETIREMENT_AGE_YEARS));
        return annualContributionsLocal * ((workingLifeYears + drawdownYears) / 2);
      })();
      const pensionShareNorm = regionalInstCompanies
        .filter(c => c.institutionalEntityType === 'PENSION_FUND')
        .reduce((a, c) => a + (c.institutionalMarketShare ?? 0.33), 0);
      // The fund's own capital is its SURPLUS against what it owes — the number that means
      // something — and its assets are the two together. Every other entity type keeps the
      // sector-share sizing: an asset manager owes nobody an entitlement, it runs other people's
      // money, and what anchors IT is HH4's household fund holdings (COH2's remaining half).
      const isPensionFund = role === 'PENSION_FUND';
      const beneficiaryLiabilityLocal = isPensionFund && pensionShareNorm > 0
        ? pensionEntitlementStockLocal * ((comp.institutionalMarketShare ?? 0.33) / pensionShareNorm)
        : undefined;
      const totalAssetsLocal = beneficiaryLiabilityLocal !== undefined
        ? beneficiaryLiabilityLocal / (1 - INSTITUTIONAL_CAPITAL_RATIO)
        : totalMacroAssetsLocal * share;
      const equityCapitalLocal = totalAssetsLocal * INSTITUTIONAL_CAPITAL_RATIO;

      const entCorpShareLocal = rawEntityCorpTargetsLocal.get(comp.id) ?? 0;
      const entSovShareLocal = rawEntitySovTargetsLocal.get(comp.id) ?? 0;
      const entLoanShareLocal = rawEntityLoanTargetsLocal.get(comp.id) ?? 0;
      const entEquityShareLocal = (macroSector.equityHoldingsLocal || 0) * share;

      const itemizedHoldings = [
        ...attributeCorpBondHoldingsProportionally(entCorpShareLocal),
        ...attributeSovBondHoldingsProportionally(entSovShareLocal),
        ...attributeLoanHoldingsProportionally(entLoanShareLocal),
        ...attributeEquityHoldingsProportionally(entEquityShareLocal),
      ];

      const seededEntity: InstitutionalEntity = {
        id: comp.id,
        name: comp.name,
        ticker: comp.ticker,
        region: regionId,
        entityType: role,
        // HF1: a hedge fund's strategy decides which markets it is actually in.
        hedgeFundStrategy: comp.hedgeFundStrategy,
        financialStatementProfile: comp.financialStatementProfile,
        beneficiaryLiabilityLocal,
        // Real opening cash: the entity's own policy cash weight against its own book. Every
        // clearing fill from here on settles against this balance.
        // §5-CLOSE O2: plus the equity budget the issue could not absorb (see equityFillRatio).
        equityCapitalLocal,
        stockPrice: comp.stockPrice,
        itemizedHoldings,
        assetAllocationTarget: targetFor(role, comp.hedgeFundStrategy),
        isDefaulted: comp.isDefaulted,
        historicalPrices: [...(peekSeedRing(comp, 'price') ?? [])],
      };
      // §5-WIRES A3.2: real opening cash — the entity's own policy cash weight against its own
      // book, plus the equity budget the issue could not absorb (§5-CLOSE O2, equityFillRatio);
      // the seed opens its account with it at assembly.
      stashOpeningCash(seededEntity, totalAssetsLocal * targetFor(role, comp.hedgeFundStrategy).cashPct + entEquityShareLocal * (1 - equityFillRatio));
      institutionalEntities.push(seededEntity);
    });

    // The same effective rate the macro bootstrap uses, so the seed's after-tax shape matches
    // what stage 08 will produce from week 1.
    // TAXR: an institution is taxed on its earnings like any other company, so it opens on the
    // same rate rather than on a second copy of the number (rule 4).
    const INSTITUTIONAL_EFFECTIVE_TAX_RATE = EFFECTIVE_TAX_RATE;
    // ---- HH1b: seed an institution at the size it actually manages (§7.4, seed shape = engine
    // shape). The Company shell and the InstitutionalEntity are the SAME firm, and their two
    // notions of AUM disagreed: the generator seeded `aumLocal` as a multiple of an operating
    // company's revenue, while the entity's `totalAssetsLocal` is its real marked book. Stage 08
    // reads the entity, so week 1 replaced the seeded revenue with a fee on a book orders of
    // magnitude larger — the company did not grow, the model switched formulas.
    //
    // Measured: the four hedge funds' fee revenue rose 29x in sixty weeks while their book SHRANK
    // 76.8B → 62.4B, and those four were the last four violations in the invariants harness,
    // logged for a year as "#18 revenue runaway". It was never a runaway; it was a cold start.
    regionalInstCompanies.forEach(comp => {
      const isManager = comp.financialStatementProfile === 'ASSET_MANAGER';
      const isInsurer = comp.financialStatementProfile === 'INSURER';
      if (!isManager && !isInsurer) return;
      const entity = institutionalEntities.find(e => e.id === managedEntityIdsOf(comp)[0]);
      if (!entity) return;
      if (isManager && !((comp.managementFeeRate ?? 0) > 0)) return;
      // A manager's revenue is a fee on the book it runs; an insurer's is the premium its own
      // capital lets it write. Both read the entity, because both ARE the entity.
      if (isManager) comp.aumLocal = seedInstitutionTotalAssetsLocal(entity, openingCashOf(entity));
      const revenueLocal = isManager
        ? Math.max(10, comp.aumLocal! * comp.managementFeeRate!)
        : Math.max(10, Math.max(0, entity.equityCapitalLocal) * PREMIUM_TO_SURPLUS_RATIO);
      if (isInsurer) {
        comp.insurancePremiumsWrittenLocal = revenueLocal;
        comp.technicalReservesLocal = Math.max(0, seedInstitutionTotalAssetsLocal(entity, openingCashOf(entity)) - entity.equityCapitalLocal);
      }
      const ebitdaLocal = revenueLocal * (isManager ? 0.35 : 0.15);
      comp.annualRevenue = revenueLocal;
      comp.baselineAnnualRevenue = revenueLocal;
      stashSeedRevenueHistory(comp, [revenueLocal]); // §4.C II.5: ring-seeded at drain
      comp.ebitda = ebitdaLocal;
      comp.ebit = Math.max(1, ebitdaLocal);
      comp.netIncome = comp.ebit * (1 - INSTITUTIONAL_EFFECTIVE_TAX_RATE);
      comp.eps = seedIssuedSharesOf(comp) > 0 ? Number((comp.netIncome / seedIssuedSharesOf(comp)).toFixed(2)) : 0;
    });
    // §5-CLOSE O2: THE REGISTER CANNOT EXCEED THE ISSUE. Every entity's equity was allocated
    // from its own budget in proportion to the caps, and the budgets together can exceed the
    // stock that exists (measured: 2.6x the issue of the biggest names, 242 firms over-held, 94B
    // of stock nobody issued at week 0). What the issue cannot absorb stays as the entity's CASH.
    {
      const issuedById = new Map(regionCompanies.map((c) => [c.id, seedIssuedSharesOf(c)]));
      const heldById = new Map<string, number>();
      institutionalEntities.forEach((e) => { if (e.region !== regionId) return; e.itemizedHoldings.forEach((h) => { if (h.instrumentType === 'EQUITY' && h.quantityShares) heldById.set(h.instrumentId, (heldById.get(h.instrumentId) ?? 0) + h.quantityShares); }); });
      institutionalEntities.forEach((e) => {
        if (e.region !== regionId) return;
        let freedLocal = 0;
        e.itemizedHoldings = e.itemizedHoldings.map((h) => {
          if (h.instrumentType !== 'EQUITY' || !h.quantityShares) return h;
          // §3.13-BOOK (c2a): the row names an EQUITY, and a listed equity's id is its issuer's.
          const issuerId = equityIssuerId(h.instrumentId);
          const held = heldById.get(issuerId) ?? 0; const issued = issuedById.get(issuerId) ?? 0;
          if (!(issued > 0) || held <= issued) return h;
          const keep = issued / held;
          freedLocal += h.quantityOrNotionalLocal * (1 - keep);
          return { ...h, quantityShares: h.quantityShares * keep, quantityOrNotionalLocal: h.quantityOrNotionalLocal * keep , units: h.quantityShares * keep};
        });
        if (freedLocal > 0) stashOpeningCash(e, openingCashOf(e) + freedLocal);
      });
    }

    // ---- HH5: ONE employment identity at week 0 (§7.4). ----
    // This block used to end in a NOTE that said, in short, "these pools imply 11-14%
    // unemployment while the region reports 4.5%; reconciling them is the labor market's own
    // rebuild, not this item." This IS that rebuild, so the reconciliation happens here.
    //
    // Three primitives were seeded independently and never made to agree: the generator's own
    // firm headcounts, government employment as a share of population, and the private SEGMENTS
    // as a share of total employment. The segments are the right residual — they ARE the
    // "everything that is not a named firm or the government" tier — so their employment is
    // what the reported rate requires once the other two are counted.
    const totalLaborForce = reg.totalPopulation * (1 - reg.nonEmployablePct) * reg.laborForceParticipation;
    // HH: employment is what employers actually employ, and UNEMPLOYMENT IS THE RESIDUAL — not
    // the other way round. The block deleted here did the reverse: it took a target employment
    // level from the region's assumed unemployment rate and handed the pools whatever the real
    // firms and the government did not employ, which is how the tier came to carry headcount its
    // revenue could not pay for. The rate is now read off the real employment stock below.

    // The labor-force MIX opens at the mix employers actually demand. It used to be that mix
    // times a table of per-occupation "slack multipliers" (1.04 to 1.12), and that arbitrary
    // differential was not harmless: it left TECHNICAL_ENGINEERING with literally zero job
    // seekers against 169k unfilled vacancies and wage growth pinned at its +13% cap, while
    // GENERAL carried 678k unemployed and falling wages — a structural mismatch the world was
    // BORN with, indistinguishable at a glance from one it had produced. Uniform slack means
    // any mismatch after week 0 is one the economy really generated, which is what the
    // retraining flow exists to work on.
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.smePools, regionId, reg.governmentEmployment) as Record<OccupationType, number>;
    const week1DemandTotal = Object.values(week1OccDemand).reduce((s, v) => s + v, 0);
    (Object.keys(reg.occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
      reg.occupationLaborForceShare[occ] = week1DemandTotal > 0
        ? (week1OccDemand[occ] ?? 0) / week1DemandTotal
        : 0.2;
    });

    // The pools then open through the SAME reconciler the engine runs every week — §7.4 in its
    // strictest form: not "the same shape" but the same code — and the vacancy stock opens at
    // the market's rest point rather than at zero (see restingVacancies).
    reconcileEmploymentView(reg, regionCompanies.filter(c => isActiveCompany(c)));
    (Object.keys(reg.occupationPools) as OccupationType[]).forEach((occ) => {
      const supply = totalLaborForce * (reg.occupationLaborForceShare[occ] ?? 0.2);
      const employedInOcc = reg.occupationPools[occ].employed;
      reg.occupationPools[occ].vacancies = Math.round(
        restingVacancies(employedInOcc, Math.max(1, supply - employedInOcc))
      );
    });
    // Once the vacancy stock exists, read the market's statistics off it (the first call above
    // saw zero vacancies and would otherwise leave tightness reading 0.00 at week 0).
    reconcileEmploymentView(reg, regionCompanies.filter(c => isActiveCompany(c)));

    // LAB — the seed wage level is the one the region's employers can AFFORD (§7.4: the seed
    // opens in the shape the engine maintains).
    //
    // The wage table is scaled so that paying it across the BASELINE OCCUPATION MIX costs the
    // IND-R5 (§7.4: seed by the engine's own code). A bank's revenue was a Pareto draw from the
    // same small-firm curve every company uses, with no relation to the balance sheet it was
    // about to be given: measured, a USA bank opened at 1.68B against 7.47B of NIM-implied
    // revenue, and `bankProfile`'s 85/15 blend then spent YEARS climbing toward its real scale.
    // Two costs, both real. Every consumer read that convergence as output growth — the labor
    // market's hiring signal among them. And its payroll was sized for the bank it is, not the
    // bank its revenue said it was: 11.6k staff costing ~7.5B a year against 1.68B of revenue,
    // so the first week's P&L showed a loss so large the affordability rule cut the entire
    // workforce to the one-employee floor by week 3 (§7.108, §7.109).
    //
    // A bank's opening revenue IS what its opening balance sheet earns.
    banksOf(regionCompanies).forEach((c) => {
      const sheet = c.bankBalanceSheet!;
      const sovLocal = seedBankBookLocalOf(sheet); // §3.13-BOOK d3b: the seed's stash, issued by wire below
      const earningAssetsLocal = loanBooksOf(sheet, facilityBookOf(seedV2, c.id)) + sovLocal;
      const nimRevenueLocal = earningAssetsLocal * reg.bankingSector.netInterestMarginPct;
      if (!(nimRevenueLocal > 0)) return;
      c.annualRevenue = Math.round(nimRevenueLocal);
      c.baselineAnnualRevenue = c.annualRevenue;
      c.ebitda = Math.round((c.annualRevenue * (c.baselineEbitdaMargin ?? 0.40)));
      c.ebit = c.ebitda;
      stashSeedRevenueHistory(c, []); // §4.C II.5: explicitly-empty history
    });

    // labor share of output — a per-capita accounting construction. It is then paid per EMPLOYED
    // WORKER by firms whose earnings are their own, and the two do not agree: the table implied a
    // payroll the firms did not have the output to fund. That was invisible while wages were not
    // a real cost; once they were, it became a layoff cascade.
    //
    // So the level is solved from the employers' own books instead. Payroll scales linearly in
    // the wage index, so the index at which the region's firms exactly earn their cost of capital
    // has a closed form:
    //
    //     w = [ SUM ebitda + SUM basePayroll - SUM capitalCharge ] / SUM basePayroll
    //
    // Above it firms are shedding from week 1; below it they are hiring. The labor market moves
    // it from there like any other price — this only decides where the world opens.
    const baseAnnualWageLocal = getBaseAnnualWageLocal(regionId);
    {
      const unitPools = Object.fromEntries((Object.keys(reg.occupationPools) as OccupationType[])
        .map(o => [o, { wageIndex: 1 }])) as Record<OccupationType, { wageIndex: number }>;
      let ebitdaLocal = 0; let basePayrollLocal = 0; let capitalChargeLocal = 0;
      regionCompanies.filter(c => !c.isBankEntity && isActiveCompany(c)).forEach(c => {
        ebitdaLocal += c.ebitda;
        basePayrollLocal += weeklyWageBillLocal(
          c.employeeCount, SECTOR_OCCUPATION_MIX[c.sector] ?? { GENERAL: 1.0 },
          baseAnnualWageLocal, unitPools, 1.0
        ) * 52;
        const netPpeLocal = Math.max(0, (c.grossPPELocal ?? 0) - (c.accumulatedDepreciationLocal ?? 0));
        capitalChargeLocal += netPpeLocal * Math.max(0, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + (c.beta ?? 1) * EQUITY_RISK_PREMIUM);
      });
      if (basePayrollLocal > 0) {
        const affordableIndex = (ebitdaLocal + basePayrollLocal - capitalChargeLocal) / basePayrollLocal;
        if (affordableIndex > 0 && isFinite(affordableIndex)) {
          (Object.keys(reg.occupationPools) as OccupationType[]).forEach((occ) => {
            reg.occupationPools[occ].wageIndex = Number(affordableIndex.toFixed(5));
          });
        }
      }
    }
    const realWageIncomeLocal = (Object.keys(reg.occupationPools) as OccupationType[]).reduce(
      (sum, occ) => sum + baseAnnualWageLocal[occ] * reg.occupationPools[occ].wageIndex * reg.occupationPools[occ].employed, 0
    );
    const realEmployedForWages = (Object.keys(reg.occupationPools) as OccupationType[])
      .reduce((sum, occ) => sum + reg.occupationPools[occ].employed, 0);
    const realUnemploymentBenefitsLocal = (Object.keys(reg.occupationPools) as OccupationType[]).reduce((sum, occ) => {
      const unemployedInPool = totalLaborForce * (reg.occupationLaborForceShare[occ] ?? 0) - reg.occupationPools[occ].employed;
      return sum + baseAnnualWageLocal[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
    }, 0);
    // §7.4: this restatement is the SECOND computation of household income at seed (the macro
    // bootstrap does the first), so it must read the same transfer number or it silently
    // overwrites the first with a different economy. It used to re-derive transfers from the
    // spending budget while omitting debt service — a PUB1a leftover that won for six slices.
    // PUB3b: there is now one transfer number and both callers read it.
    const seedObligations = governmentObligationsWeeklyLocal({
      interestWeeklyLocal: reg.governmentInterestWeeklyLocal ?? 0,
      payrollWeeklyLocal: reg.governmentPayrollWeeklyLocal ?? 0,
      unemploymentBenefitsWeeklyLocal: realUnemploymentBenefitsLocal / 52,
      retiredPopulation: reg.totalPopulation * (reg.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0),
      averageAnnualWageLocal: realEmployedForWages > 0 ? realWageIncomeLocal / realEmployedForWages : 0,
      fiscalStanceScore: reg.fiscalStanceScore,
    });
    reg.governmentSpendingWeeklyLocal = Math.round(seedObligations.totalLocal);
    reg.estimatedHouseholdIncomeLocal = Math.round(computeHouseholdDisposableIncomeLocal({
      wageIncomeLocal: realWageIncomeLocal,
      transfersWeeklyLocal: seedObligations.transfersLocal,
    }));

    // With income now on its real footing, restate the reported GDP series to what this
    // economy's own components actually sum to. estimatedNominalGdpLocal stays the supply-side
    // potential-output anchor it always was (it sizes the wage table, the government's budget
    // and the bank balance-sheet ratios); what gets reported, compared year-over-year and fed to
    // the Taylor rule is the real bottom-up measure, and it has to start where the real economy
    // starts or the difference is read as growth.
    const regionFirms = regionCompanies.filter(isActiveCompany);
    const trackedInvestmentLocal = regionFirms.reduce((sum, c) => sum + c.maintenanceCapex + c.growthCapex, 0);
    const trackedEmployment = regionFirms.reduce((sum, c) => sum + c.employeeCount, 0);
    const privateEmployment = (reg.smePools || []).reduce((sum, seg) => sum + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + privateEmployment) / trackedEmployment : 1;
    const { gdpLocal: bottomUpGdpLocal } = computeExpenditureGdpLocal({
      householdIncomeLocal: reg.estimatedHouseholdIncomeLocal,
      savingsRate: reg.householdState.savingsRate,
      investmentLocal: trackedInvestmentLocal * investmentScaleFactor,
      // PUB1e/PUB3b: G is the procurement budget the government will actually bid, annualised —
      // the same number stage 05 bids and stage 11 debits the account by.
      governmentPurchasesLocal: seedObligations.procurementBudgetLocal * 52,
      netExportsLocal: reg.exportsLocal - reg.importsLocal,
    });
    // Build the real consumer basket now that every sub-unit carries its bootstrapped price.
    // Weights are what households actually spend on each good; base prices are today's.
    reg.cpiBasket = buildCpiBasket(reg, 1, CPI_BASE_LEVEL);

    reg.derivedNominalGdpLocal = Math.round(bottomUpGdpLocal);
    reg.lastWeekNominalGdpLocal = reg.derivedNominalGdpLocal;
    const nominalTrendGrowth = reg.potentialGdpGrowth + reg.targetInflation;
    reg.nominalGdpHistory = reg.nominalGdpHistory.map((_, i, arr) =>
      Math.round((reg.derivedNominalGdpLocal * Math.pow(1 + nominalTrendGrowth, (i - (arr.length - 1)) / 52)))
    );
  });

  // XB3a-2: the logistics sector, which this economy did not have. The fleet is sized by running
  // the sourcing intent against the bootstrap economy, and the carriers' books are built on the
  // rate that auction actually clears — so freight opens somewhere a week of this simulation
  // would produce rather than on an artifact of a guessed fleet (§7.4).
  const seededUnitMassTonnes = seedUnitMassTonnes(regions);
  const seedFxToUsd = (regionId: RegionId) => getFxToUsd(fxPairs, regionId);
  // §3.13c: the world opens at the seed's rates, so the very first payment across a border
  // converts at a real number rather than the parity the table opens at.
  publishFxRatesNow(seedV2, fxPairs);
  const carrierIds = new Set<Ticker>(companies.map(c => c.ticker));
  const carrierNames = new Set<string>(companies.map(c => c.name));
  const carriers = generateCarriers(regions, seededUnitMassTonnes, seedFxToUsd, carrierIds, carrierNames);
  companies.push(...carriers);
  const seededFreightRates = (() => {
    const { bookings } = seedFreightDemand(regions, seededUnitMassTonnes, seedFxToUsd);
    // Open the regions on their real trade position rather than at zero exports and zero imports.
    // Net exports are a real component of the expenditure identity, and starting them at zero made
    // week 1 read the entire structural balance as a collapse in output. This is the engine's own
    // sourcing decision, taken once at seed prices — not a parallel formula (§7.4).
    (Object.keys(regions) as RegionId[]).forEach(r => { regions[r].exportsLocal = 0; regions[r].importsLocal = 0; });
    bookings.forEach(b => {
      if (b.from === b.to) return;
      const exWorks = Number(regions[b.from].categoryDemand[b.subUnitId]?.unitPriceLocal) || 0;
      const valueLocal = localToUsd(b.units * exWorks, b.from, seedFxToUsd) * 52;
      regions[b.from].exportsLocal += valueLocal;
      regions[b.to].importsLocal += valueLocal;
    });
    (Object.keys(regions) as RegionId[]).forEach(r => {
      regions[r].exportsLocal = Math.round(regions[r].exportsLocal);
      regions[r].importsLocal = Math.round(regions[r].importsLocal);
      regions[r].tradeBalance = regions[r].exportsLocal - regions[r].importsLocal;
    });
    const clearing = runFreightClearing({
      carriers, regions, unitMassTonnes: seededUnitMassTonnes, bookings, fxToUsd: seedFxToUsd,
    });
    // A lane no carrier serves still needs a price to be evaluated against, or a route can never
    // open: what it would cost to sail is the honest answer until somebody does.
    return { ...specMarginalRatesByLane(regions, seededUnitMassTonnes), ...clearing.ratePerTonneLaneMoneyByLane };
  })();

  // The consignments already at sea on the day the simulation opens.
  const seededPipeline: InTransitShipment[] = [];
  {
    const { bookings } = seedFreightDemand(regions, seededUnitMassTonnes, seedFxToUsd);
    const buyersByRegion = {} as Record<RegionId, typeof companies>;
    (Object.keys(regions) as RegionId[]).forEach(r => {
      buyersByRegion[r] = companies.filter(c => c.region === r && (c.productLines || []).length > 0);
    });
    bookings.forEach(b => {
      const transit = Math.round(laneTransitWeeks(b.from, b.to, laneDistanceNm(b.from, b.to)));
      if (transit <= 0) return;
      const pool = buyersByRegion[b.to];
      if (!pool || pool.length === 0) return;
      const exWorks = Number(regions[b.from].categoryDemand[b.subUnitId]?.unitPriceLocal) || 0;
      const perUnit = convertLocal(exWorks, b.from, b.to, seedFxToUsd);
      // One week's worth arriving in each of the next `transit` weeks: what a lane in steady
      // state is carrying.
      for (let wk = 1; wk <= transit; wk++) {
        const buyer = pool[(wk + b.subUnitId.length) % pool.length];
        seededPipeline.push({
          buyerId: buyer.id,
          // Step 8: the seller is a party this model knows — the origin's segment pool of the good's
          // industry (the seed's lots are paid for; the key names who they came from).
          sellerKey: `PRIVATE:${b.from}:${industryOfSubUnit(b.subUnitId) ?? b.subUnitId}`,
          subUnitId: b.subUnitId,
          units: b.units / transit,
          landedCostPerUnit: perUnit,
          arrivalWeek: wk,
        });
      }
    });
  }

  // XB5: the central banks' FX reserves, seeded at a real reserve-adequacy standard — three
  // months of import cover, which is the metric reserve managers actually hold to — and split
  // across the currencies each region actually buys from. A level, not a target: from week 1
  // intervention spends and accumulates them, and a bank at zero stops being able to bid.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const cb = regions[regionId].centralBankSheet;
    if (!cb) return;
    const quarterlyImportsLocal = (regions[regionId].importsLocal ?? 0) / 4;
    if (!(quarterlyImportsLocal > 0)) { cb.fxReservesByRegion = {}; return; }
    const sourcesLocal: Record<string, number> = {};
    let totalSourced = 0;
    (Object.keys(regions) as RegionId[]).forEach(origin => {
      if (origin === regionId) return;
      const x = regions[origin].exportsLocal ?? 0;
      sourcesLocal[origin] = x;
      totalSourced += x;
    });
    const book: Record<string, number> = {};
    (Object.keys(sourcesLocal) as RegionId[]).forEach(origin => {
      const share = totalSourced > 0 ? sourcesLocal[origin] / totalSourced : 1 / 3;
      book[origin] = Math.round((quarterlyImportsLocal * share));
    });
    cb.fxReservesByRegion = book;
  });

  // SETL5: an institution banks like anyone else. Placed here, after every entity exists and
  // after the bank sheets are built, so the relationship and the reserves behind these balances
  // open in the shape the weekly engine maintains (§7.4). Until now institutional cash sat
  // outside the banking system, which is the blind spot that let a 64B double-count pass (§7.90).
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const reg = regions[regionId];
    const regionBanks = banksOf(companies, regionId);
    if (regionBanks.length === 0) return;
    const houseBanks = mandateAllocator(regionBanks.map(b => ({
      id: b.id, bankMarketShare: b.bankMarketShare, capacityLocal: b.bankBalanceSheet!.bankEquityLocal,
    })));
    const byBank = assignHouseBanks(
      institutionalEntities.filter(e => e.region === regionId), houseBanks, openingCashOf);
    regionBanks.forEach(b => {
      const instLocal = Math.round(byBank.get(b.ticker) ?? 0);
      stashOpeningCash(b.bankBalanceSheet!, openingCashOf(b.bankBalanceSheet!) + instLocal);
      applyBankFundingSplit(b.bankBalanceSheet!, openingCashOf(b.bankBalanceSheet!), facilityBookOf(seedV2, b.id), Math.round(openingCashOf(reg.householdState) * (b.bankMarketShare ?? 1 / regionBanks.length)), seedBankBookLocalOf(b.bankBalanceSheet!));
    });
  });

  const allGeneratedCompanies = companies;
  // Calibrate the working linkage from the FROZEN base shares (§6: the old in-place mutation
  // meant a second world built in the same process re-calibrated already-calibrated values).
  Object.keys(BASE_COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
    const base = BASE_COMMODITY_CATEGORY_LINKAGE[commodityId];
    const calibratedShare = calibrateIntensityShare(commodityId, allGeneratedCompanies, regions, base.subUnitId, seedFxToUsd);
    COMMODITY_CATEGORY_LINKAGE[commodityId] = { ...base, intensityShare: calibratedShare };
  });
  // §3.22: the commodities are seeded AFTER the linkage is calibrated — the seed print (spot, the
  // week's units, the balance word) is a read of the sub-unit each one is a share of.
  const commodities = getInitialCommodities(regions, seedFxToUsd);

  // G3b: the dealers the player trades with ARE the named banks' desks.
  const dealers = dealersFromBanks(seedV2, (b) => openingCashOf(b.bankBalanceSheet!), (b) => facilityBookOf(seedV2, b.id), (b) => seedBankBookLocalOf(b.bankBalanceSheet!), companies);
  const compositeIndices = calculateCompositeIndices(companies, regions, (c) => marketCapOf(c, seedIssuedSharesOf(c)), commodities, undefined, seedV2, 1);
  const recentIPOs: { ticker: Ticker; name: string; category: string; week: number }[] = [];
  const recentMergers: { acquirerTicker: Ticker; acquirerName: string; targetTicker: Ticker; targetName: string; week: number; dealValueLocal: number }[] = [];

  const startingCash = 25_000_000; // $25M USD Hedge Fund Starting Capital
  const portfolio: Portfolio = {
    cashLocal: startingCash,
    startingCapitalLocal: startingCash,
    navLocal: startingCash,
    previousNavLocal: startingCash,
    historicalNav: [startingCash],
    historicalBenchmarks: [
      {
        week: 1,
        nav: startingCash,
        benchmark6040: startingCash,
        cashHurdle: startingCash,
      },
    ],
    positions: [],
    closedPositionsCount: 0,
    realizedPnLTotal: 0,
    cumulativeAttribution: {
      carryLocal: 0,
      macroRatesLocal: 0,
      creditSpreadLocal: 0,
      equityDeltaLocal: 0,
      volThetaLocal: 0,
    },
    lastWeekAttribution: {
      carryLocal: 0,
      macroRatesLocal: 0,
      creditSpreadLocal: 0,
      equityDeltaLocal: 0,
      volThetaLocal: 0,
    },
    totalRequiredMarginLocal: 0,
    maintenanceMarginLocal: 0,
    marginUtilizationPct: 0,
    isMarginCall: false,
    marginCallWarning: null,
    totalLeverage: 0,
    netDeltaLocal: 0,
    netDV01Local: 0,
  };

  

  // ---- HC4: private equity sponsors become real owners ----
  // The sponsor-style leverage has existed since HC1 (it is where the economy's B/BB paper
  // lives); HC4 gives it its real owner. Two funds per region hold the levered cohort; the LPs
  // behind them are the same real institutions, holding fund interests recorded under the same
  // doctrine as HC2's float seeding — the stakes existed, the owners were unmodeled, no cash
  // moves at recognition. Committed-but-undrawn capital is a real claim on named LPs that HC6's
  // deal flow will draw through the budget machinery like any other payment.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const firms = privateFirmsByRegion.get(regionId) ?? [];
    const sponsorable = firms.filter(f => f.leverage >= 4.2 && !f.isDefaulted);
    if (sponsorable.length === 0) return;
    const lps = institutionalEntities.filter(e => e.region === regionId &&
      (e.entityType === 'INSURER' || e.entityType === 'PENSION_FUND' || e.entityType === 'ASSET_MANAGER'));
    const lpWeights = new Map(lps.map((e) => [e.id, seedInstitutionTotalAssetsLocal(e, openingCashOf(e))]));
    const lpWeightSum = lps.reduce((a, e) => a + lpWeights.get(e.id)!, 0) || 1;
    // The seed marks the sponsored stakes at the same multiple the running mark uses — what the
    // region's LISTED comps are worth per dollar of EBITDA — so week 0's NAV is not a different
    // valuation from week 1's. A bare `8 *` here and in the weekly mark was one company valued
    // two ways, and it made every seeded holding's entry basis a number nothing had cleared.
    // §3.13-READ C1: THE OBJECT, DELIBERATELY. This runs inside `buildSeededGameState`, before
    // `openSeededBooks` opens the tranche store, so `debtTranches` is not a mirror here — it is
    // what the generator wrote, and what the store is about to be filled FROM.
    const seedEvMultiple = publicComparableEvMultiple(totalDebtOf, (c) => marketCapOf(c, seedIssuedSharesOf(c)), regionId, companies);
    const stakeValue = (f: Company) => Math.max(0, seedEvMultiple * f.ebitda - totalDebtOf(f)) * 0.75;

    // WS7: one money market fund per region. Born EMPTY — no fabricated share stock (§7.4's
    // seed-shape rule read the other way: the honest seed for a market the flows create is
    // zero, the same doctrine as WS5's CP program). Corporate sweeps and the household
    // yield-gap flow build its book; its bills/repo/RRP deployment rides the sleeve machinery
    // every entity already has.
    institutionalEntities.push({
      id: moneyFundEntityId(regionId),
      name: `${regionId} Government Money Market Fund`,
      ticker: asTicker('MMF1'),
      region: regionId,
      entityType: 'MONEY_MARKET_FUND',
      equityCapitalLocal: 0,
      stockPrice: 0,
      itemizedHoldings: [],
      assetAllocationTarget: allocationTargetFor('MONEY_MARKET_FUND'),
      isDefaulted: false,
      historicalPrices: [],
      mmfSharesOutstandingLocal: 0,
      mmfNetYieldAnnual: 0,
    });

    // ---- ETF: one index fund per index, sponsored by the region's asset managers ----
    // Born EMPTY, same doctrine as the money fund above: a fund's shares are created by real
    // demand through a real authorised participant, so seeding a share stock would be inventing
    // the flow the mechanism exists to produce.
    //
    // Sponsorship interleaves the region's index list across its managers, so each house runs a
    // MIX of equity and credit rather than one becoming the equity shop and another the bond
    // shop. That is what real fund complexes look like, and it is what "no monolines" means.
    const regionManagers = institutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'ASSET_MANAGER'
    );
    if (regionManagers.length > 0) {
      const regionIndexes = INDEX_DEFINITIONS.filter((d) => d.region === regionId);
      // Global funds are sponsored out of the largest house in each of the first regions, so the
      // global complex is not concentrated in one manager either.
      const globalIndexes = regionId === 'USA'
        ? INDEX_DEFINITIONS.filter((d) => !d.region)
        : [];
      [...regionIndexes, ...globalIndexes].forEach((def, i) => {
        const sponsor = regionManagers[i % regionManagers.length];
        const expenseClass = def.assetClass;
        institutionalEntities.push({
          id: indexFundEntityId(def.id),
          name: `${def.name} Index Fund`,
          ticker: asTicker(`${def.id.replace(/_/g, '').slice(0, 5)}X`),
          region: regionId,
          entityType: 'ETF',
          equityCapitalLocal: 0,
          stockPrice: 0,
          itemizedHoldings: [],
              assetAllocationTarget: allocationTargetFor('ETF'),
          isDefaulted: false,
          historicalPrices: [],
          etf: {
            indexId: def.id,
            sponsorEntityId: sponsor.id,
            expenseRatioAnnual: ETF_EXPENSE_RATIO_ANNUAL[expenseClass],
            unmetFlowShare: 0,
          },
        });
      });
    }

    for (let fundIdx = 0; fundIdx < 2; fundIdx++) {
      const portfolio = sponsorable.filter((_, i) => i % 2 === fundIdx);
      if (portfolio.length === 0) continue;
      // §3.13-BOOK (c2b): the FUND is an entity; its LP interest is the instrument keyed by it.
      const fundId = peFundEntityId(regionId, fundIdx + 1);
      const investedLocal = Math.round(portfolio.reduce((a, f) => a + stakeValue(f), 0));
      // Real funds keep ~a third of commitments undrawn — the dry powder HC6 calls.
      const committedLocal = Math.round(investedLocal / 0.65);
      portfolio.forEach(f => {
        // The entry basis is recorded, not defaulted: these stakes were bought at the market the
        // world opens with, and HC6's exit test asks whether the market later pays MORE than that.
        f.ownership = {
          founderPct: 0.25, peSponsorId: fundId, peSponsorPct: 0.75,
          acquiredWeek: 0, entryEvMultiple: seedEvMultiple,
        };
      });
      institutionalEntities.push({
        id: fundId,
        name: `${regionId} Capital Partners ${['I', 'II'][fundIdx]}`,
        ticker: asTicker(`PEF${fundIdx + 1}`),
        region: regionId,
        entityType: 'PRIVATE_EQUITY',
        equityCapitalLocal: investedLocal,
        stockPrice: 0,
        itemizedHoldings: [],
          assetAllocationTarget: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
        isDefaulted: false,
        historicalPrices: [],
        peFund: {
          portfolioCompanyIds: portfolio.map(f => f.id),
        },
      });
      // §3.13-BOOK d4c-vi: the LPs' commitments are rows of the contract store, written by wire at
      // `openSeededBooks` once the world they resolve against exists; the stash carries them there.
      stashSeedCommitments(institutionalEntities[institutionalEntities.length - 1], lps.map(e => ({
        fundId, lpEntityId: e.id, regionId,
        committedLocal: Math.round(committedLocal * (lpWeights.get(e.id)! / lpWeightSum)),
        drawnLocal: Math.round(investedLocal * (lpWeights.get(e.id)! / lpWeightSum)),
      })));
      lps.forEach(e => {
        const interestLocal = Math.round(investedLocal * (lpWeights.get(e.id)! / lpWeightSum));
        if (interestLocal > 1) {
          e.itemizedHoldings.push({ instrumentId: peFundInterestId(regionId, fundIdx + 1), instrumentType: 'PE_FUND_INTEREST', issuerRegion: regionId, quantityOrNotionalLocal: interestLocal, units: interestLocal });
        }
      });
    }
  });

  // ---- HC2: the private tier's tradable float seeded onto its real holders ----
  // Runs last because it needs the institutional entities built above. The paper existed before
  // the market did — the claims were simply held by nobody the model named. Institutions hold
  // the tradable share from week 0 in the same proportional shape the clearing engines produce
  // (lesson §7.4), no cash moves (recognising an existing stock, not a purchase), and S11's
  // weekly mark carries the enlarged books from week 1.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const firms = privateFirmsByRegion.get(regionId) ?? [];
    const regionEntities = institutionalEntities.filter(e => e.region === regionId);
    // OWN6 / §7.4: the seed must place exactly the instrument the weekly books clear. 07b
    // excludes commercial paper (07f's market) and 07d excludes bank facilities (they sit on a
    // named bank's itemized book), so the placement here excludes them too — and places the
    // WHOLE remaining stock, which is the float those books now clear (OWN2). It used to place
    // `corpBondOwnership.institutionalShare` of a ladder that included both, so the private
    // tier opened with a gap in the paper that IS traded and a double count in the paper that
    // is not.
    const IG = ['AAA', 'AA', 'A', 'BBB'];
    const sleeve = (t: InstitutionalEntityType, ig: boolean) =>
      ig ? 1 : t === 'INSURER' ? 0.08 : t === 'PENSION_FUND' ? 0.10 : t === 'ASSET_MANAGER' ? 2.0 : 4.0;
    // Per kind, looked up (never switched on): the firm's tranches of the kind and the entity's
    // allocation to it.
    const KIND_TRANCHES: Record<'CORP_BOND' | 'LEVERAGED_LOAN', (t: DebtTranche) => boolean> = {
      CORP_BOND: (t) => t.rateType === 'FIXED' && !t.isCommercialPaper && !t.isBankFacility,
      LEVERAGED_LOAN: (t) => t.rateType === 'FLOATING' && !t.isBankFacility && !t.isCommercialPaper,
    };
    const KIND_PCT: Record<'CORP_BOND' | 'LEVERAGED_LOAN', (e: InstitutionalEntity) => number> = {
      CORP_BOND: (e) => e.assetAllocationTarget.corpBondPct, LEVERAGED_LOAN: (e) => e.assetAllocationTarget.loanPct,
    };
    firms.forEach(f => {
      const ig = IG.includes(f.creditRating);
      (['CORP_BOND', 'LEVERAGED_LOAN'] as const).forEach(kind => {
        const tranches = (f.debtTranches || []).filter(t => KIND_TRANCHES[kind](t) && t.principalLocal > 0);
        const outstanding = tranches.reduce((a, t) => a + t.principalLocal, 0);
        if (outstanding <= 0) return;
        const weights = regionEntities.map(e => seedInstitutionTotalAssetsLocal(e, openingCashOf(e)) * KIND_PCT[kind](e) * sleeve(e.entityType, ig));
        const wSum = weights.reduce((a, b) => a + b, 0) || 1;
        // 13b: the rows name the firm's TRANCHES — each tranche placed across the holders by the
        // same weights (the issuer's total is unchanged; it is the sum).
        tranches
          .forEach(t => {
            regionEntities.forEach((e, i) => {
              const qty = t.principalLocal * (weights[i] / wSum);
              if (qty > 1) {
                e.itemizedHoldings.push({ instrumentId: t.id, instrumentType: kind, issuerRegion: regionId, quantityOrNotionalLocal: Math.round(qty), units: Math.round(qty) });
              }
            });
          });
      });
    });
  });

  // ---- SETL5b: NOTHING is born unbanked. ----
  //
  // The two home-bank passes above run in the middle of this function, and three kinds of holder
  // are created after them: the carriers (freight companies), the money-market funds and the
  // ETFs. They therefore held their money nowhere. Settlement counts a payment to a holder with
  // no bank as UNRESOLVED — money leaving the system — which is exactly the §7.86 defect's
  // shape, and it was measured at 11.7B a WEEK for the money funds alone plus 12 unbanked
  // carriers, hidden until the SME pools started trading with everyone.
  //
  // The relationship is chosen the same way the passes above choose it, and the money is put
  // where it now sits: on the bank's own funding line, with the reserves behind it.
  (Object.keys(regions) as RegionId[]).forEach(regionId => {
    const reg = regions[regionId];
    const regionBanks = banksOf(companies, regionId);
    if (regionBanks.length === 0) return;
    const lateHouseBanks = mandateAllocator(regionBanks.map(b => ({
      id: b.id, bankMarketShare: b.bankMarketShare, capacityLocal: b.bankBalanceSheet!.bankEquityLocal,
    })));
    const lateCorporateByBank = assignHouseBanks(
      companies.filter(c => c.region === regionId && !c.isBankEntity), lateHouseBanks, openingCashOf, true);
    const lateInstitutionalByBank = assignHouseBanks(
      institutionalEntities.filter(e => e.region === regionId), lateHouseBanks, openingCashOf, true);
    if (lateCorporateByBank.size === 0 && lateInstitutionalByBank.size === 0) return;
    regionBanks.forEach(b => {
      const sheet = b.bankBalanceSheet!;
      const corpLocal = Math.round(lateCorporateByBank.get(b.ticker) ?? 0);
      const instLocal = Math.round(lateInstitutionalByBank.get(b.ticker) ?? 0);
      stashOpeningCash(sheet, openingCashOf(sheet) + corpLocal + instLocal);
      applyBankFundingSplit(sheet, openingCashOf(sheet), facilityBookOf(seedV2, b.id), Math.round(openingCashOf(reg.householdState) * (b.bankMarketShare ?? 1 / regionBanks.length)), seedBankBookLocalOf(sheet));
    });
  });

  // §5-WIRES A3.1/A3.6c-ii: the seed opens every firm's and institution's account where it wrote
  // its opening cash — before the close, which reads the banks' corporate and institutional lines
  // off them.
  // A3.1b: a bank has no company account — its money is its reserves (close-seed opens that row).
  companies.forEach((c) => { if (!(c.isBankEntity && c.bankBalanceSheet)) openAccount(seedV2, companyParty(c), currencyOf(c.region), openingCashOf(c)); });
  institutionalEntities.forEach((e) => openAccount(seedV2, { kind: 'INSTITUTION', id: e.id }, currencyOf(e.region), openingCashOf(e)));
  // A3.5: the treasury's account opens at the operating balance the seed sized (macro/initialization.ts).
  (Object.keys(regions) as RegionId[]).forEach((r) => { const cb = regions[r]?.centralBankSheet; if (cb) openAccount(seedV2, { kind: 'GOVERNMENT', region: r }, currencyOf(r), openingCashOf(cb)); });

  // §5-CLOSE C2: the seed closes — depositors fund the banks (wholesale is nobody's and is
  // zero), the central bank's book backs reserves and the treasury's account to the dollar, and
  // every sovereign bond has a holder. Runs after every book exists and before the projection.
  closeSeedMoney(regions, companies, institutionalEntities, seedV2, 1);

  // §3.37-SEED / D2: the accruals open at what the aged ladders have actually accrued — on the
  // rows themselves (§3.13-BOOK f4a/f4b), written by `seedOpeningAccruals` in
  // `createInitialGameState` AFTER `openSeededBooks` has issued the rows it walks.

  const state: GameState = {
    currentWeek: 1,
    year: 2026,
    rngSeed: seed,
    rngState: getRngState(),
    primaryOfferings: [],
    // §7.274: the workout and accrual ledgers open EMPTY and REQUIRED — a state without them
    // no longer compiles, so no load or construction path can silently reset them again.
    estates: [],
    unitMassTonnes: seededUnitMassTonnes,
    freightRatePerTonneLaneMoneyByLane: seededFreightRates,
    // Opens empty: no pair has traded yet, so none has revealed its depth.
    fxPairIlliquidity: {},
    // The pipeline opens FULL, because a running economy's is. Every lane that takes weeks to
    // cross has weeks of cargo on it at any moment, and opening at zero means the first arrivals
    // land a month in — measured, that starved importers of inputs, collapsed the trade the
    // carriers live on, and defaulted the entire fleet by week twelve. A §7.4 cold start, not an
    // economic result. Seeded from the engine's own opening sourcing decision, spread over the
    // weeks each voyage actually takes.
    goodsInTransit: seededPipeline,
    // Born EMPTY: the first weekly pass strikes every index's membership from the market that
    // actually exists, at base 100. Seeding a constituent list here would be a second, stated
    // version of a rule the engine already runs (§7.4's seed-shape rule).
    marketIndexes: [],
    regions,
    fxPairs,
    v2: seedV2,
    companies,
    institutionalEntities,
    commodities,
    compositeIndices,
    recentIPOs,
    recentMergers,
    dealers,
    portfolio,
    newsFeed: [
      {
        id: 'init_welcome',
        week: 1,
        title: 'Institutional Quant Trading Desk Initialized | Jan 05, 2026',
        description:
          'Portfolio unencumbered capital: $25,000,000 USD. Multi-region Nelson-Siegel curves, 200 corporate issuers, 3 Dealer axes, asynchronous quarterly earnings, and full Greeks attribution online.',
        category: 'MACRO',
        impactBadge: '[SYSTEM INIT]',
        urgent: true,
      },
    ],
    turnSummary: null,
    diagnosticsLogs: [
      {
        week: 1,
        // Sim calendar, never wall clock — see 02-region-macro's twin comment.
        timestamp: dateOfWeek(1).toISOString(),
        category: 'EXECUTION',
        message: 'Engine Initialized: Multi-Region Macro <-> Micro Feedback Loop Active (Jan 05, 2026)',
        deltaText: '200 Corporate Issuers • 4 Nelson-Siegel Yield Curves • 9 Commodities Desk',
        data: { capitalLocal: startingCash, regionsCount: 4, firmsCount: companies.length },
      },
    ],
  };
  return state;
}

