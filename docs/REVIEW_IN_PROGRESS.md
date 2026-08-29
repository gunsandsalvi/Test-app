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

---

## Consolidated so far — the patterns, not the list

Four shapes account for most of the 78 findings. Each is one fix repeated, not N fixes.

**1. A formula outlived the mechanism that replaced it, and the formula is what a decision
reads.** Every one of these has a real, measured counterpart sitting beside it unused.

| the formula | replaced by | but still drives |
|---|---|---|
| deficit + `debtToGdpPct` walk (D31) | PUB3b's real obligations; stage 11's `debtToGdpPctBottomUp` | **the sovereign rating → spreads** |
| `governmentRevenueUSD = GDP × taxRate` (D32) | PUB1b/1c's real bases | anything reading revenue between stages 02 and 11 |
| Phillips-curve `wageGrowth` (M14) | LAB's real offered wages | **consumption and consumer confidence** |
| `sovereignRating` assigned at seed (M11) | — | the credit spread from week 0 |

**2. A file states its own retirement condition and the condition has been met.** Three so far,
all still live: `national-accounts.ts` (B3 — "replaced by the flows themselves once households
are real agents"; they are), `bank-lending.ts`'s `BANK_TARGET_ROE` (S16 — "once its stock clears
in 07e"; it does), `etf.ts` (D17 — pointed at a project that no longer exists). **Grepping for
this phrasing is a cheap way to find the rest.**

**3. A silent default substitutes a plausible value for a missing write.** Four, each hiding a
different class of failure, none of which can occur in a world regenerated from seed — so every
one of them is dead-code justification protecting a live bug: `safeRate → 1` (D8),
`resolveProtection → MAKE_WHOLE` (D20), `isPubliclyListed → PUBLIC` (D37), `getFxToUsd → 1.0`
(S3). The last one sits directly below a comment describing the outage that exact fallback
already caused once.

**4. A comment asserts the opposite of what the code does.** Two load-bearing cases, both of
which would have steered a reader away from a real defect: the FX damper documented as "NOT a
bound the price is allowed to rest on" while binding 38 weeks in 40 (D5), and commodity prices
documented as "entirely synthetic: no real-world observed prices" while seeding crude at $76,
gold at $2,730 and wheat at $6.00 (B5).

**And two findings that change the shape of planned work:**

- **CAP cannot be built as specified (S4).** A firm's EBITDA margin is clamped to [2%, 65%], so
  no firm can report a loss at the EBITDA line, so "a firm that cannot cover unit cost stops
  producing" has nothing to fire on. The margin floor has to go first, and it is not in §6.4's
  inventory.
- **`household-cohorts.ts` is one defect, not nine (M7).** §6.3-A treats its nine stated tables
  as nine primitives. They are one missing mechanism — cohorts have no balance sheets — and the
  pieces to derive eight of them now exist.

---

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

### `src/domain` — batch 9 (banking)

| # | Sev | File | Finding |
|---|---|---|---|
| D27 | **A** | `banking.ts` | **`MORTGAGE_SPREAD_OVER_10Y_BPS = 170` states a price.** The file itself documents the correct treatment thirty lines below, on `BankLoan.marginBps`: "quoted by the bank's own credit arithmetic at origination, the same expected-loss + capital-cost pricing the bond market uses." The corporate book does that; the household book does not. Every bank charges every borrower 170bps whatever its funding costs or its losses run. Rule 1. **Owner: HSG (10).** |
| D28 | **A** | `banking.ts` | **`WHOLESALE_FUNDING_SPREAD_BPS = 40` is the price of a bank's own funding, fixed.** Identical for a well-capitalised bank and one whose capital ratio has left its band — when a funding spread is exactly where the market's view of a bank shows up. Load-bearing for §6.1's USA cohort, which is a story about banks funding ~48% wholesale. Rule 1. **Owner: G3 (8).** |
| D29 | **A** | `banking.ts` | **`HOUSING_TURNOVER_RATE_ANNUAL = 0.04` is an observed real-world rate.** How many houses change hands is an outcome of households deciding to move against a price — exactly what HSG builds. As a constant, mortgage origination volume cannot respond to the housing market at all. Rule 4's sharper half. **Owner: HSG (10).** |
| D30 | **A** | `banking.ts` | **`CARD_OPERATING_COST_BPS = 500` / `CONSUMER_TERM_OPERATING_COST_BPS = 150`** — one operating cost per product for every bank, so no bank runs its card book more cheaply than another. Same shape as `INSURER_EXPENSE_RATIO` (D22). **Owner: IND (3).** |

**Clean, and an example of the right fix:** `annuityWeeklyPrincipalUSD`. The comment on `wamWeeks`
records what it replaced — a `0.0004/wk` "≈2%/yr" mortgage paydown constant — and states the
principle exactly: *"the rate a book amortizes at is arithmetic on its own terms, not a number
chosen to look like one."* `CARD_POOL_PAYMENT_RATE_WEEKLY` is also handled correctly: a named
behavioural primitive that says why it cannot yet be derived (a revolving balance has no
schedule to amortise) rather than pretending it is one. Basel risk weights, LTV and mortgage
term are proper rule-4 primitives.

### `src/domain/government.ts` + the fiscal machinery it exposed in `macro/evolution.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| **D31** | **A, the biggest so far** | `macro/evolution.ts:709` | **Two debt-to-GDP ratios, and the fake one rates the sovereign.** `debtToGdpPct` is walked weekly from `newFiscalDeficitPctGdp` — itself a formula: a stance step-function plus `0.15 × tanh(outputGap × 2)`, smoothed 0.85/0.15. PUB3b already replaced that: `governmentObligationsWeeklyUSD` makes the deficit an OUTCOME of real obligations less real revenue, and stage 11 computes `debtToGdpPctBottomUp` from the real stack over measured GDP. **Nothing reconciles the two, and it is the FORMULA one that drives the sovereign rating** (`evolution.ts:714-721`), hence the sovereign spread. So a downgrade — and the borrowing cost that follows — is decided by the number nobody measures, while the real one sits beside it unused. Rule 3 in its exact recurring shape: a real ledger and a parallel formula that ignores it. **Owner: MAC (6).** Verified: `fiscalDeficitPctGdp` and `structuralDeficitPctGdp` have no reader outside `evolution.ts` and the seed. |
| D32 | **C** | `macro/evolution.ts:160` | **`governmentRevenueUSD = GDP × effectiveTaxRate / 52` is computed and then overwritten** by stage 11's real sum of what the bases actually paid (PUB1b/1c). It survives only to fill the field between stage 02 and stage 11 — so anything reading government revenue in that window gets the formula. Should carry last week's measured figure forward, exactly as inflation already does two lines above it. **Owner: MAC (6).** |
| D33 | **A** | `macro/evolution.ts:120` | **The fiscal stance is a step function on a regime LABEL**: +0.15 in a labelled recession above 7% unemployment, −0.10 in a labelled expansion 3pp above target, else ×0.95 decay. Five invented numbers deciding fiscal policy, and none of them is the government's own budget position — which is what actually constrains a real stimulus. Rule 13. **Owner: MAC (6).** |
| D34 | **A** | `macro/evolution.ts:112` | **`creditTierBooks` imposes both the distribution and the prices**: shares 0.25/0.35/0.25/0.15 across SUPER_PRIME→SUBPRIME and rates 6%/12%/19%/28%. Which households are which credit quality is an outcome of their real balance sheets (HH4's cohorts carry them), and the rate is a price the lending bank sets. §6.3-B has the rate half; the SHARES half was not recorded. **Owner: CRD (9).** |
| D35 | **B** | `domain/government.ts` | **`PROCUREMENT_PER_PAYROLL_DOLLAR = 1.07` is calibrated to a formula that was deleted.** Its own comment says so honestly: "Measured at 1.06–1.08x across the four regions under the previous share-of-GDP budget… this keeps the model's own composition rather than importing" the real 1.4x. So the composition of government spending is still inherited from the top-down budget PUB3b replaced. Not wrong to have done it that way in the transition; wrong to leave it as the permanent answer. **Owner: PUB follow-up (§6).** |

**Clean, and unusually so:** the rest of `government.ts`. `discountBillProceedsUSD` gets a genuinely
subtle thing right and documents the trap in both directions (issuing bills at par *and* paying
them a coupon nets out correctly, so nothing looks broken while the treasury holds a phantom
discount and holders receive a coupon that does not exist). `weeklyBillDiscountAccrualUSD` is
deliberately a statistic and not a debit, with the reason stated. `governmentPayrollWeeklyUSD`
records the defect it closed — 1.65M USA staff, 8.1% of GDP, employed and paid by nobody, and
counted twice in household income. `SOCIAL_BENEFIT_REPLACEMENT_RATE` is derived from the model's
own bases and checked against a real band rather than imported from one. `primaryShare` flooring
at zero with "that is a debt spiral, and it is allowed to happen" is rule 2 applied correctly.

### `src/domain/company.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| D36 | **C** | `company.ts` | **`institutionalRole` was inlined to "mirror `InstitutionalEntityType`" and the two have drifted.** The union in `institutions.ts` carries `PRIVATE_EQUITY`, `MONEY_MARKET_FUND` and `ETF`; the copy here does not, so a PE fund's or a money fund's listed shell has `institutionalRole: null`. This is §7.5's duplicated-shape defect exactly — a value added to one copy and not the other — and it was inlined to avoid a module cycle, which is a fixable problem rather than a reason. |
| D37 | **B, latent** | `company.ts` | **`isPubliclyListed` treats undefined as PUBLIC "for pre-HC companies"** — which cannot exist, since every world regenerates from seed. An undefined `listingStatus` therefore means a creation site forgot one, and the firm silently trades publicly. Third instance of the same silent-default shape (`safeRate` D8, `resolveProtection` D20). Worth one sweep: these three defaults each hide a *different* class of missing write. |
| D38 | E | `company.ts` | The input-lot comment still gave `"PRIVATE:MANUFACTURING"` as the example seller id — one of the five hardcoded buckets SEG deleted when it keyed the SME tier to the registry. Corrected to the live `"PRIVATE:<region>:<industry>"`. |

**Clean, and the single best comment in the codebase** is on `ProductLine.weeklyCapacityUnits`:
capacity is a physical stock in UNITS, "a plant that makes 100 units a week makes 100 when the
price doubles" — and it records the defect that forced it, production sized in dollars and
converted at the CURRENT price, which made supply FALL as price rose. That positive feedback loop
was the inflation runaway of §7.28. `DebtTranche`'s `isCommercialPaper` / `isBankFacility` flags
each say precisely which markets must skip them and what the double-count was. `InputLot` keeping
per-lot provenance rather than a blended average is the founding "1$ is 1$" ask, honoured.

### `src/domain/region-macro.ts` (+ `macro/weather.ts`, counted)

| # | Sev | File | Finding |
|---|---|---|---|
| D39 | **A, now with a count** | `region-macro.ts` / `macro/weather.ts` | **`WeatherAnomaly.gdpImpactPct` and `inflationImpactPct` are written at 14 sites and read at NONE.** §6.4's NAT row called them dead; this is the exact count. They are rule 13 in its purest form — an event stating its own macro outcome — and `evolution.ts:75` already deleted the CPI shortcut for precisely this reason. Only `commodityImpactPct` is live (`evolution.ts:1031`), and it is a stated impact on a PRICE where NAT's whole point is that it should be a cut to a real YIELD. So NAT is: delete two dead fields, convert the third. **Owner: NAT (15).** |

**Clean, and the household balance sheet is the strongest section of the domain layer.** Every
line records what it replaced and why: `equityHoldingsUSD` was a stock appreciating by a formula
return, owned in no register, measured at 2,224B against a real market cap of 1,052B;
`housingStockUSD` is built from physical units rather than backed out of the mortgage, so a price
move actually moves wealth; `priorNetWorthUSD` exists because a LEVEL in a growth rate is a units
error; the HH3 debt lines are explicitly DERIVED views of the banks' books, "never a second stock
evolved by its own formula"; and `unmodeledFinancialAssetsUSD` is a named gap that earns nothing,
moves with nothing and shrinks as the universe grows — rule 13's standard for a legitimate
residual, met.

### `src/domain/industry-registry.ts` — one finding, measured

| # | Sev | File | Finding |
|---|---|---|---|
| **D40** | **A, measured** | `industry-registry.ts` → `companyGenerator.ts:766` → `05-unit-bidding.ts` | **Banks and institutions are registered as suppliers of enterprise software, and they offer it into the goods auction.** `FINANCIAL_SECTOR_PROXY_LINES` gives every Financials/Banks firm a product line of `enterprise_software` at `revenueShare: 1.0` as a stage-08 revenue proxy. But a `productLine` is also what registers a firm as a SUPPLIER in stage 05's auction index (`suppliersBySubUnit`), and that index has **no entity-type filter**. **Probed at seed:** 276 suppliers of `enterprise_software`, of which **16 banks and 24 institutions**; that category's market shares sum to **646%** against **400%** (100% × four regions) for every other category — so insurers and pension funds are diluting the real software firms by ~62%. Incoherent with stage 08 as well: a bank routes to `bankProfile`, which computes revenue from its balance sheet and never accounts for producing anything, so the supply is real to the auction and invisible to the producer's own P&L. Rule 17's "a stage may not switch on an entity type" cuts both ways — the stage is right not to switch, and the DATA is wrong. **Owner: IND (3).** |

**Clean — and this is the best-designed file in the codebase.** `annualCarryingCostRateOf` derives
what holding a good costs from two real physical terms and nothing else: a warehouse charges by
the tonne, so cost per DOLLAR is the tonne price of space over the good's value density (a dollar
of gravel occupies hundreds of times the space of a dollar of semiconductors); and a good with a
shelf life walks to zero at 1/shelfLife whether anyone buys it or not. It replaced a flat 0.02
that "charged a semiconductor fab and a dairy the same rate to hold their output".
`purchaseKindOf` routes each purchase to what it physically IS rather than expiring dead lots —
rule 2 applied correctly again. `smeShareOfActivity` argues its own rule-4 case properly
(efficient scale is a crew or a fab — a structural fact, not an equilibrium). `SME_POOL_INDUSTRIES`
derives the roster from the registry so there is no second list to maintain.

---

## `src/engine/bootstrap`

### batch 1 (category-demand, population, yield-curves)

| # | Sev | File | Finding |
|---|---|---|---|
| B1 | **B** | `bootstrap/category-demand.ts` | **One consumption intensity for every good in the economy.** `HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY = 0.02` and `CORPORATE_PER_FIRM_UNIT_INTENSITY = 1.5` are applied to all 36 sub-units, so a household consumes as many units of aerospace as of food. This is why every sub-unit's baseline price lands at the same order of magnitude (~$70k) and a "unit" is an abstract bundle — `goods-physical.ts` documents that consequence without naming this cause. **The CPI basket is built on these weights**, so the measured price index inherits a basket with no relative quantities in it. The registry already carries per-good physics; consumption intensity belongs beside them. **Owner: IND (3), via the registry.** |
| B2 | watch | `bootstrap/yield-curves.ts` | `TERM_PREMIUM_SLOPE`/`TERM_PREMIUM_CURVATURE` give the opening curve a chosen slope and hump. Seed-only — 07c reprices every point from week 1 — but §7.4's standard is that the seed should be the shape the auction would itself clear. Flagged in place, not a defect today. |

**Clean:** `population.ts` is exactly right — Zipf ranks over a reference unit, with the comment
stating outright that the ranks are "an arbitrary modeling choice… not derived from any observed
population ranking", and deliberately using a *different* order for productivity so size and
productivity are not forced to coincide. `yield-curves.ts` derives the neutral rate from generated
productivity growth plus the inflation-target primitive rather than quoting a rate per region.

### `src/engine/bootstrap` — batch 2 (national-accounts, labor-and-wages, private-firms)

| # | Sev | File | Finding |
|---|---|---|---|
| **B3** | **A** | `bootstrap/national-accounts.ts` | **The file states its own retirement condition and the condition has been met.** Its header said the calibrated shares are "replaced by the flows themselves" once households are real agents with real payroll, taxes and transfer receipts. They are — HH closed (§7.60) and §7.96 made household income the measured sum of what employers pay. Yet `computeHouseholdDisposableIncomeUSD` survives as the live fallback, `assertHouseholdIncomeIdentity` still **enforces** the shares at startup, and `LABOR_SHARE_OF_OUTPUT` still sets the wage LEVEL through `getBaseAnnualWageUSD`. This *is* §6.1's household-income row, stated precisely: retiring this module is that row's actual content, not a vague "reconcile the two". |
| B4 | **A** | `bootstrap/private-firms.ts` | **`NAMED_TIER_REVENUE_SHARE = 0.6` states a cut point a distribution already decides.** A Pareto tail (`PARETO_ALPHA = 1.16`) determines which firms are large enough to name; stating the tail's revenue share separately means the share and the distribution can disagree. The cut should fall out of the distribution. Rule 13. **Owner: DYN (22).** |

**Clean, and worth quoting:** `labor-and-wages.ts`'s `BASELINE_WEIGHTED_TIER_PREMIUM`. Tier
premiums say how occupations are paid *relative to each other* and must not also move the
absolute level — the bug it fixed had the wage bill at `0.62 × 1.4957 = 93%` of output and
household income at 106.6% of GDP. And it normalises against the BASELINE mix, not the drifting
live one, deliberately, so a real shift toward higher-skill work still raises the average wage
instead of being cancelled. That distinction is the difference between a normalisation and a
clamp. `weeklyWageBillUSD` is the single wage-bill derivation every employer uses, and its
comment records that the two it replaced keyed off `householdIncome / employed` — which, once
income became the sum of what employers pay, made the number depend on itself.

### `src/engine/bootstrap/commodities-and-fx.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| **B5** | **A, rule 4, with the comment denying it** | `bootstrap/commodities-and-fx.ts` | **Every seeded commodity price is a real observed market price, back-solved into a "scarcity index".** The header asserted "the price series itself stays entirely synthetic: no real-world observed prices, benchmarks, or exchange tickers are used." Multiply `PRODUCTION_COST_UNIT (40) × categoryCostFactor × scarcityIndex` out: crude **$76.00/bbl**, natural gas **$3.00/mmbtu**, gold **$2,730/oz**, silver **$32.20/oz**, copper **$4.48/lb**, wheat **$6.00/bu**, corn **$4.32/bu**, soybeans **$10.50/bu**. Those are not synthetic. `scarcityIndex` is the observed price divided by the other two factors — a real-world outcome wearing a primitive's name, which is rule 4's sharper half exactly. **The import is not even faithful:** `HEAVY_CRUDE_OIL` seeds at $80 against light crude's $76, where real heavy grades trade at a *discount*. The honest primitive is what the file claims — extraction cost and ore grade / energy density, from which a price follows. **Owner: NAT (15).** |

*Second case in this review of a comment asserting the opposite of what the code does — after the
FX damper (D5). Both were load-bearing claims a reader would have trusted.*

### `src/engine/bootstrap/firms.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| **B6** | **A** | `bootstrap/firms.ts` | **`beta` is stated per sector and then used to price the very thing that should produce it.** A beta is a MEASUREMENT — the covariance of a stock's returns with the market's — and this model produces both series every week and never computes one. The stated value then discounts that same stock (`equity-valuation.ts:71`), prices its cost of capital in the labor decision (`labor-market.ts:159`, added by LAB) and sets its capital charge at seed (`initialization.ts:797`). Circular: the price is derived from a number the price should produce, so a company whose stock actually became more volatile is still discounted at its sector's opening beta forever. **Owner: IDX (7) or 07e — whichever ends up measuring returns.** |
| B7 | **A** | `bootstrap/firms.ts` | **`SECTOR_PROFILE.margin` states each sector's EBITDA margin** (Tech 0.42, Energy 0.33, Industrials 0.24, Consumer 0.17) at recognisably real levels. A sector's margin is an outcome of its cost structure and the competition it faces — which is precisely IND's subject. **Owner: IND (3).** |
| B8 | minor | `bootstrap/firms.ts` | `INTEREST_RATE_ASSUMPTION = 0.045` sets the opening credit rating from an assumed rate, while the bootstrapped curve already exists at that point (`yield-curves.ts`). Should read it. |

**Clean, and unusually well-defended:** the four SME constants. `SME_WAGE_GAP` documents exactly
why it is load-bearing rather than cosmetic — paying pool workers the economy-wide average
charged the tier a wage bill sized by its EMPLOYMENT share against income sized by its REVENUE
share, EUR opens at 58% against 42%, so 82% of pool revenue went out as wages before any other
cost and the layoff cascade took EUR unemployment past 30% by week 58.
`SME_PRODUCTIVITY_DISCOUNT` states the direction employment must run in — "a pool employs who it
can pay, and unemployment is what is left over" — and names what the reverse produced. The name
generator's sector-biased suffixes are a nice touch and break no rule: generated names, not
borrowed ones.

**`bootstrap/carriers.ts` — clean, and the strictest application of §7.4 in the codebase.** The
fleet is seeded by *running the engine's own sourcing intent and freight clearing once* against
bootstrap prices and sizing capacity to the tonnage it actually books — seed by calling the
engine's code, not by writing something that resembles its output. Two constants, both real
lending/structural primitives with the right justification. It also states the right boundary:
"a starting condition and not a target: from week 1 capacity is an outcome."

**`src/engine/bootstrap` complete — 9 files, 8 findings (B1–B8).**

---

## `src/engine/macro`

### batch 1 (utils, indices)

| # | Sev | File | Finding |
|---|---|---|---|
| M1 | **D** | `macro/indices.ts:57` | **The ±15%/wk equity index clamp**, located precisely: it is inside `getCapWeightedAvgPrice`, so it bounds the *cap-weighted move of the constituents themselves*. An index is a statistic; there is nothing here to bound. Already §6.3-C and IDX's headline clamp — now flagged at the line. **Owner: IDX (7).** |
| M2 | **A** | `macro/indices.ts:148-165` | **Five real index brands as display names**: 'S&P 500 Composite', 'Euro Stoxx 50', 'FTSE 100', 'Nikkei 225', 'S&P GSCI Commodity Index'. With D1 (the same brands as *field names* in `markets.ts`), IDX has both halves to rename in one commit. Rule 4. |
| M3 | **B, latent** | `macro/indices.ts` | **The regional indices filter to `listed`; the sector sub-indices do not.** The comment above the regional filter states the reason exactly — "a private firm has no quote and no index membership, so it must not enter a cap-weighted average with a zero market cap" — and then `techFirms`/`finFirms`/`energyFirms`/`indFirms` are built from unfiltered `companies`. Harmless only while a private firm's `marketCap` is 0, so it contributes zero weight. A latent instance of the bug the comment describes. |

### `src/engine/macro/weather.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| M4 | **B** | `macro/weather.ts` | **Weather has no calendar and no geography.** `evolveRegionalWeather(regionId, current, _week)` never reads `_week` — there is no seasonality at all, so a heatwave is as likely in January as in July — and the type is drawn uniformly from all four regardless of region, so JPN can draw a Polar Vortex and the UK a Monsoon. A weather system that is neither seasonal nor located is a random shock generator with weather names on it. **Owner: NAT (15).** |
| M5 | **A** | `macro/weather.ts` | `commodityImpactPct` states a **price** impact. NAT's whole content is that the chain runs through a real YIELD → the commodity book → input costs → the measured index, which `evolution.ts:75` already states when it deleted the CPI shortcut for the same reason. With D39 (the two dead sibling fields, 14 writes / 0 reads), NAT's scope is now fully specified. |
| M6 | **A** | `macro/weather.ts` | **Rule-4 place names**: 'Midwest', 'Great Plains', 'North Sea', 'Mediterranean', 'Pacific'. §6.3-D had this; now at the line. Also a small modelling slip — the EUR *heatwave* is wired to `HEAVY_CRUDE_OIL`, where cooling demand is electricity and gas. |

### `src/engine/macro/household-cohorts.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| **M7** | **A — restates §6.3-A row 3 as one defect, not nine** | `macro/household-cohorts.ts` | The audit lists **nine** imposed tables here (occupation mix, wage multiplier, tax multiplier, transfer weight, residual-receipt weight, debt-service weight, spend mix, balance-sheet weights, wealth MPC) and treats them as nine primitives to argue about. **They are one missing mechanism: cohorts have no balance sheets.** `region-macro.ts` says so outright in `HouseholdCohort`'s own doc — cohorts do not "hold per-cohort balance sheets" — so their wealth must be ALLOCATED across tiers rather than accumulated by them. The pieces to derive it now exist: who holds equity is the real direct register (OWN4), who holds a house is HSG's buyer, who holds deposits is whose savings accumulated, who owes consumer debt is HH3's itemized pools. **Give a cohort a balance sheet and eight of the nine tables become measurements.** That is a far smaller and more definite piece of work than the audit row implies. **Owner: MAC (6), with HSG (10) for the housing half.** |
| M8 | **A** | `macro/household-cohorts.ts` | Two of the nine are explicit real-world imports rather than modelling choices: `TIER_BALANCE_SHEET_WEIGHTS` is documented "US SCF-shaped" (an observed wealth distribution — an equilibrium, rule 4's sharper half) and `TIER_WEALTH_MPC` is justified as "what the empirical literature finds". Both are the *outputs* a model like this exists to produce. |

### `src/engine/macro/banking.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| M9 | **C — FIXED in this pass** | `macro/banking.ts` + `02b-bank-diversification.ts` | **The same unnamed `0.3` in two files**: the share of household saving that reaches a bank deposit. In `banking.ts` it sizes the funding-pressure *denominator*; in 02b it sizes the *inflow* the money fund competes for. Changing one and not the other would have made the diverted amount and the amount it is measured against disagree — §7.5's duplicated-constant shape, the same defect as the 0.35 procurement literal that existed in three copies. **Named once as `HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE` and imported.** It remains a stated split (rule 13): where a household's saving goes is a portfolio choice against the yields it can see, and WS7 already models one leg of it. **Owner: MAC (6).** |
| M10 | **A** | `macro/banking.ts:298` | **`betaFloorRate = policyRate × 0.45` is an observed deposit beta**, identical for every bank. It is documented as a floor the competitive rate rises above — but it IS the rate in any week the money fund is not taking funding, which is most weeks. What a bank pays for deposits should come from its own funding need against the alternatives its depositors can see. §6.3-B has it; now flagged at the line with the reason it binds. **Owner: G3 (8).** |

**Clean, and this file is a model of how to record a deletion.** Every removed formula is named
where it used to be: the 0.999-decay deposit target ("and with it the drift between the bank's
deposit line and the household stock it claims to be: they are ONE number now"), the savings
inflow that was credited here *and* by settlement ("the second of two independent quantities for
one balance"), the consumer-loan target formula, the business-lending target that double-counted
07d's loan market, and PUB2b's "monetized amount" with the reason it was wrong (*a central bank
buying bonds pays the seller, it does not print deposits into household accounts*). The corporate
deposit rate is genuinely derived — the model already simulates the alternative a treasurer would
take, so the rate a corporate balance commands is the money fund's own yield.

### `src/engine/macro/initialization.ts`

| # | Sev | File | Finding |
|---|---|---|---|
| **M11** | **A — completes D31's story** | `macro/initialization.ts:164` | **`sovereignRating` is ASSIGNED per region at seed** (USA AA, UK AA, JPN A, EUR AAA), and `DEBT_TO_GDP_PCT = 1.0` / `FISCAL_DEFICIT_PCT_GDP = 0.05` seed the top-down pair beside it. Together with D31 the fiscal story is now complete and all three legs are top-down: **the debt ratio is assigned at seed, walked weekly by a formula, and rates the sovereign** — while the real stack and the real obligations-based deficit sit beside it, measured and unused. A rating is an outcome of debt and deficit; here it is an input to a chain that never touches either real number. **Owner: MAC (6).** |
| M12 | **A** | `macro/initialization.ts:147` | **Real institution names**: 'Federal Reserve', 'Bank of England', 'Bank of Japan', 'European Central Bank', plus the four country names. The comment exempts them as "structural region identifiers… not numeric data" — but rule 4 names real tickers and company names *first*; it is not a rule about numbers. §6.3-D has this. **Owner: IDX (7)**, with the index brands. |
| M13 | **A** | `macro/initialization.ts:199` | **`HOUSEHOLD_DEBT_RATIOS` are observed household balance-sheet ratios** (mortgage/income 0.90, equity/income 1.8, deposits/income 0.65). `equityHoldingsToIncome` is the one the household state's own `unmodeledFinancialAssetsUSD` doc already cites as the source of its named gap — "real households hold roughly 1.5x income in financial assets and the seed says so". Cohort balance sheets (M7) replace the line with accumulation. |

### `src/engine/macro/evolution.ts` — the household half

| # | Sev | File | Finding |
|---|---|---|---|
| **M14** | **A — D31's sibling** | `macro/evolution.ts:222` | **Two wage growths, and the formula one drives consumption.** LAB made the wage a real price: each firm sets `offeredWageIndex` from its own unfilled postings and margin headroom, and each occupation pool's `wageGrowthAnnual` is the employment-weighted average of what firms actually offer — stage 08 reads that one (`getBlendedWageGrowth`), and so does the UI. The Phillips curve `0.025 + 0.8 × slack + 0.1 × expectedInflation` survives beside it, and **it is the formula that feeds `realWageGainEffect` (consumption, line 401) and `cciEquilibrium` (consumer confidence)**. So what households are paid and what they spend out of are two different numbers. Exactly D31's shape — a formula outliving the mechanism that replaced it, and being the one a downstream decision reads. **Owner: MAC (6).** |
| M15 | **A** | `macro/evolution.ts:227-233` | **Consumer confidence is a four-coefficient formula** (`100 + wageGap×150 − unempGap×200 − inflGap×80 + shock×1000`, reverting at 0.08, clamped [30,170]) and the **savings rate is a three-term one** (`0.05 + inflGap×0.5 − 0.1×cciGap + realRateGap×0.4`). §6.3-B/C list both; what the audit did not say is that they are *chained* — confidence feeds the savings rate, the savings rate feeds consumption, and confidence's largest input is M14's fake wage growth. MAC's (b) half is this chain. |

---

## `src/engine/simulation/stages`

### batch 1 (01-macro-feedback, 06-fx-and-trade, 07-commodities)

| # | Sev | File | Finding |
|---|---|---|---|
| **S1** | **Dead code, with a weekly cost** | `stages/01-macro-feedback.ts` | **Three of stage 01's five outputs are dead, and one of them walks the whole universe to produce them.** (a) `regionFloatingPrincipal` sums every company's floating tranches each week to feed `evolveBankingSector`'s `businessLoanBookInputUSD` — a parameter that is **declared and never read**, because G2 made business lending the itemized stage's decision and deleted the target formula that consumed it (`macro/banking.ts:298` records that deletion). It also counts `isBankFacility` tranches, which is precisely the double-count 07d exists to avoid. (b) `marginCompression` / `avgMargin`: stage 02 passes a literal `marginCompression: 0`, and nothing else reads either; the `0.22` threshold has no owner. (c) `creditContagionBps`: stage 02 likewise passes a literal `0`. Delete all three with their call sites. |
| S2 | **A** | `stages/01-macro-feedback.ts` | **`creditContagionBps = recentDefaultsCount × 12`, then `systemicStressFactorGlobal = min(0.3, bps/500)`** — and *this one is live*: stage 08 reads it (`08:1546`). So a defaults count is converted to basis points by a coefficient and fed into pricing. Rule 1: a credit spread is a cleared price. **Owner: G5 (14).** *(The default-decay window itself is well done — a rolling year, freshest-weighted, plus the currently-distressed cohort, replacing an ever-ratcheting all-time count.)* |
| S3 | **B, latent** | `stages/06-fx-and-trade.ts` | **`getFxToUsd` returns `1.0` when no pair matches** — the fourth instance of the silent-default shape, and the most pointed one, because the comment directly above it describes what that fallback already did once: "every lookup missed and every caller silently got a hardcoded fallback, which is why the exchange rate had never moved anything: the one function converting to USD returned a constant." The lookup was fixed; the fallback that made the failure invisible was kept. |

**Clean:** `06-fx-and-trade.ts` is a good example of a stage that stopped computing and started
reporting — trade is now the sum of stage 05's cross-border fills, and its comment names what it
replaced (`exportShareCapture`, a clamped formula handing exporters a share of foreign demand on
a competitiveness score, credited separately in stage 08 — two mechanisms for one sale).
The annualisation is explicitly labelled per rule 9.

### stages batch 2 — clamps the §6.4 inventory does not list

A scan of every numeric bound across all 53 stage files, excluding genuine mathematical guards
(divide-by-zero floors, probabilities in [0,1], `min(matches, vacancies, seekers)`). §6.4's
inventory was built from the audit and is incomplete. Six real ones it does not name:

| # | Sev | Where | Finding |
|---|---|---|---|
| **S4** | **D — and it blocks CAP** | `08-company-fundamentals.ts:451-452` | **A firm's EBITDA margin cannot leave [2%, 65%]**, whatever its costs and prices do. **So no firm can report a loss at the EBITDA line.** CAP's entire mechanism — a firm that cannot cover unit cost STOPS producing rather than throttling to 30% — cannot fire while this holds, and neither can any distress logic that reads EBITDA. This belongs at the *top* of CAP's clamp list, not missing from it. |
| **S5** | **D, rule 15** | `08-company-fundamentals.ts:1424` | **A $0.10 floor on a cleared share price.** `comp.stockPrice` arrives from 07e's auction and is then floored. A company the market has decided is worthless prints ten cents rather than approaching zero, and that number feeds market cap, index levels and the take-private arithmetic. **Owner: IDX (7)**, alongside the index clamp. |
| **S6** | **D, worse than a clamp** | `11-fiscal-and-sovereign-debt.ts:130` | **Measured GDP growth is clamped to ±4%/wk.** GDP is summed bottom-up from real settled activity and the growth rate that sum implies is bounded before anyone reads it. **A clamped statistic is not a statistic.** If the raw figure is too noisy, the 0.85/0.15 smoothing two lines below is the honest tool. |
| S7 | **D** | `08-company-fundamentals.ts:675` | `growthCapexAllocationShare = max(0.4, …)`, commented "even at max payout pressure, still reinvests at least 40% — **realistic**, not zero". A floor justified as realistic is exactly the shape rule 2 exists to catch: a firm under real payout pressure does cut investment to zero. **Owner: CAP (4).** |
| S8 | **D, rule 15** | `05-unit-bidding.ts:572` | An SME pool's offer floor is `referencePrice × max(0.5, 1 − marginPct)` — so a pool cannot offer below half the reference price however thin its margin. A floor on an offer price. **Owner: CAP (4).** |
| S9 | **D** | `05-unit-bidding.ts:431` | `inputSupplyConstraintFactor = min(prior, max(0.3, fillRate))` — however badly a firm's inputs are rationed, its production constraint bottoms at 0.3. The supply shock a real shortage would cause is bounded away. **Owner: CAP (4).** |

*Also confirmed at the line, already in §6.4: production throttle [0.3,1.0] and response ×[0.5,2.0]
(`05:469,471`), capacity growth ±2%/wk (`05:496`), cost rate [0.40,0.98] (`05:505`), coverage
[−50,50] (`08:192`), firm revenue growth ±5%/wk (`08:518`), recovery-rate floor 0.10 (`08:1548`).*

**The pattern worth naming:** S4 + `05:505`'s cost rate together mean a firm's margin is
structurally bounded away from zero from two directions at once. CAP is not "remove four bounds
and add a production rule" — it has to remove the margin floor FIRST, because until a firm can
run a loss, the decision CAP exists to build has nothing to decide.

### stages batch 3 (corporate tax, contracting, the dampers)

| # | Sev | Where | Finding |
|---|---|---|---|
| **S10** | **C** | `08-company-fundamentals.ts:263` | **The corporate tax rate is a bare `0.21` literal, and it is the only one the model has.** `region.effectiveTaxRate` — which the fiscal stance drifts weekly and which §6.3-C clamps to [10%, 50%] — governs a different base, and `HOUSEHOLD_EFFECTIVE_TAX_RATE` a third. Neither reaches this. So **the government's own tax policy cannot touch corporate taxation at all**, while stage 11 collects the proceeds as `taxCollectedCorporateUSD` and counts them in revenue. Three tax rates, no owner, and the largest one is a literal inside a company loop. **Owner: TAXR (25).** |
| S11 | **A** | `05-unit-bidding.ts:53` | `CONTRACTED_DEMAND_SHARE = 0.6`, justified as "real procurement splits roughly this way" — an observed outcome. How much of its need a buyer locks under contract is a decision against the risk it is hedging (supply reliability, price volatility, its own inventory), and CHAIN makes exactly that decision real. **Owner: CHAIN (21).** |
| S12 | **watch, connects D5** | `07b/07c/07d/07e/07f` | Each book carries a `MAX_WEEKLY_*_MOVE_PCT` damper (0.25 / 0.20 / 0.25 / 0.18 / 0.25) of the same kind as the FX damper D5 proved was *printing itself* 38 weeks in 40. §6.2 already watches "2,549 instruments persistently bound, worst streak 60 weeks" — **those are these**. D5 is not an FX-specific defect; it is the same mechanism measured in one market where somebody looked. When XB6 fixes the FX float, the same question should be asked of these five. |

### stages batch 4 (settlement, 07e, 03)

| # | Sev | Where | Finding |
|---|---|---|---|
| S13 | **E, self-contradicting** | `07e-equity-clearing.ts:57` | **Two contradictory comments ten lines apart in the same function.** Line 57 said "Banks and institutions keep their own book-value pricing in stage 08 for now — their equity is a claim on a balance sheet this engine does not yet model as shares." Line 66 says "Banks and institutions are listed companies and **clear here like any other**… the reason for the carve-out is gone", and the filter confirms it — no entity-type exclusion. Stage 08 independently records the same thing ("the book-value × cycle-P/B branch that used to price banks and institutions here is GONE"). The stale half deleted. |
| S14 | note | `settlement.ts` | **Households settle T+1; everyone else settles same-week.** `pendingBankSettlementUSD` defers the household bank leg by a week while companies, institutions, segments and the boundary all post immediately. Documented and defensible — a payroll credit really does clear next day — but it means household deposits are structurally a week behind household cash, and nothing else in the model has that lag. Worth knowing before anything reconciles the two. |

**Clean, and the best-argued stage in the codebase:** `settlement.ts`. The real mechanism is
stated precisely (same-bank payment = a relabelling with no reserve movement; cross-bank = a real
reserve settlement; the government banks at the central bank, so tax dates drain the money
market), `BANK_CREDIT` models endogenous money correctly (a loan creates a deposit with no reserve
leaving the lender, and reserves move only when it is *spent* to another bank's customer), the
`UNMODELED` boundary banks somewhere real rather than being a hole, and conservation is
**asserted and throws** rather than plugged. `price-index.ts` is its equal: a Laspeyres basket on
real cleared prices, chain-linked, with the explicit refusal to add a wage-push or money-growth
term because "adding a separate formula term for them would be counting the same economics twice
— once through the market and once around it."

### stages batch 5 (bank-lending, asset-allocation, corporate-financing, insurance)

| # | Sev | Where | Finding |
|---|---|---|---|
| **S15** | **Dead code — DELETED** | `asset-allocation.ts:48` | **`CAPITAL_CHARGE_BY_ASSET_CLASS` is exported and referenced nowhere** in the entire `src/` tree, and its own comment marks one member "legacy flat charge — superseded". Second dead export found by this review (after `FX_SPOT_PRICE_IMPACT_PER_GDP`, D15). Deleted with its now-orphaned doc comment. |
| **S16** | **A — third met exit condition** | `bank-lending.ts:62` | **`BANK_TARGET_ROE = 0.12` prices every loan a bank writes** (through `quoteLoanMarginBps`), and its own comment said the hurdle should come "from its own cost of equity once its stock clears in 07e post-G2". **G2 is closed and bank stock does clear in 07e** — the carve-out was removed and 07e records it (S13). The input exists: risk-free + beta × ERP off the bank's own cleared price. **Third file in this review stating a condition that has since been satisfied**, after `national-accounts.ts` (B3) and `etf.ts` (D17). **Owner: G3 (8).** |
| S17 | **A** | `insurance-and-pensions.ts:43,49` | `PENSION_CONTRIBUTION_RATE = 0.09` and `PENSION_BENEFIT_RATE_ANNUAL = 0.05`. Both comments already name the fix — "it becomes an outcome in HH4, where cohorts have ages and a contribution is something a working cohort does" — and HH4's cohorts exist. Same shape as M7: give a cohort an age and a balance sheet and both become measurements. **Owner: MAC (6) / DEM (5).** |
| S18 | minor | `bank-lending.ts:74` | `quoteLoanMarginBps` floors at 25bps — a floor on a price, small but rule 15. *The function itself is the right derivation and is what `banking.ts`'s mortgage spread (D27) should be doing.* |

**Clean:** `asset-allocation.ts`'s spread-risk capital schedule is a genuinely good rule-4
argument — capital charges stepping by rating and scaling with duration is the structure *every*
real regime shares, and the comment explains why the flat within-IG version broke the ladder ("a
flat charge made every IG reservation identical… the fix is the real regulatory structure, not a
fitted curve"). `equity-valuation.ts`'s no-earnings branch retires a formula that priced a BIGGER
loss HIGHER. `corporate-financing.ts`'s `DEPLOYMENT_MULTIPLE` is well-reasoned: "cheap debt does
not create projects."

