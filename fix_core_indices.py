import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

bad_logic = """const marketGrowth = state.compositeIndices[comp.region].level / Math.max(1, state.compositeIndices[comp.region].previousLevel);"""
good_logic = """const equityIndex = comp.region === 'USA' ? state.compositeIndices.us500 : comp.region === 'EUR' ? state.compositeIndices.euStoxx : comp.region === 'UK' ? state.compositeIndices.uk100 : state.compositeIndices.jp225;
      const marketGrowth = equityIndex.value / Math.max(1, equityIndex.historical[equityIndex.historical.length - 2] ?? equityIndex.value);"""

c = c.replace(bad_logic, good_logic)
with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)

with open('scripts/mega_probe.ts', 'r') as f:
    m = f.read()

m = m.replace("equityIndex: Number(state.compositeIndices[rid].level.toFixed(2)),", 
"equityIndex: Number((rid === 'USA' ? state.compositeIndices.us500.value : rid === 'EUR' ? state.compositeIndices.euStoxx.value : rid === 'UK' ? state.compositeIndices.uk100.value : state.compositeIndices.jp225.value).toFixed(2)),")
m = m.replace("creditSpread: Number(state.compositeIndices[rid].creditSpreadBps.toFixed(0)),",
"creditSpread: Number((rid === 'USA' ? state.compositeIndices.usIgOas.value : rid === 'EUR' ? state.compositeIndices.euIgOas.value : rid === 'UK' ? state.compositeIndices.ukIgOas.value : state.compositeIndices.jpIgOas.value).toFixed(0)),")

with open('scripts/mega_probe.ts', 'w') as f:
    f.write(m)
