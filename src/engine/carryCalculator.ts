import { AssetType } from '../types';
import { assertNever } from '../domain/defect';

export interface CarryEstimate {
  weeklyCarryLocal: number;
  annualizedCarryLocal: number;
  annualizedCarryPct: number;
  components: {
    incomeOrYieldLocal: number;
    financingCostLocal: number;
    description: string;
  };
}

/**
 * Compute the expected 1-week net carry for any tradeable instrument or position
 */
export function calculateExpectedCarry(
  assetType: AssetType,
  direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  notional: number,
  params: {
    policyRate: number; // e.g. 0.0475
    couponRate?: number; // e.g. 0.05
    dividendYield?: number; // e.g. 0.022
    convenienceYield?: number; // e.g. 0.035
    cdsSpreadBps?: number; // e.g. 120 bps — a corporate bond's protection cost, netted from its carry
    baseRate?: number;
    quoteRate?: number;
  }
): CarryEstimate {
  const isBuyOrLong = direction === 'LONG' || direction === 'BUY';
  const rf = params.policyRate || 0.045;
  let weeklyCarryLocal = 0;
  let incomeOrYieldLocal = 0;
  let financingCostLocal = 0;
  let description = '';

  switch (assetType) {
    case 'EQUITY': {
      const divYield = params.dividendYield ?? 0.018;
      const repoRate = rf + 0.005; // policy rate + 50 bps
      if (isBuyOrLong) {
        incomeOrYieldLocal = (notional * divYield) / 52;
        financingCostLocal = (notional * repoRate) / 52;
        weeklyCarryLocal = incomeOrYieldLocal - financingCostLocal;
        description = `+${(divYield * 100).toFixed(2)}% Div Yield - ${(repoRate * 100).toFixed(2)}% Repo Financing`;
      } else {
        incomeOrYieldLocal = 0;
        financingCostLocal = (notional * (divYield + 0.015)) / 52; // Short borrowing fee + dividend liability
        weeklyCarryLocal = -financingCostLocal;
        description = `Short Borrow & Dividend Drag (-${((divYield + 0.015) * 100).toFixed(2)}% p.a.)`;
      }
      break;
    }

    case 'CORP_BOND': {
      const coupon = params.couponRate ?? (rf + (params.cdsSpreadBps || 150) / 10000);
      const repoCost = rf + 0.004; // policy + 40 bps
      if (isBuyOrLong) {
        incomeOrYieldLocal = (notional * coupon) / 52;
        financingCostLocal = (notional * repoCost) / 52;
        weeklyCarryLocal = incomeOrYieldLocal - financingCostLocal;
        description = `+${(coupon * 100).toFixed(2)}% Coupon Accrual - ${(repoCost * 100).toFixed(2)}% Funding`;
      } else {
        incomeOrYieldLocal = 0;
        financingCostLocal = (notional * (coupon + 0.008)) / 52;
        weeklyCarryLocal = -financingCostLocal;
        description = `Short Coupon Liability & Repo`;
      }
      break;
    }

    case 'LEVERAGED_LOAN': {
      const loanMargin = (params.cdsSpreadBps ?? 375) / 10000;
      const loanCoupon = rf + loanMargin;
      const repoCost = rf + 0.005; // policy + 50 bps
      if (isBuyOrLong) {
        incomeOrYieldLocal = (notional * loanCoupon) / 52;
        financingCostLocal = (notional * repoCost) / 52;
        weeklyCarryLocal = incomeOrYieldLocal - financingCostLocal;
        description = `+${(loanCoupon * 100).toFixed(2)}% Floating Coupon - ${(repoCost * 100).toFixed(2)}% Repo`;
      } else {
        incomeOrYieldLocal = 0;
        financingCostLocal = (notional * (loanCoupon + 0.008)) / 52;
        weeklyCarryLocal = -financingCostLocal;
        description = `Short Loan Coupon Drag`;
      }
      break;
    }

    case 'GOV_BOND': {
      const coupon = params.couponRate ?? rf;
      const repoCost = rf + 0.002;
      if (isBuyOrLong) {
        incomeOrYieldLocal = (notional * coupon) / 52;
        financingCostLocal = (notional * repoCost) / 52;
        weeklyCarryLocal = incomeOrYieldLocal - financingCostLocal;
        description = `+${(coupon * 100).toFixed(2)}% Benchmark Coupon - ${(repoCost * 100).toFixed(2)}% GC Repo`;
      } else {
        incomeOrYieldLocal = 0;
        financingCostLocal = (notional * (coupon + 0.005)) / 52;
        weeklyCarryLocal = -financingCostLocal;
        description = `Short Sovereign Coupon Drag`;
      }
      break;
    }

    case 'FX_SPOT': {
      const baseRate = params.baseRate ?? rf;
      const quoteRate = params.quoteRate ?? rf;
      const rateDiff = isBuyOrLong ? (baseRate - quoteRate) : (quoteRate - baseRate);
      weeklyCarryLocal = (notional * rateDiff) / 52;
      incomeOrYieldLocal = Math.max(0, weeklyCarryLocal);
      financingCostLocal = Math.max(0, -weeklyCarryLocal);
      description = `FX Interest Rate Differential (${(baseRate * 100).toFixed(2)}% vs ${(quoteRate * 100).toFixed(2)}%)`;
      break;
    }
    default:
      // §7.241: without this, a new asset type fell off the switch with zero carry and an empty
      // description. A new AssetType member now fails to COMPILE here.
      assertNever(assetType, 'carry calculation');
  }

  const annualizedCarryLocal = weeklyCarryLocal * 52;
  const annualizedCarryPct = notional > 0 ? (annualizedCarryLocal / notional) * 100 : 0;

  return {
    weeklyCarryLocal,
    annualizedCarryLocal,
    annualizedCarryPct,
    components: {
      incomeOrYieldLocal,
      financingCostLocal,
      description,
    },
  };
}
