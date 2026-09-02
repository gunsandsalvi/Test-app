/**
 * §7.339 — BANK RESOLUTION: a bank under prompt corrective action is closed at the week's end
 * and its books go whole to the strongest live peer in its region, the same weekend.
 *
 * Why it is its own stage and not a default: a firm that defaults keeps its assets and works
 * them out through an estate over months; a bank that fails is closed on a Friday and open on
 * Monday under another name, deposits intact. Stage 08's default rule (cash out, coverage under
 * the floor) never fires on a bank — its cash is central-bank reserves and its coverage is a
 * margin — so before this stage a bank with no capital left simply kept trading, quoting loans
 * and holding deposits, dead on the books (§7.291/§7.301: UK NIM 27x from exactly this).
 *
 * Runs after the close, on the week's final sheets, with an empty journal — so every leg it
 * posts settles in its own pass and nothing recorded earlier in the week is addressed to a bank
 * that no longer has a sheet. Its legs are payment instructions: cash moves only by a named flow.
 * The plan (domain/bank-resolution.ts) decides who eats the hole; this stage only executes it.
 */

import { GameState, RegionId } from '../../../types';
import { BankingSector, DepositLines } from '../../../domain/banking';
import { BANK_MIN_CAPITAL_RATIO } from '../../../domain/bank-pricing';
import {
  assumingCapitalUSD, chooseAssumingBank, isBankUnderPca, planBankResolution, restateBankSheetStatistics, PCA_CAPITAL_RATIO,
} from '../../../domain/bank-resolution';
import { assumeBankBooks } from '../../ledger/bank-transfer';
import { DerivativeParty } from '../../../domain/derivatives/contract';
import { isActiveCompany } from '../../../domain/company';
import { partyKey } from '../../ledger/party';
import { getSimulationDate } from '../../formatters';
import { WeeklyStepContext } from './context';
import { derivativesBookOf } from './derivative-lifecycle';
import { pay, runSettlementStage } from './settlement';
import { fieldsOf, residualOf } from '../bank-identity-trace';
import { ladderRowsOf } from '../../../engine2/tranches';
import { moveFacilityLender } from '../../ledger/tranche-ledger';
import { businessLoanBookOf, consumerLoanBookOf } from '../../../domain/banking';
import { resetAccount, moveSectorRowsToBank, bankReservesOf, bankDepositLines } from '../../ledger/accounts';

const sheetLinesUSD = (s: BankingSector, cashUSD: number, lines: DepositLines): number =>
  Math.abs(lines.householdUSD) + Math.abs(lines.corporateUSD) + Math.abs(lines.institutionalUSD)
  + Math.abs(s.clientMarginUSD ?? 0) + Math.abs(lines.smeUSD) + Math.abs(s.centralBankLoanUSD ?? 0)
  + Math.abs(s.bankEquityUSD) + Math.abs(s.srfBorrowingUSD ?? 0) + Math.abs(s.repoBorrowedUSD ?? 0)
  + Math.abs(businessLoanBookOf(s)) + Math.abs(consumerLoanBookOf(s)) + Math.abs(s.sovereignBondHoldingsUSD)
  + Math.abs(cashUSD) + Math.abs(s.repoLentUSD ?? 0) + Math.abs(s.onRrpLendingUSD ?? 0)
  + Math.abs(s.sovereignAccruedCouponUSD ?? 0) + Math.abs(s.primeBrokerageLoansUSD ?? 0);

/** Every link in the world that names the failed bank now names the assuming one. */
export function rekeyBankLinks(state: GameState, ctx: WeeklyStepContext, regionId: RegionId, from: string, to: string): void {
  const rekey = (t: string | undefined) => (t === from ? to : t);
  ctx.updatedCompanies.forEach((c) => { if (c.homeBankTicker === from) c.homeBankTicker = to; });
  ctx.prevActivePrivateFirms.forEach((c) => { if (c.homeBankTicker === from) c.homeBankTicker = to; });
  ctx.updatedInstitutionalEntities.forEach((e) => { if (e.homeBankTicker === from) e.homeBankTicker = to; });
  // Facility tranches carry their lender as an interned ref on the row.
  // §5-WIRES W3: a facility moving to the assuming bank is a wire, lender to lender.
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
  Array.from(ctx.sovereignAccruedInterestUSD.entries()).forEach(([k, usd]) => {
    if (!k.endsWith(fromKey)) return;
    const k2 = k.slice(0, k.length - fromKey.length) + toKey;
    ctx.sovereignAccruedInterestUSD.set(k2, (ctx.sovereignAccruedInterestUSD.get(k2) ?? 0) + usd);
    ctx.sovereignAccruedInterestUSD.delete(k);
  });
  const rekeyParty = (p: DerivativeParty): DerivativeParty =>
    ('ticker' in p && p.ticker === from) ? { ...p, ticker: to } : p;
  ctx.derivativesBook = derivativesBookOf(ctx, state).map((c) => ({ ...c, a: rekeyParty(c.a), b: rekeyParty(c.b) }));
}

export function runBankResolutionStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const liveBanks = () => ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
  // Instrument: BANK_RESOLUTION_FORCE=<ticker>@<week> closes a named bank on a named week, so the
  // mechanism can be exercised on a world where no bank is under PCA. Inert unless set.
  const forced = (process.env.BANK_RESOLUTION_FORCE ?? '').split(',')
    .map((s) => s.split('@')).filter(([t, w]) => t && Number(w) === week).map(([t]) => t);
  const failing = liveBanks().filter((c) => isBankUnderPca(c.bankBalanceSheet!) || forced.includes(c.ticker))
    .sort((a, b) => a.bankBalanceSheet!.bankEquityUSD - b.bankBalanceSheet!.bankEquityUSD);
  if (failing.length === 0) return;
  const failingIds = new Set(failing.map((c) => c.id));

  failing.forEach((bank) => {
    const regionId = bank.region as RegionId;
    const candidates = liveBanks()
      .filter((c) => c.region === regionId && !failingIds.has(c.id))
      .map((c) => ({ comp: c, sheet: c.bankBalanceSheet! }));
    const chosen = chooseAssumingBank(candidates, BANK_MIN_CAPITAL_RATIO);
    if (!chosen) {
      // §7.342 — THE LAST BANK STANDING IS RECAPITALISED BY ITS TREASURY. With no peer to
      // assume the books there is nobody to resolve into, and leaving the bank open with no
      // capital is what the first reference did: JPN's last bank sat under PCA from week 37,
      // and by week 59 the region's unemployment was 80% (§7.342). The real answer is the one
      // every crisis has used — a public capital injection to the working ratio, a fiscal cost
      // that lands in the treasury account like the deposit guarantee does. The shareholders
      // are not diluted here (no share mechanics on a bank's equity yet — recorded), which
      // overstates what they keep; the injection itself is real money.
      const sheet = bank.bankBalanceSheet!;
      const injectionUSD = Math.max(0, assumingCapitalUSD(sheet) - sheet.bankEquityUSD);
      if (injectionUSD > 0) {
        pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'BANK', ticker: bank.ticker },
          amountUSD: injectionUSD, reason: 'resolution: public recapitalisation' });
        runSettlementStage(ctx);
        restateBankSheetStatistics(bank.bankBalanceSheet!, bankReservesOf(ctx.v2, bank.ticker), bankDepositLines(ctx, bank.ticker));
      }
      console.log(`  [bank-resolution] w${week} ${regionId}:${bank.ticker} under PCA with NO assuming bank — recapitalised by the treasury ${(injectionUSD / 1e9).toFixed(2)}B, ratio now ${bank.bankBalanceSheet!.bankCapitalRatio}`);
      ctx.newsItems.push({
        id: `bank-recap-${bank.ticker}-${week}`, week,
        title: `${bank.name} recapitalised by the treasury`,
        description: `${bank.ticker} fell below the ${(100 * PCA_CAPITAL_RATIO).toFixed(0)}% capital floor with no bank left to assume it; the ${regionId} treasury injected ${(injectionUSD / 1e9).toFixed(2)}B to bring it back to a working ratio.`,
        category: 'CREDIT', impactBadge: '[BANK RECAPITALISED]', impactRegion: regionId, impactSector: bank.sector, affectedTicker: bank.ticker, urgent: true,
      });
      return;
    }
    const acquirer = chosen.comp;
    const ladderUSD = ladderRowsOf(ctx.v2, bank.id).reduce((a, r) => a + ctx.v2.tranches.principalUSD[r], 0);
    const cashUSD = bankReservesOf(ctx.v2, bank.ticker);
    const plan = planBankResolution(bank.bankBalanceSheet!, ladderUSD, assumingCapitalUSD(bank.bankBalanceSheet!), cashUSD, bankDepositLines(ctx, bank.ticker));
    const traceOn = process.env.BANK_RESOLUTION_TRACE === '1';
    const traceSheet = (label: string, c: typeof bank) => {
      if (!traceOn || !c.bankBalanceSheet) return;
      const f = fieldsOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.ticker), bankDepositLines(ctx, c.ticker));
      console.log(`  [res-trace] ${label} ${c.ticker} resid ${(residualOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.ticker), bankDepositLines(ctx, c.ticker)) / 1e6).toFixed(3)}M :: `
        + Object.entries(f).map(([k, v]) => `${k} ${(v / 1e9).toFixed(3)}B`).join(' | '));
    };
    traceSheet('before', bank); traceSheet('before', acquirer);

    // ---- 1. Every non-cash line moves (the ledger's transfer); the target keeps only its cash. ----
    assumeBankBooks(acquirer.bankBalanceSheet!, bank.bankBalanceSheet!, plan, cashUSD);
    moveSectorRowsToBank(ctx.v2, bank.ticker, acquirer.ticker); // A3.3: the sector parties' rows at the failed bank move with its SME line
    traceSheet('assumed', bank); traceSheet('assumed', acquirer);

    // ---- 2. The cash leg, the guarantee, and the world's links. ----
    if (cashUSD > 0) {
      pay(ctx, { payer: { kind: 'BANK', ticker: bank.ticker }, payee: { kind: 'BANK', ticker: acquirer.ticker },
        amountUSD: cashUSD, reason: 'resolution: reserves to the assuming bank' });
    } else if (cashUSD < 0) {
      // An overdrawn failed bank: the assuming bank makes the reserve account whole — part of the
      // net it took over, already in the equity line above.
      pay(ctx, { payer: { kind: 'BANK', ticker: acquirer.ticker }, payee: { kind: 'BANK', ticker: bank.ticker },
        amountUSD: -cashUSD, reason: 'resolution: overdrawn reserves made whole' });
    }
    if (plan.guaranteeUSD > 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'BANK', ticker: acquirer.ticker },
        amountUSD: plan.guaranteeUSD, reason: 'resolution: deposit guarantee on the hole' });
    }
    rekeyBankLinks(state, ctx, regionId, bank.ticker, acquirer.ticker);
    // Premises and people go with the books: the branches open on Monday under the new name.
    acquirer.grossPPEUSD = (acquirer.grossPPEUSD ?? 0) + (bank.grossPPEUSD ?? 0);
    acquirer.accumulatedDepreciationUSD = (acquirer.accumulatedDepreciationUSD ?? 0) + (bank.accumulatedDepreciationUSD ?? 0);
    acquirer.employeeCount += bank.employeeCount;
    acquirer.annualRevenue += bank.annualRevenue;
    acquirer.bankMarketShare = Number(((acquirer.bankMarketShare ?? 0) + (bank.bankMarketShare ?? 0)).toFixed(6));
    bank.grossPPEUSD = 0; bank.accumulatedDepreciationUSD = 0; bank.employeeCount = 0;
    bank.annualRevenue = 0; bank.ebitda = 0; bank.ebit = 0; bank.bankMarketShare = 0;

    // ---- 3. Settle the reserve legs while both sheets still exist, then verify the shell is empty. ----
    runSettlementStage(ctx);
    // Settlement rebuilds a bank's sheet as a new object; the handles above are last week's.
    const F = bank.bankBalanceSheet!;
    traceSheet('settled', bank); traceSheet('settled', acquirer);
    const leftUSD = sheetLinesUSD(F, bankReservesOf(ctx.v2, bank.ticker), bankDepositLines(ctx, bank.ticker));
    if (leftUSD > 1e4) {
      const lines = Object.entries(F as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && Math.abs(v as number) > 1e4)
        .map(([k, v]) => `${k} ${((v as number) / 1e6).toFixed(3)}M`).join(', ');
      throw new Error(`ENGINE DEFECT: ${bank.ticker} resolved with ${(leftUSD / 1e6).toFixed(3)}M still on its sheet — a line the transfer did not name: ${lines}`);
    }

    // ---- 4. The shell: a defaulted issuer banking at its acquirer, so its register claims (its
    // own ladder, its equity) go through the one estate machinery next week, paid from whatever
    // the assuming bank owed it for the net. ----
    bank.bankBalanceSheet = undefined;
    bank.homeBankTicker = acquirer.ticker;
    // A3.1's transitional line: the shell's company row (the seed's number, never money) opens its estate at zero.
    resetAccount(ctx.v2, { kind: 'COMPANY', ticker: bank.ticker }, 0);
    bank.isDefaulted = true;
    bank.defaultedWeek = week;
    bank.bankResolvedWeek = week;
    bank.creditRating = 'D';
    bank.stockPrice = 0;
    ctx.defaultedTickers.push(bank.ticker);
    if (plan.estateUSD > 0) {
      pay(ctx, { payer: { kind: 'BANK', ticker: acquirer.ticker }, payee: { kind: 'COMPANY', ticker: bank.ticker },
        amountUSD: plan.estateUSD, reason: 'resolution: net book value paid to the receivership' });
      runSettlementStage(ctx);
    }
    restateBankSheetStatistics(acquirer.bankBalanceSheet!, bankReservesOf(ctx.v2, acquirer.ticker), bankDepositLines(ctx, acquirer.ticker));

    const gb = (v: number) => `${(v / 1e9).toFixed(2)}B`;
    console.log(`  [bank-resolution] w${week} ${regionId}:${bank.ticker} -> ${acquirer.ticker}`
      + ` | net ${gb(plan.netBookUSD)} capital ${gb(plan.acquirerCapitalUSD)} ladder-stays ${gb(plan.ladderStaysUSD)}`
      + ` haircut ${gb(plan.wholesaleHaircutUSD)} guarantee ${gb(plan.guaranteeUSD)} estate ${gb(plan.estateUSD)}`
      + ` | acquirer ratio ${acquirer.bankBalanceSheet!.bankCapitalRatio}`);
    ctx.newsItems.push({
      id: `bank-resolution-${bank.ticker}-${week}`,
      week,
      title: `${bank.name} closed by the supervisor; ${acquirer.name} assumes its deposits`,
      description: `${bank.ticker} fell below the ${(100 * PCA_CAPITAL_RATIO).toFixed(0)}% capital floor and was resolved: `
        + `${acquirer.ticker} takes its books and every deposit, capitalised at ${gb(plan.acquirerCapitalUSD)}. Wholesale lenders lose ${gb(plan.wholesaleHaircutUSD)}`
        + (plan.guaranteeUSD > 0 ? `; the treasury covers ${gb(plan.guaranteeUSD)} under the deposit guarantee` : '')
        + (plan.estateUSD > 0 ? `; ${gb(plan.estateUSD)} goes to the receivership for its bondholders and shareholders` : '')
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
