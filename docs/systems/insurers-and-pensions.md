# SYSTEM: INSURERS AND PENSIONS

The long-horizon asset owners. They matter to this world for one structural reason: **their
liabilities are long, contractual and not tradable**, which makes them the natural buyer of
duration and the natural seller of liquidity — the mirror image of a bank
(`banks-funding-and-liquidity.md`).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THEY ARE
- **A1** REASON — **named parties with accounts and registers**, holding assets against
  liabilities they owe to named beneficiaries (`households.md` F3)
- **A2** REASON — **a real liability**: a promise to pay stated amounts at stated future times
  - A2.a it is a **liability of the institution**, not a fund share — the beneficiary does not
    absorb the investment result (`fund-shares.md` A3 is the contrast, and it is the whole
    difference)
  - A2.b except where the contract says otherwise, in which case it IS a fund share and must be
    modelled as one
- **A3** REASON — **equity is assets − liabilities**, a read, and it can go negative — which is a
  solvency event with consequences
- **A4** REASON — they receive **premiums or contributions** and pay **claims or pensions**, and
  both are real flows to and from named parties

### B. THE LIABILITY SIDE
- **B1** REASON — the liability has a **schedule**: how much is owed in each future period
- **B2** REASON — its **present value depends on a discount rate**, and the rate is read from a
  market (`interest-rate-swaps.md` C, `sovereign-credit.md`)
  - B2.a so **falling rates raise the liability**, which is why a rate move is a solvency event
    for this sector and a P&L event for everybody else
  - B2.b FORBID — **no fixed discount rate.** A liability discounted at a constant is a liability
    that never moves, and the sector's defining risk disappears
- **B3** REASON — the schedule is **uncertain**: mortality, longevity, claim frequency
- **B4** REASON — an insurer's claims can be **correlated and lumpy** — a catastrophe is one event
  hitting many policies at once, which is different from the average being higher

### C. THE ASSET SIDE
- **C1** REASON — it invests the premiums, and the **portfolio is a decision** with reasons
  (`households.md` D5)
- **C2** REASON — the **dominant reason is matching B1**: long assets against long liabilities
  - C2.a so it is a **structural buyer of long bonds and long swaps**
    (`interest-rate-swaps.md` B2.a) — a one-way demand that exists whatever the price, which is a
    real force in that market and not a preference
- **C3** REASON — it can hold **illiquid assets**, because it does not face redemption the way a
  fund does — that is what it is paid for
- **C4** REASON — it **lends securities** for extra return (`securities-lending.md` B2)
- **C5** REASON — it is a **buyer of credit** (`corporate-credit.md`), and its mandate limits which
  credits — so a downgrade can force a sale

### D. THE GAP AND WHAT IT FORCES
- **D1** REASON — assets and liabilities **do not match**, and the mismatch is measurable in
  duration and in cash flow
- **D2** REASON — the mismatch **moves equity when rates move**, in the opposite direction to a
  bank's
- **D3** REASON — a **funding shortfall** has consequences: the sponsor contributes, the fund
  de-risks, or benefits are cut — each a real action by a named party
- **D4** REASON — it can **hedge** the gap, and hedging it costs money and creates margin calls
  (`the-derivative-layer.md` D2)
  - D4.a a leveraged hedge turns a solvency improvement into a **liquidity requirement**, which is
    the failure mode of the whole sector
- **D5** VERIFY — a large rate move should show as: liability revaluing, hedge revaluing the other
  way, and cash moving on the hedge but not on the liability. That asymmetry is the finding

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no liability without beneficiaries.** Somebody named is owed the money
- **E2** FORBID — **no asset that is not somebody's liability or a real thing**
  (`the-register.md` A2)
- **E3** FORBID — **no solvency measured against a stored liability value.** It is a read from B1
  and B2, every time
- **E4** VERIFY — the sector's holdings, added to every other holder's, equal what was issued
  (`the-register.md` B2) — this sector is large enough that its absence would show up there
