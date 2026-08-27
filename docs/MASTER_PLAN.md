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
section, implement it exactly where §5 says, run the verification ladder (§1.3), commit it as
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

### 1.3 Verification ladder (every work item)

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

`stages/financial-clearing-engine.ts` — the generic, cap-free auction
`clearFinancialAsset(instruments, participants, priorDealerInventory, params)`:
per-participant target-vs-actual gaps, per-participant attractiveness tilts on index weights,
bank dealer absorbs net flow onto persistent inventory (and leans quotes against it), price
impact converts to the quoted statistic via `statKind: 'YIELD_LIKE' | 'PRICE_LIKE'`.
**Every asset class is a thin adapter over this engine** (07b/07c/07d today; equity, bills,
CP, repo tomorrow). Adapters own: who the participants are, their real bottom-up targets
(a relative weight on a real, already-bounded pool via `distributeRealTargetByWeight` — never
an independent dollar figure), and each participant's own per-instrument attractiveness.

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
harness state: bank-capital band fails from ~week 149 (task #67); the sovereign-absorption
check is **vacuous** (references nonexistent region/fields — fix in §5-S6); revenue-ceiling
has a small tracked residual (#18).

---

## 3. Current state: real vs. formula

**Genuinely bottom-up today** (post "1$ is 1$", at rest): category demand → input-output →
stage 05's real auctions with named counterparties, per-lot input provenance, real settled
sales anchoring revenue, capex as real bids, private sector as real participant, commodities
linked to real producer companies, per-bank balance sheets + real CB facilities, real gov
tranche issuance, and the 07b/07c/07d clearing markets (07c/07d landed but **unstable until
S1/S2 below are fixed** — verified: the instability comes from stage 02, not the engine).

**Still formula-driven** (each is a §4 work item): the yield-curve overwrite (S2), household
income identity (S1), CPI (G1), bank lending/borrowers + endogenous money (G2), the dual
dealer system (G3), equity price (WS4), FX (WS9), derivatives markets incl. implied vol (G4),
default resolution/recovery (G5), institutional liability side (G6), commodity futures/
speculators (G7), sentiment (G8), the CB balance sheet (G9), player-trade market impact (S9),
plus the aggregate household/labor blob (Main Street) and government fiscal loop (Blueprint).

---

## 4. THE GLOBAL WORK ORDER

Work strictly top to bottom inside each block. Blocks: **S** (stabilization — the audit's
majors), **WS** (Wall Street completion), **G** (realism gaps), **MS** (Main Street),
**BP** (Blueprint), **AU** (Aurora). Rationale follows the table.

| # | Item | §5 ref | Prereqs |
|---|---|---|---|
| 1 | **Clearing engine: price from a demand schedule, not a quantity target** | E1 | — |
| 2 | Verify & land Wall St slices 2–3 (sovereign, loans) for real | S3 | — (S1, S2, G1 done) |
| — | **Periodicity & units audit + MoM/YoY display convention** | P1 | none; do alongside any item |
| — | **Damp the inflation swing** (diagnose the goods-price cycle) | G1b | G2 likely part of the fix |
| — | **Damp the credit cycle's amplitude** (build with G1b's expectations channel) | RVr | G1b, WS10 |
| 3 | Company cash truth: double-count, dividends, prepayment, merger cash | S5 | — |
| 4 | Delete every duplicate price-setter (engine + UI) | S6 | S3 |
| 5 | One holdings ledger (kill mechanical itemizedHoldings rebuild) | S7 | S4 |
| 6 | Contagion decay + input-price-index baseline + housing supply | S8 | — |
| 7 | Player trades enter the real market | S9 | S4, S7 |
| 8 | Batch: §6 backlog (dead code, UI bugs, minor logic) | S10 | — |
| 9 | Equity clearing (slice 4) + retire sentiment as free parameter | WS4 | S2–S7 |
| 10 | Short-dated debt: T-bills + commercial paper (slice 5) | WS5 | S3, S4 |
| 11 | Private repo markets | WS6 | S4 |
| 12 | Money market funds | WS7 | WS5, WS6 |
| 13 | Corporate debt/equity issuance with bank placement agents | WS8 | WS4, WS5 |
| 14 | Hedge funds as distressed-debt demand | WS10 | WS4 |
| 15 | Itemized bank lending + endogenous money (loans create deposits) | G2 | S4 |
| 16 | Unify the two dealer systems | G3 | S9 |
| 17 | Real derivatives markets (IRS/CDS/options/XCS participants, real vol) | G4 | WS4, G3 |
| 18 | Default resolution: recovery as an outcome, not a constant | G5 | G2, WS10 |
| 19 | Institutional liability side (claims, benefits) drives demand | G6 | WS7 |
| 20 | Commodity futures as a real market (hedgers/speculators) | G7 | G4 |
| 21 | Corporate hedging + banks hedge their own book | WS11 | G4 |
| 22 | Real international trade & FX clearing | WS9 | G2 (confirm currency-zone premise first) |
| 23 | Central bank as a real counterparty (portfolio, QE/QT, remittances) | G9 | S3, G2 |
| 24 | Main Street (households → labor market → corporate wage system) | MS | G1 (ideally G2) |
| 25 | Blueprint (taxonomy → industry profiles → electricity/share-vs-margin → fiscal loop → antitrust → private sector detail) | BP | MS for the fiscal loop's household taxes |
| 26 | End-of-project validation gate: full `npm run verify` + fix #67/#18 residuals | S-final | everything above it |
| 27 | Aurora — full UI rebuild | AU | last; requires its §5-AU process |

**Why this order.** The three macro root causes are done (§7.10–§7.12): the ~110% fake GDP growth,
the double-written yield curve, and the runaway formula CPI. Real growth now reads positive in
every region at week 26 and inflation is a measured statistic. What remains is the money side —
so the order runs: sign off the credit markets built on the old macro (S3), then restore the cash
and holdings identities (S4–S7), then the player and the remaining markets. Kept for the record,
the evidence that promoted G1 to the front of the queue in the first place: with the fake growth removed, the dominant remaining distortion is the CPI formula, which
runs inflation away to ~10% by week 40 and ~11% in the pre-S1 baseline (A/B confirmed
pre-existing, not caused by S1). Because headline real growth is computed as nominal minus
inflation, that runaway alone drags reported growth to −20% by week 40 and feeds the Taylor
rule and every real-rate calculation. Signing off the sovereign/loan slices (S3) against a
9%-inflation macro backdrop would be measuring them in a broken environment. S4–S9 restore the
money identities so every later market is built on books that actually balance. Wall Street
resumes only then (building MMFs or equity clearing on broken identities is wasted work).
G-items interleave where their prerequisites land. Main Street before Blueprint's fiscal loop
(taxes need households). Aurora is deliberately last: it re-renders everything the other
projects produce.

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

**Problem.** With inflation now genuinely measured (§7.12), the index is bounded and
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

### S3 — Sign off Wall Street slices 2–3  *(part done; one item open)*

**Landed** (see §7.13): the leveraged-loan market now exists at all, corporate actions settle
against holders, and the accretive call actually refinances. Sovereign clearing is signed off.
Loan discount margins are live and their dispersion is ~4x tighter. Dealer inventories are
non-zero and mean-reverting. No NaNs anywhere, across 26 weeks and four regions.

**Still open — corporate OAS drifts negative.** Median USA OAS falls 88 → 68 → −149 → −350bp
over 36 weeks. A corporate bond yielding less than the sovereign curve is not a thing; the
market is under persistent net buying pressure that nothing offsets. The three fixes above each
removed a large source of one-sided flow and each moved the number a long way, but a residual
remains. **Diagnose in this order, and do not put a floor under it:**
1. **Is newly issued corporate debt still arriving unheld?** `settleCorporateActionOnHolders`
   scales holders' positions by the change in an issuer's float, which should place new issues
   pro-rata — verify it actually fires for maintenance-funding tranches and refi replacements,
   which are created in a different place from the call path it was tested against.
2. **Is the value anchor doing any work at the level?** 07b's fair-value signal is
   `computeExpectedLossSpreadBps`, a real credit estimate, but it enters as a per-issuer
   attractiveness TILT, and tilts renormalize — a signal that every issuer shares cannot move
   the market's overall level, only its shape. This is the same limitation S2 hit on the
   sovereign curve, where the fix was to let a participant's total position size respond
   (banks choosing bonds versus reserves), not just its distribution. The corporate analogue is
   an institution choosing corporate credit versus government bonds versus cash — its
   `assetAllocationTarget` — which is real and currently static.
3. **Is the aggregate target itself drifting?** `corpBondOwnership.institutionalShare` drifts
   weekly in stage 02. If it drifts up while float is flat, that is a permanent bid.

Close tasks #77/#78 only after the OAS drift is resolved.

### S4r — Government debt service (the one piece S4 left)

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
national-accounts identity established in §7.10. **Do it as part of BP5** (government as a real
fiscal counterparty), which owns that decomposition, and pay coupons to holders in the same pass.

### E1 — The clearing engine prices a quantity target, not a demand curve  ← **the real defect**

**This supersedes RVr's framing.** RV was built on the belief that spreads drifted because demand
could not leave the asset class and supply could not respond. Both were true and both are now
fixed — and spreads are still impossible. Measured after both halves landed:

- the **shape** of the credit curve is right: median OAS rises monotonically by rating
  (AAA/AA/A tightest through BB/B/CCC widest) and Spearman(leverage, OAS) holds at **0.64–0.78**.
  This market is not random;
- the **level** is impossible: the entire investment-grade cohort sits **150–180bp BELOW zero**;
- it is **not** a thin-float artifact — the largest-float quartile has the same −124bp median as
  the smallest;
- and the dominant driver of a name's spread is **Spearman(OAS, institutional ownership share of
  that name) = −0.731**, stronger than its correlation with the issuer's own leverage.

**The cause.** `clearFinancialAsset` never asks a participant what price it would pay. It asks how
far its holdings are from a target QUANTITY, trades a fraction of that gap, and moves the price by
the resulting flow. The price is therefore a *residual of a quantity target*: participants buy
until they own their target share of a name, and whatever spread that leaves is the spread. Nothing
anywhere in the mechanism can say "below this level I simply will not buy," because nobody is ever
pricing — they are filling a quota. That is precisely why a spread can settle below zero, and it is
what the user meant from the start by the allocation levels feeling *forced*.

RV's relative-value tilt makes the quota somewhat price-sensitive (±45%), which is why it halved
the drift, but a price-sensitive quota is still a quota. **No amount of work on either side's
demand or supply can fix this, because the defect is in how the two meet.**

**The fix, and it is an engine change.** Demand must become a real schedule — quantity as a
function of price — and clearing must find the price at which the schedule meets supply, instead
of moving price by the flow implied by a quantity gap. Concretely, each participant supplies a
reservation spread per instrument (below which it will not hold, derived from exactly the
economics RV already computes: expected loss plus the capital charge times its required return),
and the auction finds the clearing level where total demanded quantity equals the float. This is
the same double-auction shape `05-unit-bidding.ts` already runs for goods, where bidders post a
real maximum price — the goods market got this right and the financial one did not.

**Sequencing.** This touches every asset class (07b/07c/07d and any future adapter), so it wants
its own bounded slice with the sovereign curve re-verified afterwards. It also subsumes the
remaining half of §5-S3 and makes RVr moot: an amplitude problem in a market that cannot price is
not worth damping first. Keep everything RV built — the per-issuer capital-charge test and the
issuer's financing decision are both correct and still needed once the engine can price.

### RVr — Damp the credit cycle's amplitude *(blocked on E1 — do not start first)*

**RV is built, both halves** (§7.16, §7.17). Spreads no longer drift monotonically: they now
oscillate and mean-revert, which is the restoring force the item existed to create. Measured over
80 weeks, the corporate float grows 77B → 104B as issuers take advantage of tight spreads, the
spread recovers from −22bp to **+86bp** as that supply lands, and the deleveraging leg follows
(float 113B → 98B). That is a credit cycle, roughly 50–60 weeks long, produced entirely by real
agents responding to real prices.

**What is left is amplitude, not direction.** The cycle still overshoots into negative spreads at
its tights (median −160bp at week 80), and negative OAS is unphysical. The diagnosis is a
classic cobweb overshoot: both sides respond with a lag — investors through a 5%/week strategic
drift, issuers through a 4%/week take-up of covenant headroom — so each acts on a spread that has
already moved by the time the response lands.

**Do not damp it by shrinking the response rates or bounding the spread.** The real-world damper
is anticipation: investors and issuers both price against the spread they expect, not only the
one they see, and an expectation that spreads will widen stops the last marginal buyer before the
tights. That is the same missing mechanism as **G1b item 3** (expectations doing no work in real
bid/offer pricing), and the two should be built together — a single expectations channel serving
the goods auction and the credit markets alike. Two further contributors worth measuring first:
- **the marginal buyer is missing at the wides**: distressed and levered buyers (WS10) are exactly
  who arrests a widening, and they do not exist yet;
- **issuer count decays** (200 → 127 over 80 weeks) as companies delever out of the bond market
  entirely, thinning the float and amplifying the next move.

### S5 — Company cash truth (four leaks, one pass)

All in `08-company-fundamentals.ts` except merger. Fix together — they interact:
1. **Double-count:** cash accrues `EBITDA/52` AND stage 05's settled `salesUSD` cashChange,
   and subtracts `productionCostUSD` on top of costs already inside EBITDA. Restructure the
   weekly cash walk so each real dollar enters once: real settled sales in, real settled
   purchases/wages/interest/tax out; the accrual EBITDA figure stays a *reporting* number
   only. Write the walk as an explicit ledger (one array of named deltas summed once) so the
   next reader can audit it.
2. **Dividends:** deduct `dividendsPaid` from cash in the same ledger.
3. **Prepayment:** the 2.5×-cash rule must retire actual tranches (reduce `principalUSD` of
   the nearest-maturity tranche(s) by the cash spent) before `totalDebt` is recomputed.
4. **Merger** (`merger.ts`): target's cash transfers to the acquirer net of the real cash
   consideration paid out to target shareholders.
**Verify:** 60-week diagnostic + a per-company cash-walk trace for 3 sampled companies
(every delta named, sums to the cash change). This is the likely root of task #18's residual —
re-check it after.

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
- `scripts/invariants.ts`: rewrite the vacuous sovereign-absorption check against real fields
  and real regions (USA/UK/JPN/EUR).

### S7 — One holdings ledger

Kill the weekly mechanical rebuild of `bankingSector.itemizedHoldings` (stage 11) and the
greedy init attribution wherever a real ledger now exists. The real per-entity holdings from
07b/07c/07d + per-bank books ARE the ledger; `itemizedHoldings` becomes a derived view
(rebuild it FROM the real books for UI convenience, or delete it and point the UI at the real
books). Init seeding must use the same proportional shapes the engines produce (lesson §7.4).

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

**Where:** `trade.ts`, `12-portfolio-and-positions.ts`, the 07b/07c/07d adapters,
`TradeTicketModal.tsx`.

**How:** a player trade becomes a real order absorbed by the real bank dealer desk: it moves
the relevant dealer inventory (`corpBondDealerInventory` / sov tenor book / loan book) at
execution, and the standing inventory then feeds the next week's clearing exactly like any
client flow (the engine already leans quotes against inventory — the player's impact arrives
for free). Sells receive `price × (1 − fee)`, buys pay `price × (1 + fee)` (the current code
charges both sides a markup — fix the sign). Maturities credit what the position actually
contractually pays, netted against what was actually paid (kills the free-money bug). Equity
and commodity player flow waits for WS4/G7's books.

### S10 — Backlog batch

Work §6's table in one or two commits. Nothing there is architectural.

---

### WS4 — Equity clearing (slice 4) + sentiment retirement

**The biggest lift.** Prereq: S1–S7.
**Where:** new `07e-equity-clearing.ts` adapter + `domain/company.ts` share ownership.
**How:**
1. Add a real share-count ownership model: `sharesOutstanding` exists; add per-entity share
   holdings (institutional entities, banks' small trading books, a household aggregate
   holder, later HFs). Seed at init from `equityOwnership` shares with the engine's own
   proportional shape.
2. Instrument = the company's stock, `statKind: 'PRICE_LIKE'`, `outstandingUSD` = free-float
   market cap. Participants' targets: `equityPct` as relative weight on the real pool
   (`equityOwnership.institutionalShare × Σ market cap`) via `distributeRealTargetByWeight`.
3. Attractiveness per entity from real characteristics: earnings-yield vs. its own required
   return (Gordon primitive from `pricing.ts`), earnings momentum/surprise, rating/leverage
   trajectory, index weight discipline. Buybacks (stage 08) become a real corporate
   participant bid; IPO/issuance supply enters as real offers (hook for WS8).
4. `priceEquity` becomes derivation/fallback only. Then **delete `comp.sentiment` as an
   input**: what sentiment used to fake is now real flow. (Fix the negative-EPS pricing
   nonsense — |loss|×PE rewards bigger losses — as part of the retirement; distressed equity
   prices from the clearing book, floored only at 0.)
**Verify:** 26-week: index level vs. flows sane, no monotonic drift; the existing
"equity demand moves price beyond EPS" invariant becomes genuinely mechanical.

### WS5 — T-bills + commercial paper

**Where:** new `07f-short-debt-clearing.ts`; `11-fiscal-and-sovereign-debt.ts` (bill
issuance); `domain/company.ts` (CP as a short tranche type); `domain/region-macro.ts`.
**How:** extend the gov ladder below 2Y (13w/26w/52w bills) — stage 11 splits the deficit's
market funding between bills and bonds by a real treasury-management rule (share of debt
maturing, cost). Bills clear in the same engine (YIELD_LIKE, duration <1). CP: companies with
working-capital needs (real, from their stage-05 purchase obligations vs. cash) issue short
unsecured paper priced off their cleared OAS. Buyers: banks' liquidity books, institutions'
cash buckets — and, once WS7 lands, MMFs as the dominant real bid.

### WS6 — Private repo

**Where:** new stage or fold into 02b; `domain/banking.ts`.
**How:** cash-rich banks/entities lend against sovereign collateral from the real tenor
books (haircut on real holdings); cash-poor banks borrow. Clear one regional overnight repo
rate through the engine (participants' targets = their real cash surplus/deficit vs. buffer
targets — the same buffers SRF/ON RRP already use, which become the corridor: repo clears
between ON RRP (floor) and SRF (ceiling) because participants arbitrage the administered
facilities, not because the rate is clamped).

### WS7 — Money market funds

Fourth `InstitutionalEntityType: 'MONEY_MARKET_FUND'`. Liabilities: real shares held by
corporate treasuries (sweep of excess operating cash — companies' real cash from S5's honest
ledger) and the household aggregate, chosen vs. bank deposits on real yield comparison —
which creates real deposit competition for banks (feeds G2). Assets: bills + CP (WS5), repo
(WS6), ON RRP. This delivers the real short-paper demand base.

### WS8 — Issuance with placement agents  *(largely subsumed by RV — read that first)*

New debt/equity issuance as real primary auctions: issuing company + a bank placement agent
(fee to the bank's real revenue) put real new supply into the relevant clearing book
(07b/07e/CP); the clearing engine discovers the price. Kills the current implicit
refinancing-at-formula-terms in stage 08's tranche rollover.

### WS10 — Hedge funds

New participant type (not an allocator — an active book): screens for genuinely-recoverable
distressed names (real coverage/leverage trajectory + real cleared prices below its own
recovery-value view) and places real bids in 07b/07d/07e. This is the real marginal buyer
that gives distressed paper a clearing price. Pairs with G5 (its exit is the resolution
process).

### WS9 — Real trade & FX

**Confirm the currency-zone premise with the user first** (standing caveat). If confirmed:
cross-region purchases in stage 05 become real FX conversions; FX rate clears from the real
net currency demand (trade flows + portfolio flows from the clearing stages + carry
positioning), replacing `06-fx-and-trade.ts`'s drift formula. The current UIP-sign bug and
gdp-poisoned capital-flow term die with the formula.

### WS11 — Corporate + bank hedging

After G4 exists: companies hedge real FX/rate/commodity exposure against a named bank; the
bank's resulting book is real and it lays risk off through the same markets; its capital
feels residual exposure.

---

### G2 — Itemized lending + endogenous money

**How:** bank loan books become itemized: business loans = real credit lines/term loans to
named companies (origination decision from the bank's real capital headroom + the borrower's
real rating; interest = real weekly flows both sides — replaces part of stage 08's formula
interest); consumer loans = claims on the household aggregate (real once MS lands). Deposits
then move mechanically: a loan credits the borrower's deposit (money creation), repayment
destroys it; M2 becomes a *derived sum*, deleting the formula. This is also the real
substrate for task #67's capital-collapse root cause.

### G3 — One dealer system

Delete the static `state.dealers` trio as a separate economic object: the player's
counterparties become the named banks' real dealer desks (inventory = the real books from
07x; spreads from real inventory/axe positions — an axe IS a real inventory position the
desk wants to reduce). Keep the three-dealer UI presentation if desired, but backed by real
banks. Prereq S9 so flow already routes there.

### G4 — Real derivatives markets

IRS: banks + institutions with real duration needs (G6 liabilities, mortgage books) quote
and clear par rates through the engine; the closed-form pricer remains the MTM converter.
CDS: protection demand (banks hedging G2 loan books, HFs) vs. supply (yield-seeking
institutions) clears a real basis vs. bond OAS. Options: market-maker inventory + real
hedging demand clear implied vol (kills `|| 0.3`). Each is an engine adapter with a small
set of real participants — start with IRS (most real demand already exists).

### G5 — Default resolution

Replace constant recovery: on default, a real resolution process over N weeks — the estate's
real assets (cash, receivables, inventory at real lot values, PP&E at a haircut) are sold
through the real markets (WS10's funds bidding), proceeds waterfall to tranches by seniority.
Recovery rate becomes an *output*. Equity recovers residual (usually 0).

### G6 — Institutional liabilities

Insurers: real premium income from companies/households and real stochastic claims. Pension
funds: real contribution inflow (a real slice of wages — full realism arrives with MS) and
real benefit outflows by a simple cohort table. Duration/allocation demand in every clearing
adapter then derives from the liability profile instead of static percentages.

### G7 — Commodity futures market

Real positions along the curve: producer hedgers (the real commodity producers sell forward),
consumer hedgers (real recipe-input buyers), speculators/index money; convenience yield
becomes derived from real inventory + cleared curve. Cost-of-carry pricer stays as the
arbitrage anchor the participants trade against.

### G8 — Sentiment retirement

Delete `comp.sentiment` inputs once WS4's real flow exists (folded into WS4 — listed here so
it isn't forgotten as a standalone cleanup: also delete the dead `sectorSentimentShocks`
plumbing and `NewsItem.sentimentDelta`, or wire news to the real flows that now exist).

### G9 — Central bank as counterparty

The CB's sovereign holdings become a real portfolio (seeded from `centralBankShare`): it
rolls maturities (real reinvestment bids in 07c), can QE/QT (real flow, real price impact via
the engine), remits net interest to the government's real fiscal account (BP1 hook).

---

### MS — Main Street (people, labor & wages)

Theme: every household is a real, named agent (or cohort) with a real job at a real company.
1. **MS1 Households as real agents/cohorts:** replace `reg.householdState` with cohort units
   that hold a job, earn a wage from a named employer's real payroll, pay taxes, save
   (deposits/MMF shares/equity — hooks into WS7/WS4 ownership), and consume (their bids in
   stage 05's household aggregate become the sum of cohort budgets).
   `estimatedHouseholdIncomeUSD` becomes a derived sum — S1's identity then holds by
   construction, delete the assert-era scaffolding.
2. **MS2 Real labor market:** companies post openings (from real capacity needs), cohorts
   move between named employers on wage/security; quits/layoffs move real payroll.
   `occupationMixDrift` and wage-push become mechanical. Where: new stage between 02b and 03.
3. **MS3 Corporate wage/management system** (absorbs backlog #52): per-company wage policy
   and hiring/firing decisions from margin/capacity; `executionQuality` feeds retention.
Sequencing: MS1 → MS2 (MS3 parallel with MS2). Note: pension contributions (G6) become real
here.

### BP — Blueprint (government, regulation & industry structure)

1. **BP1 Modular industry taxonomy** (backlog #50) — FIRST: one registry module that owns
   sub-units, buyer mixes, input recipes, capex weights, commodity links; adding a category
   becomes one-file work. Do before any specialization.
2. **BP2 Industry-specific behavior/capital-allocation profiles** (#51): capex intensity,
   cyclicality, financing preferences, buyback/dividend mix per industry.
3. **BP3 Real electricity costs** (#54): a real input commodity + recipe line, industry
   intensities from BP2.
4. **BP4 Market-share-vs-margin decision** (#55): per-company strategic price/margin choice
   using BP2 profiles, expressed through real stage 05 offer pricing.
5. **BP5 Government as a real fiscal counterparty** (#64): real tax collection from real
   company profits and (post-MS) household wages; real procurement through stage 05; the
   deficit stage 11 funds becomes fully derived. Absorbs S1's G-decomposition properly.
6. **BP6 Antitrust/M&A regulation** (#45): breakups/M&A freezes triggered by real
   `categoryMarketShare` concentration.
7. **BP7 Non-public sector detail** (#48): richer private-segment internals, same category
   definitions.

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
| open (#18) | ~small residual of companies at revenue floor over long runs (re-check after S5) |

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
   extraction; slices 2–3 (sovereign + loans) built, pending S3 sign-off. Failed banks still
   lack deposit flight (known gap, revisit in G2).
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
11. **S2 landed (the yield curve has one owner).** `macro/evolution.ts` no longer computes
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
12. **G1 landed (inflation is measured, not assumed).** `macro/evolution.ts` no longer computes
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
13. **S3 partly landed — three structural bugs, each found by tracing a number to its source.**
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
14. **S4 landed (money moves with the securities).** `clearFinancialAsset` now returns
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
16. **RV demand side landed (allocation responds to price).** `stages/asset-allocation.ts` asks
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
17. **RV supply side landed (the float responds to its own price).** `stages/corporate-financing.ts`
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
18. **Task-list mapping:** S-items ↔ audit findings + #67/#18/#34; WS-items ↔ #68–#82/#74;
   MS ↔ #56/#59/#60/#52; BP ↔ #58/#45/#48/#50/#51/#54/#55/#64; AU ↔ #66. The end-of-project
   `npm run verify` gate closes #2/#14/#41.
