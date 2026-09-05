/**
 * §5-STRUCT step 6 / §7.345 — THE SEED IS A GUESS; THE ENGINE IS THE TRUTH. BURN IT IN.
 *
 * Every §7.4 defect this project recorded was one bug wearing different clothes: the opening
 * world is built by ASSERTION and the engine then produces something else. The end state is
 * that there is no seed — a bootstrap sets what is genuinely exogenous (population, geography,
 * the registry, the calendar) and everything endogenous is whatever the engine's own mechanisms
 * settle to. This module is that settling: run the engine forward from the seed until the
 * quantities that define the world stop moving, and hand THAT state over as the opening one.
 *
 * WHAT §7.294 TAUGHT. A fixed 12-week burn was measured worse than the seed: it baked the
 * engine's opening TRANSIENT into week 0 and reset the calendar under a policy meeting cycle
 * that carried on. Two things follow. (1) A burn-in is not a number of weeks — it runs to a
 * CONVERGENCE TEST, and a world that does not converge is an engine defect, named by the
 * quantity that keeps drifting, never a seed patch (that is the self-correction the user asked
 * for: the seed cannot hold a world the engine will not hold). (2) The calendar is CONTINUOUS:
 * the burnt weeks stay counted (every structural clock — the quarter, the §7.138 year — is then
 * already running at the hand-over), and `burnInWeeks` on the state is what a display subtracts.
 *
 * WHAT CONVERGED MEANS. For `SETTLED_WEEKS` consecutive weeks, every watched quantity moved by
 * less than its tolerance: unemployment by region, the price level by region, the goods fill
 * ratio, and the count of active firms. The tolerances are widths of a week's ordinary noise,
 * not bands on the level — a world can converge to 30% unemployment, and then the record says
 * so, in numbers, with the drifting quantity named.
 *
 * Off by default (`SEED_BURN_IN` unset): turning it on re-bases every number in §7 at once, so
 * it is a switch someone turns deliberately after reading the trace.
 *   SEED_BURN_IN=auto        run to convergence (at most MAX_WEEKS_DEFAULT)
 *   SEED_BURN_IN=auto:200    run to convergence (at most 200)
 *   SEED_BURN_IN=52          run exactly 52 weeks (the §7.294 shape, for comparison)
 *   SEED_BURN_IN_TRACE=1     print the trace every 4 weeks (auto mode prints its summary anyway)
 */

import { GameState } from '../../types';
import { productionLeadWeeksOf } from '../../domain/industry-registry';
import { INDUSTRY_SUBUNITS } from '../../domain/industry';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { ensureV2 } from '../../engine2/world';
import { bookHeadOf } from '../../engine2/holdings';

/** One quantity §7.4 is about: what the seed asserted, and where the engine took it. */
interface SteadyStateProbe {
  name: string;
  seeded: number;
  settled: number;
  /** How far the seed is from where the engine goes, as a ratio. 1.00 = the seed was right. */
  ratio: number;
}

/**
 * The quantities whose seed-versus-settled gap has cost this project a defect each. Read off a
 * state rather than computed inside a stage, so the same function measures the seed and the
 * settled world and cannot disagree with itself about what it is measuring.
 */
export function probeSteadyState(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};

  // IND10 — a pipeline is exactly as long as the good's production lead. §6.1 found lines holding
  // 1.06 weeks of a 6-week lead: the pipeline drains and nothing re-fills it.
  let wipUnits = 0;
  let frontUnits = 0;
  for (const c of s.companies) {
    const wip = (c as unknown as { wipBySubUnit?: Record<string, { units: number }[]> }).wipBySubUnit;
    if (!wip) continue;
    for (const [subUnitId, queue] of Object.entries(wip)) {
      if (productionLeadWeeksOf(subUnitId) <= 0 || queue.length === 0) continue;
      wipUnits += queue.reduce((a, l) => a + l.units, 0);
      frontUnits += queue[0].units;
    }
  }
  out['wip weeks of throughput'] = frontUnits > 0 ? wipUnits / frontUnits : 0;

  // The register: §6.1 measured it opening at ~32k rows and reaching ~106k by week 2.
  {
    // §3.13-BOOK d1: counted on the register itself.
    const v2 = ensureV2(s);
    let rows = 0;
    for (const e of s.institutionalEntities) for (let r = bookHeadOf(v2, e.id); r >= 0; r = v2.holdings.next[r]) rows++;
    out['register rows'] = rows;
  }

  // The goods market: what share of what is asked for is actually delivered.
  let demanded = 0;
  let supplied = 0;
  for (const su of Object.values(INDUSTRY_SUBUNITS).flat()) {
    for (const reg of Object.values(s.regions)) {
      const d = reg.categoryDemand[su.unitId as keyof typeof reg.categoryDemand] as
        { totalUnitsDemandedThisWeek?: number; totalUnitsSuppliedThisWeek?: number } | undefined;
      demanded += Number(d?.totalUnitsDemandedThisWeek) || 0;
      supplied += Number(d?.totalUnitsSuppliedThisWeek) || 0;
    }
  }
  out['goods fill ratio'] = demanded > 0 ? supplied / demanded : 1;

  for (const rid of REGION_IDS) {
    out[`${rid} CPI level`] = Number(s.regions[rid]?.consumerPriceIndex) || 0;
    out[`${rid} unemployment`] = Number(s.regions[rid]?.unemploymentRate) || 0;
  }
  out['USA CPI level'] = Number(s.regions.USA.consumerPriceIndex) || 0;
  out['USA unemployment'] = Number(s.regions.USA.unemploymentRate) || 0;
  out['active firms'] = s.companies.filter(isActiveCompany).length;
  // The week's casualties and the plant taken offline — the two stock responses whose clocks
  // the trace has to show.
  out['defaults this week'] = s.companies.filter((c) => c.defaultedWeek === s.currentWeek).length;
  // Estates still working. It only falls when a workout finishes, so a number that only ever
  // rises means the close condition cannot be met and the dead firms' holders are stuck.
  out['open estates'] = (s.estates ?? []).filter((e) => e.closedWeek === undefined).length;
  let ppe = 0;
  let mothballed = 0;
  for (const c of s.companies) {
    const g = Number(c.grossPPELocal) || 0;
    ppe += g;
    mothballed += g * (Number(c.mothballedPpeShare) || 0);
  }
  out['mothballed plant share'] = ppe > 0 ? mothballed / ppe : 0;
  return out;
}

/**
 * Compare the seeded world against one the engine has run forward. **The gap IS the §7.4 defect
 * list, measured in one pass instead of discovered one row at a time.**
 */
export function compareToSettled(
  seeded: Record<string, number>,
  settled: Record<string, number>
): SteadyStateProbe[] {
  return Object.keys(seeded).map((name) => {
    const a = seeded[name];
    const b = settled[name];
    return { name, seeded: a, settled: b, ratio: a !== 0 ? b / a : (b === 0 ? 1 : Infinity) };
  });
}

// ---------------------------------------------------------------------------------------------
// The convergence test.
// ---------------------------------------------------------------------------------------------

/** Consecutive quiet weeks before the world counts as settled: two months of the UI calendar. */
const SETTLED_WEEKS = 8;
/** The most weeks an `auto` burn-in runs before giving up and naming what still drifts. */
const MAX_WEEKS_DEFAULT = 156;

/** A week's ordinary noise in each watched quantity — the width below which it is "not moving".
 *  Unemployment: a quarter of a point. The price level: half a percent a week (that is still ~30%
 *  a year, so a converged world can be inflating — the level's DRIFT is then the finding, read
 *  off the trace, not hidden by the test). Fill: a point. Firms: half a percent of the roster. */
const TOLERANCES = {
  unemploymentPp: 0.0025,
  priceLevelPct: 0.005,
  fillRatio: 0.01,
  activeFirmsShare: 0.005,
} as const;

interface BurnInWeek {
  week: number;
  probe: Record<string, number>;
  /** The quantities that moved more than their tolerance this week (empty = a quiet week). */
  moved: string[];
}

interface BurnInResult {
  state: GameState;
  weeks: number;
  converged: boolean;
  trace: BurnInWeek[];
  /** The quantities still moving when the burn-in stopped (empty when converged). */
  drifting: string[];
}

type BurnInMode =
  | { mode: 'off' }
  | { mode: 'fixed'; weeks: number }
  | { mode: 'auto'; maxWeeks: number };

/** `SEED_BURN_IN`: unset/0 → off; a number → that many weeks; `auto[:max]` → to convergence. */
export function burnInMode(): BurnInMode {
  const raw = (process.env.SEED_BURN_IN ?? '').trim();
  if (!raw) return { mode: 'off' };
  if (raw.startsWith('auto')) {
    const max = Number(raw.split(':')[1]);
    return { mode: 'auto', maxWeeks: Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_WEEKS_DEFAULT };
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? { mode: 'fixed', weeks: Math.floor(n) } : { mode: 'off' };
}

/** Kept for the harness's older reading of the switch: the fixed week count, 0 when off/auto. */
export function burnInWeeks(): number {
  const m = burnInMode();
  return m.mode === 'fixed' ? m.weeks : 0;
}

/** Which watched quantities moved more than their tolerance between two probes. */
function movedQuantities(prev: Record<string, number>, next: Record<string, number>): string[] {
  const moved: string[] = [];
  for (const rid of REGION_IDS) {
    const du = Math.abs((next[`${rid} unemployment`] ?? 0) - (prev[`${rid} unemployment`] ?? 0));
    if (du > TOLERANCES.unemploymentPp) moved.push(`${rid} unemployment`);
    const p0 = prev[`${rid} CPI level`] ?? 0;
    const p1 = next[`${rid} CPI level`] ?? 0;
    if (p0 > 0 && Math.abs(p1 / p0 - 1) > TOLERANCES.priceLevelPct) moved.push(`${rid} CPI level`);
  }
  if (Math.abs((next['goods fill ratio'] ?? 0) - (prev['goods fill ratio'] ?? 0)) > TOLERANCES.fillRatio) moved.push('goods fill ratio');
  const f0 = prev['active firms'] ?? 0;
  const f1 = next['active firms'] ?? 0;
  if (f0 > 0 && Math.abs(f1 - f0) / f0 > TOLERANCES.activeFirmsShare) moved.push('active firms');
  return moved;
}

function traceLine(w: BurnInWeek): string {
  const p = w.probe;
  const u = REGION_IDS.map((r) => (100 * (p[`${r} unemployment`] ?? 0)).toFixed(1)).join('/');
  const cpi = REGION_IDS.map((r) => (p[`${r} CPI level`] ?? 0).toFixed(1)).join('/');
  return `  [burn-in] w${String(w.week).padStart(3)} u ${u} | CPI ${cpi} | fill ${(p['goods fill ratio'] ?? 0).toFixed(3)}`
    + ` | firms ${p['active firms']} (-${p['defaults this week']}) | mothballed ${(100 * (p['mothballed plant share'] ?? 0)).toFixed(1)}%`
    + ` | moved: ${w.moved.length ? w.moved.join(', ') : '—'}`;
}

/**
 * Run the engine forward from `state` until the watched quantities have been quiet for
 * `SETTLED_WEEKS` weeks (auto) or for exactly `weeks` weeks (fixed). The calendar is NOT reset:
 * the returned state's `currentWeek` is the seed's plus the weeks burnt, and `burnInWeeks`
 * records how many, so every structural clock keeps its phase and a display can subtract.
 */
export function burnIn(
  state: GameState,
  advance: (s: GameState) => GameState,
  mode: Exclude<BurnInMode, { mode: 'off' }>,
): BurnInResult {
  const limit = mode.mode === 'fixed' ? mode.weeks : mode.maxWeeks;
  const verbose = process.env.SEED_BURN_IN_TRACE === '1' || mode.mode === 'auto';
  const trace: BurnInWeek[] = [];
  let prev = probeSteadyState(state);
  let quiet = 0;
  let converged = false;
  let s = state;
  let w = 0;
  while (w < limit) {
    s = advance(s);
    w++;
    const probe = probeSteadyState(s);
    const moved = movedQuantities(prev, probe);
    const row = { week: w, probe, moved };
    trace.push(row);
    prev = probe;
    quiet = moved.length === 0 ? quiet + 1 : 0;
    const every = process.env.SEED_BURN_IN_TRACE === '2' ? 1 : 4;
    if (verbose && (w % every === 0 || moved.length === 0)) console.log(traceLine(row));
    if (mode.mode === 'auto' && quiet >= SETTLED_WEEKS) { converged = true; break; }
  }
  const last = trace[trace.length - 1];
  const drifting = converged ? [] : (last?.moved ?? []);
  if (verbose) {
    console.log(converged
      ? `  [burn-in] SETTLED after ${w} weeks (${SETTLED_WEEKS} quiet weeks)`
      : `  [burn-in] NOT SETTLED after ${w} weeks — still moving: ${drifting.join(', ') || 'nothing this week (never quiet for ' + SETTLED_WEEKS + ')'}`);
  }
  const out = { ...s, burnInWeeks: (s.burnInWeeks ?? 0) + w };
  return { state: out, weeks: w, converged, trace, drifting };
}
