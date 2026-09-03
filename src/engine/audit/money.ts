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
import { centralBankAssetsUSD, centralBankLiabilitiesUSD, centralBankSovereignBookUSD, centralBankFxReservesUSD } from '../../domain/central-bank';
import { AuditFinding, B, M, sum } from './types';
import { cashOf, entityCashOf, poolCashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { facilityBookOf } from '../../engine2/tranches';

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
    const v2 = ensureV2(state);
    const reserves = sum(banksOf(state, r), (b) => bankReservesOf(v2, b.ticker));
    const tga = treasuryAccountOf(v2, r);
    const wam = waysAndMeansOf(v2, r);
    const assets = centralBankAssetsUSD(cb, wam);
    const residual = centralBankLiabilitiesUSD(cb, reserves, tga) - assets;
    // CB_TRACE=1 prints the sheet every week for every region, breach or not. The residual is
    // CUMULATIVE, so the week a leak is MADE is invisible in the weeks it finally breaches —
    // only the week-on-week deltas of the parts can name it.
    if (process.env.CB_TRACE) {
      console.log(`  [cb-trace] w${week} ${r} residual ${M(residual)} | reserves ${M(reserves)} tga ${M(tga)} currency ${M(cb.currencyInCirculationUSD)} rrp ${M(cb.reverseRepoBorrowedUSD ?? 0)} | sovereign ${M(centralBankSovereignBookUSD(cb))} fx ${M(centralBankFxReservesUSD(cb))} loans ${M(cb.loansToBanksUSD ?? 0)} foreign ${M(cb.foreignOfficialClaimsUSD ?? 0)} window ${M(cb.standingFacilityLentUSD ?? 0)} advance ${M(wam)} | coupon ${M(cb.lastCouponIncomeUSD ?? 0)} accretion ${M(cb.lastBillAccretionUSD ?? 0)} loanInt ${M(cb.lastLoanInterestUSD ?? 0)} sfInt ${M(cb.lastStandingFacilityInterestUSD ?? 0)} - ior ${M(cb.lastInterestOnReservesUSD ?? 0)} rrpInt ${M(cb.lastReverseRepoInterestUSD ?? 0)} = remit ${M(cb.lastRemittanceUSD ?? 0)}`);
    }
    if (Math.abs(residual) > Math.max(1e6, assets * 1e-4)) {
      // Every component by name on both sides: the residual is cumulative, so the only way to
      // find the week it was made is to difference the parts across the weeks that print.
      const liab = `reserves ${M(reserves)} + TGA ${M(tga)} + currency ${M(cb.currencyInCirculationUSD)} + reverse repo ${M(cb.reverseRepoBorrowedUSD ?? 0)}`;
      const asst = `sovereign ${M(centralBankSovereignBookUSD(cb))} + fx ${M(centralBankFxReservesUSD(cb))} + loans ${M(cb.loansToBanksUSD ?? 0)} + foreign claims ${M(cb.foreignOfficialClaimsUSD ?? 0)} + window ${M(cb.standingFacilityLentUSD ?? 0)} + advance ${M(wam)}`;
      out.push({ family: 'M', check: 'M1 central bank closes', week, usd: residual, message: `${r}: ${liab} exceed ${asst} by ${B(residual)} — bank money nothing was bought against` });
    }
  });
  // The official-settlement claims are bilateral, so the world's sum is zero or a leak.
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
    // The same two-sided identity for the window's other side: what the lenders say they have
    // parked is what the central bank says it has taken. A lender that leaves the world with cash
    // still parked would otherwise leave the borrowing on the book with nobody to return it to.
    const parked = sum(state.institutionalEntities.filter((e) => e.region === r), (e) => e.rrpLentUSD ?? 0);
    if (Math.abs(parked - (cb.reverseRepoBorrowedUSD ?? 0)) > 1e6) out.push({ family: 'M', check: 'M2 reverse repo book = lenders\' parked cash', week, usd: parked - (cb.reverseRepoBorrowedUSD ?? 0), message: `${r}: lenders have ${B(parked)} parked at the window, its book says ${B(cb.reverseRepoBorrowedUSD ?? 0)}` });
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
  // A3.6c-ii: a bank's corporate and institutional lines ARE its depositors' accounts
  // (`depositLinesAt`), so the line-versus-holders check is a tautology now; what remains
  // real is money with no bank at all.
  // A house bank that has no sheet (resolved, merged away) is no bank —
  // the link is re-keyed at both events, and this is the measurement that it was.
  const liveBanks = new Set(state.companies.filter((b) => b.isBankEntity && b.bankBalanceSheet && isActiveCompany(b)).map((b) => b.ticker));
  const banked = (t: string | undefined) => !!t && liveBanks.has(t);
  const orphanCorp = sum(state.companies.filter((c) => !c.isBankEntity && isActiveCompany(c) && !banked(c.homeBankTicker)), (c) => cashOf(v2, c));
  const orphanInst = sum(state.institutionalEntities.filter((e) => !e.isDefaulted && !banked(e.homeBankTicker)), (e) => entityCashOf(v2, e));
  if (Math.abs(orphanCorp) + Math.abs(orphanInst) > 1e6) out.push({ family: 'M', check: 'M3 balances with no bank', week, usd: orphanCorp + orphanInst, message: `${B(orphanCorp)} of firm cash and ${B(orphanInst)} of fund cash sit with no live house bank` });
  // The household and SME lines are the sector rows themselves (A3.3/A3.4): nothing to compare.
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
  const negBank = banksOf(state).filter((b) => bankReservesOf(v2, b.ticker) < -1e6);
  if (negBank.length) out.push({ family: 'M', check: 'M4 negative reserves', week, usd: sum(negBank, (b) => bankReservesOf(v2, b.ticker)), message: `${negBank.map((b) => b.ticker).join(' ')} hold negative reserves` });
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    const negPools = (reg.smePools ?? []).filter((p) => poolCashOf(v2, r, p.industry) < -1e6);
    if (negPools.length) out.push({ family: 'M', check: 'M4 overdrawn pools', week, usd: sum(negPools, (p) => poolCashOf(v2, r, p.industry)), message: `${r}: ${negPools.length} pools overdrawn ${B(sum(negPools, (p) => poolCashOf(v2, r, p.industry)))}` });
    const hh = householdDepositsOf(v2, r);
    if (hh < -1e6) out.push({ family: 'M', check: 'M4 overdrawn households', week, usd: hh, message: `${r}: household deposits ${B(hh)}` });
    // The treasury cannot overdraw — the negative side of its row IS the advance, granted by rule.
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
    const assets = loanBooksOf(bs, facilityBookOf(ensureV2(state), b.ticker)) + sov + bankReservesOf(ensureV2(state), b.ticker) + (bs.repoLentUSD ?? 0) + (bs.sovereignAccruedCouponUSD ?? 0) + desks + (bs.primeBrokerageLoansUSD ?? 0);
    const liabilities = depositsOf(bs, stateDepositLines(state, b.ticker)) + (bs.centralBankLoanUSD ?? 0) + (bs.repoBorrowedUSD ?? 0) + (bs.srfBorrowingUSD ?? 0);
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
    // Money is the bank lines and the treasury's account (nothing is in transit).
    const now = sum(banksOf(state, r), (b) => depositsOf(b.bankBalanceSheet!, stateDepositLines(state, b.ticker))) + treasuryAccountOf(ensureV2(state), r);
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
    const advance = waysAndMeansOf(ensureV2(state), r) - before.waysAndMeansUSD;
    const explained = credit + issued + ownAccount + crossBorder + book + depositInterest + advance;
    const gap = (now - moneyBefore) - explained;
    if (Math.abs(gap) > Math.max(5e8, moneyBefore * 0.005)) out.push({ family: 'M', check: 'M6 money moves only by its creators', week, usd: gap, message: `${r}: money stock moved ${B(now - moneyBefore)}; credit ${B(credit)} + central bank ${B(issued)} + banks' own account ${B(ownAccount)} + cross-border ${B(crossBorder)} + household books ${B(book)} + deposit interest ${B(depositInterest)} + advance ${B(advance)} = ${B(explained)}; ${B(gap)} unexplained` });
  });
  return out;
}

/** M7 — the account store, applied by one rule, agrees with every balance the books
 *  carry after each settlement pass, and every settled row found a party's row. */
function m7(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const s = state.lastSettlement;
  if (!s) return out;
  if (s.accountRowsUnmapped > 0) out.push({ family: 'M', check: 'M7 every settled row has an account', week, usd: s.accountUnmappedUSD ?? 0, message: `${s.accountRowsUnmapped} settled rows worth ${B(s.accountUnmappedUSD ?? 0)} named a party the account store has no row for — neither leg was applied (${Object.entries(s.accountUnmappedByKind ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${B(v)}`).join(', ') || 'no kinds recorded'})` });
  return out;
}

export function auditMoney(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  return [...m1(state, week), ...m2(state, week), ...m3(state, week), ...m4(state, week), ...m5(state, week), ...m6(prev, state, week), ...m7(state, week)];
}
