# SYSTEM: THE DERIVATIVE LAYER

The infrastructure every derivative runs on: how a trade becomes an obligation, who stands between
the two sides, what margin moves, and what happens when a party fails. The contract common to the
instruments is `../instruments/derivative.md`; the individual instruments are `cds.md`,
`interest-rate-swaps.md`, `fx-forwards-and-xcs.md` and `commodity-futures.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHY THE LAYER EXISTS
- **A1** REASON — a derivative is a **long-lived bilateral obligation**
  (`../instruments/derivative.md` D1), so the two sides remain exposed to each other for years
- **A2** REASON — that exposure has to be **managed**, and how it is managed is this system
- **A3** REASON — the same obligation appears **twice**, as an asset and a liability, and the two
  must be the same number read from two sides (rule 3)
- **A4** VERIFY — Σ marks = 0 across all parties, per contract and in aggregate
  (`../instruments/derivative.md` D1.b)

### B. HOW A TRADE BECOMES A POSITION
- **B1** REASON — two parties **agree terms** at a cleared price
  (`../instruments/derivative.md` D7)
- **B2** REASON — the position is **recorded on both books**, and it is one contract, not two
- **B3** REASON — it can be **closed** by an offsetting trade, by an early termination, or by
  running to expiry
  - B3.a an offsetting trade with a **different counterparty** does not remove the first: the
    party now has two contracts and two counterparty exposures, and the market risk is flat while
    the credit risk has doubled. Collapsing them hides the thing that actually breaks
- **B4** REASON — **novation** transfers a position to a new counterparty, with the old one's
  consent, and it is a real change of who faces whom

### C. BILATERAL VERSUS CLEARED
- **C1** REASON — **bilateral**: the two parties face each other, exchange collateral under an
  agreement, and net across the contracts they have with each other
  - C1.a netting is **per counterparty pair**, and it is why gross notional and net exposure are
    orders of magnitude apart
- **C2** REASON — **cleared**: a **central counterparty** steps in, becoming buyer to the seller
  and seller to the buyer, and then each side faces the CCP
  - C2.a it does not remove the risk; it **concentrates** it in a named party whose own solvency
    now matters to everyone
- **C3** REASON — the CCP is a **real entity with a balance sheet**: margin it holds, a default
  fund its members paid into, and its own capital
- **C4** REASON — it has a **stated default waterfall**, in order: the defaulter's margin, the
  defaulter's fund contribution, the CCP's own capital, the surviving members' contributions
  - C4.a which means a member's loss can come from **another member's** default, and that is the
    mutualisation channel
- **C5** FORBID — **the CCP is not a guarantor of last resort.** Its resources are finite and
  enumerable, and running past the end of the waterfall is a real event with real consequences,
  not an impossibility (`the-clearing-engine.md` B4)

### D. MARGIN
- **D1** REASON — **initial margin**: posted up front against a potential future move, sized from
  the risk of the position
- **D2** REASON — **variation margin**: the change in the mark, paid in cash, every period
  - D2.a it is **real money leaving one account and arriving in another**, in a stated currency,
    and it is the largest recurring flow this layer produces
  - D2.b VERIFY — Σ variation margin paid = Σ received, every period, exactly (A4 restated as a
    flow)
- **D3** REASON — margin is **held, not consumed**: the poster still owns it and gets it back, but
  it is no longer free (`../instruments/derivative.md` D9.a)
- **D4** REASON — a **margin call must be met or the position is closed out**
  - D4.a and meeting it may force a sale (`prime-brokerage.md` C3.a) — the same liquidity channel
- **D5** REASON — margin **rises when volatility rises**, which is exactly when parties can least
  afford it. That is procyclical by construction and it is a consequence to be measured

### E. DEFAULT
- **E1** REASON — a party can **fail with open positions**
- **E2** REASON — the positions are **closed out at a stated value**
  (`../instruments/derivative.md` D11.a) and the in-the-money side has a **claim on the estate**
- **E3** REASON — the loss is **the mark minus the collateral held**, and it lands on named
  survivors: the counterparty bilaterally, the waterfall if cleared (C4)
- **E4** VERIFY — the loss chain is traceable party by party; a default whose losses vanish is a
  layer that was never really bilateral

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no position without a counterparty** (`../instruments/derivative.md` D1.a)
- **F2** FORBID — **no exposure without margin or a stated reason there is none**
- **F3** FORBID — **no netting across counterparties.** Exposure to A does not offset exposure to
  B, and treating it as if it does is how a book looks flat until one of them fails
- **F4** FORBID — **no derivative that settles against a price this world does not clear**
  (`../instruments/derivative.md` D3.a)
