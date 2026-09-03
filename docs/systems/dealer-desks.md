# SYSTEM: DEALER DESKS

The parties that quote both sides. Every market tree in this atlas has a node saying "a dealer may
be there, and its reason is inventory and spread" — this is that reason, written out. It is also
where the atlas's hardest FORBID lives: **a dealer is a participant with limits, never the
mechanism's residual absorber** (`the-clearing-engine.md` B4).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A DEALER IS
- **A1** REASON — a **named party**, usually a bank's trading arm, with its own balance sheet
  inside a bank's (`banks-capital-and-resolution.md`)
- **A2** REASON — it **quotes a price at which it will buy and a price at which it will sell**,
  and it is willing to do either
- **A3** REASON — it holds **inventory**: what it has bought and not yet sold, and the reverse
- **A4** REASON — it makes money from the **spread** and loses money from the **inventory**, and
  the two are the whole business

### B. WHY IT QUOTES
- **B1** REASON — it expects **two-way flow**: buyers and sellers arriving at different times, so
  it earns the spread for bridging the time between them
- **B2** REASON — it has **information** from seeing the flow, and the information is worth
  something
- **B3** REASON — the client **pays for immediacy**: the alternative is waiting for a natural
  counterparty, which may not come
- **B4** FORBID — **it does not quote because the mechanism needs somebody to.** If a desk's
  schedule is derived from the residual imbalance, it is the buyer of last resort with a different
  name, and every price the mechanism produces is a fixed point of that patch

### C. HOW IT PRICES — THE SPREAD IS A CONSEQUENCE
- **C1** REASON — the quote comes from the desk's **own state**: its inventory, its cost of funds
  (`banks-funding-and-liquidity.md`), its risk limit, its view
- **C2** REASON — **inventory skews the quote.** Long already ⇒ it bids lower and offers lower,
  because it wants to sell
  - C2.a this is how a desk mean-reverts its book without anyone telling it to, and it is why
    order flow moves prices
- **C3** REASON — **risk widens the quote**: volatility, illiquidity, a position it cannot hedge
- **C4** REASON — **adverse selection widens it**: a client who knows more is expensive to face
- **C5** REASON — the **bid–offer is therefore the output** of C1–C4 (user, 2026-09-03: "the bid
  offer is a consequence, not a prior")
  - C5.a FORBID — **no spread applied to a mid.** A mid with a spread bolted on is a single price
    pretending to be two, and it cannot skew, widen, or refuse

### D. LIMITS — WHY AN AUCTION CAN STILL FAIL
- **D1** REASON — it has a **position limit** per instrument and in aggregate, set by its own risk
  function
- **D2** REASON — it has a **capital charge** on what it holds, and the charge is real
  (`banks-capital-and-resolution.md` C)
- **D3** REASON — it has a **funding cost** on the inventory, paid every week it holds it
- **D4** REASON — when a limit binds it **widens, shrinks its size, or stops quoting** — and
  stopping is a legitimate, representable state
  - D4.a which is precisely what makes `the-clearing-engine.md` C4 — a failed auction — possible.
    A market fails when the dealers step back, and the dealers step back for the reasons in D1–D3
- **D5** VERIFY — in a stress week, desk inventory, spreads and capital usage should all move
  together, and if spreads widen without inventory moving, the widening is imposed

### E. HEDGING AND THE REST OF THE BOOK
- **E1** REASON — it **hedges what it can**: a bond against a swap, a share against an index, an
  FX position against another client's
  - E1.a a hedge is a **trade with a counterparty**, not a reduction in a number
    (`the-derivative-layer.md` B3.a)
- **E2** REASON — the hedge is **imperfect**, and the residual is basis risk it carries
- **E3** REASON — desks **face each other**: an interdealer market exists, and it is where
  inventory gets redistributed (`fx-spot.md` D2)
- **E4** VERIFY — Σ dealer inventory across desks = the position the rest of the world does not
  hold; it is a real number, and it should move with client flow

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no infinite balance sheet.** Every desk's capacity is finite and enumerable
- **F2** FORBID — **no desk that is exempt from its own bank's capital and funding**
- **F3** FORBID — **no desk whose P&L is the spread times volume.** Its P&L is the spread earned
  **minus** what the inventory did, and a desk that cannot lose money is not taking the other side
