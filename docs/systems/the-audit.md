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

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a statement about the state | `src/engine/audit/index.ts:auditWeek` | ✅ |
| A1.a two independent reads that must agree | `src/engine/audit/types.ts:AuditFinding` | ⚠️ |
| A2 it names WHO | `src/engine/audit/types.ts:AuditFinding` | ✅ |
| A2.a a violation with no owner cannot be fixed | `src/engine/audit/money.ts:auditMoney` | ✅ |
| A3 and HOW MUCH, in a unit | `src/engine/audit/types.ts:AuditFinding` | ⚠️ |
| **A4 the tolerance is float dust** | `src/engine/audit/ownership.ts:AUDIT_BOOKS_TOLERANCE` | ❌ |
| A4.a a percentage hides a defect that scales | `src/engine/audit/money.ts:auditMoney` | ❌ |
| B1 money is conserved | `src/engine/audit/money.ts:auditMoney` | ✅ |
| B2 ownership is conserved | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| B3 prices exist and are cleared | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| B4 cross-market consistency | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| B5 accounts balance | `src/engine/audit/accounts.ts:auditAccounts` | ✅ |
| B6 names resolve | `src/engine/audit/names.ts:auditNames` | ✅ |
| **B7 wires are complete** | `src/engine/audit/wires.ts:auditWires` | ⚠️ |
| B8 the families are independent | `src/engine/audit/index.ts:auditSummary` | ⚠️ |
| C1 it runs where the state is meant to be consistent | `src/engine/audit/index.ts:auditWeek` | ✅ |
| C2 every week | `src/engine/audit/index.ts:auditWeek` | ✅ |
| C2.a the first week of a violation is evidence | `src/engine/audit/snapshot.ts:snapshotOf` | ✅ |
| C3 the same invariants every week | `src/engine/audit/index.ts:auditWeek` | ✅ |
| **C4 FORBID the audit never repairs** | `src/engine/audit/index.ts:auditWeek` | ✅ |
| D1 a count by family | `src/engine/audit/index.ts:auditSummary` | ⚠️ |
| D2 the worst instances, with party and size | `src/engine/audit/index.ts:auditSummary` | ✅ |
| D3 a run is reproducible | `src/engine/audit/snapshot.ts:AuditSnapshot` | ✅ |
| D4 2 / 4 / 13 / 16 weeks tell different stories | `src/engine/audit/index.ts:auditSummary` | ✅ |
| E1 FORBID it cannot find an absence | `src/engine/audit/index.ts:auditWeek` | ✅ |
| E2 the audit measures consistency, the trees completeness | `docs/systems/README.md` | ✅ |
| E3 a green audit beside MISSING nodes is normal | — | ✅ |

---

## 3. THE DIFF

**The audit is the best-instrumented thing in the repo and this tree finds nothing new about its
structure.** Seven families, a file per family, a check per function, every finding carrying a
week, a size and a message that names the party. C1–C4 and E1–E3 are present as written; C4 in
particular is honoured absolutely — no family mutates state.

Everything below is already a §3 step. This tree's contribution is that it says WHICH NODE each
step is, so a future reader can tell a known gap from a new one.

### ❌ A4 / A4.a — PERCENTAGE TOLERANCES, AND THE ATLAS AGREES WITH RULE 28

`ownership.ts:59` forgives `max(5e7, o * AUDIT_BOOKS_TOLERANCE)`; `money.ts:135` forgives
`max(1e7, assets * 2e-3)`. Node A4 is rule 28 restated from the domain side and reaches the same
verdict independently: a tolerance is the accumulated representation error of the arithmetic that
produced the number, so it is absolute, and a percentage forgives exactly the defects that scale.
**Already §3 step 27**, which owns the full inventory. No new step.

### ⚠️ B7 / D1 — THE W FAMILY HAS NO SCOREBOARD LINE

`index.ts:auditSummary` iterates `families = ['M','O','P','X','F','N']`. `auditWires` runs, its
findings reach the violation count, and the summary has no `--- W · wires ---` section, so W1
(money-wires = gross), W3 (ladders) and W4 (no unit sold that did not exist) are invisible in the
one output anyone reads. **Already §3 step 27.** Node B7 is `⚠️` rather than `✅` for this reason
alone — the checks exist and are correct.

### ⚠️ A1.a / B3 / B4 — CHECKS THAT CANNOT FIRE

`ownership.ts:70` compares `stockPrice × sharesOutstanding` against `marketCapOf`, which is defined
as exactly that — node A1.a's failure mode written out: **a read of one thing against itself, which
always passes.** `prices.ts:39,49,126` fire only above 5%/10%/25% breach quotas, so a minority of
issuers may invert seniority with a clean board. Both are §3 step 27's, and A1.a is the domain-side
statement of why they are wrong rather than merely weak.

### ⚠️ A3 — THE SIZE IS A NUMBER WITHOUT ITS CURRENCY

`AuditFinding.usd` is a bare number, and its name says USD while the value is whatever money the
check summed — the same defect as everywhere else in the tree (rule 9, §3 step 13c). It matters
more here than elsewhere: the scoreboard ADDS finding sizes across regions to produce "the money
that is not anyone's", which sums four currencies. **Already §3 step 13c**, but this is the one
place where the rename is not cosmetic, and it is worth doing this call site first.

### ⚠️ B8 — THE FAMILIES OVERLAP AND NOTHING MEASURES IT

Node B8 asks that one defect light one family. Nothing tests that, and the reference run's history
shows the opposite: the FX defects moved M, F and W together, and 13c-FX's fix cleared the whole M
family at 16 weeks. That is not a defect in the audit — the families genuinely intersect — but it
means the violation COUNT is not a count of causes, and reading it as one is how a single ordering
defect looks like forty. Recorded for §3 step 38's standing reads, not a step.
