# The "1$ is 1$" Project

## Goal, in the user's own words

> I want to see that a company takes X piece of commodity at Y price from Z producer, does
> something to it, and you get out N output that sits in inventory (together with excess X)
> until P buys it at L price. This needs to happen on an aggregate level for the hidden
> non-publicly-traded sector as well.

Every dollar a company (or the aggregate private/non-public sector) spends or earns must be
traceable to a real, named counterparty — another company, the private sector, government, or
households. No dollar should originate from or vanish into an abstract statistical pool.

## Critical finding: this partially already exists, and it's not reconciled

Before building anything new, an audit of the current pipeline found that a real, literal
buy/sell engine **already exists** — `stages/05-unit-bidding.ts` — and it's more complete than
the rest of the codebase's demand machinery would suggest:

- Every industry sub-unit, every region, every week: real suppliers (named companies producing
  that sub-unit) post unit **offers** (quantity + minimum price, derived from their own cost
  structure and credit risk). Real buyers — named corporate customers, a government aggregate,
  a household aggregate — post unit **bids** (quantity + maximum price).
- Bids and offers clear in a real double-auction (sorted, matched by price, transacted quantity
  capped by both sides). The result is a **named transaction**: `openSales[supplierTicker]` /
  `openPurchases[buyerTicker]`, with real cash moving (`cashChange`) and real inventory units
  drawn down (`finishedGoodsUnits`).
- Long-term `SupplyContract`s form probabilistically between matched named companies
  (`supplierCompanyId`, `customerCompanyId`) and execute every week thereafter with a real
  quantity, a real price, and real named-counterparty distress propagation (a supplier's default
  directly constrains its named customers, not an anonymous pool).

**This is the "1$ is 1$" engine.** It is not fully wired up, though — three other mechanisms sit
alongside it, computing overlapping or conflicting signals for the same categories:

1. **`03-category-demand.ts`** computes an abstract `categoryDemand.demandLevelUSD` /
   `demandGrowthAnnual` target per sub-unit from aggregate C+I+G+NX shares, which
   `08-company-fundamentals.ts` uses as the primary driver of a producer's own revenue growth
   (`categoryDrivenGrowth`) — **independent of** what stage 05 actually cleared for that company
   this week.
2. **`04-input-output.ts`** clears an aggregate demander-industry vs. supplier-sub-unit input
   market (via `CATEGORY_INPUT_REQUIREMENTS`), producing an aggregate `inputCostPressure` /
   `_fulfillmentRatio` signal — a second, differently-computed price/scarcity signal for
   what should be largely the same underlying question stage 05's per-company auction already
   answers.
3. **`08b-capex-settlement.ts`** (added earlier this session) sums real per-company capex into
   5 capital-goods categories and injects it into `categoryDemand.demandLevelUSD` directly,
   bypassing stage 05's real bid engine entirely — even though stage 05 already has a working,
   real capex-bid special-case for `industrial_automation` (`CORPORATE_DEMAND_INTENSITY` covers
   only 7 categories total, and only that one is capex-linked).

Net effect: a producer company's actual revenue today is **not** the sum of what it actually
sold in stage 05's real auction — it's a blend of that plus an independent statistical growth
target from stage 03. The real transaction layer exists but isn't the source of truth.

## What's still missing even within stage 05's real engine

- **No input inventory.** Only finished-goods (output) inventory is tracked
  (`finishedGoodsUnits` / `finishedGoodsInventoryUSD`). There's no concept of a company holding
  unconsumed raw materials/components it already bought — "excess X sits in inventory" has
  nowhere to live.
- **No literal input -> output transformation.** `CATEGORY_INPUT_REQUIREMENTS` expresses a
  dollar-intensity ratio ("how much input cost pressure per dollar of output"), not a literal
  recipe ("N units of X + M units of W -> 1 unit of output"). A company doesn't visibly "consume"
  units it bought.
- **The private/non-public sector never participates** in stage 05's bid/offer market — neither
  as a buyer (it needs inputs too — `PrivateSectorSegment.capexUSD` already exists but goes
  nowhere) nor as a seller (today it only receives a residual demand-share credit from
  `08b-capex-settlement.ts`, itself a mechanism this project will likely retire).
- **`CORPORATE_DEMAND_INTENSITY` is sparse** (7 categories) and mixes flat revenue-based
  intensities with one capex-based special case, rather than a consistent rule for "which
  categories does every company/segment need as inputs or capex, and how much."

## Target architecture

1. **Stage 05's real bid/offer/contract engine becomes the sole source of truth** for a
   producer's revenue and a buyer's cost — not one input among several. `categoryDemand.
   demandLevelUSD`/`demandGrowthAnnual` (stage 03) and `inputCostPressure`/`_fulfillmentRatio`
   (stage 04) get demoted to *signals that shape bidding behavior* (e.g. what price a household
   aggregate is willing to pay, how aggressively a supplier prices its offer) rather than
   independent revenue/cost determinants computed in parallel.
2. **Real input inventory**, symmetric with the existing output inventory: a company holds
   units of each input category it has bought but not yet consumed. Tracked as **lots**, not one
   blended figure — each lot remembers which supplier (a real company, or a private-sector
   segment) it came from and the price paid for that specific lot, consumed oldest-first, so the
   UI can show "holding Y units bought from N at $p1 and Z units bought from L at $p2," not just
   a single average cost.
3. **A literal per-unit production recipe** per sub-unit (units of input -> units of output),
   replacing `CATEGORY_INPUT_REQUIREMENTS`'s dollar-intensity ratio. Production draws down input
   inventory and adds to output inventory; unconsumed input carries over.
4. **The private/non-public sector as a first-class bidder and offerer** in stage 05's auction —
   represented as one aggregate participant per `PrivateSegmentType` per region (not per-firm,
   since it's explicitly an aggregate), buying its own inputs and selling its own output
   alongside every named public company.
5. **`08b-capex-settlement.ts` is retired** once stage 05 generalizes its existing
   `industrial_automation` capex-bid special case to all real capital-goods categories (using
   `CAPEX_SUPPLIER_WEIGHTS` from this session's earlier work) — capex becomes a real bid in the
   real auction, not a parallel abstract injection.
6. **Government and household demand remain aggregates** (modeling millions of individual
   households individually isn't tractable) but continue to route through the same real
   bid/offer clearing stage 05 already has for them, so their dollars land on real named
   suppliers, never an anonymous pool.

## Phase 1 finding: output inventory is already corrupted for multi-line companies

While instrumenting stage 05 to compare its real cleared sales against stage 08's statistical
revenue target, the numbers showed what looked like a growing-amplitude 2-3 week oscillation.
Root cause, confirmed by direct instrumentation (not a cobweb/price-elasticity effect, though
two real related bugs were fixed along the way — see below): **`Company.finishedGoodsInventoryUSD`
/ `finishedGoodsUnits` are single scalar fields, but a company can have multiple product lines**
(e.g. one sampled company produces `semiconductors`, `consumer_devices`, and
`enterprise_software` simultaneously). Stage 05 runs its bidding pass once per sub-unit, and
**each pass overwrites that same shared field for the company** — so whichever sub-unit is
processed last each week (a fixed iteration order) clobbers the other lines' inventory numbers.
A multi-line company's "inventory" is therefore whichever business happened to run last, not a
real figure for any of its actual lines. This has to become a per-sub-unit structure (a
`Record<subUnitId, { units, valueUSD }>`, or equivalent) before stage 05's output can be trusted
as an authoritative revenue source — it directly blocks Phase 1, and is the same shape of
problem Phase 2 already anticipated needing for input inventory, just discovered to already
affect the existing output side too. Elevated to its own prerequisite phase below (Phase 1a).

Two smaller, real bugs were fixed in the same pass and are worth keeping regardless of the above:
- `05-unit-bidding.ts`'s production throttle was a hard on/off switch at one inventory/capacity
  threshold (a bang-bang controller with no hysteresis) — smoothed into a continuous response.
- Suppliers were pricing next week's production off the raw, single-week cleared price (a
  textbook cobweb-cycle setup given how price-elastic production response is) — now react to a
  slow-moving price expectation instead.

## Phase 1 attempt (reverted): stage 05's demand-side coverage is too sparse to be authoritative

After Phase 1a landed, tried the core Phase 1 swap — replacing the statistical
`targetAnnualRevenue` with stage 05's real settled sales (annualized), falling back to the
statistical estimate only when real sales were exactly zero. Verified with a 260-week
diagnostic tracking each company's revenue ratio vs. its starting value: **catastrophic
failure** — 28,323 violations, with dozens of companies collapsing from hundreds of millions in
revenue to literally hundreds of dollars (ratios of 0.00x-0.02x) by week 260. Reverted
immediately (not committed).

Root cause: stage 05's real auction has real corporate-buyer-side bids for only **7 categories**
(`CORPORATE_DEMAND_INTENSITY` in `domain/industry.ts`: industrial_automation, refined_products,
food_beverage, pharmaceuticals, passenger_vehicles, semiconductors, defense_systems). Every
other category that has real corporate demand in reality (e.g. `enterprise_software`, 90%
corporate buyerMix) gets **no corporate bids at all** in stage 05 — only whatever thin
household/government aggregate share it has (confirmed by instrumentation:
`enterprise_software` cleared with a single bid, the government aggregate, most weeks). Making
stage 05 authoritative for revenue while its demand side is this incomplete starves any company
in an uncovered category down toward zero over time, since the "real" number it's smoothing
toward is chronically near-zero for reasons that have nothing to do with the company's actual
health.

**This reorders the plan.** Phase 1's revenue-source swap cannot safely proceed until stage 05's
corporate demand-side coverage is complete — every sub-unit with `buyerMix.CORPORATE > 0` needs
a real corporate bid, not just the 7 categories `CORPORATE_DEMAND_INTENSITY` happens to cover
today. That work is now **Phase 1b** (prerequisite, before Phase 1 is retried):
- Generalize `CORPORATE_DEMAND_INTENSITY` (or replace it) so every sub-unit's real corporate
  demand is represented as real bids in stage 05, sized consistently with what stage 03's
  aggregate corporate demand share (`I`, or the relevant slice of it) already implies for that
  category — not a hand-picked list of 7.
- Re-run the 260-week revenue-ratio diagnostic (`diag-revenue-growth-ceiling.ts` in the
  scratchpad, or equivalent) after Phase 1b lands, *before* re-attempting Phase 1's swap, since
  this is exactly the failure mode that must not recur.

## Phase 1b landed — with one more gap found: the 5 capex-supplier categories

Implemented: `03-category-demand.ts` now stores a real `corporateDemandUSD` per category (the
same buyerMix/aggregate-investment math that already feeds the region's C+I+G identity, just
persisted instead of discarded after being summed into the blended target). `05-unit-bidding.ts`
now distributes that real total as named corporate bids across every potential buyer company,
weighted by revenue share — replacing the old 7-entry `CORPORATE_DEMAND_INTENSITY` list (removed
entirely, along with the now-dead import in `domain/industry.ts`) with coverage for every
sub-unit that has a real corporate buyer share.

**Verifying this exposed a further, related gap**: the 5 capex-supplier categories
(`heavy_equipment`, `industrial_automation`, `commercial_construction`, `enterprise_software`,
`commercial_fleet`) are deliberately excluded from `corporateDemandUSD` (their real demand comes
from `08b-capex-settlement.ts`'s capex routing instead, feeding `categoryDemand.demandLevelUSD`
directly) — but that mechanism only feeds stage 08's *statistical* revenue formula
(`categoryDrivenGrowth`), not stage 05's real auction. Confirmed by inspection: only
`industrial_automation` has a real corporate bid in stage 05 today (a pre-existing special case
using real per-company capex), and even that one appears to **double-count cash** — the buyer's
capex already reduces its own cash via the ordinary capex-funding flow in stage 08
(`weeklyFreeCashFlow -= newCapex/52`), and a *cleared* bid in stage 05 deducts the same dollars
again via `custUp.cashChange -= paymentUSD`. This is a pre-existing bug, not introduced this
session, but it means naively extending the same pattern to the other 4 categories (as originally
planned for Phase 4) would spread the double-count rather than just add coverage.

**Net effect**: Phase 1's revenue-source swap is now safe for every STANDARD_OPERATING company
*except* those whose primary line is one of the 5 capex-supplier categories — those still have no
trustworthy real settled-sales figure in stage 05. Phase 4 needs to both (a) add real bids for
the remaining 4 capex-supplier categories and (b) fix the cash double-count (likely: capex-bid
clearing should be the *only* place capex cash leaves the buyer, with the ordinary capex-funding
flow in stage 08 no longer separately debiting it) before those companies can join the swap.

## Target UI (per company, an Inventory view)

- **Output inventory**: units of finished product currently held, ready to sell, with current
  unit value.
- **Input inventory, by lot**: for each input category, the specific lots currently held —
  quantity, source (a named company or a private-sector segment), and the price paid for that
  lot — consumed oldest-first, not collapsed into one blended average cost.
- **This week's production**: units produced, and which input lots were consumed to make them.
- **Active contracts**: real `SupplyContract`s this company holds, both as buyer (who it buys
  from, quantity/week, price, weeks remaining) and as seller (who buys from it) — `reg.
  activeContracts` already carries this; it is not yet surfaced anywhere in the UI.
- **Capex destination**: which real supplier(s) — company or private-sector segment — this
  company's capex dollars went to this week/quarter, once phase 4 folds capex into real bids.
- **COGS destination**: the same traceability for ordinary input/raw-material purchases.
- **Reconciliation**: the quarterly income statement, balance sheet, and cash flow already built
  in `CompanyDeepDive.tsx` must be *derived from* these real holdings and transactions — COGS
  ties to real input lots consumed at their real acquisition cost, capex ties to real
  contracts/purchases, and the balance sheet's inventory line ties to real lot valuations — not
  merely consistent with them by construction.

## Phased plan

- **Phase 0 (done):** this document; audit of existing mechanisms.
- **Phase 1a — Per-sub-unit output inventory (new prerequisite, found during Phase 1 work).**
  Replace the single `finishedGoodsInventoryUSD`/`finishedGoodsUnits` scalars with a per-sub-unit
  structure so a multi-line company's inventory is no longer clobbered every week by whichever
  line's bidding pass runs last. Touches: `Company` domain type, `05-unit-bidding.ts` (both the
  offer-construction and save-results blocks), `08-company-fundamentals.ts` (the
  industrial_automation/heavy_equipment special case and the general branch), `04-input-output.ts`
  (supplier distress checks), company generation/seeding, merger consolidation, and any UI reading
  these fields. Must land and be verified before Phase 1's revenue-source swap, since that swap
  would otherwise adopt a corrupted signal.
- **Phase 1b — Complete stage 05's corporate demand-side coverage (new prerequisite, found
  while attempting Phase 1).** Generalize `CORPORATE_DEMAND_INTENSITY` (7 categories today) so
  every sub-unit with `buyerMix.CORPORATE > 0` gets real corporate bids in stage 05's auction,
  sized consistently with what stage 03's aggregate corporate demand already implies for that
  category. Without this, making stage 05 authoritative for revenue starves any company in an
  uncovered category toward zero (confirmed: a 260-week diagnostic showed 28,323 violations,
  dozens of companies collapsing to <0.02x their starting revenue, when Phase 1 was attempted
  against the current sparse coverage). Must land and be verified before Phase 1 is retried.
- **Phase 1c — Fix two pre-existing bugs uncovered while re-testing Phase 1b (landed).**
  Re-running the 260-week revenue-ratio diagnostic against Phase 1b alone (no revenue-swap code)
  produced an even worse collapse than the original Phase 1 attempt (67,753 violations, then
  confirmed present at committed HEAD with no Phase 1a/1b changes at all — this was always a
  latent, pre-existing bug, just not previously visible at this diagnostic's scale). Root cause
  was **two separate, pre-existing bugs**, neither one specific to Phase 1b:
  1. **Field collision**: `CategoryDemandState.clearedInputPriceIndex` was written by *both*
     `04-input-output.ts` (a smoothed, self-referential upstream_extraction/specialty_metals
     scarcity index, blended 0.85/0.15 week over week) *and* `05-unit-bidding.ts` (an unrelated,
     unsmoothed same-week auction-clearing-price ratio, written unconditionally for *every*
     category). Since stage 05 runs after stage 04, it silently clobbered stage 04's own
     next-week self-reference for those two categories every week. Fixed by giving stage 04 its
     own field, `upstreamScarcityIndex`, and leaving `clearedInputPriceIndex` exclusively owned
     by stage 05.
  2. **Wrong-field read, not a magnitude problem (the real cause of the mass collapse — first
     attempted as a production-response clamp, which the user correctly rejected: "if something
     explodes, the economic mechanic that should compensate isn't working, don't clamp it, fix
     the real mechanism").** A sector breakdown of a failing run showed `inputSupplyConstraintFactor`
     decayed to ~0.005 for every sector mapped through `CATEGORY_INPUT_REQUIREMENTS`
     (Tech/Industrials/Consumer), while sectors outside that map (Energy, Banks) stayed exactly
     1.0 — pointing straight at `08-company-fundamentals.ts`'s `relevantFulfillment` computation.
     Instrumenting `04-input-output.ts` directly showed the true picture: for
     upstream_extraction/specialty_metals, real supply vastly *exceeds* real demand (inventory
     grows every week; `bidQuantity` is only ~1.6% of `totalAvailableSupply`) — there is no real
     scarcity at all. But stage08 was reading `reg.categoryDemand['upstream_extraction']._fulfillmentRatio`
     (the *input category's own* field, `quantityFulfilled / totalAvailableSupply` — a
     supply-utilization stat that reads LOW exactly when supply is abundant relative to demand)
     instead of `reg.categoryDemand[line.subUnitId]._fulfillmentRatio` (the company's *own
     product line's* field, correctly set by stage04's `demanderEntry` loop as
     `quantityFulfilled / bidQuantity` — "was my actual input demand met," which was ~1.0 the
     whole time). Reading the supplier-side field as if it were the demand-side field meant every
     company touching an input category had its revenue crushed by an abundant-supply signal
     misread as a shortage — a real, structural fix (two lines changed: iterate the company's own
     product lines and read `_fulfillmentRatio`/`inputCostPressure` off each line's own
     `subUnitId`), not a clamp. The identical bug affected `inputPriceDrag`'s cost-pressure
     lookup and was fixed the same way. Verified: 60-week and 150-week diagnostics with this fix
     (no clamps anywhere) show `avgRatio` stable near 1.0 across the whole run, versus universal
     collapse toward ~0.01x by week ~50 before the fix.
  A residual, much smaller issue remains: a stable (not growing) subset of ~300 companies (out
  of ~1,000+) still collapse toward the `Math.max(10, ...)` revenue floor by week ~130 in a
  150-week run, while the rest of the economy stays healthy (avgRatio ~0.98). This looks like the
  same phenomenon task #18 already tracked at a much smaller, pre-Phase-1b scale ("8 companies
  over 260 weeks") — plausibly a genuine "loses every real bid to more competitive rivals, goes
  to zero" case now surfacing for more companies because Phase 1b's revenue-share bid sizing
  makes losing companies' disadvantage compound for real, rather than a bug in today's fixes.
  Not yet root-caused; tracked as a continuation of task #18, not a blocker for landing Phase 1c/1b.
- **Phase 1 — Reconcile the demand layers (landed).** Household/government aggregate demand
  already fed stage 05's bidding as real bids (pre-existing); Phase 1b did the same for corporate
  demand. What remained was the revenue side: every non-institutional company's revenue was
  still purely a statistical formula (`targetAnnualRevenue`, driven by category growth rates),
  with stage 05's real settled sales having zero effect except for the three industrial-goods
  lines' `unsoldThisWeekUSD` penalty. Generalized that same, already-safe mechanism to every
  company: `08-company-fundamentals.ts` now reads stage 05's real, company-wide aggregate
  `_targetProductionUSD`/`salesUSD` (summed across every product line the company actually
  auctioned this week) unconditionally, and every company's revenue absorbs a real penalty when
  its real settled sales fall short of that real target — not a full override of the statistical
  anchor (which is what caused the two earlier catastrophic collapses before Phase 1b/1c's fixes
  landed), but a genuine, direct feedback from the real bid/offer market into every company's
  revenue. Verified via a 60-week diagnostic (0 violations, avgRatio tracking the same healthy
  dip-and-recover pattern seen in the pre-Phase-1 baseline).
- **Phase 2 — Input inventory + literal recipes (landed, with a known tracked regression).**
  Added real per-company input inventory (`Company.inputInventoryBySubUnit`): credited at the
  real price paid when a purchase clears in `05-unit-bidding.ts` (both contract and open-market
  purchases), drawn down in `08-company-fundamentals.ts` by each line's real recipe-based need
  (still `CATEGORY_INPUT_REQUIREMENTS`'s $ intensities, converted to units via the input
  category's real price — not yet literal physical unit recipes, which would need a company's
  own "unit" of output independently defined; left for a future pass), and surfaced in
  `CompanyDeepDive.tsx`. Two real bugs were found and fixed while landing this:
  1. Input-category bid sizing (`05-unit-bidding.ts`) originally used Phase 1b's generic
     revenue-share-of-aggregate-corporate-demand formula for every category, including
     recipe-input categories (upstream_extraction, specialty_metals) — completely unrelated to
     what a company's recipe actually needs. Fixed by sizing a recipe-input category's bid
     directly from `computeRecipeInputNeedUSD` (the same formula stage08 uses to consume), so
     what a company bids to buy matches what it will actually consume.
  2. The real per-company physical-stock check was originally a hard, unsmoothed multiply on
     top of the existing smoothed regional fulfillment signal. Direct instrumentation showed two
     real-world wrinkles: (a) even when a region's aggregate auction clears in full, an
     individual company can still be filled 0% purely from where its bid landed in the matching
     order — real but noisy, and (b) specialty_metals has **zero real supplier companies**
     anywhere in the sampled region — a company-generation gap (giving the private sector a real
     supply role here is Phase 3's job), not real scarcity. Fixed by folding the physical check
     into the *same* smoothed 0.7/0.3 EMA as the regional signal (so one unlucky week doesn't
     hard-crash a company), and by excluding any input category with zero real region-wide
     suppliers from the physical check entirely until Phase 3 gives it a genuine supply source.
  **Known regression, landed anyway on the user's explicit instruction, tracked as follow-up
  work:** even after both fixes, a 60-week diagnostic shows a small, real subset of companies
  still spiraling toward the revenue floor (0 violations through week 37, 72 violations by week
  39) — worse than Phase 1 alone (0 violations through 60 weeks). Root cause: the bid/offer
  auction (`05-unit-bidding.ts`'s matching loop) allocates strictly by price priority
  (`bids.sort(...).offers.sort(...)`, greedy sequential match), not pro-rata — a company with a
  structurally lower bid price (e.g. persistently low cash → lower `cashModifier` → lower
  `maxPriceUSD`) can be shut out of an auction indefinitely even when the region's aggregate
  supply and demand balance exactly. Phase 2's hard physical-stock consumption turns that
  matching-order bias into a real, compounding death spiral for whichever companies keep losing.
  **The real fix is pro-rata allocation among all bids that clear at the market price** (how many
  real double auctions / oversubscribed IPO allocations actually work — also consistent with the
  user's own noted future idea of finding a real clearing level via demand), not a clamp on the
  symptom — this is a nontrivial change to the core matching algorithm shared by every category's
  weekly auction and needs its own dedicated implementation + verification pass before this
  specific collapse pattern is resolved. Tracked as a new prerequisite, effectively continuing
  task #18's original finding at a now-more-exposed scale.
- **Pro-rata auction allocation (landed).** Rewrote `executeSubUnitBiddingMarket`'s matching in
  `05-unit-bidding.ts`: the sequential bid/offer walk now only *discovers* the clearing price and
  total cleared quantity (unchanged), instead of also deciding allocation as a side effect of
  which order bids/offers happened to sort into. Allocation is now pro-rata — every bid/offer
  that clears at the market price gets the same fill ratio, computed from the ORIGINAL
  (never-mutated) requested quantities, so a structurally lower-priced bidder can no longer be
  shut out indefinitely just from queue position. Also fixed a real double-count this rewrite
  exposed (`totalUnitsDemandedThisWeek` summed `bid.quantityUnits`, which used to mean
  "unfilled leftover" but now means "original requested amount," so adding `openUnitsCleared` on
  top would double-count the cleared share), and a real O(n²) performance regression in step 4's
  contract-formation loop (pairing every in-the-money bid with every in-the-money offer — cheap
  before, since only a couple of entries were ever "fully filled," but pro-rata routinely puts
  most of both sides in the money at once; fixed by sampling one random partner per bid instead
  of the full cross product, preserving the same "each bidder has some chance of a new long-term
  deal" behavior at O(n)). Verified via a 60-week diagnostic: total violations dropped from 72
  (by week 39, still climbing) to 20 (by week 57, then flat through week 60) — and critically the
  pattern changed from monotonic decay to one that stabilizes and partially recovers (minRatio
  0.008 at week 48 → ~0.02-0.03 for the remainder). Real improvement, not a full resolution — the
  residual is still tracked under task #18/#49's continuation.
- **Phase 3 — Private sector as a real participant (partially landed: supply-side only).**
  Gave the region's private sector a real, sellable offer in `05-unit-bidding.ts`'s auction for
  categories confirmed to have zero real public-company suppliers (specialty_metals) via a new
  `PRIVATE_SEGMENT_SUPPLY_CATEGORIES`/`PRIVATE_SEGMENT_SUPPLY_SHARE` mapping — a genuine named
  counterparty (`PRIVATE:<segmentType>`), not a residual write-off: it submits a real offer sized
  from a share of the segment's own real revenue, and its cleared sale is credited back to that
  same segment's `annualRevenueUSD` (replace-don't-stack, mirroring `08b-capex-settlement.ts`'s
  existing pattern for capex). Also updated `08-company-fundamentals.ts`'s Phase 2
  `hasRealSupply` check to recognize this as real supply too, so specialty_metals is no longer
  excluded from the physical fulfillment computation. Verified via a 60-week diagnostic:
  specialty_metals now clears in full (supplied units == demanded units, vs. zero supply before);
  aggregate violations were comparable to the pro-rata-only baseline (26 vs. 20, same
  stabilize-and-partially-recover pattern) but max ratio dropped further (7.79x vs. 12.31x) — a
  real, genuine improvement, though the dominant residual driver is still the auction-fairness
  issue tracked under task #18/#49's continuation, not the supply gap this phase closed.
  **Not yet done:** private-segment *demand-side* participation (as a real bidder/buyer for
  categories it plausibly consumes) and retiring `08b-capex-settlement.ts`'s residual credit
  mechanism — left for a follow-up pass.
- **Phase 4 — Generalize capex into real bids, retire 08b (landed).** Generalized the real
  per-company capex bid pattern (previously only industrial_automation had one, hardcoded 0.35)
  to all 5 capital-goods categories, sized from each buyer's own real capex via
  `CAPEX_SUPPLIER_WEIGHTS[subUnitId]`. Extended the private-segment offer mechanism (Phase 3) to
  these categories too — the segment covers whatever share of aggregate real capex demand
  in-region public producers don't (`1 - CAPEX_PUBLIC_SUPPLY_SHARE`), replacing
  `08b-capex-settlement.ts`'s identical economics with a real, price-competing auction offer
  instead of a direct, un-auctioned credit. `08b-capex-settlement.ts` is now fully retired
  (deleted; its invocation removed from `core.ts`).
  **Real bug found and fixed while landing this:** several capex categories route to the *same*
  private segment (heavy_equipment, industrial_automation, and commercial_fleet all → MANUFACTURING),
  and — the identical issue for specialty_metals/upstream_extraction sharing MANUFACTURING from
  Phase 3 — each category's weekly crediting step used one shared scalar field on the segment,
  so each category wrongly subtracted a *different* category's just-written contribution as its
  own "prior week's value," corrupting `annualRevenueUSD`. Fixed by keying both contribution
  fields (`capexDerivedAnnualRevenueUSDBySubUnit`, `realSupplySalesDerivedAnnualRevenueUSDBySubUnit`)
  per sub-unit category instead of one field per segment.
  **Known, understood exposure — not a new bug, confirmed by direct A/B test:** a 60-week
  diagnostic showed violations rising to ~110-118 (vs. Phase 3's 20-26) after this change. Direct
  instrumentation of a sample heavy_equipment producer showed the same `inputSupplyConstraintFactor`
  collapse (an IndustrialsMachinery company losing the upstream_extraction/specialty_metals
  input-fulfillment auction) **at an identical or faster rate in the Phase 3 baseline with
  Phase 4's changes fully stashed out** — i.e. this exact collapse mechanism already existed and
  is not new. What changed is exposure: heavy_equipment/commercial_construction/enterprise_software/
  commercial_fleet producers previously got a smooth, guaranteed statistical demand-growth
  injection from 08b regardless of real market conditions; with 08b retired, their revenue is now
  fully subject to the real (still-imperfect) auction mechanics — including the same
  auction-fairness residual already tracked under task #18/#49's continuation — so more companies
  now cross the violation threshold. This is the same category of tradeoff already accepted for
  Phase 2 (real mechanics over statistical insulation, with the underlying residual issue tracked
  separately rather than blocking this phase).
- **Phase 5 — Full validation.** Re-run the invariants harness and multi-hundred-week
  diagnostics; this phase touches nearly every company's revenue/cost determination, so it
  carries the largest verification burden of anything done this session.
- **Phase 6 — Inventory UI (partially landed).** `CompanyDeepDive.tsx`'s "supplychain" tab
  already had active contracts (as both buyer and seller, with concentration-risk flags) from
  earlier work — this pass added the remaining real data that already existed in the simulation
  but wasn't surfaced: output inventory by sub-unit (units held, price/unit), input inventory by
  sub-unit (units bought, avg cost/unit), and this week's real settled sales/purchases (added
  `Company.lastWeekSalesUSD`/`lastWeekPurchasesUSD`, populated in `08-company-fundamentals.ts`
  from `05-unit-bidding.ts`'s real cleared amounts — previously only visible transiently within
  a single week's `companyUpdates`, never persisted for the UI to read). Purely additive (no
  simulation-mechanics changes); verified via a 5-week smoke test.
  **Lot-level provenance + purchase destinations (landed).** `Company.inputInventoryBySubUnit`
  is now `Record<string, InputLot[]>` (`domain/company.ts`'s new `InputLot` type: `sellerId`,
  `unitsHeld`, `unitPriceUSD`, `acquiredWeek`) instead of one blended `{unitsHeld, valueUSD}`
  average — each real purchase is credited as its OWN lot, consumed oldest-first (FIFO) in
  `08-company-fundamentals.ts`'s physical-fulfillment drawdown. Contract-settlement purchases
  already had a real named counterparty (`contract.supplierCompanyId`); open-market purchases
  did not — pro-rata clearing only produces aggregate totals per side, not buyer/seller pairs.
  Added a real northwest-corner lot allocation in `05-unit-bidding.ts` (walk both sides' filled
  quantities in order, filling from the current seller until either side is exhausted, then
  advance) — the same assumption a real clearinghouse uses to settle pooled trades, not an
  invented attribution, and O(buyers+sellers) so it carries no performance risk. `CompanyDeepDive.
  tsx` now shows real per-lot holdings ("N units from TICKER at $P/unit," or "private: SEGMENT")
  and a new "This Week's Purchase Destinations" panel (this week's real spend grouped by real
  counterparty, covering both COGS-input and capex-category purchases — the same lot data serves
  both, since a capex purchase is just a purchase in a capex-supplier subUnitId). Verified via
  `tsc`, hygiene, a 30-week smoke test (0 violations) and a 60-week revenue-ratio diagnostic (9
  violations, avgRatio ending healthy at 0.920 — driven by what looks like one producer earning
  real outsized revenue from sustained real scarcity pricing in a newly-linked commodity
  category, not a collapse; smaller than every prior phase's tracked residual, e.g. Phase 4's
  110-118).
  **Not yet done:** reconciling the existing quarterly financials (COGS breakdown, balance-sheet
  inventory line) to derive from these real lots rather than the statistical formulas they were
  originally built from — a materially larger, riskier change to core financial-statement
  mechanics than the additive UI/data work above, deliberately left for its own pass rather than
  folded in here.

- **Phase 3 (demand-side) + auction cash-rationing fix + stage04 pooling fix (landed).**
  Three related fixes, verified together:
  1. **Phase 3 demand-side landed.** The private/non-public sector now also bids as a real
     buyer in `05-unit-bidding.ts`: every segment bids for capital-goods categories from its own
     real `capexUSD` (same mechanism as public companies), and the MANUFACTURING segment bids
     for its real recipe inputs (upstream_extraction/specialty_metals), closing the loop with its
     existing supply-side role. Other segment types' generic-category demand is deliberately left
     unmodeled rather than guessed.
  2. **Root-caused and fixed the task #18/#49 auction-fairness residual's proximate mechanism.**
     `cashModifier` was discounting a cash-strapped buyer's bid PRICE by up to 15%. Under
     pro-rata clearing, any bid either clears in full alongside everyone else or misses the
     clearing price entirely — there is no partial credit for being close — so a temporary cash
     dip could permanently price a company out of its own input auction with no way back (low
     cash -> lower price -> shut out -> can't produce -> less cash -> repeat). Fixed: cash-
     constrained buyers now scale back QUANTITY ordered (real capital rationing) instead of
     underpricing themselves, so whatever they do bid for still clears at a normal price.
  3. **Root-caused and fixed a deeper, pre-existing bug in `04-input-output.ts` this
     investigation surfaced: a shared input category's supplier state was being clobbered.**
     specialty_metals/upstream_extraction are needed by MULTIPLE demander industries at once
     (Tech, Auto, Aerospace, Industrials for specialty_metals). The old code looped per demander
     industry and, for each one, independently recomputed and OVERWROTE the shared supplier's
     `inventoryLevelUSD`/`upstreamScarcityIndex` as if that industry were the only consumer that
     week — so the persisted state each week reflected only whichever industry's pass ran last,
     silently discarding every other industry's simultaneous draw on the same pool. Confirmed by
     direct trace: specialty_metals inventory drained monotonically toward zero over ~45 weeks,
     and every industry needing it collapsed in lockstep the moment it hit empty — dozens of
     companies sharing the exact same product-line template hitting the identical revenue ratio
     in the same week, confirmed via A/B test (`git stash`) to already exist at the last-committed
     baseline, not something introduced this session. Fixed by pooling every demander industry's
     bid against the ONE real supply figure before clearing (mirroring the pro-rata principle
     already used in the real auction), and by combining a demander industry's OWN multiple input
     needs correctly (MIN for fulfillment — a real bottleneck, can't ship missing either of two
     needed inputs; SUM for cost pressure — each scarce input adds its own real cost) instead of
     one silently overwriting the other.
  All three verified via `tsc`, hygiene, and a 60-week revenue-ratio diagnostic; the mass
  synchronized-cohort collapse pattern is gone (0 violations through week 32 in the post-fix run,
  vs. onset at week ~30 pre-fix). **Not fully resolved — see next section.**

- **Deeper root cause found, not yet fixed: base commodities have no real link to the actual
  modeled commodities.** Investigating why specialty_metals' real supply never recovers (even
  after the pooling fix above) found the true root: the codebase already has a full, real
  commodities model (9 tradable instruments — `ENERGY_ALPHA/BETA/GAMMA`, `METAL_ALPHA/BETA/
  GAMMA`, `AGRI_ALPHA/BETA/GAMMA` — with real spot/futures prices, a real supply/demand clearing
  function `computeCommodityClearingRatio`, and dedicated producer companies seeded specifically
  for them via `producedCommodityId`), and a `COMMODITY_CATEGORY_LINKAGE` table that already maps
  each commodity to an industry category for DEMAND purposes. But `companyGenerator.ts` assigns a
  company's real `productLines` (what it actually produces as an industry output) purely from its
  `sector` string, completely blind to `producedCommodityId` — so the dedicated METAL_ALPHA/BETA/
  GAMMA producer companies (seeded specifically to produce specialty_metals) get `sector:
  'Industrials'`'s generic product-line template instead, which never includes `specialty_metals`
  at all. Net effect: specialty_metals has ZERO real producing companies anywhere, guaranteed by
  generation, independent of any auction/pooling mechanics — its stage04 supply can only ever
  decay. (`upstream_extraction` survives only by coincidence, since Energy sector's generic
  template happens to include it.) Even where supply exists, stage04 computes it from an invented
  formula entirely disconnected from the real commodity's own price/clearing that the trading
  desk already computes weekly — two parallel, unreconciled mechanisms for the same physical
  resource. Proposed fix (pending scope confirmation before implementing): retire stage04's
  invented supply proxy for these categories in favor of the real commodity's own clearing, and
  fix company generation so a `producedCommodityId`-tagged company also gets the matching
  industry `productLines` entry — unifying "the company you can trade" and "the company that
  really supplies this industrial input" into the same named actor.

- **Base commodities linked to the real modeled commodities (landed).** The user asked directly:
  "shouldn't [base commodities] come from the actual commodities we model?" Investigating found
  that the codebase already had a full, real commodities model (9 tradable instruments with real
  spot/futures prices and a real supply/demand clearing function) that was completely
  disconnected from the industry input-output layer — `companyGenerator.ts` assigned a company's
  real `productLines` purely from its `sector` string, blind to `producedCommodityId`, so the
  dedicated commodity-producer companies never actually produced their linked industry category
  as an output line. specialty_metals in particular had ZERO real producers anywhere, guaranteed
  by generation — the true root cause of that category's earlier depletion-to-zero, independent
  of any auction mechanics. Fixed in three parts:
  1. **Renamed all 9 commodities** to real, understandable category names (Crude Oil, Heavy
     Crude Oil, Natural Gas, Gold, Silver, Copper, Wheat, Corn, Soybeans) instead of invented
     tickers (`ENERGY_ALPHA` etc.) — prices/scarcity indices stay entirely synthetic, only the
     labeling changed.
  2. **`companyGenerator.ts` now gives every `producedCommodityId`-tagged company the matching
     real industry `productLines` entry** (upstream_extraction for Energy commodities,
     specialty_metals for Metals commodities, a new `agricultural_commodities` category for
     Agriculture commodities) instead of the generic per-sector template — unifying "the company
     you can trade" and "the company that really supplies this industrial input" into the same
     named actor. Added `agricultural_commodities` as a new raw-input sub-unit under
     MaterialsChemicals (alongside specialty_metals, not under ConsumerStaples — ConsumerStaples
     is itself a `CATEGORY_INPUT_REQUIREMENTS` demander of this category, so nesting the supply
     sub-unit there created a real, confirmed self-referential demand-inflation bug, fixed by
     moving it) and gave ConsumerStaples a real `agricultural_commodities: 0.12` input
     requirement (food/beverage production's real dominant input is crops, not energy).
  3. **`04-input-output.ts` now sources each category's real weekly supply from the actual linked
     commodities' own `weeklySupplyUnits`/`spotPrice`** (evolution.ts's `computeCommodityClearingRatio`,
     already real) instead of an independently invented per-company formula — with each region's
     share allocated proportional to its real share of GLOBAL demand for that category (a truly
     global commodity like copper trades in one global market; crediting the same global supply
     figure in full to every region independently would have quadruple-counted it across the 4
     regions).
  Verified via `tsc`, hygiene, a 30-week targeted trace (both specialty_metals and
  agricultural_commodities now show real, price-responsive recovery — inventory bottoms out then
  rebuilds as the linked commodities' own supply responds to price, instead of permanent
  depletion), a 60-week revenue-ratio diagnostic (**0 violations through all 60 weeks — the first
  time this session**, vs. 85-118 before this fix), and a full 260-week `npm run verify` run.
  **`npm run verify` still fails**, but on a pre-existing, unrelated issue confirmed via A/B test
  (`git stash`): USA bank capital ratio collapses to exactly 0.0000 starting ~week 149, present
  at the last-committed baseline (103 violations) at essentially the same magnitude as with this
  fix applied (112 violations) — not a regression from this work. Tracked separately as task #67.

Each phase will be built, verified (`tsc`, hygiene, targeted diagnostics, then the full
invariants harness), and committed independently rather than as one large, unreviewable change.
