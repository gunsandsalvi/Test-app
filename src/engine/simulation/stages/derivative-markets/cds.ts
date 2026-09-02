/**
 * CRD/DER2 — the single-name CDS MARKET, cleared on the same engine as every other book. The
 * contract itself — premium, credit event, close-out — is the CDS profile under
 * domain/derivatives/classes/cds.ts, run by the one lifecycle. This market keeps what is the
 * market's: who needs protection, who will write it, and the print.
 *
 * The float this auction prices is the PROTECTION SOMEBODY NEEDS: the exposure a lender's capital
 * does not let it carry against one name, measured off its own book against the large-exposure
 * limit. The participants are the sellers — the banks' derivative desks and the credit funds that
 * want the exposure without funding it — and their reservation is what the same credit costs them
 * to carry, which is the arithmetic the corporate bond book already uses, because it is the same
 * risk. What comes out is the CDS spread, and what comes out of comparing it to the issuer's
 * cleared cash OAS is the BASIS.
 *
 * Opens in the CLEARING phase after 07b (the cleared OAS every schedule here reads) and before
 * settlement, so the week's premiums move real money between named parties. The standing book
 * settles BEFORE the market: this week's premium, any credit event a reference default triggered,
 * any counterparty that died.
 */

import { RegionId, Company } from '../../../../types';
import { ensureV2 } from '../../../../engine2/world';
import { institutionProfile } from '../../../../domain/institution-profiles';
import { CDS_TENOR_WEEKS, protectionNeedUSD } from '../../../../domain/derivatives/classes/cds';
import { DerivativeContract, DerivativeParty } from '../../../../domain/derivatives/contract';
import { deskNotionalCapacityUSD } from '../../../../domain/derivatives/registry';
import { BankLoan } from '../../../../domain/banking';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from '../financial-clearing-engine';
import { isActiveCompany } from '../../../../domain/company';
import { computeAnnualDefaultProbability, creditRecoveryRate } from '../shared-helpers';
import { computeReservationSpreadBps, spreadRiskCapitalChargeRate, entityRequiredReturn, fullSizeSpreadRangeBpsOf } from '../asset-allocation';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { leverageHeadroomUSD } from '../../../macro/banking';
import { REGION_IDS } from '../../../../domain/geography';
import { strikeDerivatives } from '../derivative-lifecycle';
import { institutionTotalAssetsUSD } from '../institutional-balance-sheet';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';

const cdsInstrumentId = (regionId: RegionId, issuerId: string) => `${regionId}-CDS-${issuerId}`;

function runCdsMarket({ state, ctx, week, standing }: DerivativeMarketRun): void {
  const v2cds = ensureV2(state);
  const companyById = new Map<string, Company>(
    [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].map((c) => [c.id, c])
  );

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const recoveryRate = creditRecoveryRate(reg);

    // ---- 1. WHO NEEDS PROTECTION, and how much. A bank's exposure to one name beyond what its
    // capital lets it carry against a single counterparty. This is the decision
    // `09-concentration-risk.ts`'s measurement never had: above the limit the position is not one
    // the bank is allowed to keep, so the excess is laid off rather than preferred away. ----
    const regionBanks = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c)
    );
    const hedgeDemandByIssuer = new Map<string, { party: DerivativeParty; usd: number }[]>();
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const exposureByIssuer = new Map<string, number>();
      (sheet.businessLoans || []).forEach((l: BankLoan) => {
        if (l.borrowerKind !== 'COMPANY_FACILITY') return;
        exposureByIssuer.set(l.borrowerId, (exposureByIssuer.get(l.borrowerId) ?? 0) + Math.max(0, l.principalUSD));
      });
      const party: DerivativeParty = { kind: 'BANK', ticker: bank.ticker };
      exposureByIssuer.forEach((exposureUSD, issuerId) => {
        const issuer = companyById.get(issuerId);
        if (!issuer || issuer.region !== regionId || !isActiveCompany(issuer)) return;
        const needUSD = protectionNeedUSD({
          exposureUSD,
          bankEquityUSD: sheet.bankEquityUSD,
          alreadyHedgedUSD: standing.coverUSD('CDS', 'a', `BANK:${bank.ticker}`, issuerId),
        });
        if (needUSD <= 1) return;
        const list = hedgeDemandByIssuer.get(issuerId) ?? [];
        list.push({ party, usd: needUSD });
        hedgeDemandByIssuer.set(issuerId, list);
      });
    });
    if (hedgeDemandByIssuer.size === 0) return;

    // ---- 2. The book. One instrument per reference entity somebody needs protection on. ----
    const referenceIssuers = Array.from(hedgeDemandByIssuer.keys())
      .map((id) => companyById.get(id)!)
      .filter((c) => !!c);
    const pdByIssuerId = new Map(referenceIssuers.map((c) => [c.id, computeAnnualDefaultProbability(v2cds, c)]));
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

    // ---- 3. THE SELLERS. Writing protection is a long in the credit that nobody funded, so a
    // seller's reservation is what the same credit costs it to carry: its expected loss plus the
    // capital the position consumes at its own required return — the identical arithmetic the
    // corporate bond book prices with, because it is the identical risk. What differs is the
    // FUNDING, and the difference between the two prices is exactly what a basis is. ----
    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;
    const participants: ClearingParticipant[] = [];

    // The banks' derivative desks: capital is the constraint, not cash, because the position is
    // unfunded. DRV: the capacity is the desk's remaining derivative budget — ONE budget across
    // the swaps it pays on, the forwards it writes and the protection it has already sold
    // (registry.ts), through this class's PFE add-on.
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const requiredReturn = bankRequiredReturnAnnual(bank, reg);
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const capacityUSD = deskNotionalCapacityUSD(
        leverageHeadroomUSD(sheet), standing.pfeChargeUSD(`BANK:${bank.ticker}`), 'CDS');
      if (!(capacityUSD > 0)) return;
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
          fullSizeStatRange: fullSizeSpreadRangeBpsOf(bank),
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
        && institutionProfile(e.entityType).sellsCdsProtection
    );
    creditFunds.forEach((entity) => {
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsUSD(ctx, entity));
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
          fullSizeStatRange: fullSizeSpreadRangeBpsOf(entity),
        });
      });
      participants.push({ id: entity.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId });
    });

    if (participants.length === 0) return;

    const result = clearFinancialAsset(instruments, participants, new Map(), {
      // Bilateral between named desks and funds; the clearing house takes no fee on it yet.
      dealerSpreadBps: 0,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `cds:${id}`));

    // ---- 4. Strike the week's contracts. At one cleared spread the sellers are fungible, so each
    // hedger's need draws from each seller in proportion to what that seller wrote. ----
    const struck: DerivativeContract[] = [];
    let seq = 0;
    referenceIssuers.forEach((issuer) => {
      const instrumentId = cdsInstrumentId(regionId, issuer.id);
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) return;
      // THE PRICE. `comp.cdsSpreadBps` was `oas + a random draw`, clamped to [10, 5000]; it is
      // what this book cleared at, with no bound on either end (rule 15).
      issuer.cdsSpreadBps = Number(clearedBps.toFixed(1));
      // §5-CLOSE P2: the week this print was struck — a name with no protection book this week
      // carries last print, which is a quote, not a price, and the basis test reads only prices.
      issuer.cdsClearedWeek = ctx.nextWeek;
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
          const seller: DerivativeParty = participantId.startsWith('CDSDESK-')
            ? { kind: 'BANK', ticker: participantId.slice('CDSDESK-'.length) }
            : { kind: 'INSTITUTION', id: participantId };
          struck.push({
            id: `${regionId}-CDS-${issuer.id}-${week}-${seq++}`,
            classId: 'CDS',
            regionId,
            a: d.party,
            b: seller,
            notionalUSD: Math.round(notionalUSD),
            strike: Number(clearedBps.toFixed(1)),
            referenceId: issuer.id,
            termKey: '',
            struckWeek: week,
            maturityWeek: week + CDS_TENOR_WEEKS,
          });
        });
      });
    });
    strikeDerivatives(ctx, state, struck);
  });
}

export const CDS_MARKET: DerivativeMarket = {
  classId: 'CDS',
  phase: 'CLEARING',
  settles: 'BEFORE_MARKET',
  run: runCdsMarket,
};
