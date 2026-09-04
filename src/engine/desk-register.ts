/**
 * §3.13-BOOK d3d — THE DESKS' INVENTORY, READ OFF THE REGISTER.
 *
 * A bank's market-making inventory used to be `bankBalanceSheet.dealerDeskInventory`, a record of
 * positions per BOOK ('corporate bond', 'bill', …) beside the register — the last holder class
 * outside it. It is rows now, on the bank's SECURITIES book (`holdings-ledger.ts:deskBookId`, the
 * `BANK_SECURITIES` party): every fill, paydown, maturity, corporate action and player trade is a
 * ledger operation that moves a row, and the row is SIGNED, because a market maker is short when
 * it has sold what it did not have (`adjustDeskRow`). A book is a market name; the register stores
 * the KIND (`DESK_BOOK_KIND`), and the two sovereign books share one — a session tells its bills
 * from its bonds by the instruments it clears.
 *
 * Every reader of the deleted field asks here: the auctions' desk participants and their fills,
 * the desks' capital charge (gross, since a short consumes balance sheet too), the coupon and
 * corporate-action splits, the paydowns, the audits and the UI.
 */
import type { V2World } from '../engine2/world';
import { typeOf, typeRefOf, regionOf } from '../engine2/world';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../engine2/holdings';
import { deskBookId } from './ledger/holdings-ledger';
import { bankSovereignBookLocal } from './sovereign-register';
import type { InstrumentId } from '../domain/ids';
import type { RegionId } from '../types';
import type { DealerDeskPosition } from '../domain/dealer-desk';

/** One row of a desk's book: the paper, its KIND, its signed position in units and at the mark. */
export interface DeskRow extends DealerDeskPosition {
  row: number;
  kind: string;
  issuerRegion: RegionId;
  units: number;
  shares: number | undefined;
}

/** The desk's rows — all of them, or those of one register kind. */
export function deskRowsOf(v2: V2World, bankId: string, kind?: string): DeskRow[] {
  const H = v2.holdings;
  const kindRef = kind === undefined ? undefined : typeRefOf(v2, kind);
  const out: DeskRow[] = [];
  if (kindRef !== undefined && kindRef < 0) return out;
  for (let r = bookHeadOf(v2, deskBookId(bankId as never)); r >= 0; r = H.next[r]) {
    if (kindRef !== undefined && H.typeRef[r] !== kindRef) continue;
    const sh = H.shares[r];
    out.push({ row: r, instrumentId: instrumentIdAt(v2, r), kind: typeOf(v2, H.typeRef[r]), issuerRegion: regionOf(v2, H.regionRef[r]) as RegionId, inventoryLocal: H.qtyLocal[r], units: rowUnits(H, r), shares: Number.isNaN(sh) ? undefined : sh });
  }
  return out;
}

/** Gross inventory the bank's desks carry across every book — what its capital is renting out. */
export function deskGrossLocal(v2: V2World, bankId: string): number {
  let gross = 0;
  deskRowsOf(v2, bankId).forEach((p) => { gross += Math.abs(p.inventoryLocal); });
  return gross;
}
/** The same gross in one register kind. */
export function deskGrossOfKindLocal(v2: V2World, bankId: string, kind: string): number {
  let gross = 0;
  deskRowsOf(v2, bankId, kind).forEach((p) => { gross += Math.abs(p.inventoryLocal); });
  return gross;
}
/** The desks' net position at the mark — the signed asset line (a short is negative). */
export function deskSignedLocal(v2: V2World, bankId: string): number {
  let net = 0;
  deskRowsOf(v2, bankId).forEach((p) => { net += p.inventoryLocal; });
  return net;
}

/** The regional view a UI (and the roll-ups §3.13-BOOK d3e retires) still want: every desk's
 *  position in one kind, summed by name, at the mark — optionally only the names given. */
export function regionalDeskViewOf(v2: V2World, bankIds: readonly string[], kind: string, only?: ReadonlySet<InstrumentId>): Map<InstrumentId, number> {
  const byInstrument = new Map<InstrumentId, number>();
  bankIds.forEach((id) => deskRowsOf(v2, id, kind).forEach((p) => {
    if (only !== undefined && !only.has(p.instrumentId)) return;
    byInstrument.set(p.instrumentId, (byInstrument.get(p.instrumentId) ?? 0) + p.inventoryLocal);
  }));
  return byInstrument;
}

/** What a bank's register books put on its balance sheet: its own sovereign book at the mark plus
 *  its desks' gross inventory — the securities the leverage ratio charges it for. */
export function bankBookAssetsLocal(v2: V2World, bankId: string): number {
  return bankSovereignBookLocal(v2, bankId) + deskGrossLocal(v2, bankId);
}
