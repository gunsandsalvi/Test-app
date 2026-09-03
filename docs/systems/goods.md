# SYSTEM: GOODS

Real things produced, sold, shipped and held. Production, the unit auction, delivery, inventory
and the price indices over them. Excludes labour (its own system) and plant (its own system), but
the boundary with both is a node here.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments.

### A. WHAT A GOOD IS
- **A1** REASON — a good is a sub-unit of an industry with a **physical unit of measure**
- **A2** REASON — it is produced from inputs by a **recipe**
  - A2.a **fixed input quantities per unit of output — a Leontief recipe, no substitution**
    *(user: "A.2.a you choose")*. I choose fixed, for one reason and with one cost stated: fixed
    coefficients make an input shortage bite as a real production constraint (B1.b) rather than
    being smoothed away by a substitution elasticity nobody can observe, which is what makes a
    supply shock transmit at all. The cost is that a firm facing an expensive input cannot
    economise on it, so **substitution is a MISSING node here rather than an assumption away** —
    if a relative-price response is wanted later it is a new mechanism, not a parameter
  - A2.b plus labour, plus capital services
- **A3** REASON — storable or perishable, as a property of the good
- **A4** REASON — homogeneous within its sub-unit; otherwise it is a different sub-unit

### B. PRODUCTION
- **B1** REASON — **a firm has a production DECISION with reasons: expected demand, its margin, its
  capacity, its inputs, its labour. The quantity is the OUTCOME** *(user: "B1/B2 again not imposed,
  a consequence")*
  - B1.a capacity (plant) is one of the reasons, and binding capacity is a real state
  - B1.b inputs on hand are another, and a shortage is a real state — see A2.a
  - B1.c labour available is another
  - B1.d VERIFY — utilisation is a read of the outcome against capacity, never an input to it
- **B2** REASON — **production consumes the inputs it consumes.** The consumption is the physical
  consequence of B1's decision, and the recipe says how much — never a separately-chosen number
- **B3** REASON — **work in progress** exists between input and output, owned by somebody
- **B4** REASON — **yield**: not everything started is finished. Scrap is real and it is a loss
- **B5** REASON — unit **cost** = inputs consumed + wages + capital charge

### C. THE MARKET
- **C1** REASON — sellers offer quantities; buyers post the most they will pay
- **C2** REASON — a **price clears** per (good, market, period), from C1 meeting C1
- **C3** REASON — buyers are heterogeneous and bid for their own reasons: firms buying inputs,
  households consuming, government procuring, foreign buyers
- **C4** REASON — **rationing** when demand exceeds supply, by a rule that is stated once
- **C5** REASON — **unsold output stays with the seller.** Illiquidity in goods is unsold stock
- **C6** REASON — the price is in the **seller's** currency; a foreign buyer converts (see the
  currency tree)

### D. DELIVERY AND LOGISTICS
- **D1** REASON — goods move physically from seller to buyer
- **D2** REASON — that takes **time** and costs **money**
- **D3** REASON — a **carrier** is a named party that earns the freight
- **D4** REASON — **landed cost** = ex-works price + freight (+ duty)
- **D5** REASON — goods **in transit** are owned by somebody and sit on somebody's book

### E. INVENTORY
- **E1** REASON — a holder's stock is a **quantity of units**, and its value is units × a price
- **E2** REASON — **carried at the LOWER OF COST AND NET REALISABLE VALUE** *(user: "E2 apply real
  world facts")*. That is the actual accounting rule (IAS 2, and ASC 330 in substance): cost until
  the market falls below it, then written down to market, and **the write-down is a charge to
  income in the period it happens**
  - E2.a a write-down is **not reversed** beyond the original cost — an unrealised holding GAIN on
    ordinary inventory is not recognised
  - E2.b the exception is real and narrow: **commodity broker-dealers carry at fair value through
    income**, because for them the inventory is the position
  - E2.c FORBID — inventory is never carried at market when market is ABOVE cost for a
    non-broker-dealer. Marking it up invents profit the firm has not earned
- **E3** REASON — the **holding loss** is therefore an event with a date, a size and a P&L line —
  the asymmetry in E2/E2.a is the mechanism, not an approximation of one
- **E4** REASON — spoilage, obsolescence and shrinkage remove units without a sale
- **E5** REASON — **cost flows out FIFO or weighted-average; LIFO is not permitted** *(user: "E5
  real world")*. IFRS prohibits LIFO outright; the choice is FIFO or weighted average cost, it is
  disclosed, and it is applied consistently. It changes reported profit and the balance-sheet
  carrying value in opposite directions when prices move, so it is a real decision with a real
  consequence and not a bookkeeping detail

### F. THE CASH LEGS
- **F1** REASON — the buyer pays the seller, by name
- **F2** REASON — **payment terms**: immediate, or trade credit with a due date
- **F3** REASON — trade credit is a **loan between two named firms**, and it can go bad
- **F4** REASON — the freight is paid **to the carrier**
- **F5** REASON — revenue is recognised on delivery; **cost of goods sold** is the units that left,
  valued per E5

### G. THE AGGREGATE
- **G1** REASON — **PPI and CPI are different indices over different baskets** *(user: "G there
  should be a difference between PPI and CPI")*
  - G1.a **PPI** — prices received by domestic PRODUCERS at the factory gate. Weighted by
    production. Excludes freight to the buyer, excludes distribution margin, excludes consumption
    tax, and **includes intermediate goods a household never buys**
  - G1.b **CPI** — prices paid by HOUSEHOLDS for final consumption. Weighted by household
    expenditure. Includes freight, the channel's margin and consumption tax, includes imports at
    the price a household actually pays, and **excludes intermediate goods entirely**
  - G1.c VERIFY — the two therefore diverge, and the gap is economically meaningful: it is the
    distribution wedge plus tax plus the import/export mix. A model with one index and two names
    cannot show margin compression, which is most of what a cost shock does to a firm
- **G2** REASON — inflation is the change in the relevant index, and which one is always stated
- **G3** REASON — real and nominal output are distinguishable, deflated by the right index
- **G4** VERIFY — capacity utilisation is a read (see B1.d)

---

## 2. THE MAPPING

*(unmapped — this file's first commit is the required tree alone)*

---

## 3. THE DIFF

*(unmapped)*
