import { Company } from '../../types';
import { SupplyRelationship } from '../../domain/market-microstructure';
import { isActiveCompany } from '../../domain/company';
import { formatCurrency } from '../formatters';
import { random } from '../rng';
import { marketCapOf, totalDebtOf } from '../../domain/company';

export interface MergerCandidate {
  acquirerTicker: string;
  targetTicker: string;
  title: string;
  description: string;
}

export function checkForMerger(
  activeCompanies: Company[],
  week: number,
  /** §5-DYN — the region's live supply graph, so integration can follow measured failure. */
  supplyRelationships: SupplyRelationship[] = []
): MergerCandidate | null {
  if (week % 13 !== 0) return null; // evaluated quarterly

  const igRatings = ['AAA', 'AA', 'A', 'BBB'];
  const distressedRatings = ['BB', 'B', 'CCC'];
  const byId = new Map(activeCompanies.map((c) => [c.id, c]));

  // SCALE — the volume-weighted reliability per (customer, input) in ONE pass over the list,
  // in list order (the same float accumulation order as the per-acquirer rescan it replaces,
  // which walked all ~165k relationships once per acquirer — O(R²) on a quarterly week).
  const reliabilityByCustomerInput = new Map<string, { volUSD: number; relSum: number }>();
  supplyRelationships.forEach((r) => {
    const sup = byId.get(r.supplierCompanyId);
    if (!sup) return;
    const k = `${r.customerCompanyId}|${r.category}`;
    let acc = reliabilityByCustomerInput.get(k);
    if (!acc) { acc = { volUSD: 0, relSum: 0 }; reliabilityByCustomerInput.set(k, acc); }
    acc.volUSD += r.weeklyVolumeUSD;
    acc.relSum += r.weeklyVolumeUSD * (sup.deliveryReliability ?? 1);
  });

  for (const acquirer of activeCompanies) {
    if (!isActiveCompany(acquirer) || !igRatings.includes(acquirer.creditRating)) continue;
    if (acquirer.cash < 2 * Math.max(1, totalDebtOf(acquirer)) && totalDebtOf(acquirer) > 0) continue;
    // (§7.240's `cash < 500` guard — dollars against books in billions, dead-open since the
    // dollar rescale — deleted rather than rescaled: the debt-cover gate above is the real test.)

    // ---- §5-DYN: STRUCTURE AS STRATEGY — a firm repeatedly burned by its suppliers
    // integrates upstream. The burn record is IND14's own slow reliability EMA (0.9 — a year-
    // scale memory by construction, §7.152), volume-weighted over the acquirer's live supply
    // graph per input; below 0.5 the record says its suppliers fail more than they deliver,
    // which is a definitional midpoint of a [0,1] record, not a tuned threshold. The remedy is
    // OWNING a producer of the failing input: the same M&A machinery, aimed by the failure. ----
    for (const rel of supplyRelationships) {
      if (rel.customerCompanyId !== acquirer.id) continue;
      const supplier = byId.get(rel.supplierCompanyId);
      if (!supplier) continue;
      // The acquirer's volume-weighted reliability experience for this input (precomputed above).
      const acc = reliabilityByCustomerInput.get(`${acquirer.id}|${rel.category}`);
      if (!acc || !(acc.volUSD > 0) || acc.relSum / acc.volUSD >= 0.5) continue;
      // Own a producer of the failing input: the most reliable one it can afford in its region.
      const candidates = activeCompanies.filter((t) =>
        t.ticker !== acquirer.ticker && isActiveCompany(t) && t.region === acquirer.region
        && (t.productLines ?? []).some((l) => l.subUnitId === rel.category)
        && marketCapOf(acquirer) >= 3 * Math.max(1, marketCapOf(t)));
      const target = candidates.sort((a, b) => (b.deliveryReliability ?? 1) - (a.deliveryReliability ?? 1))[0];
      if (target && random() < 0.20) {
        const valStr = formatCurrency(marketCapOf(target) * 1.15, { compact: true, precision: 1 });
        return {
          acquirerTicker: acquirer.ticker,
          targetTicker: target.ticker,
          title: `M&A: ${acquirer.name} Integrates Upstream, Acquiring ${target.name}`,
          description: `${acquirer.name} (${acquirer.ticker}), repeatedly short-shipped on ${rel.category}, has agreed to acquire supplier ${target.name} (${target.ticker}) for ${valStr} — vertical integration following a measured delivery record.`,
        };
      }
      break; // one failing-input read per acquirer per quarter is enough to act on.
    }

    for (const target of activeCompanies) {
      if (target.ticker === acquirer.ticker || !isActiveCompany(target)) continue;
      if (target.sector !== acquirer.sector || target.region !== acquirer.region) continue;
      if (marketCapOf(acquirer) < 3 * Math.max(1, marketCapOf(target))) continue;

      const isDistressed = distressedRatings.includes(target.creditRating) || target.leverage > 4.5 || target.interestCoverage < 1.2;
      const isUndervalued = marketCapOf(target) < (target.annualRevenue * 0.4);
      if (!isDistressed && !isUndervalued) continue;

      // Probabilistic execution trigger: 20% when an eligible match is found
      if (random() < 0.20) {
        const valStr = formatCurrency(marketCapOf(target) * 1.15, { compact: true, precision: 1 });
        return {
          acquirerTicker: acquirer.ticker,
          targetTicker: target.ticker,
          title: `M&A: ${acquirer.name} Acquires ${target.name}`,
          description: `${acquirer.name} (${acquirer.ticker}) has agreed to acquire ${target.name} (${target.ticker}) in a 50% cash and 50% stock consolidation valued at ${valStr}.`,
        };
      }
    }
  }

  return null;
}
