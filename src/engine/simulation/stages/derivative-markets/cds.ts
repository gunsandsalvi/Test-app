/**
 * CRD/DER2 — the single-name CDS MARKET, cleared on the same engine as every other book. The
 * contract itself — premium, credit event, close-out — is the CDS profile under
 * domain/derivatives/classes/cds.ts, run by the one lifecycle. This market keeps what is the
 * market's: who needs protection, who will write it, and the print.
 *
 * §3.17c — TWO REASONS TO BUY, AND A TWO-WAY QUOTE. The float this auction prices is the
 * PROTECTION SOMEBODY NEEDS: the exposure a balance sheet does not let its owner carry against one
 * name, measured off its own book against the large-exposure rule — a bank's loans, its desk's
 * paper and the protection it has written; a firm's receivables on a buyer and the contracts it
 * has to deliver on. The participants quote BOTH WAYS at what the same credit costs them to carry
 * — the arithmetic the corporate bond book already uses, because it is the same risk — writing
 * above their reservation and buying below it, which is a view: two participants with different
 * costs of capital disagree, and the print is where they meet rather than a hedger's internal
 * transfer. What comes out is the CDS spread, and what comes out of comparing it to the issuer's
 * cleared cash OAS is the BASIS.
 *
 * Opens in the CLEARING phase after 07b (the cleared OAS every schedule here reads) and before
 * settlement, so the week's premiums move real money between named parties. The standing book
 * settles BEFORE the market: this week's premium, any credit event a reference default triggered,
 * any counterparty that died. A name's book is where the name is: a holder anywhere hedges a
 * reference in the reference's own region and money.
 */

import { bankReservesOf, cashOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal, deskRowsOf } from '../../../desk-register';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { partyFromKey } from '../../../ledger/party';
import { bankParty, bankPartyOf, companyParty } from '../../../../domain/party';
import { RegionId } from '../../../../types';
import { ensureV2 } from '../../../../engine2/world';
import { institutionProfile } from '../../../../domain/institution-profiles';
import { CDS_TENORS, CDS_TENOR_YEARS, CDS_BENCHMARK_TENOR, cdsTenorWeeksOf, nearestCdsTenor, protectionNeedLocal, twoWayProtectionQuote, type CdsTenorKey } from '../../../../domain/derivatives/classes/cds';
import { indexHolderQuote } from '../../../../domain/derivatives/classes/cds-index';
import { DerivativeContract, DerivativeParty, bankPartyKey, derivativePartyKey } from '../../../../domain/derivatives/contract';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, takePrint } from '../financial-clearing-engine';
import { isActiveCompany, type Company } from '../../../../domain/company';
import { computeAnnualDefaultProbability, creditRecoveryRate } from '../shared-helpers';
import { computeReservationSpreadBps, spreadRiskCapitalChargeRate, entityRequiredReturn, fullSizeSpreadRangeBpsOf } from '../asset-allocation';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { leverageHeadroomLocal } from '../../../macro/banking';
import { REGION_IDS, currencyOf, type CurrencyCode } from '../../../../domain/geography';
import { convert } from '../../../../domain/currency';
import { strikeDerivatives, tradeInvoicesOf } from '../../../ledger/contract-ledger';
import { forEachContract } from '../../../../engine2/contracts';
import { companyBookEquityLocal } from '../../../equity-valuation';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal, reserveMemberCapacity } from '../derivative-lifecycle';
import { MEASURE_WINDOW_WEEKS } from '../../../../domain/volatility';
import { institutionTotalAssetsLocal } from '../institutional-balance-sheet';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';
import { facilityBookOf, facilityRowsOf, isTrancheId, issuerIdOf, ladderTotalLocal, trancheRowOf } from '../../../../engine2/tranches';
import { issuerSpreadAtOnCurve } from '../../../credit-price';


import { cdsInstrumentId } from '../../../../domain/instrument-keys';
import { registerBook } from '../../../ledger/instrument-ledger';
import type { InstrumentId, EntityId } from '../../../../domain/ids';
import { asEntityId } from '../../../../domain/ids';
import { asTicker } from '../../../../domain/ids';
import type { Ticker } from '../../../../domain/ids';

/** One holder's need on one name, in the name's own money, at the tenor its exposure's life is nearest. */
interface ProtectionNeed { party: DerivativeParty; usd: number; termKey: CdsTenorKey }
/** An exposure to one name: its size, and its size-weighted remaining life (§3.17d-iii). */
interface Exposure { local: number; weeksLocal: number }

function runCdsMarket({ state, ctx, week, standing, view }: DerivativeMarketRun): void {
  const v2cds = ensureV2(state);
  // §3.13-BOOK (c-then-2/3b): the ONE index — the two-array union it replaces was a strict subset
  // of `updatedCompanies` — and the seat→party crossing built off it once per session.
  const cdsIndex = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const companyById = cdsIndex.companyById;
  const bankIdOfTicker = (t: Ticker) => cdsIndex.companyByTicker.get(t)?.id;
  // §3.17-v-iii: one capacity read for the market — every member sized to its limit at the house.
  const capacity = openMemberCapacity();
  /** What protection on this name posts per unit of notional, at this week's strike shape. */
  const marginRateOf = (regionId: RegionId, issuerId: EntityId, termKey: CdsTenorKey) => initialMarginRateOf({ classId: 'CDS', regionId, reference: { kind: 'ISSUER', issuerId }, termKey, maturityWeek: week + cdsTenorWeeksOf(termKey) }, view);

  // ---- 1. WHO NEEDS PROTECTION, and how much. Exposure to one name beyond what the holder's
  // own capital lets it carry against a single counterparty. This is the decision
  // `09-concentration-risk.ts`'s measurement never had: above the limit the position is not one
  // the holder is allowed — or can afford — to keep, so the excess is laid off rather than
  // preferred away. Sized here for every holder in the world, routed to the reference's region. ----
  const needByRegion = new Map<RegionId, Map<EntityId, ProtectionNeed[]>>();
  const addNeeds = (holder: Company, party: DerivativeParty, equityHomeLocal: number, exposureByIssuer: Map<EntityId, Exposure>) => {
    const key = derivativePartyKey(party);
    exposureByIssuer.forEach(({ local: exposureLocal, weeksLocal }, issuerId) => {
      const issuer = companyById.get(issuerId);
      if (!issuer || issuer.id === holder.id || !isActiveCompany(issuer)) return;
      const regionId = issuer.region as RegionId;
      const money = currencyOf(regionId);
      const wantLocal = protectionNeedLocal({
        exposureLocal,
        equityLocal: convert(equityHomeLocal, currencyOf(holder.region as RegionId), money, ctx.fx),
        alreadyHedgedLocal: standing.coverLocal('CDS', 'a', key, issuerId),
      });
      // §3.17d-iii: the hedge is struck at the tenor nearest the exposure's own remaining life.
      const termKey = nearestCdsTenor(weeksLocal / Math.max(1e-9, exposureLocal));
      // §3.17-v-iii: no more than the member can margin at the house, reserved as it is sized.
      const rate = marginRateOf(regionId, issuerId, termKey);
      const needLocal = Math.min(wantLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, rate));
      if (needLocal <= 1) return;
      reserveMemberCapacity(ctx, capacity, party, money, needLocal * rate);
      const byIssuer = needByRegion.get(regionId) ?? new Map<EntityId, ProtectionNeed[]>();
      const list = byIssuer.get(issuerId) ?? [];
      list.push({ party, usd: needLocal, termKey });
      byIssuer.set(issuerId, list);
      needByRegion.set(regionId, byIssuer);
    });
  };
  const addExposure = (m: Map<EntityId, Exposure>, issuerId: EntityId, local: number, weeksRemaining: number) => {
    if (!(local > 0)) return;
    const e = m.get(issuerId) ?? { local: 0, weeksLocal: 0 };
    e.local += local; e.weeksLocal += local * Math.max(0, weeksRemaining);
    m.set(issuerId, e);
  };

  // (a) THE BANKS. A name's exposure is the loan book (step 10: the facility rows on its ladder),
  // the desk's paper on the same name, and the protection the desk has written on it — selling
  // protection is the same concentration as making the loan.
  const banks = ctx.prevActiveFirms.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
  banks.forEach((bank) => {
    const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
    const exposureByIssuer = new Map<EntityId, Exposure>();
    facilityRowsOf(ctx.v2, bank.id).forEach((l) => addExposure(exposureByIssuer, l.borrowerId, l.principalLocal, l.maturityWeek - week));
    deskRowsOf(ctx.v2, bank.id).forEach((row) => {
      if (!isTrancheId(ctx.v2, row.instrumentId)) return;
      const r = trancheRowOf(ctx.v2, row.instrumentId);
      addExposure(exposureByIssuer, issuerIdOf(ctx.v2, row.instrumentId), row.inventoryLocal, r === undefined ? 0 : ctx.v2.tranches.maturityWeek[r] - week);
    });
    const written = standing.coverLocal('CDS', 'b', bankPartyKey(bank.id));
    if (written > 0) {
      companyById.forEach((c) => CDS_TENORS.forEach((tenor) => addExposure(exposureByIssuer, c.id, standing.coverLocal('CDS', 'b', bankPartyKey(bank.id), c.id, tenor), cdsTenorWeeksOf(tenor))));
    }
    addNeeds(bank, bankParty(bank), sheet.bankEquityLocal, exposureByIssuer);
  });

  // (b) THE FIRMS. A receivable on a named buyer is credit risk on that buyer; a supply contract is
  // the receivables still to come, and what a customer has paid ahead is its claim on the
  // supplier. The lane already holds every one of these as an object; this is what prices them.
  const firmExposure = new Map<EntityId, Map<EntityId, Exposure>>();
  const firmExposureOf = (holderId: EntityId) => { let m = firmExposure.get(holderId); if (!m) { m = new Map(); firmExposure.set(holderId, m); } return m; };
  tradeInvoicesOf(ctx.v2).forEach((inv) => {
    const usd = inv.amountCurrency * inv.bookedUsdPerCurrency;
    addExposure(firmExposureOf(inv.sellerId), inv.buyerId, convert(usd, 'USD', currencyOf(inv.buyerRegion), ctx.fx), inv.weekDue - week);
  });
  const CT = ctx.v2.contracts;
  REGION_IDS.forEach((customerRegion) => {
    forEachContract(ctx.v2, customerRegion, (row, supplierKey, customerKey) => {
      const supplier = partyFromKey(supplierKey);
      const customer = partyFromKey(customerKey);
      if (supplier?.kind !== 'COMPANY' || customer?.kind !== 'COMPANY') return;
      addExposure(firmExposureOf(supplier.id), customer.id, CT.qtyPerWeek[row] * CT.priceLocal[row] * CT.weeksRemaining[row], CT.weeksRemaining[row]);
      const supplierRegion = companyById.get(supplier.id)?.region as RegionId | undefined;
      if (supplierRegion) addExposure(firmExposureOf(customer.id), supplier.id, convert(CT.prepaidLocal[row], currencyOf(customerRegion), currencyOf(supplierRegion), ctx.fx), CT.weeksRemaining[row]);
    });
  });
  firmExposure.forEach((exposureByIssuer, holderId) => {
    const firm = companyById.get(holderId);
    if (!firm || firm.isBankEntity || !isActiveCompany(firm)) return;
    const equityLocal = companyBookEquityLocal(firm, cashOf(ctx.v2, firm), ladderTotalLocal(ctx.v2, firm.id));
    addNeeds(firm, companyParty(firm), equityLocal, exposureByIssuer);
  });

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const recoveryRate = creditRecoveryRate(reg);
    const money: CurrencyCode = currencyOf(regionId);
    /**
     * §3.13 — THE CASH LEG OF THE BASIS. Protection on a name at five years is comparable to that
     * name's own five-year CASH paper and to nothing else, so the leg is a point on the issuer's
     * own credit curve read at THIS contract's tenor. `undefined` means the issuer has printed no
     * bond of any maturity, and then there is no basis to speak of rather than a basis against a
     * number nobody traded.
     */
    const cashSpreadBpsOf = (c: { id: EntityId; region: string }, tenor: CdsTenorKey): number | undefined =>
      issuerSpreadAtOnCurve(ctx.v2, ctx.updatedRegions[c.region as RegionId], c.id,
        ctx.nextWeek, CDS_TENOR_YEARS[tenor])?.spreadBps;

    const hedgeDemandByIssuer = needByRegion.get(regionId) ?? new Map<EntityId, ProtectionNeed[]>();

    // ---- 2. The book. One instrument per reference entity AND TENOR (§3.17d-iii: the curve):
    // every name somebody needs protection on this week, and every name this market has printed
    // before — a made name stays quoted two ways at every tenor whether or not anyone has to lay
    // it off this week, which is what makes its spread a price rather than a hedger's transfer. ----
    const referenceIds = new Set<EntityId>(hedgeDemandByIssuer.keys());
    Object.keys(reg.cdsSpreadHistoryByIssuer ?? {}).forEach((id) => referenceIds.add(asEntityId(id)));
    const referenceIssuers = Array.from(referenceIds)
      .map((id) => companyById.get(id))
      .filter((c): c is Company => !!c && c.region === regionId && isActiveCompany(c));
    if (referenceIssuers.length === 0) return;
    const regionBanks = banks.filter((c) => c.region === regionId);
    const pdByIssuerId = new Map(referenceIssuers.map((c) => [c.id, computeAnnualDefaultProbability(v2cds, c)]));

    // ---- 3. THE QUOTES. Carrying the credit unfunded costs a participant its expected loss plus
    // the capital the position consumes at its own required return — the identical arithmetic the
    // corporate bond book prices with, because it is the identical risk. What differs is the
    // FUNDING, and the difference between the two prices is exactly what a basis is. §3.17c: the
    // quote is two-way at that reservation — written above it, bought below it — stated to the
    // engine as a holder of its own short capacity (`twoWayProtectionQuote`). ----
    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;
    const participants: ClearingParticipant[] = [];
    /** Each two-way participant's opening position per name: what it holds if it does nothing. */
    const openingByParticipant = new Map<string, Map<InstrumentId, number>>();
    const shortByInstrument = new Map<InstrumentId, number>();
    const quoteAll = (participantId: string, party: DerivativeParty, capacityLocal: number, rangeBps: number, reservationOf: (c: Company, tenorYears: number) => number) => {
      if (!(capacityLocal > 0)) return;
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      const opening = new Map<InstrumentId, number>();
      referenceIssuers.forEach((c) => CDS_TENORS.forEach((tenor) => {
        const id = cdsInstrumentId(regionId, c.id, tenor);
        // A participant will not carry more of ONE name than its own large-exposure limit allows
        // either way, and no more than it can margin at the house.
        const sizeLocal = Math.min(capacityLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, marginRateOf(regionId, c.id, tenor))) / Math.max(1, referenceIssuers.length);
        const q = twoWayProtectionQuote({ reservationBps: reservationOf(c, CDS_TENOR_YEARS[tenor]), rangeBps, sizeLocal });
        demandByInstrumentId.set(id, { reservationStat: q.reservationStat, maxHoldingLocal: q.maxHoldingLocal, fullSizeStatRange: q.fullSizeStatRange });
        opening.set(id, q.currentHoldingLocal);
        shortByInstrument.set(id, (shortByInstrument.get(id) ?? 0) + q.currentHoldingLocal);
      }));
      openingByParticipant.set(participantId, opening);
      participants.push({ id: participantId, currentHoldingsByInstrumentId: new Map(opening), demandByInstrumentId });
    };

    // The banks' derivative desks: capital is the constraint, not cash, because the position is
    // unfunded. DRV: the capacity is the desk's remaining derivative budget — ONE budget across
    // the swaps it pays on, the forwards it writes and the protection it has already sold
    // (registry.ts), through this class's PFE add-on.
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const requiredReturn = bankRequiredReturnAnnual(bank, reg);
      const capacityLocal = deskNotionalCapacityLocal(
        leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)), standing.pfeChargeLocal(bankPartyKey(bank.id)), 'CDS');
      quoteAll(`CDSDESK-${bank.ticker}`, bankParty(bank), capacityLocal, fullSizeSpreadRangeBpsOf(bank), (c, tenorYears) => computeReservationSpreadBps({
        entityType: 'ASSET_MANAGER',
        requiredReturn,
        expectedLossBps: pdByIssuerId.get(c.id)! * (1 - recoveryRate) * 10000,
        // The capital a position consumes is its own tenor's: that difference IS the curve.
        capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, tenorYears),
        creditConditionsIndex,
      }));
    });

    // The credit funds: an unfunded long is exactly the trade a credit long-short book wants, and
    // the distressed book will write protection on a name it thinks survives — or buy it on one it
    // thinks the market has too tight. Size is its own capital at its own required return, never
    // a share anyone assigned.
    const creditFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && institutionProfile(e.entityType).quotesCdsProtection
    );
    creditFunds.forEach((entity) => {
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      quoteAll(entity.id, { kind: 'INSTITUTION', id: entity.id }, Math.max(0, entity.equityCapitalLocal), fullSizeSpreadRangeBpsOf(entity), (c, tenorYears) => computeReservationSpreadBps({
        entityType: entity.entityType,
        requiredReturn,
        expectedLossBps: pdByIssuerId.get(c.id)! * (1 - recoveryRate) * 10000,
        capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, tenorYears),
        creditConditionsIndex,
      }));
    });

    // §3.17f-i: a relative-value book's PROTECTION leg — cover bought on a name against the rung
    // it is long, or written back when the pair comes off — is a one-sided seat at the level
    // the pair pays: a buyer opens holding its size and sells the credit below its reservation,
    // a writer takes above it (`indexHolderQuote`'s two shapes).
    const bookIds = new Set(referenceIssuers.flatMap((c) => CDS_TENORS.map((tenor) => cdsInstrumentId(regionId, c.id, tenor))));
    const legSeats = new Map<string, ClearingParticipant>();
    ctx.relativeValueLegs.filter((l) => l.market === 'CDS_PROTECTION' && l.regionId === regionId && bookIds.has(l.instrumentId)).forEach((leg) => {
      const id = leg.instrumentId;
      const q = indexHolderQuote({ reservationBps: leg.reservationPrice, rangeBps: leg.fullSizePriceRange, gapLocal: leg.faceLocal });
      if (!(q.maxHoldingLocal > 0)) return;
      // One seat per book, whatever the names its legs are on (§3.17f-ii).
      let p = legSeats.get(leg.entityId);
      if (!p) { p = { id: leg.entityId, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: new Map() }; legSeats.set(leg.entityId, p); participants.push(p); openingByParticipant.set(leg.entityId, new Map()); }
      p.currentHoldingsByInstrumentId.set(id, q.currentHoldingLocal);
      p.demandByInstrumentId.set(id, { reservationStat: q.reservationStat, maxHoldingLocal: q.maxHoldingLocal, fullSizeStatRange: q.fullSizeStatRange });
      openingByParticipant.get(leg.entityId)!.set(id, q.currentHoldingLocal);
      shortByInstrument.set(id, (shortByInstrument.get(id) ?? 0) + q.currentHoldingLocal);
    });
    if (participants.length === 0) return;

    const histOf = (issuerId: EntityId, tenor: CdsTenorKey): number[] | undefined => reg.cdsSpreadHistoryByIssuer?.[issuerId]?.[tenor];
    const instruments: ClearingInstrument[] = referenceIssuers.flatMap((c) => CDS_TENORS.map((tenor): ClearingInstrument => {
      const id = cdsInstrumentId(regionId, c.id, tenor);
      // The float is the hedgers' need at this tenor plus every quoter's opening short: what
      // changes hands is what the print moves off those openings.
      const floatLocal = (hedgeDemandByIssuer.get(c.id) ?? []).filter((d) => d.termKey === tenor).reduce((a, d) => a + d.usd, 0) + (shortByInstrument.get(id) ?? 0);
      // §3.13-BOOK dII: the name's book is declared on the instrument index where it is built.
      registerBook(v2cds, id, 'CDS', money);
      const last = histOf(c.id, tenor)?.slice(-1)[0];
      return {
        id,
        outstandingLocal: floatLocal,
        tradableFloatLocal: floatLocal,
        // Opens at this tenor's own last print; before one, at the issuer's own cleared cash
        // spread AT THIS TENOR — the alternative a seller is pricing against — and moves from
        // there on this book's own supply and demand. The BASIS between the two is what the
        // market then produces. §3.13: that cash leg is a point on the issuer's own credit
        // curve, not a number the issuer carries; a name with no printed bonds has no cash leg
        // to price against and the contract opens on the structural hazard its sellers reserve
        // against instead.
        currentStat: Math.max(1, last ?? (cashSpreadBpsOf(c, tenor) ?? (c.cdsSpreadBps > 0 ? c.cdsSpreadBps : 1))),
        statKind: 'YIELD_LIKE',
        durationYears: CDS_TENOR_YEARS[tenor],
      };
    }));

    const result = clearFinancialAsset(instruments, participants, {
      // Bilateral between named desks and funds; the clearing house takes no fee on it yet.
      dealerSpreadBps: 0,
    });

    // ---- 4. Strike the week's contracts. What a quoter holds against its opening is what it did:
    // above it, protection written; below it, protection bought. At one cleared spread the writers
    // are fungible, so each buyer's need draws from each writer in proportion to what it wrote. ----
    /** A participant seat as the party it bids for. §3.13-BOOK (c2b): a participant id is its own
     *  space — a `CDSDESK-` seat is a bank's desk; anything else is an institution under its id. */
    const partyOfSeat = (participantId: string): DerivativeParty => {
      const deskBankId = participantId.startsWith('CDSDESK-')
        ? bankIdOfTicker(asTicker(participantId.slice('CDSDESK-'.length))) : undefined;
      return deskBankId !== undefined ? bankPartyOf(deskBankId) : { kind: 'INSTITUTION', id: asEntityId(participantId) };
    };
    const struck: DerivativeContract[] = [];
    let seq = 0;
    referenceIssuers.forEach((issuer) => CDS_TENORS.forEach((tenor) => {
      const instrumentId = cdsInstrumentId(regionId, issuer.id, tenor);
      const clearedBps = takePrint(ctx, result, instrumentId, `${regionId} cds`);
      if (clearedBps === undefined) return;
      const print = Number(clearedBps.toFixed(1));
      // §3.17-ii: the print joins the name's history AT ITS TENOR (§3.17d-iii: the curve's store)
      // — what a protection contract marks at and sizes its initial margin from.
      const hist = reg.cdsSpreadHistoryByIssuer ?? (reg.cdsSpreadHistoryByIssuer = {});
      const curve = hist[issuer.id] ?? (hist[issuer.id] = {});
      curve[tenor] = [...(curve[tenor] ?? []).slice(-(MEASURE_WINDOW_WEEKS - 1)), print];
      if (tenor === CDS_BENCHMARK_TENOR) {
        // THE PRICE the name is quoted by. `comp.cdsSpreadBps` was `oas + a random draw`, clamped
        // to [10, 5000]; it is what this book cleared at the benchmark tenor, with no bound on
        // either end (rule 6).
        issuer.cdsSpreadBps = print;
        // §5-CLOSE P2: the week this print was struck — a name with no protection book this week
        // carries last print, which is a quote, not a price, and the basis test reads only prices.
        issuer.cdsClearedWeek = ctx.nextWeek;
        // ...and the BASIS, the second cross-market agreement test this model can run: protection
        // against the SAME issuer's cash paper at the SAME maturity, which is the only comparison
        // the two prices are of. A name with no cash bond printed has no basis, and saying so is
        // the honest answer — the pair `P2` measures has to be two real prices (at every tenor).
        const cashBps = cashSpreadBpsOf(issuer, tenor);
        issuer.cdsBasisBps = cashBps === undefined ? undefined : Number((clearedBps - cashBps).toFixed(1));
      }

      const writtenBySeller = new Map<string, number>();
      let totalWrittenLocal = 0;
      const demands: ProtectionNeed[] = (hedgeDemandByIssuer.get(issuer.id) ?? []).filter((d) => d.termKey === tenor);
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        const net = (byInstrument.get(instrumentId) ?? 0) - (openingByParticipant.get(participantId)?.get(instrumentId) ?? 0);
        if (net > 1) {
          writtenBySeller.set(participantId, net);
          totalWrittenLocal += net;
        } else if (net < -1) {
          // §3.17c (c): a view — the print is tighter than this participant's own cost of the risk.
          demands.push({ party: partyOfSeat(participantId), usd: -net, termKey: tenor });
        }
      });
      if (totalWrittenLocal <= 0) return;
      const totalNeedLocal = demands.reduce((a, d) => a + d.usd, 0);
      const filledShare = Math.min(1, totalWrittenLocal / Math.max(1, totalNeedLocal));
      demands.forEach((d) => {
        const hedgedLocal = d.usd * filledShare;
        if (hedgedLocal <= 1) return;
        writtenBySeller.forEach((writtenLocal, participantId) => {
          const notional = hedgedLocal * (writtenLocal / totalWrittenLocal);
          if (notional <= 1) return;
          const seller = partyOfSeat(participantId);
          if (derivativePartyKey(seller) === derivativePartyKey(d.party)) return;
          struck.push(withInitialMargin({
            id: `${regionId}-CDS-${issuer.id}-${tenor}-${week}-${seq++}`,
            classId: 'CDS',
            regionId,
            a: d.party,
            b: seller,
            notional: Math.round(notional),
            strike: print,
            reference: { kind: 'ISSUER', issuerId: issuer.id },
            termKey: tenor,
            // §3.13c: the market it clears in.
            currency: money,
            // §3.17-iii: marked from strike — nothing settled yet.
            settledMarkLocal: 0,
            struckWeek: week,
            maturityWeek: week + cdsTenorWeeksOf(tenor),
          }, view));
        });
      });
    }));
    // §3.17-v-i: the house admits what each member can margin, then the contracts stand and post.
    const admitted = admitToHouse(ctx, struck, view);
    strikeDerivatives(ctx, admitted);
    admitted.forEach((c) => postInitialMargin(ctx, c));
  });
}

export const CDS_MARKET: DerivativeMarket = {
  classId: 'CDS',
  phase: 'CLEARING',
  settles: 'BEFORE_MARKET',
  run: runCdsMarket,
};
