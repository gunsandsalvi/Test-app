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

import { capitalMixOf } from '../../../domain/industry-registry';
import { writePlantRows, plantVintagesOf } from '../../ledger/plant-ledger';
import { profileKeyOf } from './profiles';
import { plantNetLocal, slicePlant, mergePlant, retireWornPlant, plantEffectiveNetLocal } from '../../../domain/plant';
import { movePlant, retirePlant, abandonPlant } from '../../ledger/plant-ledger';
import { tradeInvoicesOf } from '../../ledger/contract-ledger';
import { assertNever } from '../../../domain/defect';
import { bankParty, bankSecuritiesParty, ccpParty, companyParty, companyPartyOf } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../../../engine2/holdings';
import { closeEmptyPositions } from '../../ledger/holdings-ledger';
import { scrapOutputUnitsTo, scrapInputUnits, scrapGoods, reclassifyInputLotsAsStock } from '../../ledger/goods-ledger';
import { totalInputValueLocal, materializeInputInventory } from '../../../engine2/lots';
import { closeOutDerivativesOfParty } from './derivative-lifecycle';
import { retireLadderFace, rebuildLadder } from '../../ledger/tranche-ledger';
import { transferHolding } from '../../ledger/holdings-ledger';
import { isTrancheKind } from '../../../domain/assets';
import { GameState, RegionId, Company, ItemizedHolding } from '../../../types';
import {
  Estate, EstateClaim, CLAIM_SENIORITY, estateAssetsLocal, claimsAtSeniority, outstandingLocal,
  realisedDebtRecoveryRate,
  estateWeekOf,
} from '../../../domain/estate';
import { getOutputInventoryLocal, isActiveCompany } from '../../../domain/company';
import { bumpRegister } from './register-index';
import { EntityIndex, buildEntityIndex, companyOfParty } from '../../ledger/entity-index';
import { BankingSector } from '../../../domain/banking';
import { bookPnL } from '../../ledger/bank-book';
import { WeeklyStepContext } from './context';
import { pay, pendingSettlementLocal, PartyRef } from './settlement';
import { costOfCapitalOf, riskFreeRateOf } from '../../../domain/company-week/cost-of-capital';
import { WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { cashOf } from '../../ledger/accounts';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, takePrint } from './financial-clearing-engine';
import { asInstrumentId } from '../../../domain/ids';
import { facilitiesOfBorrower, issuerIdOf } from '../../../engine2/tranches';
import type { InstrumentId } from '../../../domain/ids';
import { regionOf, typeOf } from '../../../engine2/world';
import type { EntityId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';

/** How many resolutions the realised recovery rate averages over before it displaces the prior. */
const RECOVERY_HISTORY_LENGTH = 24;

const holderRef = (c: EstateClaim): PartyRef =>
  c.holder.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: c.holder.id }
    // BANK_SECURITIES, not BANK: an estate recovery is cash arriving AGAINST the loan
    // written off the same pass (reduceHolding below), an asset swap — not income. Paying it as
    // BANK credited reserves AND equity, which balanced only while the
    // loan write-off was going to the dead channel; with that write revived, the equity leg
    // broke the per-bank identity by exactly the recovery.
    : c.holder.kind === 'BANK' ? bankSecuritiesParty(c.holder)
      // §3.17-iv-c-ii: the clearing house is paid as itself — a recovery on its claim is its cash.
      : c.holder.kind === 'CCP' ? c.holder
        : companyParty(c.holder);

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
interface EstateIndex extends EntityIndex {
  v2: import('../../../engine2/world').V2World;
  /** SCALE (retired: receivables are the real invoice book now; kept doc for history)
   *  per ticker but each miss scanned the whole book, so the cost was
   *  O(distinct issuers x invoices) — and both grow with the world. Measured: estate-resolution
   *  ran 4.90x for a 2x universe, the worst super-linear stage in the engine. One pass. */
  ppeWeeksByRegion: Map<string, number>;
  /** `entityId -> instrumentId -> the rows of that entity's book holding it`. Built once for the
   *  holders that actually have a claim, which is what turns a per-claim SCAN of a whole book
   *  into a lookup: ~300 institutions were being re-scanned by ~11,000 claims a week. */
  /** §3.13-BOOK (c2b): holder → ISSUER → the register rows carrying that issuer's paper. The
   *  inner key is an entity id, not an instrument's: a claim in a workout is on the BORROWER. */
  rowsByEntityInstrument: Map<EntityId, Map<EntityId, number[]>>;
  /** Entities whose book was written, so the sub-$1 compaction runs once each at the end. */
  touchedEntityIds: Set<EntityId>;
}

function buildEstateIndex(ctx: WeeklyStepContext): EstateIndex {
  // §3.13-BOOK (c-then-1): the ONE builder. What was here filtered banks by `bankBalanceSheet`
  // ALONE — not `isBankEntity`, not `isActiveCompany` — while three other files filtered the same
  // map three other ways. That predicate is DELIBERATE here and it is why the index does not carry
  // one: an estate resolves a bank that has DIED, so a live-bank filter would leave every bank
  // estate unresolvable. It now sits at its one use site, where it can be read.
  return {
    v2: ctx.v2,
    ...buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities),
    ppeWeeksByRegion: new Map(),
    rowsByEntityInstrument: new Map(), touchedEntityIds: new Set(),
  };
}

/** The claim holders' books, indexed by instrument — built once, for the holders that need it. */
function indexClaimHolders(index: EstateIndex, estates: Estate[]): void {
  const needed = new Set<EntityId>();
  estates.forEach((e) => {
    if (e.closedWeek !== undefined) return;
    e.claims.forEach((c) => { if (c.holder.kind === 'INSTITUTION') needed.add(c.holder.id); });
  });
  // The index holds ROW IDS in the persistent store; a claim's write-down is a
  // column write on exactly those rows.
  needed.forEach((id) => {
    const e = index.institutionById.get(id);
    if (!e) return;
    const H = index.v2.holdings;
    const byInstrument = new Map<EntityId, number[]>();
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
  const estates: Estate[] = ctx.estates;
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
    // The death closes out every derivative the firm stands on, this week, through the
    // clearing house's waterfall (§3.17-iv-c-ii): the house pays the survivors, keeps the dead
    // member's margin and contribution, and what its own resources and the survivors funded
    // beyond that is its UNSECURED claim on this estate — ranked with the bonds (E2).
    [...closeOutDerivativesOfParty(ctx, state, companyParty(comp)), ...(comp.isBankEntity ? closeOutDerivativesOfParty(ctx, state, bankParty(comp)) : [])].forEach((round) => {
      if (round.claimLocal > 1) estate.claims.push({ holder: ccpParty(round.regionId), instrumentType: 'DERIVATIVE_CLOSE_OUT', seniority: CLAIM_SENIORITY.UNSECURED, principalLocal: round.claimLocal, recoveredLocal: 0 });
    });
    // THE FILING SEIZES NOTHING ANY MORE. It used to pay the debtor's cash into the
    // UNMODELED boundary at filing and drew the distributions back out of it — two legs of one
    // workout meeting at a party that is nobody. The debtor's account IS the estate's account:
    // the dead firm runs no cash walk (stage 08 skips it), so nothing spends the balance; the
    // buyers of its assets pay INTO it, its receivables collect ONTO it (trade-settlement's
    // dead-seller fix), and the waterfall pays claimants OUT of it — every leg between named
    // accounts, the boundary out of the story entirely.
    // §3.20-i-b — the receiver runs no plant: every input lot becomes stock for sale, on the
    // firm's own rows, so the goods auction can offer it with the finished goods.
    Object.keys(materializeInputInventory(ctx.v2, comp.id)).forEach((subUnitId) => reclassifyInputLotsAsStock(ctx.v2, comp, subUnitId));
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
    tradeInvoicesOf(ctx.v2).forEach((iv) => {
      const acc = receivablesBySellerLocal.get(iv.sellerId);
      if (acc === undefined) return;
      receivablesBySellerLocal.set(iv.sellerId, acc + iv.amountCurrency * iv.bookedUsdPerCurrency);
    });
  }

  // ---- Run every open workout one week further. ----
  estates.forEach((estate) => {
    if (estate.closedWeek !== undefined) return;
    const reg = ctx.updatedRegions[estate.regionId];
    const comp = index.companyById.get(estate.companyId);

    // Receivables are the REAL invoice book now, not a schedule beside it. The
    // buyers' payments arrive on the dead firm's account through trade-settlement on the
    // invoices' own due dates; here they are only COUNTED (via the one-pass sums above), so
    // the close condition knows when the last one is in.
    estate.assets.receivablesLocal = receivablesBySellerLocal.get(estate.ticker) ?? 0;
    // The inventory is the REAL rows too: the finished stock and the
    // input lots (consignments the receiver took delivery of land here), read each week.
    estate.assets.inventoryLocal = comp ? Math.max(0, getOutputInventoryLocal(comp)) + totalInputValueLocal(ctx.v2, comp.id) : 0;

    // §3.15b-i: the week's record opens here, and everything below writes into it.
    const thisWeek = estateWeekOf(estate, week);

    // A WORKOUT IS A DISPOSAL PROGRAMME, NOT A DECAY. Both schedules below run from the week
    // the estate opened and the last week of each takes whatever is left in one lot. Selling a
    // fixed SHARE of the remainder every week instead halves the tail for ever: the estate's
    // assets never reach the close test, its holders keep dead paper and the dead issuer's
    // ladder is never extinguished. (Measured before this: 41 estates open at week 16, none
    // closed, against 6 defaults in the last week alone.)
    const weeksOpen = week - estate.openedWeek;
    const weeksLeft = (horizonWeeks: number): number => Math.max(1, Math.ceil(horizonWeeks) - weeksOpen);

    // §3.20-i-b — THE STOCK SELLS IN THE GOODS AUCTION. The dead firm is a seller at no
    // reservation in every market its rows name (05 admits an open estate's rows as offers), so
    // what the stock fetches is struck by the buyers of the goods, and the estate's inventory
    // is read off the rows above as they empty. The programme keeps only a DEADLINE: the firm's
    // own turnover says how long its market took to absorb this much stock, and what is still
    // unsold when that runs out has found no buyer at any price — it perishes.
    const turnoverWeeks = Math.max(1, inventoryTurnoverWeeks(comp, estate.assets.inventoryLocal));
    const stockUpdate = ctx.companyUpdates[estate.ticker];
    thisWeek.inventorySoldLocal += (stockUpdate?.salesLocal ?? 0) + (stockUpdate?.tradeReceivableBookedLocal ?? 0);
    if (comp && weeksLeft(turnoverWeeks) <= 1 && estate.assets.inventoryLocal > 0) {
      perishStock(ctx, comp);
      estate.assets.inventoryLocal = 0;
    }

    // Plant is OFFERED at the rate its region actually buys capital goods against the plant
    // already installed there — the schedule says how much comes to market each week, and the
    // BIDDERS say what it fetches (§3.20-i-a). What finds no bid goes back to the estate for next
    // week's offer, until the programme's last week, when the unwanted plant is abandoned: a
    // scrap is not a sale to nobody.
    const ppeWeeks = Math.max(1, regionalPpeAbsorptionWeeks(ctx, index, estate.regionId));
    // §3.26-f-ii — the estate's plant is the dead firm's register, re-read each week like its
    // stock and its invoices; what the programme's last week cannot sell is abandoned off it.
    if (comp) {
      // The dead firm's register still wears while the workout runs (no rebuild retires it):
      // what wore out this week leaves it here, on the ledger, so W6 closes for an estate too.
      const worn = retireWornPlant(plantVintagesOf(ctx.v2, comp.id), ctx.nextWeek);
      writePlantRows(ctx.v2, comp.id, comp.region, worn.plant); // §3.13-BOOK g-ii: the rows are the register
      retirePlant(comp.id, worn.retiredCostLocal);
    }
    estate.assets.ppeLocal = comp ? plantNetLocal(plantVintagesOf(ctx.v2, comp.id), ctx.nextWeek) : 0;
    const ppeOfferedLocal = estate.assets.ppeLocal / weeksLeft(ppeWeeks);
    const plant = sellPlantToBidders(ctx, estate, comp, ppeOfferedLocal);
    if (weeksLeft(ppeWeeks) <= 1 && comp) {
      // §3.26-f-iii — abandoned, on the ledger: a scrap is not a sale to nobody.
      abandonPlant(comp.id, plantVintagesOf(ctx.v2, comp.id).reduce((a, v) => a + v.costLocal, 0));
      writePlantRows(ctx.v2, comp.id, comp.region, []); // §3.13-BOOK g-ii: abandoned, off the rows
    }
    estate.assets.ppeLocal = comp ? plantNetLocal(plantVintagesOf(ctx.v2, comp.id), ctx.nextWeek) : 0;
    thisWeek.ppeSoldLocal += plant.soldLocal;
    thisWeek.plantPriceOfBook = plant.priceOfBook;

    // The waterfall pays out of the account everything above pays INTO: cash it died with,
    // invoice collections, this week's asset sales (pending until the close, counted here).
    const estateComp = index.companyById.get(estate.companyId);
    const availableLocal = estateComp
      ? Math.max(0, cashOf(ctx.v2, estateComp) + pendingSettlementLocal(ctx, companyPartyOf(estate.companyId)))
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
        perishStock(ctx, comp);
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
    const e = index.institutionById.get(id);
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
function scrapConsignmentsOf(state: GameState, ticker: Ticker, companyId: string): void {
  const inFlight = state.goodsInTransit;
  // §3.13-BOOK (c-then-3b): a shipment names its buyer by ENTITY id; its seller key is still the
  // goods book's two-space key, so both names are tried on that side (`05-unit-bidding`'s `byKey`).
  const isDead = (sh: { buyerId: EntityId; sellerKey?: unknown }): boolean =>
    sh.buyerId === companyId || String(sh.sellerKey ?? '').replace(/^.*:/, '') === companyId
    || String(sh.sellerKey ?? '').replace(/^.*:/, '') === ticker;
  if (!inFlight.some(isDead)) return;
  state.goodsInTransit = inFlight.filter((sh) => {
    if (!isDead(sh)) return true;
    if (sh.carrierId && sh.carrierRegion) scrapGoods(sh.carrierRegion, sh.subUnitId, sh.units);
    return false;
  });
}

/** The firms that can use a dead firm's assets: capital is specific (`the-capital-programme.md`
 *  A4), so the bidders are the region's same-sector active firms with money to pay. */
function peersOf(ctx: WeeklyStepContext, estate: Estate, comp: Company | undefined): Company[] {
  return ctx.updatedCompanies.filter((c) =>
    c.region === estate.regionId && c.sector === comp?.sector && isActiveCompany(c)
    && !c.isBankEntity && !c.isInstitutionalEntity && c.id !== estate.companyId && cashOf(ctx.v2, c) > 0);
}

/**
 * §3.20-i-a — THE PLANT CLEARS AGAINST BIDDERS. The estate offers the week's slice, at any
 * price, in a PRICE_LIKE book whose unit is one currency unit of NET BOOK value; the peers bid.
 *
 * A peer's bid is read off its own books, not stated. It earns a return on the capital it
 * already runs — `ebit / net plant` — and a unit of the dead firm's plant bought at price `p`
 * earns it that return on `p`. It is indifferent where that return equals its cost of capital
 * (the hurdle: the ten-year rate plus the equity premium), so its reservation is `min(1, roc /
 * hurdle)`: a firm earning twice the hurdle pays par, since new plant costs par and nothing
 * makes used plant worth more; one earning half the hurdle pays half of book. Below its
 * reservation its size ramps in, reaching its full want where the return on the price paid is
 * twice the hurdle (`p = reservation / 2`). Its want is its own capital programme — the year's
 * growth and maintenance spend, which distressed plant substitutes for — and its cash bounds
 * what it can pay for at its reservation. What clears moves to the buyers at book (the bargain
 * is book minus the price, as before) and the price is paid into the estate's account.
 *
 * Nobody bids → nothing clears → the caller keeps the plant for next week's offer. The print is
 * kept on the estate so the next solve starts from it.
 */
function sellPlantToBidders(
  ctx: WeeklyStepContext, estate: Estate, comp: Company | undefined, offeredLocal: number
): { soldLocal: number; priceOfBook: number | undefined } {
  if (!(offeredLocal > 1) || !comp) return { soldLocal: 0, priceOfBook: undefined };
  const instrumentId = asInstrumentId(`ESTATE-PLANT:${estate.companyId}`);
  const bidders: ClearingParticipant[] = [];
  peersOf(ctx, estate, comp).forEach((peer) => {
    const netPpeLocal = plantNetLocal(plantVintagesOf(ctx.v2, peer.id), ctx.nextWeek);
    if (!(netPpeLocal > 0)) return; // no plant of its own: no return on capital to read a bid from
    const roc = (peer.ebit) / netPpeLocal;
    // §3.26-f-iv-c — WHAT THE PLANT ON OFFER CAN PRODUCE FOR THIS BIDDER: the effective plant it
    // adds to the bidder's register in the bidder's own mix of kinds, per unit of book. A slice
    // in the wrong kinds (buildings for a firm short of machines) adds little and is bid for as
    // little; a slice that completes the bidder's mix is worth its whole book. A5's value.
    const peerMix = capitalMixOf(peer.productLines, profileKeyOf(peer));
    const estatePlant = plantVintagesOf(ctx.v2, comp.id); // §3.13-BOOK g-ii-d: both registers are rows
    const peerPlant = plantVintagesOf(ctx.v2, peer.id);
    const probe = slicePlant(estatePlant, Math.min(1, offeredLocal / Math.max(1e-9, plantNetLocal(estatePlant, ctx.nextWeek))));
    const probeNetLocal = plantNetLocal(probe.taken, ctx.nextWeek);
    const productiveShare = probeNetLocal > 0
      ? Math.max(0, Math.min(1, (plantEffectiveNetLocal(mergePlant(peerPlant, probe.taken), peerMix, ctx.nextWeek)
        - plantEffectiveNetLocal(peerPlant, peerMix, ctx.nextWeek)) / probeNetLocal))
      : 0;
    if (!(productiveShare > 0)) return; // nothing on offer it can use: no bid
    // §3.26-d: against ITS OWN cost of capital (one owner) — the region's long rate at its own
    // beta and its own board's risk aversion, not one hurdle for every bidder.
    const reservation = Math.min(1, productiveShare * roc / costOfCapitalOf(peer, riskFreeRateOf(ctx.updatedRegions[estate.regionId])));
    if (!(reservation > 0.01)) return;
    const wantLocal = Math.max(0, (peer.growthCapex) + (peer.maintenanceCapex));
    if (!(wantLocal > 1)) return;
    bidders.push({
      id: peer.id,
      currentHoldingsByInstrumentId: new Map([[instrumentId, 0]]),
      demandByInstrumentId: new Map<InstrumentId, ParticipantDemand>([[instrumentId, {
        reservationStat: reservation,
        fullSizeStatRange: reservation / 2,
        maxHoldingLocal: wantLocal,
        // Book units it can pay for at its reservation; every cleared price is at or below it.
        maxNetPurchaseLocal: cashOf(ctx.v2, peer) / reservation,
      }]]),
    });
  });
  if (bidders.length === 0) return { soldLocal: 0, priceOfBook: undefined };
  const instrument: ClearingInstrument = {
    id: instrumentId,
    outstandingLocal: offeredLocal,
    tradableFloatLocal: offeredLocal,
    currentStat: estate.plantPriceOfBook ?? 1,
    statKind: 'PRICE_LIKE',
    durationYears: 0,
  };
  // The estate: holds the slice, wants none of it at any price — a liquidation, not a quote.
  const seller: ClearingParticipant = {
    id: estate.companyId,
    currentHoldingsByInstrumentId: new Map([[instrumentId, offeredLocal]]),
    demandByInstrumentId: new Map<InstrumentId, ParticipantDemand>([[instrumentId, { reservationStat: 0, fullSizeStatRange: 1, maxHoldingLocal: 0 }]]),
  };
  const result = clearFinancialAsset([instrument], [seller, ...bidders], {
    unsoldStaysWithHolder: true, // what no bidder takes stays the estate's
  });
  const price = takePrint(ctx, result, instrumentId, `${estate.regionId} estate plant`);
  if (price === undefined || !(price > 0)) return { soldLocal: 0, priceOfBook: undefined };
  let soldLocal = 0;
  bidders.forEach((b) => {
    const takenLocal = result.newParticipantHoldings.get(b.id)?.get(instrumentId) ?? 0;
    if (!(takenLocal > 1)) return;
    const peer = ctx.updatedCompanies.find((c) => c.id === b.id);
    if (!peer) return;
    pay(ctx, {
      payer: companyParty(peer),
      payee: companyPartyOf(estate.companyId),
      amount: takenLocal * price,
      currency: currencyOf(estate.regionId),
      reason: 'estate plant sold at auction',
    });
    // §3.26-f-ii — the plant moves as vintages: the buyer takes its share of every vintage on
    // the dead firm's register (the machines keep their age and life), at the cleared price of
    // book; `takenLocal` is net book, the unit the auction cleared in.
    const remainingNetLocal = plantNetLocal(plantVintagesOf(ctx.v2, comp.id), ctx.nextWeek);
    const split = slicePlant(plantVintagesOf(ctx.v2, comp.id), remainingNetLocal > 0 ? Math.min(1, takenLocal / remainingNetLocal) : 0);
    // §3.26-f-iii — the move is a PLANT wire at the price of book it cleared at.
    movePlant(companyPartyOf(estate.companyId), companyParty(peer), split.taken, takenLocal * price, 'estate plant sold at auction');
    writePlantRows(ctx.v2, peer.id, peer.region, mergePlant(plantVintagesOf(ctx.v2, peer.id), split.taken)); // §3.13-BOOK g-ii: the buyer's and the estate's rows
    writePlantRows(ctx.v2, comp.id, comp.region, split.kept);
    estate.lastWeek?.buyerIds.push(peer.id);
    soldLocal += takenLocal;
  });
  estate.plantPriceOfBook = price;
  return { soldLocal, priceOfBook: price };
}

/** What a workout could not sell perishes: every finished-stock row and any input lot still on
 *  the dead firm is scrapped where it sits — unsold distressed goods, never a sale to nobody. */
function perishStock(ctx: WeeklyStepContext, comp: Company): void {
  Object.keys(comp.outputInventoryBySubUnit).forEach((subUnitId) => scrapOutputUnitsTo(comp, subUnitId, 0, 0));
  Object.entries(materializeInputInventory(ctx.v2, comp.id)).forEach(([subUnitId, lots]) => {
    scrapInputUnits(ctx.v2, comp, subUnitId, lots.reduce((a, l) => a + l.unitsHeld, 0));
  });
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
    // §3.15b-i: the week's record, by class.
    if (estate.lastWeek) estate.lastWeek.paidByClassLocal[seniority - 1] += payLocal;
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
        payer: companyPartyOf(estate.companyId),
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
      const type = typeOf(index.v2, H.typeRef[r]) as ItemizedHolding['instrumentType'];
      const region = regionOf(index.v2, H.regionRef[r]) as RegionId;
      const id = instrumentIdAt(index.v2, r);
      transferHolding(index.v2, { kind: 'INSTITUTION', id: holderId }, { kind: 'CLEARING_HOUSE', region },
        { instrumentType: type, instrumentId: id, issuerRegion: region, valueLocal: leftLocal,
          units: rowUnits(H, r) },
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
  companyId: EntityId, amountLocal: number, isLoss: boolean
): void {
  if (claim.holder.kind === 'INSTITUTION') {
    // The holder is looked up, its rows for THIS issuer are looked up, and only those are
    // written — in place. This rebuilt the entire institutional-entity array and rescanned the
    // holder's whole book once per claim; with ~11,000 claims open against ~300 institutions,
    // every book was being walked about thirty-seven times a week to change a handful of rows.
    const id = claim.holder.id;
    const e = index.institutionById.get(id);
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
        const unitsHere = rowUnits(H, r);
        const takeUnits = H.qtyLocal[r] > 0 ? unitsHere * (takeLocal / H.qtyLocal[r]) : 0;
        if (takeLocal > 0) takes.push({ type: typeOf(index.v2, H.typeRef[r]) as ItemizedHolding['instrumentType'], region: regionOf(index.v2, H.regionRef[r]) as RegionId, usd: takeLocal, units: takeUnits, id: instrumentIdAt(index.v2, r) });
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
    // §3.18-iii: no floor at zero (rule 6) — a loss past its equity leaves the holder insolvent,
    // and hiding that is what the floor did.
    e.equityCapitalLocal = (e.equityCapitalLocal) - (isLoss ? amountLocal : 0);
    return;
  }
  // §3.17-iv-c-ii: the clearing house holds no paper of the dead firm — its claim is the close-out
  // itself, and a recovery is cash arriving on its account with nothing to take off a book.
  if (claim.holder.kind === 'CCP') return;
  if (claim.holder.kind === 'BANK') {
    const bankId = claim.holder.id;
    const company = companyOfParty(index, claim.holder);
    // A bank claim is written down against a SHEET. Dead or alive is not the test — an estate
    // exists to resolve the dead — but having a book to write down is, and the narrowing here is
    // what lets the read below drop its `!`.
    if (!company?.bankBalanceSheet) return;
    // THE LIVE SHEET. This stage runs AFTER stage 08, the only applier of
    // `companyUpdates.bankBalanceSheet`, so the old channel write here went to NOWHERE: a
    // defaulted borrower's loan was never written off the lender's book and the write-down
    // never reached its equity — silently, both legs together.
    const sheet: BankingSector = company.bankBalanceSheet;
    // The bank's claim IS the facility rows on the dead firm's ladder
    // (there is no loan row to write down); what the ladder still carries for this lender bounds
    // what this write can extinguish.
    const onLadderLocal = facilitiesOfBorrower(index.v2, companyId)
      .filter((f) => f.bankId === bankId).reduce((a, f) => a + f.principalLocal, 0);
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
      isLoss ? 'estate loan write-off' : 'estate recovery income', company.ticker);
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
      const instrumentType = typeOf(ctx.v2, H.typeRef[r]) as ItemizedHolding['instrumentType'];
      // A CREDIT claim is on FACE and an EQUITY claim is the residual on what the shares are
      // worth, so the two take different lanes of the same row on purpose.
      const usd = instrumentType === 'EQUITY'
        ? H.qtyLocal[r]
        : (rowUnits(H, r));
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
        case 'MMF_SHARE':
        case 'DWELLING':
        case 'PLANT':
          // Not claims on THIS estate: a sovereign is not the company, fund interests resolve
          // through their own vehicles, and a dwelling (§3.13-BOOK g-i) or a firm's own plant
          // (g-ii) is a thing somebody owns, not paper the company issued. (Their ids cannot equal comp.id today; stated
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
  facilitiesOfBorrower(ctx.v2, comp.id).forEach((f) => facilityByLender.set(f.bankId, (facilityByLender.get(f.bankId) ?? 0) + f.principalLocal));
  ctx.updatedCompanies.forEach((bank) => {
    const usd = facilityByLender.get(bank.ticker);
    if (!bank.isBankEntity || !usd) return;
    addClaim({ holder: bankParty(bank), instrumentType: 'BANK_FACILITY', seniority: CLAIM_SENIORITY.SECURED, principalLocal: usd, recoveredLocal: 0 });
  });
  if (claims.length === 0) return undefined;
  // ONE INVARIANT, ONE REPORTER. This used to `defect()` — killing the run — when an estate's
  // register claims exceeded the ladder's face on any one tranche. The audit's `O7` now measures
  // exactly that, every week, for every issuer, and it fires for dozens of tranches a week: the
  // condition is routine, not impossible, so crashing on it in the one path where a firm happens
  // to DIE while tolerating it everywhere else told us nothing except which firm died first. The
  // estate takes what the register actually claims; O7 owns the size of the gap and step 11f owns
  // closing it.

  const netPpeLocal = plantNetLocal(plantVintagesOf(ctx.v2, comp.id), ctx.nextWeek); // §3.26-f-ii: the register's read
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
    installedLocal += plantNetLocal(plantVintagesOf(ctx.v2, c.id), ctx.nextWeek);
    weeklyCapexLocal += Math.max(0, (c.maintenanceCapex) + (c.growthCapex)) / 52;
  });
  const out = (!(weeklyCapexLocal > 0) || !(installedLocal > 0)) ? 52
    // One plant is a small share of the base; the weeks it takes is that share of the turnover.
    : Math.max(4, Math.min(260, installedLocal / weeklyCapexLocal / 100));
  index.ppeWeeksByRegion.set(regionId, out);
  return out;
}
