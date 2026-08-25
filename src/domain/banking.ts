/**
 * Commercial & Central Banking Domain Model
 *
 * Models banking sector balance sheets, deposit bases, loan books, capital ratios,
 * itemized instrument holdings, and sector ownership shares.
 * Written and updated by banking sector evolution and credit conditions simulation stages.
 */

import { RegionId } from './geography';

export interface ItemizedHolding {
  instrumentId: string; // for equity: company.id; for CORP_BOND/LEVERAGED_LOAN: the DebtTranche.id; for GOV_BOND: the GovDebtTranche.id
  instrumentType: 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND';
  issuerRegion: RegionId;
  quantityOrNotionalUSD: number; // dollar-denominated market value at cost
}

export interface AssetOwnershipShares {
  bankShare: number;
  institutionalShare: number; // insurers + asset managers
  foreignShare: Record<RegionId, number>; // this region's assets held by each of the other three
  centralBankShare: number; // meaningful only for sovereign bonds — 0 elsewhere
}

export interface BankingSector {
  businessLoanBookUSD: number;
  consumerLoanBookUSD: number;
  depositsUSD: number;
  sovereignBondHoldingsUSD: number;
  cashReservesUSD: number;
  bankEquityUSD: number;
  bankCapitalRatio: number;
  netInterestMarginPct: number;
  loanLossProvisionRateAnnualPct: number;
  creditConditionsIndex: number; // -1 (very loose) to +1 (very tight)
  centralBankReservesUSD: number;
  moneySupplyM2USD: number;
  itemizedHoldings: ItemizedHolding[];
}
