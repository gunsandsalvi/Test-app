# SYSTEM: FIRM FUNDAMENTALS

What a firm IS, before any market prices it: it sells things, it pays for inputs and labour, it
owns assets, it owes debt, and the difference between those flows is the number every other tree
about firms reads. `equity.md` prices the residual; `corporate-credit.md` lends against the cash
flow; this tree is the cash flow.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A FIRM IS
- **A1** REASON — a **named party** with an account, a register of what it owns and what it owes
- **A2** REASON — it exists in a **region**, in a **sector**, and both are load-bearing: the region
  fixes its money (`currency-and-fx.md` B1) and the sector fixes what it buys and sells
- **A3** REASON — firms are **heterogeneous in size, cost and leverage**, and the dispersion is the
  reason markets exist among them (`the-seed.md` B4)
- **A4** REASON — it has an **owner or owners** (`equity.md`, `private-equity.md`) whose claim is
  the residual

### B. THE OPERATING FLOW
- **B1** REASON — **revenue**: quantity sold × price achieved (`goods.md`), from named buyers
  - B1.a it is a **consequence of a market**, never a growth rate applied to last week
- **B2** REASON — **input costs**: what it bought, at prices it paid (`commodities-spot.md` E1,
  `trade-credit.md`)
- **B3** REASON — **labour costs**: headcount × wage (`labour.md`), paid to named households
  (`households.md` B1)
- **B4** REASON — **operating profit is the residual** of B1 − B2 − B3, and it can be negative
  - B4.a and the **margin is a read**, never a target the revenue was fitted to
- **B5** REASON — **fixed and variable costs differ**, which is why margin moves more than revenue
  — operating leverage is a consequence of the cost structure, not a coefficient
- **B6** VERIFY — every cost is somebody's income and every revenue is somebody's outlay, party by
  party (`the-audit.md` B7)

### C. THE BALANCE SHEET
- **C1** REASON — **assets**: cash, receivables (`trade-credit.md`), inventory, fixed capital
  (`the-capital-programme.md`)
- **C2** REASON — **liabilities**: payables, bank debt (`banks-lending.md`), bonds
  (`corporate-credit.md`)
- **C3** REASON — **equity is the read**, C1 − C2, and it can be negative
- **C4** REASON — **working capital** is a real use of cash: inventory bought and not yet sold,
  invoices sent and not yet paid
  - C4.a so profit and cash are **different numbers**, and the difference is where firms die

### D. CASH AND SOLVENCY
- **D1** REASON — it pays out of a **balance**, and the balance can hit zero
- **D2** REASON — **debt service is a fixed claim** ahead of the owners: interest and principal
  (`households.md` E3.a is the same structure)
- **D3** REASON — **coverage** — operating cash against debt service — is a read, and it is what
  lenders look at (`banks-lending.md` C, `ratings-and-assessment.md`)
- **D4** REASON — it can **fail two ways**: no cash to pay something due, or liabilities exceeding
  assets. They are different, and a firm can be either without the other
- **D5** REASON — when it cannot pay, it **defaults**, and that is `firm-birth-and-death.md`

### E. WHAT IT DECIDES
- **E1** REASON — **price and quantity** it offers (`goods.md`)
- **E2** REASON — **how many people to employ** (`labour.md`)
- **E3** REASON — **how much to invest** (`the-capital-programme.md`)
- **E4** REASON — **how to fund itself**: retained cash, debt, or new equity — and the choice
  depends on what each costs (`equity.md` E, `corporate-credit.md`)
- **E5** REASON — **what to pay out**: dividends and buybacks, which are real cash to owners
  (`equity.md` F4)
- **E6** REASON — every one of E1–E5 is made from the firm's **own state and the prices it faces**,
  which is what makes the aggregate a consequence

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no revenue without a buyer** and no cost without a payee (B6)
- **F2** FORBID — **no exogenous earnings path.** A firm whose profit follows a series has had
  every decision in E made for it
- **F3** FORBID — **no firm that cannot run out of cash** (D1)
- **F4** VERIFY — the sector aggregate is Σ(firms), computed from members, never a target they
  were scaled to (`the-seed.md` C5)
