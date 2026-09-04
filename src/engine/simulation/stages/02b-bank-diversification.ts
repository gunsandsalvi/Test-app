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

import { currencyOf } from '../../../domain/geography';

import { ensureV2 } from '../../../engine2/world';
import { facilityBookOf, facilityRowsOf } from '../../../engine2/tranches';
import { issueTranche } from '../../ledger/tranche-ledger';
import { GameState, RegionId, Company } from '../../../types';
import { BankingSector, HouseholdLoanKind } from '../../../domain/banking';
import { regionalDeskView } from '../../../domain/dealer-desk';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { sovereignCouponByBond } from '../../../domain/government';
import { payHoldersCash } from './shared-helpers';
import {
  evolveBankingSector, computeSovereignBookAnnualYield, savingsToDepositsShare,
} from '../../macro/banking';
import { runRegionalRepoSession } from './repo-clearing';
import { maturingAt, repoInterestToMaturityLocal } from '../../../domain/repo';
import { divertHouseholdSavingsToMmf, refreshMmfQuotes, findRegionMmf } from './money-market-fund';
import { runBankWeeklyLending, runBankHouseholdLending, currentMortgageRateAnnual, smePoolId, repayCentralBankLoanLocal, CENTRAL_BANK_LOAN_PENALTY_BPS, facilityMarginBpsFor } from './bank-lending';
import { issuerSpreadAtOnCurve } from '../../credit-price';
import { WeeklyStepContext, updateBankSheet } from './context';
import { businessLoanBookOf, consumerLoanBookOf, loanBooksOf } from '../../../domain/banking';
import { pay } from './settlement';
import { SRF_SPREAD_BPS, bankCashBufferRatioOf } from '../../macro/banking';
import { cashOf, entityCashOf, adjustSectorRow, adjustBankReserves, bankReservesOf, bankDepositLines, householdDepositsAt } from '../../ledger/accounts';
import { materializeGovLadder } from '../../../engine2/tranches';
import { sovereignTenorResolver } from '../../../domain/government';

function scaleBankingSector(bs: BankingSector, share: number): BankingSector {
  const scaledBook: Record<string, number> = {};
  Object.entries(bs.sovereignBondHoldingsByBond || {}).forEach(([k, v]) => { scaledBook[k] = v * share; });
  return {
    sovereignBondHoldingsLocal: bs.sovereignBondHoldingsLocal * share,
    bankEquityLocal: bs.bankEquityLocal * share,
    bankCapitalRatio: bs.bankCapitalRatio,
    netInterestMarginPct: bs.netInterestMarginPct,
    loanLossProvisionRateAnnualPct: bs.loanLossProvisionRateAnnualPct,
    creditConditionsIndex: bs.creditConditionsIndex,
    centralBankReservesLocal: bs.centralBankReservesLocal * share,
    moneySupplyM2Local: bs.moneySupplyM2Local * share,
    itemizedHoldings: [],
    srfBorrowingLocal: bs.srfBorrowingLocal * share,
    onRrpLendingLocal: bs.onRrpLendingLocal * share,
    corpBondDealerInventory: [],
    sovereignBondHoldingsByBond: scaledBook,
    sovBondDealerInventory: [],
    loanDealerInventory: [],
    repoLentLocal: bs.repoLentLocal * share,
    repoBorrowedLocal: bs.repoBorrowedLocal * share,
    repoEncumberedCollateralLocal: bs.repoEncumberedCollateralLocal * share,
    businessLoans: [],
    householdLoans: (bs.householdLoans || []).map((pl) => ({ ...pl, principalLocal: pl.principalLocal * share })),
    centralBankLoanLocal: (bs.centralBankLoanLocal ?? 0) * share,
    clientMarginLocal: (bs.clientMarginLocal ?? 0) * share,
  };
}

export function runBankDiversificationStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const banks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
    if (banks.length === 0) return;
    // The central bank's interest expense is ACCUMULATED where it is paid, below, like every
    // other line of its income statement. It used to be re-derived at the central bank stage by
    // summing `reservesInterestWeeklyLocal` over the region's ACTIVE banks — 170 stages later, by
    // which point resolution had taken banks out of that set. The interest had been paid to them
    // all the same, so the remittance under-counted its own expense and the reserves it created
    // stood against nothing.
    if (reg.centralBankSheet) reg.centralBankSheet.lastInterestOnReservesLocal = 0;

    // The aggregate stage 2 just computed via evolveBankingSector is this week's fallback
    // seed for any bank that doesn't yet carry its own bankBalanceSheet (e.g. a company
    // generated before this phase existed) — scaled by that bank's own market share, exactly
    // how initial seeding works in companyGenerator.ts.
    const priorAggregate = reg.bankingSector;

    // A bank's market share is the deposits it actually won, measured off the sheets at
    // the start of this week. It was `0.35 x 0.72^rank`, fixed at seed and never revisited, and
    // it decided real things: which bank a borrower's cash settles at, how the segment pools'
    // balances are spread, and each bank's cut of dealer revenue. A bank that lost deposits kept
    // its share of all three. The seed value survives only until the first week runs.
    {
      const depositsOf = (b: Company) => {
        if (!b.bankBalanceSheet) return 0;
        const l = bankDepositLines(ctx, b.ticker);
        return Math.max(0, l.householdLocal) + Math.max(0, l.corporateLocal) + Math.max(0, l.institutionalLocal) + Math.max(0, l.smeLocal);
      };
      const regionDepositsLocal = banks.reduce((a, b) => a + depositsOf(b), 0);
      if (regionDepositsLocal > 0) {
        banks.forEach((b) => { b.bankMarketShare = Number((depositsOf(b) / regionDepositsLocal).toFixed(6)); });
      }
    }

    // The household savings flow chooses between deposits and the money fund on last
    // week's real yield gap, BEFORE the banks' deposit flow posts — the deposits simply never
    // arrive at the banks. This is the funding competition WS7 exists to create.
    const depositShare = savingsToDepositsShare(reg.householdState);
    const regionSavingsDepositInflowLocal = (reg.householdState.savingsRate * reg.estimatedHouseholdIncomeLocal) / 52 * depositShare;
    const regionDivertedLocal = divertHouseholdSavingsToMmf(regionId, reg, regionSavingsDepositInflowLocal, ctx);

    // G2 slice 4: corporate deposits ARE the home companies' S5 cash — one representation,
    // derived weekly from the real ledger rather than stored twice.
    // The institutional deposit line, reconciled to the entities' real balances the same
    // way the corporate one is — settlement maintains it week to week, and this catches cash
    // moved by stages not yet on instructions, carrying the matching reserve leg.
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== regionId || !e.homeBankTicker) return;
      // CASH: an entity whose balance is NEGATIVE is overdrawn, and the clamp above hides it —
      // the reconcile then re-plugs the same gap every week and the bypass meter reads it as
      // unrouted flow. It is neither: it is a fund spending money it does not have, and it needs
      // its own line so the meter measures what it claims to.
      ctx.cashOverdraftLocal += Math.max(0, -entityCashOf(ctx.v2, e));
    });
    // THE OVERDRAFT CONVERSION: a company whose SETTLED balance stands negative has
    // already spent its bank's money, so the bank's de-facto credit becomes a de-jure facility
    // draw at revolver pricing. Stage 08's own revolver fires on the walk's forward view, but
    // the books that run AFTER it (the late clearings, ETF flows, FX, the close) can settle a
    // company negative with no lender until this pass — measured as ~4.5B/week of standing
    // negative balances, money nobody funded. One statement, the SEG2e shape: the
    // tranche goes on the borrower, the credit event books the loan on the bank, and the
    // BANK_CREDIT payment writes the deposit back to zero — a loan creates a deposit. The
    // borrower's own machinery services and prepays it like any facility. No headroom test:
    // an overdraft is credit ALREADY extended, and pricing it is the bank's only choice left.
    ctx.prevActiveFirms.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      if (c.region !== regionId || c.isDefaulted || c.isBankEntity || c.mergerAcquired) return;
      const cashLocal = cashOf(ctx.v2, c);
      if (!c.homeBankTicker || !(cashLocal < -1)) return;
      const drawLocal = -cashLocal;
      // P1: priced off the borrower's own PD at its bank's hurdle, like every facility.
      const marginBps = facilityMarginBpsFor(ensureV2(state), c, reg, ctx.updatedCompanies.find((b) => b.ticker === c.homeBankTicker));
      const tranche = {
        id: `${c.id}-REVOLVER-OD-${ctx.nextWeek}`,
        principalLocal: drawLocal,
        rateType: 'FLOATING' as const,
        floatingMarginBps: marginBps,
        originationWeek: ctx.nextWeek,
        maturityWeek: ctx.nextWeek + 52,
        seniority: 'SENIOR' as const,
        isBankFacility: true,
        facilityBankTicker: c.homeBankTicker,
      };
      issueTranche(ensureV2(state), { id: c.id, ticker: c.ticker, region: c.region }, tranche, 'overdraft converted to a facility draw');
      pay(ctx, {
        payer: { kind: 'BANK_CREDIT', ticker: c.homeBankTicker },
        payee: { kind: 'COMPANY', ticker: c.ticker },
        amount: drawLocal,
        currency: currencyOf(c.region),
        reason: 'overdraft converted to facility draw',
      });
      if (process.env.OD_TRACE === '1' && drawLocal > 50e6) {
        console.log(`  [od] w${ctx.nextWeek} ${regionId}:${c.ticker} overdraft ${(drawLocal / 1e6).toFixed(0)}M -> facility draw (bank ${c.homeBankTicker})`);
      }
    });

    // A3.6c-ii: the corporate line IS the firms' accounts at the bank (`depositLinesAt`); the
    // per-bank reconciliation that measured the two against each other is gone with the field.
    if (process.env.RECON_TRACE === '1') {
      let negLocal = 0, negN = 0, unbankedLocal = 0, unbankedN = 0;
      ctx.updatedCompanies.forEach((c) => {
        if (c.region !== regionId || c.isBankEntity || c.mergerAcquired) return;
        const cashLocal = cashOf(ctx.v2, c);
        if (!c.homeBankTicker) { unbankedLocal += cashLocal; unbankedN++; return; }
        if (cashLocal < 0) { negLocal += cashLocal; negN++; }
      });
      console.log(`  [recon-base] w${ctx.nextWeek} ${regionId} negatives ${(negLocal / 1e6).toFixed(0)}M x${negN} | unbanked ${(unbankedLocal / 1e6).toFixed(0)}M x${unbankedN}`);
    }
    // The segment pools' balances, reconciled the same way — each pool's cash sits across
    // the region's banks pro-rata by market share (settlement spreads it identically; this
    // catches share drift and any balance moved outside instructions, with the reserve leg).

    // The week's real household-credit flows, per bank, for the region roll-up below.
    const householdFlowsByBank = new Map<string, {
      interestLocal: number; debtServicePrincipalLocal: number; principalLocal: number;
      mortgageOriginationLocal: number; mortgageDischargeLocal: number; mortgageRateQuotedAnnual: number; turnoverRateAnnual: number; mortgageBookLocal: number;
      consumerCreditOriginationLocal: number;
    }>();

    // §3.13-SOV row 2: the sovereign ladder comes from the ONE store.
    const sovCouponByBond = sovereignCouponByBond(materializeGovLadder(ctx.v2, regionId));

    // What each bank owes and is owed on contracts that come due this week.
    const dueThisWeek = maturingAt(reg.repoBook ?? [], ctx.nextWeek);
    const maturingRepo = (ticker: string) => {
      let borrowPrincipalLocal = 0, borrowInterestLocal = 0, lendPrincipalLocal = 0, lendInterestLocal = 0;
      dueThisWeek.forEach((c) => {
        const interestLocal = repoInterestToMaturityLocal(c);
        if (c.borrowerTicker === ticker) { borrowPrincipalLocal += c.principalLocal; borrowInterestLocal += interestLocal; }
        if (c.lender.kind === 'BANK' && c.lender.ticker === ticker) { lendPrincipalLocal += c.principalLocal; lendInterestLocal += interestLocal; }
      });
      return { borrowPrincipalLocal, borrowInterestLocal, lendPrincipalLocal, lendInterestLocal };
    };

    const newSheets: { bank: Company; sheet: BankingSector }[] = banks.map((bank) => {
      const share = bank.bankMarketShare ?? 1 / banks.length;
      const prevSheet = bank.bankBalanceSheet ?? scaleBankingSector(priorAggregate, share);
      const riskFactor = bank.bankRiskFactor ?? 1.0;
      // step 10: the bank's facility book is its rows on the borrowers' ladders.
      const facilityRows = facilityRowsOf(ctx.v2, bank.ticker);
      const facilityBookLocal = facilityBookOf(ctx.v2, bank.ticker);

      // Last week's itemized book earns its real interest — computed here so the margin
      // reads the same loans the book actually holds.
      const priorLoanInterestWeeklyLocal = (prevSheet.businessLoans || [])
        .filter((l) => l.status === 'PERFORMING')
        .reduce((a, l) => a + (l.principalLocal * (reg.policyRate + l.marginBps / 10000)) / 52, 0);
      // The FACILITY interest is paid by the borrower as a real payment (stage 08 →
      // settlement), so the evolution measures it and never credits it; the facilities are the
      // ladder rows (step 10). SME pools have no cash ledger of their own and pay through the book.
      const priorFacilityInterestWeeklyLocal = facilityRows
        .reduce((a, f) => a + (f.principalLocal * (reg.policyRate + f.marginBps / 10000)) / 52, 0);
      // The SME slice is a real payment now too — each pool pays its own interest from
      // its own book (SEGMENT → BANK through settlement), on the same prior-week basis the
      // facility exclusion uses, so the evolution must not credit it either.
      let priorSmeInterestWeeklyLocal = 0;
      (prevSheet.businessLoans || [])
        .filter((l) => l.status === 'PERFORMING' && l.borrowerKind === 'SME_POOL')
        .forEach((l) => {
          const seg = (reg.smePools || []).find((s) => smePoolId(regionId, s.industry) === l.borrowerId);
          if (!seg) return;
          const interestLocal = (l.principalLocal * (reg.policyRate + l.marginBps / 10000)) / 52;
          priorSmeInterestWeeklyLocal += interestLocal;
          pay(ctx, {
            payer: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
            payee: { kind: 'BANK', ticker: bank.ticker },
            amount: interestLocal,
            currency: currencyOf(regionId),
            reason: 'SME pool interest to the lending bank',
          });
        });

      // The household books' real accrual on the same prior-week basis — each pool at its
      // own terms (a mortgage pool at its fixed WAC, card/term at policy plus their margins).
      const priorHouseholdInterestWeeklyLocal = (prevSheet.householdLoans || []).reduce((a, pl) => {
        const rate = pl.kind === 'MORTGAGE'
          ? (pl.wacAnnual ?? currentMortgageRateAnnual(reg))
          : reg.policyRate + (pl.marginBps ?? 500) / 10000;
        return a + (pl.principalLocal * rate) / 52;
      }, 0);

      const reservesLocal = bankReservesOf(ctx.v2, bank.ticker);
      const householdOpenLocal = householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region));
      const { sheet, householdLineLocal: evolvedHouseholdLineLocal } = evolveBankingSector(
        prevSheet,
        { businessLoanLocal: businessLoanBookOf(prevSheet, facilityBookLocal), consumerLoanLocal: consumerLoanBookOf(prevSheet) },
        reservesLocal,
        bankDepositLines(ctx, bank.ticker),
        reg.estimatedHouseholdIncomeLocal * share,
        reg.householdState.savingsRate,
        reg.policyRate,
        // A higher-risk bank's book is more exposed to the SAME regional unemployment print, the
        // way a bank concentrated in subprime/regional consumer lending genuinely would be (see
        // bankRiskFactor's doc comment in domain/company.ts) — the actual reason two banks facing
        // one regional credit cycle diverge.
        reg.unemploymentRate * (0.6 + riskFactor * 0.4),
        // THIS bank's real tenor book at the real cleared curve — not the 10Y on a scalar.
        computeSovereignBookAnnualYield(prevSheet.sovereignBondHoldingsByBond, reg.zeroRates,
          sovereignTenorResolver(materializeGovLadder(ctx.v2, regionId), ctx.nextWeek)),
        reg.creditConditionsSpilloverAdjustment ?? 0,
        // The CONTRACTS due this week mature inside as explicit flows — each at the rate
        // it was struck at and over the term it ran, the standing facility included.
        maturingRepo(bank.ticker).borrowPrincipalLocal,
        maturingRepo(bank.ticker).borrowInterestLocal,
        maturingRepo(bank.ticker).lendPrincipalLocal,
        maturingRepo(bank.ticker).lendInterestLocal,
        priorLoanInterestWeeklyLocal - priorSmeInterestWeeklyLocal,
        priorHouseholdInterestWeeklyLocal,
        // Real coupons on this bank's own sovereign book.
        Object.entries(prevSheet.sovereignBondHoldingsByBond || {}).reduce(
          (a, [k, v]) => a + ((Number(v) || 0) * (sovCouponByBond[k] ?? 0)) / 52, 0
        ),
        regionDivertedLocal * share,
        // Slice 5: the rate this bank's deposits must compete with.
        findRegionMmf(ctx.updatedInstitutionalEntities, regionId)?.mmfNetYieldAnnual ?? 0,
        // §3.13: what the market charges THIS bank for money — the front of its OWN credit
        // curve, since the wholesale roll it is paying for is a week long, read off the bonds the
        // corporate book actually printed for it. A bank with none printed pays the wholesale
        // spread, which is the only quote anyone has given it.
        issuerSpreadAtOnCurve(ctx.v2, reg.zeroRates, bank.id, ctx.nextWeek, 1 / 52)?.spreadBps
          ?? WHOLESALE_FUNDING_SPREAD_BPS,
        // The households' own measured split, so the funding-pressure denominator and the
        // inflow it is measured against are the SAME number.
        depositShare,
        // Income the evolution must MEASURE but never credit to cash — the interest
        // borrowers pay as real payments (facility + SME, via settlement) and the bill
        // accretion the sovereign book earned last week (non-cash, already in equity). Leaving
        // these out made the NIM statistic and the payout read a bank poorer than its ledger.
        priorFacilityInterestWeeklyLocal + priorSmeInterestWeeklyLocal
          + (prevSheet.lastBillAccretionWeeklyLocal ?? 0),
        // NIM_TRACE instrument label; inert unless the env flag is set.
        `${regionId}:${bank.ticker}`
      );

      // C4: the three flows the evolution DECIDED are PAID here, as instructions between
      // named parties. Interest on reserves is the central bank's expense — it settles by
      // creating the reserves, and its remittance to the treasury is already net of it.
      if ((sheet.reservesInterestWeeklyLocal ?? 0) > 0) {
        pay(ctx, {
          payer: { kind: 'CENTRAL_BANK', region: regionId },
          payee: { kind: 'BANK', ticker: bank.ticker },
          amount: sheet.reservesInterestWeeklyLocal!,
          currency: currencyOf(regionId),
          reason: 'interest on reserves',
        });
        if (reg.centralBankSheet) {
          reg.centralBankSheet.lastInterestOnReservesLocal =
            (reg.centralBankSheet.lastInterestOnReservesLocal ?? 0) + sheet.reservesInterestWeeklyLocal!;
        }
      }
      // The dividend goes to the register: the paying agent settles it pro rata to the holders
      // of record as a payment from this bank (reserves and equity leave at settlement).
      if ((sheet.dividendWeeklyLocal ?? 0) > 0) payHoldersCash(ctx, bank.id, 'EQUITY', sheet.dividendWeeklyLocal!);
      // The itemized book's own week — facility reconciliation, real interest accrual
      // basis, real SME write-offs, and priced origination under the real capital constraint.
      const lending = runBankWeeklyLending(bank, sheet, reg, regionId, ctx.nextWeek);
      // A loan creates a deposit — the pool's new money is written by this bank's own
      // credit (no reserve moves) and lands on the pool's cash and this bank's smeDepositsLocal
      // line at settlement, in the same week the loan appeared on the book above.
      lending.smeOriginationBySegment.forEach((grantedLocal, industry) => {
        pay(ctx, {
          payer: { kind: 'BANK_CREDIT', ticker: bank.ticker },
          payee: { kind: 'SEGMENT', region: regionId, industry },
          amount: grantedLocal,
          currency: currencyOf(regionId),
          reason: 'SME loan origination creates the pool deposit',
        });
      });
      // The household books' own week — derived amortization, measured losses, and
      // priced, capital-gated origination (mortgage demand off the real housing turnover).
      const household = runBankHouseholdLending(
        bank, lending.sheet, reg, reg.unemploymentRate * (0.6 + riskFactor * 0.4), ctx.nextWeek
      );
      householdFlowsByBank.set(bank.ticker, {
        interestLocal: priorHouseholdInterestWeeklyLocal,
        debtServicePrincipalLocal: household.debtServicePrincipalWeeklyLocal,
        mortgageOriginationLocal: household.mortgageOriginationLocal,
        mortgageDischargeLocal: household.mortgageDischargeLocal,
        mortgageRateQuotedAnnual: household.mortgageRateQuotedAnnual,
        turnoverRateAnnual: household.turnoverRateAnnual,
        mortgageBookLocal: (household.sheet.householdLoans ?? [])
          .filter((pl) => pl.kind === 'MORTGAGE').reduce((a, pl) => a + pl.principalLocal, 0),
        consumerCreditOriginationLocal: household.consumerCreditOriginationLocal,
        principalLocal: household.principalWeeklyLocal,
      });
      const lentSheet = household.sheet;
      const withDeposits: BankingSector = {
        ...lentSheet,
        loanLossProvisionRateAnnualPct: Number(
          (businessLoanBookOf(lentSheet, facilityBookLocal) > 0 ? (lending.loanLossWeeklyLocal * 52) / businessLoanBookOf(lentSheet, facilityBookLocal) : 0).toFixed(4)
        ),
      };
      ctx.g2DeclinedOriginationLocal[regionId] = (ctx.g2DeclinedOriginationLocal[regionId] ?? 0) + lending.declinedOriginationLocal;
      // A3.4/A3.6c-iii: what this bank's own book did to its household line this stage
      // the evolution's interest debit and deposit-interest credit (to the dollar), then the
      // loans it wrote and retired and the amortization it took — is the household sector's row
      // at this bank moving by the same amount, posted here as the one account operation.
      const householdLineLocal = evolvedHouseholdLineLocal + household.mortgageOriginationLocal - household.mortgageDischargeLocal
        + household.consumerCreditOriginationLocal - household.principalWeeklyLocal;
      adjustSectorRow(ctx.v2, { kind: 'HOUSEHOLD', region: regionId }, bank.ticker, currencyOf(regionId), householdLineLocal - householdOpenLocal);
      // A3.6a/c: the evolution used to return the reserves rounded to the dollar; the rounding is
      // the bank's account moving by the fraction (a stated artifact kept for the run's identity).
      adjustBankReserves(ctx.v2, bank.ticker, Math.round(reservesLocal) - reservesLocal);
      return { bank, sheet: withDeposits };
    });

    // The pool's debt is the DERIVED SUM of the loans the banks actually hold against it
    // one representation (rule 4). The in-place `debtLocal += granted` during origination only
    // sequences demand across banks within the pass; this write is the record, and it now
    // carries the loss leg too (write-offs used to shrink the banks' books while the segment's
    // number never noticed).
    {
      const poolTotals = new Map<string, number>();
      const poolMarginWeighted = new Map<string, number>();
      newSheets.forEach(({ sheet }) => (sheet.businessLoans || []).forEach((l) => {
        if (l.borrowerKind !== 'SME_POOL') return;
        poolTotals.set(l.borrowerId, (poolTotals.get(l.borrowerId) ?? 0) + l.principalLocal);
        poolMarginWeighted.set(l.borrowerId,
          (poolMarginWeighted.get(l.borrowerId) ?? 0) + l.principalLocal * l.marginBps);
      }));
      (reg.smePools || []).forEach((seg) => {
        const id = smePoolId(regionId, seg.industry);
        const principalLocal = poolTotals.get(id) ?? 0;
        seg.debtLocal = Math.round(principalLocal);
        // The blended margin of the pool's REAL loans, derived beside the principal —
        // sme-pools reads it for debt service instead of an invented +300bp, closing the
        // credit-transmission loop (a tightening now reaches measured pool distress).
        seg.blendedMarginBps = principalLocal > 0
          ? Number(((poolMarginWeighted.get(id) ?? 0) / principalLocal).toFixed(1))
          : seg.blendedMarginBps;
      });
    }

    // The weekly money-market session. Every real flow has posted; banks short of their
    // buffer now fund against their collateral, surplus banks and institutional idle cash
    // lend, and the SRF sits in the book as the posted-rate seat of last resort — so there is
    // no separate "facility draw" step to run afterwards, and the region's overnight rate is
    // whatever this session cleared.
    const sheetByTicker = new Map<string, BankingSector>(newSheets.map(({ bank, sheet }) => [bank.ticker, sheet]));
    const session = runRegionalRepoSession(regionId, reg, banks, sheetByTicker, ctx);
    reg.repoRateAnnual = Number(session.repoRateAnnual.toFixed(6));
    // GUARD: what the session had to fund and what it actually lent, so the harness can tell a
    // quiet week from a dead market — the distinction the corridor assertion cannot make.
    reg.repoFundableNeedLocal = Math.round(session.fundableNeedLocal);
    reg.repoClearedVolumeLocal = Math.round(session.clearedVolumeLocal);
    // The fund's quote for next week's yield-gap decision comes off its post-session book.
    refreshMmfQuotes(regionId, reg, ctx);
    newSheets.forEach((entry) => {
      entry.sheet = session.sheetByTicker.get(entry.bank.ticker) ?? entry.sheet;
    });

    if (reg.centralBankSheet) reg.centralBankSheet.lastLoanInterestLocal = 0;
    newSheets.forEach(({ bank, sheet }) => {
      // The central bank's loan is repaid from cash above the buffer (the liability
      // leaves here, bank-lending owns the write; the cash leaves at settlement, extinguishing
      // the reserves it created), and its interest is a payment to the named creditor.
      const cbSheet = reg.centralBankSheet;
      const repaidLocal = repayCentralBankLoanLocal(sheet, bankReservesOf(ctx.v2, bank.ticker), householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)), bankCashBufferRatioOf(bank));
      if (repaidLocal > 0) {
        if (cbSheet) cbSheet.loansToBanksLocal = Math.max(0, (cbSheet.loansToBanksLocal ?? 0) - repaidLocal);
        pay(ctx, {
          payer: { kind: 'BANK_SECURITIES', ticker: bank.ticker },
          payee: { kind: 'CENTRAL_BANK', region: regionId },
          amount: repaidLocal,
          currency: currencyOf(regionId),
          reason: 'central bank loan repaid',
        });
      }
      // C4: interest on corporate balances is paid to the depositors who earn it —
      // each firm with a positive balance at this bank, pro rata to its balance, at the rate
      // the evolution decided. (Estates and defaulted firms hold balances too; a balance is
      // a balance.)
      const corpInterestLocal = sheet.corporateDepositInterestWeeklyLocal ?? 0;
      if (corpInterestLocal > 0) {
        const depositors = ctx.updatedCompanies.filter(
          (c) => c.region === regionId && !c.isBankEntity && !c.mergerAcquired && c.homeBankTicker === bank.ticker && cashOf(ctx.v2, c) > 0
        );
        const positiveLocal = depositors.reduce((a, c) => a + cashOf(ctx.v2, c), 0);
        if (positiveLocal > 0) {
          depositors.forEach((c) => {
            pay(ctx, {
              payer: { kind: 'BANK', ticker: bank.ticker },
              payee: { kind: 'COMPANY', ticker: c.ticker },
              amount: corpInterestLocal * (cashOf(ctx.v2, c) / positiveLocal),
              currency: currencyOf(c.region),
              reason: 'interest on corporate deposits',
            });
          });
        }
      }
      const cbLoanInterestLocal = ((sheet.centralBankLoanLocal ?? 0) * (reg.policyRate + (SRF_SPREAD_BPS + CENTRAL_BANK_LOAN_PENALTY_BPS) / 10000)) / 52;
      if (cbLoanInterestLocal > 0) {
        pay(ctx, {
          payer: { kind: 'BANK', ticker: bank.ticker },
          payee: { kind: 'CENTRAL_BANK', region: regionId },
          amount: cbLoanInterestLocal,
          currency: currencyOf(regionId),
          reason: 'central bank loan interest',
        });
        if (cbSheet) cbSheet.lastLoanInterestLocal = (cbSheet.lastLoanInterestLocal ?? 0) + cbLoanInterestLocal;
      }
      updateBankSheet(ctx, bank.ticker, sheet);
    });


    // The region-level bankingSector every other stage reads becomes the real sum of these
    // named banks, replacing (not supplementing) the single-formula aggregate stage 2 computed
    // one source of truth, now genuinely derived from real per-bank state instead of the
    // other way around.
    const sumField = (f: (s: BankingSector) => number) => newSheets.reduce((s, { sheet }) => s + f(sheet), 0);
    // The region's view of one dealer book — every named desk's position, summed by name.
    const deskView = (book: string) =>
      Array.from(regionalDeskView(newSheets.map(({ sheet }) => sheet.dealerDeskInventory), book).entries())
        .filter(([, usd]) => Math.abs(usd) > 1);
    const assetsOf = ({ bank, sheet }: { bank: Company; sheet: BankingSector }) => loanBooksOf(sheet, facilityBookOf(ctx.v2, bank.ticker)) + sheet.sovereignBondHoldingsLocal + bankReservesOf(ctx.v2, bank.ticker);
    const totalAssets = newSheets.reduce((s, e) => s + assetsOf(e), 0);
    const weightedAvg = (f: (s: BankingSector) => number) =>
      totalAssets > 0
        ? newSheets.reduce((s, e) => s + f(e.sheet) * assetsOf(e), 0) / totalAssets
        : (newSheets.reduce((s, { sheet }) => s + f(sheet), 0) / Math.max(1, newSheets.length));

    // `satisfies` over Required<BankingSector> makes this rebuild EXHAUSTIVE — the old
    // literal silently dropped nine optional fields (every `?? 0` reader of the aggregate then
    // saw zero), and every future optional field would silently not aggregate. Now a new
    // BankingSector field fails to compile here until it is summed, averaged, or explicitly
    // declared per-bank-only.
    reg.bankingSector = {
      sovereignBondHoldingsLocal: sumField((s) => s.sovereignBondHoldingsLocal),
      bankEquityLocal: sumField((s) => s.bankEquityLocal),
      bankCapitalRatio: Number(weightedAvg((s) => s.bankCapitalRatio).toFixed(4)),
      netInterestMarginPct: Number(weightedAvg((s) => s.netInterestMarginPct).toFixed(4)),
      loanLossProvisionRateAnnualPct: Number(weightedAvg((s) => s.loanLossProvisionRateAnnualPct).toFixed(4)),
      creditConditionsIndex: Number(weightedAvg((s) => s.creditConditionsIndex).toFixed(3)),
      centralBankReservesLocal: sumField((s) => s.centralBankReservesLocal),
      // G2 slice 5: M2 = the real deposits at the named banks + the region's money-fund
      // shares (WS7's real liabilities — money held outside a bank is still money).
      moneySupplyM2Local: sumField((s) => s.moneySupplyM2Local)
        + ctx.updatedInstitutionalEntities
            .filter((e) => e.region === regionId && e.entityType === 'MONEY_MARKET_FUND')
            .reduce((a, e) => a + (e.mmfSharesOutstandingLocal ?? 0), 0),
      itemizedHoldings: priorAggregate.itemizedHoldings || [],
      srfBorrowingLocal: sumField((s) => s.srfBorrowingLocal),
      onRrpLendingLocal: sumField((s) => s.onRrpLendingLocal),
      // Real per-bank sovereign holdings, summed across named banks — each bank is its own real
      // participant in the sovereign-bond clearing engine (07c-sovereign-bond-clearing.ts).
      sovereignBondHoldingsByBond: (() => {
        const buckets: Record<string, number> = {};
        newSheets.forEach(({ sheet }) => {
          Object.entries(sheet.sovereignBondHoldingsByBond || {}).forEach(([k, v]) => {
            buckets[k] = (buckets[k] ?? 0) + v;
          });
        });
        return buckets;
      })(),
      // Dealer inventory is now OWNED, one desk per named bank (domain/dealer-desk.ts).
      // These three arrays are the derived regional view of those desks and nothing decides off
      // them — the books that clear later this week overwrite them with their own session's
      // result, and a desk's position is only ever written by the bank that took it.
      corpBondDealerInventory: deskView('corporate bond').map(([instrumentId, inventoryLocal]) => ({ instrumentId, inventoryLocal })),
      sovBondDealerInventory: [
        // §3.13-SOV row 3: the desk row names the BOND (the field is still called bondId).
        ...deskView('sovereign bond').map(([instrumentId, inventoryLocal]) => ({ bondId: instrumentId, inventoryLocal })),
        ...deskView('bill').map(([instrumentId, inventoryLocal]) => ({ bondId: instrumentId, inventoryLocal })),
      ],
      loanDealerInventory: deskView('leveraged loan').map(([companyId, inventoryLocal]) => ({ companyId, inventoryLocal })),
      // The region's overnight book is the sum of the named banks' real positions. The
      // RATE is one market print per region and lives on reg.repoRateAnnual — never a second
      // copy on any sheet.
      repoLentLocal: sumField((s) => s.repoLentLocal ?? 0),
      repoBorrowedLocal: sumField((s) => s.repoBorrowedLocal ?? 0),
      repoEncumberedCollateralLocal: sumField((s) => s.repoEncumberedCollateralLocal ?? 0),
      // Itemized loans live per bank; the aggregate carries no copy (a flattened region
      // view would be a second ledger). Corporate deposits sum like everything else.
      businessLoans: [],
      householdLoans: [],
      centralBankLoanLocal: sumField((s) => s.centralBankLoanLocal ?? 0),
      clientMarginLocal: sumField((s) => s.clientMarginLocal ?? 0),
      sovereignAccruedCouponLocal: sumField((s) => s.sovereignAccruedCouponLocal ?? 0),
      primeBrokerageLoansLocal: sumField((s) => s.primeBrokerageLoansLocal ?? 0),
      householdDepositInterestWeeklyLocal: sumField((s) => s.householdDepositInterestWeeklyLocal ?? 0),
      lastBillAccretionWeeklyLocal: sumField((s) => s.lastBillAccretionWeeklyLocal ?? 0),
      reservesInterestWeeklyLocal: sumField((s) => s.reservesInterestWeeklyLocal ?? 0),
      corporateDepositInterestWeeklyLocal: sumField((s) => s.corporateDepositInterestWeeklyLocal ?? 0),
      dividendWeeklyLocal: sumField((s) => s.dividendWeeklyLocal ?? 0),
      depositRateAnnual: Number(weightedAvg((s) => s.depositRateAnnual ?? 0).toFixed(6)),
      // Per-bank-only books: a desk position and an FX book belong to the bank that took them; a
      // regional copy would be a second ledger. Declared, not omitted, so the satisfies holds.
      fxDealerBook: undefined,
      dealerDeskInventory: undefined,
    } satisfies { [K in keyof Required<BankingSector>]: BankingSector[K] };

    // HH: what the region's banks actually paid household depositors this week — measured, so
    // household income can read it instead of re-deriving it at `policyRate x 0.6`.
    reg.householdDepositInterestWeeklyLocal = Math.round(newSheets.reduce(
      (a, { sheet }) => a + (sheet.householdDepositInterestWeeklyLocal ?? 0), 0));

    // ---- HH3: the household sector's debt lines become what they now are — DERIVED SUMS of
    // the itemized pools on the named banks — and the week's real flows are recorded for the
    // household side to read next week (deposit credit, consumption boost, debt service). ----
    const sumPools = (kind: HouseholdLoanKind) => newSheets.reduce(
      (a, { sheet }) => a + (sheet.householdLoans || [])
        .filter((pl) => pl.kind === kind)
        .reduce((x, pl) => x + pl.principalLocal, 0),
      0
    );
    const hs = reg.householdState;
    const priorMortgageDebtLocal = hs.mortgageDebtLocal ?? 0;
    const mortgageDebtLocal = Math.round(sumPools('MORTGAGE'));
    const creditCardDebtLocal = Math.round(sumPools('CREDIT_CARD'));
    const otherConsumerLoanDebtLocal = Math.round(sumPools('CONSUMER_TERM'));
    let interestLocal = 0; let servicePrincipalLocal = 0; let mortgageOriginationLocal = 0;
    let mortgageDischargeLocal = 0; let consumerCreditLocal = 0;
    // HSG: a borrower shops, so the region's going mortgage rate is the KEENEST quote it can
    // find. The quotes differ now — each bank prices its own book's measured loss experience at
    // its own cost of equity — which is what makes a credit tightening reach the housing market
    // as a rate rather than as a stated factor.
    let bestMortgageRateAnnual = Number.POSITIVE_INFINITY;
    // Turnover is a property of the REGION's stock, so the banks' readings are weighted by the
    // book each one measured it on.
    let turnoverWeightedLocal = 0;
    let turnoverBookLocal = 0;
    let bookPrincipalLocal = 0;
    householdFlowsByBank.forEach((f) => {
      interestLocal += f.interestLocal;
      servicePrincipalLocal += f.debtServicePrincipalLocal;
      bookPrincipalLocal += f.principalLocal;
      mortgageOriginationLocal += f.mortgageOriginationLocal;
      mortgageDischargeLocal += f.mortgageDischargeLocal;
      consumerCreditLocal += f.consumerCreditOriginationLocal;
      if (f.mortgageRateQuotedAnnual > 0) {
        bestMortgageRateAnnual = Math.min(bestMortgageRateAnnual, f.mortgageRateQuotedAnnual);
      }
      if (f.mortgageBookLocal > 0 && f.turnoverRateAnnual > 0) {
        turnoverWeightedLocal += f.turnoverRateAnnual * f.mortgageBookLocal;
        turnoverBookLocal += f.mortgageBookLocal;
      }
    });
    // HH4d: the household deposit stock IS the banks' summed household-deposit line — one
    // number, reconciled here every week (the balance-sheet stage debits this week's ETF
    // purchases from the view and records them for next week's bank settlement). The diverted
    // savings become a real money-fund share stock on the household book instead of money that
    // vanished from the household view at the yield gate.
    // M6: the deposits the household BOOK wrote this week — a loan creates the
    // borrower's deposit, a repayment and the interest destroy it — reported so the money-stock
    // decomposition can count the banks' second creator (the first is the payment ledger).
    reg.householdBookDepositFlowWeeklyLocal = Math.round(
      mortgageOriginationLocal - mortgageDischargeLocal + consumerCreditLocal - bookPrincipalLocal - interestLocal);
    reg.householdState = {
      ...hs,
      mmfSharesLocal: Math.round(((hs.mmfSharesLocal ?? 0) + regionDivertedLocal)),
      mortgageDebtLocal,
      creditCardDebtLocal,
      otherConsumerLoanDebtLocal,
      priorMortgageDebtLocal,
      householdDebtToIncomeRatio: reg.estimatedHouseholdIncomeLocal > 0
        ? Number(((mortgageDebtLocal + creditCardDebtLocal + otherConsumerLoanDebtLocal) / reg.estimatedHouseholdIncomeLocal).toFixed(4))
        : hs.householdDebtToIncomeRatio,
      // Burden is interest plus REQUIRED principal (annuity schedules and card minimums);
      // transactor turnover is consumption already counted, cycled through a card.
      weeklyDebtServiceLocal: Math.round((interestLocal + servicePrincipalLocal)),
      // The household sector's NET deposit credit from housing: buyers' new loans minus the
      // sellers' loans the sale proceeds retired.
      weeklyMortgageOriginationLocal: Math.round((mortgageOriginationLocal - mortgageDischargeLocal)),
      weeklyNewConsumerCreditLocal: Math.round(consumerCreditLocal),
    };
    // The housing-market stat becomes the real number the banks actually wrote this week.
    if (reg.housingMarket) {
      reg.housingMarket.mortgageOriginationVolumeLocal = Math.round(mortgageOriginationLocal);
      if (Number.isFinite(bestMortgageRateAnnual)) {
        reg.housingMarket.bestMortgageRateAnnual = Number(bestMortgageRateAnnual.toFixed(5));
      }
      if (turnoverBookLocal > 0) {
        reg.housingMarket.turnoverRateAnnual = Number((turnoverWeightedLocal / turnoverBookLocal).toFixed(5));
      }
    }
  });
}
