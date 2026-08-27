/**
 * Stage 9: Concentration Risk Flagging
 *
 * Flags each company with >40% supplier/customer concentration risk, computed from
 * the region's real active supply contracts.
 *
 * Shape note. This is one aggregation over the contract book, and the book is large — ~74,000
 * live contracts by week 60. Two earlier versions paid for that badly: the first rescanned the
 * whole book once per company (O(companies x contracts)), and the second indexed it into two
 * maps of arrays, which is the right complexity but allocates ~150,000 array slots and a pair of
 * lookups per company every week. This version accumulates straight into the totals it needs in
 * a single pass, allocating one small record per party that actually has contracts, and then
 * only visits those parties. Same flags, a third of the time and a fraction of the garbage.
 */

import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';

/** A counterparty share above this is a real dependency worth flagging. */
const CONCENTRATION_FLAG_THRESHOLD = 0.40;

interface PartyExposure {
  /** Annualised contract value across all of this party's contracts on this side. */
  totalUSD: number;
  /** Annualised value per counterparty, so the largest share can be found without re-scanning. */
  byCounterpartyUSD: Map<string, number>;
}

function addExposure(index: Map<string, PartyExposure>, partyId: string, counterpartyId: string, valueUSD: number): void {
  let entry = index.get(partyId);
  if (!entry) {
    entry = { totalUSD: 0, byCounterpartyUSD: new Map() };
    index.set(partyId, entry);
  }
  entry.totalUSD += valueUSD;
  entry.byCounterpartyUSD.set(counterpartyId, (entry.byCounterpartyUSD.get(counterpartyId) ?? 0) + valueUSD);
}

export function runConcentrationRiskStage(state: GameState, ctx: WeeklyStepContext): void {
  const asSupplier = new Map<string, PartyExposure>();
  const asCustomer = new Map<string, PartyExposure>();

  (Object.keys(ctx.updatedRegions) as (keyof typeof ctx.updatedRegions)[]).forEach(rid => {
    (ctx.updatedRegions[rid]?.activeContracts || []).forEach((c: any) => {
      const annualUSD = c.quantityUnitsPerWeek * c.priceUSD * 52;
      addExposure(asSupplier, c.supplierCompanyId, c.customerCompanyId, annualUSD);
      addExposure(asCustomer, c.customerCompanyId, c.supplierCompanyId, annualUSD);
    });
  });

  // Contracts are keyed by ticker on some paths and by id on others, so a company's book can sit
  // under either; both are checked, and a company with neither is left with no flags.
  const nameOf = new Map<string, string>();
  ctx.updatedCompanies.forEach(c => { nameOf.set(c.ticker, c.name); nameOf.set(c.id, c.name); });

  const flagsFor = (
    index: Map<string, PartyExposure>,
    ticker: string,
    id: string,
    describe: (counterpartyName: string, sharePct: number) => string,
    out: string[]
  ): void => {
    [index.get(ticker), index.get(id)].forEach(entry => {
      if (!entry || !(entry.totalUSD > 0)) return;
      entry.byCounterpartyUSD.forEach((valueUSD, counterpartyId) => {
        const share = valueUSD / entry.totalUSD;
        if (share > CONCENTRATION_FLAG_THRESHOLD) {
          out.push(describe(nameOf.get(counterpartyId) || counterpartyId, share * 100));
        }
      });
    });
  };

  ctx.updatedCompanies.forEach(comp => {
    const hasAny = asSupplier.has(comp.ticker) || asSupplier.has(comp.id)
      || asCustomer.has(comp.ticker) || asCustomer.has(comp.id);
    if (!hasAny) {
      comp.concentrationRiskFlags = [];
      return;
    }
    const flags: string[] = [];
    flagsFor(asSupplier, comp.ticker, comp.id,
      (name, pct) => `High Customer Concentration: ${name} (${pct.toFixed(0)}% of contract revenue)`, flags);
    flagsFor(asCustomer, comp.ticker, comp.id,
      (name, pct) => `High Supplier Concentration: ${name} (${pct.toFixed(0)}% of input supply)`, flags);
    comp.concentrationRiskFlags = flags;
  });
}
