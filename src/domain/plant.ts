/**
 * §3.26-f-ii — PLANT IS DATED VINTAGES, and the sheet reads them.
 *
 * `assetsUnderConstruction` already carried capital as `{valueLocal, entersServiceWeek}[]`; the
 * sheet then collapsed what entered service into two scalars, `grossPPELocal` and
 * `accumulatedDepreciationLocal`, that every writer had to keep in step by hand (the seed at a
 * stated 45% or 35% worn, the roll-forward by a weekly slice, a scrap pro rata, a merger by
 * addition, an estate by subtraction) and no reader could tell when they had drifted. What enters
 * service keeps its shape here: ONE VINTAGE per commissioning — what it cost, the week it entered
 * service, and its own straight-line life (a ship's 25 years, a fab's 7, stamped when it entered)
 * — and gross, net, accumulated depreciation and the week's charge are READS of the register at
 * the week they are asked at. Nothing stores a number they could disagree with.
 *
 * A vintage wears from its own service week over its own life and LEAVES the register when it is
 * fully worn (`retireWornPlant`), so the charge stops when the plant is gone — the scalar carried
 * fully-worn plant in gross for ever and kept charging upkeep and depreciation on it. Every writer
 * is a vintage move: commissioning appends; scrap retires the OLDEST first; a spin-off slices
 * every vintage pro rata; a merger concatenates; an estate's buyer takes slices at the cleared
 * price of book. The register is kept in service-week order, oldest first, so "the oldest" is the
 * front of the array. The seed's age structure is a derivation (`seedPlantVintages`): a plant
 * replaced at a constant rate is vintages spread evenly over the life, which is half worn.
 *
 * Every function here returns a NEW array; a register is never mutated in place, because a
 * spin-off is a structuredClone of its parent and a shared array is how two books corrupt each other.
 */

/** §3.26-f-iii — one firm's plant TRANSFORMATIONS in a week, recorded on the wire journal by
 *  `ledger/plant-ledger.ts`; the moves between parties are wires. W6 closes the identity. */
export interface PlantFlow {
  commissionedLocal: number;
  retiredLocal: number;
  scrappedLocal: number;
  abandonedLocal: number;
  bornLocal: number;
  arrivedLocal: number;
}

/** §3.26-f-iv-a — capital that has arrived and is not yet plant: what it cost, the week it enters
 *  service, and the capital good it is (the CAPITAL_GOOD sub-unit the purchase named). */
export interface ConstructionLot {
  valueLocal: number;
  entersServiceWeek: number;
  kind: string;
}

export interface PlantVintage {
  /** What it cost when it entered service — gross book, never revalued. */
  costLocal: number;
  /** §3.26-f-iv-a — WHAT it is: the sub-unit id of the capital good it was made from
   *  (`industry-registry.ts:purchaseKindOf` = CAPITAL_GOOD; a carrier's fleet is
   *  `commercial_fleet`). Specific in kind as well as in time; a move keeps it. */
  kind: string;
  /** The week it entered service; its age is read against the week it is asked at. */
  enteredServiceWeek: number;
  /** Its own straight-line life, stamped when it entered service (`usefulLifeYearsOf`). */
  usefulLifeYears: number;
}

/**
 * THE ONE DEPRECIATION SCHEDULE (§3.26-f-i), per vintage: straight-line, the cost over the life,
 * a year-rate. A register's charge is the sum of its live vintages'; the P&L, the stock, the
 * upkeep target, the valuation and the seed all read that sum.
 */
export function annualDepreciationLocal(costLocal: number, usefulLifeYears: number): number {
  return costLocal / Math.max(1, usefulLifeYears);
}

const lifeWeeksOf = (v: PlantVintage): number => Math.max(1, v.usefulLifeYears) * 52;

/** The worn share at `week`: 0 the week it entered service, 1 when fully worn. */
export function wornShareOf(v: PlantVintage, week: number): number {
  return Math.max(0, Math.min(1, (week - v.enteredServiceWeek) / lifeWeeksOf(v)));
}

/** On the register at `week`: not yet fully worn. (The reads agree on this before the writer
 *  `retireWornPlant` has run, so a vintage never counts in gross after its last week.) */
const isLive = (v: PlantVintage, week: number): boolean => wornShareOf(v, week) < 1;

/** Gross plant: what the live vintages cost. */
export function plantGrossLocal(plant: readonly PlantVintage[], week: number): number {
  let s = 0;
  for (const v of plant) if (isLive(v, week)) s += v.costLocal;
  return s;
}

/** Net plant: cost less wear, over the live vintages. */
export function plantNetLocal(plant: readonly PlantVintage[], week: number): number {
  let s = 0;
  for (const v of plant) if (isLive(v, week)) s += v.costLocal * (1 - wornShareOf(v, week));
  return s;
}

/** Accumulated depreciation: the wear on the live vintages (gross − net, by construction). */
export function plantAccumulatedDepreciationLocal(plant: readonly PlantVintage[], week: number): number {
  let s = 0;
  for (const v of plant) if (isLive(v, week)) s += v.costLocal * wornShareOf(v, week);
  return s;
}

/** The year's charge on the register: the schedule summed over the live vintages. */
export function plantDepreciationAnnualLocal(plant: readonly PlantVintage[], week: number): number {
  let s = 0;
  for (const v of plant) if (isLive(v, week)) s += annualDepreciationLocal(v.costLocal, v.usefulLifeYears);
  return s;
}

/**
 * §3.26-f-iv-c — WHAT THE REGISTER CAN PRODUCE FOR A USE that needs its capital in a MIX of kinds
 * (an industry's `capitalMix`): the plant is only as large as its scarcest kind allows. A factory
 * with all the buildings and none of the machines makes nothing; heavy equipment merged into a
 * software firm adds nothing to what the software firm can make. Leontief over kinds — the net of
 * each kind over its share, the minimum — so a register built in the mix (the seed's, or a firm
 * that buys by its mix) is worth its whole net, and one of the wrong kinds is worth its binding
 * kind. This is what makes misallocation possible and costly (the-capital-programme A4), and a
 * vintage's value what it can produce rather than what it cost (A5). A mix with no kinds (a use
 * that names no capital) reads the whole net.
 */
export function plantEffectiveNetLocal(plant: readonly PlantVintage[], mixByKind: Record<string, number>, week: number): number {
  const kinds = Object.entries(mixByKind).filter(([, w]) => w > 0);
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  if (!(total > 0)) return plantNetLocal(plant, week);
  const netByKind: Record<string, number> = {};
  for (const v of plant) {
    if (!isLive(v, week)) continue;
    netByKind[v.kind] = (netByKind[v.kind] ?? 0) + v.costLocal * (1 - wornShareOf(v, week));
  }
  let effective = Infinity;
  for (const [kind, w] of kinds) effective = Math.min(effective, (netByKind[kind] ?? 0) / (w / total));
  return effective === Infinity ? 0 : effective;
}

/** Register order: oldest first; equal service weeks by life. */
const byAge = (a: PlantVintage, b: PlantVintage): number =>
  a.enteredServiceWeek - b.enteredServiceWeek || a.usefulLifeYears - b.usefulLifeYears
  || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0);

/** Two registers become one, in age order; a vintage of the same week, life and kind folds in. */
export function mergePlant(a: readonly PlantVintage[], b: readonly PlantVintage[]): PlantVintage[] {
  const all = [...a, ...b].filter((v) => v.costLocal > 0).sort(byAge);
  const out: PlantVintage[] = [];
  for (const v of all) {
    const last = out.at(-1);
    if (last && last.enteredServiceWeek === v.enteredServiceWeek && last.usefulLifeYears === v.usefulLifeYears && last.kind === v.kind) {
      out[out.length - 1] = { ...last, costLocal: last.costLocal + v.costLocal };
    } else out.push({ ...v });
  }
  return out;
}

/** What entered service this week joins the register as this week's vintage of that kind, at the
 *  given life; a second lot of the same kind this week folds into it. */
export function commissionVintage(
  plant: readonly PlantVintage[], costLocal: number, week: number, usefulLifeYears: number, kind: string
): PlantVintage[] {
  if (!(costLocal > 0)) return [...plant];
  return mergePlant(plant, [{ costLocal, enteredServiceWeek: week, usefulLifeYears, kind }]);
}

/** Vintages fully worn at `week` leave the register — a transformation, not a move. */
export function retireWornPlant(plant: readonly PlantVintage[], week: number): { plant: PlantVintage[]; retiredCostLocal: number } {
  let retiredCostLocal = 0;
  const kept: PlantVintage[] = [];
  for (const v of plant) {
    if (isLive(v, week)) kept.push(v);
    else retiredCostLocal += v.costLocal;
  }
  return { plant: kept, retiredCostLocal };
}

/**
 * A share of the gross plant is written off for good — the OLDEST vintages first, because that is
 * the plant a firm takes down: what is most worn produces least for its upkeep. The last vintage
 * reached is split so exactly the share goes.
 */
export function scrapPlantShare(
  plant: readonly PlantVintage[], share: number, week: number
): { plant: PlantVintage[]; scrappedCostLocal: number; scrappedNetLocal: number } {
  const s = Math.max(0, Math.min(1, share));
  if (!(s > 0)) return { plant: [...plant], scrappedCostLocal: 0, scrappedNetLocal: 0 };
  let toGoLocal = plantGrossLocal(plant, week) * s;
  let scrappedCostLocal = 0;
  let scrappedNetLocal = 0;
  const kept: PlantVintage[] = [];
  for (const v of [...plant].sort(byAge)) {
    if (!isLive(v, week)) { kept.push(v); continue; }
    if (toGoLocal <= 0) { kept.push(v); continue; }
    const goneLocal = Math.min(v.costLocal, toGoLocal);
    toGoLocal -= goneLocal;
    scrappedCostLocal += goneLocal;
    scrappedNetLocal += goneLocal * (1 - wornShareOf(v, week));
    const leftLocal = v.costLocal - goneLocal;
    if (leftLocal > 0) kept.push({ ...v, costLocal: leftLocal });
  }
  return { plant: kept, scrappedCostLocal, scrappedNetLocal };
}

/** Every vintage split by one fraction: the taken part keeps its service week and life (the
 *  machine keeps its age when it changes hands). A spin-off, and an estate's sale of book. */
export function slicePlant(plant: readonly PlantVintage[], fraction: number): { taken: PlantVintage[]; kept: PlantVintage[] } {
  const f = Math.max(0, Math.min(1, fraction));
  const taken: PlantVintage[] = [];
  const kept: PlantVintage[] = [];
  for (const v of plant) {
    const t = v.costLocal * f;
    if (t > 0) taken.push({ ...v, costLocal: t });
    if (v.costLocal - t > 0) kept.push({ ...v, costLocal: v.costLocal - t });
  }
  return { taken, kept };
}

/**
 * THE SEED'S AGE STRUCTURE IS A DERIVATION. A plant replaced at a constant rate — the stationary
 * state the seed opens in (§7.4) — is one vintage a year, each `gross / life`, spread evenly over
 * the life: ages ½, 1½, …, (life − ½) years, so the register is exactly half worn (its net is
 * `gross / 2`) and its year's charge is `gross / life`. The stated 45% and 35% worn fractions the
 * seed carried were this shape asserted; here it is built. §3.26-f-iv-a/b: in the MIX of capital
 * goods the firm's plant is made of, each kind at its OWN life (weights normalised) — one set of
 * yearly vintages per kind, each set half worn over its own life.
 */
export function seedPlantVintages(
  grossLocal: number, week: number, mix: readonly { kind: string; weight: number; usefulLifeYears: number }[]
): PlantVintage[] {
  if (!(grossLocal > 0)) return [];
  const kinds = mix.filter((m) => m.weight > 0);
  const total = kinds.reduce((a, m) => a + m.weight, 0);
  if (!(total > 0)) return [];
  const out: PlantVintage[] = [];
  for (const m of kinds) {
    const life = Math.max(1, Math.round(m.usefulLifeYears));
    const costLocal = (grossLocal * m.weight / total) / life;
    for (let k = life - 1; k >= 0; k--) {
      out.push({ costLocal, enteredServiceWeek: week - (k * 52 + 26), usefulLifeYears: life, kind: m.kind });
    }
  }
  return mergePlant(out, []);
}

/** A capital mix (`industry-registry.ts:capitalMixOf`) as the seed's vintages want it: each kind
 *  with its own life. */
export function seedMixOf(mix: Record<string, number>, lifeOf: (kind: string) => number): { kind: string; weight: number; usefulLifeYears: number }[] {
  return Object.entries(mix).filter(([, w]) => w > 0).map(([kind, weight]) => ({ kind, weight, usefulLifeYears: lifeOf(kind) }));
}
