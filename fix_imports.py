import sys

def fix_file(filename, import_str):
    with open(filename, 'r') as f:
        text = f.read()
    
    if import_str not in text:
        # insert after React import
        start = text.find('import React')
        end = text.find('\n', start)
        text = text[:end+1] + import_str + text[end+1:]
        
        with open(filename, 'w') as f:
            f.write(text)
            
fix_file('src/components/MacroTab.tsx', "import { Sparkline, SegmentedBar, RegimeCompass, CreditConditionsMeter, YieldCurveChart } from './charts/Charts';\n")
fix_file('src/components/BondsCdsTab.tsx', "import { CreditConditionsMeter } from './charts/Charts';\n")

