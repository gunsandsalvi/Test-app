/**
 * BANK RESOLUTION: a bank under prompt corrective action is closed at the week's end
 * and its books go whole to the strongest live peer in its region, the same weekend.
 *
 * Why it is its own stage and not a default: a firm that defaults keeps its assets and works
 * them out through an estate over months; a bank that fails is closed on a Friday and open on
 * Monday under another name, deposits intact. Stage 08's default rule (cash out, coverage under
 * the floor) never fires on a bank — its cash is central-bank reserves and its coverage is a
 * margin — so before this stage a bank with no capital left simply kept trading, quoting loans
 * and holding deposits, dead on the books.
 *
 * Runs after the close, on the week's final sheets, with an empty journal — so every leg it
 * posts settles in its own pass and nothing recorded earlier in the week is addressed to a bank
 * that no longer has a sheet. Its legs are payment instructions: cash moves only by a named flow.
 * The plan (domain/bank-resolution.ts) decides who eats the hole; this stage only executes it.
 */

import { GameState, RegionId } from '../../../types';
import { currencyOf } from '../../../domain/geography';
import { BankingSector, DepositLines } from '../../../domain/banking';
import { BANK_MIN_CAPITAL_RATIO } from '../../../domain/bank-pricing';
import {
  assumingCapitalLocal, chooseAssumingBank, isBankUnderPca, planBankResolution, restateBankSheetStatistics, PCA_CAPITAL_RATIO,
} from '../../../domain/bank-resolution';
import { assumeBankBooks } from '../../ledger/bank-transfer';
import { reassignConsignments } from './goods-arrival';
import { DerivativeParty } from '../../../domain/derivatives/contract';
import { isActiveCompany } from '../../../domain/company';
import { partyKey } from '../../ledger/party';
import { dealerDeskParticipantId } from '../../../domain/dealer-desk';
import { getSimulationDate } from '../../formatters';
import { WeeklyStepContext } from './context';
import { derivativesBookOf } from './derivative-lifecycle';
import { pay, runSettlementStage } from './settlement';
import { fieldsOf, residualOf } from '../bank-identity-trace';
import { ladderRowsOf, facilityBookOf } from '../../../engine2/tranches';
import { moveFacilityLender } from '../../ledger/tranche-ledger';
import { businessLoanBookOf, consumerLoanBookOf } from '../../../domain/banking';
import { moveSectorRowsToBank, bankReservesOf, bankDepositLines, heldCurrenciesOf } from '../../ledger/accounts';

const sheetLinesLocal = (s: BankingSector, cashLocal: number, lines: DepositLines, facilityBookLocal: number): number =>
  Math.abs(lines.householdLocal) + Math.abs(lines.corporateLocal) + Math.abs(lines.institutionalLocal)
  + Math.abs(s.clientMarginLocal ?? 0) + Math.abs(lines.smeLocal) + Math.abs(s.centralBankLoanLocal ?? 0)
  + Math.abs(s.bankEquityLocal) + Math.abs(s.srfBorrowingLocal ?? 0) + Math.abs(s.repoBorrowedLocal ?? 0)
  + Math.abs(businessLoanBookOf(s, facilityBookLocal)) + Math.abs(consumerLoanBookOf(s)) + Math.abs(s.sovereignBondHoldingsLocal)
  + Math.abs(cashLocal) + Math.abs(s.repoLentLocal ?? 0) + Math.abs(s.onRrpLendingLocal ?? 0)
  + Math.abs(s.sovereignAccruedCouponLocal ?? 0) + Math.abs(s.primeBrokerageLoansLocal ?? 0);

/** Every link in the world that names the failed bank now names the assuming one. */
export function rekeyBankLinks(state: GameState, ctx: WeeklyStepContext, regionId: RegionId, from: string, to: string): void {
  const rekey = (t: string | undefined) => (t === from ? to : t);
  ctx.updatedCompanies.forEach((c) => { if (c.homeBankTicker === from) c.homeBankTicker = to; });
  ctx.prevActivePrivateFirms.forEach((c) => { if (c.homeBankTicker === from) c.homeBankTicker = to; });
  ctx.updatedInstitutionalEntities.forEach((e) => { if (e.homeBankTicker === from) e.homeBankTicker = to; });
  // Facility tranches carry their lender as an interned ref on the row.
  // A facility moving to the assuming bank is a wire, lender to lender.
  const v2 = ctx.v2;
  ctx.updatedCompanies.concat(ctx.prevActivePrivateFirms).forEach((c) => {
    moveFacilityLender(v2, { id: c.id, ticker: c.ticker, region: c.region }, from, to, 'bank resolution: facilities assumed');
  });
  const reg = ctx.updatedRegions[regionId];
  if (reg?.repoBook) {
    reg.repoBook = reg.repoBook.map((c) => ({
      ...c,
      borrowerTicker: rekey(c.borrowerTicker) as string,
      lender: c.lender.kind === 'BANK' ? { ...c.lender, ticker: rekey(c.lender.ticker) as string } : c.lender,
    }));
  }
  if (reg?.primeBrokerageBook) {
    reg.primeBrokerageBook = reg.primeBrokerageBook.map((l) => ({ ...l, brokerTicker: rekey(l.brokerTicker) as string }));
  }
  ctx.primaryOfferingsWorking = ctx.primaryOfferingsWorking.map((o) => ({ ...o, leadBankTicker: rekey(o.leadBankTicker) as string }));
  // The treasury's accrued-coupon ledger is keyed by holder; the failed bank's accruals are the
  // assuming bank's receivable now (its sheet already carries them).
  const fromKey = `|${partyKey({ kind: 'BANK_SECURITIES', ticker: from })}`;
  const toKey = `|${partyKey({ kind: 'BANK_SECURITIES', ticker: to })}`;
  Array.from(ctx.sovereignAccruedInterestLocal.entries()).forEach(([k, usd]) => {
    if (!k.endsWith(fromKey)) return;
    const k2 = k.slice(0, k.length - fromKey.length) + toKey;
    ctx.sovereignAccruedInterestLocal.set(k2, (ctx.sovereignAccruedInterestLocal.get(k2) ?? 0) + usd);
    ctx.sovereignAccruedInterestLocal.delete(k);
  });
  // THE DESK'S UNPAID COUPONS MOVE WITH ITS INVENTORY. `absorbBankSheet` merges the dealer books
  // into the acquirer, but what that paper has already EARNED and not been paid sits on the
  // register's accrual ledger under the failed bank's own desk id. Left there, the coupon date
  // paid a desk whose bank has no account any more: the settlement store had no row for it and
  // dropped BOTH legs of the payment — the only kind M7 ever named was `payee BANK_SECURITIES`.
  const fromDesk = dealerDeskParticipantId(from);
  const toDesk = dealerDeskParticipantId(to);
  ctx.holderAccruedInterestLocal.forEach((byHolder) => {
    const owedLocal = byHolder.get(fromDesk);
    if (owedLocal === undefined) return;
    byHolder.set(toDesk, (byHolder.get(toDesk) ?? 0) + owedLocal);
    byHolder.delete(fromDesk);
  });
  const rekeyParty = (p: DerivativeParty): DerivativeParty =>
    ('ticker' in p && p.ticker === from) ? { ...p, ticker: to } : p;
  ctx.derivativesBook = derivativesBookOf(ctx, state).map((c) => ({ ...c, a: rekeyParty(c.a), b: rekeyParty(c.b) }));
  // THE DELIVERIES MOVE WITH THE BOOKS. A resolved bank buys goods like any other firm, and its
  // consignments were the one link this function did not re-key: the assuming bank took the
  // business but not the shipments, so what was still on the water named a bank that no longer
  // existed. Every consignment the ownership audit found in transit to a firm that is gone was
  // this — a bank, and always still afloat.
  const idOf = (t: string) => ctx.updatedCompanies.find((c) => c.ticker === t)?.id;
  const fromId = idOf(from), toId = idOf(to);
  if (fromId && toId) reassignConsignments(state, { ticker: from, id: fromId }, { ticker: to, id: toId });
}

export function runBankResolutionStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const liveBanks = () => ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
  // Instrument: BANK_RESOLUTION_FORCE=<ticker>@<week> closes a named bank on a named week, so the
  // mechanism can be exercised on a world where no bank is under PCA. Inert unless set.
  const forced = (process.env.BANK_RESOLUTION_FORCE ?? '').split(',')
    .map((s) => s.split('@')).filter(([t, w]) => t && Number(w) === week).map(([t]) => t);
  const failing = liveBanks().filter((c) => isBankUnderPca(c.bankBalanceSheet!, facilityBookOf(ctx.v2, c.ticker)) || forced.includes(c.ticker))
    .sort((a, b) => a.bankBalanceSheet!.bankEquityLocal - b.bankBalanceSheet!.bankEquityLocal);
  if (failing.length === 0) return;
  const failingIds = new Set(failing.map((c) => c.id));

  failing.forEach((bank) => {
    const regionId = bank.region as RegionId;
    const candidates = liveBanks()
      .filter((c) => c.region === regionId && !failingIds.has(c.id))
      .map((c) => ({ comp: c, sheet: c.bankBalanceSheet!, facilityBookLocal: facilityBookOf(ctx.v2, c.ticker) }));
    const chosen = chooseAssumingBank(candidates, BANK_MIN_CAPITAL_RATIO);
    if (!chosen) {
      // THE LAST BANK STANDING IS RECAPITALISED BY ITS TREASURY. With no peer to
      // assume the books there is nobody to resolve into, and leaving the bank open with no
      // capital is what the first reference did: JPN's last bank sat under PCA from week 37,
      // and by week 59 the region's unemployment was 80%. The real answer is the one
      // every crisis has used — a public capital injection to the working ratio, a fiscal cost
      // that lands in the treasury account like the deposit guarantee does. The shareholders
      // are not diluted here (no share mechanics on a bank's equity yet — recorded), which
      // overstates what they keep; the injection itself is real money.
      const sheet = bank.bankBalanceSheet!;
      const injectionLocal = Math.max(0, assumingCapitalLocal(sheet, facilityBookOf(ctx.v2, bank.ticker)) - sheet.bankEquityLocal);
      if (injectionLocal > 0) {
        pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'BANK', ticker: bank.ticker },
          amount: injectionLocal, currency: currencyOf(regionId), reason: 'resolution: public recapitalisation' });
        runSettlementStage(ctx);
        restateBankSheetStatistics(bank.bankBalanceSheet!, bankReservesOf(ctx.v2, bank.ticker), bankDepositLines(ctx, bank.ticker), facilityBookOf(ctx.v2, bank.ticker));
      }
      console.log(`  [bank-resolution] w${week} ${regionId}:${bank.ticker} under PCA with NO assuming bank — recapitalised by the treasury ${(injectionLocal / 1e9).toFixed(2)}B, ratio now ${bank.bankBalanceSheet!.bankCapitalRatio}`);
      ctx.newsItems.push({
        id: `bank-recap-${bank.ticker}-${week}`, week,
        title: `${bank.name} recapitalised by the treasury`,
        description: `${bank.ticker} fell below the ${(100 * PCA_CAPITAL_RATIO).toFixed(0)}% capital floor with no bank left to assume it; the ${regionId} treasury injected ${(injectionLocal / 1e9).toFixed(2)}B to bring it back to a working ratio.`,
        category: 'CREDIT', impactBadge: '[BANK RECAPITALISED]', impactRegion: regionId, impactSector: bank.sector, affectedTicker: bank.ticker, urgent: true,
      });
      return;
    }
    const acquirer = chosen.comp;
    const ladderLocal = ladderRowsOf(ctx.v2, bank.id).reduce((a, r) => a + ctx.v2.tranches.principalLocal[r], 0);
    const cashLocal = bankReservesOf(ctx.v2, bank.ticker);
    const failingFacilityBookLocal = facilityBookOf(ctx.v2, bank.ticker);
    const plan = planBankResolution(bank.bankBalanceSheet!, ladderLocal, assumingCapitalLocal(bank.bankBalanceSheet!, failingFacilityBookLocal), cashLocal, bankDepositLines(ctx, bank.ticker), failingFacilityBookLocal);
    const traceOn = process.env.BANK_RESOLUTION_TRACE === '1';
    const traceSheet = (label: string, c: typeof bank) => {
      if (!traceOn || !c.bankBalanceSheet) return;
      const f = fieldsOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.ticker), bankDepositLines(ctx, c.ticker), facilityBookOf(ctx.v2, c.ticker));
      console.log(`  [res-trace] ${label} ${c.ticker} resid ${(residualOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.ticker), bankDepositLines(ctx, c.ticker), facilityBookOf(ctx.v2, c.ticker)) / 1e6).toFixed(3)}M :: `
        + Object.entries(f).map(([k, v]) => `${k} ${(v / 1e9).toFixed(3)}B`).join(' | '));
    };
    traceSheet('before', bank); traceSheet('before', acquirer);

    // ---- 1. Every non-cash line moves (the ledger's transfer); the target keeps only its cash. ----
    assumeBankBooks(acquirer.bankBalanceSheet!, bank.bankBalanceSheet!, plan, cashLocal);
    moveSectorRowsToBank(ctx.v2, bank.ticker, acquirer.ticker); // the sector parties' rows at the failed bank move with its SME line
    traceSheet('assumed', bank); traceSheet('assumed', acquirer);

    // ---- 2. The cash leg, the guarantee, and the world's links. ----
    // §3.13c-FX: MONEY BY MONEY. A failed bank holds whatever currencies its desk sold and its
    // clients left it, and the acquirer assumes the POSITION, not its value netted into one
    // currency — paying only the home-money total left the foreign rows on the shell and the
    // guard found 16.7M still on QYTV in week 12. These legs sum to exactly `cashLocal` at this
    // pass's rates, which is what `assumeBankBooks` above struck the shell's equity on, so the
    // shell nets to zero; sweeping AFTER the week's other legs instead breaks that equality and
    // leaves the difference as equity (measured: 134.8M on DOIE).
    heldCurrenciesOf(ctx.v2, { kind: 'BANK', ticker: bank.ticker }).forEach(({ currency, balance }) => {
      if (balance > 1e-6) {
        pay(ctx, { payer: { kind: 'BANK', ticker: bank.ticker }, payee: { kind: 'BANK', ticker: acquirer.ticker },
          amount: balance, currency, reason: 'resolution: reserves to the assuming bank' });
      } else if (balance < -1e-6) {
        // An overdrawn failed bank: the assuming bank makes the reserve account whole — part of
        // the net it took over, already in the equity line above.
        pay(ctx, { payer: { kind: 'BANK', ticker: acquirer.ticker }, payee: { kind: 'BANK', ticker: bank.ticker },
          amount: -balance, currency, reason: 'resolution: overdrawn reserves made whole' });
      }
    });
    if (plan.guaranteeLocal > 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'BANK', ticker: acquirer.ticker },
        amount: plan.guaranteeLocal, currency: currencyOf(regionId), reason: 'resolution: deposit guarantee on the hole' });
    }
    rekeyBankLinks(state, ctx, regionId, bank.ticker, acquirer.ticker);
    // Premises and people go with the books: the branches open on Monday under the new name.
    acquirer.grossPPELocal = (acquirer.grossPPELocal ?? 0) + (bank.grossPPELocal ?? 0);
    acquirer.accumulatedDepreciationLocal = (acquirer.accumulatedDepreciationLocal ?? 0) + (bank.accumulatedDepreciationLocal ?? 0);
    acquirer.employeeCount += bank.employeeCount;
    acquirer.annualRevenue += bank.annualRevenue;
    acquirer.bankMarketShare = Number(((acquirer.bankMarketShare ?? 0) + (bank.bankMarketShare ?? 0)).toFixed(6));
    bank.grossPPELocal = 0; bank.accumulatedDepreciationLocal = 0; bank.employeeCount = 0;
    bank.annualRevenue = 0; bank.ebitda = 0; bank.ebit = 0; bank.bankMarketShare = 0;

    // ---- 3. Settle the reserve legs while both sheets still exist, then verify the shell is empty. ----
    runSettlementStage(ctx);
    // Settlement rebuilds a bank's sheet as a new object; the handles above are last week's.
    const F = bank.bankBalanceSheet!;
    traceSheet('settled', bank); traceSheet('settled', acquirer);
    const leftLocal = sheetLinesLocal(F, bankReservesOf(ctx.v2, bank.ticker), bankDepositLines(ctx, bank.ticker), facilityBookOf(ctx.v2, bank.ticker));
    if (leftLocal > 1e4) {
      const lines = Object.entries(F as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && Math.abs(v as number) > 1e4)
        .map(([k, v]) => `${k} ${((v as number) / 1e6).toFixed(3)}M`).join(', ');
      throw new Error(`ENGINE DEFECT: ${bank.ticker} resolved with ${(leftLocal / 1e6).toFixed(3)}M still on its sheet — a line the transfer did not name: ${lines}`);
    }

    // ---- 4. The shell: a defaulted issuer banking at its acquirer, so its register claims (its
    // own ladder, its equity) go through the one estate machinery next week, paid from whatever
    // the assuming bank owed it for the net. ----
    bank.bankBalanceSheet = undefined;
    bank.homeBankTicker = acquirer.ticker;
    // The shell has no company account yet; the first pass opens one at zero at its acquirer.
    bank.isDefaulted = true;
    bank.defaultedWeek = week;
    bank.bankResolvedWeek = week;
    bank.creditRating = 'D';
    bank.stockPrice = 0;
    ctx.defaultedTickers.push(bank.ticker);
    if (plan.estateLocal > 0) {
      pay(ctx, { payer: { kind: 'BANK', ticker: acquirer.ticker }, payee: { kind: 'COMPANY', ticker: bank.ticker },
        amount: plan.estateLocal, currency: currencyOf(regionId), reason: 'resolution: net book value paid to the receivership' });
      runSettlementStage(ctx);
    }
    restateBankSheetStatistics(acquirer.bankBalanceSheet!, bankReservesOf(ctx.v2, acquirer.ticker), bankDepositLines(ctx, acquirer.ticker), facilityBookOf(ctx.v2, acquirer.ticker));

    const gb = (v: number) => `${(v / 1e9).toFixed(2)}B`;
    console.log(`  [bank-resolution] w${week} ${regionId}:${bank.ticker} -> ${acquirer.ticker}`
      + ` | net ${gb(plan.netBookLocal)} capital ${gb(plan.acquirerCapitalLocal)} cb-loan ${gb(plan.centralBankLoanAssumedLocal)}`
      + ` ladder-bailed-in ${gb(plan.ladderBailedInLocal)} guarantee ${gb(plan.guaranteeLocal)} estate ${gb(plan.estateLocal)}`
      + ` | acquirer ratio ${acquirer.bankBalanceSheet!.bankCapitalRatio}`);
    ctx.newsItems.push({
      id: `bank-resolution-${bank.ticker}-${week}`,
      week,
      title: `${bank.name} closed by the supervisor; ${acquirer.name} assumes its deposits`,
      description: `${bank.ticker} fell below the ${(100 * PCA_CAPITAL_RATIO).toFixed(0)}% capital floor and was resolved: `
        + `${acquirer.ticker} takes its books, every deposit and the ${gb(plan.centralBankLoanAssumedLocal)} owed to the central bank, capitalised at ${gb(plan.acquirerCapitalLocal)}`
        + (plan.ladderBailedInLocal > 0 ? `; its own ${gb(plan.ladderBailedInLocal)} of bonds stay behind for the receivership` : '')
        + (plan.guaranteeLocal > 0 ? `; the treasury covers ${gb(plan.guaranteeLocal)} under the deposit guarantee` : '')
        + (plan.estateLocal > 0 ? `; ${gb(plan.estateLocal)} goes to the receivership for its bondholders and shareholders` : '')
        + '.',
      category: 'CREDIT',
      impactBadge: '[BANK RESOLVED]',
      impactRegion: regionId,
      impactSector: bank.sector,
      affectedTicker: acquirer.ticker,
      urgent: true,
    });
    ctx.diagnosticLogs.push({
      week,
      timestamp: getSimulationDate(week).toISOString(),
      category: 'CREDIT',
      message: `Bank resolved: ${bank.name} -> ${acquirer.name}`,
      deltaText: '',
      data: { failed: bank.ticker, assuming: acquirer.ticker, ...plan },
    });
  });
}
