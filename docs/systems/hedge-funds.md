# SYSTEM: HEDGE FUNDS

Leveraged, mandate-light, marked-to-market investors. They matter for three structural reasons:
they are the marginal buyer in stressed markets, they are the reason `prime-brokerage.md` exists,
and their forced deleveraging is one of the few mechanisms in this world that turns a price move
into more price moves.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THEY ARE
- **A1** REASON — a **named party** with investors, a register of holdings, and accounts
- **A2** REASON — **investor capital is equity**: the investors bear the result
  (`fund-shares.md` A3)
- **A3** REASON — a **manager** is a separate party earning a fee — a management fee on assets and
  a **performance fee on gains**, and the asymmetry of that second fee is a reason for risk-taking
- **A4** REASON — a **mandate that is wide**: it can be long, short, levered, and in many markets
- **A5** REASON — everything is **marked to market** at cleared prices, so its equity moves daily

### B. LEVERAGE
- **B1** REASON — it **borrows to hold more than its equity**, from a named lender
  (`prime-brokerage.md` B1)
  - B1.a leverage is therefore **a fact about a loan**, never a property of the fund
- **B2** REASON — it also levers **through derivatives**, where the notional exceeds the margin
  (`the-derivative-layer.md`, `../instruments/derivative.md` D2.a)
- **B3** REASON — and through **repo** (`money-market.md`) against the securities it holds
- **B4** REASON — the amount available is the **lender's decision**, and it changes
  (`prime-brokerage.md` C4)
- **B5** VERIFY — gross exposure, net exposure and equity are three different reads and all three
  are needed; a single "leverage" number hides which one moved

### C. WHAT IT DOES IN A MARKET
- **C1** REASON — it takes **positions for reasons**: a relative-value view, a directional view, a
  liquidity premium it is paid to hold
- **C2** REASON — it will be the **buyer when others are forced sellers**, if it has capacity —
  which makes it a genuine participant in `the-clearing-engine.md`, with a limit like everyone else
- **C3** REASON — it **shorts**, which requires a borrow (`securities-lending.md` E1)
- **C4** REASON — its trades are **real trades with real counterparties** at cleared prices

### D. THE FAILURE MODE
- **D1** REASON — a **loss reduces equity**, and with fixed borrowing, leverage rises
- **D2** REASON — the lender **calls margin** (`prime-brokerage.md` C2)
- **D3** REASON — meeting the call requires **selling**, at market prices, which moves prices
- **D4** REASON — the price move hits **other holders of the same positions**, who may be levered
  too — and D1 starts again for them
  - D4.a this loop is the mechanism, and it must be **emergent from D1–D3**, never a contagion
    parameter (`README.md`, REASON not OUTCOME)
- **D5** REASON — **investor redemptions** arrive at the same time, for the same reason, and they
  are a second forced-seller channel (`fund-shares.md` C2.b)
  - D5.a a **redemption gate or notice period** delays it, which is a real contractual term with
    real consequences for who gets out
- **D6** REASON — the fund can **fail**, and then its broker eats the shortfall
  (`prime-brokerage.md` D2) and its investors lose their equity
- **D7** VERIFY — the chain from one fund's loss to another fund's margin call must be traceable
  through prices and named counterparties

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no leverage without a lender** (B1.a)
- **E2** FORBID — **no position that does not mark.** A fund carrying an unmarked position has
  hidden its own equity from itself
- **E3** FORBID — **no fund that cannot fail.** A vehicle that absorbs losses indefinitely is the
  buyer of last resort in a different costume (`the-clearing-engine.md` B4)
