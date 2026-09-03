# SYSTEM: HOUSEHOLDS

The sector that supplies labour, consumes output, saves, borrows and ultimately owns everything.
The counterparty to half the other trees. Excludes the labour market's clearing
(`labour.md`) and housing's (`housing.md`), but the household's side of both is here.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A HOUSEHOLD IS
- **A1** REASON — a unit that **earns, consumes, saves and owns**
- **A2** REASON — households are **heterogeneous**, and the heterogeneity is load-bearing
  - A2.a by **income and wealth** — the propensity to consume differs, so the same aggregate
    income produces different demand depending on who has it
  - A2.b by **life stage** — earning, accumulating, drawing down
  - A2.c by **employment state** — employed, unemployed, out of the workforce
  - A2.d FORBID — **the sector is never a single representative agent.** E[f(x)] ≠ f(E[x]) and
    every decision that matters here is a threshold: a mean-preserving spread must be able to
    cause defaults, and with one agent it cannot
- **A3** REASON — it is a **named party in the ledger** with an account (`money-and-settlement.md`)

### B. INCOME
- **B1** REASON — **wages**, from named employers, for labour supplied
- **B2** REASON — **transfers** from the government, to named recipients
- **B3** REASON — **investment income**: dividends, interest, coupons — from named payers
  - B3.a FORBID — income the household did not RECEIVE is not income. Retained earnings raise the
    value of what it owns and reach it on sale or distribution (`equity.md` F4)
- **B4** REASON — **income is taxed**, progressively or not, and the tax is remitted by somebody
- **B5** VERIFY — sector income is Σ(what households were actually paid), never an accounting
  identity solved for

### C. CONSUMPTION
- **C1** REASON — it **decides** how much to spend, and the decision has reasons
  - C1.a current income
  - C1.b **wealth**, which is why an asset price matters to demand
  - C1.c expectations, and confidence
  - C1.d **liquidity**: a household that cannot borrow spends what it has, whatever it wants
- **C2** REASON — the residual is **saving**, and saving is a flow into B3's stock
- **C3** REASON — spending is **allocated across goods** by preference and relative price
- **C4** REASON — it **buys at a price it pays** — including tax and the distribution margin
  (`goods.md` G1.b)
- **C5** VERIFY — consumption is Σ(what households actually bought), and it reaches named sellers

### D. THE BALANCE SHEET
- **D1** REASON — **assets**: deposits, securities held directly, fund shares, pensions, housing
  - D1.a each is a real claim on a named issuer, held in a register
- **D2** REASON — **liabilities**: mortgages, consumer credit, and they are somebody's asset
- **D3** REASON — **net worth** is D1 − D2, a read and never a stored number
- **D4** REASON — it **revalues** when prices move, and the revaluation is not income (B3.a)
- **D5** REASON — the **portfolio allocation is a decision** with reasons: yield, risk, liquidity
  - D5.a the choice between a deposit, a money fund and bills directly is a real substitution
    (`sovereign-credit.md` E2.f) — and it is how a policy rate reaches a saver

### E. BORROWING
- **E1** REASON — it **borrows for reasons**: a house, consumption, a shortfall
- **E2** REASON — a lender **decides** to lend to it, on affordability and collateral
  (`banks-lending.md` C)
- **E3** REASON — it **services** the debt out of income, and the service is a real payment
  - E3.a interest **plus** principal, and the distinction matters
- **E4** REASON — it can **default**, and the default depends on the distribution (A2.d), not the
  mean
  - E4.a with a consequence: the collateral, the credit record, the loss to the lender
- **E5** VERIFY — the debt-service burden is a read of E3 against B, and it can become unpayable

### F. THE LIFE CYCLE
- **F1** REASON — households **form, age and dissolve**
- **F2** REASON — wealth **transfers** on dissolution, and it goes somewhere named
- **F3** REASON — **retirement**: income switches from wages to drawdown, and the pension claim in
  D1 is what funds it
- **F4** VERIFY — the sector's composition changes over time, and the aggregate follows from it

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 earns, consumes, saves and owns | `src/domain/region-macro.ts:HouseholdState` | ✅ |
| A2 heterogeneous, and the heterogeneity is load-bearing | `src/engine/macro/household-cohorts.ts:buildHouseholdCohorts` | ✅ |
| A2.a by income and wealth | `src/engine/macro/household-cohorts.ts:WEALTH_TIERS` | ✅ |
| A2.b by life stage | `src/domain/region-macro.ts:LifeCycleStage` | ⚠️ |
| A2.c by employment state | `src/domain/region-macro.ts:HouseholdCohort` | ✅ |
| **A2.d FORBID never a single representative agent** | `src/engine/simulation/stages/05-unit-bidding.ts:slices` | ⚠️ |
| A3 a named party in the ledger with an account | `src/engine/ledger/accounts.ts:householdDepositsOf` | ⚠️ |
| B1 wages from named employers | `src/engine/bootstrap/labor-and-wages.ts:weeklyWageBillUSD` | ✅ |
| B2 transfers from the government to named recipients | `src/engine/simulation/stages/03-category-demand.ts:runCategoryDemandStage` | ✅ |
| B3 investment income from named payers | `src/engine/macro/household-cohorts.ts:annualCapitalReceiptsUSD` | ✅ |
| B3.a FORBID income not received is not income | `src/engine/macro/household-cohorts.ts:totalCapitalUSD` | ⚠️ |
| B4 income is taxed, and remitted by somebody | `src/engine/bootstrap/national-accounts.ts:HOUSEHOLD_EFFECTIVE_TAX_RATE` | ⚠️ |
| B5 VERIFY income is Σ what households were paid | `src/engine/simulation/stages/02-region-macro.ts:householdWeekOf` | ✅ |
| C1 it decides how much to spend | `src/engine/macro/household-cohorts.ts:consumptionBudgetUSD` | ✅ |
| C1.a current income | `src/engine/macro/household-cohorts.ts:measuredDisposableIncomeUSD` | ✅ |
| C1.b wealth | `src/engine/macro/household-cohorts.ts:tierWealthMpc` | ✅ |
| C1.c expectations and confidence | `src/engine/macro/evolution.ts:cciReversion` | ⚠️ |
| C1.d liquidity | `src/engine/macro/household-cohorts.ts:BUFFER_TARGET_WEEKS` | ✅ |
| C2 the residual is saving | `src/engine/macro/household-cohorts.ts:cohortSavingsUSD` | ✅ |
| C3 allocated across goods by preference and relative price | `src/domain/industry.ts:budgetDemandLadder` | ⚠️ |
| C4 it buys at a price it pays — tax and margin included | `src/domain/distribution.ts:shelfPriceUSD` | ✅ |
| C5 VERIFY consumption is Σ bought, reaching named sellers | `src/engine/simulation/stages/05-unit-bidding.ts:R_HH_GOODS` | ✅ |
| D1 assets: deposits, securities, fund shares, pensions, housing | `src/engine/simulation/stages/household-balance-sheet.ts:runHouseholdBalanceSheetStage` | ✅ |
| D1.a each a real claim on a named issuer, in a register | `src/engine/macro/household-portfolio.ts:householdDirectEquityUSD` | ⚠️ |
| D2 liabilities, and they are somebody's asset | `src/engine/simulation/stages/bank-lending.ts:HouseholdLoanPool` | ✅ |
| **D3 net worth is D1 − D2, a read and never stored** | `src/engine/simulation/stages/household-balance-sheet.ts:netWorthUSD` | ⚠️ |
| D4 it revalues, and the revaluation is not income | `src/engine/simulation/stages/household-balance-sheet.ts:priorNetWorthUSD` | ✅ |
| D5 the portfolio allocation is a decision | `src/engine/simulation/stages/etf-flows.ts:equityShareOfSaving` | ✅ |
| D5.a deposit vs money fund vs bills is a real substitution | `src/engine/simulation/stages/money-market-fund.ts:hhSharesUSD` | ❌ |
| E1 it borrows for reasons | `src/engine/simulation/stages/bank-lending.ts:affordableLoanUSD` | ✅ |
| E2 a lender decides to lend, on affordability and collateral | `src/engine/simulation/stages/bank-lending.ts:grantedUSD` | ✅ |
| E3 it services the debt out of income | `src/engine/macro/household-cohorts.ts:effectiveDebtServiceUSD` | ✅ |
| E3.a interest plus principal | `src/domain/banking.ts:annuityWeeklyPrincipalUSD` | ✅ |
| **E4 default depends on the distribution, not the mean** | `src/engine/macro/evolution.ts:arrivalRate` | ⚠️ |
| E4.a with a consequence: collateral, record, loss to the lender | `src/domain/banking.ts:mortgageSeverityAtLtv` | ⚠️ |
| E5 VERIFY the debt-service burden can become unpayable | `src/engine/macro/household-cohorts.ts:squeezedSavingsUSD` | ✅ |
| F1 households form, age and dissolve | `src/engine/macro/evolution.ts:mortalityHazardAnnual` | ✅ |
| F2 wealth transfers on dissolution, to somewhere named | — | ❌ |
| F3 retirement: wages give way to drawdown | `src/engine/simulation/stages/insurance-and-pensions.ts:weeklyBenefitsUSD` | ✅ |
| F4 VERIFY the composition changes and the aggregate follows | `src/engine/macro/household-cohorts.ts:retiredShareOfPopulation` | ✅ |

---

## 3. THE DIFF

### ⚠️ A2.d — THE CROSS-SECTION IS REAL, THE THRESHOLDS ARE NOT ON IT

The sector is emphatically **not** one representative agent, and this is the strongest half of the
tree. `buildHouseholdCohorts` builds ~20 (occupation × wealth-tier) cells every week from real
employment, real occupation wages and a real earnings ranking; each cell carries its own income,
tax, debt service, buffer, saving and consumption budget; each draws its own two preference
primitives (`household-cohorts.ts:533`); and the cells post **separate steps into the goods
auction** (`05-unit-bidding.ts:1487-1502`), which is what makes the region's demand curve a
staircase with a measured slope rather than one step at a reach multiple.

What is missing is the second half of the FORBID: *a mean-preserving spread must be able to cause
defaults.* Every threshold in the household sector is evaluated on a **band mean**, never on the
population inside it:

- `evolution.ts:748` — `arrivalRate = max(0, tierStress) * delinquencyExposureOf(bufferMonths)`,
  where `bufferMonths` is `joinCreditTiersToBalanceSheets`'s share-weighted **mean** over the band;
- `evolution.ts:659` — `tierStress` is `(newUnemployment − region.nairu) * 0.02`, a **region
  aggregate**, identical for every cohort;
- and the outcome is a continuous *rate* on a pool, never an event: no household crosses a line,
  misses a payment, and is repossessed.

`delinquencyExposureOf` is convex (`1/(1+b)`), so a spread **across** the four wealth bands does
move the aggregate — the node is not violated outright, which is why this is ⚠️ and not ❌. But a
spread **within** a band is invisible, and the stress that triggers everything is one scalar per
region. **Becomes a §3 step** (medium): the cohorts already carry `debtServiceUSD` and
`disposableIncomeUSD` per cell — the arrival rate can be read off the cells that cannot pay rather
than off a tier's average buffer, which is the same operation `squeezedSavingsUSD` already
performs one file away.

### ❌ D5.a — HOUSEHOLDS NEVER MOVE BETWEEN DEPOSITS, MONEY FUNDS AND BILLS

D5 itself is genuinely present: `etf-flows.ts:212` sets the equity share of this week's saving
from `(earningsYield − depositYield) / earningsYield` — a real yield substitution, with a real
seller on the way down (`:238-249`, sell the buffer first, then fund shares, then announce a
direct-equity sale). That is the mechanism D5 asks for.

The *cash* leg of the same choice does not exist. `hs.mmfSharesUSD` is written in exactly two
places: `evolution.ts:1240` carries it forward unchanged, and `money-market-fund.ts:283` credits
new shares **pro rata to what is already held** — an issuance allocation, not a decision. No
household ever moves a dollar from a deposit into a money fund because the fund yields more, and
households hold no bills at all. That is the channel D5.a names as *how a policy rate reaches a
saver*, and it is the same channel `sovereign-credit.md` E2.f is relying on from the other side.
**Becomes a §3 step**, small: the deposit-vs-fund decision is the one `etf-flows` already makes
for equities, with the money fund's own cleared net yield (`mmfNetYieldAnnual`) already in hand.

### ❌ F2 — NOBODY INHERITS ANYTHING

`mortalityHazardAnnual` is real and households genuinely die (`evolution.ts:1048`), but nothing
moves when they do. `grep -i 'inherit\|bequest' src` finds no wealth transfer. The dead
household's assets do not go anywhere named — the sector's net worth is simply re-derived next
week from the same marked components over a slightly smaller population, so the wealth of the
deceased is absorbed silently into the per-capita arithmetic. F1's demography exists precisely so
that F2 can happen and it does not. **Becomes a §3 step** — and note the shape it must not take:
a share of net worth reallocated across tiers by a table would be the stated-split defect
`household-balance-sheet.ts` already spent nine tables getting rid of.

### ⚠️ D3 / A3 — THE READ IS RIGHT, THE FIELD IS STILL THERE

`household-balance-sheet.ts:293` computes net worth as a sum over **marked** lines every week —
deposits, money-fund shares, the real claims (`etfHoldings + directEquity + privateBusinessEquity
+ institutionalClaims`), the housing stock, less the three debts. That is a read, and it is taken
from this week's clears. It is then **stored** as `hs.netWorthUSD` and read by
`evolution.ts:474-484`, one week stale, alongside `priorNetWorthUSD`. The store is deliberate (the
wealth effect needs a *change*), so this is D3's letter broken for a real reason rather than
carelessness — but it is a stored derived quantity of exactly the class `check-hygiene.sh`'s
§5-WIRES D rule forbids for firms, and it should be a two-vintage read, not a field.

A3 is ⚠️ for a narrower reason: the household sector is one party per region
(`{ kind: 'HOUSEHOLD', region }`), so the twenty cohorts share a single account. Every payment in
and out is real and named; nothing below the region has a balance. That is the ledger-side
statement of A2.d and it closes when A2.d does.

### ⚠️ B3.a / B4 — TWO NUMBERS THAT ARE STILL SHARES OF SOMETHING ELSE

The tree's B3.a is honoured where it matters — the budget is credited with
`annualCapitalReceiptsUSD`, which is measured deposit interest plus measured dividends
(`02-region-macro.ts:42`, `reason === 'dividend to the public float'`). But the *gross income*
line the tax is levied on adds `totalCapitalUSD = totalWageUSD × (1 + payroll tax) ×
HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR` (`household-cohorts.ts:407`) — capital income as a
stated multiple of the wage bill, which is income no payer paid. The level is then rescaled to the
measured total (`incomeScale`, `:459`), so the aggregate does not leak; what is distorted is the
*mix*, and therefore the tax base and the tier ranking. Similarly B4's tax is a flat
`HOUSEHOLD_EFFECTIVE_TAX_RATE = 0.1322` with a per-tier multiplier renormalised back to it, so
progressivity moves the split and never the total.

Both are **already §3 step 31** territory (`bootstrap/national-accounts.ts:73,93` is named there)
and are recorded here as a second witness rather than as new steps.

### ⚠️ C1.c / A2.b — CONFIDENCE AND LIFE STAGE ARE PRESENT BUT NOT WHERE THE DECISION IS

`consumerConfidence` is an AR(1) around an equilibrium (`evolution.ts:329-332`) — a formula, not a
household's expectation — and the cohort budget does not read it at all; its only consumers are
the bank's origination `appetite` (`bank-lending.ts:582`) and a news line. The cohorts' real
forward-looking term is elsewhere and better: each cohort's own `patienceWeeks` sets how fast it
closes its buffer gap. A2.b is the same shape: the age structure is a genuine stock with births
and a Gompertz hazard, and `retiredShareOfPopulation` is what makes the life-cycle saving rate an
outcome — but the cohort **cells** are occupation × wealth only, so no cell is "old", and F3's
switch from wages to drawdown happens to the sector, not to a cohort. Neither is a missing
mechanism; both are **a measurement, for §3 step 38** — except that A2.b becomes real for free
if F2's inheritance step gives the cells an age axis.
