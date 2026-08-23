import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    lines = f.readlines()

usa_banks = """    // Banks (4)
    { ticker: 'MRDN', name: 'Meridian National Bank', sector: 'Banks', revBase: 42000, ebitdaMargin: 0.35, debtBase: 8000, cashBase: 15000, shares: 1200, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'CRWN', name: 'Crown Federal Financial', sector: 'Banks', revBase: 34000, ebitdaMargin: 0.33, debtBase: 6500, cashBase: 12000, shares: 950, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'HRTG', name: 'Heritage Trust Bancorp', sector: 'Banks', revBase: 26000, ebitdaMargin: 0.31, debtBase: 5000, cashBase: 9000, shares: 780, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'ANLT', name: 'Anchorline Community Bank', sector: 'Banks', revBase: 18000, ebitdaMargin: 0.28, debtBase: 3500, cashBase: 6000, shares: 520, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
"""

uk_banks = """    // Banks (4)
    { ticker: 'LMBR', name: 'Lombard Royal Bank', sector: 'Banks', revBase: 22000, ebitdaMargin: 0.35, debtBase: 4000, cashBase: 8000, shares: 700, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'THMS', name: 'Thames City Financial', sector: 'Banks', revBase: 18000, ebitdaMargin: 0.33, debtBase: 3200, cashBase: 6500, shares: 550, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'BRIX', name: 'Brixton Trust Bancorp', sector: 'Banks', revBase: 14000, ebitdaMargin: 0.31, debtBase: 2500, cashBase: 4500, shares: 450, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'SHIR', name: 'Shire Community Bank', sector: 'Banks', revBase: 9000, ebitdaMargin: 0.28, debtBase: 1800, cashBase: 3000, shares: 320, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
"""

jpn_banks = """    // Banks (4)
    { ticker: 'EDOB', name: 'Edo National Bank', sector: 'Banks', revBase: 28000, ebitdaMargin: 0.35, debtBase: 5000, cashBase: 9000, shares: 800, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'KYOF', name: 'Kyoto Federal Financial', sector: 'Banks', revBase: 22000, ebitdaMargin: 0.33, debtBase: 4200, cashBase: 7500, shares: 650, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'OSKT', name: 'Osaka Trust Bancorp', sector: 'Banks', revBase: 17000, ebitdaMargin: 0.31, debtBase: 3500, cashBase: 5500, shares: 550, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'SAPB', name: 'Sapporo Community Bank', sector: 'Banks', revBase: 12000, ebitdaMargin: 0.28, debtBase: 2500, cashBase: 4000, shares: 420, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
"""

eur_banks = """    // Banks (4)
    { ticker: 'CONT', name: 'Continental National Bank', sector: 'Banks', revBase: 32000, ebitdaMargin: 0.35, debtBase: 6000, cashBase: 11000, shares: 900, initialRating: 'A', beta: 1.1, bankMarketShare: 0.35 },
    { ticker: 'ALPF', name: 'Alpine Federal Financial', sector: 'Banks', revBase: 25000, ebitdaMargin: 0.33, debtBase: 5200, cashBase: 9500, shares: 750, initialRating: 'A', beta: 1.05, bankMarketShare: 0.28 },
    { ticker: 'RHNT', name: 'Rhine Trust Bancorp', sector: 'Banks', revBase: 20000, ebitdaMargin: 0.31, debtBase: 4500, cashBase: 7500, shares: 650, initialRating: 'BBB', beta: 1.15, bankMarketShare: 0.22 },
    { ticker: 'DANB', name: 'Danube Community Bank', sector: 'Banks', revBase: 14000, ebitdaMargin: 0.28, debtBase: 3500, cashBase: 5000, shares: 520, initialRating: 'BBB', beta: 1.2, bankMarketShare: 0.15 },
"""

def insert_after(arr, match, to_insert):
    for i, line in enumerate(arr):
        if match in line:
            arr.insert(i, to_insert)
            return True
    return False

# We will just find the index of "UK: [", "JPN: [", "EUR: [", and "];" (the end of EUR)
def get_idx(arr, match):
    for i, line in enumerate(arr):
        if match in line:
            return i
    return -1

idx_uk = get_idx(lines, "  UK: [")
lines.insert(idx_uk - 1, usa_banks)

idx_jpn = get_idx(lines, "  JPN: [")
lines.insert(idx_jpn - 1, uk_banks)

idx_eur = get_idx(lines, "  EUR: [")
lines.insert(idx_eur - 1, jpn_banks)

idx_end = get_idx(lines, "const companies: Company[] = [];")
lines.insert(idx_end - 2, eur_banks)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.writelines(lines)

print("Inserted banks")
