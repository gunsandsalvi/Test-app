/** §3.20c-ii — the borrower shops: the pool's demand goes to the keenest quote first. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSmeShopping } from '../src/engine/simulation/stages/bank-lending';
import type { Region, Company } from '../src/types';
import type { BankingSector } from '../src/domain/banking';

const region = (): Region => ({
  policyRateAnnual: 0.03,
  smePools: [{ industry: 'apparel_retail', annualRevenueLocal: 10e9, marginPct: 0.15, debtLocal: 1e9, defaultRateAnnualPct: 0.02 }],
} as unknown as Region);
const bank = (ticker: string, beta: number): Company => ({ ticker, id: `E-${ticker}`, beta } as unknown as Company);
const sheet = (equityLocal: number, nim = 0.02): BankingSector =>
  ({ bankEquityLocal: equityLocal, businessLoans: [], householdLoans: [], netInterestMarginPct: nim } as unknown as BankingSector);

test('the keenest quote takes the demand first; a wider quote gets only what the pool still wants at its price', () => {
  const plan = planSmeShopping([
    { bank: bank('WIDE', 2.0), sheet: sheet(50e9) },
    { bank: bank('KEEN', 0.5), sheet: sheet(50e9) },
  ], region(), 'USA');
  const keen = plan.grantedByBankTicker.get('KEEN' as never)?.get('apparel_retail') ?? 0;
  const wide = plan.grantedByBankTicker.get('WIDE' as never)?.get('apparel_retail') ?? 0;
  assert.ok(keen > 0, 'the keen bank writes the loan');
  assert.equal(wide, 0, 'the wide quote is a lost loan');
  assert.equal(plan.declinedLocal, 0);
});

test('a bank out of headroom passes the remainder down the quotes; nobody left means declined', () => {
  const plan = planSmeShopping([
    { bank: bank('KEEN', 0.5), sheet: sheet(1e6) },
    { bank: bank('WIDE', 2.0), sheet: sheet(50e9) },
  ], region(), 'USA');
  const keen = plan.grantedByBankTicker.get('KEEN' as never)?.get('apparel_retail') ?? 0;
  const wide = plan.grantedByBankTicker.get('WIDE' as never)?.get('apparel_retail') ?? 0;
  assert.ok(keen > 0 && wide > 0, 'the remainder goes to the next quote');
  const starved = planSmeShopping([{ bank: bank('KEEN', 0.5), sheet: sheet(1e6) }], region(), 'USA');
  assert.ok(starved.declinedLocal > 0, 'what no headroom covers is declined');
});

test('a bank running its book off quotes nothing', () => {
  const plan = planSmeShopping([{ bank: bank('LOSS', 0.5), sheet: sheet(50e9, -0.01) }], region(), 'USA');
  assert.equal(plan.grantedByBankTicker.size, 0);
  assert.ok(plan.declinedLocal > 0);
});
