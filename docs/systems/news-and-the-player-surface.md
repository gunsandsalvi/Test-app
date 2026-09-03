# SYSTEM: NEWS AND THE PLAYER SURFACE

What the world exposes to somebody looking at it: prints, events, positions, and the actions that
can be taken. It is the last tree because it depends on all the others — but it is a required tree
and not a presentation detail, because **what can be observed and what can be acted on are part of
the model.**

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT AN OBSERVER CAN SEE
- **A1** REASON — **prints**: prices that cleared, with their instrument, time and unit
  (`the-clearing-engine.md` E1)
  - A1.a and a **stale mark must be visibly stale** (`the-clearing-engine.md` E4): a screen that
    shows a price without saying when it traded is misinformation
- **A2** REASON — **its own positions and balances**, exactly as the register and the accounts hold
  them (`the-register.md` D1, `money-and-settlement.md`)
- **A3** REASON — **public state**: what an issuer has published, what a central bank has decided,
  what a rating agency has said (`ratings-and-assessment.md` A1)
- **A4** FORBID — **no observer sees another party's private state.** Positions, intentions and
  limits are private, and a surface that exposes them makes the market a solved game
- **A5** REASON — **aggregates that are genuinely published** — indices, official statistics
  (`indices.md`) — with the lag and the revision that real statistics have
  - A5.a a statistic available instantly and exactly is not a statistic, it is the model's
    internals

### B. WHAT AN EVENT IS
- **B1** REASON — a **change of state that somebody would notice**: a default, a downgrade, a
  policy move, a large print, a failed auction (`the-clearing-engine.md` C4.b)
- **B2** REASON — it **describes something that actually happened in the state**, and it is
  generated FROM the state
  - B2.a FORBID — **news never causes anything.** An event that moves a price directly is an
    exogenous shock with a headline attached; the price moves because participants acted
    (`the-clearing-engine.md`), and the event is the report of it
- **B3** REASON — it has a **time and named subjects**, so it can be checked against the state
- **B4** REASON — it can be **wrong or incomplete** in the same way real reporting is, but it may
  never be **invented**

### C. WHAT AN ACTOR CAN DO
- **C1** REASON — the actions available are the ones **any participant has**: post a schedule,
  trade, lend, borrow, hedge, hold
  - C1.a acting means **entering a market that must clear** — the price is not the actor's to set
    (`the-clearing-engine.md` C2)
- **C2** REASON — an action **requires the means**: cash in the right currency, the holding to
  sell, the borrowing capacity, the collateral
  - C2.a FORBID — **no privileged actor.** Nobody transacts without the balance, outside the
    mechanism, or at a price that did not clear. A surface that lets its user do so is measuring a
    different world from the one it is displaying
- **C3** REASON — an action has **consequences that propagate** exactly like anyone else's
- **C4** REASON — the actor is a **named party in the register and the accounts**, and it appears
  in every audit family like the rest (`the-audit.md`)

### D. THE RECORD
- **D1** REASON — a **history** that is a read of what happened, not a separate log that can drift
  (rule 3)
- **D2** REASON — **performance is computed from real positions and real prices**, so it can be
  bad
- **D3** VERIFY — anything shown must be reproducible from the state; a number on the surface with
  no derivation behind it is a number invented for display

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no display-only number.** If it is worth showing it is worth deriving, and if
  it cannot be derived it must not be shown
- **E2** FORBID — **no scripted narrative.** A sequence of events written in advance is rule 4's
  defect at the level of the whole world
- **E3** FORBID — **no surface that changes the model.** Observing must not move anything; if
  looking at a market changes it, every measurement in this atlas is contaminated
