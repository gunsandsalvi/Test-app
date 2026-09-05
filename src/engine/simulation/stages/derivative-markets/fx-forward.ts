/**
 * The FX forward MARKET: the hedge as a real position, struck against the book it
 * covers, with a bank on the other side, at a cross-currency basis that CLEARS. The contract
 * itself — the weekly mark, maturity, close-out — is the FX_FORWARD profile under
 * domain/derivatives/classes/fx-forward.ts, run by the one lifecycle. This market keeps what is
 * the market's: who is exposed and how much of it their mandate or covenant will not let them
 * run, what the desks can still write, and the price.
 *
 * Opens in the POST_SETTLEMENT phase — after the clearing books have settled — so it sizes the
 * hedge against what the entity ACTUALLY ended up holding abroad rather than what it intended
 * to buy. The standing book settles BEFORE the market: every live forward marks at this week's
 * rate and the delta settles as variation margin; what matured or lost a counterparty leaves;
 * the net each holder settled is what its margin budget below sees.
 *
 * Conservation: a forward is a bilateral contract, so the holder's mark and the bank's are equal
 * and opposite. Nothing is created — the pair nets to zero, which is exactly why a hedge is not
 * a subsidy and why it has to be modelled with a counterparty rather than as a yield discount.
 */

import { riskAversionOf } from '../../../../domain/preferences';
import { regionReferenceOf } from '../../../../domain/derivatives/contract';
import { bankBookAssetsLocal } from '../../../desk-register';
import type { EntityId } from '../../../../domain/ids';
import { bankPartyOf, companyParty } from '../../../../domain/party';
import { RegionId } from '../../../../types';
import { institutionProfile } from '../../../../domain/institution-profiles';
import { InstitutionalEntity } from '../../../../domain/institutions';
import { hedgedAsFixedIncome } from '../../../../domain/assets';
import { bookHeadOf } from '../../../../engine2/holdings';
import { V2World, regionOf, typeOf } from '../../../../engine2/world';
import { isActiveCompany } from '../../../../domain/company';
import { invoiceCurrencyOf } from '../../../../domain/invoice-currency';
import { exposureToHedgeLocal } from '../corporate-financing';
import { TradeInvoice } from '../../../../domain/trade-invoice';
import { HEDGE_RATIO_FIXED_INCOME, equityHedgeRatioFor, FX_FORWARD_TENOR_WEEKS, forwardStrikeOf } from '../../../../domain/derivatives/classes/fx-forward';
import { hedgeToleranceBps } from '../../../../domain/derivatives/hedging';
import { DerivativeContract, DerivativeParty, derivativePartyKey, bankPartyKey } from '../../../../domain/derivatives/contract';
import { DERIVATIVE_CLASSES, deskNotionalCapacityLocal, initialMarginRateOf, balanceSheetChargeBps } from '../../../../domain/derivatives/registry';
import { FxDealerBook, emptyFxDealerBook } from '../../../../domain/dealer-derivatives';
import { BASEL_MIN_LEVERAGE_RATIO, leverageHeadroomLocal } from '../../../macro/banking';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { fxWeeklySigma } from '../../../../domain/fx-market';
import { REGION_IDS, currencyOf } from '../../../../domain/geography';
import { initialMarginLocal, withInitialMargin, postInitialMargin, openMemberCapacity, admitContract, memberNotionalCapacityLocal, reserveMemberCapacity } from '../derivative-lifecycle';
import { derivativesBookOf, strikeDerivatives, tradeInvoicesOf } from '../../../ledger/contract-ledger';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';
import { bankReservesOf } from '../../../ledger/accounts';
import { facilityBookOf } from '../../../../engine2/tranches';

const FX = DERIVATIVE_CLASSES.FX_FORWARD;

/** What this entity holds in each foreign region, split by how much of it its mandate hedges. */
// Row walk on the mirror (this market runs after the write-back).
function hedgeableExposureByRegion(v2: V2World, entity: InstitutionalEntity): Map<RegionId, number> {
  const out = new Map<RegionId, number>();
  const H = v2.holdings;
  for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
    const issuer = regionOf(v2, H.regionRef[r]) as RegionId;
    if (!issuer || issuer === entity.region) continue;
    const type = typeOf(v2, H.typeRef[r]);
    const ratio = type === 'EQUITY' ? equityHedgeRatioFor(entity.entityType, entity.hedgeFundStrategy)
      : hedgedAsFixedIncome(type) ? HEDGE_RATIO_FIXED_INCOME : 0;
    if (ratio <= 0) continue;
    out.set(issuer, (out.get(issuer) ?? 0) + H.qtyLocal[r] * ratio);
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
 * and payment the cash that eventually moves is a currency's worth away.
 * The exposure is the outstanding invoice, in the currency it is denominated in, for whichever
 * party is not invoicing in its own money; both sides can be exposed to different currencies.
 */
function corporateExposureByRegion(
  invoices: TradeInvoice[], week: number
): Map<string, Map<RegionId, number>> {
  const currencyRegion = new Map<string, RegionId>();
  REGION_IDS.forEach((r) => currencyRegion.set(invoiceCurrencyOf(r), r));
  const out = new Map<string, Map<RegionId, number>>();
  const add = (partyId: EntityId, region: RegionId, usd: number) => {
    let byRegion = out.get(partyId);
    if (!byRegion) { byRegion = new Map(); out.set(partyId, byRegion); }
    byRegion.set(region, (byRegion.get(region) ?? 0) + usd);
  };
  invoices.forEach((inv) => {
    if (inv.weekDue <= week) return; // already due; the exposure is settled, not carried
    const foreign = currencyRegion.get(inv.currency);
    if (!foreign) return;
    const usd = Math.max(0, inv.amountCurrency * inv.bookedUsdPerCurrency);
    if (!(usd > 0)) return;
    if (inv.sellerRegion !== foreign) add(inv.sellerId, foreign, usd);
    if (inv.buyerRegion !== foreign) add(inv.buyerId, foreign, usd);
  });
  return out;
}

/** A dealer's desk for the week: its inventory, its remaining derivative budget, what arrived. */
interface DeskState {
  book: FxDealerBook;
  headroomLocal: number;
  /** PFE already charged against the one budget, EVERY class (registry.ts), advanced as it writes. */
  chargedPfeLocal: number;
  marginReceivedLocal: number;
  /** §3.17b-iv-b: what this desk charges over its funding basis, bps a year — the return it
   *  needs on the capital a forward consumes (`registry.ts:balanceSheetChargeBps`). */
  premiumBps: number;
}

const deskCapacityLocal = (d: DeskState) => deskNotionalCapacityLocal(d.headroomLocal, d.chargedPfeLocal, 'FX_FORWARD');

function runFxForwardMarket({ state, ctx, week, standing, view }: DerivativeMarketRun): void {
  const book = derivativesBookOf(ctx);

  // Every dealer's desk, opened at what its LIVE book leaves it — contracts that matured released
  // their notional and their margin in the settle before this market, which is what frees
  // capacity.
  const desks = new Map<EntityId, DeskState>();
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    // The LIVE sheet, not a snapshot some earlier stage parked in companyUpdates: the desk's
    // capacity is what the bank's book leaves it right now (see the note at the write below).
    const sheet = c.bankBalanceSheet;
    desks.set(c.id, {
      book: emptyFxDealerBook(),
      headroomLocal: leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, c.id), facilityBookOf(ctx.v2, c.id), bankBookAssetsLocal(ctx.v2, c.id)),
      chargedPfeLocal: standing.pfeChargeLocal(bankPartyKey(c.id)),
      marginReceivedLocal: 0,
      premiumBps: balanceSheetChargeBps({ capitalChargeRate: FX.pfeAddOnRate * BASEL_MIN_LEVERAGE_RATIO, requiredReturnAnnual: bankRequiredReturnAnnual(c, ctx.updatedRegions[c.region]) }),
    });
  });
  for (const c of book) {
    if (c.classId !== 'FX_FORWARD' || c.b.kind !== 'BANK') continue;
    const desk = desks.get(c.b.id);
    if (!desk) continue;
    desk.book.grossNotionalLocal += c.notional;
    const foreign = regionReferenceOf(c);
    desk.book.netNotionalByRegion[foreign] = (desk.book.netNotionalByRegion[foreign] ?? 0) + c.notional;
  }
  // The dealers a holder in each region can face, in the order the roster lists them.
  const dealerBanksByRegion = new Map<RegionId, EntityId[]>();
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c) || !desks.has(c.id)) return;
    const list = dealerBanksByRegion.get(c.region) ?? [];
    list.push(c.id);
    dealerBanksByRegion.set(c.region, list);
  });

  // ---- DER — THE CROSS-CURRENCY BASIS IS A CLEARED PRICE.
  //
  // What it replaced: `MAX_BASIS x utilization x (0.35 + 0.65 x oneWayShare)` — a formula with a
  // ceiling whose maximum was an observed crisis-era level (rule 2) and whose split was invented.
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
  const coveredLocal = (party: DerivativeParty, issuer: RegionId) =>
    standing.coverLocal('FX_FORWARD', 'a', derivativePartyKey(party), issuer);

  // §3.17-v-iii: one capacity read for the market — every holder sized to its limit at the house,
  // at the pair's margin rate, and the desks' float per pair to theirs.
  const capacity = openMemberCapacity();
  const marginRateOf = (holderRegion: RegionId, issuer: RegionId) =>
    initialMarginRateOf({ classId: 'FX_FORWARD', regionId: holderRegion, reference: { kind: 'REGION', regionId: issuer }, termKey: '', maturityWeek: week + FX_FORWARD_TENOR_WEEKS }, view);
  const gapToLimit = (party: DerivativeParty, holderRegion: RegionId, issuer: RegionId, wantLocal: number): number => {
    const rate = marginRateOf(holderRegion, issuer);
    const money = currencyOf(holderRegion);
    const gapLocal = Math.min(wantLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, rate));
    if (gapLocal > 0) reserveMemberCapacity(ctx, capacity, party, money, gapLocal * rate);
    return gapLocal;
  };

  /** This week's unhedged gap for one holder in one foreign currency. */
  const gapByEntityRegion = new Map<string, Map<RegionId, number>>();
  ctx.updatedInstitutionalEntities.forEach((entity) => {
    if (entity.isDefaulted) return;
    const gaps = new Map<RegionId, number>();
    hedgeableExposureByRegion(ctx.v2, entity).forEach((wantLocal, issuer) => {
      const gapLocal = gapToLimit({ kind: 'INSTITUTION', id: entity.id }, entity.region, issuer, wantLocal - coveredLocal({ kind: 'INSTITUTION', id: entity.id }, issuer));
      if (gapLocal > 1e6) gaps.set(issuer, gapLocal);
    });
    if (gaps.size > 0) gapByEntityRegion.set(entity.id, gaps);
  });

  // DER5: the CORPORATES' half of the same book. A firm hedges the invoice exposure its own
  // coverage covenant has no room for — the identical test the futures market's commodity
  // hedgers take, read against a currency instead of a price — and it will pay up to what that
  // exposure's own volatility costs it: the universal walk-away with a covenant-derived share in
  // place of a mandate one. Same auction, same basis: a corporate bidding for a hedge widens it
  // for the fund managers, which is what a shared dealer balance sheet means.
  const corporateExposure = corporateExposureByRegion(
    [...tradeInvoicesOf(ctx.v2), ...ctx.tradeInvoicesBooked], week);
  const corpGapByTicker = new Map<EntityId, Map<RegionId, number>>();
  const corpToleranceByTicker = new Map<EntityId, Map<RegionId, number>>();
  ctx.updatedCompanies.forEach((c) => {
    if (c.isBankEntity || !isActiveCompany(c)) return;
    const exposure = corporateExposure.get(c.ticker);
    if (!exposure) return;
    const gaps = new Map<RegionId, number>();
    const tolerances = new Map<RegionId, number>();
    exposure.forEach((exposureLocal, foreign) => {
      const horizonYears = FX_FORWARD_TENOR_WEEKS / 52;
      const oneSigma = annualSigmaFor(foreign) * Math.sqrt(horizonYears);
      const mustHedgeLocal = exposureToHedgeLocal({
        exposureLocal,
        ebitAnnualLocal: c.ebit ?? 0,
        interestAnnualLocal: (c.interestCoverage > 0 && isFinite(c.interestCoverage))
          ? Math.max(0, c.ebit ?? 0) / c.interestCoverage : 0,
        oneSigma,
        riskAversion: riskAversionOf(c.management),
      });
      if (!(mustHedgeLocal > 0)) return;
      const gapLocal = gapToLimit(companyParty(c), c.region, foreign, mustHedgeLocal - coveredLocal(companyParty(c), foreign));
      if (gapLocal <= 1e6) return;
      gaps.set(foreign, gapLocal);
      tolerances.set(foreign, hedgeToleranceBps(annualSigmaFor(foreign), mustHedgeLocal / exposureLocal));
    });
    if (gaps.size > 0) {
      corpGapByTicker.set(c.id, gaps);
      corpToleranceByTicker.set(c.id, tolerances);
    }
  });

  // ---- §3.17b-iv-b — ONE BASIS. The forward is not a book that clears a basis of its own: the
  // desk that writes it borrows the foreign money for the tenor at the FUNDING basis the swap
  // book cleared (`Region.xcsBasisBps`, zero where nobody is short the money) and prices at
  // parity plus that basis plus its own balance-sheet charge. Each holder then hedges as much of
  // its gap as that all-in basis leaves worth hedging — its schedule, full size when the hedge is
  // free and nothing at its own tolerance, the same slope the basis book used to clear against —
  // and the desks' float per pair caps the fills pro rata. What the two books cleared before
  // were two prints of one price with no arbitrage between them; the arbitrage is the desk's.
  const forwardBasisBps = new Map<string, number>();
  const filledByEntityRegion = new Map<string, Map<RegionId, number>>();
  const bookKey = (holderRegion: RegionId, issuer: RegionId) => `${holderRegion}->${issuer}`;
  const holderRegions = new Set<RegionId>();
  ctx.updatedInstitutionalEntities.forEach((e) => holderRegions.add(e.region));
  ctx.updatedCompanies.forEach((c) => { if (corpGapByTicker.has(c.id)) holderRegions.add(c.region); });
  holderRegions.forEach((holderRegion) => {
    const reg = ctx.updatedRegions[holderRegion];
    /** The desks' float for one pair, and their capacity-weighted charge over the funding basis. */
    const deskSide = (issuer: RegionId): { floatLocal: number; premiumBps: number } => {
      let floatLocal = 0, weighted = 0;
      ctx.updatedCompanies.forEach((c) => {
        if (c.region !== holderRegion || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
        const desk = desks.get(c.id);
        if (!desk) return;
        const capLocal = Math.min(deskCapacityLocal(desk), memberNotionalCapacityLocal(ctx, capacity, bankPartyOf(c.id), currencyOf(holderRegion), marginRateOf(holderRegion, issuer)));
        floatLocal += capLocal; weighted += capLocal * desk.premiumBps;
      });
      return { floatLocal, premiumBps: floatLocal > 0 ? weighted / floatLocal : 0 };
    };
    const issuers = new Set<RegionId>();
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== holderRegion) return;
      (gapByEntityRegion.get(e.id) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
    });
    ctx.updatedCompanies.forEach((c) => {
      if (c.region !== holderRegion) return;
      (corpGapByTicker.get(c.id) ?? new Map()).forEach((_g: number, issuer: RegionId) => issuers.add(issuer));
    });
    const byIssuer: Record<string, number> = {};
    issuers.forEach((issuer) => {
      const key = bookKey(holderRegion, issuer);
      const { floatLocal, premiumBps } = deskSide(issuer);
      const allInBps = (reg?.xcsBasisBps?.[issuer] ?? 0) + premiumBps;
      forwardBasisBps.set(key, allInBps);
      byIssuer[issuer] = Number(allInBps.toFixed(1));
      /** What a holder takes at this basis: its gap, scaled by how far the basis sits below its tolerance. */
      const wants: { id: string; usd: number }[] = [];
      const wanted = (id: string, gapLocal: number, toleranceBps: number) => {
        if (!(gapLocal > 0) || !(toleranceBps > 0)) return;
        const usd = gapLocal * Math.max(0, 1 - allInBps / toleranceBps);
        if (usd > 1e6) wants.push({ id, usd });
      };
      ctx.updatedInstitutionalEntities.forEach((e) => {
        if (e.region !== holderRegion) return;
        wanted(e.id, gapByEntityRegion.get(e.id)?.get(issuer) ?? 0, entityHedgeToleranceBps(e, annualSigmaFor(issuer)));
      });
      ctx.updatedCompanies.forEach((c) => {
        if (c.region !== holderRegion) return;
        wanted(`CORP-${c.ticker}`, corpGapByTicker.get(c.id)?.get(issuer) ?? 0, corpToleranceByTicker.get(c.id)?.get(issuer) ?? 0);
      });
      const totalLocal = wants.reduce((a, w) => a + w.usd, 0);
      if (!(totalLocal > 0) || !(floatLocal > 0)) return;
      const share = Math.min(1, floatLocal / totalLocal);
      wants.forEach((w) => {
        const filledLocal = w.usd * share;
        if (filledLocal <= 1e6) return;
        let byRegion = filledByEntityRegion.get(w.id);
        if (!byRegion) { byRegion = new Map(); filledByEntityRegion.set(w.id, byRegion); }
        byRegion.set(issuer, filledLocal);
      });
    });
    // Published: the basis a forward in this region costs against each money — the funding
    // basis plus the desks' charge — so the spot desks quote off it and it can be watched.
    if (reg) reg.crossCurrencyBasisBps = byIssuer;
  });

  // ---- STRIKE. Each holder re-hedges to the book that actually exists — as far as a dealer will
  // write it, at the cleared basis, and as far as the house admits it (§3.17-v-i: a member's
  // margin at the houses is limited to what its liquid cash could re-margin; the per-holder
  // budget that stood here — margin ≤ spendable cash net of the week's commitments — is that
  // rule's weaker form and is gone into it). ----
  const struck: DerivativeContract[] = [];
  // The strike admits against a FRESH read: the sizing above reserved what each holder ASKED for,
  // and what the print filled is what it posts.
  const admission = openMemberCapacity();
  const strikeFor = (
    holder: DerivativeParty, holderRegion: RegionId, participantId: string, gaps: Map<RegionId, number>
  ): void => {
    const holderKey = derivativePartyKey(holder);
    gaps.forEach((gapLocal, issuer) => {
      const dealer = pickDealerBank(dealerBanksByRegion.get(holderRegion), desks);
      if (!dealer) return;
      const desk = desks.get(dealer)!;
      const filledLocal = filledByEntityRegion.get(participantId)?.get(issuer) ?? 0;
      const writableLocal = Math.min(gapLocal, filledLocal, deskCapacityLocal(desk));
      if (writableLocal <= 1e6) return;
      const basisBps = forwardBasisBps.get(bookKey(holderRegion, issuer)) ?? 0;
      const offered: DerivativeContract = withInitialMargin({
        id: `${holderKey}-FX-${issuer}-${week}`,
        classId: 'FX_FORWARD',
        regionId: holderRegion,
        a: holder,
        b: bankPartyOf(dealer),
        notional: writableLocal,
        // §3.17b-iv-b: parity — spot carried at the holder's and the issuer's overnight rates
        // over the tenor — moved AGAINST the client by the basis, because the desk is charging
        // for the funding it does and the balance sheet it lends. Signing the basis the other
        // way hands the hedger an instant gain at inception and the dealer an instant loss on
        // every ticket — measured as bank NIM going to -2.2% before the sign was fixed.
        strike: forwardStrikeOf(ctx.getFxToUsd(issuer), view.overnightRateAnnual(holderRegion), view.overnightRateAnnual(issuer), FX_FORWARD_TENOR_WEEKS / 52, basisBps),
        reference: { kind: 'REGION', regionId: issuer },
        termKey: '',
        settledMarkLocal: 0,
        // §3.13c: the holder settles in its own money.
        currency: currencyOf(holderRegion),
        struckWeek: week,
        maturityWeek: week + FX_FORWARD_TENOR_WEEKS,
      }, view);
      // §3.17-v-i: the house admits what both members can margin — the contract as written, cut,
      // or not at all.
      const contract = admitContract(ctx, admission, offered);
      if (!contract) return;
      const writtenLocal = contract.notional;
      const marginLocal = initialMarginLocal(contract);
      // Initial margin is posted through the one path every class uses (§3.17-i, iv-a): both
      // members to the house.
      postInitialMargin(ctx, contract);
      desk.chargedPfeLocal += writtenLocal * FX.pfeAddOnRate;
      desk.book.grossNotionalLocal += writtenLocal;
      // The client SELLS the foreign currency forward to hedge a long foreign asset, so the desk
      // BUYS it: the desk is long. Signing this the other way survives only while the basis reads
      // |net| — it becomes load-bearing the moment the desk has to delta-hedge a direction.
      desk.book.netNotionalByRegion[issuer] = (desk.book.netNotionalByRegion[issuer] ?? 0) + writtenLocal;
      desk.marginReceivedLocal += marginLocal;
      struck.push(contract);
    });
  };

  ctx.updatedInstitutionalEntities.forEach((entity) => {
    const gaps = gapByEntityRegion.get(entity.id);
    if (!gaps) return;
    strikeFor({ kind: 'INSTITUTION', id: entity.id }, entity.region, entity.id, gaps);
  });
  // DER5 — the corporates' side, struck against the same desks at the same cleared basis. A
  // hedged exporter genuinely feels less of a currency move than an unhedged one.
  ctx.updatedCompanies.forEach((c) => {
    const gaps = corpGapByTicker.get(c.id);
    if (!gaps) return;
    strikeFor(companyParty(c), c.region, `CORP-${c.ticker}`, gaps);
  });
  strikeDerivatives(ctx, struck);

  // The desk offers its WHOLE net position to the FX market — it does not decide how much
  // it can work. What the market absorbs at the cleared rate is settled in stages/fx-clearing.ts,
  // and what nobody takes stays here as inventory. The banks' side: the mark legs arrived through
  // the ledger against the named clients that sent them; what is written here is the margin that
  // arrived (the client's money held — cash AND a liability, never the desk's earnings) and the
  // desk book the week left behind.
  ctx.updatedCompanies = ctx.updatedCompanies.map((bank) => {
    const desk = desks.get(bank.id);
    if (!desk || !bank.bankBalanceSheet) return bank;
    const sheet = bank.bankBalanceSheet;
    if (desk.marginReceivedLocal === 0 && desk.book.grossNotionalLocal === 0 && !sheet.fxDealerBook) return bank;
    // THE LIVE SHEET. This used to prefer `ctx.companyUpdates[ticker].bankBalanceSheet` — a
    // SNAPSHOT parked there by stage 08, which runs BEFORE settlement. Rebuilding from it and
    // writing the result back silently reverted every balance-sheet line settlement had moved
    // since — measured at exactly the week's SME origination, -160.5M on the largest dealer in
    // week 1, on 11 banks, growing every week.
    // §3.17-iv-a: the desk holds no client margin — it is the clearing house's cash, a row at
    // the banks like any depositor's (`accounts.ts:ccpDepositsAt`). The `clientMarginLocal`
    // line that stood here, first a running total nothing ever reduced and then a read of a
    // lien on the desk's securities account, is gone with it.
    const nextSheet = {
      ...sheet,
      fxDealerBook: desk.book,
    };
    // The company IS the write; the channel copy in `companyUpdates` was dead post-08.
    return { ...bank, bankBalanceSheet: nextSheet };
  });
}

/**
 * The dealer an entity faces. Not simply the biggest bank: the one with the most capacity LEFT,
 * because a desk that is full stops quoting and the flow goes elsewhere. That is how one desk
 * filling up widens the price for everyone rather than silently absorbing infinite size.
 */
function pickDealerBank(regionDealers: EntityId[] | undefined, desks: Map<EntityId, DeskState>): EntityId | null {
  let best: EntityId | null = null;
  let bestCapacity = 0;
  if (!regionDealers) return best;
  for (const ticker of regionDealers) {
    const desk = desks.get(ticker);
    if (!desk) continue;
    const capacity = deskCapacityLocal(desk);
    if (capacity > bestCapacity) { bestCapacity = capacity; best = ticker; }
  }
  return best;
}

export const FX_FORWARD_MARKET: DerivativeMarket = {
  classId: 'FX_FORWARD',
  phase: 'POST_SETTLEMENT',
  settles: 'BEFORE_MARKET',
  run: runFxForwardMarket,
};
