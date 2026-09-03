# SYSTEM: COMMODITY FUTURES

Standardised contracts to buy or sell a commodity at a future date. The place where producers,
consumers and investors meet without the physical asset moving — and the place where the physical
market's expectations become a price everyone can see.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`; the physical leg is
`commodities-spot.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **stated grade at a stated delivery location**
    (`commodities-spot.md` A1.a)
  - A1.b **D4 payoff** — delivery of the commodity, or cash settlement against the spot price at
    expiry
  - A1.c **D7 price** — the **futures price**, cleared
  - A1.d **D2 notional** — a fixed quantity per contract, so size is in **contracts**, not money
- **A2** REASON — it is **standardised**, which is what makes it fungible and exchange-traded, and
  standardisation means the delivery terms are part of the instrument
- **A3** REASON — it has an **expiry**, and a **series of them** — so there is a **curve**
- **A4** REASON — it is **margined daily** (`the-derivative-layer.md` D2), so a price move is cash
  today, not at expiry

### B. WHY EACH SIDE IS THERE
- **B1** REASON — a **producer hedging** output it will have (`commodities-spot.md` B1): it locks a
  price it can plan against
- **B2** REASON — a **consumer hedging** input it will need (`firm-fundamentals.md`)
- **B3** REASON — an **investor** taking a view, or wanting commodity exposure without storage
  - B3.a it must **roll** as contracts expire, and the roll has a cost or a gain determined by the
    curve — which is most of an investor's return and is not a fee
- **B4** REASON — an **arbitrageur** between the future and the physical, who can only act if it
  can actually store and finance (`commodities-spot.md` D3)
- **B5** REASON — a **dealer** (`dealer-desks.md`)

### C. THE CURVE
- **C1** REASON — the relationship between futures prices and spot is a **consequence** of
  storage cost, financing cost and scarcity (`commodities-spot.md` D4)
  - C1.a **contango**: forward above spot, bounded above by what it costs to buy, store and
    finance — because past that, B4 arbitrages it
  - C1.b **backwardation**: forward below spot, unbounded below, because you cannot store a
    shortage. That asymmetry is real and it is why the two states are not symmetric
- **C2** REASON — the curve therefore **carries information about physical tightness**, and
  inventory (`commodities-spot.md` D2.a) is the state variable it reads
- **C3** VERIFY — inventories low ⇒ backwardation, as a consequence of C1.b and never as a rule
- **C4** REASON — the **futures price converges to spot at expiry**, because delivery is possible
  - C4.a and convergence is a consequence of deliverability, not an enforced boundary condition

### D. EXPIRY AND DELIVERY
- **D1** REASON — at expiry the contract **delivers or cash-settles**, and both are real
- **D2** REASON — **physical delivery must be possible** for at least some participants, or the
  convergence in C4.a has no mechanism behind it
- **D3** REASON — a party that cannot take delivery must **close or roll before expiry**, which is
  a real forced trade at a known time
- **D4** REASON — cash settlement is against an **observed spot price**
  (`commodities-spot.md` D1), which must therefore exist and be cleared
  (`../instruments/derivative.md` D3.a)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no futures price without a physical market underneath it.** A futures curve on
  a commodity that is never actually traded prices itself
- **E2** FORBID — **no unlimited open interest against finite deliverable supply** without the
  squeeze that implies (`securities-lending.md` D2)
- **E3** FORBID — **no roll that is free.** The roll's cost is the curve, and it must land in the
  roller's P&L
