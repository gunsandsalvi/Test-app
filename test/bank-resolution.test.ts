/**
 * §7.339 — the resolution's loss order, pinned: the shell's own ladder is bailed in first, the
 * wholesale lenders take the next slice as a haircut, and only the remainder is a public cost;
 * a positive net is paid to the receivership; the assuming bank's sheet closes to the dollar
 * after the transfer; a mortgage book moves by its vintages, never by a blended scalar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BankingSector, DepositLines } from '../src/domain/banking';
import { absorbBankSheet } from '../src/engine/ledger/bank-transfer';
import { consumerLoanBookOf } from '../src/domain/banking';
import {
  bankAssumedLiabilitiesLocal, bankSheetAssetsLocal, chooseAssumingBank, isBankUnderPca,
  mergeHouseholdPool, planBankResolution, PCA_CAPITAL_RATIO,
} from '../src/domain/bank-resolution';
import { asEntityId } from '../src/domain/ids';
import { ensureV2 } from '../src/engine2/world';

// Step 10: a bank's facility book is its rows on the borrowers' ladders, read by the caller and
// stated beside the sheet here — 100 unless said.
const FAC = 100;
const sheet = (over: Partial<BankingSector> = {}): BankingSector => ({
  bankEquityLocal: 5, bankCapitalRatio: 0.05, netInterestMarginPct: 0.02,
  loanLossProvisionRateAnnualPct: 0.01, creditConditionsIndex: 0, centralBankReservesLocal: 10,
  moneySupplyM2Local: 80, itemizedHoldings: [], srfBorrowingLocal: 0, onRrpLendingLocal: 0,
  corpBondDealerInventory: [], sovBondDealerInventory: [],
  loanDealerInventory: [], repoLentLocal: 0, repoBorrowedLocal: 0, repoEncumberedCollateralLocal: 0,
  businessLoans: [], householdLoans: [], centralBankLoanLocal: 30,
  ...over,
});

// A3.6c: a bank's reserves are its account, not a line — every sheet here banks 10 unless said.
const CASH = 10;
// §3.13-BOOK d3b: a bank's sovereign book is its register rows, read by the caller and stated
// beside the sheet here — 20 unless said.
const SOV = 20;
// A3.6c: the deposit lines are reads of the depositors' accounts; here they are stated beside
// the sheet — 80 of household money and 15 of corporate unless said.
const linesOf = (over: Partial<DepositLines> = {}): DepositLines =>
  ({ householdLocal: 80, corporateLocal: 15, institutionalLocal: 0, smeLocal: 0, ...over });
const identityResidual = (s: BankingSector, cashLocal = CASH, lines = linesOf(), facilityBookLocal = FAC, sovLocal = SOV) =>
  bankAssumedLiabilitiesLocal(s, lines) + (s.centralBankLoanLocal ?? 0) + s.bankEquityLocal - bankSheetAssetsLocal(s, cashLocal, facilityBookLocal, sovLocal);

test('PCA: closed below the ratio, open above it, closed at negative capital with no RWA', () => {
  assert.equal(isBankUnderPca(sheet({ bankEquityLocal: 100 * PCA_CAPITAL_RATIO - 1 }), FAC), true);
  assert.equal(isBankUnderPca(sheet({ bankEquityLocal: 100 * PCA_CAPITAL_RATIO + 1 }), FAC), false);
  assert.equal(isBankUnderPca(sheet({ bankEquityLocal: -1 }), 0), true);
});

test('positive net: the acquirer is capitalised first, the receivership gets what is left', () => {
  const s = sheet(); // assets 130, assumed 95, wholesale 30, equity 5 — identity holds
  assert.equal(identityResidual(s), 0);
  const plan = planBankResolution(s, 12, 4, CASH, linesOf(), FAC, SOV);
  // The whole central-bank loan moves; the shell's own ladder stays on its rows as a claim and
  // is never netted against it, so the net book is the equity and nothing else.
  assert.equal(plan.ladderBailedInLocal, 12);
  assert.equal(plan.centralBankLoanAssumedLocal, 30);
  assert.equal(plan.netBookLocal, 5);
  assert.equal(plan.acquirerCapitalLocal, 4);
  assert.equal(plan.estateLocal, 1);
  assert.equal(plan.guaranteeLocal, 0);
});

test('a shortfall: the central bank is never haircut — the treasury guarantees the whole of it', () => {
  const smallSheet = sheet({ bankEquityLocal: -8, centralBankLoanLocal: 43 });
  const small = planBankResolution(smallSheet, 0, 0, CASH, linesOf(), FAC, SOV);
  assert.equal(small.centralBankLoanAssumedLocal, 43);
  assert.equal(small.guaranteeLocal, 8);
  assert.equal(small.estateLocal, 0);
  const capital = planBankResolution(sheet(), 0, 20, CASH, linesOf(), FAC, SOV); // net 5, capital 20 → shortfall 15, guaranteed
  assert.equal(capital.centralBankLoanAssumedLocal, 30);
  assert.equal(capital.estateLocal, 0);
  assert.equal(capital.guaranteeLocal, 15);
  const beyondSheet = sheet({ bankEquityLocal: -50, centralBankLoanLocal: 30 });
  const beyond = planBankResolution(beyondSheet, 0, 5, CASH, linesOf({ householdLocal: 135 }), FAC, SOV);
  assert.equal(beyond.centralBankLoanAssumedLocal, 30);
  assert.equal(beyond.guaranteeLocal, 55);
});

test('the ladder is bailed in whole and never nets against the central bank loan', () => {
  const ladderSheet = sheet({ centralBankLoanLocal: 10 });
  const plan = planBankResolution(ladderSheet, 25, 0, CASH, linesOf(), FAC, SOV);
  assert.equal(plan.ladderBailedInLocal, 25);
  assert.equal(plan.centralBankLoanAssumedLocal, 10);
});

test('the transfer closes both sheets: acquirer takes every line, target keeps only cash and the matching equity', () => {
  const F = sheet({
    householdLoans: [{ kind: 'MORTGAGE', principalLocal: 40, vintages: [{ principalLocal: 40, originationCollateralLocal: 60, originationHomePriceLocal: 300000, rateAnnual: 0.05, wamWeeks: 900, fixedForWeeks: 100, originatedWeek: 0 }], wacAnnual: 0.05 }],
    sovereignAccruedCouponLocal: 1,
    primeBrokerageLoansLocal: 2, repoBorrowedLocal: 6, bankEquityLocal: 1,
  });
  // §3.13-BOOK d3d: the desks' inventory is register rows too, stated beside the sheet with the
  // sovereign book as the bank's BOOK assets — 4 of desk paper here, 1 at the acquirer.
  let fBook = SOV + 4, aBook = SOV + 1;
  // assets 100+40+(20+4)+10+1+2 = 177; assumed 120+15+5+6 = 146; wholesale 30; equity 1 → identity
  const fLines = linesOf({ householdLocal: 120, institutionalLocal: 5 });
  assert.equal(identityResidual(F, CASH, fLines, FAC, fBook), 0);
  const A = sheet({
    householdLoans: [{ kind: 'MORTGAGE', principalLocal: 10, vintages: [{ principalLocal: 10, originationCollateralLocal: 15, originationHomePriceLocal: 250000, rateAnnual: 0.04, wamWeeks: 800, fixedForWeeks: 50, originatedWeek: 0 }], wacAnnual: 0.04 }],
    bankEquityLocal: 6,
  });
  assert.equal(identityResidual(A, CASH, linesOf({ householdLocal: 90 }), FAC, aBook), 0);
  let fCash = CASH, aCash = CASH; // the two accounts, moved here as the pass would
  // §3.13-BOOK d3b/d3d: the register books are moved by wire at the stage; here they are stated
  // beside the sheets and moved by hand, as the cash is.
  const plan = planBankResolution(F, 0, 3, fCash, fLines, FAC, fBook);
  const cash = fCash;
  absorbBankSheet(ensureV2({}), asEntityId('A'), asEntityId('F'), A, F, plan.centralBankLoanAssumedLocal);
  aBook += fBook; fBook = 0;
  A.bankEquityLocal += plan.netBookLocal - cash;
  F.bankEquityLocal = cash;
  // The cash leg is a payment (reserves and equity on both sides); replay it here.
  aCash += cash; A.bankEquityLocal += cash; fCash -= cash; F.bankEquityLocal -= cash;
  // The depositors re-key to the acquirer: its corporate and institutional lines are theirs now.
  const aLines = linesOf({ householdLocal: 210, corporateLocal: 30, institutionalLocal: 5 });
  const fLeft: DepositLines = { householdLocal: 0, corporateLocal: 0, institutionalLocal: 0, smeLocal: 0 };
  // The facilities follow the books: the ladders now name the acquirer as lender (moveFacilityLender at the stage).
  const aFac = FAC + FAC, fFac = 0;
  assert.ok(Math.abs(identityResidual(A, aCash, aLines, aFac, aBook)) < 1e-9, `acquirer residual ${identityResidual(A, aCash, aLines, aFac, aBook)}`);
  // The guarantee and the receivership payment are flows on the acquirer's own account.
  aCash += plan.guaranteeLocal - plan.estateLocal; A.bankEquityLocal += plan.guaranteeLocal - plan.estateLocal;
  assert.ok(Math.abs(identityResidual(A, aCash, aLines, aFac, aBook)) < 1e-9);
  assert.ok(Math.abs(A.bankEquityLocal - (6 + plan.acquirerCapitalLocal)) < 1e-9, 'the acquirer gains exactly the capital the book needs');
  assert.equal(bankSheetAssetsLocal(F, fCash, fFac, fBook), 0);
  assert.equal(bankAssumedLiabilitiesLocal(F, fLeft) + F.bankEquityLocal, 0);
  const mortgage = A.householdLoans.find((p) => p.kind === 'MORTGAGE')!;
  assert.equal(mortgage.vintages!.length, 2);
  assert.equal(mortgage.principalLocal, 50);
  assert.equal(consumerLoanBookOf(A), 50);
});

test('mergeHouseholdPool blends terms by principal and keeps every vintage', () => {
  const out = mergeHouseholdPool(
    { kind: 'CREDIT_CARD', principalLocal: 30, marginBps: 1000 },
    { kind: 'CREDIT_CARD', principalLocal: 10, marginBps: 600 },
  );
  assert.equal(out.principalLocal, 40);
  assert.equal(out.marginBps, 900);
  assert.equal(out.vintages, undefined);
});

test('the assuming bank is the best-capitalised peer above the floor, by equity; never one under PCA', () => {
  const cands = [
    { id: 'weak', sheet: sheet({ bankEquityLocal: 1 }), facilityBookLocal: FAC },
    { id: 'big', sheet: sheet({ bankEquityLocal: 12 }), facilityBookLocal: FAC },
    { id: 'bigger-but-thin', sheet: sheet({ bankEquityLocal: 30 }), facilityBookLocal: 1000 },
  ];
  assert.equal(chooseAssumingBank(cands, 0.08)!.id, 'big');
  assert.equal(chooseAssumingBank([cands[0], cands[2]], 0.08)!.id, 'bigger-but-thin');
  assert.equal(chooseAssumingBank([cands[0]], 0.08), undefined);
});
