/**
 * The workout. A defaulted issuer's assets are sold and its claims are paid, in the order
 * they are owed, until there is nothing left. The shape of it is documented in domain/estate.ts.
 *
 * This closes the harness's last conservation violation. A defaulted issuer stopped being priced
 * it leaves `isActiveCompany`, so no book quotes its paper again — while its holders kept the
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
import { currencyOf } from '../../../domain/geography';
import { bookHeadOf, instrumentIdAt } from '../../../engine2/holdings';
import { closeEmptyPositions } from '../../ledger/holdings-ledger';
import { moveOutputUnits, scrapOutputUnitsTo, moveInputUnits, scrapInputUnits, scrapGoods } from '../../ledger/goods-ledger';
import { totalInputValueLocal, inputUnitsHeld, materializeInputInventory } from '../../../engine2/lots';
import { closeOutDerivativesOfParty } from './derivative-lifecycle';
import { retireLadderFace, rebuildLadder } from '../../ledger/tranche-ledger';
import { transferHolding } from '../../ledger/holdings-ledger';
import { isTrancheKind } from '../../../domain/assets';
import { GameState, RegionId, Company, InstitutionalEntity, ItemizedHolding } from '../../../types';
import {
  Estate, EstateClaim, CLAIM_SENIORITY, estateAssetsLocal, claimsAtSeniority, outstandingLocal,
  realisedDebtRecoveryRate,
} from '../../../domain/estate';
import { getOutputInventoryLocal, isActiveCompany } from '../../../domain/company';
import { bumpRegister } from './register-index';
import { BankingSector } from '../../../domain/banking';
import { bookPnL } from '../../ledger/bank-book';
import { WeeklyStepContext } from './context';
import { pay, pendingSettlementLocal, PartyRef } from './settlement';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import { WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { cashOf } from '../../ledger/accounts';
import { facilitiesOfBorrower, issuerIdOf } from '../../../engine2/tranches';
import type { InstrumentId } from '../../../domain/ids';

/** How many resolutions the realised recovery rate averages over before it displaces the prior. */
export const RECOVERY_HISTORY_LENGTH = 24;

const holderRef = (c: EstateClaim): PartyRef =>
  c.holder.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: c.holder.id }
    // BANK_SECURITIES, not BANK: an estate recovery is cash arriving AGAINST the loan
    // written off the same pass (reduceHolding below), an asset swap — not income. Paying it as
    // BANK credited reserves AND equity, which balanced only while the
    // loan write-off was going to the dead channel; with that write revived, the equity leg
    // broke the per-bank identity by exactly the recovery.
    : c.holder.kind === 'BANK' ? { kind: 'BANK_SECURITIES', ticker: c.holder.ticker }
      : { kind: 'COMPANY', ticker: c.holder.ticker };

/**
 * The indices this stage's inner loops used to rebuild from scratch.
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
  v2: import('../../../engine2/world').V2World;
  entityById: Map<string, InstitutionalEntity>;
  bankByTicker: Map<string, Company>;
  companyById: Map<string, Company>;
  /** SCALE (retired: receivables are the real invoice book now; kept doc for history)
   *  per ticker but each miss scanned the whole book, so the cost was
   *  O(distinct issuers x invoices) — and both grow with the world. Measured: estate-resolution
   *  ran 4.90x for a 2x universe, the worst super-linear stage in the engine. One pass. */
  ppeWeeksByRegion: Map<string, number>;
  /** `entityId -> instrumentId -> the rows of that entity's book holding it`. Built once for the
   *  holders that actually have a claim, which is what turns a per-claim SCAN of a whole book
   *  into a lookup: ~300 institutions were being re-scanned by ~11,000 claims a week. */
  rowsByEntityInstrument: Map<string, Map<string, number[]>>;
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
    v2: ctx.v2, entityById, bankByTicker, companyById,
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
  // The index holds ROW IDS in the persistent store; a claim's write-down is a
  // column write on exactly those rows.
  needed.forEach((id) => {
    const e = index.entityById.get(id);
    if (!e) return;
    const H = index.v2.holdings;
    const byInstrument = new Map<string, number[]>();
    for (let r = bookHeadOf(index.v2, id); r >= 0; r = H.next[r]) {
      // Keyed by the ISSUER — a row names a tranche or its issuer; a claim is on the issuer.
      const issuerId = issuerIdOf(index.v2, instrumentIdAt(index.v2, r));
      const rows = byInstrument.get(issuerId);
      if (rows) rows.push(r); else byInstrument.set(issuerId, [r]);
    }
    index.rowsByEntityInstrument.set(id, byInstrument);
  });
}

export function runEstateResolutionStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const estates: Estate[] = ctx.estates ?? [];
  const byCompanyId = new Map(estates.map((e) => [e.companyId, e]));
  const index = buildEstateIndex(ctx);
  indexClaimHolders(index, estates);

  // ---- Open an estate for every issuer that has just defaulted. ----
  ctx.updatedCompanies.forEach((comp) => {
    if (!comp.isDefaulted || byCompanyId.has(comp.id) || comp.mergerAcquired) return;
    // A RESOLVED bank's shell goes through the one estate machinery like any dead
    // issuer: its books went to the assuming bank, so its register claims (equity, any traded
    // paper) recover from nothing and write off — which is what resolution means for holders.
    // A LIVE bank still never opens an estate here.
    if ((comp.isBankEntity && comp.bankResolvedWeek === undefined) || comp.isInstitutionalEntity) return;
    const estate = openEstate(comp, ctx);
    if (!estate) {
      // A dead firm nobody has a claim on opens no estate — nothing takes delivery for it, so
      // what is still on its way is scrapped by wire now, not on landing (step 8).
      scrapConsignmentsOf(state, comp.ticker, comp.id);
      return;
    }
    // The death closes out every derivative the firm stands on, this
    // week, through the estate's account — the survivor's replacement value is a claim on it
    // or a payment into it, like any other.
    closeOutDerivativesOfParty(ctx, state, { kind: 'COMPANY', ticker: comp.ticker });
    if (comp.isBankEntity) closeOutDerivativesOfParty(ctx, state, { kind: 'BANK', ticker: comp.ticker });
    // THE FILING SEIZES NOTHING ANY MORE. It used to pay the debtor's cash into the
    // UNMODELED boundary at filing and drew the distributions back out of it — two legs of one
    // workout meeting at a party that is nobody. The debtor's account IS the estate's account:
    // the dead firm runs no cash walk (stage 08 skips it), so nothing spends the balance; the
    // buyers of its assets pay INTO it, its receivables collect ONTO it (trade-settlement's
    // dead-seller fix), and the waterfall pays claimants OUT of it — every leg between named
    // accounts, the boundary out of the story entirely.
    estates.push(estate);
    byCompanyId.set(comp.id, estate);
  });

  // The open estates' receivables in ONE pass over the invoice book. This was a full
  // filter of the ~170k-invoice book PER OPEN ESTATE — O(invoices × estates) every week, and
  // estates stay open for weeks. Per seller the accumulation runs in the book's own order, so
  // each estate's sum is the float-for-float value the per-estate reduce produced.
  const receivablesBySellerLocal = new Map<string, number>();
  estates.forEach((e) => { if (e.closedWeek === undefined) receivablesBySellerLocal.set(e.ticker, 0); });
  if (receivablesBySellerLocal.size > 0) {
    (state.tradeInvoices ?? []).forEach((iv) => {
      const acc = receivablesBySellerLocal.get(iv.sellerTicker);
      if (acc === undefined) return;
      receivablesBySellerLocal.set(iv.sellerTicker, acc + iv.amountCurrency * iv.bookedUsdPerCurrency);
    });
  }

  // ---- Run every open workout one week further. ----
  estates.forEach((estate) => {
    if (estate.closedWeek !== undefined) return;
    const reg = ctx.updatedRegions[estate.regionId];
    if (!reg) return;
    const comp = index.companyById.get(estate.companyId);

    // Receivables are the REAL invoice book now, not a schedule beside it. The
    // buyers' payments arrive on the dead firm's account through trade-settlement on the
    // invoices' own due dates; here they are only COUNTED (via the one-pass sums above), so
    // the close condition knows when the last one is in.
    estate.assets.receivablesLocal = receivablesBySellerLocal.get(estate.ticker) ?? 0;
    // The inventory is the REAL rows too: the finished stock and the
    // input lots (consignments the receiver took delivery of land here), read each week.
    estate.assets.inventoryLocal = comp ? Math.max(0, getOutputInventoryLocal(comp)) + totalInputValueLocal(ctx.v2, comp.id) : 0;

    // A WORKOUT IS A DISPOSAL PROGRAMME, NOT A DECAY. Both schedules below run from the week
    // the estate opened and the last week of each takes whatever is left in one lot. Selling a
    // fixed SHARE of the remainder every week instead halves the tail for ever: the estate's
    // assets never reach the close test, its holders keep dead paper and the dead issuer's
    // ladder is never extinguished. (Measured before this: 41 estates open at week 16, none
    // closed, against 6 defaults in the last week alone.)
    const weeksOpen = week - estate.openedWeek;
    const weeksLeft = (horizonWeeks: number): number => Math.max(1, Math.ceil(horizonWeeks) - weeksOpen);

    // Inventory leaves at the company's OWN turnover — the rate its market was taking the goods
    // before it failed — and at the discount a buyer needs for holding it that long.
    const turnoverWeeks = Math.max(1, inventoryTurnoverWeeks(comp, estate.assets.inventoryLocal));
    const invSoldLocal = estate.assets.inventoryLocal / weeksLeft(turnoverWeeks);
    estate.assets.inventoryLocal -= invSoldLocal;

    // Plant goes to peers as cheap capex, at the rate its region actually buys capital goods
    // against the plant already installed there. Slow, and the discount is the largest, because
    // the buyer's money is tied up longest.
    const ppeWeeks = Math.max(1, regionalPpeAbsorptionWeeks(ctx, index, estate.regionId));
    const ppeSoldLocal = estate.assets.ppeLocal / weeksLeft(ppeWeeks);
    estate.assets.ppeLocal -= ppeSoldLocal;

    // "peers as cheap capex" MEANS PEERS NOW: the same-sector firms of the region buy
    // the week's slices at the workout's discounts, pay the estate's account by instruction,
    // and take the plant onto their own books (the discount is their bargain — the reason
    // distressed assets clear at all). A week with no peer able to pay scraps that week's
    // slice instead: unsold distressed inventory perishes and an unclaimed plant is
    // abandonment, not a sale to nobody.
    const hurdle = Math.max(0.01, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + EQUITY_RISK_PREMIUM);
    const invPriceLocal = invSoldLocal * (1 - Math.min(0.9, (hurdle * turnoverWeeks) / 52));
    const ppePriceLocal = ppeSoldLocal * (1 - Math.min(0.9, (hurdle * ppeWeeks) / 52));
    sellAssetsToPeers(ctx, index, estate, comp, invSoldLocal, invPriceLocal, ppeSoldLocal, ppePriceLocal);

    // The waterfall pays out of the account everything above pays INTO: cash it died with,
    // invoice collections, this week's asset sales (pending until the close, counted here).
    const estateComp = index.companyById.get(estate.companyId);
    const availableLocal = estateComp
      ? Math.max(0, cashOf(ctx.v2, estateComp) + pendingSettlementLocal(ctx, { kind: 'COMPANY', ticker: estate.ticker }))
      : 0;
    const paidLocal = availableLocal > 1 ? distribute(ctx, index, estate, availableLocal) : 0;
    // THE ESTATE'S CASH IS ITS ACCOUNT, RE-READ EVERY WEEK like the other three assets — and
    // read after the waterfall, so it is what the week actually left behind. Written once at
    // `openEstate` and never touched again, it kept the close test below permanently false: an
    // estate opened with any cash at all could never close, its holders kept dead paper for
    // ever, and the dead issuer's ladder was never extinguished.
    estate.assets.cashLocal = availableLocal - paidLocal;

    // Closed when there is nothing left to sell or collect AND the account is empty (or every
    // claim is satisfied, in which case the waterfall stopped short of the money): the residual
    // claims are written off.
    const claimsRemainLocal = outstandingLocal(estate.claims);
    if (estateAssetsLocal(estate.assets) <= 1 && (estate.assets.cashLocal <= 1 || claimsRemainLocal <= 1)) {
      estate.closedWeek = week;
      writeOffResidual(ctx, index, estate);
      // A closed estate takes no more delivery — what is still on its
      // way is scrapped by wire (the carrier writes it off), and any last lots go with it.
      if (comp) {
        Object.entries(materializeInputInventory(ctx.v2, comp.id)).forEach(([subUnitId, lots]) => {
          scrapInputUnits(ctx.v2, comp, subUnitId, lots.reduce((a, l) => a + l.unitsHeld, 0));
        });
        scrapConsignmentsOf(state, comp.ticker, comp.id);
      }
      // A closed estate leaves no ladder — whatever face no claim covered is
      // extinguished by wire, so a dead firm's debt cannot stand on a book nobody holds.
      if (comp) rebuildLadder(ctx.v2, { id: comp.id, ticker: comp.ticker, region: comp.region }, [], 'estate closed: ladder extinguished');
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
    closeEmptyPositions(ctx.v2, id);
    bumpRegister(ctx);
  });

  ctx.estates = estates.filter((e) => e.closedWeek === undefined || week - e.closedWeek < 4);
}

/** What is still on its way to a firm nothing can take delivery for is scrapped by wire:
 *  a named carrier held it as stock and writes it off; one the transport pool carried passed
 *  through a sink at dispatch and was never stock (the same rule goods-arrival applies). */
/**
 * A CLOSED ESTATE IS NEITHER END OF A SHIPMENT. What was on its way TO the dead firm has no
 * consignee, and what was on its way FROM it has no shipper who can answer for it — both are
 * scrapped where they sit, by the carrier that holds them. Only the buyer side was swept before,
 * so a dead SELLER's consignments sailed on for ever against a firm that no longer exists.
 */
function scrapConsignmentsOf(state: GameState, ticker: string, companyId: string): void {
  const inFlight = state.goodsInTransit ?? [];
  const isDead = (sh: { buyerTicker: string; sellerKey?: unknown }): boolean =>
    sh.buyerTicker === ticker || String(sh.sellerKey ?? '').replace(/^.*:/, '') === companyId
    || String(sh.sellerKey ?? '').replace(/^.*:/, '') === ticker;
  if (!inFlight.some(isDead)) return;
  state.goodsInTransit = inFlight.filter((sh) => {
    if (!isDead(sh)) return true;
    if (sh.carrierTicker && sh.carrierRegion) scrapGoods(sh.carrierRegion, sh.subUnitId, sh.units);
    return false;
  });
}

/**
 * The week's asset slices go to NAMED PEERS: the region's same-sector active firms,
 * pro rata to their own cash, paying the workout's discounted price into the estate's account
 * and taking the assets onto their books (plant at book value — the discount is the bargain;
 * inventory as the dead firm's real sub-unit rows, transferred with their units). A week with
 * no peer able to pay scraps that week's slice — unsold distressed inventory perishes and an
 * unclaimed plant is abandonment, never a sale to nobody.
 */
function sellAssetsToPeers(
  ctx: WeeklyStepContext, index: EstateIndex, estate: Estate, comp: Company | undefined,
  invSoldLocal: number, invPriceLocal: number, ppeSoldLocal: number, ppePriceLocal: number
): void {
  if (invPriceLocal <= 1 && ppePriceLocal <= 1) return;
  const peers = ctx.updatedCompanies.filter((c) =>
    c.region === estate.regionId && c.sector === comp?.sector && isActiveCompany(c)
    && !c.isBankEntity && !c.isInstitutionalEntity && c.id !== estate.companyId && cashOf(ctx.v2, c) > 0);
  const totalPeerCashLocal = peers.reduce((a, c) => a + cashOf(ctx.v2, c), 0);
  if (totalPeerCashLocal <= 1) return;
  const weekPriceLocal = invPriceLocal + ppePriceLocal;
  // The week's slice is of the whole inventory — finished stock AND input lots (step 8).
  const preInvLocal = Object.values(comp?.outputInventoryBySubUnit ?? {}).reduce((a, r) => a + Math.max(0, r.valueLocal), 0)
    + (comp ? totalInputValueLocal(ctx.v2, comp.id) : 0);
  const origRows: Record<string, { unitsHeld: number; valueLocal: number }> = {};
  Object.entries(comp?.outputInventoryBySubUnit ?? {}).forEach(([k, r]) => { origRows[k] = { unitsHeld: r.unitsHeld, valueLocal: r.valueLocal }; });
  const origInputUnits: Record<string, number> = {};
  if (comp) Object.keys(materializeInputInventory(ctx.v2, comp.id)).forEach((k) => { origInputUnits[k] = inputUnitsHeld(ctx.v2, comp.id, k); });
  peers.forEach((peer) => {
    const peerCashLocal = cashOf(ctx.v2, peer);
    const share = peerCashLocal / totalPeerCashLocal;
    const payLocal = Math.min(weekPriceLocal * share, peerCashLocal);
    if (payLocal <= 1) return;
    pay(ctx, {
      payer: { kind: 'COMPANY', ticker: peer.ticker },
      payee: { kind: 'COMPANY', ticker: estate.ticker },
      amount: payLocal,
      currency: currencyOf(estate.regionId),
      reason: 'estate asset sale to peers',
    });
    // What the payment buys, at the same share: the plant at its book value (the buyer's
    // bargain is book minus price), and the inventory rows with their real units.
    const ppeShareLocal = ppeSoldLocal * share;
    if (ppeShareLocal > 0) {
      peer.grossPPELocal = (peer.grossPPELocal ?? 0) + ppeShareLocal;
    }
    if (comp && invSoldLocal > 0 && preInvLocal > 0) {
      // The slice each peer takes moves by wire, off the ORIGINAL rows (the shares
      // are of the week's slice, not of what earlier peers left).
      const frac = Math.min(1, (invSoldLocal * share) / preInvLocal);
      Object.entries(origRows).forEach(([subUnitId, row]) => {
        moveOutputUnits(comp, peer, subUnitId, row.unitsHeld * frac, row.valueLocal * frac, 'estate inventory sold to peers');
      });
      // The input lots the receiver holds go the same way, by wire.
      Object.entries(origInputUnits).forEach(([subUnitId, units]) => {
        moveInputUnits(ctx.v2, comp, peer, subUnitId, units * frac, ctx.nextWeek, 'estate input inventory sold to peers');
      });
    }
  });
  // The rest of the week's slice is scrappage — unsold distressed inventory perishes.
  if (comp && invSoldLocal > 0 && preInvLocal > 0) {
    // The rows land exactly where the old scaling put them (`row *= keepFrac`): what the peers
    // did not take of the week's slice is scrapped, by wire-less transformation.
    const keepFrac = Math.max(0, 1 - invSoldLocal / preInvLocal);
    Object.entries(origRows).forEach(([subUnitId, row]) => {
      scrapOutputUnitsTo(comp, subUnitId, row.unitsHeld * keepFrac, row.valueLocal * keepFrac);
    });
    Object.entries(origInputUnits).forEach(([subUnitId, units]) => {
      const keepUnits = units * keepFrac;
      scrapInputUnits(ctx.v2, comp, subUnitId, Math.max(0, inputUnitsHeld(ctx.v2, comp.id, subUnitId) - keepUnits));
    });
  }
}

/** The waterfall: secured first, then unsecured, then whatever is left for equity. */
function distribute(
  ctx: WeeklyStepContext, index: EstateIndex, estate: Estate, proceedsLocal: number
): number {
  let remainingLocal = proceedsLocal;
  [CLAIM_SENIORITY.SECURED, CLAIM_SENIORITY.UNSECURED, CLAIM_SENIORITY.EQUITY].forEach((seniority) => {
    if (remainingLocal <= 1) return;
    const claims = claimsAtSeniority(estate, seniority);
    const owedLocal = outstandingLocal(claims);
    if (!(owedLocal > 0)) return;
    const payLocal = Math.min(remainingLocal, owedLocal);
    claims.forEach((claim) => {
      const stillOwedLocal = Math.max(0, claim.principalLocal - claim.recoveredLocal);
      if (stillOwedLocal <= 0) return;
      const shareLocal = payLocal * (stillOwedLocal / owedLocal);
      if (shareLocal <= 0) return;
      claim.recoveredLocal += shareLocal;
      estate.distributedLocal += shareLocal;
      // The estate pays FROM THE DEBTOR'S OWN ACCOUNT — the issuer's assets reaching
      // the people it owed, as one instruction between two named accounts. The caller caps the
      // week's waterfall at what that account actually holds, so this never overdraws it.
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: estate.ticker },
        payee: holderRef(claim),
        amount: shareLocal,
        currency: currencyOf(estate.regionId),
        reason: 'estate distribution',
      });
      reduceHolding(ctx, index, claim, estate.companyId, shareLocal, false);
    });
    remainingLocal -= payLocal;
  });
  return proceedsLocal - remainingLocal;
}

/** Whatever the workout could not pay comes off the holders' books as a loss. */
function writeOffResidual(ctx: WeeklyStepContext, index: EstateIndex, estate: Estate): void {
  estate.claims.forEach((claim) => {
    const lostLocal = Math.max(0, claim.principalLocal - claim.recoveredLocal);
    if (lostLocal <= 0) return;
    reduceHolding(ctx, index, claim, estate.companyId, lostLocal, true);
  });
  // EVERY ROW OF THE DEAD ISSUER GOES, claim or no claim. A position too small to have opened a
  // claim at all still names the issuer, and once the ladder is extinguished it names an
  // instrument that no longer exists — a holding of nothing, on a live book.
  const H = index.v2.holdings;
  index.rowsByEntityInstrument.forEach((byInstrument, holderId) => {
    const rows = byInstrument.get(estate.companyId);
    if (!rows) return;
    rows.forEach((r) => {
      const leftLocal = H.qtyLocal[r];
      if (!(leftLocal > 0)) return;
      const type = index.v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'];
      const region = index.v2.internedStrings[H.regionRef[r]] as RegionId;
      const id = instrumentIdAt(index.v2, r);
      transferHolding(index.v2, { kind: 'INSTITUTION', id: holderId }, { kind: 'CLEARING_HOUSE', region },
        { instrumentType: type, instrumentId: id, issuerRegion: region, valueLocal: leftLocal,
          units: Number.isNaN(H.units[r]) ? leftLocal : H.units[r] },
        'estate closed: residue written off');
      const dead = index.companyById.get(estate.companyId);
      if (dead && isTrancheKind(type)) {
        retireLadderFace(index.v2, { id: dead.id, ticker: dead.ticker, region: dead.region },
          type as 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER', leftLocal, 'estate closed: residue written off');
      }
      index.touchedEntityIds.add(holderId);
    });
  });
}

/**
 * Take the paper off the holder's book. A recovery is cash arriving against the position; a
 * write-off is the position going with nothing arriving, so it is a loss and the holder's own
 * capital says so — which is the contagion channel, made of real losses on real books.
 */
function reduceHolding(
  ctx: WeeklyStepContext, index: EstateIndex, claim: EstateClaim,
  companyId: string, amountLocal: number, isLoss: boolean
): void {
  if (claim.holder.kind === 'INSTITUTION') {
    // The holder is looked up, its rows for THIS issuer are looked up, and only those are
    // written — in place. This rebuilt the entire institutional-entity array and rescanned the
    // holder's whole book once per claim; with ~11,000 claims open against ~300 institutions,
    // every book was being walked about thirty-seven times a week to change a handful of rows.
    const id = claim.holder.id;
    const e = index.entityById.get(id);
    if (!e) return;
    let leftLocal = amountLocal;
    const rows = index.rowsByEntityInstrument.get(id)?.get(companyId);
    if (rows) {
      // The paper goes back to the estate by wire — recovered (cash arrived) or
      // written off (nothing did); the ledger debits the rows.
      const H = index.v2.holdings;
      const takes: { type: ItemizedHolding['instrumentType']; region: RegionId; usd: number; units: number; id: InstrumentId }[] = [];
      for (let i = 0; i < rows.length && leftLocal > 0; i++) {
        const r = rows[i];
        const takeLocal = Math.min(leftLocal, H.qtyLocal[r]);
        leftLocal -= takeLocal;
        // §9.13-CREDIT row 5 — WHAT PAPER LEFT, beside what it was worth. `retireLadderFace` below
        // takes a FACE and was being handed this take's VALUE, so the moment a claim marks away
        // from par the estate would retire the wrong amount of the dead issuer's ladder. The take
        // is a fraction of a row, so the paper in it is that same fraction of the row's own units.
        const rowUnits = Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r];
        const takeUnits = H.qtyLocal[r] > 0 ? rowUnits * (takeLocal / H.qtyLocal[r]) : 0;
        if (takeLocal > 0) takes.push({ type: index.v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'], region: index.v2.internedStrings[H.regionRef[r]] as RegionId, usd: takeLocal, units: takeUnits, id: instrumentIdAt(index.v2, r) });
      }
      // The holder's paper goes to the region's clearing house (the register side);
      // the dead issuer's ladder retires the same face against the house (the ladder side), so the
      // two halves of one claim meet there and the issuer's wires count once (as every action does).
      const dead = index.companyById.get(companyId);
      takes.forEach((t) => {
        transferHolding(index.v2, { kind: 'INSTITUTION', id }, { kind: 'CLEARING_HOUSE', region: t.region },
          { instrumentType: t.type, instrumentId: t.id, issuerRegion: t.region, valueLocal: t.usd, units: t.units }, isLoss ? 'estate: claim written off' : 'estate: claim recovered');
        if (dead && isTrancheKind(t.type)) {
          retireLadderFace(index.v2, { id: dead.id, ticker: dead.ticker, region: dead.region }, t.type as 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER', t.units, isLoss ? 'estate: claim written off' : 'estate: claim recovered');
        }
      });
      index.touchedEntityIds.add(id);
    }
    e.equityCapitalLocal = Math.max(0, (e.equityCapitalLocal ?? 0) - (isLoss ? amountLocal : 0));
    return;
  }
  if (claim.holder.kind === 'BANK') {
    const ticker = claim.holder.ticker;
    const company = index.bankByTicker.get(ticker);
    if (!company) return;
    // THE LIVE SHEET. This stage runs AFTER stage 08, the only applier of
    // `companyUpdates.bankBalanceSheet`, so the old channel write here went to NOWHERE: a
    // defaulted borrower's loan was never written off the lender's book and the write-down
    // never reached its equity — silently, both legs together.
    const sheet: BankingSector = company.bankBalanceSheet!;
    // The bank's claim IS the facility rows on the dead firm's ladder
    // (there is no loan row to write down); what the ladder still carries for this lender bounds
    // what this write can extinguish.
    const onLadderLocal = facilitiesOfBorrower(index.v2, companyId)
      .filter((f) => f.bankTicker === ticker).reduce((a, f) => a + f.principalLocal, 0);
    const leftLocal = Math.max(0, amountLocal - onLadderLocal);
    // Equity moves by what the BOOK moved: a LOSS writes equity down by what was actually
    // extinguished — no more; a RECOVERY is an asset swap for the matched slice (cash in, facility
    // off the ladder) and INCOME for the unmatched slice — cash arriving against an asset the
    // ladder no longer carries. Both branches balance by construction, whatever the rows hold.
    const extinguishedLocal = amountLocal - leftLocal;
    // The facility comes off the dead issuer's ladder by the same face, bank → issuer.
    const deadFirm = index.companyById.get(companyId);
    if (deadFirm && extinguishedLocal > 0) {
      retireLadderFace(index.v2, { id: deadFirm.id, ticker: deadFirm.ticker, region: deadFirm.region }, 'BANK_FACILITY', extinguishedLocal, isLoss ? 'estate: facility written off' : 'estate: facility recovered');
    }
    company.bankBalanceSheet = bookPnL(sheet, isLoss ? -extinguishedLocal : leftLocal,
      isLoss ? 'estate loan write-off' : 'estate recovery income', ticker);
  }
}

function openEstate(comp: Company, ctx: WeeklyStepContext): Estate | undefined {
  const claims: EstateClaim[] = [];
  const addClaim = (c: EstateClaim) => { if (c.principalLocal > 1) claims.push(c); };
  // ONE BASIS FOR THE WHOLE WATERFALL, AND IT IS FACE. A bank's facility claim is the face on
  // the dead firm's ladder; a register holder's claim is the QUANTITY its row carries — `units`,
  // which for credit IS the face. §9.13-CREDIT row 5: this read `qtyLocal`, the row's money, and
  // called it face in its own variable name — true only while credit marks at par, and a silent
  // mispricing of the whole waterfall the moment it does not. What the register claims of each
  // tranche is checked below against what the ladder says that tranche is: claims worth more than
  // the debt would be a mint inside the waterfall, and that check only means something when both
  // sides are faces.
  const claimedFaceByInstrument = new Map<string, number>();

  // Bondholders and loan holders, from the books that actually hold the paper.
  // Row walk: a row on another issuer costs one int compare.
  const H = ctx.v2.holdings;
  ctx.updatedInstitutionalEntities.forEach((e) => {
    for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
      // A row names a tranche or its issuer; the claim is on the issuer either way.
      if (issuerIdOf(ctx.v2, instrumentIdAt(ctx.v2, r)) !== comp.id) continue;
      const instrumentType = ctx.v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'];
      // A CREDIT claim is on FACE and an EQUITY claim is the residual on what the shares are
      // worth, so the two take different lanes of the same row on purpose.
      const usd = instrumentType === 'EQUITY'
        ? H.qtyLocal[r]
        : (Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r]);
      if (instrumentType !== 'EQUITY') {
        const id = instrumentIdAt(ctx.v2, r);
        claimedFaceByInstrument.set(id, (claimedFaceByInstrument.get(id) ?? 0) + usd);
      }
      // Exhaustive on purpose. The old else-if chain gave a NEW instrument type NO estate
      // claim — the holder kept the defaulted paper at its last mark forever, the exact absence
      // G5 was built to abolish. Every member now states its estate treatment; a new one fails
      // to COMPILE until it does.
      switch (instrumentType) {
        case 'LEVERAGED_LOAN':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'LEVERAGED_LOAN', seniority: CLAIM_SENIORITY.SECURED, principalLocal: usd, recoveredLocal: 0 });
          break;
        case 'CORP_BOND':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'CORP_BOND', seniority: CLAIM_SENIORITY.UNSECURED, principalLocal: usd, recoveredLocal: 0 });
          break;
        case 'COMMERCIAL_PAPER':
          // CP: senior unsecured, ranking with the bonds. Its holders are money funds, which is
          // exactly why a CP default is a systemic event and a bond default usually is not.
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'COMMERCIAL_PAPER', seniority: CLAIM_SENIORITY.UNSECURED, principalLocal: usd, recoveredLocal: 0 });
          break;
        case 'EQUITY':
          addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'EQUITY', seniority: CLAIM_SENIORITY.EQUITY, principalLocal: usd, recoveredLocal: 0 });
          break;
        case 'GOV_BOND':
        case 'PE_FUND_INTEREST':
        case 'ETF_SHARE':
          // Not claims on THIS estate: a sovereign is not the company, and fund interests
          // resolve through their own vehicles. (Their ids cannot equal comp.id today; stated
          // here so the decision is visible rather than a fall-through.)
          break;
        default:
          assertNever(instrumentType, 'estate claim for a defaulted issuer');
      }
    }
  });
  // The banks' own facilities: secured, and they rank with the first-lien loans. Step 10: the
  // lender's claim is the facility row on this firm's ladder, one claim per lender.
  const facilityByLender = new Map<string, number>();
  facilitiesOfBorrower(ctx.v2, comp.id).forEach((f) => facilityByLender.set(f.bankTicker, (facilityByLender.get(f.bankTicker) ?? 0) + f.principalLocal));
  ctx.updatedCompanies.forEach((bank) => {
    const usd = facilityByLender.get(bank.ticker);
    if (!bank.isBankEntity || !usd) return;
    addClaim({ holder: { kind: 'BANK', ticker: bank.ticker }, instrumentType: 'BANK_FACILITY', seniority: CLAIM_SENIORITY.SECURED, principalLocal: usd, recoveredLocal: 0 });
  });
  if (claims.length === 0) return undefined;
  // ONE INVARIANT, ONE REPORTER. This used to `defect()` — killing the run — when an estate's
  // register claims exceeded the ladder's face on any one tranche. The audit's `O7` now measures
  // exactly that, every week, for every issuer, and it fires for dozens of tranches a week: the
  // condition is routine, not impossible, so crashing on it in the one path where a firm happens
  // to DIE while tolerating it everywhere else told us nothing except which firm died first. The
  // estate takes what the register actually claims; O7 owns the size of the gap and step 11f owns
  // closing it.

  const grossPpeLocal = comp.grossPPELocal ?? 0;
  const netPpeLocal = Math.max(0, grossPpeLocal - (comp.accumulatedDepreciationLocal ?? 0));
  return {
    companyId: comp.id,
    ticker: comp.ticker,
    regionId: comp.region as RegionId,
    openedWeek: ctx.nextWeek,
    assets: {
      cashLocal: Math.max(0, cashOf(ctx.v2, comp)),
      receivablesLocal: Math.max(0, comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE * 0.6),
      // The finished stock and the input lots — the rows the workout sells and re-reads weekly.
      inventoryLocal: Math.max(0, getOutputInventoryLocal(comp)) + totalInputValueLocal(ctx.v2, comp.id),
      ppeLocal: netPpeLocal,
    },
    claims,
    distributedLocal: 0,
  };
}

/** Weeks of sales the inventory represents — the rate its own market was taking it. */
function inventoryTurnoverWeeks(comp: Company | undefined, inventoryLocal: number): number {
  if (!comp || !(inventoryLocal > 0)) return 1;
  const weeklySalesLocal = Math.max(1, comp.annualRevenue / 52);
  return Math.max(1, Math.min(156, inventoryLocal / weeklySalesLocal));
}

/** How long it takes a region to absorb a plant: its own installed base against what it buys. */
function regionalPpeAbsorptionWeeks(
  ctx: WeeklyStepContext, index: EstateIndex, regionId: RegionId
): number {
  // A property of the REGION, so it is computed once per region per week however many of
  // its firms are in workout. Nothing in this stage moves plant or capex, so the memo holds.
  const memo = index.ppeWeeksByRegion.get(regionId);
  if (memo !== undefined) return memo;
  let installedLocal = 0;
  let weeklyCapexLocal = 0;
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== regionId) return;
    installedLocal += Math.max(0, (c.grossPPELocal ?? 0) - (c.accumulatedDepreciationLocal ?? 0));
    weeklyCapexLocal += Math.max(0, (c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)) / 52;
  });
  const out = (!(weeklyCapexLocal > 0) || !(installedLocal > 0)) ? 52
    // One plant is a small share of the base; the weeks it takes is that share of the turnover.
    : Math.max(4, Math.min(260, installedLocal / weeklyCapexLocal / 100));
  index.ppeWeeksByRegion.set(regionId, out);
  return out;
}
