/** AU — number formatting: money in K/M/B/T, percentages, ratios; tabular and terse. */

export function money(usd: number | undefined | null, digits = 1): string {
  if (usd === undefined || usd === null || !Number.isFinite(usd)) return '—';
  const a = Math.abs(usd);
  const sign = usd < 0 ? '−' : '';
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(digits)}T`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(digits)}K`;
  return `${sign}${a.toFixed(a < 10 ? 2 : 0)}`;
}

/** Statement style: USD millions with thousands separators, negatives in parentheses. */
export function statementLocal(usd: number | undefined | null): string {
  if (usd === undefined || usd === null || !Number.isFinite(usd)) return '—';
  const m = Math.round(usd / 1e6);
  const s = Math.abs(m).toLocaleString('en-US');
  return m < 0 ? `(${s})` : s;
}

export function pct(x: number | undefined | null, digits = 1): string {
  if (x === undefined || x === null || !Number.isFinite(x)) return '—';
  const v = x * 100;
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(digits)}%`;
}

/** A level in percent without a sign: 12.5% */
export function pctLevel(x: number | undefined | null, digits = 1): string {
  if (x === undefined || x === null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function ratio(x: number | undefined | null, digits = 1): string {
  if (x === undefined || x === null || !Number.isFinite(x)) return '—';
  return `${x.toFixed(digits)}×`;
}

export function num(x: number | undefined | null, digits = 2): string {
  if (x === undefined || x === null || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const s = a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(digits);
  return x < 0 ? `−${s}` : s;
}

export function bps(x: number | undefined | null): string {
  if (x === undefined || x === null || !Number.isFinite(x)) return '—';
  return `${Math.round(x)}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** The change between two levels, as a signed percentage; undefined when either side is missing. */
export function changePct(now: number | undefined, before: number | undefined): number | undefined {
  if (now === undefined || before === undefined || !Number.isFinite(now) || !Number.isFinite(before) || before === 0) return undefined;
  return now / before - 1;
}
