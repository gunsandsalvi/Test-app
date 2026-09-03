# SYSTEM: COMMODITIES SPOT

Physical stuff bought and sold for delivery now: energy, metals, agricultural output. Different
from `goods.md` because a commodity is **fungible, storable and traded as a financial asset as
well as consumed**; different from `commodity-futures.md` because this is the physical leg the
future settles against.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A COMMODITY IS
- **A1** REASON — a **standardised, fungible unit** — a grade, at a location, in a quantity unit
  (rule 9)
  - A1.a **location is part of the identity**: the same grade in two places is two prices, and
    the difference is transport (`freight-and-logistics.md`)
- **A2** REASON — it is **produced by named producers** and **consumed by named consumers**
- **A3** REASON — it is **storable**, at a cost, which is what makes it an asset and not just a
  flow
- **A4** REASON — its **stock is finite and observable**: inventory is a real number held by real
  parties

### B. SUPPLY
- **B1** REASON — a producer produces at a **cost**, and it produces because the price covers it
  - B1.a costs differ across producers, so the supply schedule is a **consequence of the cost
    distribution**, never a curve written down
- **B2** REASON — **capacity is fixed in the short run** and changes only through investment
  (`the-capital-programme.md`), which takes time
  - B2.a which is why supply is inelastic on the horizon that matters, and why price does the
    adjusting
- **B3** REASON — production can be **disrupted**, and a disruption is a real loss of units
- **B4** REASON — a producer can **hold inventory** rather than sell, if it expects a better price

### C. DEMAND
- **C1** REASON — a consumer buys because it **needs the input** (`firm-fundamentals.md`) or
  consumes it (`households.md` C3)
- **C2** REASON — demand is **inelastic in the short run** for the same reason as B2: the buyer
  cannot change its process this week
- **C3** REASON — an **investor** may also buy, to hold, because it expects the price to rise —
  and that is a reason like any other, competing for the same physical units
- **C4** VERIFY — with both sides inelastic, small imbalances should produce large price moves.
  That is a consequence to be measured, not a volatility parameter

### D. THE MARKET
- **D1** REASON — the price **clears** (`the-clearing-engine.md`), per grade and location
- **D2** REASON — **inventory is the buffer**: when demand exceeds production, stocks fall, and
  when stocks approach zero the price has nothing left to ration with
  - D2.a so the inventory level is a **state variable that carries across weeks**, and the price
    depends on it
- **D3** REASON — **storage costs money** and the cost is paid to somebody (a storer, an owner of
  a tank or a warehouse)
- **D4** REASON — the relationship between spot and forward is a **consequence of storage cost,
  financing cost and scarcity** (`commodity-futures.md` C), never an imposed basis
- **D5** VERIFY — Σ produced + opening inventory = Σ consumed + closing inventory, per commodity
  and location, exactly

### E. WHAT IT FEEDS
- **E1** REASON — commodity prices are **input costs** to firms, and they show up in PPI before
  CPI (`indices.md` D4.a)
- **E2** REASON — energy reaches **households directly** as consumption
- **E3** REASON — a **producing region's terms of trade** move with the price, which moves its
  currency's fundamentals (`cross-border.md`, `fx-spot.md` B)
- **E4** VERIFY — a commodity shock should propagate to margins, then to inflation, then to policy
  — through the chain, and if it arrives anywhere directly, a link has been short-circuited

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no consumption without production or inventory.** Units cannot be conjured
- **F2** FORBID — **no negative inventory**, ever, anywhere
- **F3** FORBID — **no price from a written path.** A commodity price series applied to the world
  is rule 4's defect and removes every mechanism above
