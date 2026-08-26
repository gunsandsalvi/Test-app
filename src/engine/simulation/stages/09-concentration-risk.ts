/**
 * Stage 9: Concentration Risk Flagging
 *
 * Flags each company with >40% supplier/customer concentration risk, computed from
 * the region's real active supply contracts.
 */

import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';

export function runConcentrationRiskStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedCompanies.forEach(comp => {
    const flags: string[] = [];
    const reg = ctx.updatedRegions[comp.region];
    const contracts = reg?.activeContracts || [];

    // Supplier concentration
    const asSupplier = contracts.filter(c => c.supplierCompanyId === comp.ticker || c.supplierCompanyId === comp.id);
    const totalSupplierVal = asSupplier.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalSupplierVal > 0) {
      const custTotals: Record<string, number> = {};
      asSupplier.forEach(c => {
        custTotals[c.customerCompanyId] = (custTotals[c.customerCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(custTotals).forEach(([custTicker, val]) => {
        const share = val / totalSupplierVal;
        if (share > 0.40) {
          const custComp = ctx.updatedCompanies.find(x => x.ticker === custTicker || x.id === custTicker);
          const custName = custComp?.name || custTicker;
          flags.push(`High Customer Concentration: ${custName} (${(share * 100).toFixed(0)}% of contract revenue)`);
        }
      });
    }

    // Customer concentration
    const asCustomer = contracts.filter(c => c.customerCompanyId === comp.ticker || c.customerCompanyId === comp.id);
    const totalCustomerVal = asCustomer.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalCustomerVal > 0) {
      const supTotals: Record<string, number> = {};
      asCustomer.forEach(c => {
        supTotals[c.supplierCompanyId] = (supTotals[c.supplierCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(supTotals).forEach(([supTicker, val]) => {
        const share = val / totalCustomerVal;
        if (share > 0.40) {
          const supComp = ctx.updatedCompanies.find(x => x.ticker === supTicker || x.id === supTicker);
          const supName = supComp?.name || supTicker;
          flags.push(`High Supplier Concentration: ${supName} (${(share * 100).toFixed(0)}% of input supply)`);
        }
      });
    }

    comp.concentrationRiskFlags = flags;
  });
}
