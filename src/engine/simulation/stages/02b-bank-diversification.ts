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

import { govBucketKeyOf } from '../../../domain/sovereign-id';
import { ensureV2 } from '../../../engine2/world';
import {  ladderRowsOf, TR_FACILITY } from '../../../engine2/tranches';
import { issueTranche } from '../../ledger/tranche-ledger';
import { GameState, RegionId, Company } from '../../../types';
import { BankingSector, HouseholdLoanKind } from '../../../domain/banking';
import { regionalDeskView } from '../../../domain/dealer-desk';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey, payHoldersCash } from './shared-helpers';
import {
  evolveBankingSector, computeSovereignBookAnnualYield, savingsToDepositsShare,
} from '../../macro/banking';
import { runRegionalRepoSession } from './repo-clearing';
import { maturingAt, repoInterestToMaturityUSD } from '../../../domain/repo';
import { divertHouseholdSavingsToMmf, refreshMmfQuotes, findRegionMmf } from './money-market-fund';
import { runBankWeeklyLending, runBankHouseholdLending, currentMortgageRateAnnual, smePoolId, repayCentralBankLoanUSD, CENTRAL_BANK_LOAN_PENALTY_BPS, facilityMarginBpsFor } from './bank-lending';
import { WeeklyStepContext, updateBankSheet } from './context';
import { businessLoanBookOf, consumerLoanBookOf, loanBooksOf } from '../../../domain/banking';
import { pay } from './settlement';
import { SRF_SPREAD_BPS } from '../../macro/banking';

function scaleBankingSector(bs: BankingSector, share: number): BankingSector {
  const scaledBuckets: Record<string, number> = {};
  Object.entries(bs.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => { scaledBuckets[k] = v * share; });
  return {
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
    centralBankLoanUSD: (bs.centralBankLoanUSD ?? 0) * share,
    clientMarginUSD: (bs.clientMarginUSD ?? 0) * share,
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
          + Math.max(0, sh.institutionalDepositsUSD ?? 0) + Math.max(0, sh.smeDepositsUSD ?? 0);
      };
      const regionDepositsUSD = banks.reduce((a, b) => a + depositsOf(b), 0);
      if (regionDepositsUSD > 0) {
        banks.forEach((b) => { b.bankMarketShare = Number((depositsOf(b) / regionDepositsUSD).toFixed(6)); });
      }
    }

    // WS7: the household savings flow chooses between deposits and the money fund on last
    // week's real yield gap, BEFORE the banks' deposit flow posts — the deposits simply never
    // arrive at the banks. This is the funding competition WS7 exists to create.
    const depositShare = savingsToDepositsShare(reg.householdState);
    const regionSavingsDepositInflowUSD = (reg.householdState.savingsRate * reg.estimatedHouseholdIncomeUSD) / 52 * depositShare;
    const regionDivertedUSD = divertHouseholdSavingsToMmf(regionId, reg, regionSavingsDepositInflowUSD, ctx);

    // G2: the corporate bank facilities each named bank holds, read off the borrowers' REAL
    // ladders — the bank's loan records mirror them 1:1 rather than being a second stock.
    const facilityTranchesByBank = new Map<string, { companyId: string; trancheId: string; principalUSD: number; marginBps: number; originationWeek: number; maturityWeek: number }[]>();
    const v2r = ensureV2(state);
    const TSr = v2r.tranches;
    ctx.prevActiveFirms.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      if (c.region !== regionId || c.isDefaulted) return;
      // §7.311 — the facility scan on rows (walk order = ladder order).
      for (const r of ladderRowsOf(v2r, c.id)) {
        if (!(TSr.flags[r] & TR_FACILITY) || TSr.bankRef[r] < 0) continue;
        const bankTicker = v2r.internedStrings[TSr.bankRef[r]];
        (facilityTranchesByBank.get(bankTicker) ?? facilityTranchesByBank.set(bankTicker, []).get(bankTicker)!)
          .push({
            companyId: c.id, trancheId: v2r.internedStrings[TSr.idRef[r]], principalUSD: TSr.principalUSD[r],
            marginBps: Number.isNaN(TSr.floatingMarginBps[r]) ? 350 : TSr.floatingMarginBps[r],
            originationWeek: TSr.originationWeek[r], maturityWeek: TSr.maturityWeek[r],
          });
      }
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
      // CASH: an entity whose balance is NEGATIVE is overdrawn, and the clamp above hides it —
      // the reconcile then re-plugs the same gap every week and the bypass meter reads it as
      // unrouted flow. It is neither: it is a fund spending money it does not have, and it needs
      // its own line so the meter measures what it claims to.
      ctx.cashOverdraftUSD += Math.max(0, -(e.cashUSD ?? 0));
    });
    // §7.265 — THE OVERDRAFT CONVERSION: a company whose SETTLED balance stands negative has
    // already spent its bank's money, so the bank's de-facto credit becomes a de-jure facility
    // draw at revolver pricing. Stage 08's own revolver fires on the walk's forward view, but
    // the books that run AFTER it (the late clearings, ETF flows, FX, the close) can settle a
    // company negative with no lender until this pass — measured as ~4.5B/week of standing
    // negative balances (§7.264), money nobody funded. One statement, the SEG2e shape: the
    // tranche goes on the borrower, the credit event books the loan on the bank, and the
    // BANK_CREDIT payment writes the deposit back to zero — a loan creates a deposit. The
    // borrower's own machinery services and prepays it like any facility. No headroom test:
    // an overdraft is credit ALREADY extended, and pricing it is the bank's only choice left.
    ctx.prevActiveFirms.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      if (c.region !== regionId || c.isDefaulted || c.isBankEntity || c.mergerAcquired) return;
      if (!c.homeBankTicker || !(c.cash < -1)) return;
      const drawUSD = -c.cash;
      // §5-CLOSE P1: priced off the borrower's own PD at its bank's hurdle, like every facility.
      const marginBps = facilityMarginBpsFor(ensureV2(state), c, reg, ctx.updatedCompanies.find((b) => b.ticker === c.homeBankTicker));
      const tranche = {
        id: `${c.id}-REVOLVER-OD-${ctx.nextWeek}`,
        principalUSD: drawUSD,
        rateType: 'FLOATING' as const,
        floatingMarginBps: marginBps,
        originationWeek: ctx.nextWeek,
        maturityWeek: ctx.nextWeek + 52,
        seniority: 'SENIOR' as const,
        isBankFacility: true,
        facilityBankTicker: c.homeBankTicker,
      };
      issueTranche(ensureV2(state), { id: c.id, ticker: c.ticker, region: c.region }, tranche, 'overdraft converted to a facility draw');
      ctx.creditEventsThisWeek.push({
        bankTicker: c.homeBankTicker, companyId: c.id, trancheId: tranche.id,
        principalUSD: drawUSD, marginBps,
        originationWeek: ctx.nextWeek, termWeeks: 52, retire: false,
      });
      pay(ctx, {
        payer: { kind: 'BANK_CREDIT', ticker: c.homeBankTicker },
        payee: { kind: 'COMPANY', ticker: c.ticker },
        amountUSD: drawUSD,
        reason: 'overdraft converted to facility draw',
      });
      if (process.env.OD_TRACE === '1' && drawUSD > 50e6) {
        console.log(`  [od] w${ctx.nextWeek} ${regionId}:${c.ticker} overdraft ${(drawUSD / 1e6).toFixed(0)}M -> facility draw (bank ${c.homeBankTicker})`);
      }
    });

    const corporateDepositsByBank = new Map<string, number>();
    // §7.288: DEFAULTED firms are IN the truth now. §7.264 excluded them because the seize
    // design froze their balances outside the banking system; §7.286 made the dead firm's
    // account the ESTATE'S account — real money at its bank, moved by real instructions
    // (asset sales in, distributions out) that settlement credits to this very line. Excluding
    // it made every open estate a manufactured corporate-class mismatch, one per death.
    ctx.updatedCompanies.forEach((c) => {
      if (c.region !== regionId || c.isBankEntity || c.mergerAcquired) return;
      if (!c.homeBankTicker) return;
      // §7.264 MEASURED BOTH CONVENTIONS: clamped, the reconcile reads 0.7B/week; signed, it
      // reads 5.2B — because ~4.5B/week of corporate balances stand NEGATIVE, and a negative
      // balance is not a negative deposit (a liability cannot be negative) but a bank ASSET —
      // an overdraft loan this model has no line for. The clamp is therefore the correct
      // DEPOSITS concept, and what it leaves out is not a truth-convention error but the
      // missing overdraft-facility mechanism the §6.1 money-conservation row already names:
      // until a negative balance is a real facility draw with a real lender, the overspent
      // cash is money nobody funded. Keep the clamp; build the facility (Tier 2).
      // §7.288 — SIGNED, at last. §7.264 measured the signed convention as worse and kept the
      // clamp; that measurement predates the overdraft facility (§7.265) and the one-mover
      // cash discipline (§7.285). The bank's line is maintained by settlement as the SIGNED
      // sum of its customers' balances, so a clamped truth diverged from it by exactly the
      // rolling overdraft float (measured: ~25B standing in USA, regenerating weekly while
      // the facility conversion drains it at 02b). A negative balance is the bank's overdraft
      // asset and the line nets it — the truth must net it too, or the reconcile "catches"
      // a convention, not a flow.
      corporateDepositsByBank.set(c.homeBankTicker, (corporateDepositsByBank.get(c.homeBankTicker) ?? 0) + c.cash);
    });
    if (process.env.RECON_TRACE === '1') {
      let negUSD = 0, negN = 0, unbankedUSD = 0, unbankedN = 0;
      ctx.updatedCompanies.forEach((c) => {
        if (c.region !== regionId || c.isBankEntity || c.mergerAcquired) return;
        if (!c.homeBankTicker) { unbankedUSD += c.cash; unbankedN++; return; }
        if (c.cash < 0) { negUSD += c.cash; negN++; }
      });
      console.log(`  [recon-base] w${ctx.nextWeek} ${regionId} negatives ${(negUSD / 1e6).toFixed(0)}M x${negN} | unbanked ${(unbankedUSD / 1e6).toFixed(0)}M x${unbankedN}`);
    }
    // SEG1: the segment pools' balances, reconciled the same way — each pool's cash sits across
    // the region's banks pro-rata by market share (settlement spreads it identically; this
    // catches share drift and any balance moved outside instructions, with the reserve leg).
    const segmentCashUSD = (reg.smePools || []).reduce((a, s) => a + Math.max(0, s.cashUSD ?? 0), 0);
    const regionBankShareTotal = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);

    // HH3: the week's real household-credit flows, per bank, for the region roll-up below.
    const householdFlowsByBank = new Map<string, {
      interestUSD: number; debtServicePrincipalUSD: number; principalUSD: number;
      mortgageOriginationUSD: number; mortgageDischargeUSD: number; mortgageRateQuotedAnnual: number; turnoverRateAnnual: number; mortgageBookUSD: number;
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
        { businessLoanUSD: businessLoanBookOf(prevSheet), consumerLoanUSD: consumerLoanBookOf(prevSheet) },
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
        // Slice 5: the rate this bank's deposits must compete with.
        findRegionMmf(ctx.updatedInstitutionalEntities, regionId)?.mmfNetYieldAnnual ?? 0,
        // G3c: what the market charges THIS bank for money — its own cleared credit spread,
        // printed by the same corporate-bond auction that prices every other issuer.
        bank.oasSpreadBps > 0 ? bank.oasSpreadBps : WHOLESALE_FUNDING_SPREAD_BPS,
        // COH4: the households' own measured split, so the funding-pressure denominator and the
        // inflow it is measured against are the SAME number (§7.5's duplicated-constant shape).
        depositShare,
        // §7.254: income the evolution must MEASURE but never credit to cash — the interest
        // borrowers pay as real payments (facility + SME, via settlement) and the bill
        // accretion the sovereign book earned last week (non-cash, already in equity). Leaving
        // these out made the NIM statistic and the payout read a bank poorer than its ledger.
        priorFacilityInterestWeeklyUSD + priorSmeInterestWeeklyUSD
          + (prevSheet.lastBillAccretionWeeklyUSD ?? 0),
        // NIM_TRACE instrument label; inert unless the env flag is set.
        `${regionId}:${bank.ticker}`
      );

      // §5-CLOSE C4: the three flows the evolution DECIDED are PAID here, as instructions between
      // named parties. Interest on reserves is the central bank's expense — it settles by
      // creating the reserves, and its remittance to the treasury is already net of it.
      if ((sheet.reservesInterestWeeklyUSD ?? 0) > 0) {
        pay(ctx, {
          payer: { kind: 'CENTRAL_BANK', region: regionId },
          payee: { kind: 'BANK', ticker: bank.ticker },
          amountUSD: sheet.reservesInterestWeeklyUSD!,
          reason: 'interest on reserves',
        });
      }
      // The dividend goes to the register: the paying agent settles it pro rata to the holders
      // of record as a payment from this bank (reserves and equity leave at settlement).
      if ((sheet.dividendWeeklyUSD ?? 0) > 0) payHoldersCash(ctx, bank.id, 'EQUITY', sheet.dividendWeeklyUSD!);
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
        mortgageRateQuotedAnnual: household.mortgageRateQuotedAnnual,
        turnoverRateAnnual: household.turnoverRateAnnual,
        mortgageBookUSD: (household.sheet.householdLoans ?? [])
          .filter((pl) => pl.kind === 'MORTGAGE').reduce((a, pl) => a + pl.principalUSD, 0),
        consumerCreditOriginationUSD: household.consumerCreditOriginationUSD,
        principalUSD: household.principalWeeklyUSD,
      });
      const lentSheet = household.sheet;
      // Slice 4: the corporate-deposit line is the derived view of the borrowers' real cash.
      // SETL2: settlement maintains this line week to week with its reserve leg. This is the
      // RECONCILIATION to the companies' actual cash — it catches balances moved by stages not
      // yet migrated onto payment instructions, and carries the matching reserve leg with it so
      // the identity cannot drift. The size of this adjustment is the migration's own progress
      // meter: it goes to zero when every stage records instructions.
      const trueCorporateUSD = Math.round((corporateDepositsByBank.get(bank.ticker) ?? 0));
      const trueInstitutionalUSD = Math.round((institutionalDepositsByBank.get(bank.ticker) ?? 0));
      const trueSmeUSD = regionBankShareTotal > 0
        ? Math.round((segmentCashUSD * ((bank.bankMarketShare ?? 0) / regionBankShareTotal)))
        : 0;
      // §7.288: the SME class is NOT in the per-bank meter — settlement's per-bank record IS
      // the allocation, and comparing it to a fresh pro-rata re-spread of the pool stock only
      // measured the convention (offsetting ±B per bank, region sum ~0). The region-level SME
      // assertion lives after this loop.
      void trueSmeUSD;
      const reconcileUSD = (trueCorporateUSD - (lentSheet.corporateDepositsUSD ?? 0))
        + (trueInstitutionalUSD - (lentSheet.institutionalDepositsUSD ?? 0));
      // §7.288 — THE RECONCILE IS AN ASSERTION NOW, NOT A WRITER. The step-1 endgame the
      // comment above always promised ("goes to zero when every stage records instructions"):
      // with the truth SIGNED (the clamp was comparing a deposits-only convention against a
      // line settlement maintains as the signed sum — the divergence WAS the overdraft float,
      // ~60B/week early), the corporate and institutional classes measure 0.0M per bank, per
      // week. The lines below therefore evolve by settlement alone — the one mover — and the
      // meter stays as the watchdog: a nonzero print is once again a stage moving money off
      // the instruction rail. The SME class still meters the pro-rata re-spread drift (~1B/wk
      // region-wide) but no longer re-pins it: settlement's per-bank record IS the allocation.
      ctx.cashReconcileUSD[regionId] = (ctx.cashReconcileUSD[regionId] ?? 0) + Math.abs(reconcileUSD);
      ctx.cashReconcileByClassUSD.corporate += Math.abs(trueCorporateUSD - (lentSheet.corporateDepositsUSD ?? 0));
      ctx.cashReconcileByClassUSD.institutional += Math.abs(trueInstitutionalUSD - (lentSheet.institutionalDepositsUSD ?? 0));
      // RECON_TRACE=1 (§7.288) — the migration meter, attributed per bank and class, signed:
      // which banks' lines diverge from the holders' truth, and in which direction.
      if (process.env.RECON_TRACE === '1') {
        const dc = trueCorporateUSD - (lentSheet.corporateDepositsUSD ?? 0);
        const di = trueInstitutionalUSD - (lentSheet.institutionalDepositsUSD ?? 0);
        if (Math.abs(dc) + Math.abs(di) > 50e6) {
          console.log(`  [recon] w${ctx.nextWeek} ${bank.ticker} corp ${(dc / 1e6).toFixed(1)}M inst ${(di / 1e6).toFixed(1)}M`);
        }
      }
      const withDeposits: BankingSector = {
        ...lentSheet,
        loanLossProvisionRateAnnualPct: Number(
          (businessLoanBookOf(lentSheet) > 0 ? (lending.loanLossWeeklyUSD * 52) / businessLoanBookOf(lentSheet) : 0).toFixed(4)
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
      const poolMarginWeighted = new Map<string, number>();
      newSheets.forEach(({ sheet }) => (sheet.businessLoans || []).forEach((l) => {
        if (l.borrowerKind !== 'SME_POOL') return;
        poolTotals.set(l.borrowerId, (poolTotals.get(l.borrowerId) ?? 0) + l.principalUSD);
        poolMarginWeighted.set(l.borrowerId,
          (poolMarginWeighted.get(l.borrowerId) ?? 0) + l.principalUSD * l.marginBps);
      }));
      (reg.smePools || []).forEach((seg) => {
        const id = smePoolId(regionId, seg.industry);
        const principalUSD = poolTotals.get(id) ?? 0;
        seg.debtUSD = Math.round(principalUSD);
        // §7.241: the blended margin of the pool's REAL loans, derived beside the principal —
        // sme-pools reads it for debt service instead of an invented +300bp, closing the
        // credit-transmission loop (a tightening now reaches measured pool distress).
        seg.blendedMarginBps = principalUSD > 0
          ? Number(((poolMarginWeighted.get(id) ?? 0) / principalUSD).toFixed(1))
          : seg.blendedMarginBps;
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
    reg.repoFundableNeedUSD = Math.round(session.fundableNeedUSD);
    reg.repoClearedVolumeUSD = Math.round(session.clearedVolumeUSD);
    // The fund's quote for next week's yield-gap decision comes off its post-session book.
    refreshMmfQuotes(regionId, reg, ctx);
    newSheets.forEach((entry) => {
      entry.sheet = session.sheetByTicker.get(entry.bank.ticker) ?? entry.sheet;
    });

    if (reg.centralBankSheet) reg.centralBankSheet.lastLoanInterestUSD = 0;
    newSheets.forEach(({ bank, sheet }) => {
      // §5-CLOSE — the central bank's loan is repaid from cash above the buffer (the liability
      // leaves here, bank-lending owns the write; the cash leaves at settlement, extinguishing
      // the reserves it created), and its interest is a payment to the named creditor.
      const cbSheet = reg.centralBankSheet;
      const repaidUSD = repayCentralBankLoanUSD(sheet);
      if (repaidUSD > 0) {
        if (cbSheet) cbSheet.loansToBanksUSD = Math.max(0, (cbSheet.loansToBanksUSD ?? 0) - repaidUSD);
        pay(ctx, {
          payer: { kind: 'BANK_SECURITIES', ticker: bank.ticker },
          payee: { kind: 'CENTRAL_BANK', region: regionId },
          amountUSD: repaidUSD,
          reason: 'central bank loan repaid',
        });
      }
      // §5-CLOSE C4: interest on corporate balances is paid to the depositors who earn it —
      // each firm with a positive balance at this bank, pro rata to its balance, at the rate
      // the evolution decided. (Estates and defaulted firms hold balances too; a balance is
      // a balance.)
      const corpInterestUSD = sheet.corporateDepositInterestWeeklyUSD ?? 0;
      if (corpInterestUSD > 0) {
        const depositors = ctx.updatedCompanies.filter(
          (c) => c.region === regionId && !c.isBankEntity && !c.mergerAcquired && c.homeBankTicker === bank.ticker && c.cash > 0
        );
        const positiveUSD = depositors.reduce((a, c) => a + c.cash, 0);
        if (positiveUSD > 0) {
          depositors.forEach((c) => {
            pay(ctx, {
              payer: { kind: 'BANK', ticker: bank.ticker },
              payee: { kind: 'COMPANY', ticker: c.ticker },
              amountUSD: corpInterestUSD * (c.cash / positiveUSD),
              reason: 'interest on corporate deposits',
            });
          });
        }
      }
      const cbLoanInterestUSD = ((sheet.centralBankLoanUSD ?? 0) * (reg.policyRate + (SRF_SPREAD_BPS + CENTRAL_BANK_LOAN_PENALTY_BPS) / 10000)) / 52;
      if (cbLoanInterestUSD > 0) {
        pay(ctx, {
          payer: { kind: 'BANK', ticker: bank.ticker },
          payee: { kind: 'CENTRAL_BANK', region: regionId },
          amountUSD: cbLoanInterestUSD,
          reason: 'central bank loan interest',
        });
        if (cbSheet) cbSheet.lastLoanInterestUSD = (cbSheet.lastLoanInterestUSD ?? 0) + cbLoanInterestUSD;
      }
      updateBankSheet(ctx, bank.ticker, sheet);
    });

    // §7.288: the SME assertion at the level it is real — the region's pools' cash against
    // the region's SME deposit lines, allocation-free (the per-bank split is settlement's own
    // record and needs no second derivation to check it against).
    {
      const smeLineUSD = newSheets.reduce((a, { sheet }) => a + (sheet.smeDepositsUSD ?? 0), 0);
      ctx.cashReconcileByClassUSD.sme += Math.abs(segmentCashUSD - smeLineUSD);
    }

    // The region-level bankingSector every other stage reads becomes the real sum of these
    // named banks, replacing (not supplementing) the single-formula aggregate stage 2 computed
    // — one source of truth, now genuinely derived from real per-bank state instead of the
    // other way around.
    const sumField = (f: (s: BankingSector) => number) => newSheets.reduce((s, { sheet }) => s + f(sheet), 0);
    // G3a: the region's view of one dealer book — every named desk's position, summed by name.
    const deskView = (book: string) =>
      Array.from(regionalDeskView(newSheets.map(({ sheet }) => sheet.dealerDeskInventory), book).entries())
        .filter(([, usd]) => Math.abs(usd) > 1);
    const totalAssets = sumField((s) => loanBooksOf(s) + s.sovereignBondHoldingsUSD + s.cashReservesUSD);
    const weightedAvg = (f: (s: BankingSector) => number) =>
      totalAssets > 0
        ? newSheets.reduce((s, { sheet }) => s + f(sheet) * (loanBooksOf(sheet) + sheet.sovereignBondHoldingsUSD + sheet.cashReservesUSD), 0) / totalAssets
        : (newSheets.reduce((s, { sheet }) => s + f(sheet), 0) / Math.max(1, newSheets.length));

    // §7.241: `satisfies` over Required<BankingSector> makes this rebuild EXHAUSTIVE — the old
    // literal silently dropped nine optional fields (every `?? 0` reader of the aggregate then
    // saw zero), and every future optional field would silently not aggregate. Now a new
    // BankingSector field fails to compile here until it is summed, averaged, or explicitly
    // declared per-bank-only.
    reg.bankingSector = {
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
        ...deskView('sovereign bond').map(([instrumentId, inventoryUSD]) => ({ tenorKey: govBucketKeyOf(instrumentId, regionId) ?? instrumentId, inventoryUSD })),
        ...deskView('bill').map(([instrumentId, inventoryUSD]) => ({ tenorKey: govBucketKeyOf(instrumentId, regionId) ?? instrumentId, inventoryUSD })),
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
      centralBankLoanUSD: sumField((s) => s.centralBankLoanUSD ?? 0),
      clientMarginUSD: sumField((s) => s.clientMarginUSD ?? 0),
      corporateDepositsUSD: sumField((s) => s.corporateDepositsUSD ?? 0),
      institutionalDepositsUSD: sumField((s) => s.institutionalDepositsUSD ?? 0),
      smeDepositsUSD: sumField((s) => s.smeDepositsUSD ?? 0),
      sovereignAccruedCouponUSD: sumField((s) => s.sovereignAccruedCouponUSD ?? 0),
      primeBrokerageLoansUSD: sumField((s) => s.primeBrokerageLoansUSD ?? 0),
      householdDepositInterestWeeklyUSD: sumField((s) => s.householdDepositInterestWeeklyUSD ?? 0),
      lastBillAccretionWeeklyUSD: sumField((s) => s.lastBillAccretionWeeklyUSD ?? 0),
      reservesInterestWeeklyUSD: sumField((s) => s.reservesInterestWeeklyUSD ?? 0),
      corporateDepositInterestWeeklyUSD: sumField((s) => s.corporateDepositInterestWeeklyUSD ?? 0),
      dividendWeeklyUSD: sumField((s) => s.dividendWeeklyUSD ?? 0),
      depositRateAnnual: Number(weightedAvg((s) => s.depositRateAnnual ?? 0).toFixed(6)),
      // Per-bank-only books: a desk position and an FX book belong to the bank that took them; a
      // regional copy would be a second ledger. Declared, not omitted, so the satisfies holds.
      fxDealerBook: undefined,
      dealerDeskInventory: undefined,
    } satisfies { [K in keyof Required<BankingSector>]: BankingSector[K] };

    // HH: what the region's banks actually paid household depositors this week — measured, so
    // household income can read it instead of re-deriving it at `policyRate x 0.6`.
    reg.householdDepositInterestWeeklyUSD = Math.round(newSheets.reduce(
      (a, { sheet }) => a + (sheet.householdDepositInterestWeeklyUSD ?? 0), 0));

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
    const mortgageDebtUSD = Math.round(sumPools('MORTGAGE'));
    const creditCardDebtUSD = Math.round(sumPools('CREDIT_CARD'));
    const otherConsumerLoanDebtUSD = Math.round(sumPools('CONSUMER_TERM'));
    let interestUSD = 0; let servicePrincipalUSD = 0; let mortgageOriginationUSD = 0;
    let mortgageDischargeUSD = 0; let consumerCreditUSD = 0;
    // HSG: a borrower shops, so the region's going mortgage rate is the KEENEST quote it can
    // find. The quotes differ now — each bank prices its own book's measured loss experience at
    // its own cost of equity — which is what makes a credit tightening reach the housing market
    // as a rate rather than as a stated factor.
    let bestMortgageRateAnnual = Number.POSITIVE_INFINITY;
    // Turnover is a property of the REGION's stock, so the banks' readings are weighted by the
    // book each one measured it on.
    let turnoverWeightedUSD = 0;
    let turnoverBookUSD = 0;
    let bookPrincipalUSD = 0;
    householdFlowsByBank.forEach((f) => {
      interestUSD += f.interestUSD;
      servicePrincipalUSD += f.debtServicePrincipalUSD;
      bookPrincipalUSD += f.principalUSD;
      mortgageOriginationUSD += f.mortgageOriginationUSD;
      mortgageDischargeUSD += f.mortgageDischargeUSD;
      consumerCreditUSD += f.consumerCreditOriginationUSD;
      if (f.mortgageRateQuotedAnnual > 0) {
        bestMortgageRateAnnual = Math.min(bestMortgageRateAnnual, f.mortgageRateQuotedAnnual);
      }
      if (f.mortgageBookUSD > 0 && f.turnoverRateAnnual > 0) {
        turnoverWeightedUSD += f.turnoverRateAnnual * f.mortgageBookUSD;
        turnoverBookUSD += f.mortgageBookUSD;
      }
    });
    // HH4d: the household deposit stock IS the banks' summed household-deposit line — one
    // number, reconciled here every week (the balance-sheet stage debits this week's ETF
    // purchases from the view and records them for next week's bank settlement). The diverted
    // savings become a real money-fund share stock on the household book instead of money that
    // vanished from the household view at the yield gate.
    // §5-CLOSE M6: the deposits the household BOOK wrote this week — a loan creates the
    // borrower's deposit, a repayment and the interest destroy it — reported so the money-stock
    // decomposition can count the banks' second creator (the first is the payment ledger).
    reg.householdBookDepositFlowWeeklyUSD = Math.round(
      mortgageOriginationUSD - mortgageDischargeUSD + consumerCreditUSD - bookPrincipalUSD - interestUSD);
    const bankHouseholdDepositsUSD = newSheets.reduce((a, { sheet }) => a + sheet.depositsUSD, 0);
    reg.householdState = {
      ...hs,
      depositsUSD: Math.round(bankHouseholdDepositsUSD),
      mmfSharesUSD: Math.round(((hs.mmfSharesUSD ?? 0) + regionDivertedUSD)),
      mortgageDebtUSD,
      creditCardDebtUSD,
      otherConsumerLoanDebtUSD,
      priorMortgageDebtUSD,
      householdDebtToIncomeRatio: reg.estimatedHouseholdIncomeUSD > 0
        ? Number(((mortgageDebtUSD + creditCardDebtUSD + otherConsumerLoanDebtUSD) / reg.estimatedHouseholdIncomeUSD).toFixed(4))
        : hs.householdDebtToIncomeRatio,
      // Burden is interest plus REQUIRED principal (annuity schedules and card minimums);
      // transactor turnover is consumption already counted, cycled through a card.
      weeklyDebtServiceUSD: Math.round((interestUSD + servicePrincipalUSD)),
      // The household sector's NET deposit credit from housing: buyers' new loans minus the
      // sellers' loans the sale proceeds retired.
      weeklyMortgageOriginationUSD: Math.round((mortgageOriginationUSD - mortgageDischargeUSD)),
      weeklyNewConsumerCreditUSD: Math.round(consumerCreditUSD),
    };
    // The housing-market stat becomes the real number the banks actually wrote this week.
    if (reg.housingMarket) {
      reg.housingMarket.mortgageOriginationVolumeUSD = Math.round(mortgageOriginationUSD);
      if (Number.isFinite(bestMortgageRateAnnual)) {
        reg.housingMarket.bestMortgageRateAnnual = Number(bestMortgageRateAnnual.toFixed(5));
      }
      if (turnoverBookUSD > 0) {
        reg.housingMarket.turnoverRateAnnual = Number((turnoverWeightedUSD / turnoverBookUSD).toFixed(5));
      }
    }
  });
}
