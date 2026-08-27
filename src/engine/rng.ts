/**
 * The simulation's one source of randomness.
 *
 * Every `Math.random()` in the engine used to be its own unseeded stream, which meant no two runs
 * of this simulation were ever the same world. That is fatal to the way this project is built:
 * the plan's whole method is "measure, change one thing, measure again", and it was being applied
 * to numbers that moved on their own. A 260-week harness comparison of 349 violations against 248
 * said nothing at all — the two runs were different economies, not the same economy before and
 * after a fix.
 *
 * So the engine draws from here instead. Seed it once and a run is exactly reproducible; change
 * the seed and you get a genuinely different world to check a result against. Both are things
 * `Math.random()` could not give.
 *
 * The generator is mulberry32: one 32-bit word of state, good enough statistically for this
 * (it passes gjrand's basic suites), and cheap — this is called millions of times per run. The
 * state is a single number precisely so a saved game can carry it and resume deterministically.
 *
 * UI code is deliberately NOT converted. A shimmer animation's jitter is not part of the world.
 */

/** The seed a run uses unless one is named — the golden-ratio constant, no significance beyond
 *  being a well-mixed starting word. */
export const DEFAULT_SIMULATION_SEED = 0x9e3779b9;

let state = DEFAULT_SIMULATION_SEED >>> 0;
let currentSeed = DEFAULT_SIMULATION_SEED >>> 0;

/** The seed the stream was last started from — lets init-time caches key on the world's
 *  identity rather than guessing (see getInitialRegions' memo). */
export function getSimulationSeed(): number {
  return currentSeed;
}

/** Start (or restart) the stream. The same seed always replays the same run. */
export function setSimulationSeed(seed: number): void {
  // Zero is a fixed point for some mixers; fold it away rather than special-casing later.
  state = (seed >>> 0) || DEFAULT_SIMULATION_SEED;
  currentSeed = state;
}

/** The stream's current position, for a saved game to carry. */
export function getRngState(): number {
  return state >>> 0;
}

/** Resume a stream at a position `getRngState` returned. */
export function setRngState(next: number): void {
  state = (next >>> 0) || DEFAULT_SIMULATION_SEED;
}

/** Uniform in [0, 1) — the drop-in for `Math.random()`. */
export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [min, max). */
export function randomBetween(min: number, max: number): number {
  return min + random() * (max - min);
}

/** Uniform integer in [0, n). */
export function randomInt(n: number): number {
  return Math.floor(random() * n);
}
