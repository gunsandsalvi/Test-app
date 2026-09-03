# SYSTEM: FREIGHT AND LOGISTICS

Moving goods from where they are made to where they are used. It exists as its own tree for one
reason: **the price of a good depends on where it is** (`commodities-spot.md` A1.a,
`goods.md`), and the thing that connects two locations is a service with its own capacity, its own
cost and its own way of failing.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS BOUGHT
- **A1** REASON — a **service: moving a quantity from A to B, over a time**
- **A2** REASON — it is bought by a **named shipper** from a **named carrier**, at a price, in a
  currency (`cross-border.md` when the two are in different regions)
- **A3** REASON — it has a **duration**, so goods are **in transit** — owned by somebody, not yet
  where they are needed
  - A3.a in-transit inventory is a real asset on a real balance sheet
    (`firm-fundamentals.md` C1) and a real use of working capital
- **A4** REASON — the price is per unit per route, and **routes are distinct**: capacity on one is
  not capacity on another

### B. CAPACITY AND SUPPLY
- **B1** REASON — a carrier owns **capital**: ships, trucks, planes, warehouses
  (`the-capital-programme.md`)
- **B2** REASON — capacity is **fixed in the short run** and expensive and slow to add
  - B2.a so the freight price is **extremely inelastic in the short run**, which is why it moves
    violently and why it is a good early indicator of a real imbalance
- **B3** REASON — it has an **operating cost**: fuel (`commodities-spot.md` E1), labour
  (`labour.md`), and the capital charge
- **B4** REASON — capacity can be **lost or blocked**: a disruption is a real reduction in units
  moved, not a price shock

### C. DEMAND
- **C1** REASON — demand is **derived**: it exists because somebody is trading goods
  (`goods.md`, `cross-border.md` B)
  - C1.a so it is not an independent market — it moves with trade volumes, and that dependence is
    the point
- **C2** REASON — a shipper can **not ship**: hold the goods, source locally, or not trade at all,
  and that substitution is what caps the freight price
- **C3** VERIFY — freight demand should equal the volume actually moving between locations, read
  from the trades, never a separate series

### D. THE PRICE AND WHAT IT DOES
- **D1** REASON — it **clears** (`the-clearing-engine.md`) per route
- **D2** REASON — the freight cost is **part of the delivered price** of the good, so it flows
  into the buyer's cost and the seller's margin (`firm-fundamentals.md` B2)
- **D3** REASON — it is therefore the **mechanism behind the location basis**: the same commodity
  priced differently in two places, with the gap bounded by what it costs to move it
  (`commodities-spot.md` A1.a)
  - D3.a and the arbitrage that enforces the bound is **somebody actually shipping**, with
    capacity and money — so when B2 or B4 bites, the basis widens and stays wide
- **D4** REASON — the **transit time** in A3 is a real lag between a purchase and a delivery
- **D5** VERIFY — the price gap between two locations should track the freight price on the route,
  and a persistent divergence is a finding about capacity, not a number to close

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no instantaneous, costless transport.** That collapses every location into one
  and deletes D3 entirely
- **E2** FORBID — **no shipment without capacity**, and no capacity without a carrier that owns it
- **E3** FORBID — **no goods in transit owned by nobody** (`the-register.md` A3)
