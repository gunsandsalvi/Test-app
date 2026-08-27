/**
 * Stage 11: Itemized Holdings, Bottom-Up GDP, Fiscal Deficit & Sovereign Issuance
 *
 * Attributes bank/institutional sector holdings across corp/sov/equity instruments,
 * derives nominal GDP bottom-up from its C+I+G+NX components, rolls off matured
 * government debt tranches and issues new ones against the accumulated deficit on
 * a quarterly calendar, then generates this week's breaking news.
 */

import { GameState, RegionId, ItemizedHolding, GovDebtTranche } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { generateWeeklyNews } from '../../newsGenerator';
import { computeGovernmentPurchasesUSD } from '../../bootstrap/national-accounts';
import { attributeItemizedHoldings } from './shared-helpers';
import { WeeklyStepContext } from './context';

export function runFiscalAndSovereignDebtStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const { updatedRegions, updatedCompanies, nextWeek } = ctx;

  // Part ME: Itemized holdings attribution
  (Object.keys(updatedRegions) as RegionId[]).forEach(regionId => {
    const reg = updatedRegions[regionId];
    const regionCompanies = updatedCompanies.filter(c => c.region === regionId && isActiveCompany(c));

    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];

    regionCompanies.forEach(c => {
      equityCandidates.push({ id: c.id, type: 'EQUITY', region: regionId, outstandingUSD: c.marketCap });
      (c.debtTranches || []).forEach(t => {
        corpCandidates.push({
          id: t.id,
          type: t.rateType === 'FIXED' ? 'CORP_BOND' : 'LEVERAGED_LOAN',
          region: regionId,
          outstandingUSD: t.principalUSD
        });
      });
    });

    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = (reg.govDebtTranches || []).map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));

    const totalCorpUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalSovUSD = sovCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalEquityUSD = equityCandidates.reduce((s, c) => s + c.outstandingUSD, 0);

    // Banking Sector
    const bankCorpShareUSD = reg.corpBondOwnership.bankShare * totalCorpUSD;
    const bankSovShareUSD = reg.sovBondOwnership.bankShare * totalSovUSD;
    const bankEquityShareUSD = reg.equityOwnership.bankShare * totalEquityUSD;

    reg.bankingSector.itemizedHoldings = [
      ...attributeItemizedHoldings(bankCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(bankSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(bankEquityShareUSD, equityCandidates),
    ];

    // Institutional Sector
    const instCorpShareUSD = reg.corpBondOwnership.institutionalShare * totalCorpUSD;
    const instSovShareUSD = reg.sovBondOwnership.institutionalShare * totalSovUSD;
    const instEquityShareUSD = reg.equityOwnership.institutionalShare * totalEquityUSD;

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(instCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(instSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(instEquityShareUSD, equityCandidates),
    ];
  });

  // Phase 4a: Derived nominal GDP parallel diagnostic
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // C — household consumption, already-established convention
    const consumptionComponentUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);

    // I — tracked company investment, scaled up to represent the whole private sector via Phase 1's employment split
    const trackedFirms = updatedCompanies.filter(f => f.region === regionId && isActiveCompany(f));
    const trackedInvestmentUSD = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = (reg.privateSectorSegments || []).reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentUSD = trackedInvestmentUSD * investmentScaleFactor;

    // G — government PURCHASES of goods and services. Transfer payments are the rest of the
    // government's outlays and are deliberately not counted here: a transfer is not a purchase,
    // it is household income, and it reaches GDP through C once households spend it. Counting
    // 100% of outlays here (while the demand side in 03-category-demand.ts routed only the
    // procurement share into real category bids) double-counted every transfer dollar.
    const governmentComponentUSD = computeGovernmentPurchasesUSD(reg.governmentSpendingUSD);

    // NX — net exports, already established in Phase 3 (already annualized-scale)
    const netExportsComponentUSD = reg.exportsUSD - reg.importsUSD;

    const rawGdpUSD = consumptionComponentUSD + investmentComponentUSD + governmentComponentUSD + netExportsComponentUSD;
    const instantaneousNominalGdpUSD = Math.max(1e11, isFinite(rawGdpUSD) ? rawGdpUSD : 1e12);
    const gdpLevelLastWeek = (reg as any).lastWeekNominalGdpUSD > 0 ? (reg as any).lastWeekNominalGdpUSD : instantaneousNominalGdpUSD;
    // Real GDP is inherently a flow measured over a full quarter, not an instantaneous
    // snapshot — smoothing the level itself (not just the growth-rate metrics derived from it)
    // is what makes it behave that way. Without this, a single week's noise in any bottom-up
    // component (e.g. investmentComponentUSD, which scales tracked-firm capex up by a
    // total-private/tracked employment ratio that itself jumps whenever a company defaults or
    // merges) showed up directly as a 30-50% swing in the displayed absolute GDP number.
    const newDerivedNominalGdpUSD = gdpLevelLastWeek > 0 ? gdpLevelLastWeek * 0.9 + instantaneousNominalGdpUSD * 0.1 : instantaneousNominalGdpUSD;
    const isStartupTransition = gdpLevelLastWeek < newDerivedNominalGdpUSD * 0.2;
    const rawWeeklyRealGrowthRate = (!isStartupTransition && gdpLevelLastWeek > 0 && isFinite(newDerivedNominalGdpUSD) && isFinite(gdpLevelLastWeek))
      ? Math.max(-0.04, Math.min(0.04, (newDerivedNominalGdpUSD / gdpLevelLastWeek - 1) - (reg.inflation / 52)))
      : 0;
    const prevSmoothedWeeklyRate = (reg as any).smoothedWeeklyGrowthRate ?? rawWeeklyRealGrowthRate;
    // Kept for the fiscal output-gap signal in macro/evolution.ts, which wants a rough weekly
    // growth impulse — not used for the headline growth rate below any more (see next block).
    const smoothedWeeklyRate = prevSmoothedWeeklyRate * 0.85 + rawWeeklyRealGrowthRate * 0.15;

    // Headline GDP growth: a genuine trailing-52-week (year-over-year) comparison once a full
    // year of history exists, rather than extrapolating one already-smoothed week's rate via
    // (1+x)^52. That exponential annualization amplified tiny (~0.2-0.6%/week) residual noise
    // in smoothedWeeklyRate into wild-looking +/-10-40% headline swings even though the
    // underlying weekly activity was actually stable — nominalGdpHistory was tracked but never
    // actually populated, so there was no real trailing window to compare against.
    // A real year-over-year comparison: the window holds 53 levels so that index 0 is the level
    // exactly 52 weeks before the newest one. It used to keep 52 and compare against index 0,
    // which is 51 weeks back — a year-over-year reading taken a week short of a year.
    const gdpHistory = (reg as any).nominalGdpHistory ?? [];
    const updatedGdpHistory = [...gdpHistory.slice(-52), newDerivedNominalGdpUSD];
    const yearAgoGdpLevel = updatedGdpHistory.length >= 53 ? updatedGdpHistory[0] : null;
    // The bootstrap seeds a full trailing year (macro/initialization.ts), so the fallback below
    // is unreachable in a normal run and exists only for a state restored without history. It
    // reports the region's trend rate rather than annualizing one week via (1+x)^52: that
    // extrapolation is what converted the cold-start level transient into ~110% headline growth,
    // and it amplifies any weekly noise by construction whether or not a transient exists.
    const gdpGrowthBottomUp = (!isStartupTransition && yearAgoGdpLevel && yearAgoGdpLevel > 0 && isFinite(newDerivedNominalGdpUSD))
      ? (newDerivedNominalGdpUSD / yearAgoGdpLevel - 1) - reg.inflation
      : reg.potentialGdpGrowth;

    if (!isFinite(gdpGrowthBottomUp)) {
      throw new Error(`gdpGrowthBottomUp is non-finite for region ${regionId} at week ${nextWeek}: ${gdpGrowthBottomUp}. This must be fixed at its real source, not papered over with an assumed growth rate.`);
    }
    const finalGdpGrowth = gdpGrowthBottomUp;

    // Government Debt Tranches: roll-off and new issuance
    const maturedTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const liveTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek > nextWeek);
    const maturedPrincipalUSD = maturedTranches.reduce((s, t) => s + t.principalUSD, 0);

    // Redeem the maturing principal out of whoever actually holds it. Without this, a maturing
    // tranche vanished from the government's books while the banks and institutions that owned
    // it went on holding it: measured at week 52, holders owned 1.30x the ENTIRE two-year float,
    // bonds that no longer existed. The clearing engine then tried to trade that phantom position
    // down against a float a third of its former size, and since price impact scales with flow
    // over float, the two-year yield ran from 6% to 25% over the following weeks. Bonds that
    // matured have to leave the holder's book on the week they mature — that is what maturity is.
    //
    // Pro-rata within the tenor bucket, because a bucket is fungible: every holder of it owns a
    // proportional slice of every tranche inside it. Banks are credited the cash, which keeps
    // their balance sheet whole. Institutional entities have no itemized cash line to credit yet,
    // so their redemption currently reduces holdings only — the matching cash leg lands with the
    // rest of clearing settlement (see the work order's cash-settlement item).
    if (maturedPrincipalUSD > 0) {
      const bucketYears = [2, 5, 10, 30];
      const nearestBucket = (tenorAtIssuanceYears: number) =>
        bucketYears.reduce((best, y) =>
          Math.abs(y - tenorAtIssuanceYears) < Math.abs(best - tenorAtIssuanceYears) ? y : best);

      const maturedByBucket = new Map<string, number>();
      maturedTranches.forEach(t => {
        const key = `t${nearestBucket(t.tenorAtIssuanceYears)}`;
        maturedByBucket.set(key, (maturedByBucket.get(key) ?? 0) + t.principalUSD);
      });
      const preMaturityByBucket = new Map<string, number>();
      (reg.govDebtTranches || []).forEach(t => {
        const key = `t${nearestBucket(t.tenorAtIssuanceYears)}`;
        preMaturityByBucket.set(key, (preMaturityByBucket.get(key) ?? 0) + t.principalUSD);
      });
      const redeemedFractionByBucket = new Map<string, number>();
      maturedByBucket.forEach((maturedUSD, key) => {
        const preUSD = preMaturityByBucket.get(key) ?? 0;
        if (preUSD > 0) redeemedFractionByBucket.set(key, Math.min(1, maturedUSD / preUSD));
      });

      ctx.updatedCompanies = ctx.updatedCompanies.map(c => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return c;
        const byTenor = c.bankBalanceSheet.sovereignBondHoldingsByTenor || {};
        let redeemedUSD = 0;
        const newByTenor: Record<string, number> = {};
        Object.entries(byTenor).forEach(([key, heldUSD]) => {
          const fraction = redeemedFractionByBucket.get(key) ?? 0;
          redeemedUSD += heldUSD * fraction;
          newByTenor[key] = heldUSD * (1 - fraction);
        });
        if (redeemedUSD <= 0) return c;
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            sovereignBondHoldingsByTenor: newByTenor,
            sovereignBondHoldingsUSD: Number(Object.values(newByTenor).reduce((sum, v) => sum + v, 0).toFixed(0)),
            cashReservesUSD: c.bankBalanceSheet.cashReservesUSD + redeemedUSD,
          },
        };
      });

      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map(entity => {
        if (entity.region !== regionId) return entity;
        let touched = false;
        const newHoldings = entity.itemizedHoldings.map(h => {
          if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return h;
          const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
          const fraction = redeemedFractionByBucket.get(key) ?? 0;
          if (fraction <= 0) return h;
          touched = true;
          return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * (1 - fraction) };
        }).filter(h => h.quantityOrNotionalUSD > 1);
        return touched ? { ...entity, itemizedHoldings: newHoldings } : entity;
      });
    }

    const weeklyDeficitUSD = Math.max(0, reg.governmentSpendingUSD - reg.governmentRevenueUSD) + maturedPrincipalUSD;
    const monetizationShare = (reg.balanceSheetStance * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSD * monetizationShare;
    const marketFundedDeficitUSD = weeklyDeficitUSD - monetizedAmountUSD;

    // Sovereign debt issued in large, infrequent blocks
    const currentUnfundedDeficitUSD = (reg.pendingUnfundedDeficitUSD ?? 0) + marketFundedDeficitUSD;
    const issuanceCalendarWeek = nextWeek % 13 === 0; // large blocks roughly quarterly, not every week

    let quarterlyFundingNeedUSD = 0;
    let nextPendingUnfundedDeficitUSD = currentUnfundedDeficitUSD;
    const newTranches: GovDebtTranche[] = [];

    // Curve-smart tenor allocation: read the actual yield curve shape already computed for this region.
    const curveSteepness = reg.zeroRates.tenor30Y - reg.zeroRates.tenor2Y;
    const baseWeights = { t2: 0.30, t5: 0.30, t10: 0.25, t30: 0.15 };
    const steepnessAdjustment = (curveSteepness * 3);
    const tenorWeights = {
      t2: Math.max(0.10, baseWeights.t2 + steepnessAdjustment * 0.5),
      t5: baseWeights.t5,
      t10: Math.max(0.10, baseWeights.t10 - steepnessAdjustment * 0.3),
      t30: Math.max(0.05, baseWeights.t30 - steepnessAdjustment * 0.2),
    };
    const weightSum = tenorWeights.t2 + tenorWeights.t5 + tenorWeights.t10 + tenorWeights.t30;

    if (issuanceCalendarWeek) {
      quarterlyFundingNeedUSD = currentUnfundedDeficitUSD; // roll up 13 weeks of accumulated need into one real issuance event
      nextPendingUnfundedDeficitUSD = 0;

      if (quarterlyFundingNeedUSD > 1000) {
        ([['t2', 2, 104], ['t5', 5, 260], ['t10', 10, 520], ['t30', 30, 1560]] as const).forEach(([key, tenorYears, tenorWeeks]) => {
          const principal = quarterlyFundingNeedUSD * (tenorWeights[key] / weightSum);
          if (principal < 100) return;
          newTranches.push({
            id: `${regionId}-GOV-${tenorYears}Y-${nextWeek}`,
            principalUSD: principal,
            couponRate: calculateNelsonSiegelZeroRate(tenorYears, reg.yieldCurveParams), // priced off the region's own real curve
            originationWeek: nextWeek,
            maturityWeek: nextWeek + tenorWeeks,
            tenorAtIssuanceYears: tenorYears,
          });
        });
      }
    }

    const updatedBankingSector = { ...reg.bankingSector };
    const updatedInstitutionalSector = { ...reg.institutionalSector };

    // Market-funded deficit routes to bond holdings (institutional + bank)
    if (issuanceCalendarWeek) {
      updatedBankingSector.sovereignBondHoldingsUSD += quarterlyFundingNeedUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += quarterlyFundingNeedUSD * 0.60;
    } else {
      updatedBankingSector.sovereignBondHoldingsUSD += marketFundedDeficitUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += marketFundedDeficitUSD * 0.60;
    }

    if (updatedBankingSector.centralBankReservesUSD < 0) throw new Error("Invariant Violation: centralBankReservesUSD cannot be negative");
    updatedBankingSector.centralBankReservesUSD = Number(updatedBankingSector.centralBankReservesUSD.toFixed(0));

    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);
    const debtToGdpPctBottomUp = newDerivedNominalGdpUSD > 0 ? totalGovDebtUSD / newDerivedNominalGdpUSD : (reg.debtToGdpPctBottomUp || 0);

    updatedRegions[regionId] = {
      ...reg,
      gdpGrowth: finalGdpGrowth,
      estimatedNominalGdpUSD: newDerivedNominalGdpUSD,
      derivedNominalGdpUSD: newDerivedNominalGdpUSD,
      gdpGrowthBottomUp: Number(gdpGrowthBottomUp.toFixed(4)),
      smoothedWeeklyGrowthRate: smoothedWeeklyRate,
      lastWeekNominalGdpUSD: newDerivedNominalGdpUSD,
      nominalGdpHistory: updatedGdpHistory,
      consumptionComponentUSD,
      investmentComponentUSD,
      govDebtTranches: [...liveTranches, ...newTranches],
      debtToGdpPctBottomUp,
      pendingUnfundedDeficitUSD: nextPendingUnfundedDeficitUSD,
      bankingSector: updatedBankingSector,
      institutionalSector: updatedInstitutionalSector,
    };
  });

  const generatedNews = generateWeeklyNews(
    nextWeek,
    updatedRegions,
    updatedCompanies,
    ctx.rateChanges,
    ctx.ratingChanges,
    ctx.defaultedTickers,
    ctx.earningsReportedThisTurn
  );
  ctx.newsItems.push(...generatedNews.newsItems);
}
