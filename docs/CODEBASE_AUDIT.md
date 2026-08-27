# Full-Codebase Audit — Logic & Structural Inconsistencies

Scope: every file in `src/` (domain, bootstrap, macro, engine, all 17 weekly stages,
initialization, credit/ipo/merger/trade), `scripts/invariants.ts`, and every UI component.
Each finding was verified against the code (and, for the two root-cause majors, verified
numerically with a probe run). Findings are grouped by severity and theme; file references
point at the offending lines as of this audit.

The recurring anti-pattern behind most majors is the same one the "1$ is 1$" project exists
to kill: **two disconnected representations of the same real thing**, where one is real
(cleared, settled, itemized) and the other is a formula that silently overwrites or ignores it.

---

## A. Root-cause majors (the cold-start instability)

These two findings together are the verified root cause of the long-standing
"revenues collapse at the start / bond prices make no sense" behavior.

### A1. Household income ≠ GDP at generation; first-year growth formula annualizes the transient
`src/engine/simulation/initialization.ts` (wage generation), `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts` (growth calc)

- At init, the aggregate wage bill is derived from `GENERAL_WAGE_SHARE_OF_PRODUCTIVITY = 0.62`
  times occupation-tier multipliers that average ≈ ×1.495, plus 15% capital income. Result
  (verified numerically): **household income = 106.6% of GDP at week 0.** The national-accounts
  identity is broken at generation.
- Bottom-up C+I+G+NX therefore clears at ≈ 1.3× the initialized GDP level (measured:
  C=631B, I=47B, G=245B, NX=−47B vs 670B init GDP). The economy then *converges to the level
  its own income implies* over the first weeks — a one-time level transient, not growth.
- The first-year fallback `Math.pow(1 + smoothedWeeklyRate, 52) - 1` annualizes that transient
  into a headline `gdpGrowth` of **~26% in week 1 rising to ~110% by week 7** (measured).
- That fake growth number then poisons everything downstream that reads `gdpGrowth`:
  - `targetBeta2 = (gdpGrowth - potentialGdpGrowth) * 2.0` → the yield-curve spiral (see A2),
  - the Taylor rule (policy rate), the cycle-regime classifier,
  - FX capital-flow terms, equity flow/sentiment terms.
- Additional inconsistency found while probing: the demand side spends **35%** of government
  spending into category demand, while the GDP identity counts **100%** of G.

**Fix direction:** make the wage generation solve for the income identity (wage bill + capital
income = income share of GDP, with the tier multipliers normalized to mean 1.0 over the actual
occupation mix), and make first-year growth use the annualization of the *post-transient*
window (or seed a synthetic 52-week GDP history at init) instead of compounding the first
weeks' convergence rate.

### A2. Two owners of the yield curve: stage 02 macro formula overwrites cleared yields weekly
`src/engine/macro/evolution.ts` ~618–641 vs `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts` (uncommitted)

Stage 02 recomputes `beta0/beta1/beta2` and `zeroRates` from macro formulas **every week**
(`targetBeta2 = (newGdpGrowth - potentialGdpGrowth) * 2.0` etc.), while 07c now clears
sovereign tenor buckets against real bank/institutional demand and refits Nelson–Siegel to the
cleared yields. Two price-setters, one curve: stage 02's write runs first, 07c re-clears from
it, and with A1's poisoned `gdpGrowth`, beta2 explodes and drags the whole curve
(measured: 2Y zero 4% → 26% in 15 weeks; the clearing engine itself was verified innocent —
client net demand stayed small and mean-reverting).

**Fix direction:** stage 02 stops writing the curve. Macro conditions must reach yields only
through the *demand functions* of the real participants in 07c (inflation expectations,
policy-rate anchoring of the short end, banks' balance-sheet capacity), so the curve has
exactly one owner: the market.

---

## B. Majors — broken money/balance-sheet identities

### B1. Bank balance sheet: clearing trades never settle cash, and a formula still drifts sovereign holdings
`src/engine/macro/banking.ts` (`evolveBankingSector`)

- `evolveBankingSector` still moves `sovereignBondHoldingsUSD` by its own formula drift, even
  though (a) 07c now trades real per-bank tenor buckets and (b) stage 11 issues real tranches.
  Same double-representation as A2, on the bank side.
- No clearing stage (07b/07c/07d) debits or credits **cash** for the bonds bought/sold — banks
  and institutions change holdings with no settlement leg, so the balance-sheet identity
  (assets = deposits + equity) is silently broken a little more every week. This is one real
  contributor to the long-horizon capital-ratio collapse (task #67).

### B2. Sector `itemizedHoldings` rebuilt mechanically every week, disconnected from the real cleared holdings
`src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts` / stage that calls `attributeItemizedHoldings`

The region-level `bankingSector.itemizedHoldings` (and the greedy entity attribution at init)
are rebuilt from aggregate shares each week, while 07b/07c/07d now maintain *real* per-entity,
per-instrument holdings. Two ledgers for the same positions; the UI (BankDeepDive,
CompanyDeepDive ownership tab, TradeTicket sourcing) reads the mechanical one.

### B3. Player trades never touch the market
`src/components/TradeTicketModal.tsx:166-177`, stage 12

A player fill checks bank `itemizedHoldings` for "inventory" but: never decrements it, never
moves dealer inventory, and injects zero net demand into any clearing stage. The player's
flow has no price impact and no counterparty settlement — the one participant the game is
*about* is outside the "every price is real supply/demand" rule. (Related: the intermediation
fee at line 174 is charged as `price × (1 + fee)` for **sells too** — a seller pays a higher
price instead of receiving a lower one.)

### B4. Stage 12 corp-bond "demand premium" treats bps as a fraction and duplicates the clearing engine
`src/engine/simulation/stages/12-portfolio-and-positions.ts`

`adjustedOasSpreadBps = oasSpreadBps * (1 - corpBondPremium)` where `corpBondPremium` is
derived from a demand/supply ratio — the formula (a) duplicates demand logic that 07b now
owns, and (b) its inputs are dimensionally wrong (ownership *share* × sector *equity* as
"demand" vs total *principal* as "supply"), so the premium is meaningless and can push
displayed/marked OAS far off the cleared value. **The identical formula is copy-pasted in the
UI** at `src/components/company/CompanyDeepDive.tsx:770-778` (tranche price display), where
`totalCorpBondPrincipalOutstanding` additionally multiplies `totalDebt` by `1_000_000`
(stale unit assumption).

### B5. Bond maturity credits the player full face value never paid; SOV redemption quantity-scale bug
Stage 12 maturity handling: a maturing position credits full `posValue` cash regardless of
what was paid/margined, and sovereign redemption uses `quantity * 1.0` where quantity is
notional-scaled — free money at every maturity.

### B6. Company weekly cash double-count
`src/engine/simulation/stages/08-company-fundamentals.ts`

Weekly cash flow accrues `EBITDA/52` **and** stage 05's real settled `salesUSD` cash change;
`productionCostUSD` is also subtracted alongside costs already inside EBITDA. Revenue/cost
dollars are counted twice on the way into `comp.cash`. (This is a strong candidate root for
the task #18 "revenue >20x" invariant failures.)

### B7. Dividends shown but never paid
Stage 08 builds `dividendsPaid` into the cash-flow statement, but company `cash` is never
reduced by it — the statement and the state disagree by the dividend every quarter.

### B8. The 2.5×-cash debt-prepayment rule burns cash but retires no debt
Stage 08: the prepayment branch reduces `cash`, then `totalDebt` is recomputed from the
**unchanged** `debtTranches` — money disappears, leverage doesn't move.

### B9. Merger vaporizes the target's cash
`src/engine/simulation/merger.ts`: the acquirer takes revenue/EBITDA/debt but `target.cash`
is neither transferred nor paid out — dollars deleted at every M&A.

### B10. Credit contagion is a permanent ratchet
`creditContagionBps` = cumulative-ever defaults × 12, never decays. Five defaults in year 1
still price into every spread in year 5. Should decay (defaults roll out of the lookback)
now that 07b makes spreads real.

### B11. `clearedInputPriceIndex` is week-over-week, not vs baseline
Stage 04/05 seam: `baseUnitPrice` is reset to the current price every week, so the "cleared
input price index" measures one week's drift, not cumulative real input inflation — and
consumers treat it as a level.

### B12. Frozen inventory for output-only categories feeds housing "supply" (confirmed)
`src/engine/simulation/stages/04-input-output.ts` only updates `inventoryLevelUSD` for
categories that appear as **inputs** in `CATEGORY_INPUT_REQUIREMENTS`. Output-only categories
(e.g. `residential_construction`) keep their init value (10% of week-0 demand) forever —
stage 03 explicitly carries it (`existingEntry?.inventoryLevelUSD ?? ...`). But
`src/engine/macro/evolution.ts:682` uses exactly that frozen number as `resSupply` for house
pricing: demand grows, "supply" is frozen at week 0 → structural housing price ratchet.

### B13. Invariants' sovereign-absorption check is vacuous
`scripts/invariants.ts` references region `'ASIA'` (doesn't exist; regions are
USA/UK/JPN/EUR) and fields `nominalGdpUSD` / `governmentDeficitPct` (don't exist) — the check
can never fire. It validates nothing while appearing to.

### B14. WorldScreen Supply Chain tab reads category keys that no longer exist
`src/components/screens/WorldScreen.tsx`: `'StandardHousehold'`, `'CorporateTech'`,
`'GovernmentDefense'`, `'Infrastructure'`, `'Healthcare'` are the pre-taxonomy keys; current
`categoryDemand` uses sub-unit ids. The tab silently renders empty.

---

## C. Duplicate price-setters & second implementations (theme)

Everywhere one of these exists, the formula copy will drift from (or fight) the real cleared
number. All should be deleted or rewired to *read* the cleared state:

| Where | Duplicate of | Notes |
|---|---|---|
| `macro/evolution.ts` curve write (A2) | 07c sovereign clearing | the active spiral vector |
| stage 12 demand-premium OAS (B4) | 07b corp clearing | bps-as-fraction bug too |
| `CompanyDeepDive.tsx:770-778` credit tab | 07b/07d cleared stats | same formula pasted in UI, plus `×1_000_000` unit bug |
| `RatesScreen.tsx` gov-bond pricing via `priceCorporateBond` + sovereign-rating premium | 07c cleared tenor yields | UI-side second curve |
| `pricing.ts:priceLeveragedLoan` seniorLienDiscount clamp (0.65–0.95) + `bucketDemandPremiumBps` | 07d discount-margin clearing | retired from stage 08 but still the UI path |
| `DiagnosticsModal.tsx:30-64` "micro aggregation" | nothing — invented in the UI | fabricated transmission numbers (`baselineCapex = n×50` stale scale, `pricingPowerMarkupPct` field that doesn't exist, invented wage-push/retail formulas) presented as engine diagnostics |
| `OverflowMenu.tsx:42` sim clock `new Date(2024,0,…)` | `formatters.ts` `SIMULATION_START_DATE` (Jan 5, **2026**) | menu shows dates two years off the rest of the app |
| `MyBookScreen.tsx:9` `initialCapital = 25000000` | `initialization.ts` `startingCash` | duplicate constant |
| `CompanyDeepDive.tsx` bank card prorating region aggregate by `bankMarketShare ?? 0.25` | real per-bank `bankBalanceSheet` (Wall St Phase 1) | shows the proportional slice the per-bank work explicitly replaced |
| `CompanyDeepDive.tsx` institutional card | entity-level state | mixes entity AUM with sector aggregates prorated by `?? 0.33`, and compares **sector** actual allocation vs **entity** target |

---

## D. Dead code, dead branches, dead state

- **`sectorSentimentShocks` discarded (confirmed):** `generateWeeklyNews` computes per-sector
  sentiment shocks; the only call site (`11-fiscal-and-sovereign-debt.ts:221-230`) uses
  `.newsItems` and drops the shocks. All the "macro event" sector impacts are therefore
  cosmetic.
- **`NewsItem.sentimentDelta` never read (confirmed):** written in ~12 places, consumed
  nowhere. Company sentiment moves only via stage 08's internal variable.
- **`'Boom'` regime branches are dead (confirmed):** `cycleRegime` union is
  `Expansion | Slowdown | Recession | Recovery` and evolution.ts only produces those; the
  `(cycle as string) === 'Boom'` branches in stage 08 (lines 802, 814) can never run. The
  cast is the tell. Meanwhile `'Recovery'` — which *is* produced — has no explicit
  P/B-multiple case and falls into the else.
- **`isMegaCap > 100000` branch dead:** threshold predates the market-cap unit rescale; no
  company crosses it.
- **Dead `GameState` UI fields:** `selectedTab`, `isCheatsheetOpen`, `isWatchlistDrawerOpen`,
  `chartModalData`, `isDiagnosticsOpen` duplicate App-local `useState` and are never read;
  **`watchlist` (confirmed):** initialized in state, consumed by no UI or engine code at all.
- **News rating-direction bug:** `isUpgrade` via `indexOf` on the rating string misclassifies
  HY notches (e.g. `BB` vs `B` substring order) — upgrade/downgrade headlines can be flipped.
- **`newsGenerator.ts` fake content:** hardcoded fictional tickers (NVST/TXEN/CHEM/WMRT/JPMC)
  that exist in no generated universe, real-world references, hardcoded prices (2.85, 78.50)
  in headline templates — violates both the no-real-world-data rule and "every number is real".
- **UI trade tickets use `'LEV_LOAN'`:** `CompanyDeepDive.tsx:783` opens loan trades with
  `assetType: 'LEV_LOAN'`, which is **not** in the `AssetType` union (`'LEVERAGED_LOAN'` is);
  the `any`-typed prop hides it. Margin/spread/carry switches fall to default branches, and
  `MyBookScreen` has to string-match both spellings.

---

## E. Mediums

1. **FX UIP term sign + poisoned capital-flow term** (`macro/evolution.ts`): the
   interest-differential term pushes the wrong way relative to UIP convention, and the
   capital-flow term consumes the A1-poisoned `gdpGrowth`.
2. **`priceEquity` negative-EPS branch rewards bigger losses** (`pricing.ts:66`):
   `Math.max(1.5, |eps| × PE × 0.4)` — a company losing $10/share prices *higher* than one
   losing $0.50/share. Should price off book/recovery or a distress discount, not |loss|.
3. **`getInitialRegions()` rebuilt inside loops** — full region bootstrap re-run repeatedly
   per week for reference values; wasteful and risks divergence if bootstrap gains randomness.
4. **Three parallel demand-seed constructions** (init, macro init, stage 03 fallback) build
   `categoryDemand` entries with subtly different fields/defaults — one constructor should own it.
5. **`COMMODITY_CATEGORY_LINKAGE` mutated at init** (`simulation/initialization.ts:311`):
   module-global constant overwritten with calibrated shares — a second `createInitialGameState()`
   call in the same process compounds calibration on top of calibration.
6. **`industrial_automation` pseudo-commodity special-case cluster** (`instruments.ts:116`,
   `evolution.ts:929-941`): a manufactured category masquerading as a commodity with bespoke
   branches in the commodity clearing path (`privateWeeklySupplyUSD` forced to 0, special
   producer lookup). Either it's a real category cleared in stage 04/05 or a real commodity —
   not both with if-statements.
7. **Sovereign redemption / coupon flows** for banks' new per-tenor books: 07c trades the
   buckets but stage 11 tranche redemptions still settle only against the aggregate
   `sovereignBondHoldingsUSD` — the tenor books never mature or receive coupons.
8. **TradeTicket option terms hardcoded:** expiry always `currentWeek + 8`, carry priced with
   `8/52` tenor, strike defaulting to spot — regardless of the instrument's actual terms.
9. **TradeTicket payoff simulator mislabels IRS/CDS scenarios:** "±10%" scenarios are
   actually ±10 **bps** (`pct * 100`) for IRS/CDS — labels and math disagree.
10. **Margin display mismatch:** ticket blocks on `freeCash = cash − requiredMargin` but the
    row labeled "Unencumbered Cash" displays raw `cashUSD`.
11. **MyBook corp-bond P&L attribution uses issuer-level OAS** for tranche positions and
    `tenorYears || 5` — spread attribution is wrong for any tranche whose cleared stat
    diverges from the issuer aggregate (which is the whole point of tranche-level clearing).
12. **`NewsDrawer` commodity shortcut** matches `c.symbol === 'CRUDE_OIL'` — verify `symbol`
    is populated with those ids; otherwise every commodity news item falls back to
    `commodities[0]`.
13. **`YieldCurveChart` x-axis mislabeled** (`charts/Charts.tsx`): tenors
    [0.25…30] plotted at equal spacing with labels 3M/10Y/30Y at the ends+middle — the middle
    label sits between 3Y and 5Y, not at 10Y.
14. **DiagnosticsModal hardcodes** "200 issuers", "/ 200", "Senior recovery ~40%", per-region
    r* values — will silently lie as the config changes.
15. **ManualModal drift risk:** IM rates, dealer axe discounts, Taylor coefficients are
    restated as prose/hard numbers; several already only approximately match the engine.
16. **PP&E roll-forward first-filing artifact** (`CompanyDeepDive`): with one filing,
    depreciation shows the full accumulated depreciation (prev defaults to 0).

---

## F. Uncommitted work-in-progress hygiene (must be cleaned before any commit)

- `src/engine/simulation/stages/financial-clearing-engine.ts:167-169` — `DEBUG_CLEARING`
  console block.
- `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts` — zeroRates before/after
  debug block.
- `scripts/_smoke_tmp.ts` — temporary GDP-identity probe.

---

## G. Recommended fix order

1. **A1** (income identity + first-year growth) — unblocks everything; the measured 110%
   growth is the poison feeding A2, Taylor, FX, and equities.
2. **A2** (single owner for the yield curve) — delete stage 02's curve write, move macro
   influence into 07c participants' demand.
3. **B1** (cash settlement in clearing + stop formula-drifting bank sovereign holdings) —
   restores the bank balance-sheet identity; prerequisite for trusting capital ratios.
4. **B6/B7/B8/B9** (company cash truth: double-count, dividends, prepayment, merger cash) —
   these four together are the corporate-sector money leaks.
5. **B4 + C-table** (delete every duplicate price-setter; UI reads cleared state only).
6. **B2/B3** (one holdings ledger; player flow enters the real auction).
7. Then the remaining Wall Street slices (equity, short-dated debt, HF, MMF) on top of a
   consistent base — pointless to build them on today's broken identities.

Everything in D and E is safe to batch behind those.
