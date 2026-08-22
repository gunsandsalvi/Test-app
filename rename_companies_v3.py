import re
import random
import string
from collections import Counter

ADJECTIVES = [
    "Apex", "Zenith", "Quantum", "Nexus", "Vertex", "Horizon", "Meridian", "Pinnacle", 
    "Aegis", "Beacon", "Crest", "Nova", "Stratos", "Astral", "Aero", "Global", "United", 
    "Allied", "Prime", "Alpha", "Stellar", "Lunar", "Solar", "Terra", "Vanguard", 
    "Summit", "Pioneer", "Frontier", "Crown", "Heritage", "Paramount", "Majestic", 
    "Equinox", "Eclipse", "Celestial", "Galactic", "Orion", "Titan", "Atlas", "Apollo",
    "Aurora", "Helios", "Chronos", "Aether", "Lumina", "Ignis", "Aqua", "Flora", 
    "Fauna", "Silver", "Gold", "Bronze", "Iron", "Steel", "Copper", "Platinum",
    "Diamond", "Ruby", "Sapphire", "Emerald", "Onyx", "Pearl", "Crystal", "Obsidian"
]

NOUNS = {
    "Financials": [
        "Capital", "Partners", "Holdings", "Group", "Bank", "Trust", "Fund", 
        "Wealth", "Advisors", "Securities", "Investments", "Asset Management", 
        "Financial", "Equities", "Credit", "Bancorp", "Ventures", "Syndicate",
        "Exchange", "Mutual", "Insurance", "Underwriters", "Assurance"
    ],
    "Energy": [
        "Energy", "Power", "Resources", "Petroleum", "Oil", "Gas", "Solar", 
        "Wind", "Hydro", "Renewables", "Electric", "Utility", "Grid", 
        "Pipeline", "Exploration", "Drilling", "Offshore", "Nuclear", "Geothermal"
    ],
    "Tech": [
        "Technologies", "Systems", "Networks", "Software", "Hardware", "Cloud", 
        "Data", "Analytics", "AI", "Cybernetics", "Robotics", "Semiconductors", 
        "Digital", "Interactive", "Micro", "Cyber", "Logic", "Computing", "Byte"
    ],
    "Industrials": [
        "Industries", "Manufacturing", "Logistics", "Dynamics", "Engineering", 
        "Heavy", "Aerospace", "Defense", "Transport", "Shipping", "Rail", 
        "Freight", "Machinery", "Equipment", "Motors", "Aviation", "Marine"
    ],
    "Consumer": [
        "Retail", "Brands", "Foods", "Beverages", "Apparel", "Goods", 
        "Entertainment", "Media", "Studios", "Leisure", "Hospitality", "Resorts", 
        "Grocers", "Supermarkets", "Stores", "Fashions", "Cosmetics", "Luxuries"
    ]
}

used_tickers = set()
used_names = set()

def generate_random_ticker():
    while True:
        ticker = ''.join(random.choices(string.ascii_uppercase, k=4))
        if ticker not in used_tickers:
            used_tickers.add(ticker)
            return ticker

def generate_random_name(sector):
    sector_nouns = NOUNS.get(sector, ["Corp", "Inc", "Solutions", "Services", "Enterprises", "Group"])
    while True:
        name = f"{random.choice(ADJECTIVES)} {random.choice(sector_nouns)}"
        if name not in used_names:
            used_names.add(name)
            return name

with open('src/engine/companyGenerator.ts', 'r') as f:
    content = f.read()

def replacer(match):
    # Match group 1 is ticker, 2 is name, 3 is sector
    sector = match.group(3)
    ticker = generate_random_ticker()
    name = generate_random_name(sector)
    return f"{{ ticker: '{ticker}', name: '{name}', sector: '{sector}',"

new_content = re.sub(r"\{\s*ticker:\s*'([^']+)',\s*name:\s*'([^']+)',\s*sector:\s*'([^']+)',", replacer, content)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(new_content)

tickers = re.findall(r"ticker:\s*'([^']+)'", new_content)
names = re.findall(r"name:\s*'([^']+)'", new_content)

print(f"Total Tickers: {len(tickers)}, Unique: {len(set(tickers))}")
print(f"Total Names: {len(names)}, Unique: {len(set(names))}")
