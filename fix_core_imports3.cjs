const fs = require('fs');

let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

// Fix nelsonSiegel vs pricing imports
content = content.replace(/import\s*\{\s*calculateNelsonSiegelZeroRate,\s*priceCorporateBond,\s*priceSovereignBond\s*\}\s*from\s*'..\/nelsonSiegel';/,
`import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../nelsonSiegel';\nimport { priceCorporateBond } from '../pricing';`);

// Fix formatMoney -> formatCurrency
content = content.replace(/import\s*\{\s*formatMoney,\s*formatQuarterFilingDate\s*\}\s*from\s*'..\/formatters';/,
`import { formatCurrency, formatQuarterFilingDate } from '../formatters';`);

// Fix newsGenerator
content = content.replace(/import\s*\{\s*generateHeadline,\s*generateGenericNews\s*\}\s*from\s*'..\/newsGenerator';\n/, '');

fs.writeFileSync('src/engine/simulation/core.ts', content);
