import { sectorRowAt, openingCashOf, stashOpeningCash, openAccount, depositLinesAt, treasuryAccountOf, waysAndMeansOf, stashSeedGovLadder, seedGovLadderOf } from '../ledger/accounts';
import { currencyOf } from '../../domain/geography';
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
 *     carry, bond by bond; a coupon is never paid to nobody.
 */

import { Company, InstitutionalEntity, Region, RegionId } from '../../types';
import { BankingSector } from '../../domain/banking';
import { bankTotalAssetsUSD } from '../macro/banking';
import { centralBankFxReservesUSD, centralBankAssetsUSD } from '../../domain/central-bank';

import { holdingClassOf } from '../../domain/assets';
import { weeklyInterestExpenseUSD, govTrancheView } from '../../domain/government';
import { facilityBookOf, ladderRowsOf, trancheScheduleOf, TR_FACILITY, TR_CP, TR_FLOATING } from '../../engine2/tranches';
import { TRANCHE_DEFAULT_COUPON, TRANCHE_DEFAULT_MARGIN_BPS } from '../../domain/stated';
import { accrueHoldersInterest, applyHolderInterestAccruals } from '../simulation/stages/shared-helpers';
import { accrueSovereignHolders } from '../simulation/stages/sovereign-calendar';
import { materializeGovLadder } from '../../engine2/tranches';
import { sovereignCouponByBond } from '../../domain/government';
import { COUPON_PERIOD_WEEKS } from '../../domain/pricing';

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
        + Math.max(0, lines.smeUSD) + Math.max(0, s.clientMarginUSD ?? 0) + Math.max(0, s.centralBankLoanUSD ?? 0);
      const needUSD = bankTotalAssetsUSD(s, openingCashOf(s), facilityBookOf(v2, b.ticker)) - s.bankEquityUSD - (s.repoBorrowedUSD ?? 0) - (s.srfBorrowingUSD ?? 0) - otherDepositsUSD;
      let lineUSD = 0;
      if (needUSD >= 0) {
        lineUSD = Math.round(needUSD);
      } else {
        // Over-funded: the depositors' money is real, so the bank holds it as reserves.
        stashOpeningCash(s, Math.round(openingCashOf(s) - needUSD));
      }
      householdDepositsUSD += lineUSD;
      // A3.4/A3.6c-iii: the household sector's row at this bank opens at the line struck — the
      // only place the line exists (the seed's provisional sizing was a stash, retired here).
      v2.accounts.balance[sectorRowAt(v2, { kind: 'HOUSEHOLD', region: regionId }, b.ticker, currencyOf(regionId))] = lineUSD;
      // A3.6a: the bank's own account opens at the reserves the close strikes.
      openAccount(v2, { kind: 'BANK', ticker: b.ticker }, currencyOf(regionId), openingCashOf(s));
    });
    const hs = reg.householdState;
    // The seed's provisional sizing of the sector's deposits (macro/initialization.ts) is what
    // net worth was struck on; the residual replaces it and net worth moves by the difference.
    const priorHouseholdDepositsUSD = openingCashOf(hs);
    hs.netWorthUSD = Math.round((hs.netWorthUSD ?? 0) + (Math.round(householdDepositsUSD) - priorHouseholdDepositsUSD));

    // ---- 2. The central bank's book backs reserves and the treasury's account exactly. ----
    const reservesUSD = banks.reduce((a, b) => a + openingCashOf(b.bankBalanceSheet!), 0);
    cb.currencyInCirculationUSD = 0;
    const targetBookUSD = Math.max(0, reservesUSD + treasuryAccountOf(v2, regionId) - centralBankFxReservesUSD(cb));
    const currentBookUSD = sumByTenor(cb.sovereignHoldingsByBond);
    const weights = new Map<string, number>();
    // §3.13-SOV row 3: weighted by BOND, so the fallback book below names bonds like every
    // other holder's does.
    materializeGovLadder(v2, regionId).forEach((t) => { weights.set(t.id, (weights.get(t.id) ?? 0) + t.principalUSD); });
    const weightTotal = [...weights.values()].reduce((a, v) => a + v, 0) || 1;
    const scaled: Record<string, number> = {};
    if (currentBookUSD > 0) {
      Object.entries(cb.sovereignHoldingsByBond ?? {}).forEach(([k, v]) => { scaled[k] = Math.round((Number(v) || 0) * (targetBookUSD / currentBookUSD)); });
    } else {
      weights.forEach((w, k) => { scaled[k] = Math.round(targetBookUSD * (w / weightTotal)); });
    }
    cb.sovereignHoldingsByBond = scaled;

    // ---- 3. The stock outstanding is what the named holders hold, BOND BY BOND. ----
    // §3.13-SOV row 3: every holder's key is the bond's id, so this reconciles per bond instead
    // of per tenor bucket. Bucket-wise it could only scale a rung by its GROUP's held share,
    // which spread one bond's shortfall across every other bond of a similar tenor.
    const heldByBond = new Map<string, number>();
    const add = (id: string | undefined, usd: number) => { if (id && usd > 0) heldByBond.set(id, (heldByBond.get(id) ?? 0) + usd); };
    Object.entries(cb.sovereignHoldingsByBond).forEach(([id, v]) => add(id, Number(v) || 0));
    banks.forEach((b) => Object.entries(b.bankBalanceSheet!.sovereignBondHoldingsByBond ?? {}).forEach(([id, v]) => add(id, Number(v) || 0)));
    institutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      (e.itemizedHoldings ?? []).forEach((h) => { if (holdingClassOf(h.instrumentType) === 'SOVEREIGN' && h.issuerRegion === regionId) add(h.instrumentId, h.quantityOrNotionalUSD ?? 0); });
    });
    companies.forEach((c) => {
      ((c as unknown as { treasuryHoldings?: { instrumentType: string; issuerRegion: string; instrumentId: string; quantityOrNotionalUSD?: number }[] }).treasuryHoldings ?? [])
        .forEach((h) => { if (holdingClassOf(h.instrumentType) === 'SOVEREIGN' && h.issuerRegion === regionId) add(h.instrumentId, h.quantityOrNotionalUSD ?? 0); });
    });
    (reg.bankingSector.sovBondDealerInventory ?? []).forEach((p) => add(p.bondId, p.inventoryUSD));
    // §3.13-SOV row 2: the seed's ladder is a stash, not a field — `openSeededMirrors` issues
    // its rows next and the stash is gone. The outstanding of a bond IS what its holders hold:
    // no group, no share of a bucket.
    stashSeedGovLadder(reg, seedGovLadderOf(reg).map((t) => ({
      ...t,
      principalUSD: Math.round(heldByBond.get(t.id) ?? 0),
    })));
    // The stash carries what the seed STATED; the tenor is derived, as it is on every read.
    reg.governmentInterestWeeklyUSD = Math.round(weeklyInterestExpenseUSD(seedGovLadderOf(reg).map(govTrancheView)));
    reg.centralBankBalanceSheet = Math.round(centralBankAssetsUSD(cb, waysAndMeansOf(v2, regionId), currencyOf(regionId), v2.fx));
  });
}

/**
 * §3.37-SEED / atlas the-seed D2 — THE ACCRUAL LEDGER OPENS AT WHAT HAS ACCRUED.
 *
 * The seed ages every ladder, so a rung opens part-way through its coupon period — and the accrual
 * ledger opened EMPTY, so its first coupon paid only the weeks since the world began rather than
 * the weeks since its own last payment date. Self-consistent (the issuer pays the sum of the
 * accruals, so nothing leaked) and wrong in level: every holder's first coupon was short by up to
 * half a period, and the treasury's first-year interest with it.
 *
 * The amount is DERIVED, not stated: `annual × (weeks since this tranche's last coupon date) / 52`,
 * off the schedule the store now carries. The SPLIT across holders is not re-implemented here —
 * `applyHolderInterestAccruals` owns that rule (register share, desk share, holders of record) and
 * this hands it one opening week's worth of accrual and lets it run with nothing due (rule 4).
 *
 * Commercial paper is excluded: it accrues from ISSUE to maturity rather than in periods, and the
 * seed issues none — the treasury stage does, at the week it issues.
 */
export function seedOpeningAccruals(
  regions: Record<RegionId, Region>,
  companies: Company[],
  institutionalEntities: InstitutionalEntity[],
  v2: V2World,
  currentWeek: number,
  holderAccruedInterestUSD: Map<string, Map<string, number>>,
  sovereignAccruedInterestUSD: Map<string, number>,
): void {
  const TS = v2.tranches;
  const pendingHolderAccrualUSD = new Map<string, number>();
  companies.forEach((c) => {
    for (const tr of ladderRowsOf(v2, c.id)) {
      const fl = TS.flags[tr];
      // A facility's interest goes to its house bank, not the register; CP has no periods.
      if (fl & TR_FACILITY || fl & TR_CP) continue;
      const floating = (fl & TR_FLOATING) !== 0;
      const annualRate = floating
        ? (Number.isNaN(TS.floatingMarginBps[tr]) ? TRANCHE_DEFAULT_MARGIN_BPS : TS.floatingMarginBps[tr]) / 10000
        : (Number.isNaN(TS.couponRate[tr]) ? TRANCHE_DEFAULT_COUPON : TS.couponRate[tr]);
      // A floater's coupon is policy + margin; at the seed the policy rate is the region's own.
      const policyRate = floating ? (regions[c.region]?.policyRate ?? 0) : 0;
      const { periodWeeks, anchorWeek } = trancheScheduleOf(TS, tr);
      // Weeks elapsed in the CURRENT period. A rung issued this week has accrued nothing.
      const since = currentWeek - anchorWeek;
      const elapsedWeeks = since <= 0 ? 0 : since % periodWeeks;
      if (elapsedWeeks === 0) continue;
      const annualUSD = TS.principalUSD[tr] * (floating ? policyRate + annualRate : annualRate);
      const accruedUSD = (annualUSD * elapsedWeeks) / 52;
      if (!(accruedUSD > 0)) continue;
      accrueHoldersInterest({ pendingHolderAccrualUSD },
        v2.internedStrings[TS.idRef[tr]], floating ? 'LEVERAGED_LOAN' : 'CORP_BOND', accruedUSD);
    }
  });
  // The SOVEREIGN side, through the calendar's own holder walk: a seeded bond opens with the
  // weeks it has run since its last coupon date, counted from its issue week like every other.
  (Object.keys(regions) as RegionId[]).forEach((regionId) => {
    const ladder = materializeGovLadder(v2, regionId);
    const couponByBond = sovereignCouponByBond(ladder);
    const elapsedByBond = new Map<string, number>();
    ladder.forEach((b) => {
      const since = currentWeek - b.originationWeek;
      elapsedByBond.set(b.id, since <= 0 ? 0 : since % COUPON_PERIOD_WEEKS);
    });
    accrueSovereignHolders(
      { v2, updatedInstitutionalEntities: institutionalEntities, updatedCompanies: companies,
        sovereignAccruedInterestUSD },
      regionId, couponByBond, (bondId) => elapsedByBond.get(bondId) ?? 0,
    );
  });

  if (pendingHolderAccrualUSD.size === 0) return;
  applyHolderInterestAccruals({
    v2,
    updatedInstitutionalEntities: institutionalEntities,
    updatedCompanies: companies,
    pendingHolderAccrualUSD,
    // Nothing is DUE at the seed: this opens the balance, it does not pay it.
    pendingHolderAccrualPayout: new Set<string>(),
    holderAccruedInterestUSD,
  } as Parameters<typeof applyHolderInterestAccruals>[0]);
}
