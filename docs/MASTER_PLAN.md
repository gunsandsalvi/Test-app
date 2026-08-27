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
| 02b | `02b-bank-diversification.ts` | Per-bank balance-sheet evolution, SRF/ON RRP facilities, region aggregate = real sum of named banks |
| 03 | `03-category-demand.ts` | C+I+G demand targets per sub-unit; `corporateDemandUSD` persisted per category |
| 04 | `04-input-output.ts` | Input-category clearing: real supply from linked commodities, pooled multi-industry demand, pro-rata rationing |
| 05 | `05-unit-bidding.ts` | THE real goods auction: named bids/offers, pro-rata clearing, contracts, per-lot settlement (northwest-corner), capex bids |
| 06 | `06-fx-and-trade.ts` | FX evolution + trade flows (still formula — see §5-WS9) |
| 07 | `07-commodities.ts` | Commodity spot evolution |
| 07b | `07b-corporate-bond-clearing.ts` | Corp bond clearing (FIXED tranches) — adapter over the generic engine |
| 07c | `07c-sovereign-bond-clearing.ts` | Sovereign tenor-bucket clearing (2/5/10/30Y) + Nelson-Siegel refit to cleared yields. **The curve's only owner**; macro reaches it through banks' reserve arbitrage and every holder's real yield |
| 07d | `07d-leveraged-loan-clearing.ts` | Leveraged loan clearing (FLOATING tranches), CLO/loan-fund base via `loanPct` |
| 08 | `08-company-fundamentals.ts` | Per-company weekly update: revenue (anchored to stage 05 real sales), costs, capex/debt, rating, earnings, equity price. Largest stage; reads cleared credit stats, never sets them |
| 09 | `09-concentration-risk.ts` | >40% supplier/customer concentration flags |
| 10 | `10-mergers.ts` | Quarterly M&A |
| 11 | `11-fiscal-and-sovereign-debt.ts` | The statistics stage: measures bottom-up GDP **and the consumer price index** (`stages/price-index.ts` — the only place inflation is set); deficit → real gov tranche issuance, placed with and redeemed from real holders; itemized-holdings attribution (**mechanical rebuild — must die, §5-S7**), news generation |
| 12 | `12-portfolio-and-positions.ts` | Index recomputation + player portfolio mark-to-market |
| 13 | `13-news-and-turn-summary.ts` | IPO checks, cash/NAV settlement, turn summary |

`stages/financial-clearing-engine.ts` — the generic, cap-free **double auction**
`clearFinancialAsset(instruments, participants, priorDealerInventory, params)`. Each
participant posts a real per-instrument demand schedule (`ParticipantDemand`: a
`reservationStat` below which it holds none, a `maxHoldingUSD` policy ceiling, and the
`fullSizeStatRange` it scales in over) and `solveClearingStat` bisects for the level at which
total demanded quantity equals the real `tradableFloatUSD`. `statKind` orients the search
(`YIELD_LIKE` demand rises with the statistic, `PRICE_LIKE` falls). The bank dealer carries
whatever the participants do not take.
**Every asset class is a thin adapter over this engine** (07b/07c/07d today; equity, bills,
CP, repo tomorrow). Adapters own: who the participants are, what each one's reservation level
and size are, and the structural share of each name each participant is sized against
(a relative weight on a real, already-bounded pool via `distributeRealTargetByWeight` — never
an independent dollar figure).
**Read §7.16 before changing this file.** It replaced an engine that priced a *quantity
target*, and the reasons that failed are recorded there.

`stages/shared-helpers.ts` — credit math, occupation demand, `distributeRealTargetByWeight`,
holdings attribution. `initialization.ts` — `createInitialGameState` (must seed holdings with
the SAME shape the weekly engine produces — see lesson §7.4). `credit.ts` ratings;
`ipo.ts`; `merger.ts`; `trade.ts` (player trade execution); `constants.ts`.

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
`region-macro.ts`, `geography.ts`, `game-state.ts`, `portfolio.ts`, `markets.ts`, `events.ts`.

### 2.4 UI (`src/components/`) and invariants

UI reads `GameState` only. Several components still contain second price-setters/fabricated
numbers — see §5-G and §6. Invariants harness: `scripts/invariants.ts` via `npm run verify`
(NaN purity, ownership conservation, NAV identity, fee conservation, MTM unfreezing, policy
rate stability, default/merger disjointness, bank capital & NIM bands, IPO EPS, revenue 20x
ceiling, sovereign absorption, equity-demand-moves-price, auction-moves-yields). Known
harness state (all pre-existing, A/B confirmed): bank-capital band fails from ~week 70 and NIM
from ~week 180 (task #67); the sovereign-absorption check no longer references nonexistent
fields but **fails with baseline and shocked identical to 8 decimal places** — the auction shock
reaches the curve not weakly but not at all, which is a real defect and not a tolerance issue
(§6); the institutional-book check fires in a periodic burst (§6); revenue-ceiling has a small
tracked residual (#18).

---

## 3. Current state: real vs. formula

**Genuinely bottom-up today** (post "1$ is 1$", at rest): category demand → input-output →
stage 05's real auctions with named counterparties, per-lot input provenance, real settled
sales anchoring revenue, capex as real bids, private sector as a real participant *in the goods
market*, commodities linked to real producer companies, per-bank balance sheets + real CB
facilities, real gov tranche issuance, the measured CPI, the national-accounts identity, the
single-owner sovereign curve, and the 07b/07c/07d clearing markets — which since §7.16 price
from real demand schedules rather than quantity targets.

**Still formula-driven** (each is a §4 work item): bank lending/borrowers + endogenous money
(G2), the dual dealer system (G3), equity price (WS4), FX (WS9), derivatives markets incl.
implied vol (G4), default resolution/recovery (G5), institutional liability side (G6),
commodity futures/speculators (G7), sentiment (G8), the CB balance sheet (G9), player-trade
market impact (S9), plus the aggregate household/labor blob (Main Street) and the government
fiscal loop (Blueprint).

**Real but structurally undersupplied** — a category worth naming separately, because these are
not formulas and they still produce wrong prices. The clearing markets are honest mechanisms
running on an asset universe that does not match the money pointed at it: institutional
corporate-credit appetite is **~6x the corporate credit that exists** (§7.18), the hidden
corporate sector's 549B of debt is a scalar no one can own (§5-HC), and institutions face no
no budget constraint existed at all (fixed — §7.21). A correct auction over a 6x-short float
still gives a wrong price, and no amount of work inside the auction fixes it.

---

## 4. THE GLOBAL WORK ORDER

Work strictly top to bottom inside each block. Blocks: **S** (stabilization — the audit's
majors), **WS** (Wall Street completion), **G** (realism gaps), **MS** (Main Street),
**BP** (Blueprint), **AU** (Aurora). Rationale follows the table.

| # | Item | §5 ref | Prereqs |
|---|---|---|---|
| 1 | **Hidden Corporates Wave 1: real named private firms, real debt, real employment** | HC | — (see the sequencing note below) |
| — | **Periodicity & units audit + MoM/YoY display convention** | P1 | none; do alongside any item |
| — | **Damp the inflation swing** (diagnose the goods-price cycle) | G1b | G2 likely part of the fix |
| 5 | Delete every duplicate price-setter (engine + UI) | S6 | — |
| 6 | One holdings ledger (kill mechanical itemizedHoldings rebuild) | S7 | — |
| 7 | Contagion decay + input-price-index baseline + housing supply | S8 | — |
| 8 | Player trades enter the real market | S9 | S7 |
| 9 | Batch: §6 backlog (dead code, UI bugs, minor logic) | S10 | — |
| 10 | Equity clearing (slice 4) + retire sentiment as free parameter | WS4 | S5–S7 |
| 11 | Short-dated debt: T-bills + commercial paper (slice 5) | WS5 | — |
| 12 | Private repo markets | WS6 | — |
| 13 | Money market funds | WS7 | WS5, WS6 |
| 14 | Corporate debt/equity issuance with bank placement agents | WS8 | WS4, WS5 |
| 14b | **Hidden Corporates Wave 2: PE deal flow, real IPOs, births, estates** | HC | WS4, WS8, G2 |
| 15 | Itemized bank lending + endogenous money (loans create deposits) | G2 | HC W1 |
| 16 | Unify the two dealer systems | G3 | S9 |
| 17 | Real derivatives markets (IRS/CDS/options/XCS participants, real vol) | G4 | WS4, G3 |
| 18 | Default resolution: recovery as an outcome, not a constant | G5 | G2 |
| 19 | Institutional liability side (claims, benefits) drives demand | G6 | WS7 |
| 20 | Commodity futures as a real market (hedgers/speculators) | G7 | G4 |
| 21 | Corporate hedging + banks hedge their own book | WS11 | G4 |
| 22 | Real international trade & FX clearing | WS9 | G2 (confirm currency-zone premise first) |
| 23 | Central bank as a real counterparty (portfolio, QE/QT, remittances) | G9 | G2 |
| 24 | Main Street (households → labor market → corporate wage system) | MS | ideally G2 |
| 25 | Blueprint remainder (taxonomy → industry profiles → electricity/share-vs-margin → fiscal loop → antitrust) | BP | MS for the fiscal loop's household taxes |
| 26 | End-of-project validation gate: full `npm run verify` + fix #67/#18 residuals | S-final | everything above it |
| 27 | Aurora — full UI rebuild | AU | last; requires its §5-AU process |

**Why this order.** The macro root causes are done (§7.9–§7.11, §7.16): the ~110% fake GDP
growth, the double-written yield curve, the runaway formula CPI, and a clearing engine that
priced a quantity target instead of a demand curve. Real growth reads positive in every region
at week 26, inflation is a measured statistic, and corporate spreads now track credit
(Spearman 0.78–0.93) instead of ownership.

**What the top three items have in common.** Each is a case of the credit market being right in
mechanism and wrong in inputs, and each was found by measuring rather than reading:

- **HC Wave 1 because the asset universe is 6x short of the money pointed at it** (§7.18), the
  labor market is short of employers by a similar order, and both missing halves are the same
  missing thing: the hidden corporate sector as real firms.

**Sequencing settled with the user (2026-08-27):** Hidden Corporates runs in **two waves**.
Wave 1 (position 3): firmify the upper tail, real debt, real employment, PE ownership — because
every credit item below is currently calibrated against a 6x-short float, and signing off a
market in a broken environment measures the environment, not the market. Wave 2 (after WS4, WS8
and G2 exist to receive it): the lifecycle — LBO/recap/exit flow, real IPOs replacing the
synthetic generator, firm births, defaults into estates. **Do not reorder further without
asking.**

Otherwise the shape holds: restore the money and holdings identities (S5–S9), then the
remaining markets, then Main Street before Blueprint's fiscal loop (taxes need households).
Aurora is deliberately last: it re-renders everything the other projects produce.

---

## 5. Detailed work instructions

### P1 — Periodicity & units audit, and the MoM/YoY display convention

**Not a phase — a standing sweep.** Rule 9 states the discipline; this item is the one-off pass
that brings the existing code up to it, and it can be done incrementally alongside whatever else
is in flight. Every defect of this shape found so far was invisible until someone traced the
number to its source, so the work is mechanical rather than clever.

**Engine side.** Walk every rate, growth figure, flow and index and confirm its period at the
source. Rename to carry the period where the name is ambiguous (`governmentSpendingUSD` is
weekly and reads annual; `demandLevelUSD` is annual and reads weekly; `wageGrowth`,
`gdpGrowth`, `demandGrowthAnnual`, `m2GrowthRateAnnualized` are all different conventions in
neighbouring lines). Known instances still open: `clearedInputPriceIndex` measures
week-over-week but is read as a level versus baseline (also §5-S8); `historicalInflation` and
`historicalZeroCurves` are appended in stage 02 and so lag the measurement stages by a week —
consistent, but undocumented at every read site.

**Display side.** Adopt one shared presentation helper and route every changing figure through
it, so the rule cannot be re-litigated per component:
- show **MoM** and **YoY** together for any series with enough history;
- where a window is incomplete, show **the level**, not a change extrapolated from a partial or
  synthetic window;
- label the period on the figure itself, never only in surrounding prose.
Start with the screens that already display changes (StatusBar, EconomyDashboard, WorldScreen,
CompanyDeepDive's TapToChart rows, InteractiveChartModal's "in period"), and with
`formatters.ts` as the natural home for the helper. Aurora will inherit the convention rather
than re-inventing it.

### G1b — Damp the inflation swing

**Problem.** With inflation now genuinely measured (§7.11), the index is bounded and
mean-reverting but volatile: ±10–17% swings over a year across regions, where a real economy
with an inflation-targeting central bank runs a fraction of that. The measurement is not at
fault — the goods market's own prices really do move that much.

**Diagnose before fixing, in this order:**
1. **Is it the auction's own cycle?** `05-unit-bidding.ts` already damps a cobweb by having
   suppliers price off `smoothedUnitPriceUSD` rather than last week's clear. Check whether the
   residual swing is that cycle at a longer wavelength — trace a single sub-unit's price,
   supply and demand over 120 weeks and look for the phase relationship that identifies a
   cobweb (supply responding to a price it can no longer sell into).
2. **Is it missing monetary transmission?** The Taylor rule responds correctly but nothing
   carries a rate change into demand: no real lending (G2), no household rate response (MS).
   A central bank that can see inflation but cannot act on it is exactly an economy whose
   prices oscillate freely. If (1) is clean, this is the cause, and the fix is G2/MS rather
   than anything in the price index.
3. **Are expectations doing any work?** `expectedInflation` is adaptive over the measured
   series but feeds only the Taylor rule and the sovereign curve. In reality, anchored
   expectations damp actual price setting, because sellers and buyers price against the
   inflation they expect. Consider whether `05-unit-bidding.ts`'s real bid and offer prices
   should carry an expectations term — a genuine behavioural channel, not a smoothing filter.

**Do not** damp it by smoothing the index, widening the basket to average the swing away, or
clamping inflation. The index is the measurement; if the measurement is volatile, the economy
is, and the economy is what to fix.

### S4r — Government debt service (the one piece S4 left)  *(not in §4: deferred into BP5)*

**Done in S4:** every clearing fill now has a cash leg, banks fund their own bond purchases from
reserves, the formula drift on the aggregate sovereign book is gone, and an invariant enforces
that an institution's cash plus securities can only move by real flows.

**Not done, deliberately:** the government books **no interest expense at all** — a tranche's
`couponRate` is stored and never paid by anyone or received by anyone. Paying holders their
coupons therefore cannot be added on its own: funding it from outside the budget creates money,
and adding it on top of the deficit double-counts, because a real fiscal deficit already includes
interest.

The correct decomposition is `governmentSpending = interest + procurement + transfers`, with
interest computed from the real debt stack and the remainder splitting by
`GOV_PROCUREMENT_SHARE_OF_SPENDING`. That is worth doing properly rather than quickly: it gives
the simulation a real and important mechanism — rising debt and rising rates crowding out
procurement and transfers, and in the limit a debt spiral — and it must stay consistent with the
national-accounts identity established in §7.9. **Do it as part of BP5** (government as a real
fiscal counterparty), which owns that decomposition, and pay coupons to holders in the same pass.

### S6 — Delete every duplicate price-setter

One pass, pure deletion/rewiring. All must READ cleared state, never recompute:
- `12-portfolio-and-positions.ts`: delete the `corpBondPremium`/`adjustedOasSpreadBps` block
  (bps-treated-as-fraction bug; duplicates 07b). Mark player corp-bond positions off the
  tranche's cleared stat.
- `components/company/CompanyDeepDive.tsx:770-778`: same formula pasted in UI (plus a
  `× 1_000_000` stale-unit bug) — price tranches from cleared OAS (fixed) /
  `leveragedLoan.discountMarginBps` (floating) via the pricers as pure converters.
- `components/screens/RatesScreen.tsx`: gov bonds priced via `priceCorporateBond` + invented
  sovereign-rating premium → read 07c's cleared `zeroRates`/curve.
- `pricing.ts:priceLeveragedLoan`: remove the `bucketDemandPremiumBps`/`seniorLienDiscount`
  clamp path; the function becomes a DM→price converter taking the cleared DM.
- `components/DiagnosticsModal.tsx`: delete the fabricated "micro aggregation" block
  (invented capex/wage-push/retail formulas, `baselineCapex = n×50`, nonexistent
  `pricingPowerMarkupPct`); show real engine numbers or nothing. Also remove hardcoded
  "200 issuers", "~40% recovery", per-region r*.
- `components/OverflowMenu.tsx`: sim clock hardcodes 2024 epoch → use `formatSimulationDate`.
- `components/screens/MyBookScreen.tsx`: `initialCapital = 25000000` duplicate → read from a
  single exported constant next to `startingCash`.
- `scripts/invariants.ts`: the sovereign-absorption check now references real fields but the
  shock changes nothing (§6) — make it detect the real transmission once the shock actually
  reaches 07c, and root-cause where the shock is dropped.
- `shared-helpers.ts`: delete `computeBucketDemandPremiumBps` once its two consumers above are
  gone — it is the last vestige of the pre-clearing spread formula.

### S7 — One holdings ledger

**The design decision, made explicit: the real books written by the clearing stages ARE the
ledger.** Per-entity `itemizedHoldings` (07b/07c/07d write them), per-bank tenor books, and
dealer inventories are the only stores anyone writes. Everything else becomes a *view*:

1. Delete stage 11's weekly mechanical rebuild of `bankingSector.itemizedHoldings` and the greedy
   init attribution wherever a real book now exists. Init seeding uses the engines' own
   proportional shapes (lesson §7.4).
2. Region-level aggregates (`institutionalSector.corpBondHoldingsUSD` etc.) become derived sums
   computed in one selector module (`stages/holdings-view.ts`): `aggregateRegionalHoldings(state,
   regionId)`. Stage 02's residual ownership drift on any aggregate that now has a real
   underlying book is deleted — a drift on a derived number is a second writer.
3. **Ownership shares split into two kinds, and the file must say which is which.** Shares whose
   holders are all real (institutional vs bank vs dealer) become measured outputs of the real
   books. Shares whose complement is *not yet modeled as holders* (household + foreign share of
   corp bonds — the complement of `corpBondOwnership.institutionalShare`) stay structural
   parameters feeding `tradableFloatUSD`, clearly labeled as bootstrap parameters that retire
   when MS (households hold assets) and WS9 (foreign holders) land.

**Verify:** a conservation invariant per instrument — Σ(entity holdings) + Σ(bank books) +
dealer inventory + passive share × outstanding = outstanding, every week; UI ownership panels
read the selector and change nothing else.

### S8 — Three mechanical fixes

- **Contagion decay:** `creditContagionBps` (stage 01) = defaults in a rolling ~52-week
  window × 12, decaying — not cumulative-ever.
- **Input price index baseline:** stage 05's `clearedInputPriceIndex` must measure vs. a
  fixed baseline (store `baseUnitPrice` once at init per category), not week-over-week.
  Audit its consumers for level-vs-delta semantics when changing.
- **Housing supply:** `macro/evolution.ts:682` reads `residential_construction`'s
  `inventoryLevelUSD`, frozen at init for output-only categories. Real fix: housing supply =
  the real cleared output of the `residential_construction` auction (stage 05 units/inventory
  by sub-unit), not `categoryDemand` inventory at all.

### S9 — Player flow enters the real market

**Where:** `trade.ts`, `12-portfolio-and-positions.ts`, the 07x adapters, `TradeTicketModal.tsx`.

A player order is client flow to a dealer desk, exactly like any other participant's:
1. **Execution now, impact next week.** The trade executes against the relevant dealer inventory
   at the current cleared stat ± the dealer spread (buys pay the offer, sells hit the bid — fix
   the current both-sides-pay-markup sign bug). The inventory delta is written at execution.
2. **The market feels it through the standing inventory.** Next week's auction already reads
   prior dealer inventory; a large player buy leaves the dealer short, and the dealer's residual
   absorption at the solve moves the level. No bespoke "player impact" formula — the engine's
   existing mechanics carry it.
3. **Maturities pay contract, not formula:** a held tranche at maturity credits exactly its
   contractual principal + final coupon, netted against what was actually paid (kills the
   free-money bug).
Equity and commodity player flow route the same way once WS4/G7 books exist. After G3, "the
dealer" is a named bank's desk and the player's counterparty is real all the way down.

**Verify:** round-trip a large player position and confirm the level moves next week and decays
as the desk lays off; fee conservation invariant still holds; maturity P&L equals coupon math.

### S10 — Backlog batch

Work §6's table in one or two commits. Nothing there is architectural.

---

### WS4 — Equity clearing (slice 4) + sentiment retirement

**The biggest lift.** Prereq: S5–S7.
**Where:** new `07e-equity-clearing.ts`; share registry in `domain/company.ts` holdings.

1. **The registry holds SHARES, not dollars.** Add `instrumentType: 'EQUITY'` holdings whose
   quantity is a share count; USD value is always shares × cleared price, derived. Storing
   dollars would make the book's size depend on the price the book is supposed to set — the
   circularity that broke ownership convergence once already (#28). Holders: institutional
   entities (equityPct), a per-region household aggregate participant (the passive base until MS
   makes it cohorts), banks' small trading books, and the company itself (treasury shares from
   buybacks). Seed from `equityOwnership` with the engine's own shape (§7.4).
2. **Instrument:** the stock, `statKind: 'PRICE_LIKE'`; float = shares outstanding × tradable
   share. Each participant's reservation price is its own fair value from real primitives:
   expected EPS (real trailing + real revenue trajectory, not consensus theater) capitalised at
   its own required equity return — 10Y cleared yield + β × its equity risk premium — with growth
   from the company's real reinvestment. For loss-makers the reservation comes from real book
   value at a distress haircut, which retires the |loss|×PE branch (bigger losses currently price
   HIGHER — pricing.ts:66). Heterogeneous fair values across holders give the demand curve its
   slope; `fullSizeStatRange` is a % of price.
3. **Real corporate flow:** buybacks are the company's own bid (sized by S5's real cash and
   payout policy) retiring shares into treasury; IPO/secondary issuance is real new float
   (WS8 prices it in this book). Dividends already flow through S5's ledger.
4. **Then delete `comp.sentiment` as an input** — flow is now the real thing sentiment faked —
   and G8's dead plumbing with it. `priceEquity` survives only as a fallback/derivation.
   Indices become cap-weighted cleared prices (no separate index dynamics).

**Verify:** 60-week — share conservation (Σ holdings + treasury = outstanding, every week);
no monotonic index drift; realistic weekly vol (roughly 1–3%); earnings surprises move the
surprised name, not the market; Spearman(earnings yield, subsequent return) positive.

### WS5 — T-bills + commercial paper

**Where:** new `07f-short-debt-clearing.ts`; stage 11 (bill issuance); `domain/company.ts`
(CP as a short unsecured tranche kind).

**Bills.** Extend the real gov ladder below 2Y (13/26/52w). Stage 11 splits deficit funding
between bills and bonds by a real treasury rule — target bill share of stock (~15–25%) plus a
cost lean toward the cheaper cleared end. Bills clear in the same engine (YIELD_LIKE,
duration <1): banks bid off reserve arbitrage (reservation ≈ policy + a few bp — the same
mechanism that anchors the 2Y), institutions bid their cash sleeves, MMFs dominate once WS7
lands. The front end of the curve below 2Y then comes from cleared bills, not extrapolation.

**CP.** Issuers are companies whose S5 ledger projects a genuine working-capital gap over the
next ~13 weeks (real purchase obligations vs cash trajectory) and whose rating has market
access; size = the gap. Buyers price it as bills + the issuer's short-horizon expected loss
(annual PD scaled to tenor). CP outstanding is a real short tranche — it appears in
`totalDebt`, pays real interest through the ledger, and can FAIL to roll: an issuer whose CP
finds no bid inside its bank-line backstop draws the revolver (G2 hook) — that is the real
mechanism of a funding squeeze, and it should exist here even in stub form.

**Verify:** bill yields sit on the policy corridor's arbitrage band; CP–bill spread orders by
rating; a rate hike moves bills within a week and CP with them.

### WS6 — Private repo

**Where:** fold into 02b (it is interbank cash management); `domain/banking.ts`.

One overnight GC repo market per region. Participants are the named banks: surplus banks lend
cash against sovereign collateral, deficit banks borrow against their real tenor-book holdings
(borrow capacity = holdings × (1 − haircut); encumbered collateral is flagged in the S7 ledger
and cannot simultaneously be sold). Reservations are the administered alternatives, which is why
the corridor holds without a clamp: no lender accepts below ON RRP + ε (it has the facility), no
borrower pays above SRF + ε (it has the window). The engine clears one rate; positions are
overnight, re-cleared weekly, carried as `repoLentUSD`/`repoBorrowedUSD` with real interest in
each bank's P&L.

**Verify:** repo prints inside the corridor every week *because* volumes migrate to the
facilities at the edges (check facility usage spikes when repo touches a bound); collateral
encumbrance never exceeds holdings.

### WS7 — Money market funds

New `InstitutionalEntityType: 'MONEY_MARKET_FUND'`, one or two per region, generated like the
other institutional companies. **Liabilities are real shares:** corporate treasuries sweep cash
above a real operating buffer (S5's honest ledger says what that is) and the household aggregate
allocates between deposits and MMF shares on the real yield gap — which finally makes banks
compete for funding (G2 reads deposit outflow to MMFs as a real funding cost driver). NAV fixed
at 1; the fund's yield is its real asset yield minus a fee.
**Assets:** bills + CP (WS5) and repo lending (WS6), with ON RRP as the real floor-rate
residual — the fund is the missing dominant bid in both WS5 books, which is why it sequences
after them. Redemptions force real asset sales into the same books.

**Verify:** MMF yield tracks policy with a ~1-week lag; a policy hike pulls deposits toward MMFs
(measure the flow); bill/CP demand visibly deepens vs the pre-WS7 baseline.

### WS8 — Issuance with placement agents  *(the primary market)*

Today `decideCorporateFinancing`'s issuance settles instantly at the current stat via
`settleCorporateActionOnHolders`, and stage 08's maintenance/refi rolls at formula terms. Both
become real primary offerings:

1. A `PrimaryOffering {issuerId, instrumentType, sizeUSD}` queue feeds the relevant clearing
   book (07b/07d/07e/CP) as **extra float in that week's solve** — the auction prices the new
   paper and the outstanding stock together, which is how a real new issue concedes.
2. A named bank is lead (pick by `bankMarketShare`, rotate); it earns a real underwriting fee
   and its dealer desk (G3) takes any unsold residual at the cleared level — underwriting risk
   is real inventory risk.
3. Maintenance funding and refi rollovers route through the same queue: a company refinances at
   the price the market clears that week, not at a formula. A failed offering (cleared level
   beyond the issuer's walk-away, from `decideCorporateFinancing`'s own economics) is withdrawn —
   real market access, closing when spreads gap.
`settleCorporateActionOnHolders` survives only for corporate actions that are genuinely
pro-rata (calls, full redemptions).

**Verify:** heavy issuance weeks print visibly wider (the concession exists); a CCC issuer's
offering fails in a wide market rather than printing anyway.

### WS9 — Real trade & FX

**Confirm the currency-zone premise with the user first** (standing caveat). If confirmed:

The FX rate clears from real net currency demand, replacing `06-fx-and-trade.ts`'s drift formula
(the UIP sign bug and the gdp-poisoned capital-flow term die with it). Participants per pair:
- **Trade flow** (inelastic): cross-region purchases already computed in stages 05/06 — an
  importer sells its own currency for the exporter's, week by week, at whatever the rate is.
- **Carry/speculative flow** (elastic — the price-setter): banks and hedge funds with a
  reservation from the real cleared short-rate differential vs the rate's recent path; this is
  where UIP lives as behaviour instead of a formula term.
- **Portfolio flow**: cross-border clearing fills, once foreign holders exist (they also close
  S7's foreign-share parameter). Until then trade + carry suffice.
Engine `PRICE_LIKE` per pair; cross rates by triangulation from the three cleared USD pairs.

**Verify:** a rate-differential shock moves the pair in the carry direction; trade deficits
depreciate slowly against sticky flows; no drift term anywhere.

### WS11 — Corporate + bank hedging

After G4 exists. Exposure is already measurable from real books: FX (a company's real
cross-region sales from stage 06), rates (its floating-debt share), commodities (its real recipe
input quantities). Each company hedges a policy fraction (BP2 profile) with a named bank at the
G4-cleared level; the bank aggregates client flow and lays the net off through the same G4
markets; what it cannot lay off stays on its book and consumes its real capital. Hedged
companies then genuinely feel less P&L from the shocks they hedged — measure that, it is the
point of the item.

---

### G2 — Itemized lending + endogenous money

**The deepest remaining money item; likely root of #67. Build in five ordered slices, each
verified before the next:**

1. **Itemize the stock.** `BankLoan {id, borrowerId, principalUSD, marginBps, originationWeek,
   termWeeks, status}` per named bank; migrate today's aggregate business-loan number into real
   loans to real borrowers (companies + HC's SME pools; households arrive with MS),
   allocated by the borrowers' real existing bank debt. Aggregates become sums.
2. **Real interest, both directions.** Borrowers' S5 ledgers pay loan interest to the named
   bank; banks pay real deposit interest. NIM stops being a formula — it is revenue minus cost
   on real books. (This is the #67 test: if capital still collapses with real interest flows,
   the leak is elsewhere and now visible.)
3. **Origination is a priced decision, reusing the reservation logic.** A borrower asks (S5
   working-capital gap, capex funding, revolver draw on CP failure); the bank quotes
   policy + margin from the same expected-loss + capital-cost arithmetic the bond market uses
   (`computeReservationSpreadBps` with loan charge) IF it has capital headroom (CET1 vs
   rating-weighted RWA) and funding; otherwise it declines. A declined borrower is a real credit
   crunch, not an index.
4. **Loans create deposits.** Origination credits the borrower's deposit at that bank (both
   sides of the bank's sheet grow); spending moves deposits between banks with reserve
   settlement (Phase-2 machinery already exists); repayment destroys deposit and loan.
5. **M2 becomes a derived sum** (deposits + currency); delete the growth formula. Deposit rates
   are set per bank competing with the MMF yield (WS7) — funding cost is real.

**Verify per slice;** end state: money-stock changes decompose exactly into net origination;
bank capital ratio explained by real P&L; a policy hike measurably slows origination (the
transmission channel G1b item 2 says is missing).

### G3 — One dealer system

The dealer becomes what it is in reality: a desk inside a named bank. `DealerDesk {bankTicker,
inventoryByInstrumentId, capitalAllocatedUSD}`; migrate the current region-level inventories to
the largest banks by market share. Inventory then costs something real — it consumes the bank's
capital (RWA) and funding (repo, G2) — which makes the desk's leaning behaviour economically
forced rather than parameterised, and gives §7.19 item 3 its fix. Quotes: mid = cleared stat;
spread widens with the desk's inventory utilisation; an axe is just an inventory position the
desk improves its price to reduce. The player faces the best quote among the three largest desks
(keeps the three-dealer UI, backed by real banks); `state.dealers` is deleted. Prereq S9 so
player flow already routes through inventories.

**Verify:** desk P&L reconciles to spread capture ± inventory MTM; a capital-constrained bank
quotes visibly wider (the real liquidity-cycle channel).

### G4 — Real derivatives markets

Each is an engine adapter with a small real participant set; the closed-form pricers remain MTM
converters. **Build IRS first** — its natural two-sided demand already exists in the sim.
- **IRS:** par rates at 2/5/10Y per region, YIELD_LIKE. Payers of fixed: banks hedging G2 loan
  books, corporates with floating debt (WS11). Receivers: insurers/pensions extending to their
  liability duration (from G6; before G6, from the duration gap already computed in 07b's fit
  logic). The cleared par rate minus the 07c bootstrap = a real swap spread, the first
  cross-market basis the sim produces — watch it, it is a powerful diagnostic.
- **CDS:** start with one IG and one HY index per region (single-name later). Protection buyers:
  banks (G2 books), HFs; sellers: yield-seeking insurers. Cleared index spread vs cash OAS = a
  real CDS-cash basis. Margin flows are real cash through the ledgers.
- **Options:** one implied vol per equity index: bank desks (G3) make markets, institutions buy
  real downside protection sized to their real equity books; inventory-vs-hedging-demand clears
  the vol (kills the `|| 0.3`). Realised-vs-implied desk P&L is real.

**Verify:** swap spread and CDS-cash basis stay in single-digit-bp bands in calm weeks and blow
out under stress — the bases are the test that the legs are consistent.

### G5 — Default resolution

On default, an `Estate {companyId, assets, claims[]}` opens instead of a constant recovery:
real assets (cash, receivables, inventory at real lot values, PP&E at a haircut) are sold over
~26–78 weeks *through the real markets* — inventory into stage 05 as distressed offers, PP&E to
peers as cheap capex — and proceeds waterfall to claims by real seniority (first-lien loans,
then bonds, equity residual, usually 0). While the workout runs, the defaulted claims keep
trading in 07b/07d at the §7.20 recovery-based reservations, marked against the estate's own evolving
asset value — the model's distressed pricing and its resolution process read one book.
**Recovery becomes an output, and it closes the §7.20 loop:** realized recoveries calibrate the
priced LGD (a rolling realized-recovery average replaces the `CREDIT_RECOVERY_RATE` constant),
completing the one-default-model unification begun in §7.20 (the hazard side landed there; the recovery side lands here).

**Verify:** recoveries disperse by asset-heaviness (an asset-rich defaulter recovers more);
waterfall conservation (proceeds = distributions exactly); loans recover above bonds.

### G6 — Institutional liabilities

The item that makes institutional demand heterogeneous for real (§7.19 item 4). Insurers:
premiums as a real expense line on companies (and households post-MS), stochastic claims scaled
by real events/weather; technical reserves = expected claims; the liability duration is the
reserve duration. Pensions: contributions as a real slice of wages (real once MS lands),
benefits from a simple cohort table; the funded ratio is real and drives risk appetite the way
it actually does — underfunded funds reach for return, fully-funded funds derisk into bonds.
Then **derive and retire the constants**: each entity's required return = its real liability
cost; its duration need = its real liability duration; `REQUIRED_RETURN_ON_CAPITAL` and
`INSTITUTIONAL_REAL_RETURN_BPS` become measured properties. Demand curves stop being parallel
because balance sheets genuinely differ.

**Verify:** an insurer with a bad claims year visibly derisks; pension demand for long duration
rises as its funded ratio improves; dispersion of reservation spreads across entities widens.

### G7 — Commodity futures market

Per major commodity: four quarterly contracts, PRICE_LIKE, spot stays stage 07's real market.
Participants: producer companies hedge a policy fraction of real forward production (sellers);
recipe-input consumers hedge real forward requirements (buyers); bank/HF speculators trade
value-vs-carry; a storage arbitrageur (the real inventory holders) whose reservation is the
cost-of-carry bound — spot + financing + storage — which keeps the curve arbitrage-consistent
without a clamp. Convenience yield becomes *derived* from the cleared curve vs carry.
Contracts cash-settle to real spot at expiry. Hedged producers/consumers then feel less spot
P&L (same test as WS11).

**Verify:** contango when inventories are high, backwardation when scarce — measured, since both
states genuinely occur in stage 07; expiry convergence within the dealer spread.

### G8 — Sentiment retirement  *(not in §4: folded into WS4)*

Delete `comp.sentiment` inputs once WS4's real flow exists (folded into WS4 — listed here so
it isn't forgotten as a standalone cleanup: also delete the dead `sectorSentimentShocks`
plumbing and `NewsItem.sentimentDelta`, or wire news to the real flows that now exist).

### G9 — Central bank as counterparty

The CB's book becomes real: seed from `centralBankShare` of the sovereign stock; roll maturities
as real (inelastic, at-market) bids in 07c sized to redemptions. Policy then has a real quantity
lever: QT = redemptions not reinvested (real supply the market must absorb — 07c prices it),
QE = real purchase flow when the policy rule wants easing at the effective lower bound.
Remittances close the fiscal loop: coupon income − interest paid on reserves flows to the
government's real account (BP5). The CB has no capital constraint and never defaults — the one
balance sheet allowed to be special.

**Verify:** announcing QT steepens the cleared curve through real absorption, not a term-premium
formula; remittances fall mechanically when policy rates exceed portfolio yield (a real, famous
phenomenon the sim should reproduce for free).

---

### MS — Main Street (people, labor & wages)

Theme: the household aggregate becomes real people with real jobs at real companies. Cohorts,
not 300M individuals: ~20 per region (occupation × income quintile), each a real unit with a
wage from a named employer's real payroll, a savings stock held in real instruments, and a
consumption budget.

1. **MS1 — Households as cohorts.** Replace `reg.householdState`: each cohort earns (real
   payroll from its employer set + transfers), pays taxes (BP5's real collection), saves into
   real assets — deposits (G2's real liabilities), MMF shares (WS7), equity (WS4's registry),
   pension claims (G6's real contributions) — and consumes: stage 05's household bids become the
   sum of cohort budgets, each with its own real price sensitivity (low-income cohorts are the
   inelastic food-and-energy demand; high-income the discretionary swing). Household income
   becomes a derived sum — S1's identity holds by construction and its assert-era scaffolding is
   deleted. Households holding real assets also retires S7's structural household-share
   parameters and gives WS4 its passive base.
2. **MS2 — A real labor market.** New stage between 02b and 03: companies post openings from
   real capacity need (their production plans vs current headcount, the same data stage 05
   already implies); cohorts flow toward better wages with real friction; quits/layoffs move
   real payroll. Unemployment becomes the measured gap between cohort labor supplied and jobs
   filled — which finally reconciles the two disagreeing representations (§6's root
   labor-supply/demand item) by making both sides real. Wage drift dies: a company that cannot
   fill openings raises its offered wage (MS3's policy), and THAT is wage-push.
3. **MS3 — Corporate wage/management policy** (absorbs #52): per-company wage setting from
   vacancy-fill experience and margin headroom; hiring/firing from real capacity economics;
   `executionQuality` feeds retention. Runs parallel with MS2.

**Verify:** unemployment, wage growth and the vacancy rate move together sensibly (a real
Beveridge-ish relation); a big employer's failure raises regional unemployment and cuts real
consumption in stage 05 — the recession transmission the sim exists to have.

### BP — Blueprint (government, regulation & industry structure)

1. **BP1 — One industry registry, FIRST** (#50): a single `domain/industry-registry.ts` typed
   table: category → sub-units, buyer mix, input recipes, capex weights, commodity links, labor
   intensity by occupation. `INDUSTRY_SUBUNITS`, `CATEGORY_INPUT_REQUIREMENTS`,
   `COMMODITY_CATEGORY_LINKAGE` become views of it (then die as separate definitions). Adding an
   industry becomes one entry — the precondition for every specialization below and for HC's
   firm and pool keying.
2. **BP2 — Industry profiles** (#51): per-sector `{capexIntensity, cyclicalityBeta,
   financingPreference (bond/loan/equity mix), payoutPolicy, hedgingPolicy}` consumed by stage
   08, `corporate-financing.ts` (which market an issuer taps stops being uniform) and WS11.
3. **BP3 — Electricity** (#54): a real commodity + a registry recipe line in every industry at
   BP2 intensities; utilities already exist as producers.
4. **BP4 — Share-vs-margin strategy** (#55): a per-company posture (gain share vs harvest
   margin) expressed ONLY through its real stage-05 offer price relative to cost — underpricing
   within contribution-margin bounds buys real share because the auction fills cheaper offers
   first; no synthetic share variable.
5. **BP5 — Government as real fiscal counterparty** (#64): real tax collection (corporate from
   real quarterly profits via S5 ledgers; household from real wages post-MS); spending decomposed
   `interest + procurement + transfers` — absorbing S4r: coupons actually paid to holders from
   the account, procurement through real stage 05 bids, the funded deficit fully derived. Rising
   rates then genuinely crowd out procurement — the debt-spiral mechanism S4r wanted.
6. **BP6 — Antitrust** (#45): real `categoryMarketShare` above a threshold for N sustained weeks
   → forced divestiture (split the company into two real companies via the existing generation
   machinery, dividing product lines, debt and holders) + an M&A freeze flag stage 10 respects.
7. **BP7 → absorbed into HC** (its own master project, §5-HC): the hidden corporate sector as
   real named firms with a full lifecycle. Nothing of it remains in Blueprint except that BP1's
   registry is what HC's firms and SME pools are keyed to.

### HC — Hidden Corporates (master project): the real non-public sector

**What this is.** The hidden sector stops being five scalars and becomes what it is in reality:
the majority of the economy, made of real firms that **issue debt, employ people, default, and
go public**. Decisions settled with the user (2026-08-27): ~300 named private firms per region;
private equity sponsors as a real institutional type, in this project; two waves; the synthetic
IPO generator is replaced entirely.

**Why it leads the queue (the measurements, §7.18 + §6):** the sector is 56.5% of the economy by
revenue and carries 549.4B of debt — 86% of all corporate debt — as a scalar nobody can own,
which is why institutional corporate-credit appetite runs **6.4x** the credit that exists.
The bootstrap's firms also demand 11–14% fewer workers than the population supplies — the
missing employers are these same firms. And the public universe's generated rating distribution
has **zero BBB and zero high yield**, while in reality the B-rated universe *is* mostly
PE-owned private firms. One missing sector explains three separate standing defects.

**Architecture: two tiers, one firm model, listing as a state.**

- **Tier 1 — named private firms** (~300/region): real `Company` objects with
  `listingStatus: 'PRIVATE' | 'PUBLIC'` replacing today's implicit always-public. A private firm
  has no traded equity (no `stockPrice`, no share registry entry, no consensus/earnings theater —
  stage 08 runs a reduced, cheaper path for them, which is also the realistic one: private firms
  do not report quarterly), an `ownership` block ({founderPct, peSponsorId?, peSponsorPct}), and
  everything else real firms have: product lines bidding in stage 05, occupation demand, a debt
  ladder, a rating, a cash ledger (S5). Every stage that takes `Company` works on them with the
  listing flag deciding the few genuinely public-only behaviours. **No parallel type** — a
  second firm type would be two representations of one real thing.
- **Tier 2 — the SME mass**: the long tail stays aggregate but re-keyed to BP1's registry
  categories (finer than today's five segments), bank-financed only, with real aggregate
  entry/exit and employment. It is a real pool, not a formula: its revenue is its real stage-05
  participation (already built in 1$-Phase 3), its debt is real bank loans (G2's book), its
  losses are the banks' real loan losses.
- **PE sponsors**: new `InstitutionalEntityType: 'PRIVATE_EQUITY'`, 2–3 funds per region.
  Balance sheet: committed capital (insurers/pensions/asset managers allocate a real
  `privateEquityPct` sleeve — real, illiquid, drawn down when called), dry powder, and a
  portfolio of companyIds. The sponsor is what makes the leveraged-loan market make sense: in
  reality PE-owned issuers ARE the B/BB loan universe, dividend recaps are the opportunistic
  supply RVr needs, and exits are the IPO pipeline.

**Conservation is the build discipline.** Tier 1 firms are **carved out of** the existing
segment aggregates, never added on top: at cutover, Σ(named firms) + (SME residual) must equal
the prior segment totals for revenue, debt, and employment exactly, and a same-week A/B against
HEAD must show GDP, employment and total debt unchanged. Firm sizes draw from a Pareto tail
(real firm-size distributions are power-law) calibrated so the sums close.

---

**Wave 1 — real firms, real debt, real employment** *(§4 position 3; prereqs: none)*

- **HC1 Generation & carve-out — DONE** (see the commit "HC1: the named private tier exists").
  301 firms/region carved from the segments (`bootstrap/private-firms.ts` Pareto-quantile seeds,
  `generatePrivateCompanies`), `listingStatus`/`ownership` on Company, `ctx.prevActiveFirms` as
  the public-only containment gate with `prevActivePrivateFirms` for per-wave opt-in, a reduced
  stage-08 path (real ladder interest, cash walk, coverage, the same default trigger — no equity
  or reporting theater). Measured: debt conservation exact to the decimal (USA 549.4B before =
  75.5B firms + 473.9B segment residual after), zero spurious defaults over 26 weeks, zero
  non-finite fields across 2,006 companies, 26 weeks in ~27s.
  **Finding that reshapes HC2's numbers:** the segment primitive `debtUSD = 2 x revenue` implies
  ~15x debt/EBITDA on the private sector as a whole — the first carve scaled real ladders up to
  meet it and killed a third of the cohort in 26 weeks. The tier now carries what real leverage
  services (~75B USA, not ~330B), so HC2 brings roughly 3x today's investable credit supply
  rather than 8x; the remaining ~474B stays as the SME mass's bank debt (G2's loan book) and the
  2x-revenue primitive itself is flagged in §6 for recalibration against what serviceable
  leverage plus the real bank book can actually support.
- **HC2 Real debt — DONE** (commit "HC2: the private tier's debt enters the markets"). The
  tier's real ladders clear in 07b (fixed) and 07d (floating), the tradable float seeded onto
  the same holders in the engines' own shape with no cash movement (recognising an existing
  stock — §7.4 honored), coupons accruing to holders, private defaults counting as market
  credit events. Measured at week 26: bond universe 317 names (126 private), **loan universe
  292 names, 246 private** — the leveraged-loan market is now mostly sponsor-owned private
  paper, as the real one is; IG medians unchanged (168–226bp); want/have **6.4x → 3.8x**. The
  remaining gap is exactly HC1's finding: real leverage services ~75B of tier debt, not the
  segment scalar's ~330B — full closure runs through the §6 segment-debt-primitive
  recalibration plus G2's bank book, not more tier issuance. HY (bonds and loans both) still
  clears at the distressed saturation backstop, and loans there print slightly WIDE of
  same-rated bonds: with the buyer base fully invested (cash 0.0%) and budgets binding, the
  level is set by the most reluctant current holder rather than two-sided schedules — the
  honest price of a market with no new money, resolving via G6's liability inflows and HC5's
  calibration, not by seeding more generous sleeves.
- **HC3 Employment & capex handover — DONE; goods handover re-scoped as HC3b.**
  What landed: private firms are real employers (occupation demand with real sector mixes;
  segment employment reduced by exactly the carved headcount — USA 6.9M total conserved to the
  worker) and real capex demanders (their capex in the corporate demand base; segment capexUSD
  reduced identically). Two of this pass's own bugs are worth remembering: employment change
  must be measured over the SAME firm universe on both sides of the week (an asymmetric pair
  read the tier's arrival as a mass layoff and pinned unemployment at its 25% cap), and an
  unsold-production penalty must only exist for a firm that actually offers into a modeled
  market.
  **HC3b — the real product-market handover — waits for BP1, and the reason is a measured
  structural fact, not caution:** the auctioned sub-unit categories' demand is calibrated
  against public supply, while the hidden tier's output genuinely sells OUTSIDE the modeled
  taxonomy (services, local trade — categories that do not exist yet). Injecting the tier's
  165B/region of supply into markets sized for 211B of public revenue collapsed both (−10% to
  −22% growth). The right fix is BP1's registry carrying the hidden sector's real categories,
  with demand routed to them by real buyer mixes — then private firms get product lines in
  THEIR markets, segment annualRevenueUSD is carved in the same pass, and the sales-anchored
  revenue path (already written, gated on market presence) switches on.
  **Correction to an earlier claim:** HC3 does not narrow the 11–14% labor supply/demand gap —
  the carve conserves totals by construction, so the gap remains MS2's to close by making both
  sides real. What HC3 delivers is attribution: labor demand now belongs to named employers.
- **HC4 Ratings & the sponsor universe — DONE.** The rating-distribution fix landed in HC1 (it
  was generation-side); HC4 added the owners: `PRIVATE_EQUITY` as a fifth institutional type,
  two funds per region holding the levered cohort (USA: 131 sponsor-owned firms, BB 85 / B 31 /
  CCC 9 — the real sponsor universe). Fund NAV marks weekly from the portfolio companies' REAL
  EBITDA and real ladders (EV multiple less debt at the stake), so a portfolio company's
  deterioration hits its sponsor the week it happens. LPs (insurers/pensions/asset managers)
  hold fund interests recorded under HC2's doctrine — the stakes existed, the owners were
  unmodeled, no cash moves at recognition — and committed-but-undrawn capital is a real claim
  on named LPs that HC6's deal flow draws through the budget machinery. PE funds carry zero
  security-allocation targets: they own companies, not paper, and never bid in the
  bond/loan/sovereign auctions.
- **HC5 Calibration gate — MEASURED; Wave 1 closed.** On the enlarged universe (299–316 bond
  names, ~290 loans): IG strictly ordered and realistic (AAA 157 / AA 163 / A 175 / BBB 218),
  zero negative spreads, zero numerical-guard hits. Spearman(leverage, OAS) = 0.74–0.76 —
  below the 0.8 target and explained rather than tuned: ~250 investment-grade names now carry
  honestly near-identical expected losses, so rank correlation is diluted by ties, and the HY
  cohort clusters at the capacity backstop. Want/have = **3.8x** against the 1.0 target, with
  the closure path known and recorded (the segment-debt-primitive recalibration + G2's bank
  book + G6's liability inflows), not open. Runtime 26 weeks ≈ 60–80s at 2,000+ firms (~2.5x
  the pre-HC cost) — inside budget, with the §6 optimization sweep as the standing lever.

**Wave 2 — the lifecycle** *(§4 position 14b; prereqs: WS4, WS8, G2)*

- **HC6 PE deal flow.** LBOs: sponsor buys a private firm (or takes a public one private —
  delisting is just the listing flag, the same one-firm-model payoff) at a real EV/EBITDA price,
  funded ~50–60% by a new leveraged loan priced as a real WS8 primary offering in 07d, equity
  from dry powder. Dividend recaps when spreads are tight (real opportunistic supply). Exits:
  sale to another sponsor/strategic (stage 10) or IPO.
- **HC7 Real IPOs — the synthetic generator dies.** `generateIPOCompany` is deleted. An IPO is
  an existing private firm choosing to list: motive = WS4-arithmetic public valuation exceeding
  private hold value, plus owner intent (sponsor exit window, founder liquidity); mechanics =
  a WS8 primary offering into the 07e equity book (primary shares fund growth/deleveraging,
  secondary shares are the sponsor selling down), lead bank earns the real fee. The IPO price is
  what the book clears — a weak book prices low or pulls the deal, which is real.
- **HC8 Births.** A registry category whose SME pool grows past a real threshold spawns a new
  named private firm carved from the pool (conservation again). Firm creation now has exactly
  one path: born small → named private → public. Deaths in the mass stay statistical and feed
  bank loan losses (G2).
- **HC9 Defaults into estates.** Private-firm defaults open G5 estates like any other; sponsor
  equity is wiped first (real). The SME mass's default rate stops being a formula input and
  becomes the banks' measured loss experience on the real pool.

**Ties, so nothing is built twice:** BP1 (firms and pools key to the registry), G2 (bank half of
HC2 becomes itemized loans; mass losses are its loss experience), MS2 (private firms are the
missing labor demand; cohorts later work at them by name), WS4/WS8 (IPO and LBO paper price in
the real books), G5 (estates), S7 (private loan/bond holdings live in the one ledger), RVr
(recap supply and issuer births are the counterweight to issuer-count decay), §7.20 (distressed
private loans price off recovery like everything else).

**Verify (whole project):** conservation A/B at every carve; want/have ~1.0x; labor gap
narrowed; one firm-creation path; rating histogram matches a real universe shape (BBB largest IG
bucket, ~20% HY) at week 0 AND week 80; no invariant regressions.

### AU — Aurora (complete UI rebuild) — LAST

Explicit mandate: delete every current UI element and rebuild from scratch, sleek/smart/
interactive, real-world-inspired. **Required process, fixed in advance:** (1) a LONG series
of clarifying questions via AskUserQuestion — visual direction, information architecture,
interaction patterns, reference products, platform scope — iteratively, not one round;
(2) mockups the user reacts to BEFORE production code; (3) real-world product inspiration
(trading platforms, dashboards, data-dense consumer apps). Scope: all of `src/components/` +
`App.tsx`; the engine/domain layers are untouched. Sequenced last so it is designed against
the complete simulation.

---

## 6. Bug backlog appendix (batch in S10 unless absorbed earlier)

| Where | Issue |
|---|---|
| `stages/08-company-fundamentals.ts:802,814` | Dead `'Boom'` regime branches (`as string` cast is the tell); `'Recovery'` unhandled in the P/B ladder — add it, delete Boom |
| stage 08 | `isMegaCap > 100000` stale-scale dead branch |
| `11-…ts:221` + `newsGenerator.ts` | `sectorSentimentShocks` discarded at only call site; `NewsItem.sentimentDelta` never read (→ G8); fake hardcoded tickers NVST/TXEN/CHEM/WMRT/JPMC, real-world references, hardcoded prices 2.85/78.50 (rule 4 violation); `isUpgrade` via `indexOf` misclassifies HY notches |
| `domain/game-state.ts` | Dead UI fields (`selectedTab`, `isCheatsheetOpen`, `isWatchlistDrawerOpen`, `chartModalData`, `isDiagnosticsOpen`) and fully-dead `watchlist` |
| `macro/evolution.ts` | FX UIP term sign; `getInitialRegions()` rebuilt inside loops (hoist) |
| `simulation/initialization.ts:311` | `COMMODITY_CATEGORY_LINKAGE` module-global mutated at init — copy, don't mutate |
| init / macro-init / stage 03 | Three parallel demand-seed constructors — one constructor owns `CategoryDemandState` creation |
| `instruments.ts:116`, `evolution.ts:929-941` | `industrial_automation` pseudo-commodity special-case cluster — make it a plain category (its supply/demand already clear in stages 04/05) and delete the bespoke branches |
| `pricing.ts:66` | Negative-EPS equity branch prices bigger losses higher (absorbed by WS4) |
| `CompanyDeepDive.tsx:783` | `assetType: 'LEV_LOAN'` not in the `AssetType` union (`'LEVERAGED_LOAN'`); MyBook string-matches both — unify |
| `TradeTicketModal.tsx` | Option expiry hardcoded `+8` weeks & carry tenor `8/52`; IRS/CDS payoff scenarios labeled "±10%" but computed as ±10bps; "Unencumbered Cash" row shows raw cash while the gate uses free cash |
| `MyBookScreen.tsx:92-98` | Corp-bond P&L attribution uses issuer-level OAS + `tenorYears ?? 5` for tranche positions — use the tranche's cleared stat |
| `CompanyDeepDive.tsx` bank/inst cards | Prorated aggregate slices (`?? 0.25` / `?? 0.33`) instead of real per-bank/entity data; sector-actual vs entity-target allocation comparison; PP&E roll-forward first-filing artifact |
| `charts/Charts.tsx` | YieldCurveChart x-axis: nonlinear tenors plotted equally spaced, middle label wrong |
| `NewsDrawer.tsx:94` | Verify `Commodity.symbol` matches `'CRUDE_OIL'` ids; else fallback always picks `commodities[0]` |
| `ManualModal.tsx` | Restated engine constants (IM rates, axe discounts, Taylor coefficients) drifting from code — generate from the real constants or trim |
| `macro/evolution.ts` wage/tightness | Nominal wage growth goes negative (−2.5% by week 40) while inflation runs at 10% — a 12% real-wage collapse per year. Partly a symptom of G1's runaway, partly the tightness→wage-growth formula having no real bargaining mechanism. Re-measure after G1; if it survives, it belongs to MS3 |
| `macro/initialization.ts` + `computeOccupationDemand` | **Labor supply and labor demand disagree at the root**: the firms the bootstrap generates demand ~11-14% fewer workers than the population/participation primitives supply, so the occupation pools imply 11-14% unemployment while `reg.unemploymentRate` and the weekly evolution report ~4.5%. Two representations of one real thing. Writing the pool-implied rate into the field was tried during S1 and deliberately reverted (it trades a hidden inconsistency for a visible one without making the sides agree). Real fix = make firm generation and labor supply consistent → **MS2** |
| `macro/initialization.ts` | Consequence of the above: bottom-up GDP starts ~6-9% below the supply-side potential anchor (`estimatedNominalGdpUSD`). Reads as a permanent output gap. Harmless to the growth series (it is a level, not a transient) but it means displayed GDP sits below potential from week 1. Resolved by the same MS2 reconciliation |
| open (#67) | USA bank capital → 0. Measured on current HEAD it arrives by **week ~70**, not week 149 as previously recorded — the earlier figure predates the macro fixes. A/B confirms the S1/S2/G1 work does not cause it and slightly delays it (1.60% vs 0.27% at week 70). Expect the root cause via S4 + G2; re-verify then |
| goods-market cash margin vs accrual margin | §7.23 finding #2: settled auction purchases ≈ 2x settled sales for sampled firms, so the real cash margin is deeply negative while formula EBITDA says +18%. Root-cause next: is input demand sized off target production that persistently exceeds sales (inventory spiral), are auction input prices too high relative to output prices, or is the EBITDA margin the fiction? Owns the residual default rate below and probably #18 |
| public default rate ~10%/yr (was 13%) | Measured in RVr's close-out (§7.22): 59 of 196 public firms default by week 121 via the cash-exhaustion trigger, vs ~1–2%/yr in reality — while the private tier (real ladders, clean cash walk) shows zero, isolating the cause to the PUBLIC path's cash accounting. S5 cut it 59 → 46/196 by wk121; the remainder tracks the goods-market cash-margin row above — re-measure after that item |
| open (#18) | ~small residual of companies at revenue floor over long runs (re-check after S5) |
| `scripts/invariants.ts` "Institutional book moved N%" | Fires in a **periodic burst ~130 weeks apart** (weeks 129 and 259 in every run measured), 4 regions at once, always a 9-10% one-week DROP. Pre-existing (A/B confirmed against HEAD before E1). The regularity says a scheduled event, not market movement — find what runs on that cadence (annual/quarterly rebase or a history-window roll) before assuming a cash-settlement leak |
| generation-time unconditional fields | §7.17 found `leveragedLoan` attached to all 200 companies when only ~33 had loans. Sweep `companyGenerator.ts` for other fields attached unconditionally that only apply to a subset — same failure mode (a frozen record that reads as live downstream) |
| `scripts/invariants.ts` sovereign-absorption | No longer vacuous (it references USA and `zeroRates.tenor10Y` for real), but it fails with **baseline and shocked identical to 8 decimal places** — an under-subscribed auction changes the 10Y by literally nothing. Not a weak transmission, an absent one: find where the shock is dropped between the auction and 07c's curve refit |
| `bootstrap/firms.ts` rating generation | Generated rating distribution is inverted vs reality — week 0 USA is AAA 16% / AA 39% / A 45%, **zero BBB, zero HY**, 55% of debt AA or better. Dynamics are fine (BBB 39% / HY 16% by week 40); generation is wrong. Fix in HC4 (sponsor-owned private firms ARE the missing HY universe) |
| `07b`/`07c`/`asset-allocation.ts` dead tilt-era code | `computeEntityAttractiveness` (07b:125, defined, never called), `STRATEGIC_TARGET_DRIFT_RATE`/`MAX_*_TILT` constants in 07b and 07c, and `computeAllocationTilt`+`MAX_ALLOCATION_BAND`+`EXCESS_SPREAD_FULL_TILT` in asset-allocation.ts (module-internal only) all survive from the quantity-target engine. Delete in S10. 07b's header comment (lines ~15–33) still *describes* that engine — "tilted index weighting, price-impact-to-statistic conversion" — rewrite it to describe the demand-schedule auction |
| `shared-helpers.ts` `computeBucketDemandPremiumBps` | Only remaining consumers are the two duplicate price-setters S6 deletes (pricing.ts, stage 12). Delete the helper in the same pass |
| clearing damper diagnostic | `maxWeeklyStatMovePct` is legitimate discrete-time smoothing, but it must never *bind persistently* — a name clamped ≥3 consecutive weeks means the posted schedules disagree with the printed level and the print is the damper, not the market. Add a cheap per-week clamped-count to the invariants harness; alert on persistent binding |
| `macro/initialization.ts` segment `debtUSD = annualRevenueUSD * 2` | Unpriced bootstrap primitive, exposed by HC1: it implies ~15x debt/EBITDA on the private sector in aggregate, which no real balance sheet services. HC1 carves only serviceable debt into the named tier, so the residual (~474B USA) sits on the segments as implied SME bank debt at an impossible aggregate leverage. Recalibrate the primitive when G2 itemizes the bank book — segment debt should be what real SME leverage on segment EBITDA plus real bank capital can carry — and re-measure §7.18's want/have after |
| payment calendars (user note, 2026-08-27) | Coupons, loan interest and dividends are currently accrued as smooth weekly 1/52 flows (both sides: stage 08's expense and institutional-balance-sheet.ts's income). Real instruments pay on their own calendar — bonds semi-annual/quarterly, loans monthly or quarterly off the reset schedule, dividends quarterly on declared dates. The smooth accrual conserves dollars but erases real cash-flow lumpiness (quarter-end liquidity needs, coupon-date reinvestment flow, the reason CP/MMF money markets breathe on a calendar). Give each DebtTranche/loan a real payment schedule and pay on it; the S5 cash ledger is the natural place to land the corporate side, WS5/WS7 will want the lumpiness. Not urgent until those items, but every new instrument added from here on should carry its payment calendar from birth |
| algorithm optimization sweep (user note, 2026-08-27) | HC Wave 1 roughly doubles the firm universe, so hot paths matter now. Known offenders: (1) per-(entity × company) recomputation of per-company quantities in the clearing adapters — the structural PD was computed 4x per company per market per week (fixed by per-region memoization, same commit as this note); apply the same pattern to any per-company quantity inside a participants loop. (2) stage 08's per-company `state.institutionalEntities.find` and full-array scans inside company loops — build Maps once per week. (3) `getInitialRegions()` rebuilt inside loops (already in this backlog). (4) stage 05's auction inner loops are the largest fixed cost — profile before HC5's runtime gate, optimize only what the profile names. Rule: memoize per-week derived values at the top of a stage; never inside a per-participant loop |
| `07d-leveraged-loan-clearing.ts` | Now that the loan universe is real, it is **small (23–32 names/region)**. Spearman(leverage, DM) is noisy across weeks (0.26–0.76) where the bond book holds 0.78–0.93 — consistent with sampling noise at that n, but re-measure once WS5/G2 add loan issuance; if it persists at larger n it is a real defect |

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
    - Residual is amplitude rather than direction — see §5-RVr.
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
24. **Task-list mapping:** S-items ↔ audit findings + #67/#18/#34; WS-items ↔ #68–#82/#74;
    MS ↔ #56/#59/#60/#52; BP ↔ #58/#45/#48/#50/#51/#54/#55/#64; AU ↔ #66. The end-of-project
    `npm run verify` gate closes #2/#14/#41.
    **Closable now** (§7.16/§7.17 landed them): #77 and #78 (slices 2–3 signed off), #72 and #81
    (hedge funds are a real institutional type bidding in 07b/07d). **#48 is now §5-HC, a master project** and has
    grown from a detail item into a §4 top-three one — retitle it to match. #47 (deeper
    institutional sector) is substantially §5-S11 plus G6.
