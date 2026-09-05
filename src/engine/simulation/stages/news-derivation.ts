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
import { marketCapAt } from '../../../engine2/instruments';
import type { EntityId } from '../../../domain/ids';
import { companyParty } from '../../../domain/party';
import { buildEntityIndex } from '../../ledger/entity-index';
import { NewsItem } from '../../../domain/events';
import { WeeklyStepContext } from './context';
import { issuerSpreadAtOnCurve } from '../../credit-price';
import { STANDARD_CORP_TENOR_YEARS } from '../../../domain/primary-market';
import { partyId, partyOf, partyFromKey, PartyRef } from '../../ledger/party';
import { overdraftRunIsTold } from '../../../domain/banking';
import { reasonText } from './settlement';
import { isActiveCompany, banksOf } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { ladderTotalLocal } from '../../../engine2/tranches';
import { cashOf, bankReservesOf, householdDepositsAt, treasuryAccountOf, waysAndMeansOf } from '../../ledger/accounts';
import { auctionSummaryOf } from '../../../domain/government';
import { instrumentNameOf } from '../../instrument-name';
import { yearOfWeek } from '../../../domain/calendar';
import { estateAssetsLocal, estateWeekPaidLocal, outstandingLocal } from '../../../domain/estate';

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
    case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES': return p.id;
    case 'INSTITUTION': return p.id;
    case 'SEGMENT': return `the ${p.region} ${p.industry} pool`;
    case 'HOUSEHOLD': return `${p.region} households`;
    case 'GOVERNMENT': return `the ${p.region} treasury`;
    case 'CENTRAL_BANK': return `the ${p.region} central bank`;
    case 'CCP': return `the ${p.region} clearing house`;
    default: return p.kind.toLowerCase().replace(/_/g, ' ');
  }
}
function partyRef(p: PartyRef, byId: ReadonlyMap<EntityId, Company>): Ref | undefined {
  if (p.kind === 'COMPANY' || p.kind === 'BANK' || p.kind === 'BANK_CREDIT' || p.kind === 'BANK_SECURITIES') {
    const c = byId.get(p.id);
    return c ? { type: 'company', id: c.id } : undefined;
  }
  if (p.kind === 'INSTITUTION') return { type: 'institution', id: p.id };
  if ('region' in p) return { type: 'region', id: p.region };
  return undefined;
}

/** The week's largest outflows of one payer, by reason, off the journal — the WHY a death cites. */
function outflowsOf(ctx: WeeklyStepContext, party: PartyRef, byId: ReadonlyMap<EntityId, Company>, top = 3): { text: string; refs: Ref[] } {
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
    const ref = partyRef(p, byId);
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
  // §3.13-BOOK (c-then-2): TWO indexes here on purpose — this stage's whole job is to compare
  // what a firm is now against what it was, so the week-start array is a second population and
  // not a stale mirror of the first.
  const { companyByTicker: byTicker, companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const { companyByTicker: prevByTicker } = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
  const bankRef = (c: Company): Ref | undefined => {
    const b = c.homeBankId ? companyById.get(c.homeBankId) : undefined;
    return b ? company(b) : undefined;
  };
  const push = (item: Omit<NewsItem, 'week' | 'urgent' | 'impactBadge'> & { urgent?: boolean }) => {
    out.push({ week, urgent: item.urgent ?? false, impactBadge: `[${(item.kind ?? 'story').toUpperCase()}]`, ...item });
  };

  // ---- 1. Deaths: a firm's default, with its books and the ledger's why. ----
  ctx.defaultedTickers.forEach((ticker) => {
    const c = byTicker.get(ticker);
    if (!c || c.isBankEntity) return;
    const why = outflowsOf(ctx, companyParty(c), companyById);
    const refs: Ref[] = [company(c), region(c.region)];
    const bank = bankRef(c);
    if (bank) refs.push(bank);
    push({
      id: `default-${ticker}-${week}`,
      kind: 'default',
      category: 'CREDIT',
      title: `${c.name} defaults`,
      description: `${ticker} (${c.sector}, ${c.region}) ran out of cash: ${M(cashOf(ctx.v2, c))} on hand against coverage of ${c.interestCoverage.toFixed(2)}×, ${M(c.annualRevenue)} of revenue and ${M(ladderTotalLocal(ctx.v2, c.id))} of debt; ${N(c.employeeCount)} people worked there${c.homeBankId ? `, banked at ${c.homeBankId}` : ''}.`,
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
      materialityLocal: marketCapAt(ctx.v2, t) > 0 ? marketCapAt(ctx.v2, t) : t.annualRevenue,
      impactRegion: a.region, impactSector: a.sector, affectedTicker: m.acquirerTicker,
    });
  });

  // ---- 4. Births: a firm carved from its pool. ----
  ctx.updatedCompanies.filter((c) => c.bornWeek === week && !c.parentId).forEach((c) => {
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
  ctx.updatedCompanies.filter((c) => c.bornWeek === week && c.parentId).forEach((c) => {
    const parent = companyById.get(c.parentId!);
    push({
      id: `fdi-${c.ticker}-${week}`,
      kind: 'investment abroad',
      category: 'MACRO',
      title: `${parent?.name ?? c.parentId} builds in ${c.region}`,
      description: `${c.parentId} opens ${c.ticker} in ${c.region}: ${M(c.annualRevenue)} of revenue, ${N(c.employeeCount)} people, funded from the parent's cash above its buffer.`,
      refs: [company(c), ...(parent ? [company(parent)] : []), region(c.region)],
      materialityLocal: c.annualRevenue,
      impactRegion: c.region, impactSector: c.sector, affectedTicker: parent?.ticker,
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
  banksOf(ctx.updatedCompanies).forEach((b) => {
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
        description: `${b.ticker} draws ${M(now)} at the standing facility: reserves ${M(bankReservesOf(ctx.v2, b.id))} against ${M(householdDepositsAt(ctx.v2, b.ticker, currencyOf(b.region)))} of household deposits, capital ratio ${P(sheet.bankCapitalRatio)}, central bank loan ${M(sheet.centralBankLoanLocal ?? 0)}.`,
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

  // ---- 7b. §3.15b-i: a workout that DEVELOPS — each week an open estate pays a class or sells a
  // slice, the story names what was paid to whom, what was sold to which peers, and what is
  // still owed against what is left. The default (1) and the close (7) are its two ends. ----
  (ctx.estates ?? []).filter((e) => e.closedWeek === undefined && e.lastWeek?.week === week).forEach((e) => {
    const w = e.lastWeek!;
    const paid = estateWeekPaidLocal(w);
    const sold = w.inventorySoldLocal + w.ppeSoldLocal;
    if (paid < 1e5 && sold < 1e5) return;
    const c = byTicker.get(e.ticker) ?? prevByTicker.get(e.ticker);
    const buyers = [...new Set(w.buyerIds)].map((id) => companyById.get(id)).filter((b): b is Company => !!b);
    const owed = outstandingLocal(e.claims);
    const left = estateAssetsLocal(e.assets);
    const classes = [['secured lenders', w.paidByClassLocal[0]], ['unsecured creditors', w.paidByClassLocal[1]], ['equity', w.paidByClassLocal[2]]] as const;
    const paidText = classes.filter(([, usd]) => usd >= 1e5).map(([who, usd]) => `${M(usd)} to ${who}`).join(', ');
    const soldText = sold >= 1e5
      ? `${w.inventorySoldLocal >= 1e5 ? `${M(w.inventorySoldLocal)} of stock` : ''}${w.inventorySoldLocal >= 1e5 && w.ppeSoldLocal >= 1e5 ? ' and ' : ''}${w.ppeSoldLocal >= 1e5 ? `${M(w.ppeSoldLocal)} of plant` : ''}`
        + (buyers.length ? ` went to ${buyers.map((b) => b.ticker).join(', ')}` : ' found no buyer and was scrapped')
      : '';
    push({
      id: `estate-week-${e.ticker}-${week}`,
      kind: paid >= 1e5 ? 'estate pays' : 'estate sells',
      category: 'CREDIT',
      title: paid >= 1e5 ? `${c?.name ?? e.ticker}'s estate pays ${M(paid)}` : `${c?.name ?? e.ticker}'s estate sells ${M(sold)} of assets`,
      description: `Week ${week - e.openedWeek} of the workout of ${e.ticker}. `
        + (paidText ? `Paid ${paidText}. ` : '')
        + (soldText ? `${soldText.charAt(0).toUpperCase()}${soldText.slice(1)}. ` : '')
        + `Still owed ${M(owed)} against ${M(left)} of assets left (cash ${M(e.assets.cashLocal)}, receivables ${M(e.assets.receivablesLocal)}, stock ${M(e.assets.inventoryLocal)}, plant ${M(e.assets.ppeLocal)}); ${M(e.distributedLocal)} distributed so far.`,
      refs: [...(c ? [company(c)] : []), region(e.regionId), ...buyers.map(company)],
      materialityLocal: paid + sold,
      impactRegion: e.regionId, affectedTicker: e.ticker,
    });
  });

  // ---- 7c. §3.15b-ii: an auction that came in under-subscribed. The treasury offered every
  // dollar of its rungs no book held; what the primary did not take was withdrawn from the
  // ladder and the need rolled forward. The story names the rungs that came up short and what
  // the treasury's account did about it. ----
  REGION_IDS.forEach((rid) => {
    const reg = ctx.updatedRegions[rid];
    const auction = reg?.lastAuction;
    if (!reg || !auction || auction.week !== week) return;
    const a = auctionSummaryOf(auction.offerings);
    if (a.withdrawnLocal < 1e6 || a.coverage === undefined) return;
    const nameOf = (id: string) => instrumentNameOf(ctx.v2, id, () => undefined, yearOfWeek) ?? id;
    const short = a.shortfalls.slice(0, 4).map((o) => `${nameOf(o.bondId)} ${M(o.withdrawnLocal)} of ${M(o.offeredLocal)}`).join(', ');
    const advance = waysAndMeansOf(ctx.v2, rid);
    push({
      id: `auction-${rid}-${week}`,
      kind: a.placedLocal < 1 ? 'auction fails' : 'auction under-subscribed',
      category: 'MACRO',
      title: a.placedLocal < 1
        ? `${rid} auction finds no buyer for ${M(a.offeredLocal)}`
        : `${rid} auction placed ${P(a.coverage, 0)} of ${M(a.offeredLocal)}`,
      description: `The ${rid} treasury offered ${M(a.offeredLocal)} across ${auction.offerings.length} rung${auction.offerings.length === 1 ? '' : 's'}; the market took ${M(a.placedLocal)} and ${M(a.withdrawnLocal)} was withdrawn to be offered again. Short: ${short}. `
        + `The treasury's account stands at ${M(treasuryAccountOf(ctx.v2, rid))}${advance > 0 ? `, ${M(advance)} of it drawn from the central bank` : ''}.`,
      cause: 'The bids the auction found stopped short of the offering at any price the books would pay.',
      refs: [region(rid)],
      materialityLocal: a.withdrawnLocal,
      impactRegion: rid,
      urgent: a.withdrawnLocal > 0.25 * a.offeredLocal,
    });
  });

  // ---- 7d. §3.15b-iii: a party living on its bank. The close swept it into its bank's credit
  // for the Nth week running — a firm's overdraft converted to a facility draw, a fund's to a
  // prime-brokerage draw, a pool's to an SME facility draw. The RUN is the story: told the week
  // it becomes one (three closes) and each time it doubles, never every week. ----
  Object.entries(ctx.overdraftStreaks).forEach(([key, run]) => {
    if (run.lastWeek !== week || !overdraftRunIsTold(run.weeks)) return;
    const party = partyFromKey(key);
    if (!party) return;
    const c = party.kind === 'COMPANY' ? companyById.get(party.id) : undefined;
    const fund = party.kind === 'INSTITUTION' ? ctx.updatedInstitutionalEntities.find((e) => e.id === party.id) : undefined;
    const who = c ? c.name : fund ? fund.name : partyLabel(party);
    const lender = c?.homeBankId ? companyById.get(c.homeBankId) : fund?.homeBankId ? companyById.get(fund.homeBankId) : undefined;
    const how = party.kind === 'COMPANY' ? 'a facility draw at its house bank'
      : party.kind === 'INSTITUTION' ? 'a draw on its prime broker'
        : 'an SME facility draw at the region\'s banks';
    const rid = 'region' in party ? party.region : (c?.region ?? fund?.region);
    const refs: Ref[] = [];
    const pr = partyRef(party, companyById);
    if (pr) refs.push(pr);
    if (rid) refs.push(region(rid));
    if (lender) refs.push(company(lender));
    push({
      id: `overdraft-run-${key}-${week}`,
      kind: 'living on its bank',
      category: 'CREDIT',
      title: `${who} closes a ${run.weeks === 3 ? 'third' : `${run.weeks}th`} week in overdraft`,
      description: `${who} has ended ${run.weeks} weeks running with its account below zero at the close, each time converted to ${how}: ${M(run.drawnLocal)} this week, ${M(run.drawnRunLocal)} over the run`
        + (c ? `. Cash ${M(cashOf(ctx.v2, c))} against ${M(c.annualRevenue)} of revenue; coverage ${c.interestCoverage.toFixed(2)}×, rated ${c.creditRating}.` : '.'),
      cause: `Its payments at the close exceeded what its account held, ${run.weeks} weeks in a row.`,
      refs,
      materialityLocal: run.drawnRunLocal,
      impactRegion: rid, affectedTicker: c?.ticker ?? fund?.ticker,
      urgent: run.weeks >= 6,
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
