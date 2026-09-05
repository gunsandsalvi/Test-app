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

interface IncomeStatement {
  ebitdaLocal: number;
  ebitLocal: number;
  netIncomeLocal: number;
  epsLocal: number;
  /** §5-TAXR — the year-rate cash tax and the rolled-forward tax attributes. */
  taxPaidAnnualLocal: number;
  taxLossCarryforwardLocal: number;
  taxBasisPpeLocal: number;
  /** (book net PP&E − tax basis) × rate: what acceleration has deferred — a VIEW, no flow. */
  deferredTaxLiabilityLocal: number;
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
interface TaxInputs {
  /** Book depreciation already inside EBIT — added back so the TAX schedule can replace it. */
  bookDepreciationAnnualLocal: number;
  taxBasisPpeLocal: number;
  usefulLifeYears: number;
  /** Plant DELIVERED this year-rate: additions to the tax basis (IND1's real deliveries). */
  capexDeliveredAnnualLocal: number;
  carryforwardLocal: number;
  bookNetPpeLocal: number;
}
interface TaxComputation {
  taxPaidAnnualLocal: number;
  carryforwardLocal: number;
  taxBasisPpeLocal: number;
  taxDepreciationAnnualLocal: number;
  deferredTaxLiabilityLocal: number;
}

/**
 * ONE CALL ADVANCES THE STOCKS BY ONE WEEK. The P&L figures (`taxPaidAnnualLocal`,
 * `taxDepreciationAnnualLocal`) are year-rates like every other line on the statement; the
 * attributes (`carryforwardLocal`, `taxBasisPpeLocal`) are STOCKS, so they roll forward by the
 * week's slice of those rates — a stock moved at the annual rate every week would deplete
 * fifty-two times too fast (the same stock/flow discipline as the PP&E roll-forward).
 */
export function corporateTax(
  preTaxLocal: number, taxRate: number, t: TaxInputs
): TaxComputation {
  // Double-declining balance on the tax basis, never below zero basis.
  const decliningRate = 2 / Math.max(1, t.usefulLifeYears);
  const taxDepreciationAnnualLocal = Math.max(0, t.taxBasisPpeLocal) * decliningRate;
  const taxBasisPpeLocal = Math.max(0,
    t.taxBasisPpeLocal + (Math.max(0, t.capexDeliveredAnnualLocal) - taxDepreciationAnnualLocal) / 52);
  // The depreciation swap: book D&A out, the tax schedule in.
  const taxableAnnualLocal = preTaxLocal + Math.max(0, t.bookDepreciationAnnualLocal) - taxDepreciationAnnualLocal;
  let carryforwardLocal = Math.max(0, t.carryforwardLocal);
  let taxPaidAnnualLocal = 0;
  if (taxableAnnualLocal > 0) {
    // This week's taxable slice draws the carryforward stock down until it is gone.
    const usedLocal = Math.min(taxableAnnualLocal / 52, carryforwardLocal);
    carryforwardLocal -= usedLocal;
    taxPaidAnnualLocal = (taxableAnnualLocal / 52 - usedLocal) * taxRate * 52;
  } else {
    carryforwardLocal += -taxableAnnualLocal / 52;
  }
  const deferredTaxLiabilityLocal = Math.max(0, (t.bookNetPpeLocal - taxBasisPpeLocal)) * taxRate;
  return { taxPaidAnnualLocal, carryforwardLocal, taxBasisPpeLocal, taxDepreciationAnnualLocal, deferredTaxLiabilityLocal };
}

/**
 * One tax rule for every firm: tax applies when operations earn (EBIT > 0); a loss is carried at
 * its full size. NOTE THE GUARD IS ON **EBIT**, NOT ON PRE-TAX INCOME — the two differ for a firm
 * whose operations earn but whose interest bill exceeds them (EBIT positive, pre-tax negative:
 * the classic over-levered but operationally sound company, a large share of the distressed set).
 * That is the profile path's long-standing convention, kept deliberately; changing the guard
 * basis is a modelling decision for TAXR, not a cleanup.
 */
export function netIncomeLocal(
  ebitLocal: number,
  annualInterestLocal: number,
  taxRate: number,
  tax?: TaxInputs
): { netLocal: number; tax: TaxComputation } {
  const preTax = ebitLocal - annualInterestLocal;
  if (!tax) {
    // Legacy shape for callers with no tax attributes yet (pools, previews): the §7.255 rule
    // without carryforwards. Kept until every caller carries the base.
    const legacyNet = ebitLocal > 0 ? preTax * (1 - taxRate) : preTax;
    return {
      netLocal: legacyNet,
      tax: { taxPaidAnnualLocal: Math.max(0, preTax - legacyNet), carryforwardLocal: 0, taxBasisPpeLocal: 0, taxDepreciationAnnualLocal: 0, deferredTaxLiabilityLocal: 0 },
    };
  }
  const computed = corporateTax(preTax, taxRate, tax);
  return { netLocal: preTax - computed.taxPaidAnnualLocal, tax: computed };
}

/**
 * The industrial path: EBITDA is revenue at the firm's own margin, the plant's own straight-line
 * charge comes off it, and interest and tax come off that. EBIT is unfloored — an operating loss
 * exists and reaches coverage, the default trigger, the rating and the tax rule above, which is
 * the whole point of measuring it.
 */
export function industrialIncome(i: {
  revenueLocal: number;
  ebitdaMargin: number;
  /** §3.26-f-i — the one schedule's year-rate on the firm's opening gross plant
   *  (`capital-programme.ts:annualDepreciationLocal`). It was `revenue × 0.05`, so a firm that
   *  doubled its plant took no extra charge against its earnings. */
  depreciationAnnualLocal: number;
  annualInterestLocal: number;
  taxRate: number;
  sharesOutstanding: number;
  /** §5-TAXR — the firm's tax attributes; absent = the legacy no-carryforward rule. */
  tax?: Omit<TaxInputs, 'bookDepreciationAnnualLocal'>;
}): IncomeStatement {
  const ebitdaLocal = i.revenueLocal * i.ebitdaMargin;
  const daLocal = i.depreciationAnnualLocal;
  const ebitLocal = ebitdaLocal - daLocal;
  const r = netIncomeLocal(ebitLocal, i.annualInterestLocal, i.taxRate,
    i.tax ? { ...i.tax, bookDepreciationAnnualLocal: daLocal } : undefined);
  return {
    ebitdaLocal,
    ebitLocal,
    netIncomeLocal: r.netLocal,
    epsLocal: i.sharesOutstanding > 0 ? r.netLocal / i.sharesOutstanding : 0,
    taxPaidAnnualLocal: r.tax.taxPaidAnnualLocal,
    taxLossCarryforwardLocal: r.tax.carryforwardLocal,
    taxBasisPpeLocal: r.tax.taxBasisPpeLocal,
    deferredTaxLiabilityLocal: r.tax.deferredTaxLiabilityLocal,
  };
}

/**
 * The profile path: revenue plus whatever the profile module says the firm's other income is,
 * less its three cost lines, less the plant's own straight-line charge (the same one schedule
 * the industrial path charges — it was a stated twenty years here, whatever the sector) — a
 * bank's or an insurer's shape, where the margin is not a stated ratio and the firm knows
 * exactly what to do with its interest income.
 */
export function profileIncome(i: {
  revenueLocal: number;
  otherIncomeAnnualLocal: number;
  /** The three cost lines are separate, and they are subtracted in THIS ORDER, because floating
   *  point addition is not associative: folding them into one `operatingCosts` argument changed
   *  the world at the third decimal and the three-week fingerprint caught it. An extraction that
   *  reorders arithmetic is not a refactor. */
  inputCostAnnualLocal: number;
  payrollAnnualLocal: number;
  profileCostsAnnualLocal: number;
  /** §3.26-f-i — the one schedule's year-rate (`capital-programme.ts:annualDepreciationLocal`). */
  depreciationAnnualLocal: number;
  annualInterestLocal: number;
  taxRate: number;
  sharesOutstanding: number;
  /** §5-TAXR — the firm's tax attributes; absent = the legacy no-carryforward rule. */
  tax?: Omit<TaxInputs, 'bookDepreciationAnnualLocal'>;
}): IncomeStatement {
  const ebitdaLocal = i.revenueLocal + i.otherIncomeAnnualLocal
    - i.inputCostAnnualLocal - i.payrollAnnualLocal - i.profileCostsAnnualLocal;
  const bookDaLocal = i.depreciationAnnualLocal;
  const ebitLocal = ebitdaLocal - bookDaLocal;
  const r = netIncomeLocal(ebitLocal, i.annualInterestLocal, i.taxRate,
    i.tax ? { ...i.tax, bookDepreciationAnnualLocal: bookDaLocal } : undefined);
  return {
    ebitdaLocal,
    ebitLocal,
    netIncomeLocal: r.netLocal,
    epsLocal: i.sharesOutstanding > 0 ? r.netLocal / i.sharesOutstanding : 0,
    taxPaidAnnualLocal: r.tax.taxPaidAnnualLocal,
    taxLossCarryforwardLocal: r.tax.carryforwardLocal,
    taxBasisPpeLocal: r.tax.taxBasisPpeLocal,
    deferredTaxLiabilityLocal: r.tax.deferredTaxLiabilityLocal,
  };
}
