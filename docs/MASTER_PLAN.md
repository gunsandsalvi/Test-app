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
| 02 | `02-region-macro.ts` | Region macro evolution via `macro/evolution.ts` (GDP, inflation, wages, FX, ownership drift). **Currently also writes the yield curve — that write must die (§5-A2)** |
| 02b | `02b-bank-diversification.ts` | Per-bank balance-sheet evolution, SRF/ON RRP facilities, region aggregate = real sum of named banks |
| 03 | `03-category-demand.ts` | C+I+G demand targets per sub-unit; `corporateDemandUSD` persisted per category |
| 04 | `04-input-output.ts` | Input-category clearing: real supply from linked commodities, pooled multi-industry demand, pro-rata rationing |
| 05 | `05-unit-bidding.ts` | THE real goods auction: named bids/offers, pro-rata clearing, contracts, per-lot settlement (northwest-corner), capex bids |
| 06 | `06-fx-and-trade.ts` | FX evolution + trade flows (still formula — see §5-WS9) |
| 07 | `07-commodities.ts` | Commodity spot evolution |
| 07b | `07b-corporate-bond-clearing.ts` | Corp bond clearing (FIXED tranches) — adapter over the generic engine |
| 07c | `07c-sovereign-bond-clearing.ts` | Sovereign tenor-bucket clearing (2/5/10/30Y) + Nelson-Siegel refit to cleared yields |
| 07d | `07d-leveraged-loan-clearing.ts` | Leveraged loan clearing (FLOATING tranches), CLO/loan-fund base via `loanPct` |
| 08 | `08-company-fundamentals.ts` | Per-company weekly update: revenue (anchored to stage 05 real sales), costs, capex/debt, rating, earnings, equity price. Largest stage; reads cleared credit stats, never sets them |
| 09 | `09-concentration-risk.ts` | >40% supplier/customer concentration flags |
| 10 | `10-mergers.ts` | Quarterly M&A |
| 11 | `11-fiscal-and-sovereign-debt.ts` | Bottom-up GDP, deficit → real gov tranche issuance, itemized-holdings attribution (**mechanical rebuild — must die, §5-B2**), news generation |
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
| 1 | Income/GDP identity + first-year growth fix | S1 | — |
| 2 | Yield curve: single owner (kill stage 02's write) | S2 | S1 |
| 3 | Verify & land Wall St slices 2–3 (sovereign, loans) for real | S3 | S1, S2 |
| 4 | Cash settlement in all clearing + stop bank sov-holdings drift | S4 | S3 |
| 5 | Company cash truth: double-count, dividends, prepayment, merger cash | S5 | — |
| 6 | Delete every duplicate price-setter (engine + UI) | S6 | S3 |
| 7 | One holdings ledger (kill mechanical itemizedHoldings rebuild) | S7 | S4 |
| 8 | Contagion decay + input-price-index baseline + housing supply | S8 | — |
| 9 | Player trades enter the real market | S9 | S4, S7 |
| 10 | Batch: §6 backlog (dead code, UI bugs, minor logic) | S10 | — |
| 11 | Equity clearing (slice 4) + retire sentiment as free parameter | WS4 | S1–S7 |
| 12 | Short-dated debt: T-bills + commercial paper (slice 5) | WS5 | S3, S4 |
| 13 | Private repo markets | WS6 | S4 |
| 14 | Money market funds | WS7 | WS5, WS6 |
| 15 | Corporate debt/equity issuance with bank placement agents | WS8 | WS4, WS5 |
| 16 | Hedge funds as distressed-debt demand | WS10 | WS4 |
| 17 | CPI measured from the real cleared basket | G1 | S1 |
| 18 | Itemized bank lending + endogenous money (loans create deposits) | G2 | S4 |
| 19 | Unify the two dealer systems | G3 | S9 |
| 20 | Real derivatives markets (IRS/CDS/options/XCS participants, real vol) | G4 | WS4, G3 |
| 21 | Default resolution: recovery as an outcome, not a constant | G5 | G2, WS10 |
| 22 | Institutional liability side (claims, benefits) drives demand | G6 | WS7 |
| 23 | Commodity futures as a real market (hedgers/speculators) | G7 | G4 |
| 24 | Corporate hedging + banks hedge their own book | WS11 | G4 |
| 25 | Real international trade & FX clearing | WS9 | G2 (confirm currency-zone premise first) |
| 26 | Central bank as a real counterparty (portfolio, QE/QT, remittances) | G9 | S3, G2 |
| 27 | Main Street (households → labor market → corporate wage system) | MS | G1 (ideally G2) |
| 28 | Blueprint (taxonomy → industry profiles → electricity/share-vs-margin → fiscal loop → antitrust → private sector detail) | BP | MS for the fiscal loop's household taxes |
| 29 | End-of-project validation gate: full `npm run verify` + fix #67/#18 residuals | S-final | everything above it |
| 30 | Aurora — full UI rebuild | AU | last; requires its §5-AU process |

**Why this order.** S1/S2 first because the measured ~110% fake GDP growth poisons the Taylor
rule, curve, FX and equity flows — nothing downstream can be validated until they're fixed,
and the already-built 07c/07d can't be signed off (item 3) before them. S4–S9 restore the
money identities so every later market is built on books that actually balance. Wall Street
resumes only then (building MMFs or equity clearing on broken identities is wasted work).
G-items interleave where their prerequisites land. Main Street before Blueprint's fiscal loop
(taxes need households). Aurora is deliberately last: it re-renders everything the other
projects produce.

---

## 5. Detailed work instructions

### S1 — Income/GDP identity + first-year growth (root cause 1)

**Problem (verified numerically):** at init, household income = 106.6% of GDP: the wage bill
is `GENERAL_WAGE_SHARE_OF_PRODUCTIVITY = 0.62` × occupation-tier multipliers averaging
≈ ×1.495, plus 15% capital income. Bottom-up C+I+G+NX then clears ≈ 1.3× the initialized GDP
and converges over the first weeks; `11-fiscal-and-sovereign-debt.ts`'s first-year fallback
`Math.pow(1 + smoothedWeeklyRate, 52) − 1` annualizes that transient into ~26%→~110% headline
`gdpGrowth`, which feeds `targetBeta2`, the Taylor rule, cycle regime, FX and equity flows.

**Where:** `src/engine/simulation/initialization.ts` (wage generation),
`src/engine/bootstrap/labor-and-wages.ts`, `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts`,
`src/engine/macro/utils.ts` (synthetic history helper already exists).

**How:**
1. Normalize the occupation-tier multipliers so their **employment-weighted mean is exactly
   1.0** over the actual generated occupation mix (compute the mix first, then divide every
   multiplier by the weighted mean). The tier *structure* (relative wages) is preserved; only
   the level is anchored.
2. Solve the level from the identity, not from productivity heuristics: pick one labor share
   `α` (keep 0.62) and one capital-income share `κ` such that
   `wageBill + capitalIncome = (α + κ) × GDP` and the household-income share is consistent
   with the consumption the demand side actually spends (trace `estimatedHouseholdIncomeUSD`
   consumers before choosing κ). Then **assert at init**:
   `|estimatedHouseholdIncomeUSD / estimatedNominalGdpUSD − (α + κ)| < 1e-6` — make it a real
   thrown error, so the identity can never silently regress.
3. Reconcile G: the demand side routes 35% of `governmentSpendingUSD` into category demand
   while the GDP identity counts 100%. Decide the real split (transfer payments vs. real
   procurement), route the procurement share through real bids, count transfers in household
   income — the identity and the demand side must use the same decomposition.
4. First-year growth: seed a synthetic 52-week `nominalGdpHistory` at init (use
   `macro/utils.ts`'s synthetic-history helper) consistent with `potentialGdpGrowth`, and make
   the growth calculation always use the 52-week window — delete the
   `pow(1 + smoothedWeeklyRate, 52) − 1` fallback entirely.

**Verify:** rerun the GDP probe (income/GDP at init ≈ α+κ; week-1..10 `gdpGrowth` within
±2pp of potential; C+I+G+NX within a few % of init GDP). 60-week revenue-ratio diagnostic.

### S2 — Yield curve gets one owner (root cause 2)

**Problem:** `src/engine/macro/evolution.ts` (~lines 618–641) recomputes
`beta0/beta1/beta2` + `zeroRates` from macro formulas weekly
(`targetBeta2 = (gdpGrowth − potential) × 2.0` …), overwriting 07c's cleared curve. Two
price-setters; with S1's fake growth this is the verified 4%→26% 2Y spiral.

**Where:** `macro/evolution.ts` (delete the write), `07c-sovereign-bond-clearing.ts`
(absorb the macro influence as demand).

**How:** delete the beta/zeroRates write from stage 02 (keep the Taylor-rule policy rate —
that's the administered short-end anchor, rule 1's exception). Macro conditions reach the
curve **only through 07c participants' behavior**: (a) anchor the short end by making the
2Y bucket's participant attractiveness include distance from the policy-rate corridor
(banks arbitrage the front end against reserves/SRF/ON RRP — real behavior); (b) inflation
expectations shift every participant's willingness to hold duration (a real term-premium
demand effect), implemented inside 07c's attractiveness function, not as a curve write;
(c) keep the existing mean-reverting recent-yield-change signal (see lesson §7.2 — NEVER
trend-following, and NEVER an independent invented fair-yield level).

**Verify:** 15–30 week trace of `zeroRates` per region: curve moves only on real flow;
2Y stays within a plausible corridor of the policy rate; no monotonic drift. Then re-run
with a forced policy-rate change and confirm transmission happens through demand.

### S3 — Sign off Wall Street slices 2–3

07c/07d are committed but were built while S1/S2 masked their behavior. After S1+S2:
26-week smoke per region — sovereign yields stable and flow-responsive, loan DMs correlated
with (but tighter than) the issuer's cleared OAS × senior-lien structure, dealer inventories
mean-reverting, no NaNs. Fix anything real that surfaces **in the adapters' demand logic**,
not with bounds. Close tasks #77/#78 only after this.

### S4 — Cash settlement + one sovereign book

**Problem:** no clearing stage settles cash (holdings change, balance sheets don't), and
`macro/banking.ts` still drifts `sovereignBondHoldingsUSD` by formula alongside 07c's real
tenor books.

**Where:** `financial-clearing-engine.ts` (return per-participant net cash flow — it already
knows every fill), the 07b/07c/07d adapters (apply it), `macro/banking.ts` (delete the sov
drift; aggregate = Σ per-bank tenor books), `02b-bank-diversification.ts`.

**How:** engine returns `netCashDeltaByParticipantId` (sells − buys − fees). Adapters apply:
institutional entities → `cashUSD` (and keep `totalAssetsUSD` consistent); banks →
their real cash/reserves (a bank funding dealer inventory pays for it — inventory is a
real asset position, cash is the other leg). Sovereign coupons + redemptions in stage 11 must
settle against the per-tenor books (pro-rata by bucket holdings), not the aggregate.
Add a per-region assertion (behind the invariants harness): Σ(participant holdings + dealer
inventory) changes reconcile with Σ(cash deltas) each week.

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

### WS8 — Issuance with placement agents

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

### G1 — CPI measured from the real basket

**Where:** `macro/evolution.ts` (delete the formula), new small module
`engine/simulation/stages/price-index.ts` (or fold into stage 11).
**How:** fixed-weight (chain-updated annually) basket over the real transacted prices the
sim already produces: stage 05 cleared unit prices per sub-unit (household buyerMix share as
weights), commodity spots (energy/food weight), housing (S8's real series). CPI = weighted
index; `inflation` = its 52-week change; `coreInflation` = ex energy/food. The wage-push and
"monetary pressure" terms die — if they're real, they show up in the real prices. Keep
`expectedInflation` as adaptive expectations over the measured series. **This changes the
Taylor rule's input** — validate policy-rate behavior over 60 weeks after.

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
| open (#67) | USA bank capital → 0 from ~week 149 (expect root cause via S4 + G2; re-verify then) |
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
9. **Task-list mapping:** S-items ↔ audit findings + #67/#18/#34; WS-items ↔ #68–#82/#74;
   MS ↔ #56/#59/#60/#52; BP ↔ #58/#45/#48/#50/#51/#54/#55/#64; AU ↔ #66. The end-of-project
   `npm run verify` gate closes #2/#14/#41.
