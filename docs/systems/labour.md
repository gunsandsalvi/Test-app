# SYSTEM: LABOUR

The market where households sell time and firms buy it. It is the largest flow in the economy in
both directions — wages are most of household income (`households.md` B1) and most of firm cost
(`firm-fundamentals.md` B3) — and it is the only market where the same quantity is somebody's
income and somebody's cost at the same instant.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS TRADED
- **A1** REASON — **hours of a person's time**, supplied by a named household to a named firm
- **A2** REASON — the price is the **wage**, per unit of time, in a currency (rule 9)
- **A3** REASON — labour is **heterogeneous**: skill, sector, region — and a job in one is not a
  job in another
  - A3.a which is why unemployment and vacancies can be high **at the same time**, and a single
    homogeneous labour market cannot produce that
- **A4** REASON — the relationship **persists**: employment is a state, not a per-period trade,
  which is what makes hiring and firing decisions rather than continuous adjustment

### B. THE SUPPLY SIDE
- **B1** REASON — a household **decides** whether to work and how much, given the wage and its
  alternatives (`households.md` A2.c)
- **B2** REASON — the **workforce is finite**: a stock of people, which caps total employment
- **B3** REASON — a person is in exactly one state: **employed, unemployed, or out of the
  workforce**, and moving between them is an event
- **B4** REASON — an unemployed person **searches**, and search takes time — which is why
  unemployment is never zero even when every vacancy could be filled
- **B5** VERIFY — employed + unemployed + inactive = the population, exactly, every week

### C. THE DEMAND SIDE
- **C1** REASON — a firm **hires when the worker adds more than the wage costs**
  (`firm-fundamentals.md` E2)
  - C1.a which depends on its **output price** (`goods.md`) and its **capital**
    (`the-capital-programme.md` A2)
- **C2** REASON — hiring has a **cost and a lag**: finding, and the time before the person is
  productive
- **C3** REASON — firing has a **cost** too, which is why firms hold labour through a soft patch
  and shed it when they are sure — and that asymmetry is where the cycle in employment comes from
- **C4** REASON — a firm that **fails** releases its workers at once
  (`firm-birth-and-death.md` D4)
- **C5** REASON — a **vacancy** is a real posted intention to hire, and it can go unfilled

### D. THE CLEARING
- **D1** REASON — the wage is a **price that clears** (`the-clearing-engine.md`) between posted
  supply and posted demand, per skill and region
- **D2** REASON — it does **not clear instantly**: wages are sticky because the relationship in A4
  is contractual and renegotiating is costly
  - D2.a so the adjustment falls on **quantity** — employment — which is the central fact about
    this market and the reason recessions have unemployment in them
  - D2.b VERIFY — stickiness must be a **consequence of the contract and the renegotiation cost**,
    never a coefficient damping a wage series
- **D3** REASON — the **matching is imperfect**: not every unemployed person meets every vacancy
  (A3.a, B4)
- **D4** VERIFY — unemployment and vacancies should move against each other over the cycle, as a
  consequence of B4, C5 and D3

### E. WHAT IT FEEDS
- **E1** REASON — wages are **household income** (`households.md` B1), which drives consumption
- **E2** REASON — wages are **firm cost**, which drives margin and price (`goods.md`,
  `indices.md` D4)
  - E2.a so a wage rise is simultaneously more demand and more cost, and which dominates is a
    result, not an assumption
- **E3** REASON — wage income is **taxed** (`the-treasury.md` C1)
- **E4** REASON — job loss changes a household's **ability to service debt**
  (`households.md` E4), which is where labour reaches the credit system

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no employment without an employer.** Every job is at a named firm, and the
  wage leaves that firm's account
- **F2** FORBID — **no wage bill without headcount**, and no headcount above the workforce (B2)
- **F3** FORBID — **no exogenous unemployment rate.** It is a read of B3, and a written path
  deletes C1, C3 and D3 at once
