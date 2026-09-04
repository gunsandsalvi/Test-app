# SYSTEM: FREIGHT AND LOGISTICS

Moving goods from where they are made to where they are used. It exists as its own tree for one
reason: **the price of a good depends on where it is** (`commodities-spot.md` A1.a,
`goods.md`), and the thing that connects two locations is a service with its own capacity, its own
cost and its own way of failing.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS BOUGHT
- **A1** REASON — a **service: moving a quantity from A to B, over a time**
- **A2** REASON — it is bought by a **named shipper** from a **named carrier**, at a price, in a
  currency (`cross-border.md` when the two are in different regions)
- **A3** REASON — it has a **duration**, so goods are **in transit** — owned by somebody, not yet
  where they are needed
  - A3.a in-transit inventory is a real asset on a real balance sheet
    (`firm-fundamentals.md` C1) and a real use of working capital
- **A4** REASON — the price is per unit per route, and **routes are distinct**: capacity on one is
  not capacity on another

### B. CAPACITY AND SUPPLY
- **B1** REASON — a carrier owns **capital**: ships, trucks, planes, warehouses
  (`the-capital-programme.md`)
- **B2** REASON — capacity is **fixed in the short run** and expensive and slow to add
  - B2.a so the freight price is **extremely inelastic in the short run**, which is why it moves
    violently and why it is a good early indicator of a real imbalance
- **B3** REASON — it has an **operating cost**: fuel (`commodities-spot.md` E1), labour
  (`labour.md`), and the capital charge
- **B4** REASON — capacity can be **lost or blocked**: a disruption is a real reduction in units
  moved, not a price shock

### C. DEMAND
- **C1** REASON — demand is **derived**: it exists because somebody is trading goods
  (`goods.md`, `cross-border.md` B)
  - C1.a so it is not an independent market — it moves with trade volumes, and that dependence is
    the point
- **C2** REASON — a shipper can **not ship**: hold the goods, source locally, or not trade at all,
  and that substitution is what caps the freight price
- **C3** VERIFY — freight demand should equal the volume actually moving between locations, read
  from the trades, never a separate series

### D. THE PRICE AND WHAT IT DOES
- **D1** REASON — it **clears** (`the-clearing-engine.md`) per route
- **D2** REASON — the freight cost is **part of the delivered price** of the good, so it flows
  into the buyer's cost and the seller's margin (`firm-fundamentals.md` B2)
- **D3** REASON — it is therefore the **mechanism behind the location basis**: the same commodity
  priced differently in two places, with the gap bounded by what it costs to move it
  (`commodities-spot.md` A1.a)
  - D3.a and the arbitrage that enforces the bound is **somebody actually shipping**, with
    capacity and money — so when B2 or B4 bites, the basis widens and stays wide
- **D4** REASON — the **transit time** in A3 is a real lag between a purchase and a delivery
- **D5** VERIFY — the price gap between two locations should track the freight price on the route,
  and a persistent divergence is a finding about capacity, not a number to close

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no instantaneous, costless transport.** That collapses every location into one
  and deletes D3 entirely
- **E2** FORBID — **no shipment without capacity**, and no capacity without a carrier that owns it
- **E3** FORBID — **no goods in transit owned by nobody** (`the-register.md` A3)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a service: moving a quantity from A to B, over a time | `src/domain/carrier.ts:transitWeeks` | ✅ |
| A2 bought by a named shipper from a named carrier, in a currency | `src/engine/simulation/stages/freight-clearing.ts:carrierRevenueLocal` | ⚠️ |
| **A3 it has a duration, so goods are in transit, owned by somebody** | `src/engine/simulation/stages/goods-arrival.ts:InTransitShipment` | ✅ |
| A3.a in-transit inventory is a real asset and a real use of working capital | `src/engine/simulation/stages/sourcing-intent.ts:pipelineCarryCostRatePerWeek` | ✅ |
| A4 the price is per unit per route, and routes are distinct | `src/domain/carrier.ts:laneKey` | ✅ |
| B1 a carrier owns capital: ships, trucks, warehouses | `src/domain/carrier.ts:FreightAsset` | ✅ |
| B2 capacity is fixed in the short run, slow and dear to add | `src/domain/carrier.ts:weeklyCapacityTonnes` | ✅ |
| B2.a so the freight price is extremely inelastic short-run | `src/engine/simulation/stages/freight-clearing.ts:laneCapacityTonnes` | ✅ |
| B3 it has an operating cost: fuel, labour, the capital charge | `src/domain/carrier.ts:marginalCostPerTonneNmLocal` | ✅ |
| B4 capacity can be lost or blocked | — | ❌ |
| C1 demand is derived from somebody trading goods | `src/engine/simulation/stages/sourcing-intent.ts:computeSourcingIntent` | ✅ |
| C1.a so it moves with trade volumes | `src/engine/simulation/stages/sourcing-intent.ts:LaneBooking` | ✅ |
| C2 a shipper can not ship, and that caps the freight price | `src/engine/simulation/stages/sourcing-intent.ts:alternativeLanded` | ✅ |
| C3 VERIFY freight demand equals the volume actually moving | `src/engine/simulation/stages/freight-clearing.ts:shippedShareByLaneSubUnit` | ⚠️ |
| D1 it clears, per route | `src/engine/simulation/stages/freight-clearing.ts:runFreightClearing` | ✅ |
| D2 the freight cost is part of the delivered price | `src/engine/simulation/stages/sourcing-intent.ts:freightPerUnitLocal` | ✅ |
| **D3 it is the mechanism behind the location basis** | `src/engine/simulation/stages/sourcing-intent.ts:exWorksInBuyerMoney` | ✅ |
| D3.a the arbitrage is somebody actually shipping, with capacity and money | `src/engine/simulation/stages/freight-clearing.ts:laneFillRatio` | ⚠️ |
| D4 the transit time is a real lag between purchase and delivery | `src/engine/simulation/stages/goods-arrival.ts:runGoodsArrivalStage` | ✅ |
| D5 VERIFY the price gap tracks the freight price on the route | — | ❌ |
| **E1 FORBID no instantaneous, costless transport** | `src/domain/goods-physical.ts:deliveryModeOf` | ✅ |
| **E2 FORBID no shipment without capacity** | `src/engine/simulation/stages/freight-clearing.ts:buildCarrierOffers` | ❌ |
| **E3 FORBID no goods in transit owned by nobody** | `src/engine/simulation/stages/goods-arrival.ts:carrierId` | ✅ |

---

## 3. THE DIFF

This system is the best-mapped of the six real-economy trees, and the headline is a genuine one:
**E1 holds and D3 is real.** What follows is one serious defect, one absence, and two
measurements. There is no "freight does not exist" finding here; there was never a version of this
subsystem that teleported goods after XB3a.

### ❌ E2 — THE FREIGHT MARKET RATIONS NOTHING. ITS FILL RATIOS ARE READ BY NOBODY

The auction clears a rate against real capacity, and then the quantity constraint is thrown away.

`runFreightClearing` computes, per lane, `laneFillRatio[key] = clearedQuantity / booked` and, per
lane and good, a `shippedShareByLaneSubUnit` entry keyed `lane|subUnit` holding `shipped / tonnes`
— the field's own comment says *"so the goods auction sources only what can arrive."* It does not:

```
$ grep -rn "shippedShareByLaneSubUnit\|laneFillRatio" src --include=*.ts | grep -v freight-clearing.ts
(no output)
```

**Both are written and never read.** What the goods auction *does* read is
`carrierShareByLane` (`05-unit-bidding.ts:1934`) — who carries and who gets paid — and then it
ships **everything the sourcing intent wanted**, splitting each lot across the lane's carriers by
share. Whatever no named fleet covers is consigned to the origin region's transport pool
(`:2027`, `{ kind: 'SEGMENT', region: origin, industry: 'AutomotiveTransport' }`), which has **no
capacity at all** and absorbs any tonnage.

So the fleet sets the *price* of distance and never the *quantity* that crosses it. B4's
disruption (which does not exist anyway), B2's fixed capacity and D3.a's "when B2 or B4 bites, the
basis widens and stays wide" all lose their teeth at the same point: a shortage of ships makes
freight dearer and never makes a cargo late or absent. The transport pool is a sensible bridge for
a lane no fleet serves — but it is currently the *release valve on every lane*, which is not what
it was built for.

**§3 step 37-SMALL**, . Small and well-defined: `shippedShareByLaneSubUnit` already exists and is
already keyed the way the goods settlement iterates, so this is applying a number the market
already computed, plus a decision about what the transport pool's own capacity is.

### ❌ B4 — NOTHING EVER BLOCKS A ROUTE

A carrier's capacity is `weeklyCapacityTonnes(asset, distance)` — hull capacity over the round
trip — and it changes only when the fleet does. There is no closure, no congestion, no seizure, no
weather on a lane: `region.weather` exists and destroys a *commodity yield*
(`evolution.ts:1417`), never a lane's capacity. Given E2 above, adding B4 today would do nothing
anyway — a blocked route would raise the rate and the goods would still arrive — which is why the
two belong in one step, in that order.

**§3 step 37-SMALL**, and it is the cheapest way to make B2.a's violence observable: the
mechanism ("a real reduction in units moved, not a price shock") is exactly what E2's fix installs.

### ⚠️ A2 / C3 — THE CARRIER IS NAMED; THE SHIPPER IS THE CARGO

`AuctionBid.key` on the freight book is the **sub-unit id**, not the shipper
(`freight-clearing.ts:227`), because the sourcing intent aggregates every buyer in a region into
one `LaneBooking` per (lane, good). So a lane's demand curve is several *cargoes* with their own
reservations, not several *shippers*. The reservation itself is right and is the best thing in
this tree — `maxRatePerTonneLaneMoney = (alternativeLanded − exWorks) / massTonnes`
(`sourcing-intent.ts:224`), what this origin **saves the buyer over its next-best source still
holding stock** — which is exactly C2, and it is what keeps the cleared rate a price rather than
the bound §7.21 and §7.75 both record.

The cash leg, by contrast, *is* fully named: `05-unit-bidding.ts:1985` pays
`buyer → carrier` by party id, per lot, at the buyer's own freight share, so a carrier's revenue
is what its customers actually paid it. A2 is therefore ⚠️ only in the book, not in the money.

C3's VERIFY has the same shape: `shippedShareByLaneSubUnit` **is** the read the node asks for and
nothing consumes it — it becomes a real measurement the moment E2's step lands.

### ✅ E1 / D3 — THE FORBID HOLDS, AND THE LOCATION BASIS IS A MECHANISM

Recorded in full because a costless-transport model is the default and this is not one.

- Distance costs **money**: `marginalCostPerTonneNmLocal` is fuel at the **refined-products market's
  own cleared price** per tonne (`fuelPriceUsdPerTonne`), plus crew at the region's **real
  SKILLED_TRADES going wage**, plus the carrier's own weekly capital charge on net PP&E spread over
  the tonne-miles that capital delivers. Every term is a measurement, and the asymmetry between the
  two technologies (a truck burns ~17× the fuel and carries ~3,000× the crew per tonne-nm) is
  arithmetic from real equipment specs rather than a coefficient.
- Distance costs **time**: `laneTransitWeeks` sets an arrival week, the consignment sits on the
  carrier's book until it lands (`goods-arrival.ts`), and the buyer is charged the **carry** on
  that pipeline at its own region's policy rate (`pipelineCarryCostRatePerWeek`). That is A3.a, and
  it is why dual sourcing is rational here without a preference saying so.
- The **basis** is then a real merit order: `computeSourcingIntent` ranks every (buyer, origin)
  pair by `exWorksInBuyerMoney + freightInBuyerMoney + pipelineCost` over the whole world, allocates
  cheapest-delivered-first against each origin's real remaining supply, and the goods themselves
  clear **ex-works per region** — so the gap between two regions' prices is bounded by what it
  costs to move a tonne between them, which is D3 stated as code.

The one honest exemption is `deliveryModeOf`: `DIGITAL` and `IN_PLACE` goods pay no freight and
have no transit. That is physics, not an exemption from E1 — a building cannot be shipped and
software has no mass — and `goods-physical.ts` states the missing consequence (a foreign firm
serving an `IN_PLACE` market would have to build there, which is direct investment and a named
gap).

### ❌ D5 — ONE VERIFY NODE NOBODY READS

Nothing compares a good's price gap between two regions against that lane's cleared freight rate.
Both numbers exist per week — `categoryDemand[sub].exWorksUnitPriceLocal` per region and
`freightRatePerTonneLaneMoneyByLane[lane]` — so this is a division and a print.
**A measurement, for §3 step 38**, and it is the read that would show whether E2's missing
rationing is biting once it exists.
