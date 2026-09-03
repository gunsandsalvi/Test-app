# SYSTEM: CROSS-BORDER

What happens when the two sides of a transaction are in different regions. It is not a market of
its own — it is a **property** that every other market can have, and it exists as a tree because
the things it forces (a currency decision, a foreign counterparty, a claim on a foreign issuer,
a balance that must add up across regions) are absent unless something insists on them.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT MAKES A TRANSACTION CROSS-BORDER
- **A1** REASON — the two named parties are in **different regions** (`the-seed.md` B3)
- **A2** REASON — so the transaction is in **one of two currencies, or a third**, and somebody has
  to decide which (`currency-and-fx.md` B)
  - A2.a and whoever is not in the invoice currency has an **FX exposure**, which it can hedge
    (`fx-forwards-and-xcs.md` D1) or carry
- **A3** REASON — the settlement crosses banking systems: a payment in a currency reaches an
  account in that currency, wherever the account holder is (`money-and-settlement.md` C)
- **A4** REASON — the counterparty is **foreign**, which is a real credit and legal difference

### B. TRADE IN GOODS
- **B1** REASON — a firm **buys from or sells to** a firm in another region (`goods.md`),
  because of price, availability or cost (`labour.md`, `commodities-spot.md`)
- **B2** REASON — the goods **move**, which costs money and takes time
  (`freight-and-logistics.md`)
- **B3** REASON — the price the buyer pays in its own money depends on the **exchange rate**, so a
  rate move changes real trade decisions
  - B3.a which is the expenditure-switching channel, and it must be a **consequence** of B1's
    decision facing a changed relative price, never an elasticity applied to a balance
- **B4** VERIFY — one region's exports are another's imports, unit for unit and party to party

### C. CROSS-BORDER FINANCE
- **C1** REASON — an investor **holds a foreign asset** (`equity.md`, `corporate-credit.md`,
  `sovereign-credit.md`) because of its return, and it is a claim on a foreign issuer
- **C2** REASON — a borrower **issues in a foreign currency** because the funding is cheaper or
  the buyer base is deeper — and it then owes a money it does not earn
  - C2.a which is the original-sin exposure, and it is a real solvency risk that a rate move
    triggers, not a translation adjustment
- **C3** REASON — a **bank funds in one currency and lends in another**
  (`banks-funding-and-liquidity.md` E, `currency-and-fx.md` B5), and it must square that daily
- **C4** REASON — a **direct investment** buys a firm outright (`m-and-a.md`,
  `private-equity.md`), which is a lasting claim
- **C5** REASON — every one of these produces **income flows across the border**: coupons,
  dividends, interest — paid to foreign holders in a currency

### D. THE BALANCE
- **D1** REASON — a region's **current account** is a read: goods and services plus income flows,
  computed from actual transactions
- **D2** REASON — its **financial account** is the other side: net acquisition of foreign claims
- **D3** VERIFY — D1 + D2 = 0 for each region **as a consequence** of every transaction having two
  sides, never as an identity imposed after the fact
  - D3.a a residual that has to be plugged is a transaction that lost a leg (`the-audit.md` B7)
- **D4** REASON — a deficit region must be **financed by somebody who chooses to finance it**, at
  a price — so the financing is a market outcome, and it can stop
- **D5** REASON — the accumulated position is a **stock of claims**, held by named parties, that
  revalues when rates and prices move (`currency-and-fx.md` D2)
- **D6** VERIFY — summing all regions gives zero in every category, because the world is closed

### E. WHAT IT FORCES ON EVERY OTHER TREE
- **E1** REASON — a **market must be able to have foreign participants** with foreign money, or it
  is a domestic market wearing a region label
- **E2** REASON — a **register must hold foreign issuers' instruments** for domestic holders
  (`the-register.md`)
- **E3** REASON — a **default must reach foreign holders** in proportion, like any other
  (`firm-birth-and-death.md` D3)
- **E4** REASON — a **central bank's actions reach other regions** through the rate and the
  currency (`the-central-bank.md`, `fx-spot.md` B)

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no region that is a closed box.** If every party trades only domestically,
  every node above is dead and FX exists only as a number
- **F2** FORBID — **no netting of cross-border flows into a regional aggregate.** The parties are
  named on both sides, or the loss chain in E3 cannot be traced
- **F3** FORBID — **no exogenous trade or capital-flow series.** Both are consequences of B1 and
  C1's decisions
