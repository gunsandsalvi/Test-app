import re
import os

with open("src/components/screens/CommoditiesScreen.tsx", "r") as f:
    content = f.read()

# Add COMMODITY_QUANTITY_UNIT import
if "COMMODITY_QUANTITY_UNIT" not in content:
    content = content.replace("import { GameState, Commodity, RegionId, Region, TradeableInstrument } from '../../types';", "import { GameState, Commodity, RegionId, Region, TradeableInstrument, COMMODITY_QUANTITY_UNIT } from '../../types';")

# Replace S/D Balance
sd_balance_old = """<div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] font-mono">
                  <span>S/D Balance: <span className="font-bold text-[var(--text-primary)]">{c.supplyDemandBalance}</span></span>
                  <span>Inv Level: <span className="font-bold text-[var(--text-secondary)]">{formatPercent(c.inventoryLevelPct, { isDecimal: true })}</span></span>
                </div>"""

sd_balance_new = """{(() => {
                  const unitLabel = { BARREL: 'bbl', MMBTU: 'MMBtu', TROY_OZ: 'troy oz', TONNE: 'tonnes' }[COMMODITY_QUANTITY_UNIT[c.id]] ?? 'units';
                  return (
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] font-mono">
                      <div className="flex flex-col">
                        <span>Supply: {(c.weeklySupplyUnits ?? 0).toLocaleString(undefined, {maximumFractionDigits:0})} {unitLabel}</span>
                        <span>Demand: {(c.weeklyDemandUnits ?? 0).toLocaleString(undefined, {maximumFractionDigits:0})} {unitLabel}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span>Bal: <span className="font-bold text-[var(--text-primary)]">{c.supplyDemandBalance}</span></span>
                        <span>Inv: <span className="font-bold text-[var(--text-secondary)]">{formatPercent(c.inventoryLevelPct, { isDecimal: true })}</span></span>
                      </div>
                    </div>
                  );
                })()}"""
content = content.replace(sd_balance_old, sd_balance_new)

with open("src/components/screens/CommoditiesScreen.tsx", "w") as f:
    f.write(content)

