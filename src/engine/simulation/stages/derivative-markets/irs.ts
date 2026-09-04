/**
 * DER1 — the interest-rate swap MARKET: par rates at 2/5/10 years, cleared on the same engine as
 * every other book. The contract itself — legs, close-out, maturity — is the IRS profile under
 * domain/derivatives/classes/irs.ts, run by the one lifecycle (derivative-lifecycle.ts). This
 * market keeps what is the market's: who must pay fixed, who will receive it, and the print.
 *
 * The float this auction prices is the pay-fixed demand: what the hedgers whose exposure their
 * own balance sheets cannot absorb need someone to take. The participants are the receivers —
 * liability-matched books that never have enough duration — and their reservation is the
 * government bond of the same tenor, because that is the alternative they already have. A
 * receiver who can buy a 10-year at 4% will not receive fixed at 3.5%, and that is the whole of
 * why a swap spread exists.
 *
 * Opens in the CLEARING phase after 07c (the sovereign curve is this week's cleared one, which
 * every schedule here reads) and before settlement, so the week's net swap payments move real
 * money between named parties. The standing book settles BEFORE the market — the floating leg
 * pays what the week actually printed.
 */

import { RegionId } from '../../../../types';
import { bankParty, companyParty } from '../../../../domain/party';
import { currencyOf } from '../../../../domain/geography';
import { loanBooksOf } from '../../../../domain/banking';
import { ensureV2 } from '../../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, facilityBookOf, materializeGovLadder } from '../../../../engine2/tranches';
import { sovereignTenorResolver } from '../../../../domain/government';
import { institutionProfile } from '../../../../domain/institution-profiles';
import { carriesRateDuration } from '../../../../domain/assets';
import {
  SwapTenorKey, SWAP_TENORS, SWAP_TENOR_YEARS, SWAP_TENOR_ZERO_FIELD, repricingLossLocal,
} from '../../../../domain/derivatives/classes/irs';
import { DerivativeContract, DerivativeParty, bankPartyKey, companyPartyKey, institutionPartyKey } from '../../../../domain/derivatives/contract';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, YIELD_LIKE_MIN_WEEKLY_MOVE_BPS } from '../financial-clearing-engine';
import { isActiveCompany, banksOf } from '../../../../domain/company';
import { BANK_WORKING_CAPITAL_RATIO } from '../bank-lending';
import { COVENANT_INTEREST_COVERAGE } from '../corporate-financing';
import { strikeDerivatives } from '../derivative-lifecycle';
import { institutionTotalAssetsLocal, institutionBookLocal } from '../institutional-balance-sheet';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';

import { swapInstrumentId } from '../../../../domain/instrument-keys';
import type { InstrumentId } from '../../../../domain/ids';
import { isKnownEntity } from '../../../../domain/ids';
import type { EntityId } from '../../../../domain/ids';
/** Swaps are struck for their tenor and run to it — there is no secondary market here yet. */

/**
 * The two-sigma one-week move in this region's own yields, in bps — the repricing every hedger
 * here has to decide whether it can absorb. Measured off the cleared curve's own history, the
 * same estimator the repo desk's haircuts use, with the engine's minimum allowance as the floor
 * when there is too little history to estimate one.
 */
function twoSigmaYieldMoveBps(reg: { historicalZeroCurves?: { tenor10Y: number }[] }): number {
  const series = (reg.historicalZeroCurves ?? []).map((h) => h.tenor10Y).filter((v) => Number.isFinite(v));
  const diffs: number[] = [];
  for (let i = 1; i < series.length; i++) diffs.push((series[i] - series[i - 1]) * 10000);
  if (diffs.length < 2) return YIELD_LIKE_MIN_WEEKLY_MOVE_BPS;
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (diffs.length - 1);
  return Math.max(YIELD_LIKE_MIN_WEEKLY_MOVE_BPS, 2 * Math.sqrt(variance));
}

function runSwapMarket({ state, ctx, week, standing }: DerivativeMarketRun): void {
  const v2g = ensureV2(state);

  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg?.zeroRates) return;

    const moveBps = twoSigmaYieldMoveBps(reg);
    const regionBanks = banksOf(ctx.prevActiveFirms, regionId);
    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && !c.isBankEntity && !c.isInstitutionalEntity && isActiveCompany(c)
    );
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && institutionProfile(e.entityType).liabilityDriven
    );

    // ---- The PAY-FIXED side, sized by what each hedger's own sheet cannot absorb, net of what
    // it is already paying on (§7.241, off the one book). ----
    const payDemandByTenor = new Map<SwapTenorKey, { party: DerivativeParty; usd: number }[]>();
    SWAP_TENORS.forEach((k) => payDemandByTenor.set(k, []));

    // A bank's fixed-rate sovereign book is funded by liabilities that reprice with policy. Its
    // capital can absorb a repricing only down to the ratio it must keep; what it cannot absorb
    // is what it hedges, at the tenor its book actually sits in.
    // §3.13-SOV row 3: the book is keyed by BOND, so what sits at a swap's tenor is the face of
    // the bonds whose REMAINING life is nearest it. This used to read one of three tenor-bucket
    // labels straight off the sheet — which, once the keys became bond ids, would have found
    // nothing and hedged nothing. The swap tenors are real instruments; the bonds are grouped
    // onto them only to decide which contract covers which risk.
    const tenorYearsOf = sovereignTenorResolver(materializeGovLadder(ctx.v2, regionId), ctx.nextWeek);
    const nearestSwapTenor = (years: number): SwapTenorKey => SWAP_TENORS.reduce(
      (best, k) => (Math.abs(SWAP_TENOR_YEARS[k] - years) < Math.abs(SWAP_TENOR_YEARS[best] - years) ? k : best),
      SWAP_TENORS[0]
    );
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const rwaLocal = loanBooksOf(sheet, facilityBookOf(ctx.v2, bank.ticker));
      const absorbableLocal = Math.max(0, sheet.bankEquityLocal - rwaLocal * BANK_WORKING_CAPITAL_RATIO);
      const bookByTenor = new Map<SwapTenorKey, number>();
      Object.entries(sheet.sovereignBondHoldingsByBond ?? {}).forEach(([bondId, usd]) => {
        const years = tenorYearsOf(bondId);
        if (years === undefined) return;
        const k = nearestSwapTenor(years);
        bookByTenor.set(k, (bookByTenor.get(k) ?? 0) + (Number(usd) || 0));
      });
      SWAP_TENORS.forEach((k) => {
        const bookLocal = bookByTenor.get(k) ?? 0;
        if (!(bookLocal > 0)) return;
        const lossLocal = repricingLossLocal(bookLocal, SWAP_TENOR_YEARS[k], moveBps);
        if (lossLocal <= absorbableLocal) return;
        // Hedge the notional whose repricing loss is the excess — the rest it can carry.
        const wantedLocal = ((lossLocal - absorbableLocal) / Math.max(1e-9, lossLocal)) * bookLocal;
        const alreadyPayingLocal = standing.coverLocal('IRS', 'a', bankPartyKey(bank.ticker), undefined, k);
        const hedgeLocal = Math.max(0, wantedLocal - alreadyPayingLocal);
        if (!(hedgeLocal > 0)) return;
        payDemandByTenor.get(k)!.push({ party: bankParty(bank), usd: hedgeLocal });
      });
    });

    // A corporate with floating debt hedges the part whose interest bill its own earnings could
    // not cover if rates moved: the covenant is the test, and it is the borrower's own numbers.
    regionCompanies.forEach((comp) => {
      // §7.311 — ladder reads on rows, fold order = chain order = array order.
      const TS = v2g.tranches;
      let floatingLocal = 0;
      let interestLocal = 0;
      for (const r of ladderRowsOf(v2g, comp.id)) {
        const isFloating = (TS.flags[r] & TR_FLOATING) !== 0;
        if (isFloating) floatingLocal += TS.principalLocal[r];
        interestLocal += TS.principalLocal[r]
          * (!isFloating
            ? (Number.isNaN(TS.couponRate[r]) ? 0.05 : TS.couponRate[r])
            : reg.policyRate + ((Number.isNaN(TS.floatingMarginBps[r]) ? 200 : TS.floatingMarginBps[r])) / 10000);
      }
      if (!(floatingLocal > 0)) return;
      const affordableInterestLocal = Math.max(0, comp.ebitda) / COVENANT_INTEREST_COVERAGE;
      const headroomLocal = affordableInterestLocal - interestLocal;
      // What a two-sigma rise would add to the bill, against the headroom it has.
      const shockCostLocal = floatingLocal * (moveBps / 10000);
      if (shockCostLocal <= headroomLocal) return;
      const wantedLocal = Math.min(floatingLocal, ((shockCostLocal - headroomLocal) / Math.max(1e-9, shockCostLocal)) * floatingLocal);
      // Floating corporate debt is short-dated relative to the curve; it hedges at the 5-year.
      const alreadyPayingLocal = standing.coverLocal('IRS', 'a', companyPartyKey(comp.ticker), undefined, 's5');
      const hedgeLocal = Math.max(0, wantedLocal - alreadyPayingLocal);
      if (!(hedgeLocal > 0)) return;
      payDemandByTenor.get('s5')!.push({ party: companyParty(comp), usd: hedgeLocal });
    });

    // ---- The RECEIVE-FIXED side: liability-matched books, whose reservation is the government
    // bond of the same tenor because that is the alternative they already have. ----
    const instruments: ClearingInstrument[] = [];
    const floatByTenor = new Map<SwapTenorKey, number>();
    SWAP_TENORS.forEach((k) => {
      const totalLocal = payDemandByTenor.get(k)!.reduce((a, d) => a + d.usd, 0);
      floatByTenor.set(k, totalLocal);
      if (!(totalLocal > 0)) return;
      const zeroRate = reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]] ?? reg.policyRate;
      instruments.push({
        id: swapInstrumentId(regionId, k),
        outstandingLocal: totalLocal,
        tradableFloatLocal: totalLocal,
        currentStat: (reg.swapParRateByTenor?.[k] ?? zeroRate) * 10000,
        statKind: 'YIELD_LIKE',
        durationYears: SWAP_TENOR_YEARS[k],
      });
    });
    if (instruments.length === 0) return;

    const irsEntityIds = new Set(regionEntities.map((e) => e.id));
    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      // How much duration it is short: a liability-matched book's assets are shorter than its
      // claims, and the gap is what it will take synthetically when the cash market cannot
      // supply it. Sized by the book itself, never by a share anyone chose.
      // §3.13-READ C2: THE ROWS. This read `itemizedHoldings` — the week's OPENING positions —
      // and subtracted it from `institutionTotalAssetsLocal`, which reads the store. One
      // subtraction, two epochs: every bond the entity bought or sold in 07b/07c/07d/07f, ten to
      // fourteen stages earlier, showed up as duration gap it had not actually opened.
      const bondBookLocal = institutionBookLocal(ctx.v2, entity.id, carriesRateDuration);
      const alreadyReceivingLocal = standing.coverLocal('IRS', 'b', institutionPartyKey(entity.id));
      const durationGapLocal = Math.max(0, institutionTotalAssetsLocal(ctx, entity) - bondBookLocal - alreadyReceivingLocal);
      if (durationGapLocal <= 0) return { id: entity.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId };
      SWAP_TENORS.forEach((k) => {
        if (!(floatByTenor.get(k)! > 0)) return;
        const zeroBps = (reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]] ?? reg.policyRate) * 10000;
        demandByInstrumentId.set(swapInstrumentId(regionId, k), {
          // It will not receive less fixed than the bond of the same tenor already pays it.
          reservationStat: zeroBps,
          maxHoldingLocal: durationGapLocal,
          // And scales in over the move the market itself can make in a week: past that, the
          // swap is plainly better than the bond and it takes all it is allowed.
          fullSizeStatRange: moveBps,
        });
      });
      return { id: entity.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId };
    });

    const result = clearFinancialAsset(instruments, participants, new Map(), {
      // Bilateral, cleared through the same house as every other book; the desks' spread on it
      // is DER's next slice, with the CDS and option books that share the machinery.
      dealerSpreadBps: 0,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `swap:${id}`));

    // ---- Strike the week's contracts. At one cleared par rate the receivers are fungible, so
    // each payer's hedge draws from each receiver in proportion to what that receiver took. ----
    const struck: DerivativeContract[] = [];
    const parByTenor: Record<string, number> = { ...(reg.swapParRateByTenor ?? {}) };
    let seq = 0;
    SWAP_TENORS.forEach((k) => {
      const instrumentId = swapInstrumentId(regionId, k);
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) return;
      parByTenor[k] = Number((clearedBps / 10000).toFixed(6));
      const takenByEntity = new Map<EntityId, number>();
      let totalTakenLocal = 0;
      // §3.13-BOOK (c2b): the engine keys fills by PARTICIPANT id, a different space; the
      // book's own admitted set is what proves this one names an institution.
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        if (!isKnownEntity(irsEntityIds, participantId)) return;
        const entityId = participantId;
        const usd = byInstrument.get(instrumentId) ?? 0;
        if (usd <= 1) return;
        takenByEntity.set(entityId, usd);
        totalTakenLocal += usd;
      });
      if (totalTakenLocal <= 0) return;
      const demands = payDemandByTenor.get(k)!;
      const totalDemandLocal = demands.reduce((a, d) => a + d.usd, 0);
      const fundedShare = Math.min(1, totalTakenLocal / Math.max(1, totalDemandLocal));
      demands.forEach((d) => {
        const hedgedLocal = d.usd * fundedShare;
        if (hedgedLocal <= 1) return;
        takenByEntity.forEach((takenLocal, entityId) => {
          const notional = hedgedLocal * (takenLocal / totalTakenLocal);
          if (notional <= 1) return;
          struck.push({
            id: `${regionId}-IRS-${k}-${week}-${seq++}`,
            classId: 'IRS',
            regionId,
            a: d.party,
            b: { kind: 'INSTITUTION', id: entityId },
            notional: Math.round(notional),
            strike: parByTenor[k],
            referenceId: '',
            termKey: k,
            // §3.13c: the market it clears in.
            currency: currencyOf(regionId),
            struckWeek: week,
            maturityWeek: week + Math.round(SWAP_TENOR_YEARS[k] * 52),
          });
        });
      });
    });
    strikeDerivatives(ctx, state, struck);

    reg.swapParRateByTenor = parByTenor;
    // The published benchmark: the overnight print compounded, exactly as an overnight index is.
    const overnightRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
    reg.securedOvernightIndex = Number(
      ((reg.securedOvernightIndex ?? 100) * (1 + overnightRateAnnual / 52)).toFixed(6)
    );
    // And the curve built on it: two cleared repo prints and three cleared swap par rates. Every
    // point is a level something traded at this week, which is what a benchmark curve IS — as
    // against `zeroRates`, which is the SOVEREIGN curve, a different credit and a different thing.
    reg.securedCurve = {
      on: reg.repoRateAnnual,
      w13: reg.repoTermRateAnnual,
      y2: parByTenor.s2,
      y5: parByTenor.s5,
      y10: parByTenor.s10,
    };
    // The SWAP SPREAD: the par rate on SECURED overnight money against the government's own
    // yield at the same tenor. That comparison is what a swap spread actually is — two credits
    // and two markets, one number — and it only became meaningful once the floating leg stopped
    // referencing an administered rate. It is the first cross-market basis this model produces.
    reg.swapSpreadBpsByTenor = Object.fromEntries(SWAP_TENORS.map((k) => [
      k,
      Number((((parByTenor[k] ?? 0) - (reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]] ?? 0)) * 10000).toFixed(1)),
    ]));
  });
}

export const IRS_MARKET: DerivativeMarket = {
  classId: 'IRS',
  phase: 'CLEARING',
  settles: 'BEFORE_MARKET',
  run: runSwapMarket,
};
