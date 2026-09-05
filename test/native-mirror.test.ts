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

// §3.13-INV-v-c-ii-a — AND THE ARITHMETIC, NOT ONLY THE ARITY.
//
// The arity check above catches a lane added or removed on one side. It cannot see the other half
// of "change both or neither": the two cores compute the SAME ARITHMETIC — the payroll, the
// coupon accrual, the input draw, the EBITDA margin, the whole income statement — in two
// languages, and `stage08-front.ts` calls the C in preference to the JS whenever the addon is
// built. A number changed in one and not the other is a silent fork in the world, and the header
// comment claiming the port is "oracle-verified bit-equal" records a check somebody ran ONCE.
//
// This runs both over one synthetic firm and compares every lane BIT FOR BIT — not to a relative
// tolerance, because §7.370 measured what a tolerance would let through: three firms differing at
// the eighth digit at week 1 were a 13% price gap by week 13. An ULP seed is a divergent
// trajectory, not a bounded relabel, so the only honest comparison here is equality.
//
// It needs the addon, so where none is built it says so and passes — the arity check still stands
// there, and a machine that runs the C is a machine that verifies it.
import { allocCoreOut, runFrontCore, FRONT_CORE_TABLES, type FrontSeam, type FrontCoreOut } from '../src/engine2/front-core';
import { allocScratch, type FrontPass } from '../src/engine2/stage08-front';
import { nativeFrontCore } from '../src/engine/simulation/stages/native-kernels';
import { NSUB } from '../src/engine2/state';
import { SUBSCRIPTION_WEEKLY_CHURN } from '../src/domain/industry-registry';
import { RECEIPTS_MEASUREMENT_WEIGHT } from '../src/domain/company';

/** One firm, one product line, one output row, one debt rung — enough for every branch to run. */
function syntheticSeam(): FrontSeam {
  const f = (...v: number[]) => Float64Array.from(v);
  const i = (...v: number[]) => Int32Array.from(v);
  const u8 = (...v: number[]) => Uint8Array.from(v);
  return {
    n: 1, nextWeek: 40, regionIds: ['USA'],
    regionIdx: i(0), isActive: u8(1), isProfile: u8(0), rngSeed: Uint32Array.from([12345]), lotRow: i(0),
    employeeCount: f(500), offeredWageIndex: f(1.02), baselineEmployeeCount: f(480), totalDebt: f(4e8),
    annualRevenue: f(2e9), baselineAnnualRevenueResolved: f(1.9e9), ebitda: f(3e8), cash: f(1.5e8),
    currentLiabilities: f(2e8), marketCap: f(2.4e9), sharesOutstanding: f(1e8), growthCapexResolved: f(5e7),
    maintenanceShortfallStreak: f(0), executionQuality0: f(1), inputConstraint0: f(1), fulfillEMA0: f(1),
    recurringBase0: f(0), baselineGrowthRatioResolved: f(0.03), baselineEbitdaMarginResolved: f(0.16),
    depreciationAnnualLocal: f(8e7), openingNetPpeLocal: f(9e8), taxBasisOpenLocal: f(9e8), carryforwardLocal: f(0),
    usefulLifeYears: f(10), baselineInputRateSum: f(0.35), perWorkerAnnualLocal: f(4e6), perWorkerBaselineAnnualLocal: f(4e6),
    mktUnitPrice: Float64Array.from({ length: NSUB }, () => 10), mktCrowding: Float64Array.from({ length: NSUB }, () => 1),
    mktExists: Uint8Array.from({ length: NSUB }, () => 1), suppliedMask: Uint8Array.from({ length: NSUB }, () => 1),
    policyRate: f(0.04), effectiveTaxRate: f(0.25),
    trStart: i(0, 1), trPrincipal: f(4e8), trAnnualRate: f(0.05), trIsFloating: u8(0), trIsFacility: u8(0),
    trIsCP: u8(0), trMatWeek: i(300), trPeriodWeeks: i(26), trAnchorWeek: i(0),
    plStart: i(0, 1), plSub: i(0), plShare: f(1), plComp: f(0.5), plMktShare: f(0.2),
    outStart: i(0, 1), outSub: i(0), outUnits: f(1000), outValue: f(2500),
    ucStart: i(0, 0), ucValue: f(), ucServiceWeek: i(), ucKind: i(),
    shStart: i(0, 0), shSupplierRevenue: f(), shInvLocal: f(), shStrength: f(),
    updSalesLocal: f(0), updHasTargetProd: u8(0), updTargetProdLocal: f(0),
  };
}

interface LotState {
  lots: { units: Float64Array; priceLocal: Float64Array; acquiredWeek: Int32Array; next: Int32Array; head: Int32Array; tail: Int32Array };
  free: { next: Int32Array; freeHead: number };
}
/** A fresh, empty lot book and free list — one per run, so neither core sees the other's draw. */
const emptyLots = (): LotState => ({
  lots: {
    units: new Float64Array(8), priceLocal: new Float64Array(8), acquiredWeek: new Int32Array(8),
    next: new Int32Array(8).fill(-1), head: new Int32Array(NSUB).fill(-1), tail: new Int32Array(NSUB).fill(-1),
  },
  free: { next: new Int32Array(8).fill(-1), freeHead: -1 },
});

type Lane = Float64Array | Int32Array | Uint8Array | Uint32Array;
const viewsOf = (o: object): [string, Lane][] =>
  Object.entries(o).filter(([, v]) => ArrayBuffer.isView(v)) as [string, Lane][];
/** Every numeric lane the pass can write, in one stable order: the core's outputs, the scratch's
 *  lanes, and the lot book the draw consumed from — the port claims bit-equality over all three. */
const lanesOf = (O: FrontCoreOut, F: FrontPass, L: LotState): [string, Lane][] =>
  [...viewsOf(O), ...viewsOf(F), ...viewsOf(L.lots), ['free.next', L.free.next] as [string, Lane]];

test('the native front core and the JS front core compute the same week, lane for lane', () => {
  const S = syntheticSeam();
  const O = allocCoreOut(S);
  const F = allocScratch(S.n);
  const consts = { nsub: NSUB, churn: SUBSCRIPTION_WEEKLY_CHURN, weight: RECEIPTS_MEASUREMENT_WEIGHT };

  // The allocators' own opening state — `allocCoreOut` fills `industrialLineAt` and `badLineAt`
  // with -1, "this firm has no such line". Both cores are handed that and both leave it alone
  // when no line qualifies, so the second run must be RESTORED to it rather than zeroed: a
  // blanket zero would report the sentinel itself as a fork between the two.
  const opening = new Map<string, number[]>();
  for (const [name, lane] of [...viewsOf(O), ...viewsOf(F)]) opening.set(name, Array.from(lane));

  // The C first, because it is the one the engine prefers when it is there.
  const cLots = emptyLots();
  const ran = nativeFrontCore(S, O, F, cLots.lots, cLots.free, FRONT_CORE_TABLES, consts);
  if (!ran) {
    // No addon on this machine: the arity check above is what holds the two in step here.
    assert.ok(true, 'native kernels are not built — nothing to compare');
    return;
  }
  const cLanes = lanesOf(O, F, cLots).map(([name, lane]) => [name, Array.from(lane)] as [string, number[]]);

  for (const [name, lane] of [...viewsOf(O), ...viewsOf(F)]) lane.set(opening.get(name)!);
  const jLots = emptyLots();
  runFrontCore(S, O, F, jLots.lots, jLots.free, undefined, 0, S.n);
  const jLanes = lanesOf(O, F, jLots);

  assert.equal(jLanes.length, cLanes.length);
  for (let l = 0; l < jLanes.length; l++) {
    const [name, lane] = jLanes[l];
    const [cName, theirs] = cLanes[l];
    assert.equal(name, cName);
    for (let k = 0; k < lane.length; k++) {
      const mine = lane[k];
      const equal = mine === theirs[k] || (Number.isNaN(mine) && Number.isNaN(theirs[k]));
      assert.ok(equal, `lane '${name}'[${k}]: the JS core says ${mine}, the C says ${theirs[k]} — the two have forked`);
    }
  }
});
