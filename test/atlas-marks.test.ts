/**
 * THE ATLAS'S OTHER GATE — the one `scripts/check-atlas.sh` cannot be.
 *
 * `check-atlas.sh` proves every `file:symbol` citation RESOLVES. It can say nothing about whether a
 * mark is TRUE, and §5's lesson (learned at §9.13-CREDIT row 2, §9.13-BILL and the 2026-09-04
 * review) is that a tree drifts in exactly the places a citation check cannot see: a diff heading
 * that says ⚠️ over a row that says ✅, a ❌ row no diff entry argues, a tally nobody recounts, a
 * row whose id is in no tree, a tree node with no row. This test reads every tree and checks the
 * tree against itself — the required side, the mapping, and the diff — so a re-mark that touches
 * one of the three and not the others fails the build.
 *
 * What it checks, per tree (docs/systems/*.md and docs/instruments/*.md, README excluded):
 *   1. every node id in the required tree has exactly one mapping row, and every row names a tree
 *      node — an evidence sub-row repeats an id only as `<id> · <text>`;
 *   2. every diff heading either opens with a mark, or is one of the few unmarked titles README
 *      allows, and the mark it gives a node agrees with that node's row;
 *   3. every ⚠️ or ❌ row is mentioned somewhere in the diff — a mark with no argument is the
 *      thing the atlas exists to prevent;
 *   4. a tally line, where a file carries one, matches the table it claims to count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKS = ['✅', '⚠️', '❌'] as const;
type Mark = (typeof MARKS)[number];
const NODE_ONE = /^[A-Z]\d+(?:\.[a-z])?$/;

/** Unmarked diff titles README permits (prefix match, case-insensitive). */
const UNMARKED_TITLES = [
  'a measurement, for §3 step 38',
  'present and not worth re-checking',
  'scoped out, deliberately',
  'what is solid',
  'what this tree found working',
  'the rest maps cleanly',
  'also marked, briefly',
];

interface Tree {
  file: string;
  treeIds: string[];
  rows: { id: string; evidence: boolean; cite: string; mark: string }[];
  diffHeadings: string[];
  diffText: string;
  tally?: { ok: number; warn: number; miss: number; line: string };
}

function parse(file: string): Tree {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const at = (h: string) => lines.findIndex((l) => l.startsWith(h));
  // Instrument contracts number their sections differently: the required side has no "## 1." head.
  const i2 = at('## 2.'); const i3 = at('## 3.');
  assert.ok(i2 > 0 && i3 > i2, `${file}: missing ## 2. / ## 3. sections`);
  const tree = lines.slice(0, i2); const mapping = lines.slice(i2, i3); const diff = lines.slice(i3);

  const treeIds: string[] = [];
  for (const l of tree) {
    const m = /^\s*-\s+\*\*([A-Z]\d+(?:\.[a-z])?)\*\*/.exec(l) ?? /^\s*-\s+([A-Z]\d+\.[a-z])\b/.exec(l);
    if (m) treeIds.push(m[1]);
  }
  // bond.md and derivative.md write their fourteen / twelve as **N1** … and the mapping keys on
  // `N1 · corp` / `D1` — the same ids, so nothing special is needed beyond the parse above.

  const rows: Tree['rows'] = [];
  for (const l of mapping) {
    if (!l.startsWith('|')) continue;
    const cells = l.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const node = cells[1].replace(/\*\*/g, '').trim();
    const id = (NODE_ONE.test(node.split(/\s/)[0]) ? node.split(/\s/)[0] : '');
    if (!id) continue;
    const rest = node.slice(id.length).trim();
    rows.push({ id, evidence: rest.startsWith('·'), cite: cells[2], mark: cells[3] });
  }

  const diffHeadings = diff.filter((l) => l.startsWith('### '));
  const tallyLine = lines.find((l) => /\d+\s*✅.*\d+\s*⚠️.*\d+\s*❌/.test(l) && !l.startsWith('|'));
  let tally: Tree['tally'];
  if (tallyLine) {
    const n = (mk: Mark) => Number((new RegExp(`(\\d+)\\s*${mk.replace('️', '️?')}`)).exec(tallyLine)?.[1] ?? NaN);
    tally = { ok: n('✅'), warn: n('⚠️'), miss: n('❌'), line: tallyLine };
  }
  return { file, treeIds, rows, diffHeadings, diffText: diff.join('\n'), tally };
}

/** A diff mentions a node by its id, or by a range that spans it (`C1–C6` covers C4 and C4.a). */
function mentioned(diff: string, id: string): boolean {
  if (new RegExp(`(^|[^A-Z0-9.])${id.replace('.', '\\.')}(?![0-9a-z.])`, 'm').test(diff)) return true;
  const letter = id[0]; const n = Number(/\d+/.exec(id)![0]);
  for (const m of diff.matchAll(/([A-Z])(\d+)[–-]\1(\d+)/g)) {
    if (m[1] === letter && n >= Number(m[2]) && n <= Number(m[3])) return true;
  }
  return false;
}

const root = join(process.cwd(), 'docs');
const files = [
  ...readdirSync(join(root, 'systems')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => join(root, 'systems', f)),
  ...readdirSync(join(root, 'instruments')).filter((f) => f.endsWith('.md')).map((f) => join(root, 'instruments', f)),
];

for (const file of files) {
  const short = file.slice(root.length + 1);
  const t = parse(file);

  test(`${short}: every tree node has one row and every row names a tree node`, () => {
    const ids = new Set(t.treeIds);
    const dupTree = t.treeIds.filter((id, i) => t.treeIds.indexOf(id) !== i);
    assert.deepEqual(dupTree, [], `duplicate node ids in the required tree: ${dupTree}`);
    const primary = t.rows.filter((r) => !r.evidence).map((r) => r.id);
    const dupRows = primary.filter((id, i) => primary.indexOf(id) !== i);
    assert.deepEqual(dupRows, [], `a node has two primary rows (use \`<id> · text\` for an evidence sub-row): ${dupRows}`);
    const covered = new Set(t.rows.map((r) => r.id));
    const missing = t.treeIds.filter((id) => !covered.has(id));
    assert.deepEqual(missing, [], `tree nodes with no mapping row: ${missing}`);
    const extra = t.rows.map((r) => r.id).filter((id) => !ids.has(id));
    assert.deepEqual([...new Set(extra)], [], `mapping rows naming no tree node: ${[...new Set(extra)]}`);
  });

  test(`${short}: every diff heading is marked and agrees with the mapping`, () => {
    const markOf = new Map<string, string>();
    t.rows.forEach((r) => { if (!r.evidence) markOf.set(r.id, r.mark); });
    const problems: string[] = [];
    for (const h of t.diffHeadings) {
      const title = h.slice(4).trim();
      if (UNMARKED_TITLES.some((u) => title.toLowerCase().startsWith(u))) continue;
      if (!MARKS.some((m) => title.startsWith(m))) { problems.push(`unmarked heading: ${title.slice(0, 70)}`); continue; }
      // Walk the node list before the em-dash: each id takes the most recent mark seen.
      const head = title.split(' — ')[0];
      let current: string | undefined;
      for (const tok of head.split(/\s+/)) {
        const mk = MARKS.find((m) => tok.startsWith(m));
        if (mk) { current = mk; continue; }
        const id = tok.replace(/[^A-Z0-9.]/g, '');
        if (!NODE_ONE.test(id) || !current) continue;
        const row = markOf.get(id);
        if (row !== undefined && row !== current) problems.push(`${id}: heading says ${current}, row says ${row} (${title.slice(0, 50)})`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test(`${short}: every ⚠️ or ❌ row is argued in the diff`, () => {
    const unmentioned = t.rows
      .filter((r) => !r.evidence && (r.mark === '⚠️' || r.mark === '❌'))
      .map((r) => r.id)
      .filter((id) => !mentioned(t.diffText, id));
    assert.deepEqual(unmentioned, [], `marked rows the diff never mentions: ${unmentioned}`);
  });

  if (t.tally) {
    test(`${short}: the tally counts the table`, () => {
      // A node with only evidence sub-rows (bond.md's `N1 · corp` / `N1 · sov`) counts each of them.
      const primaryIds = new Set(t.rows.filter((r) => !r.evidence).map((r) => r.id));
      const counted = t.rows.filter((r) => !r.evidence || !primaryIds.has(r.id));
      const count = (mk: string) => counted.filter((r) => r.mark === mk).length;
      const got = { ok: count('✅'), warn: count('⚠️'), miss: count('❌') };
      assert.deepEqual({ ok: t.tally!.ok, warn: t.tally!.warn, miss: t.tally!.miss }, got, `tally line: ${t.tally!.line.slice(0, 80)}`);
    });
  }
}

test('README owns the legend and the mark vocabulary', () => {
  const readme = readFileSync(join(root, 'systems', 'README.md'), 'utf8');
  assert.match(readme, /forbidden thing is there/, 'README must state what ❌ means on a FORBID node');
  assert.match(readme, /evidence sub-row/i, 'README must state the evidence sub-row convention');
});
