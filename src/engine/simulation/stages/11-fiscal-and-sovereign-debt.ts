/**
 * Stage 11: Itemized Holdings, Bottom-Up GDP, Fiscal Deficit & Sovereign Issuance
 *
 * Attributes bank/institutional sector holdings across corp/sov/equity instruments,
 * derives nominal GDP bottom-up from its C+I+G+NX components, rolls off matured
 * government debt tranches and issues new ones against the accumulated deficit on
 * a quarterly calendar, then generates this week's breaking news.
 */

import { treasuryAccountOf, waysAndMeansOf } from '../../ledger/accounts';
import { publishRepoBook, repoBookOf } from '../../ledger/contract-ledger';
import { bankSecuritiesParty, bankSecuritiesPartyOf, bankPartyOf, companyParty } from '../../../domain/party';
import { retireTranche, issueTranche, commitLadder } from '../../ledger/tranche-ledger';
import { materializeGovLadder, ladderRowsOf, trancheIdOf } from '../../../engine2/tranches';
import { govBillTrancheId, govBondTrancheId } from '../../../domain/sovereign-id';
import { GameState, RegionId, GovDebtTranche } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { curvePointAt } from '../../nelsonSiegel';
import { generateWeeklyNews } from '../../newsGenerator';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../../bootstrap/national-accounts';
import { buildCpiBasket, computeCpiLevel, CPI_BASKET_REBASE_WEEKS } from './price-index';
import { weeklyInterestExpenseLocal, decomposeGovernmentSpending, governmentOutlaysLocal, weeklyBillDiscountAccrualLocal, isDiscountBill } from '../../../domain/government';
import { openMarketPolicy, cashPositionBillIssuanceLocal } from '../../../domain/central-bank';
import { centralBankPositions, centralBankBookLocal, bankSovereignPositions, sovereignRowsOf } from '../../sovereign-register';
import { WeeklyStepContext } from './context';
import { refreshRegionalHoldingsView, measuredForeignOwnershipAllRegions, measuredOwnershipAllRegions, ownershipSharesFromRegister } from './holdings-view';
import { pay, dueToPayee, partyId, internReason, CORPORATE_TAX_REASON, settlementWeek } from './settlement';
import { retireHolding, issueHolding } from '../../ledger/holdings-ledger';
import { deskRowsOf } from '../../desk-register';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../../../engine2/holdings';
import { internType, internRegion } from '../../../engine2/world';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { repoBorrowedLocal, srfBorrowedLocal } from '../../../domain/repo';
import { usdToLocal } from '../../../domain/currency';
import type { InstrumentId } from '../../../domain/ids';
import { governmentIssuer } from '../../../domain/entity-keys';

export function runFiscalAndSovereignDebtStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds = REGION_IDS;
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
    // A year of real weeks, or no year-over-year number at all: until then `inflation` is the
    // opening assumption it was seeded with, and the flag says so to everything that reports it.
    reg.inflationIsMeasured = !!(yearAgoCpi && yearAgoCpi > 0);
    if (yearAgoCpi && yearAgoCpi > 0) reg.inflation = Number((cpiLevel / yearAgoCpi - 1).toFixed(4));
    if (yearAgoCoreCpi && yearAgoCoreCpi > 0) reg.coreInflation = Number((coreCpiLevel / yearAgoCoreCpi - 1).toFixed(4));
  });

  // Phase 4a: Derived nominal GDP parallel diagnostic
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // C — household consumption, already-established convention
    const consumptionComponentLocal = reg.estimatedHouseholdIncomeLocal * (1 - hs.savingsRate);

    // I — tracked company investment, scaled up to represent the whole private sector via Phase 1's employment split
    const trackedFirms = updatedCompanies.filter(f => f.region === regionId && isActiveCompany(f));
    const trackedInvestmentLocal = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = reg.smePools.reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentLocal = trackedInvestmentLocal * investmentScaleFactor;

    // G — government PURCHASES of goods and services. Transfer payments are the rest of the
    // government's outlays and are deliberately not counted here: a transfer is not a purchase,
    // it is household income, and it reaches GDP through C once households spend it. Counting
    // 100% of outlays here (while the demand side in 03-category-demand.ts routed only the
    // procurement share into real category bids) double-counted every transfer dollar.
    // PUB1e: G is what the government's bids actually FILLED in stage 05, annualized — the same
    // number the treasury is debited by below. It used to be a formula here and a differently
    // allocated formula in the demand stage.
    const governmentComponentLocal = (reg.governmentProcurementSpentLocal ?? 0) * 52;

    // NX — net exports, annualized. §6.1's money-locality row, first verified casualty fixed:
    // `exportsLocal`/`importsLocal` are GENUINE USD (05 converts every cross-border lot at the
    // cleared rate before the bilateral table sums a world total), while C, I and G above are
    // REGION-LOCAL money. Adding them raw put a dollar figure inside a yen identity; the NX
    // component converts back to this region's own money before it joins.
    const netExportsComponentLocal = usdToLocal(reg.exportsLocal - reg.importsLocal, regionId, ctx.getFxToUsd);

    const rawGdpLocal = consumptionComponentLocal + investmentComponentLocal + governmentComponentLocal + netExportsComponentLocal;
    const instantaneousNominalGdpLocal = Math.max(1e11, isFinite(rawGdpLocal) ? rawGdpLocal : 1e12);
    const gdpLevelLastWeek = reg.lastWeekNominalGdpLocal > 0 ? reg.lastWeekNominalGdpLocal : instantaneousNominalGdpLocal;
    // Real GDP is inherently a flow measured over a full quarter, not an instantaneous
    // snapshot — smoothing the level itself (not just the growth-rate metrics derived from it)
    // is what makes it behave that way. Without this, a single week's noise in any bottom-up
    // component (e.g. investmentComponentLocal, which scales tracked-firm capex up by a
    // total-private/tracked employment ratio that itself jumps whenever a company defaults or
    // merges) showed up directly as a 30-50% swing in the displayed absolute GDP number.
    const newDerivedNominalGdpLocal = gdpLevelLastWeek > 0 ? gdpLevelLastWeek * 0.9 + instantaneousNominalGdpLocal * 0.1 : instantaneousNominalGdpLocal;
    const isStartupTransition = gdpLevelLastWeek < newDerivedNominalGdpLocal * 0.2;
    const rawWeeklyRealGrowthRate = (!isStartupTransition && gdpLevelLastWeek > 0 && isFinite(newDerivedNominalGdpLocal) && isFinite(gdpLevelLastWeek))
      // RULE 2, OPEN, and worse than an ordinary clamp: this bounds a MEASUREMENT. GDP here is
      // summed bottom-up from real settled activity, and the growth rate that sum implies is then
      // held inside +/-4%/wk before anyone reads it. A clamped statistic is not a statistic. If
      // the raw number is too noisy to publish, the smoothing two lines below is the honest tool.
      ? Math.max(-0.04, Math.min(0.04, (newDerivedNominalGdpLocal / gdpLevelLastWeek - 1) - (reg.inflation / 52)))
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
    const updatedGdpHistory = [...gdpHistory.slice(-52), newDerivedNominalGdpLocal];
    const yearAgoGdpLevel = updatedGdpHistory.length >= 53 ? updatedGdpHistory[0] : null;
    // The bootstrap seeds a full trailing year (macro/initialization.ts), so the fallback below
    // is unreachable in a normal run and exists only for a state restored without history. It
    // reports the region's trend rate rather than annualizing one week via (1+x)^52: that
    // extrapolation is what converted the cold-start level transient into ~110% headline growth,
    // and it amplifies any weekly noise by construction whether or not a transient exists.
    const gdpGrowthBottomUp = (!isStartupTransition && yearAgoGdpLevel && yearAgoGdpLevel > 0 && isFinite(newDerivedNominalGdpLocal))
      ? (newDerivedNominalGdpLocal / yearAgoGdpLevel - 1) - reg.inflation
      : reg.potentialGdpGrowth;

    if (!isFinite(gdpGrowthBottomUp)) {
      throw new Error(`gdpGrowthBottomUp is non-finite for region ${regionId} at week ${nextWeek}: ${gdpGrowthBottomUp}. This must be fixed at its real source, not papered over with an assumed growth rate.`);
    }
    const finalGdpGrowth = gdpGrowthBottomUp;

    // Government Debt Tranches: roll-off and new issuance
    // §3.13-SOV row 2: the rebuild's own inputs come from the ONE store now, so the array is
    // written here and read nowhere in the weekly loop.
    const ladderNow = materializeGovLadder(ctx.v2, regionId);
    const maturedTranches = ladderNow.filter(t => t.maturityWeek <= nextWeek);
    const liveTranches = ladderNow.filter(t => t.maturityWeek > nextWeek);
    const maturedPrincipalLocal = maturedTranches.reduce((s, t) => s + t.principalLocal, 0);

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
    const cbRedeemedByBond = new Map<string, number>();
    // CASH: what the treasury actually paid out to NAMED holders this week. The rest of the
    // maturity is owed to holders this model does not name, and is posted to the boundary below
    // rather than leaving the account with nothing recording where it went.
    let redemptionPaidLocal = 0;
    if (maturedPrincipalLocal > 0) {
      // §3.13-SOV row 3: A BOND EITHER MATURED OR IT DID NOT. The redemption used to be a
      // FRACTION per tenor bucket — matured face over the bucket's face — applied to every
      // holder's position in that bucket, so a holder of a bond that had NOT matured had part of
      // it redeemed because a different bond of similar tenor had. Now the id says which paper
      // came due, and the fraction is 1 for that bond and 0 for every other.
      const redeemedFractionByBond = new Map<InstrumentId, number>(
        maturedTranches.filter((t) => t.principalLocal > 0).map((t) => [t.id, 1] as const)
      );

      // §7.247 — THE PLEDGE FOLLOWS THE PAPER ON THE BOOK ITSELF, AT THE MATURITY SITE.
      //
      // The comment below has stated the right rule since PUB2b, and what it updated was the
      // SCALAR (`repoEncumberedCollateralLocal × survivingShare`) while the repoBook's per-bucket
      // pledges survived — §1.4's two representations, with the reconcile and the check both
      // reading the BOOK. The stage-order reconcile then trimmed each week's pledge to LAST
      // week's holding, so a bill-pledging bank printed over-pledged by exactly one week's
      // maturities, forever (measured: WMQC b13 pledged 1.577B against 1.510B held, the two
      // stepping down in lockstep one week apart — §7.226's family, root-caused). Each pledge
      // in a redeemed bucket now shrinks by the bucket's redeemed fraction and the loan it
      // secures is called pro rata — unwound out of the redemption proceeds the borrower is
      // paid this same pass, settling at the close like the redemption itself.
      const collateralCalledByBorrower = new Map<string, number>();
      if (redeemedFractionByBond.size > 0) {
        // §3.13-BOOK d4c-ii: the region's book, off the store; the calls below shrink the
        // contracts in place and the book goes back through the ledger's door after the pass.
        const repoBook = repoBookOf(ctx.v2, regionId);
        repoBook.forEach((ct) => {
          if (ct.principalLocal <= 0 || ct.collateral.length === 0) return;
          let releasedFaceLocal = 0;
          let pledgedFaceLocal = 0;
          ct.collateral = ct.collateral.map((p) => {
            pledgedFaceLocal += p.faceLocal;
            const fraction = redeemedFractionByBond.get(p.bondId) ?? 0;
            if (fraction <= 0) return p;
            const takeLocal = p.faceLocal * fraction;
            releasedFaceLocal += takeLocal;
            return { ...p, faceLocal: p.faceLocal - takeLocal };
          }).filter((p) => p.faceLocal > 1);
          if (releasedFaceLocal <= 0 || pledgedFaceLocal <= 0) return;
          const callLocal = Math.min(ct.principalLocal, ct.principalLocal * (releasedFaceLocal / pledgedFaceLocal));
          ct.principalLocal -= callLocal;
          collateralCalledByBorrower.set(ct.borrowerId,
            (collateralCalledByBorrower.get(ct.borrowerId) ?? 0) + callLocal);
          pay(ctx, {
            payer: bankSecuritiesPartyOf(ct.borrowerId),
            // §3.13-BOOK d4a: the lender is a party; a bank lends from its securities account.
            payee: ct.lender.kind === 'BANK' ? bankSecuritiesParty(ct.lender) : ct.lender,
            amount: callLocal,
            currency: currencyOf(regionId),
            reason: 'repo collateral call',
          });
        });
        publishRepoBook(ctx.v2, regionId, repoBook);
      }

      ctx.updatedCompanies = ctx.updatedCompanies.map(c => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return c;
        // §3.13-BOOK d3b: the bank's book is register rows — a matured slice is RETIRED to the
        // treasury by wire, the ledger debits the row, and the treasury repays FACE to the BANK
        // party whose reserves bought it (it used to be paid into the securities account).
        let redeemedLocal = 0;
        bankSovereignPositions(ctx.v2, c.id).forEach((p) => {
          const fraction = redeemedFractionByBond.get(p.bondId) ?? 0;
          if (!(fraction > 0)) return;
          const faceLocal = p.faceLocal * fraction;
          if (!(faceLocal > 0)) return;
          retireHolding(ctx.v2, bankPartyOf(c.id), { kind: 'GOVERNMENT', region: regionId },
            { instrumentType: 'GOV_BOND', instrumentId: p.bondId, issuerRegion: regionId, valueLocal: p.valueLocal * fraction, units: faceLocal }, 'sovereign redemption');
          redeemedLocal += faceLocal;
        });
        const calledLocal = collateralCalledByBorrower.get(c.ticker) ?? 0;
        if (redeemedLocal <= 0 && calledLocal <= 0) return c;
        // CASH: the treasury REPAYS this holder. It used to be reserves appearing on the bank's
        // book while the TGA was debited in another stage — two direct mutations that paired,
        // which is not the same as being recorded.
        if (redeemedLocal > 0) {
          redemptionPaidLocal += redeemedLocal;
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: bankPartyOf(c.id),
            amount: redeemedLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign redemption',
          });
        }
        // Collateral that matured is collateral that no longer exists, so the repo it secured
        // released it above — on the book, where the reconcile and the check read. The scalars
        // are recomputed FROM the book (rule 4: one owner), not scaled beside it.
        const book = repoBookOf(ctx.v2, regionId);
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            repoBorrowedLocal: Math.round(repoBorrowedLocal(book, c.id) - srfBorrowedLocal(book, c.id)),
            srfBorrowingLocal: Math.round(srfBorrowedLocal(book, c.id)),
          },
        };
      });

      // G3a: A DESK IS A HOLDER. §3.13-BOOK d3d: its sovereign inventory is register rows on the
      // bank's securities book (the bills and the bonds share one kind), and a matured slice
      // retires to the treasury by wire like the bank's own book, the treasury repaying FACE to
      // the securities account that bought it. A desk that is SHORT the bucket owes the face
      // instead: the treasury's redemption closes its row and the desk pays.
      ctx.updatedCompanies.forEach((c) => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return;
        let redeemedLocal = 0, owedLocal = 0;
        deskRowsOf(ctx.v2, c.id, 'GOV_BOND').forEach((p) => {
          const fraction = redeemedFractionByBond.get(p.instrumentId) ?? 0;
          if (!(fraction > 0)) return;
          const faceLocal = Math.abs(p.units) * fraction;
          if (!(faceLocal > 0)) return;
          const spec = { instrumentType: 'GOV_BOND' as const, instrumentId: p.instrumentId, issuerRegion: regionId, valueLocal: Math.abs(p.inventoryLocal) * fraction, units: faceLocal };
          if (p.units < 0) {
            issueHolding(ctx.v2, { kind: 'GOVERNMENT', region: regionId }, bankSecuritiesParty(c), spec, 'sovereign redemption: short covered');
            owedLocal += faceLocal;
          } else {
            retireHolding(ctx.v2, bankSecuritiesParty(c), { kind: 'GOVERNMENT', region: regionId }, spec, 'sovereign redemption');
            redeemedLocal += faceLocal;
          }
        });
        if (redeemedLocal > 0) {
          redemptionPaidLocal += redeemedLocal;
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: bankSecuritiesParty(c),
            amount: redeemedLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign redemption',
          });
        }
        if (owedLocal > 0) {
          redemptionPaidLocal -= owedLocal;
          pay(ctx, {
            payer: bankSecuritiesParty(c),
            payee: { kind: 'GOVERNMENT', region: regionId },
            amount: owedLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign redemption',
          });
        }
      });

      // CASH: and the CORPORATE TREASURIES, which hold bills since they started bidding for them
      // in 07f. Their paper matured like everyone else's and nothing repaid them.
      // §3.13-BOOK d3c: the treasury's book is register rows — a matured slice is RETIRED to the
      // treasury by wire, the ledger debits the row, and the government repays FACE.
      ctx.updatedCompanies.forEach(c => {
        if (c.region !== regionId || c.isBankEntity) return;
        let redeemedLocal = 0;
        sovereignRowsOf(ctx.v2, c.id).forEach((p) => {
          const fraction = redeemedFractionByBond.get(p.bondId) ?? 0;
          if (!(fraction > 0)) return;
          const faceLocal = p.faceLocal * fraction;
          if (!(faceLocal > 0)) return;
          retireHolding(ctx.v2, companyParty(c), { kind: 'GOVERNMENT', region: regionId },
            { instrumentType: 'GOV_BOND', instrumentId: p.bondId, issuerRegion: regionId, valueLocal: p.valueLocal * fraction, units: faceLocal }, 'sovereign redemption');
          redeemedLocal += faceLocal;
        });
        if (!(redeemedLocal > 0)) return;
        redemptionPaidLocal += redeemedLocal;
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee: companyParty(c),
          amount: redeemedLocal,
          currency: currencyOf(regionId),
          reason: 'sovereign redemption',
        });
      });

      // PUB2b: the central bank is a holder too, and used to be the one holder that never got
      // repaid — its book sat frozen at its seeded level while the tranches behind it matured,
      // so it held a claim on debt that no longer existed and its share of the stock drifted
      // 15.0% -> 11.4% over a year.
      // §5-CLOSE C5: and it is PAID, like every other holder — GOVERNMENT → CENTRAL_BANK, so the
      // treasury's account falls with the central bank's book. The comment that stood here said
      // "a CB asset and a CB liability fall together" while the code wrote only the asset: every
      // week the central bank's matured paper vanished from its book, the treasury kept the
      // money, and the reinvestment bought new paper with reserves created against nothing —
      // the creator M1 measured once the treasury's statement stopped masking it (§7.354).
      const cbSheet = reg.centralBankSheet;
      if (cbSheet) {
        // §3.13-BOOK d3a: the central bank's book is register rows, so a matured slice is RETIRED
        // to the treasury by wire like every other holder's — the ledger debits the row and
        // unlinks it when empty. The treasury repays FACE; the row gives up its value pro rata.
        let cbRedeemedLocal = 0;
        centralBankPositions(ctx.v2, regionId).forEach((p) => {
          const fraction = redeemedFractionByBond.get(p.bondId) ?? 0;
          if (!(fraction > 0)) return;
          const redeemedFaceLocal = p.faceLocal * fraction;
          if (!(redeemedFaceLocal > 0)) return;
          retireHolding(ctx.v2, { kind: 'CENTRAL_BANK', region: regionId }, { kind: 'GOVERNMENT', region: regionId },
            { instrumentType: 'GOV_BOND', instrumentId: p.bondId, issuerRegion: regionId, valueLocal: p.valueLocal * fraction, units: redeemedFaceLocal }, 'sovereign redemption');
          cbRedeemedByBond.set(p.bondId, (cbRedeemedByBond.get(p.bondId) ?? 0) + redeemedFaceLocal);
          cbRedeemedLocal += redeemedFaceLocal;
        });
        if (cbRedeemedLocal > 0) {
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: { kind: 'CENTRAL_BANK', region: regionId },
            amount: cbRedeemedLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign redemption to the central bank',
          });
        }
      }

      // XB1: a holder of THIS region's paper, wherever it is domiciled. The `entity.region !==
      // regionId` filter that stood here repaid only the issuer's own institutions, so a foreign
      // holder's position never shrank and never got its money — the row below already tests
      // `h.issuerRegion`, which is the only test that belongs here.
      // §7.313 flip — the redemption scales rows in place and relinks past the dust; the cash
      // leg reads the same rows in the same order.
      const Hsov = ctx.v2.holdings;
      const govBondRefS = internType(ctx.v2, 'GOV_BOND');
      const regionRefS = internRegion(ctx.v2, regionId);
      ctx.updatedInstitutionalEntities.forEach(entity => {
        // §5-WIRES W2: each matured slice is RETIRED to the treasury by wire; the ledger debits
        // the row and unlinks it when empty.
        const redeem: { id: InstrumentId; usd: number; faceLocal: number }[] = [];
        for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = Hsov.next[r]) {
          if (Hsov.typeRef[r] !== govBondRefS || Hsov.regionRef[r] !== regionRefS) continue;
          const id = instrumentIdAt(ctx.v2, r);
          const fraction = redeemedFractionByBond.get(id) ?? 0;
          if (fraction <= 0) continue;
          // §3.13-BOOK d3a: a maturity pays FACE (`the-register.md` E2). This paid the row's
          // marked VALUE times the fraction, which is face only while the mark is par — a bill
          // bought at a discount was repaid at the discount, and a bond marked above par above it.
          redeem.push({ id, usd: Hsov.qtyLocal[r] * fraction, faceLocal: rowUnits(Hsov, r) * fraction });
        }
        if (redeem.length === 0) return;
        let redeemedCashLocal = 0;
        redeem.forEach((x) => {
          retireHolding(ctx.v2, { kind: 'INSTITUTION', id: entity.id }, { kind: 'GOVERNMENT', region: regionId },
            { instrumentType: 'GOV_BOND', instrumentId: x.id, issuerRegion: regionId, valueLocal: x.usd, units: x.faceLocal }, 'sovereign redemption');
          redeemedCashLocal += x.faceLocal;
        });
        if (redeemedCashLocal > 0) {
          redemptionPaidLocal += redeemedCashLocal;
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: { kind: 'INSTITUTION', id: entity.id },
            amount: redeemedCashLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign redemption',
          });
        }
      });
    }

    // WS5: bills and bonds are two funding programs. Maturing BILLS refinance as bills the same
    // week (a bill program is a perpetual roll); maturing BONDS join the quarterly bond calendar
    // as before. New deficit splits by a real treasury rule below.
    const maturedBillPrincipalLocal = maturedTranches
      .filter(t => isDiscountBill(t.tenorAtIssuanceYears))
      .reduce((s2, t) => s2 + t.principalLocal, 0);
    const maturedBondPrincipalLocal = maturedPrincipalLocal - maturedBillPrincipalLocal;

    // ---- PUB1b: what the government actually collected this week, from real payers. ----
    // Corporate tax arrives quarterly off the accrued liability (stage 08 remits it); the SME
    // pools and households pay weekly. `governmentRevenueLocal` is the sum of these plus the
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
    let smeAccrualWeeklyLocal = 0;
    reg.smePools.forEach((sg) => {
      const accrualLocal = Math.max(0, sg.annualRevenueLocal * sg.marginPct) * reg.effectiveTaxRate / 52;
      smeAccrualWeeklyLocal += accrualLocal;
      sg.accruedTaxLocal = (sg.accruedTaxLocal ?? 0) + accrualLocal;
      if (isQuarterEnd && (sg.accruedTaxLocal ?? 0) > 0) {
        pay(ctx, {
          payer: { kind: 'SEGMENT', region: regionId, industry: sg.industry },
          payee: { kind: 'GOVERNMENT', region: regionId },
          amount: sg.accruedTaxLocal!,
          currency: currencyOf(regionId),
          reason: 'SME tax (quarterly remittance)',
        });
        sg.accruedTaxLocal = 0;
      }
    });
    const householdAccrualWeeklyLocal = (reg.householdState.cohorts ?? []).reduce((a, c) => a + c.taxLocal, 0) / 52;
    const consumptionAccrualWeeklyLocal = (reg.householdState.cohorts ?? []).reduce((a, c) => a + (c.consumptionTaxLocal ?? 0), 0) / 52;

    reg.accruedSmeTaxLocal = (reg.accruedSmeTaxLocal ?? 0) + smeAccrualWeeklyLocal;
    reg.accruedHouseholdTaxLocal = (reg.accruedHouseholdTaxLocal ?? 0) + householdAccrualWeeklyLocal;
    reg.accruedConsumptionTaxLocal = (reg.accruedConsumptionTaxLocal ?? 0) + consumptionAccrualWeeklyLocal;

    const smeTaxWeeklyLocal = isQuarterEnd ? reg.accruedSmeTaxLocal : 0;
    const consumptionTaxWeeklyLocal = isQuarterEnd ? reg.accruedConsumptionTaxLocal : 0;
    const householdTaxWeeklyLocal = isMonthEnd ? reg.accruedHouseholdTaxLocal : 0;
    // §5-CLOSE F2: payroll tax is what the employers REMITTED this week (firms in 08, pools in
    // 03, each on its own wage bill) — no accrual from the macro wage bill, no month-end credit
    // from nobody.
    const payrollTaxWeeklyLocal = ctx.payrollTaxByRegion[regionId] ?? 0;
    if (isQuarterEnd) { reg.accruedSmeTaxLocal = 0; reg.accruedConsumptionTaxLocal = 0; }
    if (isMonthEnd) { reg.accruedHouseholdTaxLocal = 0; }

    // HH: households remit their own tax. It used to be deducted inside the income identity and
    // credited to the treasury with no payer on either side — the household half of the same
    // one-sided flow as the transfers above. On the same real calendars as the accrual.
    if (householdTaxWeeklyLocal + consumptionTaxWeeklyLocal > 0) {
      pay(ctx, {
        payer: { kind: 'HOUSEHOLD', region: regionId },
        payee: { kind: 'GOVERNMENT', region: regionId },
        amount: householdTaxWeeklyLocal + consumptionTaxWeeklyLocal,
        currency: currencyOf(regionId),
        reason: 'household tax remittance',
      });
    }

    // §5-WIRES N: the week's corporate tax receipt is the dated rows falling due to this treasury —
    // the ones the mid-week pass already settled (the report's treasury flows, this week's) plus
    // the ones still in the journal for the close (measured §7.376: counting the journal alone
    // missed the carried rows the mid-week pass had settled, and F2 printed at the quarter).
    const corporateTaxWeeklyLocal = (ctx.lastSettlementReport?.treasuryFlowsByRegion.get(regionId)?.get(CORPORATE_TAX_REASON) ?? 0)
      + dueToPayee(ctx.paymentJournal, partyId({ kind: 'GOVERNMENT', region: regionId }), internReason(CORPORATE_TAX_REASON), settlementWeek(), currencyOf(regionId), ctx.fx);
    reg.taxCollectedCorporateLocal = Math.round(corporateTaxWeeklyLocal);
    // FISCAL_TRACE=1 — the week's ACCRUAL by base (the smooth rate, not the lumpy remittance).
    if (process.env.FISCAL_TRACE === '1') {
      console.log(`  [fiscal] ${regionId} corpAccrual ${(((ctx.taxAccruedByRegion[regionId] ?? 0)) / 1e6).toFixed(1)}M`
        + ` sme ${(smeAccrualWeeklyLocal / 1e6).toFixed(1)}M hh ${(householdAccrualWeeklyLocal / 1e6).toFixed(1)}M`
        + ` budget ${((reg.governmentSpendingWeeklyLocal ?? 0) / 1e6).toFixed(1)}M`);
    }
    reg.taxCollectedSmeLocal = Math.round(smeTaxWeeklyLocal);
    reg.taxCollectedHouseholdLocal = Math.round(householdTaxWeeklyLocal);
    reg.taxCollectedPayrollLocal = Math.round(payrollTaxWeeklyLocal);
    reg.taxCollectedConsumptionLocal = Math.round(consumptionTaxWeeklyLocal);
    // §5-CLOSE C5: revenue IS what arrived — the collections on their own calendars, and nothing
    // else. The residual that used to top this up to `GDP x rate` ("the bases the model cannot
    // tax") credited the account from nobody, and it was a quarter of the take.
    reg.governmentRevenueLocal = Math.round((
      corporateTaxWeeklyLocal + smeTaxWeeklyLocal + householdTaxWeeklyLocal
      + payrollTaxWeeklyLocal + consumptionTaxWeeklyLocal
    ));

    // PUB1: the government's real interest bill. The treasury's ACCOUNT is the TGA, a liability
    // of the central bank — see stages/central-bank.ts, which moves it and the reserves with it.
    // §3.13-SOV row 2: read from the ONE store. Safe here because every writer of the array
    // reconciles the store at the moment it writes, so the two never disagree mid-week.
    const interestWeeklyLocal = weeklyInterestExpenseLocal(materializeGovLadder(ctx.v2, regionId));
    reg.governmentInterestWeeklyLocal = Math.round(interestWeeklyLocal);
    // Reported, never debited — the bill's cost is already in the redemption leg (PUB3d).
    reg.governmentBillDiscountAccrualLocal = Math.round(weeklyBillDiscountAccrualLocal(materializeGovLadder(ctx.v2, regionId)));
    // §5-CLOSE C5: there are no holders this model does not name. Every tranche is held (the
    // seed closes, §7.350; the auction places or re-offers), and a coupon reaches a holder of
    // record on its date or it is not paid — nothing is "paid smoothly" to nobody.

    // ---- PUB1e: what actually left the account. Interest and transfers are contractual and are
    // paid in full; procurement is what the goods market really supplied. A government that
    // cannot buy what it planned has not spent the money, and the remainder is named rather
    // than assumed spent. ----
    const govBudget = decomposeGovernmentSpending(
      reg.governmentSpendingWeeklyLocal, reg.governmentInterestWeeklyLocal ?? 0,
      GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore,
      reg.governmentPayrollWeeklyLocal ?? 0
    );
    const procurementSpentLocal = reg.governmentProcurementSpentLocal ?? 0;
    reg.governmentOutlaysLocal = Math.round(governmentOutlaysLocal({
      interestLocal: govBudget.interestLocal,
      payrollLocal: govBudget.payrollLocal,
      transfersLocal: govBudget.transfersLocal,
      procurementSpentLocal,
    }));
    reg.unspentProcurementBudgetLocal = Number(
      Math.max(0, govBudget.procurementBudgetLocal - procurementSpentLocal).toFixed(0)
    );

    const weeklyDeficitLocal = Math.max(0, reg.governmentOutlaysLocal - reg.governmentRevenueLocal) + maturedBondPrincipalLocal;

    // The treasury's bill rule: hold the bill share of the stock near target, leaning toward
    // bills when the front end is genuinely cheaper than the belly (positive carve of the real
    // cleared curve), away when it inverts. This is issuance policy, not a market outcome — the
    // market's answer comes back through 07f's cleared bill yields next week.
    const totalStockLocal = liveTranches.reduce((s2, t) => s2 + t.principalLocal, 0) || 1;
    const billStockLocal = liveTranches
      .filter(t => isDiscountBill(t.tenorAtIssuanceYears))
      .reduce((s2, t) => s2 + t.principalLocal, 0);
    const billShareOfStock = billStockLocal / totalStockLocal;
    const costLean = Math.max(-0.05, Math.min(0.05, (reg.zeroRates.tenor2Y - reg.zeroRates.tenor3M) * 2));
    const billShareTarget = Math.max(0.15, Math.min(0.25, 0.18 + costLean));
    // Steer the share toward target with the new-money flow: fund more of the deficit with bills
    // when under target, less when over.
    const billShareOfNewMoney = Math.max(0, Math.min(0.5, billShareTarget + (billShareTarget - billShareOfStock) * 2));
    const billFundedDeficitLocal = weeklyDeficitLocal * billShareOfNewMoney;
    const marketFundedDeficitLocal = weeklyDeficitLocal - billFundedDeficitLocal;

    // PUB3c: bond financing is quarterly but the government spends weekly, so between auctions
    // the TGA is the only thing absorbing the gap. When it falls below its operating balance the
    // bill program issues more. Sized off REALIZED outlays, so it responds to what went out.
    const cashBridgeIssuanceLocal = cashPositionBillIssuanceLocal({
      treasuryAccountLocal: treasuryAccountOf(ctx.v2, regionId),
      weeklyOutlaysLocal: reg.governmentOutlaysLocal ?? reg.governmentSpendingWeeklyLocal,
    });
    reg.cashBridgeBillIssuanceLocal = Math.round(cashBridgeIssuanceLocal);

    // Weekly bill issuance: the roll plus the bill share of new money, split across the three
    // programs, priced off the real cleared bill curve (07f ran before this stage).
    const newTranches: GovDebtTranche[] = [];
    const weeklyBillIssuanceLocal = maturedBillPrincipalLocal + billFundedDeficitLocal + cashBridgeIssuanceLocal;
    if (weeklyBillIssuanceLocal > 1000) {
      ([[13, 0.25, 0.4], [26, 0.5, 0.35], [52, 1, 0.25]] as const).forEach(([weeks, tenorYears, weight]) => {
        const principal = weeklyBillIssuanceLocal * weight;
        if (principal < 100) return;
        newTranches.push({
          id: govBillTrancheId(regionId, weeks, nextWeek),
          principalLocal: principal,
          // §3.25: the coupon is struck on the standing curve's point at the bill's tenor — a
          // trade where one stood, the fit's opinion elsewhere; the auction prices the paper.
          couponRate: Number(curvePointAt(tenorYears, reg.yieldCurveParams, reg.sovereignCurve).rate.toFixed(4)),
          originationWeek: nextWeek,
          maturityWeek: nextWeek + weeks,
          // §3.13-SOV: a sovereign is a bond and says so. FIXED because its coupon is locked at
          // issue (`bond.md` N5.a); SENIOR because a sovereign's claims rank equally and there is
          // no stack (N13.a — stated even though the answer is "all equal").
          rateType: 'FIXED' as const,
          seniority: 'SENIOR' as const,
        });
      });
    }

    // Sovereign debt issued in large, infrequent blocks. §5-WIRES A3.5 (rule N): the treasury
    // keeps no tally of "unfunded deficit" beside its account. Between blocks it spends its
    // balance and, when that runs out, the central bank's ways-and-means advance (the negative
    // side of its one account row); at the block it issues to REPAY the advance outstanding and
    // to fund the coming quarter's bond share of the deficit at the current run rate. Paper an
    // auction withdraws is not rolled into a side map: the account simply runs lower and the
    // next block sees the advance it drew.
    const issuanceCalendarWeek = nextWeek % 13 === 0; // large blocks roughly quarterly, not every week

    let quarterlyFundingNeedLocal = 0;

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
      quarterlyFundingNeedLocal = waysAndMeansOf(ctx.v2, regionId) + 13 * marketFundedDeficitLocal;

      if (quarterlyFundingNeedLocal > 1000) {
        ([['t2', 2, 104], ['t5', 5, 260], ['t10', 10, 520], ['t30', 30, 1560]] as const).forEach(([key, tenorYears, tenorWeeks]) => {
          const principal = quarterlyFundingNeedLocal * (tenorWeights[key] / weightSum);
          if (principal < 100) return;
          newTranches.push({
            id: govBondTrancheId(regionId, tenorYears, nextWeek),
            principalLocal: principal,
            couponRate: curvePointAt(tenorYears, reg.yieldCurveParams, reg.sovereignCurve).rate, // §3.25: the standing curve's point at the tenor; the auction prices the paper
            originationWeek: nextWeek,
            maturityWeek: nextWeek + tenorWeeks,
              // §3.13-SOV: a sovereign is a bond (`bond.md` N5.a fixed, N13.a all claims equal).
            rateType: 'FIXED' as const,
            seniority: 'SENIOR' as const,
          });
        });
      }
    }

    const updatedBankingSector = { ...reg.bankingSector };
    const updatedInstitutionalSector = { ...reg.institutionalSector };

    // §7.241/§7.240: the 40/60 FORCE-PLACEMENT that stood here is DELETED. It added every
    // deficit to the two sector-aggregate views with no cash leg — directly against the PUB1d
    // comment below it — building a parallel sovereign ledger that drifted from the per-bank
    // tenor books (the institutional half was even overwritten by holdings-view the same week).
    // The issuance calendar and 07c already place the paper for real.
    void issuanceCalendarWeek; void marketFundedDeficitLocal;


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
    reg.lastIssuanceProceedsLocal = 0;
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
      const cbRedeemedLocal = Array.from(cbRedeemedByBond.values()).reduce((a, v) => a + v, 0);
      reg.lastUnsoldMaturedLocal = Math.round(
        Math.max(0, maturedPrincipalLocal - redemptionPaidLocal - cbRedeemedLocal));
    }
    // The TGA's own debit is the settlement layer's now, so the central-bank stage must not take
    // it a second time; what stays here is the REPORTED figure.
    // Only what was actually repaid: the unsold remainder above never left the account.
    reg.lastRedemptionPaidLocal = Math.round(
      (maturedPrincipalLocal - (reg.lastUnsoldMaturedLocal ?? 0)));

    // §3.13-SOV row 2 — THE LADDER MOVES BY WIRE, HERE, AS THE EVENTS IT IS. What matured is
    // RETIRED off its own row and what was funded is ISSUED onto a new one; the array-and-diff
    // this replaces derived the same two wires from a rebuilt list, one step further from what
    // happened. `reconcileLadderByWire` goes with it.
    {
      const govIssuer = governmentIssuer(regionId);
      const S = ctx.v2.tranches;
      const matured = new Set(maturedTranches.map((m) => m.id));
      const keep: number[] = [];
      for (const r of ladderRowsOf(ctx.v2, govIssuer.id)) {
        if (matured.has(trancheIdOf(ctx.v2, r))) {
          if (S.principalLocal[r] > 0) retireTranche(ctx.v2, govIssuer, r, S.principalLocal[r], 'sovereign redemption');
        } else keep.push(r);
      }
      commitLadder(ctx.v2, govIssuer, keep);
      newTranches.forEach((nt) => { if (nt.principalLocal > 0.01) issueTranche(ctx.v2, govIssuer, nt, 'sovereign issuance'); });
    }

    const totalGovDebtLocal = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalLocal, 0);

    // ---- PUB2b: the week's open-market order. What matured is put back to work (or not, in
    // QT), plus any QE flow the blocked easing calls for. It is placed as a real BID in 07c and
    // 07f next week — the central bank's policy is a quantity the auction prices against
    // everyone else's demand, never a premium bolted onto the curve. ----
    if (reg.centralBankSheet) {
      const cb = reg.centralBankSheet;
      // XB5: the open-market operation is about the SOVEREIGN book. FX reserves are also assets
      // but they are not what a bond purchase adds to.
      // §3.13-BOOK d3a: off the register — the book's marked value sizes the operation, and the
      // reinvestment below is spread by the FACE each bond holds.
      const bookLocal = centralBankBookLocal(ctx.v2, regionId);
      const { reinvestmentShare, netPurchaseLocal } = openMarketPolicy({
        policyRate: reg.policyRate,
        taylorTargetRate: reg.taylorTargetRate,
        bookLocal,
        sovereignStockLocal: totalGovDebtLocal,
      });
      // Reinvestment goes back into the bucket that matured — a maturing bill is rolled into
      // bills — so the book keeps its shape instead of drifting up the curve. New QE money is
      // spread across the book's existing shape for the same reason.
      const orders: Record<string, number> = {};
      cbRedeemedByBond.forEach((redeemedLocal, key) => {
        orders[key] = redeemedLocal * reinvestmentShare;
      });
      if (netPurchaseLocal > 0 && bookLocal > 0) {
        const positions = centralBankPositions(ctx.v2, regionId);
        const faceTotalLocal = positions.reduce((a, p) => a + p.faceLocal, 0);
        if (faceTotalLocal > 0) positions.forEach((p) => {
          orders[p.bondId] = (orders[p.bondId] ?? 0) + netPurchaseLocal * (p.faceLocal / faceTotalLocal);
        });
      }
      cb.plannedPurchasesByBond = orders;
      cb.reinvestmentShare = Number(reinvestmentShare.toFixed(4));
    }
    const debtToGdpPctBottomUp = newDerivedNominalGdpLocal > 0 ? totalGovDebtLocal / newDerivedNominalGdpLocal : (reg.debtToGdpPctBottomUp || 0);

    updatedRegions[regionId] = {
      ...reg,
      gdpGrowth: finalGdpGrowth,
      estimatedNominalGdpLocal: newDerivedNominalGdpLocal,
      derivedNominalGdpLocal: newDerivedNominalGdpLocal,
      gdpGrowthBottomUp: Number(gdpGrowthBottomUp.toFixed(4)),
      smoothedWeeklyGrowthRate: smoothedWeeklyRate,
      lastWeekNominalGdpLocal: newDerivedNominalGdpLocal,
      nominalGdpHistory: updatedGdpHistory,
      consumptionComponentLocal,
      investmentComponentLocal,
      // §3.13-SOV row 2: `govDebtTranches` is gone — the ladder IS the store, moved by the wires
      // below rather than rebuilt as an array and diffed back into it.
      debtToGdpPctBottomUp,
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
