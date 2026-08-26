const fs = require('fs');

let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

const additionalImports = `
import { DebtTranche, GovDebtTranche, EarningsReportEvent, CreditRating, NewsItem } from '../../types';
import { SECTOR_BENCHMARKS, priceLeveragedLoan, priceEquity, priceInterestRateSwap, priceCreditDefaultSwap, priceCrossCurrencyBasisSwap } from '../pricing';
import { getBlendedWageGrowth, evolveFxPair, evolveCommodity } from '../macro/evolution';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from './constants';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot } from '../companyGenerator';
import { formatCurrency, formatSimulationDate } from './formatters';
import { generateWeeklyNews } from './newsGenerator';
import { calculateCompositeIndices } from '../macro/indices';
`;

content = additionalImports + '\n' + content;

// Replace const updatedRegions = ... with let updatedRegions = ...
const letVars = [
  'updatedRegions', 'updatedFxPairs', 'updatedCompanies', 'updatedCommodities', 'updatedCompositeIndices'
];
for (const v of letVars) {
  content = content.replace(new RegExp(`const\\s+${v}\\s*=`), `let ${v} =`);
}

// workingPositions
content = content.replace(/let\s+marketVolPremium\s*=\s*state\.marketVolPremium\s*\|\|\s*0;/, 'let marketVolPremium = state.marketVolPremium || 0;\n  let workingPositions = [...state.portfolio.positions];');

// Fix salesUnits, salesUSD, cashChange, purchasesUnits, purchasesUSD
// In TS, if we use Partial<Company>, these properties are missing because they don't exist in Company.
// Wait! Company might not have them?
// Let's replace salesUnits with \`salesUnits: number\` ?
// We can just add them to the Company Updates type or define a local type or just use `any`.
// `const companyUpdates: Record<string, any> = {};` instead of Partial<Company>.
content = content.replace(/const\s+companyUpdates:\s*Record<string,\s*Partial<Company>>\s*=\s*\{\};/, 'const companyUpdates: Record<string, any> = {};');

// Fix "Type 'void' must have a '[Symbol.iterator]'"
// Usually this is from `for (const [a, b] of someMap)` where `someMap` is void?
// Or maybe `[].forEach()` that was replaced to `const [a, b] = void`?
// Let's look at lines 2042-2055.
