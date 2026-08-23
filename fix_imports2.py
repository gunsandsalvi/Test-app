import sys

def fix_file(filename, import_str):
    with open(filename, 'r') as f:
        text = f.read()
    
    if import_str not in text:
        start = text.find('import React')
        end = text.find('\n', start)
        text = text[:end+1] + import_str + text[end+1:]
        
        with open(filename, 'w') as f:
            f.write(text)

fix_file('src/components/PortfolioRiskTab.tsx', "import { Sparkline, SegmentedBar } from './charts/Charts';\n")
fix_file('src/components/EquitiesTab.tsx', "import { Sparkline } from './charts/Charts';\n")
