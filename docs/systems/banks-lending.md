# SYSTEM: BANKS — LENDING

A bank's asset side: the loans it writes, to whom, at what price, and what happens when they go
bad. Excludes its funding (`banks-funding-and-liquidity.md`) and its capital
(`banks-capital-and-resolution.md`), which are the same balance sheet read from the other two
directions.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A LOAN IS
- **A1** REASON — a **bilateral contract** between a named bank and a named borrower
  - A1.a it is **not** a security: it is not transferable by default and has no market price
  - A1.b it is therefore carried differently — see D
- **A2** REASON — terms fixed at origination: principal, maturity, rate or margin, currency
- **A3** REASON — a **drawdown structure**: term loan drawn at once, or a **facility** drawn and
  repaid at the borrower's option
  - A3.a an undrawn commitment is a **real obligation of the bank** and consumes something
  - A3.b VERIFY — undrawn commitments are visible; a facility that costs nothing until drawn is
    a free option the bank did not sell
- **A4** REASON — **security**: secured on named collateral, or unsecured
- **A5** REASON — **covenants**, and a breach is an observable event

### B. WRITING IT — WHERE THE MONEY COMES FROM
- **B1** REASON — **a bank lends by creating a deposit.** The loan appears on one side and the
  borrower's balance on the other, at the same instant
  - B1.a **no reserve leaves the bank at origination.** This is the whole of endogenous money
  - B1.b reserves move only when the borrower **spends** it to a customer of another bank, and
    then as an ordinary payment (`money-and-settlement.md` C2.a)
  - B1.c FORBID — a bank does not lend "out of" its deposits or its reserves. A model in which it
    does cannot produce a credit cycle
- **B2** REASON — but the bank is **constrained**, and the constraints are real and separate
  - B2.a **capital**: the loan consumes it (`banks-capital-and-resolution.md` B)
  - B2.b **liquidity**: the deposit it created may be spent away, and it must fund that
  - B2.c **its own risk appetite**, which is a decision
  - B2.d VERIFY — which constraint binds is an outcome and differs by bank and by week

### C. THE PRICE
- **C1** REASON — the bank **quotes a rate**, built from its own economics
  - C1.a its **cost of funds**
  - C1.b the borrower's **expected loss** — a PD and an LGD it assesses itself
  - C1.c the **capital** the loan consumes, times its required return on it
  - C1.d an **operating cost** of making the loan
- **C2** REASON — the borrower **accepts or refuses**, and can go elsewhere
  - C2.a so the rate is the outcome of a negotiation, not a schedule the bank imposes
- **C3** REASON — the bank can **decline**, and declining is the credit decision
  - C3.a VERIFY — declined volume is visible. A bank that never says no has no credit standard
- **C4** FORBID — **one PD model per borrower.** Two models that disagree mean the price and the
  provision are struck against different beliefs

### D. CARRYING IT
- **D1** REASON — held at **amortised cost**, not marked to a market that does not exist (A1.a)
- **D2** REASON — a **provision** against expected loss, taken as a charge to income
  - D2.a it moves when the assessment moves, and the movement is an income event
  - D2.b FORBID — a provision is never a reserve that quietly absorbs losses. It is booked, and
    the booking is visible
- **D3** REASON — interest **accrues** and is **received**, and non-payment is observable
- **D4** REASON — a loan can be **sold or syndicated**, and then it has a price and a buyer
- **D5** REASON — it can be **pledged** to the central bank or in repo, at a haircut

### E. WHEN IT GOES BAD
- **E1** REASON — a missed payment or a covenant breach is an **EVENT**
- **E2** REASON — the loan is **reclassified**: performing → impaired, with a bigger provision
- **E3** REASON — **workout**: restructure, extend, or enforce — and each is a decision with a cost
- **E4** REASON — **enforcement**: the collateral is realised for what it fetches
- **E5** REASON — the **write-off**: the loan leaves the book and the loss hits capital
  - E5.a VERIFY — the loss that reaches capital equals principal minus recovery minus provisions
    already taken. Double-counting a provision flatters capital
- **E6** REASON — losses are **correlated across borrowers**, because they share a cause

### F. THE BOOK IN AGGREGATE
- **F1** REASON — the book is the **sum of named loans**, never a scalar that grows by a rate
  - F1.a FORBID — no "loan book" number that is not Σ(loans). A book with no loans in it cannot
    default, cannot be provisioned and cannot be sold
- **F2** VERIFY — new lending, amortisation, prepayment and write-off account for the change
- **F3** REASON — **concentration**: exposure to one name, one sector, one region is measurable and
  is a risk the bank manages
