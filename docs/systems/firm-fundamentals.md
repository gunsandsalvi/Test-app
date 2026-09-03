# SYSTEM: FIRM FUNDAMENTALS

What a firm IS, before any market prices it: it sells things, it pays for inputs and labour, it
owns assets, it owes debt, and the difference between those flows is the number every other tree
about firms reads. `equity.md` prices the residual; `corporate-credit.md` lends against the cash
flow; this tree is the cash flow.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A FIRM IS
- **A1** REASON — a **named party** with an account, a register of what it owns and what it owes
- **A2** REASON — it exists in a **region**, in a **sector**, and both are load-bearing: the region
  fixes its money (`currency-and-fx.md` B1) and the sector fixes what it buys and sells
- **A3** REASON — firms are **heterogeneous in size, cost and leverage**, and the dispersion is the
  reason markets exist among them (`the-seed.md` B4)
- **A4** REASON — it has an **owner or owners** (`equity.md`, `private-equity.md`) whose claim is
  the residual

### B. THE OPERATING FLOW
- **B1** REASON — **revenue**: quantity sold × price achieved (`goods.md`), from named buyers
  - B1.a it is a **consequence of a market**, never a growth rate applied to last week
- **B2** REASON — **input costs**: what it bought, at prices it paid (`commodities-spot.md` E1,
  `trade-credit.md`)
- **B3** REASON — **labour costs**: headcount × wage (`labour.md`), paid to named households
  (`households.md` B1)
- **B4** REASON — **operating profit is the residual** of B1 − B2 − B3, and it can be negative
  - B4.a and the **margin is a read**, never a target the revenue was fitted to
- **B5** REASON — **fixed and variable costs differ**, which is why margin moves more than revenue
  — operating leverage is a consequence of the cost structure, not a coefficient
- **B6** VERIFY — every cost is somebody's income and every revenue is somebody's outlay, party by
  party (`the-audit.md` B7)

### C. THE BALANCE SHEET
- **C1** REASON — **assets**: cash, receivables (`trade-credit.md`), inventory, fixed capital
  (`the-capital-programme.md`)
- **C2** REASON — **liabilities**: payables, bank debt (`banks-lending.md`), bonds
  (`corporate-credit.md`)
- **C3** REASON — **equity is the read**, C1 − C2, and it can be negative
- **C4** REASON — **working capital** is a real use of cash: inventory bought and not yet sold,
  invoices sent and not yet paid
  - C4.a so profit and cash are **different numbers**, and the difference is where firms die

### D. CASH AND SOLVENCY
- **D1** REASON — it pays out of a **balance**, and the balance can hit zero
- **D2** REASON — **debt service is a fixed claim** ahead of the owners: interest and principal
  (`households.md` E3.a is the same structure)
- **D3** REASON — **coverage** — operating cash against debt service — is a read, and it is what
  lenders look at (`banks-lending.md` C, `ratings-and-assessment.md`)
- **D4** REASON — it can **fail two ways**: no cash to pay something due, or liabilities exceeding
  assets. They are different, and a firm can be either without the other
- **D5** REASON — when it cannot pay, it **defaults**, and that is `firm-birth-and-death.md`

### E. WHAT IT DECIDES
- **E1** REASON — **price and quantity** it offers (`goods.md`)
- **E2** REASON — **how many people to employ** (`labour.md`)
- **E3** REASON — **how much to invest** (`the-capital-programme.md`)
- **E4** REASON — **how to fund itself**: retained cash, debt, or new equity — and the choice
  depends on what each costs (`equity.md` E, `corporate-credit.md`)
- **E5** REASON — **what to pay out**: dividends and buybacks, which are real cash to owners
  (`equity.md` F4)
- **E6** REASON — every one of E1–E5 is made from the firm's **own state and the prices it faces**,
  which is what makes the aggregate a consequence

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no revenue without a buyer** and no cost without a payee (B6)
- **F2** FORBID — **no exogenous earnings path.** A firm whose profit follows a series has had
  every decision in E made for it
- **F3** FORBID — **no firm that cannot run out of cash** (D1)
- **F4** VERIFY — the sector aggregate is Σ(firms), computed from members, never a target they
  were scaled to (`the-seed.md` C5)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named party with an account and a register | `src/engine/ledger/accounts.ts:cashOf` | ✅ |
| A2 a region and a sector, both load-bearing | `src/domain/industry-registry.ts:firmInputIntensities` | ✅ |
| A3 heterogeneous in size, cost and leverage | `src/engine/companyGenerator.ts:generateInitialCompanies` | ✅ |
| A4 an owner or owners holding the residual | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| B1 revenue is quantity × price from named buyers | `src/engine2/front-core.ts:unitRevenueUSD` | ✅ |
| B1.a a consequence of a market, not a growth rate | `src/engine/simulation/stages/05-unit-bidding.ts:runUnitBiddingStage` | ✅ |
| B2 input costs at the prices actually paid | `src/domain/company-week/inventory.ts:consumeLotsFifo` | ✅ |
| B3 labour costs paid to named households | `src/domain/company-week/payroll.ts:payrollWeek` | ✅ |
| **B4 operating profit is the residual of B1−B2−B3** | `src/domain/company-week/income-statement.ts:industrialIncome` | ⚠️ |
| **B4.a the margin is a read, not a target** | `src/engine2/front-core.ts:newEbitdaMargin` | ⚠️ |
| **B5 fixed and variable costs differ** | `src/engine2/front-core.ts:otherOpexRate` | ⚠️ |
| B6 every cost is somebody's income | `src/engine/audit/money.ts:auditMoney` | ✅ |
| **C1 assets: cash, receivables, inventory, plant** | `src/engine/companyGenerator.ts:accountsReceivable` | ⚠️ |
| C2 liabilities: payables, bank debt, bonds | `src/engine2/tranches.ts:materializeLadder` | ⚠️ |
| C3 equity is the read, and can be negative | `src/engine/companyGenerator.ts:shareholdersEquity` | ✅ |
| C4 working capital is a real use of cash | `src/domain/trade-invoice.ts:paymentTermWeeks` | ✅ |
| C4.a profit and cash are different numbers | `src/engine2/stage08-back.ts:makeCashPoster` | ✅ |
| D1 it pays out of a balance that can hit zero | `src/engine/ledger/accounts.ts:cashOf` | ✅ |
| D2 debt service is a fixed claim ahead of owners | `src/engine2/front-core.ts:trancheWeekAccrual` | ✅ |
| D3 coverage is a read, and lenders look at it | `src/domain/company-week/credit-standing.ts:creditMetrics` | ✅ |
| **D4 it can fail two ways, and they are different** | `src/domain/company-week/credit-standing.ts:isInDefault` | ⚠️ |
| D5 when it cannot pay it defaults | `src/domain/company-week/credit-standing.ts:isInDefault` | ✅ |
| E1 the price and quantity it offers | `src/engine/simulation/stages/05-unit-bidding.ts:runUnitBiddingStage` | ✅ |
| E2 how many people to employ | `src/domain/company-week/labor-demand.ts:employerWeekPosting` | ✅ |
| E3 how much to invest | `src/domain/company-week/capital-programme.ts:planCapitalProgramme` | ⚠️ |
| E4 how to fund itself, on what each costs | `src/engine/simulation/stages/corporate-financing.ts:decideCorporateFinancing` | ✅ |
| E5 what to pay out | `src/domain/company-week/distributions.ts:dividendDecision` | ✅ |
| E6 every decision from its own state and prices | `src/engine2/stage08-back.ts:runBackCoreA` | ✅ |
| F1 FORBID no revenue without a buyer | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| **F2 FORBID no exogenous earnings path** | `src/engine2/stage08-back.ts:trendWeeklyGrowth` | ⚠️ |
| F3 FORBID no firm that cannot run out of cash | `src/domain/company-week/credit-standing.ts:revolverDrawUSD` | ✅ |
| F4 the sector aggregate is Σ(firms) | `src/engine/companyGenerator.ts:normalizeProducingSectorRevenue` | ⚠️ |

---

## 3. THE DIFF

### ⚠️ B4 / B4.a / B5 — TWO OF THE THREE COST LINES ARE MEASURED AND THE THIRD IS FITTED

`front-core.ts:683` strikes the firm's "other opex" as a residual of its SEED:

```
otherOpexRate = 1 − baselineMargin − baselineInputRateSum − baselinePayroll/baseRev
newEbitdaMargin = 1 − (realInputConsumption·52 + payroll·52 + otherOpexRate·annualRevenue)/annualRevenue
```

Inputs (`consumeLotsFifo`, real lots at the prices really paid) and payroll (`payrollWeek`, heads ×
the firm's own wage) are genuine measurements — that half of B4 is real and it is why margins move
at all. The third line is not a cost of anything: it is whatever number makes the margin come out
at `baselineEbitdaMargin` on the seed week, and it is then applied as a **fixed share of current
revenue** for ever. Two consequences, and B5 is the second:

- **B4.a** — the margin IS partly a target the revenue was fitted to. A quarter to a third of the
  cost base is defined as "the gap to the seeded margin", so the seeded margin is an attractor
  nothing can move away from except through the two measured lines.
- **B5** — that share is *perfectly variable by construction*. Operating leverage in this model
  comes only from payroll and D&A; every other cost scales one-for-one with revenue, so the margin
  compression a real firm feels when volume falls is systematically understated. B5 asks for
  operating leverage as a consequence of the cost STRUCTURE, and a third of the structure has been
  defined away.

Not in §3. **Becomes a §3 step** — small in code (the residual must become named cost lines with
real payees, which the input/output registry can already supply), large in what it unlocks.

### ⚠️ D4 — A FIRM CAN ONLY FAIL ONE WAY, AND IT IS A CONJUNCTION

`credit-standing.ts:99` is the whole trigger:

```
return i.wasDefaulted || (i.cashUSD < 0 && i.coverage < i.coverageFloor);
```

D4 states two distinct failures and says a firm can be in either without the other. The code
requires **both at once**, and neither of them is the solvency test:

- a firm out of cash with coverage at 1.0 never defaults, whatever it fails to pay;
- a firm with liabilities far exceeding assets never defaults while it holds cash — **balance-sheet
  insolvency is not a trigger anywhere in `src`.** `coverage` is EBIT/interest, a flow ratio; C3's
  `shareholdersEquity` is computed only inside the quarterly snapshot and nothing reads it.

The conjunction is deliberate and was measured (the header records the public tier at ~10%/yr
against the private tier's zero), but the fix chosen was to AND a second condition onto a liquidity
test rather than to add the solvency test the node asks for. §3 step 34 covers the missing
covenant/acceleration half of this; the **absent insolvency limb is new**. Related to step 34;
**becomes its own §3 step** or an explicit sub-item of it.

### ⚠️ C1 / C2 — THE REPORTED BALANCE SHEET'S WORKING CAPITAL IS A CONSTANT, BESIDE A REAL ONE

`companyGenerator.ts:231-233`:

```
workingCapitalUSD = annualRevenue * 0.08
accountsReceivable = workingCapitalUSD * 0.6
accountsPayable    = workingCapitalUSD * 0.4
```

Every firm in the world reports receivables at 4.8% of revenue and payables at 3.2%, for ever,
whatever its invoice book says — and the real invoice book exists (`state.tradeInvoices`, see
`trade-credit.md`). So there are two representations of one quantity (rule 4): the real one that
moves cash, and the stated one the player and the cash-flow statement read. `changeInWorkingCapital`
at `:262` is computed from the stated pair, so the quarterly cash-flow statement's operating line is
driven by a constant. The same defect gives `WORKING_CAPITAL_SHARE_OF_REVENUE` two owners with two
values — 0.08 in `shared-helpers.ts:1127`, 0.15 in `corporate-financing.ts:86` — used in the same
week for the CP sleeve and for invested capital.

Not in §3. **Becomes a §3 step**, and it is small: sum the invoice book per party.

### ⚠️ F2 — THE FIRM'S BASELINE REVENUE COMPOUNDS ON A STATED TREND

`stage08-back.ts:2160-2163`:

```
trendWeeklyGrowth = (reg.potentialGdpGrowth + reg.targetInflation) / 52
newBaselineAnnualRevenue = baselineAnnualRevenueUSD * (1 + trendWeeklyGrowth)
```

Reported revenue is a real measurement of cleared sales, so F2 is not violated at the P&L. But
`baselineAnnualRevenue` is **not** a dead seed value: `05-unit-bidding.ts:899` uses it to fix each
line's opening capacity anchor, and `01-macro-feedback.ts:27` reads `(annualRevenue −
baselineAnnualRevenue)/baselineAnnualRevenue` as the region's tracked health signal. So a stated
macro path compounds inside every firm and is then differenced against its measured revenue to
produce a macro signal — the growth rate is being fed in and read back out. Related to §3 step 31
(the real-world equilibria) but not named there. **Becomes a §3 step**, small.

### ⚠️ E3 — THE INVESTMENT DECISION IS `the-capital-programme.md`'S FINDING

`planCapitalProgramme` is cited here as present because the firm does decide; what it decides on is
`the-capital-programme.md` B1/B5's diff, and that is where it is stated. This row is a pointer, not
a second finding.

### ⚠️ F4 — THE SECTOR AGGREGATE IS Σ(FIRMS) AFTER THE SEED, AND A TARGET AT IT

`normalizeProducingSectorRevenue` scales each producing sector's seeded cohort so the two tiers land
proportional to the region's demand. That is a seed-time normalisation and it is `the-seed.md` C5's
node, not this one; every weekly read afterwards is a genuine sum over members. Recorded as `⚠️`
because the node says "never a target they were scaled to" and week zero is one. **OUT OF SCOPE
here** — it belongs to the seed tree.

### The rest maps cleanly

A1–A3, B1–B3, B6, C3, C4, D1–D3, D5, E1, E2, E4–E6, F1 and F3 all resolve onto code that does what
the node requires, and several of them (the FIFO input lots, the payroll deviation, the revolver
standing between a bad week and a default, the single cash write path) are the strongest parts of
this model. A firm here is a real firm.
