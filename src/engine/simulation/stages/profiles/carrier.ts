/** A carrier's P&L: the freight it really carried against the fuel it really burned (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';
import { fuelPriceUsdPerTonne } from '../freight-clearing';
import { weeklyCapacityTonnes } from '../../../../domain/carrier';
import { laneDistanceNm } from '../../../../domain/geography';
import { ProfileInput, ProfilePnl } from './types';

export const carrierProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare,
    weeklyPayrollUSD } = input;
  let newRevenue = 0;

  // XB3a-2: a carrier's revenue is the freight it actually carried this week, at the rate its
  // lanes cleared at — not units sold into the goods auction, which it does not participate
  // in. Its costs are the fuel it really burned at the refined-product market's own price and
  // the crew it really employs at the region's going wage, so a fuel spike or a wage round
  // lands on its margin the same week.
  const weeklyFreightUSD = ctx.carrierFreightRevenue[comp.ticker] ?? 0;
  newRevenue = Math.max(10, weeklyFreightUSD * 52);
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

  const fuelUsdPerTonne = fuelPriceUsdPerTonne(reg, state.unitMassTonnes ?? {});
  // §4.0 Tier 1 item 14 — FUEL BURNS ON VOYAGES SAILED, NOT ON THE FLEET'S EXISTENCE. This
  // charged every asset its FULL-CAPACITY voyage schedule every week while revenue was only
  // the freight actually carried — a fleet at 1% utilization paid 100% steaming costs, and all
  // twelve carriers bled to death by mid-run (§7.253: 0 of 12 alive, logistics 0.03% of GDP).
  // An idle ship is laid up; fuel scales with the tonne-miles the carrier really moved this
  // week against what the fleet could move, bounded at 1 by physics (it cannot sail more than
  // its capacity).
  let fullFleetFuelTonnes = 0;
  let capacityTonneNm = 0;
  (comp.carrierFleet?.assets ?? []).forEach((asset: any) => {
    const distanceNm = laneDistanceNm(asset.laneFrom, asset.laneTo);
    const perWeek = weeklyCapacityTonnes(asset, distanceNm);
    const voyages = asset.capacityTonnes > 0 ? perWeek / asset.capacityTonnes : 0;
    fullFleetFuelTonnes += voyages * (asset.fuelTonnesPerNm ?? 0) * distanceNm;
    capacityTonneNm += perWeek * distanceNm;
  });
  const utilization = capacityTonneNm > 0
    ? Math.min(1, (ctx.carrierTonneNm[comp.ticker] ?? 0) / capacityTonneNm)
    : 0;
  const annualFuel = fullFleetFuelTonnes * utilization * fuelUsdPerTonne * 52;
  // IND-R1, rule 3: ONE payroll. This used to be `sum(asset.crewCount) x crewAnnualWageUSD` —
  // a second wage bill computed off the fleet spec, which the labor market cannot touch, while
  // `employeeCount` (which it hires and fires, and which pays the households) moved
  // independently. The crew bill is the common payroll now, charged by the caller; fuel is the
  // one cost that is genuinely a carrier's own.
  if (comp.carrierFleet) {
    comp.carrierFleet.lastWeekTonneNm = ctx.carrierTonneNm[comp.ticker] ?? 0;
    comp.carrierFleet.lastWeekFreightRevenueUSD = weeklyFreightUSD;
  }

  return { newRevenue, profileCostsAnnualUSD: annualFuel };
};
