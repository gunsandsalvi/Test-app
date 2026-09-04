/**
 * Firm Generation Primitives
 *
 * Step 3 of the generative bootstrap pipeline. Spawns the seed set of firms for each
 * region/sector from a Pareto/Zipf concentration curve instead of a hand-set roster.
 * Credit ratings are computed from each firm's generated leverage/coverage via
 * determineCreditRating, so ratings are an output of the generation, not an input.
 */

import { RegionId, Sector, CreditRating } from '../../types';
import { HedgeFundStrategy } from '../../domain/institutions';
import { determineCreditRating } from '../simulation/credit';
import { COVENANT_LEVERAGE_CEILING } from '../simulation/stages/corporate-financing';
import { GENERATED_COMMODITIES } from './commodities-and-fx';
import { random } from '../rng';
import { SEED_FIRM_CONCENTRATION_DECAY, SEED_INSURER_INSTITUTIONAL_SHARE } from '../../domain/stated';
import { asTicker, type Ticker } from '../../domain/ids';

export interface FirmSeedTemplate {
  ticker: Ticker;
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
  /** HF1 — which strategy this hedge fund runs. */
  hedgeFundStrategy?: HedgeFundStrategy;
  producedCommodityId?: string;
}

/** HF1: the four books, in size order — macro is the largest, as it is in reality. */
export const HEDGE_FUND_STRATEGIES: HedgeFundStrategy[] =
  ['GLOBAL_MACRO', 'LONG_SHORT_EQUITY', 'LONG_SHORT_CREDIT', 'DISTRESSED'];

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

/** §3.13-BOOK slice (c2c): THE MINT. Every ticker in the world is generated here or cloned
 *  from a template that was, so this is where the brand is admitted for the whole space. */
export function generateUniqueTicker(existingTickers: ReadonlySet<Ticker>): Ticker {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempt = 0;
  while (attempt < 100) {
    let raw = '';
    for (let i = 0; i < 4; i++) raw += chars.charAt(Math.floor(random() * chars.length));
    const t = asTicker(raw);
    if (!existingTickers.has(t)) {
      (existingTickers as Set<Ticker>).add(t);
      return t;
    }
    attempt++;
  }
  return asTicker('XXXX');
}

// A firm's rank within its sector (0 = largest) sets its scale via a Pareto/Zipf decay —
// the same few-large/many-small concentration pattern used for category revenue splitting.
/** R: declared in the registry (domain/stated.ts) — the seed's rank-to-rank size decay. */
const FIRM_CONCENTRATION_DECAY = SEED_FIRM_CONCENTRATION_DECAY;

// Per-sector structural profile for the rank-0 (largest) firm: EBITDA margin, leverage
// (debt/EBITDA) and cash intensity (cash/EBITDA). Lower-ranked (smaller) firms in the same
// sector are progressively thinner-margined and more levered, reflecting scale economics
// rather than independently hand-set financials.
/**
 * SEG — how much thinner an SME pool's margin is than the named tier's in the same sector.
 * Small firms really do earn less per dollar of revenue: less purchasing power over inputs, no
 * scale in overhead, weaker pricing power. One number for the model, applied to the sector
 * margin below rather than a second margin table (rule 4 — one primitive per real quantity).
 */
export const SME_MARGIN_DISCOUNT = 0.35;


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
 *               competition it faces. IND builds exactly that; until then it is stated, and
 *               it is stated at recognisably real levels.
 *   `beta`    — a beta is a MEASUREMENT: the covariance of a stock's returns with the market's.
 *               This model produces both series every week and never computes it. Stating beta
 *               and then using it to discount that same stock (`equity-valuation.ts:71`), to
 *               price its cost of capital in the labor decision (`labor-market.ts:159`) and to
 *               set its capital charge at seed is circular — the price is derived from a number
 *               the price should produce. Owner: IDX or 07e, whichever measures returns.
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

/**
 * IND8 — the least levered a firm opens, as a share of what its lenders would fund. The upper
 * end is the covenant ceiling itself: a firm that has used all its capacity. Firms sit across
 * that range because their financing histories differed, which is the one thing the seed cannot
 * reconstruct and must therefore draw. It is a dispersion, not a level — the LEVEL is the
 * engine's own covenant rule.
 */
export const MIN_COVENANT_TAKEUP = 0.15;

/**
 * DIST — the SME pool's leverage cross-section, struck from the SAME rule the named tier uses.
 *
 * A named firm draws `leverageTakeup` uniformly on `[MIN_COVENANT_TAKEUP, 1]` of its covenant
 * capacity (IND8, §7.113). A pool is the same population one resolution coarser, so its strata
 * are equal-weight QUANTILES of that same draw — no second distribution, no fitted shape, and no
 * real-world dispersion imported (§7.4: seed by the engine's own code).
 *
 * The strata are then scaled so their weighted mean is the pool's OWN measured leverage, which
 * keeps the aggregate exactly where it was: this adds a cross-section, it does not restate the
 * debt (rule 4).
 */
export function seedPoolLeverageStrata(meanLeverageMultiple: number, strataCount: number): { weight: number; leverageMultiple: number }[] {
  if (!(strataCount > 0) || !(meanLeverageMultiple > 0)) return [];
  const takeups: number[] = [];
  for (let i = 0; i < strataCount; i++) {
    const u = (i + 0.5) / strataCount;
    takeups.push(MIN_COVENANT_TAKEUP + u * (1 - MIN_COVENANT_TAKEUP));
  }
  const meanTakeup = takeups.reduce((a, b) => a + b, 0) / takeups.length;
  const scale = meanTakeup > 0 ? meanLeverageMultiple / meanTakeup : 0;
  return takeups.map((t) => ({
    weight: Number((1 / strataCount).toFixed(6)),
    leverageMultiple: Number((t * scale).toFixed(4)),
  }));
}

/** DIST — how many strata a pool carries. §5-DIST's threshold artifact is 1/K, and the measured
 *  mass within 10% of the covenant threshold is 11.2%, so K must resolve finer than that. */
export const SME_POOL_STRATA_COUNT = 20;

function ratingFor(revBase: number, ebitdaMargin: number, debtBase: number): CreditRating {
  const ebitda = revBase * ebitdaMargin;
  const ebit = Math.max(1, ebitda - revBase * 0.05); // 5% D&A, matches downstream company construction
  const interestExpense = Math.max(1, debtBase * INTEREST_RATE_ASSUMPTION);
  const leverage = debtBase / Math.max(1, ebitda);
  const coverage = ebit / interestExpense;
  // CRD/§7.4: same facts as the weekly rater, so a template with no earnings rates as one.
  return determineCreditRating(leverage, coverage, { ebitdaLocal: ebitda });
}

function buildTemplate(
  region: RegionId,
  sector: Sector,
  rank: number,
  existingTickers: Set<Ticker>,
  existingNames: Set<string>,
  extra?: Partial<FirmSeedTemplate>
): FirmSeedTemplate {
  const profile = SECTOR_PROFILE[sector];
  const scale = Math.pow(FIRM_CONCENTRATION_DECAY, rank);
  const revBase = Math.round(FIRM_SCALE_UNIT_USD * scale);
  // Smaller (higher-rank) firms run thinner margins and carry proportionally more debt.
  const ebitdaMargin = Number(Math.max(0.05, profile.margin * (0.65 + 0.35 * scale)).toFixed(3));
  // IND8 — WHERE A FIRM'S OWN FINANCING HISTORY LEFT IT.
  //
  // `buildTemplate` is deterministic in (sector, rank), so leverage used to be a flat sector
  // constant scaled by size: every firm of a given sector and size opened with an IDENTICAL
  // balance sheet, and the whole universe's credit quality was a projection of seven sector
  // curves. Measured at seed: 199 listed USA non-financials at debt/EBITDA p50 2.0x and p90
  // 3.5x — **98% investment grade, zero BBB, zero high yield**, so the high-yield cohort 07b and
  // 07d exist to price had no issuers at all and the credit market could not price risk.
  //
  // A firm's leverage is where its own past financing decisions left it, and the model has no
  // past — so the seed must draw it. What it must not do is draw the SAME number for every firm.
  // The draw is bounded by the ENGINE'S OWN covenant rule rather than a new table: a firm sits
  // somewhere between an unlevered sheet and what its lenders would actually fund at its own
  // credit quality (`COVENANT_LEVERAGE_CEILING`, `corporate-financing.ts`). The ceiling is taken
  // at the firm's UNLEVERED quality and applied once — iterating to a fixed point runs away,
  // because in that table a weaker credit carries a LOOSER covenant (which is descriptively
  // right: high-yield issuers do run higher leverage) and each downgrade would license more debt.
  //
  // The rating below is then computed from the leverage this actually produced — an outcome, by
  // the same `determineCreditRating` the weekly stage uses (§7.4: one rater, seed and week).
  const unleveredLeverage = profile.leverage * (1 + (1 - scale) * 0.5);
  const unleveredRating = ratingFor(revBase, ebitdaMargin, revBase * ebitdaMargin * unleveredLeverage);
  const covenantCeiling = COVENANT_LEVERAGE_CEILING[unleveredRating] ?? 4.0;
  const leverageTakeup = MIN_COVENANT_TAKEUP + random() * (1 - MIN_COVENANT_TAKEUP);
  const debtBase = Math.round(revBase * ebitdaMargin * covenantCeiling * leverageTakeup);
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
// firm's actual scale (revBase, further downstream reshaped by deriveInitialRevenueLocal against
// the region's own generated demand) is what carries the region's real economic size — so a
// smaller region gets the same number of firms, just each proportionally smaller, matching how
// e.g. the UK and USA both have several major banks despite very different GDP.
const SECTOR_FIRM_COUNT: Partial<Record<Sector, number>> = {
  Tech: 10,
  Energy: 10,
  Financials: 8, // + the specialty roles (insurers, asset managers, a pension fund, hedge funds) added separately
  Industrials: 10,
  Consumer: 10,
};

const BANKS_PER_REGION = 4;
const INSURERS_PER_REGION = 3;
const COMMODITY_PRODUCERS_PER_CATEGORY = 2; // per generic commodity id, per region

export function generateFirmSeeds(
  region: RegionId,
  existingTickers: Set<Ticker> = new Set<Ticker>(),
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
  // INS (user, 2026-09-02): THREE insurers, not one. A single insurer per region carried the
  // whole sector's 0.42 slice — too big to fail and with no competitor to lose a policy to, so
  // nothing about its price or its capital was ever tested. They split the SAME slice on the
  // firm-size curve every other cohort is generated from (the asset managers' and the hedge
  // funds' precedent): a split, not an addition — the region's institutional pool is unchanged.
  const insurerShareSum = Array.from({ length: INSURERS_PER_REGION },
    (_, i) => Math.pow(FIRM_CONCENTRATION_DECAY, i)).reduce((a, b) => a + b, 0);
  for (let i = 0; i < INSURERS_PER_REGION; i++) {
    seeds.push(buildTemplate(region, 'Financials', 0.5 + i * 0.25, existingTickers, existingNames, {
      institutionalRole: 'INSURER',
      institutionalMarketShare: SEED_INSURER_INSTITUTIONAL_SHARE * (Math.pow(FIRM_CONCENTRATION_DECAY, i) / insurerShareSum),
    }));
  }
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
  // HF1: four funds, not one. The single hedge fund was the whole elastic side of the FX market
  // and the whole distressed bid at once. They split the sector's share on the same firm-size
  // curve every other cohort is generated from, so no new concentration number is introduced.
  const hfShareSum = HEDGE_FUND_STRATEGIES
    .reduce((a, _s, i) => a + Math.pow(FIRM_CONCENTRATION_DECAY, i), 0);
  HEDGE_FUND_STRATEGIES.forEach((strategy, i) => {
    seeds.push(buildTemplate(region, 'Financials', 3.5 + i * 0.25, existingTickers, existingNames, {
      institutionalRole: 'HEDGE_FUND',
      institutionalMarketShare: 0.07 * (Math.pow(FIRM_CONCENTRATION_DECAY, i) / hfShareSum),
      hedgeFundStrategy: strategy,
    }));
  });

  // OWN5: a bank's opening share of its region is its own size on the SAME firm-size curve
  // every other sector is generated from, normalised across the cohort. It replaces a private
  // table, `0.35 x 0.72^rank`, which used a second concentration decay and summed to 0.914 —
  // so 8.6% of every regional banking aggregate was carved out to no bank at all (rule 2).
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
