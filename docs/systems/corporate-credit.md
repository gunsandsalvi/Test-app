# SYSTEM: CORPORATE CREDIT

Bonds, leveraged loans, commercial paper and bank facilities issued by a named non-financial firm
and held by somebody. Excludes sovereign credit (its own system) and the derivative layer that
references this one (its own system), but the boundary with both is a node here.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, with the credit code shut, and committed with every code cell
empty before any mapping was done — see this file's first commit.

**A caveat stated up front, because it bears on how much the pilot proves.** I had already read
`07b`, `07d`, `financial-clearing-engine.ts` and `domain/pricing/` earlier in the same session,
so this is not a clean-room. The honest success test for the pilot is therefore NOT whether the
tree rediscovers "credit has no price" — I already knew that. It is whether the tree contains
nodes I had never raised, and whether those nodes turn out to be empty. Judge it on the new rows
in §3 of this file, not on the confirmations.

### A. THE ISSUER AND THE PROMISE

- **A1** An issuer exists: a named legal entity with a balance sheet that can make a promise.
- **A2** The issuer has a capital structure — how much debt, of what kinds, at what seniorities —
  and a reason for it (a target, a constraint, a preference).
- **A3** The issuer has a capacity to service debt: an operating cash flow, and a coverage of the
  service by it.
- **A4** The issuer's creditworthiness is ASSESSED, and the assessment is an opinion held by
  somebody — an agency, or each holder's own model. It is not a property of the firm.

### B. THE INSTRUMENT

- **B1** An instrument is created by an ISSUANCE DECISION and carries terms fixed at that moment:
  principal, maturity, seniority, currency.
- **B2** Its coupon is either a fixed rate or a floating margin over a named reference rate. Which
  one is a property of the issue.
- **B3** It is counted in UNITS — par value. Every position in it is a number of units.
- **B4** It has an early-termination regime: callable, prepayable, make-whole, non-call period,
  or none. Stamped at issuance from what the issue is.
- **B5** It has COVENANTS: promises about the issuer's conduct whose breach is an event.
- **B6** It has an identity a market would recognise: issuer + coupon + maturity, not an internal
  id.

### C. THE PRIMARY MARKET

- **C1** A new issue is BROUGHT by someone — an underwriter or arranger, appointed and paid.
- **C2** A book is built: real buyers indicate real demand at real levels.
- **C3** The issue PRICES: one level struck, at which the book is filled.
- **C4** The issuer has a WALK-AWAY: a level beyond which it pulls the deal. A pulled deal never
  traded and never existed.
- **C5** Allocation: who got how many units, decided by the book.
- **C6** Proceeds reach the issuer, net of fees, as cash. The fee reaches the underwriter.
- **C7** The underwriter bears risk between commitment and placement — it can be left holding.

### D. THE SECONDARY MARKET

- **D1** The instrument TRADES: holders who want out meet buyers who want in.
- **D2** A PRICE clears — per unit, once per period, from real demand against real supply. **This
  is the price. Everything else about value is derived from it.**
- **D3** A dealer intermediates: it quotes both sides, holds inventory, and is bounded by its own
  balance sheet and capital.
- **D4** The dealer earns the bid-offer on the flow it facilitates.
- **D5** A seller that finds no buyer KEEPS ITS PAPER. Illiquidity is an unsold position, never an
  invisible bid.
- **D6** Settlement moves two legs in the same pass: the paper one way, the cash the other.
- **D7** ACCRUED INTEREST transfers with the paper: the buyer pays the seller the interest earned
  since the last coupon.
- **D8** Derived measures — spread, yield, discount margin, OAS — are computed FROM the cleared
  price and never set it.

### E. THE HOLDER

- **E1** A holder of record exists for every unit: a register that says who owns how much.
- **E2** Σ(units held) = units issued. Always. A unit with no holder, or two holders, is a defect.
- **E3** The holder MARKS the position at the cleared price. Its value is units × price.
- **E4** The mark's change is the holder's P&L, and it reaches the holder's income.
- **E5** The holder's willingness to hold has an economic reservation: its funding cost, its
  expected loss, and the capital the position consumes.
- **E6** A LEVERAGED holder funds the position — repo, prime brokerage, or its own deposits — and
  that funding can be withdrawn.
- **E7** The position consumes REGULATORY CAPITAL for a holder that has any, which bounds size.
- **E8** The holder can PLEDGE the instrument as collateral, at a haircut.
- **E9** The holder's statement shows the position, its price, its income and its P&L.

### F. THE LIFE OF THE PROMISE

- **F1** Interest ACCRUES to the holder of record, continuously between coupon dates.
- **F2** On the coupon date the issuer PAYS, to whoever holds it then, and the cash leaves the
  issuer.
- **F3** Principal is repaid: at maturity for a bullet, on a schedule for an amortiser.
- **F4** The issuer may PREPAY or CALL, paying whatever B4's regime costs.
- **F5** The issuer may REFINANCE: a new issue whose proceeds retire an old one, at whatever the
  market then charges.
- **F6** The instrument matures and CEASES TO EXIST. The register empties.

### G. WHEN IT GOES WRONG

- **G1** A missed payment or a breached covenant is an EVENT, observable by holders.
- **G2** An event can ACCELERATE the claim: the whole principal becomes due.
- **G3** DEFAULT: the issuer cannot pay. The claim becomes a claim on an estate.
- **G4** The estate is realised: assets are sold for what they fetch.
- **G5** Proceeds are distributed by SENIORITY — a waterfall, senior paid in full before
  subordinated gets anything.
- **G6** The holder books the loss: the difference between its mark and its recovery.
- **G7** RESTRUCTURING is the alternative to liquidation: terms are changed, or debt is exchanged
  for equity, and the holders decide.
- **G8** A default is INFORMATION: it changes what every other issuer's paper is worth, through
  the assessment in A4 and the reservations in E5.

### H. THE AGGREGATE

- **H1** The market has a level: an index, an average spread, a benchmark.
- **H2** The level orders sensibly against the assessment: worse credit trades wider.
- **H3** Seniority orders sensibly within an issuer: junior trades wider than senior.
- **H4** The cash market and its synthetic (CDS) are connected, and the BASIS between them is a
  real, tradeable difference — not one derived from the other.

---

## 2. THE MAPPING

*(unmapped — this file's first commit is the required tree alone)*

---

## 3. THE DIFF

*(unmapped)*
