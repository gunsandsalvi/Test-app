/** A carrier's P&L: the freight it really carried against the fuel it really burned (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';
import { fuelPriceUsdPerTonne } from '../freight-clearing';
import { weeklyCapacityTonnes } from '../../../../domain/carrier';
import { laneDistanceNm } from '../../../../domain/geography';
import { ProfileInput, ProfilePnl } from './types';

export const carrierProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare,
    weeklyPayrollUSD } = input;
  let newRevenue = 0, newEbitdaMargin = 0, newEbitda = 0, newEbit = 0, newNetIncome = 0, newEps = 0;

  // XB3a-2: a carrier's revenue is the freight it actually carried this week, at the rate its
  // lanes cleared at — not units sold into the goods auction, which it does not participate
  // in. Its costs are the fuel it really burned at the refined-product market's own price and
  // the crew it really employs at the region's going wage, so a fuel spike or a wage round
  // lands on its margin the same week.
  const weeklyFreightUSD = ctx.carrierFreightRevenue[comp.ticker] ?? 0;
  newRevenue = Math.max(10, weeklyFreightUSD * 52);
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

  const fuelUsdPerTonne = fuelPriceUsdPerTonne(reg, (state as any).unitMassTonnes ?? {});
  let weeklyFuelTonnes = 0;
  (comp.carrierFleet?.assets ?? []).forEach((asset: any) => {
    const distanceNm = laneDistanceNm(asset.laneFrom, asset.laneTo);
    const perWeek = weeklyCapacityTonnes(asset, distanceNm);
    const voyages = asset.capacityTonnes > 0 ? perWeek / asset.capacityTonnes : 0;
    weeklyFuelTonnes += voyages * (asset.fuelTonnesPerNm ?? 0) * distanceNm;
  });
  const annualFuel = weeklyFuelTonnes * fuelUsdPerTonne * 52;
  // IND-R1, rule 3: ONE payroll. This used to be `sum(asset.crewCount) x crewAnnualWageUSD` —
  // a second wage bill computed off the fleet spec, which the labor market cannot touch, while
  // `employeeCount` (which it hires and fires, and which pays the households) moved
  // independently. A carrier builds its costs up rather than stating a margin, so it charges the
  // whole bill, not the deviation.
  const annualCrew = weeklyPayrollUSD * 52;
  newEbitda = newRevenue - annualFuel - annualCrew;
  newEbitdaMargin = newRevenue > 0 ? newEbitda / newRevenue : 0;
  newEbit = newEbitda - (comp.grossPPEUSD ?? 0) / 20;
  newNetIncome = (newEbit - annualInterest) * (newEbit > 0 ? (1 - taxRate) : 1);
  newEps = perShare(newNetIncome);
  if (comp.carrierFleet) {
    comp.carrierFleet.lastWeekTonneNm = ctx.carrierTonneNm[comp.ticker] ?? 0;
    comp.carrierFleet.lastWeekFreightRevenueUSD = weeklyFreightUSD;
  }

  return { newRevenue, newEbitdaMargin, newEbitda, newEbit, newNetIncome, newEps };
};
