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
import { buildCpiBasket, computeCpiLevel, CPI_BASKET_REBASE_WEEKS } from './price-index';
import { attributeItemizedHoldings, sovBucketKey } from './shared-helpers';
import { weeklyInterestExpenseUSD, sovereignCouponByBucket } from '../../../domain/government';
import { WeeklyStepContext } from './context';
import { refreshRegionalHoldingsView } from './holdings-view';

export function runFiscalAndSovereignDebtStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const { updatedRegions, updatedCompanies, nextWeek } = ctx;

  // S7: the sector holdings VIEW, derived from the real books. This replaces a weekly
  // mechanical rebuild that attributed an ownership-share-times-outstanding figure across
  // issuers with a greedy fill — a parallel ledger computed from a formula, sitting beside the
  // real per-entity books and free to disagree with them. Everything sector-level is now a
  // projection of what the clearing stages actually wrote; see stages/holdings-view.ts.
  //
  // Runs here because stage 11 is the statistics stage and every clearing stage (07b/07c/07d)
  // and S11's mark have already written their books by this point in the week.
  (Object.keys(updatedRegions) as RegionId[]).forEach(regionId => {
    refreshRegionalHoldingsView(
      { ...state, institutionalEntities: ctx.updatedInstitutionalEntities, companies: updatedCompanies },
      regionId,
      updatedRegions[regionId]
    );
  });

  // Measure this week's real consumer price level from the prices stage 05's auction actually
  // cleared, and derive inflation as its year-over-year change. This is the only place inflation
  // is set; macro/evolution.ts carries the measured value forward rather than computing one.
  // Running it here, after the auction and alongside the GDP measurement, is also why the Taylor
  // rule in stage 02 reads LAST week's figure — which is how central banks actually work, acting
  // on the most recently published statistic rather than one that does not exist yet.
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];

    // Rebase annually onto current spending patterns, chain-linked from the current level so the
    // series has no step at the rebase — what a statistical agency does when consumption habits
    // have moved far enough that last year's weights no longer describe the basket people buy.
    if (nextWeek - reg.cpiBasket.baseWeek >= CPI_BASKET_REBASE_WEEKS || Object.keys(reg.cpiBasket.weightBySubUnit).length === 0) {
      reg.cpiBasket = buildCpiBasket(reg, nextWeek, computeCpiLevel(reg, reg.cpiBasket));
    }

    const cpiLevel = computeCpiLevel(reg, reg.cpiBasket);
    const coreCpiLevel = computeCpiLevel(reg, reg.cpiBasket, true);
    const cpiHistory = [...(reg.cpiHistory ?? []).slice(-52), cpiLevel];
    const coreCpiHistory = [...(reg.coreCpiHistory ?? []).slice(-52), coreCpiLevel];
    const yearAgoCpi = cpiHistory.length >= 53 ? cpiHistory[0] : null;
    const yearAgoCoreCpi = coreCpiHistory.length >= 53 ? coreCpiHistory[0] : null;

    reg.consumerPriceIndex = Number(cpiLevel.toFixed(6));
    reg.coreConsumerPriceIndex = Number(coreCpiLevel.toFixed(6));
    reg.cpiHistory = cpiHistory;
    reg.coreCpiHistory = coreCpiHistory;
    if (yearAgoCpi && yearAgoCpi > 0) reg.inflation = Number((cpiLevel / yearAgoCpi - 1).toFixed(4));
    if (yearAgoCoreCpi && yearAgoCoreCpi > 0) reg.coreInflation = Number((coreCpiLevel / yearAgoCoreCpi - 1).toFixed(4));
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
    const governmentComponentUSD = computeGovernmentPurchasesUSD(reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0);

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
      // sovBucketKey covers bills and bonds alike (WS5): a maturing 13-week bill redeems out of
      // its holders' b13 positions, never out of the two-year bucket a nearest-of-[2,5,10,30]
      // mapping would have silently folded it into.
      const maturedByBucket = new Map<string, number>();
      maturedTranches.forEach(t => {
        const key = sovBucketKey(t.tenorAtIssuanceYears);
        maturedByBucket.set(key, (maturedByBucket.get(key) ?? 0) + t.principalUSD);
      });
      const preMaturityByBucket = new Map<string, number>();
      (reg.govDebtTranches || []).forEach(t => {
        const key = sovBucketKey(t.tenorAtIssuanceYears);
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
        let redeemedCashUSD = 0;
        const newHoldings = entity.itemizedHoldings.map(h => {
          if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return h;
          const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
          const fraction = redeemedFractionByBucket.get(key) ?? 0;
          if (fraction <= 0) return h;
          touched = true;
          redeemedCashUSD += h.quantityOrNotionalUSD * fraction;
          return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * (1 - fraction) };
        }).filter(h => h.quantityOrNotionalUSD > 1);
        // The matching cash leg. The "no itemized cash line to credit yet" era this comment
        // used to describe ended when S11 gave every entity a real cashUSD — and bills (WS5)
        // made the gap weekly instead of quarterly, which is how the missing leg finally
        // showed up as a conservation violation.
        return touched
          ? { ...entity, cashUSD: (entity.cashUSD ?? 0) + redeemedCashUSD, itemizedHoldings: newHoldings }
          : entity;
      });
    }

    // WS5: bills and bonds are two funding programs. Maturing BILLS refinance as bills the same
    // week (a bill program is a perpetual roll); maturing BONDS join the quarterly bond calendar
    // as before. New deficit splits by a real treasury rule below.
    const maturedBillPrincipalUSD = maturedTranches
      .filter(t => sovBucketKey(t.tenorAtIssuanceYears).startsWith('b'))
      .reduce((s2, t) => s2 + t.principalUSD, 0);
    const maturedBondPrincipalUSD = maturedPrincipalUSD - maturedBillPrincipalUSD;

    // PUB1: the government's real interest bill. The treasury's ACCOUNT is the TGA, a liability
    // of the central bank — see stages/central-bank.ts, which moves it and the reserves with it.
    const interestWeeklyUSD = weeklyInterestExpenseUSD(reg.govDebtTranches);
    reg.governmentInterestWeeklyUSD = Number(interestWeeklyUSD.toFixed(0));
    // What the bill pays to holders that exist. The rest is the named boundary above.
    {
      const cb = sovereignCouponByBucket(reg.govDebtTranches, sovBucketKey);
      const held = ctx.updatedCompanies
        .filter(c => c.region === regionId && c.isBankEntity && c.bankBalanceSheet)
        .reduce((a, c) => a + Object.entries(c.bankBalanceSheet!.sovereignBondHoldingsByTenor || {})
          .reduce((x, [k, v]) => x + ((Number(v) || 0) * (cb[k] ?? 0)) / 52, 0), 0)
        + ctx.updatedInstitutionalEntities
          .filter(e => !e.isDefaulted)
          .reduce((a, e) => a + e.itemizedHoldings
            .filter(h => h.instrumentType === 'GOV_BOND' && h.issuerRegion === regionId)
            .reduce((x, h) => x + ((h.quantityOrNotionalUSD ?? 0) * (cb[h.instrumentId.replace(`${regionId}-GOV-`, '')] ?? 0)) / 52, 0), 0);
      reg.governmentInterestToUnmodeledHoldersUSD = Number(Math.max(0, interestWeeklyUSD - held).toFixed(0));
    }

    const weeklyDeficitUSD = Math.max(0, reg.governmentSpendingUSD - reg.governmentRevenueUSD) + maturedBondPrincipalUSD;
    const monetizationShare = (reg.balanceSheetStance * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSD * monetizationShare;

    // The treasury's bill rule: hold the bill share of the stock near target, leaning toward
    // bills when the front end is genuinely cheaper than the belly (positive carve of the real
    // cleared curve), away when it inverts. This is issuance policy, not a market outcome — the
    // market's answer comes back through 07f's cleared bill yields next week.
    const totalStockUSD = liveTranches.reduce((s2, t) => s2 + t.principalUSD, 0) || 1;
    const billStockUSD = liveTranches
      .filter(t => sovBucketKey(t.tenorAtIssuanceYears).startsWith('b'))
      .reduce((s2, t) => s2 + t.principalUSD, 0);
    const billShareOfStock = billStockUSD / totalStockUSD;
    const costLean = Math.max(-0.05, Math.min(0.05, (reg.zeroRates.tenor2Y - reg.zeroRates.tenor3M) * 2));
    const billShareTarget = Math.max(0.15, Math.min(0.25, 0.18 + costLean));
    // Steer the share toward target with the new-money flow: fund more of the deficit with bills
    // when under target, less when over.
    const billShareOfNewMoney = Math.max(0, Math.min(0.5, billShareTarget + (billShareTarget - billShareOfStock) * 2));
    const billFundedDeficitUSD = (weeklyDeficitUSD - monetizedAmountUSD) * billShareOfNewMoney;
    const marketFundedDeficitUSD = weeklyDeficitUSD - monetizedAmountUSD - billFundedDeficitUSD;

    // Weekly bill issuance: the roll plus the bill share of new money, split across the three
    // programs, priced off the real cleared bill curve (07f ran before this stage).
    const newTranches: GovDebtTranche[] = [];
    const weeklyBillIssuanceUSD = maturedBillPrincipalUSD + billFundedDeficitUSD;
    if (weeklyBillIssuanceUSD > 1000) {
      ([[13, 0.25, 0.4], [26, 0.5, 0.35], [52, 1, 0.25]] as const).forEach(([weeks, tenorYears, weight]) => {
        const principal = weeklyBillIssuanceUSD * weight;
        if (principal < 100) return;
        newTranches.push({
          id: `${regionId}-GOV-B${weeks}-${nextWeek}`,
          principalUSD: principal,
          couponRate: Number((tenorYears <= 0.3 ? reg.zeroRates.tenor3M : calculateNelsonSiegelZeroRate(tenorYears, reg.yieldCurveParams)).toFixed(4)),
          originationWeek: nextWeek,
          maturityWeek: nextWeek + weeks,
          tenorAtIssuanceYears: tenorYears,
        });
      });
    }

    // Sovereign debt issued in large, infrequent blocks
    const currentUnfundedDeficitUSD = (reg.pendingUnfundedDeficitUSD ?? 0) + marketFundedDeficitUSD;
    const issuanceCalendarWeek = nextWeek % 13 === 0; // large blocks roughly quarterly, not every week

    let quarterlyFundingNeedUSD = 0;
    let nextPendingUnfundedDeficitUSD = currentUnfundedDeficitUSD;

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

    // Place the new issue with the buyers who actually fund the government, the same way maturity
    // takes it back off them. A government does not leave a new bond sitting unowned: it auctions
    // it, and the existing holder base takes it down. Leaving it unheld made every issuance week
    // a large one-sided demand shock — participants' targets scale with the outstanding stock, so
    // the whole stock of new paper had to be bought back off nobody, and the two-year yield went
    // NEGATIVE while the policy rate sat near 3%.
    //
    // Allocated pro-rata to each holder's existing position in the same tenor bucket, with banks
    // paying for it out of the cash that maturity credits them — the same balance-sheet swap in
    // the opposite direction, so composition shifts and total assets do not jump. When a bank
    // runs its cash down funding the government it reaches for the standing repo facility, which
    // is exactly the real behaviour Phase 2 already models.
    //
    // This is placement, not underwriting: no fee, no book-building, no auction price discovery.
    // Those are the real primary market (see the work order's issuance item); this just stops the
    // secondary market from being handed a phantom seller every quarter.
    if (newTranches.length > 0) {
      const issuedByBucket = new Map<string, number>();
      newTranches.forEach(t => {
        const key = sovBucketKey(t.tenorAtIssuanceYears);
        issuedByBucket.set(key, (issuedByBucket.get(key) ?? 0) + t.principalUSD);
      });

      // Who currently holds each bucket, so the new paper lands in proportion to real positions.
      const heldByBucket = new Map<string, number>();
      ctx.updatedCompanies.forEach(c => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return;
        Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}).forEach(([key, usd]) => {
          heldByBucket.set(key, (heldByBucket.get(key) ?? 0) + usd);
        });
      });
      ctx.updatedInstitutionalEntities.forEach(entity => {
        if (entity.region !== regionId) return;
        entity.itemizedHoldings.forEach(h => {
          if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return;
          const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
          heldByBucket.set(key, (heldByBucket.get(key) ?? 0) + h.quantityOrNotionalUSD);
        });
      });

      // Bank and institutional holders together fund the market-held share of the new issue; the
      // rest is the foreign and central-bank base this slice still treats as passive.
      const placedShare = reg.sovBondOwnership.bankShare + reg.sovBondOwnership.institutionalShare;
      const takeUpFractionByBucket = new Map<string, number>();
      issuedByBucket.forEach((issuedUSD, key) => {
        const heldUSD = heldByBucket.get(key) ?? 0;
        if (heldUSD > 0) takeUpFractionByBucket.set(key, (issuedUSD * placedShare) / heldUSD);
      });

      ctx.updatedCompanies = ctx.updatedCompanies.map(c => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return c;
        const byTenor = c.bankBalanceSheet.sovereignBondHoldingsByTenor || {};
        let purchasedUSD = 0;
        const newByTenor: Record<string, number> = { ...byTenor };
        Object.entries(byTenor).forEach(([key, heldUSD]) => {
          const takeUp = takeUpFractionByBucket.get(key) ?? 0;
          if (takeUp <= 0) return;
          purchasedUSD += heldUSD * takeUp;
          newByTenor[key] = heldUSD * (1 + takeUp);
        });
        if (purchasedUSD <= 0) return c;
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            sovereignBondHoldingsByTenor: newByTenor,
            sovereignBondHoldingsUSD: Number(Object.values(newByTenor).reduce((sum, v) => sum + v, 0).toFixed(0)),
            cashReservesUSD: c.bankBalanceSheet.cashReservesUSD - purchasedUSD,
          },
        };
      });

      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map(entity => {
        if (entity.region !== regionId) return entity;
        let touched = false;
        let purchasedUSD = 0;
        const newHoldings = entity.itemizedHoldings.map(h => {
          if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return h;
          const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
          const takeUp = takeUpFractionByBucket.get(key) ?? 0;
          if (takeUp <= 0) return h;
          touched = true;
          purchasedUSD += h.quantityOrNotionalUSD * takeUp;
          return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * (1 + takeUp) };
        });
        // Paid for out of real cash — placement is a purchase, and with weekly bill rolls (WS5)
        // an unpaid one compounds fast enough to fail conservation inside a quarter.
        return touched
          ? { ...entity, cashUSD: (entity.cashUSD ?? 0) - purchasedUSD, itemizedHoldings: newHoldings }
          : entity;
      });
    }

    // PUB2: the financing legs the TGA needs — proceeds in, redemptions out.
    reg.lastIssuanceProceedsUSD = Number(newTranches.reduce((a, t) => a + t.principalUSD, 0).toFixed(0));
    reg.lastRedemptionPaidUSD = Number(maturedPrincipalUSD.toFixed(0));

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
    ctx.earningsReportedThisTurn,
    ctx.updatedCommodities
  );
  ctx.newsItems.push(...generatedNews.newsItems);
}
