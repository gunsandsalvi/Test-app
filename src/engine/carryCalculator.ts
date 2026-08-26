import { AssetType } from '../types';

export interface CarryEstimate {
  weeklyCarryUSD: number;
  annualizedCarryUSD: number;
  annualizedCarryPct: number;
  components: {
    incomeOrYieldUSD: number;
    financingCostUSD: number;
    description: string;
  };
}

/**
 * Compute the expected 1-week net carry for any tradeable instrument or position
 */
export function calculateExpectedCarry(
  assetType: AssetType,
  direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | 'PAY_FIXED' | 'RECEIVE_FIXED' | 'BUY_PROTECTION' | 'SELL_PROTECTION',
  notionalUSD: number,
  params: {
    policyRate: number; // e.g. 0.0475
    couponRate?: number; // e.g. 0.05
    dividendYield?: number; // e.g. 0.022
    convenienceYield?: number; // e.g. 0.035
    cdsSpreadBps?: number; // e.g. 120 bps
    fixedRate?: number; // e.g. 0.045
    floatingRate?: number; // e.g. 0.0475
    thetaPerContractUSD?: number; // Black Scholes theta per week
    quantity?: number;
    basisSpreadBps?: number; // e.g. -20 bps
    baseRate?: number;
    quoteRate?: number;
  }
): CarryEstimate {
  const isBuyOrLong = direction === 'LONG' || direction === 'BUY' || direction === 'PAY_FIXED' || direction === 'BUY_PROTECTION';
  const rf = params.policyRate || 0.045;
  let weeklyCarryUSD = 0;
  let incomeOrYieldUSD = 0;
  let financingCostUSD = 0;
  let description = '';

  switch (assetType) {
    case 'EQUITY': {
      const divYield = params.dividendYield ?? 0.018;
      const repoRate = rf + 0.005; // policy rate + 50 bps
      if (isBuyOrLong) {
        incomeOrYieldUSD = (notionalUSD * divYield) / 52;
        financingCostUSD = (notionalUSD * repoRate) / 52;
        weeklyCarryUSD = incomeOrYieldUSD - financingCostUSD;
        description = `+${(divYield * 100).toFixed(2)}% Div Yield - ${(repoRate * 100).toFixed(2)}% Repo Financing`;
      } else {
        incomeOrYieldUSD = 0;
        financingCostUSD = (notionalUSD * (divYield + 0.015)) / 52; // Short borrowing fee + dividend liability
        weeklyCarryUSD = -financingCostUSD;
        description = `Short Borrow & Dividend Drag (-${((divYield + 0.015) * 100).toFixed(2)}% p.a.)`;
      }
      break;
    }

    case 'CORP_BOND': {
      const coupon = params.couponRate ?? (rf + (params.cdsSpreadBps || 150) / 10000);
      const repoCost = rf + 0.004; // policy + 40 bps
      if (isBuyOrLong) {
        incomeOrYieldUSD = (notionalUSD * coupon) / 52;
        financingCostUSD = (notionalUSD * repoCost) / 52;
        weeklyCarryUSD = incomeOrYieldUSD - financingCostUSD;
        description = `+${(coupon * 100).toFixed(2)}% Coupon Accrual - ${(repoCost * 100).toFixed(2)}% Funding`;
      } else {
        incomeOrYieldUSD = 0;
        financingCostUSD = (notionalUSD * (coupon + 0.008)) / 52;
        weeklyCarryUSD = -financingCostUSD;
        description = `Short Coupon Liability & Repo`;
      }
      break;
    }

    case 'LEVERAGED_LOAN': {
      const loanMargin = (params.cdsSpreadBps ?? 375) / 10000;
      const loanCoupon = rf + loanMargin;
      const repoCost = rf + 0.005; // policy + 50 bps
      if (isBuyOrLong) {
        incomeOrYieldUSD = (notionalUSD * loanCoupon) / 52;
        financingCostUSD = (notionalUSD * repoCost) / 52;
        weeklyCarryUSD = incomeOrYieldUSD - financingCostUSD;
        description = `+${(loanCoupon * 100).toFixed(2)}% Floating Coupon - ${(repoCost * 100).toFixed(2)}% Repo`;
      } else {
        incomeOrYieldUSD = 0;
        financingCostUSD = (notionalUSD * (loanCoupon + 0.008)) / 52;
        weeklyCarryUSD = -financingCostUSD;
        description = `Short Loan Coupon Drag`;
      }
      break;
    }

    case 'SOV_BOND': {
      const coupon = params.couponRate ?? rf;
      const repoCost = rf + 0.002;
      if (isBuyOrLong) {
        incomeOrYieldUSD = (notionalUSD * coupon) / 52;
        financingCostUSD = (notionalUSD * repoCost) / 52;
        weeklyCarryUSD = incomeOrYieldUSD - financingCostUSD;
        description = `+${(coupon * 100).toFixed(2)}% Benchmark Coupon - ${(repoCost * 100).toFixed(2)}% GC Repo`;
      } else {
        incomeOrYieldUSD = 0;
        financingCostUSD = (notionalUSD * (coupon + 0.005)) / 52;
        weeklyCarryUSD = -financingCostUSD;
        description = `Short Sovereign Coupon Drag`;
      }
      break;
    }

    case 'IRS': {
      const fix = params.fixedRate ?? rf;
      const flt = params.floatingRate ?? rf;
      if (direction === 'PAY_FIXED' || direction === 'BUY') {
        // Pay Fixed, Receive Floating
        weeklyCarryUSD = (notionalUSD * (flt - fix)) / 52;
        incomeOrYieldUSD = Math.max(0, weeklyCarryUSD);
        financingCostUSD = Math.max(0, -weeklyCarryUSD);
        description = `Rec Floating (${(flt * 100).toFixed(2)}%) - Pay Fixed (${(fix * 100).toFixed(2)}%)`;
      } else {
        // Receive Fixed, Pay Floating
        weeklyCarryUSD = (notionalUSD * (fix - flt)) / 52;
        incomeOrYieldUSD = Math.max(0, weeklyCarryUSD);
        financingCostUSD = Math.max(0, -weeklyCarryUSD);
        description = `Rec Fixed (${(fix * 100).toFixed(2)}%) - Pay Floating (${(flt * 100).toFixed(2)}%)`;
      }
      break;
    }

    case 'CDS': {
      const cdsSpread = (params.cdsSpreadBps ?? 100) / 10000;
      if (direction === 'BUY_PROTECTION' || direction === 'BUY') {
        // Buyer pays premium
        weeklyCarryUSD = -(notionalUSD * cdsSpread) / 52;
        financingCostUSD = (notionalUSD * cdsSpread) / 52;
        description = `Pays ${(params.cdsSpreadBps ?? 100)} bps/yr Protection Premium`;
      } else {
        // Seller earns premium
        weeklyCarryUSD = (notionalUSD * cdsSpread) / 52;
        incomeOrYieldUSD = (notionalUSD * cdsSpread) / 52;
        description = `Collects ${(params.cdsSpreadBps ?? 100)} bps/yr Protection Premium`;
      }
      break;
    }

    case 'COMMODITY': {
      const cy = params.convenienceYield ?? 0.03;
      // Net roll yield = Convenience Yield - Risk-Free USD Cost
      const netRollYield = cy - rf;
      if (isBuyOrLong) {
        weeklyCarryUSD = (notionalUSD * netRollYield) / 52;
        incomeOrYieldUSD = (notionalUSD * Math.max(0, cy)) / 52;
        financingCostUSD = (notionalUSD * rf) / 52;
        description = `+${(cy * 100).toFixed(1)}% Convenience Yield vs ${(rf * 100).toFixed(1)}% USD Funding`;
      } else {
        weeklyCarryUSD = -(notionalUSD * netRollYield) / 52;
        financingCostUSD = (notionalUSD * Math.max(0, cy)) / 52;
        description = `Short Commodity Roll Spread`;
      }
      break;
    }

    case 'OPTION': {
      // Theta decay per week
      const weeklyTheta = (params.thetaPerContractUSD ?? 0) * (params.quantity || notionalUSD / 100);
      if (isBuyOrLong) {
        weeklyCarryUSD = -Math.abs(weeklyTheta || notionalUSD * 0.02);
        financingCostUSD = Math.abs(weeklyCarryUSD);
        description = `Option Theta Time Decay (-1W Roll)`;
      } else {
        weeklyCarryUSD = Math.abs(weeklyTheta || notionalUSD * 0.02);
        incomeOrYieldUSD = weeklyCarryUSD;
        description = `Short Premium Theta Time Decay Harvest (+1W)`;
      }
      break;
    }

    case 'TRS': {
      const divYield = params.dividendYield ?? 0.02;
      const financingRate = rf + 0.0075;
      if (isBuyOrLong) {
        weeklyCarryUSD = (notionalUSD * (divYield - financingRate)) / 52;
        incomeOrYieldUSD = (notionalUSD * divYield) / 52;
        financingCostUSD = (notionalUSD * financingRate) / 52;
        description = `TRS Dividend Pass-through - ${(financingRate * 100).toFixed(2)}% Financing Leg`;
      } else {
        weeklyCarryUSD = -(notionalUSD * (divYield + financingRate)) / 52;
        financingCostUSD = Math.abs(weeklyCarryUSD);
        description = `Short TRS Financing & Dividend Drag`;
      }
      break;
    }

    case 'XCS': {
      const basis = (params.basisSpreadBps ?? -20) / 10000;
      if (isBuyOrLong) {
        weeklyCarryUSD = (notionalUSD * basis) / 52;
        description = `Cross Currency Basis Spread (${(params.basisSpreadBps ?? -20)} bps)`;
      } else {
        weeklyCarryUSD = -(notionalUSD * basis) / 52;
        description = `Cross Currency Basis Spread (${-(params.basisSpreadBps ?? -20)} bps)`;
      }
      break;
    }

    case 'FX_SPOT': {
      const baseRate = params.baseRate ?? rf;
      const quoteRate = params.quoteRate ?? rf;
      const rateDiff = isBuyOrLong ? (baseRate - quoteRate) : (quoteRate - baseRate);
      weeklyCarryUSD = (notionalUSD * rateDiff) / 52;
      incomeOrYieldUSD = Math.max(0, weeklyCarryUSD);
      financingCostUSD = Math.max(0, -weeklyCarryUSD);
      description = `FX Interest Rate Differential (${(baseRate * 100).toFixed(2)}% vs ${(quoteRate * 100).toFixed(2)}%)`;
      break;
    }
  }

  const annualizedCarryUSD = weeklyCarryUSD * 52;
  const annualizedCarryPct = notionalUSD > 0 ? (annualizedCarryUSD / notionalUSD) * 100 : 0;

  return {
    weeklyCarryUSD,
    annualizedCarryUSD,
    annualizedCarryPct,
    components: {
      incomeOrYieldUSD,
      financingCostUSD,
      description,
    },
  };
}
