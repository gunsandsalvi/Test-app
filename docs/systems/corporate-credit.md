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

**THIS TREE PREDATES THE REASON/VERIFY/FORBID RULE** (`README.md`, added 2026-09-03 on the user's
"not imposed, a consequence" comment). It is annotated rather than rewritten, because rewriting it
after the mapping is exactly the thing the method forbids. The three nodes that are OUTCOME-shaped
and must be read as **VERIFY** — measure, never enforce — are **H2** (the level orders against the
assessment), **H3** (seniority orders the spreads within an issuer) and **D5** (a seller with no
buyer keeps its paper). Enforcing any of the three would clamp a price, which rule 1 forbids and
which is how the audit's `P1`/`P3` rows became findings rather than settings.

The rule also makes a node askable that this tree does not contain, and its absence here is a
defect in the tree and not in the code:

- **B7** FORBID — **a coupon may not be derived from a price that was derived from the coupon.**
  A round trip through a curve cannot return the level it started from, and where one exists the
  print is the arithmetic rather than the market. (§3.26 names three of these; the tree should
  have asked for the prohibition rather than leaving them to be found one at a time.)

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

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 issuer exists | `src/domain/company.ts:Company` | ✅ |
| A2 capital structure | `src/domain/company.ts:DebtTranche` | ✅ |
| A3 service capacity | `src/domain/company-week/capital-programme.ts:weeklyInterestUSD` | ✅ |
| A4 creditworthiness is an OPINION | `src/domain/company.ts:CreditRating` | ⚠️ |
| B1 issuance decision | `src/engine/ledger/tranche-ledger.ts:issueTranche` | ✅ |
| B2 fixed or floating | `src/domain/company.ts:DebtTranche` | ✅ |
| B3 counted in units | `src/domain/assets/index.ts:countedIn` | ✅ |
| B4 call regime | `src/domain/call-protection.ts:callProtectionForIssue` | ✅ |
| B5 covenants | — | ❌ |
| B6 market identity | `src/ui/objects/tranche.tsx` | ❌ |
| C1 an underwriter is appointed | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| C2 a book is built | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingInstrument` | ✅ |
| C3 the issue prices | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ⚠️ |
| C4 the issuer's walk-away | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingInstrument` | ✅ |
| C5 allocation | `src/engine/simulation/stages/book-settlement.ts:PrimaryTake` | ✅ |
| C6 proceeds net of fees | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| C7 the lead bears the residual | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| D1 it trades | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:runCorporateBondClearingStage` | ✅ |
| **D2 a PRICE clears** | — | ❌ |
| D3 a bounded dealer | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ✅ |
| D4 the dealer earns the spread | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ✅ |
| D5 unsold stays with its holder | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingParams` | ✅ |
| D6 two legs, one pass | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| D7 accrued interest transfers on a trade | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ❌ |
| D8 derived measures are derived | `src/domain/pricing/bond.ts:spreadBpsFromPrice` | ⚠️ |
| E1 a register of holders | `src/engine2/holdings.ts:newHoldingStore` | ✅ |
| E2 Σ held = issued | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| E3 marked at the cleared price | `src/engine/audit/prices.ts:auditPrices` | ❌ |
| E4 the mark's change is P&L | `src/engine/simulation/stages/12-portfolio-and-positions.ts:runPortfolioAndPositionsStage` | ⚠️ |
| E5 an economic reservation | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:runCorporateBondClearingStage` | ✅ |
| E6 a leveraged holder is funded | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageStage` | ✅ |
| E7 it consumes regulatory capital | `src/engine/macro/banking.ts:leverageHeadroomUSD` | ⚠️ |
| E8 it can be pledged at a haircut | `src/domain/repo.ts:encumberedFaceByBucket` | ✅ |
| E9 the holder's statement | `src/ui/functions/statements.tsx` | ✅ |
| F1 interest accrues to the holder | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| F2 the coupon is paid | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| F3 principal is repaid | `src/engine/simulation/stages/holder-paydown.ts:reconcileHolderPrincipal` | ✅ |
| F4 prepay or call | `src/domain/company-week/debt-ladder.ts:callEconomics` | ✅ |
| F5 refinancing | `src/engine2/stage08-back.ts:s08k` | ✅ |
| F6 it matures and ceases to exist | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| G1 a missed payment is an EVENT | `src/domain/company.ts:Company` | ⚠️ |
| G2 acceleration | — | ❌ |
| G3 default | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| G4 the estate is realised | `src/domain/estate.ts:estateAssetsUSD` | ✅ |
| **G5 the waterfall pays by SENIORITY** | `src/domain/estate.ts:CLAIM_SENIORITY` | ⚠️ |
| G6 the holder books the loss | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| G7 restructuring | — | ❌ |
| G8 a default is information | `src/engine/simulation/stages/context.ts:WeeklyStepContext` | ✅ |
| H1 the market has a level | `src/engine/simulation/stages/index-calculation.ts:runIndexCalculationStage` | ✅ |
| H2 the level orders by assessment | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| H3 seniority orders within an issuer | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| H4 the cash/CDS basis is real | `src/engine2/stage08-back.ts:s08k` | ⚠️ |

---

## 3. THE DIFF

**46 nodes: 32 ✅, 9 ⚠️, 5 ❌.** The rows below are ordered by how much they change, not by branch.

### NEW — not previously named anywhere in the plan

**G5 · SENIORITY IS DECORATIVE, AND IT IS WHY P1 CAN FAIL FOREVER.** `DebtTranche.seniority` is
`'SENIOR' | 'SUBORDINATED'`, stamped at issuance and priced into the spread. The estate assigns
recovery seniority by instrument **TYPE** instead — `estate-resolution.ts:547-579`:
LEVERAGED_LOAN and BANK_FACILITY → `SECURED`, CORP_BOND and COMMERCIAL_PAPER → `UNSECURED`,
EQUITY → `EQUITY`. **`SUBORDINATED` appears nowhere in the estate machinery.** So a subordinated
bond and a senior bond of the same issuer recover identically in every state of the world.

That is the CAUSE of a failing audit nobody had connected to it: `P1 seniority orders the spreads`
breaches on 841–1073 issuers a week, and it can, because holding a subordinated bond is
economically identical to holding a senior one. There is no feedback that would make it trade
wider. A seniority that changes the price and not the payout is not a seniority (rule 29 — the
symptom is P1's count, the cause is that the waterfall never reads the field).

**G7 · THERE IS NO RESTRUCTURING.** Zero occurrences of `restructur` or an exchange offer across
`src`. Default's only path is liquidation through the estate. Most real corporate defaults are
negotiated — terms amended, debt exchanged for equity, holders voting — and the choice between
workout and liquidation is what sets recovery. Here recovery is whatever the assets fetch, always.

**B5 · THERE ARE NO COVENANTS.** `DebtTranche` carries none, and the only occurrences of the word
are a bank's *lending* heuristic (`bank-lending.ts:12` — "a covenant-style 3x"), which is a sizing
rule and not a term of any instrument. So an issuer cannot breach anything: the only credit event
is failure to pay. Covenants are how credit risk is observed BEFORE a default, and G1's ⚠️ is the
same hole seen from the other side — a missed payment is a state of the firm, not an event any
holder is notified of.

**G2 · NO ACCELERATION.** A default does not make the principal due. Both `accelerat` hits in the
tree are tax depreciation.

**A4 · ONE RATING, HELD BY NOBODY.** `Company.creditRating` is a property of the firm, computed in
`stage08-back.ts:1230`. In a real market an assessment is an OPINION — agencies publish theirs,
holders run their own models, and the disagreement is a large part of why a book has two sides.
One universal rating means every participant agrees about credit by construction, which quietly
removes a source of the demand dispersion the auction needs.

### CONFIRMS what the plan already carries

- **D2 · no cleared price for credit** — §3.13, the step this whole atlas was piloted to test for.
  Confirmed empty: the credit books clear a SPREAD (`assets/index.ts` declares CORP_BOND and
  LEVERAGED_LOAN `SPREAD_LIKE`) and no price is stored anywhere.
- **E3 · the register marks at par** — `P5`, 176B on 605B of face at week 16.
- **B6 · the display name is the internal id** — §3.14.
- **D7 · accrued interest does not follow the paper** — §3.13b names the accrual's storage; this
  is the trade-time consequence, and worth stating in the step: a buyer receives a full coupon it
  did not earn and the seller loses what it did.
- **C3/D8 · the bracket is a print, and the derived measure is an input** — §3.21 and §3.21-BRACKET.
- **H4 · the CDS spread is derived from the OAS** — §3.26, which destroys the basis H4 requires.
- **H2/H3 · the orderings are audited and failing** — P1/P3, and G5 above is why H3 can.

### PRESENT AND NOT WORTH RE-CHECKING

The primary market is the strongest branch: a lead is appointed, quotes, guarantees the price,
is left holding the residual in its own desk book, and the four-way settlement sums to zero
(`primary-settlement.ts:13`). A withdrawn deal settles nothing and never existed. C1–C7 are all ✅
and this is the part of the credit system that most closely matches what it represents.

### SCOPED OUT, DELIBERATELY

- **E7** is ⚠️ rather than ❌ because banks DO consume capital (`leverageHeadroomUSD`) while
  institutions post a `maxNetPurchaseUSD` cash budget and no capital charge. Whether a pension
  fund should have one is a modelling choice, not an omission.
- **E4** is ⚠️ because `unrealizedPnL` exists for the player's portfolio view; whether an
  institution's mark change reaches its own income is E3's question and is counted there.
