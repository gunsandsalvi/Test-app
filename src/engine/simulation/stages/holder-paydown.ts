/**
 * §7.259 / §7.286 — HOLDER PRINCIPAL PAYDOWN: the missing half of a credit maturity, now paid
 * BY THE BORROWER ITSELF.
 *
 * Stage 08 retires tranches — maturities, prepayments, calls. The HOLDERS of that paper never
 * saw the event: the weekly clearing redistributes what holders hold between them, it never
 * shrinks the total, so every retirement left the books holding claims on principal already
 * repaid (measured: 2–3% drift over outstanding within weeks, every region).
 *
 * §7.259's first cut parked the borrower's cash at the UNMODELED boundary and paid holders out
 * of it — two anonymous ends of one payment whose parties are both known (the same shape the
 * freight leg had before XB3a-2). §7.286 closes it: every scaled-away dollar is paid
 * ISSUER → HOLDER directly, out of the issuer's own account, capped at the money it actually
 * has — positions burn only as far as cash reaches them, and the remainder stays for next
 * week's pass. BANK issuers are excluded: a bank's own paper is wholesale funding whose
 * repayment accounting belongs to the funding roll (02b/§7.254) — paying it here raced that
 * roll's same-week wholesale write and broke five banks' identities (measured); their drift
 * stays on the holders' books until G2 unifies the roll with its modeled holders. Held below
 * outstanding is left alone (scaling UP would mint the exact claim this exists to burn). Desk
 * shorts are not claims and are neither counted nor scaled.
 */

import { Company, RegionId } from '../../../types';
import { WeeklyStepContext, updateBankSheet } from './context';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { pay, pendingSettlementUSD, PartyRef } from './settlement';

export function reconcileHolderPrincipal(args: {
  ctx: WeeklyStepContext;
  regionId: RegionId;
  /** Each live issuer's REAL outstanding for this book's debt class. */
  outstandingByIssuerId: Map<string, number>;
  /** The issuers themselves, so the payer is the borrower and the cap is its own money. */
  issuerById: Map<string, Company>;
  /** Institutions' positions by (entityId → issuerId → USD) — scaled IN PLACE. */
  holdingsByEntity: Map<string, Map<string, number>>;
  /** The banks whose desks may hold this book's paper. */
  banks: Company[];
  /** The desk book name ('leveraged loan', 'corporate bond', ...). */
  deskBook: string;
  /** The payment reason, so the flow is attributable per book. */
  reason: string;
}): void {
  const { ctx, outstandingByIssuerId, issuerById, holdingsByEntity, banks, deskBook, reason } = args;

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

  // The scale for every issuer whose holders claim more than it owes, CAPPED by what the
  // issuer can actually pay this week. $1M of slack keeps the pass off rounding noise; the
  // drift this burns is B-scale.
  const factorByIssuer = new Map<string, number>();
  heldByIssuer.forEach((heldUSD, issuerId) => {
    const outstandingUSD = Math.max(0, outstandingByIssuerId.get(issuerId) ?? 0);
    if (!(heldUSD > outstandingUSD + 1e6)) return;
    const issuer = issuerById.get(issuerId);
    if (!issuer) return;
    // A BANK's own paper is WHOLESALE FUNDING, and its repayment accounting belongs to the
    // funding roll (02b/§7.254) — paying it here raced that roll's same-week wholesale write
    // and broke five banks' identities (measured, §7.286). Bank-issuer drift stays on the
    // holders' books until G2 unifies the roll with its modeled holders; it crosses the $1M
    // slack rarely (twice in eight weeks across all banks).
    if (issuer.isBankEntity) return;
    const desiredBurnUSD = heldUSD - outstandingUSD;
    const availableUSD = Math.max(0, issuer.cash + pendingSettlementUSD(ctx, { kind: 'COMPANY', ticker: issuer.ticker }));
    const burnUSD = Math.min(desiredBurnUSD, availableUSD);
    if (burnUSD > 1) factorByIssuer.set(issuerId, (heldUSD - burnUSD) / heldUSD);
  });
  if (factorByIssuer.size === 0) return;

  /** The borrower's own account (bank issuers are excluded above — their paper is the
   *  wholesale roll's). */
  const payerOf = (issuerId: string): PartyRef | undefined => {
    const issuer = issuerById.get(issuerId);
    return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
  };

  // Pass 2 — scale and PAY, issuer by issuer: the borrower's repayment reaching its holder
  // directly, one instruction per (issuer, holder) with money on both ends.
  holdingsByEntity.forEach((byIssuer, entityId) => {
    byIssuer.forEach((usd, issuerId) => {
      const factor = factorByIssuer.get(issuerId);
      if (factor === undefined || !(usd > 0)) return;
      const paidUSD = usd * (1 - factor);
      byIssuer.set(issuerId, usd * factor);
      if (paidUSD <= 1) return;
      const payer = payerOf(issuerId);
      if (!payer) return;
      pay(ctx, { payer, payee: { kind: 'INSTITUTION', id: entityId }, amountUSD: paidUSD, reason });
    });
  });
  deskSheets.forEach(({ bank, sheet }) => {
    if (!sheet) return;
    const rows = sheet.dealerDeskInventory?.[deskBook];
    if (!rows || rows.length === 0) return;
    let touched = false;
    const newRows = rows.map((p) => {
      const factor = factorByIssuer.get(p.instrumentId);
      if (factor === undefined || !(p.inventoryUSD > 0)) return p;
      const paidUSD = p.inventoryUSD * (1 - factor);
      if (paidUSD > 1) {
        const payer = payerOf(p.instrumentId);
        if (payer) {
          // The desk's principal comes back as reserves against the position it loses — an
          // asset swap on the securities account, exactly like a sale (rule 14).
          pay(ctx, { payer, payee: { kind: 'BANK_SECURITIES', ticker: bank.ticker }, amountUSD: paidUSD, reason });
        }
      }
      touched = true;
      return {
        ...p,
        inventoryUSD: p.inventoryUSD * factor,
        units: p.units !== undefined ? p.units * factor : undefined,
      };
    });
    if (touched) {
      const inventory: DealerDeskInventory = { ...(sheet.dealerDeskInventory ?? {}) };
      inventory[deskBook] = newRows;
      updateBankSheet(ctx, bank.ticker, { ...sheet, dealerDeskInventory: inventory });
    }
  });

}
