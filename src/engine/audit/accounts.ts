/** F — STOCKS AGAINST FLOWS. The accounting closes: what a statement says moved is what the ledger moved. */

import { GameState } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, sum } from './types';

/** F1 — a firm's balance sheet closes and its statement cash is its ledger balance. */
function f1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  let open = 0, openUSD = 0, cashGap = 0, cashN = 0;
  state.companies.forEach((c) => {
    if (!isActiveCompany(c) || c.isBankEntity) return;
    const h = c.historicalFundamentals ?? [];
    const latest = h[h.length - 1];
    if (!latest?.balanceSheet) return;
    const bs = latest.balanceSheet;
    const residual = bs.totalAssets - bs.totalLiabilities - bs.shareholdersEquity;
    if (Math.abs(residual) > Math.max(1e6, bs.totalAssets * 1e-3)) { open++; openUSD += residual; }
    if (latest.week === state.currentWeek && Math.abs(bs.cash - c.cash) > Math.max(1e6, Math.abs(c.cash) * 0.01)) { cashN++; cashGap += bs.cash - c.cash; }
  });
  if (open) out.push({ family: 'F', check: 'F1 balance sheet closes', week, usd: openUSD, message: `${open} firms' last filed balance sheet does not close (${B(openUSD)} net)` });
  if (cashN) out.push({ family: 'F', check: 'F1 statement cash = ledger cash', week, usd: cashGap, message: `${cashN} firms filed a cash line that is not their balance (${B(cashGap)} net)` });
  return out;
}

/** F2 — the treasury's account moves by exactly what it took in, paid out and borrowed. */
function f2(prev: GameState | undefined, state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  if (!prev) return out;
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r], before = prev.regions[r];
    const cb = reg?.centralBankSheet, cbBefore = before?.centralBankSheet;
    if (!cb || !cbBefore) return;
    const dTga = cb.treasuryAccountUSD - cbBefore.treasuryAccountUSD;
    const debtNow = sum(reg.govDebtTranches ?? [], (t) => t.principalUSD), debtBefore = sum(before.govDebtTranches ?? [], (t) => t.principalUSD);
    const rx = reg as unknown as { governmentOutlaysUSD?: number; governmentSpendingWeeklyUSD: number };
    const outlays = rx.governmentOutlaysUSD ?? rx.governmentSpendingWeeklyUSD;
    const expected = reg.governmentRevenueUSD - outlays + (debtNow - debtBefore) + cb.lastRemittanceUSD;
    const gap = dTga - expected;
    if (Math.abs(gap) > Math.max(5e8, Math.abs(expected) * 0.25)) out.push({ family: 'F', check: 'F2 treasury account = revenue − outlays + borrowing + remittance', week, usd: gap, message: `${r}: the account moved ${B(dTga)}; revenue ${B(reg.governmentRevenueUSD)} − outlays ${B(outlays)} + net issuance ${B(debtNow - debtBefore)} + remittance ${B(cb.lastRemittanceUSD)} = ${B(expected)}; ${B(gap)} unexplained` });
  });
  return out;
}

/** F3 — the region's accounts: exports of one region are imports of another. */
function f3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const exports = sum(REGION_IDS, (r) => state.regions[r]?.exportsUSD ?? 0);
  const imports = sum(REGION_IDS, (r) => state.regions[r]?.importsUSD ?? 0);
  if (exports > 0 && Math.abs(exports - imports) > exports * 0.05) out.push({ family: 'F', check: 'F3 world exports = world imports', week, usd: exports - imports, message: `world exports ${B(exports)} against imports ${B(imports)}` });
  return out;
}

export function auditAccounts(prev: GameState | undefined, state: GameState, week: number): AuditFinding[] {
  return [...f1(state, week), ...f2(prev, state, week), ...f3(state, week)];
}
