/**
 * Firm Generation Primitives
 *
 * Step 3 of the generative bootstrap pipeline. Spawns the seed set of firms for each
 * region/sector from a Pareto/Zipf concentration curve instead of a hand-set roster.
 * Credit ratings are computed from each firm's generated leverage/coverage via
 * determineCreditRating, so ratings are an output of the generation, not an input.
 */

import { RegionId, Sector, CreditRating } from '../../types';
import { determineCreditRating } from '../simulation/credit';
import { GENERATED_COMMODITIES } from './commodities-and-fx';

export interface FirmSeedTemplate {
  ticker: string;
  name: string;
  sector: Sector;
  revBase: number;
  ebitdaMargin: number;
  debtBase: number;
  cashBase: number;
  shares: number;
  initialRating: CreditRating;
  beta: number;
  bankMarketShare?: number;
  institutionalRole?: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | null;
  institutionalMarketShare?: number;
  producedCommodityId?: string;
}

const NAME_PREFIXES = ['Apex', 'Meridian', 'Quantum', 'Summit', 'Pinnacle', 'Vanguard', 'Stellar', 'Nexus', 'Horizon', 'Nova', 'Echo', 'Strata', 'Zenith', 'Aegis', 'Omni'];
const NAME_SUFFIXES = ['Systems', 'Technologies', 'Group', 'Holdings', 'Dynamics', 'Solutions', 'Corp', 'Enterprises', 'Innovations', 'Global', 'Industries', 'Partners', 'Capital', 'Ventures', 'Networks'];

export function generateUniqueName(baseName: string, _sector: string, existingNames: Set<string>): string {
  let attempt = 0;
  while (attempt < 50) {
    const p = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const name = `${p} ${s}`;
    if (!existingNames.has(name)) {
      existingNames.add(name);
      return name;
    }
    attempt++;
  }
  return `${baseName} ${Math.floor(Math.random() * 10000)} Corp`;
}

export function generateUniqueTicker(existingTickers: Set<string>): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempt = 0;
  while (attempt < 100) {
    let t = '';
    for (let i = 0; i < 4; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!existingTickers.has(t)) {
      existingTickers.add(t);
      return t;
    }
    attempt++;
  }
  return 'XXXX';
}

// A firm's rank within its sector (0 = largest) sets its scale via a Pareto/Zipf decay —
// the same few-large/many-small concentration pattern used for category revenue splitting.
const FIRM_CONCENTRATION_DECAY = 0.80;

// Per-sector structural profile for the rank-0 (largest) firm: EBITDA margin, leverage
// (debt/EBITDA) and cash intensity (cash/EBITDA). Lower-ranked (smaller) firms in the same
// sector are progressively thinner-margined and more levered, reflecting scale economics
// rather than independently hand-set financials.
const SECTOR_PROFILE: Record<Sector, { margin: number; leverage: number; cashToEbitda: number; beta: number }> = {
  Tech: { margin: 0.42, leverage: 1.1, cashToEbitda: 2.2, beta: 1.30 },
  Energy: { margin: 0.33, leverage: 1.6, cashToEbitda: 0.9, beta: 1.12 },
  Financials: { margin: 0.34, leverage: 1.4, cashToEbitda: 0.75, beta: 0.95 },
  Industrials: { margin: 0.24, leverage: 1.8, cashToEbitda: 0.6, beta: 1.05 },
  Consumer: { margin: 0.17, leverage: 1.9, cashToEbitda: 0.5, beta: 0.80 },
  Banks: { margin: 0.33, leverage: 0.30, cashToEbitda: 1.9, beta: 1.10 },
};

// Reference revenue scale for a rank-0 firm. Only debt/cash RATIOS derived from this seed
// carry forward — the final per-firm revenue is re-derived downstream from each region's
// generated category demand (see category-demand.ts), so this unit's absolute size is not
// itself a simulation output.
const FIRM_SCALE_UNIT_USD = 130_000;

const INTEREST_RATE_ASSUMPTION = 0.045;

function ratingFor(revBase: number, ebitdaMargin: number, debtBase: number): CreditRating {
  const ebitda = revBase * ebitdaMargin;
  const ebit = Math.max(1, ebitda - revBase * 0.05); // 5% D&A, matches downstream company construction
  const interestExpense = Math.max(1, debtBase * INTEREST_RATE_ASSUMPTION);
  const leverage = debtBase / Math.max(1, ebitda);
  const coverage = ebit / interestExpense;
  return determineCreditRating(leverage, coverage);
}

function buildTemplate(
  region: RegionId,
  sector: Sector,
  rank: number,
  existingTickers: Set<string>,
  existingNames: Set<string>,
  extra?: Partial<FirmSeedTemplate>
): FirmSeedTemplate {
  const profile = SECTOR_PROFILE[sector];
  const scale = Math.pow(FIRM_CONCENTRATION_DECAY, rank);
  const revBase = Math.round(FIRM_SCALE_UNIT_USD * scale);
  // Smaller (higher-rank) firms run thinner margins and carry proportionally more debt.
  const ebitdaMargin = Number(Math.max(0.05, profile.margin * (0.65 + 0.35 * scale)).toFixed(3));
  const debtBase = Math.round(revBase * ebitdaMargin * profile.leverage * (1 + (1 - scale) * 0.5));
  const cashBase = Math.round(revBase * ebitdaMargin * profile.cashToEbitda);
  const shares = Math.max(50, Math.round(1000 * scale));
  const ticker = generateUniqueTicker(existingTickers);
  const name = generateUniqueName(`${region} ${sector}`, sector, existingNames);
  return {
    ticker,
    name,
    sector,
    revBase,
    ebitdaMargin,
    debtBase,
    cashBase,
    shares,
    initialRating: ratingFor(revBase, ebitdaMargin, debtBase),
    beta: Number((profile.beta * (0.9 + 0.2 * scale)).toFixed(2)),
    ...extra,
  };
}

const SECTOR_FIRM_COUNT: Partial<Record<Sector, number>> = {
  Tech: 10,
  Energy: 10,
  Financials: 8, // + 2 specialty (INSURER, ASSET_MANAGER) added separately
  Industrials: 10,
  Consumer: 10,
};

const BANKS_PER_REGION = 4;
const COMMODITY_PRODUCERS_PER_CATEGORY = 2; // per generic commodity id, per region

export function generateFirmSeeds(
  region: RegionId,
  existingTickers: Set<string> = new Set<string>(),
  existingNames: Set<string> = new Set<string>()
): FirmSeedTemplate[] {
  const seeds: FirmSeedTemplate[] = [];

  (Object.keys(SECTOR_FIRM_COUNT) as Sector[]).forEach((sector) => {
    const count = SECTOR_FIRM_COUNT[sector] ?? 0;
    for (let rank = 0; rank < count; rank++) {
      seeds.push(buildTemplate(region, sector, rank, existingTickers, existingNames));
    }
  });

  // Financials specialty roles ranked just behind the largest generic financial firms.
  seeds.push(buildTemplate(region, 'Financials', 0.5, existingTickers, existingNames, {
    institutionalRole: 'INSURER',
    institutionalMarketShare: 0.45,
  }));
  seeds.push(buildTemplate(region, 'Financials', 1.5, existingTickers, existingNames, {
    institutionalRole: 'ASSET_MANAGER',
    institutionalMarketShare: 0.35,
  }));
  seeds.push(buildTemplate(region, 'Financials', 2.5, existingTickers, existingNames, {
    institutionalRole: 'PENSION_FUND',
    institutionalMarketShare: 0.20,
  }));

  const bankShareRank0 = 0.35;
  const bankShareDecay = 0.72;
  for (let rank = 0; rank < BANKS_PER_REGION; rank++) {
    seeds.push(buildTemplate(region, 'Banks', rank, existingTickers, existingNames, {
      bankMarketShare: Number((bankShareRank0 * Math.pow(bankShareDecay, rank)).toFixed(2)),
    }));
  }

  const producerSectorByCategory: Record<string, Sector> = {
    Energy: 'Energy',
    Metals: 'Industrials',
    Agriculture: 'Consumer',
  };
  GENERATED_COMMODITIES.forEach((commodity, idx) => {
    const sector = producerSectorByCategory[commodity.category];
    for (let i = 0; i < COMMODITY_PRODUCERS_PER_CATEGORY; i++) {
      const rank = idx * COMMODITY_PRODUCERS_PER_CATEGORY + i;
      seeds.push(buildTemplate(region, sector, rank, existingTickers, existingNames, {
        producedCommodityId: commodity.id,
      }));
    }
  });

  return seeds;
}
