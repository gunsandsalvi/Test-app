/**
 * The audit's own memory of last week. The harness hands the audit the SAME state object it will
 * mutate in place, so "previous week" cannot be a reference — it is the handful of numbers the
 * week-over-week checks need, copied out when the audit runs.
 */
import { GameState, RegionId } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { centralBankAssetsUSD } from '../../domain/central-bank';
import { isActiveCompany } from '../../domain/company';
import { trancheKindOf } from '../../domain/assets';

export interface RegionSnapshot {
  treasuryAccountUSD: number;
  waysAndMeansUSD: number;
  centralBankAssetsUSD: number;
  sovereignOutstandingUSD: number;
  bankDepositsUSD: number;
  /** The households' money settled this week and on a bank's line next week (T+1). */
  householdInTransitUSD: number;
  bankLoansUSD: number;
}
export type AuditSnapshot = Partial<Record<RegionId, RegionSnapshot>> & { moneyPendingUSD?: number; /** §5-WIRES W3: Σ ladder principal per `region|kind` */ ladderUSDByKey?: Record<string, number>; /** LADDER_TRACE=1: per `ticker|kind` */ ladderUSDByTicker?: Record<string, number> };

export function snapshotOf(state: GameState): AuditSnapshot {
  const out: AuditSnapshot = { moneyPendingUSD: state.lastWires?.moneyPendingUSD ?? 0, ladderUSDByKey: ladderUSDByKey(state), ladderUSDByTicker: process.env.LADDER_TRACE === '1' ? ladderUSDByTicker(state) : undefined };
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;
    const banks = state.companies.filter((c) => c.region === r && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
    out[r] = {
      treasuryAccountUSD: cb.treasuryAccountUSD,
      waysAndMeansUSD: cb.waysAndMeansUSD ?? 0,
      centralBankAssetsUSD: centralBankAssetsUSD(cb),
      sovereignOutstandingUSD: (reg.govDebtTranches ?? []).reduce((a, t) => a + t.principalUSD, 0),
      bankDepositsUSD: banks.reduce((a, b) => {
        const s = b.bankBalanceSheet!;
        return a + s.depositsUSD + (s.corporateDepositsUSD ?? 0) + (s.institutionalDepositsUSD ?? 0) + (s.smeDepositsUSD ?? 0);
      }, 0),
      householdInTransitUSD: (reg.householdState as unknown as { pendingBankSettlementUSD?: number })?.pendingBankSettlementUSD ?? 0,
      bankLoansUSD: banks.reduce((a, b) => a + b.bankBalanceSheet!.businessLoanBookUSD + b.bankBalanceSheet!.consumerLoanBookUSD, 0),
    };
  });
  return out;
}

/** §5-WIRES W3: every firm's ladder, summed per region and kind of paper — what the wires must reproduce. */
export function ladderUSDByKey(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of state.companies) {
    for (const t of c.debtTranches ?? []) {
      const key = `${c.region}|${trancheKindOf(t)}`;
      out[key] = (out[key] ?? 0) + t.principalUSD;
    }
  }
  return out;
}

/** LADDER_TRACE=1: every firm's ladder per `ticker|kind` — the per-issuer side of W3's trace. */
export function ladderUSDByTicker(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of state.companies) {
    for (const t of c.debtTranches ?? []) {
      const key = `${c.ticker}|${trancheKindOf(t)}`;
      out[key] = (out[key] ?? 0) + t.principalUSD;
    }
  }
  return out;
}
