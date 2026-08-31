/** §5-STRUCT step 2 — how a bank prices credit (domain/bank-pricing.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteLoanMarginBps, quoteHouseholdMarginBps, consumerAnnualLossRate,
  BANK_WORKING_CAPITAL_RATIO, BANK_TARGET_ROE, CREDIT_RECOVERY_RATE,
} from '../src/domain/bank-pricing';

test('a loan margin is expected loss plus the capital the exposure consumes', () => {
  // PD 2%, prior recovery: EL = 0.02 * 0.6 * 10000 = 120bp; capital = 1.0 * 0.11 * 0.12 * 10000.
  const m = quoteLoanMarginBps({ annualDefaultProbability: 0.02, riskWeight: 1.0 });
  const expected = Math.round(0.02 * (1 - CREDIT_RECOVERY_RATE) * 10000
    + BANK_WORKING_CAPITAL_RATIO * BANK_TARGET_ROE * 10000);
  assert.equal(m, expected);
});

test('G5 — a measured recovery moves the quote; a better workout is a cheaper loan', () => {
  const prior = quoteLoanMarginBps({ annualDefaultProbability: 0.05, riskWeight: 1.0 });
  const better = quoteLoanMarginBps({ annualDefaultProbability: 0.05, riskWeight: 1.0, recoveryRate: 0.8 });
  assert.ok(better < prior);
});

test('G3c — a riskier bank quotes wider on the SAME borrower (its own cost of equity)', () => {
  const cheap = quoteLoanMarginBps({ annualDefaultProbability: 0.02, riskWeight: 1, requiredReturnAnnual: 0.08 });
  const dear = quoteLoanMarginBps({ annualDefaultProbability: 0.02, riskWeight: 1, requiredReturnAnnual: 0.20 });
  assert.ok(dear > cheap);
});

test('§7.205 — a subprime-heavy book loses a multiple of a super-prime one on the same print', () => {
  const book = (shares: Record<string, number>) =>
    Object.entries(shares).map(([tier, shareOfHouseholds]) => ({ tier, shareOfHouseholds }) as never);
  const superPrime = consumerAnnualLossRate(0.08,
    book({ SUPER_PRIME: 1, PRIME: 0, NEAR_PRIME: 0, SUBPRIME: 0 }));
  const subprime = consumerAnnualLossRate(0.08,
    book({ SUPER_PRIME: 0, PRIME: 0, NEAR_PRIME: 0, SUBPRIME: 1 }));
  assert.ok(subprime > superPrime * 10);
});

test('a household margin carries the operating cost the loan actually has', () => {
  const base = quoteHouseholdMarginBps({ annualLossRate: 0.02, riskWeight: 0.75, operatingCostBps: 0 });
  const withCost = quoteHouseholdMarginBps({ annualLossRate: 0.02, riskWeight: 0.75, operatingCostBps: 150 });
  assert.equal(withCost - base, 150);
});
