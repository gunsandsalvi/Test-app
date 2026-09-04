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
import { ensureV2 } from '../../../engine2/world';
import { forEachContract } from '../../../engine2/contracts';
import { WeeklyStepContext } from './context';

/** A counterparty share above this is a real dependency worth flagging. */
const CONCENTRATION_FLAG_THRESHOLD = 0.40;

interface PartyExposure {
  /** Annualised contract value across all of this party's contracts on this side. */
  totalLocal: number;
  /** Annualised value per counterparty, so the largest share can be found without re-scanning. */
  byCounterpartyLocal: Map<string, number>;
}

function addExposure(index: Map<string, PartyExposure>, partyId: string, counterpartyId: string, valueLocal: number): void {
  let entry = index.get(partyId);
  if (!entry) {
    entry = { totalLocal: 0, byCounterpartyLocal: new Map() };
    index.set(partyId, entry);
  }
  entry.totalLocal += valueLocal;
  entry.byCounterpartyLocal.set(counterpartyId, (entry.byCounterpartyLocal.get(counterpartyId) ?? 0) + valueLocal);
}

export function runConcentrationRiskStage(state: GameState, ctx: WeeklyStepContext): void {
  const asSupplier = new Map<string, PartyExposure>();
  const asCustomer = new Map<string, PartyExposure>();

  // ENGINE V2 (§7.304) — the contract book is columnar; same walk order as the object array.
  const v2 = ensureV2(state);
  const CT = v2.contracts;
  (Object.keys(ctx.updatedRegions) as (keyof typeof ctx.updatedRegions)[]).forEach(rid => {
    forEachContract(v2, rid as string, (row, supplierKey, customerKey) => {
      const annualLocal = CT.qtyPerWeek[row] * CT.priceLocal[row] * 52;
      addExposure(asSupplier, supplierKey, customerKey, annualLocal);
      addExposure(asCustomer, customerKey, supplierKey, annualLocal);
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
      if (!entry || !(entry.totalLocal > 0)) return;
      entry.byCounterpartyLocal.forEach((valueLocal, counterpartyId) => {
        const share = valueLocal / entry.totalLocal;
        if (share > CONCENTRATION_FLAG_THRESHOLD) {
          out.push(describe(nameOf.get(counterpartyId) || counterpartyId, share * 100));
        }
      });
    });
  };

  // CRD-R1 — the LARGEST single counterparty share, as a number. The flags above are strings for
  // the UI; a rating cannot be notched off a sentence. This stage measured concentration every
  // week at 8.5% of run time with nothing consuming it (§5-CRD); the rating notches are its
  // consumer. Note what this is and is not: it is TRADE concentration, over the contract book —
  // how much of a firm's revenue one customer is and how much of its inputs one supplier is. A
  // bank's large-exposure limit is a different concentration over a different book and is
  // measured where that book lives (07h); neither number stands in for the other.
  const topShare = (index: Map<string, PartyExposure>, ticker: string, id: string): number => {
    let top = 0;
    [index.get(ticker), index.get(id)].forEach(entry => {
      if (!entry || !(entry.totalLocal > 0)) return;
      entry.byCounterpartyLocal.forEach((valueLocal) => {
        top = Math.max(top, valueLocal / entry.totalLocal);
      });
    });
    return top;
  };

  ctx.updatedCompanies.forEach(comp => {
    comp.customerConcentration = Number(topShare(asSupplier, comp.ticker, comp.id).toFixed(4));
    comp.supplierConcentration = Number(topShare(asCustomer, comp.ticker, comp.id).toFixed(4));
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
