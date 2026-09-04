/**
 * §5-WIRES W3 — THE TRANCHE LEDGER. The one place a ladder row's principal moves, and every move
 * a numbered wire between the issuer and the holder of its paper. A tranche is not an asset kind
 * of its own: it is the issuer's record of the paper the register (or a bank's loan book) holds —
 * a bond, a loan, commercial paper, a bank facility — so its wires carry that kind, the tranche id
 * as the asset, face as the quantity at a price of 1.
 *
 * Who holds the paper: market paper is delivered to the region's CLEARING_HOUSE (the hub every
 * fill settles through — the register's fills draw it down, W2), a facility to the lending BANK.
 * Retirements run the same wires backwards. The store is sealed (`ReadonlyTrancheStore`): a
 * stage writing a tranche column does not compile, and `pushLadderRow` demands the wire number.
 *
 * Operations:
 *   issueTranche   — the issuer places a tranche: wire issuer → holder, row appended with the wire
 *   retireTranche  — face comes off a row: wire holder → issuer (a call, a prepayment, a maturity)
 *   commitLadder   — the chain re-linked to the rows that still carry principal; dropping a row
 *                    that still carries face is a defect (paper cannot vanish without a wire)
 *   rebuildLadder  — a merger's consolidation: every current row retired, every new one issued
 *   moveFacilityLender — a resolved bank's facilities move to the assuming bank: one wire each
 *   seedLadder     — a seeded or born firm's ladder installed without wires (principle B's gap)
 */
import { V2World, internString } from '../../engine2/world';
import {
  mutableTranches, pushLadderRow, relinkLadder, syncLadderRows, ladderRowsOf, TR_FACILITY, TR_CP, TR_FLOATING, trancheIdOf } from '../../engine2/tranches';
import { DebtTranche } from '../../domain/company';
import { RegionId } from '../../domain/geography';
import { trancheKindOf } from '../../domain/assets';
import { PartyRef } from './party';
import { wire, AssetKind } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { LADDER_FACE_DUST_LOCAL } from '../../domain/stated';
import { defect } from '../../domain/defect';

/**
 * §3.13-SOV — WHO OWES THE PAPER, AND WHAT KIND OF PARTY THEY ARE.
 *
 * `kind` was not a field and `issuerParty` returned `{ kind: 'COMPANY' }` unconditionally, so the
 * tranche ledger could not name a GOVERNMENT as an issuer at all — which is one of the reasons
 * the sovereign got its own store instead of joining this one. A sovereign bond's issuer is the
 * treasury, and `the-register.md` A2 is explicit that a holding is a claim on a NAMED issuer:
 * wiring it as a company would be the right instrument owed by the wrong party.
 *
 * Behaviour-neutral today — every existing caller is a firm and omits `kind`, which defaults to
 * COMPANY. What it buys is that the next commit can seed the sovereign ladder into this store
 * without the wire naming a company that does not exist.
 */
export interface TrancheIssuer { id: string; ticker: string; region: RegionId; kind?: 'COMPANY' | 'GOVERNMENT' }

const issuerParty = (i: TrancheIssuer): PartyRef =>
  i.kind === 'GOVERNMENT' ? { kind: 'GOVERNMENT', region: i.region } : { kind: 'COMPANY', ticker: i.ticker };

/** The kind a row's paper carries, from its flags — the same fact `trancheKindOf` reads off the object. */
function kindOfRow(v2: V2World, r: number): AssetKind {
  const f = v2.tranches.flags[r];
  return trancheKindOf({ isBankFacility: !!(f & TR_FACILITY), isCommercialPaper: !!(f & TR_CP), rateType: f & TR_FLOATING ? 'FLOATING' : 'FIXED' });
}

/** Who holds a row's paper: the lending bank for a facility, the region's clearing house otherwise. */
function holderOfRow(v2: V2World, r: number, region: RegionId): PartyRef {
  const S = v2.tranches;
  if (S.flags[r] & TR_FACILITY) {
    if (S.bankRef[r] < 0) return defect(`facility ${trancheIdOf(v2, r)} names no lending bank — its paper has no holder`);
    return { kind: 'BANK', ticker: v2.internedStrings[S.bankRef[r]] };
  }
  return { kind: 'CLEARING_HOUSE', region };
}

function holderOfTranche(t: DebtTranche, region: RegionId): PartyRef {
  if (t.isBankFacility) {
    if (!t.facilityBankTicker) return defect(`facility ${t.id} names no lending bank — its paper has no holder`);
    return { kind: 'BANK', ticker: t.facilityBankTicker };
  }
  return { kind: 'CLEARING_HOUSE', region };
}

/** The issuer places a tranche with its holder. Returns the new row. */
export function issueTranche(v2: V2World, issuer: TrancheIssuer, t: DebtTranche, reason: string): number {
  if (!(t.principalLocal > 0)) return defect(`tranche ${t.id} issued with principal ${t.principalLocal}`);
  const n = wire({ from: issuerParty(issuer), to: holderOfTranche(t, issuer.region), kind: trancheKindOf(t), asset: t.id, quantity: t.principalLocal, priceLocal: 1, reason }, internReason);
  return pushLadderRow(v2, issuer.id, t, n);
}

/** Face comes off a row: the holder's paper returns to the issuer. Returns the wire number. */
export function retireTranche(v2: V2World, issuer: TrancheIssuer, r: number, faceLocal: number, reason: string): number {
  const S = mutableTranches(v2);
  if (!(faceLocal > 0)) return -1;
  const take = Math.min(faceLocal, S.principalLocal[r]);
  if (faceLocal > S.principalLocal[r] + LADDER_FACE_DUST_LOCAL) defect(`tranche ${trancheIdOf(v2, r)} retired ${(faceLocal / 1e6).toFixed(3)}M against ${(S.principalLocal[r] / 1e6).toFixed(3)}M of principal`);
  const n = wire({ from: holderOfRow(v2, r, issuer.region), to: issuerParty(issuer), kind: kindOfRow(v2, r), asset: trancheIdOf(v2, r), quantity: take, priceLocal: 1, reason }, internReason);
  S.principalLocal[r] -= take;
  return n;
}

/**
 * Face of one KIND comes off the issuer's ladder pro rata across its rows of that kind — an
 * estate's claims are per holder and kind, not per tranche. Rows emptied are unlinked. Returns
 * the face actually retired (an issuer holding less than asked retires what it has).
 */
export function retireLadderFace(v2: V2World, issuer: TrancheIssuer, kind: AssetKind, faceLocal: number, reason: string): number {
  if (!(faceLocal > 0)) return 0;
  const S = v2.tranches;
  const rows = ladderRowsOf(v2, issuer.id).filter((r) => kindOfRow(v2, r) === kind && S.principalLocal[r] > 0.01);
  const totalLocal = rows.reduce((a, r) => a + S.principalLocal[r], 0);
  if (!(totalLocal > 0)) return 0;
  const take = Math.min(faceLocal, totalLocal);
  let retired = 0;
  rows.forEach((r) => {
    const slice = Math.min(S.principalLocal[r], take * (S.principalLocal[r] / totalLocal));
    if (slice > 0.01) { retireTranche(v2, issuer, r, slice, reason); retired += slice; }
  });
  commitLadder(v2, issuer, ladderRowsOf(v2, issuer.id).filter((r) => S.principalLocal[r] > 0.01));
  return retired;
}

/** Re-link the firm's chain to `rows`. A row dropped with face still on it is a defect. */
export function commitLadder(v2: V2World, issuer: TrancheIssuer, rows: number[]): void {
  const S = v2.tranches;
  const keep = new Set(rows);
  for (const r of ladderRowsOf(v2, issuer.id)) {
    if (!keep.has(r) && S.principalLocal[r] > 0.01) {
      defect(`ladder ${issuer.ticker}: row ${trancheIdOf(v2, r)} dropped with ${(S.principalLocal[r] / 1e6).toFixed(3)}M of face — paper cannot leave the ladder without a wire`);
    }
  }
  relinkLadder(v2, issuer.id, rows);
}

/** Every current row retired to the issuer and every row of `ladder` issued — a consolidation. */
export function rebuildLadder(v2: V2World, issuer: TrancheIssuer, ladder: DebtTranche[], reason: string): void {
  const S = v2.tranches;
  for (const r of ladderRowsOf(v2, issuer.id)) {
    if (S.principalLocal[r] > 0.01) retireTranche(v2, issuer, r, S.principalLocal[r], reason);
  }
  commitLadder(v2, issuer, []);
  for (const t of ladder) if (t.principalLocal > 0.01) issueTranche(v2, issuer, t, reason);
}

/** A resolved bank's facilities on this firm's ladder move to the assuming bank, one wire each. */
export function moveFacilityLender(v2: V2World, issuer: TrancheIssuer, fromTicker: string, toTicker: string, reason: string): number {
  const S = mutableTranches(v2);
  const fromRef = v2.internedIdByString.get(fromTicker);
  if (fromRef === undefined) return 0;
  const toRef = internString(v2, toTicker);
  let moved = 0;
  for (const r of ladderRowsOf(v2, issuer.id)) {
    if (S.bankRef[r] !== fromRef) continue;
    if (S.principalLocal[r] > 0.01) {
      wire({ from: { kind: 'BANK', ticker: fromTicker }, to: { kind: 'BANK', ticker: toTicker }, kind: kindOfRow(v2, r), asset: trancheIdOf(v2, r), quantity: S.principalLocal[r], priceLocal: 1, reason }, internReason);
    }
    S.bankRef[r] = toRef;
    moved++;
  }
  return moved;
}

/**
 * A SEEDED OR BORN FIRM'S LADDER OPENS BY WIRE, like every other face on a ladder.
 *
 * It used to be installed by a bare mirror of `comp.debtTranches`, with `wireRef` set to −1 on
 * every row — face that existed because an array said so. The seed is an EVENT: the firm issued
 * this paper, and the wire says so, from the issuer to the holder the tranche names, exactly as
 * `issueTranche` does for face written any other week. So W3 can hold the world's opening ladders
 * to the same standard as its second week's.
 *
 * The chain is claimed empty first, so a firm that somehow arrives here twice cannot double its
 * ladder — the rows come only from the issues below.
 */
export function seedLadder(v2: V2World, issuer: TrancheIssuer, ladder: DebtTranche[] | undefined): void {
  syncLadderRows(v2, issuer.id, []);
  for (const t of ladder ?? []) if (t.principalLocal > LADDER_FACE_DUST_LOCAL) issueTranche(v2, issuer, t, 'seed: ladder opened');
}
