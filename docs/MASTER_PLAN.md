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
| 1 | foundation | **HH — The household sector, to corporate depth** (absorbs G6) | none |
| 2 | foundation | **BP1 — One industry registry** | none |
| 3 | foundation | **IND — Industry operating models** (every corporate is currently the same firm) | BP1 |
| 4 | foundation | **PUB — The public sector: treasury + central bank** | HH (household taxes) |
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
**HH4b — the dynamic wiring:** stage 05's household bids become sums of cohort budgets with
per-cohort price sensitivity (low-income cohorts are the inelastic food-and-energy demand,
high-income the discretionary swing); real dividend/interest receipts replace the flat
capital-income constant, which is what lets debt service finally DEBIT the budgets (one-sided
today = the HH1c leak; both sides together = a re-derived S1 seed identity); household deposits
unify onto the banks' line (§6's two-representations row). **HH4c:** per-cohort balance sheets —
the wealth tiers' net-worth drift formulas become sums of cohort holdings, and the per-tier MPC
replaces HH2's single wealth-effect constant.

**HH5 — A real labor market.** A new stage between 02b and 03: companies post openings from real
capacity need (production plans vs headcount, data stage 05 already implies); cohorts move toward
better wages with real friction; quits and layoffs move real payroll. **This closes the root labor
disagreement** the model has carried from the start: the bootstrap's firms demand ~11–14% fewer
workers than the population primitives supply, so the occupation pools imply 11–14% unemployment
while `reg.unemploymentRate` reports ~4.5% — two representations of one real thing. Writing the
pool-implied rate into the field was tried in S1 and deliberately reverted; the real fix is making
both sides real. It also closes the consequence: bottom-up GDP starts 6–9% below the supply-side
anchor and reads as a permanent output gap.

**HH6 — Corporate wage and management policy** (absorbs #52, runs parallel with HH5): per-company
wage setting from vacancy-fill experience and margin headroom, hiring and firing from real capacity
economics, `executionQuality` feeding retention. **Wage drift dies here** — a company that cannot
fill openings raises its offered wage, and that is wage-push. Also closes the `macro/evolution.ts`
wage/tightness defect: nominal wage growth goes negative (−2.5% by week 40) while inflation runs at
10%, a 12% real-wage collapse a year, because the tightness→wage formula has no bargaining
mechanism in it.

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

**PUB1 — Real fiscal counterparty.** Real tax collection (corporate from real quarterly profits
via the S5 ledgers; household from real wages, post-MS); spending decomposed as above; coupons
actually paid to holders out of the account; procurement through real stage-05 bids; the funded
deficit fully derived. **This also closes the asymmetric boundary** §6 has carried: bank sovereign
carry is credited today while the government debits nothing and institutions are denied the same
coupons.

**PUB1b — Sovereign issuance goes through its own book.** Found while closing L7 (§7.46).
`11-fiscal-and-sovereign-debt.ts` PLACES new government paper on holders by scaling their existing
positions and debiting cash — with **no affordability check at all**. It is forced: a real-money
entity that cannot pay still takes the paper, and ends the week with negative cash. Measured at a
large issuance week, institutional cash falls 50.3B in one week against a `LEVERAGE_ALLOWANCE` of
zero for every real-money type. Every clearing stage in the engine respects S11's budget
constraint; this path predates it and does not. The file says so itself — "this is placement, not
underwriting: no fee, no book-building, no auction price discovery" — and 07c, the sovereign
clearing book, already exists. The fix is to route issuance through it, which is what makes an
undersubscribed auction a real event rather than a forced take-up.

**PUB2 — The central bank as a real counterparty.** Seed the CB book from `centralBankShare` of
the sovereign stock; roll maturities as real inelastic at-market bids in 07c sized to redemptions.
Policy then gets a real quantity lever: QT is redemptions not reinvested (real supply 07c must
price), QE a real purchase flow at the effective lower bound. **Retires the ~1e12
`centralBankReservesUSD` scalar and the QE/QT drift** sitting beside real per-bank cash.
Remittances — coupon income minus interest paid on reserves — flow to the government's real
account, closing the loop with PUB1. The CB has no capital constraint and never defaults: the one
balance sheet allowed to be special.

**Verify:** announcing QT steepens the cleared curve through real absorption, not a term-premium
formula; remittances fall mechanically when policy rates exceed portfolio yield (a real, famous
phenomenon the sim should reproduce for free); rising rates visibly crowd out procurement; every
holder of a government bond receives its coupon and the government's account is debited by
exactly the sum.

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
| **Household deposits: two representations** | Sharpened by HH3's seed reconciliation, owned by **HH4**. The banks' `depositsUSD` household-funding line re-derives as the balancing item of the (now much larger) real asset side — 790B USA at seed — while the household state's own `depositsUSD` says 372B. The 418B difference is really unmodeled wholesale/term funding wearing a deposit label, and the two lines evolve by different formulas (the 0.999-decay target vs the savings/interest/net-mortgage-credit build). HH4's cohort budgets make household deposits a real stock the debt service and savings actually flow through; until then, do NOT read bank `depositsUSD` as household money. |
| **Real growth prints escape at horizon** | **Found in HH2, pre-existing, unowned.** Consumption growth −105.91% and GDP growth −209.30% at week 60. A/B against the pre-HH2 tree: −119.87% / −209.30%, GDP identical to four significant figures — so this is not HH2's, and HH2 slightly damps it. **Nothing in §6 recorded it and the harness does not check it**, which is the first thing to fix: a growth rate that can print −200% is a band the harness should assert. Likely the same family as G1b (the price level escaping takes the real deflator with it), but a different symptom and worth confirming separately before assuming so — if real growth is being deflated by an escaping index, the defect is G1b's; if the nominal path itself collapses, it is not. |
| **Bank NIM band** | Was ten breach-weeks; call protection and the ETF work took it to **one** (week 60, 0.0860). Effectively resolved by G2 slice 2 and the free-call fix — keep the harness line, do not open work for it unless it regrows. |

| **`unmodeledFinancialAssetsUSD`** | **The scoreboard for HH, not a watch item.** 1,605B at week 40, and §7.48 identified where 46% of it already is: 740B of insurance reserves, pension entitlements and fund shares sitting on institutional balance sheets as assets with **no holder**. It is not the universe being too small — the model contains it and does not attribute it. HH1 closed that 740B on both sides at once; HH2 added the house (3,188B of stock, 2,127B of home equity), taking net worth to 4,730B and 4.61x income. Watch this line fall toward zero as each slice lands. |

### 6.2 Watchlist — measure, do not fix

| Metric | Why it is here |
|---|---|
| **Damper-bound instruments** | 1,961 persistently bound (3+ consecutive weeks) on the 60-week harness. The number to watch DOWN as the wides get a real buyer base; it rose when the loan book grew, which is expected. Not a defect on its own — a print held away from its solve is only wrong if it stays there. |
| **Index funds without a buyer** | Was 15 of 27; **MS1 took it to 10** by adding households, who index everything and fill all four broad-market funds (§7.47). The diagnosis in this row was partly wrong and worth correcting: the empty all-cap funds were not a universe-size problem, they were a missing SECTOR. What remains — the large-cap and high-yield funds — is the genuine version: ~25 large-cap names and 8–65 HY issuers are few enough for any institution here to research directly, and households buy the broad market rather than a size tier. That closes as HC births, real IPOs and BP1's registry grow the universe. **Still do NOT tune the research-capacity primitive until the funds fill** — that would be fitting a constant to a desired outcome. |
| **Loan-book Spearman noise** | Spearman(leverage, DM) runs 0.26–0.76 across weeks where the bond book holds 0.78–0.93 — consistent with sampling noise at 23–32 names per region. Re-measure as the loan universe grows; if it persists at larger n it is a real defect. |

## 7. Record & lessons (do not re-learn)

1. **"1$ is 1$" is at rest.** Goods-side dollars are fully traceable: real auctions, pro-rata
   clearing (price-priority starves structurally low bidders — never regress this),
   per-lot FIFO input provenance (northwest-corner settlement), capex as real bids (08b
   retired), private sector as named participant, commodities linked to real producers,
   financials reconciled to real lots.
2. **Sovereign demand signals:** an independently-invented fair-yield level has no
   relationship to the bootstrapped curve and saturates one way (runaway). Trend-following
   yield-change signals also run away. Use mean-reverting recent-change signals; sovereigns
   carry no credit risk, so a yield move is a valuation event.
3. **Targets are relative weights on real pools.** `pct × totalAssets` sums to ~2.8× the real
   market; always distribute a real, already-bounded aggregate
   (`ownershipShare × outstanding`) via `distributeRealTargetByWeight`. No caps needed —
   that IS the fix.
   **Amended (§7.18): the helper is correct and it is also a symptom.** Renormalising a 6.4x
   overshoot is the right way to *express* demand, but the overshoot itself is real information —
   it means the asset universe does not match the money pointed at it, and no amount of
   correct renormalisation inside the auction fixes that. Treat a large renormalisation factor
   as a measurement worth reading, not just a number to divide out. Watch it.
4. **Seed shape must equal engine shape.** Cold-start holdings seeded with a different
   per-instrument distribution than the weekly engine produces cause a systemic fake
   rebalancing shock in week 1 (and key by the same ids the engine looks up).
5. **Shared-field collisions** (two writers on one field: `clearedInputPriceIndex`,
   per-segment revenue scalars, multi-line inventory scalars, multi-input fulfillment) have
   caused four separate mass-collapse bugs. When a value is per-X, key it by X.
6. **Cash-constrained bidders ration quantity, not price** — underpricing under pro-rata
   clearing is a permanent shut-out spiral.
7. **Rating agencies lag, spreads don't** — keep the fallen-angel forced re-rate (2+ notch
   or IG/HY-crossing gap bypasses the stochastic rating lag).
8. **Wall Street landed so far:** Phase 1 per-bank balance sheets (padding-clone bug fixed);
   Phase 2 SRF/ON RRP administered facilities; slice 1 corp-bond clearing; generic engine
   extraction; slices 2–3 (sovereign + loans) built and **signed off** — the corporate-OAS drift
   that held S3 open was resolved by §7.16, which took the whole IG cohort from 150–180bp below
   zero to zero negative spreads at any rating. Failed banks still lack deposit flight (known
   gap, revisit in G2).
9. **S1 landed (income/GDP identity + first-year growth).** What was wrong and what fixed it:
   - Tier wage premiums (1.35^tier) were applied on top of a GENERAL wage already set at 62% of
     output per worker, so the aggregate wage bill was 0.62 × 1.4957 = 93% of output and
     household income 106.6% of GDP. Fixed by normalizing the premiums by their
     employment-weighted mean over the baseline occupation mix — relative wages preserved, the
     level anchored. Normalize against the BASELINE mix, never the drifting live one, or a real
     shift toward high-skill work gets silently cancelled.
   - `bootstrap/national-accounts.ts` is now the single owner of the identity (labor share,
     household capital-income share, government procurement share, household tax rate) and of
     the two derivations that must agree: `computeHouseholdDisposableIncomeUSD` and
     `computeExpenditureGdpUSD`. Three of the four shares are chosen primitives; the household
     tax rate is what the identity then requires, and it lands at 13.2% — inside its own
     realistic band, which is the check that the other three are sane.
   - **Four duplicated definitions found and collapsed while doing it**: the occupation-share
     table (written out twice, init + evolution), the `0.35` government-procurement literal
     (three copies: init, stage 03, and absent entirely from stage 11 which counted 100% of
     outlays), the household-income formula (init vs. evolution, materially different), and the
     bilateral trade computation (now `computeBilateralTradeFlows`, shared by stage 06 and init).
   - **Transfers are not purchases.** The GDP identity counted 100% of government outlays as G
     while the demand side spent only 35% of them. Transfers are household income and reach GDP
     through C; only the procurement share is G. Unemployment benefits sit *inside* the transfer
     total rather than on top of it, or they are double-counted.
   - **Cold start must open on the real economy, not a top-down sketch.** Three things were
     seeded from an assumption and stepped the moment week 1 recomputed them for real:
     employment (top-down headcount vs. real company labor demand, −4%), trade (exactly zero
     exports and imports vs. the structural balance, −5.5% of output for the USA), and the GDP
     history (empty). All three now seed from the same computation the weekly step uses.
   - **Real bug found in the growth window:** `[...history.slice(-51), current]` keeps 52 entries
     and compares against index 0 — a "year-over-year" reading taken 51 weeks apart. Now keeps 53.
   - The `Math.pow(1 + smoothedWeeklyRate, 52) - 1` first-year fallback is deleted; it was the
     amplifier that turned the level transient into ~110% headline growth.
   - Result: week-2 USA growth reads **+1.54% against 1.80% potential** (was +113%); the identity
     is asserted exactly at init; 26 weeks across all four regions produce zero non-finite values.
     The residual decay in later weeks is G1's inflation runaway, confirmed pre-existing by A/B.
10. **S2 landed (the yield curve has one owner).** `macro/evolution.ts` no longer computes
    beta0/beta1/beta2 or zeroRates at all; 07c's auction is the curve's sole author. Macro
    reaches it the way it does in reality:
    - **The policy rate reaches the front end through banks' reserve arbitrage.** A bank holding
      a government bond is choosing not to leave the cash at the central bank earning the
      administered rate, so a bond yielding more than the corridor is worth owning and one
      yielding less is worth selling — strongest at the short end, fading along the curve.
      Verified: a forced +100bp policy shock raises the 2Y by 43bp in the first week and ~93bp by
      the third, while the 10Y moves under 20bp. A hike flattens the curve, through demand.
    - **Inflation expectations reach the long end through every holder's real yield**, weighted
      by how much duration the tenor commits — so rising expected inflation steepens the curve
      rather than shifting it in parallel. Verified: 30Y rises 3.81% → 4.41% over 30 weeks as
      expectations climb, while the 2Y stays within ±10bp of the policy rate.
    - **A tilt alone cannot anchor a level.** The first attempt gave participants only a
      cross-tenor tilt; everyone crowded into short paper to escape duration and the 2Y sank
      349bp BELOW the policy rate with nothing to stop it. A bank must also be able to choose
      bonds-versus-cash at all, so the SIZE of its book responds to the corridor, not just its
      shape. That substitution is a treasury decision and belongs OUTSIDE the slow strategic
      drift — folding it inside throttled a hike to under half its real pass-through.
    - **Two real bugs found and fixed doing this**, both instances of §7.4 and §7.5:
      (a) banks carried a scalar `sovereignBondHoldingsUSD` but an EMPTY
      `sovereignBondHoldingsByTenor`, which is the field 07c reads — so every bank opened ~$147B
      under target in a $670B market and bought into it every week, the entire banking sector
      permanently on the bid, expressed as a monotonic slide in yields;
      (b) maturing government tranches left the government's books without leaving their
      HOLDERS' books, so at week 52 banks and institutions owned **1.30x the entire two-year
      float** — bonds that did not exist — and trading that phantom position down against a float
      a third of its former size ran the 2Y from 6% to 25%. Maturity now redeems pro-rata from
      the tenor buckets, banks credited the cash.
    - Result: no spiral, and across all four regions over 60 weeks the 2Y holds a plausible band
      and tracks the policy rate. The deleted `computeSupplyDemandPremium` call in stage 02 went
      with it (it compared an ownership share times sector equity against principal outstanding —
      not commensurable quantities — purely to feed the old curve write).
11. **G1 landed (inflation is measured, not assumed).** `macro/evolution.ts` no longer computes
    inflation at all. `simulation/stages/price-index.ts` builds a real consumer basket — every
    sub-unit households actually buy, weighted by what they actually spend on it — prices it at
    the unit prices stage 05's auction genuinely clears, and takes the 52-week change. Core is the
    same index excluding food and energy. The basket rebases annually onto current spending,
    chain-linked so the level has no step.
    - **What died with it**: the AR(1) series anchored on target, the wage-push term, the
      money-growth term, and a weather shock injected through an invented "3% of the CPI basket"
      weight. The AR(1) had 0.98 persistence, which multiplies any persistent addition roughly
      fiftyfold in equilibrium, and the monetary term's `m2Growth - gdpGrowth` grew without bound
      as measured real growth fell — inflation, through fake real growth, back into inflation.
      Weather still moves prices, but the real way: less supply, higher commodity price, higher
      input costs, higher cleared goods price, measured by the index.
    - **A real bug found doing it, worth more than the feature**: `03-category-demand.ts` rebuilt
      each category's state object from scratch every week and silently dropped every field owned
      by a later stage — above all `unitPriceUSD`, the cleared price stage 05 writes. So the
      bootstrapped per-unit prices (~$70k for some categories) were destroyed in week 1, stage 05
      fell back to its `Math.max(1, seed || 1)` default, and **every price in the economy rebased
      to a ~$1 scale one week into every run**. Anything comparing prices across that boundary was
      comparing two different units. Fixed by spreading the existing entry: a stage writes the
      fields it owns and nothing else.
    - **Sovereign issuance is now placed with real buyers**, the mirror of S2's redemption fix.
      Leaving a new issue unheld made every issuance week a one-sided demand shock — targets scale
      with the outstanding stock, so the whole new issue had to be bought off nobody, and the 2Y
      went NEGATIVE against a ~3% policy rate. Placement is pro-rata to existing holders, banks
      paying from the cash maturity credits them. Not underwriting (no fee, no book-building, no
      auction price discovery — that is still WS8), but it stops handing the secondary market a
      phantom seller every quarter.
    - Result: inflation starts near target, is bounded and mean-reverting over 120 weeks in all
      four regions (CPI 82–117, peaks reversing) rather than climbing monotonically past 11%; the
      Taylor rule now moves against a real statistic; the 2Y tracks the policy rate across 60
      weeks with no negative yields; **real growth reads positive in every region at week 26**
      (2.9%–6.1%, against −14% before); and the revenue-ratio diagnostic is the healthiest this
      project has recorded (median 1.00, 2 violations at week 60, against 20–118 in earlier phases).
    - **Residual, recorded not fixed**: inflation is volatile, swinging ±10–17% over a year.
      Decomposition shows it is broad-based across the basket rather than one pathological
      category, so it is a genuine price cycle in the goods auction — amplified by the fact that
      monetary policy has no demand-side transmission channel yet, so the Taylor rule can respond
      but cannot stabilise. That channel is G2 (real lending) plus household rate response (MS).
12. **S3 — three structural bugs, each found by tracing a number to its source.** (S3's one
    remaining item, the negative corporate OAS, was closed by §7.16 — see §7.8.)
    - **The leveraged-loan market did not exist.** `generateDebtTranches` decided each rung with
      `cumulativePrincipalAssigned < fixedShare * debtBase`, and cumulative principal is zero at
      the first rung — so the first tranche was FIXED for every issuer including CCC. Most issuers
      carry a single blended tranche, so most were 100% fixed and **the floating float across the
      entire market was zero**: 07d cleared nothing, and every company's `discountMarginBps` sat
      frozen at its seed while its OAS moved (DM/OAS drifted 0.85 → 0.16). `FIXED_SHARE_BY_RATING`
      was already right — investment grade funds with bonds, sub-investment grade funds with
      floating-rate term loans, which is what a leveraged loan is. Testing each rung's MIDPOINT
      against the target delivers that.
    - **Corporate holdings did not track the corporate stock** — the same defect S2 fixed for
      sovereigns. By week 24, 130 of ~184 issuers had institutions holding more than the issuer's
      entire float. Since price impact scales with flow over float, trading phantom positions
      against a shrunken float fanned spreads to −1097/+1757bp and loan margins to −1783/+471bp.
      `settleCorporateActionOnHolders` now moves holders' positions with any change in an issuer's
      float. **Where the snapshot is taken matters**: taken after the call block (the first
      attempt) it missed the largest source of change and barely helped.
    - **The "accretive call" was deleveraging, not refinancing.** It retired a tranche with cash
      whenever the coupon exceeded the market rate and stopped there — so the issuer's debt shrank
      every time rates moved in its favour. The corporate bond float halved inside six months and
      73 of 200 issuers had no bonds left: the asset class 07b exists to clear was disappearing.
      A call for value is a refinancing — replace the bond at today's rate and keep the money; the
      saving is the lower coupon, which the code's own `rateSavingsIfRefinanced` already measured.
    - **Lesson, generalised**: a market cannot be signed off by watching its price. Watch its
      FLOAT and its HOLDINGS first — every one of these was invisible in the spread series and
      obvious the moment the outstanding stock and who owned it were put side by side.
13. **S4 landed (money moves with the securities).** `clearFinancialAsset` now returns
    `netCashDeltaByParticipantId` — every fill's cash leg, net of the bid/ask the participant
    paid — and all three adapters apply it: institutional entities against a new real per-entity
    `cashUSD`, banks against their own reserves. Before this, a participant's holdings changed
    every week with nothing on the other side of the trade: a market on one side of the ledger.
    - **Dealer revenue now comes from the same place the clients' money goes.** It was charged on
      the NET of client flow per instrument; netting a buyer against a seller is the dealer's
      whole business, but it does not mean the desk waived its bid/ask on both sides. Taking the
      desk's revenue as the sum of what clients actually paid makes the two figures the same money.
    - **The formula drift on bank sovereign holdings is gone** (`macro/banking.ts` pushed them
      toward 18% of the loan book every week regardless of what the banks had traded, while
      02b already summed the real per-bank books — two accounts of one holding).
    - **A new invariant keeps it honest**: an institution's cash plus securities may only move by
      real flows. Measured worst single-week move over 40 weeks is 0.47% against a 5% threshold;
      before the cash leg existed nothing would have caught its absence.
    - Verified: entity cash moves while securities hold and the combined book is conserved; banks
      fund bond purchases from reserves and reach for the SRF when they run low, which is the real
      behaviour Phase 2 already models; capital ratio unchanged versus baseline (#67 unaffected,
      as expected).
14. **RV demand side landed (allocation responds to price).** `stages/asset-allocation.ts` asks
    the question a static percentage cannot: does this asset class currently pay for itself?
    `excess = (spread earned − expected credit loss) − (capital charge × required return)`. Every
    term is real and already computed — the cleared OAS or discount margin, the issuer's own
    expected loss from its leverage and coverage, and what regulation costs an institution to hold
    the asset. The policy percentage becomes the centre of a band and the book sits inside it
    according to that test; money released becomes real cash on the entity's balance sheet, which
    is why S4 had to come first.
    - **Why it can act on the level when a tilt cannot**: it scales the SIZE of the real, already
      bounded pool instead of redistributing a fixed one, so it does not renormalize away. Same
      mechanism S2 gave banks when it let them choose bonds versus reserves, now generalised.
    - **It is not an invented fair-value level** (§7.2's failure): the comparison is against the
      entity's own cost of capital and the asset's own expected loss, both real.
    - **A ratchet found on the first attempt**: applying the tilt to a target that is itself
      anchored on current holdings feeds back — selling lowers the book, the lower book lowers the
      target, the lower target sells again. That ran spreads monotonically 78bp → 1388bp, the same
      failure as the drift it was meant to stop, in the opposite direction. The tilt must apply to
      the STRUCTURAL target, which is then drifted toward. S2 hit exactly this: the bank reserve
      substitution only transmitted properly once it sat outside the slow drift.
    - Result: corporate spread drift halved (median −350bp → −203bp at week 36), loan margins
      median −93bp → +101bp, book conservation holds at 0.40% worst week, and the revenue-ratio
      diagnostic returned **zero violations at both week 45 and week 60** — the first clean run
      this project has recorded.
    - **What it cannot do alone, by construction**: decide how much paper exists. That is the
      supply half.
15. **RV supply side landed (the float responds to its own price).** `stages/corporate-financing.ts`
    gives each issuer the decision every other change to its debt stack lacked: whether debt is
    worth raising at the price the market is quoting *this week*. It compares the after-tax cost of
    its own cleared spread against the better of what capital earns inside the business and its own
    earnings yield — the two real uses of opportunistic debt — and issues, holds, or pays down.
    - **The one hard limit is real**: a covenant-style leverage ceiling by rating, because lenders
      do not fund unlimited leverage, and no market access at all for defaulted issuers. That is a
      lending constraint, not a clamp on a price.
    - **Result — the restoring force works.** Spreads stopped drifting monotonically and started
      oscillating: over 80 weeks the float grows 77B → 104B into tight spreads, the spread recovers
      from −22bp to +86bp as that supply arrives, then the deleveraging leg runs (113B → 98B). The
      simulation now produces a credit cycle, which it previously had no mechanism to generate.
    - **Lesson**: a price that will not stay put usually means one side of its market is missing
      entirely. Corporate spreads had investors who could not leave and an issuer who never chose
      to issue; no amount of tuning either side's *reaction* would have bounded it, because the
      quantity of paper was fixed by construction. Ask what is structurally absent before tuning
      what is present.
    - Residual is amplitude rather than direction — closed and re-measured in §7.22.
16. **E1 landed: the engine prices a demand schedule, and hedge funds are in it.** The clearing
    engine is now a real double auction. Each participant posts a per-instrument schedule —
    reservation level, full size, and the range it scales in over — and `solveClearingStat`
    bisects for the level where total demanded quantity equals the tradable float. The reservation
    level is the RV economics used as what they always were: a **price** (expected loss + capital
    charge × required return on capital + credit conditions).
    - **Measured, against the numbers that condemned the old engine.** Spearman(OAS, institutional
      ownership share) fell from **−0.731 to +0.05…+0.22** — ownership is no longer the dominant
      driver of a name's spread. Spearman(leverage, OAS) rose to **0.78–0.93**. Negative spreads:
      **zero**, at every rating, every week measured. Median OAS by rating is strictly monotonic
      (AAA 187 / AA 188 / A 216 / BBB 306 / BB 737 / B 1047 / CCC 1253 at week 40) at levels a real
      credit market occupies.
    - **Hedge funds are a fourth institutional type**, not a bolt-on: 7% of sector assets, a 22%
      required return on capital, a credit-heavy allocation with a real cash sleeve, and a 4.0×
      conviction multiple. Their high hurdle is the point — absent when paper is expensive, bidding
      when it is cheap enough. This closes the "marginal buyer missing at the wides" item.
    - **Three defects surfaced only once the engine started using these numbers as prices**, and
      each is a case of a quantity-era approximation that was harmless as a nudge and fatal as a
      price:
      1. `computeExpectedLossSpreadBps` used the raw logistic as an annual default probability
         (~98% for a stressed borrower). Now capped and shaped to a real range; **the cap must stay
         consistent with the recovery rate** — at 30%/yr the expected loss exceeded what the
         recovery-value price floor can pay, so B and CCC had no bid anywhere and printed the
         ceiling. 15% is both consistent and closer to observed worst-cohort default rates.
      2. The investment-grade mandate was modelled as a **prohibition** (size zero). Insurers and
         pension funds are 60% of sector assets, so a downgraded name lost 60% of its buyer base
         with nothing replacing it and no clearing price existed. Replaced with what really
         constrains a regulated book: a punitive sub-IG capital charge plus a modest sleeve limit.
         Critically, the sleeve factors are then **normalised per name**, so rating decides the
         *mix* of a name's register rather than shrinking it — a downgrade rotates ownership from
         insurers to high-yield and distressed funds instead of deleting demand.
      3. The auction had no economic upper bound and returned its **search bracket** (50,000bp) as
         a spread whenever demand could not absorb the float. `ClearingInstrument.maxStat` was
         given a bound derived from the recovery-value price floor (−ln(recovery)/duration).
         **This third fix was wrong and has been retired — see §7.20.** A bond trades below
         recovery routinely, and that gap is exactly where a distressed investor earns its
         return. The bug it fixed (a search bracket printing as a price) was real; the economics
         used to fix it were not. Recorded here rather than quietly amended, because the mistake
         is instructive: it is easy to justify a bound with a plausible-sounding real-world story
         and much harder to notice the story is only true for a participant who is not in the
         market yet.
    - **Lesson (the general one).** A number that is *directionally* right is good enough to nudge
      a quantity and not good enough to be a price. Converting a quantity mechanism into a pricing
      mechanism re-audits every input it touches, and it will find approximations that have been
      invisible for as long as nothing divided by them or solved against them. Budget for that
      re-audit as part of any such conversion rather than treating the failures as regressions.
17. **The phantom leveraged-loan market (found while verifying E1).** The bond book was fixed and
    the loan book still made no sense: DM pinned at identical values across A through B, CCC
    quoting inside AAA, Spearman(leverage, DM) decaying to 0.26. Cause: `Company.leveragedLoan` was
    attached to **every** company at generation, but **167 of 200 had no floating-rate debt at
    all**. 07d correctly skips a company with no loan, so those quotes were never cleared — they
    sat frozen at their generation-time value forever and dominated every published statistic.
    - Fixed by making the field optional and giving 07d ownership of its lifecycle: a quote opens
      when floating debt appears (priced off the issuer's own bonds at the senior-lien discount)
      and is retired when the debt is repaid. The loan market now reports 23–32 real loans instead
      of 200 mostly-fictional ones, monotonic by rating (AA 172 / A 232 / BBB 304 / BB 655 /
      B 875 / CCC 919) and correctly inside the same issuers' unsecured spreads.
    - **Lesson**: when a market's statistics look random, first check how many of its instruments
      are actually *in* the market. A stage that correctly filters its inputs does not clean up the
      records it filtered out — and a stale record is indistinguishable from a live one downstream.
      Worth a sweep: any other optional-in-spirit field attached unconditionally at generation.
18. **The money and the assets were never reconciled** (measured while reviewing §7.16).
    Aggregate institutional money roughly matches the aggregate investable universe — USA week 0
    is ~846B against ~857B — so this is **not** a general money glut. The composition is what is
    broken, and it is broken in exactly one place:

    | USA, week 0 | available to institutions | targets want | ratio |
    |---|---|---|---|
    | Equity | 615B | ~340B | 0.6x |
    | Sovereign | 201B | ~250B | 1.2x |
    | **Corporate credit (bonds + loans)** | **41B** | **~262B** | **6.4x** |

    - The missing supply has a name and a size: the hidden corporate sector carries **549.4B of
      debt, 86% of all corporate debt in the region**, as a scalar nobody can own. Making a
      realistic share of it investable closes almost exactly the gap measured. → §5-HC.
    - **Method note worth keeping.** The first version of this measurement read a nonexistent
      sovereign field, reported 0, and made the imbalance look like a 1.3x aggregate money glut
      rather than a 6.4x credit-specific shortage — a wrong diagnosis that would have sent the
      work somewhere useless. When a probe reports a round 0 for something that should be large,
      verify the field name before believing the number.
    - **Lesson.** Two of the last three major credit defects were the same shape: a market whose
      *mechanism* was fine and whose *inputs* were not (a demand curve over a quantity target;
      an auction over a 6x-short float). Before rebuilding a mechanism, measure whether the
      thing it operates on is the right size. Cheap to check, and it reorders the work.
19. **Implementation review, post-E1 (high-level; what stands, what needs refinement).**
    Reviewed: S1, S2, G1, S3, S4, RV both halves, E1+hedge funds, the phantom-loan fix.
    **Sound as built, keep:** the national-accounts module (single owner, asserted); the measured
    CPI; the single-owner curve with bank reserve arbitrage as the policy channel; the
    double-auction engine and its thin adapters; `corporate-financing.ts`'s CFO decision; the
    cash legs on every fill. None need redoing.
    **Needs refinement — each recorded where it will be fixed:**
    1. **Two default models.** The market prices a logistic PD
       (`computeExpectedLossSpreadBps`) while actual defaults fire on a different deterministic
       rule (stage 08: `newCash < 0 && newCoverage < 0.8`). Expected loss and experienced loss
       are two representations of one real thing — rule 3's anti-pattern, in the most
       price-critical spot in the credit stack. One default model must own both: the hazard the
       market prices IS the hazard that fires (E2 owns the pricing side, G5 the realization side,
       and realized recoveries must calibrate the priced LGD).
    2. **The per-name weight normalisation in 07b guarantees demand ≈ float by construction.**
       It was the right fix for the prohibition-era no-bid collapse, but it means the market as a
       whole can never be genuinely short of buyers — scarcity of distressed capital cannot
       depress prices because shares always renormalise to 1. Part of why the ceiling-pinning
       went away is construction, not economics. Once entities have real budgets and E2
       gives distressed buyers real recovery-based bids, **delete the normalisation**: sizes come
       from real sleeves and real money, and the dealer absorbs what genuinely finds no buyer.
    3. **The dealer has no balance sheet.** Residual float parks in dealer inventory with no
       capital charge, funding cost, or limit; its revenue is credited to banks by a share key.
       G3 must make the desk a real part of a named bank's balance sheet.
    4. **Demand curves are near-parallel across entities** — same expected-loss estimate, one
       shared `FULL_SIZE_SPREAD_RANGE_BPS`; only the capital term differs. The clearing level is
       therefore set by whichever entity is marginal, with little real heterogeneity behind the
       slope. Real dispersion comes from real liability differences → G6 derives each entity's
       hurdle and duration need from its liabilities and retires the `REQUIRED_RETURN_ON_CAPITAL`
       and `INSTITUTIONAL_REAL_RETURN_BPS` constants.
    5. **The hedge fund exists twice** — company-level `aumUSD` (revBase×20) and entity-level
       `totalAssetsUSD` (share of the macro pool) are two unreconciled representations of one
       balance sheet. Fold the link into the derived `totalAssetsUSD` (done — §7.21).
    6. Dead code and a stale header survive from the quantity-target engine (see §6) — S10.
20. **E2 landed: two pricing regimes, one default model, no ceiling.** Three connected changes:
    - **The priced hazard is now a structural forecast of the real default trigger.** The logistic
      on (leverage − coverage) with its tuned cap/midpoint/width is gone.
      `computeAnnualDefaultProbability` asks how large a relative EBITDA shock would put the
      company inside the actual trigger — coverage below `DEFAULT_COVERAGE_FLOOR` AND cash
      exhausted, the AND honoured by taking the larger required shock, so a levered company with
      a real cash runway is safer than its coverage alone says — and how likely that shock is
      given the company's own measured revenue volatility. The trigger constant is defined once
      and imported by stage 08's default check and credit.ts's rating ladder: priced risk and
      realized risk are one model (§7.19 item 1 closed on the hazard side; G5 closes recovery).
    - **Distressed paper prices off recovery, as a second regime, not a bound.**
      `computeDistressedReservationSpreadBps`: expected terminal value (recovery on default over
      a 2-year workout, par on survival) discounted at the fund's 22% hurdle, converted to
      spread. Measured: the HF reservation sits ~795bp on performing paper (it holds ZERO
      investment grade; its corp book is 100% HY vs the insurer's 11.6%) and its bid arrests a
      genuine widening around 1,200–2,700bp depending on the issuer's real PD. `maxStat` and
      `recoveryImpliedMaxSpreadBps` are deleted; the engine's brackets are labelled numerical
      guards and nothing hit them in any measured week.
    - **The IG ladder's slope now comes from the real place: rating- and duration-granular
      spread-risk capital** (`spreadRiskCapitalChargeRate`, Solvency-SCR-shaped). This was forced
      by an honest failure worth recording: with the structural PD, expected loss on ALL
      investment grade is a truthful ~0bp, and with the old flat-within-IG capital charge every
      IG reservation collapsed to the same number — AAA through BBB printed identical medians.
      Real IG spread differences are mostly risk-capital premium, not expected loss, and every
      real capital regime steps the charge by notch and scales it with duration. With the real
      structure in: AAA 160 / AA 161 / A 173 / BBB 222 / BB 394 / B 560 / CCC 576 at week 40,
      loans strictly monotonic (Spearman 0.86–0.90 at real n), ownership correlation still weak
      (0.11–0.18), zero negative spreads, zero guard hits.
    - **Lesson:** when a defensible model change flattens a distribution, the missing dispersion
      was probably being smuggled in by the old model's error. The logistic's inflated PDs were
      doing the capital schedule's job; making PD honest exposed that the capital side had been
      flat all along. Fix the newly exposed structure, don't re-inflate the input.
21. **S11 landed: bids are bounded by money, books are marked, income is real.** Four changes,
    one balance sheet (`stages/institutional-balance-sheet.ts` + engine support):
    - **Income leg completed.** Companies always EXPENSED their debt interest; the receiving side
      did not exist — dollars leaving a real book and arriving nowhere. Holders are now credited
      weekly off the issuer's own real tranche terms (bond coupons, loan interest at policy +
      margin). Sovereign coupons deliberately NOT credited: the government does not pay them yet
      (BP5); crediting the holder without debiting a payer would create money.
    - **Budgets.** `ParticipantDemand.maxNetPurchaseUSD`: what an entity can ADD in a week is its
      real available cash plus the leverage its type genuinely runs (hedge fund 0.5× assets,
      everyone else none), apportioned across asset classes by its own targets and across names
      by structural size. A cash-constrained bidder rations quantity (§7.6). Measured over 60
      weeks with NO clamp anywhere: worst cash/assets = 0.0% for insurers/pensions (fully
      invested — real-money behaviour), +14% floor for the hedge fund (real dry powder). The
      pre-S11 state was −10% for everyone, permanently.
    - **Marking.** `totalAssetsUSD` = cash + book, recomputed weekly after clearing; the week-0
      mark corrected a bootstrap inconsistency between the seeded label and the seeded book
      (§7.4's lesson, again). Institutional AUM on manager/HF companies now derives from the
      entity's marked book — one balance sheet, one representation.
    - **The per-name normalisation is deleted** (§7.19 item 2 complete), and deleting it forced
      the engine fix it was hiding: when the buyer base's combined capacity cannot absorb the
      float at ANY level there is no crossing, and the old solve returned the search bound as a
      price. `solveClearingStat` now clears at the SATURATION point — the least aggressive level
      at which every willing buyer has taken full size — with the dealer holding the genuine
      residual. A bound is not a price; the widest level any actual buyer needed IS.
    - Calibration made honest along the way: the asset manager's sub-IG size factor is 2.0
      (dedicated high-yield fund complexes make asset managers the majority holders of real HY
      markets), replacing the 1.0 that only worked while normalisation redistributed.
    - **Known, accepted intermediate state:** HY meds cluster at the distressed backstop
      (~900–1000bp; BB/B/CCC compressed together) because at real sleeves the HY buyer base is
      genuinely short of the HY float — §7.18's composition shortage expressing itself honestly
      in the one segment where regulated sleeves are thin. Do NOT tune sleeves to a spread
      target; HC Wave 1's calibration gate (HC5) rebuilds supply and buyer base together and is
      where this resolves. Also open: budget slices follow FIXED target percentages — money does
      not yet chase the cheap asset class across books; that is G6/RVr's expectations-and-
      liabilities work. IG unchanged and correct (AAA 157 / AA 157 / A 171 / BBB 215 at wk40);
      Spearman 0.74–0.87; ownership correlation 0.06.
22. **RVr closed: the credit cycle's amplitude is real, and the residual was never amplitude.**
    Re-measured over 120 weeks post-E2/S11/HC-Wave-1, as the item required:
    - **Price amplitude is healthy.** Median IG OAS breathes over a 75bp band (166–241): tights
      draw real issuance, the supply lands on budget-constrained buyers and spreads widen to
      ~240, issuance slows, spreads ease. A genuine two-sided cycle, no negative spreads, no
      overshoot — the thing RVr existed to create. The expectations channel (G1b item 3) is NOT
      needed for credit amplitude on current evidence; it remains a goods-market question.
    - **The quantity drain was a real defect, found and fixed here.** `decideCorporateFinancing`
      measured "what capital earns in the business" as EBITDA over debt + MARKET cap — the CFO's
      internal hurdle was a function of the stock market's mood, so rich equities made every IG
      firm read its 150bp debt as too dear (33 of 60 sampled IG names delevering perpetually;
      the float halved in 60 weeks). Replaced with return on INVESTED capital (NOPAT over net
      PP&E + working capital) plus a real deployment-flow cap — cheap coupons do not create
      projects; covenants bound the STOCK of debt, the pipeline bounds the FLOW. Float now grows
      into tights and oscillates (~130B) instead of draining.
    - **The remaining issuer decay is a default-rate problem, not a financing one:** 59 of 196
      public firms default by week 121 (~13%/yr vs a real ~1–2%) while the private tier — real
      ladders, clean cash walk — shows zero, isolating the cause to the public path's cash
      accounting. S5 owns it; re-measure the decay after S5. HC8's births are the structural
      counterweight either way. Recorded in §6.
23. **S5 landed: the cash walk is one explicit ledger, and it immediately found two things.**
    `post(label, amount)` is the single write path to a company's cash; `lastCashLedger` stores
    the week's named entries and the identity Σ(entries) = Δcash verifies to the dollar. The
    four leaks died as consequences: the EBITDA/settled-sales/productionCost triple-count is
    replaced by settled auction flows plus accruals only for what the auction does not settle;
    dividends actually leave; the prepayment retires REAL tranches nearest-maturity-first (the
    old version debited cash and decremented a scalar the ladder recomputation silently restored
    — cash gone, debt not); mergers transfer the target's cash. Cash taxes now exist as a flow.
    Public defaults by week 121: 59 → 46; issuers 237 → 261.
    - **Ledger finding #1 (fixed in-pass): dividends were 10x real.** Sized as yield x market
      cap on the known-inflated equity levels, they bled 15–25M/week from companies selling
      20M/week — invisible for as long as dividends never actually left cash. Now bounded by the
      board's real constraint: a payout ratio of earnings (`MAX_DIVIDEND_PAYOUT_RATIO`), with
      the declared yield honored only when earnings cover it. Retire the bound into real payout
      policy at WS4 when the equity level becomes real.
    - **Ledger finding #2 (NEW ROOT CAUSE, recorded in §6): firms buy ~2x what they sell.**
      Sampled ledgers show settled auction purchases running about twice settled sales week
      after week (e.g. 37.5M vs 17.5M) — the real CASH margin of the goods business is deeply
      negative while the formula EBITDA margin reports +18%. Two representations of one real
      thing, at the heart of the stage 05/08 reconciliation, and now the leading suspect for the
      residual ~10%/yr public default rate and for #18's revenue-floor residual. This was
      invisible before the ledger existed, which is the ledger's whole argument.
24. **The fantasy contract flow — the S5 ledger's finding #2, root-caused and fixed.** Supply
    contracts were sized by a hardcoded random ladder (`Math.random() * 10000 + 2000` units/week
    for most categories) with NO relationship to the buyer's real need. For a five-figure-per-
    unit input like upstream_extraction, one contract committed a buyer to 35M/week against an
    8.5M/week revenue — measured: 48 weeks of revenue piled up as unusable input inventory, and
    ~90% of the auction's apparent volume (8.9B/week of "sales", 6.9B of it Energy) was this
    churn. For as long as cash never settled (pre-S5) it was invisible. Fix: a contract is the
    LOCKED-PRICE FORM OF THE BUYER'S REAL DEMAND — quantity = a share of the weekly need the
    buyer's own bid already expresses (CONTRACTED_DEMAND_SHARE), capped by the supplier's real
    offer; spot covers the rest. Measured after: every sector's settled purchases sit BELOW its
    settled sales (P/S 0.04–0.58, from 2.7–7.5x), and honest auction volume is ~0.7B/week — the
    other 8.2B never corresponded to any real need.
    - **Lesson:** when a flow's PRICE side is made real but its QUANTITY side still contains an
      invented number, settling the cash converts the invented quantity into a real damage. Every
      quantity in a settled flow deserves the same "where does this number come from" audit that
      prices got.
25. **S6 landed: every duplicate price-setter deleted; one statistic, one owner.**
    - Engine: stage 12 marks player corp-bond positions off the CLEARED OAS and loans off the
      loan's own CLEARED discount margin (deleted the ownership-premium re-adjustment and the
      bucket-premium re-derivation); `priceLeveragedLoan` is now a pure DM→price converter
      (deleted its internal OAS×senior-lien-discount second setter);
      `computeBucketDemandPremiumBps` and `computeSupplyDemandPremium` are deleted outright.
    - UI: CompanyDeepDive prices tranches from cleared stats via pure converters (deleting a
      pasted copy of the old engine formula plus its x1,000,000 stale-unit bug); RatesScreen
      reads the cleared curve at zero spread (deleting an invented sovereign-rating premium);
      DiagnosticsModal shows real engine aggregates only (deleting the fabricated micro-model:
      baselineCapex = n×$50, a nonexistent pricingPowerMarkupPct, hand-rolled wage-push/capex
      formulas, hardcoded "/200" and "~40% recovery"); OverflowMenu uses the real sim calendar;
      MyBook reads `portfolio.startingCapitalUSD`.
    - `scripts/invariants.ts`: the sovereign-absorption check now shocks the fields the market
      ACTUALLY reads (per-bank `cashReservesUSD`, per-entity `cashUSD`) instead of two macro
      scalars the engine stopped reading at S2/S11 — measured, the shocked 10Y prints +6.5bp
      over baseline in week 1, widening to +12.7bp by week 4. A check that shocks retired fields
      is a check that tests nothing.
26. **S7 landed: one holdings ledger, and it exposed a hidden sovereign collapse.**
    `stages/holdings-view.ts` is now the single derivation of every sector-level holdings figure.
    The real books the clearing stages write (per-entity `itemizedHoldings`, per-bank tenor books,
    dealer inventories) are the ledger; everything sector-level is a projection of them,
    refreshed in stage 11 after every clearing stage has written.
    - **Two opposite defects died together.** Stage 11 rebuilt both sector `itemizedHoldings`
      every week by attributing share×outstanding across issuers with a greedy fill — a parallel
      formula ledger sitting beside the real per-entity books, free to disagree. And the macro
      aggregates (`corpBondHoldingsUSD` and siblings) were written ONCE at initialization and
      never again — frozen week-0 snapshots that the UI, stage 08's institutional book value and
      stage 02's investment income all read as current. A formula-built ledger and a frozen
      aggregate, neither reconciled to the real books.
    - Stage 02's macro investment-income accrual is deleted with them: it applied a flat margin to
      three aggregates and accreted the result into sector cash and equity weekly — a second
      income stream beside S11's real coupon credits, and a second writer of now-derived numbers.
    - A per-instrument conservation invariant is added: entity books + bank books + dealer
      inventory must not exceed outstanding (a ledger that claims more is minting claims).
    - **The finding, and it is the item's whole justification:** with the aggregates live rather
      than frozen, USA institutional sovereign holdings are seen to collapse from ~284B at week 20
      to ~1B by week 40, with entity cash ballooning 20B → 309B. The books were doing this all
      along; the frozen aggregate reported a steady 201B and nobody could see it. Root-cause
      recorded in §6 — the demand schedule lets a holder go to 100% cash when its reservation
      yield sits above the cleared yield, which is directionally right and unbounded in magnitude
      (real money does not liquidate an entire asset class in twenty weeks).
27. **Sovereign collapse fixed; the optimization pass; and G1b is now the dominant defect.**
    - **Anchored inflation expectations.** The sovereign reservation yield used the raw current
      expectation at every tenor, so a 16% inflation print demanded 17.5% on a 10-year bond
      paying 3.2%: demand went to exactly zero and institutions liquidated their whole sovereign
      book (§7.26's finding). Replaced with the term structure of inflation expectations — a bond
      prices the AVERAGE expected inflation over ITS OWN tenor, with the deviation from target
      decaying at a mean-reversion time constant, so short tenors track the print and long ones
      converge on the target. This is the defining property of a credible inflation-targeting
      regime, not a damper.
    - **Liability-driven core** (`ParticipantDemand.minHoldingUSD`): an insurer matching claim
      reserves and a pension fund matching a benefit duration cannot liquidate their government
      book because yields look poor this week — the liability is still there and something has to
      match it. A mandate expressed as SIZE, never as a price, exactly like the sub-IG sleeve.
      G6 replaces the modelled share with real liability profiles.
    - Measured at week 42 against the same seed: institutional sovereign book **0.0B → 133.0B**
      (the core holds), 10Y **21.6% → 5.1%** on a 57% inflation print.
    - **Optimization: the weekly step is 5.7x faster** — 5,280ms → 924ms. Stage 05 went
      3,832ms → 233ms (16x) and stage 09 324ms → 39ms (8x). Every win was the same defect: an
      index that should be built once per week was rebuilt inside a per-item loop. Stage 05
      re-derived the region's firm list, its per-sub-unit supplier list and its contract totals
      inside EVERY sub-unit's auction (~40 sub-units x 4 regions x ~2,000 firms); stage 09
      rescanned the whole contract array and company roster per company; stage 08 did a full
      array scan per company for entity lookup, region equity cap and input-supply checks.
      **Lesson: profile before optimizing.** The first pass hoisted the firm-list filters and
      bought only 6% — the real cost was the O(firms x contracts) contract scans, which the
      profile named and intuition had not.
    - **G1b is now the largest defect in the simulation and should be next.** Inflation is not
      merely volatile, it is a runaway: measured 12.7% by week 26 and 57% by week 42, dragging
      reported real growth to −18%. Everything downstream (the sovereign curve, real rates, the
      Taylor rule, growth) is being measured against it. The sovereign fix above bounds the
      market's RESPONSE to the spiral; it does not touch the spiral.
28. **G1b root cause found and fixed: production capacity was denominated in dollars.**
    Stage 05 sized a supplier's weekly output as `annualRevenue/52 x shares x response` and then
    divided by the CURRENT unit price to get units. So when a category's price rose, the same
    plant produced FEWER units — supply fell as price rose, which is the wrong sign and closes a
    positive feedback loop: shortage → higher price → less supply → worse shortage.
    - **The measurement that found it.** Tracing every category rather than the index: the MEDIAN
      category never moved (x1.00) while a handful ran away — defense_systems to 9.3x,
      pharmaceuticals 9.3x, passenger_vehicles 6.3x — and in every spiralling one SUPPLY WAS
      COLLAPSING as price climbed (defense_systems 49 → 22 units against demand of 1,255). An
      economy-wide monetary story cannot produce a flat median; a broken supply response can.
    - **The fix is the real mechanism:** `ProductLine.weeklyCapacityUnits` — capacity is a
      physical stock in UNITS, seeded from the line's real baseline output and evolved by real
      net investment (growth capex less depreciation over the capital stock, a ratio, so
      inflation cancels). Price now decides how hard the plant is RUN, never what it can make.
    - **Measured, same seed:** inflation was 15.7% (wk35) → 38.3% (wk40) → 78.7% (wk45), a
      monotone runaway. Now −3.9% → −13.1% (trough) → −7.6% and recovering. defense_systems
      supply 22 → 1,534 units against demand of 1,626 — the supply response works.
    - **Residual, stated honestly: the runaway is gone, the CYCLE is not.** Over 110 weeks
      inflation oscillates roughly ±20% (USA +21.6% at wk60, −10.5% at wk100; JPN spikes to 62.8%
      at wk110) and reported real growth is very nearly its mirror image, because nominal GDP is
      comparatively flat and the whole swing lands in the deflator. That is the classic cobweb of
      G1b item 1, now isolated to its own mechanism rather than compounded by a broken supply
      curve. Next diagnostics: the capacity-utilisation response (`productionResponseFactor`
      ±50% on a smoothed price may over-respond), the seeded capacity LEVEL (an initial deflation
      to −13% suggests the cold-start floods supply), and G1b items 2/3 — monetary transmission
      (G2) and an expectations term in real bid/offer pricing.
29. **S8 landed — and its contagion fix was most of G1b's remaining cycle.**
    - **Credit contagion now decays.** `recentDefaultsCount` counted every company that had EVER
      defaulted, so a default in week 3 still tightened credit in week 200 — a permanent scar
      that could only ratchet upward, and with the universe at 2,000+ firms it dominated the
      signal entirely. Now: defaults inside a rolling 52-week window, weighted so the freshest
      carry most of it, plus the currently-distressed cohort (a live state, not a memory).
      Companies record `defaultedWeek` so the window is real.
    - **`clearedInputPriceIndex` measured week-over-week while every consumer read it as a level
      versus baseline** — two periodicities in one field, exactly what rule 9 exists to catch.
      A fixed `baseUnitPriceUSD` is now captured the first time a category clears.
    - **Housing supply was a frozen number.** It read `inventoryLevelUSD`, which never updates for
      output-only categories, so the supply/demand ratio driving house prices was a constant
      pretending to be a market signal. Now the real cleared output units against real demand.
    - **Measured (110 weeks, same seed), and this is the headline:** before S8, inflation
      oscillated ±20% (USA +21.6% at wk60, −10.5% at wk100; JPN spiking to 62.8%). After, every
      region sits in a narrow band with NO spikes — USA −2.8% to −7.7%, UK −0.5% to −8.1%,
      JPN −2.0% to −12.1%. The permanent contagion scar was driving the boom-bust.
    - **What remains of G1b is now a LEVEL problem, not a cycle:** a persistent mild deflation of
      roughly −3% to −10% against a 2% target. That is the cold-start capacity level (§7.28's
      note that seeded capacity floods supply) plus the still-absent monetary transmission (G2)
      and expectations channel — a much smaller and better-posed problem than the runaway or the
      cycle it replaced.
30. **S9 landed: player flow is real client flow to a real dealer desk.**
    - **The trade touched nothing.** `executeTrade` sourced a position by walking down the sector
      `itemizedHoldings` — which S7 had just turned into a derived view, rebuilt from the real
      books every week. Every write was silently discarded: the player could buy any size and no
      book anywhere changed. Now the order moves the real **dealer inventory** the clearing
      engines maintain, so the player's impact arrives through the mechanism that already exists
      (the engines read prior inventory and lean on it) rather than a bespoke impact formula.
    - **Both sides paid the markup.** `resolveCounterpartyFill` marked the fill UP whether the
      player was buying or selling, so a round trip lost the spread twice. A buyer now lifts the
      offer and a seller hits the bid, and the fill is sourced against the desk's real axe.
    - **Maturities paid principal the player never funded.** This book is margin-financed —
      opening a position commits margin and pays the spread, never the notional — but redemption
      credited the full face value AND stage 13 then added the realized P&L on top of it, since
      it sums both into the week's cash. Money from nowhere, twice, on both the corporate and
      sovereign maturity paths. The contractual payout still sets the price (par, or recovery on
      default); what settles is the gain or loss against entry.
    - Recorded because it generalises: **a write to a derived view is a write to nothing.** S7
      converted these aggregates deliberately, and any code still writing to them is now a silent
      no-op rather than a visible error. Worth a sweep as later items convert more state to views.
31. **WS4 landed: the stock price is cleared, and three things fell out of it.**
    - **The price.** `07e-equity-clearing.ts` clears every listed name through the same auction
      the credit slices use, but **in shares** rather than dollars: a book denominated in dollars
      would have its size depend on the price it is supposed to set, which is the circularity
      behind #28. `ItemizedHolding.quantityShares` is the registry. Each holder posts its own
      fair value — real earnings capitalised at ITS own required return — so holders genuinely
      disagree, and that disagreement is what gives the demand curve its slope. Stage 08 now
      READS the price the way it reads the cleared OAS. `comp.sentiment` is gone as a price
      input; `priceEquity` is deleted outright, and with it the branch that priced a bigger loss
      HIGHER (a loss-maker is now priced off real book equity at a distress haircut).
    - **A real engine bug, found only because equity made it visible.** The damped level and the
      allocated quantity were inconsistent: participants booked their full unclamped schedule at
      a level the damping had held away from its solve, so the books together could claim more
      than the float. In credit that hid inside dollar targets; in shares it printed as
      institutions holding **229% of a company's shares outstanding**. Fills are now rationed
      pro rata to the float — the same allocation rule the goods auction uses (#49), and the
      only honest one, since nobody can be handed a security that was never issued. Measured:
      the worst holder concentration now sits at 27–42%, always under the 42% float.
    - **§7.4 again, and it cost more than anything else here.** Companies were seeded at
      `eps x sector basePE` — a table capitalising earnings at ~1.5% net of growth — while the
      holders in the auction capitalise them at 4–10%. Week 1 therefore opened at roughly four
      times any real bid, and the market spent **ten consecutive weeks falling at its 18% damping
      limit** to get back. The seed and the market now share one function,
      `engine/equity-valuation.ts`; nothing else may price a share.
    - **Measured (60 weeks, same seed).** Before: opening cap 1482B, median P/E 66.7, every week
      pinned at the ±18% damping cap for the whole run, worst holder 229% of shares. After:
      opening cap 230B, median P/E **10.1 at week 0 and 11.1 at week 60** (no drift), median
      weekly move settling to **~1–2%** — the realistic band the plan asked for — with a p90 tail
      that still gaps, which is what a real cross-section does.
    - **Two real bugs found while doing it,** both the same shape as §7.5 (a number whose sign or
      source was never checked): the structural default probability annualised
      `cashFlowStatement.dividendsPaid` **signed**, and a cash flow statement stores dividends as
      a negative outflow — so a company that paid a dividend was scored as SAFER for paying it.
      And the buyback test asked whether the stock was cheap against the sector P/E table, i.e.
      against a valuation the market no longer used; a board taking the other side of this
      auction now reads the same book the auction does.
    - **Whole-harness delta (260 weeks, same seed): 349 violations -> 248**, bank-NIM breaches
      298 -> 183. One line moved the WRONG way and is recorded rather than explained away:
      "institutional book moved >10% in one week" went 23 -> 36. Both distributions sit almost
      entirely past week 130 (baseline 21 of 23, now 32 of 36) — the late-horizon degraded regime
      that #67 and #18 already live in, where the baseline itself prints a 144.5% move. Inside
      the first 60 weeks it went 2 -> 1. The mechanism is real though: equity now marks weekly at
      a price that can gap 18%, so a book with a large equity sleeve moves more than it used to.
      Revisit when G6 gives institutions a liability side to mark against.
    - **Still open, logged not fixed:** the p90 weekly move still reaches the damping cap for a
      tail of small and loss-making names flipping between the earnings and net-asset branches of
      their valuation — real gapping, but worth confirming it is the tail and not a discontinuity
      at the branch boundary. Households/banks/treasury are not yet participants in this book
      (the float is the institutional share); they arrive with MS and WS8.
32. **Determinism + measurement: the engine is seeded, and one guess-free profiler.**
    - **Every run was a different world.** 51 raw `Math.random()` sites across the engine meant
      no before/after measurement in this file ever compared the same economy to itself — the
      whole "measure, change one thing, measure again" method was being applied to numbers that
      moved on their own. All engine draws now come from `engine/rng.ts` (mulberry32, one word of
      state), the seed and stream position live ON the GameState, so a saved game resumes its own
      world and any measurement can be replayed exactly. Verified: two 40-week runs from seed 42 are
      state-identical (curve, GDP, market cap, RNG position all equal). UI jitter deliberately not converted — animation noise is not part of the
      world. Harness scripts take `SEED=<n>` to test a claim against a genuinely different world.
    - **`npm run verify` now defaults to 60 weeks** (`WEEKS=260` at a section's close). Every
      real finding in this project has come from the first sixty; the 260-week run took 25
      minutes and was being used as a per-change check, which is most of a working session spent
      waiting. The long horizon still matters for the degradation items (#67, #18) and belongs
      where those live: the end of a section.
    - **`npm run profile`** (scripts/profile.ts + `advanceWeeklyStepProfiled`) prints per-stage
      mean/worst/share so optimization starts from measurement, not intuition (§7.27's lesson).
    - **Second pass, 920 -> 490 ms/week (47%), every result byte-identical.** Profiled first,
      every time; all three finds were the SAME anti-pattern — a per-item scan of a
      collection that should have been grouped once:
      - stage 08 scanned the region's whole supply-relationship list per company, and (new with
        WS5's weekly bill issuance) re-scanned a government ladder that now grows every week to
        find one short tranche. Indexed both: **387 -> 118 ms**.
      - stage 05 walked the region's ENTIRE contract book — ~74,000 live contracts by week 60 —
        once per sub-unit market, to find the contracts belonging to that market. The book is
        now partitioned by sub-unit once per region and each market gets only its own bucket:
        **315 -> 209 ms**.
      - stage 09 had the right complexity but the wrong shape: two maps-of-arrays over 74,000
        contracts, ~150,000 array slots of garbage a week. It now accumulates directly into the
        totals it needs in one pass: **87 -> 25 ms**.
      A fourth change — inverting the recipe-input buyer lookup in stage 05 so firms are indexed
      by the inputs they consume rather than each market filtering all ~500 regional firms —
      bought **4 ms and is recorded as a miss**, kept only because it is the better shape. The
      remaining 205 ms in stage 05 is the auction itself: real per-market work, not a scan.
      **The generalisation, three for three on the wins: when a stage is slow, it is scanning a
      collection per item.** Look for the grouping pass before looking at anything else — and
      re-measure after, because the fourth one looked identical and was not.
    - **SECTION CLOSE, full 260-week harness: 12 violations, all one kind.** (Re-measured
      after WS5 as §7.34's 60-week figure.) Every one is the
      known #18 revenue-runaway name. **Zero** bank-NIM breaches (298 in the pre-seed baseline —
      #67's symptom is gone at long horizon), **zero** book-conservation breaches (23-138 across
      earlier runs), zero ledgers minting claims. The run takes 3m53s where it took ~25 minutes.
    - **First measured win, 1191 -> 895 ms/week:** `settleCorporateActionOnHolders` rebuilt every
      entity's whole holdings array per corporate action, twice per company — 12% of the entire
      weekly step to scale one issuer's holders. Actions now record a per-instrument ratio and
      settle in ONE pass at the end of stage 08 (ratios compose by product). Remaining cost, by
      measurement: stage 08 (42%), stage 05 (34%) — both already indexed; further cuts need
      algorithmic changes, logged not chased.
33. **HC Wave 1 landed: the hidden sector is real firms.** ~301 named private firms per region
    carved out of the segment aggregates (`bootstrap/private-firms.ts`, Pareto-quantile seeds),
    with `listingStatus`/`ownership` on `Company`, real debt ladders clearing in 07b/07d, real
    occupation demand and capex, and `PRIVATE_EQUITY` as a fifth institutional type owning the
    levered cohort. `ctx.prevActiveFirms` stays the public-only containment gate, with
    `prevActivePrivateFirms` as the per-stage opt-in.
    - **Measured:** debt conservation exact to the decimal (USA 549.4B before = 75.5B firms +
      473.9B segment residual after); bond universe 317 names (126 private), **loan universe 292
      names, 246 private** — the leveraged-loan market is now mostly sponsor-owned private paper,
      as the real one is. Want/have **6.4x → 3.8x**. At the HC5 gate: IG strictly ordered and
      realistic (AAA 157 / AA 163 / A 175 / BBB 218), zero negative spreads, zero guard hits.
      Sponsor universe USA: 131 firms, BB 85 / B 31 / CCC 9. Runtime ~2.5x the pre-HC cost at
      2,000+ firms.
    - **The finding that reshaped the project's numbers:** the segment primitive
      `debtUSD = 2 x revenue` implies ~15x debt/EBITDA on the private sector as a whole. The
      first carve scaled real ladders up to meet it and killed a third of the cohort in 26 weeks.
      The tier now carries what real leverage services (~75B USA, not ~330B) and the residual
      ~474B stays as the SME mass's bank debt — so the want/have gap closes through the §6
      primitive recalibration plus G2's bank book, **not** through more tier issuance.
    - **Spearman(leverage, OAS) = 0.74–0.76, below the 0.8 target, and explained rather than
      tuned:** ~250 investment-grade names now carry honestly near-identical expected losses, so
      the rank correlation is diluted by ties. §7.20's lesson in a new place — when an honest
      model flattens a distribution, do not re-inflate the input.
    - **Two bugs worth remembering, both about measurement rather than economics:** an employment
      change must be measured over the SAME firm universe on both sides of the week (an
      asymmetric pair read the tier's arrival as a mass layoff and pinned unemployment at its 25%
      cap), and an unsold-production penalty must only exist for a firm that actually offers into
      a modeled market.
    - **Correction to an earlier claim:** HC3 does NOT narrow the 11–14% labor supply/demand gap.
      The carve conserves totals by construction, so the gap remains MS2's to close by making
      both sides real. What HC3 delivers is attribution — labor demand now belongs to named
      employers.
    - HC3b (the product-market handover) is deferred to BP1 with a measured reason — see §5-HC.
34. **WS5 landed: bills and commercial paper — the front end is a market now.**
    - **Bills.** ~18% of each sovereign ladder is 13/26/52-week paper (seeded at init in the
      engine's own shape, §7.4), clearing weekly in `07f-short-debt-clearing.ts`: banks anchor at
      policy + 5bp by the same reserve arbitrage that anchors the 2Y — expressed as a
      reservation price, not asserted — and institutions bid half their cash sleeves above it for
      a small term premium. The NS curve refits through ALL seven cleared points, so `tenor3M`
      is a market print, not an extrapolation. Stage 11 runs bills as their own program: a
      perpetual weekly roll plus a bill share of new money steered toward a 15–25% target with a
      real cost lean off the cleared curve. `sovBucketKey` in shared-helpers is now the ONE
      tranche-to-bucket mapping; the three independent nearest-of-[2,5,10,30] reducers it
      replaced would each have silently folded a 13-week bill into the two-year bucket.
    - **CP.** An investment-grade company whose projected quarter-end cash does not cover the
      working-capital stock its own statements book (8% of revenue) runs a standing program:
      13-week paper, rolled weekly by 07f, priced as cleared bills + the issuer's structural PD
      scaled to a quarter + 15bp. It sits in `debtTranches` flagged `isCommercialPaper` — real
      `totalDebt`, real interest through the ledger — and every bond-market consumer (07b float,
      stage 08 refinance/prepay/call, holder settlement) explicitly skips it. **A failed roll
      draws the revolver** at policy+350bp with a [FUNDING SQUEEZE] news event — the real
      mechanism, present before G2 makes the line an asset on a bank's book.
    - **First formulation was wrong and found no issuer in 60 weeks:** it looked for a projected
      cash DEFICIT, and almost nobody projects negative cash. Real CP funds the working-capital
      STOCK of issuers who run lean cash. Recorded because the failure mode generalises: sizing
      a market off the tail event instead of the standing need finds no market.
    - **The bug WS5 exposed, and the rule it produced.** Bills are `instrumentType: 'GOV_BOND'`,
      so 07c — which rebuilds each holder's government book from its own four bond buckets —
      swept every bill position into its rebuilt-from-fills set and deleted it with no cash leg.
      Measured as the UK institutional book losing 4.6B of bills in week 7 with its cash
      unmoved. Stage 11's redemption and placement paths were also moving sovereign securities
      with no cash leg at all (pre-existing; quarterly issuance hid it, weekly bill rolls did
      not). **Rule, now stated in both stages: a clearing stage may only rewrite the instruments
      it actually cleared.** Everything else passes through untouched.
    - **Whole harness after the fix (60 weeks, seed default): 7 violations -> 4**, and the 4 are
      the known #18 revenue-runaway names. Every book-conservation and bank-NIM breach is gone.
    - **Measured (seed 7, 60 weeks):** 3M sits 15–16bp over policy in steady state and follows a
      175bp hike THE SAME WEEK; CP spread ladder orders by rating (A 40 < BBB 45 < BB 48 < B
      51bp — the BB/B prints being fallen-angel runoff already headed to the revolver); bill
      share holds ~18% and steers to target. **Honest finding:** CP outstanding decays to zero
      by week 30 as corporate cash builds — cash-rich issuers genuinely run no program, but if
      G2's lending dynamics later drain corporate cash, the market should re-emerge on its own;
      watch it then.
36. **The bank balance sheet became a flow ledger, and WS6's repo market stands on it.**
    Three connected changes, each measured (seed default and seed 7, 60 weeks):
    - **The plug is dead.** `evolveBankingSector` computed reserves as
      `Math.max(deposits * 0.08, deposits + equity − loans − securities)` — BOTH branches
      discarded prior cash, so every real cash leg the clearing stages applied was erased the
      following week; the identity was −138.9B (USA week 0) from the cold start, the floor
      branch bound every week in every region, and both administered facilities printed 0.00B
      for 60 weeks because every bank sat at exactly 8% of deposits. Cash now moves only by
      named flows (S5's ledger discipline applied to banks); deleted with the plug: the
      recapitalization with no investor, the `equity = RWA × 0.140` rescale (now a real
      special dividend bounded by distributable cash), the NIM damping clamp, the phantom
      reserve-requirement constraint, the 0.85 reserve tiering (reserves earn IOR = policy;
      bank-side ON RRP parking removed — the RRP is the NON-bank floor), and securities income
      now reads the bank's real tenor book at the real cleared curve. The funding side of the
      seed is reconciled (§7.4 again): deposits are seeded as what the asset side requires —
      the sov book was re-seeded from the market at S2 and nobody re-derived the deposits that
      fund it. Seed NIM 2.59% (was printing 4.4–6.5% on the unfunded book).
    - **The new per-bank identity invariant found a real pre-existing bug in its first run:**
      07c's bank settlement rebuilt the whole tenor book from its own four bond buckets,
      deleting every bank's seeded BILL positions with no cash leg — the exact §7.34 bug,
      fixed on the institutional path at the time, unnoticed on the bank path. 26.6B of USA
      bank bills vanished in week 1 of every run since WS5. Also fixed under the same
      invariant: dealer revenue credited to equity with no cash leg in 07b/07c/07d, 07f's
      dealer revenue dropped outright, and dealer fees paid in cash with no P&L debit.
    - **WS6 landed on the honest base.** One overnight GC session per region in 02b: borrower
      size = real shortfall to the bank's own buffer capped by unencumbered collateral ×
      (1 − haircut); the haircut is DERIVED per bucket — duration × 2σ of that bucket's own
      observed weekly cleared-yield changes, floored cold-start by the engine's minimum weekly
      repricing allowance — so capacity tightens exactly when the curve turns volatile.
      Lenders: surplus banks at IOR, institutional idle cash at the RRP rate (the overnight
      half of WS5's cash sleeve; the unlent remainder parks at the RRP window and earns its
      rate), and the SRF as a posted-rate seat IN the auction — which is why the corridor
      holds without a clamp. Encumbered collateral floors the bank's 07c/07f holdings and is
      excluded from further capacity, and the same secured-funding capacity is the
      `maxNetPurchaseUSD` banks' bond bids now carry — the "reserve position" constraint 07c's
      comment claimed has existed since S2 only as a comment; the honest ledger showed the sov
      book at 241B against 232B of deposits with the SRF financing 88.4B at penalty before the
      budget existed.
    - **Seat-design lesson worth keeping:** a perfectly elastic posted-rate window stands at
      FULL size exactly AT its rate, so the 1bp numerical step representing the vertical
      schedule sits just BELOW the posted rate. A step that straddled it cleared 1bp above the
      window (16 ceiling breaches), which no borrower with window access would pay.
    - **Measured:** corridor breaches 0 on both seeds; per-bank identity residual 0.00M over
      60 weeks; encumbrance breaches 0. The rate genuinely walks the corridor — 186
      region-weeks at the floor (no need), 33 mid-corridor (private lenders pricing), 21 at
      the ceiling, and ceiling weeks coincide with real SRF usage (§5-WS6's verify condition).
      USA week 60: 91.8B borrowed from institutional lenders, SRF 0.00B. Harness unchanged at
      4 violations (the known #18 names); 733 ms/week (was 824).
    - **The 260-week run then exposed a runaway the deleted clamps had been hiding, and its fix
      is the Basel leverage floor.** With sovereigns at zero risk weight no constraint saw the
      bond book's size, and banks levered the repo carry into the growing government float
      without limit: 289 violations at 260 weeks — EUR banks pledging 913B of collateral, USA
      capital NEGATIVE (−13.3%), NIM 11.8%, bank company revenue in the trillions — and zero of
      them identity breaks, because the ledger was conserving a runaway perfectly. The old world
      printed 12 violations at 260 weeks only because the recapitalization-from-nowhere and the
      equity rescale manufactured the capital line each week. `BASEL_MIN_LEVERAGE_RATIO` (3%,
      the posted Basel floor — a real regulatory minimum, same administered standing as the SRF
      spread) now bounds the bank budget in 07c/07f: equity/0.03 − total unweighted assets.
      Measured at the failure-onset window (110 weeks, both seeds): NIM breaches 88 → 0 on the
      default seed; corridor, encumbrance and identity all 0 on both; the sov book peaks at
      228B and UNWINDS as equity falls — real deleveraging — instead of compounding to 900B.
    - **What stays red at long horizon, attributed not fixed:** USA capital falls through the
      band from ~week 86 (−0.7% by week 100) with ZERO repo and ZERO SRF outstanding — the
      documented #67, whose printed ratio the deleted recapitalization used to prop up. The
      harness now reports the disease instead of the prop; G2 owns the cure. Seed 7 keeps 21
      late NIM breaches (7.4% when the late curve is steep) traced to the G2-owned loan-yield
      and deposit-beta formulas under the late inflation regime, not to the repo market.
    - **Lesson:** deleting a symptom-clamp does not create the disease it was hiding, but it
      does transfer the disease onto every downstream statistic the clamp was laundering. Budget
      for the harness to get honestly redder when a prop dies, and attribute each new red line
      to its real owner before touching anything.
37. **S10 landed: the backlog batch, and the damper measurement it produced.** Engine half:
    G8 absorbed (sentiment plumbing deleted everywhere; the fabricated macro-filler with its
    real-world references and five nonexistent tickers is gone — a quiet news week is
    information); the full rating ladder in news classification; stage 08's regime ladders
    real ('Recovery' rung added, dead 'Boom' deleted); the always-true stale-scale Consumer
    branch deleted; the per-company `getInitialRegions()` rebuild hoisted by threading the
    already-built world through the generator (~2,000 four-region rebuilds and their RNG draws
    gone — a memoized version was tried and reverted the same day for aliasing one mutable
    region graph across the harness's baseline/shocked worlds); the UIP carry sign corrected
    (WS9 still deletes the formula); linkage calibration reads a frozen base; one seed-time
    CategoryDemandState constructor; the tilt-era dead code deleted and 07b's header rewritten
    for the demand-schedule engine; **cores-first rationing** in the clearing engine (mandated
    cores are satisfied before the discretionary layer rations — the uniform pro-rata scale cut
    straight through `minHoldingUSD`). UI half: per-entity/per-bank cards read the real books;
    MyBook attribution reads the position's own cleared stat and real remaining tenor;
    scenario chips label the basis points they compute; log-tenor curve axis; ManualModal
    renders the real engine constants (the restated copy had already drifted); dead GameState
    UI fields deleted; PP&E first-filing shows the level (rule 9).
    - **The damper metric §6 asked for, first measurement:** 1,349 instruments persistently
      bound (3+ consecutive weeks), worst streak 60/60 — the §7.21 HY-saturation cohort and
      §7.31 equity tail, quantified. An end-of-run metric, not violations: endemic until the
      wides get a real buyer base (G6/HC-resolution). Watch it DOWN.
    - **The absorption check learned WS6's lesson:** a cash-drained bank still bids — it funds
      secured against collateral (why real auctions rarely fail) — so the "no money" shock now
      also encumbers the collateral. Passing again with a real yield response.
    - The generator hoist relabels the default-seed world (§1.10's directive applies): the #18
      cohort is the same four companies under new tickers, and this world's inflation escapes
      the post-S8 band (recorded in §5-G1b; pre-dates the batch on seed 7, both UIP signs;
      G2-owned). Late-NIM prints are downstream of that escape.
38. **WS7 landed: money market funds — real liabilities, and the front-end bid they fund.**
    One fund per region, born EMPTY (no fabricated stock; flows build it, the WS5-CP doctrine).
    The asset side cost almost nothing — an MMF is what an entity looks like when the cash
    sleeve is its whole balance sheet, so 07f's bill program, WS6's repo session and the RRP
    floor already deploy it. The liability side is real flows: corporate treasuries sweep cash
    above their own working-capital need (the same WORKING_CAPITAL_SHARE_OF_REVENUE the CP
    program reads — the duplicated 0.08 literal is hoisted to one definition) through the S5
    ledger as its LAST entry of the week, redeem bounded by the fund's real cash; and the
    household savings flow splits between deposits and the fund on the real yield gap — the
    deposit competition G2 will read as a funding-cost driver.
    - **Measured (30 weeks, default seed):** AUM 0 → 55.4B (USA), 762 corporate holders, bills
      9.7B; the quoted yield tracks policy with the structural ~1-week lag (3.35% → 2.84% →
      2.15% across two cuts) and clears the deposit rate (policy × 0.45) by ~160bp, so the
      household flow diverts hard — banks now genuinely lose funding when their deposit beta
      lags. Share conservation exact: Σ company shares + household shares = fund liabilities
      to the dollar, fund cash = shares at the $1 NAV.
    - **Bill CARRY is now credited to institutional holders** (bond coupons still are not):
      the money-market instruments need their real yield for the deposit-vs-fund competition
      to exist, and banks already earned the same carry on the same paper. One more named
      boundary on the §6 banking-boundary row; BP5 replaces both carries with real coupons.
    - CP holdings wiring deliberately skipped: the CP market sits at ~0 outstanding (§7.34's
      honest finding) — when G2's cash drain revives it, the fund's sleeve machinery is the
      natural holder; wire it then.
39. **WS8 landed: the primary market — supply meets demand in the same book.** A
    `PrimaryOffering` has a real lifecycle: ANNOUNCED by the issuer's own decision in stage 08,
    PRICED next week as extra float in the same auction that clears the outstanding stock (the
    engine gained first-class primary support: the solve runs on stock + offering, and an
    issuer whose walk-away is crossed has its deal PULLED with a re-solve on the stock alone),
    then SETTLED — issuer receives the market take minus the fee through the S5 ledger, the
    tranche is created at the CLEARED terms, the house bank (deterministic market-share-
    weighted relationship lead) earns the fee cash-and-equity — or WITHDRAWN, where a
    refinancing's fallback is the revolver at policy+350bp, the same real funding-squeeze
    mechanism as a failed CP roll. All three issuance paths route through the queue: the
    opportunistic CFO deal (quarterly-sized, launched in the issuer's own post-earnings
    window), the maturity roll (the year-early pre-refi and at-maturity formula roll are both
    deleted; maturity repayment finally has a cash leg — it never posted before), and the
    maintenance term-out (weekly bridges term out at benchmark size; IG in bonds, sub-IG in
    loans).
    - **Best-efforts until G3, stated plainly:** the first build had the lead bank pay real
      cash for the unsold residual — and the per-bank identity invariant broke by exactly the
      residual in its first run, because the paper sits on the REGION dealer book, an asset on
      no bank's sheet (§7.19's recorded gap). Firm-commitment underwriting needs the desk to BE
      a named balance sheet, which is G3's item; until then the issuer raises what the market
      takes and the residual sits unfunded like all dealer inventory.
    - **Two calibration defects the diagnostics caught:** every issuer re-announced the week
      its deal settled — a standing conveyor at 13× the intended flow (17,006 deals in 30
      weeks, float +63%, spreads pinned) — fixed by the cooldown a quarterly-sized deal
      implies; and the whole cohort then launched in one synchronized quarterly burst — fixed
      by launching in each issuer's own post-earnings window, which is also the real behaviour.
    - **Measured (26 weeks):** ~50 staggered deals/week, USA fixed float 88.4B → 91.3B (supply
      growing into tights at a realistic pace), 12 revolver catches from genuinely withdrawn
      refinancings, holder double-count prevented by counting settled primaries as
      pre-existing in the corporate-action snapshot. Harness: 11 violations, the two accepted
      families (#18 cohort, late-NIM prints of the recorded inflation escape), zero identity
      breaks.
    - Equity offerings ride the same machinery and are consumed by HC7's real IPOs; the
      accretive-call replacement still prices instantly at the cleared stat (market level, no
      concession) — noted as the one issuance path left outside the queue.
40. **G2 landed: the loan book is real and money transmits.** Five slices.
    - **Itemized (1).** `BankLoan` per named borrower on each named bank's book. The SME seed
      scalar (`debtUSD = 2 × revenue`, ~17.8x EBITDA) is migrated at cold start to what is real
      twice over — serviceable at a covenant 3x AND carriable by bank capital (measured USA:
      79.9B vs 21.2B, so the book opens at 45.6B and GROWS through real origination instead of
      opening at an impossible 474B nobody lent). The last `?? revenue × 2` fallback is deleted.
      **The §6 double-count dies:** revolvers and maintenance bridges are BANK debt
      (`isBankFacility`), so the same floating principal no longer sits on the bank book AND in
      institutional 07d holdings, expensed once and received twice.
    - **Real interest (2), priced origination (3).** Each loan accrues at its own terms; the
      business-loan yield formula and contagion loss rate are gone (SME losses are real
      write-offs at each pool's measured default rate). The house bank quotes
      policy + expected loss + capital × ROE and DECLINES at its regulatory floor; declined
      demand accumulates per region as a measurable crunch.
    - **Loans create deposits (4), M2 derived (5).** An SME origination puts new money on the
      lending bank's funding line with no reserve movement. M2 is the real money that exists —
      deposits plus money-fund shares; `deposits + centralBankReserves × 0.1` (a tenth of a
      phantom 1e12 scalar) is deleted, and weekly M2 changes decompose into real flows to
      within ~0.1B on ~1.5B. Deposit rates now compete with the MMF yield in proportion to the
      funding actually being lost — WS7's discipline, finally imposed.
    - **THE TRANSMISSION CHAIN, measured end to end** (+300bp shock, A/B): quoted margin
      582 → 857bp, **SME origination −51.3%**, **segment capex −21.5%**, **category demand
      −0.66%**. The first build moved origination 0.5% — priced correctly and inert, because
      demand was a pure quantity target (§7.24's shape). Borrowers now carry their own hurdle
      (a pool does not borrow at 12% to earn 9%), and borrowed money FUNDS REAL CAPEX at
      origination, so a rate change reaches the goods market through the credit it suppresses
      rather than stopping at a debt number nobody spends.
    - **Two identity lessons, both caught by the invariant rather than reasoning.** Corporate
      deposits are a reporting VIEW, not a bank liability: company cash lives outside the
      banking system, and counting it as funding left the matching asset missing (the residual
      came out exactly equal to the line). And a facility draw is therefore a real cash outflow
      from the lending bank — loan +X, reserves −X — until MS makes company cash settle through
      banks and it becomes deposit creation like the SME side.
    - **SECTION CLOSE, 260-week harness: 236 violations, three known families and no others** —
      148 bank-capital and 84 NIM prints of the recorded G1b escape (this seed reaches 249%
      inflation with the 10Y at 17.85% and banks 61% in sovereigns, so honest carry on a
      diseased curve prints an impossible margin), plus the 4 #18 names. **Zero identity
      breaks, zero corridor breaches, zero encumbrance breaches, zero ledgers minting claims.**
      G2's channel measurably damps the escape but does not cure it: 0.66% of demand against a
      goods-market cycle orders of magnitude larger. Recorded per §1.10, not chased — the
      remaining stabilisers are MS's household rate response and BP5's fiscal loop.
41. **HC Wave 2 landed: the private sector has a lifecycle, and the private mark is cleared.**
    The five defects that stood between "the code is written" and "deals happen", each found by
    measurement, each a different way of building a market that could not transact:
    - **Deal intent died every week.** The LBO/recap/listing decision was marked with `pending*`
      fields on the Company; stage 08 rebuilds every company from an explicit field list, so
      anything not named there is dropped. 767 offering-weeks of financings that could never
      settle. The intent now rides on the OFFERING (`PrimaryOffering.peDeal`), which persists in
      GameState with its own financing. **Lesson: state that must survive a week has to live on
      an object something owns, not on one that is rebuilt.**
    - **A debut could not be priced.** The clearing engine returned early on any instrument with
      zero outstanding float — which is exactly a first-time borrower or a listing, whose whole
      book IS the offering. It never got a primary outcome, so it was never settled *or* pulled.
      The gate is now `tradableFloat + offering > 0`: a market with something to sell is a market.
      07e needed the same fix from the other side (an IPO issuer is PRIVATE, so it was not even
      in the book — debut issuers now enter on their own price talk, `indicativeStat`).
    - **The demand side was sized off the PRE-issue float**, so no offering could ever be
      absorbed at any price: every schedule's ceiling was a multiple of the stock that existed
      before the deal. Allocators now size to the instrument that will exist once it prices. A
      real benchmark reweights when a new issue enters it.
    - **The weekly cash budget was split across the whole STOCK**, giving a new issue a slice the
      size of its issuer's index weight rather than of the deal. Measured on one LBO financing:
      the book could HOLD it (53.7M of capacity against a 40.1M post-issue float) but could only
      FUND 14.0M, so the solve ran to ~1365bps against a sponsor who walks at 900. Money now goes
      where paper is actually changing hands — a live offering, or the gap between what a holder
      targets and what it owns. A name already at target with nothing on offer needs no cash.
    - **The offering was being sized at the institutional SHARE on the demand side while the
      engine asked the book to absorb ALL of it.** `tradableShare` describes passive holders of
      the OUTSTANDING stock; a new issue has none. Fixed consistently in 07b/07d/07e.
    Then the two that were economics rather than plumbing:
    - **Dry powder was read as the sponsor's `cashUSD`** — 0.01B across every fund in the world,
      which makes an LBO structurally impossible. A fund does not hold its investors' money, it
      CALLS it. Dry powder is committed-but-undrawn LP capital capped by what those LPs can
      actually pay; `callCapitalUSD` moves real money off the named LPs' balance sheets and
      `distributeToLps` returns it on a recap. HC4 built `lpCommitments` for exactly this.
    - **The private mark was a bare `8 *`** in three places (the seed's `stakeValue`, the weekly
      NAV mark, and the deal arithmetic) — a formula standing in for a price, and rule 3's two
      representations of one company. It is now `publicComparableEvMultiple`: the median EV/EBITDA
      the region's LISTED comps clear at in 07e. One number, cleared, in one place, read by the
      purchase price, the exit test and the mark.
    - **MEASURED, 120 weeks, default seed:** sponsors' portfolios 524 → 761 companies (295 LBOs
      closed, 317 pulled at the sponsor's own walk-away — a real acceptance rate, not a
      conveyor); 7 dividend recaps placed of 8 launched; undrawn commitments 13.6B → 0.25B (the
      funds deploy their vintages and stop, because **nothing raises a new fund yet** — see §6);
      36 firm births, each carved from its SME pool; **peNAV 25.0B → 8.0B as public comps
      de-rate 8.0x → 3.5x**, which is the transmission the fixed mark could not carry.
    - **ZERO IPOs, and the reason is honest, not a bug.** A sponsor lists when the market pays
      more than it paid: entry basis 7.2x against comps that fall to 3.5x. Nobody lists into a
      market that has de-rated by half. The machinery is complete and fires on the test — this
      seed's world simply never rewards it. The de-rating itself is the recorded G1b escape
      (nominal EBITDA inflating past equity prices), so this is a symptom to re-measure after
      G1b, not an exit path to force.
    - **Harness, 60 weeks:** 15 violations against a 14-violation baseline on the same seed —
      11 NIM prints and 4 #18 names, both recorded families, one extra NIM week (wk50, 0.0831
      against a 0.08 band) in the same G1b cluster. **Zero identity breaks, zero conservation
      failures, zero corridor or encumbrance breaches** across the new capital-call, distribution
      and seller-proceeds legs. The damper metric moved the wrong way — **1,373 → 1,962
      persistently bound** — which is the loan book getting bigger (debut issuers and LBO'd names
      now carry floating paper); recorded to watch, not chased.
    - `generateIPOCompany` is DELETED and `simulation/ipo.ts` is gutted. Firm creation now has
      exactly one path: born small in a pool, carved into a named private firm, public only by
      choosing to list.
42. **Call protection landed, and the free call died with it.** An issuer used to retire a bond
    at PAR the moment its coupon sat 1% above the market, costing nothing. That is an option no
    lender writes, and it is why call protection exists. `domain/call-protection.ts` now owns
    three real regimes, each the market convention for its instrument: **SOFT_CALL** on leveraged
    loans (101 for six months — floating paper exposes the lender to spread, not rates, so what
    is protected is the spread it underwrote); **HARD_NC** on high yield (non-call one year, then
    a schedule opening at par plus half the coupon and declining to par, derived from the issue's
    own coupon); and **MAKE_WHOLE** on investment grade (no non-call period at all — callable
    whenever, at the greater of par and the present value of everything the holder was going to
    receive). There is always a price: inside a non-call period the issuer pays a make-whole to
    the first call date, which is what "non-call" means in practice.
    - **The make-whole spread is not an invented number.** It is what the holder needs beyond the
      cash flows to go back to the market and replace the bond — the corporate bond dealer's
      bid-offer. So `BOND_DEALER_SPREAD_BPS` is one constant read by both 07b's clearing and the
      make-whole, and it lands where real make-whole spreads sit (T+15).
    - **The decision changed, not just the price.** A treasurer discounts the coupon saving over
      the paper's remaining life and compares it to the premium. For an IG bond the premium IS
      the present value of the saving, so a purely rate-driven call never clears the test — which
      is exactly what a make-whole is designed to do. **Measured: accretive calls fell to 0.00B
      over 60 weeks** (the residual 0.4M is the handful that are genuinely economic).
    - **The premium is real money and it reaches the lender.** `payHoldersCash` settles it pro
      rata to holders OF RECORD in the same single pass that scales their notionals — shares
      taken from pre-action books, because a premium belongs to whoever owned the paper when it
      was called.
    - **Two behaviours had to change to stop the model paying premiums no treasurer would pay.**
      The delever path retired the NEWEST tranche first, which with call protection is precisely
      the most protected one; and surplus-cash prepayment make-whole'd long bonds. Both now rank
      by rate given up per dollar of call cost and skip paper that is not worth retiring —
      **premiums 1,388M → 0.9M over 60 weeks, prepayment still active at 3.5B**, now directed at
      revolvers and loans whose soft call has expired, which is what real treasuries pay down.
      One wrong turn on the way: gating par-callable paper on the same arbitrage test cut
      prepayment 97%, because retiring debt that costs nothing to retire needs no arbitrage.
    - **Harness: 14 → 9 violations**, the NIM breach cluster halving from ten weeks to five. Banks'
      loan books stop churning when issuers stop calling for free.
43. **The take-private, and an honest answer to "does LBO activity lift equity multiples?"**
    Asked and measured: **no, and it structurally could not**, because a sponsor could only buy
    PRIVATE firms. An A/B with the whole lifecycle switched off produced public multiples
    indistinguishable from one with it (USA 4.32x vs 4.25x at week 90, signs going both ways
    across regions), and the one effect that did register ran BACKWARDS — capital calls drain the
    insurers' and pensions' cash, which is exactly the cash that funds their equity bids:
    institutional equity budget 51.6B with PE against 53.4B without.
    - **What was missing is the only channel by which private equity touches the public market.**
      HC6c now screens LISTED companies, and the control premium is derived rather than chosen:
      to buy EVERY share you must clear the reservation of the holder who values the company
      most, not the marginal one who sets the printed price — which is where a control premium
      comes from. The takeout is what a holder at the lowest required return in the market would
      pay; the sponsor proceeds only when its OWN levered return still clears its higher hurdle.
      The consequence is the real one: **the sponsor bid appears when equities are cheap**,
      because a lower price means a smaller equity cheque and a higher levered yield on it.
    - **A bug the measurement caught.** `applyPendingCorporateActionSettlements` drains its maps
      at the end of stage 08, and `hc-lifecycle` runs after it — so the tender's cash leg was
      recorded into a per-week map nothing ever read. The register was extinguished and the
      shareholders were paid NOTHING: measured, institutional equity buying power fell to 43.0B
      against a 53.9B control. Settling at the end of the lifecycle stage too fixed it (52.9B).
    - **MEASURED, 90 weeks: 36 take-privates**, public names 800 → 628, zero stale equity holdings
      left in delisted names, and **institutional equity buying power now 39.5B with PE against
      36.2B without — the channel runs forwards, +8.9%.** Aggregate market cap ends higher with
      PE in two regions of four despite companies leaving the market.
    - **The multiple effect is NOT clean, and I am not going to claim it is.** Medians at week 90
      land 4.33 vs 4.41 (USA), 4.87 vs 4.88 (EUR), 4.63 vs 4.89 (UK), 5.05 vs 4.56 (JPN) — mixed
      in both directions. The demand leg is real and measurable; the price leg is swamped by the
      recorded G1b de-rating (comps fall 8.0x → 3.5x over the same window) and by composition,
      since the names the sponsors remove are not a random sample of the index. Re-measure after
      G1b rather than reading a multiple effect into this.
    - Harness 9 → 13: the NIM family grows to eight weeks and now breaches BOTH edges (0.1015
      high, −0.0001 at week 59), which is new and recorded to watch. The equity-flow check also
      needed a second guard — a name pinned at the 0.01 price floor in both worlds has no price
      for flow to move and is not evidence about the mechanism.
44. **ETFs landed: real indexes, real index funds, dealers as authorised participants.**
    Three slices. The indexes are recorded in the slice-1 commit; what follows is the funds.
    - **27 funds, born EMPTY** (the money fund's precedent read the same way): a fund's shares are
      created by real demand through a real authorised participant, so seeding a share stock would
      invent the flow the mechanism exists to produce. Each holds its basket for REAL — measured,
      248 to 325 positions against benchmarks of that size — so an ETF is an ordinary holder in
      07b/07d/07e, not a wrapper beside them.
    - **The one demand shape this engine could not express.** An index fund does not decide what a
      security is worth; it buys its benchmark weight at whatever the market asks, and stops when
      the money runs out. Its schedule is a SIZE with no reservation level. That is a large real
      force, and getting it wrong is instructive: a PRICE_LIKE reservation is a MAXIMUM price, so
      "no reservation" is an unreachably HIGH one. Set to zero, the equity funds bought nothing at
      any positive price — two positions against a 157-name benchmark.
    - **Three asset managers per region, not one**, splitting the same institutional slice rather
      than adding to it. Sponsorship interleaves each region's index list across its houses, so
      every manager runs a mix of equity and credit. No monolines, which is what real fund
      complexes look like.
    - **The AP constraint had the wrong basis first.** Sized as a small fraction of dealer equity,
      the arbitrage became the dominant fact: 95-98% of flow unabsorbed every week, forever, and
      the funds never reached target size. An AP does not WAREHOUSE a creation basket — it buys and
      delivers inside the settlement cycle — so what its capital limits is turnover, not inventory.
      Rebased as a multiple of equity it now binds at launch and is unconstrained afterwards, which
      is what a real AP constraint does. A region's dealers also share ONE balance sheet, so the
      week's baskets compete for it; allocating the whole regional capacity to each fund
      independently let ten funds spend the same dollar.
    - **The residual is NOT called a premium**, because it is not a price. `unmetFlowShare` is the
      fraction of the week's creation/redemption demand the APs could not carry, bounded in
      [-1, 1]. A real premium means clearing ETF shares in a book of their own against the float
      the APs will create — the next slice. An early version divided unabsorbed flow by the fund's
      own NAV and printed a **173% "premium"** on a fund whose NAV was smaller than one week of
      inflow, which is what naming a pressure like a price looks like.
    - **Who indexes what is derived, and the derivation had a real error worth keeping.** Running a
      direct book takes research capacity, so an entity indexes the part of the market it cannot
      cover, tier by tier. The first version made capacity LINEAR in assets (twelve names per
      billion) — which says a firm with a hundred times the assets has a hundred times the
      analysts, something no fund complex has ever managed. Every institution could then research
      every name that existed and almost nothing was indexed. Capacity scales sublinearly and
      steeply so: a billion-dollar boutique with three analysts reaches forty-five names, the
      largest managers run four orders of magnitude more money and cover perhaps twenty times as
      many, which puts the exponent at about a third. **Measured: fund AUM 13.6B → 53.5B and all
      four small-cap funds came alive.**
    - **Credit funds bid in the PRIMARY; equity funds do not.** A bond index admits a new issue at
      the next rebalance and a fund that waits has to chase it, so it takes its proportional share
      at issue. Equity index funds buy at INCLUSION, which is why they are famously absent from
      IPOs — and that falls out of the quarterly rebalance with no special case.
    - **Claims are marked at the fund's current NAV per share.** Marking only the holdings that
      moved left investor claims drifting from the assets backing them (13.49B of fund assets
      against 13.38B of claims after thirty weeks). They now match exactly.
    - **HARNESS: 13 → 5 violations, and the whole bank NIM family disappeared.** Only the four #18
      revenue-runaway names and a single week-60 NIM print remain. Persistently damper-bound
      instruments 1,989 → 1,961. Determinism verified across two identical 40-week runs.
    - **15 of 27 funds stay empty, and the reason is honest.** The large-cap and total-market funds
      have no buyer because a region has only ~25 large caps — a number every institution here can
      research directly — and the same goes for high yield at 8-65 names. That is a truthful
      consequence of a listed universe of ~180 names per region where a real market has thousands;
      it is the §7.18 want/have problem wearing a different hat, and it is recorded in §6 rather
      than papered over by tuning the coverage rule until the funds fill. The three GLOBAL funds
      are empty for a different and equally honest reason: every book in this model is domestic,
      so there is no cross-border allocation to draw on until WS9.
45. **The household sector is the largest fiction left, and it was found by asking who buys ETFs.**
    The user's observation — that households are the truest source of index-fund demand — turned
    into a measurement, and the measurement is worse than a missing feature. At week 40 of the
    default seed: **household equity 2,224B, total real market capitalisation 1,052B, all
    institutional equity holdings 130B, ETF AUM 62B.** Households hold 2.1x the entire market and
    17x what every institution owns put together.
    - `householdState.equityHoldingsUSD` is seeded as `income x 1.5` and multiplied weekly by a
      formula `equityReturn`. It appears in no share register, clears in no book, and no cash ever
      moves for it — while feeding net worth, the wealth effect and consumption, so it drives real
      macro today off a number nothing validates. Rule 1 (a formula price) and rule 3 (household
      equity wealth represented twice, once here and once in the registers it never enters) in the
      same field.
    - **Do not reconcile it by injecting the stock.** Routing 2.2T of demand into a 1T market would
      reprice everything and would be fitting the world to a seed. Carve a realistic share into
      real holdings, let the rest build from real saving, and record the discrepancy as a measured
      number. Owner: **MS1**.
    - The lesson generalises past this field: the model's markets were built out in order of how
      interesting they are to price, and the demand sides they price against were left as
      aggregates. Where an aggregate stands in for a sector, check its SIZE against the real
      market before trusting anything cleared against it.
46. **L — the ledger integrity batch, and a bug that had already fixed itself.** Seven items, six
    of them real. What is worth keeping is the seventh.
    - **The redemption cash leg (L1)** was the batch's reason to exist: a retired tranche scaled
      holders' notionals down and paid them nothing, a transfer from lenders to no one sitting
      underneath every price cleared against those books. The cash leg derives from the composed
      action ratio, so it stays exact when two actions hit one instrument in a week. Harness 5 → 4.
    - **L4 deleted the last formula price setter for a listed cohort** — banks and institutions on
      a book-value x cycle-P/B multiple — and doing so immediately exposed the #18 revenue runaway
      as a 40x P/E on a hedge-fund entity. **A formula masking a defect is the argument for
      deleting formulas**, and it is the second time in this project that removing one made a
      known problem visible rather than creating a new one.
    - **L6's sweep found the earnings desk on private firms**: dealer consensus, a reporting
      calendar, management commentary and a surprise percentage handed to all 1,204 of them at
      generation, when §5-HC had said in writing that a private firm has none of it. Fabricated
      analyst forecasts for companies no analyst covers.
    - **L7 did not reproduce, and the reason I first thought it did is the lesson.** The recorded
      defect was a 9–10% one-week DROP in the institutional book at weeks 129 and 259. My first
      probe found a 9.8% JUMP at week 129 in all four regions — the right week, the right
      magnitude, the wrong sign — and I nearly wrote it up as the same bug with a flipped sign.
      It was an artifact of my own probe: I summed cash as `Math.max(0, cashUSD)`, which hides
      exactly the entities the event was about. Unclamped, the book moves **+3.10B, 0.3%**, and
      the placement conserves. **A measurement that clamps is a measurement that lies, and it lied
      in the direction that made a story.** Re-derive an instrument before trusting a number that
      confirms what you expected.
    - **What the investigation did find** is recorded as PUB1b: sovereign placement forces paper
      onto holders with no affordability check, so a real-money entity with a zero leverage
      allowance can end an issuance week with negative cash (−50.3B across institutions in one
      week). Every clearing stage respects S11's budget constraint; this path predates it and does
      not, and 07c already exists to price the auction properly.
47. **MS1 landed: households own real things, and the gap that remains has a name.**
    The last sector whose wealth was a formula. `equityHoldingsUSD` was seeded at `income x 1.5`
    and multiplied weekly by a market-return index — 2,224B against a 1,052B market, in no
    register, clearing in no book, and driving net worth, the wealth effect and consumption.
    - **It is now a sum of what households really hold:** index-fund shares created through the
      real authorised-participant mechanism, the listed float institutions do not own (the same
      `institutionalShare` 07e uses to decide what is in play, so both sides of the register agree
      by construction), and **founder stakes in the private tier** — households own the unlisted
      economy, HC gave every private firm an `ownership.founderPct`, and that block was entirely
      invisible until now. Marked at the same cleared multiple sponsors mark at, so a private
      company is worth one thing no matter who holds it.
    - **The remainder is NAMED, not deleted.** Real households hold ~1.5x income in financial
      assets and the seed says so; the assets that exist here add to about a third of that,
      because the universe is 6x short of the money pointed at it (§7.18). Marking households down
      to what exists would have imported that shortfall straight into consumption — **fixing a
      local inconsistency by making the macro worse**, which is the trade this project keeps
      refusing. `unmodeledFinancialAssetsUSD` earns nothing, moves with nothing, is set once at
      the opening gap and thereafter only SHRINKS as real claims are found. Households do not get
      richer because the model learned to see what they already owned.
    - **The household rate response, which G1b has been missing, falls out of it.** How much of a
      week's saving goes to funds rather than deposits is the earnings yield the region's listed
      market is actually throwing off, less what the money fund pays — when cash pays more than
      equities earn, households stop buying equities. The same shape WS7 already used for the
      deposit-versus-money-fund split, now on the equity side and off cleared prices.
    - **MEASURED, 60 weeks:** household equity decomposes 2,121B → direct 335B + ETF 36.5B +
      private business 98B + unmodeled 1,312B, with **the unmodeled line falling 1,759B → 1,312B
      (−25%)** as real claims displace it. Net worth runs continuously (1,590B → 1,452B) — no
      discontinuity at the seed, which is what made the change attributable at all.
    - **The ETF answer the user asked for:** all four broad-market ALL_CAP funds go from **0/4 to
      4/4 live**, funded funds 12 → 17 of 27, and **fund AUM 53.5B → 97.8B**. A household runs no
      research desk, so the ETF project's coverage rule already made it a 100% indexer by
      construction — the buyer was specified before it existed. The empty broad-market funds were
      never a universe-size problem after all; they were a missing sector.
    - Harness holds at 4 (the #18 names), determinism verified, build green.
48. **The household sector is modelled an order of magnitude more thinly than the corporate one,
    and naming a gap is not the same as closing it.** The user pushed back on MS1's
    `unmodeledFinancialAssetsUSD` — a massive part of the household balance sheet does not exist,
    and households were not getting the depth corporates get. Both were right, and the measurement
    is worse than the intuition.
    - **46% of the "unmodeled" 1,605B is not missing from the world — it is UNATTRIBUTED in it.**
      Insurers hold 495B of assets against 40B of their own equity; pension funds 146B against
      17B; asset managers 188B against 31B. **740B is a liability to somebody and nobody holds the
      claim.** Policyholder reserves, pension entitlements, fund shares — every dollar a household
      asset in reality. The asset exists here and the claim does not: rule 3, at 740B.
    - **Households carry 1,061B of mortgage debt and own no house.** The model has median home
      prices, a baseline, a price index and a 62% ownership rate. A balance sheet with the
      liability and not the asset, biasing net worth in one direction by construction.
    - **The asymmetry, measured:** 2,004 named companies against 4 regional aggregates; a real
      income statement anchored to settled sales against a top-down income anchor; the S5 cash
      ledger against formula deltas; **82 itemized corporate loans on named banks' books against a
      140B consumer book itemized to nobody**; four cleared markets against none; real default
      against none. G2 gave corporate borrowers real lenders and left household borrowers an
      aggregate — the same project, half built, and it was never flagged.
    - **Why I got it wrong, and the structural reason.** I wrote "the assets the universe cannot
      yet back" and filed the empty broad-market funds under §7.18's want/have. That diagnosis was
      wrong twice over: MS1 itself disproved half of it (the funds were missing a SECTOR, not a
      universe), and this measurement disproved the rest. Naming the gap made MS1 *attributable*;
      it did not make the model *right*, and I treated those as the same thing — then recommended
      a market-completion item next while 46% of household wealth had no owner.
      **The structural cause is worth more than the mistake:** "institutional liabilities" (G6)
      and "households become real" (MS) were separate items in the work order, when the claim
      linking a household to a pension fund is simultaneously the fund's liability and the
      household's asset. Splitting one real thing across two projects GUARANTEES that building
      either alone leaves a gap to name. They are now one item, HH, at the front of the order.
    - **The lesson generalises past this sector.** When a number has to be labelled "unmodeled",
      check first whether the model already contains it somewhere it is not attributed. A missing
      counterparty looks exactly like a missing asset from one side of the ledger.
49. **HH1a landed, and the harness went GREEN for the first time — via a defect that had been
    misfiled for a year.**
    - **The claims:** 740B of insurer reserves, pension entitlements and fund shares had no holder.
      Both sides now exist, derived as the residual on a real balance sheet and re-marked weekly,
      with an invariant checking them against each other. Measured: 795B of claims at week 1,
      both sides reconciling to 802.6B at week 40 with zero per-claim mismatches, and the unmodeled
      placeholder falling **1,759B → 964B on attribution alone, then to 469B by week 60** — a 73%
      reduction in this project's scoreboard.
    - **#18 was never a revenue runaway.** The four names flagged for a year were the four regional
      HEDGE FUNDS, whose revenue is a fee on their book, so the harness was applying an operating
      company's growth ceiling to a fund. And they had not grown: **their book SHRANK 76.8B →
      62.4B while reported revenue rose 29x.** The generator seeded `aumUSD` as a multiple of an
      operating company's revenue; the entity carried the real marked book; week 1 swapped one for
      the other. A §7.4 cold start wearing a growth defect's name. Seeding the shell at the size it
      actually manages: **29x → 1.1x, and the 60-week harness passes with zero violations.**
    - **The lesson is the one §7.4 already taught and this project keeps re-learning.** A quantity
      that jumps at week 1 is almost never the engine misbehaving; it is the seed and the engine
      disagreeing about what the quantity IS. The tell was available the whole time — the violation
      was always at week 60 with the same four names and no new ones, which is a step change
      compounding, not a process running away.
    - **And a bigger thing was underneath it:** the institutional Company and the InstitutionalEntity
      that share an `id` are two firms that do not agree (an insurer at 0.10B of market cap against
      a 241.4B book). Recorded in §6 and scoped as HH1b. It also means L4's decision to clear
      institutions in 07e is currently pricing them on the shell — right in principle, and not yet
      right in fact.
50. **Every non-financial corporate is the same firm, and the topic that was supposed to cover it
    was scoped to financial policy.** The user's observation: revenue is not generated the same way
    by each type of company, costs are not the same, and not everything has inventory.
    - **Measured:** four coefficients vary by sector — pricing power, PP&E intensity and life, wage
      sensitivity — plus input recipes by category. Underneath them every one of the 2,004
      companies produces storable units, holds output inventory decaying at a hardcoded 2%, books
      revenue only on settled unit sales, and runs one COGS decomposition. **Enterprise software
      sits in physical inventory: 159 units worth 5.9M, spoiling like steel.** There is no
      subscription, backlog, deferred or royalty revenue anywhere; a firm with 90% gross margins
      and no warehouse cannot be expressed.
    - **The model already knows operating models differ and applies it to exactly one sector.**
      `financialStatementProfile` gives banks, insurers and asset managers genuinely different P&L
      paths. The rest of the economy shares one. That asymmetry is the tell, and it sat in plain
      sight through every project that touched stage 08.
    - **The existing topic did not cover it.** IND (ex-BP2, #51) read `{capexIntensity,
      cyclicalityBeta, financingPreference, payoutPolicy, hedgingPolicy}` — every item on that list
      is balance-sheet policy. Nothing about how revenue is generated, what costs look like, or
      whether inventory exists. **A topic can exist, be correctly named, and still not contain the
      thing you filed under it**; "we have an item for that" is not the same as having scoped it.
    - Widened to operating models — storability and carrying cost as BP1 registry properties of the
      SUB-UNIT rather than the firm, revenue mechanism, cost structure — and moved from Tier 3
      depth to the foundation behind its registry. Note what this is NOT: no conservation
      violation, nothing unattributed, which is exactly why the harness is green and could never
      have caught it. Realism gaps do not trip invariants.
51. **HH1b: one insurer instead of two, and the same cold start twice in one session.**
    - The insurer branch of stage 08 refused to read the entity behind it, on a comment reasoning
      that `totalAssetsUSD` was "a macro-level slice, not a per-firm P&L input". **That was true
      when it was written and stopped being true at S11**, which made it a real per-firm book — the
      asset-manager branch directly below it reads it and says so. The refusal outlived its reason
      by several projects, and what it produced was a second insurer: a shell reporting 0.05B of
      revenue and 0.10B of market cap beside an entity holding 241.4B, with `technicalReservesUSD`
      printing 0.2B against a 221.9B beneficiary liability.
    - **Now one firm.** Reserves ARE the beneficiary liability HH1a records (223.0B, one number).
      Premiums come off real capital at the **premium-to-surplus ratio**, the constraint every
      insurance regulator actually supervises — replacing a premium that grew from its own prior
      value at GDP plus a random draw, anchored to nothing. Investment income is what the entity's
      own portfolio earned, recorded once by `accrueInstitutionalIncome` and reported by the P&L
      rather than recomputed as a second yield on a different asset base. Claims stay stochastic,
      because claims are. Result: revenue 0.05B → 23.4B, net income a 1.5% ROA on the real book,
      market cap 0.10B → **51.0B against 19.5B of equity**.
    - **Then the harness failed again with the identical shape**, this time 480x on the four
      insurers — because the seed still opened them as operating companies. The same §7.4 cold
      start I had just fixed for the asset managers, one layer down, found within an hour of the
      first. The primitive now lives in `domain/institutions.ts` so the SEED and the ENGINE read
      one number; when they disagree, the harness reports the disagreement as a runaway.
      **Harness green again.**
    - **A stale comment is a liability with no maturity date.** This one was correct, was written
      down, was load-bearing, and became wrong when a different project changed the thing it
      described — and nothing in the process catches that. It is worth asking, when a project
      changes what a field MEANS, which comments elsewhere were reasoning about the old meaning.
    - Correction to §7.49's write-up: it said pension and hedge funds fall through to a
      consumer-revenue path. They do not — they carry the `ASSET_MANAGER` profile and already read
      their entity's book. Only the insurer was disconnected.
52. **HH1c: somebody now pays the premiums, and two hurdles stopped being constants.**
    - Insurers wrote **48.0B of premiums a year that nobody paid** and settled **37.3B of claims
      nobody received**; pension funds held 136.9B contributed by nobody. An income statement
      describing a business no counterparty was in. Every leg now nets: companies and households
      pay premiums, insurers receive them, claims come back, the insurer's own operating cost
      leaves as somebody's wage, contributions go in and benefits come out.
    - **Who pays is derived from what each sector has to lose** — a company's plant and revenue, a
      household's net worth and income — so the commercial/personal split is an outcome rather
      than a number chosen to look right.
    - **A leak I built in deliberately and then closed.** The first version zeroed the insurer's
      operating expense to avoid an unfunded outflow, which left its cash outrunning the income its
      own P&L reported by the whole expense ratio. Routing it to households as wages conserves and
      is what actually happens. Writing `* 0` with a note is a fine way to defer a decision for an
      hour; it is not a fine way to ship one.
    - **Two constants retired into measurements, and each is the metric its industry really uses.**
      An insurer's hurdle is its **cost of float**: premiums less claims less expenses over the
      float carried. Measured at **−1.57%** — underwriting is profitable, so the float is FREE and
      the insurer accepts **7.43% where the constant said 9%**. That is the real advantage a
      well-run insurer has over every other holder, and it emerged from the flows rather than being
      asserted. A pension fund's is its **funding need**: benefits out over assets, scaled by how
      far assets are from promises. At 107% funded it needs **4.38% against a stated 7%**, and an
      underfunded one needs more — which is the "underfunded schemes reach for return" behaviour
      §5-HH exists to produce, now falling out of arithmetic instead of being described.
    - **The other three stay stated, and that is the honest answer.** An asset manager's hurdle is
      its investors' benchmark, a hedge fund's its mandate, a sponsor's what it underwrites deals
      to. None is a liability cost, so none is derivable from one. **Deriving them anyway would be
      a formula wearing a derivation's clothes** — the failure mode this project is most at risk of
      now that deriving things is the habit.
    - Harness green, determinism verified. Damper-bound instruments 1,956 → 1,920 as the hurdles
      fell.
53. **HH2: the house joins the balance sheet, and a units error that had been hiding behind a
    small number.** Households carried 1,061B of mortgage debt and owned no house. The stock is now
    computed from PHYSICAL units — population / average household size x ownership rate x the
    cleared median home price — so a home price move is a household wealth move, and there is one
    representation of the housing stock rather than a dollar figure beside the prices that are
    supposed to generate it (rule 3).
    - Measured: housing stock **3,188B**, home equity **2,127B** against the mortgage already on
      the liability side, and net worth **1,543B → 4,730B**. Net-worth-to-income **1.5x → 4.61x**
      against a real-world US ratio of roughly 7–8x — still low, which is the right direction and
      the remaining gap is what HH3–HH6 and `unmodeledFinancialAssetsUSD` are for.
    - **What housing exposed is the more useful finding.** The wealth effect read
      `balanceSheetWealthEffect = (netWorthToIncomeRatio - 1.0) * 0.006` — a LEVEL feeding a GROWTH
      rate. That is rule 9 (periodicity is part of the number) violated in the plainest way, and it
      was invisible for as long as it was wrong-and-small: at a 1.5x ratio the term contributed
      0.3%. Putting the house on the balance sheet moved the ratio to 4.61x and the same expression
      began adding **~1.9 percentage points to real consumption growth every week, forever** — a
      permanent boom manufactured out of a stock being read as a flow. Replaced with what a wealth
      effect actually is: a marginal propensity to consume out of the CHANGE in wealth,
      `MPC x ΔnetWorth / income`, with MPC = 0.04 (the empirical three-to-five cents), which
      required `priorNetWorthUSD` on the household state so the change is a real difference rather
      than an inferred one.
    - **The lesson, which is not about housing.** A dimensionally wrong expression scaled by a
      small input looks like a tuned constant and passes every check. It only announces itself when
      something upstream gets bigger — so every place a level multiplies into a rate is a latent
      version of this bug waiting for its own HH2. Worth a sweep when the remaining stocks
      (HH3's real debt, HH4's cohort wealth) land.
    - **An instability this work did NOT cause, now recorded in §6.** Consumption growth prints
      −105.91% and GDP growth −209.30% at week 60. A/B against the pre-HH2 tree gives −119.87% and
      −209.30% (GDP identical to four significant figures), so HH2 slightly IMPROVES it and did not
      introduce it. Not chased here, per rule 10.
    - Harness green (60 weeks, zero violations), determinism verified identical after 40 weeks.
54. **Task-list mapping:** S-items ↔ audit findings + #67/#18/#34; WS-items ↔ #68–#82/#74;
    MS ↔ #56/#59/#60/#52; BP ↔ #58/#45/#48/#50/#51/#54/#55/#64; AU ↔ #66. The end-of-project
    `npm run verify` gate closes #2/#14/#41.
    **Closable now** (§7.16/§7.17 landed them): #77 and #78 (slices 2–3 signed off), #72 and #81
    (hedge funds are a real institutional type bidding in 07b/07d). **#48 is now §5-HC, a master project** and has
    grown from a detail item into a §4 top-three one — retitle it to match. #47 (deeper
    institutional sector) is substantially §5-S11 plus HH1.
55. **HH3: household debt joins the banks' books, and #67 dies of realism.** The defect was rule
    3 at its plainest: households owed 0.95x income evolved by paydown constants, banks held a
    scalar chasing 11.67% of it, and the other 88% was owed to nobody. Now there are mortgage /
    card / consumer-term POOLS on each named bank (G2's exact shape), the household lines are
    their derived sums, and every flow has a posting: origination is priced (measured tier losses
    + capital cost + operating cost — cards quote ~policy+1076bps, term ~policy+488bps, mortgages
    10Y+170bps fixed at each vintage) and capital-gated at the 8% floor; amortization is ANNUITY
    ARITHMETIC on each pool's own WAC and remaining term, which is what killed the 0.0004/wk
    constant — the rate a book amortizes at is derivable from its own terms; card turnover keeps
    one named behavioural primitive (4%/wk mixed transactor/revolver pool) until HH4 splits the
    cohorts; mortgage loss severity reads HH2's real home equity, so a price crash walks
    severity up as LTV approaches 1.
    - **Seed reconciliation (§7.4, third time this project):** banks open holding the full book
      (USA consumer line 634B where the scalar said ~130B), equity tops up at each bank's own
      pre-migration capital ratio (43.2B USA), deposits re-derive as the balancing funding.
    - **#67 CLOSED by re-measure.** USA bank capital was collapsing to zero by week ~70 since
      the flow ledger stopped propping it. With the real book: 11.6% → 14.7% through week 80,
      NIM 2.8–5.5% in band. The collapse was the fictional consumer book all along.
    - **The household rate response exists now.** Late in the run, policy tightens and the card
      and term books SHRINK (42.9B → 33.5B) while the measured debt-service burden climbs
      17.8% → 26.6% of income — households delevering under tight policy, off floating margins
      and priced origination, is the stabiliser §6-G1b has been asking MS/HH for.
    - **A measurement refined, not loosened.** The 5%/week institutional-book band fired at week
      2 — and the probe chain showed why: bank equity at its real size tripled the ETF
      authorised-participant pipe (0.25x dealer equity/week: 43.2B x 0.25 = the measured
      10.8B/week fill, exactly), so the pent-up ETF demand drains in 4 weeks instead of 30, on
      top of the pre-existing cold-start rotation (A/B: baseline peaks at 4.2%/wk, just under
      the band). Every dollar carries a cash leg; the moving entities were the two whose books
      are EXTERNALLY FUNDED BY DESIGN (MMF subscriptions, ETF creations) — the band's
      closed-book premise doesn't hold for them. They are now excluded from the band and the
      money fund got the SHARPER identity instead: a $1-NAV book must equal its shares
      outstanding within accruals. Along the way the diagnosis went wrong twice by comparing a
      fund against the wrong baseline (the MMF's +13.9B week-2 inflow is byte-identical in the
      baseline world) — the probe that settles such a question is the A/B, not the time series.
    - **Known cold start, measured and accepted:** bank stocks re-rate 1.65 → ~3.9 over ~10
      weeks as stage 08's 85/15 revenue blend converges on the 3x bigger real bank. Bounded,
      ~1% of institutional books; not worth a seed-P&L reconstruction until it pollutes a
      measurement.
    - **Left honestly open (HH4):** interest and scheduled principal are paid from unmodeled
      household income (the amounts are real, the payer is not yet — same boundary the wage
      flows cross the other way); and the banks' "household deposits" funding line (790B USA at
      seed) vs the household state's own deposits (372B) is the two-representations gap moved,
      not closed — the difference is wholesale funding wearing a deposit label. Recorded in §6.
56. **HH4a: the household cross-section exists, and it cost the aggregates nothing.** ~14 real
    occupation x wealth-tier cohort cells per region (the zero-weight cells of the 5x4 grid are
    simply absent), built fresh each week by `macro/household-cohorts.ts` from the same pools,
    wages and transfer arithmetic the aggregate income derivation uses — so Σ cohort disposable
    equals `estimatedHouseholdIncomeUSD` to the cent BY CONSTRUCTION, and the harness asserts
    it weekly anyway (the assert is against future edits, not present doubt).
    - **The normalization discipline is the design.** Every per-tier propensity is a RELATIVE
      weight renormalized against an aggregate the sim already runs on: tier wage multipliers
      normalized per occupation (each occupation's bill preserved exactly), progressive tax
      multipliers renormalized weekly to the flat rate (progressivity — 6.3% bottom to 25.2%
      top — with the S1 identity untouched), the savings cross-section λ-normalized to the
      behavioural aggregate rate with a two-pass headroom redistribution for when the 90% cap
      binds in high-savings escape worlds. Result, measured: the 40-week aggregate paths are
      **bit-identical** to the pre-cohort world. A cross-section that moves no aggregate is the
      only kind that can land safely on a running simulation; the dynamics arrive in HH4b with
      their own re-derived seeds.
    - **Three formulas died into derivations:** the tier income drift (`shareOfIncomeUSD`
      walking by blended wage growth beside the aggregate it claimed to decompose), the
      `wealthSignal` spend-share walk (dead state — no stage ever read it), and the per-tier
      consumption sum that accumulated into a variable nothing read. Tier income is now the
      cohorts' summed disposable; the spend shares are budget-weighted real mixes (a boom that
      lifts top-tier budgets tilts the mix toward luxury because that is where the money is);
      the membership matrix moved to the cohort module — one matrix, one owner.
    - **Calibration honesty:** these are WEALTH-ranked tiers, so the income-by-tier target is
      the wealth-ranked reality (~30/40/18/12), not the income-decile 15/45/25/15 the old seed
      carried — measured 34/38/17/11. The seed's tier income lines now open as the derived sums
      too (§7.4).
    - **Recorded, not yet wired:** per-cohort debt-service burden (peaks at 24% of disposable
      in the homeowning middle, as it should) awaits HH4b's dividend recycle before it can
      debit budgets; capital income is still the constant share, allocated by tier equity
      exposure until receipts are real.

