import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED } from '../src/engine/rng';

// Same seed, same world. Pass SEED=<n> to check a result against a genuinely different economy
// rather than against the noise an unseeded run used to produce.
const SEED = Number(process.env.SEED ?? DEFAULT_SIMULATION_SEED);

// How long to run. 60 weeks is the working default — every real finding in this project has come
// from the first sixty, and a change can be checked in a minute instead of half an hour. The full
// 260-week run belongs at the close of a section, where the long-horizon degradation items
// (#67 bank capital, #18 revenue runaway) actually live: WEEKS=260 npm run verify
const WEEKS = Number(process.env.WEEKS ?? 60);
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { GameState, RegionId, Position } from '../src/types';
import { executeTrade } from "../src/engine/simulation/trade";

interface Violation {
  week: number;
  message: string;
}

const violations: Violation[] = [];
let damperBindStreak = new Map<string, number>();
const damperPersistentBinds = new Set<string>();
let damperWorstStreak = 0;
let prevStateForBookCheck: GameState | null = null;

/**
 * Securities do not change hands for free. Every fill in a clearing stage has a cash leg, so an
 * institution's book — its cash plus the market value of what it holds — can only change by the
 * bid/ask it paid the dealer and by whatever real income or redemption it received. It cannot
 * simply grow because the clearing engine handed it more securities.
 *
 * This is the check that keeps the cash settlement honest: before it existed, holdings changed
 * every week with nothing on the other side of the trade, and no test would have noticed.
 * The tolerance is per-week and generous enough to cover real dealer spread and coupon/redemption
 * flows while still catching a leg that is missing entirely.
 */
/**
 * S7: the one-ledger conservation check. Every dollar of an instrument is held by exactly one of
 * the real books, or sits with the passive share the model does not yet name as holders
 * (households, foreign, central bank — the complement of the tradable share, which retires when
 * MS and WS9 land). Overshoot is the failure that matters: if the real books together claim MORE
 * than the instrument's outstanding, some formula is minting claims.
 */
function checkHoldingsLedgerConservation(state: GameState, week: number): Violation[] {
  const out: Violation[] = [];
  (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(regionId => {
    const reg: any = (state as any).regions[regionId];
    const cos = state.companies.filter((c: any) => c.region === regionId && !c.isDefaulted && !c.mergerAcquired);
    const fixedOutstanding = cos.reduce((a: number, c: any) =>
      a + (c.debtTranches || []).filter((t: any) => t.rateType === 'FIXED').reduce((x: number, t: any) => x + t.principalUSD, 0), 0);
    const floatOutstanding = cos.reduce((a: number, c: any) =>
      a + (c.debtTranches || []).filter((t: any) => t.rateType === 'FLOATING').reduce((x: number, t: any) => x + t.principalUSD, 0), 0);
    const sovOutstanding = (reg.govDebtTranches || []).reduce((a: number, t: any) => a + t.principalUSD, 0);

    let heldCorp = 0, heldLoan = 0, heldSov = 0;
    state.institutionalEntities.forEach((e: any) => {
      if (e.region !== regionId) return;
      e.itemizedHoldings.forEach((h: any) => {
        const v = h.quantityOrNotionalUSD ?? 0;
        if (h.instrumentType === 'CORP_BOND') heldCorp += v;
        else if (h.instrumentType === 'LEVERAGED_LOAN') heldLoan += v;
        else if (h.instrumentType === 'GOV_BOND') heldSov += v;
      });
    });
    state.companies.forEach((c: any) => {
      if (c.region !== regionId || !c.bankBalanceSheet) return;
      heldSov += (Object.values(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}) as any[])
        .reduce((a: number, v: any) => a + (Number(v) || 0), 0);
    });
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p: any) => { heldCorp += p.inventoryUSD; });
    (reg.bankingSector.loanDealerInventory || []).forEach((p: any) => { heldLoan += p.inventoryUSD; });

    const cases: [string, number, number][] = [
      ['corporate bonds', heldCorp, fixedOutstanding],
      ['leveraged loans', heldLoan, floatOutstanding],
      ['sovereign bonds', heldSov, sovOutstanding],
    ];
    cases.forEach(([label, held, outstanding]) => {
      if (outstanding <= 0) return;
      if (held > outstanding * 1.02) {
        out.push({
          week,
          message: `${regionId} ${label}: real books hold ${(held / 1e9).toFixed(1)}B against ${(outstanding / 1e9).toFixed(1)}B outstanding (${((held / outstanding - 1) * 100).toFixed(1)}% over) — a ledger is minting claims`
        });
      }
    });
  });
  return out;
}

function checkInstitutionalBookConservation(prev: GameState, state: GameState, week: number) {
  const bookOf = (s: GameState, region: RegionId) =>
    (s.institutionalEntities || [])
      .filter((e) => e.region === region && !e.isDefaulted)
      .reduce(
        (sum, e) =>
          sum + (e.cashUSD ?? 0) + ((e as any).repoLentUSD ?? 0) + e.itemizedHoldings.reduce((x, h) => x + h.quantityOrNotionalUSD, 0),
        0
      );

  (['USA', 'UK', 'JPN', 'EUR'] as RegionId[]).forEach((region) => {
    const before = bookOf(prev, region);
    const after = bookOf(state, region);
    if (!(before > 0)) return;
    const changePct = Math.abs(after - before) / before;
    if (changePct > 0.05) {
      violations.push({
        week,
        message:
          `Institutional book in ${region} moved ${(changePct * 100).toFixed(1)}% in one week ` +
          `(${(before / 1e9).toFixed(1)}B -> ${(after / 1e9).toFixed(1)}B). Securities and cash ` +
          `must move together — check that every clearing stage applies netCashDeltaByParticipantId.`,
      });
    }
  });
}

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


function checkMarkToMarketUnfreezesPortfolio(): Violation | null {
  let seedState = createInitialGameState(SEED);
  const company = seedState.companies[0];
  const posData = {
    assetType: 'EQUITY' as any,
    symbol: company.ticker,
    name: company.name,
    region: company.region,
    dealerId: 'invariants-test-dealer',
    direction: 'LONG' as any,
    quantity: 1000,
    entryPrice: company.stockPrice,
    currentPrice: company.stockPrice,
    notional: company.stockPrice * 1000,
    marginRequirement: company.stockPrice * 1000 * 0.2,
    expectedWeeklyCarryUSD: 0,
  };
  let state = executeTrade(seedState, posData);
  const preNav = state.portfolio.navUSD;
  state = advanceWeeklyStep(state);
  const postNav = state.portfolio.navUSD;
  const postPosition = state.portfolio.positions[0];
  const postCompany = state.companies.find(c => c.ticker === company.ticker);

  if (postCompany && postCompany.stockPrice !== company.stockPrice && postNav === preNav) {
    return { week: state.currentWeek, message: `Portfolio NAV frozen: navUSD unchanged after weekly advance despite ${company.ticker} price moving ${company.stockPrice} -> ${postCompany.stockPrice} (nav=${preNav})` };
  }
  if (postCompany && postCompany.stockPrice !== company.stockPrice && postPosition.unrealizedPnL === 0) {
    return { week: state.currentWeek, message: `Position unrealizedPnL still zero for ${postPosition.symbol} after ${company.ticker} price moved ${company.stockPrice} -> ${postCompany.stockPrice}` };
  }
  return null;
}

function checkSustainedEquityDemandMovesPriceBeyondEps(): Violation | null {
  let state = createInitialGameState(SEED);
  const ticker = state.companies.find(c => c.region === 'USA' && !c.isBankEntity && !c.isInstitutionalEntity)?.ticker;
  if (!ticker) return null;
  // Force a large institutional under-allocation so the holder-class rebalancing flow
  // produces a sustained multi-week inflow into USA equities.
  state.regions.USA.equityOwnership.institutionalShare = 0.05;

  const startComp = state.companies.find(c => c.ticker === ticker)!;
  const startPrice = startComp.stockPrice;
  const startEps = startComp.eps;

  for (let w = 0; w < 20; w++) {
    state = advanceWeeklyStep(state);
  }

  const endComp = state.companies.find(c => c.ticker === ticker);
  if (!endComp || endComp.isDefaulted) return null; // company left the sample; not a flow-mechanism failure

  const priceRatio = Math.max(0.01, endComp.stockPrice) / Math.max(0.01, startPrice);
  const epsRatio = (Math.abs(endComp.eps) > 0.01 && Math.abs(startEps) > 0.01) ? endComp.eps / startEps : 1;
  const priceMoveExEpsLog = Math.abs(Math.log(priceRatio) - Math.log(Math.max(0.01, Math.abs(epsRatio))));

  if (priceMoveExEpsLog < 0.02) {
    return {
      week: 20,
      message: `Sustained institutional equity demand did not visibly move ${ticker}'s price beyond what EPS explains (price ${startPrice} -> ${endComp.stockPrice}, eps ${startEps} -> ${endComp.eps})`
    };
  }
  return null;
}

function checkUndersubscribedSovereignAuctionRaisesYield(): Violation | null {
  const baseline = createInitialGameState(SEED);
  const shocked = createInitialGameState(SEED);
  // S6: shock the fields the market ACTUALLY reads. The old version shrank two macro scalars
  // (bankEquityUSD / sectorEquityUSD) that the clearing engine stopped reading when sovereign
  // demand became per-bank reserve arbitrage (S2) and per-entity budgets (S11) — so baseline and
  // shocked runs were identical to 8 decimal places and the check was testing nothing. An
  // under-subscribed auction is buyers with no money: drain every USA bank's real reserves (the
  // funding for their bond bids) and every USA institution's real cash (their budgets).
  shocked.companies.forEach(c => {
    if (c.region === 'USA' && c.bankBalanceSheet) {
      c.bankBalanceSheet.cashReservesUSD *= 0.01;
      // WS6 taught the check the same lesson S6 did, one field later: with a repo market, a
      // bank with drained CASH still bids — it funds the purchase secured against its
      // collateral, which is exactly why real sovereign auctions rarely fail. "Buyers with no
      // money" now means no cash AND no unencumbered collateral to borrow against.
      const sovUSD = Object.values((c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}) as Record<string, number>)
        .reduce((a, v) => a + (Number(v) || 0), 0);
      c.bankBalanceSheet.repoEncumberedCollateralUSD = sovUSD;
    }
  });
  shocked.institutionalEntities.forEach(e => {
    if (e.region === 'USA') e.cashUSD = 0;
  });

  const baselineNext = advanceWeeklyStep(baseline);
  const shockedNext = advanceWeeklyStep(shocked);

  if (shockedNext.regions.USA.zeroRates.tenor10Y <= baselineNext.regions.USA.zeroRates.tenor10Y) {
    return {
      week: shockedNext.currentWeek,
      message: `Under-subscribed sovereign auction did not raise USA's 10Y yield the following week (baseline=${baselineNext.regions.USA.zeroRates.tenor10Y}, shocked=${shockedNext.regions.USA.zeroRates.tenor10Y})`
    };
  }
  return null;
}

function runInvariantsHarness() {
  console.log(`--- STARTING INVARIANTS HARNESS (${WEEKS} WEEKS, seed ${SEED}) ---`);
  let state = createInitialGameState(SEED);
  const initialRevenueByTicker = new Map(state.companies.map(c => [c.ticker, c.annualRevenue]));
  let knownTickers = new Set(state.companies.map(c => c.ticker));

  // Assert trade fee conservation invariant on initial state
  const tradeFeeViolation = checkTradeFeeConservation(state);
  if (tradeFeeViolation) {
    violations.push(tradeFeeViolation);
  }

  // Assert mark-to-market flows through to NAV/positions after a weekly advance
  const frozenPortfolioViolation = checkMarkToMarketUnfreezesPortfolio();
  if (frozenPortfolioViolation) {
    violations.push(frozenPortfolioViolation);
  }

  // Assert the equity holder-class rebalancing flow visibly moves price beyond EPS
  const equityFlowViolation = checkSustainedEquityDemandMovesPriceBeyondEps();
  if (equityFlowViolation) {
    violations.push(equityFlowViolation);
  }

  // Assert an under-subscribed sovereign auction raises the following week's yield
  const auctionViolation = checkUndersubscribedSovereignAuctionRaisesYield();
  if (auctionViolation) {
    violations.push(auctionViolation);
  }

  for (let w = 1; w <= WEEKS; w++) {
    if (w % 10 === 0) {
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



    let preState = state;
    state = advanceWeeklyStep(state);
    
    // Track Sovereign Debt Issuance
    ['USA', 'EUR', 'ASIA'].forEach(rId => {
       const preBankSov = preState.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const preInstSov = preState.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const postBankSov = state.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const postInstSov = state.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const actualGrowth = (postBankSov - preBankSov) + (postInstSov - preInstSov);
       
       const gdp = preState.regions[rId]?.nominalGdpUSD || 0;
       const deficitPct = preState.regions[rId]?.governmentDeficitPct || 0;
       const weeklyDeficit = (gdp * deficitPct) / 52;
       
       const centralBankHoldings = preState.regions[rId]?.centralBankReservesUSD || 0;
       const targetCBMoney = gdp * 0.15;
       const qe = Math.max(0, targetCBMoney - centralBankHoldings) * 0.01;
       const monetizedAmount = Math.min(weeklyDeficit, qe);
       
       const marketFundedAmount = Math.max(0, weeklyDeficit - monetizedAmount);
       
       // Accumulate
       if (!(global as any).sovAccumulator) (global as any).sovAccumulator = {};
       if (!(global as any).sovAccumulator[rId]) (global as any).sovAccumulator[rId] = { growth: 0, expected: 0 };
       
       (global as any).sovAccumulator[rId].growth += actualGrowth;
       (global as any).sovAccumulator[rId].expected += marketFundedAmount;
       
       if (w % 13 === 0) {
          const accGrowth = (global as any).sovAccumulator[rId].growth;
          const accExpected = (global as any).sovAccumulator[rId].expected;
          if (accExpected > 0 && Math.abs(accGrowth - accExpected) / accExpected > 0.05) {
             violations.push({ week: w, message: `Sovereign debt absorption mismatch in ${rId} over 13 weeks: expected=${accExpected.toFixed(2)} actualGrowth=${accGrowth.toFixed(2)}` });
          }
          (global as any).sovAccumulator[rId].growth = 0;
          (global as any).sovAccumulator[rId].expected = 0;
       }

       // advanceWeeklyStep gates meetings on nextWeek (= w + 1, since state.currentWeek === w
       // going into this call), not on the harness's own loop index w.
       if ((w + 1) % 13 !== 0 && w > 1) {
         if (preState.regions[rId as RegionId]?.policyRate !== state.regions[rId as RegionId]?.policyRate) {
           violations.push({
             week: w,
             message: `Policy rate changed on non-meeting week ${w} for region ${rId}: ${preState.regions[rId as RegionId]?.policyRate} -> ${state.regions[rId as RegionId]?.policyRate}`
           });
         }
       }
    });
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
    if (prevStateForBookCheck) checkInstitutionalBookConservation(prevStateForBookCheck, state, w);
    violations.push(...checkHoldingsLedgerConservation(state, w));
    prevStateForBookCheck = state;

    // 5b. The bank balance-sheet identity, per named bank, every week. Cash moves only by
    // named flows and every flow posts to both sides, so deposits + equity + secured funding
    // must equal loans + securities + cash to the dollar (small tolerance for per-field
    // rounding). Before the flow ledger this identity was broken by -138.9B (USA, week 0) and
    // a Math.max plug hid it; if this drifts again, some flow is missing a leg — find it,
    // never plug it.
    state.companies.forEach((c: any) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const sovUSD = Object.values((bs.sovereignBondHoldingsByTenor || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      const residualUSD: number =
        bs.depositsUSD + bs.bankEquityUSD + (bs.srfBorrowingUSD ?? 0) + ((bs as any).repoBorrowedUSD ?? 0)
        - bs.businessLoanBookUSD - bs.consumerLoanBookUSD - sovUSD - bs.cashReservesUSD
        - ((bs as any).repoLentUSD ?? 0) - (bs.onRrpLendingUSD ?? 0);
      if (Math.abs(residualUSD) > 5e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} balance-sheet identity broken by ${(residualUSD / 1e6).toFixed(1)}M — a flow is missing a leg`
        });
      }
    });

    // 5c. WS6: the overnight repo rate must print inside the administered corridor in every
    // region every week — not because anything clamps it, but because every lender's
    // reservation is its own posted floor and the SRF sits in the book as an elastic seat at
    // the ceiling. A print outside the corridor means a schedule is wrong or the damper bound.
    // And pledged collateral can never exceed the pledger's holdings.
    (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(regionId => {
      const reg: any = (state as any).regions[regionId];
      if (typeof reg.repoRateAnnual !== 'number') return;
      const floorAnnual = Math.max(0, reg.policyRate - 20 / 10000);
      const ceilAnnual = reg.policyRate + 25 / 10000;
      if (reg.repoRateAnnual < floorAnnual - 1e-6 || reg.repoRateAnnual > ceilAnnual + 1e-6) {
        violations.push({
          week: w,
          message: `${regionId} repo rate ${(reg.repoRateAnnual * 100).toFixed(3)}% outside corridor [${(floorAnnual * 100).toFixed(3)}%, ${(ceilAnnual * 100).toFixed(3)}%]`
        });
      }
    });
    state.companies.forEach((c: any) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const sovUSD = Object.values((bs.sovereignBondHoldingsByTenor || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      if ((bs.repoEncumberedCollateralUSD ?? 0) > sovUSD + 1e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} pledged ${(bs.repoEncumberedCollateralUSD / 1e9).toFixed(2)}B of collateral against ${(sovUSD / 1e9).toFixed(2)}B held`
        });
      }
    });

    // 5d. §6 damper diagnostic: the weekly damper is legitimate discrete-time smoothing, but a
    // name held away from its solve for 3+ CONSECUTIVE weeks means the print is the damper,
    // not the market. First run of this metric measured the condition as ENDEMIC — 3,450
    // streak events across ~1,600 corp tranches, ~900 equity/loan names and 28 sovereign
    // bucket-streaks in 60 weeks (the §7.21 HY saturation cohort and the §7.31 small-cap
    // equity tail, mostly) — so it reports as an end-of-run measurement rather than
    // per-instrument violations that would drown the harness. The number to watch DOWN as
    // G6/HC-resolution give the wides a real buyer base.
    {
      const boundThisWeek = new Set<string>((state as any).lastWeekDamperBoundIds ?? []);
      const next = new Map<string, number>();
      boundThisWeek.forEach(id => next.set(id, (damperBindStreak.get(id) ?? 0) + 1));
      next.forEach((streak, id) => {
        if (streak >= 3) damperPersistentBinds.add(id);
        damperWorstStreak = Math.max(damperWorstStreak, streak);
      });
      damperBindStreak = next;
    }

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
        week: WEEKS,
        message: `Company ${c.ticker} revenue grew >20x initial baseline (${initRev} -> ${c.annualRevenue})`
      });
    }
  });

  if (violations.length === 0) {
    console.log(`[damper] instruments persistently bound (3+ consecutive weeks): ${damperPersistentBinds.size}; worst streak ${damperWorstStreak} weeks — watch this DOWN as the wides get a real buyer base (§6)`);
    console.log(`✅ INVARIANTS HARNESS PASSED — ${WEEKS} weeks, all assertions satisfied!`);
    process.exit(0);
  } else {
    console.log(`[damper] instruments persistently bound (3+ consecutive weeks): ${damperPersistentBinds.size}; worst streak ${damperWorstStreak} weeks — watch this DOWN as the wides get a real buyer base (§6)`);
    console.error(`❌ INVARIANTS HARNESS FAILED — ${violations.length} violation(s):`);
    violations.forEach(v => console.error(`  [Week ${v.week}] ${v.message}`));
    process.exit(1);
  }
}

runInvariantsHarness();

// NEW: Trade Fee Conservation Check
function checkTradeFeeConservation(state: GameState): Violation | null {
  
  // Take a snapshot of pre-trade balances
  const preCash = state.portfolio.cashUSD;
  const preBankEquity = state.regions['USA']?.bankingSector.bankEquityUSD || 0;

  // Let's create a fake position
  const posData = {
    assetType: 'EQUITY' as any,
    symbol: 'TEST',
    name: 'Test Equity',
    region: 'USA' as RegionId,
    dealerId: 'alpha',
    direction: 'LONG' as any,
    quantity: 1000,
    entryPrice: 100,
    currentPrice: 100,
    notional: 100000,
    marginRequirement: 20000,
    expectedWeeklyCarryUSD: 0
  };

  const executionDetails = {
    fillPrice: 100.15,
    counterpartyFeeUSD: 150,
    sourcedFrom: 'Bank intermediated (sourced externally)',
    spreadCostUSD: 150
  };

  const postState = executeTrade(state, posData, executionDetails);

  const postCash = postState.portfolio.cashUSD;
  const postBankEquity = postState.regions['USA']?.bankingSector.bankEquityUSD || 0;

  const userDebit = preCash - postCash;
  const bankCredit = postBankEquity - preBankEquity;

  if (Math.abs(userDebit - executionDetails.spreadCostUSD) > 0.01) {
    return { week: state.currentWeek, message: `Trade Fee mismatch: user debited ${userDebit} but spreadCostUSD was ${executionDetails.spreadCostUSD}` };
  }
  
  const expectedBankCredit = executionDetails.spreadCostUSD + executionDetails.counterpartyFeeUSD;
  if (Math.abs(bankCredit - expectedBankCredit) > 0.01) {
    return { week: state.currentWeek, message: `Trade Fee mismatch: bank credited ${bankCredit} but expected ${expectedBankCredit}` };
  }
  
  return null;
}
