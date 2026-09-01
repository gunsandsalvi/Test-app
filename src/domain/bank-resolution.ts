/**
 * §7.302 / §7.339 — HOW A FAILED BANK IS RESOLVED, as pure rules over its own sheet.
 *
 * A bank does not default the way a firm does (cash out and coverage under the floor); it is
 * CLOSED by its supervisor when its capital is gone, and its books do not go through a workout —
 * they go, whole, to a surviving peer the same weekend (purchase and assumption). The rules here
 * decide the two things that matter about that weekend: WHEN a bank is closed, and WHO EATS THE
 * HOLE when the books it hands over are worth less than the deposits that come with them.
 *
 * The loss order is the real one. The shell's own bond ladder stays behind as claims on the
 * receivership (its holders are bailed in — they are the one class that lent knowing this), the
 * unmodeled wholesale lenders take the next slice as a haircut on what they are owed, and only
 * what is left after both is a public cost: the treasury pays the assuming bank the difference,
 * because deposits are guaranteed and the guarantee is the government's. Depositors never lose a
 * dollar and the assuming bank never gains or loses one — it takes the net at book, and the
 * difference between that and zero moves as a named flow.
 */

import { BankingSector, HouseholdLoanPool } from './banking';
import { bankRwaUSD, BANK_WORKING_CAPITAL_RATIO } from './bank-pricing';
import { dealerDeskGrossUSD, DealerDeskInventory } from './dealer-desk';

/** Prompt corrective action: the ratio at which a bank is closed — well above zero, because a
 *  bank at zero book capital has long been insolvent at market values. Real supervision closes
 *  at 2% ("critically undercapitalised"). */
export const PCA_CAPITAL_RATIO = 0.02;

/** What an assuming bank must hold against a book it takes on: the ratio a bank's treasury
 *  actually runs at, on the book's own risk weight. */
export function assumingCapitalUSD(sheet: BankingSector): number {
  return bankRwaUSD(sheet) * BANK_WORKING_CAPITAL_RATIO;
}

/** Under prompt corrective action: capital below the closure ratio, or no capital at all. */
export function isBankUnderPca(sheet: BankingSector): boolean {
  const rwaUSD = bankRwaUSD(sheet);
  if (rwaUSD > 0) return sheet.bankEquityUSD < rwaUSD * PCA_CAPITAL_RATIO;
  return sheet.bankEquityUSD < 0;
}

/** Every asset on the sheet, cash included — the one asset side the identity counts. */
export function bankSheetAssetsUSD(sheet: BankingSector): number {
  const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {})
    .reduce((a, v) => a + (Number(v) || 0), 0);
  return sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD + sheet.cashReservesUSD
    + (sheet.repoLentUSD ?? 0) + (sheet.onRrpLendingUSD ?? 0)
    + (sheet.sovereignAccruedCouponUSD ?? 0)
    + dealerDeskGrossUSD(sheet.dealerDeskInventory)
    + (sheet.primeBrokerageLoansUSD ?? 0);
}

/** The liabilities an assuming bank takes on whole: every deposit class and the secured lines.
 *  Wholesale money and equity are the two the plan decides. */
export function bankAssumedLiabilitiesUSD(sheet: BankingSector): number {
  return sheet.depositsUSD + (sheet.corporateDepositsUSD ?? 0) + (sheet.institutionalDepositsUSD ?? 0)
    + (sheet.unmodeledDepositsUSD ?? 0) + (sheet.smeDepositsUSD ?? 0)
    + (sheet.repoBorrowedUSD ?? 0) + (sheet.srfBorrowingUSD ?? 0);
}

export interface BankResolutionPlan {
  /** The shell's own traded ladder, left behind as receivership claims (bailed in). It is
   *  inside the wholesale line, so it comes OUT of what the assuming bank takes over. */
  ladderStaysUSD: number;
  /** Wholesale money the assuming bank takes on, after the ladder and the haircut. */
  wholesaleAssumedUSD: number;
  /** What the unmodeled wholesale lenders lose. */
  wholesaleHaircutUSD: number;
  /** Assets minus everything assumed, before any loss is allocated: what the books are worth
   *  to whoever takes them, at book. */
  netBookUSD: number;
  /** The capital the assuming bank must hold against the book it takes on — its bid is the net
   *  less this, and this is what its equity gains from the deal, in every case. */
  acquirerCapitalUSD: number;
  /** The public cost: what the bail-in of the ladder and the wholesale lenders could not fund. */
  guaranteeUSD: number;
  /** What the assuming bank pays the receivership: the net above the capital it needs. */
  estateUSD: number;
}

/**
 * The least-cost bid. The assuming bank takes the books at book value and needs capital to carry
 * them — `acquirerCapitalUSD`, the working ratio on the risk it takes on. Its bid for the net is
 * whatever exceeds that; when the net falls short, the receivership owes it the difference, and
 * that shortfall is funded in the loss order: the shell's own ladder is already out (it stays
 * behind as a claim), the wholesale lenders are written down next, and the treasury pays the rest.
 */
export function planBankResolution(
  sheet: BankingSector, ownLadderPrincipalUSD: number, acquirerCapitalUSD: number,
): BankResolutionPlan {
  const wholesaleUSD = Math.max(0, sheet.wholesaleFundingUSD ?? 0);
  const ladderStaysUSD = Math.min(wholesaleUSD, Math.max(0, ownLadderPrincipalUSD));
  const transferableUSD = wholesaleUSD - ladderStaysUSD;
  const netBookUSD = bankSheetAssetsUSD(sheet) - bankAssumedLiabilitiesUSD(sheet) - transferableUSD;
  const capitalUSD = Math.max(0, acquirerCapitalUSD);
  const estateUSD = Math.max(0, netBookUSD - capitalUSD);
  const shortfallUSD = Math.max(0, capitalUSD - netBookUSD);
  const wholesaleHaircutUSD = Math.min(transferableUSD, shortfallUSD);
  return {
    ladderStaysUSD,
    wholesaleAssumedUSD: transferableUSD - wholesaleHaircutUSD,
    wholesaleHaircutUSD,
    netBookUSD,
    acquirerCapitalUSD: capitalUSD,
    guaranteeUSD: shortfallUSD - wholesaleHaircutUSD,
    estateUSD,
  };
}

/**
 * The strongest live peer takes the books: the best-capitalised bank that clears the regulatory
 * floor, by equity among those (size is what lets it carry the deposits), and failing any at the
 * floor, the largest equity that is not itself under PCA. Nobody → no resolution this week.
 */
export function chooseAssumingBank<T extends { sheet: BankingSector }>(candidates: T[], minCapitalRatio: number): T | undefined {
  const live = candidates.filter((c) => !isBankUnderPca(c.sheet));
  const ratioOf = (c: T) => { const rwa = bankRwaUSD(c.sheet); return rwa > 0 ? c.sheet.bankEquityUSD / rwa : Infinity; };
  const atFloor = live.filter((c) => ratioOf(c) >= minCapitalRatio);
  const pool = atFloor.length > 0 ? atFloor : live;
  if (pool.length === 0) return undefined;
  return pool.reduce((best, c) => (c.sheet.bankEquityUSD > best.sheet.bankEquityUSD ? c : best));
}

/** Two household pools of one kind become one: the mortgage book by its vintages (the principal
 *  IS their sum — rule 3), the floating books by principal with their terms blended. */
export function mergeHouseholdPool(mine: HouseholdLoanPool, theirs: HouseholdLoanPool): HouseholdLoanPool {
  const total = mine.principalUSD + theirs.principalUSD;
  const blend = (a: number | undefined, b: number | undefined) => (
    a === undefined && b === undefined ? undefined
      : total > 0 ? ((a ?? b ?? 0) * mine.principalUSD + (b ?? a ?? 0) * theirs.principalUSD) / total
        : (a ?? b)
  );
  const out: HouseholdLoanPool = { ...mine, principalUSD: total };
  if (mine.vintages || theirs.vintages) out.vintages = [...(mine.vintages ?? []), ...(theirs.vintages ?? [])];
  const wac = blend(mine.wacAnnual, theirs.wacAnnual);
  if (wac !== undefined) out.wacAnnual = Number(wac.toFixed(4));
  const margin = blend(mine.marginBps, theirs.marginBps);
  if (margin !== undefined) out.marginBps = Math.round(margin);
  const wam = blend(mine.wamWeeks, theirs.wamWeeks);
  if (wam !== undefined) out.wamWeeks = Math.round(wam);
  return out;
}

/** Two desks become one: a desk holds ONE position per name (the clearing stages write it back
 *  per name — a second row for the same instrument is a phantom they cannot see), so rows of
 *  the same instrument in the same book sum. */
export function mergeDesks(mine: DealerDeskInventory | undefined, theirs: DealerDeskInventory | undefined): DealerDeskInventory | undefined {
  if (!theirs) return mine;
  const out: DealerDeskInventory = { ...(mine ?? {}) };
  Object.entries(theirs).forEach(([book, rows]) => {
    const merged = [...(out[book] ?? [])];
    rows.forEach((r) => {
      const i = merged.findIndex((m) => m.instrumentId === r.instrumentId);
      if (i < 0) { merged.push({ ...r }); return; }
      const m = merged[i];
      merged[i] = {
        ...m, inventoryUSD: m.inventoryUSD + r.inventoryUSD,
        ...(m.units !== undefined || r.units !== undefined ? { units: (m.units ?? 0) + (r.units ?? 0) } : {}),
      };
    });
    out[book] = merged;
  });
  return out;
}

/** The statistics a sheet reports, re-read after its lines moved (readings, never drivers). */
export function restateBankSheetStatistics(sheet: BankingSector): void {
  const rwaUSD = bankRwaUSD(sheet);
  sheet.bankCapitalRatio = Number((rwaUSD > 0 ? sheet.bankEquityUSD / rwaUSD : 0.13).toFixed(4));
  sheet.centralBankReservesUSD = Math.max(0, sheet.cashReservesUSD);
  sheet.moneySupplyM2USD = sheet.depositsUSD + (sheet.corporateDepositsUSD ?? 0);
}
