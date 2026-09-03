# SYSTEM: INTEREST-RATE SWAPS

Exchanging a fixed rate for a floating one on a notional. The largest derivative market there is,
because every borrower and every asset manager has a duration position it did not choose and can
change here without touching the underlying debt.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **named floating reference rate** that is observable and
    transacted (`indices.md` D3, `money-market.md`)
  - A1.b **D4 payoff** — periodic exchange of fixed against floating on the notional; only the
    **net** moves
  - A1.c **D7 price** — the **fixed rate that makes the swap worth zero at inception**, cleared
  - A1.d **D2 notional** — never exchanged, which is why a swap is not a loan
- **A2** REASON — **two legs with their own periodicity and accrual convention** (rule 9), and
  they need not match — that mismatch is real and it is part of the price
- **A3** REASON — the floating leg **fixes** on a stated date against the observed reference, and
  the fixing is a real observation, not a forecast
- **A4** REASON — both legs are in **one currency**; two currencies makes it a cross-currency swap
  (`fx-forwards-and-xcs.md`)

### B. WHY EACH SIDE IS THERE
- **B1** REASON — a **borrower who issued fixed and wants floating**, or the reverse — it has debt
  it cannot economically reissue (`corporate-credit.md`, `banks-funding-and-liquidity.md`)
- **B2** REASON — an **asset manager with a duration mismatch**: a pension whose liabilities are
  long and whose assets are not (`insurers-and-pensions.md` D)
  - B2.a this is a **structural, one-way demand**, and it is why long swap rates behave the way
    they do
- **B3** REASON — a **bank managing its own gap**: assets repricing at a different speed from
  liabilities (`banks-funding-and-liquidity.md` D)
- **B4** REASON — a **speculator** with a view on rates
- **B5** REASON — a **dealer** running a book (`dealer-desks.md`), hedging its net position

### C. THE CURVE
- **C1** REASON — swaps exist at **many tenors**, and the set of cleared fixed rates **is** a
  curve
  - C1.a the curve is a **read of cleared prices**, never a fitted object that then prices the
    swaps (rule 1, and `indices.md` A3's circularity)
- **C2** REASON — a **forward rate is derived** from the curve, and it is what the market thinks,
  not what will happen
- **C3** REASON — the **swap curve and the sovereign curve are different curves**
  (`sovereign-credit.md`), and the difference is the swap spread
  - C3.a which is a **consequence** — of bank credit, collateral, balance-sheet cost and who is
    forced to be on which side — and it is measured, never set
- **C4** VERIFY — a change in the policy rate should move the short end through the reference rate
  and the long end through expectations, and the two channels are different

### D. VALUATION AND CASH
- **D1** REASON — after inception the swap has a **mark**, positive to one side
  (`../instruments/derivative.md` D8)
- **D2** REASON — the mark **moves with the curve**, and the move is a real gain and a real loss
- **D3** REASON — **variation margin turns that mark into cash**
  (`the-derivative-layer.md` D2), so a rate move is a liquidity event long before it is a P&L event
  - D3.a a hedger whose hedge is winning is receiving cash while its hedged item shows an unrealised
    loss, and the mismatch is a real funding problem
- **D4** VERIFY — Σ marks across the two sides = 0, and Σ net payments = 0, every period

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no notional exchange.** If the notional moves, it is a loan and it belongs on
  the balance sheet as one
- **E2** FORBID — **no fixed rate solved from the discount curve alone.** The fixed rate is
  cleared; the curve is read from the cleared rates. Doing it the other way makes the market a
  restatement of a formula (`../instruments/derivative.md` D7.b)
- **E3** FORBID — **no floating leg on a rate this world does not produce**
  (`indices.md` D3.b)
