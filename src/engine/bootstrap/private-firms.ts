/**
 * Seeds for the named private tier of the hidden corporate sector — HC Wave 1, phase HC1.
 *
 * The hidden sector is 56.5% of the economy and was five aggregate scalars. This module carves
 * its UPPER TAIL into ~300 real named firms per region: the companies large enough to carry
 * syndicated debt, be bought by sponsors, and eventually go public. The long tail of small
 * businesses deliberately stays in the segment aggregates (bank-financed, statistical), because
 * a million bakeries are a pool and a 400-person regional manufacturer is a firm.
 *
 * Sizes draw from a Pareto tail because real firm sizes are power-law distributed — the
 * structural fact that makes "a few hundred names plus a mass" the right representation at all.
 *
 * CONSERVATION is the build discipline (plan §5-HC): everything a named firm carries is carved
 * OUT of its segment's aggregate, never added on top. In HC1 that is DEBT — each firm's real
 * ladder is subtracted from its segment's debtUSD, so total private debt is unchanged to the
 * dollar. Revenue and employment are set as real attributes here (the credit market needs real
 * leverage and coverage) but the segments keep carrying the goods economy and the labor demand
 * until HC3 hands both over in one conservation-checked pass — until then a private firm's
 * revenue is a credit attribute, not a GDP participant.
 */

import { RegionId } from '../../domain/geography';
import { PrivateSegmentType } from '../../domain/region-macro';

export interface PrivateFirmSeed {
  segmentType: PrivateSegmentType;
  annualRevenueUSD: number;
  ebitdaMargin: number;
  /** Debt / EBITDA. The sponsor-style subset carries real LBO leverage — that is what a real
   * levered private tier looks like, and it is where the economy's B/BB paper actually lives. */
  leverage: number;
  sponsorStyle: boolean;
  employeeCount: number;
}

export const PRIVATE_FIRMS_PER_REGION = 300;
/** Share of each segment's REVENUE attributed to the named tier (the upper tail). The tier's
 * DEBT is whatever real leverage on that revenue's EBITDA supports — deliberately NOT a share
 * of the segment's debt scalar, which at 2x revenue implies ~15x debt/EBITDA sector-wide and
 * is itself flagged in the plan as an unpriced bootstrap primitive. */
export const NAMED_TIER_REVENUE_SHARE = 0.6;
/** Pareto tail index for firm sizes (~80/20 mass concentration). */
const PARETO_ALPHA = 1.16;
/** Share of named private firms that are sponsor-owned in style (real LBO-level leverage). */
const SPONSOR_STYLE_SHARE = 0.4;

/** Deterministic-ish margins by segment, matching the segment profiles' economics. */
const SEGMENT_MARGIN: Record<PrivateSegmentType, number> = {
  MANUFACTURING: 0.14,
  PROFESSIONAL_SERVICES: 0.18,
  RETAIL_TRADE: 0.08,
  CONSTRUCTION_REALESTATE: 0.12,
  HEALTHCARE_SERVICES: 0.15,
};

export function generatePrivateFirmSeeds(
  _region: RegionId,
  segments: { segmentType: PrivateSegmentType; annualRevenueUSD: number; debtUSD: number; employment: number }[]
): PrivateFirmSeed[] {
  const totalRevenueUSD = segments.reduce((a, s) => a + s.annualRevenueUSD, 0) || 1;
  const seeds: PrivateFirmSeed[] = [];

  segments.forEach((seg) => {
    const n = Math.max(20, Math.round(PRIVATE_FIRMS_PER_REGION * (seg.annualRevenueUSD / totalRevenueUSD)));

    // Draw the tail: evenly spaced quantiles of a Pareto (deterministic — bootstrap generation
    // is reproducible-by-shape, and quantiles avoid a lucky/unlucky draw deciding the carve).
    const rawSizes: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      rawSizes.push(Math.pow(1 - u, -1 / PARETO_ALPHA));
    }
    const rawSum = rawSizes.reduce((a, b) => a + b, 0);

    // Revenue attribute per firm: the named tier's revenue share mirrors its debt share of the
    // segment — the tier that carries the syndicated debt is the tier with the revenue behind
    // it. (Attribute only until HC3 — see module comment.)
    const tierRevenueUSD = seg.annualRevenueUSD * NAMED_TIER_REVENUE_SHARE;
    const productivityUSD = seg.annualRevenueUSD / Math.max(1, seg.employment);

    rawSizes.forEach((raw, i) => {
      const revenueUSD = tierRevenueUSD * (raw / rawSum);
      const margin = SEGMENT_MARGIN[seg.segmentType];
      // Sponsor-style concentrates in the middle of the size distribution (real LBOs do — the
      // largest private firms are founder/family empires, the smallest are below sponsor size).
      const sizeRank = i / Math.max(1, n - 1); // 0 = largest (quantile order), 1 = smallest
      const sponsorStyle = sizeRank > 0.15 && sizeRank < 0.15 + SPONSOR_STYLE_SHARE;
      const leverage = sponsorStyle
        ? 4.5 + 2.0 * ((i * 7919) % 100) / 100 // 4.5–6.5, deterministic spread
        : 1.5 + 3.0 * ((i * 104729) % 100) / 100; // 1.5–4.5
      seeds.push({
        segmentType: seg.segmentType,
        annualRevenueUSD: revenueUSD,
        ebitdaMargin: margin,
        leverage,
        sponsorStyle,
        employeeCount: Math.max(25, Math.round(revenueUSD / Math.max(50_000, productivityUSD))),
      });
    });
  });

  return seeds;
}
