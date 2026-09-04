/**
 * §5-NEWS — NEWS IS A DERIVED NARRATIVE OVER WHAT THE ENGINE RECORDED THIS WEEK.
 *
 * A story here is never invented: it is an event the week's stages wrote (a default, a rating
 * move, a birth carved from a pool, a merger, plant taken offline, a bank at the window, a
 * region's labour market moving) told in the numbers the state holds at that moment, with the
 * objects it names as `refs` (every one a link in the UI) and, where the ledger says why, the
 * WHY traced through the payment journal ("cash −4M after 12M of interest to VOUL and 30M of
 * inputs"). Rule 4 binds: no narrative templates from the real world, no colour — the interest
 * is that the causal chain is real. Stories carry a size (`materialityLocal`) so a reader's feed
 * ranks by what matters, and a region's story cites the firms that moved it.
 *
 * Runs after every mechanism stage and before the feed is assembled (13-news).
 */

import { GameState, Company, RegionId } from '../../../types';
import { NewsItem } from '../../../domain/events';
import { WeeklyStepContext } from './context';
import { issuerSpreadAtOnCurve } from '../../credit-price';
import { STANDARD_CORP_TENOR_YEARS } from '../../../domain/primary-market';
import { partyId, partyOf, PartyRef } from '../../ledger/party';
import { reasonText } from './settlement';
import { isActiveCompany } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { marketCapOf } from '../../../domain/company';
import { ladderTotalLocal } from '../../../engine2/tranches';
import { cashOf, bankReservesOf, householdDepositsAt } from '../../ledger/accounts';

type Ref = NonNullable<NewsItem['refs']>[number];

const M = (usd: number): string => {
  const a = Math.abs(usd);
  if (a >= 1e12) return `${(usd / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(usd / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(usd / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(usd / 1e3).toFixed(0)}k`;
  return usd.toFixed(0);
};
const P = (x: number, d = 1): string => `${(100 * x).toFixed(d)}%`;
const N = (x: number): string => Math.round(x).toLocaleString('en-US');

function partyLabel(p: PartyRef): string {
  switch (p.kind) {
    case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': return p.ticker;
    case 'INSTITUTION': return p.id;
    case 'SEGMENT': return `the ${p.region} ${p.industry} pool`;
    case 'HOUSEHOLD': return `${p.region} households`;
    case 'GOVERNMENT': return `the ${p.region} treasury`;
    case 'CENTRAL_BANK': return `the ${p.region} central bank`;
    default: return p.kind.toLowerCase().replace(/_/g, ' ');
  }
}
function partyRef(p: PartyRef, byTicker: Map<string, Company>): Ref | undefined {
  if (p.kind === 'COMPANY' || p.kind === 'BANK' || p.kind === 'BANK_CREDIT' || p.kind === 'BANK_SECURITIES') {
    const c = byTicker.get(p.ticker);
    return c ? { type: 'company', id: c.id } : undefined;
  }
  if (p.kind === 'INSTITUTION') return { type: 'institution', id: p.id };
  if ('region' in p) return { type: 'region', id: p.region };
  return undefined;
}

/** The week's largest outflows of one payer, by reason, off the journal — the WHY a death cites. */
function outflowsOf(ctx: WeeklyStepContext, party: PartyRef, byTicker: Map<string, Company>, top = 3): { text: string; refs: Ref[] } {
  const j = ctx.paymentJournal;
  const id = partyId(party);
  const byReason = new Map<string, { usd: number; payee: number }>();
  for (let r = 0; r < j.n; r++) {
    if (j.payerId[r] !== id) continue;
    const reason = reasonText(j.reasonId[r]);
    const cur = byReason.get(reason) ?? { usd: 0, payee: j.payeeId[r] };
    cur.usd += j.amount[r];
    byReason.set(reason, cur);
  }
  const rows = [...byReason.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, top);
  const refs: Ref[] = [];
  const parts = rows.map(([reason, { usd, payee }]) => {
    const p = partyOf(payee);
    const ref = partyRef(p, byTicker);
    if (ref) refs.push(ref);
    return `${M(usd)} of ${reason} to ${partyLabel(p)}`;
  });
  return { text: parts.join(', '), refs };
}

function region(id: RegionId): Ref { return { type: 'region', id }; }
function company(c: Company): Ref { return { type: 'company', id: c.id }; }

export function runNewsDerivationStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const out: NewsItem[] = [];
  const byTicker = new Map<string, Company>();
  ctx.updatedCompanies.forEach((c) => byTicker.set(c.ticker, c));
  const prevByTicker = new Map<string, Company>();
  state.companies.forEach((c) => prevByTicker.set(c.ticker, c));
  const bankRef = (c: Company): Ref | undefined => {
    const b = c.homeBankTicker ? byTicker.get(c.homeBankTicker) : undefined;
    return b ? company(b) : undefined;
  };
  const push = (item: Omit<NewsItem, 'week' | 'urgent' | 'impactBadge'> & { urgent?: boolean }) => {
    out.push({ week, urgent: item.urgent ?? false, impactBadge: `[${(item.kind ?? 'story').toUpperCase()}]`, ...item });
  };

  // ---- 1. Deaths: a firm's default, with its books and the ledger's why. ----
  ctx.defaultedTickers.forEach((ticker) => {
    const c = byTicker.get(ticker);
    if (!c || c.isBankEntity) return;
    const why = outflowsOf(ctx, { kind: 'COMPANY', ticker }, byTicker);
    const refs: Ref[] = [company(c), region(c.region)];
    const bank = bankRef(c);
    if (bank) refs.push(bank);
    push({
      id: `default-${ticker}-${week}`,
      kind: 'default',
      category: 'CREDIT',
      title: `${c.name} defaults`,
      description: `${ticker} (${c.sector}, ${c.region}) ran out of cash: ${M(cashOf(ctx.v2, c))} on hand against coverage of ${c.interestCoverage.toFixed(2)}×, ${M(c.annualRevenue)} of revenue and ${M(ladderTotalLocal(ctx.v2, c.id))} of debt; ${N(c.employeeCount)} people worked there${c.homeBankTicker ? `, banked at ${c.homeBankTicker}` : ''}.`,
      cause: why.text ? `This week it paid ${why.text}.` : undefined,
      refs: [...refs, ...why.refs],
      materialityLocal: Math.max(ladderTotalLocal(ctx.v2, c.id), c.annualRevenue),
      impactRegion: c.region, impactSector: c.sector, affectedTicker: ticker,
      urgent: c.annualRevenue > 1e9,
    });
  });

  // ---- 2. Ratings: a crossing of the investment-grade line or a two-notch move is a story;
  // every other move goes into the week's digest per region (the notch drift is ~75 a week). ----
  const NOTCHES = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
  const digest = new Map<RegionId, { up: string[]; down: string[] }>();
  ctx.ratingChanges.forEach((rc) => {
    const c = byTicker.get(rc.ticker);
    if (!c || rc.to === 'D') return;
    const from = NOTCHES.indexOf(rc.from);
    const to = NOTCHES.indexOf(rc.to);
    const up = to < from;
    const crossesIg = (from <= 3) !== (to <= 3);
    const big = Math.abs(to - from) >= 2;
    if (!crossesIg && !big) {
      const d = digest.get(c.region) ?? { up: [], down: [] };
      (up ? d.up : d.down).push(`${rc.ticker} ${rc.from}→${rc.to}`);
      digest.set(c.region, d);
      return;
    }
    push({
      id: `rating-${rc.ticker}-${week}`,
      kind: up ? 'upgrade' : 'downgrade',
      category: 'CREDIT',
      title: `${c.name} ${up ? 'upgraded' : 'downgraded'} to ${rc.to}${crossesIg ? (up ? ', back to investment grade' : ', out of investment grade') : ''}`,
      description: `${rc.ticker} moves ${rc.from} → ${rc.to}; its five-year bonds clear ${Math.round(issuerSpreadAtOnCurve(ctx.v2, ctx.updatedRegions[c.region], c.id, ctx.nextWeek, STANDARD_CORP_TENOR_YEARS)?.spreadBps ?? 0)}bp over the curve and its protection ${Math.round(c.cdsSpreadBps)}bp. Leverage ${c.leverage.toFixed(1)}×, coverage ${c.interestCoverage.toFixed(1)}×, cash ${M(cashOf(ctx.v2, c))}, revenue ${M(c.annualRevenue)}.`,
      refs: [company(c), region(c.region)],
      materialityLocal: ladderTotalLocal(ctx.v2, c.id),
      impactRegion: c.region, impactSector: c.sector, affectedTicker: rc.ticker,
      urgent: crossesIg && !up,
    });
  });
  digest.forEach((d, rid) => {
    if (d.up.length + d.down.length === 0) return;
    push({
      id: `ratings-${rid}-${week}`,
      kind: 'ratings',
      category: 'CREDIT',
      title: `${rid}: ${d.down.length} downgrade${d.down.length === 1 ? '' : 's'}, ${d.up.length} upgrade${d.up.length === 1 ? '' : 's'}`,
      description: (d.down.length ? `Down: ${d.down.slice(0, 12).join(', ')}${d.down.length > 12 ? ` and ${d.down.length - 12} more` : ''}. ` : '')
        + (d.up.length ? `Up: ${d.up.slice(0, 12).join(', ')}${d.up.length > 12 ? ` and ${d.up.length - 12} more` : ''}.` : ''),
      refs: [region(rid)],
      materialityLocal: 0,
      impactRegion: rid,
    });
  });

  // ---- 3. Mergers this week. ----
  ctx.recentMergers.filter((m) => m.week === week).forEach((m) => {
    const a = byTicker.get(m.acquirerTicker);
    const t = byTicker.get(m.targetTicker) ?? prevByTicker.get(m.targetTicker);
    if (!a || !t) return;
    push({
      id: `merger-${m.acquirerTicker}-${m.targetTicker}-${week}`,
      kind: 'merger',
      category: 'CREDIT',
      title: `${a.name} acquires ${t.name}`,
      description: `${m.acquirerTicker} takes ${m.targetTicker} (${t.sector}, ${t.region}; ${M(t.annualRevenue)} of revenue, ${N(t.employeeCount)} people) into a group with ${M(a.annualRevenue)} of revenue and ${M(ladderTotalLocal(ctx.v2, a.id))} of debt.`,
      refs: [company(a), company(t), region(a.region)],
      materialityLocal: marketCapOf(t) > 0 ? marketCapOf(t) : t.annualRevenue,
      impactRegion: a.region, impactSector: a.sector, affectedTicker: m.acquirerTicker,
    });
  });

  // ---- 4. Births: a firm carved from its pool. ----
  ctx.updatedCompanies.filter((c) => c.bornWeek === week && !c.parentTicker).forEach((c) => {
    push({
      id: `birth-${c.ticker}-${week}`,
      kind: 'entry',
      category: 'MACRO',
      title: `${c.name} enters ${c.region}`,
      description: `A new ${c.sector.toLowerCase()} firm, ${c.ticker}, is carved from the ${c.smePoolIndustry ?? c.sector} pool with ${M(c.annualRevenue)} of revenue and ${N(c.employeeCount)} people — entry goes where unserved demand times the pool's margin is highest.`,
      refs: [company(c), region(c.region)],
      materialityLocal: c.annualRevenue,
      impactRegion: c.region, impactSector: c.sector, affectedTicker: c.ticker,
    });
  });
  ctx.updatedCompanies.filter((c) => c.bornWeek === week && c.parentTicker).forEach((c) => {
    const parent = byTicker.get(c.parentTicker!);
    push({
      id: `fdi-${c.ticker}-${week}`,
      kind: 'investment abroad',
      category: 'MACRO',
      title: `${parent?.name ?? c.parentTicker} builds in ${c.region}`,
      description: `${c.parentTicker} opens ${c.ticker} in ${c.region}: ${M(c.annualRevenue)} of revenue, ${N(c.employeeCount)} people, funded from the parent's cash above its buffer.`,
      refs: [company(c), ...(parent ? [company(parent)] : []), region(c.region)],
      materialityLocal: c.annualRevenue,
      impactRegion: c.region, impactSector: c.sector, affectedTicker: c.parentTicker,
    });
  });

  // ---- 5. Plant taken offline: the first week the mothball clock runs (the company objects
  // are mutated in place, so the engine's own streak is the delta). ----
  ctx.updatedCompanies.forEach((c) => {
    if (!isActiveCompany(c) || c.isBankEntity) return;
    const share = c.mothballedPpeShare ?? 0;
    if ((c.mothballedStreakWeeks ?? 0) !== 1 || share < 0.01) return;
    push({
      id: `plant-${c.ticker}-${week}`,
      kind: 'plant offline',
      category: 'MACRO',
      title: `${c.name} starts mothballing its plant`,
      description: `${c.ticker} has run part of its plant idle for its management's horizon — it makes what it expects to sell — and begins taking it offline (${P(share, 1)} this week, no upkeep, no staff). Revenue ${M(c.annualRevenue)}, expected earnings ${M(c.expectedEbitdaLocal ?? c.ebitda)}, ${N(c.employeeCount)} people.`,
      refs: [company(c), region(c.region)],
      materialityLocal: (c.grossPPELocal ?? 0) * share,
      impactRegion: c.region, impactSector: c.sector, affectedTicker: c.ticker,
    });
  });

  // ---- 6. A bank at the window. ----
  ctx.updatedCompanies.filter((c) => c.isBankEntity && isActiveCompany(c)).forEach((b) => {
    const sheet = ctx.companyUpdates[b.ticker]?.bankBalanceSheet ?? b.bankBalanceSheet;
    if (!sheet) return;
    const now = sheet.srfBorrowingLocal ?? 0;
    const toldLastWeek = state.newsFeed.some((n) => n.id === `window-${b.ticker}-${week - 1}`);
    if (now > 1e6 && !toldLastWeek) {
      push({
        id: `window-${b.ticker}-${week}`,
        kind: 'central bank window',
        category: 'CENTRAL_BANK',
        title: `${b.name} borrows at the central bank`,
        description: `${b.ticker} draws ${M(now)} at the standing facility: reserves ${M(bankReservesOf(ctx.v2, b.ticker))} against ${M(householdDepositsAt(ctx.v2, b.ticker, currencyOf(b.region)))} of household deposits, capital ratio ${P(sheet.bankCapitalRatio)}, central bank loan ${M(sheet.centralBankLoanLocal ?? 0)}.`,
        refs: [company(b), region(b.region)],
        materialityLocal: now,
        impactRegion: b.region, impactSector: b.sector, affectedTicker: b.ticker,
        urgent: true,
      });
    }
  });

  // ---- 7. Estates closed: what the creditors got. ----
  (ctx.estates ?? []).filter((e) => e.closedWeek === week).forEach((e) => {
    const c = byTicker.get(e.ticker) ?? prevByTicker.get(e.ticker);
    const owed = e.claims.reduce((a, cl) => a + (cl.principalLocal ?? 0), 0);
    push({
      id: `estate-${e.ticker}-${week}`,
      kind: 'estate closed',
      category: 'CREDIT',
      title: `${c?.name ?? e.ticker}'s estate closes`,
      description: `The workout of ${e.ticker} (opened ${week - e.openedWeek} weeks ago) distributed ${M(e.distributedLocal)} against ${M(owed)} of claims — ${owed > 0 ? P(e.distributedLocal / owed, 0) : '—'} recovered by ${e.claims.length} claimants.`,
      refs: [...(c ? [company(c)] : []), region(e.regionId)],
      materialityLocal: owed,
      impactRegion: e.regionId, affectedTicker: e.ticker,
    });
  });

  // ---- 8. Each region's labour market, when it moved, citing the firms that moved it. ----
  REGION_IDS.forEach((rid) => {
    const before = state.regions[rid];
    const after = ctx.updatedRegions[rid];
    if (!before || !after) return;
    const du = after.unemploymentRate - before.unemploymentRate;
    if (Math.abs(du) < 0.005) return;
    const movers = ctx.updatedCompanies
      .filter((c) => c.region === rid && !c.isBankEntity)
      .map((c) => ({ c, d: c.employeeCount - (c.previousEmployeeCount ?? c.employeeCount) }))
      .filter((x) => (du > 0 ? x.d < 0 : x.d > 0))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 3);
    const dead = ctx.defaultedTickers.map((t) => byTicker.get(t)).filter((c): c is Company => !!c && c.region === rid);
    const deadHeads = dead.reduce((a, c) => a + c.employeeCount, 0);
    push({
      id: `labour-${rid}-${week}`,
      kind: du > 0 ? 'unemployment rises' : 'unemployment falls',
      category: 'MACRO',
      title: `${rid} unemployment ${du > 0 ? 'rises' : 'falls'} to ${P(after.unemploymentRate)}`,
      description: `${P(before.unemploymentRate)} → ${P(after.unemploymentRate)} in a week. `
        + (movers.length ? `${du > 0 ? 'Largest cuts' : 'Largest hirers'}: ${movers.map((x) => `${x.c.ticker} ${x.d > 0 ? '+' : ''}${N(x.d)}`).join(', ')}. ` : '')
        + (dead.length ? `${dead.length} firm${dead.length > 1 ? 's' : ''} defaulted (${N(deadHeads)} people): ${dead.map((c) => c.ticker).join(', ')}. ` : '')
        + `Inflation ${P(after.inflation)}, policy rate ${P(after.policyRate, 2)}, tightness ${(after.laborMarketTightness ?? 0).toFixed(2)}.`,
      refs: [region(rid), ...movers.map((x) => company(x.c)), ...dead.map(company)],
      materialityLocal: Math.abs(du) * (after.derivedNominalGdpLocal ?? after.estimatedNominalGdpLocal ?? 0),
      impactRegion: rid,
      urgent: Math.abs(du) >= 0.02,
    });
  });

  // ---- 9. A region's price level, when it moved by more than a percent in the week. ----
  REGION_IDS.forEach((rid) => {
    const before = state.regions[rid];
    const after = ctx.updatedRegions[rid];
    if (!before || !after || !(before.consumerPriceIndex > 0)) return;
    const dp = after.consumerPriceIndex / before.consumerPriceIndex - 1;
    if (Math.abs(dp) < 0.01) return;
    // The category objects are mutated in place; the print's own history ring is the delta.
    const cats = Object.entries(after.categoryDemand)
      .map(([k, v]) => { const ph = v?.priceHistory ?? []; return { k, s: Number(v?.totalUnitsSuppliedThisWeek) || 0, d: Number(v?.totalUnitsDemandedThisWeek) || 0, p: Number(ph[ph.length - 1]) || 0, p0: Number(ph[ph.length - 2]) || 0 }; })
      .filter((x) => x.d > 0 && x.p0 > 0)
      .map((x) => ({ ...x, move: x.p / x.p0 - 1, fill: x.s / x.d }))
      .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
      .slice(0, 3);
    push({
      id: `prices-${rid}-${week}`,
      kind: dp > 0 ? 'prices rise' : 'prices fall',
      category: 'MACRO',
      title: `${rid} prices ${dp > 0 ? 'up' : 'down'} ${P(Math.abs(dp))} in a week`,
      description: `The ${rid} price level moved ${P(dp)} (${after.inflationIsMeasured
        ? `annualised inflation ${P(after.inflation)}`
        : `index at ${after.consumerPriceIndex.toFixed(1)}; no year of history yet`}). `
        + (cats.length ? `Biggest moves: ${cats.map((x) => `${x.k.replace(/_/g, ' ')} ${x.move > 0 ? '+' : ''}${P(x.move, 0)} (${P(x.fill, 0)} of demand served)`).join('; ')}.` : ''),
      refs: [region(rid)],
      materialityLocal: Math.abs(dp) * (after.derivedNominalGdpLocal ?? after.estimatedNominalGdpLocal ?? 0),
      impactRegion: rid,
      urgent: Math.abs(dp) >= 0.05,
    });
  });

  ctx.newsItems.push(...out);
}
