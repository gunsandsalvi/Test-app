/**
 * §5-FINALIZATION 13b — THE REGISTER IS KEYED BY TRANCHE; THE AUCTIONS CLEAR BY ISSUER.
 *
 * A credit book prices one instrument per issuer (all of an issuer's tranches of a kind reprice
 * together off one cleared spread), so a holder's fill is a total per issuer. The register's rows
 * name TRANCHES — the paper the ladder's wires name — so the total is split across the issuer's
 * live tranches of that kind pro rata to face, exactly the split the pro-rata corporate action
 * assumed when it scaled every row of an issuer by one ratio. A primary's slice goes to the NEW
 * tranche first (the book's take of the deal, shared among the buyers by what each bought), so a
 * holder that bought the deal holds the deal.
 *
 * 13d (per-tranche clearing) retires this: the fill will be per tranche by construction.
 */
import { V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_CP, TR_FACILITY, TR_FLOATING } from '../../../engine2/tranches';

export type CreditKind = 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER';

/** Which ladder rows a register kind names — a fact per kind, looked up, never switched on. */
const ROW_IS_KIND: Record<CreditKind, (flags: number) => boolean> = {
  CORP_BOND: (f) => !(f & TR_FACILITY) && !(f & TR_CP) && !(f & TR_FLOATING),
  LEVERAGED_LOAN: (f) => !(f & TR_FACILITY) && !(f & TR_CP) && (f & TR_FLOATING) !== 0,
  COMMERCIAL_PAPER: (f) => !(f & TR_FACILITY) && (f & TR_CP) !== 0,
};
const isKindRow = (flags: number, kind: CreditKind): boolean => ROW_IS_KIND[kind](flags);

/** The issuer's live tranches of a kind, in ladder order: id and face. */
export function liveTranchesOf(v2: V2World, issuerId: string, kind: CreditKind): { id: string; faceLocal: number }[] {
  const S = v2.tranches;
  const out: { id: string; faceLocal: number }[] = [];
  for (const r of ladderRowsOf(v2, issuerId)) {
    if (isKindRow(S.flags[r], kind) && S.principalLocal[r] > 0.01) out.push({ id: v2.internedStrings[S.idRef[r]], faceLocal: S.principalLocal[r] });
  }
  return out;
}

/**
 * Split one holder's total in one issuer across the issuer's tranches. `primary` names the deal's
 * tranche (it may not be on the ladder yet — stage 08 issues it this week) and this holder's slice
 * of it. An issuer with no live tranche and no primary keeps the issuer's own id (a row that still
 * names its issuer resolves through `issuerIdOf` like any other).
 */
export function splitAcrossTranches(
  v2: V2World, issuerId: string, kind: CreditKind, totalUSD: number,
  primary?: { trancheId: string; sliceUSD: number }
): { instrumentId: string; usd: number }[] {
  if (!(totalUSD > 0)) return [];
  const out: { instrumentId: string; usd: number }[] = [];
  let leftUSD = totalUSD;
  if (primary && primary.sliceUSD > 0) {
    const usd = Math.min(leftUSD, primary.sliceUSD);
    out.push({ instrumentId: primary.trancheId, usd });
    leftUSD -= usd;
  }
  if (leftUSD <= 0) return out;
  const live = liveTranchesOf(v2, issuerId, kind).filter((t) => t.id !== primary?.trancheId);
  const faceLocal = live.reduce((a, t) => a + t.faceLocal, 0);
  if (!(faceLocal > 0)) {
    if (process.env.SPLIT_TRACE === '1') console.log(`  [split-fallback] ${issuerId} ${kind} total ${(totalUSD / 1e6).toFixed(1)}M ladderRows ${ladderRowsOf(v2, issuerId).length} rowById ${v2.rowById.get(issuerId)} primary ${primary?.trancheId ?? '-'}`);
    // Nothing live of this kind: the primary carries it when there is one, else the issuer's id.
    if (primary) { const p = out.find((x) => x.instrumentId === primary.trancheId); if (p) p.usd += leftUSD; else out.push({ instrumentId: primary.trancheId, usd: leftUSD }); }
    else out.push({ instrumentId: issuerId, usd: leftUSD });
    return out;
  }
  live.forEach((t) => { const usd = leftUSD * (t.faceLocal / faceLocal); if (usd > 0) out.push({ instrumentId: t.id, usd }); });
  return out;
}

/**
 * Each participant's slice of an issuer's primary take: what it bought this session, scaled so the
 * slices sum to the take (the same rule 07f's bill rebates use).
 */
export function primarySliceOf(boughtUSD: number, totalBoughtUSD: number, takeUSD: number): number {
  if (!(boughtUSD > 0) || !(totalBoughtUSD > 0) || !(takeUSD > 0)) return 0;
  return boughtUSD * Math.min(1, takeUSD / totalBoughtUSD);
}
