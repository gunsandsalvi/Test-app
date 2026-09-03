/**
 * P — PRICES INSIDE ONE CAPITAL STRUCTURE, and X — PRICES ACROSS MARKETS. A price that
 * contradicts another price of the same risk is not a price. These report the contradictions
 * and their count; the identity in each message is the relation asserted.
 */

import { GameState, RegionId } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, spearman, sum } from './types';
import { marketCapOf } from '../../domain/company';
import { calculateNelsonSiegelZeroRate } from '../nelsonSiegel';
import { ensureV2 } from '../../engine2/world';
import { isTrancheKind } from '../../domain/assets';
import { trancheClearedPricePerFace } from '../credit-price';

const RATING_RANK: Record<string, number> = { AAA: 0, AA: 1, A: 2, BBB: 3, BB: 4, B: 5, CCC: 6, D: 7 };

/** P1 — seniority orders the spreads of one issuer: paper ≤ senior-secured loan ≤ senior bond ≤ subordinated. */
function p1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  let inv = 0, n = 0; const examples: string[] = [];
  state.companies.forEach((c) => {
    if (!isActiveCompany(c) || c.isBankEntity) return;
    const policy = state.regions[c.region]?.policyRate ?? 0;
    const bond = c.oasSpreadBps;
    if (!(bond > 0)) return;
    const loan = c.leveragedLoan?.discountMarginBps;
    const cp = (c.debtTranches ?? []).find((t) => t.isCommercialPaper);
    const cpSpread = cp ? ((cp.couponRate ?? 0) - policy) * 1e4 : undefined;
    const facility = (c.debtTranches ?? []).find((t) => t.isBankFacility);
    const facSpread = facility?.floatingMarginBps;
    const sub = (c.debtTranches ?? []).find((t) => t.seniority === 'SUBORDINATED' && t.rateType === 'FIXED');
    const senior = (c.debtTranches ?? []).find((t) => t.seniority === 'SENIOR' && t.rateType === 'FIXED' && !t.isCommercialPaper);
    n++;
    const bad: string[] = [];
    if (loan !== undefined && loan > bond * 1.05 + 25) bad.push(`loan ${loan}bp > bond ${bond}bp`);
    if (cpSpread !== undefined && cpSpread > bond + 25) bad.push(`paper ${cpSpread.toFixed(0)}bp > bond ${bond}bp`);
    if (facSpread !== undefined && facSpread > bond * 1.05 + 25) bad.push(`facility ${facSpread}bp > bond ${bond}bp`);
    if (sub && senior && (sub.couponRate ?? 0) < (senior.couponRate ?? 0) - 1e-4) bad.push(`sub coupon ${pct(sub.couponRate ?? 0)} < senior ${pct(senior.couponRate ?? 0)}`);
    if (bad.length) { inv++; if (examples.length < 3) examples.push(`${c.ticker}: ${bad.join(', ')}`); }
  });
  if (inv > n * 0.05) out.push({ family: 'P', check: 'P1 seniority orders the spreads', week, usd: inv, message: `${inv} of ${n} issuers price a senior claim wider than a junior one (${examples.join(' | ')})` });
  return out;
}

/** P2 — the CDS clears near the bond: basis bounded, and the recovery pricing assumes is the recovery estates deliver. */
function p2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  let wide = 0, n = 0;
  // Only names whose protection book CLEARED this week: a stale print is a quote, not a price.
  state.companies.forEach((c) => { if (!isActiveCompany(c) || !(c.cdsSpreadBps > 0) || !(c.oasSpreadBps > 0) || c.cdsClearedWeek !== state.currentWeek) return; n++; if (Math.abs(c.cdsSpreadBps - c.oasSpreadBps) > Math.max(150, c.oasSpreadBps * 0.75)) wide++; });
  if (wide > n * 0.1) out.push({ family: 'P', check: 'P2 CDS basis bounded', week, usd: wide, message: `${wide} of ${n} names carry a CDS more than 150bp or 75% away from the bond` });
  const closed = (state.estates ?? []).filter((e) => e.closedWeek !== undefined);
  if (closed.length >= 5) {
    const owed = sum(closed, (e) => sum(e.claims.filter((c) => c.seniority < 99 && c.instrumentType !== 'EQUITY'), (c) => c.principalUSD));
    const got = sum(closed, (e) => sum(e.claims.filter((c) => c.seniority < 99 && c.instrumentType !== 'EQUITY'), (c) => c.recoveredUSD));
    const rec = owed > 0 ? got / owed : NaN;
    if (Number.isFinite(rec) && Math.abs(rec - 0.4) > 0.2) out.push({ family: 'P', check: 'P2 recovery priced = recovery delivered', week, usd: rec, message: `${closed.length} closed estates paid ${pct(rec)} of debt claims; every spread is priced at 40%` });
  }
  return out;
}

/** P3 — across the universe, the spread ranks with the rating and with leverage; a defaulted firm has no price. */
function p3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const cs = state.companies.filter((c) => c.region === r && isActiveCompany(c) && !c.isBankEntity && c.oasSpreadBps > 0);
    if (cs.length < 20) return;
    const rho = spearman(cs.map((c) => c.oasSpreadBps), cs.map((c) => RATING_RANK[c.creditRating] ?? 4));
    if (rho < 0.5) out.push({ family: 'P', check: 'P3 spread ranks with rating', week, usd: rho, message: `${r}: Spearman(OAS, rating) = ${rho.toFixed(2)} over ${cs.length} names` });
    const lev = cs.filter((c) => Number.isFinite(c.leverage));
    const rhoL = spearman(lev.map((c) => c.oasSpreadBps), lev.map((c) => c.leverage));
    if (rhoL < 0.2) out.push({ family: 'P', check: 'P3 spread ranks with leverage', week, usd: rhoL, message: `${r}: Spearman(OAS, leverage) = ${rhoL.toFixed(2)} over ${lev.length} names` });
  });
  const dead = state.companies.filter((c) => c.isDefaulted && (c.stockPrice > 0.01 || marketCapOf(c) > 1e6));
  if (dead.length) out.push({ family: 'P', check: 'P3 a defaulted firm has no equity price', week, usd: sum(dead, (c) => marketCapOf(c)), message: `${dead.length} defaulted firms still print a price or a market cap (${B(sum(dead, (c) => marketCapOf(c)))})` });
  return out;
}

/** P4 — the damper is not the price: a name bound eight weeks running is a market that does not clear. */
function p4(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const streaks = state.damperBindStreakById ?? {};
  const byBook = new Map<string, number>();
  Object.entries(streaks).forEach(([k, v]) => { if ((v ?? 0) >= 8) byBook.set(k.split(':')[0], (byBook.get(k.split(':')[0]) ?? 0) + 1); });
  const total = sum([...byBook.values()], (x) => x);
  if (total) out.push({ family: 'P', check: 'P4 no name bound eight weeks', week, usd: total, message: `${total} names bound 8+ weeks: ${[...byBook.entries()].map(([b, n]) => `${b} ${n}`).join(', ')}` });
  return out;
}

/** X1 — the curve: forward rates non-negative, repo inside the corridor, deposits below policy, a solvent bank's margin positive. */
function x1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r]; if (!reg?.zeroRates) return;
    const z = reg.zeroRates;
    const pts: [number, number][] = [[0.25, z.tenor3M], [2, z.tenor2Y], [5, z.tenor5Y], [10, z.tenor10Y], [30, z.tenor30Y]];
    for (let i = 1; i < pts.length; i++) {
      const [t0, r0] = pts[i - 1], [t1, r1] = pts[i];
      const fwd = (r1 * t1 - r0 * t0) / (t1 - t0);
      if (fwd < -1e-4) out.push({ family: 'X', check: 'X1 forward rates non-negative', week, usd: fwd, message: `${r}: the ${t0}y→${t1}y forward is ${pct(fwd)}` });
    }
    const repo = reg.repoRateAnnual ?? reg.policyRate;
    if (repo > reg.policyRate + 0.015 || repo < reg.policyRate - 0.015) out.push({ family: 'X', check: 'X1 repo inside the corridor', week, usd: repo - reg.policyRate, message: `${r}: repo ${pct(repo)} against policy ${pct(reg.policyRate)}` });
    const banks = state.companies.filter((c) => c.region === r && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
    const negNim = banks.filter((b) => b.bankBalanceSheet!.bankCapitalRatio > 0.08 && b.bankBalanceSheet!.netInterestMarginPct < 0);
    if (negNim.length) out.push({ family: 'X', check: 'X1 a solvent bank earns a margin', week, usd: negNim.length, message: `${r}: ${negNim.map((b) => b.ticker).join(' ')} run a negative margin while solvent` });
    const highDep = banks.filter((b) => (b.bankBalanceSheet!.depositRateAnnual ?? 0) > reg.policyRate + 0.005);
    if (highDep.length) out.push({ family: 'X', check: 'X1 deposits pay below policy', week, usd: highDep.length, message: `${r}: ${highDep.map((b) => b.ticker).join(' ')} pay depositors above the policy rate` });
  });
  return out;
}

/** X2 — one good, one price with a wedge: the same good across regions within freight and conversion; the futures curve within carry. */
function x2(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const fx = (r: string) => { const p = state.fxPairs.find((x) => x.pair === `${state.regions[r as 'USA']?.currency}/USD`); return p ? p.rate : r === 'USA' ? 1 : undefined; };
  const subUnits = new Set<string>();
  REGION_IDS.forEach((r) => Object.keys(state.regions[r]?.categoryDemand ?? {}).forEach((s) => subUnits.add(s)));
  let wide = 0, n = 0; const examples: string[] = [];
  subUnits.forEach((su) => {
    const prices: [string, number][] = [];
    REGION_IDS.forEach((r) => { const d = state.regions[r]?.categoryDemand[su as 'apparel_retail']; const f = fx(r); if (d?.unitPriceUSD && f) prices.push([r, d.unitPriceUSD * f]); });
    if (prices.length < 2) return;
    n++;
    const lo = Math.min(...prices.map((p) => p[1])), hi = Math.max(...prices.map((p) => p[1]));
    if (hi > lo * 2.5) { wide++; if (examples.length < 3) examples.push(`${su} ${prices.map(([r, p]) => `${r} ${p.toFixed(0)}`).join('/')}`); }
  });
  if (wide > n * 0.25) out.push({ family: 'X', check: 'X2 one good, one price with a wedge', week, usd: wide, message: `${wide} of ${n} goods differ more than 2.5× across regions in one currency (${examples.join(' | ')})` });
  let badCarry = 0;
  state.commodities.forEach((c) => { if (!(c.spotPrice > 0)) return; const ratio = c.futures3M / c.spotPrice; if (ratio < 0.8 || ratio > 1.25) badCarry++; });
  if (badCarry) out.push({ family: 'X', check: 'X2 futures within carry of spot', week, usd: badCarry, message: `${badCarry} commodities' 3m future sits more than 20–25% from spot` });
  return out;
}

/**
 * P5 — THE REGISTER'S MARK AGREES WITH THE SPREAD ITS OWN BOOK CLEARED.
 *
 * A credit row carries FACE and a VALUE, and the value must be face × the price the paper's own
 * cleared spread implies. This check re-derives that price from scratch — the paper's real cash
 * flows against the region's real curve — and compares it with what the register says.
 *
 * It was written to SIZE the "credit always trades at par" defect before it was fixed, and at
 * that point it measured ~140B on ~1,000B of face. Now that `credit-marking` runs, the same
 * arithmetic is the residual: what the mark did not reach. A row the mark could not price (no
 * ladder row, no curve) keeps its old value and shows up here, which is the point.
 */
function p5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  const byId = new Map(state.companies.map((c) => [c.id, c]));
  const world = {
    issuerById: (id: string) => byId.get(id),
    regionById: (r: string) => state.regions[r as RegionId],
  };
  let faceUSD = 0, markedUSD = 0, impliedUSD = 0, rows = 0, unpriced = 0;
  let widest = { id: '', gapUSD: 0 };
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    e.itemizedHoldings.forEach((h) => {
      if (!isTrancheKind(h.instrumentType)) return;
      const face = h.faceUSD ?? h.quantityOrNotionalUSD ?? 0;
      if (!(Math.abs(face) > 0)) return;
      const price = trancheClearedPricePerFace(world, v2, h.instrumentId, week);
      if (price === undefined) { unpriced++; return; }
      faceUSD += face;
      markedUSD += h.quantityOrNotionalUSD ?? 0;
      impliedUSD += face * price;
      rows++;
      const gap = (h.quantityOrNotionalUSD ?? 0) - face * price;
      if (Math.abs(gap) > Math.abs(widest.gapUSD)) widest = { id: h.instrumentId, gapUSD: gap };
    });
  });
  const gapUSD = markedUSD - impliedUSD;
  if (rows > 0 && Math.abs(gapUSD) > 1e6) {
    out.push({ family: 'P', check: 'P5 the register marks credit at its cleared spread', week, usd: gapUSD, message: `${rows} credit rows on ${B(faceUSD)} of face are marked at ${B(markedUSD)} against ${B(impliedUSD)} implied by their own cleared spreads — a ${B(gapUSD)} gap (widest ${widest.id} by ${B(widest.gapUSD)}${unpriced ? `; ${unpriced} rows could not be priced` : ''})` });
  }
  return out;
}

/**
 * P6 — ONE CURVE, ONE ANSWER (rule 3, and step 25 owns the fix).
 *
 * A region carries its yield curve TWICE: `zeroRates` — the five tenors the books strike and
 * every consumer reads — and `yieldCurveParams`, the Nelson-Siegel fit that `stage08-back` prices
 * a new issue's coupon off and that `index-calculation` and `12-portfolio` discount with. If the
 * two disagree, a bond issued at "the cleared terms" is born away from par, because the coupon
 * was struck on one curve and the paper is valued on the other. That is not a market moving; it
 * is two answers to one question, and it feeds `P5` directly.
 *
 * Reported in basis points at the tenors both representations claim to express.
 */
function p6(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const TENORS: { years: number; key: 'tenor3M' | 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y' }[] = [
    { years: 0.25, key: 'tenor3M' }, { years: 2, key: 'tenor2Y' }, { years: 5, key: 'tenor5Y' },
    { years: 10, key: 'tenor10Y' }, { years: 30, key: 'tenor30Y' },
  ];
  const gaps: string[] = [];
  let worstBps = 0;
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg?.zeroRates || !reg.yieldCurveParams) return;
    TENORS.forEach((t) => {
      const fitted = calculateNelsonSiegelZeroRate(t.years, reg.yieldCurveParams);
      const struck = reg.zeroRates[t.key];
      const gapBps = (fitted - struck) * 10000;
      if (Math.abs(gapBps) > Math.abs(worstBps)) worstBps = gapBps;
      if (Math.abs(gapBps) > 1) gaps.push(`${r} ${t.key} ${gapBps.toFixed(1)}bp`);
    });
  });
  if (gaps.length > 0) {
    out.push({ family: 'P', check: 'P6 one curve, one answer', week, usd: Math.abs(worstBps), message: `${gaps.length} of 20 tenor points differ between the struck curve and the fitted one, worst ${worstBps.toFixed(1)}bp (${gaps.slice(0, 4).join(' | ')}) — a new issue's coupon is struck on one and the paper is valued on the other` });
  }
  return out;
}

export function auditPrices(state: GameState, week: number): AuditFinding[] {
  return [...p1(state, week), ...p2(state, week), ...p3(state, week), ...p4(state, week), ...p5(state, week), ...p6(state, week), ...x1(state, week), ...x2(state, week)];
}
