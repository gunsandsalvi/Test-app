/**
 * §3.17d-i — THE CREDIT INDEX MARKET: the SERIES half. A region's basket is rolled here, on the
 * market convention's clock, from the names the single-name book makes; and a constituent's
 * credit event is settled here for the series — ONCE, at what its workout paid, for every
 * contract on the line (the index auction settles a name's weight for the whole market). The
 * clearing — who buys the asset class, who writes it, the print, the index-versus-single-name
 * basis — is §3.17d-ii.
 *
 * Runs in the CLEARING phase after the single-name book (registry order) and settles AFTER the
 * market: the series' events are recorded here and the lifecycle settles them the same week.
 */

import { REGION_IDS } from '../../../../domain/geography';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { isActiveCompany } from '../../../../domain/company';
import { asEntityId, type EntityId } from '../../../../domain/ids';
import { derivativesBookOf } from '../../../ledger/contract-ledger';
import { creditIndexRollDue, rollCreditIndex, type CreditIndexSeries } from '../../../../domain/derivatives/classes/cds-index';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';

function runCdsIndexMarket({ ctx, week, view }: DerivativeMarketRun): void {
  const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const book = derivativesBookOf(ctx);
  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const series = reg.creditIndexSeries ?? (reg.creditIndexSeries = {});
    const current = reg.creditIndexSeriesId === undefined ? undefined : series[reg.creditIndexSeriesId];

    // ---- 1. THE ROLL. The basket is the region's made names: every active name the single-name
    // book has printed, equal-weighted, fixed until the next roll. ----
    if (creditIndexRollDue(current, week)) {
      const names = Object.keys(reg.cdsSpreadHistoryByIssuer ?? {}).map(asEntityId)
        .filter((id) => { const c = companyById.get(id); return !!c && c.region === regionId && isActiveCompany(c); });
      const n = (reg.creditIndexNextSeriesNo ?? 1);
      const rolled = rollCreditIndex(regionId, n, week, names);
      if (rolled) {
        series[rolled.seriesId] = rolled;
        reg.creditIndexSeriesId = rolled.seriesId;
        reg.creditIndexNextSeriesNo = n + 1;
      }
    }

    // ---- 2. THE EVENTS. A constituent that has failed and whose workout has closed (or that left
    // no estate to wait for) settles its weight for the series, at what the workout paid. ----
    const referenced = new Set<string>();
    book.forEach((c) => { if (c.reference.kind === 'BASKET' && c.reference.regionId === regionId) referenced.add(c.reference.seriesId); });
    Object.values(series).forEach((s: CreditIndexSeries) => {
      const settled = new Set<EntityId>(s.events.map((e) => e.issuerId));
      s.constituents.forEach((id) => {
        if (settled.has(id) || !view.isIssuerDefaulted(id)) return;
        const w = view.issuerWorkout(id);
        if (w?.state === 'OPEN') return;
        s.events.push({ issuerId: id, week, recovery: w?.state === 'CLOSED' ? w.recovery : view.recoveryRate(regionId) });
      });
      // A series no contract names and that is no longer current has nothing left to say.
      if (s.seriesId !== reg.creditIndexSeriesId && !referenced.has(s.seriesId)) delete series[s.seriesId];
    });
  });
}

export const CDS_INDEX_MARKET: DerivativeMarket = {
  classId: 'CDS_INDEX',
  phase: 'CLEARING',
  settles: 'AFTER_MARKET',
  run: runCdsIndexMarket,
};
