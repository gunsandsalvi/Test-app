import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w % 52 === 0) {
    const reg = state.regions.USA as any;
    const trackedFirms = state.companies.filter(f => f.region === 'USA' && !f.isDefaulted);
    const trackedInvestmentUSD = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = (reg.privateSectorSegments || []).reduce((s, seg: any) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const I = trackedInvestmentUSD * investmentScaleFactor;
    console.log(`Year ${w/52} (W${w}): trackedEmp=${trackedEmployment} totalPrivEmp=${totalPrivateEmployment} scaleFactor=${investmentScaleFactor.toFixed(1)} trackedCapex=${(trackedInvestmentUSD/1e9).toFixed(1)}B I=${(I/1e12).toFixed(2)}T`);
  }
}
