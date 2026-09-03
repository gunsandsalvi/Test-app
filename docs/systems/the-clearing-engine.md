# SYSTEM: THE CLEARING ENGINE

The mechanism every market in this world shares: participants post what they will do at what
price, the mechanism finds where those meet, and what comes out is a price and a set of trades.
Rule 1 lives here — *every price is cleared* — so this tree is the contract each market tree
(`corporate-credit.md`, `equity.md`, `goods.md`, `fx-spot.md`, …) is measured against.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A MARKET IS
- **A1** REASON — a market is **two or more parties with different reasons** to want the same
  thing at different prices
  - A1.a the differences are the market; identical participants have nothing to trade
- **A2** REASON — each participant posts a **schedule**, not a point: how much at each price
  - A2.a because a single number cannot answer "and if it were cheaper?", which is the only
    question the mechanism asks
- **A3** REASON — the schedule comes from the participant's **own state**: its position, its cost
  of funds, its mandate, its view, its constraints
- **A4** FORBID — **no participant is a price-taker of a price this mechanism has not yet
  produced.** A schedule written against the clearing price is the answer smuggled into the input

### B. WHO IS IN THE ROOM
- **B1** REASON — the participants are **named parties** with balance sheets that will actually
  change
- **B2** REASON — a party is present **because it has a reason to be**: a maturity to roll, a
  mandate to fill, an inventory to shed, a view
- **B3** REASON — a **dealer** may be there, and its reason is inventory and spread
  (`dealer-desks.md`), which is a reason like any other
  - B3.a it has a **limit**: capital, risk, inventory. A dealer without a limit is a synthetic
    counterparty wearing a dealer's name
- **B4** FORBID — **no buyer of last resort by construction.** No participant exists whose
  schedule is "whatever is left, at whatever price". The central bank is a participant with a
  policy reason and a stated facility (`the-central-bank.md` D), never a residual absorber
- **B5** FORBID — **the mechanism does not add demand to make itself clear.** If it did, the
  price it produces is a fixed point of its own patch, and rule 1 is satisfied in letter only

### C. THE CLEARING
- **C1** REASON — the mechanism finds the price where **posted supply meets posted demand**
- **C2** REASON — the price is **discovered, not assigned** — it is a root of the schedules, and
  changing an input must be able to change it
- **C3** REASON — quantity is **rationed** when the two sides are unequal at the clearing price,
  by a stated rule (pro rata, priority, time)
- **C4** REASON — **it can fail to clear.** No overlap is a real outcome
  - C4.a a failed auction has consequences: the issuer does not get its money, the seller keeps
    its inventory, the maturity is not rolled — and those consequences propagate
  - C4.b failure must be **representable and observable**, not an exception path that quietly
    substitutes a price
- **C5** VERIFY — the clearing price is a **function of the schedules alone**; feed the same
  schedules twice and get the same price

### D. WHAT COMES OUT
- **D1** REASON — a **price**, in a stated unit, for a stated instrument, at a stated time
  - D1.a price is the primitive; yield, spread, OAS, discount margin are **derived from it**
    (rule 1), and never the other way round
- **D2** REASON — a set of **trades**, each with two named sides and a quantity
- **D3** REASON — the trades hit the **register and the accounts** in the same pass (rule 14,
  `the-register.md` C3)
- **D4** REASON — the price becomes the **mark** for everyone holding that instrument, and the
  revaluation is real money to somebody
- **D5** VERIFY — Σ bought = Σ sold, and Σ cash paid = Σ cash received, per clearing

### E. THE PRINT AND WHAT IT MEANS
- **E1** REASON — the price is **public**: other participants and other markets can see it
- **E2** REASON — one market's print is another's **input** — a bond print moves a CDS, an equity
  print moves a merger, a policy rate moves everything (`the-derivative-layer.md`, `indices.md`)
- **E3** REASON — the **bid–offer is a consequence** of what dealers post, read off the schedules;
  it is never a prior applied to a mid
- **E4** VERIFY — a market with no trades has **no new print**, and the stale mark must be visibly
  stale rather than silently refreshed

### F. ORDER AND TIME
- **F1** REASON — a market clears at a **stated point in the week**, and what it can see is what
  has already happened
  - F1.a a market that needs a number produced later in the same week is in the wrong place —
    that is an ordering defect, and the fix is the order, not a forward reference
- **F2** REASON — a **rate in force for the week is one rate**: a participant cannot value at one
  and settle at another (see `currency-and-fx.md` D)
- **F3** VERIFY — moving a market earlier or later changes results; if it does not, it is not
  reading anything the rest of the week produces
