import sys

with open('src/types.ts', 'r') as f:
    text = f.read()

target = "  gsciCommodity: IndexMetric;"
replacement = """  gsciCommodity: IndexMetric;
  
  techIndex: IndexMetric;
  financialsIndex: IndexMetric;
  energyIndex: IndexMetric;
  industrialsIndex: IndexMetric;
  
  globalCreditComposite: IndexMetric;
  marketBreadth: number;"""

if target in text:
    text = text.replace(target, replacement)
    
with open('src/types.ts', 'w') as f:
    f.write(text)

