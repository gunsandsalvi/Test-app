# SYSTEM: COMMODITY FUTURES

Standardised contracts to buy or sell a commodity at a future date. The place where producers,
consumers and investors meet without the physical asset moving — and the place where the physical
market's expectations become a price everyone can see.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`; the physical leg is
`commodities-spot.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **stated grade at a stated delivery location**
    (`commodities-spot.md` A1.a)
  - A1.b **D4 payoff** — delivery of the commodity, or cash settlement against the spot price at
    expiry
  - A1.c **D7 price** — the **futures price**, cleared
  - A1.d **D2 notional** — a fixed quantity per contract, so size is in **contracts**, not money
- **A2** REASON — it is **standardised**, which is what makes it fungible and exchange-traded, and
  standardisation means the delivery terms are part of the instrument
- **A3** REASON — it has an **expiry**, and a **series of them** — so there is a **curve**
- **A4** REASON — it is **margined daily** (`the-derivative-layer.md` D2), so a price move is cash
  today, not at expiry

### B. WHY EACH SIDE IS THERE
- **B1** REASON — a **producer hedging** output it will have (`commodities-spot.md` B1): it locks a
  price it can plan against
- **B2** REASON — a **consumer hedging** input it will need (`firm-fundamentals.md`)
- **B3** REASON — an **investor** taking a view, or wanting commodity exposure without storage
  - B3.a it must **roll** as contracts expire, and the roll has a cost or a gain determined by the
    curve — which is most of an investor's return and is not a fee
- **B4** REASON — an **arbitrageur** between the future and the physical, who can only act if it
  can actually store and finance (`commodities-spot.md` D3)
- **B5** REASON — a **dealer** (`dealer-desks.md`)

### C. THE CURVE
- **C1** REASON — the relationship between futures prices and spot is a **consequence** of
  storage cost, financing cost and scarcity (`commodities-spot.md` D4)
  - C1.a **contango**: forward above spot, bounded above by what it costs to buy, store and
    finance — because past that, B4 arbitrages it
  - C1.b **backwardation**: forward below spot, unbounded below, because you cannot store a
    shortage. That asymmetry is real and it is why the two states are not symmetric
- **C2** REASON — the curve therefore **carries information about physical tightness**, and
  inventory (`commodities-spot.md` D2.a) is the state variable it reads
- **C3** VERIFY — inventories low ⇒ backwardation, as a consequence of C1.b and never as a rule
- **C4** REASON — the **futures price converges to spot at expiry**, because delivery is possible
  - C4.a and convergence is a consequence of deliverability, not an enforced boundary condition

### D. EXPIRY AND DELIVERY
- **D1** REASON — at expiry the contract **delivers or cash-settles**, and both are real
- **D2** REASON — **physical delivery must be possible** for at least some participants, or the
  convergence in C4.a has no mechanism behind it
- **D3** REASON — a party that cannot take delivery must **close or roll before expiry**, which is
  a real forced trade at a known time
- **D4** REASON — cash settlement is against an **observed spot price**
  (`commodities-spot.md` D1), which must therefore exist and be cleared
  (`../instruments/derivative.md` D3.a)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no futures price without a physical market underneath it.** A futures curve on
  a commodity that is never actually traded prices itself
- **E2** FORBID — **no unlimited open interest against finite deliverable supply** without the
  squeeze that implies (`securities-lending.md` D2)
- **E3** FORBID — **no roll that is free.** The roll's cost is the curve, and it must land in the
  roller's P&L

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 satisfies `../instruments/derivative.md` | `src/domain/derivatives/classes/commodity-future.ts:COMMODITY_FUTURE_PROFILE` | ⚠️ |
| A1.a D3 underlying — a stated grade at a stated delivery location | `src/engine/bootstrap/commodities-and-fx.ts:GENERATED_COMMODITIES` | ⚠️ |
| A1.b D4 payoff — delivery, or cash settlement against spot at expiry | `src/domain/derivatives/classes/commodity-future.ts:markToMarketUSDToA` | ⚠️ |
| A1.c D7 price — the futures price, cleared | `src/engine/simulation/stages/derivative-markets/commodity-future.ts:runCommodityFuturesMarket` | ✅ |
| A1.d D2 notional — a fixed quantity per contract; size is in contracts | `src/domain/derivatives/contract.ts:standingCoverUnits` | ⚠️ |
| A2 standardised, and the delivery terms are part of the instrument | `src/domain/derivatives/classes/commodity-future.ts:futuresTermKey` | ⚠️ |
| A3 an expiry, and a series of them — so a curve | `src/domain/derivatives/classes/commodity-future.ts:FUTURES_TENOR_MONTHS` | ⚠️ |
| A4 margined daily, so a price move is cash today | `src/engine/simulation/stages/derivative-lifecycle.ts:settleMark` | ✅ |
| B1 a producer hedging output it will have | `src/engine/simulation/stages/corporate-financing.ts:exposureToHedgeLocal` | ✅ |
| B2 a consumer hedging input it will need | `src/domain/instruments.ts:COMMODITY_CATEGORY_LINKAGE` | ✅ |
| B3 an investor taking a view, or wanting exposure without storage | `src/domain/institution-profiles.ts:tradesCommodityFutures` | ✅ |
| B3.a it must roll, and the roll's cost is set by the curve | — | ❌ |
| B4 an arbitrageur who can actually store and finance | `src/domain/derivatives/classes/commodity-future.ts:costOfCarryPrice` | ⚠️ |
| B5 a dealer | `src/domain/derivatives/registry.ts:deskNotionalCapacityLocal` | ⚠️ |
| C1 the futures/spot relation is a consequence of storage, financing, scarcity | `src/domain/derivatives/classes/commodity-future.ts:PHYSICAL_STORAGE_COST_ANNUAL` | ✅ |
| C1.a contango bounded above by cost of carry, because B4 arbitrages it | `src/domain/instrument-keys.ts:commodityFutureInstrumentId` | ⚠️ |
| C1.b backwardation unbounded below — the asymmetry is real | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| **C2 the curve carries physical tightness; inventory is the state variable** | `src/engine/macro/evolution.ts:evolveCommodity` | ❌ |
| C3 VERIFY inventories low ⇒ backwardation | — | ❌ |
| **C4 the futures price converges to spot at expiry, because delivery is possible** | `src/domain/derivatives/classes/commodity-future.ts:markReasonFinal` | ⚠️ |
| **C4.a convergence is a consequence of deliverability, not an enforced boundary** | `src/domain/derivatives/classes/commodity-future.ts:markToMarketUSDToA` | ❌ |
| D1 at expiry it delivers or cash-settles, and both are real | `src/domain/derivatives/classes/commodity-future.ts:eventTermination` | ⚠️ |
| **D2 physical delivery must be possible for at least some participants** | — | ❌ |
| D3 a party that cannot take delivery must close or roll before expiry | — | ❌ |
| D4 cash settlement is against an observed spot price, which must be cleared | `src/engine/simulation/stages/07-commodities.ts:runCommoditiesStage` | ⚠️ |
| E1 FORBID no futures price without a physical market underneath it | `src/engine/audit/prices.ts:x2` | ⚠️ |
| E2 FORBID no unlimited open interest against finite deliverable supply | `src/domain/derivatives/registry.ts:DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM` · `src/domain/clearing-house.ts:memberMarginLimitLocal` | ⚠️ |
| E3 FORBID no roll that is free | — | ❌ |

---

## 3. THE DIFF

### ❌ C4.a / D2 — CONVERGENCE IS AN ENFORCED BOUNDARY, BECAUSE NOTHING CAN BE DELIVERED

The two nodes are one defect and the tree already says why they are one.

`classes/commodity-future.ts:markToMarketUSDToA`:

```ts
const atDelivery = c.maturityWeek <= m.week;
const px = atDelivery ? m.commoditySpot(c.referenceId) : m.commodityPrint(c.referenceId, c.termKey);
```

In the delivery week the mark is **switched** to spot. That is C4.a's forbidden shape verbatim: an
enforced boundary condition, not a consequence. The mechanism the node requires — a deliverable
contract converging because somebody *could* stand for delivery and arbitrage the gap — has
nothing behind it, because **nothing in this model can be delivered**. `periodicLegUSDToB` is
`null`, the profile's only leg is the mark, no commodity units ever move between the two parties,
and no participant's inventory changes when a future expires. D2 (`❌`) is the missing mechanism
and C4.a is its symptom.

**The convergence is also not gradual, because the contract does not age.** A future struck at the
3-month bucket marks against `commodityPrint(commodityId, '3M')` — the **constant-maturity** 3M
print — for its whole life, and then jumps to spot in one week. `commodityFutureInstrumentId`
(§3.13-BOOK slice (a) moved it into the one key grammar) is `FUT-${commodityId}-${tenor}M`, so all
three tenors are perpetual constant-maturity instruments
that clear afresh every week (A3 `⚠️`: there is a curve, but no series of dated expiries). So the
basis of a 3-month contract does not narrow at all over 13 weeks; it is 100% of the move in the
final week.

**Consequence.** The single largest thing a futures market does — force paper and physical to meet
at a date — is absent, and its P&L consequence lands as one discontinuous jump on the last week
of every contract. It also makes E2 (`⚠️`) unenforceable in principle: open interest is bounded by
hedger need, desk capital (`DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM`) and, since §9.17-v-i, every
member's margin limit at the clearing house (`memberMarginLimitLocal`), never by deliverable
supply, and a squeeze — the thing E2 says must follow from finite supply — cannot occur because
supply is not a constraint on the paper at all.

**§3 step 37-COMMODITY**, . Medium-to-large: a deliverable contract needs dated expiries (not constant
maturity), a delivery leg that moves units into the long's inventory, and a decision about who can
take delivery. It pairs naturally with §3 step 17e, which asks for the same shape on government
bonds (*"a deliverable govie future plus the cash-futures basis"*) and says a deliverable future is
what makes a basis trade real.

### ❌ C2 / C3 — THE CURVE READS NOTHING PHYSICAL, AND INVENTORY IS A RANDOM WALK NOBODY READS

C2 says the curve carries information about physical tightness and names the state variable it
reads: inventory. Verified against the code — `commodity.inventoryLevelPct` is written **once**,
at `macro/evolution.ts:1448`:

```ts
const inventoryLevelPct = Math.max(0, Math.min(100,
  Math.round(comm.inventoryLevelPct + (random() - 0.5) * 3 - yieldLossShare * 40)));
```

— an independent bounded random walk — and it is read **nowhere in the engine**: the only other
occurrences in `src` are the seed (`initialization.ts:812`) and the UI. `runCommodityFuturesMarket`
never mentions it. So the futures curve is built from producers' covenant headroom, consumers'
cost of capital and desk balance sheet, and physical tightness is not an input to any of them.

C3 (inventories low ⇒ backwardation) is therefore not merely unmeasured but unmeasurable: one side
of the correlation is a random walk. **A measurement, for §3 step 38** for C3; **§3 step
37-COMMODITY** for C2, which needs inventory to become a real stock — held by named parties, drawn down
when consumption exceeds production — before either the curve or the audit can read it. That is
`commodities-spot.md` D2.a's node, and this tree is the second witness to it.

### ⚠️ D4 / E1 — THE SPOT THE CONTRACT SETTLES AGAINST IS A FORMULA

`07-commodities.ts:runCommoditiesStage` calls `evolveCommodity`, and
`macro/evolution.ts:1432` is `comm.spotPrice * Math.exp(safeDriftExponent)` with a `0.5` floor. So
the price every futures contract cash-settles to in its delivery week is a drift-plus-noise walk,
not a cleared print — and E1's FORBID (*"no futures price without a physical market underneath
it"*) is breached one level down: the futures curve **is** cleared, honestly, against real
schedules; the thing it is cleared *relative to* is not.

`audit/prices.ts:x2` measures the consequence (*"futures within carry of spot"*, failing 2 weeks
of 16 per step 17f's list), so the discrepancy is at least visible.

**Already §3 step 22** — *"Commodity spot clears. `evolution.ts:1424` moves spot by
`exp(drift + …)` with a floor."* Recorded here because this tree is where the cost is paid: with
spot uncleared, `impliedConvenienceYield` infers a convenience yield from one cleared price and one
formula price, and D4's *"which must therefore exist and be cleared"* is exactly what step 22 owes
this system.

### ❌ B3.a / D3 / E3 — THERE IS NO ROLL

Three nodes, one absence. When a futures contract reaches maturity `settleDerivativeClass` settles
the final mark and **drops it** — no participant re-enters, and no market stage looks for an
expiring position to replace. `runCommodityFuturesMarket` sizes demand as
`hedgeLocal/spot − standingCoverUnits(...)`, so a hedger whose contract just expired simply appears
with a gap again next week and strikes a new one at whatever the new print is.

That is not nothing — it is a de facto roll — but it is not the node's roll, and the difference is
where the money is:

- **B3.a** — the investor's roll return, *"most of an investor's return and not a fee"*, is never
  computed. A macro fund's P&L on a rolled position is the sum of independent weekly marks, and the
  contango or backwardation it rolled through leaves no trace;
- **D3** — nobody is ever *forced* to trade at a known time. A party that cannot take delivery
  never has to close, because nobody can take delivery (D2). The predictable, dated, forced flow
  that a real roll period generates — and that other participants trade against — does not exist;
- **E3** — with no roll there is no roll cost, so the FORBID is satisfied vacuously and would be
  breached the moment a roll was added carelessly.

**§3 step 37-COMMODITY**, and it is the same step as C4.a/D2: dated expiries are the prerequisite for
all three.

### ⚠️ B4 / C1.a — THE CARRY BOUND IS A PARTICIPANT'S PRICE, AND THE PARTICIPANT CANNOT STORE

Worth stating as a good result first. C1.a asks that contango be bounded above *by what it costs to
buy, store and finance, because past that B4 arbitrages it* — and the code does it the right way
round (rule 6): `runCommodityFuturesMarket:117-131` brings bank desks into the auction **as
sellers, only while `priorPrint > carryBound`**, sized by their remaining derivative budget, and
the macro funds' reservation is `carryBound` itself. The top of the curve is a participant's
schedule, not a bracket. `costOfCarryPrice` and `PHYSICAL_STORAGE_COST_ANNUAL` (a physical property
of the substance, rule 2) make C1 `✅`.

**What diverges is that the arbitrageur never buys the physical.** The desk sells the future and
that is all: it takes no commodity into inventory, pays no storage, finances nothing, and its
position is charged only the 10% CEM add-on. So the trade that is supposed to *enforce* the bound
is a naked short at the bound's level, and B4's own condition — *"who can only act if it can
actually store and finance"* — is not tested. If the print stays above carry, the desks add short
after short with no physical accumulating anywhere.

**§3 step 37-COMMODITY**, small once D2 exists: the arb leg should buy spot, hold units, pay storage,
and deliver into the short. Until then C1.a is `⚠️`: the right shape with the wrong balance sheet
behind it.

### ⚠️ A1.a / A2 — NO GRADE, NO LOCATION, NO CONTRACT SIZE

`bootstrap/commodities-and-fx.ts:GENERATED_COMMODITIES` gives each commodity an id, a category, a
unit, an extraction cost, a units-per-tonne and a volatility. There is **no grade and no delivery
location**, which A1.a requires and which `commodities-spot.md` A1.a defines; `HEAVY_CRUDE_OIL` is
a separate commodity rather than a grade of one. A2's *"the delivery terms are part of the
instrument"* has nothing to point at either — `futuresTermKey` is `'1M'|'3M'|'6M'` and carries no
delivery terms at all.

A1.d is the same family: size is `units`, a `Number(size.toFixed(4))` float
(`derivative-markets/commodity-future.ts:246`), not a count of standardised contracts. The node's
point — *"size is in contracts, not money"* — is half met (the class is genuinely unit-quoted and
`standingCoverUnits` nets in physical units, which is right) and half missing (there is no contract
size, so 0.0173 contracts is representable).

All three are small and all three are prerequisites for delivery. **§3 step 37-COMMODITY**, folded
into C4.a/D2's.

### ⚠️ B5 — THE DEALER IS AN ARBITRAGEUR OR NOTHING

B5 says a dealer is there. The only bank participation in this book is the carry arbitrage above,
which appears **only when `priorPrint > carryBound`** and only on the sell side; `dealerSpreadBps:
0` is passed to the clearing engine (`:203`) and no desk posts a two-way schedule. So in a
backwardated week there is no dealer in the commodity futures market at all, and the book clears
producer-against-consumer directly. Same family as the missing dealer in `cds.md` B4 and
`interest-rate-swaps.md` B5 — three trees, one absence — and it belongs with them.

### Also marked, briefly

- **A1 ⚠️** — the profile satisfies the contract except D5 (one currency) and delivery — C4.a/D2 above.
- **A1.b ⚠️** — cash settlement is against a formula spot — D4/E1.
- **C4 ⚠️ / D1 ⚠️** — the mark is switched to spot in the delivery week and the contract is dropped; nothing is delivered — C4.a/D2.
