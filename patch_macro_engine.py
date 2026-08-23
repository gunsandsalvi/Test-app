import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

target = """    gsciCommodity: {
      value: newGsci,
      previous: prevGsci,
      change1W: prevIndices ? newGsci - prevGsci : 0,
    },
  };"""

replacement = """    gsciCommodity: {
      value: newGsci,
      previous: prevGsci,
      change1W: prevIndices ? newGsci - prevGsci : 0,
    },
  };

  // Category sub-indices
  const getSectorChange = (sector: 'Tech' | 'Financials' | 'Energy' | 'Industrials', base: number) => {
    const firms = companies.filter(c => c.sector === sector);
    const totalCap = firms.reduce((sum, f) => sum + f.marketCap, 0);
    if (!totalCap) return 0;
    return firms.reduce((sum, f) => {
      const prevP = f.historicalPrices[f.historicalPrices.length - 2] || f.stockPrice;
      const chg = prevP > 0 ? (f.stockPrice - prevP) / prevP : 0;
      return sum + chg * (f.marketCap / totalCap);
    }, 0);
  };
  
  const techChg = getSectorChange('Tech', 1000);
  const finChg = getSectorChange('Financials', 1000);
  const eneChg = getSectorChange('Energy', 1000);
  const indChg = getSectorChange('Industrials', 1000);
  
  const pTech = prevIndices?.techIndex?.value ?? 1000;
  const pFin = prevIndices?.financialsIndex?.value ?? 1000;
  const pEne = prevIndices?.energyIndex?.value ?? 1000;
  const pInd = prevIndices?.industrialsIndex?.value ?? 1000;
  
  const nTech = Number((pTech * (1 + (prevIndices ? techChg : 0))).toFixed(1));
  const nFin = Number((pFin * (1 + (prevIndices ? finChg : 0))).toFixed(1));
  const nEne = Number((pEne * (1 + (prevIndices ? eneChg : 0))).toFixed(1));
  const nInd = Number((pInd * (1 + (prevIndices ? indChg : 0))).toFixed(1));

  result.techIndex = { value: nTech, previous: pTech, change1W: prevIndices ? nTech - pTech : 0 };
  result.financialsIndex = { value: nFin, previous: pFin, change1W: prevIndices ? nFin - pFin : 0 };
  result.energyIndex = { value: nEne, previous: pEne, change1W: prevIndices ? nEne - pEne : 0 };
  result.industrialsIndex = { value: nInd, previous: pInd, change1W: prevIndices ? nInd - pInd : 0 };

  // Global Credit Composite (average CCI across regions)
  const cciValues = Object.values(regions).map(r => r.bankingSector.creditConditionsIndex);
  const avgCci = cciValues.reduce((a,b)=>a+b, 0) / (cciValues.length || 1);
  const pCci = prevIndices?.globalCreditComposite?.value ?? 0;
  result.globalCreditComposite = { value: avgCci, previous: pCci, change1W: prevIndices ? avgCci - pCci : 0 };
  
  // Market Breadth (% of companies advancing)
  const advancing = companies.filter(f => {
    const p = f.historicalPrices;
    if (p.length < 2) return false;
    return f.stockPrice > p[p.length - 2];
  }).length;
  result.marketBreadth = companies.length ? advancing / companies.length : 0.5;

  return result as any;"""

if target in text:
    text = text.replace(target, replacement)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

