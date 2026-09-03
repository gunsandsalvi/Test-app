# SYSTEM: THE CENTRAL BANK

The issuer of reserves and the setter of the policy rate. Its balance sheet, its operations and
its relationship with the treasury. The corridor it runs is in `money-market.md` C; this tree is
the institution behind it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IT IS
- **A1** REASON — the **monopoly issuer of reserves** in its currency
  - A1.a which is why it can always meet an obligation in that currency, and why it can never run
    out — see `sovereign-credit.md` A4.b
- **A2** REASON — it has a **balance sheet**, and it is a real one
  - A2.a **liabilities**: reserves, currency, the treasury's account, the reverse-repo window
  - A2.b **assets**: sovereign paper, loans to banks, FX reserves, claims on other central banks
  - A2.c VERIFY — assets = liabilities + its own equity, every week, and its equity includes a
    **revaluation account** for positions held in another money
- **A3** REASON — it has a **mandate**: an objective it is trying to achieve, stated
- **A4** REASON — it is **independent of the treasury operationally** and owned by it financially,
  and both halves have consequences (E)

### B. THE POLICY RATE
- **B1** REASON — it **sets** a rate, as a decision, on a rule or a judgement
  - B1.a against its mandate: inflation against target, activity against capacity
- **B2** REASON — the rate is **administered, not traded**: it is a price it declares
- **B3** REASON — it makes the rate **effective** through the corridor (`money-market.md` C), not
  by assertion
  - B3.a FORBID — the policy rate never appears directly as a market's cleared rate. If the money
    market's rate equals the policy rate by construction, the corridor is decoration
- **B4** VERIFY — the market rate tracks the policy rate **because** of B3, and the gap is
  information

### C. OPEN-MARKET OPERATIONS
- **C1** REASON — it **buys and sells** sovereign paper, in a size **it** chooses
  - C1.a the size is set by **policy**, never by an auction's weakness
  - C1.b FORBID — it is not a buyer of last resort in the primary market. That is what primary
    dealers' obligations are for (`sovereign-credit.md` C3.a)
- **C2** REASON — a purchase **creates reserves**; a sale destroys them
  - C2.a it pays with money it creates, so there is no debit anywhere. That is what a central-bank
    purchase IS
- **C3** REASON — it is a **price-taker in the auction**: it posts a quantity, not a level
- **C4** REASON — **reinvestment** of maturities is a separate decision from new purchases, and
  the difference is QT

### D. LENDING TO BANKS
- **D1** REASON — the **standing facility**: it lends against collateral at a stated rate
- **D2** REASON — **collateral eligibility and haircuts** are its choice, and they are a policy
  instrument in themselves
- **D3** REASON — **the lender of last resort**: freely, against good collateral, at a penalty, to
  the solvent
  - D3.a FORBID — drop any of the four and it is a subsidy. In particular it does not lend to a
    bank that is **insolvent** — that bank goes to `banks-capital-and-resolution.md` C3
- **D4** REASON — it can **refuse**, and refusal must be reachable

### E. THE TREASURY RELATIONSHIP
- **E1** REASON — the treasury **banks with it**, and its account is a liability (A2.a)
- **E2** FORBID — **no automatic overdraft.** See `sovereign-credit.md` A3.b: an advance that
  appears whenever the account is empty converts a fiscal failure into an accounting entry
- **E3** REASON — **remittance**: its net income goes to the treasury, because the treasury owns it
  - E3.a income, not revaluation. An unrealised FX gain is not remitted (A2.c)
- **E4** REASON — it can make a **loss**, and a loss is not remitted — it reduces its equity, and
  the treasury may have to make it good
- **E5** VERIFY — its holding of sovereign debt is economically consolidated away and
  accounting-wise is not (`sovereign-credit.md` H5)

### F. FX
- **F1** REASON — it holds **reserves in other currencies**, and they are real assets
- **F2** REASON — it can **intervene**, bounded by F1 — and a bank at zero cannot defend anything
  - F2.a which is why a peg breaks: the constraint is real, not a rule
- **F3** REASON — its foreign claims **revalue**, into A2.c's revaluation account
- **F4** REASON — **claims on other central banks** from cross-border settlement are bilateral and
  sum to zero across the world

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 the monopoly issuer of reserves | `src/engine/ledger/party.ts:CENTRAL_BANK` | ✅ |
| A1.a it can always meet an obligation in its own money | `src/engine/simulation/stages/central-bank-demand.ts:applyCentralBankFills` | ✅ |
| A2 it has a balance sheet, and a real one | `src/domain/central-bank.ts:CentralBank` | ✅ |
| A2.a liabilities: reserves, currency, the TGA, the RRP window | `src/domain/central-bank.ts:centralBankLiabilitiesUSD` | ✅ |
| A2.b assets: sovereign paper, loans to banks, FX, foreign claims | `src/domain/central-bank.ts:centralBankAssetsUSD` | ✅ |
| A2.c VERIFY it closes weekly, with a revaluation account | `src/engine/audit/money.ts:m1` | ✅ |
| A3 a mandate: a stated objective | `src/domain/region-macro.ts:targetInflation` | ⚠️ |
| A4 operationally independent, financially owned | `src/domain/central-bank.ts:remittanceUSD` | ✅ |
| B1 it SETS a rate, as a decision, on a rule | `src/engine/macro/evolution.ts:taylorTarget` | ✅ |
| B1.a against its mandate: inflation and activity | `src/engine/macro/evolution.ts:inflation_gap` | ✅ |
| B2 administered, not traded | `src/domain/region-macro.ts:policyRate` | ✅ |
| **B3 made effective through the corridor, not by assertion** | `src/engine/simulation/stages/repo-clearing.ts:runRegionalRepoSession` | ⚠️ |
| **B3.a FORBID the policy rate is never a market's cleared rate** | `src/engine/simulation/stages/repo-clearing.ts:parkUnlentSleevesAtTheWindow` | ⚠️ |
| B4 VERIFY the market rate tracks policy, and the gap is information | `src/engine/audit/prices.ts:repo` | ⚠️ |
| C1 it buys and sells sovereign paper, in a size it chooses | `src/domain/central-bank.ts:openMarketPolicy` | ✅ |
| C1.a the size is policy, never an auction's weakness | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:plannedPurchasesByBond` | ✅ |
| C1.b FORBID not a buyer of last resort in the primary market | `src/engine/simulation/stages/central-bank-demand.ts:centralBankParticipant` | ✅ |
| C2 a purchase creates reserves; a sale destroys them | `src/engine/simulation/stages/central-bank-demand.ts:applyCentralBankFills` | ⚠️ |
| C2.a it pays with money it creates, so there is no debit | `src/engine/simulation/stages/central-bank-demand.ts:applyCentralBankFills` | ✅ |
| C3 a price-taker: it posts a quantity, not a level | `src/engine/simulation/stages/central-bank-demand.ts:NO_RESERVATION_STAT` | ✅ |
| C4 reinvestment is a separate decision; the difference is QT | `src/domain/central-bank.ts:reinvestmentShare` | ✅ |
| D1 the standing facility lends against collateral at a stated rate | `src/engine/macro/banking.ts:SRF_SPREAD_BPS` | ✅ |
| D2 eligibility and haircuts are ITS choice, a policy instrument | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ⚠️ |
| **D3 lender of last resort: freely, good collateral, penalty, solvent** | `src/engine/simulation/stages/bank-lending.ts:raiseCentralBankLoanUSD` | ❌ |
| **D3.a FORBID it does not lend to an insolvent bank** | `src/engine/simulation/stages/bank-funding-close.ts:runBankFundingCloseStage` | ❌ |
| **D4 it can REFUSE, and refusal must be reachable** | — | ❌ |
| E1 the treasury banks with it; the account is a liability | `src/engine/ledger/accounts.ts:treasuryAccountOf` | ✅ |
| **E2 FORBID no automatic overdraft** | `src/engine/ledger/accounts.ts:waysAndMeansOf` | ❌ |
| E3 remittance: its net income goes to the treasury | `src/domain/central-bank.ts:remittanceUSD` | ✅ |
| E3.a income, not revaluation | `src/domain/central-bank.ts:fxRevaluationUSD` | ✅ |
| E4 it can make a loss, which reduces its equity | `src/engine/simulation/stages/central-bank.ts:runCentralBankStage` | ⚠️ |
| E5 VERIFY consolidated economically, not in the accounts | `src/domain/central-bank.ts:centralBankSovereignBookUSD` | ❌ |
| F1 it holds reserves in other currencies, as real assets | `src/domain/central-bank.ts:fxReservesByRegion` | ✅ |
| F2 it can intervene, bounded by F1 | `src/engine/simulation/stages/fx-clearing.ts:defenceBudgetUSD` | ✅ |
| F2.a which is why a peg breaks: the constraint is real | `src/engine/simulation/stages/fx-clearing.ts:cbBoughtUSD` | ✅ |
| F3 foreign claims revalue into A2.c's account | `src/engine/simulation/stages/fx-revaluation.ts:fxRevaluationUSD` | ✅ |
| F4 claims on other central banks are bilateral and sum to zero | `src/domain/central-bank.ts:foreignOfficialClaimsUSD` | ✅ |

---

## 3. THE DIFF

### ❌ D3 / D3.a / D4 — THERE IS NO LENDER OF LAST RESORT, THERE IS A CREDIT LINE. KNOWN(20-LLR)

Bagehot's rule is four conditions and `raiseCentralBankLoanUSD` (`bank-lending.ts:917`) has one and a
half:

| Bagehot | code |
|---|---|
| freely | ✅ — it lends exactly the shortfall, every time |
| against good collateral | ❌ — no collateral is named, tested or encumbered |
| at a penalty | ⚠️ — `policy + SRF_SPREAD_BPS + CENTRAL_BANK_LOAN_PENALTY_BPS` = policy + 125bp, the same for every bank, and it is paid at `02b:464` while the sheet's own margin statistic charges a *different* rate (see `banks-funding-and-liquidity.md` B2) |
| to the solvent | ❌ — nothing in `bank-funding-close.ts` reads `isBankUnderPca`, or capital, or anything else |

D4 (refusal reachable) has no code path whatever: the function's only early return is
`shortfallUSD < 1e6`. **The central bank cannot say no**, and since the funding-close runs at stage
417 of ~50 named stages — after resolution's own trigger has *not* fired and before
`bank-resolution` at 418 — a bank that is about to be closed is funded first.

Note what this is NOT: `runRegionalRepoSession`'s standing-facility seat IS a proper facility. It is
collateralised (`unencumberedBorrowingCapacityUSD` bounds the borrower's size), priced (`srfBps -
SRF_SEAT_STEP_BPS`, a posted rate with an elastic quantity), and a bank out of eligible paper simply
does not appear as a borrower. **The model has a disciplined facility and an undisciplined one, and
the undisciplined one runs later** — which is rule 4's defect and exactly what 20-LLR names as the
escape hatch from the disciplined one. **Already §3 step 20-LLR.**

### ❌ E2 — THE TREASURY HAS AN AUTOMATIC OVERDRAFT HERE, ON THIS SHEET

Recorded in full as `the-treasury.md` D3, and this is the central bank's side of the same row: the
advance is an ASSET of this institution. `waysAndMeansOf(v2, region)` is `max(0, -treasuryNetOf)` —
the treasury's account is one signed row and its negative side is carried into
`centralBankAssetsUSD` as the last term (`central-bank.ts:136`), charged the policy rate every week
by `central-bank.ts:49` and remitted straight back to the treasury at `:60`. `ui/objects/centralbank.tsx`
labels it for the player as "the treasury's overdraft here".

Two things belong to this tree rather than the treasury's:
- **the advance is never a decision.** A real ways-and-means facility is a lending act with a limit;
  here it appears by arithmetic, because the account is one row that may go negative. Nothing
  approves it, nothing caps it, and D4's refusal does not exist for this borrower either — the same
  hole as D3, in the other direction.
- **the interest round-trips.** The treasury pays the policy rate on the advance and the central
  bank remits it back in the same stage, in the same week, in full (`remitUSD` includes
  `waysAndMeansInterestUSD`). So the advance is not merely available, it is **free**, and E3's
  remittance is what makes it free.

The mechanism belongs to `the-treasury.md` D3 and is that tree's finding. **Already a §3 step-to-be
named there;** attach the "no facility without an approval and a cap" half to it.

### ⚠️ B3 / B3.a / B4 — THE CORRIDOR IS REAL AND ALMOST NOTHING RIDES ON IT

B3 says the rate is made effective through the corridor and not by assertion. The corridor genuinely
works: `runRegionalRepoSession` clears from real reservations (a bank lender's outside option is
IOR = policy, a non-bank's is the RRP, and the SRF seat caps the top), the RRP window really removes
cash from the system (`parkUnlentSleevesAtTheWindow` → `drawReverseRepoAtTheClose` pays
`INSTITUTION → CENTRAL_BANK`), and `audit/prices.ts:104` asserts the print sits inside ±150bp of
policy every week.

And then **almost nothing reads the cleared rate.** `reg.repoRateAnnual` is consumed by the money
fund's yield quote, the IRS floating leg, and four UI panels. Every price that matters to the real
economy reads `reg.policyRate` directly: the SME all-in rate is `policyRate + margin`
(`bank-lending.ts:266`), the deposit rate is a share of `policyRate + ownSpread`
(`macro/banking.ts:399`), the corporate revolver is `policyRate + facilityMarginBps`, the SRF and
RRP are policy ± a posted spread. So transmission IS assertion, with a correctly-modelled corridor
running beside it — which is B3.a's warning in its second form: not that the market's rate equals
policy by construction, but that the corridor could print anything and the economy would not notice.

Two smaller B3.a exposures worth naming: the session's no-borrower branch returns `rrpBps / 10000`
as a **literal** (`repo-clearing.ts:359`) — the code's own comment records that this made the
corridor assertion pass vacuously for eight commits — and `reg.repoRateAnnual` is seeded at
`policyRate - 20bp` (`macro/initialization.ts:558`).

**Becomes a §3 step**, and it is the natural successor to 20-LLR: once the session clears at the
close against the week's real flows, the thing to do with the print is to make the loan and deposit
books read it instead of the policy rate.

### ⚠️ D2 — THE HAIRCUT IS THE MARKET'S, NOT THE CENTRAL BANK'S

`computeSovereignRepoHaircuts` is duration × 2σ of the bucket's own observed weekly yield changes —
a genuinely derived lender's protection, and the right answer for a *private* repo lender. But this
same table is what the standing facility lends against, and D2's point is that eligibility and
haircuts are the central bank's CHOICE and a policy instrument in their own right: widening
eligibility in a stress is one of the two things a central bank actually does. Here the facility's
terms tighten automatically exactly when the curve turns volatile — procyclical, and with nobody
deciding it. Eligibility is likewise not a choice but a scope decision (`domain/repo.ts:16`,
"Sovereign general collateral only, deliberately"), which is **OUT OF SCOPE and says so**. The
haircut being un-chosen is the live half. Small; **becomes a §3 step** or joins 20-LLR's follow-on.

### ⚠️ C2 / E4 — TWO HALVES THAT NEVER HAPPEN

C2: a purchase creates reserves and this is exactly right (`applyCentralBankFills` books the paper
with no debit anywhere, and `central-bank-demand.ts:9` explains why). The *sale* half does not
exist: `centralBankParticipant` sets `minHoldingUSD: heldUSD`, so the central bank never sells, and
QT is runoff only (`openMarketPolicy` returns a `reinvestmentShare` below 1 and nothing else). The
comment states this as deliberate — "a central bank selling its book outright is a rarer operation
than QT and is not this" — so it is **OUT OF SCOPE**, stated.

E4 is not. `runCentralBankStage` computes `remitUSD` and when it is negative pays
`GOVERNMENT → CENTRAL_BANK` for the whole of it, the same week, with the reason "treasury covers the
central bank's loss". So the loss never sits on the central bank's equity — E4's "it reduces its
equity, and the treasury MAY have to make it good" becomes "the treasury always makes it good
immediately". The famous case E4 exists for (a central bank in deferred-asset territory after a
hiking cycle) cannot happen. `central-bank.ts:13` states the design — "The CB is the one balance
sheet allowed to be special: no capital constraint, never defaults" — which is right about the
constraint and over-broad about the equity. Small; **becomes a §3 step** paired with the E5 read.

### ❌ E5 / A3 — A VERIFY NOBODY TAKES, AND A MANDATE THAT IS A FIELD

E5 (the consolidated and unconsolidated views of the central bank's sovereign holding) is never
computed: `centralBankSovereignBookUSD` exists and the treasury's gross debt exists, and nothing
differences them. **A measurement, for §3 step 38.**

A3: the mandate is `region.targetInflation` plus the Taylor rule's implicit output-gap term. It is a
number on a region, not a stated objective the institution owns, so there is no place for a second
mandate (financial stability, employment) or for a mandate that differs by region beyond a
parameter. Worth a row; not worth a step of its own.
