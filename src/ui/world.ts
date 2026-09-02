/**
 * AU — THE WORLD, READ-ONLY. `GameState` through typed selectors: the resolver (a typed query
 * becomes an object), the object registry's data side, and the TAPE — the UI's own recorder for
 * series the engine keeps only as a snapshot (§5-AU: no engine state grows for a view).
 *
 * Nothing here writes engine state.
 */

import { GameState, Company, InstitutionalEntity, Region, RegionId } from '../types';
import { V2World, ensureV2, rowOf, ringFill, revHistFill } from '../engine2/world';
import { bookHeadOf } from '../engine2/holdings';
import { REGION_IDS } from '../domain/geography';
import { isActiveCompany } from '../domain/company';

export type ObjectType = 'company' | 'institution' | 'region';
export interface ObjectRef { type: ObjectType; id: string }
export const refKey = (r: ObjectRef): string => `${r.type}:${r.id}`;
export const sameRef = (a: ObjectRef | undefined, b: ObjectRef | undefined): boolean =>
  !!a && !!b && a.type === b.type && a.id === b.id;

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

/** One recording per week end: the regional macro prints and every institution's book size. */
export function recordTape(tape: Tape, state: GameState): void {
  const week = state.currentWeek;
  if (tape.weeks.length > 0 && tape.weeks[tape.weeks.length - 1] === week) return;
  tape.weeks.push(week);
  const put = (key: string, v: number) => {
    let arr = tape.series.get(key);
    if (!arr) { arr = new Array(tape.weeks.length - 1).fill(NaN); tape.series.set(key, arr); }
    while (arr.length < tape.weeks.length - 1) arr.push(NaN);
    arr.push(Number.isFinite(v) ? v : NaN);
  };
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    put(`region:${r}:unemployment`, reg.unemploymentRate);
    put(`region:${r}:policy`, reg.policyRate);
    put(`region:${r}:10y`, reg.zeroRates?.tenor10Y ?? NaN);
    put(`region:${r}:2y`, reg.zeroRates?.tenor2Y ?? NaN);
    put(`region:${r}:inflation`, reg.inflation);
    put(`region:${r}:repo`, reg.repoRateAnnual);
    put(`region:${r}:bank nim`, reg.bankingSector?.netInterestMarginPct ?? NaN);
    put(`region:${r}:bank capital`, reg.bankingSector?.bankCapitalRatio ?? NaN);
  });
  state.institutionalEntities.forEach((e) => {
    put(`institution:${e.id}:assets`, e.totalAssetsUSD);
    put(`institution:${e.id}:cash`, e.cashUSD ?? NaN);
    put(`institution:${e.id}:price`, e.stockPrice);
  });
}

export function tapeSeries(world: World, key: string): { weeks: number[]; values: number[] } {
  const values = world.tape.series.get(key) ?? [];
  return { weeks: world.tape.weeks.slice(0, values.length), values };
}

// ---- the objects ----

export function companyOf(world: World, id: string): Company | undefined {
  return world.state.companies.find((c) => c.id === id);
}
export function institutionOf(world: World, id: string): InstitutionalEntity | undefined {
  return world.state.institutionalEntities.find((e) => e.id === id);
}
export function regionOf(world: World, id: string): Region | undefined {
  return world.state.regions[id as RegionId];
}

export function objectOf(world: World, ref: ObjectRef): Company | InstitutionalEntity | Region | undefined {
  if (ref.type === 'company') return companyOf(world, ref.id);
  if (ref.type === 'institution') return institutionOf(world, ref.id);
  return regionOf(world, ref.id);
}

export interface ObjectLabel { ticker: string; name: string; kind: string; region?: string }

export function labelOf(world: World, ref: ObjectRef): ObjectLabel {
  const o = objectOf(world, ref);
  if (!o) return { ticker: ref.id, name: 'gone', kind: ref.type };
  if (ref.type === 'company') {
    const c = o as Company;
    const kind = c.isBankEntity ? 'bank' : c.institutionalRole ? 'manager' : c.listingStatus === 'PRIVATE' ? 'private company' : 'company';
    return { ticker: c.ticker, name: c.name, kind, region: c.region };
  }
  if (ref.type === 'institution') {
    const e = o as InstitutionalEntity;
    return { ticker: e.ticker ?? e.id, name: e.name, kind: e.entityType.toLowerCase().replace(/_/g, ' '), region: e.region };
  }
  const r = o as Region;
  return { ticker: r.id, name: r.name, kind: 'region' };
}

/** A ticker or id anywhere on screen resolves to its object, or to nothing. */
export function refOfIdentifier(world: World, s: string | undefined | null): ObjectRef | undefined {
  if (!s) return undefined;
  const q = s.trim();
  if (!q) return undefined;
  const region = world.state.regions[q as RegionId];
  if (region) return { type: 'region', id: q };
  const byId = world.state.companies.find((c) => c.id === q) ?? world.state.companies.find((c) => c.ticker === q);
  if (byId) return { type: 'company', id: byId.id };
  const e = world.state.institutionalEntities.find((x) => x.id === q) ?? world.state.institutionalEntities.find((x) => x.ticker === q);
  if (e) return { type: 'institution', id: e.id };
  return undefined;
}

export interface SearchHit { ref: ObjectRef; label: ObjectLabel; score: number }

/** The command bar's matches: exact ticker first, then ticker prefix, then a word of the name. */
export function searchObjects(world: World, query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const consider = (ref: ObjectRef, ticker: string, name: string, gone: boolean) => {
    const t = ticker.toLowerCase(); const n = name.toLowerCase();
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 80 - (t.length - q.length);
    else if (n.startsWith(q)) score = 60;
    else if (n.split(/\s+/).some((w) => w.startsWith(q))) score = 40;
    else if (n.includes(q)) score = 20;
    if (score === 0) return;
    if (gone) score -= 30;
    hits.push({ ref, label: labelOf(world, ref), score });
  };
  REGION_IDS.forEach((r) => { const reg = world.state.regions[r]; if (reg) consider({ type: 'region', id: r }, r, reg.name, false); });
  world.state.companies.forEach((c) => consider({ type: 'company', id: c.id }, c.ticker, c.name, !isActiveCompany(c)));
  world.state.institutionalEntities.forEach((e) => consider({ type: 'institution', id: e.id }, e.ticker ?? e.id, e.name, !!e.isDefaulted));
  return hits.sort((a, b) => b.score - a.score || a.label.ticker.localeCompare(b.label.ticker)).slice(0, limit);
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
