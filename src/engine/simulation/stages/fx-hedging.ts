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
import { institutionProfile } from '../../../domain/institution-profiles';
import { hedgedAsFixedIncome } from '../../../domain/assets';
import { bookHeadOf } from '../../../engine2/holdings';
import { V2World } from '../../../engine2/world';
import { WeeklyStepContext } from './context';
import { pay, pendingSettlementUSD } from './settlement';
import { isActiveCompany } from '../../../domain/company';
import { invoiceCurrencyOf } from '../../../domain/invoice-currency';
import { exposureToHedgeUSD } from './corporate-financing';
import { TradeInvoice } from '../../../domain/trade-invoice';
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
import { REGION_IDS } from '../../../domain/geography';

/** What this entity holds in each foreign region, split by how much of it its mandate hedges. */
// §7.307 holdings flip: row walk on the mirror (this stage runs after the write-back).
function hedgeableExposureByRegion(v2: V2World, entity: any): Map<RegionId, number> {
  const out = new Map<RegionId, number>();
  const H = v2.holdings;
  for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
    const issuer = v2.internedStrings[H.regionRef[r]] as RegionId;
    if (!issuer || issuer === entity.region) continue;
    const type = v2.internedStrings[H.typeRef[r]];
    const ratio = type === 'EQUITY' ? equityHedgeRatioFor(entity.entityType, entity.hedgeFundStrategy)
      : hedgedAsFixedIncome(type) ? HEDGE_RATIO_FIXED_INCOME : 0;
    if (ratio <= 0) continue;
    out.set(issuer, (out.get(issuer) ?? 0) + H.qtyUSD[r] * ratio);
  }
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
    institutionProfile(entity.entityType).liabilityDriven ? HEDGE_RATIO_FIXED_INCOME : 0
  );
  return Math.max(0, annualFxSigma * 10000 * mandateShare);
}

/**
 * DER5 — A CORPORATE'S TRANSACTION FX EXPOSURE, measured off its own invoices.
 *
 * The institutions in this book hedge TRANSLATION risk: assets they hold abroad. A company's
 * exposure is a different and more immediate thing — it has delivered goods and is waiting to be
 * paid in somebody else's money, or owes in it, and between delivery and payment the amount of
 * cash that eventually moves is a currency's worth away (XB3a-5 built exactly that invoice). It
 * was measured, it sat on the books every week, and nobody could hedge it: the FX forward market
 * had one client population and it was the fund managers.
 *
 * The exposure is the outstanding invoice, in the currency it is denominated in, for whichever
 * party is not invoicing in its own money. Both sides of the same invoice can be exposed to
 * different currencies, and each hedges its own.
 */
function corporateExposureByRegion(
  invoices: TradeInvoice[], week: number
): Map<string, Map<RegionId, number>> {
  const currencyRegion = new Map<string, RegionId>();
  REGION_IDS.forEach((r) => currencyRegion.set(invoiceCurrencyOf(r), r));
  const out = new Map<string, Map<RegionId, number>>();
  const add = (ticker: string, region: RegionId, usd: number) => {
    let byRegion = out.get(ticker);
    if (!byRegion) { byRegion = new Map(); out.set(ticker, byRegion); }
    byRegion.set(region, (byRegion.get(region) ?? 0) + usd);
  };
  invoices.forEach((inv) => {
    if (inv.weekDue <= week) return; // already due; the exposure is settled, not carried
    const foreign = currencyRegion.get(inv.currency);
    if (!foreign) return;
    const usd = Math.max(0, inv.amountCurrency * inv.bookedUsdPerCurrency);
    if (!(usd > 0)) return;
    if (inv.sellerRegion !== foreign) add(inv.sellerTicker, foreign, usd);
    if (inv.buyerRegion !== foreign) add(inv.buyerTicker, foreign, usd);
  });
  return out;
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
  ctx.updatedCompanies.forEach((c: any) => {
    (c.fxForwards || []).forEach((f: FxForward) => {
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
    hedgeableExposureByRegion(ctx.v2, entity).forEach((wantUSD, issuer) => {
      const gapUSD = wantUSD - (covered.get(issuer) ?? 0);
      if (gapUSD > 1e6) gaps.set(issuer, gapUSD);
    });
    if (gaps.size > 0) gapByEntityRegion.set(entity.id, gaps);
  });

  // DER5: the CORPORATES' half of the same book. A firm hedges the invoice exposure its own
  // coverage covenant has no room for — the identical test 07i's commodity hedgers take, read
  // against a currency instead of a price — and it will pay up to what that exposure's own
  // volatility costs it, which is `entityHedgeToleranceBps` with a covenant-derived share in
  // place of a mandate one. Same auction, same basis: a corporate bidding for a hedge widens it
  // for the fund managers, which is what a shared dealer balance sheet means.
  // Last week's carried book plus what this week's trade booked — an invoice struck on Monday
  // carries the same exposure as one struck a month ago.
  const corporateExposure = corporateExposureByRegion(
    [...(state.tradeInvoices ?? []), ...ctx.tradeInvoicesBooked], week);
  const corpGapByTicker = new Map<string, Map<RegionId, number>>();
  const corpToleranceByTicker = new Map<string, Map<RegionId, number>>();
  ctx.updatedCompanies.forEach((c: any) => {
    if (c.isBankEntity || !isActiveCompany(c)) return;
    const exposure = corporateExposure.get(c.ticker);
    if (!exposure) return;
    const live: FxForward[] = (c.fxForwards || []).filter((f: FxForward) => f.maturityWeek > week);
    const covered = new Map<RegionId, number>();
    live.forEach((f) => covered.set(f.foreignRegion, (covered.get(f.foreignRegion) ?? 0) + f.notionalUSD));
    const gaps = new Map<RegionId, number>();
    const tolerances = new Map<RegionId, number>();
    exposure.forEach((exposureUSD, foreign) => {
      const horizonYears = FX_FORWARD_TENOR_WEEKS / 52;
      const oneSigma = annualSigmaFor(foreign) * Math.sqrt(horizonYears);
      const mustHedgeUSD = exposureToHedgeUSD({
        exposureUSD,
        ebitAnnualUSD: c.ebit ?? 0,
        interestAnnualUSD: (c.interestCoverage > 0 && isFinite(c.interestCoverage))
          ? Math.max(0, c.ebit ?? 0) / c.interestCoverage : 0,
        oneSigma,
      });
      if (!(mustHedgeUSD > 0)) return;
      const gapUSD = mustHedgeUSD - (covered.get(foreign) ?? 0);
      if (gapUSD <= 1e6) return;
      gaps.set(foreign, gapUSD);
      // What certainty is worth to it: the risk it removes, at the share of the exposure it has
      // no covenant room for. Same construction as the institutions' tolerance above.
      tolerances.set(foreign, annualSigmaFor(foreign) * 10000 * (mustHedgeUSD / exposureUSD));
    });
    if (gaps.size > 0) {
      corpGapByTicker.set(c.ticker, gaps);
      corpToleranceByTicker.set(c.ticker, tolerances);
    }
  });

  /** The cleared basis, and each holder's filled notional, per (holder region, foreign currency). */
  const clearedBasisBps = new Map<string, number>();
  const filledByEntityRegion = new Map<string, Map<RegionId, number>>();
  const bookKey = (holderRegion: RegionId, issuer: RegionId) => `${holderRegion}->${issuer}`;
  const holderRegions = new Set<RegionId>();
  ctx.updatedInstitutionalEntities.forEach((e: any) => holderRegions.add(e.region));
  ctx.updatedCompanies.forEach((c: any) => { if (corpGapByTicker.has(c.ticker)) holderRegions.add(c.region); });
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
    ctx.updatedCompanies.forEach((c: any) => {
      if (c.region !== holderRegion) return;
      (corpGapByTicker.get(c.ticker) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
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
      ctx.updatedCompanies.forEach((c: any) => {
        if (c.region !== holderRegion) return;
        const gapUSD = corpGapByTicker.get(c.ticker)?.get(issuer) ?? 0;
        if (!(gapUSD > 0)) return;
        const toleranceBps = corpToleranceByTicker.get(c.ticker)?.get(issuer) ?? 0;
        if (!(toleranceBps > 0)) return;
        participants.push({
          id: `CORP-${c.ticker}`,
          currentHoldingsByInstrumentId: new Map(),
          demandByInstrumentId: new Map<string, ParticipantDemand>([[instrumentId, {
            reservationStat: toleranceBps,
            maxHoldingUSD: gapUSD,
            fullSizeStatRange: toleranceBps,
          }]]),
        });
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
    const exposure = hedgeableExposureByRegion(ctx.v2, entity);
    if (live.length === 0 && exposure.size === 0) return entity;

    // Mark every live contract, then post the holder's side and remember the bank's mirror.
    let markUSD = 0;
    live.forEach((f) => {
      const rate = ctx.getFxToUsd(f.foreignRegion);
      const m = forwardMarkToMarketUSD(f, rate);
      // §7.241: pay the CHANGE in the mark since it was last settled, not the whole mark — the
      // cumulative form paid a persistent move up to tenor× over the contract's life, weekly.
      const dm = m - (f.paidMarkUSD ?? 0);
      f.paidMarkUSD = m;
      markUSD += dm;
      bankMarkByTicker.set(f.counterpartyTicker, (bankMarkByTicker.get(f.counterpartyTicker) ?? 0) - dm);
      // CASH: variation margin is a real payment between two named parties, and it is P&L for
      // both of them — so it settles as income (`BANK`), with equity the other side on the desk.
      if (Math.abs(dm) > 0) {
        pay(ctx, dm > 0
          ? { payer: { kind: 'BANK', ticker: f.counterpartyTicker }, payee: { kind: 'INSTITUTION', id: entity.id }, amountUSD: dm, reason: 'fx forward variation margin' }
          : { payer: { kind: 'INSTITUTION', id: entity.id }, payee: { kind: 'BANK', ticker: f.counterpartyTicker }, amountUSD: -dm, reason: 'fx forward variation margin' });
      }
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
      // §4.0 Tier 1 item 6 — THE BUDGET SEES WHAT IS ALREADY COMMITTED. This stage runs in the
      // close cycle, after the ETF creations and the insurers' legs have posted but before any
      // of them settle; checking raw cash spent the same dollars twice, and the margin dug the
      // fund's overdraft by exactly its own size (measured: SJMS w2, margin 455.23M, close
      // cash −455.23M — the harness's whole 'overdrawn fund' family in one line).
      const marginUSD = writableUSD * FX_INITIAL_MARGIN_RATE;
      if (marginUSD > Math.max(0, (entity.cashUSD ?? 0)
        + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id })) + markUSD) return;
      marginPostedUSD += marginUSD;
      // Initial margin is the CLIENT'S money sitting with the desk: reserves move, equity does
      // not, and the desk carries it on its funding line as the liability it is.
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id: entity.id },
        payee: { kind: 'BANK_SECURITIES', ticker: dealer.ticker },
        amountUSD: marginUSD,
        reason: 'fx forward initial margin',
      });

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

    // Both legs are instructions now; nothing here moves a balance.
    return { ...entity, fxForwards: [...live, ...newForwards] };
  });

  // ---- DER5 — THE CORPORATES' SIDE, struck against the same desks at the same cleared basis.
  // A hedged exporter genuinely feels less of a currency move than an unhedged one, which is the
  // whole point of the row; before this the invoice exposure was measured every week and no firm
  // in the model could do anything about it.
  ctx.updatedCompanies = ctx.updatedCompanies.map((c: any) => {
    if (c.isBankEntity || !isActiveCompany(c)) return c;
    const live: FxForward[] = (c.fxForwards || []).filter((f: FxForward) => f.maturityWeek > week);
    const gaps = corpGapByTicker.get(c.ticker);
    if (live.length === 0 && !gaps) return c;

    // Mark every live contract; the desk's mirror is collected exactly as the institutions' is.
    let markUSD = 0;
    live.forEach((f) => {
      const m = forwardMarkToMarketUSD(f, ctx.getFxToUsd(f.foreignRegion));
      // §7.241: the change since last settled, as on the institutional side above.
      const dm = m - (f.paidMarkUSD ?? 0);
      f.paidMarkUSD = m;
      markUSD += dm;
      bankMarkByTicker.set(f.counterpartyTicker, (bankMarkByTicker.get(f.counterpartyTicker) ?? 0) - dm);
      if (Math.abs(dm) > 0) {
        pay(ctx, dm > 0
          ? { payer: { kind: 'BANK', ticker: f.counterpartyTicker }, payee: { kind: 'COMPANY', ticker: c.ticker }, amountUSD: dm, reason: 'fx forward variation margin' }
          : { payer: { kind: 'COMPANY', ticker: c.ticker }, payee: { kind: 'BANK', ticker: f.counterpartyTicker }, amountUSD: -dm, reason: 'fx forward variation margin' });
      }
    });

    const newForwards: FxForward[] = [];
    (gaps ?? new Map<RegionId, number>()).forEach((gapUSD: number, issuer: RegionId) => {
      const dealer = pickDealerBank(ctx, c.region, desks);
      if (!dealer) return;
      const desk = desks.get(dealer.ticker)!;
      const filledUSD = filledByEntityRegion.get(`CORP-${c.ticker}`)?.get(issuer) ?? 0;
      const writableUSD = Math.min(gapUSD, filledUSD, fxDeskCapacityUSD(dealer.headroomUSD, desk.book));
      if (writableUSD <= 1e6) return;
      const basisBps = clearedBasisBps.get(bookKey(c.region, issuer)) ?? 0;
      const marginUSD = writableUSD * FX_INITIAL_MARGIN_RATE;
      // Same rule as the institutional leg above: the corporate hedger's budget nets what its
      // own week has already committed.
      if (marginUSD > Math.max(0, (c.cashUSD ?? 0)
        + pendingSettlementUSD(ctx, { kind: 'COMPANY', ticker: c.ticker })) + markUSD) return;
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: c.ticker },
        payee: { kind: 'BANK_SECURITIES', ticker: dealer.ticker },
        amountUSD: marginUSD,
        reason: 'fx forward initial margin',
      });
      desk.book.grossNotionalUSD += writableUSD;
      desk.book.netNotionalByRegion[issuer] = (desk.book.netNotionalByRegion[issuer] ?? 0) + writableUSD;
      desk.book.initialMarginHeldUSD += marginUSD;
      desk.marginReceivedUSD += marginUSD;
      newForwards.push({
        id: `${c.ticker}-FX-${issuer}-${week}`,
        holderId: c.ticker,
        counterpartyTicker: dealer.ticker,
        foreignRegion: issuer,
        contractedRate: ctx.getFxToUsd(issuer) * (1 - basisBps / 10000),
        notionalUSD: writableUSD,
        maturityWeek: week + FX_FORWARD_TENOR_WEEKS,
      });
    });

    if (live.length === (c.fxForwards || []).length && newForwards.length === 0) return c;
    return { ...c, fxForwards: [...live, ...newForwards] };
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
    const nextSheet = {
      ...sheet,
      // CASH: the desk's reserves and its P&L both arrive through the ledger, posted against the
      // named clients that sent them. What stays here is the LIABILITY for margin held — the
      // client's money is not the desk's earnings, and its funding line has to say so.
      wholesaleFundingUSD: (sheet.wholesaleFundingUSD ?? 0) + desk.marginReceivedUSD,
      fxDealerBook: desk.book,
    };
    // §7.250: the company IS the write. The channel copy this also parked in `companyUpdates`
    // was dead post-08 (only stage 08 applies it) and worse than dead: any late reader
    // preferring the channel got a snapshot missing everything settlement had moved since.
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
