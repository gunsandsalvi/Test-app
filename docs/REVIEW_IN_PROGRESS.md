# Codebase review — 2026-08-29, in progress

**Temporary.** Live findings from a line-by-line pass over every file, run against §1's rules.
Two jobs at once: comments trimmed to what the code cannot say (rule 11) and corrected where they
are stale or wrong; and every top-down assumption, misplaced ownership, missing mechanism and
rule breach recorded here as it is found.

When the pass finishes, the findings fold into `MASTER_PLAN.md` §6 under their owning §4 items and
this file is deleted. Nothing here is a second source of truth.

**Severity:** `A` decides an outcome the model should produce (rules 1/4/13). `B` a real
mechanism is missing or wrong (rules 8/14/15). `C` two representations of one thing (rule 3).
`D` a clamp (rule 2). `E` comment was stale or wrong — fixed in the same pass, listed for the
record only where it was actively misleading.

---

## Progress

| Directory | Files | Done |
|---|---|---|
| `src/domain` | 29 | |
| `src/engine/bootstrap` | 9 | |
| `src/engine/macro` | 8 | |
| `src/engine/simulation` (top) | 7 | |
| `src/engine/simulation/stages` | 53 | |
| `src/engine/simulation/stages/profiles` | 6 | |
| `src/components` | 8 | |
| `scripts` | 5 | |

---

## Findings

### `src/domain` — batch 1 (index, events, markets, portfolio, industry, geography)

| # | Sev | File | Finding |
|---|---|---|---|
| D1 | **A** | `markets.ts` | **Real-world index brands in the TYPE, not just the label.** `CompositeBenchmarkIndices` has fields `us500`, `euStoxx`, `uk100`, `jp225`, `gsciCommodity`. §6.3-D caught the display strings in `macro/indices.ts`; the field names are the same rule-4 breach one layer down, and every consumer spells them. **Owner: IDX (7)** — rename both halves in one commit. |
| D2 | **A** | `industry.ts` | **`HOUSEHOLD_BID_PREMIUM_BY_TIER = { STAPLE 2.5, STANDARD 1.0, LUXURY 0.35 }` is an invented elasticity that DECIDES the household bid**, and `HOUSEHOLD_BID_BASE_PREMIUM = tanh(0.05) × 0.15` is a frozen constant wearing arithmetic (the comment admitted as much: "the old frozen premium, now named"). Willingness to pay is an outcome of a budget and the good's share of it — the cohorts carry both since HH4. Rule 13. **Owner: MAC (6)**, with HSG as the precedent for what a real bid looks like. |
| D3 | E | `index.ts` | Header claimed it "re-exports all domain models"; it re-exports 14 of 29. Corrected — the omission is deliberate, not a gap. |
| D4 | E | `events.ts`, `portfolio.ts`, `geography.ts` | Four-line "Models X, written by Y, read by Z" headers that restate the type names below them. Trimmed to one line each; `geography.ts`'s lane-distance justification kept, because *why the diagonal is not zero* is the thing the code cannot say. |

**Clean:** `geography.ts`'s `LANE_DISTANCE_NM` is a correct rule-4 primitive with the right
justification. `industry.ts`'s registry-derived views are correct rule-17 structure.

### `src/domain` — batch 2 (fx-hedging, currency, fx-market)

| # | Sev | File | Finding |
|---|---|---|---|
| D5 | **E, serious** | `fx-market.ts` | **A comment stating the opposite of a measured fact.** `MAX_WEEKLY_FX_MOVE_PCT = 8` was documented as "NOT a bound the price is allowed to rest on… it does not park the rate on this limit and call it a price." §6.1 measured the FX instrument damper-bound in **38–39 of 40 weeks per pair, minimum move −8.01%** — this constant to the second decimal. The code was doing precisely what its comment denied, and anyone reading the file would have been steered away from the defect. Rewritten to state the measurement and name XB6. |
| D6 | **A** | `fx-market.ts` | **Three invented coefficients decide how much flow the FX market can absorb**: `SPECULATOR_RESERVATION_MOVE_PCT` 1.2, `SPECULATOR_FULL_SIZE_RANGE_PCT` 4.0, `SPECULATOR_FX_RISK_BUDGET` 0.15. These ARE the elastic side the damper is pinning against — so the pinning in D5 is partly their size. A speculator's reservation should come from its own capital, its view and observed volatility, like every other schedule in the model. Rule 13. **Owner: HF (12) then XB6 (11).** *(The central bank's reservation next to them is correctly DERIVED from the speculators' exhaustion point — that one is right, and is the pattern the others should follow.)* |
| D7 | **A** | `fx-hedging.ts` | **`HEDGE_RATIO_EQUITY = 0.35` is an observed real-world average** ("published policies cluster between none and half"), applied identically to every entity type. Rule 4's sharper half: a primitive is fine, an equilibrium is not. And rule 17: a hedge ratio is a MANDATE property, so it belongs on the entity profile where a pension fund and a hedge fund can differ and where it can respond to what hedging costs. `HEDGE_RATIO_FIXED_INCOME = 1.0` is fine — a regulator charging the mismatch is a real rule. **Owner: HF (12).** |
| D8 | **C** | `currency.ts` | `safeRate()` returns **1** for a non-finite or zero rate — silently pricing a foreign figure at parity instead of failing where the rate went missing. Already §6.3-F; now flagged at the definition, which carried no warning at all. This is the shape §7.94 was found by. |

**Clean:** `fx-hedging.ts`'s CIP derivation and `hedgedReservationAdjustmentBps` are correct and
the comment earns its length — cross-border flow chasing the spread over the LOCAL short rate is
a real result that falls out of the hedge rather than a preference anyone assigned.
`currency.ts`'s local-money boundary is right, and its header was trimmed by a paragraph.

### `src/domain` — batch 3 (trade-invoice, cross-border, goods-physical)

| # | Sev | File | Finding |
|---|---|---|---|
| D9 | **B** | `cross-border.ts` | **A mandate LIMIT is being used as a demand WEIGHT.** `HOME_BIAS_BY_ENTITY_TYPE` is defended in its own comment as "a MANDATE, not an ownership share" — and that argument is right. But `mandateWeightForIssuer` returns the home bias as the weight that scales demand, so a pension fund always *wants* exactly 75% domestic rather than being *allowed up to* 25% abroad. Rule 5: a target is a guide, the actual purchase is tactical. **Owner: HF (12).** |
| D10 | E | `goods-physical.ts` | Header still said "This is BP1's table… it lives here only until BP1 absorbs it" while the line below it says the registry already absorbed it. Two statements in one file, one of them a year out of date. Corrected. |

**Clean, and worth saying so:** `trade-invoice.ts`'s `paymentTermWeeks` is the best thing read so
far. Trade terms are derived from the buyer's own default probability, the model's recovery rate
and the seller's own margin AND working capital — no net-30/60/90 table anywhere. Its funding
constraint was added because the credit arithmetic alone handed a riskless buyer 4.4e17 weeks,
and the fix was the missing mechanism rather than a clamp on the symptom. That is rule 2 applied
correctly, and it is the pattern the rest of this review should measure against.
`goods-physical.ts`'s value-density primitive replacing an observed trade share is the same
standard.

### `src/domain` — batch 4 (invoice-currency, indexes, game-state)

| # | Sev | File | Finding |
|---|---|---|---|
| D11 | **C** | `game-state.ts` | **UI state lives inside the simulation state tree.** `isTradeModalOpen`, `selectedInstrument`, `isNewsDrawerOpen`, `isGameOver`, `gameOverReason` sit on `GameState` beside the regions and companies — so opening a modal mutates the object the engine hashes for determinism checks. **Owner: AU (27).** Verify before then whether the determinism hash actually spans these fields; if it does, a UI click can make two identical runs disagree. |
| D12 | E | `game-state.ts` | Header called it "the complete **immutable** state tree". It is not immutable — stage 08 rebuilds each company with `Object.assign(comp, …)` and several stages mutate region objects in place. A reader trusting that word would hold a stale reference and not know it. Corrected. |
| D13 | E | `indexes.ts` | `LARGE_CAP_CUMULATIVE_SHARE = 0.70` was justified as "set where real large-cap indexes sit against their total market" — which reads as fitting to an observed outcome and would fail rule 4. It is actually a published index METHODOLOGY (a rule a provider writes down), which rule 4 permits. Comment corrected to say the right thing; the number stands. |

**Clean, and the best example of rule 4's sharper half in the codebase:** `invoice-currency.ts`.
It assigns no currency and scores none. The cost of carrying exchange risk is MEASURED from each
pair's own unabsorbed flow, a vehicle currency wins only if its pairs are genuinely the deep
ones, and a tie between the two parties' own currencies is broken by which side of that week's
goods market is short — measured, not assumed. Its own header records that the previous attempt
(three invented weights and an argmax) was "a formula wearing a mechanism's clothes". That is the
standard.

### `src/domain` — batch 5 (dealer-derivatives, etf)

| # | Sev | File | Finding |
|---|---|---|---|
| D14 | **A** | `dealer-derivatives.ts` | **The cross-currency basis is a price computed by formula with a ceiling.** `crossCurrencyBasisBps = MAX(150) × utilization × (0.35 + 0.65 × oneWayShare)`. The 150 is an observed crisis-era level (rule 4: a real-world outcome), the 0.35/0.65 split is invented, and the whole thing is a bound the price rests on rather than a level anything clears at. This is what a hedger PAYS — rule 1 says it comes from clearing, rule 15 says a bound is not a price. **Owner: DER (13).** |
| D15 | **Dead code** | `dealer-derivatives.ts` | **`FX_SPOT_PRICE_IMPACT_PER_GDP = 0.35` has no consumer anywhere outside its own file** — grepped across `src/`. It is a leftover from XB2c, which WS9/XB2f replaced when FX started clearing in a real book; a price-impact coefficient has nothing to do once the price is an auction outcome. **Deleted.** *This also corrects §6.3-B, which lists it as a live rule-1 violation — it was dead, not live.* |
| D16 | **B** | `etf.ts` | **`AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY = 0.25` contradicts its own name and its own comment.** The comment argues at length that an AP does not warehouse, so its capital limits *turnover*, and "a dealer turns over a large multiple of its equity" — then sets a quarter. Either the value is an order of magnitude low or the reasoning is wrong, and nobody has re-measured which since the 2% version was raised. Flagged in place. **Owner: ETF2 (17).** |
| D17 | E | `etf.ts` | Research-capacity comment pointed at "BP2's industry profiles"; there is no BP2 — that work is IND. Corrected. |

**Clean:** `dealer-derivatives.ts`'s capacity model is right and important — PFE against real
leverage headroom, internalisation before carry, a desk at zero capacity meaning a hedge is
unavailable *at any price*. The defect is only in what it charges, not in what it can supply.
`etf.ts`'s sublinear research capacity (cube root, anchored at two real points) is a well-argued
primitive and its own comment records why the linear version broke the whole mechanism.

