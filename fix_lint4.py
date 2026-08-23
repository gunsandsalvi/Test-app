import sys
with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# marketBreadth = percentage of companies with positive stock price change
compute_str = """
  const advancingCompanies = companies.filter((c) => {
    const prevP = c.historicalPrices[c.historicalPrices.length - 2] || c.stockPrice;
    return c.stockPrice > prevP;
  }).length;
  const marketBreadth = companies.length > 0 ? (advancingCompanies / companies.length) * 100 : 50;
"""

text = text.replace("  const igRatings: CreditRating[] = ['AAA', 'AA', 'A', 'BBB'];", compute_str + "\n  const igRatings: CreditRating[] = ['AAA', 'AA', 'A', 'BBB'];")
text = text.replace("marketBreadth: 50,", "marketBreadth,")
with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

