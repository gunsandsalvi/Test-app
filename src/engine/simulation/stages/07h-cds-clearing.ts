/**
 * CRD/DER2 — the single-name CDS market, cleared on the same engine as every other book. The
 * shape of the market, and what it replaces, is documented once in domain/credit-default-swap.ts.
 *
 * The float this auction prices is the PROTECTION SOMEBODY NEEDS: the exposure a lender's capital
 * does not let it carry against one name, measured off its own book against the large-exposure
 * limit. The participants are the sellers — the banks' derivative desks and the credit funds that
 * want the exposure without funding it — and their reservation is what the same credit costs them
 * to carry, which is the arithmetic the corporate bond book already uses, because it is the same
 * risk. What comes out is the CDS spread, and what comes out of comparing it to the issuer's
 * cleared cash OAS is the BASIS.
 *
 * Runs after 07b (the cleared OAS every schedule here reads) and before settlement, so the week's
 * premiums move real money between named parties.
 */

import { GameState, RegionId, Company } from '../../../types';
import {
  CdsContract, CdsParty, CDS_TENOR_WEEKS, cdsWeeklyPremiumUSD, cdsDefaultPayoutUSD,
  cdsPartyKey, protectionNeedUSD,
} from '../../../domain/credit-default-swap';
import { BankLoan } from '../../../domain/banking';
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { isActiveCompany } from '../../../domain/company';
import { computeAnnualDefaultProbability, creditRecoveryRate } from './shared-helpers';
import { computeReservationSpreadBps, spreadRiskCapitalChargeRate, entityRequiredReturn, FULL_SIZE_SPREAD_RANGE_BPS } from './asset-allocation';
import { bankRequiredReturnAnnual, BANK_WORKING_CAPITAL_RATIO } from './bank-lending';

const cdsInstrumentId = (regionId: RegionId, issuerId: string) => `${regionId}-CDS-${issuerId}`;

/** A protection seller is short a credit it did not fund; its book reprices like any other. */
const MAX_WEEKLY_CDS_MOVE_PCT = 0.25;

const partyRefOf = (p: CdsParty): PartyRef =>
  p.kind === 'BANK' ? { kind: 'BANK', ticker: p.ticker } : { kind: 'INSTITUTION', id: p.id };

export function runCdsClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const book = reg.cdsBook ?? [];
    const recoveryRate = creditRecoveryRate(reg);

    // ---- 1. The standing book settles first: this week's premium, and any payout a default
    // triggered. A defaulted reference entity terminates the contract — protection pays par less
    // what the workout actually recovers (G5), which is what makes buying it worth anything. ----
    const companyById = new Map<string, Company>(
      [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].map((c) => [c.id, c])
    );
    const carried: CdsContract[] = [];
    book.forEach((c) => {
      const issuer = companyById.get(c.referenceIssuerId);
      const defaulted = !issuer || issuer.isDefaulted;
      if (defaulted) {
        const payoutUSD = cdsDefaultPayoutUSD(c, recoveryRate);
        if (payoutUSD > 0) {
          pay(ctx, {
            payer: partyRefOf(c.seller),
            payee: partyRefOf(c.buyer),
            amountUSD: payoutUSD,
            reason: 'CDS credit event settled',
          });
        }
        return; // terminated
      }
      if (c.maturityWeek <= ctx.nextWeek) return; // ran off
      const premiumUSD = cdsWeeklyPremiumUSD(c);
      if (premiumUSD > 0) {
        pay(ctx, {
          payer: partyRefOf(c.buyer),
          payee: partyRefOf(c.seller),
          amountUSD: premiumUSD,
          reason: 'CDS premium',
        });
      }
      carried.push(c);
    });

    // ---- 2. WHO NEEDS PROTECTION, and how much. A bank's exposure to one name beyond what its
    // capital lets it carry against a single counterparty. This is the decision
    // `09-concentration-risk.ts`'s measurement never had: above the limit the position is not one
    // the bank is allowed to keep, so the excess is laid off rather than preferred away. ----
    const regionBanks = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c)
    );
    const hedgeDemandByIssuer = new Map<string, { party: CdsParty; usd: number }[]>();
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const exposureByIssuer = new Map<string, number>();
      (sheet.businessLoans || []).forEach((l: BankLoan) => {
        if (l.borrowerKind !== 'COMPANY_FACILITY') return;
        exposureByIssuer.set(l.borrowerId, (exposureByIssuer.get(l.borrowerId) ?? 0) + Math.max(0, l.principalUSD));
      });
      const party: CdsParty = { kind: 'BANK', ticker: bank.ticker };
      const key = cdsPartyKey(party);
      exposureByIssuer.forEach((exposureUSD, issuerId) => {
        const issuer = companyById.get(issuerId);
        if (!issuer || issuer.region !== regionId || !isActiveCompany(issuer)) return;
        const alreadyHedgedUSD = carried.reduce((a, c) =>
          a + (c.referenceIssuerId === issuerId && cdsPartyKey(c.buyer) === key ? c.notionalUSD : 0), 0);
        const needUSD = protectionNeedUSD({
          exposureUSD,
          bankEquityUSD: sheet.bankEquityUSD,
          alreadyHedgedUSD,
        });
        if (needUSD <= 1) return;
        const list = hedgeDemandByIssuer.get(issuerId) ?? [];
        list.push({ party, usd: needUSD });
        hedgeDemandByIssuer.set(issuerId, list);
      });
    });
    if (hedgeDemandByIssuer.size === 0) { reg.cdsBook = carried; return; }

    // ---- 3. The book. One instrument per reference entity somebody needs protection on. ----
    const referenceIssuers = Array.from(hedgeDemandByIssuer.keys())
      .map((id) => companyById.get(id)!)
      .filter((c) => !!c);
    const pdByIssuerId = new Map(referenceIssuers.map((c) => [c.id, computeAnnualDefaultProbability(c)]));
    const instruments: ClearingInstrument[] = referenceIssuers.map((c) => {
      const demand = hedgeDemandByIssuer.get(c.id)!;
      const floatUSD = demand.reduce((a, d) => a + d.usd, 0);
      return {
        id: cdsInstrumentId(regionId, c.id),
        outstandingUSD: floatUSD,
        tradableFloatUSD: floatUSD,
        // Opens at the issuer's own cleared cash spread — the alternative a seller is pricing
        // against — and moves from there on this book's own supply and demand. The BASIS between
        // the two is what the market then produces.
        currentStat: Math.max(1, c.cdsSpreadBps > 0 ? c.cdsSpreadBps : c.oasSpreadBps),
        statKind: 'YIELD_LIKE',
        durationYears: CDS_TENOR_WEEKS / 52,
      };
    });

    // ---- 4. THE SELLERS. Writing protection is a long in the credit that nobody funded, so a
    // seller's reservation is what the same credit costs it to carry: its expected loss plus the
    // capital the position consumes at its own required return — the identical arithmetic the
    // corporate bond book prices with, because it is the identical risk. What differs is the
    // FUNDING, and the difference between the two prices is exactly what a basis is. ----
    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;
    const participants: ClearingParticipant[] = [];

    // The banks' derivative desks: capital is the constraint, not cash, because the position is
    // unfunded — the same reason 07c leaves a bank's bond bid without a cash budget.
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const requiredReturn = bankRequiredReturnAnnual(bank, reg);
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      // What its capital supports written across every name: equity over the capital a unit of
      // protection consumes. A desk cannot write more risk than it holds capital against.
      const capacityUSD = Math.max(0, sheet.bankEquityUSD) / Math.max(0.01, BANK_WORKING_CAPITAL_RATIO);
      referenceIssuers.forEach((c) => {
        const annualPd = pdByIssuerId.get(c.id)!;
        const capitalChargeRate = spreadRiskCapitalChargeRate(c.creditRating, CDS_TENOR_WEEKS / 52);
        const reservationBps = computeReservationSpreadBps({
          entityType: 'ASSET_MANAGER',
          requiredReturn,
          expectedLossBps: annualPd * (1 - recoveryRate) * 10000,
          capitalChargeRate,
          creditConditionsIndex,
        });
        // A desk will not write more of ONE name than its own large-exposure limit allows either:
        // selling protection is the same concentration as making the loan.
        demandByInstrumentId.set(cdsInstrumentId(regionId, c.id), {
          reservationStat: reservationBps,
          maxHoldingUSD: capacityUSD / Math.max(1, referenceIssuers.length),
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
        });
      });
      participants.push({
        id: `CDSDESK-${bank.ticker}`,
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId,
      });
    });

    // The credit funds: an unfunded long is exactly the trade a credit long-short book wants, and
    // the distressed book will write protection on a name it thinks survives. Size is its own
    // capital at its own required return, never a share anyone assigned.
    const creditFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && (e.entityType === 'HEDGE_FUND' || e.entityType === 'ASSET_MANAGER')
    );
    creditFunds.forEach((entity) => {
      const requiredReturn = entityRequiredReturn(entity);
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const capacityUSD = Math.max(0, entity.equityCapitalUSD);
      if (!(capacityUSD > 0)) return;
      referenceIssuers.forEach((c) => {
        const annualPd = pdByIssuerId.get(c.id)!;
        demandByInstrumentId.set(cdsInstrumentId(regionId, c.id), {
          reservationStat: computeReservationSpreadBps({
            entityType: entity.entityType,
            requiredReturn,
            expectedLossBps: annualPd * (1 - recoveryRate) * 10000,
            capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, CDS_TENOR_WEEKS / 52),
            creditConditionsIndex,
          }),
          maxHoldingUSD: capacityUSD / Math.max(1, referenceIssuers.length),
          fullSizeStatRange: FULL_SIZE_SPREAD_RANGE_BPS,
        });
      });
      participants.push({ id: entity.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId });
    });

    if (participants.length === 0) { reg.cdsBook = carried; return; }

    const result = clearFinancialAsset(instruments, participants, new Map(), {
      // Bilateral between named desks and funds; the clearing house takes no fee on it yet.
      dealerSpreadBps: 0,
      maxWeeklyStatMovePct: MAX_WEEKLY_CDS_MOVE_PCT,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

    // ---- 5. Strike the week's contracts. At one cleared spread the sellers are fungible, so each
    // hedger's need draws from each seller in proportion to what that seller wrote. ----
    const newContracts: CdsContract[] = [];
    let seq = 0;
    referenceIssuers.forEach((issuer) => {
      const instrumentId = cdsInstrumentId(regionId, issuer.id);
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) return;
      // THE PRICE. `comp.cdsSpreadBps` was `oas + a random draw`, clamped to [10, 5000]; it is
      // what this book cleared at, with no bound on either end (rule 15).
      issuer.cdsSpreadBps = Number(clearedBps.toFixed(1));
      // ...and the BASIS, the second cross-market agreement test this model can run.
      issuer.cdsBasisBps = Number((clearedBps - issuer.oasSpreadBps).toFixed(1));

      const writtenBySeller = new Map<string, number>();
      let totalWrittenUSD = 0;
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        const usd = byInstrument.get(instrumentId) ?? 0;
        if (usd <= 1) return;
        writtenBySeller.set(participantId, usd);
        totalWrittenUSD += usd;
      });
      if (totalWrittenUSD <= 0) return;
      const demands = hedgeDemandByIssuer.get(issuer.id)!;
      const totalNeedUSD = demands.reduce((a, d) => a + d.usd, 0);
      const filledShare = Math.min(1, totalWrittenUSD / Math.max(1, totalNeedUSD));
      demands.forEach((d) => {
        const hedgedUSD = d.usd * filledShare;
        if (hedgedUSD <= 1) return;
        writtenBySeller.forEach((writtenUSD, participantId) => {
          const notionalUSD = hedgedUSD * (writtenUSD / totalWrittenUSD);
          if (notionalUSD <= 1) return;
          const seller: CdsParty = participantId.startsWith('CDSDESK-')
            ? { kind: 'BANK', ticker: participantId.slice('CDSDESK-'.length) }
            : { kind: 'INSTITUTION', id: participantId };
          newContracts.push({
            id: `${regionId}-CDS-${issuer.id}-${ctx.nextWeek}-${seq++}`,
            regionId,
            referenceIssuerId: issuer.id,
            buyer: d.party,
            seller,
            notionalUSD: Math.round(notionalUSD),
            spreadBps: Number(clearedBps.toFixed(1)),
            struckWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + CDS_TENOR_WEEKS,
          });
        });
      });
    });

    reg.cdsBook = [...carried, ...newContracts];
  });
}
