import { AssetType, Dealer } from '../types';

export const DEALERS: Dealer[] = [
  {
    id: 'alpha',
    name: 'Alpha Global Markets',
    tagline: 'Credit & Rates Specialist | Tight CDS & Sovereign Pricing',
    inventoryAxe: 'Axe: Tight Credit/CDS & Rates',
    axeBadge: 'Axe: Credit/CDS Tight',
    axeDescription: 'Tighter spreads on sovereign curves, corporate credit bonds, CDS protection, and IRS.',
    axeAssetClasses: ['CORP_BOND', 'LEVERAGED_LOAN', 'CDS', 'SOV_BOND', 'IRS'],
    axeDiscountPct: 0.45,
    spreadMultiplier: 1.0,
    baseSpreadBps: 6,
    creditLimitUSD: 75_000_000,
    currentExposureUSD: 0,
    acceptedAssetClasses: ['EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'SOV_BOND', 'CDS', 'IRS', 'TRS', 'XCS', 'COMMODITY', 'OPTION'],
    color: '#3b82f6', // blue
  },
  {
    id: 'beta',
    name: 'Beta Securities Inc.',
    tagline: 'Macro, FX & Energy Desk | Cross-Currency Basis Leader',
    inventoryAxe: 'Axe: FX & Commodities 0-Slippage',
    axeBadge: 'Axe: FX/Commodities',
    axeDescription: 'Best liquidity and lowest slippage for cross-currency basis swaps, FX forwards, and commodities.',
    axeAssetClasses: ['COMMODITY', 'XCS'],
    axeDiscountPct: 0.50,
    spreadMultiplier: 1.0,
    baseSpreadBps: 8,
    creditLimitUSD: 100_000_000,
    currentExposureUSD: 0,
    acceptedAssetClasses: ['EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'SOV_BOND', 'CDS', 'IRS', 'TRS', 'XCS', 'COMMODITY', 'OPTION'],
    color: '#10b981', // emerald
  },
  {
    id: 'gamma',
    name: 'Gamma Structured Solutions',
    tagline: 'Equity Derivatives & Exotics Desk | Tight BSM Options & TRS',
    inventoryAxe: 'Axe: Equities, Options & TRS Flow',
    axeBadge: 'Axe: Options/TRS Flow',
    axeDescription: 'Tightest execution on single-stock equity options, index derivatives, and Total Return Swaps.',
    axeAssetClasses: ['EQUITY', 'OPTION', 'TRS'],
    axeDiscountPct: 0.45,
    spreadMultiplier: 1.0,
    baseSpreadBps: 10,
    creditLimitUSD: 150_000_000,
    currentExposureUSD: 0,
    acceptedAssetClasses: ['EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'SOV_BOND', 'CDS', 'IRS', 'TRS', 'XCS', 'COMMODITY', 'OPTION'],
    color: '#8b5cf6', // purple
  },
];

/**
 * Standard Unified Margin Requirements across Prime Brokers:
 * Eliminates arbitrary dealer leverage and enforces unified regulatory PB margin rules.
 */
export function getUnifiedInitialMarginRate(assetType: AssetType): number {
  switch (assetType) {
    case 'SOV_BOND':
      return 0.05; // 20x sovereign bond leverage
    case 'IRS':
      return 0.03; // 33x IRS duration leverage
    case 'CORP_BOND':
    case 'LEVERAGED_LOAN':
      return 0.10; // 10x IG/HY corporate debt leverage
    case 'CDS':
      return 0.05; // 20x CDS notional leverage
    case 'XCS':
      return 0.04; // 25x basis swap leverage
    case 'COMMODITY':
      return 0.10; // 10x futures margin
    case 'EQUITY':
    case 'TRS':
      return 0.15; // ~6.6x equity margin
    case 'OPTION':
      return 0.20; // Short option margin (Long options pay 100% premium upfront)
    default:
      return 0.15;
  }
}

/**
 * Dynamic bid-ask spread engine based on dealer inventory axes, asset class, order size, and market volatility
 */
export function calculateDynamicSpreadBps(
  dealer: Dealer,
  assetType: AssetType,
  notionalUSD: number,
  marketVolatility: number = 0.20
): { spreadBps: number; hasAxeDiscount: boolean; originalSpreadBps: number } {
  let assetClassMultiplier = 1.0;
  switch (assetType) {
    case 'SOV_BOND':
    case 'IRS':
      assetClassMultiplier = 0.6;
      break;
    case 'EQUITY':
    case 'COMMODITY':
      assetClassMultiplier = 1.0;
      break;
    case 'CORP_BOND':
    case 'LEVERAGED_LOAN':
    case 'TRS':
      assetClassMultiplier = 1.4;
      break;
    case 'CDS':
    case 'XCS':
    case 'OPTION':
      assetClassMultiplier = 2.0;
      break;
  }

  // Size penalty: Orders above $10M start moving spreads due to market impact
  const sizeFactor = Math.max(1.0, 1.0 + notionalUSD / 30_000_000);
  const volFactor = Math.max(0.8, marketVolatility / 0.20);

  const rawSpread = dealer.baseSpreadBps * assetClassMultiplier * sizeFactor * volFactor;
  const originalSpreadBps = Math.max(2, Math.round(rawSpread));

  const hasAxeDiscount = dealer.axeAssetClasses.includes(assetType);
  const discount = hasAxeDiscount ? (1 - dealer.axeDiscountPct) : 1.0;
  
  // Illiquid penalty if dealer is Gamma (options/equity desk) pricing illiquid CDS or Credit
  const nonSpecialistPenalty = (!hasAxeDiscount && dealer.id === 'gamma' && (assetType === 'CDS' || assetType === 'CORP_BOND')) ? 1.4 : 1.0;

  const finalSpreadBps = Math.max(1, Math.round(rawSpread * discount * nonSpecialistPenalty));

  return {
    spreadBps: finalSpreadBps,
    hasAxeDiscount,
    originalSpreadBps,
  };
}
