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
 * seeded without wires, so its key stays absent (an absent key skips its check) until it is too.
 */
let lastSnapshot: AuditSnapshot | undefined = { ladderUSDByKey: {}, goodsUnitsByKey: {} };

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
