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
import type { EntityId } from '../../domain/ids';
import { CurrencyCode, CURRENCY_CODES } from '../../domain/geography';
import { FxTable, PARITY_FX, toNumeraire } from '../../domain/currency';
import { isVehicleClaim, type HoldingType } from '../../domain/assets';
import { defect } from '../../domain/defect';

/** §3.13-BOOK (e): what a wire moves — every kind the register or a ladder holds (a view of the
 *  one kind list), money, a good, a house, or a bilateral contract. */
export type AssetKind = HoldingType | 'MONEY' | 'GOOD' | 'HOUSE' | 'CONTRACT';

export const ASSET_KINDS: readonly AssetKind[] = [
  'MONEY', 'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'ETF_SHARE', 'MMF_SHARE', 'BANK_FACILITY', 'GOOD', 'HOUSE', 'CONTRACT', 'PE_FUND_INTEREST',
];
const kindIdOf = new Map<AssetKind, number>(ASSET_KINDS.map((k, i) => [k, i]));
interface WireInstruction {
  from: PartyRef;
  to: PartyRef;
  kind: AssetKind;
  /** §3.13-BOOK d2: this wire brings the instrument INTO existence (an issuer placing a new
   *  tranche), so there is nothing yet for the world to resolve it against. Every other wire
   *  names an instrument a store already holds, and is refused if none does. */
  creates?: true;
  /** The asset's own id: 'USD' for money, the instrument or tranche id, the good, the house. */
  asset: string;
  /** In the asset's unit: USD for money, shares, face, units. Always positive. */
  quantity: number;
  /** Per unit, in USD (1 for money). Value moved = quantity × price. */
  priceLocal: number;
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
  priceLocal: Float64Array;
  reasonId: Int32Array;
  settleWeek: Int32Array;
  /** §5-WIRES W4: the week's transformations of goods (produced, consumed, scrapped) per
   *  `region|subUnit` — not moves, so not wires, but the other half of the stock identity. */
  goodsFlows: Record<string, { producedUnits: number; consumedUnits: number; scrappedUnits: number }>;
  /** GOODS_TRACE=1: units the sellers' settlements counted as delivered, per `region|subUnit`. */
  goodsDelivered?: Record<string, number>;
}

export function newWireJournal(base: number, week: number, cap = 1 << 14): WireJournal {
  return {
    n: 0, base, week, goodsFlows: {},
    fromId: new Int32Array(cap), toId: new Int32Array(cap), kindId: new Int8Array(cap),
    assetRef: new Int32Array(cap), quantity: new Float64Array(cap), priceLocal: new Float64Array(cap),
    reasonId: new Int32Array(cap), settleWeek: new Int32Array(cap),
  };
}

const assetIdByText = new Map<string, number>();
const assetTextById: string[] = [];
function internAsset(asset: string): number {
  const existing = assetIdByText.get(asset);
  if (existing !== undefined) return existing;
  const id = assetTextById.length;
  assetIdByText.set(asset, id); assetTextById.push(asset);
  return id;
}
const assetText = (id: number): string => assetTextById[id];
/** §3.13c — MONEY IS FOUR ASSETS, not one called 'USD'. A wire moving euros moves the EUR asset
 *  at a price of 1 EUR, which is what "a euro is a euro" means; before this every money wire in
 *  the model was labelled USD whatever it actually moved. */
export const MONEY_ASSET_ID_BY_CURRENCY: Readonly<Record<CurrencyCode, number>> =
  CURRENCY_CODES.reduce((m, c) => { m[c] = internAsset(c); return m; }, {} as Record<CurrencyCode, number>);
function grow(j: WireJournal): void {
  const cap = j.fromId.length * 2;
  const gi = (o: Int32Array) => { const a = new Int32Array(cap); a.set(o); return a; };
  const gb = (o: Int8Array) => { const a = new Int8Array(cap); a.set(o); return a; };
  const gf = (o: Float64Array) => { const a = new Float64Array(cap); a.set(o); return a; };
  j.fromId = gi(j.fromId); j.toId = gi(j.toId); j.kindId = gb(j.kindId); j.assetRef = gi(j.assetRef);
  j.quantity = gf(j.quantity); j.priceLocal = gf(j.priceLocal); j.reasonId = gi(j.reasonId); j.settleWeek = gi(j.settleWeek);
}

/**
 * §3.13-BOOK d2 — THE WRITE THROWS. A wire names two parties and one instrument, and the ledger
 * RESOLVES all three before it writes: a party that the entity store does not hold, or an
 * instrument no store holds, is a `defect()` at the site — not a row in the party table, not a
 * residual for an audit to find four weeks later. The `WireWorld` is the resolver: the week's
 * (or the seed's) entity arrays and the tranche store, installed beside the journal by `core.ts`
 * and `openSeededBooks`, and told of every party BORN mid-week before that party's first wire
 * (`admitParty`). O8 used to find the seeded-issuer defect (`the-register.md` A4) at the close;
 * this finds it at the write.
 *
 * The party check sits on the int path (`wirePush`), so money wires — settlement's
 * `journalPush`, 145,000 a week — pay one byte read per party after the party's first
 * resolution; the instrument check sits on the `wire()` path, which is where an instrument is
 * named. A worker thread's scratch journal has no world: its rows are replayed on the main thread
 * through `journalPush`, where the world is live.
 */
export interface WireWorld {
  /** Does the entity store hold this party (a region, for the region-keyed arms)? */
  partyExists(ref: PartyRef): boolean;
  /** Does a store hold this instrument? `undefined` for a kind this world does not index yet —
   *  HOUSE and CONTRACT, until slice (d)'s instrument index — which is left unchecked, not passed. */
  instrumentExists(kind: AssetKind, asset: string): boolean | undefined;
  /** A party born this week joins the world before its first wire. */
  admit(ref: PartyRef): void;
}
let world: WireWorld | undefined;
/** Per party id: 1 once the active world has resolved it. Reset with the world. */
let resolved = new Uint8Array(1 << 12);
export function setActiveWireWorld(w: WireWorld | undefined): void { world = w; resolved.fill(0); }
/** A birth: the newborn is admitted to the active world, so its first wire resolves. */
export function admitParty(ref: PartyRef): void {
  if (!world) return defect(`${partyDesc(ref)} was born with no world active to join`);
  world.admit(ref);
  const id = partyId(ref);
  if (id >= resolved.length) growResolved(id);
  resolved[id] = 1;
}
function growResolved(id: number): void {
  const next = new Uint8Array(Math.max(id + 1, resolved.length * 2)); next.set(resolved); resolved = next;
}
const partyDesc = (p: PartyRef): string =>
  'id' in p ? `${p.kind}:${p.id}` : 'industry' in p ? `${p.kind}:${p.region}:${p.industry}` : `${p.kind}:${p.region}`;
/** §3.13-BOOK d4b: a party a CONTRACT names resolves against the active world, as a wire's do. */
export function resolvePartyRef(ref: PartyRef, what: string): void {
  const w = world ?? defect(`${what} names ${partyDesc(ref)} with no world active to resolve it against`);
  resolveParty(w, partyId(ref));
}
function resolveParty(w: WireWorld, id: number): void {
  if (id < resolved.length ? resolved[id] === 1 : (growResolved(id), false)) return;
  const ref = partyOf(id);
  if (!w.partyExists(ref)) {
    defect(`wire names ${partyDesc(ref)}, which is no entity, region or bank in this world — a party the entity store does not hold`);
  }
  resolved[id] = 1;
}

/** The hot-loop write: ids already interned. Returns the wire number. */
export function wirePush(
  j: WireJournal, fromId: number, toId: number, kindId: number, assetRef: number,
  quantity: number, priceLocal: number, reasonId: number, settleWeek: number
): number {
  if (!(quantity > 0) || !isFinite(quantity) || !isFinite(priceLocal) || priceLocal < 0) {
    throw new Error(`ENGINE DEFECT: wire ${ASSET_KINDS[kindId]} ${assetText(assetRef)} carries quantity=${quantity} price=${priceLocal} — a wire moves a positive quantity at a finite price`);
  }
  if (fromId === toId) {
    throw new Error(`ENGINE DEFECT: wire ${ASSET_KINDS[kindId]} ${assetText(assetRef)} from a party to itself`);
  }
  if (world) { resolveParty(world, fromId); resolveParty(world, toId); }
  if (j.n >= j.fromId.length) grow(j);
  const i = j.n;
  j.fromId[i] = fromId; j.toId[i] = toId; j.kindId[i] = kindId; j.assetRef[i] = assetRef;
  j.quantity[i] = quantity; j.priceLocal[i] = priceLocal; j.reasonId[i] = reasonId; j.settleWeek[i] = settleWeek;
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
  // §3.13-BOOK d2: the instrument resolves against its store before anything is written — an
  // issuance (`creates`) is the one wire that names an instrument nothing holds yet.
  const w = world ?? defect(`wire ${instruction.kind} ${instruction.asset} with no world active — nothing can resolve its parties or its instrument`);
  if (!instruction.creates && w.instrumentExists(instruction.kind, instruction.asset) === false) {
    defect(`wire ${instruction.kind} ${instruction.asset} (${partyDesc(instruction.from)} -> ${partyDesc(instruction.to)}) names an instrument no store holds :: ${instruction.reason}`);
  }
  // WIRE_TRACE=<asset substring>: print every non-money wire naming that asset (a probe's instrument).
  if (typeof process !== 'undefined' && process.env?.WIRE_TRACE && instruction.kind !== 'MONEY' && instruction.asset.includes(process.env.WIRE_TRACE)) {
    const who = (p: PartyRef) => { const q = p as { kind: string; ticker?: string; id?: string; region?: string }; return `${q.kind}:${q.ticker ?? q.id ?? q.region ?? ''}`; };
    console.log(`  [wire] w${j.week} ${instruction.kind} ${instruction.asset} ${who(instruction.from)} -> ${who(instruction.to)} ${(instruction.quantity * instruction.priceLocal / 1e6).toFixed(1)}M :: ${instruction.reason}`);
  }
  return wirePush(
    j, partyId(instruction.from), partyId(instruction.to), kindIdOf.get(instruction.kind)!,
    internAsset(instruction.asset), instruction.quantity, instruction.priceLocal,
    internReasonId(instruction.reason), instruction.settleWeek ?? j.week
  );
}

/** The week's wires, summarised for the state and the audit. */
interface WireSummary {
  count: number;
  byKind: Record<string, number>;
  valueUSDByKind: Record<string, number>;
  /** Money wires recorded after the last pass — they settle next week (N: dated wires). */
  moneyPendingLocal: number;
  /** §3.13c — the same money wires PER CURRENCY, in that currency's own units. The identity
   *  against settlement's gross is exact here and only approximate in the numéraire, because a
   *  dated row is written in one week at one rate and settles in another at another; comparing
   *  euros against euros needs no rate at all. */
  moneyByCurrency: Record<string, number>;
  /** The dated tail — money wires recorded after the last pass — per currency. */
  moneyPendingByCurrency: Record<string, number>;
  /** §5-WIRES W2: what each region's clearing house holds of each asset kind after the week's
   *  wires, keyed `region|kind` — received minus delivered, in USD at the wires' prices. The
   *  house is on both sides of every fill, so a non-zero net is a leg no wire named. */
  houseNetUSDByKey: Record<string, number>;
  /** W2_TRACE=1 only: the same net per `region|kind|asset` — which paper the house is left holding. */
  houseNetUSDByAsset?: Record<string, number>;
  /** §5-WIRES W3: what the region's issuers put out net of what came back, keyed `region|kind` —
   *  issued (from a COMPANY) minus retired (to a COMPANY). The ladders' change must equal it. */
  issuerNetUSDByKey: Record<string, number>;
  /** LADDER_TRACE=1 only: the same net per issuer ticker and kind, keyed `ticker|kind`. */
  issuerNetUSDByTicker?: Record<string, number>;
  /** §5-WIRES W4: goods wires in minus out per holder region and sub-unit, in UNITS, keyed
   *  `region|subUnit`; a household or a treasury is a sink (its region's stock does not hold
   *  what it bought), a carrier holds its consignments. */
  goodsNetUnitsByKey: Record<string, number>;
  /** W5: what the REGISTER took in net of what it gave up, per asset kind, in the asset's own
   *  unit (shares for equity and fund shares). Only institutions hold register rows, so a wire
   *  TO one credits the register and a wire FROM one debits it; a wire between two other parties
   *  never touches it. The register's change must equal this. */
  registerNetQtyByKind: Record<string, number>;
  /** W5_TRACE=1 only: the same net per `holderId|kind` — which BOOK moved off its wires. */
  registerNetQtyByHolder?: Record<string, number>;
  /** §5-WIRES W4: the week's transformations per `region|subUnit`. */
  goodsFlowByKey: Record<string, { producedUnits: number; consumedUnits: number; scrappedUnits: number }>;
  goodsOutUnitsByKey?: Record<string, number>;
  goodsInUnitsByKey?: Record<string, number>;
  goodsDeliveredByKey?: Record<string, number>;
  goodsInByTicker?: Record<string, number>;
}

/**
 * §3.13c — a MONEY wire's value is a quantity of ONE currency at a price of one of itself, so the
 * four monies have to be brought to the numéraire before they can be added. Every other kind's
 * price is already in one money by construction (an instrument has one quote currency).
 */
export function summarizeWires(j: WireJournal, moneyPending: { numeraire: number; byCurrency: Record<string, number> } = { numeraire: 0, byCurrency: {} }, regionOfIssuer?: (issuerId: EntityId) => string | undefined, reasonTextOf?: (id: number) => string, fx: FxTable = PARITY_FX): WireSummary {
  const moneyPendingLocal = moneyPending.numeraire;
  const moneyPendingByCurrency = moneyPending.byCurrency;
  const byKind: Record<string, number> = {}; const valueUSDByKind: Record<string, number> = {};
  const moneyByCurrency: Record<string, number> = {};
  const houseNetUSDByKey: Record<string, number> = {};
  const w2Trace = typeof process !== 'undefined' && process.env?.W2_TRACE === '1';
  const houseNetUSDByAsset: Record<string, number> | undefined = w2Trace ? {} : undefined;
  const issuerNetUSDByKey: Record<string, number> = {};
  const trace = typeof process !== 'undefined' && process.env?.LADDER_TRACE === '1';
  const issuerNetUSDByTicker: Record<string, number> | undefined = trace ? {} : undefined;
  const goodsNetUnitsByKey: Record<string, number> = {};
  const registerNetQtyByKind: Record<string, number> = {};
  const w5Trace = typeof process !== 'undefined' && process.env?.W5_TRACE === '1';
  const registerNetQtyByHolder: Record<string, number> | undefined = w5Trace ? {} : undefined;
  const goodsTrace = typeof process !== 'undefined' && process.env?.GOODS_TRACE === '1';
  const goodsOutUnitsByKey: Record<string, number> | undefined = goodsTrace ? {} : undefined;
  const goodsInUnitsByKey: Record<string, number> | undefined = goodsTrace ? {} : undefined;
  const goodsInByTicker: Record<string, number> | undefined = goodsTrace ? {} : undefined;
  const holderRegionOf = (p: PartyRef): string | undefined => {
    switch (p.kind) {
      case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': return regionOfIssuer?.(p.id);
      // A pool sells from no stock and consumes what it buys: a source and a sink, never a
      // holder — the consignments the transport pool carries on lanes no named fleet serves
      // pass through it the same way (a NAMED carrier holds its consignments; a pool's own
      // purchases and its carriage cannot be told apart on one aggregate party).
      case 'SEGMENT': return undefined;
      case 'CLEARING_HOUSE': case 'CENTRAL_BANK': case 'CCP': return p.region;
      case 'HOUSEHOLD': case 'GOVERNMENT': return undefined; // a sink: consumed on receipt
      default: return undefined;
    }
  };
  for (let i = 0; i < j.n; i++) {
    const k = ASSET_KINDS[j.kindId[i]];
    let valueLocal = j.quantity[i] * j.priceLocal[i];
    if (k === 'MONEY') {
      const cur = assetText(j.assetRef[i]);
      moneyByCurrency[cur] = (moneyByCurrency[cur] ?? 0) + valueLocal;
      valueLocal = toNumeraire(valueLocal, cur as CurrencyCode, fx);
    }
    byKind[k] = (byKind[k] ?? 0) + 1;
    valueUSDByKind[k] = (valueUSDByKind[k] ?? 0) + valueLocal;
    if (k === 'MONEY') continue;
    const from = partyOf(j.fromId[i]), to = partyOf(j.toId[i]);
    if (k === 'GOOD') {
      const asset = assetText(j.assetRef[i]);
      const rf = holderRegionOf(from), rt = holderRegionOf(to);
      if (rf) { const key = `${rf}|${asset}`; goodsNetUnitsByKey[key] = (goodsNetUnitsByKey[key] ?? 0) - j.quantity[i]; if (goodsOutUnitsByKey) goodsOutUnitsByKey[key] = (goodsOutUnitsByKey[key] ?? 0) + j.quantity[i]; }
      if (rt) { const key = `${rt}|${asset}`; goodsNetUnitsByKey[key] = (goodsNetUnitsByKey[key] ?? 0) + j.quantity[i]; if (goodsInUnitsByKey) goodsInUnitsByKey[key] = (goodsInUnitsByKey[key] ?? 0) + j.quantity[i]; }
      if (goodsInByTicker && rt) { const kk = `${rt}|${asset}|KIND:${to.kind}`; goodsInByTicker[kk] = (goodsInByTicker[kk] ?? 0) + j.quantity[i]; }
      if (goodsInByTicker && to.kind === 'COMPANY') { const tk = `${to.id}|${asset}|${reasonTextOf?.(j.reasonId[i]) ?? j.reasonId[i]}`; goodsInByTicker[tk] = (goodsInByTicker[tk] ?? 0) + j.quantity[i]; }
      continue;
    }
    // AN ISSUER IS NOT A HOLDER OF ITS OWN INSTRUMENT. A vehicle's shares are issued BY the
    // vehicle, which is an institution like its holders but keeps no register row of itself, so
    // its leg moves no row and must not net against the holder's — and the vehicle's id IS the
    // instrument's. The test is asked ONLY of a vehicle claim: entity ids are not unique across
    // kinds (a seeded institution carries its company's id), so an id match on ordinary equity
    // would silently drop a real holder's leg.
    const selfIssued = isVehicleClaim(k) ? assetText(j.assetRef[i]) : undefined;
    if (to.kind === 'INSTITUTION' && to.id !== selfIssued) {
      registerNetQtyByKind[k] = (registerNetQtyByKind[k] ?? 0) + j.quantity[i];
      if (registerNetQtyByHolder) { const hk = `${to.id}|${k}`; registerNetQtyByHolder[hk] = (registerNetQtyByHolder[hk] ?? 0) + j.quantity[i]; }
    }
    if (from.kind === 'INSTITUTION' && from.id !== selfIssued) {
      registerNetQtyByKind[k] = (registerNetQtyByKind[k] ?? 0) - j.quantity[i];
      if (registerNetQtyByHolder) { const hk = `${from.id}|${k}`; registerNetQtyByHolder[hk] = (registerNetQtyByHolder[hk] ?? 0) - j.quantity[i]; }
    }
    if (to.kind === 'CLEARING_HOUSE') { const key = `${to.region}|${k}`; houseNetUSDByKey[key] = (houseNetUSDByKey[key] ?? 0) + valueLocal; if (houseNetUSDByAsset) { const ak = `${key}|${assetText(j.assetRef[i])}`; houseNetUSDByAsset[ak] = (houseNetUSDByAsset[ak] ?? 0) + valueLocal; } }
    if (from.kind === 'CLEARING_HOUSE') { const key = `${from.region}|${k}`; houseNetUSDByKey[key] = (houseNetUSDByKey[key] ?? 0) - valueLocal; if (houseNetUSDByAsset) { const ak = `${key}|${assetText(j.assetRef[i])}`; houseNetUSDByAsset[ak] = (houseNetUSDByAsset[ak] ?? 0) - valueLocal; } }
    if (regionOfIssuer) {
      if (from.kind === 'COMPANY') { const rg = regionOfIssuer(from.id); if (rg) { const key = `${rg}|${k}`; issuerNetUSDByKey[key] = (issuerNetUSDByKey[key] ?? 0) + valueLocal; if (issuerNetUSDByTicker) { const tk = `${from.id}|${k}`; issuerNetUSDByTicker[tk] = (issuerNetUSDByTicker[tk] ?? 0) + valueLocal; } } }
      if (to.kind === 'COMPANY') { const rg = regionOfIssuer(to.id); if (rg) { const key = `${rg}|${k}`; issuerNetUSDByKey[key] = (issuerNetUSDByKey[key] ?? 0) - valueLocal; if (issuerNetUSDByTicker) { const tk = `${to.id}|${k}`; issuerNetUSDByTicker[tk] = (issuerNetUSDByTicker[tk] ?? 0) - valueLocal; } } }
    }
  }
  return { count: j.n, byKind, valueUSDByKind, moneyPendingLocal, moneyByCurrency, moneyPendingByCurrency, houseNetUSDByKey, ...(houseNetUSDByAsset ? { houseNetUSDByAsset } : {}), issuerNetUSDByKey, issuerNetUSDByTicker, goodsNetUnitsByKey, registerNetQtyByKind, ...(registerNetQtyByHolder ? { registerNetQtyByHolder } : {}), goodsFlowByKey: j.goodsFlows, ...(goodsTrace ? { goodsOutUnitsByKey, goodsInUnitsByKey, goodsDeliveredByKey: j.goodsDelivered, goodsInByTicker } : {}) };
}
