/**
 * G5 — the workout. A defaulted issuer's assets are sold and its claims are paid, in the order
 * they are owed, until there is nothing left. The shape of it is documented in domain/estate.ts.
 *
 * This closes the harness's last conservation violation. A defaulted issuer stopped being priced
 * — it leaves `isActiveCompany`, so no book quotes its paper again — while its holders kept the
 * position at its last mark forever. Nothing was ever going to take the paper off, because
 * nothing resolved. Now the estate does: what it recovers is paid to the named holders, and what
 * it does not is written off their books, both legs in the same pass.
 *
 * Nothing here states a liquidation horizon. Each asset leaves at the rate the market that would
 * buy it actually absorbs it — cash at once, receivables on the terms the issuer itself extended,
 * inventory at the company's own measured turnover, plant at the rate its region buys capital
 * goods — and the discount a buyer takes is the return it needs for the time it is tied up.
 */

import { GameState, RegionId, Company } from '../../../types';
import {
  Estate, EstateClaim, CLAIM_SENIORITY, estateAssetsUSD, claimsAtSeniority, outstandingUSD,
  realisedDebtRecoveryRate,
} from '../../../domain/estate';
import { getOutputInventoryUSD } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import { WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';

/** How many resolutions the realised recovery rate averages over before it displaces the prior. */
export const RECOVERY_HISTORY_LENGTH = 24;

const holderRef = (c: EstateClaim): PartyRef =>
  c.holder.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: c.holder.id }
    : c.holder.kind === 'BANK' ? { kind: 'BANK', ticker: c.holder.ticker }
      : { kind: 'COMPANY', ticker: c.holder.ticker };

export function runEstateResolutionStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  const week = ctx.nextWeek;
  const estates: Estate[] = ctx.estates ?? [];
  const byCompanyId = new Map(estates.map((e) => [e.companyId, e]));

  // ---- Open an estate for every issuer that has just defaulted. ----
  ctx.updatedCompanies.forEach((comp) => {
    if (!comp.isDefaulted || byCompanyId.has(comp.id) || comp.mergerAcquired) return;
    if (comp.isBankEntity || comp.isInstitutionalEntity) return;
    const estate = openEstate(comp, ctx);
    if (!estate) return;
    estates.push(estate);
    byCompanyId.set(comp.id, estate);
  });

  // ---- Run every open workout one week further. ----
  estates.forEach((estate) => {
    if (estate.closedWeek !== undefined) return;
    const reg = ctx.updatedRegions[estate.regionId];
    if (!reg) return;
    const comp = ctx.updatedCompanies.find((c) => c.id === estate.companyId);

    // What the markets take this week, each at its own rate.
    const collectedUSD = estate.assets.cashUSD;
    estate.assets.cashUSD = 0;

    // Receivables settle on the terms the issuer itself extended: its own mean invoice term.
    const termWeeks = Math.max(1, meanReceivableTermWeeks(ctx, estate.ticker));
    const receiptsUSD = Math.min(estate.assets.receivablesUSD, estate.assets.receivablesUSD / termWeeks);
    estate.assets.receivablesUSD -= receiptsUSD;

    // Inventory leaves at the company's OWN turnover — the rate its market was taking the goods
    // before it failed — and at the discount a buyer needs for holding it that long.
    const turnoverWeeks = Math.max(1, inventoryTurnoverWeeks(comp, estate.assets.inventoryUSD));
    const invSoldUSD = Math.min(estate.assets.inventoryUSD, estate.assets.inventoryUSD / turnoverWeeks);
    estate.assets.inventoryUSD -= invSoldUSD;

    // Plant goes to peers as cheap capex, at the rate its region actually buys capital goods
    // against the plant already installed there. Slow, and the discount is the largest, because
    // the buyer's money is tied up longest.
    const ppeWeeks = Math.max(1, regionalPpeAbsorptionWeeks(ctx, estate.regionId));
    const ppeSoldUSD = Math.min(estate.assets.ppeUSD, estate.assets.ppeUSD / ppeWeeks);
    estate.assets.ppeUSD -= ppeSoldUSD;

    const hurdle = Math.max(0.01, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + EQUITY_RISK_PREMIUM);
    const proceedsUSD = collectedUSD + receiptsUSD
      + invSoldUSD * (1 - Math.min(0.9, (hurdle * turnoverWeeks) / 52))
      + ppeSoldUSD * (1 - Math.min(0.9, (hurdle * ppeWeeks) / 52));

    if (proceedsUSD > 1) distribute(ctx, estate, proceedsUSD);

    // Closed when there is nothing left to sell: the residual claims are written off.
    if (estateAssetsUSD(estate.assets) <= 1) {
      estate.closedWeek = week;
      writeOffResidual(ctx, estate);
      const realised = realisedDebtRecoveryRate(estate);
      if (realised !== undefined) {
        const history = [...(reg.realisedRecoveryRates ?? []), Number(realised.toFixed(4))];
        reg.realisedRecoveryRates = history.slice(-RECOVERY_HISTORY_LENGTH);
      }
    }
  });

  ctx.estates = estates.filter((e) => e.closedWeek === undefined || week - e.closedWeek < 4);
}

/** The waterfall: secured first, then unsecured, then whatever is left for equity. */
function distribute(ctx: WeeklyStepContext, estate: Estate, proceedsUSD: number): void {
  let remainingUSD = proceedsUSD;
  [CLAIM_SENIORITY.SECURED, CLAIM_SENIORITY.UNSECURED, CLAIM_SENIORITY.EQUITY].forEach((seniority) => {
    if (remainingUSD <= 1) return;
    const claims = claimsAtSeniority(estate, seniority);
    const owedUSD = outstandingUSD(claims);
    if (!(owedUSD > 0)) return;
    const payUSD = Math.min(remainingUSD, owedUSD);
    claims.forEach((claim) => {
      const stillOwedUSD = Math.max(0, claim.principalUSD - claim.recoveredUSD);
      if (stillOwedUSD <= 0) return;
      const shareUSD = payUSD * (stillOwedUSD / owedUSD);
      if (shareUSD <= 0) return;
      claim.recoveredUSD += shareUSD;
      estate.distributedUSD += shareUSD;
      // The estate is the payer: an issuer's own assets, reaching the people it owed. Its side of
      // the ledger is the boundary until a defaulted company keeps a real book of its own.
      pay(ctx, {
        payer: { kind: 'UNMODELED', region: estate.regionId },
        payee: holderRef(claim),
        amountUSD: shareUSD,
        reason: 'estate distribution',
      });
      reduceHolding(ctx, claim, estate.companyId, shareUSD, false);
    });
    remainingUSD -= payUSD;
  });
}

/** Whatever the workout could not pay comes off the holders' books as a loss. */
function writeOffResidual(ctx: WeeklyStepContext, estate: Estate): void {
  estate.claims.forEach((claim) => {
    const lostUSD = Math.max(0, claim.principalUSD - claim.recoveredUSD);
    if (lostUSD <= 0) return;
    reduceHolding(ctx, claim, estate.companyId, lostUSD, true);
  });
}

/**
 * Take the paper off the holder's book. A recovery is cash arriving against the position; a
 * write-off is the position going with nothing arriving, so it is a loss and the holder's own
 * capital says so — which is the contagion channel, made of real losses on real books.
 */
function reduceHolding(
  ctx: WeeklyStepContext, claim: EstateClaim, companyId: string, amountUSD: number, isLoss: boolean
): void {
  if (claim.holder.kind === 'INSTITUTION') {
    const id = claim.holder.id;
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
      if (e.id !== id) return e;
      let leftUSD = amountUSD;
      const holdings = (e.itemizedHoldings || []).map((h) => {
        if (h.instrumentId !== companyId || leftUSD <= 0) return h;
        const takeUSD = Math.min(leftUSD, h.quantityOrNotionalUSD ?? 0);
        leftUSD -= takeUSD;
        return { ...h, quantityOrNotionalUSD: (h.quantityOrNotionalUSD ?? 0) - takeUSD };
      }).filter((h) => (h.quantityOrNotionalUSD ?? 0) > 1);
      return {
        ...e,
        itemizedHoldings: holdings,
        totalAssetsUSD: Math.max(0, e.totalAssetsUSD - (isLoss ? amountUSD : 0)),
        equityCapitalUSD: Math.max(0, (e.equityCapitalUSD ?? 0) - (isLoss ? amountUSD : 0)),
      };
    });
    return;
  }
  if (claim.holder.kind === 'BANK') {
    const ticker = claim.holder.ticker;
    const company = ctx.updatedCompanies.find((c) => c.ticker === ticker && c.bankBalanceSheet);
    if (!company) return;
    const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? company.bankBalanceSheet!;
    let leftUSD = amountUSD;
    const loans = (sheet.businessLoans || []).map((l) => {
      if (l.borrowerId !== companyId || leftUSD <= 0) return l;
      const takeUSD = Math.min(leftUSD, l.principalUSD);
      leftUSD -= takeUSD;
      return { ...l, principalUSD: l.principalUSD - takeUSD };
    }).filter((l) => l.principalUSD > 1);
    const bookUSD = loans.reduce((a, l) => a + l.principalUSD, 0);
    if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
    ctx.companyUpdates[ticker].bankBalanceSheet = {
      ...sheet,
      businessLoans: loans,
      businessLoanBookUSD: Number(bookUSD.toFixed(0)),
      // A write-off is a write-down: the asset goes and equity takes it. A recovery is cash
      // arriving against the asset, and the reserves leg settles through the ledger.
      bankEquityUSD: sheet.bankEquityUSD - (isLoss ? amountUSD : 0),
    };
  }
}

function openEstate(comp: Company, ctx: WeeklyStepContext): Estate | undefined {
  const claims: EstateClaim[] = [];
  const addClaim = (c: EstateClaim) => { if (c.principalUSD > 1) claims.push(c); };

  // Bondholders and loan holders, from the books that actually hold the paper.
  ctx.updatedInstitutionalEntities.forEach((e) => {
    (e.itemizedHoldings || []).forEach((h) => {
      if (h.instrumentId !== comp.id) return;
      const usd = h.quantityOrNotionalUSD ?? 0;
      if (h.instrumentType === 'LEVERAGED_LOAN') {
        addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'LEVERAGED_LOAN', seniority: CLAIM_SENIORITY.SECURED, principalUSD: usd, recoveredUSD: 0 });
      } else if (h.instrumentType === 'CORP_BOND') {
        addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'CORP_BOND', seniority: CLAIM_SENIORITY.UNSECURED, principalUSD: usd, recoveredUSD: 0 });
      } else if (h.instrumentType === 'EQUITY') {
        addClaim({ holder: { kind: 'INSTITUTION', id: e.id }, instrumentType: 'EQUITY', seniority: CLAIM_SENIORITY.EQUITY, principalUSD: usd, recoveredUSD: 0 });
      }
    });
  });
  // The banks' own facilities: secured, and they rank with the first-lien loans.
  ctx.updatedCompanies.forEach((bank) => {
    const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
    (sheet?.businessLoans || []).forEach((l) => {
      if (l.borrowerId !== comp.id) return;
      addClaim({ holder: { kind: 'BANK', ticker: bank.ticker }, instrumentType: 'BANK_FACILITY', seniority: CLAIM_SENIORITY.SECURED, principalUSD: l.principalUSD, recoveredUSD: 0 });
    });
  });
  if (claims.length === 0) return undefined;

  const grossPpeUSD = comp.grossPPEUSD ?? 0;
  const netPpeUSD = Math.max(0, grossPpeUSD - (comp.accumulatedDepreciationUSD ?? 0));
  return {
    companyId: comp.id,
    ticker: comp.ticker,
    regionId: comp.region as RegionId,
    openedWeek: ctx.nextWeek,
    assets: {
      cashUSD: Math.max(0, comp.cash),
      receivablesUSD: Math.max(0, comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE * 0.6),
      inventoryUSD: Math.max(0, getOutputInventoryUSD(comp)),
      ppeUSD: netPpeUSD,
    },
    claims,
    distributedUSD: 0,
  };
}

/** The issuer's own mean invoice term, from the invoices it is still owed. */
function meanReceivableTermWeeks(ctx: WeeklyStepContext, ticker: string): number {
  const invoices = (ctx.tradeInvoicesBooked ?? []).filter((iv) => iv.sellerTicker === ticker);
  if (invoices.length === 0) return 8;
  const total = invoices.reduce((a, iv) => a + Math.max(1, iv.weekDue - iv.weekBooked), 0);
  return total / invoices.length;
}

/** Weeks of sales the inventory represents — the rate its own market was taking it. */
function inventoryTurnoverWeeks(comp: Company | undefined, inventoryUSD: number): number {
  if (!comp || !(inventoryUSD > 0)) return 1;
  const weeklySalesUSD = Math.max(1, comp.annualRevenue / 52);
  return Math.max(1, Math.min(156, inventoryUSD / weeklySalesUSD));
}

/** How long it takes a region to absorb a plant: its own installed base against what it buys. */
function regionalPpeAbsorptionWeeks(ctx: WeeklyStepContext, regionId: RegionId): number {
  let installedUSD = 0;
  let weeklyCapexUSD = 0;
  ctx.updatedCompanies.forEach((c) => {
    if (c.region !== regionId) return;
    installedUSD += Math.max(0, (c.grossPPEUSD ?? 0) - (c.accumulatedDepreciationUSD ?? 0));
    weeklyCapexUSD += Math.max(0, (c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)) / 52;
  });
  if (!(weeklyCapexUSD > 0) || !(installedUSD > 0)) return 52;
  // One plant is a small share of the base; the weeks it takes is that share of the turnover.
  return Math.max(4, Math.min(260, installedUSD / weeklyCapexUSD / 100));
}
