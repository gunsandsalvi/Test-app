import { RegionId, WeatherAnomaly } from '../../domain';

function generateRandomMinDuration(): number {
  return 2 + Math.floor(Math.random() * 6);
}

export const INITIAL_WEATHER: Record<RegionId, WeatherAnomaly> = {
  USA: {
    region: 'USA',
    title: 'Midwest Agricultural Drought Warning',
    type: 'Drought',
    severity: 'Moderate',
    tempDeltaC: +2.8,
    economicImpact: 'Crop yields compressed across Great Plains. Agricultural supply chains face elevated price pressure.',
    affectedCommodityId: 'CORN',
    commodityImpactPct: 0.04,
    gdpImpactPct: -0.001,
    inflationImpactPct: 0.002, weeksActive: 1, minDurationWeeks: generateRandomMinDuration()
  },
  UK: {
    region: 'UK',
    title: 'North Sea Polar Vortex & Cold Snap',
    type: 'Polar Vortex',
    severity: 'Moderate',
    tempDeltaC: -4.5,
    economicImpact: 'Sub-zero temperatures strain domestic heating grids. Wholesale natural gas and electricity demand surges.',
    affectedCommodityId: 'NATURAL_GAS',
    commodityImpactPct: 0.08,
    gdpImpactPct: -0.002,
    inflationImpactPct: 0.003, weeksActive: 1, minDurationWeeks: generateRandomMinDuration()
  },
  EUR: {
    region: 'EUR',
    title: 'Mediterranean Summer Heatwave Alert',
    type: 'Heatwave',
    severity: 'Mild',
    tempDeltaC: +3.2,
    economicImpact: 'Peak electricity demand for cooling; hydro reservoirs running below seasonal averages.',
    affectedCommodityId: 'HEAVY_CRUDE_OIL',
    commodityImpactPct: 0.03,
    gdpImpactPct: -0.001,
    inflationImpactPct: 0.0015, weeksActive: 1, minDurationWeeks: generateRandomMinDuration()
  },
  JPN: {
    region: 'JPN',
    title: 'Pacific Monsoon Front',
    type: 'Monsoon',
    severity: 'Mild',
    tempDeltaC: +0.5,
    economicImpact: 'Maritime transport and port operations encounter localized weather delays.',
    commodityImpactPct: 0.01,
    gdpImpactPct: -0.0005,
    inflationImpactPct: 0.0005, weeksActive: 1, minDurationWeeks: generateRandomMinDuration()
  },
};

/**
 * Generate or evolve regional weather systems
 */

export function evolveRegionalWeather(regionId: RegionId, current: WeatherAnomaly, _week: number): WeatherAnomaly {
  const isExpired = current.weeksActive >= (current.minDurationWeeks || 1);
  if (isExpired && Math.random() < 0.28) {
    const r = Math.random();
    let pick: WeatherAnomaly['type'] = 'Normal';
    if (r > 0.55) {
      const remaining: WeatherAnomaly['type'][] = ['Heatwave', 'Drought', 'Polar Vortex', 'Monsoon'];
      pick = remaining[Math.floor(Math.random() * remaining.length)];
    }

    const variance = 0.6 + Math.random() * 0.8; // [0.6, 1.4]
    const minDurationWeeks = generateRandomMinDuration();

    if (pick === 'Normal') {
      return {
        region: regionId,
        title: 'Mild Seasonal Weather Baseline',
        type: 'Normal',
        severity: 'Normal',
        tempDeltaC: 0.0,
        economicImpact: 'Standard seasonal weather across industrial zones. Supply chains functioning smoothly.',
        commodityImpactPct: 0.0,
        gdpImpactPct: 0.0,
        inflationImpactPct: 0.0,
        weeksActive: 1,
        minDurationWeeks
      };
    }

    if (pick === 'Drought') {
      return {
        region: regionId,
        title: `${regionId} Regional Arid Drought Zone`,
        type: 'Drought',
        severity: 'Severe',
        tempDeltaC: Number((+3.5 * variance).toFixed(1)),
        economicImpact: 'Precipitation shortfalls constrain hydro capacity and inland transport waterways.',
        affectedCommodityId: 'CORN',
        commodityImpactPct: Number((0.06 * variance).toFixed(4)),
        gdpImpactPct: Number((-0.003 * variance).toFixed(5)),
        inflationImpactPct: Number((0.004 * variance).toFixed(5)),
        weeksActive: 1,
        minDurationWeeks
      };
    }

    if (pick === 'Heatwave') {
      return {
        region: regionId,
        title: `${regionId} High-Pressure Heatwave Alert`,
        type: 'Heatwave',
        severity: 'Moderate',
        tempDeltaC: Number((+4.2 * variance).toFixed(1)),
        economicImpact: 'Commercial cooling drives wholesale power demand; oil refiners encounter peak summer run throughput.',
        affectedCommodityId: 'HEAVY_CRUDE_OIL',
        commodityImpactPct: Number((0.05 * variance).toFixed(4)),
        gdpImpactPct: Number((-0.002 * variance).toFixed(5)),
        inflationImpactPct: Number((0.003 * variance).toFixed(5)),
        weeksActive: 1,
        minDurationWeeks
      };
    }

    if (pick === 'Polar Vortex') {
      return {
        region: regionId,
        title: `${regionId} Arctic Vortex Freeze`,
        type: 'Polar Vortex',
        severity: 'Severe',
        tempDeltaC: Number((-6.0 * variance).toFixed(1)),
        economicImpact: 'Severe freeze drives record heating gas withdrawals and regional supply bottlenecks.',
        affectedCommodityId: 'NATURAL_GAS',
        commodityImpactPct: Number((0.12 * variance).toFixed(4)),
        gdpImpactPct: Number((-0.004 * variance).toFixed(5)),
        inflationImpactPct: Number((0.005 * variance).toFixed(5)),
        weeksActive: 1,
        minDurationWeeks
      };
    }

    if (pick === 'Monsoon') {
      return {
        region: regionId,
        title: `${regionId} Typhoon & Heavy Precipitation`,
        type: 'Monsoon',
        severity: 'Moderate',
        tempDeltaC: Number((-1.0 * variance).toFixed(1)),
        economicImpact: 'Localized port disruptions and industrial supply chain transit delays.',
        commodityImpactPct: Number((0.02 * variance).toFixed(4)),
        gdpImpactPct: Number((-0.002 * variance).toFixed(5)),
        inflationImpactPct: Number((0.001 * variance).toFixed(5)),
        weeksActive: 1,
        minDurationWeeks
      };
    }
  }

  return {
    ...current,
    weeksActive: (current.weeksActive || 0) + 1
  };
}

/**
 * Helper to generate realistic 52-week synthetic history ending at the current value
 */
