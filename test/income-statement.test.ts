/**
 * Four lines of arithmetic every firm runs. The two inline copies used to disagree on how a loss
 * is taxed; §4.0 Tier 1 item 8 (decided 2026-08-31) closed the asymmetry: ONE rule for every
 * firm — a loss is neither taxed nor rebated — and the industrial EBIT floor is gone with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netIncomeUSD, corporateTax, industrialIncome, profileIncome } from '../src/domain/company-week/income-statement';

test('a profit is taxed', () => {
  assert.equal(netIncomeUSD(1000, 0, 0.25).netUSD, 750);
});

test('THE ASYMMETRY IS CLOSED: a loss is the loss, for every firm', () => {
  // The industrial path used to hand a pre-tax loss a rebate at the tax rate — money no firm
  // receives in cash — flattering every distressed industrial company. One rule now; this test
  // pins it so a second path cannot reintroduce the flag.
  assert.equal(netIncomeUSD(-100, 0, 0.25).netUSD, -100, 'the loss is the loss');
});

test('the guard is on EBIT, not on pre-tax income', () => {
  // These differ for the over-levered but operationally sound firm — EBIT positive, pre-tax
  // negative — which is a large share of the distressed set. Guarding on pre-tax changed the
  // world; the three-week fingerprint caught it. Kept deliberately; the basis is TAXR's call.
  assert.equal(netIncomeUSD(100, 500, 0.25).netUSD, -300, 'EBIT > 0, so the rate applies');
  assert.equal(netIncomeUSD(-100, 300, 0.25).netUSD, -400, 'EBIT <= 0, so it does not');
});

test('the industrial statement carries an operating loss at full size — no floor', () => {
  const s = industrialIncome({ revenueLocal: 1000, ebitdaMargin: 0.01, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0.25, sharesOutstanding: 10 });
  assert.equal(s.ebitdaLocal, 10);
  assert.equal(s.ebitUSD, -40, 'EBITDA 10 less D&A 50 is a real -40, not a floored 1');
  assert.equal(s.netIncomeUSD, -40, 'and the loss is not rebated');
});

test('EPS is zero rather than Infinity for a company with no shares', () => {
  const s = industrialIncome({ revenueLocal: 1000, ebitdaMargin: 0.2, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 0 });
  assert.equal(s.epsUSD, 0);
});

test("a profile firm's depreciation comes off its PLANT, not its revenue", () => {
  // A bank's depreciation has nothing to do with its interest income.
  const base = { revenueLocal: 1000, otherIncomeAnnualUSD: 0, inputCostAnnualUSD: 0,
    payrollAnnualUSD: 0, profileCostsAnnualUSD: 0, ppeDepreciationYears: 20,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 1 };
  const light = profileIncome({ ...base, grossPPELocal: 0 });
  const heavy = profileIncome({ ...base, grossPPELocal: 2000 });
  assert.equal(light.ebitUSD, 1000);
  assert.equal(heavy.ebitUSD, 900, '2000 of plant over 20 years is 100 a year');
  assert.equal(light.ebitdaLocal, heavy.ebitdaLocal, 'and it does not touch EBITDA');
});

// ---- §5-TAXR — the real tax base: accelerated depreciation, carryforwards, deferral ----

/** A firm with no plant and no depreciation: the tax base is pre-tax income itself. */
const flat = (carryforwardUSD: number) => ({
  bookDepreciationAnnualUSD: 0, taxBasisPpeUSD: 0, usefulLifeYears: 10,
  capexDeliveredAnnualUSD: 0, carryforwardUSD, bookNetPpeUSD: 0,
});

test('TAXR: a loss becomes a carryforward, one week at a time — never a rebate', () => {
  const t = corporateTax(-5200, 0.25, flat(0));
  assert.equal(t.taxPaidAnnualUSD, 0, 'a loss pays nothing');
  assert.equal(t.carryforwardUSD, 100, "one week's slice of the year-rate loss: 5200/52");
});

test('TAXR: a recovering firm pays nothing until the carryforward is gone', () => {
  // Year-rate profit 5200 = 100/week of taxable income against a 250 carryforward stock.
  let carry = 250;
  const paid: number[] = [];
  for (let w = 0; w < 4; w++) {
    const t = corporateTax(5200, 0.25, flat(carry));
    carry = t.carryforwardUSD;
    paid.push(t.taxPaidAnnualUSD);
  }
  assert.deepEqual(paid.slice(0, 2), [0, 0], 'two full weeks shielded');
  assert.ok(paid[2] > 0 && paid[2] < paid[3], 'the third week is partly shielded (50 of 100)');
  assert.equal(paid[3], 5200 * 0.25, 'shield exhausted: the full year-rate applies');
  assert.equal(carry, 0);
});

test('TAXR: receipts fall faster than profits — the cyclical asymmetry', () => {
  // Profit halves; receipts do not merely halve, they vanish for as long as the loss
  // history lasts. That asymmetry is what a real treasury faces in a downturn.
  const boom = corporateTax(5200, 0.25, flat(0));
  const bust = corporateTax(2600, 0.25, flat(500));
  assert.equal(boom.taxPaidAnnualUSD, 1300);
  assert.equal(bust.taxPaidAnnualUSD, 0, 'half the profit, none of the tax');
});

test('TAXR: acceleration defers — buying plant shields near-term profit', () => {
  // Book runs straight-line inside EBIT (added back); tax runs double-declining on the basis.
  // Fresh plant of 1040 over 10 years: book 104/yr, tax 208/yr — the extra 104 shields profit
  // and (book − basis) × rate accrues as the deferred liability.
  const t = corporateTax(1000, 0.25, {
    bookDepreciationAnnualUSD: 104, taxBasisPpeUSD: 1040, usefulLifeYears: 10,
    capexDeliveredAnnualUSD: 0, carryforwardUSD: 0, bookNetPpeUSD: 1040,
  });
  assert.equal(t.taxDepreciationAnnualUSD, 208, 'double-declining: 2/10 of the basis');
  assert.equal(t.taxPaidAnnualUSD, (1000 + 104 - 208) * 0.25, 'the swap shields the gap');
  assert.equal(t.taxBasisPpeUSD, 1040 - 208 / 52, 'the basis ran down one week of the schedule');
  assert.ok(t.deferredTaxLiabilityUSD > 0, 'what acceleration deferred is on the books');
});

test('TAXR: the old EBIT-gate rebate corner is dead', () => {
  // Positive EBIT, negative pre-tax (the over-levered but sound firm) used to get
  // preTax × (1 − rate) — a rebate. Now: negative taxable income pays nothing and accrues.
  const r = netIncomeUSD(100, 500, 0.25, flat(0));
  assert.equal(r.netUSD, -400, 'the loss is the loss');
  assert.equal(r.tax.taxPaidAnnualUSD, 0);
  assert.ok(r.tax.carryforwardUSD > 0, 'and it builds loss history');
});

test('TAXR: the statement carries the attributes through both paths', () => {
  const tax = { taxBasisPpeUSD: 1000, usefulLifeYears: 10, capexDeliveredAnnualUSD: 0,
    carryforwardUSD: 0, bookNetPpeUSD: 1000 };
  const ind = industrialIncome({ revenueLocal: 1000, ebitdaMargin: 0.3, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0.25, sharesOutstanding: 10, tax });
  const pro = profileIncome({ revenueLocal: 1000, otherIncomeAnnualUSD: 0, inputCostAnnualUSD: 0,
    payrollAnnualUSD: 0, profileCostsAnnualUSD: 700, grossPPELocal: 1000, ppeDepreciationYears: 20,
    annualInterestUSD: 0, taxRate: 0.25, sharesOutstanding: 10, tax });
  [ind, pro].forEach((s) => {
    assert.ok(s.taxPaidAnnualUSD > 0);
    assert.ok(s.taxBasisPpeUSD < 1000, 'the basis rolled forward');
    assert.ok(s.deferredTaxLiabilityUSD > 0);
    assert.equal(s.taxLossCarryforwardUSD, 0);
  });
});
