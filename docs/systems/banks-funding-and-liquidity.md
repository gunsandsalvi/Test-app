# SYSTEM: BANKS — FUNDING AND LIQUIDITY

A bank's liability side and its cash position: who funds it, on what terms, how quickly they can
leave, and what it does when they do. **This is the system §3.20-LLR is about.** The market it
transacts in is `money-market.md`; this tree is the bank's own side of it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHO FUNDS IT
- **A1** REASON — **deposits**, and they are not one thing
  - A1.a **retail/household**: many, small, sticky, and insured up to a limit
  - A1.b **corporate**: fewer, larger, operational — a firm banks where it transacts
  - A1.c **institutional/wholesale**: few, very large, and **rate-sensitive**
  - A1.d VERIFY — stickiness differs by class, and it is the whole of liquidity risk. A model with
    one deposit type cannot have a run
- **A2** REASON — **wholesale borrowing**: interbank, repo, commercial paper it issues
  - A2.a short, and it **rolls** — which is where a funding squeeze bites
- **A3** REASON — **capital**: equity and subordinated debt, which do not run
- **A4** REASON — **the central bank**, on the corridor's terms (`money-market.md` C)
- **A5** REASON — each source has a **price**, and the prices differ, and the mix is a decision

### B. THE COST OF FUNDS
- **B1** REASON — the bank **pays a rate on each source**, and it is a real payment to a real holder
  - B1.a a deposit rate the bank **sets**, and depositors respond to
  - B1.b a wholesale rate the **market** sets
- **B2** REASON — its **blended cost of funds** is a read of B1 across the mix
  - B2.a which feeds `banks-lending.md` C1.a — the link between the two sides
- **B3** REASON — **net interest margin** is what it earns minus B2, and it can be negative

### C. THE LIQUIDITY POSITION
- **C1** REASON — the bank holds **liquid assets**: reserves, and securities it can sell or pledge
  - C1.a they differ in how fast and how surely they convert — a haircut and a market depth
- **C2** REASON — it holds them against **what could leave**, and that is A1.d's stickiness
  - C2.a a **buffer preference derived from its own liabilities**, not a stated ratio
    (`money-market.md` A2.a)
- **C3** REASON — **maturity transformation is the business**: it funds long assets with short
  liabilities, and that gap is why it earns anything
  - C3.a VERIFY — the gap is measurable, and a bank with none is not a bank
- **C4** VERIFY — its position is the **residue of everybody else's week** — customers paying
  customers of other banks. It did not choose it

### D. WHEN THE POSITION IS SHORT
- **D1** REASON — it **borrows in the market**, secured or unsecured (`money-market.md` B)
- **D2** REASON — it **sells or pledges** liquid assets — a real order in a real book
- **D3** REASON — it **bids up for deposits**, and pays for them
- **D4** REASON — it **shrinks its assets**: it stops lending, and lets the book run off
  - D4.a which transmits a funding problem into `banks-lending.md` C3 — this is the credit crunch
- **D5** REASON — it draws the **central bank facility**, collateralised and at a penalty
- **D6** REASON — **it can fail to fund itself**, and that is a distinct failure from insolvency
  - D6.a FORBID — **there is no unbounded, uncollateralised, unpriced credit line that makes D6
    unreachable.** A facility with none of Bagehot's conditions does not bound anything; it
    deletes the entire branch above it, and with it the reason C2 exists

### E. THE RUN
- **E1** REASON — depositors **can leave**, and the ones in A1.c leave fastest
- **E2** REASON — they leave **because they observe something**
  - E2.a and what they observe must be **observable**: a capital ratio, a facility draw, a rate
    paid up, a rating action
- **E3** REASON — leaving **forces D2 and D4**, which produce more of E2.a
  - E3.a VERIFY — the loop is self-reinforcing, and the model should be able to show one
- **E4** REASON — **deposit insurance** breaks the loop for A1.a and not for A1.c
  - E4.a which is why a run is a wholesale phenomenon first
- **E5** REASON — a run at one bank is **information about others**, through E2.a

### F. WHAT IT REPORTS
- **F1** REASON — its **deposit lines by class**, as reads of who actually banks there
- **F2** REASON — its **reserve balance**, as a read of its account
- **F3** VERIFY — assets = liabilities + equity, in the bank's own money, every week
- **F4** REASON — a **liquidity metric** somebody outside can see (E2.a's input)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 deposits, and not one thing | `src/domain/banking.ts:DepositLines` | ✅ |
| A1.a retail/household, sticky and insured to a limit | `src/engine/ledger/accounts.ts:householdDepositsAt` | ⚠️ |
| A1.b corporate, operational | `src/engine/ledger/accounts.ts:corporateDepositsAt` | ✅ |
| A1.c institutional/wholesale, rate-sensitive | `src/engine/ledger/accounts.ts:institutionalDepositsAt` | ⚠️ |
| A1.d VERIFY stickiness differs by class | `src/engine/macro/banking.ts:stressedOutflowLocal` | ⚠️ |
| A2 wholesale borrowing — interbank, repo, CP | `src/domain/repo.ts:repoBorrowedLocal` · `src/domain/interbank.ts:interbankBorrowedLocal` | ⚠️ |
| A2.a short, and it rolls | `src/domain/repo.ts:maturingAt` | ✅ |
| A3 capital: equity and subordinated debt | `src/domain/banking.ts:bankEquityLocal` | ⚠️ |
| A4 the central bank, on the corridor's terms | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ⚠️ |
| A5 each source has a price; the mix is a decision | `src/engine/macro/banking.ts:evolveBankingSector` | ⚠️ |
| B1 pays a rate on each source, to a real holder | `src/engine/simulation/stages/02b-bank-diversification.ts:runBankDiversificationStage` | ✅ |
| B1.a a deposit rate the bank sets | `src/engine/macro/banking.ts:depositRate` | ✅ |
| B1.a · depositors respond to it | `src/engine/simulation/stages/money-market-fund.ts:divertHouseholdSavingsToMmf` | ⚠️ |
| B1.b a wholesale rate the market sets | `src/engine/simulation/stages/repo-clearing.ts:runRegionalRepoSession` | ⚠️ |
| **B2 a blended cost of funds, read across the mix** | — | ❌ |
| **B2.a which feeds the loan price** | `src/domain/bank-pricing.ts:quoteLoanMarginBps` | ❌ |
| B3 net interest margin, and it can be negative | `src/engine/macro/banking.ts:netInterestMarginPct` | ✅ |
| C1 liquid assets: reserves and pledgeable securities | `src/engine/macro/banking.ts:liquidityDrivenSovereignFloorLocal` | ✅ |
| C1.a they differ by haircut and depth | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| C2 held against what could leave | `src/engine/macro/banking.ts:stressedOutflowLocal` | ✅ |
| **C2.a a buffer PREFERENCE derived from its own liabilities** | `src/engine/macro/banking.ts:bankCashBufferRatioOf` | ⚠️ |
| C3 maturity transformation is the business | `src/domain/banking.ts:MORTGAGE_TERM_WEEKS` | ✅ |
| C3.a VERIFY the gap is measurable | — | ❌ |
| C4 VERIFY the position is the residue of everyone's week | `src/engine/simulation/stages/settlement.ts:runSettlementStage` | ✅ |
| D1 borrows in the market, secured or unsecured | `src/engine/simulation/stages/repo-clearing.ts:runRegionalRepoSession` · `src/engine/simulation/stages/interbank.ts:runInterbankSession` | ✅ |
| D2 sells or pledges liquid assets | `src/engine/simulation/stages/repo-clearing.ts:selectCollateral` | ✅ |
| D3 bids up for deposits | `src/engine/macro/banking.ts:liquidityShortfallShare` | ✅ |
| **D4 shrinks its assets: it stops lending** | `src/domain/banking.ts:bankRunsOffItsBook` · `src/engine/simulation/stages/bank-lending.ts:runBankWeeklyLending` | ⚠️ |
| D4.a which transmits into the credit book | — | ❌ |
| D5 draws the facility, collateralised, at a penalty | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ⚠️ |
| **D6 it can FAIL TO FUND ITSELF** | `src/domain/bank-resolution.ts:isBankIlliquid` | ✅ |
| **D6.a FORBID no unbounded, uncollateralised, unpriced line** | `src/engine/simulation/stages/repo-clearing.ts:CB_SRF_SEAT_ID` | ✅ |
| **E1 depositors can leave; A1.c leaves fastest** | `src/engine/simulation/stages/depositor-flight.ts:runDepositorFlight` | ✅ |
| **E2 they leave because they observe something** | — | ❌ |
| E2.a and what they observe is observable | `src/ui/objects/company.tsx:bankCapitalRatio` | ✅ |
| E3 leaving forces D2 and D4 | `src/engine/simulation/stages/depositor-flight.ts:runDepositorFlight` | ✅ |
| E3.a VERIFY the loop is self-reinforcing | `src/domain/region-macro.ts:depositorFlightLocal` | ⚠️ |
| E4 deposit insurance breaks it for retail, not wholesale | `src/domain/bank-resolution.ts:bankAssumedLiabilitiesLocal` | ⚠️ |
| E4.a which is why a run is wholesale first | `src/engine/simulation/stages/depositor-flight.ts:runDepositorFlight` | ✅ |
| E5 a run at one bank is information about others | — | ❌ |
| F1 deposit lines by class, as reads of who banks there | `src/engine/ledger/accounts.ts:bankDepositLines` | ✅ |
| F2 the reserve balance, as a read of its account | `src/engine/ledger/accounts.ts:bankReservesOf` | ✅ |
| F3 VERIFY assets = liabilities + equity every week | `src/engine/simulation/bank-identity-trace.ts:residualOf` | ✅ |
| F4 a liquidity metric somebody outside can see | `src/ui/objects/company.tsx:srfBorrowingLocal` | ⚠️ |

---

## 3. THE DIFF

### ✅ D6 D6.a E1 E3 E4.a / ⚠️ E3.a / ❌ E5 — THE LIABILITY SIDE HAS A CONSTRAINT, A RUN, AND A FAILURE MODE

*2026-09-05 (§9.20-LLR-iv): D6 holds — a bank overdrawn at the central bank after the close's market
and window have run is closed by the supervisor for that (`bank-resolution.ts:isBankIlliquid`),
whatever its capital ratio; the resolution's news says which trigger fired.*

*2026-09-05 (§9.20-LLR-iii): the run exists. A bank that ended the week short is on the region's
record; its uninsured depositors — firms and institutions, the household line being insured (E4) —
leave for the soundest bank, each when the bank has been short for as many closes as its own
management's patience, and the deposit takes its reserves with it (`depositor-flight.ts`). E1, E3
and E4.a hold; E3.a is measurable on `depositorFlightLocal`; E5 (what one bank's run says about
the others) is not read.*

*2026-09-05 (§9.20-LLR-ii): D6.a holds — the unbounded line is deleted; the only central-bank
lending is the collateral-bounded, priced seat in the repo book at the close, and a bank it will
not fund ends the week short (`bank-funding-close.ts:recordFundingShortfalls`). D6 — that it can
FAIL for it — is still 20-LLR-iii's, with the run.*

`bank-lending.ts:917` is four lines: `shortfallLocal = operatingCashBufferLocal(...) - settledCashLocal`,
and if it is positive the bank gets exactly that, always. No collateral, no eligibility, no cap, no
refusal. `bank-funding-close.ts:38` calls it for every bank every week, up to eight rounds
(`MAX_ROUNDS = 8`), until every reserve account is at its buffer. D6 is therefore unreachable and
D6.a is violated in one expression. The run branch (E1–E5) has nothing at all: the household
deposit line splits across banks by `bankMarketShare`
(`ledger/accounts.ts:623`), and that share is *itself* re-derived every week as
`depositsOf(b) / regionDepositsLocal` (`02b:108`) — deposits are distributed in proportion to
deposits, so nothing about a bank's condition can move them. The one deposit flow that responds to
anything, `divertHouseholdSavingsToMmf`, reads `reg.bankingSector.depositRateAnnual` — the REGION's
aggregate rate — so it cannot distinguish one bank from another either.

**Already §3 step 20-LLR**, in full: the unbounded facility, the capital-only trigger and the
absent run are its three compounding failures, and its diagnosis of the CAUSE (the session at
stage 3) is what this tree's D1/A4 rows record.

### ❌ B2 / B2.a — A BANK HAS NO COST OF FUNDS, AND ITS LOANS ARE PRICED WITHOUT ONE. NEW

This is the node 20-LLR does not cover, and it is the reason the funding side transmits nothing
even where a bank's funding IS priced.

`quoteLoanMarginBps` (`bank-pricing.ts:38`) is `expectedLoss + riskWeight ×
BANK_WORKING_CAPITAL_RATIO × requiredReturn`. There is no cost-of-funds term. The all-in rate is
assembled at the call site as `policyRate + margin/10000`
(`bank-lending.ts:266`, and the mortgage quote at `:625` as `tenor10Y + margin`). **So every bank
in a region funds at the policy rate for pricing purposes**, whatever it actually pays, whatever
its mix, and whatever the money market cleared at. `B2` requires a blended read across A1–A4 and
nothing computes one — the closest thing is `netInterestMarginPct`, which is an ex-post statistic,
not an input to any price.

Worse, the one place a bank's own credit *does* enter is inconsistent with the cash. `evolveBankingSector`
charges the central-bank loan at the bank's OWN cleared bond spread —
`wholesaleInterestLocal = wholesaleLocal × (policyRate + ownWholesaleSpreadBps/10000)/52`
(`macro/banking.ts:349`) — but that number is only ever fed to the NIM statistic; the equity line is
never debited by it. The money actually paid is `02b:464`:
`centralBankLoanLocal × ((repoCorridorBps(policyRate).ceilingBps + CENTRAL_BANK_LOAN_PENALTY_BPS)/10000)/52` —
policy + 125bp, identical for a sound bank and a breaching one. **Two rates on one liability, one
of which is measured and one of which is paid.** A bank whose spread blows out feels it in a
printed margin and nowhere else.

Consequence: the funding channel is severed at both ends. Nothing carries a funding cost into a
loan price, so `banks-lending.md` C1.a has no input; and nothing carries a bank's own condition
into what it pays, so C2's buffer and D3's deposit bidding cost it the same whether it is sound or
about to fail. **§3 step 37-COSTOFCAPITAL** — small in code (one term in one function, one rate reconciled)
and load-bearing for every price in `banks-lending.md` C.

### ✅ D1 / ⚠️ A2 — SECURED IN THE MORNING, UNSECURED ON THE NAME AT THE CLOSE

*2026-09-05 (§9.20b).* `runRegionalRepoSession` is still general-collateral repo at one rate; the
unsecured leg is `stages/interbank.ts:runInterbankSession` at the funding close — one book per
short bank, every surplus bank's schedule starting at the front of the borrower's own cleared
credit curve, the strongest name funded first, the remainder to the window. D1's "or unsecured"
holds. A2 stays ⚠️ for its third member: a bank issues no commercial paper of its own.

### ⚠️ C2.a — THE BUFFER IS A CONSTANT WEIGHTED BY A PRIMITIVE. Already §3 step 30b (its sibling)

`bankCashBufferRatioOf` is `MIN_CASH_BUFFER_RATIO (0.02) × riskAversionOf(management)`, applied to
HOUSEHOLD deposits only (`operatingCashBufferLocal`, `bank-lending.ts:902`). The node asks for a
preference derived from the liquidity of its own liabilities — and the model already has that
number: `stressedOutflowLocal` weights retail at 10% and everything else at 40%. It is used for the
sovereign floor and never for the cash buffer, so a bank funded entirely by overnight wholesale
money keeps the same 2% of its retail line as one funded by term deposits, and the repo session's
own borrower sizing uses the bare `MIN_CASH_BUFFER_RATIO` with no management weighting at all
(`repo-clearing.ts:300`) — a third answer to one question. Step 30b names the same shape on the
lending side of this market; this is its borrower-side twin.

### ⚠️ D4 / ❌ D4.a — A LOSING BOOK STOPS GROWING; A FUNDING PROBLEM STILL CANNOT REACH IT

*2026-09-05 (§9.20c-i):* a bank whose own measured margin is negative (`bankRunsOffItsBook`, read
off last week's `netInterestMarginPct`) originates nothing — SME, mortgage or consumer — and lets
the book amortise: D4's "stops lending", from the EARNINGS side. The funding side below is still
not wired, which is why the row is ⚠️ and D4.a stays ❌.

Origination is gated by capital and by nothing else: `headroomLocal = equityLocal /
BANK_MIN_CAPITAL_RATIO - currentRwaLocal` (`bank-lending.ts:275`, and `:661` for the household books).
A bank that is out of cash, out of collateral and financed entirely by the central bank writes
exactly as many loans as one flush with reserves. So the credit crunch — the channel D4.a exists to
carry — cannot happen, and `banks-lending.md` B2.b (liquidity as a constraint on lending) has no
implementation. This is downstream of 20-LLR but not named by it: 20-LLR's fix (move the session to
the close) makes a funding shortage REAL, and this is the missing wire that would let a real one
reach the asset side. **§3 step 37-SMALL**, small, and it should be sequenced after 20-LLR.

### ⚠️ E4 / A1.a — DEPOSIT INSURANCE COVERS EVERYTHING, WHICH IS WHY IT BREAKS NOTHING

`bankAssumedLiabilitiesLocal` sweeps household, corporate, institutional and SME lines plus client
margin and the secured lines into one number, and `planBankResolution`'s `guaranteeLocal` is the whole
shortfall against it — the treasury makes ALL of them whole, with no limit and no class distinction
(`bank-resolution.ts:191`, `reason: 'resolution: deposit guarantee on the hole'`). E4's entire point
is the asymmetry: insured retail money stays and uninsured wholesale money runs, which is what makes
E4.a true. With one undifferentiated guarantee the asymmetry does not exist, so even if E1 were
built the run would have no reason to be wholesale-first. Attach to the same step as E1–E5;
it is a precondition of them, not a separate mechanism.

### ⚠️ A3 — CAPITAL IS EQUITY, AND THE ONLY WAY IN IS RETAINED EARNINGS

No bank issues equity: `stage08-back.ts` runs the financing decision for every company, and
`macro/banking.ts:466` records that the "recapitalization" write was deleted outright and "an
undercapitalized bank now stays undercapitalized until a real equity raise exists". There is no
subordinated layer either — `seniority` is `'SENIOR' | 'SUBORDINATED'` on `company.ts:83` and a
bank's own ladder is written SENIOR throughout. This is `banks-capital-and-resolution.md` A2/A3's
finding seen from the funding side; recorded there.

### A measurement, for §3 step 38: C3.a, A1.d

C3.a (the maturity gap) is never computed — every input exists (`MortgageVintage.wamWeeks`,
`BankLoan.termWeeks`, the deposit lines) and nothing reads them together. A1.d's stickiness split
exists (`stressedOutflowLocal`) but only inside the HQLA floor, so it is measured for one purpose and
never as the read the node asks for. Both are standing reads, not mechanisms.

### Also marked, briefly

- **A1.c ⚠️** — the institutional line exists as a read and nothing about it is rate-sensitive — E1's row.
- **A5 ⚠️** — each source is priced somewhere and the mix is a residual of what happened, never a decision.
- **B1.b ⚠️** — the wholesale rate is one general-collateral repo print for every name — 20b.
- **D5 ⚠️** — the SRF seat is a real collateralised draw at a penalty and runs before the flows; the close's line is neither — 20-LLR.
- **E2 ❌ / E3 ✅ / E3.a ⚠️** — a bank's funding shortfall is observed and its uninsured depositors leave because of it since §9.20-LLR-iii; E2 (the household side observing) stays with the D6/E1–E5 entry above.
- **F4 ⚠️** — the only outside read of a bank's liquidity is a UI panel (`srfBorrowingLocal`); no participant reads it, so a screen supports at most ⚠️.
