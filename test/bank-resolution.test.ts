/**
 * §7.339 — the resolution's loss order, pinned: the shell's own ladder is bailed in first, the
 * wholesale lenders take the next slice as a haircut, and only the remainder is a public cost;
 * a positive net is paid to the receivership; the assuming bank's sheet closes to the dollar
 * after the transfer; a mortgage book moves by its vintages, never by a blended scalar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BankingSector } from '../src/domain/banking';
import { absorbBankSheet } from '../src/engine/ledger/bank-transfer';
import {
  bankAssumedLiabilitiesUSD, bankSheetAssetsUSD, chooseAssumingBank, isBankUnderPca,
  mergeHouseholdPool, planBankResolution, PCA_CAPITAL_RATIO,
} from '../src/domain/bank-resolution';

const sheet = (over: Partial<BankingSector> = {}): BankingSector => ({
  businessLoanBookUSD: 100, consumerLoanBookUSD: 0, depositsUSD: 80, sovereignBondHoldingsUSD: 20,
  cashReservesUSD: 10, bankEquityUSD: 5, bankCapitalRatio: 0.05, netInterestMarginPct: 0.02,
  loanLossProvisionRateAnnualPct: 0.01, creditConditionsIndex: 0, centralBankReservesUSD: 10,
  moneySupplyM2USD: 80, itemizedHoldings: [], srfBorrowingUSD: 0, onRrpLendingUSD: 0,
  corpBondDealerInventory: [], sovereignBondHoldingsByTenor: { t10: 20 }, sovBondDealerInventory: [],
  loanDealerInventory: [], repoLentUSD: 0, repoBorrowedUSD: 0, repoEncumberedCollateralUSD: 0,
  businessLoans: [], householdLoans: [], corporateDepositsUSD: 15, wholesaleFundingUSD: 30,
  ...over,
});

const identityResidual = (s: BankingSector) =>
  bankAssumedLiabilitiesUSD(s) + (s.wholesaleFundingUSD ?? 0) + s.bankEquityUSD - bankSheetAssetsUSD(s);

test('PCA: closed below the ratio, open above it, closed at negative capital with no RWA', () => {
  assert.equal(isBankUnderPca(sheet({ bankEquityUSD: 100 * PCA_CAPITAL_RATIO - 1 })), true);
  assert.equal(isBankUnderPca(sheet({ bankEquityUSD: 100 * PCA_CAPITAL_RATIO + 1 })), false);
  assert.equal(isBankUnderPca(sheet({ businessLoanBookUSD: 0, bankEquityUSD: -1 })), true);
});

test('positive net: the acquirer is capitalised first, the receivership gets what is left', () => {
  const s = sheet(); // assets 130, assumed 95, wholesale 30, equity 5 — identity holds
  assert.equal(identityResidual(s), 0);
  const plan = planBankResolution(s, 12, 4);
  assert.equal(plan.ladderStaysUSD, 12);
  assert.equal(plan.wholesaleAssumedUSD, 18);
  assert.equal(plan.wholesaleHaircutUSD, 0);
  assert.equal(plan.netBookUSD, 17); // equity 5 + the ladder 12 the acquirer does not assume
  assert.equal(plan.acquirerCapitalUSD, 4);
  assert.equal(plan.estateUSD, 13);
  assert.equal(plan.guaranteeUSD, 0);
});

test('a shortfall: the wholesale lenders fund it first, the treasury only what they cannot', () => {
  const small = planBankResolution(sheet({ bankEquityUSD: -8, wholesaleFundingUSD: 43 }), 0, 0);
  assert.equal(small.wholesaleHaircutUSD, 8);
  assert.equal(small.wholesaleAssumedUSD, 35);
  assert.equal(small.guaranteeUSD, 0);
  assert.equal(small.estateUSD, 0);
  const capital = planBankResolution(sheet(), 0, 20); // net 5, capital 20 → shortfall 15 from wholesale 30
  assert.equal(capital.wholesaleHaircutUSD, 15);
  assert.equal(capital.wholesaleAssumedUSD, 15);
  assert.equal(capital.estateUSD, 0);
  assert.equal(capital.guaranteeUSD, 0);
  const beyond = planBankResolution(sheet({ bankEquityUSD: -50, wholesaleFundingUSD: 30, depositsUSD: 135 }), 0, 5);
  assert.equal(beyond.wholesaleHaircutUSD, 30);
  assert.equal(beyond.wholesaleAssumedUSD, 0);
  assert.equal(beyond.guaranteeUSD, 25);
});

test('the ladder never exceeds the wholesale line it lives inside', () => {
  const plan = planBankResolution(sheet({ wholesaleFundingUSD: 10 }), 25, 0);
  assert.equal(plan.ladderStaysUSD, 10);
  assert.equal(plan.wholesaleAssumedUSD, 0);
});

test('the transfer closes both sheets: acquirer takes every line, target keeps only cash and the matching equity', () => {
  const F = sheet({
    householdLoans: [{ kind: 'MORTGAGE', principalUSD: 40, vintages: [{ principalUSD: 40, originationCollateralUSD: 60, originationHomePriceUSD: 300000, rateAnnual: 0.05, wamWeeks: 900, fixedForWeeks: 100, originatedWeek: 0 }], wacAnnual: 0.05 }],
    consumerLoanBookUSD: 40, depositsUSD: 120, institutionalDepositsUSD: 5, sovereignAccruedCouponUSD: 1,
    dealerDeskInventory: { 'corporate bond': [{ instrumentId: 'x', inventoryUSD: 4 }] },
    primeBrokerageLoansUSD: 2, repoBorrowedUSD: 6, bankEquityUSD: 1,
  });
  // assets 100+40+20+10+1+4+2 = 177; assumed 120+15+5+6 = 146; wholesale 30; equity 1 → identity
  assert.equal(identityResidual(F), 0);
  const A = sheet({
    householdLoans: [{ kind: 'MORTGAGE', principalUSD: 10, vintages: [{ principalUSD: 10, originationCollateralUSD: 15, originationHomePriceUSD: 250000, rateAnnual: 0.04, wamWeeks: 800, fixedForWeeks: 50, originatedWeek: 0 }], wacAnnual: 0.04 }],
    consumerLoanBookUSD: 10, depositsUSD: 90, bankEquityUSD: 6, dealerDeskInventory: { 'corporate bond': [{ instrumentId: 'x', inventoryUSD: 1 }] },
  });
  assert.equal(identityResidual(A), 0);
  const plan = planBankResolution(F, 0, 3);
  const cash = F.cashReservesUSD;
  absorbBankSheet(A, F, plan.wholesaleAssumedUSD);
  A.bankEquityUSD += plan.netBookUSD + plan.wholesaleHaircutUSD - cash;
  F.bankEquityUSD = cash; F.wholesaleFundingUSD = 0;
  // The cash leg is a payment (reserves and equity on both sides); replay it here.
  A.cashReservesUSD += cash; A.bankEquityUSD += cash; F.cashReservesUSD -= cash; F.bankEquityUSD -= cash;
  assert.ok(Math.abs(identityResidual(A)) < 1e-9, `acquirer residual ${identityResidual(A)}`);
  // The guarantee and the receivership payment are flows on the acquirer's own account.
  A.cashReservesUSD += plan.guaranteeUSD - plan.estateUSD; A.bankEquityUSD += plan.guaranteeUSD - plan.estateUSD;
  assert.ok(Math.abs(identityResidual(A)) < 1e-9);
  assert.ok(Math.abs(A.bankEquityUSD - (6 + plan.acquirerCapitalUSD)) < 1e-9, 'the acquirer gains exactly the capital the book needs');
  assert.equal(bankSheetAssetsUSD(F), 0);
  assert.equal(bankAssumedLiabilitiesUSD(F) + F.bankEquityUSD, 0);
  const mortgage = A.householdLoans.find((p) => p.kind === 'MORTGAGE')!;
  assert.equal(mortgage.vintages!.length, 2);
  assert.equal(mortgage.principalUSD, 50);
  assert.equal(A.consumerLoanBookUSD, 50);
  assert.deepEqual(A.dealerDeskInventory!['corporate bond'].map((r) => r.inventoryUSD), [5]);
});

test('mergeHouseholdPool blends terms by principal and keeps every vintage', () => {
  const out = mergeHouseholdPool(
    { kind: 'CREDIT_CARD', principalUSD: 30, marginBps: 1000 },
    { kind: 'CREDIT_CARD', principalUSD: 10, marginBps: 600 },
  );
  assert.equal(out.principalUSD, 40);
  assert.equal(out.marginBps, 900);
  assert.equal(out.vintages, undefined);
});

test('the assuming bank is the best-capitalised peer above the floor, by equity; never one under PCA', () => {
  const cands = [
    { id: 'weak', sheet: sheet({ bankEquityUSD: 1 }) },
    { id: 'big', sheet: sheet({ bankEquityUSD: 12 }) },
    { id: 'bigger-but-thin', sheet: sheet({ businessLoanBookUSD: 1000, bankEquityUSD: 30 }) },
  ];
  assert.equal(chooseAssumingBank(cands, 0.08)!.id, 'big');
  assert.equal(chooseAssumingBank([cands[0], cands[2]], 0.08)!.id, 'bigger-but-thin');
  assert.equal(chooseAssumingBank([cands[0]], 0.08), undefined);
});
