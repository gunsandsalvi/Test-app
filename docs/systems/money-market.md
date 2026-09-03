# SYSTEM: THE MONEY MARKET

Where a bank funds its reserve position: the interbank market, repo, and the central bank's
corridor around them. The system §3.20-LLR is about. Excludes the central bank's policy choices
(its own system) and the collateral's own valuation (the sovereign and credit trees).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments.

### A. THE NEED
- **A1** REASON — a bank's reserve position moves because **its customers paid other banks'
  customers**. Nobody decided it; it is the residue of everyone else's week
  - A1.a in aggregate the system's reserves are unchanged — they are **redistributed**
  - A1.b therefore one bank's deficit **is** another's surplus, by construction, and the market
    has two sides without anybody being assigned one
- **A2** REASON — a bank holds a position for its own reasons
  - A2.a **the buffer is a PREFERENCE derived from its own liabilities' liquidity, not a stated
    ratio** *(user: "A.2.a you choose")*. I choose derived: a bank whose funding is overnight
    household money needs more than one funded by term wholesale, and a single constant applied to
    every bank is the thing rule 4 forbids and §3.30b already names as the largest stated shape
    still moving cash. A regulatory floor may sit UNDER the preference; it is not the preference
  - A2.b VERIFY — missing it has a cost the bank can feel, or the buffer is decoration
- **A3** REASON — **the need is knowable only AFTER the day's flows**
  - A3.a therefore the market must clear after them. A session held before the flows is a session
    that cannot see the thing it exists to fund

### B. THE MARKET
- **B1** REASON — **every bank posts a schedule out of its own position and its own cost of funds.
  Who ends up lending and who ends up borrowing is the OUTCOME** *(user: "B1/B2 again not imposed,
  a consequence")*. Writing "surplus banks lend, deficit banks borrow" as a rule is assigning the
  answer: it licenses code that moves cash from a computed surplus to a computed deficit without
  anybody quoting a rate, which is rule 1's defect in the funding market
- **B2** REASON — **unsecured lending prices the borrower's name.** The lender has a view on
  getting it back, and that view is in its schedule
  - B2.a a name the market doubts pays more, **or finds no bid at all** — and refusal is a real
    outcome of a real schedule, not a special case
  - B2.b VERIFY — the spread between the strongest and weakest name is a measure of stress
- **B3** REASON — **secured lending (repo) prices the collateral, not only the name**
  - B3.a eligibility is defined per asset, and something is ineligible
  - B3.b haircuts by asset and tenor
  - B3.c pledged collateral is **encumbered** — it cannot be pledged twice, and running out of it
    is how a solvent bank stops being able to borrow
- **B4** REASON — a rate **clears** from those schedules meeting each other
- **B5** REASON — non-bank cash is in the same market: money funds, corporates, institutions
  - B5.a their alternative is the central bank's floor (C1) or bills directly — see the sovereign
    tree's E2.f
- **B6** REASON — tenor: overnight and term, each with its own book
  - B6.a VERIFY — the term/overnight spread is information about expected stress, not a parameter
- **B7** REASON — **the market can fail to clear for a name.** That is what a funding squeeze IS,
  and it must be representable

### C. THE CORRIDOR
- **C1** REASON — a **floor**: the central bank pays on reserves, or takes cash at a window
  - C1.a cash parked there **leaves the banking system** — a real consequence, not a bookkeeping
    move
- **C2** REASON — a **ceiling**: a standing facility that lends
- **C3** VERIFY — the market rate sits inside the corridor; its width is a policy choice
- **C4** REASON — the facility is **collateralised** and **priced above the market**
  - C4.a so a bank prefers the market, and **drawing the facility is information**
  - C4.b a bank out of eligible collateral **cannot draw** — the constraint has to bite
- **C5** FORBID — **there is no uncollateralised, unpriced, unlimited central-bank credit.** A
  facility with none of Bagehot's conditions is not a lender of last resort; it is a subsidy that
  makes B7 and D unreachable

### D. WHEN A NAME CANNOT FUND
- **D1** REASON — it **shrinks**: it sells assets, at whatever they fetch, and the sale is a real
  order in a real book
- **D2** REASON — it **bids up for deposits**, and depositors respond to the rate
- **D3** REASON — it draws the facility, at the penalty, against collateral
- **D4** REASON — it **fails** — and failure for liquidity is a distinct event from failure for
  solvency, with a distinct trigger
- **D5** REASON — a **run**: depositors withdraw because they observe weakness
  - D5.a what they observe must be **observable** — a published ratio, a facility draw, a rate paid
  - D5.b VERIFY — a run is self-reinforcing, and the model should be able to show one
- **D6** REASON — the lender of last resort lends **freely, against good collateral, at a penalty,
  to the solvent**. All four. Drop one and C5 is violated

### E. TRANSMISSION
- **E1** REASON — the policy rate reaches the economy **through this market** and not by assertion
- **E2** VERIFY — a squeeze here raises funding costs elsewhere; it is a channel, not a scalar
- **E3** REASON — interbank exposure is a **contagion** path: a failure lands on its lenders by name

---

## 2. THE MAPPING

*(unmapped — this file's first commit is the required tree alone)*

---

## 3. THE DIFF

*(unmapped)*
