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
- **Phase 3 — Private sector as a real participant.** Add private-segment bidders/offerers to
  stage 05's auction for every category they plausibly produce or consume; retire the residual
  credit mechanism in `08b-capex-settlement.ts`.
- **Phase 4 — Generalize capex into real bids.** Fold `CAPEX_SUPPLIER_WEIGHTS` into
  `CORPORATE_DEMAND_INTENSITY`-style real per-company bids for all 5 capital-goods categories,
  removing the parallel abstract injection entirely.
- **Phase 5 — Full validation.** Re-run the invariants harness and multi-hundred-week
  diagnostics; this phase touches nearly every company's revenue/cost determination, so it
  carries the largest verification burden of anything done this session.
- **Phase 6 — Inventory UI.** Build the per-company Inventory view described above (output
  inventory, input lots with provenance/price, weekly production, active contracts as both
  buyer and seller, capex/COGS destination) in `CompanyDeepDive.tsx`, and confirm the existing
  Financials tab's quarterly statements reconcile exactly to this real underlying data rather
  than to the formulas they were originally built from.

Each phase will be built, verified (`tsc`, hygiene, targeted diagnostics, then the full
invariants harness), and committed independently rather than as one large, unreviewable change.
