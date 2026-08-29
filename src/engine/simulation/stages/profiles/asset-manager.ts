/** An asset manager's P&L: fees on the book its entity actually marks (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';

import { ProfileInput, ProfilePnl } from './types';

export const assetManagerProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, state, entityById } = input;
  let newRevenue = 0;

  const instEnt = entityById.get(comp.id);
  // One balance sheet, one representation (S11): where a real InstitutionalEntity backs this
  // company, its AUM IS that entity's marked book — totalAssetsUSD is recomputed weekly from
  // real cash and real holdings (institutional-balance-sheet.ts), so the drift-by-index
  // formula only survives for manager companies with no entity behind them.
  const equityIndex = comp.region === 'USA' ? state.compositeIndices.usaComposite : comp.region === 'EUR' ? state.compositeIndices.eurComposite : comp.region === 'UK' ? state.compositeIndices.ukComposite : state.compositeIndices.jpnComposite;
  const marketGrowth = equityIndex.value / Math.max(1, equityIndex.historical[equityIndex.historical.length - 2] ?? equityIndex.value);
  const flows = (random() - 0.4) * 0.01;
  comp.aumUSD = instEnt
    ? instEnt.totalAssetsUSD
    : (comp.aumUSD ?? comp.annualRevenue * 50) * marketGrowth * (1 + flows);
  comp.managementFeeRate = comp.managementFeeRate ?? (0.005 + random() * 0.005);

  const weeklyFees = comp.aumUSD * comp.managementFeeRate / 52;
  newRevenue = Math.max(10, weeklyFees * 52);
  // §7.122 step 3: the stated 0.35 margin is gone. A manager's costs are its people and its
  // technology, both common and both real, and it has no third cost of its own — which is why
  // its basket is the lightest in the registry and its margin the highest.
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
  return { newRevenue, profileCostsAnnualUSD: 0 };
};
