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
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../../bootstrap/national-accounts';
import { buildCpiBasket, computeCpiLevel, CPI_BASKET_REBASE_WEEKS } from './price-index';
import { attributeItemizedHoldings, sovBucketKey } from './shared-helpers';
import {
  weeklyInterestExpenseUSD, sovereignCouponByBucket, decomposeGovernmentSpending, governmentOutlaysUSD,
  isDiscountBill, discountBillProceedsUSD, weeklyBillDiscountAccrualUSD,
} from '../../../domain/government';
import { centralBankSovereignBookUSD, openMarketPolicy, cashPositionBillIssuanceUSD } from '../../../domain/central-bank';
import { WeeklyStepContext } from './context';
import { refreshRegionalHoldingsView, measuredForeignOwnershipAllRegions, measuredOwnershipAllRegions, ownershipSharesFromRegister } from './holdings-view';
import { pay } from './settlement';

export function runFiscalAndSovereignDebtStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const { updatedRegions, updatedCompanies, nextWeek, currentWeekMod13 } = ctx;

  // S7: the sector holdings VIEW, derived from the real books. This replaces a weekly
  // mechanical rebuild that attributed an ownership-share-times-outstanding figure across
  // issuers with a greedy fill — a parallel ledger computed from a formula, sitting beside the
  // real per-entity books and free to disagree with them. Everything sector-level is now a
  // projection of what the clearing stages actually wrote; see stages/holdings-view.ts.
  //
  // Runs here because stage 11 is the statistics stage and every clearing stage (07b/07c/07d)
  // and S11's mark have already written their books by this point in the week.
  {
    const bookState = { ...state, regions: updatedRegions, institutionalEntities: ctx.updatedInstitutionalEntities, companies: updatedCompanies };
    // XB1: what foreigners actually own, measured off those same books — all four regions from
    // one pass (SCALE: the per-region call swept every holding four times).
    const foreignByRegion = measuredForeignOwnershipAllRegions(bookState);
    // OWN1: and what banks, institutions and the central bank own — the three shares that used
    // to be assigned at seed and drifted weekly, now read off the same books.
    const ownershipByRegion = measuredOwnershipAllRegions(bookState);
    (Object.keys(updatedRegions) as RegionId[]).forEach(regionId => {
      refreshRegionalHoldingsView(bookState, regionId, updatedRegions[regionId]);
      updatedRegions[regionId].measuredForeignOwnership = foreignByRegion[regionId];
      const m = ownershipByRegion[regionId];
      updatedRegions[regionId].equityOwnership = ownershipSharesFromRegister(m.equity);
      updatedRegions[regionId].corpBondOwnership = ownershipSharesFromRegister(m.corpBond);
      updatedRegions[regionId].sovBondOwnership = ownershipSharesFromRegister(m.sovBond);
    });
  }

  // Measure this week's real consumer price level from the prices stage 05's auction actually
  // cleared, and derive inflation as its year-over-year change. This is the only place inflation
  // is set; macro/evolution.ts carries the measured value forward rather than computing one.
  // Running it here, after the auction and alongside the GDP measurement, is also why the Taylor
  // rule in stage 02 reads LAST week's figure — which is how central banks actually work, acting
  // on the most recently published statistic rather than one that does not exist yet.
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    // SETL-B: what the named companies paid this week, carried so next week's tier wage bill is
    // the remainder rather than a second derivation.

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
    const totalPrivateEmployment = (reg.smePools || []).reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentUSD = trackedInvestmentUSD * investmentScaleFactor;

    // G — government PURCHASES of goods and services. Transfer payments are the rest of the
    // government's outlays and are deliberately not counted here: a transfer is not a purchase,
    // it is household income, and it reaches GDP through C once households spend it. Counting
    // 100% of outlays here (while the demand side in 03-category-demand.ts routed only the
    // procurement share into real category bids) double-counted every transfer dollar.
    // PUB1e: G is what the government's bids actually FILLED in stage 05, annualized — the same
    // number the treasury is debited by below. It used to be a formula here and a differently
    // allocated formula in the demand stage.
    const governmentComponentUSD = (reg.governmentProcurementSpentUSD ?? 0) * 52;

    // NX — net exports, already established in Phase 3 (already annualized-scale)
    const netExportsComponentUSD = reg.exportsUSD - reg.importsUSD;

    const rawGdpUSD = consumptionComponentUSD + investmentComponentUSD + governmentComponentUSD + netExportsComponentUSD;
    const instantaneousNominalGdpUSD = Math.max(1e11, isFinite(rawGdpUSD) ? rawGdpUSD : 1e12);
    const gdpLevelLastWeek = reg.lastWeekNominalGdpUSD > 0 ? reg.lastWeekNominalGdpUSD : instantaneousNominalGdpUSD;
    // Real GDP is inherently a flow measured over a full quarter, not an instantaneous
    // snapshot — smoothing the level itself (not just the growth-rate metrics derived from it)
    // is what makes it behave that way. Without this, a single week's noise in any bottom-up
    // component (e.g. investmentComponentUSD, which scales tracked-firm capex up by a
    // total-private/tracked employment ratio that itself jumps whenever a company defaults or
    // merges) showed up directly as a 30-50% swing in the displayed absolute GDP number.
    const newDerivedNominalGdpUSD = gdpLevelLastWeek > 0 ? gdpLevelLastWeek * 0.9 + instantaneousNominalGdpUSD * 0.1 : instantaneousNominalGdpUSD;
    const isStartupTransition = gdpLevelLastWeek < newDerivedNominalGdpUSD * 0.2;
    const rawWeeklyRealGrowthRate = (!isStartupTransition && gdpLevelLastWeek > 0 && isFinite(newDerivedNominalGdpUSD) && isFinite(gdpLevelLastWeek))
      // RULE 2, OPEN, and worse than an ordinary clamp: this bounds a MEASUREMENT. GDP here is
      // summed bottom-up from real settled activity, and the growth rate that sum implies is then
      // held inside +/-4%/wk before anyone reads it. A clamped statistic is not a statistic. If
      // the raw number is too noisy to publish, the smoothing two lines below is the honest tool.
      ? Math.max(-0.04, Math.min(0.04, (newDerivedNominalGdpUSD / gdpLevelLastWeek - 1) - (reg.inflation / 52)))
      : 0;
    const prevSmoothedWeeklyRate = reg.smoothedWeeklyGrowthRate ?? rawWeeklyRealGrowthRate;
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
    const gdpHistory = reg.nominalGdpHistory ?? [];
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
    /** PUB2b: what the central bank's own book was repaid this week, by bucket — the size of
     * next week's reinvestment order. */
    const cbRedeemedByBucket = new Map<string, number>();
    // CASH: what the treasury actually paid out to NAMED holders this week. The rest of the
    // maturity is owed to holders this model does not name, and is posted to the boundary below
    // rather than leaving the account with nothing recording where it went.
    let redemptionPaidUSD = 0;
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
        // CASH: the treasury REPAYS this holder. It used to be reserves appearing on the bank's
        // book while the TGA was debited in another stage — two direct mutations that paired,
        // which is not the same as being recorded.
        redemptionPaidUSD += redeemedUSD;
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: { kind: 'BANK_SECURITIES', ticker: c.ticker },
          amountUSD: redeemedUSD,
          reason: 'sovereign redemption',
        });
        // Collateral that matured is collateral that no longer exists, so the repo it secured
        // must release it — in reality the position is unwound or substituted out of the
        // redemption proceeds. Without this the pledge outlived the bond and every bank in a
        // region ended up pledging more than it held (measured at week 51, once PUB2b's central
        // bank started competing for the same paper and books ran closer to their encumbrance).
        const preBookUSD = Object.values(byTenor).reduce((sum, v) => sum + (Number(v) || 0), 0);
        const survivingShare = preBookUSD > 0 ? Math.max(0, 1 - redeemedUSD / preBookUSD) : 1;
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            sovereignBondHoldingsByTenor: newByTenor,
            sovereignBondHoldingsUSD: Math.round(Object.values(newByTenor).reduce((sum, v) => sum + v, 0)),
            repoEncumberedCollateralUSD: Number(
              ((c.bankBalanceSheet.repoEncumberedCollateralUSD ?? 0) * survivingShare).toFixed(0)
            ),
          },
        };
      });

      // G3a: A DESK IS A HOLDER. Its sovereign and bill inventory sits on the bank's own
      // `dealerDeskInventory`, keyed by the bucket instrument id, and nothing here redeemed it —
      // so a desk kept a claim on paper that had matured and the treasury paid somebody else's
      // share of it to the boundary.
      ctx.updatedCompanies = ctx.updatedCompanies.map(c => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return c;
        const sheet = c.bankBalanceSheet;
        const inv = sheet.dealerDeskInventory;
        if (!inv) return c;
        let redeemedUSD = 0;
        const newInv: typeof inv = { ...inv };
        (['sovereign bond', 'bill'] as const).forEach(book => {
          const rows = inv[book];
          if (!rows) return;
          newInv[book] = rows.map(r => {
            const key = r.instrumentId.replace(`${regionId}-GOV-`, '');
            const fraction = redeemedFractionByBucket.get(key) ?? 0;
            if (fraction <= 0) return r;
            redeemedUSD += r.inventoryUSD * fraction;
            return { ...r, inventoryUSD: r.inventoryUSD * (1 - fraction) };
          }).filter(r => Math.abs(r.inventoryUSD) > 1);
        });
        if (!(Math.abs(redeemedUSD) > 0)) return c;
        redemptionPaidUSD += redeemedUSD;
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: { kind: 'BANK_SECURITIES', ticker: c.ticker },
          amountUSD: redeemedUSD,
          reason: 'sovereign redemption',
        });
        // The write goes on `updatedCompanies`, not `companyUpdates`: stage 08 has already
        // rebuilt the array from that map and nothing reads it again this week.
        return { ...c, bankBalanceSheet: { ...sheet, dealerDeskInventory: newInv } };
      });

      // CASH: and the CORPORATE TREASURIES, which hold bills since they started bidding for them
      // in 07f. Their paper matured like everyone else's and nothing repaid them.
      ctx.updatedCompanies = ctx.updatedCompanies.map(c => {
        if (c.region !== regionId || c.isBankEntity) return c;
        const held = c.treasuryHoldings;
        if (!held || held.length === 0) return c;
        let redeemedUSD = 0;
        const newHeld = held.map(h => {
          const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
          const fraction = redeemedFractionByBucket.get(key) ?? 0;
          if (fraction <= 0) return h;
          redeemedUSD += h.quantityOrNotionalUSD * fraction;
          return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * (1 - fraction) };
        }).filter(h => h.quantityOrNotionalUSD > 1);
        if (!(redeemedUSD > 0)) return c;
        redemptionPaidUSD += redeemedUSD;
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: { kind: 'COMPANY', ticker: c.ticker },
          amountUSD: redeemedUSD,
          reason: 'sovereign redemption',
        });
        return { ...c, treasuryHoldings: newHeld };
      });

      // PUB2b: the central bank is a holder too, and used to be the one holder that never got
      // repaid — its book sat frozen at its seeded level while the tranches behind it matured,
      // so it held a claim on debt that no longer existed and its share of the stock drifted
      // 15.0% -> 11.4% over a year. There is no reserve leg: the treasury pays out of the TGA,
      // which is the CB's own liability, so a CB asset and a CB liability fall together.
      const cbSheet = reg.centralBankSheet;
      if (cbSheet) {
        const remaining: Record<string, number> = {};
        Object.entries(cbSheet.sovereignHoldingsByTenor || {}).forEach(([key, held]) => {
          const heldUSD = Number(held) || 0;
          const redeemedUSD = heldUSD * (redeemedFractionByBucket.get(key) ?? 0);
          if (redeemedUSD > 0) cbRedeemedByBucket.set(key, redeemedUSD);
          remaining[key] = heldUSD - redeemedUSD;
        });
        cbSheet.sovereignHoldingsByTenor = remaining;
      }

      // XB1: a holder of THIS region's paper, wherever it is domiciled. The `entity.region !==
      // regionId` filter that stood here repaid only the issuer's own institutions, so a foreign
      // holder's position never shrank and never got its money — the row below already tests
      // `h.issuerRegion`, which is the only test that belongs here.
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map(entity => {
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
        if (!touched) return entity;
        if (redeemedCashUSD > 0) {
          redemptionPaidUSD += redeemedCashUSD;
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: { kind: 'INSTITUTION', id: entity.id },
            amountUSD: redeemedCashUSD,
            reason: 'sovereign redemption',
          });
        }
        return { ...entity, itemizedHoldings: newHoldings };
      });
    }

    // WS5: bills and bonds are two funding programs. Maturing BILLS refinance as bills the same
    // week (a bill program is a perpetual roll); maturing BONDS join the quarterly bond calendar
    // as before. New deficit splits by a real treasury rule below.
    const maturedBillPrincipalUSD = maturedTranches
      .filter(t => sovBucketKey(t.tenorAtIssuanceYears).startsWith('b'))
      .reduce((s2, t) => s2 + t.principalUSD, 0);
    const maturedBondPrincipalUSD = maturedPrincipalUSD - maturedBillPrincipalUSD;

    // ---- PUB1b: what the government actually collected this week, from real payers. ----
    // Corporate tax arrives quarterly off the accrued liability (stage 08 remits it); the SME
    // pools and households pay weekly. `governmentRevenueUSD` is the sum of these plus the
    // named gap below — the model has no consumption or payroll tax, which is roughly half of a
    // real take, and shrinking the state to fit the bases that do exist would model a different
    // economy rather than a more honest one.
    // Each stream accrues weekly and is REMITTED on its own real calendar. Nothing here is paid
    // weekly any more: a business files quarterly, an employer deposits withheld income tax and
    // payroll tax monthly, and a merchant files its consumption-tax return quarterly. The
    // calendars are the point — they are what make a treasury account swing.
    const isQuarterEnd = currentWeekMod13 === 13;
    const isMonthEnd = nextWeek % 4 === 0;

    // SEG2g: the tier's tax has a payer now. Each segment accrues on its own earnings and
    // remits its own balance at quarter end, as a real payment from its book (this stage runs
    // after the week's settlement cutoff, so the money lands next cycle — a remittance date's
    // cash arriving a settlement day later). The regional accrual below stays as the statement's
    // smooth expectation; the PAYMENT is per segment.
    let smeAccrualWeeklyUSD = 0;
    (reg.smePools || []).forEach((sg) => {
      const accrualUSD = Math.max(0, sg.annualRevenueUSD * sg.marginPct) * reg.effectiveTaxRate / 52;
      smeAccrualWeeklyUSD += accrualUSD;
      sg.accruedTaxUSD = (sg.accruedTaxUSD ?? 0) + accrualUSD;
      if (isQuarterEnd && (sg.accruedTaxUSD ?? 0) > 0) {
        pay(ctx, {
          payer: { kind: 'SEGMENT', region: regionId, industry: sg.industry },
          payee: { kind: 'GOVERNMENT', region: regionId },
          amountUSD: sg.accruedTaxUSD!,
          reason: 'SME tax (quarterly remittance)',
        });
        sg.accruedTaxUSD = 0;
      }
    });
    const householdAccrualWeeklyUSD = (reg.householdState.cohorts ?? []).reduce((a, c) => a + c.taxUSD, 0) / 52;
    const consumptionAccrualWeeklyUSD = (reg.householdState.cohorts ?? []).reduce((a, c) => a + (c.consumptionTaxUSD ?? 0), 0) / 52;
    const payrollAccrualWeeklyUSD = reg.employerPayrollTaxWeeklyUSD ?? 0;

    reg.accruedSmeTaxUSD = (reg.accruedSmeTaxUSD ?? 0) + smeAccrualWeeklyUSD;
    reg.accruedHouseholdTaxUSD = (reg.accruedHouseholdTaxUSD ?? 0) + householdAccrualWeeklyUSD;
    reg.accruedConsumptionTaxUSD = (reg.accruedConsumptionTaxUSD ?? 0) + consumptionAccrualWeeklyUSD;
    reg.accruedPayrollTaxUSD = (reg.accruedPayrollTaxUSD ?? 0) + payrollAccrualWeeklyUSD;

    const smeTaxWeeklyUSD = isQuarterEnd ? reg.accruedSmeTaxUSD : 0;
    const consumptionTaxWeeklyUSD = isQuarterEnd ? reg.accruedConsumptionTaxUSD : 0;
    const householdTaxWeeklyUSD = isMonthEnd ? reg.accruedHouseholdTaxUSD : 0;
    const payrollTaxWeeklyUSD = isMonthEnd ? reg.accruedPayrollTaxUSD : 0;
    if (isQuarterEnd) { reg.accruedSmeTaxUSD = 0; reg.accruedConsumptionTaxUSD = 0; }
    if (isMonthEnd) { reg.accruedHouseholdTaxUSD = 0; reg.accruedPayrollTaxUSD = 0; }

    // HH: households remit their own tax. It used to be deducted inside the income identity and
    // credited to the treasury with no payer on either side — the household half of the same
    // one-sided flow as the transfers above. On the same real calendars as the accrual.
    if (householdTaxWeeklyUSD + consumptionTaxWeeklyUSD > 0) {
      pay(ctx, {
        payer: { kind: 'HOUSEHOLD', region: regionId },
        payee: { kind: 'GOVERNMENT', region: regionId },
        amountUSD: householdTaxWeeklyUSD + consumptionTaxWeeklyUSD,
        reason: 'household tax remittance',
      });
    }

    const corporateTaxWeeklyUSD = ctx.taxCollectedByRegion[regionId] ?? 0;
    reg.taxCollectedCorporateUSD = Math.round(corporateTaxWeeklyUSD);
    reg.taxCollectedSmeUSD = Math.round(smeTaxWeeklyUSD);
    reg.taxCollectedHouseholdUSD = Math.round(householdTaxWeeklyUSD);
    reg.taxCollectedPayrollUSD = Math.round(payrollTaxWeeklyUSD);
    reg.taxCollectedConsumptionUSD = Math.round(consumptionTaxWeeklyUSD);
    // The gap is sized against the SMOOTH expectation (corporate ACCRUAL, not the quarterly
    // remittance), so revenue keeps the real lumpiness instead of the residual absorbing it —
    // which is what makes a tax date swing the treasury's account at all.
    const smoothRealUSD = (ctx.taxAccruedByRegion[regionId] ?? 0)
      + smeAccrualWeeklyUSD + householdAccrualWeeklyUSD + consumptionAccrualWeeklyUSD + payrollAccrualWeeklyUSD;
    reg.unmodeledTaxRevenueUSD = Math.round(Math.max(0, reg.governmentRevenueUSD - smoothRealUSD));
    // Revenue IS what arrived: real collections on their own calendars, plus whatever base the
    // model still cannot tax.
    reg.governmentRevenueUSD = Math.round((
      corporateTaxWeeklyUSD + smeTaxWeeklyUSD + householdTaxWeeklyUSD
      + payrollTaxWeeklyUSD + consumptionTaxWeeklyUSD + reg.unmodeledTaxRevenueUSD
    ));

    // PUB1: the government's real interest bill. The treasury's ACCOUNT is the TGA, a liability
    // of the central bank — see stages/central-bank.ts, which moves it and the reserves with it.
    const interestWeeklyUSD = weeklyInterestExpenseUSD(reg.govDebtTranches);
    reg.governmentInterestWeeklyUSD = Math.round(interestWeeklyUSD);
    // Reported, never debited — the bill's cost is already in the redemption leg (PUB3d).
    reg.governmentBillDiscountAccrualUSD = Math.round(weeklyBillDiscountAccrualUSD(reg.govDebtTranches));
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
      reg.governmentInterestToUnmodeledHoldersUSD = Math.round(Math.max(0, interestWeeklyUSD - held));
    }

    // ---- PUB1e: what actually left the account. Interest and transfers are contractual and are
    // paid in full; procurement is what the goods market really supplied. A government that
    // cannot buy what it planned has not spent the money, and the remainder is named rather
    // than assumed spent. ----
    const govBudget = decomposeGovernmentSpending(
      reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyUSD ?? 0
    );
    const procurementSpentUSD = reg.governmentProcurementSpentUSD ?? 0;
    reg.governmentOutlaysUSD = Math.round(governmentOutlaysUSD({
      interestUSD: govBudget.interestUSD,
      payrollUSD: govBudget.payrollUSD,
      transfersUSD: govBudget.transfersUSD,
      procurementSpentUSD,
    }));
    reg.unspentProcurementBudgetUSD = Number(
      Math.max(0, govBudget.procurementBudgetUSD - procurementSpentUSD).toFixed(0)
    );

    const weeklyDeficitUSD = Math.max(0, reg.governmentOutlaysUSD - reg.governmentRevenueUSD) + maturedBondPrincipalUSD;

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
    const billFundedDeficitUSD = weeklyDeficitUSD * billShareOfNewMoney;
    const marketFundedDeficitUSD = weeklyDeficitUSD - billFundedDeficitUSD;

    // PUB3c: bond financing is quarterly but the government spends weekly, so between auctions
    // the TGA is the only thing absorbing the gap. When it falls below its operating balance the
    // bill program issues more. Sized off REALIZED outlays, so it responds to what went out.
    const cashBridgeIssuanceUSD = cashPositionBillIssuanceUSD({
      treasuryAccountUSD: reg.centralBankSheet?.treasuryAccountUSD ?? 0,
      weeklyOutlaysUSD: reg.governmentOutlaysUSD ?? reg.governmentSpendingUSD,
    });
    reg.cashBridgeBillIssuanceUSD = Math.round(cashBridgeIssuanceUSD);

    // Weekly bill issuance: the roll plus the bill share of new money, split across the three
    // programs, priced off the real cleared bill curve (07f ran before this stage).
    const newTranches: GovDebtTranche[] = [];
    const weeklyBillIssuanceUSD = maturedBillPrincipalUSD + billFundedDeficitUSD + cashBridgeIssuanceUSD;
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
    updatedBankingSector.centralBankReservesUSD = Math.round(updatedBankingSector.centralBankReservesUSD);

    // PUB1d: the new issue is NOT force-placed. It exists, and 07c prices the enlarged bucket
    // next week against budget-constrained demand, the dealer holding what finds no buyer —
    // which is what an undersubscribed auction IS.
    //
    // What this replaces scaled every holder's position up pro-rata and debited the cash with no
    // affordability check. Its stated reason — unheld paper made issuance a one-sided demand
    // shock and drove the 2Y negative — was true when written and stopped being true at S11 and
    // §7.21: budgets now bind what a holder buys, and `solveClearingStat` clears at the
    // saturation point instead of its search bound. A refusal outlives its reason (§7.51); so
    // does a workaround. Measured A/B: bank reserves at w40 −29.0B → +84.7B, 2Y at w26
    // 0.98% → 2.62%, no negative yields at w60, dealer residual 123B at w40.

    // PUB2: the financing legs the TGA needs — proceeds in, redemptions out.
    // PUB3d: a BILL is sold at a discount, so the treasury receives less than face and repays face
    // at maturity — that difference IS the bill's cost, and it is why bills carry no coupon. A
    // bond is sold at par and pays its coupon weekly. Discounting proceeds while ALSO paying a
    // coupon would charge the government twice for the same borrowing.
    // PUB: the treasury is NOT paid here. New paper joins the ladder unheld, and 07c/07f offer
    // it in the same auction that prices the outstanding stock — the clearing house pays the
    // treasury for whatever the week's demand takes, and what nobody takes is offered again.
    // That is a treasury auction, and it is what makes an undersubscribed one a real event.
    //
    // What this replaces credited the whole issue to the TGA the moment it was written, whether
    // or not any book bought it. The paper then sat with no holder until it matured, and the
    // redemption paid 51B to somebody who was never there.
    //
    // A DISCOUNT BILL is a known gap, recorded rather than papered over: this line used to
    // discount a bill's proceeds, but its BUYERS pay face in the clearing books and are repaid
    // face, so the bill's cleared yield reaches nobody's cash. The auction pays what the buyers
    // paid. Owner: the bill book's price/face split.
    reg.lastIssuanceProceedsUSD = 0;
    // PUB: what is left after every named holder has been repaid is UNSOLD PAPER, and a debt
    // nobody holds is owed to nobody. It matures and it is simply gone — no payee, no payment.
    //
    // This used to be a boundary line ("sovereign redemption (unmodeled holders)", measured at
    // 51B in a single week) on the reasoning that the money had to go SOMEWHERE. It did not: the
    // treasury was never paid for that paper either, because nobody bought it. Both halves are
    // closed now — the auction pays the treasury for what it places (07c/07f), and what it never
    // places costs the treasury nothing when it rolls off. The remainder here is therefore a
    // MEASURE OF UNDERSUBSCRIPTION at the front of the ladder, not a payment.
    {
      const cbRedeemedUSD = Array.from(cbRedeemedByBucket.values()).reduce((a, v) => a + v, 0);
      reg.lastUnsoldMaturedUSD = Math.round(
        Math.max(0, maturedPrincipalUSD - redemptionPaidUSD - cbRedeemedUSD));
    }
    // The TGA's own debit is the settlement layer's now, so the central-bank stage must not take
    // it a second time; what stays here is the REPORTED figure.
    // Only what was actually repaid: the unsold remainder above never left the account.
    reg.lastRedemptionPaidUSD = Math.round(
      (maturedPrincipalUSD - (reg.lastUnsoldMaturedUSD ?? 0)));

    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);

    // ---- PUB2b: the week's open-market order. What matured is put back to work (or not, in
    // QT), plus any QE flow the blocked easing calls for. It is placed as a real BID in 07c and
    // 07f next week — the central bank's policy is a quantity the auction prices against
    // everyone else's demand, never a premium bolted onto the curve. ----
    if (reg.centralBankSheet) {
      const cb = reg.centralBankSheet;
      // XB5: the open-market operation is about the SOVEREIGN book. FX reserves are also assets
      // but they are not what a bond purchase adds to.
      const bookUSD = centralBankSovereignBookUSD(cb);
      const { reinvestmentShare, netPurchaseUSD } = openMarketPolicy({
        policyRate: reg.policyRate,
        taylorTargetRate: reg.taylorTargetRate,
        bookUSD,
        sovereignStockUSD: totalGovDebtUSD,
      });
      // Reinvestment goes back into the bucket that matured — a maturing bill is rolled into
      // bills — so the book keeps its shape instead of drifting up the curve. New QE money is
      // spread across the book's existing shape for the same reason.
      const orders: Record<string, number> = {};
      cbRedeemedByBucket.forEach((redeemedUSD, key) => {
        orders[key] = redeemedUSD * reinvestmentShare;
      });
      if (netPurchaseUSD > 0 && bookUSD > 0) {
        Object.entries(cb.sovereignHoldingsByTenor).forEach(([key, held]) => {
          orders[key] = (orders[key] ?? 0) + netPurchaseUSD * ((Number(held) || 0) / bookUSD);
        });
      }
      cb.plannedPurchasesByTenor = orders;
      cb.reinvestmentShare = Number(reinvestmentShare.toFixed(4));
    }
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
