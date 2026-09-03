# SYSTEM: TRADE CREDIT

Firms buying from each other and paying later. It is the largest source of short-term finance in
any real economy, it is invisible in a model where every sale settles instantly, and it is the
channel by which one firm's failure becomes another firm's loss without a bank in between.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IT IS
- **A1** REASON — a **sale delivered now and paid later**: the seller has a **receivable**, the
  buyer a **payable**, and they are the same obligation from two sides (rule 3)
- **A2** REASON — both sit on real balance sheets (`firm-fundamentals.md` C1, C2)
- **A3** REASON — it has **terms**: how long, and often a discount for paying early — which makes
  the discount an **implicit interest rate** and therefore a price
- **A4** REASON — it is **unsecured credit extended by a supplier**, and the supplier decided to
  extend it

### B. WHY IT EXISTS
- **B1** REASON — the **buyer needs to sell what it bought before it can pay**, and the terms
  bridge that gap (`firm-fundamentals.md` C4)
- **B2** REASON — the **seller wants the sale**, and offering terms is a way to compete
- **B3** REASON — the seller often **knows the buyer better than a bank does**, and can enforce
  better by threatening to stop shipping
- **B4** REASON — it is **cheap or free at the point of use**, which is why firms use it first and
  bank credit second (`banks-lending.md`)
- **B5** REASON — the seller **decides** whether to offer it, per buyer, on the buyer's condition
  — and it tightens terms when it is worried, which is a real credit tightening with no bank
  involved

### C. THE FLOW
- **C1** REASON — the goods move at one time (`goods.md`), the money at another
  (`money-and-settlement.md`)
  - C1.a so revenue and cash receipt are **different weeks**, and that difference is
    `firm-fundamentals.md` C4.a
- **C2** REASON — the receivable is an **asset that can be financed**: pledged, factored, or sold
  to a bank at a discount — which turns it into bank credit
- **C3** REASON — payment, when it comes, is a **real settlement between two named parties**
- **C4** VERIFY — Σ receivables = Σ payables, across the whole world, exactly. This is the
  cheapest possible check on the system existing at all

### D. FAILURE — WHY IT MATTERS
- **D1** REASON — a buyer can **pay late**, and lateness is a real state that stresses the seller's
  cash
- **D2** REASON — a buyer can **fail**, and then the receivable is a **claim in the estate**,
  ranking with other unsecured creditors (`firm-birth-and-death.md` D2)
  - D2.a so the seller takes a real loss it did not choose, from a party it is not a lender to on
    paper
- **D3** REASON — the loss can **push the seller into distress**, and its own suppliers then take
  losses — a chain that runs along the supply network and not through the banking system
  - D3.a VERIFY — this contagion path must be **emergent from D2**, traceable firm to firm
- **D4** REASON — the anticipation of D2 makes suppliers **withdraw terms** from a firm they doubt
  (B5), which starves it of working capital faster than any lender could
  - D4.a which is how a solvent firm dies of a rumour, and it is a real mechanism

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no sale that settles instantly by construction.** If every transaction pays on
  delivery, this entire system is absent and its failure channel with it
- **E2** FORBID — **no receivable without a named payer** (`the-register.md` A3)
- **E3** FORBID — **no receivable that survives its debtor's death.** It resolves into a recovery
  or a loss (`firm-birth-and-death.md` E2)
