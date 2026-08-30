/**
 * NAT2/NAT3 — weather with a calendar, a geography and a mechanism.
 *
 * Three things were missing and all three are here now.
 *
 * **A calendar.** `_week` was unused, so a heatwave was as likely in January as in July. Events
 * are now gated by where the year is: a season index runs the annual cycle, and each event type
 * has the part of it that it belongs to. Nothing about the calendar is imported — a year has
 * fifty-two weeks and half of them are the warm half, which is arithmetic.
 *
 * **A geography — a GENERATED one.** The region could draw any of four types, so JPN could have a
 * polar vortex and the UK a monsoon. What a region is exposed to is now read off what it actually
 * PRODUCES: a region whose firms grow crops is exposed to drought, one that pumps gas or oil to a
 * freeze that shuts extraction in, one that ships to storms on its lanes. That is generated
 * structure — the firm population decides it — rather than a table of real-world climates, and it
 * is a real mechanism besides: exposure follows what you do. The rule-4 place names ('Midwest',
 * 'North Sea', 'Mediterranean', 'Pacific') are generated from the region the same way every
 * ticker and company name in this model already is.
 *
 * **A yield.** An event stated a `commodityImpactPct` — a price impact, added to the commodity's
 * drift — which is an event deciding the answer (rule 1). It now cuts the affected commodity's
 * SUPPLY, and the commodity book prices the shortage, input costs rise through the recipes, and
 * the measured index reports it. Its two dead siblings, `gdpImpactPct` and `inflationImpactPct`
 * — written at fourteen sites, read at none — are deleted.
 */

import { RegionId, WeatherAnomaly, Company } from '../../types';
import { random } from '../rng';

/** Weeks in the year, and where the warm half of it sits. Arithmetic, not observation. */
const WEEKS_PER_YEAR = 52;

/** How far into the year a week is, as a fraction. */
function yearFraction(week: number): number {
  return ((week % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR / WEEKS_PER_YEAR;
}

/**
 * The season index: +1 at midsummer, −1 at midwinter. A weather type is likelier the closer the
 * year is to its own half of the cycle, which is the whole of what seasonality means here.
 */
export function seasonIndex(week: number): number {
  return Math.sin(2 * Math.PI * (yearFraction(week) - 0.25));
}

/** Which half of the year each type belongs to: +1 summer, −1 winter, 0 either. */
const TYPE_SEASON: Record<Exclude<WeatherAnomaly['type'], 'Normal'>, number> = {
  Heatwave: 1,
  Drought: 1,
  Monsoon: 1,
  'Polar Vortex': -1,
};

/** What a region grows, pumps or ships — the exposure its own firm population gives it. */
export interface RegionExposure {
  cropShare: number;
  energyShare: number;
  metalShare: number;
  /** What it actually produces, so an event can name a commodity the region really has. */
  commodityIds: string[];
}

const CROP_IDS = new Set(['WHEAT', 'CORN', 'SOYBEANS']);
const ENERGY_IDS = new Set(['CRUDE_OIL', 'HEAVY_CRUDE_OIL', 'NATURAL_GAS']);

/** Read a region's exposure off the firms that are actually in it. */
export function regionExposure(regionId: RegionId, companies: Company[]): RegionExposure {
  let cropUSD = 0, energyUSD = 0, metalUSD = 0;
  const commodityIds: string[] = [];
  companies.forEach((c) => {
    if (c.region !== regionId || !c.producedCommodityId) return;
    if (!commodityIds.includes(c.producedCommodityId)) commodityIds.push(c.producedCommodityId);
    const usd = Math.max(0, c.annualRevenue);
    if (CROP_IDS.has(c.producedCommodityId)) cropUSD += usd;
    else if (ENERGY_IDS.has(c.producedCommodityId)) energyUSD += usd;
    else metalUSD += usd;
  });
  const totalUSD = cropUSD + energyUSD + metalUSD;
  if (!(totalUSD > 0)) return { cropShare: 0, energyShare: 0, metalShare: 0, commodityIds };
  return {
    cropShare: cropUSD / totalUSD,
    energyShare: energyUSD / totalUSD,
    metalShare: metalUSD / totalUSD,
    commodityIds,
  };
}

/** A generated locality name for the region, so no real place is named (rule 4). */
function localityName(regionId: RegionId, seed: number): string {
  const forms = ['Interior', 'Coastal Belt', 'Uplands', 'Basin', 'Delta', 'Northern Reach'];
  return `${regionId} ${forms[Math.abs(Math.floor(seed)) % forms.length]}`;
}

/** A quiet week: the baseline every region sits at when nothing is happening. */
function normalWeather(regionId: RegionId, minDurationWeeks: number): WeatherAnomaly {
  return {
    region: regionId,
    title: `${localityName(regionId, 0)} Seasonal Baseline`,
    type: 'Normal',
    severity: 'Normal',
    tempDeltaC: 0.0,
    economicImpact: 'Ordinary seasonal weather; nothing constraining output.',
    yieldImpactPct: 0,
    weeksActive: 1,
    minDurationWeeks,
  };
}

export const INITIAL_WEATHER: Record<RegionId, WeatherAnomaly> = {
  USA: normalWeather('USA', 3),
  UK: normalWeather('UK', 3),
  EUR: normalWeather('EUR', 3),
  JPN: normalWeather('JPN', 3),
};

function generateRandomMinDuration(): number {
  return 2 + Math.floor(random() * 4);
}

/**
 * Evolve one region's weather. An event ends when its own duration is up; what comes next is
 * drawn from the types this region is exposed to, weighted by how far into their own season the
 * year is.
 */
export function evolveRegionalWeather(
  regionId: RegionId,
  current: WeatherAnomaly,
  week: number,
  companies: Company[] = []
): WeatherAnomaly {
  const isExpired = current.weeksActive >= (current.minDurationWeeks || 1);
  if (!isExpired) return { ...current, weeksActive: current.weeksActive + 1 };

  const exposure = regionExposure(regionId, companies);
  const season = seasonIndex(week);
  const minDurationWeeks = generateRandomMinDuration();

  // What this region can have at all, and how likely each is right now: its own exposure times
  // how far into that type's own half of the year the week is.
  type EventType = Exclude<WeatherAnomaly['type'], 'Normal'>;
  const candidates: { type: EventType; weight: number }[] = ([
    { type: 'Drought', weight: exposure.cropShare },
    { type: 'Heatwave', weight: exposure.cropShare * 0.5 + exposure.energyShare * 0.5 },
    { type: 'Polar Vortex', weight: exposure.energyShare },
    { type: 'Monsoon', weight: exposure.cropShare * 0.5 + exposure.metalShare * 0.5 },
  ] as { type: EventType; weight: number }[]).map((c) => ({
    type: c.type,
    // In its own season the weight stands; in the opposite one it is gone.
    weight: c.weight * Math.max(0, season * TYPE_SEASON[c.type]),
  })).filter((c) => c.weight > 0);

  const totalWeight = candidates.reduce((a, c) => a + c.weight, 0);
  // Most weeks are ordinary. What decides whether one is not is how exposed the region is and
  // how deep into a season it is — both of which the weights above already carry.
  if (totalWeight <= 0 || random() > Math.min(0.5, totalWeight * 0.4)) {
    return normalWeather(regionId, minDurationWeeks);
  }

  let draw = random() * totalWeight;
  let pick = candidates[candidates.length - 1].type;
  for (const c of candidates) {
    draw -= c.weight;
    if (draw <= 0) { pick = c.type; break; }
  }

  // The commodity it hits: one this region actually produces and that this event could touch.
  const eligible = exposure.commodityIds.filter((id) =>
    pick === 'Drought' || pick === 'Monsoon' ? CROP_IDS.has(id)
      : pick === 'Polar Vortex' ? ENERGY_IDS.has(id)
        : CROP_IDS.has(id) || ENERGY_IDS.has(id));
  const affectedCommodityId = eligible.length > 0
    ? eligible[Math.floor(random() * eligible.length)]
    : exposure.commodityIds[0];

  // Severity is how far into the season it is, times the draw — a midsummer drought is worse
  // than a shoulder-season one, which is the point of having a calendar at all.
  const intensity = Math.min(1, Math.abs(season) * (0.4 + random()));
  const severity: WeatherAnomaly['severity'] =
    intensity > 0.75 ? 'Severe' : intensity > 0.45 ? 'Moderate' : 'Mild';

  const TYPE_TEXT: Record<Exclude<WeatherAnomaly['type'], 'Normal'>, { title: string; impact: string; tempSign: number; yieldScale: number }> = {
    Drought: { title: 'Drought', impact: 'Rainfall shortfall cuts harvestable yield and constrains inland waterways.', tempSign: 1, yieldScale: 0.35 },
    Heatwave: { title: 'Heatwave', impact: 'Heat stress cuts field yields and forces cooling load onto the power system.', tempSign: 1, yieldScale: 0.20 },
    'Polar Vortex': { title: 'Polar Vortex', impact: 'Freeze-offs shut extraction in and strain heating supply.', tempSign: -1, yieldScale: 0.30 },
    Monsoon: { title: 'Monsoon', impact: 'Sustained rain floods fields and interrupts loading at the ports.', tempSign: 1, yieldScale: 0.25 },
  };
  const text = TYPE_TEXT[pick];
  return {
    region: regionId,
    title: `${localityName(regionId, week + pick.length)} ${text.title}`,
    type: pick,
    severity,
    tempDeltaC: Number((text.tempSign * (2 + 4 * intensity)).toFixed(1)),
    economicImpact: text.impact,
    affectedCommodityId,
    // NAT3: what it destroys, as a share of this region's supply of that commodity.
    yieldImpactPct: Number((text.yieldScale * intensity).toFixed(4)),
    weeksActive: 1,
    minDurationWeeks,
  };
}
