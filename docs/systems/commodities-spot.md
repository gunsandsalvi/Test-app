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

Mapped 2026-09-03; re-marked 2026-09-05 (§9.22). `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a standardised fungible unit — grade, location, quantity | `src/domain/instruments.ts:Commodity` | ⚠️ |
| **A1.a location is part of the identity** | — | ❌ |
| A2 produced by named producers, consumed by named consumers | `src/domain/commodity-spot.ts:markCommodityToAuction` · `src/engine/simulation/stages/05-unit-bidding.ts:buildRegionSupplyPlans` | ✅ |
| A3 it is storable, at a cost | `src/domain/instruments.ts:inventoryLevelPct` | ⚠️ |
| **A4 the stock is finite and observable, held by real parties** | `src/engine/simulation/stages/07-commodities.ts:inventoryLevelPct` | ❌ |
| B1 a producer produces at a cost, because the price covers it | `src/engine/simulation/stages/05-unit-bidding.ts:coversUnitCost` | ✅ |
| B1.a the supply schedule is a consequence of the cost distribution | `src/engine/simulation/stages/05-unit-bidding.ts:prospectiveUnitCostLocal` | ⚠️ |
| B2 capacity is fixed in the short run | `src/engine/simulation/stages/05-unit-bidding.ts:weeklyCapacityUnits` | ✅ |
| B2.a so supply is inelastic and price does the adjusting | `src/engine/simulation/stages/05-unit-bidding.ts:openOfferUnits` | ✅ |
| B3 production can be disrupted — a real loss of units | `src/engine/macro/weather.ts:subUnitYieldLossShareOf` | ✅ |
| B4 a producer can hold inventory rather than sell | — | ❌ |
| C1 a consumer buys because it needs the input | `src/engine/simulation/stages/05-unit-bidding.ts:recipeInputBuyersBySubUnit` | ✅ |
| C2 demand is inelastic in the short run | `src/domain/market-microstructure.ts:CATEGORY_INPUT_REQUIREMENTS` | ✅ |
| C3 an investor may buy the physical, to hold | — | ❌ |
| C4 VERIFY small imbalances produce large price moves | `src/domain/commodity-spot.ts:worldPrintOf` | ❌ |
| D1 the price clears, per grade and location | `src/domain/commodity-spot.ts:markCommodityToAuction` | ⚠️ |
| **D2 inventory is the buffer** | `src/engine/simulation/stages/07-commodities.ts:inventoryLevelPct` | ❌ |
| **D2.a a state variable that carries across weeks, and price depends on it** | `src/engine/simulation/stages/07-commodities.ts:inventoryLevelPct` | ❌ |
| D3 storage costs money, paid to somebody | — | ❌ |
| D4 spot–forward is a consequence of storage, financing and scarcity | `src/engine/simulation/stages/derivative-markets/commodity-future.ts:impliedConvenienceYield` | ✅ |
| **D5 VERIFY Σ produced + opening = Σ consumed + closing** | — | ❌ |
| E1 commodity prices are input costs, and hit PPI before CPI | `src/engine/ledger/goods-ledger.ts:receiveInputLot` | ⚠️ |
| E2 energy reaches households directly | `src/domain/industry-registry.ts:refined_products` | ✅ |
| E3 a producing region's terms of trade move with the price | — | ❌ |
| E4 VERIFY the shock propagates along the chain, not directly | — | ❌ |
| **F1 FORBID no consumption without production or inventory** | `src/domain/commodity-spot.ts:worldPrintOf` | ❌ |
| **F2 FORBID no negative inventory** | `src/engine/ledger/goods-ledger.ts:settleOutputInventory` | ❌ |
| F3 FORBID no price from a written path | `src/domain/commodity-spot.ts:worldPrintOf` | ✅ |

---

## 3. THE DIFF

### ✅ F3 / ⚠️ D1 — THE SPOT IS THE AUCTION'S GATE PRICE

*2026-09-05 (§9.22). The walk is deleted. `domain/commodity-spot.ts:markCommodityToAuction` sets
`spotPrice` to the linked sub-unit's world print — every origin's ex-works cleared price
(`exWorksUnitPriceLocal`, given its first reader) in the numéraire, weighted by the units that
origin supplied — times the commodity's own unit against the sub-unit's (`goodsUnitsPerUnit`, rule
8, fixed at the seed where the marginal producer's cost per unit meets the sub-unit's seed print).
`weeklySupplyUnits` and `weeklyDemandUnits` are the auction's own supplied and demanded units in
the commodity's value share; the balance word is their ratio. No origin supplied a unit → no
print, the last one carries (§3.21). `evolveCommodity`, `computeCommodityClearingRatio`, the growth
term, the noise term, the imbalance term and both elasticities are gone, and the seed prints
through the same read, so week 0 and week 1 are one shape.*

What that closes, and what it does not:

- **F3 ✅.** Nothing writes a path. The price is what named producers received from named buyers
  in stage 05's auction, and this system's only price-writer is that auction.
- **D1 ⚠️.** It clears — but as **one world print**. A1.a still holds: the same grade in two
  places is one price here, because the `Commodity` has no location, so the four regional gate
  prices are averaged rather than published as four. That is 37-COMMODITY's, with the stock.
- **B1 / B2 / B2.a / C1 / C2 ✅, B1.a ⚠️** — these are the goods side's mechanisms, now read
  rather than re-derived: a producer offers only when the price covers its own dollar cost
  (`coversUnitCost`); its plant binds (`weeklyCapacityUnits`) and what it offers is stock plus what
  the plant finished, so the price does the adjusting; a recipe buyer bids what its recipe needs
  (`CATEGORY_INPUT_REQUIREMENTS`) and cannot change its process this week. B1.a is ⚠️ because
  each producer's floor is its own unit cost and the auction fills cheaper offers first — the
  schedule IS the cost distribution — but that unit cost is `goods.md` B5's ⚠️.
- **C4 ❌** is now a measurement with a price to measure: the imbalance-to-move relation is the
  auction's, not a `±0.04` clamp's. **§3 step 38.**

### ❌ D2 / D2.a / D5 / F1 / F2 — THERE IS NO COMMODITY STOCK. NOT A BAD ONE — NONE

This is what §9.22 did **not** cover, and it is the larger half.

`Commodity` (`instruments.ts`) carries `inventoryLevelPct: number` — a **percentage**, 0 to 100 —
and `07-commodities.ts` moves it as:

```
const inventoryLevelPct = Math.max(0, Math.min(100,
  Math.round(comm.inventoryLevelPct + (random() - 0.5) * 3 - yieldLossShare * 40)));
```

A random walk in a box. It is not units, it is not held by anyone, it is not touched by production
or consumption, and **it is not an input to the price**. The price the commodity now reads does
depend on stock — a firm's ask falls as its warehouse fills (`05-unit-bidding.ts`
`inventoryPricePressure`) and the segment pool's units are offered — but that is the goods
sub-unit's stock, in the goods tree's terms; the commodity's *own* stock is this percentage. So:

- **D2 / D2.a** — the commodity's inventory does not carry the balance; a week of deficit leaves
  no trace on next week's percentage.
- **D5** — `weeklySupplyUnits` and `weeklyDemandUnits` are the auction's own supplied and demanded
  units in the commodity's share (§9.22) — real terms now — but nothing reconciles them to a
  stock, and there is no commodity-level stock to reconcile them to. The identity has two of its
  four terms.
- **F1** — the demanded units are what was bid, and the auction fills only from stock and
  arrivals (`goods.md` F1), so consumption without production is impossible on the goods side;
  the commodity has no stock of its own for the FORBID to be stated on.
- **F2** — the only thing preventing a negative inventory is `Math.max(0, …)` on a percentage that
  the flows never touched. That is a clamp, not a stock discipline. The goods side has the
  discipline (`settleOutputInventory` names a sale that oversells a stock as a defect); the
  commodity has no stock for it to apply to. (§9.23: the region's segment row — 04's own stock,
  produced, drawn and decayed by 04 alone — is deleted with the stage.)

Contrast the goods side, which has all of this: `audit/wires.ts`'s **W4** checks
`Δ(output stock + input lots + in transit) = produced − consumed − scrapped + wires in − wires
out`, per region and sub-unit, **in units**, every week, with a float-dust tolerance. The
machinery D2/D5/F2 need already exists one directory away and is not pointed at commodities.

**§3 step 37-COMMODITY.** A physical commodity's float is its inventory. Sizing: the same shape as
the goods ledger's flows (`produceGoods` / `consumeGoods` / `scrapGoods`) plus a holder, which is
what A4 and D3 also need.

### ❌ A1.a / A4 / D3 / C3 / B4 — THE COMMODITY IS A PRICE SERIES, NOT A THING SOMEBODY OWNS

Five nodes fail for one reason. A `Commodity` has an id, a name, a symbol, a category, a unit
label and its unit against the sub-unit's (§9.22), a spot price that is a read of the goods
auction, a futures strip, a volatility and an inventory percentage. It has **no location, no owner
and no storage cost**, and no party's balance sheet carries a barrel of it.

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

1. As a `Commodity` in `state.commodities`: a global spot price, a futures strip and a percentage
   inventory. This is what the trading screens and the futures book read.
2. As a **goods sub-unit** in the industry registry (`upstream_extraction`, `refined_products`,
   `agricultural_commodities`, `specialty_metals`, `electricity`): produced by named firms with
   real capacity, cleared in a per-region double auction, held as lots and output stock with a
   units identity, shipped by named carriers, and consumed by real recipes.

`COMMODITY_CATEGORY_LINKAGE` (`domain/instruments.ts`) is the join. *2026-09-05 (§9.22): the join
now runs the right way for the PRICE and the week's QUANTITIES — representation 1 is a read of
representation 2 (`domain/commodity-spot.ts`), so the spot a firm hedges and a future settles to
is the gate price the auction struck, and a weather event's loss is a loss of the sub-unit's units
where they are made (`weather.ts:subUnitYieldLossShareOf`, in 05's pipeline). Before this the
sub-unit's cleared supply and demand were read only as a statistic that moved a written path.*

What still does not flow: the `Commodity`'s **stock**, **location** and **holder**. Its inventory
is the percentage walk above, not the sub-unit's stock, and no unit of the `Commodity` as such is
ever delivered — the sub-unit's units are. Representation 2 already satisfies A4, B4, D2, D5 and
F1/F2 in the goods tree's terms; what this system needs is for the `Commodity` to read those too,
plus the location dimension the sub-unit does not carry. **§3 step 37-COMMODITY.**

### ⚠️ E1 / ❌ E3 / E4 — THE CHAIN THIS SYSTEM FEEDS HAS ITS FIRST LINK, AND NO PPI TO SHOW IT

E1 requires a commodity price to reach a firm's cost and show in PPI before CPI. *2026-09-05
(§9.22): the first link is real. A firm pays the sub-unit's landed price for the input lots its
recipe draws (`goods-ledger.ts:receiveInputLot`), and the commodity's spot is that same market's
gate price — so a commodity shock IS an input cost, by construction, not through
a formula index beside it — §9.23 deleted stage 04 whole: its index, its second supply into a
segment pool and its fulfilment ratio.* What is still missing is the PPI it should show in first:
the PPI `goods.md` G1.a asks for does not exist. The PPI and E4's propagation are **a measurement,
for §3 step 38**.

E3 is simply absent: `grep -i 'terms of trade' src` returns nothing, and no region's currency
fundamentals read any commodity price. **§3 step 37-COMMODITY**, and it belongs to
`cross-border.md`/`fx-spot.md` rather than here; recorded so it is not lost.

### ✅ D4 / B3 — TWO NODES THAT ARE RIGHT

D4 is genuinely satisfied and is the best-built node in this tree: the futures strip is **not**
drawn from spot by formula any more — `07i` clears all three tenors against real producer and
consumer hedging demand, and the convenience yield is **inferred** from what cleared
(`commodity-future.ts:216`, `impliedConvenienceYield`). That is precisely "a consequence of
storage cost, financing cost and scarcity, never an imposed basis", and it is the shape the spot
side still needs.

B3 is right, and since §9.22 it is right where it should be: a weather event destroys its stated
share of the affected commodity's **yield**, which is that commodity's value share of the sub-unit
(`weather.ts:subUnitYieldLossShareOf`), and the loss is taken off the units the region's plants
FINISHED this week (`05-unit-bidding.ts`) — fewer units produced, so `W4` holds without a scrap —
and the auction prices the shortage the same week. (It used to scale a supply statistic that moved a written path, and the event once
stated its own price impact.)

### Also marked, briefly

- **A1 ⚠️** — a unit, a symbol and (§9.22) its unit against the sub-unit's; no grade and no location — A1.a above.
- **A3 ⚠️** — storable as a percentage on a random walk; nothing is paid to store it — D3.
