/**
 * DRV — THE ONE DERIVATIVE LAYER.
 *
 * Every bilateral derivative book (07g swaps, 07h CDS, 07i commodity futures, the FX forward
 * book) prices on the clearing engine and settles through `pay()` — that half was always
 * universal. What was NOT universal was everything around the contract: three per-class party
 * unions each re-encoding the ledger's `PartyRef`, three party-key functions with one format,
 * three desk-capacity formulas for one balance sheet, and no close-out anywhere when a
 * counterparty dies. This module is the single owner of those shared facts and rules; the
 * per-class domain files (swaps, credit-default-swap, commodity-futures, fx-hedging) keep what
 * is genuinely per-class — the economics of who needs the hedge and what it is worth.
 *
 * A derivative party is the subset of the ledger's parties that can stand on a bilateral
 * derivative: a company, a bank, or an institution. The arms are structurally identical to the
 * ledger's `PartyRef` arms of the same kind, so a `DerivativeParty` passes to `pay()` directly —
 * no converter, one encoding (§1.3: one representation of one real thing).
 */

export type DerivativeParty =
  | { kind: 'COMPANY'; ticker: string }
  | { kind: 'BANK'; ticker: string }
  | { kind: 'INSTITUTION'; id: string };

/** The one party key. Same format the swap and CDS books always used, now with one owner. */
export function derivativePartyKey(p: DerivativeParty): string {
  return `${p.kind}:${p.kind === 'INSTITUTION' ? p.id : p.ticker}`;
}
