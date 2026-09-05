# SYSTEM: GOODS

Real things produced, sold, shipped and held. Production, the unit auction, delivery, inventory
and the price indices over them. Excludes labour (its own system) and plant (its own system), but
the boundary with both is a node here.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments.

### A. WHAT A GOOD IS
- **A1** REASON — a good is a sub-unit of an industry with a **physical unit of measure**
- **A2** REASON — it is produced from inputs by a **recipe**
  - A2.a **fixed input quantities per unit of output — a Leontief recipe, no substitution**
    *(user: "A.2.a you choose")*. I choose fixed, for one reason and with one cost stated: fixed
    coefficients make an input shortage bite as a real production constraint (B1.b) rather than
    being smoothed away by a substitution elasticity nobody can observe, which is what makes a
    supply shock transmit at all. The cost is that a firm facing an expensive input cannot
    economise on it, so **substitution is a MISSING node here rather than an assumption away** —
    if a relative-price response is wanted later it is a new mechanism, not a parameter
  - A2.b plus labour, plus capital services
- **A3** REASON — storable or perishable, as a property of the good
- **A4** REASON — homogeneous within its sub-unit; otherwise it is a different sub-unit

### B. PRODUCTION
- **B1** REASON — **a firm has a production DECISION with reasons: expected demand, its margin, its
  capacity, its inputs, its labour. The quantity is the OUTCOME** *(user: "B1/B2 again not imposed,
  a consequence")*
  - B1.a capacity (plant) is one of the reasons, and binding capacity is a real state
  - B1.b inputs on hand are another, and a shortage is a real state — see A2.a
  - B1.c labour available is another
  - B1.d VERIFY — utilisation is a read of the outcome against capacity, never an input to it
- **B2** REASON — **production consumes the inputs it consumes.** The consumption is the physical
  consequence of B1's decision, and the recipe says how much — never a separately-chosen number
- **B3** REASON — **work in progress** exists between input and output, owned by somebody
- **B4** REASON — **yield**: not everything started is finished. Scrap is real and it is a loss
- **B5** REASON — unit **cost** = inputs consumed + wages + capital charge

### C. THE MARKET
- **C1** REASON — sellers offer quantities; buyers post the most they will pay
- **C2** REASON — a **price clears** per (good, market, period), from C1 meeting C1
- **C3** REASON — buyers are heterogeneous and bid for their own reasons: firms buying inputs,
  households consuming, government procuring, foreign buyers
- **C4** REASON — **rationing** when demand exceeds supply, by a rule that is stated once
- **C5** REASON — **unsold output stays with the seller.** Illiquidity in goods is unsold stock
- **C6** REASON — the price is in the **seller's** currency; a foreign buyer converts (see the
  currency tree)

### D. DELIVERY AND LOGISTICS
- **D1** REASON — goods move physically from seller to buyer
- **D2** REASON — that takes **time** and costs **money**
- **D3** REASON — a **carrier** is a named party that earns the freight
- **D4** REASON — **landed cost** = ex-works price + freight (+ duty)
- **D5** REASON — goods **in transit** are owned by somebody and sit on somebody's book

### E. INVENTORY
- **E1** REASON — a holder's stock is a **quantity of units**, and its value is units × a price
- **E2** REASON — **carried at the LOWER OF COST AND NET REALISABLE VALUE** *(user: "E2 apply real
  world facts")*. That is the actual accounting rule (IAS 2, and ASC 330 in substance): cost until
  the market falls below it, then written down to market, and **the write-down is a charge to
  income in the period it happens**
  - E2.a a write-down is **not reversed** beyond the original cost — an unrealised holding GAIN on
    ordinary inventory is not recognised
  - E2.b the exception is real and narrow: **commodity broker-dealers carry at fair value through
    income**, because for them the inventory is the position
  - E2.c FORBID — inventory is never carried at market when market is ABOVE cost for a
    non-broker-dealer. Marking it up invents profit the firm has not earned
- **E3** REASON — the **holding loss** is therefore an event with a date, a size and a P&L line —
  the asymmetry in E2/E2.a is the mechanism, not an approximation of one
- **E4** REASON — spoilage, obsolescence and shrinkage remove units without a sale
- **E5** REASON — **cost flows out FIFO or weighted-average; LIFO is not permitted** *(user: "E5
  real world")*. IFRS prohibits LIFO outright; the choice is FIFO or weighted average cost, it is
  disclosed, and it is applied consistently. It changes reported profit and the balance-sheet
  carrying value in opposite directions when prices move, so it is a real decision with a real
  consequence and not a bookkeeping detail

### F. THE CASH LEGS
- **F1** REASON — the buyer pays the seller, by name
- **F2** REASON — **payment terms**: immediate, or trade credit with a due date
- **F3** REASON — trade credit is a **loan between two named firms**, and it can go bad
- **F4** REASON — the freight is paid **to the carrier**
- **F5** REASON — revenue is recognised on delivery; **cost of goods sold** is the units that left,
  valued per E5

### G. THE AGGREGATE
- **G1** REASON — **PPI and CPI are different indices over different baskets** *(user: "G there
  should be a difference between PPI and CPI")*
  - G1.a **PPI** — prices received by domestic PRODUCERS at the factory gate. Weighted by
    production. Excludes freight to the buyer, excludes distribution margin, excludes consumption
    tax, and **includes intermediate goods a household never buys**
  - G1.b **CPI** — prices paid by HOUSEHOLDS for final consumption. Weighted by household
    expenditure. Includes freight, the channel's margin and consumption tax, includes imports at
    the price a household actually pays, and **excludes intermediate goods entirely**
  - G1.c VERIFY — the two therefore diverge, and the gap is economically meaningful: it is the
    distribution wedge plus tax plus the import/export mix. A model with one index and two names
    cannot show margin compression, which is most of what a cost shock does to a firm
- **G2** REASON — inflation is the change in the relevant index, and which one is always stated
- **G3** REASON — real and nominal output are distinguishable, deflated by the right index
- **G4** VERIFY — capacity utilisation is a read (see B1.d)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a sub-unit with a physical unit of measure | `src/domain/goods-physical.ts:unitMassTonnes` | ✅ |
| A2 produced from inputs by a recipe | `src/domain/industry-registry.ts:firmInputIntensities` | ✅ |
| **A2.a fixed input quantities per unit — Leontief, no substitution** | `src/engine2/front-core.ts:RECIPE_INTENSITY` | ❌ |
| A2.b plus labour, plus capital services | `src/engine/simulation/stages/05-unit-bidding.ts:firmWeeklyCostLocal` | ⚠️ |
| A3 storable or perishable | `src/domain/goods-physical.ts:shelfLifeWeeksOf` | ✅ |
| A4 homogeneous within its sub-unit | `src/engine/simulation/stages/05-unit-bidding.ts:runSubUnitMarkets` | ✅ |
| B1 the production DECISION, quantity the outcome | `src/engine/simulation/stages/05-unit-bidding.ts:buildRegionSupplyPlans` | ✅ |
| B1.a capacity is a reason and binds | `src/engine/simulation/stages/05-unit-bidding.ts:weeklyCapacityUnits` | ✅ |
| **B1.b inputs on hand are a reason; shortage is a real state** | `src/engine2/front-core.ts:newInputSupplyConstraintFactor` · `src/domain/company-week/inventory.ts:fulfillmentRatio` | ⚠️ |
| B1.c labour available is a reason | `src/engine/simulation/stages/05-unit-bidding.ts:staffedShare` | ✅ |
| B1.d VERIFY utilisation is a read of the outcome | — | ❌ |
| **B2 production consumes the inputs it consumes** | `src/engine2/front-core.ts:consumeFifoOnViews` | ⚠️ |
| B3 work in progress, owned by somebody | `src/engine/simulation/stages/05-unit-bidding.ts:advanceProductionPipeline` | ✅ |
| B4 yield — not everything started is finished | `src/engine/macro/weather.ts:subUnitYieldLossShareOf` | ⚠️ |
| B5 unit cost = inputs + wages + capital charge | `src/engine/simulation/stages/05-unit-bidding.ts:prospectiveUnitCostLocal` | ⚠️ |
| C1 sellers offer, buyers post the most they will pay | `src/engine/simulation/stages/double-auction.ts:AuctionOffer` | ✅ |
| C2 a price clears per (good, market, period) | `src/engine/simulation/stages/double-auction.ts:clearDoubleAuction` | ✅ |
| C3 buyers are heterogeneous and bid for their own reasons | `src/engine/simulation/stages/05-unit-bidding.ts:buildRegionDemandPlans` | ✅ |
| C4 rationing by a rule stated once | `src/engine/simulation/stages/double-auction.ts:offerFill` | ✅ |
| C5 unsold output stays with the seller | `src/engine/ledger/goods-ledger.ts:settleOutputInventory` | ✅ |
| C6 priced in the seller's currency; the buyer converts | `src/domain/currency.ts:convertLocal` | ✅ |
| D1 goods move physically from seller to buyer | `src/engine/ledger/goods-ledger.ts:deliverGoods` | ✅ |
| D2 it takes time and costs money | `src/domain/carrier.ts:laneTransitWeeks` | ✅ |
| D3 a carrier is a named party that earns the freight | `src/engine/simulation/stages/freight-clearing.ts:isCarrier` | ✅ |
| D4 landed cost = ex-works + freight | `src/engine/simulation/stages/sourcing-intent.ts:freightPerUnitLocal` | ✅ |
| D5 goods in transit are owned by somebody | `src/engine/simulation/stages/goods-arrival.ts:InTransitShipment` | ✅ |
| **E1 stock is units; value is units × a price** | `src/engine/ledger/goods-ledger.ts:setOutputStock` | ⚠️ |
| **E2 carried at the LOWER OF COST AND NRV** | — | ❌ |
| E2.a a write-down is not reversed | — | ❌ |
| E2.b broker-dealers carry at fair value | — | ❌ |
| **E2.c FORBID never carried at market above cost** | `src/engine/ledger/goods-ledger.ts:settleOutputInventory` | ❌ |
| E3 the holding loss is an event with a P&L line | — | ❌ |
| E4 spoilage, obsolescence, shrinkage remove units | `src/engine/ledger/goods-ledger.ts:spoilOutputStock` · `src/domain/industry-registry.ts:annualSpoilageRateOf` | ⚠️ |
| E5 FIFO or weighted average; never LIFO | `src/engine2/lots.ts:consumeFifoOnViews` | ✅ |
| F1 the buyer pays the seller, by name | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| F2 payment terms | `src/domain/trade-invoice.ts:paymentTermWeeks` | ✅ |
| F3 trade credit is a loan between two named firms | `src/engine/simulation/stages/trade-settlement.ts:runTradeSettlementStage` | ✅ |
| F4 the freight is paid to the carrier | `src/engine/simulation/stages/05-unit-bidding.ts:R_FREIGHT` | ✅ |
| F5 revenue on delivery; COGS is the units that left | `src/engine2/front-core.ts:realInputConsumptionCostLocal` | ⚠️ |
| **G1 PPI and CPI are different indices** | — | ❌ |
| **G1.a PPI — prices received at the factory gate** | — | ❌ |
| G1.b CPI — prices paid by households | `src/engine/simulation/stages/price-index.ts:buildCpiBasket` | ✅ |
| G1.c VERIFY the two diverge, and the gap is the wedge | — | ❌ |
| G2 inflation is the change in the relevant index | `src/engine/simulation/stages/price-index.ts:computeCpiLevel` · `src/domain/units.ts:yearOverYear` | ⚠️ |
| G3 real and nominal output are distinguishable | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:gdpGrowthBottomUp` · `src/domain/units.ts:realGrowthAnnual` | ⚠️ |
| G4 VERIFY capacity utilisation is a read | — | ❌ |

---

## 3. THE DIFF

### ❌ A2.a — THE RECIPE IS A VALUE SHARE, SO EVERY INPUT SUBSTITUTES UNIT-ELASTICALLY

The node chose fixed coefficients and stated the cost of choosing them. The code has the opposite,
and it is not an approximation of Leontief — it is a *unit elasticity of substitution*, which is
the strongest substitution assumption in common use.

`industry-registry.ts:203` — `recipeInputs: { upstream_extraction: 0.55, … }` — is **55 cents of
upstream extraction per dollar of refined-products REVENUE**, not a quantity per unit of output.
`front-core.ts:659-666` then does exactly what that implies:

```
const neededLocal   = lineProductionLocal * RECIPE_INTENSITY[r];   // dollars in, fixed share
const neededUnits = neededLocal / Math.max(0.01, inputUnitPrice); // …divided by the price
```

So when an input's cleared price doubles, the firm draws **half the physical units** and its input
bill is unchanged. A supply shock cannot bite as a real production constraint, because the firm
economises on the scarce input by exactly the amount that keeps its cost share constant — the
smoothing A2.a exists to forbid. It runs the other way too: when the firm's own OUTPUT price
rises, `lineProductionLocal` (revenue ÷ 52) rises and it draws more input units for the same
physical output.

**§3 step 37-GOODS-RECIPE**, and a large one: it is the recipe's unit
of account, so it touches the registry's 37 sub-unit BOMs, `firmInputIntensities`, the stage-05
input bid (`computeRecipeInputNeedLocal`, same shape), the intermediate-demand solve
(`totalOutputFromFinalDemand`) and the kernel draw together.

### ❌ B1.b / ⚠️ B2 — THE INPUT SHORTAGE IS MEASURED, AND NOTHING READS IT

Two separate defects that compound.

**The shortage is inert.** `front-core.ts` measures `physicalFulfillment` from the real FIFO
draw, smooths it into `newInputSupplyConstraintFactor` (§9.23: stage 04's market ratio, which was
min'd in here, is deleted with the stage — the draw is the only fulfilment now), and
`stage08-back.ts` stores it on the company. It is then
read by **`src/ui/functions/lines.tsx:33` and nothing else** — no production decision, no revenue
term, no capacity term. A firm that received none of an input it needs makes exactly as much as a
firm that received all of it. B1.b's "a shortage is a real state" is true of the field and false
of the world.

**The consumption is not the decision's consequence.** B2 requires the draw to be the physical
consequence of B1's quantity. It is sized from `annualRevenue / 52 × plShare` in stage 08
(`front-core.ts:657`), a *different stage* from the one that decided `targetProductionUnits`
(`05-unit-bidding.ts:1088`), against a *different quantity* (last week's annualized revenue rather
than this week's planned units). The stock identity `W4` (`audit/wires.ts`) still closes, because
consumption is recorded wherever it happens — but what a firm consumes and what it decided to make
are two numbers with no arithmetic between them.

**§3 step 37-SMALL** (one step, since the fix is the same wiring: production decides, the draw
follows, and the shortfall caps output).

### ❌ E2 / E2.c — FINISHED STOCK IS MARKED TO MARKET, IN BOTH DIRECTIONS

`goods-ledger.ts:110` and `:123` both write `valueLocal = heldUnits * unitPriceLocal`, and
`05-unit-bidding.ts:1839` passes `results[plan.regionId].clearedPriceLocal` — **this week's cleared
price**. There is no cost basis on finished goods anywhere: not a lot chain, not a weighted
average, not a field. So the stock is revalued up when the market rises (E2.c's exact FORBID —
profit the firm has not earned), revalued down when it falls, and neither move is a P&L event
anybody books (E3). The one write-down that does exist is the warehousing charge
(`front-core.ts:598`, `outNewValue = outValue − outValue × CARRY_RATE_WEEKLY`), and stage 05
overwrites it the following week with units × the new price.

This is the second half of §3 step 13's `goods-ledger.ts:123` finding — step 13 records that the
price is **discarded**; this records that before it is discarded it has already **replaced the
cost**. **Already §3 step 13** for E1, and the lower-of-cost-and-NRV rule (E2, E2.a, E3) is the
mechanism step 13's item 2 says is new. Note for whoever takes 13: E5's FIFO machinery already
exists for input lots (`engine2/lots.ts`), so the missing piece is a cost basis on *output*, not a
new flow convention.

### ❌ G1 / G1.a — THERE IS NO PPI. ONE INDEX WEARS BOTH NAMES

`grep -ri 'ppi\|producerPrice' src` returns nothing. The model publishes a household CPI
(`price-index.ts`), correctly built on the **shelf** price, and no other price aggregate (§9.23
deleted stage 04's formula index; a category carries one index, `clearedInputPriceIndex`, its own
cleared price against its seed, and the market view reads a buyer's input prices through its
recipe). So:

- there is no production-weighted, factory-gate index at all;
- real output is deflated by the consumer index — `11-fiscal:174`,
  `gdpGrowthBottomUp = realGrowthAnnual(nominal YoY, reg.inflationAnnual)` — the ratio of the
  gross rates since §3.28b-i — where `reg.inflationAnnual` is CPI. G3 is
  therefore ⚠️ rather than ❌: the deflation happens, with the wrong deflator;
- G1.c's wedge — distribution margin plus consumption tax plus import mix — cannot be read,
  which means **margin compression is invisible**, and the tree names that as most of what a cost
  shock does to a firm.

The inputs for a real PPI are all present and already measured per sub-unit:
`demandState.exWorksUnitPriceLocal` (05-unit-bidding:2306) is the factory gate, and
`totalUnitsSuppliedThisWeek` is the production weight. **§3 step 37-BENCHMARK** — small.

### ⚠️ B4 / ❌ B1.d / ⚠️ E4 — THREE THINGS THAT (MOSTLY) NEVER HAPPEN TO A UNIT

- **B4 yield.** *2026-09-05 (§9.22): one yield loss is real — a weather event's. What the plant
  FINISHED is what the region's weather left of it (`05-unit-bidding.ts`, the loss share from
  `weather.ts:subUnitYieldLossShareOf` — the affected commodity's stated loss in its value share of
  the sub-unit), recorded as fewer units produced so `W4` holds without a scrap.* Otherwise
  `advanceProductionPipeline` returns exactly what was started `leadWeeks` ago: no scrap rate, no
  defect rate, no process loss.
- **E4 spoilage — HALF CLOSED (§9.13-INV-ii-b).** It used to read: *nothing in the model ever
  perishes; what decays is the VALUE of output stock, which is a cost and not a unit.* The cause
  was one rate doing two jobs — `annualCarryingCostRateOf` summed a warehouse FEE and a SPOILAGE
  rate, and the week wrote the stock's value down by the total **and** paid the same amount in cash
  to the distribution sector, so a firm was charged twice for storing a good and no unit ever left.
  The rate is split at its source; the fee is the cash charge (and the channel is paid the fee
  alone, not for a good going off in somebody else's warehouse); and the spoilage now takes UNITS,
  at the row's own basis, recorded on the week's journal so W4 replays it. What is still ⚠️ is the
  other two words in the node: **obsolescence and shrinkage** have no mechanism, and a good's
  shelf life is the only reason anything perishes.
- **B1.d / G4 utilisation.** `weeklyCapacityUnits` and `targetProductionUnits` sit beside each
  other in one function and their ratio is never taken.

B4 **is a §3 step** (a unit-destroying transformation the goods ledger
already has the wire kind for — `scrapGoods` — so this is wiring, not a new mechanism). B1.d/G4
are **a measurement, for §3 step 38**.

### ⚠️ B5 / F5 — THE COST OF A UNIT AND THE COST OF THE UNITS THAT LEFT

B5's three terms are two. `05-unit-bidding.ts:945` builds `firmWeeklyCostLocal` as current payroll +
real input lots consumed + the trailing residual; the capital charge is not in it. *2026-09-05
(§9.26-d): capital appears on the ASK as the return the plant requires per unit —
`weeklyCapitalChargeLocal` (`domain/company-week/cost-of-capital.ts`, the one owner of the firm's
hurdle) on this line's share, over the week's units — where it was `marginPremium =
(0.05 + pd × 0.60) × 1.5`, a stated hurdle, a stated loss-given-default and a stated shape.* The
break-even test (`coversUnitCost`) is still taken against a cost that excludes that return, which
is B5's remaining ⚠️ and §3 step 30's. F5 follows from E2: COGS is the FIFO cost of inputs consumed, which is
right for the input leg, but the finished units that left have no cost to relieve — their carrying
value was the market price.

### ✅ WHAT IS SOLID, AND WORTH SAYING

C, D and F map almost cleanly, and they are the parts a code-derived tree would have been least
likely to demand. The auction is one implementation (`double-auction.ts`) shared with freight, it
rations pro rata by an explicit rule, and the anchor is the last print rather than a bound. The
delivery chain is complete end to end: three price levels with three real payees (ex-works,
landed, shelf), freight paid by the buyer to a named carrier, a consignment held by that carrier
while it moves, trade credit with terms and a write-off, and a stock identity (`W4`) that audits
Δstock = produced − consumed − scrapped + wires, in units, per region and sub-unit, every week.

### Also marked, briefly

- **A2.b ⚠️** — labour enters the unit cost; capital services do not — B5.
- **E2.b ❌** — no broker-dealer carries a commodity at fair value, because no commodity is held — `commodities-spot.md` A4.
- **G2 ⚠️** — inflation is the CPI's change and nothing says so, because there is no second index to name — G1.
