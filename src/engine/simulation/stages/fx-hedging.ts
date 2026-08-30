/**
 * XB2 — the hedge as a real position: struck against the book it covers, marked every week, with
 * a bank on the other side.
 *
 * Runs after the clearing books have settled, so it sizes the hedge against what the entity
 * ACTUALLY ended up holding abroad rather than what it intended to buy. Three things happen:
 * mature contracts roll off, the book is re-hedged to its current foreign exposure, and every
 * live contract is marked with its P&L posted to both sides.
 *
 * Conservation: a forward is a bilateral contract, so the holder's mark and the bank's are equal
 * and opposite. Nothing is created — the pair nets to zero, which is exactly why a hedge is not
 * a subsidy and why it has to be modelled with a counterparty rather than as a yield discount.
 */

import { RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { isActiveCompany } from '../../../domain/company';
import {
  FxForward, HEDGE_RATIO_FIXED_INCOME, equityHedgeRatioFor, FX_FORWARD_TENOR_WEEKS,
  forwardMarkToMarketUSD,
} from '../../../domain/fx-hedging';
import {
  FxDealerBook, emptyFxDealerBook, fxDeskCapacityUSD,
  FX_INITIAL_MARGIN_RATE,
} from '../../../domain/dealer-derivatives';
import { leverageHeadroomUSD } from '../../macro/banking';
import { fxWeeklySigma } from '../../../domain/fx-market';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

/** What this entity holds in each foreign region, split by how much of it its mandate hedges. */
function hedgeableExposureByRegion(entity: any): Map<RegionId, number> {
  const out = new Map<RegionId, number>();
  (entity.itemizedHoldings || []).forEach((h: any) => {
    const issuer = h.issuerRegion as RegionId;
    if (!issuer || issuer === entity.region) return;
    const ratio = h.instrumentType === 'EQUITY' ? equityHedgeRatioFor(entity.entityType, entity.hedgeFundStrategy)
      : (h.instrumentType === 'GOV_BOND' || h.instrumentType === 'CORP_BOND' || h.instrumentType === 'LEVERAGED_LOAN')
        ? HEDGE_RATIO_FIXED_INCOME : 0;
    if (ratio <= 0) return;
    out.set(issuer, (out.get(issuer) ?? 0) + (h.quantityOrNotionalUSD ?? 0) * ratio);
  });
  return out;
}

/**
 * How wide a basis a hedger will pay before it gives up and carries the currency risk instead.
 *
 * DER — DERIVED, not posted. What certainty is worth to a holder is the risk it removes, priced
 * by how much of that risk its own mandate says it must not run: the currency's OWN annualised
 * volatility (measured, from the pair's history) times the share of the exposure the mandate
 * hedges (HF4's mandate property). A liability-driven book, which hedges everything because the
 * claim it matches is in its own money, will pay close to a full sigma; a macro fund, for which
 * the currency IS the trade, will pay nothing. The four posted tolerances this replaces
 * (220/180/90/45) ordered the entity types correctly and were otherwise chosen.
 *
 * This is what makes the DEMAND curve slope: at a wide enough basis, some hedgers stop hedging.
 */
function entityHedgeToleranceBps(entity: any, annualFxSigma: number): number {
  const mandateShare = Math.max(
    equityHedgeRatioFor(entity.entityType, entity.hedgeFundStrategy),
    entity.entityType === 'INSURER' || entity.entityType === 'PENSION_FUND' ? HEDGE_RATIO_FIXED_INCOME : 0
  );
  return Math.max(0, annualFxSigma * 10000 * mandateShare);
}

interface DeskState { book: FxDealerBook; headroomUSD: number; marginReceivedUSD: number }

export function runFxHedgingStage(state: any, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const bankMarkByTicker = new Map<string, number>();

  // Every dealer's desk, opened at what it carried into the week. Contracts that matured release
  // their notional and their margin first, which is what frees capacity for this week's flow.
  const desks = new Map<string, DeskState>();
  ctx.updatedCompanies.forEach((c: any) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    // The LIVE sheet, not a snapshot some earlier stage parked in companyUpdates: the desk's
    // capacity is what the bank's book leaves it right now (see the note at the write below).
    const sheet = c.bankBalanceSheet;
    desks.set(c.ticker, {
      book: sheet.fxDealerBook ? { ...sheet.fxDealerBook, netNotionalByRegion: { ...sheet.fxDealerBook.netNotionalByRegion } } : emptyFxDealerBook(),
      headroomUSD: leverageHeadroomUSD(sheet),
      marginReceivedUSD: 0,
    });
  });
  // Roll off what matured: a desk's capacity is what its LIVE book leaves, not its lifetime one.
  const liveNotionalByTicker = new Map<string, { gross: number; net: Record<string, number>; margin: number }>();
  ctx.updatedInstitutionalEntities.forEach((e: any) => {
    (e.fxForwards || []).forEach((f: FxForward) => {
      if (f.maturityWeek <= week) return;
      const cur = liveNotionalByTicker.get(f.counterpartyTicker) ?? { gross: 0, net: {}, margin: 0 };
      cur.gross += f.notionalUSD;
      cur.net[f.foreignRegion] = (cur.net[f.foreignRegion] ?? 0) + f.notionalUSD;
      cur.margin += f.notionalUSD * FX_INITIAL_MARGIN_RATE;
      liveNotionalByTicker.set(f.counterpartyTicker, cur);
    });
  });
  desks.forEach((d, ticker) => {
    const live = liveNotionalByTicker.get(ticker);
    d.book.grossNotionalUSD = live?.gross ?? 0;
    d.book.netNotionalByRegion = live?.net ?? {};
    d.book.initialMarginHeldUSD = live?.margin ?? 0;
  });

  // ---- DER — THE CROSS-CURRENCY BASIS IS NOW A CLEARED PRICE.
  //
  // What it replaces: `MAX_BASIS x utilization x (0.35 + 0.65 x oneWayShare)` — a formula with a
  // ceiling, whose maximum was an observed crisis-era level (rule 4) and whose 0.35/0.65 split was
  // invented. A hedger that cannot get a hedge at a price should walk away and the price should
  // rise until someone supplies it, which is what every other market in this model does.
  //
  // So it clears. The FLOAT is what the region's desks can still write — real supply, bounded by
  // real balance sheets. The PARTICIPANTS are the hedgers, and their schedules slope the right way
  // by construction: full size when the hedge is free, nothing at all once the basis passes what
  // the risk is worth to them. Where demand is thin the basis clears near zero and hedging is
  // nearly free; where it exceeds what the desks can carry, the basis rises until enough hedgers
  // walk — which is exactly the post-2008 mechanism the old formula was imitating.
  const annualSigmaByRegion = new Map<RegionId, number>();
  (ctx.updatedFxPairs ?? []).forEach((fx: any) => {
    const sigma = fxWeeklySigma(fx.historicalRates) * Math.sqrt(52);
    [fx.base, fx.quote].forEach((r: RegionId) => {
      if (r === 'USA') return;
      annualSigmaByRegion.set(r, Math.max(annualSigmaByRegion.get(r) ?? 0, sigma));
    });
  });
  const annualSigmaFor = (r: RegionId) => annualSigmaByRegion.get(r) ?? 0.10;

  /** This week's unhedged gap for one holder in one foreign currency. */
  const gapByEntityRegion = new Map<string, Map<RegionId, number>>();
  ctx.updatedInstitutionalEntities.forEach((entity: any) => {
    const live: FxForward[] = (entity.fxForwards || []).filter((f: FxForward) => f.maturityWeek > week);
    const covered = new Map<RegionId, number>();
    live.forEach((f) => covered.set(f.foreignRegion, (covered.get(f.foreignRegion) ?? 0) + f.notionalUSD));
    const gaps = new Map<RegionId, number>();
    hedgeableExposureByRegion(entity).forEach((wantUSD, issuer) => {
      const gapUSD = wantUSD - (covered.get(issuer) ?? 0);
      if (gapUSD > 1e6) gaps.set(issuer, gapUSD);
    });
    if (gaps.size > 0) gapByEntityRegion.set(entity.id, gaps);
  });

  /** The cleared basis, and each holder's filled notional, per (holder region, foreign currency). */
  const clearedBasisBps = new Map<string, number>();
  const filledByEntityRegion = new Map<string, Map<RegionId, number>>();
  const bookKey = (holderRegion: RegionId, issuer: RegionId) => `${holderRegion}->${issuer}`;
  const holderRegions = new Set<RegionId>();
  ctx.updatedInstitutionalEntities.forEach((e: any) => holderRegions.add(e.region));
  holderRegions.forEach((holderRegion) => {
    let capacityUSD = 0;
    ctx.updatedCompanies.forEach((c: any) => {
      if (c.region !== holderRegion || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
      const desk = desks.get(c.ticker);
      if (desk) capacityUSD += fxDeskCapacityUSD(desk.headroomUSD, desk.book);
    });
    const issuers = new Set<RegionId>();
    ctx.updatedInstitutionalEntities.forEach((e: any) => {
      if (e.region !== holderRegion) return;
      (gapByEntityRegion.get(e.id) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
    });
    issuers.forEach((issuer) => {
      const key = bookKey(holderRegion, issuer);
      const instrumentId = `XCS-${key}`;
      const participants: ClearingParticipant[] = [];
      ctx.updatedInstitutionalEntities.forEach((e: any) => {
        if (e.region !== holderRegion) return;
        const gapUSD = gapByEntityRegion.get(e.id)?.get(issuer) ?? 0;
        if (!(gapUSD > 0)) return;
        const toleranceBps = entityHedgeToleranceBps(e, annualSigmaFor(issuer));
        if (!(toleranceBps > 0)) return;
        const demand = new Map<string, ParticipantDemand>();
        // Full size when the hedge is free, nothing at all at its own tolerance.
        demand.set(instrumentId, {
          reservationStat: toleranceBps,
          maxHoldingUSD: gapUSD,
          fullSizeStatRange: toleranceBps,
        });
        participants.push({ id: e.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
      });
      if (participants.length === 0 || !(capacityUSD > 0)) { clearedBasisBps.set(key, 0); return; }
      const instrument: ClearingInstrument = {
        id: instrumentId,
        outstandingUSD: capacityUSD,
        tradableFloatUSD: capacityUSD,
        currentStat: Math.max(1, ctx.updatedRegions[holderRegion]?.crossCurrencyBasisBps?.[issuer] ?? 10),
        statKind: 'PRICE_LIKE',
        durationYears: 0,
      };
      // Undamped: both sides are genuinely elastic here, so the level is the market's, and a
      // damper would be the only thing that could print instead of it (§6's doctrine).
      const result = clearFinancialAsset([instrument], participants, new Map(), { dealerSpreadBps: 0, maxWeeklyStatMovePct: Number.NaN });
      const basisBps = Math.max(0, result.newStatById.get(instrumentId) ?? 0);
      clearedBasisBps.set(key, basisBps);
      result.newParticipantHoldings.forEach((byInstrument, entityId) => {
        const filledUSD = byInstrument.get(instrumentId) ?? 0;
        if (filledUSD <= 1e6) return;
        let byRegion = filledByEntityRegion.get(entityId);
        if (!byRegion) { byRegion = new Map(); filledByEntityRegion.set(entityId, byRegion); }
        byRegion.set(issuer, filledUSD);
      });
    });
    // Published so the spot desks can quote off a real price next week, and so §6 can watch it.
    const reg = ctx.updatedRegions[holderRegion];
    if (reg) {
      const byIssuer: Record<string, number> = {};
      issuers.forEach((issuer) => { byIssuer[issuer] = Number((clearedBasisBps.get(bookKey(holderRegion, issuer)) ?? 0).toFixed(1)); });
      reg.crossCurrencyBasisBps = byIssuer;
    }
  });

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity: any) => {
    const live: FxForward[] = (entity.fxForwards || []).filter((f: FxForward) => f.maturityWeek > week);
    const exposure = hedgeableExposureByRegion(entity);
    if (live.length === 0 && exposure.size === 0) return entity;

    // Mark every live contract, then post the holder's side and remember the bank's mirror.
    let markUSD = 0;
    live.forEach((f) => {
      const rate = ctx.getFxToUsd(f.foreignRegion);
      const m = forwardMarkToMarketUSD(f, rate);
      markUSD += m;
      bankMarkByTicker.set(f.counterpartyTicker, (bankMarkByTicker.get(f.counterpartyTicker) ?? 0) - m);
    });

    // Re-hedge to the book that actually exists — but only as far as a dealer will write it, and
    // at the price the dealer's own balance sheet implies.
    const coveredByRegion = new Map<RegionId, number>();
    live.forEach((f) => coveredByRegion.set(f.foreignRegion, (coveredByRegion.get(f.foreignRegion) ?? 0) + f.notionalUSD));
    const newForwards: FxForward[] = [];
    let marginPostedUSD = 0;
    exposure.forEach((wantUSD, issuer) => {
      const gapUSD = wantUSD - (coveredByRegion.get(issuer) ?? 0);
      if (gapUSD <= 1e6) return;
      // DER: what the AUCTION filled for this holder in this currency, at the cleared basis. The
      // desk it faces is still the one with the most room, because a full desk stops quoting —
      // but the price is now the market's, not that one desk's utilization.
      const dealer = pickDealerBank(ctx, entity.region, desks);
      if (!dealer) return;
      const desk = desks.get(dealer.ticker)!;
      const filledUSD = filledByEntityRegion.get(entity.id)?.get(issuer) ?? 0;
      const writableUSD = Math.min(gapUSD, filledUSD, fxDeskCapacityUSD(dealer.headroomUSD, desk.book));
      if (writableUSD <= 1e6) return;
      const basisBps = clearedBasisBps.get(bookKey(entity.region, issuer)) ?? 0;

      // Initial margin is real cash leaving the client and sitting with the desk.
      const marginUSD = writableUSD * FX_INITIAL_MARGIN_RATE;
      if (marginUSD > Math.max(0, entity.cashUSD ?? 0) + markUSD) return;
      marginPostedUSD += marginUSD;

      desk.book.grossNotionalUSD += writableUSD;
      // The client SELLS the foreign currency forward to hedge a long foreign asset, so the desk
      // BUYS it: the desk is long. Signing this the other way survives only while the basis reads
      // |net| — it becomes load-bearing the moment the desk has to delta-hedge a direction.
      desk.book.netNotionalByRegion[issuer] = (desk.book.netNotionalByRegion[issuer] ?? 0) + writableUSD;
      desk.book.initialMarginHeldUSD += marginUSD;
      desk.marginReceivedUSD += marginUSD;

      newForwards.push({
        id: `${entity.id}-FX-${issuer}-${week}`,
        holderId: entity.id,
        counterpartyTicker: dealer.ticker,
        foreignRegion: issuer,
        // The traded rate, not the theoretical one: CIP moved AGAINST the client by the desk's
        // basis, because the desk is charging for its balance sheet. Signing this the other way
        // hands the hedger an instant gain at inception and the dealer an instant loss on every
        // ticket — measured as bank NIM going to -2.2% before the sign was fixed.
        contractedRate: ctx.getFxToUsd(issuer) * (1 - basisBps / 10000),
        notionalUSD: writableUSD,
        maturityWeek: week + FX_FORWARD_TENOR_WEEKS,
      });
    });

    return {
      ...entity,
      cashUSD: (entity.cashUSD ?? 0) + markUSD - marginPostedUSD,
      fxForwards: [...live, ...newForwards],
    };
  });

  // XB2f: the desk offers its WHOLE net position to the FX market — it does not decide how much
  // it can work. What the market absorbs at the cleared rate is settled in stages/fx-clearing.ts,
  // and what nobody takes stays here as inventory. The execution-rate constant this replaces was
  // a liquidity claim with no liquidity behind it.
  // The banks' side: the mirror of every client mark, the margin that arrived, and the desk book
  // the week left behind. Margin is the client's money held by the desk, so it is cash AND a
  // liability — it must never be counted as the desk's own earnings.
  ctx.updatedCompanies = ctx.updatedCompanies.map((bank: any) => {
    const ticker = bank.ticker;
    const desk = desks.get(ticker);
    if (!desk || !bank.bankBalanceSheet) return bank;
    const markUSD = bankMarkByTicker.get(ticker) ?? 0;
    if (markUSD === 0 && desk.marginReceivedUSD === 0 && desk.book.grossNotionalUSD === 0) return bank;
    // THE LIVE SHEET. This used to prefer `ctx.companyUpdates[ticker].bankBalanceSheet` — a
    // SNAPSHOT parked there by stage 08, which runs BEFORE settlement. Rebuilding from it and
    // writing the result back silently reverted every balance-sheet line settlement had moved
    // since: the whole week's deposit and reserve legs, on every bank that runs an FX desk.
    //
    // It was invisible while a stage wrote both halves of a flow together — reverting a balanced
    // pair leaves a balanced sheet. SEG split one such pair across stages (an SME loan is booked
    // in 02b and the deposit it creates is written at settlement), so the revert started keeping
    // the asset and dropping the liability: measured at exactly the week's SME origination,
    // -160.5M on the largest dealer in week 1, on 11 banks, growing every week.
    const sheet = bank.bankBalanceSheet;
    if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
    const nextSheet = {
      ...sheet,
      cashReservesUSD: sheet.cashReservesUSD + markUSD + desk.marginReceivedUSD,
      // Only the MARK is earnings. The margin is somebody else's money.
      bankEquityUSD: sheet.bankEquityUSD + markUSD,
      wholesaleFundingUSD: (sheet.wholesaleFundingUSD ?? 0) + desk.marginReceivedUSD,
      fxDealerBook: desk.book,
    };
    ctx.companyUpdates[ticker].bankBalanceSheet = nextSheet;
    // Also on the company itself: a later stage that rebuilds a sheet from `c.bankBalanceSheet`
    // rather than from companyUpdates would otherwise drop the desk's whole book.
    return { ...bank, bankBalanceSheet: nextSheet };
  });
}

/**
 * The dealer an entity faces. Not simply the biggest bank: the one with the most capacity LEFT,
 * because a desk that is full stops quoting and the flow goes elsewhere. That is how one desk
 * filling up widens the price for everyone rather than silently absorbing infinite size.
 */
function pickDealerBank(
  ctx: WeeklyStepContext, region: RegionId, desks: Map<string, DeskState>
): { ticker: string; headroomUSD: number } | null {
  let best: { ticker: string; headroomUSD: number } | null = null;
  let bestCapacity = 0;
  ctx.updatedCompanies.forEach((c: any) => {
    if (c.region !== region || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const desk = desks.get(c.ticker);
    if (!desk) return;
    const capacity = fxDeskCapacityUSD(desk.headroomUSD, desk.book);
    if (capacity > bestCapacity) { bestCapacity = capacity; best = { ticker: c.ticker, headroomUSD: desk.headroomUSD }; }
  });
  return best;
}
