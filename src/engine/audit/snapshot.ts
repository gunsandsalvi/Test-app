/**
 * The audit's own memory of last week. The harness hands the audit the SAME state object it will
 * mutate in place, so "previous week" cannot be a reference — it is the handful of numbers the
 * week-over-week checks need, copied out when the audit runs.
 */
import { stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { GameState, RegionId } from '../../types';
import { loanBooksOf, depositsOf } from '../../domain/banking';
import { REGION_IDS } from '../../domain/geography';
import { centralBankAssetsUSD } from '../../domain/central-bank';
import { isActiveCompany } from '../../domain/company';
import { trancheKindOf } from '../../domain/assets';
import { V2World, ensureV2 } from '../../engine2/world';
import { inputUnitsHeld } from '../../engine2/lots';
import { SUBUNITS } from '../../engine2/state';

export interface RegionSnapshot {
  treasuryAccountUSD: number;
  waysAndMeansUSD: number;
  centralBankAssetsUSD: number;
  sovereignOutstandingUSD: number;
  bankDepositsUSD: number;
  bankLoansUSD: number;
}
export type AuditSnapshot = Partial<Record<RegionId, RegionSnapshot>> & { moneyPendingUSD?: number; /** §5-WIRES W3: Σ ladder principal per `region|kind` */ ladderUSDByKey?: Record<string, number>; /** LADDER_TRACE=1: per `ticker|kind` */ ladderUSDByTicker?: Record<string, number>; /** §5-WIRES W4: units of goods held per `region|subUnit` (output stock + input lots + in transit) */ goodsUnitsByKey?: Record<string, number> };

export function snapshotOf(state: GameState): AuditSnapshot {
  const out: AuditSnapshot = { moneyPendingUSD: state.lastWires?.moneyPendingUSD ?? 0, ladderUSDByKey: ladderUSDByKey(state), ladderUSDByTicker: process.env.LADDER_TRACE === '1' ? ladderUSDByTicker(state) : undefined, goodsUnitsByKey: goodsUnitsByKey(state) };
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;
    const banks = state.companies.filter((c) => c.region === r && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
    out[r] = {
      treasuryAccountUSD: treasuryAccountOf(ensureV2(state), r),
      waysAndMeansUSD: waysAndMeansOf(ensureV2(state), r),
      centralBankAssetsUSD: centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(state), r)),
      sovereignOutstandingUSD: (reg.govDebtTranches ?? []).reduce((a, t) => a + t.principalUSD, 0),
      // §7.373: the SAME read M6 takes at week end — every deposit class, the margin line included.
      bankDepositsUSD: banks.reduce((a, b) => a + depositsOf(b.bankBalanceSheet!, stateDepositLines(state, b.ticker)), 0),
      bankLoansUSD: banks.reduce((a, b) => a + loanBooksOf(b.bankBalanceSheet!), 0),
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

/** §5-WIRES W4: every unit of goods in the world, per `region|subUnit` — a firm's finished stock and
 *  input lots in its region, a consignment in the carrier's region while it is in transit. */
export function goodsUnitsByKey(state: GameState, parts?: Record<string, [number, number, number]>): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (region: string, sub: string, units: number, part = 0) => {
    if (units) { const k = `${region}|${sub}`; out[k] = (out[k] ?? 0) + units; if (parts) { const p = parts[k] ?? (parts[k] = [0, 0, 0]); p[part] += units; } }
  };
  const v2 = state.v2 as V2World | undefined;
  for (const c of state.companies) {
    for (const [sub, inv] of Object.entries(c.outputInventoryBySubUnit ?? {})) add(c.region, sub, inv.unitsHeld);
    if (v2) {
      const firmRow = v2.rowById.get(c.id);
      const touched = firmRow === undefined ? undefined : v2.lots.touchedSubs[firmRow];
      if (touched) for (const subIdx of touched) add(c.region, SUBUNITS[subIdx], inputUnitsHeld(v2, c.id, SUBUNITS[subIdx]), 1);
    }
  }
  const regionOf = new Map(state.companies.map((c) => [c.ticker, c.region]));
  // A consignment is stock in its NAMED carrier's region; one the transport pool carries (no
  // ticker) passed through a source-and-sink and reappears at arrival from it.
  for (const sh of state.goodsInTransit ?? []) {
    if (!sh.carrierTicker) continue;
    const region = sh.carrierRegion ?? regionOf.get(sh.carrierTicker);
    if (region) add(region, sh.subUnitId, sh.units, 2);
  }
  return out;
}
