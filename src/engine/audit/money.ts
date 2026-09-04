/**
 * M — MONEY. Who makes it, who destroys it, and where it can leak. The closed model has two
 * creators (a bank's credit, the central bank's purchases) and their mirrors; everything else
 * moves money between accounts. Each check here is an identity that holds exactly when that is
 * true, and a size when it is not.
 */

import { GameState } from '../../types';
import { loanBooksOf, depositsOf, spendableDepositsOf } from '../../domain/banking';
import { AuditSnapshot } from './snapshot';
import { REGION_IDS, currencyOf } from '../../domain/geography';
import { isActiveCompany, banksOf } from '../../domain/company';
import { centralBankAssetsLocal, centralBankLiabilitiesLocal, centralBankSovereignBookLocal, centralBankFxReservesLocal } from '../../domain/central-bank';
import { AuditFinding, B, M, sum } from './types';
import { cashOf, entityCashOf, poolCashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { ensureV2, currencyOfId } from '../../engine2/world';
import { facilityBookOf } from '../../engine2/tranches';
import type { Ticker } from '../../domain/ids';

/** M1 — the central bank's balance sheet closes EXACTLY: assets = reserves + treasury account + currency
 *  + the households' money in transit to their banks (settled this week, on a bank's book next — the
 *  payer's bank has already lost the reserves), no unbacked line. */
function m1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const fx = ensureV2(state).fx;
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!cb) return;
    const v2 = ensureV2(state);
    const reserves = sum(banksOf(state.companies, r), (b) => bankReservesOf(v2, b.ticker));
    const tga = treasuryAccountOf(v2, r);
    const wam = waysAndMeansOf(v2, r);
    const assets = centralBankAssetsLocal(cb, wam, currencyOf(r), fx);
    const residual = centralBankLiabilitiesLocal(cb, reserves, tga) - assets;
    // CB_TRACE=1 prints the sheet every week for every region, breach or not. The residual is
    // CUMULATIVE, so the week a leak is MADE is invisible in the weeks it finally breaches —
    // only the week-on-week deltas of the parts can name it.
    if (process.env.CB_TRACE) {
      console.log(`  [cb-trace] w${week} ${r} residual ${M(residual)} | reserves ${M(reserves)} tga ${M(tga)} currency ${M(cb.currencyInCirculationLocal)} rrp ${M(cb.reverseRepoBorrowedLocal ?? 0)} | sovereign ${M(centralBankSovereignBookLocal(cb))} fx ${M(centralBankFxReservesLocal(cb))} loans ${M(cb.loansToBanksLocal ?? 0)} foreign ${M(cb.foreignOfficialClaimsUSD ?? 0)} window ${M(cb.standingFacilityLentLocal ?? 0)} advance ${M(wam)} | coupon ${M(cb.lastCouponIncomeLocal ?? 0)} accretion ${M(cb.lastBillAccretionLocal ?? 0)} loanInt ${M(cb.lastLoanInterestLocal ?? 0)} sfInt ${M(cb.lastStandingFacilityInterestLocal ?? 0)} - ior ${M(cb.lastInterestOnReservesLocal ?? 0)} rrpInt ${M(cb.lastReverseRepoInterestLocal ?? 0)} = remit ${M(cb.lastRemittanceLocal ?? 0)}`);
    }
    if (Math.abs(residual) > Math.max(1e6, assets * 1e-4)) {
      // Every component by name on both sides: the residual is cumulative, so the only way to
      // find the week it was made is to difference the parts across the weeks that print.
      const liab = `reserves ${M(reserves)} + TGA ${M(tga)} + currency ${M(cb.currencyInCirculationLocal)} + reverse repo ${M(cb.reverseRepoBorrowedLocal ?? 0)}`;
      const asst = `sovereign ${M(centralBankSovereignBookLocal(cb))} + fx ${M(centralBankFxReservesLocal(cb))} + loans ${M(cb.loansToBanksLocal ?? 0)} + foreign claims ${M(cb.foreignOfficialClaimsUSD ?? 0)} + window ${M(cb.standingFacilityLentLocal ?? 0)} + advance ${M(wam)}`;
      out.push({ family: 'M', check: 'M1 central bank closes', week, usd: residual, message: `${r}: ${liab} exceed ${asst} by ${B(residual)} — bank money nothing was bought against` });
    }
  });
  // §3.13c — the official-settlement claims are bilateral, so the world's sum is zero or a leak.
  // They are carried in the NUMÉRAIRE on both sides (see `foreignOfficialClaimsUSD`), so this is
  // an exact sum: booking each side in its own money left the total non-zero by an exchange rate
  // whenever a rate moved after the flow, which is a revaluation and not a missing leg.
  const claims = sum(REGION_IDS, (r) => state.regions[r]?.centralBankSheet?.foreignOfficialClaimsUSD ?? 0);
  if (Math.abs(claims) > 1e3) out.push({ family: 'M', check: 'M1 foreign official claims net to zero', week, usd: claims, message: `the central banks' claims on each other sum to ${B(claims)}, not zero — a cross-border leg with one side missing` });
  return out;
}

/** M2 — the named residual lines are all zero: unbacked cash, the currency plug, the boundary, unresolved money, the CCP's residual. */
function m2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!cb) return;
    if (Math.abs(cb.currencyInCirculationLocal) > 1e6) out.push({ family: 'M', check: 'M2 currency plug', week, usd: cb.currencyInCirculationLocal, message: `${r}: currency in circulation ${B(cb.currencyInCirculationLocal)} is a residual nobody issued` });
    const cbLoans = sum(banksOf(state.companies, r), (b) => b.bankBalanceSheet!.centralBankLoanLocal ?? 0);
    if (Math.abs(cbLoans - (cb.loansToBanksLocal ?? 0)) > 1e6) out.push({ family: 'M', check: 'M2 central bank loans = banks\' borrowing', week, usd: cbLoans - (cb.loansToBanksLocal ?? 0), message: `${r}: banks owe the central bank ${B(cbLoans)}, its book says ${B(cb.loansToBanksLocal ?? 0)}` });
    // The same two-sided identity for the window's other side: what the lenders say they have
    // parked is what the central bank says it has taken. A lender that leaves the world with cash
    // still parked would otherwise leave the borrowing on the book with nobody to return it to.
    const parked = sum(state.institutionalEntities.filter((e) => e.region === r), (e) => e.rrpLentLocal ?? 0);
    if (Math.abs(parked - (cb.reverseRepoBorrowedLocal ?? 0)) > 1e6) out.push({ family: 'M', check: 'M2 reverse repo book = lenders\' parked cash', week, usd: parked - (cb.reverseRepoBorrowedLocal ?? 0), message: `${r}: lenders have ${B(parked)} parked at the window, its book says ${B(cb.reverseRepoBorrowedLocal ?? 0)}` });
  });
  const s = state.lastSettlement;
  if (s) {
    if (Math.abs(s.unresolvedLocal) > 1e5) out.push({ family: 'M', check: 'M2 unresolved money', week, usd: s.unresolvedLocal, message: `${B(s.unresolvedLocal)} found no account at settlement` });
    if (Math.abs(s.clearingHouseResidualLocal) > 1e5) out.push({ family: 'M', check: 'M2 clearing house residual', week, usd: s.clearingHouseResidualLocal, message: `the CCP was left holding ${B(s.clearingHouseResidualLocal)}` });
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
  const liveBanks = new Set(banksOf(state.companies).map((b) => b.ticker));
  const banked = (t: Ticker | undefined) => !!t && liveBanks.has(t);
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
  const negBank = banksOf(state.companies).filter((b) => bankReservesOf(v2, b.ticker) < -1e6);
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
  banksOf(state.companies).forEach((b) => {
    const bs = b.bankBalanceSheet!;
    const sov = sum(Object.values(bs.sovereignBondHoldingsByBond ?? {}), (v) => Number(v) || 0);
    const desks = sum(Object.values(bs.dealerDeskInventory ?? {}), (rows) => sum(rows, (x) => x.inventoryLocal));
    const assets = loanBooksOf(bs, facilityBookOf(ensureV2(state), b.ticker)) + sov + bankReservesOf(ensureV2(state), b.ticker) + (bs.repoLentLocal ?? 0) + (bs.sovereignAccruedCouponLocal ?? 0) + desks + (bs.primeBrokerageLoansLocal ?? 0);
    const liabilities = depositsOf(bs, stateDepositLines(state, b.ticker)) + (bs.centralBankLoanLocal ?? 0) + (bs.repoBorrowedLocal ?? 0) + (bs.srfBorrowingLocal ?? 0);
    const residual = assets - liabilities - bs.bankEquityLocal;
    if (Math.abs(residual) > Math.max(1e7, assets * 2e-3)) out.push({ family: 'M', check: 'M5 bank sheet closes', week, usd: residual, message: `${b.region}:${b.ticker} assets ${B(assets)} − liabilities ${B(liabilities)} − equity ${B(bs.bankEquityLocal)} = ${B(residual)}` });
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
    const now = sum(banksOf(state.companies, r), (b) => spendableDepositsOf(b.bankBalanceSheet!, stateDepositLines(state, b.ticker))) + treasuryAccountOf(ensureV2(state), r);
    const moneyBefore = before.bankDepositsLocal + before.treasuryAccountLocal;
    // Every creator, by name: the payment ledger's (bank credit written, reserves the central
    // bank issued, what the banks paid out of their own account, money from other regions), the
    // household books' deposit writes, the interest the banks credited to deposits, and the
    // central bank's advance to the treasury. Everything else is a transfer and nets to zero.
    const credit = ls?.creditCreatedByRegion?.[r] ?? 0;
    const issued = ls?.centralBankIssuanceByRegion?.[r] ?? 0;
    const ownAccount = -(ls?.bankOwnAccountByRegion?.[r] ?? 0);
    const crossBorder = ls?.crossBorderByRegion?.[r] ?? 0;
    const book = reg.householdBookDepositFlowWeeklyLocal ?? 0;
    const depositInterest = reg.householdDepositInterestWeeklyLocal ?? 0;
    const advance = waysAndMeansOf(ensureV2(state), r) - before.waysAndMeansLocal;
    const explained = credit + issued + ownAccount + crossBorder + book + depositInterest + advance;
    // The margin line is inside `depositsOf` but is NOT an account row, so it moves with no
    // settled row and no tally behind it — the one part of the stock the creator list cannot see.
    const marginNow = sum(banksOf(state.companies, r), (b) => b.bankBalanceSheet!.clientMarginLocal ?? 0);
    const marginDelta = marginNow - (before.clientMarginLocal ?? 0);
    const gap = (now - moneyBefore) - explained;
    if (Math.abs(gap) > Math.max(5e8, moneyBefore * 0.005)) {
      const unplaced = ls?.bankTallyUnmappedLocal ?? 0;
      // The stock is summed over ACTIVE banks, and a bank that left that set still holds the
      // deposits it held. Reported only when the two reads DIFFER, because then the gap is a
      // filter rather than a missing creator, and that is a different defect entirely.
      const allBanks = state.companies.filter((c) => c.isBankEntity && c.bankBalanceSheet && c.region === r);
      const nowAll = sum(allBanks, (b) => spendableDepositsOf(b.bankBalanceSheet!, stateDepositLines(state, b.ticker))) + treasuryAccountOf(ensureV2(state), r);
      const tail = (Math.abs(marginDelta) > 1e6 ? ` — the client-margin line moved ${B(marginDelta)}, which is inside the stock but is no account row` : '')
        + (unplaced ? ` (${B(unplaced)} of bank tallies reached no region at all)` : '')
        + (Math.abs(nowAll - now) > 1e6 ? ` [over ALL ${allBanks.length} of the region's banks the stock is ${B(nowAll)}, not ${B(now)} — the active filter is dropping a bank that still holds deposits]` : '');
      out.push({ family: 'M', check: 'M6 money moves only by its creators', week, usd: gap, message: `${r}: money stock moved ${B(now - moneyBefore)}; credit ${B(credit)} + central bank ${B(issued)} + banks' own account ${B(ownAccount)} + cross-border ${B(crossBorder)} + household books ${B(book)} + deposit interest ${B(depositInterest)} + advance ${B(advance)} = ${B(explained)}; ${B(gap)} unexplained${tail}` });
    }
  });
  return out;
}

/** M7 — the account store, applied by one rule, agrees with every balance the books
 *  carry after each settlement pass, and every settled row found a party's row. */
function m7(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const s = state.lastSettlement;
  if (!s) return out;
  if (s.accountRowsUnmapped > 0) out.push({ family: 'M', check: 'M7 every settled row has an account', week, usd: s.accountUnmappedLocal ?? 0, message: `${s.accountRowsUnmapped} settled rows worth ${B(s.accountUnmappedLocal ?? 0)} named a party the account store has no row for — neither leg was applied (${Object.entries(s.accountUnmappedByKind ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${B(v)}`).join(', ') || 'no kinds recorded'})` });
  return out;
}

export function auditMoney(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  return [...m1(state, week), ...m2(state, week), ...m3(state, week), ...m4(state, week), ...m5(state, week), ...m6(prev, state, week), ...m7(state, week), ...m8(state, week)];
}

/**
 * M8 — §3.37-ZEROSUM. THE FX REVALUATION IS THE RATE MOVE ON THE WORLD'S OPEN POSITION.
 *
 * `fx-revaluation` walks BANKS and CENTRAL BANKS and books each one's gain to equity or to the
 * revaluation account. This recomputes the same number from a different thing entirely — every
 * account row that exists, whoever owns it — so the two can only agree if every foreign position
 * in the world was revalued exactly once.
 *
 * A gap is not a rounding: it is a position that revalued twice, or one that nobody revalued.
 * `docs/systems/currency-and-fx.md` D2.b — an unrevalued foreign position is money created or
 * destroyed silently, which is a stale mark in the currency dimension. This is the only check
 * that can see it, and it is the check the M family lacked when revaluation was added.
 */
function m8(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const rv = state.lastFxRevaluation;
  if (!rv) return out;
  const v2 = ensureV2(state);
  const A = v2.accounts;
  // The world's position per currency, from the rows themselves.
  const posByCurrency = new Map<string, number>();
  for (let r = 0; r < A.n; r++) {
    const cur = currencyOfId(A.currencyId[r]);
    posByCurrency.set(cur, (posByCurrency.get(cur) ?? 0) + A.balance[r]);
  }
  let expectedLocal = 0;
  posByCurrency.forEach((pos, cur) => {
    const before = rv.fxBefore[cur], after = rv.fxAfter[cur];
    if (before === undefined || after === undefined) return;
    expectedLocal += pos * (after - before);
  });
  const gap = rv.bookedLocal - expectedLocal;
  // Float dust on a sum of this many rows, not a fraction of it (rule 7).
  if (Math.abs(gap) > 1e4) {
    out.push({ family: 'M', check: 'M8 the FX revaluation is the rate move on the open position', week, usd: gap,
      message: `revaluation booked ${B(rv.bookedLocal)} against ${B(expectedLocal)} implied by every account row and the week's rate move — ${B(gap)} of foreign position revalued twice or by nobody` });
  }
  return out;
}
