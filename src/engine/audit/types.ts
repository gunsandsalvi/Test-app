/**
 * THE AUDIT — the closed-model tests (§5-CLOSE). A finding is one check failing in one week with
 * a size; the families are money (M), ownership (O), prices (P), cross-market (X), accounts (F)
 * and names (N). Every check states the identity it asserts in its message, so a reader of the
 * table knows what is broken without opening the file.
 */
import { LADDER_FACE_DUST_LOCAL } from '../../domain/stated';

export interface AuditFinding {
  family: 'M' | 'O' | 'P' | 'X' | 'F' | 'N' | 'W';
  check: string;
  week: number;
  message: string;
  /** The size of the breach in USD where one exists (a count otherwise). */
  usd?: number;
}

/**
 * RULE 7 — A TOLERANCE IS FLOAT DUST, NEVER A PERCENTAGE (§3.27-i). An identity holds or it does
 * not; a check may forgive only the error the floating-point arithmetic itself introduced — about
 * `n × eps × Σ|terms|`, from the size and the COUNT of what was added, orders of magnitude below
 * anything the model trades. A percentage band is a business judgement in a numerical costume: it
 * says a thousand dollars may go missing if the book is large enough. A fixed number of dollars is
 * either a real threshold or useless (§9.3). Every check's bound is this function of the sum it
 * actually performed, and whatever then fires is a defect with a size, not a tolerance to widen.
 */
export function floatDust(sumOfAbsTerms: number, terms: number): number {
  return Math.max(1, terms) * Number.EPSILON * Math.abs(sumOfAbsTerms);
}

/** The same, for MONEY: never less than the smallest unit there is — a cent
 *  (`LADDER_FACE_DUST_LOCAL`, the one absolute resolution rule 7 asks for): below it there is no
 *  rung to wire, whatever the book sits next to. */
export function floatDustLocal(sumOfAbsTermsLocal: number, terms: number): number {
  return Math.max(LADDER_FACE_DUST_LOCAL, floatDust(sumOfAbsTermsLocal, terms));
}

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
