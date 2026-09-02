/**
 * M — MONEY. Who makes it, who destroys it, and where it can leak. The closed model has two
 * creators (a bank's credit, the central bank's purchases) and their mirrors; everything else
 * moves money between accounts. Each check here is an identity that holds exactly when that is
 * true, and a size when it is not.
 */

import { GameState, RegionId } from '../../types';
import { loanBooksOf, depositsOf } from '../../domain/banking';
import { AuditSnapshot } from './snapshot';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { centralBankAssetsUSD } from '../../domain/central-bank';
import { AuditFinding, B, M, sum } from './types';
import { cashOf, entityCashOf, poolCashOf } from '../ledger/accounts';
import { ensureV2 } from '../../engine2/world';

const banksOf = (s: GameState, r?: RegionId) =>
  s.companies.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c) && (!r || c.region === r));

/** M1 — the central bank's balance sheet closes EXACTLY: assets = reserves + treasury account + currency
 *  + the households' money in transit to their banks (settled this week, on a bank's book next — the
 *  payer's bank has already lost the reserves), no unbacked line. */
function m1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!cb) return;
    const reserves = sum(banksOf(state, r), (b) => b.bankBalanceSheet!.cashReservesUSD);
    const assets = centralBankAssetsUSD(cb);
    const residual = reserves + cb.treasuryAccountUSD + cb.currencyInCirculationUSD - assets;
    if (Math.abs(residual) > Math.max(1e6, assets * 1e-4)) {
      out.push({ family: 'M', check: 'M1 central bank closes', week, usd: residual, message: `${r}: reserves ${B(reserves)} + TGA ${B(cb.treasuryAccountUSD)} + currency ${B(cb.currencyInCirculationUSD)} exceed the central bank's assets ${B(assets)} (foreign claims ${B(cb.foreignOfficialClaimsUSD ?? 0)}, window ${B(cb.standingFacilityLentUSD ?? 0)}) by ${B(residual)} — bank money nothing was bought against` });
    }
  });
  // C4b: the official-settlement claims are bilateral, so the world's sum is zero or a leak.
  const claims = sum(REGION_IDS, (r) => state.regions[r]?.centralBankSheet?.foreignOfficialClaimsUSD ?? 0);
  if (Math.abs(claims) > 1e6) out.push({ family: 'M', check: 'M1 foreign official claims net to zero', week, usd: claims, message: `the central banks' claims on each other sum to ${B(claims)}, not zero — a cross-border leg with one side missing` });
  return out;
}

/** M2 — the named residual lines are all zero: unbacked cash, the currency plug, the boundary, unresolved money, the CCP's residual. */
function m2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!cb) return;
    if (Math.abs(cb.currencyInCirculationUSD) > 1e6) out.push({ family: 'M', check: 'M2 currency plug', week, usd: cb.currencyInCirculationUSD, message: `${r}: currency in circulation ${B(cb.currencyInCirculationUSD)} is a residual nobody issued` });
    const cbLoans = sum(banksOf(state, r), (b) => b.bankBalanceSheet!.centralBankLoanUSD ?? 0);
    if (Math.abs(cbLoans - (cb.loansToBanksUSD ?? 0)) > 1e6) out.push({ family: 'M', check: 'M2 central bank loans = banks\' borrowing', week, usd: cbLoans - (cb.loansToBanksUSD ?? 0), message: `${r}: banks owe the central bank ${B(cbLoans)}, its book says ${B(cb.loansToBanksUSD ?? 0)}` });
  });
  const s = state.lastSettlement;
  if (s) {
    if (Math.abs(s.unresolvedUSD) > 1e5) out.push({ family: 'M', check: 'M2 unresolved money', week, usd: s.unresolvedUSD, message: `${B(s.unresolvedUSD)} found no account at settlement` });
    if (Math.abs(s.clearingHouseResidualUSD) > 1e5) out.push({ family: 'M', check: 'M2 clearing house residual', week, usd: s.clearingHouseResidualUSD, message: `the CCP was left holding ${B(s.clearingHouseResidualUSD)}` });
  }
  return out;
}

/** M3 — the trial balance: every holder's balance is a named bank's deposit line, and the lines are the sums. */
function m3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const bankByTicker = new Map(banksOf(state).map((b) => [b.ticker, b]));
  const corpByBank = new Map<string, number>();
  const instByBank = new Map<string, number>();
  state.companies.forEach((c) => {
    if (c.isBankEntity || !isActiveCompany(c)) return;
    const k = c.homeBankTicker ?? '';
    corpByBank.set(k, (corpByBank.get(k) ?? 0) + cashOf(v2, c));
  });
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    const k = e.homeBankTicker ?? '';
    instByBank.set(k, (instByBank.get(k) ?? 0) + entityCashOf(v2, e));
  });
  let corpGap = 0, instGap = 0;
  bankByTicker.forEach((b, t) => {
    const bs = b.bankBalanceSheet!;
    const c = corpByBank.get(t) ?? 0, i = instByBank.get(t) ?? 0;
    corpGap += Math.abs(c - (bs.corporateDepositsUSD ?? 0));
    instGap += Math.abs(i - (bs.institutionalDepositsUSD ?? 0));
  });
  const orphanCorp = corpByBank.get('') ?? 0, orphanInst = instByBank.get('') ?? 0;
  const corpTotal = sum(state.companies.filter((c) => !c.isBankEntity && isActiveCompany(c)), (c) => Math.abs(cashOf(v2, c)));
  if (corpGap > Math.max(1e7, corpTotal * 0.005)) out.push({ family: 'M', check: 'M3 corporate deposits = firms\' cash by bank', week, usd: corpGap, message: `firms' cash by house bank differs from the banks' corporate deposit lines by ${B(corpGap)} in all` });
  if (instGap > 1e8) out.push({ family: 'M', check: 'M3 institutional deposits = funds\' cash by bank', week, usd: instGap, message: `funds' cash by house bank differs from the banks' institutional deposit lines by ${B(instGap)}` });
  if (Math.abs(orphanCorp) + Math.abs(orphanInst) > 1e6) out.push({ family: 'M', check: 'M3 balances with no bank', week, usd: orphanCorp + orphanInst, message: `${B(orphanCorp)} of firm cash and ${B(orphanInst)} of fund cash sit with no house bank` });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    const banks = banksOf(state, r);
    const smeLine = sum(banks, (b) => b.bankBalanceSheet!.smeDepositsUSD ?? 0);
    const pools = sum(reg.smePools ?? [], (p) => poolCashOf(v2, r, p.industry));
    if (Math.abs(smeLine - pools) > Math.max(1e7, Math.abs(pools) * 0.005)) out.push({ family: 'M', check: 'M3 sme deposits = pools\' cash', week, usd: smeLine - pools, message: `${r}: the pools hold ${B(pools)} while the banks' SME lines say ${B(smeLine)}` });
    const hhLine = sum(banks, (b) => b.bankBalanceSheet!.depositsUSD);
    const hh = reg.householdState?.depositsUSD ?? 0;
    if (Math.abs(hhLine - hh) > Math.max(1e7, Math.abs(hh) * 0.005)) out.push({ family: 'M', check: 'M3 household deposits = banks\' line', week, usd: hhLine - hh, message: `${r}: households say ${B(hh)}, the banks' household line says ${B(hhLine)}` });
  });
  return out;
}

/** M4 — no negative balances: an overdraft is a loan nobody quoted. */
function m4(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const negCorp = state.companies.filter((c) => !c.isBankEntity && isActiveCompany(c) && cashOf(v2, c) < -1e6);
  if (negCorp.length) out.push({ family: 'M', check: 'M4 overdrawn firms', week, usd: sum(negCorp, (c) => cashOf(v2, c)), message: `${negCorp.length} firms overdrawn, ${B(sum(negCorp, (c) => cashOf(v2, c)))} in all (worst ${negCorp.sort((a, b) => cashOf(v2, a) - cashOf(v2, b))[0].ticker} ${M(cashOf(v2, negCorp[0]))})` });
  const negInst = state.institutionalEntities.filter((e) => !e.isDefaulted && entityCashOf(v2, e) < -1e6);
  if (negInst.length) { const worst = [...negInst].sort((a, b) => entityCashOf(v2, a) - entityCashOf(v2, b))[0]; out.push({ family: 'M', check: 'M4 overdrawn funds', week, usd: sum(negInst, (e) => entityCashOf(v2, e)), message: `${negInst.length} funds overdrawn, ${B(sum(negInst, (e) => entityCashOf(v2, e)))} (worst ${worst.ticker ?? worst.id} ${worst.entityType} ${M(entityCashOf(v2, worst))})` }); }
  REGION_IDS.forEach((r) => {
    const tga = state.regions[r]?.centralBankSheet?.treasuryAccountUSD ?? 0;
    if (tga < -1e6) out.push({ family: 'M', check: 'M4 overdrawn treasury', week, usd: tga, message: `${r}: the treasury's account stands at ${B(tga)} — an overdraft at the central bank nobody granted` });
  });
  const negBank = banksOf(state).filter((b) => b.bankBalanceSheet!.cashReservesUSD < -1e6);
  if (negBank.length) out.push({ family: 'M', check: 'M4 negative reserves', week, usd: sum(negBank, (b) => b.bankBalanceSheet!.cashReservesUSD), message: `${negBank.map((b) => b.ticker).join(' ')} hold negative reserves` });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    const negPools = (reg.smePools ?? []).filter((p) => poolCashOf(v2, r, p.industry) < -1e6);
    if (negPools.length) out.push({ family: 'M', check: 'M4 overdrawn pools', week, usd: sum(negPools, (p) => poolCashOf(v2, r, p.industry)), message: `${r}: ${negPools.length} pools overdrawn ${B(sum(negPools, (p) => poolCashOf(v2, r, p.industry)))}` });
    const hh = reg.householdState?.depositsUSD ?? 0;
    if (hh < -1e6) out.push({ family: 'M', check: 'M4 overdrawn households', week, usd: hh, message: `${r}: household deposits ${B(hh)}` });
    const tga = reg.centralBankSheet?.treasuryAccountUSD ?? 0;
    if (tga < -1e6) out.push({ family: 'M', check: 'M4 overdrawn treasury', week, usd: tga, message: `${r}: treasury account ${B(tga)}` });
  });
  return out;
}

/** M5 — every bank's own sheet closes: assets = liabilities + equity. */
function m5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  banksOf(state).forEach((b) => {
    const bs = b.bankBalanceSheet!;
    const sov = sum(Object.values(bs.sovereignBondHoldingsByTenor ?? {}), (v) => Number(v) || 0);
    const desks = sum(Object.values(bs.dealerDeskInventory ?? {}), (rows) => sum(rows, (x) => x.inventoryUSD));
    const assets = loanBooksOf(bs) + sov + bs.cashReservesUSD + (bs.repoLentUSD ?? 0) + (bs.sovereignAccruedCouponUSD ?? 0) + desks + (bs.primeBrokerageLoansUSD ?? 0);
    const liabilities = depositsOf(bs) + (bs.centralBankLoanUSD ?? 0) + (bs.repoBorrowedUSD ?? 0) + (bs.srfBorrowingUSD ?? 0);
    const residual = assets - liabilities - bs.bankEquityUSD;
    if (Math.abs(residual) > Math.max(1e7, assets * 2e-3)) out.push({ family: 'M', check: 'M5 bank sheet closes', week, usd: residual, message: `${b.region}:${b.ticker} assets ${B(assets)} − liabilities ${B(liabilities)} − equity ${B(bs.bankEquityUSD)} = ${B(residual)}` });
  });
  return out;
}

/** M6 — the money stock moves only by credit and the central bank: Δ(deposits + TGA) week on week against the settlement's own record. */
function m6(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  if (!prev) return out;
  const ls = state.lastSettlement;
  REGION_IDS.forEach((r) => {
    const before = prev[r];
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!before || !cb || !reg) return;
    // Money is the bank lines and the treasury's account (§5-WIRES A2: nothing is in transit).
    const now = sum(banksOf(state, r), (b) => depositsOf(b.bankBalanceSheet!)) + cb.treasuryAccountUSD;
    const moneyBefore = before.bankDepositsUSD + before.treasuryAccountUSD;
    // Every creator, by name: the payment ledger's (bank credit written, reserves the central
    // bank issued, what the banks paid out of their own account, money from other regions), the
    // household books' deposit writes, the interest the banks credited to deposits, and the
    // central bank's advance to the treasury. Everything else is a transfer and nets to zero.
    const credit = ls?.creditCreatedByRegion?.[r] ?? 0;
    const issued = ls?.centralBankIssuanceByRegion?.[r] ?? 0;
    const ownAccount = -(ls?.bankOwnAccountByRegion?.[r] ?? 0);
    const crossBorder = ls?.crossBorderByRegion?.[r] ?? 0;
    const book = reg.householdBookDepositFlowWeeklyUSD ?? 0;
    const depositInterest = reg.householdDepositInterestWeeklyUSD ?? 0;
    const advance = (cb.waysAndMeansUSD ?? 0) - before.waysAndMeansUSD;
    const explained = credit + issued + ownAccount + crossBorder + book + depositInterest + advance;
    const gap = (now - moneyBefore) - explained;
    if (Math.abs(gap) > Math.max(5e8, moneyBefore * 0.005)) out.push({ family: 'M', check: 'M6 money moves only by its creators', week, usd: gap, message: `${r}: money stock moved ${B(now - moneyBefore)}; credit ${B(credit)} + central bank ${B(issued)} + banks' own account ${B(ownAccount)} + cross-border ${B(crossBorder)} + household books ${B(book)} + deposit interest ${B(depositInterest)} + advance ${B(advance)} = ${B(explained)}; ${B(gap)} unexplained` });
  });
  return out;
}

/** M7 — §5-WIRES A: the account store, applied by one rule, agrees with every balance the books
 *  carry after each settlement pass, and every settled row found a party's row. */
function m7(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const s = state.lastSettlement;
  if (!s) return out;
  if (s.accountRowsUnmapped > 0) out.push({ family: 'M', check: 'M7 every settled row has an account', week, usd: s.accountRowsUnmapped, message: `${s.accountRowsUnmapped} settled rows named a party the account store has no row for` });
  if (s.accountMismatchUSD > 1e3) out.push({ family: 'M', check: 'M7 accounts = books', week, usd: s.accountMismatchUSD, message: `the account store and the books differ by ${B(s.accountMismatchUSD)} after the week's passes — worst ${s.accountMismatchWorst}` });
  return out;
}

export function auditMoney(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  return [...m1(state, week), ...m2(state, week), ...m3(state, week), ...m4(state, week), ...m5(state, week), ...m6(prev, state, week), ...m7(state, week)];
}
