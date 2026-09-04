import { sectorRowAt, openingCashOf, stashOpeningCash, openAccount, depositLinesAt, treasuryAccountOf, waysAndMeansOf, stashSeedGovLadder, seedGovLadderOf, mutableAccounts } from '../ledger/accounts';
import { accruedPerFace, weeksAccrued } from '../../domain/company';
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
import { bankTotalAssetsLocal } from '../macro/banking';
import { centralBankFxReservesLocal, centralBankAssetsLocal } from '../../domain/central-bank';

import { holdingClassOf } from '../../domain/assets';
import { weeklyInterestExpenseLocal, govTrancheView } from '../../domain/government';
import { trancheIdOf, facilityBookOf, ladderRowsOf, trancheScheduleOf, TR_FACILITY, TR_CP, TR_FLOATING } from '../../engine2/tranches';
import { TRANCHE_DEFAULT_COUPON, TRANCHE_DEFAULT_MARGIN_BPS } from '../../domain/stated';
import { accrueHoldersInterest, applyHolderInterestAccruals } from '../simulation/stages/shared-helpers';
import { accrueSovereignHolders } from '../simulation/stages/sovereign-calendar';
import { materializeGovLadder } from '../../engine2/tranches';
import { sovereignCouponByBond } from '../../domain/government';
import { setClearedPrice } from '../../engine2/prices';
import { priceFromSpreadBps } from '../../domain/pricing';
import { RATING_OAS_SPREADS } from '../pricing';
/** §3.13 row 3: what a first lien is worth on the same borrower's credit — the loan book's own
 *  `SENIOR_LIEN_DISCOUNT`, stated here for week zero alone because at week zero no holder has
 *  priced it. From week 1 it is an outcome of what a first-lien holder's economics ask for. */
const SENIOR_LIEN_SEED_DISCOUNT = 0.85;

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
    let householdDepositsLocal = 0;
    banks.forEach((b) => {
      const s: BankingSector = b.bankBalanceSheet!;
      // A3.6c-ii: the corporate and institutional lines are the depositors' accounts, open by now
      // (the seed opens them before this close). The seed sizes its lines TO THE DOLLAR (the stated
      // rule the field carried; a sub-dollar change here moved the week-2 print — §7.392), so the
      // funding residual is struck on the rounded lines.
      const lines = depositLinesAt(v2, companies, institutionalEntities, b.ticker);
      const otherDepositsLocal = Math.round(Math.max(0, lines.corporateLocal)) + Math.round(Math.max(0, lines.institutionalLocal))
        + Math.max(0, lines.smeLocal) + Math.max(0, s.clientMarginLocal ?? 0) + Math.max(0, s.centralBankLoanLocal ?? 0);
      const needLocal = bankTotalAssetsLocal(s, openingCashOf(s), facilityBookOf(v2, b.ticker)) - s.bankEquityLocal - (s.repoBorrowedLocal ?? 0) - (s.srfBorrowingLocal ?? 0) - otherDepositsLocal;
      let lineLocal = 0;
      if (needLocal >= 0) {
        lineLocal = Math.round(needLocal);
      } else {
        // Over-funded: the depositors' money is real, so the bank holds it as reserves.
        stashOpeningCash(s, Math.round(openingCashOf(s) - needLocal));
      }
      householdDepositsLocal += lineLocal;
      // A3.4/A3.6c-iii: the household sector's row at this bank opens at the line struck — the
      // only place the line exists (the seed's provisional sizing was a stash, retired here).
      mutableAccounts(v2).balance[sectorRowAt(v2, { kind: 'HOUSEHOLD', region: regionId }, b.ticker, currencyOf(regionId))] = lineLocal;
      // A3.6a: the bank's own account opens at the reserves the close strikes.
      openAccount(v2, { kind: 'BANK', ticker: b.ticker }, currencyOf(regionId), openingCashOf(s));
    });
    const hs = reg.householdState;
    // The seed's provisional sizing of the sector's deposits (macro/initialization.ts) is what
    // net worth was struck on; the residual replaces it and net worth moves by the difference.
    const priorHouseholdDepositsLocal = openingCashOf(hs);
    hs.netWorthLocal = Math.round((hs.netWorthLocal ?? 0) + (Math.round(householdDepositsLocal) - priorHouseholdDepositsLocal));

    // ---- 2. The central bank's book backs reserves and the treasury's account exactly. ----
    const reservesLocal = banks.reduce((a, b) => a + openingCashOf(b.bankBalanceSheet!), 0);
    cb.currencyInCirculationLocal = 0;
    const targetBookLocal = Math.max(0, reservesLocal + treasuryAccountOf(v2, regionId) - centralBankFxReservesLocal(cb));
    const currentBookLocal = sumByTenor(cb.sovereignHoldingsByBond);
    const weights = new Map<string, number>();
    // §3.13-SOV row 3: weighted by BOND, so the fallback book below names bonds like every
    // other holder's does.
    materializeGovLadder(v2, regionId).forEach((t) => { weights.set(t.id, (weights.get(t.id) ?? 0) + t.principalLocal); });
    const weightTotal = [...weights.values()].reduce((a, v) => a + v, 0) || 1;
    const scaled: Record<string, number> = {};
    if (currentBookLocal > 0) {
      Object.entries(cb.sovereignHoldingsByBond ?? {}).forEach(([k, v]) => { scaled[k] = Math.round((Number(v) || 0) * (targetBookLocal / currentBookLocal)); });
    } else {
      weights.forEach((w, k) => { scaled[k] = Math.round(targetBookLocal * (w / weightTotal)); });
    }
    cb.sovereignHoldingsByBond = scaled;

    // ---- 3. The stock outstanding is what the named holders hold, BOND BY BOND. ----
    // §3.13-SOV row 3: every holder's key is the bond's id, so this reconciles per bond instead
    // of per tenor bucket. Bucket-wise it could only scale a rung by its GROUP's held share,
    // which spread one bond's shortfall across every other bond of a similar tenor.
    //
    // §9.13-OUTSIDE: this is the ONE sovereign walk `engine/sovereign-register.ts` does not
    // replace, and the reason is the moment rather than the shape — the seed runs BEFORE the
    // register exists, so the institutions' holdings are still objects on the entity and there
    // are no rows to walk. It is kept in step with that file by hand; the stores it names are the
    // same five.
    const heldByBond = new Map<string, number>();
    const add = (id: string | undefined, usd: number) => { if (id && usd > 0) heldByBond.set(id, (heldByBond.get(id) ?? 0) + usd); };
    Object.entries(cb.sovereignHoldingsByBond).forEach(([id, v]) => add(id, Number(v) || 0));
    banks.forEach((b) => Object.entries(b.bankBalanceSheet!.sovereignBondHoldingsByBond ?? {}).forEach(([id, v]) => add(id, Number(v) || 0)));
    institutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      (e.itemizedHoldings ?? []).forEach((h) => { if (holdingClassOf(h.instrumentType) === 'SOVEREIGN' && h.issuerRegion === regionId) add(h.instrumentId, h.quantityOrNotionalLocal ?? 0); });
    });
    companies.forEach((c) => {
      ((c as unknown as { treasuryHoldings?: { instrumentType: string; issuerRegion: string; instrumentId: string; quantityOrNotionalLocal?: number }[] }).treasuryHoldings ?? [])
        .forEach((h) => { if (holdingClassOf(h.instrumentType) === 'SOVEREIGN' && h.issuerRegion === regionId) add(h.instrumentId, h.quantityOrNotionalLocal ?? 0); });
    });
    (reg.bankingSector.sovBondDealerInventory ?? []).forEach((p) => add(p.bondId, p.inventoryLocal));
    // §3.13-SOV row 2: the seed's ladder is a stash, not a field — `openSeededMirrors` issues
    // its rows next and the stash is gone. The outstanding of a bond IS what its holders hold:
    // no group, no share of a bucket.
    stashSeedGovLadder(reg, seedGovLadderOf(reg).map((t) => ({
      ...t,
      principalLocal: Math.round(heldByBond.get(t.id) ?? 0),
    })));
    // The stash carries what the seed STATED; the tenor is derived, as it is on every read.
    reg.governmentInterestWeeklyLocal = Math.round(weeklyInterestExpenseLocal(seedGovLadderOf(reg).map(govTrancheView)));
    reg.centralBankBalanceSheet = Math.round(centralBankAssetsLocal(cb, waysAndMeansOf(v2, regionId), currencyOf(regionId), v2.fx));
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
/**
 * §3.37-SEED / §3.13 — THE OPENING PRICE OF EVERY SEEDED BOND.
 *
 * A price is what a market printed, and at week zero no market has run. But the seed's ladders are
 * AGED — a rung part-way through a life it was struck for — so par is not the honest opening
 * either: a bond issued years ago at its rating's spread is worth whatever that spread is worth on
 * today's curve over its remaining life, and every rung of one issuer is worth something different
 * because every rung has a different life left. Depositing that is what lets week 1's session open
 * from a real price per piece of paper rather than from one number per borrower.
 *
 * The SPREAD it opens at is the seed's own rating table — the same primitive `generateDebtTranches`
 * struck every coupon and every loan margin from, so the opening world is internally consistent
 * (§7.4: the seed must open in the shape the engine produces). That table is 37-SEED's E1 and it is
 * the last stated number in this chain: from week 1 the auctions price each tranche on its own and
 * the table is never read again, so an issuer's flat opening curve becomes a real term structure in
 * one session.
 *
 * Both credit books: a BOND opens at the rating's spread over the curve, a LOAN at that spread
 * discounted for its first lien — the same structural relationship the loan book's holders price,
 * stated once here because at week zero there are no holders to have priced it yet.
 */
export function seedOpeningCreditPrices(
  regions: Record<RegionId, Region>,
  companies: Company[],
  v2: V2World,
  currentWeek: number,
): void {
  const TS = v2.tranches;
  companies.forEach((c) => {
    const reg = regions[c.region];
    if (!reg?.zeroRates) return;
    const spreadBps = RATING_OAS_SPREADS[c.creditRating]?.baseBps;
    if (spreadBps === undefined) return;
    for (const tr of ladderRowsOf(v2, c.id)) {
      // The traded books' paper only: a facility sits on its lender's own book and trades
      // nowhere, and the seed opens no commercial paper at all — every piece of CP in the model
      // is struck by 07f's own auction, which deposits its price in the session that placed it.
      if (TS.flags[tr] & (TR_FACILITY | TR_CP)) continue;
      const weeksToMaturity = TS.maturityWeek[tr] - currentWeek;
      if (!(weeksToMaturity > 0) || !(TS.principalLocal[tr] > 0)) continue;
      const floating = (TS.flags[tr] & TR_FLOATING) !== 0;
      const marginBps = Number.isNaN(TS.floatingMarginBps[tr]) ? 0 : TS.floatingMarginBps[tr];
      const price = priceFromSpreadBps({
        annualCouponRate: floating
          ? (reg.policyRate ?? 0) + marginBps / 10000
          : (Number.isNaN(TS.couponRate[tr]) ? 0 : TS.couponRate[tr]),
        periodWeeks: trancheScheduleOf(TS, tr).periodWeeks,
        weeksToMaturity,
      }, reg.zeroRates, floating ? spreadBps * SENIOR_LIEN_SEED_DISCOUNT : spreadBps);
      if (price > 0 && isFinite(price)) setClearedPrice(v2, trancheIdOf(v2, tr), price);
    }
  });
}

export function seedOpeningAccruals(
  regions: Record<RegionId, Region>,
  companies: Company[],
  institutionalEntities: InstitutionalEntity[],
  v2: V2World,
  currentWeek: number,
  holderAccruedInterestLocal: Map<string, Map<string, number>>,
  sovereignAccruedInterestLocal: Map<string, number>,
): void {
  const TS = v2.tranches;
  const pendingHolderAccrualLocal = new Map<string, number>();
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
      // §3.13b: `accruedPerFace` is the one owner of "what has accrued on a unit of face" — the
      // same read the weekly accrual and the buyer-pays-seller leg take, so the three cannot
      // disagree about a tranche's position in its own period.
      const { anchorWeek } = trancheScheduleOf(TS, tr);
      const accruedLocal = TS.principalLocal[tr] * accruedPerFace(
        { originationWeek: anchorWeek, paymentsPerYear: Number.isNaN(TS.paymentsPerYear[tr]) ? undefined : TS.paymentsPerYear[tr], rateType: floating ? 'FLOATING' : 'FIXED' },
        floating ? policyRate + annualRate : annualRate, currentWeek);
      if (!(accruedLocal > 0)) continue;
      accrueHoldersInterest({ pendingHolderAccrualLocal },
        trancheIdOf(v2, tr), floating ? 'LEVERAGED_LOAN' : 'CORP_BOND', accruedLocal);
    }
  });
  // The SOVEREIGN side, through the calendar's own holder walk: a seeded bond opens with the
  // weeks it has run since its last coupon date, counted from its issue week like every other.
  (Object.keys(regions) as RegionId[]).forEach((regionId) => {
    const ladder = materializeGovLadder(v2, regionId);
    const couponByBond = sovereignCouponByBond(ladder);
    // §3.13b: the same owner as the credit side above, in the weeks the holder walk takes. This
    // counted `since % 26` itself — one more copy of "where is this bond in its period".
    const elapsedByBond = new Map<string, number>(ladder.map((b) => [b.id, weeksAccrued(b, currentWeek)]));
    accrueSovereignHolders(
      { v2, updatedInstitutionalEntities: institutionalEntities, updatedCompanies: companies,
        sovereignAccruedInterestLocal },
      regionId, couponByBond, (bondId) => elapsedByBond.get(bondId) ?? 0,
    );
  });

  if (pendingHolderAccrualLocal.size === 0) return;
  applyHolderInterestAccruals({
    v2,
    updatedInstitutionalEntities: institutionalEntities,
    updatedCompanies: companies,
    pendingHolderAccrualLocal,
    // Nothing is DUE at the seed: this opens the balance, it does not pay it.
    pendingHolderAccrualPayout: new Set<string>(),
    holderAccruedInterestLocal,
  } as Parameters<typeof applyHolderInterestAccruals>[0]);
}
