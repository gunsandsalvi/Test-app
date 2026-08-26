/**
 * Stage 10: M&A Consolidation
 *
 * Checks for a quarterly merger event and, if one fires, executes the acquisition:
 * cash/stock consideration, product-line and debt-tranche transfer, and target
 * wind-down. (IPOs are handled separately in stage 13, at their original point in
 * the sequence — see that file's header comment for why.)
 */

import { GameState } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { checkForMerger } from '../merger';
import { WeeklyStepContext } from './context';

export function runMergersStage(state: GameState, ctx: WeeklyStepContext): void {
  if (ctx.nextWeek % 13 !== 0) return;

  const merger = checkForMerger(ctx.updatedCompanies, ctx.nextWeek);
  if (!merger) return;

  const acquirer = ctx.updatedCompanies.find(c => c.ticker === merger.acquirerTicker);
  const target = ctx.updatedCompanies.find(c => c.ticker === merger.targetTicker);
  if (!acquirer || !target || !isActiveCompany(acquirer) || !isActiveCompany(target)) return;

  const purchasePrice = target.marketCap * 1.15;
  const cashPaid = purchasePrice * 0.5;
  const stockPaid = purchasePrice * 0.5;

  acquirer.cash = Math.max(10, acquirer.cash - cashPaid);
  const newShares = stockPaid / Math.max(1, acquirer.stockPrice);
  acquirer.sharesOutstanding = Number((acquirer.sharesOutstanding + newShares).toFixed(3));
  acquirer.annualRevenue = Number((acquirer.annualRevenue + target.annualRevenue * 0.85).toFixed(1));
  acquirer.employeeCount += Math.round(target.employeeCount * 0.75);

  // Merge product lines
  if (target.productLines && acquirer.productLines) {
    target.productLines.forEach(tpl => {
      const existingPl = acquirer.productLines?.find(apl => apl.subUnitId === tpl.subUnitId);
      if (existingPl) {
        existingPl.categoryMarketShare = Number((existingPl.categoryMarketShare + tpl.categoryMarketShare).toFixed(4));
      } else {
        acquirer.productLines?.push({ ...tpl });
      }
    });
  }
  target.productLines = [];

  // Transfer debt
  if (target.debtTranches) {
    target.debtTranches.forEach(t => {
      const transferredTranche = { ...t, id: `${t.id}-acq-${ctx.nextWeek}` };
      if (!acquirer.debtTranches) acquirer.debtTranches = [];
      acquirer.debtTranches.push(transferredTranche);

      // Update any portfolio positions holding this tranche
      ctx.workingPositions = ctx.workingPositions.map(p => {
        if (p.symbol === target.ticker && p.trancheId === t.id) {
          return { ...p, symbol: acquirer.ticker, trancheId: transferredTranche.id };
        }
        return p;
      });
    });
    acquirer.totalDebt = (acquirer.debtTranches || []).reduce((s, t) => s + t.principalUSD, 0);
  }
  target.debtTranches = [];
  target.totalDebt = 0;

  // Target is absorbed and exits active operations
  target.mergerAcquired = true;
  target.acquiredByTicker = acquirer.ticker;
  target.isDefaulted = false;
  target.stockPrice = 0;
  target.employeeCount = 0;
  target.annualRevenue = 0;
  target.marketCap = 0;
  target.capex = 0;
  target.maintenanceCapex = 0;
  target.growthCapex = 0;

  ctx.recentMergers.push({
    acquirerTicker: acquirer.ticker,
    acquirerName: acquirer.name,
    targetTicker: target.ticker,
    targetName: target.name,
    week: ctx.nextWeek,
    dealValueUSD: purchasePrice
  });
  if (ctx.recentMergers.length > 20) ctx.recentMergers.shift();

  ctx.newsItems.push({
    id: `merger-${merger.acquirerTicker}-${merger.targetTicker}-${ctx.nextWeek}`,
    week: ctx.nextWeek,
    title: merger.title,
    description: merger.description,
    category: 'EARNINGS',
    impactBadge: '[M&A MERGER]',
    impactRegion: acquirer.region,
    impactSector: acquirer.sector,
    sentimentDelta: 0.10,
    affectedTicker: acquirer.ticker,
    urgent: true,
  });

  ctx.diagnosticLogs.push({
    week: ctx.nextWeek,
    timestamp: new Date().toISOString(),
    category: 'MICRO',
    message: `Merger Executed: ${acquirer.name} acquired ${target.name}`,
    deltaText: '',
    data: { acquirer: acquirer.ticker, target: target.ticker }
  });
}
