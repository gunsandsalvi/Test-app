import { Company, CreditRating, RegionId, Sector } from '../types';
import { RATING_OAS_SPREADS, SECTOR_BENCHMARKS, priceEquity } from './pricing';

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
}

const REGION_COMPANIES: Record<RegionId, CompanyTemplate[]> = {
  USA: [
    // Tech (10)
    { ticker: 'BAQE', name: 'Allied Holdings', sector: 'Tech', revBase: 125000, ebitdaMargin: 0.44, debtBase: 25000, cashBase: 38000, shares: 2800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'GVCV', name: 'Alpha Corp', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.38, debtBase: 19000, cashBase: 22000, shares: 1950, initialRating: 'AA', beta: 1.35 },
    { ticker: 'IJCH', name: 'Prime Group', sector: 'Tech', revBase: 64000, ebitdaMargin: 0.35, debtBase: 24000, cashBase: 12000, shares: 1400, initialRating: 'A', beta: 1.45 },
    { ticker: 'BNFW', name: 'Crest Financial', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.28, debtBase: 31000, cashBase: 8000, shares: 920, initialRating: 'BBB', beta: 1.18 },
    { ticker: 'IUHM', name: 'Pinnacle Logistics', sector: 'Tech', revBase: 29000, ebitdaMargin: 0.24, debtBase: 28000, cashBase: 4500, shares: 680, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'SSQH', name: 'Quantum Services', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.19, debtBase: 26000, cashBase: 3200, shares: 540, initialRating: 'BB', beta: 1.40 },
    { ticker: 'CLRY', name: 'Vertex Industries', sector: 'Tech', revBase: 18500, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 2100, shares: 410, initialRating: 'BB', beta: 1.55 },
    { ticker: 'EEDP', name: 'Zenith Enterprises', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.13, debtBase: 29000, cashBase: 1100, shares: 330, initialRating: 'B', beta: 1.65 },
    { ticker: 'ZENO', name: 'Terra Dynamics', sector: 'Tech', revBase: 8500, ebitdaMargin: 0.08, debtBase: 25000, cashBase: 650, shares: 250, initialRating: 'B', beta: 1.80 },
    { ticker: 'XYRO', name: 'Alpha Industries', sector: 'Tech', revBase: 5200, ebitdaMargin: 0.04, debtBase: 22000, cashBase: 320, shares: 180, initialRating: 'CCC', beta: 2.10 },

    // Energy (10)
    { ticker: 'HKFO', name: 'Lunar Energy', sector: 'Energy', revBase: 95000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 14000, shares: 1800, initialRating: 'AA', beta: 0.85 },
    { ticker: 'VVSV', name: 'Allied Inc', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.29, debtBase: 32000, cashBase: 9500, shares: 1450, initialRating: 'A', beta: 0.95 },
    { ticker: 'KMFY', name: 'Allied Dynamics', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.42, debtBase: 48000, cashBase: 4200, shares: 980, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'ISGR', name: 'Nexus Ventures', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.26, debtBase: 38000, cashBase: 3100, shares: 720, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'GFIT', name: 'Lunar Holdings', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.22, debtBase: 30000, cashBase: 2800, shares: 610, initialRating: 'BB', beta: 1.30 },
    { ticker: 'LLWO', name: 'Prime Corp', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 3500, shares: 890, initialRating: 'BB', beta: 1.05 },
    { ticker: 'OXIC', name: 'Prime Financial', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.14, debtBase: 19000, cashBase: 1200, shares: 420, initialRating: 'B', beta: 1.45 },
    { ticker: 'XNLD', name: 'Horizon Logistics', sector: 'Energy', revBase: 15000, ebitdaMargin: 0.20, debtBase: 22000, cashBase: 1400, shares: 380, initialRating: 'BB', beta: 1.10 },
    { ticker: 'TPSM', name: 'Solar Partners', sector: 'Energy', revBase: 13500, ebitdaMargin: 0.15, debtBase: 27000, cashBase: 800, shares: 310, initialRating: 'B', beta: 1.60 },
    { ticker: 'OMXS', name: 'Crest Enterprises', sector: 'Energy', revBase: 7200, ebitdaMargin: 0.09, debtBase: 18000, cashBase: 290, shares: 210, initialRating: 'CCC', beta: 1.75 },

    // Financials (10)
    { ticker: 'TZLF', name: 'United Partners', sector: 'Financials', revBase: 140000, ebitdaMargin: 0.36, debtBase: 110000, cashBase: 65000, shares: 2900, initialRating: 'AAA', beta: 0.95 },
    { ticker: 'MHCH', name: 'Nexus Corp', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.31, debtBase: 74000, cashBase: 34000, shares: 1600, initialRating: 'AA', beta: 1.05 },
    { ticker: 'NOHL', name: 'Terra Dynamics', sector: 'Financials', revBase: 58000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 21000, shares: 1200, initialRating: 'A', beta: 1.10 },
    { ticker: 'PXKC', name: 'Lunar Energy', sector: 'Financials', revBase: 32000, ebitdaMargin: 0.46, debtBase: 18000, cashBase: 15000, shares: 850, initialRating: 'AA', beta: 1.20 },
    { ticker: 'SKAB', name: 'Global Systems', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.22, debtBase: 39000, cashBase: 18000, shares: 940, initialRating: 'A', beta: 0.80 },
    { ticker: 'VRMA', name: 'Crest Solutions', sector: 'Financials', revBase: 28000, ebitdaMargin: 0.40, debtBase: 42000, cashBase: 9000, shares: 620, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'CAHR', name: 'Prime Corp', sector: 'Financials', revBase: 22000, ebitdaMargin: 0.25, debtBase: 38000, cashBase: 4800, shares: 510, initialRating: 'BB', beta: 1.50 },
    { ticker: 'EAES', name: 'Stratos Inc', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.16, debtBase: 28000, cashBase: 2100, shares: 430, initialRating: 'B', beta: 1.70 },
    { ticker: 'LMYZ', name: 'Horizon Energy', sector: 'Financials', revBase: 16500, ebitdaMargin: 0.24, debtBase: 25000, cashBase: 3100, shares: 390, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'JKTF', name: 'Beacon Solutions', sector: 'Financials', revBase: 9800, ebitdaMargin: 0.12, debtBase: 31000, cashBase: 850, shares: 280, initialRating: 'CCC', beta: 1.95 },

    // Industrials (10)
    { ticker: 'LXJN', name: 'Solar Networks', sector: 'Industrials', revBase: 76000, ebitdaMargin: 0.18, debtBase: 45000, cashBase: 11000, shares: 1100, initialRating: 'A', beta: 1.10 },
    { ticker: 'QGON', name: 'United Energy', sector: 'Industrials', revBase: 64000, ebitdaMargin: 0.22, debtBase: 32000, cashBase: 9800, shares: 980, initialRating: 'A', beta: 1.05 },
    { ticker: 'JQIC', name: 'Stellar Retail', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.38, debtBase: 36000, cashBase: 4200, shares: 740, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'ILDS', name: 'Stellar Energy', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'AOOY', name: 'United Enterprises', sector: 'Industrials', revBase: 58000, ebitdaMargin: 0.14, debtBase: 48000, cashBase: 6200, shares: 1250, initialRating: 'BB', beta: 1.40 },
    { ticker: 'GIXO', name: 'Meridian Technologies', sector: 'Industrials', revBase: 31000, ebitdaMargin: 0.21, debtBase: 26000, cashBase: 3900, shares: 640, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'RCOH', name: 'Global Services', sector: 'Industrials', revBase: 27000, ebitdaMargin: 0.15, debtBase: 29000, cashBase: 2400, shares: 530, initialRating: 'BB', beta: 1.35 },
    { ticker: 'YIII', name: 'Beacon Networks', sector: 'Industrials', revBase: 22000, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 1900, shares: 410, initialRating: 'BB', beta: 1.15 },
    { ticker: 'JQIF', name: 'Aero Retail', sector: 'Industrials', revBase: 16000, ebitdaMargin: 0.15, debtBase: 19000, cashBase: 1100, shares: 350, initialRating: 'B', beta: 0.95 },
    { ticker: 'EGEU', name: 'Terra Capital', sector: 'Industrials', revBase: 8400, ebitdaMargin: 0.08, debtBase: 17000, cashBase: 410, shares: 220, initialRating: 'CCC', beta: 1.65 },

    // Consumer (10)
    { ticker: 'YCNE', name: 'Global Energy', sector: 'Consumer', revBase: 210000, ebitdaMargin: 0.09, debtBase: 55000, cashBase: 26000, shares: 3800, initialRating: 'AA', beta: 0.65 },
    { ticker: 'OLME', name: 'Meridian Networks', sector: 'Consumer', revBase: 72000, ebitdaMargin: 0.31, debtBase: 38000, cashBase: 16000, shares: 1850, initialRating: 'AAA', beta: 0.60 },
    { ticker: 'VELF', name: 'Nova Inc', sector: 'Consumer', revBase: 41000, ebitdaMargin: 0.26, debtBase: 24000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.15 },
    { ticker: 'SGKB', name: 'Prime Logistics', sector: 'Consumer', revBase: 52000, ebitdaMargin: 0.18, debtBase: 37000, cashBase: 6200, shares: 1150, initialRating: 'A', beta: 0.55 },
    { ticker: 'YZDS', name: 'Stellar Industries', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.35, debtBase: 41000, cashBase: 4900, shares: 760, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'WGEB', name: 'Prime Technologies', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 35000, cashBase: 7800, shares: 990, initialRating: 'A', beta: 0.70 },
    { ticker: 'REHC', name: 'Zenith Group', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.23, debtBase: 38000, cashBase: 2900, shares: 620, initialRating: 'BB', beta: 1.30 },
    { ticker: 'IOAI', name: 'Crest Retail', sector: 'Consumer', revBase: 19000, ebitdaMargin: 0.20, debtBase: 44000, cashBase: 2200, shares: 580, initialRating: 'B', beta: 1.70 },
    { ticker: 'HVDR', name: 'Nexus Solutions', sector: 'Consumer', revBase: 14500, ebitdaMargin: 0.17, debtBase: 18000, cashBase: 1400, shares: 410, initialRating: 'BB', beta: 1.10 },
    { ticker: 'PVJE', name: 'Zenith Ventures', sector: 'Consumer', revBase: 6500, ebitdaMargin: 0.07, debtBase: 19000, cashBase: 280, shares: 240, initialRating: 'CCC', beta: 1.60 },
  ],

  UK: [
    // Tech (10)
    { ticker: 'OONY', name: 'Zenith Retail', sector: 'Tech', revBase: 45000, ebitdaMargin: 0.46, debtBase: 8000, cashBase: 14000, shares: 1200, initialRating: 'AAA', beta: 1.20 },
    { ticker: 'YGRL', name: 'Pinnacle Holdings', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.34, debtBase: 9500, cashBase: 8200, shares: 750, initialRating: 'AA', beta: 1.30 },
    { ticker: 'IQQI', name: 'Stratos Inc', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.27, debtBase: 11000, cashBase: 4600, shares: 520, initialRating: 'A', beta: 1.40 },
    { ticker: 'RRCY', name: 'Allied Corp', sector: 'Tech', revBase: 14000, ebitdaMargin: 0.22, debtBase: 12500, cashBase: 3100, shares: 410, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'MZIJ', name: 'Terra Solutions', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.29, debtBase: 18000, cashBase: 4500, shares: 580, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'MJCZ', name: 'Aero Inc', sector: 'Tech', revBase: 12500, ebitdaMargin: 0.18, debtBase: 16000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.35 },
    { ticker: 'YKYD', name: 'Apex Logistics', sector: 'Tech', revBase: 8900, ebitdaMargin: 0.15, debtBase: 14000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.45 },
    { ticker: 'GKYN', name: 'Prime Retail', sector: 'Tech', revBase: 7100, ebitdaMargin: 0.12, debtBase: 13000, cashBase: 850, shares: 240, initialRating: 'B', beta: 1.55 },
    { ticker: 'RBJJ', name: 'Solar Dynamics', sector: 'Tech', revBase: 5400, ebitdaMargin: 0.08, debtBase: 15000, cashBase: 490, shares: 190, initialRating: 'B', beta: 1.70 },
    { ticker: 'URFU', name: 'Global Industries', sector: 'Tech', revBase: 3200, ebitdaMargin: 0.02, debtBase: 11000, cashBase: 210, shares: 140, initialRating: 'CCC', beta: 2.05 },

    // Energy (10)
    { ticker: 'LDKO', name: 'Solar Partners', sector: 'Energy', revBase: 115000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 22000, shares: 2400, initialRating: 'A', beta: 0.90 },
    { ticker: 'UNZQ', name: 'Astral Manufacturing', sector: 'Energy', revBase: 130000, ebitdaMargin: 0.30, debtBase: 58000, cashBase: 27000, shares: 2600, initialRating: 'AA', beta: 0.88 },
    { ticker: 'ORLV', name: 'Lunar Industries', sector: 'Energy', revBase: 32000, ebitdaMargin: 0.33, debtBase: 28000, cashBase: 4800, shares: 720, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'VWZA', name: 'Aegis Technologies', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.38, debtBase: 34000, cashBase: 3600, shares: 620, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'BUZA', name: 'Nexus Partners', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.42, debtBase: 46000, cashBase: 4100, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'TMRC', name: 'Lunar Logistics', sector: 'Energy', revBase: 42000, ebitdaMargin: 0.15, debtBase: 31000, cashBase: 3900, shares: 950, initialRating: 'BBB', beta: 0.95 },
    { ticker: 'FJNI', name: 'Beacon Financial', sector: 'Energy', revBase: 8500, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1100, shares: 310, initialRating: 'BB', beta: 1.40 },
    { ticker: 'MOPP', name: 'United Networks', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1300, shares: 350, initialRating: 'BB', beta: 1.20 },
    { ticker: 'FQZG', name: 'Alpha Enterprises', sector: 'Energy', revBase: 6800, ebitdaMargin: 0.13, debtBase: 12000, cashBase: 720, shares: 240, initialRating: 'B', beta: 1.50 },
    { ticker: 'XISA', name: 'Horizon Solutions', sector: 'Energy', revBase: 4100, ebitdaMargin: 0.05, debtBase: 13000, cashBase: 220, shares: 160, initialRating: 'CCC', beta: 1.80 },

    // Financials (10)
    { ticker: 'ODXY', name: 'Allied Capital', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.35, debtBase: 78000, cashBase: 45000, shares: 2200, initialRating: 'AA', beta: 0.90 },
    { ticker: 'SKGZ', name: 'Alpha Retail', sector: 'Financials', revBase: 68000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 29000, shares: 1700, initialRating: 'A', beta: 1.15 },
    { ticker: 'QLSL', name: 'Stellar Financial', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.33, debtBase: 42000, cashBase: 21000, shares: 1400, initialRating: 'A', beta: 0.95 },
    { ticker: 'AKCG', name: 'Pinnacle Logistics', sector: 'Financials', revBase: 41000, ebitdaMargin: 0.30, debtBase: 38000, cashBase: 18000, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'TXLL', name: 'Stellar Ventures', sector: 'Financials', revBase: 36000, ebitdaMargin: 0.24, debtBase: 29000, cashBase: 16000, shares: 920, initialRating: 'A', beta: 1.00 },
    { ticker: 'EKOT', name: 'Quantum Industries', sector: 'Financials', revBase: 24000, ebitdaMargin: 0.48, debtBase: 19000, cashBase: 9500, shares: 680, initialRating: 'AA', beta: 0.85 },
    { ticker: 'LLCS', name: 'Prime Networks', sector: 'Financials', revBase: 18000, ebitdaMargin: 0.36, debtBase: 12000, cashBase: 7200, shares: 510, initialRating: 'A', beta: 1.10 },
    { ticker: 'WZAX', name: 'Quantum Solutions', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1600, shares: 320, initialRating: 'BB', beta: 1.60 },
    { ticker: 'VGPR', name: 'Pinnacle Enterprises', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 2100, shares: 440, initialRating: 'BB', beta: 1.35 },
    { ticker: 'ZJHP', name: 'Astral Enterprises', sector: 'Financials', revBase: 5800, ebitdaMargin: 0.10, debtBase: 18000, cashBase: 430, shares: 210, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'SENK', name: 'Beacon Financial', sector: 'Industrials', revBase: 42000, ebitdaMargin: 0.17, debtBase: 28000, cashBase: 7500, shares: 1100, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'ERAT', name: 'Alpha Inc', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 22000, cashBase: 9800, shares: 980, initialRating: 'AA', beta: 0.75 },
    { ticker: 'EEPS', name: 'Terra Holdings', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.16, debtBase: 48000, cashBase: 14000, shares: 1900, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'AEYW', name: 'Lunar Group', sector: 'Industrials', revBase: 78000, ebitdaMargin: 0.38, debtBase: 28000, cashBase: 18000, shares: 1550, initialRating: 'AA', beta: 1.15 },
    { ticker: 'KAOV', name: 'Horizon Partners', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.26, debtBase: 34000, cashBase: 8900, shares: 1200, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'BGZW', name: 'Beacon Solutions', sector: 'Industrials', revBase: 18000, ebitdaMargin: 0.13, debtBase: 16000, cashBase: 2400, shares: 520, initialRating: 'BB', beta: 1.10 },
    { ticker: 'FFRC', name: 'Apex Partners', sector: 'Industrials', revBase: 12500, ebitdaMargin: 0.19, debtBase: 13000, cashBase: 1900, shares: 380, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'HSUR', name: 'Meridian Logistics', sector: 'Industrials', revBase: 9800, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1200, shares: 310, initialRating: 'BB', beta: 1.25 },
    { ticker: 'VCJG', name: 'Terra Services', sector: 'Industrials', revBase: 7400, ebitdaMargin: 0.12, debtBase: 11000, cashBase: 850, shares: 250, initialRating: 'B', beta: 1.40 },
    { ticker: 'ABMW', name: 'Crest Energy', sector: 'Industrials', revBase: 5100, ebitdaMargin: 0.06, debtBase: 15000, cashBase: 280, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Consumer (10)
    { ticker: 'BBTM', name: 'Nexus Logistics', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.24, debtBase: 39000, cashBase: 15000, shares: 2100, initialRating: 'AAA', beta: 0.55 },
    { ticker: 'DCXB', name: 'Global Inc', sector: 'Consumer', revBase: 38000, ebitdaMargin: 0.36, debtBase: 28000, cashBase: 8200, shares: 1150, initialRating: 'AA', beta: 0.70 },
    { ticker: 'WGYM', name: 'Stratos Manufacturing', sector: 'Consumer', revBase: 44000, ebitdaMargin: 0.44, debtBase: 52000, cashBase: 7800, shares: 1300, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'DZDS', name: 'Nova Financial', sector: 'Consumer', revBase: 76000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 8900, shares: 1800, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'STEC', name: 'Stratos Logistics', sector: 'Consumer', revBase: 65000, ebitdaMargin: 0.32, debtBase: 34000, cashBase: 16000, shares: 1550, initialRating: 'AA', beta: 0.60 },
    { ticker: 'QIUQ', name: 'Nova Enterprises', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.26, debtBase: 21000, cashBase: 6200, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'PQQD', name: 'Quantum Services', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.21, debtBase: 12000, cashBase: 3100, shares: 480, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'YFPK', name: 'Crest Financial', sector: 'Consumer', revBase: 21000, ebitdaMargin: 0.15, debtBase: 26000, cashBase: 2900, shares: 640, initialRating: 'BB', beta: 1.50 },
    { ticker: 'NYCA', name: 'Allied Ventures', sector: 'Consumer', revBase: 11000, ebitdaMargin: 0.12, debtBase: 19000, cashBase: 1100, shares: 380, initialRating: 'B', beta: 1.35 },
    { ticker: 'CBIG', name: 'Quantum Services', sector: 'Consumer', revBase: 4800, ebitdaMargin: 0.06, debtBase: 16000, cashBase: 310, shares: 210, initialRating: 'CCC', beta: 1.90 },
  ],

  JPN: [
    // Tech (10)
    { ticker: 'FFPC', name: 'Stellar Ventures', sector: 'Tech', revBase: 110000, ebitdaMargin: 0.25, debtBase: 32000, cashBase: 29000, shares: 2100, initialRating: 'AA', beta: 1.10 },
    { ticker: 'GCTB', name: 'Alpha Dynamics', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.35, debtBase: 8500, cashBase: 16000, shares: 980, initialRating: 'AAA', beta: 1.35 },
    { ticker: 'RSRB', name: 'Meridian Systems', sector: 'Tech', revBase: 84000, ebitdaMargin: 0.28, debtBase: 120000, cashBase: 38000, shares: 2200, initialRating: 'BB', beta: 1.65 },
    { ticker: 'YKAK', name: 'Aegis Systems', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.52, debtBase: 3000, cashBase: 21000, shares: 620, initialRating: 'AAA', beta: 1.05 },
    { ticker: 'EICF', name: 'Vertex Networks', sector: 'Tech', revBase: 34000, ebitdaMargin: 0.31, debtBase: 22000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.30 },
    { ticker: 'CDDW', name: 'United Solutions', sector: 'Tech', revBase: 65000, ebitdaMargin: 0.12, debtBase: 38000, cashBase: 12000, shares: 1700, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'AYEG', name: 'Meridian Capital', sector: 'Tech', revBase: 31000, ebitdaMargin: 0.11, debtBase: 26000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'VYPN', name: 'Apex Enterprises', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.33, debtBase: 6000, cashBase: 14000, shares: 580, initialRating: 'AA', beta: 1.20 },
    { ticker: 'UWOG', name: 'Horizon Capital', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 2200, shares: 350, initialRating: 'BB', beta: 1.45 },
    { ticker: 'DSNZ', name: 'Meridian Energy', sector: 'Tech', revBase: 5800, ebitdaMargin: 0.03, debtBase: 19000, cashBase: 390, shares: 220, initialRating: 'CCC', beta: 2.15 },

    // Energy (10)
    { ticker: 'KYWA', name: 'Quantum Ventures', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.62, debtBase: 22000, cashBase: 12000, shares: 980, initialRating: 'A', beta: 0.95 },
    { ticker: 'LDOW', name: 'Zenith Retail', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.08, debtBase: 44000, cashBase: 9500, shares: 1850, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'IWST', name: 'Astral Manufacturing', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.14, debtBase: 88000, cashBase: 11000, shares: 1600, initialRating: 'B', beta: 1.25 },
    { ticker: 'BZDU', name: 'Vertex Enterprises', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.22, debtBase: 54000, cashBase: 6800, shares: 1100, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'RPVO', name: 'Zenith Group', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.19, debtBase: 32000, cashBase: 5900, shares: 920, initialRating: 'A', beta: 0.70 },
    { ticker: 'BUEU', name: 'Vertex Industries', sector: 'Energy', revBase: 27000, ebitdaMargin: 0.17, debtBase: 24000, cashBase: 4800, shares: 740, initialRating: 'A', beta: 0.65 },
    { ticker: 'DVDU', name: 'Stratos Enterprises', sector: 'Energy', revBase: 7500, ebitdaMargin: 0.35, debtBase: 19000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.35 },
    { ticker: 'FDUR', name: 'Crest Group', sector: 'Energy', revBase: 31000, ebitdaMargin: 0.16, debtBase: 38000, cashBase: 3900, shares: 810, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'LPKJ', name: 'Meridian Enterprises', sector: 'Energy', revBase: 5900, ebitdaMargin: 0.24, debtBase: 14000, cashBase: 780, shares: 230, initialRating: 'BB', beta: 1.20 },
    { ticker: 'JART', name: 'United Industries', sector: 'Energy', revBase: 12000, ebitdaMargin: 0.07, debtBase: 29000, cashBase: 620, shares: 380, initialRating: 'CCC', beta: 1.65 },

    // Financials (10)
    { ticker: 'HXPU', name: 'Prime Solutions', sector: 'Financials', revBase: 98000, ebitdaMargin: 0.38, debtBase: 82000, cashBase: 55000, shares: 2600, initialRating: 'AA', beta: 0.85 },
    { ticker: 'XFKA', name: 'Pinnacle Group', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.36, debtBase: 69000, cashBase: 44000, shares: 2100, initialRating: 'AA', beta: 0.90 },
    { ticker: 'XXCK', name: 'Alpha Technologies', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.32, debtBase: 58000, cashBase: 32000, shares: 1800, initialRating: 'A', beta: 0.95 },
    { ticker: 'CYME', name: 'Crest Retail', sector: 'Financials', revBase: 34000, ebitdaMargin: 0.26, debtBase: 46000, cashBase: 16000, shares: 980, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'CRCP', name: 'Prime Holdings', sector: 'Financials', revBase: 31000, ebitdaMargin: 0.34, debtBase: 38000, cashBase: 11000, shares: 850, initialRating: 'A', beta: 1.10 },
    { ticker: 'HJVG', name: 'Astral Technologies', sector: 'Financials', revBase: 42000, ebitdaMargin: 0.20, debtBase: 29000, cashBase: 18000, shares: 990, initialRating: 'AA', beta: 0.75 },
    { ticker: 'AHBN', name: 'Horizon Group', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.18, debtBase: 36000, cashBase: 22000, shares: 1150, initialRating: 'A', beta: 0.80 },
    { ticker: 'HPFM', name: 'Prime Holdings', sector: 'Financials', revBase: 16000, ebitdaMargin: 0.30, debtBase: 21000, cashBase: 4500, shares: 490, initialRating: 'BBB', beta: 1.45 },
    { ticker: 'BCRP', name: 'Astral Systems', sector: 'Financials', revBase: 11500, ebitdaMargin: 0.22, debtBase: 24000, cashBase: 2100, shares: 380, initialRating: 'BB', beta: 1.55 },
    { ticker: 'BCSX', name: 'Stratos Group', sector: 'Financials', revBase: 4900, ebitdaMargin: 0.12, debtBase: 17000, cashBase: 390, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Industrials (10)
    { ticker: 'WYFN', name: 'Stellar Ventures', sector: 'Industrials', revBase: 240000, ebitdaMargin: 0.15, debtBase: 110000, cashBase: 48000, shares: 4200, initialRating: 'AAA', beta: 0.70 },
    { ticker: 'FZFN', name: 'Global Corp', sector: 'Industrials', revBase: 52000, ebitdaMargin: 0.14, debtBase: 28000, cashBase: 9500, shares: 1250, initialRating: 'A', beta: 1.15 },
    { ticker: 'LQIJ', name: 'Crest Networks', sector: 'Industrials', revBase: 39000, ebitdaMargin: 0.20, debtBase: 19000, cashBase: 8200, shares: 950, initialRating: 'A', beta: 1.20 },
    { ticker: 'MTDM', name: 'Horizon Solutions', sector: 'Industrials', revBase: 88000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 16000, shares: 1950, initialRating: 'AA', beta: 0.90 },
    { ticker: 'CXPA', name: 'Global Networks', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.13, debtBase: 21000, cashBase: 11000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'XBWX', name: 'Alpha Technologies', sector: 'Industrials', revBase: 68000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 7800, shares: 1650, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'KCAB', name: 'Global Technologies', sector: 'Industrials', revBase: 36000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 8900, shares: 890, initialRating: 'AA', beta: 0.95 },
    { ticker: 'NZMV', name: 'Global Networks', sector: 'Industrials', revBase: 29000, ebitdaMargin: 0.25, debtBase: 28000, cashBase: 4900, shares: 720, initialRating: 'BBB', beta: 1.40 },
    { ticker: 'SEJN', name: 'Solar Corp', sector: 'Industrials', revBase: 19000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 2600, shares: 510, initialRating: 'BB', beta: 1.10 },
    { ticker: 'EHAO', name: 'Aegis Inc', sector: 'Industrials', revBase: 6200, ebitdaMargin: 0.05, debtBase: 17000, cashBase: 340, shares: 220, initialRating: 'CCC', beta: 1.95 },

    // Consumer (10)
    { ticker: 'YZCG', name: 'Terra Dynamics', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.42, debtBase: 1000, cashBase: 24000, shares: 890, initialRating: 'AAA', beta: 0.75 },
    { ticker: 'DKFL', name: 'Lunar Solutions', sector: 'Consumer', revBase: 42000, ebitdaMargin: 0.22, debtBase: 14000, cashBase: 16000, shares: 1050, initialRating: 'AA', beta: 0.80 },
    { ticker: 'SWEC', name: 'Global Holdings', sector: 'Consumer', revBase: 85000, ebitdaMargin: 0.09, debtBase: 44000, cashBase: 12000, shares: 1900, initialRating: 'A', beta: 0.65 },
    { ticker: 'IIFT', name: 'Vertex Holdings', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.15, debtBase: 12000, cashBase: 3800, shares: 520, initialRating: 'A', beta: 0.90 },
    { ticker: 'MDKW', name: 'Aero Manufacturing', sector: 'Consumer', revBase: 29000, ebitdaMargin: 0.17, debtBase: 26000, cashBase: 4500, shares: 740, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'FADS', name: 'Nexus Solutions', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.16, debtBase: 24000, cashBase: 4100, shares: 690, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'XACW', name: 'Vertex Systems', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.08, debtBase: 52000, cashBase: 3500, shares: 980, initialRating: 'B', beta: 1.60 },
    { ticker: 'HAUR', name: 'Apex Inc', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.32, debtBase: 11000, cashBase: 5200, shares: 480, initialRating: 'AA', beta: 0.85 },
    { ticker: 'IJYR', name: 'Nova Logistics', sector: 'Consumer', revBase: 12500, ebitdaMargin: 0.16, debtBase: 9500, cashBase: 2400, shares: 380, initialRating: 'A', beta: 0.55 },
    { ticker: 'KRUQ', name: 'Aero Capital', sector: 'Consumer', revBase: 4500, ebitdaMargin: 0.06, debtBase: 14000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.70 },
  ],

  EUR: [
    // Tech (10)
    { ticker: 'PIBE', name: 'Meridian Inc', sector: 'Tech', revBase: 95000, ebitdaMargin: 0.42, debtBase: 14000, cashBase: 26000, shares: 1800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'OKRZ', name: 'Apex Technologies', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.34, debtBase: 22000, cashBase: 18000, shares: 1750, initialRating: 'AA', beta: 0.95 },
    { ticker: 'OHNN', name: 'Nova Industries', sector: 'Tech', revBase: 36000, ebitdaMargin: 0.30, debtBase: 12000, cashBase: 8500, shares: 940, initialRating: 'A', beta: 1.35 },
    { ticker: 'SLWF', name: 'Pinnacle Capital', sector: 'Tech', revBase: 38000, ebitdaMargin: 0.28, debtBase: 19000, cashBase: 7200, shares: 980, initialRating: 'A', beta: 1.30 },
    { ticker: 'CTGN', name: 'Alpha Energy', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.36, debtBase: 8000, cashBase: 6500, shares: 620, initialRating: 'AA', beta: 0.90 },
    { ticker: 'KHXR', name: 'Stratos Group', sector: 'Tech', revBase: 24000, ebitdaMargin: 0.09, debtBase: 38000, cashBase: 2200, shares: 720, initialRating: 'CCC', beta: 2.10 },
    { ticker: 'NKCH', name: 'Vertex Technologies', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.38, debtBase: 16000, cashBase: 4900, shares: 540, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'ADPI', name: 'Stratos Group', sector: 'Tech', revBase: 11000, ebitdaMargin: 0.31, debtBase: 14000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.50 },
    { ticker: 'BRAK', name: 'Allied Inc', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.05, debtBase: 32000, cashBase: 2800, shares: 810, initialRating: 'B', beta: 1.75 },
    { ticker: 'TNFG', name: 'Global Holdings', sector: 'Tech', revBase: 7200, ebitdaMargin: 0.16, debtBase: 8500, cashBase: 1100, shares: 250, initialRating: 'BB', beta: 1.40 },

    // Energy (10)
    { ticker: 'UPUE', name: 'Quantum Systems', sector: 'Energy', revBase: 140000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 31000, shares: 2700, initialRating: 'AA', beta: 0.88 },
    { ticker: 'OHKQ', name: 'Pinnacle Energy', sector: 'Energy', revBase: 92000, ebitdaMargin: 0.25, debtBase: 48000, cashBase: 16000, shares: 1900, initialRating: 'A', beta: 0.95 },
    { ticker: 'FJNK', name: 'Aero Industries', sector: 'Energy', revBase: 58000, ebitdaMargin: 0.38, debtBase: 68000, cashBase: 9500, shares: 1450, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'ODPV', name: 'Crest Partners', sector: 'Energy', revBase: 84000, ebitdaMargin: 0.32, debtBase: 95000, cashBase: 12000, shares: 1950, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'OHDE', name: 'Zenith Financial', sector: 'Energy', revBase: 22000, ebitdaMargin: 0.36, debtBase: 34000, cashBase: 4100, shares: 620, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'XYLP', name: 'United Inc', sector: 'Energy', revBase: 71000, ebitdaMargin: 0.21, debtBase: 49000, cashBase: 9800, shares: 1600, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'WFQX', name: 'Alpha Financial', sector: 'Energy', revBase: 52000, ebitdaMargin: 0.20, debtBase: 28000, cashBase: 6900, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'DFJK', name: 'Horizon Corp', sector: 'Energy', revBase: 110000, ebitdaMargin: 0.22, debtBase: 140000, cashBase: 14000, shares: 2400, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'TLBK', name: 'Nova Networks', sector: 'Energy', revBase: 14000, ebitdaMargin: 0.08, debtBase: 19000, cashBase: 1400, shares: 420, initialRating: 'B', beta: 1.55 },
    { ticker: 'XEKK', name: 'Vertex Holdings', sector: 'Energy', revBase: 4800, ebitdaMargin: 0.04, debtBase: 15000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.85 },

    // Financials (10)
    { ticker: 'WZTB', name: 'Astral Corp', sector: 'Financials', revBase: 115000, ebitdaMargin: 0.34, debtBase: 98000, cashBase: 62000, shares: 2500, initialRating: 'AA', beta: 1.00 },
    { ticker: 'MULH', name: 'Horizon Enterprises', sector: 'Financials', revBase: 125000, ebitdaMargin: 0.22, debtBase: 65000, cashBase: 48000, shares: 2600, initialRating: 'AAA', beta: 0.70 },
    { ticker: 'RAGI', name: 'Global Networks', sector: 'Financials', revBase: 88000, ebitdaMargin: 0.32, debtBase: 84000, cashBase: 39000, shares: 2200, initialRating: 'A', beta: 1.10 },
    { ticker: 'EGVX', name: 'Lunar Corp', sector: 'Financials', revBase: 52000, ebitdaMargin: 0.36, debtBase: 48000, cashBase: 28000, shares: 1450, initialRating: 'A', beta: 1.05 },
    { ticker: 'JJZD', name: 'Aero Corp', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.20, debtBase: 58000, cashBase: 36000, shares: 2100, initialRating: 'AA', beta: 0.75 },
    { ticker: 'CBUO', name: 'Allied Networks', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.24, debtBase: 78000, cashBase: 29000, shares: 1700, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'MWNK', name: 'Lunar Retail', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.38, debtBase: 44000, cashBase: 22000, shares: 1350, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'NPMQ', name: 'Stratos Networks', sector: 'Financials', revBase: 54000, ebitdaMargin: 0.35, debtBase: 49000, cashBase: 24000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'MQWF', name: 'Prime Corp', sector: 'Financials', revBase: 46000, ebitdaMargin: 0.36, debtBase: 42000, cashBase: 21000, shares: 1300, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'KAJE', name: 'Horizon Group', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.14, debtBase: 24000, cashBase: 1800, shares: 350, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'PCUB', name: 'Apex Holdings', sector: 'Industrials', revBase: 98000, ebitdaMargin: 0.19, debtBase: 42000, cashBase: 21000, shares: 2150, initialRating: 'AA', beta: 0.90 },
    { ticker: 'CFHU', name: 'Alpha Services', sector: 'Industrials', revBase: 84000, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 22000, shares: 1800, initialRating: 'A', beta: 1.10 },
    { ticker: 'NOUS', name: 'Terra Energy', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 21000, cashBase: 11000, shares: 1200, initialRating: 'AA', beta: 0.95 },
    { ticker: 'TGET', name: 'Vertex Group', sector: 'Industrials', revBase: 195000, ebitdaMargin: 0.12, debtBase: 165000, cashBase: 35000, shares: 3400, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'ITSF', name: 'Stellar Systems', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.15, debtBase: 72000, cashBase: 24000, shares: 1900, initialRating: 'A', beta: 1.00 },
    { ticker: 'MTMX', name: 'Meridian Technologies', sector: 'Industrials', revBase: 96000, ebitdaMargin: 0.16, debtBase: 78000, cashBase: 26000, shares: 2000, initialRating: 'A', beta: 1.05 },
    { ticker: 'UDNM', name: 'Pinnacle Inc', sector: 'Industrials', revBase: 74000, ebitdaMargin: 0.14, debtBase: 38000, cashBase: 9200, shares: 1650, initialRating: 'A', beta: 1.20 },
    { ticker: 'PMUL', name: 'Terra Retail', sector: 'Industrials', revBase: 32000, ebitdaMargin: 0.21, debtBase: 16000, cashBase: 8100, shares: 820, initialRating: 'A', beta: 1.05 },
    { ticker: 'JPWU', name: 'Aegis Technologies', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 3800, shares: 920, initialRating: 'BB', beta: 1.45 },
    { ticker: 'BXZK', name: 'Solar Holdings', sector: 'Industrials', revBase: 8900, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 650, shares: 280, initialRating: 'CCC', beta: 1.80 },

    // Consumer (10)
    { ticker: 'XCRB', name: 'Aegis Financial', sector: 'Consumer', revBase: 120000, ebitdaMargin: 0.35, debtBase: 32000, cashBase: 24000, shares: 2200, initialRating: 'AAA', beta: 0.90 },
    { ticker: 'YPBX', name: 'Nova Holdings', sector: 'Consumer', revBase: 110000, ebitdaMargin: 0.22, debtBase: 46000, cashBase: 19000, shares: 2300, initialRating: 'AAA', beta: 0.50 },
    { ticker: 'OREP', name: 'L\'Oreal Beauty & Cosmetics', sector: 'Consumer', revBase: 54000, ebitdaMargin: 0.25, debtBase: 14000, cashBase: 11000, shares: 1300, initialRating: 'AAA', beta: 0.65 },
    { ticker: 'OKWD', name: 'Alpha Solutions', sector: 'Consumer', revBase: 22000, ebitdaMargin: 0.46, debtBase: 3000, cashBase: 12000, shares: 540, initialRating: 'AAA', beta: 0.80 },
    { ticker: 'AJZA', name: 'Alpha Services', sector: 'Consumer', revBase: 31000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 4200, shares: 780, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'DCCN', name: 'United Inc', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 8000, cashBase: 16000, shares: 1200, initialRating: 'AA', beta: 0.85 },
    { ticker: 'EIMD', name: 'Vertex Corp', sector: 'Consumer', revBase: 28000, ebitdaMargin: 0.29, debtBase: 24000, cashBase: 5500, shares: 690, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'JOPU', name: 'Crest Capital', sector: 'Consumer', revBase: 36000, ebitdaMargin: 0.17, debtBase: 22000, cashBase: 4900, shares: 910, initialRating: 'A', beta: 0.55 },
    { ticker: 'GITI', name: 'Prime Ventures', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.06, debtBase: 28000, cashBase: 6500, shares: 1750, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'TJHM', name: 'United Solutions', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.03, debtBase: 34000, cashBase: 480, shares: 520, initialRating: 'CCC', beta: 2.05 },
  ],
};

/**
 * Generate 200 fully instantiated companies (50 per region across 5 sectors)
 */
export function generateInitialCompanies(): Company[] {
  const companies: Company[] = [];

  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];

  regions.forEach((region) => {
    const templates = REGION_COMPANIES[region];
    templates.forEach((rawTmpl, idx) => {
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

      const company: Company = {
        id: `${region}_${tmpl.ticker}`,
        ticker: tmpl.ticker,
        name: tmpl.name,
        region,
        sector: tmpl.sector,
        
        baselineAnnualRevenue: tmpl.revBase, annualRevenue: tmpl.revBase,
        ebitda,
        ebit,
        netIncome,
        eps,
        sharesOutstanding: tmpl.shares,
        cash: tmpl.cashBase,
        totalDebt: tmpl.debtBase,
        currentLiabilities: Math.round(tmpl.debtBase * 0.25 + tmpl.revBase * 0.08),
        debtInterestRate: interestRate,
        capex: Math.round(tmpl.revBase * 0.06),
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
        
        stockPrice,
        historicalPrices,
        forwardPE: sectorConfig.basePE,
        marketCap: Number((stockPrice * tmpl.shares).toFixed(0)),
        dividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        beta: tmpl.beta,
        
        seniorBondYield: 0.05 + oasSpreadBps / 10000,
        oasSpreadBps,
        cdsSpreadBps,
        sentiment: 0.0,
      };

      companies.push(company);
    });
  });

  return companies;
}
