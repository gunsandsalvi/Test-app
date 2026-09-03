# SYSTEM: CDS

Credit default swaps: protection on a named issuer's failure, paid for with a running premium. The
one derivative whose underlying is an **event** rather than a price, which is what makes it the
hardest to get right and the most useful when it is.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **named reference entity** and its **default event**
    (`../instruments/bond.md` N12), not a price
  - A1.b **D4 payoff** — on the event, the protection seller pays **par − recovery** on the
    notional; otherwise nothing
  - A1.c **D7 price** — the **running spread**, in basis points per annum on the notional, cleared
  - A1.d **D6 term** — a stated tenor, and a **curve of them**: 1y, 3y, 5y, 10y, which is a term
    structure of credit and not one number
- **A2** REASON — the **premium leg is a real periodic payment**, in cash, in the contract's
  currency, and it stops on the event
- **A3** REASON — the **protection leg is contingent**, and its value is the probability-weighted
  loss — which is a **read from the cleared spread**, never the input to it (rule 1)
- **A4** REASON — the **reference entity must exist in this world** and be capable of defaulting
  (`corporate-credit.md`, `sovereign-credit.md`, `firm-birth-and-death.md`)
  - A4.a FORBID — no protection on an entity nobody can observe failing

### B. WHY EACH SIDE IS THERE
- **B1** REASON — the **buyer of protection** has a reason: it holds the issuer's debt and wants
  the risk off, it lends to the issuer and cannot sell the loan, or it thinks the credit will
  deteriorate
  - B1.a so a bank can hedge a loan it cannot sell (`banks-lending.md`), which is the contract's
    original economic purpose
- **B2** REASON — the **seller of protection** has a reason: it wants credit exposure without
  funding a bond, or it thinks the spread is too wide for the risk
  - B2.a it is **short a jump**: small regular income, large sudden loss, which is why its capital
    and margin matter more than its mark
- **B3** REASON — **naked positions are possible** on both sides, and they are how the market gets
  liquid — but a naked seller is an unfunded credit exposure and must be capitalised as one
- **B4** REASON — a **dealer** intermediates (`dealer-desks.md`), and its book is rarely flat

### C. PRICE AND WHAT IS DERIVED FROM IT
- **C1** REASON — the **spread clears** from the two sides' schedules
  (`the-clearing-engine.md`)
- **C2** REASON — the **implied default probability and expected recovery are derived** from the
  spread and the term structure — never the other way round (rule 1, `../instruments/bond.md` N7.b)
- **C3** VERIFY — the CDS spread and the cash bond's spread over the risk-free curve should be
  close, because both are compensation for the same credit
  - C3.a the difference is the **basis**, and it is a **consequence** — of funding cost,
    deliverability, and who can trade which. It is measured, never set
  - C3.b a persistently large basis is a finding about one of the two markets, and rule 12 says
    not to judge it mid-project — but it must be visible
- **C4** VERIFY — worse credit should trade wider, as a consequence of what participants post

### D. THE EVENT
- **D1** REASON — a **stated definition of the credit event**, observable by both sides
  (`../instruments/bond.md` N12)
- **D2** REASON — a **recovery**, determined by what the defaulted obligations are actually worth
  — an auction, not an assumption
  - D2.a FORBID — **no fixed recovery rate.** A constant recovery makes the payoff a constant and
    turns a credit derivative into an interest-rate instrument
- **D3** REASON — the payment on the event is **real money from the seller to the buyer**, and it
  can be large enough to fail the seller
- **D4** REASON — the contract **terminates** on the event
  (`../instruments/derivative.md` D11)
- **D5** VERIFY — Σ(protection payments made) = Σ(received), and the net effect across the whole
  world of a default is a **transfer**, never a change in total loss

### E. THE SYSTEMIC PART
- **E1** REASON — CDS **moves credit risk to where it is not observed**: the bank looks hedged, and
  the risk sits with whoever sold it
- **E2** REASON — that seller may be **correlated with the reference entity** — wrong-way risk —
  and then the protection is worth least exactly when it is needed
- **E3** REASON — the **net notional per reference entity** is a real number and a real
  concentration, and it is knowable only by adding up the contracts
- **E4** FORBID — **no protection that pays without a payer.** The seller's ability to pay is part
  of the instrument (`../instruments/derivative.md` D10)
