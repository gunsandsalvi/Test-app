/**
 * §5-STRUCT step 6 — THE SEED IS A SECOND CODE PATH, AND IT DISAGREES WITH THE ENGINE.
 *
 * Every §7.4 defect this project has recorded is one bug wearing different clothes. The production
 * pipeline opening at 1.06 weeks of a 6-week lead. The CPI basket struck on the landed price and
 * measured on the shelf price. The register opening at a third of its own steady state. Thirty-six
 * of thirty-seven categories opening below the capacity their own demand needs. Each was found
 * separately, each cost a run to find, and each is the same thing: **the opening world is built by
 * assertion, and the engine then produces something else.**
 *
 * The end state is that there is no seed. A bootstrap sets what is genuinely EXOGENOUS — population,
 * geography, the industry registry, the calendar — and everything endogenous is whatever the
 * engine's own mechanisms produce. One code path cannot disagree with itself.
 *
 * THIS MODULE IS THE MECHANISM, NOT THE SWITCH. Burn-in is off by default and must stay off until
 * the measurement below says the opening world has actually stopped moving, because turning it on
 * changes every number in the project at once. What it gives today is the ability to ASK: run the
 * engine forward from the seed and watch the quantities §7.4 is about; the distance they travel is
 * the exact size of the disagreement, per quantity, instead of one defect at a time.
 *
 * WHY IT IS SAFE TO ADD NOW. The state after K weeks IS a state the engine produced, so using it as
 * week 0 cannot be less self-consistent than the seed — only differently calibrated. What it costs
 * is the calibration: every §7 number is against the un-burnt seed. That is a re-baseline, and it
 * is the reason this is a switch someone turns deliberately rather than a default.
 */

import { GameState } from '../../types';
import { productionLeadWeeksOf } from '../../domain/industry-registry';
import { INDUSTRY_SUBUNITS } from '../../domain/industry';

/** One quantity §7.4 is about: what the seed asserted, and where the engine took it. */
export interface SteadyStateProbe {
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
  out['register rows'] = s.institutionalEntities.reduce((a, e) => a + (e.itemizedHoldings?.length ?? 0), 0);

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

  out['USA CPI level'] = Number(s.regions.USA.consumerPriceIndex) || 0;
  out['USA unemployment'] = Number(s.regions.USA.unemploymentRate) || 0;
  out['active firms'] = s.companies.filter((c) => !c.isDefaulted && !(c as { mergerAcquired?: boolean }).mergerAcquired).length;
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

/**
 * How many weeks of burn-in to take before a state is handed over as week 0. Zero — OFF — until
 * the measurement above says the world has stopped moving, and until someone accepts the
 * re-baseline that turning it on costs. `SEED_BURN_IN=n` to evaluate it.
 */
export function burnInWeeks(): number {
  const n = Number(process.env.SEED_BURN_IN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
