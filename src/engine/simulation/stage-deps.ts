/**
 * §5-STRUCT step 5 — STAGE DEPENDENCIES ARE MEASURED, NOT REMEMBERED.
 *
 * Fifty-two stages run in a hand-ordered list whose correctness depends entirely on the order, and
 * nothing checks it. §7.226 is what that costs: moving `repo-collateral-reconcile` to where the
 * defect said it belonged cut the symptom, broke the per-bank balance identity, and took a full
 * 60-week run to discover — because the stage's side effects relied on being inside the settlement
 * window and no artefact anywhere said so.
 *
 * WHY THIS IS MEASURED RATHER THAN DECLARED. The obvious design is a manifest: each stage states its
 * `reads` and `writes`. For a codebase being written from scratch that is right. For this one it is
 * worse than nothing — fifty-two hand-written manifests over a context of ~90 fields would be
 * guesswork, and a manifest that is wrong gives false confidence exactly where the real ordering
 * hazard lives. So the context is proxied and the accesses are RECORDED. The manifest is then a
 * fact about the run rather than an assertion about it, and it cannot drift from the code.
 *
 * WHAT IT FINDS. A BACKWARD DEPENDENCY: stage N reads a context field that stage M > N writes. That
 * is not automatically a defect — a stage legitimately reads last week's value of something written
 * later — but it is exactly the set of edges that break when a stage moves, and it has never been
 * enumerated. Every one of them is either intentional (and should say so) or a latent §7.226.
 *
 * COST WHEN OFF: one boolean test per stage. The proxy is built only under STAGE_TRACE=1.
 */

/**
 * §7.278 — THE DELIBERATE EDGES, ANNOTATED; THE REMAINDER RATCHETED AT ZERO.
 *
 * Every backward edge measured (84 over 11 fields at the 3-week probe) runs over one of these
 * fields, and each field's backwardness is a designed pipeline structure, not a latent §7.226.
 * The proxy cannot see WHICH value a read returns — only that a later stage also writes the
 * field — so the annotation lives at the field level: the reason the field is SUPPOSED to be
 * read before its last writer. A backward edge on any field NOT in this record is the ratchet
 * firing: either annotate the new field here with its reason, or the ordering is a defect.
 */
export const DELIBERATE_PIPELINE_FIELDS: Record<string, string> = {
  updatedCompanies: 'the running working copy, threaded stage to stage — a read is the pipeline state as of that slot, by construction',
  updatedInstitutionalEntities: 'same working-copy pipeline as updatedCompanies',
  updatedRegions: 'same working-copy pipeline; 01-macro-feedback deliberately reads LAST week (02-region-macro re-derives)',
  updatedFxPairs: 'working copy; 06 quotes off the prior fix, fx-clearing sets the new one',
  updatedMarketIndexes: 'working copy; 07b/07d/07e price off the prior index level, index-calculation re-marks after',
  paymentJournal: 'append-only accumulator: stages append all week, settlement-close applies — appending IS the design (rule 17)',
  holdingsStore: 'SCALE C1 epoch store: built, read through by the clearing stages, written back at holdings-writeback',
  holdingsTable: 'register store, same build/consume/write-back epoch shape as holdingsStore',
  primaryOfferingsWorking: 'the 07x books consume the offerings stage 08 replenished LAST week — a deliberate one-week primary pipeline',
  lastSettlementReport: 'last week\'s report by name; readers want the prior close',
};

export interface StageAccess {
  stage: string;
  reads: Set<string>;
  writes: Set<string>;
}

export interface BackwardEdge {
  /** The stage that reads the field... */
  reader: string;
  /** ...which this later stage writes. */
  writer: string;
  field: string;
  readerIndex: number;
  writerIndex: number;
}

/** Recorded accesses, in stage order, for one week. */
export class StageDependencyTrace {
  readonly accesses: StageAccess[] = [];
  private current: StageAccess | undefined;

  /** Wrap the context for one stage. Every get is a read, every set a write. */
  begin<T extends object>(stage: string, ctx: T): T {
    const access: StageAccess = { stage, reads: new Set(), writes: new Set() };
    this.accesses.push(access);
    this.current = access;
    return new Proxy(ctx, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') access.reads.add(prop);
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string') access.writes.add(prop);
        return Reflect.set(target, prop, value, receiver);
      },
    }) as T;
  }

  end(): void {
    this.current = undefined;
  }

  /**
   * Every edge that runs against the stage order. This is the ordering surface: the set of
   * relationships that a stage move can break, and the only reason the list in `core.ts` is not
   * arbitrary.
   *
   * A field written by MANY stages reports its LAST writer, because that is the value a reader
   * placed after it would see — the edge that matters when something moves.
   */
  backwardEdges(): BackwardEdge[] {
    const lastWriterOf = new Map<string, { stage: string; index: number }>();
    this.accesses.forEach((a, index) => {
      a.writes.forEach((field) => lastWriterOf.set(field, { stage: a.stage, index }));
    });
    const out: BackwardEdge[] = [];
    this.accesses.forEach((a, readerIndex) => {
      a.reads.forEach((field) => {
        const w = lastWriterOf.get(field);
        if (!w || w.index <= readerIndex) return;
        out.push({ reader: a.stage, writer: w.stage, field, readerIndex, writerIndex: w.index });
      });
    });
    return out;
  }

  /** §7.278: backward edges over fields with NO deliberate-pipeline annotation — the ratchet.
   *  Empty today; a new entry means a new ordering hazard nobody has annotated. */
  undeclaredEdges(): BackwardEdge[] {
    return this.backwardEdges().filter((e) => !(e.field in DELIBERATE_PIPELINE_FIELDS));
  }

  /** One line per stage: what it touched. The manifest, derived. */
  manifest(): string[] {
    return this.accesses.map((a) =>
      `${a.stage}  reads[${[...a.reads].sort().join(',')}]  writes[${[...a.writes].sort().join(',')}]`);
  }

  /** The report a run prints: the ordering surface, grouped by the field that carries it. */
  report(): string[] {
    const edges = this.backwardEdges();
    const byField = new Map<string, BackwardEdge[]>();
    edges.forEach((e) => {
      const list = byField.get(e.field);
      if (list) list.push(e); else byField.set(e.field, [e]);
    });
    const out: string[] = [
      `--- §5-STRUCT step 5: stage ordering surface — ${edges.length} backward edges over ${byField.size} fields ---`,
      "  A backward edge is a stage reading a field a LATER stage writes: it sees last week's value.",
      '  Each is either deliberate (and should be documented) or a latent §7.226. None was enumerated before.',
    ];
    [...byField.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .forEach(([field, list]) => {
        const readers = [...new Set(list.map((e) => e.reader))];
        out.push(`  ${field}: written last by ${list[0].writer}, read earlier by ${readers.length} stage(s) — ${readers.slice(0, 4).join(', ')}${readers.length > 4 ? ', …' : ''}`);
      });
    return out;
  }
}

/** Off unless asked for: one boolean test per stage when disabled. */
export const stageTraceEnabled = (): boolean => process.env.STAGE_TRACE === '1';
