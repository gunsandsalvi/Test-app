/**
 * §7.259 — HOLDER PRINCIPAL PAYDOWN: the missing half of a credit maturity.
 *
 * Stage 08 retires tranches — maturities, prepayments, calls — and posts the borrower's
 * principal to the UNMODELED boundary ('maturing tranche principal repaid'). The HOLDERS of
 * that paper never saw the event: the weekly clearing redistributes what holders hold between
 * them, it never shrinks the total, so every retirement left the books holding more than the
 * issuer owes — claims on principal that had already been repaid. Measured once the §7.259
 * desk fix stopped masking it: the loan books drift ~2–3% over outstanding within weeks, on
 * every region.
 *
 * This pass reconciles each issuer's holder total DOWN to its real outstanding before the
 * book clears: every positive position is scaled pro rata, and the scaled-away principal is
 * PAID to its holder from the same UNMODELED boundary the borrower repaid into — the two
 * boundary legs are one flow meeting itself, which is what makes this a settlement of the
 * borrower's repayment rather than a new source of money. Held below outstanding is left
 * alone (scaling UP would mint the exact claim this exists to burn). Desk shorts are not
 * claims and are neither counted nor scaled.
 */

import { Company, RegionId } from '../../../types';
import { WeeklyStepContext, updateBankSheet } from './context';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { pay } from './settlement';

export function reconcileHolderPrincipal(args: {
  ctx: WeeklyStepContext;
  regionId: RegionId;
  /** Each live issuer's REAL outstanding for this book's debt class. */
  outstandingByIssuerId: Map<string, number>;
  /** Institutions' positions by (entityId → issuerId → USD) — scaled IN PLACE. */
  holdingsByEntity: Map<string, Map<string, number>>;
  /** The banks whose desks may hold this book's paper. */
  banks: Company[];
  /** The desk book name ('leveraged loan', 'corporate bond', ...). */
  deskBook: string;
  /** The payment reason, so the boundary line is attributable per book. */
  reason: string;
}): void {
  const { ctx, regionId, outstandingByIssuerId, holdingsByEntity, banks, deskBook, reason } = args;

  // Pass 1 — each issuer's holder total, institutions plus positive desk positions.
  const heldByIssuer = new Map<string, number>();
  holdingsByEntity.forEach((byIssuer) => byIssuer.forEach((usd, issuerId) => {
    if (usd > 0 && outstandingByIssuerId.has(issuerId)) {
      heldByIssuer.set(issuerId, (heldByIssuer.get(issuerId) ?? 0) + usd);
    }
  }));
  const deskSheets = banks.map((bank) => {
    const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
    return { bank, sheet };
  });
  deskSheets.forEach(({ sheet }) => {
    (sheet?.dealerDeskInventory?.[deskBook] ?? []).forEach((p) => {
      if (p.inventoryUSD > 0 && outstandingByIssuerId.has(p.instrumentId)) {
        heldByIssuer.set(p.instrumentId, (heldByIssuer.get(p.instrumentId) ?? 0) + p.inventoryUSD);
      }
    });
  });

  // The scale for every issuer whose holders claim more than it owes. $1M of slack keeps the
  // pass off rounding noise; the drift this burns is B-scale.
  const factorByIssuer = new Map<string, number>();
  heldByIssuer.forEach((heldUSD, issuerId) => {
    const outstandingUSD = Math.max(0, outstandingByIssuerId.get(issuerId) ?? 0);
    if (heldUSD > outstandingUSD + 1e6) factorByIssuer.set(issuerId, outstandingUSD / heldUSD);
  });
  if (factorByIssuer.size === 0) return;

  // Pass 2 — scale and PAY. The cash is the borrower's own repayment arriving at the holder,
  // routed through the boundary it was parked at.
  holdingsByEntity.forEach((byIssuer, entityId) => {
    let paidUSD = 0;
    byIssuer.forEach((usd, issuerId) => {
      const factor = factorByIssuer.get(issuerId);
      if (factor === undefined || !(usd > 0)) return;
      const newUSD = usd * factor;
      paidUSD += usd - newUSD;
      byIssuer.set(issuerId, newUSD);
    });
    if (paidUSD > 1) {
      pay(ctx, {
        payer: { kind: 'UNMODELED', region: regionId },
        payee: { kind: 'INSTITUTION', id: entityId },
        amountUSD: paidUSD,
        reason,
      });
    }
  });
  deskSheets.forEach(({ bank, sheet }) => {
    if (!sheet) return;
    const rows = sheet.dealerDeskInventory?.[deskBook];
    if (!rows || rows.length === 0) return;
    let paidUSD = 0;
    const newRows = rows.map((p) => {
      const factor = factorByIssuer.get(p.instrumentId);
      if (factor === undefined || !(p.inventoryUSD > 0)) return p;
      paidUSD += p.inventoryUSD * (1 - factor);
      return {
        ...p,
        inventoryUSD: p.inventoryUSD * factor,
        units: p.units !== undefined ? p.units * factor : undefined,
      };
    });
    if (paidUSD > 1) {
      const inventory: DealerDeskInventory = { ...(sheet.dealerDeskInventory ?? {}) };
      inventory[deskBook] = newRows;
      updateBankSheet(ctx, bank.ticker, { ...sheet, dealerDeskInventory: inventory });
      // The desk's principal comes back as reserves against the position it loses — an asset
      // swap on the securities account, exactly like a sale (rule 14).
      pay(ctx, {
        payer: { kind: 'UNMODELED', region: regionId },
        payee: { kind: 'BANK_SECURITIES', ticker: bank.ticker },
        amountUSD: paidUSD,
        reason,
      });
    }
  });
}
