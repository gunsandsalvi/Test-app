/**
 * Worker-thread side of the back pool's A phase (§7.325 W2).
 *
 * Runs the SAME `runBackCoreA` the serial path runs — comp: null, so the profile branch
 * (main-side by §7.318 D) is unreachable and the capital block's comp writes come back as data.
 * Emissions land in a shard-local fake context (a fresh payment journal, holder maps, a credit
 * list) with per-firm END-OFFSET marks — the §7.325 capture shape — and the main thread's
 * firm-major replay folds them exactly where the serial walk's emissions went.
 *
 * IDENTITY DISCIPLINE: the party and reason intern tables are SEEDED from the main thread in id
 * order before any firm runs, and the main thread pre-interns every party/reason core-A can
 * emit — so every id this worker writes is canonical. If the tables grow anyway (an emission
 * the enumeration missed), the worker THROWS: the pool marks itself unavailable and the week
 * falls back to the serial path, keeping correctness over speed.
 *
 * Node-only and opt-in (BACK_WORKERS=n): the browser build never touches this module.
 */
import { parentPort, workerData } from 'worker_threads';
import { runBackCoreA, BackKernelDeps, ShippedBackCoreA } from './stage08-back.ts';
import { BackLanes } from './stage08-lanes.ts';
import { FrontPass } from './stage08-front.ts';
import { partyId, partyTableSize, PartyRef } from '../engine/ledger/party.ts';
import { internReason, reasonTableSize, newPaymentJournal } from '../engine/simulation/stages/settlement.ts';
import { setActiveWireJournal, newWireJournal } from '../engine/ledger/wire.ts';
import { WeeklyStepContext } from '../engine/simulation/stages/context.ts';

void parentPort;

interface BackAJob {
  lanes: BackLanes;
  f: Partial<FrontPass>;
  regions: Record<string, { effectiveTaxRate: number; bankingSector: { bankCapitalRatio: number } }>;
  channelShareByRegion: WeeklyStepContext['channelShareByRegion'];
  nextWeek: number;
  currentWeekMod13: number;
  /** Intern-table deltas, in id order, starting exactly at this worker's current table sizes. */
  partyRefs: PartyRef[];
  partySeedFrom: number;
  reasonTexts: string[];
  reasonSeedFrom: number;
  lo: number;
  hi: number;
}

/** Per-firm end offsets are ABSOLUTE-row indexed; a row's start is `mark[row-1]` (0 at `lo`). */
export interface BackAShardOut {
  lo: number;
  hi: number;
  journalPayer: Int32Array;
  journalPayee: Int32Array;
  journalAmount: Float64Array;
  /** §3.13c — which money each leg moves, as an index into CURRENCY_CODES. */
  journalCurrency: Int8Array;
  journalReason: Int32Array;
  /** §5-WIRES N: the row's settle week. */
  journalSettle: Int32Array;
  journalMark: Int32Array;
  holderAcc: [string, number][];
  holderAccMark: Int32Array;
  holderCash: [string, number][];
  holderCashMark: Int32Array;
  holderPay: string[];
  holderPayMark: Int32Array;
  taxAccrue: Float64Array;
  crossings: (ShippedBackCoreA | null)[];
}

const { port, doorbell } = workerData as { port: import('worker_threads').MessagePort; doorbell: Int32Array };

port.on('message', (job: BackAJob) => {
  // Seed the intern tables to match the main thread id-for-id. The deltas must land exactly at
  // our current sizes — anything else means a desynced chain, which is a defect, not a fallback.
  if (partyTableSize() !== job.partySeedFrom) {
    throw new Error(`back-worker: party seed gap (have ${partyTableSize()}, delta starts ${job.partySeedFrom})`);
  }
  for (const ref of job.partyRefs) partyId(ref);
  if (reasonTableSize() !== job.reasonSeedFrom) {
    throw new Error(`back-worker: reason seed gap (have ${reasonTableSize()}, delta starts ${job.reasonSeedFrom})`);
  }
  for (const t of job.reasonTexts) internReason(t);
  const partySeeded = partyTableSize();
  const reasonSeeded = reasonTableSize();

  const n = job.lanes.n;
  const journal = newPaymentJournal();
  // §5-WIRES W1: the worker's wire journal is SCRATCH — its rows are replayed on the main thread
  // through `journalPush`, which writes the one real wire per row.
  setActiveWireJournal(newWireJournal(0, 0));
  const holderAcc = new Map<string, number>();
  const holderCash = new Map<string, number>();
  const holderPay = new Set<string>();
  const fakeCtx = {
    paymentJournal: journal,
    deferPendingNet: true,
    pendingHolderAccrualLocal: holderAcc,
    pendingHolderCashLocal: holderCash,
    pendingHolderAccrualPayout: holderPay,
    taxAccruedByRegion: {},
    channelShareByRegion: job.channelShareByRegion,
    carrierFreightRevenue: {},
    channelMarginRevenue: {},
  } as unknown as WeeklyStepContext;
  const taxCapture = {
    accrueLocal: new Float64Array(n).fill(NaN),
  };
  const F = {
    ...job.f,
    costDrivers: [], outputInv: [], updatedProductLines: [],
    stillUnderConstruction: [], newRecurringBaseLocal: [],
  } as FrontPass;
  const d = {
    ctx: fakeCtx,
    F,
    backLanes: job.lanes,
    nextWeek: job.nextWeek,
    currentWeekMod13: job.currentWeekMod13,
    updatedRegions: job.regions,
    retainCashLedger: false,
    taxCapture,
    // Unreachable off the profile branch, which comp: null forbids:
    state: undefined, v2: undefined, entityById: undefined, companyUpdates: undefined,
    regionMedianRevenueLocal: 0, systemicStressFactorGlobal: 0, mmfSweepBooks: undefined,
    primarySettlementByIssuerId: undefined, pendingOfferingIssuerIds: undefined,
    leadBankFor: undefined, enqueueOffering: undefined, pushNews: undefined,
  } as unknown as BackKernelDeps;

  const journalMark = new Int32Array(n);
  const holderAccMark = new Int32Array(n);
  const holderCashMark = new Int32Array(n);
  const holderPayMark = new Int32Array(n);
  const crossings: (ShippedBackCoreA | null)[] = new Array(n).fill(null);

  const isActive = job.f.isActive!;
  const isProfile = job.f.isProfile!;
  for (let i = job.lo; i < job.hi; i++) {
    if (isActive[i] === 1 && isProfile[i] !== 1) {
      const a = runBackCoreA(null, i, d);
      const { post, cash, cashLedger, sec, costDriversLocal,
        newOutputInventoryBySubUnit, updatedProductLines, stillUnderConstruction,
        newRecurringBaseLocal, ...rest } = a;
      void post; void cashLedger; void sec; void costDriversLocal;
      void newOutputInventoryBySubUnit; void updatedProductLines; void stillUnderConstruction;
      void newRecurringBaseLocal;
      crossings[i] = { ...rest, cashAfterALocal: cash.usd };
    }
    journalMark[i] = journal.n;
    holderAccMark[i] = holderAcc.size;
    holderCashMark[i] = holderCash.size;
    holderPayMark[i] = holderPay.size;
  }

  // The identity discipline: nothing this shard emitted may have needed a NEW intern.
  if (partyTableSize() !== partySeeded) {
    throw new Error(`back-worker: A emitted an un-pre-interned party (table ${partySeeded} -> ${partyTableSize()}) — extend preInternBackA`);
  }
  if (reasonTableSize() !== reasonSeeded) {
    throw new Error(`back-worker: A emitted an un-pre-interned reason (table ${reasonSeeded} -> ${reasonTableSize()}) — extend preInternBackA`);
  }

  const out: BackAShardOut = {
    lo: job.lo, hi: job.hi,
    journalPayer: journal.payerId.slice(0, journal.n),
    journalPayee: journal.payeeId.slice(0, journal.n),
    journalAmount: journal.amount.slice(0, journal.n),
    journalCurrency: journal.currencyId.slice(0, journal.n),
    journalReason: journal.reasonId.slice(0, journal.n),
    journalSettle: journal.settleWeek.slice(0, journal.n),
    journalMark,
    holderAcc: [...holderAcc], holderAccMark,
    holderCash: [...holderCash], holderCashMark,
    holderPay: [...holderPay], holderPayMark,
    taxAccrue: taxCapture.accrueLocal,
    crossings,
  };
  port.postMessage(out);
  Atomics.store(doorbell, 0, 1);
  Atomics.notify(doorbell, 0);
});
