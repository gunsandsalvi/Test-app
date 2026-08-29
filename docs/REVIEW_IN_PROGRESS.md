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

### `src/domain` — batch 6 (primary-market, call-protection)

| # | Sev | File | Finding |
|---|---|---|---|
| D18 | **A** | `primary-market.ts` | **`UNDERWRITING_FEE_BPS` (50/150/300) is a fixed price schedule.** A fee is what a bank CHARGES, and competing desks bid it down for an easy deal and up for a hard one. One fixed table means an issuer's placement cost never responds to how many banks want the mandate or how the book is going — and the fee is real money moving between real balance sheets. Rule 1. **Owner: G3 (8).** |
| D19 | **B** | `primary-market.ts` | **`chooseLeadBank` is a draw, not a relationship.** A stable hash of the issuer id weighted by deposit share: nothing the bank DID wins it the mandate — not its price, not its balance sheet, not whether it already lent to this issuer — and no issuer ever moves banks. The comment called it "relationship banking rather than an RNG draw"; a deterministic hash keyed on an id is an RNG draw with a fixed seed. Rule 13. **Owner: G3 (8).** |
| D20 | **B, latent** | `call-protection.ts` | `resolveProtection`'s fallback is justified as "the honest default for data that predates the rule" — but no world here has legacy data; every run regenerates from seed. It fires only when a creation site FORGOT to set `callProtection`, and it then silently assigns MAKE_WHOLE, the cheapest regime to call out of. A miss is invisible. *Checked every live tranche-creating site: all are explicit or correctly exempt (bank facility / CP), so nothing is wrong today* — but the guard hides the next one. Same family as `safeRate` (D8). |

**Clean, and another standard-setter:** `call-protection.ts` itself. Three regimes that are real
market conventions (loan 101 soft call, HY NC1 on a declining schedule derived from the issue's
own coupon, IG make-whole), a make-whole discount spread that is deliberately the SAME constant
as the dealer's bid-offer because they are the same real cost, and "never less than par" because
every real call provision is written "the greater of par and…". `primary-market.ts`'s offering
lifecycle is right too — the defect is only in what the underwriter charges and how it is chosen.

### `src/domain` — batch 7 (market-microstructure, institutions)

| # | Sev | File | Finding |
|---|---|---|---|
| D21 | **A** | `market-microstructure.ts` | **`CAPEX_PUBLIC_SUPPLY_SHARE = 0.65` decides who supplies capex by constant.** 65% of every capex category's demand is routed to public companies before falling back to that industry's SME pool. Both tiers already bid in the SAME auction since SEG, so they should compete on price and the split should be the RESULT. This is exactly the disease OWN removed from the ownership registers, still live on the supply side. Rule 13. **Owner: CAP (4).** |
| D22 | **A** | `institutions.ts` | **`INSURER_EXPENSE_RATIO = 0.20` is an outcome stated as a primitive.** An expense ratio is what an insurer's own cost structure produces — staff, systems, distribution. One constant for every insurer in every region means no insurer can be better or worse run than another, which is the one thing this number should express. Rule 13. **Owner: IND (3).** |
| D23 | **B, root cause** | `institutions.ts` | **`beneficiaryLiabilityUSD = totalAssetsUSD − equityCapitalUSD` runs the causality backwards.** In reality a pension fund is as big as the entitlements it owes; here the liability is derived FROM the assets. That is why the institutional sector has no bottom-up size anchor, and therefore why `INSTITUTIONAL_OPENING_BOOK_SHARE` survived OWN6 (§6.1). Reversing it — build the claim from the household side, size the entity from the claim — closes both at once. The field's doc presented the residual as settled design; it now names the limitation. |
| D24 | E | `market-microstructure.ts`, `institutions.ts` | Both carried "Models X… written and updated by Y" headers restating the type names below them. Trimmed. |

**Watch, not a finding:** `createSeedCategoryDemandState` opens every category at
`inventoryLevelUSD = 10% of annual demand` and `crowdingIntensity = 0.1`. Seed constants with one
owner, which §7.4 sanctions — but the inventory stock is a real quantity, and CAP should check
whether 10% is what the production decision would actually hold.

### `src/domain` — batch 8 (instruments, carrier)

| # | Sev | File | Finding |
|---|---|---|---|
| D25 | **C** | `instruments.ts` | **A second dealer system, confirmed at the type level.** `Dealer` quotes the player by formula — `baseSpreadBps × spreadMultiplier`, an `axeDiscountPct`, a `creditLimitUSD` — while the named banks run real dealer inventories inside the clearing books off their own balance sheets. Two representations of one real thing, and only one of them has a balance sheet or can run out of capacity. It also carries presentation fields (`tagline`, `axeBadge`, `color`) on a domain trading entity. **Owner: G3 (8)** — this plus §6.1's regional-desk row is the whole of what "one dealer system" means. |
| D26 | **B** | `carrier.ts` | **The carrier's offer floor is short-run marginal cost with no capital recovery.** `marginalCostPerTonneNmUSD` is fuel plus crew. The vessel's own cost is carried (`capitalCostUSD`, `usefulLifeYears`) and depreciated on the P&L, but it is not in the floor — so a balanced freight market clears at a level that never returns the fleet's capital, and no carrier can rationally replace a ship. Correct as a *marginal* cost; wrong as the *only* floor a supplier posts. Relevant to §6.1's freight-rate runaway, which is the same market. **Owner: CAP (4).** |

**Clean, and the best physics in the codebase:** the rest of `carrier.ts`. Capacity is a real
stock whose weekly throughput falls out of round-trip time, so an 11,000-mile lane delivers its
hold about once a month without anyone saying so; the SEA/ROAD cost asymmetry (fuel dominates a
ship, crew dominates a truck) is arithmetic from real equipment specs, so a fuel spike reprices
ocean freight and a wage rise reprices haulage; and lanes are DIRECTED because a head-haul and a
back-haul are genuinely different markets. No coefficient anywhere.

