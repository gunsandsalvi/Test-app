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

export interface PlantVintage {
  /** What it cost when it entered service — gross book, never revalued. */
  costLocal: number;
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

/** Register order: oldest first; equal service weeks by life. */
const byAge = (a: PlantVintage, b: PlantVintage): number =>
  a.enteredServiceWeek - b.enteredServiceWeek || a.usefulLifeYears - b.usefulLifeYears;

/** Two registers become one, in age order; a vintage of the same week and life folds in. */
export function mergePlant(a: readonly PlantVintage[], b: readonly PlantVintage[]): PlantVintage[] {
  const all = [...a, ...b].filter((v) => v.costLocal > 0).sort(byAge);
  const out: PlantVintage[] = [];
  for (const v of all) {
    const last = out[out.length - 1];
    if (last && last.enteredServiceWeek === v.enteredServiceWeek && last.usefulLifeYears === v.usefulLifeYears) {
      out[out.length - 1] = { ...last, costLocal: last.costLocal + v.costLocal };
    } else out.push({ ...v });
  }
  return out;
}

/** What entered service this week joins the register as this week's vintage at the given life. */
export function commissionVintage(
  plant: readonly PlantVintage[], costLocal: number, week: number, usefulLifeYears: number
): PlantVintage[] {
  if (!(costLocal > 0)) return [...plant];
  return mergePlant(plant, [{ costLocal, enteredServiceWeek: week, usefulLifeYears }]);
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
 * seed carried were this shape asserted; here it is built.
 */
export function seedPlantVintages(grossLocal: number, usefulLifeYears: number, week: number): PlantVintage[] {
  const life = Math.max(1, Math.round(usefulLifeYears));
  if (!(grossLocal > 0)) return [];
  const costLocal = grossLocal / life;
  const out: PlantVintage[] = [];
  for (let k = life - 1; k >= 0; k--) {
    out.push({ costLocal, enteredServiceWeek: week - (k * 52 + 26), usefulLifeYears: life });
  }
  return out;
}
