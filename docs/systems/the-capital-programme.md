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
| A1 a stock of productive assets held by a named firm | `src/domain/plant.ts:PlantVintage` · `src/domain/plant.ts:plantGrossLocal` · `src/engine/ledger/plant-ledger.ts:writePlantRows` | ✅ |
| A2 capacity is a function of the stock | `src/engine/simulation/stages/05-unit-bidding.ts:unitsPerNetPpeDollar` · `src/domain/plant.ts:plantEffectiveNetLocal` | ✅ |
| A3 it depreciates — a cost and a reduction | `src/domain/plant.ts:plantDepreciationAnnualLocal` · `src/domain/company-week/income-statement.ts:industrialIncome` | ✅ |
| A4 capital is specific | `src/domain/plant.ts:PlantVintage` · `src/domain/plant.ts:plantEffectiveNetLocal` | ✅ |
| **A5 its value is what it can produce; it can be written down** | `src/domain/plant.ts:plantEffectiveNetLocal` · `src/engine/simulation/stages/estate-resolution.ts:sellPlantToBidders` · `src/domain/plant.ts:scrapPlantShare` | ⚠️ |
| **B1 invests when the return beats the cost of capital** | `src/domain/company-week/capital-programme.ts:desiredGrowthCapex` · `src/domain/company-week/cost-of-capital.ts:costOfCapitalOf` | ❌ |
| B1.a the return comes from expected demand and price | `src/engine2/stage08-lanes.ts:categoryShortfall` | ⚠️ |
| **B1.b the cost of capital comes from the markets** | `src/engine2/front-core.ts:effectiveDebtRate` | ⚠️ |
| **B1.c a market price change moves real investment** | `src/domain/company-week/capital-programme.ts:rateDrag` | ⚠️ |
| B2 it must be able to fund it | `src/domain/company-week/capital-programme.ts:growthFundingCapLocal` | ✅ |
| B2.a a good project with no funding is not built | `src/domain/company-week/capital-programme.ts:cashHealthFactor` | ✅ |
| B3 capacity utilisation is a reason | `src/domain/company-week/capital-programme.ts:shortageCapexMultiple` | ⚠️ |
| **B4 uncertainty delays it — the option to wait** | — | ❌ |
| **B5 FORBID no investment rate** | `src/domain/company-week/capital-programme.ts:baselineGrowthCapexToRevenueRatio` | ❌ |
| C1 a purchase from a named capital-goods seller | `src/engine/simulation/stages/05-unit-bidding.ts:capexBuyers` · `src/domain/industry-registry.ts:capitalMixOf` | ✅ |
| C1.a demand now, capacity later | `src/domain/company-week/capital-programme.ts:commissionCapital` | ✅ |
| C2 paid in cash, out of an account, in a currency | `src/engine2/stage08-back.ts:makeCashPoster` | ✅ |
| C3 a lag between spend and capacity | `src/domain/industry-registry.ts:commissioningLeadWeeksOf` | ✅ |
| C4 it is irreversible | `src/domain/company-week/capital-programme.ts:capacityRetirement` | ✅ |
| D1 K′ = K + I − D, per firm | `src/domain/plant.ts:commissionVintage` · `src/domain/plant.ts:retireWornPlant` · `src/engine/audit/wires.ts:plantIdentityGaps` | ✅ |
| D2 the aggregate stock is Σ(firms) | `src/engine/simulation/stages/estate-resolution.ts:regionalPpeAbsorptionWeeks` | ✅ |
| D3 a failed firm's capital goes to somebody named | `src/engine/simulation/stages/estate-resolution.ts:sellPlantToBidders` · `src/engine/ledger/plant-ledger.ts:movePlant` | ✅ |
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
There is no project, no expected cash flow, no NPV. *(§9.26-d: the hurdle itself has one owner
now — `cost-of-capital.ts:costOfCapitalOf`, the firm's own beta on its region's long rate at its
management's risk aversion, which the labour stage, the freight and commodity books and the goods
ask all read — so what B1 lacks is the comparison, not the number.)* `tobinsQ` is the closest thing and it
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

### ✅ A3 — ONE DEPRECIATION SCHEDULE (closed 2026-09-05, §9.26-f-i)

It was two schedules for one fact, and then six: `front-core.ts` charged D&A against profit as
`daShareOfRevenue: 0.05` — five percent of REVENUE, so a firm that doubled its plant took **no
extra charge against its earnings** and building capacity was free on the income statement and on
the tax base built from it — while `capital-programme.ts` reduced the stock by the plant over its
life; a profile firm was charged a stated twenty years whatever its sector; the seed struck EBIT off
5% and 4.5% of revenue and the filed quarters off 80% of capex; and a carrier was seeded at its
fleet's life and run at its sector's.

One owner now: `plant.ts:annualDepreciationLocal(cost, life)` — straight-line, a year-rate, per
vintage — summed over the register by `plantDepreciationAnnualLocal`, with `usefulLifeYearsOf(firm)`
stamping a vintage's life when it enters service (a carrier's plant is its fleet, so its life is the
fleet's: a ship's 25 years, a truck's 10). The P&L takes it on both statement paths
(`industrialIncome`, `profileIncome`, and the C front core through the `depreciationAnnual` seam
lane), the register wears by it (`wornShareOf`), the upkeep target is it on the online plant,
`companyNetInvestmentRate` reads it, and every seed strikes EBIT off it. The cost against profit and
the reduction in the stock are one number by construction, which is what A3 asks — and since
26-f-ii a fully worn vintage leaves the register, so the charge stops when the plant is gone (the
scalar carried worn plant in gross for ever and kept charging upkeep and depreciation on it).

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

### ✅ A4 / ⚠️ A5 — PLANT IS DATED VINTAGES OF A KIND, AND WHAT IT CAN PRODUCE IS ITS SCARCEST KIND

*2026-09-05 (§9.26-f-ii):* plant is a register of dated vintages (`domain/plant.ts`): what each
commissioning cost, the week it entered service, its own life. Gross, net, accumulated depreciation
and the week's charge are READS of it; `grossPPELocal` and `accumulatedDepreciationLocal` are gone
from the company and the row store, and so are the `× 0.45` / `× 0.35` worn fractions the seed
stated — a stationary plant is vintages spread evenly over the life, half worn, built not asserted.
Every writer is a vintage move: commissioning appends, a scrap retires the OLDEST first
(`scrapPlantShare`), a spin-off slices every vintage pro rata (`slicePlant`, and its share of the
construction queue with it — the structuredClone had given both books the whole queue), a merger
and a resolution concatenate (`mergePlant`, the queue too), and the estate's buyers take slices at
the cleared price of book — the machines keep their age and life when they change hands.

*2026-09-05 (§9.26-f-iii):* and every one of those moves is a WIRE (kind `PLANT`, in units of cost,
`ledger/plant-ledger.ts:movePlant` / `movePlantQueue`), what is not a move — commissioning, wear-out,
scrap, abandonment, an FDI birth's minting — a transformation on the same journal, and `audit/wires.ts`
W6 closes the identity per firm every week (`plantIdentityGaps`): Δ(gross plant) = commissioned −
retired − scrapped − abandoned + born + wires in − wires out, and the construction queue's own line.
A pool carve-out's plant is a wire from the segment; an FDI subsidiary's is minted and says so.

*2026-09-05 (§9.26-f-iv-a):* a vintage now records WHAT it is — `PlantVintage.kind`, the CAPITAL_GOOD
sub-unit the purchase named, stamped on the construction lot at landing (`05-unit-bidding.ts`,
`goods-arrival.ts`), carried through the front seam's construction CSR, and set on the vintage at
commissioning, one vintage per kind per week; the seed builds the register in the mix the firm buys
with, a carrier's fleet as `commercial_fleet`; every move keeps the kind.

*2026-09-05 (§9.26-f-iv-b):* and the mix is the INDUSTRY's — `IndustrySpec.capitalMix`, what each
industry's plant is made of, stated the way its recipes are; `capitalMixOf` reads a firm's from its
lines by revenue share (a profile firm's from its profile), stage 05 splits each buyer's capex bid by
it, stage 03 sizes the capital-goods industries by it, the seed builds the register in it — and each
capital good has its own life (`SubUnitSpec.usefulLifeYears`: a building's forty years, a server's
five), stamped on the vintage at commissioning. The one basket every buyer shared
(`capexBasketWeight`) is gone. With it went a routing defect the step's own test found: a purchase's
kind was the GOOD's question ("does any recipe consume this?"), so four of the five capital goods
landed as input lots nobody drew; it is the buyer's (`purchaseKindOf`), and a manufacturer's heavy
equipment is plant.

*2026-09-05 (§9.26-f-iv-c), A4 closed:* capacity reads the plant that SERVES the line —
`plant.ts:plantEffectiveNetLocal`, Leontief over the kinds the line's industry's capital is made of:
the net of each kind over its share, the minimum. A register built in the mix is worth its whole net;
heavy equipment merged into a software firm adds nothing to what it can make; a firm with all the
buildings and none of the machines makes nothing. Misallocation is possible and costly, which is what
A4 asks. The estate's bidders pay for what the kinds on offer can produce for THEM — the effective
plant a slice adds to the bidder's own register in its own mix, per unit of book, scales the
reservation (`sellPlantToBidders`), and a bidder the slice cannot serve does not bid.

A5 stays ⚠️: a vintage's value is now what it can produce for capacity and for the estate's price,
but the BOOKS never revalue it — a vintage is carried at cost less wear whatever its kind's use, and
the only write-down is `capacityRetirement`'s scrap of a share mothballed for a year, taken oldest
first rather than from the kinds in excess of the scarcest. A write-down that is a fall in what the
plant can produce is a later step.

### ❌ D4 / E4 — THE TWO VERIFY NODES ARE NEVER MEASURED

Nothing reconciles capacity against output and utilisation (D4), and nothing measures the chain from
a credit tightening through B1.b and B2.a to investment and then output (E4). E4 is the whole point
of the tree, and it cannot be measured today because B1.b's input is the wrong rate — so it is
blocked on B1's step rather than being a standing read. Both belong in **§3 step 38's standing
measurements**; E4 to be taken only after B1 lands. **A measurement, for §3 step 38.**

### Also marked, briefly

- **B1.a ⚠️** — the return signal is the category's shortfall, not the firm's own expected demand and price — B3.
