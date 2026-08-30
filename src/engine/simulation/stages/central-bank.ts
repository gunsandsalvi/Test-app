/**
 * PUB2a — the central bank's week, and the TGA's effect on bank reserves.
 *
 * Runs at the end of the week, after every flow that touches the treasury has posted (coupons in
 * stage 11, issuance settlement in 07c/07f).
 *
 * The mechanism worth having: the Treasury General Account is a LIABILITY of the central bank,
 * so a dollar moving into it leaves the banking system. Tax and issuance weeks drain reserves;
 * spending weeks return them. Banks short of their buffer then go to the repo market or the SRF,
 * which WS6 already built — so a fiscal event reaches the money market through the mechanism that
 * exists rather than through a coefficient.
 */

import { GameState, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import {
  centralBankAssetsUSD, centralBankCurrencyResidualUSD, remittanceUSD,
  unbackedBankCashUSD as unbackedBankCash,
} from '../../../domain/central-bank';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey } from './shared-helpers';
import { isActiveCompany } from '../../../domain/company';

export function runCentralBankStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;

    const banks = ctx.updatedCompanies.filter(
      (c) => c.region === regionId && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet
    );
    const reservesBefore = banks.reduce((a, c) => a + c.bankBalanceSheet!.cashReservesUSD, 0);

    // ---- 1. The CB earns its own coupons and pays interest on reserves; the difference is
    // remitted to the treasury. Negative when policy exceeds the portfolio yield — a central bank
    // remitting nothing after a hiking cycle, reproduced rather than modelled separately. ----
    const couponByBucket = sovereignCouponByBucket(reg.govDebtTranches, sovBucketKey);
    const couponIncomeUSD = Object.entries(cb.sovereignHoldingsByTenor || {})
      .reduce((a, [k, v]) => a + ((Number(v) || 0) * (couponByBucket[k] ?? 0)) / 52, 0);
    const remitUSD = remittanceUSD(couponIncomeUSD, reservesBefore, reg.policyRate);

    // ---- 2. The treasury's week. Revenue in, spending out, remittance in. Only the flows that
    // genuinely pass through a bank balance sheet move reserves — today that is the coupon the
    // government pays to its bank holders. Taxes and procurement are still boundary flows
    // (PUB1b), so they move the TGA without a reserve leg and the gap is recorded below. ----
    const bankHeldCouponUSD = banks.reduce(
      (a, c) => a + Object.entries(c.bankBalanceSheet!.sovereignBondHoldingsByTenor || {})
        .reduce((x, [k, v]) => x + ((Number(v) || 0) * (couponByBucket[k] ?? 0)) / 52, 0), 0
    );
    // Financing is part of the treasury's week: a deficit is funded by issuance, and maturing
    // paper is repaid. Without these legs the TGA is debited by every deficit and credited by
    // nothing, and it simply runs down (measured: −40.3B by week 60).
    // PUB1e: debited by what actually left — interest, transfers, and the procurement the goods
    // market really supplied — not by the spending BUDGET. Falls back to the budget only before
    // stage 11 has run once.
    const outlaysUSD = reg.governmentOutlaysUSD ?? reg.governmentSpendingUSD;
    // SEG2g/CASH: the government legs that now settle as real payments (corporate and SME tax
    // remittances in, payroll and procurement out) have ALREADY moved the TGA this week, at
    // settlement, with their reserve legs. They are also inside `governmentRevenueUSD` and
    // `outlaysUSD` — the treasury's flow statement — so posting the statement unadjusted
    // credited and debited those legs a second time (found wiring the SME tax leg: the
    // settlement migration and this statement were double-counting every migrated flow).
    // The statement remains the treasury's week; what settlement executed is subtracted from it.
    const settledTgaUSD = ctx.lastSettlementReport?.tgaDeltaByRegion.get(regionId) ?? 0;
    const tgaFlowUSD = reg.governmentRevenueUSD - outlaysUSD + remitUSD
      // CASH: redemptions leave the TGA through the settlement layer now — one payment per named
      // holder, plus a boundary line for the ones this model does not name (stage 11). Taking
      // them here too would debit the account twice for one repayment.
      + (reg.lastIssuanceProceedsUSD ?? 0)
      - settledTgaUSD;
    cb.treasuryAccountUSD = Number((cb.treasuryAccountUSD + tgaFlowUSD).toFixed(0));
    cb.lastRemittanceUSD = Number(remitUSD.toFixed(0));

    // ---- 3. The reserve leg already exists and must not be posted twice. `evolveBankingSector`
    // credits each bank's sovereign coupon to its cash AND its equity in the same week (02b
    // passes it in), which is the balanced posting. What was missing is only the OTHER side —
    // the treasury paying it — and that is the TGA debit above. Crediting reserves here as well
    // broke the per-bank balance-sheet identity by exactly the coupon, on every bank.
    cb.lastReserveDrainUSD = Number((-bankHeldCouponUSD).toFixed(0));

    // ---- 4. Currency closes the balance sheet. The CB is the one book allowed to issue the
    // liability that balances it — no capital constraint, never defaults. ----
    const reservesAfter = ctx.updatedCompanies
      .filter((c) => c.region === regionId && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
      .reduce((a, c) => a + c.bankBalanceSheet!.cashReservesUSD, 0);
    cb.currencyInCirculationUSD = Number(centralBankCurrencyResidualUSD(cb, reservesAfter).toFixed(0));
    cb.unbackedBankCashUSD = Number(unbackedBankCash(cb, reservesAfter).toFixed(0));

    // Statistic, not a driver: the old `centralBankBalanceSheet` scalar's replacement.
    reg.centralBankBalanceSheet = Number(centralBankAssetsUSD(cb).toFixed(0));
  });
}
