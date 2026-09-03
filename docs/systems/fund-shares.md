# SYSTEM: FUND SHARES

A fund is a party that holds assets and issues claims on itself. The claim is the fund share; its
value is a read of the portfolio; and the fact that holders can create and redeem it is what makes
a fund different from a firm. Covers ETFs, mutual funds and money market funds — the vehicle is
one system, the mandates differ.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A FUND IS
- **A1** REASON — a **named party** with an account and a register of holdings
  (`the-register.md`)
- **A2** REASON — its **liability is its shares**, held by named holders
- **A3** REASON — its **equity is zero by construction**: assets − liabilities = 0, because the
  holders own the assets. A fund with equity has mislaid somebody's money
- **A4** REASON — it has a **mandate**: what it may hold, and the mandate is a real constraint on
  what it buys, not a label
  - A3/A4 together are why the fund is a **transmission channel**: a flow into the fund becomes a
    purchase of what the mandate allows

### B. NET ASSET VALUE
- **B1** REASON — **NAV = (assets at market − liabilities) / shares outstanding**, a read, every
  time, never a stored series (rule 3)
- **B2** REASON — the assets are marked at **cleared prices** (`the-clearing-engine.md` D4)
  - B2.a so a stale price makes a stale NAV, and somebody transacts on it — that is a real
    transfer between holders, not a rounding
- **B3** REASON — **fees accrue** and are paid to the manager, and they reduce NAV
- **B4** VERIFY — the sum of holders' share value = the fund's asset value − its liabilities,
  exactly (A3)

### C. CREATION AND REDEMPTION
- **C1** REASON — a **subscription** gives the fund cash and the holder new shares at NAV
  - C1.a and the fund must then **buy something** with the cash, per its mandate
- **C2** REASON — a **redemption** takes shares back and pays the holder cash at NAV
  - C2.a and the fund must **find the cash**: from its buffer, or by selling
  - C2.b selling is a trade into a market that must clear, at whatever price it clears
    (`the-clearing-engine.md`) — this is the forced-seller channel, and it is the point
- **C3** REASON — the shares outstanding **change**, so a fund is not fixed-size
- **C4** REASON — there is a **timing mismatch**: the holder is paid at today's NAV, the sales
  happen at tomorrow's prices, and the difference falls on the remaining holders
  - C4.a which is why a redemption is a real cost to those who stay, and why runs are a thing
- **C5** VERIFY — Σ shares created − Σ redeemed = shares outstanding, and cash in/out matches

### D. THE MONEY FUND SPECIFICALLY
- **D1** REASON — a mandate of **short, high-quality paper** (`short-term-debt.md`,
  `money-market.md`)
- **D2** REASON — it is a **substitute for a deposit**, and that is its whole economic role: a
  saver chooses between a bank deposit, a money fund and bills directly
  (`households.md` D5.a, user 2026-09-03: "households and corporates, an alternative to MMF")
  - D2.a so its yield competes with the deposit rate, and the competition is a real constraint on
    what banks pay (`banks-funding-and-liquidity.md` C)
- **D3** REASON — it is a **buyer in the short-term market**, and its size determines how much
  paper can be placed
- **D4** FORBID — **no guaranteed constant NAV.** If the assets fall, the NAV falls; a fund that
  cannot break is a fund with a hidden guarantor, and the guarantor is nobody
- **D5** VERIFY — flows into money funds should rise when their yield beats deposits, as a
  consequence of D2, never as an imposed allocation

### E. THE EXCHANGE-TRADED FUND SPECIFICALLY
- **E1** REASON — its shares **trade** on a market, at a price that clears
  (`the-clearing-engine.md`)
- **E2** REASON — so it has **two values**: the traded price and the NAV, and they are different
  numbers
- **E3** REASON — the gap is **arbitrageable**: somebody can create or redeem against the basket
  and pocket the difference
  - E3.a which is a REASON for a participant, not a rule tying the two — the gap closes because
    somebody trades, and it can persist when they will not
- **E4** VERIFY — the premium/discount is a read of two prices; a persistently large one is a
  finding about liquidity, never a number to clamp

### F. WHAT THE FUND IS NOT
- **F1** FORBID — **a fund does not create its assets.** Every holding is bought from a named
  seller at a cleared price
- **F2** FORBID — **no leverage without a lender.** A fund that holds more than it raised has
  borrowed from somebody named (`prime-brokerage.md`)
- **F3** REASON — the **manager is a separate party** that earns the fee; the fee is its income
  and the fund's cost
