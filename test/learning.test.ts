/** §5-PROD — Wright's-law learning (domain/company-week/learning.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  learningUpdate, seedCumulativeUnits, LEARNING_ELASTICITY, LEGACY_PRODUCTIVITY_DRIFT_ANNUAL,
} from '../src/domain/company-week/learning';

test('a seeded firm opens growing at exactly the drift the constant asserted', () => {
  const annualUnits = 52_000;
  const cum = seedCumulativeUnits(annualUnits);
  const u = learningUpdate({ priorCumulativeUnits: cum, producedUnitsThisWeek: annualUnits / 52, priorMultiplier: 1 });
  // growth ≈ ε · ln(1 + weekly/cum) · 52 ≈ ε · annual/cum = the legacy drift.
  assert.ok(Math.abs(u.growthAnnual - LEGACY_PRODUCTIVITY_DRIFT_ANNUAL) < 1e-4,
    `expected ~${LEGACY_PRODUCTIVITY_DRIFT_ANNUAL}, got ${u.growthAnnual}`);
});

test('a doubling of cumulative output raises productivity by the elasticity', () => {
  const m = 1; const cum = 1000;
  const u = learningUpdate({ priorCumulativeUnits: cum, producedUnitsThisWeek: cum, priorMultiplier: m });
  // One doubling in one step: multiplier = e^(ε·ln2) = 2^ε.
  assert.ok(Math.abs(u.multiplier - Math.pow(2, LEARNING_ELASTICITY)) < 1e-12);
});

test('a firm that stops producing stops learning — a depression flattens the trend', () => {
  const u = learningUpdate({ priorCumulativeUnits: 5000, producedUnitsThisWeek: 0, priorMultiplier: 1.3 });
  assert.equal(u.growthAnnual, 0);
  assert.equal(u.multiplier, 1.3);
});

test('dispersion: the faster grower learns faster on the SAME elasticity', () => {
  const a = learningUpdate({ priorCumulativeUnits: 10_000, producedUnitsThisWeek: 100, priorMultiplier: 1 });
  const b = learningUpdate({ priorCumulativeUnits: 10_000, producedUnitsThisWeek: 500, priorMultiplier: 1 });
  assert.ok(b.growthAnnual > a.growthAnnual);
});
