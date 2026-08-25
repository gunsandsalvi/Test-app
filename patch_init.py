import re
import os

with open("src/engine/macro/initialization.ts", "r") as f:
    content = f.read()

# Add empty supplyRelationships to regions
content = content.replace("privateSectorSegments: generatePrivateSectorSegments('USA'),", "privateSectorSegments: generatePrivateSectorSegments('USA'),\n      supplyRelationships: [],")
content = content.replace("privateSectorSegments: generatePrivateSectorSegments('EUR'),", "privateSectorSegments: generatePrivateSectorSegments('EUR'),\n      supplyRelationships: [],")
content = content.replace("privateSectorSegments: generatePrivateSectorSegments('UK'),", "privateSectorSegments: generatePrivateSectorSegments('UK'),\n      supplyRelationships: [],")
content = content.replace("privateSectorSegments: generatePrivateSectorSegments('JPN'),", "privateSectorSegments: generatePrivateSectorSegments('JPN'),\n      supplyRelationships: [],")

# Update generatePrivateSectorSegments to include new fields
segment_old = """      segmentType: sType,
      employment: emp,
      annualRevenueUSD: rev,
      marginPct: margin,
    });"""
segment_new = """      segmentType: sType,
      employment: emp,
      annualRevenueUSD: rev,
      marginPct: margin,
      debtUSD: rev * 2.5,
      defaultRateAnnualPct: 0.02,
      capexUSD: rev * 0.05,
    });"""
content = content.replace(segment_old, segment_new)

with open("src/engine/macro/initialization.ts", "w") as f:
    f.write(content)

