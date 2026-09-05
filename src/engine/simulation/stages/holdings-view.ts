/**
 * The one holdings ledger, and the views derived from it (plan ).
 *
 * **The design decision, stated once so it cannot drift:** the books the clearing stages write
 * ARE the ledger. Per-entity `InstitutionalEntity.itemizedHoldings` (07b/07c/07d), per-bank
 * `bankBalanceSheet.sovereignBondHoldingsByBond`, and the dealer inventories are the only
 * stores anyone writes. Every sector-level number is a DERIVED VIEW computed here.
 *
 * What this replaces. Stage 11 rebuilt `institutionalSector.itemizedHoldings` and
 * `bankingSector.itemizedHoldings` every week by attributing an ownership-share-times-outstanding
 * dollar figure across issuers with a size-sorted greedy fill — a second, parallel description of
 * who owns what, computed from a formula and overwriting nothing (the real per-entity books lived
 * beside it, untouched and disagreeing). Meanwhile the macro aggregates
 * (`institutionalSector.corpBondHoldingsLocal` and siblings) were written ONCE at initialization
 * and never again: frozen week-0 snapshots that the UI, the sector-equity book value in stage 08,
 * and stage 02's investment income all read as if current. Rule 3's anti-pattern in both
 * directions at once — a formula-built ledger and a frozen aggregate, either of which could
 * disagree with the real books and neither of which anything reconciled.
 *
 * The rule from here: if a number describes who holds what, it is computed in this module from
 * the real books, or it does not exist.
 */

import { ensureV2, regionOf, typeOf } from '../../../engine2/world';
import { marketCapAt } from '../../../engine2/instruments';
import { ladderRowsOf, facilityRowsOf, materializeGovLadder } from '../../../engine2/tranches';
import { bookHeadOf, materializeBook } from '../../../engine2/holdings';
import { GameState, RegionId, ItemizedHolding, Company } from '../../../types';
import { holdingClassOf, isIntraSectorClaim, isVehicleClaim } from '../../../domain/assets';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { REGION_IDS } from '../../../domain/geography';
import { entityCashOf } from '../../ledger/accounts';
import { sovereignHeldByClass, bankSovereignPositions } from '../../sovereign-register';

interface RegionalHoldingsView {
  /** Every real institutional entity's holdings in this region, flattened. */
  institutionalHoldings: ItemizedHolding[];
  /** Every named bank's real holdings in this region, flattened. */
  bankHoldings: ItemizedHolding[];
  institutionalCorpBondLocal: number;
  institutionalSovBondLocal: number;
  institutionalLoanLocal: number;
  institutionalEquityLocal: number;
  institutionalCashLocal: number;
  /** What the sector owes the people whose money it manages: beneficiary entitlements and money
   *  fund shares. Every dollar of it is a named holder's, not the sector's capital. */
  institutionalLiabilitiesLocal: number;
  /** Cash + all securities, summed from the real entity books. */
  institutionalTotalAssetsLocal: number;
  bankSovBondLocal: number;
}

/**
 * The single derivation of every regional holdings figure. Called once per region per week (by
 * stage 11, after every clearing stage has written its books) and by the UI selectors.
 */
function aggregateRegionalHoldings(state: GameState, regionId: RegionId): RegionalHoldingsView {
  const institutionalHoldings: ItemizedHolding[] = [];
  let corp = 0, sov = 0, loan = 0, equity = 0, cash = 0, lent = 0, liabilities = 0;

  // The rows ARE the register; the flattened view the UI reads is materialized from them here.
  // (The seed calls this after `openSeededBooks` has wired every book; the UI, after a week.)
  const v2a = ensureV2(state);
  state.institutionalEntities.forEach((e) => {
    if (e.region !== regionId || e.isDefaulted) return;
    // CASH IS CASH. What the entity lent overnight — to a bank in repo, or to the central bank
    // at its window — is out the door and sitting in the borrower's own cash; counted here as
    // well, the sector's aggregate holds the same dollars twice. It is a receivable, and it is
    // in the entity's total assets below, where a claim belongs.
    cash += entityCashOf(ensureV2(state), e);
    lent += (e.repoLentLocal ?? 0) + (e.rrpLentLocal ?? 0);
    liabilities += (e.beneficiaryLiabilityLocal ?? 0) + (e.mmfSharesOutstandingLocal ?? 0);
    // §3.13-READ C3: THE STORE'S OWN MATERIALIZER. This inlined `materializeBook` field for
    // field — and drifted from it on the one field where the two can disagree: it fell back from
    // a NaN `units` straight to the row's MONEY, where the store falls back through the SHARE
    // COUNT first. So an equity row that never had its units written reported a dollar figure
    // here and a share count there. (§3.13-READ A6 collapsed seventeen copies of that fallback
    // and missed this one, because it aliases the store as `Ha`.)
    for (const h of materializeBook(v2a, e.id)) {
      const type = h.instrumentType;
      institutionalHoldings.push(h);
      const v = h.quantityOrNotionalLocal ?? 0;
      // CP: an issuer's short paper is corporate credit like its bonds — one view of the
      // institutional sector's claim on companies, whatever book prices it.
      // step 4 — the class comes from the registry (domain/assets), which is also where
      // the four disagreeing instrument taxonomies are reconciled. The chain this replaces had to
      // be found and edited for every new instrument, and a missed one added silently to nothing.
      const cls = holdingClassOf(type);
      if (type === 'LEVERAGED_LOAN') loan += v;
      else if (isIntraSectorClaim(type)) { /* see the registry: double-counts */ }
      else if (cls === 'CREDIT') corp += v;
      else if (cls === 'SOVEREIGN') sov += v;
      else if (cls === 'EQUITY' && type === 'EQUITY') equity += v;
      // PE_FUND_INTEREST is an ownership claim on another entity in this same sector; counting it
      // in a sector aggregate would double-count the underlying portfolio companies.
    }
  });

  const bankHoldings: ItemizedHolding[] = [];
  let bankSov = 0;
  state.companies.forEach((c: Company) => {
    if (c.region !== regionId || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    // §3.13-BOOK d3b: the bank's own book is its register rows.
    bankSovereignPositions(v2a, c.id).forEach((p) => {
      const v = p.valueLocal;
      if (v <= 0) return;
      bankSov += v;
      bankHoldings.push({
        // §3.13-SOV row 3: the key IS the bond's id. This view once minted a second id format
        // (`_GOV_`) and then a bucket id; the book's own key is the only one now.
        instrumentId: p.bondId,
        instrumentType: 'GOV_BOND',
        issuerRegion: regionId,
        quantityOrNotionalLocal: v, units: p.faceLocal,
      });
    });
  });

  return {
    institutionalHoldings,
    bankHoldings,
    institutionalCorpBondLocal: corp,
    institutionalSovBondLocal: sov,
    institutionalLoanLocal: loan,
    institutionalEquityLocal: equity,
    institutionalCashLocal: cash,
    institutionalTotalAssetsLocal: cash + lent + corp + sov + loan + equity,
    institutionalLiabilitiesLocal: liabilities,
    bankSovBondLocal: bankSov,
  };
}

/**
 * Write the derived view onto the region's sector objects, so every existing reader (UI panels,
 * stage 08's institutional book value, stage 02's investment income) sees live numbers from the
 * real books instead of a week-0 snapshot. This is a projection, not a second ledger: nothing
 * here is ever read back to decide a holding.
 */
/**
 * XB1: the share of a region's markets held by FOREIGN institutions — measured from the real
 * books, never assigned. This replaces `AssetOwnershipShares.foreignShare`, which was an input
 * imposed on every market and owned by nobody.
 */
export function measuredForeignOwnership(state: GameState, regionId: RegionId): {
  equity: number; corpBond: number; sovBond: number;
} {
  return measuredForeignOwnershipAllRegions(state)[regionId];
}

/**
 * All four regions' measures from ONE pass over the books. The per-region version swept every
 * entity's whole holdings array once per region (the SCALE profile put the four sweeps at
 * ~11 ms/week); a row contributes to exactly one region — its issuer's — so a single pass sees
 * every (region, class) accumulator receive the same additions in the same order.
 */
export function measuredForeignOwnershipAllRegions(state: GameState): Record<RegionId, {
  equity: number; corpBond: number; sovBond: number;
}> {
  type Acc = { equity: number; corpBond: number; sovBond: number };
  const held: Partial<Record<RegionId, Acc>> = {};
  const foreign: Partial<Record<RegionId, Acc>> = {};
  const accFor = (table: Partial<Record<RegionId, Acc>>, r: RegionId): Acc =>
    table[r] ?? (table[r] = { equity: 0, corpBond: 0, sovBond: 0 });
  // holdings flip: row walk on the register; the registry dispatch is resolved
  // ONCE per interned type instead of per row.
  const v2 = ensureV2(state);
  const H = v2.holdings;
  const keyByTypeRef: ('equity' | 'sovBond' | 'corpBond' | false | undefined)[] = []; // a memo, sparse until a type is met
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      const tref = H.typeRef[r];
      let key = keyByTypeRef[tref];
      if (key === undefined) {
        const t = typeOf(v2, tref) as ItemizedHolding['instrumentType'];
        const cls = isVehicleClaim(t) ? undefined : holdingClassOf(t);
        key = keyByTypeRef[tref] = (cls ? ({ EQUITY: 'equity', SOVEREIGN: 'sovBond', CREDIT: 'corpBond' } as const)[cls as 'EQUITY' | 'SOVEREIGN' | 'CREDIT'] : undefined) ?? false;
      }
      if (!key) continue;
      const issuer = regionOf(v2, H.regionRef[r]) as RegionId;
      const v = H.qtyLocal[r];
      accFor(held, issuer)[key] += v;
      if (e.region !== issuer) accFor(foreign, issuer)[key] += v;
    }
  });
  const out = {} as Record<RegionId, Acc>;
  REGION_IDS.forEach((r) => {
    const hr = accFor(held, r);
    const fr = accFor(foreign, r);
    out[r] = {
      equity: hr.equity > 0 ? fr.equity / hr.equity : 0,
      corpBond: hr.corpBond > 0 ? fr.corpBond / hr.corpBond : 0,
      sovBond: hr.sovBond > 0 ? fr.sovBond / hr.sovBond : 0,
    };
  });
  return out;
}

export function refreshRegionalHoldingsView(state: GameState, regionId: RegionId, reg: {
  institutionalSector: {
    itemizedHoldings: ItemizedHolding[]; corpBondHoldingsLocal: number; sovBondHoldingsLocal: number;
    equityHoldingsLocal: number; cashLocal: number; sectorEquityLocal: number;
  };
  bankingSector: import('../../../domain/banking').BankingSectorView;
}): void {
  const view = aggregateRegionalHoldings(state, regionId);
  reg.institutionalSector.itemizedHoldings = view.institutionalHoldings;
  reg.institutionalSector.corpBondHoldingsLocal = Math.round(view.institutionalCorpBondLocal + view.institutionalLoanLocal);
  reg.institutionalSector.sovBondHoldingsLocal = Math.round(view.institutionalSovBondLocal);
  reg.institutionalSector.equityHoldingsLocal = Math.round(view.institutionalEquityLocal);
  reg.institutionalSector.cashLocal = Math.round(view.institutionalCashLocal);
  // EQUITY IS ASSETS LESS WHAT THEY ARE OWED TO. Set to total assets outright, the sector
  // counted other people's money as its own capital — every dollar of money-fund shares and
  // every beneficiary entitlement is a named holder's claim, and A = L + E cannot hold with the
  // liabilities left out.
  reg.institutionalSector.sectorEquityLocal = Math.round(view.institutionalTotalAssetsLocal - view.institutionalLiabilitiesLocal);
  reg.bankingSector = { ...reg.bankingSector, itemizedHoldings: view.bankHoldings };
}

/**
 * The ownership register, MEASURED. `AssetOwnershipShares` used to be an input —
 * `OWNERSHIP_SHARES` assigned banks 3% of equity, 28% of corporate credit and 22% of sovereigns,
 * the shares drifted weekly on `(gdpGrowth + inflation) - tenor10Y` inside two bands, and were
 * rescaled whenever they summed above 0.85. Every one of those numbers then decided something
 * real: three books' tradable float, each bank's sovereign target, and household direct equity.
 *
 * They are now a statistic taken off the books after the week has cleared. What a bank holds is
 * what is on its own sheet: sovereigns by tenor, and the corporate FACILITIES on its itemized
 * business-loan book (syndicated paper it does not hold — 07d already excludes facilities from
 * the market it clears, so the two halves partition the corporate stock exactly once).
 */
interface MeasuredOwnership {
  bankLocal: number;
  institutionalLocal: number;
  centralBankLocal: number;
  outstandingLocal: number;
}
type MeasuredOwnershipByClass = {
  equity: MeasuredOwnership; corpBond: MeasuredOwnership; sovBond: MeasuredOwnership;
};

const ZERO_OWNERSHIP = (): MeasuredOwnership =>
  ({ bankLocal: 0, institutionalLocal: 0, centralBankLocal: 0, outstandingLocal: 0 });

/** One pass over every book; a holding contributes to its ISSUER's region, not its holder's. */
export function measuredOwnershipAllRegions(state: GameState): Record<RegionId, MeasuredOwnershipByClass> {
  // Callable outside the weekly step (harness reports, the seed after `openSeededBooks`): the
  // rows are the ladders and the register (§3.13-BOOK d1, d1b), so there is nothing to catch up.
  const v2hv = ensureV2(state);
  const out = {} as Record<RegionId, MeasuredOwnershipByClass>;
  const regionIds = Object.keys(state.regions) as RegionId[];
  regionIds.forEach((r) => {
    out[r] = { equity: ZERO_OWNERSHIP(), corpBond: ZERO_OWNERSHIP(), sovBond: ZERO_OWNERSHIP() };
  });
  const acc = (r: RegionId): MeasuredOwnershipByClass | undefined => out[r];

  // holdings flip: row walk on the register; the registry dispatch — the chain's
  // silence on fund shares was an undocumented fact, now `isVehicleClaim`; a new holding type
  // gets its class in domain/assets, not here — is resolved once per interned type.
  const Hmo = v2hv.holdings;
  const keyByTypeRef: ('equity' | 'sovBond' | 'corpBond' | false | undefined)[] = []; // a memo, sparse until a type is met
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2hv, e.id); r >= 0; r = Hmo.next[r]) {
      const a = acc(regionOf(v2hv, Hmo.regionRef[r]) as RegionId);
      if (!a) continue;
      const tref = Hmo.typeRef[r];
      let key = keyByTypeRef[tref];
      if (key === undefined) {
        const t = typeOf(v2hv, tref) as ItemizedHolding['instrumentType'];
        const cls = isVehicleClaim(t) ? undefined : holdingClassOf(t);
        key = keyByTypeRef[tref] = (cls ? ({ EQUITY: 'equity', SOVEREIGN: 'sovBond', CREDIT: 'corpBond' } as const)[cls as 'EQUITY' | 'SOVEREIGN' | 'CREDIT'] : undefined) ?? false;
      }
      if (!key) continue;
      const sink = key === 'equity' ? a.equity : key === 'sovBond' ? a.sovBond : a.corpBond;
      sink.institutionalLocal += Hmo.qtyLocal[r];
    }
  });

  // THE ESTATE WINDOW. A defaulted issuer leaves the active roster the
  // week it fails, but its creditors' claims stand until the estate extinguishes them — often
  // weeks later. Dropping its tranches from the outstanding denominator while the holders'
  // paper stayed in the numerator pushed corpBondOwnership mechanically above 1 in every
  // default wave (measured accounted 1.02→1.07 in the UK's). Debt on a company with an
  // OPEN estate is still outstanding; its equity is not (dead equity is worthless).
  const openEstateCompanyIds = new Set(
    (state.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  const companyRegionById = new Map<string, RegionId>();
  state.companies.forEach((c) => {
    if (!isActiveCompany(c) && !openEstateCompanyIds.has(c.id)) return;
    companyRegionById.set(c.id, c.region);
    const a = acc(c.region);
    if (!a) return;
    if (isActiveCompany(c)) {
      if (isPubliclyListed(c)) a.equity.outstandingLocal += Math.max(0, marketCapAt(v2hv, c) ?? 0);
    }
    {
      // Ladder read on rows (fold order = chain order = array order).
      const TS = v2hv.tranches;
      let sum = 0;
      for (const r of ladderRowsOf(v2hv, c.id)) sum += Math.max(0, TS.principalLocal[r]);
      a.corpBond.outstandingLocal += sum;
    }

  });
  // Second pass: a facility's issuer region comes from the borrower, which may not be the
  // lender's — resolved only once every company's region is known.
  //
  // POOL loans are excluded. An SME pool's debt is a scalar on the pool (`seg.debtLocal`),
  // not a tranche on any company, so it has no place in a register whose denominator is the
  // named companies' debt ladders — counting it put ~22% of corporate "ownership" in the banks'
  // column against paper that does not exist, which is most of what made these shares sum above
  // one. Rule 3: one real thing, one representation, and the pool's is its own.
  state.companies.forEach((c) => {
    const sheet = c.bankBalanceSheet;
    if (!sheet || !isActiveCompany(c)) return;
    // The bank's facilities are its rows on the borrowers' ladders.
    facilityRowsOf(v2hv, c.id).forEach((l) => {
      const issuerRegion = companyRegionById.get(l.borrowerId);
      const a = issuerRegion ? acc(issuerRegion) : undefined;
      if (a) a.corpBond.bankLocal += Math.max(0, l.principalLocal);
    });
  });

  regionIds.forEach((r) => {
    const reg = state.regions[r];
    const a = out[r];
    // §3.13-SOV row 2: the sovereign ladder comes from the ONE store.
    a.sovBond.outstandingLocal = materializeGovLadder(v2hv, r)
      .reduce((s, t) => s + Math.max(0, t.principalLocal), 0);
    // §9.13-OUTSIDE: ONE walk over the four stores a sovereign holding can sit in
    // (`engine/sovereign-register.ts`). This file used to enumerate two of them itself, in two
    // separate passes, and count the DESKS in neither.
    const byClass = sovereignHeldByClass(v2hv, state, r);
    a.sovBond.bankLocal = byClass.BANK + byClass.DESK;
    a.sovBond.centralBankLocal = byClass.CENTRAL_BANK;
    void reg;
  });
  return out;
}

/** The register expressed as the three shares the UI reports. Nothing reads these to decide. */
export function ownershipSharesFromRegister(m: MeasuredOwnership): { bankShare: number; institutionalShare: number; centralBankShare: number } {
  const o = m.outstandingLocal;
  if (!(o > 0)) return { bankShare: 0, institutionalShare: 0, centralBankShare: 0 };
  return {
    bankShare: m.bankLocal / o,
    institutionalShare: m.institutionalLocal / o,
    centralBankShare: m.centralBankLocal / o,
  };
}
