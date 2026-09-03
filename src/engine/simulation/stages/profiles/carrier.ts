/** A carrier's P&L: the freight it really carried against the fuel it really burned (moved verbatim from stage 08, BP1c). */

import { ensureV2, rowOf, revHistPush } from '../../../../engine2/world';
import { weeklyCapacityTonnes } from '../../../../domain/carrier';
import { laneDistanceNm } from '../../../../domain/geography';
import { ProfileInput, ProfilePnl } from './types';

export const carrierProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, state, ctx } = input;

  // XB3a-2: a carrier's revenue is the freight it actually carried this week, at the rate its
  // lanes cleared at — not units sold into the goods auction, which it does not participate
  // in. Its costs are the fuel it really burned at the refined-product market's own price and
  // the crew it really employs at the region's going wage, so a fuel spike or a wage round
  // lands on its margin the same week.
  const weeklyFreightUSD = ctx.carrierFreightRevenue[comp.ticker] ?? 0;
  const newRevenue = Math.max(10, weeklyFreightUSD * 52);
  { const v2r = ensureV2(state); revHistPush(v2r, rowOf(v2r, comp.id), newRevenue); }

  // FUEL BURNS ON VOYAGES SAILED, NOT ON THE FLEET'S EXISTENCE. This
  // charged every asset its FULL-CAPACITY voyage schedule every week while revenue was only
  // the freight actually carried — a fleet at 1% utilization paid 100% steaming costs, and all
  // twelve carriers bled to death by mid-run.
  // An idle ship is laid up; fuel scales with the tonne-miles the carrier really moved this
  // week against what the fleet could move, bounded at 1 by physics (it cannot sail more than
  // its capacity).
  let fullFleetFuelTonnes = 0;
  let capacityTonneNm = 0;
  (comp.carrierFleet?.assets ?? []).forEach((asset) => {
    const distanceNm = laneDistanceNm(asset.laneFrom, asset.laneTo);
    const perWeek = weeklyCapacityTonnes(asset, distanceNm);
    const voyages = asset.capacityTonnes > 0 ? perWeek / asset.capacityTonnes : 0;
    fullFleetFuelTonnes += voyages * (asset.fuelTonnesPerNm ?? 0) * distanceNm;
    capacityTonneNm += perWeek * distanceNm;
  });
  const utilization = capacityTonneNm > 0
    ? Math.min(1, (ctx.carrierTonneNm[comp.ticker] ?? 0) / capacityTonneNm)
    : 0;
  // WHAT THE FLEET BURNS, AS A MEASUREMENT. It used to be CHARGED here as well — an annual fuel
  // bill expensed against a purchase that never happened, so the world fleet's bunker demand
  // never reached `refined_products` and nobody was paid for it. A carrier now buys its inputs
  // through the goods auction like every other firm, from the logistics sub-unit's own recipe
  // (the registry's number for exactly this activity), and the caller charges what it paid.
  // This stays as the physical burn the fleet reports; the remaining gap is that the BID is
  // sized off revenue rather than off these tonnes, which is a real difference in a fuel spike.
  const weeklyFuelTonnes = fullFleetFuelTonnes * utilization;
  // IND-R1, rule 4: ONE payroll. This used to be `sum(asset.crewCount) x crewAnnualWageUSD` —
  // a second wage bill computed off the fleet spec, which the labor market cannot touch, while
  // `employeeCount` (which it hires and fires, and which pays the households) moved
  // independently. The crew bill is the common payroll now, charged by the caller; fuel is the
  // one cost that is genuinely a carrier's own.
  if (comp.carrierFleet) {
    comp.carrierFleet.lastWeekTonneNm = ctx.carrierTonneNm[comp.ticker] ?? 0;
    comp.carrierFleet.lastWeekFreightRevenueUSD = weeklyFreightUSD;
    comp.carrierFleet.lastWeekFuelBurnedTonnes = weeklyFuelTonnes;
  }

  return { newRevenue, profileCostsAnnualUSD: 0 };
};
