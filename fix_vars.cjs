const fs = require('fs');
const log = fs.readFileSync('tsc.log', 'utf8');

const errors = log.split('\n').filter(l => l.includes('TS2304') || l.includes('TS2552'));
const fileVars = {};

errors.forEach(err => {
    // format: src/engine/simulation/stages/05-unit-bidding.ts(397,47): error TS2304: Cannot find name 'state'.
    const match = err.match(/^(src\/[^:]+)\(\d+,\d+\): error TS\d+: Cannot find name '([^']+)'/);
    if (match) {
        const file = match[1];
        const v = match[2];
        if (!fileVars[file]) fileVars[file] = new Set();
        fileVars[file].add(v);
    }
});

for (let file in fileVars) {
    let content = fs.readFileSync(file, 'utf8');
    const vars = Array.from(fileVars[file]);
    
    // Instead of replacing everywhere, let's just prepend:
    // let { var1, var2 } = ctx;
    // But wait, if they mutate it, let won't write back.
    // Let's just use `let var1 = ctx.var1;` and before return `ctx.var1 = var1;`.
    
    let declarations = '';
    let assignments = '';
    
    for (let v of vars) {
        declarations += `    let ${v} = ctx.${v};\n`;
        assignments += `    ctx.${v} = ${v};\n`;
    }
    
    // Inject declarations after `export function ... {`
    // Wait, the files already have `const state = ctx.state;` from my first script.
    // Let's remove `const state = ctx.state;` if it exists.
    content = content.replace(/const state = ctx\.state;\n/g, '');
    
    const fnStart = content.indexOf('{', content.indexOf('export function '));
    content = content.substring(0, fnStart + 1) + '\n' + declarations + content.substring(fnStart + 1);
    
    // Inject assignments before `return ctx;`
    content = content.replace(/return ctx;/g, assignments + '    return ctx;');
    
    fs.writeFileSync(file, content);
}
console.log("Fixed variables!");
