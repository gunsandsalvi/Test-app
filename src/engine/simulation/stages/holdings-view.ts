/**
 * The one holdings ledger, and the views derived from it (plan §5-S7).
 *
 * **The design decision, stated once so it cannot drift:** the books the clearing stages write
 * ARE the ledger. Per-entity `InstitutionalEntity.itemizedHoldings` (07b/07c/07d), per-bank
 * `bankBalanceSheet.sovereignBondHoldingsByTenor`, and the dealer inventories are the only
 * stores anyone writes. Every sector-level number is a DERIVED VIEW computed here.
 *
 * What this replaces. Stage 11 rebuilt `institutionalSector.itemizedHoldings` and
 * `bankingSector.itemizedHoldings` every week by attributing an ownership-share-times-outstanding
 * dollar figure across issuers with a size-sorted greedy fill — a second, parallel description of
 * who owns what, computed from a formula and overwriting nothing (the real per-entity books lived
 * beside it, untouched and disagreeing). Meanwhile the macro aggregates
 * (`institutionalSector.corpBondHoldingsUSD` and siblings) were written ONCE at initialization
 * and never again: frozen week-0 snapshots that the UI, the sector-equity book value in stage 08,
 * and stage 02's investment income all read as if current. Rule 3's anti-pattern in both
 * directions at once — a formula-built ledger and a frozen aggregate, either of which could
 * disagree with the real books and neither of which anything reconciled.
 *
 * The rule from here: if a number describes who holds what, it is computed in this module from
 * the real books, or it does not exist.
 */

import { govBucketId } from '../../../domain/sovereign-id';
import { GameState, RegionId, ItemizedHolding, Company } from '../../../types';
import { holdingClassOf, isIntraSectorClaim, isVehicleClaim } from '../../../domain/assets';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { REGION_IDS } from '../../../domain/geography';

export interface RegionalHoldingsView {
  /** Every real institutional entity's holdings in this region, flattened. */
  institutionalHoldings: ItemizedHolding[];
  /** Every named bank's real holdings in this region, flattened. */
  bankHoldings: ItemizedHolding[];
  institutionalCorpBondUSD: number;
  institutionalSovBondUSD: number;
  institutionalLoanUSD: number;
  institutionalEquityUSD: number;
  institutionalCashUSD: number;
  /** Cash + all securities, summed from the real entity books. */
  institutionalTotalAssetsUSD: number;
  bankSovBondUSD: number;
}

/**
 * The single derivation of every regional holdings figure. Called once per region per week (by
 * stage 11, after every clearing stage has written its books) and by the UI selectors.
 */
export function aggregateRegionalHoldings(state: GameState, regionId: RegionId): RegionalHoldingsView {
  const institutionalHoldings: ItemizedHolding[] = [];
  let corp = 0, sov = 0, loan = 0, equity = 0, cash = 0;

  state.institutionalEntities.forEach((e) => {
    if (e.region !== regionId || e.isDefaulted) return;
    // WS6: cash lent overnight is the entity's money in transit, part of its cash position.
    cash += (e.cashUSD ?? 0) + (e.repoLentUSD ?? 0);
    e.itemizedHoldings.forEach((h) => {
      institutionalHoldings.push(h);
      const v = h.quantityOrNotionalUSD ?? 0;
      // CP: an issuer's short paper is corporate credit like its bonds — one view of the
      // institutional sector's claim on companies, whatever book prices it.
      // §5-STRUCT step 4 — the class comes from the registry (domain/assets), which is also where
      // the four disagreeing instrument taxonomies are reconciled. The chain this replaces had to
      // be found and edited for every new instrument, and a missed one added silently to nothing.
      const cls = holdingClassOf(h.instrumentType);
      if (h.instrumentType === 'LEVERAGED_LOAN') loan += v;
      else if (isIntraSectorClaim(h.instrumentType)) { /* see the registry: double-counts */ }
      else if (cls === 'CREDIT') corp += v;
      else if (cls === 'SOVEREIGN') sov += v;
      else if (cls === 'EQUITY' && h.instrumentType === 'EQUITY') equity += v;
      // PE_FUND_INTEREST is an ownership claim on another entity in this same sector; counting it
      // in a sector aggregate would double-count the underlying portfolio companies.
    });
  });

  const bankHoldings: ItemizedHolding[] = [];
  let bankSov = 0;
  state.companies.forEach((c: Company) => {
    if (c.region !== regionId || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}).forEach(([tenorKey, usd]) => {
      const v = Number(usd) || 0;
      if (v <= 0) return;
      bankSov += v;
      bankHoldings.push({
        // §7.241: this view minted a SECOND id format (`_GOV_`) for paper every book ids as
        // `-GOV-` — the §7.240-recorded fork seed. One format now.
        instrumentId: govBucketId(regionId, tenorKey),
        instrumentType: 'GOV_BOND',
        issuerRegion: regionId,
        quantityOrNotionalUSD: v,
      });
    });
  });

  return {
    institutionalHoldings,
    bankHoldings,
    institutionalCorpBondUSD: corp,
    institutionalSovBondUSD: sov,
    institutionalLoanUSD: loan,
    institutionalEquityUSD: equity,
    institutionalCashUSD: cash,
    institutionalTotalAssetsUSD: cash + corp + sov + loan + equity,
    bankSovBondUSD: bankSov,
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
  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    e.itemizedHoldings.forEach((h) => {
      const v = h.quantityOrNotionalUSD ?? 0;
      // §7.241: registry dispatch (see the ownership accumulator above) — vehicle claims are
      // excluded and each class lands in its own accumulator, one mapping for a new type.
      const cls = isVehicleClaim(h.instrumentType) ? undefined : holdingClassOf(h.instrumentType);
      const key = cls ? ({ EQUITY: 'equity', SOVEREIGN: 'sovBond', CREDIT: 'corpBond' } as const)[cls as 'EQUITY' | 'SOVEREIGN' | 'CREDIT'] : undefined;
      if (!key) return;
      accFor(held, h.issuerRegion)[key] += v;
      if (e.region !== h.issuerRegion) accFor(foreign, h.issuerRegion)[key] += v;
    });
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
    itemizedHoldings: ItemizedHolding[]; corpBondHoldingsUSD: number; sovBondHoldingsUSD: number;
    equityHoldingsUSD: number; cashUSD: number; sectorEquityUSD: number;
  };
  bankingSector: import('../../../domain/banking').BankingSectorView;
}): void {
  const view = aggregateRegionalHoldings(state, regionId);
  reg.institutionalSector.itemizedHoldings = view.institutionalHoldings;
  reg.institutionalSector.corpBondHoldingsUSD = Math.round(view.institutionalCorpBondUSD + view.institutionalLoanUSD);
  reg.institutionalSector.sovBondHoldingsUSD = Math.round(view.institutionalSovBondUSD);
  reg.institutionalSector.equityHoldingsUSD = Math.round(view.institutionalEquityUSD);
  reg.institutionalSector.cashUSD = Math.round(view.institutionalCashUSD);
  // The sector's equity capital is the real book it actually carries — S11 marks each entity's
  // totalAssetsUSD weekly, so this is a live number rather than an accreting formula.
  reg.institutionalSector.sectorEquityUSD = Math.round(view.institutionalTotalAssetsUSD);
  reg.bankingSector = { ...reg.bankingSector, itemizedHoldings: view.bankHoldings };
}

/**
 * OWN1: the ownership register, MEASURED. `AssetOwnershipShares` used to be an input —
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
export interface MeasuredOwnership {
  bankUSD: number;
  institutionalUSD: number;
  centralBankUSD: number;
  outstandingUSD: number;
}
export type MeasuredOwnershipByClass = {
  equity: MeasuredOwnership; corpBond: MeasuredOwnership; sovBond: MeasuredOwnership;
};

const ZERO_OWNERSHIP = (): MeasuredOwnership =>
  ({ bankUSD: 0, institutionalUSD: 0, centralBankUSD: 0, outstandingUSD: 0 });

/** One pass over every book; a holding contributes to its ISSUER's region, not its holder's. */
export function measuredOwnershipAllRegions(state: GameState): Record<RegionId, MeasuredOwnershipByClass> {
  const out = {} as Record<RegionId, MeasuredOwnershipByClass>;
  const regionIds = Object.keys(state.regions) as RegionId[];
  regionIds.forEach((r) => {
    out[r] = { equity: ZERO_OWNERSHIP(), corpBond: ZERO_OWNERSHIP(), sovBond: ZERO_OWNERSHIP() };
  });
  const acc = (r: RegionId): MeasuredOwnershipByClass | undefined => out[r];

  state.institutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    e.itemizedHoldings.forEach((h) => {
      const a = acc(h.issuerRegion);
      if (!a) return;
      const v = h.quantityOrNotionalUSD ?? 0;
      // §7.241: dispatched through the registry instead of an if-chain — the chain's silence on
      // fund shares was an undocumented fact, now `isVehicleClaim`; a new holding type gets its
      // class in domain/assets, not here.
      const cls = isVehicleClaim(h.instrumentType) ? undefined : holdingClassOf(h.instrumentType);
      const sink = cls ? { EQUITY: a.equity, SOVEREIGN: a.sovBond, CREDIT: a.corpBond }[cls as 'EQUITY' | 'SOVEREIGN' | 'CREDIT'] : undefined;
      if (sink) sink.institutionalUSD += v;
    });
  });

  // §4.0 Tier 1 item 11 — THE ESTATE WINDOW. A defaulted issuer leaves the active roster the
  // week it fails, but its creditors' claims stand until the estate extinguishes them — often
  // weeks later. Dropping its tranches from the outstanding denominator while the holders'
  // paper stayed in the numerator pushed corpBondOwnership mechanically above 1 in every
  // default wave (§7.253 measured accounted 1.02→1.07 in the UK's). Debt on a company with an
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
      if (isPubliclyListed(c)) a.equity.outstandingUSD += Math.max(0, c.marketCap ?? 0);
    }
    a.corpBond.outstandingUSD += (c.debtTranches || [])
      .reduce((s, t) => s + Math.max(0, t.principalUSD), 0);

    const sheet = c.bankBalanceSheet;
    if (!sheet || !isActiveCompany(c)) return;
    Object.values(sheet.sovereignBondHoldingsByTenor || {}).forEach((usd) => {
      // A bank holds its OWN sovereign as its liquidity buffer (07c's domestic mandate).
      a.sovBond.bankUSD += Math.max(0, Number(usd) || 0);
    });
  });
  // Second pass: a facility's issuer region comes from the borrower, which may not be the
  // lender's — resolved only once every company's region is known.
  //
  // OWN7: POOL loans are excluded. An SME pool's debt is a scalar on the pool (`seg.debtUSD`),
  // not a tranche on any company, so it has no place in a register whose denominator is the
  // named companies' debt ladders — counting it put ~22% of corporate "ownership" in the banks'
  // column against paper that does not exist, which is most of what made these shares sum above
  // one. Rule 3: one real thing, one representation, and the pool's is its own.
  state.companies.forEach((c) => {
    const sheet = c.bankBalanceSheet;
    if (!sheet || !isActiveCompany(c)) return;
    (sheet.businessLoans || []).forEach((l) => {
      if (l.borrowerKind !== 'COMPANY_FACILITY') return;
      const issuerRegion = companyRegionById.get(l.borrowerId);
      const a = issuerRegion ? acc(issuerRegion) : undefined;
      if (a) a.corpBond.bankUSD += Math.max(0, l.principalUSD);
    });
  });

  regionIds.forEach((r) => {
    const reg = state.regions[r];
    const a = out[r];
    a.sovBond.outstandingUSD = (reg.govDebtTranches || [])
      .reduce((s, t) => s + Math.max(0, t.principalUSD), 0);
    Object.values(reg.centralBankSheet?.sovereignHoldingsByTenor || {}).forEach((usd) => {
      a.sovBond.centralBankUSD += Math.max(0, Number(usd) || 0);
    });
  });
  return out;
}

/** The register expressed as the three shares the UI reports. Nothing reads these to decide. */
export function ownershipSharesFromRegister(m: MeasuredOwnership): { bankShare: number; institutionalShare: number; centralBankShare: number } {
  const o = m.outstandingUSD;
  if (!(o > 0)) return { bankShare: 0, institutionalShare: 0, centralBankShare: 0 };
  return {
    bankShare: m.bankUSD / o,
    institutionalShare: m.institutionalUSD / o,
    centralBankShare: m.centralBankUSD / o,
  };
}
