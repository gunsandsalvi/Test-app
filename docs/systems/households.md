# SYSTEM: HOUSEHOLDS

The sector that supplies labour, consumes output, saves, borrows and ultimately owns everything.
The counterparty to half the other trees. Excludes the labour market's clearing
(`labour.md`) and housing's (`housing.md`), but the household's side of both is here.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A HOUSEHOLD IS
- **A1** REASON — a unit that **earns, consumes, saves and owns**
- **A2** REASON — households are **heterogeneous**, and the heterogeneity is load-bearing
  - A2.a by **income and wealth** — the propensity to consume differs, so the same aggregate
    income produces different demand depending on who has it
  - A2.b by **life stage** — earning, accumulating, drawing down
  - A2.c by **employment state** — employed, unemployed, out of the workforce
  - A2.d FORBID — **the sector is never a single representative agent.** E[f(x)] ≠ f(E[x]) and
    every decision that matters here is a threshold: a mean-preserving spread must be able to
    cause defaults, and with one agent it cannot
- **A3** REASON — it is a **named party in the ledger** with an account (`money-and-settlement.md`)

### B. INCOME
- **B1** REASON — **wages**, from named employers, for labour supplied
- **B2** REASON — **transfers** from the government, to named recipients
- **B3** REASON — **investment income**: dividends, interest, coupons — from named payers
  - B3.a FORBID — income the household did not RECEIVE is not income. Retained earnings raise the
    value of what it owns and reach it on sale or distribution (`equity.md` F4)
- **B4** REASON — **income is taxed**, progressively or not, and the tax is remitted by somebody
- **B5** VERIFY — sector income is Σ(what households were actually paid), never an accounting
  identity solved for

### C. CONSUMPTION
- **C1** REASON — it **decides** how much to spend, and the decision has reasons
  - C1.a current income
  - C1.b **wealth**, which is why an asset price matters to demand
  - C1.c expectations, and confidence
  - C1.d **liquidity**: a household that cannot borrow spends what it has, whatever it wants
- **C2** REASON — the residual is **saving**, and saving is a flow into B3's stock
- **C3** REASON — spending is **allocated across goods** by preference and relative price
- **C4** REASON — it **buys at a price it pays** — including tax and the distribution margin
  (`goods.md` G1.b)
- **C5** VERIFY — consumption is Σ(what households actually bought), and it reaches named sellers

### D. THE BALANCE SHEET
- **D1** REASON — **assets**: deposits, securities held directly, fund shares, pensions, housing
  - D1.a each is a real claim on a named issuer, held in a register
- **D2** REASON — **liabilities**: mortgages, consumer credit, and they are somebody's asset
- **D3** REASON — **net worth** is D1 − D2, a read and never a stored number
- **D4** REASON — it **revalues** when prices move, and the revaluation is not income (B3.a)
- **D5** REASON — the **portfolio allocation is a decision** with reasons: yield, risk, liquidity
  - D5.a the choice between a deposit, a money fund and bills directly is a real substitution
    (`sovereign-credit.md` E2.f) — and it is how a policy rate reaches a saver

### E. BORROWING
- **E1** REASON — it **borrows for reasons**: a house, consumption, a shortfall
- **E2** REASON — a lender **decides** to lend to it, on affordability and collateral
  (`banks-lending.md` C)
- **E3** REASON — it **services** the debt out of income, and the service is a real payment
  - E3.a interest **plus** principal, and the distinction matters
- **E4** REASON — it can **default**, and the default depends on the distribution (A2.d), not the
  mean
  - E4.a with a consequence: the collateral, the credit record, the loss to the lender
- **E5** VERIFY — the debt-service burden is a read of E3 against B, and it can become unpayable

### F. THE LIFE CYCLE
- **F1** REASON — households **form, age and dissolve**
- **F2** REASON — wealth **transfers** on dissolution, and it goes somewhere named
- **F3** REASON — **retirement**: income switches from wages to drawdown, and the pension claim in
  D1 is what funds it
- **F4** VERIFY — the sector's composition changes over time, and the aggregate follows from it
