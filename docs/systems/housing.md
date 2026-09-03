# SYSTEM: HOUSING

The largest asset most households own and the largest debt most households owe. It belongs in this
world because it is the collateral behind the biggest lending book in any banking system
(`banks-lending.md`), because its price is a wealth effect on consumption (`households.md` C1.b),
and because it is the one asset whose supply genuinely cannot respond within the horizon that
matters.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A HOUSE IS
- **A1** REASON — a **durable, immovable, indivisible asset** owned by a named party
  (`the-register.md`), in a named location
  - A1.a **location is part of the identity**, and it is why there is no single housing market
- **A2** REASON — it **yields a service**: shelter, consumed by whoever lives in it — so it is a
  consumption good and an asset at once, and both must be present
- **A3** REASON — the owner and the occupier **can be different parties**, and then there is
  **rent**, which is a real payment between them
- **A4** REASON — the **stock is finite and changes slowly**: new building takes years
  (`the-capital-programme.md` C3)
- **A5** REASON — it **depreciates and needs maintenance**, which is a real cost to the owner

### B. THE PRICE
- **B1** REASON — it **clears** between buyers and sellers (`the-clearing-engine.md`), per location
- **B2** REASON — the buyer's demand is governed by **what it can borrow**, not only what it wants
  - B2.a so the **mortgage rate and the lending standard are the dominant inputs to the price**,
    and a change in either moves it — this is the strongest single transmission channel from
    policy to a household balance sheet
- **B3** REASON — supply is **inelastic in the short run** (A4), so a demand shift moves price,
  not quantity
- **B4** REASON — a seller can **refuse to sell**, and in a falling market transaction volumes
  collapse before prices do
  - B4.a VERIFY — so a price index built only from transactions is measuring a changing sample,
    and that is a real property of housing data, not an error to correct away
- **B5** REASON — the **rent and the price are linked but not equal**: the yield is a read of the
  two, and it competes with other yields (`households.md` D5)

### C. THE MORTGAGE
- **C1** REASON — a **loan from a named lender secured on the house** (`banks-lending.md` C)
- **C2** REASON — it has a **term, a rate — fixed or floating — and an amortisation schedule**
  (`../instruments/bond.md` N5, N6), and the borrower pays interest **and** principal
  (`households.md` E3.a)
- **C3** REASON — the **loan-to-value** is a read of the loan against the house's current price,
  and it moves when the price moves without anyone doing anything
- **C4** REASON — the borrower can **default**, and then the lender takes the house and sells it
  - C4.a the **recovery is what it fetches**, which depends on B1 in a market where other
    foreclosed houses are also for sale — so losses are correlated exactly when they are largest
- **C5** REASON — the lender's **standard is a decision**: how much LTV, what income multiple, and
  it tightens when it is worried (`banks-lending.md` C)
  - C5.a which feeds straight back into B2.a, and that loop is the housing cycle
- **C6** REASON — mortgages can be **pooled and sold** (`sme-pools.md` is the same structure for a
  different asset), which moves the risk to a named holder

### D. WHAT IT FEEDS
- **D1** REASON — house price changes are **household wealth changes**
  (`households.md` D4), and wealth affects consumption
- **D2** REASON — housing construction is **investment and employment**
  (`the-capital-programme.md`, `labour.md`)
- **D3** REASON — rent is a **large component of the consumer price level** (`indices.md` D4)
- **D4** REASON — mortgage debt is the **largest household liability** and its service is a fixed
  claim on income (`households.md` E3)
- **D5** VERIFY — a rate rise should reach consumption through D4 on floating mortgages and
  through B2.a and D1 on prices, with different lags, and the two channels are distinguishable

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no house without an owner and no owner without a house they hold** in the
  register
- **E2** FORBID — **no exogenous house price path.** It is cleared (B1), and a written path deletes
  C3, C4.a and C5.a — the entire collateral channel
- **E3** FORBID — **no mortgage without a lender's balance sheet on the other side**
- **E4** VERIFY — Σ mortgage debt owed by households = Σ mortgage assets held by lenders and pools,
  exactly
