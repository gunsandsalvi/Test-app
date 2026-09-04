/**
 * Small pure helper functions shared by two or more weekly-step stages (credit spread /
 * rating-bucket demand premia, occupation labor demand, ownership-share targets, and
 * itemized-holdings attribution). Kept together here rather than duplicated per stage.
 */

import { journalPayment, partyId, PendingNetCtx } from './settlement';
import { DESK_BOOK_KIND } from '../../../domain/dealer-desk';
import { deskRowsOf } from '../../desk-register';
import type { EntityId } from '../../../domain/ids';
import { bankSecuritiesParty, bankSecuritiesPartyOf, companyPartyOf } from '../../../domain/party';
import { buildEntityIndex } from '../../ledger/entity-index';
import { currencyOf } from '../../../domain/geography';
import { defect } from '../../../domain/defect';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../../../engine2/holdings';
import { transferHolding, registerBooks } from '../../ledger/holdings-ledger';
import { bookPnL } from '../../ledger/bank-book';
import { revHistLen, revHistAt, rowOf, V2World, regionOf, typeOf, typeRefOf, instrumentRefOf } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, facilityBookOf, issuerIdOf } from '../../../engine2/tranches';
import { getHoldingsTable } from './register-index';
import { INSTRUMENT_IDS } from '../../columns/intern';
import { Company, SmePool, RegionId, ItemizedHolding, SupplyRelationship, InstitutionalEntity, OccupationType } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { SECTOR_OCCUPATION_MIX, GOVERNMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { INDUSTRY_REGISTRY } from '../../../domain/industry-registry';
import { bankRwaLocal, BANK_MIN_CAPITAL_RATIO } from '../../../domain/bank-pricing';
import { heldInShares } from '../../../domain/assets';
import { dealerDeskParticipantId, dealerDeskTicker } from '../../../domain/dealer-desk';

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
function annualEbitdaVol(v2: V2World, comp: Company): number {
  // The history reads the revenue ring: same entries, same order.
  const row = rowOf(v2, comp.id);
  const histLen = revHistLen(v2, row);
  if (histLen < 8) return MIN_ANNUAL_EBITDA_VOL;
  const rel: number[] = [];
  for (let i = 1; i < histLen; i++) {
    const prev = revHistAt(v2, row, i - 1);
    if (prev > 0) rel.push(revHistAt(v2, row, i) / prev - 1);
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
export function computeAnnualDefaultProbability(v2: V2World, comp: Company): number {
  // A BANK'S DEFAULT DISTANCE COMES OFF ITS OWN SHEET. Read through the corporate context it
  // collapses: `comp.cash` is ~0 for a bank (its money is cashReservesLocal) and `comp.ebitda` is
  // an accrual bridge that swings through zero on solvent banks, so the distance goes to ~0 and
  // a structurally wholesale-funded bank prices toward default with its capital intact.
  //
  // What a bank defaults on is CAPITAL: losses eating the buffer above the regulatory floor.
  // Every input is already measured — its own equity, its own risk-weighted book, and its book's
  // own annual loss rate (the same quantities its lending is priced with). The loss rate is the
  // σ-scale of the book's annual loss (a concentrated credit book's loss dispersion is of the
  // order of its expected loss), so the distance is "how many years of expected losses fit in
  // the buffer" — no new constant, and it degenerates loudly: a bank AT the floor prices at
  // PD ~0.5, which is what a bank at the floor is.
  if (comp.isBankEntity && comp.bankBalanceSheet) {
    const sheet = comp.bankBalanceSheet;
    const rwaLocal = Math.max(1, bankRwaLocal(sheet, facilityBookOf(v2, comp.id)));
    const bufferLocal = sheet.bankEquityLocal - rwaLocal * BANK_MIN_CAPITAL_RATIO;
    // The book's own measured provision rate (02b re-derives it weekly from the pools' real
    // default experience); the floor is consumerAnnualLossRate's own de-minimis.
    const lossRateAnnual = Math.max(0.005, sheet.loanLossProvisionRateAnnualPct ?? 0.01);
    const distance = bufferLocal / (rwaLocal * lossRateAnnual);
    return normalCdf(-distance);
  }
  // Ladder read on rows: fold order is chain order is array order.
  let interestSum = 0;
  {
    const TS = v2.tranches;
    for (const r of ladderRowsOf(v2, comp.id)) {
      const rate = !(TS.flags[r] & TR_FLOATING)
        ? (Number.isNaN(TS.couponRate[r]) ? 0.05 : TS.couponRate[r])
        : (0.05 + (Number.isNaN(TS.floatingMarginBps[r]) ? 200 : TS.floatingMarginBps[r]) / 10000);
      interestSum += TS.principalLocal[r] * rate;
    }
  }
  const interest = interestSum || 1;
  const ebitda = Math.max(1, comp.ebitda);

  const shockToCoverage = 1 - (DEFAULT_COVERAGE_FLOOR * interest) / ebitda;
  // Dividends live on the quarterly snapshot (there is no annual field on Company) — annualize
  // the latest quarter. Zero when no snapshot exists yet. The statement stores dividends the way
  // a cash flow statement does, as a NEGATIVE financing outflow; this needs the magnitude of the
  // outflow, so take the absolute value — added signed, it subtracted from fixed outflows and
  // made a dividend-paying company look SAFER for paying one.
  const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
  const dividendsAnnualLocal = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0) * 4;
  const fixedOutflowsLocal = interest + (comp.maintenanceCapex ?? 0) + dividendsAnnualLocal;
  const shockToCash = 1 - (fixedOutflowsLocal - Math.max(0, cashOf(v2, comp))) / ebitda;
  const distance = Math.max(shockToCoverage, shockToCash);

  return normalCdf(-distance / annualEbitdaVol(v2, comp));
}

/**
 * What a defaulted borrower's lenders get back.
 *
 * G5 made this an OUTPUT. A workout sells the issuer's real assets into the markets that would
 * buy them and pays the claims in the order they are owed (stages/estate-resolution.ts), and what
 * it actually recovers is recorded on the region. `creditRecoveryRate` below is the rolling mean
 * of those resolutions, so the loss the credit market PRICES is the loss it has SEEN — which
 * closes the one-default-model loop, whose hazard side lives beside it.
 *
 * The 0.4 survives as the prior: what a lender must assume before this world has resolved enough
 * defaults to have an opinion of its own.
 */
// The workout prior lives in domain/bank-pricing.ts (one owner); re-exported for its readers.
export { CREDIT_RECOVERY_RATE } from '../../../domain/bank-pricing';
import { CREDIT_RECOVERY_RATE } from '../../../domain/bank-pricing';
import { cashOf, entityCashOf, obligationCurrencyOf } from '../../ledger/accounts';
import { asInstrumentId, type InstrumentId, asEntityId } from '../../../domain/ids';
import type { TypeRef, InstrRef } from '../../../engine2/refs';
import { equityIssuerId } from '../../../domain/instrument-keys';
import type { Ticker } from '../../../domain/ids';


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
    (Object.keys(mix) as OccupationType[]).forEach((occ) => {
      demand[occ] += c.employeeCount * (mix[occ] ?? 0);
    });
  });

  (privateSegments || []).forEach(seg => {
    const mix = SECTOR_OCCUPATION_MIX[INDUSTRY_REGISTRY[seg.industry].sector as keyof typeof SECTOR_OCCUPATION_MIX];
    if (!mix) { demand.GENERAL += seg.employment; return; }
    (Object.keys(mix) as OccupationType[]).forEach((occ) => {
      demand[occ] += seg.employment * (mix[occ] ?? 0);
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

  // WHO MAKES THIS INPUT, ONCE. The line below used to re-derive that for every
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
        const weeklyDemandLocal = (customer.annualRevenue / 52) * intensity * line.revenueShare;
        suppliers.forEach(supplier => {
          const relationshipStrength = supplier.annualRevenue / totalSupplierRevenue;
          relationships.push({
            supplierCompanyId: supplier.id,
            customerCompanyId: customer.id,
            category: inputSubUnitId,
            weeklyVolumeLocal: weeklyDemandLocal * relationshipStrength,
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
  totalRealTargetLocal: number
): Map<string, number> {
  const weights = entities.map((e) => Math.max(0, e.sizeWeight * e.targetPct));
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const result = new Map<string, number>();
  entities.forEach((e, idx) => result.set(e.id, totalRealTargetLocal * (weights[idx] / weightSum)));
  return result;
}

export function attributeItemizedHoldings(
  sectorShareLocal: number,
  candidates: { id: InstrumentId; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingLocal: number }[]
): ItemizedHolding[] {
  const sorted = [...candidates].sort((a, b) => b.outstandingLocal - a.outstandingLocal);
  let remaining = sectorShareLocal;
  const result: ItemizedHolding[] = [];
  for (const c of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(c.outstandingLocal * 0.4, remaining); // no single sector holds more than 40% of any one issue
    if (take > 0) {
      result.push({
        instrumentId: c.id,
        instrumentType: c.type,
        issuerRegion: c.region,
        quantityOrNotionalLocal: take, units: take,
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
  /** The INSTRUMENT the rows name — a tranche id for the credit kinds (the register), the
   *  issuer's id for equity, and the issuer's id again for the named desks' credit positions
   *  (the paying agent's desk pass reads issuer keys; a register row never carries one). */
  instrumentId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY',
  oldFloatLocal: number,
  newFloatLocal: number
): void {
  if (!(oldFloatLocal > 0)) return;
  const ratio = Math.max(0, newFloatLocal) / oldFloatLocal;
  if (Math.abs(ratio - 1) < 1e-9) return;
  const key = `${instrumentType}:${instrumentId}`;
  // Ratios compose: two actions on one instrument in one week scale the holders once, by the
  // product, which is the same number applying them in sequence would have reached.
  ctx.pendingHolderSettlements.set(key, (ctx.pendingHolderSettlements.get(key) ?? 1) * ratio);
}

/**
 * The desk book each register instrument type trades in. A bank's desk is a holder of record
 * alongside the institutional register, so whatever an issuer pays its holders is owed to the
 * desks as well.
 */
const DESK_BOOK_BY_TYPE: Record<string, string> = {
  CORP_BOND: 'corporate bond',
  LEVERAGED_LOAN: 'leveraged loan',
  COMMERCIAL_PAPER: 'commercial paper',
  EQUITY: 'equity',
};

/**
 * What the banks' desks hold in one book, by the PAPER they hold and then by desk.
 *
 * The comment that stood here said a desk position names the ISSUER while a register row names a
 * tranche, and that the two key spaces are disjoint. It stopped being true when the desks' books
 * went per tranche (§5-FINALIZATION 13b), and the code below it never followed: it returns a map
 * keyed by `p.instrumentId` — a TRANCHE — and the caller looked every entry up by ISSUER id, so
 * **every tranche-keyed desk position missed and the desks accrued nothing**. The one path that
 * ever matched was an underwriting residual, which was stored under the issuer's id until §3.13's
 * row 1 gave it the deal's own tranche.
 *
 * Both sides name the same paper now, which is what the register was keyed by all along, so the
 * split below is per INSTRUMENT and the issuer never enters it.
 *
 * §9.13-CREDIT row 5 — AND WHAT IT RETURNS IS FACE. A desk's `inventoryLocal` is its position at
 * this week's MARK (`applyDealerDeskFills` writes `units × cleared price`), and the register side
 * of this split is a face. Splitting a coupon between them on those two numbers pays a desk a
 * share of the money it has at risk instead of a share of the paper it holds — and the credit
 * books have printed prices other than par since §9.13-CREDIT row 1, so it has been paying the
 * wrong split ever since. `units` is the paper.
 */
function deskHoldingsByInstrument(
  v2: V2World,
  companies: Company[] | undefined,
  book: string | undefined
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  if (!book) return out;
  const kind = DESK_BOOK_KIND[book];
  if (kind === undefined) return out;
  companies?.forEach((bank) => {
    if (!bank.isBankEntity || !bank.bankBalanceSheet) return;
    const deskId = dealerDeskParticipantId(bank.ticker);
    // §3.13-BOOK d3d: the desk's rows of this book's kind, off the register.
    deskRowsOf(v2, bank.id, kind).forEach((p) => {
      if (!(p.inventoryLocal > 0)) return;
      const faceLocal = p.units;
      if (!(faceLocal > 0)) return;
      let byDesk = out.get(p.instrumentId);
      if (!byDesk) { byDesk = new Map(); out.set(p.instrumentId, byDesk); }
      byDesk.set(deskId, (byDesk.get(deskId) ?? 0) + faceLocal);
    });
  });
  return out;
}

/** The payee behind a holder key on the register's accrual ledger: an institution, or a bank's
 *  securities desk where the key names one. */
/** §3.13-BOOK (c2b): the argument spans TWO id spaces — a desk's participant id
 *  (`<ticker>::DESK`) or a holder's entity id — so it stays a string, and the entity arm is
 *  reached only by ELIMINATION, once `dealerDeskTicker` has said this is not a desk. */
function holderPayee(holderId: string, bankIdOfTicker: (t: Ticker) => EntityId | undefined): import('./settlement').PartyRef {
  const ticker = dealerDeskTicker(holderId);
  const deskBankId = ticker !== undefined ? bankIdOfTicker(ticker) : undefined;
  // §3.13-BOOK (c-then-3b): a desk's participant id embeds its bank's TICKER, and a `PartyRef`
  // names that bank by entity id — so the crossing back is a lookup, handed in by the caller
  // that holds the index. A desk whose bank cannot be found is not a party at all.
  return deskBankId !== undefined
    ? bankSecuritiesPartyOf(deskBankId)
    : { kind: 'INSTITUTION', id: asEntityId(holderId) };
}

/**
 * A desk's coupon, premium or dividend is the bank's INCOME, not an asset swap: the cash lands
 * on its securities account and nothing leaves the book, so equity has to move with it or the
 * sheet stops closing. The principal legs beside it need no such write — paper out, cash in.
 */
function bookDeskIncome(companies: Company[] | undefined, byTicker: Map<Ticker, number>, reason: string): void {
  if (byTicker.size === 0) return;
  companies?.forEach((bank) => {
    const deltaLocal = byTicker.get(bank.ticker);
    if (!deltaLocal || !bank.bankBalanceSheet) return;
    bank.bankBalanceSheet = bookPnL(bank.bankBalanceSheet, deltaLocal, reason, bank.ticker);
  });
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
    v2: import('../../../engine2/world').V2World;
    updatedInstitutionalEntities: InstitutionalEntity[];
    pendingHolderSettlements: Map<string, number>;
    pendingHolderCashLocal?: Map<string, number>;
    /** `kind:oldTrancheId` → the replacement tranche (an accretive call). */
    pendingHolderReplacements?: Map<string, InstrumentId>;
    /** The issuers, so an equity payment can check its holders against the issue and name the
     *  payer. (It used to be here to find the shares the register did NOT hold — the "public
     *  float" — which §9.13-EQUITY removed by giving that holder rows.) */
    updatedCompanies?: Company[];
  } & PendingNetCtx
): void {
  const pending = ctx.pendingHolderSettlements;
  const pendingCash = ctx.pendingHolderCashLocal;
  const hasCash = !!pendingCash && pendingCash.size > 0;
  if (pending.size === 0 && !hasCash) return;

  // The pending keys are `${instrumentType}:${instrumentId}` strings. Split them apart once so
  // the walk below probes by the fields the row already carries rather than rebuilding the
  // string per row; instrumentType never contains ':', so the split inverts the key exactly.
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

  // The pending instruments translate to interned pairs ONCE; every row is then probed by one
  // integer key. An instrument never interned has no rows and drops out here.
  const v2 = ctx.v2;
  const H = v2.holdings;
  // §3.13-BOOK slice (b): this was ONE helper serving two spaces — a type tag and an instrument
  // id — which is exactly what the ref split exists to stop. The pair key below is a legitimate
  // COMPOSITE of the two, and it stays valid only while an instrument ref fits in 22 bits.
  const pairOf = (t: TypeRef, i: InstrRef): number => t * 0x400000 + i;
  // An instrument is a tranche or its issuer; the issuer's ticker is one read either way.
  // §3.13-BOOK (c-then-2): read off the entity index rather than a `Map<id, ticker>` mirror that
  // had to be hand-registered at every firm birth to stay complete.
  const { companyById } = buildEntityIndex(ctx.updatedCompanies ?? [], []);
  // §3.13-BOOK (c-then-3b): the issuer's ENTITY id — what a `PartyRef` names it by.
  const issuerPartyIdOf = (instrumentId: string): EntityId | undefined =>
    companyById.get(issuerIdOf(v2, instrumentId))?.id;
  const pairKeyOf = (r: number): number => pairOf(H.typeRef[r], H.instrRef[r]);
  const toPairs = (byType: Map<string, Map<string, number>>): Map<number, number> => {
    const out = new Map<number, number>();
    byType.forEach((byId, type) => {
      const t = typeRefOf(v2, type);
      if (t < 0) return;
      byId.forEach((v, id) => {
        const i = instrumentRefOf(v2, asInstrumentId(id));
        if (i >= 0) out.set(pairOf(t, i), v);
      });
    });
    return out;
  };
  const ratioByPair = toPairs(pendingByType);
  const owedByPair = toPairs(pendingCashByType);
  const equityRef = typeRefOf(v2, 'EQUITY');
  // A replaced tranche: its retired rows become rows of the replacement, with no cash.
  const replacedNewIdByPair = new Map<number, InstrumentId>();
  ctx.pendingHolderReplacements?.forEach((newId, key) => {
    const at = key.indexOf(':');
    const t = typeRefOf(v2, key.slice(0, at));
    const i = instrumentRefOf(v2, asInstrumentId(key.slice(at + 1)));
    if (t >= 0 && i >= 0) replacedNewIdByPair.set(pairOf(t, i), newId);
  });

  // THE DESKS ARE HOLDERS OF RECORD TOO. A retirement or placement scales a named desk's
  // position in the issuer's paper by the same ratio as the register's rows, with the same cash
  // leg (the issuer redeems, or is paid) and the paper wired against the house. Otherwise the
  // desks' positions stand until the next auction's paydown catches them up a week late, and
  // the clearing house is short by exactly the desks' share of each week's retirements.
  if (ctx.updatedCompanies && ctx.paymentJournal) {
    const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
    pendingByType.forEach((byId, type) => {
      const book = type === 'CORP_BOND' || type === 'LEVERAGED_LOAN' ? DESK_BOOK_BY_TYPE[type] : undefined;
      if (!book) return;
      const deskKind = DESK_BOOK_KIND[book];
      ctx.updatedCompanies!.forEach((bank) => {
        if (!bank.isBankEntity || !bank.bankBalanceSheet || deskKind === undefined) return;
        // §3.13-BOOK d3d: the desk's rows, off the register — the transfer IS the row's move.
        deskRowsOf(ctx.v2, bank.id, deskKind).forEach((p) => {
          const ratio = byId.get(p.instrumentId);
          if (ratio === undefined || !(p.inventoryLocal > 0) || Math.abs(ratio - 1) < 1e-9) return;
          const issuerTicker = issuerPartyIdOf(p.instrumentId);
          const issuerRegion = companyById.get(issuerIdOf(v2, p.instrumentId))?.region;
          if (!issuerTicker || !issuerRegion) return;
          const deltaLocal = p.inventoryLocal * (ratio - 1);
          const house = { kind: 'CLEARING_HOUSE' as const, region: issuerRegion };
          const desk = bankSecuritiesParty(bank);
          const spec = { instrumentType: type as ItemizedHolding['instrumentType'], instrumentId: p.instrumentId, issuerRegion, valueLocal: Math.abs(deltaLocal), units: Math.abs(p.units * (ratio - 1)) };
          if (deltaLocal < 0) {
            journalPayment(ctx, { payer: companyPartyOf(issuerTicker), payee: desk, amount: -deltaLocal, currency: currencyOf(issuerRegion), reason: 'principal redeemed to holder of record' });
            transferHolding(ctx.v2, desk, house, spec, 'corporate action: desk paper retired pro rata');
          } else {
            journalPayment(ctx, { payer: desk, payee: companyPartyOf(issuerTicker), amount: deltaLocal, currency: currencyOf(issuerRegion), reason: 'placement paid by holder of record' });
            transferHolding(ctx.v2, house, desk, spec, 'corporate action: desk paper placed pro rata');
          }
        });
      });
    });
  }

  // Holders OF RECORD — the books as they stand before this week's actions scale them. A call
  // premium belongs to whoever owned the paper when it was called, so the shares are taken from
  // the pre-action notionals and the scaling happens after.
  // ONE walk per book: the holders-of-record totals and the touched-entity scan read the same
  // rows in the same entity and chain order, so they are fused. When no cash is owed the walk
  // can stop at the first hit instead.
  const totalByPair = new Map<number, number>();
  // The desks' books for the types this week's cash actions touch. §3.13 row 2: a desk position
  // names THE SAME PAPER a register row does, for credit exactly as for equity, so there is one
  // key and no roll-up. What stood here spread an issuer-keyed desk position across that issuer's
  // tranches — an issuer's register total carried beside every tranche's, a per-row issuer
  // resolution to build it, and a scale-down at the payment — all of it to bridge two key spaces
  // that stopped being different in 13b, and none of it ever matching (see
  // `deskHoldingsByInstrument`).
  const deskByInstrumentByType = new Map<string, Map<string, Map<string, number>>>();
  if (hasCash) {
    pendingCashByType.forEach((_byId, type) => {
      deskByInstrumentByType.set(type, deskHoldingsByInstrument(v2, ctx.updatedCompanies, DESK_BOOK_BY_TYPE[type]));
    });
  }
  // §9.13-EQUITY — THE WALK IS OVER REGISTER BOOKS, NOT OVER INSTITUTIONS. The household sector
  // holds real rows now, and a corporate action reaches every holder of record or it reaches none:
  // a buyback that scaled the institutions and left the households whole would hand the household
  // sector a larger share of the company for free, and `O2` would report the register above the
  // issue. The institutions come first and in order, so the entity array is rebuilt off the same
  // hit flags below.
  const books = registerBooks(ctx.updatedInstitutionalEntities.map((e) => e.id), ctx.updatedCompanies ?? []);
  const entityHit: boolean[] = new Array(books.length);
  books.forEach((entity, ei) => {
    let anyHit = false;
    if (hasCash) {
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
        const k = pairKeyOf(r);
        const owed = owedByPair.has(k);
        if (owed) totalByPair.set(k, (totalByPair.get(k) ?? 0) + rowUnits(H, r));
        if (!anyHit && (owed || ratioByPair.has(k))) anyHit = true;
      }
    } else {
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
        if (ratioByPair.has(pairKeyOf(r))) { anyHit = true; break; }
      }
    }
    entityHit[ei] = anyHit;
  });
  // EVERY HOLDER OF RECORD OF A CASH ACTION, AND ONLY THEM. Two kinds hold the paper an issuer
  // is paying on: the REGISTER — the institutions and, since §9.13-EQUITY, the household sector,
  // both walked as books — and the banks' DESKS, which hold on their own sheets. The denominator
  // is both, so each is paid its own share. Before this the desks were left out of the split and
  // the payment and their share went to the other holders; and the households were paid by
  // subtraction, under a second name, because they had no rows to be paid on.
  const denomByPair = new Map<number, number>();
  const deskIncomeByTicker = new Map<Ticker, number>();
  if (hasCash && ctx.updatedCompanies) {
    const { companyById, companyByTicker: cbt2 } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
    const bankIdOfTicker = (t: Ticker) => cbt2.get(t)?.id;
    pendingCashByType.forEach((byId, type) => {
      const t = typeRefOf(v2, type);
      if (t < 0) return;
      const deskByInstrument = deskByInstrumentByType.get(type);
      byId.forEach((owedLocal, instrumentId) => {
        const i = instrumentRefOf(v2, asInstrumentId(instrumentId));
        if (i < 0) return;
        const k = pairOf(t, i);
        const registerLocal = totalByPair.get(k) ?? 0;
        // §3.13-BOOK (c2a): an EQUITY row's instrument id IS its issuer's; anything else asks
        // the tranche store. Two spaces, one line, and now it says which is which.
        const issuerId = t === equityRef ? equityIssuerId(asInstrumentId(instrumentId)) : issuerIdOf(v2, instrumentId);
        const issuer = companyById.get(issuerId);
        const issuerTicker = issuerPartyIdOf(issuerId);
        // Every desk holds the named instrument itself — the action names one piece of paper and
        // so does the position.
        const byDesk = deskByInstrument?.get(instrumentId);
        let deskLocal = 0;
        byDesk?.forEach((usd) => { deskLocal += usd; });
        // §9.13-CREDIT row 5 — THE WHOLE SPLIT IS IN THE INSTRUMENT'S OWN UNIT: face for credit,
        // SHARES for equity. It used to be in money on the register's side, the desks' MARKED
        // money on theirs, and market cap for the issue — three numbers that agree only while
        // every one of them is struck at the same price, which stopped being true the week the
        // credit books started printing one. The ratios are the same arithmetic in shares as in
        // dollars; what changes is that they cannot come apart.
        // §9.13-EQUITY — THE DENOMINATOR IS THE HOLDERS, and the household sector is one of them.
        // `registerLocal` includes its book now, so the issue and the sum of the holders agree by
        // construction and the `max` is a GUARD rather than a source: a company whose holders do
        // not add up to its issue has a defect in the register, and paying the difference to
        // somebody would hide it. `O2` owns that comparison.
        const issuedLocal = t === equityRef && issuer ? Math.max(0, issuer.sharesOutstanding) : 0;
        const denomLocal = Math.max(registerLocal + deskLocal, issuedLocal);
        if (!(denomLocal > 0)) return;
        denomByPair.set(k, denomLocal);
        if (!issuerTicker || !ctx.paymentJournal) return;
        const payer = companyPartyOf(issuerTicker);
        // §9.13-EQUITY — THE REASON SAYS WHICH PAYMENT THIS IS. Every holder of record used to be
        // paid under one reason while the household sector was paid its share under a second
        // ("dividend to the public float"), and the household income line read THAT string. With
        // households on the register there is one payment, so the reason has to distinguish a
        // DIVIDEND from a call premium instead — which it should have done anyway, since the flow
        // ledgers are keyed by it.
        const paymentReason = t === equityRef ? 'dividend to holder of record' : 'security payment to holder of record';
        if (deskLocal > 0) {
          byDesk?.forEach((usd, deskId) => {
            const amountLocal = owedLocal * (usd / denomLocal);
            if (!(amountLocal > 0)) return;
            journalPayment(ctx, {
              payer, payee: holderPayee(deskId, bankIdOfTicker), amount: amountLocal,
              // The paper's own money, off the ISSUER — which is the payer here. Read from the
              // party rather than from `issuer`, which is `undefined` for every non-equity
              // instrument at this site and would have thrown the moment a credit desk was paid.
              currency: obligationCurrencyOf(ctx.v2, payer), reason: paymentReason,
            });
            const deskTicker = dealerDeskTicker(deskId);
            if (deskTicker !== undefined) deskIncomeByTicker.set(deskTicker, (deskIncomeByTicker.get(deskTicker) ?? 0) + amountLocal);
          });
        }
        // §9.13-EQUITY — "THE PUBLIC FLOAT" IS GONE, and it was never a second holder. It was
        // `denom − register − desks`: the household sector under a second name (rule 4), paid by
        // subtraction because there was no holder of record to pay. The households now hold rows
        // and are paid on the walk below like everybody else, so this term is zero by
        // construction — and where it is NOT zero the shares belong to nobody, which is a defect
        // for `O2` to report and not money to hand out.
        const unheldLocal = denomLocal - registerLocal - deskLocal;
        if (unheldLocal > 1 && issuer && process.env.FLOAT_TRACE === '1') {
          console.log(`  [float] ${issuer.ticker} ${(unheldLocal / Math.max(1, denomLocal) * 100).toFixed(2)}% of the issue is on no book`);
        }
      });
    });
    bookDeskIncome(ctx.updatedCompanies, deskIncomeByTicker, 'security payment on desk inventory');
  }

  books.forEach((entity, ei) => {
    if (!entityHit[ei]) return;
    let touched = false;
    // Placements this entity has funded within THIS pass — journalPayment does not update the
    // running settlement net, so two placements in one week must see each other here.
    let committedPlacementLocal = 0;
    const kept: number[] = [];
    // The action per instrument — what every row of it sheds (or gains) at its own funded
    // ratio, summed — becomes ONE retirement or placement wire against the issuer. Per row it
    // would mint a placement N-fold, because the ledger scales every row of the instrument.
    const actions = new Map<string, { type: ItemizedHolding['instrumentType']; id: InstrumentId; region: RegionId; retiredLocal: number; retiredSh: number; placedLocal: number; placedSh: number; anyShares: boolean }>();
    for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
      const k = pairKeyOf(r);
      if (hasCash) {
        const owedLocal = owedByPair.get(k);
        const totalLocal = totalByPair.get(k) ?? 0;
        if (owedLocal !== undefined && totalLocal > 0) {
          // The holder's share of what the issuer owes, paid AS A PAYMENT from the issuer, so
          // the money has a payer and a payee instead of appearing on the holder's book while
          // the issuer's ledger says it left.
          const shareLocal = owedLocal * (rowUnits(H, r) / (denomByPair.get(k) ?? totalLocal));
          const issuerTicker = issuerPartyIdOf(instrumentIdAt(v2, r));
          // A holder paid by an issuer nobody can name is money from nobody: a defect at the
          // site that recorded the action, never a credit.
          if (!ctx.paymentJournal || !issuerTicker) {
            defect(`security payment of ${(shareLocal / 1e6).toFixed(3)}M to ${entity.id} from an issuer with no ticker (${instrumentIdAt(v2, r)})`);
          }
          journalPayment(ctx, {
            payer: companyPartyOf(issuerTicker),
            payee: entity.payee,
            amount: shareLocal,
            currency: currencyOf(regionOf(v2, H.regionRef[r]) as RegionId),
            reason: H.typeRef[r] === equityRef ? 'dividend to holder of record' : 'security payment to holder of record',
          });
          touched = true;
        }
      }
      const ratio = ratioByPair.get(k);
      if (ratio === undefined) {
        if (H.qtyLocal[r] > 1) kept.push(r);
        continue;
      }
      touched = true;
      // THE PRINCIPAL'S CASH LEG. A redemption is money: the issuer pays its lenders back and
      // their claim shrinks by exactly what they were paid. Derived from the composed ratio so
      // it stays exact when two actions hit one instrument in a week; debt redeems at PAR, so
      // the notional change IS the cash — the call premium rides `pendingHolderCashLocal` above,
      // and equity is excluded, because a share is bought at a negotiated price.
      let principalCashLocal = H.typeRef[r] === equityRef ? 0 : rowUnits(H, r) * (1 - ratio);
      // A replaced tranche's retired slice is re-keyed onto the replacement below, not redeemed.
      if (replacedNewIdByPair.has(k)) principalCashLocal = 0;
      // A PLACEMENT IS TAKEN UP ONLY AS FAR AS THE CASH REACHES. A holder
      // short of cash declines the unaffordable slice — its holding grows by only the share it
      // funded, and the issuer's proceeds shrink by the same amount on the same instruction.
      let effectiveRatio = ratio;
      if (principalCashLocal < 0) {
        const pendingLocal = ctx.pendingNetById
          ? (ctx.pendingNetById[partyId(entity.payee)] ?? 0)
          : 0;
        const availableLocal = Math.max(0, entityCashOf(v2, entity) + pendingLocal
          - committedPlacementLocal);
        const owedLocal = -principalCashLocal;
        const fundedShare = owedLocal > 0 ? Math.min(1, availableLocal / owedLocal) : 1;
        if (fundedShare < 1) {
          effectiveRatio = 1 + (ratio - 1) * fundedShare;
          principalCashLocal = -owedLocal * fundedShare;
        }
        committedPlacementLocal += -principalCashLocal;
      }
      // CASH: and it comes FROM THE ISSUER, by name — a float INCREASE runs the same
      // instruction backwards, because a placement is paid for.
      const principalIssuerTicker = issuerPartyIdOf(instrumentIdAt(v2, r));
      if (ctx.paymentJournal && principalIssuerTicker && Math.abs(principalCashLocal) > 0) {
        journalPayment(ctx, principalCashLocal > 0
          ? {
            payer: companyPartyOf(principalIssuerTicker),
            payee: entity.payee,
            amount: principalCashLocal,
            currency: currencyOf(regionOf(v2, H.regionRef[r]) as RegionId),
            reason: 'principal redeemed to holder of record',
          }
          : {
            payer: entity.payee,
            payee: companyPartyOf(principalIssuerTicker),
            amount: -principalCashLocal,
            currency: currencyOf(regionOf(v2, H.regionRef[r]) as RegionId),
            reason: 'placement paid by holder of record',
          });
      } else if (principalCashLocal !== 0) {
        // Principal moving with no named issuer is money from (or to) nobody.
        defect(`principal of ${(principalCashLocal / 1e6).toFixed(3)}M moved for ${entity.id} on an instrument with no issuer ticker`);
      }
      // The action is a wire against the issuer — retired below one, placed above
      // — applied by the ledger after this read of the rows (it scales shares with notional,
      // and unlinks what empties).
      {
        const id = instrumentIdAt(v2, r);
        const type = typeOf(v2, H.typeRef[r]) as ItemizedHolding['instrumentType'];
        const key = `${type}|${id}`;
        let a = actions.get(key);
        if (!a) { a = { type, id, region: regionOf(v2, H.regionRef[r]) as RegionId, retiredLocal: 0, retiredSh: 0, placedLocal: 0, placedSh: 0, anyShares: false }; actions.set(key, a); }
        const dLocal = H.qtyLocal[r] * (effectiveRatio - 1);
        const dSh = Number.isNaN(H.shares[r]) ? Number.NaN : H.shares[r] * (effectiveRatio - 1);
        if (!Number.isNaN(dSh)) a.anyShares = true;
        if (dLocal < 0) { a.retiredLocal -= dLocal; if (!Number.isNaN(dSh)) a.retiredSh -= dSh; }
        else { a.placedLocal += dLocal; if (!Number.isNaN(dSh)) a.placedSh += dSh; }
      }
      kept.push(r);
    }
    if (!touched) return entity;
    // The replacement's rows — what the called tranche's rows shed, placed on the same
    // holders under the new id (its issuer's wire put it at the house, `replacement issue`).
    [...actions.values()].forEach((a) => {
      const t = typeRefOf(v2, a.type), i = instrumentRefOf(v2, a.id);
      if (t < 0 || i < 0) return;
      const newId = replacedNewIdByPair.get(t * 0x400000 + i);
      if (newId === undefined || !(a.retiredLocal > 0)) return;
      const key = `${a.type}|${newId}`;
      let b = actions.get(key);
      if (!b) { b = { type: a.type, id: newId, region: a.region, retiredLocal: 0, retiredSh: 0, placedLocal: 0, placedSh: 0, anyShares: false }; actions.set(key, b); }
      b.placedLocal += a.retiredLocal;
    });
    actions.forEach((a) => {
      // The register side settles through the region's CLEARING HOUSE — the paying
      // agent. The issuer's own wire is the LADDER's (house → issuer at retirement, issuer → house
      // at placement, the tranche ledger), so the two sides of one action meet at the house and
      // the issuer's wires count once. Equity (no ladder) settles the same way for symmetry.
      const house = { kind: 'CLEARING_HOUSE' as const, region: a.region };
      const holder = entity.payee;
      // Equity has no ladder, so its issuer's side of the action is
      // wired HERE — a buyback returns the shares from the house to the issuer, a placement
      // creates them from the issuer to the house — and the house nets to zero on equity too.
      const equityIssuerTicker = heldInShares(a.type) ? issuerPartyIdOf(a.id) : undefined;
      if (a.retiredLocal > 0) {
        const spec = { instrumentType: a.type, instrumentId: a.id, issuerRegion: a.region, valueLocal: a.retiredLocal, shares: a.anyShares ? a.retiredSh : undefined };
        transferHolding(v2, holder, house, spec, 'corporate action: paper retired pro rata');
        if (equityIssuerTicker) transferHolding(v2, house, companyPartyOf(equityIssuerTicker), spec, 'corporate action: shares retired by the issuer');
      }
      if (a.placedLocal > 0) {
        const spec = { instrumentType: a.type, instrumentId: a.id, issuerRegion: a.region, valueLocal: a.placedLocal, shares: a.anyShares ? a.placedSh : undefined };
        if (equityIssuerTicker) transferHolding(v2, companyPartyOf(equityIssuerTicker), house, spec, 'corporate action: shares placed by the issuer');
        transferHolding(v2, house, holder, spec, 'corporate action: paper placed pro rata');
      }
    });
    void kept;
  });
  // The entity objects a book touched are replaced, exactly as the old `map` did — the household
  // books have no object to replace, because the rows are their only representation.
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e, i) => (entityHit[i] ? { ...e } : e));
  pending.clear();
  pendingCash?.clear();
  ctx.pendingHolderReplacements?.clear();
}

/**
 * Record cash an issuer owes its holders for a corporate action — the call premium. Settled pro
 * rata to holders of record by `applyPendingCorporateActionSettlements`.
 */
export function payHoldersCash(
  ctx: { pendingHolderCashLocal: Map<string, number> },
  /** The instrument the rows name — a tranche id for the credit kinds, the issuer for equity. */
  instrumentId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'EQUITY',
  amountLocal: number
): void {
  if (!(amountLocal > 0)) return;
  const key = `${instrumentType}:${instrumentId}`;
  ctx.pendingHolderCashLocal.set(key, (ctx.pendingHolderCashLocal.get(key) ?? 0) + amountLocal);
}

/**
 * INTEREST ACCRUES TO WHOEVER OWNS THE PAPER THAT WEEK, AND IS PAID ON THE COUPON DATE.
 *
 * This is the piece that makes a lumpy coupon safe on a register that trades. Interest is earned
 * continuously and paid discretely, and between the two dates it is a RECEIVABLE — so a holder
 * that sells mid-period keeps what it earned and the buyer earns only from the week it bought.
 * §3.13b: the SETTLEMENT of that is in the trade, as it is in a real market — a bond trades DIRTY,
 * so the buyer pays the seller the accrued on top of the clean price and the balance re-keys with
 * the face (`moveCorporateAccrued`, `book-settlement.ts:accruedOnFills`). This walk is what
 * decides how much each holder has earned; the trade is what pays for it.
 *
 * Without it, paying the coupon to whoever happens to hold on the date would hand a one-week buyer
 * a half-year of interest and take it from the holder that earned it — a transfer the auction
 * never priced, and a standing incentive to own paper across coupon dates that nothing offsets.
 */
export function accrueHoldersInterest(
  ctx: { pendingHolderAccrualLocal: Map<string, number> },
  /** The TRANCHE the rows name, so a tranche's coupon reaches its own holders exactly. */
  instrumentId: string,
  // GOV_BOND is deliberately absent: a bank holds government paper on its own balance sheet and
  // is not on this register at all, so the sovereign accrual is keyed by PARTY instead and lives
  // in stages/sovereign-calendar.ts. One ledger per thing, not one register with a hole in it.
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER',
  weeklyAccrualLocal: number
): void {
  if (!(weeklyAccrualLocal > 0)) return;
  const key = `${instrumentType}:${instrumentId}`;
  ctx.pendingHolderAccrualLocal.set(key, (ctx.pendingHolderAccrualLocal.get(key) ?? 0) + weeklyAccrualLocal);
}

/**
 * §3.13b / `../../../../docs/instruments/bond.md` N9.b — THE ACCRUED RE-KEYS WHEN THE PAPER MOVES,
 * on the corporate register. The twin of `sovereign-calendar.ts:moveSovereignAccrued`, and the
 * other half of the cash leg `book-settlement.ts:accruedOnFills` settles: a quoted price is a
 * CLEAN price, the buyer pays the seller what has run since the last coupon date, and the BALANCE
 * has to move with the face or the coupon date pays it to the seller a second time.
 *
 * The holder key is the CLEARING PARTICIPANT's id, which is what the weekly accrual walk already
 * keys by — an institution's own id, or a desk's participant id — so a balance moved here is a
 * balance that walk will find. A balance that reaches zero leaves the ledger, exactly as the
 * payout path leaves it.
 */
export function moveCorporateAccrued(
  holderAccruedInterestLocal: Map<string, Map<string, number>>,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER',
  instrumentId: string,
  holderKey: string,
  deltaLocal: number
): void {
  if (!Number.isFinite(deltaLocal) || deltaLocal === 0) return;
  const key = `${instrumentType}:${instrumentId}`;
  let byHolder = holderAccruedInterestLocal.get(key);
  if (!byHolder) { byHolder = new Map(); holderAccruedInterestLocal.set(key, byHolder); }
  const next = (byHolder.get(holderKey) ?? 0) + deltaLocal;
  if (next === 0) byHolder.delete(holderKey); else byHolder.set(holderKey, next);
  if (byHolder.size === 0) holderAccruedInterestLocal.delete(key);
}

/** The coupon date: what each holder accrued on this paper becomes cash, and the balance
 *  clears. The issuer pays exactly the sum of what it accrued, so the two sides cannot drift. */
export function payHoldersAccruedInterest(
  ctx: { pendingHolderAccrualPayout: Set<string> },
  /** The tranche whose coupon falls due. */
  instrumentId: string,
  instrumentType: 'CORP_BOND' | 'LEVERAGED_LOAN' | 'COMMERCIAL_PAPER'
): void {
  ctx.pendingHolderAccrualPayout.add(`${instrumentType}:${instrumentId}`);
}

// The ledger is NESTED — instrument, then holder — not keyed by a composite string: the write
// is two map lookups and no string, and the payout visits only the instruments paying this week
// and their own holders.

/**
 * Run the week's accruals and coupon-date payouts over the register.
 *
 * The ACCRUAL walks holders of record and splits each issuer's weekly interest by what each one
 * holds; the PAYOUT walks the accrued balances themselves, because a holder that has sold out no
 * longer appears in the holdings and is still owed what it earned.
 */
/** COUPON_TRACE=1 — the week's register interest by instrument type: what accrued, what fell
 *  due and was paid, what is still owed, and how much of each belongs to the banks' desks
 *  rather than the institutional register. */
const COUPON_TRACE = process.env.COUPON_TRACE === '1';

export function applyHolderInterestAccruals(
  ctx: {
    v2: V2World;
    updatedInstitutionalEntities: InstitutionalEntity[];
    pendingHolderAccrualLocal: Map<string, number>;
    pendingHolderAccrualPayout: Set<string>;
    holderAccruedInterestLocal: Map<string, Map<string, number>>;
    /** The banks, so the desks holding an issuer's paper accrue their share of its coupon. */
    updatedCompanies?: Company[];
    nextWeek?: number;
  } & PendingNetCtx
): void {
  const traceAccruedLocal = new Map<string, number>();
  const tracePaidLocal = new Map<string, number>();
  const traceDeskAccruedLocal = new Map<string, number>();
  const traceDeskPaidLocal = new Map<string, number>();
  const traceAdd = (m: Map<string, number>, type: string, usd: number): void => {
    m.set(type, (m.get(type) ?? 0) + usd);
  };
  if (COUPON_TRACE) {
    ctx.pendingHolderAccrualLocal.forEach((usd, key) => traceAdd(traceAccruedLocal, key.slice(0, key.indexOf(':')), usd));
  }
  const { pendingHolderAccrualLocal: accruals, pendingHolderAccrualPayout: payouts } = ctx;
  if (accruals.size > 0) {
    // The accrual keys are `${instrumentType}:${instrumentId}`. Splitting them by type once lets
    // the row loops below probe by the fields a row already carries, with no per-row string;
    // `instrumentType` never contains ':', so the split inverts the key exactly.
    const accrualsByType = new Map<string, Map<string, number>>();
    accruals.forEach((v, key) => {
      const at = key.indexOf(':');
      const type = key.slice(0, at);
      let inner = accrualsByType.get(type);
      if (!inner) { inner = new Map(); accrualsByType.set(type, inner); }
      inner.set(key.slice(at + 1), v);
    });
    // Only the types that actually accrue are walked, and they are walked as columns: the
    // register is grouped by type, so a row costs two typed-array loads and touches no object.
    // Within a type the table preserves register order, so every float accumulates in the same
    // order — and to the same value — whichever pass reads it.
    const deskHoldings = new Map<string, Map<string, Map<string, number>>>();
    accrualsByType.forEach((_byId, type) => {
      deskHoldings.set(type, deskHoldingsByInstrument(ctx.v2, ctx.updatedCompanies, DESK_BOOK_BY_TYPE[type]));
    });
    const holdings = getHoldingsTable(ctx);
    const entities = ctx.updatedInstitutionalEntities;
    // Resolved once, so the row loop reads a dense string array rather than dereferencing an
    // entity object per row.
    const entityIdByRow: string[] = entities.map((e) => e.id);
    const byTypeRows = holdings.byType;
    // §9.13-CREDIT row 5 — A COUPON FOLLOWS FACE. This walked `qtyLocal`, the row's MONEY, to
    // decide each holder's share of an issuer's week. At par the two are the same number; once a
    // book prints anything else, a holder of a discounted bond would accrue less of the same
    // coupon than a holder of the identical face bought at par, which is not a thing an issuer
    // can pay. The face is `units`, in the same column order.
    const faceCol = holdings.units;
    const instCol = holdings.instrumentId;
    const entCol = holdings.entityRow;
    accrualsByType.forEach((byId, type) => {
      const [lo, hi] = holdings.typeRange(type as never);
      if (hi <= lo) return;
      // The accruing instruments are interned ONCE per type, so the row test below is an integer
      // compare against a dense array — not a string rebuilt from an id and looked up in a map,
      // which would have handed back with one hand what the columns give with the other.
      const accruingRow: string[] = [];
      const accruingWeekly: number[] = [];
      byId.forEach((v, instrumentText) => {
        const id = INSTRUMENT_IDS.peek(instrumentText);
        if (id >= 0) { accruingRow[id] = instrumentText; accruingWeekly[id] = v; }
      });
      // Pass 1 — each instrument's held total, in register order.
      const totalByInst: number[] = [];
      for (let i = lo; i < hi; i++) {
        const row = byTypeRows[i];
        const iid = instCol[row];
        if (accruingRow[iid] === undefined) continue;
        totalByInst[iid] = (totalByInst[iid] ?? 0) + faceCol[row];
      }
      // THE DESKS ARE HOLDERS OF RECORD TOO. Interest was split over the register alone, so the
      // paper a desk holds accrued nothing and its share of every coupon was paid to the other
      // holders. A desk holds THE SAME PAPER the register does, so this tranche's week is split
      // between them by what each holds OF IT: the register keeps `registerShare` and the desks
      // take the rest. (It used to reach for the ISSUER's stack because a desk position was said
      // to name the issuer — see `deskHoldingsByInstrument`. It names the tranche, and had done
      // since 13b, so this lookup missed on every position it was written for.)
      const deskByInstrument = deskHoldings.get(type);
      const registerShare: number[] = [];
      const deskTotalOfInst: number[] = [];
      if (deskByInstrument && deskByInstrument.size > 0) {
        accruingRow.forEach((instrumentText, iid) => {
          const byDesk = deskByInstrument.get(instrumentText);
          if (!byDesk) return;
          let deskLocal = 0;
          byDesk.forEach((usd) => { deskLocal += usd; });
          const registerLocal = totalByInst[iid] ?? 0;
          if (!(deskLocal + registerLocal > 0)) return;
          deskTotalOfInst[iid] = deskLocal;
          registerShare[iid] = registerLocal / (registerLocal + deskLocal);
        });
      }
      // Pass 2 — the same rows in the same order; each holder's share of the weekly amount.
      const byHolderByInst: (Map<string, number> | undefined)[] = [];
      for (let i = lo; i < hi; i++) {
        const row = byTypeRows[i];
        const iid = instCol[row];
        const instrumentText = accruingRow[iid];
        if (instrumentText === undefined) continue;
        const weeklyLocal = accruingWeekly[iid];
        const totalLocal = totalByInst[iid] ?? 0;
        if (weeklyLocal === undefined || !(totalLocal > 0)) continue;
        const shareLocal = weeklyLocal * (faceCol[row] / totalLocal) * (registerShare[iid] ?? 1);
        if (!(shareLocal > 0)) continue;
        let byHolder = byHolderByInst[iid];
        if (byHolder === undefined) {
          const key = `${type}:${instrumentText}`;
          byHolder = ctx.holderAccruedInterestLocal.get(key);
          if (!byHolder) { byHolder = new Map(); ctx.holderAccruedInterestLocal.set(key, byHolder); }
          byHolderByInst[iid] = byHolder;
        }
        const entityId = entityIdByRow[entCol[row]];
        byHolder.set(entityId, (byHolder.get(entityId) ?? 0) + shareLocal);
      }
      // Pass 3 — the desks' side of the same split, on the accrual ledger the register uses, so
      // the coupon date pays them out of the same balance. An issuer whose paper the register
      // does not hold at all is reached here and nowhere else: its whole coupon is the desks'.
      if (deskByInstrument && deskByInstrument.size > 0) {
        accruingRow.forEach((instrumentText, iid) => {
          const deskLocal = deskTotalOfInst[iid];
          if (!(deskLocal > 0)) return;
          const deskCutLocal = accruingWeekly[iid] * (1 - registerShare[iid]);
          if (!(deskCutLocal > 0)) return;
          const key = `${type}:${instrumentText}`;
          let byHolder = ctx.holderAccruedInterestLocal.get(key);
          if (!byHolder) { byHolder = new Map(); ctx.holderAccruedInterestLocal.set(key, byHolder); }
          deskByInstrument.get(instrumentText)?.forEach((usd, deskId) => {
            const shareLocal = deskCutLocal * (usd / deskLocal);
            if (!(shareLocal > 0)) return;
            byHolder.set(deskId, (byHolder.get(deskId) ?? 0) + shareLocal);
            if (COUPON_TRACE) traceAdd(traceDeskAccruedLocal, type, shareLocal);
          });
        });
      }
    });
  }
  // THE ACCRUAL IS CONSUMED HERE, NOT AT THE BOTTOM. It used to be cleared only on the payout
  // path, so in a week when NO instrument's coupon fell due the early return below left the
  // accruals standing — and this function is called twice a week. Every holder accrued the same
  // week's interest TWICE, and the second call paid for the full register walk to do it.
  accruals.clear();

  if (payouts.size === 0) {
    if (COUPON_TRACE) reportCouponTrace(ctx, traceAccruedLocal, tracePaidLocal, traceDeskAccruedLocal, traceDeskPaidLocal);
    return;
  }
  // Only the instruments whose coupon falls due this week, and only their own holders.
  // §3.13-BOOK (c-then-2): the issuers, read off the entity index rather than the `Map<id, ticker>`
  // mirror that had to be hand-registered at every firm birth. Built here, after the early
  // returns, so a week with no payout pays nothing for it.
  const { companyById: issuersById, companyByTicker: issuersByTicker } = buildEntityIndex(ctx.updatedCompanies ?? [], []);
  const bankIdOfTicker = (t: Ticker) => issuersByTicker.get(t)?.id;
  const deskCouponByTicker = new Map<Ticker, number>();
  payouts.forEach((instrumentKey) => {
    const byHolder = ctx.holderAccruedInterestLocal.get(instrumentKey);
    if (!byHolder) return;
    const issuerId = instrumentKey.slice(instrumentKey.indexOf(':') + 1);
    const ticker = issuersById.get(issuerIdOf(ctx.v2, issuerId))?.id; // §3.13-BOOK (c-then-3b): the issuer's entity id
    if (!ticker || !ctx.paymentJournal) {
      // A coupon due from an issuer nobody can name is a defect at the site that accrued it,
      // not a receivable that quietly survives.
      const owedLocal = Array.from(byHolder.values()).reduce((a, v) => a + Math.max(0, v), 0);
      return defect(`coupon of ${(owedLocal / 1e6).toFixed(3)}M due on ${instrumentKey} from an issuer with no ticker`);
    }
    const payer = companyPartyOf(ticker) as import('./settlement').PartyRef;
    // A coupon is paid in the paper's own money, which is the issuer's.
    const couponCurrency = obligationCurrencyOf(ctx.v2, payer);
    byHolder.forEach((accruedLocal, holderId) => {
      if (!(accruedLocal > 0)) return;
      const deskTicker = dealerDeskTicker(holderId);
      if (deskTicker !== undefined) deskCouponByTicker.set(deskTicker, (deskCouponByTicker.get(deskTicker) ?? 0) + accruedLocal);
      if (COUPON_TRACE) {
        const type = instrumentKey.slice(0, instrumentKey.indexOf(':'));
        traceAdd(tracePaidLocal, type, accruedLocal);
        if (deskTicker !== undefined) traceAdd(traceDeskPaidLocal, type, accruedLocal);
      }
      journalPayment(ctx, {
        payer,
        payee: holderPayee(holderId, bankIdOfTicker),
        amount: accruedLocal,
        currency: couponCurrency,
        reason: 'coupon payment',
      });
    });
    ctx.holderAccruedInterestLocal.delete(instrumentKey);
  });
  payouts.clear();
  bookDeskIncome(ctx.updatedCompanies, deskCouponByTicker, 'coupon on desk inventory');
  if (COUPON_TRACE) reportCouponTrace(ctx, traceAccruedLocal, tracePaidLocal, traceDeskAccruedLocal, traceDeskPaidLocal);
}

/** The COUPON_TRACE line: accrued / paid / still owed this week, by instrument type. */
function reportCouponTrace(
  ctx: { holderAccruedInterestLocal: Map<string, Map<string, number>>; nextWeek?: number },
  accrued: Map<string, number>,
  paid: Map<string, number>,
  deskAccrued: Map<string, number>,
  deskPaid: Map<string, number>
): void {
  const owed = new Map<string, number>();
  const deskOwed = new Map<string, number>();
  ctx.holderAccruedInterestLocal.forEach((byHolder, key) => {
    const type = key.slice(0, key.indexOf(':'));
    let usd = 0;
    let deskLocal = 0;
    byHolder.forEach((v, holderId) => {
      if (!(v > 0)) return;
      usd += v;
      if (dealerDeskTicker(holderId) !== undefined) deskLocal += v;
    });
    owed.set(type, (owed.get(type) ?? 0) + usd);
    deskOwed.set(type, (deskOwed.get(type) ?? 0) + deskLocal);
  });
  const types = [...new Set([...accrued.keys(), ...paid.keys(), ...owed.keys()])].sort();
  const b = (usd: number): string => `${(usd / 1e9).toFixed(3)}B`;
  const cells = types.map((t) =>
    `${t} accrued ${b(accrued.get(t) ?? 0)} paid ${b(paid.get(t) ?? 0)} owed ${b(owed.get(t) ?? 0)}`
    + ` [desk ${b(deskAccrued.get(t) ?? 0)}/${b(deskPaid.get(t) ?? 0)}/${b(deskOwed.get(t) ?? 0)}]`);
  console.log(`  [coupon] w${ctx.nextWeek ?? 0} :: ${cells.join(' | ')}`);
}

/**
 * §3.13-SOV row 3 — the one thing the ladder's TENOR still decides, and the only thing it ever
 * should have. A sovereign is a bill or a bond, and every other question (its coupon, its
 * remaining life, who holds it) is asked of the tranche. The bucket vocabulary that used to live
 * here — `SOV_BILL_BUCKETS`, `SOV_BOND_BUCKET_YEARS`, `sovBucketKey` — snapped every rung onto
 * one of seven labels and then keyed the holders by the label, which is why no holder of a
 * government bond could be named. Deleted with row 3.
 */
/** A tranche below this tenor is a bill; at or above, a bond. */
export const SOV_BILL_MAX_TENOR_YEARS = 1.5;

/**
 * The working-capital stock a company's own statements imply, as a share of revenue — the ONE
 * definition: the CP sizing and the treasury sweep both read it.
 */
export const WORKING_CAPITAL_SHARE_OF_REVENUE = 0.08;
