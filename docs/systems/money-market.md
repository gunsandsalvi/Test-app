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
| **A3 the need is knowable only AFTER the day's flows** | `src/engine/simulation/stages/repo-clearing.ts:needByTicker` | ✅ |
| **A3.a therefore the market must clear after them** | `src/engine/simulation/stages/bank-funding-close.ts:runBankFundingCloseStage` · `src/engine/simulation/stages/repo-clearing.ts:openMoneyMarket` | ✅ |
| B1 every bank posts a schedule; who lends is the OUTCOME | `src/engine/simulation/stages/repo-clearing.ts:lenderSchedule` | ✅ |
| **B2 unsecured lending prices the borrower's name** | `src/engine/simulation/stages/interbank.ts:runInterbankSession` · `src/domain/interbank.ts:InterbankLoan` | ✅ |
| B2.a a doubted name pays more, or finds no bid | `src/engine/simulation/stages/interbank.ts:runInterbankSession` | ✅ |
| B2.b VERIFY the strongest-to-weakest spread measures stress | `src/domain/region-macro.ts:interbankRateAnnual` | ⚠️ |
| B3 secured lending prices the collateral | `src/domain/repo.ts:RepoContract` · `src/engine2/obligations.ts:materializeRepo` · `src/engine/ledger/contract-ledger.ts:publishRepoBook` | ✅ |
| B3.a eligibility is per asset, and something is ineligible | `src/engine/simulation/stages/repo-clearing.ts:unencumberedBorrowingCapacityLocal` | ✅ |
| B3.b haircuts by asset and tenor | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| B3.c pledged collateral is encumbered and cannot be pledged twice | `src/engine2/holdings.ts:lienUnits` · `src/engine/ledger/holdings-ledger.ts:setLien` · `src/domain/collateral.ts:overPledgedByBond` | ✅ |
| B4 a rate CLEARS from those schedules meeting | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| B5 non-bank cash is in the same market | `src/engine/simulation/stages/settlement.ts:institutionSpendableLocal` | ✅ |
| B5.a its alternative is the floor, or bills directly | `src/engine/simulation/stages/money-market-fund.ts:quoteMmfNetYieldAnnual` | ✅ |
| B6 tenor: overnight and term, each with its own book | `src/engine/simulation/stages/repo-clearing.ts:REPO_TERM_WEEKS` | ✅ |
| B6.a VERIFY the term/overnight spread is information | `src/engine/simulation/stages/derivative-markets/irs.ts:overnightRateAnnual` | ⚠️ |
| **B7 the market can fail to clear for a name** | `src/engine/simulation/stages/repo-clearing.ts:unfundedTermLocal` · `src/engine/simulation/stages/bank-funding-close.ts:recordFundingShortfalls` | ✅ |
| C1 a floor: the CB pays on reserves, or takes cash at a window | `src/engine/simulation/stages/repo-clearing.ts:parkUnlentSleevesAtTheWindow` | ✅ |
| C1.a cash parked there LEAVES the banking system | `src/engine/simulation/stages/repo-clearing.ts:drawReverseRepoAtTheClose` | ✅ |
| C2 a ceiling: a standing facility that lends | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| C3 VERIFY the market rate sits inside the corridor | `src/engine/audit/prices.ts:repo` | ⚠️ |
| C4 the facility is collateralised and priced above the market | `src/engine/simulation/stages/repo-clearing.ts:SRF_SEAT_STEP_BPS` | ✅ |
| C4.a so a bank prefers the market; drawing is information | `src/domain/repo.ts:srfBorrowedLocal` | ✅ |
| C4.b a bank out of eligible collateral CANNOT DRAW | `src/engine/simulation/stages/repo-clearing.ts:unencumberedBorrowingCapacityLocal` | ✅ |
| **C5 FORBID no uncollateralised, unpriced, unlimited CB credit** | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| D1 it shrinks: it sells assets, in a real book | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:liquidityFloorLocal` | ✅ |
| D2 it bids up for deposits, and depositors respond | `src/engine/macro/banking.ts:liquidityShortfallShare` | ⚠️ |
| D3 it draws the facility, at the penalty, against collateral | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| **D4 it FAILS — for liquidity, with a distinct trigger** | `src/domain/bank-resolution.ts:isBankIlliquid` | ✅ |
| **D5 a RUN: depositors withdraw because they observe weakness** | `src/engine/simulation/stages/depositor-flight.ts:runDepositorFlight` | ✅ |
| D5.a what they observe must be observable | `src/ui/objects/company.tsx:bankCapitalRatio` | ✅ |
| D5.b VERIFY a run is self-reinforcing | `src/domain/region-macro.ts:depositorFlightLocal` | ⚠️ |
| **D6 LOLR: freely, good collateral, penalty, solvent — all four** | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` · `src/engine/simulation/stages/repo-clearing.ts:windowEligibleBorrowers` | ✅ |
| **E1 the policy rate reaches the economy THROUGH this market** | `src/engine/simulation/stages/repo-clearing.ts:RepoSessionResult` | ⚠️ |
| E2 VERIFY a squeeze here raises funding costs elsewhere | `src/engine/simulation/stages/repo-clearing.ts:fundableNeedLocal` | ⚠️ |
| **E3 interbank exposure is a contagion path, by name** | `src/domain/repo.ts:RepoContract` | ⚠️ |

---

## 3. THE DIFF

### ✅ A3 / A3.a — THE SESSION CLEARS AT THE CLOSE

*2026-09-05 (§9.20-LLR-i).* `runRegionalRepoSession` used to be called from `02b` at stage 3 of ~50,
before every book that moves reserves, so it sized each bank's shortfall against a Monday-morning
balance and the unbounded central-bank loan at the close was the plug for what it could not see.
Now the morning keeps only the OPEN — `repo-clearing.ts:openMoneyMarket`: last night's contracts
mature, the window's parked cash returns, what each borrower rolled is recorded — and the session
runs inside `bank-funding-close.ts`, after `settlement-close` has settled the week: secured first (the repo books,
the standing facility as the posted-rate seat at the top of the corridor), then unsecured on the
name (`interbank.ts`), then the overnight window takes what was left unlent, round by round until
nothing moves. The need is read on settled reserves plus the legs already posted. C5 and D6 below
were what was still wrong at that close, and are closed below (§9.20-LLR-ii, -iii); D4 — a bank
that fails for liquidity — is `bank-resolution.ts:isBankIlliquid` since §9.20-LLR-iv: overdrawn at
the central bank after the market and the window have run, the supervisor closes it, capital ratio
or no. A3.a is no longer the cause of any of them.

### ✅ C5 / D6 — THE ONLY FACILITY IS THE SEAT, AND IT HAS BAGEHOT'S FOUR

*2026-09-05 (§9.20-LLR-ii).* The model used to contain a correct facility and an incorrect one: the
standing-facility seat in the repo book — collateralised (pledged paper, per bucket, encumbered),
size-bounded by `unencumberedBorrowingCapacityLocal`, priced at a posted rate cleared in the book,
and unreachable by a bank with no free paper — and an unsecured, flat-priced, unrefusable loan of
the whole remaining shortfall at the close, which took whatever the seat left. The loan is deleted.
The seat is the window's only lending, so C5 holds and C4.b is no longer defeated: a bank out of
eligible paper is not a borrower and ends the week short (`recordFundingShortfalls`, B7).

*(§9.20-LLR-iii):* and the fourth — the seat lends only to a bank the supervisor would not close
(`windowEligibleBorrowers`: a bank under PCA borrows from the private lenders in the book on the
same terms as anyone, and the window's fills never reach it). D6 holds. What a bank overdrawn at
the central bank pays for it is `chargeOverdrawnReserves`, the penalty rate at the open.

### ✅ D5 / ⚠️ D5.b — THE RUN EXISTS, WHOLESALE FIRST, ON EACH DEPOSITOR'S HORIZON

*(§9.20-LLR-iii).* A bank that ended the week short of its buffer is on the region's record and in
the news (D5.a's observable). `depositor-flight.ts:runDepositorFlight`, first thing at the open:
its uninsured depositors — the firms and the institutions that bank there; the household line is
insured and stays — move to the region's soundest bank, each when the bank has been short for as
many closes as its own management's patience, and the deposit leaves with the reserves behind it.
So the bank is shorter at the next close, which is D5.b's loop — built, and measured on
`Region.depositorFlightLocal`; that it is self-reinforcing in the run is step 38's to read.

### ✅ B2 / B2.a / ⚠️ B2.b — THE UNSECURED MARKET EXISTS, AT THE CLOSE, ONE BOOK PER NAME

*2026-09-05 (§9.20b).* `stages/interbank.ts:runInterbankSession` runs inside the funding close —
after the day's flows, where A3 says the need is knowable — before the window is asked for
anything. Each short bank is its own YIELD_LIKE book on its NAME: every surplus bank's schedule
starts at the front of the borrower's own cleared credit curve (`issuerSpreadAtOnCurve`, the spread
its bonds print; the posted constant only for a bank nothing has priced) and commits its whole
surplus by the top of the corridor. The borrowers clear in order of that spread, so the strongest
name takes the cash first and the doubted one bids for what is left, pays more, or finds no bid —
B2.a — and only the unfilled remainder reaches `strikeCentralBankLoan`. The loan is a row of
the contract store (`domain/interbank.ts`, kind `INTERBANK`), principal moved between reserve
accounts at the close and repaid at the next open with interest between the banks' own accounts
(`matureInterbankLoans`, 02b), the sheets' `interbankLentLocal`/`interbankBorrowedLocal` derived
from the book and in M5's identity.

B2.b is now READABLE and not yet read: the struck rates per name are on the book and their
principal-weighted average on `Region.interbankRateAnnual`; the strong-to-weak spread is step 38's
measurement. The session's collateral-free window behind it is still 20-LLR's.

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

### ✅ B7 / ⚠️ D2 / ✅ D1 — THE SQUEEZE EXISTS, AND IS NO LONGER ABSORBED

B7 is genuinely representable in the TERM book and the code says why: `withWindow: false` for term,
so "a term need the private market will not fund simply is not funded, and falls back to overnight
below. That is a funding squeeze, and it could not previously happen"
(`repo-clearing.ts:473`). The overnight book has the window in it at full size, so
`unfundedTermLocal` is a maturity shift; the genuine non-clearing is a bank with no unencumbered
paper, and since §9.20-LLR-ii nothing catches it at the close — it ends the week short, recorded on
the region (`bank-funding-close.ts:recordFundingShortfalls`) and told by the news. B7 holds.

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
(`repoRateAnnual`, `repoTermRateAnnual`) and is never differenced. B2.b and D5.b are readable since
§9.20b and §9.20-LLR-iii (the struck rates per name; `depositorFlightLocal` against the streak).

### Also marked, briefly

- **A2 ⚠️ / A3 ⚠️** — the position is held for a buffer that is a constant (A2.a), and the need is sized at stage 3 before the flows (A3.a).
- **C3 ⚠️** — `X1` asserts the print inside ±150bp of policy; the width is a stated band, not a measured one.
