/** F — STOCKS AGAINST FLOWS. The accounting closes: what a statement says moved is what the ledger moved. */

import { GameState } from '../../types';
import { AuditSnapshot } from './snapshot';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, sum } from './types';
import { cashOf, treasuryNetOf } from '../ledger/accounts';
import { ensureV2 } from '../../engine2/world';

/** F1 — a firm's balance sheet closes and its statement cash is its ledger balance. */
function f1(state: GameState, week: number): AuditFinding[] {
  const v2 = ensureV2(state);
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
    if (latest.week === state.currentWeek && Math.abs(bs.cash - cashOf(v2, c)) > Math.max(1e6, Math.abs(cashOf(v2, c)) * 0.01)) { cashN++; cashGap += bs.cash - cashOf(v2, c); }
  });
  if (open) out.push({ family: 'F', check: 'F1 balance sheet closes', week, usd: openUSD, message: `${open} firms' last filed balance sheet does not close (${B(openUSD)} net)` });
  if (cashN) out.push({ family: 'F', check: 'F1 statement cash = ledger cash', week, usd: cashGap, message: `${cashN} firms filed a cash line that is not their balance (${B(cashGap)} net)` });
  return out;
}

/** F2 — the treasury's account moves by exactly its payments (§5-CLOSE C5: nothing else writes it),
 *  and its reported revenue is exactly the tax its payers remitted. */
function f2(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const flows = state.lastSettlement?.treasuryFlowsByRegion ?? {};
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!cb) return;
    const byReason = flows[r] ?? {};
    const settled = sum(Object.values(byReason), (v) => v);
    const taxes = sum(Object.entries(byReason).filter(([k, v]) => v > 0 && /tax/i.test(k)), ([, v]) => v);
    if (prev?.[r]) {
      // The account's own balance moves by its payments; the ways-and-means advance (M4) is the
      // central bank funding the part of them the balance could not, repaid by the next money in.
      const dTga = treasuryNetOf(ensureV2(state), r) - (prev[r]!.treasuryAccountUSD - prev[r]!.waysAndMeansUSD);
      if (Math.abs(dTga - settled) > 1e6) out.push({ family: 'F', check: 'F2 treasury account moves by its payments', week, usd: dTga - settled, message: `${r}: the account (net of the ways-and-means advance) moved ${B(dTga)} but its payments net to ${B(settled)}; ${B(dTga - settled)} written by something that is not a payment` });
    }
    // §3.37-SEED: `taxes` is what was remitted THIS WEEK. At week 0 no week has elapsed, so the
    // comparison is against a zero that means "not yet", not "not paid".
    if (week > 0 && Math.abs(reg.governmentRevenueUSD - taxes) > Math.max(1e6, taxes * 1e-3)) out.push({ family: 'F', check: 'F2 revenue = tax remitted', week, usd: reg.governmentRevenueUSD - taxes, message: `${r}: revenue reported ${B(reg.governmentRevenueUSD)} against ${B(taxes)} of tax actually remitted` });
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

export function auditAccounts(prev: AuditSnapshot | undefined, state: GameState, week: number): AuditFinding[] {
  return [...f1(state, week), ...f2(prev, state, week), ...f3(state, week)];
}
