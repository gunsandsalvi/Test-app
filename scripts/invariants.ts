import { createInitialGameState } from '../src/engine/simulation/initialization';
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { GameState, RegionId, Position } from '../src/types';

interface Violation {
  week: number;
  message: string;
}

const violations: Violation[] = [];

function checkNaNAndPurity(state: GameState, week: number) {
  state.companies.forEach(c => {
    if (isNaN(c.annualRevenue) || !isFinite(c.annualRevenue) ||
        isNaN(c.ebitda) || !isFinite(c.ebitda) ||
        isNaN(c.stockPrice) || !isFinite(c.stockPrice) ||
        isNaN(c.eps) || !isFinite(c.eps)) {
      violations.push({ week, message: `NaN/Infinity detected in company ${c.ticker}` });
    }
    (c.productLines || []).forEach(l => {
      if (isNaN(l.categoryMarketShare) || isNaN(l.competitiveness)) {
        violations.push({ week, message: `NaN in company ${c.ticker} productLine ${l.subUnitId || l.category}` });
      }
    });
  });

  (Object.keys(state.regions) as RegionId[]).forEach(id => {
    const r = state.regions[id];
    if (isNaN(r.gdpGrowth) || !isFinite(r.gdpGrowth) ||
        isNaN(r.inflation) || !isFinite(r.inflation) ||
        isNaN(r.unemploymentRate) || !isFinite(r.unemploymentRate) ||
        isNaN(r.policyRate) || !isFinite(r.policyRate)) {
      violations.push({ week, message: `NaN/Infinity in region ${id} macro` });
    }
    if (isNaN(r.bankingSector.bankCapitalRatio) || !isFinite(r.bankingSector.bankCapitalRatio) ||
        isNaN(r.bankingSector.netInterestMarginPct) || !isFinite(r.bankingSector.netInterestMarginPct)) {
      violations.push({ week, message: `NaN/Infinity in region ${id} banking` });
    }
  });

  const idx: any = state.compositeIndices;
  if (isNaN(idx.marketBreadth) || isNaN(idx.globalCreditComposite?.value)) {
    violations.push({ week, message: 'NaN/Infinity in composite indices' });
  }
}

function checkOwnershipConservation(state: GameState, week: number) {
  (Object.keys(state.regions) as RegionId[]).forEach(id => {
    const reg = state.regions[id];
    (['equityOwnership', 'corpBondOwnership', 'sovBondOwnership'] as const).forEach(key => {
      const o = reg[key];
      if (!o) return;
      const foreignSum = Object.values(o.foreignShare || {}).reduce((s: number, v: number) => s + v, 0);
      const totalShareAccounted = o.bankShare + o.institutionalShare + foreignSum + o.centralBankShare;
      const impliedHousehold = 1 - totalShareAccounted;
      if (totalShareAccounted < -0.001 || totalShareAccounted > 1.001 || impliedHousehold < -0.001 || impliedHousehold > 1.001) {
        violations.push({
          week,
          message: `Ownership conservation violated in region ${id} (${key}): accounted=${totalShareAccounted.toFixed(4)}, impliedHousehold=${impliedHousehold.toFixed(4)}`
        });
      }
    });
  });
}

function checkNavIdentity(state: GameState, week: number) {
  const activePositions = state.portfolio.positions.filter(p => !p.isClosed);
  const totalUnrealizedPnL = activePositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const expectedNav = Math.max(0, state.portfolio.cashUSD + totalUnrealizedPnL);
  const diff = Math.abs(state.portfolio.navUSD - expectedNav);
  if (diff > 0.01) {
    violations.push({
      week,
      message: `NAV identity mismatch: portfolio.navUSD=${state.portfolio.navUSD}, expected=${expectedNav} (cash=${state.portfolio.cashUSD}, unrealized=${totalUnrealizedPnL})`
    });
  }
}

function runInvariantsHarness() {
  console.log('--- STARTING INVARIANTS HARNESS (260 WEEKS) ---');
  let state = createInitialGameState();
  const initialRevenueByTicker = new Map(state.companies.map(c => [c.ticker, c.annualRevenue]));
  let knownTickers = new Set(state.companies.map(c => c.ticker));

  for (let w = 1; w <= 260; w++) {
    if (w % 52 === 0 || w === 1) {
      console.log(`[Invariants Harness] Week ${w}...`);
    }
    // Inject scripted trades at week 5 to test NAV with IRS, CDS, and leveraged positions
    if (w === 5) {
      const testIrs: Position = {
        id: 'test-irs-1',
        symbol: 'USD_5Y_IRS',
        name: 'USD 5Y IRS',
        assetType: 'IRS',
        direction: 'PAY_FIXED',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1,
        entryPrice: 0.04,
        currentPrice: 0.04,
        notional: 10_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 100_000,
        maintenanceMargin: 80_000,
        weeklyFinancingCost: 0,
        openedWeek: 5,
        isClosed: false,
      };
      const testCds: Position = {
        id: 'test-cds-1',
        symbol: 'US_IG_CDS',
        name: 'US IG CDS',
        assetType: 'CDS',
        direction: 'BUY_PROTECTION',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1,
        entryPrice: 100,
        currentPrice: 100,
        notional: 5_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 50_000,
        maintenanceMargin: 40_000,
        weeklyFinancingCost: 0,
        openedWeek: 5,
        isClosed: false,
      };
      const testLeveraged: Position = {
        id: 'test-lev-1',
        symbol: state.companies[0].ticker,
        name: state.companies[0].name,
        assetType: 'EQUITY',
        direction: 'LONG',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1000,
        entryPrice: state.companies[0].stockPrice,
        currentPrice: state.companies[0].stockPrice,
        notional: 2_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 200_000,
        maintenanceMargin: 150_000,
        weeklyFinancingCost: 500,
        openedWeek: 5,
        isClosed: false,
      };
      state = {
        ...state,
        portfolio: {
          ...state.portfolio,
          positions: [...state.portfolio.positions, testIrs, testCds, testLeveraged],
        },
      };
    }

    state = advanceWeeklyStep(state);

    // 1. Check NaN/Infinity
    checkNaNAndPurity(state, w);

    // 3. Disjoint set: isDefaulted and mergerAcquired
    state.companies.forEach(c => {
      if (c.isDefaulted && (c as any).mergerAcquired) {
        violations.push({
          week: w,
          message: `Company ${c.ticker} is both defaulted and mergerAcquired!`
        });
      }
    });

    // 4. Ownership conservation
    checkOwnershipConservation(state, w);

    // 5. NAV identity
    checkNavIdentity(state, w);

    // 6. Bank capital ratio & NIM bands for USA
    const usaBank = state.regions.USA.bankingSector;
    if (usaBank.bankCapitalRatio < 0.05 || usaBank.bankCapitalRatio > 0.35) {
      violations.push({
        week: w,
        message: `USA Bank capital ratio out of band [0.05, 0.35]: ${usaBank.bankCapitalRatio.toFixed(4)}`
      });
    }
    if (usaBank.netInterestMarginPct < 0.01 || usaBank.netInterestMarginPct > 0.08) {
      violations.push({
        week: w,
        message: `USA Bank NIM out of band [0.01, 0.08]: ${usaBank.netInterestMarginPct.toFixed(4)}`
      });
    }

    // 7. IPO EPS accuracy
    state.companies.forEach(c => {
      if (!knownTickers.has(c.ticker)) {
        knownTickers.add(c.ticker);
        if (c.sharesOutstanding && c.sharesOutstanding > 0) {
          const calcEps = c.netIncome / c.sharesOutstanding;
          const diffPct = Math.abs(calcEps - c.eps) / Math.max(0.001, Math.abs(c.eps));
          if (diffPct > 0.15) {
            violations.push({
              week: w,
              message: `New IPO company ${c.ticker} EPS mismatch: stored=${c.eps}, calc=${calcEps.toFixed(4)} (diff=${(diffPct*100).toFixed(1)}%)`
            });
          }
        }
      }
    });
  }

  // 2. Revenue > 20x baseline check
  state.companies.forEach(c => {
    const initRev = initialRevenueByTicker.get(c.ticker);
    if (initRev && c.annualRevenue > initRev * 20) {
      violations.push({
        week: 260,
        message: `Company ${c.ticker} revenue grew >20x initial baseline (${initRev} -> ${c.annualRevenue})`
      });
    }
  });

  if (violations.length === 0) {
    console.log('✅ INVARIANTS HARNESS PASSED — 260 weeks, all assertions satisfied!');
    process.exit(0);
  } else {
    console.error(`❌ INVARIANTS HARNESS FAILED — ${violations.length} violation(s):`);
    violations.forEach(v => console.error(`  [Week ${v.week}] ${v.message}`));
    process.exit(1);
  }
}

runInvariantsHarness();
