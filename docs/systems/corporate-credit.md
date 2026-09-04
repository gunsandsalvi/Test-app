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

**RE-WALKED 2026-09-03 against the depth-3 tree.** The depth-2 mapping this replaces is in this
file's history; every finding it carried survives here under its new node id, and the four steps it
produced (§3 steps 33, 34, 35, 36) are named against the nodes they now belong to.

`✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the forbidden thing is
there). Every citation is checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named entity with a balance sheet | `src/domain/company.ts:Company` | ✅ |
| A2 a capital structure and a reason for it | `src/domain/company.ts:DebtTranche` | ✅ |
| A2.a a mix of kinds and seniorities, each a real instrument | `src/engine2/tranches.ts:TR_SUBORDINATED` | ⚠️ |
| A2.b a target or constraint it manages towards | `src/engine/simulation/stages/corporate-financing.ts:decideCorporateFinancing` | ✅ |
| A2.c VERIFY the structure is an outcome, never assigned | — | ❌ |
| A3 capacity to service, and coverage of it | `src/domain/company-week/credit-standing.ts:creditMetrics` | ✅ |
| A3.a service is interest **plus scheduled principal** | `src/domain/company-week/capital-programme.ts:weeklyInterestLocal` | ⚠️ |
| A3.b coverage is a read and can fall below one | `src/domain/company-week/credit-standing.ts:creditMetrics` | ✅ |
| **A4 creditworthiness is an OPINION HELD BY SOMEBODY** | `src/domain/company.ts:CreditRating` | ⚠️ |
| A4.a the assessor is named and can be wrong | — | ❌ |
| A4.b assessments disagree | — | ❌ |
| A4.c a change is an event others react to | `src/engine/simulation/stages/context.ts:ratingChanges` | ⚠️ |
| B1 N11 an early-termination regime stamped at issuance | `src/domain/call-protection.ts:callProtectionForIssue` | ✅ |
| B2 N12 default is a missed payment **or a breached covenant** | `src/domain/company-week/credit-standing.ts:isInDefault` | ⚠️ |
| **B2.a covenants exist as terms of the instrument** | — | ❌ |
| B2.b a breach can be waived or cured, at a price | — | ❌ |
| B3 N13/N13.a a claim on an estate, ranked by instrument | `src/domain/estate.ts:CLAIM_SENIORITY` | ⚠️ |
| B4 N5 fixed or floating; floating the norm in loans | `src/engine/simulation/stages/07d-leveraged-loan-clearing.ts:runLeveragedLoanClearingStage` | ✅ |
| C1 a named underwriter, appointed and paid | `src/domain/primary-market.ts:chooseLeadBank` | ✅ |
| C2 a book is built out of real demand | `src/engine/simulation/stages/financial-clearing-engine.ts:ParticipantDemand` | ✅ |
| C2.a an indication is a schedule, not a quantity | `src/engine/simulation/stages/financial-clearing-engine.ts:setDemand` | ✅ |
| C2.b the book's size and shape decide where it prices | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ✅ |
| C3 it prices: one level struck | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ⚠️ |
| C4 the issuer's walk-away, and a pulled deal never existed | `src/engine/simulation/stages/corporate-financing.ts:walkAwayCostAnnual` | ✅ |
| C5 allocation out of the book | `src/engine/simulation/stages/book-settlement.ts:primaryTakes` | ✅ |
| C6 proceeds net of a fee that reaches the underwriter | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| C7 the underwriter bears risk to placement | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| C7.a it can be left holding, as its own position | `src/domain/dealer-desk.ts:DealerDeskPosition` | ✅ |
| C7.b VERIFY the fee and the risk are related | `src/domain/primary-market.ts:oneWeekPriceRiskBps` | ✅ |
| D1 holders and buyers post schedules; who trades is the outcome | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:runCorporateBondClearingStage` | ✅ |
| **D2 a PRICE clears (bond N7)** | — | ❌ |
| D3 a dealer intermediates, a real party | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ✅ |
| D3.a it quotes both sides out of its own inventory | `src/engine/simulation/stages/dealer-desks.ts:applyDealerDeskFills` | ✅ |
| D3.b bounded by its balance sheet and capital | `src/domain/dealer-desk.ts:dealerDeskCapacityLocal` | ✅ |
| D3.c its quote widens as its inventory fills | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ⚠️ |
| D4 the dealer earns the bid-offer, and somebody pays it | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| D5 VERIFY an unsold seller keeps its paper | `src/engine/simulation/stages/financial-clearing-engine.ts:unsoldStaysWithHolder` | ✅ |
| D6 two legs in the same pass (N9.a) | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| D7 accrued interest transfers with the paper (N9.b) | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ⚠️ |
| **D8 FORBID no derived measure may set the price (N7.b)** | `src/engine/simulation/stages/07d-leveraged-loan-clearing.ts:pricePar` | ❌ |
| E1 a register of holders (N8) | `src/engine2/holdings.ts:newHoldingStore` | ✅ |
| E2 VERIFY Σ held = issued (N8.a) | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| **E3 the holder marks at the cleared price** | `src/engine/simulation/stages/credit-marking.ts:markCreditToMarket` | ❌ |
| E4 the change in the mark is P&L reaching income | `src/engine/simulation/stages/12-portfolio-and-positions.ts:runPortfolioAndPositionsStage` | ⚠️ |
| E4.a realised and unrealised are distinguishable | `src/engine/simulation/stages/12-portfolio-and-positions.ts:unrealizedPnL` | ⚠️ |
| E5 an economic reservation | `src/engine/simulation/stages/asset-allocation.ts:computeReservationSpreadBps` | ✅ |
| E5.a its cost of funds | `src/engine/simulation/stages/asset-allocation.ts:entityRequiredReturn` | ✅ |
| E5.b its expected loss — A4's assessment × LGD | `src/engine/simulation/stages/shared-helpers.ts:computeAnnualDefaultProbability` | ✅ |
| E5.c the capital the position consumes | `src/engine/simulation/stages/asset-allocation.ts:spreadRiskCapitalChargeRate` | ✅ |
| E5.d VERIFY it clears at the marginal reservation, with no floor | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ⚠️ |
| E6 a leveraged holder is funded, and it can be withdrawn | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageStage` | ✅ |
| E6.a a named liability to a named lender | `src/domain/repo.ts:RepoContract` | ✅ |
| E6.b withdrawal forces a sale | `src/engine/simulation/stages/prime-brokerage.ts:measuredHaircutsFor` | ✅ |
| E7 the position consumes regulatory capital | `src/engine/macro/banking.ts:leverageHeadroomLocal` | ⚠️ |
| E8 pledgeable at a haircut, and then encumbered | `src/domain/repo.ts:encumberedFaceByBond` | ⚠️ |
| E9 the holder's statement shows position, price, income, P&L | `src/ui/functions/statements.tsx:statements` | ⚠️ |
| F1 interest accrues to the holder of record (N6) | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| F2 on the date the issuer PAYS, and the cash leaves | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| F3 principal repaid: bullet, or a schedule for an amortiser | `src/engine/simulation/stages/holder-paydown.ts:reconcileHolderPrincipal` | ⚠️ |
| F4 prepay or call, paying what B1's regime costs | `src/domain/company-week/debt-ladder.ts:callEconomics` | ✅ |
| F5 refinancing at the market's price on the day | `src/engine2/stage08-back.ts:calledRefinanceTranches` | ⚠️ |
| F6 it matures and ceases to exist (N10) | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| G1 a missed payment or breach is an EVENT holders observe | `src/domain/company-week/credit-standing.ts:isInDefault` | ⚠️ |
| **G2 acceleration** | — | ❌ |
| G3 default: the claim becomes a claim on an estate | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| G4 the estate is realised — sold for what it fetches, not book | `src/engine/simulation/stages/estate-resolution.ts:sellAssetsToPeers` | ⚠️ |
| **G5 the waterfall pays by SENIORITY** | `src/engine/simulation/stages/estate-resolution.ts:distribute` | ⚠️ |
| G5.a a junior claim can recover nothing | `src/domain/estate.ts:claimsAtSeniority` | ⚠️ |
| G6 the holder books the loss, on a date | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| **G7 restructuring** | — | ❌ |
| G8 a default is INFORMATION that moves other issuers | `src/engine/simulation/stages/shared-helpers.ts:creditRecoveryRate` | ✅ |
| H1 the market has a level, from real prices and weights | `src/engine/simulation/stages/index-calculation.ts:runIndexCalculationStage` | ⚠️ |
| H2 VERIFY worse assessment trades wider | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| H3 VERIFY junior trades wider than senior in one issuer | `src/engine/audit/prices.ts:auditPrices` | ⚠️ |
| H4 cash and synthetic separately cleared; the BASIS is real | `src/engine/simulation/stages/derivative-markets/cds.ts:CDS_MARKET` | ⚠️ |
| **H4.a FORBID neither derived from the other** | `src/engine2/stage08-back.ts:newCdsSpreadBps` | ❌ |

---

## 3. THE DIFF

**76 nodes: 40 ✅, 25 ⚠️, 11 ❌.** Ordered by how much each changes, not by branch. The depth-2
diff's findings all appear below under their new ids; nothing has been dropped in the renumbering.

### ❌ D2 / D8 / E3 — CREDIT CLEARS A SPREAD, AND NOTHING IS EVER MARKED AT A PRICE

`assets/index.ts:69-70` declares CORP_BOND and LEVERAGED_LOAN `quotedAs: 'SPREAD_LIKE'`; `07b:207`
and `07d:195` both open their instruments with `statKind: 'YIELD_LIKE'`; and
`financial-clearing-engine.ts:956` reads
`const unitValueUSD = instruments[fi].statKind === 'PRICE_LIKE' ? shard.clearedStat[…] : 1` — so on
every credit book a unit of par changes hands at **one dollar, by construction**. D2 has no code at
all, which is the finding.

**KNOWN(13)**, and this tree is not the place to re-derive it. What the re-walk adds is three
things the step should carry:

1. **D8's FORBID is actively violated, not merely unmet.** `07d:472` writes
   `pricePar: Number((100 - (marginDeltaBps / 10000) * creditDuration * 100).toFixed(2))` — a price
   linearised out of the cleared discount margin. `index-calculation.ts:64` divides it by 100 and
   uses it as the loan index's price, and `12-portfolio:178` shows it to the player as
   `currentPrice`. That is N7.b's "arithmetic wearing a market's clothes", already in the model and
   already on the surface.
2. **E3's mechanism is BUILT AND SWITCHED OFF.** `credit-marking.ts:markCreditToMarket` exists,
   is correct, and derives its price from the paper's own cash flows through
   `domain/pricing/tranche.ts:pricePerFace`. `core.ts:293` does not run it: *"`credit-marking` is
   BUILT AND NOT YET WIRED IN"*, because half a mark does not converge while later stages write
   rows back in par space. So the register is at par today by a decision, and the ONE remaining
   blocker is named in that comment — the list of readers that must read `faceUSD` first.
3. **The asset registry cannot enforce any of it.** `grep -rn quotedAs src` returns the registry's
   own three lines and **nothing else**; `countedIn`'s exported reader is called from nowhere
   (two comments mention it). The two fields step 13 leans on are declarations no code consumes,
   so the price/stat distinction lives only as a hard-coded `statKind` at each of the five clearing
   adapters. **Becomes part of §3 step 13:** the registry row has to be what the adapter reads.

### ⚠️ A2.a / B3 / G5 / G5.a / H3 — SENIORITY IS DECORATIVE, AND `SUBORDINATED` IS NEVER ISSUED

**Already §3 step 33**, and the re-walk makes it worse than the step states. Step 33 says the estate
assigns recovery by instrument TYPE (`estate-resolution.ts:547-579`) and never reads
`DebtTranche.seniority`. True. But `grep -rn SUBORDINATED src` shows that **no creation site anywhere
ever writes it**: `companyGenerator.ts:356,366`, `stage08-back.ts:301,1205,1485,1569,1579,1619`,
`02b:156`, `07f:951,969`, `overdraft-sweep.ts:49` all stamp `'SENIOR'`, and `10-mergers.ts:79`
copies whatever the group already had. `tranches.ts:23`'s `TR_SUBORDINATED` bit is defined,
converted in both directions, and **never set**.

So the field is a constant, and three nodes fall with it. G5.a ("a junior claim can recover nothing")
has no junior debt to be about. H3 is unmeasurable: `prices.ts:33` looks for a
`seniority === 'SUBORDINATED'` tranche to compare against, always finds `undefined`, and that arm of
`P1` **has never once fired** — P1's 841–1073 breaching issuers are entirely its loan/CP/facility
arms. Step 33 should say so: fixing the waterfall is necessary and not sufficient, because until
something issues subordinated paper there is nothing for the waterfall to rank.

### ❌ B2.a / B2.b / G1 / G2 — A CREDIT EVENT IS ONLY EVER A BALANCE-SHEET STATE

**Already §3 step 34.** Confirmed exactly: zero covenant terms on `DebtTranche`; zero `accelerat`
hits that are not tax depreciation; and the default definition is
`credit-standing.ts:isInDefault` — `wasDefaulted || (cashUSD < 0 && coverage < coverageFloor)`.
Not a missed payment, not a breach: a state of the firm, computed inside stage 08, that no holder
is notified of. The two covenant CONSTANTS that do exist —
`corporate-financing.ts:66,69` (`COVENANT_INTEREST_COVERAGE`, `COVENANT_LEVERAGE_CEILING`) — are a
LENDER'S sizing rule on new issuance, the same shape as `bank-lending.ts:12`, and they gate whether
the firm may borrow rather than what happens when a promise is broken. B2.b (waiver and cure) is the
half step 34 does not name and should: a covenant with no negotiated remedy is just a second default
trigger.

### ❌ G7 — THERE IS NO RESTRUCTURING

**Already §3 step 35.** Re-confirmed mechanically: `grep -rni restructur src` returns **0**.
Liquidation through `runEstateResolutionStage` is default's only path.

### ❌ A4 / A4.a / A4.b — ONE RATING, HELD BY NOBODY, AND NOTHING REACTS TO THE CHANGE

**Already §3 step 36.** `Company.creditRating` is one field on the firm, written at
`stage08-back.ts:2376` from `simulation/credit.ts:determineCreditRating`. Every participant in
`07b` reads the same `c.creditRating` (`:309`) and the same `pdByCompanyId` (`:287`), so the demand
side agrees about credit by construction — there is no dispersion for a book to have two sides
about.

Two extensions the step should carry. **A4.a**: there is no assessor at all — no party publishes the
rating, so nobody can be wrong about it and nobody's reputation is at stake, which is what makes a
real rating an opinion rather than a datum. **A4.c**: the change IS produced —
`stage08-back.ts:1315` pushes to `ctx.ratingChanges` — and its only consumer is
`newsGenerator.ts:150`. No holder, desk or lender reads the CHANGE; every one of them re-reads the
LEVEL from scratch each week. A downgrade is therefore a headline and never an event.

### ⚠️ D3.c — THE DEALER'S SPREAD IS A CONSTANT PER BOOK

`dealer-desk.ts:56`'s `DESK_SPREAD_BPS_BY_BOOK` is a fixed table, charged identically whatever the
desk's inventory, capital or the week's flow. D3.b's capacity bound is real
(`dealerDeskCapacityUSD`) and it bites; the PRICE of intermediation does not move with it, so a desk
filling up gets smaller and never dearer. The node asks for a reason and the code has a rule.
**Already named in §3 step 26** ("`dealer-desk.ts:117` charges a stated real-market spread table as a
real cost in five books").

### ⚠️ D7 — THE ACCRUAL FOLLOWS THE HOLDER, BUT THERE IS NO ACCRUED LEG AT THE TRADE

Better than the depth-2 mapping recorded, and still not N9.b. `shared-helpers.ts:872`
apportions each issuer's WEEKLY interest across holders of record, accumulates it per
(instrument, holder) in `holderAccruedInterestUSD`, and at the coupon date pays every accrued
balance — **including a holder that has since sold out** (`:1041`). So the coupon is not a windfall
to whoever holds it on the date, which is what the depth-2 diff claimed. What is still missing is
the leg N9.b actually names: a buyer does not pay the seller its accrued at settlement, so the
seller finances the issuer's coupon interest-free until the date, and the split is weekly-granular —
a position opened and closed inside one week accrues by the week's-end register, not by the days
held.

Step 13b built that leg and **the sovereign has it** (`book-settlement.ts:accruedOnFills`): the
buyer pays the accrued on the face it took, the ledger re-keys by the same amount, and the net goes
to the issuer. The corporate cannot follow while `07b` clears one instrument per COMPANY and the
accrual ledger is keyed per TRANCHE — there is no face delta on a tranche for the accrued to ride.
It lands with **§3 step 12's tail** (clearing per tranche), which already owns three findings from
the same key mismatch.

### ⚠️ G4 — THE ESTATE SELLS AT A DISCOUNT OFF BOOK, NOT AT A PRICE

`estate-resolution.ts:214` sells plant as `estate.assets.ppeUSD / weeksLeft(ppeWeeks)` and
`:224-225` prices the slice at `sold × (1 − hurdle × weeks/52)`. The RATE is real and well argued
(the region's own capital-goods absorption, the company's own inventory turnover) and the BUYERS are
real named peers who pay. The PRICE is a formula discount off a book value. That is not G4's "sold
for what they fetch" — it is what §3 step 13 means when it says plant has no units and no price, seen
from the one place in the model where plant is definitely being sold. **Already §3 steps 13 and 26**
(which own "what a unit of plant IS"); recorded here as the second witness.

### ⚠️ H4 / ❌ H4.a — THE CDS FALLS BACK TO THE OAS, WHICH DELETES THE BASIS

`stage08-back.ts:1872`: `newCdsSpreadBps = L8.cdsSpreadBps[row] > 0 ? L8.cdsSpreadBps[row] :
newOasBps`. When the protection book has not cleared a name this week, its CDS spread IS its bond
spread and the basis is exactly zero — a restatement, which H4.a forbids by name. The book itself
(`derivative-markets/cds.ts:CDS_MARKET`) is real and clears against real hedging demand, so H4 is ⚠️
rather than ❌. **Already §3 step 26.**

### ⚠️ C3 / E5.d — THE CLEARED LEVEL CAN BE THE SEARCH BRACKET

`solveClearingStat` returns the bracket end when level-independent demand exceeds the float, and
that print becomes `comp.oasSpreadBps` at `07b:507`. E5.d asks for the marginal holder's
reservation and sometimes gets −2000 or 100,000 bps instead. **Already §3 steps 21 and 21-BRACKET**,
measured there at 67 tight and 139 wide prints over the 16-week reference.

### ❌ A2.c — ONE VERIFY NODE NOBODY MEASURES

Nothing reads the resulting capital structure against `decideCorporateFinancing`'s inputs, so the
claim that the structure is an outcome of the CFO's constraint meeting the market's price is
untested. **A measurement, for §3 step 38.**

### PRESENT AND NOT WORTH RE-CHECKING

The primary market and the reservation are the two strong branches and they are strong for the same
reason: both are built out of named parties' own arithmetic. **C1–C7.b are ✅ throughout** — a lead
is chosen (`chooseLeadBank`), the fee is derived from the one-week price risk it actually bears
(`oneWeekPriceRiskBps`), the four-way settlement sums to zero (`primary-settlement.ts:13`), the
residual lands in the lead's own desk book, and a withdrawn deal settles nothing and never existed.
**E5–E5.c are ✅**: the reservation is genuinely cost of funds + expected loss + capital charge, per
entity, per issuer, and `07b:390-405` shows the two pricing regimes (spread-versus-expected-loss and
the distressed buyer's discounted-recovery) coexisting as they should. **G8 is ✅ and is the best
node in the tree**: a default's information reaches other issuers as realised recovery
(`creditRecoveryRate`) feeding every name's `expectedLossBps` plus the estate writing its residual
off its holders' equity — contagion with no correlation parameter anywhere, exactly as the node asks.

### SCOPED OUT, DELIBERATELY

- **E7** is ⚠️ and not ❌ on purpose: banks consume capital (`leverageHeadroomUSD`) and insurers and
  pensions carry a real spread-risk charge in their reservation (`spreadRiskCapitalChargeRate`), but
  no non-bank has a capital constraint that BOUNDS its size — its budget is cash
  (`maxNetPurchaseUSD`). The node itself says a pension fund's constraint is a mandate rather than a
  charge; which of the two each holder faces is a modelling choice, not an omission.
- **E9** is ⚠️ for one reason only: the statement shows the position, its income and its P&L, and it
  cannot show a price, because D2 has none to show. It closes when step 13 does.
- **F3** is ⚠️ because every corporate tranche in the model is a bullet — there is no amortiser and
  therefore no scheduled principal (A3.a's other half). Whether a corporate amortiser should exist
  is a modelling choice; that coverage never counts principal is not, and it is A3.a's finding.
