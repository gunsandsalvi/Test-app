/**
 * Stage 2b: Bank Diversification + Central Bank Facilities
 *
 * Wall Street Phase 1: evolves each region's real, individually-named banks (the isBankEntity
 * companies) as genuinely distinct balance sheets — their own loan book, deposits, capital
 * ratio, and central-bank reserves — instead of the single regional bankingSector aggregate
 * being the only real figure and each bank a cosmetic proportional slice of it. Runs after
 * stage 2 (region macro, which computes an aggregate via the same evolveBankingSector formula)
 * and overwrites that aggregate with the real sum of these per-bank sheets, so it stays a
 * genuine derived total rather than a second, parallel source of truth. Must run before stage 8
 * (company fundamentals), which prices each bank's stock off its own bankBalanceSheet.
 *
 * Wall Street Phase 2, revised by the flow-ledger rework: each bank's cash is now a real stock
 * moved only by named flows (see macro/banking.ts), and the one bank-side facility is the
 * Standing Repo Facility — a bank whose week closes short of its own operating buffer draws the
 * shortfall against its government-bond book at the posted rate, and repays with interest at
 * next week's maturation. The bank-side reverse-repo parking that used to sit opposite it is
 * gone: bank reserves earn the policy rate (the floor-system IOR), so a real bank never has
 * business at the RRP window — that facility is the NON-bank cash floor (WS6's lenders, WS7's
 * money funds).
 */

import { GameState, RegionId, Company } from '../../../types';
import { BankingSector, HouseholdLoanKind } from '../../../domain/banking';
import { regionalDeskView } from '../../../domain/dealer-desk';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey } from './shared-helpers';
import {
  evolveBankingSector, computeSovereignBookAnnualYield, HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE,
} from '../../macro/banking';
import { runRegionalRepoSession } from './repo-clearing';
import { maturingAt, repoInterestToMaturityUSD } from '../../../domain/repo';
import { divertHouseholdSavingsToMmf, refreshMmfQuotes, findRegionMmf } from './money-market-fund';
import { runBankWeeklyLending, runBankHouseholdLending, currentMortgageRateAnnual, smePoolId } from './bank-lending';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';

function scaleBankingSector(bs: BankingSector, share: number): BankingSector {
  const scaledBuckets: Record<string, number> = {};
  Object.entries(bs.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => { scaledBuckets[k] = v * share; });
  return {
    businessLoanBookUSD: bs.businessLoanBookUSD * share,
    consumerLoanBookUSD: bs.consumerLoanBookUSD * share,
    depositsUSD: bs.depositsUSD * share,
    sovereignBondHoldingsUSD: bs.sovereignBondHoldingsUSD * share,
    cashReservesUSD: bs.cashReservesUSD * share,
    bankEquityUSD: bs.bankEquityUSD * share,
    bankCapitalRatio: bs.bankCapitalRatio,
    netInterestMarginPct: bs.netInterestMarginPct,
    loanLossProvisionRateAnnualPct: bs.loanLossProvisionRateAnnualPct,
    creditConditionsIndex: bs.creditConditionsIndex,
    centralBankReservesUSD: bs.centralBankReservesUSD * share,
    moneySupplyM2USD: bs.moneySupplyM2USD * share,
    itemizedHoldings: [],
    srfBorrowingUSD: bs.srfBorrowingUSD * share,
    onRrpLendingUSD: bs.onRrpLendingUSD * share,
    corpBondDealerInventory: [],
    sovereignBondHoldingsByTenor: scaledBuckets,
    sovBondDealerInventory: [],
    loanDealerInventory: [],
    repoLentUSD: bs.repoLentUSD * share,
    repoBorrowedUSD: bs.repoBorrowedUSD * share,
    repoEncumberedCollateralUSD: bs.repoEncumberedCollateralUSD * share,
    businessLoans: [],
    householdLoans: (bs.householdLoans || []).map((pl) => ({ ...pl, principalUSD: pl.principalUSD * share })),
    wholesaleFundingUSD: (bs.wholesaleFundingUSD ?? 0) * share,
    corporateDepositsUSD: bs.corporateDepositsUSD * share,
  };
}

export function runBankDiversificationStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const banks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
    if (banks.length === 0) return;

    // The aggregate stage 2 just computed via evolveBankingSector is this week's fallback
    // seed for any bank that doesn't yet carry its own bankBalanceSheet (e.g. a company
    // generated before this phase existed) — scaled by that bank's own market share, exactly
    // how initial seeding works in companyGenerator.ts.
    const priorAggregate = reg.bankingSector;

    // OWN5: a bank's market share is the deposits it actually won, measured off the sheets at
    // the start of this week. It was `0.35 x 0.72^rank`, fixed at seed and never revisited, and
    // it decided real things: which bank a borrower's cash settles at, how the segment pools'
    // balances are spread, and each bank's cut of dealer revenue. A bank that lost deposits kept
    // its share of all three. The seed value survives only until the first week runs.
    {
      const depositsOf = (b: Company) => {
        const sh = b.bankBalanceSheet;
        if (!sh) return 0;
        return Math.max(0, sh.depositsUSD) + Math.max(0, sh.corporateDepositsUSD ?? 0)
          + Math.max(0, sh.institutionalDepositsUSD ?? 0) + Math.max(0, sh.smeDepositsUSD ?? 0)
          + Math.max(0, sh.unmodeledDepositsUSD ?? 0);
      };
      const regionDepositsUSD = banks.reduce((a, b) => a + depositsOf(b), 0);
      if (regionDepositsUSD > 0) {
        banks.forEach((b) => { b.bankMarketShare = Number((depositsOf(b) / regionDepositsUSD).toFixed(6)); });
      }
    }

    // WS7: the household savings flow chooses between deposits and the money fund on last
    // week's real yield gap, BEFORE the banks' deposit flow posts — the deposits simply never
    // arrive at the banks. This is the funding competition WS7 exists to create.
    const regionSavingsDepositInflowUSD = (reg.householdState.savingsRate * reg.estimatedHouseholdIncomeUSD) / 52 * HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE;
    const regionDivertedUSD = divertHouseholdSavingsToMmf(regionId, reg, regionSavingsDepositInflowUSD, ctx);

    // G2: the corporate bank facilities each named bank holds, read off the borrowers' REAL
    // ladders — the bank's loan records mirror them 1:1 rather than being a second stock.
    const facilityTranchesByBank = new Map<string, { companyId: string; trancheId: string; principalUSD: number; marginBps: number; originationWeek: number; maturityWeek: number }[]>();
    ctx.prevActiveFirms.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      if (c.region !== regionId || c.isDefaulted) return;
      (c.debtTranches || []).forEach((t) => {
        if (!t.isBankFacility || !t.facilityBankTicker) return;
        (facilityTranchesByBank.get(t.facilityBankTicker) ?? facilityTranchesByBank.set(t.facilityBankTicker, []).get(t.facilityBankTicker)!)
          .push({
            companyId: c.id, trancheId: t.id, principalUSD: t.principalUSD,
            marginBps: t.floatingMarginBps ?? 350,
            originationWeek: t.originationWeek, maturityWeek: t.maturityWeek,
          });
      });
    });
    // G2 slice 4: corporate deposits ARE the home companies' S5 cash — one representation,
    // derived weekly from the real ledger rather than stored twice.
    // SETL5: the institutional deposit line, reconciled to the entities' real balances the same
    // way the corporate one is — settlement maintains it week to week, and this catches cash
    // moved by stages not yet on instructions, carrying the matching reserve leg.
    const institutionalDepositsByBank = new Map<string, number>();
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== regionId || !e.homeBankTicker) return;
      institutionalDepositsByBank.set(e.homeBankTicker, (institutionalDepositsByBank.get(e.homeBankTicker) ?? 0) + Math.max(0, e.cashUSD ?? 0));
    });
    const corporateDepositsByBank = new Map<string, number>();
    ctx.prevActiveFirms.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      if (c.region !== regionId || c.isDefaulted || c.isBankEntity) return;
      if (!c.homeBankTicker) return;
      corporateDepositsByBank.set(c.homeBankTicker, (corporateDepositsByBank.get(c.homeBankTicker) ?? 0) + Math.max(0, c.cash));
    });
    // SEG1: the segment pools' balances, reconciled the same way — each pool's cash sits across
    // the region's banks pro-rata by market share (settlement spreads it identically; this
    // catches share drift and any balance moved outside instructions, with the reserve leg).
    const segmentCashUSD = (reg.smePools || []).reduce((a, s) => a + Math.max(0, s.cashUSD ?? 0), 0);
    const regionBankShareTotal = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);

    // HH3: the week's real household-credit flows, per bank, for the region roll-up below.
    const householdFlowsByBank = new Map<string, {
      interestUSD: number; debtServicePrincipalUSD: number;
      mortgageOriginationUSD: number; mortgageDischargeUSD: number;
      consumerCreditOriginationUSD: number;
    }>();

    const sovCouponByBucket = sovereignCouponByBucket(reg.govDebtTranches, sovBucketKey);

    // REPO1: what each bank owes and is owed on contracts that come due this week.
    const dueThisWeek = maturingAt(reg.repoBook ?? [], ctx.nextWeek);
    const maturingRepo = (ticker: string) => {
      let borrowPrincipalUSD = 0, borrowInterestUSD = 0, lendPrincipalUSD = 0, lendInterestUSD = 0;
      dueThisWeek.forEach((c) => {
        const interestUSD = repoInterestToMaturityUSD(c);
        if (c.borrowerTicker === ticker) { borrowPrincipalUSD += c.principalUSD; borrowInterestUSD += interestUSD; }
        if (c.lender.kind === 'BANK' && c.lender.ticker === ticker) { lendPrincipalUSD += c.principalUSD; lendInterestUSD += interestUSD; }
      });
      return { borrowPrincipalUSD, borrowInterestUSD, lendPrincipalUSD, lendInterestUSD };
    };

    const newSheets: { bank: Company; sheet: BankingSector }[] = banks.map((bank) => {
      const share = bank.bankMarketShare ?? 1 / banks.length;
      const prevSheet = bank.bankBalanceSheet ?? scaleBankingSector(priorAggregate, share);
      const riskFactor = bank.bankRiskFactor ?? 1.0;

      // G2: last week's itemized book earns its real interest — computed here so the margin
      // reads the same loans the book actually holds.
      const priorLoanInterestWeeklyUSD = (prevSheet.businessLoans || [])
        .filter((l) => l.status === 'PERFORMING')
        .reduce((a, l) => a + (l.principalUSD * (reg.policyRate + l.marginBps / 10000)) / 52, 0);
      // SETL4: the FACILITY slice of that interest is now paid by the borrower as a real payment
      // (stage 08 → settlement), so the evolution must not credit it a second time. SME pools
      // have no cash ledger of their own and still pay through the book.
      const priorFacilityInterestWeeklyUSD = (prevSheet.businessLoans || [])
        .filter((l) => l.status === 'PERFORMING' && l.borrowerKind === 'COMPANY_FACILITY')
        .reduce((a, l) => a + (l.principalUSD * (reg.policyRate + l.marginBps / 10000)) / 52, 0);
      // SEG2d: the SME slice is a real payment now too — each pool pays its own interest from
      // its own book (SEGMENT → BANK through settlement), on the same prior-week basis the
      // facility exclusion uses, so the evolution must not credit it either.
      let priorSmeInterestWeeklyUSD = 0;
      (prevSheet.businessLoans || [])
        .filter((l) => l.status === 'PERFORMING' && l.borrowerKind === 'SME_POOL')
        .forEach((l) => {
          const seg = (reg.smePools || []).find((s) => smePoolId(regionId, s.industry) === l.borrowerId);
          if (!seg) return;
          const interestUSD = (l.principalUSD * (reg.policyRate + l.marginBps / 10000)) / 52;
          priorSmeInterestWeeklyUSD += interestUSD;
          pay(ctx, {
            payer: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
            payee: { kind: 'BANK', ticker: bank.ticker },
            amountUSD: interestUSD,
            reason: 'SME pool interest to the lending bank',
          });
        });

      // HH3: the household books' real accrual on the same prior-week basis — each pool at its
      // own terms (a mortgage pool at its fixed WAC, card/term at policy plus their margins).
      const priorHouseholdInterestWeeklyUSD = (prevSheet.householdLoans || []).reduce((a, pl) => {
        const rate = pl.kind === 'MORTGAGE'
          ? (pl.wacAnnual ?? currentMortgageRateAnnual(reg))
          : reg.policyRate + (pl.marginBps ?? 500) / 10000;
        return a + (pl.principalUSD * rate) / 52;
      }, 0);

      const sheet = evolveBankingSector(
        prevSheet,
        reg.estimatedHouseholdIncomeUSD * share,
        reg.householdState.savingsRate,
        reg.policyRate,
        // A higher-risk bank's book is more exposed to the SAME regional unemployment print, the
        // way a bank concentrated in subprime/regional consumer lending genuinely would be (see
        // bankRiskFactor's doc comment in domain/company.ts) — the actual reason two banks facing
        // one regional credit cycle diverge.
        reg.unemploymentRate * (0.6 + riskFactor * 0.4),
        // THIS bank's real tenor book at the real cleared curve — not the 10Y on a scalar.
        computeSovereignBookAnnualYield(prevSheet.sovereignBondHoldingsByTenor, reg.zeroRates),
        reg.creditConditionsSpilloverAdjustment ?? 0,
        // REPO1: the CONTRACTS due this week mature inside as explicit flows — each at the rate
        // it was struck at and over the term it ran, the standing facility included.
        maturingRepo(bank.ticker).borrowPrincipalUSD,
        maturingRepo(bank.ticker).borrowInterestUSD,
        maturingRepo(bank.ticker).lendPrincipalUSD,
        maturingRepo(bank.ticker).lendInterestUSD,
        priorLoanInterestWeeklyUSD - priorFacilityInterestWeeklyUSD - priorSmeInterestWeeklyUSD,
        priorHouseholdInterestWeeklyUSD,
        // PUB1: real coupons on this bank's own sovereign book.
        Object.entries(prevSheet.sovereignBondHoldingsByTenor || {}).reduce(
          (a, [k, v]) => a + ((Number(v) || 0) * (sovCouponByBucket[k] ?? 0)) / 52, 0
        ),
        regionDivertedUSD * share,
        // HH4d: last week's post-bank-pass household flows settle on this bank's book (T+1) —
        // ETF purchases out, insurance premiums/benefits and PE calls/distributions net. The
        // parameter is an OUTFLOW, so the signed pending flips sign.
        -(reg.householdState.pendingBankSettlementUSD ?? 0) * share,
        // Slice 5: the rate this bank's deposits must compete with.
        findRegionMmf(ctx.updatedInstitutionalEntities, regionId)?.mmfNetYieldAnnual ?? 0,
        // G3c: what the market charges THIS bank for money — its own cleared credit spread,
        // printed by the same corporate-bond auction that prices every other issuer.
        bank.oasSpreadBps > 0 ? bank.oasSpreadBps : WHOLESALE_FUNDING_SPREAD_BPS
      );

      // G2: the itemized book's own week — facility reconciliation, real interest accrual
      // basis, real SME write-offs, and priced origination under the real capital constraint.
      const lending = runBankWeeklyLending(bank, sheet, reg, regionId, facilityTranchesByBank, ctx.nextWeek);
      // SEG2e: a loan creates a deposit — the pool's new money is written by this bank's own
      // credit (no reserve moves) and lands on the pool's cash and this bank's smeDepositsUSD
      // line at settlement, in the same week the loan appeared on the book above.
      lending.smeOriginationBySegment.forEach((grantedUSD, industry) => {
        pay(ctx, {
          payer: { kind: 'BANK_CREDIT', ticker: bank.ticker },
          payee: { kind: 'SEGMENT', region: regionId, industry },
          amountUSD: grantedUSD,
          reason: 'SME loan origination creates the pool deposit',
        });
      });
      // HH3: the household books' own week — derived amortization, measured losses, and
      // priced, capital-gated origination (mortgage demand off the real housing turnover).
      const household = runBankHouseholdLending(
        bank, lending.sheet, reg, reg.unemploymentRate * (0.6 + riskFactor * 0.4), ctx.nextWeek
      );
      householdFlowsByBank.set(bank.ticker, {
        interestUSD: priorHouseholdInterestWeeklyUSD,
        debtServicePrincipalUSD: household.debtServicePrincipalWeeklyUSD,
        mortgageOriginationUSD: household.mortgageOriginationUSD,
        mortgageDischargeUSD: household.mortgageDischargeUSD,
        consumerCreditOriginationUSD: household.consumerCreditOriginationUSD,
      });
      const lentSheet = household.sheet;
      // Slice 4: the corporate-deposit line is the derived view of the borrowers' real cash.
      // SETL2: settlement maintains this line week to week with its reserve leg. This is the
      // RECONCILIATION to the companies' actual cash — it catches balances moved by stages not
      // yet migrated onto payment instructions, and carries the matching reserve leg with it so
      // the identity cannot drift. The size of this adjustment is the migration's own progress
      // meter: it goes to zero when every stage records instructions.
      const trueCorporateUSD = Number((corporateDepositsByBank.get(bank.ticker) ?? 0).toFixed(0));
      const trueInstitutionalUSD = Number((institutionalDepositsByBank.get(bank.ticker) ?? 0).toFixed(0));
      const trueSmeUSD = regionBankShareTotal > 0
        ? Number((segmentCashUSD * ((bank.bankMarketShare ?? 0) / regionBankShareTotal)).toFixed(0))
        : 0;
      const reconcileUSD = (trueCorporateUSD - (lentSheet.corporateDepositsUSD ?? 0))
        + (trueInstitutionalUSD - (lentSheet.institutionalDepositsUSD ?? 0))
        + (trueSmeUSD - (lentSheet.smeDepositsUSD ?? 0));
      // CASH — THE MIGRATION METER, NOW REPORTED. This adjustment is money that moved on a
      // holder's book without a payment instruction: a stage mutated a balance directly and this
      // line invents the matching reserves so the identity cannot drift. It is therefore the
      // exact size of what still bypasses the settlement layer, and the comment above has always
      // said it goes to zero when every stage records instructions — but nothing ever printed it,
      // so "the migration is nearly done" was an assertion rather than a measurement.
      ctx.cashReconcileUSD[regionId] = (ctx.cashReconcileUSD[regionId] ?? 0) + Math.abs(reconcileUSD);
      ctx.cashReconcileByClassUSD.corporate += Math.abs(trueCorporateUSD - (lentSheet.corporateDepositsUSD ?? 0));
      ctx.cashReconcileByClassUSD.institutional += Math.abs(trueInstitutionalUSD - (lentSheet.institutionalDepositsUSD ?? 0));
      ctx.cashReconcileByClassUSD.sme += Math.abs(trueSmeUSD - (lentSheet.smeDepositsUSD ?? 0));
      const withDeposits: BankingSector = {
        ...lentSheet,
        cashReservesUSD: lentSheet.cashReservesUSD + reconcileUSD,
        corporateDepositsUSD: trueCorporateUSD,
        institutionalDepositsUSD: trueInstitutionalUSD,
        smeDepositsUSD: trueSmeUSD,
        loanLossProvisionRateAnnualPct: Number(
          (lentSheet.businessLoanBookUSD > 0 ? (lending.loanLossWeeklyUSD * 52) / lentSheet.businessLoanBookUSD : 0).toFixed(4)
        ),
      };
      ctx.g2DeclinedOriginationUSD[regionId] = (ctx.g2DeclinedOriginationUSD[regionId] ?? 0) + lending.declinedOriginationUSD;
      return { bank, sheet: withDeposits };
    });

    // SEG2f: the pool's debt is the DERIVED SUM of the loans the banks actually hold against it
    // — one representation (rule 3). The in-place `debtUSD += granted` during origination only
    // sequences demand across banks within the pass; this write is the record, and it now
    // carries the loss leg too (write-offs used to shrink the banks' books while the segment's
    // number never noticed).
    {
      const poolTotals = new Map<string, number>();
      newSheets.forEach(({ sheet }) => (sheet.businessLoans || []).forEach((l) => {
        if (l.borrowerKind !== 'SME_POOL') return;
        poolTotals.set(l.borrowerId, (poolTotals.get(l.borrowerId) ?? 0) + l.principalUSD);
      }));
      (reg.smePools || []).forEach((seg) => {
        seg.debtUSD = Number((poolTotals.get(smePoolId(regionId, seg.industry)) ?? 0).toFixed(0));
      });
    }

    // WS6: the weekly money-market session. Every real flow has posted; banks short of their
    // buffer now fund against their collateral, surplus banks and institutional idle cash
    // lend, and the SRF sits in the book as the posted-rate seat of last resort — so there is
    // no separate "facility draw" step to run afterwards, and the region's overnight rate is
    // whatever this session cleared.
    const sheetByTicker = new Map<string, BankingSector>(newSheets.map(({ bank, sheet }) => [bank.ticker, sheet]));
    const session = runRegionalRepoSession(regionId, reg, banks, sheetByTicker, ctx);
    reg.repoRateAnnual = Number(session.repoRateAnnual.toFixed(6));
    // GUARD: what the session had to fund and what it actually lent, so the harness can tell a
    // quiet week from a dead market — the distinction the corridor assertion cannot make.
    reg.repoFundableNeedUSD = Number(session.fundableNeedUSD.toFixed(0));
    reg.repoClearedVolumeUSD = Number(session.clearedVolumeUSD.toFixed(0));
    // The fund's quote for next week's yield-gap decision comes off its post-session book.
    refreshMmfQuotes(regionId, reg, ctx);
    newSheets.forEach((entry) => {
      entry.sheet = session.sheetByTicker.get(entry.bank.ticker) ?? entry.sheet;
    });

    newSheets.forEach(({ bank, sheet }) => {
      if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
      ctx.companyUpdates[bank.ticker].bankBalanceSheet = sheet;
    });

    // The region-level bankingSector every other stage reads becomes the real sum of these
    // named banks, replacing (not supplementing) the single-formula aggregate stage 2 computed
    // — one source of truth, now genuinely derived from real per-bank state instead of the
    // other way around.
    const sumField = (f: (s: BankingSector) => number) => newSheets.reduce((s, { sheet }) => s + f(sheet), 0);
    // G3a: the region's view of one dealer book — every named desk's position, summed by name.
    const deskView = (book: string) =>
      Array.from(regionalDeskView(newSheets.map(({ sheet }) => sheet.dealerDeskInventory), book).entries())
        .filter(([, usd]) => Math.abs(usd) > 1);
    const totalAssets = sumField((s) => s.businessLoanBookUSD + s.consumerLoanBookUSD + s.sovereignBondHoldingsUSD + s.cashReservesUSD);
    const weightedAvg = (f: (s: BankingSector) => number) =>
      totalAssets > 0
        ? newSheets.reduce((s, { sheet }) => s + f(sheet) * (sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sheet.sovereignBondHoldingsUSD + sheet.cashReservesUSD), 0) / totalAssets
        : (newSheets.reduce((s, { sheet }) => s + f(sheet), 0) / Math.max(1, newSheets.length));

    reg.bankingSector = {
      businessLoanBookUSD: sumField((s) => s.businessLoanBookUSD),
      consumerLoanBookUSD: sumField((s) => s.consumerLoanBookUSD),
      depositsUSD: sumField((s) => s.depositsUSD),
      sovereignBondHoldingsUSD: sumField((s) => s.sovereignBondHoldingsUSD),
      cashReservesUSD: sumField((s) => s.cashReservesUSD),
      bankEquityUSD: sumField((s) => s.bankEquityUSD),
      bankCapitalRatio: Number(weightedAvg((s) => s.bankCapitalRatio).toFixed(4)),
      netInterestMarginPct: Number(weightedAvg((s) => s.netInterestMarginPct).toFixed(4)),
      loanLossProvisionRateAnnualPct: Number(weightedAvg((s) => s.loanLossProvisionRateAnnualPct).toFixed(4)),
      creditConditionsIndex: Number(weightedAvg((s) => s.creditConditionsIndex).toFixed(3)),
      centralBankReservesUSD: sumField((s) => s.centralBankReservesUSD),
      // G2 slice 5: M2 = the real deposits at the named banks + the region's money-fund
      // shares (WS7's real liabilities — money held outside a bank is still money).
      moneySupplyM2USD: sumField((s) => s.moneySupplyM2USD)
        + ctx.updatedInstitutionalEntities
            .filter((e) => e.region === regionId && e.entityType === 'MONEY_MARKET_FUND')
            .reduce((a, e) => a + (e.mmfSharesOutstandingUSD ?? 0), 0),
      itemizedHoldings: priorAggregate.itemizedHoldings || [],
      srfBorrowingUSD: sumField((s) => s.srfBorrowingUSD),
      onRrpLendingUSD: sumField((s) => s.onRrpLendingUSD),
      // Real per-bank sovereign holdings, summed across named banks — each bank is its own real
      // participant in the sovereign-bond clearing engine (07c-sovereign-bond-clearing.ts).
      sovereignBondHoldingsByTenor: (() => {
        const buckets: Record<string, number> = {};
        newSheets.forEach(({ sheet }) => {
          Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => {
            buckets[k] = (buckets[k] ?? 0) + v;
          });
        });
        return buckets;
      })(),
      // G3a: dealer inventory is now OWNED, one desk per named bank (domain/dealer-desk.ts).
      // These three arrays are the derived regional view of those desks and nothing decides off
      // them — the books that clear later this week overwrite them with their own session's
      // result, and a desk's position is only ever written by the bank that took it.
      corpBondDealerInventory: deskView('corporate bond').map(([companyId, inventoryUSD]) => ({ companyId, inventoryUSD })),
      sovBondDealerInventory: [
        ...deskView('sovereign bond').map(([instrumentId, inventoryUSD]) => ({ tenorKey: instrumentId.replace(`${regionId}-GOV-`, ''), inventoryUSD })),
        ...deskView('bill').map(([instrumentId, inventoryUSD]) => ({ tenorKey: instrumentId.replace(`${regionId}-GOV-`, ''), inventoryUSD })),
      ],
      loanDealerInventory: deskView('leveraged loan').map(([companyId, inventoryUSD]) => ({ companyId, inventoryUSD })),
      // WS6: the region's overnight book is the sum of the named banks' real positions. The
      // RATE is one market print per region and lives on reg.repoRateAnnual — never a second
      // copy on any sheet.
      repoLentUSD: sumField((s) => s.repoLentUSD ?? 0),
      repoBorrowedUSD: sumField((s) => s.repoBorrowedUSD ?? 0),
      repoEncumberedCollateralUSD: sumField((s) => s.repoEncumberedCollateralUSD ?? 0),
      // G2: itemized loans live per bank; the aggregate carries no copy (a flattened region
      // view would be a second ledger). Corporate deposits sum like everything else.
      businessLoans: [],
      householdLoans: [],
      wholesaleFundingUSD: sumField((s) => s.wholesaleFundingUSD ?? 0),
      corporateDepositsUSD: sumField((s) => s.corporateDepositsUSD ?? 0),
    };

    // HH: what the region's banks actually paid household depositors this week — measured, so
    // household income can read it instead of re-deriving it at `policyRate x 0.6`.
    reg.householdDepositInterestWeeklyUSD = Number(newSheets.reduce(
      (a, { sheet }) => a + (sheet.householdDepositInterestWeeklyUSD ?? 0), 0).toFixed(0));

    // ---- HH3: the household sector's debt lines become what they now are — DERIVED SUMS of
    // the itemized pools on the named banks — and the week's real flows are recorded for the
    // household side to read next week (deposit credit, consumption boost, debt service). ----
    const sumPools = (kind: HouseholdLoanKind) => newSheets.reduce(
      (a, { sheet }) => a + (sheet.householdLoans || [])
        .filter((pl) => pl.kind === kind)
        .reduce((x, pl) => x + pl.principalUSD, 0),
      0
    );
    const hs = reg.householdState;
    const priorMortgageDebtUSD = hs.mortgageDebtUSD ?? 0;
    const mortgageDebtUSD = Number(sumPools('MORTGAGE').toFixed(0));
    const creditCardDebtUSD = Number(sumPools('CREDIT_CARD').toFixed(0));
    const otherConsumerLoanDebtUSD = Number(sumPools('CONSUMER_TERM').toFixed(0));
    let interestUSD = 0; let servicePrincipalUSD = 0; let mortgageOriginationUSD = 0;
    let mortgageDischargeUSD = 0; let consumerCreditUSD = 0;
    householdFlowsByBank.forEach((f) => {
      interestUSD += f.interestUSD;
      servicePrincipalUSD += f.debtServicePrincipalUSD;
      mortgageOriginationUSD += f.mortgageOriginationUSD;
      mortgageDischargeUSD += f.mortgageDischargeUSD;
      consumerCreditUSD += f.consumerCreditOriginationUSD;
    });
    // HH4d: the household deposit stock IS the banks' summed household-deposit line — one
    // number, reconciled here every week (the balance-sheet stage debits this week's ETF
    // purchases from the view and records them for next week's bank settlement). The diverted
    // savings become a real money-fund share stock on the household book instead of money that
    // vanished from the household view at the yield gate.
    const bankHouseholdDepositsUSD = newSheets.reduce((a, { sheet }) => a + sheet.depositsUSD, 0);
    reg.householdState = {
      ...hs,
      depositsUSD: Number(bankHouseholdDepositsUSD.toFixed(0)),
      mmfSharesUSD: Number(((hs.mmfSharesUSD ?? 0) + regionDivertedUSD).toFixed(0)),
      pendingBankSettlementUSD: 0,
      mortgageDebtUSD,
      creditCardDebtUSD,
      otherConsumerLoanDebtUSD,
      priorMortgageDebtUSD,
      householdDebtToIncomeRatio: reg.estimatedHouseholdIncomeUSD > 0
        ? Number(((mortgageDebtUSD + creditCardDebtUSD + otherConsumerLoanDebtUSD) / reg.estimatedHouseholdIncomeUSD).toFixed(4))
        : hs.householdDebtToIncomeRatio,
      // Burden is interest plus REQUIRED principal (annuity schedules and card minimums);
      // transactor turnover is consumption already counted, cycled through a card.
      weeklyDebtServiceUSD: Number((interestUSD + servicePrincipalUSD).toFixed(0)),
      // The household sector's NET deposit credit from housing: buyers' new loans minus the
      // sellers' loans the sale proceeds retired.
      weeklyMortgageOriginationUSD: Number((mortgageOriginationUSD - mortgageDischargeUSD).toFixed(0)),
      weeklyNewConsumerCreditUSD: Number(consumerCreditUSD.toFixed(0)),
    };
    // The housing-market stat becomes the real number the banks actually wrote this week.
    if (reg.housingMarket) {
      reg.housingMarket.mortgageOriginationVolumeUSD = Number(mortgageOriginationUSD.toFixed(0));
    }
  });
}
