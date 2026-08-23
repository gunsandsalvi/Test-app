import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

import re

# Fix USA
text = text.replace("  ],\n    // Banks (4)\n    { ticker: 'MRDN'", "    // Banks (4)\n    { ticker: 'MRDN'")
text = text.replace("beta: 1.2, bankMarketShare: 0.15 },\n\n  UK: [", "beta: 1.2, bankMarketShare: 0.15 },\n  ],\n  UK: [")

# Fix UK
text = text.replace("  ],\n    // Banks (4)\n    { ticker: 'LMBR'", "    // Banks (4)\n    { ticker: 'LMBR'")
text = text.replace("beta: 1.2, bankMarketShare: 0.15 },\n\n  JPN: [", "beta: 1.2, bankMarketShare: 0.15 },\n  ],\n  JPN: [")

# Fix JPN
text = text.replace("  ],\n    // Banks (4)\n    { ticker: 'EDOB'", "    // Banks (4)\n    { ticker: 'EDOB'")
text = text.replace("beta: 1.2, bankMarketShare: 0.15 },\n\n  EUR: [", "beta: 1.2, bankMarketShare: 0.15 },\n  ],\n  EUR: [")

# Fix EUR
text = text.replace("  ],\n    // Banks (4)\n    { ticker: 'CONT'", "    // Banks (4)\n    { ticker: 'CONT'")
text = text.replace("beta: 1.2, bankMarketShare: 0.15 },\n\nconst companies", "beta: 1.2, bankMarketShare: 0.15 },\n  ],\n};\n\nconst companies")

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)

