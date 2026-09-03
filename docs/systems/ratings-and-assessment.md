# SYSTEM: RATINGS AND ASSESSMENT

The judgement of creditworthiness, and what it causes. A rating is not a price and not a
prediction: it is a **published opinion that other parties' rules refer to**, and that reference is
the only reason it has any effect on this world at all.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A RATING IS
- **A1** REASON — an **ordinal judgement** about a named issuer or instrument, published, and
  visible to everyone
- **A2** REASON — it is derived from **observable state**: leverage, coverage, cash, size, sector,
  and the trend in them (`firm-fundamentals.md` D3, `sovereign-credit.md`)
  - A2.a FORBID — **a rating is never derived from the price.** If it reads the spread, it is a
    restatement of the market and cannot disagree with it — which deletes both its information
    content and the feedback in D
- **A3** REASON — it is **coarse and sticky**: a small change in state does not move it, which is
  what makes a move meaningful and what makes it late
- **A4** REASON — it is **an opinion, not a fact**, and it can be wrong — a rated-safe issuer can
  fail (`firm-birth-and-death.md` C)
- **A5** REASON — it is published by a **named assessor**, which is a party with its own incentives

### B. WHAT IT MEASURES
- **B1** REASON — the **probability of failing to perform**, in the sense of
  `../instruments/bond.md` N12
- **B2** REASON — and, separately, the **loss given that failure**, which depends on seniority and
  security (`../instruments/bond.md` N13.a)
  - B2.a so an instrument's rating differs from its issuer's, and both must exist
- **B3** REASON — it is **relative**: an ordering across issuers, which is what makes it usable in
  a rule

### C. WHY IT MATTERS — THE RULES THAT REFER TO IT
- **C1** REASON — **mandates** restrict what a fund, insurer or pension may hold
  (`fund-shares.md` A4, `insurers-and-pensions.md` C5)
  - C1.a so a downgrade past a boundary is a **forced sale by every holder bound by it, at the
    same time** — and that is a real, dated, mechanical flow
- **C2** REASON — **capital charges** depend on it (`banks-capital-and-resolution.md` C), so a
  downgrade consumes a bank's capital without the bank doing anything
- **C3** REASON — **collateral haircuts** depend on it (`money-market.md`,
  `the-derivative-layer.md` D1), so a downgrade reduces how much can be borrowed against the asset
- **C4** REASON — **contract terms** refer to it: covenants, triggers, the right to demand more
  collateral
- **C5** REASON — participants use it as **information** when they have no better

### D. THE FEEDBACK — THE POINT OF THE TREE
- **D1** REASON — C1–C4 mean a downgrade **causes selling, capital pressure and funding loss**
- **D2** REASON — those raise the issuer's **cost of funds** (`corporate-credit.md`,
  `banks-funding-and-liquidity.md`)
- **D3** REASON — which **worsens the state in A2**, which can cause a further downgrade
- **D4** VERIFY — this loop must be **emergent from A2, C and D2** and traceable step by step. It
  is the mechanism behind a cliff edge, and it is precisely what a rating read off the spread
  (A2.a) can never produce, because there the loop is a tautology
- **D5** REASON — it works the other way too: improvement widens the buyer base and cheapens
  funding

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no rating with no consequence.** A published letter that no rule refers to is
  decoration; the whole system is C
- **E2** FORBID — **no rating that changes for no reason.** Every move traces to a change in A2
- **E3** FORBID — **no assessment that is always right.** If a rating never misprices, C1's forced
  sales never surprise anyone and A4 is deleted
- **E4** VERIFY — the distribution of ratings across issuers is a **read** of their states, never
  a target distribution the issuers were fitted to (rule 4)
