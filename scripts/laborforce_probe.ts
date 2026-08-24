// scripts/laborforce_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [1, 13, 26, 52, 104, 208, 364, 520];

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    const prevActiveFirms = state.companies.filter(c => !c.isDefaulted && c.region === 'USA');
    const pubEmp = prevActiveFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalLaborForce = r.totalPopulation * (1 - r.nonEmployablePct) * r.laborForceParticipation;
    const untrackedEmp = (r.privateSectorSegments || []).reduce((s, seg) => s + seg.employment, 0);
    const totalEmployed = pubEmp + r.governmentEmployment + untrackedEmp;
    const healthSignal = prevActiveFirms.reduce((s, f) => s + (f.annualRevenue - (f.baselineAnnualRevenue || f.annualRevenue)) / Math.max(1, (f.baselineAnnualRevenue || f.annualRevenue)), 0) / prevActiveFirms.length;

    console.log(JSON.stringify({
      week: w,
      regime: r.cycleRegime,
      simulatedUnemployment: +r.unemploymentRate.toFixed(4),
      bottomUpUnemployment: +r.unemploymentRateBottomUp.toFixed(4),
      pubEmp,
      govEmp: r.governmentEmployment,
      untrackedEmp,
      totalEmployed,
      totalLaborForce: Math.round(totalLaborForce),
      healthSignal: +healthSignal.toFixed(5),
      participation: +r.laborForceParticipation.toFixed(4),
      nonEmployablePct: +r.nonEmployablePct.toFixed(4),
    }));
  }
}
