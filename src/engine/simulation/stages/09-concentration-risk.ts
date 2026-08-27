/**
 * Stage 9: Concentration Risk Flagging
 *
 * Flags each company with >40% supplier/customer concentration risk, computed from
 * the region's real active supply contracts.
 */

import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';

/** Shared empty list, so a company with no contracts on a side allocates nothing. */
const NO_CONTRACTS: any[] = [];

/** Contracts are keyed by ticker on some paths and by id on others; join without allocating
 *  when only one side (the common case) or neither has any. */
function contractsFor(index: Map<string, any[]>, ticker: string, id: string): any[] {
  const byTicker = index.get(ticker);
  const byId = index.get(id);
  if (byTicker && byId) return [...byTicker, ...byId];
  return byTicker ?? byId ?? NO_CONTRACTS;
}

export function runConcentrationRiskStage(state: GameState, ctx: WeeklyStepContext): void {
  // Indexed once per week rather than rescanned per company: the contract array and the company
  // roster were both walked in full for every one of ~2,000 companies, which is the whole cost
  // of this stage (O(companies x contracts) for what is really one grouping pass).
  const byCompany = new Map<string, typeof ctx.updatedCompanies[number]>();
  ctx.updatedCompanies.forEach(c => { byCompany.set(c.ticker, c); byCompany.set(c.id, c); });
  const supplierContracts = new Map<string, any[]>();
  const customerContracts = new Map<string, any[]>();
  (Object.keys(ctx.updatedRegions) as (keyof typeof ctx.updatedRegions)[]).forEach(rid => {
    (ctx.updatedRegions[rid]?.activeContracts || []).forEach((c: any) => {
      const sup = supplierContracts.get(c.supplierCompanyId);
      if (sup) sup.push(c); else supplierContracts.set(c.supplierCompanyId, [c]);
      const cus = customerContracts.get(c.customerCompanyId);
      if (cus) cus.push(c); else customerContracts.set(c.customerCompanyId, [c]);
    });
  });

  ctx.updatedCompanies.forEach(comp => {
    const flags: string[] = [];

    // Supplier concentration
    const asSupplier = contractsFor(supplierContracts, comp.ticker, comp.id);
    const totalSupplierVal = asSupplier.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalSupplierVal > 0) {
      const custTotals: Record<string, number> = {};
      asSupplier.forEach(c => {
        custTotals[c.customerCompanyId] = (custTotals[c.customerCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(custTotals).forEach(([custTicker, val]) => {
        const share = val / totalSupplierVal;
        if (share > 0.40) {
          const custComp = byCompany.get(custTicker);
          const custName = custComp?.name || custTicker;
          flags.push(`High Customer Concentration: ${custName} (${(share * 100).toFixed(0)}% of contract revenue)`);
        }
      });
    }

    // Customer concentration
    const asCustomer = contractsFor(customerContracts, comp.ticker, comp.id);
    const totalCustomerVal = asCustomer.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalCustomerVal > 0) {
      const supTotals: Record<string, number> = {};
      asCustomer.forEach(c => {
        supTotals[c.supplierCompanyId] = (supTotals[c.supplierCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(supTotals).forEach(([supTicker, val]) => {
        const share = val / totalCustomerVal;
        if (share > 0.40) {
          const supComp = byCompany.get(supTicker);
          const supName = supComp?.name || supTicker;
          flags.push(`High Supplier Concentration: ${supName} (${(share * 100).toFixed(0)}% of input supply)`);
        }
      });
    }

    comp.concentrationRiskFlags = flags;
  });
}
