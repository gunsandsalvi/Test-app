/**
 * The audit's own memory of last week. The harness hands the audit the SAME state object it will
 * mutate in place, so "previous week" cannot be a reference — it is the handful of numbers the
 * week-over-week checks need, copied out when the audit runs.
 */
import { stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { buildEntityIndex } from '../ledger/entity-index';
import { materializeGovLadder } from '../../engine2/tranches';
import { GameState, RegionId } from '../../types';
import { loanBooksOf, spendableDepositsOf } from '../../domain/banking';
import { REGION_IDS, currencyOf } from '../../domain/geography';
import { centralBankAssetsLocal } from '../../domain/central-bank';
import { centralBankBookLocal } from '../sovereign-register';
import { banksOf } from '../../domain/company';
import { V2World, ensureV2 } from '../../engine2/world';
import { inputUnitsHeld } from '../../engine2/lots';
import { SUBUNITS } from '../../engine2/state';
import { facilityBookOf, ladderRowsOf, trancheKindOfRow } from '../../engine2/tranches';
import { materializeBook } from '../../engine2/holdings';
import { heldInShares } from '../../domain/assets';
import { ASSET_KINDS } from '../ledger/wire';

/** A holding type that is an asset kind in its own right, so its row and its wire meet. */
const isOwnAssetKind = (t: string): boolean => (ASSET_KINDS as readonly string[]).includes(t);

export interface RegionSnapshot {
  treasuryAccountLocal: number;
  waysAndMeansLocal: number;
  centralBankAssetsLocal: number;
  sovereignOutstandingLocal: number;
  bankDepositsLocal: number;
  /** The part of those deposits that is client margin — a line on the bank's SHEET rather than a
   *  row in the account store, so it moves without any settled row moving. */
  clientMarginLocal: number;
  bankLoansLocal: number;
}
export type AuditSnapshot = Partial<Record<RegionId, RegionSnapshot>> & { moneyPendingLocal?: number; /** §3.13c: the dated tail per currency, for the exact form of W1 */ moneyPendingByCurrency?: Record<string, number>; /** §5-WIRES W3: Σ ladder principal per `region|kind` */ ladderUSDByKey?: Record<string, number>; /** LADDER_TRACE=1: per `ticker|kind` */ ladderUSDByTicker?: Record<string, number>; /** §5-WIRES W4: units of goods held per `region|subUnit` (output stock + input lots + in transit) */ goodsUnitsByKey?: Record<string, number>; /** W5: register shares held per asset kind */ registerQtyByKind?: Record<string, number>; /** W5_TRACE=1: per `holderId|kind` */ registerQtyByHolder?: Record<string, number> };

export function snapshotOf(state: GameState): AuditSnapshot {
  const out: AuditSnapshot = { moneyPendingLocal: state.lastWires?.moneyPendingLocal ?? 0, moneyPendingByCurrency: state.lastWires?.moneyPendingByCurrency ?? {}, ladderUSDByKey: ladderUSDByKey(state), ladderUSDByTicker: process.env.LADDER_TRACE === '1' ? ladderUSDByTicker(state) : undefined, goodsUnitsByKey: goodsUnitsByKey(state), registerQtyByKind: registerQtyByKind(state), registerQtyByHolder: process.env.W5_TRACE === '1' ? registerQtyByHolder(state) : undefined };
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;
    const banks = banksOf(state.companies, r);
    out[r] = {
      treasuryAccountLocal: treasuryAccountOf(ensureV2(state), r),
      waysAndMeansLocal: waysAndMeansOf(ensureV2(state), r),
      centralBankAssetsLocal: centralBankAssetsLocal(centralBankBookLocal(ensureV2(state), r), cb, waysAndMeansOf(ensureV2(state), r), currencyOf(r), ensureV2(state).fx),
      // §3.13-SOV row 2: read from the ONE store, not the array beside it. The audit runs after
      // the whole week, so the reconcile in 11-fiscal has already run and the two agree.
      sovereignOutstandingLocal: materializeGovLadder(ensureV2(state), r).reduce((a, t) => a + t.principalLocal, 0),
      // The SAME read M6 takes at week end — every deposit class BUT the margin line, which is
      // a bank liability and not spendable money (`spendableDepositsOf`).
      bankDepositsLocal: banks.reduce((a, b) => a + spendableDepositsOf(b.bankBalanceSheet!, stateDepositLines(state, b)), 0),
      clientMarginLocal: banks.reduce((a, b) => a + (b.bankBalanceSheet!.clientMarginLocal ?? 0), 0),
      bankLoansLocal: banks.reduce((a, b) => a + loanBooksOf(b.bankBalanceSheet!, facilityBookOf(ensureV2(state), b.id)), 0),
    };
  });
  return out;
}

/** §5-WIRES W3: every firm's ladder, summed per region and kind of paper — what the wires must reproduce. */
/**
 * §3.13-BOOK d1b — THE ROWS. §3.13-READ C5 kept this one walk on `Company.debtTranches` while the
 * store was a mirror of it, on the argument that the ARRAY was the thing under test. The mirror is
 * gone: the array is materialised from the rows at the close and carries nothing of its own, so
 * the two reads were one read. What W3 tests is the store's face against the journal's wires —
 * two separate records — and a ledger operation that moved a row without writing its wire fails
 * it exactly as before.
 */
export function ladderUSDByKey(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  const v2 = ensureV2(state);
  for (const c of state.companies) {
    for (const r of ladderRowsOf(v2, c.id)) {
      const key = `${c.region}|${trancheKindOfRow(v2, r)}`;
      out[key] = (out[key] ?? 0) + v2.tranches.principalLocal[r];
    }
  }
  return out;
}

/** LADDER_TRACE=1: every firm's ladder per `ticker|kind` — the per-issuer side of W3's trace. */
export function ladderUSDByTicker(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  const v2 = ensureV2(state);
  for (const c of state.companies) {
    for (const r of ladderRowsOf(v2, c.id)) {
      const key = `${c.ticker}|${trancheKindOfRow(v2, r)}`;
      out[key] = (out[key] ?? 0) + v2.tranches.principalLocal[r];
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
  const { companyById } = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
  // A consignment is stock in its NAMED carrier's region; one the transport pool carries (no
  // ticker) passed through a source-and-sink and reappears at arrival from it.
  for (const sh of state.goodsInTransit ?? []) {
    if (!sh.carrierId) continue;
    const region = sh.carrierRegion ?? companyById.get(sh.carrierId)?.region;
    if (region) add(region, sh.subUnitId, sh.units, 2);
  }
  return out;
}
