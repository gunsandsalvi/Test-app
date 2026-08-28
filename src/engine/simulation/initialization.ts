
import { createSeedCategoryDemandState } from '../../domain/market-microstructure';
import { publicComparableEvMultiple } from './stages/pe-lifecycle';
import { INDEX_DEFINITIONS } from '../../domain/indexes';
import { PREMIUM_TO_SURPLUS_RATIO } from '../../domain/institutions';
import { ETF_EXPENSE_RATIO_ANNUAL } from '../../domain/etf';
import { migrateSmeDebtAtSeed, migrateHouseholdDebtAtSeed } from './stages/bank-lending';
import { isActiveCompany } from '../../domain/company';
import { restingVacancies } from '../../domain/region-macro';
import { centralBankAssetsUSD, centralBankCurrencyResidualUSD, unbackedBankCashUSD } from '../../domain/central-bank';
import { reconcileEmploymentView } from './stages/labor-market';
import { chooseLeadBank } from '../../domain/primary-market';
import { RegionId, Region, Portfolio, OccupationType, Company, COMMODITY_CATEGORY_LINKAGE, BASE_COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, AssetAllocationTarget, ItemizedHolding, INDUSTRY_SUBUNITS } from '../../types';
import { DEALERS } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies, generatePrivateCompanies } from '../companyGenerator';
import { generatePrivateFirmSeeds } from '../bootstrap/private-firms';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand, attributeItemizedHoldings, distributeRealTargetByWeight } from './stages/shared-helpers';
import { unitMassTonnes } from '../../domain/goods-physical';
import { generateCarriers, seedFreightDemand, specMarginalRatesByLane } from '../bootstrap/carriers';
import { runFreightClearing } from './stages/freight-clearing';
import { getFxToUsd } from './stages/06-fx-and-trade';
import { convertLocal, localToUsd } from '../../domain/currency';
import { laneTransitWeeks } from '../../domain/carrier';
import { laneDistanceNm } from '../../domain/geography';
import { InTransitShipment } from './stages/goods-arrival';
import { buildCpiBasket, CPI_BASE_LEVEL } from './stages/price-index';
import { refreshRegionalHoldingsView } from './stages/holdings-view';
import { sovBucketKey } from './stages/shared-helpers';
import { setSimulationSeed, getRngState, DEFAULT_SIMULATION_SEED } from '../rng';
import { deriveSubUnitUnitPrice } from '../bootstrap/category-demand';
import { getBaseAnnualWageUSD } from '../bootstrap/labor-and-wages';
import { decomposeGovernmentSpending, governmentObligationsWeeklyUSD } from '../../domain/government';
import {
  computeExpenditureGdpUSD,
  GOV_PROCUREMENT_SHARE_OF_SPENDING,
  computeHouseholdDisposableIncomeUSD,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';

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
      .map((r) => (regions[r].categoryDemand[subUnit.unitId] as any)?.unitPriceUSD)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length === 0) return;
    const meanPriceUSD = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    masses[subUnit.unitId] = unitMassTonnes(subUnit.unitId, meanPriceUSD);
  });
  return masses;
}

export function createInitialGameState(seed: number = DEFAULT_SIMULATION_SEED): GameState {
  setSimulationSeed(seed);
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  // §6 hoist: the generator reads seed primitives from the regions this function just built,
  // instead of rebuilding four fresh regions per company.
  const companies = generateInitialCompanies(regions);

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
      const segs = reg.privateSectorSegments || [];
      const seeds = generatePrivateFirmSeeds(regionId, segs);
      const firms = generatePrivateCompanies(regionId, seeds, reg.policyRate, allTickers, allNames);

      // HC3 finding, measured the hard way: private firms must NOT sell into the public
      // sub-unit markets yet. The auctioned categories' demand is calibrated against public
      // supply; the hidden tier's output is real but sells OUTSIDE the modeled taxonomy
      // (services, local trade — categories that do not exist yet). Injecting its 165B/region
      // of supply into markets sized for 211B of public revenue collapsed both (measured:
      // -10% to -22% growth, unemployment pinned at its cap). Product-market entry therefore
      // waits for BP1's registry to carry the hidden sector's real categories (tracked as HC3b
      // in the plan); until then productLines stays empty and firm revenue evolves against its
      // own baseline. What DOES hand over now, conserving exactly: employment (real occupation
      // demand) and capex (real bids in the same capex categories public firms buy from).

      // The carves. Debt: serviceable ladders only (see HC1's finding on the segment debt
      // primitive). Employment / revenue / capex: exactly what the named tier now carries.
      segs.forEach(seg => {
        const segIdx = seeds.map((sd, i) => sd.segmentType === seg.segmentType ? i : -1).filter(i => i >= 0);
        const segFirms = segIdx.map(i => firms[i]);
        seg.debtUSD = Math.round(Math.max(0, seg.debtUSD - segFirms.reduce((a, f) => a + f.totalDebt, 0)));
        seg.employment = Math.max(1000, Math.round(seg.employment - segFirms.reduce((a, f) => a + f.employeeCount, 0)));
        // annualRevenueUSD deliberately NOT carved: the segment's stage-05 footprint (its buy-side
        // demand and niche supply share) still represents the whole hidden tier's goods activity
        // until HC3b moves the tier's product markets into the taxonomy.
        seg.capexUSD = Math.round(Math.max(0, seg.capexUSD - segFirms.reduce((a, f) => a + f.capex, 0)));
      });

      privateFirmsByRegion.set(regionId, firms);
      companies.push(...firms);
    });
  }

  const institutionalEntities: InstitutionalEntity[] = [];

  // corpBondPct + loanPct together are each type's total real corporate-credit appetite (same
  // totals as before this split: INSURER 0.35, ASSET_MANAGER 0.20, PENSION_FUND 0.30) — real
  // insurers/pension funds rarely hold broadly syndicated loans directly, while real loan
  // funds/CLOs are predominantly an asset-manager product.
  const allocationTargets: Record<InstitutionalEntityType, AssetAllocationTarget> = {
    INSURER: { govBondPct: 0.50, corpBondPct: 0.32, loanPct: 0.03, equityPct: 0.10, cashPct: 0.05 },
    ASSET_MANAGER: { govBondPct: 0.10, corpBondPct: 0.12, loanPct: 0.08, equityPct: 0.65, cashPct: 0.05 },
    PENSION_FUND: { govBondPct: 0.25, corpBondPct: 0.25, loanPct: 0.05, equityPct: 0.40, cashPct: 0.05 },
    // A credit hedge fund is the opposite balance sheet to an insurer: almost no sovereigns (it
    // is not there to match liabilities), the sector's heaviest corporate-credit and loan
    // weights, and a large cash sleeve that is real dry powder — the reason it can still bid
    // when everyone else is at their mandate limit.
    HEDGE_FUND: { govBondPct: 0.05, corpBondPct: 0.40, loanPct: 0.22, equityPct: 0.18, cashPct: 0.15 },
    // A money fund's whole book IS the cash sleeve: bills and overnight money through the same
    // machinery every entity's sleeve already uses (07f's bill share, WS6's repo/RRP split).
    // Zero term weights keep it out of the bond/loan/equity auctions entirely.
    MONEY_MARKET_FUND: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
    // An index fund's allocation IS its index; it holds one asset class and no cash sleeve
    // beyond what settlement needs. The weights here are never read for an ETF — its target is
    // the benchmark's own membership — and exist so the type map stays total.
    ETF: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
    // A PE fund holds companies and dry powder, not securities: zero weights keep it out of the
    // bond/loan/sovereign auctions entirely (no demand schedule, no budget). Its real assets are
    // its portfolio stakes, marked in peFund below.
    PRIVATE_EQUITY: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
  };

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const hs = reg.householdState;
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    // §7.4: the seed uses the SAME procurement owner the weekly stage does, so week 0's
    // government demand and week 1's are the same shape.
    const G = decomposeGovernmentSpending(
      reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyUSD ?? 0
    ).procurementBudgetUSD * 52;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;
    const I = corpBase;

    let totalHhWeight = 0;
    let totalGovWeight = 0;
    let totalCorpWeight = 0;

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        totalHhWeight += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const regionFirmCount = companies.filter(c => c.region === regionId).length;
    const govBudgetByCategory: Record<string, number> = {};

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        govBudgetByCategory[su.unitId] = suGovDemand / 52;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        const demandLevelUSD = suHhDemand + suGovDemand + suCorpDemand;

        (regions[regionId].categoryDemand as any)[su.unitId] = createSeedCategoryDemandState(
          demandLevelUSD,
          reg.gdpGrowth ?? 0.02,
          deriveSubUnitUnitPrice(demandLevelUSD, su.buyerMix, reg.totalPopulation, regionFirmCount)
        );
      });
    });

    // PUB1e: the budget stage 05 bids in week 1, seeded here so it is never empty.
    reg.governmentProcurementBudgetByCategory = govBudgetByCategory;
    reg.governmentProcurementSpentUSD = 0;

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);

    const totalMarketCap = regionCompanies.reduce((s, c) => s + c.marketCap, 0);
    const totalCorpDebt = regionCompanies.reduce((s, c) => s + c.totalDebt, 0);
    const totalSovDebt = reg.debtToGdpPct * reg.derivedNominalGdpUSD;

    reg.institutionalSector.equityHoldingsUSD = Number((reg.equityOwnership.institutionalShare * totalMarketCap).toFixed(0));
    reg.institutionalSector.corpBondHoldingsUSD = Number((reg.corpBondOwnership.institutionalShare * totalCorpDebt).toFixed(0));
    reg.institutionalSector.sovBondHoldingsUSD = Number((reg.sovBondOwnership.institutionalShare * totalSovDebt).toFixed(0));

    // Compile holding candidates for individual institutional entities and macro sectors
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies.filter(c => c.listingStatus !== 'PRIVATE').map(c => ({
      id: c.id,
      type: 'EQUITY',
      region: regionId,
      outstandingUSD: c.marketCap
    }));

    // Keyed by company id (aggregated across that issuer's own tranches), not per-tranche —
    // matches how the real corporate-bond clearing engine (07b-corporate-bond-clearing.ts)
    // tracks a participant's exposure per issuer, since all of an issuer's tranches reprice
    // together off one real cleared oasSpreadBps. A per-tranche key here would never match that
    // stage's per-company lookups, silently resetting every entity's real starting position to
    // zero on its very first real clearing week.
    // Real bonds are an issuer's FIXED-rate tranches only — floating tranches are real leveraged
    // loans, a genuinely different market with its own real clearing and its own candidate list
    // (loanCandidates below) — see 07b-corporate-bond-clearing.ts / 07d-leveraged-loan-clearing.ts.
    // Candidate lists stay PUBLIC: the macro holdings aggregates were calibrated against the
    // public market, and the private tier's paper is seeded separately in the engines' own
    // shape (the HC2 block below).
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .map(c => ({ id: c.id, type: 'CORP_BOND' as const, region: regionId, outstandingUSD: (c.debtTranches || []).filter(t => t.rateType === 'FIXED').reduce((s, t) => s + t.principalUSD, 0) }))
      .filter(c => c.outstandingUSD > 0);
    const totalCorpCandidatesUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;

    const loanCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .filter(c => c.listingStatus !== 'PRIVATE')
      .map(c => ({ id: c.id, type: 'LEVERAGED_LOAN' as const, region: regionId, outstandingUSD: (c.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0) }))
      .filter(c => c.outstandingUSD > 0);
    const totalLoanCandidatesUSD = loanCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;
    const attributeLoanHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      loanCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalLoanCandidatesUSD) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalUSD: shareUSD * (c.outstandingUSD / totalLoanCandidatesUSD),
        }));
    // Proportional-by-size, not attributeItemizedHoldings' size-sorted-greedy-with-a-40%-cap
    // fill: the real weekly clearing engine (07b-corporate-bond-clearing.ts) distributes an
    // entity's target across issuers by real debt-outstanding weight (tilted only by real
    // attractiveness, which is ~neutral at cold start); seeding the same shape here means an
    // entity's real week-1 gap per issuer is genuinely small, instead of the greedy fill
    // concentrating holdings in the 2-3 biggest issuers and leaving every smaller one to open
    // with an artificial, systemic buy gap on its first real clearing week.
    const attributeCorpBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      corpCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalUSD: shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD),
        }));

    // Equity is seeded in SHARES, proportional to each name's market cap — the same shape
    // 07e-equity-clearing.ts builds its structural demand in (§7.4). The greedy size-sorted fill
    // used before concentrated every entity's book in the two or three largest names, so week 1
    // opened with a systemic buy gap in every smaller name; and it stored dollars only, which is
    // the circularity the share registry exists to kill — a book whose size depends on the price
    // it is supposed to set (#28).
    const totalEquityCandidatesUSD = equityCandidates.reduce((s2, c) => s2 + c.outstandingUSD, 0) || 1;
    const equityPriceById = new Map(regionCompanies.map(c => [c.id, c.stockPrice]));
    const attributeEquityHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      equityCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalEquityCandidatesUSD) > 1)
        .map(c => {
          const nameUSD = shareUSD * (c.outstandingUSD / totalEquityCandidatesUSD);
          return {
            instrumentId: c.id,
            instrumentType: c.type,
            issuerRegion: c.region,
            quantityShares: nameUSD / Math.max(0.01, equityPriceById.get(c.id) ?? 1),
            quantityOrNotionalUSD: nameUSD,
          };
        });

    const govDebtTranches = reg.govDebtTranches || [];
    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = govDebtTranches.map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));

    // Keyed by the same tenor-bucket ids the real sovereign-bond clearing engine
    // (07c-sovereign-bond-clearing.ts) uses (`${region}-GOV-t2/t5/t10/t30`), not per-tranche —
    // individual gov debt tranches roll off and reissue quarterly, so a per-tranche key here
    // would suffer the exact same silent reset-to-zero problem the corporate-bond seed had.
    // Keyed by sovBucketKey — bills (b13/b26/b52, WS5) and bonds (t2..t30) alike, so the seed
    // covers the same seven buckets the weekly engines clear (07f clears the bills, 07c the
    // bonds) and no bucket opens with a phantom gap.
    const sovBucketOutstandingUSD = new Map<string, number>();
    govDebtTranches.forEach(gt => {
      const key = sovBucketKey(gt.tenorAtIssuanceYears);
      sovBucketOutstandingUSD.set(key, (sovBucketOutstandingUSD.get(key) ?? 0) + gt.principalUSD);
    });
    const totalSovBucketedUSD = Array.from(sovBucketOutstandingUSD.values()).reduce((s, v) => s + v, 0) || 1;
    const attributeSovBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      Array.from(sovBucketOutstandingUSD.entries())
        .filter(([, bucketUSD]) => shareUSD * (bucketUSD / totalSovBucketedUSD) > 1)
        .map(([key, bucketUSD]) => ({
          instrumentId: `${regionId}-GOV-${key}`,
          instrumentType: 'GOV_BOND' as const,
          issuerRegion: regionId,
          quantityOrNotionalUSD: shareUSD * (bucketUSD / totalSovBucketedUSD),
        }));

    // Seed each named bank's real sovereign book across the same tenor buckets the weekly
    // auction clears, using the same target derivation it uses (the region's real bank ownership
    // share of the real outstanding stock, split across banks by deposit size) and the same
    // outstanding-weighted split across tenors.
    //
    // This was missing: banks carried a scalar `sovereignBondHoldingsUSD` but an EMPTY
    // `sovereignBondHoldingsByTenor`, and 07c reads the buckets. So every bank opened ~$147B
    // below its own target in a $670B market and bought into it every single week, which the
    // auction could only express as a monotonic slide in yields — the whole banking sector
    // permanently on the bid. Two representations of one book, and the engine was reading the
    // empty one. Seed shape must match engine shape.
    const regionBanksForSov = regionCompanies.filter(c => c.isBankEntity && c.bankBalanceSheet);
    if (regionBanksForSov.length > 0 && totalSovBucketedUSD > 1) {
      const bankSovTargetUSD = reg.sovBondOwnership.bankShare * totalSovBucketedUSD;
      const perBankTargets = distributeRealTargetByWeight(
        regionBanksForSov.map(b => ({ id: b.ticker, sizeWeight: b.bankBalanceSheet!.depositsUSD, targetPct: 1 })),
        bankSovTargetUSD
      );
      regionBanksForSov.forEach(bank => {
        const targetUSD = perBankTargets.get(bank.ticker) ?? 0;
        const byTenor: Record<string, number> = {};
        sovBucketOutstandingUSD.forEach((bucketUSD_, key) => {
          const bucketUSD = targetUSD * (bucketUSD_ / totalSovBucketedUSD);
          if (bucketUSD > 1) byTenor[key] = bucketUSD;
        });
        bank.bankBalanceSheet!.sovereignBondHoldingsByTenor = byTenor;
        bank.bankBalanceSheet!.sovereignBondHoldingsUSD = Number(
          Object.values(byTenor).reduce((sum, v) => sum + v, 0).toFixed(0)
        );
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
        bs.depositsUSD = Number((
          bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD +
          bs.cashReservesUSD - bs.bankEquityUSD
        ).toFixed(0));
      });

      // The region aggregate is the derived sum of the named banks (the 02b/S7 doctrine),
      // re-projected here so week 0 reads the same books week 1 will.
      const aggByTenor: Record<string, number> = {};
      regionBanksForSov.forEach(b => {
        Object.entries(b.bankBalanceSheet!.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => {
          aggByTenor[k] = (aggByTenor[k] ?? 0) + v;
        });
      });
      const sumBank = (f: (bs: import('../../types').BankingSector) => number) =>
        Number(regionBanksForSov.reduce((sum, b) => sum + f(b.bankBalanceSheet!), 0).toFixed(0));
      reg.bankingSector.sovereignBondHoldingsByTenor = aggByTenor;
      reg.bankingSector.sovereignBondHoldingsUSD = sumBank(bs => bs.sovereignBondHoldingsUSD);
      reg.bankingSector.depositsUSD = sumBank(bs => bs.depositsUSD);
      reg.bankingSector.cashReservesUSD = sumBank(bs => bs.cashReservesUSD);
      reg.bankingSector.bankEquityUSD = sumBank(bs => bs.bankEquityUSD);
      reg.bankingSector.businessLoanBookUSD = sumBank(bs => bs.businessLoanBookUSD);
      reg.bankingSector.consumerLoanBookUSD = sumBank(bs => bs.consumerLoanBookUSD);
    }

    // G2 slice 1: itemize the business book onto real borrowers, and recalibrate the SME
    // seed scalar (`debtUSD = 2 x revenue`, ~17.8x EBITDA — §6's unpriced primitive) down to
    // what the pools can service AND the banks' capital can carry.
    const regionBanksForLending = regionCompanies.filter(c => c.isBankEntity && c.bankBalanceSheet);
    if (regionBanksForLending.length > 0) {
      migrateSmeDebtAtSeed(regionId, reg, regionBanksForLending);
      // HH3: the household debt the region already carries becomes real mortgage / card / term
      // pools on the same named banks, replacing the consumer scalar (which covered 11.67% of
      // the same debt and owed the rest to nobody). Equity tops up at each bank's own opening
      // capital ratio and deposits re-derive as the balancing funding — §7.4's discipline: the
      // seed opens in the exact shape the weekly lending pass maintains.
      migrateHouseholdDebtAtSeed(regionId, reg, regionBanksForLending);
      // HH4b: the seed residual of the budget recycle — the slice of debt service whose return
      // path to household income is not yet built (bank retained earnings, institutional
      // dividend passthrough). Derived once so the seed consumption budget nets to exactly the
      // pre-HH4b one: real receipts at seed are deposit interest (direct equity is marked from
      // zero by the first weekly pass), and the residual covers the rest of debt service.
      {
        const hs = reg.householdState;
        const annualDsUSD = (hs.weeklyDebtServiceUSD ?? 0) * 52;
        const seedDepositInterestUSD = (hs.depositsUSD ?? 0) * (reg.policyRate * 0.6);
        hs.unmodeledCapitalReceiptShareOfIncome = reg.estimatedHouseholdIncomeUSD > 0
          ? Number((Math.max(0, annualDsUSD - seedDepositInterestUSD) / reg.estimatedHouseholdIncomeUSD).toFixed(6))
          : 0;
        hs.capitalReceiptsAnnualUSD = Number(annualDsUSD.toFixed(0));
      }
      reg.bankingSector.businessLoanBookUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.businessLoanBookUSD, 0);
      reg.bankingSector.consumerLoanBookUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.consumerLoanBookUSD, 0);
      reg.bankingSector.bankEquityUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.bankEquityUSD, 0);
      reg.bankingSector.depositsUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0);
      reg.bankingSector.wholesaleFundingUSD = regionBanksForLending.reduce((a, b) => a + (b.bankBalanceSheet!.wholesaleFundingUSD ?? 0), 0);

      // PUB2 (§7.4): close the central bank's balance sheet at birth, now that the banks whose
      // cash is its reserve liability exist. Currency is the residual; the weekly stage
      // re-derives it by the same arithmetic.
      const cbSheet = reg.centralBankSheet;
      if (cbSheet) {
        const reservesUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.cashReservesUSD, 0);
        cbSheet.currencyInCirculationUSD = Number(centralBankCurrencyResidualUSD(cbSheet, reservesUSD).toFixed(0));
        cbSheet.unbackedBankCashUSD = Number(unbackedBankCashUSD(cbSheet, reservesUSD).toFixed(0));
        reg.centralBankBalanceSheet = Number(centralBankAssetsUSD(cbSheet).toFixed(0));
      }

      // Every company banks somewhere: its cash IS a deposit at its house bank (the same
      // relationship lead WS8 mandates for its offerings, so one firm has one bank).
      regionCompanies.forEach(c => {
        if (c.isBankEntity) return;
        c.homeBankTicker = chooseLeadBank(c.id, regionBanksForLending.map(b => ({ ticker: b.ticker, bankMarketShare: b.bankMarketShare })));
      });
      const corpDepositsByBank = new Map<string, number>();
      regionCompanies.forEach(c => {
        if (c.isBankEntity || !c.homeBankTicker) return;
        corpDepositsByBank.set(c.homeBankTicker, (corpDepositsByBank.get(c.homeBankTicker) ?? 0) + Math.max(0, c.cash));
      });
      regionBanksForLending.forEach(b => {
        b.bankBalanceSheet!.corporateDepositsUSD = Math.round(corpDepositsByBank.get(b.ticker) ?? 0);
      });
      reg.bankingSector.corporateDepositsUSD = regionBanksForLending.reduce((a, b) => a + b.bankBalanceSheet!.corporateDepositsUSD, 0);
    }

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(reg.institutionalSector.corpBondHoldingsUSD, corpCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.sovBondHoldingsUSD, sovCandidates),
      ...attributeEquityHoldingsProportionally(reg.institutionalSector.equityHoldingsUSD),
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
    const rawEntityCorpTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: allocationTargets[role].corpBondPct };
        }),
      reg.institutionalSector.corpBondHoldingsUSD || 0
    );
    // Same real, bottom-up derivation for sovereign bonds (govBondPct as a relative weight on
    // the real institutional sovereign-debt pool) — matches 07c-sovereign-bond-clearing.ts.
    const rawEntitySovTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: allocationTargets[role].govBondPct };
        }),
      reg.institutionalSector.sovBondHoldingsUSD || 0
    );
    // Same real, bottom-up derivation for leveraged loans — no dedicated region-level loan
    // ownership share is tracked, so this reuses corpBondOwnership.institutionalShare (the same
    // institutional-vs-market share that governs the sibling corporate-bond market) as a real,
    // defensible proxy, applied to the real bottom-up floating-debt float rather than an
    // independent number. Matches 07d-leveraged-loan-clearing.ts.
    const rawEntityLoanTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: allocationTargets[role].loanPct };
        }),
      reg.corpBondOwnership.institutionalShare * totalLoanCandidatesUSD
    );

    regionalInstCompanies.forEach(comp => {
      const role = comp.institutionalEntityType;
      if (!role) return;

      const share = comp.institutionalMarketShare ?? 0.33;
      const macroSector = reg.institutionalSector;
      const totalMacroAssetsUSD =
        (macroSector.equityHoldingsUSD || 0) +
        (macroSector.corpBondHoldingsUSD || 0) +
        (macroSector.sovBondHoldingsUSD || 0) +
        (macroSector.cashUSD || 0);

      const totalAssetsUSD = totalMacroAssetsUSD * share;
      const equityCapitalUSD = totalAssetsUSD * 0.12; // 12% capital ratio

      const entCorpShareUSD = rawEntityCorpTargetsUSD.get(comp.id) ?? 0;
      const entSovShareUSD = rawEntitySovTargetsUSD.get(comp.id) ?? 0;
      const entLoanShareUSD = rawEntityLoanTargetsUSD.get(comp.id) ?? 0;
      const entEquityShareUSD = (macroSector.equityHoldingsUSD || 0) * share;

      const itemizedHoldings = [
        ...attributeCorpBondHoldingsProportionally(entCorpShareUSD),
        ...attributeSovBondHoldingsProportionally(entSovShareUSD),
        ...attributeLoanHoldingsProportionally(entLoanShareUSD),
        ...attributeEquityHoldingsProportionally(entEquityShareUSD),
      ];

      institutionalEntities.push({
        id: comp.id,
        name: comp.name,
        ticker: comp.ticker,
        region: regionId,
        entityType: role,
        financialStatementProfile: comp.financialStatementProfile,
        totalAssetsUSD,
        // Real opening cash: the entity's own policy cash weight against its own book. Every
        // clearing fill from here on settles against this balance.
        cashUSD: totalAssetsUSD * allocationTargets[role].cashPct,
        equityCapitalUSD,
        sharesOutstanding: comp.sharesOutstanding,
        stockPrice: comp.stockPrice,
        itemizedHoldings,
        assetAllocationTarget: allocationTargets[role],
        isDefaulted: comp.isDefaulted,
        historicalPrices: [...comp.historicalPrices],
      });
    });

    // The same effective rate the macro bootstrap uses, so the seed's after-tax shape matches
    // what stage 08 will produce from week 1.
    const INSTITUTIONAL_EFFECTIVE_TAX_RATE = 0.31;
    // ---- HH1b: seed an institution at the size it actually manages (§7.4, seed shape = engine
    // shape). The Company shell and the InstitutionalEntity are the SAME firm, and their two
    // notions of AUM disagreed: the generator seeded `aumUSD` as a multiple of an operating
    // company's revenue, while the entity's `totalAssetsUSD` is its real marked book. Stage 08
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
      const entity = institutionalEntities.find(e => e.id === comp.id);
      if (!entity) return;
      if (isManager && !(comp.managementFeeRate > 0)) return;
      // A manager's revenue is a fee on the book it runs; an insurer's is the premium its own
      // capital lets it write. Both read the entity, because both ARE the entity.
      if (isManager) comp.aumUSD = entity.totalAssetsUSD;
      const revenueUSD = isManager
        ? Math.max(10, comp.aumUSD! * comp.managementFeeRate!)
        : Math.max(10, Math.max(0, entity.equityCapitalUSD) * PREMIUM_TO_SURPLUS_RATIO);
      if (isInsurer) {
        comp.insurancePremiumsWrittenUSD = revenueUSD;
        comp.technicalReservesUSD = Math.max(0, entity.totalAssetsUSD - entity.equityCapitalUSD);
      }
      const ebitdaUSD = revenueUSD * (isManager ? 0.35 : 0.15);
      comp.annualRevenue = revenueUSD;
      comp.baselineAnnualRevenue = revenueUSD;
      comp.revenueHistory = [revenueUSD];
      comp.ebitda = ebitdaUSD;
      comp.ebit = Math.max(1, ebitdaUSD);
      comp.netIncome = comp.ebit * (1 - INSTITUTIONAL_EFFECTIVE_TAX_RATE);
      comp.eps = comp.sharesOutstanding > 0 ? Number((comp.netIncome / comp.sharesOutstanding).toFixed(2)) : 0;
    });

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
    {
      const targetEmployed = totalLaborForce * (1 - reg.unemploymentRate);
      const firmEmployment = regionCompanies
        .filter(c => isActiveCompany(c))
        .reduce((a, c) => a + Math.max(0, c.employeeCount), 0);
      const residual = targetEmployed - firmEmployment - reg.governmentEmployment;
      const segs = reg.privateSectorSegments || [];
      const segTotal = segs.reduce((a, sg) => a + Math.max(0, sg.employment), 0);
      if (segs.length > 0 && segTotal > 0 && residual > 0) {
        segs.forEach((sg) => {
          sg.employment = Math.max(1, Math.round(residual * (Math.max(0, sg.employment) / segTotal)));
        });
      }
    }

    // The labor-force MIX opens at the mix employers actually demand. It used to be that mix
    // times a table of per-occupation "slack multipliers" (1.04 to 1.12), and that arbitrary
    // differential was not harmless: it left TECHNICAL_ENGINEERING with literally zero job
    // seekers against 169k unfilled vacancies and wage growth pinned at its +13% cap, while
    // GENERAL carried 678k unemployed and falling wages — a structural mismatch the world was
    // BORN with, indistinguishable at a glance from one it had produced. Uniform slack means
    // any mismatch after week 0 is one the economy really generated, which is what the
    // retraining flow exists to work on.
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.privateSectorSegments, regionId, reg.governmentEmployment) as Record<OccupationType, number>;
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

    const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
    const realWageIncomeUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce(
      (sum, occ) => sum + baseAnnualWageUSD[occ] * reg.occupationPools[occ].wageIndex * reg.occupationPools[occ].employed, 0
    );
    const realEmployedForWages = (Object.keys(reg.occupationPools) as OccupationType[])
      .reduce((sum, occ) => sum + reg.occupationPools[occ].employed, 0);
    const realUnemploymentBenefitsUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce((sum, occ) => {
      const unemployedInPool = totalLaborForce * (reg.occupationLaborForceShare[occ] ?? 0) - reg.occupationPools[occ].employed;
      return sum + baseAnnualWageUSD[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
    }, 0);
    // §7.4: this restatement is the SECOND computation of household income at seed (the macro
    // bootstrap does the first), so it must read the same transfer number or it silently
    // overwrites the first with a different economy. It used to re-derive transfers from the
    // spending budget while omitting debt service — a PUB1a leftover that won for six slices.
    // PUB3b: there is now one transfer number and both callers read it.
    const seedObligations = governmentObligationsWeeklyUSD({
      interestWeeklyUSD: reg.governmentInterestWeeklyUSD ?? 0,
      payrollWeeklyUSD: reg.governmentPayrollWeeklyUSD ?? 0,
      unemploymentBenefitsWeeklyUSD: realUnemploymentBenefitsUSD / 52,
      retiredPopulation: reg.totalPopulation * (reg.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0),
      averageAnnualWageUSD: realEmployedForWages > 0 ? realWageIncomeUSD / realEmployedForWages : 0,
      fiscalStanceScore: reg.fiscalStanceScore,
    });
    reg.governmentSpendingUSD = Number(seedObligations.totalUSD.toFixed(0));
    reg.estimatedHouseholdIncomeUSD = Number(computeHouseholdDisposableIncomeUSD({
      wageIncomeUSD: realWageIncomeUSD,
      transfersWeeklyUSD: seedObligations.transfersUSD,
    }).toFixed(0));

    // With income now on its real footing, restate the reported GDP series to what this
    // economy's own components actually sum to. estimatedNominalGdpUSD stays the supply-side
    // potential-output anchor it always was (it sizes the wage table, the government's budget
    // and the bank balance-sheet ratios); what gets reported, compared year-over-year and fed to
    // the Taylor rule is the real bottom-up measure, and it has to start where the real economy
    // starts or the difference is read as growth.
    const regionFirms = regionCompanies.filter(c => !c.isDefaulted && !c.mergerAcquired);
    const trackedInvestmentUSD = regionFirms.reduce((sum, c) => sum + c.maintenanceCapex + c.growthCapex, 0);
    const trackedEmployment = regionFirms.reduce((sum, c) => sum + c.employeeCount, 0);
    const privateEmployment = (reg.privateSectorSegments || []).reduce((sum, seg) => sum + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + privateEmployment) / trackedEmployment : 1;
    const { gdpUSD: bottomUpGdpUSD } = computeExpenditureGdpUSD({
      householdIncomeUSD: reg.estimatedHouseholdIncomeUSD,
      savingsRate: reg.householdState.savingsRate,
      investmentUSD: trackedInvestmentUSD * investmentScaleFactor,
      // PUB1e/PUB3b: G is the procurement budget the government will actually bid, annualised —
      // the same number stage 05 bids and stage 11 debits the account by.
      governmentPurchasesUSD: seedObligations.procurementBudgetUSD * 52,
      netExportsUSD: reg.exportsUSD - reg.importsUSD,
    });
    // Build the real consumer basket now that every sub-unit carries its bootstrapped price.
    // Weights are what households actually spend on each good; base prices are today's.
    reg.cpiBasket = buildCpiBasket(reg, 1, CPI_BASE_LEVEL);

    reg.derivedNominalGdpUSD = Number(bottomUpGdpUSD.toFixed(0));
    reg.lastWeekNominalGdpUSD = reg.derivedNominalGdpUSD;
    const nominalTrendGrowth = reg.potentialGdpGrowth + reg.targetInflation;
    reg.nominalGdpHistory = reg.nominalGdpHistory.map((_, i, arr) =>
      Number((reg.derivedNominalGdpUSD * Math.pow(1 + nominalTrendGrowth, (i - (arr.length - 1)) / 52)).toFixed(0))
    );
  });

  // XB3a-2: the logistics sector, which this economy did not have. The fleet is sized by running
  // the sourcing intent against the bootstrap economy, and the carriers' books are built on the
  // rate that auction actually clears — so freight opens somewhere a week of this simulation
  // would produce rather than on an artifact of a guessed fleet (§7.4).
  const seededUnitMassTonnes = seedUnitMassTonnes(regions);
  const seedFxToUsd = (regionId: RegionId) => getFxToUsd(fxPairs, regionId);
  const carrierTickers = new Set<string>(companies.map(c => c.ticker));
  const carrierNames = new Set<string>(companies.map(c => c.name));
  const carriers = generateCarriers(regions, seededUnitMassTonnes, seedFxToUsd, carrierTickers, carrierNames);
  companies.push(...carriers);
  const seededFreightRates = (() => {
    const { bookings } = seedFreightDemand(regions, seededUnitMassTonnes, seedFxToUsd);
    // Open the regions on their real trade position rather than at zero exports and zero imports.
    // Net exports are a real component of the expenditure identity, and starting them at zero made
    // week 1 read the entire structural balance as a collapse in output. This is the engine's own
    // sourcing decision, taken once at seed prices — not a parallel formula (§7.4).
    (Object.keys(regions) as RegionId[]).forEach(r => { regions[r].exportsUSD = 0; regions[r].importsUSD = 0; });
    bookings.forEach(b => {
      if (b.from === b.to) return;
      const exWorks = Number((regions[b.from].categoryDemand[b.subUnitId] as any)?.unitPriceUSD) || 0;
      const valueUSD = localToUsd(b.units * exWorks, b.from, seedFxToUsd) * 52;
      regions[b.from].exportsUSD += valueUSD;
      regions[b.to].importsUSD += valueUSD;
    });
    (Object.keys(regions) as RegionId[]).forEach(r => {
      regions[r].exportsUSD = Number(regions[r].exportsUSD.toFixed(0));
      regions[r].importsUSD = Number(regions[r].importsUSD.toFixed(0));
      regions[r].tradeBalance = regions[r].exportsUSD - regions[r].importsUSD;
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
      const exWorks = Number((regions[b.from].categoryDemand[b.subUnitId] as any)?.unitPriceUSD) || 0;
      const perUnit = convertLocal(exWorks, b.from, b.to, seedFxToUsd);
      // One week's worth arriving in each of the next `transit` weeks: what a lane in steady
      // state is carrying.
      for (let wk = 1; wk <= transit; wk++) {
        const buyer = pool[(wk + b.subUnitId.length) % pool.length];
        seededPipeline.push({
          buyerTicker: buyer.ticker,
          sellerKey: `${b.from}_SEED_SUPPLIER`,
          subUnitId: b.subUnitId,
          units: b.units / transit,
          landedCostPerUnit: perUnit,
          arrivalWeek: wk,
        });
      }
    });
  }

  const commodities = getInitialCommodities();
  const allGeneratedCompanies = companies;
  // Calibrate the working linkage from the FROZEN base shares (§6: the old in-place mutation
  // meant a second world built in the same process re-calibrated already-calibrated values).
  Object.keys(BASE_COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
    const base = BASE_COMMODITY_CATEGORY_LINKAGE[commodityId];
    const calibratedShare = calibrateIntensityShare(commodityId, allGeneratedCompanies, regions, base.subUnitId);
    COMMODITY_CATEGORY_LINKAGE[commodityId] = { ...base, intensityShare: calibratedShare };
  });

  const dealers = DEALERS;
  const compositeIndices = calculateCompositeIndices(companies, regions, commodities);
  const recentIPOs: { ticker: string; name: string; category: string; week: number }[] = [];
  const recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[] = [];

  const startingCash = 25_000_000; // $25M USD Hedge Fund Starting Capital
  const portfolio: Portfolio = {
    cashUSD: startingCash,
    startingCapitalUSD: startingCash,
    navUSD: startingCash,
    previousNavUSD: startingCash,
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
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    lastWeekAttribution: {
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    totalRequiredMarginUSD: 0,
    maintenanceMarginUSD: 0,
    marginUtilizationPct: 0,
    isMarginCall: false,
    marginCallWarning: null,
    totalLeverage: 0,
    netDeltaUSD: 0,
    netGammaUSD: 0,
    netVegaUSD: 0,
    netDV01USD: 0,
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
    const lpWeightSum = lps.reduce((a, e) => a + e.totalAssetsUSD, 0) || 1;
    // The seed marks the sponsored stakes at the same multiple the running mark uses — what the
    // region's LISTED comps are worth per dollar of EBITDA — so week 0's NAV is not a different
    // valuation from week 1's. A bare `8 *` here and in the weekly mark was one company valued
    // two ways, and it made every seeded holding's entry basis a number nothing had cleared.
    const seedEvMultiple = publicComparableEvMultiple(regionId, companies);
    const stakeValue = (f: Company) => Math.max(0, seedEvMultiple * f.ebitda - f.totalDebt) * 0.75;

    // WS7: one money market fund per region. Born EMPTY — no fabricated share stock (§7.4's
    // seed-shape rule read the other way: the honest seed for a market the flows create is
    // zero, the same doctrine as WS5's CP program). Corporate sweeps and the household
    // yield-gap flow build its book; its bills/repo/RRP deployment rides the sleeve machinery
    // every entity already has.
    institutionalEntities.push({
      id: `${regionId}_MMF_1`,
      name: `${regionId} Government Money Market Fund`,
      ticker: `MMF1`,
      region: regionId,
      entityType: 'MONEY_MARKET_FUND',
      totalAssetsUSD: 0,
      equityCapitalUSD: 0,
      sharesOutstanding: 1,
      stockPrice: 0,
      itemizedHoldings: [],
      cashUSD: 0,
      assetAllocationTarget: allocationTargets.MONEY_MARKET_FUND,
      isDefaulted: false,
      historicalPrices: [],
      mmfSharesOutstandingUSD: 0,
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
          id: `${def.id}_ETF`,
          name: `${def.name} Index Fund`,
          ticker: `${def.id.replace(/_/g, '').slice(0, 5)}X`,
          region: regionId,
          entityType: 'ETF',
          totalAssetsUSD: 0,
          equityCapitalUSD: 0,
          sharesOutstanding: 0,
          stockPrice: 0,
          itemizedHoldings: [],
          cashUSD: 0,
          assetAllocationTarget: allocationTargets.ETF,
          isDefaulted: false,
          historicalPrices: [],
          etf: {
            indexId: def.id,
            sponsorEntityId: sponsor.id,
            sharesOutstanding: 0,
            expenseRatioAnnual: ETF_EXPENSE_RATIO_ANNUAL[expenseClass],
            unmetFlowShare: 0,
          },
        });
      });
    }

    for (let fundIdx = 0; fundIdx < 2; fundIdx++) {
      const portfolio = sponsorable.filter((_, i) => i % 2 === fundIdx);
      if (portfolio.length === 0) continue;
      const fundId = `${regionId}_PEFUND_${fundIdx + 1}`;
      const investedUSD = Math.round(portfolio.reduce((a, f) => a + stakeValue(f), 0));
      // Real funds keep ~a third of commitments undrawn — the dry powder HC6 calls.
      const committedUSD = Math.round(investedUSD / 0.65);
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
        ticker: `PEF${fundIdx + 1}`,
        region: regionId,
        entityType: 'PRIVATE_EQUITY',
        totalAssetsUSD: investedUSD,
        equityCapitalUSD: investedUSD,
        sharesOutstanding: 1,
        stockPrice: 0,
        itemizedHoldings: [],
        cashUSD: 0,
        assetAllocationTarget: { govBondPct: 0, corpBondPct: 0, loanPct: 0, equityPct: 0, cashPct: 1.0 },
        isDefaulted: false,
        historicalPrices: [],
        peFund: {
          portfolioCompanyIds: portfolio.map(f => f.id),
          lpCommitments: lps.map(e => ({
            lpEntityId: e.id,
            committedUSD: Math.round(committedUSD * (e.totalAssetsUSD / lpWeightSum)),
            drawnUSD: Math.round(investedUSD * (e.totalAssetsUSD / lpWeightSum)),
          })),
        },
      });
      lps.forEach(e => {
        const interestUSD = Math.round(investedUSD * (e.totalAssetsUSD / lpWeightSum));
        if (interestUSD > 1) {
          e.itemizedHoldings.push({ instrumentId: fundId, instrumentType: 'PE_FUND_INTEREST', issuerRegion: regionId, quantityOrNotionalUSD: interestUSD });
          e.totalAssetsUSD += interestUSD;
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
    const reg = regions[regionId];
    const firms = privateFirmsByRegion.get(regionId) ?? [];
    const regionEntities = institutionalEntities.filter(e => e.region === regionId);
    const fixedOf = (f: Company) => (f.debtTranches || []).filter(t => t.rateType === 'FIXED').reduce((a, t) => a + t.principalUSD, 0);
    const floatOf = (f: Company) => (f.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((a, t) => a + t.principalUSD, 0);
    const instShare = reg.corpBondOwnership.institutionalShare;
    const IG = ['AAA', 'AA', 'A', 'BBB'];
    const sleeve = (t: InstitutionalEntityType, ig: boolean) =>
      ig ? 1 : t === 'INSURER' ? 0.08 : t === 'PENSION_FUND' ? 0.10 : t === 'ASSET_MANAGER' ? 2.0 : 4.0;
    firms.forEach(f => {
      const ig = IG.includes(f.creditRating);
      (['CORP_BOND', 'LEVERAGED_LOAN'] as const).forEach(kind => {
        const outstanding = kind === 'CORP_BOND' ? fixedOf(f) : floatOf(f);
        if (outstanding <= 0) return;
        const tradable = outstanding * instShare;
        const weights = regionEntities.map(e => {
          const pct = kind === 'CORP_BOND' ? e.assetAllocationTarget.corpBondPct : e.assetAllocationTarget.loanPct;
          return e.totalAssetsUSD * pct * sleeve(e.entityType, ig);
        });
        const wSum = weights.reduce((a, b) => a + b, 0) || 1;
        regionEntities.forEach((e, i) => {
          const qty = tradable * (weights[i] / wSum);
          if (qty > 1) {
            e.itemizedHoldings.push({ instrumentId: f.id, instrumentType: kind, issuerRegion: regionId, quantityOrNotionalUSD: Math.round(qty) });
            e.totalAssetsUSD += Math.round(qty);
          }
        });
      });
    });
  });

  // S7: project the real seeded books onto the sector aggregates before the first week runs, so
  // week 0's displayed numbers are the same derivation every later week uses. The aggregates
  // written earlier in this function are the SEEDS the entity targets were sized against (they
  // have to exist first); this replaces them with what the resulting real books actually hold —
  // notably including the HC private tier, which the share-times-outstanding seeds never saw.
  {
    const seeded = { regions, companies, institutionalEntities } as unknown as GameState;
    (Object.keys(regions) as RegionId[]).forEach(regionId => {
      refreshRegionalHoldingsView(seeded, regionId, regions[regionId]);
    });
  }

  return {
    currentWeek: 1,
    year: 2026,
    rngSeed: seed,
    rngState: getRngState(),
    primaryOfferings: [],
    unitMassTonnes: seededUnitMassTonnes,
    freightRatePerTonneLaneMoneyByLane: seededFreightRates,
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
    isTradeModalOpen: false,
    selectedInstrument: null,
    isNewsDrawerOpen: false,
    diagnosticsLogs: [
      {
        week: 1,
        timestamp: new Date().toISOString(),
        category: 'EXECUTION',
        message: 'Engine Initialized: Multi-Region Macro <-> Micro Feedback Loop Active (Jan 05, 2026)',
        deltaText: '200 Corporate Issuers • 4 Nelson-Siegel Yield Curves • 9 Commodities Desk',
        data: { capitalUSD: startingCash, regionsCount: 4, firmsCount: companies.length },
      },
    ],
    isGameOver: false,
    gameOverReason: null,
  };
}



