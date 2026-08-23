import sys

with open('src/components/EquitiesTab.tsx', 'r') as f:
    text = f.read()

text = text.replace("import { Sparkline } from './charts/Charts';\n", "")

with open('src/components/EquitiesTab.tsx', 'w') as f:
    f.write(text)

