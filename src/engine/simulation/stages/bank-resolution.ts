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

import { reseatSwapLines } from './swap-lines';
import { reseatCentralBankLoans } from './central-bank-loans';
import { GameState, RegionId, Company } from '../../../types';
import { bankSovereignBookLocal } from '../../sovereign-register';
import { bankBookAssetsLocal, deskGrossLocal } from '../../desk-register';
import { bankParty, bankSecuritiesParty, companyParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { BankingSector, DepositLines, swapLineDrawnLocal } from '../../../domain/banking';
import { BANK_MIN_CAPITAL_RATIO } from '../../../domain/bank-pricing';
import { assumingCapitalLocal, chooseAssumingBank, isBankUnderPca, isBankIlliquid, planBankResolution, restateBankSheetStatistics, PCA_CAPITAL_RATIO } from '../../../domain/bank-resolution';
import { assumeBankBooks } from '../../ledger/bank-transfer';
import { reassignConsignments } from './goods-arrival';
import { DerivativeParty } from '../../../domain/derivatives/contract';
import { banksOf } from '../../../domain/company';
import { dateOfWeek } from '../../../domain/calendar';
import { WeeklyStepContext } from './context';
import { bankAtHouseLocal, novateDerivatives, publishRepoBook, repoBookOf, primeBrokerageBookOf, publishPrimeBrokerageBook } from '../../ledger/contract-ledger';
import { pay, runSettlementStage, pendingSettlementLocal } from './settlement';
import { fieldsOf, residualOf } from '../bank-identity-trace';
import { ladderRowsOf, facilityBookOf } from '../../../engine2/tranches';
import { moveFacilityLender } from '../../ledger/tranche-ledger';
import { businessLoanBookOf, consumerLoanBookOf } from '../../../domain/banking';
import { moveSectorRowsToBank, bankReservesOf, bankDepositLines, heldCurrenciesOf } from '../../ledger/accounts';
import type { Ticker, EntityId } from '../../../domain/ids';

const sheetLinesLocal = (s: BankingSector, cashLocal: number, lines: DepositLines, facilityBookLocal: number, sovLocal: number, marginAtHouseLocal: number, swapLineLocal: number): number =>
  Math.abs(lines.householdLocal) + Math.abs(lines.corporateLocal) + Math.abs(lines.institutionalLocal)
  + Math.abs(lines.ccpLocal) + Math.abs(lines.smeLocal) + Math.abs(s.centralBankLoanLocal ?? 0)
  + Math.abs(s.bankEquityLocal) + Math.abs(s.srfBorrowingLocal ?? 0) + Math.abs(s.repoBorrowedLocal ?? 0)
  + Math.abs(businessLoanBookOf(s, facilityBookLocal)) + Math.abs(consumerLoanBookOf(s)) + Math.abs(sovLocal)
  + Math.abs(cashLocal) + Math.abs(s.repoLentLocal ?? 0) + Math.abs(s.onRrpLendingLocal ?? 0)
  + Math.abs(s.sovereignAccruedCouponLocal ?? 0) + Math.abs(s.primeBrokerageLoansLocal ?? 0) + Math.abs(marginAtHouseLocal) + Math.abs(swapLineLocal);

/**
 * Every link in the world that names the failed bank now names the assuming one.
 *
 * §3.13-BOOK (c-then-3b): it takes the two BANKS rather than two tickers, because the links are
 * no longer all in one id space — `homeBankId` and `leadBankId` name the bank by its ENTITY id
 * while `brokerId` and the party keys still name it by ticker. Handing it the firms rather
 * than one of their names is what lets each link be rekeyed in the space it is actually in, and
 * it is why this function did not silently miss half of them.
 */
export function rekeyBankLinks(
  state: GameState, ctx: WeeklyStepContext, regionId: RegionId,
  fromBank: { id: EntityId; ticker: Ticker }, toBank: { id: EntityId; ticker: Ticker },
): void {
  const from = fromBank.ticker, to = toBank.ticker;
  const rekeyId = (i: EntityId | undefined) => (i === fromBank.id ? toBank.id : i);
  ctx.updatedCompanies.forEach((c) => { c.homeBankId = rekeyId(c.homeBankId); });
  ctx.prevActivePrivateFirms.forEach((c) => { c.homeBankId = rekeyId(c.homeBankId); });
  ctx.updatedInstitutionalEntities.forEach((e) => { e.homeBankId = rekeyId(e.homeBankId); });
  // Facility tranches carry their lender as an interned ref on the row.
  // A facility moving to the assuming bank is a wire, lender to lender.
  const v2 = ctx.v2;
  ctx.updatedCompanies.concat(ctx.prevActivePrivateFirms).forEach((c) => {
    moveFacilityLender(v2, { id: c.id, ticker: c.ticker, region: c.region }, fromBank.id, toBank.id, 'bank resolution: facilities assumed');
  });
  // §3.13-BOOK d4b: the novated books go back through the contract ledger's door.
  publishRepoBook(ctx.v2, regionId, repoBookOf(ctx.v2, regionId).map((c) => ({
    ...c,
    borrowerId: rekeyId(c.borrowerId) ?? c.borrowerId,
    lender: c.lender.kind === 'BANK' ? { ...c.lender, id: rekeyId(c.lender.id) ?? c.lender.id } : c.lender,
  })));
  publishPrimeBrokerageBook(ctx.v2, regionId, primeBrokerageBookOf(ctx.v2, regionId).map((l) => ({ ...l, brokerId: rekeyId(l.brokerId) ?? l.brokerId })));
  // §3.20-LLR-a: the window's loans to the resolved bank are assumed by the acquirer — rows re-seat.
  reseatCentralBankLoans(ctx, regionId, fromBank.id, toBank.id);
  // §3.20-LLR-b: and its swap-line draws.
  reseatSwapLines(ctx, regionId, fromBank.id, toBank.id);
  ctx.primaryOfferingsWorking = ctx.primaryOfferingsWorking.map((o) => ({ ...o, leadBankId: rekeyId(o.leadBankId) ?? o.leadBankId }));
  // §3.13-BOOK f4b: the failed bank's sovereign accruals are on its rows and moved with them when
  // `absorbBankSheet` transferred its book — nothing to re-key here.
  // §3.13-BOOK f4a: the desk's unpaid coupons are on its rows and moved with them when
  // `absorbBankSheet` transferred the inventory — nothing to re-key here.
  // §3.13-BOOK (c-then-3b): a contract's counterparty is `CounterpartyRef` — every arm an
  // entity id — so the whole book rekeys on one field rather than on whichever name an arm had.
  const rekeyParty = (p: DerivativeParty): DerivativeParty =>
    (p.id === fromBank.id ? { ...p, id: toBank.id } : p);
  novateDerivatives(ctx, rekeyParty);
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
  const liveBanks = () => banksOf(ctx.updatedCompanies);
  // Instrument: BANK_RESOLUTION_FORCE=<ticker>@<week> closes a named bank on a named week, so the
  // mechanism can be exercised on a world where no bank is under PCA. Inert unless set.
  const forced = (process.env.BANK_RESOLUTION_FORCE ?? '').split(',')
    .map((s) => s.split('@')).filter(([t, w]) => t && Number(w) === week).map(([t]) => t);
  // §3.20-LLR-iv: two triggers, distinct — capital (PCA) and liquidity (overdrawn at the central
  // bank after the close's market and window have run, `isBankIlliquid`).
  const reservesAfterMarket = (c: Company): number => bankReservesOf(ctx.v2, c.id) + pendingSettlementLocal(ctx, bankSecuritiesParty(c));
  const triggerOf = new Map<EntityId, 'capital' | 'liquidity'>();
  liveBanks().forEach((c) => {
    if (isBankUnderPca(c.bankBalanceSheet!, facilityBookOf(ctx.v2, c.id)) || forced.includes(c.ticker)) triggerOf.set(c.id, 'capital');
    else if (isBankIlliquid(reservesAfterMarket(c))) triggerOf.set(c.id, 'liquidity');
  });
  const failing = liveBanks().filter((c) => triggerOf.has(c.id))
    .sort((a, b) => a.bankBalanceSheet!.bankEquityLocal - b.bankBalanceSheet!.bankEquityLocal);
  if (failing.length === 0) return;
  const failingIds = new Set(failing.map((c) => c.id));

  failing.forEach((bank) => {
    const regionId = bank.region as RegionId;
    const candidates = liveBanks()
      .filter((c) => c.region === regionId && !failingIds.has(c.id))
      .map((c) => ({ comp: c, sheet: c.bankBalanceSheet!, facilityBookLocal: facilityBookOf(ctx.v2, c.id) }));
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
      const injectionLocal = Math.max(0, assumingCapitalLocal(sheet, facilityBookOf(ctx.v2, bank.id)) - sheet.bankEquityLocal);
      if (injectionLocal > 0) {
        pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: bankParty(bank),
          amount: injectionLocal, currency: currencyOf(regionId), reason: 'resolution: public recapitalisation' });
        runSettlementStage(ctx);
        restateBankSheetStatistics(bank.bankBalanceSheet!, bankReservesOf(ctx.v2, bank.id), bankDepositLines(ctx, bank), facilityBookOf(ctx.v2, bank.id));
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
    const cashLocal = bankReservesOf(ctx.v2, bank.id);
    const failingFacilityBookLocal = facilityBookOf(ctx.v2, bank.id);
    const plan = planBankResolution(bank.bankBalanceSheet!, ladderLocal, assumingCapitalLocal(bank.bankBalanceSheet!, failingFacilityBookLocal), cashLocal, bankDepositLines(ctx, bank), failingFacilityBookLocal, bankBookAssetsLocal(ctx.v2, bank.id), swapLineDrawnLocal(bank.bankBalanceSheet!, currencyOf(bank.region), ctx.fx));
    const traceOn = process.env.BANK_RESOLUTION_TRACE === '1';
    const traceSheet = (label: string, c: typeof bank) => {
      if (!traceOn || !c.bankBalanceSheet) return;
      const f = fieldsOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.id), bankDepositLines(ctx, c), facilityBookOf(ctx.v2, c.id), bankSovereignBookLocal(ctx.v2, c.id), deskGrossLocal(ctx.v2, c.id), bankAtHouseLocal(ctx.v2, c.id), swapLineDrawnLocal(c.bankBalanceSheet, currencyOf(c.region), ctx.fx));
      console.log(`  [res-trace] ${label} ${c.ticker} resid ${(residualOf(c.bankBalanceSheet, bankReservesOf(ctx.v2, c.id), bankDepositLines(ctx, c), facilityBookOf(ctx.v2, c.id), bankSovereignBookLocal(ctx.v2, c.id), deskGrossLocal(ctx.v2, c.id), bankAtHouseLocal(ctx.v2, c.id), swapLineDrawnLocal(c.bankBalanceSheet, currencyOf(c.region), ctx.fx)) / 1e6).toFixed(3)}M :: `
        + Object.entries(f).map(([k, v]) => `${k} ${(v / 1e9).toFixed(3)}B`).join(' | '));
    };
    traceSheet('before', bank); traceSheet('before', acquirer);

    // ---- 1. Every non-cash line moves (the ledger's transfer); the target keeps only its cash. ----
    assumeBankBooks(ctx.v2, acquirer.id, bank.id, acquirer.bankBalanceSheet!, bank.bankBalanceSheet!, plan, cashLocal);
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
    heldCurrenciesOf(ctx.v2, bankParty(bank)).forEach(({ currency, balance }) => {
      if (balance > 1e-6) {
        pay(ctx, { payer: bankParty(bank), payee: bankParty(acquirer),
          amount: balance, currency, reason: 'resolution: reserves to the assuming bank' });
      } else if (balance < -1e-6) {
        // An overdrawn failed bank: the assuming bank makes the reserve account whole — part of
        // the net it took over, already in the equity line above.
        pay(ctx, { payer: bankParty(acquirer), payee: bankParty(bank),
          amount: -balance, currency, reason: 'resolution: overdrawn reserves made whole' });
      }
    });
    if (plan.guaranteeLocal > 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: bankParty(acquirer),
        amount: plan.guaranteeLocal, currency: currencyOf(regionId), reason: 'resolution: deposit guarantee on the hole' });
    }
    rekeyBankLinks(state, ctx, regionId, bank, acquirer);
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
    const leftLocal = sheetLinesLocal(F, bankReservesOf(ctx.v2, bank.id), bankDepositLines(ctx, bank), facilityBookOf(ctx.v2, bank.id), bankSovereignBookLocal(ctx.v2, bank.id), bankAtHouseLocal(ctx.v2, bank.id), swapLineDrawnLocal(F, currencyOf(bank.region), ctx.fx));
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
    bank.homeBankId = acquirer.id;
    // The shell has no company account yet; the first pass opens one at zero at its acquirer.
    bank.isDefaulted = true;
    bank.defaultedWeek = week;
    bank.bankResolvedWeek = week;
    bank.creditRating = 'D';
    bank.stockPrice = 0;
    ctx.defaultedTickers.push(bank.ticker);
    if (plan.estateLocal > 0) {
      pay(ctx, { payer: bankParty(acquirer), payee: companyParty(bank),
        amount: plan.estateLocal, currency: currencyOf(regionId), reason: 'resolution: net book value paid to the receivership' });
      runSettlementStage(ctx);
    }
    restateBankSheetStatistics(acquirer.bankBalanceSheet!, bankReservesOf(ctx.v2, acquirer.id), bankDepositLines(ctx, acquirer), facilityBookOf(ctx.v2, acquirer.id));

    const gb = (v: number) => `${(v / 1e9).toFixed(2)}B`;
    console.log(`  [bank-resolution] w${week} ${regionId}:${bank.ticker} -> ${acquirer.ticker}`
      + ` | net ${gb(plan.netBookLocal)} capital ${gb(plan.acquirerCapitalLocal)} cb-loan ${gb(plan.centralBankLoanAssumedLocal)}`
      + ` ladder-bailed-in ${gb(plan.ladderBailedInLocal)} guarantee ${gb(plan.guaranteeLocal)} estate ${gb(plan.estateLocal)}`
      + ` | acquirer ratio ${acquirer.bankBalanceSheet!.bankCapitalRatio}`);
    ctx.newsItems.push({
      id: `bank-resolution-${bank.ticker}-${week}`,
      week,
      title: `${bank.name} closed by the supervisor; ${acquirer.name} assumes its deposits`,
      description: (triggerOf.get(bank.id) === 'liquidity'
        ? `${bank.ticker} ended the week overdrawn at the central bank after the market and the window had run — it could not pay — and was resolved: `
        : `${bank.ticker} fell below the ${(100 * PCA_CAPITAL_RATIO).toFixed(0)}% capital floor and was resolved: `)
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
      timestamp: dateOfWeek(week).toISOString(),
      category: 'CREDIT',
      message: `Bank resolved: ${bank.name} -> ${acquirer.name}`,
      deltaText: '',
      data: { failed: bank.ticker, assuming: acquirer.ticker, ...plan },
    });
  });
}
