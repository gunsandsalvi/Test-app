/**
 * Small pure helper functions shared by two or more weekly-step stages (credit spread /
 * rating-bucket demand premia, occupation labor demand, ownership-share targets, and
 * itemized-holdings attribution). Kept together here rather than duplicated per stage.
 */

import { journalPayment, partyId } from './settlement';
import { defect } from '../../../domain/defect';
import { bookHeadOf } from '../../../engine2/holdings';
import { transferHolding } from '../../ledger/holdings-ledger';
import { revHistLen, revHistAt, rowOf, V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING } from '../../../engine2/tranches';
import { getHoldingsTable } from './register-index';
import { INSTRUMENT_IDS } from '../../columns/intern';
import { Company, Region, SmePool, RegionId, ItemizedHolding, SupplyRelationship, InstitutionalEntity } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { SECTOR_OCCUPATION_MIX, GOVERNMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { INDUSTRY_REGISTRY } from '../../../domain/industry-registry';
import { bankRwaUSD, BANK_MIN_CAPITAL_RATIO } from '../../../domain/bank-pricing';

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
function annualEbitdaVol(v2: V2World, comp: Company): number {
  // §4.C II.5 — the history reads the ring (world.ts); same entries, same order.
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
export function computeAnnualDefaultProbability(v2: V2World, comp: Company): number {
  // §7.291 — A BANK'S DEFAULT DISTANCE COMES OFF ITS OWN SHEET (§7.268's doctrine, one function
  // over: the RATING was fixed there, and this PD — which PRICES the bank's paper in 07b and
  // sizes its wholesale spread through the cleared OAS — still read the CORPORATE context.
  // `comp.cash` is ~0 for a bank (its money is cashReservesUSD) and `comp.ebitda` is the accrual
  // bridge that swings through zero on solvent banks, so `shockToCash` collapsed, the distance
  // went to ~0, and a structurally wholesale-funded bank was priced toward default while its
  // capital was intact — measured: THSY's cleared OAS repriced its 27B wholesale stack from
  // policy+~130bp to ~74% ANNUAL between w10 and w31, NIM to −25%, the §7.289 UK NIM family.)
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
    const rwaUSD = Math.max(1, bankRwaUSD(sheet));
    const bufferUSD = sheet.bankEquityUSD - rwaUSD * BANK_MIN_CAPITAL_RATIO;
    // The book's own measured provision rate (02b re-derives it weekly from the pools' real
    // default experience); the floor is consumerAnnualLossRate's own de-minimis.
    const lossRateAnnual = Math.max(0.005, sheet.loanLossProvisionRateAnnualPct ?? 0.01);
    const distance = bufferUSD / (rwaUSD * lossRateAnnual);
    return normalCdf(-distance);
  }
  // §7.311 — ladder read on rows (fold order = chain order = array order).
  let interestSum = 0;
  {
    const TS = v2.tranches;
    for (const r of ladderRowsOf(v2, comp.id)) {
      const rate = !(TS.flags[r] & TR_FLOATING)
        ? (Number.isNaN(TS.couponRate[r]) ? 0.05 : TS.couponRate[r])
        : (0.05 + (Number.isNaN(TS.floatingMarginBps[r]) ? 200 : TS.floatingMarginBps[r]) / 10000);
      interestSum += TS.principalUSD[r] * rate;
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
  const dividendsAnnualUSD = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0) * 4;
  const fixedOutflowsUSD = interest + (comp.maintenanceCapex ?? 0) + dividendsAnnualUSD;
  const shockToCash = 1 - (fixedOutflowsUSD - Math.max(0, cashOf(v2, comp))) / ebitda;
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
 * closes the one-default-model loop whose hazard side landed in §7.20.
 *
 * The 0.4 survives as the prior: what a lender must assume before this world has resolved enough
 * defaults to have an opinion of its own.
 */
// The workout prior lives in domain/bank-pricing.ts (one owner); re-exported for its readers.
export { CREDIT_RECOVERY_RATE } from '../../../domain/bank-pricing';
import { CREDIT_RECOVERY_RATE } from '../../../domain/bank-pricing';
import { marketCapOf } from '../../../domain/company';
import { cashOf } from '../../ledger/accounts';

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
    v2: import('../../../engine2/world').V2World;
    updatedInstitutionalEntities: InstitutionalEntity[];
    pendingHolderSettlements: Map<string, number>;
    pendingHolderCashUSD?: Map<string, number>;
    /** §5-CLOSE C5: the issuers, so an equity payment can find the shares the register does NOT
     *  hold — the public float, whose dividend goes to the household sector by payment. */
    updatedCompanies?: Company[];
    /** SETL3/4: present once the settlement layer is live — the register's payments become real
     *  payments from the issuer rather than cash appearing on the holder's book. */
    paymentJournal?: import('./settlement').PaymentJournal;
    issuerTickerById?: Map<string, string>;
    /** §4.0 Tier 1 item 6: the running settlement net, so a placement's budget sees what the
     *  holder's week has already committed. Present on the real context. */
    pendingNetById?: import('./context').WeeklyStepContext['pendingNetById'];
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

  // §7.313 flip — the pending instruments translate to interned pairs ONCE; every row is then
  // probed by one integer key. An instrument never interned has no rows and drops out here.
  const v2 = ctx.v2;
  const H = v2.holdings;
  const refOf = (t: string): number | undefined => v2.internedIdByString.get(t);
  const pairKeyOf = (r: number): number => H.typeRef[r] * 0x400000 + H.instrRef[r];
  const toPairs = (byType: Map<string, Map<string, number>>): Map<number, number> => {
    const out = new Map<number, number>();
    byType.forEach((byId, type) => {
      const t = refOf(type);
      if (t === undefined) return;
      byId.forEach((v, id) => {
        const i = refOf(id);
        if (i !== undefined) out.set(t * 0x400000 + i, v);
      });
    });
    return out;
  };
  const ratioByPair = toPairs(pendingByType);
  const owedByPair = toPairs(pendingCashByType);
  const equityRef = refOf('EQUITY') ?? -2;

  // Holders OF RECORD — the books as they stand before this week's actions scale them. A call
  // premium belongs to whoever owned the paper when it was called, so the shares are taken from
  // the pre-action notionals and the scaling happens after.
  // §7.327 — ONE walk per book, not two: the holders-of-record totals and the touched-entity
  // pre-scan probed the same ~110k rows in two separate full chain-chases (pairKeyOf and the
  // map probes twice per row, weekly). Fused: the same entity order and chain order, so
  // `totalByPair` accumulates the exact floats the separate pass did; the hit flags are the
  // same predicate the pre-scan tested. When no cash is owed the early-exit scan survives.
  const totalByPair = new Map<number, number>();
  const entityHit: boolean[] = new Array(ctx.updatedInstitutionalEntities.length);
  ctx.updatedInstitutionalEntities.forEach((entity, ei) => {
    let anyHit = false;
    if (hasCash) {
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
        const k = pairKeyOf(r);
        const owed = owedByPair.has(k);
        if (owed) totalByPair.set(k, (totalByPair.get(k) ?? 0) + H.qtyUSD[r]);
        if (!anyHit && (owed || ratioByPair.has(k))) anyHit = true;
      }
    } else {
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
        if (ratioByPair.has(pairKeyOf(r))) { anyHit = true; break; }
      }
    }
    entityHit[ei] = anyHit;
  });
  // §5-CLOSE C5 — THE PUBLIC FLOAT IS A HOLDER. The register holds the institutions' shares; the
  // rest of a listed issuer's stock is the float, owned by the household sector (that is what
  // `householdDirectEquityUSD` measures). A dividend is owed per share, so the register's holders
  // get their share of it and the float gets the rest, as a payment to the issuer's region's
  // households — where before the register's holders were paid the WHOLE dividend on a part of
  // the stock and households were credited a yield times a mark from nobody.
  const denomByPair = new Map<number, number>();
  if (hasCash && ctx.updatedCompanies) {
    const companyById = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
    owedByPair.forEach((owedUSD, k) => {
      if (Math.floor(k / 0x400000) !== equityRef) return;
      const issuerId = v2.internedStrings[k % 0x400000];
      const issuer = companyById.get(issuerId);
      const registerUSD = totalByPair.get(k) ?? 0;
      const issuedUSD = Math.max(0, issuer ? marketCapOf(issuer) : 0);
      const denomUSD = Math.max(registerUSD, issuedUSD);
      if (!(denomUSD > 0)) return;
      denomByPair.set(k, denomUSD);
      const floatUSD = denomUSD - registerUSD;
      const issuerTicker = ctx.issuerTickerById?.get(issuerId);
      if (floatUSD > 0 && issuer && issuerTicker && ctx.paymentJournal) {
        journalPayment(ctx.paymentJournal, {
          payer: { kind: 'COMPANY', ticker: issuerTicker },
          payee: { kind: 'HOUSEHOLD', region: issuer.region },
          amountUSD: owedUSD * (floatUSD / denomUSD),
          reason: 'dividend to the public float',
        });
      }
    });
  }

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity, ei) => {
    if (!entityHit[ei]) return entity;
    let touched = false;
    // Placements this entity has funded within THIS pass — journalPayment does not update the
    // running settlement net, so two placements in one week must see each other here.
    let committedPlacementUSD = 0;
    const kept: number[] = [];
    // §5-WIRES W2: the action per instrument — what every row of it sheds (or gains) at its own
    // funded ratio, summed — becomes ONE retirement or placement wire against the issuer. Per row
    // it was applied N times to N rows of one instrument (the ledger scales every row of the
    // instrument), which minted a placement N-fold.
    const actions = new Map<string, { type: ItemizedHolding['instrumentType']; id: string; region: RegionId; retiredUSD: number; retiredSh: number; placedUSD: number; placedSh: number; anyShares: boolean }>();
    for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
      const k = pairKeyOf(r);
      if (hasCash) {
        const owedUSD = owedByPair.get(k);
        const totalUSD = totalByPair.get(k) ?? 0;
        if (owedUSD !== undefined && totalUSD > 0) {
          // SETL3/4: the holder's share of what the issuer owes. Paid AS A PAYMENT from the
          // issuer, so the money has a payer and a payee (rule 14) instead of appearing on the
          // holder's book while the issuer's ledger says it left.
          const shareUSD = owedUSD * (H.qtyUSD[r] / (denomByPair.get(k) ?? totalUSD));
          const issuerTicker = ctx.issuerTickerById?.get(v2.internedStrings[H.instrRef[r]]);
          // §5-CLOSE C4: a holder paid by an issuer nobody can name is money from nobody — a
          // defect at the site that recorded the action, never a credit.
          if (!ctx.paymentJournal || !issuerTicker) {
            defect(`security payment of ${(shareUSD / 1e6).toFixed(3)}M to ${entity.id} from an issuer with no ticker (${v2.internedStrings[H.instrRef[r]]})`);
          }
          journalPayment(ctx.paymentJournal, {
            payer: { kind: 'COMPANY', ticker: issuerTicker },
            payee: { kind: 'INSTITUTION', id: entity.id },
            amountUSD: shareUSD,
            reason: 'security payment to holder of record',
          });
          touched = true;
        }
      }
      const ratio = ratioByPair.get(k);
      if (ratio === undefined) {
        if (H.qtyUSD[r] > 1) kept.push(r);
        continue;
      }
      touched = true;
      // THE PRINCIPAL'S CASH LEG. A redemption is money: the issuer pays its lenders back and
      // their claim shrinks by exactly what they were paid. Derived from the composed ratio so
      // it stays exact when two actions hit one instrument in a week; debt redeems at PAR, so
      // the notional change IS the cash — the call premium rides `pendingHolderCashUSD` above,
      // and equity is excluded (a share is bought at a negotiated price, §7.43).
      let principalCashUSD = H.typeRef[r] === equityRef ? 0 : H.qtyUSD[r] * (1 - ratio);
      // §4.0 Tier 1 item 6 — A PLACEMENT IS TAKEN UP ONLY AS FAR AS THE CASH REACHES. A holder
      // short of cash declines the unaffordable slice — its holding grows by only the share it
      // funded, and the issuer's proceeds shrink by the same amount on the same instruction.
      let effectiveRatio = ratio;
      if (principalCashUSD < 0) {
        const pendingUSD = ctx.pendingNetById
          ? (ctx.pendingNetById[partyId({ kind: 'INSTITUTION', id: entity.id })] ?? 0)
          : 0;
        const availableUSD = Math.max(0, (entity.cashUSD ?? 0) + pendingUSD
          - committedPlacementUSD);
        const owedUSD = -principalCashUSD;
        const fundedShare = owedUSD > 0 ? Math.min(1, availableUSD / owedUSD) : 1;
        if (fundedShare < 1) {
          effectiveRatio = 1 + (ratio - 1) * fundedShare;
          principalCashUSD = -owedUSD * fundedShare;
        }
        committedPlacementUSD += -principalCashUSD;
      }
      // CASH: and it comes FROM THE ISSUER, by name — a float INCREASE runs the same
      // instruction backwards, because a placement is paid for.
      const principalIssuerTicker = ctx.issuerTickerById?.get(v2.internedStrings[H.instrRef[r]]);
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
      } else if (principalCashUSD !== 0) {
        // §5-CLOSE C4: principal moving with no named issuer is money from (or to) nobody.
        defect(`principal of ${(principalCashUSD / 1e6).toFixed(3)}M moved for ${entity.id} on an instrument with no issuer ticker`);
      }
      // §5-WIRES W2: the action is a wire against the issuer — retired below one, placed above
      // — applied by the ledger after this read of the rows (it scales shares with notional,
      // §5-CLOSE O2, and unlinks what empties).
      {
        const id = v2.internedStrings[H.instrRef[r]];
        const type = v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'];
        const key = `${type}|${id}`;
        let a = actions.get(key);
        if (!a) { a = { type, id, region: v2.internedStrings[H.regionRef[r]] as RegionId, retiredUSD: 0, retiredSh: 0, placedUSD: 0, placedSh: 0, anyShares: false }; actions.set(key, a); }
        const dUSD = H.qtyUSD[r] * (effectiveRatio - 1);
        const dSh = Number.isNaN(H.shares[r]) ? Number.NaN : H.shares[r] * (effectiveRatio - 1);
        if (!Number.isNaN(dSh)) a.anyShares = true;
        if (dUSD < 0) { a.retiredUSD -= dUSD; if (!Number.isNaN(dSh)) a.retiredSh -= dSh; }
        else { a.placedUSD += dUSD; if (!Number.isNaN(dSh)) a.placedSh += dSh; }
      }
      kept.push(r);
    }
    if (!touched) return entity;
    actions.forEach((a) => {
      // §5-WIRES W3: the register side settles through the region's CLEARING HOUSE — the paying
      // agent. The issuer's own wire is the LADDER's (house → issuer at retirement, issuer → house
      // at placement, the tranche ledger), so the two sides of one action meet at the house and
      // the issuer's wires count once. Equity (no ladder) settles the same way for symmetry.
      const house = { kind: 'CLEARING_HOUSE' as const, region: a.region };
      const holder = { kind: 'INSTITUTION' as const, id: entity.id };
      if (a.retiredUSD > 0) {
        transferHolding(v2, holder, house, { instrumentType: a.type, instrumentId: a.id, issuerRegion: a.region, valueUSD: a.retiredUSD, shares: a.anyShares ? a.retiredSh : undefined }, 'corporate action: paper retired pro rata');
      }
      if (a.placedUSD > 0) {
        transferHolding(v2, house, holder, { instrumentType: a.type, instrumentId: a.id, issuerRegion: a.region, valueUSD: a.placedUSD, shares: a.anyShares ? a.placedSh : undefined }, 'corporate action: paper placed pro rata');
      }
    });
    void kept;
    return {
      ...entity,
      cashUSD: entity.cashUSD ?? 0,
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
    // SCALE — TWO COLUMN PASSES, NO ROW OBJECTS. The first version of this collected every
    // matching row into a `{entityId, key, qtyUSD}` object with its own key string — ~40k
    // allocations per call, twice a week, all garbage by the next line. The rows live in typed
    // columns; walking them twice costs typed-array loads and allocates nothing, and everything
    // per-INSTRUMENT (the weekly amount, the holder map, the one key string) is resolved once
    // into dense arrays keyed by the intern id. Both passes run in register order within each
    // type and the types in the same map order, so every float accumulates exactly as before.
    const holdings = getHoldingsTable(ctx as never);
    const entities = ctx.updatedInstitutionalEntities;
    // §7.327 — the holder id per row was an object deref (entities[entCol[row]].id); resolved
    // once here, the row loop reads a dense string array.
    const entityIdByRow: string[] = entities.map((e) => e.id);
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
        totalByInst[iid] = (totalByInst[iid] ?? 0) + qtyCol[row];
      }
      // Pass 2 — the same rows in the same order; each holder's share of the weekly amount.
      const byHolderByInst: (Map<string, number> | undefined)[] = [];
      for (let i = lo; i < hi; i++) {
        const row = byTypeRows[i];
        const iid = instCol[row];
        const instrumentText = accruingRow[iid];
        if (instrumentText === undefined) continue;
        const weeklyUSD = accruingWeekly[iid];
        const totalUSD = totalByInst[iid] ?? 0;
        if (weeklyUSD === undefined || !(totalUSD > 0)) continue;
        const shareUSD = weeklyUSD * (qtyCol[row] / totalUSD);
        if (!(shareUSD > 0)) continue;
        let byHolder = byHolderByInst[iid];
        if (byHolder === undefined) {
          const key = `${type}:${instrumentText}`;
          byHolder = ctx.holderAccruedInterestUSD.get(key);
          if (!byHolder) { byHolder = new Map(); ctx.holderAccruedInterestUSD.set(key, byHolder); }
          byHolderByInst[iid] = byHolder;
        }
        const entityId = entityIdByRow[entCol[row]];
        byHolder.set(entityId, (byHolder.get(entityId) ?? 0) + shareUSD);
      }
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
      // §5-CLOSE C4: a coupon due from an issuer nobody can name is a defect at the site that
      // accrued it, not a receivable that quietly survives.
      const owedUSD = Array.from(byHolder.values()).reduce((a, v) => a + Math.max(0, v), 0);
      return defect(`coupon of ${(owedUSD / 1e6).toFixed(3)}M due on ${instrumentKey} from an issuer with no ticker`);
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
