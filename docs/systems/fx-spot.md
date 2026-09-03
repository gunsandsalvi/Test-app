# SYSTEM: FX SPOT

The market where one currency is bought for another. `currency-and-fx.md` is the type and the
invariants; this is the **mechanism**: who trades, why, and how a rate comes out of it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS TRADED
- **A1** REASON — an **exchange of two amounts in two currencies**, both legs settling
  (`the-register.md` C3: neither leg alone)
- **A2** REASON — the price is the **rate**, quoted one way with its inverse implied
  (`currency-and-fx.md` C2)
- **A3** REASON — the pair set is **all pairs among the currencies that exist**, and the rates
  must be mutually consistent (C3 there) — so a cross is either traded or derived, and if both,
  they must agree or somebody is arbitraging

### B. WHO TRADES AND WHY
- **B1** REASON — **a party that owes a currency it does not have** (`currency-and-fx.md` B4) —
  an importer, a borrower in foreign currency, an investor settling a foreign purchase
- **B2** REASON — **a party with a currency it does not want**: an exporter, a coupon received
  abroad
- **B3** REASON — **an investor changing its portfolio's currency mix**, for yield or for risk
- **B4** REASON — **a hedger** closing a currency exposure it took on for another reason
  (`fx-forwards-and-xcs.md` — the forward is the usual tool, and spot is one leg of it)
- **B5** REASON — **a dealer**, whose reason is spread and inventory (`dealer-desks.md`)
  - B5.a it quotes because it expects the flow to be two-way; it is **not** obliged to take
    whatever arrives (`the-clearing-engine.md` B4)
- **B6** REASON — the **central bank may participate**, for a stated policy reason, as a
  participant with a size and a limit — never as the residual
  (`the-central-bank.md` F)

### C. THE MECHANISM
- **C1** REASON — participants post **schedules in rate space** (`the-clearing-engine.md` A2)
- **C2** REASON — the rate clears where the two sides meet, **per pair and consistently across
  pairs**
  - C2.a the cross-consistency is a constraint on the clearing, not a correction applied after
- **C3** REASON — **the bid–offer is a consequence** of what dealers posted, read off the book
  (`the-clearing-engine.md` E3) — a client crosses it, a dealer earns it
- **C4** REASON — **imbalance moves the rate**: persistent demand for a currency at the old rate
  means the old rate was wrong
- **C5** REASON — one rate is **in force for the period** and both valuation and settlement use it
  (`currency-and-fx.md` D1)
- **C6** VERIFY — with flows netting to zero the rate should not drift; with a one-way flow it
  should move (`currency-and-fx.md` E4)

### D. THE DEALER'S POSITION
- **D1** REASON — a dealer that fills a client is **left with the other side**: a real open
  position in a real currency
- **D2** REASON — it can **square** it — against another client, another dealer, or the market —
  and squaring is a trade with a counterparty, not a disappearance
- **D3** REASON — what it does not square, it **carries**, and the carried position revalues
  (`currency-and-fx.md` D2) — that is the risk it is paid the spread for
- **D4** REASON — it has a **limit** on what it will carry, and when the limit binds it widens or
  stops quoting rather than absorbing more
- **D5** VERIFY — Σ(dealer positions) + Σ(client positions) = 0 in every currency, because every
  trade has two sides

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no conversion without a counterparty.** A party cannot turn EUR into USD by
  itself; somebody took the other side, and that somebody now holds EUR
- **E2** FORBID — **no rate from a formula.** Not PPP, not a rate differential applied to a level,
  not a written path (`currency-and-fx.md` E3)
- **E3** FORBID — **no free arbitrage left standing.** If A→B→C ≠ A→C, either a participant takes
  it and the rates converge, or the inconsistency is a defect — it is never a permanent feature
- **E4** VERIFY — a party's currency position after the market is exactly what it held plus what
  it traded, and no leg landed converted (`currency-and-fx.md` B3)
