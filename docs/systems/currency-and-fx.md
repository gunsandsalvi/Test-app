# SYSTEM: CURRENCY AND FX RATES

Money is denominated. A number without a currency is not an amount, and two amounts in different
currencies are not comparable without a rate. This tree is the **type**: what a currency is, what
a rate is, and what must be true of both. The market that produces the rate is `fx-spot.md`; the
contracts that trade it forward are `fx-forwards-and-xcs.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A CURRENCY IS
- **A1** REASON — a **unit of account** in which claims are denominated and settled
- **A2** REASON — issued by a **named issuer** — a central bank — whose liability it is
  (`the-central-bank.md` B)
- **A3** REASON — it is a **property of every amount**: every balance, price, coupon, payment and
  contract carries one (rule 9)
  - A3.a a function that takes an amount takes its currency with it, or it is a function over a
    domain it cannot type-check
- **A4** FORBID — **no implicit currency.** An amount whose currency is inferred from where it was
  found is inferred wrong exactly when it matters — a foreign holding, a cross-border payment
- **A5** REASON — currencies are a **closed, named set**; a party can hold any of them

### B. WHO IS IN WHICH
- **B1** REASON — a party has a **home currency**, the one its region uses and it reports in
- **B2** REASON — a party can hold **any currency it has acquired**, and holding one is holding a
  claim on that currency's banking system, not a converted number
  - B2.a so a party has an **account per currency it holds** (`money-and-settlement.md` C)
- **B3** FORBID — **no conversion at the ledger boundary.** A payment in EUR lands as EUR; the
  decision to convert is a separate, explicit trade with a counterparty and a rate. Converting on
  arrival makes the FX market invisible and unmeasurable — the position never exists, so it can
  never be seen to be wrong
- **B4** REASON — a party **short a currency it owes** must acquire it, from somebody, at a price
  (`fx-spot.md` C)
- **B5** REASON — a **bank's foreign balance is its business**, not a client conversion: it is the
  other side of its clients' trades, and it is a position it chooses to run or square

### C. WHAT A RATE IS
- **C1** REASON — the **price of one currency in another**, and it is a price like any other:
  cleared, not assigned (rule 1)
- **C2** REASON — it is **directional and consistent**: rate(A→B) = 1 / rate(B→A) exactly
- **C3** REASON — it is **transitive**: A→B→C and A→C agree, or there is an arbitrage and somebody
  must be taking it
  - C3.a which means the rates are **one object**, not a table of independent pairs (rule 3)
- **C4** REASON — a **numéraire** exists for reporting and aggregation only
  - C4.a FORBID — the numéraire is **not where value lives.** Storing every balance in the
    numéraire and converting on read destroys the currency position, which is the thing that
    gains and loses money
- **C5** VERIFY — the rate used to value and the rate used to settle are **the same rate**

### D. TIME AND REVALUATION
- **D1** REASON — a rate is **in force for a stated period**, and every use in that period uses it
  - D1.a a rate that changes mid-period lets a book be valued at one and paid at another, and the
    difference lands as an unexplained residual on somebody
- **D2** REASON — when the rate moves, every foreign position **revalues**, and the revaluation is
  a real gain or loss to a named party
  - D2.a it hits equity for a firm or bank, and the central bank's own account for the issuer
  - D2.b FORBID — **an unrevalued foreign position is money created or destroyed silently.** It
    is the same defect as a stale mark, in the currency dimension
- **D3** REASON — revaluation happens **before anything uses the new rate**, so nothing values at
  the new rate against a book still carried at the old
- **D4** VERIFY — Σ(revaluation gains) + Σ(revaluation losses) = the rate move applied to the net
  open position, and the net open position across all parties in a currency is what the issuer
  and the rest of the world hold

### E. WHAT MOVES A RATE
- **E1** REASON — the rate moves because **somebody trades at it** (`fx-spot.md`)
- **E2** REASON — the reasons participants have are real: **trade flows**, **rate differentials**,
  **portfolio shifts**, **hedging demand**
  - E2.a a rate differential is a reason to hold one currency over another, and the cost of
    hedging it away is why the reason does not automatically become a free lunch
- **E3** FORBID — **no exogenous rate path.** A rate that follows a written series is not a price,
  and everything derived from it inherits that
- **E4** VERIFY — persistent one-way flow should move the rate, and if it does not, the mechanism
  is not reading the flow
