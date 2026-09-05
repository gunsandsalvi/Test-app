/**
 * AU — the two nouns. An OBJECT is anything with an identity (§5-AU: a firm, a fund, a region, a
 * market, a pool, a cohort, a tranche, a contract, a curve, a book, a lane…); a FUNCTION is a way
 * of looking at one. These are the shapes every module speaks; the registries are in
 * `objects/` and `functions/`.
 */

export type ObjectType =
  | 'company' | 'institution' | 'region'
  | 'market' | 'pool' | 'cohort' | 'occupation'
  | 'commodity' | 'fx' | 'curve' | 'centralbank'
  | 'tranche' | 'contract' | 'offering' | 'estate'
  | 'lane' | 'index';

export interface ObjectRef { type: ObjectType; id: string }

export interface ObjectLabel {
  /** The short handle typed in the command bar and shown in the header. */
  ticker: string;
  /** The full name. */
  name: string;
  /** The kind, in words: "bank", "pension fund", "goods market", "sovereign curve". */
  kind: string;
  region?: string;
}

/** One time series a chart can draw: weekly points with the calendar week of each. */
export interface Series {
  name: string;
  weeks: number[];
  values: number[];
  unit: string;
  fmt: (v: number) => string;
  /** A level (a rating, an index) — no percentage change is quoted. */
  level?: boolean;
}

export const refKey = (r: ObjectRef): string => `${r.type}:${r.id}`;
export const sameRef = (a: ObjectRef | undefined, b: ObjectRef | undefined): boolean =>
  !!a && !!b && a.type === b.type && a.id === b.id;
