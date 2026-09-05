/** AU · object: tranche — one tranche of debt: a firm's, or a sovereign's. Reached from a ladder,
 *  and (§3.15-i) from the command bar: by its market name, its issuer or its class. */

import { defineObject } from './registry';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder } from '../../engine2/tranches';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, bps } from '../format';
import { paperQuoteOf, PaperQuote } from '../../engine/credit-price';
import { issuerIdOf } from '../../engine2/tranches';
import { regionOfGovernmentEntity } from '../../domain/entity-keys';
import { formatDate, formatSpan, formatMonthYear, yearOfWeek } from '../calendar';
import { REGION_IDS } from '../../domain/geography';
import { instrumentDisplayName } from '../../domain/instruments';
import { isDiscountBill } from '../../domain/government';
import { World, companyOf, regionOf, displayWeek } from '../world';
import { materializeLadder } from '../../engine2/tranches';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, words } from './common';
import type { DebtTranche } from '../../domain/company';
import type { GovDebtTrancheView } from '../../domain/region-macro';

interface TrancheView {
  ownerRef: { type: 'company' | 'region'; id: string };
  ownerName: string;
  id: string;
  /** §3.14: the name a market would use — `KRLN 4.75% 2031`, `USA 3M bill`. */
  name: string;
  /** §3.15-i: the class a market files it under — the search's and the screener's word. */
  kind: TrancheKind;
  issuerTicker: string;
  region: string;
  principalLocal: number;
  couponRate: number;
  rateType?: string;
  floatingMarginBps?: number;
  seniority?: string;
  isCommercialPaper?: boolean;
  isBankFacility?: boolean;
  facilityBankId?: string;
  originationWeek: number;
  maturityWeek: number;
  tenorYears?: number;
  callProtection?: unknown;
}
export const trancheId = (ownerId: string, id: string): string => `${ownerId}|${id}`;
type TrancheKind = 'bond' | 'subordinated bond' | 'loan' | 'facility' | 'commercial paper' | 'sovereign bond' | 'bill';
/** The class words a market files a tranche under, plural as the kind word and singular as a keyword. */
const CLASS_GROUP: Record<TrancheKind, string> = { bond: 'bonds', 'subordinated bond': 'bonds', loan: 'loans', facility: 'facilities', 'commercial paper': 'commercial paper', 'sovereign bond': 'sovereigns', bill: 'bills' };
const CLASS_GROUPS = ['bonds', 'loans', 'commercial paper', 'facilities', 'sovereigns', 'bills'];

function sovereignView(world: World, regionId: string, t: GovDebtTrancheView): TrancheView {
  const isBill = isDiscountBill(t.tenorAtIssuanceYears);
  const name = instrumentDisplayName(regionId, { rateType: 'FIXED', couponRate: t.couponRate, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, isBill }, yearOf(world));
  return { ownerRef: { type: 'region', id: regionId }, ownerName: `${regionId} treasury`, id: t.id, name, kind: isBill ? 'bill' : 'sovereign bond', issuerTicker: regionId, region: regionId, principalLocal: t.principalLocal, couponRate: t.couponRate, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, tenorYears: t.tenorAtIssuanceYears };
}
function companyView(world: World, c: { id: string; name: string; ticker: string; region: string }, policy: number, t: DebtTranche): TrancheView {
  const coupon = t.rateType === 'FLOATING' ? policy + (t.floatingMarginBps ?? 0) / 10_000 : (t.couponRate ?? 0);
  const kind: TrancheKind = t.isCommercialPaper ? 'commercial paper' : t.isBankFacility ? 'facility' : t.rateType === 'FLOATING' ? 'loan' : t.seniority === 'SUBORDINATED' ? 'subordinated bond' : 'bond';
  return { ownerRef: { type: 'company', id: c.id }, ownerName: c.name, id: t.id, name: instrumentDisplayName(c.ticker, t, yearOf(world)), kind, issuerTicker: c.ticker, region: c.region, principalLocal: t.principalLocal, couponRate: coupon, rateType: t.rateType, floatingMarginBps: t.floatingMarginBps, seniority: t.seniority, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, callProtection: t.callProtection, isCommercialPaper: t.isCommercialPaper, isBankFacility: t.isBankFacility, facilityBankId: t.facilityBankId };
}

/**
 * §3.15-ii — PRICE AND SPREAD, side by side, from the ONE price store (`credit-price.ts:paperQuoteOf`):
 * the issuer's region supplies the curve a corporate spread is read against.
 */
export function quoteOfInstrument(world: World, instrumentId: string): PaperQuote | undefined {
  const v2 = ensureV2(world.state);
  let issuerId: string;
  try { issuerId = issuerIdOf(v2, instrumentId); } catch { return undefined; }
  const regionId = regionOfGovernmentEntity(issuerId) ?? companyOf(world, issuerId)?.region;
  const reg = regionId ? regionOf(world, regionId) : undefined;
  return paperQuoteOf(v2, instrumentId, reg?.zeroRates ? { zeroRates: reg.zeroRates, policyRate: reg.policyRate } : undefined, world.state.currentWeek);
}
/** "98.50" — a price per hundred of face; "—" where no market has printed one. */
export const priceWord = (q: PaperQuote | undefined): string => (q ? (q.pricePerFace * 100).toFixed(2) : '—');
/** "350bp" on corporate paper, "4.12% yld" on a sovereign, "—" where nothing prints. */
export const spreadWord = (q: PaperQuote | undefined): string =>
  q?.spreadBps !== undefined ? `${bps(q.spreadBps)}bp` : q?.yieldAnnual !== undefined ? `${pctLevel(q.yieldAnnual, 2)} yld` : '—';

/** §3.15-i: every live tranche in the world, once per world (the search reads it per keystroke). */
const listMemo = new WeakMap<World, { id: string; obj: TrancheView }[]>();
function allTranches(world: World): { id: string; obj: TrancheView }[] {
  let out = listMemo.get(world);
  if (out) return out;
  out = [];
  const v2 = ensureV2(world.state);
  for (const c of world.state.companies) {
    const policy = regionOf(world, c.region)?.policyRate ?? 0;
    for (const t of materializeLadder(v2, c.id)) out.push({ id: trancheId(c.id, t.id), obj: companyView(world, c, policy, t) });
  }
  for (const r of REGION_IDS) {
    for (const t of materializeGovLadder(v2, r)) out.push({ id: trancheId(r, t.id), obj: sovereignView(world, r, t) });
  }
  listMemo.set(world, out);
  return out;
}
/** The UI's calendar, on the display week (§3.14: a maturity's year in a name). */
export const yearOf = (world: World) => (w: number): number => yearOfWeek(displayWeek(world.state, w));

function trancheOf(world: World, key: string): TrancheView | undefined {
  const i = key.indexOf('|');
  const owner = key.slice(0, i); const id = key.slice(i + 1);
  const reg = regionOf(world, owner);
  if (reg) {
    const t = materializeGovLadder(ensureV2(world.state), reg.id).find((x) => x.id === id);
    return t ? sovereignView(world, reg.id, t) : undefined;
  }
  const c = companyOf(world, owner);
  if (!c) return undefined;
  const t = materializeLadder(world.v2, c.id).find((x) => x.id === id);
  if (!t) return undefined;
  return companyView(world, c, regionOf(world, c.region)?.policyRate ?? 0, t);
}

export const tranche = defineObject<TrancheView>({
  type: 'tranche',
  words: ['tranche', 'tranches'],
  // §3.15-i: searchable by name, issuer and class; a class word opens the screener on that class.
  searchable: true,
  find: trancheOf,
  list: allTranches,
  label: (_w, _id, t) => ({ ticker: t.name, name: `${t.ownerName} · ${money(t.principalLocal)}`, kind: t.kind, region: t.region }),
  keywords: (_w, _id, t) => [t.issuerTicker.toLowerCase(), ...t.ownerName.toLowerCase().split(/\s+/), t.kind, CLASS_GROUP[t.kind], t.region.toLowerCase(), 'tranche', ...(t.kind === 'commercial paper' ? ['cp'] : []), ...(t.ownerRef.type === 'region' ? ['sovereign', 'government'] : [])],
  parse: (world, phrase) => { const q = phrase.trim().toLowerCase(); return allTranches(world).find((x) => x.obj.name.toLowerCase() === q)?.id; },
  kindWords: { bond: 'bonds', bonds: 'bonds', loan: 'loans', loans: 'loans', cp: 'commercial paper', 'commercial paper': 'commercial paper', paper: 'commercial paper', facility: 'facilities', facilities: 'facilities', sovereign: 'sovereigns', sovereigns: 'sovereigns', bill: 'bills', bills: 'bills' },
  peers: {
    groups: (world, _id, t) => {
      const all = allTranches(world);
      return [
        { name: `${t.issuerTicker} ladder`, ids: all.filter((x) => x.obj.ownerRef.id === t.ownerRef.id).map((x) => x.id) },
        ...CLASS_GROUPS.map((g) => ({ name: g, ids: all.filter((x) => CLASS_GROUP[x.obj.kind] === g).map((x) => x.id) })),
        { name: 'all tranches', ids: all.map((x) => x.id) },
      ];
    },
    defaultSort: 'principal',
    columns: [
      { key: 'name', label: 'tranche', width: 1.8, render: (r, _w, nav) => <Link to={{ type: 'tranche', id: r.id }} nav={nav}>{r.obj.name}</Link>, value: (r) => r.obj.name },
      { key: 'issuer', label: 'issuer', render: (r, _w, nav) => <Link to={r.obj.ownerRef} nav={nav}>{r.obj.issuerTicker}</Link>, value: (r) => r.obj.issuerTicker },
      { key: 'class', label: 'class', render: (r) => r.obj.kind, value: (r) => r.obj.kind },
      { key: 'principal', label: 'principal', render: (r) => money(r.obj.principalLocal), value: (r) => r.obj.principalLocal },
      { key: 'rate', label: 'rate', render: (r) => pctLevel(r.obj.couponRate, 2), value: (r) => r.obj.couponRate },
      { key: 'price', label: 'price', render: (r, w) => priceWord(quoteOfInstrument(w, r.obj.id)), value: (r, w) => quoteOfInstrument(w, r.obj.id)?.pricePerFace ?? -1 },
      { key: 'spread', label: 'spread', render: (r, w) => spreadWord(quoteOfInstrument(w, r.obj.id)), value: (r, w) => { const q = quoteOfInstrument(w, r.obj.id); return q?.spreadBps ?? (q?.yieldAnnual !== undefined ? q.yieldAnnual * 10000 : -1); } },
      { key: 'due', label: 'due', render: (r, w) => formatMonthYear(displayWeek(w.state, r.obj.maturityWeek)), value: (r) => r.obj.maturityWeek },
    ],
  },
  headline: (_w, _id, t) => ({ value: money(t.principalLocal), sub: pctLevel(t.couponRate, 2) }),
  overview({ world, obj: t, nav }) {
    const now = world.state.currentWeek;
    const left = t.maturityWeek - now;
    const q = quoteOfInstrument(world, t.id);
    return (
      <>
        <ObjectHeader name={t.name} sub={<>{t.ownerRef.type === 'region' ? 'sovereign tranche of ' : t.isCommercialPaper ? 'commercial paper of ' : t.isBankFacility ? 'bank facility of ' : t.seniority === 'SUBORDINATED' ? 'subordinated tranche of ' : 'senior tranche of '}<Link to={t.ownerRef} nav={nav}>{t.ownerName}</Link>{t.ownerRef.type === 'region' ? <> · <RegionLink id={t.ownerRef.id} nav={nav} /></> : null}</>} />
        <StatGrid>
          <Stat label="principal" value={money(t.principalLocal)} sub="outstanding" />
          <Stat label="coupon" value={pctLevel(t.couponRate, 2)} sub={t.rateType === 'FLOATING' ? `policy + ${t.floatingMarginBps ?? 0}bp` : 'fixed'} />
          <Stat label="due" value={formatDate(displayWeek(world.state, t.maturityWeek))} sub={left > 0 ? `in ${formatSpan(left)}` : 'matured'} neg={left <= 4} />
        </StatGrid>
        {/* §3.15-ii: the price and what it implies, side by side, off the one price store. */}
        <StatGrid cols={2}>
          <Stat label="price" value={priceWord(q)} sub={q ? 'per 100 of face, last cleared' : 'no market has printed this paper'} />
          <Stat label={q?.yieldAnnual !== undefined ? 'yield' : t.rateType === 'FLOATING' ? 'discount margin' : 'OAS'} value={spreadWord(q)} sub={q?.yieldAnnual !== undefined ? 'the price implies' : q?.spreadBps !== undefined ? 'over the curve, at its life' : ''} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="issued" v={formatDate(displayWeek(world.state, t.originationWeek))} />
          <KV k="id" hint="the internal id; the name above is the market's" v={t.id} />
          {t.tenorYears !== undefined ? <KV k="tenor at issue" v={`${t.tenorYears} years`} /> : null}
          {t.seniority !== undefined ? <KV k="seniority" v={words(t.seniority)} /> : null}
          {t.isCommercialPaper ? <KV k="paper" hint="13-week, rolled weekly" v="commercial paper" /> : null}
          {t.isBankFacility ? <KV k="paper" hint={t.facilityBankId ? `drawn at ${t.facilityBankId}` : undefined} v="bank facility" /> : null}
          {t.callProtection ? <KV k="call protection" v={words(String((t.callProtection as { kind?: string }).kind ?? JSON.stringify(t.callProtection)))} /> : null}
          <KV k="annual interest" v={money(t.principalLocal * t.couponRate)} />
        </Card>
        <FunctionTiles nav={nav} tiles={[{ fn: 'all', sub: 'the stored record' }]} />
        <AllRow fields={Object.keys(t).length} nav={nav} />
      </>
    );
  },
});
