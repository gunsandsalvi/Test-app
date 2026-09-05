/**
 * Equity clearing — slice 4 of the real clearing engine (plan §5-WS4).
 *
 * What this replaces. A company's share price moved by `price x (1 + flowPct + sentimentPct)`:
 * a holder-class rebalancing flow plus `comp.sentiment`, a free parameter that existed precisely
 * because nothing real was setting the price. Sentiment was doing the work a market should do.
 *
 * Here the price is what it is everywhere else in this simulation: the level at which the shares
 * people want to hold equals the shares available. Each holder posts a real reservation PRICE —
 * its own fair value for the business, capitalised at its OWN required return — and the auction
 * finds where demand meets the float.
 *
 * Two things make this adapter different from the credit ones, and both are deliberate:
 *
 *   - **It clears in SHARES.** The engine is generic over quantity; this adapter passes share
 *     counts where the credit adapters pass dollars, and the statistic being solved for is the
 *     price per share itself (`PRICE_LIKE`: demand rises as the stat FALLS). Shares are what a
 *     shareholder owns. Denominating the book in dollars would make its size depend on the price
 *     the book is supposed to set — the circularity behind the old non-converging ownership share
 *     (task #28).
 *
 *   - **Holders genuinely disagree about value.** In credit, every holder prices the same
 *     expected loss and differs only in capital cost, so the schedules are near-parallel. In
 *     equity the disagreement IS the market: each entity discounts the same real earnings at its
 *     own required return, so a pension fund and a hedge fund put materially different numbers on
 *     the same company. That dispersion is what gives the demand curve its slope, and it is real
 *     rather than modelled noise.
 */

import { GameState, RegionId, ItemizedHolding, Company } from '../../../types';
import { marketCapAt, issuedSharesOf } from '../../../engine2/instruments';
import { companyParty } from '../../../domain/party';
import { isActiveCompany, isPubliclyListed, banksOf } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { entityRequiredReturn, maxOverweightMultipleOf } from './asset-allocation';
import { openDemandStaging, claimDemandRow, setDemand, clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, positionsByInstrument, setTradableFloat, unclearedAt } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<InstrumentId, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { institutionSpendableLocal } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, participantPartyOf, bankIdOfTickerFor } from './book-settlement';
import { householdBookId, transferHolding } from '../../ledger/holdings-ledger';
import { bookHeadOf, instrumentIdAt } from '../../../engine2/holdings';
import { buildDealerDeskBook, applyDealerDeskFills, deskTickersOf, totalDeskCapacityLocal } from './dealer-desks';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';

import { indexFundDemand, indexFundsForBook, bookIndexIdsOf, indexFundsSeatedIn } from './etf-demand';
import { fairValuePerShare, companyBookEquityLocal, companyNetInvestmentRate } from '../../equity-valuation';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { cashOf, householdDepositsOf } from '../../ledger/accounts';
import { householdBufferFloorLocal } from '../../macro/household-cohorts';
import { householdDirectBudgetLocal, householdDirectPurchaseShares } from '../../../domain/household-equity';
import { equityInstrumentId } from '../../../domain/instrument-keys';
import type { InstrumentId } from '../../../domain/ids';
import { typeRefOf } from '../../../engine2/world';
import { ladderTotalLocal } from '../../../engine2/tranches';
import { householdParticipantId } from '../../../domain/participant-keys';

/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'equity';
/** How far below its fair value a holder must see the price before it takes full size. */
export const FULL_SIZE_PRICE_DISCOUNT = 0.30;

export function runEquityClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  // §3.13-BOOK (c-then-3b): the participant→party crossing, once per stage.
  const bankIdOfTicker = bankIdOfTickerFor(ctx);
  const regionIds = REGION_IDS;

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    // Only listed companies have a traded price; a private firm's equity is not for sale (HC).
    // Instruments carry SHARE counts as their quantity — see the module comment.
    // WS8/HC7: equity primaries — an IPO's new SHARES join this week's book, priced with the
    // outstanding float (the book clears in shares, so the offering size is a share count).
    const offeringsByIssuerId = new Map<string, import('../../../types').PrimaryOffering>();
    ctx.primaryOfferingsWorking.forEach((o) => {
      if (o.region === regionId && o.instrumentType === 'EQUITY') offeringsByIssuerId.set(o.issuerId, o);
    });

    // Banks and institutions are listed companies and clear here like any other. They used to be
    // excluded and priced by a book-value x cycle-P/B formula in stage 08 — the last formula
    // price setter for a whole listed cohort, and a rule-1 violation hiding in plain sight. G2
    // made bank earnings a real P&L and the flow ledger made bank equity real, so the reason for
    // the carve-out is gone: they have the two inputs the valuation needs, and their book equity
    // now reads their own balance sheet rather than an operating company's PP&E arithmetic.
    const listedCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && isPubliclyListed(c)
        && issuedSharesOf(ctx.v2, c.id) > 0 && c.stockPrice > 0
    );
    // HC7: a LISTING issuer is in this book precisely because it is not listed yet — no float and
    // no prior print, so it enters on its own price talk and its whole book is the offering.
    // Without this the deal could never be priced, settled or pulled: it simply sat in the queue,
    // the same debut gap the loan book had for LBO financings.
    const debutIssuers = ctx.prevActivePrivateFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && !isPubliclyListed(c)
        && (offeringsByIssuerId.get(c.id)?.indicativeStat ?? 0) > 0
        && (offeringsByIssuerId.get(c.id)?.postIssueSharesOutstanding ?? 0) > 0
    );
    const regionCompanies = [...listedCompanies, ...debutIssuers];
    if (regionCompanies.length === 0) return;

    // Index funds are handled separately below (their schedule is a size, not a price), so they
    // are excluded from the ordinary allocator population here.
    // XB1: every region's institutions bid for this register, bounded by mandate.
    const mcapByRegion: Record<string, number> = {};
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
      mcapByRegion[r] = ctx.prevActiveFirms
        .filter((c) => c.region === r).reduce((a, c) => a + Math.max(0, marketCapAt(ctx.v2, c)), 0);
    });
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.entityType !== 'ETF'
        && mandateWeightForIssuer(e.entityType, e.region, regionId, mcapByRegion) > 0
    );
    if (regionEntities.length === 0) return;

    // OWN2: the float is the register. Banks hold no equity as an investment anywhere in this
    // model — the measured register says so — and households reach listed equity through the
    // funds that bid here, so there is no passive holder to carve out. `1 - equityOwnership
    // .bankShare` withheld 3% of every register from one.
    const riskFreeRate = reg.zeroRates.tenor10Y;

    /** The book's reference: a listed name's last cleared print, a debut's own price talk. */
    const refPriceOf = (c: Company) =>
      c.stockPrice > 0 ? c.stockPrice : (offeringsByIssuerId.get(c.id)?.indicativeStat ?? 0);
    /**
     * The registry the allocators size to, and that per-share fundamentals divide by: the shares
     * that will EXIST once the deal prices. Sizing off the outstanding count alone left the book
     * mechanically unable to absorb a new issue at any price — every schedule's ceiling was a
     * multiple of the PRE-issue float — which is the same flaw fixed in 07b and 07d. The cash
     * constraint below is untouched, so a deal the market cannot fund is still pulled.
     */
    const liveSharesOf = (c: Company) => {
      const o = offeringsByIssuerId.get(c.id);
      if (o?.postIssueSharesOutstanding) return o.postIssueSharesOutstanding;
      return issuedSharesOf(ctx.v2, c.id) + (o?.sizeLocal ?? 0);
    };
    /** The shares this book must find owners for: the register that will exist once a deal prices. */
    const liveTradableSharesOf = (c: Company) => liveSharesOf(c);

    const priorPriceById = new Map(regionCompanies.map((c) => [c.id, refPriceOf(c)]));

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: equityInstrumentId(c.id),
      outstandingLocal: issuedSharesOf(ctx.v2, c.id),
      tradableFloatLocal: issuedSharesOf(ctx.v2, c.id),
      currentStat: refPriceOf(c),
      statKind: 'PRICE_LIKE',
      durationYears: 0,
      primaryOfferingLocal: offeringsByIssuerId.get(c.id)?.sizeLocal,
      primaryWithdrawStat: offeringsByIssuerId.get(c.id)?.walkAwayStat,
    }));

    // Per-company values memoized once per region-week, never inside the participants loop.
    const companyById = new Map(regionCompanies.map((c) => [equityInstrumentId(c.id), c]));
    const refPriceById = new Map(regionCompanies.map((c) => [equityInstrumentId(c.id), refPriceOf(c)]));
    const floatValueById = new Map(
      regionCompanies.map((c) => [c.id, liveTradableSharesOf(c) * refPriceOf(c)])
    );
    const offeredValueById = new Map(
      regionCompanies.map((c) => [
        c.id,
        (offeringsByIssuerId.get(c.id)?.sizeLocal ?? 0) * refPriceOf(c),
      ])
    );
    const totalFloatValueLocal = regionCompanies.reduce((s, c) => s + (floatValueById.get(c.id) ?? 0), 0) || 1;

    // Per-company real primitives, computed once per region-week — never inside the participants
    // loop, which would recompute them once per entity per name.
    const bookEquityById = new Map(regionCompanies.map((c) => [c.id, companyBookEquityLocal(c, cashOf(ctx.v2, c), ladderTotalLocal(ctx.v2, c.id), ctx.nextWeek)]));
    const netInvestmentRateById = new Map(regionCompanies.map((c) => [c.id, companyNetInvestmentRate(c, ctx.nextWeek)]));

    // §7.327 — THE DEMAND BUILD'S DENSE COLUMNS. The participants loop below runs
    // entities × companies with ~6 Map probes and two `positionKey` string builds per pair
    // (measured ~22 ms/wk self, the family's fattest JS term). The per-company values are
    // resolved ONCE into arrays indexed by the region's company index; the loops keep their
    // exact iteration order, so every float accumulates as before. The maps stay — the index
    // funds, the household channel and the write-back still read them.
    const nC = regionCompanies.length;
    const ciById = new Map<string, number>();
    const refPriceArr = new Float64Array(nC);
    const floatValueArr = new Float64Array(nC);
    const offeredValueArr = new Float64Array(nC);
    const bookEquityArr = new Float64Array(nC);
    const netInvRateArr = new Float64Array(nC);
    const liveSharesArr = new Float64Array(nC);
    const betaArr = new Float64Array(nC);
    const defaultedArr = new Uint8Array(nC);
    const netIncomeArr = new Float64Array(nC);
    regionCompanies.forEach((c, ci) => {
      ciById.set(equityInstrumentId(c.id), ci);
      refPriceArr[ci] = refPriceById.get(equityInstrumentId(c.id)) ?? 0;
      floatValueArr[ci] = floatValueById.get(c.id) ?? 0;
      offeredValueArr[ci] = offeredValueById.get(c.id) ?? 0;
      bookEquityArr[ci] = bookEquityById.get(c.id) ?? 0;
      netInvRateArr[ci] = netInvestmentRateById.get(c.id) ?? 0;
      liveSharesArr[ci] = liveSharesOf(c);
      betaArr[ci] = c.beta;
      defaultedArr[ci] = c.isDefaulted ? 1 : 0;
      netIncomeArr[ci] = c.netIncome;
    });
    // The lent/buy-in books, re-grouped by entity once — the two lookups were per-pair
    // `positionKey` string builds against global maps.
    const lentByEntity = new Map<string, [number, number][]>();
    ctx.lentSharesByLender.forEach((shares, key) => {
      const at = key.indexOf('|');
      const ci = ciById.get(key.slice(at + 1));
      if (ci === undefined) return;
      const eid = key.slice(0, at);
      const list = lentByEntity.get(eid);
      if (list) list.push([ci, shares]); else lentByEntity.set(eid, [[ci, shares]]);
    });
    const buyInByEntity = new Map<string, [number, number][]>();
    ctx.buyInSharesByBorrower.forEach((shares, key) => {
      const at = key.indexOf('|');
      const ci = ciById.get(key.slice(at + 1));
      if (ci === undefined) return;
      const eid = key.slice(0, at);
      const list = buyInByEntity.get(eid);
      if (list) list.push([ci, shares]); else buyInByEntity.set(eid, [[ci, shares]]);
    });
    // Per-entity scratch, allocated once and zeroed by touched-list — never per entity.
    const heldSharesArr = new Float64Array(nC);
    const lentArr = new Float64Array(nC);
    const buyInArr = new Float64Array(nC);
    const cashWeightArr = new Float64Array(nC);
    const heldTouched: number[] = [];
    const lentTouched: number[] = [];
    const buyInTouched: number[] = [];

    // Index funds hold real equity and settle real cash, so they go through exactly the same
    // bookkeeping and apply passes as every other holder; only their SCHEDULE differs.
    // §3.13-READ D6: this book had it right in both places; `sameRegionOnly: false` is its own
    // answer to the one question the three still differ on — a fund domiciled elsewhere may bid here.
    const regionIndexFunds = indexFundsSeatedIn(ctx.updatedInstitutionalEntities, 'EQUITY', regionId, false);
    const bookEntities = [...regionEntities, ...regionIndexFunds];
    // §4.C direct-to-pack — demand written straight into the engine's staging.
    const DS = openDemandStaging(regionCompanies.length);
    const currentSharesByEntity = new Map<string, Map<InstrumentId, number>>();
    // SCALE C1: positions come off the shared store's EQUITY rows; only THIS region's names are
    // claimed, everything else passes through the write-back untouched.
    const store = ctx.holdingsStore!;
    bookEntities.forEach((entity) => {
      const bySharesForCompany = new Map<InstrumentId, number>();
      store.scan(entity.id, 'EQUITY', (h) => {
        const comp = companyById.get(h.instrumentId);
        if (!comp) return false;
        // Pre-WS4 books stored equity as dollars only; convert once, at the current price.
        const shares = h.quantityShares ?? (h.quantityOrNotionalLocal / Math.max(0.01, comp.stockPrice));
        bySharesForCompany.set(h.instrumentId, (bySharesForCompany.get(h.instrumentId) ?? 0) + shares);
        return true;
      });
      currentSharesByEntity.set(entity.id, bySharesForCompany);
    });

    // OWN7, first half: the INSTITUTIONS' half of the float, set BEFORE the desks are built —
    // a desk is sized against the live float, so leaving `tradableFloatLocal` at the whole share
    // count until after the desk build gave every desk capacity against shares that are not for
    // sale (and a float of zero hands back no desk at all).
    const heldByInstitutionsShares = positionsByInstrument(currentSharesByEntity.values());
    setTradableFloat(instruments, heldByInstitutionsShares);

    // G3a/G3e: the banks' equity desks, and the float they and the other participants make up.
    const regionBanks = banksOf(ctx.prevActiveFirms, regionId);
    const deskBook = buildDealerDeskBook({
      ctx, banks: regionBanks, book: BOOK, instruments,
      unitPriceOf: (i) => refPriceOf(regionCompanies[i]),
    });
    const deskParticipants = deskBook.participants;
    // §3.26-e-iii: what the equity desks quoted this week is what assembling a basket through them costs.
    ctx.equityDeskWidthBpsByRegion.set(regionId, deskBook.bookWidthBps);
    const deskTickers = deskTickersOf(deskParticipants);

    // OWN7, second half: the desks' own books join the float now that they exist.
    // `tradableFloatLocal` was `sharesOutstanding` — the whole company — while the only bidders
    // were institutions whose mandates keep them far below it, so the book asked a demand side
    // that can never reach the supply to price it (§6). Founders, households and corporates on the register do not bid, so their shares
    // were never for sale; the same carve-out 07c and 07f already make, computed the same way —
    // off what the real holders actually hold rather than a stated passive share.
    const deskHeldShares = positionsByInstrument(deskParticipants.map((d) => d.currentHoldingsByInstrumentId));
    setTradableFloat(instruments, heldByInstitutionsShares, deskHeldShares);

    // §7.281 — THE HOUSEHOLD DIRECT-EQUITY SELL CHANNEL. Until now the households' listed shares
    // were never for sale at any price — "a holding that cannot be sold is not a holding"
    // (§7.166's row). When last week's liquidity ladder announces a sale (deposits and fund shares
    // both exhausted — `pendingDirectEquitySaleLocal`), the sector enters this session as a
    // SELLER: its shares, prorated across names by value, at reservation zero (a forced seller
    // takes the print). Only the slice for sale
    // joins the float — the rest stays as unsellable as it always was.
    //
    // §9.13-EQUITY: the shares are READ OFF THE HOUSEHOLD SECTOR'S OWN REGISTER BOOK. They used
    // to be recomputed here as `liveShares − institutions − desks`, a residual struck a second
    // time and by a different route than `householdDirectEquityLocal`'s, so the sector could be
    // sold a quantity its own net-worth line never agreed it had.
    const hhSaleNeedLocal = Math.max(0, reg.householdState.pendingDirectEquitySaleLocal ?? 0);
    if (process.env.HH_EQ_TRACE === '1' && hhSaleNeedLocal > 0) {
      console.log(`  [hh-eq] ${regionId} forced direct-equity sale announced: ${(hhSaleNeedLocal / 1e6).toFixed(1)}M`);
    }
    const householdPid = householdParticipantId(regionId);
    let householdParticipant: ClearingParticipant | undefined;
    const householdPriorShares = new Map<InstrumentId, number>();
    if (hhSaleNeedLocal > 1) {
      const hhSharesByCompany = new Map<InstrumentId, number>();
      let hhTotalValueLocal = 0;
      {
        const H = ctx.v2.holdings;
        const equityRef = typeRefOf(ctx.v2, 'EQUITY');
        for (let r = equityRef < 0 ? -1 : bookHeadOf(ctx.v2, householdBookId(regionId)); r >= 0; r = H.next[r]) {
          if (H.typeRef[r] !== equityRef) continue;
          const companyId = instrumentIdAt(ctx.v2, r);
          const hhShares = Number.isNaN(H.shares[r]) ? 0 : H.shares[r];
          if (!(hhShares > 0) || !ciById.has(companyId)) continue;
          hhSharesByCompany.set(companyId, (hhSharesByCompany.get(companyId) ?? 0) + hhShares);
          hhTotalValueLocal += hhShares * (refPriceById.get(companyId) ?? 0);
        }
      }
      if (hhTotalValueLocal > 1) {
        const sellFraction = Math.min(1, hhSaleNeedLocal / hhTotalValueLocal);
        const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
        hhSharesByCompany.forEach((shares, companyId) => {
          const sellShares = shares * sellFraction;
          householdPriorShares.set(companyId, sellShares);
          demandByInstrumentId.set(companyId, {
            reservationStat: 0,
            maxHoldingLocal: 0,
            fullSizeStatRange: 1e-6,
            maxNetPurchaseLocal: 0,
          });
          const inst = instruments.find((i) => i.id === companyId);
          if (inst) inst.tradableFloatLocal += sellShares;
        });
        householdParticipant = {
          id: householdPid,
          currentHoldingsByInstrumentId: householdPriorShares,
          demandByInstrumentId,
        };
      }
    }

    // §3.13 C2.a — THE HOUSEHOLD DIRECT-EQUITY BUY CHANNEL, the seat's other half. Last week's
    // etf-flows announced the slice of the week's equity saving the sector puts into its own book
    // (`pendingDirectEquityPurchaseLocal`; `domain/household-equity.ts` says how it is split and
    // sized). This session bids it as the indexer the coverage rule says a household is: no
    // research desk, so no reservation (`indexFundDemand`), the budget across the region's float
    // by value, full size at the reference price, and never more money than the deposits standing
    // above the buffer floor the saving decision keeps. The sector's book is read whole, and every
    // name it holds carries a schedule that at least holds it — the engine sells a prior holding
    // that posts no schedule, which is the sale channel's device and not this one's.
    const hhBuyAnnouncedLocal = Math.max(0, reg.householdState.pendingDirectEquityPurchaseLocal ?? 0);
    if (householdParticipant === undefined && hhBuyAnnouncedLocal > 1) {
      const budgetLocal = householdDirectBudgetLocal({
        announcedLocal: hhBuyAnnouncedLocal,
        depositsLocal: householdDepositsOf(ctx.v2, regionId),
        bufferFloorLocal: householdBufferFloorLocal(reg.estimatedHouseholdIncomeLocal),
      });
      if (budgetLocal > 1) {
        const H = ctx.v2.holdings;
        const equityRef = typeRefOf(ctx.v2, 'EQUITY');
        for (let r = equityRef < 0 ? -1 : bookHeadOf(ctx.v2, householdBookId(regionId)); r >= 0; r = H.next[r]) {
          if (H.typeRef[r] !== equityRef) continue;
          const companyId = instrumentIdAt(ctx.v2, r);
          const hhShares = Number.isNaN(H.shares[r]) ? 0 : H.shares[r];
          if (!(hhShares > 0) || !ciById.has(companyId)) continue;
          householdPriorShares.set(companyId, (householdPriorShares.get(companyId) ?? 0) + hhShares);
        }
        const buyShares = householdDirectPurchaseShares(budgetLocal, regionCompanies.map((c, ci) => ({
          id: equityInstrumentId(c.id), refPrice: refPriceArr[ci], floatValueLocal: floatValueArr[ci],
        })));
        const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
        householdPriorShares.forEach((held, companyId) => {
          demandByInstrumentId.set(companyId, indexFundDemand(held + (buyShares.get(companyId) ?? 0), buyShares.get(companyId) ?? 0, 'PRICE_LIKE'));
        });
        buyShares.forEach((shares, companyId) => {
          if (!demandByInstrumentId.has(companyId)) demandByInstrumentId.set(companyId, indexFundDemand(shares, shares, 'PRICE_LIKE'));
        });
        householdParticipant = { id: householdPid, currentHoldingsByInstrumentId: householdPriorShares, demandByInstrumentId };
      }
    }

    // ETF: the index funds tracking any equity index this book prices. They are ordinary holders
    // — real positions, real cash — but their schedule has no reservation level: a fund buys its
    // benchmark weight at whatever the market is asking. That is the one demand shape this engine
    // could not previously express, and it is a large real force.
    const equityIndexIds = bookIndexIdsOf('EQUITY', regionId);
    const indexFunds = indexFundsForBook(ctx.v2, regionIndexFunds, ctx.updatedMarketIndexes, equityIndexIds, (e) => store.currentHoldingsLocal(e.id));
    const indexFundParticipants: ClearingParticipant[] = indexFunds.map(({ fund, index, investableLocal }) => {
      const currentShares = currentSharesByEntity.get(fund.id) ?? new Map<InstrumentId, number>();
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      index.constituents.forEach((c) => {
        if (!companyById.has(c.instrumentId)) return;
        const refPrice = refPriceById.get(c.instrumentId) ?? 0;
        if (!(refPrice > 0)) return;
        // Target in SHARES, because this book clears in shares.
        const targetShares = (investableLocal * c.weight) / refPrice;
        // §7.262: the cash bound is posted in SHARES, but the fund PAYS the CLEARED price — a
        // bound struck at the reference price lets it overspend by up to the weekly move cap
        // (18%) in every name at once, which is exactly an index fund's failure mode: it is the
        // one bidder that never walks away from a rising print. Committing at the WORST
        // admissible price this week makes the cash constraint hold at settlement whatever
        // clears — the residual sticky −0.02B overdrafts after the in-kind fix were this.
        // §5-CLOSE (user, 2026-09-02): THERE IS NO CAP. The fund commits at its reference price;
        // if the print clears above it the fund has overspent and the close sweep names that as
        // a margin draw at its broker — a real cost of never walking away, priced, not a bound.
        const worstPriceLocal = Math.max(1e-9, refPrice);
        demandByInstrumentId.set(
          c.instrumentId,
          indexFundDemand(targetShares, institutionSpendableLocal(ctx, fund) * c.weight / worstPriceLocal, 'PRICE_LIKE')
        );
      });
      return { id: fund.id, currentHoldingsByInstrumentId: currentShares, demandByInstrumentId };
    });

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      // Equity is bought with money the entity actually has: its cash, at the weight its mandate
      // puts on equities. Unlike credit, there is no leverage allowance here — nobody in this
      // model runs a levered equity book.
      const budgetLocal = entity.assetAllocationTarget.equityPct * institutionSpendableLocal(ctx, entity);
      const entityPoolLocal = institutionTotalAssetsLocal(ctx, entity) * entity.assetAllocationTarget.equityPct
        * mandateWeightForIssuer(entity.entityType, entity.region, regionId, mcapByRegion);
      // Same discipline as the credit books: this week's money goes where shares are actually
      // changing hands — a live offering, or the gap between the target holding and the current
      // one. A name the holder is already at weight in, with nothing on offer, needs none of it.
      // Splitting the budget across the whole float instead gave a listing a slice the size of
      // its issuer's index weight rather than of the deal (see 07d for the measurement).
      const currentShares = currentSharesByEntity.get(entity.id)!;
      // §7.327 — the pair loops on dense columns, in the same iteration order (the store scan
      // filtered to this region's names, so every held key resolves to a company index).
      currentShares.forEach((shares, companyId) => {
        const ci = ciById.get(companyId);
        if (ci !== undefined) { heldSharesArr[ci] = shares; heldTouched.push(ci); }
      });
      const lentList = lentByEntity.get(entity.id);
      if (lentList) for (const [ci, shares] of lentList) { lentArr[ci] = shares; lentTouched.push(ci); }
      const buyInList = buyInByEntity.get(entity.id);
      if (buyInList) for (const [ci, shares] of buyInList) { buyInArr[ci] = shares; buyInTouched.push(ci); }
      const holderRequiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      let totalCashDemandWeightLocal = 0;
      for (let ci = 0; ci < nC; ci++) {
        const structuralLocal = entityPoolLocal * (floatValueArr[ci] / totalFloatValueLocal);
        const heldLocal = heldSharesArr[ci] * refPriceArr[ci];
        const weightLocal = offeredValueArr[ci] + Math.max(0, structuralLocal - heldLocal);
        cashWeightArr[ci] = weightLocal;
        totalCashDemandWeightLocal += weightLocal;
      }
      const demandRow = claimDemandRow(DS);
      for (let ci = 0; ci < nC; ci++) {
        const fair = defaultedArr[ci] === 1 ? 0 : fairValuePerShare({
          annualEarningsLocal: netIncomeArr[ci],
          sharesOutstanding: liveSharesArr[ci],
          bookEquityLocal: bookEquityArr[ci],
          netInvestmentRate: netInvRateArr[ci],
          riskFreeRate,
          beta: betaArr[ci],
          holderRequiredReturn,
        });
        // Structural size: this entity's share of the region's equity pool, allocated to this
        // name by its share of the float's value — the same real-pool discipline the credit
        // adapters use, expressed in shares.
        const refPrice = refPriceArr[ci];
        const structuralShares = (entityPoolLocal * (floatValueArr[ci] / totalFloatValueLocal)) / Math.max(0.01, refPrice);
        const cashShare = totalCashDemandWeightLocal > 0
          ? cashWeightArr[ci] / totalCashDemandWeightLocal
          : 0;
        // HF: exposure this holder already has through a stock loan it wrote. The shares are out
        // of its hands but the position is not, so its ceiling here comes down by them — without
        // this a lender walks straight back into the auction to re-buy what it has just lent.
        const lentShares = lentArr[ci];
        // HF: and what a recalled short has to DELIVER. A buy-in is an obligation to produce
        // shares, not a view on their price, so it enters as a mandated core with no reservation
        // — which is exactly what makes a squeeze move the print.
        const buyInShares = buyInArr[ci];
        const structuralCeiling = Math.max(0, structuralShares * maxOverweightMultipleOf(entity) - lentShares);
        // Budget in SHARES at the current price — a holder cannot buy what it cannot fund.
        setDemand(DS, demandRow, ci,
          fair,
          Math.max(0.01, fair * FULL_SIZE_PRICE_DISCOUNT),
          Math.max(structuralCeiling, buyInShares),
          (budgetLocal * cashShare) / Math.max(0.01, refPrice),
          buyInShares > 0 ? buyInShares : 0);
      }
      while (heldTouched.length) heldSharesArr[heldTouched.pop()!] = 0;
      while (lentTouched.length) lentArr[lentTouched.pop()!] = 0;
      while (buyInTouched.length) buyInArr[buyInTouched.pop()!] = 0;
      return {
        id: entity.id,
        currentHoldingsByInstrumentId: currentSharesByEntity.get(entity.id)!,
        demandByInstrumentId: EMPTY_DEMAND_MAP,
        demandRow,
      };
    });

    const allParticipants = [...participants, ...indexFundParticipants, ...deskParticipants, ...(householdParticipant ? [householdParticipant] : [])];
    const result = clearFinancialAsset(instruments, allParticipants, {
      // OWN7: the float here is a stock these participants already hold, so an unsold
      // position stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} equity`);
    // EQ_CONS_TRACE=1 — per-instrument share conservation across every cash-accounted
    // participant: Σ(new − prev) must be zero for a stock book with no primary; a nonzero sum
    // is a participant whose shares moved with no cash leg, valued at the cleared price.
    if (process.env.EQ_CONS_TRACE === '1') {
      const allParts = allParticipants;
      const deltaByInstrument = new Map<InstrumentId, number>();
      allParts.forEach((p) => {
        const news = result.newParticipantHoldings.get(p.id) ?? new Map<InstrumentId, number>();
        news.forEach((shares, instId) => {
          deltaByInstrument.set(instId, (deltaByInstrument.get(instId) ?? 0) + shares - (p.currentHoldingsByInstrumentId.get(instId) ?? 0));
        });
        p.currentHoldingsByInstrumentId.forEach((prev, instId) => {
          if (!news.has(instId)) deltaByInstrument.set(instId, (deltaByInstrument.get(instId) ?? 0) - prev);
        });
      });
      deltaByInstrument.forEach((dShares, instId) => {
        const px = result.printById.get(instId)?.stat ?? refPriceById.get(instId) ?? 0;
        const usd = dShares * px;
        if (Math.abs(usd) > 1e5) {
          console.log(`  [eq-cons] ${regionId} ${instId}: net share delta ${dShares.toFixed(2)} = ${(usd / 1e6).toFixed(3)}M at ${px.toFixed(2)} (offering: ${offeringsByIssuerId.has(instId)})`);
        }
      });
    }
    // Equity proceeds are shares x the CLEARED price — the one place the conversion differs
    // from credit (where the stat is a spread and the paper prices at par).
    // G3c: quoted per deal. Equity moves in price already, so the risk on the residual is the
    // book's own one-week move — which is why an equity mandate is the dearest of the three.
    const bookCapacityLocal = totalDeskCapacityLocal(ctx, regionBanks, BOOK);
    // §7.259: the settlement call moved BELOW applyDealerDeskFills — called here it landed the
    // lead's residual on its desk between the clearing and the rebuild-from-fills, which
    // deleted it with no cash leg and charged it to equity as a phantom fee (see 07d).

    // Apply the cleared price. Stage 08 runs after this and reads it as already-real, exactly as
    // it reads the cleared OAS — it no longer computes a price of its own.
    // §4.C int flip — instruments[i] IS regionCompanies[i]; map insertion order was index order.
    const piById = new Map(allParticipants.map((pp, pi) => [pp.id, pi]));
    const nI = result.nInstruments;
    const holdAt = (pi: number | undefined, ii: number): number =>
      pi === undefined ? 0 : result.holdingsMatrix[pi * nI + ii];
    for (let ii = 0; ii < nI; ii++) {
      unclearedAt(ctx, result, ii, `${regionId} equity`);
      const newPrice = result.statByIndex[ii];
      if (!(newPrice > 0)) continue;
      const comp = regionCompanies[ii];
      comp.stockPrice = Number(newPrice.toFixed(2));
    }

    // Apply each entity's real new share register, with its cash leg.
    // SCALE C1: fills append to the store for the single write-back after this, the last book.
    // SETL6: the cash legs are collected here and settled below through the clearing house.
    const netCashByEntityId = new Map<string, number>();
    bookEntities.forEach((entity) => {
      const epi = piById.get(entity.id);
      const equityHoldings: ItemizedHolding[] = [];
      if (epi === undefined) {
        // A holder this session did not admit (an index fund with nothing investable) neither
        // sold nor paid: its register passes through at the cleared marks. Charging it as a
        // seller of everything and dropping its rows was −2.1B "with no owner" at the first D
        // run (§7.372) — money paid for shares that had simply vanished.
        currentSharesByEntity.get(entity.id)!.forEach((shares, companyId) => {
          const comp = companyById.get(companyId);
          if (!comp || shares <= 0.0001) return;
          equityHoldings.push({
            instrumentId: equityInstrumentId(comp.id), instrumentType: 'EQUITY', issuerRegion: regionId,
            quantityShares: shares, quantityOrNotionalLocal: shares * comp.stockPrice, units: shares,
          });
        });
        store.append(entity.id, equityHoldings);
        return;
      }
      for (let ii = 0; ii < nI; ii++) {
        const shares = holdAt(epi, ii);
        if (shares === 0) continue;
        const comp = regionCompanies[ii];
        if (shares <= 0.0001) continue;
        equityHoldings.push({
          instrumentId: equityInstrumentId(comp.id),
          instrumentType: 'EQUITY',
          issuerRegion: regionId,
          quantityShares: shares,
          quantityOrNotionalLocal: shares * comp.stockPrice, units: shares,
        });
      }
      // The engine's cash delta is in the same unit as the quantity — shares — so convert the
      // traded share flow into money at each name's cleared price. §3.26-e-i: at that price and
      // nothing beside it — the bps on the flow this adapter charged is gone with every book's.
      let cashDeltaLocal = 0;
      const chargeLocal = (tradedShares: number, comp: Company) => {
        cashDeltaLocal -= tradedShares * comp.stockPrice;
      };
      for (let ii = 0; ii < nI; ii++) {
        const shares = holdAt(epi, ii);
        if (shares === 0) continue;
        const prev = currentSharesByEntity.get(entity.id)?.get(equityInstrumentId(regionCompanies[ii].id)) ?? 0;
        chargeLocal(shares - prev, regionCompanies[ii]);
      }
      currentSharesByEntity.get(entity.id)!.forEach((prevShares, companyId) => {
        const ti = ciById.get(companyId);
        if (ti !== undefined && holdAt(epi, ti) !== 0) return;
        const comp = companyById.get(companyId);
        if (comp) chargeLocal(-prevShares, comp);
      });
      netCashByEntityId.set(entity.id, cashDeltaLocal);
      store.append(entity.id, equityHoldings);
    });

    // G3e: the desks' own money leg, computed the same way — this book clears in shares, so the
    // engine's cash legs are share-denominated and every money number here is made in this
    // adapter. A desk's money leg is its own flow at the print, exactly as a client's is.
    const deskCashLocal = new Map<string, number>();
    deskParticipants.forEach((desk) => {
      const dpi = piById.get(desk.id);
      let cashDeltaLocal = 0;
      const charge = (tradedShares: number, comp: Company) => {
        cashDeltaLocal -= tradedShares * comp.stockPrice;
      };
      for (let ii = 0; ii < nI; ii++) {
        const shares = holdAt(dpi, ii);
        if (shares === 0) continue;
        charge(shares - (desk.currentHoldingsByInstrumentId.get(equityInstrumentId(regionCompanies[ii].id)) ?? 0), regionCompanies[ii]);
      }
      desk.currentHoldingsByInstrumentId.forEach((prevShares, companyId) => {
        const ti = ciById.get(companyId);
        if (ti !== undefined && holdAt(dpi, ti) !== 0) return;
        const comp = companyById.get(companyId);
        if (comp) charge(-prevShares, comp);
      });
      deskCashLocal.set(desk.id, cashDeltaLocal);
      netCashByEntityId.set(desk.id, cashDeltaLocal);
    });
    // §7.281: the households' cash leg, computed the same way — shares SOLD at the cleared
    // print, and (§3.13 C2.a) shares BOUGHT at it. The unsold remainder stays household-held
    // (it simply rejoins the residual the register measures). The proceeds land on the
    // HOUSEHOLD party at settlement below, and a purchase is paid out of its deposits there.
    if (householdParticipant) {
      const hpi = piById.get(householdPid);
      let cashDeltaLocal = 0;
      // Step 13 (W2): the shares the households sold go to the house by wire, at the print, and
      // the shares they bought come from it the same way (the house holds no row: f4b).
      // §9.13-EQUITY: `transferHolding`, not `clearedBookDelta`. The household sector holds real
      // register rows now, and nothing rebuilds its book from a store write-back the way the
      // institutions' is rebuilt — so the shares it sold have to LEAVE and the shares it bought
      // have to ARRIVE, not merely be wired.
      const namesTouched = new Set<InstrumentId>([...householdPriorShares.keys(), ...householdParticipant.demandByInstrumentId.keys()]);
      namesTouched.forEach((companyId) => {
        const comp = companyById.get(companyId);
        if (!comp) return;
        const ti = ciById.get(companyId);
        const prevShares = householdPriorShares.get(companyId) ?? 0;
        const deltaShares = (ti !== undefined ? holdAt(hpi, ti) : prevShares) - prevShares;
        const movedLocal = Math.abs(deltaShares) * comp.stockPrice;
        if (!(movedLocal >= 1)) return; // less than one unit of money either way: an honest no-op
        cashDeltaLocal -= deltaShares * comp.stockPrice;
        const spec = {
          instrumentType: 'EQUITY' as const, instrumentId: companyId, issuerRegion: regionId,
          valueLocal: movedLocal, shares: Math.abs(deltaShares), units: Math.abs(deltaShares),
        };
        if (deltaShares < 0) transferHolding(ctx.v2, { kind: 'HOUSEHOLD', region: regionId }, { kind: 'CLEARING_HOUSE', region: regionId }, spec, 'equity clearing fill');
        else transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: regionId }, { kind: 'HOUSEHOLD', region: regionId }, spec, 'equity clearing fill');
      });
      if (cashDeltaLocal !== 0) netCashByEntityId.set(householdPid, cashDeltaLocal);
      reg.householdState.pendingDirectEquitySaleLocal = 0;
      reg.householdState.pendingDirectEquityPurchaseLocal = 0;
    }

    // And the inventory it was left holding, marked at this week's cleared price, onto the bank
    // that carried it — the equity desk held nothing however one-sided the session was, because
    // the engine's residual came back in shares and this adapter dropped it.
    applyDealerDeskFills({
      ctx, banks: regionBanks, book: BOOK, instruments, result,
      unitPriceOf: (companyId) => companyById.get(companyId)?.stockPrice ?? 0,
      cashDeltaOf: (deskId) => deskCashLocal.get(deskId) ?? 0,
    });
    // §7.259: AFTER the fills application, so the lead's residual survives to next week's
    // clearing as a real prior position.
    settlePricedOfferings(regionId, 'EQUITY', offeringsByIssuerId, result, ctx,
      (o, clearedStat) => o.sizeLocal * clearedStat,
      (o, clearedStat) => underwritingFeeBps({
        bookSpreadBps: deskBook.bookWidthBps, // §3.26-e-ii: the desks' own width this week
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'PRICE_LIKE', currentStat: clearedStat,
          weeklyMovePct: Math.abs(clearedStat - (priorPriceById.get(o.issuerId) ?? clearedStat)) / Math.max(1e-9, Math.abs(clearedStat)),
        }),
        dealSizeLocal: o.sizeLocal * clearedStat,
        deskCapacityLocal: bookCapacityLocal,
      }),
      BOOK);

    // SETL6. This book clears in SHARES, so the engine's own money legs are share-denominated
    // and unusable here; the deltas above are the money ones. The dealer is the counterparty to
    // all of them, so its leg is their negative — exactly, which is what keeps the clearing
    // house flat.
    let dealerNetLocal = 0;
    netCashByEntityId.forEach((v) => { dealerNetLocal -= v; });
    // WS8: the CCP pays each issuer for the shares its deal actually placed — the engine's take
    // is in SHARES here, so it is valued at the level the same auction cleared.
    const equityPrimaryTakes = primaryTakes(
      result,
      (issuerId) => {
        const issuer = companyById.get(issuerId);
        return issuer ? companyParty(issuer) : undefined;
      },
      (takeShares, clearedStat) => takeShares * clearedStat,
      // Step 13 (W2): the paper leg at the PRINT every holder's row carries (the rounded
      // stockPrice), so the house nets in value as it does in shares.
      (issuerId, takeShares) => (takeShares > 0 ? { instrumentType: 'EQUITY', instrumentId: issuerId, issuerRegion: regionId, valueLocal: takeShares * (companyById.get(issuerId)?.stockPrice ?? 0), shares: takeShares } : undefined)
    );
    const entityIds = new Set(bookEntities.map((e) => e.id));
    if (process.env.LEFTOVER_TRACE === '1') {
      const legs = [...netCashByEntityId.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8)
        .map(([id, v]) => `${id.slice(0, 18)} ${(v / 1e6).toFixed(1)}M`).join(' | ');
      const prim = [...result.primaryOutcomeById.entries()].map(([id, o]) => `${id.slice(0, 14)} take ${(o.marketTakeLocal / 1e6).toFixed(2)}Msh@${o.clearedStat.toFixed(2)}${o.withdrawn ? ' WITHDRAWN' : ''}`).join(' | ');
      console.log(`  [equity-legs] ${regionId} dealerNet ${(dealerNetLocal / 1e6).toFixed(1)}M | ${legs} | primary: ${prim || 'none'}`);
    }
    settleClearedBook(
      ctx, regionId, currencyOf(regionId), BOOK,
      netCashByEntityId,
      participantPartyOf({ regionId, entityIds, deskTickers, bankIdOfTicker }),
      { netCashLocal: dealerNetLocal },
      feeDesksForRegion(ctx, regionId),
      equityPrimaryTakes
    );
  });
}
