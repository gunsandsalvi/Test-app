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
import { REQUIRED_RETURN_ON_CAPITAL, MAX_OVERWEIGHT_MULTIPLE } from './asset-allocation';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { settlePricedOfferings } from './primary-settlement';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import { indexFundDemand, indexFundsForBook } from './etf-demand';
import { fairValuePerShare, companyBookEquityUSD, companyNetInvestmentRate } from '../../equity-valuation';

const DEALER_SPREAD_BPS = 8;
/** Equity gaps more than credit; this is discrete-time damping, not a bound. */
const MAX_WEEKLY_PRICE_MOVE_PCT = 0.18;
/** How far below its fair value a holder must see the price before it takes full size. */
const FULL_SIZE_PRICE_DISCOUNT = 0.30;

export function runEquityClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    // Only listed companies have a traded price; a private firm's equity is not for sale (HC).
    // Banks and institutions keep their own book-value pricing in stage 08 for now — their equity
    // is a claim on a balance sheet this engine does not yet model as shares.
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
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType !== 'ETF'
    );
    if (regionEntities.length === 0) return;

    const tradableShare = reg.equityOwnership.institutionalShare;
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
    /**
     * The shares this book must actually find owners for: the institutional slice of the existing
     * register plus ALL of the offering. `tradableShare` describes passive holders of shares
     * already issued; a listing has none — every share of it is for sale here, which is what the
     * engine adds to the float it clears (see 07d for what the mismatch did to loan financings).
     */
    const liveTradableSharesOf = (c: Company) => {
      const o = offeringsByIssuerId.get(c.id);
      const offeredShares = o?.sizeUSD ?? 0;
      return Math.max(0, liveSharesOf(c) - offeredShares) * tradableShare + offeredShares;
    };

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => ({
      id: c.id,
      outstandingUSD: c.sharesOutstanding,
      tradableFloatUSD: c.sharesOutstanding * tradableShare,
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
    const bookEquityById = new Map(regionCompanies.map((c) => [c.id, companyBookEquityUSD(c)]));
    const netInvestmentRateById = new Map(regionCompanies.map((c) => [c.id, companyNetInvestmentRate(c)]));

    // Index funds hold real equity and settle real cash, so they go through exactly the same
    // bookkeeping and apply passes as every other holder; only their SCHEDULE differs.
    const regionIndexFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.entityType === 'ETF' && e.etf
        && INDEX_DEFINITIONS.some((d) => d.id === e.etf!.indexId && d.assetClass === 'EQUITY'
          && (d.region === regionId || !d.region))
    );
    const bookEntities = [...regionEntities, ...regionIndexFunds];
    const otherHoldingsByEntity = new Map<string, ItemizedHolding[]>();
    const currentSharesByEntity = new Map<string, Map<string, number>>();
    bookEntities.forEach((entity) => {
      const bySharesForCompany = new Map<string, number>();
      const other: ItemizedHolding[] = [];
      entity.itemizedHoldings.forEach((h) => {
        if (h.instrumentType === 'EQUITY' && companyById.has(h.instrumentId)) {
          const comp = companyById.get(h.instrumentId)!;
          // Pre-WS4 books stored equity as dollars only; convert once, at the current price.
          const shares = h.quantityShares ?? (h.quantityOrNotionalUSD / Math.max(0.01, comp.stockPrice));
          bySharesForCompany.set(h.instrumentId, (bySharesForCompany.get(h.instrumentId) ?? 0) + shares);
        } else {
          other.push(h);
        }
      });
      otherHoldingsByEntity.set(entity.id, other);
      currentSharesByEntity.set(entity.id, bySharesForCompany);
    });

    // ETF: the index funds tracking any equity index this book prices. They are ordinary holders
    // — real positions, real cash — but their schedule has no reservation level: a fund buys its
    // benchmark weight at whatever the market is asking. That is the one demand shape this engine
    // could not previously express, and it is a large real force.
    const equityIndexIds = INDEX_DEFINITIONS
      .filter((d) => d.assetClass === 'EQUITY' && (d.region === regionId || !d.region))
      .map((d) => d.id);
    const indexFunds = indexFundsForBook(regionIndexFunds, ctx.updatedMarketIndexes, equityIndexIds);
    const indexFundParticipants: ClearingParticipant[] = indexFunds.map(({ fund, index, investableUSD }) => {
      const currentShares = currentSharesByEntity.get(fund.id) ?? new Map<string, number>();
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      index.constituents.forEach((c) => {
        if (!companyById.has(c.instrumentId)) return;
        const refPrice = refPriceById.get(c.instrumentId) ?? 0;
        if (!(refPrice > 0)) return;
        // Target in SHARES, because this book clears in shares.
        const targetShares = (investableUSD * c.weight) / refPrice;
        demandByInstrumentId.set(
          c.instrumentId,
          indexFundDemand(targetShares, Math.max(0, fund.cashUSD ?? 0) * c.weight / Math.max(1e-9, refPrice), 'PRICE_LIKE')
        );
      });
      return { id: fund.id, currentHoldingsByInstrumentId: currentShares, demandByInstrumentId };
    });

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      // Equity is bought with money the entity actually has: its cash, at the weight its mandate
      // puts on equities. Unlike credit, there is no leverage allowance here — nobody in this
      // model runs a levered equity book.
      const budgetUSD = entity.assetAllocationTarget.equityPct * Math.max(0, entity.cashUSD ?? 0);
      const entityPoolUSD = entity.totalAssetsUSD * entity.assetAllocationTarget.equityPct;
      // Same discipline as the credit books: this week's money goes where shares are actually
      // changing hands — a live offering, or the gap between the target holding and the current
      // one. A name the holder is already at weight in, with nothing on offer, needs none of it.
      // Splitting the budget across the whole float instead gave a listing a slice the size of
      // its issuer's index weight rather than of the deal (see 07d for the measurement).
      const currentShares = currentSharesByEntity.get(entity.id)!;
      const cashDemandWeightByCompany = new Map<string, number>();
      let totalCashDemandWeightUSD = 0;
      regionCompanies.forEach((c) => {
        const structuralUSD = entityPoolUSD * ((floatValueById.get(c.id) ?? 0) / totalFloatValueUSD);
        const heldUSD = (currentShares.get(c.id) ?? 0) * (refPriceById.get(c.id) ?? 0);
        const weightUSD = (offeredValueById.get(c.id) ?? 0) + Math.max(0, structuralUSD - heldUSD);
        cashDemandWeightByCompany.set(c.id, weightUSD);
        totalCashDemandWeightUSD += weightUSD;
      });
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      regionCompanies.forEach((c) => {
        const fair = c.isDefaulted ? 0 : fairValuePerShare({
          annualEarningsUSD: c.netIncome,
          sharesOutstanding: liveSharesOf(c),
          bookEquityUSD: bookEquityById.get(c.id) ?? 0,
          netInvestmentRate: netInvestmentRateById.get(c.id) ?? 0,
          riskFreeRate,
          beta: c.beta ?? 1,
          holderRequiredReturn: REQUIRED_RETURN_ON_CAPITAL[entity.entityType],
        });
        // Structural size: this entity's share of the region's equity pool, allocated to this
        // name by its share of the float's value — the same real-pool discipline the credit
        // adapters use, expressed in shares.
        const refPrice = refPriceById.get(c.id) ?? 0;
        const nameFloatValueUSD = floatValueById.get(c.id) ?? 0;
        const structuralShares = (entityPoolUSD * (nameFloatValueUSD / totalFloatValueUSD)) / Math.max(0.01, refPrice);
        const cashShare = totalCashDemandWeightUSD > 0
          ? (cashDemandWeightByCompany.get(c.id) ?? 0) / totalCashDemandWeightUSD
          : 0;
        demandByInstrumentId.set(c.id, {
          reservationStat: fair,
          maxHoldingUSD: structuralShares * MAX_OVERWEIGHT_MULTIPLE,
          fullSizeStatRange: Math.max(0.01, fair * FULL_SIZE_PRICE_DISCOUNT),
          // Budget in SHARES at the current price — a holder cannot buy what it cannot fund.
          maxNetPurchaseUSD: (budgetUSD * cashShare) / Math.max(0.01, refPrice),
        });
      });
      return {
        id: entity.id,
        currentHoldingsByInstrumentId: currentSharesByEntity.get(entity.id)!,
        demandByInstrumentId,
      };
    });

    const result = clearFinancialAsset(instruments, [...participants, ...indexFundParticipants], new Map(), {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_PRICE_MOVE_PCT,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);
    // Equity proceeds are shares x the CLEARED price — the one place the conversion differs
    // from credit (where the stat is a spread and the paper prices at par).
    settlePricedOfferings(regionId, 'EQUITY', offeringsByIssuerId, result, ctx,
      (o, clearedStat) => o.sizeUSD * clearedStat);

    // Apply the cleared price. Stage 08 runs after this and reads it as already-real, exactly as
    // it reads the cleared OAS — it no longer computes a price of its own.
    result.newStatById.forEach((newPrice, companyId) => {
      const comp = companyById.get(companyId);
      if (!comp || !(newPrice > 0)) return;
      comp.stockPrice = Number(newPrice.toFixed(2));
      comp.marketCap = comp.stockPrice * comp.sharesOutstanding;
    });

    // Apply each entity's real new share register, with its cash leg.
    const updatedById = new Map(bookEntities.map((e) => [e.id, e]));
    bookEntities.forEach((entity) => {
      const newShares = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
      const equityHoldings: ItemizedHolding[] = [];
      newShares.forEach((shares, companyId) => {
        const comp = companyById.get(companyId);
        if (!comp || shares <= 0.0001) return;
        equityHoldings.push({
          instrumentId: companyId,
          instrumentType: 'EQUITY',
          issuerRegion: regionId,
          quantityShares: shares,
          quantityOrNotionalUSD: shares * comp.stockPrice,
        });
      });
      // The engine's cash delta is in the same unit as the quantity — shares — so convert the
      // traded share flow into money at each name's cleared price.
      let cashDeltaUSD = 0;
      newShares.forEach((shares, companyId) => {
        const comp = companyById.get(companyId);
        if (!comp) return;
        const prev = currentSharesByEntity.get(entity.id)?.get(companyId) ?? 0;
        cashDeltaUSD -= (shares - prev) * comp.stockPrice;
      });
      currentSharesByEntity.get(entity.id)!.forEach((prevShares, companyId) => {
        if (newShares.has(companyId)) return;
        const comp = companyById.get(companyId);
        if (comp) cashDeltaUSD += prevShares * comp.stockPrice;
      });
      updatedById.set(entity.id, {
        ...entity,
        cashUSD: (entity.cashUSD ?? 0) + cashDeltaUSD,
        itemizedHoldings: [...(otherHoldingsByEntity.get(entity.id) ?? []), ...equityHoldings],
      });
    });
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => updatedById.get(e.id) ?? e);
  });
}
