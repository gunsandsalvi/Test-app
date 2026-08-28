/**
 * Stage 6: FX Evolution & Cross-Border Trade
 *
 * Evolves FX pairs, then computes each region's exports/imports/trade-balance from
 * relative demand, competitiveness, and FX-driven competitiveness adjustments across
 * every tradable category.
 */

import { GameState, Region, RegionId, Company, FxPair } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { CATEGORY_TRADABILITY } from '../../../domain/region-macro';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { evolveFxPair } from '../../macro/evolution';
import { WeeklyStepContext } from './context';

/**
 * USD per one unit of a region's currency.
 *
 * It used to look pairs up by NAME — 'EUR/USD', 'GBP/USD', 'USD/JPY' — none of which this model
 * builds: pairs are named `${base}/${quote}` over RegionIds, so they are 'EUR/USA', 'UK/USA',
 * 'USA/JPN'. Every lookup missed and every caller silently got the hardcoded fallback, which is
 * why the exchange rate has never moved anything: the one function that converts to USD returned
 * a constant. Matching on base/quote instead makes it read the real cleared rate.
 */
export function getFxToUsd(updatedFxPairs: FxPair[], regionId: RegionId): number {
  if (regionId === 'USA') return 1.0;
  const direct = updatedFxPairs.find((p) => p.base === regionId && p.quote === 'USA');
  if (direct && direct.rate > 0 && isFinite(direct.rate)) return direct.rate;
  const inverse = updatedFxPairs.find((p) => p.base === 'USA' && p.quote === regionId);
  if (inverse && inverse.rate > 0 && isFinite(inverse.rate)) return 1 / inverse.rate;
  return 1.0;
}

function computeRegionalCompetitiveness(companies: Company[], regionId: RegionId, category: string): number {
  const firms = companies.filter(c => c.region === regionId && isActiveCompany(c) && (c.productLines || []).some(l => l.industry === category));
  if (firms.length === 0) return 0;
  const score = firms.reduce((s, f) => {
    const line = f.productLines.find(l => l.industry === category);
    const compVal = line?.competitiveness ?? 1.0;
    const shareVal = line?.categoryMarketShare ?? 0;
    return s + (Number.isFinite(compVal) ? compVal : 1.0) * (Number.isFinite(shareVal) ? shareVal : 0);
  }, 0) / firms.length;
  return Number.isFinite(score) ? score : 0;
}

function getFxCompetitivenessAdjustment(exporter: RegionId, importer: RegionId, fxPairs: FxPair[]): number {
  const pair = fxPairs.find(f => (f.base === exporter && f.quote === importer) || (f.base === importer && f.quote === exporter));
  if (!pair || !isFinite(pair.rate) || pair.rate <= 0 || !isFinite(pair.change1W)) return 0;
  const direction = pair.base === exporter ? -1 : 1; // if exporter is the base currency, a RISING rate means exporter is depreciating (rate = quote-per-base) — cheaper exports, so flip sign
  const ratio = pair.change1W / pair.rate;
  if (!isFinite(ratio)) return 0;
  return Math.max(-0.5, Math.min(0.5, (ratio * direction * 5)));
}

/**
 * One week of real bilateral trade: for every exporter/importer pair and every tradable
 * category, the exporter captures a share of the importer's real category demand based on its
 * own firms' competitiveness and the current exchange rate.
 *
 * Exported so that the cold-start bootstrap can seed each region's opening trade position from
 * the very same computation the weekly step runs. It used to start every region at exactly zero
 * exports and zero imports, so week 1 stepped straight to the structural trade balance — for the
 * USA a jump of about -5.5% of output in a single week, which the GDP series could only read as
 * a collapse in growth. A real economy is already trading on the day the simulation opens.
 */
export function computeBilateralTradeFlows(
  companies: Company[],
  regions: Record<RegionId, Region>,
  fxPairs: FxPair[]
): { exportsByRegion: Record<RegionId, number>; importsByRegion: Record<RegionId, number>; categoryExportsByRegion: Record<RegionId, Record<string, number>> } {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const regionExports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionImports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const categoryExports: Record<RegionId, Record<string, number>> = { USA: {}, EUR: {}, UK: {}, JPN: {} };

  regionIds.forEach(exporter => {
    regionIds.filter(r => r !== exporter).forEach(importer => {
      Object.keys(CATEGORY_TRADABILITY).forEach(cat => {
        const tradability = CATEGORY_TRADABILITY[cat];
        if (tradability < 0.1) return; // not worth computing for near-untradable categories
        const subUnits = INDUSTRY_SUBUNITS[cat as any] || [];
        const importerDemand = subUnits.reduce((s, su) => {
          const dem = regions[importer].categoryDemand[su.unitId];
          const val = dem?.demandLevelUSD;
          return s + (typeof val === 'number' && Number.isFinite(val) ? val : 0);
        }, 0);
        const exporterCompetitiveness = computeRegionalCompetitiveness(companies, exporter, cat);
        const fxCompetitiveness = getFxCompetitivenessAdjustment(exporter, importer, fxPairs);
        const exportShareCapture = Math.max(0.05, Math.min(0.80, (0.25 + exporterCompetitiveness * 0.2 + fxCompetitiveness * 0.2)));
        const flow = importerDemand * tradability * (exportShareCapture / (regionIds.length - 1)); // divided among competitors
        regionExports[exporter] += flow;
        regionImports[importer] += flow;
        categoryExports[exporter][cat] = (categoryExports[exporter][cat] ?? 0) + flow;
      });
    });
  });

  return { exportsByRegion: regionExports, importsByRegion: regionImports, categoryExportsByRegion: categoryExports };
}

export function runFxAndTradeStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedFxPairs = state.fxPairs.map((fx) => evolveFxPair(fx, ctx.updatedRegions));
  ctx.getFxToUsd = (regionId: RegionId) => getFxToUsd(ctx.updatedFxPairs, regionId);

  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const { exportsByRegion: regionExports, importsByRegion: regionImports, categoryExportsByRegion } =
    computeBilateralTradeFlows(state.companies, ctx.updatedRegions, ctx.updatedFxPairs);
  ctx.regionCategoryExports = categoryExportsByRegion;


  regionIds.forEach(r => {
    ctx.updatedRegions[r].exportsUSD = regionExports[r];
    ctx.updatedRegions[r].importsUSD = regionImports[r];
    ctx.updatedRegions[r].tradeBalance = regionExports[r] - regionImports[r];
  });
}
