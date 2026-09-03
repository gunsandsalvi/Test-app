# INSTRUMENT CONTRACT: THE DERIVATIVE

Not a system — an **instrument contract**, the second after `bond.md`. Every tree whose instrument
is a derivative must satisfy all of it and say per node HOW. Cited by
`../systems/cds.md`, `../systems/interest-rate-swaps.md`, `../systems/fx-forwards-and-xcs.md` and
`../systems/commodity-futures.md`. The infrastructure they all run on — clearing, margin,
novation, netting — is `../systems/the-derivative-layer.md`, which is a system, not a contract.

**Why this file exists.** A derivative is not a claim on an issuer; it is a **bilateral obligation
between two parties, both of which can lose.** Every characteristic below follows from that one
difference, and an instrument missing any of them is not a derivative — it is a number moved
between two accounts for a reason nobody has written down.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## THE TWELVE

- **D1** REASON — **TWO NAMED COUNTERPARTIES**, and the contract is an asset to one and a
  liability to the other, at every instant
  - D1.a FORBID — **no derivative with one side.** A payoff received from nobody is invented money
  - D1.b VERIFY — Σ(mark-to-market) across all parties in a contract = 0, exactly. This is the
    invariant that distinguishes a derivative from a security
- **D2** REASON — a **NOTIONAL**, in a unit, which scales the payoff and is generally not exchanged
  - D2.a so the notional is **not the exposure**, and the two must never be conflated
- **D3** REASON — an **UNDERLYING** that is **observable and priced elsewhere**: a rate, a price,
  an index, a credit event (`../systems/the-clearing-engine.md` D1)
  - D3.a FORBID — **no underlying that only exists inside the derivative.** Then the payoff is
    unfalsifiable and the contract prices itself
- **D4** REASON — a **PAYOFF FUNCTION**: what one party owes the other as a function of D3
- **D5** REASON — a **CURRENCY** per leg, and the legs need not share one
  (`../systems/currency-and-fx.md` A3)
- **D6** REASON — **A TERM**: a start, an end, and payment dates in between
  - D6.a with a **periodicity and accrual convention** on any periodic leg (rule 9)
- **D7** REASON — a **PRICE AT INCEPTION**: the rate, spread or strike at which the two sides
  agree to enter
  - D7.a it is **cleared** from what the two sides were willing to do (rule 1), never solved for
  - D7.b many derivatives are struck **at par** — zero value at inception — and then the price IS
    the fixed rate or spread that makes it so. That is still a cleared price, and it must come out
    of a mechanism rather than out of the valuation formula run backwards
- **D8** REASON — a **MARK**: its value after inception, which moves and is not zero
  - D8.a and the mark is a **real gain to one party and a real loss to the other** (D1.b)
- **D9** REASON — **COLLATERAL AND MARGIN**: because D8 means one side is exposed to the other
  - D8/D9 together are why a derivative moves cash even when nothing has been paid on D4
  - D9.a posted collateral leaves the poster's free balance (`../systems/securities-lending.md` C4)
- **D10** REASON — **COUNTERPARTY CREDIT**: the other side can fail before the contract ends, and
  then the in-the-money party has a claim on an estate, not a payoff
  - D10.a which is why D9 exists, and why who you face is part of what the contract is worth
- **D11** REASON — **TERMINATION**: it expires, or is closed out, or is torn up — and on
  termination it **ceases to exist on both books at once**
  - D11.a early termination on default has a stated close-out value
- **D12** REASON — an **IDENTITY**: counterparties + underlying + term + strike. Two contracts on
  the same underlying with different strikes are two contracts

---

## WHAT A DERIVATIVE IS NOT

- FORBID — **it is not a holding.** It does not go in the issued-amount check
  (`../systems/the-register.md` B2) because nobody issued it; it goes in the zero-sum check (D1.b)
- FORBID — **it is not a way to get an exposure for free.** The cash it moves — margin, premium,
  periodic payments — is real and comes out of a real account
- FORBID — **it is not a substitute for the underlying market.** If the derivative's price is
  computed from a model and the cash market's price is computed from the derivative, neither has
  been cleared and rule 1 is broken in a loop
