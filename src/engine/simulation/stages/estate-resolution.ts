/**
 * G5 — the workout. A defaulted issuer's assets are sold and its claims are paid, in the order
 * they are owed, until there is nothing left. The shape of it is documented in domain/estate.ts.
 *
 * This closes the harness's last conservation violation. A defaulted issuer stopped being priced
 * — it leaves `isActiveCompany`, so no book quotes its paper again — while its holders kept the
 * position at its last mark forever. Nothing was ever going to take the paper off, because
 * nothing resolved. Now the estate does: what it recovers is paid to the named holders, and what
 * it does not is written off their books, both legs in the same pass.
 *
 * Nothing here states a liquidation horizon. Each asset leaves at the rate the market that would
 * buy it actually absorbs it — cash at once, receivables on the terms the issuer itself extended,
 * inventory at the company's own measured turnover, plant at the rate its region buys capital
 * goods — and the discount a buyer takes is the return it needs for the time it is tied up.
 */

import { assertNever } from '../../../domain/defect';
import { GameState, RegionId, Company, InstitutionalEntity, ItemizedHolding } from '../../../types';
import {
  Estate, EstateClaim, CLAIM_SENIORITY, estateAssetsUSD, claimsAtSeniority, outstandingUSD,
  realisedDebtRecoveryRate,
} from '../../../domain/estate';
import { getOutputInventoryUSD, isActiveCompany } from '../../../domain/company';
import { bumpRegister } from './register-index';
import { BankingSector } from '../../../domain/banking';
import { BankLoan } from '../../../domain/banking';
import { bookPnL } from '../../ledger/bank-book';
import { WeeklyStepContext } from './context';
import { pay, pendingSettlementUSD, PartyRef } from './settlement';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import { WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';

/** How many resolutions the realised recovery rate averages over before it displaces the prior. */
export const RECOVERY_HISTORY_LENGTH = 24;

const holderRef = (c: EstateClaim): PartyRef =>
  c.holder.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: c.holder.id }
    // §7.250 — BANK_SECURITIES, not BANK: an estate recovery is cash arriving AGAINST the loan
    // written off the same pass (reduceHolding below), an asset swap — not income. Paying it as
    // BANK credited reserves AND equity (§7.240's flagged row), which balanced only while the
    // loan write-off was going to the dead channel; with that write revived, the equity leg
    // broke the per-bank identity by exactly the recovery.
    : c.holder.kind === 'BANK' ? { kind: 'BANK_SECURITIES', ticker: c.holder.ticker }
      : { kind: 'COMPANY', ticker: c.holder.ticker };

/**
 * SCALE — the indices this stage's inner loops used to rebuild from scratch.
 *
 * Every helper below was a full walk of the universe, run PER ESTATE and, in `reduceHolding`,
 * PER CLAIM: an open workout re-derived its region's plant absorption from all ~2,500 companies,
 * its receivable term from every trade invoice in the world, and — the expensive one — every
 * distribution rebuilt the ENTIRE institutional-entity array to change one holder's book. Estates
 * stay open for weeks, so this was not a default-week cost: it was 209 ms of every week, 11% of
 * the whole cycle, for a stage that touches a handful of failed firms.
 *
 * Nothing about the arithmetic changes — same operations in the same order on the same values.
 * What changes is that each answer is computed once instead of once per claim.
 */
interface EstateIndex {
  entityById: Map<string, InstitutionalEntity>;
  bankByTicker: Map<string, Company>;
  companyById: Map<string, Company>;
  /** SCALE (retired §7.286: receivables are the real invoice book now; kept doc for history)
   *  per ticker but each miss scanned the whole book, so the cost was
   *  O(distinct issuers x invoices) — and both grow with the world. Measured: estate-resolution
   *  ran 4.90x for a 2x universe, the worst super-linear stage in the engine. One pass. */
  ppeWeeksByRegion: Map<string, number>;
  /** `entityId -> instrumentId -> the rows of that entity's book holding it`. Built once for the
   *  holders that actually have a claim, which is what turns a per-claim SCAN of a whole book
   *  into a lookup: ~300 institutions were being re-scanned by ~11,000 claims a week. */
  rowsByEntityInstrument: Map<string, Map<string, ItemizedHolding[]>>;
  /** Entities whose book was written, so the sub-$1 compaction runs once each at the end. */
  touchedEntityIds: Set<string>;
}

function buildEstateIndex(ctx: WeeklyStepContext): EstateIndex {
  const entityById = new Map<string, InstitutionalEntity>();
  ctx.updatedInstitutionalEntities.forEach((e) => entityById.set(e.id, e));
  const bankByTicker = new Map<string, Company>();
  const companyById = new Map<string, Company>();
  ctx.updatedCompanies.forEach((c) => {
    companyById.set(c.id, c);
    if (c.bankBalanceSheet) bankByTicker.set(c.ticker, c);
  });
  return {
    entityById, bankByTicker, companyById,
    ppeWeeksByRegion: new Map(),
    rowsByEntityInstrument: new Map(), touchedEntityIds: new Set(),
  };
}

/** The claim holders' books, indexed by instrument — built once, for the holders that need it. */
function indexClaimHolders(index: EstateIndex, estates: Estate[]): void {
  const needed = new Set<string>();
  estates.forEach((e) => {
    if (e.closedWeek !== undefined) return;
    e.claims.forEach((c) => { if (c.holder.kind === 'INSTITUTION') needed.add(c.holder.id); });
  });
  needed.forEach((id) => {
    const e = index.entityById.get(id);
    if (!e) return;
    const byInstrument = new Map<string, ItemizedHolding[]>();
    (e.itemizedHoldings || []).forEach((h) => {
      const rows = byInstrument.get(h.instrumentId);
      if (rows) rows.push(h); else byInstrument.set(h.instrumentId, [h]);
    });
    index.rowsByEntityInstrument.set(id, byInstrument);
  });
}

export function runEstateResolutionStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  const week = ctx.nextWeek;
  const estates: Estate[] = ctx.estates ?? [];
  const byCompanyId = new Map(estates.map((e) => [e.companyId, e]));
  const index = buildEstateIndex(ctx);
  indexClaimHolders(index, estates);

  // ---- Open an estate for every issuer that has just defaulted. ----
  ctx.updatedCompanies.forEach((comp) => {
    if (!comp.isDefaulted || byCompanyId.has(comp.id) || comp.mergerAcquired) return;
    if (comp.isBankEntity || comp.isInstitutionalEntity) return;
    const estate = openEstate(comp, ctx);
    if (!estate) return;
    // §7.286 — THE FILING SEIZES NOTHING ANY MORE. §7.264 paid the debtor's cash into the
    // UNMODELED boundary at filing and drew the distributions back out of it — two legs of one
    // workout meeting at a party that is nobody. The debtor's account IS the estate's account:
    // the dead firm runs no cash walk (stage 08 skips it), so nothing spends the balance; the
    // buyers of its assets pay INTO it, its receivables collect ONTO it (trade-settlement's
    // dead-seller fix), and the waterfall pays claimants OUT of it — every leg between named
    // accounts, the boundary out of the story entirely.
    estates.push(estate);
    byCompanyId.set(comp.id, estate);
  });

  // SCALE — the open estates' receivables in ONE pass over the invoice book. This was a full
  // filter of the ~170k-invoice book PER OPEN ESTATE — O(invoices × estates) every week, and
  // estates stay open for weeks. Per seller the accumulation runs in the book's own order, so
  // each estate's sum is the float-for-float value the per-estate reduce produced.
  const receivablesBySellerUSD = new Map<string, number>();
  estates.forEach((e) => { if (e.closedWeek === undefined) receivablesBySellerUSD.set(e.ticker, 0); });
  if (receivablesBySellerUSD.size > 0) {
    (state.tradeInvoices ?? []).forEach((iv) => {
      const acc = receivablesBySellerUSD.get(iv.sellerTicker);
      if (acc === undefined) return;
      receivablesBySellerUSD.set(iv.sellerTicker, acc + iv.amountCurrency * iv.bookedUsdPerCurrency);
    });
  }

  // ---- Run every open workout one week further. ----
  estates.forEach((estate) => {
    if (estate.closedWeek !== undefined) return;
    const reg = ctx.updatedRegions[estate.regionId];
    if (!reg) return;
    const comp = index.companyById.get(estate.companyId);

    // §7.286 — receivables are the REAL invoice book now, not a schedule beside it. The
    // buyers' payments arrive on the dead firm's account through trade-settlement on the
    // invoices' own due dates; here they are only COUNTED (via the one-pass sums above), so
    // the close condition knows when the last one is in.
    estate.assets.receivablesUSD = receivablesBySellerUSD.get(estate.ticker) ?? 0;

    // Inventory leaves at the company's OWN turnover — the rate its market was taking the goods
    // before it failed — and at the discount a buyer needs for holding it that long.
    const turnoverWeeks = Math.max(1, inventoryTurnoverWeeks(comp, estate.assets.inventoryUSD));
    const invSoldUSD = Math.min(estate.assets.inventoryUSD, estate.assets.inventoryUSD / turnoverWeeks);
    estate.assets.inventoryUSD -= invSoldUSD;

    // Plant goes to peers as cheap capex, at the rate its region actually buys capital goods
    // against the plant already installed there. Slow, and the discount is the largest, because
    // the buyer's money is tied up longest.
    const ppeWeeks = Math.max(1, regionalPpeAbsorptionWeeks(ctx, index, estate.regionId));
    const ppeSoldUSD = Math.min(estate.assets.ppeUSD, estate.assets.ppeUSD / ppeWeeks);
    estate.assets.ppeUSD -= ppeSoldUSD;

    // §7.286 — "peers as cheap capex" MEANS PEERS NOW: the same-sector firms of the region buy
    // the week's slices at the workout's discounts, pay the estate's account by instruction,
    // and take the plant onto their own books (the discount is their bargain — the reason
    // distressed assets clear at all). A week with no peer able to pay scraps that week's
    // slice instead: unsold distressed inventory perishes and an unclaimed plant is
    // abandonment, not a sale to nobody.
    const hurdle = Math.max(0.01, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + EQUITY_RISK_PREMIUM);
    const invPriceUSD = invSoldUSD * (1 - Math.min(0.9, (hurdle * turnoverWeeks) / 52));
    const ppePriceUSD = ppeSoldUSD * (1 - Math.min(0.9, (hurdle * ppeWeeks) / 52));
    sellAssetsToPeers(ctx, index, estate, comp, invSoldUSD, invPriceUSD, ppeSoldUSD, ppePriceUSD);

    // The waterfall pays out of the account everything above pays INTO: cash it died with,
    // invoice collections, this week's asset sales (pending until the close, counted here).
    const estateComp = index.companyById.get(estate.companyId);
    const availableUSD = estateComp
      ? Math.max(0, estateComp.cash + pendingSettlementUSD(ctx, { kind: 'COMPANY', ticker: estate.ticker }))
      : 0;
    const paidUSD = availableUSD > 1 ? distribute(ctx, index, estate, availableUSD) : 0;

    // Closed when there is nothing left to sell or collect AND the account is empty (or every
    // claim is satisfied, in which case the waterfall stopped short of the money): the residual
    // claims are written off.
    const claimsRemainUSD = outstandingUSD(estate.claims);
    if (estateAssetsUSD(estate.assets) <= 1 && (availableUSD - paidUSD <= 1 || claimsRemainUSD <= 1)) {
      estate.closedWeek = week;
      writeOffResidual(ctx, index, estate);
      const realised = realisedDebtRecoveryRate(estate);
      if (realised !== undefined) {
        const history = [...(reg.realisedRecoveryRates ?? []), Number(realised.toFixed(4))];
        reg.realisedRecoveryRates = history.slice(-RECOVERY_HISTORY_LENGTH);
      }
    }
  });

  // The sub-$1 rows a written-down book leaves behind, dropped once per holder instead of once
  // per claim — the same set removed, at the end of the same stage.
  index.touchedEntityIds.forEach((id) => {
    const e = index.entityById.get(id);
    if (!e) return;
    e.itemizedHoldings = (e.itemizedHoldings || []).filter((h) => (h.quantityOrNotionalUSD ?? 0) > 1);
    bumpRegister(ctx);
  });

  ctx.estates = estates.filter((e) => e.closedWeek === undefined || week - e.closedWeek < 4);
}

/**
 * §7.286 — the week's asset slices go to NAMED PEERS: the region's same-sector active firms,
 * pro rata to their own cash, paying the workout's discounted price into the estate's account
 * and taking the assets onto their books (plant at book value — the discount is the bargain;
 * inventory as the dead firm's real sub-unit rows, transferred with their units). A week with
 * no peer able to pay scraps that week's slice — unsold distressed inventory perishes and an
 * unclaimed plant is abandonment, never a sale to nobody.
 */
function sellAssetsToPeers(
  ctx: WeeklyStepContext, index: EstateIndex, estate: Estate, comp: Company | undefined,
  invSoldUSD: number, invPriceUSD: number, ppeSoldUSD: number, ppePriceUSD: number
): void {
  if (invPriceUSD <= 1 && ppePriceUSD <= 1) return;
  const peers = ctx.updatedCompanies.filter((c) =>
    c.region === estate.regionId && c.sector === comp?.sector && isActiveCompany(c)
    && !c.isBankEntity && !c.isInstitutionalEntity && c.id !== estate.companyId && c.cash > 0);
  const totalPeerCashUSD = peers.reduce((a, c) => a + c.cash, 0);
  if (totalPeerCashUSD <= 1) return;
  const weekPriceUSD = invPriceUSD + ppePriceUSD;
  peers.forEach((peer) => {
    const share = peer.cash / totalPeerCashUSD;
    const payUSD = Math.min(weekPriceUSD * share, peer.cash);
    if (payUSD <= 1) return;
    pay(ctx, {
      payer: { kind: 'COMPANY', ticker: peer.ticker },
      payee: { kind: 'COMPANY', ticker: estate.ticker },
      amountUSD: payUSD,
      reason: 'estate asset sale to peers',
    });
    // What the payment buys, at the same share: the plant at its book value (the buyer's
    // bargain is book minus price), and the inventory rows with their real units.
    const ppeShareUSD = ppeSoldUSD * share;
    if (ppeShareUSD > 0) {
      peer.grossPPEUSD = (peer.grossPPEUSD ?? 0) + ppeShareUSD;
    }
    if (comp?.outputInventoryBySubUnit && invSoldUSD > 0) {
      const preInvUSD = Object.values(comp.outputInventoryBySubUnit)
        .reduce((a, r) => a + Math.max(0, r.valueUSD), 0);
      if (preInvUSD > 0) {
        const frac = Math.min(1, (invSoldUSD * share) / preInvUSD);
        Object.entries(comp.outputInventoryBySubUnit).forEach(([subUnitId, row]) => {
          if (!(row.unitsHeld > 0)) return;
          const buyerInv = peer.outputInventoryBySubUnit ?? (peer.outputInventoryBySubUnit = {});
          const dst = buyerInv[subUnitId] ?? (buyerInv[subUnitId] = { unitsHeld: 0, valueUSD: 0 });
          dst.unitsHeld += row.unitsHeld * frac;
          dst.valueUSD += row.valueUSD * frac;
        });
      }
    }
  });
  // The sold units leave the dead firm's rows whatever fraction the peers took; the rest of
  // the week's slice is the scrappage above.
  if (comp?.outputInventoryBySubUnit && invSoldUSD > 0) {
    const preInvUSD = Object.values(comp.outputInventoryBySubUnit)
      .reduce((a, r) => a + Math.max(0, r.valueUSD), 0);
    const keepFrac = preInvUSD > 0 ? Math.max(0, 1 - invSoldUSD / preInvUSD) : 0;
    Object.values(comp.outputInventoryBySubUnit).forEach((row) => {
      row.unitsHeld *= keepFrac;
      row.valueUSD *= keepFrac;
    });
  }
}

/** The waterfall: secured first, then unsecured, then whatever is left for equity. */
function distribute(
  ctx: WeeklyStepContext, index: EstateIndex, estate: Estate, proceedsUSD: number
): number {
  let remainingUSD = proceedsUSD;
  [CLAIM_SENIORITY.SECURED, CLAIM_SENIORITY.UNSECURED, CLAIM_SENIORITY.EQUITY].forEach((seniority) => {
    if (remainingUSD <= 1) return;
    const claims = claimsAtSeniority(estate, seniority);
    const owedUSD = outstandingUSD(claims);
    if (!(owedUSD > 0)) return;
    const payUSD = Math.min(remainingUSD, owedUSD);
    claims.forEach((claim) => {
      const stillOwedUSD = Math.max(0, claim.principalUSD - claim.recoveredUSD);
      if (stillOwedUSD <= 0) return;
      const shareUSD = payUSD * (stillOwedUSD / owedUSD);
      if (shareUSD <= 0) return;
      claim.recoveredUSD += shareUSD;
      estate.distributedUSD += shareUSD;
      // §7.286: the estate pays FROM THE DEBTOR'S OWN ACCOUNT — the issuer's assets reaching
      // the people it owed, as one instruction between two named accounts. The caller caps the
      // week's waterfall at what that account actually holds, so this never overdraws it.
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: estate.ticker },
        payee: holderRef(claim),
        amountUSD: shareUSD,
        reason: 'estate distribution',
      });
      reduceHolding(ctx, index, claim, estate.companyId, shareUSD, false);
    });
    remainingUSD -= payUSD;
  });
  return proceedsUSD - remainingUSD;
}

/** Whatever the workout could not pay comes off the holders' books as a loss. */
function writeOffResidual(ctx: WeeklyStepContext, index: EstateIndex, estate: Estate): void {
  estate.claims.forEach((claim) => {
    const lostUSD = Math.max(0, claim.principalUSD - claim.recoveredUSD);
    if (lostUSD <= 0) return;
    reduceHolding(ctx, index, claim, estate.companyId, lostUSD, true);
  });
}

/**
 * Take the paper off the holder's book. A recovery is cash arriving against the position; a
 * write-off is the position going with nothing arriving, so it is a loss and the holder's own
 * capital says so — which is the contagion channel, made of real losses on real books.
 */
function reduceHolding(
  ctx: WeeklyStepContext, index: EstateIndex, claim: EstateClaim,
  companyId: string, amountUSD: number, isLoss: boolean
): void {
  if (claim.holder.kind === 'INSTITUTION') {
    // SCALE: the holder is looked up, its rows for THIS issuer are looked up, and only those are
    // written — in place. This rebuilt the entire institutional-entity array and rescanned the
    // holder's whole book once per claim; with ~11,000 claims open against ~300 institutions,
    // every book was being walked about thirty-seven times a week to change a handful of rows.
    const id = claim.holder.id;
    const e = index.entityById.get(id);
    if (!e) return;
    let leftUSD = amountUSD;
    const rows = index.rowsByEntityInstrument.get(id)?.get(companyId);
    if (rows) {
      for (let i = 0; i < rows.length && leftUSD > 0; i++) {
        const h = rows[i];
        const takeUSD = Math.min(leftUSD, h.quantityOrNotionalUSD ?? 0);
        leftUSD -= takeUSD;
        h.quantityOrNotionalUSD = (h.quantityOrNotionalUSD ?? 0) - takeUSD;
      }
      index.touchedEntityIds.add(id);
    }
    e.totalAssetsUSD = Math.max(0, e.totalAssetsUSD - (isLoss ? amountUSD : 0));
    e.equityCapitalUSD = Math.max(0, (e.equityCapitalUSD ?? 0) - (isLoss ? amountUSD : 0));
    return;
  }
  if (claim.holder.kind === 'BANK') {
    const ticker = claim.holder.ticker;
    const company = index.bankByTicker.get(ticker);
    if (!company) return;
    // §7.250 — THE LIVE SHEET. This stage runs AFTER stage 08, the only applier of
    // `companyUpdates.bankBalanceSheet`, so the old channel write here went to NOWHERE: a
    // defaulted borrower's loan was never written off the lender's book and the write-down
    // never reached its equity — silently, both legs together (§7.103's trap, write side).
    const sheet: BankingSector = company.bankBalanceSheet!;
    let leftUSD = amountUSD;
    const loans = (sheet.businessLoans || []).map((l) => {
      if (l.borrowerId !== companyId || leftUSD <= 0) return l;
      const takeUSD = Math.min(leftUSD, l.principalUSD);
      leftUSD -= takeUSD;
      return { ...l, principalUSD: l.principalUSD - takeUSD };
    }).filter((l) => l.principalUSD > 1);
    const bookUSD = loans.reduce((a, l) => a + l.principalUSD, 0);
    // §7.250: equity moves by what the BOOK moved. The borrower's rows here can carry less than
    // the estate's allocation (the loan mirror is rebuilt from tranches elsewhere and drifts), so:
    // a LOSS writes equity down by what was actually extinguished — no more; a RECOVERY is an
    // asset swap for the matched slice (cash in, loan out) and INCOME for the unmatched slice —
    // cash arriving against an asset this ledger no longer carries. Both branches then balance
    // by construction, whatever the rows hold.
    const extinguishedUSD = amountUSD - leftUSD;
    company.bankBalanceSheet = {
      ...bookPnL(sheet, isLoss ? -extinguishedUSD : leftUSD,
        isLoss ? 'estate loan write-off' : 'estate recovery income', ticker),
      businessLoans: loans,
      businessLoanBookUSD: Math.round(bookUSD),
    };
  }
}

function openEstate(comp: Company, ctx: WeeklyStepContext): Estate | undefined {
  const claims: EstateClaim[] = [];
  const addClaim = (c: EstateClaim) => { if (c.principalUSD > 1) claims.push(c); };

  // Bondholders and loan holders, from the books that actually hold the paper.
  ctx.updatedInstitutionalEntities.forEach((e) => {
    (e.itemizedHoldings || []).forEach((h) => {
      if (h.instrumentId !== comp.id) return;
      const usd = h.quantityOrNotionalUSD ?? 0;
      // §7.241: exhaustive on purpose. The old else-if chain gave a NEW instrument type NO estate
      // claim — the holder kept the defaulted paper at its last mark forever, the exact absence
      // G5 was built to abolish. Every member now states its estate treatment; a new one fails
      // to COMPILE until it does.
      switch (h.instrumentType) {
        case 'LEVERAGED_LOAN':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'LEVERAGED_LOAN', seniority: CLAIM_SENIORITY.SECURED, principalUSD: usd, recoveredUSD: 0 });
          return;
        case 'CORP_BOND':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'CORP_BOND', seniority: CLAIM_SENIORITY.UNSECURED, principalUSD: usd, recoveredUSD: 0 });
          return;
        case 'COMMERCIAL_PAPER':
          // CP: senior unsecured, ranking with the bonds. Its holders are money funds, which is
          // exactly why a CP default is a systemic event and a bond default usually is not.
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'COMMERCIAL_PAPER', seniority: CLAIM_SENIORITY.UNSECURED, principalUSD: usd, recoveredUSD: 0 });
          return;
        case 'EQUITY':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'EQUITY', seniority: CLAIM_SENIORITY.EQUITY, principalUSD: usd, recoveredUSD: 0 });
          return;
        case 'GOV_BOND':
        case 'PE_FUND_INTEREST':
        case 'ETF_SHARE':
          // Not claims on THIS estate: a sovereign is not the company, and fund interests
          // resolve through their own vehicles. (Their ids cannot equal comp.id today; stated
          // here so the decision is visible rather than a fall-through.)
          return;
        default:
          return assertNever(h.instrumentType, 'estate claim for a defaulted issuer');
      }
    });
  });
  // The banks' own facilities: secured, and they rank with the first-lien loans.
  ctx.updatedCompanies.forEach((bank) => {
    const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
    (sheet?.businessLoans || []).forEach((l: BankLoan) => {
      if (l.borrowerId !== comp.id) return;
      addClaim({ holder: { kind: 'BANK', ticker: bank.ticker }, instrumentType: 'BANK_FACILITY', seniority: CLAIM_SENIORITY.SECURED, principalUSD: l.principalUSD, recoveredUSD: 0 });
    });
  });
  if (claims.length === 0) return undefined;

  const grossPpeUSD = comp.grossPPEUSD ?? 0;
  const netPpeUSD = Math.max(0, grossPpeUSD - (comp.accumulatedDepreciationUSD ?? 0));
  return {
    companyId: comp.id,
    ticker: comp.ticker,
    regionId: comp.region as RegionId,
    openedWeek: ctx.nextWeek,
    assets: {
      cashUSD: Math.max(0, comp.cash),
      receivablesUSD: Math.max(0, comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE * 0.6),
      inventoryUSD: Math.max(0, getOutputInventoryUSD(comp)),
      ppeUSD: netPpeUSD,
    },
    claims,
    distributedUSD: 0,
  };
}

/** Weeks of sales the inventory represents — the rate its own market was taking it. */
function inventoryTurnoverWeeks(comp: Company | undefined, inventoryUSD: number): number {
  if (!comp || !(inventoryUSD > 0)) return 1;
  const weeklySalesUSD = Math.max(1, comp.annualRevenue / 52);
  return Math.max(1, Math.min(156, inventoryUSD / weeklySalesUSD));
}

/** How long it takes a region to absorb a plant: its own installed base against what it buys. */
function regionalPpeAbsorptionWeeks(
  ctx: WeeklyStepContext, index: EstateIndex, regionId: RegionId
): number {
  // SCALE: a property of the REGION, so it is computed once per region per week however many of
  // its firms are in workout. Nothing in this stage moves plant or capex, so the memo holds.
  const memo = index.ppeWeeksByRegion.get(regionId);
  if (memo !== undefined) return memo;
  let installedUSD = 0;
  let weeklyCapexUSD = 0;
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== regionId) return;
    installedUSD += Math.max(0, (c.grossPPEUSD ?? 0) - (c.accumulatedDepreciationUSD ?? 0));
    weeklyCapexUSD += Math.max(0, (c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)) / 52;
  });
  const out = (!(weeklyCapexUSD > 0) || !(installedUSD > 0)) ? 52
    // One plant is a small share of the base; the weeks it takes is that share of the turnover.
    : Math.max(4, Math.min(260, installedUSD / weeklyCapexUSD / 100));
  index.ppeWeeksByRegion.set(regionId, out);
  return out;
}
