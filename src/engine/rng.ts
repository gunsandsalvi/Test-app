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

/**
 * ENTITY-SCOPED DRAWS — §7.222.
 *
 * A stage that loops over entities and draws from the stream above gives each entity the number
 * that happens to sit at its position in the loop. That makes the ITERATION ORDER an input to the
 * economy: §7.222 measured it, and reversing stage 08's company loop moved aggregate net income
 * by 2.0% and killed a different firm, because `insurerProfile`'s loss ratio is the 40th draw for
 * the 40th company and the 2,456th for the same company read backwards.
 *
 * A stream position is a RESOLUTION artefact (§1.19) and it was setting real outcomes. So a loop
 * over entities opens a scope per entity instead: the stream is re-seeded from the entity's OWN
 * identity, the week, and the world's seed, so a firm draws the same number wherever it sits in
 * the loop, on whichever core, in a roster of any size. That is what makes the loop parallel —
 * with it, §7.222 measured forward and reverse order agreeing to seventeen significant digits.
 *
 * The scope swaps the state word rather than branching inside `random()`, because `random()` is
 * called millions of times a run and must stay four operations long.
 */

/** FNV-1a over a key, so an entity's stream follows its identity rather than its index. */
function keyHash(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Open an entity's own stream. Returns the caller's stream position, to be handed back to
 * `endEntityScope` when the entity's work is done — so a loop leaves the global stream exactly
 * where it found it, and the number of draws an entity makes cannot shift anyone else's.
 */
export function beginEntityScope(key: string, salt: number): number {
  const saved = state;
  const seeded = (keyHash(key) ^ Math.imul(salt | 0, 0x9e3779b9) ^ currentSeed) >>> 0;
  state = seeded || DEFAULT_SIMULATION_SEED;
  return saved;
}

/** Close an entity's stream and restore the caller's. */
export function endEntityScope(saved: number): void {
  state = saved >>> 0;
}
