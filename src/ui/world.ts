/**
 * AU — THE WORLD, READ-ONLY. `GameState` through typed selectors, and the TAPE — the UI's own
 * recorder for series the engine keeps only as a snapshot (§5-AU: no engine state grows for a
 * view). Object resolution lives in `objects/` (the registry); this file knows the state.
 *
 * Nothing here writes engine state.
 */

import { GameState, Company, InstitutionalEntity, Region, RegionId } from '../types';
import { loanBooksOf } from '../domain/banking';
import { entityCashOf, poolCashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf } from '../engine/ledger/accounts';
import { depositsOf } from '../domain/banking';
import { V2World, ensureV2, rowOf, ringFill, revHistFill } from '../engine2/world';
import { bookHeadOf } from '../engine2/holdings';
import { REGION_IDS } from '../domain/geography';
import { institutionTotalAssetsFromState } from '../engine/simulation/stages/institutional-balance-sheet';

export type { ObjectRef, ObjectType, ObjectLabel, Series } from './types';
export { refKey, sameRef } from './types';

/** Series the engine keeps only as a snapshot, recorded by the UI each week. */
export interface Tape {
  weeks: number[];
  series: Map<string, number[]>;
}

export interface World {
  state: GameState;
  v2: V2World;
  tape: Tape;
}

export function newTape(): Tape { return { weeks: [], series: new Map() }; }

export function worldOf(state: GameState, tape: Tape): World {
  return { state, v2: ensureV2(state), tape };
}

/** The week shown on screen: the engine's count less the burn-in the world was handed over with. */
export const displayWeek = (state: GameState, week?: number): number =>
  (week ?? state.currentWeek) - (state.burnInWeeks ?? 0);

/** One recording per week end: the regional prints, every market, pool, cohort, occupation,
 *  curve tenor, central bank line, bank and institution the engine keeps only as a snapshot. */
export function recordTape(tape: Tape, state: GameState): void {
  const week = state.currentWeek;
  if (tape.weeks.length > 0 && tape.weeks[tape.weeks.length - 1] === week) return;
  tape.weeks.push(week);
  const put = (key: string, v: number | undefined) => {
    let arr = tape.series.get(key);
    if (!arr) { arr = new Array(tape.weeks.length - 1).fill(NaN); tape.series.set(key, arr); }
    while (arr.length < tape.weeks.length - 1) arr.push(NaN);
    arr.push(v !== undefined && Number.isFinite(v) ? v : NaN);
  };
  let firms = 0; let defaults = 0;
  for (const c of state.companies) { if (!c.isDefaulted && !c.mergerAcquired) firms++; if (c.defaultedWeek === week) defaults++; }
  put('world:active firms', firms);
  put('world:defaults', defaults);
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    put(`region:${r}:unemployment`, reg.unemploymentRate);
    put(`region:${r}:policy`, reg.policyRate);
    put(`region:${r}:10y`, reg.zeroRates?.tenor10Y);
    put(`region:${r}:2y`, reg.zeroRates?.tenor2Y);
    put(`region:${r}:inflation`, reg.inflation);
    put(`region:${r}:repo`, reg.repoRateAnnual);
    put(`region:${r}:gdp`, reg.derivedNominalGdpUSD ?? reg.estimatedNominalGdpUSD);
    put(`region:${r}:wage growth`, reg.wageGrowth);
    put(`region:${r}:bank nim`, reg.bankingSector?.netInterestMarginPct);
    put(`region:${r}:bank capital`, reg.bankingSector?.bankCapitalRatio);
    put(`region:${r}:household deposits`, householdDepositsOf(ensureV2(state), r));
    put(`region:${r}:household net worth`, reg.householdState?.netWorthUSD);
    put(`region:${r}:government revenue`, reg.governmentRevenueUSD);
    put(`region:${r}:government outlays`, reg.governmentOutlaysUSD ?? reg.governmentSpendingWeeklyUSD);
    put(`region:${r}:tightness`, reg.laborMarketTightness);
    const z = reg.zeroRates;
    if (z) { put(`curve:${r}:3M`, z.tenor3M); put(`curve:${r}:2Y`, z.tenor2Y); put(`curve:${r}:5Y`, z.tenor5Y); put(`curve:${r}:10Y`, z.tenor10Y); put(`curve:${r}:30Y`, z.tenor30Y); }
    const cb = reg.centralBankSheet;
    if (cb) {
      put(`centralbank:${r}:treasury account`, treasuryAccountOf(ensureV2(state), r));
      put(`centralbank:${r}:sovereign book`, Object.values(cb.sovereignHoldingsByTenor ?? {}).reduce((a, v) => a + (Number(v) || 0), 0));
      put(`centralbank:${r}:currency`, cb.currencyInCirculationUSD);
      put(`centralbank:${r}:foreign claims`, cb.foreignOfficialClaimsUSD);
      put(`centralbank:${r}:reserves`, reg.bankingSector?.centralBankReservesUSD);
    }
    Object.entries(reg.categoryDemand).forEach(([su, d]) => {
      if (!d) return;
      put(`market:${r}:${su}:price`, d.unitPriceUSD);
      put(`market:${r}:${su}:supplied`, d.totalUnitsSuppliedThisWeek);
      put(`market:${r}:${su}:demanded`, d.totalUnitsDemandedThisWeek);
      put(`market:${r}:${su}:demand usd`, d.demandLevelAnnualUSD);
    });
    (reg.smePools ?? []).forEach((p) => {
      put(`pool:${r}:${p.industry}:revenue`, p.annualRevenueUSD);
      put(`pool:${r}:${p.industry}:margin`, p.marginPct);
      put(`pool:${r}:${p.industry}:employment`, p.employment);
      put(`pool:${r}:${p.industry}:default rate`, p.defaultRateAnnualPct);
      put(`pool:${r}:${p.industry}:cash`, poolCashOf(ensureV2(state), r, p.industry));
    });
    (reg.householdState?.cohorts ?? []).forEach((c) => {
      const k = `cohort:${r}:${c.occupation}:${c.tier}`;
      put(`${k}:budget`, c.consumptionBudgetUSD);
      put(`${k}:disposable income`, c.disposableIncomeUSD);
      put(`${k}:employed`, c.employedCount);
      put(`${k}:savings`, c.savingsUSD);
    });
    Object.entries(reg.occupationPools ?? {}).forEach(([occ, p]) => {
      put(`occupation:${r}:${occ}:wage index`, p.wageIndex);
      put(`occupation:${r}:${occ}:employed`, p.employed);
      put(`occupation:${r}:${occ}:vacancies`, p.vacancies);
    });
  });
  state.institutionalEntities.forEach((e) => {
    put(`institution:${e.id}:assets`, institutionTotalAssetsFromState(state, e));
    put(`institution:${e.id}:cash`, entityCashOf(ensureV2(state), e));
    put(`institution:${e.id}:price`, e.stockPrice);
    put(`institution:${e.id}:equity`, e.equityCapitalUSD);
  });
  state.companies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet) return;
    const s = c.bankBalanceSheet;
    put(`bank:${c.id}:capital ratio`, s.bankCapitalRatio);
    put(`bank:${c.id}:nim`, s.netInterestMarginPct);
    put(`bank:${c.id}:deposits`, depositsOf(s, stateDepositLines(state, c.ticker)) - (s.clientMarginUSD ?? 0));
    put(`bank:${c.id}:reserves`, bankReservesOf(ensureV2(state), c.ticker));
    put(`bank:${c.id}:central bank loan`, s.centralBankLoanUSD ?? 0);
    put(`bank:${c.id}:loans`, loanBooksOf(s));
  });
  const boundByBook = new Map<string, number>();
  (state.lastWeekDamperBoundIds ?? []).forEach((id) => { const book = id.split(':')[0]; boundByBook.set(book, (boundByBook.get(book) ?? 0) + 1); });
  boundByBook.forEach((n, book) => put(`book:${book}:bound`, n));
  put('world:bound', (state.lastWeekDamperBoundIds ?? []).length);
}

export function tapeSeries(world: World, key: string): { weeks: number[]; values: number[] } {
  const values = world.tape.series.get(key) ?? [];
  return { weeks: world.tape.weeks.slice(0, values.length), values };
}

// ---- the objects the state holds directly ----

export function companyOf(world: World, id: string): Company | undefined {
  return world.state.companies.find((c) => c.id === id);
}
export function institutionOf(world: World, id: string): InstitutionalEntity | undefined {
  return world.state.institutionalEntities.find((e) => e.id === id);
}
export function regionOf(world: World, id: string): Region | undefined {
  return world.state.regions[id as RegionId];
}

// ---- histories the engine keeps ----

export function companyPriceHistory(world: World, id: string): number[] {
  return ringFill(world.v2.priceRing, rowOf(world.v2, id), []);
}
export function companyOasHistory(world: World, id: string): number[] {
  return ringFill(world.v2.oasRing, rowOf(world.v2, id), []);
}
export function companyRatingHistory(world: World, id: string): number[] {
  return ringFill(world.v2.ratingRing, rowOf(world.v2, id), []);
}
export function companyRevenueHistory(world: World, id: string): number[] {
  return revHistFill(world.v2, rowOf(world.v2, id), []);
}

// ---- the register ----

export interface RegisterRow { holderId: string; instrumentId: string; instrumentType: string; region: string; usd: number; shares: number }

/** Every register row an institution holds. */
export function bookOf(world: World, entityId: string): RegisterRow[] {
  const H = world.v2.holdings;
  const out: RegisterRow[] = [];
  for (let r = bookHeadOf(world.v2, entityId); r >= 0; r = H.next[r]) {
    out.push({
      holderId: entityId,
      instrumentId: world.v2.internedStrings[H.instrRef[r]],
      instrumentType: world.v2.internedStrings[H.typeRef[r]],
      region: world.v2.internedStrings[H.regionRef[r]],
      usd: H.qtyUSD[r],
      shares: H.shares[r],
    });
  }
  return out;
}

/** Every register row that names an instrument — the holders of one company's paper. */
export function holdersOf(world: World, instrumentId: string): RegisterRow[] {
  const out: RegisterRow[] = [];
  const ref = world.v2.internedIdByString.get(instrumentId);
  if (ref === undefined) return out;
  const H = world.v2.holdings;
  world.state.institutionalEntities.forEach((e) => {
    for (let r = bookHeadOf(world.v2, e.id); r >= 0; r = H.next[r]) {
      if (H.instrRef[r] !== ref) continue;
      out.push({
        holderId: e.id,
        instrumentId,
        instrumentType: world.v2.internedStrings[H.typeRef[r]],
        region: world.v2.internedStrings[H.regionRef[r]],
        usd: H.qtyUSD[r],
        shares: H.shares[r],
      });
    }
  });
  return out;
}

/** The holders of a region's sovereign paper, by holder. */
export function sovereignHoldersOf(world: World, regionId: string): { holderId: string; usd: number }[] {
  const H = world.v2.holdings;
  const govRef = world.v2.internedIdByString.get('GOV_BOND');
  const regRef = world.v2.internedIdByString.get(regionId);
  const out = new Map<string, number>();
  if (govRef === undefined || regRef === undefined) return [];
  world.state.institutionalEntities.forEach((e) => {
    for (let r = bookHeadOf(world.v2, e.id); r >= 0; r = H.next[r]) {
      if (H.typeRef[r] !== govRef || H.regionRef[r] !== regRef) continue;
      out.set(e.id, (out.get(e.id) ?? 0) + H.qtyUSD[r]);
    }
  });
  return [...out.entries()].map(([holderId, usd]) => ({ holderId, usd })).sort((a, b) => b.usd - a.usd);
}

/** The bank lines to one borrower, across every bank's book. */
export function bankLinesTo(world: World, borrowerId: string): { bankId: string; principalUSD: number; marginBps: number; maturityWeek: number; status: string }[] {
  const out: { bankId: string; principalUSD: number; marginBps: number; maturityWeek: number; status: string }[] = [];
  world.state.companies.forEach((b) => {
    const sheet = b.bankBalanceSheet;
    if (!b.isBankEntity || !sheet) return;
    (sheet.businessLoans ?? []).forEach((l) => {
      if (l.borrowerId !== borrowerId) return;
      out.push({ bankId: b.id, principalUSD: l.principalUSD, marginBps: l.marginBps, maturityWeek: l.originationWeek + l.termWeeks, status: l.status });
    });
  });
  return out;
}

/** The derivative contracts a party is on either side of. */
export function contractsOf(world: World, party: { kind: string; key: string }): import('../domain/derivatives/contract').DerivativeContract[] {
  const same = (p: { kind: string; ticker?: string; id?: string; region?: string }) =>
    (p.kind === party.kind || (party.kind === 'BANK' && (p.kind === 'BANK' || p.kind === 'BANK_SECURITIES' || p.kind === 'BANK_CREDIT')))
    && ((p.ticker ?? p.id ?? p.region) === party.key);
  return (world.state.derivativesBook ?? []).filter((k) => same(k.a as never) || same(k.b as never));
}
