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
   units of each input category it has bought but not yet consumed.
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

## Phased plan

- **Phase 0 (done):** this document; audit of existing mechanisms.
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

Each phase will be built, verified (`tsc`, hygiene, targeted diagnostics, then the full
invariants harness), and committed independently rather than as one large, unreviewable change.
