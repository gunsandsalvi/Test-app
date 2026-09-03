# SYSTEM: FIRM BIRTH AND DEATH

Entry and exit. A world where the same firms exist forever has no default risk that is ever
realised, no creative destruction, and a credit market pricing an event that cannot happen. This
tree is what must be true when a firm starts and when it stops.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. BIRTH
- **A1** REASON — a **new named party** appears, with an identity that is new and not reused
  (`the-register.md` F1)
- **A2** REASON — it is **funded by somebody**: founders' money, an investor, a lender — and the
  money comes out of a named account
  - A2.a FORBID — **no firm born with an endowment from nowhere** (`the-seed.md` A4)
- **A3** REASON — it starts with a **balance sheet that balances** and usually very little
- **A4** REASON — entry happens **for a reason**: profitability in a sector, available funding,
  demand not being met (`goods.md`)
  - A4.a so entry is a **consequence** of conditions, never a birth rate
- **A5** REASON — it enters a **market as a competitor**, which changes what incumbents face

### B. LIFE AND DISTRESS
- **B1** REASON — it is subject to `firm-fundamentals.md` like any other firm from the first week
- **B2** REASON — a young firm is **more fragile**: less cash, no track record, worse credit terms
  (`ratings-and-assessment.md`)
- **B3** REASON — distress is **observable before default**: coverage falling, cash falling,
  spreads widening (`firm-fundamentals.md` D3)
- **B4** REASON — a distressed firm **acts**: cuts costs, sells assets, raises expensive money,
  approaches its lenders — and each act is a real transaction

### C. DEFAULT
- **C1** REASON — a **stated, observable definition** — a payment missed, a covenant breached
  (`../instruments/bond.md` N12)
- **C2** REASON — it is a **consequence of the firm's state**, never a draw from a default
  probability
  - C2.a FORBID — **no exogenous default event.** A default assigned by a hazard rate cannot be
    prevented by a firm's actions or caused by a market's, which deletes B4 and every credit
    channel in this atlas
- **C3** REASON — it **triggers things**: `cds.md` D1, the lenders' loss
  (`banks-lending.md` E), a rating action (`ratings-and-assessment.md`)
- **C4** VERIFY — every default is traceable to the cash or solvency failure that caused it
  (`firm-fundamentals.md` D4)

### D. RESOLUTION — WHERE EVERYTHING GOES
- **D1** REASON — the firm's **assets are realised**: sold to named buyers at cleared prices, or
  taken over as a going concern (`m-and-a.md`)
- **D2** REASON — the proceeds are **distributed by seniority** (`../instruments/bond.md` N13.a):
  secured lenders, senior, subordinated, equity last
  - D2.a and the **recovery is what the assets actually fetched**, divided as D2 says — never a
    percentage (`cds.md` D2.a)
- **D3** REASON — **losses land on named holders** in the register, in proportion
  (`the-register.md` E3)
- **D4** REASON — its **employees lose their jobs** (`labour.md`), its **suppliers lose their
  receivables** (`trade-credit.md`), and its **capital goes to a buyer**
  (`the-capital-programme.md` D3)
  - D4.a these are the real-economy consequences, and they are what makes a default cost more
    than the credit loss
- **D5** REASON — the party then **ceases to exist**, and every reference to it must resolve to
  the estate or the successor (`the-register.md` F2, `the-audit.md` B6)
- **D6** VERIFY — Σ(recoveries) + Σ(losses) = the firm's assets at realisation, exactly. Money is
  not destroyed by a default; it is transferred and revalued
  - D6.a a residual left on a dead party is a defect (rule 13), and it must be found and paid
    away in every currency the party held (`currency-and-fx.md` B2)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no firm that cannot die** (C2.a)
- **E2** FORBID — **no death without a destination** for every asset, liability, employee and
  contract (D5)
- **E3** FORBID — **a constant population.** If births exactly offset deaths by construction, A4.a
  and C2 have both been overridden
- **E4** VERIFY — the population, its age distribution and its sector mix are all reads, and they
  should move with conditions
