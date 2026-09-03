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
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { entityRequiredReturn, maxOverweightMultipleOf } from './asset-allocation';
import { openDemandStaging, claimDemandRow, setDemand, clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

// One shared empty Map for participants that hand demand over by index (see ClearingParticipant).
const EMPTY_DEMAND_MAP = new Map<string, ParticipantDemand>();
import { settlePricedOfferings } from './primary-settlement';
import { institutionSpendableUSD } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes } from './book-settlement';
import { clearedBookDelta } from '../../ledger/holdings-ledger';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf, totalDeskCapacityUSD } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { underwritingFeeBps, oneWeekPriceRiskBps } from '../../../domain/primary-market';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { fairValuePerShare, companyBookEquityUSD, companyNetInvestmentRate } from '../../equity-valuation';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { REGION_IDS } from '../../../domain/geography';
import { marketCapOf } from '../../../domain/company';
import { institutionTotalAssetsUSD } from './institutional-balance-sheet';
import { cashOf } from '../../ledger/accounts';

/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['equity'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'equity';
/** How far below its fair value a holder must see the price before it takes full size. */
export const FULL_SIZE_PRICE_DISCOUNT = 0.30;

export function runEquityClearingStage(state: GameState, ctx: WeeklyStepContext): void {
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
        && c.sharesOutstanding > 0 && c.stockPrice > 0
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
        .filter((c) => c.region === r).reduce((a, c) => a + Math.max(0, marketCapOf(c) ?? 0), 0);
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
    const riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04;

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
      return c.sharesOutstanding + (o?.sizeUSD ?? 0);
    };
    /** The shares this book must find owners for: the register that will exist once a deal prices. */
    const liveTradableSharesOf = (c: Company) => liveSharesOf(c);

    const priorPriceById = new Map(regionCompanies.map((c) => [c.id, refPriceOf(c)]));

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: c.sharesOutstanding,
      tradableFloatUSD: c.sharesOutstanding,
      currentStat: refPriceOf(c),
      statKind: 'PRICE_LIKE',
      durationYears: 0,
      primaryOfferingUSD: offeringsByIssuerId.get(c.id)?.sizeUSD,
      primaryWithdrawStat: offeringsByIssuerId.get(c.id)?.walkAwayStat,
    }));

    // Per-company values memoized once per region-week, never inside the participants loop.
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    const refPriceById = new Map(regionCompanies.map((c) => [c.id, refPriceOf(c)]));
    const floatValueById = new Map(
      regionCompanies.map((c) => [c.id, liveTradableSharesOf(c) * refPriceOf(c)])
    );
    const offeredValueById = new Map(
      regionCompanies.map((c) => [
        c.id,
        (offeringsByIssuerId.get(c.id)?.sizeUSD ?? 0) * refPriceOf(c),
      ])
    );
    const totalFloatValueUSD = regionCompanies.reduce((s, c) => s + (floatValueById.get(c.id) ?? 0), 0) || 1;

    // Per-company real primitives, computed once per region-week — never inside the participants
    // loop, which would recompute them once per entity per name.
    const bookEquityById = new Map(regionCompanies.map((c) => [c.id, companyBookEquityUSD(c, cashOf(ctx.v2, c))]));
    const netInvestmentRateById = new Map(regionCompanies.map((c) => [c.id, companyNetInvestmentRate(c)]));

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
      ciById.set(c.id, ci);
      refPriceArr[ci] = refPriceById.get(c.id) ?? 0;
      floatValueArr[ci] = floatValueById.get(c.id) ?? 0;
      offeredValueArr[ci] = offeredValueById.get(c.id) ?? 0;
      bookEquityArr[ci] = bookEquityById.get(c.id) ?? 0;
      netInvRateArr[ci] = netInvestmentRateById.get(c.id) ?? 0;
      liveSharesArr[ci] = liveSharesOf(c);
      betaArr[ci] = c.beta ?? 1;
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
    const regionIndexFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.entityType === 'ETF' && e.etf
        && INDEX_DEFINITIONS.some((d) => d.id === e.etf!.indexId && d.assetClass === 'EQUITY'
          && (d.region === regionId || !d.region))
    );
    const bookEntities = [...regionEntities, ...regionIndexFunds];
    // §4.C direct-to-pack — demand written straight into the engine's staging.
    const DS = openDemandStaging(regionCompanies.length);
    const currentSharesByEntity = new Map<string, Map<string, number>>();
    // SCALE C1: positions come off the shared store's EQUITY rows; only THIS region's names are
    // claimed, everything else passes through the write-back untouched.
    const store = ctx.holdingsStore!;
    bookEntities.forEach((entity) => {
      const bySharesForCompany = new Map<string, number>();
      store.scan(entity.id, 'EQUITY', (h) => {
        const comp = companyById.get(h.instrumentId);
        if (!comp) return false;
        // Pre-WS4 books stored equity as dollars only; convert once, at the current price.
        const shares = h.quantityShares ?? (h.quantityOrNotionalUSD / Math.max(0.01, comp.stockPrice));
        bySharesForCompany.set(h.instrumentId, (bySharesForCompany.get(h.instrumentId) ?? 0) + shares);
        return true;
      });
      currentSharesByEntity.set(entity.id, bySharesForCompany);
    });

    // OWN7, first half: the INSTITUTIONS' half of the float, set BEFORE the desks are built —
    // a desk is sized against the live float, so leaving `tradableFloatUSD` at the whole share
    // count until after the desk build gave every desk capacity against shares that are not for
    // sale (and a float of zero hands back no desk at all).
    const heldByInstitutionsShares = new Map<string, number>();
    currentSharesByEntity.forEach((byCompany) => byCompany.forEach((shares, companyId) => {
      if (shares > 0) heldByInstitutionsShares.set(companyId, (heldByInstitutionsShares.get(companyId) ?? 0) + shares);
    }));
    instruments.forEach((inst) => { inst.tradableFloatUSD = heldByInstitutionsShares.get(inst.id) ?? 0; });

    // G3a/G3e: the banks' equity desks, and the float they and the other participants make up.
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      unitPriceOf: (i) => refPriceOf(regionCompanies[i]),
    });
    const deskTickers = deskTickersOf(deskParticipants);

    // OWN7, second half: the desks' own books join the float now that they exist.
    // `tradableFloatUSD` was `sharesOutstanding` — the whole company — while the only bidders
    // were institutions whose mandates keep them far below it, so the book asked a demand side
    // that can never reach the supply to price it, and the level printed at the damper week after
    // week (§6). Founders, households and corporates on the register do not bid, so their shares
    // were never for sale; the same carve-out 07c and 07f already make, computed the same way —
    // off what the real holders actually hold rather than a stated passive share.
    const deskHeldShares = new Map<string, number>();
    deskParticipants.forEach((d) => d.currentHoldingsByInstrumentId.forEach((shares, companyId) => {
      if (shares > 0) deskHeldShares.set(companyId, (deskHeldShares.get(companyId) ?? 0) + shares);
    }));
    instruments.forEach((inst) => {
      inst.tradableFloatUSD = (heldByInstitutionsShares.get(inst.id) ?? 0) + (deskHeldShares.get(inst.id) ?? 0);
    });

    // §7.281 — THE HOUSEHOLD DIRECT-EQUITY SELL CHANNEL. The households' listed shares are the
    // register's residual (what institutions and desks do not hold), and until now they were
    // never for sale at any price — "a holding that cannot be sold is not a holding" (§7.166's
    // row). When last week's liquidity ladder announced a sale (deposits and fund shares both
    // exhausted — `pendingDirectEquitySaleUSD`), the sector enters this session as a SELLER:
    // its residual shares, prorated across names by value, at reservation zero (a forced seller
    // takes the print; the book's damper still bounds the week's move). Only the slice for sale
    // joins the float — the rest stays as unsellable as it always was.
    const hhSaleNeedUSD = Math.max(0, reg.householdState?.pendingDirectEquitySaleUSD ?? 0);
    if (process.env.HH_EQ_TRACE === '1' && hhSaleNeedUSD > 0) {
      console.log(`  [hh-eq] ${regionId} forced direct-equity sale announced: ${(hhSaleNeedUSD / 1e6).toFixed(1)}M`);
    }
    const householdParticipantId = `HOUSEHOLD-${regionId}`;
    let householdParticipant: ClearingParticipant | undefined;
    const householdPriorShares = new Map<string, number>();
    if (hhSaleNeedUSD > 1) {
      const hhSharesByCompany = new Map<string, number>();
      let hhTotalValueUSD = 0;
      regionCompanies.forEach((c) => {
        if (!isPubliclyListed(c)) return;
        const hhShares = Math.max(0,
          liveSharesOf(c) - (heldByInstitutionsShares.get(c.id) ?? 0) - (deskHeldShares.get(c.id) ?? 0));
        if (hhShares <= 0) return;
        hhSharesByCompany.set(c.id, hhShares);
        hhTotalValueUSD += hhShares * (refPriceById.get(c.id) ?? 0);
      });
      if (hhTotalValueUSD > 1) {
        const sellFraction = Math.min(1, hhSaleNeedUSD / hhTotalValueUSD);
        const demandByInstrumentId = new Map<string, ParticipantDemand>();
        hhSharesByCompany.forEach((shares, companyId) => {
          const sellShares = shares * sellFraction;
          householdPriorShares.set(companyId, sellShares);
          demandByInstrumentId.set(companyId, {
            reservationStat: 0,
            maxHoldingUSD: 0,
            fullSizeStatRange: 1e-6,
            maxNetPurchaseUSD: 0,
          });
          const inst = instruments.find((i) => i.id === companyId);
          if (inst) inst.tradableFloatUSD += sellShares;
        });
        householdParticipant = {
          id: householdParticipantId,
          currentHoldingsByInstrumentId: householdPriorShares,
          demandByInstrumentId,
        };
      }
    }

    // ETF: the index funds tracking any equity index this book prices. They are ordinary holders
    // — real positions, real cash — but their schedule has no reservation level: a fund buys its
    // benchmark weight at whatever the market is asking. That is the one demand shape this engine
    // could not previously express, and it is a large real force.
    const equityIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'EQUITY' && (d.region === regionId || !d.region))
      .map((d) => d.id);
    const indexFunds = indexFundsForBook(ctx.v2, regionIndexFunds, ctx.updatedMarketIndexes, equityIndexIds, (e) => store.currentHoldingsUSD(e.id));
    const indexFundParticipants: ClearingParticipant[] = indexFunds.map(({ fund, index, investableUSD }) => {
      const currentShares = currentSharesByEntity.get(fund.id) ?? new Map<string, number>();
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      index.constituents.forEach((c) => {
        if (!companyById.has(c.instrumentId)) return;
        const refPrice = refPriceById.get(c.instrumentId) ?? 0;
        if (!(refPrice > 0)) return;
        // Target in SHARES, because this book clears in shares.
        const targetShares = (investableUSD * c.weight) / refPrice;
        // §7.262: the cash bound is posted in SHARES, but the fund PAYS the CLEARED price — a
        // bound struck at the reference price lets it overspend by up to the weekly move cap
        // (18%) in every name at once, which is exactly an index fund's failure mode: it is the
        // one bidder that never walks away from a rising print. Committing at the WORST
        // admissible price this week makes the cash constraint hold at settlement whatever
        // clears — the residual sticky −0.02B overdrafts after the in-kind fix were this.
        // §5-CLOSE (user, 2026-09-02): THERE IS NO CAP. The fund commits at its reference price;
        // if the print clears above it the fund has overspent and the close sweep names that as
        // a margin draw at its broker — a real cost of never walking away, priced, not a bound.
        const worstPriceUSD = Math.max(1e-9, refPrice);
        demandByInstrumentId.set(
          c.instrumentId,
          indexFundDemand(targetShares, institutionSpendableUSD(ctx, fund) * c.weight / worstPriceUSD, 'PRICE_LIKE')
        );
      });
      return { id: fund.id, currentHoldingsByInstrumentId: currentShares, demandByInstrumentId };
    });

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      // Equity is bought with money the entity actually has: its cash, at the weight its mandate
      // puts on equities. Unlike credit, there is no leverage allowance here — nobody in this
      // model runs a levered equity book.
      const budgetUSD = entity.assetAllocationTarget.equityPct * institutionSpendableUSD(ctx, entity);
      const entityPoolUSD = institutionTotalAssetsUSD(ctx, entity) * entity.assetAllocationTarget.equityPct
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
      const holderRequiredReturn = entityRequiredReturn(entity, institutionTotalAssetsUSD(ctx, entity));
      let totalCashDemandWeightUSD = 0;
      for (let ci = 0; ci < nC; ci++) {
        const structuralUSD = entityPoolUSD * (floatValueArr[ci] / totalFloatValueUSD);
        const heldUSD = heldSharesArr[ci] * refPriceArr[ci];
        const weightUSD = offeredValueArr[ci] + Math.max(0, structuralUSD - heldUSD);
        cashWeightArr[ci] = weightUSD;
        totalCashDemandWeightUSD += weightUSD;
      }
      const demandRow = claimDemandRow(DS);
      for (let ci = 0; ci < nC; ci++) {
        const fair = defaultedArr[ci] === 1 ? 0 : fairValuePerShare({
          annualEarningsUSD: netIncomeArr[ci],
          sharesOutstanding: liveSharesArr[ci],
          bookEquityUSD: bookEquityArr[ci],
          netInvestmentRate: netInvRateArr[ci],
          riskFreeRate,
          beta: betaArr[ci],
          holderRequiredReturn,
        });
        // Structural size: this entity's share of the region's equity pool, allocated to this
        // name by its share of the float's value — the same real-pool discipline the credit
        // adapters use, expressed in shares.
        const refPrice = refPriceArr[ci];
        const structuralShares = (entityPoolUSD * (floatValueArr[ci] / totalFloatValueUSD)) / Math.max(0.01, refPrice);
        const cashShare = totalCashDemandWeightUSD > 0
          ? cashWeightArr[ci] / totalCashDemandWeightUSD
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
          (budgetUSD * cashShare) / Math.max(0.01, refPrice),
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
    const result = clearFinancialAsset(instruments, allParticipants, new Map(), {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      // OWN7: the float here is a stock these participants already hold, so an unsold
      // position stays with its holder rather than falling to a dealer nobody names.
      unsoldStaysWithHolder: true,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `equity:${id}`));
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} equity`);
    // EQ_CONS_TRACE=1 — per-instrument share conservation across every cash-accounted
    // participant: Σ(new − prev) must be zero for a stock book with no primary; a nonzero sum
    // is a participant whose shares moved with no cash leg, valued at the cleared price.
    if (process.env.EQ_CONS_TRACE === '1') {
      const allParts = allParticipants;
      const deltaByInstrument = new Map<string, number>();
      allParts.forEach((p) => {
        const news = result.newParticipantHoldings.get(p.id) ?? new Map<string, number>();
        news.forEach((shares, instId) => {
          deltaByInstrument.set(instId, (deltaByInstrument.get(instId) ?? 0) + shares - (p.currentHoldingsByInstrumentId.get(instId) ?? 0));
        });
        p.currentHoldingsByInstrumentId.forEach((prev, instId) => {
          if (!news.has(instId)) deltaByInstrument.set(instId, (deltaByInstrument.get(instId) ?? 0) - prev);
        });
      });
      deltaByInstrument.forEach((dShares, instId) => {
        const px = result.newStatById.get(instId) ?? refPriceById.get(instId) ?? 0;
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
    const bookCapacityUSD = totalDeskCapacityUSD(ctx, regionBanks, BOOK);
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
      const newPrice = result.newStatByIndex[ii];
      if (!(newPrice > 0)) continue;
      const comp = regionCompanies[ii];
      comp.stockPrice = Number(newPrice.toFixed(2));
    }

    // Apply each entity's real new share register, with its cash leg.
    // SCALE C1: fills append to the store for the single write-back after this, the last book.
    // SETL6: the cash legs are collected here and settled below through the clearing house.
    const netCashByEntityId = new Map<string, number>();
    let bookFeeUSD = 0;
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
            instrumentId: comp.id, instrumentType: 'EQUITY', issuerRegion: regionId,
            quantityShares: shares, quantityOrNotionalUSD: shares * comp.stockPrice, units: shares,
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
          instrumentId: comp.id,
          instrumentType: 'EQUITY',
          issuerRegion: regionId,
          quantityShares: shares,
          quantityOrNotionalUSD: shares * comp.stockPrice, units: shares,
        });
      }
      // The engine's cash delta is in the same unit as the quantity — shares — so convert the
      // traded share flow into money at each name's cleared price. G3e: and charge the desks'
      // spread on it, which this adapter never did because the engine's fee came back
      // share-denominated too — so equity trading was free while every other book paid.
      let cashDeltaUSD = 0;
      let feeUSD = 0;
      const chargeUSD = (tradedShares: number, comp: Company) => {
        cashDeltaUSD -= tradedShares * comp.stockPrice;
        const f = Math.abs(tradedShares) * comp.stockPrice * (DEALER_SPREAD_BPS / 10000);
        cashDeltaUSD -= f;
        feeUSD += f;
      };
      for (let ii = 0; ii < nI; ii++) {
        const shares = holdAt(epi, ii);
        if (shares === 0) continue;
        const prev = currentSharesByEntity.get(entity.id)?.get(regionCompanies[ii].id) ?? 0;
        chargeUSD(shares - prev, regionCompanies[ii]);
      }
      currentSharesByEntity.get(entity.id)!.forEach((prevShares, companyId) => {
        const ti = ciById.get(companyId);
        if (ti !== undefined && holdAt(epi, ti) !== 0) return;
        const comp = companyById.get(companyId);
        if (comp) chargeUSD(-prevShares, comp);
      });
      netCashByEntityId.set(entity.id, cashDeltaUSD);
      bookFeeUSD += feeUSD;
      store.append(entity.id, equityHoldings);
    });

    // G3e: the desks' own money leg, computed the same way — this book clears in shares, so the
    // engine's cash legs are share-denominated and every money number here is made in this
    // adapter. A desk pays the book's spread on its own flow exactly as a client does.
    const deskCashUSD = new Map<string, number>();
    deskParticipants.forEach((desk) => {
      const dpi = piById.get(desk.id);
      let cashDeltaUSD = 0;
      const charge = (tradedShares: number, comp: Company) => {
        cashDeltaUSD -= tradedShares * comp.stockPrice;
        const f = Math.abs(tradedShares) * comp.stockPrice * (DEALER_SPREAD_BPS / 10000);
        cashDeltaUSD -= f;
        bookFeeUSD += f;
      };
      for (let ii = 0; ii < nI; ii++) {
        const shares = holdAt(dpi, ii);
        if (shares === 0) continue;
        charge(shares - (desk.currentHoldingsByInstrumentId.get(regionCompanies[ii].id) ?? 0), regionCompanies[ii]);
      }
      desk.currentHoldingsByInstrumentId.forEach((prevShares, companyId) => {
        const ti = ciById.get(companyId);
        if (ti !== undefined && holdAt(dpi, ti) !== 0) return;
        const comp = companyById.get(companyId);
        if (comp) charge(-prevShares, comp);
      });
      deskCashUSD.set(desk.id, cashDeltaUSD);
      netCashByEntityId.set(desk.id, cashDeltaUSD);
    });
    // §7.281: the households' cash leg, computed the same way — shares SOLD at the cleared
    // print, less the same spread every seller pays. The unsold remainder stays household-held
    // (it simply rejoins the residual the register measures). The proceeds land on the
    // HOUSEHOLD party at settlement below, which is the whole point of the channel.
    if (householdParticipant) {
      const hpi = piById.get(householdParticipantId);
      let cashDeltaUSD = 0;
      // Step 13 (W2): the shares the households sold go to the house by wire, at the print.
      const hhBefore = new Map<string, { valueUSD: number; shares?: number }>(), hhAfter = new Map<string, { valueUSD: number; shares?: number }>();
      const hhPrice = new Map<string, number>();
      householdPriorShares.forEach((prevShares, companyId) => {
        const comp = companyById.get(companyId);
        if (!comp) return;
        const ti = ciById.get(companyId);
        const soldShares = Math.max(0, prevShares - (ti !== undefined ? holdAt(hpi, ti) : 0));
        if (soldShares <= 0) return;
        const f = soldShares * comp.stockPrice * (DEALER_SPREAD_BPS / 10000);
        cashDeltaUSD += soldShares * comp.stockPrice - f;
        bookFeeUSD += f;
        hhBefore.set(companyId, { shares: soldShares, valueUSD: soldShares * comp.stockPrice });
        hhAfter.set(companyId, { shares: 0, valueUSD: 0 });
        hhPrice.set(companyId, comp.stockPrice);
      });
      clearedBookDelta({ kind: 'HOUSEHOLD', region: regionId }, regionId, 'EQUITY', hhBefore, hhAfter, (id) => hhPrice.get(id), 'equity clearing fill');
      if (cashDeltaUSD > 0) netCashByEntityId.set(householdParticipantId, cashDeltaUSD);
      reg.householdState.pendingDirectEquitySaleUSD = 0;
    }

    // And the inventory it was left holding, marked at this week's cleared price, onto the bank
    // that carried it — the equity desk held nothing however one-sided the session was, because
    // the engine's residual came back in shares and this adapter dropped it.
    applyDealerDeskFills({
      ctx, banks: regionBanks, book: BOOK, instruments, result,
      unitPriceOf: (companyId) => companyById.get(companyId)?.stockPrice ?? 0,
      cashDeltaOf: (deskId) => deskCashUSD.get(deskId) ?? 0,
    });
    // §7.259: AFTER the fills application, so the lead's residual survives to next week's
    // clearing as a real prior position.
    settlePricedOfferings(regionId, 'EQUITY', offeringsByIssuerId, result, ctx,
      (o, clearedStat) => o.sizeUSD * clearedStat,
      (o, clearedStat) => underwritingFeeBps({
        bookSpreadBps: DEALER_SPREAD_BPS,
        oneWeekPriceRiskBps: oneWeekPriceRiskBps({
          statKind: 'PRICE_LIKE', currentStat: clearedStat,
          weeklyMovePct: Math.abs(clearedStat - (priorPriceById.get(o.issuerId) ?? clearedStat)) / Math.max(1e-9, Math.abs(clearedStat)),
        }),
        dealSizeUSD: o.sizeUSD * clearedStat,
        deskCapacityUSD: bookCapacityUSD,
      }),
      BOOK);

    // SETL6. This book clears in SHARES, so the engine's own money legs are share-denominated
    // and unusable here; the deltas above are the money ones. The dealer is the counterparty to
    // all of them, so its leg is their negative — exactly, which is what keeps the clearing
    // house flat.
    let dealerNetUSD = 0;
    netCashByEntityId.forEach((v) => { dealerNetUSD -= v; });
    // WS8: the CCP pays each issuer for the shares its deal actually placed — the engine's take
    // is in SHARES here, so it is valued at the level the same auction cleared.
    const equityPrimaryTakes = primaryTakes(
      result,
      (issuerId) => {
        const issuer = companyById.get(issuerId);
        return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
      },
      (takeShares, clearedStat) => takeShares * clearedStat,
      // Step 13 (W2): the paper leg at the PRINT every holder's row carries (the rounded
      // stockPrice), so the house nets in value as it does in shares.
      (issuerId, takeShares) => (takeShares > 0 ? { instrumentType: 'EQUITY', instrumentId: issuerId, issuerRegion: regionId, valueUSD: takeShares * (companyById.get(issuerId)?.stockPrice ?? 0), shares: takeShares } : undefined)
    );
    const entityIds = new Set(bookEntities.map((e) => e.id));
    if (process.env.LEFTOVER_TRACE === '1') {
      const legs = [...netCashByEntityId.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8)
        .map(([id, v]) => `${id.slice(0, 18)} ${(v / 1e6).toFixed(1)}M`).join(' | ');
      const prim = [...result.primaryOutcomeById.entries()].map(([id, o]) => `${id.slice(0, 14)} take ${(o.marketTakeUSD / 1e6).toFixed(2)}Msh@${o.clearedStat.toFixed(2)}${o.withdrawn ? ' WITHDRAWN' : ''}`).join(' | ');
      console.log(`  [equity-legs] ${regionId} dealerNet ${(dealerNetUSD / 1e6).toFixed(1)}M fee ${(bookFeeUSD / 1e6).toFixed(1)}M | ${legs} | primary: ${prim || 'none'}`);
    }
    settleClearedBook(
      ctx, regionId, BOOK,
      netCashByEntityId,
      (id) => (entityIds.has(id) ? { kind: 'INSTITUTION', id }
        : id === householdParticipantId ? { kind: 'HOUSEHOLD', region: regionId }
        : dealerDeskPartyOf(id, deskTickers)),
      { netCashUSD: dealerNetUSD, feeUSD: bookFeeUSD },
      feeDesksForRegion(ctx, regionId),
      equityPrimaryTakes
    );
  });
}
