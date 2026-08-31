/**
 * DER1 — the interest-rate swap market: par rates at 2/5/10 years, cleared on the same engine as
 * every other book. The shape of the market, and why it is the one to build first, is documented
 * once in domain/swaps.ts.
 *
 * The float this auction prices is the pay-fixed demand: what the hedgers whose exposure their
 * own balance sheets cannot absorb need someone to take. The participants are the receivers —
 * liability-matched books that never have enough duration — and their reservation is the
 * government bond of the same tenor, because that is the alternative they already have. A
 * receiver who can buy a 10-year at 4% will not receive fixed at 3.5%, and that is the whole of
 * why a swap spread exists.
 *
 * Runs after 07c (the sovereign curve is this week's cleared one, which every schedule here reads)
 * and before settlement, so the week's net swap payments move real money between named parties.
 */

import { GameState, RegionId } from '../../../types';
import {
  SwapContract, SwapTenorKey, SWAP_TENORS, SWAP_TENOR_YEARS, SWAP_TENOR_ZERO_FIELD, swapPartyKey,
  swapWeeklyNetToReceiverUSD, repricingLossUSD, SwapParty,
} from '../../../domain/swaps';
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, YIELD_LIKE_MIN_WEEKLY_MOVE_BPS } from './financial-clearing-engine';
import { isActiveCompany } from '../../../domain/company';
import { BANK_WORKING_CAPITAL_RATIO } from './bank-lending';

/** Swaps are struck for their tenor and run to it — there is no secondary market here yet. */
const swapInstrumentId = (regionId: RegionId, key: SwapTenorKey) => `${regionId}-IRS-${key}`;

/** The coverage a lender's covenant expects — one owner now (corporate-financing.ts), because
 *  G5's committed line is sized off exactly the same test from the lender's side (rule 3). */
import { COVENANT_INTEREST_COVERAGE } from './corporate-financing';

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

export function runSwapClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg?.zeroRates) return;

    // ---- Last week's book settles, and what matured leaves. The floating leg pays what the week
    // actually printed, so a payer of fixed gains exactly when rates rose against it. ----
    const priorBook: SwapContract[] = reg.swapBook ?? [];
    const partyRef = (p: SwapParty): PartyRef =>
      p.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: p.id }
        : p.kind === 'BANK' ? { kind: 'BANK', ticker: p.ticker }
          : { kind: 'COMPANY', ticker: p.ticker };
    // DER/CAL — THE FLOATING LEG PAYS THE SECURED OVERNIGHT RATE, WHICH MAKES THESE OIS.
    //
    // It used to pay `policyRate`: an administered number, not a traded one, so the swap curve
    // was a term structure on something nobody transacts at. The overnight benchmark this model
    // actually produces is the cleared GC repo print (WS6/REPO) — its own SOFR — and a swap that
    // references it is what a modern rates market is built on. The reference is the rate the week
    // PRINTED, compounded into the index below, so a floating leg pays realised overnight money.
    const overnightRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
    priorBook.forEach((c) => {
      const netUSD = swapWeeklyNetToReceiverUSD(c, overnightRateAnnual);
      if (Math.abs(netUSD) < 1) return;
      if (netUSD > 0) pay(ctx, { payer: partyRef(c.payer), payee: partyRef(c.receiver), amountUSD: netUSD, reason: 'swap settlement' });
      else pay(ctx, { payer: partyRef(c.receiver), payee: partyRef(c.payer), amountUSD: -netUSD, reason: 'swap settlement' });
    });
    const carried = priorBook.filter((c) => c.maturityWeek > ctx.nextWeek);

    // §7.241: NET THE STANDING BOOK OUT OF THE SIZING. Without this, a bank re-hedged its ENTIRE
    // uncovered repricing exposure every week while last week's 2-10y swaps still ran, and a
    // receiver refilled its whole duration gap weekly — notional accumulated without bound
    // (~52x/yr at steady state). 07h nets `alreadyHedgedUSD` and 07i nets standing positions;
    // this book alone was missing the rule its two siblings already carry.
    const carriedPayUSDByPartyTenor = new Map<string, number>();
    const carriedReceiveUSDByParty = new Map<string, number>();
    carried.forEach((c) => {
      const pk = `${swapPartyKey(c.payer)}|${c.tenorKey}`;
      carriedPayUSDByPartyTenor.set(pk, (carriedPayUSDByPartyTenor.get(pk) ?? 0) + c.notionalUSD);
      const rk = swapPartyKey(c.receiver);
      carriedReceiveUSDByParty.set(rk, (carriedReceiveUSDByParty.get(rk) ?? 0) + c.notionalUSD);
    });

    const moveBps = twoSigmaYieldMoveBps(reg);
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && !c.isBankEntity && !c.isInstitutionalEntity && isActiveCompany(c)
    );
    const regionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && (e.entityType === 'INSURER' || e.entityType === 'PENSION_FUND')
    );

    // ---- The PAY-FIXED side, sized by what each hedger's own sheet cannot absorb. ----
    const payDemandByTenor = new Map<SwapTenorKey, { party: SwapParty; usd: number }[]>();
    SWAP_TENORS.forEach((k) => payDemandByTenor.set(k, []));

    // A bank's fixed-rate sovereign book is funded by liabilities that reprice with policy. Its
    // capital can absorb a repricing only down to the ratio it must keep; what it cannot absorb
    // is what it hedges, at the tenor its book actually sits in.
    regionBanks.forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const rwaUSD = sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD;
      const absorbableUSD = Math.max(0, sheet.bankEquityUSD - rwaUSD * BANK_WORKING_CAPITAL_RATIO);
      SWAP_TENORS.forEach((k) => {
        const bucketKey = k === 's2' ? 't2' : k === 's5' ? 't5' : 't10';
        const bookUSD = Number(sheet.sovereignBondHoldingsByTenor?.[bucketKey] ?? 0);
        if (!(bookUSD > 0)) return;
        const lossUSD = repricingLossUSD(bookUSD, SWAP_TENOR_YEARS[k], moveBps);
        if (lossUSD <= absorbableUSD) return;
        // Hedge the notional whose repricing loss is the excess — the rest it can carry.
        const wantedUSD = ((lossUSD - absorbableUSD) / Math.max(1e-9, lossUSD)) * bookUSD;
        const alreadyPayingUSD = carriedPayUSDByPartyTenor.get(`BANK:${bank.ticker}|${k}`) ?? 0;
        const hedgeUSD = Math.max(0, wantedUSD - alreadyPayingUSD);
        if (!(hedgeUSD > 0)) return;
        payDemandByTenor.get(k)!.push({ party: { kind: 'BANK', ticker: bank.ticker }, usd: hedgeUSD });
      });
    });

    // A corporate with floating debt hedges the part whose interest bill its own earnings could
    // not cover if rates moved: the covenant is the test, and it is the borrower's own numbers.
    regionCompanies.forEach((comp) => {
      const floating = (comp.debtTranches || []).filter((t) => t.rateType === 'FLOATING');
      const floatingUSD = floating.reduce((a, t) => a + t.principalUSD, 0);
      if (!(floatingUSD > 0)) return;
      const interestUSD = (comp.debtTranches || []).reduce((a, t) => a + t.principalUSD
        * (t.rateType === 'FIXED' ? (t.couponRate ?? 0.05) : reg.policyRate + (t.floatingMarginBps ?? 200) / 10000), 0);
      const affordableInterestUSD = Math.max(0, comp.ebitda) / COVENANT_INTEREST_COVERAGE;
      const headroomUSD = affordableInterestUSD - interestUSD;
      // What a two-sigma rise would add to the bill, against the headroom it has.
      const shockCostUSD = floatingUSD * (moveBps / 10000);
      if (shockCostUSD <= headroomUSD) return;
      const wantedUSD = Math.min(floatingUSD, ((shockCostUSD - headroomUSD) / Math.max(1e-9, shockCostUSD)) * floatingUSD);
      const alreadyPayingUSD = carriedPayUSDByPartyTenor.get(`COMPANY:${comp.ticker}|s5`) ?? 0;
      const hedgeUSD = Math.max(0, wantedUSD - alreadyPayingUSD);
      if (!(hedgeUSD > 0)) return;
      // Floating corporate debt is short-dated relative to the curve; it hedges at the 5-year.
      payDemandByTenor.get('s5')!.push({ party: { kind: 'COMPANY', ticker: comp.ticker }, usd: hedgeUSD });
    });

    // ---- The RECEIVE-FIXED side: liability-matched books, whose reservation is the government
    // bond of the same tenor because that is the alternative they already have. ----
    const instruments: ClearingInstrument[] = [];
    const floatByTenor = new Map<SwapTenorKey, number>();
    SWAP_TENORS.forEach((k) => {
      const totalUSD = payDemandByTenor.get(k)!.reduce((a, d) => a + d.usd, 0);
      floatByTenor.set(k, totalUSD);
      if (!(totalUSD > 0)) return;
      const zeroRate = reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]] ?? reg.policyRate;
      instruments.push({
        id: swapInstrumentId(regionId, k),
        outstandingUSD: totalUSD,
        tradableFloatUSD: totalUSD,
        currentStat: (reg.swapParRateByTenor?.[k] ?? zeroRate) * 10000,
        statKind: 'YIELD_LIKE',
        durationYears: SWAP_TENOR_YEARS[k],
      });
    });
    if (instruments.length === 0) {
      reg.swapBook = carried;
      return;
    }

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      // How much duration it is short: a liability-matched book's assets are shorter than its
      // claims, and the gap is what it will take synthetically when the cash market cannot
      // supply it. Sized by the book itself, never by a share anyone chose.
      const bondBookUSD = (entity.itemizedHoldings || [])
        .filter((h) => h.instrumentType === 'GOV_BOND' || h.instrumentType === 'CORP_BOND')
        .reduce((a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0);
      const alreadyReceivingUSD = carriedReceiveUSDByParty.get(`INSTITUTION:${entity.id}`) ?? 0;
      const durationGapUSD = Math.max(0, entity.totalAssetsUSD - bondBookUSD - alreadyReceivingUSD);
      if (durationGapUSD <= 0) return { id: entity.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId };
      SWAP_TENORS.forEach((k) => {
        if (!(floatByTenor.get(k)! > 0)) return;
        const zeroBps = (reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]] ?? reg.policyRate) * 10000;
        demandByInstrumentId.set(swapInstrumentId(regionId, k), {
          // It will not receive less fixed than the bond of the same tenor already pays it.
          reservationStat: zeroBps,
          maxHoldingUSD: durationGapUSD,
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
      maxWeeklyStatMovePct: 0.25,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

    // ---- Strike the week's contracts. At one cleared par rate the receivers are fungible, so
    // each payer's hedge draws from each receiver in proportion to what that receiver took. ----
    const newContracts: SwapContract[] = [];
    const parByTenor: Record<string, number> = { ...(reg.swapParRateByTenor ?? {}) };
    let seq = 0;
    SWAP_TENORS.forEach((k) => {
      const instrumentId = swapInstrumentId(regionId, k);
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) return;
      parByTenor[k] = Number((clearedBps / 10000).toFixed(6));
      const takenByEntity = new Map<string, number>();
      let totalTakenUSD = 0;
      result.newParticipantHoldings.forEach((byInstrument, entityId) => {
        const usd = byInstrument.get(instrumentId) ?? 0;
        if (usd <= 1) return;
        takenByEntity.set(entityId, usd);
        totalTakenUSD += usd;
      });
      if (totalTakenUSD <= 0) return;
      const demands = payDemandByTenor.get(k)!;
      const totalDemandUSD = demands.reduce((a, d) => a + d.usd, 0);
      const fundedShare = Math.min(1, totalTakenUSD / Math.max(1, totalDemandUSD));
      demands.forEach((d) => {
        const hedgedUSD = d.usd * fundedShare;
        if (hedgedUSD <= 1) return;
        takenByEntity.forEach((takenUSD, entityId) => {
          const notionalUSD = hedgedUSD * (takenUSD / totalTakenUSD);
          if (notionalUSD <= 1) return;
          newContracts.push({
            id: `${regionId}-IRS-${k}-${ctx.nextWeek}-${seq++}`,
            regionId,
            tenorKey: k,
            payer: d.party,
            receiver: { kind: 'INSTITUTION', id: entityId },
            notionalUSD: Math.round(notionalUSD),
            fixedRateAnnual: parByTenor[k],
            struckWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + Math.round(SWAP_TENOR_YEARS[k] * 52),
          });
        });
      });
    });

    reg.swapBook = [...carried, ...newContracts];
    reg.swapParRateByTenor = parByTenor;
    // The published benchmark: the overnight print compounded, exactly as an overnight index is.
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
