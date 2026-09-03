# SYSTEM: INDICES

A number computed from prices that already exist. An index is not a market and has no independent
value: it is a read (rule 3). It matters because things are priced, benchmarked, mandated and
settled against it, so a wrong index is wrong in every one of those places at once.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT AN INDEX IS
- **A1** REASON — a **stated rule** over a **stated set of constituents** at **stated weights**
  - A1.a all three are public and stable; an index nobody can reproduce is not a benchmark
- **A2** REASON — it reads **cleared prices** (`the-clearing-engine.md` D1) and nothing else
- **A3** FORBID — **an index is never an input to its own constituents.** If a constituent's price
  is derived from the index, the index measures itself and the circularity is invisible in every
  output
- **A4** REASON — it has a **unit and a base**: a level is meaningless without them (rule 9)

### B. CONSTRUCTION
- **B1** REASON — **weights come from something real**: market capitalisation, amount outstanding,
  equal weight — and the choice is stated
- **B2** REASON — the constituent set **changes**: firms enter and leave, bonds mature
  (`firm-birth-and-death.md`, `the-register.md` B4)
  - B2.a and a change must not create a jump in the level: the index is **chained** across the
    rebalance, because the level's continuity is the whole basis of a return series
- **B3** REASON — **corporate actions** are handled explicitly — a split changes shares and price
  together and must not change the level (`the-register.md` E4)
- **B4** VERIFY — the index return over a period equals the weighted return of its constituents
  over that period, to float dust (rule 28)

### C. WHAT IT IS USED FOR
- **C1** REASON — a **benchmark**: a manager's performance is measured against it, and that
  measurement drives flows (`fund-shares.md` C1)
- **C2** REASON — a **mandate**: a fund tracks it, so a change in the index is a **real forced
  trade** by every tracker, at the same time
  - C2.a VERIFY — inclusion and exclusion should therefore be visible in the constituent's price,
    as a consequence of C2, never as an applied bump
- **C3** REASON — an **underlying**: futures, options and swaps settle against it
  (`the-derivative-layer.md`), which makes it a settlement price and therefore money
- **C4** REASON — a **signal**: participants read it as the state of a market

### D. INDEX FAMILIES THIS WORLD NEEDS
- **D1** REASON — an **equity index** per region (`equity.md`)
- **D2** REASON — a **credit index**: an average spread or price over a defined bond set
  (`corporate-credit.md`), which is a derived read of derived reads and must be built from prices
  first (rule 1)
- **D3** REASON — a **rate benchmark**: the reference short rate that floating instruments fix on
  (`money-market.md`)
  - D3.a it must be a read of **actual transactions**, because everything that references it pays
    real money against it
  - D3.b FORBID — **no benchmark that is posted rather than transacted.** A rate nobody traded at
    is an assigned price with a huge notional attached to it
- **D4** REASON — a **price level** for the real economy — and CPI and PPI are **different
  indices** (user, 2026-09-03): different baskets, different stage of production, different
  weights, and they can move apart
  - D4.a the difference between them **is a margin story**: input prices rising faster than output
    prices is a squeeze on firms (`firm-fundamentals.md`), and collapsing the two hides it

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no index without constituents.** A level that moves without a constituent
  moving is an invented price
- **E2** FORBID — **no stored level.** It is recomputed from the register and the prices, always
- **E3** VERIFY — an index and its constituents move together by construction, and a divergence is
  a defect in the read, not a market event
