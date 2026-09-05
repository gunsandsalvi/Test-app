# SYSTEM: BANKS — LENDING

A bank's asset side: the loans it writes, to whom, at what price, and what happens when they go
bad. Excludes its funding (`banks-funding-and-liquidity.md`) and its capital
(`banks-capital-and-resolution.md`), which are the same balance sheet read from the other two
directions.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A LOAN IS
- **A1** REASON — a **bilateral contract** between a named bank and a named borrower
  - A1.a it is **not** a security: it is not transferable by default and has no market price
  - A1.b it is therefore carried differently — see D
- **A2** REASON — terms fixed at origination: principal, maturity, rate or margin, currency
- **A3** REASON — a **drawdown structure**: term loan drawn at once, or a **facility** drawn and
  repaid at the borrower's option
  - A3.a an undrawn commitment is a **real obligation of the bank** and consumes something
  - A3.b VERIFY — undrawn commitments are visible; a facility that costs nothing until drawn is
    a free option the bank did not sell
- **A4** REASON — **security**: secured on named collateral, or unsecured
- **A5** REASON — **covenants**, and a breach is an observable event

### B. WRITING IT — WHERE THE MONEY COMES FROM
- **B1** REASON — **a bank lends by creating a deposit.** The loan appears on one side and the
  borrower's balance on the other, at the same instant
  - B1.a **no reserve leaves the bank at origination.** This is the whole of endogenous money
  - B1.b reserves move only when the borrower **spends** it to a customer of another bank, and
    then as an ordinary payment (`money-and-settlement.md` C2.a)
  - B1.c FORBID — a bank does not lend "out of" its deposits or its reserves. A model in which it
    does cannot produce a credit cycle
- **B2** REASON — but the bank is **constrained**, and the constraints are real and separate
  - B2.a **capital**: the loan consumes it (`banks-capital-and-resolution.md` B)
  - B2.b **liquidity**: the deposit it created may be spent away, and it must fund that
  - B2.c **its own risk appetite**, which is a decision
  - B2.d VERIFY — which constraint binds is an outcome and differs by bank and by week

### C. THE PRICE
- **C1** REASON — the bank **quotes a rate**, built from its own economics
  - C1.a its **cost of funds**
  - C1.b the borrower's **expected loss** — a PD and an LGD it assesses itself
  - C1.c the **capital** the loan consumes, times its required return on it
  - C1.d an **operating cost** of making the loan
- **C2** REASON — the borrower **accepts or refuses**, and can go elsewhere
  - C2.a so the rate is the outcome of a negotiation, not a schedule the bank imposes
- **C3** REASON — the bank can **decline**, and declining is the credit decision
  - C3.a VERIFY — declined volume is visible. A bank that never says no has no credit standard
- **C4** FORBID — **one PD model per borrower.** Two models that disagree mean the price and the
  provision are struck against different beliefs

### D. CARRYING IT
- **D1** REASON — held at **amortised cost**, not marked to a market that does not exist (A1.a)
- **D2** REASON — a **provision** against expected loss, taken as a charge to income
  - D2.a it moves when the assessment moves, and the movement is an income event
  - D2.b FORBID — a provision is never a reserve that quietly absorbs losses. It is booked, and
    the booking is visible
- **D3** REASON — interest **accrues** and is **received**, and non-payment is observable
- **D4** REASON — a loan can be **sold or syndicated**, and then it has a price and a buyer
- **D5** REASON — it can be **pledged** to the central bank or in repo, at a haircut

### E. WHEN IT GOES BAD
- **E1** REASON — a missed payment or a covenant breach is an **EVENT**
- **E2** REASON — the loan is **reclassified**: performing → impaired, with a bigger provision
- **E3** REASON — **workout**: restructure, extend, or enforce — and each is a decision with a cost
- **E4** REASON — **enforcement**: the collateral is realised for what it fetches
- **E5** REASON — the **write-off**: the loan leaves the book and the loss hits capital
  - E5.a VERIFY — the loss that reaches capital equals principal minus recovery minus provisions
    already taken. Double-counting a provision flatters capital
- **E6** REASON — losses are **correlated across borrowers**, because they share a cause

### F. THE BOOK IN AGGREGATE
- **F1** REASON — the book is the **sum of named loans**, never a scalar that grows by a rate
  - F1.a FORBID — no "loan book" number that is not Σ(loans). A book with no loans in it cannot
    default, cannot be provisioned and cannot be sold
- **F2** VERIFY — new lending, amortisation, prepayment and write-off account for the change
- **F3** REASON — **concentration**: exposure to one name, one sector, one region is measurable and
  is a risk the bank manages

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a bilateral contract, named bank and named borrower | `src/domain/banking.ts:BankLoan` | ✅ |
| A1.a not a security, no market price | `src/engine/audit/ownership.ts:isBankFacility` | ✅ |
| A1.b carried differently | `src/domain/banking.ts:annuityWeeklyPrincipalLocal` | ✅ |
| A2 terms fixed at origination | `src/domain/banking.ts:BankLoan` | ✅ |
| A3 a drawdown structure: term loan or facility | `src/engine/ledger/tranche-ledger.ts:drawRevolver` | ✅ |
| **A3.a an undrawn commitment consumes something** | — | ❌ |
| A3.b VERIFY undrawn commitments are visible | — | ❌ |
| A4 security: named collateral, or unsecured | `src/domain/banking.ts:MortgageVintage` | ⚠️ |
| A5 covenants, and a breach is an observable event | `src/engine/simulation/stages/bank-lending.ts:SME_SERVICEABLE_LEVERAGE` | ⚠️ |
| B1 a bank lends by creating a deposit | `src/engine/ledger/party.ts:BANK_CREDIT` | ✅ |
| B1.a no reserve leaves at origination | `src/engine/ledger/party.ts:BANK_CREDIT` | ✅ |
| B1.b reserves move when the borrower spends it | `src/engine/simulation/stages/settlement.ts:runSettlementStage` | ✅ |
| B1.c FORBID it does not lend out of deposits or reserves | `src/engine/simulation/stages/bank-lending.ts:runBankWeeklyLending` | ✅ |
| B2 the bank is constrained, and the constraints are separate | `src/domain/bank-pricing.ts:bankRwaLocal` | ⚠️ |
| B2.a capital: the loan consumes it | `src/domain/bank-pricing.ts:BANK_MIN_CAPITAL_RATIO` | ✅ |
| **B2.b liquidity: it must fund the deposit it created** | — | ❌ |
| B2.c its own risk appetite | `src/engine/simulation/stages/bank-lending.ts:bankRequiredReturnAnnual` · `src/domain/banking.ts:bankRunsOffItsBook` | ⚠️ |
| B2.d VERIFY which constraint binds is an outcome | — | ❌ |
| C1 it quotes a rate built from its own economics | `src/domain/bank-pricing.ts:quoteLoanMarginBps` | ⚠️ |
| **C1.a its cost of funds** | `src/engine/simulation/stages/bank-lending.ts:allInRateAnnual` | ⚠️ |
| C1.b the borrower's expected loss — PD and LGD | `src/engine/simulation/stages/shared-helpers.ts:computeAnnualDefaultProbability` | ✅ |
| C1.c the capital consumed, times its required return | `src/engine/simulation/stages/bank-lending.ts:bankRequiredReturnAnnual` | ✅ |
| C1.d an operating cost of making the loan | `src/domain/banking.ts:MORTGAGE_OPERATING_COST_BPS` | ⚠️ |
| C2 the borrower accepts or refuses, and can go elsewhere | `src/engine/simulation/stages/bank-lending.ts:planSmeShopping` | ✅ |
| C2.a so the rate is a negotiation, not a schedule | `src/engine/simulation/stages/bank-lending.ts:currentMortgageRateAnnual` · `src/engine/simulation/stages/bank-lending.ts:planSmeShopping` | ✅ |
| C3 the bank can decline | `src/engine/simulation/stages/bank-lending.ts:declinedOriginationLocal` | ✅ |
| C3.a VERIFY declined volume is visible | `src/engine/simulation/stages/context.ts:g2DeclinedOriginationLocal` | ⚠️ |
| C4 FORBID one PD model per borrower | `src/engine/simulation/stages/shared-helpers.ts:computeAnnualDefaultProbability` | ✅ |
| D1 held at amortised cost | `src/domain/banking.ts:annuityWeeklyPrincipalLocal` | ✅ |
| **D2 a provision against expected loss, charged to income** | `src/domain/banking.ts:loanLossProvisionRateAnnualPct` | ❌ |
| D2.a it moves when the assessment moves | — | ❌ |
| D2.b FORBID a provision is never a quiet reserve | `src/engine/ledger/bank-book.ts:bookPnL` | ✅ |
| D3 interest accrues and is received; non-payment observable | `src/engine/simulation/stages/bank-lending.ts:loanInterestWeeklyLocal` | ⚠️ |
| **D4 a loan can be sold or syndicated** | `src/engine/ledger/tranche-ledger.ts:moveFacilityLender` | ⚠️ |
| **D5 it can be pledged to the central bank or in repo** | `src/engine/simulation/stages/repo-clearing.ts:unencumberedBorrowingCapacityLocal` | ❌ |
| **E1 a missed payment or covenant breach is an EVENT** | — | ❌ |
| **E2 the loan is reclassified: performing → impaired** | `src/domain/banking.ts:status` | ❌ |
| E3 workout: restructure, extend or enforce | `src/domain/bank-pricing.ts:creditRecoveryRate` | ⚠️ |
| E4 enforcement: the collateral is realised | `src/domain/banking.ts:FORECLOSURE_COST_SHARE` | ⚠️ |
| E5 the write-off: the loss hits capital | `src/engine/ledger/bank-book.ts:bookPnL` | ✅ |
| E5.a VERIFY loss = principal − recovery − provisions taken | `src/engine/simulation/stages/bank-lending.ts:loanLossWeeklyLocal` | ⚠️ |
| E6 losses are correlated because they share a cause | `src/domain/bank-pricing.ts:consumerAnnualLossRate` | ✅ |
| F1 the book is Σ named loans | `src/domain/banking.ts:businessLoanBookOf` | ✅ |
| F1.a FORBID no loan-book number that is not Σ(loans) | `src/domain/banking.ts:consumerLoanBookOf` | ✅ |
| F2 VERIFY origination, amortisation, prepayment and write-off account for the change | — | ❌ |
| **F3 concentration by name, sector and region** | `src/engine/simulation/stages/09-concentration-risk.ts:runConcentrationRiskStage` | ❌ |

---

## 3. THE DIFF

### ❌ E1 / E2 — A BANK LOAN CANNOT DEFAULT. IT ERODES. NEW

`BankLoan.status` is declared `'PERFORMING' | 'DEFAULTED'` (`banking.ts:581`) and **the string
`'DEFAULTED'` is never assigned anywhere in the tree** — a grep over `src` finds the type
declaration and nothing else. What happens instead is at `bank-lending.ts:243`:

```
const lossLocal = (l.principalLocal * smePoolAnnualPd(seg) * (1 - creditRecoveryRate(reg))) / 52;
return { ...l, principalLocal: l.principalLocal - lossLocal };
```

Every loan loses its expected loss, every week, continuously — `principal × PD × LGD / 52`. The
mortgage books do the same per vintage (`:685`). So the whole of section E collapses into one
smooth deduction: there is no missed payment, no reclassification, no workout decision, no
enforcement date and no discrete write-off. E5 is satisfied only in the trivial sense that the
erosion does reach capital through `bookPnL`.

Consequence: **credit loss carries no information and no timing.** A borrower cannot surprise its
lender; a bad week cannot cluster into an event; `E1`'s "EVENT" — the thing every provisioning,
workout and resolution mechanism keys off — has no representation, which is also why D2 and E2 have
nowhere to attach. It is the loan-book twin of what §3.20-LLR says about liquidity: the failure mode
exists as a field and never fires. **§3 step 37-LOSSRATE**, and a substantial one — it needs a hazard
draw per borrower rather than a rate applied to principal, plus the reclassify/workout/write-off
path behind it.

### ❌ D2 / D2.a — THERE IS NO PROVISION, ONLY A REALISED LOSS RATE. NEW

`loanLossProvisionRateAnnualPct` is a misnomer: nothing on any sheet is a provision STOCK. It is a
reported annual loss rate (`macro/banking.ts:527` carries it; `profiles/bank.ts:43` multiplies the
book by it for the P&L profile; `shared-helpers.ts:116` reads it into the bank's own PD). The charge
to income and the reduction of the asset are the same act, at the same instant, every week.

So the node's whole point — that an *assessment* is booked before the loss arrives, and that
revising the assessment is itself an income event — is absent. D2.b's FORBID is satisfied by
accident: a provision cannot quietly absorb a loss when there is no provision. But E5.a becomes
vacuous with it (there are no provisions to double-count), and a bank cannot show the one thing a
provision exists to show: that it saw the loss coming. Pairs with E1 above; the same step.

### ❌ D5 / B2.b — THE COLLATERAL AND LIQUIDITY WIRES ARE CUT AT THE LOAN BOOK

D5: `unencumberedBorrowingCapacityLocal` and `unencumberedByBond` read the bank's own sovereign rows on the
register (§9.13-BOOK d3b) and nothing else. `domain/repo.ts:16` states the scope decision explicitly — "Sovereign general
collateral only, deliberately" — so a loan cannot be pledged, and a bank whose assets are loans has
zero borrowing capacity however good the loans are. **That half is OUT OF SCOPE and says so**, and
the money-market tree's B3.a is satisfied by it.

B2.b is not out of scope and is simply missing. Origination is gated by `equityLocal /
BANK_MIN_CAPITAL_RATIO - currentRwaLocal` (`bank-lending.ts:275`, `:661`) and by nothing about cash,
collateral or funding. A bank at its buffer floor and financed entirely by the central bank writes
the same book as one flush with reserves. Recorded on the funding tree as D4 and belongs to the same
step; it is here because C's price and B2's constraint set are what it distorts.

### ❌ A3.a / A3.b — A COMMITTED LINE IS A FREE OPTION

`committedLineHeadroomLocal` bounds ONE of the three draw paths (`stage08-back.ts:1189`, the liquidity
shortfall). A withdrawn refinancing does not consult it at all: it draws the whole maturing
principal (`stage08-back.ts:1613`). The close sweep's tap tests the BANK's room since §9.20-ii
(`leverageHeadroomLocal`, refused past it) but not the LINE's — the committed amount is still not an
object anywhere. Beyond that, **no undrawn commitment
exists as an object**: there is no line, no limit and no unused balance on either book, so the bank
holds no capital against it, cannot report it, and cannot be surprised by a drawdown. The bank's
side of step 20's "real capacity" landed as §9.20-ii; the commitment as an object is new and small,
and is what is left of this node.

### ❌ F3 — NO LARGE-EXPOSURE LIMIT, AND THE CODE SAYS SO

`09-concentration-risk.ts:82` states it in its own comment: what it measures is TRADE concentration
over the contract book, and "a bank's large-exposure limit is a different concentration over a
different book". Nothing computes exposure to one name, one sector or one region on a bank's loan
book, so a bank can hold its entire book against a single SME pool and nothing reads it. With E6
(correlated losses) genuinely present through the shared unemployment print and the pool PDs, the
absence of F3 means the model has the risk and not the constraint. **§3 step 37-SMALL**, small.

### ⚠️ C1.a / C1 — THE COST OF FUNDS IS THE POLICY RATE, FOR EVERY BANK

The margin (`quoteLoanMarginBps`) is expected loss plus capital cost, with no funding term, and the
all-in rate is assembled at the call site as `policyRate + margin/10000`
(`bank-lending.ts:266`; the mortgage quote as `tenor10Y + margin`, `:625`). C1.a's input therefore
does not exist and the node it points at — `banks-funding-and-liquidity.md` B2 — is `❌` for the
same reason. Full statement of the finding, including the second inconsistent rate on the
central-bank loan, is on that tree's B2 row. **§3 step 37-COSTOFCAPITAL** (recorded once, there).

### ✅ C2 / C2.a — THE BORROWER HAS A PRICE RESPONSE AND A CHOICE

The SME schedule has a real demand curve in price: `appetite = (poolReturnAnnual - allInRateAnnual)
/ poolReturnAnnual`, the borrower refusing when the loan costs more than the project earns. *2026-09-05
(§9.20c-ii):* and "elsewhere" exists. `planSmeShopping` plans each region's week once: every lending
bank quotes each pool its all-in rate, the banks are walked keenest first, each takes what the pool
still wants at its price up to the capital headroom it has left across every pool, and what no
headroom covers at a quote the pool wanted is declined. A wide quote is a lost loan, a bank running
its book off (§9.20c-i) quotes nothing and hands its share to the next bank, and the price of
credit is the keenest bank's — the way `currentMortgageRateAnnual` already shops housing.

### ⚠️ A4 / A5 / E3 / E4 — PRESENT AS PARAMETERS, ABSENT AS EVENTS

`A4` security: only mortgages carry named collateral (`MortgageVintage.originationCollateralLocal`,
marked against the region's median price). A `BankLoan` has no collateral field at all, so every
business loan is unsecured by construction while being priced at a recovery rate that assumes
otherwise (`CREDIT_RECOVERY_RATE = 0.4`). `A5` covenants: `SME_SERVICEABLE_LEVERAGE = 3.0` is a
ceiling on how much is lent, not a covenant that can be breached. `E3` workout:
`creditRecoveryRate` measures realised recoveries and blends them against a prior — a real
measurement, but of an outcome nobody decided. `E4` enforcement: `FORECLOSURE_COST_SHARE` and
`mortgageSeverityAtLtv` are a severity curve on a continuous loss, not a realisation with a date and
a buyer. All four are downstream of E1: give a loan an EVENT and each of them has somewhere to
happen.

### A measurement, for §3 step 38: C3.a, B2.d, F2

`declinedOriginationLocal` is computed per bank, summed per region into
`ctx.g2DeclinedOriginationLocal` — **and read by nothing.** Same for B2.d (which constraint bound) and
F2 (the book's flow reconciliation), neither of which is computed at all. C3.a in particular is
worth taking as a standing read the moment B2.b exists, because "a bank that never says no" is
exactly what a capital-only gate produces.

### Also marked, briefly

- **A3 ✅** (2026-09-05, §9.16-i) — a borrower has ONE revolver per lending bank (`instrument-keys.ts:revolverTrancheId`), and every draw path — liquidity, a withdrawn refinancing, a refused paper roll, the overdraft conversions at 02b and the close — TAPS it (`tranche-ledger.ts:drawRevolver`, at par, at the margin the line was struck at), opening it only when none is live; the five ids that minted a facility per draw and per week are gone, and so is the 350bp fallback a facility with no margin rode. Headroom still gates one path only — the A3.a/A3.b entry.
- **B2.c ⚠️** — `bankRequiredReturnAnnual` is a per-bank number, not an appetite that moves with the bank's state.
- **C1.d ⚠️** — the mortgage quote carries `MORTGAGE_OPERATING_COST_BPS`; the business quote carries no operating cost at all.
- **D3 ⚠️** — interest accrues and is received; non-payment is unobservable because there is no event — E1.
