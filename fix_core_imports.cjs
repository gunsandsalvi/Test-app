const fs = require('fs');
let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

// Fix the domain imports
content = content.replace(/import\s*\{\s*Industry,\s*INDUSTRY_SUBUNITS,\s*CATEGORY_TRADABILITY,\s*CATEGORY_INPUT_REQUIREMENTS,\s*PRIVATE_SEGMENT_OCCUPATION_MIX,\s*SECTOR_OCCUPATION_MIX,\s*CORPORATE_DEMAND_INTENSITY\s*\}\s*from\s*'..\/..\/domain\/industry';/,
`import { Industry, INDUSTRY_SUBUNITS, CORPORATE_DEMAND_INTENSITY } from '../../domain/industry';
import { CATEGORY_TRADABILITY, PRIVATE_SEGMENT_OCCUPATION_MIX, SECTOR_OCCUPATION_MIX } from '../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../domain/market-microstructure';
import { UnitBid, UnitOffer } from '../../types';
import { PrivateSegmentType } from '../../types';`);

// Fix the engine imports
content = content.replace(/from '\.\/blackScholes'/g, "from '../blackScholes'");
content = content.replace(/from '\.\/carryCalculator'/g, "from '../carryCalculator'");
content = content.replace(/from '\.\/nelsonSiegel'/g, "from '../nelsonSiegel'");
content = content.replace(/from '\.\/dealers'/g, "from '../dealers'");
content = content.replace(/from '\.\/formatters'/g, "from '../formatters'");
content = content.replace(/from '\.\/macroEngine'/g, "from '../macro/evolution'");
content = content.replace(/from '\.\/newsGenerator'/g, "from '../newsGenerator'");
content = content.replace(/from '\.\/credit'/g, "from './credit'");
content = content.replace(/from '\.\/ipo'/g, "from './ipo'");
content = content.replace(/from '\.\/merger'/g, "from './merger'");

// Replace Partial<Company> with any in companyUpdates and fix salesUSD etc.
content = content.replace(/const companyUpdates: Record<string, any> = {};/g, 'const companyUpdates: Record<string, any> = {};');

// Replace void with Position in iterators? No, the iterator error comes from using `void` instead of array.
// Look for `const [ , ] = void` or something.
// Oh! It's from `for (const [id, value] of Object.entries(reg.categoryDemand)) { ... }` where `Object.entries` was replaced maybe? No, let's just write to file and run tsc to see lines.

fs.writeFileSync('src/engine/simulation/core.ts', content);
