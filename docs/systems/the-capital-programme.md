# SYSTEM: THE CAPITAL PROGRAMME

Investment: a firm spending money now to have productive capacity later. It is the slow variable —
the one that connects the financial system back to the real economy, and the reason the cost of
capital matters at all. Without it, `equity.md` and `corporate-credit.md` price claims on a
capacity that never changes.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT CAPITAL IS
- **A1** REASON — a **stock of productive assets** held by a named firm
  (`firm-fundamentals.md` C1)
- **A2** REASON — it **produces**: capacity is a function of the stock, and output is limited by it
  (`goods.md`, `commodities-spot.md` B2)
- **A3** REASON — it **depreciates**: it wears out, and the depreciation is a real cost against
  profit and a real reduction in the stock
- **A4** REASON — it is **specific**: capital in one sector or region is not capital in another,
  which is why misallocation is possible and costly
- **A5** REASON — its **value** is what it can produce, and it can be written down when that falls

### B. THE DECISION
- **B1** REASON — a firm invests when it **expects the return to exceed the cost of capital**
  - B1.a the **return** comes from expected demand and price (`goods.md`)
  - B1.b the **cost of capital** comes from the markets: what its debt costs
    (`corporate-credit.md`, `banks-lending.md`) and what its equity costs (`equity.md` E)
  - B1.c so a change in a market price **changes real investment**, and that is the transmission
    channel this whole atlas exists to make real
- **B2** REASON — it must also be able to **fund it**: cash on hand, borrowing capacity, or new
  equity (`firm-fundamentals.md` E4)
  - B2.a a firm with a good project and no funding does not invest, and that is a credit
    constraint doing real work
- **B3** REASON — **capacity utilisation** is a reason: a firm running full has an obvious reason
  to expand, one running empty does not
- **B4** REASON — **uncertainty delays it**: the option to wait has value when the spend is
  irreversible
- **B5** FORBID — **no investment rate.** A fixed fraction of profit or output reinvested is B1
  deleted, and with it every link from finance to the real economy

### C. THE SPEND
- **C1** REASON — investment is a **purchase from a named seller** — a capital-goods producer —
  and it is that seller's revenue (`goods.md`, `firm-fundamentals.md` B1)
  - C1.a so investment is demand this week and capacity later, and the two effects arrive at
    different times
- **C2** REASON — it is **paid for in cash**, out of an account, in a currency
- **C3** REASON — there is a **lag** between spend and capacity: the asset is built, then it works
- **C4** REASON — it is **irreversible**: the money cannot be recovered by cancelling

### D. THE STOCK OVER TIME
- **D1** REASON — capital next period = capital now + investment − depreciation, per firm
- **D2** REASON — the **aggregate stock is Σ(firms)**, and it changes slowly relative to prices
- **D3** REASON — a firm that fails leaves its capital to **somebody named**
  (`firm-birth-and-death.md`, `the-register.md` F2) — it is a real asset that does not vanish
- **D4** VERIFY — capacity, output and utilisation must reconcile: a world producing more than its
  capital allows has capacity from nowhere

### E. WHAT IT FEEDS BACK INTO
- **E1** REASON — investment is a **large, volatile component of demand**, so its swings drive the
  cycle (`goods.md`)
- **E2** REASON — it **employs people** to build the capital (`labour.md`)
- **E3** REASON — it is usually **debt-funded at the margin**, so it drives credit growth
  (`banks-lending.md` B)
- **E4** VERIFY — a tightening in credit conditions should reduce investment through B1.b and
  B2.a, and then output — through the chain, with the lag in C3, and never directly

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a stock of productive assets held by a named firm | `src/engine2/stage08-back.ts:newGrossPPELocal` | ✅ |
| A2 capacity is a function of the stock | `src/engine/simulation/stages/05-unit-bidding.ts:unitsPerNetPpeDollar` | ✅ |
| **A3 it depreciates — a cost and a reduction** | `src/domain/company-week/capital-programme.ts:weeklyDepreciationLocal` | ⚠️ |
| A4 capital is specific | `src/engine/simulation/stages/estate-resolution.ts:sellAssetsToPeers` | ⚠️ |
| A5 its value is what it can produce; it can be written down | `src/domain/company-week/capital-programme.ts:capacityRetirement` | ⚠️ |
| **B1 invests when the return beats the cost of capital** | `src/domain/company-week/capital-programme.ts:desiredGrowthCapex` | ❌ |
| B1.a the return comes from expected demand and price | `src/engine2/stage08-lanes.ts:categoryShortfall` | ⚠️ |
| **B1.b the cost of capital comes from the markets** | `src/engine2/front-core.ts:effectiveDebtRate` | ⚠️ |
| **B1.c a market price change moves real investment** | `src/domain/company-week/capital-programme.ts:rateDrag` | ⚠️ |
| B2 it must be able to fund it | `src/domain/company-week/capital-programme.ts:growthFundingCapLocal` | ✅ |
| B2.a a good project with no funding is not built | `src/domain/company-week/capital-programme.ts:cashHealthFactor` | ✅ |
| B3 capacity utilisation is a reason | `src/domain/company-week/capital-programme.ts:shortageCapexMultiple` | ⚠️ |
| **B4 uncertainty delays it — the option to wait** | — | ❌ |
| **B5 FORBID no investment rate** | `src/domain/company-week/capital-programme.ts:baselineGrowthCapexToRevenueRatio` | ❌ |
| C1 a purchase from a named capital-goods seller | `src/engine/simulation/stages/05-unit-bidding.ts:capexBuyers` | ✅ |
| C1.a demand now, capacity later | `src/domain/company-week/capital-programme.ts:commissionCapital` | ✅ |
| C2 paid in cash, out of an account, in a currency | `src/engine2/stage08-back.ts:makeCashPoster` | ✅ |
| C3 a lag between spend and capacity | `src/domain/industry-registry.ts:commissioningLeadWeeksOf` | ✅ |
| C4 it is irreversible | `src/domain/company-week/capital-programme.ts:capacityRetirement` | ✅ |
| D1 K′ = K + I − D, per firm | `src/engine2/stage08-back.ts:newAccumulatedDepreciationLocal` | ✅ |
| D2 the aggregate stock is Σ(firms) | `src/engine/simulation/stages/estate-resolution.ts:regionalPpeAbsorptionWeeks` | ✅ |
| D3 a failed firm's capital goes to somebody named | `src/engine/simulation/stages/estate-resolution.ts:sellAssetsToPeers` | ✅ |
| **D4 capacity, output and utilisation reconcile** | — | ❌ |
| E1 investment is a large, volatile component of demand | `src/engine/simulation/stages/05-unit-bidding.ts:capexPurchasesLocal` | ✅ |
| E2 it employs people to build the capital | `src/domain/company-week/labor-demand.ts:employerWeekPosting` | ✅ |
| E3 debt-funded at the margin | `src/domain/company-week/capital-programme.ts:debtFundedMaintenanceLocal` | ⚠️ |
| **E4 tighter credit → less investment → less output** | — | ❌ |

---

## 3. THE DIFF

### ❌ B5 / B1 — INVESTMENT IS A RATE ON REVENUE, MULTIPLIED BY REASONS

`capital-programme.ts:157` is the decision, entire:

```
desiredGrowthCapex = newRevenueLocal × baselineGrowthCapexToRevenueRatio
                   × (1 − rateDrag) × cashHealthFactor
                   × (1 + qCapexEffect + competitivenessCapexEffect)
                   × growthCapexAllocationShare × shortageCapexMultiple
```

The **base is exactly the thing B5 forbids**: a per-firm fixed fraction of revenue reinvested,
seeded once (`baselineGrowthCapexToRevenueRatio`) and never re-derived. Everything to the right of
it is a MULTIPLIER on that rate, not a reason the firm invests — so the level of investment in this
world is set by a seeded ratio and only its deviations are economic.

And B1 itself is absent: **nothing anywhere compares an expected return to a cost of capital.**
There is no project, no expected cash flow, no hurdle, no NPV. `tobinsQ` is the closest thing and it
is a market-cap ratio bolted on as `(q − 1) × 0.2`, not a comparison. The model *has* the pieces —
`corporate-financing.ts:decideCorporateFinancing` computes `returnOnInvestedCapital` and
`afterTaxCostOfDebt` and compares them properly — but that comparison drives the **debt** decision
only. The capital programme never sees it.

This is the load-bearing node of the tree, and it deletes B1.c with it. **§3 step 37-COSTOFCAPITAL
step, and a large one** — the investment decision has to become a project with a return and a
hurdle, and the hurdle has to be the firm's own cleared cost of capital.

### ⚠️ B1.b — THE COST OF CAPITAL IN THE DECISION IS LAST YEAR'S COUPON, NOT THIS WEEK'S PRICE

`front-core.ts:583`:

```
effectiveDebtRate = annualInterest / totalDebt
```

That is the **average rate on debt already outstanding** — the weighted coupon of paper issued in
past weeks. It is what `rateDrag` reads, and `rateDrag` is the only channel by which any financial
price reaches investment. So when a firm's cleared OAS doubles this week, its investment does not
move at all; it moves slowly, years later, as the old ladder rolls. The marginal cost of new debt
(`07b`'s cleared spread, which `decideCorporateFinancing` already receives as `costOfDebtAnnual`) is
never consulted, and the **cost of equity is never consulted at all** — B1.b names both.

`rateDrag = max(0, effectiveDebtRate − 0.04) × 2.0 × riskAversion` also carries a stated 4% kink and
a stated slope of 2, which are the whole transmission gain. B1.c — "a change in a market price
changes real investment, and that is the transmission channel this whole atlas exists to make real"
— is therefore present but running on the wrong input at a stated gain.

**§3 step 37-COSTOFCAPITAL**, and it should be the same one as B5: they are one decision.

### ⚠️ A3 — TWO DEPRECIATION SCHEDULES, AND THE P&L ONE IGNORES THE PLANT

`front-core.ts:757` charges D&A against profit as `daShareOfRevenue: 0.05` — five percent of
REVENUE. `capital-programme.ts:190` reduces the plant by `grossPPELocal / (usefulLifeYears × 52)`.
They are different numbers for one fact, and the direction matters: a firm that doubles its plant
takes **no extra depreciation charge against its earnings**, so building capacity is free in the
income statement and the tax base built on it. A3 requires depreciation to be both a real cost
against profit and a real reduction in the stock; here it is each of those, separately, at two
different sizes.

**Already §3 step 26** — named there exactly (`front-core.ts:750` vs `capital-programme.ts:190`,
"two depreciation schedules that cannot reconcile"), folded in with "what plant IS, decided once".
This tree is a second witness and adds the consequence: it is not only an inconsistency, it removes
the cost of capital deepening from the P&L.

### ❌ B4 — NO OPTION TO WAIT

Nothing in the programme is a function of uncertainty. `riskAversion` scales the cash buffer and the
rate drag, which makes a cautious firm invest *less on average*, not *later*: irreversibility (C4,
which is real — `capacityRetirement` scraps, it does not refund) has no value attached to it.
Without B4 investment has no lumpy timing and no reason to pause in a volatile week. **§3 step
37-COSTOFCAPITAL**, and it should follow B1 — an option to wait needs a project to wait on.

### ⚠️ B3 — THE REASON TO EXPAND IS THE CATEGORY'S SHORTFALL, NOT THE FIRM'S OWN PLANT

`shortageCapexMultiple = 1 + categoryShortfall × 0.35`, and `categoryShortfall`
(`stage08-lanes.ts:194-203`) is `demanded/supplied − 1` for the whole category, revenue-weighted
across the firm's lines. That is a market signal and a good one, but B3 asks about the firm: a firm
running its own plant flat out has a reason to expand that a firm with idle lines does not. The
model MEASURES exactly that — `plantCapacityUnitsThisWeek` against `producedUnitsThisWeek`, in the
same lane block — and spends it only on the Wright's-law learning curve. The number is there and the
decision does not read it. Small. **§3 step 37-COSTOFCAPITAL** (or a line of B1's).

### ⚠️ E3 — ONLY UPKEEP CAN BE BORROWED FOR

`bridgeCapacityLocal` gives an investment-grade firm with a house bank a bridge worth half its weekly
maintenance need, and `debtFundedMaintenanceLocal` reports it. Growth capex has no such path:
`growthFundingCapLocal = fcfBeforeGrowthCapex + deployableCash` — internal funds only. Debt-funded
expansion happens in this model only indirectly, by `decideCorporateFinancing` raising money in one
week and the cash raising next week's cap. E3 says investment is debt-funded *at the margin*, which
is the link that makes credit growth and investment the same cycle; here they are two decisions that
communicate through a cash balance with a one-week lag and no shared hurdle. Falls out of B1's step.

### ⚠️ A4 / A5 — PLANT IS ONE DOLLAR NUMBER

`grossPPELocal` is a scalar. It has no type, no vintage and no location beyond its owner, so A4's
specificity exists only as an accident of ownership: `sellAssetsToPeers` will only sell a dead firm's
plant to same-region, same-sector peers, and a buyer converts those dollars into capacity at **its
own** `unitsPerNetPpeDollar` — a steel mill's plant becomes whatever the buyer makes. A5 is the same
shape: plant is carried at cost less straight-line depreciation and is never revalued against what it
can produce; the only write-down is `capacityRetirement`'s scrap of a share mothballed for a year.
**Already §3 step 26**, whose folded-in half is precisely "what plant IS, decided once… there is no
asset kind for plant".

### ❌ D4 / E4 — THE TWO VERIFY NODES ARE NEVER MEASURED

Nothing reconciles capacity against output and utilisation (D4), and nothing measures the chain from
a credit tightening through B1.b and B2.a to investment and then output (E4). E4 is the whole point
of the tree, and it cannot be measured today because B1.b's input is the wrong rate — so it is
blocked on B1's step rather than being a standing read. Both belong in **§3 step 38's standing
measurements**; E4 to be taken only after B1 lands. **A measurement, for §3 step 38.**

### Also marked, briefly

- **B1.a ⚠️** — the return signal is the category's shortfall, not the firm's own expected demand and price — B3.
