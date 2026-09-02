/**
 * §5-WIRES — THE WIRE LEDGER. Every asset move — money, a share, a bond, a tranche, a good, a
 * house — is one numbered instruction here, or it does not happen. The number is the wire's
 * identity for the week and across weeks (`state.nextWireId` persists the counter), so any
 * position can be replayed from its wires and any residual is a missing wire, never a mystery.
 *
 * Columnar, like the payment journal (§7.303): a week carries hundreds of thousands of legs. The
 * payment journal is settlement's PROJECTION of the week's money wires — `journalPush` writes the
 * wire first, so a money row without a wire cannot exist (W1). Other asset kinds arrive in W2–W5.
 */
import { PartyRef, partyId, partyOf } from './party';

export type AssetKind =
  | 'MONEY' | 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'COMMERCIAL_PAPER'
  | 'ETF_SHARE' | 'MMF_SHARE' | 'BANK_FACILITY' | 'GOOD' | 'HOUSE' | 'CONTRACT';

export const ASSET_KINDS: readonly AssetKind[] = [
  'MONEY', 'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'ETF_SHARE', 'MMF_SHARE', 'BANK_FACILITY', 'GOOD', 'HOUSE', 'CONTRACT',
];
const kindIdOf = new Map<AssetKind, number>(ASSET_KINDS.map((k, i) => [k, i]));
export const assetKindOfId = (id: number): AssetKind => ASSET_KINDS[id];

export interface WireInstruction {
  from: PartyRef;
  to: PartyRef;
  kind: AssetKind;
  /** The asset's own id: 'USD' for money, the instrument or tranche id, the good, the house. */
  asset: string;
  /** In the asset's unit: USD for money, shares, face, units. Always positive. */
  quantity: number;
  /** Per unit, in USD (1 for money). Value moved = quantity × price. */
  priceUSD: number;
  reason: string;
  /** The week the wire settles; this week when omitted (an obligation is a dated wire — N). */
  settleWeek?: number;
}

export interface WireJournal {
  /** Rows written; the arrays are capacity, `n` is the truth. */
  n: number;
  /** The first wire number of this journal; row i is wire `base + i`. */
  base: number;
  week: number;
  fromId: Int32Array;
  toId: Int32Array;
  kindId: Int8Array;
  assetRef: Int32Array;
  quantity: Float64Array;
  priceUSD: Float64Array;
  reasonId: Int32Array;
  settleWeek: Int32Array;
}

export function newWireJournal(base: number, week: number, cap = 1 << 14): WireJournal {
  return {
    n: 0, base, week,
    fromId: new Int32Array(cap), toId: new Int32Array(cap), kindId: new Int8Array(cap),
    assetRef: new Int32Array(cap), quantity: new Float64Array(cap), priceUSD: new Float64Array(cap),
    reasonId: new Int32Array(cap), settleWeek: new Int32Array(cap),
  };
}

const assetIdByText = new Map<string, number>();
const assetTextById: string[] = [];
export function internAsset(asset: string): number {
  const existing = assetIdByText.get(asset);
  if (existing !== undefined) return existing;
  const id = assetTextById.length;
  assetIdByText.set(asset, id); assetTextById.push(asset);
  return id;
}
export const assetText = (id: number): string => assetTextById[id];
export const MONEY_ASSET_ID = internAsset('USD');

function grow(j: WireJournal): void {
  const cap = j.fromId.length * 2;
  const gi = (o: Int32Array) => { const a = new Int32Array(cap); a.set(o); return a; };
  const gb = (o: Int8Array) => { const a = new Int8Array(cap); a.set(o); return a; };
  const gf = (o: Float64Array) => { const a = new Float64Array(cap); a.set(o); return a; };
  j.fromId = gi(j.fromId); j.toId = gi(j.toId); j.kindId = gb(j.kindId); j.assetRef = gi(j.assetRef);
  j.quantity = gf(j.quantity); j.priceUSD = gf(j.priceUSD); j.reasonId = gi(j.reasonId); j.settleWeek = gi(j.settleWeek);
}

/** The hot-loop write: ids already interned. Returns the wire number. */
export function wirePush(
  j: WireJournal, fromId: number, toId: number, kindId: number, assetRef: number,
  quantity: number, priceUSD: number, reasonId: number, settleWeek: number
): number {
  if (!(quantity > 0) || !isFinite(quantity) || !isFinite(priceUSD) || priceUSD < 0) {
    throw new Error(`ENGINE DEFECT: wire ${ASSET_KINDS[kindId]} ${assetText(assetRef)} carries quantity=${quantity} price=${priceUSD} — a wire moves a positive quantity at a finite price`);
  }
  if (fromId === toId) {
    throw new Error(`ENGINE DEFECT: wire ${ASSET_KINDS[kindId]} ${assetText(assetRef)} from a party to itself`);
  }
  if (j.n >= j.fromId.length) grow(j);
  const i = j.n;
  j.fromId[i] = fromId; j.toId[i] = toId; j.kindId[i] = kindId; j.assetRef[i] = assetRef;
  j.quantity[i] = quantity; j.priceUSD[i] = priceUSD; j.reasonId[i] = reasonId; j.settleWeek[i] = settleWeek;
  j.n++;
  return j.base + i;
}

/**
 * THE ACTIVE JOURNAL. core.ts installs the week's journal before the first stage and reads it back
 * at the end; every writer in between — `pay`, the paying agent's `journalPayment`, the holdings
 * ledger — appends to it. A write with no active journal is a defect: nothing moves off the books.
 */
let active: WireJournal | undefined;
export function setActiveWireJournal(j: WireJournal | undefined): void { active = j; }
export function activeWireJournal(): WireJournal {
  if (!active) throw new Error('ENGINE DEFECT: an asset moved with no wire journal active — nothing moves off the books');
  return active;
}
export const hasActiveWireJournal = (): boolean => active !== undefined;

/** The one write path for a stage that has a `PartyRef` in hand. Returns the wire number. */
export function wire(instruction: WireInstruction, internReasonId: (reason: string) => number): number {
  const j = activeWireJournal();
  return wirePush(
    j, partyId(instruction.from), partyId(instruction.to), kindIdOf.get(instruction.kind)!,
    internAsset(instruction.asset), instruction.quantity, instruction.priceUSD,
    internReasonId(instruction.reason), instruction.settleWeek ?? j.week
  );
}

/** The week's wires, summarised for the state and the audit. */
export interface WireSummary {
  count: number;
  byKind: Record<string, number>;
  valueUSDByKind: Record<string, number>;
  /** Money wires recorded after the last pass — they settle next week (N: dated wires). */
  moneyPendingUSD: number;
  /** §5-WIRES W2: what each region's clearing house holds of each asset kind after the week's
   *  wires, keyed `region|kind` — received minus delivered, in USD at the wires' prices. The
   *  house is on both sides of every fill, so a non-zero net is a leg no wire named. */
  houseNetUSDByKey: Record<string, number>;
  /** §5-WIRES W3: what the region's issuers put out net of what came back, keyed `region|kind` —
   *  issued (from a COMPANY) minus retired (to a COMPANY). The ladders' change must equal it. */
  issuerNetUSDByKey: Record<string, number>;
  /** LADDER_TRACE=1 only: the same net per issuer ticker and kind, keyed `ticker|kind`. */
  issuerNetUSDByTicker?: Record<string, number>;
}

export function summarizeWires(j: WireJournal, moneyPendingUSD = 0, regionOfIssuer?: (ticker: string) => string | undefined): WireSummary {
  const byKind: Record<string, number> = {}; const valueUSDByKind: Record<string, number> = {};
  const houseNetUSDByKey: Record<string, number> = {};
  const issuerNetUSDByKey: Record<string, number> = {};
  const trace = typeof process !== 'undefined' && process.env?.LADDER_TRACE === '1';
  const issuerNetUSDByTicker: Record<string, number> | undefined = trace ? {} : undefined;
  for (let i = 0; i < j.n; i++) {
    const k = ASSET_KINDS[j.kindId[i]];
    const valueUSD = j.quantity[i] * j.priceUSD[i];
    byKind[k] = (byKind[k] ?? 0) + 1;
    valueUSDByKind[k] = (valueUSDByKind[k] ?? 0) + valueUSD;
    if (k === 'MONEY') continue;
    const from = partyOf(j.fromId[i]), to = partyOf(j.toId[i]);
    if (to.kind === 'CLEARING_HOUSE') { const key = `${to.region}|${k}`; houseNetUSDByKey[key] = (houseNetUSDByKey[key] ?? 0) + valueUSD; }
    if (from.kind === 'CLEARING_HOUSE') { const key = `${from.region}|${k}`; houseNetUSDByKey[key] = (houseNetUSDByKey[key] ?? 0) - valueUSD; }
    if (regionOfIssuer) {
      if (from.kind === 'COMPANY') { const rg = regionOfIssuer(from.ticker); if (rg) { const key = `${rg}|${k}`; issuerNetUSDByKey[key] = (issuerNetUSDByKey[key] ?? 0) + valueUSD; if (issuerNetUSDByTicker) { const tk = `${from.ticker}|${k}`; issuerNetUSDByTicker[tk] = (issuerNetUSDByTicker[tk] ?? 0) + valueUSD; } } }
      if (to.kind === 'COMPANY') { const rg = regionOfIssuer(to.ticker); if (rg) { const key = `${rg}|${k}`; issuerNetUSDByKey[key] = (issuerNetUSDByKey[key] ?? 0) - valueUSD; if (issuerNetUSDByTicker) { const tk = `${to.ticker}|${k}`; issuerNetUSDByTicker[tk] = (issuerNetUSDByTicker[tk] ?? 0) - valueUSD; } } }
    }
  }
  return { count: j.n, byKind, valueUSDByKind, moneyPendingUSD, houseNetUSDByKey, issuerNetUSDByKey, issuerNetUSDByTicker };
}
