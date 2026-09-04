# SYSTEM: THE TREASURY

The state's balance sheet: it spends, it taxes, the difference is a deficit, and the deficit must
be funded by selling debt to somebody who chooses to buy it. The instrument is
`sovereign-credit.md`; this tree is the issuer's side — the decisions, the constraint, and what is
forbidden.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THE TREASURY IS
- **A1** REASON — a **named party with an account** like any other (`money-and-settlement.md`)
  - A1.a it pays out of a balance, and the balance can run low
- **A2** REASON — its money is its region's currency (`currency-and-fx.md` B1)
- **A3** REASON — it has a **balance sheet**: cash, debt outstanding, and whatever it owns
  - A3.a its equity is negative and that is normal; the number is still a read

### B. OUTLAYS
- **B1** REASON — it **spends on named things** — transfers to households, purchases of goods,
  wages, interest — and each reaches a named recipient's account (`households.md` B2)
- **B2** REASON — **interest is an outlay**, and it is the sum of what its own bonds pay, read
  from the register (`the-register.md` E1), never a rate applied to a total
- **B3** REASON — outlays have **causes** that vary: the cycle, unemployment, policy
  - B3.a so they are not a constant, and a downturn raises them while lowering receipts, which is
    the whole reason the constraint in D bites when it does
- **B4** REASON — **maturing debt must be repaid** in full, in cash, on its date, and it is the
  largest single outlay in most weeks

### C. RECEIPTS
- **C1** REASON — **taxes**, levied on real bases: income, consumption, profit
  - C1.a paid by named payers out of their accounts, so the tax is a real flow both ways
- **C2** REASON — receipts **follow the economy**: they fall when income and spending fall
- **C3** VERIFY — receipts are Σ(what was actually collected from named payers), never a rate
  applied to an aggregate the payers were never charged

### D. THE FUNDING CONSTRAINT — THE CORE OF THIS TREE
- **D1** REASON — **outlays − receipts = the amount that must be raised**, and it must be raised
  before it is spent
- **D2** REASON — it is raised by **issuing debt into a market that must clear**
  (`sovereign-credit.md`, `the-clearing-engine.md`)
  - D2.a at whatever price the buyers are willing to pay — the treasury chooses the size and the
    maturity, the market chooses the price
- **D3** FORBID — **there is no central-bank overdraft** (user, 2026-09-03). The treasury cannot
  draw on the central bank to cover a shortfall, directly or by any facility that amounts to it
  - D3.a the central bank may hold sovereign debt **bought in the market** for a policy reason
    (`the-central-bank.md` E) — that is a different act, with a price and a seller
- **D4** REASON — **issuance is managed to cover outlays** (user, 2026-09-03): the treasury runs a
  programme, forward-looking, sized against what it knows it must pay
  - D4.a it knows its maturity profile, so a wall is foreseeable and pre-funded
  - D4.b it holds a **cash buffer**, because the alternative to a buffer is dependence on every
    single auction clearing
- **D5** REASON — **an auction can fail** (`the-clearing-engine.md` C4), and the failure has
  consequences the treasury must then handle: pay from the buffer, cut or defer an outlay, come
  back at a different size or maturity
  - D5.a FORBID — **no forced buyer.** Nobody is obliged to bid, and no participant absorbs the
    unsold remainder by construction
- **D6** VERIFY — the debt outstanding is the accumulated deficit plus rollovers, read from the
  register, and it reconciles

### E. DEBT MANAGEMENT
- **E1** REASON — the treasury **chooses the maturity mix**, and the choice has a trade-off: short
  is cheaper when the curve is upward-sloping and rolls more often
- **E2** REASON — it chooses **size and timing** per auction, against its cash position
- **E3** REASON — the **cost of its debt is a consequence** of what it has issued and at what
  prices, accumulated — never a rate it sets
- **E4** VERIFY — heavier issuance into the same demand should show up in the clearing price, and
  then in E3 with a lag; if it does not, the auction is not reading the size

### F. THE FISCAL FEEDBACK
- **F1** REASON — spending is **somebody's income** (`households.md` B2, `goods.md`)
- **F2** REASON — taxes are **somebody's outflow**, and they reduce what that party can spend
- **F3** REASON — interest paid is **income to holders**, most of whom are domestic
- **F4** VERIFY — the fiscal balance and the private sector's net saving move together, as an
  accounting consequence and not as an enforced identity

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named party with an account | `src/domain/government-entity.ts:Government` | ✅ |
| A1.a pays out of a balance that can run low | `src/engine/ledger/accounts.ts:treasuryNetOf` | ⚠️ |
| A2 its region's currency | `src/engine/ledger/accounts.ts:treasuryAccountOf` | ✅ |
| A3 a balance sheet | `src/domain/government-entity.ts:GovernmentFields` | ✅ |
| A3.a equity negative, still a read | `src/domain/government-entity.ts:FiscalWeek` | ✅ |
| B1 spends on named things | `src/domain/government.ts:decomposeGovernmentSpending` | ✅ |
| B2 interest is Σ over its own bonds | `src/domain/government.ts:weeklyInterestExpenseLocal` | ✅ |
| B3 outlays have causes that vary | `src/domain/government.ts:governmentOutlaysLocal` | ✅ |
| B3.a a downturn raises them while lowering receipts | `src/domain/government.ts:decomposeGovernmentSpending` | ✅ |
| B4 maturing debt is repaid in cash | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ✅ |
| C1 taxes on real bases | `src/domain/company-week/income-statement.ts:corporateTax` | ✅ |
| C1.a paid by named payers from accounts | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ✅ |
| C2 receipts follow the economy | `src/engine/bootstrap/national-accounts.ts:splitWageBill` | ✅ |
| C3 receipts are Σ collected, not a rate on an aggregate | `src/engine/simulation/stages/03-category-demand.ts:runCategoryDemandStage` | ✅ |
| D1 outlays − receipts is what must be raised | `src/domain/government.ts:governmentObligationsWeeklyLocal` | ✅ |
| D2 raised by issuing into a market that must clear | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ✅ |
| D2.a the treasury picks size and maturity, the market the price | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| **D3 FORBID no central-bank overdraft** | `src/engine/ledger/accounts.ts:waysAndMeansOf` | ❌ |
| D3.a CB may hold sovereign debt bought in the market | `src/engine/simulation/stages/central-bank-demand.ts:plannedPurchasesByBond` | ✅ |
| **D4 issuance managed to cover outlays** | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| D4.a a foreseeable maturity wall | `src/engine/simulation/stages/sovereign-calendar.ts:runSovereignCalendarStage` | ⚠️ |
| **D4.b a cash buffer** | `src/engine/ledger/accounts.ts:treasuryAccountOf` | ❌ |
| D5 an auction can fail | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| D5.a FORBID no forced buyer | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingParams` | ✅ |
| D6 debt outstanding reconciles | `src/engine/audit/ownership.ts:auditOwnership` | ⚠️ |
| E1 chooses the maturity mix | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ✅ |
| E2 size and timing against its cash position | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| **E3 the cost of its debt is a consequence** | `src/engine/nelsonSiegel.ts:calculateNelsonSiegelZeroRate` | ⚠️ |
| E4 heavier issuance shows in the clearing price | — | ❌ |
| F1 spending is somebody's income | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| F2 taxes are somebody's outflow | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ✅ |
| F3 interest paid is income to holders | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| F4 the fiscal balance and private saving move together | — | ❌ |

---

## 3. THE DIFF

### ❌ D3 — THE TREASURY HAS A CENTRAL-BANK OVERDRAFT, AND IT IS THE FUNDING MECHANISM

The one node in this tree the user stated in their own words, and the code has its opposite.
`accounts.ts:waysAndMeansOf` is `max(0, −treasuryNetOf(region))`: the treasury's account at the
central bank is **one signed row**, and when it goes negative that negative IS a ways-and-means
advance — an asset of the central bank, carried in `centralBankAssetsLocal`, charged policy-rate
interest every week by `central-bank.ts:49`. `ui/objects/centralbank.tsx:67` labels it for the
player: *"the treasury's overdraft here"*.

**It is not a leftover; it is load-bearing.** `11-fiscal:647` sizes the quarterly issue as
`waysAndMeansOf(v2, regionId) + 13 * marketFundedDeficitLocal` — the advance is the first term. So
the sequence is: spend freely all quarter into an overdraft, then issue to clear it. That inverts
D1 (raise it *before* you spend it), makes D4.b's cash buffer unnecessary (D4.b is `❌` for exactly
this reason — the overdraft IS the buffer), and drains D5 of consequence: the withdrawal
correctly retires unplaced paper, but a failed auction costs the treasury nothing, because the
overdraft absorbs whatever the auction did not place and the next calendar week simply asks for
more. **A treasury that cannot be told no is not funding-constrained**, and every price in
`sovereign-credit.md` is being set against a borrower with no funding constraint.

**§3 step 37-OVERDRAFT.**

### ⚠️ D4 / E2 — ISSUANCE IS A CALENDAR, NOT A PROGRAMME

`11-fiscal:630` gates all issuance on `nextWeek % 13 === 0`. Between those weeks the treasury
issues nothing whatever it owes, which is what forces D3's overdraft to exist. The size is a
backward-looking `13 × marketFundedDeficitLocal` plus the accumulated advance: it reads what has
already been spent, never what is about to fall due. D4 requires the opposite — forward-looking,
sized against a known maturity profile. The profile is knowable (`sovereign-calendar.ts` walks it),
so this is an ordering-and-inputs defect, not a missing mechanism.

### ⚠️ E3 — THE COUPON IS SET FROM A FITTED CURVE

`11-fiscal:660` sets a new tranche's `couponRate` to `calculateNelsonSiegelZeroRate(tenorYears,
reg.yieldCurveParams)` — a curve **fitted**, not read from cleared prices. E3 says the cost of the
treasury's debt is a consequence of what it issued and at what price; here the price of new debt is
an output of the same curve object step 25 already names as having two owners, and 13-SOV's row 5.
It is that step's, and this tree is a second witness to it.

### ❌ E4 / F4 — TWO VERIFY NODES NEVER MEASURED

Nothing reads issuance size against the sovereign clearing price, and nothing reads the fiscal
balance against private-sector net saving. Both are measurements, not mechanisms — they belong in
§3 step 38's standing reads, and are recorded there rather than becoming steps of their own.

### ⚠️ A1.a / D6 — READS THAT EXIST BUT ARE NOT THE ONES THE NODE ASKS FOR

`treasuryNetOf` is a real balance and it can run low — but because it may also run negative
(D3), "low" has no consequence, so the node is diverging rather than present. `auditOwnership`
checks Σ held = issued for the sovereign books, but the sovereign holding is a tenor BUCKET rather
than an instrument (13-SOV row 3), so what reconciles is not the debt outstanding node D6 means.
Both close when D3 and 13-SOV do.

### Also marked, briefly

- **D2.a ⚠️** — the treasury picks size and maturity; the price of a NEW issue's coupon is read off the fitted curve, not struck — E3.
- **D4.a ⚠️** — `sovereign-calendar.ts` walks the maturity profile every week and the sizing never reads it — D4/E2.
