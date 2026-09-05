/**
 * §5-MGMT — MANAGEMENT TURNOVER ON MEASURED FAILURE, and the one owner of every brain's birth.
 *
 * A management is a pair of preference primitives (domain/preferences.ts). It is drawn once when
 * the entity enters the world — here, for every path at once (the seed, a birth, a carve-out,
 * a fund spawned mid-run), so no constructor has to remember — and it is REPLACED only when its
 * own measured record fails: four consecutive quarterly reviews (§7.138's year) in which the
 * earnings it expects run below both its own baseline margin and its peers' median. The
 * replacement decides differently because it is a different draw, and the firm's path changes
 * from there. No stated turnover rate, no style table: the test is the firm's own books against
 * the firms beside it.
 */

import { GameState, Company } from '../../../types';
import { InstitutionalEntity } from '../../../domain/institutions';
import { drawPreferences } from '../../../domain/preferences';
import { isActiveCompany } from '../../../domain/company';
import { WeeklyStepContext } from './context';

/** The structural quarter every review runs on. */
const MANAGEMENT_REVIEW_WEEKS = 13;
/** Four failed reviews — the §7.138 measured year — and the board replaces the management. */
const MANAGEMENT_FAILED_QUARTERS_TO_REPLACE = 4;

/** Every deciding entity without a management gets one, from its own stream, salted by the
 *  week it entered. Runs at the seed and at the top of every week (the catch-up convention
 *  core.ts already uses for ladders and books), so every creation path is covered once. */
export function ensureManagements(companies: Company[], entities: InstitutionalEntity[], week: number): number {
  let drawn = 0;
  for (const c of companies) {
    if (c.management) continue;
    c.management = drawPreferences(c.id, week);
    drawn++;
  }
  for (const e of entities) {
    if (e.management) continue;
    e.management = drawPreferences(e.id, week);
    drawn++;
  }
  return drawn;
}

/** The margin a management is judged on: what it EXPECTS to earn (its own adaptive expectation,
 *  the labour stage's) over what it sells. NaN when there is nothing to judge. */
function judgedMarginOf(c: Company): number {
  if (!(c.annualRevenue > 0)) return NaN;
  const earnings = Number.isFinite(c.expectedEbitdaLocal as number) ? (c.expectedEbitdaLocal as number) : c.ebitda;
  return earnings / c.annualRevenue;
}

export function runManagementReviewStage(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  if (week % MANAGEMENT_REVIEW_WEEKS !== 0) return;

  const firms = ctx.updatedCompanies.filter((c) =>
    isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity && c.annualRevenue > 0);

  // Peers: the active firms of the same region and sector, this quarter. The median is the
  // definitional midpoint — no coefficient.
  const peerMargins = new Map<string, number[]>();
  firms.forEach((c) => {
    const m = judgedMarginOf(c);
    if (!Number.isFinite(m)) return;
    const key = `${c.region}:${c.sector}`;
    let arr = peerMargins.get(key);
    if (!arr) { arr = []; peerMargins.set(key, arr); }
    arr.push(m);
  });
  const peerMedian = new Map<string, number>();
  peerMargins.forEach((arr, key) => {
    arr.sort((a, b) => a - b);
    peerMedian.set(key, arr[Math.floor(arr.length / 2)]);
  });

  let reviewed = 0;
  let failing = 0;
  let replaced = 0;
  firms.forEach((c) => {
    const m = judgedMarginOf(c);
    const median = peerMedian.get(`${c.region}:${c.sector}`);
    if (!Number.isFinite(m) || median === undefined) return;
    reviewed++;
    const ownBaseline: number = Number.isFinite(c.baselineEbitdaMargin as number) ? (c.baselineEbitdaMargin as number) : m;
    const failed = m < median && m < ownBaseline;
    const streak = failed ? (c.managementFailedQuarters ?? 0) + 1 : 0;
    if (failed) failing++;
    if (streak < MANAGEMENT_FAILED_QUARTERS_TO_REPLACE) {
      c.managementFailedQuarters = streak;
      return;
    }
    const outgoing = c.management;
    c.management = drawPreferences(c.id, week);
    c.managementFailedQuarters = 0;
    replaced++;
    if (c.lastManagementCommentary !== undefined) {
      c.lastManagementCommentary = 'The board has appointed a new management team after a sustained period of underperformance against peers.';
    }
    ctx.newsItems.push({
      id: `mgmt-${c.ticker}-${week}`,
      week,
      title: `${c.name} replaces its management`,
      description: `${c.ticker} has earned below both its own baseline margin (${(100 * ownBaseline).toFixed(1)}%) and its ${c.region} ${c.sector} peers' median (${(100 * median).toFixed(1)}%) for a year; expected margin ${(100 * m).toFixed(1)}%. The board appointed a new team`
        + (outgoing ? ` (horizon ${outgoing.patienceWeeks.toFixed(0)} → ${c.management.patienceWeeks.toFixed(0)} weeks, risk weight ${outgoing.riskAversion.toFixed(2)} → ${c.management.riskAversion.toFixed(2)}).` : '.'),
      category: 'EARNINGS',
      impactBadge: '[MANAGEMENT CHANGE]',
      impactRegion: c.region,
      impactSector: c.sector,
      affectedTicker: c.ticker,
      urgent: false,
    });
  });

  if (process.env.MGMT_TRACE === '1') {
    console.log(`  [mgmt] w${week} reviewed ${reviewed} failing ${failing} replaced ${replaced}`);
  }
}
