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
- **Phase 1 — Reconcile the demand layers.** Make stage 03/04's outputs into *inputs* to stage
  05's bidding logic (price-setting, bid aggressiveness) instead of independent revenue/cost
  determinants. Verify no invariant regressions (revenue growth ceilings, GDP stability,
  ownership convergence) — this alone is a meaningful, isolated, testable step.
- **Phase 2 — Input inventory + literal recipes.** Add per-company (and per-private-segment)
  input inventory tracking; replace `CATEGORY_INPUT_REQUIREMENTS` with literal unit recipes;
  wire production to draw down input inventory and add to output inventory.
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
