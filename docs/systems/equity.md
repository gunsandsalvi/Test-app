# SYSTEM: EQUITY

The residual claim on a firm: shares, their price, their holders, what the firm does with them and
what the holder gets. Excludes the firm's operations (its own system) and fund shares — an ETF or
MMF unit is a claim on a portfolio, not on a firm, and is its own tree.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A SHARE IS
- **A1** REASON — a **residual claim**: what is left after every other claim is paid
  - A1.a it therefore ranks **below all debt** — the waterfall in `corporate-credit.md` G5 ends here
  - A1.b its value can be **zero and not negative**: limited liability is a real property
- **A2** REASON — counted in **SHARES**, a unit that is not money
  - A2.a a **share count** that changes only by a named event (A5, D, E)
- **A3** REASON — a **CURRENCY** it is quoted in — the issuer's own money
- **A4** REASON — it is **PERPETUAL**: no maturity, no redemption. Unlike every node of
  `../instruments/bond.md`, and the reason equity is a different instrument rather than a long bond
- **A5** REASON — **CONTROL** rides with it: a vote per share
  - A5.a which makes a majority a thing that can be **bought** — see `m-and-a`
  - A5.b VERIFY — control has a value distinct from the cash flows, and a takeover pays for it
- **A6** REASON — an **IDENTITY** a market would use: a ticker and a name

### B. THE PRICE
- **B1** REASON — holders and buyers **post schedules**; who trades is the outcome
- **B2** REASON — **a PRICE clears** per share, per period, from B1 meeting B1
- **B3** FORBID — **the price is never derived from an earnings multiple, a book value, a DCF or a
  target.** Those are opinions HELD BY participants that enter their schedules; a price computed
  from one is the opinion restated, not a market
- **B4** REASON — **market capitalisation is a READ**: shares × price. Never a stored number
  - B4.a FORBID — nothing may compare market cap against shares × price and call it a check. That
    is a tautology and cannot fail
- **B5** REASON — a **dealer or market maker** intermediates out of inventory and capital, and
  earns the spread it quotes
- **B6** VERIFY — a seller with no buyer keeps its shares; there is no invisible bid

### C. THE HOLDER
- **C1** REASON — a **register**: who holds how many shares
  - C1.a VERIFY — Σ held = shares outstanding, always
  - C1.b the **free float** is what is genuinely tradeable — insiders and strategic holders are not
- **C2** REASON — holder classes hold for **different reasons**, which is what gives two sides
  - C2.a **households**, directly
  - C2.b **institutions** with mandates — and a mandate is a constraint, not a preference
  - C2.c **index funds**, which do not price at all: they hold weight, whatever it costs
  - C2.d **the issuer itself**, via treasury shares (D2)
  - C2.e **insiders and founders**, whose holding is not for sale
- **C3** REASON — marked at the cleared price; value is shares × price
- **C4** REASON — the change in the mark is **P&L reaching the holder's income**
- **C5** REASON — a leveraged holder **funds** the position and can be **forced to sell**
  - C5.a margin, and a call on it — the link to `money-market.md` D1
- **C6** REASON — it can be **lent** (see `securities-lending.md`) and **pledged**, at a haircut
- **C7** REASON — a **short** position is possible, is a borrow, and has a real cost and a real
  squeeze risk

### D. WHAT THE FIRM DOES WITH IT
- **D1** REASON — **ISSUANCE**: the firm sells new shares for cash
  - D1.a it **dilutes** existing holders — the share count rises and each claim shrinks
  - D1.b it is a **decision with a reason**: a funding need it prefers to meet with equity
  - D1.c it is **priced by the market**, at a discount the market demands, and can **fail**
- **D2** REASON — **BUYBACK**: the firm buys its own shares for cash
  - D2.a the count **falls**; each remaining claim grows
  - D2.b the cash is **gone** — a buyback is a distribution, not an investment
  - D2.c it competes with D3 and with real investment, and the choice has a reason
- **D3** REASON — **DIVIDEND**: cash paid per share to whoever holds it on a date
  - D3.a it leaves the firm and arrives at named holders
  - D3.b it is a **decision**, and cutting it is an event other participants react to
- **D4** REASON — a **split** changes the count and not the value, and must not change anything else

### E. CORPORATE EVENTS
- **E1** REASON — **M&A**: shares bought for cash, for stock, or for both (see `m-and-a`)
- **E2** REASON — a **spin-off**: a new share line, and a claim divided
- **E3** REASON — **DELISTING / TAKE-PRIVATE**: the line stops trading and the register is bought out
- **E4** REASON — **INSOLVENCY**: equity is **wiped before any creditor takes a loss** (A1.a), and
  the register goes to zero rather than to a recovery

### F. WHAT THE HOLDER IS ENTITLED TO
- **F1** REASON — the **dividend** when declared (D3)
- **F2** REASON — the **residual on wind-up**, after every other claim (A1)
- **F3** REASON — a **vote** (A5)
- **F4** FORBID — **no entitlement to earnings that were not distributed.** Retained earnings raise
  the claim's value through B2 and reach the holder only on sale or on F1/F2 — never as income
  credited to a holder who did not receive cash

### G. THE AGGREGATE
- **G1** REASON — an **index** built from real prices and real free-float weights (C1.b)
- **G2** VERIFY — the index is a read of its constituents and cannot move independently of them
- **G3** VERIFY — a derived statistic (P/E, dividend yield, book-to-market) is computed from the
  cleared price and never used to set it — B3 again, at the aggregate
