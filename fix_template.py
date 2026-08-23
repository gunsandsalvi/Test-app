import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

old = """  initialRating: CreditRating;
  beta: number;
}"""

new = """  initialRating: CreditRating;
  beta: number;
  bankMarketShare?: number;
}"""

text = text.replace(old, new)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)

