# MASTER PLAN — Single Source of Truth

This is the **only** planning/instructions document in the repository. It replaces and absorbs
the former `ARCHITECTURE.md`, `CODEBASE_AUDIT.md`, `ONE_DOLLAR_PROJECT.md`,
`PROJECT_WALL_STREET.md`, `PROJECT_MAIN_STREET.md`, `PROJECT_BLUEPRINT.md`, and
`PROJECT_AURORA.md` (all deleted; their full history lives in git). It contains:

- §1 The rules of engagement (standing directives — read before touching anything)
- §2 Codebase map (what every file is)
- §3 Current state: what is genuinely real vs. still formula-driven
- §4 **The global work order** (what to do, in what sequence, and why)
- §5 Detailed work instructions, one section per work item (where the code goes, how to
  structure the logic, how to verify)
- §6 Bug backlog appendix (small/medium findings to batch)
- §7 Record of completed work and hard-won lessons (do not re-learn these)

**How to work through this file:** take the next unfinished item in §4's order, read its §5
section, implement it exactly where §5 says, run the verification ladder (§1.10), commit it as
one bounded change with a message naming the item, then return to §4. Never start an item
whose listed prerequisites aren't done.

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
4. **No real-world data.** No real tickers, company names, observed market prices, or copied
   spread tables. Everything is generated from internal primitives (productivity, inflation
   target, cost-of-production, Gordon growth, geometric rating-spread progression, etc.).
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

### 1.10 Verification ladder (every work item)

```
npm run lint                       # tsc --noEmit
bash scripts/check-hygiene.sh      # no root-level scratch files
<short scratchpad diagnostic>      # 5-week smoke minimum; 60-week revenue-ratio
                                   # diagnostic for anything touching revenue/cash;
                                   # targeted trace for the subsystem changed
npm run verify                     # ONLY at end of a whole project (260 weeks)
```

Scratch scripts live in the session scratchpad, never in the repo. Delete all debug
`console.log` blocks before committing (this has been missed before — grep for
`DEBUG` and `console.log` in `src/engine/` before every commit).

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
| 05 | `05-unit-bidding.ts` | THE real goods auction: named bids/offers, pro-rata clearing, contracts, per-lot settlement (northwest-corner), capex bids |
| 06 | `06-fx-and-trade.ts` | FX evolution + trade flows (still formula — see §5-WS9) |
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
`call-protection.ts` (what it costs to retire paper early — soft call, non-call schedules and
make-whole, and the ONE dealer spread both 07b and the make-whole read), `indexes.ts` (index
definitions as RULES — membership, weighting, rebalance calendar), `etf.ts` (fund shape, fee
schedule, AP capacity, the research-capacity primitive behind who indexes).

### 2.4 UI (`src/components/`) and invariants

UI reads `GameState` only. Several components still contain second price-setters/fabricated
numbers — see §5-G and §6. Invariants harness: `scripts/invariants.ts` via `npm run verify`
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

**Genuinely bottom-up today** (post "1$ is 1$", at rest): category demand → input-output →
stage 05's real auctions with named counterparties, per-lot input provenance, real settled
sales anchoring revenue, capex as real bids, private sector as a real participant *in the goods
market*, commodities linked to real producer companies, per-bank balance sheets + real CB
facilities, real gov tranche issuance, the measured CPI, the national-accounts identity, the
single-owner sovereign curve, the 07b/07c/07d clearing markets — which since §7.16 price
from real demand schedules rather than quantity targets — the primary market that brings new
paper into those same books (WS8), itemized bank lending and endogenous money (G2), and the
private sector's lifecycle: sponsors calling real LP capital, buying at the multiple the public
market clears and marking at that same multiple (§7.41).

**Still formula-driven** (each is a §4 work item, in that order): **the household sector**, which
is modelled an order of magnitude more thinly than the corporate one — 4 regional aggregates
against 2,004 named firms, a top-down income anchor instead of an income statement, consumer debt
itemized to nobody, and 740B of institutional liabilities that are households' assets with no
holder (HH, §7.48); **the public sector** — the government books no interest on its own debt and
the central bank is a scalar (PUB); the industry taxonomy (BP1); the dual dealer system (G3);
**every non-financial corporate's operating model**, which is one model with four sector
coefficients on it — storable output for everyone including software, one COGS decomposition, and
revenue only on settled unit sales, so no subscription, backlog or royalty business exists (IND,
§7.50); derivatives, commodity futures and hedging incl. implied vol (DER); default resolution and
recovery (G5); and FX (WS9).

**Real but structurally undersupplied** — a category worth naming separately, because these are
not formulas and they still produce wrong prices. The clearing markets are honest mechanisms
running on an asset universe that does not match the money pointed at it: institutional
corporate-credit appetite ran **~6x the corporate credit that existed** (§7.18). HC Wave 1 took
that to 3.8x by making the hidden sector's debt real and ownable (§7.33), and S11 gave entities
the budget constraint they never had (§7.21); the residual closes through the §6 segment-debt
primitive, G2's bank book and HH1's liability inflows. The lesson stands on its own: a correct
auction over a short float still gives a wrong price, and no work inside the auction fixes it.

---

## 4. THE GLOBAL WORK ORDER

Ordered **foundational → features**. A tier is built on the one above it; nothing lower is a
prerequisite for anything higher. Work top to bottom within a tier.

Every item in the old §6 bug backlog now has an owner and lives inside the project that closes
it. What remains in §6 is only what no project owns: live defects with a named next action, and
metrics to watch rather than work.

| # | Tier | Project | Prereqs |
|---|---|---|---|
| — | standing | **P1 — Periodicity & units sweep** (alongside anything) | none |
| ✓ | foundation | ~~**L — Ledger integrity batch**~~ *(CLOSED §7.46)* | — |
| ✓ | foundation | ~~**HH — The household sector, to corporate depth**~~ *(CLOSED §7.60)* | — |
| 2 | foundation | **BP1 — One industry registry** | none |
| 3 | foundation | **IND — Industry operating models** (every corporate is currently the same firm) | BP1 |
| ✓ | foundation | ~~**PUB — The public sector: treasury + central bank**~~ *(CLOSED §7.68)* — leaves one named follow-up: the spending PATH is still a formula while revenue is bottom-up (§6) | HH (household taxes) |
| 5 | foundation | **DEM — Demographic variability** (small; rides beside HH4–HH5) | none |
| 6 | markets | **G3 — One dealer system** | none (S9 done) |
| 7 | markets | **DER — Derivatives and the people who hedge with them** | G3 |
| 8 | markets | **G5 — Default resolution: recovery as an outcome** | none (G2 done) |
| 9 | markets | **WS9 — Real trade & FX** | premise confirmation from the user |
| 10 | markets | **XB — Cross-border portfolios** (foreign shares & bonds, hedged) | WS9, DER |
| 11 | depth | **CAL — Payment calendars** | none |
| 12 | depth | **ETF2 — A real price for ETF shares** | G3 |
| 13 | depth | **HC3b — The product-market handover** | BP1 |
| 14 | depth | **SCALE — Universe scale-up under a wall-clock budget** | profiling first (rule: measure) |
| 15 | last | **S-final — Validation gate** | everything above |
| 16 | last | **AU — Aurora, the UI rebuild** | everything above |

**What changed in the 2026-08-28 reordering** (superseded in part by HH's merge above). Six
projects merged into three: commodity futures (ex-G7)
and corporate/bank hedging (ex-WS11) are slices of derivatives (ex-G4), because both are its
users and neither is a market of its own; the central bank (ex-G9), government fiscal (ex-BP5)
and government debt service (ex-S4r) are one balance sheet each way and became **PUB**, since
remittances are the loop that closes between them and neither half is honest alone. Blueprint
split: its registry is foundational and leads, its industry detail is depth and follows. The
sentiment remainder (ex-G8) was an hour of dead-code deletion, not a project, and folded into
**L**.

**Why this order.** The macro root causes are done (§7.9–§7.11, §7.16) and so are the markets
that price real instruments (WS4–WS8, G2, HC, ETF). What is left at the base is not a missing
market — it is that two of the three sectors any economy has are still fictional in ways the
markets above them cannot see.

**The household sector is modelled an order of magnitude more thinly than the corporate one**, and
the asymmetry is measurable (§7.48): 2,004 named companies against 4 regional aggregates; a real
income statement anchored to settled sales against a top-down income anchor; the S5 cash ledger
against formula deltas; 82 itemized corporate loans on named banks' books against a 140B consumer
book itemized to nobody. G2 gave corporate borrowers real lenders and left household borrowers an
aggregate — the same project, half built. And the government **books no interest on its own debt
at all**. Every market above these two prices correctly against a demand side that is, in those
places, made up.

**And every non-financial corporate is the same firm.** Four coefficients vary by sector —
pricing power, PP&E intensity and life, wage sensitivity — plus input recipes by category. Those
are coefficients on ONE operating model, not different models. Every company produces storable
units into stage 05's auction, holds output inventory decaying at a hardcoded 2%, books revenue
only on settled unit sales, and runs one COGS decomposition. **Measured: enterprise software sits
in physical inventory — 159 units worth 5.9M, spoiling like steel** (§7.50). There is no
subscription, backlog, deferred or royalty revenue anywhere in the model; a firm with 90% gross
margins and no warehouse is not expressible. The one sector done properly is financials, where
`financialStatementProfile` gives banks, insurers and asset managers genuinely different P&L
paths — so the model already knows operating models differ and applies that knowledge to exactly
one sector. That is **IND**, widened from financial policy to operating models and moved to the
foundation behind its registry.

**Why G6 was absorbed rather than kept.** "Institutional liabilities" and "households become real"
are ONE project seen from two ends: the claim linking a household to a pension fund is
simultaneously the fund's liability and the household's asset. Keeping them as separate items
guaranteed that building either alone would leave a gap to be named — which is exactly what
happened in MS1, and the 740B it left unattributed (§7.48) is the measure of the mistake. They are
now one item, **HH**, at the front.

**Hidden Corporates and ETFs are closed** (§7.33, §7.41, §7.44). Do not reorder without asking.

---

## 5. Detailed work instructions

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

### L — Ledger integrity batch  *(CLOSED — §7.46)*

Seven items, six of them real defects and now fixed: the redemption cash leg, the unmarked
CP-failure revolver, the phantom private share register, the book-value P/B price on banks and
institutions, the dead sentiment field, and the earnings desk private firms were given at
generation. The seventh did not reproduce and produced PUB1b instead. Harness 5 → 4 violations.

### HH — The household sector, to corporate depth  *(Tier 1, item 1; absorbs the old MS and G6)*

*Naming note: §7 records written before 2026-08-28 call the institutional-liability half **G6**
and the household half **MS**. Those entries are history and are left as written; both now live
here.*

**The case for this being first, in one table.** The two sectors are not modelled at the same
depth, and nothing above them can be more honest than the demand side it prices against.

| | Corporates | Households |
|---|---|---|
| Named entities | 2,004 | 4 regional aggregates |
| Income statement | real, anchored to settled stage-05 sales | `estimatedHouseholdIncomeUSD`, a top-down anchor |
| Cash | S5 ledger, every flow labelled | formula deltas |
| Debt | 82 itemized loans on named banks + tranches with maturities, coupons, call protection | a 140B consumer book itemized to NOBODY; paydown-rate constants |
| Cleared markets | 4 | 0 |
| Default | real, on cash exhaustion | none |

G2 gave corporate borrowers real lenders and left household borrowers an aggregate. Same project,
half built.

**MS1 is done** (§7.47): household equity is real claims — index-fund shares through the AP
mechanism, the listed float institutions do not hold, founder stakes in the private tier — plus
one named gap. What follows is the rest, and the FIRST slice is the one MS1's gap exposed.

**HH1 — The claims that link households to institutions.** *(absorbs G6; do this first)*
Measured (§7.48): insurers hold 495B of assets against 40B of their own equity, pension funds 146B
against 17B, asset managers 188B against 31B. **740B is a liability to somebody and nobody holds
the claim.** Those are policyholder reserves, pension entitlements and fund shares, and in reality
every dollar of them is a household asset. The asset exists in this model and the claim does not —
a rule-3 violation at 740B, and 46% of the gap MS1 had to name.

Both sides close together, because they are one thing:
- **Insurers:** premiums as a real expense line on companies and households; stochastic claims
  scaled by real events; technical reserves = expected claims, held AS a household asset; the
  liability duration is the reserve duration.
- **Pensions:** contributions as a real slice of wages, benefits from a cohort table, entitlements
  on the household balance sheet; the funded ratio is real and drives risk appetite the way it
  actually does — underfunded funds reach for return, fully-funded funds derisk into bonds.
- **Asset managers:** fund shares held by the households whose money it is.
- **Then derive and retire the constants:** each entity's required return becomes its real
  liability cost and its duration need its real liability duration, so
  `REQUIRED_RETURN_ON_CAPITAL` and `INSTITUTIONAL_REAL_RETURN_BPS` become measured properties.
  Demand curves stop being parallel because balance sheets genuinely differ.
- **Also here: PE fundraising.** A sponsor calls its commitments, deploys them and stops forever —
  undrawn capital runs 13.6B → 0.25B by week 90 and deal flow ends (§7.41). Real LPs size a new
  vintage from their own allocation, which is a real decision only once their liabilities are.

**HH1b — One institution, not two.** *(scope discovered while building HH1a — §7.49)*
The Company shell and the InstitutionalEntity that share an `id` are the same firm and do not
agree. An insurer reports 0.05B of revenue and 0.10B of market cap against an entity holding
241.4B; its `technicalReservesUSD` prints 0.2B against a 221.9B beneficiary liability. The insurer
branch of stage 08 explicitly refuses to read the entity, on a comment that predates S11 making
`totalAssetsUSD` a real per-firm marked book — the asset-manager branch beside it already reads it
and says so. Pension funds and hedge funds fall through to the generic consumer-revenue path.
- Insurer float, premiums, claims and reserves come from the entity's real book, and
  `technicalReservesUSD` becomes the beneficiary liability rather than a second version of it.
- (Pension and hedge funds already read their entity's book via the `ASSET_MANAGER` profile —
  an earlier draft of this section wrongly said they did not.)
- **The constants: two retired, two kept honestly (§7.52).** An insurer's hurdle is now its real
  COST OF FLOAT and a pension fund's its real FUNDING NEED. An asset manager's, a hedge fund's and
  a sponsor's are not liability costs and stay stated — there is nothing there to measure, and
  deriving them anyway would be a formula wearing a derivation's clothes.
  `INSTITUTIONAL_REAL_RETURN_BPS` in 07c is still stated and still owed.
- This also repairs what L4 exposed: institutions clear in 07e now, and until their P&L is their
  real book they are priced on a shell.

**HH1c — DONE (§7.52).** The liability flows are real and two of the four required-return
constants are derived from them. What is NOT yet real, and is the honest next step for insurance:
**claims are allocated in proportion to premiums**, which is right in aggregate and wrong in the
way that matters — real claims are LUMPY, and the entire economic point of insurance is that the
loss lands on one firm and the pool absorbs it. A claim against a real loss event needs a loss
model; **G5**'s estates and the existing weather anomalies are the natural hooks. Until then this
moves real money on a real schedule without yet transferring real risk.

**HH2 — DONE (§7.53).** The house is on the balance sheet, computed from physical units, and net
worth went 1,543B → 4,730B (1.5x → 4.61x income). It also exposed a units error in the wealth
effect that had been hiding behind a small ratio. Original scope, for the record: households carry
**1,061B of mortgage debt and own no house**: a balance sheet with the liability and not the asset. The model already has median home
prices, a baseline, a price index and a 62% ownership rate — the housing stock is computable
today. Home equity then responds to real prices, and the wealth effect finally has its largest
real component. (Housing is the biggest asset most households own; leaving it out while carrying
its mortgage biases net worth in one direction by construction.)

**HH3 — DONE (§7.55).** Household debt is itemized mortgage / card / term pools on the named
banks' books; the household lines are their derived sums; the paydown constants died into
annuity arithmetic and the `bankedConsumerDebtShare` target died outright. The consumer-loan
target boundary flow is closed; **it also resolved #67** (bank capital rises 11.6% → 14.7%
through week 80 instead of collapsing) and gave the household sector its rate response (card and
term books SHRINK when policy tightens). What it did NOT close: the deposit side — the banks'
"household deposits" funding line (790B USA at seed, the balancing item) and the household
state's own `depositsUSD` (372B) are still two representations, the gap being really unmodeled
wholesale funding; and debt service is still paid from unmodeled income. Both are HH4's, which
gives households the budget the payments come out of.

**HH4 — Households as cohorts.** ~20 per region (occupation x wealth tier), not 300M
individuals. **HH4a — DONE (§7.56):** the cohorts exist and are the SOURCE of the household
cross-section — 14 real occupation x tier cells per region, wage bills split by within-occupation
tier multipliers (occupation bills preserved exactly), progressive taxes renormalized to the flat
aggregate rate to the dollar, means-tested transfers, capital income allocated by tier equity
exposure, the savings cross-section λ-normalized to the behavioural aggregate rate, HH3's real
debt service allocated as recorded per-cohort burden, and the spend-mix shares derived from
cohort budgets. Three drift formulas died (tier income drift, the wealthSignal spend-share walk,
the dead per-tier consumption sum), the decomposition identity is asserted weekly in the
harness, and the 40-week aggregate paths are BIT-IDENTICAL to the pre-cohort world — the
cross-section landed without moving a single aggregate flow, which was the design rule.
**HH4b — DONE (§7.57).** Stage 03's C is the sum of the cohort budgets: disposable less savings
less HH3's real debt service plus the capital receipts that recycle it (real deposit interest,
real dividends off the marked direct-equity book, and a named seed residual for the unbuilt
channels — three components with three DIFFERENT incidences, because the incidence is the
point). The household pool allocates across categories by price tier off the cohort spend
shares, and stage 05's bid premium is a tier property (staples inelastic, luxury the swing).
Measured: the debt-service/receipts differential reaches −24B at the week-60 policy squeeze,
the spend mix flees to essentials, and the pre-existing G1b escape ends ~11pp of inflation
LOWER — the household rate channel is a real stabiliser now.
**HH4c — DONE (§7.57).** Tier net worth is a derived split of the same marked balance-sheet
components (SCF-shaped incidence weights), summing to the aggregate to the dollar; the
equity-gain/savings-gain/retired-drawdown drift died; the wealth effect is tier-weighted MPCs
(a housing move hits consumption ~2x an equal equity move, as the literature finds).
**HH4d — DONE (§7.57).** One household deposit stock: the banks' `depositsUSD` line IS it,
split from a new `wholesaleFundingUSD` at seed, moved by named flows only, with T+1
settlement (`pendingBankSettlementUSD`) for every household flow that runs after the bank
pass, and the identity asserted weekly. The unification invariant immediately caught a real
pre-existing hole: bank M&A stranded the target's entire balance sheet — stage 10 now merges
it into the acquirer.
**Still owed from HH4, recorded:** tax COLLECTION routes to the treasury when PUB builds it
(rates are real and progressive now); real dividend receipts still ride the constant-share
capital income inside the income measure (the recycle's real components live budget-side);
the residual recycle share is a §6 watch line that decays as receipt channels become real.

**HH5 — DONE (§7.58).** The labor market is a matching market between 02b and 03: vacancies from
real output growth, separations as quits plus layoffs with hiring faster than firing, hires from
a Cobb-Douglas matching function on the real stocks — so a vacancy takes ~6 weeks to fill and an
unfilled one carries over (and is withdrawn at 10%/wk). **The root disagreement is closed:** there
were THREE rates, not two (the GDP-gap formula at 4.5%, a dead `unemploymentRateBottomUp` at 37%,
and pool-implied 8–17%); now employment is the sum of what real employers carry, the pools are a
derived view of it, and the rate is a reading of the same stock — asserted weekly. The Beveridge
relation EMERGES (−0.32 to −0.35 full sample; −0.87 to −0.95 once the vacancy stock is
established). **Still open:** wage SETTING is HH6's, and the per-occupation mismatch the market now
exposes (one occupation tight at V/U≈40 while two run zero vacancies against real unemployment) is
what HH6's wage response and the retraining flow have to work on. The bottom-up-GDP-vs-anchor gap
named here is NOT yet re-measured — do that at the start of HH6.

**HH6 — DONE (§7.59).** Each firm carries an `offeredWageIndex` set from its own unfilled
postings (wage push) and its margin headroom (a firm losing money does not give raises); the
occupation going rate is the employment-weighted average of what firms offer; quits respond to
relative pay and execution quality, so a raise retains staff. The region-level tightness→wage
formula is deleted. Bargaining is over REAL wages, so the going rate also recovers part of the
cost of living — deliberately partial, because full indexation pins the real wage and hands the
model a mechanical spiral. The named defect is closed: nominal wage growth was −2.5% against 10%
inflation, and is now +4.7% against 10.3%. **Verified by lag structure, not by a contemporaneous
correlation:** unfilled vacancy share LEADS wage growth, 0.08 (1wk) → 0.41 (4wk) → **0.71 (8wk)**.

**Verify (whole project):** household financial assets reconcile to real claims on real
counterparties, and `unmodeledFinancialAssetsUSD` falls toward zero as each slice lands — it is the
project's own scoreboard; every institutional liability has a holder and every household asset an
issuer; unemployment, wage growth and the vacancy rate move together in a Beveridge-ish relation; a
big employer's failure raises regional unemployment and cuts real stage-05 consumption — the
recession transmission the simulation exists to have.

### BP1 — One industry registry  *(Tier 1, item 2)*

A single `domain/industry-registry.ts` typed table: category → sub-units, buyer mix, input
recipes, capex weights, commodity links, labor intensity by occupation — and, for **IND**, each
sub-unit's **storability** (can its output be held at all?), its **carrying cost** if so, its
**revenue mechanism** and its **cost shape**. Those four are properties of what is being made, not
of the firm making it, which is why they belong here rather than on the Company. `INDUSTRY_SUBUNITS`,
`CATEGORY_INPUT_REQUIREMENTS` and `COMMODITY_CATEGORY_LINKAGE` become views of it and then die as
separate definitions. Adding an industry becomes one entry.

Foundational because three things wait on it: every industry specialization in **IND**, the
**HC3b** product-market handover, and the listed universe's breadth — which is what makes
broad-market indexing meaningful (§6 watchlist).

---

### IND — Industry operating models  *(Tier 1, item 3; needs BP1)*

**The problem, stated plainly: every non-financial corporate in this model is the same firm.**

What varies by sector today is four coefficients — `SECTOR_PRICING_POWER`, `SECTOR_PPE_INTENSITY`,
`SECTOR_PPE_USEFUL_LIFE_YEARS`, `SECTOR_WAGE_SENSITIVITY` — plus input recipes by category. Those
are coefficients on ONE operating model. Underneath them, all 2,004 companies:

- produce **storable units** into stage 05's auction, whatever they make;
- hold output inventory decaying at `inventoryCarryingCostRate ?? 0.02`, hardcoded identical for
  every firm in the world — **measured: enterprise software sits in physical inventory, 159 units
  worth 5.9M, spoiling like steel** (§7.50);
- book revenue only on **settled unit sales** — there is no subscription, backlog, deferred or
  royalty revenue anywhere in the model;
- run one COGS decomposition (base cost, wage pressure, input prices, capacity decay, crowding).

A firm with 90% gross margins and no warehouse is not expressible. Neither is one that sells a
contract in Q1 and delivers it over three years.

**The model already knows this is wrong and fixes it for exactly one sector.**
`financialStatementProfile` gives banks, insurers and asset managers genuinely different P&L
paths. The rest of the economy shares one.

**IND1 — Storability, in BP1's registry.** Whether a sub-unit's output can be held is a property
of the sub-unit, not of the firm: software, services and most digital goods have no inventory to
carry, so they should hold none rather than hold some at a shared rate. Carrying cost becomes a
registry property too — a warehouse of steel and a warehouse of fresh produce do not decay alike.

**IND2 — Revenue mechanism.** How a sale becomes revenue, from the registry: a **unit sale** (what
everything does today), a **subscription** that recurs until it churns, a **project** booked to
backlog and recognised as delivered, a **royalty** on someone else's volume. This is the largest
number in the model and it currently has one shape. Stage 05 keeps clearing the transaction; what
changes is how the transaction becomes revenue on the seller's books.

**IND3 — Cost structure.** The fixed/variable split and the COGS-versus-opex balance by industry:
a software firm's marginal cost is near zero and its costs are people; a smelter's are inputs and
energy. Both are currently the same decomposition with different coefficients. Operating leverage —
which is what makes a downturn hurt some industries far more than others — is not expressible
until this is.

**IND4 — Financial profile** (the original #51): per-sector `{capexIntensity, cyclicalityBeta,
financingPreference (bond/loan/equity mix), payoutPolicy, hedgingPolicy}`, consumed by stage 08,
`corporate-financing.ts` — which market an issuer taps stops being uniform — and DER's hedging
slice. **Also where several stated primitives become outcomes:** the ETF expense ratios, the
underwriting fee schedule, and the research-capacity constant behind who indexes.

**IND5 — Electricity** (#54): a real commodity plus a registry recipe line in every industry at
those intensities; utilities already exist as producers.

**IND6 — Share-versus-margin strategy** (#55): a per-company posture expressed ONLY through its
real stage-05 offer price relative to cost — underpricing within contribution-margin bounds buys
real share because the auction fills cheaper offers first. No synthetic share variable.

**IND7 — Antitrust** (#45): real `categoryMarketShare` above a threshold for N sustained weeks
forces a divestiture — split the company into two real companies through the existing generation
machinery, dividing product lines, debt and holders — plus an M&A freeze flag stage 10 respects.

**IND8 — Rating generation.** Week-0 USA is AAA 16% / AA 39% / A 45%, **zero BBB and zero HY**,
with 55% of debt AA or better, inverted against reality. Dynamics are fine (BBB 39% / HY 16% by
week 40) and HC's sponsor-owned firms supplied the missing HY universe, so what is left is the
generator's own distribution. Re-measure first, then fix at source.

**IND9 — The segment debt primitive.** `debtUSD = annualRevenueUSD * 2` implies ~15x debt/EBITDA
on the private sector in aggregate, which no real balance sheet services. G2 itemized the bank
book, so segment debt can be recalibrated to what real SME leverage on segment EBITDA and real
bank capital can carry. Re-measure §7.18's want/have afterwards.

**Verify:** a software firm holds no inventory and carries no inventory cost; a subscription
business's revenue survives a quarter with no new sales while a unit seller's does not; operating
leverage differs measurably across industries in the same downturn; gross margins disperse by
industry the way real ones do.

### PUB — The public sector: treasury and central bank  *(Tier 1, item 4)*

Merges the old BP5 (government as fiscal counterparty), S4r (debt service) and G9 (central bank).
They are one balance sheet seen from two sides, and remittances are the loop that closes between
them — neither half is honest alone.

**The defect that makes this foundational: the government books no interest expense at all.** A
tranche's `couponRate` is stored and paid by nobody, received by nobody. It cannot be bolted on
in isolation — funding it from outside the budget creates money, and adding it on top of the
deficit double-counts, because a real fiscal deficit already includes interest. The correct
decomposition is `governmentSpending = interest + procurement + transfers`, interest computed
from the real debt stack and the remainder splitting by `GOV_PROCUREMENT_SHARE_OF_SPENDING`, kept
consistent with the national-accounts identity of §7.9. Done properly it hands the simulation a
real and important mechanism: rising debt and rising rates crowding out procurement and transfers,
and in the limit a debt spiral.

**PUB1a — DONE (§7.61).** The government books real interest from its own debt stack, spending
decomposes as `interest + procurement + transfers` (interest off the top, so debt service crowds
out the primary budget), and coupons are paid to real holders — replacing the WS7-era carry that
credited banks and money funds while the issuer paid nothing. Measured: interest 10.4% → 12.6% of
spending as debt/GDP runs 108% → 171%. **Named boundary:** only 52% of the bill reaches a modelled
holder (banks 22% + institutions 30%); the central bank's 15% and foreign 24% have no entity yet,
so `governmentInterestToUnmodeledHoldersUSD` carries the rest and shrinks as PUB2 and XB land.

**PUB1b — DONE (§7.63).** Tax is collected from real payers into the TGA: corporates accrue
weekly and **remit quarterly** off a real accrued liability, SME pools and households pay weekly
(households at HH4a's own progressive cohort rates). `governmentRevenueUSD` is now what actually
arrived, so the treasury's account visibly draws down between tax dates and jumps on them —
the swing a TGA exists to express. **The finding:** the fiscal block thought it collected 25% of
GDP while the modelled tax bases support ~50–60% of that, because there is no consumption or
payroll tax anywhere. Named as `unmodeledTaxRevenueUSD` rather than closed by shrinking the
state, which would model a different economy.

**PUB1c — DONE (§7.64).** The two missing instruments exist and the gap is closed: an **employer
payroll tax** carved out of the labor share (which is total compensation, so households are paid
it net) and a **consumption tax** as a wedge inside the cohort budget (disposable income
unchanged, real purchases smaller — what a VAT actually does). Neither touches the S1 identity.
**Every stream now remits on its own real calendar** — corporate and SME quarterly, withholding
and payroll monthly, consumption tax quarterly — so nothing is paid weekly any more. Measured:
real collections **~50% → 99–100%** of revenue, `unmodeledTaxRevenueUSD` to 0.00B, and the TGA
swings 43 → 30 → 66 → 43 → 86B across the calendar.

**PUB1d — DONE (§7.65).** Sovereign issuance goes through its own book. The forced placement is
gone: new paper simply exists and 07c prices the enlarged bucket against budget-constrained
demand, the dealer holding what finds no buyer — which is what an undersubscribed auction is.
**Correction to this entry's earlier diagnosis:** it blamed a 50.3B one-week fall in institutional
cash on the placement path. The A/B says otherwise — worst institutional cash is unchanged
(−45.9B before, −47.9B after at w26) and the real cause is an ETF running negative net assets,
now a §6 defect of its own. What the placement really cost was the sovereign market: removing it
took bank reserves at w40 from **−29.0B to +84.7B** and the 2Y at w26 from **0.98% to 2.62%**.

**PUB1e — DONE (§7.67).** Procurement is one number, bid in the real goods market and paid for
out of the treasury's account. There were FOUR representations of "what the government buys";
now stage 03 derives the per-category budget from the primary budget, stage 05 bids exactly it,
and stage 11 debits the account by what actually filled. Measured: fill 43% -> 75% once the
government's willingness to pay stopped excluding it from any category that moved 10% in a week;
~25% of the budget still goes unspent against the goods market's own excess demand, named as
`unspentProcurementBudgetUSD`. corr(interest share, procurement share) = **-0.666** over 100
weeks — the crowding-out, now landing in real bids rather than a line item.

**PUB2a — DONE (§7.62).** The CB has a real balance sheet: its sovereign book as assets, and
reserves + the **Treasury General Account** + currency as liabilities. The TGA is the point — a
treasury account is a LIABILITY OF THE CENTRAL BANK, so its flows move money in and out of the
banking system. Remittances (coupon income less interest on reserves) go to the treasury and turn
NEGATIVE when policy exceeds the portfolio yield, which is the real post-hiking-cycle phenomenon
reproduced rather than modelled. Retires the phantom 1e12 `centralBankReservesUSD` and the
balance-sheet drift. Identity asserted weekly; TGA asserted non-negative.

**PUB2b — DONE (§7.66).** The balance sheet is a real quantity operation. The CB is redeemed like
every other holder, and places an open-market ORDER that 07c and 07f price against everyone
else's demand — reinvest what matured, buy a flow when the floor blocks the easing the Taylor
rule wants, reinvest only part of it when the rate tool has room and the book sits above the
share it was built at. Retires `balanceSheetStance` and the "monetization share" that printed
deposits into households. Measured: the book stops being frozen (100B flat, 15.0% -> 11.4% of a
growing stock) and lives (100B -> 137B, 15.0% -> 16.9%), `unbackedBankCashUSD` at w52 **304B ->
100B**, and all three regimes fire in one 60-week run.

**Still open after this slice** (the criteria it did not close): rising rates crowding out
procurement is PUB1a's channel and wants PUB1e's real bids to be visible on the spending side.
The §6 watch it adds is the sovereign book's price elasticity to a size-only bidder.

---

### DEM — Demographic variability  *(Tier 1, item 5; small, rides beside HH4–HH5)*

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

### G3 — One dealer system  *(Tier 2, item 6)*

The dealer becomes what it is in reality: a desk inside a named bank. `DealerDesk {bankTicker,
inventoryByInstrumentId, capitalAllocatedUSD}`; migrate the current region-level inventories to
the largest banks by market share. Inventory then costs something real — it consumes the bank's
capital (RWA) and funding (repo, G2) — which makes the desk's leaning economically forced rather
than parameterised, and gives §7.19 item 3 its fix. Quotes: mid = cleared stat; spread widens with
inventory utilisation; an axe is just a position the desk improves its price to reduce. The player
faces the best quote among the three largest desks (keeps the three-dealer UI, backed by real
banks); `state.dealers` is deleted.

**Fee routing comes with it — three places where real money currently vanishes.** Stage 13's IPO
underwriting fee and `trade.ts`'s player fees both credit the AGGREGATE
`bankingSector.bankEquityUSD`, which 02b overwrites with the per-bank sum next week, so the fees
disappear (a write to a derived view, §7.30); and 07e's equity dealer revenue is dropped entirely,
so clients pay fees into nothing. All three land on a real named desk here.

**Also lands here:** WS8's firm-commitment underwriting, which is on best-efforts today precisely
because the residual needs a desk with a balance sheet to sit on; and the ETF authorised-participant
desk, which currently draws on a regional pool rather than a named dealer's own capital.

**Verify:** desk P&L reconciles to spread capture ± inventory MTM; a capital-constrained bank
quotes visibly wider — the real liquidity-cycle channel.

---

### DER — Derivatives, and the people who hedge with them  *(Tier 2, item 7)*

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

---

### G5 — Default resolution: recovery as an outcome  *(Tier 2, item 8)*

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

---

### WS9 — Real trade & FX  *(Tier 2, item 9)*

**Confirm the currency-zone premise with the user first** (standing caveat). If confirmed:

The FX rate clears from real net currency demand, replacing `06-fx-and-trade.ts`'s drift formula —
the UIP sign bug and the gdp-poisoned capital-flow term die with it. Participants per pair:
**trade flow** (inelastic), the cross-region purchases stages 05/06 already compute, an importer
selling its own currency week by week at whatever the rate is; **carry and speculative flow**
(elastic, the price-setter), banks and hedge funds with a reservation from the real cleared
short-rate differential against the rate's recent path — this is where UIP lives as behaviour
instead of a formula term; and **portfolio flow**, cross-border clearing fills once foreign
holders exist. Engine `PRICE_LIKE` per pair; cross rates by triangulation from the three cleared
USD pairs.

**Also closes:** S7's foreign-share parameter, and the **three GLOBAL index funds**, which today
have zero shares for an honest reason — every institutional book in the model is domestic, so
there is no cross-border equity allocation for a global fund to draw on.

**Verify:** a rate-differential shock moves the pair in the carry direction; trade deficits
depreciate slowly against sticky flows; no drift term anywhere; the global funds fill.

---

### XB — Cross-border portfolios  *(Tier 2, item 10; needs WS9 + DER)*

Investors buy foreign shares and bonds under the constraints real mandates impose. Today every
institutional book is domestic (`foreignShare` in `AssetOwnershipShares` is a static scalar that
owns nothing), the three GLOBAL index funds sit empty for exactly that reason, and a
rate-differential between regions moves no money.

- **Fixed income cross-border is FX-HEDGED** — the institutional rule, not an option: an insurer
  or pension buying a foreign bond or loan hedges the currency, and the hedge cost is the
  covered-interest short-rate differential. So the demand signal is **hedged yield pickup**
  (foreign yield − hedge cost − home yield), which is the real reason cross-border bond flow
  chases spread, not headline yield. The hedge itself is a REAL forward position in DER's book
  with a dealer on the other side — not a formula discount — which is why this project needs DER.
- **Equities: hedging optional and partial** (real practice runs 0–50%): unhedged foreign equity
  carries the FX exposure into the holder's book, and the FX P&L shows up in its weekly marks.
- **Home bias and mandate limits as named primitives**: a home-bias weight per entity type
  (measured reality: pensions ~60–80% domestic) and an FX-exposure cap for regulated books
  (insurers), both stated constants until something real can derive them.
- **Mechanics**: foreign holders join the existing clearing engines as ordinary participants —
  the engines already price every name against every holder; what is new is only that a JPN
  insurer's demand for a USA bond settles in USD through the WS9 FX market (a real currency
  purchase, which is the portfolio-flow leg WS9's design already reserves a seat for), and its
  weekly mark converts at the cleared rate.
- **Also closes:** the three GLOBAL index funds fill (moved here from WS9's note — XB is the
  mechanism); S7's foreign-share parameter becomes real holdings.

**Verify:** hedged-yield-pickup, not raw yield, predicts bond flows; a home rate cut pushes
portfolio flow abroad and the FX pair moves in the carry direction; the global funds fill; FX
forward open interest in DER's book matches the hedged cross-border bond stock; every foreign
security position has a cash leg in the right currency.

---

### CAL — Payment calendars  *(Tier 3, item 11)*

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

### ETF2 — A real price for ETF shares  *(Tier 3, item 12)*

Today a fund's shares are carried at NAV and the arbitrage residual is reported as
`unmetFlowShare` — the fraction of a week's creation and redemption demand the authorised
participants could not absorb — deliberately not called a premium, because a premium is a price
and that is not one (§7.44). Pricing the shares means clearing them in a book of their own against
the float the APs are willing to create: a real adapter over the existing engine, with the AP's
capacity as the supply side. Until it exists the model can say the arbitrage was constrained but
not what that cost anyone. Wants G3 first, so the AP's capacity is a named desk's real balance
sheet rather than a regional pool.

---

### HC3b — The product-market handover  *(Tier 3, item 13)*

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

### SCALE — Universe scale-up under a wall-clock budget  *(Tier 3, item 14)*

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
- **Report measured numbers** at every step: before/after per-stage timings, the frontier curve,
  and the harness green at each size.

---

### S-final — Validation gate  *(Tier 4, item 15)*

Full `npm run verify` green, closing #2/#14/#41, plus whatever residuals of #67 and #18 survive
their owners above. Nothing else ships after this until it passes.

---

### AU — Aurora, the UI rebuild  *(Tier 4, item 16)*

Explicit mandate: delete every current UI element and rebuild from scratch — sleek, smart,
interactive, real-world-inspired. **Required process, fixed in advance:** (1) a LONG series of
clarifying questions via AskUserQuestion — visual direction, information architecture, interaction
patterns, reference products, platform scope — iteratively, not one round; (2) mockups the user
reacts to BEFORE production code; (3) real-world product inspiration (trading platforms,
dashboards, data-dense consumer apps). Scope is all of `src/components/` plus `App.tsx`; the
engine and domain layers are untouched. Sequenced last so it is designed against the complete
simulation, and it inherits P1's display convention rather than re-inventing it.

---

### CLOSED PROJECTS — architecture kept because later work ties into it

**HC — Hidden Corporates** *(§7.33 Wave 1, §7.41 Wave 2)*. The hidden sector became the majority
of the economy it is in reality: ~300 named private firms per region as real `Company` objects
with `listingStatus`, an `ownership` block and everything else real firms have — **no parallel
type**, because a second firm type would be two representations of one real thing. Below them the
SME mass stays aggregate but real: its revenue is real stage-05 participation, its debt real bank
loans, its losses the banks' real loan losses. PE sponsors are a real institutional type whose
committed capital comes from real LP sleeves — PE-owned issuers ARE the B/BB loan universe.
**Conservation is the build discipline:** tier-1 firms are carved OUT of the segment aggregates,
never added on top, and Wave 2's births carry the same rule, so the economy's totals never change
because a firm was created. Only HC3b remains, above.

**ETF — Index funds and authorised participants** *(§7.44)*. Twenty-seven funds over twenty-seven
indexes; membership and weights are rules run over cleared prices, funds hold their baskets for
real, dealers create and redeem, and a research-capacity rule decides who indexes and who buys
names. **The architectural note later projects need:** an index fund posts a SIZE with no
reservation level (`stages/etf-demand.ts`) — the price-insensitive schedule — and that shape is now
available to any adapter.

---

## 6. Open defects and watchlist

Everything with a project owner now lives in that project (§5). What remains is what no project
owns: live defects needing a decision or a measurement, and metrics to watch rather than work.

### 6.1 Live defects

| Defect | State and next action |
|---|---|
| **G1b — the inflation escape** | The measured band is SEED-SENSITIVE: one world holds −10..0%, others escape upward by week 40 (the default-stream world reaches 50%+ by week 52 with the 10Y following to 17%). **The measurement is not at fault** — the goods market's prices really do move that much. G2 measurably damped it and did not cure it (0.66% of demand against a goods cycle orders of magnitude larger), exactly as predicted. Remaining owners: **MS** (the household rate response, the missing stabiliser) and **PUB** (the fiscal loop). Two diagnostics still unrun and worth doing first: trace one sub-unit's price, supply and demand over 120 weeks for a long-wavelength cobweb; and consider whether stage 05's real bid and offer prices should carry an expectations term — a genuine behavioural channel, since anchored expectations damp actual price setting. **Do not** smooth the index, widen the basket, or clamp inflation: the index is the measurement, and if it is volatile the economy is. |
| ~~**The institutional Company and the InstitutionalEntity are two firms**~~ | **Insurer half CLOSED (§7.51).** Found in HH1 (§7.49). `UXZG` is an insurer whose Company shell reports 0.05B of revenue and 0.10B of market cap while its Entity holds **241.4B** of assets against 19.5B of its own equity — a company trading at 1/200th of its own book. Asset managers were reconciled by S11 (`aumUSD = entity.totalAssetsUSD`), and HH1b now seeds them consistently, but the INSURER branch still refuses the entity on a justification that is stale — it predates S11 making `totalAssetsUSD` a real per-firm marked book — so its float is `annualRevenue x 5` and its `technicalReservesUSD` prints 0.2B against a 221.9B beneficiary liability: the same insurer's obligations represented twice, three orders of magnitude apart. **Correction to the first write-up of this row:** pension and hedge funds do NOT fall through to the consumer-revenue path — they carry the `ASSET_MANAGER` profile and already read the entity's real book, which S11 wired. The insurer is the one disconnected representation. The insurer now reads its entity: reserves ARE the beneficiary liability (223.0B, one number instead of 0.2B beside 221.9B), premiums come off real capital at the regulator's premium-to-surplus ratio, and investment income is what its own portfolio actually earned. Market cap 0.10B → 51.0B against 19.5B of book. **What remains of HH1b is deriving the required-return constants**, which needs the liability FLOWS (premiums paid by real payers, claims to real claimants) that HH1c owns. |
| ~~**#67 — USA bank capital → 0**~~ | **CLOSED (§7.55) — re-measured after HH3 and the collapse is gone.** Capital ratio runs 11.6% → 14.7% through week 80 (was: → 0 by week ~70), NIM in band throughout. The bleed was the fictional consumer book: a formula target earning a formula yield and losing a formula loss rate, none of which the bank's capital could price or gate. With the book real — real margins quoted off measured tier losses, real amortization, origination capital-gated at the 8% floor — the banking system carries its full household book and earns its keep. |
| ~~**#18 — companies at the revenue floor**~~ | **CLOSED (§7.49), and the diagnosis was wrong for a year.** The four names were the four regional HEDGE FUNDS, whose "revenue" is a fee on their book — the harness was applying an operating company's growth ceiling to a fund. And they had not grown: their book SHRANK 76.8B → 62.4B while the reported revenue rose 29x, because the generator seeded `aumUSD` as a multiple of an operating company's revenue while the entity carried the real marked book. A §7.4 cold start, not a runaway. Seeding the shell at the size it actually manages took it to 1.1x. |
| ~~**Household deposits: two representations**~~ | **CLOSED (§7.57, HH4d).** The banks' `depositsUSD` IS the household stock now, split from `wholesaleFundingUSD` at seed (418B USA — the funding that was wearing the deposit label), moved by named flows only, reconciled to the household state weekly with the identity asserted (0.1% band, 60 weeks green). The closing invariant also caught bank M&A stranding the target's whole balance sheet — fixed in stage 10. |
| **Equity prices run away past ~week 80** | **Found by the HH close-out battery (§7.60); NOT HH's.** Median USA share price runs 7.9 (w80) → 184 (w100) → 5,048 (w120) while median EPS moves 0.39 → 0.57 — an implied ~8,850x earnings. Institutional claims stay flat at ~530B, housing/deposits/debt are all sane, so it is the equity market alone; household net worth only shows it because HH2/HH4c correctly mark households to it (568x income at w120). Consistent with the §6 damper-bound watchlist plus §7.18's want/have: a growing pool of money chasing a fixed float, printing at the damper limit week after week, which compounds. **The 60-week harness cannot see this** — prices are still sane at w60 — so the first action is a longer harness window, then the real fix is asset supply (**SCALE**'s bigger universe, **HC** births, **G3**/ETF2's dealer capacity), not a cap on the price. |
| **Real growth prints escape at horizon** | **Found in HH2, pre-existing, unowned.** Consumption growth −105.91% and GDP growth −209.30% at week 60. A/B against the pre-HH2 tree: −119.87% / −209.30%, GDP identical to four significant figures — so this is not HH2's, and HH2 slightly damps it. **Nothing in §6 recorded it and the harness does not check it**, which is the first thing to fix: a growth rate that can print −200% is a band the harness should assert. Likely the same family as G1b (the price level escaping takes the real deflator with it), but a different symptom and worth confirming separately before assuming so — if real growth is being deflated by an escaping index, the defect is G1b's; if the nominal path itself collapses, it is not. |
| **An ETF pays out net assets it does not have** | **Found in PUB1d (§7.65); owner ETF2, not PUB.** `USA_IG_ETF` runs cash 0.04B (w13) → **−47.9B** (w26) against a 14.5B holdings book — **net assets −33.4B**, a fund that owes more than it owns. The signature is a steady ~3.5B/week outflow while holdings barely move and shares outstanding fall 2.3e8 → 1.7e7: redemptions keep paying cash out after `navPerShare` has already gone to 0.0000 because `navUSD` is non-positive. The per-book purchase budgets are sound (`etf-demand.ts` and 07b both cap at `max(0, cashUSD)`), so the leak is on the **redemption** side of `etf-flows.ts`, not the buy side. Present identically before and after PUB1d — do not re-attribute it to sovereign placement. The invariants harness does not assert non-negative fund net assets; adding that assert is the first action. |
| **Bank NIM band** | Was ten breach-weeks; call protection and the ETF work took it to **one** (week 60, 0.0860). Effectively resolved by G2 slice 2 and the free-call fix — keep the harness line, do not open work for it unless it regrows. |

| **`unmodeledFinancialAssetsUSD`** | **The scoreboard for HH, not a watch item.** 1,605B at week 40, and §7.48 identified where 46% of it already is: 740B of insurance reserves, pension entitlements and fund shares sitting on institutional balance sheets as assets with **no holder**. It is not the universe being too small — the model contains it and does not attribute it. HH1 closed that 740B on both sides at once; HH2 added the house (3,188B of stock, 2,127B of home equity), taking net worth to 4,730B and 4.61x income. Watch this line fall toward zero as each slice lands. |

### 6.2 Watchlist — measure, do not fix

| Metric | Why it is here |
|---|---|
| **Damper-bound instruments** | 1,961 persistently bound (3+ consecutive weeks) on the 60-week harness. The number to watch DOWN as the wides get a real buyer base; it rose when the loan book grew, which is expected. Not a defect on its own — a print held away from its solve is only wrong if it stays there. |
| **Index funds without a buyer** | Was 15 of 27; **MS1 took it to 10** by adding households, who index everything and fill all four broad-market funds (§7.47). The diagnosis in this row was partly wrong and worth correcting: the empty all-cap funds were not a universe-size problem, they were a missing SECTOR. What remains — the large-cap and high-yield funds — is the genuine version: ~25 large-cap names and 8–65 HY issuers are few enough for any institution here to research directly, and households buy the broad market rather than a size tier. That closes as HC births, real IPOs and BP1's registry grow the universe. **Still do NOT tune the research-capacity primitive until the funds fill** — that would be fitting a constant to a desired outcome. |
| **`unmodeledCapitalReceiptShareOfIncome`** | HH4b's named residual: the slice of the debt-service recycle whose return path to household income is unbuilt (bank retained earnings, institutional dividend passthrough). Derived once at seed (≈ debt service less deposit interest, per region), it decays only when a receipt channel becomes real — real institutional dividend income to claims (CAL/PUB territory), real bank payout routing. Watch it DOWN like the unmodeled-assets line; never re-derive it to a bigger value. |
| ~~**Bottom-up GDP below the supply anchor**~~ | **The comparison no longer exists — do not re-measure it this way.** HH5's scope named a 6–9% permanent output gap between bottom-up GDP and the supply-side anchor. Re-measured at the start of HH6 it prints exactly 0.0% every week from week 1, because `estimatedNominalGdpUSD` is now set to `lastWeekNominalGdpUSD` — the anchor IS the lagged bottom-up series, so the test compares a number to a copy of itself. The gap is neither closed nor open; the independent supply-side anchor was collapsed into the demand-side measure by an earlier change and nothing records when. A real potential-output series (PUB's, or a capital-and-labor production function) has to exist before this can be asked again. |
| **`governmentInterestToUnmodeledHoldersUSD`** | PUB1a's named boundary: ~48% of the government's interest bill has no recipient, because the central bank (15% of the stock) and foreign holders (24%) are not entities yet. The debit is real and the crowding-out it causes is real; the credit is missing. **PUB2** closes the central-bank half — and in reality that half is remitted straight back to the treasury, so it is a wash rather than a cost — and **XB** closes the foreign half, which genuinely does leave. Watch this line down; do not net it out by shrinking the interest bill, which would understate the debt burden. |
| ~~**`unmodeledTaxRevenueUSD`**~~ | **CLOSED (§7.64).** PUB1c added the two missing instruments — employer payroll tax and consumption tax — and real collections went ~50% → 99–100% of revenue. The line stays in the code as the honest residual if a future change outruns the bases again; it currently reads 0.00B. |
| **TGA level over a quarter-scale horizon** | Watch, do not chase (rule 10). **Re-measured after PUB1d** as that row asked: the account no longer drifts monotonically — it now sawtooths, filling on the quarterly remittance dates and drawing down between them (39 → 33 → 66 → 59 → 51 → 44 → 86B over 26 weeks), which is the shape a treasury balance actually has. What remains is the LEVEL at each quarter's peak creeping up, because receipts are larger than the old formula assumed and spending catches up a week later. Re-measure once PUB1e puts procurement through real bids. |
| **Occupational mismatch** | HH5's labor market exposes it for the first time: at week 40 one occupation runs tight (V/U≈40, wage growth at its cap) while two carry real unemployment against zero vacancies. The seed no longer causes it (§7.58 removed the arbitrary slack multipliers), so what remains is produced by the sector composition moving faster than the retraining flow can follow. **HH6** owns the response — a firm that cannot fill a role raises its offered wage, which is what should pull workers across. Measure the spread of V/U across occupations before and after HH6; do NOT tune the retraining speeds to flatten it first. |
| **Sovereign price elasticity to a size-only bidder** | **Found in PUB2b (§7.66).** A 34B difference in the central bank's book moved the USA 2Y by ~490bp at w30 — a very high elasticity for a market that size. Consistent with the damper watch above (1,964 instruments persistently bound: the books ARE thin, so an inelastic buyer has to move the level a long way to find sellers), and with §7.18's want/have. **Do not soften it in the clearing engine** — prices are cleared, and tuning the auction to produce a gentler response would be fitting the mechanism to a desired number. It should fall as **SCALE** and **G3** grow the universe and the dealer's capacity; re-measure then. |
| **The goods market cannot fill a quarter of what is bid** | **Found in PUB1e (§7.67).** ~25% of the government's procurement budget goes unfilled at any price: aggregate bids exceed aggregate supply and every in-money bidder is rationed pro-rata, so households are short by the same ratio. Long-standing and not PUB's — it only became visible because the government is the first buyer whose unfilled demand costs something. **Do not close it by shrinking the bids**: the demand is real and the supply side is what is missing. Expect it to fall as **SCALE** grows the firm universe and **BP1**'s taxonomy lets more sub-units be supplied; re-measure the fill ratio then. **The PUB battery (§7.68) measured it at horizon: mean fill 67.9% over 120 weeks but a range of 7.7%–87.5%, so it gets much worse as the price level escapes.** |
| **Revenue is bottom-up; spending is still a formula** | **Found by the PUB battery (§7.68); PUB's own follow-up, and the biggest open item it leaves.** Over 120 weeks revenue grows **306.6x** while outlays grow **12.2x** — PUB1b/1c made receipts a real function of real bases (wages, profits, consumption), so they inherit the price level, while `governmentSpendingUSD` still evolves on its own top-down path. The TGA runs to **1,188B** (EUR 2,578B) on that asymmetry alone, and the measured "surplus" is an artifact of the mismatch rather than a fiscal result. **Do not fix it by damping revenue** — revenue is the real half. The fix is a spending path tied to a real base (programs sized by beneficiaries and prices, procurement by what it actually costs), which is a PUB3-shaped piece of work. Partly entangled with the §6 inflation escape: re-measure after that, since a stable price level shrinks the divergence without closing it. |
| **`unbackedBankCashUSD` explodes past the harness window** | **Found by the PUB battery (§7.68).** 97B (w13) → 107B (w52) → **2,183B (w120)**. PUB2b shrank it at w52 (304B → 100B) by giving the central bank a live book, and that fix holds — but reserves grow from deposits and lending far faster than any central-bank purchase backs them once the escape takes hold. **The 60-week harness cannot see this.** Owners: the §6 inflation escape first, then whatever gives bank reserves a single representation. Watch it, do not force the identity closed. |
| **Loan-book Spearman noise** | Spearman(leverage, DM) runs 0.26–0.76 across weeks where the bond book holds 0.78–0.93 — consistent with sampling noise at 23–32 names per region. Re-measure as the loan universe grows; if it persists at larger n it is a real defect. |

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
      **revenue outgrows spending 306.6x against 12.2x**, because PUB1b/1c made revenue bottom-up
      while the spending PATH is still a top-down formula — the TGA runs to 1,188B on that
      asymmetry alone. `unbackedBankCashUSD` is flat to w52 (97 → 107B) and then explodes to
      **2,183B by w120**. Procurement fill falls to **7.7%** at horizon. And all four regions
      print the 2Y at 39.84–39.86% — four independent economies agreeing to two decimals is the
      §6 damper binding continuously, not a market.
    - **The 60-week harness sees none of the three.** Same lesson as §7.60: **a close-out battery
      is not a longer harness run, it is the only place a project's own criteria get measured.**
