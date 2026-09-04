/**
 * §5-STRUCT step 2 — A FIRM'S INCOME STATEMENT FOR ONE WEEK.
 *
 * Fourth object out of the company kernel, and the smallest — which is the point. Four lines of
 * arithmetic that every firm in the model runs, written twice inline (once for the profile path,
 * once for the industrial path) with the tax treatment differing between them for no stated reason.
 * A rule written twice is a rule that will diverge.
 *
 * THE ASYMMETRY IS CLOSED (decided 2026-08-31, §4.0 Tier 1 item 8): **a loss is not taxed and is
 * not rebated.** The industrial path used to apply `(1 - taxRate)` to a negative pre-tax figure —
 * a rebate no firm receives in cash, flattering every distressed industrial company by the tax
 * rate — and floored EBIT at $1 besides, so no operating loss could reach coverage, the default
 * trigger, the rating, or the tax line. Both are gone: one rule, the profile path's, for every
 * firm. The genuinely real version of loss relief — carry-forwards against future profits — is
 * TAXR's charter, not a flag here.
 */

export interface IncomeStatement {
  ebitdaLocal: number;
  ebitUSD: number;
  netIncomeUSD: number;
  epsUSD: number;
  /** §5-TAXR — the year-rate cash tax and the rolled-forward tax attributes. */
  taxPaidAnnualUSD: number;
  taxLossCarryforwardUSD: number;
  taxBasisPpeUSD: number;
  /** (book net PP&E − tax basis) × rate: what acceleration has deferred — a VIEW, no flow. */
  deferredTaxLiabilityUSD: number;
}

/**
 * §5-TAXR — THE TAX BASE, at last a real one. A flat rate on (EBIT − interest) priced no
 * decision; three real features of a corporate tax code do, and each is POLICY (rule 2's
 * admissible class):
 *  1. **Accelerated tax depreciation** — double-declining balance on the TAX basis of the
 *     plant (the classic schedule): buying plant shields near-term profit, so tax reaches the
 *     investment-timing decision. The book keeps straight-line; the gap × rate is the deferred
 *     tax liability, a derived view.
 *  2. **Loss carryforwards** — a loss is neither taxed nor rebated (§7.255's decided rule);
 *     it becomes a carryforward that offsets FUTURE taxable profit. Receipts therefore fall
 *     faster than profits in a downturn, and a recovering firm pays nothing for years — the
 *     cyclicality a real treasury actually faces.
 *  3. The old `EBIT > 0` gate dies with its corner case: an over-levered firm with positive
 *     EBIT and negative pre-tax got `preTax × (1 − rate)` — a REBATE (the §7.255 asymmetry
 *     surviving in one corner). One rule now: positive taxable income pays, negative accrues.
 */
export interface TaxInputs {
  /** Book depreciation already inside EBIT — added back so the TAX schedule can replace it. */
  bookDepreciationAnnualUSD: number;
  taxBasisPpeUSD: number;
  usefulLifeYears: number;
  /** Plant DELIVERED this year-rate: additions to the tax basis (IND1's real deliveries). */
  capexDeliveredAnnualUSD: number;
  carryforwardUSD: number;
  bookNetPpeUSD: number;
}
export interface TaxComputation {
  taxPaidAnnualUSD: number;
  carryforwardUSD: number;
  taxBasisPpeUSD: number;
  taxDepreciationAnnualUSD: number;
  deferredTaxLiabilityUSD: number;
}

/**
 * ONE CALL ADVANCES THE STOCKS BY ONE WEEK. The P&L figures (`taxPaidAnnualUSD`,
 * `taxDepreciationAnnualUSD`) are year-rates like every other line on the statement; the
 * attributes (`carryforwardUSD`, `taxBasisPpeUSD`) are STOCKS, so they roll forward by the
 * week's slice of those rates — a stock moved at the annual rate every week would deplete
 * fifty-two times too fast (the same stock/flow discipline as the PP&E roll-forward).
 */
export function corporateTax(
  preTaxUSD: number, taxRate: number, t: TaxInputs
): TaxComputation {
  // Double-declining balance on the tax basis, never below zero basis.
  const decliningRate = 2 / Math.max(1, t.usefulLifeYears);
  const taxDepreciationAnnualUSD = Math.max(0, t.taxBasisPpeUSD) * decliningRate;
  const taxBasisPpeUSD = Math.max(0,
    t.taxBasisPpeUSD + (Math.max(0, t.capexDeliveredAnnualUSD) - taxDepreciationAnnualUSD) / 52);
  // The depreciation swap: book D&A out, the tax schedule in.
  const taxableAnnualUSD = preTaxUSD + Math.max(0, t.bookDepreciationAnnualUSD) - taxDepreciationAnnualUSD;
  let carryforwardUSD = Math.max(0, t.carryforwardUSD);
  let taxPaidAnnualUSD = 0;
  if (taxableAnnualUSD > 0) {
    // This week's taxable slice draws the carryforward stock down until it is gone.
    const usedUSD = Math.min(taxableAnnualUSD / 52, carryforwardUSD);
    carryforwardUSD -= usedUSD;
    taxPaidAnnualUSD = (taxableAnnualUSD / 52 - usedUSD) * taxRate * 52;
  } else {
    carryforwardUSD += -taxableAnnualUSD / 52;
  }
  const deferredTaxLiabilityUSD = Math.max(0, (t.bookNetPpeUSD - taxBasisPpeUSD)) * taxRate;
  return { taxPaidAnnualUSD, carryforwardUSD, taxBasisPpeUSD, taxDepreciationAnnualUSD, deferredTaxLiabilityUSD };
}

/**
 * One tax rule for every firm: tax applies when operations earn (EBIT > 0); a loss is carried at
 * its full size. NOTE THE GUARD IS ON **EBIT**, NOT ON PRE-TAX INCOME — the two differ for a firm
 * whose operations earn but whose interest bill exceeds them (EBIT positive, pre-tax negative:
 * the classic over-levered but operationally sound company, a large share of the distressed set).
 * That is the profile path's long-standing convention, kept deliberately; changing the guard
 * basis is a modelling decision for TAXR, not a cleanup.
 */
export function netIncomeUSD(
  ebitUSD: number,
  annualInterestUSD: number,
  taxRate: number,
  tax?: TaxInputs
): { netUSD: number; tax: TaxComputation } {
  const preTax = ebitUSD - annualInterestUSD;
  if (!tax) {
    // Legacy shape for callers with no tax attributes yet (pools, previews): the §7.255 rule
    // without carryforwards. Kept until every caller carries the base.
    const legacyNet = ebitUSD > 0 ? preTax * (1 - taxRate) : preTax;
    return {
      netUSD: legacyNet,
      tax: { taxPaidAnnualUSD: Math.max(0, preTax - legacyNet), carryforwardUSD: 0, taxBasisPpeUSD: 0, taxDepreciationAnnualUSD: 0, deferredTaxLiabilityUSD: 0 },
    };
  }
  const computed = corporateTax(preTax, taxRate, tax);
  return { netUSD: preTax - computed.taxPaidAnnualUSD, tax: computed };
}

/**
 * The industrial path: EBITDA is revenue at the firm's own margin, D&A comes off it, and interest
 * and tax come off that. EBIT is unfloored — an operating loss exists and reaches coverage, the
 * default trigger, the rating and the tax rule above, which is the whole point of measuring it.
 */
export function industrialIncome(i: {
  revenueLocal: number;
  ebitdaMargin: number;
  daShareOfRevenue: number;
  annualInterestUSD: number;
  taxRate: number;
  sharesOutstanding: number;
  /** §5-TAXR — the firm's tax attributes; absent = the legacy no-carryforward rule. */
  tax?: Omit<TaxInputs, 'bookDepreciationAnnualUSD'>;
}): IncomeStatement {
  const ebitdaLocal = i.revenueLocal * i.ebitdaMargin;
  const daUSD = i.revenueLocal * i.daShareOfRevenue;
  const ebitUSD = ebitdaLocal - daUSD;
  const r = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate,
    i.tax ? { ...i.tax, bookDepreciationAnnualUSD: daUSD } : undefined);
  return {
    ebitdaLocal,
    ebitUSD,
    netIncomeUSD: r.netUSD,
    epsUSD: i.sharesOutstanding > 0 ? r.netUSD / i.sharesOutstanding : 0,
    taxPaidAnnualUSD: r.tax.taxPaidAnnualUSD,
    taxLossCarryforwardUSD: r.tax.carryforwardUSD,
    taxBasisPpeUSD: r.tax.taxBasisPpeUSD,
    deferredTaxLiabilityUSD: r.tax.deferredTaxLiabilityUSD,
  };
}

/**
 * The profile path: revenue plus whatever the profile module says the firm's other income is,
 * less its three cost lines, less straight-line depreciation on gross PP&E — a bank's or an
 * insurer's shape, where the margin is not a stated ratio and the firm knows exactly what
 * to do with its interest income.
 */
export function profileIncome(i: {
  revenueLocal: number;
  otherIncomeAnnualUSD: number;
  /** The three cost lines are separate, and they are subtracted in THIS ORDER, because floating
   *  point addition is not associative: folding them into one `operatingCosts` argument changed
   *  the world at the third decimal and the three-week fingerprint caught it. An extraction that
   *  reorders arithmetic is not a refactor. */
  inputCostAnnualUSD: number;
  payrollAnnualUSD: number;
  profileCostsAnnualUSD: number;
  grossPPELocal: number;
  ppeDepreciationYears: number;
  annualInterestUSD: number;
  taxRate: number;
  sharesOutstanding: number;
  /** §5-TAXR — the firm's tax attributes; absent = the legacy no-carryforward rule. */
  tax?: Omit<TaxInputs, 'bookDepreciationAnnualUSD'>;
}): IncomeStatement {
  const ebitdaLocal = i.revenueLocal + i.otherIncomeAnnualUSD
    - i.inputCostAnnualUSD - i.payrollAnnualUSD - i.profileCostsAnnualUSD;
  const bookDaUSD = i.grossPPELocal / Math.max(1, i.ppeDepreciationYears);
  const ebitUSD = ebitdaLocal - bookDaUSD;
  const r = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate,
    i.tax ? { ...i.tax, bookDepreciationAnnualUSD: bookDaUSD } : undefined);
  return {
    ebitdaLocal,
    ebitUSD,
    netIncomeUSD: r.netUSD,
    epsUSD: i.sharesOutstanding > 0 ? r.netUSD / i.sharesOutstanding : 0,
    taxPaidAnnualUSD: r.tax.taxPaidAnnualUSD,
    taxLossCarryforwardUSD: r.tax.carryforwardUSD,
    taxBasisPpeUSD: r.tax.taxBasisPpeUSD,
    deferredTaxLiabilityUSD: r.tax.deferredTaxLiabilityUSD,
  };
}
