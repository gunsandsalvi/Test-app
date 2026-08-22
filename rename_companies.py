import re
import random
import string

def generate_random_ticker():
    return ''.join(random.choices(string.ascii_uppercase, k=4))

adjectives = ["Apex", "Zenith", "Quantum", "Nexus", "Vertex", "Horizon", "Meridian", "Pinnacle", "Aegis", "Beacon", "Crest", "Nova", "Stratos", "Astral", "Aero", "Global", "United", "Allied", "Prime", "Alpha", "Stellar", "Lunar", "Solar", "Terra"]
nouns = ["Systems", "Dynamics", "Holdings", "Corp", "Inc", "Enterprises", "Industries", "Group", "Partners", "Ventures", "Technologies", "Solutions", "Services", "Networks", "Capital", "Logistics", "Manufacturing", "Energy", "Financial", "Retail"]

def generate_random_name():
    return f"{random.choice(adjectives)} {random.choice(nouns)}"

with open('src/engine/companyGenerator.ts', 'r') as f:
    content = f.read()

def replacer(match):
    ticker = generate_random_ticker()
    name = generate_random_name()
    return f"{{ ticker: '{ticker}', name: '{name}',"

new_content = re.sub(r"\{\s*ticker:\s*'[^']+',\s*name:\s*'[^']+',", replacer, content)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(new_content)
