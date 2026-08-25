import fs from 'fs';

function findGrowthMultipliers(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: { lineNum: number; line: string }[] = [];
  lines.forEach((line, idx) => {
    if (line.includes('* (1 +') || line.includes('* (1 -') || line.includes('demandGrowth') || line.includes('wageGrowth') || line.includes('wageIndex')) {
      results.push({ lineNum: idx + 1, line: line.trim() });
    }
  });
  return results;
}

console.log("=== AUDIT IN src/engine/macro/evolution.ts ===");
findGrowthMultipliers('src/engine/macro/evolution.ts').forEach(r => console.log(`L${r.lineNum}: ${r.line}`));

console.log("\n=== AUDIT IN src/engine/simulation/core.ts ===");
findGrowthMultipliers('src/engine/simulation/core.ts').forEach(r => console.log(`L${r.lineNum}: ${r.line}`));
