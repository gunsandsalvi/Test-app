# SYSTEM: THE MONEY MARKET

Where a bank funds its reserve position: the interbank market, repo, and the central bank's
corridor around them. The system §3.20-LLR is about. Excludes the central bank's policy choices
(its own system) and the collateral's own valuation (the sovereign and credit trees).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments.

### A. THE NEED
- **A1** REASON — a bank's reserve position moves because **its customers paid other banks'
  customers**. Nobody decided it; it is the residue of everyone else's week
  - A1.a in aggregate the system's reserves are unchanged — they are **redistributed**
  - A1.b therefore one bank's deficit **is** another's surplus, by construction, and the market
    has two sides without anybody being assigned one
- **A2** REASON — a bank holds a position for its own reasons
  - A2.a **the buffer is a PREFERENCE derived from its own liabilities' liquidity, not a stated
    ratio** *(user: "A.2.a you choose")*. I choose derived: a bank whose funding is overnight
    household money needs more than one funded by term wholesale, and a single constant applied to
    every bank is the thing rule 2 forbids and §3.30b already names as the largest stated shape
    still moving cash. A regulatory floor may sit UNDER the preference; it is not the preference
  - A2.b VERIFY — missing it has a cost the bank can feel, or the buffer is decoration
- **A3** REASON — **the need is knowable only AFTER the day's flows**
  - A3.a therefore the market must clear after them. A session held before the flows is a session
    that cannot see the thing it exists to fund

### B. THE MARKET
- **B1** REASON — **every bank posts a schedule out of its own position and its own cost of funds.
  Who ends up lending and who ends up borrowing is the OUTCOME** *(user: "B1/B2 again not imposed,
  a consequence")*. Writing "surplus banks lend, deficit banks borrow" as a rule is assigning the
  answer: it licenses code that moves cash from a computed surplus to a computed deficit without
  anybody quoting a rate, which is rule 3's defect in the funding market
- **B2** REASON — **unsecured lending prices the borrower's name.** The lender has a view on
  getting it back, and that view is in its schedule
  - B2.a a name the market doubts pays more, **or finds no bid at all** — and refusal is a real
    outcome of a real schedule, not a special case
  - B2.b VERIFY — the spread between the strongest and weakest name is a measure of stress
- **B3** REASON — **secured lending (repo) prices the collateral, not only the name**
  - B3.a eligibility is defined per asset, and something is ineligible
  - B3.b haircuts by asset and tenor
  - B3.c pledged collateral is **encumbered** — it cannot be pledged twice, and running out of it
    is how a solvent bank stops being able to borrow
- **B4** REASON — a rate **clears** from those schedules meeting each other
- **B5** REASON — non-bank cash is in the same market: money funds, corporates, institutions
  - B5.a their alternative is the central bank's floor (C1) or bills directly — see the sovereign
    tree's E2.f
- **B6** REASON — tenor: overnight and term, each with its own book
  - B6.a VERIFY — the term/overnight spread is information about expected stress, not a parameter
- **B7** REASON — **the market can fail to clear for a name.** That is what a funding squeeze IS,
  and it must be representable

### C. THE CORRIDOR
- **C1** REASON — a **floor**: the central bank pays on reserves, or takes cash at a window
  - C1.a cash parked there **leaves the banking system** — a real consequence, not a bookkeeping
    move
- **C2** REASON — a **ceiling**: a standing facility that lends
- **C3** VERIFY — the market rate sits inside the corridor; its width is a policy choice
- **C4** REASON — the facility is **collateralised** and **priced above the market**
  - C4.a so a bank prefers the market, and **drawing the facility is information**
  - C4.b a bank out of eligible collateral **cannot draw** — the constraint has to bite
- **C5** FORBID — **there is no uncollateralised, unpriced, unlimited central-bank credit.** A
  facility with none of Bagehot's conditions is not a lender of last resort; it is a subsidy that
  makes B7 and D unreachable

### D. WHEN A NAME CANNOT FUND
- **D1** REASON — it **shrinks**: it sells assets, at whatever they fetch, and the sale is a real
  order in a real book
- **D2** REASON — it **bids up for deposits**, and depositors respond to the rate
- **D3** REASON — it draws the facility, at the penalty, against collateral
- **D4** REASON — it **fails** — and failure for liquidity is a distinct event from failure for
  solvency, with a distinct trigger
- **D5** REASON — a **run**: depositors withdraw because they observe weakness
  - D5.a what they observe must be **observable** — a published ratio, a facility draw, a rate paid
  - D5.b VERIFY — a run is self-reinforcing, and the model should be able to show one
- **D6** REASON — the lender of last resort lends **freely, against good collateral, at a penalty,
  to the solvent**. All four. Drop one and C5 is violated

### E. TRANSMISSION
- **E1** REASON — the policy rate reaches the economy **through this market** and not by assertion
- **E2** VERIFY — a squeeze here raises funding costs elsewhere; it is a channel, not a scalar
- **E3** REASON — interbank exposure is a **contagion** path: a failure lands on its lenders by name

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 the position moves because customers paid other banks' customers | `src/engine/simulation/stages/settlement.ts:runSettlementStage` | ✅ |
| A1.a in aggregate reserves are redistributed, not changed | `src/engine/audit/money.ts:m1` | ✅ |
| A1.b so the market has two sides without anybody being assigned one | `src/engine/simulation/stages/repo-clearing.ts:bankSurplusLocal` | ✅ |
| A2 a bank holds a position for its own reasons | `src/engine/simulation/stages/bank-lending.ts:operatingCashBufferLocal` | ⚠️ |
| **A2.a the buffer is a PREFERENCE derived from its own liabilities** | `src/engine/macro/banking.ts:MIN_CASH_BUFFER_RATIO` | ⚠️ |
| A2.b VERIFY missing it has a cost the bank can feel | — | ❌ |
| **A3 the need is knowable only AFTER the day's flows** | `src/engine/simulation/stages/repo-clearing.ts:needByTicker` | ⚠️ |
| **A3.a therefore the market must clear after them** | `src/engine/simulation/stages/02b-bank-diversification.ts:runRegionalRepoSession` | ❌ |
| B1 every bank posts a schedule; who lends is the OUTCOME | `src/engine/simulation/stages/repo-clearing.ts:lenderSchedule` | ✅ |
| **B2 unsecured lending prices the borrower's name** | — | ❌ |
| B2.a a doubted name pays more, or finds no bid | — | ❌ |
| B2.b VERIFY the strongest-to-weakest spread measures stress | — | ❌ |
| B3 secured lending prices the collateral | `src/domain/repo.ts:RepoContract` · `src/engine/ledger/contract-ledger.ts:publishRepoBook` | ✅ |
| B3.a eligibility is per asset, and something is ineligible | `src/engine/simulation/stages/repo-clearing.ts:collateralCapacityLocal` | ✅ |
| B3.b haircuts by asset and tenor | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| B3.c pledged collateral is encumbered and cannot be pledged twice | `src/domain/collateral.ts:overPledgedByBond` | ✅ |
| B4 a rate CLEARS from those schedules meeting | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| B5 non-bank cash is in the same market | `src/engine/simulation/stages/settlement.ts:institutionSpendableLocal` | ✅ |
| B5.a its alternative is the floor, or bills directly | `src/engine/simulation/stages/money-market-fund.ts:quoteMmfNetYieldAnnual` | ✅ |
| B6 tenor: overnight and term, each with its own book | `src/engine/simulation/stages/repo-clearing.ts:REPO_TERM_WEEKS` | ✅ |
| B6.a VERIFY the term/overnight spread is information | `src/engine/simulation/stages/derivative-markets/irs.ts:overnightRateAnnual` | ⚠️ |
| **B7 the market can fail to clear for a name** | `src/engine/simulation/stages/repo-clearing.ts:unfundedTermLocal` | ⚠️ |
| C1 a floor: the CB pays on reserves, or takes cash at a window | `src/engine/simulation/stages/repo-clearing.ts:parkUnlentSleevesAtTheWindow` | ✅ |
| C1.a cash parked there LEAVES the banking system | `src/engine/simulation/stages/repo-clearing.ts:drawReverseRepoAtTheClose` | ✅ |
| C2 a ceiling: a standing facility that lends | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| C3 VERIFY the market rate sits inside the corridor | `src/engine/audit/prices.ts:repo` | ⚠️ |
| C4 the facility is collateralised and priced above the market | `src/engine/simulation/stages/repo-clearing.ts:SRF_SEAT_STEP_BPS` | ✅ |
| C4.a so a bank prefers the market; drawing is information | `src/domain/repo.ts:srfBorrowedLocal` | ✅ |
| C4.b a bank out of eligible collateral CANNOT DRAW | `src/engine/simulation/stages/repo-clearing.ts:unencumberedBorrowingCapacityLocal` | ⚠️ |
| **C5 FORBID no uncollateralised, unpriced, unlimited CB credit** | `src/engine/simulation/stages/bank-lending.ts:raiseCentralBankLoanLocal` | ❌ |
| D1 it shrinks: it sells assets, in a real book | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:liquidityFloorLocal` | ✅ |
| D2 it bids up for deposits, and depositors respond | `src/engine/macro/banking.ts:liquidityShortfallShare` | ⚠️ |
| D3 it draws the facility, at the penalty, against collateral | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| **D4 it FAILS — for liquidity, with a distinct trigger** | `src/domain/bank-resolution.ts:isBankUnderPca` | ❌ |
| **D5 a RUN: depositors withdraw because they observe weakness** | — | ❌ |
| D5.a what they observe must be observable | `src/ui/objects/company.tsx:bankCapitalRatio` | ✅ |
| D5.b VERIFY a run is self-reinforcing | — | ❌ |
| **D6 LOLR: freely, good collateral, penalty, solvent — all four** | `src/engine/simulation/stages/bank-funding-close.ts:runBankFundingCloseStage` | ❌ |
| **E1 the policy rate reaches the economy THROUGH this market** | `src/engine/simulation/stages/repo-clearing.ts:RepoSessionResult` | ⚠️ |
| E2 VERIFY a squeeze here raises funding costs elsewhere | `src/engine/simulation/stages/repo-clearing.ts:fundableNeedLocal` | ⚠️ |
| **E3 interbank exposure is a contagion path, by name** | `src/domain/repo.ts:RepoContract` | ⚠️ |

---

## 3. THE DIFF

### ❌ A3.a — THE SESSION RUNS AT STAGE 3 OF ~50, AND IT IS THE CAUSE OF EVERYTHING BELOW. KNOWN(20-LLR)

`runRegionalRepoSession` is called from `02b-bank-diversification.ts:413`. Every book that moves
reserves runs after it — 07b, 07c, 07d, 07e, 07f, the derivatives, stage 08's whole cash walk,
`settlement` at 308, `overdraft-sweep` at 403, `settlement-close` at 412. So the shortfall the
session sizes (`shortfallLocal = householdDepositsAt × MIN_CASH_BUFFER_RATIO - settledCashLocal`,
`repo-clearing.ts:300`) is measured against a Monday-morning balance, and the week's actual drains
arrive afterwards.

The two comments in the tree contradict each other and the second is right: `02b:407` says "Every
real flow has posted" and `02b:409` asserts "there is no separate 'facility draw' step to run
afterwards"; `bank-funding-close.ts`'s header states the truth — "the shortfall is made by the books
that clear AFTER 02b … **A real treasury funds its day at the end of the day; this is that**" — and
then puts an unbounded CENTRAL BANK at the close instead of the market.

**Already §3 step 20-LLR**, which states the fix: move the session, do not bound the loan.
This tree's C5, D4, D6, B7 and E1 rows are all downstream of this one row, and A3.a is the only
node any of them needs.

### ❌ C5 / D6 — THE FACILITY AT THE CLOSE HAS NONE OF BAGEHOT'S FOUR. KNOWN(20-LLR)

Worth stating precisely because **the model contains a correct facility and an incorrect one**, and
the difference is this tree's whole C section:

| | the SRF seat (`repo-clearing.ts:414`) | `raiseCentralBankLoanLocal` (`bank-lending.ts:917`) |
|---|---|---|
| collateral | pledged paper, per bucket, encumbered | none |
| size | bounded by `unencumberedBorrowingCapacityLocal` | the whole shortfall, always |
| price | `srfBps − 1bp`, a posted rate cleared in the book | policy + 125bp, flat |
| refusal | a bank with no free paper never becomes a borrower | unreachable |
| when | stage 3, before the flows | stage 417, after them |

The disciplined one runs when there is nothing to fund; the undisciplined one runs when there is.
That is why C4.b is marked `⚠️` rather than `✅`: the collateral constraint is real and correctly
implemented, and it is *defeated* — a bank with no eligible paper drops out of `needByTicker`
entirely, its shortfall becomes invisible to the session, and the close then lends it the whole
amount unsecured. **Already §3 step 20-LLR.**

### ❌ B2 / B2.a / B2.b — THERE IS NO UNSECURED MARKET, SO NO NAME IS EVER PRICED. Already §3 step 20b

A grep for `interbank` across `src` returns only FX squaring. Every contract in `reg.repoBook` is
secured general collateral, and `lenderSchedule(reservationBps, maxHoldingLocal)` carries a
reservation and a size and **no borrower argument at all** — at one cleared GC rate a lender's cash
is fungible and each borrower draws pro rata (`strike`, `repo-clearing.ts:510`). So a lender cannot
have a view on a name, B2.a's "no bid at all" cannot happen, and B2.b's strong-to-weak spread does
not exist because there is only one rate.

§3 step 20b names exactly this ("the last boundary line's named successor, and it was never built:
surplus banks lend to short ones at policy plus the borrower's own spread, and only what no bank
will lend reaches a standing facility"). Two things this mapping adds to that step: it should be
sequenced AFTER 20-LLR's move (an unsecured book held at stage 3 would price nothing either), and
the borrower's own spread already exists as a cleared number — its credit curve
(`engine/credit-price.ts`, read off the bank's own cleared paper), which 02b
already reads at `:294`.

### ⚠️ A2.a — THREE ANSWERS TO ONE BUFFER, AND ALL THREE ARE THE SAME CONSTANT. Already §3 step 30b (sibling)

The node asks for a preference derived from the liquidity of the bank's own liabilities. What exists
is `MIN_CASH_BUFFER_RATIO = 0.02` applied to the HOUSEHOLD deposit line only, and it is read three
ways that do not agree:

- `repo-clearing.ts:300` — the borrower's need: `householdDepositsAt × MIN_CASH_BUFFER_RATIO`, bare;
- `repo-clearing.ts:376` — the lender's surplus: the same bare expression;
- `bank-lending.ts:902` (`operatingCashBufferLocal`) — the close's raise and repay:
  `householdDepositsAt × bankCashBufferRatioOf(bank)`, i.e. the constant weighted by the bank's own
  risk aversion.

So the same bank has a different buffer in the session than at the close, and neither reads its
corporate, institutional or SME lines at all — a bank funded entirely by wholesale money computes a
buffer of zero. `stressedOutflowLocal` (retail 10%, everything else 40%) is the derived read the node
wants and it exists already, used only for the HQLA floor. §3 step 30b names the identical shape on
the LENDER side of this market (`CASH_SLEEVE_OVERNIGHT_SHARE`); this is its borrower-side twin and
should be the same step.

### ⚠️ E1 / E2 — THE CORRIDOR CLEARS AND THE ECONOMY DOES NOT READ IT

E1 is the node this whole tree exists to serve, and the print goes almost nowhere.
`reg.repoRateAnnual` is read by the money fund's yield quote, the IRS floating leg, and four UI
panels. Everything that prices real credit reads `reg.policyRate` directly: the SME all-in rate
(`bank-lending.ts:266`), the mortgage quote off `tenor10Y`, the revolver at
`policyRate + facilityMarginBps`, the deposit rate as a share of `policyRate + ownSpread`. So the
policy rate reaches the economy by assertion, with a correctly-cleared corridor running beside it —
the same finding as `the-central-bank.md` B3, recorded there as the step.

E2's guards exist and are the right ones: `fundableNeedLocal` and `repoClearedVolumeLocal` were added
precisely so a quiet week can be told from a dead market. Nothing reads them into a funding cost
anywhere else, so E2 is a channel that is instrumented and not connected. **A measurement, for §3
step 38**, and it becomes a real read the week E1 is wired.

### ⚠️ B7 / D2 / ✅ D1 — THE SQUEEZE EXISTS IN ONE BOOK AND IS ABSORBED IN THE OTHER

B7 is genuinely representable in the TERM book and the code says why: `withWindow: false` for term,
so "a term need the private market will not fund simply is not funded, and falls back to overnight
below. That is a funding squeeze, and it could not previously happen"
(`repo-clearing.ts:473`). But the overnight book always has the window in it at full size, so
`unfundedTermLocal` is never a failure — it is a maturity shift. The only genuine non-clearing is a
bank with no unencumbered paper, and C5's facility catches that at the close.

D1 is real and good: a bank's 07c schedule has `minHoldingLocal = max(encumbered face, liquidity
floor)`, so it can sell down to what it must keep and no further, at whatever the auction prints.
D2 is real too — `contestedShare = max(fundingPressure, liquidityShortfallShare)` makes a bank short
of its stressed-outflow cover pay its full alternative cost — but the response side is regional:
`divertHouseholdSavingsToMmf` reads `reg.bankingSector.depositRateAnnual`, the aggregate, so the
bank that raised its rate is not the bank that gets the money. That last part is
`banks-funding-and-liquidity.md` B1.a's row and belongs with the run.

### ⚠️ E3 — THE CONTAGION PATH IS BUILT AND NOTHING TRAVELS DOWN IT

Every repo contract names both parties (`RepoContract.lender` as a `PartyRef` arm — §9.13-BOOK d4a gave the
window's arm its region and deleted the book's own key — and `borrowerId`),
so "a failure lands on its lenders by name" is one map away — and `rekeyBankLinks`
(`bank-resolution.ts:62`) walks `reg.repoBook` on exactly that key. What it does with it is re-point
every contract at the assuming bank, so no lender ever takes a loss. Recorded as
`banks-capital-and-resolution.md` D6: with an acquirer that cannot decline, the failure is absorbed
in the week it happens and E3's path carries nothing. The data structure is not the gap; the
declining acquirer is.

### ✅ B3 / B4 / C1 / C4 — THE SECURED HALF IS RIGHT, AND IT IS THE MODEL FOR THE REST

Stated plainly because the atlas is not only for absences. The haircut is derived, not posted:
duration × 2σ of the bucket's own observed weekly yield changes, so it tightens when the curve turns
volatile (`computeSovereignRepoHaircuts`). Encumbrance is a property of the specific paper
(`encumberedFaceByBond`), reconciled against holdings by a single shared object with one tolerance
(`domain/collateral.ts` — one dollar, and the file records why it is not one million), and a pledge
whose collateral was sold is margin-called (`reconcileRepoPledges`). The collateral chosen is
longest-first with a real reason (bills are the liquidity buffer and must stay sellable). The rate
clears through the same engine as every other book, with the window as a seat rather than a clamp,
and the RRP genuinely removes cash from the banking system. **B3.a's "something is ineligible" is
satisfied by the sovereign-only scope, which `domain/repo.ts:16` declares deliberately —
OUT OF SCOPE, stated, not missing.**

### A measurement, for §3 step 38: A2.b, B2.b, B6.a, D5.b

A2.b (a cost the bank can feel for missing its buffer) is the one that would prove the buffer is not
decoration, and it is unmeasurable today for the reason C5 gives: missing the buffer costs
policy + 125bp and nothing else. B6.a's term/overnight spread exists as two printed numbers
(`repoRateAnnual`, `repoTermRateAnnual`) and is never differenced. B2.b and D5.b cannot be measured
until B2 and D5 exist.

### Also marked, briefly

- **A2 ⚠️ / A3 ⚠️** — the position is held for a buffer that is a constant (A2.a), and the need is sized at stage 3 before the flows (A3.a).
- **C3 ⚠️** — `X1` asserts the print inside ±150bp of policy; the width is a stated band, not a measured one.
