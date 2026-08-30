/**
 * SCALE wave 2, phase 1 — THE INTERN TABLE.
 *
 * Decision 2 of the design: strings die at the boundary. Every ticker, entity id, instrument id and
 * payment reason becomes a dense `int32` once, and identity below that boundary is an integer
 * compare. This generalises what `settlement.ts` already does for parties and payment reasons,
 * where it was worth ~580,000 string builds a week on its own.
 *
 * Ids are assigned in first-sight order and never reused, so an id is stable for the life of a
 * process and a table of them is safe to hold across weeks.
 */
export class InternTable {
  private idByText = new Map<string, number>();
  private textById: string[] = [];

  /** This text's id, assigned on first sight. */
  id(text: string): number {
    const existing = this.idByText.get(text);
    if (existing !== undefined) return existing;
    const id = this.textById.length;
    this.idByText.set(text, id);
    this.textById.push(text);
    return id;
  }

  /** The id, or -1 if this text has never been seen — for lookups that must not mint an id. */
  peek(text: string): number {
    const existing = this.idByText.get(text);
    return existing === undefined ? -1 : existing;
  }

  text(id: number): string { return this.textById[id]; }
  get size(): number { return this.textById.length; }
}

/** The world's shared name tables. One per kind, so an id is only ever compared within its kind. */
export const COMPANY_IDS = new InternTable();
export const TICKERS = new InternTable();
export const ENTITY_IDS = new InternTable();
export const INSTRUMENT_IDS = new InternTable();
export const SUBUNIT_IDS = new InternTable();
