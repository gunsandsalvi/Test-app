/** AU · object: tranche — one tranche of debt: a firm's, or a sovereign's. Reached from a ladder. */

import { defineObject } from './registry';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder } from '../../engine2/tranches';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel } from '../format';
import { formatDate, formatSpan, yearOfWeek } from '../calendar';
import { instrumentDisplayName } from '../../domain/instruments';
import { isDiscountBill } from '../../domain/government';
import { World, companyOf, regionOf, displayWeek } from '../world';
import { materializeLadder } from '../../engine2/tranches';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, words } from './common';

export interface TrancheView {
  ownerRef: { type: 'company' | 'region'; id: string };
  ownerName: string;
  id: string;
  /** §3.14: the name a market would use — `KRLN 4.75% 2031`, `USA 3M bill`. */
  name: string;
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
/** The UI's calendar, on the display week (§3.14: a maturity's year in a name). */
export const yearOf = (world: World) => (w: number): number => yearOfWeek(displayWeek(world.state, w));

function trancheOf(world: World, key: string): TrancheView | undefined {
  const i = key.indexOf('|');
  const owner = key.slice(0, i); const id = key.slice(i + 1);
  const reg = regionOf(world, owner);
  if (reg) {
    const t = materializeGovLadder(ensureV2(world.state), reg.id).find((x) => x.id === id);
    if (!t) return undefined;
    const name = instrumentDisplayName(reg.id, { rateType: 'FIXED', couponRate: t.couponRate, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, isBill: isDiscountBill(t.tenorAtIssuanceYears) }, yearOf(world));
    return { ownerRef: { type: 'region', id: owner }, ownerName: `${owner} treasury`, id, name, principalLocal: t.principalLocal, couponRate: t.couponRate, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, tenorYears: t.tenorAtIssuanceYears };
  }
  const c = companyOf(world, owner);
  if (!c) return undefined;
  const t = materializeLadder(world.v2, c.id).find((x) => x.id === id);
  if (!t) return undefined;
  const policy = regionOf(world, c.region)?.policyRate ?? 0;
  const coupon = t.rateType === 'FLOATING' ? policy + (t.floatingMarginBps ?? 0) / 10_000 : (t.couponRate ?? 0);
  return { ownerRef: { type: 'company', id: c.id }, ownerName: c.name, id, name: instrumentDisplayName(c.ticker, t, yearOf(world)), principalLocal: t.principalLocal, couponRate: coupon, rateType: t.rateType, floatingMarginBps: t.floatingMarginBps, seniority: t.seniority, originationWeek: t.originationWeek, maturityWeek: t.maturityWeek, callProtection: t.callProtection, isCommercialPaper: t.isCommercialPaper, isBankFacility: t.isBankFacility, facilityBankId: t.facilityBankId };
}

export const tranche = defineObject<TrancheView>({
  type: 'tranche',
  words: ['tranche', 'tranches'],
  searchable: false,
  find: trancheOf,
  list: () => [],
  label: (_w, _id, t) => ({ ticker: t.name, name: `${t.ownerName} · ${money(t.principalLocal)}`, kind: t.ownerRef.type === 'region' ? 'sovereign tranche' : t.isCommercialPaper ? 'commercial paper' : t.isBankFacility ? 'bank facility' : 'debt tranche' }),
  headline: (_w, _id, t) => ({ value: money(t.principalLocal), sub: pctLevel(t.couponRate, 2) }),
  overview({ world, obj: t, nav }) {
    const now = world.state.currentWeek;
    const left = t.maturityWeek - now;
    return (
      <>
        <ObjectHeader name={t.name} sub={<>{t.ownerRef.type === 'region' ? 'sovereign tranche of ' : t.isCommercialPaper ? 'commercial paper of ' : t.isBankFacility ? 'bank facility of ' : t.seniority === 'SUBORDINATED' ? 'subordinated tranche of ' : 'senior tranche of '}<Link to={t.ownerRef} nav={nav}>{t.ownerName}</Link>{t.ownerRef.type === 'region' ? <> · <RegionLink id={t.ownerRef.id} nav={nav} /></> : null}</>} />
        <StatGrid>
          <Stat label="principal" value={money(t.principalLocal)} sub="outstanding" />
          <Stat label="coupon" value={pctLevel(t.couponRate, 2)} sub={t.rateType === 'FLOATING' ? `policy + ${t.floatingMarginBps ?? 0}bp` : 'fixed'} />
          <Stat label="due" value={formatDate(displayWeek(world.state, t.maturityWeek))} sub={left > 0 ? `in ${formatSpan(left)}` : 'matured'} neg={left <= 4} />
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
