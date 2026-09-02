import { sectorRowAt, openingCashOf, stashOpeningCash, openAccount, depositLinesAt } from '../ledger/accounts';
import { V2World } from '../../engine2/world';
/**
 * CLOSE C2 — THE SEED CLOSES (§5-CLOSE). Run once, after every book has been seeded and before
 * the aggregates are projected. Three identities the seed used to leave open are made exact:
 *
 *  1. **The banks are funded by depositors, not by a lender nobody named.** The seed derived
 *     wholesale funding as the residual after deposits (`applyBankFundingSplit`); that residual
 *     was money owed to nobody. The household sector IS the depositor of last resort in a closed
 *     world, so each bank's household deposit line is what its asset side needs after the real
 *     corporate, institutional and segment balances, and wholesale opens at zero.
 *  2. **The central bank's book backs its liabilities to the dollar.** Reserves exist because the
 *     central bank bought something. Its sovereign book is set to reserves + treasury account −
 *     FX reserves; the paper it holds beyond what the treasury had issued is real issuance to the
 *     central bank at birth (the coupon returns as remittance, net of interest on reserves).
 *  3. **Every sovereign bond has a holder.** The stock outstanding is what the named holders —
 *     the central bank, the banks, the institutions, corporate treasuries, the desks — actually
 *     carry, bucket by bucket; a coupon is never paid to nobody.
 */

import { Company, InstitutionalEntity, Region, RegionId } from '../../types';
import { BankingSector } from '../../domain/banking';
import { bankTotalAssetsUSD } from '../macro/banking';
import { centralBankFxReservesUSD, centralBankAssetsUSD } from '../../domain/central-bank';
import { govBucketKeyOf } from '../../domain/sovereign-id';
import { sovBucketKey } from '../simulation/stages/shared-helpers';
import { weeklyInterestExpenseUSD } from '../../domain/government';

const sumByTenor = (byTenor: Record<string, number> | undefined): number =>
  Object.values(byTenor ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

export function closeSeedMoney(
  regions: Record<RegionId, Region>,
  companies: Company[],
  institutionalEntities: InstitutionalEntity[],
  /** §5-WIRES A3.4: the world the seed is opening — the household sector's row at each bank opens at the line struck here. */
  v2: V2World
): void {
  (Object.keys(regions) as RegionId[]).forEach((regionId) => {
    const reg = regions[regionId];
    const banks = companies.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && !c.isDefaulted);
    const cb = reg.centralBankSheet;
    if (!cb || banks.length === 0) return;

    // ---- 1. Household deposits are the funding residual; wholesale is nobody's and is zero. ----
    let householdDepositsUSD = 0;
    banks.forEach((b) => {
      const s: BankingSector = b.bankBalanceSheet!;
      // A3.6c-ii: the corporate and institutional lines are the depositors' accounts, open by now
      // (the seed opens them before this close). The seed sizes its lines TO THE DOLLAR (the stated
      // rule the field carried; a sub-dollar change here moved the week-2 print — §7.392), so the
      // funding residual is struck on the rounded lines.
      const lines = depositLinesAt(v2, companies, institutionalEntities, b.ticker);
      const otherDepositsUSD = Math.round(Math.max(0, lines.corporateUSD)) + Math.round(Math.max(0, lines.institutionalUSD))
        + Math.max(0, s.smeDepositsUSD ?? 0) + Math.max(0, s.clientMarginUSD ?? 0) + Math.max(0, s.centralBankLoanUSD ?? 0);
      const needUSD = bankTotalAssetsUSD(s, openingCashOf(s)) - s.bankEquityUSD - (s.repoBorrowedUSD ?? 0) - (s.srfBorrowingUSD ?? 0) - otherDepositsUSD;
      if (needUSD >= 0) {
        s.depositsUSD = Math.round(needUSD);
      } else {
        // Over-funded: the depositors' money is real, so the bank holds it as reserves.
        s.depositsUSD = 0;
        stashOpeningCash(s, Math.round(openingCashOf(s) - needUSD));
      }
      householdDepositsUSD += s.depositsUSD;
      v2.accounts.balanceUSD[sectorRowAt(v2, { kind: 'HOUSEHOLD', region: regionId }, b.ticker)] = s.depositsUSD;
      // A3.6a: the bank's own account opens at the reserves the close strikes.
      openAccount(v2, { kind: 'BANK', ticker: b.ticker }, openingCashOf(s));
    });
    const hs = reg.householdState;
    // The seed's provisional sizing of the sector's deposits (macro/initialization.ts) is what
    // net worth was struck on; the residual replaces it and net worth moves by the difference.
    const priorHouseholdDepositsUSD = openingCashOf(hs);
    hs.netWorthUSD = Math.round((hs.netWorthUSD ?? 0) + (Math.round(householdDepositsUSD) - priorHouseholdDepositsUSD));
    reg.bankingSector = {
      ...reg.bankingSector,
      depositsUSD: Math.round(banks.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0)),
    };

    // ---- 2. The central bank's book backs reserves and the treasury's account exactly. ----
    const reservesUSD = banks.reduce((a, b) => a + openingCashOf(b.bankBalanceSheet!), 0);
    cb.currencyInCirculationUSD = 0;
    const targetBookUSD = Math.max(0, reservesUSD + cb.treasuryAccountUSD - centralBankFxReservesUSD(cb));
    const currentBookUSD = sumByTenor(cb.sovereignHoldingsByTenor);
    const weights = new Map<string, number>();
    (reg.govDebtTranches ?? []).forEach((t) => { const k = sovBucketKey(t.tenorAtIssuanceYears); weights.set(k, (weights.get(k) ?? 0) + t.principalUSD); });
    const weightTotal = [...weights.values()].reduce((a, v) => a + v, 0) || 1;
    const scaled: Record<string, number> = {};
    if (currentBookUSD > 0) {
      Object.entries(cb.sovereignHoldingsByTenor ?? {}).forEach(([k, v]) => { scaled[k] = Math.round((Number(v) || 0) * (targetBookUSD / currentBookUSD)); });
    } else {
      weights.forEach((w, k) => { scaled[k] = Math.round(targetBookUSD * (w / weightTotal)); });
    }
    cb.sovereignHoldingsByTenor = scaled;

    // ---- 3. The stock outstanding is what the named holders hold, bucket by bucket. ----
    const heldByBucket = new Map<string, number>();
    const add = (k: string | undefined, usd: number) => { if (k && usd > 0) heldByBucket.set(k, (heldByBucket.get(k) ?? 0) + usd); };
    Object.entries(cb.sovereignHoldingsByTenor).forEach(([k, v]) => add(k, Number(v) || 0));
    banks.forEach((b) => Object.entries(b.bankBalanceSheet!.sovereignBondHoldingsByTenor ?? {}).forEach(([k, v]) => add(k, Number(v) || 0)));
    institutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      (e.itemizedHoldings ?? []).forEach((h) => { if (h.instrumentType === 'GOV_BOND' && h.issuerRegion === regionId) add(govBucketKeyOf(h.instrumentId, regionId), h.quantityOrNotionalUSD ?? 0); });
    });
    companies.forEach((c) => {
      ((c as unknown as { treasuryHoldings?: { instrumentType: string; issuerRegion: string; instrumentId: string; quantityOrNotionalUSD?: number }[] }).treasuryHoldings ?? [])
        .forEach((h) => { if (h.instrumentType === 'GOV_BOND' && h.issuerRegion === regionId) add(govBucketKeyOf(h.instrumentId, regionId), h.quantityOrNotionalUSD ?? 0); });
    });
    (reg.bankingSector.sovBondDealerInventory ?? []).forEach((p) => add(p.tenorKey, p.inventoryUSD));
    const outstandingByBucket = new Map<string, number>();
    (reg.govDebtTranches ?? []).forEach((t) => { const k = sovBucketKey(t.tenorAtIssuanceYears); outstandingByBucket.set(k, (outstandingByBucket.get(k) ?? 0) + t.principalUSD); });
    reg.govDebtTranches = (reg.govDebtTranches ?? []).map((t) => {
      const k = sovBucketKey(t.tenorAtIssuanceYears);
      const out = outstandingByBucket.get(k) ?? 0;
      const held = heldByBucket.get(k) ?? 0;
      return { ...t, principalUSD: Math.round(out > 0 ? t.principalUSD * (held / out) : 0) };
    });
    reg.governmentInterestWeeklyUSD = Math.round(weeklyInterestExpenseUSD(reg.govDebtTranches));
    reg.centralBankBalanceSheet = Math.round(centralBankAssetsUSD(cb));
  });
}
