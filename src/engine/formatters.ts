import type { Ticker } from '../domain/ids';
/**
 * High-Precision Institutional Financial Formatter Engine
 * Eliminates raw floats, turn notation, unparsed LaTeX, and provides uniform calendar timelines across the platform.
 */

/** §3.15-iii: a number that is not there prints as NOT THERE. These used to print `$0.00`,
 *  `0.00%`, `0.0 bps`, `0.0x` and `100.00%` for a NaN or an undefined — a bracket as a print
 *  (rule 3), and par for a bond nobody priced. The UI's own formatters (`ui/format.ts`) already
 *  print the dash. */
export const MISSING = '—';

// Anchor simulation start to Jan 5, 2026 (Week 1 = Jan 5, 2026)
export const SIMULATION_START_DATE = new Date(2026, 0, 5); // Jan 5, 2026

/** §3.14: the calendar year a week falls in, on the ENGINE's calendar (the traces' one). */
export const yearOfSimulationWeek = (week: number): number => getSimulationDate(week).getFullYear();

export function getSimulationDate(week: number): Date {
  const safeWeek = Math.max(1, Math.floor(week || 1));
  const date = new Date(SIMULATION_START_DATE.getTime());
  date.setDate(date.getDate() + (safeWeek - 1) * 7);
  return date;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatSimulationDate(week: number): string {
  const d = getSimulationDate(week);
  const month = MONTH_NAMES[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function formatSimulationDateShort(week: number): string {
  const d = getSimulationDate(week);
  const month = MONTH_NAMES[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  return `${month} ${day}`;
}

/**
 * Returns formatted quarter filing label (e.g. "Q1 '25 (Mar 31)", "Q2 '25 (Jun 30)")
 */
export function formatQuarterFilingDate(quarterIndex: number, startYear: number = SIMULATION_START_DATE.getFullYear()): string {
  const totalQuarters = Math.max(0, quarterIndex);
  const yearOffset = Math.floor(totalQuarters / 4);
  const qNum = (totalQuarters % 4) + 1;
  const year = startYear + yearOffset;
  const shortYear = String(year).slice(-2);

  const quarterDates: Record<number, string> = {
    1: 'Mar 31',
    2: 'Jun 30',
    3: 'Sep 30',
    4: 'Dec 31',
  };

  return `Q${qNum} '${shortYear} (${quarterDates[qNum]})`;
}

export function formatBondName(ticker: Ticker, couponRate: number | undefined, maturityWeek: number, currentWeek: number, rateType: 'FIXED' | 'FLOATING'): string {
  const yearsRemaining = Math.max(0, (maturityWeek - currentWeek) / 52);
  const maturityYear = getSimulationDate(currentWeek).getFullYear() + Math.round(yearsRemaining);
  if (rateType === 'FIXED') {
    return `${ticker} ${((couponRate ?? 0) * 100).toFixed(2)} '${String(maturityYear).slice(-2)}`;
  }
  return `${ticker} FRN '${String(maturityYear).slice(-2)}`;
}

/**
 * Strips raw LaTeX tokens and replaces them with clean UTF-8 text
 */
export function cleanLatexTokens(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/\\longleftrightarrow/g, ' ⟷ ')
    .replace(/\\leftrightarrow/g, ' ⟷ ')
    .replace(/\\rightarrow|\\to/g, ' → ')
    .replace(/\\leftarrow/g, ' ← ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\beta/g, 'β')
    .replace(/\\pi\^?\*?/g, 'π*')
    .replace(/\\pi/g, 'π')
    .replace(/\\rho/g, 'ρ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\approx/g, '≈')
    .replace(/\\pm/g, '±')
    .replace(/\\le|\\leq/g, '≤')
    .replace(/\\ge|\\geq/g, '≥')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\$/g, '');
}

export function formatCurrency(
  val: number | undefined | null,
  options?: {
    compact?: boolean;
    precision?: number;
    showSign?: boolean;
    symbol?: string;
  }
): string {
  if (val === undefined || val === null || isNaN(val)) return MISSING;

  const symbol = options?.symbol ?? '$';
  const showSign = options?.showSign ?? false;
  const sign = val > 0 && showSign ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);

  if (options?.compact) {
    if (abs >= 1_000_000_000) {
      const precision = options?.precision ?? 2;
      return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(precision)}B`;
    }
    if (abs >= 1_000_000) {
      const precision = options?.precision ?? 2;
      return `${sign}${symbol}${(abs / 1_000_000).toFixed(precision)}M`;
    }
    if (abs >= 1_000) {
      const precision = options?.precision ?? 1;
      return `${sign}${symbol}${(abs / 1_000).toFixed(precision)}K`;
    }
    return `${sign}${symbol}${abs.toFixed(options?.precision ?? 2)}`;
  }

  // Exact thousand-separated currency
  const parts = abs.toFixed(options?.precision ?? 2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${parts.join('.')}`;
}

export function formatStockPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) return MISSING;
  return `$${price.toFixed(2)}`;
}

export function formatBps(
  bps: number | undefined | null,
  options?: { showPlus?: boolean; showSign?: boolean; precision?: number }
): string {
  if (bps === undefined || bps === null || isNaN(bps)) return MISSING;
  const showPlus = options?.showPlus ?? options?.showSign ?? true;
  const precision = options?.precision ?? 1;
  const sign = bps > 0 && showPlus ? '+' : '';
  return `${sign}${bps.toFixed(precision)} bps`;
}

/**
 * §7.241: `isDecimal` is REQUIRED. The old signature guessed the unit by magnitude
 * (`|val| <= 1`), so a fraction crossing 1.0 — a 101% growth print, a >100% surprise — silently
 * rendered 100× smaller. A display helper that guesses units is a unit-confusion machine in the
 * one layer whose job is to expose them; the caller knows its unit and now must say it.
 */
export function formatPercent(
  val: number | undefined | null,
  options: {
    isDecimal: boolean; // true if 0.052 = 5.2%; false if 5.2 = 5.2%
    showSign?: boolean;
    precision?: number;
  }
): string {
  if (val === undefined || val === null || isNaN(val)) return MISSING;
  const showSign = options.showSign ?? false;
  const precision = options.precision ?? 2;
  const pct = options.isDecimal ? val * 100 : val;
  const sign = pct > 0 && showSign ? '+' : '';
  return `${sign}${pct.toFixed(precision)}%`;
}

export function formatMultiple(
  val: number | undefined | null,
  suffix: string = 'x',
  precision: number = 1
): string {
  if (val === undefined || val === null || isNaN(val)) return MISSING;
  return `${val.toFixed(precision)}${suffix}`;
}

export function formatParPrice(
  price: number | undefined | null,
  precision: number = 2
): string {
  if (price === undefined || price === null || isNaN(price)) return MISSING;
  return `${price.toFixed(precision)}% Par`;
}
