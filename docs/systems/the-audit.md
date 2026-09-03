# SYSTEM: THE AUDIT

The world's self-check. Every week, a set of invariants is evaluated against the state, and each
one that fails names a party, a number and a family. The audit is not a test suite: it runs inside
the simulation and its output is the measurement everything else is judged by.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT AN INVARIANT IS
- **A1** REASON — a statement that must be true of the **state**, checkable without knowing how
  the state was produced
  - A1.a it is a read of two independent things that must agree — never a read of one thing
    against itself, which always passes
- **A2** REASON — an invariant that fails must name **who**: a party, an instrument, a wire
  - A2.a a violation with no owner cannot be fixed, only tolerated, and tolerated violations
    become the baseline
- **A3** REASON — and **how much**, in a unit, so the size is comparable week to week
- **A4** REASON — the tolerance is **float dust** — the accumulated representation error of the
  arithmetic that produced the number — never a percentage of it (rule 28)
  - A4.a a percentage tolerance hides a defect that scales, which is every defect that matters

### B. THE FAMILIES — WHAT MUST BE TRUE
- **B1** REASON — **money is conserved**: every payment has a payer and a payee, and the sum over
  all accounts changes only by an act of the money issuer (`money-and-settlement.md` B)
- **B2** REASON — **ownership is conserved**: Σ holdings = issued, per instrument
  (`the-register.md` B2)
- **B3** REASON — **prices exist and are cleared**: every instrument that anyone marks has a price
  that came out of a mechanism (rule 1, `the-clearing-engine.md` D1)
- **B4** REASON — **cross-market consistency**: the same economic thing has one value however it
  is reached (rule 3) — a bond's price and its derived spread, a share and the index containing it
- **B5** REASON — **accounts balance**: assets − liabilities = equity, for every entity, read and
  not stored
- **B6** REASON — **names resolve**: every party referenced exists, every issuer of a held
  instrument exists or has a successor (`the-register.md` F2)
- **B7** REASON — **wires are complete**: a flow leaving one place arrives somewhere named, in the
  same week, in the same currency
- **B8** VERIFY — the families are **independent**: one defect should light one family, and a
  defect that lights five means the families overlap

### C. WHEN IT RUNS
- **C1** REASON — at a point where the state is **supposed to be consistent** — after settlement,
  not in the middle of it
- **C2** REASON — **every week**, so the week a violation first appears is known
  - C2.a a violation's first week is the strongest evidence about its cause, and it is lost if
    the audit is sampled
- **C3** REASON — with the **same invariants every week**: an invariant that is skipped in some
  weeks measures the skipping, not the world
- **C4** FORBID — **the audit never repairs.** It observes. A checker that fixes what it finds
  destroys the evidence and guarantees the cause survives (rule 29)

### D. WHAT IT PRODUCES
- **D1** REASON — a **count by family**, comparable across runs, so a change can be attributed
- **D2** REASON — the **worst instances**, with party and size, so a cause can be chased
- **D3** REASON — a **run is reproducible**: same seed, same weeks, same violations
- **D4** VERIFY — a run at 2, 4, 13 and 16 weeks tells different stories, and the difference
  between them is itself a measurement: what accumulates versus what fires once

### E. WHAT THE AUDIT CANNOT DO
- **E1** FORBID — **it cannot find an absence.** No invariant fires because credit has no price or
  because FX does not exist; there is nothing to be inconsistent with. That is why this atlas
  exists (`README.md`, "Why this exists")
- **E2** REASON — so the audit measures **consistency**, and the required trees measure
  **completeness**, and neither substitutes for the other
- **E3** VERIFY — a green audit and a tree with MISSING nodes is the normal state of an
  incomplete model, not a contradiction
