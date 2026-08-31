/**
 * Small pure helper functions shared by two or more weekly-step stages (credit spread /
 * rating-bucket demand premia, occupation labor demand, ownership-share targets, and
 * itemized-holdings attribution). Kept together here rather than duplicated per stage.
 */

import { journalPayment } from './settlement';
import { getHoldingsTable } from './register-index';
import { INSTRUMENT_IDS } from '../../columns/intern';
import { Company, Region, SmePool, RegionId, ItemizedHolding, SupplyRelationship, InstitutionalEntity } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { SECTOR_OCCUPATION_MIX, GOVERNMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { INDUSTRY_REGISTRY } from '../../../domain/industry-registry';

const FOREIGN_GROWTH_SENSITIVITY = 3.0;

/**
 * The default trigger, defined once. A company defaults the week its cash goes negative while
 * its coverage sits below this floor (see stage 08's check, which imports this constant, and
 * credit.ts's rating ladder, which anchors its CCC boundary to the same number). Everything the
 * market charges for credit risk is priced off the probability of ENTERING this state — so the
 * trigger and the hazard priced against it must be one definition, not two.
 */
export const DEFAULT_COVERAGE_FLOOR = 0.8;

/** Expected relative EBITDA volatility per revenue volatility: margins amplify a revenue shock. */
const OPERATING_LEVERAGE = 2.0;
/**
 * Floor on annualized relative EBITDA volatility. Measured volatility comes from the company's
 * own revenue history, but early weeks have too little history to measure honestly, and a
 * deterministic bootstrap would otherwise imply zero risk for everyone. Real mature-company
 * EBITDA vol runs ~15-40% annualized; the floor sits at the calm end of that.
 */
const MIN_ANNUAL_EBITDA_VOL = 0.18;
const MAX_ANNUAL_EBITDA_VOL = 1.2;

/** Standard normal CDF (Abramowitz–Stegun; ~1e-7 accurate — plenty for a default probability). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return x >= 0 ? p : 1 - p;
}

/** Annualized relative EBITDA volatility, measured from the company's own revenue history. */
function annualEbitdaVol(comp: Company): number {
  const hist = comp.revenueHistory || [];
  if (hist.length < 8) return MIN_ANNUAL_EBITDA_VOL;
  const rel: number[] = [];
  for (let i = 1; i < hist.length; i++) {
    if (hist[i - 1] > 0) rel.push(hist[i] / hist[i - 1] - 1);
  }
  if (rel.length < 4) return MIN_ANNUAL_EBITDA_VOL;
  const mean = rel.reduce((a, b) => a + b, 0) / rel.length;
  const varc = rel.reduce((a, b) => a + (b - mean) ** 2, 0) / (rel.length - 1);
  const weeklyRevVol = Math.sqrt(varc);
  const annual = weeklyRevVol * Math.sqrt(52) * OPERATING_LEVERAGE;
  return Math.min(MAX_ANNUAL_EBITDA_VOL, Math.max(MIN_ANNUAL_EBITDA_VOL, annual));
}

/**
 * Annual probability of default as a STRUCTURAL FORECAST of the real trigger above — not a
 * fitted curve. The previous model was a logistic on (leverage − coverage) with a tuned cap,
 * midpoint and width: a shape with the right slope and no relationship to how default actually
 * happens in this simulation, so the market priced one risk while companies died of another
 * (§7.19 review item 1 in the plan).
 *
 * This asks the real question instead: how large a relative EBITDA shock, sustained for a year,
 * would put THIS company inside the trigger — and how likely is a shock that size given the
 * company's own measured volatility?
 *
 *   - The coverage half trips when EBITDA falls below floor × interest.
 *   - The cash half trips when the year's fixed outflows (interest, maintenance capex,
 *     dividends) exhaust the shocked EBITDA plus the cash pile.
 *   - The trigger is an AND, so the binding distance is the LARGER of the two shocks — which is
 *     why a leveraged company with a genuine cash pile is safer than its coverage alone says,
 *     exactly as a real credit desk would read it: runway matters.
 *
 * PD = Φ(−distance / σ). Every input is the company's own: its real ladder's interest, its real
 * cash, its real capex and dividends, its own measured revenue volatility. Dispersion between
 * two same-rated names is real information, not curve noise.
 */
export function computeAnnualDefaultProbability(comp: Company): number {
  const interest = comp.debtTranches?.reduce((sum, t) => {
    const rate = t.rateType === 'FIXED'
      ? (t.couponRate ?? 0.05)
      : (0.05 + (t.floatingMarginBps ?? 200) / 10000);
    return sum + t.principalUSD * rate;
  }, 0) || 1;
  const ebitda = Math.max(1, comp.ebitda);

  const shockToCoverage = 1 - (DEFAULT_COVERAGE_FLOOR * interest) / ebitda;
  // Dividends live on the quarterly snapshot (there is no annual field on Company) — annualize
  // the latest quarter. Zero when no snapshot exists yet. The statement stores dividends the way
  // a cash flow statement does, as a NEGATIVE financing outflow; this needs the magnitude of the
  // outflow, so take the absolute value — added signed, it subtracted from fixed outflows and
  // made a dividend-paying company look SAFER for paying one.
  const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
  const dividendsAnnualUSD = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0) * 4;
  const fixedOutflowsUSD = interest + (comp.maintenanceCapex ?? 0) + dividendsAnnualUSD;
  const shockToCash = 1 - (fixedOutflowsUSD - Math.max(0, comp.cash)) / ebitda;
  const distance = Math.max(shockToCoverage, shockToCash);

  return normalCdf(-distance / annualEbitdaVol(comp));
}

export function computeExpectedLossSpreadBps(comp: Company, reg?: { realisedRecoveryRates?: number[] }): number {
  return computeAnnualDefaultProbability(comp) * (1 - creditRecoveryRate(reg)) * 10000;
}

/**
 * What a defaulted borrower's lenders get back.
 *
 * G5 made this an OUTPUT. A workout sells the issuer's real assets into the markets that would
 * buy them and pays the claims in the order they are owed (stages/estate-resolution.ts), and what
 * it actually recovers is recorded on the region. `creditRecoveryRate` below is the rolling mean
 * of those resolutions, so the loss the credit market PRICES is the loss it has SEEN — which
 * closes the one-default-model loop whose hazard side landed in §7.20.
 *
 * The 0.4 survives as the prior: what a lender must assume before this world has resolved enough
 * defaults to have an opinion of its own.
 */
export const CREDIT_RECOVERY_RATE = 0.4;

/** How many resolutions it takes before a region's own experience displaces the prior. */
export const RECOVERY_PRIOR_WEIGHT = 8;

/**
 * This region's recovery rate: its own realised experience, weighted against the prior by how
 * much experience it has. One resolution does not overturn the prior; twenty do.
 */
export function creditRecoveryRate(reg?: { realisedRecoveryRates?: number[] }): number {
  const realised = reg?.realisedRecoveryRates ?? [];
  if (realised.length === 0) return CREDIT_RECOVERY_RATE;
  const mean = realised.reduce((a, b) => a + b, 0) / realised.length;
  const w = realised.length / (realised.length + RECOVERY_PRIOR_WEIGHT);
  return Math.max(0, Math.min(1, mean * w + CREDIT_RECOVERY_RATE * (1 - w)));
}

export function getRatingBucket(rating: string): 'IG' | 'HY' {
  return ['AAA', 'AA', 'A', 'BBB'].includes(rating) ? 'IG' : 'HY';
}


export function computeOccupationDemand(companies: Company[], privateSegments: SmePool[], regionId: RegionId, governmentEmployment?: number): Record<string, number> {
  const demand: Record<string, number> = {
    GENERAL: 0,
    SKILLED_TRADES: 0,
    TECHNICAL_ENGINEERING: 0,
    SPECIALIZED_PROFESSIONAL: 0,
    MANAGERIAL_FINANCIAL: 0,
  };

  companies.filter(c => c.region === regionId && isActiveCompany(c)).forEach(c => {
    const mix = SECTOR_OCCUPATION_MIX[c.sector];
    if (!mix) { demand.GENERAL += c.employeeCount; return; }
    Object.keys(mix).forEach((occ) => {
      demand[occ] += c.employeeCount * ((mix as any)[occ] ?? 0);
    });
  });

  (privateSegments || []).forEach(seg => {
    const mix = SECTOR_OCCUPATION_MIX[INDUSTRY_REGISTRY[seg.industry].sector as keyof typeof SECTOR_OCCUPATION_MIX];
    if (!mix) { demand.GENERAL += seg.employment; return; }
    Object.keys(mix).forEach((occ) => {
      demand[occ] += seg.employment * ((mix as any)[occ] ?? 0);
    });
  });

  if (governmentEmployment) {
    Object.entries(GOVERNMENT_OCCUPATION_MIX).forEach(([occ, share]) => {
      demand[occ] += governmentEmployment * (share ?? 0);
    });
  }

  return demand;
}

export function formSupplyRelationships(regionId: RegionId, companies: Company[]): SupplyRelationship[] {
  const regionFirms = companies.filter(c => c.region === regionId && isActiveCompany(c));
  const relationships: SupplyRelationship[] = [];

  // SCALE: WHO MAKES THIS INPUT, ONCE. The line below used to re-derive that for every
  // (customer x product line x input requirement) by FILTERING the whole region and running a
  // `.some()` over each firm's own lines inside the filter — with ~600 firms a region carrying a
  // few lines each and a few inputs each, tens of millions of comparisons a week, and a freshly
  // allocated supplier array for each one (measured: 15% of everything the engine allocates).
  // One index, built in a single pass, and the totals it feeds are summed in the same order.
  const suppliersByInput = new Map<string, Company[]>();
  const revenueByInput = new Map<string, number>();
  regionFirms.forEach((s) => {
    const seen = new Set<string>();
    (s.productLines || []).forEach((l) => {
      if (seen.has(l.subUnitId)) return;
      seen.add(l.subUnitId);
      const list = suppliersByInput.get(l.subUnitId);
      if (list) list.push(s); else suppliersByInput.set(l.subUnitId, [s]);
      revenueByInput.set(l.subUnitId, (revenueByInput.get(l.subUnitId) ?? 0) + s.annualRevenue);
    });
  });

  regionFirms.forEach(customer => {
    (customer.productLines || []).forEach(line => {
      const reqs = CATEGORY_INPUT_REQUIREMENTS[line.subUnitId];
      if (!reqs) return;
      Object.entries(reqs).forEach(([inputSubUnitId, intensity]) => {
        if (!intensity) return;
        const all = suppliersByInput.get(inputSubUnitId);
        if (!all || all.length === 0) return;
        // The customer excludes ITSELF, which is the only reason this is not a pure lookup: the
        // total is the index's, less the customer's own revenue when it also makes the input.
        const selfSupplies = all.length > 0 && all.indexOf(customer) >= 0;
        const suppliers = selfSupplies ? all.filter((s) => s.id !== customer.id) : all;
        if (suppliers.length === 0) return;
        const totalSupplierRevenue =
          ((revenueByInput.get(inputSubUnitId) ?? 0) - (selfSupplies ? customer.annualRevenue : 0)) || 1;
        const weeklyDemandUSD = (customer.annualRevenue / 52) * intensity * line.revenueShare;
        suppliers.forEach(supplier => {
          const relationshipStrength = supplier.annualRevenue / totalSupplierRevenue;
          relationships.push({
            supplierCompanyId: supplier.id,
            customerCompanyId: customer.id,
            category: inputSubUnitId,
            weeklyVolumeUSD: weeklyDemandUSD * relationshipStrength,
            relationshipStrength,
          });
        });
      });
    });
  });

  return relationships;
}

export function distributeRealTargetByWeight(
  entities: { id: string; sizeWeight: number; targetPct: number }[],
  totalRealTargetUSD: number
): Map<string, number> {
  const weights = entities.map((e) => Math.max(0, e.sizeWeight * e.targetPct));
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const result = new Map<string, number>();
  entities.forEach((e, idx) => result.set(e.id, totalRealTargetUSD * (weights[idx] / weightSum)));
  return result;
}

export function attributeItemizedHoldings(
  sectorShareUSD: number,
  candidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[]
): ItemizedHolding[] {
  const sorted = [...candidates].sort((a, b) => b.outstandingUSD - a.outstandingUSD);
  let remaining = sectorShareUSD;
  const result: ItemizedHolding[] = [];
  for (const c of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(c.outstandingUSD * 0.4, remaining); // no single sector holds more than 40% of any one issue
    if (take > 0) {
      result.push({
        instrumentId: c.id,
        instrumentType: c.type,
        issuerRegion: c.region,
        quantityOrNotionalUSD: take,
      });
      remaining -= take;
    }
  }
  return result;
}

/**
 * Settles a corporate action against the people who actually hold the paper.
 *
 * When an issuer's debt stack changes — a tranche matures, refinances (possibly into a different
 * rate type, which moves the whole tranche between the bond market and the loan market), is
 * prepaid, or is consolidated by a merger — the amount of that issuer's paper in existence
 * changes. Whoever owned it has to change with it: matured paper leaves the holder's book, newly
 * issued paper is placed with the existing holder base pro rata.
 *
 * Without this, holdings and the real stock drift apart until they are unrelated. Measured before
 * this existed: by week 24, 130 of ~184 issuers had institutions holding MORE than the issuer's
 * entire remaining float, and since the clearing engine's price impact scales with flow over
 * float, trading those phantom positions against a shrunken (sometimes zero) float fanned
 * corporate spreads out to -1097/+1757bp and loan discount margins to -1783/+471bp. It is the
 * same defect that ran the two-year sovereign yield to 25% before 07c learned to redeem.
 *
 * Scaling by the ratio of new float to old preserves each holder's share of the issue exactly,
 * which is what a pro-rata redemption and a pro-rata placement do. An issuer going from no float
 * to some float is a genuinely new issue with no existing holder base to place into; the clearing
 * engine absorbs it over the following weeks.
 */
export function settleCorporateActionOnHolders(
  ctx: { pendingHolderSettlements: Map<string, number> },
  issuerId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY',
  oldFloatUSD: number,
  newFloatUSD: number
): void {
  if (!(oldFloatUSD > 0)) return;
  const ratio = Math.max(0, newFloatUSD) / oldFloatUSD;
  if (Math.abs(ratio - 1) < 1e-9) return;
  const key = `${instrumentType}:${issuerId}`;
  // Ratios compose: two actions on one instrument in one week scale the holders once, by the
  // product, which is the same number applying them in sequence would have reached.
  ctx.pendingHolderSettlements.set(key, (ctx.pendingHolderSettlements.get(key) ?? 1) * ratio);
}

/**
 * Apply every corporate action recorded this week to the real books, in ONE pass.
 *
 * This used to write through immediately, once per action: each call rebuilt the whole entity
 * array AND re-mapped every holding of every entity, to change the holdings of a single issuer.
 * Two calls per company across ~800 companies made it 12% of the entire weekly step — measured,
 * after the last optimization pass had guessed wrong about where the time was going. Nothing
 * inside stage 08 reads these books (it reads the pre-stage snapshot), so recording the ratios
 * and settling them once at the end of the stage is the same arithmetic at 1/800th the traversal.
 */
export function applyPendingCorporateActionSettlements(
  ctx: {
    updatedInstitutionalEntities: InstitutionalEntity[];
    pendingHolderSettlements: Map<string, number>;
    pendingHolderCashUSD?: Map<string, number>;
    /** SETL3/4: present once the settlement layer is live — the register's payments become real
     *  payments from the issuer rather than cash appearing on the holder's book. */
    paymentJournal?: import('./settlement').PaymentJournal;
    issuerTickerById?: Map<string, string>;
    /** §7.241: a payer-less credit (unmapped issuer) is counted here instead of being silent. */
    unbackedLedger?: import('../../ledger/balance').UnbackedLedger;
  }
): void {
  const pending = ctx.pendingHolderSettlements;
  const pendingCash = ctx.pendingHolderCashUSD;
  const hasCash = !!pendingCash && pendingCash.size > 0;
  if (pending.size === 0 && !hasCash) return;

  // SCALE: the pending keys are `${instrumentType}:${instrumentId}` strings; the walk below used
  // to REBUILD that string for every holding of every entity (two full passes of ~70k rows) just
  // to probe a map that holds a handful of actions. Split the keys apart once instead and probe
  // by the fields the row already carries — same lookups, no per-row strings. instrumentType
  // never contains ':', so splitting at the first colon inverts the key exactly.
  const splitKeys = (m: Map<string, number> | undefined): Map<string, Map<string, number>> => {
    const out = new Map<string, Map<string, number>>();
    m?.forEach((v, key) => {
      const at = key.indexOf(':');
      const type = key.slice(0, at);
      let inner = out.get(type);
      if (!inner) { inner = new Map(); out.set(type, inner); }
      inner.set(key.slice(at + 1), v);
    });
    return out;
  };
  const pendingByType = splitKeys(pending);
  const pendingCashByType = splitKeys(pendingCash);

  // Holders OF RECORD — the books as they stand before this week's actions scale them. A call
  // premium belongs to whoever owned the paper when it was called, so the shares are taken from
  // the pre-action notionals and the scaling happens after. Keyed by the same (type, id) pair.
  const preActionTotalByTypeId = new Map<string, Map<string, number>>();
  if (hasCash) {
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      entity.itemizedHoldings.forEach((h) => {
        const inner = pendingCashByType.get(h.instrumentType);
        if (!inner || !inner.has(h.instrumentId)) return;
        let totals = preActionTotalByTypeId.get(h.instrumentType);
        if (!totals) { totals = new Map(); preActionTotalByTypeId.set(h.instrumentType, totals); }
        totals.set(h.instrumentId, (totals.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
      });
    });
  }

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    // Cheap pre-scan: an entity holding none of the touched instruments is returned as-is —
    // the old path built (and threw away) a full copy of its holdings array to find that out.
    let anyHit = false;
    for (const h of entity.itemizedHoldings) {
      if (pendingByType.get(h.instrumentType)?.has(h.instrumentId)
        || pendingCashByType.get(h.instrumentType)?.has(h.instrumentId)) { anyHit = true; break; }
    }
    if (!anyHit) return entity;
    let touched = false;
    let cashUSD = 0;
    const newHoldings = entity.itemizedHoldings
      .map((h) => {
        if (hasCash) {
          const owedUSD = pendingCashByType.get(h.instrumentType)?.get(h.instrumentId);
          const totalUSD = preActionTotalByTypeId.get(h.instrumentType)?.get(h.instrumentId) ?? 0;
          if (owedUSD !== undefined && totalUSD > 0) {
            // SETL3/4: the holder's share of what the issuer owes. Paid AS A PAYMENT from the
            // issuer, so the money has a payer and a payee (rule 14) instead of appearing on the
            // holder's book while the issuer's ledger says it left.
            const shareUSD = owedUSD * (h.quantityOrNotionalUSD / totalUSD);
            const issuerTicker = ctx.issuerTickerById?.get(h.instrumentId);
            if (ctx.paymentJournal && issuerTicker) {
              journalPayment(ctx.paymentJournal, {
                payer: { kind: 'COMPANY', ticker: issuerTicker },
                payee: { kind: 'INSTITUTION', id: entity.id },
                amountUSD: shareUSD,
                reason: 'security payment to holder of record',
              });
            } else {
              // §7.241: an unmapped issuer used to credit the holder with NO payer, silently —
              // one measured feeder of 02b's reconcile plug. Still credited (deleting the
              // holder's money would break the other leg), but COUNTED now, like creditUnbacked.
              cashUSD += shareUSD;
              if (ctx.unbackedLedger) {
                ctx.unbackedLedger.totalUSD += Math.abs(shareUSD);
                ctx.unbackedLedger.byReason['security payment with unmapped issuer'] =
                  (ctx.unbackedLedger.byReason['security payment with unmapped issuer'] ?? 0) + shareUSD;
              }
            }
            touched = true;
          }
        }
        const ratio = pendingByType.get(h.instrumentType)?.get(h.instrumentId);
        if (ratio === undefined) return h;
        touched = true;
        // THE PRINCIPAL'S CASH LEG. A redemption is money: the issuer pays its lenders back and
        // their claim shrinks by exactly what they were paid. Before this, the notional simply
        // left the holder's book and arrived nowhere — a transfer from lenders to no one, and a
        // conservation break in the securities ledger sitting underneath every price the model
        // cleared against those books.
        //
        // Derived from the composed ratio rather than recorded separately, so it stays exact when
        // two actions hit one instrument in a week (the ratios multiply; the notional change is
        // whatever the product implies). Debt redeems at PAR, so the notional change IS the cash
        // — the call premium on top of it rides the explicit `pendingHolderCashUSD` path above,
        // and equity is excluded because a share is bought at a negotiated price rather than at
        // its carrying value (a take-private pays its own takeout, §7.43).
        //
        // The mirror case is a float INCREASE that did not come through the auction: paper placed
        // pro rata with the existing holder base, which they must pay for. WS8 primary issuance is
        // already netted out of this ratio by stage 08 (it inflates the pre-action float by the
        // market take), so what remains here is a genuine placement and it is charged, not gifted.
        const principalCashUSD = h.instrumentType === 'EQUITY'
          ? 0
          : h.quantityOrNotionalUSD * (1 - ratio);
        // CASH: and it comes FROM THE ISSUER, by name — the same route the premium above takes.
        // Crediting `cashUSD` here made the redemption money appear on the holder's book while
        // stage 08's ledger posted the issuer's side against the UNMODELED boundary: two halves
        // of one payment, neither of them attached to the other (rule 14). A float INCREASE runs
        // the same instruction backwards, because a placement is paid for.
        const principalIssuerTicker = ctx.issuerTickerById?.get(h.instrumentId);
        if (ctx.paymentJournal && principalIssuerTicker && Math.abs(principalCashUSD) > 0) {
          journalPayment(ctx.paymentJournal, principalCashUSD > 0
            ? {
              payer: { kind: 'COMPANY', ticker: principalIssuerTicker },
              payee: { kind: 'INSTITUTION', id: entity.id },
              amountUSD: principalCashUSD,
              reason: 'principal redeemed to holder of record',
            }
            : {
              payer: { kind: 'INSTITUTION', id: entity.id },
              payee: { kind: 'COMPANY', ticker: principalIssuerTicker },
              amountUSD: -principalCashUSD,
              reason: 'placement paid by holder of record',
            });
        } else {
          // §7.241: same counting as the coupon leg above — an unmapped issuer's redemption
          // money reached the holder with no payer; it is now visible on the unbacked ledger.
          cashUSD += principalCashUSD;
          if (ctx.unbackedLedger && principalCashUSD !== 0) {
            ctx.unbackedLedger.totalUSD += Math.abs(principalCashUSD);
            ctx.unbackedLedger.byReason['principal moved with unmapped issuer'] =
              (ctx.unbackedLedger.byReason['principal moved with unmapped issuer'] ?? 0) + principalCashUSD;
          }
        }
        return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD * ratio };
      })
      .filter((h) => h.quantityOrNotionalUSD > 1);
    if (!touched) return entity;
    return {
      ...entity,
      cashUSD: (entity.cashUSD ?? 0) + cashUSD,
      itemizedHoldings: newHoldings,
    };
  });
  pending.clear();
  pendingCash?.clear();
}

/**
 * Record cash an issuer owes its holders for a corporate action — the call premium. Settled pro
 * rata to holders of record by `applyPendingCorporateActionSettlements`.
 */
export function payHoldersCash(
  ctx: { pendingHolderCashUSD: Map<string, number> },
  issuerId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY',
  amountUSD: number
): void {
  if (!(amountUSD > 0)) return;
  const key = `${instrumentType}:${issuerId}`;
  ctx.pendingHolderCashUSD.set(key, (ctx.pendingHolderCashUSD.get(key) ?? 0) + amountUSD);
}

/**
 * CAL — INTEREST ACCRUES TO WHOEVER OWNS THE PAPER THAT WEEK, AND IS PAID ON THE COUPON DATE.
 *
 * This is the piece that makes a lumpy coupon safe on a register that trades. Interest is earned
 * continuously and paid discretely, and between the two dates it is a RECEIVABLE — so a holder
 * that sells mid-period keeps what it earned and the buyer earns only from the week it bought.
 * Real markets settle that in the trade price (a bond trades DIRTY: clean price plus accrued);
 * this model settles it on the register instead, which is the same economics and needs no clearing
 * adapter to know about coupons.
 *
 * Without it, paying the coupon to whoever happens to hold on the date would hand a one-week buyer
 * a half-year of interest and take it from the holder that earned it — a transfer the auction
 * never priced, and a standing incentive to own paper across coupon dates that nothing offsets.
 */
export function accrueHoldersInterest(
  ctx: { pendingHolderAccrualUSD: Map<string, number> },
  issuerId: string,
  // GOV_BOND is deliberately absent: a bank holds government paper on its own balance sheet and
  // is not on this register at all, so the sovereign accrual is keyed by PARTY instead and lives
  // in stages/sovereign-calendar.ts. One ledger per thing, not one register with a hole in it.
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER',
  weeklyAccrualUSD: number
): void {
  if (!(weeklyAccrualUSD > 0)) return;
  const key = `${instrumentType}:${issuerId}`;
  ctx.pendingHolderAccrualUSD.set(key, (ctx.pendingHolderAccrualUSD.get(key) ?? 0) + weeklyAccrualUSD);
}

/** CAL — the coupon date: what each holder accrued on this paper becomes cash, and the balance
 *  clears. The issuer pays exactly the sum of what it accrued, so the two sides cannot drift. */
export function payHoldersAccruedInterest(
  ctx: { pendingHolderAccrualPayout: Set<string> },
  issuerId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER'
): void {
  ctx.pendingHolderAccrualPayout.add(`${instrumentType}:${issuerId}`);
}

// SCALE: the ledger is NESTED — instrument, then holder — not keyed by a composite string.
// Flat, it cost a `${instrument}|${holder}` build per matched row (~105,000 a week) to write, and
// the coupon-date pass then walked ALL 105,000 entries and string-sliced each one to find the few
// whose instrument was actually due. Nested, the write is two map lookups and no string, and the
// payout visits only the instruments paying this week and their own holders.

/**
 * Run the week's accruals and coupon-date payouts over the register.
 *
 * The ACCRUAL walks holders of record and splits each issuer's weekly interest by what each one
 * holds; the PAYOUT walks the accrued balances themselves, because a holder that has sold out no
 * longer appears in the holdings and is still owed what it earned.
 */
export function applyHolderInterestAccruals(
  ctx: {
    updatedInstitutionalEntities: InstitutionalEntity[];
    pendingHolderAccrualUSD: Map<string, number>;
    pendingHolderAccrualPayout: Set<string>;
    holderAccruedInterestUSD: Map<string, Map<string, number>>;
    paymentJournal?: import('./settlement').PaymentJournal;
    issuerTickerById?: Map<string, string>;
    /** §7.241: a payer-less credit (unmapped issuer) is counted here instead of being silent. */
    unbackedLedger?: import('../../ledger/balance').UnbackedLedger;
  }
): void {
  const { pendingHolderAccrualUSD: accruals, pendingHolderAccrualPayout: payouts } = ctx;
  if (accruals.size > 0) {
    // SCALE: ONE pass over the register, not two. This walked every entity's every holding to
    // total the float, then walked all of them AGAIN to divide by it — building the same
    // `type:id` key string twice per holding, ~70k rows each way. The matching rows are collected
    // on the first pass and the second walks only those, which is the same arithmetic in the same
    // order on the same values.
    // SCALE: the accrual keys are `${instrumentType}:${instrumentId}`, and this REBUILT that
    // string for every holding of every entity — ~110,000 rows a week — to probe a map holding a
    // few thousand issuers. Split the keys by type once (the same trick
    // `applyPendingCorporateActionSettlements` already uses below) and the row is probed by the
    // fields it already carries: a row of a type that accrues nothing costs one map lookup that
    // misses, and no string at all. `instrumentType` never contains ':', so the split inverts the
    // key exactly.
    const accrualsByType = new Map<string, Map<string, number>>();
    accruals.forEach((v, key) => {
      const at = key.indexOf(':');
      const type = key.slice(0, at);
      let inner = accrualsByType.get(type);
      if (!inner) { inner = new Map(); accrualsByType.set(type, inner); }
      inner.set(key.slice(at + 1), v);
    });
    // SCALE: only the types that actually accrue are walked, through the CSR index — a flat pair
    // of Int32Arrays grouped by type, so an EQUITY or GOV_BOND row is not visited at all rather
    // than visited and rejected. Within a type the index preserves register order, so the float
    // totals accumulate in exactly the order the nested walk produced.
    // SCALE phase 2: reads the COLUMNS. The quantity comes out of a Float64Array and the
    // instrument out of an Int32Array, so a row of an accruing type costs two typed-array loads
    // and no object is touched at all. Within a type the table preserves register order, so the
    // float totals accumulate exactly as the original nested walk produced them.
    const totalByKey = new Map<string, number>();
    const matched: { entityId: string; key: string; qtyUSD: number }[] = [];
    const holdings = getHoldingsTable(ctx as never);
    const entities = ctx.updatedInstitutionalEntities;
    const byTypeRows = holdings.byType;
    const qtyCol = holdings.qtyUSD;
    const instCol = holdings.instrumentId;
    const entCol = holdings.entityRow;
    accrualsByType.forEach((byId, type) => {
      const [lo, hi] = holdings.typeRange(type as never);
      if (hi <= lo) return;
      // The accruing instruments are interned ONCE per type, so the row test below is an integer
      // compare against a dense array — not a string rebuilt from an id and looked up in a map,
      // which would have handed back with one hand what the columns give with the other.
      const accruingRow: string[] = [];
      byId.forEach((_v, instrumentText) => {
        const id = INSTRUMENT_IDS.peek(instrumentText);
        if (id >= 0) accruingRow[id] = instrumentText;
      });
      for (let i = lo; i < hi; i++) {
        const row = byTypeRows[i];
        const instrumentText = accruingRow[instCol[row]];
        if (instrumentText === undefined) continue;
        const key = `${type}:${instrumentText}`;
        const qtyUSD = qtyCol[row];
        totalByKey.set(key, (totalByKey.get(key) ?? 0) + qtyUSD);
        matched.push({ entityId: entities[entCol[row]].id, key, qtyUSD });
      }
    });
    matched.forEach(({ entityId, key, qtyUSD }) => {
      const weeklyUSD = accruals.get(key);
      const totalUSD = totalByKey.get(key) ?? 0;
      if (weeklyUSD === undefined || !(totalUSD > 0)) return;
      const shareUSD = weeklyUSD * (qtyUSD / totalUSD);
      if (!(shareUSD > 0)) return;
      let byHolder = ctx.holderAccruedInterestUSD.get(key);
      if (!byHolder) { byHolder = new Map(); ctx.holderAccruedInterestUSD.set(key, byHolder); }
      byHolder.set(entityId, (byHolder.get(entityId) ?? 0) + shareUSD);
    });
  }
  // THE ACCRUAL IS CONSUMED HERE, NOT AT THE BOTTOM. It used to be cleared only on the payout
  // path, so in a week when NO instrument's coupon fell due the early return below left the
  // accruals standing — and this function is called twice a week. Every holder accrued the same
  // week's interest TWICE, and the second call paid for the full register walk to do it.
  accruals.clear();

  if (payouts.size === 0) return;
  // Only the instruments whose coupon falls due this week, and only their own holders.
  payouts.forEach((instrumentKey) => {
    const byHolder = ctx.holderAccruedInterestUSD.get(instrumentKey);
    if (!byHolder) return;
    const issuerId = instrumentKey.slice(instrumentKey.indexOf(':') + 1);
    const ticker = ctx.issuerTickerById?.get(issuerId);
    if (!ticker || !ctx.paymentJournal) {
      // §7.241: the old path deleted every holder's accrued receivable even when the issuer
      // lookup missed and nothing was paid — an obligation extinguished without payment, silently.
      // The receivable now SURVIVES to the next payout date, and the miss is counted where the
      // money reports already look.
      if (ctx.unbackedLedger) {
        const owedUSD = Array.from(byHolder.values()).reduce((a, v) => a + Math.max(0, v), 0);
        ctx.unbackedLedger.byReason['coupon skipped: issuer unmapped'] =
          (ctx.unbackedLedger.byReason['coupon skipped: issuer unmapped'] ?? 0) + owedUSD;
      }
      return;
    }
    const payer = { kind: 'COMPANY', ticker } as import('./settlement').PartyRef;
    byHolder.forEach((accruedUSD, holderId) => {
      if (!(accruedUSD > 0)) return;
      journalPayment(ctx.paymentJournal!, {
        payer,
        payee: { kind: 'INSTITUTION', id: holderId },
        amountUSD: accruedUSD,
        reason: 'coupon payment',
      });
    });
    ctx.holderAccruedInterestUSD.delete(instrumentKey);
  });
  payouts.clear();
}

/**
 * The sovereign ladder's bucket vocabulary — bills below 2Y (WS5), bonds at the four standard
 * points. ONE function owns the mapping from a tranche's tenor to its bucket key: three separate
 * nearest-of-[2,5,10,30] reducers existed before bills did, and any one of them left unconverted
 * would have silently folded a 13-week bill into the two-year bucket.
 */
export const SOV_BILL_BUCKETS = [
  { key: 'b13', years: 0.25, weeks: 13 },
  { key: 'b26', years: 0.5, weeks: 26 },
  { key: 'b52', years: 1.0, weeks: 52 },
] as const;
export const SOV_BOND_BUCKET_YEARS = [2, 5, 10, 30] as const;
/** A tranche below this tenor is a bill; at or above, a bond. */
export const SOV_BILL_MAX_TENOR_YEARS = 1.5;

export function sovBucketKey(tenorAtIssuanceYears: number): string {
  if (tenorAtIssuanceYears < SOV_BILL_MAX_TENOR_YEARS) {
    const bucket = SOV_BILL_BUCKETS.reduce((best, b) =>
      Math.abs(b.years - tenorAtIssuanceYears) < Math.abs(best.years - tenorAtIssuanceYears) ? b : best);
    return bucket.key;
  }
  const years = SOV_BOND_BUCKET_YEARS.reduce((best, y) =>
    Math.abs(y - tenorAtIssuanceYears) < Math.abs(best - tenorAtIssuanceYears) ? y : best);
  return `t${years}`;
}

/**
 * The working-capital stock a company's own statements imply, as a share of revenue — the ONE
 * definition (WS5's CP sizing and WS7's treasury sweep both read it; it was a duplicated 0.08
 * literal before WS7 hoisted it here).
 */
export const WORKING_CAPITAL_SHARE_OF_REVENUE = 0.08;
