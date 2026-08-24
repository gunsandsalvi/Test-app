import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { priceCorporateBond } from '../src/engine/pricing';
let state = createInitialGameState();
for (let w = 1; w <= 260; w++) state = advanceWeeklyStep(state);
const reg = state.regions.USA;
(reg.govDebtTranches || []).forEach(t => {
  const remainingTenorYears = Math.max(0.01, (t.maturityWeek - state.currentWeek) / 52);
  const p = priceCorporateBond(remainingTenorYears, t.couponRate, reg.yieldCurveParams, 15, false, 0.40);
  console.log(JSON.stringify({ id: t.id, couponRate: t.couponRate, remainingTenorYears: +remainingTenorYears.toFixed(2), price: +p.price.toFixed(2), ytm: +(p.yieldToMaturity*100).toFixed(2) }));
});
