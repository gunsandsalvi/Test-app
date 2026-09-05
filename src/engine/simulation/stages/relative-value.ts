/**
 * §3.17e-ii-a — THE RELATIVE-VALUE BOOK'S WEEK. Before any book opens, each `RELATIVE_VALUE`
 * fund reads the registry of comparables (`domain/relative-value.ts`) off last week's prints,
 * sizes each pair by its edge net of carry against what its cash and its broker's line carry,
 * and states BOTH legs on the context: the market that clears each leg reads it there (07c for a
 * sovereign cash leg, the bond futures line for the future leg) and the fund bids or offers in
 * that book like any other participant — at the leg's price, in the leg's size. The book's
 * position is never stored here: it is the fund's rows in the sovereign register and its cover
* in the standing derivatives book (rule 19), and each week's legs are what moves those to the
 * target — up when the edge is there, DOWN when it has gone (§3.17e-ii-b): a reduction sells the
 * deliverable and buys the line back to target at what the books clear; a pair the line no
 * longer carries, or that has lost what its future leg was margined for, is cut whole at any
 * price. That is the limit to arbitrage, and why a basis can persist. The first comparable is
 * the bond basis, in BOTH directions (§3.17e-iii-a): a cheap future is long the line and short
 * the cash, and a cash leg below what the book holds sells what it has and states the rest as a
 * borrow need for the lending book. The second comparable (§3.17f-i) is the CDS–cash basis: the
 * name's own rung against protection on it, the bond long on the line and the cover bought.
 *
 * Runs after prime-brokerage (the line the cash leg is financed on is struck) and before 07b.
 */

import { GameState, RegionId } from '../../../types';
import type { InstitutionalEntity } from '../../../domain/institutions';
import type { DerivativeContract } from '../../../domain/derivatives/contract';
import type { StandingBook } from '../../../domain/derivatives/standing-book';
import type { DerivativeLifecycleView } from './derivative-lifecycle';
import { WeeklyStepContext } from './context';
import { REGION_IDS } from '../../../domain/geography';
import { institutionPartyKey } from '../../../domain/derivatives/contract';
import { initialMarginRateOf } from '../../../domain/derivatives/registry';
import { BOND_FUTURE_TERM_KEY, nextDeliveryWeek, bondDurationYears, bondFutureWeeklyMoveOf } from '../../../domain/derivatives/classes/bond-future';
import { bondFutureInstrumentId } from '../../../domain/instrument-keys';
import { bondBasisRead, bondBasisMirrorRead, bondBasisLegs, cdsBasisRead, cdsBasisLegs, indexArbRead, indexArbLegs, swapSpreadRead, swapSpreadLegs, seniorityRead, seniorityLegs, mergeLegs, edgeBps, arbTargetShare, arbCapacityLocal, pairPnLLocal, stoppedOut } from '../../../domain/relative-value';
import { asInstrumentId } from '../../../domain/ids';
import { trancheClearedPricePerFace, trancheTerms, rowSpreadBps, priceAtSpreadOnTranche, IS_BOND_ROW, nearestBondRowOf } from '../../credit-price';
import { TR_SUBORDINATED } from '../../../engine2/tranches';
import { ladderRowsOf, trancheIdOf } from '../../../engine2/tranches';
import { bookRowsOf, instrumentIdAt, rowUnits, rowBasisLocal as rowBasisOf } from '../../../engine2/holdings';
import { CDS_BENCHMARK_TENOR, CDS_TENOR_YEARS, cdsTenorWeeksOf } from '../../../domain/derivatives/classes/cds';
import { cdsInstrumentId, creditIndexInstrumentId, swapInstrumentId } from '../../../domain/instrument-keys';
import { SWAP_TENORS, SWAP_TENOR_YEARS, SWAP_TENOR_ZERO_FIELD } from '../../../domain/derivatives/classes/irs';
import { materializeGovLadder } from '../../../engine2/tranches';
import { priceFromYield } from '../../../domain/pricing/bond';
import { trancheRowOf } from '../../../engine2/tranches';
import { CDS_INDEX_TENOR_WEEKS } from '../../../domain/derivatives/classes/cds-index';
import { isActiveCompany } from '../../../domain/company';
import { sovereignRowsOf } from '../../sovereign-register';
import { primeBrokerageBookOf, derivativesBookOf, securityLoanBookOf } from '../../ledger/contract-ledger';
import { sharesOnLoan, stockLoanNetLocal } from '../../../domain/securities-lending';
import { rowBasisLocal } from '../../../engine2/holdings';
import { entityCashOf } from '../../ledger/accounts';
import { buildDerivativeMarketView, standingBookOf } from './derivative-lifecycle';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { entityRequiredReturn } from './asset-allocation';

export function runRelativeValueStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.relativeValueLegs = [];
  ctx.borrowNeeds = [];
  const funds = ctx.updatedInstitutionalEntities.filter((e) => e.entityType === 'HEDGE_FUND' && e.hedgeFundStrategy === 'RELATIVE_VALUE' && !e.isDefaulted);
  if (funds.length === 0) return;
  const view = buildDerivativeMarketView(ctx);
  const standing = standingBookOf(ctx, state);
  const book = derivativesBookOf(ctx);
  const week = ctx.nextWeek;
  readBondBasis(ctx, funds, view, standing, book, week);
  readCdsBasis(ctx, funds, view, standing, book, week);
  readIndexBasis(ctx, funds, view, standing, book, week);
  readSwapSpread(ctx, funds, view, standing, book, week);
  readSeniority(ctx, funds, week);
  // Two comparables on one instrument — the ten-year rung under the bond basis and the ten-year
  // swap spread — state one leg between them.
  ctx.relativeValueLegs = mergeLegs(ctx.relativeValueLegs);
}

/** §3.17f-iii — THE SWAP SPREAD at each tenor: the par rate against the sovereign rung nearest
 *  it; received against the rung shorted, or paid against the rung bought. */
function readSwapSpread(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg || !reg.swapParRateByTenor || !reg.zeroRates) return;
    const regionFunds = funds.filter((f) => f.region === regionId);
    if (regionFunds.length === 0) return;
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const ladder = materializeGovLadder(ctx.v2, regionId);
    SWAP_TENORS.forEach((k) => {
      const par = reg.swapParRateByTenor?.[k];
      const govYield = reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]];
      if (!(par !== undefined && par > 0) || !(govYield > 0)) return;
      const years = SWAP_TENOR_YEARS[k];
      // The rung nearest the swap's tenor, with a print.
      let rung: typeof ladder[number] | undefined; let gap = Number.POSITIVE_INFINITY;
      ladder.forEach((t) => { const g = Math.abs((t.maturityWeek - week) / 52 - years); if (t.maturityWeek > week + 1 && g < gap) { gap = g; rung = t; } });
      if (!rung) return;
      const bondId = rung.id;
      const cashPrice = trancheClearedPricePerFace(ctx.v2, bondId);
      const row = trancheRowOf(ctx.v2, bondId);
      if (!(cashPrice !== undefined && cashPrice > 0) || row === undefined) return;
      const terms = trancheTerms(ctx.v2, row, week, reg.policyRate);
      const priceAtYieldBps = (bps: number) => priceFromYield(terms, bps / 10000);
      const swapId = swapInstrumentId(regionId, k);
      const marginRate = initialMarginRateOf({ classId: 'IRS', regionId, reference: { kind: 'RATE' }, termKey: k, maturityWeek: week + Math.round(years * 52) }, view);
      const weeklyMoveBps = Math.max(1, view.rateWeeklyMoveBps(regionId, k) ?? 1);
      const loanBook = securityLoanBookOf(ctx.v2, regionId).filter((l) => l.instrumentId === bondId);
      const swapSpreadBps = (par - govYield) * 10000;
      regionFunds.forEach((fund) => {
        const line = pbBook.find((l) => l.fundId === fund.id);
        const read = swapSpreadRead({ swapSpreadBps, borrowFeeBps: reg.borrowFeeBpsByCompanyId?.[bondId] ?? 0, financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate, requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)) });
        const share = arbTargetShare(edgeBps(read.long), edgeBps(read.mirror), weeklyMoveBps);
        const key = institutionPartyKey(fund.id);
        // The position: received less paid at this tenor; the rung's face less what is borrowed.
        const swapNet = standing.coverLocal('IRS', 'b', key, '', k) - standing.coverLocal('IRS', 'a', key, '', k);
        const rows = sovereignRowsOf(ctx.v2, fund.id).filter((r) => r.bondId === bondId);
        const heldFace = rows.reduce((a, r) => a + r.faceLocal, 0);
        const borrowedFace = sharesOnLoan(loanBook, 'borrower', fund.id, bondId);
        const bondNet = heldFace - borrowedFace;
        if (share === 0 && Math.abs(swapNet) <= 1 && Math.abs(bondNet) <= 1 && heldFace <= 1) return;
        const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
        const lines = book.filter((c) => c.classId === 'IRS' && c.termKey === k && c.regionId === regionId
          && ((c.a.kind === 'INSTITUTION' && c.a.id === fund.id) || (c.b.kind === 'INSTITUTION' && c.b.id === fund.id)));
        const pnlLocal = pairPnLLocal({
          cashValueLocal: rows.reduce((a, r) => a + r.valueLocal, 0) + stockLoanNetLocal(loanBook, fund.id, () => cashPrice),
          cashBasisLocal: rows.reduce((a, r) => a + rowBasisLocal(ctx.v2, r.row), 0),
          futuresSettledToFundLocal: lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0),
        });
        const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
        const carriedFace = capacityLocal / cashPrice;
        const exposureFace = Math.max(Math.abs(swapNet), Math.abs(bondNet));
        const targetFace = stopped ? 0 : exposureFace > carriedFace ? Math.sign(share || swapNet) * carriedFace : share * carriedFace;
        const forced = stopped || exposureFace > carriedFace;
        const swapDelta = targetFace - swapNet;
        const bondDelta = -targetFace - bondNet;
        const legs = swapSpreadLegs({ regionId, swapInstrumentId: swapId, bondId, faceLocal: targetFace, govYieldBps: govYield * 10000, parBps: par * 10000, carryBps: (targetFace >= 0 ? read.long : read.mirror).carryBps, weeklyMoveBps, priceAtYieldBps, cashPrice, budgetLocal: Math.min(Math.max(0, bondDelta) * cashPrice, capacityLocal) });
        if (Math.abs(swapDelta) > 1) ctx.relativeValueLegs.push({ ...legs.swap, entityId: fund.id, faceLocal: swapDelta, forced });
        if (bondDelta > 1) ctx.relativeValueLegs.push({ ...legs.bond, entityId: fund.id, faceLocal: bondDelta, forced });
        else if (bondDelta < -1) {
          const sellFace = Math.min(-bondDelta, heldFace);
          if (sellFace > 1) ctx.relativeValueLegs.push({ ...legs.bond, entityId: fund.id, faceLocal: -sellFace, forced });
          const borrowFace = -bondDelta - sellFace;
          if (borrowFace > 1) ctx.borrowNeeds.push({ entityId: fund.id, regionId, instrumentId: bondId, units: borrowFace });
        }
      });
    });
  });
}

/** §3.17f-ii — THE INDEX AGAINST ITS NAMES: the series on the run against its constituents'
 *  benchmark prints, both directions, both legs protection and both margined. */
function readIndexBasis(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg || reg.creditIndexSeriesId === undefined) return;
    const regionFunds = funds.filter((f) => f.region === regionId);
    if (regionFunds.length === 0) return;
    const seriesId = reg.creditIndexSeriesId;
    const series = reg.creditIndexSeries?.[seriesId];
    const hist = reg.creditIndexSpreadHistoryBySeries?.[seriesId];
    const indexPrintBps = hist?.[hist.length - 1];
    if (!series || !(indexPrintBps !== undefined && indexPrintBps > 0)) return;
    const names = series.constituents.map((id) => ({ id, printBps: view.cdsSpreadBps(id, CDS_BENCHMARK_TENOR) })).filter((nm) => nm.printBps > 0);
    if (names.length === 0) return;
    const namesMeanBps = names.reduce((a, nm) => a + nm.printBps, 0) / names.length;
    const indexId = creditIndexInstrumentId(seriesId);
    const indexMarginRate = initialMarginRateOf({ classId: 'CDS_INDEX', regionId, reference: { kind: 'BASKET', regionId, seriesId }, termKey: '', maturityWeek: week + CDS_INDEX_TENOR_WEEKS }, view);
    const namesMarginRate = names.reduce((a, nm) => a + initialMarginRateOf({ classId: 'CDS', regionId, reference: { kind: 'ISSUER', issuerId: nm.id }, termKey: CDS_BENCHMARK_TENOR, maturityWeek: week + cdsTenorWeeksOf(CDS_BENCHMARK_TENOR) }, view), 0) / names.length;
    const weeklyMoveBps = Math.max(1, view.creditIndexWeeklyMoveBps(regionId, seriesId) ?? 1);
    regionFunds.forEach((fund) => {
      const read = indexArbRead({ indexPrintBps, namesMeanBps, indexMarginRate, namesMarginRate, requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)) });
      const share = arbTargetShare(edgeBps(read.long), edgeBps(read.mirror), weeklyMoveBps);
      const key = institutionPartyKey(fund.id);
      // The position: written less bought on the index line; bought less written across the names.
      const indexNet = standing.coverLocal('CDS_INDEX', 'b', key, seriesId) - standing.coverLocal('CDS_INDEX', 'a', key, seriesId);
      const namesNet = names.reduce((a, nm) => a + standing.coverLocal('CDS', 'a', key, nm.id, CDS_BENCHMARK_TENOR) - standing.coverLocal('CDS', 'b', key, nm.id, CDS_BENCHMARK_TENOR), 0);
      if (share === 0 && Math.abs(indexNet) <= 1 && Math.abs(namesNet) <= 1) return;
      const lines = book.filter((c) => ((c.classId === 'CDS_INDEX' && c.reference.kind === 'BASKET' && c.reference.seriesId === seriesId)
        || (c.classId === 'CDS' && c.reference.kind === 'ISSUER' && names.some((nm) => nm.id === (c.reference as { issuerId: string }).issuerId)))
        && ((c.a.kind === 'INSTITUTION' && c.a.id === fund.id) || (c.b.kind === 'INSTITUTION' && c.b.id === fund.id)));
      const pnlLocal = lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0);
      const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
      // Nothing is funded: the pair is what the fund's capital margins on both legs.
      const carriedFace = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal) / Math.max(1e-9, indexMarginRate + namesMarginRate);
      const exposureFace = Math.max(Math.abs(indexNet), Math.abs(namesNet));
      const targetFace = stopped ? 0 : exposureFace > carriedFace ? Math.sign(share || indexNet) * carriedFace : share * carriedFace;
      const forced = stopped || exposureFace > carriedFace;
      const indexDelta = targetFace - indexNet;
      const namesDelta = targetFace - namesNet;
      const legs = indexArbLegs({ regionId, indexInstrumentId: indexId, names: names.map((nm) => ({ instrumentId: cdsInstrumentId(regionId, nm.id, CDS_BENCHMARK_TENOR), printBps: nm.printBps })), faceLocal: targetFace, indexPrintBps, namesMeanBps, carryBps: read.long.carryBps, weeklyMoveBps });
      if (Math.abs(indexDelta) > 1) ctx.relativeValueLegs.push({ ...legs.index, entityId: fund.id, faceLocal: indexDelta, forced });
      if (Math.abs(namesDelta) > 1) legs.names.forEach((leg) => ctx.relativeValueLegs.push({ ...leg, entityId: fund.id, faceLocal: -namesDelta / names.length, forced }));
    });
  });
}

/** §3.17f-i — THE CDS–CASH BASIS: every name in the fund's region with a protection print and a
 *  cash rung near the benchmark tenor. Future-rich only in its cash direction: the bond long is
 *  financed on the line; the mirror needs a corporate bond borrow (§3 step 17f-v). */
function readCdsBasis(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const regionFunds = funds.filter((f) => f.region === regionId);
    if (regionFunds.length === 0) return;
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const loanBook = securityLoanBookOf(ctx.v2, regionId);
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const tenorYears = CDS_TENOR_YEARS[CDS_BENCHMARK_TENOR];
    ctx.updatedCompanies.forEach((issuer) => {
      // §3.26-c: a name whose protection has never printed has no CDS leg to read a basis on.
      const issuerCdsBps = issuer.cdsSpreadBps;
      if (issuer.region !== regionId || !isActiveCompany(issuer) || issuer.isBankEntity || issuerCdsBps === undefined || !(issuerCdsBps > 0)) return;
      // THE RUNG: the issuer's own bond nearest the benchmark tenor, with a print and a spread.
      const rung = nearestBondRowOf(ctx.v2, issuer.id, week, tenorYears);
      if (rung === undefined) return;
      const bondId = trancheIdOf(ctx.v2, rung);
      const cashPrice = trancheClearedPricePerFace(ctx.v2, bondId);
      const cashSpreadBps = rowSpreadBps(ctx.v2, reg, rung, week);
      if (!(cashPrice !== undefined && cashPrice > 0) || cashSpreadBps === undefined) return;
      const terms = trancheTerms(ctx.v2, rung, week, reg.policyRate);
      const priceAtSpread = (bps: number) => priceAtSpreadOnTranche(terms, reg.zeroRates, bps);
      const cdsId = cdsInstrumentId(regionId, issuer.id, CDS_BENCHMARK_TENOR);
      const marginRate = initialMarginRateOf({ classId: 'CDS', regionId, reference: { kind: 'ISSUER', issuerId: issuer.id }, termKey: CDS_BENCHMARK_TENOR, maturityWeek: week + cdsTenorWeeksOf(CDS_BENCHMARK_TENOR) }, view);
      const weeklyMoveBps = Math.max(1, view.cdsSpreadWeeklyMoveBps(issuer.id, CDS_BENCHMARK_TENOR) ?? 1);
      let cheapestReadBps = Number.POSITIVE_INFINITY, cheapestMirrorBps = Number.POSITIVE_INFINITY;
      regionFunds.forEach((fund) => {
        const line = pbBook.find((l) => l.fundId === fund.id);
        const requiredReturnAnnual = entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund));
        const read = cdsBasisRead({ cashSpreadBps, cdsSpreadBps: issuerCdsBps, financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate, requiredReturnAnnual });
        // §3.17f-v: the mirror — a rich rung against cheap cover — sells the rung (borrowed
        // through the lending book) and writes the cover, carrying the borrow fee and the margin.
        const mirror = { deviationBps: -read.deviationBps, carryBps: (reg.borrowFeeBpsByCompanyId?.[bondId] ?? 0) + Math.max(0, marginRate) * Math.max(0, requiredReturnAnnual) * 10000 };
        cheapestReadBps = Math.min(cheapestReadBps, read.carryBps); cheapestMirrorBps = Math.min(cheapestMirrorBps, mirror.carryBps);
        const share = arbTargetShare(edgeBps(read), edgeBps(mirror), weeklyMoveBps);
        // The position: the rung on its register less what it has borrowed of it, and the
        // protection it holds on the name.
        const rows = bookRowsOf(ctx.v2, fund.id).filter((r) => instrumentIdAt(ctx.v2, r) === bondId);
        const rungLoans = loanBook.filter((l) => l.instrumentId === bondId);
        const heldFace = rows.reduce((a, r) => a + rowUnits(ctx.v2.holdings, r), 0);
        const netFace = heldFace - sharesOnLoan(rungLoans, 'borrower', fund.id, bondId);
        const key = institutionPartyKey(fund.id);
        const coverFace = standing.coverLocal('CDS', 'a', key, issuer.id) - standing.coverLocal('CDS', 'b', key, issuer.id);
        if (share === 0 && Math.abs(netFace) <= 1 && Math.abs(coverFace) <= 1 && heldFace <= 1) return;
        const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
        const lines = book.filter((c) => c.classId === 'CDS' && c.reference.kind === 'ISSUER' && c.reference.issuerId === issuer.id
          && ((c.a.kind === 'INSTITUTION' && c.a.id === fund.id) || (c.b.kind === 'INSTITUTION' && c.b.id === fund.id)));
        const pnlLocal = pairPnLLocal({
          cashValueLocal: rows.reduce((a, r) => a + ctx.v2.holdings.qtyLocal[r], 0) + stockLoanNetLocal(rungLoans, fund.id, () => cashPrice),
          cashBasisLocal: rows.reduce((a, r) => a + rowBasisOf(ctx.v2, r), 0),
          futuresSettledToFundLocal: lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0),
        });
        const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
        const carriedFace = capacityLocal / cashPrice;
        const exposureFace = Math.max(Math.abs(netFace), Math.abs(coverFace));
        const targetFace = stopped ? 0 : exposureFace > carriedFace ? Math.sign(share || netFace) * carriedFace : share * carriedFace;
        const forced = stopped || exposureFace > carriedFace;
        const cashDelta = targetFace - netFace;
        const coverDelta = targetFace - coverFace;
        const legs = cdsBasisLegs({
          regionId, bondId, cdsInstrumentId: cdsId, faceLocal: targetFace, cashSpreadBps, cdsSpreadBps: issuerCdsBps,
          carryBps: (targetFace >= 0 ? read : mirror).carryBps, weeklyMoveBps, priceAtSpread, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
        });
        if (cashDelta > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta, forced });
        else if (cashDelta < -1) {
          const sellFace = Math.min(-cashDelta, heldFace);
          if (sellFace > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: -sellFace, forced });
          const borrowFace = -cashDelta - sellFace;
          if (borrowFace > 1) ctx.borrowNeeds.push({ entityId: fund.id, regionId, instrumentId: bondId, units: borrowFace });
        }
        if (Math.abs(coverDelta) > 1) ctx.relativeValueLegs.push({ ...legs.protection, entityId: fund.id, faceLocal: -coverDelta, forced });
      });
      // §3.27-iii-a: what the cheapest arbitrageur faced, each way — the bound P2 holds the basis to.
      if (Number.isFinite(cheapestReadBps)) (reg.cdsBasisCarryBpsByIssuer ??= {})[issuer.id] = { week, readBps: cheapestReadBps, mirrorBps: cheapestMirrorBps };
    });
  });
}

/** §3.17f-v — SENIORITY: for each issuer, its senior and its subordinated rung nearest the
 *  benchmark tenor; a junior paying less than the senior is sold (borrowed) against the senior
 *  bought. A cash-only pair: no margin to stop on, the line's capacity is its limit. */
function readSeniority(ctx: WeeklyStepContext, funds: InstitutionalEntity[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const regionFunds = funds.filter((f) => f.region === regionId);
    if (regionFunds.length === 0) return;
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const loanBook = securityLoanBookOf(ctx.v2, regionId);
    const repoRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
    const tenorYears = CDS_TENOR_YEARS[CDS_BENCHMARK_TENOR];
    const TS = ctx.v2.tranches;
    ctx.updatedCompanies.forEach((issuer) => {
      if (issuer.region !== regionId || !isActiveCompany(issuer) || issuer.isBankEntity) return;
      let senior: number | undefined; let sub: number | undefined; let gS = Number.POSITIVE_INFINITY; let gJ = Number.POSITIVE_INFINITY;
      ladderRowsOf(ctx.v2, issuer.id).forEach((r) => {
        if (!IS_BOND_ROW(TS.flags[r]) || !(TS.principalLocal[r] > 0)) return;
        const g = Math.abs((TS.maturityWeek[r] - week) / 52 - tenorYears);
        if ((TS.flags[r] & TR_SUBORDINATED) !== 0) { if (g < gJ) { gJ = g; sub = r; } } else if (g < gS) { gS = g; senior = r; }
      });
      if (senior === undefined || sub === undefined) return;
      const seniorId = trancheIdOf(ctx.v2, senior); const subId = trancheIdOf(ctx.v2, sub);
      const seniorPrice = trancheClearedPricePerFace(ctx.v2, seniorId); const subPrice = trancheClearedPricePerFace(ctx.v2, subId);
      const seniorSpread = rowSpreadBps(ctx.v2, reg, senior, week); const subSpread = rowSpreadBps(ctx.v2, reg, sub, week);
      if (!(seniorPrice !== undefined && seniorPrice > 0) || !(subPrice !== undefined && subPrice > 0) || seniorSpread === undefined || subSpread === undefined) return;
      const seniorTerms = trancheTerms(ctx.v2, senior, week, reg.policyRate);
      const seniorPriceAtSpread = (bps: number) => priceAtSpreadOnTranche(seniorTerms, reg.zeroRates, bps);
      const subLoans = loanBook.filter((l) => l.instrumentId === subId);
      regionFunds.forEach((fund) => {
        const line = pbBook.find((l) => l.fundId === fund.id);
        const read = seniorityRead({ seniorSpreadBps: seniorSpread, subSpreadBps: subSpread, borrowFeeBps: reg.borrowFeeBpsByCompanyId?.[subId] ?? 0, financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual });
        const share = arbTargetShare(edgeBps(read), Number.NEGATIVE_INFINITY, 25);
        const seniorHeld = bookRowsOf(ctx.v2, fund.id).filter((r) => instrumentIdAt(ctx.v2, r) === seniorId).reduce((a, r) => a + rowUnits(ctx.v2.holdings, r), 0);
        const subHeld = bookRowsOf(ctx.v2, fund.id).filter((r) => instrumentIdAt(ctx.v2, r) === subId).reduce((a, r) => a + rowUnits(ctx.v2.holdings, r), 0);
        const subNet = subHeld - sharesOnLoan(subLoans, 'borrower', fund.id, subId);
        if (!(share > 0) && seniorHeld <= 1 && Math.abs(subNet) <= 1) return;
        const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
        const carriedFace = capacityLocal / seniorPrice;
        const exposureFace = Math.max(seniorHeld, Math.abs(subNet));
        const targetFace = exposureFace > carriedFace ? carriedFace : share * carriedFace;
        const forced = exposureFace > carriedFace;
        const seniorDelta = targetFace - seniorHeld;
        const subDelta = -targetFace - subNet;
        const legs = seniorityLegs({ regionId, seniorId, subId, faceLocal: targetFace, subSpreadBps: subSpread, carryBps: read.carryBps, weeklyMoveBps: 25, seniorPriceAtSpread, subPrice, budgetLocal: Math.min(Math.max(0, seniorDelta) * seniorPrice, capacityLocal) });
        if (Math.abs(seniorDelta) > 1) ctx.relativeValueLegs.push({ ...legs.senior, entityId: fund.id, faceLocal: seniorDelta, forced });
        if (subDelta > 1) ctx.relativeValueLegs.push({ ...legs.sub, entityId: fund.id, faceLocal: subDelta, forced });
        else if (subDelta < -1) {
          const sellFace = Math.min(-subDelta, subHeld);
          if (sellFace > 1) ctx.relativeValueLegs.push({ ...legs.sub, entityId: fund.id, faceLocal: -sellFace, forced });
          const borrowFace = -subDelta - sellFace;
          if (borrowFace > 1) ctx.borrowNeeds.push({ entityId: fund.id, regionId, instrumentId: subId, units: borrowFace });
        }
      });
    });
  });
}

/** §3.17e-ii — THE BOND BASIS, in both directions. */
function readBondBasis(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg || reg.bondFuturesBasis === undefined || reg.bondFuturesDeliverableId === undefined) return;
    // ---- THE BOND BASIS, as the line last printed it. A roll since the print leaves nothing to
    // read: the basis belongs to a delivery that has passed. ----
    const deliveryWeek = nextDeliveryWeek(week);
    const futureId = bondFutureInstrumentId(regionId, deliveryWeek);
    const hist = reg.bondFuturesPriceHistory?.[futureId];
    const futurePrice = hist?.[hist.length - 1];
    if (!(futurePrice !== undefined && futurePrice > 0)) return;
    const bondId = asInstrumentId(reg.bondFuturesDeliverableId);
    const cashPrice = trancheClearedPricePerFace(ctx.v2, bondId);
    const terms = view.sovereignBondTerms(regionId, bondId);
    if (!(cashPrice !== undefined && cashPrice > 0) || !terms) return;
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const yearsToDelivery = (deliveryWeek - week) / 52;
    const marginRate = initialMarginRateOf({ classId: 'BOND_FUTURE', regionId, reference: { kind: 'SOVEREIGN', regionId, bondId }, termKey: BOND_FUTURE_TERM_KEY, maturityWeek: deliveryWeek }, view);
    const weeklyPriceMove = Math.max(1e-4, bondFutureWeeklyMoveOf(view, regionId, bondDurationYears(repoRateAnnual, (terms.maturityWeek - deliveryWeek) / 52)) ?? cashPrice * 0.01);
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const loanBook = securityLoanBookOf(ctx.v2, regionId).filter((l) => l.instrumentId === bondId);
    // §3.17e-iii-a: the mirror's carry is the paper's borrow fee, at the lending book's last print
    // — none yet is an unpriced borrow, which the lending book prices the week it is asked.
    const borrowFeeBps = reg.borrowFeeBpsByCompanyId?.[bondId] ?? 0;

    funds.filter((f) => f.region === regionId).forEach((fund) => {
      const line = pbBook.find((l) => l.fundId === fund.id);
      const read = bondBasisRead({
        netBasis: reg.bondFuturesBasis!, cashPrice, yearsToDelivery,
        // No line, no leverage: the fund finances itself at what its cash costs it, the repo rate.
        financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate,
        requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)),
      });
      const requiredReturnAnnual = entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund));
      const mirror = bondBasisMirrorRead({ netBasis: reg.bondFuturesBasis!, cashPrice, yearsToDelivery, borrowFeeBps, marginRate, requiredReturnAnnual });
      // §3.17e-iii-a: signed — + long the cash on the line and short the future, − its mirror.
      const share = arbTargetShare(edgeBps(read), edgeBps(mirror), (weeklyPriceMove / cashPrice) * 10000);
      const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
      // The position it has: the deliverable on its register less what it has borrowed of it,
      // and its net line — long less short — in the standing book.
      const rows = sovereignRowsOf(ctx.v2, fund.id).filter((r) => r.bondId === bondId);
      const heldFace = rows.reduce((a, r) => a + r.faceLocal, 0);
      const borrowedFace = sharesOnLoan(loanBook, 'borrower', fund.id, bondId);
      const netFace = heldFace - borrowedFace;
      const key = institutionPartyKey(fund.id);
      const shortFace = standing.coverLocal('BOND_FUTURE', 'b', key, bondId);
      const longFace = standing.coverLocal('BOND_FUTURE', 'a', key, bondId);
      const netFuture = longFace - shortFace;
      if (share === 0 && Math.abs(netFace) <= 1 && Math.abs(netFuture) <= 1 && heldFace <= 1) return;
      // §3.17e-ii-b — THE STOP and THE LINE. What the pair has made: the deliverable's mark over
      // its lots' basis, the borrow's net (collateral against the paper owed), and what its lines
      // have settled to it. It is cut whole past the margin its future leg posted; it is cut to
      // what the line carries when the line no longer carries it.
      const lines = book.filter((c) => c.classId === 'BOND_FUTURE' && c.reference.kind === 'SOVEREIGN' && c.reference.bondId === bondId
        && ((c.b.kind === 'INSTITUTION' && c.b.id === fund.id) || (c.a.kind === 'INSTITUTION' && c.a.id === fund.id)));
      const pnlLocal = pairPnLLocal({
        cashValueLocal: rows.reduce((a, r) => a + r.valueLocal, 0) + stockLoanNetLocal(loanBook, fund.id, () => cashPrice),
        cashBasisLocal: rows.reduce((a, r) => a + rowBasisLocal(ctx.v2, r.row), 0),
        futuresSettledToFundLocal: lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0),
      });
      const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
      const carriedFace = capacityLocal / cashPrice;
      const exposureFace = Math.max(Math.abs(netFace), Math.abs(netFuture));
      const targetFace = stopped ? 0 : exposureFace > carriedFace ? Math.sign(share || netFace) * carriedFace : share * carriedFace;
      const forced = stopped || exposureFace > carriedFace;
      const cashDelta = targetFace - netFace;
      const futureLegFace = -targetFace - netFuture;
      const legs = bondBasisLegs({
        regionId, bondId, futureId, faceLocal: Math.max(cashDelta, -futureLegFace),
        cashPrice, futurePrice, couponRate: terms.couponRate, repoRateAnnual, yearsToDelivery,
        carryBps: read.carryBps, weeklyPriceMove, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
      });
      // Each leg moves its own side to the target: added when the edge is there, taken off when
      // it has gone, and at any price when the pair is cut. A cash leg below what the book holds
      // sells what it has and BORROWS the rest (§3.17e-iii-a): the lending book clears the need.
      if (cashDelta > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta, forced });
      else if (cashDelta < -1) {
        const sellFace = Math.min(-cashDelta, heldFace);
        if (sellFace > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: -sellFace, forced });
        const borrowFace = -cashDelta - sellFace;
        if (borrowFace > 1) ctx.borrowNeeds.push({ entityId: fund.id, regionId, instrumentId: bondId, units: borrowFace });
      }
      if (Math.abs(futureLegFace) > 1) ctx.relativeValueLegs.push({ ...legs.future, entityId: fund.id, faceLocal: futureLegFace, forced });
    });
  });
}
