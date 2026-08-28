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
  FxForward, HEDGE_RATIO_FIXED_INCOME, HEDGE_RATIO_EQUITY, FX_FORWARD_TENOR_WEEKS,
  forwardMarkToMarketUSD,
} from '../../../domain/fx-hedging';
import {
  FxDealerBook, emptyFxDealerBook, fxDeskCapacityUSD, crossCurrencyBasisBps,
  FX_INITIAL_MARGIN_RATE,
} from '../../../domain/dealer-derivatives';
import { leverageHeadroomUSD } from '../../macro/banking';

/** What this entity holds in each foreign region, split by how much of it its mandate hedges. */
function hedgeableExposureByRegion(entity: any): Map<RegionId, number> {
  const out = new Map<RegionId, number>();
  (entity.itemizedHoldings || []).forEach((h: any) => {
    const issuer = h.issuerRegion as RegionId;
    if (!issuer || issuer === entity.region) return;
    const ratio = h.instrumentType === 'EQUITY' ? HEDGE_RATIO_EQUITY
      : (h.instrumentType === 'GOV_BOND' || h.instrumentType === 'CORP_BOND' || h.instrumentType === 'LEVERAGED_LOAN')
        ? HEDGE_RATIO_FIXED_INCOME : 0;
    if (ratio <= 0) return;
    out.set(issuer, (out.get(issuer) ?? 0) + (h.quantityOrNotionalUSD ?? 0) * ratio);
  });
  return out;
}

/**
 * How wide a basis a hedger will pay before it gives up and carries the currency risk instead.
 * A liability-driven book has almost no choice — its regulator prices the mismatch — while a
 * hedge fund treats the hedge as a trade and walks when it is expensive. This is what makes the
 * DEMAND curve slope: at a wide enough basis, some hedgers stop hedging.
 */
function entityHedgeToleranceBps(entity: any): number {
  switch (entity.entityType) {
    case 'INSURER': return 220;
    case 'PENSION_FUND': return 180;
    case 'ASSET_MANAGER': return 90;
    case 'HEDGE_FUND': return 45;
    default: return 90;
  }
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
    const sheet = ctx.companyUpdates[c.ticker]?.bankBalanceSheet ?? c.bankBalanceSheet;
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
      const dealer = pickDealerBank(ctx, entity.region, desks);
      if (!dealer) return;
      const desk = desks.get(dealer.ticker)!;

      // Supply: what this desk can still write. A full desk quotes nothing, which is why a hedge
      // can be unavailable at any price — the thing an infinite-supply derivative cannot express.
      const writableUSD = Math.min(gapUSD, fxDeskCapacityUSD(dealer.headroomUSD, desk.book));
      if (writableUSD <= 1e6) return;

      // Price: the cross-currency basis this desk's utilization implies. Internalized two-way
      // flow is nearly free; a one-way book has to be carried and delta-hedged, and costs.
      const basisBps = crossCurrencyBasisBps({
        grossNotionalUSD: desk.book.grossNotionalUSD,
        netNotionalUSD: desk.book.netNotionalByRegion[issuer] ?? 0,
        capacityUSD: fxDeskCapacityUSD(dealer.headroomUSD, desk.book),
      });

      // Demand: the hedger walks if the basis costs more than the mismatch is worth to it.
      if (basisBps > entityHedgeToleranceBps(entity)) return;

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
    const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
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
