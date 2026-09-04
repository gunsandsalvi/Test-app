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
import { currencyOf } from '../../../domain/geography';
import { WeeklyStepContext, updateBankSheet } from './context';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { pay, pendingSettlementLocal, PartyRef } from './settlement';
import { cashOf } from '../../ledger/accounts';
import { transferHolding, HoldingKind } from '../../ledger/holdings-ledger';

export function reconcileHolderPrincipal(args: {
  ctx: WeeklyStepContext;
  regionId: RegionId;
  /**
   * What each INSTRUMENT this book keys by really has outstanding. §3.13: a book that clears per
   * tranche keys this by tranche (a retired one is present at ZERO, so its holders are repaid
   * rather than silently re-keyed onto the borrower's other paper); a book that still clears per
   * issuer keys it by issuer, and the arithmetic is the same either way.
   */
  outstandingByInstrumentId: Map<string, number>;
  /** The borrower behind each of those instruments, so the payer is the borrower and the cap is
   *  its own money. */
  issuerOfInstrument: Map<string, Company>;
  /** Institutions' positions by (entityId → instrumentId → face) — scaled IN PLACE. */
  holdingsByEntity: Map<string, Map<string, number>>;
  /** The banks whose desks may hold this book's paper. */
  banks: Company[];
  /** The desk book name ('leveraged loan', 'corporate bond', ...). */
  deskBook: string;
  /** §5-FINALIZATION step 13 (W2): the register kind of that book — the desk's paydown is a wire. */
  instrumentType: HoldingKind;
  /** The payment reason, so the flow is attributable per book. */
  reason: string;
}): void {
  const { ctx, outstandingByInstrumentId, issuerOfInstrument, holdingsByEntity, banks, deskBook, instrumentType, reason } = args;

  // Pass 1 — each instrument's holder total, institutions plus positive desk positions.
  const heldByInstrument = new Map<string, number>();
  holdingsByEntity.forEach((byInstrument) => byInstrument.forEach((usd, instrumentId) => {
    if (usd > 0 && outstandingByInstrumentId.has(instrumentId)) {
      heldByInstrument.set(instrumentId, (heldByInstrument.get(instrumentId) ?? 0) + usd);
    }
  }));
  const deskSheets = banks.map((bank) => {
    const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
    return { bank, sheet };
  });
  deskSheets.forEach(({ sheet }) => {
    (sheet?.dealerDeskInventory?.[deskBook] ?? []).forEach((p) => {
      // §9.13-CREDIT row 5: the outstanding this is compared against is a LADDER's face, so the
      // desk's side of it is the paper it holds (`units`), not what that paper is marked at.
      if (p.inventoryLocal > 0 && outstandingByInstrumentId.has(p.instrumentId)) {
        heldByInstrument.set(p.instrumentId, (heldByInstrument.get(p.instrumentId) ?? 0) + (p.units ?? p.inventoryLocal));
      }
    });
  });

  // The scale for every issuer whose holders claim more than it owes, CAPPED by what the
  // issuer can actually pay this week. $1M of slack keeps the pass off rounding noise; the
  // drift this burns is B-scale.
  const factorByInstrument = new Map<string, number>();
  const trace = process.env.PAYDOWN_TRACE === '1';
  heldByInstrument.forEach((heldLocal, instrumentId) => {
    const outstandingLocal = Math.max(0, outstandingByInstrumentId.get(instrumentId) ?? 0);
    if (!(heldLocal > outstandingLocal + 1e6)) return;
    const issuer = issuerOfInstrument.get(instrumentId);
    if (trace && heldLocal - outstandingLocal > 1e9) {
      console.log(`  [paydown] ${deskBook} ${issuer?.ticker ?? instrumentId} held ${(heldLocal / 1e6).toFixed(0)}M out ${(outstandingLocal / 1e6).toFixed(0)}M`
        + `${!issuer ? ' SKIP:no-issuer' : issuer.isBankEntity ? ' SKIP:bank' : ` cash ${(cashOf(ctx.v2, issuer) / 1e6).toFixed(0)}M`}`);
    }
    if (!issuer) return;
    // A BANK's own paper is WHOLESALE FUNDING, and its repayment accounting belongs to the
    // funding roll (02b/§7.254) — paying it here raced that roll's same-week wholesale write
    // and broke five banks' identities (measured, §7.286). Bank-issuer drift stays on the
    // holders' books until G2 unifies the roll with its modeled holders; it crosses the $1M
    // slack rarely (twice in eight weeks across all banks).
    if (issuer.isBankEntity) return;
    const desiredBurnLocal = heldLocal - outstandingLocal;
    const availableLocal = Math.max(0, cashOf(ctx.v2, issuer) + pendingSettlementLocal(ctx, { kind: 'COMPANY', ticker: issuer.ticker }));
    const burnLocal = Math.min(desiredBurnLocal, availableLocal);
    if (burnLocal > 1) factorByInstrument.set(instrumentId, (heldLocal - burnLocal) / heldLocal);
  });
  if (factorByInstrument.size === 0) return;

  /** The borrower's own account (bank issuers are excluded above — their paper is the
   *  wholesale roll's). */
  const payerOf = (instrumentId: string): PartyRef | undefined => {
    const issuer = issuerOfInstrument.get(instrumentId);
    return issuer ? { kind: 'COMPANY', ticker: issuer.ticker } : undefined;
  };

  // Pass 2 — scale and PAY, instrument by instrument: the borrower's repayment reaching its
  // holder directly, one instruction per (instrument, holder) with money on both ends.
  holdingsByEntity.forEach((byInstrument, entityId) => {
    byInstrument.forEach((usd, instrumentId) => {
      const factor = factorByInstrument.get(instrumentId);
      if (factor === undefined || !(usd > 0)) return;
      const paidLocal = usd * (1 - factor);
      byInstrument.set(instrumentId, usd * factor);
      if (paidLocal <= 1) return;
      const payer = payerOf(instrumentId);
      if (!payer) return;
      pay(ctx, { payer, payee: { kind: 'INSTITUTION', id: entityId }, amount: paidLocal, currency: currencyOf(args.regionId), reason });
    });
  });
  deskSheets.forEach(({ bank, sheet }) => {
    if (!sheet) return;
    const rows = sheet.dealerDeskInventory?.[deskBook];
    if (!rows || rows.length === 0) return;
    let touched = false;
    const newRows = rows.map((p) => {
      const factor = factorByInstrument.get(p.instrumentId);
      if (factor === undefined || !(p.inventoryLocal > 0)) return p;
      // A repayment of principal pays FACE, so what the desk is paid is the face it loses.
      const paidLocal = (p.units ?? p.inventoryLocal) * (1 - factor);
      if (paidLocal > 1) {
        const payer = payerOf(p.instrumentId);
        if (payer) {
          // The desk's principal comes back as reserves against the position it loses — an
          // asset swap on the securities account, exactly like a sale (rule 5).
          pay(ctx, { payer, payee: { kind: 'BANK_SECURITIES', ticker: bank.ticker }, amount: paidLocal, currency: currencyOf(args.regionId), reason });
          // Step 13 (W2): the paper paid down leaves the desk by wire, to the house (the ladder's
          // own retirement wire met it there; the register's share is wired at its write-back).
          transferHolding(ctx.v2, { kind: 'BANK_SECURITIES', ticker: bank.ticker }, { kind: 'CLEARING_HOUSE', region: args.regionId },
            { instrumentType, instrumentId: p.instrumentId, issuerRegion: args.regionId, valueLocal: paidLocal }, `${reason}: desk paper paid down`);
        }
      }
      touched = true;
      return {
        ...p,
        inventoryLocal: p.inventoryLocal * factor,
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
