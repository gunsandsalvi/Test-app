# SYSTEM: COMMODITIES SPOT

Physical stuff bought and sold for delivery now: energy, metals, agricultural output. Different
from `goods.md` because a commodity is **fungible, storable and traded as a financial asset as
well as consumed**; different from `commodity-futures.md` because this is the physical leg the
future settles against.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A COMMODITY IS
- **A1** REASON — a **standardised, fungible unit** — a grade, at a location, in a quantity unit
  (rule 8)
  - A1.a **location is part of the identity**: the same grade in two places is two prices, and
    the difference is transport (`freight-and-logistics.md`)
- **A2** REASON — it is **produced by named producers** and **consumed by named consumers**
- **A3** REASON — it is **storable**, at a cost, which is what makes it an asset and not just a
  flow
- **A4** REASON — its **stock is finite and observable**: inventory is a real number held by real
  parties

### B. SUPPLY
- **B1** REASON — a producer produces at a **cost**, and it produces because the price covers it
  - B1.a costs differ across producers, so the supply schedule is a **consequence of the cost
    distribution**, never a curve written down
- **B2** REASON — **capacity is fixed in the short run** and changes only through investment
  (`the-capital-programme.md`), which takes time
  - B2.a which is why supply is inelastic on the horizon that matters, and why price does the
    adjusting
- **B3** REASON — production can be **disrupted**, and a disruption is a real loss of units
- **B4** REASON — a producer can **hold inventory** rather than sell, if it expects a better price

### C. DEMAND
- **C1** REASON — a consumer buys because it **needs the input** (`firm-fundamentals.md`) or
  consumes it (`households.md` C3)
- **C2** REASON — demand is **inelastic in the short run** for the same reason as B2: the buyer
  cannot change its process this week
- **C3** REASON — an **investor** may also buy, to hold, because it expects the price to rise —
  and that is a reason like any other, competing for the same physical units
- **C4** VERIFY — with both sides inelastic, small imbalances should produce large price moves.
  That is a consequence to be measured, not a volatility parameter

### D. THE MARKET
- **D1** REASON — the price **clears** (`the-clearing-engine.md`), per grade and location
- **D2** REASON — **inventory is the buffer**: when demand exceeds production, stocks fall, and
  when stocks approach zero the price has nothing left to ration with
  - D2.a so the inventory level is a **state variable that carries across weeks**, and the price
    depends on it
- **D3** REASON — **storage costs money** and the cost is paid to somebody (a storer, an owner of
  a tank or a warehouse)
- **D4** REASON — the relationship between spot and forward is a **consequence of storage cost,
  financing cost and scarcity** (`commodity-futures.md` C), never an imposed basis
- **D5** VERIFY — Σ produced + opening inventory = Σ consumed + closing inventory, per commodity
  and location, exactly

### E. WHAT IT FEEDS
- **E1** REASON — commodity prices are **input costs** to firms, and they show up in PPI before
  CPI (`indices.md` D4.a)
- **E2** REASON — energy reaches **households directly** as consumption
- **E3** REASON — a **producing region's terms of trade** move with the price, which moves its
  currency's fundamentals (`cross-border.md`, `fx-spot.md` B)
- **E4** VERIFY — a commodity shock should propagate to margins, then to inflation, then to policy
  — through the chain, and if it arrives anywhere directly, a link has been short-circuited

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no consumption without production or inventory.** Units cannot be conjured
- **F2** FORBID — **no negative inventory**, ever, anywhere
- **F3** FORBID — **no price from a written path.** A commodity price series applied to the world
  is rule 2's defect and removes every mechanism above

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a standardised fungible unit — grade, location, quantity | `src/domain/instruments.ts:Commodity` | ⚠️ |
| **A1.a location is part of the identity** | — | ❌ |
| A2 produced by named producers, consumed by named consumers | `src/engine/macro/evolution.ts:computeCommodityClearingRatio` | ⚠️ |
| A3 it is storable, at a cost | `src/domain/instruments.ts:inventoryLevelPct` | ⚠️ |
| **A4 the stock is finite and observable, held by real parties** | `src/engine/macro/evolution.ts:inventoryLevelPct` | ❌ |
| B1 a producer produces at a cost, because the price covers it | `src/engine/macro/evolution.ts:supplyElasticity` | ⚠️ |
| B1.a the supply schedule is a consequence of the cost distribution | — | ❌ |
| B2 capacity is fixed in the short run | — | ❌ |
| B2.a so supply is inelastic and price does the adjusting | `src/engine/macro/evolution.ts:supplyElasticity` | ⚠️ |
| B3 production can be disrupted — a real loss of units | `src/engine/macro/evolution.ts:yieldLossShare` | ✅ |
| B4 a producer can hold inventory rather than sell | — | ❌ |
| C1 a consumer buys because it needs the input | `src/engine/simulation/stages/04-input-output.ts:runInputOutputStage` | ⚠️ |
| C2 demand is inelastic in the short run | `src/engine/macro/evolution.ts:demandElasticity` | ⚠️ |
| C3 an investor may buy the physical, to hold | — | ❌ |
| C4 VERIFY small imbalances produce large price moves | `src/engine/macro/evolution.ts:supplyDemandDrift` | ❌ |
| **D1 the price clears, per grade and location** | `src/engine/macro/evolution.ts:evolveCommodity` | ❌ |
| **D2 inventory is the buffer** | `src/engine/simulation/stages/04-input-output.ts:totalAvailableSupply` | ❌ |
| **D2.a a state variable that carries across weeks, and price depends on it** | `src/engine/simulation/stages/04-input-output.ts:decayedInventory` | ❌ |
| D3 storage costs money, paid to somebody | — | ❌ |
| D4 spot–forward is a consequence of storage, financing and scarcity | `src/engine/simulation/stages/derivative-markets/commodity-future.ts:impliedConvenienceYield` | ✅ |
| **D5 VERIFY Σ produced + opening = Σ consumed + closing** | — | ❌ |
| E1 commodity prices are input costs, and hit PPI before CPI | `src/engine/simulation/stages/04-input-output.ts:newPriceIndex` | ❌ |
| E2 energy reaches households directly | `src/domain/industry-registry.ts:refined_products` | ✅ |
| E3 a producing region's terms of trade move with the price | — | ❌ |
| E4 VERIFY the shock propagates along the chain, not directly | — | ❌ |
| **F1 FORBID no consumption without production or inventory** | `src/engine/macro/evolution.ts:demandUnits` | ❌ |
| **F2 FORBID no negative inventory** | `src/engine/ledger/goods-ledger.ts:setSegmentStock` | ❌ |
| **F3 FORBID no price from a written path** | `src/engine/macro/evolution.ts:safeDriftExponent` | ❌ |

---

## 3. THE DIFF

### ❌ F3 / D1 — THE SPOT PRICE IS A WALKED SERIES

*2026-09-05 (§9.18-i). The 0.5 floor, the ±4%/week cap on the imbalance term and the 0.9 cap on
a weather loss are gone (rule 6; a loss is capped at all of the crop, which is arithmetic). The
walk itself stands until §3 step 22 clears spot.*

`evolution.ts:1424`:

```
const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(safeDriftExponent)).toFixed(2)));
```

where `safeDriftExponent = drift * 0.4 + supplyDemandDrift`, `drift` is
`globalGrowth * 0.8 / 52 + (random() − 0.5) * volatility * √(1/52)`, and `supplyDemandDrift` is
`clamp(±0.04, (clearingRatio − 1) * 0.12)`. Nobody bids, nobody offers, nothing is allocated; the
last price is multiplied by an exponential of a growth term, a noise term and a clamped imbalance
term. `07-commodities.ts` is a 16-line wrapper over it.

**Already §3 step 22**, which names this line and this shape exactly. Two additions for whoever
takes the step:

- **The clamp is load-bearing and it is C4's answer.** `±0.04` per week caps how fast the price can
  respond no matter how large the imbalance, which is the direct negation of C4 ("with both sides
  inelastic, small imbalances should produce large price moves"). A bound where a mechanism
  belongs (rule 6), and it comes out with the auction.
- **The elasticities are the demand and supply curves, written down.** `demandElasticity = −0.7`
  and `supplyElasticity = 0.5` (`evolution.ts:1389-1390`) applied to a price ratio *are* the
  schedules B1.a says must be a consequence of the cost distribution. When the auction arrives,
  these two constants are what it replaces.

### ❌ D2 / D2.a / D5 / F1 / F2 — THERE IS NO COMMODITY STOCK. NOT A BAD ONE — NONE

This is what §3 step 22 does **not** cover, and it is the larger half.

`Commodity` (`instruments.ts:125`) carries `inventoryLevelPct: number` — a **percentage**, 0 to
100 — and `evolution.ts:1447` evolves it as:

```
const inventoryLevelPct = Math.max(0, Math.min(100,
  Math.round(comm.inventoryLevelPct + (random() - 0.5) * 3 - yieldLossShare * 40)));
```

A random walk in a box. It is not units, it is not held by anyone, it is not touched by production
or consumption, and **it is not an input to the price** — `supplyDemandDrift` reads
`clearingRatio` only. So:

- **D2 / D2.a** — the price does not depend on inventory and inventory does not carry the balance;
  a week of deficit leaves no trace on next week's stock.
- **D5** — `weeklySupplyUnits` and `weeklyDemandUnits` are two independent elasticity formulas
  (`evolution.ts:1391-1392`). They are never reconciled to a stock, never to each other, and never
  to a prior level. The identity has no terms to check.
- **F1** — `demandUnits` is computed from the demand elasticity with **no supply term in it**.
  Consumption exceeding production is not merely possible, it is unremarked: it prints as
  `supplyDemandBalance: 'Deficit (Tight Supply)'` and nothing else.
- **F2** — the only thing preventing a negative inventory is `Math.max(0, …)` on a percentage that
  the flows never touched. That is a clamp, not a stock discipline. (§9.13-BOOK f5: the stock is
  a GOOD row on the region's segment now, in units, and 04's production, draw and decay are the
  goods flows `W4` reads against it — a holder and a unit; the discipline behind the clamp is
  still 04's own arithmetic.)

Contrast the goods side, which has all of this: `audit/wires.ts`'s **W4** checks
`Δ(output stock + input lots + in transit) = produced − consumed − scrapped + wires in − wires
out`, per region and sub-unit, **in units**, every week, with a float-dust tolerance. The
machinery D2/D5/F2 need already exists one directory away and is not pointed at commodities.

**§3 step 37-COMMODITY**, and it should be taken *with* step 22 rather than after it: an auction
needs a float to allocate, and a physical commodity's float is its inventory. Sizing: the same
shape as the goods ledger's flows (`produceGoods` / `consumeGoods` / `scrapGoods`) plus a holder,
which is what A4 and D3 also need.

### ❌ A1.a / A4 / D3 / C3 / B4 — THE COMMODITY IS A PRICE SERIES, NOT A THING SOMEBODY OWNS

Five nodes fail for one reason. A `Commodity` has an id, a name, a symbol, a category, a unit
label, a spot price, a futures strip, a volatility and an inventory percentage. It has **no
location, no owner and no storage cost**, and no party's balance sheet carries a barrel of it.

- **A1.a** — one global spot price. The same grade in two places cannot be two prices, so the
  location basis this tree shares with `freight-and-logistics.md` D3 has nothing to be a basis of.
  (The *goods* representation of the same materials does have per-region prices — see below.)
- **A4** — the stock is a percentage, not units held by real parties.
- **D3** — nothing is paid to a storer. The goods side does pay warehousing to named distributors
  (`stage08-back.ts:626`); the commodity side has no such leg.
- **B4 / C3** — with no stock and no owner, a producer cannot withhold and an investor cannot buy
  the physical to hold. `commodity-futures.md`'s hedgers exist; a physical holder does not.

**§3 step 37-COMMODITY**, folded into the one above — these are the same absence stated five ways.

### ⚠️ THE TWO REPRESENTATIONS, AND WHICH ONE IS REAL

Worth stating plainly because it decides the shape of every fix here. **Every commodity in this
model exists twice.**

1. As a `Commodity` in `state.commodities`: a global spot price on a written path, with a
   percentage inventory. This is what the trading screens, the futures strip and `04-input-output`
   read.
2. As a **goods sub-unit** in the industry registry (`upstream_extraction`, `refined_products`,
   `agricultural_commodities`, `specialty_metals`, `electricity`): produced by named firms with
   real capacity, cleared in a per-region double auction, held as lots and output stock with a
   units identity, shipped by named carriers, and consumed by real recipes.

`COMMODITY_CATEGORY_LINKAGE` (`domain/instruments.ts:114`) is the join, and the join runs one way
only: `computeCommodityClearingRatio` reads the sub-unit's cleared supply and demand to build the
ratio that drives the written path (A2 is ⚠️ for exactly this — the producers are named, but only
as a *statistic* feeding a formula). Nothing flows back: no firm ever pays the spot price, no
firm's cost is `spotPrice`, and no unit of the `Commodity` is ever delivered. The written path is
a **display of a market that already cleared**, and that is why step 22's "two disconnected
representations of one price" is the right diagnosis.

**Consequence for the fix:** representation 2 already satisfies A2, B1, B2, B3, C1, D2 and F1/F2
in the goods tree's terms. What this system needs is not a second physical market — it is for the
`Commodity` object to become a *read* of the sub-unit that already clears, plus the location and
inventory dimensions the sub-unit does not carry.

### ❌ E1 / E3 / E4 — THE CHAIN THIS SYSTEM FEEDS IS CUT AT THE FIRST LINK

E1 requires a commodity price to reach a firm's cost and show in PPI before CPI. The path in the
code is `spotPrice × weeklySupplyUnits → globalWeeklyProductionByInputCat →
newPriceIndex (a smoothed formula) → upstreamScarcityIndex / inputCostPressure`, and those last
two fields are read by **`src/ui/objects/market.tsx:109` and nothing else**. Stage 04's
`_fulfillmentRatio` does reach the kernel, where it becomes `newInputSupplyConstraintFactor` —
which is also read by nothing (see `goods.md` B1.b). So stage 04's entire output is inert, which
is a sharper statement of §3 step 23 than that step currently carries.

E3 is simply absent: `grep -i 'terms of trade' src` returns nothing, and no region's currency
fundamentals read any commodity price. E4's propagation cannot be measured while E1's first link
is cut.

E1 and E4 are **a measurement, for §3 step 38**, once step 23 has deleted the formula index and
the PPI `goods.md` G1.a asks for exists. E3 is **§3 step 37-COMMODITY** and belongs to
`cross-border.md`/`fx-spot.md` rather than here; recorded so it is not lost.

### ✅ D4 / B3 — TWO NODES THAT ARE RIGHT

D4 is genuinely satisfied and is the best-built node in this tree: the futures strip is **not**
drawn from spot by formula any more — `07i` clears all three tenors against real producer and
consumer hedging demand, and the convenience yield is **inferred** from what cleared
(`commodity-future.ts:216`, `impliedConvenienceYield`). That is precisely "a consequence of
storage cost, financing cost and scarcity, never an imposed basis", and it is the shape the spot
side still needs.

B3 is right too: a weather event destroys a share of the **yield** (`yieldLossShare`), and the
file's own comment records that it used to add a price impact instead. The disruption is a loss of
units; it is only the absence of a stock for those units to come out of that keeps it from being
fully real.

### Also marked, briefly

- **A1 ⚠️** — a unit and a symbol, no grade and no location — A1.a above.
- **A3 ⚠️** — storable as a percentage on a random walk; nothing is paid to store it — D3.
- **B2.a ⚠️ / C2 ⚠️** — `supplyElasticity` and `demandElasticity` are the constants the auction replaces — F3/D1 above.
