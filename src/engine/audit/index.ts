/**
 * THE AUDIT (§5-CLOSE) — run every week by the harness; the table at the end is the closed-model
 * scoreboard. A family is a file; a check is a function; a finding is a week, a size and the
 * identity that failed.
 */

import { GameState } from '../../types';
import { AuditFinding, B } from './types';
import { auditMoney } from './money';
import { auditOwnership } from './ownership';
import { auditPrices } from './prices';
import { auditAccounts } from './accounts';
import { auditNames } from './names';
import { AuditSnapshot, snapshotOf } from './snapshot';
import { auditWires } from './wires';
import { statedCounts, statedRegistry, StatedKind } from '../../domain/stated';

export type { AuditFinding } from './types';

/**
 * THE WORLD BEFORE THE SEED. The first week had no "before", so every week-over-week check
 * skipped it and the opening world was the one state nothing ever proved. It has a before: the
 * EMPTY world. The LADDERS are claimed because the seed opens them by wire (`seedLadder`), and
 * the GOODS because the world genuinely starts with none — no firm is generated holding finished
 * stock and no input lot is seeded, so week 1's stock is exactly what week 1 produced plus what
 * its wires brought in, which is the identity W4 checks every other week. The register is still
 * REGISTER because the seed opens every holding by wire too (`seedBook`). All three of W3, W4 and
 * W5 therefore hold week 1 to the same standard as week 2.
 *
 * §3.37-SEED: this empty opener is now the baseline for `auditSeed` — the SEED — rather than for
 * week 1, and it is a stronger claim than before rather than a weaker one. The seed used to be
 * proved only indirectly, by week 1 being asked to account for the seed's wires and its own
 * together; a failure could be either, and the audit could not say which. Now the seed is asked
 * of itself against nothing, week 1 is asked of itself against the seed, and each answer names
 * the week it belongs to.
 */
let lastSnapshot: AuditSnapshot | undefined = { ladderUSDByKey: {}, goodsUnitsByKey: {}, registerQtyByKind: {} };

/** Run every family on this week's state. Week-over-week checks read the audit's OWN snapshot of
 *  last week (the caller's state is mutated in place, so no reference to it can be "before"). */
export function auditWeek(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const prev = lastSnapshot;
  const run = (name: string, f: () => AuditFinding[]) => { try { out.push(...f()); } catch (e) { out.push({ family: 'F', check: `${name} threw`, week, message: String(e) }); } };
  run('money', () => auditMoney(prev, state, week));
  run('ownership', () => auditOwnership(state, week));
  run('prices', () => auditPrices(state, week));
  run('accounts', () => auditAccounts(prev, state, week));
  run('names', () => auditNames(state, week));
  run('wires', () => auditWires(prev, state, week));
  lastSnapshot = snapshotOf(state);
  return out;
}

/**
 * §3.37-SEED — THE OPENING WORLD, AUDITED. `docs/systems/the-seed.md` A2.
 *
 * The audit ran only inside the week loop, so no family had ever seen the state the world STARTS
 * in. That made every week-1 finding ambiguous between a bad seed and a bad mechanism, and the
 * cost of that ambiguity is a search that cannot succeed: a violation present at week 0 is the
 * seed's, and there is no stage to find it in.
 *
 * Two things make this a different call from `auditWeek(state, 0)`, and both matter:
 *
 * · **It passes no previous week, and it does not become one.** `lastSnapshot` opens as the EMPTY
 *   world on purpose (see the comment on its declaration): week 1 is thereby held to "everything
 *   that exists was WIRED into existence", which proves the SEED's wires as well as week 1's.
 *   Overwriting it here would silently hand week 1 the seed as its baseline and retire that check
 *   — trading a real proof for a new one instead of adding one. So the seed is asked the stock
 *   questions now, and its wires are still proved at week 1, exactly as before.
 * · **It asks only what a stock can answer.** Week 0 has no elapsed week, so every "what moved"
 *   check is asking about a flow that has not happened; `wires.ts` and `accounts.ts:F2` guard on
 *   `week === 0` for that reason. What is left — ownership, prices, names, the balance identities
 *   — is exactly the set of questions the opening world is answerable for.
 */
export function auditSeed(state: GameState): AuditFinding[] {
  const out: AuditFinding[] = [];
  const run = (name: string, f: () => AuditFinding[]) => { try { out.push(...f()); } catch (e) { out.push({ family: 'F', check: `${name} threw`, week: 0, message: String(e) }); } };
  run('money', () => auditMoney(undefined, state, 0));
  run('ownership', () => auditOwnership(state, 0));
  run('prices', () => auditPrices(state, 0));
  run('accounts', () => auditAccounts(undefined, state, 0));
  run('names', () => auditNames(state, 0));
  run('wires', () => auditWires(undefined, state, 0));
  // The seed is now week 1's "before". It opens its own ladders and register BY WIRE, in its own
  // week-0 journal (`initialization.ts:openSeededBooks`), so those wires are no longer sitting
  // in week 1's journal waiting to explain a delta measured from nothing. Week 1 is therefore
  // asked the sharper question — did WEEK 1's wires explain WEEK 1's movement — and the seed's
  // own wires are asked of the seed.
  lastSnapshot = snapshotOf(state);
  return out;
}

const FAMILY_WORDS: Record<string, string> = { M: 'money', O: 'ownership', P: 'prices', X: 'cross-market', F: 'accounts', N: 'names', W: 'wires' };

/** The scoreboard: per check, the weeks it failed, the worst size, the last message. */
export function auditSummary(findings: AuditFinding[], weeks: number): string[] {
  const lines: string[] = ['=== THE AUDIT — the closed-model scoreboard ==='];
  const byCheck = new Map<string, AuditFinding[]>();
  findings.forEach((f) => { const k = `${f.family}|${f.check}`; byCheck.set(k, [...(byCheck.get(k) ?? []), f]); });
  const families = ['M', 'O', 'P', 'X', 'F', 'N'];
  families.forEach((fam) => {
    const checks = [...byCheck.entries()].filter(([k]) => k.startsWith(fam + '|')).sort((a, b) => a[0].localeCompare(b[0]));
    lines.push(`--- ${fam} · ${FAMILY_WORDS[fam]}: ${checks.length ? `${checks.length} checks failing` : 'clean'} ---`);
    checks.forEach(([k, fs]) => {
      const weeksFailed = new Set(fs.map((f) => f.week)).size;
      const worst = fs.reduce((a, f) => (Math.abs(f.usd ?? 0) > Math.abs(a.usd ?? 0) ? f : a), fs[0]);
      const last = fs[fs.length - 1];
      const size = worst.usd !== undefined ? (Math.abs(worst.usd) >= 1e6 ? `worst ${B(worst.usd)}` : `worst ${worst.usd.toFixed(2)}`) : '';
      lines.push(`  ${k.split('|')[1].padEnd(52)} ${String(weeksFailed).padStart(3)}/${weeks} weeks  ${size.padEnd(16)} last: ${last.message.slice(0, 160)}`);
    });
  });
  const money = findings.filter((f) => f.family === 'M' && f.usd !== undefined);
  const lastWeek = Math.max(0, ...findings.map((f) => f.week));
  const lastMoney = money.filter((f) => f.week === lastWeek);
  lines.push(`--- the money that is not anyone's, last week: ${B(lastMoney.reduce((a, f) => a + Math.abs(f.usd ?? 0), 0))} across ${lastMoney.length} lines ---`);
  // §5-FINALIZATION R — the registry's count (§5-DIST-P's scoreboard): may fall, never rise.
  const counts = statedCounts();
  lines.push(`--- R · stated numbers registered: ${statedRegistry().length} (${(Object.keys(counts) as StatedKind[]).filter((k) => counts[k] > 0).map((k) => `${k.toLowerCase()} ${counts[k]}`).join(', ')}) ---`);
  return lines;
}
