# SYSTEM: CORPORATE CREDIT

Bonds, leveraged loans, commercial paper and bank facilities issued by a named non-financial firm
and held by somebody. Excludes sovereign credit (its own system) and the derivative layer that
references this one (its own system), but the boundary with both is a node here.

---

## 1. THE REQUIRED TREE

**REWRITTEN 2026-09-03 at depth 3, on the user's instruction** ("Redo credit as well following the
guidelines"), superseding the depth-2 version and its annotation. The depth-2 tree is in this
file's history. Node types per `README.md`: **REASON**, **VERIFY**, **FORBID**.

**The instrument's own characteristics are NOT repeated here.** They are `../instruments/bond.md`
N1–N14, which this system must satisfy in full; this tree covers what is true of the MARKET, the
HOLDER and the LIFE around a bond, and states only where corporate answers a contract node its own
way.

**Caveat, unchanged and still load-bearing.** I had read `07b`, `07d`, the clearing engine and
`domain/pricing/` before writing any of this, so it is not clean-room. Judge it on the nodes I had
never raised, not on the confirmations.

### A. THE ISSUER AND THE PROMISE
- **A1** REASON — a named legal entity with a balance sheet that can make a promise (bond N1)
- **A2** REASON — it has a **capital structure and a reason for it**
  - A2.a a mix of debt kinds and seniorities, each a real instrument
  - A2.b a **target or a constraint** it is managing towards — leverage, coverage, a rating it
    wants — so that issuing is a decision and not an accounting consequence
  - A2.c VERIFY — the structure that results is an outcome of A2.b meeting the market's price,
    never assigned
- **A3** REASON — a capacity to service: operating cash flow, and the coverage of the service by it
  - A3.a the service is interest **plus** scheduled principal, both real payments
  - A3.b coverage is a read of A3.a against cash flow, and it can fall below one
- **A4** REASON — creditworthiness is **ASSESSED, and the assessment is an OPINION HELD BY
  SOMEBODY** — an agency, or each holder's own model. It is not a property of the firm
  - A4.a the assessor is named, and can be wrong
  - A4.b assessments **disagree**, and the disagreement is what makes two sides of a market
  - A4.c an assessment **changes**, and the change is an event other participants react to

### B. HOW CORPORATE ANSWERS THE BOND CONTRACT
- **B1** REASON — bond **N11**: a real early-termination regime, stamped at issuance from what the
  issue is — make-whole for investment grade, a non-call period for high yield, a soft call for
  floating paper
- **B2** REASON — bond **N12**: default is a missed payment **or a breached covenant**
  - B2.a **covenants exist**: promises about the issuer's conduct — leverage, coverage,
    restricted payments — whose breach is an observable event
  - B2.b a breach can be **waived or cured**, at a price, and that negotiation is real
- **B3** REASON — bond **N13**: a claim on an **estate**, and **N13.a**: a real seniority ranking
  that varies by instrument
- **B4** REASON — bond **N5**: fixed or floating, and floating is the norm in the loan market

### C. THE PRIMARY MARKET
- **C1** REASON — a new issue is **BROUGHT** by a named underwriter or arranger, appointed and paid
- **C2** REASON — a **book is built**: real buyers indicate real demand at real levels
  - C2.a an indication is a schedule — a size at a level — not a quantity
  - C2.b the book is **information**: its size and shape decide where the deal prices
- **C3** REASON — it **prices**: one level struck at which the book fills
- **C4** REASON — the issuer has a **WALK-AWAY**, and a pulled deal never traded and never existed
- **C5** REASON — **allocation**: who got how many units, decided out of the book
- **C6** REASON — proceeds reach the issuer as cash, **net of a fee that reaches the underwriter**
- **C7** REASON — the underwriter **bears risk between commitment and placement**
  - C7.a it can be **left holding** paper it could not place, and that is its own position
  - C7.b VERIFY — the fee it earns and the risk it takes are related; a fee with no risk behind it
    is a transfer

### D. THE SECONDARY MARKET
- **D1** REASON — holders who want out and buyers who want in **post schedules**, and who trades is
  the outcome
- **D2** REASON — **a PRICE clears** — bond N7. Everything else about value is derived from it
- **D3** REASON — a **dealer intermediates**, and it is a real party
  - D3.a it quotes **both sides** out of its own inventory and its own cost
  - D3.b it is bounded by its **balance sheet and capital**, and the bound bites
  - D3.c its quote widens as its inventory fills — a reason, not a rule
- **D4** REASON — the dealer earns the **bid-offer on the flow it facilitates**, and somebody pays it
- **D5** VERIFY — **a seller that finds no buyer keeps its paper.** Illiquidity is an unsold
  position; there is no invisible bid. (VERIFY because it is what the mechanism must PRODUCE, and
  enforcing it as a rule is how a residual dealer gets invented)
- **D6** REASON — settlement moves **two legs in the same pass** (bond N9.a)
- **D7** REASON — **accrued interest transfers with the paper** (bond N9.b)
- **D8** FORBID — bond **N7.b**: no derived measure may set the price. Spread, yield, DM and OAS are
  computed FROM it

### E. THE HOLDER
- **E1** REASON — a **register**: who owns how many units (bond N8)
- **E2** VERIFY — bond N8.a: Σ held = issued
- **E3** REASON — the holder **marks** at the cleared price; its value is units × price
- **E4** REASON — the change in the mark is **P&L, and it reaches the holder's income**
  - E4.a realised on sale, unrealised while held, and the two are distinguishable
- **E5** REASON — the holder's willingness to hold has an **economic reservation** built from
  - E5.a its **cost of funds**
  - E5.b its **expected loss** — A4's assessment, times a loss given default
  - E5.c the **capital** the position consumes
  - E5.d VERIFY — the level a book clears at is where the marginal holder's reservation sits, and
    a spread below every reservation means demand is genuinely zero, not that a floor was applied
- **E6** REASON — a **leveraged** holder funds the position, and **that funding can be withdrawn**
  - E6.a the funding is a named liability to a named lender (repo, prime brokerage, deposits)
  - E6.b withdrawal forces a sale — the link from the money market to this one
- **E7** REASON — the position **consumes regulatory capital** for a holder that has any, bounding
  size. *(MISSING rather than out of scope for non-bank holders: a pension fund's constraint is a
  mandate rather than a capital charge, and the tree should say which each holder faces)*
- **E8** REASON — it can be **pledged as collateral**, at a haircut, and is then encumbered
- **E9** REASON — the holder's **statement** shows the position, its price, its income and its P&L

### F. THE LIFE OF THE PROMISE
- **F1** REASON — interest **accrues** to the holder of record, continuously (bond N6)
- **F2** REASON — on the date the issuer **PAYS**, to whoever holds it then, and the cash leaves
- **F3** REASON — principal repaid: bullet at maturity, or on a schedule for an amortiser
- **F4** REASON — the issuer may **prepay or call**, paying what B1's regime costs
- **F5** REASON — **refinancing**: a new issue whose proceeds retire an old one, at the market's
  price on the day — which is how a rate rise reaches a firm that borrowed years ago
- **F6** REASON — it **matures and ceases to exist** (bond N10)

### G. WHEN IT GOES WRONG
- **G1** REASON — a missed payment or a breached covenant is an **EVENT, observable by holders**
- **G2** REASON — an event can **ACCELERATE**: the whole principal becomes due at once
- **G3** REASON — **default**: the claim becomes a claim on an estate
- **G4** REASON — the estate is **realised**: assets sold for what they fetch, not for book
- **G5** REASON — proceeds distributed by **seniority** — a waterfall, senior in full first
  - G5.a a junior claim can recover **nothing**, and that is the point of being junior
- **G6** REASON — the holder **books the loss**: mark minus recovery, on a date
- **G7** REASON — **restructuring** is the alternative to liquidation: terms changed, or debt
  exchanged for equity, and **the holders decide**
- **G8** REASON — a default is **INFORMATION**: it moves A4's assessments and E5's reservations for
  every other issuer, which is how contagion travels without a correlation parameter

### H. THE AGGREGATE
- **H1** REASON — the market has a level: an index built from real prices and real weights
- **H2** VERIFY — worse assessment trades wider. **Measure, never enforce**
- **H3** VERIFY — junior trades wider than senior within one issuer. **Measure, never enforce**
- **H4** REASON — the cash market and its synthetic (CDS) are **separately cleared**, and the
  **BASIS between them is a real tradeable difference**
  - H4.a FORBID — neither may be derived from the other. A basis computed from one price is not a
    basis, it is a restatement

---

## 2. THE MAPPING

**STALE — the tree was renumbered when it was redone at depth 3 on 2026-09-03.** The citations
below are from the depth-2 mapping and still RESOLVE (the gate checks them every commit), but they
are no longer aligned to the node ids above and must be re-walked against the new tree. The
findings in §3 survive the renumbering: they are about the code, not about which letter a node
carries.


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
