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
import { random } from '../rng';

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
  rank: number;
  bankMarketShare?: number;
  institutionalRole?: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | 'HEDGE_FUND' | null;
  institutionalMarketShare?: number;
  producedCommodityId?: string;
}

const NAME_PREFIXES = [
  'Apex', 'Meridian', 'Quantum', 'Summit', 'Pinnacle', 'Vanguard', 'Stellar', 'Nexus', 'Horizon', 'Nova',
  'Echo', 'Strata', 'Zenith', 'Aegis', 'Omni', 'Atlas', 'Cobalt', 'Lumen', 'Ridge', 'Beacon',
  'Sterling', 'Crestline', 'Ironclad', 'Northgate', 'Fulcrum', 'Anchor', 'Cardinal', 'Keystone', 'Halcyon', 'Bastion',
];
const NAME_SUFFIXES = ['Systems', 'Technologies', 'Group', 'Holdings', 'Dynamics', 'Solutions', 'Corp', 'Enterprises', 'Innovations', 'Global', 'Industries', 'Partners', 'Capital', 'Ventures', 'Networks'];
// Optional middle qualifier, inserted about a third of the time, purely to widen the
// combinatorial space (globally-unique naming across 800+ companies needs far more room than
// a bare prefix x suffix product gives) without resorting to a numeric fallback as the common
// case — that fallback should stay a rare last resort, not the outcome for most companies.
const NAME_QUALIFIERS = ['North', 'First', 'United', 'Prime', 'Continental', 'National', 'Allied', 'Union'];

// Biases the suffix toward words that plausibly describe each sector's actual business,
// rather than every sector drawing from the same fully generic pool — a name still won't
// describe the company's specific product line, but it stops reading as pure noise (e.g. an
// Energy company never landing on "Technologies", a bank never landing on "Industries").
const SECTOR_NAME_SUFFIXES: Partial<Record<Sector, string[]>> = {
  Tech: ['Systems', 'Technologies', 'Networks', 'Dynamics', 'Solutions', 'Innovations', 'Digital', 'Cybernetics'],
  Financials: ['Capital', 'Holdings', 'Group', 'Partners', 'Ventures', 'Trust', 'Advisors'],
  Banks: ['Capital', 'Holdings', 'Group', 'Partners', 'Trust', 'Financial'],
  Energy: ['Industries', 'Dynamics', 'Global', 'Holdings', 'Resources', 'Power'],
  Industrials: ['Industries', 'Dynamics', 'Systems', 'Enterprises', 'Manufacturing', 'Works'],
  Consumer: ['Group', 'Enterprises', 'Global', 'Holdings', 'Ventures', 'Brands', 'Retail'],
};

export function generateUniqueName(baseName: string, sector: string, existingNames: Set<string>): string {
  const suffixPool = SECTOR_NAME_SUFFIXES[sector as Sector] ?? NAME_SUFFIXES;
  let attempt = 0;
  while (attempt < 200) {
    const p = NAME_PREFIXES[Math.floor(random() * NAME_PREFIXES.length)];
    const s = suffixPool[Math.floor(random() * suffixPool.length)];
    const useQualifier = attempt > 30 || random() < 0.3; // widen the space more aggressively once early attempts are exhausted
    const q = useQualifier ? NAME_QUALIFIERS[Math.floor(random() * NAME_QUALIFIERS.length)] : null;
    const name = q ? `${p} ${q} ${s}` : `${p} ${s}`;
    if (!existingNames.has(name)) {
      existingNames.add(name);
      return name;
    }
    attempt++;
  }
  return `${baseName} ${Math.floor(random() * 10000)} Corp`;
}

export function generateUniqueTicker(existingTickers: Set<string>): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempt = 0;
  while (attempt < 100) {
    let t = '';
    for (let i = 0; i < 4; i++) t += chars.charAt(Math.floor(random() * chars.length));
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
/**
 * SEG — how much thinner an SME pool's margin is than the named tier's in the same sector.
 * Small firms really do earn less per dollar of revenue: less purchasing power over inputs, no
 * scale in overhead, weaker pricing power. One number for the model, applied to the sector
 * margin below rather than a second margin table (rule 3 — one primitive per real quantity).
 */
export const SME_MARGIN_DISCOUNT = 0.35;

/**
 * SEG — the SME tier's opening share of total employment, before the named private tier is
 * carved out of it. Small firms employ roughly half of a developed economy's workers; this is
 * that fact. Two things keep it from being load-bearing: its split ACROSS industries is not
 * stated anywhere (it follows each industry's own demand — see the seed in
 * macro/initialization.ts), and the seed's own employment reconciliation then resets the tier's
 * TOTAL to the residual left by the real firms and the government, so this number sets the
 * pools' relative sizes and the named tier's carve basis rather than the final headcount.
 */
export const SME_TIER_EMPLOYMENT_SHARE = 0.60;

/**
 * SEG — the SME wage gap: how much less a small firm pays per worker than the economy's average
 * employer. A robust, well-documented fact in every developed economy (roughly a fifth to a
 * quarter), and the same structural reason as the margin discount above — lower value added per
 * worker, less scale, weaker bargaining position on both sides of the firm.
 *
 * It is load-bearing, not cosmetic. Paying every pool worker the economy-wide average income
 * charged the tier a wage bill sized by its EMPLOYMENT share while it earns its REVENUE share,
 * and those differ a lot by region: EUR's pools open with 58% of employment against 42% of
 * revenue, so 82% of their revenue went out as wages before any other cost, they were insolvent
 * from week 0, and the resulting layoff cascade took EUR unemployment past 30% by week 58.
 */
export const SME_WAGE_GAP = 0.22;

/**
 * SEG — how much less output an SME pool produces per worker than the named tier. Small firms
 * really are less productive per head: less capital per worker, no scale, thinner specialisation.
 * It is what turns a pool's REVENUE into the headcount that revenue supports, which is the
 * direction employment has to run — a pool employs who it can pay, and unemployment is what is
 * left over. The reverse (fix employment, let income follow) is what produced a tier carrying
 * 3.86M workers against revenue that had been carved down to support far fewer.
 */
export const SME_PRODUCTIVITY_DISCOUNT = 0.30;

/** The named tier's baseline EBITDA margin for a sector — the SME pools read this too, so one
 *  table serves both tiers. */
export function sectorBaselineMarginPct(sector: Sector): number {
  return SECTOR_PROFILE[sector]?.margin ?? 0.20;
}

/**
 * The rank-0 firm's profile per sector; smaller firms are scaled off it in `buildTemplate`.
 *
 * RULE 13, OPEN, on two of the four columns:
 *   `margin`  — a sector's EBITDA margin is an OUTCOME of its cost structure and how much
 *               competition it faces. IND (3) builds exactly that; until then it is stated, and
 *               it is stated at recognisably real levels.
 *   `beta`    — a beta is a MEASUREMENT: the covariance of a stock's returns with the market's.
 *               This model produces both series every week and never computes it. Stating beta
 *               and then using it to discount that same stock (`equity-valuation.ts:71`), to
 *               price its cost of capital in the labor decision (`labor-market.ts:159`) and to
 *               set its capital charge at seed is circular — the price is derived from a number
 *               the price should produce. Owner: IDX (7) or 07e, whichever measures returns.
 */
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

// Seed-only, for the opening credit rating. The bootstrapped curve already exists at this point
// (`yield-curves.ts`), so this could read it rather than assume a rate.
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
    rank,
    ...extra,
  };
}

// Deliberately flat across all 4 regions rather than scaled to relative region size: firm
// COUNT models market structure (how many distinct competitors exist in a sector), while each
// firm's actual scale (revBase, further downstream reshaped by deriveInitialRevenueUSD against
// the region's own generated demand) is what carries the region's real economic size — so a
// smaller region gets the same number of firms, just each proportionally smaller, matching how
// e.g. the UK and USA both have several major banks despite very different GDP.
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
  // Shares sum to 1.0 (they slice the one real regional institutional asset pool). The hedge-fund
  // slice is deliberately the smallest: real credit hedge funds run a small fraction of the
  // sector's assets, but they are the marginal buyer at the wides — the bid that exists when
  // mandate-constrained insurers and pension funds have none — so their weight matters far more
  // to where distressed paper clears than their size suggests.
  seeds.push(buildTemplate(region, 'Financials', 0.5, existingTickers, existingNames, {
    institutionalRole: 'INSURER',
    institutionalMarketShare: 0.42,
  }));
  // THREE asset managers, not one. A single manager per region could not sponsor a fund complex
  // without being a monoline, and real index sponsorship is a handful of competing houses each
  // running a MIX across equity and credit. The 0.33 sector slice is split between them by size,
  // so the region's institutional pool is unchanged — this is a split, not an addition.
  seeds.push(buildTemplate(region, 'Financials', 1.5, existingTickers, existingNames, {
    institutionalRole: 'ASSET_MANAGER',
    institutionalMarketShare: 0.17,
  }));
  seeds.push(buildTemplate(region, 'Financials', 4.5, existingTickers, existingNames, {
    institutionalRole: 'ASSET_MANAGER',
    institutionalMarketShare: 0.10,
  }));
  seeds.push(buildTemplate(region, 'Financials', 5.5, existingTickers, existingNames, {
    institutionalRole: 'ASSET_MANAGER',
    institutionalMarketShare: 0.06,
  }));
  seeds.push(buildTemplate(region, 'Financials', 2.5, existingTickers, existingNames, {
    institutionalRole: 'PENSION_FUND',
    institutionalMarketShare: 0.18,
  }));
  seeds.push(buildTemplate(region, 'Financials', 3.5, existingTickers, existingNames, {
    institutionalRole: 'HEDGE_FUND',
    institutionalMarketShare: 0.07,
  }));

  // OWN5: a bank's opening share of its region is its own size on the SAME firm-size curve
  // every other sector is generated from, normalised across the cohort. It replaces a private
  // table, `0.35 x 0.72^rank`, which used a second concentration decay and summed to 0.914 —
  // so 8.6% of every regional banking aggregate was carved out to no bank at all (rule 13).
  // From week 1 the share is not this number at all: it is measured off the deposits each bank
  // actually holds (02b).
  const bankScaleSum = Array.from({ length: BANKS_PER_REGION },
    (_, rank) => Math.pow(FIRM_CONCENTRATION_DECAY, rank)).reduce((a, b) => a + b, 0);
  for (let rank = 0; rank < BANKS_PER_REGION; rank++) {
    seeds.push(buildTemplate(region, 'Banks', rank, existingTickers, existingNames, {
      bankMarketShare: Number((Math.pow(FIRM_CONCENTRATION_DECAY, rank) / bankScaleSum).toFixed(4)),
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
