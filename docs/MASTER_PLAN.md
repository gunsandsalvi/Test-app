# MASTER PLAN — Single Source of Truth

This is the **only** planning/instructions document in the repository. It replaces and absorbs
the former `ARCHITECTURE.md`, `CODEBASE_AUDIT.md`, `ONE_DOLLAR_PROJECT.md`,
`PROJECT_WALL_STREET.md`, `PROJECT_MAIN_STREET.md`, `PROJECT_BLUEPRINT.md`, and
`PROJECT_AURORA.md` (all deleted; their full history lives in git). It contains:

- §1 The rules of engagement (standing directives — read before touching anything)
- §2 Codebase map (what every file is)
- §3 Current state: what is genuinely real vs. still formula-driven
- §4 **The global work order** — the only place a project's order and state live; §4.1 lists what
  has closed and what each closed project left standing
- §5 Detailed work instructions, one section per OPEN §4 item, in §4's order
- §6 Open defects (§6.1), watchlist (§6.2), the standing rule audit (§6.3) and the clamp-removal
  discipline (§6.4)
- §7 Record of completed work and hard-won lessons (do not re-learn these; never renumbered)

**How to work through this file:** take the next unfinished item in §4's order, read its §5
section, implement it exactly where §5 says, run the verification ladder (§1.10), commit it as
one bounded change with a message naming the item, then return to §4. Never start an item whose
listed prerequisites aren't done. **When an item closes:** move its §4 row to §4.1 with one line
on what it left standing, delete its §5 section, and write the record in §7.

---

## 1. Rules of engagement

These are standing user directives. They are not suggestions.

1. **Every asset price is the actual result of real supply/demand clearing.** OAS, discount
   margin, yield, P/E — all are *statistics derived from a cleared price*, never the mechanism
   that sets it. The one confirmed exception: central-bank **administered** rates (SRF /
   ON RRP) — a posted rate with real quantity response is itself the real-world mechanism.
2. **No caps, floors, ceilings, or rescales** — except genuinely mathematical ones (a price
   can't be negative; finiteness). If a number explodes, the economic mechanism that should
   compensate is broken: find it and fix it at the root, bottom-up. Never clamp the symptom.
3. **"1$ is 1$":** every dollar must trace to a real, named counterparty (a company, a bank,
   an institutional entity, a private-sector segment, government, households). The recurring
   anti-pattern to hunt and kill is **two disconnected representations of the same real
   thing** — a real cleared/settled ledger and a parallel formula that overwrites or ignores it.
4. **No real-world data, and no real-world OUTCOMES either.** No real tickers, company names,
   observed market prices, or copied spread tables. Everything is generated from internal
   primitives (productivity, inflation target, cost-of-production, Gordon growth, geometric
   rating-spread progression). **The sharper half of this rule:** a real-world *primitive* is
   fine (a tax rate, a replacement rate, a regulatory ratio, a haircut); a real-world
   *equilibrium* is not. Dollar invoicing dominance, a 24% foreign ownership share, a fixed
   central-bank market share are RESULTS of histories this simulation does not have. Import one
   and the model can never tell you anything about it, because you assumed the answer.
5. **Target allocations are long-term policy guides only.** What a participant actually buys
   each week is a tactical decision from real characteristics (value vs. its own fair-price
   view, momentum, mandate, duration fit) — never the target mechanically.
6. **Long tests are end-of-project only.** The 260-week `npm run verify` run is reserved for
   final validation of a whole project. During development use: `npm run lint` (tsc),
   `bash scripts/check-hygiene.sh`, and short scratchpad diagnostics (5–60 weeks).
7. **One bounded, verified commit per phase/slice.** Never one large unreviewable change.
8. **Reflect the real-world mechanism.** When in doubt about how something should work,
   the answer is: the way it actually works in the real world, modeled with real named
   counterparties. Ask the user before large scope decisions.
9. **Periodicity is part of the number.** Every rate, growth figure, flow and index carries a
   period — weekly, monthly, quarterly, annual, annualised, or a change over a trailing window —
   and mixing two of them silently is one of the most common defects in this codebase. It has
   already caused: a "year-over-year" GDP comparison taken 51 weeks apart; a first-year growth
   rate that exponentiated one week's rate by 52; a `clearedInputPriceIndex` that measured
   week-over-week while its consumers read it as a level versus baseline; and a weekly government
   spending figure multiplied by 52 in one place and not another. **Before using or writing any
   such value, confirm its period at the source and name it in the identifier or a comment**
   (`...WeeklyUSD`, `...Annual`, `...AnnualisedPct`, `...YoY`). Never infer it from context.
   **For anything displayed to the user, the convention is: show month-over-month AND
   year-over-year.** Where there is not enough history to compute a change honestly, show the
   level itself rather than a change derived from a partial or synthetic window — a missing
   change is information; a fabricated one is a lie.

10. **The simulation is a partial world until the remaining projects land — do not chase every
    moved number.** (User directive, 2026-08-27.) Whole systems are still missing (G2's
    transmission, HH's households, PUB's fiscal loop), so harness counts shift for
    non-economic reasons — an RNG-stream change relabels the world, a deleted prop reveals a
    documented disease, a different seed escapes a band another seed holds. Attribute a moved
    baseline BRIEFLY (one cheap A/B at most), record it with its owner, and move on. Deep
    root-cause hunts are for defects inside the systems that exist, not for the imbalances the
    missing systems explain.

11. **Brevity in comments and in this file.** (User directive, 2026-08-28.) A comment earns its
    place by saying something the code cannot: why a constant has the value it does, what a
    non-obvious mechanism is, what was tried and failed. It does not narrate the code, restate a
    commit message, or tell the story of how the change was found. **Clean up as you go** — when
    you touch a file, trim the over-long comments already in it. Same for this document: every
    record is the finding, the number, and the lesson. No information is dropped; the narrative is.

12. **Do not evaluate market behaviour mid-update.** (User directive, 2026-08-28, after several
    reminders.) When a project is underway, BUILD THE WHOLE THING before measuring. Do not run
    `npm run verify` to see how the economy is behaving, do not classify violation counts, do not
    A/B market outcomes to explain a moved number. A project of any size touches everything at
    once; numbers taken halfway through describe an economy that does not exist yet, and chasing
    them fragments the work and wastes the run. **Measure once, at the end.** The narrow
    exceptions are structural, not behavioural: `tsc`/`build` to confirm it compiles, and a
    targeted probe that a mechanism you JUST wrote is wired (a field persists, a leg exists, a
    counterparty is present). **The harness may be deliberately red mid-project — see §6's first
    row before assuming something is broken.**

13. **Ownership, prices, quantities and capacities are OUTCOMES.** Never impose a share, a price,
    a flow or a capacity that a mechanism should produce. If an aggregate needs a number, it comes
    from the participants' own books and constraints, and the market decides the rest. Deleted for
    exactly this reason: `foreignShare` (an ownership share owning nothing — 442B of claims with
    no holder, §7.72), forced sovereign placement (§7.65), the QE/QT stance scalar (§7.66), and
    five FX constants invented to manufacture a curve that books should produce (§7.75). **A
    residual with no holder is a defect, not a boundary** — a named gap is legitimate only with a
    size, an owner and a scheduled closing slice; otherwise it is a plug with paperwork.

14. **Every flow has two sides, and both legs go in the same pass.** A security movement has a
    cash leg. A derivative has a counterparty with a balance sheet and finite capacity. A payment
    leaving one book arrives on another. **A one-sided flow is a defect even when nothing fails
    and every test passes.** Building a two-sided flow one side at a time is how a leg goes
    missing: §7.75's cross-border settlement bought the euro and never sold the yen, and it took a
    direct question to find because nothing errored.

15. **A bound is not a price.** All markets clear through
    `stages/financial-clearing-engine.ts`: a participant posts a reservation level, a
    `fullSizeStatRange` to scale in over, a `maxHoldingUSD` cap, a `maxNetPurchaseUSD` cash budget
    and a `minHoldingUSD` floor, and the solve is a bisection with **saturation clearing** and a
    dealer residual. If demand cannot absorb the float, clear at the saturation point and let the
    dealer carry the rest — never park the print on a clamp and call it a price. This error has
    been made and recorded twice (§7.21, §7.75). Do not make it a third time.

16. **Delivery.** One bounded commit per slice, pushed. Commit messages and §7 records both state
    what changed, WHY, and the measured numbers — written for a reader who was not here. **No
    model identifiers in any committed artifact** (commit messages, PR bodies, code comments).
    Do not open a PR unless asked.

17. **The targeted-change test.** (User directive, 2026-08-29.) Adding a new product line, a
    production lead time for a boat, a revenue-recognition rule for one profile, a new hedge-fund
    type — each must be ONE targeted change: a registry entry, or one profile module, never an
    edit across the codebase. The structure that enforces it: all DATA about what is made or who
    is acting lives in a registry (BP1); all BEHAVIOR that varies by kind lives in a profile
    module behind a dispatch table. **A stage may not switch on an industry, sector, or entity
    type — it asks the registry or calls the profile.** A new `if (sector === ...)` or
    `entityType === ...` branch in a stage is a defect under this rule even when it works.

18. **Model updates come first; a misbehaving NUMBER is not a work item.** (User directive,
    2026-08-30.) The priority is always the missing MECHANISM, never the statistic that looks
    wrong. A number that misbehaves is evidence that something is not built — so the work is to
    find and build it, and the number moves as a consequence. **Scoping a project around closing a
    number is how a model gets tuned instead of built.**
    - This is the third member of a family. Rule 10 says do not chase a MOVED number; rule 12 says
      do not MEASURE mid-project; rule 18 says do not SCHEDULE around a number at all.
    - **The evidence, measured across one session (§7.146-163).** Ten IND slices and three
      root-cause fixes moved the week-10 price print from −25.5% to +4.3% without any of them ever
      targeting it, and the largest single move came from a UNIT ERROR in the labour stage
      (§7.149) that no amount of staring at the inflation series would have found. Meanwhile the
      row scoped to "close the inflation escape" sat at the top of the work order against evidence
      that was, by then, months of mechanism out of date.
    - **The corollary for the work order:** a row whose content is "this number is wrong" is not a
      foundation row. It is a CONSEQUENCE row, it belongs after the mechanism tier, and its
      evidence must be re-measured before it is scoped — never inherited.

19. **THE FEWEST PRIMITIVES THAT GENERATE THE WORLD.** (User directive, 2026-08-30. The most
    basic rule: 1, 4 and 13 are corollaries of it.) A number is a legitimate primitive **only if no
    mechanism in the model can produce it**, which leaves exactly three kinds:
    **TECHNOLOGY** — what a process physically takes (a recipe, a lead time, a value density).
    **PREFERENCE** — how an agent trades the present against the future, and its aversion to risk.
    **POLICY** — what an institution chooses (a tax schedule, a lending standard, a product term).
    Everything else is an OUTCOME, and a stated value for it is a defect with a scheduled death.
    - **Three kinds of number get confused, and the distinction is the whole rule.**
      **RESOLUTION** parameters — strata count, tier count, grid size — are numerical choices, not
      primitives; the test is INVARIANCE (the answer must not change when they do).
      **SHAPE** parameters — a Pareto alpha, tier shares, an MPC ladder, an average LTV — are
      claims about THE ANSWER, and every one is a place the model cannot surprise you.
      **TRUE** primitives are the three kinds above, and there should be very few.
    - **The count of stated shape parameters is a direct measure of how much mechanism is
      missing.** Each dies exactly when its mechanism lands. Keep the count falling; it may never
      rise. §5-DIST-P holds the scoreboard.
    - **Where an aggregate sits far from a threshold its own mechanism turns on, that mechanism is
      not inaccurate — it is SWITCHED OFF, and a constant is standing in for it.** Measured five
      times in one session (§7.146, §7.149, §7.159, §7.167, §7.169). Before believing a mechanism
      exists, print the number and check it can bind.
    - **The corollary that costs the most to forget:** a shape parameter STANDS IN FOR a missing
      mechanism, so deleting it before the mechanism exists does not make the model more
      bottom-up — it makes it wrong (§7.158). The order is forced.

### 1.10 Verification ladder (every work item)

**There is ONE test script: `scripts/harness.ts`** (user directive 2026-08-29, §7.101). One
simulation run; every check, every battery and the profiler read it as MODULES; it prints one
line per week (violations, unemployment, inflation, GDP, 10Y, damper-bound count, ms) so a run
can be watched live, with new violations inline under the week they happen. `check-hygiene.sh`
FAILS if any other file appears in `scripts/` — a new check or measurement is a module added to
`MODULES` in `harness.ts`, never a new script.

```
npx tsc --noEmit                   # typecheck — safe at any time
npm run build                      # build — safe at any time
bash scripts/check-hygiene.sh      # no root scratch files; ONE script in scripts/
npm run verify                     # hygiene + THE HARNESS: 60 weeks, checks + batteries +
                                   # A/B shocks. **~5 min** — see the cost table below.
                                   # END OF PROJECT ONLY — see rule 12.
WEEKS=10 SHOCKS=0 npm run verify   # quick wiring probe, ~15 s (structural, rule-12-safe). NOTE:
                                   # SHOCKS=0 runs a clean RNG stream — counts are not
                                   # comparable with the SHOCKS=1 baseline (dirty stream,
                                   # preserved from the old harness for continuity).
                                   # **AND SINCE IND18 (§7.155) A 10-WEEK RUN SAMPLES ONE
                                   # SEASON.** Weeks 1-11 sit in the agricultural production
                                   # trough and near the retail demand peak, so the headline
                                   # price print is a SEASONAL reading, not a level. It stays
                                   # comparable across commits (same seed, same calendar start)
                                   # and must not be read as a steady state. Judge price
                                   # behaviour on whole years only.
npm run profile                    # the same run with per-stage timings (PROFILE=1).
                                   # Baseline 2026-08-29 (§7.107): 1,139 ms/week,
                                   # 05 46.8%, 08 11.9%, 09-concentration 8.5%, books ~14%.
                                   # CLEARING_WORKERS=6 speeds any run up free.
VERBOSE=1 npm run verify           # full violation dump at the end (they print live anyway)
WEEKS=260 npm run verify           # ASK THE USER FIRST — long run, section close only
```

**What a run actually costs, measured (§7.107).** A week is ~1.1 s, but `npm run verify` runs
**243 weeks, not 60** — most of the wall clock is the A/B shock worlds, and each one is a second
full simulation:

| | weeks | wall clock |
|---|---|---|
| fixed cost (tsx startup + one seed build) | — | ~2 s |
| the 60-week run itself | 60 | **69 s** |
| pre-run A/B mechanism tests (equity demand 2×20, auction 2×1, mark-to-market 1) | 43 | |
| HH recession battery (control + shocked, 30 each) | 60 | |
| PUB debt-spiral battery (control + shocked, 40 each) | 80 | |
| **`npm run verify` / `npm run profile` total** | **243** | **~315 s** |

So `SHOCKS=0` is not a small saving — it is **69 s against 315 s**, because the shock batteries
are three-quarters of the work. Use `WEEKS=10 SHOCKS=0` while iterating and pay the full run
once, at the end, as rule 12 says.

A project's close-out battery is a `report()` module in the harness: every verify criterion in
its §5 entry, measured on the shared run, reporting numbers and judging nothing by itself. The
HH, PUB and XB batteries already live there; a closing project adds its own module in the same
commit that closes it.

Scratch scripts live in the session scratchpad, never in the repo. Delete all debug
`console.log` blocks before committing (grep for `DEBUG` and `console.log` in `src/engine/`).

---

## 2. Codebase map

### 2.1 Weekly pipeline (`src/engine/simulation/`)

`simulation.ts` re-exports `advanceWeeklyStep` + `createInitialGameState`.
`core.ts` builds a `WeeklyStepContext` (`stages/context.ts` — one shared mutable context so
every cross-stage dependency is visible) and runs the stages in order:

| Stage | File | Owns |
|---|---|---|
| 01 | `01-macro-feedback.ts` | Cross-region contagion/systemic-stress signals |
| 02 | `02-region-macro.ts` | Region macro evolution via `macro/evolution.ts` (GDP, inflation, wages, FX, ownership drift). Sets the administered policy rate; does NOT touch the yield curve |
| 02b | `02b-bank-diversification.ts` | Per-bank flow-ledger evolution (`macro/banking.ts` — cash moves only by named flows), the weekly overnight GC repo session (`stages/repo-clearing.ts`, WS6) with the SRF as a posted-rate seat in the book, the household deposit-vs-MMF split and fund quotes (`stages/money-market-fund.ts`, WS7), region aggregate = real sum of named banks |
| 03 | `03-category-demand.ts` | C+I+G demand targets per sub-unit; `corporateDemandUSD` persisted per category |
| 04 | `04-input-output.ts` | Input-category clearing: real supply from linked commodities, pooled multi-industry demand, pro-rata rationing |
| 05 | `05-unit-bidding.ts` | THE real goods auction: named bids/offers, pro-rata clearing, contracts, per-lot settlement (northwest-corner), capex bids. **XB3a — five books per sub-unit**: one WORLD book all four regions trade in and one LOCAL book each, split by `CATEGORY_TRADABILITY`; production and inventory settle ONCE per firm across both. Owns the emergent invoice currency and the cross-border invoices it strikes |
| 06 | `06-fx-and-trade.ts` | FX forward-basis evolution and the USD conversion every stage reads. Trade is REPORTED here, not computed: stage 05's world book already sold every tradable good to a named buyer |
| 07 | `07-commodities.ts` | Commodity spot evolution |
| 07b | `07b-corporate-bond-clearing.ts` | Corp bond clearing (FIXED tranches) — adapter over the generic engine |
| 07c | `07c-sovereign-bond-clearing.ts` | Sovereign tenor-bucket clearing (2/5/10/30Y) + Nelson-Siegel refit to cleared yields. **The curve's only owner**; macro reaches it through banks' reserve arbitrage and every holder's real yield |
| 07d | `07d-leveraged-loan-clearing.ts` | Leveraged loan clearing (FLOATING tranches), CLO/loan-fund base via `loanPct` |
| 08 | `08-company-fundamentals.ts` | Per-company weekly update: revenue (anchored to stage 05 real sales), costs, capex/debt, rating, earnings, equity price. Largest stage; reads cleared credit stats, never sets them. **Rebuilds each company from an explicit field list** — anything not named there is dropped every week (§7.41) |
| 08b | `stages/pe-lifecycle.ts` (`hc-lifecycle`) | The corporate lifecycle (HC Wave 2): settles the deals whose financing priced in this week's books, then decides next week's. LBOs and dividend recaps financed as real WS8 offerings, listings as real 07e offerings, firm births carved from the SME pools, sponsor equity wiped on a portfolio default. Owns `publicComparableEvMultiple` — the ONE multiple a private company is bought, marked and exited at, read off cleared listed prices |
| 08c | `stages/index-calculation.ts` | The published indexes: membership re-struck quarterly from the market that exists, level chained weekly off the constituents' own cleared prices. Credit marks at market, never par |
| 08d | `stages/etf-flows.ts` | Who indexes what (research capacity against the names to cover), creations and redemptions through the dealers as authorised participants, the sponsor's fee, and the unmet-flow residual. Sets NEXT week's fund demand, which 07b/07d/07e read through `stages/etf-demand.ts` — a SIZE with no reservation level, the price-insensitive buyer |
| 09 | `09-concentration-risk.ts` | >40% supplier/customer concentration flags |
| 10 | `10-mergers.ts` | Quarterly M&A |
| — | `stages/trade-settlement.ts` | XB3a — last week's cross-border invoices come due at today's rate, which is where transaction FX exposure is realised. Runs before 05 so an invoice carries exactly one week of it |
| 11 | `11-fiscal-and-sovereign-debt.ts` | The statistics stage: measures bottom-up GDP **and the consumer price index** (`stages/price-index.ts` — the only place inflation is set); deficit → real gov tranche issuance, placed with and redeemed from real holders; refreshes the derived holdings view (`stages/holdings-view.ts`, §7.26), news generation |
| 12 | `12-portfolio-and-positions.ts` | Index recomputation + player portfolio mark-to-market |
| 13 | `13-news-and-turn-summary.ts` | Cash/NAV settlement, turn summary |

`stages/financial-clearing-engine.ts` — the generic, cap-free **double auction**
`clearFinancialAsset(instruments, participants, priorDealerInventory, params)`. Each
participant posts a real per-instrument demand schedule (`ParticipantDemand`: a
`reservationStat` below which it holds none, a `maxHoldingUSD` policy ceiling, and the
`fullSizeStatRange` it scales in over) and `solveClearingStat` bisects for the level at which
total demanded quantity equals the real `tradableFloatUSD`. `statKind` orients the search
(`YIELD_LIKE` demand rises with the statistic, `PRICE_LIKE` falls). The bank dealer carries
whatever the participants do not take.
**Every asset class is a thin adapter over this engine** (07b/07c/07d/07e/07f and WS6's
overnight repo session today; derivatives and FX tomorrow). Adapters own: who the participants are, what each one's reservation level
and size are, and the structural share of each name each participant is sized against
(a relative weight on a real, already-bounded pool via `distributeRealTargetByWeight` — never
an independent dollar figure).
**Read §7.16 before changing this file.** It replaced an engine that priced a *quantity
target*, and the reasons that failed are recorded there.

`stages/shared-helpers.ts` — credit math, occupation demand, `distributeRealTargetByWeight`,
holdings attribution. `initialization.ts` — `createInitialGameState` (must seed holdings with
the SAME shape the weekly engine produces — see lesson §7.4). `credit.ts` ratings;
`merger.ts`; `trade.ts` (player trade execution); `constants.ts`. (`ipo.ts` is an empty
placeholder: HC Wave 2 deleted `generateIPOCompany` and the synthetic listing path with it —
a company reaches the public market only by a sponsor choosing to list it.)
`equity-valuation.ts` (src/engine/) — the ONE answer to what a share is worth: 07e's holders,
the bootstrap that opens the market, and a board sizing a buyback all read it.

### 2.2 Engine support (`src/engine/`)

`companyGenerator.ts` (company/bank/institution generation; commodity producers get matching
product lines), `pricing.ts` (closed-form pricers — being progressively demoted to
display/derivation-only as clearing takes over), `nelsonSiegel.ts` (+ `fitNelsonSiegelParams`
OLS refit), `blackScholes.ts`, `carryCalculator.ts`, `dealers.ts` (player-facing dealer
roster — to be unified with the real bank desks, §5-G3), `newsGenerator.ts`, `formatters.ts`
(sim calendar anchor `SIMULATION_START_DATE` = Jan 5 2026), `macro/`
(initialization / evolution / banking / indices / weather / utils), `bootstrap/`
(population, labor-and-wages, firms, category-demand, commodities-and-fx, yield-curves —
all generated from primitives, rule 4).

### 2.3 Domain (`src/domain/`)

`banking.ts` (BankingSector incl. per-tenor sovereign books + corp/sov/loan dealer
inventories), `company.ts` (incl. `InputLot` provenance, per-sub-unit inventories,
`LeveragedLoanInfo`), `institutions.ts` (`AssetAllocationTarget` incl. `loanPct`),
`instruments.ts` (AssetType, `COMMODITY_CATEGORY_LINKAGE`), `market-microstructure.ts`
(`CATEGORY_INPUT_REQUIREMENTS`), `industry.ts` (`INDUSTRY_SUBUNITS`, buyerMix),
`region-macro.ts`, `geography.ts`, `game-state.ts`, `portfolio.ts`, `markets.ts`, `events.ts`,
`primary-market.ts` (WS8 offerings, underwriting fees, relationship lead banks),
`global-goods.ts` (XB3a — the world book per sub-unit, and `subUnitTradability`),
`invoice-currency.ts` (which currency a cross-border trade is invoiced in — three contested
forces, nothing assigned), `trade-invoice.ts` (a delivered, unpaid cross-border sale),
`call-protection.ts` (what it costs to retire paper early — soft call, non-call schedules and
make-whole, and the ONE dealer spread both 07b and the make-whole read), `indexes.ts` (index
definitions as RULES — membership, weighting, rebalance calendar), `etf.ts` (fund shape, fee
schedule, AP capacity, the research-capacity primitive behind who indexes).

### 2.4 UI (`src/components/`) and invariants

UI reads `GameState` only. Several components still contain second price-setters/fabricated
numbers — see §5-G3 and §6. The one harness: `scripts/harness.ts` via `npm run verify` (§1.10)
(NaN purity, ownership conservation, NAV identity, fee conservation, MTM unfreezing, policy
rate stability, default/merger disjointness, bank capital & NIM bands, IPO EPS, revenue 20x
ceiling, sovereign absorption, equity-demand-moves-price, auction-moves-yields). Known harness state, measured at the WS5 close (§7.32/§7.34): **60 weeks, seed default —
4 violations, every one a known #18 revenue-runaway name**; 260 weeks — 12, same kind, with zero
bank-NIM breaches, zero book-conservation breaches and zero ledgers minting claims. The
sovereign-absorption check was repaired in S6 (§7.25) and now measures a real +6.5bp week-1
response. Still open: the institutional-book check fires in a periodic burst (§6), plus #67
and #18.

---

## 3. Current state: real vs. formula

**Genuinely bottom-up today.** Category demand → input-output → stage 05's real auctions with
named counterparties, per-lot input provenance, real settled sales anchoring revenue, capex as
real bids; commodities linked to real producer companies; the 07b/07c/07d/07e/07f clearing
markets, which price from real demand schedules rather than quantity targets, plus the primary
market that brings new paper into them (WS8); per-bank balance sheets, real central-bank
facilities and itemized bank lending with endogenous money (G2); real government tranche issuance
against real holders, both fiscal balance sheets and the remittance loop between them (PUB); the
measured CPI and the single-owner sovereign curve; the private sector's lifecycle, sponsors
calling real LP capital and marking at the multiple the public market clears (HC); households at
corporate depth — real income statement, itemized consumer debt on named banks, real claims on
institutions, and a labor market where employment is the sum of what real employers carry (HH);
the SME tier as one pool per (region × industry) trading in every market (SEG); one settlement
layer where a payment leaving one book arrives on another (CASH); labor demand responding to
affordability (LAB); and ownership measured off the real books rather than assigned (OWN).

**Still formula-driven**, each a §4 item in that order: **four formulas whose measured
replacements already exist and sit unused** — the deficit/debt walk that rates the sovereign, the
revenue formula, the Phillips-curve wage that drives consumption, the seed-assigned rating (FRM);
**the household cross-section**, nine allocation tables standing in for the balance sheets
cohorts do not have (COH); **production and capacity decisions**, still walked between bounds — though the margin clamp
that stopped a firm reporting a loss is gone and the mechanism can now fire (CAP, §7.121); **financial firms' cost shape** — the last of what they skip. Payroll, capex and inputs are
common to every firm, loan losses are the bank's own measured rate, opening revenue is what the
opening balance sheet earns (§7.108-109), and since IND3 the operating path builds EBITDA up from
real costs — but a PROFILE may still return a stated margin, so a bank's is `0.40` (§7.122);
**the dealer system, all three of them** — the regional book copied onto four sheets, the
player-facing `Dealer` type, and a fill price computed in a React component (G3); **housing**,
priced by a drift formula between two bounds (HSG); **expectations, confidence and the savings
rate**, chained coefficient formulas (MAC); CDS, consumer credit tiers (shares AND rates
imposed) (CRD); derivatives and the formula-priced cross-currency basis (DER); default recovery
and the defaults-count-×-12bps contagion coefficient (G5); and nature — weather with no calendar
or geography stating its own impacts, and every seeded commodity price a real market price
back-solved into a "scarcity index" (NAT).

**Real but structurally undersupplied** — worth naming separately, because these are not formulas
and they still produce wrong prices. The clearing markets are honest mechanisms running on an
asset universe that does not match the money pointed at it: institutional corporate-credit
appetite ran **~6x the corporate credit that existed** (§7.18); HC Wave 1 took that to 3.8x
(§7.33) and S11 gave entities the budget constraint they never had (§7.21). The residual closes
through G2's bank book and HH1's liability inflows, and **SCALE** grows the universe itself. The
lesson stands on its own: **a correct auction over a short float still gives a wrong price, and
no work inside the auction fixes it.**

---

## 4. THE GLOBAL WORK ORDER

**This table is the only place a project's order and state live.** A project appears here once,
in the tier it belongs to; its §5 entry appears in this same order and carries the fix plan for
every finding it owns. When it closes it leaves this table for §4.1 and its §5 entry is deleted —
the substance is in §7, which is never renumbered.

**2026-08-30 RESCOPE, under rule 18.** The foundation tier was ordered around two numbers —
MAC's inflation escape and EMP's labour collapse — and rule 18 says a misbehaving number is not a
work item. Both are demoted to CONSEQUENCE rows. **The evidence for doing so is measured, not
argued:** across §7.146-163 the week-10 price print moved −25.5% → +4.3% and unemployment stopped
rising monotonically, and NOT ONE of those changes targeted either number. The largest single move
came from a unit error in the labour stage (§7.149). The foundation tier is now ordered by which
MECHANISM is missing, and the numbers are re-measured after it lands, not before.

**Earlier (2026-08-29 review, §7.100).** 90 findings, all folded into the owning project's §5
plan; three projects exist because the findings demanded them (GUARD, FRM, COH). Code comments
cite owners by NAME (`Owner: MAC`); the name is stable, the row number is not — trust the name.

Work top to bottom. Never start an item whose prereqs aren't done.

| # | Tier | Project | Why here |
|---|---|---|---|
| — | standing | **P1 — Periodicity & units sweep** | Runs alongside anything (rule 9). |
| 1 | foundation | **DIST — the distribution is the state** | **PROMOTED TO ITEM 1 (2026-08-30). Substantially delivered and the largest live mechanism row.** Done: SME pool leverage strata with both distress terms as integrals (§7.140-141), the absorbing barrier and its reinjection (§7.143), all nine §6.3-A household tables as measurements (§7.145), and **two of the four §7.157 sweep targets** — pool distress layoffs over the strata (§7.161) and the credit tiers' three one-way ratchets (§7.162). The mortgage half went to HSG (§7.159). **What remains: (a) the FOURTH one-way ratchet — cohort saving sits under a `Math.max(0,...)` so no tier can dissave (§7.163), which blocks both the savings rework and forced selling; (b) the named tier as a node of weight one, one representation at N resolutions; (c) cut-point invariance, which needs (b) to be testable.** §5-DIST-P is its governing idea and holds the primitive scoreboard. |
| 2 | foundation | **CAP — a firm can run a loss; then production and capacity** *(clamps)* | **CAP0 DONE (§7.121)** — the [2%,65%] margin clamp is gone and a firm can report a loss, so CAP's own mechanism (a firm that cannot cover unit cost STOPS) can fire. **IND13 handed it two measured defects (§6.1, §7.151):** capex covers ~0.5%/yr of a capital stock depreciating at ~8%, so the plant is being consumed several times faster than replaced; and a hard **±2%/week clamp on capacity growth** (rule 2). Both were invisible until the construction stock existed to measure them. The capacity DECISIONS are the rest. |
| 3 | foundation | **COH — cohorts accumulate: household balance sheets** | **Mostly delivered by DIST from a different direction (§7.145) — re-read §5-COH before starting; most of what it describes has happened.** What is left and what makes it item 3: the household balance sheet still cannot distinguish what is spendable now from what is accumulated, and the savings rework needs that distinction to have a buffer to be a buffer OF. Also still owns `beneficiaryLiabilityUSD`'s reversal and retiring `national-accounts.ts`. |
| 4 | foundation | **DEM — demographic variability** *(unblocks COH2, and the savings life-cycle)* | **THE AGE STRUCTURE ALREADY EXISTS AND NOTHING READS IT (§7.169).** `lifeCycleDistribution` carries four stages with `shareOfPopulation`, `savingsRate` and `consumptionMultiplier` per stage; only `RETIRED.shareOfPopulation` is ever read, and only to set a death rate. **`LifeCycleStageData.savingsRate` is read NOWHERE** — the life-cycle saving motive is present as data and binds on nothing, the fifth instance of that pattern this session. **And it should not simply be wired in: those per-stage rates are stated shape parameters** (§5-DIST-P), and the derivation is better than they are — see the row's §5 entry. | Small; takes the population-growth and migration clamps. **Promoted in substance: its AGE STRUCTURE half is what gives the household sector a life-cycle**, and a life-cycle is what makes a positive steady-state savings rate an outcome rather than a coefficient (§5-DIST-P). |
| 5 | markets | **HSG — a housing market that clears** *(clamps)* | **PROMOTED from item 10; substantially started 2026-08-30.** Done: the mortgage book is a cross-section of **vintages** each marked to today's prices, so severity is `E[f(LTV)]` and the model can have a mortgage credit event — a −20% price move now takes severity to 2.1x where the one-average book said its floor (§7.159); loans carry a **5-year fix and RESET** (17.5% of the book reprices a year) with per-vintage default frequency; and borrowing capacity is `DSTI x income / annuity factor` (§7.160). **What remains is the row's actual title: `medianHomePriceUSD` does not CLEAR.** Until it does, the affordability limit has slack it should not always have, and `HOUSING_TURNOVER_RATE_ANNUAL` is still a constant on the seller's side. |
| 6 | markets | **CRD — credit prices cleared, ratings handle zero earnings** *(clamps)* | **The household half is DONE (§7.162):** tier migration is two-way on measured delinquency, delinquency heals instead of accumulating, and the tier rate is QUOTED from that tier's own measured loss rather than drifting `+cci x k` forever. **What remains:** the ratings half (ratings handling zero earnings) and the CDS half, which needs G3. |
| 7 | foundation | **IND — industry operating models** | **CLOSED except IND16 (§7.146-156).** Kept in the table only because IND16 is open: the distribution tier, and it is a REFACTOR not an addition — a household already buys `facilities_and_logistics` as a good, so a channel margin on top would pay the same sector twice. Design in §5-IND16. |
| — | consequence | **MAC — the price level has no anchor** *(was item 1)* | **DEMOTED under rule 18, and RESCOPED.** It was "close the inflation escape", scoped against a measurement (−36% by w37) taken before ten IND slices, three root-cause fixes and a calendar. **That evidence is void and may not be inherited.** The honest row: the price level's behaviour is a SYMPTOM, its cause is one or more missing mechanisms, and every mechanism landed so far has moved it without trying. **Re-measure on a whole number of years AFTER the foundation tier, then scope.** Its saving half is DIST's item 1(a) and its confidence half needs a precautionary motive, which needs DEM's age structure. |
| — | consequence | **EMP — the labour collapse** *(was item 2)* | **DEMOTED under rule 18: this row has no build in it.** Its seed half is done (§7.118-121) and §7.149 fixed the defect that made the collapse one-directional — the hiring branch had never fired. What is left is a CRITERION ("60 weeks stable"), not a work item, so it belongs in §5's S-final validation gate rather than the work order. Nothing to start; watch it as the foundation tier lands. |
| 8 | markets | **G3 — one dealer system (all three of them)** | The regional desk copied onto four sheets, the player-facing `Dealer` priced inside a React component, and every fixed bank price the review found: underwriting fees, the wholesale spread, the deposit-beta floor, the hash-drawn lead bank, `BANK_TARGET_ROE`. Also owns the dealer-capacity half of the promoted damper defect (§6.1). |
| 9 | markets | **REPO — secured funding is a market with counterparties** | New 2026-08-29. Repo already CLEARS (`repo-clearing.ts` uses the generic engine, real reservations, the SRF as a seat) but it is not an asset class: no `AssetType`, no `ItemizedHolding`, no named counterparty, one anonymous pool per region, collateral as a scalar. Rules 3 and 14. It is also what should bound a bank's securities book, which is why OWN8's residual ceiling exists at all. |
| 10 | markets | **XB — cross-border portfolios and trade** | IN PROGRESS. **XB6** remains and owns the FX leg of the damper defect: the float is systematically one-way and the elastic side cannot absorb it. |
| 11 | markets | **HF — hedge fund strategies + prime brokerage** | Grown: speculator schedules from own capital (the FX elastic side), hedge ratios onto mandate profiles, home bias as a LIMIT not a weight, the LBO debt share as a financing outcome. |
| 12 | markets | **DER — derivatives and the people who hedge with them** | Prereq G3. Adds: the cross-currency basis becomes a cleared price, not `150 × utilization × invented split`. |
| 13 | markets | **G5 — default resolution: recovery as an outcome** | Adds: the defaults-count × 12bps contagion coefficient becomes real losses on real holders' books. |
| 14 | depth | **NAT — nature transmits, it does not impose** *(clamps)* | Re-scoped by the review: every seeded commodity price is a real market price back-solved into a "scarcity index" — the primitive becomes extraction cost and ore grade. Weather gets a calendar and a geography; two dead impact fields (14 writes, 0 reads) die; the third becomes a YIELD. |
| 15 | depth | **CAL — payment calendars** | Coupons, loan interest and dividends on real dates instead of smooth 1/52 accruals. |
| 16 | depth | **ETF2 — a real price for ETF shares** | Prereq G3. Adds: re-measure `AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY`, whose value contradicts its own comment by an order of magnitude. |
| 17 | depth | **HC3b — the product-market handover** | Prereq BP1 (done). Cheaper since SEG: the pools already sell across all 36 sub-units. |
| 18 | depth | **SCALE — universe scale-up under a wall-clock budget** | Wave 2 after IND. Owns the float half of the promoted damper defect: thin books are why prints pin. |
| 19 | depth | **MNC — multinational production** | Prereqs IND, XB. |
| 20 | depth | **CHAIN — multi-tier supply chains** | **CHAIN-D AND CHAIN-E DONE (§7.117-118, §7.120); it no longer gates the foundation tier.** The recipe-depth slice was split out and run first (user decision, 2026-08-29): mean intensity 0.164 → 0.412, harness 18 → 15, five families → two. **It did not move §7.111's ratio (0.878 → 0.879), and that is the finding** — the gross-output ratio is pinned by the DEMAND SEED (`C + I + G`, a final-demand identity with no intermediate demand in it), not by the recipes. **CHAIN-E — put intermediate demand in the seed, from the now-real recipe matrix — is the unblocking slice.** Earlier framing (§7.111, §7.116): It owns the root cause of EMP's labour collapse and the recipe depth IND3 needs, so two foundation items sit behind a depth-tier row. Prereqs BP1, IND10/11. Adds: `CONTRACTED_DEMAND_SHARE` becomes the buyer's own hedging decision. **OPEN QUESTION FOR THE USER — the table may not be reordered without asking:** promote CHAIN (or the recipe-depth slice of it) into the foundation tier beside IND, or leave items 1 and 2 parked until the depth tier is reached? |
| 21 | depth | **DYN — entry, exit, and industry structure** | Prereqs IND, BP1. Adds: the named tier's cut point falls out of the Pareto tail instead of sitting beside it. |
| 22 | depth | **PROD — firm productivity and innovation** | Prereq IND. |
| 23 | depth | **CRE — commercial property and leases** | Prereqs HH, G2 (both done). |
| 24 | depth | **TAXR — corporate tax, really** | Prereq PUB (done); MNC for the cross-border half. Adds: the model has three tax rates and no owner — the corporate one is a bare 0.21 literal policy cannot reach. |
| 25 | last | **S-final — validation gate** | Everything above. |
| 26 | last | **AU — Aurora, the UI rebuild** | Everything above. Adds: UI state moves out of `GameState`, which the determinism hash spans. |

*(clamps)* marks the survivors of the clamp-removal programme (§6.4). They are ordinary work
items in their proper tiers, not a separate track.

**Do not reorder this table without asking** — the 2026-08-30 rescope above was done on an
explicit user directive. **The sequence encodes prerequisites that are not visible from a row:** The sequence encodes prerequisites that are not all
visible from a row: a market cannot be honest before the demand side it prices against is, and a
clamp cannot be deleted before the mechanism under it exists (§6.4).

### 4.1 Closed projects

One line each. The build record and its lessons are in §7, referenced there and never renumbered.

*§7 entries written before the 2026-08-29 reorganisation point at §5 sections for projects that
have since closed (`§5-HH`, `§5-PUB`, `§5-HC`, `§5-S11`, `§5-SEG`). Those sections are gone; the
row below is their replacement, and §7 itself is left exactly as written.*

| Project | Closed | What it left standing |
|---|---|---|
| **L** — ledger integrity batch | §7.46 | Six real defects fixed; harness 5 → 4. |
| **HC** — hidden corporates | §7.33, §7.41 | ~300 named private firms per region as real `Company` objects — no parallel type. PE sponsors call real LP capital and mark at the multiple the public market clears. **Conservation is the discipline:** tier-1 firms are carved OUT of the segment aggregates, never added on top. Only HC3b remains (§4 item 19). |
| **ETF** — index funds and APs | §7.44 | 27 funds over 27 indexes; membership and weights are rules over cleared prices. **The shape later projects reuse:** an index fund posts a SIZE with no reservation level (`stages/etf-demand.ts`) — the price-insensitive schedule. |
| **HH** — the household sector | §7.60 | Households at corporate depth: real income statement, itemized consumer debt on named banks, real claims on institutions, a labor market where employment is the sum of what real employers carry. Its two open remainders are §6 rows (occupational mismatch; the income anchor). |
| **PUB** — treasury + central bank | §7.68 | Both balance sheets real and the remittance loop closed between them; the CB is a real bidder placing an open-market ORDER that 07c/07f price. Its remainder is a §6 watch (sovereign elasticity to a size-only bidder) and the spending PATH still being a formula. |
| **BP1** — industry registry + rule 17 | §7.83–84 | `INDUSTRY_REGISTRY` as the one data source and `PROFILE_REGISTRY` as the one behavior dispatch — the structures rule 17 requires. Everything in IND and the depth tier writes registry fields or profile modules. |
| **XB5** — central-bank FX reserves | §7.77 | Reserves are a real asset that intervention spends; a CB at zero cannot defend. **Named and left:** the USD is the numéraire so its own excess demand is never checked; there are outright forwards but no FX SWAPS (the instrument the cross-currency basis lives in); and no sovereign wealth fund as a distinct reserve manager. |
| **WS9** — real trade & FX | absorbed into XB | The FX rate clears from real net currency demand; the drift formula and its UIP sign bug are gone. |
| **SEG** — the SME tier, keyed to the registry | §7.95–97 | One pool per (region × industry) trading in every market, on the settlement rail. Harness 59 → 36. Its two deliberate omissions are §6.1 rows. |
| **LAB** — labor demand, and the wage as a price | §6.4 project 1 | Harness 405 → 88; seven clamps out. Exposed the §6.1 seed-employment row. |
| **OWN** — ownership is an outcome | §7.98 | Ownership is measured off the real books; no engine file reads a share to decide anything. OWN7 (§7.104) closed what it exposed. |
| **OWN8** — the ceiling that was an identity | §7.102 | The repo market went from zero volume to live (46.7B, 3 of 4 USA banks borrowing, the SRF drawn). **A bound on a securities book must be a bound on its FUNDING** — the interim capital ceiling stands until REPO replaces it. Found by a user question, not by the harness: a market that clears nothing satisfies every check written about its price. |
| **FRM** — the formulas that outlived their mechanisms | §7.106 | Four deleted, no new mechanism. The sovereign is rated off its own measured debt ratio and deficit; government revenue carries the measurement forward; consumption and confidence read the wage households are actually paid; the opening rating is derived, not assigned (four real-world labels out, rule 4). **Left standing on purpose:** the fiscal-stance step function, which needs a government that reads its own budget — MAC's. |
| **GUARD** — silent failures become loud | §7.105 | Five silent defaults throw at the read (`domain/defect.ts`); the UI renders an em dash. **Two were hiding live bugs** — no seeded company carried a `listingStatus`, and a merger's consolidated tranche lost its call protection AND its bank-facility flag, recreating the G2 double-count inside 07d's float. Three dead stage-01 outputs deleted with a full-universe weekly sweep. Three new invariants: category shares sum to one, a market with a funded borrower must clear non-zero volume (measured by the session, not the closing balances), and a holding ceiling must be able to exceed its own position. |
| **OWN7** — the corporate over-holding | §7.104 | Harness 602 → 107. **A float is what the participants in THIS book can hold between them** — not the whole issue, because a holder that does not bid keeps its position. Ownership is now measured, keyed by issuer, and conserved; the one remaining over-hold is a defaulted issuer's paper, which is G5's. |
| **IDX** — an index is a statistic | §7.134 | The published index is the cap-weighted move of its own constituents with **no bound**, the $0.10 stock-price floor is gone, **beta is measured** off each name's cleared returns against its own region's index, and every published name is generated — five real index brands and four central banks deleted (rule 4). Sector sub-indices filter to `listed` like the regional ones, closing a latent double-count. |
| **CASH** — one settlement layer | §7.87–89, §7.91–93, §7.103 | Stages do not move money; they record an instruction and one stage executes them. Money is a named bank's liability, a loan creates a deposit, the cleared books settle through a clearing house, and the per-bank identity is the gate that holds every week. **What is left is a boundary with a size and an owner, not a leak:** `dealer inventory` (G3), `primary distribution`/`primary proceeds` (WS8), `commercial paper` (no cleared book yet), and `non-auction operating receipts` — the true edge of the modelled world. |

---

## 5. Detailed work instructions

One section per open §4 item, **in §4's order**, each carrying the fix plan for every review
finding it owns (§7.100). A closed project has no section here — its record is in §7, its
one-line legacy in §4.1.

### P1 — Periodicity & units audit, and the MoM/YoY display convention  *(standing)*

**Not a phase — a standing sweep.** Rule 9 states the discipline; this is the pass that brings
existing code up to it, done incrementally alongside whatever is in flight. Every defect of this
shape found so far was invisible until someone traced the number to its source, so the work is
mechanical rather than clever.

**Engine side.** Walk every rate, growth figure, flow and index and confirm its period at the
source. Rename to carry the period where the name is ambiguous (`governmentSpendingUSD` is
weekly and reads annual; `demandLevelUSD` is annual and reads weekly; `wageGrowth`, `gdpGrowth`,
`demandGrowthAnnual`, `m2GrowthRateAnnualized` are all different conventions in neighbouring
lines). Known open: `clearedInputPriceIndex` measures week-over-week but is read as a level
versus baseline; `historicalInflation` and `historicalZeroCurves` are appended in stage 02 and
so lag the measurement stages by a week — consistent, but undocumented at every read site.

**Display side.** One shared presentation helper, every changing figure routed through it, so the
rule cannot be re-litigated per component: show **MoM and YoY together** where history allows;
show **the level**, never a change extrapolated from a partial window; label the period on the
figure itself, never only in prose. Start with StatusBar, EconomyDashboard, WorldScreen,
CompanyDeepDive's TapToChart rows and InteractiveChartModal, with `formatters.ts` as the helper's
home. Aurora inherits the convention rather than re-inventing it.

---

### MAC — The price level has no anchor  *(CONSEQUENCE row, demoted under rule 18 2026-08-30)*

**READ THIS BEFORE SCOPING ANYTHING BELOW.** This row was item 1 and was scoped around a
measurement — inflation −0.5% → −36% by w37, unemployment following to ~40% — taken before ten
IND slices, three root-cause fixes and a calendar. **That evidence is VOID and may not be
inherited** (rule 18). Across §7.146-163 the week-10 print moved −25.5% → +4.3% with nothing
targeting it, and the largest single move was a UNIT ERROR in the labour stage (§7.149). Re-measure
on a whole number of years after the foundation tier, then scope. The saving half is DIST's; the
confidence half needs a precautionary motive, which needs DEM's age structure. Everything below is
the OLD scope, kept for its findings, not for its ordering:

**Why this is item 1 now.** G1b stopped being a watch item and became the thing every horizon run
prints. Measured over a 60-week run, both in the current tree and in the pre-CHAIN one at the same
seed: **inflation −0.5% → −36% by week 37, with unemployment following it to ~40%.** The two move
together and monotonically, because a firm whose nominal revenue falls 30% is below its cost of
capital however its headcount was derived — which is why EMP cannot close behind it (§7.118,
§7.121) and why it outranks everything that used to sit above it. It is **not** CHAIN's and not
new: the pre-CHAIN tree escapes harder and earlier at every checkpoint.

**Narrowed by the 2026-08-29 reorganisation:** FRM (closed, §7.106) took the fiscal formulas and the
Phillips-curve wage; COH (item 3) took the household cross-section. What remains is expectations
and policy behaviour.

**Clamps it deletes:** expected inflation [−20%, +50%], Taylor output/inflation gaps ±10%, the
0.20 policy-rate ceiling, effective tax rate [10%, 50%], consumer confidence [30, 170], and the
savings cap at 90% of disposable income.

**Kept, and not a clamp:** the effective lower bound. A posted policy floor is the real-world
mechanism — rule 1's named exception, the same standing as the SRF/ON RRP corridor. The 0.20
ceiling has no such counterpart.

Three parts, in order.

- **(a) Close the §6 inflation escape (G1b) at its root.** These bounds exist to survive it.
  Deleting them first just moves where the runaway prints.
- **(b) Confidence and the savings rate become OUTCOMES.** The review showed the two are a
  CHAINED formula pair whose largest input is the wage formula FRM deletes:
  `cciEquilibrium = 100 + wageGap×150 − unempGap×200 − inflGap×80 + shock×1000` feeds
  `savings = 0.05 + inflGap×0.5 − 0.1×cciGap + realRateGap×0.4` feeds consumption. After COH,
  saving is what cohorts do not spend out of real budgets, and confidence is a reported statistic
  read off measured unemployment and real income — a number the UI shows, not a driver anything
  multiplies.
- **(c) Policy becomes a reaction to real state.** The fiscal-stance step function (+0.15 in a
  labelled recession above 7% unemployment, −0.10 in a labelled expansion, ×0.95 decay — five
  invented numbers on a regime label) is replaced by a government reading its own measured budget
  position and unemployment: stimulus when slack is real and its own debt service leaves room,
  consolidation when it does not. The effective tax rate's [10%, 50%] band goes with it — the
  rate is a policy CHOICE with a real base, not a drifting clamped scalar.

**Verify (once, at close):** the policy rate is unbounded above and floors only at the ELB; the
savings rate is a residual of real spending; confidence is derived, read by nothing that decides;
the stance responds to the budget position stage 11 measures.

---

### EMP — The labour collapse  *(CONSEQUENCE row; no build in it — demoted 2026-08-30)*

**There is nothing to start here.** The seed half is done (§7.118-121) and §7.149 fixed the defect
that made the collapse one-directional: the hiring branch §7.109 built had never once fired,
because the level path divided this week's revenue by the SEED's revenue per head. What remains is
a CRITERION — 60 weeks stable — which belongs to S-final's validation gate, not the work order.

**The seed half is done and the ten-week symptom is gone.** Unemployment runs 20.3% → 30.0% over
ten weeks, in band in all four regions in every week, against 10.5/25.7/17.9/23.5% at seed before
(§7.121). §7.111's two impossible sector ratios — Consumer 0.92x and Industrials 0.93x, gross
output BELOW value added — are 1.42x and 1.30x. The three seed employment primitives agree because
the invented one was deleted, not reconciled (§7.119).

**What fixed it, and it was none of the things this section originally proposed.** The labour
market's own two symmetries (§7.110) were real defects and stand. Everything else came from
upstream: intermediate demand exists (§7.118), headcount is value added over productivity for all
three tiers through one function (§7.119), the C+I+G identity is solved where it is actually read,
and the tiers partition demand instead of each claiming a share of it (§7.120). **Read §7.117
before §7.111** — it names the wrong owner, and the correction is the lesson.

**What blocks the rest: item 1.** The stated criterion is 60 weeks stable, and at horizon the
deflation spiral still takes employment with it — inflation −0.5% → −36% by w37 with unemployment
following to ~40%, measured in BOTH the pre-CHAIN tree and the current one. A firm whose nominal
revenue falls 30% is below its cost of capital however its headcount was derived. **Nothing in
this section is startable until G1b closes**, and no coefficient here may be tuned to hide it
(§6.4).

**Verify:** unemployment stable or mean-reverting over 60 weeks with no band widened; the
affordability trip count a small minority of firms, not a sixth of employment; the wage index
moves in response to slack.

---

### IND — Industry operating models  *(CLOSED except IND16 — §7.146-156)*

**Closed: every slice but one. The record is §7.108-156 and is not repeated here.** What
follows is the only open slice.

**IND16 — The distribution tier.  *(THE ONE IND SLICE STILL OPEN — designed 2026-08-30, NOT
built, and the reason it was not built is the finding.)*** Wholesale/retail between the factory
gate and the final buyer: a margin chain, minimum order sizes, local stocking — the rest of §6's
logistics-share gap.

**THE TRAP, found while scoping it.** A household today buys `facilities_and_logistics` AS A GOOD,
out of its own buyer-mix share, in that good's own book. So the distribution service is already
sold, priced and paid for — once. Adding a channel margin on top of every other good would credit
the same sector for the same work TWICE (rule 3), and it would not be visible: both numbers would
look like real revenue with a real payer. **IND16 is therefore a REFACTOR, not an addition** —
the household's distribution spend has to MOVE out of that book and onto the goods it is actually
spent distributing — and half-building it is worse than not starting.

**The design, so the next pass does not re-derive it.** The margin should be an OUTCOME of the
good's own physics, not a stated per-category rate (rule 13): the channel holds
`min(shelfLifeWeeks, channel cover)` weeks of stock, and what that costs per dollar is
`annualCarryingCostRateOf(unitId) + the region's own short rate`, pro-rated. Both terms already
exist and both already encode value density and spoilage — a dollar of gravel costs more to move
and hold than a dollar of watches, and a dairy cannot stock a quarter's cover at any price. The
household then bids the FACTORY-GATE price its willingness-to-pay leaves after the channel takes
its cut, which is the real transmission: a costly channel means less reaches the producer.
Minimum order sizes and local stocking follow the same stock. Prereq: nothing new; the blocker is
the refactor above, not the mechanism.

**IND17 — Prepayments and deposits.** The other sign of IND2's deferred revenue: customers pay
ahead (progress payments, annual subscriptions) — negative working capital as a real funding
source, with the obligation on the seller's book.

**IND18 — Seasonality.** Registry profiles for production (harvests) and demand (retail peaks);
what makes commodity storage and the classical inventory cycle real rather than flat.

**IND19 — Corporates buy insurance.** Property and business-interruption premiums paid to the
real insurers; a loss event has a payer on both sides. Small; connects two sectors that already
exist.

**Verify:** a software firm holds no inventory and carries no inventory cost; a subscription
business's revenue survives a quarter with no new sales while a unit seller's does not; operating
leverage differs measurably across industries in the same downturn; gross margins disperse by
industry the way real ones do.

**Folded from the 2026-08-29 review — four findings, with fixes:**

- **IND-R1 (do first — an active accounting error, rule 14): banks pay no wages.** The labor
  market hires and fires bank staff and counts them in unemployment, but `weeklyPayrollUSD` lives
  inside the operating branch banks skip, so no payroll hits bank EBITDA and no wage instruction
  is ever posted — headcount with no wage leg, inflating measured employment against measured
  income. Fix: payroll, capex and input purchases become COMMON to every firm (computed before
  the profile dispatch); a profile varies only the revenue mechanism and cost shape, per rule 17.
- **IND-R2: 40 financial firms supply enterprise software into the goods auction.**
  `FINANCIAL_SECTOR_PROXY_LINES` gives every Financials/Banks firm an `enterprise_software`
  product line as a revenue proxy, and a product line is what registers a supplier in stage 05's
  index (no entity-type filter — correctly, per rule 17; the DATA is wrong). Measured at seed:
  276 suppliers, 16 banks + 24 institutions among them, category shares summing to **646%**
  against 400% for every other category — the real software firms diluted ~62%, and the supply
  invisible to the sellers' own P&L. Fix: delete the proxy lines; financial revenue comes from
  the profiles (which is what they are for); GUARD's share-sum invariant keeps it fixed.
- **IND-R3: one consumption intensity for every good.** `HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY =
  0.02` for all 36 sub-units means a household consumes as many units of aerospace as of food,
  every baseline price lands at ~$70k, a "unit" is an abstract bundle — **and the CPI basket
  inherits weights with no relative quantities in them**. Fix: per-good consumption intensity on
  the registry entry (`SubUnitSpec`), beside the physics it already carries.
- **IND-R4: cost structures are stated, so no firm can be better run than another.** Sector
  EBITDA margins (`SECTOR_PROFILE.margin`, at recognisably real levels), `INSURER_EXPENSE_RATIO
  = 0.20` for every insurer, `CARD_OPERATING_COST_BPS = 500` for every bank's card book. Fix:
  IND2/IND3's cost-shape profiles make margin an OUTCOME of the recipe, payroll and scale the
  firm actually has; the flat ratios die with the branch that reads them.

---

### CAP — A firm can run a loss; then production and capacity decisions  *(item 2, clamp programme)*

**IND13 handed this row two MEASURED defects it did not have before (§6.1, §7.151), and they are
the first things in it:** capex covers ~0.5%/yr of a capital stock depreciating at ~8%, so the
plant is being consumed several times faster than it is replaced; and `05-unit-bidding.ts` carries
a hard **±2%/week clamp on capacity growth** (rule 2), which is doing the work the investment
decision should do. Neither was visible until IND13's construction stock existed to measure them.

**CAP0 IS DONE (§7.121) — the clamp that gated this whole project is gone.** `08`'s
`[2%, 65%]` EBITDA-margin band and its `[4%, 65%]` target twin were deleted with IND3, because a
margin that is the residual of real costs needs no band. **A firm can report an operating loss
now**, so CAP's own mechanism can finally fire; what remains is that mechanism and the capacity
decisions, not the clamp. Original framing: `08:451-452` holds every firm's EBITDA margin inside **[2%, 65%]** — so no firm can
report a loss at the EBITDA line, and together with the cost rate held in [0.40, 0.98] (`05:505`)
the margin is bounded away from zero from two directions at once. Until a firm can run a loss,
"a firm that cannot cover unit cost stops producing" has nothing to decide on. **CAP0 removes the
margin clamp and the cost-rate clamp together with the real cost accounting that replaces them**
(the per-lot input provenance already prices inputs; payroll is already a real line since LAB).

**Clamps it then deletes:** production throttle [0.3, 1.0] and production response ×[0.5, 2.0]
(`05:469,471`), capacity growth ±2%/wk (`05:496`), the growth-capex floor `max(0.4, …)` whose own
comment calls it "realistic, not zero" (`08:675`), the SME pool offer floor at half the reference
price (`05:572`), and the input-supply-constraint floor of 0.3 (`05:431`) — a firm whose inputs
are rationed to nothing must be able to stop.

**The mechanism.** A firm decides how much to make from its own numbers: its inventory position,
the cleared price against its own MEASURED unit cost (it already carries per-lot input provenance,
so it knows what its inputs actually cost), and its cash. A firm that cannot cover unit cost
**stops producing** rather than throttling to 30% — that is the decision the throttle is standing
in for, and it is the one that makes exit possible (DYN later reads it).

Capacity stops being a rate that is walked and clamped: it is DERIVED from PP&E, which IND1
already grows by DELIVERED capex. Investment is already supply-constrained; capacity should
simply read the result.

**Also from the review, same subject:**
- **`CAPEX_PUBLIC_SUPPLY_SHARE = 0.65`** (`market-microstructure.ts`) routes two-thirds of every
  capex category to public firms by constant. Both tiers bid in the same auction since SEG — let
  them compete on price and the split is the RESULT. Delete the constant.
- **The carrier's offer floor omits capital** (`domain/carrier.ts`): fuel + crew only, so a
  balanced freight market clears where no carrier can ever replace a ship. The floor a supplier
  posts includes the capital charge on the asset that does the work — same arithmetic LAB
  already runs for labor (cost of capital on net PP&E).
- **Watch:** the seed opens every category at inventory = 10% of annual demand
  (`createSeedCategoryDemandState`). Once production is a real decision, check whether 10% is
  what the decision would hold.

**Verify:** a loss-making firm reports the loss and stops rather than throttles; capacity moves
only when capex is delivered; no production decision reads a bound; the public/SME capex split
moves week to week.

---

### DEM — Demographic variability  *(item 4; takes the population-growth and migration clamps)*

**Its AGE STRUCTURE half matters more than its size suggests.** A life-cycle — young cohorts
accumulating, old ones drawing down — is what makes a positive steady-state savings rate an
OUTCOME rather than a coefficient (§5-DIST-P). Without it, saving has no motive that survives a
stationary economy, which is the wall §7.158 hit.

The four regions currently share near-identical population dynamics: birth ~1.0%, death ~0.9%,
migration ~0.2%, all constants, all alike — so populations differ only by their seeded level and
every demographic-sensitive number (labor supply, housing turnover, pension outflows) moves in
lockstep across regions. Real regions differ in KIND: Japan shrinks and ages, the USA grows
mostly by migration, Europe sits near zero with an aging bulge, the UK in between.

- **Per-region demographic profiles**, seeded from real-world shapes: distinct birth/death/
  migration baselines per region, plus slow stochastic variation through `rng.ts` (fertility
  drift, migration waves) — variability BETWEEN regions and OVER time, not a re-rolled weekly
  noise term. The existing `migrationAttractivenessSignal` (CCI-driven) stays as the endogenous
  half; widen it to read relative regional performance so booms genuinely pull people in.
- **Age structure that does something.** `lifeCycleDistribution` exists and drifts; make the
  dependency ratio it implies drive labor-force participation and the pension system HH1c built
  (benefit outflows scale with the retired share, contributions with the working share — Japan's
  pension funding need should look worse than the USA's because its population does).
- **Housing reads demographics**: household formation (population / household size) already
  drives HH2's stock and HH3's mortgage demand — variability here propagates for free.

**Verify:** population paths visibly diverge by region over 260 weeks; JPN dependency ratio
worsens while USA's holds; pension funding need (the derived hurdle from §7.52) responds to the
retired share; no demographic number re-rolls weekly.

---

### DIST — The distribution is the state  *(ITEM 1 — promoted 2026-08-30; substantially delivered)*

**Delivered:** pool leverage strata with both distress terms as integrals (§7.140-141); the
absorbing barrier and its reinjection (§7.143); all nine §6.3-A household tables as measurements
(§7.145); and two of the four §7.157 sweep targets — pool distress layoffs over the strata
(§7.161) and the credit tiers' three one-way ratchets (§7.162). The mortgage target went to HSG
(§7.159-160).

**WHAT REMAINS, in order:**
**(a) THE FOURTH ONE-WAY RATCHET.** Cohort saving is `disp x tierRate x lambda` under a
`Math.max(0,...)`, so **no tier can ever dissave** (§7.163). This blocks the savings rework AND
forced selling, which has nothing to trigger on until a drawdown is possible. Household liquidity
is 23.7 weeks of committed outflow — a threshold a real shock crosses — so the trigger is sound
once dissaving exists. **Re-diagnose the §7.158 stash rather than trusting its stated cause,
which §7.163 withdrew.**
**(b) The named tier as a node of weight one** — one representation at N resolutions.
**(c) Cut-point invariance**, which needs (b) to be testable.

**§5-DIST-P is this row's governing idea** and holds the primitive scoreboard.

**Origin: a user question, 2026-08-29 — "the household and SME sector is massive and ultimately
impossible to model bottom up. Is there a way to model it statistically, the way physics does?"**
Recorded here because the answer is a REPRESENTATION, and a representation gets more expensive to
change with every mechanism built on the old one. **Nothing below is scheduled. §4 may not be
resequenced without asking, and the priority question has a one-day measurement attached (bottom
of this section) that should settle it before anyone argues about the slot.**

**THE PRINCIPLE, AND IT IS THE WHOLE DESIGN.** Coarse-graining is EXACT when the decision being
aggregated is linear in what you average over, and wrong the moment it is not: `E[f(x)] = f(E[x])`
only for affine `f`. So **carry a moment of the distribution only where a decision is nonlinear in
it**; everywhere else the pool's mean is a sufficient statistic and a pool is not an approximation
at all. Every nonlinearity in this model is a threshold: default (leverage/coverage crossing a
line), the borrowing constraint (binds or does not), MPC (concave in wealth — the share AT the
constraint sets the aggregate, not the mean), and the labour affordability rule.

**§7.109 IS AN INSTANCE OF THIS, DISCOVERED THE HARD WAY.** Its own words: *"the solve is
aggregate; the constraint binds per firm. An aggregate placed exactly ON the threshold puts
roughly half the distribution below it."* That is `E[f(x)] ≠ f(E[x])` with `f` a step function,
found empirically after it had already cost a project. The model has been paying for a mean where
it needed a distribution.

**THE REPRESENTATION: weighted macro-agents.** Plasma physics simulates 10^20 electrons with 10^6
weighted super-particles coupled through a field solved on a grid (particle-in-cell). Here the
field is the price vector and the grid is the clearing engine. A pool becomes **K weighted
constituents (K ~ 10-20), each a real `Company` or household object carrying a population weight**.
- **A named entity is a node of weight one.** Named tier and pool are ONE scheme at two
  resolutions, not two types — which is rule 3, and it makes IND-R6's failure mode
  (§7.115: a second code path that silently eats every change) structurally impossible rather
  than something to stay vigilant about.
- **Nonlinear decisions integrate correctly**: `f` evaluated at K points and weighted, not `f` at
  the mean. A mean-preserving spread in pool leverage then CAUSES defaults, which is the
  mechanism of a credit cycle and is currently unrepresentable.
- Cost is a few hundred objects, not tens of thousands.

**TWO KINDS OF MOTION, AND CONFLATING THEM IS THE IMPLEMENTATION TRAP.**
- **Continuous dimensions: the node MOVES.** Wealth or firm size changes; the node slides through
  state space carrying its weight.
- **Discrete dimensions: WEIGHT FLOWS between nodes.** A household does not become unemployed —
  mass transfers from an employed node to an unemployed one at the same wealth.
- **The second is a rule-14 flow and the model does not currently have it as one.** Weight moving
  employed → unemployed is the OTHER LEG of a named firm's layoff, and it must be the same number
  in the same pass. Two representations of one quantity is rule 3.
- **Duration cheaply:** long-term unemployment has a different re-employment hazard and a
  different consumption path. Do not add a continuous duration dimension — add discrete states
  (employed / short-term / long-term) and let weight flow. Non-exponential durations out of a
  Markov chain by adding states; two states buys most of the realism at no dimensional cost.

**NODE PLACEMENT IS DERIVED, NOT CHOSEN.** Quadrature on a fitted lognormal would presuppose the
family, and rule 13 says the distribution is an OUTCOME. Use stratification, and allocate nodes
in proportion to `stratum population × within-stratum dispersion of what is being aggregated`
(Neyman). For a Pareto sector the aggregate is tail-dominated, so **the allocation rule itself
tells you to put nodes in the tail** — nobody chooses to over-resolve it.
- **DYN's cut point falls out of this.** Refine strata until one contains a single firm and you
  have a named firm. **The cut is where the allocation rule says a stratum needs one node per
  constituent** — which is exactly DYN's "the cut point falls out of the Pareto tail instead of
  sitting beside it", answered by the representation rather than by a rule.
- **Dimensionality has a cheap answer:** stratify ONLY on dimensions that gate a nonlinearity;
  carry everything else as an ATTRIBUTE on the node, which costs nothing.

**THE TWO SECTORS ARE THE SAME OBJECT WITH DIFFERENT BOUNDARIES.** Both are multiplicative
accumulation with a barrier — which is what generates the power laws the seed currently DRAWS.
- **Households hit a REFLECTING barrier** (the borrowing constraint): you bounce off and stay in
  the population. **In this model that barrier is currently a CLAMP**, which is why it sits on
  §6.4's list. A reflecting barrier is not a clamp — it is a mechanism with a second leg: a
  household at the constraint cannot borrow, so a NAMED BANK does not lend, so a loan does not
  appear on its book. Rule 2 and rule 14 in one move.
- **SMEs hit an ABSORBING barrier** (default/exit) **with reinjection at the bottom** (entry) —
  which is what makes a firm distribution Zipf rather than lognormal.
- **Design the absorbing barrier FIRST: it is where every ledger bug in this scheme will live.**
  When a node defaults its weight must go somewhere (exit, acquirer, entry) and its debt must land
  as a realised loss on a named bank's book IN THE SAME PASS. G5 is the same problem for named
  firms and should be the same code.

**THIS REDESIGNS COH RATHER THAN COMPETING WITH IT.** COH's plan is to give a cohort a balance
sheet. **Give it a DISTRIBUTION over balance sheets instead, with the aggregate as its first
moment.** Then run wealth as the accumulation it already wants to be — drift `(income −
consumption)`, diffusion from idiosyncratic income and return risk, the constraint as a reflecting
barrier. **Random growth against a barrier has a power-law-tailed stationary distribution by
construction**, so the shape is DERIVED from the mechanism instead of imposed by nine tables, and
it is rule-4 clean because no exponent is fitted — the tail is an outcome, not a datum.
- **Households need the liquid/illiquid split, and it is not optional.** The high-illiquid /
  zero-liquid household is why single-asset models get aggregate MPC badly wrong. The asset
  categories already exist (HH gave households itemized debt on named banks and real claims on
  institutions); this splits a dimension the model carries, it does not invent one.

**WHAT IT KILLS ELSEWHERE — all current rows, none of it speculative.**
- **MAC's savings rate** becomes an integral over node behaviour: an outcome by construction,
  with nothing left to impose.
- **CRD's consumer credit tiers** ("shares AND rates imposed"): a tier IS a stratum, its share is
  the mass in it, its rate is what clears against that mass's schedule.
- **HSG's demand side**: housing is the illiquid asset, the mortgage constraint is the reflecting
  barrier, and household housing demand becomes a real schedule out of node heterogeneity rather
  than a drift formula between two bounds.
- **HH's occupational-mismatch remainder**: occupation as a node attribute makes mismatch a real
  matching problem over masses instead of a residual.
- **DYN's cut point**, above.

**AND THE ARGUMENT THAT MAY MATTER MOST — DISPERSION IS THE SLOPE OF A DEMAND CURVE.** The
clearing engine takes SCHEDULES. A pool with no dispersion posts one step, effectively vertical.
K dispersed nodes post K schedules whose sum is a smooth aggregate curve. **So thin books, pinned
prints and §6.1's "the books print their dampers" are partly a RESOLUTION problem, not an
entity-count problem** — and SCALE's premise is that depth requires more entities. Some of that
depth is available at 10-20 nodes per pool instead of tens of thousands of firms. **Measure this
before committing SCALE's wall-clock budget.**

**GRANULARITY COMES OUT DERIVED, NOT TUNED.** A node standing for `n = N/K` constituents carries
idiosyncratic noise of relative size `~(1/√n) × within-node dispersion`. Tail nodes have small `n`
and are therefore noisy — which reproduces granular aggregate volatility FROM THE REPRESENTATION
rather than adding it as a parameter. Both inputs are measured, so rule 4 holds.

**WHAT BREAKS — design against these, do not discover them at week 40.**
- **Rank-K copulas.** Within a node every attribute is perfectly correlated, so K nodes give a
  rank-K approximation of the joint. Stratify on what INTERACTS, not on what is individually
  interesting. This is a real ceiling, not a tuning knob.
- **Threshold artifacts.** A whole node crosses a default line at once, so aggregates step by
  `1/K`. **Do not smooth the decision rule to hide it** — that buries the nonlinearity the scheme
  exists to capture. Choose K from the size of the effect to be resolved, and state it.
- **Node degeneracy.** Weight concentrates on one node and resolution collapses (the particle-
  filter disease). Periodic re-stratification, planned in from the start.
- **Household employment diversification is a consequential modelling choice.** A node holding
  fractional employment across every firm is perfectly diversified, and the correlation between
  "my employer failed" and "I lost my job" vanishes — which is what carries a sectoral shock into
  consumption. Stratifying partly on employer-industry keeps it. **This fails SILENTLY: nothing
  looks broken, the model is merely too stable.**

**Verify — the first two are worth more than the rest:**
1. **Aggregation exactness as a bug detector.** For any decision that is genuinely linear, `K=1`
   and `K=20` must give IDENTICAL aggregates. Divergence means something believed linear is not,
   and names which mechanism. Cheap, sharp, and the first thing to write.
2. **Seed flat, get a fat tail.** Initialise every node at equal wealth/size and the stationary
   distribution must develop a power-law tail on its own. If it stays flat the accumulation
   mechanism has no multiplicative structure and no amount of resolution will save it. This is
   §7.4's "seed by the engine's own code" applied to a DISTRIBUTION.
3. **K-convergence**: aggregates stop moving as K grows.
4. **Cut-point invariance**: name 200 firms instead of 300 and aggregates do not move (the
   resolved/subgrid discipline; HC's carve-out already gives the conservation half).
5. **Conservation**: node weights sum to the population, and the carve-out never double-counts.

**THE MEASUREMENT THAT DECIDES ITS PRIORITY — a day, and it should happen before the argument.**
For each pool, measure the within-pool dispersion of leverage, margin and size, and **the share of
constituent mass sitting within ~10% of each threshold** (default, borrowing constraint, labour
affordability). If the mass near the thresholds is thin, this scheme buys little and belongs in the
depth tier. If it is thick — which §7.109 found for the NAMED tier, where 89% of employment sat
below the aggregate index — then dispersion is already driving aggregate outcomes invisibly, and
this is the highest-value structural project on the board. **Rule 10: measure it, do not argue it.**

**Recommended placement, for the user's decision (§4 may not be resequenced without asking):**
NOT first — and the reason has changed shape rather than gone away. It was "item 1's defect is a
LEVEL fix and this is a RESOLUTION fix"; the level fix has since landed (§7.118-121), and item 1 is
now the inflation escape, which is a DYNAMICS defect that no amount of resolution touches either.
The rule survives both: resolving a distribution whose location or trajectory is wrong buys a
beautifully-resolved wrong answer, and invites tuning the distribution to fix it, which §6.4
forbids. **Its prerequisite is now met** — IND-R6 delivered the one firm model DIST extends from
two tiers to N resolutions — so it should land **before COH (item 3), which it redesigns, and
before SCALE and DYN, whose premises it changes** — and it interacts with CAP, since "a firm can run a loss" is another threshold and
profitability dispersion is exactly what makes it bite. Proposed: with or just after CAP.

---

### COH — Cohorts accumulate: household balance sheets  *(item 3)*

**MOSTLY DELIVERED BY DIST FROM A DIFFERENT DIRECTION (§7.145) — re-read what follows before
starting; most of it has happened.** What is left, and what makes it item 3: the household balance
sheet still cannot distinguish what is SPENDABLE NOW from what is ACCUMULATED, and a buffer rule
needs that distinction to have something to be a buffer of. Also still owns `beneficiaryLiabilityUSD`'s
reversal and retiring `national-accounts.ts`.

**SETTLED 2026-08-30: DIST won, and it is item 1.** The question below — whether to give a cohort a
balance sheet or a DISTRIBUTION over balance sheets — was answered by building the second: §7.145
turned all nine tables into measurements from the distribution's own moments. **COH1 is therefore
mostly done.** What remains of it is the spendable/accumulated split. **COH2 IS BLOCKED ON DEM**, a
prerequisite this table does not show: its own text requires that "a cohort has an age via DEM".
So the real order inside this row is COH1-remainder → DEM → COH2.

**AND `TIER_OCCUPATION_MIXES` IS NOT A PRIMITIVE**, whatever the paragraph below says. §5-DIST-P
places it as the largest stated block with no owner: a wealth tier's occupation mix is an OUTCOME
of who got hired into what and who accumulated from it, not a structural fact. The line below
predates that argument.

**The original framing follows.** §5-DIST proposed redesigning this project, not competing with it. COH's plan
is to give a cohort a balance sheet; DIST's argument is to give it a DISTRIBUTION over balance
sheets with the aggregate as its first moment, so the nine tables below become the SHAPE of that
distribution and the shape becomes an outcome of random growth against the borrowing constraint
rather than nine imposed allocations. If that argument is accepted, this section is rewritten
rather than executed. **Undecided; do not start COH without settling it.**

**The reframing that creates this project (§7.100).** §6.3-A lists nine imposed distribution
tables in `macro/household-cohorts.ts` — occupation mixes, wage/tax multipliers, transfer and
debt-service weights, spend mix, balance-sheet weights ("US SCF-shaped", an imported real-world
equilibrium), wealth MPC ("what the empirical literature finds"). Treating them as nine
primitives to argue about hides that they are **one missing mechanism: cohorts have no balance
sheets** — `HouseholdCohort`'s own doc says so — so the cross-section must be ALLOCATED every
week rather than ACCUMULATED. The pieces to derive it all now exist.

**COH1 — a cohort owns what it accumulated.** Give each of the ~20 (occupation × tier) cohorts a
real balance sheet: deposits are its own accumulated savings flow (settlement already measures
household receipts), equity is what the register attributes (OWN4's name-by-name residual plus
ETF shares), housing is HSG's buyer-side stock, consumer debt is its slice of HH3's itemized
pools serviced out of its own budget. The aggregate `householdState` becomes the SUM of cohort
sheets — one representation. **Eight of the nine tables become measurements** and are deleted as
each line becomes real; `TIER_OCCUPATION_MIXES` (who works where) survives as the one genuine
structural primitive.

**COH2 — claims run from households TO institutions, and the last seed share dies.** Reverse
`beneficiaryLiabilityUSD = totalAssetsUSD − equityCapitalUSD` (the review's root-cause finding:
in reality a pension fund is as big as the entitlements it owes). Pension contributions become
what working cohorts pay in (deleting `PENSION_CONTRIBUTION_RATE` as a flat rate — a cohort has
an age via DEM), benefits what retired cohorts draw, and the entitlement stock accumulates from
those real flows. An institution's size is then anchored on what it OWES — which is what finally
retires `INSTITUTIONAL_OPENING_BOOK_SHARE` (§6.1's named gap from OWN6).

**COH3 — retire `bootstrap/national-accounts.ts`.** Its own header states its exit condition —
"replaced by the flows themselves" once households are real agents — and the condition is met
(HH closed §7.60; income is a measured sum §7.96). The identity assert, the disposable-income
fallback, and `LABOR_SHARE_OF_OUTPUT` setting the wage LEVEL all go; the wage level anchors on
each firm's own value added (LAB's affordability machinery already prices it). This closes §6.1's
"household income: top-down statistic vs bottom-up sum" row at the root.

**COH4 — demand behaviour falls out of budgets.** The household bid premium
(`HOUSEHOLD_BID_PREMIUM_BY_TIER` — invented elasticities 2.5/1.0/0.35) and `TIER_WEALTH_MPC`
become consequences of cohort budget constraints: a cohort near subsistence pays up for staples
because the alternative is going without, and spends a windfall because it has unmet needs. The
savings-to-deposits split (`HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE`) becomes each cohort's portfolio
choice across the yields it can see — WS7's deposit-vs-MMF gate already models one leg.

**Seed discipline (§7.4):** the opening cross-section still needs an allocation — a cold start
cannot accumulate. The seed keeps ONE opening allocation, built by the engine's own attribution
code, and the weekly engine only accumulates from there. `HOUSEHOLD_DEBT_RATIOS` and
`createWealthDistribution` become that seed's named primitives and nothing weekly reads them.

**Verify (once, at close):** the harness plus the cohort identity check (sums are asserted
already); the nine tables reduced to one; no weekly read of an allocation table; the
institutional seed share deleted; `national-accounts.ts` gone.

---


### G3 — One dealer system (all three of them)  *(item 7)*

**The review tripled this project's evidence and it is now precisely scoped.** The model has
three dealer systems: the REGIONAL desk (one book on `reg.bankingSector`, copied verbatim onto
every bank's sheet by 02b, P&L split by `bankMarketShare` — no bank decided to carry the risk and
no bank's capital constrains it); the PLAYER-facing `Dealer` type (quotes by
`baseSpreadBps × spreadMultiplier` with an `axeDiscountPct`, carries UI fields on a domain
entity, has no balance sheet and can never run out of capacity); and the fill price computed
INSIDE `TradeTicketModal.tsx` (`price × (1 + side × 0.0015)`), outside the engine entirely.

**G3a — the desk becomes per-bank and owned.** Each bank carries its own dealer inventory sized
by its own capital (the FX desk already does exactly this — `fxDeskCapacityUSD` against leverage
headroom is the pattern); the clearing adapters allocate residuals to the banks whose books have
room, and the P&L lands on the bank that carried the position. The regional arrays become derived
views, then die.

**G3b — the player trades against the same desks.** Delete the `Dealer` type's pricing; a player
order is one more participant order against the per-bank books. Fixes three review findings at
once: the React-component fill price, the equity credit with **no cash leg** posted to the
regional aggregate (07b states the rule: "an equity write with no cash leg breaks the per-bank
identity"), and six of eight asset classes moving no inventory at all when the player trades.

**G3c — every fixed bank price becomes the bank's own decision.** The review's inventory:
`UNDERWRITING_FEE_BPS` (50/150/300 — competing desks bid a fee, they do not read a table);
`chooseLeadBank` (a stable hash is a draw, not a relationship — mandates follow the bank's real
lending/deposit relationship and can be LOST); `WHOLESALE_FUNDING_SPREAD_BPS = 40` (identical for
a sound bank and a breaching one — the spread is where the market's view of a bank shows up, and
§6.1's USA cohort funds ~48% wholesale against it); the deposit-beta floor `policyRate × 0.45`
(IS the rate most weeks — a bank's deposit pricing comes from its own funding need against the
alternatives its depositors see); `BANK_TARGET_ROE = 0.12` (its own comment's exit condition is
met — bank stock clears in 07e, so the hurdle is risk-free + measured beta × ERP off the bank's
own cleared price).

**G3e — the desk's cash and the desk's fee, both of which SETL6 exposed (§7.103).** Now that the
cleared books settle through a clearing house, the dealer's leg is explicit and two things are
visible that were not. **(1) The inventory is UNFUNDED** — it sits on the region, so no named
bank pays for it, and its cash counterparty is the boundary line `<book> dealer inventory`, the
LARGEST one left. G3a puts the book on a bank and the payer becomes that bank's reserves; the
line goes to zero by construction, and it is the measure of whether G3a is finished. **(2) 07e
charges no dealer fee and carries no inventory.** It declares `dealerSpreadBps: 8` and then
discards both the engine's fee and `newDealerInventoryById`, because this book clears in SHARES
and both come back share-denominated — so equity trading is free while every other book pays,
and the equity desk holds nothing however one-sided the session was. Convert at the cleared
price when the desks become real; the equity boundary line is small today only because the desk
is not taking the other side. **(3) The equity float is the whole share count.**
`tradableFloatUSD = c.sharesOutstanding`, and the only bidders are institutions — the founders,
households and corporates on the register are not in the book and their shares are still in the
float. It does not show as over-holding only because the funds' mandates keep them well below
it and the residual is the inventory this desk then drops. OWN7 fixed the same shape in the
sovereign books (§7.104: subtract what non-participants hold); doing it here changes the equity
market's clearing level, so it belongs with the desks that will absorb the difference.

**G3d — capacity against the promoted damper defect (§6.1).** The books print their dampers
because posted demand does not reach the float; the dealer residual is the mechanism that should
absorb the gap, and per-bank desks with real capital give it a real size. Measure the
persistently-bound count before and after — this is the number G3 exists to move.

**Verify (once):** no regional dealer array read anywhere; a player buy shows up in a named
bank's inventory and cash; fees and spreads differ across banks and move over time; the
persistently-bound count, re-measured.

---

### REPO — Secured funding is a market with counterparties  *(item 8; new 2026-08-29)*

**Correct the premise first: repo already CLEARS.** `repo-clearing.ts` runs the same
`clearFinancialAsset` engine as every other book, with genuinely derived schedules — a bank
lender reserving at the IOR its reserves already earn, a non-bank at the ON RRP rate, the SRF as
an elastic seat at the ceiling so the corridor is an outcome rather than a clamp, and haircuts
derived from each bucket's own observed yield volatility. None of that is rebuilt.

**What it is not is an ASSET CLASS**, and that is the defect:

| | every other market | repo today |
|---|---|---|
| `AssetType` member | yes | **no** |
| `ItemizedHolding` on the holder | yes | **no** — a scalar `repoLentUSD` |
| named counterparty | yes (`BankLoan.borrowerId`, tranche holders) | **no** — who lent to whom is unknowable |
| instruments | per issuer / per bucket | **one anonymous pool per region** |
| collateral | — | **a scalar**, not specific pledged bonds |

Rule 14: the cash leg has no counterparty and the collateral leg has no owner. Rule 3: a real
position held as a scalar beside the books that hold everything else.

**REPO1 — a repo is an instrument somebody holds.** `AssetType.REPO`; a position is an
`ItemizedHolding` on the lender and a liability on the borrower, with the counterparty named, the
struck rate, the maturity week and the specific collateral pledged. The weekly session writes
contracts, not scalars; `repoLentUSD` / `repoBorrowedUSD` become derived sums (the G2 pattern:
`businessLoanBookUSD` is the sum of `businessLoans`).

**REPO2 — collateral is specific.** A pledge names the tenor bucket (later the CUSIP-equivalent)
it encumbers, at that bucket's own derived haircut. Encumbrance stops being one number and
becomes a property of the pledged paper, so 07c/07f's `minHoldingUSD` floor reads the real
pledge, collateral quality matters, and a fire sale can be modelled.

**REPO3 — term, not only overnight.** A term structure in secured funding, so a bank can fund a
long book short and be caught by it — the real mechanism behind a funding squeeze, and the reason
`WHOLESALE_FUNDING_SPREAD_BPS` (G3) is currently a constant.

**REPO4 — the funding decision and the securities decision are ONE.** A treasury buys the bond
and repos it out; the book is bounded by capital and by what it can finance, not by leftover
deposits. This is what deletes OWN8's interim capital ceiling. It also gives
`investableSurplusUSD`'s replacement a real economic meaning rather than an accounting one.

**Scope decision to take before starting (ASK THE USER, rule 8):** GC-against-sovereigns only, or
corporate and equity collateral from the start. The second is what makes prime brokerage and
leveraged funds real (**HF**, item 13) and lets a hedge fund finance a position, but it is roughly
double the work and pulls DER's margin machinery forward. Default assumption if unanswered:
sovereign GC only, with the instrument shaped so other collateral is a registry entry and not a
rewrite (rule 17).

**Not in scope:** money funds as first-class repo lenders beyond the existing institutional
sleeve (they reach the market through it today; making them the largest lender they really are is
a WS7 follow-up), and the cross-currency repo/FX-swap link (§6 records that the swap line needs an
FX funding market first).

**Verify (once, at close):** every repo dollar has a named lender and a named borrower; pledged
collateral reconciles to specific holdings on the pledger's book, per bank per week; the cleared
rate sits inside the corridor because of the participants' schedules and NOT because the session
short-circuited (the harness check GUARD adds); non-zero volume; and a bank funding a long book
short is visibly squeezed when the curve moves.

---

### CRD — Credit prices cleared, ratings handle zero earnings  *(item 6; household half DONE §7.162)*

**Done:** tier migration is two-way on measured delinquency, delinquency heals rather than
accumulating, and the tier rate is QUOTED from that tier's own measured loss instead of drifting
`+cci x k` forever (which was also a second representation of household credit pricing).
**Remains:** the ratings half, and the CDS half, which needs G3.

**CRD-R1 — A RATING IS NOT TWO RATIOS.** *(User, 2026-08-29, on IND8's close.)*
`determineCreditRating(leverage, coverage)` is the whole rater, seed and week. Real credit
analysis weighs far more, and **the model already measures most of it and throws it away**:

- **Scale.** A $50B issuer and a $500M one at identical leverage are not the same credit. The
  model has `annualRevenue` and `marketCap`.
- **Customer diversification.** `09-concentration-risk.ts` computes >40% supplier and customer
  concentration flags **every week, at 8.5% of total run time (§7.107), and nothing prices off
  them.** This is the consumer that stage has never had — and wiring it retires the "cheapest
  large win on the table" note in §5-SCALE by making the work load-bearing instead of deleting it.
- **Refinancing ability.** The maturity wall is right there in `debtTranches`: a firm with its
  whole ladder due in a year is a different credit from one with it spread over ten, at the same
  leverage. Cash, the committed revolver and CP market access (07f already gates that on rating —
  make it two-way) are all present.
- **Earnings volatility and cyclicality.** `revenueHistory` and `historicalFundamentals` carry
  twelve quarters; the variance is a measurement nobody takes.

**Shape:** keep leverage and coverage as the spine and make the rest NOTCH ADJUSTMENTS off
measurements the model already produces — not a new table of stated weights. Then IND8's seed
rater inherits it for free, because seed and week share one function (§7.4). **Verify:** two firms
with identical leverage and coverage but different scale, customer concentration and maturity
profile must rate differently, and the notch gap must be attributable to a named measurement.

**Clamps it deletes:** CDS spread [10, 5000] bps (`08:1301`), leverage [0, 100] and coverage
[±50] (`08:830/835`), consumer tier rates set by `creditConditionsIndex × 0.05/0.03/0.01/0.005`
(`macro/evolution.ts:553-560`).

Three independent halves.

- **CDS becomes a real traded instrument** in a book, like everything else that has a price
  (rule 1). Needs G3's dealer to be the other side.
- **The ratio clamps are the wrong fix for a real problem.** Leverage and coverage are bounded
  only because EBITDA passes through zero and the ratio explodes. The honest place to handle that
  is `determineCreditRating`: **a firm with no earnings is a distressed rating by definition**,
  not a ratio held at 100. Fix it there and the bounds are unnecessary.
- **Consumer credit is priced by the lending bank, per pool** — HH3's `householdLoans` pools
  already carry the structure. A price moved by an index is not a price.

**Folded from the review:** `creditTierBooks` imposes BOTH halves of household credit quality —
the tier shares (0.25/0.35/0.25/0.15 across SUPER_PRIME→SUBPRIME) and the rates (6%/12%/19%/28%).
Which households are which quality is an outcome of their real balance sheets (COH's cohorts
carry them); the rate is the lending bank's price per pool, same as above. Both tables go.

**Verify:** a zero-EBITDA firm rates distressed without any ratio being bounded; consumer rates
differ by bank and by pool; tier composition moves when cohort balance sheets move; the CDS level
is a clearing outcome.

---

### HSG — A housing market that clears  *(item 5 — promoted; substantially started §7.159-160)*

**Done:** the mortgage book is a cross-section of VINTAGES marked to today's prices, so severity is
`E[f(LTV)]` and a −20% price move takes it to 2.1x where the one-average book said its floor;
loans carry a 5-year fix and RESET (17.5% of the book a year) with per-vintage default frequency;
borrowing capacity is `DSTI x income / annuity factor`.
**REMAINS — and it is the row's actual title: `medianHomePriceUSD` DOES NOT CLEAR.** Until it
does, the affordability limit has slack it should not always have, and `HOUSING_TURNOVER_RATE_ANNUAL`
is still a constant on the seller's side.

**Clamps it deletes:** house price index [0.5, 3.0], credit factor [0.5, 1.5], the
`|| 400000` price fallback, and the drift itself —
`priceIndexDelta = (1 − supplyDemandRatio) × 0.002 × creditFactor` (`macro/evolution.ts:743-747`).

**The mechanism.** Houses clear in a book like every other asset. Households bid out of real
income and the mortgage credit banks actually grant (both exist: HH's measured receipts, G2/HH3's
real mortgage origination on named banks) against the real stock HH2 already put on the household
balance sheet. The price is what clears.

This one matters more than its size suggests: housing is the largest asset households hold, so
the wealth effect — and therefore consumption — currently rides on a drift formula with a bound
on each end.

**Folded from the review:**
- **`MORTGAGE_SPREAD_OVER_10Y_BPS = 170`** — every bank charges every borrower the same spread.
  The fix already exists in the same file: `BankLoan.marginBps` is "quoted by the bank's own
  credit arithmetic at origination, the same expected-loss + capital-cost pricing the bond market
  uses". The household book does the same: `quoteLoanMarginBps` with the pool's own PD, funding
  cost and capital charge, per bank.
- **`HOUSING_TURNOVER_RATE_ANNUAL = 0.04`** — an observed real-world rate fixing origination
  volume. Turnover becomes the OUTCOME of households deciding to move against the cleared price
  and the mortgage rate they are quoted, which is precisely the market this project builds.

**Verify:** the price is a clearing outcome; a credit tightening shows up as fewer bids rather
than as a factor; mortgage rates differ by bank; turnover moves with the market; the wealth
effect moves with a cleared price.

---

### XB — Cross-border portfolios and trade  *(item 11; IN PROGRESS; absorbed the old WS9)*

**Status: XB1, XB2, XB2b–XB2f, XB3a-1/2/3/4, XB3b, XB4, XB5 DONE (§7.72–77). XB3a-5 and XB6 REMAIN — and XB3a-5 is gated on XB6.**
**The 60-week harness is deliberately RED while this runs — see §6 and rule 1 of `CLAUDE.md`.**

**XB1 — DONE (§7.72).** `foreignShare` deleted: it assigned each region a share of every other
region's markets, re-imposed weekly, owning nothing (442B of claims with no holder against 883B
of institutional assets). Replaced by MANDATES — home bias by entity type, the foreign remainder
spread by market size — with entity targets from each entity's own book rather than a
renormalization to an imposed aggregate. Foreign ownership is now MEASURED
(`measuredForeignOwnership`, published weekly from real holdings): USA equity **16.8%** (imposed
had been 15%), corporate **20.0%** (12%), sovereign **16.2%** (24%).

**XB2/2b/2c — DONE (§7.72–74).** Cross-border fixed income is hedged as an institutional rule, so
demand chases the spread over the LOCAL short rate rather than the headline yield (CIP: a hedged
foreign bond returns `foreign_yield + r_home − r_foreign`). Hedges are real forwards with a named
bank counterparty. Dealers have a derivative book with three real costs — a PFE leverage add-on,
internalization of two-way flow so only the residual is carried, and client initial margin held
as somebody else's money — and the price of all that is the **cross-currency basis**, which
widens with desk utilization. Measured under a 65% dealer-equity impairment: capacity used
3.2% → 100%, basis 4.9bp → 150bp, share of the cross-border book hedged 74% → 57%.

**XB2d/2e/2f — DONE (§7.75).** FX clears in `financial-clearing-engine.ts` like every other asset
class. Currency = instrument; the week's inelastic flow (dealer inventory, cross-border
settlement BOTH legs, trade receipts) = float; hedge funds and central banks post real schedules.
Deletes `evolveFxPair`'s whole drift and five invented constants.

---

**XB3a — RESCOPED 2026-08-28: sourcing is a landed-cost decision.** *(First build partly
reverted — see §7.76's correction. What stands and what does not is listed at the end.)*

**What was wrong.** The first build split each sub-unit's supply and demand into a world book and
a local book by `CATEGORY_TRADABILITY`. That table is a real-world EQUILIBRIUM, not a primitive —
it is the observed trade share of each category — so using it as the splitting rule imports the
answer and the model can never say anything about what gets traded (rule 4's sharper half).
Software is not traded *because* it is tradable; it is traded because moving a dollar of it costs
nothing and takes no time, while a dollar of concrete costs a fortune and takes weeks. **Trade
share is an OUTCOME and the primitives under it are physical.**

**The mechanism, from how a firm actually sources inventory.** It compares LANDED COST per unit
delivered on time: the ex-works price at the seller, plus freight (which depends on the good's
physical bulk per dollar of value and the distance, at a rate that itself moves), plus duty, plus
the cost of paying in another currency, plus the carrying cost of the extra inventory the LEAD
TIME forces it to hold, plus the expected cost of RISK — late or short delivery against its own
production schedule. And it SPLITS its buying rather than picking one source: the cheap slow
source covers the base, the dear fast one covers surprises. Dual sourcing is the normal case, and
it is what makes the local/foreign mix an outcome rather than a parameter.

**Decisions taken with the user (2026-08-28), all four toward the fuller mechanism:**
1. **Per-producing-region books.** The world book is deleted. Each sub-unit clears ONE book per
   PRODUCING region, quoting ex-works; every region's buyers bid into all four at their own
   landed cost. One price per book, so the engine's one-stat-per-instrument rule holds, and the
   wedge sits on each buyer's own reservation — which is exactly how it works, a mill quotes
   ex-works and the buyer pays freight. `CATEGORY_TRADABILITY` is deleted. **This reverses the
   "option (b) of three" recorded above; the reversal is the point.** A consequence worth having:
   an exporting region's domestic price rises when foreign demand is strong, which is the real
   terms-of-trade channel for free.
2. **A minimal shipping-properties table now, which BP1 absorbs.** The properties needed (physical
   bulk per unit of value, shelf life) are exactly what BP1's registry is specified to own. One
   table, marked as BP1's to fold in — never a second one.
3. **Carriers are real firms.** Shipping companies with real fleets, real capacity, real balance
   sheets and real costs, offering into a freight auction. Not a cost function: every dollar of
   freight traces to a named counterparty, and a freight rate is one of the most real prices there
   is.
4. **Real delay and real safety stock, for domestic and foreign alike.** Goods ordered in week N
   arrive in week N+k. Buyers hold stock against lead time and demand variance; a stockout costs
   real lost production. Applying the delay only to imports would itself be an imported
   assumption.

**XB3a-1 — Physical goods and geography.** Per-sub-unit physical properties (bulk per unit of
value; shelf life) and real inter-region distances. Distance and mass are physical primitives,
which rule 4 allows; what is forbidden is the observed trade share they produce.

**The week's sequence, and why it has no simultaneity** *(decided with the user, 2026-08-28)*.
Landed cost needs a freight rate; the rate needs the cargo that sourcing produces. That resolves
into four passes, which is also how procurement and chartering actually work:
1. **Intent.** Each buyer computes its real weekly need, evaluates every producing region's
   EXPECTED landed cost from last week's ex-works prices and the last cleared freight rate, and
   allocates the need across sources in merit order — cheapest first, up to what that source
   offered, spilling to the next. This is the forward booking a real shipper places, and it is
   also the sourcing split. No constant decides the split; it is an ordering.
2. **Freight clears.** Per LANE, carriers' real capacity offers at their own marginal cost
   against those bookings. **A booking's reservation is the surplus on that specific trade** —
   what sourcing from THAT origin saves the buyer versus its next-best source. That is what makes
   freight demand slope: when rates rise, distant sourcing stops being worth it and the cargo
   simply is not there. Without it the book has perfectly inelastic demand and the rate is a
   bound, not a price (§7.21, §7.75).
3. **Goods clear.** Each buyer bids the allocated quantity into each producing region's book at a
   max EX-WORKS price equal to its delivered willingness to pay less that origin's freight and FX
   cost. Every book clears one ex-works price; the wedge lives on each buyer's own reservation,
   which is what the engine is built for.
4. **Settlement.** Goods and freight both move, freight to the named carrier that carried it.

**XB3a-2 — Carriers and the freight market.** Shipping firms with real fleets, deployed per LANE
(a directed region pair, plus domestic), because a vessel on one lane is not available on another
and that is what makes rates differ by route. Capacity offered into a per-lane auction against
real cargo demand; the cleared rate is the freight price. Real costs: fuel from the energy
commodity that already exists, crew from the labour market, vessels as real PP&E bought as real
capex from `commercial_fleet`. Redeployment responds to rate differentials.
**The opening fleet is seeded at what the seed economy actually needs to move**, so the freight
market opens clearing at carriers' own marginal cost rather than on a rate spike or collapse that
is an artifact of a guessed fleet (§7.4's seed-shape rule). It is a starting condition, not a
target: after week 1 capacity is an outcome of real ordering and scrapping economics.
**Domestic freight becomes a real cost too.** Goods currently move between firms inside a region
at zero transport cost, which is simply wrong — the lane diagonal is a real haul, and a domestic
supplier that is merely CLOSER than a foreign one is the honest comparison.

**XB3a-3 — Landed cost and the sourcing decision.** Buyers bid into every producing region's book
at their own landed cost. `CATEGORY_TRADABILITY` and the world book are deleted here. Trade stays
what the first build made it — who bought from whom, from the auction's own lots. Freight demand
is the real shipments this produces, closing the loop with XB3a-2.

**XB3a-4 — Transit, safety stock and stockouts.** Goods in transit are a real asset with a real
owner. Buyers size safety stock against real lead time and their own demand variance; a shortfall
costs real production through the existing `inputSupplyConstraintFactor` channel. Dual sourcing
emerges rather than being coded.

**XB3a-5 — Payment terms and FX exposure.** Real payment terms (user's choice), so the exposure
runs its actual length rather than a uniform week. **Invoice currency is NOT built here** — it
waits on XB6, because with USD as the numéraire the cheapest vehicle currency is decided by the
model's plumbing rather than by anything economic.

**Verify:** trade share by category is an OUTCOME that correlates with bulk-per-dollar rather than
with any table; a freight shock visibly redraws sourcing; a weaker currency wins a region share
through real landed cost with no competitiveness formula anywhere; firms hold more safety stock
against longer lead times and dual-source rather than single-source; a carrier can fail; every
dollar of freight lands on a named carrier.

**Named gaps, not silently dropped:** tariffs and duties; the distributor between a household and
a foreign seller (households do not import directly); and invoice currency, above.

**What stands from the first build** (§7.76): the per-firm settle-ONCE restructure across books,
the global counterparty lookup, cross-border contracts filed in the customer's region, trade as
accounting from the auction's own lots, seeding the opening position by running the engine, and
the deletion of the dead `companyUpdates.cashChange`. **What is deleted:** the world book,
`CATEGORY_TRADABILITY`, and the whole invoice-currency slice.

---

### XB6 — Non-USD pairs clear directly  *(item 11, the slice that remains; gates XB3a-5)*

**Owns the FX leg of the promoted damper defect (§6.1):** the pinned rate is not a damper problem
but a FLOAT problem — the inelastic flow (`dealerNetUSD − portfolioUSD − tradeUSD`) is
systematically one-way and exceeds what the elastic side absorbs, so the print is the damper 38
weeks in 40. Find the oversized flow; the elastic side's capacity is HF's (speculator schedules
from real capital). Do not widen the damper.


XB2f made each currency's value clear against the USD, with every cross rate triangulated from
two of those — which guarantees triangular consistency and was the right call for that slice. Its
cost only became visible in XB3a: **hedging EUR/JPY is then structurally two USD legs, so USD is
the cheapest vehicle currency BY CONSTRUCTION.** Any cost-based rule for choosing an invoice
currency would rediscover the model's own numéraire and report it as a result — rule 4 again, in
the plumbing rather than in a table. The user's decision is to fix the market: non-USD pairs clear
directly, so depth differs by PAIR at the source and a vehicle currency can win or lose on its
own merits. Triangular consistency then has to be an outcome of arbitrage between the direct pair
and the two USD legs rather than a property of the representation — which is what it is in
reality, and the arbitrageur is a real participant with real capital.

**XB3b — Pass-through (AFTER XB3a).** The model has NO FX pass-through: every price, wage and
revenue is USD (`unitPriceUSD`, `getBaseAnnualWageUSD`, `annualRevenue`), and there are zero FX
references in unit bidding, company fundamentals, the labor market or macro evolution. Denominate
each region's COST BASE locally (wages, domestic inputs) so it converts at the cleared rate: a
weaker currency then makes that region's firms cheaper in USD and they win share in the global
book — the competitiveness channel, mechanical rather than a formula. This is the invasive slice;
it touches wages, household income and the labor market. Deferred deliberately: trade credit
(30–90 day payables) and hedging those payables belong with the forward book, not faked here.

**XB4 — Close-out battery.** The XB `report()` module in `scripts/harness.ts` (§1.10). Every criterion below, measured once, at the END. Include: do the three empty
`GLOBAL_EQ_*` index funds fill? Which currency became the vehicle, and what drove it?

**Verify:** hedged-yield-pickup, not raw yield, predicts bond flows; a home rate cut pushes
portfolio flow abroad and the pair moves in the carry direction; the global funds fill; FX forward
open interest matches the hedged cross-border bond stock; every foreign position has a cash leg in
the right currency; the emergent foreign ownership share is stable and explicable; trade flows
reconcile to who bought from whom.

---

### HF — Hedge fund strategies and prime brokerage  *(item 12; sized like G2)*

Two defects, and the second is the same shape as every infinite-supply problem already deleted.

**1. One `HEDGE_FUND` type does every strategy.** Real strategies are not variations of one fund;
they are different businesses with different books, different counterparties and different failure
modes. At minimum:
- **Global macro** — directional rates and FX. This is the elastic side of the FX market XB2f
  built, and today ALL hedge funds play that role, which is wrong: an equity long-short fund has
  no view on the yen.
- **Long-short equity** — paired longs and shorts, so it needs a real SHORT: borrowed stock, a
  locate, a borrow fee, and a squeeze when the borrow is recalled. None of that exists yet.
- **Long-short credit** — the same in bonds and loans, and the natural buyer of the basis trades
  the dealer desks cannot carry.
- **Distressed** — already referenced in 07b as the marginal buyer at the wides with a 0.22
  hurdle; it should be a type rather than a coefficient on the generic fund.

Each type gets its own mandate, hurdle and market participation, replacing the single
`LEVERAGE_ALLOWANCE.HEDGE_FUND` and `liabilityDrivenCoreShare` special cases.

**2. Leverage has no lender.** `LEVERAGE_ALLOWANCE.HEDGE_FUND = 0.22` is a static constant: a fund
is simply *allowed* 22% leverage by nobody, funded by no one, at no price. The real thing is
**prime brokerage** — a named bank lends against posted collateral, at a haircut, for a fee, and
**can pull it**.
- Leverage becomes a real liability of the fund and a real asset of the prime broker, consuming
  the broker's own balance-sheet capacity exactly as the FX desk's PFE does (XB2b).
- The haircut is the price, and it widens with the fund's concentration and the collateral's
  volatility.
- **Withdrawal is the point.** A broker cutting lines forces the fund to sell into a falling
  market, which moves the price, which triggers the next margin call. That cascade is a real and
  central mechanism this model cannot currently produce, because leverage is a constant.
- **Verify:** a shock to a prime broker's capital measurably deleverages its funds; forced selling
  shows up in the clearing books as real supply; a fund can fail from a margin call rather than
  only from marks.

**Folded from the review — four constants that are really fund decisions, with fixes:**
- **The FX elastic side** (`domain/fx-market.ts`): `SPECULATOR_RESERVATION_MOVE_PCT 1.2`,
  `FULL_SIZE_RANGE 4.0`, `FX_RISK_BUDGET 0.15` — three invented numbers that decide how much flow
  the FX market can absorb, i.e. the other half of the damper defect. A speculator's schedule
  comes from its own capital, its own carry view and the volatility it has observed — the same
  shape every other participant posts. (The central-bank reservation next to them is correctly
  DERIVED from the speculators' exhaustion point; that pattern generalises.)
- **`HEDGE_RATIO_EQUITY = 0.35`** — an observed average of published policies applied to every
  entity type alike. A hedge ratio is a MANDATE property: onto the entity profile, so a pension
  fund and a hedge fund differ and the ratio can respond to what hedging costs (the basis DER
  makes real).
- **`HOME_BIAS_BY_ENTITY_TYPE` used as a WEIGHT** (`mandateWeightForIssuer`): a mandate LIMIT
  ("no more than X% foreign") acting as a preference ("always exactly X% domestic"). Rule 5: the
  bound stays as a cap; the actual allocation is tactical, from the entity's own relative-value
  view.
- **`LBO_DEBT_SHARE = 0.55`** (`pe-lifecycle.ts`): the deal's capital structure decided before
  the market prices it. A sponsor levers as far as 07d will fund at a margin it accepts — the
  machinery exists (the offering's walk-away, the book's decline). The share becomes the OUTCOME
  of the financing.

---

### DER — Derivatives, and the people who hedge with them  *(item 13; needs G3)*

Merges the old G4 (derivative markets), G7 (commodity futures) and WS11 (corporate and bank
hedging). Futures and hedging were never separate markets — they are the users of this one, and
splitting them across three projects hid that every one of them needs the same participant set.

Each instrument is an engine adapter with a small real participant set; the closed-form pricers
remain MTM converters. **Build IRS first** — its natural two-sided demand already exists.

1. **IRS.** Par rates at 2/5/10Y per region, YIELD_LIKE. Payers of fixed: banks hedging G2 loan
   books, corporates with floating debt. Receivers: insurers and pensions extending to liability
   duration (from HH1; before it, from the duration gap 07b's fit already computes). The cleared
   par rate minus the 07c bootstrap is a real swap spread — the first cross-market basis the sim
   produces, and a powerful diagnostic.
2. **CDS.** One IG and one HY index per region, single names later. Buyers: banks (G2 books),
   hedge funds; sellers: yield-seeking insurers. Cleared index spread vs cash OAS is a real
   CDS-cash basis. Margin flows are real cash through the ledgers.
3. **Options.** One implied vol per equity index — and now per ETF, which is what a real equity
   option complex is actually written on. Bank desks (G3) make markets; institutions buy downside
   protection sized to their real equity books; inventory versus hedging demand clears the vol and
   kills the `|| 0.3`. Realised-versus-implied desk P&L is real.
4. **Commodity futures.** Four quarterly contracts per major commodity, PRICE_LIKE; spot stays
   stage 07's real market. Producers hedge a fraction of real forward production; recipe-input
   consumers hedge real forward requirements; bank and HF speculators trade value-versus-carry; a
   storage arbitrageur's reservation is the cost-of-carry bound — spot plus financing plus storage
   — which keeps the curve arbitrage-consistent without a clamp. Convenience yield becomes derived
   from the cleared curve versus carry. Contracts cash-settle to real spot at expiry.
5. **Corporate and bank hedging.** Exposure is already measurable from real books: FX from a
   company's real cross-region sales, rates from its floating-debt share, commodities from its
   real recipe quantities. Each company hedges a policy fraction (IND's profile) with a named bank
   at the cleared level; the bank aggregates client flow and lays the net off through these same
   markets; what it cannot lay off stays on its book and consumes real capital.

**Verify:** swap spread and CDS-cash basis hold single-digit-bp bands in calm weeks and blow out
under stress — the bases are the test that the legs are consistent; contango when inventories are
high and backwardation when scarce, both of which genuinely occur in stage 07; expiry convergence
within the dealer spread; hedged companies and producers demonstrably feel less P&L from the
shocks they hedged, which is the whole point of items 4 and 5.

**Folded from the review:** the cross-currency basis — the PRICE a hedger pays — is
`MAX(150bps) × utilization × (0.35 + 0.65 × oneWayShare)`: an observed crisis-era ceiling (rule
4) times an invented split, a bound the price rests on (rule 15). The desk's capacity model is
right and stays (PFE against real leverage headroom, internalisation before carry, a desk at zero
meaning a hedge is unavailable at any price); what it CHARGES becomes a cleared level — hedgers
post what they will pay, desks post what their balance sheet needs, the engine solves, and a
one-way market widens until someone walks. The forward book is the first derivative on the
generic engine; the rest of DER follows its pattern.

---

### G5 — Default resolution: recovery as an outcome  *(item 14)*

**Its opening measurement, handed over by OWN7 (§7.104).** After OWN7 the ownership conservation
check reads clean in every region and every asset class EXCEPT one: a defaulted issuer's bonds
stay on its holders' books, because nothing takes them off. The paper stops being cleared (the
issuer leaves `isActiveCompany`, so 07b/07d never price it again) while the holders keep the
position at its last mark forever — the claim outlives the borrower. **That single line is the
last conservation violation in the harness (one week in sixty, one issuer), and closing it is
this project's first slice:** a default resolves into a RECOVERY paid to the named holders, the
holdings come off at what was actually recovered, and the loss lands on the books that took it.

On default an `Estate {companyId, assets, claims[]}` opens instead of a constant recovery. Real
assets (cash, receivables, inventory at real lot values, PP&E at a haircut) are sold over ~26–78
weeks **through the real markets** — inventory into stage 05 as distressed offers, PP&E to peers
as cheap capex — and proceeds waterfall to claims by real seniority (first-lien loans, then bonds,
equity residual, usually zero). While the workout runs, defaulted claims keep trading in 07b/07d
at the §7.20 recovery-based reservations, marked against the estate's own evolving asset value, so
the model's distressed pricing and its resolution process read one book.

**Recovery becomes an output**, and that closes the §7.20 loop: realized recoveries calibrate the
priced LGD (a rolling realized-recovery average replaces the `CREDIT_RECOVERY_RATE` constant),
completing the one-default-model unification whose hazard side landed in §7.20.

**Also owned here:** the **public default rate**, ~10%/yr — 46 of 196 public firms by week 121
against ~1–2%/yr in reality, while the private tier with real ladders shows zero, isolating the
cause to the public path's cash accounting. And the **PE exit by sale** (sponsor-to-sponsor or
strategic), the half of the capital-recycling loop a listing cannot provide; the estate machinery
is the natural place for a whole-company transfer, or stage 10's merger path.

**Verify:** recoveries disperse by asset-heaviness; waterfall conservation (proceeds =
distributions exactly); loans recover above bonds; the public default rate falls toward the
private tier's.

**Folded from the review:**
- **`creditContagionBps = recentDefaultsCount × 12`, capped at `min(0.3, bps/500)`** — the one
  LIVE output of stage 01, read by stage 08's pricing. A spread is a cleared price; contagion is
  real losses landing on real holders' books and tightening their real capacity, which is exactly
  what this project's recovery mechanics produce. The coefficient dies when the channel is real.
  (The default-decay window itself — rolling year, freshest-weighted — is good and stays as the
  STATISTIC.)
- **The recovery-rate floor 0.10** (`08:1548`): recovery is what the workout of real assets
  against real claims produces, the project's own thesis; the floor goes with the mechanism.

---

### NAT — Nature transmits, it does not impose  *(item 15, clamp programme; re-scoped by the review)*

**Clamps it deletes:** commodity supply drift ±4%, inventory [0, 100]. (Population growth and
migration are DEM's.)

**NAT1 — honest commodity primitives.** The review proved the seed imports real prices while
claiming not to: `PRODUCTION_COST_UNIT × categoryCostFactor × scarcityIndex` multiplies out to
crude **$76.00/bbl**, gas **$3.00/mmbtu**, gold **$2,730/oz**, silver **$32.20/oz**, copper
**$4.48/lb**, wheat **$6.00/bu**, corn **$4.32/bu**, soybeans **$10.50/bu** — `scarcityIndex` is
the observed price back-solved out of the other two factors, and the import is not even faithful
(heavy crude seeds ABOVE light, where real heavy grades trade at a discount). Fix: the primitive
becomes what the file already claims — extraction cost and ore grade / energy density per
commodity, from which the price FOLLOWS; producer capacity replaces the ±4% supply drift.

**NAT2 — weather gets a calendar and a geography.** `evolveRegionalWeather` never reads `_week`
(no seasonality — a heatwave is as likely in January as July) and draws the type uniformly (JPN
can draw a Polar Vortex, the UK a Monsoon). Fix: a seasonal cycle per region and a
region-appropriate event set — both generated structure, not imported data. The rule-4 place
names ('Midwest', 'Great Plains', 'North Sea', 'Mediterranean', 'Pacific') become
region-relative generated names in the same pass, and the EUR-heatwave-moves-crude wiring becomes
electricity/gas, which is what cooling demand is.

**NAT3 — an event cuts a YIELD.** `gdpImpactPct` and `inflationImpactPct` are written at 14 sites
and read at NONE — delete them. `commodityImpactPct` states a PRICE impact; it becomes a cut to
the affected producers' real yield/capacity, the commodity book prices the shortage, input costs
rise through the recipes, and the measured index reports it — the chain `evolution.ts:75` already
names as the real one.

**Verify (once):** commodity prices derive from cost-and-grade primitives (grep finds no
back-solved index); weather is seasonal and located; a drought moves a yield, then a price, then
the CPI, in that order, with no field adding to GDP or inflation directly.

---

### CAL — Payment calendars  *(item 16)*

Coupons, loan interest and dividends accrue as smooth weekly 1/52 flows on both sides — stage 08's
expense and `institutional-balance-sheet.ts`'s income. Real instruments pay on their own calendar:
bonds semi-annual or quarterly, loans monthly or quarterly off the reset schedule, dividends
quarterly on declared dates. The smooth accrual conserves dollars but erases real cash-flow
lumpiness — quarter-end liquidity needs, coupon-date reinvestment flow, the reason CP and money
markets breathe on a calendar at all.

Give each `DebtTranche` and loan a real payment schedule and pay on it. The S5 cash ledger is the
natural landing place for the corporate side; WS5 and WS7 both exist now and would feel the
lumpiness immediately.

---

### ETF2 — A real price for ETF shares  *(item 17; needs G3)*

Today a fund's shares are carried at NAV and the arbitrage residual is reported as
`unmetFlowShare` — the fraction of a week's creation and redemption demand the authorised
participants could not absorb — deliberately not called a premium, because a premium is a price
and that is not one (§7.44). Pricing the shares means clearing them in a book of their own against
the float the APs are willing to create: a real adapter over the existing engine, with the AP's
capacity as the supply side. Until it exists the model can say the arbitrage was constrained but
not what that cost anyone. Wants G3 first, so the AP's capacity is a named desk's real balance
sheet rather than a regional pool.

**Folded from the review:** `AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY = 0.25` contradicts its own
name and comment — the comment argues an AP's capital limits TURNOVER and "a dealer turns over a
large multiple of its equity", then sets a quarter. Re-measure which is wrong when the share book
exists; the constraint should bite in stress and not otherwise.

---

### HC3b — The product-market handover  *(item 18; needs BP1, done)*

The last piece owed from Hidden Corporates Wave 1, deferred with a reason and still waiting on
BP1. The auctioned sub-unit categories' demand is calibrated against public supply, while the
hidden tier's output genuinely sells OUTSIDE the modeled taxonomy — services, local trade,
categories that do not exist yet. Injecting the tier's 165B/region of supply into markets sized for
211B of public revenue collapsed both (−10% to −22% growth), which is why it was not forced.

With BP1's registry carrying the hidden sector's real categories: demand routes to them by real
buyer mixes, private firms get product lines in THEIR markets, segment `annualRevenueUSD` is carved
in the same pass, and the sales-anchored revenue path — already written, gated on market presence —
switches on.

---

### SCALE — Universe scale-up under a wall-clock budget  *(item 19; wave 2 after IND)*

**DIST CHALLENGES THIS PROJECT'S PREMISE (§5-DIST) — measure before spending the budget.** The
clearing engine takes SCHEDULES, and a pool with no dispersion posts one step. Depth in a book may
be partly a RESOLUTION problem rather than an entity-count problem, obtainable at 10-20 weighted
nodes per pool instead of tens of thousands of firms. That does not make SCALE unnecessary — a
granular tail needs real names — but it changes how much of the float gap it has to close, and
therefore how big the universe actually has to get.

**Owns the float half of the promoted damper defect (§6.1):** 2,549 instruments print their
smoothing constant because the books are thin — §7.18's want/have from the supply side. G3 gives
the residual a real absorber; SCALE grows the float itself. Re-measure the persistently-bound
count at close.

**The current baseline, measured 2026-08-29 (§7.107):** **1,139 ms/week**, and the distribution
is one stage and then everything else — `05-unit-bidding` **46.8%** (538 ms mean, 803 worst),
`08-company-fundamentals` 11.9%, `09-concentration-risk` 8.5%, then nothing above 5%. Stage 05 is
where wave 2 spends its effort. **`09-concentration-risk` is the odd one out and the cheapest
win on the table:** 98 ms a week to compute concentration FLAGS that nothing prices off.

**The question, stated as a measurement:** how many public and private non-SME companies can the
simulation carry before week-time becomes unacceptable — and what breaks first? The answer is a
FRONTIER (names vs seconds/week), not a feeling.

- **Profile first** (the standing rule): measured wall-time per stage at the current universe,
  then at 2x/4x/8x synthetic universes, to find the real scaling exponents. The prime suspects
  are the all-pairs shapes: the clearing engines price every name against every holder
  (names x participants), stage 08's per-company loop, stage 05's auctions, and any O(n²)
  rebuild that hides in a weekly `.filter`/`.find` over companies inside a per-company loop.
- **Optimize without changing economics.** Algorithmic wins only — precomputed indexes
  (ticker→company maps instead of repeated `.find`), incremental updates instead of weekly
  rebuilds, hoisting invariant work out of per-name loops. Two hard constraints: determinism is
  sacred (an optimization that reorders RNG draws changes the world — same-seed A/B must be
  byte-identical), and no economic shortcut dressed as an optimization (sampling participants,
  truncating books, skipping small names — those change the market, not the speed).
- **Then push the count** through the front doors that exist: generator counts for public names,
  HC births for private ones. Measure the frontier and pick the operating point with the user.
- **DONE (§7.80): worker-parallel clearing books.** Delivered as the pack/kernel/accumulate
  engine with a synchronous, env-gated Node pool — byte-identical to serial. What it measured is
  the next item's charter.
- **Columnar state (the path below 300 ms/week, §7.80's wall):** move the hot per-company and
  per-holding numbers into typed-array columns owned by the engine, with the object graph
  rebuilt as a VIEW for the UI and saves. This is what lets stage 05/08 and the adapters'
  extract/apply layers shard like the kernel does, and it is the SCALE-grade rewrite it sounds
  like: determinism gates at every step, RNG lanes restructured once (a declared relabel), UI
  contract preserved. Do not start it as a side effect of anything else.
  **Wave 1 DONE (§7.81), 946 → ~850 ms/week with ZERO relabels** — the holdings store (books
  share one sweep; entities updated in place), stage 08 assigning onto live company objects
  instead of rebuilding the graph, and a dozen measured statement-level fixes. What remains is
  representation-bound: stage 05's contracts/plans/lots, the books' demand arithmetic, the
  kernel's apply maps — and ~70 ms/week is the §6 lot leak's tax. **Sequence wave 2 AFTER IND**:
  the leak fix deletes a third of stage 05/08's remaining cost for free, and IND restructures
  the same corporate objects a columnar 05/08 would otherwise rewrite twice.
- **Superseded scoping note** (kept for the record):
  07b/07c/07d/07e/07f draw no RNG, so they can clear in worker threads without touching the
  stream — the engineering is the state boundary (the adapters read companies, entities and
  region state; a naive per-week structured clone could eat the win). Reordering of result
  merges must stay deterministic. Expected worth ~200–300 ms/week of the ~1,000 baseline;
  combined with stage 05/08 restructures it is the only credible path under 300 ms/week.
- **Report measured numbers** at every step: before/after per-stage timings, the frontier curve,
  and the harness green at each size.

---

### MNC — Multinational production  *(item 20; needs IND, XB)*

Every firm is single-region while intra-firm trade is roughly a third of real world trade — here
it is zero. The FDI decision (build abroad vs export, priced off the landed-cost machinery XB3a
already runs), foreign subsidiaries as real plants with local costs and labor, intra-firm trade
at transfer prices, structural FX exposure (transaction and translation) making the hedging
desks' client book real demand, and profit repatriation through the FX books. TAXR's rate
differences later make location a priced choice.
**Verify:** FDI responds to landed-cost differentials; an intra-firm trade share EMERGES; one FX
move changes a multinational's consolidated earnings through both channels.

---

### CHAIN — Multi-tier supply chains  *(item 21; needs BP1, IND10/11)*

**CHAIN-D and CHAIN-E are DONE (§7.117-118, §7.120) and CHAIN no longer gates the foundation
tier** — the question this row carried, whether to promote it, was answered by splitting the
recipe-depth slice out and running it first (user decision, 2026-08-29). What remains below is
ordinary depth-tier work: the multi-tier ORDER graph.

**CHAIN-D — DONE (§7.117). The recipes are deep, and it proved the depth was not the binding
thing.** `recipeInputs` moved from `IndustrySpec` to `SubUnitSpec` — a bill of materials is a
property of a PRODUCT, and at industry granularity a real one is unwriteable, which is why all
sixteen recipes had collapsed to the same overhead line. All 37 products now carry a real BOM:
**mean intensity 0.164 → 0.412, dispersed for the first time** (refining 0.70, industrial
chemicals 0.61, enterprise software 0.19, professional services 0.18). Harness **18 → 15, five
families → two**; deflation falls every week. **But the gross-output ratio moved 0.878 → 0.879 —
no effect — which falsifies §7.111's attribution rather than its measurements.**

**CHAIN-E — PUT INTERMEDIATE DEMAND IN THE SEED. This is what items 1 and 2 are actually blocked
on, and it is a seed slice (§7.117).** `macro/initialization.ts:106-108` seeds all demand as
`C = household income x 0.94`, `G = GDP x 0.35`, `I = GDP x 0.15` — **C + I + G, a final-demand
identity**, in which corporate demand is investment ONLY and intermediate demand does not exist.
So gross output is pinned to final demand and the ratio is ~1 by construction however deep any
recipe is. The recipe matrix is now real, so the seed can solve for what it implies instead of
stating it beside it: **X = (I − A)⁻¹ F** — each sub-unit's demand level is its row of the total-
output vector, and the CORPORATE share of it becomes an outcome, `(X − F)/X`, retiring
`buyerMix.CORPORATE` as a stated number (rule 3: two representations of intermediate demand, and
the stated one currently wins because it sizes the pot). **Revenue-per-employee's sector multiple
must come out of the SAME solve** — it is the gross-output-to-value-added ratio wearing another
name (§6.1 records that normalising it independently put employment 68% above the labour force,
and §7.112 corrected its comment from an asserted 2.5x to a measured 1.13x). One solve, both
numbers, or they disagree again.
**Verify:** the ratio lands at the recipe matrix's own multiplier; Consumer stops printing gross
output below value added; employment stays inside the labour force without any multiple being
tuned; and the seed's category demand equals what the recipes say is consumed plus final demand.

**Original framing, kept because its measurements stand (§7.111) — but read §7.117 first, which
corrects its owner assignment:**
`recipeInputs` — "what a producer consumes per dollar of output" — has a **mean intensity of
0.138** across the sixteen industries that carry one, implying a gross-output-to-value-added
multiplier of **1.16x**. A real economy's intermediate share is 50-60%, giving 2.0-2.5x. So firms
barely buy from each other, there is almost nothing between revenue and payroll, **payroll is 61%
of revenue against a real ~30%**, and every firm sits on the cost-of-capital line the labor market
sheds against — which is the whole of §5-EMP's unemployment collapse. Deepening the recipes is
this project, and the capital-intensity multiples in `companyGenerator.ts` follow them afterwards
(they currently assert 2.5x in a world that runs at 1.13x; the comment there records it). **Verify
by re-measuring revenue per worker against productivity per worker: it must land at the recipes'
own multiplier, and Consumer must stop printing gross output BELOW value added.**

Recipes are one tier deep; real chains are graphs. BP1's registry carries a real BOM (components
made from components); ORDERS — not final demand — propagate upstream through lead times and
per-tier inventories, which is what makes the bullwhip producible instead of assumed; supplier
concentration becomes chain-deep exposure (09 today sees only direct counterparties).
**Verify:** upstream order volatility exceeds downstream demand volatility (the measured
bullwhip); one supplier failure propagates through named tiers at the chain's own lead times.

**Folded from the review:** `CONTRACTED_DEMAND_SHARE = 0.6` ("real procurement splits roughly
this way" — an observed outcome) decides how much of every buyer's need is locked under contract.
How much a buyer contracts is the decision this project makes real: a hedge against supply
reliability and price volatility, chosen per buyer against its own inventory and the contract
terms on offer. The constant dies when orders, not demand, go upstream.

---

### DIST-P — The primitive scoreboard  *(the rule is §1.19; this is its live count)*

**The answer, measured 2026-08-30:** the household cross-section needs **two** permanent
primitives — PATIENCE (what makes a wealth distribution stationary rather than divergent)
and RISK AVERSION (the precautionary motive a confidence shock should work through) — plus
one temporary, the illiquidity friction, which HSG retires. Firms need **zero to one**
(entry scale, probably derivable from technology). Against roughly **90** stated numbers in
the household layer at the 2026-08-30 count. **16 retired the same day (§7.170); the count stands
at ~74 and may never rise.**

**It can be this small because this model generates its own idiosyncratic income risk.** A
standard Bewley/Aiyagari model must STATE the income process — persistence, variance, a
transition matrix, fitted to data, which rule 4 forbids outright. Here a household is
unemployed because a real firm laid it off at a real vacancy. That is the largest single
saving available and it is already banked.

**Each stated block dies when its mechanism lands. Keep this falling; it may never rise.**

| Stated block | Dies with |
|---|---|
| `TIER_BALANCE_SHEET_WEIGHTS` (32) | mostly dead already — opening conditions only since §7.145 |
| tier savings rates + the 4 aggregate coefficients + λ + the 90% cap | saving as a per-tier decision — **DIST item 1(a)**, and §6.1's live row |
| ~~credit tier shares and rates (16)~~ | **RETIRED §7.162** — migration is two-way on measured delinquency and the rate is quoted |
| ~~`TIER_DEBT_SERVICE_WEIGHT` (4)~~ | **RETIRED §7.170** — debt service follows measured debt |
| ~~`TIER_RESIDUAL_RECEIPT_WEIGHT` (4)~~ | **RETIRED §7.170** — the recycle follows measured institutional claims |
| ~~`LifeCycleStageData.savingsRate` + `consumptionMultiplier` (8)~~ | **DELETED §7.170** — read by nothing; the life-cycle rate is the retired share |
| `PARETO_ALPHA`, `NAMED_TIER_REVENUE_SHARE` | real entry and exit — DYN, item 22 |
| ~~the average LTV~~, `WEALTH_SPENDDOWN_YEARS` | **the LTV RETIRED §7.159** (the book is vintages); the spend-down horizon still waits on housing that clears — HSG, item 5 |
| **`TIER_OCCUPATION_MIXES` (14)** | **NOTHING — no owner assigned. The largest stated block with no mechanism scheduled to kill it.** A tier's occupation mix should be an outcome of who got hired into what, over time. |

### DYN — Entry, exit, and industry structure  *(item 22; needs IND, BP1)*

**DIST derives this project's cut point if it happens first (§5-DIST).** "The named tier's cut
point falls out of the Pareto tail instead of sitting beside it" is exactly where a stratified
allocation rule says a stratum needs one node per constituent. Entry is also DIST's reinjection
at the absorbing barrier — the two projects share that mechanism and should not build it twice.

Concentration as an outcome. Entry: sustained high category margins attract entrants through HC's
existing birth machinery, aimed at the category. Exit: sustained losses idle capacity (mothballed,
restartable), then scrap it — the missing half of every capacity cycle. Structure as strategy: a
firm repeatedly burned by contract breaks (IND11's measured record) integrates upstream — the
hold-up problem, priced by experience; conglomerates divest what they cannot run, giving stage
10's M&A its logic; IND7's antitrust is this project's regulator.
**Verify:** category margins mean-revert through entry/exit rather than assertion; capacity
leaves in downturns and its absence is visible in supply; integration follows measured contract
failure.

**Folded from the review:** `NAMED_TIER_REVENUE_SHARE = 0.6` states a cut point the Pareto tail
(`PARETO_ALPHA = 1.16`) already decides — the share and the distribution can disagree. The
naming threshold becomes a property OF the distribution (name every firm above the size where
naming matters: syndicated debt, sponsor interest), and the tail's revenue share is whatever the
distribution implies.

---

### PROD — Firm productivity and innovation  *(item 23; needs IND)*

`rndExpense` buys nothing today. R&D becomes a real investment with uncertain outcomes — process
(unit cost falls) or product (a new or better line through the registry) — and diffusion erodes
any lead: temporary advantage, never a permanent monopoly (rule 4: import no equilibrium).
Firm-level productivity DISPERSION plus reallocation of share to the productive (through IND6's
real price competition) becomes the model's growth engine — which is what aggregate productivity
growth mostly is.
**Verify:** R&D intensity predicts margin/share outcomes noisily, not deterministically;
aggregate productivity growth decomposes into within-firm and reallocation terms; cutting all R&D
flattens growth over years, not weeks.

---

### CRE — Commercial property and leases  *(item 24; needs HH, G2 — both done)*

Firms occupy space nothing produces. A commercial property market: space as a produced,
long-lived asset (the construction sector builds it), owned by landlords, rented on multi-year
leases that are real tenant liabilities, financed by CRE loans on named banks' books — the
classic systemic channel (vacancy → landlord default → bank capital) the model cannot express
today.
**Verify:** rents clear on vacancy; lease obligations sit on tenant books; a CRE bust marks bank
capital through named loans.

---

### TAXR — Corporate tax, really  *(item 25; needs PUB, done; MNC for the cross-border half)*

A flat 21% on (EBIT − interest) prices no decision. Tax depreciation schedules vs book (the
investment incentive), loss carryforwards (tax receipts fall FASTER than profits in downturns, so
PUB's revenue finally feels recessions properly, and a recovering firm pays nothing for years),
and — after MNC — profit booked where rates are lower, which is what makes transfer pricing
matter.
**Verify:** tax receipts are more cyclical than profits; carryforwards revive and expire;
investment timing responds to depreciation treatment.

**Folded from the review — do this slice first, it is small:** the model has THREE tax rates and
no owner. The corporate rate is a bare `0.21` literal inside stage 08's company loop — the only
corporate rate that exists, unreachable by the government's own tax policy while stage 11 counts
its proceeds in revenue; `region.effectiveTaxRate` (stance-drifted, clamped [10%,50%]) governs a
second base and `HOUSEHOLD_EFFECTIVE_TAX_RATE` a third. One fiscal-policy owner sets all three as
named per-base rates on the region; the literal dies.

---

### S-final — Validation gate  *(item 26)*

Full `npm run verify` green, closing #2/#14/#41, plus whatever residuals of #67 and #18 survive
their owners above. Nothing else ships after this until it passes.

---

### AU — Aurora, the UI rebuild  *(item 27)*

Explicit mandate: delete every current UI element and rebuild from scratch — sleek, smart,
interactive, real-world-inspired. **Required process, fixed in advance:** (1) a LONG series of
clarifying questions via AskUserQuestion — visual direction, information architecture, interaction
patterns, reference products, platform scope — iteratively, not one round; (2) mockups the user
reacts to BEFORE production code; (3) real-world product inspiration (trading platforms,
dashboards, data-dense consumer apps). Scope is all of `src/components/` plus `App.tsx`; the
engine and domain layers are untouched. Sequenced last so it is designed against the complete
simulation, and it inherits P1's display convention rather than re-inventing it.

**Folded from the review:** UI state lives inside `GameState` (`isTradeModalOpen`,
`selectedInstrument`, `isNewsDrawerOpen`, the game-over flags) — the object the determinism hash
spans, so a modal click can make two identical runs disagree. Aurora moves presentation state to
the UI layer; `GameState` carries only the world. (The player-dealer pricing that also lived in
the UI is G3b's, earlier.)

---

## 6. Open defects and watchlist

Everything with a project owner now lives in that project (§5). What remains is what no project
owns: live defects needing a decision or a measurement, and metrics to watch rather than work.

### 6.1 Live defects

**Closed 2026-08-30, substance in §7 (never renumbered), not duplicated here:** mortgage loss
severity was a floor constant because the book was one average LTV (§7.159); no household
refinanced anything and mortgage demand was rate-blind (§7.160); the same distress rule was a
threshold for named firms and a sum for pools (§7.161); the credit tiers had three one-way
ratchets — **and the row as I first wrote it misdiagnosed them** (§7.162).

| Defect | State and next action |
|---|---|
| **A HOUSEHOLD'S EQUITY IS NOT A POSITION IT CAN SELL — measured 2026-08-30 (§7.166)** | Forced selling is BUILT and settles both ways, and it reaches **$0.0B of $985B** of household equity. Two reasons, both structural. **(a) Only fund shares have a trading channel.** Direct equity and private business are computed as RESIDUALS — the household's share is whatever the institutions do not hold — so there is no position to sell however badly the cash is needed. Owner: the ownership register (MS/OWN), not DIST. **(b) Households hold no fund shares at all**, because since §7.165 the sector is permanently above its 12-week buffer and permanently dissaving, so it never buys any. That traces to the missing life-cycle: **DEM's age structure (item 4) is what makes steady-state saving positive**, and until it lands households accumulate nothing to be forced out of. |
| **NO TIER OF HOUSEHOLDS CAN DISSAVE — the fourth one-way ratchet, measured 2026-08-30** | Cohort saving is `disp x tierRate x lambda` under a `Math.max(0, ...)` (`household-cohorts.ts`), so a tier's saving can never be negative whatever happens to it. **This is the blocker under two other items**: the savings rework (the aggregate rate cannot be an outcome while the parts cannot move both ways) and forced selling (§6.1's household-equity row has nothing to trigger on until a drawdown is possible). Household liquidity measures **23.7 weeks of committed outflow** (§7.163), so a liquidity threshold IS crossable once dissaving exists — the trigger is sound, the drawdown is not. Owner: DIST (item 1a). **Re-diagnose the §7.158 stash; its stated cause was withdrawn by §7.163.** |
| **THE CAPITAL-GOODS SECTOR CANNOT SUPPLY THE ECONOMY'S CAPEX — measured 2026-08-30 (§7.167)** | Firms BID their real capex: `(maintenanceCapex + growthCapex)/52 x capexBasketWeight`, and the five weights sum to 1, so the bids are the whole capex figure. **Globally that is ~163B/yr of bids against ~13B/yr of actual deliveries — an 8% fill.** The accounting capex and the real purchases are the same intent measured twice and they disagree six-fold (rule 3's shape, though neither number is wrong — one is demand, the other is what cleared). So the plant shrinks not because firms will not invest but because **nobody can make the machines**: the capital-goods industries are sized off their own baseline revenue, and that is far below what replacing the world's capital stock requires. Same family as CHAIN's finding that the demand seed carries no intermediate demand. Owner: CAP, with CHAIN. **MEASURED PER CATEGORY (§7.168): four of five are short** — heavy_equipment 0.26x supplied/demanded at +65% on base, enterprise_software 0.29x at +174%, industrial_automation 0.43x, commercial_construction 0.62x, commercial_fleet 0.91x. **Prices ARE rationing (rule 1 works); supply is not responding.** Two causes, one of them a clean rule-3 defect: **the capex industries were SIZED for 54.0B/yr of demand and firms bid 83.6B/yr — 1.55x what was built** (and those industries serve households and government too, so the true gap is wider). Investment is represented twice — once as the seed's `I` from a national-accounts share, once as the firms' own capex off their own books. **The fix: investment is ONE number — the capex categories' demand is Σ firm capex.** It has a fixed point in it (firms are generated FROM category demand), so it is a bounded seed project, not an edit. Second cause, and it is not a defect: the shortage capex response exists and fires (shortfall 2.85 → 2x growth capex) but a capital-goods maker needs capital goods to expand, so it is self-limiting and slow — real economics, and a 10-week probe cannot show a sector doubling. Owner: CAP with BP/CHAIN. |
| ~~**CAPEX DOES NOT COVER DEPRECIATION**~~ | **ROOT CAUSE FIXED 2026-08-30 (§7.167): maintenance capex was derived from its own prior value.** The DECISION now anchors to real depreciation and the ±2%/week capacity clamp is deleted; what remains is the supply row above. Kept below for the record. |
| **(root cause fixed, for the record) Capex did not cover depreciation** | Assets under construction total **$2.2B against $2,452B of gross PP&E (0.09%)** with a p50 wait of 9 weeks, which puts capital ARRIVING at roughly $0.25B/week — about **0.5% of the capital stock a year against a straight-line depreciation of ~8%** (`SECTOR_PPE_USEFUL_LIFE_YEARS` ~12y). The plant is being consumed several times faster than it is replaced. It partly self-corrects — a shrinking net PP&E shrinks the capital charge the labour rule sheds against — which is exactly why it is invisible without measuring the stock. Suspect: the capex BUDGET (what a firm decides to spend) rather than the delivery path, which IND1/IND13 now make explicit end to end. Owner: CAP (item 2), whose capacity decisions this is. |
| **A HARD CLAMP ON WEEKLY CAPACITY GROWTH — found 2026-08-30 reading IND13's neighbours** | `05-unit-bidding.ts`: `line.weeklyCapacityUnits *= 1 + Math.max(-0.02, Math.min(0.02, netInvestmentRate))`. A ±2%/week bound on an OUTCOME (rule 2, rule 13). It is doing the work the investment decision should do: a firm that commissioned a plant twice its size still grows 2%, and one whose capital evaporated still shrinks only 2%. Small and untouched deliberately — it belongs with CAP's capacity decisions, beside the row above, and removing it before the capex budget is real would only expose the same imbalance faster. |
| **A HOUSEHOLD CAN BUY EQUITY AND CAN NEVER SELL IT — found 2026-08-30, from a user question** | **Measured in the code, not inferred from shape.** `etf-flows.ts`'s household leg is `intoFundsUSD = Math.max(0, weeklySavingUSD x equityShareOfSaving)`: the `max(0,...)` means a household buys funds or does not buy funds, and there is no household term in `grossRedeemUSD`, which is built from the institutional `wantDelta` loop alone. Unemployment does not enter the equity decision at all — `equityShareOfSaving` is earnings yield less deposit yield and nothing else — so a job loss slows PURCHASES and never forces a sale. Savings genuinely can drain (`02b`'s deposit inflow takes `savingsRate x income` SIGNED, so a negative rate pulls deposits down), and the equity book still does not move: `household-balance-sheet.ts` marks it as `realClaimsUSD + unmodeledFinancialAssetsUSD`, a valuation of what is held, and nothing reduces what is held. **What this suppresses is the amplifier**: forced selling into a falling market, lower prices, lower wealth, more selling. A drawdown currently has no household seller in it. Owner: HH/DIST tier — the seller is a THRESHOLD decision (sell when the buffer is gone), which is exactly the nonlinearity DIST says must be carried as a distribution rather than a mean. |
| **SOVEREIGN BOOKS HOLD MORE PAPER THAN EXISTS — introduced 2026-08-29, and it is owed** | **Caused by §7.120's seed-scale slice; not a discovery, a debt.** All four regions: the real books together claim more sovereign bonds than `govDebtTranches` says is outstanding — the harness's "a ledger is minting claims" check, the one that catches a missing leg. **It GROWS week over week** (5 weeks per region in a 10-week run), so it is a FLOW and not a seed sizing: the books accumulate sovereign paper faster than issuance creates it, which points at 07c's float rather than the debt seed. The scale change moved GDP 639.2B → 695.7B and sovereign outstanding is `debtToGdpPctBottomUp x derivedNominalGdpUSD` computed at a different point in the seed than the holdings are built — an ordering SUSPECT, not a diagnosis. **These are the only violations left in the 10-week probe (20 of 20). Fix before anything else.** |
| ~~**An MMF's shares have no holders**~~ | **CLOSED (§7.126), and the row's own framing was WRONG.** The shares DO have named holders on both sides — each corporate treasury carries `comp.mmfSharesUSD` and the household sector `hs.mmfSharesUSD`; only the fund-side total is a scalar, which is what a share register looks like when every holder keeps its own book. **What was actually broken were two legs:** the fund paid its yield by ISSUING shares and credited nobody (rule 14), and `evolution.ts` rebuilt `householdState` from a fixed field list that did not name `mmfSharesUSD`, so the household's claim was destroyed weekly and recreated from that week's diversion alone (§7.41, third occurrence). Measured: 41.39B outstanding against 40.34B held by week 6, growing ~0.25B a week; after, the ledger closes to **0.00 in every week**. **The lesson kept: I logged this row from the SHAPE of the code without measuring it, and the shape was fine while two flows were not.** |
owns a pool across seven entity types, and HEDGE_FUND and PENSION_FUND are a manager and a vehicle
in one object. The target is one FUND shape — itemized assets, units held by named holders, a named
manager on a fee, a mandate that drives the bidding — with the ETF as the template. **Owner:
unassigned, and not IND's; IND finishes at firms.** |
| ~~**THE REPO MARKET IS DEAD, AND A CEILING IS AN IDENTITY**~~ | **CLOSED by OWN8 (§7.102).** `investableSurplusUSD` deleted; the sovereign ceiling is now `sovereignBookCapacityUSD` — current book plus the balance sheet the bank's equity supports under the leverage floor, a bound that can exceed the position it bounds. Repo: zero volume in all four regions -> 3 of 4 USA banks borrowing, 46.7B outstanding, interbank lending live and the SRF drawn (18.4B USA, 4.1B JPN) for the first time; the rate now moves inside the corridor instead of printing the early-return floor. USA sovereign book 78B->350B (pre-OWN was 285B), cash/deposits 47-68% -> 7%. **Two things it surfaced, both recorded rather than chased (rule 10):** 46 new `sovBondOwnership` conservation violations — OWN7's defect appearing in a second asset class now that the sovereign book is large, which strengthens the case that OWN7's harness fix comes first; and 16 weeks of USA bank capital ratio out of band, because a bank shifting cash into ZERO-risk-weight bonds grows equity on the carry while RWA (loans only) does not move, and the payout valve is cash-constrained so it cannot bleed off. That second one is a real mechanism, not a bug — it is why the leverage floor exists — but the harness band on a risk-weighted ratio is a poor test of it. Owner: G3, with the §6 USA bank-cohort row. |
| **THE BOOKS PRINT THEIR DAMPERS — promoted from §6.2, 2026-08-29** | The clearing engine states its own failure condition: the damper "must never BIND persistently — a name clamped for weeks on end means the posted schedules disagree with the printed level and the print is the damper, not the market." The watchlist row set the same test ("only wrong if it stays there") at 1,961 bound; the harness now prints **2,549 persistently bound, worst streak 60 weeks in a 60-week run**. The condition is met. This is ONE defect wearing many prints: the FX rate pinning at −8.01% (its damper to the second decimal) 38–39 weeks in 40, and the five books' `MAX_WEEKLY_*_MOVE_PCT` binding across 2,549 instruments — the posted demand does not reach the float it is asked to clear (§7.18's want/have from the demand side). The engine is not the defect; the thin side is. **Owners: G3 (dealer capacity, G3d), SCALE (float), XB6 (the FX flow), HF (the FX elastic side).** Do not widen any damper. |
| **A SHOCK TEST STOPPED MOVING ITS PRICE** | **New 2026-08-29 (§7.107).** `checkSustainedEquityDemandMovesPriceBeyondEps` — sustained institutional equity demand against an otherwise identical control world — no longer moves the name's price. Same signature the sovereign-auction shock test already shows (§6.1's XB row: "demand so far below the enlarged float that both A/B worlds pin at the same bound"), and 07e is the book where that is most likely: its `tradableFloatUSD` is the ENTIRE share count while the only bidders are institutions whose mandates cap them far below it, and the dealer residual that should absorb the rest is dropped unapplied (**G3e**). **Do not weaken the test.** Re-measure when G3e gives the equity book a real float and a real absorber; if it still does not move then, the demand side is the defect. |
| **THE HARNESS IS RED ON PURPOSE WHILE XB RUNS** | **Read this before assuming something is broken.** XB touches ownership, five clearing books, the goods market, the FX market and the dealers at once, so the 60-week harness has been failing by design since XB1 and is NOT to be chased slice by slice (rule 1 of `CLAUDE.md`). **XB3a widened this further**: the goods auction was repartitioned and the RNG stream relabelled, so every count taken before it describes a different world. Last count taken was **66 violations**, dominated by **USA bank NIM out of band** plus one **byte-identical sovereign shock test** (a saturation signature: demand so far below the enlarged float that both A/B worlds pin at the same bound). Two shock tests were already updated because they shocked levers XB deleted; a third may need the same. **Do not fix these individually.** Finish XB3b, then run the harness ONCE (its XB module reports the battery) and attribute properly. If it is still red after XB closes, that is the moment it becomes a defect list. |
| ~~**Invoicing locks to 100% USD by week 5**~~ | **The mechanism was DELETED, not fixed (§7.76 correction).** The lock-in was arithmetic between three weights I invented — a weighted score with an argmax is not how anyone chooses an invoice currency, and reporting its corner solution as a finding about the world was wrong. Invoice currency is now owned by **XB3a-5**, gated on **XB6**: while USD is the FX numéraire the cheapest vehicle currency is decided by the model's plumbing, so the question is not askable yet. |
| **Freight rates run away on some lanes** | **Found by the XB battery (§7.77).** Over 40 weeks EUR>UK goes 6.28 -> 292,929 per tonne and JPN>USA 7.63 -> 704, while EUR>EUR falls 59% and JPN>UK falls 94%. Freight as a share of cargo value then prints above 100% for the bulk goods (upstream_extraction at 58,255%), which is not a price, it is a market that has come apart. Two candidates and they interact: capacity on a lane is a physical stock that cannot respond inside a week, so a demand spike has nothing to meet it; and the rate is quoted in the ORIGIN's money, so a collapsing origin currency inflates it mechanically (see the row below, which is probably the root). **Do not cap the rate** — a bound is not a price (§7.21, §7.75). Diagnose which of the two dominates by holding FX fixed in an A/B, then fix the one that is real. |
| **THE FX RATE IS PRINTING ITS DAMPER, NOT CLEARING — 'a bound is not a price' for the THIRD time** | **Found by the XB battery and then pinned exactly (§7.77).** Measured over 40 weeks: the FX instrument is damper-bound in **39 of 40 weeks for EUR and UK and 38 of 40 for JPN**, and the minimum weekly move is **−8.01% — `MAX_WEEKLY_FX_MOVE_PCT` to the second decimal** — hit again and again in the same direction. Mean move −4%/week, compounding to EUR 1.4655 → 0.2415, UK 1.2650 → 0.2457, JPN 1.3708 → 0.2122: every non-USD currency losing six-sevenths of its value. Converted price levels end at 0.62–0.70 of the USA's instead of converging on 1.000, so the law of one price fails and the competitiveness channel runs one way only. **The number being published is the damper, not a clearing level** — §7.21 recorded this error, §7.75 recorded making it a second time in the FX market, and this is the third. The cause is structural rather than a sign error: the inelastic float (`dealerNetUSD − portfolioUSD − tradeUSD`) systematically exceeds what the elastic side will take, so the solve pins every week. The trade leg's sign is correct (a surplus reduces selling pressure); the candidates are the size of the cross-border settlement flow XB2e registers and the speculators' risk budget against it. **Do not widen the damper and do not cap the float** — find which flow is oversized and why. Owner: **XB6**, which reopens this stage anyway; it is also almost certainly the root of the freight-rate runaway above, since a lane is quoted in its origin's money. **Re-measured 2026-08-29 after the FX mechanism sweep (§7.82):** the pinning persists — 9–28 damper-pinned weeks per pair over 60 — but the direction has moved (EUR now ESCAPES upward, EUR/USA 1.09 → 2.68 by w60, where the XB battery had it collapsing). The reaction function no longer masks the imbalance (the central banks now defend rarely and only past private absorption), so what remains is the float itself: the inelastic flow the elastic side must absorb is still systematically one-way. Root unchanged, owner unchanged. |
| ~~**Input lots accumulate without a consumer**~~ **CLOSED (§7.85, IND1)** — w10 lots 112,598 → 1,017; capital goods now capitalise on delivery and operating purchases are expensed. Original write-up follows. | **Found by the 120-week fatigue probe (2026-08-28), run to answer whether per-week runtime degrades — it does not (10-wk averages 933→864 ms through w100, then 747/676 as trade thins; no fatigue on the current tree).** What the probe did find: total input-inventory lots grow linearly, 112,598 (w10) → 1,003,359 (w100) → 1,047,151 (w120), while every other object stock is flat or shrinking. The mechanism is a bookkeeping asymmetry: stage 05's `addInputInventory` writes a lot for EVERY corporate purchase, but stage 08's FIFO drawdown iterates only the buyer's `CATEGORY_INPUT_REQUIREMENTS` recipe inputs (08-company-fundamentals.ts ~424-448), so lots in capex and general categories are never consumed and never expire. Consequences: memory grows without bound; and the dead lots are VALUED — the fundamentals snapshot sums `unitsHeld × unitPriceUSD` over all lots (08 ~1453), so a firm's input-inventory line quietly compounds with purchases it never uses. Weekly runtime pays a measured ~70 ms/week tax by week 60 (§7.81: valuation re-reduces, first-touch copies of ever-growing arrays, GC share); any future stage that walks all lots re-inherits an O(weeks) cost. The real-world question the fix must answer: what happens to a purchase that is not a recipe input? Capex should become capital (depreciating PP&E), consumables should be expensed on use — a lot is only the right representation for goods that sit in a warehouse awaiting a recipe. **Do not fix by expiring or capping lots** — decide what each purchase physically is and route it there. **Owner: the corporate-financials rebuild (IND), not a standalone patch** — scoped 2026-08-28 after starting the fix showed it touches the whole P&L. The design, ready for IND: (1) classify every corporate purchase by what it physically is — recipe input (the three CATEGORY_INPUT_REQUIREMENTS sub-units) → lot, FIFO as today; capital good (the five CAPEX_SUPPLIER_WEIGHTS categories, no overlap) → NO lot, capitalize into `grossPPEUSD` at landed cost on DELIVERY (arrival week for shipped consignments); operating purchase (everything else) → NO lot, its cost already lives inside the EBITDA-margin accrual and its cash in settled purchases. (2) PP&E roll-forward grows by MEASURED deliveries, not `newCapex/52` — investment becomes supply-constrained, which is the real mechanism; persist `capexDeliveredLastWeekUSD` so stage 05's capacity growth (05:431-436) uses delivered capex less depreciation instead of the growthCapex budget. (3) Cash: drop `newCapex/52` from the accrued-outflows line (08:735) and net the opex accrual against only NON-capex settled purchases — unfilled capex bids keep their cash. (4) One depreciation: the P&L's `da = revenue*0.05` (08:574) and the carrier's `/20` hull line (08:341) both replace with the roll-forward's own sector-life `weeklyDepreciation` — rule 3, one representation. All four write-sites are mapped: 05:372 (contracts), 05:983 (domestic settle), goods-arrival.ts:57 (shipped), plus the private-firm path (08:96-175) which rebuilds from a fixed field list and silently drops lot updates today. |
| **FX swap lines do not exist — and they are the tool real central banks actually use** | **Named in the 2026-08-29 FX sweep (§7.82).** Major-currency central banks almost never intervene in spot; the routine stress instrument is the standing swap-line network — the Fed lends dollars to the ECB/BoJ/BoE against their own money, they on-lend to their banks, and the dollar squeeze clears without a reserve being spent. The model cannot host this yet because the thing a swap line funds does not exist: banks have no foreign-currency FUNDING books (no dollar liabilities against dollar assets, no cross-currency basis to blow out). Prerequisite first — an FX funding market — then the swap line is a small, honest addition. Do NOT bolt on a swap line that lends into no funding gap. |
| **Every real-economy FX conversion happens at MID — the dealer's pip is nobody's cost** | **Named in the 2026-08-29 FX sweep (§7.82).** Stage 05, trade settlement and every other converter use convertLocal at the cleared mid rate; the desks that make the market and now warehouse its residual (§7.82) earn nothing, and crediting them a spread without a payer would print money (rule 3). The fix runs through the payers: conversions price at the dealer's bid/ask, the pip lands on the desk as real revenue, and the client's landed cost carries it. Small, but it is the FX desks' entire client P&L. |
| **Logistics is 0.4% of GDP against a real 5-6%** | **Found by the XB battery (§7.77).** The sector exists and every dollar of it reaches a named carrier, but it is an order of magnitude too small. Domestic tonnage is the gap: in reality inland freight dwarfs the international kind, and here the merit order still sends buyers abroad on 3-6% price differences because the frictions that keep sourcing local — reliability, relationships, minimum order sizes, the distributor between a household and a foreign seller — are not modelled. Watch it up as those land; do NOT inflate freight rates to close it. |
| **G1b — the inflation escape** | The measured band is SEED-SENSITIVE: one world holds −10..0%, others escape upward by week 40 (the default-stream world reaches 50%+ by week 52 with the 10Y following to 17%). **The measurement is not at fault** — the goods market's prices really do move that much. G2 measurably damped it and did not cure it (0.66% of demand against a goods cycle orders of magnitude larger), exactly as predicted. Remaining owners: **MS** (the household rate response, the missing stabiliser) and **PUB** (the fiscal loop). Two diagnostics still unrun and worth doing first: trace one sub-unit's price, supply and demand over 120 weeks for a long-wavelength cobweb; and consider whether stage 05's real bid and offer prices should carry an expectations term — a genuine behavioural channel, since anchored expectations damp actual price setting. **Do not** smooth the index, widen the basket, or clamp inflation: the index is the measurement, and if it is volatile the economy is. |
| ~~**The institutional Company and the InstitutionalEntity are two firms**~~ | **Insurer half CLOSED (§7.51).** Found in HH1 (§7.49). `UXZG` is an insurer whose Company shell reports 0.05B of revenue and 0.10B of market cap while its Entity holds **241.4B** of assets against 19.5B of its own equity — a company trading at 1/200th of its own book. Asset managers were reconciled by S11 (`aumUSD = entity.totalAssetsUSD`), and HH1b now seeds them consistently, but the INSURER branch still refuses the entity on a justification that is stale — it predates S11 making `totalAssetsUSD` a real per-firm marked book — so its float is `annualRevenue x 5` and its `technicalReservesUSD` prints 0.2B against a 221.9B beneficiary liability: the same insurer's obligations represented twice, three orders of magnitude apart. **Correction to the first write-up of this row:** pension and hedge funds do NOT fall through to the consumer-revenue path — they carry the `ASSET_MANAGER` profile and already read the entity's real book, which S11 wired. The insurer is the one disconnected representation. The insurer now reads its entity: reserves ARE the beneficiary liability (223.0B, one number instead of 0.2B beside 221.9B), premiums come off real capital at the regulator's premium-to-surplus ratio, and investment income is what its own portfolio actually earned. Market cap 0.10B → 51.0B against 19.5B of book. **What remains of HH1b is deriving the required-return constants**, which needs the liability FLOWS (premiums paid by real payers, claims to real claimants) that HH1c owns. |
| ~~**#67 — USA bank capital → 0**~~ | **CLOSED (§7.55) — re-measured after HH3 and the collapse is gone.** Capital ratio runs 11.6% → 14.7% through week 80 (was: → 0 by week ~70), NIM in band throughout. The bleed was the fictional consumer book: a formula target earning a formula yield and losing a formula loss rate, none of which the bank's capital could price or gate. With the book real — real margins quoted off measured tier losses, real amortization, origination capital-gated at the 8% floor — the banking system carries its full household book and earns its keep. |
| ~~**#18 — companies at the revenue floor**~~ | **CLOSED (§7.49), and the diagnosis was wrong for a year.** The four names were the four regional HEDGE FUNDS, whose "revenue" is a fee on their book — the harness was applying an operating company's growth ceiling to a fund. And they had not grown: their book SHRANK 76.8B → 62.4B while the reported revenue rose 29x, because the generator seeded `aumUSD` as a multiple of an operating company's revenue while the entity carried the real marked book. A §7.4 cold start, not a runaway. Seeding the shell at the size it actually manages took it to 1.1x. |
| ~~**Household deposits: two representations**~~ | **CLOSED (§7.57, HH4d).** The banks' `depositsUSD` IS the household stock now, split from `wholesaleFundingUSD` at seed (418B USA — the funding that was wearing the deposit label), moved by named flows only, reconciled to the household state weekly with the identity asserted (0.1% band, 60 weeks green). The closing invariant also caught bank M&A stranding the target's whole balance sheet — fixed in stage 10. |
| **Equity prices run away past ~week 80** | **Found by the HH close-out battery (§7.60); NOT HH's.** Median USA share price runs 7.9 (w80) → 184 (w100) → 5,048 (w120) while median EPS moves 0.39 → 0.57 — an implied ~8,850x earnings. Institutional claims stay flat at ~530B, housing/deposits/debt are all sane, so it is the equity market alone; household net worth only shows it because HH2/HH4c correctly mark households to it (568x income at w120). Consistent with the §6 damper-bound watchlist plus §7.18's want/have: a growing pool of money chasing a fixed float, printing at the damper limit week after week, which compounds. **The 60-week harness cannot see this** — prices are still sane at w60 — so the first action is a longer harness window, then the real fix is asset supply (**SCALE**'s bigger universe, **HC** births, **G3**/ETF2's dealer capacity), not a cap on the price. |
| **Real growth prints escape at horizon** | **Found in HH2, pre-existing, unowned.** Consumption growth −105.91% and GDP growth −209.30% at week 60. A/B against the pre-HH2 tree: −119.87% / −209.30%, GDP identical to four significant figures — so this is not HH2's, and HH2 slightly damps it. **Nothing in §6 recorded it and the harness does not check it**, which is the first thing to fix: a growth rate that can print −200% is a band the harness should assert. Likely the same family as G1b (the price level escaping takes the real deflator with it), but a different symptom and worth confirming separately before assuming so — if real growth is being deflated by an escaping index, the defect is G1b's; if the nominal path itself collapses, it is not. |
| **An ETF pays out net assets it does not have** | **Found in PUB1d (§7.65); owner ETF2, not PUB.** `USA_IG_ETF` runs cash 0.04B (w13) → **−47.9B** (w26) against a 14.5B holdings book — **net assets −33.4B**, a fund that owes more than it owns. The signature is a steady ~3.5B/week outflow while holdings barely move and shares outstanding fall 2.3e8 → 1.7e7: redemptions keep paying cash out after `navPerShare` has already gone to 0.0000 because `navUSD` is non-positive. The per-book purchase budgets are sound (`etf-demand.ts` and 07b both cap at `max(0, cashUSD)`), so the leak is on the **redemption** side of `etf-flows.ts`, not the buy side. Present identically before and after PUB1d — do not re-attribute it to sovereign placement. The invariants harness does not assert non-negative fund net assets; adding that assert is the first action. |
| **The central bank intervenes in FX with its BOND book — a live bug** | **Introduced in XB2d, shipped, must be fixed before XB closes.** `fx-clearing.ts` sizes the central bank's FX participation off `centralBankAssetsUSD(cb)`, which returns its DOMESTIC SOVEREIGN book (100–140B). A central bank does not intervene with its own government bonds; it intervenes with **FX reserves**, which do not exist in this model. Three consequences: the CB bids with the wrong (and large) balance sheet, intervention never changes reserves — buying your own currency should DEPLETE them — and the PUB2a identity `assets = reserves + TGA + currency` has no FX line, so a reserve stock would not close it. See **XB5** in §5. |
| **Does the treasury optimise issuance on the curve? — A DECISION, not a defect** | **Needs a user answer; do not change it unilaterally.** The model's treasury leans opportunistically in two places: the bill share via `costLean = clamp(±0.05, (2Y − 3M) × 2)`, and the bond tenor mix via `steepnessAdjustment = (30Y − 2Y) × 3` in `11-fiscal-and-sovereign-debt.ts` — so a 1pp steepening shifts ~1.5pp of issuance into the 2Y. Real debt-management offices run "regular and predictable" and explicitly do NOT time the curve, because surprising the market lifts the term premium by more than the tactical saving. So this model's issuer exploits a curve the model itself produces. Options: keep it, damp the coefficients, or replace with a published-calendar rule. |
| **THE USA BANK COHORT — DIAGNOSED (§7.86): NOT A BANK DEFECT** | **Re-measured at BP1's close (§7.84): 41 of the harness's 47 violations are this one story** — 26 weeks of USA bank NIM out of band (running NEGATIVE from w38, reaching −0.057) and 15 weeks of USA bank capital ratio out of band. This row previously read "effectively resolved, one breach-week at w60, do not open work unless it regrows": it regrew. Two independent measurements now point at it (the FX sweep first, §7.82, then BP1's close-out), and a bank earning a negative interest margin for twenty-three consecutive weeks while its capital ratio leaves its band is a mechanism defect, not a band-tuning question. **Do not widen the bands.** **Diagnosed 2026-08-29 (§7.86) — the bank arithmetic is largely right; the collapse is produced by three things none of which the bank owns.** (1) **Corporate cash lives outside the banking system**: a company payment moves the payer's and payee's S5 ledgers and no bank's book, so `corporateDepositsUSD` is a VIEW with no matching asset — proven by attempting the opposite, which broke the per-bank identity by exactly that line's size (1,012 violations, reverted). Households are therefore the ONLY deposit base, covering ~52% of assets, so the banks run ~48% wholesale funding against a real-world ~10-20%. (2) **That wholesale funding reprices instantly with policy while the asset book cannot** — 506B of household loans at fixed WAC plus ~290B of sovereigns at old coupons — so the margin inverts as soon as policy passes the book's yield: a real unhedged duration mismatch, and the model has no hedging (**DER**). (3) **Policy reaches 7-10% only because of the §6 inflation escape** (G1b); at the seed's 3.8% the margin is healthy (0.028). **The fix is the corporate-cash boundary, not the bank** — CASH, closed §7.103. **That gate has now lifted:** corporate, institutional, segment and boundary money are all real bank liabilities, the clearing books settle through the banks' reserves, and the per-bank identity holds every week. Cause (1) is gone; (2) is DER's and (3) is MAC's. **Re-measure NIM and the capital band before assuming either.** One data point already: the USA capital-band family went 16 weeks → 0 at SETL6, with no band touched. |

| **`unmodeledFinancialAssetsUSD`** | **The scoreboard for HH, not a watch item.** 1,605B at week 40, and §7.48 identified where 46% of it already is: 740B of insurance reserves, pension entitlements and fund shares sitting on institutional balance sheets as assets with **no holder**. It is not the universe being too small — the model contains it and does not attribute it. HH1 closed that 740B on both sides at once; HH2 added the house (3,188B of stock, 2,127B of home equity), taking net worth to 4,730B and 4.61x income. Watch this line fall toward zero as each slice lands. |
| ~~**The corporate books hold more paper than exists**~~ | **CLOSED by OWN7 (§7.104).** Harness 602 → 107, and every ownership and conservation family with it. Both red invariants were examined first, as this row demanded: `checkHoldingsLedgerConservation` was genuinely measuring the wrong thing (holder-region against issuer-region, plus three real holders left off entirely) and `checkOwnershipConservation` was correct with a stale comment. The shrink itself was **the float**: 07c and 07f sold the whole issue while the central bank (on a no-order week) and the corporate treasuries sat outside the book still holding theirs — 114% → 97% with a real household residual. Two more: the register counted SME POOL loans as corporate ownership (~22%, rule 3), and a merger left the target's paper on its holders' books while the same principal was re-cleared from the acquirer's ladder. What is left is one defaulted issuer in one week of sixty — **G5's**, and now its opening measurement. |
| ~~**Bank employees are paid by nobody**~~ | **CLOSED by IND-R1 (§7.108) — for banks.** Payroll, capex and input purchases are computed BEFORE the profile dispatch now, so every firm with staff owes them a wage whatever profile prices its revenue; the bank cash walk pays it and the instruction reaches a household. **The same defect is still live at 46x the size one branch further down:** 1,712 private firms employing 8.20M people return before the payroll block, so 67% of the USA's named wage bill still never reaches a household. That half is IND-R6's (§7.115), not a §6 row — it has an owner. |
| **The dealer desk is one regional book pretending to be four** | **Found 2026-08-29.** `corpBondDealerInventory` / `sovBondDealerInventory` / `loanDealerInventory` are written ONLY on `reg.bankingSector` (07b:416, 07c:480, 07d:391, 07f:315), and `02b-bank-diversification.ts:369-374` then copies that same regional array onto every bank's sheet — four banks each carrying an identical book that is actually one. The P&L is split by `bankMarketShare` (07b:421, 07c:484, 07d:396, 07f:293). Two rules at once: rule 3, one real thing with two representations and nothing reconciling them; rule 13, no bank DECIDED to take that inventory and no bank's capital constrains it — the same "a share owning nothing" pattern OWN spent six slices removing from the ownership registers. Note the split itself is right and must survive: an investment book (`sovereignBondHoldingsByTenor`) and a market-maker's inventory are genuinely different businesses, and rule 15's saturation clearing needs somewhere to put the residual. What is wrong is that the desk has no owner. **Sharpened by SETL6 (§7.103):** now that the cleared books settle through a clearing house, the desk's cash leg is explicit and it has no payer — `<book> dealer inventory` is the largest remaining boundary line, and it is the exact measure of this defect. A desk with no owner has no reserves to pay with. **Owner: G3 (G3e) — this is its opening finding, and that line going to zero is how it closes.** |
| **Banks opt out of the corporate operating model, not just its P&L** — **MOSTLY CLOSED 2026-08-29** | **Found 2026-08-29; three of its four halves are done.** `profileKeyOf` still routes a bank to `profiles/bank.ts`, but that module is no longer a REPLACEMENT for the operating model: payroll, capex and inputs are common to every firm (IND-R1, §7.108), loan losses are the bank's own measured rate on the books that actually carry credit rather than `random() * 0.05 * assets` (IND-R4's first half, §7.109), and opening revenue is `earning assets x the region's NIM` instead of a Pareto draw (IND-R5, §7.109). **What remains after IND3 is the PROFILE CONTRACT, and it is one step (§7.122).** `ProfilePnl` lets a profile return `newEbitdaMargin` and `newEbitda` — permission to STATE a margin, which is why a bank's is still `0.40` while the operating path now builds EBITDA up from real costs (§7.121). Invert it: a profile returns its revenue mechanism and its own extra cost lines (a bank's loan losses and funding cost, an insurer's claims and reserve movement), and shared code does `EBITDA = revenue − inputs − payroll − otherOpex − profileCosts`. That one change also retires IND-R4's `INSURER_EXPENSE_RATIO` and `CARD_OPERATING_COST_BPS` instead of deleting them one at a time. **And one blocker CHAIN-D created:** a recipe is now a property of a PRODUCT, and IND-R2 correctly gave financials no product line — so a firm that sells nothing now BUYS nothing, and a bank purchases none of the services it obviously does. Financials need an input basket keyed to their profile rather than to an output. **Owner: IND.** |
| **The institutional sector's opening size is still assigned** | **Named by OWN6 (2026-08-29), with its size and its closing slice.** `INSTITUTIONAL_OPENING_BOOK_SHARE = { equity 0.42, corpBond 0.45, sovBond 0.30 }` in `simulation/initialization.ts` — read once at week 0, never weekly, and NOT an ownership share (the registers are measured; nothing in the engine reads one to decide anything any more). It survives because the seed is circular: an entity's `totalAssetsUSD` is `institutionalMarketShare × the sector aggregate`, and the sector aggregate is these three numbers times the market. Breaking it means anchoring an institution on what it OWES — the pension and insurance claims households hold against it — and `beneficiaryLiabilityUSD` is today derived FROM assets (`household-balance-sheet.ts:73`), so that anchor does not exist yet. **Closing slice:** make `beneficiaryLiabilityUSD` a real claim built from the household side, then size the entity from it. Until then this is a named gap with a size, an owner and a scheduled close, which is what rule 13 requires of one. |

### 6.2 Watchlist — measure, do not fix

| Metric | Why it is here |
|---|---|
| ~~**Damper-bound instruments**~~ | **PROMOTED to §6.1 (2026-08-29).** This row's own test — "only wrong if it stays there" — was met: 2,549 bound with a 60-week worst streak in a 60-week run. |
| **Index funds without a buyer** | Was 15 of 27; **MS1 took it to 10** by adding households, who index everything and fill all four broad-market funds (§7.47). The diagnosis in this row was partly wrong and worth correcting: the empty all-cap funds were not a universe-size problem, they were a missing SECTOR. What remains — the large-cap and high-yield funds — is the genuine version: ~25 large-cap names and 8–65 HY issuers are few enough for any institution here to research directly, and households buy the broad market rather than a size tier. That closes as HC births, real IPOs and BP1's registry grow the universe. **Still do NOT tune the research-capacity primitive until the funds fill** — that would be fitting a constant to a desired outcome. |
| **`unmodeledCapitalReceiptShareOfIncome`** | HH4b's named residual: the slice of the debt-service recycle whose return path to household income is unbuilt (bank retained earnings, institutional dividend passthrough). Derived once at seed (≈ debt service less deposit interest, per region), it decays only when a receipt channel becomes real — real institutional dividend income to claims (CAL/PUB territory), real bank payout routing. Watch it DOWN like the unmodeled-assets line; never re-derive it to a bigger value. |
| ~~**Bottom-up GDP below the supply anchor**~~ | **The comparison no longer exists — do not re-measure it this way.** HH5's scope named a 6–9% permanent output gap between bottom-up GDP and the supply-side anchor. Re-measured at the start of HH6 it prints exactly 0.0% every week from week 1, because `estimatedNominalGdpUSD` is now set to `lastWeekNominalGdpUSD` — the anchor IS the lagged bottom-up series, so the test compares a number to a copy of itself. The gap is neither closed nor open; the independent supply-side anchor was collapsed into the demand-side measure by an earlier change and nothing records when. A real potential-output series (PUB's, or a capital-and-labor production function) has to exist before this can be asked again. |
| **`governmentInterestToUnmodeledHoldersUSD`** | PUB1a's named boundary: ~48% of the government's interest bill has no recipient, because the central bank (15% of the stock) and foreign holders (24%) are not entities yet. The debit is real and the crowding-out it causes is real; the credit is missing. **PUB2** closes the central-bank half — and in reality that half is remitted straight back to the treasury, so it is a wash rather than a cost — and **XB** closes the foreign half, which genuinely does leave. Watch this line down; do not net it out by shrinking the interest bill, which would understate the debt burden. |
| ~~**`unmodeledTaxRevenueUSD`**~~ | **CLOSED (§7.64).** PUB1c added the two missing instruments — employer payroll tax and consumption tax — and real collections went ~50% → 99–100% of revenue. The line stays in the code as the honest residual if a future change outruns the bases again; it currently reads 0.00B. |
| **TGA level over a quarter-scale horizon** | Watch, do not chase (rule 10). **Re-measured after PUB1d** as that row asked: the account no longer drifts monotonically — it now sawtooths, filling on the quarterly remittance dates and drawing down between them (39 → 33 → 66 → 59 → 51 → 44 → 86B over 26 weeks), which is the shape a treasury balance actually has. What remains is the LEVEL at each quarter's peak creeping up, because receipts are larger than the old formula assumed and spending catches up a week later. Re-measure once PUB1e puts procurement through real bids. |
| **Occupational mismatch** | HH5's labor market exposes it for the first time: at week 40 one occupation runs tight (V/U≈40, wage growth at its cap) while two carry real unemployment against zero vacancies. The seed no longer causes it (§7.58 removed the arbitrary slack multipliers), so what remains is produced by the sector composition moving faster than the retraining flow can follow. **HH6** owns the response — a firm that cannot fill a role raises its offered wage, which is what should pull workers across. Measure the spread of V/U across occupations before and after HH6; do NOT tune the retraining speeds to flatten it first. |
| **Sovereign price elasticity to a size-only bidder** | **Found in PUB2b (§7.66).** A 34B difference in the central bank's book moved the USA 2Y by ~490bp at w30 — a very high elasticity for a market that size. Consistent with the damper watch above (1,964 instruments persistently bound: the books ARE thin, so an inelastic buyer has to move the level a long way to find sellers), and with §7.18's want/have. **Do not soften it in the clearing engine** — prices are cleared, and tuning the auction to produce a gentler response would be fitting the mechanism to a desired number. It should fall as **SCALE** and **G3** grow the universe and the dealer's capacity; re-measure then. |
| **The goods market cannot fill a quarter of what is bid** | **Found in PUB1e (§7.67).** ~25% of the government's procurement budget goes unfilled at any price: aggregate bids exceed aggregate supply and every in-money bidder is rationed pro-rata, so households are short by the same ratio. Long-standing and not PUB's — it only became visible because the government is the first buyer whose unfilled demand costs something. **Do not close it by shrinking the bids**: the demand is real and the supply side is what is missing. Expect it to fall as **SCALE** grows the firm universe and **BP1**'s taxonomy lets more sub-units be supplied; re-measure the fill ratio then. **§7.69 (PUB3a) then closed most of it**: with the government's payroll carved out of the primary budget, the procurement budget is one the market can supply — unspent 22.7B/wk → **1.3B/wk**, fill range 7.7–87.5% → **46.3–100%**. The row was measuring an oversized budget as much as a short market. What remains is the genuine shortage; re-measure as **SCALE** and **BP1** grow the supply side. |
| ~~**The whole fiscal block is indexed to a lagged nominal aggregate**~~ | **CLOSED (§7.70).** The budget is a sum of real obligations and the deficit is an outcome; cash-management bills (PUB3c) bridge the treasury's account between quarterly bond auctions, so the TGA is never negative. What replaces it is not a defect but a RESULT to watch: outlays now outgrow revenue (x14.8 against x9.3, trailing-annual) and debt/GDP runs to 213%, because obligations index to wages while the tax bases do not. That is a real fiscal dynamic, now financed by real issuance. **Watch, do not damp revenue or cap the deficit** — re-measure once the §6 inflation escape is closed, since the wage/base wedge is largely its shadow. |
| **`unbackedBankCashUSD` explodes past the harness window** | **Found by the PUB battery (§7.68).** 97B (w13) → 107B (w52) → **2,183B (w120)**. PUB2b shrank it at w52 (304B → 100B) by giving the central bank a live book, and that fix holds — but reserves grow from deposits and lending far faster than any central-bank purchase backs them once the escape takes hold. **The 60-week harness cannot see this.** Owners: the §6 inflation escape first, then whatever gives bank reserves a single representation. Watch it, do not force the identity closed. |
| **Household income: a top-down statistic against a bottom-up sum** | **Opened by SEG (§7.96).** What employers actually pay households is now measured — named firms' payroll, government payroll, and the SME pools' own wage bill at `SME_WAGE_GAP` below the average — while `estimatedHouseholdIncomeUSD` remains the top-down anchor that sizes consumption, the tax base and the per-worker wage those payments are computed FROM. The two now visibly disagree and nothing reconciles them; the wage gap widened it deliberately, because the alternative was a tier insolvent from week 0. This is the last big "two representations of one thing" in the household sector (rule 3). Fix by making income the sum of payments and re-deriving what currently reads the anchor — do NOT close it by removing the wage gap, which would restore the insolvency. |
| **The named private tier still sells nothing** | **Restated by SEG (§7.96), owner HC3b.** SEG gave born firms real product lines from their pool's industry; the ~300 seeded private firms per region still carry `productLines: []` and cannot participate in any auction. HC3b deferred that with a measurement (−10% to −22% growth when the tier's supply was injected into markets sized for public supply), and SEG deliberately did not reverse it. Now cheaper to revisit than it was: the SME pools already sell across all 36 sub-units, so the taxonomy's supply side is no longer calibrated to public firms alone. Re-measure the supply/demand balance per industry (SEG's seed probe put it at 1.12 overall, 0.29–3.20 by industry) before deciding. |
| ~~**The seed's three employment primitives disagree**~~ | **CLOSED 2026-08-29 (§7.118-121).** The three were the labour force, the named tier's share of demand, and revenue-per-employee — and they agreed only because two of them were STATED to. All three are derived now: headcount is value added over output per worker for every tier through one function (§7.119), the tiers PARTITION demand instead of each taking a share of it (§7.120), and the demand they partition carries intermediate demand at last (§7.118). Measured: seed unemployment USA/EUR/UK/JPN **10.5/25.7/17.9/23.5% → 20.3/17.9/10.6/21.3%**, in band in all four regions in every week of a ten-week run, and firm value added against GDP 0.533 → 0.888. **Its own instruction held and is worth keeping:** it was not fixed by restoring a residual, widening the band, or normalising the multiples — the multiples were deleted. **What it did NOT fix is the horizon**, which is the deflation spiral and is item 1's. |
| **Loan-book Spearman noise** | Spearman(leverage, DM) runs 0.26–0.76 across weeks where the bond book holds 0.78–0.93 — consistent with sampling noise at 23–32 names per region. Re-measure as the loan universe grows; if it persists at larger n it is a real defect. |

### 6.3 Rule audit — what the 2026-08-29 sweep found, and what is still open

Swept all 153 files / 37,284 lines: read in full through `domain/`, `bootstrap/`, `macro/` and the
small stages, and every remaining line scanned for the violation shapes (clamps on economic
quantities, imposed shares, formula-set prices, real-world names, magic coefficients) with the
context of each hit read. Ordered by how much they decide. **Rows struck through are closed; the
rest name the §4 item that owns them.** This list is what decides an outcome the model should
produce — it excludes the primitives the rules explicitly allow (lane distances, value densities,
tax and replacement rates, regulatory ratios, the administered corridor spreads, the seed-shape
constants §7.4 sanctions), which were checked and left.

**A. The top-down core — imposed shares that decide aggregates**

| Where | What | Rule |
|---|---|---|
| `bootstrap/national-accounts.ts` | `LABOR_SHARE_OF_OUTPUT` 0.62, `HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT` 0.13, `GOV_PROCUREMENT_SHARE_OF_SPENDING` 0.35, `HOUSEHOLD_EFFECTIVE_TAX_RATE` 0.1322 **solved from the identity**. `assertHouseholdIncomeIdentity` then ENFORCES them at startup. The file's own header says they are placeholders "replaced by the flows themselves" once households are real agents. | 4, 13 — **COH** (COH3 retires the module) |
| `bootstrap/labor-and-wages.ts:70` | `getBaseAnnualWageUSD` = productivity × labor share. **The wage LEVEL is an accounting identity**, not a market outcome — the root of the employment collapse when wages became real payments. | 13 — **COH** |
| `macro/household-cohorts.ts` | **Nine** imposed distribution tables (`TIER_OCCUPATION_MIXES`, `TIER_WAGE_MULTIPLIER`, `TIER_TAX_RATE_MULTIPLIER`, `TIER_TRANSFER_WEIGHT`, `TIER_RESIDUAL_RECEIPT_WEIGHT`, `TIER_DEBT_SERVICE_WEIGHT`, `TIER_SPEND_MIX`, `TIER_BALANCE_SHEET_WEIGHTS`, `TIER_WEALTH_MPC`). The whole household cross-section — who earns, owns, pays tax and spends on what — is stated. `TIER_BALANCE_SHEET_WEIGHTS` is documented "US SCF-shaped": an observed real-world distribution. `TIER_SPEND_MIX` is "calibrated so the blend reproduces" a target. | 4, 13 — **COH** (one defect, not nine: cohorts get balance sheets) |
| `macro/initialization.ts:29` | `createWealthDistribution` — income and net-worth shares per tier, savings rates, equity exposure, `netWorth = income × 3.5`. The wealth distribution is an input. | 4, 13 — **COH** (survives only as the seed's opening allocation) |
| ~~`macro/initialization.ts:183`~~ | ~~**`OWNERSHIP_SHARES`**~~ **CLOSED by OWN1–OWN6 (§7.98).** Deleted. The registers are measured off the real books each week and nothing in the engine reads one to decide anything. What the deletion left behind is recorded in §6.1 (the corporate over-holding it exposed, and the institutional opening size that is still assigned). | 13 |
| `bootstrap/firms.ts:245-279` | `institutionalMarketShare` (.42/.17/.10/.06/.18/.07) imposed by rank and never moved by performance — still open, and the sibling of §6.1's institutional-opening-size row. **`bankMarketShare` CLOSED by OWN5 (§7.98):** measured weekly in 02b as the deposits the bank actually holds over its region's; the seed value is the cohort's own firm-size curve. The old `0.35 × 0.72^rank` used a second private concentration decay and summed to **0.914**, so 8.6% of every regional banking aggregate was carved out to no bank at all. | 13 — **§6.1's institutional-opening-size row** |
| ~~`stages/shared-helpers.ts:210-211`~~ | **CLOSED by OWN1 (§7.98).** `computeTargetOwnershipShares`, its two sensitivity coefficients, the 0.05 drift, both bands and `MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE` are deleted. Worth recording why the 0.85 rescale mattered: it made the harness's ownership-conservation check pass BY CONSTRUCTION, which is why removing it turned up §6.1's over-holding immediately. | 2, 5, 13 |

**B. Prices and rates set by formula rather than cleared**

| Where | What | Rule |
|---|---|---|
| `macro/evolution.ts:743-747` — **HSG** | **House prices**: `priceIndexDelta = (1 − supplyDemandRatio) × 0.002 × creditFactor`, index clamped [0.5, 3.0]. Housing is on household balance sheets and drives the wealth effect. | 1, 2 |
| `macro/evolution.ts:553-560` — **CRD** | Consumer credit tier interest rates: `avgInterestRate + creditConditionsIndex × 0.05/0.03/0.01/0.005`. A price moved by an index. | 1 |
| `macro/evolution.ts:215` — **FRM** (its measured replacement exists and is unread) | `newWageGrowth = 0.025 + 0.8 × slack + 0.1 × expectedInflation` — a Phillips curve with invented coefficients setting the wage. | 1, 13 |
| `macro/evolution.ts:248-251` — **MAC** | The savings RATE (hence consumption, hence C) from `0.05 + inflationGap × 0.5 − 0.1 × CCI-gap + realRateGap × 0.4`. | 13 |
| `macro/evolution.ts:220` — **MAC** | Consumer confidence from coefficients 150/200/80/1000, then clamped [30, 170]. | 2, 13 |
| `macro/banking.ts:302` — **CRD** | `creditConditionsIndex = capitalGap × 8 + (0.025 − NIM) × 10 + spillover`, which then drives credit conditions and the tier rates above. | 13 |
| `macro/banking.ts:240` — **G3** | Deposit beta floor `policyRate × 0.45`; `:281` payout ratio step function; `:286` universal 14% target capital. | 13 |
| `stages/05-unit-bidding.ts:1273` — **CAP** | Contract price = published price × `(1 − (bargainingPower − 0.3) × 0.05)`. | 1, 15 |
| ~~`domain/dealer-derivatives.ts:106`~~ | ~~`FX_SPOT_PRICE_IMPACT_PER_GDP`~~ **DELETED by the review (§7.100)** — it was DEAD: no consumer anywhere since FX started clearing in a real book. The audit listed it as live; it was not. | 1 |

**C. Clamps on economic quantities (rule 2)** — owners: CAP, MAC, IDX, CRD, NAT, DEM. **The review added six the audit missed** (§7.100): the EBITDA margin held in [2%, 65%] so no firm can report an operating loss (`08:451` — CAP0, and it gates the rest of CAP); the $0.10 floor on 07e's cleared stock price (`08:1424` — IDX); measured GDP growth clamped ±4%/wk — a bounded STATISTIC (`11:130`); the growth-capex floor `max(0.4, …)` (`08:675` — CAP); the SME offer floor at half reference (`05:572` — CAP); the input-supply floor 0.3 (`05:431` — CAP).

~~`labor-market.ts:435` unemployment [0, 0.5]~~ and ~~wage index [0.1, 20] / wage growth [−20%, +35%]~~ **deleted by LAB**, which is how §6.1's seed-employment row became visible. Still standing: firm revenue growth ±5%/wk (`08:499`), **CDS spread [10, 5000] bps**
(`08:1301`), leverage [0,100] and coverage [±50] (`08:830/835`), Tobin's Q [0.1,10]
(`08:438/627`), production throttle [0.3,1.0] and capacity growth ±2% (`05:469/496`), cost rate
[0.40,0.98] (`05:505`),
**equity index change ±15%/wk** (`macro/indices.ts:45` — which would mask §6's equity runaway in
the published index), expected inflation [−20%,+50%], effective tax rate [10%,50%], population
growth, migration, mortgage growth ±, commodity supply drift ±4%, savings cap 90% of disposable.

**D. Rule 4 — real-world names and data** — owners: IDX for the index and central-bank brands (the review adds: the brands are in `domain/markets.ts`'s TYPE FIELDS too, and a 4.75% hardcoded policy rate sits in the trade ticket), NAT for the geography AND the back-solved commodity prices (crude $76, gold $2,730 — §7.100), COH for the SCF citation

`macro/indices.ts` publishes **'S&P 500 Composite', 'Euro Stoxx 50', 'FTSE 100', 'Nikkei 225',
'S&P GSCI Commodity Index'** — real index brands, in the UI. `macro/initialization.ts:147`
names 'Federal Reserve', 'Bank of England', 'Bank of Japan', 'European Central Bank'.
`macro/weather.ts` uses real geography ('Midwest', 'Great Plains', 'North Sea', 'Mediterranean').
`household-cohorts.ts:96` cites the US SCF. (`newsGenerator.ts:226` records that an earlier
real-world-reference block was already deleted for this rule — the same standard applies here.)

**E. Outcomes imposed rather than transmitted** — owners: NAT for weather (the two dead impact fields: 14 writes, 0 reads), DYN for market structure, FRM for the seeded fiscal ratios and the assigned sovereign rating

`macro/weather.ts` gives every weather event a stated `gdpImpactPct` and `inflationImpactPct`.
The file `macro/evolution.ts:75` correctly deleted the CPI shortcut for exactly this reason —
bad weather should reach prices through real crop supply — but the GDP and inflation impact
fields remain and are still carried on the state. `bootstrap/firms.ts:214` fixes market
structure (10 firms/sector, flat across regions). `macro/initialization.ts:163-166` seeds
`EFFECTIVE_TAX_RATE`, `FISCAL_DEFICIT_PCT_GDP`, `DEBT_TO_GDP_PCT` and government employment
share — a deficit and a debt ratio are outcomes.

**F. Two representations (rule 3), live** — owners: COH for the deposit-interest duplicate, GUARD for `safeRate` and its four siblings (the silent-default family, §7.100), plus two the review added: `institutionalRole` inlined in `company.ts` has DRIFTED from `InstitutionalEntityType` (PE/MMF/ETF missing — §7.5's shape), and the three tax rates with no owner (TAXR)

`macro/evolution.ts:452` still derives household deposit interest as `deposits × policyRate × 0.6`
for the cohort allocation while the banks now report what they actually paid
(`householdDepositInterestWeeklyUSD`) — two numbers for one flow, introduced by the HH work in
progress and to be collapsed onto the measured one. `domain/currency.ts:30` `safeRate()` silently
returns 1 for a non-finite or zero FX rate — a default standing in for a broken read, the shape
§7.94 was found by.

### 6.4 The clamp-removal discipline

**The rule, which outlives the programme.** A clamp is a missing mechanism wearing a number.
Removing one without building its mechanism is not a fix — it was tried on the wage on 2026-08-29
and produced a 30–50% unemployment cascade in all four regions, which the unemployment clamp then
hid. So: **no clamp is deleted except in the same commit as the system that makes it
unnecessary**, and every clamp still standing names the project that will delete it.

**Not in scope — genuine mathematical guards, which rule 2 permits.** `Math.max(0, x)` on a
quantity that cannot be negative; a probability held to [0,1];
`Math.min(matches, vacancies, seekers)` (a hire cannot exceed either stock — an accounting
identity); `Math.max(1, divisor)` where the divisor is structurally positive. These were checked
across the whole codebase and left. Everything the programme touches decides an outcome.

**The eight projects it opened are now ordinary §4 items**, each in its proper tier rather than on
a separate track: **LAB** (closed, harness 405 → 88), **OWN** (closed §7.98, §7.104),
then **CAP** 6, **MAC** 9, **IDX** 10, **CRD** 12, **HSG** 13, **NAT** 18. Each §5 entry lists the
clamps it deletes and the mechanism that replaces them. **The review extended CAP's list with the
clamp that gates all its others** — the EBITDA margin held in [2%, 65%] — and added five more to
the inventory (§6.3-C).

## 7. Record & lessons (do not re-learn)

Numbering is referenced from §5 and §6 — never renumber. Each entry: what was wrong, the number
that proved it, the lesson.

1. **"1$ is 1$" is at rest.** Goods-side dollars are traceable: real auctions, pro-rata clearing
   (price-priority starves low bidders — never regress), per-lot FIFO input provenance, capex as
   real bids, private sector as named participant, commodities linked to real producers.
2. **Sovereign demand signals.** An invented fair-yield level has no relation to the bootstrapped
   curve and runs away; trend-following yield signals also run away. Use mean-reverting
   recent-change signals — sovereigns carry no credit risk, so a yield move is a valuation event.
3. **Targets are relative weights on real pools.** `pct × totalAssets` sums to ~2.8x the real
   market; distribute an already-bounded aggregate (`ownershipShare × outstanding`) via
   `distributeRealTargetByWeight`. **Amended (§7.18):** the helper is right AND the overshoot it
   renormalises is real information — a large renormalisation factor means the asset universe does
   not match the money pointed at it. Read it, don't just divide it out.
4. **Seed shape must equal engine shape.** A cold start seeded in a different shape than the
   weekly engine produces creates a fake week-1 shock. This project's single most repeated defect
   — see §7.10, §7.21, §7.31, §7.49, §7.55, §7.58. Strictest form (§7.58): seed by calling the
   engine's own code, not by writing something that resembles its output.
5. **Shared-field collisions** (two writers on one field) caused four mass-collapse bugs. When a
   value is per-X, key it by X.
6. **Cash-constrained bidders ration quantity, not price** — underpricing under pro-rata clearing
   is a permanent shut-out spiral.
7. **Rating agencies lag, spreads don't** — keep the fallen-angel forced re-rate.
8. **Wall Street phases 1–2 and slices 1–3** landed: per-bank balance sheets, SRF/ON RRP
   facilities, corp-bond/sovereign/loan clearing, generic engine extraction. Failed banks still
   lack deposit flight (open).
9. **S1: the income/GDP identity.** Tier wage premiums (1.35^tier) applied on top of a GENERAL
   wage already at 62% of output made the wage bill 93% of output and household income 106.6% of
   GDP. Fixed by normalising premiums by their employment-weighted mean over the BASELINE mix
   (never the drifting live one, or a real skill shift gets cancelled).
   - `bootstrap/national-accounts.ts` is the single owner of the identity and of the two
     derivations that must agree. Three shares are chosen primitives; the household tax rate is
     what the identity requires — it lands at 13.2%, inside its realistic band, which is the check
     that the other three are sane.
   - **Four duplicated definitions collapsed:** the occupation-share table, the 0.35 procurement
     literal (three copies, absent from stage 11), the household-income formula, bilateral trade.
   - **Transfers are not purchases.** The identity counted 100% of outlays as G while demand spent
     35%. Transfers reach GDP through C; only procurement is G. Benefits sit INSIDE the transfer
     total, not on top.
   - **Cold start must open on the real economy:** employment, trade and GDP history were all
     seeded from assumptions and stepped at week 1. `[...history.slice(-51), current]` compared
     across 51 weeks and called it year-over-year.
   - Result: week-2 USA growth +1.54% against 1.80% potential (was +113%).
10. **S2: the yield curve has one owner.** `macro/evolution.ts` computes no curve at all; 07c's
    auction is its sole author. Macro reaches it as in reality:
    - **Policy reaches the front end through banks' reserve arbitrage** — a bond yielding more
      than the corridor is worth owning. Verified: +100bp shock moves the 2Y +43bp in week 1,
      ~93bp by week 3, the 10Y under 20bp. A hike flattens the curve through demand.
    - **Expectations reach the long end through each holder's real yield**, weighted by duration
      committed, so rising expectations steepen rather than shift.
    - **A tilt alone cannot anchor a level.** Given only a cross-tenor tilt, everyone crowded into
      short paper and the 2Y sank 349bp BELOW policy. A bank must also choose bonds-versus-cash,
      so the SIZE of its book responds to the corridor. That substitution belongs OUTSIDE the slow
      strategic drift — folding it inside throttled a hike to under half its pass-through.
    - **Two bugs, both §7.4/§7.5:** banks carried a scalar sovereign total but an EMPTY per-tenor
      book (the field 07c reads), so every bank opened ~$147B under target and bought forever; and
      maturing tranches left the government's books but not their HOLDERS', so by week 52 banks
      owned 1.30x the entire two-year float and trading that phantom down ran the 2Y 6% → 25%.
11. **G1: inflation is measured, not assumed.** `price-index.ts` builds a real consumer basket at
    the prices stage 05 clears and takes the 52-week change; core excludes food and energy;
    rebased annually, chain-linked.
    - **What died:** the AR(1) anchored on target (0.98 persistence multiplies any persistent
      addition ~50x), the wage-push term, the money-growth term (`m2Growth − gdpGrowth` grew
      without bound as measured real growth fell — inflation feeding itself through fake real
      growth), and a weather shock injected at an invented basket weight.
    - **The bug that was worth more than the feature:** `03-category-demand.ts` rebuilt each
      category from scratch weekly and dropped every field owned by a later stage — above all
      `unitPriceUSD`. Bootstrapped prices (~$70k/unit) were destroyed in week 1 and **every price
      in the economy rebased to a ~$1 scale**. A stage writes the fields it owns and nothing else.
    - Sovereign issuance placed with real buyers (mirror of S2's redemption fix): leaving a new
      issue unheld made every issuance week a one-sided demand shock and drove the 2Y negative.
12. **S3: three structural bugs, each found by tracing a number to its source.**
    - **The leveraged-loan market did not exist.** Each rung was decided by
      `cumulativePrincipal < fixedShare × debtBase`, and cumulative principal is zero at the first
      rung — so the first tranche was FIXED for every issuer including CCC, and floating float
      across the whole market was zero. Test each rung's MIDPOINT against the target.
    - **Corporate holdings did not track the corporate stock** (the same defect S2 fixed for
      sovereigns): by week 24, 130 of ~184 issuers had institutions holding more than the entire
      float, fanning spreads to −1097/+1757bp. **Where the snapshot is taken matters** — after the
      call block it missed the largest source of change.
    - **The "accretive call" was deleveraging, not refinancing.** It retired a tranche whenever
      the coupon exceeded market and stopped; the bond float halved in six months. A call for
      value is a refinancing — replace at today's rate and keep the money.
    - **Lesson: a market cannot be signed off by watching its price.** Watch its FLOAT and its
      HOLDINGS first. Every one of these was invisible in the spread series.
13. **S4: money moves with the securities.** `clearFinancialAsset` returns
    `netCashDeltaByParticipantId` and all adapters apply it. Before this, holdings changed weekly
    with nothing on the other side. Dealer revenue is now the sum of what clients actually paid
    (charging it on NET client flow waived the desk's bid/ask on both sides). The formula drift on
    bank sovereign holdings is gone. New invariant: an institution's cash plus securities may move
    only by real flows — worst week 0.47% against a 5% threshold.
14. **RV demand: allocation responds to price.** `asset-allocation.ts` asks whether an asset class
    pays for itself: `excess = (spread − expected loss) − (capital charge × required return)`,
    every term already real. The policy percentage becomes the centre of a band.
    - **Why it acts on the level when a tilt cannot:** it scales the SIZE of an already-bounded
      pool instead of redistributing a fixed one, so it does not renormalise away.
    - **A ratchet found on the first attempt:** applying the tilt to a target anchored on current
      holdings feeds back — selling lowers the book, which lowers the target, which sells again
      (78bp → 1388bp). The tilt must apply to the STRUCTURAL target. Same shape as S2's drift bug.
15. **RV supply: the float responds to its own price.** `corporate-financing.ts` gives each issuer
    the decision every other change to its debt stack lacked. One hard limit is real: a
    covenant-style leverage ceiling by rating, and no market access for defaulted issuers.
    - Result: float grows 77B → 104B into tight spreads, the spread recovers −22bp → +86bp as
      supply arrives, then deleveraging runs (113B → 98B). A credit cycle, from nothing.
    - **Lesson: a price that will not stay put usually means one side of its market is missing.**
      No tuning of either side's reaction would have bounded it while the quantity of paper was
      fixed by construction. Ask what is structurally absent before tuning what is present.
16. **E1: the engine prices a demand schedule.** A real double auction — each participant posts a
    reservation level, full size and a scaling range; `solveClearingStat` bisects for the level
    where demanded quantity equals tradable float. The RV economics became what they always were:
    a price.
    - **Measured:** Spearman(OAS, ownership share) −0.731 → +0.05…+0.22; Spearman(leverage, OAS)
      0.78–0.93; zero negative spreads; median OAS strictly monotonic by rating.
    - **Hedge funds as a fourth institutional type** (7% of sector assets, 22% required return,
      4.0x conviction): absent when paper is expensive, bidding when it is cheap.
    - **Three quantity-era approximations that were harmless as nudges and fatal as prices:**
      (a) the raw logistic used as an annual PD (~98% for a stressed borrower) — cap it, and keep
      the cap consistent with the recovery rate or the expected loss exceeds what the recovery
      floor can pay; (b) the IG mandate modelled as a PROHIBITION, so a downgrade deleted 60% of a
      name's buyer base — replaced by a punitive capital charge plus a sleeve limit, normalised per
      name so rating decides the MIX of a register, not its size; (c) the auction returned its
      search bracket (50,000bp) as a price when demand could not absorb the float. **The fix for
      (c) was itself wrong and was retired (§7.20)** — a recovery-derived ceiling. A bond trades
      below recovery routinely; that gap is where a distressed investor earns its return. Kept in
      the record because it is easy to justify a bound with a plausible real-world story and hard
      to notice the story only holds for a participant who is not in the market yet.
    - **Lesson: a number that is directionally right is good enough to nudge a quantity and not
      good enough to be a price.** Converting a quantity mechanism into a pricing mechanism
      re-audits every input it touches. Budget for that.
17. **The phantom leveraged-loan market.** `Company.leveragedLoan` was attached to EVERY company
    at generation, but 167 of 200 had no floating debt. 07d correctly skips them, so those quotes
    were never cleared — frozen at generation value forever, dominating every published statistic.
    Fixed by giving 07d ownership of the quote's lifecycle: 23–32 real loans, monotonic by rating.
    - **Lesson: when a market's statistics look random, check how many of its instruments are
      actually IN the market.** A stage that filters its inputs does not clean up the records it
      filtered out, and a stale record is indistinguishable from a live one downstream.
18. **The money and the assets were never reconciled.** Aggregate institutional money roughly
    matches the investable universe (USA ~846B vs ~857B) — not a general glut. The composition is
    broken in exactly one place:

    | USA, week 0 | available | targets want | ratio |
    |---|---|---|---|
    | Equity | 615B | ~340B | 0.6x |
    | Sovereign | 201B | ~250B | 1.2x |
    | **Corporate credit** | **41B** | **~262B** | **6.4x** |

    The missing supply is the hidden corporate sector: 549.4B of debt, 86% of the region's
    corporate debt, as a scalar nobody can own. → §5-HC.
    - **Method note:** the first version of this measurement read a nonexistent field, reported 0,
      and made a credit-specific 6.4x shortage look like a 1.3x aggregate glut. When a probe
      reports a round 0 for something that should be large, verify the field name.
    - **Lesson: before rebuilding a mechanism, measure whether the thing it operates on is the
      right size.** Cheap, and it reorders the work.
19. **Post-E1 review — what stands, what needed refinement.** Sound as built: national accounts,
    measured CPI, single-owner curve, the double auction and its adapters, the CFO decision, cash
    legs. Needed refinement, each since closed: two default models (closed §7.20), the per-name
    normalisation guaranteeing demand ≈ float (deleted §7.21), the dealer with no balance sheet
    (G3, open), near-parallel demand curves across entities (G6/HH1, closed §7.52), the hedge fund
    existing twice (closed §7.21), dead quantity-era code (S10).
20. **E2: two pricing regimes, one default model, no ceiling.**
    - **The priced hazard is a structural forecast of the real trigger.** The tuned logistic is
      gone: `computeAnnualDefaultProbability` asks how large an EBITDA shock puts the company
      inside the ACTUAL trigger (coverage floor AND cash exhausted — the AND honoured by taking
      the larger required shock, so a levered company with runway is safer than coverage says) and
      how likely that shock is given its own measured revenue volatility. One constant, imported
      by both stage 08's default check and the rating ladder.
    - **Distressed paper prices off recovery as a second REGIME, not a bound.** Expected terminal
      value discounted at the fund's 22% hurdle. The HF reservation sits ~795bp on performing
      paper and arrests widening at 1,200–2,700bp.
    - **The IG ladder's slope comes from rating- and duration-granular spread-risk capital.**
      Forced by an honest failure: with the structural PD, expected loss on ALL investment grade
      is a truthful ~0bp, so with a flat within-IG capital charge every IG reservation collapsed to
      the same number. Real IG spread differences are mostly risk-capital premium.
    - **Lesson: when a defensible model change flattens a distribution, the missing dispersion was
      probably being smuggled in by the old model's error.** Fix the newly exposed structure;
      don't re-inflate the input.
21. **S11: bids are bounded by money, books are marked, income is real.**
    - **Income leg completed.** Companies always EXPENSED debt interest and the receiving side did
      not exist. Sovereign coupons deliberately NOT credited — the government does not pay them
      yet (PUB); crediting a holder without debiting a payer creates money.
    - **Budgets.** What an entity can ADD in a week is real cash plus the leverage its type runs.
      Measured over 60 weeks with no clamp: worst cash/assets 0.0% for insurers/pensions (fully
      invested, which is real-money behaviour), +14% floor for the hedge fund. Pre-S11 it was
      −10% for everyone, permanently.
    - **The per-name normalisation is deleted**, and deleting it forced the engine fix it hid:
      when the buyer base cannot absorb the float at ANY level there is no crossing, and the old
      solve returned its search bound as a price. `solveClearingStat` now clears at the SATURATION
      point — the least aggressive level at which every willing buyer has taken full size — with
      the dealer holding the residual. **A bound is not a price; the widest level any actual buyer
      needed IS.**
    - **Known intermediate state:** HY medians cluster at the distressed backstop because at real
      sleeves the HY buyer base is genuinely short of the HY float (§7.18 expressing itself). Do
      NOT tune sleeves to a spread target.
22. **RVr closed: the credit cycle's amplitude is real.** Median IG OAS breathes over a 75bp band
    (166–241) — tights draw issuance, supply lands on budget-constrained buyers, spreads widen,
    issuance slows. The expectations channel is not needed for credit amplitude.
    - **The quantity drain was a real defect:** `decideCorporateFinancing` measured "what capital
      earns in the business" as EBITDA over debt + MARKET cap, so the CFO's internal hurdle was a
      function of the stock market's mood and rich equities made every IG firm read 150bp debt as
      too dear (the float halved in 60 weeks). Replaced with return on INVESTED capital plus a
      deployment-flow cap — cheap coupons do not create projects; covenants bound the STOCK of
      debt, the pipeline bounds the FLOW.
23. **S5: the cash walk is one explicit ledger.** `post(label, amount)` is the single write path;
    Σ(entries) = Δcash verifies to the dollar. Four leaks died as consequences (the
    EBITDA/sales/production triple-count, dividends that never left, a prepayment that debited
    cash and decremented a scalar the ladder silently restored, mergers losing the target's cash).
    Public defaults by week 121: 59 → 46.
    - **Finding 1: dividends were 10x real** — yield × market cap on inflated equity levels bled
      15–25M/week from companies selling 20M/week, invisible while dividends never actually left.
      Now bounded by a payout ratio of real earnings.
    - **Finding 2: firms bought ~2x what they sold** — the real CASH margin was deeply negative
      while formula EBITDA reported +18%. Root-caused in §7.24. Invisible before the ledger, which
      is the ledger's whole argument.
24. **The fantasy contract flow.** Supply contracts were sized by a hardcoded random ladder with
    NO relation to the buyer's real need: one contract committed a buyer to 35M/week against 8.5M
    of revenue, and ~90% of the auction's apparent volume was this churn. A contract is now the
    LOCKED-PRICE FORM OF THE BUYER'S REAL DEMAND. After: every sector's purchases sit below its
    sales (P/S 0.04–0.58, from 2.7–7.5x); honest volume ~0.7B/week against 8.9B.
    - **Lesson: when a flow's PRICE side is made real but its QUANTITY side still holds an
      invented number, settling the cash converts the invented quantity into real damage.** Every
      quantity in a settled flow deserves the audit prices got.
25. **S6: every duplicate price-setter deleted.** Stage 12 marks off CLEARED stats;
    `priceLeveragedLoan` is a pure DM→price converter; `computeBucketDemandPremiumBps` and
    `computeSupplyDemandPremium` deleted. UI stopped re-deriving engine formulas (including a
    pasted copy with a x1,000,000 unit bug). The sovereign-absorption invariant now shocks the
    fields the market ACTUALLY reads — **a check that shocks retired fields tests nothing.**
26. **S7: one holdings ledger, and a hidden sovereign collapse.** `holdings-view.ts` is the single
    derivation of every sector-level figure; the real per-entity and per-bank books are the ledger.
    - **Two opposite defects died together:** stage 11 rebuilt sector holdings weekly by a parallel
      formula, and the macro aggregates were written ONCE at init and never again — a frozen week-0
      snapshot the UI, stage 08 and stage 02 all read as current.
    - **The finding:** with the aggregates live, USA institutional sovereign holdings collapse
      ~284B (wk20) → ~1B (wk40) with entity cash 20B → 309B. The books were doing this all along;
      the frozen aggregate reported a steady 201B and nobody could see it.
27. **Sovereign collapse fixed; the first optimization pass.**
    - **Anchored inflation expectations.** The reservation yield used the raw current expectation
      at every tenor, so a 16% print demanded 17.5% on a 10-year bond and demand went to zero.
      A bond now prices the AVERAGE expected inflation over ITS OWN tenor, deviation decaying at a
      mean-reversion constant — the defining property of a credible targeting regime, not a damper.
    - **Liability-driven core** (`minHoldingUSD`): an insurer matching reserves cannot liquidate
      its government book because yields look poor this week. A mandate expressed as SIZE, never
      as a price. Measured: institutional sovereign book 0.0B → 133.0B, 10Y 21.6% → 5.1%.
    - **Weekly step 5.7x faster** (5,280 → 924ms). Every win was the same defect: an index rebuilt
      inside a per-item loop. **Lesson: profile before optimizing** — the first pass hoisted the
      obvious filters and bought 6%; the real cost was O(firms × contracts) scans the profile named
      and intuition had not.
28. **G1b root cause: production capacity was denominated in dollars.** Stage 05 sized output as
    `annualRevenue/52 × shares` then divided by the CURRENT price, so a price rise made the same
    plant produce FEWER units — the wrong sign, closing a positive feedback loop.
    - **The measurement that found it:** tracing every category rather than the index, the MEDIAN
      category never moved while a handful ran away (defense_systems 9.3x), and in every spiralling
      one SUPPLY WAS COLLAPSING as price climbed. **An economy-wide monetary story cannot produce a
      flat median; a broken supply response can.**
    - Fix: `weeklyCapacityUnits` — capacity is a physical stock in UNITS, evolved by real net
      investment (a ratio, so inflation cancels). Price decides how hard the plant is RUN, never
      what it can make. Inflation went from a monotone runaway (15.7% → 78.7%) to −3.9% → −7.6%.
29. **S8: the contagion fix was most of G1b's remaining cycle.** `recentDefaultsCount` counted
    every company that had EVER defaulted, so a week-3 default still tightened credit in week 200 —
    a permanent scar that could only ratchet. Now a rolling 52-week window plus the currently
    distressed cohort. Also: `clearedInputPriceIndex` measured week-over-week while consumers read
    it as a level versus baseline (rule 9); housing supply read a field that never updates.
    - **Measured (110 weeks):** inflation went from ±20% oscillation with spikes to 62.8%, to a
      narrow band with none. What remained of G1b was a LEVEL problem (mild deflation), not a cycle.
30. **S9: player flow is real client flow to a real dealer desk.** `executeTrade` sourced positions
    from a derived view, so **every write was silently discarded** — the player could buy any size
    and no book changed. Both sides also paid the markup (a round trip lost the spread twice), and
    maturities credited full face value AND the realized P&L on top — money from nowhere, twice.
    - **Lesson: a write to a derived view is a write to nothing.** Any code still writing to an
      aggregate that has been converted to a view is a silent no-op, not a visible error.
31. **WS4: the stock price is cleared.** 07e clears every listed name **in shares** — a
    dollar-denominated book would have its size depend on the price it is supposed to set. Each
    holder posts its own fair value at its own required return, and that disagreement is the demand
    curve's slope. `priceEquity` is deleted, with the branch that priced a bigger loss HIGHER.
    - **An engine bug equity made visible:** the damped level and the allocated quantity were
      inconsistent, so books together could claim more than the float — printing as institutions
      holding **229% of a company's shares**. Fills are now rationed pro rata to float.
    - **§7.4 again, and it cost the most here:** companies were seeded at `eps × sector basePE`
      (capitalising at ~1.5%) while holders capitalise at 4–10%, so week 1 opened at ~4x any real
      bid and the market spent ten weeks falling at its damping limit. Seed and market now share
      one function; nothing else may price a share.
    - **Measured:** median P/E 66.7 → 10.1 at week 0 and 11.1 at week 60 (no drift), weekly move
      settling to ~1–2%. Two sign bugs found: the structural PD annualised `dividendsPaid` SIGNED
      (a cash flow statement stores it negative, so paying a dividend scored a company as SAFER),
      and the buyback test compared against a valuation the market no longer used.
32. **Determinism, and a guess-free profiler.**
    - **Every run was a different world.** 51 raw `Math.random()` sites meant no before/after
      measurement ever compared the same economy to itself — the whole method was being applied to
      numbers that moved on their own. All engine draws now come from `engine/rng.ts`; the seed and
      stream position live on GameState. UI jitter deliberately not converted.
    - **`npm run verify` defaults to 60 weeks.** Every real finding has come from the first sixty;
      the 260-week run took 25 minutes and was being used as a per-change check.
    - **Second optimization pass, 920 → 490 ms/week, byte-identical results.** All three wins were
      the same anti-pattern — a per-item scan of a collection that should be grouped once (stage 08
      supply relationships and a growing bill ladder: 387 → 118ms; stage 05 walking ~74,000
      contracts per sub-unit market: 315 → 209ms; stage 09's maps-of-arrays: 87 → 25ms). A fourth
      change looked identical and bought 4ms — **recorded as a miss, because re-measuring after is
      the point.**
33. **HC Wave 1: the hidden sector is real firms.** ~301 named private firms per region carved out
    of the segment aggregates, with real debt ladders clearing in 07b/07d and `PRIVATE_EQUITY` as a
    fifth institutional type. Debt conservation exact (549.4B = 75.5B firms + 473.9B residual);
    loan universe 292 names, 246 private — the leveraged-loan market is mostly sponsor-owned
    private paper, as the real one is. Want/have 6.4x → 3.8x.
    - **The finding that reshaped the numbers:** the segment primitive `debtUSD = 2 × revenue`
      implies ~15x debt/EBITDA. The first carve scaled real ladders up to meet it and killed a
      third of the cohort in 26 weeks. The tier now carries what real leverage services.
    - **Two measurement bugs:** an employment change must be measured over the SAME firm universe
      on both sides of the week (an asymmetric pair read the tier's arrival as a mass layoff), and
      an unsold-production penalty must only exist for a firm that offers into a modeled market.
34. **WS5: bills and commercial paper.** ~18% of each sovereign ladder is 13/26/52-week paper
    clearing in 07f; the NS curve refits through all seven cleared points so `tenor3M` is a market
    print. CP: an IG company whose projected quarter-end cash does not cover its own booked
    working-capital stock runs a standing 13-week program; a failed roll draws the revolver.
    - **First formulation found no issuer in 60 weeks:** it looked for a projected cash DEFICIT,
      and almost nobody projects negative cash. Real CP funds the working-capital STOCK of issuers
      who run lean. **Sizing a market off the tail event instead of the standing need finds no
      market.**
    - `sovBucketKey` is now the ONE tranche-to-bucket mapping; the three independent
      nearest-of-[2,5,10,30] reducers it replaced would each have folded a 13-week bill into the
      two-year bucket.
36–40. **The bank flow ledger, S10, WS6–WS8 and G2.** (No item 35 — the list skips it.)
    - **36. The bank balance sheet became a flow ledger, and the plug died with it.**
      `evolveBankingSector` had computed reserves as a plug; every mutation is now a named flow
      posting to both sides. The new per-bank identity invariant found a real pre-existing bug on
      its first run. WS6's overnight GC repo session stands on that base. **Seat-design lesson: a
      perfectly elastic posted-rate window stands in for a market and prevents one forming** —
      measured, corridor breaches 0 and per-bank identity residual 0.00M.
    - **37. S10 (backlog batch) produced the damper metric §6 asked for:** 1,349 instruments
      persistently bound. The absorption check learned WS6's lesson — a cash-drained bank still
      bids, because it funds.
    - **38. WS7 money market funds:** real liabilities and the front-end bid they fund, with a
      deposit-competition gate on the real yield gap.
    - **39. WS8 the primary market:** supply meets demand in the same book. **Two calibration
      defects the diagnostics caught:** every issuer re-announced the week its deal settled — a
      standing conveyor at 13x the intended flow. Firm-commitment underwriting still needs the
      desk to BE a named balance sheet (G3).
    - **40. G2's five slices:** itemized business loans with named borrowers, real interest,
      priced capital-gated origination, loans creating deposits, and M2 as a derived sum
      (`deposits + centralBankReserves × 0.1` — a tenth of a phantom 1e12 scalar — deleted).
    - **G2's transmission chain, measured end to end** (+300bp, A/B): quoted margin 582 → 857bp,
      **SME origination −51.3%**, **segment capex −21.5%**, category demand −0.66%. The first
      build moved origination 0.5% — priced correctly and inert, because demand was a pure quantity
      target (§7.24's shape). Borrowers now carry their own hurdle and borrowed money FUNDS REAL
      CAPEX, so a rate change reaches the goods market through the credit it suppresses.
    - **Two identity lessons, caught by the invariant rather than by reasoning:** corporate
      deposits are a reporting VIEW, not a bank liability (company cash lives outside the banking
      system; counting it as funding left the matching asset missing); and a facility draw is
      therefore a real cash outflow from the lending bank.
41. **HC Wave 2: the private sector has a lifecycle.** Five defects stood between "the code is
    written" and "deals happen", each a different way of building a market that could not transact:
    - **Deal intent died every week** — marked with `pending*` fields on the Company, which stage
      08 rebuilds from an explicit field list. 767 offering-weeks that could never settle.
      **State that must survive a week has to live on an object something owns.**
    - **A debut could not be priced** — the engine returned early on zero outstanding float, which
      is exactly a first-time borrower. The gate is now `tradableFloat + offering > 0`.
    - **Demand was sized off the PRE-issue float**, so no offering could be absorbed at any price.
    - **The weekly cash budget was split across the whole STOCK**, giving a new issue a slice the
      size of its issuer's index weight rather than of the deal (measured: a book that could HOLD
      53.7M could only FUND 14.0M, running the solve to ~1365bp against a sponsor who walks at 900).
    - **The offering was sized at the institutional SHARE while the engine asked the book to absorb
      ALL of it.**
    - **Dry powder was read as the sponsor's `cashUSD`** — 0.01B across every fund in the world.
      A fund does not hold its investors' money, it CALLS it.
    - **The private mark was a bare `8 ×`** in three places — a formula standing in for a price.
      Now `publicComparableEvMultiple`, the median EV/EBITDA the region's listed comps clear at.
    - **Measured (120 weeks):** 295 LBOs closed, 317 pulled at the sponsor's own walk-away (a real
      acceptance rate, not a conveyor); peNAV 25.0B → 8.0B as comps de-rate 8.0x → 3.5x — the
      transmission the fixed mark could not carry. **Zero IPOs, honestly:** nobody lists into a
      market that has de-rated by half. `generateIPOCompany` is deleted; firm creation has exactly
      one path.
42. **Call protection, and the death of the free call.** An issuer used to retire a bond at PAR the
    moment its coupon sat 1% above market — an option no lender writes.
    `domain/call-protection.ts` owns three real regimes: SOFT_CALL on loans (101 for six months —
    floating paper exposes the lender to spread, so what is protected is the spread underwritten),
    HARD_NC on high yield, MAKE_WHOLE on IG. There is always a price.
    - **The make-whole spread is not invented:** it is what the holder needs to replace the bond —
      the dealer's bid-offer. One constant read by both 07b's clearing and the make-whole.
    - **Measured: accretive calls fell to 0.00B** over 60 weeks. For an IG bond the premium IS the
      present value of the saving, so a purely rate-driven call never clears — which is what a
      make-whole is designed to do.
    - **Two behaviours had to change:** the delever path retired the NEWEST tranche first (with
      call protection, the most protected), and prepayment make-whole'd long bonds. Both now rank
      by rate given up per dollar of call cost: **premiums 1,388M → 0.9M**. One wrong turn: gating
      par-callable paper on the same test cut prepayment 97% — retiring debt that costs nothing to
      retire needs no arbitrage.
43. **The take-private, and an honest answer to "does LBO activity lift equity multiples?"**
    **No, and it structurally could not** — a sponsor could only buy PRIVATE firms. An A/B with the
    lifecycle off produced indistinguishable public multiples, and the one effect that registered
    ran BACKWARDS (capital calls drain exactly the cash that funds institutions' equity bids).
    - HC6c now screens LISTED companies, with the control premium DERIVED: to buy every share you
      must clear the reservation of the holder who values the company most, not the marginal one
      who sets the printed price. The consequence is real — **the sponsor bid appears when equities
      are cheap**, because a lower price means a smaller equity cheque.
    - **A bug the measurement caught:** `applyPendingCorporateActionSettlements` drains its maps at
      the end of stage 08 and `hc-lifecycle` runs after, so the tender's cash leg went into a map
      nothing read — the register was extinguished and shareholders were paid NOTHING.
    - **Measured (90 weeks): 36 take-privates**, institutional equity buying power 39.5B with PE
      against 36.2B without (+8.9%, forwards). **The multiple effect is NOT clean and I will not
      claim it is** — medians land mixed in both directions, swamped by the G1b de-rating and by
      composition. Re-measure after G1b.
44. **ETFs: real indexes, real index funds, dealers as authorised participants.** 27 funds born
    EMPTY — a fund's shares are created by real demand through a real AP, so seeding a share stock
    would invent the flow the mechanism exists to produce. Each holds its basket for real, so an
    ETF is an ordinary holder in 07b/07d/07e.
    - **The one demand shape the engine could not express:** an index fund does not decide what a
      security is worth; it buys its benchmark weight at whatever the market asks. Its schedule is
      a SIZE with no reservation. Getting it wrong is instructive — a PRICE_LIKE reservation is a
      MAXIMUM, so "no reservation" is an unreachably HIGH one; set to zero, the equity funds bought
      nothing at any positive price.
    - **The AP constraint had the wrong basis first.** Sized as a fraction of dealer equity,
      95–98% of flow went unabsorbed forever. An AP does not WAREHOUSE a creation basket — what its
      capital limits is turnover, not inventory. Also: a region's dealers share ONE balance sheet,
      so allocating the whole regional capacity to each fund let ten funds spend the same dollar.
    - **The residual is NOT called a premium**, because it is not a price. `unmetFlowShare` is
      bounded in [−1,1]. An early version divided unabsorbed flow by the fund's own NAV and printed
      a **173% "premium"** — what naming a pressure like a price looks like.
    - **Research capacity scales sublinearly.** The first version made it LINEAR in assets, which
      says a firm with a hundred times the assets has a hundred times the analysts. At a cube-root
      exponent: fund AUM 13.6B → 53.5B and all four small-cap funds came alive.
    - **Credit funds bid in the PRIMARY; equity funds do not** — a bond index admits a new issue at
      the next rebalance, equity funds buy at INCLUSION, which is why they are famously absent from
      IPOs. Falls out of the quarterly rebalance with no special case.
45. **The household sector is the largest fiction left, found by asking who buys ETFs.** At week 40:
    **household equity 2,224B against a total market capitalisation of 1,052B** and 130B of all
    institutional equity holdings. Households held 2.1x the entire market.
    `equityHoldingsUSD` was seeded at `income × 1.5` and multiplied weekly by a formula return — in
    no register, clearing in no book, no cash ever moving, while driving net worth, the wealth
    effect and consumption.
    - **Do not reconcile by injecting the stock.** Routing 2.2T of demand into a 1T market would be
      fitting the world to a seed.
    - **Lesson: where an aggregate stands in for a sector, check its SIZE against the real market
      before trusting anything cleared against it.**
46. **L — the ledger integrity batch.** The redemption cash leg (L1) was the reason to exist: a
    retired tranche scaled holders' notionals down and paid them nothing. L4 deleted the last
    formula price-setter for a listed cohort and immediately exposed #18 as a 40x P/E on a hedge
    fund — **a formula masking a defect is the argument for deleting formulas.** L6 found dealer
    consensus and analyst forecasts on all 1,204 private firms.
    - **L7 did not reproduce, and why I first thought it did is the lesson.** My probe found a 9.8%
      JUMP at the recorded week and magnitude with the wrong SIGN, and I nearly wrote it up as the
      same bug flipped. It was an artifact: I summed cash as `Math.max(0, cashUSD)`, hiding exactly
      the entities the event was about. Unclamped, the book moves +3.10B (0.3%). **A measurement
      that clamps is a measurement that lies, and it lied in the direction that made a story.**
47. **MS1: households own real things.** `equityHoldingsUSD` is now a sum of real holdings —
    index-fund shares created through the real AP mechanism, the listed float institutions do not
    own (the same `institutionalShare` 07e uses, so both sides of the register agree by
    construction), and **founder stakes in the private tier**, which were entirely invisible until
    now. Marked at the same cleared multiple sponsors mark at.
    - **The remainder is NAMED, not deleted.** Marking households down to what exists would import
      the §7.18 shortfall straight into consumption — **fixing a local inconsistency by making the
      macro worse**, the trade this project keeps refusing. `unmodeledFinancialAssetsUSD` earns
      nothing, moves with nothing, and only SHRINKS.
    - **The household rate response falls out of it:** how much of a week's saving goes to funds
      rather than deposits is the earnings yield the listed market is throwing off, less what the
      money fund pays.
    - All four broad-market ALL_CAP funds go 0/4 → 4/4 live; fund AUM 53.5B → 97.8B. **A household
      runs no research desk, so the coverage rule already made it a 100% indexer — the buyer was
      specified before it existed.** The empty broad-market funds were never a universe-size
      problem; they were a missing sector.
48. **The household sector was modelled an order of magnitude more thinly than the corporate one,
    and naming a gap is not closing it.**
    - **46% of the "unmodeled" 1,605B was not missing from the world — it was UNATTRIBUTED in it.**
      Insurers held 495B against 40B of their own equity; pension funds 146B against 17B; asset
      managers 188B against 31B. **740B was a liability to somebody and nobody held the claim.**
    - **Households carried 1,061B of mortgage debt and owned no house**, while the model had median
      home prices, an index and a 62% ownership rate.
    - **The asymmetry:** 2,004 named companies against 4 regional aggregates; the S5 cash ledger
      against formula deltas; 82 itemized corporate loans against a 140B consumer book itemized to
      nobody; four cleared markets against none.
    - **Why I got it wrong.** I wrote "the assets the universe cannot yet back" and filed the empty
      funds under §7.18. Naming the gap made MS1 *attributable*; it did not make the model *right*,
      and I treated those as the same thing. **The structural cause is worth more than the mistake:
      splitting one real thing across two projects guarantees that building either alone leaves a
      gap to name** — the claim linking a household to a pension fund is simultaneously the fund's
      liability and the household's asset. They became one project, HH.
    - **Lesson: when a number has to be labelled "unmodeled", check first whether the model already
      contains it somewhere it is not attributed.** A missing counterparty looks exactly like a
      missing asset from one side of the ledger.
49. **HH1a landed and the harness went GREEN for the first time — via a defect misfiled for a year.**
    740B of claims now exist on both sides, derived as the residual on a real balance sheet and
    re-marked weekly, with an invariant checking them against each other. The placeholder fell
    1,759B → 964B on attribution alone.
    - **#18 was never a revenue runaway.** The four names flagged for a year were the four regional
      HEDGE FUNDS, whose revenue is a fee on their book — the harness was applying an operating
      company's growth ceiling to a fund. And they had not grown: **their book SHRANK 76.8B → 62.4B
      while reported revenue rose 29x**, because the generator seeded `aumUSD` from an operating
      company's revenue while the entity carried the real book. A §7.4 cold start wearing a growth
      defect's name. Seeding the shell at the size it manages: 29x → 1.1x, harness zero violations.
    - **The tell was available the whole time:** the violation was always at week 60 with the same
      four names and no new ones — a step change compounding, not a process running away.
50. **Every non-financial corporate is the same firm.** Four coefficients vary by sector; underneath
    them all 2,004 companies produce storable units, hold output inventory decaying at a hardcoded
    2%, book revenue only on settled unit sales, and run one COGS decomposition. **Enterprise
    software sits in physical inventory, spoiling like steel.** No subscription, backlog, deferred
    or royalty revenue exists anywhere.
    - **The model already knows operating models differ and applies it to exactly one sector** —
      `financialStatementProfile` gives banks, insurers and asset managers different P&L paths.
      That asymmetry is the tell, and it sat in plain sight through every project touching stage 08.
    - **A topic can exist, be correctly named, and still not contain the thing you filed under it.**
      IND read `{capexIntensity, cyclicalityBeta, financingPreference, payoutPolicy, hedgingPolicy}`
      — every item balance-sheet policy, nothing about revenue, costs or inventory. "We have an item
      for that" is not the same as having scoped it.
51. **HH1b: one insurer, not two.** The INSURER branch of stage 08 refused to read its own entity on
    reasoning that predated S11 making `totalAssetsUSD` a real per-firm marked book. What it
    produced was a second insurer: a shell reporting 0.05B of revenue and 0.10B of market cap beside
    an entity holding 241.4B, with `technicalReservesUSD` printing 0.2B against a 221.9B beneficiary
    liability — the same obligations twice, three orders of magnitude apart. Market cap 0.10B →
    51.0B against 19.5B of book. **A refusal outlives its reason; re-check the comment that explains
    why something is not read.**
    - **Correction:** an earlier draft said pension and hedge funds fall through to a
      consumer-revenue path. They do not — they carry the `ASSET_MANAGER` profile and already read
      the entity's book.
52. **HH1c: somebody pays the premiums, and two hurdles stopped being constants.** Premiums come off
    real payers split by insurable base; claims and benefits reach real claimants.
    - **A leak built in deliberately, then closed.** The first version zeroed the insurer's
      operating expense to avoid an unfunded outflow, leaving its cash outrunning its own reported
      income by the whole expense ratio. **Writing `* 0` with a note is a fine way to defer a
      decision for an hour; it is not a fine way to ship one.**
    - **Two constants retired into measurements, each the metric its industry uses.** An insurer's
      hurdle is its **cost of float** — measured at −1.57%, so underwriting is profitable, the float
      is FREE, and the insurer accepts **7.43% where the constant said 9%**. A pension fund's is its
      **funding need**: at 107% funded it needs 4.38% against a stated 7%, and an underfunded one
      needs more — the "underfunded schemes reach for return" behaviour, now falling out of
      arithmetic.
    - **The other three stay stated, and that is the honest answer.** An asset manager's hurdle is
      its investors' benchmark, a hedge fund's its mandate, a sponsor's what it underwrites to. None
      is a liability cost. **Deriving them anyway would be a formula wearing a derivation's clothes**
      — the failure mode this project is most at risk of once deriving things becomes the habit.
53. **HH2: the house joins the balance sheet, and a units error hiding behind a small number.**
    The stock is computed from PHYSICAL units — population / household size × ownership rate × the
    cleared median price — so a price move is a wealth move. Housing stock 3,188B, home equity
    2,127B, net worth 1,543B → 4,730B, net-worth-to-income 1.5x → **4.61x**.
    - **What housing exposed matters more.** The wealth effect read
      `(netWorthToIncomeRatio − 1.0) × 0.006` — a LEVEL feeding a GROWTH rate. Invisible for as long
      as it was wrong-and-small (0.3% at a 1.5x ratio); at 4.61x the identical expression began
      adding **~1.9 percentage points to real consumption growth every week, forever**. Replaced
      with an MPC out of the CHANGE in wealth.
    - **Lesson: a dimensionally wrong expression scaled by a small input looks like a tuned constant
      and passes every check.** It only announces itself when something upstream gets bigger, so
      every place a level multiplies into a rate is a latent version of this.
54. **Task-list mapping.** S-items ↔ audit findings + #67/#18/#34; WS ↔ #68–#82/#74; MS ↔
    #56/#59/#60/#52; BP ↔ #58/#45/#48/#50/#51/#54/#55/#64; AU ↔ #66. The end-of-project
    `npm run verify` gate closes #2/#14/#41. #47 (deeper institutional sector) is §5-S11 plus HH1.
55. **HH3: household debt joins the banks' books, and #67 dies of realism.** Rule 3 at its plainest:
    households owed 0.95x income evolved by paydown constants, banks held a scalar chasing 11.67%
    of it, and the other 88% was owed to nobody. Now mortgage / card / term POOLS on each named
    bank, with the household lines their derived sums.
    - Origination is priced (measured tier losses + capital + operating cost) and capital-gated at
      the 8% floor; **amortization is ANNUITY ARITHMETIC on each pool's own terms**, which killed
      the 0.0004/wk constant — the rate a book amortizes at is derivable from its own terms.
      Mortgage loss severity reads HH2's real home equity.
    - **#67 CLOSED by re-measure.** USA bank capital was collapsing to zero by week ~70; with the
      real book it runs 11.6% → 14.7% through week 80. The collapse was the fictional consumer book.
    - **The household rate response exists now:** under tight policy the card and term books SHRINK
      (42.9B → 33.5B) while measured debt service climbs 17.8% → 26.6% of income.
56. **HH4a: the household cross-section, at zero aggregate cost.** ~14 occupation × wealth-tier
    cohorts per region, built weekly from the same primitives the aggregate uses, so Σ cohort
    disposable equals the aggregate by construction.
    - **The normalization discipline is the design.** Every per-tier propensity is a RELATIVE weight
      renormalized against an aggregate the sim already runs on — tier wage multipliers normalized
      per occupation (each occupation's bill preserved exactly), progressive tax multipliers
      renormalized weekly to the flat rate (6.3% bottom to 25.2% top with the S1 identity
      untouched), savings λ-normalized to the behavioural rate. **Result: 40-week aggregate paths
      bit-identical to the pre-cohort world.** A cross-section that moves no aggregate is the only
      kind that can land safely on a running simulation.
    - Three drift formulas died into derivations: tier income drift, the `wealthSignal` spend-share
      walk (dead state no stage read), and a per-tier consumption sum nothing read.
57. **HH4b/c/d: the budgets bite, wealth gets an owner, deposits get one representation.**
    - **HH4b.** C = Σ cohort budgets, with HH3's debt service debiting and capital receipts
      crediting — both sides at once, the §7.52 lesson applied in advance. Receipts run in three
      components because incidence is the economics: deposit interest lands where wealth is,
      dividends where equity exposure is, the seed residual where institutional claims sit. **The
      first draft allocated everything by equity exposure and handed 46% of the recycle to the top
      1%**, inflating luxury demand a quarter over its seed weight — caught by measuring the derived
      spend shares against their calibration, not by the harness. **Measured stabiliser:** at the
      week-60 squeeze the DS/receipts differential is −24B, luxury falls 0.095 → 0.068, and the G1b
      escape's terminal inflation is ~11pp LOWER than baseline.
    - **HH4c.** Tier net worth = a split of the marked aggregate components, summing exactly. The
      wealth effect is tier-weighted (0.10 down to 0.015), opening at the old constant's blend but
      making a housing move worth ~2x an equal equity rally — the asymmetry a single constant
      cannot express.
    - **HH4d.** `depositsUSD` on a bank is really household money; the wholesale funding it silently
      carried (418B USA) is its own line. Deposits move by named flows with T+1 settlement for
      post-bank-pass household flows. **The reconciliation invariant found TWO pre-existing defects
      on its first runs:** bank M&A stranded the acquired bank's entire balance sheet (54B of UK
      deposits vanished in one week while households still held the money), and the revenue-growth
      ceiling read growth-by-acquisition as organic. **A conservation invariant pays for itself the
      week it lands.**
58. **HH5: the labor market becomes a market, and a third unemployment rate nobody knew about.**
    The plan said two representations. There were three: the GDP-gap formula (4.5%), the pools
    (8–17% implied), and **`unemploymentRateBottomUp`, written every week and read by NOTHING** —
    wrong on its own terms, omitting the entire private tier and printing 37% against a
    full-employment economy. **Dead state can be wrong for years precisely because nothing reads
    it; grep for the readers before trusting a field.**
    - Firms post vacancies from real output growth; a per-occupation Cobb-Douglas matching function
      turns real stocks of vacancies and seekers into hires. Employment has ONE representation — the
      employers' books — with the pools and the rate derived from it by a reconciler that runs again
      at the END of the week, so a bankrupt firm releases its staff the same week.
    - **Stage 08 was overwriting the market every week.** Its `headcountPressure` drift still ran
      after matching had settled and silently replaced the result (pools drifted 3.9% above the
      employers' books by week 43). **When a new stage takes ownership of a quantity, the old writer
      must be deleted in the same change.**
    - **Three shape errors, each caught by measurement:** (a) labor demand as a LEVEL ratio drifted
      until every firm wanted 29% more staff while real GDP was flat — deflating did not help
      because the defect was the shape, and a growth-on-growth form has no level to drift; (b) the
      matching efficiency was GUESSED at 0.62, implying every opening filled inside a week — derived
      from two observable facts it pins time-to-fill at six weeks; (c) unfilled vacancies never
      expired, so an occupation nobody could staff accumulated 186k openings against ONE seeker.
    - **Two §7.4 cold starts, one arbitrary.** Opening the vacancy stock at ZERO made it climb from
      nothing for forty weeks while unemployment also rose, so the two moved TOGETHER and the
      Beveridge relation printed **+0.94** — an artifact that looked exactly like a broken labor
      market. And the occupation mix was the demand mix times per-occupation "slack multipliers"
      whose only effect was to leave one occupation with zero seekers at birth. **An arbitrary
      constant in a seed does not stay in the seed** — it becomes an economic finding a reader
      cannot distinguish from a real one.
    - Week 0 now reads u=4.50%, V/U=0.96, vacancy rate 4.32% in all four regions.
59. **HH6: a wage somebody decides.** Firms set their own offer from unfilled postings and margin
    headroom; the going rate is the employment-weighted average of those offers; quits respond to
    relative pay. The region-level tightness→wage formula is gone — it walked an index no
    employer's payroll referred to.
    - **Two bugs, one lesson each.** **Stage 08 rebuilds every company from a fixed field list**, so
      anything written to `companyUpdates` and not named there is silently dropped — the wage fields
      were, and so, since HH5, were **private firms' headcounts**: the whole hidden tier posted
      vacancies, consumed real matches, then reverted to its old payroll every week. And the first
      wage rule blended a level against a scaled copy of itself, `prev*inertia +
      prev*(1+t/52)*(1−inertia)`, which delivers **t × 0.06** — six percent of the intended move.
    - **A relative index is not a growth rate.** The going rate first multiplied the firms' average
      premium every week; compounding a 2% premium weekly is 180% a year.
    - **Cost of living, deliberately incomplete** (0.6). Without it nominal wages ignored prices
      entirely; with full indexation the real wage is a constant and the model gets a mechanical
      spiral. Partial pass-through is also the empirical fact.
    - **The cost, measured and accepted:** A/B against pre-HH6, terminal inflation at week 60 goes
      150.7% → 165.9% and unemployment 17.9% → 22.5%. A cost-of-living channel is exactly what
      amplifies a spiral; what is missing is what BREAKS one — **PUB**.
    - **Verify by lag, not by level:** contemporaneous wage~tightness reads −0.10, because the
      channel has an ~8 week lag and cost-of-living dominates the same-week number. Unfilled share
      LEADS wage growth 0.08 → 0.41 → **0.71** at 1/4/8 weeks. **A channel with a lag is invisible
      to a same-week correlation.**
60. **HH CLOSED — the close-out battery.** `scripts/hh-battery.ts` runs every §5-HH verify criterion
    as a measurement. At 120 weeks:
    - **Scoreboard closed.** `unmodeledFinancialAssetsUSD` 1,029.8B (seed) → 214.0B (w40) → **0.0B
      by w60**, rising in ZERO weeks of 120.
    - **Claims reconcile in both directions to 0.00% in all four regions:** institutional
      liabilities = household claims; net worth = its marked parts; tier sums = aggregate; household
      deposits = the banks' household-deposit lines.
    - **The recession transmission, demonstrated.** Killing the largest USA employer (207.4k jobs,
      1.73% of the labor force) against a same-seed control: unemployment **+1.62pp** within a week,
      consumption **−1.41%** by week 2 and **−2.16%** by week 4, decaying over 8–16 weeks. A firm
      failing now propagates to household demand through real payroll. (Past +30 weeks the escape
      dominates and the control is worse — a limit on how far this test reads.)
    - **Labor relations hold:** Beveridge −0.55 levels / −0.71 changes pre-escape, −0.97 / −0.55 in
      the escape; every macro field finite in all four regions.
    - **It found a defect nothing else could see** (§6): equity prices run away past ~week 80 —
      median 7.9 → 5,048 by w120 against EPS 0.39 → 0.57. **The 60-week harness cannot see it.** It
      surfaced only because HH2/HH4c made households mark to real prices. **Making a sector real
      makes other sectors' defects visible** — the argument for closing HH before PUB, and for a
      longer harness window now.
    - **What HH does not close:** the §6 inflation escape (HH4b damps ~11pp, HH6 amplifies ~15pp —
      the household channels push both ways and neither is the stabiliser); tax collection has no
      treasury; the residual capital-receipt share sits at 14.7% of income because bank and
      institutional payouts have no route home. All three want **PUB**.
61. **PUB1a: the government pays its interest.** Spending decomposes as `interest + procurement +
    transfers`, interest computed off the real debt stack and taken OFF THE TOP — so debt service
    crowds out the primary budget rather than being added to a deficit that already includes it.
    Coupons go to real holders, replacing a WS7-era carry that credited banks and money funds
    while the issuer paid nothing. Measured: interest 10.4% → 12.6% of spending as debt/GDP runs
    108% → 171%. **Only 52% of the bill reaches a modelled holder** (banks 22%, institutions 30%);
    the CB's 15% and foreign 24% are named in `governmentInterestToUnmodeledHoldersUSD` rather
    than netted out, which would understate the burden.
62. **PUB2a: the central bank gets a balance sheet, and the treasury gets an account.** Two
    scalars retired — a phantom 1e12 `centralBankReservesUSD` sitting beside real per-bank cash,
    and a `centralBankBalanceSheet` GDP ratio drifting on a stance multiplier. In their place: the
    sovereign book as assets, reserves + **TGA** + currency as liabilities, currency the residual
    that closes it (the CB is the one book allowed to issue what balances itself). **The TGA is
    the mechanism** — a treasury account is a CB liability, so filling it drains reserves and
    spending returns them, and WS6's repo market already exists to feel it. Remittances go
    negative when policy exceeds the portfolio yield, which is the real post-hiking-cycle
    phenomenon for free.
    - **Two lessons, both about posting a leg twice.** `evolveBankingSector` already credits each
      bank's sovereign coupon to cash AND equity; crediting reserves again in the CB stage broke
      the per-bank balance sheet by exactly the coupon, on every bank. What was missing was only
      the OTHER side — the treasury paying it. And the TGA was debited by every deficit and
      credited by no financing at all, so it ran to **−40.3B by week 60**: a treasury account
      without issuance proceeds is a cash flow with one leg.
    - **Named, not forced:** `unbackedBankCashUSD`. Real reserves exist because the CB bought
      something; here a bank's cash also grows from deposits and lending, so the identity does not
      close on its own. It shrinks as PUB2b's QE grows the asset side.
63. **PUB1b: tax is collected from real payers.** `governmentRevenueUSD` is now what actually
    arrived, so the TGA draws down between tax dates and jumps on them — the swing a treasury
    account exists to express. **The finding:** the fiscal block thought it collected 25% of GDP
    while the modelled bases support ~50–60% of that, because **there was no consumption or
    payroll tax anywhere**. Named as `unmodeledTaxRevenueUSD` rather than closed by shrinking the
    state, which would model a different economy.
64. **PUB1c: the two missing instruments, and taxes stop being weekly.** An **employer payroll
    tax** carved out of the labor share (which is TOTAL COMPENSATION, so households are paid it
    net) and a **consumption tax** as a wedge inside the cohort budget (disposable income
    unchanged, real purchases smaller — what a VAT does). Neither touches the S1 identity.
    Measured: real collections **~50% → 99–100%**, `unmodeledTaxRevenueUSD` to 0.00B.
    - **Periodicity is part of the number (rule 9), and "weekly" was the tell.** Households and
      SME pools were remitting every week, which no tax authority does. Every stream is now on its
      own calendar — corporate, SME and consumption tax quarterly, withholding and payroll monthly
      — and the TGA swings 43 → 30 → 66 → 43 → 86B across it.
    - **Two bugs the calendar exposed.** `currentWeekMod13` runs 1–13 and never 0, so a quarterly
      trigger written against `=== 0` never fired and the accrued liability grew to 5.35B unpaid.
      And with receipts lumpy and outlays smooth, a 4-week operating balance ran the TGA negative
      by week 10 — raised to 10 weeks, which is what a real treasury holds when it cannot yet
      issue cash-management bills.
    - **Capital income is not derived from wages.** Splitting the wage bill for payroll tax shrank
      household capital income with it and the S1 assert fired at 78.66% against a required
      79.46%. Capital income is a share of OUTPUT, keyed off total compensation.
65. **PUB1d: the auction stops being a forced take-up, and a workaround outlives its reason.**
    Stage 11 used to PLACE each new issue on existing holders pro-rata and debit their cash, with
    **no affordability check anywhere**. Its stated reason was real when written: unheld paper made
    every issuance week a one-sided demand shock and drove the 2Y negative against a 3% policy
    rate. Two later changes retired that reason without anyone going back — **S11** gave every
    holder a budget, and **§7.21** made `solveClearingStat` clear at the saturation point instead
    of returning its search bound. So the fix was a deletion: the new issue simply exists, 07c
    prices the enlarged bucket next week, and the dealer holds what finds no buyer — **which is
    what an undersubscribed auction IS.**
    - **Measured A/B:** bank reserves at w40 **−29.0B → +84.7B**; the 2Y at w26 **0.98% → 2.62%**,
      with no negative yield anywhere at w60 (§7.68 corrects this at w120); dealer residual 123B (w40) and 197B (w52) — a real primary
      dealer's inventory, which is the honest place for unsold paper.
    - **The lesson is §7.51's, in the other direction.** A refusal outlives its reason; so does a
      workaround. Both need a date and a condition, and neither gets re-checked unless the code
      says what would retire it.
    - **A mis-attribution corrected.** PUB1b's write-up blamed a 50.3B one-week fall in
      institutional cash on this placement path. The A/B disproves it — worst institutional cash
      is unchanged either way (−45.9B vs −47.9B at w26). Tracing it found an ETF running negative
      NET ASSETS, present in both worlds; recorded in §6 with ETF2 as owner rather than fixed
      inside a fiscal slice. **Two defects that move together are not one defect.**
66. **PUB2b: the balance sheet becomes a quantity, and a pledge that outlived its bond.** The
    central bank was the one holder that never got repaid — its book sat frozen at the 100B it was
    seeded with while the tranches behind it matured, so it held a claim on debt that no longer
    existed and its share of a growing stock drifted **15.0% → 11.4%** over a year. Now it is
    redeemed pro-rata like everyone else (no reserve leg: the treasury pays out of the TGA, which
    is the CB's own liability, so a CB asset and a CB liability fall together), and it places an
    **open-market order** that 07c and 07f price against real demand.
    - **The order is a size with no reservation level** — the same demand shape an index fund
      posts, because neither is pricing. What makes the CB unique is the CASH leg: it pays with
      reserves it creates, so its fills post to the asset side with no debit anywhere. That is not
      a shortcut; reserve creation is what a central-bank purchase IS.
    - **Three regimes, all of which fired in one 60-week run.** Reinvest fully when passive; buy a
      flow when the floor blocks the easing the Taylor rule wants (which needed the rule's
      UNCLAMPED target stored — the gap between it and the floor is the trigger); reinvest only
      part when the rate tool has room and the book is above the share it was built at.
      Measured: book **100B → 137B**, share **15.0% → 16.9%**, reinvestment 1.00 → 0.88 as the
      economy normalized, remittances negative when policy exceeded the portfolio yield.
    - **`unbackedBankCashUSD` at w52: 304B → 100B.** The named gap PUB2a opened was growing
      without bound purely because the asset side was frozen. It is smaller, not gone — reserves
      still grow from deposits and lending, which no central-bank purchase backs.
    - **Retired:** `balanceSheetStance`, a formula on unemployment and inflation, and the
      "monetization share" it drove — which took a fraction of the deficit and printed it straight
      into household deposits. A central bank buying bonds pays the SELLER; it does not credit
      households. The cross-border spillover now keys off the real reinvestment share instead.
    - **A pledge that outlived its bond.** Every bank in a region failed the collateral invariant
      at week 51 ("pledged 8.09B against 6.38B held"). Maturing paper that was pledged in repo
      never released its encumbrance — a pre-existing gap that only bit once the CB started
      competing for the same paper and books ran close to their pledges. **A new participant is a
      good way to find out what the old ones were getting away with.**
    - **Sized by a cap, not by a fit.** The first rule was unbounded in the blocked cut: a
      deflation deep enough to want a −5% policy rate ordered 40% of the stock a year, and the CB
      took 31% of its market in 30 weeks and cleared the 2Y at **−2.6%**. Capped at a real
      announced run rate (10%/yr of the stock, about double the Fed's peak) and at half the market
      (the BoJ's extreme), the same A/B gives a 2Y of 0.84% under QE against 2.28% under forced
      QT. **The cap is a fact about central banks, not a knob turned until the output looked
      right** — which is the only kind of constant allowed to fix a number.
    - **The verify criterion, answered by measurement.** Forced-QT A/B at w40: the book runs off
      136B → 86B and the 10s2s slope goes **210bp → 79bp**, through real absorption in the
      auction. No term-premium formula anywhere.
67. **PUB1e: four answers to "what does the government buy", and a bid that lost the auction.**
    The demand stage allocated G by buyer mix with a fiscal-stance multiplier; the auction
    re-derived a government slice off a SMOOTHED demand level (a different number, differently
    allocated); the GDP identity used a third formula without the stance; and the treasury's
    account was debited by the whole spending budget, which is none of them. Rule 3 four times
    over. Now: stage 03 owns the per-category budget, stage 05 bids exactly it, stage 11 debits
    what actually filled, and G in the identity IS the realized spend.
    - **The government's purchase had no cash leg.** Its bid cleared, the supplier was credited
      revenue, and nothing left the government — the treasury was debited a formula that had no
      relationship to what was bought. Both sides now move by the same `filledQty x clearedPrice`.
    - **`isGovernmentAggregate` was set and never read.** A flag on the bid that no settlement
      code consumed — the tell that the buyer side of this market was never built.
    - **The bid was losing the auction, and the sweep proved it.** Fill ran 38–63% of budget. A
      cap of last week's price +10% excludes the government from any category that moved more
      than 10% in a week, which under the §6 inflation escape is many of them. Sweeping the
      tolerance: unspent 0.81B (+10%) -> 0.54B (+25%) -> 0.36B (+50%) -> 0.21B (+100%), **flat
      after +50%**. So half the shortfall was willingness to pay and half is the goods market
      rationing every bidder pro-rata. Set at +50%, where the artifact is gone and only the real
      shortage remains. **A sweep tells you which half of a gap is yours.**
    - **The right constraint is the appropriated DOLLAR budget, not a price cap.** A government
      procures to a contracted program requirement, so it is far less price-elastic than a
      household (whose premium tops out near 1.9%). Fixing the budget in dollars and freeing the
      price means inflation erodes real government purchases on its own — the mechanism the +10%
      cap was crudely standing in for by excluding the government outright.
    - **What the goods market admitted.** ~25% of the procurement budget cannot be filled at any
      price, because aggregate bids exceed aggregate supply and everyone in the money is rationed
      pro-rata. Households have always been rationed the same way; PUB1e is the first thing that
      made it VISIBLE, because it is the first buyer whose unfilled demand has a cost. Named as
      `unspentProcurementBudgetUSD` rather than assumed spent.
    - **`decomposeGovernmentSpending` was dead code from PUB1a** — exported, documented, never
      called. Wiring it here is what made one owner possible.
68. **PUB CLOSED — the close-out battery.** `scripts/pub-battery.ts` runs every §5-PUB verify
    criterion as a measurement. At 120 weeks, **every criterion passes**:
    - **Every coupon reaches a holder and the government pays it.** 67.6% of the USA's 4.1B/wk
      bill lands on a named book (banks 0.6B + institutions 1.9B + **central bank 0.3B**, the
      share PUB2b made real), up from 52% at PUB1a. The remaining 1.6B is foreign and stays
      named in `governmentInterestToUnmodeledHoldersUSD` for **XB**.
    - **Debt service crowds out real purchases.** corr(interest share of budget, REALIZED
      procurement spend) = **−0.833** over 120 weeks. And the limit case works: quadrupling the
      coupon on the whole stack takes interest 0.5B → 2.4B/wk, real procurement **−43% to −58%**,
      transfers 2.2B → 0.9B, and debt/GDP 152% → **211%**. A debt spiral, with both crowded-out
      lines landing somewhere real.
    - **Remittances fall when policy exceeds the portfolio yield.** corr(policy rate, remittance)
      = −0.762 in levels, **−0.547 in changes**; negative in 63 of 120 weeks. Measured in changes
      because PUB2b's growing book lifts both series in levels — **a response is a correlation of
      changes, not of levels.**
    - **The balance sheet is a live quantity.** Book 100.5B → 136.3B, **49 of 120 weeks in QT**
      (reinvestment 0.752–1.000). The TGA is never negative in 480 region-weeks, and
      `unmodeledTaxRevenueUSD` sits at 0.0B.
    - **A correction to PUB1d's write-up:** "no negative yields anywhere" was measured at w60 and
      does not survive to w120 — 26 region-weeks print one, driven by the QE regime. Negative
      nominal sovereign yields are real, so this is a scope correction rather than a defect.
    - **What it found that nothing else could see** (all §6, none of them PUB's to fix):
      **the TGA runs to 1,188B** because revenue outgrows outlays. (**The first write-up of this
      said 306.6x against 12.2x and was wrong** — it compared 4-WEEK sums of a quarterly-lumpy
      receipt series at its endpoints, so it measured whether each window happened to contain a
      collection date. On trailing-52wk sums it is revenue x8.7 against outlays x6.5, a **1.3x**
      divergence, with GDP x12.4 above both. **A lumpy series has no endpoints** — the battery
      now refuses the comparison below 104 weeks.) `unbackedBankCashUSD` is flat to w52 (97 → 107B) and then explodes to
      **2,183B by w120**. Procurement fill falls to **7.7%** at horizon. And all four regions
      print the 2Y at 39.84–39.86% — four independent economies agreeing to two decimals is the
      §6 damper binding continuously, not a market.
    - **The 60-week harness sees none of the three.** Same lesson as §7.60: **a close-out battery
      is not a longer harness run, it is the only place a project's own criteria get measured.**
69. **PUB3a: nobody was paying the government's staff, and households were paid twice.**
    1.65M USA government employees (14.3% of the occupation pools) hold real jobs and earn real
    wages inside the labor share — **8.1% of GDP** — and the budget had no compensation line at
    all. Not just a missing leg: because those wages were already in household income AND the
    transfer envelope was sized as the whole primary budget, households were credited the same
    ~8% of output **twice**, once as wages and once as a transfer.
    - **The fix is a carve-out, not an addition.** Payroll comes off the top with interest, so
      the primary budget shrinks and transfers with it. Real national accounts split a 36%-of-GDP
      state as compensation ~22% of spending, purchases ~31%, transfers ~36%, interest ~11%; this
      now prints **21.9% / 23.7% / 41.0% / 10.4%** against a previous compensation line of ZERO.
    - **Measured:** household income **513.7B → 470.6B (−8.4%)**, 76.67% → 70.25% of output.
      That is income nobody was ever really owed.
    - **It found a second seed that overwrote the first.** The income drop did not appear until a
      diagnostic showed the implied transfer share (17.90% of GDP) matching NEITHER the carved
      (15.85%) nor the uncarved (20.97%) path. `simulation/initialization.ts` recomputes household
      income after the macro bootstrap, and that second computation was omitting the payroll carve
      AND the interest carve — a PUB1a leftover that had been silently winning for six slices.
      **When a number matches neither branch, look for a third writer.**
    - **A side effect worth more than the fix.** With payroll out of the primary budget the
      procurement budget is one the goods market can actually supply: unspent procurement at w120
      **22.7B/wk → 1.3B/wk**, fill ratio range **7.7–87.5% → 46.3–100%**. The §6 row blaming the
      goods market for a quarter of the shortfall was measuring an oversized budget as much as a
      short market.
    - **Also hoisted `GOVERNMENT_OCCUPATION_MIX`** — the 60/40 split was a literal in three
      places, so the headcount filling those jobs and the payroll paying for them now read one mix.
    - **What it does NOT fix:** the budget TOTAL is still `lastWeekNominalGdpUSD x (taxRate +
      deficitPct)`. Revenue/outlays is 1.18x (was 1.20x) and the TGA still reaches 1,141B. That is
      PUB3b.
70. **PUB3b/3c: the budget becomes a sum of real obligations — and a reverted change that should
    not have been reverted.** `spending = lastWeekNominalGdpUSD x (taxRate + deficitPct)` is gone.
    The budget is now interest + payroll + benefits + procurement, every line a real quantity at a
    real price, and **the deficit is an OUTCOME**. The automatic stabilizer is real with it: a
    recession puts people on benefits and takes the tax base down at the same time.
    - **The bases calibrate, which is the check they are sane.** The implied benefit lands at
      **51–53% of the average wage across all four independently-sized regions** — inside the real
      OECD replacement band — and procurement/payroll at a consistent 1.06–1.08x. Same test §7.9
      applies to the household tax rate.
    - **The judgment error, recorded because it is the lesson.** First attempt broke a hard
      invariant at w120: the TGA went to **−497.5B** across 53 region-weeks. I reverted the
      spending path. That was wrong. **A negative treasury account is not a fiscal outcome, it is
      a missing instrument** — and the user said so: governments really do run wage-indexed
      obligations against lagging receipts, and they cover the gap by issuing. The invariant was
      pointing at the financing, and I deleted the diagnosis instead of building the mechanism.
    - **PUB3c, the mechanism that was missing.** Bond financing is QUARTERLY (stage 11 accumulates
      `pendingUnfundedDeficitUSD` for 13 weeks) while the government spends every week, so between
      auctions the TGA absorbs the whole gap. Cash-management bills now bridge it: when the
      account is under its operating balance the bill program issues the difference, over a few
      weeks rather than in one block. PUB2a's own comment had promised exactly this and nobody
      went back for it. **TGA negative in 0 of 480 region-weeks**, 1,475B of CMBs across 26 weeks.
    - **The fiscal path is now an outcome, and it is heavy:** trailing revenue/outlays **0.47x**,
      outlays growing x14.8 against revenue x9.3, debt/GDP to 213%. That is a government that
      cannot fund wage-indexed commitments from its tax base — a real dynamic the old formula hid
      by construction, since it defined spending as revenue plus a fixed deficit share.
    - **THE FIXED ENVELOPE WAS MANUFACTURING CROWDING-OUT.** The debt-spiral shock used to cut
      real procurement **43–58%** on impact; it now cuts **0.0–4.2%**. That is not a lost
      mechanism, it is a corrected one: a real government facing a rate spike borrows, it does not
      cut pensions that quarter. Crowding out still shows over the long run (corr −0.836 on the
      procurement share, −0.715 on realized spend) through the debt path and the fiscal stance.
      **An impressive number can be an artifact of the constraint you imposed.**
71. **PUB3d: bills become real discount instruments, and a rename that admits the code.**
    - **The CMB that wasn't.** PUB3c's bridge was called a cash-management bill; the code added it
      into `weeklyBillIssuanceUSD` and split it across the SAME b13/b26/b52 programs at the SAME
      weights and prices. Not distinct in tenor, timing, or yield. A real CMB exists because a real
      bill calendar is FIXED — announced sizes on announced dates — so a gap cannot be met by
      enlarging Thursday's auction. This model has no fixed calendar: bills already issue weekly at
      a freely varying size. Renamed to `cashPositionBillIssuanceUSD`. **A name that claims a
      distinction the code does not make is a lie the next reader believes.**
    - **Bills paid coupons.** A treasury bill is a DISCOUNT security: sold below par, no periodic
      payment, whole return accreting to par. The model issued them at PAR *and* paid a coupon.
    - **The trap, and why this is all-or-nothing.** That treatment was economically correct in NET
      — receive F, pay r·t·F, repay F, cost ≈ the discount — so nothing looked broken. Discounting
      the proceeds while KEEPING the coupon would have **doubled** the cost. Four legs had to move
      together: proceeds discounted, coupon removed from the government, coupon removed from
      holders, and accretion added to holders' positions (`bill-accretion.ts` — the asset grows and
      equity grows with it, no cash until maturity, which is exactly why a bill's cash profile
      differs from a bond's). Conservation holds because the government's face-over-proceeds cost
      equals the accretion its holders accumulated.
    - **What was actually wrong before was timing and representation, not economics** — the
      treasury held the discount as cash for the bill's whole life, and holders were paid a coupon
      that does not exist.
    - **The catch this exposed, and the reason it is reported rather than fixed silently.**
      `weeklyInterestExpenseUSD` is now cash-basis and bills contribute zero, so the reported
      interest line HALVED (USA 14.7B → 7.3B/wk at w120). That is not a saving — the cost moved to
      the redemption leg. Measured, the bill discount accruing beside it is **8.1B/wk, larger than
      the entire bond coupon**, so the accrual burden is 15.4B/wk. Published as
      `governmentBillDiscountAccrualUSD`, a statistic and never a debit: charging it as expense
      too is the same double count. **A number that halves after a refactor is a claim to check,
      not a result to report.**
72. **XB1/XB2: ownership stops being a parameter, and the hedge decides who buys what.**
    - **`foreignShare` deleted.** It assigned each region a share of every other region's markets
      (sovereign 8% per foreign region, equity 5%, corporate 4%), re-imposed weekly by
      02-region-macro and subtracted from the tradable float in all five clearing books — while
      owning nothing. **442B of claims with no holder**, against 883B of institutional assets in
      the whole world. In its place: a MANDATE (home bias by entity type, the foreign remainder
      spread by market size so no per-pair constant is invented) and entity targets that are each
      entity's own book rather than a renormalization to an imposed aggregate.
    - **Measured foreign ownership of USA markets, now an output:** equity **16.8%** (imposed had
      been 15%), corporate **20.0%** (12%), sovereign **16.2%** (24%). Near the old number in one
      market, above it in another, far below in the third — which is what happens when a guess is
      replaced by a mechanism. The sovereign gap is the 442B-vs-883B arithmetic coming true: the
      four regions could never have held 24%.
    - **XB2 — the hedge, and the counter-intuitive consequence.** Cross-border fixed income is
      hedged as an institutional rule. Under covered interest parity the hedge pays
      `r_home − r_foreign`, so a hedged foreign bond returns `foreign_yield + r_home − r_foreign`
      and the comparison against a home bond reduces to term spreads: **cross-border flow chases
      the spread over the LOCAL short rate, never the headline yield.** A 15% bond in a 14%
      policy-rate country is worse than a 4% bond in a 1% one, and nobody had to be given that
      preference. Real contracts, not a discount on a yield: 774 forwards, 221.8B notional, with
      a named bank taking the mirror of every mark so the pair nets to zero.
    - **Coverage falls 93% → 80% as equity grows in the cross-border book** — bonds hedged in
      full, equity at 35%, which is the mandate showing up in an aggregate nobody set.
    - **Two defects it took building this to find.** A money fund's shares only moved on
      subscriptions while its assets grew by everything it earned, so book and shares diverged
      **without bound** (0.54% → 1.06% → 1.72% over 60 weeks); a stable-NAV fund pays its yield by
      ISSUING shares and its fee leaves to the manager. And 07b/07d swept every corporate holding
      into whichever region's auction was running — harmless while books were domestic, but the
      moment foreign holders existed it would have rewritten a JPN insurer's JPN bonds from USA
      fills. **A constraint that only holds because something else is binding is not a
      constraint** — the same lesson as the money fund, twice in one slice.
    - **Two shock tests were stale, one instructively.** One shocked an ownership share that no
      longer drives demand. The other starved only DOMESTIC buyers to under-subscribe an auction —
      which foreign demand now absorbs. That failure is the mechanism working.
73. **XB2b: a derivative has a supplier, and the cross-currency basis is what that supplier
    charges.** XB2 let any hedger strike a forward at pure CIP, in unlimited size, against a
    dealer that absorbed it for nothing. That is an infinite supply of derivatives — the same
    shape as every formula this project deletes, except the thing assumed away is a balance sheet.
    - **Three real costs, all quantities.** The notional consumes leverage capacity through a PFE
      add-on; the desk internalizes offsetting client flow and only the RESIDUAL has to be carried
      and delta-hedged; and the client posts initial margin, which is real cash held by the desk
      as somebody else's money (cash AND a liability — counting it as earnings would be a bank
      inventing profit from collateral).
    - **The price of all that is the cross-currency basis, and getting it for free is the point.**
      Post-2008 CIP stopped holding precisely because dealer balance sheets became expensive. A
      basis that widens with desk utilization — and faster with the un-internalized share, because
      one-way flow is what actually has to be carried — reproduces that instead of assuming it.
    - **Measured, calm against a dealer-equity shock of −65%:** capacity used **3.2% → 100%**,
      basis **4.9bp → 150bp**, and the share of the cross-border book that stays hedged falls
      **74% → 57%**. Hedgers walk when the hedge costs more than the mismatch is worth to them,
      which is what makes the DEMAND curve slope: a liability-driven insurer pays up to 220bp
      because its regulator prices the mismatch; a hedge fund quits at 45bp.
    - **A sign error worth recording.** Pricing the basis into the contracted rate the wrong way
      hands the hedger an instant gain at inception and the dealer an instant loss on every
      ticket — bank NIM went to **−2.2%** before it was caught. The dealer charges for its balance
      sheet; the client gets the worse rate. **A cost modelled with the wrong sign is a subsidy,
      and it looks like a working feature until someone reads the P&L.**
    - **It also does not bind in calm conditions (3.2% used), and that is correct** — the basis is
      near zero in normal times and blows out in stress. A constraint tuned to bind always would
      be modelling a permanent crisis.
74. **XB2c: the desks actually trade, and real flow anchors the currency.** XB2b gave dealers a
    balance sheet and a price but left the position naked: a desk accumulated net FX exposure from
    its client forwards and only MARKED it. A market maker wants the spread, not the currency.
    - **The sign was backwards, and it only survived because nothing read the direction.** A
      client SELLS foreign currency forward to hedge a long foreign asset, so the desk BUYS it —
      the desk is long. The book decremented instead. It went unnoticed because
      `crossCurrencyBasisBps` reads `|net|`; it became load-bearing the instant a desk had to
      delta-hedge a direction. **A sign nothing consumes is not verified, it is merely unused.**
    - **The delta hedge is real flow.** Having bought the currency forward, the desks sell it
      spot — measured at **−26B USA, −28B EUR, −21B UK, −19B JPN per week**, with ~63B of
      position still carried because a desk works a large position rather than dumping it. This is
      the channel by which a hedged foreign bond portfolio weighs on the currency it is invested
      in, and it did not exist while desks merely marked their books.
    - **It anchors the exchange rate, which was the surprise.** A/B on the price-impact
      coefficient: EUR/USA runs **1.499 → 1.485 → 1.475** with the flow and **1.720 → 2.238 →
      2.704** without it over the same 30 weeks. The formula drift terms (`tradeTerm`,
      `capitalFlowTerm`) were running the pair away; real hedging flow holds it. **A market with
      a real flow in it is more stable than one with only a drift, not less.**
75. **XB2d/2e/2f: FX becomes a market, in three corrections, each found by one question.**
    The arc is worth reading as a sequence because each step looked finished until someone asked
    what was on the other side of the trade.
    - **"Who is the desk buying currency from?" — nobody.** XB2c had desks selling their hedge
      inventory into a price-impact coefficient. The position shrank, the rate moved, and no
      counterparty existed. **XB2d** built the market: the inelastic side is dealer inventory,
      cross-border settlement and trade receipts; the elastic side is hedge funds and central
      banks, who are the answer to the question.
    - **"How can someone sell JPY to buy EUR if it clears only against USD?" — they could not.**
      The settlement schedule was built one currency at a time (for each region, what foreigners
      bought of ITS paper), so a JPN insurer buying EUR bonds registered euro demand and **no yen
      supply**. **XB2e** registers both legs in one pass over the entities. With a USD numéraire a
      JPY→EUR trade is "sell JPY for USD, buy EUR with USD" and the dollar legs net — which is how
      the real market routes most non-dollar pairs. **Building a two-sided flow one side at a time
      is how a leg goes missing.**
    - **"Is this actually a clearing-price auction like the other asset classes?" — it was not.**
      It was `move = −netDemand / totalSlope` clamped at 8%/week: no reservation levels, no
      position caps, no budgets, and when it could not clear it **parked the rate on the clamp**.
      That is the "a bound is not a price" error §7.21 already recorded — re-committed in a new
      market. **XB2f** routes FX through `clearFinancialAsset`: the currency is the instrument,
      the week's inelastic flow is the float, and hedge funds and central banks post the same
      schedule shape as any other holder (reservation, scale-in range, position cap from real
      capital, cash budget), with saturation clearing and a dealer residual.
    - **Five invented constants deleted across the three:** `SPECULATOR_SLOPE_PER_CAPITAL`,
      `CENTRAL_BANK_FX_SLOPE_PER_RESERVE`, `FX_SPOT_PRICE_IMPACT_PER_GDP`, the ±8% clamp as a
      price, and `FX_DELTA_HEDGE_EXECUTION_RATE` (a claim that a desk could work only 60% of its
      position — a liquidity assertion with no liquidity behind it). A desk now offers its whole
      position and carries what nobody takes.
    - **A pre-existing bug this exposed, and it is large.** `getFxToUsd` looked pairs up by the
      labels `'EUR/USD'`, `'GBP/USD'`, `'USD/JPY'` — **none of which this model builds**, since
      pairs were named `${base}/${quote}` over RegionIds. Every lookup missed and every caller
      silently took a hardcoded fallback, so **the one function converting to USD had never
      returned a real rate**. Matching on base/quote fixed it; currencies are now named properly
      (`CURRENCY_BY_REGION`: USA→USD, EUR→EUR, UK→GBP, JPN→JPY) and nothing matches on the label,
      which is what let the mismatch hide.
    - **Triangular consistency by construction.** What clears is each currency's VALUE against the
      USD; every pair is derived from two of those. Four independently drifting pairs could
      violate triangular arbitrage; three cleared values cannot.

76. **XB3a: a good has a world price — built, then HALF REVERTED, and the reverted half is the
    lesson.** `exportShareCapture` handed an exporter a clamped share of the importer's demand on a
    competitiveness-and-FX score while stage 05 was already selling the same output — a second,
    independent way to make a sale. Replaced by clearing every sub-unit in a WORLD book plus one
    LOCAL book per region, split by `CATEGORY_TRADABILITY`.
    - **THEN REVERTED, AND THE PREMISE WAS WHAT WAS WRONG. `CATEGORY_TRADABILITY` is a real-world
      EQUILIBRIUM** — the observed trade share of a category — not a primitive. Splitting supply by
      it imports the answer, so the model could never say what gets traded or why. **A parameter
      can be perfectly real, perfectly measured, and still be the answer rather than an input: the
      test is not "is this number true" but "is this number a RESULT of the history I am
      simulating".** The physical primitives underneath — cost to move a dollar of a good, and how
      long — were what the model lacked entirely: no distance, no freight, no lead time.
    - **The invoice-currency half was worse and is the sharper lesson.** Three weights
      (0.45/0.35/0.20), a `depth/(1+vol)` form invented on the spot, and an argmax over the score.
      Nobody picks an invoice currency by scoring four options on three weighted axes — a formula
      wearing a mechanism's clothes. It locked to 100% USD by week 5 because one invented weight
      (0.45) exceeded another's reach (0.35). **I recorded that corner solution as a finding about
      the world; it was arithmetic between two of my own numbers, and reporting it as a result was
      the real error.**
    - **What stands:** the per-firm settle-ONCE restructure across books (splitting the firm per
      auction is §7.5's shared-field collision waiting to happen — the second write silently wins);
      the global counterparty lookup; cross-border contracts filed in the customer's region; trade
      as accounting from the auction's own lots (world exports = world imports to the dollar);
      seeding an opening position by RUNNING the engine on a structural copy and restoring the RNG
      (§7.4's strictest form); and the deletion of `companyUpdates.cashChange`, dead since the S5
      ledger existed — found by §7.58's instruction to grep for readers before trusting a field.
    - **Cost, measured:** stage 05 265.1 → 361.3 ms/week, whole step 1,577 → 1,755 ms. The plan's
      recorded 604 ms/week baseline was stale by 2.6x, and the credit books, not stage 05, are the
      expensive half of the step.

77. **XB3a rebuilt, XB3b, XB5, and the battery: tradability became an outcome.**
    - **The premise was the defect.** `CATEGORY_TRADABILITY` is an observed trade share — a
      real-world EQUILIBRIUM — and splitting supply and demand by it meant the model could never
      say what gets traded or why (rule 4's sharper half). Replaced by physics: value density per
      tonne (a technological fact), real inter-region distances, and three delivery modes.
      **Measured at the close: Spearman(value density, −freight as a share of value) = 0.897.**
      The denser the value the less distance matters, with no table saying so — which is the
      whole point, and it is the number the rescope was for.
    - **The physics carries a result the old table could not state.** A domestic American road
      haul costs $19.24 a tonne against $3.45 for a transatlantic crossing — 5.6x over a quarter
      of the distance — because a truck burns seventeen times the fuel and carries three thousand
      times the crew per tonne-mile. That is why globalisation happened, and under the deleted
      table a foreign supplier was categorically harder to reach than a domestic one.
    - **XB3b: money had a currency and nobody had applied it.** Every monetary figure is
      denominated in its region's price level — goods prices track productivity almost exactly,
      and the seed FX rate is the precise inverse of that ratio (1/0.6824 = 1.4655, the EUR rate
      to the digit). Compared raw, the lowest-price-level region undercut everyone on every good
      and supplied the world while the USA exported nothing. **That is not competitiveness, it is
      a missing conversion**, and it had been invisible only because nothing had ever compared two
      regions. Local money stays local; every crossing converts.
    - **Four defects of mine, each found by running the thing rather than reasoning about it.**
      The intent promised each origin's output to every buyer independently, sizing four times the
      ships. A booking's alternative was the cheapest origin overall rather than the next one
      still holding stock, so every origin but the world's cheapest showed a negative surplus and
      three regions exported nothing. Carriers were seeded at 21x leverage because ship finance
      was sized against the hull alone, when a lender lends against the cash flow too. And the
      pipeline carry was charged at the goods market's inventory rate — 2% a WEEK, a physical
      decay figure — which put nearly ten percent of cargo value on a five-week voyage, killed
      cross-border trade, and **defaulted the entire carrier fleet by week twelve**.
    - **Two rates called "cost of holding stock" were eight times apart.** What is tied up in a
      pipeline is capital, so what it costs is the cost of capital — the region's own policy rate
      over a week, which moves with policy and is one of the real channels by which tight money
      shortens supply chains. **Rule 9's discipline applies to rates, not only to periods: name a
      rate for what it MEASURES, or the wrong one gets picked up.**
    - **A running economy's pipeline is FULL.** Seeding it empty meant the first arrivals landed a
      month in and importers starved until they did — §7.4 again, and it compounded the carry
      defect rather than being visible beside it.
    - **XB5:** the central bank intervened with its DOMESTIC BOND BOOK. It now holds real FX
      reserves, intervention moves them, and a bank at zero simply stops bidding — which is what
      makes a defence fail. Seeded at three months of import cover, the standard reserve managers
      actually hold to.
    - **What the battery found that nothing else could see** (all §6, none of them fixed here):
      freight rates run away on some lanes (EUR>UK 6.28 → 292,929/tonne over 40 weeks); **every
      non-USD currency loses six-sevenths of its value** once trade is real, which is probably the
      root of the first and is XB6's; and logistics is 0.4% of GDP against a real 5-6%.
    - **Still open:** XB3a-5 (payment terms and transaction FX exposure) is gated on **XB6**,
      because while the USD is the FX numéraire the cheapest vehicle currency is decided by the
      model's plumbing rather than by anything economic — so the question invoice currency exists
      to answer is not yet askable.

78. **The optimization pass, and the determinism it found broken.** 1,793 → 1,311 ms/week
    (−27%), byte-identical world — same-seed 25-week hash equal to the baseline's to the last
    byte. All three wins were §7.32's recorded anti-pattern again, work recomputed per item that
    should be computed once: the clearing engine re-derived every participant's stat-independent
    schedule on all ~62 bisection evaluations per instrument (07b −42%, 07d −46%, 07e −49%);
    goods-arrival ran a `.find` over ~2,000 firms per in-transit consignment (99 → 9.3 ms); and
    stage 05 recomputed the buyer's structural PD and the invoice-currency choice per LOT for the
    same ~2k buyers (~14k evaluations, now memoised per week).
    - **The pass's real find: same-seed runs no longer hashed alike, and it was not the RNG.**
      Three sites wrote wall-clock `new Date().toISOString()` INTO GameState (diagnostics at
      init, stage 02, stage 10), so every run differed at week 0 by the operator's clock. §7.32
      built determinism and this had silently eroded it — the first A/B "showed" the
      optimization changing the world when it was measuring clock noise, and a wrong bisection
      nearly followed. Diagnostics now stamp the sim calendar's date; the FULL state, no fields
      excluded, hashes identically across independent runs.
    - **Lesson: a determinism guarantee is only as good as the check that would catch its decay.**
      Nothing asserted run-to-run identity after §7.32, so wall-clock state accumulated unseen
      for months of work. The A/B hash is the check; it now exists as a scratchpad pattern, and
      any future optimization claim without it is a claim, not a result.
    - **Also fixed on the way:** the CB had one intervention budget PER PAIR under XB6 — three
      books, the same reserves committed three times a week; now one weekly budget drawn down as
      pairs clear. And the harness's CB identity read only the sovereign book while XB5 added FX
      reserves to the engine's asset side — 231 of 273 close-out violations were this harness
      omission, not the engine.

79. **Optimization passes 2–4: 1,793 → ~1,000 ms/week, and the solve became exact.**
    - **Bit-exact passes (hash-identical):** function-level CPU profiling, not the stage table.
      The engine's bisection read flat Float64Array columns reused across instruments; the
      credit adapters' per-(entity × name) recomputation hoisted to one pass per company per
      region-week; stage 05's per-lot conversions became per-pass tables (FX snapshot, 4×4
      freight matrix, memoised sourcing shares); input lots copy-once-then-append instead of
      whole-array rebuilds per lot; demand crosses to the engine by INDEX (dense array aligned
      with the instruments) instead of ~120k string-keyed Map round-trips a week; stage 08
      stopped photocopying every company's entire lot inventory weekly (aliased — nothing
      mutates it in place). Each step verified against the 25-week full-state hash.
    - **The solve is EXACT now.** Total demand is piecewise linear, so the clearing level is
      computed by one segment walk instead of approached by 60 bisections. Property-tested on
      20,000 random schedules against the bisection it replaced: zero disagreements beyond the
      bisection's own resolution, worst relative difference 4.1e-13. **A world relabel of the
      gentlest kind** (rule 10): the differences are almost always swallowed by the 4-decimal
      print rounding — hashes identical through week 10 — but by week 25 one rounding flip has
      compounded. Baselines are nominally relabeled from that commit.
    - **Two profiler lessons.** tsx flattens every function to line 1, so V8 profiles cannot
      attribute inside a stage — temporary section timers can, and did (stage 05's settlement
      and book-building were the real costs, not the auction walk; stage 08's revenue branches,
      not its object rebuild). And the profiler ATTRIBUTES INLINED CALLEES to their caller:
      solveClearingStat's 105 ms/week of "self time" bought only ~25 when replaced, because most
      of it belonged to the schedule walks around it.
    - **The frontier, measured honestly against the sub-300 ms target:** ~1,000 is near the
      bit-exact floor. What remains is structural — stage 05 (~250) and stage 08 (~180) are real
      work in long loops, the credit books (~290) are the economics of every holder pricing
      every name, and the GC (~110) shrinks only with allocation redesign. Sub-300 needs
      worker-thread parallelism for the RNG-free clearing books plus stage restructures that
      reorder floating-point accumulation — both world relabels, both SCALE's (§5-SCALE now
      carries the item with this measurement). User authorized the full push; the parallel leg
      is scoped there rather than rushed here.

80. **Worker-thread clearing landed, and the 300 ms question got a measured answer.**
    - `clearFinancialAsset` is pack → kernel → accumulate: the per-instrument compute is a pure
      function over flat typed arrays, shardable across a synchronous Node worker pool
      (SharedArrayBuffer packing read zero-copy, Atomics doorbells WITH TIMEOUTS, shards merged
      in instrument order so every floating-point sum keeps its sequence). Serial and worker
      paths are one kernel and hash byte-identically; the browser build keeps the serial path.
      Books with workers: 07b 106 → 78, 07d 97 → 73, 07e 77 → 65 ms/week.
    - **Why ship-the-objects died first:** a structuredClone of the companies array measures
      328 ms, regions 335 ms, entities 136 ms — PER COPY. Any worker design that serializes the
      object graph costs more than it saves. Packing is not an optimization detail; it is the
      only door.
    - **Three build lessons.** Never `Atomics.wait` unbounded — a worker that failed to start
      hung a 15-second run past five minutes; wait with a timeout and downgrade to serial. tsx's
      resolver inside worker threads cannot follow extensionless relative imports — the engine
      now imports nothing at runtime, the worker graph is the engine alone, and the pool
      self-registers from the main thread. And the V8 profiler attributes inlined callees to
      their caller, so a "105 ms function" can be worth 25 (§7.79's solve) — only replacement
      measures a component honestly.
    - **The measured wall, for the sub-300 ms target the user set:** of the ~942 ms/week, stage
      05 is 272 (RNG-bearing, object-graph), stage 08 is 190 (same), the books' serial
      extract/apply layer ~215, the tail stages ~230, GC ~100. The worker-parallelizable part is
      gone. Every remaining millisecond lives in serial walks of the OBJECT GRAPH, and the clone
      numbers above say why workers cannot touch it. **Sub-300 requires the state itself to move
      to columnar typed arrays** — companies, holdings, demand — with the object graph as a view
      for the UI: a real project (weeks, not a session), now scoped under §5-SCALE. 1,793 → 942
      (−47%) is what this codebase yields without changing what a GameState IS.
81. **Columnar-state wave 1: 946 → ~850 ms/week (3-run medians; machine noise ±20), every step
    byte-identical — same-seed hashes equal at weeks 10 AND 25, serial and workers alike.**
    - **The holdings store** (`holdings-store.ts`): the five books swept every entity's whole
      `itemizedHoldings` (~70k rows) once per region per book — twenty sweeps a week — then
      partitioned, rebuilt the array, and re-spread the entity list per region. One sweep now:
      books claim-scan their own class's rows and append fills; one write-back after 07e
      recomposes each array in provably the composed order the old chain produced; entities are
      working copies mutated in place. The subtle parts that made it byte-identical: claims use
      EPOCH semantics (a region pass's claims stay visible to reads until that pass would have
      applied — the index funds' mid-span book values depend on it), and 07f claims at APPLY
      with a different predicate than its extract reads. Books 278 → ~200 ms.
    - **Stage 08 updates companies in place.** `Object.assign(comp, {...})` — the literal's
      values all evaluate before the first field lands, and the resulting key order equals the
      spread's, so the change is mechanical. The loop's ONE cross-company read (the
      supply-relationship shock's two supplier figures) moved to a pre-loop snapshot. This
      removed the last whole-graph copy point (2,600 tenured ~150-field snapshots a week).
    - **Statement-level fixes off the compiled-bundle profile** (esbuild --bundle, then node
      --cpu-prof: positionTicks give per-LINE ticks; tsx flattens lines, so profile the bundle):
      per-week memos for figures recomputed per holding (issuer coupon/margin averages, the
      sovereign coupon table, the books' ladder sums), single-pass versions of per-region
      full sweeps (measuredForeignOwnership, 03's category-firm index, etf-flows' find-per-
      fund-per-investor), split-key probes instead of per-row template strings (corporate-action
      settlement), and `sortIndexByKey` — (key, index) is a TOTAL order, so the permutation is a
      property of the data and a hand-rolled merge sort replaces comparator sorts bit-for-bit.
    - **Two honest nulls.** Replacing `forEach` with `for..of` on the 74k-contract settle loop
      measured ZERO: the ~38 ms/week the profiler put on the loop header was inlined body work,
      not dispatch — §7.80's misattribution lesson, third sighting. And the WeakMap lot-value
      cache bought little: the leak categories receive purchases weekly, so their (huge) arrays
      are replaced weekly and always miss.
    - **The §6 lot leak taxes the clock ~70 ms/week** (measured: ~30 valuation re-reduce misses,
      ~25 copy-on-first-touch of ever-growing arrays, plus its GC share) and GC overall is ~12%.
      Wave 2 (columnar 05/contracts/plans, kernel apply arrays) goes AFTER IND, which deletes
      the leak and rewrites the same corporate objects anyway — see §5-SCALE.
82. **The FX mechanism sweep (user question: "is the CB too trigger-happy? do FX lines go through
    swaps? do reserves follow the real mechanism? does FX clearing go through banks?").** All
    four questions found something.
    - **The trigger-happiness was a sign error, not a threshold.** The central bank's
      reservation was placed with `1 - sign x pct` against the speculators' `1 + sign x pct` —
      the WRONG side of the market. The moment its currency slipped at all the bank stood fully
      in the money, buying at full size ahead of every private buyer, every week (measured:
      USA 60 of 60 intervention weeks). No threshold constant can gate a bid from the wrong
      side of the price. Rebuilt as DEFENSE ONLY, on the falling side of the pair, in the one
      direction each balance sheet can honestly express: a base-currency bank buys its own
      money with reserves; a quote-currency bank SELLS the base out of its reserve holdings
      (the engine expresses sales through current holdings — this is also what finally made a
      yen defense possible, since JPN is the quote of every pair it is in). The reservation is
      DERIVED, not chosen: private reservation + private full-size range — intervention begins
      where private absorption ends. After: USA 0 of 60; EUR/UK/JPN 27–36, which is the §6
      one-way-flow defect being defended against, not a reflex.
    - **Reserve accounting was one-signed and side-inverted** — every fill decremented, pro-rata,
      whichever side or direction. And fixing the accounting ARMED the reservation bug: a
      backwards-oriented bank buying every falling foreign currency, now correctly credited,
      compounded 17B -> 2,443B of "reserves" in sixty weeks — two defects masking each other,
      and the first fix alone built a money pump. The lesson is §7.34's in a new coat: fix a
      mechanism only together with the accounting that constrains it. Now: purchases of own
      money spend reserves pro-rata; sales of the base come off that reserve line; proceeds in
      a bank's own currency are extinguished, never an asset; no reflex accumulation exists
      (leaning your own currency DOWN is a policy regime the model does not assert); a bank at
      zero stops. Measured: reserves deplete monotonically under sustained defense and stop
      (JPN 2.5B -> 0.6B), USA's never move.
    - **FX was a dealer market with no dealer.** Every other book hands its residual to named
      banks; the FX residual was a statistic. The unabsorbed flow now lands on the same
      fxDealerBook the hedging desks run (capacity-weighted, correctly signed off the flow's
      orientation), so inventory consumes desk capacity, next week's flattening works it off,
      and fx-hedging's weekly mark carries its P&L (measured: ~62B gross warehoused by w60).
      No spread revenue — the payers convert at mid elsewhere, and a credit without a payer
      prints money; §6 now carries that as the named follow-up, beside the swap-line row
      (which needs an FX funding market to exist first).
    - **Close-out: 26 harness violations (was 66), zero of them the central-bank identity, none
      new** — 23 are the §6 USA-NIM watch line (now running negative w38–60, worth its own
      look), plus the byte-identical shock test and two revenue outliers. Reserve seeding was
      checked and left alone: three months of import cover split by sourcing shares is the real
      adequacy standard (§7.4-clean).
83. **BP1a: the industry registry exists, and the boat probe found the next wall.** One
    `INDUSTRY_REGISTRY` (domain/industry-registry.ts) now owns label, buyer mix, price tier,
    physics, capex basket, private-segment fallbacks and commodity links per sub-unit, plus
    recipe inputs per industry — and IND's dials (`storable`, `carryingCostRate`,
    `productionLeadWeeks`, `revenueMechanism`) at today's implicit values, so IND slices become
    value edits plus one mechanism each. The eight legacy tables are derived views re-exported
    under their old names (key order preserved where iteration is RNG-bearing; the registry data
    body was GENERATED from the live tables, so no value could be mistranscribed) — world
    byte-identical: w10 27fba443aabeee61, w25 abb1d86cc44de4fe, equal before and after.
    - **The rule-17 acceptance probe:** one temporary `recreational_marine` entry, ten weeks.
      Demand side passes whole — all four regions carry the category, households bid 9,102
      units/week at 62,577 USD on the LUXURY tier, freight prices its 30k USD/tonne mass —
      but ZERO producers: companyGenerator assigns product lines from HARDCODED per-sector
      templates (plus its own private `industryBySubUnit` map), so the supply side never learns
      a new good exists. That is BP1b's charter: line assignment reads the registry (producing
      sectors and line weights become registry data), which is a SEED RELABEL — a new world —
      and takes its own slice with its own close-out.
    - New baseline hashes for the gates (the FX sweep relabeled the world): w10
      27fba443aabeee61, w25 abb1d86cc44de4fe.
84. **BP1 closed: the registry owns the data, profiles own the behavior, and one entry is one
    product line.** BP1b made the generator DEAL lines from the registry — each industry declares
    its producing sector, and every firm (largest first) takes the sub-units its sector currently
    under-serves most, weighted by that region's own seeded category demand. The hardcoded
    per-sector templates and `SUBUNIT_TO_CATEGORY` are gone; supply is seeded to meet the demand
    the economy already states (§7.4). BP1c turned stage 08's four-arm
    `financialStatementProfile ===` chain into `PROFILE_REGISTRY[profileKeyOf(comp)]` over
    stages/profiles/{bank,insurer,asset-manager,carrier} — bodies moved verbatim, and the
    `sector === 'Banks'` alias now lives in the keying function instead of a stage condition.
    The OPERATING path stays inline by decision: IND2/IND3 decompose it into revenue-mechanism
    and cost-shape profiles as their own work, so cutting it twice would be waste.
    - **Rule 17 demonstrated end to end.** The boat entry (one `SubUnitSpec`, no other edit) went
      from 9,102 units/week of demand and ZERO producers under BP1a to **32 named producers
      supplying 2,179 units/week** at 70,043 in all four regions. That is the charter met:
      product line, physics, buyer mix, freight and producers from one entry.
    - **Coverage was a real defect, not just plumbing.** Public-producer coverage went
      17/28 → **28/28 sub-units in every region**, and USA categories with zero supply at w10
      went to **0**: the old templates named ~17 sub-units, so a third of the economy's
      categories had demand, prices and household bids with no domestic producer at all — orphan
      markets nobody had counted.
    - **Declared seed relabel** (a new world, as scoped): w10 8babb263cfea0e58, w25
      8d1b34097f855643. BP1c is byte-identical on top of it.
    - **Close-out harness: 47 violations**, and the shape is informative rather than alarming —
      **26 USA bank NIM + 15 USA bank capital ratio**, i.e. 41 of 47 are ONE bank story (the §6
      NIM watch line, which the FX sweep had already found running negative w38-60), plus the
      known byte-identical shock test, one equity-demand shock test, and four revenue-growth
      outliers. The bank cohort is now the top open item: the same USA banks whose NIM the §6 row
      tracks are now breaching capital too, and that is a real defect list to work rather than a
      relabel artifact — **next session's first job**, before IND starts.
85. **IND1 — what a good physically is, on both sides of the balance sheet.** Two halves, one
    idea: the model asked what a firm *was* and never what its goods *were*.
    - **Holding (output side).** Carrying cost stops being one hardcoded 2% on every firm and is
      DERIVED from physics already in each registry entry: warehouse rent is charged per TONNE,
      so the cost per DOLLAR is `WAREHOUSE_USD_PER_TONNE_YEAR / valueDensity` — a dollar of gravel
      occupies hundreds of times the space of a dollar of semiconductors — plus `52/shelfLife`
      for anything walking to zero on its own. One stated primitive (what a tonne-year of
      warehouse costs), everything else falls out of the entry. Storability likewise: only a
      PHYSICAL good can be held, so software and buildings hold none. **§7.50 is closed —
      digital output inventory is exactly 0 units, where enterprise software used to sit in a
      warehouse spoiling like steel.** The company-level `inventoryCarryingCostRate` is deleted
      (rule 3: the cost belongs to the thing held, not to the firm holding it).
    - **Buying (input side) — §6's lot leak, fixed at the root.** `purchaseKindOf` routes every
      purchase to what it physically is: RECIPE_INPUT stays a FIFO lot; CAPITAL_GOOD becomes
      PP&E at landed cost ON DELIVERY (the arrival week for a consignment still at sea);
      OPERATING is expensed, its cost already in the margin and its cash in settled purchases.
      **Measured: input lots at w10 went 112,598 → 1,017**, and the residual grows ~150/week
      (real recipe inventory) against ~12,000/week of immortal dead lots before.
    - **Investment became supply-constrained**, which is the real mechanism: PP&E grows by capex
      DELIVERED (811 firms/week), not by `newCapex / 52` — a budget approved. Stage 05's capacity
      growth reads the same delivered figure, so a plant grows when machines arrive. The cash
      ledger stopped paying for the same machine twice (capex was real cash in settled purchases
      AND accrued again in outflows); only the operating side accrues now, netting against the
      operating share of what settled.
    - **Close-out: 71 harness violations against BP1's 47 — and 64 of the 71 are the SAME bank
      story** (35 NIM + 29 capital ratio, from 41). No new failure family appeared: the rest is
      the known shock test plus five revenue outliers. IND1 did not break the banks; it made an
      already-top defect worse, which is itself information — the USA bank cohort is sensitive to
      corporate cash-flow timing, consistent with a funding leg that reprices wrongly. **The bank
      cohort is now ~90% of the harness and cannot be deferred past the next slice.**
    - **Two things deliberately NOT done here.** The depreciation duplication (`da = revenue x
      0.05` in the P&L beside the roll-forward's own sector-life figure, and the carrier's
      `/20`) is rule-3 real but belongs to **IND3**, where the cost structure is cut — noted so
      it is not mistaken for fixed. And the private-firm path still ignores delivered capex (it
      has no PP&E roll-forward at all); it no longer accumulates dead lots either, so this is a
      gap to close when HC's tier gets a real balance sheet, not a regression.
86. **The bank cohort, diagnosed — and the deepest "1$ is 1$" boundary in the model found by
    asking whether a company's cash is anywhere.** Three real defects fixed, one hypothesis
    disproved by measurement, and the actual root named.
    - **Fixed: wholesale funding was frozen at its seed value forever.** `evolveBankingSector`
      carried `prevBanking.wholesaleFundingUSD` unchanged while deposits grew and the asset book
      amortised, so the bank kept paying policy-plus-spread on funding it no longer needed. It is
      now the weekly residual of the same identity the seed uses and the harness asserts (rule 13:
      a stock a mechanism should produce is not carried as a constant).
    - **Fixed: firms born after the seed had no bank at all.** `homeBankTicker` was assigned only
      at seed, so every HC birth cohort held its cash outside any bank's view — 12 unbanked firms
      growing with each cohort. Births now bank like everyone else (1,208/1,208 private firms).
    - **Fixed: the lead bank on a deal was a second hash rather than the relationship.** Issuance
      re-ran `chooseLeadBank(comp.id, ...)` instead of reading `comp.homeBankTicker` — two
      representations of "which bank serves this firm" that agreed only by coincidence (rule 3).
      Choosing the relationship on COMPETITIVENESS rather than a hash is IND4/G3's.
    - **Disproved, by measurement: corporate deposits are not the banks' missing funding.** Total
      corporate cash is 57B against an 826B bank book (7%), so funding them with it moved
      wholesale by 11B. Attempting it also broke the per-bank balance-sheet identity in all 1,012
      bank-weeks — because the cash it represents **does not exist inside the banking system**.
      A company payment moves two S5 ledgers and no bank's book; `corporateDepositsUSD` is a
      reporting view with no matching asset. That is the honest answer to "does one dollar equal
      one dollar": for corporate cash, no — and it is why banks are ~48% wholesale-funded.
    - **Net: 71 → 68 violations, the bank story unchanged at 64 of them.** Not a disappointment
      but a result: the bank's arithmetic is right, and its collapse is the joint product of the
      corporate-cash boundary, the absence of hedging (DER) and the §6 inflation escape driving
      policy to 10%. **Do not tune the bank.** §7.34's lesson again: a number that looks like one
      sector's defect can be another sector's missing mechanism, and the identity tells you which.
87. **SETL1 — the settlement layer exists, and securities payments turn out to be the next
    defect.** `stages/settlement.ts`: instructions in, netting, deposits moved on named banks,
    each bank's residual settled in central-bank reserves, the treasury banking at the CB, and
    the boundary sector holding its balances at banks pro-rata so it cannot punch a hole in the
    CB's identity. Two residuals are computed rather than assumed — unresolved money (a party
    with no account) and the central-bank identity — and both are zero.
    - **Proven on a four-payment probe:** a same-bank payment nets to nothing inside the bank and
      moves NO reserves; a cross-bank payment settles in reserves exactly; a tax payment drains
      reserves into the treasury's account; a boundary payment lands as bank deposits pro-rata.
    - **What the sweep found on the way (SETL3/SETL4's charter).** There is already a
      paying-agent pattern — `payHoldersCash` records "the holders of X are owed Y" and a pass
      distributes it pro rata — but it is wired only for call premiums and take-private takeouts.
      **Dividends leave the payer and arrive nowhere** (no equity branch in
      `accrueInstitutionalIncome`; §6 half-knows, listing "institutional dividend passthrough" as
      an unbuilt channel). **Coupons are computed twice**: the issuer pays interest off its own
      ladder while holders accrue off their holdings — and the issuer pays on 100% of principal
      while holders receive only on what they hold, so the difference goes nowhere. The
      government side names exactly this residual; the corporate side does not.
    - **The real-world shape being reproduced**: issuer → paying agent → CSD → custodians →
      holders, with a record date fixing who is paid and the cash leg settling in central-bank
      money, DvP. The agents exist because an issuer does not know its holders; here the register
      does, which is what makes the pro-rata distribution honest rather than assumed.
88. **SETL2 — corporate cash is somebody's liability now, and §7.86's boundary is closed.** Every
    entry in stage 08's S5 ledger is a payment instruction: the walk already named each flow and
    its amount, and what it never named was the OTHER SIDE. `post(label, amount, counterparty)`
    names it; stage 08 no longer writes `cash` at all, and the settlement stage — which runs
    directly after it, because a balance must settle before later stages read it — applies the net
    to the company's balance, its bank's deposits and the reserves between banks.
    - **Asset and liability move in the same statement.** The first attempt moved reserves at
      settlement while the corporate-deposit line was recomputed early in the week from stale
      cash, and the identity drifted 430M / −95M / 2,628M. Both legs now move together, and 02b's
      recompute became a RECONCILIATION carrying its own reserve leg — which also catches balances
      moved by stages not yet migrated. **Measured: per-bank identity residual 0.0M across all 16
      banks, every week**, against the 1,012 violations the same idea produced before the asset
      existed (§7.86). The size of that reconciliation is the migration's own progress meter.
    - **The boundary is a named account with real reserves behind it.** `unmodeledDepositsUSD` —
      what the modelled economy owes counterparties that do not exist yet — runs −0.9B to −1.6B
      against 57B of corporate cash. Negative means the model has RECEIVED more from unnamed
      sources than it paid them; it shrinks as each flow gets a real counterparty, and it can no
      longer hide because it sits on a balance sheet the harness checks.
    - **Corporate balances now fund the banks and pay for it**, at the yield the money-market
      sweep competes with — the model already simulates the treasurer's alternative, so the rate
      is derived rather than chosen. The seed opens with the reserves behind those balances (§7.4).
    - **Close-out: 68 → 59 violations**, no new families, and the bank story is 56 of them. New
      world (declared): w10 c8d25434f9257792, w25 f8c6f485eda1fa75.
89. **SETL2b — a loan creates a deposit. Attempted, measured, failed, fixed at the root.** A loan creates a
    deposit: the bank writes the asset and the borrower's balance at the same moment and no
    reserve moves. SME and mortgage origination already do this correctly; the corporate FACILITY
    was the exception, and `bank-lending.ts` even carried the note that it would become deposit
    creation "when company cash settles through banks" — which SETL2 had just delivered.
    - **It does not work yet, for a reason worth keeping.** This stage reconciles the facility
      book from the TRANCHES, which stage 08 created a WEEK EARLIER, while the borrower's draw
      settles in the week it is decided. The loan and the deposit therefore appear seven days
      apart and the identity breaks in both weeks — **measured: 83 per-bank balance violations,
      142 total against 59**. Reverted to loan +X / reserves −X, which is self-balancing.
    - **The fix: the tranche's creation IS the payment.** Stage 08 now records a credit event
      where it writes the facility, and settlement books the loan on the bank in the same
      statement that writes the borrower's deposit — `BANK_CREDIT` as the payer, so no reserve
      moves. The reconciliation in bank-lending.ts needed no change at all, because it is
      LEVEL-based: it syncs the bank's list to the companies' tranches, so a loan settlement has
      already booked is found with its principal matching and contributes nothing. What remains
      there is the residue of changes with no payment behind them (a merger moving a book, a
      default), and that residue rightly still moves reserves.
    - **Close-out: 59 violations, ZERO balance-sheet violations** (from 142 / 83 at the failed
      attempt). Facility loans appear on bank books from week 15 (4 → 36 by w20). The same-seed
      hashes at w10 and w25 coincide with SETL2's, which is not a no-op but the shape of the
      change: the difference is a ONE-WEEK timing effect (reserves in then out, versus loan and
      deposit together) and it has washed out by both sample points.
    - **The lesson (§7.34's family):** two stages owning halves of one event a week apart is not
      a timing detail, it is the thing that makes the event inexpressible — and the fix is to
      record the event where it happens, not to reconcile it afterwards. The identity found it in
      one run, the third time that gate has paid for itself this session.
90. **"Where is the residual coming from?" — the boundary, decomposed, and a double-count it was
    hiding.** The unmodeled line read about −1B and that was not an answer, so it now reports
    itself: every instruction that names `UNMODELED` is attributed to the FLOW responsible
    (`lastSettlement.unmodeledByReason`), because §6 asks for this line to be watched down and a
    number you cannot attribute cannot be watched.
    - **The net is small because the gross nearly cancels.** Twelve weeks: 323B settled gross,
      against a boundary net of 28B. The traffic is `settled sales` +62.6B against `wages & other
      opex` −62.0B, `treasury purchase (sovereign)` −40.8B against `treasury sale` +33.5B, and
      `non-auction operating receipts` +38.0B.
    - **It was hiding a double-count SETL2 introduced.** The largest single line was the money
      market sweep at −64B/12wk — and the fund was ALREADY credited by its own stage, so the
      money arrived at the fund AND at the boundary: created, 64B in twelve weeks. The bank
      identity could not see it because the institutional sector is not in the settlement layer
      yet. Fixed: the sweeping company names the fund as its counterparty and
      `settleCorporateSweepBooks` keeps only the SHARE register, which is what belonged to it.
      **The lesson: a flow whose counterparty is credited by another stage must NAME it — routing
      it to the boundary does not defer the problem, it duplicates the money.**
    - **What the boundary actually is, now that it is honest.** Only `non-auction operating
      receipts` (+38B) is a true boundary — revenue from customers the model does not have. The
      rest have counterparties that already exist and are simply not named yet: households for
      wages, the sovereign market for treasury purchases, stage 05's buyers for settled sales.
      Those are the migration list, in size order, and each one shrinks this line.
    - **`unresolvedUSD` is now non-zero and that is correct**: 2.7B in a week, all of it
      institutions, which hold cash but have no bank yet. It is counted rather than dropped, and
      SETL5 (institutional cash) is what closes it. 59 violations, zero balance-sheet.
91. **SETL5 + SETL3: institutions bank, securities pay their holders — and the settlement layer
    starts reporting a defect nobody could see before.**
    - **SETL5 (institutions bank).** Entities get a relationship at seed, their balances open with
      the reserves behind them, settlement maintains the line and 02b reconciles it weekly with
      its own reserve leg. This is the CONSERVATION GATE, not plumbing: with institutional cash on
      a bank sheet, money created out of nothing breaks that bank's identity automatically — the
      blind spot that hid the 64B sweep double-count (§7.90). **59 → 43 violations.** Two defects
      found by the identity on the way: the wholesale residual did not net the new deposit lines
      (banks paying policy+spread on funding their own customers had provided, NIM breaches
      33 → 45), and the weekly sheet is rebuilt from a FIXED FIELD LIST so both new lines vanished
      every week (804 balance violations) — the same trap stage 08 documents.
    - **SETL3 (the register pays).** A dividend used to leave the payer and arrive nowhere. Now
      the issuer owes the register and the settlement pass pays each holder BY NAME, as a payment
      with a payer — which also made call premiums and take-private tenders real payments from
      their issuers rather than cash appearing on holders' books.
    - **43 → 85, and the cause is not the dividend.** Dividends are 0.08B/week. What the change
      exposed is that **institutional cash swings 72B → 23B → 32B → 18B week to week** — it is a
      residual of the clearing books, not a managed balance — and SETL5 ties bank reserves to it.
      So the banks' reserves now swing by tens of billions weekly, which an already-fragile cohort
      (§6: no hedging, a fixed-rate book, policy driven to 10% by the inflation escape) cannot
      absorb. **The volatility was always there; it had nowhere to show until money became
      somebody's liability.**
    - **This is the next defect and it blocks the rest of the migration.** Every remaining flow
      routed through settlement adds more of the same swing into bank reserves. Institutional cash
      should be a MANAGED balance (a fund holds a cash buffer and settles securities against it),
      not a weekly residual — that is a real mechanism and it belongs with the entities, not with
      settlement. Named here so the next slice starts from it rather than from more routing.
92. **The migration, carried through: SETL4 and the two boundary categories.** On the user's
    call, the institutional-cash-volatility fix (§7.91) was DEFERRED and the migration finished
    first, to see the end state whole.
    - **SETL4 — coupons paid once.** Interest was derived twice: the issuer expensed it off its
      own ladder while holders accrued it off their holdings, and since the issuer pays on 100%
      of principal while holders own only part, the difference went nowhere. The issuer's cash
      walk now reports one aggregate line and pays three real payees — the house bank for its
      facilities, the register for market fixed and floating paper — and
      `accrueInstitutionalIncome` stops deriving corporate coupons in the same commit. **A
      payment to a bank on its own account moves reserves AND equity**: it is the bank's income,
      not a customer deposit, so crediting reserves alone would leave an asset unbacked.
      **85 → 67.**
    - **Category C — the goods market.** The auction always knew which buyer took which seller's
      lot; stage 08 only ever saw weekly totals. Stage 05 now pays per lot and per contract, and
      the aggregate buyers pay too — routing only the company buyers had left sellers credited
      with revenue nobody paid, a gap this migration created and the next commit closed. The
      buyer pays landed cost while the seller receives ex-works, so freight is named separately
      for the carriers. **67 → 54.**
    - **Category B — wages.** The largest single boundary line now reaches households, split from
      other opex by the company's OWN payroll (headcount at the region's per-worker income from
      the labour pools), not a chosen ratio. **54 → 61.**
    - **The boundary, finally, is what it should be.** From 19 flows down to: `non-auction
      operating receipts` (+37B — the true boundary, revenue from customers the model does not
      contain), the securities cash legs (`treasury purchase/sale (sovereign)` −40/+33B and
      `primary proceeds` +4B), and small cross-border timing. **Every remaining item except the
      first is one tranche: the clearing books' own cash legs (07b–07f), which move participant
      cash directly rather than as instructions.** That is the last migration, and it is also
      what will let §7.91's institutional volatility be seen properly, since those legs ARE the
      volatility.
    - **61 violations, zero balance-sheet, throughout.** The identity held at every step of a
      six-commit migration, which is the whole argument for having built the gate first.
93. **The two independent quantities, and where the migration actually ends.**
    - **Institutional cash is a managed position now.** A fund runs a CASH SLEEVE and invests the
      excess over it — the target being the entity's own stated `cashPct`, so nothing is invented.
      What changes is that a balance stops being the residue of whatever the week's auctions did
      to it. (The swing narrows but does not vanish; the books still deploy the excess promptly.)
    - **Household income was two quantities, and the fix is the residual form.** Deposits were
      credited by a savings rate applied to a derived income estimate WHILE real wages and real
      goods purchases moved the same balance through settlement. The derived inflow is gone and
      every employer pays: companies, the government from its real account, and the private tier.
      **The tier's wage bill is the REMAINDER** — total wages less government payroll less what
      the named companies actually paid last week — because the tier keeps no books, not because
      a measure disagrees.
      **CORRECTION to the first write-up of this entry (§7.94):** the 4e16 explosion was blamed
      on "two employment measures disagreeing". That was wrong. The code read
      `occupationPools[].employedCount`, and the field is `employed` — the read returned 0 and a
      `Math.max(1, …)` guard turned it into a divisor of ONE. A wrong field name, hidden by a
      math guard, twice (rule 2: never clamp the symptom). The same read was live in stage 08,
      where it made `wageShare` compute to 1, so every company classified 100% of its operating
      outflow as wages for two commits. Fixed at both sites; the pools read 11.49M for the USA.
    - **THE LAST TRANCHE CANNOT BE INSTRUCTIONS, and this is a design finding rather than a
      shortfall.** The clearing books apply each participant's cash delta IMMEDIATELY, because
      the next book must read capacity net of what the previous one spent — defer them to
      end-of-week settlement and a fund spends the same dollar in five books. They are not
      outside the banking system: 02b's institutional-deposit reconciliation carries every one of
      them with its matching reserve leg, so the identity holds and no dollar escapes. They are
      settled T+1 rather than instructed, and that is the correct answer for a market whose
      participants must see their own cash within the week.
    - **The boundary now reads honestly**, and is dominated by one deliberate entry: the private
      tier's wages (143B/12wk) — the employer the model does not keep books for, paying real
      households real money. Beside it, `non-auction operating receipts` (+38B, the true
      boundary), the corporate treasury's sovereign purchases and sales (−40B/+33B, securities
      bought from a dealer whose inventory legs are not real yet), and small timing items.
    - **53 violations, ZERO balance-sheet, across a nine-commit migration.** Every dollar a
      company, a household, a fund, a bank or the government moves is now either an instruction
      through the settlement layer or a reconciled leg with its reserve counterpart. What remains
      un-instructed is named, sized, and on a balance sheet the harness checks.
94. **"Is that right?" — no. A wrong field hidden by a guard, and half the economy with no
    books.** The user asked whether two employment measures and an untracked sector could
    possibly be right. Neither was.
    - **There were never two measures — there was one, misread.** `employedCount` does not exist;
      the field is `employed`. `Math.max(1, sum)` then turned the zero into a divisor of one,
      which is how a per-worker income became astronomical. It survived two commits and a
      close-out because the guard made it look like arithmetic rather than a bug. **Any
      `Math.max(1, x)` around a divisor is a place a wrong read can hide** — the guard belongs
      after the value is known good, not around the lookup.
    - **The private-sector segments are half the economy and have no books.** Measured for the
      USA: **47% of employment (4.61M of 9.84M) and 49% of revenue (323B against 335B of named
      firms)** — and their entire state is `{segmentType, employment, annualRevenueUSD, marginPct,
      debtUSD, defaultRateAnnualPct, capexUSD, …}`. No cash, no balance sheet, no bank, no
      counterparty. They employ, produce, buy capex, carry debt and now pay ~70% of the economy's
      wages, all from the boundary — the largest fiction left in the model, and the one the
      settlement layer made impossible to keep ignoring, because everything around them became
      real.
    - **This is HC's unfinished half.** HC carved a NAMED private tier (1,208 firms with real
      balance sheets, now banked) out of these aggregates; what remains is the residue nobody
      carved. Finishing it is a project — see §5-HC3b/BP1's universe growth — and until it lands,
      the tier's wage bill must stay a residual: a sector with no books cannot pay from books.

95. **SEG — half assed, said so, and re-scoped.** The first design gave real books to
    `PrivateSegmentType`: five hardcoded buckets. The user rejected it with three questions, and
    each answered itself against a measurement. *Is creation based on all available industries?*
    No — 14 industries / 36 sub-units in the registry against 5 buckets seeded from three
    constants each; births collapsed them into 3 sectors and arrived with `productLines: []`,
    unable to sell anything anywhere; HEALTHCARE_SERVICES was filed under "Consumer" as the
    "closest fit until BP1 re-keys categories", and BP1 closed without ever re-keying it. *Does
    the share change with demand?* No — revenue walked `demandSignal x 0.06` clamped to +/-4%,
    every bucket treated identically, nothing ever reallocating between them, so the composition
    at week 500 was the seed's (CONSTRUCTION_REALESTATE's demand signal was a hardcoded
    `return 0`). *Are they active producers and consumers?* Barely — they sold into 7 of 36
    sub-units and bought in exactly ONE place, under a comment saying the other four buckets were
    "deliberately left out... guessing is BP1's job to retire". Four of five buckets, 32% of
    employment, bought nothing and sold nothing.
    **The lesson is about what to check before building, not about SMEs.** Every one of those
    facts was visible in the code before the first design was written; the recon that produced it
    looked at how the object was WIRED (who reads it, who pays it) and never asked whether the
    object was the right one. When a plan is to give something "real books", check first that
    the something is real: banking a fiction carefully still leaves a fiction. The tell was
    available and ignored — `SubUnitSpec` carried `capexPrivateSegment` and `privateSupplySegment`
    fields pointing the registry's sub-units back at the five buckets, which is a taxonomy
    leaking into the one that was built to replace it.

96. **SEG, rebuilt: the SME tier keyed to the registry.** One pool per (region x industry), 14 of
    them, seeded from each industry's own real demand times a stated `smeShareOfActivity` (SME
    intensity is a real structural fact and varies hugely: 0.78 construction, 0.12 semis). Pools
    buy their industry's recipe inputs and sell its sub-units in the same auctions under the same
    buyer mixes as named firms, hold cash at the region's banks (`smeDepositsUSD`, pro-rata by
    market share, inside the per-bank identity), pay their own wages, SME-pool interest and
    quarterly tax, and develop from a P&L measured out of the settlement report. Deleted, not
    adapted: `PrivateSegmentType`, `PRIVATE_SEGMENT_PROFILE`, `SEGMENT_SECTOR`,
    `PRIVATE_SEGMENT_OCCUPATION_MIX`, `getSegmentDemandSignal` and its walk,
    `PRIVATE_SEGMENT_SUPPLY_CATEGORIES`, `CAPEX_CATEGORY_PRIVATE_SEGMENT`. Pools read
    `SECTOR_OCCUPATION_MIX` through their industry's sector — the table named firms already use —
    so the tier needed no occupation primitive of its own.
    **Measured at close-out: 36 harness violations against a 59 baseline**, zero balance-sheet
    identity breaks, zero NaN, no unemployment breaches, and the three revenue-runaway violations
    gone. Pools hold 47% of employment and 47% of revenue (the independent 47%/49% audit in
    7.94), their composition MOVES with demand (USA RealEstateConstruction 18.9% -> 27.6% of pool
    revenue over 24 weeks while Energy and TechHardwareSemis shrink), and the private-tier wage
    line — previously the largest entry in the settlement boundary at ~143B/12wk — is gone.

97. **Giving something books is a way of FINDING missing flows.** Three defects surfaced the
    moment the pools had a balance sheet to run down, none of them in SEG's own code:
    (a) carriers, money funds and ETFs are created after the seed's home-bank passes, so they
    banked nowhere and settlement counted every payment to them as unresolved — **11.7B a week**
    for the money funds alone, invisible until the pools started trading with everyone;
    (b) `fx-hedging` rebuilt bank sheets from a stale snapshot parked in `companyUpdates` by
    stage 08, which runs BEFORE settlement, silently reverting every balance-sheet line
    settlement had moved that week — harmless for as long as each flow's two halves were written
    by one stage, and a bug the instant SEG split a pair across stages (an SME loan books in 02b,
    the deposit it creates at settlement), after which the revert kept the asset and dropped the
    liability;
    (c) the pools ran their cash negative in six months, which was not a pool defect at all: the
    settlement boundary was simultaneously showing firms' non-auction opex paid to nobody and
    households' consumption budget never reaching a goods auction. Those were the tier's two real
    customers. **A book that goes negative names the flow that is missing** — the same diagnostic
    the per-bank identity has been all along, applied to a new sector.
    Corollary, learned the same way: `SME_WAGE_GAP` is load-bearing, not decoration. Paying every
    pool worker the economy-wide average charged the tier a wage bill sized by its EMPLOYMENT
    share against income sized by its REVENUE share, and those differ by region — EUR opens at
    58% of employment against 42% of revenue, so its pools were insolvent from week 0 and the
    layoff cascade took EUR unemployment past 30% by week 58.

98. **OWN — ownership stopped being an input, and the clamp that was hiding a defect fell out.**
    `OWNERSHIP_SHARES` assigned banks 3% of equity / 28% of corporate credit / 22% of sovereigns
    and institutions 42/45/30; stage 02 drifted all three weekly on
    `(gdpGrowth + inflation) - tenor10Y` inside `[0.10,0.65]` and `[0.01,0.10]`, rescaling
    whenever they summed past 0.85. Six slices, one bounded commit each:
    - **OWN1** `measuredOwnershipAllRegions` walks the real books in one pass; stage 11 writes the
      three shares from it. No engine file reads them any more — verified by grep, they are
      write-only. `computeTargetOwnershipShares`, both coefficients, the drift, both bands and
      `MAX_NON_HOUSEHOLD_OWNERSHIP_SHARE` deleted.
    - **OWN2** a book's float is its outstanding, because **the instrument already excludes what
      does not trade in it.** `floatingDebtUSD` removes every bank FACILITY from the loan ladder
      (that IS what a bank holds in its banking book, subtracted once, per issuer, at each
      issuer's real mix) and `fixedDebtUSD` removes commercial paper; banks hold no equity and no
      corporate bonds as investments, only dealer inventory, which is a participant and not a
      subtraction. `1 - bankShare` was withholding another 28%/28%/3% from nobody.
    - **OWN3** a bank's sovereign book is bounded by `investableSurplusUSD` (funding neither lent
      nor kept as cash) above and `liquidityDrivenSovereignFloorUSD` (stressed outflows at posted
      runoff rates, less the reserves that already count as HQLA) below. 07c's old comment said
      the aggregate had to be imposed because `deposits x a ratio` implied the sector wanting
      several times the market — right about the formula, wrong about the fix: a liquidity
      requirement is a share of the deposits that could RUN, met by reserves first. Bills and
      bonds share the one appetite across 07c and 07f.
    - **OWN4** household direct equity is a name-by-name residual of the real register, not
      `marketCap x (1 - institutionalShare)` applied to every company alike.
    - **OWN5** `bankMarketShare` is measured weekly from deposits; `profiles/bank.ts` reads the
      bank's OWN sheet instead of the region's aggregate scaled by a constant.
    - **OWN6** `OWNERSHIP_SHARES` deleted; the bank sovereign seed is the book its own equity
      supports under the leverage floor; the private tier is seeded with the same two tranche
      definitions the books clear.

    **The measurement, taken once at the close (rule 12), with a single A/B for attribution
    (rule 10).** Harness **88 → 488** against 86817cb. 73 of the 488 are the §6 seed-employment
    row, *improved* from 81. 357 of the increase is ONE new family in two invariants:
    corporate books holding ~13% more paper than exists. **Both invariants read zero before OWN**,
    so this is not a pre-existing disease revealed — but the 0.85 rescale had made the
    ownership-conservation check pass BY CONSTRUCTION, which is why it surfaced the same day the
    rescale died. Owner OWN7, written up in §6.1 with both candidate causes and the order to take
    them in.

    **The lessons.**
    - **A carve and an exclusion are the same subtraction, and doing both is a double count.**
      Three books multiplied by `1 - bankShare` on top of an instrument definition that had
      already removed exactly what that share described. The float was the correct question; the
      answer was already in the code, one function up.
    - **Check what a passing invariant is actually asserting.** Ownership conservation passed for
      the model's whole life because a rescale guaranteed the sum. An invariant a clamp satisfies
      is testing the clamp.
    - **A share owning nothing is not only an ownership defect.** The same shape turned up in the
      dealer desk (one regional book copied onto four sheets, P&L split by market share) while
      answering an unrelated question about banks. §6.1 records it for G3.

99. **Banks are not firms here, and the gap has an accounting error in it.** Found while
    answering why banks look like they sit outside the corporate scaffolding. `profileKeyOf`
    sends a bank to `profiles/bank.ts`, which returns the whole P&L and SKIPS the operating
    branch of stage 08 — so a bank has no capex, no PP&E, no depreciation, no inventory, no
    product lines and buys no inputs, its margin is a hardcoded 0.40 whatever its book earns, and
    its loan losses are `random() * 0.05 * assets` rather than the defaults its own named
    borrowers experience. That is missing depth, and IND owns it. **The part that is a defect
    rather than depth:** `weeklyPayrollUSD` lives inside that skipped branch, while the labor
    market filters employers on region and active status only — so banks hire, fire and count
    toward the unemployment rate while paying no wage bill and posting no wage instruction.
    Headcount with no wage leg, in the same statistic LAB had just made bottom-up. Rule 14 does
    not only apply to flows you wrote; it applies to flows a dispatch table let you skip.

100. **The full-codebase review, 2026-08-29: 90 findings, four shapes.** Every file, every line,
    two jobs at once — comments corrected where stale or wrong, rule breaches recorded with
    owners. The findings are folded into §4/§5 (each owning project's plan) and §6; the working
    file (`docs/REVIEW_IN_PROGRESS.md`) is deleted, its full text in git history. Done in-pass:
    two dead exports deleted (`FX_SPOT_PRICE_IMPACT_PER_GDP`, `CAPITAL_CHARGE_BY_ASSET_CLASS`),
    one duplicated bare constant named once (`HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE`), a
    self-contradicting 07e comment and a dozen stale headers fixed. The lessons, each cheap to
    apply again:
    - **A formula that outlived its mechanism keeps deciding.** Four times the measured
      replacement existed and sat unused while the formula drove the sovereign rating, revenue,
      consumption and confidence. After closing a project, grep for the number it replaced — the
      deletion is part of the build (now FRM).
    - **Grep for met exit conditions.** Three files stated their own retirement condition
      ("becomes an outcome when…", "replaced by the flows once…") whose condition had since been
      met: `national-accounts.ts`, `BANK_TARGET_ROE`, `etf.ts`. The phrasing is searchable.
    - **A silent default is a dead-code justification protecting a live bug.** Five sites
      defaulted a missing write to a plausible value, each citing legacy data that cannot exist
      in a world regenerated from seed (now GUARD).
    - **A comment can assert the opposite of a measurement.** The FX damper documented as "NOT a
      bound the price rests on" while binding 38 weeks in 40; commodity prices documented as
      "entirely synthetic" while seeding crude at $76 and gold at $2,730. Comments about
      behaviour are claims — check them against the harness before trusting them.
    - **Count the writes and reads before arguing about a field.** `gdpImpactPct`: 14 writes,
      0 reads — half of NAT evaporated into a deletion. Stage 01 walked the whole universe weekly
      to feed a parameter nothing read.
    - **An aggregate check can pass while a category screams.** Market shares summed to 646% in
      one category (banks selling software) under a green harness — assert the small identities,
      not only the big ones (GUARD's share-sum invariant).
    - **Reframing beats enumerating.** §6.3's "nine imposed household tables" are one missing
      mechanism (cohort balance sheets, now COH); five damper prints plus a watchlist row are one
      thin-demand defect (promoted to §6.1). The review's net effect on §4: three new projects
      (GUARD, FRM, COH), CAP re-scoped around the margin clamp that gates it, G3 doubled, MAC
      halved.

101. **One harness.** (User directive, 2026-08-29: "remove any testing script, create just one
    and enforce that one, one that stuff can be added to, that's efficient, that prints every
    week.") `invariants.ts`, `hh-battery.ts`, `pub-battery.ts`, `xb-battery.ts` and `profile.ts`
    collapsed into `scripts/harness.ts`: one simulation pass that every check, battery and the
    profiler read as MODULES (`week()` / `report()` / `shock()` — adding a measurement is one
    entry, and `check-hygiene.sh` fails if a second script appears). One line prints per week —
    violations inline the week they occur — so a run is watchable live instead of a 500-line
    dump at the end. **Fidelity proven before trusting it:** the rewrite reproduced the baseline
    exactly — 488 violations in 18 families, 2,549 persistently damper-bound, worst streak 60 —
    because the check bodies were moved verbatim AND the old harness's dirty-RNG quirk was kept
    deliberately (the pre-run A/B tests advance the global RNG stream before the main loop;
    re-seeding would have relabelled the world and made every historical count incomparable).
    The batteries now measure the shared run rather than each paying for their own 120-week
    world, so `npm run verify` carries what used to take four commands. Lesson: a harness quirk
    that the baseline depends on is part of the baseline — document it and keep it, or reset it
    and re-baseline everything, but never change it silently mid-series.

102. **OWN8 — a ceiling that was an accounting identity, and the dead market it hid.** OWN3
    bounded a bank's sovereign book by `investableSurplusUSD = funding + equity − loans − cash −
    repoLent`. The balance sheet already says `funding + equity = loans + cash + repoLent +
    sovereign`, so that expression IS the sovereign book: the ceiling equalled the position it
    bounded, to the cent, for every bank every week, and no bank could ever buy another bond.
    Replaced by `sovereignBookCapacityUSD` — the book plus `leverageHeadroomUSD`, equity against
    unweighted assets, which is the one constraint that sees a zero-risk-weight book and was
    already bounding the weekly FLOW in the same two stages.
    - **Measured, A/B against 86817cb.** USA sovereign book 147B→285B (pre-OWN), 78B→53B (broken),
      **78B→350B** (fixed). Cash/deposits 2.2% / 47-68% / **7.0%**. Repo borrowed 23.0B / **0** /
      **46.7B**, with 3 of 4 USA banks borrowing, interbank lending live, and the SRF drawn
      (18.4B USA, 4.1B JPN) for the first time in the model's life.
    - **Harness 488 → 567.** The +79: 46 new `sovBondOwnership` conservation violations (OWN7's
      existing defect in a second asset class, now that the sovereign book is not artificially
      tiny), 15 more USA bank-capital-band weeks (a bank shifting cash into zero-risk-weight
      bonds grows equity on the carry while RWA does not move — real, and the reason the leverage
      floor exists), and a handful more revenue-runaway names. Attributed once, recorded, not
      chased (rule 10).
    - **How it was found, which is the lesson.** Not by the harness — by the user asking "how does
      repo usage look?" The harness was GREEN on this for eight commits because its corridor
      assertion passes VACUOUSLY: with no borrower the session returns the ON RRP floor as a
      literal, and a literal is trivially inside the corridor. **A market that clears nothing
      satisfies every check written about its price.** Three invariants now belong to GUARD: a
      category's shares must sum to 1; a book with willing participants on both sides must
      transact non-zero volume; and a holding ceiling must be able to exceed current holdings.
    - **The deeper lesson.** I reached for a residual ceiling because there was no funding market
      to bound a securities book properly. That is what **REPO** (item 9) is for: a treasury's
      book is bounded by what it can FINANCE, and until secured funding is an asset class with
      named counterparties, any bound on it is a notional stand-in. OWN8's capital ceiling is
      correct and interim; REPO replaces it.

103. **SETL6 — the clearing books settle through a clearing house, and CASH closes.** The five
    books (07b corporate bonds, 07c sovereigns, 07d loans, 07e equity, 07f bills) moved
    participant money themselves — `entity.cashUSD +=`, `cashReservesUSD +=`. A balance changed
    and no bank's book knew: the shape §7.86 was found by, in the one place still doing it.
    - **A cleared market settles through a CENTRAL COUNTERPARTY, so that is what was built.**
      Every participant faces the clearing house, pays or receives its net for the session, and
      the clearing house is flat by construction because it is on both sides of every trade.
      That is the invariant the shape buys: `clearingHouseResidualUSD` must be zero, and any
      book that settles one side of a trade and not the other says so immediately. Two party
      kinds carry it — `CLEARING_HOUSE`, and `BANK_SECURITIES` for a bank's own book (reserves
      move, equity does NOT: the security is the other leg and the stage books it in the same
      pass, unlike `BANK`, which is the income case).
    - **The dealer is a participant now, so the engine reports its leg** (`dealerNetCashUSD`:
      it is the counterparty to every fill, so it receives exactly what the participants paid).
      The fee half goes to the named desks by market share — normalised, because the clients paid
      the whole fee and the shares do not sum to 1. The rest is the inventory it was left
      holding, and since that book sits on the REGION rather than on any named bank, its funder
      is `UNMODELED` under its own reason line. **That is the §7.19 unfunded-dealer gap, which
      has been silently creating and destroying money at every session since the desks existed;
      it is now a boundary line with a size (the largest, by far).** G3 closes it.
    - **The books clear before the settlement pass, so a trade is a PAYABLE until it settles.**
      `pendingSettlementUSD` is the running net of a party's unsettled instructions, and it is
      read in three places that would otherwise be wrong: a fund's purchase capacity (or the
      five books each spend the same balance), a bank's fundable cash (same, across 07c and
      07f), and `totalAssetsUSD` at marking time — the securities are on the book and the cash
      has not moved, so leaving the receivable out marks every buyer up and every seller down by
      its own week's trading. This is ordinary fund accounting, and it is more correct than the
      in-place mutation it replaces.
    - **Three things the gate caught that had been sitting there.**
      **(a)** `settlementResiduals` was written with SETL1, was never called by anything, and had
      the household sign the wrong way round. Nothing read it, so nothing caught it. The
      residuals are computed inside the run now, carried on the report and on the state, and
      asserted every week by the harness.
      **(b)** The central bank's clearing leg had no accounting. It pays with reserves it
      creates, so the reserves that appear at the sellers' banks are NEW money and the identity
      has to know: `centralBankIssuanceUSD` is that line, and QE grows the monetary base for the
      first time instead of crediting a seller's cash outside the banking system.
      **(c) 07f's bank writes had never landed.** It wrote `ctx.updatedCompanies`, and stage 08
      rebuilds that array from the week-start companies and takes each bank's sheet from
      `ctx.companyUpdates` — so every bill fill it cleared for a bank was discarded, and 07c's
      careful pass-through of the bill buckets was preserving a position nothing was updating.
      It also read the week-start sheet, so its funding budget ignored 02b's repo session and
      07c's purchases. Invisible until the reserves leg started surviving through settlement
      while the securities leg still did not — then it was 14 banks × every week.
      **`companyUpdates` is the ONLY bank-sheet write that survives before stage 08.** 07f was
      the last stage doing it wrong; everything else that writes `updatedCompanies` runs after.
    - **Harness 567 → 602, and where the +35 is.** The USA bank-capital-band family is GONE
      (16 → 0 — §7.102's own attribution, closed by reserves that now actually move between
      banks). Against that: UK leveraged loans 0 → 48 and JPN 54 → 32, USA/JPN sovereign bonds
      0 → 5. Every one of those is `checkHoldingsLedgerConservation`, whose region-keyed holders
      against issuer-keyed positions **OWN7 step 1 already names as measuring the wrong thing** —
      UK arrives at 10.2% over, the same magnitude EUR has carried all along, and JPN leaves.
      A moved number in a check known to be broken, attributed once and not chased (rule 10).
    - **All three residuals are zero every week for sixty weeks, and the per-bank identity holds
      throughout** — the gate that carried the whole six-slice migration, doing it once more.

104. **OWN7 — the float was the whole issue, and not every holder was in the book. Harness
    602 → 107.** OWN made ownership a measurement (§7.98) and the corporate and sovereign books
    then read ~113% of what exists. The plan said fix the two red invariants first, because both
    might be measuring the wrong thing. One was; the other was right and its violation was real.
    - **`checkHoldingsLedgerConservation` compared the wrong two numbers, and had since XB1.** It
      filtered holders on the HOLDER's region and then counted every position regardless of the
      ISSUER's, so a JPN insurer's USA bonds scored against JPN outstanding. It also left three
      real holders off the held side — the central bank's sovereign book, the corporate
      treasuries, and the banks' own `businessLoans`, which ARE floating corporate debt. Both
      sides are keyed to the issuer's region now, the same way the ownership register keys them.
      It stays a ONE-SIDED test: unnamed holders are the residual, so only exceeding outstanding
      is a defect.
    - **`checkOwnershipConservation` was right; only its comment was wrong.** It said foreign
      ownership was "not part of this conservation sum" because it is measured separately — true
      before OWN1, false since, because the register attributes by ISSUER and foreign funds are
      already inside `institutionalShare`. So the check was correct and the ~1.13 was real.
    - **THE MISSING SHRINK: the float was the whole issue, but not every holder bids.** 07c and
      07f set `tradableFloatUSD` to the entire outstanding stock on the reasoning that every
      holder is real now and there is no block outside the market. Two blocks are outside it.
      **The central bank on a week it places no order** — `centralBankParticipant` returns null
      then, so the CB is absent from the book while ~15% of the stock sits on its balance sheet,
      and the auction hands that same paper to the banks and the funds. **The corporate
      treasuries**, which park cash in short paper (stage 08) and never bid. Subtracting what
      non-participants hold took the sovereign books from 114% of outstanding to 97%, with a
      real household residual — which is what the verify asked for.
    - **The register was counting SME POOL loans as corporate ownership.** A pool's debt is a
      scalar on the pool (`seg.debtUSD`), not a tranche on any company, so ~22% of "corporate
      bond ownership" sat in the banks' column against paper that does not exist. Rule 3, and
      most of what made `corpBondOwnership` sum above one.
    - **A merger left the target's paper on its holders' books.** Holdings are keyed by issuer
      company id; the merger transfers the target's DEBT to the acquirer and marks the target
      absorbed, so the holder kept a row against a company that had left the books while the
      same principal was re-cleared to the same institutions from the acquirer's ladder the
      following week. Measured on a merger week: 161B held against 131B outstanding. The rows
      are re-keyed to the acquirer now — the debt moved, so the paper moves. Equity rows are
      NOT re-keyed: those shareholders were paid in the tender.
    - **What is left is ONE defaulted issuer, in one week of sixty, and it is G5's.** After all
      of the above the conservation check reads clean everywhere except a defaulted company whose
      bonds are still on its holders' books — because there is no recovery mechanism to take them
      off. That is exactly what **G5 (default resolution)** is for, and it is now that project's
      opening measurement rather than a mystery in OWN's column.
    - **602 → 107, 27 families → 12.** Every ownership and conservation family is gone. What
      remains is unemployment bands (83 of the 107, JPN and EUR), the USA bank capital band, one
      shock test and four revenue-runaway names — none of them OWN's.
    - **The lesson, which is §7.102's again in a different market.** A number that looks like a
      disease can be a measurement error, and a number that looks like a measurement error can be
      real. The only way to tell is to make the comparison correct FIRST and then look — the
      plan's own instruction here, written before any of it was known, and it was right.

105. **GUARD — the silent defaults throw now, and two of them were hiding live bugs.** The
    review found the same shape five times: a read that cannot find what it needs substitutes a
    plausible value and carries on, each justified by legacy data that cannot exist in a world
    regenerated from seed. All five are gone — four throw at the read (`domain/defect.ts`), and
    the fifth, being UI, renders an em dash instead of a fabricated 4.75% policy rate.
    - **Two fired on the first run, which is the whole argument for the change.**
      **(a) No seeded company had a `listingStatus`.** `generateInitialCompanies` never set it and
      the entire listed universe existed on `undefined → PUBLIC`. Written down now.
      **(b) A merger's consolidated tranche had no call protection** — and chasing that found more
      than the guard asked for: `consolidateTranches` bucketed by rate type and tenor ALONE, so a
      bank facility and a syndicated loan merged into one tranche and both flags went with the
      protection. The combined paper then appeared in 07d's float: the G2 double-count, recreated
      by the merger stage, invisible because nothing downstream could tell. The bucket key is
      every property that makes a tranche a different instrument now.
    - **Three dead outputs deleted, one of them expensive.** `regionFloatingPrincipal` cost a
      full-universe tranche sweep every week to feed `evolveBankingSector`'s
      `businessLoanBookInputUSD`, a parameter declared and never read since G2 — and it counted
      bank facilities, the same double-count as above. `marginCompression` and stage 02's
      `creditContagionBps` were passed as literal zeros into branches that could therefore never
      fire. The parameters, the fields and the computations are all gone; `systemicStressFactorGlobal`
      survives because stage 08 genuinely reads it.
    - **Three invariants, each of which would have caught a defect this project found by hand.**
      **Σ categoryMarketShare per region per sub-unit** — it fires immediately at 160-166% on
      `enterprise_software` in all four regions, plus three UK service categories and USA
      defense systems. That is the 646% finding, now a line in the harness instead of a hand
      measurement. **Owner: IND**, whose §5 entry already names it.
      **A market with a real borrower and real lenders that transacts nothing.** Measured BY THE
      SESSION (`fundableNeedUSD` / `clearedVolumeUSD` on the region), not reconstructed from
      end-of-week sheets — the first version of this check read the closing balances and fired on
      banks that were short at the close but not at the session, and on banks short with no
      unencumbered collateral, which is a real constraint and not a dead market. The distinction
      matters: the corridor assertion passed VACUOUSLY for eight commits because the early return
      prints the ON RRP floor as a literal (§7.102).
      **A holding ceiling may not equal the position it bounds.** The engine reports
      `anyCeilingAboveHolding` per book and the adapters record a dead book on the state; the
      harness asserts none. This is OWN8's defect generalised — a constraint that binds
      identically on everyone every week is an identity wearing a constraint's name.
    - **What this costs.** The harness now reports the category-share family it could not see
      before. That is not a regression: it is a pre-existing defect becoming visible, which is
      what this project is for. Every later project inherits loud failures.

106. **FRM — four formulas that outlived their mechanisms, deleted.** The review's shape 1, four
    times over: a project built the real measured mechanism and the formula it replaced was never
    deleted, and in every case it was the FORMULA a downstream decision still read while the
    measurement sat beside it unused. No new mechanism here — every fix is "read the number that
    already exists".
    - **The sovereign is rated off its own budget now.** There were two debt ratios and the
      rating read the invented one: `debtToGdpPct` walked weekly from a stance step-function plus
      `0.15 × tanh(outputGap × 2)`, while stage 11 computed `debtToGdpPctBottomUp` from the real
      stack over measured GDP and PUB3b had already made the deficit an outcome of real
      obligations less real receipts. The walk, `fiscalDeficitPctGdp`, `structuralDeficitPctGdp`
      and `cyclicalDeficitComponent` are gone; the same two thresholds read
      `sovereignDebtToGdpRatio` and `sovereignDeficitPctGdp`. **A downgrade — and the spread that
      follows it — is something the government's own budget did.** `DEBT_TO_GDP_PCT` survives as
      what it always was: a seed primitive that sizes the opening stack once.
    - **Government revenue carries the measurement forward.** `GDP × effectiveTaxRate / 52` was a
      second representation of a quantity stage 11 measures and overwrites weekly, and it was what
      every stage between 02 and 11 saw. It now carries last week's measured figure, exactly as
      inflation two lines above it always has.
    - **Households spend out of the wage they are paid.** LAB made the wage a real price and the
      pools' `wageGrowthAnnual` is the employment-weighted average of what firms actually offered
      — stage 08 and the UI read it, while consumption (`realWageGainEffect`) and confidence
      (`cciEquilibrium`) read a Phillips curve with three invented coefficients. Both read the
      pools now, blended by the pools' own employment. The three-week lag buffer went with the
      formula: a measured wage is already the average of what was offered over the weeks those
      postings took to fill.
    - **The opening rating is an outcome.** Four ASSIGNED labels (USA AA, UK AA, JPN A, EUR AAA)
      were real-world data, which rule 4 forbids outright. `openingSovereignRating` puts the
      seed's own ratio and deficit through the weekly rater's thresholds — one code path for the
      seed and the week (§7.4). Regions that open with identical fiscal positions now open at the
      same rating, which is correct: nothing about the seed makes one a weaker credit.
    - **Deliberately left standing:** the fiscal-stance step function (D33). `fiscalStanceScore`
      still moves on a regime label and still drifts the tax rate. Deleting it needs a government
      that reads its own budget position, which is behaviour, not a deletion. **Owner: MAC.**
    - **Measured after the fact (§7.107): 331 violations in 18 families, of which 240 are
      GUARD's brand-new category-share invariant firing on a defect that was always there.**
      Excluding it, the pre-existing count went **107 → 91** across GUARD and FRM together: EUR
      unemployment 23 → 9, the USA bank capital band 15 → 9, the "reported unemployment is not
      the reading of its own employment stock" row gone, JPN corporate-bond over-holding gone.
      One new failure, recorded not chased: the sustained-equity-demand shock test stopped moving
      its name's price (§6.1).

107. **The week's cost, measured — 1,139 ms mean, and stage 05 is half of it.** Run on the tree
    as of FRM's close, `npm run profile`, 60 weeks with the shock worlds: **315 s wall clock in
    total, 1,139 ms per week (profiled mean 1,151 ms over 57 weeks after warm-up), worst week
    1,660 ms.** The first weeks run ~900 ms and the run settles around 1.2 s.
    - **The distribution is one stage and then everything else.** `05-unit-bidding` **538 ms mean
      / 803 ms worst — 46.8%** of the week, on its own, more than the next six stages combined.
      Then `08-company-fundamentals` 137 ms (11.9%), `09-concentration-risk` **98 ms (8.5%)**,
      `07d` 56 ms, `settlement` 55 ms (worst 197 ms), `07b` 51 ms, `07e` 42 ms. Everything below
      that is under 3% and the tail is noise: eighteen stages are under 5 ms.
    - **Two things worth naming.** `09-concentration-risk` computes supplier/customer
      concentration FLAGS and costs 98 ms a week — 8.5% of the run for a diagnostic nothing
      prices off. It is the cheapest large win on this table and it is not SCALE's hard part.
      And `settlement`'s worst week is 3.5x its mean (197 vs 55), which is the netting pass
      meeting a heavy week — expected, and worth watching as more flows migrate onto it.
    - **Against §7.81's ~850 ms/week.** The week has grown by ~290 ms since SCALE wave 1, across
      SEG, OWN, CASH and the settlement layer — every one of which added real flows. The number
      to hold is the FRONTIER, not the level: SCALE wave 2 is sequenced after IND for the reason
      recorded there, and stage 05 at 46.8% is where it will spend its effort.
    - **Where the OTHER four minutes go, since a week is only ~1.1 s.** `npm run verify` runs
      **243 weeks, not 60**: 60 for the run itself (measured directly at **69 s** with
      `SHOCKS=0`), 43 in the pre-run A/B mechanism tests (the equity-demand test alone builds two
      20-week worlds), 60 in the HH recession battery and 80 in the PUB debt-spiral battery —
      every battery is a control world AND a shocked world, each a second full simulation. At
      ~1.1 s a week that is ~277 s of simulation plus seven seed builds and the snapshot clones.
      **The shock batteries are three-quarters of the wall clock**, which is why `SHOCKS=0` costs
      69 s and the full run costs 315. §1.10 carries the table.
    - **Measured directly, not inferred:** `WEEKS=1 SHOCKS=0` = 3 s, `WEEKS=60 SHOCKS=0` = 69 s,
      so (69−3)/59 = **1,118 ms/week** — within noise of the profiler's own 1,139, from a
      completely separate clock.
    - **The measurement itself is now one command** — `npm run profile` prints the table above,
      so the next person does not have to build it.

108. **IND-R1 and IND-R2 — banks pay their staff, and financial firms stop supplying software.**
    The two findings the review told IND to take first: one an active accounting error, one a
    deletion the harness was already measuring.
    - **IND-R1: payroll is common to every firm, because a firm with staff owes them whatever
      kind of firm it is.** `weeklyPayrollUSD` lived inside the OPERATING branch, which banks
      skip — so the labor market hired and fired bank staff, counted them in unemployment, and no
      payroll ever hit bank EBITDA and no wage instruction was ever posted. Headcount with no wage
      leg (rule 14), inflating measured employment against measured income. It is computed once
      now, before the profile dispatch, and handed in; the profile decides only how its cost shape
      absorbs it. A stated margin already contains a baseline wage bill, so those profiles charge
      the DEVIATION; a profile that builds its costs up charges the whole bill.
    - **The carrier had TWO payrolls, and the P&L read the one the labor market could not move.**
      `annualCrew = sum(asset.crewCount) × crewAnnualWageUSD` was computed off the fleet spec
      while `employeeCount` — which the labor market hires and fires, and which pays the
      households — moved independently. Rule 3, found by making payroll common. One payroll now.
    - **A bank's wage payment settles like any other**, and because a bank pays on its OWN
      account the other leg is its equity, which is where a real bank's wage bill lands. The
      per-bank identity holds through it by construction.
    - **IND-R2: `FINANCIAL_SECTOR_PROXY_LINES` deleted.** A product line is what registers a
      supplier in stage 05's index, so the proxy line put 16 banks and 24 institutions into the
      enterprise-software market: shares summing to 646% against 400% for every other category,
      the real software firms diluted ~62%, and the supply invisible to the sellers' own P&L
      because a bank routes to `bankProfile`, which never accounts for producing anything.
      **GUARD's share-sum invariant, written three commits earlier for exactly this, went from 24
      violations in six weeks to zero** — the harness verifying its own finding's fix.
    - **What the verification found that was NOT mine.** Bank headcount collapses 88k → the
      one-employee floor by week 3 — **identical in an A/B against the pre-change tree**, so
      pre-existing. Non-bank employment falls with it (6.01M → 5.31M) at tightness 0.02-0.15, so
      it is layoffs, not quits: §6.1's seed-employment row, which now carries the measurement.
      **It gates the VALUE of IND-R1, not its correctness** — the banks pay their staff for two
      weeks and then have none.
    - **And one new finding, recorded as IND-R5, not fixed:** a bank's seed revenue is a Pareto
      draw (1.68B against 7.47B NIM-implied) and climbs toward its real scale for years, which
      every consumer reads as real output growth. §7.4's rule, and a ~4x week-0 move that wants
      measuring alongside the seed-employment slice.
    - **Six-week probe: 26 → 12 violations, five families.** The 60-week run is deferred.

109. **EMP — the labour collapse, traced end to end.** Unemployment runs USA 10.6% → 19.3% in
    five weeks from seed and never recovers; every "unemployment out of band" violation in the
    harness is this one thing. §6.1 had described it from the seed side ("three employment
    primitives disagree"); this is the mechanism, and the chain is short.
    - **The rule.** The labor market sheds staff when a firm's EBITDA falls below its
      cost-of-capital charge — `earningsShortfall / wagePerWorker` heads, at the layoff speed.
    - **The seed solves it in AGGREGATE.** `w = [Σebitda + Σpayroll − Σcharge] / Σpayroll` is the
      wage index at which the region's firms **together** exactly earn their cost of capital. It
      is internally consistent — stage 08 charges the deviation from index 1 and the arithmetic
      closes — but the constraint binds PER FIRM, so an aggregate placed exactly on the threshold
      leaves roughly half the distribution below it. **Measured: 92 of 629 USA firms trip in week
      1, carrying 1.52M of 6.01M jobs.**
    - **And the rule is ONE-SIDED.** A firm below the line sheds; a firm above it does not hire
      in compensation, because hiring comes only from revenue growth. A distribution centred on
      break-even therefore loses employment monotonically. **The seed's own comment states the
      symmetry it assumes — "Above it firms are shedding from week 1; below it they are hiring" —
      and only the first half exists in code.** That is the defect, and naming it is this
      record's point.
    - **Price adjusts slower than quantity.** The offered wage does respond (`marginShortfall`
      pulls it down) but as an annual rate applied weekly, against layoffs at the layoff speed.
      Measured: the pooled index does not fall at all early on (1.3173 → 1.3180) while employment
      falls 6.01M → 5.31M.
    - **Then it feeds itself.** Unemployment distresses the SME pools, their default probability
      rises, the banks' measured loan losses rise with it, bank EBITDA turns negative and the
      banks shed too.
    - **TWO CAUSES FIXED, both bank-specific, both rule 3.** `bankProfile` charged
      `random() * 0.05 * totalAssets` of loan losses — a random draw, on a denominator including
      sovereign bonds, which carry no credit loss, at a rate no bank survives. It reads the
      bank's OWN measured `loanLossProvisionRateAnnualPct` now, against the books that actually
      carry credit (IND-R4). And a bank's seed revenue was a Pareto draw from the small-firm
      curve — 1.68B against 7.47B of NIM-implied revenue — which the 85/15 blend then spent
      YEARS climbing toward, an artifact every consumer read as output growth. **A bank's opening
      revenue is what its opening balance sheet earns now** (IND-R5). Measured after: banks open
      at **7% payroll-to-revenue and $644k revenue per employee**, which is a real bank, and they
      survive to week 3 instead of week 2.
    - **Neither moved the non-bank trip count**, which is the driver. That half is a DESIGN
      DECISION, written up in §5-EMP with its two candidates, and deliberately not guessed:
      moving the seed index to buy headroom is tuning (§6.4 forbids it), and the honest fixes —
      affordability capping hiring, or the wage clearing the labour market at the seed — are
      different models with different blast radii.
    - **What this record is worth even unfinished:** the row it replaces said three primitives
      disagree and the fix was to derive one of them. That was true and insufficient. The binding
      defect is a one-sided constraint applied to a distribution the seed centres on its own
      threshold, and no amount of re-deriving the seed's revenue share removes it.

110. **EMP, second pass: two one-sided rules made symmetric — necessary, and not sufficient.**
    On the user's call, the fix taken was **(a) make the constraint two-sided** rather than
    re-solving the seed. It found a SECOND instance of the identical defect, which is the part
    worth keeping.
    - **The affordability rule now hires as well as sheds.** A firm above its cost-of-capital
      charge has headroom and staffs toward what its output needs — the level target this stage's
      header has always described (its own annualised output at its own baseline productivity),
      and money CONSTRAINS that hiring rather than driving it, so a very profitable firm does not
      hire without limit. **Measured: USA unemployment falls in week 1 for the first time in the
      model's life (10.6% → 9.7%).**
    - **THE SAME DEFECT, IN THE WAGE RULE.** `unfilledShare` runs [0, 1]: it can say a firm found
      hiring hard, never that it found it easy. And the going rate moves by
      `(avgOffer − 1) × speed + cola`, so with offers anchored at 1 it only ever tracked
      inflation. **Measured before the fix: at 33.6% unemployment with tightness at 0.000, the
      employment-weighted average offer was RISING (1.0000 → 1.0181) and the going rate had
      fallen 1.9% in twenty weeks — all of it composition.** LAB made the wage a price on the way
      UP and left it administered on the way DOWN. Rule 1, hiding in a `Math.max(0, ...)`.
    - **The mirror of "could not fill" is "could fill at will",** and this stage already measures
      it: tightness. At tightness 1 and above nothing changes; below it a firm that filled what it
      posted is paying more than it needs to, by the margin the market is slack. One coefficient
      used in both directions, no new parameter. **Measured after: the going rate falls 4.3% over
      twenty weeks against 1.9%, and offers fall from week 1 instead of rising.**
    - **And it is not enough. Unemployment still reaches 33.4% by week 20 (against 33.6%).**
      Said plainly so nobody re-runs this experiment: **price adjusts on an annual timescale and
      quantity on a weekly one.** That asymmetry is real — wages are sticky and layoffs are fast,
      which is what a recession IS — so no defensible wage speed outruns a world that opens with
      half its firms below the line. Raising the coefficient to close the gap would be tuning,
      which §6.4 forbids.
    - **This is the evidence for (b).** The two symmetries were necessary and both were genuine
      defects worth fixing on their own. What remains is the seed LEVEL: §5-EMP's option (b),
      solving the opening wage index against the engine's own rule so that seed unemployment is
      an outcome rather than an aggregate accounting identity. **Take that next.**

111. **EMP, third pass: the labour collapse is a PRODUCTION-STRUCTURE defect, and neither
    candidate fix was aimed at it.** Option (b) — re-solve the seed wage index — was approved and
    investigated. The investigation disproved it, which is the result.
    - **The aggregate solve is a mean applied to a skewed distribution.** The seed sets
      `w = [Σebitda + Σpayroll − Σcharge] / Σpayroll` = 1.280 (USA), but the employment-weighted
      MEDIAN firm breaks even at 1.22, and **89% of employment sits at firms below the aggregate
      index.** EBITDA is Pareto-distributed, so the sum is carried by a handful of giants while
      the workers sit well underneath. That is a real defect in the solve — and fixing it is not
      the answer either, because the level it would move to is set by something upstream.
    - **THE ROOT: revenue per worker is 1.13x value added per worker.** Measured USA:
      productivity $58.0k, revenue per employee $65.7k. For **Consumer (3.86M jobs) it is 0.92x
      and Industrials (1.71M) 0.93x — gross output BELOW value added, which is impossible by
      definition.** Payroll is therefore **61% of revenue** against a real ~30%, and a firm whose
      labour bill is nearly its whole cost structure sits on the cost-of-capital line by
      construction. That is why half the universe is below it however the wage index is solved.
    - **And the model is INTERNALLY CONSISTENT at that level, which is the finding.** Its own
      input recipes carry a mean intensity of **0.138** — `recipeInputs` is "what a producer
      consumes per dollar of output" — implying a gross-output multiplier of
      1/(1−0.138) = **1.16x**, which is the 1.13x measured. The seed's demand, its recipes and
      its revenue-per-worker all agree. **The only thing claiming 2.5x was a comment**, and it
      has been corrected in place to state the measurement instead (review shape 4: a comment
      asserting the opposite of a measurement).
    - **So the defect is that production has no DEPTH.** A real economy's intermediate share is
      ~50-60%; this one's is 14%. Firms barely buy from each other, so there is almost nothing
      between revenue and payroll. **Owner: CHAIN (multi-tier supply chains, §4) with IND3's cost
      shapes** — and the capital-intensity multiples follow the recipes, not the other way round.
    - **Explicitly NOT done, and why.** Rescaling the multiples to hit 2.5 while the recipes still
      say 1.16 would move the seed off the one thing it currently agrees with. Scaling the demand
      seed does nothing on its own — headcount is derived as `revenue / revPerEmployee`, so both
      sides move and the ratio is invariant. And deepening every recipe IS CHAIN, not a seed
      slice. **Neither §6.1's stated fix (derive the 0.35 demand share) nor §5-EMP's option (b)
      touches the binding primitive**; that row stood for the model's whole life pointing at the
      wrong one.
    - **What EMP keeps:** the two symmetries from §7.110, which were genuine defects on their own
      and improved week 1 measurably. What it hands over is a root cause with a number.

112. **IND5 — electricity, and the one non-storable good.** The model had no electricity: the one
    input every industry buys, missing from a registry whose recipes §7.111 had just measured at
    0.138 mean intensity against a real ~0.5. It is a registry entry now — produced by
    Energy-sector firms, with a recipe line in **every** industry at its own energy intensity
    (0.010 for luxury goods, 0.080 for materials and chemicals; a technological fact, not an
    equilibrium).
    - **Its physics do the work, not a table.** `IN_PLACE` says it is delivered where it is
      consumed, so it carries no freight and cannot cross a border — which is what a grid is —
      and `isStorable` reads exactly that mode. So electricity is **the model's one genuinely
      non-storable good** and must be produced the week it is used, without a line anywhere
      saying so. That is IND1's design paying off: state the physics, derive the behaviour.
    - **Linked to gas at the margin**, so an energy shock reaches every industry's cost base
      through a real input rather than a correlation.
    - **Mean recipe intensity 0.138 → 0.164**, multiplier 1.16x → 1.20x. A real dent in §7.111's
      root cause and nowhere near closing it — CHAIN still owns the rest.
    - **Verified:** 237 suppliers, USA supplier shares summing to exactly 100% (GUARD's own
      invariant, silent), $15.2B of electricity revenue by week 3, and no firm anywhere holding
      it in inventory. Six-week probe 13 → 12 violations.

113. **IND8 and IND9 — every firm of a size was the same firm, and one row was already closed.**
    - **IND9 was done and nobody had checked.** G2's `migrateSmeDebtAtSeed` recalibrated the
      `debtUSD = 2 × revenue` scalar to min(serviceable, capital-carriable) and deleted the
      remainder. **Measured: 2.7x EBITDA and 0.38x revenue in all four regions**, against the
      ~17.8x the row was opened for. Re-measuring before working is what the row itself asked
      for, and it saved the work entirely.
    - **IND8's real defect was not the distribution's SHAPE, it was that there wasn't one.**
      `buildTemplate` is deterministic in (sector, rank): leverage was a flat sector constant
      scaled by size, so **every firm of a given sector and size opened with an identical balance
      sheet** and the whole universe's credit quality was a projection of seven curves. 199
      listed USA non-financials at 98% investment grade, **zero BBB, zero high yield** — so the
      cohort 07b and 07d exist to price had no issuers and the credit market could not price
      risk. That is IND's headline ("every corporate is the same firm") showing up in the
      balance sheet.
    - **The fix uses the engine's own covenant rule rather than a new table.** A firm's leverage
      is where its own financing history left it; the model has no history, so the seed must
      draw it — what it must not do is draw the same number for everyone. It now draws a takeup
      share of each firm's own `COVENANT_LEVERAGE_CEILING` at its unlevered quality, and the
      rating is computed from the leverage that produces, by the same `determineCreditRating` the
      weekly stage uses. **BBB 0% → 14% of firms; p90 leverage 3.5x → 4.2x.**
    - **The ceiling is applied ONCE, not iterated to a fixed point** — in that table a weaker
      credit carries a LOOSER covenant (descriptively right: high-yield issuers do run higher
      leverage), so each downgrade would license more debt and the iteration runs away to CCC.
      Worth recording because the mistake is inviting.
    - **Seed high yield stays near zero, and that is correct.** The covenant rule is precisely
      what stops a firm ISSUING its way into high yield; HY arrives by DETERIORATION (the
      dynamics already deliver BBB 39% / HY 16% by week 40) and from HC's sponsor-owned tier,
      measured at p50 3.8x and p90 6.0x. Six-week probe 12 → 9 violations.

114. **IND2 — a subscription is not a unit, and the hidden tier proved §7.41 again.** How a
    cleared transaction becomes REVENUE is a property of what was sold, and every good in the
    model recognised it the same way: on delivery, with unsold production docking revenue.
    - **`SUBSCRIPTION` is now a registry mechanism.** The sale buys a CONTRACT, so it keeps
      paying until it churns: the seller carries a real `recurringRevenueBaseUSD` that decays at
      its own churn and is renewed by what actually cleared, and a week it could not ship does
      not cost it the contract. Eight sub-units are contracts. One primitive
      (`SUBSCRIPTION_WEEKLY_CHURN`) — a subscription is *defined* by ending unless renewed, and
      how fast is what separates an enterprise contract from a month-to-month one.
    - **Verified on the criterion this slice was written for:** over a quarter, a subscription
      seller's revenue moves **−1.2%** against a unit seller's **−6.5%**.
    - **§7.41's trap, caught by measuring instead of assuming.** The first implementation looked
      correct and the probe said **240 listed firms carried a base and 0 private ones** — the
      private path rebuilds each firm from a fixed field list, so the base was written and
      silently dropped every week. The hidden tier is ~1,200 firms and it was behaving as pure
      unit sellers. **1068 firms carry a base now.** This is the third time that fixed list has
      swallowed a new field (headcount and wage were the last); anything added to a company must
      be checked on BOTH paths.
    - **PROJECT and ROYALTY are deferred to IND10/IND11 on purpose.** Both need a backlog STOCK
      to live on, and IND11 builds it. Implementing a second backlog here to delete it there is
      the wasted motion the profiles' own header warns about. Six-week probe 9 → 8 violations.

115. **IND-R6 — the private tier is a second code path, and it has been quietly eating changes.**
    Asked directly by the user: why do private firms not build from the same modularity as public
    ones, if they are the same thing minus a listing tag? They should, and there is no modelling
    reason they do not.
    - **HC gave them no parallel TYPE and stage 08 gave them a parallel PATH.** An early return
      at ~161 hands private firms an abbreviated rebuild — revenue, EBITDA, D&A, net income,
      cash, rating, employment — and skips payroll, capex, inventory, inputs, cost drivers, the
      debt lifecycle and offerings. Only a handful of those are genuinely public-only.
    - **Measured cost.** Three fields silently dropped by its fixed field list (headcount, wage
      index, and §7.114's contracted base — 240 listed firms carried one, zero private).
      **1,712 firms employing 8.20M people, twice the listed tier, paying NO wages** — 67% of the
      USA's named wage bill never reaching a household, 3.12B/wk of it here, which is IND-R1's
      defect at 46x the size of the bank version that got fixed. And 2.91B/wk of cash moving by
      direct mutation outside the settlement layer.
    - **THE LESSON, and it is the one worth keeping: a forked path does not just duplicate code,
      it lets the SEMANTICS drift.** The public margin is GROSS (payroll charged on top); the
      private one is NET (payroll never charged). Same name, opposite meaning. Copying the public
      treatment across therefore double-counts — attempted the same day, it tipped 1,712 firms
      below their cost of capital, took unemployment to 42% by week 10 and the harness 8 → 196.
      **Reverted, and recorded, because the trap is invisible from the code.**
    - **So the fix is to delete the branch, not patch it**, and it runs WITH IND3 because
      reconciling the two margin definitions is exactly what IND3 does.

116. **The work order reconciled against what the week actually established — and one lesson the
    table itself taught.** A bookkeeping pass over §3, §4 and §6.1 after EMP and the IND slices,
    recorded because two of its findings are structural rather than clerical.
    - **A foundation item's root cause was sitting in the depth tier.** §4 item 1 (EMP) and the
      remaining half of item 2 (IND3, IND-R4, IND-R6) are all blocked on CHAIN's recipe depth
      (§7.111) — item 22. The table's rule is "never start an item whose prereqs aren't done",
      and it was silently violated for the two highest-priority rows because the prerequisite
      was only DISCOVERED by diagnosing them. **The tier a project belongs to is not knowable
      until its cause is;** an ordering built from symptoms will misplace anything whose cause
      lives elsewhere. Rows 1, 2 and 22 now say so out loud, and the reorder is left as an
      explicit question rather than taken — §4 may not be resequenced without asking.
    - **Two §6.1 rows had been fixed without being closed.** "Bank employees are paid by nobody"
      closed with IND-R1, and three of the four halves of "banks opt out of the corporate
      operating model" closed with IND-R1/R4/R5 — while both rows still read as open defects.
      The same measurement that closed the first one found the SAME defect one branch further
      down at 46x the size (the private tier's 8.20M unpaid workers, §7.115), which is the
      reason to close a row precisely rather than loosely: "banks pay no wages" was true, and
      fixing it fixed 6% of a wage-bill gap whose other 67% was never in the row at all.
    - **§3's "still formula-driven" list was describing a bank that no longer exists.** Payroll,
      capex, inputs, loan losses and seed revenue are all real for banks now; what is left is one
      stated margin. The private tier took its place on that list, which is the honest shape of
      the model today.

117. **CHAIN-D — the recipes were shallow because of their GRANULARITY; and deepening them proved
    §7.111 had the causality backwards.** Two findings, and the second matters more than the work.
    - **A bill of materials is a property of a PRODUCT, and it was stated per INDUSTRY.** At
      industry granularity a real BOM is unwriteable: the only honest statement about crude
      extraction, refining and power generation at the same time is what they have in COMMON, so
      all sixteen recipes had collapsed to the same overhead line — professional services 0.05,
      facilities 0.04, repair 0.02, **identical in 13 of 16** — with almost no materials in them.
      Refining bought no crude, a fab no process chemicals, construction no steel or cement,
      retail none of the goods it sells. `recipeInputs` now sits on `SubUnitSpec` beside the other
      two IND dials, all 37 products carry a real BOM, and **mean intensity 0.164 → 0.412 with
      dispersion for the first time**: refining 0.70 and industrial chemicals 0.61 against
      enterprise software 0.19 and professional services 0.18. Each coefficient is a technological
      primitive; the aggregate is an outcome and none was chosen to hit it.
    - **Stage 04's demander is a sub-unit too now**, which deletes an approximation it was forced
      into: one industry-wide cost pressure and fulfilment ratio fanned onto every product of the
      industry whether or not it needed the scarce input. And two load-time assertions: a recipe
      may not name its own product (a self-loop puts a firm on both sides of its own auction —
      **unavoidable at industry granularity**, since refining consumes crude and both are Energy,
      which is a second reason the recipes had to stay shallow), nor an input that does not exist.
    - **Measured, 10 weeks SHOCKS=0, same seed: harness 18 → 15, five families → two.** Three
      runaway-revenue firms gone, nothing added. **Deflation falls every week** (w1 −0.79 → −0.06,
      w9 −13.37 → −12.03): firms buying from each other is a demand floor under producer goods
      that simply was not there.
    - **AND THE RATIO §7.111 OWNS DID NOT MOVE: 0.878 → 0.879.** A 2.5x deepening of every recipe
      in the model changed the gross-output-to-value-added ratio by one part in a thousand. That
      is not a small effect, it is NO effect, and it falsifies the attribution rather than the fix.
    - **THE REAL ROOT, and it is in the demand seed, not the recipes.**
      `macro/initialization.ts:106-108` seeds every sub-unit's demand from
      `C = household income x 0.94`, `G = GDP x 0.35`, **`I = GDP x 0.15`** — and `buyerMix`
      merely distributes those three pots across sub-units. That is C + I + G: a **FINAL-DEMAND
      identity**. Corporate demand in this model is INVESTMENT ONLY. **There is no intermediate
      demand in the seed at all**, so gross output is pinned to final demand and the ratio is ~1
      BY CONSTRUCTION, whatever any recipe says. The recipes only decide who bids inside an
      envelope already fixed without them.
    - **So §7.111's consistency was real and its causality was inverted.** It found recipes,
      demand and revenue-per-worker all agreeing at 1.16x and concluded the recipes were binding.
      They were not: the demand seed pins the ratio, and the recipes were shallow enough to agree
      with it. **Read §7.111 with this attached** — its measurements stand, its owner assignment
      does not. Rule 10 in its sharpest form: the number that moves when you fix a thing is the
      test of whether you had found the thing.
    - **What this leaves EMP:** the unblocking slice is CHAIN-E, and it is a SEED slice after all.
      §7.111 ruled that out — "scaling the demand seed does nothing on its own, headcount is
      derived as revenue/revPerEmployee so both sides move and the ratio is invariant" — which is
      true of SCALING and false of COMPOSITION. Intermediate demand is a component that exists in
      gross output and not in value added; adding it is exactly what moves a ratio scaling cannot.
    - **One more defect found on the way, not fixed, owner IND3:** `realInputConsumptionCostUSD`
      in stage 08 is the real dollar cost of the real lots a firm consumed, computed from real
      prices — **and it reaches only the display COGS breakdown.** EBITDA is
      `revenue x newEbitdaMargin − payrollAboveBaseline`, a walked stated margin nudged by
      `inputPriceDrag * 0.03`, an INDEX. Two representations of one cost (rule 3), the measured
      one unused beside the formula — §7.100's FRM shape exactly. **It is why deepening the
      recipes was safe:** input cost does not reach the P&L, so nothing could collapse. It is also
      why depth is currently visible on the demand side only.

118. **CHAIN-E — intermediate demand exists, headcount is value added over productivity, and
    EMP's ten-week symptom went with it.** Two halves of one accounting truth; either alone breaks
    employment.
    - **Demand.** `C + I + G` is a FINAL-demand identity, so a product's demand carried no room for
      what other producers consume of it. Now final demand PLUS the intermediate half, solved from
      the registry's own BOM as `X = F + AX`; column sums are each product's intensity, all well
      under one, so convergence is ASSERTED. Applied in BOTH places that build the identity — two
      copies of an identity is how it drifts (rule 3).
    - **Headcount.** `regionProductivityPerCapita` is value added per worker; `annualRevenue` is
      GROSS output. Dividing one by the other needs the ratio between them, which is exactly
      `1/(1 − a)` for what the firm makes. That derives the seven stated `revPerEmployeeMultiple`
      entries **whose own comment said the multiples "follow the recipes" while nothing derived
      them.**
    - **Measured: harness 18 → 2 violations; every unemployment violation gone.** Seed
      unemployment 10.5/25.7/17.9/23.5% → **7.5/6.5/3.8/7.8%**. §7.111's criterion met: Consumer
      0.92x → 1.42x and Industrials 0.93x → 1.30x, the two ratios that were below one and
      therefore impossible.
    - **Why the fix was not tautological, which is worth checking:** had productivity been defined
      as GDP-over-employment, `employment = valueAdded / productivity` would be an identity and the
      result meaningless. It is an independent Zipf primitive, so three unrelated derivations now
      land in the same place.
    - **AND EMP DOES NOT CLOSE.** Over 60 weeks unemployment still escapes to ~40% and inflation to
      −36% by week 37. A/B against the pre-CHAIN tree at the same seed: the escape is PRE-EXISTING
      and CHAIN-E is better or equal at every checkpoint (wk 7: 18.7/33.7/28.3/31.4 → 13.4/15.3/
      12.2/14.5; wk 43: 39.1/48.8/48.7/50.4 → 40.0/33.3/43.3/41.0). The two trees converge as both
      drown in the same deflation. **Do not read the ten-week figure as EMP closing.**
    - **Process note: do not swap the tree under a running probe.** Two 60-week runs were killed by
      `git checkout` on `src/` mid-flight.
    - **The lesson, one order deeper than §7.117's:** §7.111 found recipes, demand and
      revenue-per-worker all consistent at 1.16x and read that as confirmation. They were
      consistent because two were STATED to match the third. **Consistency between numbers you
      chose is not a measurement.** What broke the tie was deriving one from something none of the
      three could see.

119. **One headcount rule for all three tiers — and what it exposed: the firm universe's value
    added is 53% of GDP.** IND-R6's argument, proven with numbers, and then a seed defect that
    three separate overstatements had been hiding.
    - **The rule was stated in FOUR places and they disagreed.** Named public: `revenue /
      (productivity x a stated per-sector multiple)`, fixed by CHAIN-E (§7.118). Named private
      (`bootstrap/private-firms.ts`): `revenue / productivity` — revenue treated AS value added,
      the exact defect §7.111 named, still live because **there are two firm generators and the
      fix landed in one of them**. SME pools: `totalEmployed x SME_TIER_EMPLOYMENT_SHARE`, an
      imposed share (rule 13) — **which a second derivation in `simulation/initialization.ts`
      then silently overwrote** with `revenue / (named revenue-per-worker x (1 −
      SME_PRODUCTIVITY_DISCOUNT))`. Now one exported function, `smePoolEmployment`, and one rule:
      **value added over output per worker**. Both stated shares deleted; the SME productivity
      gap becomes an outcome of the pools' own P&L, as §5-SEG always said it should.
    - **What the private tier's overstatement was costing, measured at seed.** Payroll **61.3% of
      revenue against the public tier's 35.5%**, both carrying the same ~22% stated margin — so
      revenue − payroll − inputs left it **1.5%** before any other opex, against a stated 22.9%.
      Its headcount and its margin were mutually impossible. **That, and not a double-count, is
      why §7.115's attempt to charge the private tier real wages tipped 1,712 firms below cost of
      capital.** After: private payroll 42.2% and real-cost EBITDA 20.6% against 22.9%; public
      39.3% and 30.5% against 20.8%. The two tiers share one definition, which is what the rest
      of IND-R6 needs.
    - **AND THE THING UNDERNEATH, now quantified for the first time.** With all three tiers
      honest, USA at seed: total output **X = 567.4B**, intermediate 226.9B (40.0%), so the firm
      sector's value added is **F = 340.5B against GDP 639.2B — 53%**. Firm employment can
      therefore only be `340.5B / 58.0k = 5.87M` against the **11.55M** the seed says are
      employed. **The firm universe cannot employ the seeded labour force at the seeded
      productivity, and never could** — each tier's overstatement was covering part of the gap,
      which is why removing them one at a time walked the harness 2 → 33 → 42 violations and seed
      unemployment 7.5% → 28.5% → 36%.
    - **The harness is deliberately red on this, per rule 12 and §6's first row.** The violations
      are one story: unemployment out of band in all four regions. Nothing else moved.
    - **This is §6.1's seed-employment row, and it is now a measurement rather than a
      description.** Its own instruction stands and is now unavoidable: do not fix it by
      restoring a residual, widening the band, or normalising the multiples — the honest fix is
      to make the firm universe's scale agree with the labour force it is supposed to employ.
      **What is newly known is WHERE the disagreement is:** the demand actually seeded into
      `categoryDemand` is roughly half of the `C + I + G` the seed computes from GDP and
      household income (household income alone is 91% of GDP, C is 0.94 of that), so the demand
      the firm universe is sized against and the GDP the labour force is sized against are two
      different numbers. **One of them has to be derived from the other.** Owner: the seed-scale
      slice, unstarted.
    - **The lesson, which is §7.117's and §7.118's a third time:** three tiers "agreeing" on
      employment meant nothing, because each was stated separately and each was wrong in the
      direction that hid the same gap. **Consistency you did not derive is not evidence.** The
      only way this became visible was deriving all three from one thing none of them could see.

120. **The seed-scale slice — the identity lived in THREE places and the one that wins had no
    solve; and the tiers never partitioned demand.** Two defects, both rule 3, both invisible
    because the duplication hid them.
    - **Three copies of `C + I + G`.** `macro/initialization.ts` (placeholders from GDP shares),
      `simulation/initialization.ts` (the authoritative one — it runs after firms and the
      government exist, so its G is the real procurement budget and its I the firms' real capex,
      and it OVERWRITES the first), and `03-category-demand.ts` (weekly). CHAIN-E's
      intermediate-demand solve was added to the first and third and **missed the second — the
      only one that survives.** So the model ran on final demand alone regardless: measured, the
      placeholder seed produced **1,481B** of USA total output and the authoritative one replaced
      it with **567B**, sizing every firm against a market 2.6x larger than the one it then sold
      into. **The fix had to be made three times, and that is itself the defect.**
    - **The tiers each took a share; nothing made them add up.** The named tier's cut was a flat
      `0.35`, the SME segment took its industry's `smeShareOfActivity`, and the private tier
      carved out of that — three independent claims on one pot. Measured: named firms **93%** of
      total output and the pools another **36%**, 129% between them. The registry already states
      the one structural split, so the named tier's share is now its exact complement
      (`1 - smeShareOfActivity`) and the three partition output by construction.
    - **Measured, USA at seed:** firm-sector value added against GDP **0.533 → 0.888**; implied
      firm employment **5.87M → 9.78M** against 11.55M employed, the remaining 1.77M being
      government (1.65M) and financials — which is what it should be. Tier claims 129% → 95%.
      Seed employment 7.72M → 9.64M. **Harness 42 → 30, seed unemployment 36% → 20.3%**
      (UK 10.6%).
    - **NOT CLOSED, and honestly.** Unemployment still climbs to ~40% by week 5 before settling
      near 32%, so the seed is much closer but the dynamics are not fixed — and the deflation
      escape (§6.1 G1b) is still there and still owns the horizon (§7.118).
    - **One new family, introduced by this slice and not yet diagnosed:** sovereign bonds over-held
      in three regions ("a ledger is minting claims"). GDP moved 639.2B → 695.7B with the scale
      change and sovereign outstanding is `debtToGdpPctBottomUp x derivedNominalGdpUSD`, computed
      at a different point in the seed than the holdings are built — an ordering suspect, not a
      diagnosis. **Owner: this slice's follow-up; it is a real defect and it is mine.**
    - **The lesson, and it is the fourth time in four records:** §7.117, §7.118 and §7.119 each
      ended with "consistency you did not derive is not evidence." This one is the structural
      cause of all three — **the same identity written three times will diverge, and the copy you
      did not know about is the one that decides.** Every number those records chased was a
      symptom of one pot being claimed by parties that never had to add up to it.

121. **IND3, CAP0 and IND-R6 — the margin became an outcome, the clamp went, and the second code
    path is deleted.** The three slices are one commit because they are one change: you cannot
    delete the fork while the two sides disagree about what a margin means, and you cannot make a
    margin an outcome while a clamp holds it inside a band.
    - **IND3 — EBITDA is revenue less what the firm actually spent.** It was
      `revenue x newEbitdaMargin − payrollAboveBaseline`, where the margin walked 96/4 toward a
      target nudged by four coefficients, and the REAL dollar cost of the lots the firm consumed
      reached only the display COGS breakdown while an INDEX (`inputPriceDrag * 0.03`) stood in
      for it in the P&L — two representations of one cost with the measured one unused (rule 3).
      Now: real input lots at the prices paid, the real wage bill at the real headcount, and an
      other-opex rate DERIVED from the firm's own opening books (whatever is left after its
      baseline margin, inputs and payroll — §7.4). Opening EBITDA is therefore unchanged at week
      0 and every later move is a real cost moving. **Payroll enters in full**, not as a deviation:
      a deviation was only needed because the margin it adjusted already contained a wage bill.
    - **CAP0 — the `[2%, 65%]` clamp is gone**, with the `[4%, 65%]` target clamp. It was rule 2's
      oldest open violation and the reason no firm could report a loss at the EBITDA line, which
      is what blocked CAP's whole mechanism. Nothing replaced it: a margin that is the residual of
      real costs does not need a band.
    - **IND-R6 — the listing branch is DELETED, 107 lines.** Not patched: an earlier attempt this
      session to give the private path equivalent-but-parallel economics was the same mistake in a
      new form, and is recorded here because the pull toward it is strong. Every firm runs one
      operating model; the genuinely public-only behaviour is guarded where it happens — sell-side
      consensus and the earnings surprise (a private firm publishes none of it) and buybacks
      (retiring shares needs a market to retire them into). **All three debt-offering paths stay
      common: refinancing, the maintenance bridge and opportunistic issuance are things a private
      firm does too**, which is exactly the distinction the fork could not make.
    - **Measured, 10 weeks SHOCKS=0: harness 30 → 20 violations, and EVERY UNEMPLOYMENT VIOLATION
      IS GONE** — 20.3% → 30.0% over the ten weeks, inside the band in all four regions in every
      week, for the first time in this sequence of slices.
    - **The 20 that remain are ONE family and they are not IND's:** sovereign bonds over-held in
      all four regions, the defect §7.120 introduced and owns. It grows week over week (5 weeks
      per region), so it is a FLOW not a seed sizing — the books accumulate sovereign paper faster
      than issuance creates it, which points at 07c's float rather than the debt seed. **Next
      item, and it is a debt owed, not a discovery.**
    - **Still open in IND, unstarted:** IND-R3 (per-good consumption intensity), IND4, IND6, IND7,
      IND10-19, and IND-R4's two financial ratios (`INSURER_EXPENSE_RATIO`,
      `CARD_OPERATING_COST_BPS`) — the profiles' own stated cost shapes, which IND3 makes
      derivable but did not derive. IND does not close here.

122. **What it takes to bring financial firms into the same build, and where the funds actually
    sit.** *(User questions, 2026-08-29.)* Recorded because both answers are structural and the
    second found a defect.
    - **The dispatch is right; the CONTRACT is what still lets financials out.** `profileKeyOf`
      keys the kind once and `PROFILE_REGISTRY` calls the module (rule 17, BP1c). But
      `ProfilePnl` returns `newRevenue`, `newEbitdaMargin`, `newEbitda`, `newEbit`,
      `newNetIncome`, `newEps` — **a profile is permitted to state a margin**, which is why a
      bank's is still `0.40` while the operating path builds EBITDA up from real costs (§7.121).
      **Invert it:** a profile returns its revenue mechanism and its own extra COST LINES — a
      bank's loan losses and funding cost, an insurer's claims and reserve movement, a manager's
      fee-related opex — and shared code does
      `EBITDA = revenue − inputs − payroll − otherOpex − profileCosts`. One change, and
      IND-R4's `INSURER_EXPENSE_RATIO` and `CARD_OPERATING_COST_BPS` die with it rather than
      being deleted one at a time.
    - **The steps, in order:** (1) extract OPERATING into a profile module — `profiles/types.ts`
      says it stays inline "until IND2/IND3 decompose it", and both are now done, so stage 08
      should hold no P&L at all; (2) widen `ProfileInput` from payroll to the other common cost
      primitives (real input cost, capex), which that file already commits to; (3) invert
      `ProfilePnl` as above; (4) give financials an input basket; (5) extend past the P&L to the
      asset side (capex, PP&E, depreciation); (6) ~~resolve the `Company` / `InstitutionalEntity`
      duality~~ — **WRONG AS WRITTEN; see §7.123.** A fund is not a firm and must not be pushed
      through the operating model. Steps 1-5 finish the FIRM side, which is where IND ends.
    - **Step 4 is a blocker CHAIN-D created, and it is worth naming.** A recipe is now a property
      of a PRODUCT (§7.117), and IND-R2 correctly gave financial firms no product line — a bank
      does not SELL enterprise software. But those are the same field, so a firm that sells
      nothing now BUYS nothing: a bank purchases none of the professional services, facilities or
      software it obviously does. The input basket has to become derivable for a firm defined by
      its PROFILE rather than by its output — the profile declaring its own opex intensities,
      registry-shaped, exactly as a product declares its BOM.
    - **Where the ETF and the MMF sit: their own balance sheets.** Both are `InstitutionalEntity`
      with their own `entityType`, not wrappers on a sponsor's book. An ETF's assets are real
      `itemizedHoldings` — it bids in every clearing book like any other holder — and its
      liability is `etf.sharesOutstanding`, moved only by creations and redemptions; the sponsor
      is a separate asset manager that collects the expense ratio, so the FEE leaves while the
      assets stay. An MMF's assets are its cash plus what it buys in 02b's money-market session.
    - **And the asymmetry, which is a defect (now a §6.1 row).** The ETF's shares are held BY
      NAME — households carry `hs.etfShares = [{fundId, shares}]`. The MMF's liability is
      `mmfSharesOutstandingUSD`, **one scalar incremented when household savings divert and when
      corporates sweep, with nobody named on the other side.** Real assets, aggregate
      shareholders: rule 13's residual-with-no-holder, and rule 14 — the diversion debits a real
      deposit and credits a number.

123. **CORRECTION to §7.122's step 6 — a fund is not a firm, and "one build" needs TWO shapes.**
    *(User, 2026-08-29, immediately: "but then ETFs and MMFs will be corporates? doesn't make
    sense, they are funds managed by an AM.")* Correct, and §7.122 was written the same day it is
    corrected, which is why it is worth recording rather than quietly editing.
    - **What step 6 got wrong.** It read §6.1's "the institutional Company and the
      InstitutionalEntity are two firms" as an argument for one entity type. That row is
      NARROWER: an insurer existed as both a `Company` shell and an `InstitutionalEntity` — the
      same real thing represented twice (§7.51 closed that half). Generalising it to funds turns
      a duplication defect into a category error.
    - **The axis is FIRM vs FUND, not `Company` vs `InstitutionalEntity`.** A firm has staff,
      produces or intermediates, earns revenue and pays wages — operating corporates, banks,
      insurers, asset managers — and those belong in the one operating model IND-R6 built. **A
      fund has no staff and no production:** it is a pool of assets whose liability is units, run
      by a firm for a fee. Pushing an ETF through the operating model would invent exactly the
      kind of ad hoc branch IND-R6 just deleted.
    - **`InstitutionalEntityType` mixes the two axes, and the fund side is where the ad hoc
      categories actually are.** INSURER and ASSET_MANAGER are FIRMS. ETF, MONEY_MARKET_FUND and
      PRIVATE_EQUITY are FUNDS. **HEDGE_FUND and PENSION_FUND are a manager and a vehicle in one
      entity** — the same mistake as the listing fork in different clothes: a manager is a firm, a
      fund is a pool, and one object being both means neither is modelled.
    - **Five different ways of saying who owns a pool**, across seven types: ETF —
      `sharesOutstanding` + `sponsorEntityId`, with households holding by NAME (`hs.etfShares`),
      the only complete one; MMF — `mmfSharesOutstandingUSD`, a scalar, **and no manager link at
      all**; PE — `peFund.lpCommitments[]`, named LPs but the entity IS its own sponsor; PENSION —
      `beneficiaryLiabilityUSD`, a scalar derived from households; HEDGE_FUND — no unitholder
      representation whatever. §6.1's MMF row is a symptom of this, not the disease.
    - **So the target is TWO shapes, not one.** Every firm → the one operating model. Every fund →
      one fund shape: assets are itemized holdings, liability is units held by NAMED holders, a
      named manager charging a fee, and a mandate that drives its bidding. **The ETF is already
      that shape and is the template**; nothing else is. Owner: unassigned, and it is not IND's —
      IND finishes at firms.
    - **The lesson:** "one representation" is a rule about not modelling ONE thing twice (rule 3),
      never about modelling two different things the same way. §7.122 reached for the first and
      landed on the second, in a document whose whole recent record is about forks that drift —
      which is exactly when the pull to unify everything is strongest.

124. **The sovereign float counted paper nobody was selling — the debt §7.120 owed, paid.** The
    check that caught it is the one that exists for exactly this: real books together claiming
    more than the instrument's outstanding.
    - **OWN7's rule had two carve-outs and needed three.** The float subtracted the central bank
      on a week it places no order, and corporate treasuries which never bid. It did not subtract
      **the share no real book holds at all** — measured at seed, the model's books hold ~80% of
      every region's sovereign stock and the other ~20% sits with households, foreign official and
      retail, holders this model does not name yet. They are the purest case of "a holder that
      does not bid keeps its position", and every dollar of it was offered to the bidders. So they
      bought paper from nobody, and with no passive book to decrement the total held climbed past
      what exists: **80% at seed → 101% by week 3**, institutions +87B and banks +64B against
      +28B of actual new issuance.
    - **The residual is computed, not stated:** outstanding less what every real holder actually
      has, per bucket. The float is then exactly "what the participants in this book hold between
      them", which is what OWN7's rule says and what the other two carve-outs already do.
    - **One trap on the way, worth the line:** an institution holds this book's paper under the
      BUCKET instrument id and a corporate treasury under a TRANCHE id — two id spaces for one
      instrument. Reading the wrong one counted the whole institutional book as passive, the float
      collapsed, and every real holder was forced out into the dealer (institutions 201B → 0,
      dealer 0 → 99B). **Measured after the fix: 80% → 85% → 80% over six weeks, never above
      outstanding.**

125. **IND FINISHES AT FIRMS — the profile contract is inverted, financials buy what they consume,
    and the harness is GREEN.** *(§7.122 steps 3 and 4; steps 1-2 are refactors and remain.)*
    - **A profile may no longer state a margin.** `ProfilePnl` returned `newEbitdaMargin` and
      `newEbitda`, and three of the four did state one — bank 0.40, asset manager 0.35, insurer
      0.15 — while the operating path built EBITDA up from real costs (§7.121). **What a margin
      MEANT depended on which arm of the dispatch a firm went down**, which is §7.115's drift one
      level up from the code path that caused it. A profile now returns only how it EARNS and the
      costs no other kind of firm has (a bank's credit losses, an insurer's claims, a carrier's
      fuel); **EBITDA is computed in exactly one place for every kind of firm.**
    - **A firm that sells no product still BUYS.** A recipe is a property of a product (§7.117)
      and IND-R2 correctly gave financials no product line — but those are the same field, so a
      bank bought none of the premises, software or professional services it obviously consumes,
      and its operating cost had nowhere to come from except the stated margin. `PROFILE_INPUT_BASKET`
      gives a profile its own input intensities against revenue — the same primitive as a BOM —
      and **one accessor, `firmInputIntensities`, serves stage 05's bidding, stage 08's cost and
      the supply-relationship graph**, so a firm cannot be charged for an input it never bid for
      (rule 14). Financials are real buyers in the goods auction now.
    - **`INSURER_EXPENSE_RATIO = 0.20` is deleted** — every insurer's operating cost as a flat
      share of premiums, so none could be run better than another, and double-counting besides:
      the expenses it stood for ARE the staff and premises the caller now charges for real.
    - **Measured, 10 weeks SHOCKS=0: HARNESS PASSED, 0 violations.** The first green run in this
      sequence, from 18 → 15 → 2 → 33 → 42 → 30 → 20 → **0**. Every number in that walk was a
      real defect surfacing as the thing above it was fixed.
    - **What this does NOT fix, and it is item 1's:** unemployment still drifts to ~30% by week 10
      and inflation to −15%. The harness passes because those are inside its bands at ten weeks;
      at horizon they are not, and that is the deflation spiral (§7.118).
    - **Still open in IND:** §7.122 steps 1-2 (extract OPERATING into a profile module, widen
      `ProfileInput`) — pure refactors now that the contract is right; `CARD_OPERATING_COST_BPS`,
      which is a loan-PRICING input rather than a P&L cost and wants deriving from the bank's own
      measured cost base; and IND-R3, IND4, IND6, IND7, IND10-19.

126. **The money fund's ledger — two missing legs, and a row I logged without measuring.**
    - **My §6.1 row was wrong in its framing.** It said an MMF's shares have no named holders.
      They do: each corporate treasury carries `comp.mmfSharesUSD` and the household sector
      `hs.mmfSharesUSD`. Only the fund-side total is a scalar, which is what a share register
      looks like when every holder keeps its own book. **I wrote the row from the SHAPE of the
      code without measuring it** — and the shape was fine while two flows were not.
    - **Leg one: the fund issued shares to nobody.** `distributeMoneyFundIncome` pays the yield
      the way a stable-NAV fund does, by growing `mmfSharesOutstandingUSD` — and credited no
      holder, so the fund's liability rose every week while every holder's asset stood still.
      Rule 14. The module's own note says it closed an assets-versus-shares divergence; it closed
      it on the fund's side and opened the same hole on the holders'. New shares now go pro rata
      to the real holders that own the fund.
    - **Leg two: §7.41's trap, for the THIRD time.** `evolution.ts` rebuilds `householdState`
      from a fixed field list, and `mmfSharesUSD` was not in it — so the household's claim was
      destroyed every week and recreated from that week's diversion alone, while the fund kept
      the cumulative total. The first two occurrences were `offeredWageIndex` and
      `recurringRevenueBaseUSD` on the private-firm rebuild (§7.41, §7.114). **A rebuild that
      enumerates its fields will keep doing this**, and it is now three for three.
    - **Measured: 41.39B outstanding against 40.34B held at week 6, growing ~0.25B a week →
      the ledger closes to 0.00 in every week.**
    - **What is still open on the fund side, and it is NOT this:** `HEDGE_FUND` and
      `PENSION_FUND` are a manager and a vehicle in one object (§7.123). A manager is a firm with
      staff that earns a fee; a fund is a pool with units. One entity being both means neither is
      modelled — the same defect as a second code path, in the type system. Splitting them is its
      own slice: it creates real management companies, gives each fund a named manager and a fee
      that reaches that firm's P&L, and gives the vehicle a unit register. **The ETF is already
      that shape and is the template.** Unassigned; not IND's.

127. **G1b diagnosed: it is not a deflation, it is a SUPPLY FAMINE in the intermediate goods
    CHAIN-D created demand for.** *(MAC part (a), item 1.)* Two findings — one fixed, one logged
    with its owner.
    - **FIXED: the seed priced total output against a final-buyer volume.** `deriveSubUnitUnitPrice`
      divides demand by `population x 0.02 + firmCount x 1.5` — a proxy for FINAL buyers. CHAIN-E
      made `demandLevelUSD` the total output X, so every dollar of intermediate demand became
      PRICE instead of quantity, worst for the most intermediate-heavy goods. The consistent
      answer is `price = F / finalVolume`, with intermediate quantity following as `(X − F)/price`
      — the algebra closes exactly. Now passed final demand at both seed sites. Measured: the
      dispersion narrows (defense systems 14x → 5x over twenty weeks), and the harness stays
      green.
    - **AND THE REAL ONE: an 8x shortage printing a FALLING price.** Measured USA, week 12:
      `upstream_extraction` supply **2,458 units against demand 20,954**, inventory **0**, stage
      04 fulfilment **0.00** — and its price down **92%** from seed. `refined_products` the same:
      35,864 against 76,346. This is not excess supply and never was; **reading the falling price
      as deflation is what made it look like one for the model's whole life.**
    - **The chain, end to end.** CHAIN-D gave every product a real bill of materials, so
      intermediate demand for extraction, refining, chemicals and power is now several times what
      it was. **The SUPPLY of those goods was never scaled to match:** stage 04 sizes an input
      category's real weekly production from its LINKED COMMODITIES' `weeklySupplyUnits`, which
      are seeded against the old shallow recipes. So the input market drains to zero inventory,
      `physicalFulfillment` collapses in stage 08, firms cannot make what they sold, revenue
      falls, and the price level follows it down. **Unemployment tracks it because a firm that
      cannot produce cannot pay staff** — which is why the two moved together and monotonically
      (§7.118) and why no coefficient in the labour market or the price index could have fixed it.
    - **Owner: NAT with CHAIN.** A commodity's weekly supply is currently a seeded quantity; NAT's
      slice makes it an outcome of extraction cost and ore grade, which is exactly the mechanism
      that would let it respond to a demand that tripled. CHAIN owns the demand side that
      tripled. **This is now the binding item for MAC(a), EMP and the whole horizon**, and it is
      not a clamp, an expectation or a policy rule — the three things §5-MAC is otherwise about.
    - **The lesson, and it is §7.117's again:** the number that moves when you fix a thing is the
      test of whether you found the thing. Deflation was the SYMPTOM measured for a year; the
      cause is a physical shortage two stages upstream, and it only became visible once the
      recipes were deep enough to make the shortage bite.

128. **The commodity market had two different bases for its two sides.** §7.127's supply famine,
    one layer down and partly fixed.
    - **Demand** for a commodity was `intensityShare x the whole category's output, summed over
      four regions`. **Supply** was `the entire annual revenue of the two firms tagged with that
      `producedCommodityId``. Two bases for one market (rule 3) — invisible while recipes were
      shallow, and structural once CHAIN-D tripled intermediate demand: demand moved with the
      category, supply stayed with two firms.
    - **What the linkage actually says** is that a commodity is a SHARE OF A SUB-UNIT'S VALUE. So
      both sides are now that share of the same sub-unit: its real cleared supply and its demand.
      Whoever makes the good brings the commodity to market, not only the firms carrying the tag,
      which now serve as the week-1 fallback before the market has ever cleared. Rule 9 held
      carefully here — `totalUnitsSuppliedThisWeek` is weekly and `demandLevelUSD` annual.
    - **Measured: upstream extraction's weekly supply 2,458 → 9,853 units** at week 12, and its
      price collapse eases from **0.01x to 0.10x** of seed over twenty weeks. Harness stays green.
    - **NOT CLOSED, and this is the honest remainder.** The input market still drains: upstream
      extraction and refined products run inventory 0 and stage-04 fulfilment 0.00 from about
      week 8, with demand still ~1.6x supply, and inflation still reaches −11.9% by week 10. **The
      chain is now diagnosed end to end and two of its links are fixed; the third is that physical
      capacity does not grow toward a market that is permanently short.** `weeklyCapacityUnits`
      grows only with delivered net investment, which cannot answer a shortage of this size.
      **Owner: CAP (item 2) for the capacity decision, NAT for extraction as an outcome of cost
      and ore grade.** MAC(a) is blocked behind them; it was never about expectations or policy.

129. **CAP — investment responds to a measured shortfall, and it costs something.** The third link
    of §7.127's chain, added; not a closure.
    - **The capex decision had no term for "I cannot fill my orders."** Every input to
      `targetGrowthCapex` was FINANCIAL — cost of debt, cash health, Tobin's Q, payout pressure —
      so a firm that stocked out every week invested exactly like one sitting on a full warehouse,
      and a market in permanent shortage had no mechanism that could ever supply it. That is why
      §7.127's famine survived both of its other fixes.
    - **The signal is the firm's own measured shortfall** — demand the auction could not fill in
      the categories it actually sells into, weighted by line — not a regime label or a confidence
      index. `CAPACITY_CATCHUP_SHARE_ANNUAL` is the share of that gap a firm closes in a year, a
      behavioural primitive of the same kind as `WEEKLY_ISSUANCE_TAKEUP_RATE`; what it can fund is
      bounded by the cash and rate terms already there, so it needs no cap (rule 2).
    - **Measured: harness stays green, and the deflation gets WORSE — −11.9% → −16.3% at week
      10.** Recorded rather than reverted, because the mechanism is real and its absence was the
      defect; but it is a genuine cost and the next slice owns it. **The likely reason is that
      CAP's other half is missing:** capacity that arrives on a lag adds supply into a market
      whose price is already falling, and a firm that cannot cover unit cost still THROTTLES
      rather than STOPS (§5-CAP's own mechanism, still unbuilt). An investment response without a
      production-stopping rule is half a control loop.
    - **So MAC(a) remains open with all three links now understood:** the demand side (CHAIN-D,
      done), the two bases of the commodity market (§7.128, done), the price-versus-volume
      confusion in the seed (§7.127, done), and the capacity response (here, done but
      destabilising without CAP's production decision). **The remaining work is CAP's, not MAC's.**

130. **RULE 15, FOURTH TIME: a seller's reservation price was a fraction of the market price.**
    `minPriceUSD` was `referencePriceUSD x costRate x (1 + premium)` — the floor below which a
    firm will not sell, defined as a share of the CURRENT market price. So when the price fell
    every seller's floor fell with it, which lowered the clearing price, which lowered next week's
    reference: **a downward ratchet with nothing real underneath it, and the reason a market with
    8x excess demand could still print a falling price** (§7.127). No shortage can stop a fall
    when no seller is ever unwilling.
    - **A cost is a dollar figure.** IND3 made wages, input lots and opex real (§7.121), so the
      floor is now what it actually costs this plant to make a unit — and a price below it means
      the firm does not sell, which is CAP's stated mechanism arriving where it belongs, on the
      offer rather than on the production throttle. The `[0.40, 0.98]` band on the cost rate went
      with it: it existed because the margin it read was a stated number that could be anything.
    - **Measured, and the dispersion result is the striking one.** Over twenty weeks the spread of
      relative prices collapses from **0.01x-14x to 0.13x-2.78x**, and upstream extraction leaves
      the bottom of the table entirely. Unemployment improves (28.3% → 26.4% at week 10). Harness
      green.
    - **AND THE HEADLINE GOT WORSE: −16.3% → −18.8% inflation at week 10**, on top of §7.129's
      −11.9% → −16.3%. Two correct mechanisms, one metric moving the wrong way, recorded rather
      than tuned away.
    - **WHY, and it is the next item.** The floor is `weekly operating cost / units produced`, and
      units come from `weeklyCapacityUnits`, which is seeded once as `baseline revenue / the price
      prevailing at first trade`. §7.127 lowered intermediate seed prices — correctly — so the
      same plants opened with MORE capacity units, which makes unit cost lower, which makes the
      floor lower. **Capacity is inversely proportional to a seed price, so any change to that
      price silently rescales the physical economy.** That is a seed-consistency defect of exactly
      the §7.120 kind and it is now the binding one. Owner: CAP, with IND-R3 — a per-good
      consumption intensity is what would let capacity be seeded in physical terms instead of
      backing it out of a price.
    - **Four changes into this chain, every one principled and harness-green, the measured
      deflation has gone from −12% to −19%.** That is the honest state, and the lesson is that
      local correctness does not compose into global calibration: the seed's physical quantities
      and its prices are still solved separately, and each fix reveals the next place they
      disagree.

131. **IND-R3 done — every good has its own consumption intensity — and the five-fix pattern says
    the price LEVEL has no anchor.**
    - **IND-R3.** `HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY = 0.02` was one number for all 37 goods, so
      a household consumed as many units of aerospace as of food, every baseline price landed at
      the same order of magnitude, and a "unit" was an abstract bundle rather than a thing — with
      the CPI basket inheriting the whole of it. Each sub-unit now declares
      `householdUnitsPerCapitaAnnual` and `corporateUnitsPerFirmAnnual` on its registry entry,
      beside the physics, exactly where `category-demand.ts`'s own comment said they belonged.
      The absolute scale is a free choice — it only sets what one unit means — so what is stated
      is RELATIVE frequency: food constantly, a vehicle rarely, an airliner almost never.
    - **AND THE THING THIS SEQUENCE HAS ESTABLISHED, which matters more than any one fix.** Five
      changes into the price chain — final-demand pricing (§7.127), one base for the commodity
      market (§7.128), investment responding to shortfall (§7.129), a cost-anchored reservation
      price (§7.130), per-good intensities (here) — **every one principled, every one
      harness-green, and the measured deflation has gone −12% → −25% at week 10.** Relative-price
      dispersion improved enormously (0.01x-14x → 0.13x-3.4x); the LEVEL got steadily worse.
    - **A metric that moves the wrong way under five independent correct fixes is not being
      caused by any of them.** The conclusion is structural: **nothing in this model anchors the
      nominal price level.** Every price is relative and cleared, money is endogenous (a loan
      creates a deposit), and the policy rate does not reach nominal demand — so the level is free
      to drift and the mechanisms above only decide how fast. That is MAC's real content, and it
      is not in §5-MAC's current three parts (expectations, confidence, the fiscal stance), which
      all presume a level that is anchored and merely mis-forecast.
    - **So MAC(a) is re-scoped by measurement:** before confidence or the stance, the question is
      what pins the level at all — the transmission from the policy rate to nominal spending, and
      whether the CPI's fixed seed basket can carry a cross-section whose dispersion changes this
      much. **Do not attack it with another mechanism fix in the goods market; five of those are
      now recorded and the level moved against all of them.**

132. **MAC(a) diagnosed to one line — and §7.131's "no anchor" conclusion is WRONG.** Measured
    over twenty weeks, USA, in the current tree.
    - **The anchors all hold.** Nominal wages fall **4.2%** (sticky, as they should be). Bank
      deposits — the money stock — **+1.3%**. Nominal demand **+17%**. Household income **flat**.
      Government spending **+36%**. Physical capacity **−5%**, gross PP&E flat. **And prices fall
      30%.** So the level is not drifting for want of an anchor, and §7.131's conclusion —
      written from four data points without measuring wages or money — was wrong.
    - **Prices falling into FLAT NOMINAL DEMAND and a SHORTAGE is backwards.** Demand in dollars
      is up, supply in units is short (§7.127), and the price falls anyway. Nothing about
      expectations, confidence or the policy rule can produce that. It is price FORMATION.
    - **THE LINE.** §7.130 anchored the seller's floor to cost in dollars, which was right, but
      the cost it anchors to is still mostly PROPORTIONAL TO REVENUE. `revenue − ebitda` is
      `inputs + payroll + opex`, and of those only payroll is sticky: inputs are
      `intensity x revenue` for anything not drawn from real lots, and `otherOpex` is
      `otherOpexRate x revenue` by construction (§7.121). So when the price falls, revenue falls,
      two thirds of "cost" falls with it, the floor falls, and the price can fall again. **The
      ratchet survived the fix because the cost it was anchored to still chases the price.**
    - **The next slice, and it is IND3's remaining half:** opex must be a real dollar cost — what
      the firm actually pays for things — rather than a share of revenue, in the same way IND3
      already made input lots real. Until then no floor can hold, because every floor is a
      fraction of the number it is supposed to bound (rule 15, in its subtlest form yet: the bound
      LOOKS like dollars and is a percentage wearing dollars' clothes).
    - **Five goods-market fixes preceded this diagnosis and none of them was wrong** — dispersion
      went 0.01x-14x → 0.13x-3.4x and the sovereign, commodity and profile ledgers all closed.
      But the level kept falling because the one line above was never touched. **Recorded so the
      sixth fix is the right one.**

133. **A negative result, recorded because it was my own best hypothesis and it was wrong.**
    §7.132 concluded the price ratchet survives because `otherOpex` is `rate x revenue`, so two
    thirds of a firm's cost chases the price down. The obvious fix — overhead as a per-head dollar
    cost, seeded from the firm's own books and carried at its current headcount — was built and
    measured: **deflation −18.8% → −28.2% at week 10 and the harness went RED.**
    - **Why it fails, and it is worth more than the fix would have been.** In exactly the runs
      where the ratchet bites, headcount is itself collapsing. **Tying a cost to a falling
      quantity is no better than tying it to a falling price** — the floor fell anyway, and faster,
      because employment falls faster than revenue. A "sticky" cost has to be anchored to
      something that is genuinely sticky, and in this model the only such thing is the WAGE
      (−4.2% over twenty weeks against prices' −30%), not the wage BILL.
    - **Reverted, and the reasoning left in the code at the site** so the next attempt does not
      repeat it. This differs from §7.119's reverted-then-restored change: that one fixed a real
      inconsistency and was reverted to hide a number, which was wrong. This one had no measured
      benefit, failed its own hypothesis and regressed the harness. **Declining to ship a change
      that fails its own test is not clamping a symptom.**
    - **MAC(a) therefore stands where §7.132 left it**, with one candidate eliminated: the answer
      is not "make overhead sticky". Harness back to green, 0 violations.

134. **IDX — CLOSED. An index is a statistic, a beta is a measurement, and no published name is a
    real brand.**
    - **The ±15%/week index clamp is gone.** An index is the cap-weighted move of its own
      constituents, whatever that is (rule 2). The clamp's only effect was to hide §6's equity
      runaway inside the published number while the constituents themselves ran — the one thing a
      published index must never do.
    - **The $0.10 stock-price floor is gone** (rule 15). `comp.stockPrice` arrives as 07e's
      CLEARED price; a company the market has decided is worthless approaches zero, and the
      endgame is delisting and default, not a ten-cent bound feeding market cap, index levels and
      the take-private arithmetic. Only non-negativity remains, which is arithmetic.
    - **Beta is measured.** It was stated per sector and then used to discount the very stock that
      should produce it — equity valuation, LAB's cost of capital, the seed's capital charge — so
      a name's risk premium was a property of its sector LABEL. It is now the covariance of that
      name's cleared returns with its own region's index over the covariance of the index with
      itself, on up to 52 weeks; the sector number survives only as the opening prior until there
      are enough real weeks to strike one. **This model published both series every week and never
      computed it.**
    - **Rule 4: nine real brands deleted.** Five index names ('S&P 500 Composite', 'Euro Stoxx
      50', 'FTSE 100', 'Nikkei 225', 'S&P GSCI Commodity Index') and four central banks
      ('Federal Reserve', 'Bank of England', 'Bank of Japan', 'European Central Bank'), plus four
      country names — **and the TYPE carried them too**, so `us500`/`euStoxx`/`uk100`/`jp225`/
      `gsciCommodity` are now `usaComposite`/`eurComposite`/`ukComposite`/`jpnComposite`/
      `commodityComposite` across all five files that spell them. No constituent count in the
      generated names either: a real index names one because its membership is fixed at that size,
      and this one's is re-struck quarterly, so a number would be a brand as well. **Currency
      codes and symbols stay** — identifiers the whole model keys on, and a unit of account is not
      an imported equilibrium.
    - **One latent defect closed in passing:** sector sub-indices did not filter to `listed` while
      the regional ones did — harmless only while a private firm's market cap was 0, and a
      double-count waiting for the moment one carried a quote.
    - **Measured: 1 violation, a single name's revenue growth** (`ZBJV`), the recurring
      single-name family that has come and gone through this whole sequence under eight different
      tickers. Deflation improves −24.8% → −22.2% at week 10. **Not attributed and not chased**
      (rule 10); it is the family §6 already tracks, not a new one.

135. **DEM, first half — regions differ in KIND, and the difference is generated, not imported.**
    - **Both clamps deleted (rule 2).** Population growth was held inside `[−3%, +4%]` and the
      migration attractiveness signal inside `±1%`, so a region could neither shrink nor boom
      however its own fertility, mortality and attractiveness moved — which is the entire quantity
      this project exists to make vary. Only non-negativity remains, which is arithmetic.
    - **The rule-4 trap in DEM's own brief, and how it is avoided.** §5-DEM said "seeded from
      real-world shapes: Japan shrinks and ages, the USA grows mostly by migration". **That is a
      real-world OUTCOME and a table of it would assume the answer** (rule 4's sharper half). What
      IS a legitimate primitive is the mechanism behind it: **the demographic transition** —
      fertility falls as income per head rises, a relationship rather than a country's result. So
      each region's fertility is derived from the productivity this model already generates for it
      by Zipf rank, and **which region ends up shrinking is an outcome of that draw.** Mortality
      follows the region's own retired share, so an ageing region's death rate rises on its own
      instead of sitting at a seeded constant. Net migration opens at zero and is the endogenous
      attractiveness signal's to move.
    - **Measured at seed: birth rates now 1.156% (USA) / 1.256% (UK) / 1.291% (JPN) / 1.322%
      (EUR)** — the highest-productivity region has the lowest fertility, which is the transition
      doing its work — and populations diverge over 30 weeks (x1.00309 to x1.00408). Harness green.
    - **Remaining, and it is DEM's second bullet: age structure that DOES something.** Death rates
      are still identical ACROSS regions (0.600%) because `lifeCycleDistribution` is seeded the
      same everywhere and drifts the same way; it varies over time but not between regions. Until
      the age structure itself differs, the dependency ratio cannot drive participation and the
      pension system's funding need cannot respond to a retired share that is the same everywhere.
      **Also unstarted:** housing reading demographics (it propagates for free once the above
      moves) and the 260-week divergence check, which is a long run and waits for a close.

136. **IND4 — how an industry funds itself and what it pays out.** Two numbers that were the same
    for every firm in the model.
    - **Payout was `0.6` for everyone.** A mature network operator and a growth software firm had
      identical payout discipline, which is the clearest single thing that is NOT alike across
      industries. It is now `financingProfile.maxPayoutRatio` on the registry entry: 0.75 for the
      long-asset, mature industries (telecoms, real estate), 0.20-0.30 for the asset-light growth
      ones (software, media, tech hardware).
    - **Funding mix was rating-only.** `FIXED_SHARE_BY_RATING` stays and should — an issuer's
      ACCESS to the bond market is its credit quality's — but what the money BUYS decides the
      term: long-lived assets are funded long, asset-light and fast-obsolescing ones borrow short
      and floating. `financingProfile.fixedRateTilt` multiplies the rating base (1.20 telecoms and
      real estate, 0.80 software), through one accessor so no stage switches on an industry
      (rule 17).
    - **`cyclicalityBeta` deliberately NOT added**, though §5-IND4 listed it. Beta is a
      MEASUREMENT since §7.134 — stating one per industry would restore precisely what IDX just
      deleted, one field over. **A work item's own brief can be stale; the rules are not.**
    - Harness green, 0 violations.

137. **IND6 — share versus margin, expressed only through the real offer price.** Every seller
    asked cost plus the same premium, so no firm could choose to buy share by pricing keener than
    its rivals — the one lever that actually moves share in an auction that fills cheaper offers
    first.
    - **The posture is neither a stated per-company variable nor a synthetic share target**, both
      of which §5-IND6 rules out. It is the firm's OWN inventory position, which stage 05 already
      computes for the production throttle: a warehouse filling up is a firm that is not selling,
      and it gives up margin to move stock; a firm with nothing left holds out for its full
      premium. The same signal already governs QUANTITY, and IND6 is that it should govern PRICE
      too — which is what a real seller does first.
    - **The contribution-margin bound is the floor beneath it:** at full inventory the premium
      goes to zero and the ask is unit cost (§7.130), never below. A firm gives up profit to win
      share, not money.
    - Harness green, 0 violations. No new persisted field, so §7.41's rebuild trap is not in play.

138. **IND7, first half — the antitrust hold is measured; the divestiture is not built.**
    - **What exists.** A competition authority acts on a MEASURED share held for a sustained
      period, not a snapshot: one quarter at 45% is a good quarter, a year at 45% is a position.
      Stage 08 runs an antitrust clock off each firm's own `categoryMarketShare` — counting up
      while it is dominant in any category it sells into, resetting when it is not — and **stage
      10 will not let a firm under the hold acquire another.** The threshold and the window are
      policy primitives in rule 4's sense, like a tax rate or a capital ratio; no real authority's
      case history is imported.
    - **What is NOT built, and why it is being recorded rather than half-done.** §5-IND7 also
      calls for the divestiture: splitting the firm into two real companies through the generation
      machinery, dividing product lines, debt AND HOLDERS. The first two are the merger stage run
      backwards and are tractable. **The third is not, yet:** a spin-off must create a NEW
      issuer's holder register and give every parent holder a proportional position in it, and
      ownership conservation is exactly what OWN7 spent its whole slice getting right (§7.104,
      harness 602 → 107). `settleCorporateActionOnHolders` SCALES an existing float; it cannot
      mint a register. **Building that carelessly would undo OWN7**, so the honest order is: extend
      the ownership machinery to issue a new register first, then divest.
    - Harness green, 0 violations. **IND's independent slices are now IND4, IND6 and IND7-first-
      half done; IND10-19 remain and are the depth-tier build-outs.**

139. **CAP — a firm that cannot cover unit cost STOPS producing. The control loop closes.**
    §5-CAP's own mechanism, and the half §7.129 recorded as missing when it added the investment
    response: *"an investment response without a production-stopping rule is half a control loop."*
    - **What was there.** `productionThrottle` answered "is my warehouse full" (and floored at
      0.3, so a plant with nowhere to sell still ran at three tenths forever — rule 2). Nothing
      answered **"does making one more unit lose money"**. A firm facing a price below its unit
      cost kept producing into inventory.
    - **What is there now.** Production goes to ZERO when the expected price is below what the
      unit costs to make — the same dollar figure the offer floor uses (§7.130), so a firm never
      produces something it would then refuse to sell. **That is what makes a downturn end:**
      supply leaves until the price recovers. And it is why CAP0 had to go first — while EBITDA
      could not be negative, this could never fire.
    - **Measured: deflation −25.5% → −21.9% at week 10 — the first improvement in this whole
      chain**, after four fixes that each made it worse or left it flat (§7.129, §7.130, §7.131).
      Unemployment flat to slightly better. Harness green, 0 violations.
    - **The lesson, and it is why §7.129's honesty mattered:** that slice shipped a mechanism that
      measurably worsened the headline and said so, naming the missing counterpart. The
      counterpart is this, and together they behave. **A half-loop recorded as a half-loop is
      recoverable; a half-loop shipped as a fix is not.**

140. **DIST, first slice — the SME pool carries a cross-section, and the decision that gates a
    credit cycle is an integral instead of a function of the mean.** *(User directive: start DIST.
    Its prerequisite, one firm model, was met by IND-R6.)*
    - **THE MEASUREMENT §5-DIST ASKED FOR, FIRST.** Named tier at seed, USA: leverage p10 **1.50**
      / p50 **3.12** / p90 **5.92**, margin spread 2.5x, revenue spread 24.7x — and **11.2% of
      firms sit within 10% of the covenant threshold.** The affordability line EMP sheds against
      has almost nothing near it now (1 firm of 591, against §7.109's 92 of 629), so **DIST's
      value is on the CREDIT side, not the labour side.** That is what the measurement was for and
      it answered.
    - **The defect it found.** A pool's default rate was
      `0.015 + max(0, 1 − coverage) x 0.04 + cashStress x 0.06`, read at the pool MEAN. `max(0, 1 −
      coverage)` is a threshold, so a pool averaging coverage 1.2 had exactly ZERO coverage-driven
      defaults however many of its firms sat below 1, and **a mean-preserving spread could not
      cause a single default** — which is the mechanism of a credit cycle. Plus a `[0.002, 0.25]`
      band on top (rule 2), which existed to bound a formula read at a point.
    - **The fix.** The pool carries `strata`: K equal-weight quantiles of the SAME leverage-takeup
      draw the named tier uses (IND8/§7.113) — no second distribution, no fitted shape, no
      imported dispersion (§7.4). Their mean is re-centred on the pool's own book every week, so
      **this adds a cross-section and restates no debt** (rule 3). The rate is now the weighted
      sum of each stratum's own distress, and the band is deleted.
    - **Measured, and it is the textbook case.** Weighted mean leverage is identical at K = 1, 5,
      9, 20, 50 — **aggregation exactness holds** (§5-DIST's first verify). And where the threshold
      is live: at mean leverage **16 the scalar reports 0.0000 distress while the cross-section
      reports 0.1104** — the scalar is blind through the entire approach to the threshold and only
      agrees once the mean is deep past it (at 20: 0.167 vs 0.198).
    - **Honestly dormant today.** At the pools' current 2.7x leverage, interest coverage is 6.2x
      and no stratum is near the threshold, so the term contributes zero and the harness is
      unchanged (green, 0 violations). **It arms as pools lever up, which is exactly when a credit
      cycle needs it** — and it could never have armed before.
    - **Next in DIST:** the household side (COH's redesign), the absorbing barrier with reinjection
      on the SME side, and the strata responding to their own stratum's cash rather than the
      pool's.

141. **DIST — the cash term too, which is the half that is live.** §7.140 made the coverage term an
    integral and found it dormant at today's leverage. The `cashStress` term is the same defect and
    is the one that actually fires.
    - **It read the pool's MEAN cash cover**, so a pool holding six weeks of wages on average
      showed no distress even when a third of its firms held two. **Cash is not spread evenly
      across a pool:** what a firm has left is what its earnings leave after ITS OWN debt service,
      so the strata paying the most interest hold the least — which is exactly why they are the
      ones that fail. The pool's cash is now allocated on that residual, so it distributes the
      pool's own money rather than inventing a second stock (rule 3).
    - **Measured, and it is the boundary case that matters:** at exactly the target six weeks of
      cover the scalar reports **0.0000** stress while the cross-section reports **0.0357** — the
      levered strata are already under. Below target the two converge, because once the mean is
      stressed everyone is. **A scalar is blind precisely in the approach to a threshold, which is
      where a credit cycle is decided.**
    - Harness green, 0 violations, numbers unchanged — these pools are not distressed, so a
      distress function correctly reports nothing. Both terms are structural and arm under stress.

142. **DIST/COH — the wealth MPC is derived from each tier's own balance sheet, and the mechanism
    reproduces a pattern the stated table assumed away.**
    - **What it replaces.** Four stated numbers (0.10 / 0.06 / 0.03 / 0.015) whose own comment
      admitted the source — *"stated from the empirical literature"* — and named the honest
      version: it falls out of a budget constraint. Rule 4 forbids the observed cross-section; the
      mechanism behind it is fair game, and the model already measures everything that mechanism
      needs.
    - **The derivation, from two per-tier measurements.** Whether a tier SAVES at all (a tier
      consuming its whole income has unmet needs and consumes a windfall too), and whether its
      wealth is SPENDABLE — the liquid/illiquid split §5-DIST calls not-optional. A stock is spent
      over years, so the flow propensity is divided by a spend-down horizon, which is the only
      stated number left.
    - **AND THE RESULT IS NOT MONOTONE, which is the finding.** Measured at seed:
      BOTTOM_50 **0.0557** (savings 0.010, liquid 0.450), TOP_9 0.0189, TOP_1 0.0142, and
      **NEXT_40 the LOWEST at 0.0126** — because its wealth is 89% home equity. That is the
      **wealthy-hand-to-mouth** household: asset-rich, cash-poor, and unable to spend a windfall
      it cannot reach. §5-DIST cited exactly this as why the liquid/illiquid split is not
      optional, and **the stated table could not express it at all** — it was monotone by
      construction, so the second tier had to sit between the first and third whatever its balance
      sheet said.
    - **A mechanism that reproduces a known real-world pattern WITHOUT BEING TOLD IT is the whole
      point of rule 4.** The stated table imported the answer and got the shape wrong; the budget
      constraint derived it and got the shape right.
    - Harness green, 0 violations, week-10 numbers unchanged — wealth effects are second-order
      over ten weeks. The levels are uniformly lower than the stated table's, which is a real
      change to the aggregate wealth effect and will show at horizon.

143. **DIST — the absorbing barrier and its reinjection: default removes weight, and the survivors
    are cleaner.** §5-DIST said to design this first because it is where every ledger bug in the
    scheme will live.
    - **The one-sided flow it closes.** A pool default already wrote the bank's loan down
      (`bank-lending.ts`, principal x PD x (1 − recovery)) — but it left the FIRM in the pool. A
      pool could default 5% a year forever and its cross-section never changed: **the lender lost
      the money and nobody stopped existing** (rule 14).
    - **Firms do not fail at random.** The ones that fail are the ones that could not service
      their debt, so the exiting weight is drawn from the strata in proportion to their OWN
      distress. The survivors are therefore less levered than the pool was — **which is what a
      credit cycle's cleansing phase IS, and a scalar pool could not represent it at all.**
    - **Reinjection is the other half, and it is what makes this a BARRIER rather than a
      rescale.** An SME tier is not a closed cohort: new firms form, and they form UNLEVERED,
      because a business starts without a balance sheet. Entry replaces the exiting weight at the
      least-levered end, so the firm count is conserved while the composition shifts. Weight
      leaves at one end of the distribution and re-enters at the other.
    - **Measured over twenty weeks: weight sum 1.000000 → 0.999999** (the drift is the 6-decimal
      rounding, nothing else), **mean leverage 2.700 → 2.334 while p90 moves only 4.197 → 4.122**
      — weight left the levered end and re-entered unlevered, which is the cleansing showing up
      exactly where it should. Harness green, 0 violations.
    - **Note on the level versus the shape.** The strata's mean is re-centred on the pool's own
      debt every week (§7.140), so what this evolves is the SHAPE; the level stays the book's.
      That is deliberate — a cross-section that drifted away from the debt it describes would be
      the second representation rule 3 forbids.

144. **DIST/COH — the deposit split is an outcome of who saved, and SEED-FLAT-GET-A-TAIL passes.**
    The first of §6.3-A's nine stated cross-section tables to become a measurement.
    - **§5-COH's own sentence was not true.** *"Who holds deposits is whose savings accumulated"* —
      but `TIER_BALANCE_SHEET_WEIGHTS.deposits` applied a fixed share of the aggregate **every
      week**, so a tier that saved more never got richer and the wealth distribution could not
      respond to the one thing that produces it (rule 13). The table is documented "US
      SCF-shaped": an observed real-world equilibrium, and the largest of the nine.
    - **The fix.** Each tier carries the stock its own saving builds — the cohorts already measure
      the flow — and the deposit split is that stock's share of the total. The stated weights
      remain the OPENING CONDITION only, used until the accumulation has anything in it (§7.4: a
      seed may state what the mechanism then owns).
    - **§5-DIST's second verify criterion, met.** Seed every tier with the SAME accumulated saving
      so any skew must be produced rather than carried in:
      **25.0 / 25.0 / 25.0 / 25.0% → 6.4 / 29.1 / 32.1 / 32.4% at week 52 → 2.3 / 16.2 / 38.0 /
      43.5% at week 104**, top-to-bottom ratio **1.00x → 5.07x → 19.32x.** The concentration is
      the mechanism's, out of the cohorts' own differing savings rates and incomes. **A
      distribution that emerges from a flat start is derived; one that is read from a table is
      assumed.**
    - **Honestly noted: it concentrates FAST** — 19x in two years. That is an outcome of the
      savings-rate spread the cohort budgets produce (0.010 at the bottom against 0.350 at the
      top), not of anything stated here, and whether that spread is right is COH's question now
      that the accumulation can ask it. Before this, the question could not even be posed.
    - Harness green, 0 violations. **Eight tables of §6.3-A remain**; this one and the wealth MPC
      (§7.142) are done.

145. **DIST — ALL NINE of §6.3-A's stated cross-section tables are now measurements.** The
    reframing §5-COH was built on ("nine imposed tables are ONE missing mechanism") is discharged,
    and each table turned out to have a DIFFERENT cause — which is exactly why nobody had derived
    them: they were nine separate stated numbers because nobody had asked what produced each one.
    - **Deposits** (§7.144) — the stock a tier's own saving built. **Wealth MPC** (§7.142) — its
      savings rate times how much of its wealth is liquid.
    - **Equity-like and private business** — the same accumulated stock allocated by the tier's own
      `equityExposureShare`. They share a driver deliberately: both are appetite for risky illiquid
      ownership and the model measures ONE such appetite, so two tables with one cause is one
      derivation (rule 3).
    - **Institutional claims** — the long, non-equity half of the same saving. A pension
      entitlement is what a cautious saver holds.
    - **Unmodeled** — split by the same accumulated stock. It is a residual placeholder that should
      shrink; **a stated split of an unknown is the worst of both**, so it follows the one thing
      known about who saved.
    - **Housing and mortgage — BORROWING CAPACITY, not wealth.** A house is bought with a mortgage
      and what a lender advances is a multiple of INCOME, so housing concentrates in the tiers
      that have income rather than the tiers that have assets. **That is the cause of the
      wealthy-hand-to-mouth middle**, and using income here produces it instead of assuming it:
      NEXT_40's derived MPC stays lowest at 0.0126 after the change.
    - **Consumer debt — who does not cover their spending.** A tier saving a third of its income
      does not run a card balance; one saving a hundredth does. The split is
      `(1 − savings rate) x income`: the propensity to borrow times the base it is borrowed
      against, both measured.
    - **The stated tables survive only as OPENING CONDITIONS**, used until the accumulations have
      anything in them (§7.4). Harness green, 0 violations, through every step.
    - **What this leaves COH.** Its premise — give cohorts balance sheets and eight of nine tables
      become measurements — is now done by a different route than it planned: not a balance sheet
      per cohort, but a distribution whose moments are derived (§5-DIST's argument, and the reason
      that section said COH would be REWRITTEN rather than executed). **§5-COH should be re-read
      before it is started; most of what it describes has happened.**

146. **IND15 — labour constrains output.** Stage 05's production plan was the plant alone, so a
    firm that could not hire produced exactly as much as one fully staffed and an unfilled vacancy
    reached nothing. Output is now `min(plant, plant x staffedShare)`, `staffedShare` being the
    firm's own headcount against the headcount its baseline output needed — both already measured,
    no new field. Week-10 deflation **−24.76% → −19.82%**, harness green.
    **Lesson: a mechanism that binds on nothing is a mechanism that is not there.** The labour
    market cleared, wages moved, hiring succeeded and failed, and none of it reached a price until
    output could feel it.

147. **IND10 — production takes time; WIP is a real stock.** `productionLeadWeeks` existed on all
    37 goods, was 0 in every one, and was read nowhere. Leads are now technological primitives
    (0 services/software/electricity, 12 a fab and a growing season, 26 a house, 52 a commercial
    building). `Company.wipBySubUnit` is a queue whose index `i` completes in `i` weeks, so its
    LENGTH is the lead; a firm offers what it holds plus what its plant FINISHED, not what it
    started. Measured: WIP carried = the lead, bucket by bucket (1.00 at lead 1, 26.35 at 26,
    53.68 at 52); **$69.5B of work in progress that did not exist before**. Deflation −19.82% →
    −19.85%: **no behavioural change at rest, which is the correct result** — the lead binds when
    something moves. A structural invariant asserts every queue's length equals its good's lead
    (the §7.41 trap: a rebuild from a fixed field list drops what it does not name).
    A pool has no pipeline and that is not an omission: its offer is a RATE, not a stock.

148. **IND11 — the backlog is a stock, and it exposed an ordering defect older than itself.**
    `SupplyContract` carries `backlogUnits`, `shortWeeks`, `escalationBaseUSD`: undelivered units
    no longer evaporate, a quarter on the clock TERMINATES the contract, a buyer whose demand
    collapsed CANCELS, and contracts of a year or more INDEX to the price they were struck against
    (31.5% of the book). **Both damages legs are the cover measure** — `units x the contract/market
    differential`, each way — so neither has a free coefficient and a breach costs nothing when the
    market moved the wronged party's way (rules 2, 15).
    **THE DEFECT.** Contracts settled at step 2 against LAST week's closing stock while production
    reached the warehouse at step 8, after the auction — so a firm's own output was never available
    to its own committed orders, and since the offer already reserved the contract volume, what it
    left was exactly the shortfall. **Every contract in the economy under-delivered, permanently,
    and nobody noticed because an unfilled order evaporated.** Two contracts on one supplier could
    also ship the same units. Order is now PRODUCE → DELIVER COMMITMENTS → AUCTION THE REST against
    one drawn-down balance: **69% of the book short → 15.6%**, quoted delivery 1.52 → 0.20 weeks,
    deflation −19.85% → −12.90%.
    **The probe went RED on one assertion** (JPN unemployment 30.41% vs a 30% band) and it was
    A/B'd to the cause: the ordering fix alone carries it, and the baseline breaches the same band
    at week 11 anyway. **Input cost is charged FIFO off real lots, so a buyer that received nothing
    on contract held no lots, consumed nothing, and WAS NOT CHARGED for 60% of its inputs.** Making
    the deliveries real made the costs real. Not tuned, not banded away (rules 2, 12).

149. **LAB — THE HIRING BRANCH HAD NEVER FIRED.** One half of the employment decision was nominal
    and the other real, so only shedding could happen. `desiredEmploymentGrowthAnnual` deflates
    correctly; §7.109's level path computed `outputNeedHeads = annualRevenue / (baselineAnnualRevenue
    / baselineEmployeeCount)` — **this week's dollars over the seed's dollars, no deflator.** With
    prices falling every firm read as overstaffed, `understaffedHeads` was zero for everybody, and
    the hiring branch is gated on exactly that; meanwhile the shedding branch reads REAL earnings
    against a REAL capital charge and fired for the 26-44% of firms below the line.
    The deflator is each good's own cleared price against the price it was seeded at, revenue-
    weighted over the firm's lines. **Unemployment falls for the first five weeks for the first
    time** (20.3% → 18.0%) instead of rising monotonically from week 1; week 10 28.8% red → **25.7%
    green**. Still open: the curve turns at week 6 — netPPE/revenue 1.35-1.58x against a ~7.5% cost
    of capital, and inputs/revenue 14-20% against a real ~45-55%, both measured in the IND battery.
    **Lesson: §7.146's again, in the one costume no code reading finds — the logic was right and
    the UNITS were wrong. Rule 9 is about periodicity; a price level is part of the number too.**

150. **IND12 — domestic trade credit: the machinery was already built and gated to cross-border
    by ONE LINE.** `if (!seller || origin === plan.regionId) return;` in stage 05. Everything
    XB3a-5 built — terms set from the buyer's own default probability against the seller's own
    margin (no net-30/60/90 table anywhere), a receivable on one book and a payable on the other,
    cash deferred until due, a WRITE-OFF when either counterparty dies — applied only to sales
    that crossed a border, which is the minority of trade. Trade credit outstanding exceeds bank
    credit in reality and almost all of it is domestic.
    - **The one real difference is the invoice currency, and for a domestic pair there is no
      choice to make**: both sides are already in that money, so there is no exposure to place
      and nothing for `chooseInvoiceRegion` to weigh. That is the whole of the change.
    - **Measured, and all three of §5-IND12's checks pass.** 217,030 invoices outstanding,
      $15.3B, of which **65% domestic**. **Receivables $15.3B = payables $15.3B exactly** — every
      invoice is two-sided by construction (rule 14). Mean terms 7.5 weeks, set per pair by real
      credit rather than stated.
    - **The third check EMERGED rather than being built.** Receivables per week of sales rise
      monotonically with production lead: **0.60 weeks at lead 0, 0.83 at 1-5 weeks, 0.96 at 6+**.
      Nothing was tuned for this — the lead times were set for IND10 with no thought to working
      capital, and the terms come from credit quality, not from cycle length. A long-cycle firm
      carries more working capital because its customers are the kind of firms they are.
    - **A customer default already propagates to named suppliers**: `trade-settlement.ts` writes
      the invoice off when either side is inactive, and that write-off is now mostly domestic —
      which is what makes it a cascade channel rather than an export anecdote.
    - **Still on immediate cash: contract deliveries.** A contract delivery pays through `pay()`
      the week it ships while an auction lot goes on terms — two treatments of one B2B sale
      (rule 3). Logged, not built: it belongs with whatever revisits contract settlement.
    - Deflation −16.22% → −14.39% at week 10, USA unemployment 25.7% → 24.1%, harness green.

151. **IND13 — assets under construction: a machine on the loading dock is not plant.** IND1
    separated ORDERING from DELIVERY (`capexDeliveredUSD`, not the budget). This is the second
    half: a capital good that has arrived is installed and commissioned before it makes anything,
    so gross PP&E — and the capacity that grows off it — moves when the asset ENTERS SERVICE.
    - `Company.assetsUnderConstruction` is a list of lots each carrying the week it goes live,
      from the good's own `commissioningLeadWeeks`: 2 for a fleet vehicle, 4 for enterprise
      software, 6 for heavy equipment, 10 for industrial automation, 13 for a commercial
      building. Technological primitives, capital-goods categories only.
    - **Both arrival paths feed it** — the domestic auction lot and the imported shipment in
      `goods-arrival.ts`. An ocean crossing was the other half of the wait, not a substitute for
      commissioning. `capexDeliveredUSD`/`capexDeliveredLastWeekUSD` are gone: the plant grows by
      `capexCommissionedLastWeekUSD`, one number, in one place (rule 3).
    - **Measured:** 2,314 firms carrying construction in progress, **p50 9 weeks still to wait,
      max 13** — the queue binds rather than emptying instantly. Deflation −14.39% → −11.00% at
      week 10, harness green.
    - **The measurement found something bigger than the slice** — capex is not covering
      depreciation by an order of magnitude, and there is a ±2%/week clamp on capacity growth
      next to it. Both logged in §6.1 as CAP's; both were invisible until the stock existed to
      look at, which is the argument for building the stock.

152. **IND14 — reliability is a supplier attribute, and IND11 is what made it measurable.** Who a
    buyer contracted with was `candidateSuppliers[floor(random() x n)]` — a uniform draw over
    everyone in the money. A supplier that had failed to deliver for a year was exactly as likely
    to win the next contract as one that had never missed.
    - **There was nothing to measure before.** An undelivered order evaporated (§7.148), so a
      chronic under-deliverer was indistinguishable from a punctual one the following Monday.
      `recentFulfillmentEMA` was the closest thing and it answers a different question — "did
      this firm sell anything", not "did it deliver what it promised".
    - `Company.deliveryReliability` is units delivered against units OWED on the firm's own
      contracts, accumulated where the delivery happens and smoothed at 0.9 — **deliberately
      slow, because reliability that one good week repairs is not reliability**, which is exactly
      §5-IND14's test. It weights the sourcing draw: a supplier shipping 60% of what it owes is
      drawn 60% as often. The merit order already prices landed cost; this is the other half.
    - **The one floor, and what it is not.** `SUPPLIER_MIN_SOURCING_WEIGHT = 0.05` bounds the
      WEIGHT, never the record, which stays measured and unbounded. It says a buyer who has never
      dealt with a firm cannot know it is unreliable, so somebody tries it. Without it a firm
      that missed one quarter could never win another contract from anyone ever again, and there
      is no re-entry mechanism to bring it back — that is DYN's.
    - **Measured at week 10: p10 0.889, p50 1.000, p90 1.000, nobody below 0.5.** The attribute
      exists and is dispersing, and the dispersion is YOUNG on purpose: at 0.9 a record moves
      only 65% of the way to the truth in ten weeks, so this is what a slow EMA looks like early.
      It needs a longer run or a supply shock to bite, and that is the correct shape.

153. **IND19 — corporates already buy insurance; the row was hiding a DOUBLE CHARGE.** HH1c
    already splits the insurers' written premium across every operating firm by `grossPPE +
    annualRevenue` — property and business interruption exactly — with claims back on real cash.
    Nothing to build. But the cash leg still subtracted `premiums x INSURER_EXPENSE_RATIO`, and its
    own comment named the dependency: *"the P&L already charges an expense ratio against premiums"*.
    §7.125 deleted that charge — an insurer's operating cost became its real wage bill and input
    basket — **and this leg was left behind, so the same expense was taken twice** (rule 3). The
    household mirror went with it. `INSURER_EXPENSE_RATIO` is deleted: the constant §7.125's record
    already claimed was gone, and was not. Deflation −15.72% → −9.71%.
    **Lesson: a cleanup that removes a charge must chase every cash leg balancing it, and the
    comment explaining the dependency is where to look.**

154. **IND17 — prepayments: negative working capital, and IND10 is what decides who gets it.**
    A long-cycle order is funded as the work is done, not on handover — the buyer's money pays
    for the steel before the ship exists.
    - `SupplyContract.prepaidUSD` is one number on the bilateral object because it is one
      obligation: the seller's liability (goods owed, not revenue) and the buyer's asset. Each
      week's delivery settles against the deposit FIRST and only the balance moves as cash — the
      full price again would collect for the same goods twice — and the deposit is then topped
      back up to `lead x weekly value x 30%`, which is what a progress-payment schedule IS: it
      tracks the work still in the pipeline.
    - **The 30% is a contract term, not a dial**, in the same family as IND11's cure period: no
      supplier carries a year of someone else's build on its own balance sheet and no buyer hands
      over the whole price before anything exists, and which side funds how much is negotiated.
      **There is no category list anywhere** — a good made on demand has no work in progress to
      fund, so `productionLeadWeeks` does the filtering, and the zero falls out.
    - **Measured, and it lands exactly where it should:** $4.4B of customer deposits across 1,637
      suppliers — **0.00 weeks of sales at lead 0, 0.11 at leads 1-5, 1.06 at leads 6+**. The
      negative working capital accrues to precisely the firms whose production ties up the cash,
      and to nobody else. Harness green.

155. **IND18 — the model has a calendar now, and the probe's headline is a SEASONAL print.**
    - **Two numbers, not a table.** `SubUnitSpec.seasonality` carries an amplitude and a peak
      week per side, and `seasonalFactor` is one cosine:
      `1 + amplitude x cos(2*pi*(week − peakWeek)/52)`. **It averages to exactly 1.000 over a
      year on both sides — measured, all eleven goods, both columns** — so seasonality
      REDISTRIBUTES output and demand around the calendar and never creates or destroys any.
      That is what makes it seasonality rather than a growth term, and it is why no data series
      is needed to express it (rule 4).
    - **Production seasonality is the physical one**: a harvest at week 35, a building season at
      week 28. **Demand seasonality is the behavioural one**: the retail peak at weeks 48-49,
      fertiliser at week 14 for spring planting, the winter electricity load. The pairing is
      coherent without being coordinated — you buy the chemicals in spring and harvest in late
      summer, and those are two independent primitives on two different goods.
    - **The amplitude correction, and why it is not tuning.** Agriculture opened at 0.80, which
      produced a 0.22x trough. That is right for ONE CROP — nothing, then everything, then
      storage — and wrong for what this sub-unit IS: a basket of staggered plantings across a
      hemisphere. Set to 0.45 on that reasoning, not on where the print landed (rule 12).
    - **WHAT THIS DOES TO THE PROBE, and it must not be missed.** A 10-week run now samples ONE
      SEASON: weeks 1-11 sit in the agricultural trough (0.56x) and near the retail peak, and the
      week-10 headline moved −16.79% → +4.33% across this slice alone. **The number is not a
      steady state any more and never was one; it is now visibly not one.** Comparisons across
      commits are still like-for-like (same seed, same calendar start) but the level is a
      seasonal reading, and any judgement of price behaviour needs a full year (rule 12 says that
      judgement waits for the end regardless).
    - Storage is what smooths this into consumption, and IND1 already built it: a storable good
      with a real carrying cost is exactly the mechanism that carries a harvest through a year.
      **The classical inventory cycle now has a period to cycle on.**

156. **IND CLOSES, except the one slice that is a refactor.** Ten slices in one pass (§7.146-155),
    every one measured with `WEEKS=10 SHOCKS=0`, harness green at the close.
    - **What the row was actually worth was not the slices.** Three defects came out of building
      them, each invisible until a mechanism existed to expose it, and each fixed at the root:
      **(1)** contracts settled against last week's leftover stock, so a firm's own production was
      never available to its own committed orders and every contract in the economy
      under-delivered permanently — hidden because an unfilled order evaporated (§7.148);
      **(2)** `labor-market.ts` divided this week's revenue by the SEED's revenue per head, so in
      a deflation every firm read as overstaffed, `understaffedHeads` was zero for everybody, and
      **the hiring branch §7.109 built had never once fired** while the shedding branch always
      did (§7.149); **(3)** an insurer's operating cost was charged twice, once as real staff and
      premises and once as a flat fifth of premiums, because §7.125 deleted the charge and left
      the cash leg that balanced it (§7.153).
    - **The pattern across all three is one sentence, and it is worth more than the row.**
      A mechanism that binds on nothing is a mechanism that is not there (§7.146) — and the three
      ways it happens are: the thing it would bind on does not exist yet (backlog), the units are
      wrong so the condition never trips (hiring), or a cleanup removes one side of a pair and
      the other keeps running (insurer expenses). **None of the three is findable by reading the
      logic**, because in all three the logic is correct. Only a measurement finds them.
    - **What the IND battery now measures**, once per run, judged by nobody: WIP against
      production lead; the cost structure firms shed against (EBITDA/revenue, inputs/revenue,
      netPPE/revenue, the share below cost of capital); trade credit and who carries it;
      construction in progress; supplier reliability dispersion; customer deposits by cycle
      length; and the calendar. **Two structural invariants** guard the new stocks: a pipeline is
      exactly as long as its good's lead, and a backlog can grow by at most one week's obligation.
    - **Three verifies EMERGED rather than being built**, which is the sign the mechanisms are
      real and not fitted: receivables per week of sales rise monotonically with production lead
      (0.60 → 0.83 → 0.96) although the leads were set for IND10 and the terms come from credit
      quality; customer deposits land at 0.00 weeks of sales for made-on-demand goods and 1.06
      for long-cycle ones with no category list anywhere; and seasonality's annual mean is
      exactly 1.000 on both sides of all eleven seasonal goods.

157. **WHERE ELSE THE DIST TREATMENT PAYS — the sweep, from a user question, measured not
    guessed.** The test is §5-DIST's own: carry the distribution only where a decision is
    NONLINEAR in the quantity, because `E[f(x)] = f(E[x])` holds only for affine `f`. So the
    sweep is not "what is a scalar" — it is "what scalar feeds a threshold, a min/max, a default,
    or an absorbing state". Four found, ranked, all logged in §6.1.
    - **1. THE MORTGAGE BOOK'S LTV — the sharpest case in the codebase, and it is not close.**
      One average LTV per region into a severity curve that is flat at its floor below 0.75.
      Measured LTV **0.340 everywhere**, so the mechanism is inert and a constant is doing all of
      it. The convexity is the real loss: on the mean, a 15% house-price fall changes mortgage
      losses by nothing. **See §6.1 for the full measurement.**
    - **2. SME POOL CASH.** The same `cash < 0 → distress layoffs` rule is applied per firm to
      named firms and to the pool's TOTAL for segments. DIST already integrates these pools'
      default and cash stress over strata (§7.141), so one population has a distribution for its
      credit outcome and a mean for its employment outcome. **The strata already exist** — this
      is the cheapest of the four.
    - **3. THE HOUSEHOLD CREDIT TIERS — a distribution that cannot move.** The shape is already
      right (a 0.2/1.0/3.0/10.0 convexity ladder) and the SHARES are frozen, so nobody migrates
      down a tier in a downturn. **This is the interesting one for the theory**: a static
      distribution is only half the treatment. The state is not the moments, it is the moments
      AND their motion — which is exactly the Kolmogorov-forward half of the mean-field pair
      §5-DIST cites, and the half that is easy to leave out.
    - **4. COHORT CONSUMPTION AT THE BORROWING CONSTRAINT.** Cohorts DO carry employed and
      unemployed per (occupation, tier) cell — that part is right. But the cell's wage and
      benefit are SUMMED into tier income before the consumption decision, and consumption is
      nonlinear at the constraint: a person with no job and no buffer cuts to subsistence, and a
      tier average never does. The distribution is built and then collapsed one step too early.
    - **What does NOT need it, checked and cleared:** anything on the named tier (real objects,
      each crossing its own threshold), SME pool leverage/default/cash-stress (DIST did it),
      employment by occupation-and-tier cell, contract non-performance (per contract since
      §7.148), and the damper's bound instruments (per instrument).
    - **The general rule this sweep produces, and it is cheap to apply:** find every `< 0`,
      `Math.max`, `Math.min` and rating cut whose argument is an AGGREGATE, and ask what fraction
      of the population is on the other side of it. Where the aggregate sits far from the kink —
      LTV 0.34 against a kink at 0.75 — **the mechanism is not merely inaccurate, it is switched
      off**, and a floor constant will be quietly standing in for it. That is the same shape as
      §7.146 and §7.149: a mechanism that binds on nothing is a mechanism that is not there.

158. **TRIED AND REVERTED — saving as a per-tier buffer decision. The DIAGNOSIS is right and
    stands; the reduced form I reached for is wrong, and the way it failed is worth keeping.**
    - **THE DIAGNOSIS, which is not in question.** `aggregateSavingsRate` is an INPUT
      (`0.05 + inflation gap x 0.5 − confidence x 0.1 + real-rate gap x 0.4`, four coefficients),
      and `CohortBuildInputs` says what is done with it in its own doc comment: *"the anchor the
      tier cross-section is normalized to, so the aggregate saving flow is unchanged by
      construction."* The tier rates are scaled by a λ to hit that target, capped at 90% of any
      cohort's income, and whatever the cap clips is redistributed into the remaining headroom so
      the target holds anyway. **The cross-section cannot disagree with the aggregate**, which is
      top-down and the opposite of what a distribution is for. Every "derived" tier number
      downstream — §7.142's wealth MPC (`consumePropensity = 1 − tier.savingsRate`), §7.145's nine
      tables — ultimately hangs off those four coefficients. **This is real and is still owed.**
    - **WHAT I BUILT AND WHY IT BLEW UP.** A buffer-stock rule: `saving = (target buffer − liquid
      assets) / WEALTH_SPENDDOWN_YEARS`, with `target buffer = 12 weeks of the cohort's own
      income`. Measured: **GDP 0.78T → 2.1 BILLION trillion, 60 violations by week 10.**
    - **The failure is a units-of-meaning error, not an arithmetic one, and it is the interesting
      part.** `hs.depositsUSD + hs.mmfSharesUSD` is not a transaction buffer — it is the household
      sector's ENTIRE liquid wealth, and it is very much larger than twelve weeks of income. So
      every tier read as hugely ABOVE target and dissaved at an eighth of the excess per year,
      consumption exploded, and the explosion fed itself. **A buffer rule needs the buffer and the
      long-horizon savings stock to be DIFFERENT stocks**, and this model has exactly one liquid
      pool. Splitting it is a real modelling decision, not a coefficient.
    - **The general lesson, and §5-DIST-P's caveat is written from it.** A stated shape parameter
      is what STANDS IN FOR a missing mechanism. Deleting it before the mechanism exists does not
      make the model more bottom-up — **it makes it wrong, immediately and violently.** The
      aggregate savings rate is standing in for a per-tier consumption decision that needs a
      liquid/illiquid split the balance sheets do not yet carry. That split is HSG's and COH's.
    - **Kept as `git stash@{0}`** rather than deleted, so the next attempt starts from the shape
      and not from scratch. **What the next attempt needs FIRST:** a household balance sheet that
      distinguishes transaction balances from accumulated savings — at which point the buffer has
      something to be a buffer OF.

159. **DIST/HSG — the mortgage book is a cross-section, and the model can now have a mortgage
    credit event. It structurally could not before.**
    - One `avgLtv` per region fed a severity curve flat at its floor below 0.75, so
      `MORTGAGE_MIN_LOSS_SEVERITY = 0.05` was 100% of severity in every region in every week.
    - **A second error hid inside the first:** the ratio was `mortgageDebtUSD / housingStockUSD` —
      debt over the WHOLE housing stock, outright-owned homes counted as collateral. That is not a
      loan-to-value. It read **0.340**; measured against the collateral each loan was written on,
      the book's mean is **0.592**.
    - `MortgageVintage` carries principal, its collateral, the price then, its own rate and clock,
      marked to today's price. `principalUSD`/`wacAnnual`/`wamWeeks` survive as MEASUREMENTS of it
      (rule 3). The seed spread is arithmetic, not a stated distribution: every cohort lent the
      same against the same house and differs only in how much is paid off.
      `MORTGAGE_SEED_VINTAGE_COHORTS = 30` is a RESOLUTION parameter (§1.19).
    - **Measured: LTV p10 0.16, p50 0.63, p90 0.79, 16.9% above the kink. A −20% house-price move
      takes severity to 2.1x today's and −35% to 4.2x — where the one-average book says its floor
      at both**, no credit event possible short of a ~55% crash.
    - **A bug worth keeping:** the first seed scaled collateral by the REMAINING principal, pinning
      every cohort at the origination LTV forever — 156 vintages all reading 0.78, a cross-section
      with no cross-section in it. **Collateral does not amortise.**

160. **HSG — THE RATE REACHES A HOUSEHOLD NOW, BY BOTH ROUTES.** Second half of the user's
    mortgage question (§6.1), built on §7.159's vintages.
    - **THE RESET is the one that was completely missing.** A mortgage never matured and never
      repriced, so **no existing borrower was ever reached by a rate rise** — only new ones, at a
      coupon that then blended into an average. A vintage now carries `fixedForWeeks`: a 30-year
      loan on a **5-year fix**, which resets to whatever the market is then. The seed staggers the
      fix clock across cohorts, so resets arrive continuously instead of the whole book repricing
      on one day. **Measured: 17.52% of the book reprices within a year** (a fifth of a five-year
      fix, as it should be) and coupon dispersion is already forming — p10 4.79%, p90 5.54%.
    - **A reset is not only a cash-flow line: it changes who defaults.** Default FREQUENCY is now
      per vintage too, scaled by that cohort's own coupon against the market rate — what strains a
      borrower is the payment against the income, so a household paying 7% on a loan it took at 3%
      is under more strain than its neighbour. Measured off the vintage's own coupon, not stated.
    - **BORROWING CAPACITY SEES THE RATE.** Origination was `turnover x LTV x bank appetite`, with
      the mortgage rate computed on the line above and used ONLY to set the coupon: the same
      volume of houses changed hands at 3% and at 12%, and the only thing that could decline a
      household was the BANK's capital. What is constrained in reality is the PAYMENT, so capacity
      is `MORTGAGE_DSTI_LIMIT x income / annuity factor` — and the annuity factor rises with the
      rate. A buyer who cannot raise the loan does not complete, so TRANSACTIONS fall too, which
      is the borrower's half of `HOUSING_TURNOVER_RATE_ANNUAL`'s constancy.
    - **`MORTGAGE_FIXED_PERIOD_WEEKS` and `MORTGAGE_DSTI_LIMIT` are §5-DIST-P's THIRD category** —
      a product term and a lending standard. An institution chooses both; neither is a fact to
      derive, and neither is a shape parameter.
    - **HONESTLY: the affordability limit has SLACK today and that is the correct behaviour, not
      an inert mechanism.** Measured: house prices are **3.1x income** and the DSTI limit starts
      binding above **6.9x**. A 35% DSTI is supposed to have room in a cheap market and bite in an
      expensive one — that is what caps a housing boom. **This is the opposite of §7.159's floor**,
      which could not bind at any price short of a 55% crash: this one binds the moment prices
      rise, and the harness prints the threshold so the distinction stays visible. **It becomes
      live when HSG makes `medianHomePriceUSD` clear** (item 5) instead of drifting.
    - Harness green, 0 violations.

161. **DIST — POOL DISTRESS LAYOFFS INTEGRATE OVER THE STRATA. Second of §7.157's sweep targets,
    and the cheapest, because DIST had already built everything it needed.**
    - `cash < 0 → shed staff` is applied PER FIRM to the named tier, where each firm crosses its
      own threshold or does not. Applied to a POOL'S TOTAL it says something quite different —
      that either every firm in a pool sheds or none does — and it was the same code at two
      resolutions with only one of them right (rule 3).
    - **Nothing new had to be derived.** §7.143's absorbing barrier already draws the exiting
      weight from each stratum in proportion to its own `distressOf` — a coverage term plus a cash
      term. The employment side now reads the same integral, published once as
      `SmePool.distressedFirmShare` rather than rebuilt in the labour stage.
    - **Bounded at 1 because it is a SHARE OF FIRMS** — a definitional bound, not a behavioural
      one (rule 2). `distressOf` sums two terms, so a stratum failing on both exceeds 1, and no
      more of a pool than all of it can be in trouble.
    - **The pool running out of money is kept as a separate, acute case, because it is a different
      statement**: the strata are firms that cannot service DEBT; a negative pool balance is a
      pool that cannot make PAYROLL.
    - **Measured, and it is the Jensen gap in one line: 19 of 64 pools are SOLVENT IN AGGREGATE
      but have distressed strata** — those layoffs could not happen at any pool cash level before.
      Only **2** pools have negative aggregate cash, which is all the old rule could ever see.
      Distressed share p50 0.00 but p90 0.58-0.76: the top decile of pools has most of its firms
      in trouble while the average pool has none. Week-10 unemployment 27.2% → 28.2%, which is
      the sheds that were previously financed by nothing. Harness green.

162. **DIST/CRD — THREE ONE-WAY RATCHETS IN THE CREDIT TIERS, AND MY OWN DIAGNOSIS OF THEM WAS
    WRONG FIRST.**
    - **THE CORRECTION, and it comes first because it is the lesson.** §7.157's sweep logged this
      as "the distribution exists and cannot move — `shareOfHouseholds` is stated and never
      changes". **That is false.** `evolution.ts` migrates the shares every week. I read the four
      seed values in `evolution.ts:143-146`, saw stated numbers, and concluded frozen **without
      reading the evolution path forty lines below**. That is exactly §7.126's mistake — logging
      from the SHAPE of the code without measuring — **repeated in the same session that recorded
      it as a lesson.** A seed value is not evidence about a mechanism.
    - **What was actually wrong is worse than what I claimed.** Three ONE-WAY RATCHETS:
      1. **Migration only ever went DOWN.** `shiftFraction = Math.max(0, stress x 1.5)` moved
         households down whenever unemployment was above NAIRU and did nothing otherwise —
         never up. **Nobody ever recovered a credit tier**, so any long run ends with the entire
         population in SUBPRIME. The same defect shape as a household that can buy equity and
         never sell it: an absorbing direction with no return.
      2. **Delinquency only ever ACCUMULATED.** `delinquency + tierStress x multiplier` weekly,
         with `tierStress` positive throughout any slack economy — unbounded, no way back. Arrears
         CURE: a borrower catches up, or the loan is written off and leaves the book, and both
         remove it from the stock.
      3. **The tier's interest rate only ever ACCUMULATED**, `rate + creditConditionsIndex x k`
         every week with no anchor — so a sustained squeeze compounded a household lending rate
         to anything at all. It was also a SECOND representation of household credit pricing
         (rule 3): `quoteHouseholdMarginBps` already prices exactly this for the banks' own pools.
    - **The fixes.** Migration is now a two-sided balance: the delinquent share of a tier drops a
      rung, and a clean file ages its blemish off and climbs one — `CREDIT_FILE_CURE_WEEKLY`, an
      institutional primitive (credit-reporting periods are statutory, §5-DIST-P's third
      category), replacing two stated coefficients on an aggregate. Delinquency decays on the same
      clock it arrives on. The tier rate is QUOTED from that tier's own measured loss rate plus
      capital and cost to serve — one price, from one place (rules 1 and 3).
    - **Measured at week 10: shares sum to exactly 100.00% in all four regions** — the two-way
      balance conserves the population, which the one-way version could not have done. Delinquency
      is a real ladder now (SP 0.82%, P 2.56%, NP 6.98%, SUB 13.89%) and bounded rather than
      climbing; quoted rates run SP 10.61% to SUB 23.68% off those measured losses. Harness green.

163. **MEASURED: HOUSEHOLD LIQUIDITY IS 23.7 WEEKS OF COMMITTED OUTFLOW — which CONTRADICTS the
    cause §7.158 recorded for its own failure. That record was a story, not a diagnosis.**
    - §7.158 said the buffer rule blew up because "deposits are the sector's ENTIRE liquid wealth
      and very much larger than twelve weeks of income, so every tier read as far above target and
      dissaved". **The arithmetic does not support that.** Measured: liquid assets cover **23.7
      weeks** of committed outflow (debt service plus consumption) in the USA, 22.9-24.0 across
      all four regions. Against a 12-week target spent down over 8 years, the implied dissaving is
      on the order of **3-4% of income** — nowhere near enough to take GDP to 2.1 billion trillion.
      **That figure is an overflow signature, not a savings rate.** The real cause is elsewhere and
      is NOT established.
    - **So the stash must be re-diagnosed, not trusted**, and §7.158's stated cause is withdrawn.
      Its DIAGNOSIS of the top-down structure stands untouched — the λ normalisation, the cap, the
      redistribution and the four coefficients are all still there and still wrong. What is
      withdrawn is my explanation of why my replacement broke.
    - **TWICE IN ONE SESSION, and that is the finding worth keeping.** §7.162 recorded logging a
      defect from the SHAPE of the code without reading the evolution path. This is the same error
      in a different costume: explaining a failure from a plausible story without checking whether
      the numbers could produce it. **A cause is not established until it is measured**, and a
      confident write-up makes a wrong cause harder to dislodge than no write-up at all.
    - **What this unblocks.** 23.7 weeks is a SANE buffer level, so a threshold on household
      liquidity CAN be crossed — a shock that cuts income for a few months reaches it. Forced
      selling (§6.1's household-equity row) is therefore NOT blocked on a liquid/illiquid split as
      §7.158 assumed. **It is blocked on dissaving being possible at all**: cohort saving is
      `disp x tierRate x lambda` under a `Math.max(0, ...)`, so no tier can ever dissave — a
      FOURTH one-way ratchet, next to §7.162's three. The chain is: make saving two-sided, then
      the drawdown is real, then forced selling has something to trigger on.

164. **THE 2026-08-30 RESCOPE — the work order was ordered around two NUMBERS, and rule 18 now
    forbids that.** User directive: *"priority is always model updates, not market measure fix."*
    - **What changed, and the evidence for it.** MAC ("close the inflation escape") and EMP ("the
      labour collapse") were items 1 and 2 — a foundation tier scoped around statistics that
      looked wrong. Across §7.146-163 the week-10 price print moved **−25.5% → +4.3%** and
      unemployment stopped rising monotonically, and **not one of those changes targeted either
      number.** The largest single move came from a UNIT ERROR in the labour stage (§7.149) that
      no amount of staring at an inflation series would have found. Both rows are now CONSEQUENCE
      rows below the mechanism tier, and **MAC's evidence is void: it was measured before ten IND
      slices, three root-cause fixes and a calendar, and may not be inherited.** EMP has no build
      left in it at all — what remains is a criterion, which belongs to S-final.
    - **The new foundation tier is ordered by which MECHANISM is missing:** 1 DIST (largest live
      row, half delivered, owns the fourth one-way ratchet), 2 CAP (holds IND13's two measured
      defects), 3 COH (the spendable/accumulated split the savings rework needs), 4 DEM (its age
      structure is what makes a steady-state savings rate an outcome). HSG and CRD are promoted
      into the markets tier at 5 and 6 because both were substantially advanced this session and
      both are pure mechanism.
    - **Rule 18 is the third of a family and the distinction is worth keeping.** Rule 10: do not
      chase a MOVED number. Rule 12: do not MEASURE mid-project. Rule 18: do not SCHEDULE around a
      number at all. The first two govern behaviour inside a project; the third governs what a
      project IS.
    - **Also brought up to date:** §1.10 records that a 10-week probe now samples ONE SEASON since
      IND18, so the headline print is seasonal and price behaviour is judged on whole years only;
      §6.1's four closed rows are compacted to one line pointing at §7 rather than duplicating it
      (rule 11); §5's MAC/EMP/IND/CAP/DEM/DIST/COH/CRD/HSG headers carry their real state; and the
      §5-DIST-P primitive scoreboard retires the two entries this session actually retired.
    - **The rescope did not change any code.** It changed which code gets written next.

165. **DIST 1(a) — THE SAVINGS RATE IS AN OUTCOME, AND THE CAUSE OF THE EARLIER FAILURE WAS A
    UNITS ERROR. Neither story I told about it was right.**
    - **THE RE-DIAGNOSIS FIRST, since §7.163 required one.** §7.158 blamed "deposits are the
      sector's entire liquid wealth, much larger than a twelve-week buffer, so every tier
      dissaved". §7.163 withdrew that on arithmetic. Re-running the stash under measurement, the
      savings rate printed **−4,251,491,541,453%** and GDP was already broken **at week 1**,
      before anything could compound — so it was never a feedback loop either, which was my
      second guess. **The cause is one line:** `tierLiquidShare` fell back to
      `wealthDistribution[t].shareOfIncomeUSD`, **which is a DOLLAR AMOUNT** (it holds
      `tierDisposableUSD[t]`, seeded as `inc x 0.15`) **used as a fraction.** A 346B liquid stock
      multiplied by a 1.5e11 "share". Normalising it fixes everything: the rate lands at
      **−2.67%**, which is exactly the 3-4% §7.163's arithmetic predicted.
    - **THREE STORIES BEFORE ONE MEASUREMENT, and that is the lesson worth more than the fix.**
      A wrong cause, confidently written up, is harder to dislodge than no write-up: §7.158's
      story survived two sessions and shaped a task list. **The units error was findable in
      thirty seconds by printing the number.** It is also the §7.149 family again — a name that
      says USD is not a share, which is rule 9's principle one type over.
    - **What is now gone:** the four coefficients that set `aggregateSavingsRate`, the λ that
      scaled tier rates to hit it, `SAVINGS_CAP_SHARE = 0.9`, and the two-pass redistribution that
      existed to make the cap not break the identity. **Each tier decides saving against its own
      buffer and its own measured liquid assets; the aggregate rate is `Σ saving / Σ income`.**
    - **The policy rate moved to where it belongs.** It used to be a coefficient on the aggregate.
      It is now the two real things a rate does to a household budget, both already per tier: it
      raises DEBT SERVICE for the indebted and DEPOSIT INTEREST for savers. A distributional
      transmission instead of a scalar one, running the right way round for each tier.
    - **The harness identity was inverted with it.** The old check asserted cohort savings hit the
      aggregate's target — a test that λ had forced the parts to match an imposed whole, carrying
      `Math.max(0, savingsRate)` because a rate that could not go negative was the point. It now
      asserts the published rate IS what the cohorts add up to, signed.
    - **Measured: −3.1% to −3.4% across the four regions at week 10, harness green, 0 violations.**
      The sector is above its buffer (21-22 weeks of cover against a 12-week target) and spending
      the excess down, so the rate is negative and heading toward zero as the stock falls. **A
      zero steady-state rate is the buffer-stock result and is only correct in a STATIONARY
      economy** — a positive one needs a life-cycle, which is DEM's age structure (§5-DIST-P).
      That is the next thing this row needs, and it is now the only thing between here and a
      savings rate that is fully an outcome.
    - **It unblocks forced selling** (§6.1): a tier can dissave, so a drawdown is real, so there is
      something for a liquidation threshold to trigger on.

166. **DIST — HOUSEHOLDS CAN SELL. The mechanism is built, two-sided and correct; it currently
    reaches nothing, and BOTH reasons are worth more than the code.**
    - `etf-flows.ts`'s household leg was `Math.max(0, saving x equityShare)` with no household term
      in `grossRedeemUSD` anywhere: a household could buy funds or not buy funds. Unemployment
      could only ever SLOW purchases, never force a sale, so a drawdown had no household seller in
      it — the amplifier that makes one self-reinforcing.
    - **The ordering is the mechanism, not the trigger.** A household with a shortfall does not
      sell; it runs its cash down first and sells only what its deposits cannot cover, above the
      buffer it wants on hand — **the same `BUFFER_TARGET_WEEKS` the saving decision is taken
      against, because it is the same buffer** (rule 3). That is why forced selling is rare, and
      why it is violent when it comes: every buffer empties at once, near the bottom. A redemption
      now lands in `grossRedeemUSD` like an institution's, so it reaches the fund's own basket and
      the prices in it, and it settles on the household books both ways — a redemption that
      credited no deposits and retired no shares would be money from nowhere.
    - **MEASURED, AND IT REACHES $0.0B OF $985B.** Two structural reasons, and neither is this
      slice's to fix:
      **(a) Only fund shares are sellable.** Household direct equity and private business are
      computed as RESIDUALS — the household's share is whatever the institutions do not hold — so
      most of that $985B is not a position at all and cannot be sold at any price. **Owner: the
      ownership register.** A holding that cannot be sold is not a holding (rule 13's shape).
      **(b) Households hold no fund shares**, because since §7.165 the sector sits permanently
      above its 12-week buffer (21 weeks of cover) and therefore permanently dissaves, so it never
      buys any. **This traces straight to the missing life-cycle** — §5-DIST-P said a positive
      steady-state savings rate needs one, and DEM's age structure (item 4) is it.
    - **The harness prints both distances** — weeks until the threshold (416 today) and how much is
      sellable — so "not firing" stays an observation about CONDITIONS. That discipline is the
      one this project keeps needing: §7.146, §7.149 and §7.159 were all mechanisms that existed
      and bound on nothing, and none was visible without printing the number.

167. **CAP — MAINTENANCE CAPEX WAS DERIVED FROM ITS OWN PRIOR VALUE, and the ±2%/week capacity
    clamp was covering for it.** Both of IND13's measured defects (§6.1), one cause.
    - **The self-reference.** `targetMaintenanceCapex = newRevenue x (comp.maintenanceCapex /
      comp.annualRevenue)` — the target computed from the current value, an EMA of itself with no
      anchor to what maintenance capex is FOR. Whatever it was seeded at is what it stayed, and
      nothing in the loop could ever notice the plant wearing out.
    - **The anchor is depreciation, because that is what maintenance capex IS**: the spend that
      keeps the capital stock whole as it wears out. `grossPPE / usefulLifeYears`, the same
      arithmetic the depreciation line already runs, off the firm's own books. **No new number.**
    - **And the clamp goes with it (rule 2).** `±2%/week` on capacity growth bounded an OUTCOME: a
      firm that had just commissioned a plant twice its size still grew 2%, and one whose capital
      had evaporated still shrank only 2%. It was doing the work the investment decision should
      do — and that decision was broken underneath it, so net investment was permanently and
      invisibly negative. **A clamp is almost always covering for a decision that is not being
      taken; delete the clamp only after the decision is real** (§6.4's discipline, and this is a
      clean instance of it).
    - **Measured: capex 0.64x-0.89x of depreciation and still converging** (the maintenance figure
      is a 5%/week EMA, so a 10-week probe shows about 40% of the move). Harness green.
    - **AND THE FIX EXPOSED A BIGGER ONE, which is why it is logged and not chased here.** Firms
      BID their real capex into the auction, and the five capex basket weights sum to 1 — so the
      bids ARE the capex figure, **~163B/yr globally against ~13B/yr of deliveries, an 8% fill.**
      The plant is not shrinking because firms will not invest. **It is shrinking because nobody
      can make the machines.** That is a supply-side row (§6.1), it is the same family as CHAIN's
      demand-seed finding, and the next step on it is a per-category fill rate.

168. **CAP — WHERE THE CAPEX BIDS DIE: four of five capital-goods categories are short, and the
    sector was built for two thirds of what it is asked for.** The per-category measurement
    §7.167 called for.
    - **Measured (USA, week 10):** heavy_equipment **0.26x** supplied/demanded at a price **65%**
      over base; enterprise_software **0.29x** at **+174%**; industrial_automation 0.43x;
      commercial_construction 0.62x; commercial_fleet 0.91x. **The price mechanism is working** —
      scarcity is being rationed by price exactly as rule 1 wants. What is not working is supply.
    - **THE RULE-3 DEFECT, and it is the one to fix: investment is represented TWICE.** The capex
      industries were sized from the seed's demand solve for **54.0B/yr**; the firms bid their own
      capex off their own books at **83.6B/yr** — **1.55x what was built**, and wider still
      because those industries also serve households and government. A sector built to supply one
      number and asked for another will be short from week 1 whatever its dynamics do.
      **The fix is the same shape as every other rule-3 fix: one number.** The capex categories'
      demand IS Σ firm capex. It carries a genuine FIXED POINT — firms are generated from category
      demand, so their capex depends on the thing it would now set — which makes it a bounded seed
      project rather than an edit, and it belongs with BP/CHAIN's seed work.
    - **The second cause is NOT a defect and should not be chased.** §7's shortage-capex response
      exists and fires correctly: a 0.26x fill gives `demanded/supplied − 1 = 2.85`, so a producer
      wants **2x** its growth capex. But **a capital-goods maker needs capital goods to expand**,
      so the response is self-limiting and slow. That is real economics, not a bug, and a 10-week
      probe cannot show a sector doubling. **Do not read the fill rate as a broken mechanism.**
    - **Note what this does to §7.167's own fix.** Anchoring maintenance capex to depreciation
      RAISED the bids, so it widened the 1.55x gap. That is correct — the demand is now honest and
      the supply side's inconsistency is exposed rather than hidden by an understated ask.

169. **DEM — THE AGE STRUCTURE IS ALREADY THERE AND NOTHING READS IT; and the life-cycle saving
    rate should be DERIVED, not the stated one sitting next to it.**
    - `lifeCycleDistribution` carries `EARLY_CAREER | PEAK_EARNING | PRE_RETIREMENT | RETIRED`,
      each with `shareOfPopulation`, `savingsRate` and `consumptionMultiplier`. **Only
      `RETIRED.shareOfPopulation` is read anywhere, and only to set a death rate.**
      `LifeCycleStageData.savingsRate` is read by NOTHING. **Fifth instance this session of a
      mechanism that exists and binds on nothing** (§7.146, §7.149, §7.159, §7.167, this).
    - **DO NOT JUST WIRE THE STATED RATES IN.** They are shape parameters of exactly the kind
      §5-DIST-P says must die, and §7.165 has only just deleted the aggregate ones. Wiring four
      stated per-stage rates into the decision would put back what was removed, one level down.
    - **THE DERIVATION, and it has no free parameter at all.** A household saves to fund the years
      it will not earn. If a share `w` of adult life is spent working and `r` retired, and
      consumption is smooth across both, then the saving rate during working life is exactly
      `r / (w + r)` — **and since `w + r = 1` across the population, the required working-life
      saving rate IS the retired share of the population.** The model already carries that share
      and already evolves it from real births and deaths. So: **working cohorts save `r` of
      income; retired cohorts draw down.** Nothing is stated; the four `savingsRate` fields are
      deleted rather than read.
    - **Why this is the unblocker for three other things.** It makes a POSITIVE steady-state
      savings rate an outcome (§7.165 leaves the sector permanently dissaving because a buffer
      rule alone has no motive that survives a stationary economy); a positive rate lets
      households ACCUMULATE fund shares; and only then does §7.166's forced selling have anything
      to reach. It is also COH2's stated prerequisite — "a cohort has an age via DEM".
    - **The one real piece of work** is that cohorts are keyed `(occupation x wealth tier)` with no
      age dimension, so the life-cycle currently has nowhere per-cohort to land. Either add age to
      the cohort key — which multiplies the cross-section — or apply the term at the region level
      and allocate it by income. **Settle that before building**; and watch for double-counting
      against the pension contribution and benefit flows, which already move real money between
      working and retired households.

170. **RULE 19, FIRST PASS — 16 stated shape parameters retired, none replaced.** The count is the
    measure of how much mechanism is missing, so this is the score moving: **~90 → ~74.**
    - **8 deleted outright: `LifeCycleStageData.savingsRate` and `consumptionMultiplier`.** Four
      stages' worth of stated saving and consumption behaviour, **read by nothing** (§7.169) —
      only `RETIRED.shareOfPopulation` was ever used, and only to set a death rate. Wiring them in
      would have restored one level down exactly what §7.165 removed at the aggregate. **A stated
      number no mechanism needs is not a primitive, it is a leftover.**
    - **4 derived: `TIER_DEBT_SERVICE_WEIGHT`.** It carried its own exit condition — *"a stated
      primitive until HH4c gives cohorts their own balance sheets and the split derives."* §7.145
      gave them balance sheets, and `household-balance-sheet.ts` **had been computing each tier's
      debt and throwing it away ever since.** Debt service follows DEBT: a tier's share of what
      the sector owes is its share of what the sector pays to service it. Arithmetic, not a table.
    - **4 derived: `TIER_RESIDUAL_RECEIPT_WEIGHT`.** Its stated justification was
      "institutional-claim incidence" — and the claim is measured per tier now, so the incidence
      IS the claim. Same pattern: the number to use was already being computed and discarded.
    - **The pattern worth keeping: two of the three were already derivable and nobody had looked.**
      The balance sheets §7.145 built have been publishing the exact splits these tables state,
      for as long as they have existed. **When a stated table has an exit condition written on it,
      check whether the condition has already been met** — this one had, and the table outlived it.
    - Both fall back to income share only before any balance sheet has accumulated (§7.4).
      Harness green, 0 violations.
