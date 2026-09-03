# SYSTEM: SOVEREIGN CREDIT

A government borrows in its own money. Bills and bonds issued by a treasury, held by somebody,
and the benchmark everything else is priced against. Excludes the central bank's own conduct
(its own system) but the boundary with it is branch H.

Node types, per `README.md`: **REASON** (a thing that must exist and cannot be short-circuited),
**VERIFY** (a thing to measure, never to enforce), **FORBID** (a thing that must be absent).

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments before
any mapping — the revisions are recorded per node so the review is auditable.

### A. THE BORROWER
- **A1** REASON — a fiscal authority with revenue and outlays
  - A1.a revenue by base — income, consumption, corporate, payroll — each with a **payer who
    remits it**, never a rate applied to an aggregate
  - A1.b outlays by kind — purchases, transfers, public wages, interest — each with a **payee**
  - A1.c VERIFY — the deficit is the residual of A1.a and A1.b and is never itself a target
- **A2** REASON — **ISSUANCE IS MANAGED TO COVER OUTLAYS** *(user: "state debt issuance needs to
  be managed to cover outlays")*. The treasury has a funding plan: it knows its need, it chooses a
  size and a tenor mix against it, and it issues ahead of the money leaving
  - A2.a the need is the deficit **plus** redemptions falling due
  - A2.b the plan is made BEFORE the outlay, not after the account is empty
  - A2.c the tenor mix is a real choice with a real cost — short is cheap and rolls, long is dear
    and does not
- **A3** REASON — it has one account and every payment leaves it
  - A3.a the account can be **empty**, and that is a real event with a real consequence
  - A3.b FORBID — **there is no central-bank overdraft** *(user: "no overdraft with the central
    bank")*. A treasury that has not funded itself has failed to fund itself; an automatic advance
    converts a fiscal failure into an accounting entry and deletes the reason A2 exists
- **A4** REASON — **it cannot be compelled to pay.** Default is a choice
  - A4.a willingness to pay is a variable, not a constant
  - A4.b in its own money it can always create more; in someone else's it cannot — and that
    distinction is the whole of sovereign credit risk

### B. THE INSTRUMENT
- **B1** REASON — a tranche with terms fixed at issuance: principal, maturity, coupon, currency
  - B1.a a **bill** accretes to par and pays no coupon; a **bond** pays coupons. Different
    instruments, not one with a flag
  - B1.b the currency is its own or another's — see A4.b
- **B2** REASON — counted in units of par
- **B3** REASON — fungible within a benchmark line
  - B3.a a **re-opening** adds to an existing line rather than creating a new one
- **B4** FORBID — **no seniority. All of it is pari passu.** *(deliberately unlike corporate: this
  is not a missing feature, it is what a sovereign is)*
- **B5** FORBID — **no covenants and no acceleration.** Nothing to breach, nothing to accelerate
- **B6** REASON — an identity a market would use: issuer + tenor + maturity

### C. THE CALENDAR AND THE AUCTION
- **C1** REASON — issuance is **announced before it happens**, in a size
  - C1.a the calendar is public ahead of the auction, which is what lets bidders prepare
  - C1.b the size is the issuer's choice out of A2
- **C2** REASON — **a uniform-price single-round sealed-bid auction** *(user: "C2 you chose" — I
  choose uniform price)*. Every winning bidder pays the stop-out. Chosen because it is what most
  sovereigns now run for bills and bonds, because it removes the winner's-curse adjustment a
  multiple-price auction forces every bidder to make, and because it needs exactly one cleared
  number — which is what rule 1 already wants from every book here
- **C3** REASON — **primary dealers with an obligation to bid**, in exchange for privileges
  - C3.a this obligation — **not** a central-bank backstop — is why a sovereign auction
    technically cannot fail
  - C3.b the obligation has a cost: the dealer must bid, and may bid badly, and wears it
- **C4** VERIFY — the **tail** (stop-out vs average) and the **cover ratio** are the information
  the market reads out of an auction
- **C5** REASON — weak demand resolves as a **higher yield**, or as the issuer **cutting the size**
- **C6** REASON — proceeds reach the treasury's account
- **C7** REASON — paper nobody bid for is withdrawn, or taken by dealers at the stop-out

### D. THE SECONDARY MARKET AND THE CURVE
- **D1** REASON — it trades: a **price** per unit
- **D2** REASON — the yield is **derived** from the price and never sets it
- **D3** REASON — the curve is a fit through **observed** points
  - D3.a one owner of the curve
  - D3.b a tenor's point is a trade, or is interpolated **and labelled as interpolated**
- **D4** REASON — it is **the benchmark**: other credit is priced as a spread to it
- **D5** REASON — it is repo collateral, at the smallest haircut of any asset
- **D6** VERIFY — **the bid-offer is a consequence, not a prior** *(user)*. Depth, competition
  between dealers and the size of the float produce it; that sovereign spreads come out tightest
  is something to MEASURE, and a stated tight spread would be assuming the liquidity this system
  is supposed to generate

### E. THE HOLDERS
- **E1** REASON — a register: who holds how much of **which line**
- **E2** REASON — holder classes hold for **different reasons**, which is what gives an auction two
  sides
  - E2.a banks — the regulatory liquidity buffer (and E5 is why)
  - E2.b insurers and pensions — duration against their own liabilities
  - E2.c the central bank — monetary policy (branch H)
  - E2.d foreign official — reserves
  - E2.e funds — relative value
  - E2.f **households and corporates, holding it DIRECTLY** *(user: "households and corporates, an
    alternative to MMF")*. A saver's choice between a money fund and the bills the fund would have
    bought is a real substitution, and it is the channel by which a policy rate reaches a
    depositor who is not a bank's customer
- **E3** REASON — marked at the cleared price
- **E4** REASON — pledgeable, at a haircut
- **E5** REASON — a zero risk weight, which is *why* E2.a holds it at all

### F. THE LIFE
- **F1** REASON — coupon accrues to the holder of record and is paid to whoever holds it on the date
- **F2** REASON — a bill **accretes**; its return is the discount
- **F3** REASON — principal repaid at maturity out of A3
- **F4** REASON — refinancing: the issue that funds the redemption, at whatever the market charges
- **F5** REASON — **buybacks and switches** *(user: "F5 good")*. The issuer manages its own curve:
  buying in an illiquid old line and switching holders into a benchmark is a real operation and a
  real cost, and it is part of A2's management

### G. WHEN IT GOES WRONG
- **G1** VERIFY — in its own money the failure mode is **inflation**, not default
- **G2** REASON — in a foreign money it can genuinely default
- **G3** REASON — a default is selective and negotiated. **There is no estate** — nothing to seize
- **G4** REASON — restructuring by exchange offer, with holdouts
- **G5** REASON — the consequence is exclusion from the market, not liquidation

### H. THE MONETARY BOUNDARY
- **H1** REASON — the central bank buys sovereign paper as policy, in a size **it** chooses
- **H2** REASON — the purchase **creates reserves**; the base grows
- **H3** REASON — the coupon on its holding returns to the treasury as remittance
- **H4** REASON — monetary financing vs open-market operations is a **policy** constraint, not a
  mechanical one — and A3.b is where this model draws it
- **H5** VERIFY — debt held by the central bank is economically consolidated away and
  accounting-wise is not, and both statements must remain true of the books

---

## 2. THE MAPPING

*(unmapped — this file's first commit is the required tree alone)*

---

## 3. THE DIFF

*(unmapped)*
