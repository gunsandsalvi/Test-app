# SYSTEM: PRIME BROKERAGE

The service a bank sells to a leveraged fund: financing, custody, stock borrow, clearing, and one
margin number across all of it. It is the pipe through which hedge fund leverage exists
(`hedge-funds.md`), and the pipe through which a fund's failure reaches a bank.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE RELATIONSHIP
- **A1** REASON — a **named bank and a named client**, with a contract that can be ended
- **A2** REASON — the broker **holds the client's assets** and knows the whole position — that
  knowledge is what lets it lend against them
- **A3** REASON — the client can have **more than one** broker, and then no broker sees the whole
  position, which is a real and material blind spot
- **A4** REASON — the broker earns from **financing spread, stock-borrow fees and commissions**,
  and that income is a reason for it to take the risk

### B. FINANCING
- **B1** REASON — the client buys more than its cash allows; the **broker lends the difference**
  against the assets as collateral
  - B1.a so the client's leverage is a **loan from a named lender**, not a property of the client
    (`fund-shares.md` F2)
- **B2** REASON — the loan has a **rate**, above the broker's own cost of funds
  (`banks-funding-and-liquidity.md`), and the client pays it in cash
- **B3** REASON — the broker's balance sheet **grows** by the loan, and the loan consumes its
  capital and its liquidity (`banks-capital-and-resolution.md`)
- **B4** REASON — the **short side is financed too**: proceeds of a short are held, and stock is
  borrowed (`securities-lending.md`)
- **B5** VERIFY — the client's leverage is a read of borrowed against equity, and it must equal
  what the broker has lent

### C. MARGIN — THE CORE
- **C1** REASON — the broker sets a **margin requirement** on the whole portfolio, from its own
  view of the risk
  - C1.a it accounts for **offsetting positions**, so a hedged book requires less than the sum of
    its legs
  - C1.b it is a **decision by the broker**, not a formula the client can rely on
- **C2** REASON — the requirement is **remeasured as prices move**, and a shortfall is a **margin
  call**: real money, from the client's account, now
- **C3** REASON — the client must **meet it or be liquidated**
  - C3.a and to meet it, it may have to **sell**, into a market that must clear
    (`the-clearing-engine.md`) — which is the same forced-seller channel as `fund-shares.md` C2.b,
    arriving from the other direction
- **C4** REASON — the broker can **raise the requirement** when it likes what it sees less: worse
  markets, worse client, worse own position
  - C4.a VERIFY — raising margin into a falling market amplifies the fall. That is a consequence
    to be measured, and it is the mechanism behind most of what looks like contagion
- **C5** FORBID — **no margin that is only a number.** An unmet call must have a consequence, and
  a met call must move cash

### D. DEFAULT
- **D1** REASON — a client can **fail to meet a call**, and then the broker **closes the
  positions**, selling collateral at market prices
- **D2** REASON — the proceeds may be **less than the loan**, and the shortfall is the broker's
  loss, hitting its capital
- **D3** REASON — the liquidation is a **real sale into a real market**, so it moves prices, which
  can margin-call other clients (C4.a)
- **D4** VERIFY — the loss chain from one fund to one bank to other funds must be traceable
  party by party; a loss that stops at the fund is a broker that was never really lending

### E. CONCENTRATION
- **E1** REASON — the broker has an **exposure per client**, and it should know it
- **E2** REASON — the client's positions may be **concentrated**, so the collateral is worth less
  in liquidation than it is marked at
- **E3** REASON — A3's multi-broker case means **each broker underestimates**: the true leverage
  is the sum, and no single lender sees it
- **E4** FORBID — **no unlimited exposure.** A broker with no limit per client is a synthetic
  counterparty (`the-clearing-engine.md` B3.a)
