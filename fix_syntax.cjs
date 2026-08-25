const fs = require('fs');
let lines = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8').split('\n');
lines.splice(649, 4); // deletes 650 to 653 (0-indexed 649)
fs.writeFileSync('src/engine/simulation/core.ts', lines.join('\n'));
