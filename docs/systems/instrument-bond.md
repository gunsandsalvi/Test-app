# INSTRUMENT CONTRACT: THE BOND

Not a system — an **instrument contract**. Every tree whose instrument is a bond must satisfy all
of it, and says per node HOW it satisfies it. Cited by `corporate-credit.md` and
`sovereign-credit.md`, and by `short-term-debt.md` when that is written.

**Why this file exists** (user, 2026-09-03: *"we can have a different type of bond for sovereign,
but it need to still have all the necessary characteristics of a bond"*). A sovereign bond and a
corporate bond are different TYPES, not one with fields unused: they differ in the early-
termination regime, in what a holder is entitled to on failure, and in whether seniority varies at
all. What they cannot differ in is the fourteen characteristics below — an instrument missing one
of these is not a bond, and the difference between "this type answers N differently" and "nobody
ever answered N" is the whole point of writing them down separately.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## THE FOURTEEN

- **N1** REASON — an **ISSUER** who owes: a named party with a balance sheet that can be looked at
- **N2** REASON — **PRINCIPAL**, an amount owed, counted in **units of par**
- **N3** REASON — a **CURRENCY** it is denominated in, and every figure about it is in that money
- **N4** REASON — a **MATURITY**: the date the principal is due
- **N5** REASON — a **COUPON**, the compensation for time and risk, in exactly one of three shapes
  - N5.a a **fixed** rate, locked at issuance
  - N5.b a **floating** margin over a NAMED reference rate that is itself observable
  - N5.c **zero** — the return is the discount to par (a bill, a zero)
- **N6** REASON — a **PERIODICITY AND AN ACCRUAL CONVENTION**: how often it pays, and how interest
  accrues between payments. Rule 9 lives here — a rate without its periodicity is not a number
- **N7** REASON — a **PRICE, per unit of par, that it changes hands at**
  - N7.a cleared from real demand against real supply, once per period
  - N7.b FORBID — **the price is never derived from the yield, the spread, the DM or the OAS.**
    Those are derived FROM it. A round trip through a curve cannot return the level it started at,
    and where one exists the print is arithmetic wearing a market's clothes
- **N8** REASON — a **HOLDER OF RECORD**: who owns how many units
  - N8.a VERIFY — Σ(units held) = units issued, always. A unit with no holder or two holders is a
    defect and not a rounding
- **N9** REASON — **TRANSFERABILITY**: it can change hands
  - N9.a two legs in the same pass — the paper one way, the cash the other
  - N9.b **accrued interest travels with it**: the buyer pays the seller what has accrued since the
    last payment, or the coupon is a windfall to whoever happens to hold it on the date
- **N10** REASON — **REDEMPTION**: the principal is repaid and the instrument **ceases to exist**.
  The register empties
- **N11** REASON — an **EARLY-TERMINATION REGIME**, stated even when it is "none": callable,
  prepayable, make-whole, non-call period, or not terminable early
  - N11.a whatever it is, it has a **price** the issuer pays to use it
- **N12** REASON — a **DEFINITION OF DEFAULT**: what counts as failure to perform, observable by a
  holder
- **N13** REASON — a **CLAIM ON FAILURE**: what the holder is entitled to, stated even when the
  answer is "nothing seizable"
  - N13.a and a **ranking** of that claim against the issuer's other claims — stated even when the
    answer is "all equal"
- **N14** REASON — an **IDENTITY a market would use**: issuer + coupon + maturity, or issuer +
  tenor. An internal id is an id, never the name

---

## HOW EACH TYPE ANSWERS

| | corporate bond / loan | sovereign bond / bill |
|---|---|---|
| **N11** early termination | make-whole, non-call, soft call — stamped from what the issue IS | **typically none**; the issuer manages the curve by buyback and switch instead |
| **N12** default | missed payment **or breached covenant** | **missed payment only** — there are no covenants to breach |
| **N13** claim | a claim on an **estate** that is realised and distributed | **nothing seizable**; a negotiated exchange, and the sanction is market exclusion |
| **N13.a** ranking | a real **waterfall**: senior paid in full before subordinated | **pari passu, always** — the ranking exists and never varies |
| **N5** coupon | fixed or floating; floating is common in loans | fixed for bonds, zero for bills; floating is rare |
| **N3** currency | usually the issuer's own, sometimes not | its own or another's — **and that difference is the whole of its credit risk** |

**The consequence for §3.13-SOV.** "The same construction as a normal bond" is right about N1–N10
and N14 and wrong about N11–N13.a: a sovereign that inherits a `seniority` field which must never
vary, and a covenant slot that must stay empty, has two fields whose only correct value is a
constant — which rule 3 calls a second representation and rule 19 calls a primitive that should
not exist. The right shape is the contract above, with each type answering N11–N13 its own way.
