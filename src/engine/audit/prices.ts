/**
 * P — PRICES INSIDE ONE CAPITAL STRUCTURE, and X — PRICES ACROSS MARKETS. A price that
 * contradicts another price of the same risk is not a price. These report the contradictions
 * and their count; the identity in each message is the relation asserted.
 */

import { GameState } from '../../types';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { AuditFinding, B, pct, spearman, sum } from './types';
import { marketCapOf } from '../../domain/company';
import { priceFromSpreadBps } from '../../domain/pricing';

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
 * P5 — CREDIT IS MARKED AT PAR, AND THIS IS WHAT THAT COSTS.
 *
 * `holdings-ledger.ts`'s `priceOf` returns `priceUSD = 1` for every notional instrument, so a
 * credit holding is worth its face whatever the market said. The books DO clear a spread — an OAS
 * on a bond, a discount margin on a loan — and `domain/pricing` turns that spread into the price
 * it implies. The gap between the two, summed over every ladder, is the mismarking the whole of
 * step 13 exists to remove: a bond whose issuer's spread doubled is still carried at 100.
 *
 * Reported as a SIZE, not a pass/fail: it is a defect the plan already owns, and what a check can
 * add is how big it is and which way it points, so the fix can be judged against it.
 *
 * TWO THINGS THE READER SHOULD KNOW ABOUT THE TAIL. A floater is compared against its ISSUER's
 * cleared discount margin, because that is the only cleared margin there is — so a tranche whose
 * own locked margin is far above it prices far above par, and the widest of those trace straight
 * back to `P1`'s inverted spreads (a 5540bp facility against a 1011bp bond). They are a handful
 * of small tranches and they do not move the aggregate; the aggregate is the discount the whole
 * book carries. And the direction is the honest one: spreads widened, so the book is worth LESS
 * than the par it is marked at.
 */
function p5(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  let faceUSD = 0, valueUSD = 0, priced = 0;
  let widest = { id: '', price: 1, faceUSD: 0 };
  REGION_IDS.forEach((r) => {
    const curve = state.regions[r]?.zeroRates;
    if (!curve) return;
    state.companies.forEach((c) => {
      if (c.region !== r || !isActiveCompany(c)) return;
      (c.debtTranches ?? []).forEach((t) => {
        if (t.isBankFacility || !(t.principalUSD > 0)) return;
        const weeksToMaturity = t.maturityWeek - week;
        if (!(weeksToMaturity > 0)) return;
        const isFloating = t.rateType === 'FLOATING';
        const spreadBps = isFloating
          ? (c.leveragedLoan?.discountMarginBps ?? t.floatingMarginBps ?? 0)
          : (c.oasSpreadBps ?? 0);
        const annualCouponRate = isFloating
          ? (state.regions[r].policyRate + (t.floatingMarginBps ?? 0) / 10000)
          : (t.couponRate ?? 0);
        // Commercial paper pays once, at maturity; everything else on its own period.
        const periodWeeks = t.isCommercialPaper ? Math.max(1, weeksToMaturity) : 26;
        const price = priceFromSpreadBps({ annualCouponRate, periodWeeks, weeksToMaturity }, curve, spreadBps);
        if (!(price > 0) || !isFinite(price)) return;
        faceUSD += t.principalUSD;
        valueUSD += t.principalUSD * price;
        priced++;
        if (Math.abs(price - 1) > Math.abs(widest.price - 1)) widest = { id: t.id, price, faceUSD: t.principalUSD };
      });
    });
  });
  if (priced > 0 && Math.abs(valueUSD - faceUSD) > 1e6) {
    out.push({ family: 'P', check: 'P5 credit is marked at par', week, usd: valueUSD - faceUSD, message: `${priced} tranches carrying ${B(faceUSD)} of face are worth ${B(valueUSD)} at their own cleared spreads — the register marks every one of them at par, a ${B(valueUSD - faceUSD)} mismark (widest ${widest.id} at ${widest.price.toFixed(3)} on ${B(widest.faceUSD)})` });
  }
  return out;
}

export function auditPrices(state: GameState, week: number): AuditFinding[] {
  return [...p1(state, week), ...p2(state, week), ...p3(state, week), ...p4(state, week), ...p5(state, week), ...x1(state, week), ...x2(state, week)];
}
