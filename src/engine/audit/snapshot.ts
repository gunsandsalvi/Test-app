/**
 * The audit's own memory of last week. The harness hands the audit the SAME state object it will
 * mutate in place, so "previous week" cannot be a reference — it is the handful of numbers the
 * week-over-week checks need, copied out when the audit runs.
 */
import { stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { GameState, RegionId } from '../../types';
import { loanBooksOf, spendableDepositsOf } from '../../domain/banking';
import { REGION_IDS, currencyOf } from '../../domain/geography';
import { centralBankAssetsUSD } from '../../domain/central-bank';
import { isActiveCompany } from '../../domain/company';
import { trancheKindOf } from '../../domain/assets';
import { V2World, ensureV2 } from '../../engine2/world';
import { inputUnitsHeld } from '../../engine2/lots';
import { SUBUNITS } from '../../engine2/state';
import { facilityBookOf } from '../../engine2/tranches';
import { materializeBook } from '../../engine2/holdings';
import { heldInShares } from '../../domain/assets';
import { ASSET_KINDS } from '../ledger/wire';

/** A holding type that is an asset kind in its own right, so its row and its wire meet. */
const isOwnAssetKind = (t: string): boolean => (ASSET_KINDS as readonly string[]).includes(t);

export interface RegionSnapshot {
  treasuryAccountUSD: number;
  waysAndMeansUSD: number;
  centralBankAssetsUSD: number;
  sovereignOutstandingUSD: number;
  bankDepositsUSD: number;
  /** The part of those deposits that is client margin — a line on the bank's SHEET rather than a
   *  row in the account store, so it moves without any settled row moving. */
  clientMarginUSD: number;
  bankLoansUSD: number;
}
export type AuditSnapshot = Partial<Record<RegionId, RegionSnapshot>> & { moneyPendingUSD?: number; /** §3.13c: the dated tail per currency, for the exact form of W1 */ moneyPendingByCurrency?: Record<string, number>; /** §5-WIRES W3: Σ ladder principal per `region|kind` */ ladderUSDByKey?: Record<string, number>; /** LADDER_TRACE=1: per `ticker|kind` */ ladderUSDByTicker?: Record<string, number>; /** §5-WIRES W4: units of goods held per `region|subUnit` (output stock + input lots + in transit) */ goodsUnitsByKey?: Record<string, number>; /** W5: register shares held per asset kind */ registerQtyByKind?: Record<string, number>; /** W5_TRACE=1: per `holderId|kind` */ registerQtyByHolder?: Record<string, number> };

export function snapshotOf(state: GameState): AuditSnapshot {
  const out: AuditSnapshot = { moneyPendingUSD: state.lastWires?.moneyPendingUSD ?? 0, moneyPendingByCurrency: state.lastWires?.moneyPendingByCurrency ?? {}, ladderUSDByKey: ladderUSDByKey(state), ladderUSDByTicker: process.env.LADDER_TRACE === '1' ? ladderUSDByTicker(state) : undefined, goodsUnitsByKey: goodsUnitsByKey(state), registerQtyByKind: registerQtyByKind(state), registerQtyByHolder: process.env.W5_TRACE === '1' ? registerQtyByHolder(state) : undefined };
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;
    const banks = state.companies.filter((c) => c.region === r && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
    out[r] = {
      treasuryAccountUSD: treasuryAccountOf(ensureV2(state), r),
      waysAndMeansUSD: waysAndMeansOf(ensureV2(state), r),
      centralBankAssetsUSD: centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(state), r), currencyOf(r), ensureV2(state).fx),
      sovereignOutstandingUSD: (reg.govDebtTranches ?? []).reduce((a, t) => a + t.principalUSD, 0),
      // The SAME read M6 takes at week end — every deposit class BUT the margin line, which is
      // a bank liability and not spendable money (`spendableDepositsOf`).
      bankDepositsUSD: banks.reduce((a, b) => a + spendableDepositsOf(b.bankBalanceSheet!, stateDepositLines(state, b.ticker)), 0),
      clientMarginUSD: banks.reduce((a, b) => a + (b.bankBalanceSheet!.clientMarginUSD ?? 0), 0),
      bankLoansUSD: banks.reduce((a, b) => a + loanBooksOf(b.bankBalanceSheet!, facilityBookOf(ensureV2(state), b.ticker)), 0),
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

/**
 * W5: the register's holdings per asset kind, in the asset's OWN unit — SHARES, never dollars.
 *
 * A value-keyed register would move every week on the marks and could never be the replay of its
 * wires, which is the same reason W3 works on a ladder's FACE and W4 on goods UNITS. So only the
 * kinds held in shares are claimed here, and only those that are asset kinds in their own right
 * (a PE fund interest is held in shares but wires as a CONTRACT, so its wire and its row would
 * not meet). The notional kinds join when step 13 gives a holding a face separate from its value.
 */
export function registerQtyByKind(state: GameState, byHolder?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const v2 = state.v2 as V2World | undefined;
  if (!v2) return out;
  for (const e of state.institutionalEntities ?? []) {
    for (const h of materializeBook(v2, e.id)) {
      if (!heldInShares(h.instrumentType) || !isOwnAssetKind(h.instrumentType)) continue;
      const q = h.quantityShares;
      if (q === undefined || Number.isNaN(q) || q === 0) continue;
      out[h.instrumentType] = (out[h.instrumentType] ?? 0) + q;
      if (byHolder) { const hk = `${e.id}|${h.instrumentType}`; byHolder[hk] = (byHolder[hk] ?? 0) + q; }
    }
  }
  return out;
}

/** W5_TRACE=1: the same register, per `holderId|kind` — which BOOK moved off its wires. */
export function registerQtyByHolder(state: GameState): Record<string, number> {
  const byHolder: Record<string, number> = {};
  registerQtyByKind(state, byHolder);
  return byHolder;
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
