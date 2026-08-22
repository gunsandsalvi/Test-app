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
    { ticker: 'NVST', name: 'Novastack Cloud Tech', sector: 'Tech', revBase: 125000, ebitdaMargin: 0.44, debtBase: 25000, cashBase: 38000, shares: 2800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'QBIT', name: 'Quantum Core Computing', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.38, debtBase: 19000, cashBase: 22000, shares: 1950, initialRating: 'AA', beta: 1.35 },
    { ticker: 'SYNX', name: 'Synapse AI Robotics', sector: 'Tech', revBase: 64000, ebitdaMargin: 0.35, debtBase: 24000, cashBase: 12000, shares: 1400, initialRating: 'A', beta: 1.45 },
    { ticker: 'HYPR', name: 'HyperScale Data Labs', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.28, debtBase: 31000, cashBase: 8000, shares: 920, initialRating: 'BBB', beta: 1.18 },
    { ticker: 'CYBR', name: 'CyberVault Defense Corp', sector: 'Tech', revBase: 29000, ebitdaMargin: 0.24, debtBase: 28000, cashBase: 4500, shares: 680, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'STRM', name: 'StreamWave Interactive', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.19, debtBase: 26000, cashBase: 3200, shares: 540, initialRating: 'BB', beta: 1.40 },
    { ticker: 'APEX', name: 'Apex Logic Semiconductor', sector: 'Tech', revBase: 18500, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 2100, shares: 410, initialRating: 'BB', beta: 1.55 },
    { ticker: 'NANO', name: 'Nanofab Integrated Circuits', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.13, debtBase: 29000, cashBase: 1100, shares: 330, initialRating: 'B', beta: 1.65 },
    { ticker: 'VOXL', name: 'Voxel Spatial Spatial AI', sector: 'Tech', revBase: 8500, ebitdaMargin: 0.08, debtBase: 25000, cashBase: 650, shares: 250, initialRating: 'B', beta: 1.80 },
    { ticker: 'ZETA', name: 'ZetaLink Micro Devices', sector: 'Tech', revBase: 5200, ebitdaMargin: 0.04, debtBase: 22000, cashBase: 320, shares: 180, initialRating: 'CCC', beta: 2.10 },

    // Energy (10)
    { ticker: 'TXEN', name: 'Texas Basin Energy', sector: 'Energy', revBase: 95000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 14000, shares: 1800, initialRating: 'AA', beta: 0.85 },
    { ticker: 'GULF', name: 'Gulf Offshore Petroleum', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.29, debtBase: 32000, cashBase: 9500, shares: 1450, initialRating: 'A', beta: 0.95 },
    { ticker: 'PIPE', name: 'Midstream Trans-Continental', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.42, debtBase: 48000, cashBase: 4200, shares: 980, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'SHLE', name: 'Permian Shale Drilling', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.26, debtBase: 38000, cashBase: 3100, shares: 720, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'SOLR', name: 'Helios Clean Power', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.22, debtBase: 30000, cashBase: 2800, shares: 610, initialRating: 'BB', beta: 1.30 },
    { ticker: 'REFN', name: 'Atlantic Refining & Fuel', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 3500, shares: 890, initialRating: 'BB', beta: 1.05 },
    { ticker: 'HYDN', name: 'NextGen Hydrogen Fuels', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.14, debtBase: 19000, cashBase: 1200, shares: 420, initialRating: 'B', beta: 1.45 },
    { ticker: 'URAN', name: 'American Nuclear Fuel', sector: 'Energy', revBase: 15000, ebitdaMargin: 0.20, debtBase: 22000, cashBase: 1400, shares: 380, initialRating: 'BB', beta: 1.10 },
    { ticker: 'DRIF', name: 'DeepDrill Offshore Rig', sector: 'Energy', revBase: 13500, ebitdaMargin: 0.15, debtBase: 27000, cashBase: 800, shares: 310, initialRating: 'B', beta: 1.60 },
    { ticker: 'LIGN', name: 'Appalachian Coal & Carbon', sector: 'Energy', revBase: 7200, ebitdaMargin: 0.09, debtBase: 18000, cashBase: 290, shares: 210, initialRating: 'CCC', beta: 1.75 },

    // Financials (10)
    { ticker: 'JPMC', name: 'Liberty Financial Group', sector: 'Financials', revBase: 140000, ebitdaMargin: 0.36, debtBase: 110000, cashBase: 65000, shares: 2900, initialRating: 'AAA', beta: 0.95 },
    { ticker: 'MSCP', name: 'Beacon Trust Bancorp', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.31, debtBase: 74000, cashBase: 34000, shares: 1600, initialRating: 'AA', beta: 1.05 },
    { ticker: 'AMEX', name: 'Pacific Merchant Bank', sector: 'Financials', revBase: 58000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 21000, shares: 1200, initialRating: 'A', beta: 1.10 },
    { ticker: 'BLKX', name: 'Vanguard Asset Partners', sector: 'Financials', revBase: 32000, ebitdaMargin: 0.46, debtBase: 18000, cashBase: 15000, shares: 850, initialRating: 'AA', beta: 1.20 },
    { ticker: 'INSU', name: 'Hartford Life & Casualty', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.22, debtBase: 39000, cashBase: 18000, shares: 940, initialRating: 'A', beta: 0.80 },
    { ticker: 'PRVT', name: 'Blackstone Capital Holdings', sector: 'Financials', revBase: 28000, ebitdaMargin: 0.40, debtBase: 42000, cashBase: 9000, shares: 620, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'MORT', name: 'Prime Residential Mortgage', sector: 'Financials', revBase: 22000, ebitdaMargin: 0.25, debtBase: 38000, cashBase: 4800, shares: 510, initialRating: 'BB', beta: 1.50 },
    { ticker: 'BNPL', name: 'FlexPay Consumer Credit', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.16, debtBase: 28000, cashBase: 2100, shares: 430, initialRating: 'B', beta: 1.70 },
    { ticker: 'COMM', name: 'Midwest Regional Bank', sector: 'Financials', revBase: 16500, ebitdaMargin: 0.24, debtBase: 25000, cashBase: 3100, shares: 390, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'SUBP', name: 'Apex Subprime Lending', sector: 'Financials', revBase: 9800, ebitdaMargin: 0.12, debtBase: 31000, cashBase: 850, shares: 280, initialRating: 'CCC', beta: 1.95 },

    // Industrials (10)
    { ticker: 'AERO', name: 'Boeing AeroDefense Corp', sector: 'Industrials', revBase: 76000, ebitdaMargin: 0.18, debtBase: 45000, cashBase: 11000, shares: 1100, initialRating: 'A', beta: 1.10 },
    { ticker: 'CATR', name: 'Titan Heavy Machinery', sector: 'Industrials', revBase: 64000, ebitdaMargin: 0.22, debtBase: 32000, cashBase: 9800, shares: 980, initialRating: 'A', beta: 1.05 },
    { ticker: 'RAIL', name: 'Union Freight Railways', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.38, debtBase: 36000, cashBase: 4200, shares: 740, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'SHIP', name: 'Maverick Logistics Global', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'AUTO', name: 'MotorCity EV Motors', sector: 'Industrials', revBase: 58000, ebitdaMargin: 0.14, debtBase: 48000, cashBase: 6200, shares: 1250, initialRating: 'BB', beta: 1.40 },
    { ticker: 'CHEM', name: 'DuPont Precision Polymers', sector: 'Industrials', revBase: 31000, ebitdaMargin: 0.21, debtBase: 26000, cashBase: 3900, shares: 640, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'METL', name: 'United Steel Foundries', sector: 'Industrials', revBase: 27000, ebitdaMargin: 0.15, debtBase: 29000, cashBase: 2400, shares: 530, initialRating: 'BB', beta: 1.35 },
    { ticker: 'CNST', name: 'Bechtel Infrastructure Works', sector: 'Industrials', revBase: 22000, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 1900, shares: 410, initialRating: 'BB', beta: 1.15 },
    { ticker: 'PACK', name: 'Packaging Corp America', sector: 'Industrials', revBase: 16000, ebitdaMargin: 0.15, debtBase: 19000, cashBase: 1100, shares: 350, initialRating: 'B', beta: 0.95 },
    { ticker: 'DRIL', name: 'Industrial Mining Tools', sector: 'Industrials', revBase: 8400, ebitdaMargin: 0.08, debtBase: 17000, cashBase: 410, shares: 220, initialRating: 'CCC', beta: 1.65 },

    // Consumer (10)
    { ticker: 'WMRT', name: 'OmniRetail MegaStores', sector: 'Consumer', revBase: 210000, ebitdaMargin: 0.09, debtBase: 55000, cashBase: 26000, shares: 3800, initialRating: 'AA', beta: 0.65 },
    { ticker: 'BEVG', name: 'National Beverages Group', sector: 'Consumer', revBase: 72000, ebitdaMargin: 0.31, debtBase: 38000, cashBase: 16000, shares: 1850, initialRating: 'AAA', beta: 0.60 },
    { ticker: 'FASH', name: 'Luxury Apparel Collective', sector: 'Consumer', revBase: 41000, ebitdaMargin: 0.26, debtBase: 24000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.15 },
    { ticker: 'FOOD', name: 'General Pantry Foods', sector: 'Consumer', revBase: 52000, ebitdaMargin: 0.18, debtBase: 37000, cashBase: 6200, shares: 1150, initialRating: 'A', beta: 0.55 },
    { ticker: 'REST', name: 'Golden Arches Franchises', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.35, debtBase: 41000, cashBase: 4900, shares: 760, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'PHRM', name: 'BioHealth Consumer Rx', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 35000, cashBase: 7800, shares: 990, initialRating: 'A', beta: 0.70 },
    { ticker: 'HOTL', name: 'Grand Horizon Hospitality', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.23, debtBase: 38000, cashBase: 2900, shares: 620, initialRating: 'BB', beta: 1.30 },
    { ticker: 'CRUZ', name: 'Oceanic Carnival Cruises', sector: 'Consumer', revBase: 19000, ebitdaMargin: 0.20, debtBase: 44000, cashBase: 2200, shares: 580, initialRating: 'B', beta: 1.70 },
    { ticker: 'COSM', name: 'Glow Beauty Labs', sector: 'Consumer', revBase: 14500, ebitdaMargin: 0.17, debtBase: 18000, cashBase: 1400, shares: 410, initialRating: 'BB', beta: 1.10 },
    { ticker: 'GYMS', name: 'Fitness Club Franchises', sector: 'Consumer', revBase: 6500, ebitdaMargin: 0.07, debtBase: 19000, cashBase: 280, shares: 240, initialRating: 'CCC', beta: 1.60 },
  ],

  UK: [
    // Tech (10)
    { ticker: 'ARMC', name: 'Cambridge Silicon IP', sector: 'Tech', revBase: 45000, ebitdaMargin: 0.46, debtBase: 8000, cashBase: 14000, shares: 1200, initialRating: 'AAA', beta: 1.20 },
    { ticker: 'OXAI', name: 'Oxford Deep Analytics', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.34, debtBase: 9500, cashBase: 8200, shares: 750, initialRating: 'AA', beta: 1.30 },
    { ticker: 'FINX', name: 'London FinTech Protocol', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.27, debtBase: 11000, cashBase: 4600, shares: 520, initialRating: 'A', beta: 1.40 },
    { ticker: 'DATK', name: 'CyberShield UK', sector: 'Tech', revBase: 14000, ebitdaMargin: 0.22, debtBase: 12500, cashBase: 3100, shares: 410, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'SFTW', name: 'Enterprise ERP Solutions UK', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.29, debtBase: 18000, cashBase: 4500, shares: 580, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'CLOD', name: 'Britannia Cloud Infrastructure', sector: 'Tech', revBase: 12500, ebitdaMargin: 0.18, debtBase: 16000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.35 },
    { ticker: 'TELM', name: 'Telematics Fleet AI', sector: 'Tech', revBase: 8900, ebitdaMargin: 0.15, debtBase: 14000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.45 },
    { ticker: 'GAMX', name: 'Rebellion Game Studios', sector: 'Tech', revBase: 7100, ebitdaMargin: 0.12, debtBase: 13000, cashBase: 850, shares: 240, initialRating: 'B', beta: 1.55 },
    { ticker: 'BIOC', name: 'Biotech Genetic Sequencing', sector: 'Tech', revBase: 5400, ebitdaMargin: 0.08, debtBase: 15000, cashBase: 490, shares: 190, initialRating: 'B', beta: 1.70 },
    { ticker: 'QLNK', name: 'Quantum Cryptography UK', sector: 'Tech', revBase: 3200, ebitdaMargin: 0.02, debtBase: 11000, cashBase: 210, shares: 140, initialRating: 'CCC', beta: 2.05 },

    // Energy (10)
    { ticker: 'BPET', name: 'British Petroleum Global', sector: 'Energy', revBase: 115000, ebitdaMargin: 0.28, debtBase: 52000, cashBase: 22000, shares: 2400, initialRating: 'A', beta: 0.90 },
    { ticker: 'SHLL', name: 'Shell Energy International', sector: 'Energy', revBase: 130000, ebitdaMargin: 0.30, debtBase: 58000, cashBase: 27000, shares: 2600, initialRating: 'AA', beta: 0.88 },
    { ticker: 'NTHS', name: 'North Sea Crude Extractors', sector: 'Energy', revBase: 32000, ebitdaMargin: 0.33, debtBase: 28000, cashBase: 4800, shares: 720, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'WIND', name: 'Offshore Wind Farms UK', sector: 'Energy', revBase: 24000, ebitdaMargin: 0.38, debtBase: 34000, cashBase: 3600, shares: 620, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'GRID', name: 'National Energy Transmissions', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.42, debtBase: 46000, cashBase: 4100, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'CENT', name: 'Centrica Gas Distribution', sector: 'Energy', revBase: 42000, ebitdaMargin: 0.15, debtBase: 31000, cashBase: 3900, shares: 950, initialRating: 'BBB', beta: 0.95 },
    { ticker: 'HYDG', name: 'Green Hydrogen Power UK', sector: 'Energy', revBase: 8500, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1100, shares: 310, initialRating: 'BB', beta: 1.40 },
    { ticker: 'DRAX', name: 'Biomass Clean Generation', sector: 'Energy', revBase: 11000, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1300, shares: 350, initialRating: 'BB', beta: 1.20 },
    { ticker: 'SOLU', name: 'Solaris Utility Systems', sector: 'Energy', revBase: 6800, ebitdaMargin: 0.13, debtBase: 12000, cashBase: 720, shares: 240, initialRating: 'B', beta: 1.50 },
    { ticker: 'FOSS', name: 'Thames Heavy Coal & Coke', sector: 'Energy', revBase: 4100, ebitdaMargin: 0.05, debtBase: 13000, cashBase: 220, shares: 160, initialRating: 'CCC', beta: 1.80 },

    // Financials (10)
    { ticker: 'HSBC', name: 'Empire International Bank', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.35, debtBase: 78000, cashBase: 45000, shares: 2200, initialRating: 'AA', beta: 0.90 },
    { ticker: 'BARC', name: 'Barclays Capital Partners', sector: 'Financials', revBase: 68000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 29000, shares: 1700, initialRating: 'A', beta: 1.15 },
    { ticker: 'LLOY', name: 'Lloyds Commercial Banking', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.33, debtBase: 42000, cashBase: 21000, shares: 1400, initialRating: 'A', beta: 0.95 },
    { ticker: 'NWST', name: 'NatWest Banking Group', sector: 'Financials', revBase: 41000, ebitdaMargin: 0.30, debtBase: 38000, cashBase: 18000, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'PRUD', name: 'Prudential Assurance Global', sector: 'Financials', revBase: 36000, ebitdaMargin: 0.24, debtBase: 29000, cashBase: 16000, shares: 920, initialRating: 'A', beta: 1.00 },
    { ticker: 'LSEG', name: 'London Stock Exchange Tech', sector: 'Financials', revBase: 24000, ebitdaMargin: 0.48, debtBase: 19000, cashBase: 9500, shares: 680, initialRating: 'AA', beta: 0.85 },
    { ticker: 'SCHR', name: 'Schroders Wealth Management', sector: 'Financials', revBase: 18000, ebitdaMargin: 0.36, debtBase: 12000, cashBase: 7200, shares: 510, initialRating: 'A', beta: 1.10 },
    { ticker: 'PEER', name: 'Financier P2P Lending', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.18, debtBase: 17000, cashBase: 1600, shares: 320, initialRating: 'BB', beta: 1.60 },
    { ticker: 'CRES', name: 'Commercial Property Reit', sector: 'Financials', revBase: 14000, ebitdaMargin: 0.32, debtBase: 28000, cashBase: 2100, shares: 440, initialRating: 'BB', beta: 1.35 },
    { ticker: 'HIGH', name: 'Highland Subprime Mortgages', sector: 'Financials', revBase: 5800, ebitdaMargin: 0.10, debtBase: 18000, cashBase: 430, shares: 210, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'ROLL', name: 'Rolls Aerospace Turbines', sector: 'Industrials', revBase: 42000, ebitdaMargin: 0.17, debtBase: 28000, cashBase: 7500, shares: 1100, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'BAES', name: 'BAE Tactical Defense Systems', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 22000, cashBase: 9800, shares: 980, initialRating: 'AA', beta: 0.75 },
    { ticker: 'GLEN', name: 'Glencore Commodities Mining', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.16, debtBase: 48000, cashBase: 14000, shares: 1900, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'RIOO', name: 'Rio Tinto Mineral Resources', sector: 'Industrials', revBase: 78000, ebitdaMargin: 0.38, debtBase: 28000, cashBase: 18000, shares: 1550, initialRating: 'AA', beta: 1.15 },
    { ticker: 'ANGL', name: 'Anglo American Base Metals', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.26, debtBase: 34000, cashBase: 8900, shares: 1200, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'BABL', name: 'Babcock Marine & Nuclear', sector: 'Industrials', revBase: 18000, ebitdaMargin: 0.13, debtBase: 16000, cashBase: 2400, shares: 520, initialRating: 'BB', beta: 1.10 },
    { ticker: 'WEIR', name: 'Weir Mining Equipment', sector: 'Industrials', revBase: 12500, ebitdaMargin: 0.19, debtBase: 13000, cashBase: 1900, shares: 380, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'CRAN', name: 'Crane Infrastructure UK', sector: 'Industrials', revBase: 9800, ebitdaMargin: 0.11, debtBase: 14000, cashBase: 1200, shares: 310, initialRating: 'BB', beta: 1.25 },
    { ticker: 'POLY', name: 'British Advanced Polymers', sector: 'Industrials', revBase: 7400, ebitdaMargin: 0.12, debtBase: 11000, cashBase: 850, shares: 250, initialRating: 'B', beta: 1.40 },
    { ticker: 'STEE', name: 'Sheffield Blast Furnaces', sector: 'Industrials', revBase: 5100, ebitdaMargin: 0.06, debtBase: 15000, cashBase: 280, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Consumer (10)
    { ticker: 'UNIL', name: 'Unilever Consumer Goods', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.24, debtBase: 39000, cashBase: 15000, shares: 2100, initialRating: 'AAA', beta: 0.55 },
    { ticker: 'DIAG', name: 'Diageo Distillers Global', sector: 'Consumer', revBase: 38000, ebitdaMargin: 0.36, debtBase: 28000, cashBase: 8200, shares: 1150, initialRating: 'AA', beta: 0.70 },
    { ticker: 'BATS', name: 'British American Brands', sector: 'Consumer', revBase: 44000, ebitdaMargin: 0.44, debtBase: 52000, cashBase: 7800, shares: 1300, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'TSCO', name: 'Tesco Supermarket Chain', sector: 'Consumer', revBase: 76000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 8900, shares: 1800, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'AZNA', name: 'Astra BioPharmaceuticals', sector: 'Consumer', revBase: 65000, ebitdaMargin: 0.32, debtBase: 34000, cashBase: 16000, shares: 1550, initialRating: 'AA', beta: 0.60 },
    { ticker: 'RECK', name: 'Reckitt Hygiene Brands', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.26, debtBase: 21000, cashBase: 6200, shares: 890, initialRating: 'A', beta: 0.65 },
    { ticker: 'BURB', name: 'Burberry Heritage Fashion', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.21, debtBase: 12000, cashBase: 3100, shares: 480, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'EASY', name: 'EasyJet Continental Airways', sector: 'Consumer', revBase: 21000, ebitdaMargin: 0.15, debtBase: 26000, cashBase: 2900, shares: 640, initialRating: 'BB', beta: 1.50 },
    { ticker: 'PUBX', name: 'Wetherspoon Pub Group', sector: 'Consumer', revBase: 11000, ebitdaMargin: 0.12, debtBase: 19000, cashBase: 1100, shares: 380, initialRating: 'B', beta: 1.35 },
    { ticker: 'CINM', name: 'Odeon Cinema Properties', sector: 'Consumer', revBase: 4800, ebitdaMargin: 0.06, debtBase: 16000, cashBase: 310, shares: 210, initialRating: 'CCC', beta: 1.90 },
  ],

  JPN: [
    // Tech (10)
    { ticker: 'SNYJ', name: 'Sony Interactive Matrix', sector: 'Tech', revBase: 110000, ebitdaMargin: 0.25, debtBase: 32000, cashBase: 29000, shares: 2100, initialRating: 'AA', beta: 1.10 },
    { ticker: 'TELS', name: 'Tokyo Electron Lithography', sector: 'Tech', revBase: 42000, ebitdaMargin: 0.35, debtBase: 8500, cashBase: 16000, shares: 980, initialRating: 'AAA', beta: 1.35 },
    { ticker: 'SFTB', name: 'SoftBank Global Ventures', sector: 'Tech', revBase: 84000, ebitdaMargin: 0.28, debtBase: 120000, cashBase: 38000, shares: 2200, initialRating: 'BB', beta: 1.65 },
    { ticker: 'KEYN', name: 'Keyence Optical Sensors', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.52, debtBase: 3000, cashBase: 21000, shares: 620, initialRating: 'AAA', beta: 1.05 },
    { ticker: 'RENJ', name: 'Renesas Automotive Micro', sector: 'Tech', revBase: 34000, ebitdaMargin: 0.31, debtBase: 22000, cashBase: 8500, shares: 890, initialRating: 'A', beta: 1.30 },
    { ticker: 'PANJ', name: 'Panasonic EV Energy Storage', sector: 'Tech', revBase: 65000, ebitdaMargin: 0.12, debtBase: 38000, cashBase: 12000, shares: 1700, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'NECJ', name: 'NEC Telecom Solutions', sector: 'Tech', revBase: 31000, ebitdaMargin: 0.11, debtBase: 26000, cashBase: 5100, shares: 820, initialRating: 'BBB', beta: 1.00 },
    { ticker: 'FANU', name: 'Fanuc CNC Robotics Japan', sector: 'Tech', revBase: 22000, ebitdaMargin: 0.33, debtBase: 6000, cashBase: 14000, shares: 580, initialRating: 'AA', beta: 1.20 },
    { ticker: 'ROHM', name: 'Rohm Silicon Carbide', sector: 'Tech', revBase: 12000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 2200, shares: 350, initialRating: 'BB', beta: 1.45 },
    { ticker: 'JDIJ', name: 'Japan Display Micro Panels', sector: 'Tech', revBase: 5800, ebitdaMargin: 0.03, debtBase: 19000, cashBase: 390, shares: 220, initialRating: 'CCC', beta: 2.15 },

    // Energy (10)
    { ticker: 'INPX', name: 'INPEX Global Exploration', sector: 'Energy', revBase: 38000, ebitdaMargin: 0.62, debtBase: 22000, cashBase: 12000, shares: 980, initialRating: 'A', beta: 0.95 },
    { ticker: 'ENEJ', name: 'ENEOS Refining Holdings', sector: 'Energy', revBase: 78000, ebitdaMargin: 0.08, debtBase: 44000, cashBase: 9500, shares: 1850, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'TEPJ', name: 'Tokyo Electric Utility', sector: 'Energy', revBase: 62000, ebitdaMargin: 0.14, debtBase: 88000, cashBase: 11000, shares: 1600, initialRating: 'B', beta: 1.25 },
    { ticker: 'KANJ', name: 'Kansai Electric Power', sector: 'Energy', revBase: 44000, ebitdaMargin: 0.22, debtBase: 54000, cashBase: 6800, shares: 1100, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'TGSJ', name: 'Tokyo Gas LNG Infrastructure', sector: 'Energy', revBase: 36000, ebitdaMargin: 0.19, debtBase: 32000, cashBase: 5900, shares: 920, initialRating: 'A', beta: 0.70 },
    { ticker: 'OSGJ', name: 'Osaka Gas Terminal Net', sector: 'Energy', revBase: 27000, ebitdaMargin: 0.17, debtBase: 24000, cashBase: 4800, shares: 740, initialRating: 'A', beta: 0.65 },
    { ticker: 'RENX', name: 'Renova Renewable Solar JPN', sector: 'Energy', revBase: 7500, ebitdaMargin: 0.35, debtBase: 19000, cashBase: 1200, shares: 290, initialRating: 'BB', beta: 1.35 },
    { ticker: 'CHUJ', name: 'Chubu Nuclear Generation', sector: 'Energy', revBase: 31000, ebitdaMargin: 0.16, debtBase: 38000, cashBase: 3900, shares: 810, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'GEOT', name: 'Kyushu Geothermal Power', sector: 'Energy', revBase: 5900, ebitdaMargin: 0.24, debtBase: 14000, cashBase: 780, shares: 230, initialRating: 'BB', beta: 1.20 },
    { ticker: 'HOKJ', name: 'Hokkaido Thermal Power', sector: 'Energy', revBase: 12000, ebitdaMargin: 0.07, debtBase: 29000, cashBase: 620, shares: 380, initialRating: 'CCC', beta: 1.65 },

    // Financials (10)
    { ticker: 'MUFG', name: 'Mitsubishi Financial Group', sector: 'Financials', revBase: 98000, ebitdaMargin: 0.38, debtBase: 82000, cashBase: 55000, shares: 2600, initialRating: 'AA', beta: 0.85 },
    { ticker: 'SMFG', name: 'Sumitomo Mitsui Banking', sector: 'Financials', revBase: 82000, ebitdaMargin: 0.36, debtBase: 69000, cashBase: 44000, shares: 2100, initialRating: 'AA', beta: 0.90 },
    { ticker: 'MIZU', name: 'Mizuho Financial Holdings', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.32, debtBase: 58000, cashBase: 32000, shares: 1800, initialRating: 'A', beta: 0.95 },
    { ticker: 'NOMJ', name: 'Nomura Global Securities', sector: 'Financials', revBase: 34000, ebitdaMargin: 0.26, debtBase: 46000, cashBase: 16000, shares: 980, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'ORIX', name: 'ORIX Commercial Leasing', sector: 'Financials', revBase: 31000, ebitdaMargin: 0.34, debtBase: 38000, cashBase: 11000, shares: 850, initialRating: 'A', beta: 1.10 },
    { ticker: 'MSAD', name: 'MS&AD General Insurance', sector: 'Financials', revBase: 42000, ebitdaMargin: 0.20, debtBase: 29000, cashBase: 18000, shares: 990, initialRating: 'AA', beta: 0.75 },
    { ticker: 'DAII', name: 'Dai-ichi Life Holdings', sector: 'Financials', revBase: 49000, ebitdaMargin: 0.18, debtBase: 36000, cashBase: 22000, shares: 1150, initialRating: 'A', beta: 0.80 },
    { ticker: 'SBIF', name: 'SBI Online Digital Bancorp', sector: 'Financials', revBase: 16000, ebitdaMargin: 0.30, debtBase: 21000, cashBase: 4500, shares: 490, initialRating: 'BBB', beta: 1.45 },
    { ticker: 'SHIN', name: 'Shinsei Specialty Credit', sector: 'Financials', revBase: 11500, ebitdaMargin: 0.22, debtBase: 24000, cashBase: 2100, shares: 380, initialRating: 'BB', beta: 1.55 },
    { ticker: 'SURU', name: 'Suruga Real Estate Lending', sector: 'Financials', revBase: 4900, ebitdaMargin: 0.12, debtBase: 17000, cashBase: 390, shares: 190, initialRating: 'CCC', beta: 1.85 },

    // Industrials (10)
    { ticker: 'TMOT', name: 'Toyota Motor International', sector: 'Industrials', revBase: 240000, ebitdaMargin: 0.15, debtBase: 110000, cashBase: 48000, shares: 4200, initialRating: 'AAA', beta: 0.70 },
    { ticker: 'MHIJ', name: 'Mitsubishi Heavy Industries', sector: 'Industrials', revBase: 52000, ebitdaMargin: 0.14, debtBase: 28000, cashBase: 9500, shares: 1250, initialRating: 'A', beta: 1.15 },
    { ticker: 'KOMJ', name: 'Komatsu Earthmoving Eqpt', sector: 'Industrials', revBase: 39000, ebitdaMargin: 0.20, debtBase: 19000, cashBase: 8200, shares: 950, initialRating: 'A', beta: 1.20 },
    { ticker: 'HITJ', name: 'Hitachi Industrial Systems', sector: 'Industrials', revBase: 88000, ebitdaMargin: 0.16, debtBase: 39000, cashBase: 16000, shares: 1950, initialRating: 'AA', beta: 0.90 },
    { ticker: 'DENJ', name: 'Denso Automotive Systems', sector: 'Industrials', revBase: 54000, ebitdaMargin: 0.13, debtBase: 21000, cashBase: 11000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'NSCJ', name: 'Nippon Steel Manufacturing', sector: 'Industrials', revBase: 68000, ebitdaMargin: 0.12, debtBase: 42000, cashBase: 7800, shares: 1650, initialRating: 'BBB', beta: 1.35 },
    { ticker: 'DAIK', name: 'Daikin HVAC Climate Tech', sector: 'Industrials', revBase: 36000, ebitdaMargin: 0.18, debtBase: 14000, cashBase: 8900, shares: 890, initialRating: 'AA', beta: 0.95 },
    { ticker: 'NYKJ', name: 'Nippon Yusen Marine Cargo', sector: 'Industrials', revBase: 29000, ebitdaMargin: 0.25, debtBase: 28000, cashBase: 4900, shares: 720, initialRating: 'BBB', beta: 1.40 },
    { ticker: 'ASAH', name: 'Asahi Glass Industrial', sector: 'Industrials', revBase: 19000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 2600, shares: 510, initialRating: 'BB', beta: 1.10 },
    { ticker: 'TKFJ', name: 'Takata Auto Restraints', sector: 'Industrials', revBase: 6200, ebitdaMargin: 0.05, debtBase: 17000, cashBase: 340, shares: 220, initialRating: 'CCC', beta: 1.95 },

    // Consumer (10)
    { ticker: 'NTDO', name: 'Nintendo Interactive Game', sector: 'Consumer', revBase: 34000, ebitdaMargin: 0.42, debtBase: 1000, cashBase: 24000, shares: 890, initialRating: 'AAA', beta: 0.75 },
    { ticker: 'FRTJ', name: 'Fast Retailing Uniqlo', sector: 'Consumer', revBase: 42000, ebitdaMargin: 0.22, debtBase: 14000, cashBase: 16000, shares: 1050, initialRating: 'AA', beta: 0.80 },
    { ticker: 'SEVJ', name: 'Seven & i Retail Network', sector: 'Consumer', revBase: 85000, ebitdaMargin: 0.09, debtBase: 44000, cashBase: 12000, shares: 1900, initialRating: 'A', beta: 0.65 },
    { ticker: 'SHIS', name: 'Shiseido Global Cosmetics', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.15, debtBase: 12000, cashBase: 3800, shares: 520, initialRating: 'A', beta: 0.90 },
    { ticker: 'ASAB', name: 'Asahi Breweries Beverage', sector: 'Consumer', revBase: 29000, ebitdaMargin: 0.17, debtBase: 26000, cashBase: 4500, shares: 740, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'KIRJ', name: 'Kirin Holdings Food & Brew', sector: 'Consumer', revBase: 26000, ebitdaMargin: 0.16, debtBase: 24000, cashBase: 4100, shares: 690, initialRating: 'BBB', beta: 0.65 },
    { ticker: 'RAKU', name: 'Rakuten Marketplace & Mobile', sector: 'Consumer', revBase: 32000, ebitdaMargin: 0.08, debtBase: 52000, cashBase: 3500, shares: 980, initialRating: 'B', beta: 1.60 },
    { ticker: 'ORIENT', name: 'Oriental Land Tokyo Resort', sector: 'Consumer', revBase: 16000, ebitdaMargin: 0.32, debtBase: 11000, cashBase: 5200, shares: 480, initialRating: 'AA', beta: 0.85 },
    { ticker: 'NISS', name: 'Nissin Instant Food Labs', sector: 'Consumer', revBase: 12500, ebitdaMargin: 0.16, debtBase: 9500, cashBase: 2400, shares: 380, initialRating: 'A', beta: 0.55 },
    { ticker: 'APAM', name: 'Apamanshop Rental Housing', sector: 'Consumer', revBase: 4500, ebitdaMargin: 0.06, debtBase: 14000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.70 },
  ],

  EUR: [
    // Tech (10)
    { ticker: 'ASML', name: 'ASML EUV Precision Litho', sector: 'Tech', revBase: 95000, ebitdaMargin: 0.42, debtBase: 14000, cashBase: 26000, shares: 1800, initialRating: 'AAA', beta: 1.25 },
    { ticker: 'SAPG', name: 'SAP Enterprise Software AG', sector: 'Tech', revBase: 88000, ebitdaMargin: 0.34, debtBase: 22000, cashBase: 18000, shares: 1750, initialRating: 'AA', beta: 0.95 },
    { ticker: 'STMJ', name: 'STMicroelectronics Micro', sector: 'Tech', revBase: 36000, ebitdaMargin: 0.30, debtBase: 12000, cashBase: 8500, shares: 940, initialRating: 'A', beta: 1.35 },
    { ticker: 'IFXG', name: 'Infineon Auto Semiconductors', sector: 'Tech', revBase: 38000, ebitdaMargin: 0.28, debtBase: 19000, cashBase: 7200, shares: 980, initialRating: 'A', beta: 1.30 },
    { ticker: 'DASS', name: 'Dassault 3D Virtual Systems', sector: 'Tech', revBase: 21000, ebitdaMargin: 0.36, debtBase: 8000, cashBase: 6500, shares: 620, initialRating: 'AA', beta: 0.90 },
    { ticker: 'ATOS', name: 'Atos Digital IT Transformation', sector: 'Tech', revBase: 24000, ebitdaMargin: 0.09, debtBase: 38000, cashBase: 2200, shares: 720, initialRating: 'CCC', beta: 2.10 },
    { ticker: 'AMAD', name: 'Amadeus Airline Booking GDS', sector: 'Tech', revBase: 19000, ebitdaMargin: 0.38, debtBase: 16000, cashBase: 4900, shares: 540, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'SOIT', name: 'Soitec Engineered Wafers', sector: 'Tech', revBase: 11000, ebitdaMargin: 0.31, debtBase: 14000, cashBase: 1900, shares: 360, initialRating: 'BB', beta: 1.50 },
    { ticker: 'DELV', name: 'Delivery Hero Express EU', sector: 'Tech', revBase: 28000, ebitdaMargin: 0.05, debtBase: 32000, cashBase: 2800, shares: 810, initialRating: 'B', beta: 1.75 },
    { ticker: 'NORD', name: 'Nordic Semiconductor BLE', sector: 'Tech', revBase: 7200, ebitdaMargin: 0.16, debtBase: 8500, cashBase: 1100, shares: 250, initialRating: 'BB', beta: 1.40 },

    // Energy (10)
    { ticker: 'TOTF', name: 'TotalEnergies International', sector: 'Energy', revBase: 140000, ebitdaMargin: 0.29, debtBase: 62000, cashBase: 31000, shares: 2700, initialRating: 'AA', beta: 0.88 },
    { ticker: 'ENII', name: 'Eni Hydrocarbon Resources', sector: 'Energy', revBase: 92000, ebitdaMargin: 0.25, debtBase: 48000, cashBase: 16000, shares: 1900, initialRating: 'A', beta: 0.95 },
    { ticker: 'IBER', name: 'Iberdrola Global Renewables', sector: 'Energy', revBase: 58000, ebitdaMargin: 0.38, debtBase: 68000, cashBase: 9500, shares: 1450, initialRating: 'BBB', beta: 0.75 },
    { ticker: 'ENEL', name: 'Enel Clean Grid Infrastructure', sector: 'Energy', revBase: 84000, ebitdaMargin: 0.32, debtBase: 95000, cashBase: 12000, shares: 1950, initialRating: 'BBB', beta: 0.80 },
    { ticker: 'ORST', name: 'Orsted Offshore Wind Farms', sector: 'Energy', revBase: 22000, ebitdaMargin: 0.36, debtBase: 34000, cashBase: 4100, shares: 620, initialRating: 'BBB', beta: 1.25 },
    { ticker: 'ENGY', name: 'Engie Gas & Power EU', sector: 'Energy', revBase: 71000, ebitdaMargin: 0.21, debtBase: 49000, cashBase: 9800, shares: 1600, initialRating: 'BBB', beta: 0.85 },
    { ticker: 'REPS', name: 'Repsol Energy Refining', sector: 'Energy', revBase: 52000, ebitdaMargin: 0.20, debtBase: 28000, cashBase: 6900, shares: 1250, initialRating: 'BBB', beta: 1.05 },
    { ticker: 'EDFF', name: 'Electricite de France Nuclear', sector: 'Energy', revBase: 110000, ebitdaMargin: 0.22, debtBase: 140000, cashBase: 14000, shares: 2400, initialRating: 'BBB', beta: 0.90 },
    { ticker: 'NORDW', name: 'Nordex Wind Turbines AG', sector: 'Energy', revBase: 14000, ebitdaMargin: 0.08, debtBase: 19000, cashBase: 1400, shares: 420, initialRating: 'B', beta: 1.55 },
    { ticker: 'SOLA', name: 'Solarworld Silicon PV', sector: 'Energy', revBase: 4800, ebitdaMargin: 0.04, debtBase: 15000, cashBase: 290, shares: 180, initialRating: 'CCC', beta: 1.85 },

    // Financials (10)
    { ticker: 'BNPP', name: 'BNP Paribas Premier Bank', sector: 'Financials', revBase: 115000, ebitdaMargin: 0.34, debtBase: 98000, cashBase: 62000, shares: 2500, initialRating: 'AA', beta: 1.00 },
    { ticker: 'ALVN', name: 'Allianz SE Insurer Global', sector: 'Financials', revBase: 125000, ebitdaMargin: 0.22, debtBase: 65000, cashBase: 48000, shares: 2600, initialRating: 'AAA', beta: 0.70 },
    { ticker: 'SANM', name: 'Banco Santander International', sector: 'Financials', revBase: 88000, ebitdaMargin: 0.32, debtBase: 84000, cashBase: 39000, shares: 2200, initialRating: 'A', beta: 1.10 },
    { ticker: 'INGA', name: 'ING Groep Digital Bancorp', sector: 'Financials', revBase: 52000, ebitdaMargin: 0.36, debtBase: 48000, cashBase: 28000, shares: 1450, initialRating: 'A', beta: 1.05 },
    { ticker: 'AXAF', name: 'AXA Group Insurance Global', sector: 'Financials', revBase: 95000, ebitdaMargin: 0.20, debtBase: 58000, cashBase: 36000, shares: 2100, initialRating: 'AA', beta: 0.75 },
    { ticker: 'DBKG', name: 'Deutsche Bank Capital Markets', sector: 'Financials', revBase: 64000, ebitdaMargin: 0.24, debtBase: 78000, cashBase: 29000, shares: 1700, initialRating: 'BBB', beta: 1.30 },
    { ticker: 'INTI', name: 'Intesa Sanpaolo Italian Bank', sector: 'Financials', revBase: 48000, ebitdaMargin: 0.38, debtBase: 44000, cashBase: 22000, shares: 1350, initialRating: 'BBB', beta: 1.10 },
    { ticker: 'BBVA', name: 'BBVA Retail Banking Group', sector: 'Financials', revBase: 54000, ebitdaMargin: 0.35, debtBase: 49000, cashBase: 24000, shares: 1400, initialRating: 'A', beta: 1.05 },
    { ticker: 'UCGI', name: 'UniCredit Banking Group', sector: 'Financials', revBase: 46000, ebitdaMargin: 0.36, debtBase: 42000, cashBase: 21000, shares: 1300, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'BMPS', name: 'Banca Monte Paschi Siena', sector: 'Financials', revBase: 9200, ebitdaMargin: 0.14, debtBase: 24000, cashBase: 1800, shares: 350, initialRating: 'CCC', beta: 1.90 },

    // Industrials (10)
    { ticker: 'SIEG', name: 'Siemens Industrial Automation', sector: 'Industrials', revBase: 98000, ebitdaMargin: 0.19, debtBase: 42000, cashBase: 21000, shares: 2150, initialRating: 'AA', beta: 0.90 },
    { ticker: 'AIRB', name: 'Airbus Commercial Aerospace', sector: 'Industrials', revBase: 84000, ebitdaMargin: 0.16, debtBase: 34000, cashBase: 22000, shares: 1800, initialRating: 'A', beta: 1.10 },
    { ticker: 'SCHN', name: 'Schneider Electric Grid Tech', sector: 'Industrials', revBase: 48000, ebitdaMargin: 0.22, debtBase: 21000, cashBase: 11000, shares: 1200, initialRating: 'AA', beta: 0.95 },
    { ticker: 'VOWG', name: 'Volkswagen Auto Group', sector: 'Industrials', revBase: 195000, ebitdaMargin: 0.12, debtBase: 165000, cashBase: 35000, shares: 3400, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'BMWG', name: 'Bayerische Motoren Werke', sector: 'Industrials', revBase: 92000, ebitdaMargin: 0.15, debtBase: 72000, cashBase: 24000, shares: 1900, initialRating: 'A', beta: 1.00 },
    { ticker: 'MBGG', name: 'Mercedes-Benz Group AG', sector: 'Industrials', revBase: 96000, ebitdaMargin: 0.16, debtBase: 78000, cashBase: 26000, shares: 2000, initialRating: 'A', beta: 1.05 },
    { ticker: 'BASF', name: 'BASF Specialty Chemicals', sector: 'Industrials', revBase: 74000, ebitdaMargin: 0.14, debtBase: 38000, cashBase: 9200, shares: 1650, initialRating: 'A', beta: 1.20 },
    { ticker: 'SAFR', name: 'Safran Aviation Propulsion', sector: 'Industrials', revBase: 32000, ebitdaMargin: 0.21, debtBase: 16000, cashBase: 8100, shares: 820, initialRating: 'A', beta: 1.05 },
    { ticker: 'THYS', name: 'ThyssenKrupp Steel & Marine', sector: 'Industrials', revBase: 38000, ebitdaMargin: 0.08, debtBase: 29000, cashBase: 3800, shares: 920, initialRating: 'BB', beta: 1.45 },
    { ticker: 'VALO', name: 'Vallourec Seamless Tubulars', sector: 'Industrials', revBase: 8900, ebitdaMargin: 0.11, debtBase: 21000, cashBase: 650, shares: 280, initialRating: 'CCC', beta: 1.80 },

    // Consumer (10)
    { ticker: 'LVMH', name: 'Moet Hennessy Louis Vuitton', sector: 'Consumer', revBase: 120000, ebitdaMargin: 0.35, debtBase: 32000, cashBase: 24000, shares: 2200, initialRating: 'AAA', beta: 0.90 },
    { ticker: 'NESN', name: 'Nestle Nutrition Global', sector: 'Consumer', revBase: 110000, ebitdaMargin: 0.22, debtBase: 46000, cashBase: 19000, shares: 2300, initialRating: 'AAA', beta: 0.50 },
    { ticker: 'OREP', name: 'L\'Oreal Beauty & Cosmetics', sector: 'Consumer', revBase: 54000, ebitdaMargin: 0.25, debtBase: 14000, cashBase: 11000, shares: 1300, initialRating: 'AAA', beta: 0.65 },
    { ticker: 'HERM', name: 'Hermes International Luxury', sector: 'Consumer', revBase: 22000, ebitdaMargin: 0.46, debtBase: 3000, cashBase: 12000, shares: 540, initialRating: 'AAA', beta: 0.80 },
    { ticker: 'ADSG', name: 'Adidas Athletic Apparel', sector: 'Consumer', revBase: 31000, ebitdaMargin: 0.14, debtBase: 18000, cashBase: 4200, shares: 780, initialRating: 'BBB', beta: 1.15 },
    { ticker: 'INDC', name: 'Inditex Zara Fast Fashion', sector: 'Consumer', revBase: 46000, ebitdaMargin: 0.28, debtBase: 8000, cashBase: 16000, shares: 1200, initialRating: 'AA', beta: 0.85 },
    { ticker: 'KERG', name: 'Kering Luxury Group Gucci', sector: 'Consumer', revBase: 28000, ebitdaMargin: 0.29, debtBase: 24000, cashBase: 5500, shares: 690, initialRating: 'BBB', beta: 1.20 },
    { ticker: 'DANX', name: 'Danone Essential Nutrition', sector: 'Consumer', revBase: 36000, ebitdaMargin: 0.17, debtBase: 22000, cashBase: 4900, shares: 910, initialRating: 'A', beta: 0.55 },
    { ticker: 'CARR', name: 'Carrefour Supermarket EU', sector: 'Consumer', revBase: 88000, ebitdaMargin: 0.06, debtBase: 28000, cashBase: 6500, shares: 1750, initialRating: 'BBB', beta: 0.70 },
    { ticker: 'CASI', name: 'Casino Guichard Retailers', sector: 'Consumer', revBase: 18000, ebitdaMargin: 0.03, debtBase: 34000, cashBase: 480, shares: 520, initialRating: 'CCC', beta: 2.05 },
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
