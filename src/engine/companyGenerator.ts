import { Company, CreditRating, RegionId, Sector, DebtTranche } from '../types';
import { RATING_OAS_SPREADS, SECTOR_BENCHMARKS, priceEquity } from './pricing';

export const FIXED_SHARE_BY_RATING: Record<CreditRating, number> = {
  AAA: 0.90, AA: 0.85, A: 0.75, BBB: 0.60, BB: 0.40, B: 0.20, CCC: 0.10, D: 0,
};

function generateDebtTranches(ticker: string, debtBase: number, initialRating: CreditRating): DebtTranche[] {
  const fixedShare = FIXED_SHARE_BY_RATING[initialRating] ?? 0.5;
  const trancheWeights = [0.35, 0.35, 0.30];
  const maturityWeeks = [260, 520, 780]; // 5, 10, 15 years out
  const baseSpreadBps = RATING_OAS_SPREADS[initialRating]?.baseBps ?? 150;
  let cumulativePrincipalAssigned = 0;
  return maturityWeeks.map((maturityWeek, i) => {
    const principalUSD = debtBase * trancheWeights[i];
    // Deterministic rule: assign FIXED as long as cumulative principal assigned so far is still under the fixedShare target.
    const isFixed = cumulativePrincipalAssigned < fixedShare * debtBase;
    cumulativePrincipalAssigned += principalUSD;
    return isFixed
      ? {
          id: `${ticker}-T${i + 1}`,
          principalUSD,
          rateType: 'FIXED' as const,
          couponRate: 0.045 + baseSpreadBps / 10000, // 0.045 approximates the initial policy rate across regions at game start — documented simplification
          originationWeek: 0,
          maturityWeek,
          seniority: 'SENIOR' as const,
        }
      : {
          id: `${ticker}-T${i + 1}`,
          principalUSD,
          rateType: 'FLOATING' as const,
          floatingMarginBps: Math.round(baseSpreadBps * 0.85),
          originationWeek: 0,
          maturityWeek,
          seniority: 'SENIOR' as const,
        };
  });
}

interface CompanyTemplate {
  ticker: string;
  name: string;
  sector: Sector;
  revBase: number;
  ebitdaMargin: number;
  debtBase: number;
  cashBase: number;
  shares: number;
  initialRating: CreditRating;
  beta: number;
  bankMarketShare?: number;
  institutionalRole?: 'INSURER' | 'ASSET_MANAGER' | null;
  institutionalMarketShare?: number;
}

const REGION_COMPANIES: Record<RegionId, CompanyTemplate[]> = {
  USA: [
    // Tech (10)
    { ticker: 'TOPE', name: 'Astral Byte', sector: 'Tech', revBase: 125000, ebitdaMargin: 0.44, debtBase: 25000, cashBase: 38000, shares: 2800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'LYRQ', name: 'Horizon Cloud', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.38, debtBase: 19000, cashBase: 22000, shares: 1950, initialRating: 'AA', beta: 1.35 },
    { ticker: 'JYVJ', name: 'Galactic Logic', sector: 'Tech', revBase: 64000, ebitdaMargin: 0.35, debtBase: 24000, cashBase: 12000, shares: 1400, initialRating: 'A', beta: 1.45 },
    { ticker: 'RBOD', name: 'Orion Networks', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.28, debtBase: 31000, cashBase: 8000, shares: 920, initialRating: 'BBB', beta: 1.18 },
    { ticker: 'DENZ', name: 'Apex Byte', sector: 'Tech', revBase: 29000, ebitdaMargin: 0.24, debtBase: 28000, cashBase: 4500, shares: 680, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'DWTG', name: 'Pearl Cybernetics', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.19, debtBase: 26000, cashBase: 3200, shares: 540, initialRating: 'BB', beta: 1.40 },
    { ticker: 'ISAH', name: 'Obsidian Cyber', sector: 'Tech', revBase: 18500, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 2100, shares: 410, initialRating: 'BB', beta: 1.55 },
    { ticker: 'TRGI', name: 'Quantum Digital', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.13, debtBase: 29000, cashBase: 1100, shares: 330, initialRating: 'B', beta: 1.65 },
    { ticker: 'WAUB', name: 'Aqua Cyber', sector: 'Tech', revBase: 8500, ebitdaMargin: 0.08, debtBase: 25000, cashBase: 650, shares: 250, initialRating: 'B', beta: 1.80 },
    { ticker: 'ZXDW', name: 'Orion Logic', sector: 'Tech', revBase: 5200, ebitdaMargin: 0.04, debtBase: 22000, cashBase: 320, shares: 180, initialRating: 'CCC', beta: 2.10 },

    // Energy (10)
    { ticker: 'WPQW', name: 'Atlas Power', sector: 'Energy', revBase: 95000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 14000, shares: 1800, initialRating: 'AA', beta: 0.85 },
    { ticker: 'PAFG', name: 'Silver Hydro', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.29, debtBase: 32000, cashBase: 9500, shares: 1450, initialRating: 'A', beta: 0.95 },
    { ticker: 'XBDC', name: 'Aether Petroleum', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.42, debtBase: 48000, cashBase: 4200, shares: 980, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'HACG', name: 'Majestic Grid', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.26, debtBase: 38000, cashBase: 3100, shares: 720, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'YIPQ', name: 'Astral Grid', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.22, debtBase: 30000, cashBase: 2800, shares: 610, initialRating: 'BB', beta: 1.30 },
    { ticker: 'VWYD', name: 'Chronos Renewables', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 3500, shares: 890, initialRating: 'BB', beta: 1.05 },
    { ticker: 'SPPE', name: 'Steel Wind', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.14, debtBase: 19000, cashBase: 1200, shares: 420, initialRating: 'B', beta: 1.45 },
    { ticker: 'YTVN', name: 'Stellar Exploration', sector: 'Energy', revBase: 15000, ebitdaMargin: 0.20, debtBase: 22000, cashBase: 1400, shares: 380, initialRating: 'BB', beta: 1.10 },
    { ticker: 'KOOW', name: 'Aurora Offshore', sector: 'Energy', revBase: 13500, ebitdaMargin: 0.15, debtBase: 27000, cashBase: 800, shares: 310, initialRating: 'B', beta: 1.60 },
    { ticker: 'CICK', name: 'Heritage Nuclear', sector: 'Energy', revBase: 7200, ebitdaMargin: 0.09, debtBase: 18000, cashBase: 290, shares: 210, initialRating: 'CCC', beta: 1.75 },

    // Financials (10)
    { ticker: 'MDVI', name: 'Prime Mutual', sector: 'Financials', revBase: 140000, ebitdaMargin: 0.36, debtBase: 110000, cashBase: 65000, shares: 2900, initialRating: 'AAA', beta: 0.95, institutionalRole: 'INSURER', institutionalMarketShare: 0.55 },
    { ticker: 'ZTND', name: 'Stellar Equities', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.31, debtBase: 74000, cashBase: 34000, shares: 1600, initialRating: 'AA', beta: 1.05, institutionalRole: 'ASSET_MANAGER', institutionalMarketShare: 0.45 },
    { ticker: 'AFIG', name: 'Crystal Fund', sector: 'Financials', revBase: 58000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 21000, shares: 1200, initialRating: 'A', beta: 1.10 },
    { ticker: 'SHBT', name: 'Fauna Underwriters', sector: 'Financials', revBase: 32000, ebitdaMargin: 0.46, debtBase: 18000, cashBase: 15000, shares: 850, initialRating: 'AA', beta: 1.20 },
    { ticker: 'KBDM', name: 'Crest Underwriters', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.22, debtBase: 39000, cashBase: 18000, shares: 940, initialRating: 'A', beta: 0.80 },
    { ticker: 'ELFY', name: 'Terra Ventures', sector: 'Financials', revBase: 28000, ebitdaMargin: 0.40, debtBase: 42000, cashBase: 9000, shares: 620, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'ZJDG', name: 'Paramount Holdings', sector: 'Financials', revBase: 22000, ebitdaMargin: 0.25, debtBase: 38000, cashBase: 4800, shares: 510, initialRating: 'BB', beta: 1.50 },
    { ticker: 'TFGP', name: 'Heritage Assurance', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.16, debtBase: 28000, cashBase: 2100, shares: 430, initialRating: 'B', beta: 1.70 },
    { ticker: 'THZS', name: 'Onyx Insurance', sector: 'Financials', revBase: 16500, ebitdaMargin: 0.24, debtBase: 25000, cashBase: 3100, shares: 390, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'ZFMU', name: 'Apollo Group', sector: 'Financials', revBase: 9800, ebitdaMargin: 0.12, debtBase: 31000, cashBase: 850, shares: 280, initialRating: 'CCC', beta: 1.95 },

    // Industrials (10)
    { ticker: 'GKPF', name: 'Titan Rail', sector: 'Industrials', revBase: 76000, ebitdaMargin: 0.18, debtBase: 45000, cashBase: 11000, shares: 1100, initialRating: 'A', beta: 1.10 },
    { ticker: 'MPXU', name: 'Pioneer Aviation', sector: 'Industrials', revBase: 64000, ebitdaMargin: 0.22, debtBase: 32000, cashBase: 9800, shares: 980, initialRating: 'A', beta: 1.05 },
    { ticker: 'TBWK', name: 'Pioneer Industries', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.38, debtBase: 36000, cashBase: 4200, shares: 740, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'FTLY', name: 'Zenith Logistics', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'QXRT', name: 'Lumina Machinery', sector: 'Industrials', revBase: 58000, ebitdaMargin: 0.14, debtBase: 48000, cashBase: 6200, shares: 1250, initialRating: 'BB', beta: 1.40 },
    { ticker: 'NOIV', name: 'Helios Aviation', sector: 'Industrials', revBase: 31000, ebitdaMargin: 0.21, debtBase: 26000, cashBase: 3900, shares: 640, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'DHYN', name: 'Crest Aerospace', sector: 'Industrials', revBase: 27000, ebitdaMargin: 0.15, debtBase: 29000, cashBase: 2400, shares: 530, initialRating: 'BB', beta: 1.35 },
    { ticker: 'TDRT', name: 'Aero Marine', sector: 'Industrials', revBase: 22000, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 1900, shares: 410, initialRating: 'BB', beta: 1.15 },
    { ticker: 'WEGP', name: 'Atlas Aerospace', sector: 'Industrials', revBase: 16000, ebitdaMargin: 0.15, debtBase: 19000, cashBase: 1100, shares: 350, initialRating: 'B', beta: 0.95 },
    { ticker: 'HHYP', name: 'Vertex Defense', sector: 'Industrials', revBase: 8400, ebitdaMargin: 0.08, debtBase: 17000, cashBase: 410, shares: 220, initialRating: 'CCC', beta: 1.65 },

    // Consumer (10)
    { ticker: 'GQAR', name: 'Sapphire Retail', sector: 'Consumer', revBase: 210000, ebitdaMargin: 0.09, debtBase: 55000, cashBase: 26000, shares: 3800, initialRating: 'AA', beta: 0.65 },
    { ticker: 'LXQI', name: 'Frontier Hospitality', sector: 'Consumer', revBase: 72000, ebitdaMargin: 0.31, debtBase: 38000, cashBase: 16000, shares: 1850, initialRating: 'AAA', beta: 0.60 },
    { ticker: 'WJEP', name: 'Ignis Brands', sector: 'Consumer', revBase: 41000, ebitdaMargin: 0.26, debtBase: 24000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.15 },
    { ticker: 'MEUN', name: 'Aurora Beverages', sector: 'Consumer', revBase: 52000, ebitdaMargin: 0.18, debtBase: 37000, cashBase: 6200, shares: 1150, initialRating: 'A', beta: 0.55 },
    { ticker: 'XNOG', name: 'Lumina Stores', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.35, debtBase: 41000, cashBase: 4900, shares: 760, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'RZVF', name: 'Crown Hospitality', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 35000, cashBase: 7800, shares: 990, initialRating: 'A', beta: 0.70 },
    { ticker: 'QZYN', name: 'Zenith Grocers', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.23, debtBase: 38000, cashBase: 2900, shares: 620, initialRating: 'BB', beta: 1.30 },
    { ticker: 'CELA', name: 'Diamond Leisure', sector: 'Consumer', revBase: 19000, ebitdaMargin: 0.20, debtBase: 44000, cashBase: 2200, shares: 580, initialRating: 'B', beta: 1.70 },
    { ticker: 'ZIUS', name: 'Emerald Brands', sector: 'Consumer', revBase: 14500, ebitdaMargin: 0.17, debtBase: 18000, cashBase: 1400, shares: 410, initialRating: 'BB', beta: 1.10 },
    { ticker: 'WSJZ', name: 'Obsidian Apparel', sector: 'Consumer', revBase: 6500, ebitdaMargin: 0.07, debtBase: 19000, cashBase: 280, shares: 240, initialRating: 'CCC', beta: 1.60 },
    // Banks (4)
    { ticker: 'MRDN', name: 'Meridian National Bank', sector: 'Banks', revBase: 42000, ebitdaMargin: 0.35, debtBase: 8000, cashBase: 15000, shares: 1200, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'CRWN', name: 'Crown Federal Financial', sector: 'Banks', revBase: 34000, ebitdaMargin: 0.33, debtBase: 6500, cashBase: 12000, shares: 950, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'HRTG', name: 'Heritage Trust Bancorp', sector: 'Banks', revBase: 26000, ebitdaMargin: 0.31, debtBase: 5000, cashBase: 9000, shares: 780, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'ANLT', name: 'Anchorline Community Bank', sector: 'Banks', revBase: 18000, ebitdaMargin: 0.28, debtBase: 3500, cashBase: 6000, shares: 520, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
  ],
  UK: [
    // Tech (10)
    { ticker: 'DLET', name: 'Lumina Digital', sector: 'Tech', revBase: 45000, ebitdaMargin: 0.46, debtBase: 8000, cashBase: 14000, shares: 1200, initialRating: 'AAA', beta: 1.20 },
    { ticker: 'MTYT', name: 'Copper Semiconductors', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.34, debtBase: 9500, cashBase: 8200, shares: 750, initialRating: 'AA', beta: 1.30 },
    { ticker: 'YWWH', name: 'Equinox Technologies', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.27, debtBase: 11000, cashBase: 4600, shares: 520, initialRating: 'A', beta: 1.40 },
    { ticker: 'DBHJ', name: 'Ignis Data', sector: 'Tech', revBase: 14000, ebitdaMargin: 0.22, debtBase: 12500, cashBase: 3100, shares: 410, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'XRGA', name: 'Bronze Analytics', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.29, debtBase: 18000, cashBase: 4500, shares: 580, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'PWHZ', name: 'Prime Robotics', sector: 'Tech', revBase: 12500, ebitdaMargin: 0.18, debtBase: 16000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.35 },
    { ticker: 'DWUK', name: 'Pinnacle Cyber', sector: 'Tech', revBase: 8900, ebitdaMargin: 0.15, debtBase: 14000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.45 },
    { ticker: 'NBQA', name: 'Horizon Byte', sector: 'Tech', revBase: 7100, ebitdaMargin: 0.12, debtBase: 13000, cashBase: 850, shares: 240, initialRating: 'B', beta: 1.55 },
    { ticker: 'QBTY', name: 'Helios Semiconductors', sector: 'Tech', revBase: 5400, ebitdaMargin: 0.08, debtBase: 15000, cashBase: 490, shares: 190, initialRating: 'B', beta: 1.70 },
    { ticker: 'POCK', name: 'Apex Cloud', sector: 'Tech', revBase: 3200, ebitdaMargin: 0.02, debtBase: 11000, cashBase: 210, shares: 140, initialRating: 'CCC', beta: 2.05 },

    // Energy (10)
    { ticker: 'HOES', name: 'Celestial Offshore', sector: 'Energy', revBase: 115000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 22000, shares: 2400, initialRating: 'A', beta: 0.90 },
    { ticker: 'DEVM', name: 'Chronos Solar', sector: 'Energy', revBase: 130000, ebitdaMargin: 0.30, debtBase: 58000, cashBase: 27000, shares: 2600, initialRating: 'AA', beta: 0.88 },
    { ticker: 'DFLY', name: 'Obsidian Nuclear', sector: 'Energy', revBase: 32000, ebitdaMargin: 0.33, debtBase: 28000, cashBase: 4800, shares: 720, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'CYNS', name: 'United Petroleum', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.38, debtBase: 34000, cashBase: 3600, shares: 620, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'KEIV', name: 'Horizon Exploration', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.42, debtBase: 46000, cashBase: 4100, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'QGNO', name: 'Apollo Renewables', sector: 'Energy', revBase: 42000, ebitdaMargin: 0.15, debtBase: 31000, cashBase: 3900, shares: 950, initialRating: 'BBB', beta: 0.95 },
    { ticker: 'WWKW', name: 'Silver Resources', sector: 'Energy', revBase: 8500, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1100, shares: 310, initialRating: 'BB', beta: 1.40 },
    { ticker: 'MTQT', name: 'Lumina Geothermal', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1300, shares: 350, initialRating: 'BB', beta: 1.20 },
    { ticker: 'UKXG', name: 'Stratos Utility', sector: 'Energy', revBase: 6800, ebitdaMargin: 0.13, debtBase: 12000, cashBase: 720, shares: 240, initialRating: 'B', beta: 1.50 },
    { ticker: 'HCGZ', name: 'Aether Power', sector: 'Energy', revBase: 4100, ebitdaMargin: 0.05, debtBase: 13000, cashBase: 220, shares: 160, initialRating: 'CCC', beta: 1.80 },

    // Financials (10)
    { ticker: 'TUEE', name: 'Heritage Group', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.35, debtBase: 78000, cashBase: 45000, shares: 2200, initialRating: 'AA', beta: 0.90, institutionalRole: 'INSURER', institutionalMarketShare: 0.55 },
    { ticker: 'OLIP', name: 'Terra Holdings', sector: 'Financials', revBase: 68000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 29000, shares: 1700, initialRating: 'A', beta: 1.15, institutionalRole: 'ASSET_MANAGER', institutionalMarketShare: 0.45 },
    { ticker: 'DSYM', name: 'Ruby Holdings', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.33, debtBase: 42000, cashBase: 21000, shares: 1400, initialRating: 'A', beta: 0.95 },
    { ticker: 'LEMM', name: 'Helios Holdings', sector: 'Financials', revBase: 41000, ebitdaMargin: 0.30, debtBase: 38000, cashBase: 18000, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'NTKR', name: 'Quantum Exchange', sector: 'Financials', revBase: 36000, ebitdaMargin: 0.24, debtBase: 29000, cashBase: 16000, shares: 920, initialRating: 'A', beta: 1.00 },
    { ticker: 'UMPO', name: 'Global Bank', sector: 'Financials', revBase: 24000, ebitdaMargin: 0.48, debtBase: 19000, cashBase: 9500, shares: 680, initialRating: 'AA', beta: 0.85 },
    { ticker: 'UYJC', name: 'Lumina Underwriters', sector: 'Financials', revBase: 18000, ebitdaMargin: 0.36, debtBase: 12000, cashBase: 7200, shares: 510, initialRating: 'A', beta: 1.10 },
    { ticker: 'WRVH', name: 'Aegis Mutual', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1600, shares: 320, initialRating: 'BB', beta: 1.60 },
    { ticker: 'MWTF', name: 'Solar Capital', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 2100, shares: 440, initialRating: 'BB', beta: 1.35 },
    { ticker: 'TZTK', name: 'Pearl Fund', sector: 'Financials', revBase: 5800, ebitdaMargin: 0.10, debtBase: 18000, cashBase: 430, shares: 210, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'WQWP', name: 'Stratos Transport', sector: 'Industrials', revBase: 42000, ebitdaMargin: 0.17, debtBase: 28000, cashBase: 7500, shares: 1100, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'BZDL', name: 'Apollo Heavy', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 22000, cashBase: 9800, shares: 980, initialRating: 'AA', beta: 0.75 },
    { ticker: 'QQKS', name: 'Steel Freight', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.16, debtBase: 48000, cashBase: 14000, shares: 1900, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'NESL', name: 'Galactic Manufacturing', sector: 'Industrials', revBase: 78000, ebitdaMargin: 0.38, debtBase: 28000, cashBase: 18000, shares: 1550, initialRating: 'AA', beta: 1.15 },
    { ticker: 'RYCT', name: 'Beacon Motors', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.26, debtBase: 34000, cashBase: 8900, shares: 1200, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'VHEQ', name: 'Copper Heavy', sector: 'Industrials', revBase: 18000, ebitdaMargin: 0.13, debtBase: 16000, cashBase: 2400, shares: 520, initialRating: 'BB', beta: 1.10 },
    { ticker: 'YXSK', name: 'Meridian Aerospace', sector: 'Industrials', revBase: 12500, ebitdaMargin: 0.19, debtBase: 13000, cashBase: 1900, shares: 380, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'XJYK', name: 'Stratos Engineering', sector: 'Industrials', revBase: 9800, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1200, shares: 310, initialRating: 'BB', beta: 1.25 },
    { ticker: 'JMBW', name: 'Vertex Shipping', sector: 'Industrials', revBase: 7400, ebitdaMargin: 0.12, debtBase: 11000, cashBase: 850, shares: 250, initialRating: 'B', beta: 1.40 },
    { ticker: 'ZCJS', name: 'Nexus Shipping', sector: 'Industrials', revBase: 5100, ebitdaMargin: 0.06, debtBase: 15000, cashBase: 280, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Consumer (10)
    { ticker: 'YPHZ', name: 'Onyx Hospitality', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.24, debtBase: 39000, cashBase: 15000, shares: 2100, initialRating: 'AAA', beta: 0.55 },
    { ticker: 'YWCZ', name: 'Bronze Leisure', sector: 'Consumer', revBase: 38000, ebitdaMargin: 0.36, debtBase: 28000, cashBase: 8200, shares: 1150, initialRating: 'AA', beta: 0.70 },
    { ticker: 'PKXC', name: 'Pioneer Fashions', sector: 'Consumer', revBase: 44000, ebitdaMargin: 0.44, debtBase: 52000, cashBase: 7800, shares: 1300, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'YLMK', name: 'Obsidian Luxuries', sector: 'Consumer', revBase: 76000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 8900, shares: 1800, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'PPSB', name: 'Apollo Entertainment', sector: 'Consumer', revBase: 65000, ebitdaMargin: 0.32, debtBase: 34000, cashBase: 16000, shares: 1550, initialRating: 'AA', beta: 0.60 },
    { ticker: 'DCJY', name: 'Aether Goods', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.26, debtBase: 21000, cashBase: 6200, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'KGCL', name: 'Paramount Cosmetics', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.21, debtBase: 12000, cashBase: 3100, shares: 480, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'PTQB', name: 'Equinox Media', sector: 'Consumer', revBase: 21000, ebitdaMargin: 0.15, debtBase: 26000, cashBase: 2900, shares: 640, initialRating: 'BB', beta: 1.50 },
    { ticker: 'VCHX', name: 'Platinum Hospitality', sector: 'Consumer', revBase: 11000, ebitdaMargin: 0.12, debtBase: 19000, cashBase: 1100, shares: 380, initialRating: 'B', beta: 1.35 },
    { ticker: 'MBHK', name: 'Allied Cosmetics', sector: 'Consumer', revBase: 4800, ebitdaMargin: 0.06, debtBase: 16000, cashBase: 310, shares: 210, initialRating: 'CCC', beta: 1.90 },
    // Banks (4)
    { ticker: 'LMBR', name: 'Lombard Royal Bank', sector: 'Banks', revBase: 22000, ebitdaMargin: 0.35, debtBase: 4000, cashBase: 8000, shares: 700, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'THMS', name: 'Thames City Financial', sector: 'Banks', revBase: 18000, ebitdaMargin: 0.33, debtBase: 3200, cashBase: 6500, shares: 550, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'BRIX', name: 'Brixton Trust Bancorp', sector: 'Banks', revBase: 14000, ebitdaMargin: 0.31, debtBase: 2500, cashBase: 4500, shares: 450, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'SHIR', name: 'Shire Community Bank', sector: 'Banks', revBase: 9000, ebitdaMargin: 0.28, debtBase: 1800, cashBase: 3000, shares: 320, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
  ],
  JPN: [
    // Tech (10)
    { ticker: 'PPNH', name: 'Bronze Digital', sector: 'Tech', revBase: 110000, ebitdaMargin: 0.25, debtBase: 32000, cashBase: 29000, shares: 2100, initialRating: 'AA', beta: 1.10 },
    { ticker: 'JOWH', name: 'Apollo Micro', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.35, debtBase: 8500, cashBase: 16000, shares: 980, initialRating: 'AAA', beta: 1.35 },
    { ticker: 'MNCR', name: 'Lumina Interactive', sector: 'Tech', revBase: 84000, ebitdaMargin: 0.28, debtBase: 120000, cashBase: 38000, shares: 2200, initialRating: 'BB', beta: 1.65 },
    { ticker: 'OIUL', name: 'Astral Digital', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.52, debtBase: 3000, cashBase: 21000, shares: 620, initialRating: 'AAA', beta: 1.05 },
    { ticker: 'INXC', name: 'Diamond Computing', sector: 'Tech', revBase: 34000, ebitdaMargin: 0.31, debtBase: 22000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.30 },
    { ticker: 'AKLO', name: 'Eclipse Logic', sector: 'Tech', revBase: 65000, ebitdaMargin: 0.12, debtBase: 38000, cashBase: 12000, shares: 1700, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'LGSB', name: 'United Computing', sector: 'Tech', revBase: 31000, ebitdaMargin: 0.11, debtBase: 26000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'UWUN', name: 'Aurora Byte', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.33, debtBase: 6000, cashBase: 14000, shares: 580, initialRating: 'AA', beta: 1.20 },
    { ticker: 'AAWG', name: 'Majestic Cloud', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 2200, shares: 350, initialRating: 'BB', beta: 1.45 },
    { ticker: 'YNNA', name: 'United Logic', sector: 'Tech', revBase: 5800, ebitdaMargin: 0.03, debtBase: 19000, cashBase: 390, shares: 220, initialRating: 'CCC', beta: 2.15 },

    // Energy (10)
    { ticker: 'LHYO', name: 'Helios Oil', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.62, debtBase: 22000, cashBase: 12000, shares: 980, initialRating: 'A', beta: 0.95 },
    { ticker: 'YATF', name: 'Nexus Hydro', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.08, debtBase: 44000, cashBase: 9500, shares: 1850, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'CFZJ', name: 'Vanguard Gas', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.14, debtBase: 88000, cashBase: 11000, shares: 1600, initialRating: 'B', beta: 1.25 },
    { ticker: 'MFXP', name: 'Heritage Solar', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.22, debtBase: 54000, cashBase: 6800, shares: 1100, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'CRKP', name: 'Pearl Grid', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.19, debtBase: 32000, cashBase: 5900, shares: 920, initialRating: 'A', beta: 0.70 },
    { ticker: 'AHJX', name: 'Steel Offshore', sector: 'Energy', revBase: 27000, ebitdaMargin: 0.17, debtBase: 24000, cashBase: 4800, shares: 740, initialRating: 'A', beta: 0.65 },
    { ticker: 'NLTL', name: 'Astral Renewables', sector: 'Energy', revBase: 7500, ebitdaMargin: 0.35, debtBase: 19000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.35 },
    { ticker: 'EZSM', name: 'Onyx Offshore', sector: 'Energy', revBase: 31000, ebitdaMargin: 0.16, debtBase: 38000, cashBase: 3900, shares: 810, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'RHRE', name: 'Beacon Resources', sector: 'Energy', revBase: 5900, ebitdaMargin: 0.24, debtBase: 14000, cashBase: 780, shares: 230, initialRating: 'BB', beta: 1.20 },
    { ticker: 'CKRX', name: 'Bronze Petroleum', sector: 'Energy', revBase: 12000, ebitdaMargin: 0.07, debtBase: 29000, cashBase: 620, shares: 380, initialRating: 'CCC', beta: 1.65 },

    // Financials (10)
    { ticker: 'RNFO', name: 'Alpha Syndicate', sector: 'Financials', revBase: 98000, ebitdaMargin: 0.38, debtBase: 82000, cashBase: 55000, shares: 2600, initialRating: 'AA', beta: 0.85, institutionalRole: 'INSURER', institutionalMarketShare: 0.55 },
    { ticker: 'IZZP', name: 'Pinnacle Assurance', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.36, debtBase: 69000, cashBase: 44000, shares: 2100, initialRating: 'AA', beta: 0.90, institutionalRole: 'ASSET_MANAGER', institutionalMarketShare: 0.45 },
    { ticker: 'KYJS', name: 'Pioneer Capital', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.32, debtBase: 58000, cashBase: 32000, shares: 1800, initialRating: 'A', beta: 0.95 },
    { ticker: 'QHLF', name: 'Lunar Holdings', sector: 'Financials', revBase: 34000, ebitdaMargin: 0.26, debtBase: 46000, cashBase: 16000, shares: 980, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'ASOH', name: 'Fauna Wealth', sector: 'Financials', revBase: 31000, ebitdaMargin: 0.34, debtBase: 38000, cashBase: 11000, shares: 850, initialRating: 'A', beta: 1.10 },
    { ticker: 'BYQD', name: 'Crystal Exchange', sector: 'Financials', revBase: 42000, ebitdaMargin: 0.20, debtBase: 29000, cashBase: 18000, shares: 990, initialRating: 'AA', beta: 0.75 },
    { ticker: 'KHDC', name: 'Vertex Mutual', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.18, debtBase: 36000, cashBase: 22000, shares: 1150, initialRating: 'A', beta: 0.80 },
    { ticker: 'CDQH', name: 'Emerald Advisors', sector: 'Financials', revBase: 16000, ebitdaMargin: 0.30, debtBase: 21000, cashBase: 4500, shares: 490, initialRating: 'BBB', beta: 1.45 },
    { ticker: 'WKGS', name: 'Obsidian Insurance', sector: 'Financials', revBase: 11500, ebitdaMargin: 0.22, debtBase: 24000, cashBase: 2100, shares: 380, initialRating: 'BB', beta: 1.55 },
    { ticker: 'WBEC', name: 'Obsidian Investments', sector: 'Financials', revBase: 4900, ebitdaMargin: 0.12, debtBase: 17000, cashBase: 390, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Industrials (10)
    { ticker: 'DOSD', name: 'Nova Aviation', sector: 'Industrials', revBase: 240000, ebitdaMargin: 0.15, debtBase: 110000, cashBase: 48000, shares: 4200, initialRating: 'AAA', beta: 0.70 },
    { ticker: 'ANMG', name: 'Prime Engineering', sector: 'Industrials', revBase: 52000, ebitdaMargin: 0.14, debtBase: 28000, cashBase: 9500, shares: 1250, initialRating: 'A', beta: 1.15 },
    { ticker: 'SJUQ', name: 'Platinum Aviation', sector: 'Industrials', revBase: 39000, ebitdaMargin: 0.20, debtBase: 19000, cashBase: 8200, shares: 950, initialRating: 'A', beta: 1.20 },
    { ticker: 'QUIV', name: 'Crest Engineering', sector: 'Industrials', revBase: 88000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 16000, shares: 1950, initialRating: 'AA', beta: 0.90 },
    { ticker: 'ETTU', name: 'Frontier Engineering', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.13, debtBase: 21000, cashBase: 11000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'WKJE', name: 'Celestial Aerospace', sector: 'Industrials', revBase: 68000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 7800, shares: 1650, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'JREZ', name: 'Lumina Dynamics', sector: 'Industrials', revBase: 36000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 8900, shares: 890, initialRating: 'AA', beta: 0.95 },
    { ticker: 'CIPP', name: 'Paramount Rail', sector: 'Industrials', revBase: 29000, ebitdaMargin: 0.25, debtBase: 28000, cashBase: 4900, shares: 720, initialRating: 'BBB', beta: 1.40 },
    { ticker: 'PWHW', name: 'Vertex Heavy', sector: 'Industrials', revBase: 19000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 2600, shares: 510, initialRating: 'BB', beta: 1.10 },
    { ticker: 'OXYU', name: 'Beacon Transport', sector: 'Industrials', revBase: 6200, ebitdaMargin: 0.05, debtBase: 17000, cashBase: 340, shares: 220, initialRating: 'CCC', beta: 1.95 },

    // Consumer (10)
    { ticker: 'IREM', name: 'Diamond Retail', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.42, debtBase: 1000, cashBase: 24000, shares: 890, initialRating: 'AAA', beta: 0.75 },
    { ticker: 'UFEW', name: 'Chronos Cosmetics', sector: 'Consumer', revBase: 42000, ebitdaMargin: 0.22, debtBase: 14000, cashBase: 16000, shares: 1050, initialRating: 'AA', beta: 0.80 },
    { ticker: 'TJGQ', name: 'Global Cosmetics', sector: 'Consumer', revBase: 85000, ebitdaMargin: 0.09, debtBase: 44000, cashBase: 12000, shares: 1900, initialRating: 'A', beta: 0.65 },
    { ticker: 'RIGK', name: 'Emerald Retail', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.15, debtBase: 12000, cashBase: 3800, shares: 520, initialRating: 'A', beta: 0.90 },
    { ticker: 'VVQH', name: 'Atlas Media', sector: 'Consumer', revBase: 29000, ebitdaMargin: 0.17, debtBase: 26000, cashBase: 4500, shares: 740, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'DRIA', name: 'Paramount Apparel', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.16, debtBase: 24000, cashBase: 4100, shares: 690, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'DKTM', name: 'Galactic Apparel', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.08, debtBase: 52000, cashBase: 3500, shares: 980, initialRating: 'B', beta: 1.60 },
    { ticker: 'VLNO', name: 'Aurora Grocers', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.32, debtBase: 11000, cashBase: 5200, shares: 480, initialRating: 'AA', beta: 0.85 },
    { ticker: 'RHWU', name: 'Vanguard Hospitality', sector: 'Consumer', revBase: 12500, ebitdaMargin: 0.16, debtBase: 9500, cashBase: 2400, shares: 380, initialRating: 'A', beta: 0.55 },
    { ticker: 'JZYB', name: 'Obsidian Cosmetics', sector: 'Consumer', revBase: 4500, ebitdaMargin: 0.06, debtBase: 14000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.70 },
    // Banks (4)
    { ticker: 'EDOB', name: 'Edo National Bank', sector: 'Banks', revBase: 28000, ebitdaMargin: 0.35, debtBase: 5000, cashBase: 9000, shares: 800, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'KYOF', name: 'Kyoto Federal Financial', sector: 'Banks', revBase: 22000, ebitdaMargin: 0.33, debtBase: 4200, cashBase: 7500, shares: 650, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'OSKT', name: 'Osaka Trust Bancorp', sector: 'Banks', revBase: 17000, ebitdaMargin: 0.31, debtBase: 3500, cashBase: 5500, shares: 550, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'SAPB', name: 'Sapporo Community Bank', sector: 'Banks', revBase: 12000, ebitdaMargin: 0.28, debtBase: 2500, cashBase: 4000, shares: 420, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
  ],
  EUR: [
    // Tech (10)
    { ticker: 'GHRH', name: 'Ruby Software', sector: 'Tech', revBase: 95000, ebitdaMargin: 0.42, debtBase: 14000, cashBase: 26000, shares: 1800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'GWVW', name: 'Ruby Networks', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.34, debtBase: 22000, cashBase: 18000, shares: 1750, initialRating: 'AA', beta: 0.95 },
    { ticker: 'KHGS', name: 'Crest Data', sector: 'Tech', revBase: 36000, ebitdaMargin: 0.30, debtBase: 12000, cashBase: 8500, shares: 940, initialRating: 'A', beta: 1.35 },
    { ticker: 'QFLK', name: 'Nova AI', sector: 'Tech', revBase: 38000, ebitdaMargin: 0.28, debtBase: 19000, cashBase: 7200, shares: 980, initialRating: 'A', beta: 1.30 },
    { ticker: 'XSFL', name: 'Ruby Cloud', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.36, debtBase: 8000, cashBase: 6500, shares: 620, initialRating: 'AA', beta: 0.90 },
    { ticker: 'GPXU', name: 'Emerald Interactive', sector: 'Tech', revBase: 24000, ebitdaMargin: 0.09, debtBase: 38000, cashBase: 2200, shares: 720, initialRating: 'CCC', beta: 2.10 },
    { ticker: 'EJHE', name: 'Emerald Systems', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.38, debtBase: 16000, cashBase: 4900, shares: 540, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'GBMG', name: 'Astral Robotics', sector: 'Tech', revBase: 11000, ebitdaMargin: 0.31, debtBase: 14000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.50 },
    { ticker: 'ZGNR', name: 'Stratos Networks', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.05, debtBase: 32000, cashBase: 2800, shares: 810, initialRating: 'B', beta: 1.75 },
    { ticker: 'WJLX', name: 'Ruby Hardware', sector: 'Tech', revBase: 7200, ebitdaMargin: 0.16, debtBase: 8500, cashBase: 1100, shares: 250, initialRating: 'BB', beta: 1.40 },

    // Energy (10)
    { ticker: 'WBGJ', name: 'Global Petroleum', sector: 'Energy', revBase: 140000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 31000, shares: 2700, initialRating: 'AA', beta: 0.88 },
    { ticker: 'FGLQ', name: 'Solar Solar', sector: 'Energy', revBase: 92000, ebitdaMargin: 0.25, debtBase: 48000, cashBase: 16000, shares: 1900, initialRating: 'A', beta: 0.95 },
    { ticker: 'THSH', name: 'Global Exploration', sector: 'Energy', revBase: 58000, ebitdaMargin: 0.38, debtBase: 68000, cashBase: 9500, shares: 1450, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'CQYU', name: 'Onyx Renewables', sector: 'Energy', revBase: 84000, ebitdaMargin: 0.32, debtBase: 95000, cashBase: 12000, shares: 1950, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'TBSE', name: 'Apollo Wind', sector: 'Energy', revBase: 22000, ebitdaMargin: 0.36, debtBase: 34000, cashBase: 4100, shares: 620, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'TNKI', name: 'Flora Grid', sector: 'Energy', revBase: 71000, ebitdaMargin: 0.21, debtBase: 49000, cashBase: 9800, shares: 1600, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'UYVI', name: 'Majestic Electric', sector: 'Energy', revBase: 52000, ebitdaMargin: 0.20, debtBase: 28000, cashBase: 6900, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'FKZZ', name: 'Zenith Exploration', sector: 'Energy', revBase: 110000, ebitdaMargin: 0.22, debtBase: 140000, cashBase: 14000, shares: 2400, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'QYHS', name: 'Zenith Gas', sector: 'Energy', revBase: 14000, ebitdaMargin: 0.08, debtBase: 19000, cashBase: 1400, shares: 420, initialRating: 'B', beta: 1.55 },
    { ticker: 'RAWH', name: 'Atlas Offshore', sector: 'Energy', revBase: 4800, ebitdaMargin: 0.04, debtBase: 15000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.85 },

    // Financials (10)
    { ticker: 'CKNU', name: 'Zenith Insurance', sector: 'Financials', revBase: 115000, ebitdaMargin: 0.34, debtBase: 98000, cashBase: 62000, shares: 2500, initialRating: 'AA', beta: 1.00, institutionalRole: 'ASSET_MANAGER', institutionalMarketShare: 0.45 },
    { ticker: 'IXGB', name: 'Crystal Securities', sector: 'Financials', revBase: 125000, ebitdaMargin: 0.22, debtBase: 65000, cashBase: 48000, shares: 2600, initialRating: 'AAA', beta: 0.70, institutionalRole: 'INSURER', institutionalMarketShare: 0.55 },
    { ticker: 'CUJO', name: 'Sapphire Capital', sector: 'Financials', revBase: 88000, ebitdaMargin: 0.32, debtBase: 84000, cashBase: 39000, shares: 2200, initialRating: 'A', beta: 1.10 },
    { ticker: 'DIBY', name: 'Fauna Insurance', sector: 'Financials', revBase: 52000, ebitdaMargin: 0.36, debtBase: 48000, cashBase: 28000, shares: 1450, initialRating: 'A', beta: 1.05 },
    { ticker: 'HJZB', name: 'Titan Capital', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.20, debtBase: 58000, cashBase: 36000, shares: 2100, initialRating: 'AA', beta: 0.75 },
    { ticker: 'AUNM', name: 'Alpha Partners', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.24, debtBase: 78000, cashBase: 29000, shares: 1700, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'FEVV', name: 'Eclipse Financial', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.38, debtBase: 44000, cashBase: 22000, shares: 1350, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'OXQI', name: 'Astral Exchange', sector: 'Financials', revBase: 54000, ebitdaMargin: 0.35, debtBase: 49000, cashBase: 24000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'KVFC', name: 'Global Mutual', sector: 'Financials', revBase: 46000, ebitdaMargin: 0.36, debtBase: 42000, cashBase: 21000, shares: 1300, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'CVTI', name: 'Bronze Assurance', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.14, debtBase: 24000, cashBase: 1800, shares: 350, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'GHHF', name: 'Fauna Marine', sector: 'Industrials', revBase: 98000, ebitdaMargin: 0.19, debtBase: 42000, cashBase: 21000, shares: 2150, initialRating: 'AA', beta: 0.90 },
    { ticker: 'GLVU', name: 'Diamond Freight', sector: 'Industrials', revBase: 84000, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 22000, shares: 1800, initialRating: 'A', beta: 1.10 },
    { ticker: 'VATF', name: 'Astral Aviation', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 21000, cashBase: 11000, shares: 1200, initialRating: 'AA', beta: 0.95 },
    { ticker: 'TKXE', name: 'Meridian Dynamics', sector: 'Industrials', revBase: 195000, ebitdaMargin: 0.12, debtBase: 165000, cashBase: 35000, shares: 3400, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'YYVG', name: 'Nova Equipment', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.15, debtBase: 72000, cashBase: 24000, shares: 1900, initialRating: 'A', beta: 1.00 },
    { ticker: 'CFFG', name: 'Sapphire Machinery', sector: 'Industrials', revBase: 96000, ebitdaMargin: 0.16, debtBase: 78000, cashBase: 26000, shares: 2000, initialRating: 'A', beta: 1.05 },
    { ticker: 'RLKE', name: 'Quantum Freight', sector: 'Industrials', revBase: 74000, ebitdaMargin: 0.14, debtBase: 38000, cashBase: 9200, shares: 1650, initialRating: 'A', beta: 1.20 },
    { ticker: 'NOMX', name: 'Stratos Manufacturing', sector: 'Industrials', revBase: 32000, ebitdaMargin: 0.21, debtBase: 16000, cashBase: 8100, shares: 820, initialRating: 'A', beta: 1.05 },
    { ticker: 'GUCZ', name: 'Aero Aviation', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 3800, shares: 920, initialRating: 'BB', beta: 1.45 },
    { ticker: 'TLYZ', name: 'Apex Logistics', sector: 'Industrials', revBase: 8900, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 650, shares: 280, initialRating: 'CCC', beta: 1.80 },

    // Consumer (10)
    { ticker: 'AMTJ', name: 'Pinnacle Leisure', sector: 'Consumer', revBase: 120000, ebitdaMargin: 0.35, debtBase: 32000, cashBase: 24000, shares: 2200, initialRating: 'AAA', beta: 0.90 },
    { ticker: 'ZNSW', name: 'Chronos Stores', sector: 'Consumer', revBase: 110000, ebitdaMargin: 0.22, debtBase: 46000, cashBase: 19000, shares: 2300, initialRating: 'AAA', beta: 0.50 },
    { ticker: 'OREP', name: 'L\'Oreal Beauty & Cosmetics', sector: 'Consumer', revBase: 54000, ebitdaMargin: 0.25, debtBase: 14000, cashBase: 11000, shares: 1300, initialRating: 'AAA', beta: 0.65 },
    { ticker: 'BSPG', name: 'Titan Fashions', sector: 'Consumer', revBase: 22000, ebitdaMargin: 0.46, debtBase: 3000, cashBase: 12000, shares: 540, initialRating: 'AAA', beta: 0.80 },
    { ticker: 'HWUO', name: 'Copper Brands', sector: 'Consumer', revBase: 31000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 4200, shares: 780, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'RXYX', name: 'Aether Beverages', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 8000, cashBase: 16000, shares: 1200, initialRating: 'AA', beta: 0.85 },
    { ticker: 'CTKN', name: 'Lunar Entertainment', sector: 'Consumer', revBase: 28000, ebitdaMargin: 0.29, debtBase: 24000, cashBase: 5500, shares: 690, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'LAJP', name: 'Flora Fashions', sector: 'Consumer', revBase: 36000, ebitdaMargin: 0.17, debtBase: 22000, cashBase: 4900, shares: 910, initialRating: 'A', beta: 0.55 },
    { ticker: 'FSUT', name: 'Majestic Supermarkets', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.06, debtBase: 28000, cashBase: 6500, shares: 1750, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'NZPR', name: 'Pioneer Stores', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.03, debtBase: 34000, cashBase: 480, shares: 520, initialRating: 'CCC', beta: 2.05 },
  ],
};

/**
 * Generate 200 fully instantiated companies (50 per region across 5 sectors)
    // Banks (4)
    { ticker: 'CONT', name: 'Continental National Bank', sector: 'Banks', revBase: 32000, ebitdaMargin: 0.35, debtBase: 6000, cashBase: 11000, shares: 900, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'ALPF', name: 'Alpine Federal Financial', sector: 'Banks', revBase: 25000, ebitdaMargin: 0.33, debtBase: 5200, cashBase: 9500, shares: 750, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'RHNT', name: 'Rhine Trust Bancorp', sector: 'Banks', revBase: 20000, ebitdaMargin: 0.31, debtBase: 4500, cashBase: 7500, shares: 650, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'DANB', name: 'Danube Community Bank', sector: 'Banks', revBase: 14000, ebitdaMargin: 0.28, debtBase: 3500, cashBase: 5000, shares: 520, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
 */
export function generateInitialCompanies(): Company[] {
  const companies: Company[] = [];

  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];

  regions.forEach((region) => {
    const templates = REGION_COMPANIES[region];
    templates.forEach((rawTmpl) => {
      // Fix: Convert raw millions to absolute dollar units
      const tmpl: CompanyTemplate = {
        ...rawTmpl,
        revBase: rawTmpl.revBase * 1_000_000,
        debtBase: rawTmpl.debtBase * 1_000_000,
        cashBase: rawTmpl.cashBase * 1_000_000,
        shares: rawTmpl.shares * 1_000_000,
      };

      const ebitda = tmpl.revBase * tmpl.ebitdaMargin;
      const da = tmpl.revBase * 0.05; // 5% depreciation & amortization
      const ebit = Math.max(10, ebitda - da);

      const revPerEmployee: Record<string, number> = {
        Tech: 800_000,
        Financials: 1_000_000,
        Industrials: 300_000,
        Energy: 1_500_000,
        Consumer: 200_000,
        Healthcare: 400_000,
        Utilities: 1_200_000,
      };
      const employeeCount = Math.max(100, Math.round(tmpl.revBase / (revPerEmployee[tmpl.sector] ?? 500_000)));
      
      const interestRate = 0.045;
      const interestExpense = Math.max(1, tmpl.debtBase * interestRate);
      const taxRate = 0.21;
      const netIncome = Math.max(5, (ebit - interestExpense) * (1 - taxRate));
      const eps = Number((netIncome / tmpl.shares).toFixed(2));
      

      const leverage = Number((tmpl.debtBase / Math.max(1, ebitda)).toFixed(2));
      const interestCoverage = Number((ebit / interestExpense).toFixed(2));
      
      const sectorConfig = SECTOR_BENCHMARKS[tmpl.sector];
      const stockPrice = Number(priceEquity(eps, sectorConfig.basePE, 0.0, false).toFixed(2));
      
      const oasSpreadBps = RATING_OAS_SPREADS[tmpl.initialRating].baseBps;
      const cdsSpreadBps = oasSpreadBps + Math.floor(Math.random() * 10 - 5);
      
      // Fix: Start history with ONLY the initial realized data point
      const historicalPrices: number[] = [stockPrice];

      const baseSnapshot = {
        week: 1,
        filingPeriod: "Q4 '25",
        filingDate: 'Dec 31, 2025',
        baselineAnnualRevenue: tmpl.revBase, annualRevenue: tmpl.revBase,
        employeeCount, previousEmployeeCount: employeeCount, baselineEmployeeCount: employeeCount,
        ebitda,
        ebit,
        netIncome,
        cash: tmpl.cashBase,
        totalDebt: tmpl.debtBase,
        leverage,
        interestCoverage,
        eps,
        creditRating: tmpl.initialRating,
      };

      // 4 previous simulated quarterly statements with exact filing end dates
      const historicalFundamentals = [
        {
          ...baseSnapshot,
          week: -3,
          filingPeriod: "Q1 '25",
          filingDate: 'Mar 31, 2025',
          annualRevenue: Number((tmpl.revBase * 0.94).toFixed(1)),
          ebitda: Number((ebitda * 0.93).toFixed(1)),
          ebit: Number((ebit * 0.92).toFixed(1)),
          netIncome: Number((netIncome * 0.91).toFixed(1)),
          cash: Number((tmpl.cashBase * 0.95).toFixed(1)),
          totalDebt: Number((tmpl.debtBase * 1.02).toFixed(1)),
          leverage: Number((leverage * 1.05).toFixed(2)),
          interestCoverage: Number((interestCoverage * 0.95).toFixed(2)),
          eps: Number((eps * 0.92).toFixed(2)),
        },
        {
          ...baseSnapshot,
          week: -2,
          filingPeriod: "Q2 '25",
          filingDate: 'Jun 30, 2025',
          annualRevenue: Number((tmpl.revBase * 0.96).toFixed(1)),
          ebitda: Number((ebitda * 0.95).toFixed(1)),
          ebit: Number((ebit * 0.94).toFixed(1)),
          netIncome: Number((netIncome * 0.94).toFixed(1)),
          cash: Number((tmpl.cashBase * 0.97).toFixed(1)),
          totalDebt: Number((tmpl.debtBase * 1.01).toFixed(1)),
          leverage: Number((leverage * 1.03).toFixed(2)),
          interestCoverage: Number((interestCoverage * 0.97).toFixed(2)),
          eps: Number((eps * 0.95).toFixed(2)),
        },
        {
          ...baseSnapshot,
          week: -1,
          filingPeriod: "Q3 '25",
          filingDate: 'Sep 30, 2025',
          annualRevenue: Number((tmpl.revBase * 0.98).toFixed(1)),
          ebitda: Number((ebitda * 0.97).toFixed(1)),
          ebit: Number((ebit * 0.97).toFixed(1)),
          netIncome: Number((netIncome * 0.97).toFixed(1)),
          cash: Number((tmpl.cashBase * 0.99).toFixed(1)),
          totalDebt: Number((tmpl.debtBase * 1.00).toFixed(1)),
          leverage: Number((leverage * 1.01).toFixed(2)),
          interestCoverage: Number((interestCoverage * 0.99).toFixed(2)),
          eps: Number((eps * 0.98).toFixed(2)),
        },
        baseSnapshot,
      ];

      const quotedMarginBps = Math.round(oasSpreadBps * 0.85 + 35);
      const discountMarginBps = Math.round(oasSpreadBps * 0.85);
      const loanRef = region === 'USA' ? 'SOFR' : region === 'EUR' ? 'EURIBOR' : region === 'UK' ? 'SONIA' : 'TONA';
      const earningsWeekModulo = (companies.length % 13) + 1;
      
      const alphaEps = Number((eps * 0.97).toFixed(2));
      const betaEps = Number((eps * 1.01).toFixed(2));
      const gammaEps = Number((eps * 1.06).toFixed(2));
      const consensusEps = Number(((alphaEps + betaEps + gammaEps) / 3).toFixed(2));
      
      const alphaRev = Number((tmpl.revBase * 0.98).toFixed(1));
      const betaRev = Number((tmpl.revBase * 1.01).toFixed(1));
      const gammaRev = Number((tmpl.revBase * 1.05).toFixed(1));
      const consensusRev = Number(((alphaRev + betaRev + gammaRev) / 3).toFixed(1));

      const capex = Math.round(tmpl.revBase * 0.06);
      const maintenanceCapex = Math.round(capex * 0.6); // maintenance is the majority baseline for a mature company at generation
      const growthCapex = capex - maintenanceCapex;

      const company: Company = {
        id: `${region}_${tmpl.ticker}`,
        ticker: tmpl.ticker,
        name: tmpl.name,
        region,
        sector: tmpl.sector,
        
        baselineAnnualRevenue: tmpl.revBase, annualRevenue: tmpl.revBase,
        employeeCount, previousEmployeeCount: employeeCount, baselineEmployeeCount: employeeCount,
        ebitda,
        baselineEbitdaMargin: ebitda / Math.max(1, tmpl.revBase),
        ebit,
        netIncome,
        eps,
        sharesOutstanding: tmpl.shares,
        cash: tmpl.cashBase,
        totalDebt: tmpl.debtBase,
        currentLiabilities: Math.round(tmpl.debtBase * 0.25 + tmpl.revBase * 0.08),
        debtTranches: generateDebtTranches(tmpl.ticker, tmpl.debtBase, tmpl.initialRating),
        capex,
        maintenanceCapex,
        growthCapex,
        baselineGrowthCapexToRevenueRatio: growthCapex / Math.max(1, tmpl.revBase),
        maintenanceShortfallStreak: 0,
        executionQuality: 1.0,
        occupationMixDrift: {},
        historicalFundamentals,
        
        earningsWeekModulo,
        lastEarningsReportWeek: 0,
        reportedThisWeek: false,
        dealerConsensus: {
          alpha: { eps: alphaEps, revenue: alphaRev },
          beta: { eps: betaEps, revenue: betaRev },
          gamma: { eps: gammaEps, revenue: gammaRev },
          consensusEps,
          consensusRevenue: consensusRev,
        },
        lastEarningsSurprisePct: 0,
        lastManagementCommentary: 'Management reaffirmed structural operating margins and disciplined leverage management.',
        
        leveragedLoan: {
          quotedMarginBps,
          referenceBenchmark: loanRef,
          pricePar: 98.75,
          discountMarginBps,
          tenorYears: 5,
          seniority: 'Senior Secured First Lien',
          recoveryRate: 0.65,
        },
        
        leverage,
        interestCoverage,
        creditRating: tmpl.initialRating,
        ratingHistory: [tmpl.initialRating],
        isDefaulted: false,
        recoveryRate: 0.40,
        baselineRecoveryRate: 0.40,
        
        stockPrice,
        historicalPrices,
        forwardPE: sectorConfig.basePE,
        marketCap: Number((stockPrice * tmpl.shares).toFixed(0)),
        dividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        baselineDividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        bankMarketShare: tmpl.bankMarketShare,
        institutionalRole: tmpl.institutionalRole ?? null,
        institutionalMarketShare: tmpl.institutionalMarketShare,
        beta: tmpl.beta,
        
        seniorBondYield: 0.05 + oasSpreadBps / 10000,
        oasSpreadBps,
        cdsSpreadBps,
        sentiment: 0.0,
        inputSupplyConstraintFactor: 1.0,
        finishedGoodsInventoryUSD: 0,
        inventoryCarryingCostRate: 0.02,
        recentFulfillmentEMA: 1.0,
      };

      companies.push(company);
    });
  });

  
  // G1: Assign Product Lines & Category Market Share
  const categories = [
    'StapleHousehold', 'StandardHousehold', 'LuxuryHousehold',
    'CorporateIndustrial', 'CorporateTech',
    'GovernmentDefense', 'GovernmentInfrastructure', 'GovernmentHealthcare'
  ];

  const regionMap = new Map<string, Company[]>();
  companies.forEach(c => {
    if (!regionMap.has(c.region)) regionMap.set(c.region, []);
    regionMap.get(c.region)!.push(c);
  });

  regionMap.forEach((regionComps, _regionId) => {
    const sectorComps = new Map<string, Company[]>();
    regionComps.forEach(c => {
      if (!sectorComps.has(c.sector)) sectorComps.set(c.sector, []);
      sectorComps.get(c.sector)!.push(c);
    });

    sectorComps.forEach((comps, sector) => {
      comps.sort((a, b) => b.baselineAnnualRevenue - a.baselineAnnualRevenue);
      comps.forEach((c, idx) => {
        let lines: any[] = [];
        
        if (sector === 'Tech') {
          const mgn = c.ebitda / Math.max(1, c.annualRevenue);
          if (idx < 4) {
            lines = [
              { category: 'CorporateTech', revenueShare: 0.55, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.30, competitiveness: 0 },
              { category: 'LuxuryHousehold', revenueShare: 0.15, competitiveness: 0 }
            ];
          } else {
            lines = [
              { category: 'CorporateTech', revenueShare: mgn > 0.20 ? 0.65 : 0.50, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: mgn > 0.20 ? 0.25 : 0.40, competitiveness: 0 },
              { category: 'LuxuryHousehold', revenueShare: 0.10, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Energy' || sector === 'Industrials') {
          if (idx < 4) {
            lines = [
              { category: 'CorporateIndustrial', revenueShare: 0.50, competitiveness: 0 },
              { category: 'GovernmentInfrastructure', revenueShare: 0.30, competitiveness: 0 },
              { category: 'GovernmentDefense', revenueShare: 0.20, competitiveness: 0 }
            ];
          } else {
            const mgn = c.ebitda / Math.max(1, c.annualRevenue);
            if (mgn > 0.20) {
              lines = [
                { category: 'CorporateIndustrial', revenueShare: 0.60, competitiveness: 0 },
                { category: 'GovernmentDefense', revenueShare: 0.40, competitiveness: 0 }
              ];
            } else {
              lines = [
                { category: 'CorporateIndustrial', revenueShare: 0.50, competitiveness: 0 },
                { category: 'GovernmentInfrastructure', revenueShare: 0.50, competitiveness: 0 }
              ];
            }
          }
        } else if (sector === 'Consumer') {
          const mgn = c.ebitda / Math.max(1, c.annualRevenue);
          const isMegaCap = c.baselineAnnualRevenue > 100000;
          if (isMegaCap) {
            lines = [
              { category: 'StandardHousehold', revenueShare: 0.60, competitiveness: 0 },
              { category: 'StapleHousehold', revenueShare: 0.10, competitiveness: 0 },
              { category: 'LuxuryHousehold', revenueShare: 0.15, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.15, competitiveness: 0 }
            ];
          } else if (mgn > 0.25) {
            lines = [
              { category: 'LuxuryHousehold', revenueShare: 0.35, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.35, competitiveness: 0 },
              { category: 'StapleHousehold', revenueShare: 0.20, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.10, competitiveness: 0 }
            ];
          } else if (mgn >= 0.16) {
            lines = [
              { category: 'StandardHousehold', revenueShare: 0.35, competitiveness: 0 },
              { category: 'StapleHousehold', revenueShare: 0.30, competitiveness: 0 },
              { category: 'LuxuryHousehold', revenueShare: 0.20, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.15, competitiveness: 0 }
            ];
          } else {
            lines = [
              { category: 'StapleHousehold', revenueShare: 0.35, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.30, competitiveness: 0 },
              { category: 'LuxuryHousehold', revenueShare: 0.15, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.20, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Financials') {
          if (idx < 4) {
            lines = [
              { category: 'CorporateTech', revenueShare: 0.50, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.30, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.20, competitiveness: 0 }
            ];
          } else {
            if (idx % 2 === 0) {
              lines = [
                { category: 'CorporateTech', revenueShare: 0.60, competitiveness: 0 },
                { category: 'GovernmentHealthcare', revenueShare: 0.40, competitiveness: 0 }
              ];
            } else {
              lines = [
                { category: 'CorporateTech', revenueShare: 0.60, competitiveness: 0 },
                { category: 'StandardHousehold', revenueShare: 0.40, competitiveness: 0 }
              ];
            }
          }
        } else if (sector === 'Banks') {
          lines = [
            { category: 'CorporateTech', revenueShare: 0.70, competitiveness: 0 },
            { category: 'StandardHousehold', revenueShare: 0.30, competitiveness: 0 }
          ];
        }

        c.productLines = lines;
      });
    });

    // Compute category market shares and initialize Region category demand
    const catTotals: Record<string, number> = {};
    categories.forEach(cat => catTotals[cat] = 0);

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        catTotals[line.category] += line.revenueShare * c.annualRevenue;
      });
    });

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        const catTotal = catTotals[line.category];
        line.categoryMarketShare = catTotal > 0 ? (line.revenueShare * c.annualRevenue) / catTotal : 0;
      });
    });
    
    // Note: Region categoryDemand is initialized in getInitialRegions but we'll populate it there.
    // So we don't do it here because macroEngine initializes regions.
    // Wait, macroEngine creates regions, then simulation creates companies. 
    // We can just export a function to patch regions with category demands, or do it in createInitialGameState.
  });

  return companies;
}


const USED_NAMES = new Set<string>();

export function generateUniqueCompanyName(_region: string, _category: string): { ticker: string, name: string } {
  const prefixes = ['Global', 'Quantum', 'Nexus', 'Aero', 'Stratos', 'Nova', 'Titan', 'Zenith', 'Horizon', 'Apex', 'Pearl', 'Obsidian', 'Astral', 'Galactic', 'Orion', 'Meridian', 'Crown', 'Heritage'];
  const suffixes = ['Industries', 'Tech', 'Systems', 'Holdings', 'Group', 'Networks', 'Dynamics', 'Logistics', 'Stores', 'Brands'];
  
  let attempts = 0;
  while (attempts < 100) {
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${p} ${s}`;
    const ticker = (p.substring(0,2) + s.substring(0,2)).toUpperCase();
    
    if (!USED_NAMES.has(name) && !USED_NAMES.has(ticker)) {
      USED_NAMES.add(name);
      USED_NAMES.add(ticker);
      return { ticker, name };
    }
    attempts++;
  }
  
  const fbName = `NewEntrant ${Math.floor(Math.random()*1000)}`;
  const fbTicker = `NEW${Math.floor(Math.random()*1000)}`;
  USED_NAMES.add(fbName);
  USED_NAMES.add(fbTicker);
  return { ticker: fbTicker, name: fbName };
}

export function generateIPOCompany(regionId: RegionId, category: string, categoryDemandUSD: number, week: number): Company {
  const revBase = categoryDemandUSD * (0.02 + Math.random() * 0.03); 
  const ebitdaMargin = 0.15 + Math.random() * 0.15;
  const shares = Math.floor(revBase * 10);
  const { ticker, name } = generateUniqueCompanyName(regionId, category);
  
  const sectorMap: Record<string, Sector> = {
    'CorporateTech': 'Tech',
    'StandardHousehold': 'Consumer',
    'StapleHousehold': 'Consumer',
    'LuxuryHousehold': 'Consumer',
    'CorporateIndustrial': 'Industrials',
    'GovernmentInfrastructure': 'Industrials',
    'GovernmentDefense': 'Industrials',
    'GovernmentHealthcare': 'Consumer'
  };
  
  const sector = sectorMap[category] ?? 'Tech';
  const initialRating: CreditRating = Math.random() > 0.5 ? 'BB' : 'B';
  const debtBase = revBase * 1.5;
  
  const ebitda = revBase * ebitdaMargin;
  const da = revBase * 0.05;
  const ebit = Math.max(10, ebitda - da);
  const employeeCount = Math.max(100, Math.round(revBase / 500_000));
  const debtTranches = generateDebtTranches(ticker, debtBase, initialRating);
  const capex = Math.round(revBase * 0.06);
  const maintenanceCapex = Math.round(capex * 0.3); // newly-public growth-stage company spends more on expansion than upkeep
  const growthCapex = capex - maintenanceCapex;
  
  return {
    id: `comp_${ticker}_${Date.now()}_${week}`,
    ticker, name, region: regionId, sector,
    baselineAnnualRevenue: revBase, annualRevenue: revBase,
    previousEmployeeCount: employeeCount, employeeCount,
    ebitda, baselineEbitdaMargin: ebitda / Math.max(1, revBase), ebit, netIncome: ebitda * 0.5, eps: 1.0,
    sharesOutstanding: shares, currentLiabilities: Math.round(debtBase * 0.25 + revBase * 0.08),
    totalDebt: debtBase, cash: revBase * 0.5,
    capex,
    maintenanceCapex,
    growthCapex,
    baselineGrowthCapexToRevenueRatio: growthCapex / Math.max(1, revBase),
    maintenanceShortfallStreak: 0,
    executionQuality: 1.0,
    occupationMixDrift: {},
    creditRating: initialRating, isDefaulted: false, oasSpreadBps: 300, cdsSpreadBps: 300,
    seniorBondYield: 0.08, stockPrice: 20, historicalPrices: Array(52).fill(20), forwardPE: 15,
    marketCap: shares * 20, dividendYield: 0, baselineDividendYield: 0, beta: 1.2, recoveryRate: 0.40,
    baselineRecoveryRate: 0.40, debtTranches,
    productLines: [{ category: category as any, revenueShare: 1.0, competitiveness: 0.3, previousCategoryMarketShare: 0.02, categoryMarketShare: 0.02 }],
    leverage: debtBase / Math.max(1, ebitda),
    interestCoverage: ebit / Math.max(0.5, debtBase * 0.06),
    earningsWeekModulo: week % 13,
    lastEarningsReportWeek: week,
    reportedThisWeek: false,
    historicalFundamentals: [],
    baselineEmployeeCount: employeeCount,
    dealerConsensus: {
      alpha: { eps: 1.0, revenue: revBase },
      beta: { eps: 1.0, revenue: revBase },
      gamma: { eps: 1.0, revenue: revBase },
      consensusEps: 1.0,
      consensusRevenue: revBase,
    },
    lastEarningsSurprisePct: 0,
    lastManagementCommentary: 'Newly public company; management outlined initial growth strategy at IPO.',
    leveragedLoan: {
      quotedMarginBps: 300,
      referenceBenchmark: 'SOFR',
      pricePar: 99.0,
      discountMarginBps: 300,
      tenorYears: 5,
      seniority: 'Senior Secured First Lien',
      recoveryRate: 0.40,
    },
    ratingHistory: [initialRating],
    institutionalRole: null,
    sentiment: 0.0,
    inputSupplyConstraintFactor: 1.0,
    finishedGoodsInventoryUSD: 0,
    inventoryCarryingCostRate: 0.02,
    recentFulfillmentEMA: 1.0,
  };
}
