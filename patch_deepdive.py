import re

with open('src/components/company/CompanyDeepDive.tsx', 'r') as f:
    content = f.read()

# Replace the instHoldings calculation
old_code = """
                const instHoldings = (reg.institutionalSector.itemizedHoldings || [])
                  .filter(h => h.instrumentId === company.id || trancheIds.has(h.instrumentId))
                  .map(h => ({ id: h.instrumentId + '-inst', holderName: h.instrumentId === company.id ? 'Institutional Sector (Equity)' : 'Institutional Sector (Debt)', amountUSD: h.quantityOrNotionalUSD }));
"""

new_code = """
                const instHoldings = (gameState.institutionalEntities || [])
                  .flatMap(ent => (ent.itemizedHoldings || [])
                    .filter(h => h.instrumentId === company.id || trancheIds.has(h.instrumentId))
                    .map(h => ({
                      id: h.instrumentId + '-' + ent.id,
                      holderName: h.instrumentId === company.id ? `${ent.name} (Equity)` : `${ent.name} (Debt)`,
                      amountUSD: h.quantityOrNotionalUSD
                    }))
                  );
"""
content = content.replace(old_code, new_code)

with open('src/components/company/CompanyDeepDive.tsx', 'w') as f:
    f.write(content)

