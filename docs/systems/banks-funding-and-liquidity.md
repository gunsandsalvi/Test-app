# SYSTEM: BANKS — FUNDING AND LIQUIDITY

A bank's liability side and its cash position: who funds it, on what terms, how quickly they can
leave, and what it does when they do. **This is the system §3.20-LLR is about.** The market it
transacts in is `money-market.md`; this tree is the bank's own side of it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHO FUNDS IT
- **A1** REASON — **deposits**, and they are not one thing
  - A1.a **retail/household**: many, small, sticky, and insured up to a limit
  - A1.b **corporate**: fewer, larger, operational — a firm banks where it transacts
  - A1.c **institutional/wholesale**: few, very large, and **rate-sensitive**
  - A1.d VERIFY — stickiness differs by class, and it is the whole of liquidity risk. A model with
    one deposit type cannot have a run
- **A2** REASON — **wholesale borrowing**: interbank, repo, commercial paper it issues
  - A2.a short, and it **rolls** — which is where a funding squeeze bites
- **A3** REASON — **capital**: equity and subordinated debt, which do not run
- **A4** REASON — **the central bank**, on the corridor's terms (`money-market.md` C)
- **A5** REASON — each source has a **price**, and the prices differ, and the mix is a decision

### B. THE COST OF FUNDS
- **B1** REASON — the bank **pays a rate on each source**, and it is a real payment to a real holder
  - B1.a a deposit rate the bank **sets**, and depositors respond to
  - B1.b a wholesale rate the **market** sets
- **B2** REASON — its **blended cost of funds** is a read of B1 across the mix
  - B2.a which feeds `banks-lending.md` C1.a — the link between the two sides
- **B3** REASON — **net interest margin** is what it earns minus B2, and it can be negative

### C. THE LIQUIDITY POSITION
- **C1** REASON — the bank holds **liquid assets**: reserves, and securities it can sell or pledge
  - C1.a they differ in how fast and how surely they convert — a haircut and a market depth
- **C2** REASON — it holds them against **what could leave**, and that is A1.d's stickiness
  - C2.a a **buffer preference derived from its own liabilities**, not a stated ratio
    (`money-market.md` A2.a)
- **C3** REASON — **maturity transformation is the business**: it funds long assets with short
  liabilities, and that gap is why it earns anything
  - C3.a VERIFY — the gap is measurable, and a bank with none is not a bank
- **C4** VERIFY — its position is the **residue of everybody else's week** — customers paying
  customers of other banks. It did not choose it

### D. WHEN THE POSITION IS SHORT
- **D1** REASON — it **borrows in the market**, secured or unsecured (`money-market.md` B)
- **D2** REASON — it **sells or pledges** liquid assets — a real order in a real book
- **D3** REASON — it **bids up for deposits**, and pays for them
- **D4** REASON — it **shrinks its assets**: it stops lending, and lets the book run off
  - D4.a which transmits a funding problem into `banks-lending.md` C3 — this is the credit crunch
- **D5** REASON — it draws the **central bank facility**, collateralised and at a penalty
- **D6** REASON — **it can fail to fund itself**, and that is a distinct failure from insolvency
  - D6.a FORBID — **there is no unbounded, uncollateralised, unpriced credit line that makes D6
    unreachable.** A facility with none of Bagehot's conditions does not bound anything; it
    deletes the entire branch above it, and with it the reason C2 exists

### E. THE RUN
- **E1** REASON — depositors **can leave**, and the ones in A1.c leave fastest
- **E2** REASON — they leave **because they observe something**
  - E2.a and what they observe must be **observable**: a capital ratio, a facility draw, a rate
    paid up, a rating action
- **E3** REASON — leaving **forces D2 and D4**, which produce more of E2.a
  - E3.a VERIFY — the loop is self-reinforcing, and the model should be able to show one
- **E4** REASON — **deposit insurance** breaks the loop for A1.a and not for A1.c
  - E4.a which is why a run is a wholesale phenomenon first
- **E5** REASON — a run at one bank is **information about others**, through E2.a

### F. WHAT IT REPORTS
- **F1** REASON — its **deposit lines by class**, as reads of who actually banks there
- **F2** REASON — its **reserve balance**, as a read of its account
- **F3** VERIFY — assets = liabilities + equity, in the bank's own money, every week
- **F4** REASON — a **liquidity metric** somebody outside can see (E2.a's input)
