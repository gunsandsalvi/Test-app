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

import { GameState, RegionId, ItemizedHolding, Company } from '../../../types';
import { isActiveCompany } from '../../../domain/company';

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
      if (h.instrumentType === 'CORP_BOND') corp += v;
      else if (h.instrumentType === 'GOV_BOND') sov += v;
      else if (h.instrumentType === 'LEVERAGED_LOAN') loan += v;
      else if (h.instrumentType === 'EQUITY') equity += v;
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
        instrumentId: `${regionId}_GOV_${tenorKey}`,
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
export function refreshRegionalHoldingsView(state: GameState, regionId: RegionId, reg: {
  institutionalSector: {
    itemizedHoldings: ItemizedHolding[]; corpBondHoldingsUSD: number; sovBondHoldingsUSD: number;
    equityHoldingsUSD: number; cashUSD: number; sectorEquityUSD: number;
  };
  bankingSector: { itemizedHoldings: ItemizedHolding[] };
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
  reg.bankingSector.itemizedHoldings = view.bankHoldings;
}
