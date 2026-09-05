/**
 * P — PRICES INSIDE ONE CAPITAL STRUCTURE, and X — PRICES ACROSS MARKETS. A price that
 * contradicts another price of the same risk is not a price. These report the contradictions
 * and their count; the identity in each message is the relation asserted.
 */

import { GameState } from '../../types';
import { marketCapAt } from '../../engine2/instruments';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany, banksOf } from '../../domain/company';
import { AuditFinding, B, pct, spearman, sum, floatDust, floatDustLocal } from './types';
import { calculateNelsonSiegelZeroRate } from '../nelsonSiegel';
import { ensureV2, typeOf } from '../../engine2/world';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../../engine2/holdings';
import { isTrancheKind } from '../../domain/assets';
import { trancheClearedPricePerFace, issuerSpreadAtOnCurve, IS_LOAN_ROW } from '../credit-price';
import { materializeGovLadder, ladderRowsOf, TR_SUBORDINATED, TR_CP, TR_FACILITY } from '../../engine2/tranches';

import { STANDARD_CORP_TENOR_YEARS } from '../../domain/primary-market';
import { CDS_TENORS, CDS_TENOR_YEARS } from '../../domain/derivatives/classes/cds';
import { clearedPriceOf } from '../../engine2/prices';
import { asInstrumentId } from '../../domain/ids';

const RATING_RANK: Record<string, number> = { AAA: 0, AA: 1, A: 2, BBB: 3, BB: 4, B: 5, CCC: 6, D: 7 };

/** The maturity every cross-name and cross-rank spread comparison is taken at: one point on each
 *  issuer's own curve, so a ranking ranks credit and not tenor. Five years is where this model's
 *  corporate paper is brought (`STANDARD_CORP_TENOR_YEARS`) and where its CDS strikes. */
const P1_COMPARISON_TENOR_YEARS = STANDARD_CORP_TENOR_YEARS;

/**
 * P1 — seniority orders the spreads of one issuer: paper ≤ senior-secured loan ≤ senior bond ≤
 * subordinated.
 *
 * §3.13: the two BOND legs are now read at the SAME MATURITY off that issuer's own cleared prices
 * — a five-year senior against a five-year subordinated, which is the only comparison a seniority
 * claim is about. It used to read one issuer-level number for the senior leg and a stored field
 * for the junior one, so the test could not tell a rank difference from a maturity difference.
 */
function p1(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  let inv = 0, n = 0; const examples: string[] = [];
  state.companies.forEach((c) => {
    if (!isActiveCompany(c) || c.isBankEntity) return;
    const reg = state.regions[c.region];
    if (!reg) return;
    const policy = reg.policyRate ?? 0;
    const at = (rank: number) => issuerSpreadAtOnCurve(v2, reg, c.id, week, P1_COMPARISON_TENOR_YEARS,
      (flags) => ((flags & TR_SUBORDINATED) !== 0) === (rank === 1))?.spreadBps;
    const bond = at(0);
    if (bond === undefined || !(bond > 0)) return;
    // §3.13 row 3: the loan leg is that borrower's own five-year LOAN point, off its own loans'
    // cleared prices — the same maturity as the bond leg above, which is what makes the two
    // comparable at all.
    const loan = issuerSpreadAtOnCurve(v2, reg, c.id, week, P1_COMPARISON_TENOR_YEARS, IS_LOAN_ROW)?.spreadBps;
    // §3.13-BOOK d1b: the ladder's rows, not the array.
    const rows = ladderRowsOf(v2, c.id);
    const TS = v2.tranches;
    const cp = rows.find((r) => (TS.flags[r] & TR_CP) !== 0);
    const cpSpread = cp !== undefined ? ((Number.isNaN(TS.couponRate[cp]) ? 0 : TS.couponRate[cp]) - policy) * 1e4 : undefined;
    const facility = rows.find((r) => (TS.flags[r] & TR_FACILITY) !== 0);
    const facSpread = facility !== undefined && !Number.isNaN(TS.floatingMarginBps[facility]) ? TS.floatingMarginBps[facility] : undefined;
    const subSpread = at(1);
    n++;
    const bad: string[] = [];
    if (loan !== undefined && loan > bond * 1.05 + 25) bad.push(`loan ${loan}bp > bond ${bond}bp`);
    if (cpSpread !== undefined && cpSpread > bond + 25) bad.push(`paper ${cpSpread.toFixed(0)}bp > bond ${bond}bp`);
    if (facSpread !== undefined && facSpread > bond * 1.05 + 25) bad.push(`facility ${facSpread}bp > bond ${bond}bp`);
    // The real test, and the one §3.33 says must fail while the estate ignores subordination:
    // the market should charge MORE for the junior claim on the same borrower at the same date.
    if (subSpread !== undefined && subSpread < bond - 1e-6) bad.push(`sub ${subSpread.toFixed(0)}bp < senior ${bond.toFixed(0)}bp`);
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
  const v2 = ensureV2(state);
  state.companies.forEach((c) => {
    const reg = state.regions[c.region];
    if (!isActiveCompany(c) || !reg || c.cdsSpreadBps === undefined || !(c.cdsSpreadBps > 0) || c.cdsClearedWeek !== state.currentWeek) return;
    // §3.13: the cash leg of a basis is that issuer's own bond at the SAME point on its curve,
    // read off the price it cleared at — §3.17d-iii: at every tenor the protection book printed.
    // A name with no printed bond has no basis to test.
    const curve = reg.cdsSpreadHistoryByIssuer?.[c.id];
    CDS_TENORS.forEach((tenor) => {
      const hist = curve?.[tenor];
      const cds = hist?.[hist.length - 1];
      if (!(cds !== undefined && cds > 0)) return;
      const cash = issuerSpreadAtOnCurve(v2, reg, c.id, week, CDS_TENOR_YEARS[tenor])?.spreadBps;
      if (cash === undefined || !(cash > 0)) return;
      n++;
      if (Math.abs(cds - cash) > Math.max(150, cash * 0.75)) wide++;
    });
  });
  if (wide > n * 0.1) out.push({ family: 'P', check: 'P2 CDS basis bounded', week, usd: wide, message: `${wide} of ${n} name-tenors carry a CDS more than 150bp or 75% away from the bond at the same point` });
  const closed = (state.estates ?? []).filter((e) => e.closedWeek !== undefined);
  if (closed.length >= 5) {
    const owed = sum(closed, (e) => sum(e.claims.filter((c) => c.seniority < 99 && c.instrumentType !== 'EQUITY'), (c) => c.principalLocal));
    const got = sum(closed, (e) => sum(e.claims.filter((c) => c.seniority < 99 && c.instrumentType !== 'EQUITY'), (c) => c.recoveredLocal));
    const rec = owed > 0 ? got / owed : NaN;
    if (Number.isFinite(rec) && Math.abs(rec - 0.4) > 0.2) out.push({ family: 'P', check: 'P2 recovery priced = recovery delivered', week, usd: rec, message: `${closed.length} closed estates paid ${pct(rec)} of debt claims; every spread is priced at 40%` });
  }
  return out;
}

/** P3 — across the universe, the spread ranks with the rating and with leverage; a defaulted firm has no price. */
function p3(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    // §3.13: each name's representative level is the five-year point on its OWN credit curve —
    // the same maturity for every name, so the ranking is a ranking of credit and not of tenor.
    const cs = state.companies
      .filter((c) => c.region === r && isActiveCompany(c) && !c.isBankEntity)
      .map((c) => ({ c, oas: issuerSpreadAtOnCurve(ensureV2(state), reg, c.id, week, P1_COMPARISON_TENOR_YEARS)?.spreadBps ?? 0 }))
      .filter((x) => x.oas > 0);
    if (cs.length < 20) return;
    const rho = spearman(cs.map((x) => x.oas), cs.map((x) => RATING_RANK[x.c.creditRating] ?? 4));
    if (rho < 0.5) out.push({ family: 'P', check: 'P3 spread ranks with rating', week, usd: rho, message: `${r}: Spearman(OAS, rating) = ${rho.toFixed(2)} over ${cs.length} names` });
    const lev = cs.filter((x) => Number.isFinite(x.c.leverage));
    const rhoL = spearman(lev.map((x) => x.oas), lev.map((x) => x.c.leverage));
    if (rhoL < 0.2) out.push({ family: 'P', check: 'P3 spread ranks with leverage', week, usd: rhoL, message: `${r}: Spearman(OAS, leverage) = ${rhoL.toFixed(2)} over ${lev.length} names` });
  });
  const dead = state.companies.filter((c) => c.isDefaulted && (c.stockPrice > 0.01 || marketCapAt(ensureV2(state), c) > 1e6));
  if (dead.length) out.push({ family: 'P', check: 'P3 a defaulted firm has no equity price', week, usd: sum(dead, (c) => marketCapAt(ensureV2(state), c)), message: `${dead.length} defaulted firms still print a price or a market cap (${B(sum(dead, (c) => marketCapAt(ensureV2(state), c)))})` });
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
      if (fwd < -floatDust(Math.abs(r1 * t1) + Math.abs(r0 * t0), 4) / (t1 - t0)) out.push({ family: 'X', check: 'X1 forward rates non-negative', week, usd: fwd, message: `${r}: the ${t0}y→${t1}y forward is ${pct(fwd)}` });
    }
    const repo = reg.repoRateAnnual ?? reg.policyRate;
    if (repo > reg.policyRate + 0.015 || repo < reg.policyRate - 0.015) out.push({ family: 'X', check: 'X1 repo inside the corridor', week, usd: repo - reg.policyRate, message: `${r}: repo ${pct(repo)} against policy ${pct(reg.policyRate)}` });
    const banks = banksOf(state.companies, r);
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
    REGION_IDS.forEach((r) => { const d = state.regions[r]?.categoryDemand[su as 'apparel_retail']; const f = fx(r); if (d?.unitPriceLocal && f) prices.push([r, d.unitPriceLocal * f]); });
    if (prices.length < 2) return;
    n++;
    const lo = Math.min(...prices.map((p) => p[1])), hi = Math.max(...prices.map((p) => p[1]));
    if (hi > lo * 2.5) { wide++; if (examples.length < 3) examples.push(`${su} ${prices.map(([r, p]) => `${r} ${p.toFixed(0)}`).join('/')}`); }
  });
  if (wide > n * 0.25) out.push({ family: 'X', check: 'X2 one good, one price with a wedge', week, usd: wide, message: `${wide} of ${n} goods differ more than 2.5× across regions in one currency (${examples.join(' | ')})` });
  let badCarry = 0;
  state.commodities.forEach((c) => { if (!(c.spotPrice > 0)) return; const ratio = c.futures3M / c.spotPrice; if (ratio < 0.8 || ratio > 1.25) badCarry++; });
  if (badCarry) out.push({ family: 'X', check: 'X2 futures within carry of spot', week, usd: badCarry, message: `${badCarry} commodities' 3m future sits more than 20–25% from spot` });
  // §3.17e-ii-a: the bond future against the cash bond carried — the first comparable the
  // relative-value book trades, so a basis that survives it is a finding.
  const v2 = ensureV2(state);
  let badBasis = 0; const basisExamples: string[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg || reg.bondFuturesBasis === undefined || reg.bondFuturesDeliverableId === undefined) return;
    const cash = trancheClearedPricePerFace(v2, asInstrumentId(reg.bondFuturesDeliverableId));
    if (!(cash !== undefined && cash > 0)) return;
    if (Math.abs(reg.bondFuturesBasis) / cash > 0.02) { badBasis++; basisExamples.push(`${r} ${(reg.bondFuturesBasis * 100).toFixed(2)}pt`); }
  });
  if (badBasis) out.push({ family: 'X', check: 'X2 bond future within carry of cash', week, usd: badBasis, message: `${badBasis} regions' bond future sits more than 2 points from the cash bond carried (${basisExamples.join(' | ')})` });
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
  let faceLocal = 0, markedLocal = 0, impliedLocal = 0, rows = 0, unpriced = 0;
  let widest = { id: '', gapLocal: 0 };
  const H = v2.holdings;
  const trancheByRef: boolean[] = [];
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    // §3.13-BOOK d1: the register's rows, read at the source (the type test resolved once per
    // interned type).
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      const tref = H.typeRef[r];
      let isTranche = trancheByRef[tref];
      if (isTranche === undefined) { isTranche = isTrancheKind(typeOf(v2, tref)); trancheByRef[tref] = isTranche; }
      if (!isTranche) continue;
      const face = rowUnits(H, r);
      if (!(Math.abs(face) > 0)) continue;
      const id = instrumentIdAt(v2, r);
      const price = trancheClearedPricePerFace(v2, id);
      if (price === undefined) { unpriced++; continue; }
      faceLocal += face;
      markedLocal += H.qtyLocal[r];
      impliedLocal += face * price;
      rows++;
      const gap = H.qtyLocal[r] - face * price;
      if (Math.abs(gap) > Math.abs(widest.gapLocal)) widest = { id, gapLocal: gap };
    }
  });
  const gapLocal = markedLocal - impliedLocal;
  if (rows > 0 && Math.abs(gapLocal) > floatDustLocal(Math.abs(markedLocal) + Math.abs(impliedLocal), rows + 1)) {
    out.push({ family: 'P', check: 'P5 the register marks credit at its cleared spread', week, usd: gapLocal, message: `${rows} credit rows on ${B(faceLocal)} of face are marked at ${B(markedLocal)} against ${B(impliedLocal)} implied by their own cleared spreads — a ${B(gapLocal)} gap (widest ${widest.id} by ${B(widest.gapLocal)}${unpriced ? `; ${unpriced} rows could not be priced` : ''})` });
  }
  return out;
}

/**
 * P6 — ONE CURVE, ONE ANSWER (rule 4).
 *
 * A region carries its yield curve TWICE: `zeroRates` — the five tenors the books strike and
 * every consumer reads — and `yieldCurveParams`, the Nelson-Siegel fit that `stage08-back` prices
 * a new issue's coupon off and that `index-calculation` and `12-portfolio` discount with. If the
 * two disagree, a bond issued at "the cleared terms" is born away from par, because the coupon
 * was struck on one curve and the paper is valued on the other. That is not a market moving; it
 * is two answers to one question, and it feeds `P5` directly.
 *
 * §3.13-SOV row 5 made `sovereign-curve.ts` the one owner: it fits once through every point the
 * week's sessions cleared and publishes `zeroRates` as READS of that fit, so the two agree by
 * construction. This check stops being a measurement of a known defect and becomes the guard on
 * that: it fires again the moment a second writer appears, which is exactly how the defect arose.
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
      // One curve by construction (`sovereign-curve.ts` publishes the tenors as reads of the fit): the two may differ by the arithmetic's dust and nothing else.
      if (Math.abs(gapBps) > floatDust(Math.abs(fitted) + Math.abs(struck), 8) * 10000) gaps.push(`${r} ${t.key} ${gapBps.toFixed(1)}bp`);
    });
  });
  if (gaps.length > 0) {
    out.push({ family: 'P', check: 'P6 one curve, one answer', week, usd: Math.abs(worstBps), message: `${gaps.length} of 20 tenor points differ between the struck curve and the fitted one, worst ${worstBps.toFixed(1)}bp (${gaps.slice(0, 4).join(' | ')}) — a new issue's coupon is struck on one and the paper is valued on the other` });
  }
  return out;
}

export function auditPrices(state: GameState, week: number): AuditFinding[] {
  return [...p1(state, week), ...p2(state, week), ...p3(state, week), ...p5(state, week), ...p6(state, week), ...x1(state, week), ...x2(state, week), ...p8(state, week)];
}

/**
 * P8 — §3.13-SOV row 4. THE SOVEREIGN BOOK IS CARRIED AT PAR AND IS NOT WORTH PAR.
 *
 * The sovereign now CLEARS a price and settles at it — both books, bonds and bills (§9.13-SOV
 * row 4). What has not moved is the CARRYING value: a holder still books the paper at face, so a
 * bond bought at 97 sits on the books at 100 and the difference is a gain nobody recorded.
 *
 * This is P5's twin, and the same defect one asset class over: it measures the ladder's face
 * against what those same rungs ARE WORTH. If the two disagree, the model is holding one
 * instrument at two values (rule 4), and the gap is the size of what row 4 has to close.
 *
 * §3.13-READ C4 — AND IT READS THE PRINT NOW. It used to discount each rung at the zero curve
 * and compare face to that, which was right when a sovereign had no price: the curve was the
 * only opinion there was. §9.13-SOV row 4 changed that — `07c:546` and `07f:512` write a cleared
 * price per bond, so re-deriving one from the curve is rule 19's fourth failure mode inside the
 * check that exists to catch it. The two are not the same number: an auction clears where supply
 * meets demand and a fitted curve is a smooth through them, so the old gap mixed the carrying
 * defect it is measuring with the fit error, and the size it reported for row 4 was wrong by
 * that. A rung with NO print contributes nothing — §3.21: a book with nothing to trade prints
 * nothing, and paper nobody traded has no market value to be carried away from. The message
 * carries the coverage so a shrinking gap can never be read as progress when it is really a
 * quiet book.
 *
 * It cannot go green by tuning. It went from "there is no price" to "there is a price and nobody
 * marks to it" when row 4 landed, and it goes green when the register carries the mark — which is
 * step 13's item 4, the stored value, and is the same defect the equity row has.
 */
function p8(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const v2 = ensureV2(state);
  let faceLocal = 0, impliedLocal = 0, rungs = 0, livePaper = 0;
  const byRegion: string[] = [];
  REGION_IDS.forEach((r) => {
    const reg = state.regions[r];
    if (!reg) return;
    let face = 0, marked = 0;
    materializeGovLadder(v2, r).forEach((t) => {
      const weeks = t.maturityWeek - state.currentWeek;
      if (!(weeks > 0) || !(t.principalLocal > 0)) return;
      livePaper++;
      const price = clearedPriceOf(v2, asInstrumentId(t.id));
      if (price === undefined || !(price > 0)) return;
      face += t.principalLocal;
      marked += t.principalLocal * price;
      rungs++;
    });
    if (face > 0) {
      faceLocal += face; impliedLocal += marked;
      byRegion.push(`${r} ${pct(marked / face - 1)}`);
    }
  });
  const gapLocal = faceLocal - impliedLocal;
  if (rungs > 0 && Math.abs(gapLocal) > floatDustLocal(Math.abs(faceLocal) + Math.abs(impliedLocal), rungs + 1)) {
    out.push({ family: 'P', check: 'P8 the sovereign book is carried at par', week, usd: gapLocal,
      message: `${rungs} of ${livePaper} live sovereign rungs have printed a price; on their ${B(faceLocal)} of face the register carries face against ${B(impliedLocal)} the auction itself printed — a ${B(gapLocal)} gap (${byRegion.join(' | ')}); the auction prices it now, and the register still carries it at par` });
  }
  return out;
}

