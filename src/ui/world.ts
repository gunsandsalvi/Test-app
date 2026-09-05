/**
 * AU — THE WORLD, READ-ONLY. `GameState` through typed selectors, and the TAPE — the UI's own
 * recorder for series the engine keeps only as a snapshot (§5-AU: no engine state grows for a
 * view). Object resolution lives in `objects/` (the registry); this file knows the state.
 *
 * Nothing here writes engine state.
 */

import { GameState, Company, InstitutionalEntity, Region, RegionId } from '../types';
import { derivativesOf } from '../engine/ledger/contract-ledger';
import { loanBooksOf } from '../domain/banking';
import { entityCashOf, poolCashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf } from '../engine/ledger/accounts';
import { depositsOf } from '../domain/banking';
import { V2World, ensureV2, rowOf, ringFill, revHistFill, regionOf as regionCodeOf, typeOf, instrumentRefOf } from '../engine2/world';
import { bookHeadOf, instrumentIdAt } from '../engine2/holdings';
import { REGION_IDS } from '../domain/geography';
import { institutionTotalAssetsFromState } from '../engine/simulation/stages/institutional-balance-sheet';
import { facilityBookOf, facilitiesOfBorrower, issuerIdOf } from '../engine2/tranches';
import { registerBooks } from '../engine/ledger/holdings-ledger';
import { forEachSovereignPosition, centralBankBookLocal } from '../engine/sovereign-register';
import { asInstrumentId } from '../domain/ids';
import { isActiveCompany } from '../domain/company';
import { undueOwedByPayer, partyIdOf, reasonIdOf, CORPORATE_TAX_REASON } from '../engine/simulation/stages/settlement';
import { companyParty } from '../domain/party';
import { currencyOf } from '../domain/geography';

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
  for (const c of state.companies) { if (isActiveCompany(c)) firms++; if (c.defaultedWeek === week) defaults++; }
  put('world:active firms', firms);
  put('world:defaults', defaults);
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    put(`region:${r}:unemployment`, reg.unemploymentRate);
    put(`region:${r}:policy`, reg.policyRateAnnual);
    put(`region:${r}:10y`, reg.zeroRates.tenor10Y);
    put(`region:${r}:2y`, reg.zeroRates.tenor2Y);
    put(`region:${r}:inflation`, reg.inflationAnnual);
    put(`region:${r}:repo`, reg.repoRateAnnual);
    put(`region:${r}:gdp`, reg.derivedNominalGdpLocal);
    put(`region:${r}:wage growth`, reg.wageGrowthAnnual);
    put(`region:${r}:bank nim`, reg.bankingSector.netInterestMarginPct);
    put(`region:${r}:bank capital`, reg.bankingSector.bankCapitalRatio);
    put(`region:${r}:household deposits`, householdDepositsOf(ensureV2(state), r));
    put(`region:${r}:household net worth`, reg.householdState.netWorthLocal);
    put(`region:${r}:government revenue`, reg.governmentRevenueLocal);
    put(`region:${r}:government outlays`, reg.governmentOutlaysLocal ?? reg.governmentSpendingWeeklyLocal);
    put(`region:${r}:tightness`, reg.laborMarketTightness);
    const z = reg.zeroRates;
    { put(`curve:${r}:3M`, z.tenor3M); put(`curve:${r}:2Y`, z.tenor2Y); put(`curve:${r}:5Y`, z.tenor5Y); put(`curve:${r}:10Y`, z.tenor10Y); put(`curve:${r}:30Y`, z.tenor30Y); }
    const cb = reg.centralBankSheet;
    if (cb) {
      put(`centralbank:${r}:treasury account`, treasuryAccountOf(ensureV2(state), r));
      put(`centralbank:${r}:sovereign book`, centralBankBookLocal(ensureV2(state), r));
      put(`centralbank:${r}:currency`, cb.currencyInCirculationLocal);
      put(`centralbank:${r}:foreign claims`, cb.foreignOfficialClaimsUSD);
      put(`centralbank:${r}:reserves`, state.companies.reduce((a, c) => a + (c.isBankEntity && c.bankBalanceSheet && c.region === r ? bankReservesOf(ensureV2(state), c.id) : 0), 0));
    }
    Object.entries(reg.categoryDemand).forEach(([su, d]) => {
      if (!d) return;
      put(`market:${r}:${su}:price`, d.unitPriceLocal);
      put(`market:${r}:${su}:supplied`, d.totalUnitsSuppliedThisWeek);
      put(`market:${r}:${su}:demanded`, d.totalUnitsDemandedThisWeek);
      put(`market:${r}:${su}:demand usd`, d.demandLevelAnnualLocal);
    });
    (reg.smePools).forEach((p) => {
      put(`pool:${r}:${p.industry}:revenue`, p.annualRevenueLocal);
      put(`pool:${r}:${p.industry}:margin`, p.marginPct);
      put(`pool:${r}:${p.industry}:employment`, p.employment);
      put(`pool:${r}:${p.industry}:default rate`, p.defaultRateAnnualPct);
      put(`pool:${r}:${p.industry}:cash`, poolCashOf(ensureV2(state), r, p.industry));
    });
    (reg.householdState.cohorts ?? []).forEach((c) => {
      const k = `cohort:${r}:${c.occupation}:${c.tier}`;
      put(`${k}:budget`, c.consumptionBudgetLocal);
      put(`${k}:disposable income`, c.disposableIncomeLocal);
      put(`${k}:employed`, c.employedCount);
      put(`${k}:savings`, c.savingsLocal);
    });
    Object.entries(reg.occupationPools).forEach(([occ, p]) => {
      put(`occupation:${r}:${occ}:wage index`, p.wageIndex);
      put(`occupation:${r}:${occ}:employed`, p.employed);
      put(`occupation:${r}:${occ}:vacancies`, p.vacancies);
    });
  });
  state.institutionalEntities.forEach((e) => {
    put(`institution:${e.id}:assets`, institutionTotalAssetsFromState(state, e));
    put(`institution:${e.id}:cash`, entityCashOf(ensureV2(state), e));
    put(`institution:${e.id}:price`, e.stockPrice);
    put(`institution:${e.id}:equity`, e.equityCapitalLocal);
  });
  state.companies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet) return;
    const s = c.bankBalanceSheet;
    put(`bank:${c.id}:capital ratio`, s.bankCapitalRatio);
    put(`bank:${c.id}:nim`, s.netInterestMarginPct);
    put(`bank:${c.id}:deposits`, depositsOf(s, stateDepositLines(state, c)));
    put(`bank:${c.id}:reserves`, bankReservesOf(ensureV2(state), c.id));
    put(`bank:${c.id}:central bank loan`, s.centralBankLoanLocal ?? 0);
    put(`bank:${c.id}:loans`, loanBooksOf(s, facilityBookOf(ensureV2(state), c.id)));
  });
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
export function companyRatingHistory(world: World, id: string): number[] {
  return ringFill(world.v2.ratingRing, rowOf(world.v2, id), []);
}
export function companyRevenueHistory(world: World, id: string): number[] {
  return revHistFill(world.v2, rowOf(world.v2, id), []);
}

// ---- the register ----

interface RegisterRow { holderId: string; instrumentId: string; instrumentType: string; region: string; usd: number; shares: number }

/** Every register row an institution holds. */
export function bookOf(world: World, entityId: string): RegisterRow[] {
  const H = world.v2.holdings;
  const out: RegisterRow[] = [];
  for (let r = bookHeadOf(world.v2, entityId); r >= 0; r = H.next[r]) {
    out.push({
      holderId: entityId,
      instrumentId: instrumentIdAt(world.v2, r),
      instrumentType: typeOf(world.v2, H.typeRef[r]),
      region: regionCodeOf(world.v2, H.regionRef[r]),
      usd: H.qtyLocal[r],
      shares: H.shares[r],
    });
  }
  return out;
}

/**
 * Every register row that names an instrument — the holders of one company's paper (13b: a row
 * names a tranche or its issuer; the company's paper is every row that resolves to it).
 *
 * §9.13-EQUITY: EVERY BOOK THE REGISTER HOLDS, which since that step includes the HOUSEHOLD
 * SECTOR's. This walked the institutions alone, so the view of a company's shareholders left out
 * the largest holder of nearly every one of them and had to explain the gap in prose ("households
 * and the float hold the rest") — two names for one absence. The desks are added beside it, from
 * the banks that carry them: 13e and §9.13-CREDIT row 2 settled that they are holders of record,
 * and this view had been contradicting the payments it is a view of.
 */
export function holdersOf(world: World, instrumentId: string): RegisterRow[] {
  const out: RegisterRow[] = [];
  const ref = instrumentRefOf(world.v2, asInstrumentId(instrumentId));
  if (ref < 0) return out;
  const H = world.v2.holdings;
  registerBooks(world.state.institutionalEntities.map((e) => e.id), world.state.companies).forEach((b) => {
    for (let r = bookHeadOf(world.v2, b.id); r >= 0; r = H.next[r]) {
      if (H.instrRef[r] !== ref && issuerIdOf(world.v2, instrumentIdAt(world.v2, r)) !== instrumentId) continue;
      out.push({
        holderId: b.id,
        instrumentId: instrumentIdAt(world.v2, r),
        instrumentType: typeOf(world.v2, H.typeRef[r]),
        region: regionCodeOf(world.v2, H.regionRef[r]),
        usd: H.qtyLocal[r],
        shares: H.shares[r],
      });
    }
  });
  // §3.13-BOOK d3d: the desks' books are register books (`registerBooks` lists them), so they
  // are in the walk above under their securities-party id.
  return out;
}

/**
 * The holders of a region's sovereign paper, by holder.
 *
 * §9.13-OUTSIDE: EVERY store that keeps one (`engine/sovereign-register.ts`), not the register
 * alone. This walked the institutions only — so the view of who owns a government's debt left out
 * the banks, their desks, the central bank and the companies' treasuries, which between them hold
 * most of it, and showed no sign that it had.
 */
export function sovereignHoldersOf(world: World, regionId: string): { holderId: string; usd: number }[] {
  const out = new Map<string, number>();
  forEachSovereignPosition(world.v2, world.state, regionId as RegionId, (p) => {
    if (p.faceLocal <= 0) return;
    const key = p.holderClass === 'CENTRAL_BANK' ? `central bank · ${regionId.toLowerCase()}`
      : p.holderClass === 'DESK' ? `${p.holderKey} · desk`
        : p.holderKey;
    out.set(key, (out.get(key) ?? 0) + p.faceLocal);
  });
  return [...out.entries()].map(([holderId, usd]) => ({ holderId, usd })).sort((a, b) => b.usd - a.usd);
}

/** The bank lines to one borrower — its facility rows, seen from each lender (step 10). */
export function bankLinesTo(world: World, borrowerId: string): { bankId: string; principalLocal: number; marginBps: number; maturityWeek: number; status: string }[] {
  return facilitiesOfBorrower(world.v2, borrowerId).map((f) => ({
    bankId: f.bankId, principalLocal: f.principalLocal, marginBps: f.marginBps, maturityWeek: f.maturityWeek, status: 'PERFORMING',
  }));
}

/** The derivative contracts a party is on either side of. */
export function contractsOf(world: World, party: { kind: string; key: string }): import('../domain/derivatives/contract').DerivativeContract[] {
  const same = (p: { kind: string; ticker?: string; id?: string; region?: string }) =>
    (p.kind === party.kind || (party.kind === 'BANK' && (p.kind === 'BANK' || p.kind === 'BANK_SECURITIES' || p.kind === 'BANK_CREDIT')))
    && ((p.ticker ?? p.id ?? p.region) === party.key);
  return derivativesOf(world.v2).filter((k) => same(k.a as never) || same(k.b as never));
}

/**
 * §3.15-v — A firm's tax accrued and not yet paid: the dated wires to the treasury still in the
 * payment journal. A READ: the party's and the reason's ids are looked up, never interned — a
 * render used to call `partyId` and `internReason`, which add a row to the engine's tables on
 * first sight, so looking at a statement could grow the model (atlas E3). A party or a reason the
 * ledgers have never seen owes nothing.
 */
export function unpaidTaxesOf(world: World, c: Company): number {
  const j = world.state.pendingPaymentJournal;
  if (!j) return 0;
  const payer = partyIdOf(companyParty(c));
  const reason = reasonIdOf(CORPORATE_TAX_REASON);
  if (payer === undefined || reason === undefined) return 0;
  return undueOwedByPayer(j, payer, reason, world.state.currentWeek, currencyOf(c.region), ensureV2(world.state).fx);
}
