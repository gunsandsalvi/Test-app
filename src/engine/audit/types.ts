/**
 * THE AUDIT — the closed-model tests (§5-CLOSE). A finding is one check failing in one week with
 * a size; the families are money (M), ownership (O), prices (P), cross-market (X), accounts (F)
 * and names (N). Every check states the identity it asserts in its message, so a reader of the
 * table knows what is broken without opening the file.
 */

import { GameState } from '../../types';

export interface AuditFinding {
  family: 'M' | 'O' | 'P' | 'X' | 'F' | 'N';
  check: string;
  week: number;
  message: string;
  /** The size of the breach in USD where one exists (a count otherwise). */
  usd?: number;
}

export type AuditCheck = (prev: GameState | undefined, state: GameState, week: number) => AuditFinding[];

export const B = (usd: number): string => `${(usd / 1e9).toFixed(2)}B`;
export const M = (usd: number): string => `${(usd / 1e6).toFixed(1)}M`;
export const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;

export function sum<T>(xs: readonly T[], f: (x: T) => number): number {
  let a = 0;
  for (const x of xs) a += f(x);
  return a;
}

/** Spearman rank correlation of two equal-length series (ties by average rank). */
export function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let k = 0; k < n; k++) { num += (rx[k] - mx) * (ry[k] - my); dx += (rx[k] - mx) ** 2; dy += (ry[k] - my) ** 2; }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}
