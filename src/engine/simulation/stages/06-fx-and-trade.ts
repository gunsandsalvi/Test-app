/**
 * Stage 6: FX Evolution & Cross-Border Trade
 *
 * Evolves FX pairs, then computes each region's exports/imports/trade-balance from
 * relative demand, competitiveness, and FX-driven competitiveness adjustments across
 * every tradable category.
 */

import { GameState, RegionId, Company, FxPair } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { CATEGORY_TRADABILITY } from '../../../domain/region-macro';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { evolveFxPair } from '../../macro/evolution';
import { WeeklyStepContext } from './context';

export function getFxToUsd(updatedFxPairs: FxPair[], regionId: RegionId): number {
  if (regionId === 'USA') return 1.0;
  if (regionId === 'EUR') {
    const eurUsd = updatedFxPairs.find((p) => p.pair === 'EUR/USD');
    return eurUsd ? eurUsd.rate : 1.08;
  }
  if (regionId === 'UK') {
    const gbpUsd = updatedFxPairs.find((p) => p.pair === 'GBP/USD');
    return gbpUsd ? gbpUsd.rate : 1.29;
  }
  if (regionId === 'JPN') {
    const usdjpy = updatedFxPairs.find((p) => p.pair === 'USD/JPY');
    return usdjpy ? 1 / usdjpy.rate : 1 / 154;
  }
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

export function runFxAndTradeStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedFxPairs = state.fxPairs.map((fx) => evolveFxPair(fx, ctx.updatedRegions));
  ctx.getFxToUsd = (regionId: RegionId) => getFxToUsd(ctx.updatedFxPairs, regionId);

  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const regionExports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionImports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  ctx.regionCategoryExports = { USA: {}, EUR: {}, UK: {}, JPN: {} };

  regionIds.forEach(exporter => {
    regionIds.filter(r => r !== exporter).forEach(importer => {
      Object.keys(CATEGORY_TRADABILITY).forEach(cat => {
        const tradability = CATEGORY_TRADABILITY[cat];
        if (tradability < 0.1) return; // not worth computing for near-untradable categories
        const subUnits = INDUSTRY_SUBUNITS[cat as any] || [];
        const importerDemand = subUnits.reduce((s, su) => {
          const dem = ctx.updatedRegions[importer].categoryDemand[su.unitId];
          const val = dem?.demandLevelUSD;
          return s + (typeof val === 'number' && Number.isFinite(val) ? val : 0);
        }, 0);
        const exporterCompetitiveness = computeRegionalCompetitiveness(state.companies, exporter, cat);
        const fxCompetitiveness = getFxCompetitivenessAdjustment(exporter, importer, ctx.updatedFxPairs);
        const exportShareCapture = Math.max(0.05, Math.min(0.80, (0.25 + exporterCompetitiveness * 0.2 + fxCompetitiveness * 0.2)));
        const flow = importerDemand * tradability * (exportShareCapture / (regionIds.length - 1)); // divided among competitors
        regionExports[exporter] += flow;
        regionImports[importer] += flow;
        ctx.regionCategoryExports[exporter][cat] = (ctx.regionCategoryExports[exporter][cat] ?? 0) + flow;
      });
    });
  });

  regionIds.forEach(r => {
    ctx.updatedRegions[r].exportsUSD = regionExports[r];
    ctx.updatedRegions[r].importsUSD = regionImports[r];
    ctx.updatedRegions[r].tradeBalance = regionExports[r] - regionImports[r];
  });
}
