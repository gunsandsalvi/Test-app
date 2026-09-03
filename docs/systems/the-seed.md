# SYSTEM: THE SEED

The state of the world at week zero. Everything after it is a consequence, so a defect here is
indistinguishable from a defect in the mechanism that runs on top of it — except that it is there
from the first audit and never goes away.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THE SEED MUST BE
- **A1** REASON — a **complete, consistent state**: every party, every account, every holding,
  every instrument, all present at once
- **A2** REASON — it must **pass the audit at week zero** (`the-audit.md` B)
  - A2.a a violation present at week zero is the seed's, and attributing it to a mechanism costs
    weeks of the wrong search
- **A3** REASON — it is a **stock**, and stocks are what the flows then act on
- **A4** FORBID — **no free money and no free assets.** Every deposit is some bank's liability;
  every holding is some issuer's; nothing exists because a constructor needed it to
- **A5** REASON — it is **reproducible from a seed value**, so any run can be re-run

### B. WHO EXISTS
- **B1** REASON — a **population of each type**: households, firms, banks, funds, the state, the
  central bank — enough of each that the type is a distribution, not a single instance
  (`households.md` A2.d)
- **B2** REASON — each has an **identity** that survives the whole run
- **B3** REASON — each is placed in a **region**, and the region determines its money
  (`currency-and-fx.md` B)
- **B4** REASON — each has a **size**, and the sizes are dispersed: a sector of equals never
  produces a market (`the-clearing-engine.md` A1.a)
- **B5** FORBID — **no observed real-world ratio is copied in** (rule 4). A share, a spread, a
  leverage ratio taken from data is an answer written down where a mechanism should be

### C. WHAT THEY HOLD
- **C1** REASON — every party's balance sheet **balances at week zero**, and its equity is the
  read (`the-audit.md` B5)
- **C2** REASON — each asset is **somebody's liability**, party by party, not sector by sector
- **C3** REASON — instruments outstanding at week zero have **terms and a remaining life** — a
  bond seeded at issue is a world with no maturity wall for its whole tenor
  - C3.a and a **maturity profile that is spread**, or every roll arrives in the same week
- **C4** REASON — prices at week zero are **the first clearing's inputs**, not permanent marks
  - C4.a a seeded price that never clears is rule 1's defect, seeded
- **C5** VERIFY — the week-zero balance sheet of each **sector** is a read of its members, never
  a target the members were fitted to

### D. CONSISTENCY WITH FLOWS
- **D1** REASON — the stocks must be **consistent with the flows that will run**: debt with a
  coupon somebody can pay, employment with a wage bill somebody can meet
  - D1.a otherwise week one is a shock the model never recovers from, and everything measured
    afterwards measures the recovery
- **D2** REASON — anything that **accrues** starts from a stated accrual position
- **D3** VERIFY — with all shocks off, week one should be **quiet**: large first-week flows are
  the seed disagreeing with the mechanism, and they are a finding
- **D4** VERIFY — the seed is a **fixed point of nothing**: running the model with no shocks must
  still evolve, because agents have reasons that differ

### E. WHAT THE SEED MUST NOT DECIDE
- **E1** FORBID — **no outcome is seeded.** A seeded default rate, a seeded market share, a
  seeded spread curve is the result assigned in advance (`README.md`, REASON not OUTCOME)
- **E2** REASON — the seed sets **reasons and endowments**; the mechanism produces outcomes
- **E3** VERIFY — changing a seed parameter must change outcomes through a chain that can be
  traced, and if it changes an outcome directly, that outcome was seeded
