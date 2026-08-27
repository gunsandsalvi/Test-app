/**
 * Where a weekly step actually spends its time.
 *
 * Recorded lesson: the first optimization pass hoisted the obvious filters and bought 6%,
 * because the real cost was an O(firms x contracts) scan nobody had looked at. So this measures
 * rather than guesses. Run it before touching anything for speed, and again after.
 *
 *   npm run profile            # 60 weeks
 *   WEEKS=150 npm run profile
 */
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED } from '../src/engine/rng';

// Same seed, same world. Pass SEED=<n> to check a result against a genuinely different economy
// rather than against the noise an unseeded run used to produce.
const SEED = Number(process.env.SEED ?? DEFAULT_SIMULATION_SEED);
import { advanceWeeklyStepProfiled } from '../src/engine/simulation/core';
import { GameState } from '../src/types';

const WEEKS = Number(process.env.WEEKS ?? 60);
// The first weeks build indices and caches the rest of the run reuses; timing them alongside the
// steady state would misattribute one-off cost to whichever stage happened to pay it.
const WARMUP_WEEKS = 3;

const totalMsByStage = new Map<string, number>();
const worstMsByStage = new Map<string, number>();
let measuredWeeks = 0;
let measuredMs = 0;

let state: GameState = createInitialGameState(SEED);
const startedAt = Date.now();

for (let week = 1; week <= WEEKS; week++) {
  const { state: next, timings } = advanceWeeklyStepProfiled(state, { profile: true });
  state = next;
  if (week <= WARMUP_WEEKS) continue;
  measuredWeeks++;
  timings.forEach(({ stage, ms }) => {
    totalMsByStage.set(stage, (totalMsByStage.get(stage) ?? 0) + ms);
    worstMsByStage.set(stage, Math.max(worstMsByStage.get(stage) ?? 0, ms));
    measuredMs += ms;
  });
}

const rows = Array.from(totalMsByStage.entries())
  .map(([stage, totalMs]) => ({
    stage,
    meanMs: totalMs / measuredWeeks,
    worstMs: worstMsByStage.get(stage) ?? 0,
    sharePct: (totalMs / measuredMs) * 100,
  }))
  .sort((a, b) => b.meanMs - a.meanMs);

const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number, n: number, d = 1) => v.toFixed(d).padStart(n);

console.log(`\n${WEEKS} weeks (${measuredWeeks} measured, first ${WARMUP_WEEKS} discarded as warm-up)`);
console.log(`wall clock ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
console.log(`\n${pad('stage', 30)}${'mean ms'.padStart(9)}${'worst ms'.padStart(10)}${'share'.padStart(8)}`);
console.log('-'.repeat(57));
rows.forEach(r => console.log(`${pad(r.stage, 30)}${num(r.meanMs, 9)}${num(r.worstMs, 10)}${num(r.sharePct, 7)}%`));
console.log('-'.repeat(57));
console.log(`${pad('TOTAL', 30)}${num(measuredMs / measuredWeeks, 9)}${''.padStart(10)}`);
console.log(`\nper-week mean: ${(measuredMs / measuredWeeks).toFixed(0)} ms`);
