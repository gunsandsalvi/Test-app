const fs = require('fs');
let text = fs.readFileSync('scripts/invariants.ts', 'utf-8');
text = text.replace("if (w % 52 === 0 || w === 1) {", "if (true) {");
fs.writeFileSync('scripts/invariants.ts', text);
