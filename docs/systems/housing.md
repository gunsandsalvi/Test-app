# SYSTEM: HOUSING

The largest asset most households own and the largest debt most households owe. It belongs in this
world because it is the collateral behind the biggest lending book in any banking system
(`banks-lending.md`), because its price is a wealth effect on consumption (`households.md` C1.b),
and because it is the one asset whose supply genuinely cannot respond within the horizon that
matters.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A HOUSE IS
- **A1** REASON — a **durable, immovable, indivisible asset** owned by a named party
  (`the-register.md`), in a named location
  - A1.a **location is part of the identity**, and it is why there is no single housing market
- **A2** REASON — it **yields a service**: shelter, consumed by whoever lives in it — so it is a
  consumption good and an asset at once, and both must be present
- **A3** REASON — the owner and the occupier **can be different parties**, and then there is
  **rent**, which is a real payment between them
- **A4** REASON — the **stock is finite and changes slowly**: new building takes years
  (`the-capital-programme.md` C3)
- **A5** REASON — it **depreciates and needs maintenance**, which is a real cost to the owner

### B. THE PRICE
- **B1** REASON — it **clears** between buyers and sellers (`the-clearing-engine.md`), per location
- **B2** REASON — the buyer's demand is governed by **what it can borrow**, not only what it wants
  - B2.a so the **mortgage rate and the lending standard are the dominant inputs to the price**,
    and a change in either moves it — this is the strongest single transmission channel from
    policy to a household balance sheet
- **B3** REASON — supply is **inelastic in the short run** (A4), so a demand shift moves price,
  not quantity
- **B4** REASON — a seller can **refuse to sell**, and in a falling market transaction volumes
  collapse before prices do
  - B4.a VERIFY — so a price index built only from transactions is measuring a changing sample,
    and that is a real property of housing data, not an error to correct away
- **B5** REASON — the **rent and the price are linked but not equal**: the yield is a read of the
  two, and it competes with other yields (`households.md` D5)

### C. THE MORTGAGE
- **C1** REASON — a **loan from a named lender secured on the house** (`banks-lending.md` C)
- **C2** REASON — it has a **term, a rate — fixed or floating — and an amortisation schedule**
  (`../instruments/bond.md` N5, N6), and the borrower pays interest **and** principal
  (`households.md` E3.a)
- **C3** REASON — the **loan-to-value** is a read of the loan against the house's current price,
  and it moves when the price moves without anyone doing anything
- **C4** REASON — the borrower can **default**, and then the lender takes the house and sells it
  - C4.a the **recovery is what it fetches**, which depends on B1 in a market where other
    foreclosed houses are also for sale — so losses are correlated exactly when they are largest
- **C5** REASON — the lender's **standard is a decision**: how much LTV, what income multiple, and
  it tightens when it is worried (`banks-lending.md` C)
  - C5.a which feeds straight back into B2.a, and that loop is the housing cycle
- **C6** REASON — mortgages can be **pooled and sold** (`sme-pools.md` is the same structure for a
  different asset), which moves the risk to a named holder

### D. WHAT IT FEEDS
- **D1** REASON — house price changes are **household wealth changes**
  (`households.md` D4), and wealth affects consumption
- **D2** REASON — housing construction is **investment and employment**
  (`the-capital-programme.md`, `labour.md`)
- **D3** REASON — rent is a **large component of the consumer price level** (`indices.md` D4)
- **D4** REASON — mortgage debt is the **largest household liability** and its service is a fixed
  claim on income (`households.md` E3)
- **D5** VERIFY — a rate rise should reach consumption through D4 on floating mortgages and
  through B2.a and D1 on prices, with different lags, and the two channels are distinguishable

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no house without an owner and no owner without a house they hold** in the
  register
- **E2** FORBID — **no exogenous house price path.** It is cleared (B1), and a written path deletes
  C3, C4.a and C5.a — the entire collateral channel
- **E3** FORBID — **no mortgage without a lender's balance sheet on the other side**
- **E4** VERIFY — Σ mortgage debt owed by households = Σ mortgage assets held by lenders and pools,
  exactly

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| **A1 a durable, immovable asset owned by a named party** | — | ❌ |
| A1.a location is part of the identity | `src/domain/region-macro.ts:HousingMarket` | ⚠️ |
| A2 it yields a service, consumed by whoever lives in it | `src/domain/industry-registry.ts:housing_rental_services` | ⚠️ |
| A3 owner and occupier can differ, and then there is rent | `src/engine/macro/initialization.ts:HOME_OWNERSHIP_RATE` | ⚠️ |
| **A4 the stock is finite and changes slowly** | `src/engine/macro/evolution.ts:owningHouseholdsCount` | ❌ |
| A5 it depreciates and needs maintenance | — | ❌ |
| B1 it clears between buyers and sellers, per location | `src/engine/macro/evolution.ts:marginalPriceLocal` | ⚠️ |
| B2 demand is governed by what the buyer can borrow | `src/engine/macro/evolution.ts:affordabilityByTier` | ✅ |
| B2.a the mortgage rate and the lending standard dominate | `src/engine/macro/evolution.ts:annuityFactorForPricing` | ✅ |
| B3 supply is inelastic in the short run | `src/engine/macro/evolution.ts:supplyUnitsThisWeek` | ✅ |
| B4 a seller can refuse; volumes collapse before prices | `src/domain/banking.ts:housingTurnoverAnnual` | ⚠️ |
| B4.a VERIFY a transaction index measures a changing sample | — | ❌ |
| **B5 rent and price are linked; the yield is a read** | — | ❌ |
| C1 a loan from a named lender secured on the house | `src/domain/banking.ts:MortgageVintage` | ⚠️ |
| C2 term, rate, amortisation; interest AND principal | `src/domain/banking.ts:annuityWeeklyPrincipalLocal` | ✅ |
| **C3 LTV is a read that moves when the price moves** | `src/domain/banking.ts:vintageCurrentLtv` | ✅ |
| C4 the borrower defaults; the lender takes and sells the house | `src/engine/simulation/stages/bank-lending.ts:vLossLocal` | ⚠️ |
| C4.a the recovery is what it fetches, and losses correlate | `src/domain/banking.ts:mortgageSeverityAtLtv` | ⚠️ |
| **C5 the lender's standard is a DECISION, and it tightens** | `src/domain/banking.ts:MORTGAGE_DSTI_LIMIT` | ❌ |
| C5.a which feeds back into B2.a — the housing cycle | `src/engine/simulation/stages/bank-lending.ts:affordabilityGate` | ⚠️ |
| C6 mortgages can be pooled and sold to a named holder | — | ❌ |
| D1 house price changes are household wealth changes | `src/engine/simulation/stages/household-balance-sheet.ts:housingStockLocal` | ✅ |
| D2 housing construction is investment and employment | `src/domain/industry-registry.ts:residential_construction` | ✅ |
| D3 rent is a large component of the consumer price level | `src/engine/simulation/stages/price-index.ts:buildCpiBasket` | ✅ |
| D4 mortgage debt is the largest household liability | `src/engine/simulation/stages/bank-lending.ts:mortgageDebtLocal` | ✅ |
| D5 VERIFY the rate reaches consumption by two distinguishable channels | — | ❌ |
| **E1 FORBID no house without an owner in the register** | `src/engine/ledger/wire.ts:HOUSE` | ❌ |
| **E2 FORBID no exogenous house price path** | `src/engine/macro/evolution.ts:newMedianHomePriceLocal` | ✅ |
| E3 FORBID no mortgage without a lender's balance sheet | `src/engine/simulation/stages/bank-lending.ts:HouseholdLoanPool` | ✅ |
| E4 VERIFY Σ owed = Σ held, exactly | `src/engine/simulation/stages/02b-bank-diversification.ts:mortgageDebtLocal` | ✅ |

---

## 3. THE DIFF

### ❌ A1 / A4 / E1 — SAY IT PLAINLY: THERE ARE NO HOUSES

The tree's biggest finding, and it is not "housing is thin" — it is that **no dwelling exists as
an object anywhere in this model.** The entire housing stock is one arithmetic expression,
computed identically in two places (`household-balance-sheet.ts:147-150` and
`bank-lending.ts:501`):

```
owningHouseholds = (totalPopulation / AVERAGE_HOUSEHOLD_SIZE) * housingMarket.ownershipRatePct;
housingStockUSD  = owningHouseholds * housingMarket.medianHomePriceUSD;
```

Three consequences, each of which is a node above:

- **A1 / E1.** There is no house, so there is no owner. The wire ledger's asset-kind union
  actually **declares** `'HOUSE'` (`ledger/wire.ts:18,22`) and no wire of that kind is ever
  written — `grep -w HOUSE src` finds the two declarations and nothing else. A dwelling never
  changes hands; ownership is `ownershipRatePct`, a number.
- **A4.** The "stock" is a function of **population and a constant**. `HOME_OWNERSHIP_RATE = 0.62`
  is written once at initialization (`macro/initialization.ts:118`) and never written again — the
  only other reads spread `prevHousing`. So the number of dwellings moves only when the population
  does. Residential construction's real cleared output (`resSupplyUnits`) enters the *price walk's*
  supply term and **is never added to the stock**: the houses built this week do not exist next
  week. That is A4 inverted — the stock cannot change at all, while the tree asks that it change
  slowly.
- **A5.** Nothing depreciates and nobody maintains anything.

**Already §3 step 26b** ("Housing clears… dwellings have no owners and no price anyone struck…
houses get their wires"), and it is **also §3 step 13's item 1** — housing is one of the two
classes in that step's survey with *no units at all*. This mapping is a second witness to both and
adds the two facts they do not carry: the `HOUSE` wire kind already exists and is dead, and
construction output is disconnected from the stock.

### ❌ C5 — THE LENDING STANDARD IS TWO CONSTANTS, AND IT NEVER TIGHTENS

The one node in section C that fails outright, and it is the one that closes the cycle.

`MORTGAGE_DSTI_LIMIT = 0.35` and `MORTGAGE_LTV_AT_ORIGINATION = 0.80` (`domain/banking.ts:337,443`)
are module constants read at `bank-lending.ts:639,744,747,751` and at `evolution.ts:992`. **No
code path writes either.** A bank in a housing crash lends at the same 80% LTV against the same
35% DSTI as a bank in a boom.

What *does* respond is the **price** of the loan: each bank quotes its own margin off its own
vintages' measured loss (`bank-lending.ts:623-631`), and its capital gates the volume
(`headroomUSD`). Both are real. But the tree distinguishes them deliberately — C5 is about the
*terms* a lender will write, and "it tightens when it is worried" is what makes C5.a's loop
(standard → price → collateral → standard) a cycle rather than a rate channel. Today the loop runs
through the rate only, so the amplification housing is in this world for is roughly halved.

**Becomes a §3 step**, small: the bank already measures everything a standard should respond to —
`mortgageSeverity` off its own LTV cross-section, `bankHurdle`, `headroomUSD` — so the two
constants become reads of the same measurements the quote already uses.

### ✅ E2 — THE FORBID HOLDS, AND THE MECHANISM UNDER IT IS GOOD

Worth recording as clearly as the failures, because a walked house-price index is the single most
common shortcut in a model like this and it is **not** what is here. `evolution.ts:986-1013`:
rank the four wealth tiers by what each can pay
(`affordableLoanUSD / MORTGAGE_LTV_AT_ORIGINATION`, where `affordableLoanUSD` is
`DSTI × weekly income / annuityFactor` at the **keenest bank quote in the region**), walk down the
ranking absorbing the week's supply (turnover plus completed construction), and the price is what
the last buyer needed to bid — floored at the construction sector's own cleared build cost. No
speed constant, no clamp, no baseline multiplier: the file records that it replaced exactly that.
B2, B2.a and B3 are ✅ on the strength of this one walk, and C3 is ✅ because every vintage
remembers `originationHomePriceUSD` so `vintageCurrentLtv` genuinely moves when the price does.

It is ⚠️ at B1 for one reason only: it is an affordability **walk**, not a book. No named buyer
and no named seller transact, and `A1.a`'s location is the region, so there is one price per
region and no sub-market. That is the same finding as A1 and it closes with step 26b.

### ⚠️ C4 / C4.a — DEFAULT IS A LOSS RATE, NOT A FORECLOSURE

The vintage machinery is genuinely good: losses fall on each cohort at **its own** severity
(`mortgageSeverityAtLtv(vintageCurrentLtv(v, medianHomePriceUSD))`) and its own frequency burden
(`vBurden`, the vintage's coupon against today's market rate), which is `E[f(LTV)]` rather than
`f(E[LTV])` and is what makes a mortgage credit event possible at all.

What does not happen is the second half of C4. `vLossUSD` reduces the vintage's principal and the
bank's P&L, and that is the end of it: **no house is repossessed, nothing is sold, and no
foreclosed supply reaches the market.** So C4.a's "losses are correlated exactly when they are
largest" is only half true — severities correlate because they share one median price, but the
extra supply that a wave of foreclosures puts on the market, which is what makes that price fall
further, does not exist. The negative feedback loop is open.

**Becomes a §3 step**, and it should be taken after 26b: a foreclosure needs a house to seize.

### ❌ C6 / B5 / B4.a / D5 — FOUR THINGS ABSENT

- **C6 pooling.** `grep -i 'rmbs\|securitiz' src` finds nothing. Mortgages sit on the originating
  bank's book for life. `sme-pools.md`'s structure exists for a different asset and is not pointed
  at this one — so the tree's "which moves the risk to a named holder" has no path. **Becomes a
  §3 step** (medium, and it is a strict addition rather than a repair).
- **B5 the yield.** Rent (`housing_rental_services`) and the house price
  (`medianHomePriceUSD`) both exist and clear, in two different subsystems, and **nothing ever
  divides one by the other**. So the rental yield does not exist, it competes with no other yield,
  and `households.md` D5 has nothing to substitute against. This is the cheapest missing link in
  the tree: two cleared numbers, one division. **A measurement, for §3 step 38** — it becomes a
  mechanism only once a dwelling can be bought as an investment, which is 26b.
- **B4.a / D5.** Two VERIFY nodes with no reader. **A measurement, for §3 step 38.**

### ⚠️ A2 / A3 — THE SHELTER SERVICE IS REAL; THE TENURE SPLIT IS FROZEN

A2 and A3 are better than A1 would suggest. `housing_rental_services` is a full sub-unit
(`industry-registry.ts:761`): households buy it in the goods auction at 90% household buyer mix,
it has a recipe (repair, electricity, professional services), it is `IN_PLACE` so no foreign
supplier can serve it, and it lands in the CPI basket — so D3 is genuinely ✅ and rent is a real
payment to real landlord firms.

What is missing is the join to A1. The landlord is a *firm producing a service*, not the owner of
a dwelling somebody lives in, and the owner/renter split is `ownershipRatePct`, frozen at 0.62
forever. So a household can never buy the house it rents, tenure never changes, and rent and
ownership are two unconnected markets over the same absent asset. Closes with 26b.
