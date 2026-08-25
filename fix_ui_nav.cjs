const fs = require('fs');

const path = 'src/components/screens/MyBookScreen.tsx';
let text = fs.readFileSync(path, 'utf-8');

const oldNav = "  const nav = portfolio.cashUSD + portfolio.positions.reduce((sum, p) => sum + (p.notional || (p.currentPrice * p.quantity)), 0);";
if (text.includes(oldNav)) {
  text = text.replace(oldNav, "");
  // Now replace all {formatCurrency(nav)} with {formatCurrency(state.portfolio.navUSD)}
  // wait, the variable is just `nav`. Let's just do text.replace(/nav/g, "state.portfolio.navUSD") but safely.
  text = text.replace(/\{formatCurrency\(nav\)\}/g, "{formatCurrency(state.portfolio.navUSD)}");
  
  // also check if there are other uses.
  text = text.replace(/nav \> 0/g, "state.portfolio.navUSD > 0");
}
fs.writeFileSync(path, text);
