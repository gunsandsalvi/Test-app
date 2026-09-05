/**
 * §3.13-INV-ii-c — THE TWO CORES ARE HELD IN STEP BY A COMMENT, AND NOW BY A CHECK.
 *
 * `native/kernels.c` is a hand-written mirror of the JS front core, and the two exchange their
 * arrays through THREE POSITIONAL LISTS — the seam, the tables-and-lots, and the outputs. Nothing
 * names a lane on the way across: position 41 in the JS array is whatever the C reads 41st. The
 * only thing holding them together is a comment in `native-kernels.ts` saying *change both or
 * neither*, and no §4 gate loads `kernels.node` at all — so a lane added or removed on one side
 * would silently shift every lane after it and corrupt every firm's week, with the whole suite
 * green. That is the failure this file exists to make impossible.
 *
 * It checks the ARITY of each list on both sides, which is exactly the add-one/remove-one hazard,
 * and it checks the C's own header comment against the code beneath it so the documentation cannot
 * rot either. It does not need the addon built, so it runs everywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TS = readFileSync(new URL('../src/engine/simulation/stages/native-kernels.ts', import.meta.url), 'utf8');
const C = readFileSync(new URL('../native/kernels.c', import.meta.url), 'utf8');

/** The elements of one `const <name>: ArrayBufferView[] = [ ... ];` literal, by their member reads. */
function jsListLength(name: string): number {
  const at = TS.indexOf(`const ${name}: ArrayBufferView[] = [`);
  assert.ok(at >= 0, `native-kernels.ts has no '${name}' array — the mirror's shape changed`);
  const body = TS.slice(TS.indexOf('[', at) + 1, TS.indexOf('];', at));
  const stripped = body.replace(/\/\/[^\n]*/g, '');
  return (stripped.match(/\b(?:S|O|F|tables|lots)\.[A-Za-z_][A-Za-z0-9_]*/g) ?? []).length;
}

/**
 * How many slots the C consumes in one block. Every slot advances the cursor exactly once —
 * through a `NEXT_*` macro, or by hand where the array's LENGTH is wanted too (`Lhead`) — so
 * counting `ai++` outside the `#define` lines counts slots however they are read.
 */
function cBlockSlots(index: 0 | 1 | 2): number {
  const from = C.indexOf('static napi_value FrontCore(');
  const to = C.indexOf('static napi_value ', from + 1);
  const blocks = C.slice(from, to > 0 ? to : undefined).split(/\n\s*ai = 0;/);
  assert.ok(blocks.length > index, 'kernels.c FrontCore no longer has three cursor blocks');
  // A slot is one advance of the cursor: a `NEXT_*` macro, or a hand-written `ai++` where the
  // array's LENGTH is wanted as well as its pointer. The `#define` lines are the macros
  // themselves, not uses of them.
  return blocks[index]
    .split('\n')
    .filter((l) => !l.includes('#define'))
    .reduce((n, l) => n + (l.match(/\bNEXT_[A-Z0-9_]*\(/g) ?? []).length + (l.match(/\bai\+\+/g) ?? []).length, 0);
}

test('every lane the JS hands the native front core is a lane the C reads, in all three lists', () => {
  for (const [name, blockIndex] of [['seam', 0], ['tl', 1], ['outs', 2]] as const) {
    assert.equal(cBlockSlots(blockIndex), jsListLength(name),
      `the '${name}' list and its block in kernels.c disagree on how many arrays cross — `
      + 'a lane was added or removed on one side only, which shifts every lane after it');
  }
});

test('the C\'s own header comment counts what the C actually reads', () => {
  const header = C.slice(C.indexOf('/* frontCore('), C.indexOf('static napi_value FrontCore('));
  const stated = (label: string): number => {
    const m = new RegExp(`${label}\\s*\\((\\d+)`).exec(header);
    assert.ok(m, `kernels.c's frontCore comment no longer states a count for ${label}`);
    return Number(m[1]);
  };
  assert.equal(stated('seamArrs'), cBlockSlots(0));
  assert.equal(stated('tablesAndLots'), cBlockSlots(1));
  assert.equal(stated('outArrs'), cBlockSlots(2));
});
