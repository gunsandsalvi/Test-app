/**
 * XB2/DER — the FX forward MARKET: the hedge as a real position, struck against the book it
 * covers, with a bank on the other side, at a cross-currency basis that CLEARS. The contract
 * itself — the weekly mark, maturity, close-out — is the FX_FORWARD profile under
 * domain/derivatives/classes/fx-forward.ts, run by the one lifecycle. This stage keeps what is
 * the market's: who is exposed and how much of it their mandate or covenant will not let them
 * run, what the desks can still write, and the price.
 *
 * Runs after the clearing books have settled, so it sizes the hedge against what the entity
 * ACTUALLY ended up holding abroad rather than what it intended to buy.
 *
 * Conservation: a forward is a bilateral contract, so the holder's mark and the bank's are equal
 * and opposite. Nothing is created — the pair nets to zero, which is exactly why a hedge is not
 * a subsidy and why it has to be modelled with a counterparty rather than as a yield discount.
 */

import { riskAversionOf } from '../../../domain/preferences';
import { GameState, RegionId } from '../../../types';
import { institutionProfile } from '../../../domain/institution-profiles';
import { InstitutionalEntity } from '../../../domain/institutions';
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
  HEDGE_RATIO_FIXED_INCOME, equityHedgeRatioFor, FX_FORWARD_TENOR_WEEKS,
} from '../../../domain/derivatives/classes/fx-forward';
import { hedgeToleranceBps } from '../../../domain/derivatives/hedging';
import { DerivativeContract, DerivativeParty, derivativePartyKey, standingCoverUSD } from '../../../domain/derivatives/contract';
import { DERIVATIVE_CLASSES, deskNotionalCapacityUSD, standingPfeChargeUSD } from '../../../domain/derivatives/registry';
import { FxDealerBook, emptyFxDealerBook } from '../../../domain/dealer-derivatives';
import { leverageHeadroomUSD } from '../../macro/banking';
import { fxWeeklySigma } from '../../../domain/fx-market';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { REGION_IDS } from '../../../domain/geography';
import { buildDerivativeMarketView, derivativesBookOf, initialMarginUSD, settleDerivativeClass, strikeDerivatives } from './derivative-lifecycle';

const FX = DERIVATIVE_CLASSES.FX_FORWARD;

/** What this entity holds in each foreign region, split by how much of it its mandate hedges. */
// §7.307 holdings flip: row walk on the mirror (this stage runs after the write-back).
function hedgeableExposureByRegion(v2: V2World, entity: InstitutionalEntity): Map<RegionId, number> {
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
 * How wide a basis an institution will pay before it carries the currency risk instead: the
 * universal walk-away (domain/derivatives/hedging.ts) at the share its MANDATE hedges (HF4). A
 * liability-driven book pays close to a full sigma; a macro fund, for which the currency IS the
 * trade, pays nothing. This is what makes the demand curve slope.
 */
function entityHedgeToleranceBps(entity: InstitutionalEntity, annualFxSigma: number): number {
  const mandateShare = Math.max(
    equityHedgeRatioFor(entity.entityType, entity.hedgeFundStrategy),
    institutionProfile(entity.entityType).liabilityDriven ? HEDGE_RATIO_FIXED_INCOME : 0
  );
  return hedgeToleranceBps(annualFxSigma, mandateShare);
}

/**
 * DER5 — A CORPORATE'S TRANSACTION FX EXPOSURE, measured off its own invoices: it has delivered
 * goods and is waiting to be paid in somebody else's money, or owes in it, and between delivery
 * and payment the cash that eventually moves is a currency's worth away (XB3a-5's invoice).
 * The exposure is the outstanding invoice, in the currency it is denominated in, for whichever
 * party is not invoicing in its own money; both sides can be exposed to different currencies.
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

/** A dealer's desk for the week: its inventory, its remaining derivative budget, what arrived. */
interface DeskState {
  book: FxDealerBook;
  headroomUSD: number;
  /** PFE already charged against the one budget, EVERY class (registry.ts), advanced as it writes. */
  chargedPfeUSD: number;
  marginReceivedUSD: number;
}

const deskCapacityUSD = (d: DeskState) => deskNotionalCapacityUSD(d.headroomUSD, d.chargedPfeUSD, 'FX_FORWARD');

export function runFxHedgingStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;

  // ---- The standing book: every live forward marks at this week's rate and the delta settles
  // as variation margin; what matured or lost a counterparty leaves. One lifecycle, this
  // class's turn. The net each holder settled here is what its margin budget below sees. ----
  const settledNetByParty = settleDerivativeClass(ctx, state, 'FX_FORWARD', buildDerivativeMarketView(ctx));
  const book = derivativesBookOf(ctx, state);

  // Every dealer's desk, opened at what its LIVE book leaves it — contracts that matured released
  // their notional and their margin in the settle above, which is what frees capacity.
  const desks = new Map<string, DeskState>();
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    // The LIVE sheet, not a snapshot some earlier stage parked in companyUpdates: the desk's
    // capacity is what the bank's book leaves it right now (see the note at the write below).
    const sheet = c.bankBalanceSheet;
    desks.set(c.ticker, {
      book: emptyFxDealerBook(),
      headroomUSD: leverageHeadroomUSD(sheet),
      chargedPfeUSD: standingPfeChargeUSD(book, `BANK:${c.ticker}`, week),
      marginReceivedUSD: 0,
    });
  });
  for (const c of book) {
    if (c.classId !== 'FX_FORWARD' || c.b.kind !== 'BANK') continue;
    const desk = desks.get(c.b.ticker);
    if (!desk) continue;
    desk.book.grossNotionalUSD += c.notionalUSD;
    desk.book.netNotionalByRegion[c.referenceId] = (desk.book.netNotionalByRegion[c.referenceId] ?? 0) + c.notionalUSD;
    desk.book.initialMarginHeldUSD += initialMarginUSD(c);
  }

  // ---- DER — THE CROSS-CURRENCY BASIS IS A CLEARED PRICE.
  //
  // What it replaced: `MAX_BASIS x utilization x (0.35 + 0.65 x oneWayShare)` — a formula with a
  // ceiling whose maximum was an observed crisis-era level (rule 4) and whose split was invented.
  // The FLOAT is what the region's desks can still write — real supply, bounded by real balance
  // sheets. The PARTICIPANTS are the hedgers, whose schedules slope the right way by construction:
  // full size when the hedge is free, nothing at all once the basis passes what the risk is worth
  // to them. Where demand is thin the basis clears near zero; where it exceeds what the desks can
  // carry, it rises until enough hedgers walk — the post-2008 mechanism the formula imitated.
  const annualSigmaByRegion = new Map<RegionId, number>();
  (ctx.updatedFxPairs ?? []).forEach((fx) => {
    const sigma = fxWeeklySigma(fx.historicalRates) * Math.sqrt(52);
    [fx.base, fx.quote].forEach((r: RegionId) => {
      if (r === 'USA') return;
      annualSigmaByRegion.set(r, Math.max(annualSigmaByRegion.get(r) ?? 0, sigma));
    });
  });
  const annualSigmaFor = (r: RegionId) => annualSigmaByRegion.get(r) ?? 0.10;
  const coveredUSD = (party: DerivativeParty, issuer: RegionId) =>
    standingCoverUSD(book, 'FX_FORWARD', 'a', derivativePartyKey(party), week, issuer);

  /** This week's unhedged gap for one holder in one foreign currency. */
  const gapByEntityRegion = new Map<string, Map<RegionId, number>>();
  ctx.updatedInstitutionalEntities.forEach((entity) => {
    if (entity.isDefaulted) return;
    const gaps = new Map<RegionId, number>();
    hedgeableExposureByRegion(ctx.v2, entity).forEach((wantUSD, issuer) => {
      const gapUSD = wantUSD - coveredUSD({ kind: 'INSTITUTION', id: entity.id }, issuer);
      if (gapUSD > 1e6) gaps.set(issuer, gapUSD);
    });
    if (gaps.size > 0) gapByEntityRegion.set(entity.id, gaps);
  });

  // DER5: the CORPORATES' half of the same book. A firm hedges the invoice exposure its own
  // coverage covenant has no room for — the identical test 07i's commodity hedgers take, read
  // against a currency instead of a price — and it will pay up to what that exposure's own
  // volatility costs it: the universal walk-away with a covenant-derived share in place of a
  // mandate one. Same auction, same basis: a corporate bidding for a hedge widens it for the
  // fund managers, which is what a shared dealer balance sheet means.
  const corporateExposure = corporateExposureByRegion(
    [...(state.tradeInvoices ?? []), ...ctx.tradeInvoicesBooked], week);
  const corpGapByTicker = new Map<string, Map<RegionId, number>>();
  const corpToleranceByTicker = new Map<string, Map<RegionId, number>>();
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity || !isActiveCompany(c)) return;
    const exposure = corporateExposure.get(c.ticker);
    if (!exposure) return;
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
        riskAversion: riskAversionOf(c.management),
      });
      if (!(mustHedgeUSD > 0)) return;
      const gapUSD = mustHedgeUSD - coveredUSD({ kind: 'COMPANY', ticker: c.ticker }, foreign);
      if (gapUSD <= 1e6) return;
      gaps.set(foreign, gapUSD);
      tolerances.set(foreign, hedgeToleranceBps(annualSigmaFor(foreign), mustHedgeUSD / exposureUSD));
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
  ctx.updatedInstitutionalEntities.forEach((e) => holderRegions.add(e.region));
  ctx.updatedCompanies.forEach((c) => { if (corpGapByTicker.has(c.ticker)) holderRegions.add(c.region); });
  holderRegions.forEach((holderRegion) => {
    let capacityUSD = 0;
    ctx.updatedCompanies.forEach((c) => {
      if (c.region !== holderRegion || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
      const desk = desks.get(c.ticker);
      if (desk) capacityUSD += deskCapacityUSD(desk);
    });
    const issuers = new Set<RegionId>();
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== holderRegion) return;
      (gapByEntityRegion.get(e.id) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
    });
    ctx.updatedCompanies.forEach((c) => {
      if (c.region !== holderRegion) return;
      (corpGapByTicker.get(c.ticker) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
    });
    issuers.forEach((issuer) => {
      const key = bookKey(holderRegion, issuer);
      const instrumentId = `XCS-${key}`;
      const participants: ClearingParticipant[] = [];
      ctx.updatedInstitutionalEntities.forEach((e) => {
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
      ctx.updatedCompanies.forEach((c) => {
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

  // ---- STRIKE. Each holder re-hedges to the book that actually exists — as far as a dealer will
  // write it, at the cleared basis, posting the class's initial margin from a budget that nets
  // what its own week has already committed (§4.0 Tier 1 item 6: checking raw cash spent the same
  // dollars twice and dug the fund's overdraft by exactly the margin's size). ----
  const struck: DerivativeContract[] = [];
  const strikeFor = (
    holder: DerivativeParty, holderRegion: RegionId, participantId: string, gaps: Map<RegionId, number>,
    cashUSD: number
  ): void => {
    const holderKey = derivativePartyKey(holder);
    let budgetUSD = Math.max(0, cashUSD + pendingSettlementUSD(ctx, holder)) + (settledNetByParty.get(holderKey) ?? 0);
    gaps.forEach((gapUSD, issuer) => {
      const dealer = pickDealerBank(ctx, holderRegion, desks);
      if (!dealer) return;
      const desk = desks.get(dealer)!;
      const filledUSD = filledByEntityRegion.get(participantId)?.get(issuer) ?? 0;
      const writableUSD = Math.min(gapUSD, filledUSD, deskCapacityUSD(desk));
      if (writableUSD <= 1e6) return;
      const basisBps = clearedBasisBps.get(bookKey(holderRegion, issuer)) ?? 0;
      const contract: DerivativeContract = {
        id: `${holderKey}-FX-${issuer}-${week}`,
        classId: 'FX_FORWARD',
        regionId: holderRegion,
        a: holder,
        b: { kind: 'BANK', ticker: dealer },
        notionalUSD: writableUSD,
        // The traded rate, not the theoretical one: CIP moved AGAINST the client by the desk's
        // basis, because the desk is charging for its balance sheet. Signing this the other way
        // hands the hedger an instant gain at inception and the dealer an instant loss on every
        // ticket — measured as bank NIM going to -2.2% before the sign was fixed.
        strike: ctx.getFxToUsd(issuer) * (1 - basisBps / 10000),
        referenceId: issuer,
        termKey: '',
        settledMarkUSD: 0,
        struckWeek: week,
        maturityWeek: week + FX_FORWARD_TENOR_WEEKS,
      };
      const marginUSD = initialMarginUSD(contract);
      if (marginUSD > budgetUSD) return;
      budgetUSD -= marginUSD;
      // Initial margin is the CLIENT'S money sitting with the desk: reserves move, equity does
      // not, and the desk carries it on its funding line as the liability it is.
      if (marginUSD > 0) {
        pay(ctx, { payer: holder, payee: { kind: 'BANK_SECURITIES', ticker: dealer }, amountUSD: marginUSD, reason: 'fx forward initial margin' });
      }
      desk.chargedPfeUSD += writableUSD * FX.pfeAddOnRate;
      desk.book.grossNotionalUSD += writableUSD;
      // The client SELLS the foreign currency forward to hedge a long foreign asset, so the desk
      // BUYS it: the desk is long. Signing this the other way survives only while the basis reads
      // |net| — it becomes load-bearing the moment the desk has to delta-hedge a direction.
      desk.book.netNotionalByRegion[issuer] = (desk.book.netNotionalByRegion[issuer] ?? 0) + writableUSD;
      desk.book.initialMarginHeldUSD += marginUSD;
      desk.marginReceivedUSD += marginUSD;
      struck.push(contract);
    });
  };

  ctx.updatedInstitutionalEntities.forEach((entity) => {
    const gaps = gapByEntityRegion.get(entity.id);
    if (!gaps) return;
    strikeFor({ kind: 'INSTITUTION', id: entity.id }, entity.region, entity.id, gaps, entity.cashUSD ?? 0);
  });
  // DER5 — the corporates' side, struck against the same desks at the same cleared basis. A
  // hedged exporter genuinely feels less of a currency move than an unhedged one.
  ctx.updatedCompanies.forEach((c) => {
    const gaps = corpGapByTicker.get(c.ticker);
    if (!gaps) return;
    strikeFor({ kind: 'COMPANY', ticker: c.ticker }, c.region, `CORP-${c.ticker}`, gaps, c.cash ?? 0);
  });
  strikeDerivatives(ctx, state, struck);

  // XB2f: the desk offers its WHOLE net position to the FX market — it does not decide how much
  // it can work. What the market absorbs at the cleared rate is settled in stages/fx-clearing.ts,
  // and what nobody takes stays here as inventory. The banks' side: the mark legs arrived through
  // the ledger against the named clients that sent them; what is written here is the margin that
  // arrived (the client's money held — cash AND a liability, never the desk's earnings) and the
  // desk book the week left behind.
  ctx.updatedCompanies = ctx.updatedCompanies.map((bank) => {
    const desk = desks.get(bank.ticker);
    if (!desk || !bank.bankBalanceSheet) return bank;
    const sheet = bank.bankBalanceSheet;
    if (desk.marginReceivedUSD === 0 && desk.book.grossNotionalUSD === 0 && !sheet.fxDealerBook) return bank;
    // THE LIVE SHEET. This used to prefer `ctx.companyUpdates[ticker].bankBalanceSheet` — a
    // SNAPSHOT parked there by stage 08, which runs BEFORE settlement. Rebuilding from it and
    // writing the result back silently reverted every balance-sheet line settlement had moved
    // since — measured at exactly the week's SME origination, -160.5M on the largest dealer in
    // week 1, on 11 banks, growing every week.
    const nextSheet = {
      ...sheet,
      wholesaleFundingUSD: (sheet.wholesaleFundingUSD ?? 0) + desk.marginReceivedUSD,
      fxDealerBook: desk.book,
    };
    // §7.250: the company IS the write; the channel copy in `companyUpdates` was dead post-08.
    return { ...bank, bankBalanceSheet: nextSheet };
  });
}

/**
 * The dealer an entity faces. Not simply the biggest bank: the one with the most capacity LEFT,
 * because a desk that is full stops quoting and the flow goes elsewhere. That is how one desk
 * filling up widens the price for everyone rather than silently absorbing infinite size.
 */
function pickDealerBank(ctx: WeeklyStepContext, region: RegionId, desks: Map<string, DeskState>): string | null {
  let best: string | null = null;
  let bestCapacity = 0;
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== region || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const desk = desks.get(c.ticker);
    if (!desk) return;
    const capacity = deskCapacityUSD(desk);
    if (capacity > bestCapacity) { bestCapacity = capacity; best = c.ticker; }
  });
  return best;
}
