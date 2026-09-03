# SYSTEM: SHORT-TERM DEBT

Paper issued for months, not years: treasury bills, commercial paper, certificates of deposit.
Different from the money market (`money-market.md`, which is secured and unsecured *lending*
between banks) because this is a **security** — issued, registered, traded and held by anyone.
Different from `corporate-credit.md` only in tenor, and the tenor changes everything about why it
exists.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE INSTRUMENT
- **A1** REASON — it satisfies the bond contract (`../instruments/bond.md`), answering these nodes
  its own way:
  - A1.a **N5 coupon** — usually none: it is issued at a **discount** and redeems at par, and the
    discount is the whole return
  - A1.b **N4 maturity** — under a year, typically weeks to months
  - A1.c **N11 seniority** — senior unsecured, ranking with the issuer's other senior debt
  - A1.d **N13 optionality** — none. It is too short to be worth an option
- **A2** REASON — its **price** is what it clears at, and the yield is derived from price and days
  to maturity (rule 1)
  - A2.a on a stated day-count and quoting convention, because at this tenor the convention is a
    material part of the number (rule 9)
- **A3** REASON — there are **types by issuer**: the state (bills), a bank (CD), a firm (CP), and
  the type is the credit

### B. WHY AN ISSUER ISSUES IT
- **B1** REASON — to fund a **short, known need**: a tax date, a seasonal working-capital swing,
  a bridge to a term issue
- **B2** REASON — because it is **cheap** when the curve is upward-sloping
- **B3** REASON — **and it must be rolled.** That is the price of B2, and it is the whole risk
  - B3.a a rollover is a **new issue into a market that must clear**
    (`the-clearing-engine.md` C4): the issuer is asking the market to lend again, and it may not
  - B3.b so a run is possible: buyers decline, the issuer must repay maturing paper out of cash
    it does not have, and it must find the money somewhere (`banks-funding-and-liquidity.md` E)
- **B4** REASON — the issuer therefore keeps a **backstop** — a committed bank line, a liquid
  buffer — and the backstop costs money in every week it is not used
- **B5** VERIFY — the **maturity profile** of outstanding paper is a read, and a concentrated
  profile is a foreseeable wall

### C. WHY A BUYER BUYS IT
- **C1** REASON — a **cash investor with a horizon**: a money fund, a corporate treasurer, a bank
  liquidity book (`fund-shares.md` D, `insurers-and-pensions.md`)
- **C2** REASON — the reasons are **yield against the alternatives** — a deposit, a repo, the
  central bank's facility — and **credit** and **liquidity**
  - C2.a which makes short-term debt a real substitute for a deposit, and therefore one of the
    channels a policy rate travels down (`households.md` D5.a)
- **C3** REASON — a buyer has a **limit per issuer**, and the limit is why a deteriorating issuer
  loses funding before it loses solvency
- **C4** VERIFY — when the policy rate moves, the bill yield should move with it, because the
  buyers' alternative moved — not because a rule ties them

### D. TRADING AND PRICING
- **D1** REASON — it **trades** after issue, at a cleared price, so a holder can get out early
- **D2** REASON — its price responds to **the level of short rates and the issuer's credit**, and
  at this tenor the first dominates until the second is in doubt, at which point it inverts
- **D3** REASON — it is **collateral** (`money-market.md`, `securities-lending.md`), with a
  haircut, which is a large part of why anyone holds it
- **D4** VERIFY — a spread over the equivalent-tenor bill is a **derived read** of two cleared
  prices, never a stored number

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no automatic roll.** Paper that always rolls at a written rate is not debt; it
  is a permanent liability with a coupon, and it removes the only risk the instrument has
- **E2** FORBID — **no price without a market.** A discount computed from a curve nobody traded is
  rule 1's defect at the short end
- **E3** FORBID — **no negative outstanding**, and no maturity that passes without cash moving
