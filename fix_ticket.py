import sys

with open('src/components/TradeTicketModal.tsx', 'r') as f:
    text = f.read()

old = """
      tenorYears: instrument.details.tenorYears,
      fixedRate: instrument.details.couponRate,
"""

new = """
      tenorYears: instrument.details.tenorYears,
      fixedRate: instrument.details.fixedRate ?? instrument.details.couponRate,
      trancheId: instrument.details.trancheId,
      rateType: instrument.details.rateType,
"""
if old.strip() in text:
    text = text.replace(old.strip(), new.strip())
    with open('src/components/TradeTicketModal.tsx', 'w') as f:
        f.write(text)
    print("Done")
else:
    print("Not found")
