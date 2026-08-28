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

export function runFxHedgingStage(state: any, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const bankMarkByTicker = new Map<string, number>();

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

    // Re-hedge to the book that actually exists: top up where exposure has grown beyond what is
    // already covered, and let the rest roll off naturally at maturity.
    const coveredByRegion = new Map<RegionId, number>();
    live.forEach((f) => coveredByRegion.set(f.foreignRegion, (coveredByRegion.get(f.foreignRegion) ?? 0) + f.notionalUSD));
    const newForwards: FxForward[] = [];
    exposure.forEach((wantUSD, issuer) => {
      const gapUSD = wantUSD - (coveredByRegion.get(issuer) ?? 0);
      if (gapUSD <= 1e6) return;
      const bank = pickDealerBank(ctx, entity.region);
      if (!bank) return;
      newForwards.push({
        id: `${entity.id}-FX-${issuer}-${week}`,
        holderId: entity.id,
        counterpartyTicker: bank,
        foreignRegion: issuer,
        notionalUSD: gapUSD,
        contractedRate: ctx.getFxToUsd(issuer),
        maturityWeek: week + FX_FORWARD_TENOR_WEEKS,
      });
    });

    return {
      ...entity,
      cashUSD: (entity.cashUSD ?? 0) + markUSD,
      fxForwards: [...live, ...newForwards],
    };
  });

  // The banks' side of every contract. A dealer's book is the mirror of its clients'.
  if (bankMarkByTicker.size === 0) return;
  bankMarkByTicker.forEach((markUSD, ticker) => {
    const bank = ctx.updatedCompanies.find((c: any) => c.ticker === ticker);
    if (!bank || !bank.bankBalanceSheet) return;
    const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
    if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
    ctx.companyUpdates[ticker].bankBalanceSheet = {
      ...sheet,
      cashReservesUSD: sheet.cashReservesUSD + markUSD,
      bankEquityUSD: sheet.bankEquityUSD + markUSD,
    };
  });
}

/** The dealer an entity faces: the largest bank in its own region, which is who it banks with. */
function pickDealerBank(ctx: WeeklyStepContext, region: RegionId): string | null {
  let best: string | null = null;
  let bestShare = -1;
  ctx.updatedCompanies.forEach((c: any) => {
    if (c.region !== region || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const share = c.bankMarketShare ?? 0;
    if (share > bestShare) { bestShare = share; best = c.ticker; }
  });
  return best;
}
