/**
 * M — MONEY. Who makes it, who destroys it, and where it can leak. The closed model has two
 * creators (a bank's credit, the central bank's purchases) and their mirrors; everything else
 * moves money between accounts. Each check here is an identity that holds exactly when that is
 * true, and a size when it is not.
 */

import { GameState, RegionId, Company } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { centralBankAssetsUSD } from '../../domain/central-bank';
import { AuditFinding, B, M, pct, sum } from './types';

type Sheet = NonNullable<Company['bankBalanceSheet']>;
const banksOf = (s: GameState, r?: RegionId) =>
  s.companies.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c) && (!r || c.region === r));
const depositsOf = (bs: Sheet) => bs.depositsUSD + (bs.corporateDepositsUSD ?? 0) + (bs.institutionalDepositsUSD ?? 0) + (bs.smeDepositsUSD ?? 0) + (bs.clientMarginUSD ?? 0);

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
    const inTransit = (reg.householdState as unknown as { pendingBankSettlementUSD?: number }).pendingBankSettlementUSD ?? 0;
    const assets = centralBankAssetsUSD(cb);
    const residual = reserves + cb.treasuryAccountUSD + cb.currencyInCirculationUSD + inTransit - assets;
    if (Math.abs(residual) > Math.max(1e6, assets * 1e-4)) {
      out.push({ family: 'M', check: 'M1 central bank closes', week, usd: residual, message: `${r}: reserves ${B(reserves)} + TGA ${B(cb.treasuryAccountUSD)} + currency ${B(cb.currencyInCirculationUSD)} + in transit ${B(inTransit)} exceed the central bank's assets ${B(assets)} (foreign claims ${B(cb.foreignOfficialClaimsUSD ?? 0)}) by ${B(residual)} — bank money nothing was bought against` });
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
    const rx = reg as unknown as { unmodeledTaxRevenueUSD?: number; governmentInterestToUnmodeledHoldersUSD?: number };
    if ((rx.unmodeledTaxRevenueUSD ?? 0) > 1e6) out.push({ family: 'M', check: 'M2 tax from nobody', week, usd: rx.unmodeledTaxRevenueUSD, message: `${r}: ${B(rx.unmodeledTaxRevenueUSD!)}/wk of revenue credited to the treasury that no payer paid` });
    if ((rx.governmentInterestToUnmodeledHoldersUSD ?? 0) > 1e6) out.push({ family: 'M', check: 'M2 interest to nobody', week, usd: rx.governmentInterestToUnmodeledHoldersUSD, message: `${r}: ${B(rx.governmentInterestToUnmodeledHoldersUSD!)}/wk of coupon paid to holders that do not exist` });
    const hs = reg.householdState as unknown as { unmodeledFinancialAssetsUSD?: number; unmodeledCapitalReceiptShareOfIncome?: number };
    if ((hs.unmodeledFinancialAssetsUSD ?? 0) > 1e6) out.push({ family: 'M', check: 'M2 household assets with no issuer', week, usd: hs.unmodeledFinancialAssetsUSD, message: `${r}: households hold ${B(hs.unmodeledFinancialAssetsUSD!)} nobody issued` });
    if ((hs.unmodeledCapitalReceiptShareOfIncome ?? 0) > 1e-6) out.push({ family: 'M', check: 'M2 income from nobody', week, usd: (hs.unmodeledCapitalReceiptShareOfIncome ?? 0) * (reg.estimatedHouseholdIncomeUSD ?? 0) / 52, message: `${r}: ${pct(hs.unmodeledCapitalReceiptShareOfIncome!)} of household income arrives with no payer` });
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
  const bankByTicker = new Map(banksOf(state).map((b) => [b.ticker, b]));
  const corpByBank = new Map<string, number>();
  const instByBank = new Map<string, number>();
  state.companies.forEach((c) => {
    if (c.isBankEntity || !isActiveCompany(c)) return;
    const k = c.homeBankTicker ?? '';
    corpByBank.set(k, (corpByBank.get(k) ?? 0) + c.cash);
  });
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    const k = e.homeBankTicker ?? '';
    instByBank.set(k, (instByBank.get(k) ?? 0) + (e.cashUSD ?? 0));
  });
  let corpGap = 0, instGap = 0;
  bankByTicker.forEach((b, t) => {
    const bs = b.bankBalanceSheet!;
    const c = corpByBank.get(t) ?? 0, i = instByBank.get(t) ?? 0;
    corpGap += Math.abs(c - (bs.corporateDepositsUSD ?? 0));
    instGap += Math.abs(i - (bs.institutionalDepositsUSD ?? 0));
  });
  const orphanCorp = corpByBank.get('') ?? 0, orphanInst = instByBank.get('') ?? 0;
  const corpTotal = sum(state.companies.filter((c) => !c.isBankEntity && isActiveCompany(c)), (c) => Math.abs(c.cash));
  if (corpGap > Math.max(1e7, corpTotal * 0.005)) out.push({ family: 'M', check: 'M3 corporate deposits = firms\' cash by bank', week, usd: corpGap, message: `firms' cash by house bank differs from the banks' corporate deposit lines by ${B(corpGap)} in all` });
  if (instGap > 1e8) out.push({ family: 'M', check: 'M3 institutional deposits = funds\' cash by bank', week, usd: instGap, message: `funds' cash by house bank differs from the banks' institutional deposit lines by ${B(instGap)}` });
  if (Math.abs(orphanCorp) + Math.abs(orphanInst) > 1e6) out.push({ family: 'M', check: 'M3 balances with no bank', week, usd: orphanCorp + orphanInst, message: `${B(orphanCorp)} of firm cash and ${B(orphanInst)} of fund cash sit with no house bank` });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    const banks = banksOf(state, r);
    const smeLine = sum(banks, (b) => b.bankBalanceSheet!.smeDepositsUSD ?? 0);
    const pools = sum(reg.smePools ?? [], (p) => p.cashUSD ?? 0);
    if (Math.abs(smeLine - pools) > Math.max(1e7, Math.abs(pools) * 0.005)) out.push({ family: 'M', check: 'M3 sme deposits = pools\' cash', week, usd: smeLine - pools, message: `${r}: the pools hold ${B(pools)} while the banks' SME lines say ${B(smeLine)}` });
    const hhLine = sum(banks, (b) => b.bankBalanceSheet!.depositsUSD);
    const hs = reg.householdState as unknown as { depositsUSD?: number; pendingBankSettlementUSD?: number };
    const hh = (hs.depositsUSD ?? 0);
    const pending = hs.pendingBankSettlementUSD ?? 0;
    if (Math.abs(hhLine - hh + pending) > Math.max(1e7, Math.abs(hh) * 0.005)) out.push({ family: 'M', check: 'M3 household deposits = banks\' line', week, usd: hhLine - hh + pending, message: `${r}: households say ${B(hh)} (pending ${B(pending)}), the banks' household line says ${B(hhLine)}` });
  });
  return out;
}

/** M4 — no negative balances: an overdraft is a loan nobody quoted. */
function m4(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const negCorp = state.companies.filter((c) => !c.isBankEntity && isActiveCompany(c) && c.cash < -1e6);
  if (negCorp.length) out.push({ family: 'M', check: 'M4 overdrawn firms', week, usd: sum(negCorp, (c) => c.cash), message: `${negCorp.length} firms overdrawn, ${B(sum(negCorp, (c) => c.cash))} in all (worst ${negCorp.sort((a, b) => a.cash - b.cash)[0].ticker} ${M(negCorp[0].cash)})` });
  const negInst = state.institutionalEntities.filter((e) => !e.isDefaulted && (e.cashUSD ?? 0) < -1e6);
  if (negInst.length) { const worst = [...negInst].sort((a, b) => (a.cashUSD ?? 0) - (b.cashUSD ?? 0))[0]; out.push({ family: 'M', check: 'M4 overdrawn funds', week, usd: sum(negInst, (e) => e.cashUSD ?? 0), message: `${negInst.length} funds overdrawn, ${B(sum(negInst, (e) => e.cashUSD ?? 0))} (worst ${worst.ticker ?? worst.id} ${worst.entityType} ${M(worst.cashUSD ?? 0)})` }); }
  const negBank = banksOf(state).filter((b) => b.bankBalanceSheet!.cashReservesUSD < -1e6);
  if (negBank.length) out.push({ family: 'M', check: 'M4 negative reserves', week, usd: sum(negBank, (b) => b.bankBalanceSheet!.cashReservesUSD), message: `${negBank.map((b) => b.ticker).join(' ')} hold negative reserves` });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    const negPools = (reg.smePools ?? []).filter((p) => (p.cashUSD ?? 0) < -1e6);
    if (negPools.length) out.push({ family: 'M', check: 'M4 overdrawn pools', week, usd: sum(negPools, (p) => p.cashUSD ?? 0), message: `${r}: ${negPools.length} pools overdrawn ${B(sum(negPools, (p) => p.cashUSD ?? 0))}` });
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
    const assets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + sov + bs.cashReservesUSD + (bs.repoLentUSD ?? 0) + (bs.sovereignAccruedCouponUSD ?? 0) + desks + (bs.primeBrokerageLoansUSD ?? 0);
    const liabilities = depositsOf(bs) + (bs.centralBankLoanUSD ?? 0) + (bs.repoBorrowedUSD ?? 0) + (bs.srfBorrowingUSD ?? 0);
    const residual = assets - liabilities - bs.bankEquityUSD;
    if (Math.abs(residual) > Math.max(1e7, assets * 2e-3)) out.push({ family: 'M', check: 'M5 bank sheet closes', week, usd: residual, message: `${b.region}:${b.ticker} assets ${B(assets)} − liabilities ${B(liabilities)} − equity ${B(bs.bankEquityUSD)} = ${B(residual)}` });
  });
  return out;
}

/** M6 — the money stock moves only by credit and the central bank: Δ(deposits + TGA) week on week against the settlement's own record. */
function m6(prev: GameState | undefined, state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  if (!prev) return out;
  const s = state.lastSettlement as unknown as { centralBankIssuanceUSD?: number } | undefined;
  REGION_IDS.forEach((r) => {
    const now = sum(banksOf(state, r), (b) => depositsOf(b.bankBalanceSheet!)) + (state.regions[r]?.centralBankSheet?.treasuryAccountUSD ?? 0);
    const before = sum(banksOf(prev, r), (b) => depositsOf(b.bankBalanceSheet!)) + (prev.regions[r]?.centralBankSheet?.treasuryAccountUSD ?? 0);
    const loansNow = sum(banksOf(state, r), (b) => b.bankBalanceSheet!.businessLoanBookUSD + b.bankBalanceSheet!.consumerLoanBookUSD);
    const loansBefore = sum(banksOf(prev, r), (b) => b.bankBalanceSheet!.businessLoanBookUSD + b.bankBalanceSheet!.consumerLoanBookUSD);
    const cbNow = centralBankAssetsUSD(state.regions[r].centralBankSheet!);
    const cbBefore = centralBankAssetsUSD(prev.regions[r].centralBankSheet!);
    // Money grows with net lending and central-bank purchases; everything else nets to zero.
    const explained = (loansNow - loansBefore) + (cbNow - cbBefore);
    const gap = (now - before) - explained;
    void s;
    if (Math.abs(gap) > Math.max(5e8, before * 0.01)) out.push({ family: 'M', check: 'M6 money moves only by credit and the central bank', week, usd: gap, message: `${r}: money stock moved ${B(now - before)}; net lending ${B(loansNow - loansBefore)} + central bank ${B(cbNow - cbBefore)} explain ${B(explained)}; ${B(gap)} unexplained` });
  });
  return out;
}

export function auditMoney(prev: GameState | undefined, state: GameState, week: number): AuditFinding[] {
  return [...m1(state, week), ...m2(state, week), ...m3(state, week), ...m4(state, week), ...m5(state, week), ...m6(prev, state, week)];
}
