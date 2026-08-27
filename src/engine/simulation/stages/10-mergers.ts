/**
 * Stage 10: M&A Consolidation
 *
 * Checks for a quarterly merger event and, if one fires, executes the acquisition:
 * cash/stock consideration, product-line and debt-tranche transfer, and target
 * wind-down. (IPOs are handled separately in stage 13, at their original point in
 * the sequence — see that file's header comment for why.)
 */

import { GameState, DebtTranche } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { checkForMerger } from '../merger';
import { WeeklyStepContext } from './context';

/**
 * Consolidates a set of debt tranches into at most one tranche per (rateType, ~5-year tenor
 * bucket) combination, weighting coupon/margin/maturity by principal. Tranches referenced by
 * an open portfolio position are excluded by the caller and passed through untouched instead —
 * rewriting their id here would orphan the position's trancheId. Without this, every merger
 * appends the target's entire ladder onto the acquirer's with no consolidation, so tranche
 * count compounds indefinitely across repeated M&A (observed: a single merger turning two
 * ordinary 3-tranche companies into one 6-tranche one).
 */
function consolidateTranches(tranches: DebtTranche[], nextWeek: number, idPrefix: string): DebtTranche[] {
  const buckets = new Map<string, DebtTranche[]>();
  tranches.forEach(t => {
    const tenorBucket = Math.round((t.maturityWeek - nextWeek) / 260); // nearest 5-year bucket
    const key = `${t.rateType}-${tenorBucket}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  });

  const result: DebtTranche[] = [];
  let bucketIndex = 0;
  buckets.forEach(group => {
    if (group.length === 1) { result.push(group[0]); return; }
    const totalPrincipal = group.reduce((s, t) => s + t.principalUSD, 0);
    if (totalPrincipal <= 0) return;
    const weightedCoupon = group.reduce((s, t) => s + (t.couponRate ?? 0) * t.principalUSD, 0) / totalPrincipal;
    const weightedMarginBps = group.reduce((s, t) => s + (t.floatingMarginBps ?? 0) * t.principalUSD, 0) / totalPrincipal;
    const weightedMaturityWeek = Math.round(group.reduce((s, t) => s + t.maturityWeek * t.principalUSD, 0) / totalPrincipal);
    result.push({
      id: `${idPrefix}-ASSUMED-${nextWeek}-${bucketIndex++}`,
      principalUSD: totalPrincipal,
      rateType: group[0].rateType,
      couponRate: group[0].rateType === 'FIXED' ? weightedCoupon : undefined,
      floatingMarginBps: group[0].rateType === 'FLOATING' ? Math.round(weightedMarginBps) : undefined,
      originationWeek: nextWeek,
      maturityWeek: weightedMaturityWeek,
      seniority: group[0].seniority,
    });
  });
  return result;
}

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

  // S5 leak #4 fixed: the target's real cash comes WITH the target — the acquirer pays the
  // consideration out and receives the acquired balance sheet, cash included. Before this the
  // target's cash simply vanished from the economy at every merger.
  acquirer.cash = Math.max(10, acquirer.cash - cashPaid + target.cash);
  target.cash = 0;
  const newShares = stockPaid / Math.max(1, acquirer.stockPrice);
  acquirer.sharesOutstanding = Number((acquirer.sharesOutstanding + newShares).toFixed(3));
  acquirer.annualRevenue = Number((acquirer.annualRevenue + target.annualRevenue * 0.85).toFixed(1));
  acquirer.employeeCount += Math.round(target.employeeCount * 0.75);
  acquirer.grossPPEUSD = (acquirer.grossPPEUSD ?? 0) + (target.grossPPEUSD ?? 0);
  acquirer.accumulatedDepreciationUSD = (acquirer.accumulatedDepreciationUSD ?? 0) + (target.accumulatedDepreciationUSD ?? 0);

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

  // Transfer debt. Tranches held by an open portfolio position (either side) are transferred
  // individually with a renamed id and remapped position, exactly as before. Tranches with no
  // open position are pooled across both companies and consolidated by (rateType, tenor
  // bucket) so the combined entity's ladder doesn't grow without bound across repeated mergers.
  if (target.debtTranches && target.debtTranches.length > 0) {
    if (!acquirer.debtTranches) acquirer.debtTranches = [];

    const heldTrancheIds = new Set(
      ctx.workingPositions
        .filter(p => (p.symbol === target.ticker || p.symbol === acquirer.ticker) && p.trancheId)
        .map(p => p.trancheId!)
    );

    const protectedTargetTranches = target.debtTranches.filter(t => heldTrancheIds.has(t.id));
    const mergeableTargetTranches = target.debtTranches.filter(t => !heldTrancheIds.has(t.id));
    const protectedAcquirerTranches = acquirer.debtTranches.filter(t => heldTrancheIds.has(t.id));
    const mergeableAcquirerTranches = acquirer.debtTranches.filter(t => !heldTrancheIds.has(t.id));

    protectedTargetTranches.forEach(t => {
      const transferredTranche = { ...t, id: `${t.id}-acq-${ctx.nextWeek}` };
      protectedAcquirerTranches.push(transferredTranche);
      ctx.workingPositions = ctx.workingPositions.map(p => {
        if (p.symbol === target.ticker && p.trancheId === t.id) {
          return { ...p, symbol: acquirer.ticker, trancheId: transferredTranche.id };
        }
        return p;
      });
    });

    const consolidatedTranches = consolidateTranches(
      [...mergeableAcquirerTranches, ...mergeableTargetTranches],
      ctx.nextWeek,
      acquirer.ticker
    );

    acquirer.debtTranches = [...protectedAcquirerTranches, ...consolidatedTranches];
    acquirer.totalDebt = acquirer.debtTranches.reduce((s, t) => s + t.principalUSD, 0);
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
  target.grossPPEUSD = 0;
  target.accumulatedDepreciationUSD = 0;

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
