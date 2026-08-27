
import { RegionId, Portfolio, OccupationType, COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, AssetAllocationTarget, ItemizedHolding, INDUSTRY_SUBUNITS } from '../../types';
import { DEALERS } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies, generatePrivateCompanies } from '../companyGenerator';
import { generatePrivateFirmSeeds } from '../bootstrap/private-firms';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand, attributeItemizedHoldings, distributeRealTargetByWeight } from './stages/shared-helpers';
import { computeBilateralTradeFlows } from './stages/06-fx-and-trade';
import { buildCpiBasket, CPI_BASE_LEVEL } from './stages/price-index';
import { deriveSubUnitUnitPrice } from '../bootstrap/category-demand';
import { getBaseAnnualWageUSD } from '../bootstrap/labor-and-wages';
import {
  computeExpenditureGdpUSD,
  computeGovernmentPurchasesUSD,
  computeHouseholdDisposableIncomeUSD,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';

export function createInitialGameState(): GameState {
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  const companies = generateInitialCompanies();

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
  };

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const hs = reg.householdState;
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const G = computeGovernmentPurchasesUSD(reg.governmentSpendingUSD) * (1 + reg.fiscalStanceScore * 0.25);
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

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        const demandLevelUSD = suHhDemand + suGovDemand + suCorpDemand;

        (regions[regionId].categoryDemand as any)[su.unitId] = {
          demandLevelUSD,
          demandGrowthAnnual: reg.gdpGrowth ?? 0.02,
          demandHistory: [demandLevelUSD],
          crowdingIntensity: 0.1,
          inventoryLevelUSD: demandLevelUSD * 0.10,
          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,
          upstreamScarcityIndex: 1.0,
          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          unitPriceUSD: deriveSubUnitUnitPrice(demandLevelUSD, su.buyerMix, reg.totalPopulation, regionFirmCount),
        };
      });
    });

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);
    const totalMarketCap = regionCompanies.reduce((s, c) => s + c.marketCap, 0);
    const totalCorpDebt = regionCompanies.reduce((s, c) => s + c.totalDebt, 0);
    const totalSovDebt = reg.debtToGdpPct * reg.derivedNominalGdpUSD;

    reg.institutionalSector.equityHoldingsUSD = Number((reg.equityOwnership.institutionalShare * totalMarketCap).toFixed(0));
    reg.institutionalSector.corpBondHoldingsUSD = Number((reg.corpBondOwnership.institutionalShare * totalCorpDebt).toFixed(0));
    reg.institutionalSector.sovBondHoldingsUSD = Number((reg.sovBondOwnership.institutionalShare * totalSovDebt).toFixed(0));

    // Compile holding candidates for individual institutional entities and macro sectors
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies.map(c => ({
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
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .map(c => ({ id: c.id, type: 'CORP_BOND' as const, region: regionId, outstandingUSD: (c.debtTranches || []).filter(t => t.rateType === 'FIXED').reduce((s, t) => s + t.principalUSD, 0) }))
      .filter(c => c.outstandingUSD > 0);
    const totalCorpCandidatesUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;

    const loanCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
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
    const SOV_TENOR_BUCKETS = [2, 5, 10, 30];
    const sovBucketOutstandingUSD = new Map<number, number>();
    SOV_TENOR_BUCKETS.forEach(y => sovBucketOutstandingUSD.set(y, 0));
    govDebtTranches.forEach(gt => {
      const bucket = SOV_TENOR_BUCKETS.reduce((best, y) => Math.abs(y - gt.tenorAtIssuanceYears) < Math.abs(best - gt.tenorAtIssuanceYears) ? y : best);
      sovBucketOutstandingUSD.set(bucket, (sovBucketOutstandingUSD.get(bucket) ?? 0) + gt.principalUSD);
    });
    const totalSovBucketedUSD = Array.from(sovBucketOutstandingUSD.values()).reduce((s, v) => s + v, 0) || 1;
    const attributeSovBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      SOV_TENOR_BUCKETS
        .filter(y => shareUSD * ((sovBucketOutstandingUSD.get(y) ?? 0) / totalSovBucketedUSD) > 1)
        .map(y => ({
          instrumentId: `${regionId}-GOV-t${y}`,
          instrumentType: 'GOV_BOND' as const,
          issuerRegion: regionId,
          quantityOrNotionalUSD: shareUSD * ((sovBucketOutstandingUSD.get(y) ?? 0) / totalSovBucketedUSD),
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
        SOV_TENOR_BUCKETS.forEach(y => {
          const bucketUSD = targetUSD * ((sovBucketOutstandingUSD.get(y) ?? 0) / totalSovBucketedUSD);
          if (bucketUSD > 1) byTenor[`t${y}`] = bucketUSD;
        });
        bank.bankBalanceSheet!.sovereignBondHoldingsByTenor = byTenor;
        bank.bankBalanceSheet!.sovereignBondHoldingsUSD = Number(
          Object.values(byTenor).reduce((sum, v) => sum + v, 0).toFixed(0)
        );
      });
    }

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(reg.institutionalSector.corpBondHoldingsUSD, corpCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.sovBondHoldingsUSD, sovCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.equityHoldingsUSD, equityCandidates),
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
        ...attributeItemizedHoldings(entEquityShareUSD, equityCandidates),
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

    // Calibrate initial occupationLaborForceShare from actual week-1 demand across companies & private segments
    // with realistic occupational tightness differentials
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.privateSectorSegments, regionId, reg.governmentEmployment) as Record<OccupationType, number>;
    const week1DemandTotal = Object.values(week1OccDemand).reduce((s, v) => s + v, 0);
    const slackMultipliers: Record<OccupationType, number> = {
      GENERAL: 1.12,
      SKILLED_TRADES: 1.08,
      TECHNICAL_ENGINEERING: 1.04,
      SPECIALIZED_PROFESSIONAL: 1.05,
      MANAGERIAL_FINANCIAL: 1.07,
    };
    const calibratedShares = (Object.keys(week1OccDemand) as OccupationType[]).reduce((acc, occ) => {
      const mult = slackMultipliers[occ] ?? 1.08;
      acc[occ] = week1DemandTotal > 0 ? Math.max(0.03, (week1OccDemand[occ] / week1DemandTotal) * mult) : 0.2;
      return acc;
    }, {} as Record<OccupationType, number>);
    const shareSum = Object.values(calibratedShares).reduce((s, v) => s + v, 0);
    if (shareSum > 0) {
      (Object.keys(calibratedShares) as OccupationType[]).forEach(occ => {
        calibratedShares[occ] = Number((calibratedShares[occ] / shareSum).toFixed(4));
      });
    }
    reg.occupationLaborForceShare = calibratedShares;

    // Seed employment from the SAME real labor demand the weekly step clears against, rather
    // than a top-down headcount. buildRegion has to size the pools before any company exists,
    // so it assumes every worker implied by the population/participation/unemployment
    // primitives is employed; the real economy assembled just above demands ~4% fewer of them.
    // Leaving both figures in place is the "two representations of one real thing" pattern: the
    // wage bill, and therefore household income and consumption, stepped down the moment week 1
    // recomputed employment on the real basis. The real basis is the one that survives.
    const totalLaborForce = reg.totalPopulation * (1 - reg.nonEmployablePct) * reg.laborForceParticipation;
    (Object.keys(reg.occupationPools) as OccupationType[]).forEach((occ) => {
      const availableSupply = totalLaborForce * (calibratedShares[occ] ?? 0);
      reg.occupationPools[occ].employed = Math.round(Math.min(availableSupply, week1OccDemand[occ] ?? 0));
    });
    // NOTE, deliberately not "fixed" here: these pools imply an unemployment rate around 11-14%
    // (the firms this bootstrap generates demand that much less labor than the population and
    // participation primitives supply), while `reg.unemploymentRate` and the weekly evolution
    // report ~4.5%. Two representations of one real thing again — but reconciling them means
    // making firm generation and labor supply agree, which is the labor market's own rebuild
    // (Main Street), not this item. Writing the pool-implied rate into the field here was tried
    // and reverted: it moves reported unemployment from 4.5% to 12.7% without making the two
    // sides agree, trading a hidden inconsistency for a visible one.

    const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
    const realWageIncomeUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce(
      (sum, occ) => sum + baseAnnualWageUSD[occ] * reg.occupationPools[occ].wageIndex * reg.occupationPools[occ].employed, 0
    );
    const realUnemploymentBenefitsUSD = (Object.keys(reg.occupationPools) as OccupationType[]).reduce((sum, occ) => {
      const unemployedInPool = totalLaborForce * (calibratedShares[occ] ?? 0) - reg.occupationPools[occ].employed;
      return sum + baseAnnualWageUSD[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
    }, 0);
    reg.estimatedHouseholdIncomeUSD = Number(computeHouseholdDisposableIncomeUSD({
      wageIncomeUSD: realWageIncomeUSD,
      governmentSpendingWeeklyUSD: reg.governmentSpendingUSD,
      unemploymentBenefitsUSD: realUnemploymentBenefitsUSD,
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
      governmentSpendingWeeklyUSD: reg.governmentSpendingUSD,
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

  // Open the regions on their real trade position rather than at zero exports and zero imports,
  // using the same bilateral computation the weekly step runs (06-fx-and-trade.ts). Seeding this
  // before the GDP re-anchor below matters: net exports are a real component of the identity, and
  // starting them at zero made week 1 read the entire structural trade balance as a one-week
  // collapse in output.
  {
    const { exportsByRegion, importsByRegion } = computeBilateralTradeFlows(companies, regions, fxPairs);
    (Object.keys(regions) as RegionId[]).forEach((regionId) => {
      regions[regionId].exportsUSD = Number(exportsByRegion[regionId].toFixed(0));
      regions[regionId].importsUSD = Number(importsByRegion[regionId].toFixed(0));
      regions[regionId].tradeBalance = regions[regionId].exportsUSD - regions[regionId].importsUSD;
    });
  }

  const commodities = getInitialCommodities();
  const allGeneratedCompanies = companies;
  Object.keys(COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
    const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId];
    const calibratedShare = calibrateIntensityShare(commodityId, allGeneratedCompanies, regions, linkage.subUnitId);
    COMMODITY_CATEGORY_LINKAGE[commodityId] = { ...linkage, intensityShare: calibratedShare };
  });

  const topUsaCompanyIds = companies
    .filter(c => c.region === 'USA')
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 2)
    .map(c => c.id);
  const watchlist = [...topUsaCompanyIds, 'HEAVY_CRUDE_OIL', 'GOLD'];

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

  

  // ---- HC Wave 1 (HC1): the named private tier ----
  // Generated AFTER every public-derived bootstrap sum above (corporate demand bases, holdings
  // attribution, occupation seeds) so nothing here leaks into them — private firms enter the
  // goods and labor economies in HC3's conservation-checked handover, and their debt enters the
  // credit markets in HC2. What IS carved now, exactly, is debt: each firm's real ladder is
  // subtracted from its segment's aggregate, so total private debt is unchanged to the dollar.
  const privateTickers = new Set(companies.map(c => c.ticker));
  const privateNames = new Set(companies.map(c => c.name));
  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const segs = reg.privateSectorSegments || [];
    const seeds = generatePrivateFirmSeeds(regionId, segs);
    const firms = generatePrivateCompanies(regionId, seeds, reg.policyRate, privateTickers, privateNames);
    // Conservation with serviceability: each firm's ladder is what its REAL leverage supports —
    // never scaled up to hit a carve quota. The first version scaled ladders to carry
    // NAMED_TIER_DEBT_SHARE of the segment aggregate and promptly killed a third of the cohort:
    // the segment primitive (debtUSD = 2 x revenue) implies ~15x debt/EBITDA on the private
    // sector as a whole, which no real firm services. The named tier carries what real balance
    // sheets carry; the aggregate's excess stays on the segment as the SME mass's (and the
    // bootstrap's own unpriced) bank debt — flagged in the plan for HC2's split calibration.
    segs.forEach(seg => {
      const segFirms = firms.filter((f, i) => seeds[i].segmentType === seg.segmentType);
      const carvedUSD = segFirms.reduce((a, f) => a + f.totalDebt, 0);
      seg.debtUSD = Math.round(Math.max(0, seg.debtUSD - carvedUSD));
    });
    companies.push(...firms);
  });


  return {
    currentWeek: 1,
    year: 2026,
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
    watchlist,
    newsFeed: [
      {
        id: 'init_welcome',
        week: 1,
        title: 'Institutional Quant Trading Desk Initialized | Jan 05, 2026',
        description:
          'Portfolio unencumbered capital: $25,000,000 USD. Multi-region Nelson-Siegel curves, 200 corporate issuers, 3 Dealer axes, asynchronous quarterly earnings, and full Greeks attribution online.',
        category: 'MACRO',
        impactBadge: '[SYSTEM INIT]',
        sentimentDelta: 0.05,
        urgent: true,
      },
    ],
    turnSummary: null,
    selectedTab: 'macro',
    isTradeModalOpen: false,
    selectedInstrument: null,
    isNewsDrawerOpen: false,
    isWatchlistDrawerOpen: false,
    isCheatsheetOpen: false,
    isDiagnosticsOpen: false,
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
    chartModalData: null,
    isGameOver: false,
    gameOverReason: null,
  };
}



