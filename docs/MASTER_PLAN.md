# THE MASTER PLAN — one file, one project: a closed circuit

**Read §1 before touching anything.** §2 is the map, §3 IS THE WORK (one ordered project; take the
first step), §4 the gates, §5 the lessons, §6 the watchlist, **§8 the full audit record behind
§3's steps**, §9 the log of what is already done. §1–6 are the plan and stay brief; §8 is an
appendix you read at the step that needs it. There is no second rules file and no second work
list — §3 is the only list, and it holds only what is still open.

**A note on `§7.N`.** ~400 code comments cite `§7.N` — those are the ORIGINAL numbered records, and
they live in git at `79c239b:docs/MASTER_PLAN.md` along with the superseded plan. §5 keeps every
lesson the code still cites at its original number, so a `§7.N` citation still resolves there.
There is deliberately no section 7 in this file, so the citation can never be misread as one.

**WHERE THE WORK STANDS — read this first on a handover.**
- HEAD `35fa0ea` on `claude/master-plan-cleanup-ld1oh1`. Tree clean. (This branch replaces the
  earlier one; the session that owns it may push nowhere else.)
- **Next step: §3 step 10**, then 11, 12, … in order. §3 is the only work list, and it holds only
  what is still OPEN — a finished step leaves it and lands in §9.
- **The reference to judge a change against:** `SHOCKS=0 WEEKS=16` at `35fa0ea` —
  **115 violations in 33 families**, "the money that is not anyone's" 0.00B, and **M6 grazing its
  band in 1 week of 16** (2.69B against a 0.5%-of-money tolerance ≈ 2.5B) — the first money line
  in a long while; see §9.9 and §6.
  (The family count is partly cosmetic: the P1 seniority line names example issuers and they move.)
  (The older 13-week 82/20 figure is NOT comparable: three fewer weeks of accumulation. Judge a
  13-week change against a 13-week run and a 16-week one against this.)
- **Recording a step:** delete the step from §3 and write its record in §9 — what changed, why,
  and the measured numbers, for a reader who was not here. A lesson that a FUTURE step could
  trip over goes in §5 as well; nothing else does.
- Gates at HEAD: `tsc` 0, ESLint 348/354, hygiene pass, 125 tests.

**Where this list came from (2026-09-02): a line-by-line audit of ~230 files / ~55k lines**, which
found ~380 defects. Every material one is a step in §3 at its file:line (or, once done, in §9),
and **the sweep in full is
in §8, by area, so nobody re-derives it** — including the long tail of minor, dead-code and
already-fine findings that did not earn a step. §8 is a record, not a work list, and it was NOT
re-verified: treat an unconfirmed finding there as a lead with a file:line. The headline that set the order: money and ownership do NOT close (interest accrued and
never paid, a residual wired twice, three ledger paths dropping value silently, an estate that can never
close — all closed, §9), price is NOT universal (credit trades at par, commodity
spot is a drift formula), and the instrument that measures all this is itself broken (the wires
family never prints, the per-bank identity check has never fired).

## 1. RULES OF ENGAGEMENT

Standing user directives. Not suggestions.

1. **Every price is the result of real supply/demand clearing.** OAS, discount margin, yield, P/E
   are statistics DERIVED from a cleared price, never the mechanism that sets it. One exception:
   central-bank ADMINISTERED rates (SRF / ON RRP) — a posted rate with a REAL QUANTITY RESPONSE,
   which means a position booked on both sheets. A posted rate with no position is not the exception.
2. **NO BOUNDS OF ANY KIND (user, 2026-09-02: "no more boundaries, no more dampeners, no more
   clamps; none of that anymore").** No cap, floor, ceiling, clamp, damper, rescale, guard-break or
   `Math.max(0, …)` standing in for a decision. The ONLY admissible bound is arithmetic
   impossibility — a price cannot be negative, a count cannot be fractional, a share cannot exceed
   its whole. If a number explodes, the mechanism that should compensate is missing: find it and
   build it. **Never clamp the symptom.** A bound that covers a missing mechanism is deleted WITH
   that mechanism built, not before (§5.158/§5.177) — that pairing is the only sequencing allowed,
   and it is a step, not an excuse.
3. **"1$ is 1$":** every dollar and every share traces to a named counterparty. The anti-pattern to
   hunt and kill is **two disconnected representations of one real thing** — a real cleared ledger
   and a parallel formula that overwrites or ignores it.
4. **No real-world data and no real-world OUTCOMES.** No real tickers, company names, observed
   prices, copied spread tables. A real-world PRIMITIVE is fine (a tax rate, a replacement rate, a
   regulatory ratio, a haircut, a physical storage cost); a real-world EQUILIBRIUM is not — dollar
   invoicing dominance, a foreign ownership share, a fixed CB market share, a sector's growth rate.
   Those are RESULTS of histories this simulation does not have; import one and the model can never
   tell you anything about it, because you assumed the answer.
5. **Target allocations are long-term policy guides only.** What a participant buys this week is a
   tactical decision from real characteristics, never the target mechanically.
6. **Long tests are end-of-project only** (§4's ladder).
7. **One bounded, verified commit per step.** Never one large unreviewable change.
8. **Reflect the real-world mechanism.** When in doubt the answer is how it actually works, with
   real named counterparties. Ask before large scope decisions.
9. **Periodicity is part of the number**, and so are the price level and the unit of meaning. Every
   rate, flow and index carries a period; confirm it at the source and name it in the identifier
   (`…WeeklyUSD`, `…Annual`, `…YoY`). A field named USD is not a share. **A displayed change where
   no history exists is a lie — show the level.**
10. **The simulation is a partial world — do not chase every moved number.** Attribute a moved
    baseline BRIEFLY (one cheap A/B at most), record it with its owner, move on.
11. **Brevity, and clean up as you go.** A comment earns its place by saying what the code cannot:
    why a constant has its value, what a non-obvious mechanism is, what was tried and failed. **A
    comment that describes code that no longer exists is a defect** — the audit found dozens.
12. **Do not evaluate market behaviour mid-update.** BUILD THE WHOLE THING, then measure. Numbers
    taken halfway describe an economy that does not exist yet. The narrow exceptions are structural:
    `tsc`/build, and a targeted probe that a mechanism you JUST wrote is wired. The harness may be
    deliberately red mid-project.
13. **Ownership, prices, quantities and capacities are OUTCOMES.** Never impose a share, a price, a
    flow or a capacity a mechanism should produce. **A residual with no holder is a defect, not a
    boundary.**
14. **Every flow has two sides, and both legs go in the same pass.** A security movement has a cash
    leg; a derivative has a counterparty with finite capacity; a payment leaving one book arrives on
    another. **A one-sided flow is a defect even when nothing fails and every test passes.**
15. **A bound is not a price.** Every market clears through the clearing engine at the saturation
    point. Never park a print on a bound; the subtlest form is a bound that LOOKS like dollars and
    is a percentage wearing dollars' clothes.
16. **Delivery.** One bounded commit per step, pushed to `claude/master-plan-review-j2z20v` AND
    `main`. Messages and §5 records state what changed, WHY, and the measured numbers, for a reader
    who was not here. **No model identifiers in any committed artifact.** No PR unless asked.
17. **The targeted-change test.** Adding a product line, a lead time, a revenue rule or a fund type
    must be ONE change: a registry entry, or one profile module. All DATA lives in a registry; all
    BEHAVIOR that varies by kind lives in a profile behind a dispatch table. **A stage may not
    switch on an industry, sector, entity type or product id.**
18. **Model updates come first; a misbehaving NUMBER is not a work item.** The priority is the
    missing MECHANISM. The other half: when a number is so far out it BLOCKS mechanism work, closing
    it IS mechanism work — find which missing mechanism the number is the accumulated cost of.
19. **THE FEWEST PRIMITIVES THAT GENERATE THE WORLD** (rules 1, 4, 13 are corollaries). A number is
    a legitimate primitive ONLY if no mechanism can produce it: **TECHNOLOGY** (what a process
    physically takes), **PREFERENCE** (time and risk), **POLICY** (what an institution chooses).
    Everything else is an OUTCOME and a stated value for it is a defect with a scheduled death.
    RESOLUTION parameters (strata count, grid size) are numerical choices tested by INVARIANCE;
    SHAPE parameters (a Pareto alpha, a tier share, an MPC ladder) are claims about THE ANSWER. The
    count of stated shapes measures how much mechanism is missing; keep it falling.
20. **NEVER ROLL BACK.** When a change makes a print worse, the answer is never to restore the old
    number. A derivation that replaced an invented constant does not become wrong because the world
    it now describes is uglier — the ugliness was there and the constant was covering it. **A bad
    print is a finding, not a regression.** Only a change WRONG ON ITS OWN TERMS may be undone.
21. **Depth is untouchable; representation is free.** Mechanisms, economics and named boundaries
    never change under a performance campaign. Storage layout, fold order, parallel decomposition
    and scaffolding deletion are the campaign's to decide.
22. **Strongest gate the change admits.** Byte-identical 4/13-week dumps wherever possible; a change
    that is inherently a relabel is a DECLARED re-baseline, named in its record.
23. **No forecast without a falsification test.** A record may state an expectation only with the
    measurement that would kill it.
24. **New column stores are SAB-backed with copy-on-grow**, and every growth path copies.
25. **A RUN IS THE LAST GATE, NOT THE FIRST** (user: "really minimize the use of tests"). At most
    ONE 13-week harness per commit, no experiment runs. The cheap gates and READING THE CODE come
    first; a `WEEKS=2` probe is allowed before the one run for a settlement-touching step; a defect
    the run finds is diagnosed by reading and by instruments already in the tree. Adding an
    instrument the next run carries for free beats a run of its own.
26. **Every asset that has a price shows it** (user, repeated). For fixed income show BOTH the price
    and the spread (DM/OAS). An asset with no displayed price is an asset nobody can judge.
27. **Instruments are named as a market names them** (user, 2026-09-02). A bond is issuer + coupon +
    maturity; a loan is issuer + margin + maturity; a bill is issuer + tenor. An internal id is fine
    as an id — it is never the display name.

## 2. THE MAP

**Weekly pipeline** `src/engine/simulation/core.ts` — builds one shared `WeeklyStepContext`
(`stages/context.ts`) and runs ~50 stages. Order is load-bearing and each placement carries its
reason in a comment; `stage-deps.ts` annotates deliberate backward edges. Groups:
- **Macro & credit** — 01-macro-feedback, 02-region-macro, 02b-bank-diversification, labor-market,
  prime-brokerage. Region evolution, the administered policy rate, per-bank books, GC repo, labour.
- **Real economy** — 03-category-demand, 04-input-output, trade-settlement, goods-arrival,
  sourcing-intent, freight-clearing, **05-unit-bidding** (THE goods auction: five books per
  sub-unit, per-lot settlement, contracts, capex bids), 06-fx-and-trade, 07-commodities.
- **Financial books** — 07b corp bonds, 07c sovereigns (the curve's owner), 07d loans, 07f bills+CP,
  securities-lending, 07e equity, **derivatives** (one stage, every class the registry names).
- **Settle & report** — repo reconcile, holdings write-back, **08-company-fundamentals** (the
  per-company week: front seam + kernel A worker-able / kernel B main-thread, `src/engine2/`),
  settlement, sme-pools, hc-lifecycle, insurance, index-calculation, etf-flows, household sheet,
  estate-resolution, concentration, 10-mergers, management-review, fx-clearing, bill-accretion,
  sovereign-calendar, 11-fiscal, overdraft-sweep, settlement-close, bank-funding-close, bank-
  resolution, central-bank, settlement-funding, 12-portfolio, news, 13-turn-summary. Three
  settlement cycles: a week's money settles inside the week.

**`stages/financial-clearing-engine.ts`** — the generic cap-free double auction: real demand
schedules, exact piecewise-linear segment walk, saturation clearing; `statKind` orients it. Every
asset class is a thin adapter owning participants, reservations, sizes and the float.

**`src/engine/ledger/` — the money primitive.** `post()`/`pay()` the one write path (throws on
NaN/negative); `bookPnL` the one bank-P&L write; `payment-category.ts` classifies every reason;
`wire.ts` the columnar journal; `party.ts` a party is an int32; `holdings-ledger.ts`,
`tranche-ledger.ts`, `goods-ledger.ts`, `accounts.ts` (persistent accounts on `v2.accounts`).
Hygiene fails the build on a money-field write outside the ledger.

**`src/engine2/` — the column stores.** `tranches.ts` (the ladder's authority), `holdings.ts` (the
register), `company-store.ts`, `lots.ts`, `contracts.ts`, `world.ts`, the stage-08 kernels and the
worker pools.

**`src/domain/` — the registries and rules.** `industry-registry.ts` is the single data owner;
`derivatives/` is one contract + one profile per class behind a dispatch table; `company-week/` the
seven pure rule objects; `preferences.ts` the two preference primitives on every deciding entity;
`stated.ts` the registry of numbers with a scheduled death; `institution-profiles.ts`, `units.ts`.
**Audit** `src/engine/audit/` — M money, O ownership, P prices, X cross-market, F accounts, N names,
W wires, run every week by the harness. **UI** `src/ui/` is AURORA (phone shell, object and function
modules), reads `GameState` only. **One harness** `scripts/harness.ts`. **One test tree:** `test/`
holds PURE-FUNCTION tests over `domain/` only — no engine run; hygiene enforces the boundary.

## 3. THE PROJECT — THE CLOSED CIRCUIT

**One list, in order.** A closed circuit means: every dollar and share has a named counterparty at
every instant; every asset that has a price has a CLEARED one and shows it; nothing is bounded,
plugged or invented; and the instrument that measures all this is itself true. Each step is ONE
commit, gated by §4. **The full audit detail behind each step is in §8** — read the step's area
before starting it (the index is at the head of §8). A finished step is deleted from here and
recorded in §9, so this list is always exactly what is left. Later parts depend on earlier ones —
do not reorder.

### PART I — THE CIRCUIT CLOSES (money and ownership leak nowhere)

9b. **The household week has no lag.** `household-balance-sheet.ts:53` reads the week's own
    settlement report, which at that point holds the intraday pass only, so every household flow
    the close settles is lost. It cannot simply read the prior week whole (step 9 measured it):
    the fields are named for a one-week lag and stage 02 consumes them the week after, so that
    makes them two weeks stale and breaks M6's within-week identity. The fix is to delete the lag
    — stage 02 reads the household week in the week it happened — and then the complete report is
    the natural source. `ctx.priorWeekFlows.householdFlowsByRegion` is already persisted and
    waiting for it.
10. **Both legs, same money, same counterparty.** `05-unit-bidding.ts:1953` pays a cross-border cash
    leg in the BUYER's money to a seller whose books are in origin money with no conversion, while
    `:1838` books origin money; `:2183,2202` move the household/government goods leg lot-by-lot with
    its real seller but spread the CASH leg pro rata across every seller. `foreign-direct-investment.ts:145`
    capitalises a foreign subsidiary with no FX conversion at all. `securities-lending.ts:390` strikes
    collateral once and never re-marks it (no variation margin, so a squeeze costs nobody anything).
11. **The wild swings, by named cause** (user-reported: ratings, revenues, inflation).
    (a) `companyGenerator.ts:741-790, 827-835, 933-941` — all three revenue-rescale sites scale
    revenue, shares, PP&E, tranches and cash but NOT ebitda/ebit/netIncome/eps/capex, so a clone
    carries the parent's full EBITDA and margins exceed 1; only banks are repaired.
    (b) `credit-standing.ts:37,40` — a bank's leverage denominator is `revenue × 0.4` and its
    coverage is the two-valued step `capRatio < 0.05 ? 0.4 : 3.0`; that step is the spine every bank
    is rated on, so ratings hop buckets.
    (c) `macro/indices.ts:66` — returns an index LEVEL where every caller treats the value as a
    fractional change, so an emptied region or sector multiplies its index by ~1001 in one week.
    (d) `price-index.ts:150` + `11-fiscal:86` — `seedCpiHistory` fabricates 53 weeks compounding at
    the inflation TARGET and the YoY reads index 0 from week 1, so year-one inflation is a
    manufactured number feeding the Taylor rule, the labour deflator and the news (rule 9, rule 4).
    Report the LEVEL until 53 real weeks exist.
12. **Carriers, and the fuel nobody sells.** `bootstrap/carriers.ts:284` seeds `totalDebt` — not a
    field since the ladder became authoritative — so carriers open with ZERO debt while their seed
    interest, coverage, rating, eps and stock price all assume it, and no lender holds it.
    `profiles/carrier.ts:44` expenses fuel with no purchase and no `CARRIER` row in
    `PROFILE_INPUT_BASKET`, so the world fleet's bunker demand never reaches `refined_products` and
    nobody is paid for it.

### PART II — THE INSTRUMENTS ARE REAL

13. **Face, and price × face** (the "credit always trades at par" defect). The tranche row carries
    FACE; a holding's value is price × face. Build `domain/bond-pricing.ts` (price from spread, the
    inverse of the OAS/DM the books already clear), give the engine a real `unitValueUSD` for
    YIELD_LIKE books, settle primaries at the cleared price rather than par, mark desks and NAV off
    it, and keep accrual and estate claims on FACE. `holdings-ledger.ts:46-49` (`priceOf` returns
    `priceUSD = 1`) is the wire-layer site. Sites inventoried in the audit: `07f:930` (CP at par with
    an annual coupon on 13-week paper), `12-portfolio:110`, `institutional-balance-sheet.ts:192`.
14. **Nomenclature** (rule 27). A tranche's display name is issuer + coupon + maturity
    (`KRLN 4.75% 2031`), a loan issuer + margin + maturity (`KRLN L+350 2029`), a bill issuer +
    tenor, a sovereign the same. `ui/objects/tranche.tsx:50` currently labels with the internal id.
    One naming function in `domain/instruments.ts`, used by the UI, the news and every trace.
15. **Search by asset, price and spread together** (rules 26, 27). `ui/objects/tranche.tsx:50` is
    `searchable: false` — make bonds, loans, CP and bills searchable by class and by issuer. Every
    fixed-income view shows PRICE and DM/OAS side by side (needs step 13). Fix the UI unit errors the
    audit found while here: `commodity.tsx:37` and `fx.tsx:29` render an absolute move with
    `pctLevel` (a $2 move prints "200.0%"), `:39` prints an 0–100 field as "4800%",
    `macro.tsx:79` shows home ownership as "0.6%", `:63` reports a permanent 0.0% current account,
    `all.tsx:46` guesses a unit by magnitude, and `formatters.ts:97,150,163,178` render NaN as
    `$0.00` / `0.00%` / `100.00% Par`. Unify the two calendars (`formatters.ts:7` vs
    `ui/calendar.ts:5` differ by a year). `statements.tsx:174` calls engine interning in render —
    stop it.
16. **A tap, not a new facility** (user). An issuer that wants more of the same debt REOPENS an
    existing tranche: face is added at the week's clearing price, the proceeds are the price × the
    added face, and holders of record are unaffected. This replaces the proliferation the audit kept
    finding (`overdraft-sweep.ts:158` writes a fresh hardcoded 350bp facility per sweep;
    `tranches.ts:355` has a bare 350 fallback). Requires step 13 (a tap prices off a real price).
17. **Derivatives are centrally cleared** (user). Today a contract is bilateral (`contract.ts:39-41`,
    parties `a`/`b`) and `initialMarginRate` is 0 for every class — uncollateralised. Novate every
    contract to the region's CCP: each side faces the CCP, initial margin is posted TO it, variation
    flows THROUGH it, and a default is its waterfall (IM → default fund → mutualisation) rather than
    a bilateral close-out. Capacity becomes a clearing-member limit, keeping rule 14. Then the market
    view is open interest, margin held and net position per member, by class — the "stats on the
    derivative markets overall" the user asked for. While here: the close-out replacement values are
    undiscounted (`irs.ts:47`, `cds.ts:69`) and a credit event pays a REGIONAL AVERAGE recovery
    (`cds.ts:58` + `derivative-lifecycle.ts:122`) instead of the estate's own workout on that issuer.

### PART III — NOTHING IS BOUNDED (rule 2)

18. **Delete every bound whose mechanism already exists.** The audit's inventory, each to be deleted
    or replaced by the real decision: `evolution.ts:230` (tax rate [0.10,0.50]), `:266-267`
    (hysteresis), `:323-328` (the whole invented consumer-confidence index, four invented
    coefficients, an equity return clamped ±0.5 and the index clamped [30,170]), `:830-855` (the
    Taylor rule's four bounds), `:1416,1424,1427` (commodity yield loss, drift and a 0.5 spot floor),
    `:1443`; `07b:110-119` and `07d:86-88` (credit duration clamped after a magic 0.75/0.7 factor —
    derive Macaulay duration from the ladder's own cash flows); `stage08-back.ts:970` (a payout ratio
    whose clamp makes a whole patience cohort pay out exactly 100%), `:1961` (a ten-employee floor),
    `:2029` (an invented book value with a 0.5 floor), `:1774` (a reservation floored at the print);
    `institution-profiles.ts:66,76` (hurdle [0.02,0.30]); `prime-brokerage.ts:52` (haircut floored at
    0.01 → 99× leverage); `estate-resolution.ts:441` (capital floored at 0, hiding insolvency);
    `bank-resolution.ts:168` (`max(0, cash)` hiding an overdrawn reserve account);
    `central-bank.ts:131,160,180` (CB share, QE pace and max stock share — real-world outcomes used
    as bounds, rule 4 as well); `double-auction.ts:116` (a 10,000-iteration guard that silently
    truncates a clearing); `weather.ts`/`evolution.ts:1409-1421` (a global 0.9 yield cap);
    `02-region-macro.ts:50`; the ±4%/week GDP-growth clamp the code itself flags.
19. **Delete the dead bound machinery and the dead boundary scaffolding.** The damper never binds —
    `runClearingKernel` stopped writing `out.damper`, so `damperBoundInstrumentIds` is permanently
    empty while `setDamperStreaks`/`rollDamperStreaks`/`packed.damperStreak`/`GameState.damperBindStreakById`,
    six adapters, `native-kernels.ts:62` and `audit/prices.ts:80` all still run. `MAX_WEEKLY_FX_MOVE_PCT`
    (`fx-market.ts:112`) has NO use site and a fifteen-line doc describing a live damper that no
    longer exists. `ledger/parties.ts` (the `isModelled` "declared boundary" registry) has zero
    importers; so do `engine2/state.ts` (~180 lines of a second unreachable world),
    `stages/register-index.ts`, and `columns/{arena,company-table,tranche-table}.ts`. Delete all of
    it, and every comment that still describes a boundary the model no longer has.
20. **Where a bound covered a missing mechanism, BUILD THE MECHANISM** (rule 2's pairing). Named:
    the estate's asset sale clears against real bidders instead of `sold × (1 − min(0.9, …))`
    (`estate-resolution.ts:213`) and peers are allocated by a bid, not pro rata to cash; the LOLR and
    every overdraft lender get real capacity (`overdraft-sweep.ts` lends with no headroom test at
    all); occupational supply gets mobility so a shortage can be relieved (`labor-market.ts:502`).

### PART IV — EVERY PRICE IS CLEARED (rule 1)

21. **A bracket can never be a print.** `financial-clearing-engine.ts:453` returns the numerical
    bracket as the cleared price whenever level-independent demand at the extreme exceeds the float
    — which the central bank (`central-bank-demand.ts:45`) and every index fund (`etf-demand.ts:43`)
    routinely produce — giving −2000 bps for a YIELD_LIKE book; `:487` gives 100,000 bps at the other
    end when demand is flat. That print becomes `comp.oasSpreadBps` (07b:271) and the curve's
    observed point (07c:512). Ration the cores and solve for where the marginal core clears; a book
    with no demand at any level is UNTRADED, not priced.
22. **Commodity spot clears.** `evolution.ts:1424` moves spot by `exp(drift + …)` with a floor;
    `07-commodities.ts` is a 16-line wrapper that does not supersede it. One writer, and it is the
    auction. The futures curve beside it is already cleared — today they are two disconnected
    representations of one price.
23. **The input price index dies into the cleared price.** `04-input-output.ts:129` sets a price
    index by formula and smooths it, a second representation of what stage 05 actually clears, with
    no cash leg and a third inventory stock behind it.
24. **Labour clears on the wage.** `labor-market.ts:587-596` applies one fill ratio per occupation
    identically to every employer, so `offeredWageIndex` has ZERO effect on hiring — paying more only
    lowers quits. Labour is rationed by posted vacancies, not cleared on price, and the comment at
    `:578` says otherwise. The ~13 bare constants in `region-macro.ts:489-621` ARE the labour
    market's answer today (rule 19).
25. **One curve owner.** `07f:461` refits `yieldCurveParams` through bills+bonds while leaving
    `zeroRates.tenor2Y…30Y` at 07c's cleared values, against 07c's own header claiming sole
    ownership — one real curve in two disagreeing representations, with consumers split between
    them. One owner refits once through all cleared points and derives every field from that fit.
26. **The remaining formula prices, deleted.** `12-portfolio:141` re-derives a bond price from the
    cleared OAS through Nelson-Siegel (a round trip that cannot return the cleared price) and splits
    P&L attribution by invented 70/30, 80/20 and 40/60 fractions that reach the user through the turn
    summary; `carryCalculator.ts:56-236` is a whole invented spread/yield world beside the cleared
    one; `stage08-back.ts:1861` falls back to deriving the CDS spread from the OAS, destroying the
    basis; `05-unit-bidding.ts:2430` runs a SECOND PD model 1,250 lines after the comment claiming
    there is one; `05-unit-bidding.ts:1182` prices the seller's floor off an invented 5% cost of
    capital and 60% LGD; `dealer-desk.ts:117` charges a stated real-market spread table as a real
    cost in five books; `front-core.ts:750` vs `capital-programme.ts:190` run two depreciation
    schedules that cannot reconcile.

### PART V — THE INSTRUMENT TELLS THE TRUTH

27. **The audit measures what it claims.** `audit/index.ts:45` omits `'W'` from the scoreboard, so
    the wires family — W1 money-wires = gross, W3 ladders, W4 "no unit sold that did not exist" —
    has no summary line (its findings do reach the violation count: 12 of last run's 82).
    `ownership.ts:70` compares `stockPrice × sharesOutstanding` against `marketCapOf`, defined as
    exactly that — a tautology that cannot fire. `prices.ts:39,49,126` only fire above 5%/10%/25%
    breach quotas, so a minority may invert seniority with a clean board; `:55` hard-codes a 40%
    recovery and a ±20pp band; `:128` tests futures against a fixed 0.8/1.25 box with no rate,
    storage cost or tenor; `:33` compares spreads over the policy rate against a spread over the
    curve. `accounts.ts:194` allows a 5% gap on an exact two-legged identity. Every audit tolerance
    is declared in `stated.ts` or derived.
28. **The harness's own defects.** `harness.ts:2430` subtracts `bs.businessLoanBookUSD` /
    `consumerLoanBookUSD`, fields deleted when the loan books became reads — `c` is `any`, so the
    residual is `NaN` every bank every week and the per-bank identity check **has never fired**.
    `:2600` reads book-weighted regional averages for the capital and NIM bands, so a minority of
    banks below the floor can never report — iterate the named banks. `:592` computes a central-bank
    identity and `void`s it. `:296` skips any class with zero outstanding (a claim against a retired
    ladder passes vacuously). `:802` NaN purity covers 12 fields and no holdings, prices, accounts or
    derivatives. `:2690` skips every firm born mid-run. `:1721` re-derives depreciation as
    `grossPPE/12` rather than the engine's schedule.
29. **The gates actually gate.** `check-hygiene.sh:110`'s fraction ratchet drops whole lines
    containing `toFixed(` — the tree's commonest idiom — so the budget cannot see them; `:36`'s
    asset-switch pattern matches only a literal on the right, so `'EQUITY' === x` or `.includes(x)`
    lowers the count without removing a switch; `:56`'s test-purity grep is narrow enough that two
    tests already import `src/engine/*`. `eslint.config.js:6` names `no-floating-promises` and
    `no-unnecessary-condition` as paid-for rules and configures neither (no `parserOptions.project`)
    — the latter is exactly what would have caught step 28's NaN. Turn them on and pay the ratchet.

### PART VI — THE PRIMITIVES FALL (rule 19)

30. **The registry of every stated number.** `stated.ts` declares 11 values; the tree carries ~301
    module-scope numeric constants plus object-literal ratio bags. Walk it area by area: each
    constant is TECHNOLOGY, PREFERENCE or POLICY (keep, declared) or SHAPE/OUTCOME (declare with an
    owner and a scheduled death, or derive it now). The scoreboard is the registry's count and it may
    never rise.
30b. **The overnight sleeve is a decision, not a half.** `repo-clearing.ts:320` offers
    `institutionSpendableUSD × CASH_SLEEVE_OVERNIGHT_SHARE (0.5)` to the overnight market for
    EVERY institution — an insurer, a pension fund and a money fund alike — and since step 7 that
    share decides how much real money leaves the banking system for the central bank's window
    every week. It is the largest single stated shape still moving cash. The sleeve is a liquidity
    decision: what an entity must be able to pay this week, from its own commitments and its own
    preferences, not a flat half of the balance. Named cost at HEAD: bank NIM compression (X1
    9/16 weeks, a EUR NIM-out-of-band line).
31. **The real-world equilibria die.** `macro/initialization.ts:318` (`HOUSEHOLD_DEBT_RATIOS`, whose
    own comment reads "RULE 4: observed household balance-sheet ratios"), `:287-296`
    (`BANK_BALANCE_SHEET_RATIOS`, including a central-bank balance sheet at 44% of GDP — rule 4 names
    a fixed CB share as the forbidden class), `:239-241,280-284,297-301,305,323`, `:105-106`;
    `pricing.ts:38` (per-sector growth and vol, read LIVE every quarter at `stage08-back.ts:1948` to
    manufacture a three-analyst consensus from hard-coded 0.96/1.08 multipliers — rule 23 as well);
    `companyGenerator.ts:19` (a ratings→fixed/floating mix), `:575` (insurer reserves and "2-and-20"),
    `:554` (real benchmark names as values); `bootstrap/firms.ts:130,153-160,335-350`;
    `bootstrap/national-accounts.ts:73,93`; `labor-and-wages.ts:29,38-44`;
    `industry-registry.ts:1283-1310` (a labour share documented as output-weighted and computed as an
    unweighted mean over 37 sub-units — it sets every base wage).
32. **Rule 17's remaining violations.** `05-unit-bidding.ts:1430,1475,2288` switches on the product id
    `passenger_vehicles` with a hardcoded durable-stock model (and `:906` on
    `commercial_rental_services`); `companyGenerator.ts:400-418` maps Financials and Banks to
    `SoftwareDigitalServices` to size their revenue, and `:38-59` keeps a 14-arm category switch with
    hand-set income shares beside its registry-derived successor; `industry-registry.ts:1027-1047`
    hardcodes capex and linkage ids with `!`, so a new capital good silently misses its view;
    `assets/index.ts:173` tests `'MMF_SHARE'`, absent from the `HoldingType` this module owns.

### PART VII — MEASURE ONCE (rule 12)

33. **The long run.** Only when 1–32 are done: `WEEKS=60 SHOCKS=1` (`npm run verify`), the batteries,
    the burn-in convergence gate. Then the standing measurements: the 1e-8 week-1 drift bisected one
    dump per step; the level and the unemployment ratchet; the state-growth drift on device; UK/EUR
    bank margins; logistics scale. A number that is still wrong here is a missing mechanism named at
    last, not a tuning target (rule 18).

## 4. THE GATES

| Command | Cost | When |
|---|---|---|
| `npx tsc --noEmit`, `npm run build` | seconds | always, before every commit |
| `npx eslint src scripts test --no-warn-ignored --max-warnings 354`, `npm test` | seconds | always; both ratchet (may fall, never rise) |
| `bash scripts/check-hygiene.sh` | seconds | always |
| `PROFILE=1 WEEKS=4 npx tsx scripts/harness.ts` | ~30 s | a profile is not a run; allowed any time |
| `WEEKS=2 SHOCKS=0 VERBOSE=1 npx tsx scripts/harness.ts` | ~50 s | the probe before the one run, for a settlement-touching step |
| `WEEKS=13 SHOCKS=0 VERBOSE=1 NODE_OPTIONS=--max-semi-space-size=64 npx tsx scripts/harness.ts` | ~5 min | **THE ONE RUN per commit** (rule 25) |
| `WEEKS=60 SHOCKS=1` (`npm run verify`) | ~25 min+ | **END OF PROJECT ONLY** (rule 12; step 33) |

`--max-semi-space-size=64` is worth 7.5%; past ~14 weeks add `--max-old-space-size=10240` (16 weeks
OOMs without it). `UNIVERSE_SCALE<1` is iteration speed only — the rule-19 invariance test FAILS on
the current world. A 10-week probe samples ONE season; price behaviour is judged on whole years.
Dump/diff: `STATE_DUMP=<f> STATE_DUMP_WEEK=<n>`, then `DIFF_STATE=a.json,b.json npx tsx scripts/harness.ts`.

**Instruments, env-gated** (adding one the next run carries free beats a run of its own): `FP`,
`STAGE_TRACE`, `BANK_IDENTITY_TRACE`, `COMPANY_STORE_AUDIT`, `TRANCHE_SYNC_CHECK`,
`HOLDINGS_SYNC_CHECK`, `OWN_TRACE`, `W2_TRACE`, `SPLIT_TRACE`, `WIRE_TRACE`, `DESK_TRACE`,
`PNL_TRACE`, `DEFAULT_TRACE`, `LABOR_CAUSES`, `SEED_BURN_IN`, `COUPON_TRACE` (accrued / paid / owed per week
by instrument type, and the desks' slice of each). The burn-in probe carries `open estates` in
every run — it only falls when a workout finishes.

## 5. LESSONS — DO NOT RE-LEARN
Numbers are the original record's and never change; the full text is in git at `79c239b`.

**Method.** §7.4 the seed must open in the shape the engine produces (cited 91×). §7.222 permute the
loop order and hash the world — that is what "order-independent" means. §7.226 read the run's TOTAL,
not its first twenty weeks. §7.229 a rule with nowhere to live ends up locked in a stage. §7.241 what
wrong code still compiles is the question. §7.246 one wrong-signed factor cost CPI ×2.71.
§7.288/§7.289 three standing issues fixed in one pass, and the reference to judge against. §7.301 the
first full-pipeline reference found a three-defect regression the bisection named. §7.305 do not move
the goalposts: state the forecast and the measurement that kills it (rule 23). §7.307 run the
reckoning, do not reason about it. §7.345 the burn-in is an instrument — the engine at its own fixed
point found six rules wrong on their own terms. §7.370 three firms differing at the eighth digit at
week 1 became a 13% price gap by week 13: a 1e-8 is never "just rounding". §7.373 an audit can print
a leak that is its own; a unit threshold in a shard merge dropped shares as if they were dollars.

**Money and ownership.** §7.230/§7.242/§7.275 `post()` is the one write path; a movement with no
counterparty is a defect. §7.250 four post-08 stages wrote bank sheets to a DEAD channel — the banks'
bills never accreted and write-offs never landed. §7.259 a residual paid for in cash AND charged to
equity as a phantom fee. §7.263 `comp.cash` has ONE mover: settlement. §7.286 the issuer pays holders
directly; bank issuers are excluded because their paper is the wholesale roll's. §7.248 a pledge must
follow the paper ON THE BOOK, not last week's scalar. §7.362 a week's money settles inside the week —
three cycles, because a day has more than one. §7.377/§7.384 a balance is an ACCOUNT, not a field. §9.1 a desk's RECEIPT is income and needs
its P&L write; only the principal legs beside it are asset swaps that need none. §9.3 a guard on
a ledger walk measures FLOAT NOISE, so its tolerance is relative to the quantities the walk
touched — a fixed number of dollars is either a real threshold or useless. §9.3 again: two of
the four truncations were covering live minting callers, and the guard is what named them. §9.5 a
run-off that sells a fixed SHARE of what is left never terminates — a disposal is a programme
with a last week, and an instrument that counts what is still open is what shows the difference.
§7.372/§7.373/§7.374 market cap, total debt, the loan books and total assets are READS.

**Stores and performance.** §7.311/§7.313 the rows are the ladder's authority; the object arrays are
a view materialized once. §7.315 the same for holdings, and it settles cost-neutral — measure, do not
assume. §7.303/§7.304 the strangler port, bit-exact at every step. §7.307/§7.317/§7.321/§7.325 the
back kernel is seam→core→post and the transport's design law is: measure the barrier before
rebuilding it. §7.326 the clone transport ate the win — SAB-back a new store or ship nothing (rule
24). §7.309 a growth path that does not copy wipes the store. §7.327 killing per-pair map pressure
was worth −89 ms/wk. §7.335 WebView has no SharedArrayBuffer; the TWA is the correct shell. §7.380
the week cost rises every week — the state-growth drift is real and unexplained.

**Markets.** §7.16/§7.21 read the clearing engine before touching a book. §7.21/§7.75/§7.130/§7.132 a
bound is not a price — recorded four times before rule 2 became absolute. §7.77/§7.82/§7.189 auction
the currency being SOLD; one defect, both directions, invisible to sign checks. §7.194 the swap's
floating leg is the compounded overnight print. §7.208 one party-keyed ledger for the sovereign
coupon calendar. §7.241 a mark leg that never pays is a book whose whole life collects nothing.
§7.337 a derivative is a CONTRACT, a class is its PROFILE, capacity is ONE budget. §7.382 one stage,
one standing index, byte-identical — 9.0 → 5.5 s.

**Behaviour and the world.** §7.122 a firm that sells nothing still BUYS. §7.138 the measured year is
the review's horizon. §7.158/§7.177 a shape parameter STANDS IN for a missing mechanism — deleting it
first makes the model wrong, not more bottom-up; the order is forced (rule 2's pairing). §7.165 a
field named USD is not a share. §7.181 people age; the seed's age structure is the stationary
distribution of its own birth rate. §7.238 seven pure rule objects, and the kernel's line count ROSE
— that is the point. §7.247 a self-referential growth signal is a shed driver. §7.344 two preference
primitives on every deciding entity; every threshold they parameterise becomes a median, not a rule.
§7.346 news is DERIVED — a story with no traceable cause is decoration. §7.347 behaviour switches
move into registries; lookups stay (rule 17).

## 6. WATCHLIST — measure, do not fix
| Metric | Why |
|---|---|
| The money family (M1–M7) and "the money that is not anyone's" | Clean every run until §9.9, which left M6 grazing its band in 1 week of 16 (2.69B against ~2.5B of tolerance) while every other check stays clean and nothing is unowned. Bisect it when step 27 puts a real band on M6; a line here is otherwise a defect at its site. |
| The 1e-8 week-1 drift (§7.370) | Three firms differ at the eighth digit at week 1; 13% price gap by week 13. Bisect by file, ONE dump per step. Watch it to zero; never widen a tolerance for it. |
| The state-growth drift (§7.335, §7.380) | Weekly cost +45% over weeks 5→80 on two independent device runs, all stages inflating proportionally. First suspect: the contract book's row growth. |
| TGA over a quarter; occupational mismatch; top-down vs bottom-up household income; the private tier that sells nothing; loan-book Spearman noise | Watch the TGA's LEVEL not its shape; mismatch is composition outrunning retraining; `estimatedHouseholdIncomeUSD` is still the anchor; ~300 seeded private firms per region carry `productLines: []`; Spearman 0.26–0.76 at 23–32 names — re-measure as the universe grows. |

## 8. THE AUDIT IN FULL — every finding, by area

**Why this is here (user, 2026-09-02: "expand the points with the full results of the audit to
avoid duplicate work").** §3 carries the material findings as ordered work; this section carries
the WHOLE sweep so no one re-derives it. It is a RECORD, not a second work list — §3 remains the
only list, and a finding here that is not yet a step becomes one at its logical place when picked
up. **These findings are as the reviewers wrote them and were NOT re-verified**, except where §3
says a lead check confirmed them; treat an unconfirmed one as a lead with a file:line, not a fact.
At least one sweep finding was measured WRONG on a check (`MAX_WEEKLY_FX_MOVE_PCT` was reported as
a live damper and is in fact a dead export — see A8/A1), so verify before you change code.

**Step → area index.** 1, 11, 18, 26 → A4 · 2, 3, 4, 27 → A2 · 3, 19 → A3 · 11, 18, 30, 31 → A1 ·
13, 18, 21, 25, 26 → A5 · 8, 26, 30 → A6 · 5, 6, 7, 9, 18, 30 → A7 · 10, 11, 22, 23, 24, 32 → A8 ·
17 → A9 · 11, 12, 30, 31, 32 → A10 · 15, 28, 29 → A11.

### A1 — Macro, bootstrap, the stated-number surface, and the pipeline core

**CRITICAL**
- `src/domain/stated.ts` (whole file) + FINALIZATION step 12 marked **DONE** — the registry holds **11** declarations
  and is imported by NOTHING outside itself and its test. The tree carries **301** module-scope
  UPPERCASE numeric constants (domain 101, engine 186, stages 85, bootstrap 43, macro 32) plus
  object-literal ratio bags that this count misses. Rule 19's scoreboard therefore measures ~4% of
  the surface it claims. Step 12 is a false completion. Fix: either de-mark step 12 or re-scope it
  to "the registry exists"; the count must name what is still outside it.
- `src/engine/macro/initialization.ts:318` — comment reads literally **"RULE 4: observed household
  balance-sheet ratios"**: `HOUSEHOLD_DEBT_RATIOS = { creditCardToIncome .075, otherConsumerLoanToIncome .133,
  mortgageToIncome .90, depositsToIncome .65, equityHoldingsToIncome 1.8 }`. Real-world equilibria seeded
  as primitives, acknowledged in place, undeclared in the registry. Rule 4 + 19. Fix: declare with a
  scheduled death, or derive from the cohort accumulation that now exists.
- `src/engine/macro/initialization.ts:287-296` — `BANK_BALANCE_SHEET_RATIOS` seeds eight sector aggregates as
  shares of GDP, incl. `centralBankBalanceSheetToGdp: 0.44` and `centralBankReservesToGdp: 0.060`.
  Rule 4 names "a fixed CB market share" as the forbidden class exactly. Undeclared. Same file:305
  `INSTITUTIONAL_SECTOR_RATIOS`, :239-241 participation .63 / non-employable .36 / unemployment .045,
  :280-284 debt/GDP 1.0, deficit 5%, gov employment 5.5%, :323 savings rate .065, :105-106 home price
  4.2x income and ownership .62. Fix: one registry entry each with the mechanism that kills it.
- `src/engine/simulation/stages/12-portfolio-and-positions.ts:163-164, 188-189, 455-456` — P&L attribution is
  split by invented fixed fractions (70/30 bonds, 80/20 loans, 40/60 options) and reaches the user
  through the turn summary (`13-news-and-turn-summary.ts:55-56`). A fabricated decomposition presented as a
  measurement; the real split is computable from the rate move and the spread move. Rule 3/9/13.

**MAJOR**
- `src/domain/fx-market.ts:112` `MAX_WEEKLY_FX_MOVE_PCT = 8` — the source comment says it binds 9-28 weeks
  per pair over 60 and that "the rate being published is the damper, not a clearing level" (rule 15,
  named there for the third time). §6.1 was emptied on the promise that every damper became a
  FINALIZATION step, but step 23 lists only equity small-cap, corp bond, stock loan and CP. **The FX
  damper is in no step.** Fix: add it to step 23 (or its own step) with the oversized one-way float as the target.
- `src/engine2/stage08-back.ts:1948-1958` — next-quarter "3-dealer forecasts" are `actualEps × (1 + sec.growthRate/4)`
  scaled by hard-coded 0.96 / 1.08 / 0.98 / 1.02 / 1.06, and the consensus is their mean. Three fabricated
  analysts, an imposed dispersion, and (§1.23) a forecast with no falsification test — while §5-BRAINS
  now gives every deciding entity real preferences. Rule 13 + 19 + 1.23.
- `src/engine/pricing.ts:38-45` `SECTOR_GROWTH_AND_VOL` — per-sector growth rates and vols (Tech .12/.28,
  Energy .04/.32, ...) are real-world equilibria, and `sec.growthRate` is read LIVE every quarter in the
  kernel above, not just at seed. Rule 4. Fix: growth is the firm's own history; vol is the cleared print's.
- `src/engine/macro/evolution.ts:323-328` — consumer confidence is a reduced-form invention: an equilibrium
  with four invented coefficients (150, 200, 80, 1000), a 0.08 reversion, a 0.05 equity term, an equity
  return clamped to ±0.5 and the index itself clamped to [30, 170]. Rule 2 (two clamps) + 19. It then
  drives migration attractiveness (:1002 area) and consumption. Fix: confidence is an outcome of the
  cohorts' own income and employment experience, not a walked index.
- `src/engine/macro/evolution.ts:830-855` — the Taylor rule clamps the output gap to ±0.10, the inflation gap
  to ±0.10, the target to [ELB, 0.20] and the policy rate to [-0.01, 0.20] twice over. The administered
  rate is rule 1's one allowed posted rate, but the bounds are rule 2 clamps on a mechanism's output.
- `src/engine/macro/evolution.ts:230` — the effective tax rate is clamped to [0.10, 0.50] with a `0.25`
  NaN fallback; the drift is `-stance × 0.001` per quarter. Rule 2 + an undeclared shape.
- `src/engine/macro/evolution.ts:1008-1016` — the housing block's comment says the 400,000 stated level was
  deleted, but `|| 400000` survives three times as the index denominator and the stored baseline.
  Rule 11 (the comment is now false) + an undeclared stated level.
- `src/engine/macro/evolution.ts:997-1005` — the house-price walk counts each tier's buyers as
  `tier.households × turnoverRateAnnual/52`, i.e. demand is the same turnover rate that generates supply,
  applied to every tier including those that can afford nothing. The marginal buyer is found against an
  imposed quantity. Rule 13.
- `src/engine/simulation/stages/12-portfolio-and-positions.ts:134` — `totalCorpBondPrincipalOutstanding` is
  computed and never read: a full `filter + reduce` over every company's ladder, per position, per week.
  Dead code and a real cost. Fix: delete the line.
- `src/engine/macro/evolution.ts:828` — `const rStar = region.neutralRate; // US: 1.00%, UK: 0.75%, EU: 0.50%, JP: -0.25%`.
  The values are stale (the rate is derived in `bootstrap/yield-curves.ts:36` from productivity + target) AND
  the comment is a table of real-world neutral rates sitting in a committed artifact. Rule 4 + 11.
- `src/engine/macro/initialization.ts:258-266` — `CORPORATE_TAX_RATE_BY_REGION` is defended as POLICY (fair,
  rule 4 admits a tax rate), but the comment justifies each number by the real-world jurisdiction it copies
  ("US federal 21% + state average", "the UK's 25% headline"). The per-region DIFFERENTIAL is the
  real-world equilibrium, not the rate. Same file:307-315 `GOV_DEBT_TENOR_WEIGHTS`, justified by
  "the real treasury mix runs 15-25% bills".
- `src/engine/bootstrap/private-firms.ts:72-76` — `NAMED_TIER_REVENUE_SHARE .6`, `PARETO_ALPHA 1.16`,
  `SPONSOR_STYLE_SHARE .4`: §5-DIST-P names the first two as dying with DYN; the third is undeclared and unnamed.
- `src/engine/bootstrap/national-accounts.ts:73, 93` — `HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT .13` and
  `GOV_PROCUREMENT_SHARE_OF_SPENDING .35` are factor/spending shares, i.e. outcomes the model produces. Rule 19.
- `src/engine/macro/initialization.ts:297-301` — `NIM_TO_POLICY_RATE_RATIO .55`, `NIM_FLOOR .008`,
  `BANK_CAPITAL_RATIO .13`, `LOAN_LOSS_PROVISION_RATE .008`. A NIM floor is a rule-2 floor on a margin the
  bank's own book produces; the others are outcomes.
- `docs/MASTER_PLAN.md:1313` — §5-DIST-P says the registry holds "eight declared"; it holds eleven. The
  scoreboard that may never rise is quoted stale.

**MINOR**
- `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:128` and `07c-sovereign-bond-clearing.ts:165`
  each define a private `clamp()` helper — duplicated, and the name is the thing rule 2 forbids (07c:184
  uses it for `MAX_INFLATION_TILT`). Assigned to the credit reviewer to judge on merit.
- `scripts/harness.ts` holds 120 of the tree's 180 `any` annotations; `src/engine/companyGenerator.ts` 9.
- `src/engine/macro/evolution.ts:224` — `(region as any).lastWeekNominalGdpUSD` twice: a field read through
  `any` rather than declared on `Region`.
- `src/engine/macro/evolution.ts:352, 364` — `Math.max(1, ...)` on population and government employment is
  arithmetic (a count cannot be zero), fine, but sits among real clamps and reads the same.

**NOTES**
- The payment-reason surface is CLEAN: all 90 real `pay()`/`wire()` reasons classify under
  `ledger/payment-category.ts`; the 11 "unclassified" strings a naive grep finds are the `reason:` prose
  fields of `domain/stated.ts` declarations, not payment reasons.
- `bootstrap/yield-curves.ts` is honest: the neutral rate is productivity growth + inflation target, the
  curve seed is admitted as seed-only. `TERM_PREMIUM_SLOPE/CURVATURE/LAMBDA` and `CONVERGENCE_EXPONENT 0.6`
  are undeclared shapes but each carries its reason.
- `RATING_OAS_SPREADS` is DERIVED geometrically (`pricing.ts:16-24`) from a CCC base and a notch decay, not a
  copied spread table; it is used at seed and as an index fallback only. Rule 4 clean.
- Regulatory constants (`BASEL_MIN_LEVERAGE_RATIO`, `LIQUIDITY_COVERAGE_RATIO`, the runoff rates,
  `SPREAD_RISK_CAPITAL_PER_DURATION_YEAR`, `MORTGAGE_DSTI_LIMIT`, the payroll/consumption tax rates,
  `UNEMPLOYMENT_REPLACEMENT_RATE`) are the class rule 4 explicitly ADMITS. Not findings; still undeclared.
- Zero `Math.random()` in the engine; zero TODO/FIXME/HACK/XXX in the tree; only 3 non-null assertions.
- Baseline gates at HEAD 79c239b: `tsc` 0 errors, ESLint 347/354, hygiene pass, 125/125 tests.


**MAJOR**
- `src/engine/simulation/core.ts:214, 220, 232, 236, 254, 320, 343, 348, 385` (15 call sites) + `src/engine2/company-store.ts:205`
  — the **company sync mesh**. Every `Company` field also lives as a store lane (~108 lanes across
  F64/BOOL/STR); core.ts re-syncs 16 named fields at 15 hand-placed points plus 28 more in two loops.
  Which field must be synced after which stage is knowledge held only in those lines. Rule 3: two
  representations of one real thing, reconciled by hand.
- `src/engine2/company-store.ts:264-306` — the audit that guards that mesh **only prints**. It collects
  stale fields per stage and `console.log`s them at `13-news-and-turn-summary`, under
  `COMPANY_STORE_AUDIT=1`, off by default. It never throws and never fails a gate — unlike the ladder
  and holdings stores, whose checks are real assertions (`core.ts:421-422`). A forgotten sync is
  therefore silent in every normal run, which is how §7.372's NaN lane got in. Fix: make it assert,
  and run it in the harness rather than behind an env flag.
- `src/engine/simulation/core.ts:157-161` — under `COMPANY_STORE_AUDIT=1` the `run()` wrapper returns
  before the profiling branch, so the audit and `PROFILE=1` are silently mutually exclusive. Minor in
  effect, but it means a profiled run is never audited.

**MINOR**
- `src/engine/simulation/core.ts:314` — `applyPendingCorporateActionSettlements(ctx)` runs INSIDE the
  `hc-lifecycle` stage closure, so STAGE_TRACE attributes the paying agent's reads and writes to
  hc-lifecycle and the profiler charges its time there. It is a stage; give it a `run()`.
- `src/engine/simulation/core.ts:167` — the `ALIAS_TRACE` block sits in the `finally` of EVERY stage and
  tests `process.env` each time, to act on one stage name.
- `src/engine/simulation/core.ts:191-207` — the `MINT_STAGE_TRACE` instrument stores its previous total
  on `globalThis`, so two engines in one process share it.

**NOTES**
- The stage ORDER is the strongest part of the file: every placement carries the reason it is there
  (labour before the income it generates; borrow located before the equity book; bills accreted before
  the fiscal stage redeems them; three settlement cycles with the third catching post-close payments).
  I found no stage reading a field a later stage writes that is not annotated as deliberate.
- `ctx.bankSheetChannelClosed = true` after stage 08 is a real guard, not a comment.
- `shared-helpers.ts:176 creditRecoveryRate` is CORRECT: a 0.40 prior shrinking toward realised
  recoveries as experience accumulates. Not a rule-4 import. But `engine/pricing.ts:68, :178, :254`
  take `recoveryRate = 0.40` / `0.65` as silent DEFAULT parameters, so a caller that omits the argument
  bypasses the region's realised experience without saying so.

### Lead verification of other reviewers' critical claims (checked against the source and the last run's log)

- **W family missing from the scoreboard — CONFIRMED, with the precise scope.** `audit/index.ts:45`
  `families = ['M','O','P','X','F','N']` omits `'W'`, while `FAMILY_WORDS` (:38) defines it and
  `auditWeek` (:33) runs `auditWires` every week. Scope correction: W findings DO reach the harness's
  violation stream (`harness.ts:2406-2408`), so they count in the headline total — in the last run
  (`s13v-13.log`) W2 is 12 of the 82 violations, split over four message families. What is lost is the
  scoreboard's per-family view: the section that claims to be "the closed-model scoreboard" prints six
  of seven families, so W1 (money-wires = gross), W3 (ladders) and W4 (**"no unit sold that did not
  exist"** — the goods-mint instrument) have no summary line at all.
- **The goods mint is deliberate and instrumented, not a hidden clamp** (`ledger/goods-ledger.ts:92-99`):
  it records `mintedUnits` so W4 can name it. But W4 is exactly the check the scoreboard never prints,
  so the instrument that owns the mint is the one with no summary line. That pairing is the finding.
- **O2 "market cap = price × shares" is a tautology — CONFIRMED.** `audit/ownership.ts:70` compares
  `c.stockPrice * c.sharesOutstanding` against `marketCapOf(c)`, and `domain/company.ts:809` defines
  `marketCapOf` as exactly `c.stockPrice * c.sharesOutstanding` under the same positivity guard. The
  check cannot fire. (The other half of O2, shares held ≤ issued, is real and does fire.)
- **`debitRow` silently truncates — CONFIRMED.** `ledger/holdings-ledger.ts:79-103`: the walk takes
  `min(left, row)` per row and leaves any remainder with no defect and no residual, while
  `transferHolding:114` has already wired the FULL spec quantity through `wireHolding`. `retireTranche`
  defects on exactly this case; this path does not.
- **The underwriting residual is delivered twice — CONFIRMED.** `primary-settlement.ts:147-150` moves the
  residual to `leadDesk` (`{kind:'BANK_SECURITIES', ticker: lead.ticker}`), then `:155-159` moves the
  identical spec to the identical party again, unconditionally, with a different reason string. Neither
  writes a register row — `holderIdOf` (`holdings-ledger.ts:44`) resolves only `INSTITUTION` — so both
  calls are pure WIRES off the clearing house. That is the exact shape of the W2 finding the last run
  reports 12 times ("region-kinds leave the clearing house holding paper"), which the plan's watchlist
  currently carries as unexplained dust. **Named suspect for a standing watchlist item.**
- `ledger/holdings-ledger.ts:46-49` — `priceOf` returns `priceUSD = 1, quantity = valueUSD` whenever
  `shares` is absent: the par convention, at the wire layer, for every credit movement. [13c-site]

### Lead verification: the CP coupon that is never paid (stage 08's CRITICAL) — CONFIRMED AND SIZED

The chain, read end to end:
1. `engine2/front-core.ts:527` — `trancheWeekAccrual` sets, for commercial paper, `due = (maturityWeek === week)`.
   CP's ONLY due week is its maturity week.
2. `engine2/stage08-back.ts:1143` — the per-tranche register walk opens with
   `if (TS.maturityWeek[tr] === nextWeek) continue;` — it skips the tranche in exactly that week.
3. `engine2/stage08-back.ts:1157` — `if (acc.due) payHoldersAccruedInterest(...)` is the ONLY call site of
   `payHoldersAccruedInterest` in the tree (verified by grep; the function is defined at
   `shared-helpers.ts:731`).
⇒ For CP, `acc.due` can never be true. Interest is accrued to holders every week by
   `accrueHoldersInterest` (:1156) and **never paid**. `07f-short-debt-clearing.ts:764-772` redeems matured
   CP at principal only — there is no interest component anywhere on the redemption path.
The same skip costs every fixed/floating tranche its FINAL coupon whenever the term is a whole number
of payment periods (`due = since % periodWeeks === 0` lands on the maturity week).

**Size, from the existing week-13 dump (no new run — §1.25):** 2,052 live CP tranches, **44.19B** of face,
coupons 3.91%–9.79%, **1.845B/year = 35.5M/week** accrued to holders and never settled — about **0.46B
of holder claims over the 13-week reference**, against a W2 dust line the watchlist tracks at ≤0.03B.
The issuer's P&L is symmetric here (the front walk skips the same week, `front-core.ts:561`), so the
defect is an unsettled holder claim rather than a mint — but it is a one-sided flow (rule 14) of real size,
and it is the largest single defect this sweep found.

### A2 — The ledgers, the audit, the column stores

Files: `src/engine/ledger/{accounts,wire,holdings-ledger,tranche-ledger,goods-ledger,bank-transfer,party,parties,payment-category,balance,bank-book,index}.ts`,
`src/engine/audit/{money,ownership,wires,prices,accounts,snapshot,names,types,index}.ts`,
`src/engine/columns/{table,holdings-table,tranche-table,company-table,arena,intern,kernel}.ts`.

**CRITICAL**

- `src/engine/audit/index.ts:98` — `const families = ['M','O','P','X','F','N'];` omits **`'W'`**, yet `auditWeek:86` runs `auditWires` every week and `FAMILY_WORDS:91` names W. Every W1–W4 finding (money wires = settlement gross, the clearing house nets to zero, wires reproduce the ladders, wires reproduce the goods stock, "no unit sold that did not exist") is computed, carried in the findings array, and **never printed on the scoreboard**. The whole §5-WIRES audit family is invisible in a run. Rule/lens: bug. Fix: add `'W'` to `families`.

- `src/engine/ledger/holdings-ledger.ts:79-104` (`debitRow`) — the walk takes `Math.min(leftUSD, H.qtyUSD[r])` per row and, when the holder's rows do not cover `spec.valueUSD`, **drops the remainder silently**: no `defect`, no residual, no report. But `wireHolding` (l.106-109) has already written a wire for the FULL quantity, and `transferHolding:115-117` / `retireHolding:139-141` wire before they debit. So a debit larger than the position mints paper on the receiving side (or on the wire journal) that never left the payer's book — the W2 house-net and O1/O6 then show the gap with no name. Contrast `retireTranche:74`, which `defect()`s on exactly this. Rule/lens: 1.3, 1.13, 1.14. Fix: `defect()` (or report a named residual) when `leftUSD`/`leftShares` remain after the walk.

- `src/engine/ledger/goods-ledger.ts:174-182` (`settleOutputInventory`) — `held = initial + arrived − contract − market`; when `held < 0` the stock is written as `Math.max(0, held)` and the shortfall is booked as `mintedUnits`. This is a floor on a physical stock: units that never existed are sold, the buyer's lots receive them, and the money leg was already paid. Rule/lens: 1.2 ("never clamp the symptom"), 1.13 (a residual with a size but no owner and no scheduled closing slice). Fix: the shortfall must ration the sale at settlement (or `defect`), not be minted after the fact.

- `src/engine/ledger/accounts.ts:432-437` + `src/engine/simulation/stages/settlement.ts:493` — `applySettledRow` returns `false` when EITHER party has no row and applies **neither leg**: the payment does not happen at all, while `report.grossUSD += amountUSD` (settlement:498) still counts it and the wire stands, so W1 still balances. The failure is recorded as `report.accountRowsUnmapped++` — a **count, never a size**. `audit/money.ts:157` then puts that count in the `usd` field, and `audit/index.ts:110-113` sums the M-family `usd` into the headline line "the money that is not anyone's, last week: N.NNB" — adding a row count to dollars. Rule/lens: 1.3, 1.9 (a field named USD is not a count), 1.13. Fix: accumulate the unmapped USD too, report both, and make M7 report the size.

- `src/engine/audit/ownership.ts:70` — O2's second check compares `c.stockPrice * c.sharesOutstanding` against `marketCapOf(c)`, and `src/domain/company.ts:809-810` defines `marketCapOf` as exactly `c.stockPrice * c.sharesOutstanding`. The check "O2 market cap = price × shares" is a tautology that cannot fire in any world; it reads the same expression it verifies. Rule/lens: bug (an audit that does not test what its name claims). Fix: delete it, or compare against whatever second representation of market cap still exists.

**MAJOR**

- Undeclared tolerances everywhere in the audit — only `AUDIT_BOOKS_TOLERANCE = 0.02` is registered in `src/domain/stated.ts:114`. Every other pass/fail band is a bare literal: `money.ts:36` (`assets*1e-4`), `money.ts:115` (`max(1e7, assets*2e-3)` — a $1T bank may be $2B open and pass M5), `money.ts:146` (`max(5e8, money*0.005)`), `money.ts:59,60` (1e5), `money.ts:78,87,89,91,97,99` (1e6 per-firm, so a firm overdrawn by $999k is not "overdrawn"), `ownership.ts:54` (5e7 floor) vs `ownership.ts:160` (1e7 floor for the same identity), `ownership.ts:178` (`*1.001+1`), `accounts.ts:158,159,184` (1e-3 / 1%), `wires.ts:20,28,65,111`. Rule/lens: 1.19. Fix: declare each in `stated.ts` as RESOLUTION with an owner, or derive it.

- `src/engine/audit/prices.ts:55` — `Math.abs(rec - 0.4) > 0.2`: the **40% recovery assumption is hard-coded inside the audit** (the message even says "every spread is priced at 40%"), with a ±20pp band, neither declared in `stated.ts`. A shape constant living in the check that is supposed to falsify it. Rule/lens: 1.19. Fix: read the priced recovery from its owner and declare the band.

- `src/engine/audit/prices.ts:128-129` — check named "X2 futures within carry of spot" tests `ratio < 0.8 || ratio > 1.25`, a fixed ±20/25% box with **no carry input at all** (no rate, no storage cost, no convenience yield, no tenor). It does not test what its name claims, and it would pass a 3-month future 20% off spot at a 2% policy rate. Rule/lens: bug + 1.9 (a 3-month ratio judged against an unperiodised band). Fix: compute carry from the region's rate and the commodity's storage cost.

- `src/engine/audit/prices.ts:39,49,126` — P1/P2/X2 only fire when the breach rate exceeds `n*0.05`, `n*0.1`, `n*0.25`. Up to 5% of issuers may price a senior claim wider than a junior one, and a quarter of goods may differ >2.5× across regions in one currency, with the scoreboard clean. An undeclared pass quota on a structural identity. Rule/lens: 1.19, 1.15. Fix: declare the quota or report the level every week.

- `src/engine/audit/accounts.ts:194` — F3 "world exports = world imports" allows a 5% gap. Exports and imports are the two legs of the same trades (rule 1.14): the identity is exact, and a 5% band hides a one-sided leg worth 5% of world trade. Rule/lens: 1.14, 1.19. Fix: tighten to float dust on the gross.

- `src/engine/audit/prices.ts:33-35` — P1 compares `cpSpread = (cp.couponRate − policyRate)*1e4` and `facility.floatingMarginBps` (spreads over the **policy rate**) against `c.oasSpreadBps` (a spread over the **curve**). Different bases, so the seniority ordering is tested on incommensurable numbers; wherever the curve is not flat at policy, the inversion count is an artefact. Rule/lens: logic / 1.9. Fix: put all four on one base before comparing.

- `src/engine/ledger/goods-ledger.ts:125` — `deliverGoods` passes `priceUSD: Math.max(0, unitPriceUSD)`: a negative unit price arriving from a caller is silently turned into a free delivery instead of failing at the write site. `wirePush:95` would have thrown; the clamp defeats it. Rule/lens: 1.2, GUARD (`domain/defect.ts`). Fix: `defect()` on a negative price.

- `src/engine/columns/arena.ts:179-189` — `growF64`/`growI32` allocate a NEW backing array and copy; every `f64()`/`i32()` view handed out before the grow is a `subarray` of the **old** array and keeps pointing at it. A kernel holding scratch across a grow silently writes into a dead buffer. That is §7.309's wipe in a module whose whole contract is "a slice is a VIEW, valid until the next `reset`". Rule/lens: 1.24, bug. (Mitigated only by the module being unused — see MINOR.) Fix: size the arena at reset from the high-water mark and `defect()` on overflow, or return offsets rather than views.

- `src/engine/columns/company-table.ts:136` — `NUMERIC_FIELDS` still contains `'cash'`, and `syncOut():213-216` writes every column back onto the Company object (`c['cash'] = cols[f][i]`). `Company.cash` was deleted (`src/domain/company.ts:328`: "cash is a READ of the persistent account"; `ledger/accounts.ts:41-45`), so a sync would **resurrect a money field on the object outside the ledger**, initialised to 0 by `syncIn:202`. Rule/lens: 1.3, LEDGER_OWNED. Fix: drop `cash` from the column set (and see the dead-module note below).

- `src/engine/columns/company-table.ts:202` — `cols[f][i] = typeof v === 'number' && isFinite(v) ? v : 0;` — a NaN or Infinity in any mirrored field is silently replaced by 0 on the way in and written back as 0 on the way out. The harness's NaN-purity check can never see it. Rule/lens: GUARD, silent fallback. Fix: `defect()` on a non-finite value.

- `src/engine/audit/snapshot.ts:249-258` (`ladderUSDByKey`) and `src/engine/audit/ownership.ts:23-26` (o1) sum **`c.debtTranches`, the object mirror**, while `src/engine/ledger/tranche-ledger.ts` writes and `audit/ownership.ts:142` (o6) reads **`v2.tranches`, the column ledger**. W3 ("wires reproduce the ladders") therefore compares the wires the column ledger emitted against the object mirror's total: the two disconnected representations of one real thing that rule 3 names as the anti-pattern. If the mirror drifts, W3 lights up for a defect that is not in the ledger, and O1/O6 disagree by construction. Rule/lens: 1.3. Fix: W3 and O1 read the tranche rows, as O6 does.

- `src/engine/ledger/accounts.ts:405-414` — `buildAccountMirror` builds the household/pool per-bank rows only over `regionBanks = banks.filter(b => b.region === region && !b.isDefaulted)`. A sector row at a bank that defaults this week is **not in the pass store**, so `landSectorRows` (l.533-538) never writes it back and the balance sitting there is frozen — invisible to the pass, still counted by `sectorCashOf`. It thaws only if `moveSectorRowsToBank` happens to run. Rule/lens: 1.13 (a balance with no live counterparty). Fix: open a row for every bank the party actually holds at, live or not, and resolve it explicitly.

- `src/engine/ledger/wire.ts:212-213` — `issuerNetUSDByKey` counts **any** non-money wire whose `from.kind === 'COMPANY'` as issuance and any `to.kind === 'COMPANY'` as retirement. A corporate treasury selling a bond it HOLDS, or an estate moving paper firm-to-firm (`holdings-ledger.transferHolding` with two COMPANY parties), is booked as new issuance/retirement of that region's ladder. W3 then measures the ladder against a number that includes secondary corporate flow. Rule/lens: logic. Fix: key issuance off the wire's reason/ledger of origin, not off the party kind.

**MINOR**

- `src/engine/ledger/parties.ts:139-167` — the ENTIRE party registry (`PARTY_REGISTRY`, `partyModule`, `holdsDeposit`, `isBankingSystem`, `isModelledParty`) has **zero consumers outside the ledger directory**. Its docstring sells it as the fix for the 69-comparison-site problem; nothing uses it. Its `isModelled` field also documents "the declared boundary (§6's frontier list)", which §7.351 deleted. Dead + stale. Fix: delete the module or wire it into settlement.
- `src/engine/columns/arena.ts` (62 lines), `src/engine/columns/company-table.ts` (121 lines), `src/engine/columns/tranche-table.ts` (97 lines) — **no importer anywhere in `src`, `scripts` or `test`**. 280 lines of dead scaffolding carrying live-looking documentation. Rule 1.11 ("clean up as you go"). `tranche-table.ts:64` also builds from `debtTranches` objects, a third representation of the ladder.
- `src/engine/ledger/balance.ts:235-240` — `interface Account` with the comment "Nothing constructs this yet ON PURPOSE: it lands with the columnar state". It landed (`accounts.ts:AccountStore`); the interface and the paragraph above it are stale. Nothing constructs `Account`.
- `src/engine/ledger/accounts.ts:24-29` — the "FIRST SLICE — A MIRROR WITH A GATE" paragraph still describes `compareToBooks` and the legacy per-kind writes as current; `accounts.ts:557-558` says both are gone. Stale docstring.
- `src/engine/audit/ownership.ts:19,50` — `regionById` is built and then discarded with `void regionById;`. Dead code.
- `src/engine/ledger/holdings-ledger.ts:69-70` vs `src/engine2/holdings.ts:316` — two different "is this row worth keeping" tests: `keepsRow` keeps `qtyUSD > 1 || shares > 1e-6`, `pruneEmptyRows` keeps `qtyUSD > 1` only. `closeEmptyPositions` can therefore free a row that still carries shares; either way the dropped row's value goes to the free list with no wire. Undeclared $1/1e-6 thresholds.
- `src/engine/ledger/party.ts:115` — two `as any` casts (`region`, `industry`) in `partyFromKey`.
- `src/engine/audit/ownership.ts:39` — `(c as unknown as { treasuryHoldings?: … })` reaches through a cast for a field the Company type does not declare.
- `src/engine/audit/prices.ts:66` — `RATING_RANK[c.creditRating] ?? 4` silently ranks an unknown rating as BB, so a broken rating field improves the Spearman rather than failing.
- `src/engine/audit/types.ts:33` + `prices.ts:67,70` — `spearman` returns `NaN` for `n < 3` or zero variance; `rho < 0.5` is `false` for `NaN`, so a degenerate sample passes silently.
- `src/engine/ledger/payment-category.ts:216` — `liquidity shortfall`, `opening balance`, `cash absorbed` and `withdrawn refinancing` are all classified `CORPORATE_ACTION`. None of them is a corporate action; the catch-all defeats the point of the closed set.
- `src/engine/audit/snapshot.ts:229` and `src/engine/columns/kernel.ts:247` read `process.env.…` without the `typeof process !== 'undefined'` guard used in `wire.ts:126`, `goods-ledger.ts:134` etc. Inconsistent; survives only because vite defines `process.env = {}`.
- Unused exports: `wire.ts:120 hasActiveWireJournal`, `wire.ts:22 assetKindOfId`, `holdings-ledger.ts:215 bookPositions`, `accounts.ts:355 balanceOfParty`, `accounts.ts:571 partyText`.
- `src/engine/ledger/holdings-ledger.ts:160,166` — `scaleHoldings` computes an aggregate delta and hands it to `debitRow`, which drains rows greedily (first row to zero) rather than scaling each by `ratio`; the total is right, the per-row layout is not. `region` is taken from the LAST matching row.
- `src/engine/ledger/bank-transfer.ts:80` — `assumeBankBooks` adds `plan.wholesaleHaircutUSD` (a gain to the acquirer) straight onto `bankEquityUSD` rather than through `bookPnL`, so it is invisible to PNL_TRACE and to the one-P&L-write rule (`balance.ts:258`). The rest of the line is transfer arithmetic and correctly outside `bookPnL`.

**NOTES (checked, fine or already known)**

- **[13c-site]** `holdings-ledger.ts:46-49` (`priceOf`) — any spec with no `shares` is wired as `quantity = valueUSD, priceUSD = 1`. Every corporate-bond / loan / CP / gov-bond wire is therefore a **par** wire, and the "value" in `houseNetUSDByKey` and `issuerNetUSDByKey` is face. W2/W3 and O1's `held (quantityOrNotionalUSD) vs outstanding (principalUSD)` comparison are face-vs-value comparisons that agree only while credit rows sit at par.
- **[13c-site]** `tranche-ledger.ts:65,75,133` — `issueTranche`, `retireTranche` and `moveFacilityLender` all wire `priceUSD: 1` against `principalUSD`. A facility moved to an assuming bank moves at face regardless of its mark.
- **[13c-site]** `audit/snapshot.ts:239` — `sovereignOutstandingUSD` sums `principalUSD` (face) and is compared elsewhere against holdings measured in value.
- `accounts.ts:449-456` (`leg`/`side`) — verified two-sided and correct: a `BANK_CREDIT` drawdown to a borrower at the SAME bank moves the reserve row −a then +a (no reserves move, endogenous money); to a borrower at another bank it moves reserves from lender to payee bank. `RESERVES` and `VOID` rows sit at `AT_CENTRAL_BANK`/`AT_NOWHERE` so no second leg is double-counted. `centralBankIssuanceUSD` and `clearingHouseResidualUSD` are read off the VOID rows with the right signs.
- `accounts.ts:410,419` — a household/pool payment is split across banks by **market share**, not by where the party's money actually sits, so one bank's row can go negative while the party is in credit. Documented as deliberate ("the split the pools' legs always had"), but it is an imposed share standing in for a real "which account do I pay from" decision (rule 1.13). Flagging for the lead, not counted above.
- Copy-on-grow (rule 1.24) is present on **every** growth path I read: `wire.ts:81-88`, `accounts.ts:47-51` (`growPersistent`), `accounts.ts:319-326` (`grow`), `columns/table.ts:96-108` (`Table.grow`, preserves row ids), `arena.ts:179-189` (copies, but invalidates outstanding views — see MAJOR). `holdings-table.ts:152,210` reallocate `byType` without copying, which is safe because it is fully rewritten immediately after.
- SAB-backing (rule 1.24): `columns/table.ts:125-128` allocates a `SharedArrayBuffer` where the runtime offers one. `WireJournal` (`wire.ts:60`) and `AccountStore` (`accounts.ts:327`) are plain typed arrays, not SAB-backed — they were built under §5-WIRES rather than §4.C, so this may be out of 1.24's scope; naming it so the lead can decide.
- `wire.ts:95-100` — `wirePush` rejects non-positive/non-finite quantity, non-finite or negative price, and a wire from a party to itself. The NaN/negative gate on asset moves is real and throws at the write site.
- `party.ts:56-61` — the compile-loud `PARTY_KINDS` completeness check is real and does what it claims.
- `party.ts:87` — `partyRefById.push(p)` stores the caller's object; `partyOf(id)` hands that same reference back. A caller mutating a `PartyRef` after interning would change every later read. No such mutation found today.
- `audit/money.ts:35` counts `currencyInCirculationUSD` as a legitimate central-bank liability while `money.ts:53` flags any non-zero value of the same field as "a residual nobody issued". Consistent only because it is always zero.
- `audit/money.ts:70-79` — M3 says in its own comment that the line-versus-holders check "is a tautology now"; what survives (orphan cash with no live house bank) is real, but the check's name ("the trial balance") no longer describes it.
- `audit/prices.ts:78-85` — P4 reads `damperBindStreakById`, which the plan says binds 0 since NO CAPS (§7.365). Effectively a dead check, kept as a tripwire.
- `goods-ledger.ts:118` `INTERNAL_MOVE = 0` cannot collide with a real wire number: `stages/context.ts:359` starts `nextWireId` at 1.
- `bank-transfer.ts:17-61` — I checked `absorbBankSheet` against `BankingSector`'s asset/liability lines and found no line left behind on the target; deposit lines are correctly no longer fields.
- `tranche-ledger.ts:70-78,101-111` — `retireTranche` and `commitLadder` DO `defect()` on over-retirement and on dropping a row that still carries face. This is the guard `holdings-ledger.debitRow` is missing.
- `columns/kernel.ts:266-298` — `shardRanges`/`runSharded` combine in fixed shard order; the determinism argument holds. `runSharded` itself has no caller (only `runShardedVoid`, from `08-company-fundamentals.ts:550`).

### A3 — The engine2 stores and worker pools

Files: src/engine2/{tranches,holdings,lots,company-store,state,world,contracts,shared-lanes,back-pool,back-worker,front-pool,front-worker}.ts;
src/engine/simulation/stages/{holdings-store,holdings-view,register-index,register-split,context,native-kernels,clearing-worker-pool,clearing-worker}.ts;
src/engine/simulation/stage-deps.ts.

**CRITICAL**
- `stages/holdings-store.ts:74-76` — the constructor pairs `rows` (the entity's week-start
  `itemizedHoldings` objects) to `rowIds` (the persistent chain) BY POSITION, with no length or
  instrument check. `finalize()` then keeps `rowIds[i]` for unclaimed `i` (`:283`) and FREES
  `rowIds[i]` for claimed `i` (`:287`). A one-row desync between the object book and the chain
  therefore keeps and frees the WRONG register rows — ownership silently rewritten. The only
  guard is `HOLDINGS_SYNC_CHECK=1`, which runs at week END, after the damage. Lens: bug / rule 3.
  Fix: assert `rowIds.length === rows.length` (and instrRef === instrumentId) at build, `defect()` on mismatch.
- `engine2/holdings.ts:313-317` — `pruneEmptyRows` keeps a row only when `H.qtyUSD[r] > 1`: it
  tests DOLLARS and destroys SHARES. An EQUITY row whose mark fell under $1 (or any row mid-week
  before its re-mark) is unlinked with its `shares` intact, and the holder's position ceases to
  exist. `closeEmptyPositions` (`ledger/holdings-ledger.ts:212`) is called on the WHOLE book of a
  holder at `stages/estate-resolution.ts:257`, not on the estate's instrument. Rule 3 / rule 13.
  Fix: prune on `qtyUSD === 0 && (isNaN(shares) || shares === 0)`, never on a dollar threshold.
- `stages/holdings-view.ts:209-210` — `reg.institutionalSector.sectorEquityUSD =
  Math.round(view.institutionalTotalAssetsUSD)`: the sector's EQUITY is set to its total ASSETS.
  Institutions carry real liabilities (`mmfSharesOutstandingUSD` — every dollar of MMF shares is
  a named holder's money; prime-brokerage lines; repo borrowing), so this counts other people's
  money as the sector's capital. Stage 08's institutional book value and stage 02's investment
  income read it. Lens: accounting identity that cannot hold (A = L + E). Fix: subtract the named
  liabilities, or rename the field to what it is.

**MAJOR**
- `engine2/holdings.ts` free paths (`syncBookRows:118-122`, `relinkBook:191-195`, `freeBookRow:226`)
  clear NOTHING — a freed row keeps `qtyUSD`, `instrRef`, `typeRef`, `shares`. `tranches.ts:120`
  (`freeRow`) does clear its row. Any `for r in 0..used` scan of the holding store reads dead rows
  as live positions. Fix: zero qtyUSD/shares and set instrRef = -1 on free, as the tranche store does.
- `stages/holdings-store.ts:155-176` — `addShares` with a negative `shares` (the stock-loan
  delivery leg) draws from each unclaimed row without going negative, then `if (remaining < 0)
  return;` silently DROPS the undeliverable remainder. The receiving leg is a separate call, so
  shares arrive that never left. Rule 14 (both legs, same pass). Fix: `defect()` on an
  undeliverable remainder instead of returning.
- `engine2/tranches.ts:355` — `marginBps: Number.isNaN(S.floatingMarginBps[r]) ? 350 : ...`. A
  bare 350bp facility spread, not declared in `domain/stated.ts`, standing in for a price a
  market should clear; and it is a silent fallback that hides a facility written with no margin.
  Rule 19 / rule 1. Fix: carry the originated margin on the row; `defect()` if absent.
- `engine2/tranches.ts:365` vs `:374` — `facilityRowsOf` filters `principalUSD > 0.01`,
  `facilityBookOf` does not. The bank's facility BOOK total therefore does not equal the sum of
  the facility rows the same bank is shown. Fix: one predicate, used by both.
- `stages/register-split.ts:22-24` — `ROW_IS_KIND` decides a register kind from the RATE TYPE: a
  non-facility, non-CP tranche is a `CORP_BOND` if fixed and a `LEVERAGED_LOAN` if floating. A
  floating-rate note is not a leveraged loan; the two books' fills are split across each other's
  paper. Lens: real-world mechanism. Fix: carry the instrument kind as a flag on the row.
- `stages/register-split.ts:73-76` — `primarySliceOf` returns `boughtUSD * min(1, take/bought)`,
  so when demand is BELOW the take the slices sum to `totalBoughtUSD`, not `takeUSD`: the rest of
  the deal is allocated to nobody, while the doc-comment claims the slices sum to the take. Rule
  13 (a residual with no holder). Fix: the lead holds the unallocated take, explicitly.
- `engine2/back-pool.ts:176` posts `lanes: args.lanes` and `engine2/stage08-lanes.ts:127`
  allocates them as plain `new Float64Array(n)` — so the ENTIRE BackLanes struct is structured-
  CLONED to each of up to 16 workers every week. That is precisely §7.326's "the clone transport
  ate the win", and rule 1.24. `setSharedLanes` is called in only one place
  (`stage08-front.ts:139`), gated on `FRONT_WORKERS`, so `BACK_WORKERS=n` alone never gets shared
  memory. Fix: allocate BackLanes through `shared-lanes.ts` and set the mode from
  `backWorkerCount() >= 2 || frontWorkerCount() >= 2`.
- `engine2/world.ts:38-46` declares the §1.24 SAB deviation for `revRing`/`priceRing` only; the
  lot, contract, tranche, holding and accounts stores (`lots.ts:81`, `contracts.ts:70`,
  `tranches.ts:104`, `holdings.ts:78`, `world.ts:66`) are all plain-ArrayBuffer with copy-on-grow
  and carry no such note. Only `company-store.ts:95-99` is actually SAB-backed. Rule 1.24 wants
  the deviation named where it is taken. Fix: one note, or one allocator.
- `engine2/front-pool.ts:150`, `back-pool.ts:204`, `stages/clearing-worker-pool.ts:120` — a
  worker TIMEOUT (10 s / 20 s / 10 s) sets `poolUnavailable = true` permanently for the run and
  returns, with NO log at all (only the `'error'` event logs). A pool that silently dies at week 3
  and runs serial for 57 weeks looks like a slow machine. Fix: log the timeout with the shard.
- `stages/clearing-worker.ts:47-48` — `runClearingKernel(packed as never, ...)`: the worker
  rebuilds a partial `PackedClearing` and casts away the type. The pool's own comment
  (`clearing-worker-pool.ts:100-103`) admits a flag left behind "would run a DIFFERENT market in
  the worker path than in the serial one — silently". The cast is what makes it silent, and any
  field added to `PackedClearing` reopens it. Fix: build a real `PackedClearing` (exhaustive
  object literal) so a new field fails to compile.
- `stages/native-kernels.ts:29-36` — `loadAddon` swallows every error and returns null, and a
  loaded addon registers with NO version/ABI check against the JS core it replaces. A STALE
  `kernels.node` (built before a change to `runClearingKernel`/`runFrontCore`) registers happily
  and silently produces a different world; the §5-SCALE oracle gate is a process, not a runtime
  check. Fix: hash the JS core's contract into the addon and refuse a mismatch.
- `stage-deps.ts:76-89` — the tracing Proxy records a `get` as a READ and a `set` as a WRITE, so
  every field MUTATED IN PLACE (`companyUpdates`, `paymentJournal`, `wireJournal`,
  `pendingHolderSettlements`, every Map/Set/Record on the context — most of it) registers only as
  a read and NEVER as a write. `backwardEdges()` therefore cannot see the ordering hazards on the
  accumulators, and `undeclaredEdges()` "ratchets at zero" partly because it is blind. It also
  only runs under `STAGE_TRACE=1` (`harness.ts:2729`), which the standard 13-week run does not
  set — so the ratchet does not fire on the gate run at all. Rule 1.22/§7.278. Fix: record
  container access (or wrap the containers), and run the trace on the gating harness week.
- `engine2/state.ts:31-208` — `WorldState`, `allocWorld`, `snapshotWorld`, `restoreWorld`,
  `SECTORS`, `SECTOR_INDEX`, `OCCS`, `NOCC`, `NREGIONS`, `F_ACTIVE…F_INSTITUTION` have ZERO
  importers anywhere in `src`, `test` or `scripts` (only `SUBUNITS`/`SUBUNIT_INDEX`/`NSUB` are
  used). ~180 lines describing a SECOND, unreachable columnar world beside `world.ts` — rule 3's
  anti-pattern in dormant form, and it would be the first thing a future reader ports to.
  Fix: delete everything but the three sub-unit exports.
- `stages/register-index.ts:33-127` — `RegisterIndex`, `buildRegisterIndex`, `typeSlice`,
  `getRegisterIndex` and `REGISTER_TYPES` have zero callers (only `bumpRegister` and
  `getHoldingsTable` are used). Worse, `buildRegisterIndex` walks `entities[e].itemizedHoldings`,
  the WEEK-START objects, while `getHoldingsTable` builds from the persistent rows — two
  representations of the register, one of them stale and dead. `context.ts:142` still carries the
  cached field. Fix: delete the index and its ctx field.
- `stages/holdings-view.ts:122` — `institutionalTotalAssetsUSD = cash + corp + sov + loan +
  equity`, a SECOND derivation of an institution's total assets that disagrees with
  `institutionTotalAssetsUSD` (`domain/institutions.ts:208-213`, the §5-WIRES D "one answer"),
  which also adds `pendingUSD` and `stockLoanNetUSD` and uses the PE portfolio for a sponsor.
  Rule 3. Fix: sum the per-entity `institutionTotalAssetsUSD`.
- `stages/holdings-view.ts:68` — `cash += entityCashOf(...) + (e.repoLentUSD ?? 0)`. Cash lent in
  GC repo is at the BORROWER, who counts it in its own cash; the sector aggregate counts the same
  dollars twice. The field's own doc (`domain/institutions.ts:150-156`) says the cash is
  "genuinely out the door for the week". Rule 3 / double counting. Fix: count the repo claim as a
  receivable, not as cash, or net it against the borrowers inside the sector.
- `stages/context.ts:255` — `getFxToUsd: () => 1.0` is the initial value on the shared context.
  Any stage running before 06-fx-and-trade installs the real resolver converts at parity,
  silently and correctly-looking. Rule 9 (a price level is part of the number). Fix: seed it with
  a thrower, or with last week's fix.
- `engine2/company-store.ts:265-292` — `auditCompanyStore` compares `marketCap`, `totalDebt` and
  `cash` against the OBJECT fields, while `checkCompanyStore:186-188` correctly routes the same
  three through `derivedColumn`. The derived fields are gone from the object (§5-WIRES D), so the
  writer-hunt instrument reports them permanently stale and buries the real writers. Fix: route
  `DERIVED_F64_FIELDS` through `derivedColumn` here too.
- `engine2/lots.ts:127` — `pushLot(..., wireNo)` does `void wireNo`: the wire number is accepted
  and DISCARDED, while the parameter's own comment claims "a lot with no wire does not compile"
  and `tranches.ts:40` really does persist `wireRef`. §5-WIRES W4 traceability is not there.
  Fix: add a `wireRef` column, or delete the parameter and the claim.
- `engine2/company-store.ts:238-247` — `trustCompanyStore` syncs only rows appended since last
  week and never checks that row *i* is still company *i*. Any roster removal or reorder
  (`companyGenerator.ts:823` already splices at generation time) shifts every lane silently; the
  `id` lane exists but is only compared under `COMPANY_SYNC_CHECK=1`. Fix: compare
  `S.str.id[i] === companies[i].id` for a few rows (or all) on every trust call.

**MINOR**
- `engine2/tranches.ts:307-311` — in `relinkLadder`, `S.head[firmRow] = keptRows.length ?
  S.head[firmRow] : -1;` is a no-op immediately followed by the equivalent `if` on the next line.
- `engine2/contracts.ts:135-146` — `novateContracts` scans `0..T.used` including FREE rows (the
  free path at `:180-183` does not clear `supplierRef`/`customerRef`), so it rewrites dead rows
  and returns an inflated novation count.
- `engine2/contracts.ts:157` — `SUBUNIT_INDEX.get(subUnitId)!` in `relinkChain`: an unknown
  sub-unit writes `head[undefined]` as an object property, silently doing nothing.
- `engine2/contracts.ts:41` — `escalationBaseUSD` uses 0 as the "fixed price" sentinel, so a
  genuinely-zero base is indistinguishable from absent (the other stores use NaN for this).
- `engine2/lots.ts:203-206` — `consumeFifoByRow`'s declared return type omits `takenUnits`, which
  `consumeFifoOnViews` computes and the §5-WIRES W4 comment calls "the consumption record"; the
  row-addressed callers cannot see it.
- `stages/holdings-store.ts:325` — `pairKey = typeRef * 0x400000 + instrRef` ignores `regionRef`,
  so two rows of the same type and instrument id in different issuer regions would merge onto the
  first row's region (and the key collides once interned ids pass 4,194,304).
- `stages/context.ts:117,121` — `diagnosticLogs: any[]`, `earningsReportedThisTurn: any[]`.
- `stages/context.ts:401-403` — `estates`, `holderAccruedInterestUSD` and
  `sovereignAccruedInterestUSD` are ALIASED from state while every neighbouring field is copied
  (`[...state.companies]` etc.); mid-week mutation reaches `state` directly.
- `stage-deps.ts:70,92` — `private current` is written by `begin`/`end` and never read.
- `engine2/back-pool.ts:186`, `front-pool.ts:139` — the "engaged" line goes to `console.error`.
- `engine2/front-pool.ts:104` — unparenthesised `a || b || c || d && e` in `typedLanesOf`
  (correct by precedence, but the two pools' copies of this helper already differ: front-pool
  keeps string arrays, back-pool drops them).
- `engine2/company-store.ts:255-257` — `staleSeen` / `staleByStage` are module globals that leak
  across cloned states in the batteries.
- `stages/register-index.ts:104-115` — `getHoldingsTable(ctx as never)` at
  `stages/shared-helpers.ts:801` is the only caller; the cast defeats the ctx typing.

**NOTES (checked, fine)**
- `engine2/tranches.ts:120` `freeRow` clears `flags`, `issuerRef`, `principalUSD` and deletes
  `rowByIdRef` only when it still points at the row — a freed tranche row cannot be read as live
  by `facilityRowsOf`/`facilityBookOf` (both test `issuerRef >= 0` / the FACILITY flag).
- `issuerRefByIdRef` is deliberately permanent (a retired tranche still names its issuer at the
  paying agent) and grows without bound; that is the design, not a leak to fix now.
- `holdings-store.ts:220-228` `markById` takes the FIRST appended row's implied price per
  `(type, region, instrument)` across all slots — one print per book per region per week, so the
  "one price for every wire" claim holds; and `finalize`'s `priceOf` falls back to the after- then
  before-side share price only when no appended row exists.
- `holdings-store.ts:64` `claimed` is a `Uint16Array` while `epoch` is unbounded, but the store is
  rebuilt weekly and epochs are books × regions (~25), far from 65,536.
- `engine2/world.ts:196-201` `drainSeedRevenueHistories` seeds only `stash[0]`; both call sites
  (`initialization.ts:988,1091`, `bootstrap/carriers.ts:370`) stash 0 or 1 values.
- `engine2/back-worker.ts:100-103` replaces five `FrontPass` lanes with `[]`; all five
  (`costDrivers`, `outputInv`, `updatedProductLines`, `stillUnderConstruction`,
  `newRecurringBaseUSD`) are pure pass-throughs inside `runBackCoreA` (`stage08-back.ts:837-865`,
  returned at `:1045`) and are re-attached main-side by `rebuildBackCoreA:745-749`. Safe.
- `engine2/front-pool.ts:145-152` — a mid-flight worker failure returns BEFORE the mirror is
  copied home, so the serial re-run starts from an unmutated lot store. Correct.
- `engine2/world.ts:260-265` — `RATING_CODES` is a module global rather than v2 state; it is only
  written at `stage08-back.ts:2359` and read for display, and stage08-back's A phase runs in the
  worker without touching it. Fine today, but a worker that ever decodes a rating would see an
  empty table.
- `engine2/state.ts:170-176` — `allocWorld`'s per-column alignment (`ceil(bytes/sz)*sz`) is
  correct for f64/i32/u8 out of an 8-aligned ArrayBuffer.
- `engine2/world.ts:124-151` — the revenue ring's `len = actual + 1` encoding really does
  preserve the undefined-vs-empty distinction the object field had.
- [13c-site] `engine2/tranches.ts:414-417` `ladderTotalUSD` sums `principalUSD` (FACE) and is what
  `company-store.ts` serves as the derived `totalDebt` lane; every reader of that lane is reading
  face, not value. If 13c gives credit a mark, this lane and `measuredOwnershipAllRegions`'
  `corpBond.outstandingUSD` (`holdings-view.ts:296-300`, also face) become the face half of a
  face/value pair that must not be mixed with the register's `qtyUSD`.
- [13c-site] `stages/register-split.ts:33` splits a holder's fill pro rata to FACE across live
  tranches while the amount being split is a VALUE in USD; at par the two coincide, and they stop
  coinciding the moment credit is marked.

### A4 — Stage 08 — the per-company week kernels

`src/engine2/stage08-back.ts` (2396), `stage08-front.ts` (171), `stage08-lanes.ts` (232),
`front-core.ts` (861), `src/engine/simulation/stages/08-company-fundamentals.ts` (646),
`src/domain/company-week/{payroll,distributions,learning,debt-ladder,inventory,credit-standing,
income-statement,labor-demand,capital-programme}.ts` (1120).

**CRITICAL**

- `src/engine2/stage08-back.ts:1141` (and the twin `src/engine2/front-core.ts:561`) — both
  per-tranche walks `continue` when `maturityWeek === nextWeek`. `trancheWeekAccrual`
  (`front-core.ts:526`) sets CP's `due = (maturityWeek === week)` and a bond/loan's due on the
  anchor cycle, and a 5y/26wk bond has `260 % 26 === 0` — i.e. due AT maturity. The ONLY call
  site of `payHoldersAccruedInterest` is `stage08-back.ts:1157`, so it can never fire on a
  maturing tranche: **every commercial-paper programme accrues interest to holders weekly and is
  never paid** (the pot in `ctx.holderAccruedInterestUSD['COMMERCIAL_PAPER:…']` grows for the whole
  run and is never deleted — 07f redeems CP principal at par only), and **every corporate bond /
  leveraged loan drops its final coupon** (up to a whole period). The issuer's P&L IS charged that
  interest in the non-maturity weeks (`front-core.ts:566` folds it into `annualInterest`). Rule/lens:
  1.14 (one-sided flow), 1.3. Fix: compute the stub accrual and test `due` BEFORE the `continue`.

- `src/engine2/stage08-back.ts:1512-1517` — the maturity retirement loop retires EVERY row with
  `maturityWeek === nextWeek && !(flags & TR_CP)`, **facilities included**. `retireTranche`
  (`ledger/tranche-ledger.ts:70`) moves only the paper wire; no cash. A maturing revolver /
  maintenance bridge therefore leaves the lending bank's itemized book with **no repayment to the
  lender** — the exact defect the prepay path fixed at :1717 (`'facility prepaid: the loan and the
  deposit die together'` → `BANK_CREDIT`). Register paper is repaid by
  `settleCorporateActionOnHolders`, which filters facilities out entirely. Rule/lens: 1.14, 1.3.
  Fix: split the loop — facilities post a `BANK_CREDIT` repayment leg on the lender's ticker.

- `src/engine2/stage08-back.ts:1507-1510, 1622-1630` — `maturingRow = rowList.find(...)` takes only
  the FIRST maturing row, but the loop above retires ALL of them. So `maturingPrincipalUSD`, the
  report-only cash post at :1628, `debtRepaymentThisWeek`, and the withdrawn-refi revolver catch at
  :1594 all size themselves on one tranche while the ladder loses several. The kernel's running
  `cash.usd` (which drives the default trigger, the revolver draw, buybacks, prepayment and the MMF
  sweep, all downstream of this line) then diverges from what settlement actually pays the register.
  Rule/lens: bug + 1.14. Fix: sum the maturing face; use the sum everywhere `maturingPrincipalUSD` is.

- `src/domain/company-week/credit-standing.ts:37,40` — a bank's leverage denominator is
  `revenueUSD * 0.4` (a stated 40% EBITDA margin) and its coverage is the two-valued step
  `bankCapitalRatio < 0.05 ? 0.4 : 3.0`. §7.122 deleted exactly this stated bank margin from the
  profile modules; it survives here, and it is the spine `stage08-back.ts:1266` rates every bank on.
  A coverage that takes two values cannot rate a bank on itself. Rule/lens: 1.19, 1.13. Fix: build
  the bank's coverage from its own sheet (net interest income over funding cost), not a step.

**MAJOR**

- `src/engine2/front-core.ts:750` vs `src/domain/company-week/capital-programme.ts:190` — the
  industrial P&L's D&A is `revenue × daShareOfRevenue (0.05)`, while the balance-sheet roll-forward
  (`stage08-back.ts:333-336`) accumulates `grossPPE / (usefulLife × 52)`. Two depreciations for one
  firm: the accumulated-depreciation stock and the EBIT→net-income walk can never reconcile, and the
  deferred-tax view (`income-statement.ts:92`) mixes the two bases. The comment at
  `stage08-back.ts:330` claims "ONE owner of book depreciation". Rule/lens: 1.3, 1.14 (identity).
  Fix: charge the programme's `weeklyDepreciationUSD × 52` as the P&L D&A and delete `daShareOfRevenue`.

- `src/engine2/stage08-back.ts:919-925, 972` — `newTotalDebt` is set once from the OPENING ladder
  (`L8.totalDebtUSD`, a `ladderTotalUSD` read) and thereafter only the liquidity revolver adds to
  it (:1197). Every other principal move of the week — the accretive call and its replacement, the
  primary placement, the maintenance bridges, the maturities, the prepayment, the deleveraging —
  leaves it untouched. It is then filed as the quarter's debt (`buildQuarterlyFundamentalSnapshot`,
  :2136), and gates buybacks (`debtToEquity`, :2022) and the board's fair value (:2036). The filed
  debt is not the ladder. Rule/lens: 1.3. Fix: recompute from `rowList` after the lifecycle.

- `src/engine2/stage08-back.ts:2029` — `estimatedBookValuePerShare = max(0.5, (cash + revenue×0.8 −
  debt) / shares)`: a formula book value (80% of revenue standing in for assets) with a floor,
  used as the buyback's "cheap" test alongside the real `companyFairValuePerShare`. Two valuations
  of one company, one of them invented. Rule/lens: 1.1, 1.2, 1.3. Fix: drop it; use the cleared
  price against `companyFairValuePerShare` alone.

- `src/engine2/stage08-back.ts:970` — `maxPayoutRatio: Math.min(1, L8.maxPayoutRatio[row] ×
  (PATIENCE_MEDIAN_WEEKS / mgmtPatienceWeeks))`. `PATIENCE_MEDIAN_WEEKS = sqrt(4×52) = 14.4`, so a
  minimum-patience board (4 weeks) gets `0.6 × 3.6 = 2.16` and the `min(1,…)` binds: the whole
  impatient tail pays out exactly 100% of net income, a clamp deciding the payout. Rule/lens: 1.2,
  1.15. Fix: let the ratio exceed 1 (real boards do borrow to pay) or bound it by cash, not by 1.

- `src/engine2/stage08-back.ts:1961` — `newEmployeeCount = Math.max(10, …)`: a firm can never fall
  below ten employees, so a dying firm keeps a payroll and a wage bill forever. Rule/lens: 1.2.
  Fix: remove the floor; zero heads is a real state (the default path already writes 0).

- `src/engine2/front-core.ts:685-696` duplicates `capital-programme.ts:142-158` verbatim
  (`estRateDrag`, `estCashHealth`, `estTobinsQ`, `estQCapexEffect`, `estTargetGrowthCapex`, the
  `0.90/0.10` EMA) purely to produce `growthInvestmentSignal`. Two copies of the growth-capex rule
  in two files; the front copy has no `growthFundingCapUSD` cap and no `patienceWeeks`, so it has
  already drifted. Rule/lens: 1.3, copy-paste drift. Fix: have the front core read the programme's
  own output, or export one shared helper.

- `src/engine2/stage08-back.ts:908-910` — a profile firm's book depreciation is
  `grossPPEUSD / 20` with `ppeDepreciationYears: 20` hardcoded, while the same block two lines up
  builds `taxAttrs.usefulLifeYears` from `SECTOR_PPE_USEFUL_LIFE_YEARS[sector] ?? 12`. A bank's and
  an insurer's plant depreciates over 20 years because of a literal. Rule/lens: 1.17, 1.19.
  Fix: read the sector table for both.

- `src/engine2/stage08-back.ts:1385-1397` — `recordPremium` pays the call premium with
  `payHoldersCash(trancheId, …)`, which `applyPendingCorporateActionSettlements` distributes pro
  rata over the REGISTER's tranche-keyed rows only. The dealer desks hold the same paper
  ISSUER-keyed (`07b-corporate-bond-clearing.ts:441`, `applyDealerDeskFills`), so a desk holding a
  called bond has its position scaled down (the issuer-level pass at :2085) and receives **no call
  premium at all**, while the institutions are paid 100% of a premium they own only part of.
  Rule/lens: 1.14, 1.13. Fix: pay the premium on the same denominator the retirement uses.

- `src/engine2/stage08-back.ts:1774-1780` — the opportunistic deal's `walkAwayStat` is
  `max(oasSpreadBps, …)`, i.e. the CFO's indifference point is floored at the market's own current
  cleared spread. A walk-away that can never be tighter than the print is not a reservation, it is
  the print. Rule/lens: 1.15 ("a bound is not a price"). Fix: let the walk-away be the financing
  decision's cost alone.

- `src/engine2/stage08-back.ts:1861` — `newCdsSpreadBps = cdsSpreadBps > 0 ? cdsSpreadBps :
  newOasBps`: where 07h did not clear a name, the CDS spread is set equal to the cash OAS by
  formula. That destroys the basis the comment above it says is the point of clearing it.
  Rule/lens: 1.1. Fix: leave it absent (undefined) when nothing traded.

- `src/engine2/stage08-back.ts:1834-1849` — the `DELEVER_EXPENSIVE_DEBT` path retires drawn
  FACILITIES (`facilityRepaidUSD` accumulated then `void`-ed at :1846) with the cash posted
  `settle:false` at :1849. A declared gap with an owner ("Owner: G2"), but rule 13 also asks for a
  size and a scheduled closing slice, and neither is named here. Rule/lens: 1.13, 1.14.
  Fix: same `BANK_CREDIT` leg the prepay path at :1717 already uses, or record the size.

- `src/domain/company-week/capital-programme.ts:128` — `maintenanceCapexUSD = prior×0.95 +
  funded×0.05` (a ~20-week EMA) is what becomes `newCapex` and therefore the firm's capex BID,
  while `maintenanceShortfallThisWeekUSD` (:125) is measured against the UNSMOOTHED `fundedMaintenance
  Capex`. The shortfall streak that drives mothballing and the spend that reaches the goods auction
  are computed off two different quantities. Rule/lens: bug/period. Fix: measure the shortfall
  against the same figure that is spent.

- `src/domain/company-week/distributions.ts:95-102` — `cashThisWeekUSD = accrualWeeklyUSD × 13` uses
  ONLY week 13's `netIncome`/`marketCap`; the twelve weekly accruals the doc calls "real" are never
  summed and never carried. A quarter of a collapsed firm's earnings is paid at 13× its last good
  week (or vice versa). Rule/lens: 1.9 (stock vs flow). Fix: accumulate the accrual on the firm and
  pay the accumulated stock.

**MINOR**

- `stage08-back.ts:76` `DEFAULT_MAX_DIVIDEND_PAYOUT_RATIO = 0.6` is defined and never used (the
  comment at :83 says it moved); the live copy is the bare literal `0.6` at `stage08-lanes.ts:221`.
- `stage08-back.ts:45` imports `maturityWallShare` and never calls it (the arithmetic is inlined at
  :1240-1245). Dead import; the domain function and the inline copy can now drift.
- `stage08-back.ts:233, 318, 881` and `front-core.ts:432` — the same `× 0.45` accumulated-
  depreciation default written four times.
- `capital-programme.ts:187` returns `rndExpenseUSD: 0` always and `:188` returns a `capexUSD` the
  caller recomputes (`stage08-back.ts:325`). Two dead outputs.
- `front-core.ts:782` `O.costWage[row] = 0` — `wagePressureUSD` is always zero in the cost-driver
  record that reaches the quarterly filing.
- `income-statement.ts:96-103` — the doc block says "the guard is on EBIT, not on pre-tax income",
  but the `tax` branch guards on `taxableAnnualUSD` (:84), which is pre-tax based. Stale comment.
- `inventory.ts:122 chargeCarryingCost` and `debt-ladder.ts:260 tranchesDueWithin`/`:269
  dropExhausted` are exported and unused by these kernels (the engine2 lanes reimplement them).
- `credit-standing.ts:43-44` still uses `Number(x.toFixed(2))` (the string round-trip §7.304
  replaced everywhere else) and fabricates `5.0` / `1.5` on a non-finite ratio.
- `stage08-back.ts:2039` `buybackSpendM` is USD, not millions — misleading identifier.
- `08-company-fundamentals.ts:146` `prevActiveFirms.find(c => c.ticker === ticker)` inside a
  `forEach` over the same list — O(n²) per week; a Map is already built two lines away.
- `stage08-back.ts:88-91` `learnTraceRows` / `bypassTraceByLabel` / `boundaryTraceByFirm` / `:92
  priceScratch` are module-level mutable state read and written from the kernel; safe only because
  the post phase is main-thread today.

**UNDECLARED SHAPE CONSTANTS (rule 19 — none of these is in `src/domain/stated.ts`)**
- `stage08-back.ts:76` 0.6 payout default; `:87` `CAPACITY_CATCHUP_SHARE_ANNUAL = 0.35`; `:73`
  `STANDARD_CORP_TENOR_YEARS = 5`; `:264` bridge margin `oas × 1.1`; `:233/318/881` 0.45;
  `:250-252` 0.6/0.4 prior-capex split; `:974` div-yield 0.998/0.002, 0.4/1.2/1.0, ×2.5, 0.9/0.1;
  `:1300` rating stickiness 0.25; `:1456` `materialSavingAnnual: 0.01`; `:1642` bridge term-out gate
  `2%` of debt; `:1683` prepay trigger `2.5 ×` current liabilities, `5%` of ladder, `25%` of surplus;
  `:1434` call cash floor `15%` of revenue; `:1763` deal size `× 13`; `:2020` buffer `× 1.5`;
  `:2026` D/E `0.6`; `:2037-2040` 0.60/0.25, `5%/52`, `0.5%` share cap; `:2158` stress `× 0.3`;
  `:2166` recovery EMA 0.998/0.002; `:1229` default revenue `× 0.4`.
- `front-core.ts:603` execution noise `(u−0.5)×0.3`, EMA 0.92/0.08/0.08; `:623` 0.003 cap 0.08;
  `:668` 0.7/0.3; `:677` 0.15 / 0.2 / 0.1; `:750` `daShareOfRevenue 0.05`; `:701` marginEdge ×2,
  ×16, tanh 2.0, 0.98/0.02, 0.035, dominance 0.30/0.5; `:723` 0.85/0.15; `:783` crowding 0.08.
- `capital-programme.ts:98` 0.05 cash draw; `:105` bridge 0.5; `:128` 0.95/0.05; `:133` `−2`
  recovery; `:136` envelope × 1.5; `:142` 0.04 / 2.0; `:143` 0.05/0.4/1.0, 0.25; `:147` q clamp
  [0.1,10]; `:148` 0.2; `:149` 0.15; `:152` 0.75; `:177` 0.10; `:235-237` 13 / 52 / 0.10.
- `credit-standing.ts:37` 0.4; `:40` 0.05 / 0.4 / 3.0; `:43-44` 5.0 / 1.5.
- `learning.ts:150` `LEGACY_PRODUCTIVITY_DRIFT_ANNUAL = 0.012` — a SHAPE constant by its own
  docstring ("the drift the constant asserted"), still live in `seedCumulativeUnits` and therefore
  in every firm's opening learning position; not declared.

**CAPS AND FLOORS (rule 2), beyond those above**
`front-core.ts:742` `newRevenue = Math.max(10, …)`; `:688` tobin's-q clamp; `stage08-back.ts:1961`
head floor 10; `:2033` book value floor 0.5; `:2044` `sharesOutstanding` floor 1.0; `:970`
`min(1, payoutRatio)`; `capital-programme.ts:147` q clamp.

**NOTES (checked and FINE, or checked and non-defective)**
- The per-tranche `settleCorporateActionOnHolders` (`stage08-back.ts:2081`) and the issuer-level
  pair (`:2084-2085`) do NOT double count: `splitAcrossTranches` (`register-split.ts:43`) keys
  institutional register rows by TRANCHE, the dealer desks by ISSUER, so the two key spaces are
  disjoint and each row is scaled by exactly one ratio. The issuer-keyed fallback at
  `register-split.ts:62` only fires when the issuer has no live tranche of that kind.
- `preFaceByRow` (`:1338-1345`) is built BEFORE the call/maturity/prepay blocks and correctly
  excludes facilities and CP on both sides; rows retired to zero stay in the map and settle to a
  ratio of 0, which is what a fully retired tranche should do.
- The accretive-call refinance is float-neutral at the issuer level (retire `calledAmountUSD`,
  issue the same face), so `preActionFixedUSD` not carrying the replacement is correct.
- `recordPremium` posts `settle:false` AND calls `payHoldersCash`: the running `cash.usd` still
  falls (the `!settle` return at :406 is AFTER `cash.usd += amountUSD`), and the real debit comes
  from `applyPendingCorporateActionSettlements`. Not a double debit.
- `revolverDrawUSD` is passed `alreadyDrawnUSD: 0` because `headroomUSD` (:1187) already subtracted
  it — correct, not a missing subtraction.
- Both revolver paths (`:1183` liquidity, `:1584` withdrawn refi) are gated on `homeBankTicker`, so
  §7.372's "a bank drawing a facility from nobody" cannot recur.
- The entity-scoped RNG contract holds on all three execution paths (serial `runShardedVoid`,
  `BACK_BARRIER=1`, and the worker pool): `F.rngAfter[i]` opens core A, `streamAfterA[i]` opens core
  B, and the ambient stream is restored once at `08-company-fundamentals.ts:471`.
- Core B does read state core A changed, but only this firm's own: the cash box, `cap`, and the
  A-applied `comp.grossPPEUSD`/`mothballedPpeShare` writes. The two genuinely contended resources
  (`mmfSweepBooks`, `leadAllocatorByRegion`) are drawn in row order in both modes.
- `trancheWeekAccrual`'s day count is a 52-week year throughout (`weeklyUSD = annualUSD / 52`,
  `dueUSD = annualUSD × periodWeeks / 52`), consistent between the front seam and the back register.
  Floating adds `policyRate` to the margin in one place only (`front-core.ts:524`).
- `stage08-back.ts:1141` — the register accrual and the P&L accrual (`front-core.ts:560`) walk the
  same rows through the same function with the same resolved defaults, so the issuer's charge and
  the holders' receivable agree week by week (except on the maturity week, the CRITICAL above).
- `settlement.proceedsUSD` is posted `settle:false` while the tranche carries the full `placedUSD`
  face — correct: the underwriting fee is the difference and is paid by the lead. [13c-site] the
  primary's face is booked at par on both the ladder and the register.
- [13c-site] `applyPendingCorporateActionSettlements` derives the principal cash leg as
  `qtyUSD × (1 − ratio)` — "debt redeems at PAR, so the notional change IS the cash". Every
  retirement in this kernel (call, maturity, prepay, delever) settles at par against the holder's
  USD notional, so a called bond trading at 92 still redeems the holder at 100 of book.
- [13c-site] `stage08-back.ts:2033` and `:2136` file `currentTreasuryHoldingsUSD` as the raw sum of
  `quantityOrNotionalUSD` — par again, in the quarterly filing.

### A5 — The credit and sovereign clearing stages and the clearing engine

**CRITICAL**

- `src/engine/simulation/stages/financial-clearing-engine.ts:453` — `if (demandAtU(uLo) > targetUSD) return toStat(uLo)` returns the **numerical bracket as the cleared price** whenever level-independent demand at the extreme already exceeds the float. That demand is not hypothetical: `central-bank-demand.ts:45-52` posts `reservationStat = -1e9` with `fullSizeStatRange = 1e-6` and `minHoldingUSD = heldUSD`, and `etf-demand.ts:43-48` does the same for every index fund, so on any QE week (or a heavily-indexed book) the price-insensitive demand plus the mandated cores (07c institutions' `sovereignCoreShare`, banks' `encumberedFace`) sums past `tradableFloatUSD` and the book prints `bracketLow` — **−2000 bps** for every YIELD_LIKE book, or `currentStat × 100` for a PRICE_LIKE one (`toStat(uLo)` with `uLo = -bracketHigh`, engine:783-784). The engine's own defence of the brackets (lines 268-272: "if every participant's reservation level is above some spread, demand there is zero on its own") is only true of the ramp; it ignores cores and no-reservation orders entirely. That print then becomes `comp.oasSpreadBps` (07b:271), the NS refit's observed point (07c:512-520) and the loan anchor. Rule/lens: 1.15, 1.2. Fix: when demand at the low bracket already exceeds the float, ration the cores and solve for where the marginal core clears — never return a bracket end.
- `src/engine/simulation/stages/financial-clearing-engine.ts:487` — the other end of the same defect: when total demand is flat (every `maxHoldingUSD` 0, no cores — e.g. a name where `entityShare` is 0 for all bidders and no ETF/desk holds it), the segment walk never crosses and the function falls through to `return toStat(uHi)` = **100,000 bps** for a credit book / `currentStat / 100` for equity. `packed.skip` (engine:646) only guards a zero *float*, never zero *demand*, so the name is priced, not skipped. Rule/lens: 1.15, 1.2. Fix: no demand at any level is "no market" — pass `currentStat` through and record the book as untraded.
- `src/engine/simulation/stages/primary-settlement.ts:151` **and** `:156` — the lead's underwriting residual is delivered **twice**. Line 151 does `transferHolding(CLEARING_HOUSE → leadDesk, valueUSD: residualUSD)` for the credit books (and line 150 `issueHolding(issuer → leadDesk)` for equity), then lines 155-159 unconditionally repeat `transferHolding(CLEARING_HOUSE → {BANK_SECURITIES, lead}, ...)` with the identical spec. Both calls emit a wire (`holdings-ledger.ts:112-119`); `holderIdOf` only resolves INSTITUTION, so no register row is doubled, but the clearing house is debited the residual twice in the W-family journal and the equity path additionally attributes one movement to two different senders. The two blocks' comments (142-145 vs 152-154) describe the same single movement, so one of them is a leftover. Rule/lens: 1.3, 1.14. Fix: delete the second `transferHolding` block; keep the kind-dispatched one at 147-151.

**MAJOR**

- `src/engine/simulation/stages/bill-accretion.ts:210` — `reg.zeroRates.tenor3M + (tenor2Y − tenor3M) * (bucket.years / 2)` mis-locates the 26w/52w bills on the curve. Linear interpolation between the 0.25y and 2y points is `(years − 0.25) / 1.75`; `years/2` gives 25%/50% of the gap where the truth is 14.3%/42.9%, so both buckets over-accrete every week on an upward-sloping curve. Rule/lens: bug, 1.9. Fix: interpolate from 0.25, or just call `calculateNelsonSiegelZeroRate(bucket.years, reg.yieldCurveParams)`.
- `src/engine/simulation/stages/bill-accretion.ts:206-211` — the accretion rate is **this week's re-cleared curve**, not the yield each position was bought at. The file header (lines 185-189) claims "the government receives discounted proceeds at issue and repays FACE at redemption … it equals the accretion its holders accumulated over the same period" — that identity only holds if each position accretes at its own purchase yield. Every week the curve moves, holders' accumulated accretion and the treasury's fixed discount cost diverge. Rule/lens: 1.3, 1.14. Fix: accrete at the position's own booked yield (the discount is already computed per instrument at 07f:397-401).
- `src/engine/simulation/stages/bill-accretion.ts:229-292` — the stage accretes banks, institutions and the central bank, but **not corporate treasuries**. Treasuries are real bill holders in this book (07f:250-290), they book their primary slice at cost (`bookedUSD = usd − rebateOf(...)`, 07f:541) and are repaid at face. One class of holder therefore takes the discount and never earns it back. Rule/lens: 1.14, bug. Fix: accrete `treasuryHoldings` bill rows in the same pass.
- `src/engine/simulation/stages/07f-short-debt-clearing.ts:461-462` vs `07c-sovereign-bond-clearing.ts:521-523` — **two owners of the curve**, against 07c's own header ("This stage is the curve's ONLY owner", 07c:34-36). Worse, 07f refits `yieldCurveParams` through bills+bonds while leaving `zeroRates.tenor2Y…30Y` at 07c's cleared values, so after this stage `calculateNelsonSiegelZeroRate(2, reg.yieldCurveParams) ≠ reg.zeroRates.tenor2Y` — one real curve in two disagreeing representations, and consumers split between them (`macro/banking.ts:189-192` reads zeroRates; `11-fiscal:604` reads the params). Rule/lens: 1.3. Fix: one owner refits once through all cleared points and derives every zeroRates field from the fit.
- `src/engine/simulation/stages/corporate-financing.ts:86` — a **local** `const WORKING_CAPITAL_SHARE_OF_REVENUE = 0.15` shadowing the one owner at `shared-helpers.ts:919` (`= 0.08`), which 07f's CP sizing (07f:672), `money-market-fund.ts:166` and `estate-resolution.ts:531` all import. The CFO's invested capital, and therefore the ROIC that drives every issuance/delevering decision, uses a working-capital stock nearly double the one the rest of the model books. Rule/lens: 1.3, 1.19. Fix: import the shared constant and delete the local.
- `src/engine/simulation/stages/holder-paydown.ts:259,276,292` — retired principal is burned **pro rata across every position in the issuer**, not against the tranches that actually matured. `factorByIssuer` is a single scalar per issuer and every holder's whole claim is multiplied by it, so a holder of the issuer's 10-year paper is partly repaid when its 2-year matures. The CP path in the same area does it correctly per tranche (07f:750-760, keyed on `TR_CP && maturityWeek <= nextWeek`). Rule/lens: 1.3, 1.13. Fix: scale the matured tranches' rows, as the CP path does.
- `src/engine/simulation/stages/book-settlement.ts:86-94` — `primaryUSD = min(takeTotalUSD, max(0, tradingUSD))`. When the CCP's trading cash falls short of what the issuers placed, every issuer is **silently under-paid** pro rata and `leftoverUSD` becomes exactly 0, so the `defect()` at line 111 cannot see it. A shortfall on the issuer's proceeds is precisely the case the guard exists for. Rule/lens: 1.13, 1.14. Fix: `defect()` when `takeTotalUSD > tradingUSD` beyond rounding, rather than rationing the issuers.
- `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:83,152-158,373` — every institution's sovereign reservation is `expectedInflation + INSTITUTIONAL_REAL_RETURN_BPS (150) + durationPremium`, a **flat real return for every entity type**, while 07b:352 and 07d:313 price the same holders off `entityRequiredReturn(entity, assets)`. An insurer, a pension fund and a hedge fund all demand the same real yield from a govvie. Rule/lens: 1.19, 1.5. Fix: use `entityRequiredReturn` here too.
- `src/engine/simulation/stages/07f-short-debt-clearing.ts:857-871` — CP demand splits a fund's cash **equally across every issuer in the book** (`bidShare = min(CP_SINGLE_ISSUER_LIMIT, 1/n)`), regardless of which names it actually wants. 07b:355-366 and 07d:332-341 apportion the identical class budget by `offeringUSD + gapToTarget`. An imposed share where a demand-weighted one already exists two files away. Rule/lens: 1.13. Fix: weight by the same offering+gap rule the credit books use.
- `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:97-106,165-185` — `realYieldSignal`, its `clamp`, `MAX_INFLATION_TILT`, `REAL_YIELD_SCALE_BPS`, `LONG_END_TENOR_YEARS`, plus `POLICY_SPREAD_SCALE_BPS`, `MAX_POLICY_TILT`, `FRONT_END_SUBSTITUTION_TENOR_YEARS`, `RESERVE_SUBSTITUTION_SCALE_BPS`, `MAX_RESERVE_SUBSTITUTION` are **entirely unreferenced**. (Answering the brief's question: the `clamp` at :165 used at :184 with `MAX_INFLATION_TILT` is a genuine rule-2 clamp on a tilt, but it sits on dead code — a deletion, not a live violation.) The stale half is the file header (07c:17-21, 36-40) and the block comment at 95-98, which still tell the reader that macro reaches the curve through value/momentum/duration tilts; nothing of the kind runs. Rule/lens: 1.11, dead code. Fix: delete the block and rewrite the header to what the two live reservations actually are.
- `src/engine/simulation/stages/financial-clearing-engine.ts:60-68,234-241,776-786` — the **damper is dead machinery**. `runClearingKernel` never writes `out.damper` (the §5-CLOSE comment at 776-781 removed the cap), so `damperBoundInstrumentIds` is permanently empty; `setDamperStreaks`/`rollDamperStreaks`/`damperStreakByRawId`/`packed.damperStreak`/`GameState.damperBindStreakById` all still run, `native-kernels.ts:62` still branches on a value that is always 0, six adapters still push an empty array (07b:485, 07c:507, 07d:442, 07f:356, 07f:897, + repo/fx/equity/securities-lending/irs/cds/commodity), and `audit/prices.ts:80` measures a streak that can never form. The doc comments at 60-68 and 234-241 describe a mechanism that no longer exists. Rule/lens: 1.11, dead code. Fix: delete the damper end to end, or record it as a named removal.
- `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:110-119` and `07d-leveraged-loan-clearing.ts:86-88` — `creditDurationYears` clamps the ladder-derived duration to `[1.0, 8.0]` after multiplying by a magic `0.75`, with a bare `3.5` fallback; `loanCreditDurationYears` clamps to `[1.0, 4.0]` after `× 0.7`. Duration is an outcome of the tranche ladder and feeds the underwriting fee (07b:565), the capital charge and the loan's `pricePar`. Rule/lens: 1.2, 1.19. Fix: derive Macaulay/modified duration from the ladder's own cash flows; drop the clamp and the two factors.
- Undeclared shape constants (none appear in `src/domain/stated.ts`, which holds only 12 entries): `07c:81-83,90,93` (`SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS 120`, `DURATION_PREMIUM_BPS_PER_YEAR 4`, `INSTITUTIONAL_REAL_RETURN_BPS 150`, `BANK_PREFERRED_TENOR_YEARS 3`, `INSTITUTIONAL_PREFERRED_TENOR_YEARS 12`), `07c:139` (`INFLATION_MEAN_REVERSION_YEARS 3`), `07d:67` (`SENIOR_LIEN_DISCOUNT 0.85`, doing three different jobs at :140, :149/:274 and :283), `07f:73-77` (`BANK_BILL_PICKUP_BPS 5`, `INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR 20`, `BILL_FULL_SIZE_YIELD_RANGE_BPS 15`, `CASH_SLEEVE_BILL_SHARE 0.5`), `07f:89-94` (`REVOLVER_MARGIN_BPS 350`, `CP_MAX_SHARE_OF_REVENUE 0.10`, `CP_MIN_GAP_SHARE_OF_REVENUE 0.01`), `commercial-paper.ts:291,298,302,310-319` (the rating→line-share table especially), `corporate-financing.ts:66,69-71,80,83,93,96` and the bare `0.75` EBITDA→EBIT and `0.02` market-cap factors at `:146,:163`. Rule/lens: 1.19. Fix: declare each in `stated.ts` with its owner and scheduled death, or derive it.

**MINOR**

- `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:82,86,96,124,128,198` — `MAX_VALUE_TILT`, `CREDIT_CONDITIONS_FAIR_VALUE_SENSITIVITY_BPS`, `IG_MANDATE_HY_AVOIDANCE_TILT`, `preferredDurationYears`, `clamp` and `totalOutstandingUSD` are all unreferenced (this is the brief's other named clamp: dead). The comment above `MAX_VALUE_TILT` is truncated mid-sentence and the doc block at :133-141 documents a tactical-view function that no longer exists.
- `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:50` — `getRatingBucket` and `distributeRealTargetByWeight` imported and unused; same for `distributeRealTargetByWeight` at `07d:43`.
- `src/engine/simulation/stages/07d-leveraged-loan-clearing.ts:63-64,186` — `STRATEGIC_TARGET_DRIFT_RATE`, `WEEKLY_TACTICAL_REBALANCE_RATE` and `totalOutstandingUSD` unreferenced.
- `src/engine/simulation/stages/financial-clearing-engine.ts:275-300,335-350` — `demandAtStat` and `pushPreparedDemand` are unused anywhere in the tree (the kernel inlines both).
- `src/engine/simulation/stages/double-auction.ts:116` — `if (guard++ > 10000) break` silently truncates the discovery walk. The walk advances at most one index per iteration, so any book with more than ~10k bids+offers clears at an understated quantity with no signal. A magic bound on a clearing.
- `src/engine/simulation/stages/double-auction.ts:121-124` — a bid with zero/NaN quantity advances **both** `bidIdx` and `offerIdx`, discarding a live offer from the walk. Should advance only the empty side.
- `src/engine/simulation/stages/bill-accretion.ts:203,214,216,247` — `reg: any`, `state: any`, `Object.values(byTenor) as any[]`, in a file that writes bank balance sheets.
- `src/domain/call-protection.ts:31,42` — `BOND_DEALER_SPREAD_BPS = 15` duplicates `DESK_SPREAD_BPS_BY_BOOK['corporate bond'] = 15` (`domain/dealer-desk.ts:60`); the doc explicitly claims "the two are the same number" and "must not drift apart", but 07b reads the registry and only the make-whole reads this one. Two owners of one number.
- `src/engine/simulation/stages/07f-short-debt-clearing.ts:88` — `REVOLVER_MARGIN_BPS = 350` under a comment saying "Committed lines price ~300bp drawn".
- `src/domain/commercial-paper.ts:293-298` — the doc says `CP_SHARE_OF_TERM_SLEEVE` is "the CP half's share of **what is left**" after bills, but `07f:843` applies it to the full `cashPct` sleeve, exactly as `07f:216` does for `CASH_SLEEVE_BILL_SHARE`. 0.5 + 0.5 commits the whole cash sleeve to term paper, leaving none of the overnight buffer the comment is justifying.
- `src/engine/simulation/stages/07f-short-debt-clearing.ts:842` — `cpEntities` is every non-defaulted institutional entity in the world, with no `mandateWeightForIssuer` filter, unlike the bill book two hundred lines up (`07f:153-155`). A JPN pension fund bids for USA CP on the same terms as a domestic money fund.
- `src/engine/simulation/stages/book-settlement.ts:106` — `roundingToleranceUSD = Math.max(1e4, …)`: up to $10,000 per book per region per week of ownerless money is absorbed into the fee desks without comment on the floor's size.
- `src/engine/simulation/stages/financial-clearing-engine.ts:783-784` — `bracketLow`/`bracketHigh` are bare magic numbers (`-2000`, `100000`, `× 0.01`, `× 100`) with no named constant, and (see CRITICAL) are reachable as prints.

**NOTES**

- `register-split.ts:62` — `out.push({ instrumentId: issuerId, usd: leftUSD })`: the split falls back to an **issuer id** when the issuer has no live tranche of that kind. Reached from `07b:531`, `07d:494` and `07f:911`. Known 13b territory, but it is live and the `SPLIT_TRACE` guard above it says the authors expect it to fire.
- `07f:731-746` — the desks' CP inventory rows are keyed by `iss.comp.id` (an issuer id) and repaid by the issuer-wide `survivingShare`, while the institutions two blocks below (`07f:750-760`) are repaid per matured tranche. The one remaining issuer-keyed CP holder.
- `07f:930-945` — CP places at par (`principalUSD: placedUSD`) with an annual `couponRate` on 13-week paper, while bills in the same stage got the full discount treatment (07f:379-450). Different conventions for the two short-debt books. [13c-site]
- `07b:271` / `07d:466` — `comp.oasSpreadBps` and `leveragedLoan.pricePar` are derived from the cleared stat, not set independently — checked, rule 1 clean. `pricePar` measures against `quotedMarginBps` (origination), which is the right anchor for a discount margin.
- statKind orientation — checked end to end: `demandAtU` (engine:427-437), the event construction (447-467) and the settle pass (806-808) all use the same oriented `u`, and every book in this area is YIELD_LIKE, so a higher stat is a lower price everywhere. No sign error.
- `unsoldStaysWithHolder` (engine:853-863) rations BOTH sides pro rata and forces `dealerInventory` to 0 (engine:885-887); all five books in this area set it true, so there is no unnamed dealer residual on any of them. Correct.
- The primary money identity in `primary-settlement.ts` (buyers −take via the CCP, issuer +gross−fee, lead +fee −residual) sums to zero — checked line by line; the only defect is the duplicated asset wire above.
- 07c's three float carve-outs (`nonParticipantByBucket`, `unheldByBucket`, desk inventory at `07c:303`) and 07f's participant-sum float (`07f:308-330`) are consistent with each other and with OWN7. Checked.
- The reused dense-scratch epoch guard (`assertFresh`, engine:1101-1103) genuinely fires on a stale read — checked.
- `chooseLeadBank` (`primary-market.ts:187-208`) is a correct lexicographic rank with a deterministic tiebreak; the relationship term dominating raw dollars is deliberate and documented.

### A6 — Equity, ETFs, funds, dealers, institutional books

**CRITICAL**
- `src/engine/simulation/stages/12-portfolio-and-positions.ts:276,328,333,499` — IRS/CDS/XCS maturity does
  `weeklyRealizedPnL += unrealizedPnL` AND `weeklyRealizedCashUSD += unrealizedPnL`, and
  `13-news-and-turn-summary.ts:25` sums BOTH into cash. The same P&L is paid twice. The corp/sov branches
  (`:123`, `:239`) already fixed exactly this and their comment names it ("money from nowhere, twice over");
  the derivative branches were never converted. Lens: bug / rule 3. Fix: drop the `weeklyRealizedCashUSD` line
  in the IRS, CDS and XCS branches.
- `src/engine/simulation/stages/pe-lifecycle.ts:680-683` — on an IPO the sponsor is written a
  `peSponsorPct: 0.70` and simultaneously removed from `peFund.portfolioCompanyIds`. `sponsorPortfolioUSD`
  (institutional-balance-sheet.ts:196) reads only that array, so 70% of the company leaves the fund's assets
  with no sale and no cash; and since only `postIssueShares` are registered in 07e, the residual float is
  attributed to households by `householdDirectEquityUSD`. Ownership destroyed and re-granted. Rule 3/13.
  Fix: register the sponsor's retained stake as real shares in the 07e register, or keep the holding until sold.
- `src/engine/macro/household-portfolio.ts:75-88` — `householdDirectEquityUSD` subtracts only INSTITUTION
  equity rows from `marketCapOf`, never the banks' dealer-desk equity inventory, which 07e creates as real
  bank-owned shares (`07e:282`) and settles onto `BANK_SECURITIES`. 07e computes the household residual the
  OTHER way, with desks subtracted (`07e:309`). Two definitions of one residual; the desks' whole equity book
  is counted as household net worth. Rule 3. Fix: subtract `regionalDeskView(...,'equity')` here too.
- `src/engine/simulation/stages/household-balance-sheet.ts:85-92` — `beneficiaryLiabilityUSD ?? (totalAssets −
  equityCapital)` sets the claim ONCE and thereafter keeps the stored value, with `equityCapitalUSD` taking the
  whole residual. Only PENSION_FUND is updated (insurance-and-pensions.ts:209). So an INSURER's, ASSET_MANAGER's
  and HEDGE_FUND's household claim is frozen at week 1 while all book P&L accrues to "equity capital" — the
  module's own doc says it is "re-marked every week" and it is not, so the wealth transmission it exists to
  create does not run. Rule 3/13. Fix: re-derive (or accumulate from real flows) for every
  `beneficiariesAreHouseholds` kind, not just pensions.
- `src/engine/simulation/stages/etf-flows.ts:682-689` — in the ETF SHARE book every participant's
  `maxHoldingUSD` is `Math.max(shares, shares + wantUSD/nav)`, i.e. never below what it already holds. No
  participant can sell; the only supply is the AP primary offering. A one-sided book whose print is pinned at
  the reservation (`nav × (1+assemblyCost)`) whenever AP capacity is short — the premium is a bound, not a
  clear. Rules 14/15. Fix: let a redeeming holder post a target below its current holding.
- `src/engine/simulation/stages/etf-flows.ts:499 vs :727-733` — creations/redemptions execute at the PRE-flow
  `navPerShare` (`shares = executedUSD / navPerShare`) but `issueHolding`/`retireHolding` value the same rows at
  `navByFundId / POST-flow sharesOutstanding` (shares already bumped at `:512`). The share leg and the cash leg
  of one transaction carry different values; the W2 wire records the wrong one. NAV identity. Fix: pass the
  plan's `navPerShare` into the issue/retire spec.
- `src/engine/simulation/stages/dealer-desks.ts:220` — `feeUSD = Math.max(0, -(cashDeltaUSD + (newUSD −
  prevMarkedUSD)))`. A NEGATIVE residual is charged to the bank's equity as a "desk fee"; a POSITIVE one is
  silently discarded, so cash can arrive on `BANK_SECURITIES` with no P&L entry and the per-bank identity
  drifts by it. Rule 3/14. Fix: book the residual signed (`bookPnL(sheet, -(cash + Δinventory), …)`).

**MAJOR**
- `src/engine/simulation/stages/etf-flows.ts:547-557` — the in-kind slice is `owedUSD / (row walk +
  institutionSpendableUSD(...,false))` while the shares retired are `executedUSD / navPerShare`, and
  `navPerShare` comes from `fundNavUSD` (rows + `max(0, entityCashOf)`) net of the sponsor fee (`:104`). The
  fraction of the fund delivered is not the fraction of shares cancelled, so an in-kind redemption moves NAV
  per share. Fix: one asset total for both.
- `src/engine/simulation/stages/etf-flows.ts:306 vs :640` — `etfShareRowByInvestor` takes the FIRST ETF_SHARE
  row per fund ("first-match-wins"), `etfSharesByFundByInvestor` SUMS every row. Two conventions for one
  quantity in one file: with more than one row per (holder, fund) the want-delta understates and the share
  book's float overstates. Fix: sum in both.
- `src/engine/simulation/stages/etf-flows.ts:754` vs `src/engine/macro/household-portfolio.ts:109` —
  institutional ETF_SHARE rows are re-marked at `marketPricePerShare` (the cleared premium); the household
  sector's `etfShares` are marked at NAV. The same fund's shares are worth two different amounts depending on
  who holds them. Rules 1/3. Fix: one mark, read from one place.
- `src/engine/simulation/stages/dealer-desks.ts:98` — `priorUnits = Math.max(0, …)` clamps a SHORT desk to flat
  on entry to the auction, while `applyDealerDeskFills:196` marks the same position unclamped (`p.units ??
  p.inventoryUSD`). `domain/dealer-desk.ts:98` explicitly says a position may be negative. A short would
  disappear from the book and reappear in the mark. Fix: carry the sign into `currentHoldingsByInstrumentId`.
- `src/engine/simulation/stages/money-market-fund.ts:63-80` — `quoteMmfNetYieldAnnual` reads
  `entity.itemizedHoldings` (the stale week-start array) while every other read of the same fund
  (`distributeMoneyFundIncome:238`, `fundNavUSD`) walks the v2 rows. The quoted yield — which drives the
  household deposit/MMF split — is computed off a parallel, stale book. Rule 3. Fix: row walk here too.
- `src/engine/simulation/stages/institutional-balance-sheet.ts:150` — `accrueInstitutionalIncome` returns the
  entity unchanged when the week's income is 0, so `lastWeeklyInvestmentIncomeUSD` keeps LAST week's number
  forever. `insurance-and-pensions.ts:211` then credits that stale figure to pension entitlements every week.
  Also the function's own doc still claims it credits corporate coupons and loan interest; it only walks
  GOV_BOND rows. Fix: write 0 explicitly; delete the stale paragraph.
- `src/engine/simulation/stages/insurance-and-pensions.ts:184-187` — `weeklyBenefits = ALL entitlements /
  remainingLifeExpectancy(RETIREMENT_AGE) / 52`: working members' accruals are drawn down as if every
  beneficiary were already retired, and nothing anywhere DISCOUNTS the liability — `beneficiaryLiabilityUSD`
  is a running cash sum (`:209`), not a present value, so it never responds to the rate curve the assets are
  marked against. Fix: split accrued-vs-in-payment entitlements and discount at the region's own cleared curve.
- `src/engine/carryCalculator.ts:38` — `const rf = params.policyRate || 0.045`: a genuine 0% policy rate is
  falsy and silently becomes 4.5%. Rule 9/bug. Fix: `?? 0.045`, or require the rate.
- `src/engine/carryCalculator.ts:56-236` — the whole module is a second, invented pricing world beside the
  cleared one: `dividendYield ?? 0.018`, repo = policy + 40/50/75 bps, `cdsSpreadBps ?? 100/150/375`,
  `convenienceYield ?? 0.03`, `basisSpreadBps ?? -20`, option theta fallback `notional * 0.02`. The model
  clears every one of these (07b OAS, repo-clearing, the CDS book, commodity convenience yield, the FX basis).
  Rules 1/3/4. Fix: take the cleared statistics as inputs; delete the defaults.
- `src/engine/simulation/stages/07e-equity-clearing.ts:376-403` — the week's order IS the target:
  `budgetUSD = assetAllocationTarget.equityPct × spendable`, `entityPoolUSD = totalAssets × equityPct ×
  mandateWeight`, the per-name weight is `max(0, structural − held)` and the ceiling is
  `structuralShares × maxOverweightMultiple`. Size, ceiling and budget are all the policy percentage;
  only the reservation price is tactical. Rule 5 (the reservation is real, the SIZE is the mandate). Fix: size
  the week's purchase off the excess-return test the credit books use, with the target as a band.
- `src/engine/simulation/stages/pe-lifecycle.ts` — a PE fund has NO fee and NO carry anywhere:
  `distributeToLps:203` returns 100% of recap and exit proceeds pro rata to drawn capital, with no management
  fee, no preferred return, no carried interest and no realized-vs-unrealized split. The sponsor earns nothing
  for running the fund, so its own balance sheet has no revenue line. Fix: charge the committed-capital fee
  and split proceeds at the hurdle before the LP distribution.
- `src/engine/simulation/stages/pe-lifecycle.ts:393` — the sale trigger is
  `nextWeek − ownership.acquiredWeek >= PE_FUND_LIFE_WEEKS`, i.e. the HOLDING's age, while the comment (and
  `PE_FUND_LIFE_WEEKS`'s own doc at `:104-111`) says the FUND is out of time. A fund that buys late never has
  to sell; every holding gets its own ten-year clock. Fix: put a vintage week on `peFund`.
- `src/engine/simulation/stages/pe-lifecycle.ts:592` — `sellerRegion.householdState.netWorthUSD += calledUSD`
  immediately after the `pay()` that credits the same households' deposits. Net worth is a DERIVED sum
  recomputed in household-balance-sheet.ts:305, so this is either a double count or a dead write; a derived
  quantity is written by hand either way. Fix: delete the line.
- `src/engine/simulation/stages/pe-lifecycle.ts:602,680` — `peSponsorPct: 0.95` / `founderPct: 0.05` on an LBO
  and `peSponsorPct: 0.70` after an IPO are IMPOSED shares: the sponsor pays `equityValueUSD` (100% of the
  equity) and receives 95%, and the post-IPO split is a constant unrelated to the 25% of shares actually sold
  (`:355`). Rule 13. Fix: derive the stake from what was paid and what was placed.
- `src/domain/dealer-desk.ts:117-130` — `DESK_SPREAD_BPS_BY_BOOK` is a stated bid/ask table (bill 2, equity 8,
  corp 15, loan 20 …) charged as a real transaction cost on every fill in 07b/07c/07d/07e/07f and quoted to the
  player. A dealer spread is an OUTCOME of desk competition and inventory risk, and the table's values are
  recognisably real-market ones. Rules 1/4/13/19; not in `domain/stated.ts`. Fix: derive from the desk's own
  capacity and the book's measured weekly move (the ETF AP capacity already does exactly this).
- Rule 19 — undeclared SHAPE constants in this area (none appear in `src/domain/stated.ts`):
  `asset-allocation.ts:60` SPREAD_RISK_CAPITAL_PER_DURATION_YEAR, `:64` MAX_CHARGEABLE_DURATION_YEARS=7,
  `:78-101` REQUIRED_RETURN_ON_CAPITAL (0.09/0.07/0.11/0.22/0.20), `:137` CREDIT_CONDITIONS_REQUIRED_SPREAD_BPS
  =40, `:145` FULL_SIZE_SPREAD_RANGE_BPS=250, `:152` MAX_OVERWEIGHT_MULTIPLE=2.2, `:224` EXPECTED_WORKOUT_YEARS
  =2; `equity-valuation.ts:28,35,37,39,70` EQUITY_RISK_PREMIUM=0.035, REPRESENTATIVE_HOLDER_REQUIRED_RETURN=0.10,
  MAX_CAPITALISED_GROWTH=0.06, LOSS_MAKER_NET_ASSET_HAIRCUT=0.55 and the unexplained `× 0.25` blend weight;
  `07e:60` FULL_SIZE_PRICE_DISCOUNT=0.30; `domain/etf.ts:80-84` ETF_EXPENSE_RATIO_ANNUAL, `:147-148`
  NAMES_COVERED_AT_ONE_BILLION_AUM=45 and RESEARCH_COVERAGE_SCALING_EXPONENT=1/3; `dealer-desk.ts:107`
  DEALER_DESK_SHARE_OF_BALANCE_SHEET=0.25 (its own comment calls it "a stated PREFERENCE primitive");
  `money-market-fund.ts:41,44` MMF_FEE_ANNUAL=0.003 and DEPOSIT_MMF_FULL_SWITCH_GAP=0.01 (comment: "a stated
  primitive standing in for real household choice"); `institutions.ts:29,37` PREMIUM_TO_SURPLUS_RATIO=1.2,
  INSTITUTIONAL_CAPITAL_RATIO=0.12; `institution-profiles.ts:90-97` every kind's `targets`, `sovereignCoreShare`,
  `preferredCreditDurationYears`, `subInvestmentGradeSizeFactor` and `convictionMultiple: 4.0`;
  `indexes.ts:52` LARGE_CAP_CUMULATIVE_SHARE=0.70; `pe-lifecycle.ts:100,102,111,113,124` LBO_MAX_LEVERAGE=6.0,
  MIN_HOLD_WEEKS=78, PE_FUND_LIFE_WEEKS=10×52, RECAP_DM_THRESHOLD_BPS=450 (a real-world spread level, rule 4),
  IPO_PREMIUM_OVER_ENTRY=1.15, plus `:308` recap = 50% of headroom, `:355` IPO = 25% of shares, `:772`
  newborn = 0.4% of pool and `:790` leverage 2.5.
- `src/domain/institution-profiles.ts:69,77` — `insurerHurdle` and `pensionHurdle` end in
  `Math.max(0.02, Math.min(0.30, …))`. A derived hurdle is clamped to a stated band: rule 2 ("never clamp the
  symptom"), and the clamp hides exactly the case the derivation exists to expose (an insurer underwriting at a
  heavy loss, a badly underfunded scheme). Fix: remove the bracket and let the number be a finding.
- `src/engine/simulation/stages/asset-allocation.ts:230` — `computeDistressedReservationSpreadBps` hard-reads
  `REQUIRED_RETURN_ON_CAPITAL.HEDGE_FUND` instead of the bidding entity's `entityRequiredReturn`, so the
  distressed regime is the only pricing path in the model that ignores §5-BRAINS' per-board risk aversion.
  Rule 3 (one hurdle, two derivations). Fix: pass the holder's own required return in.
- `src/engine/simulation/stages/07e-equity-clearing.ts:139,141,148,624` — the equity book carries SHARE counts
  in fields named `outstandingUSD`, `tradableFloatUSD`, `primaryOfferingUSD`, `maxHoldingUSD`,
  `maxNetPurchaseUSD`, and `liveSharesOf:127` adds `PrimaryOffering.sizeUSD` (a share count for EQUITY, per
  `primary-market.ts:44`) to `sharesOutstanding`. Rule 9 / §7.165 verbatim: a field named USD is not a share.
  Fix: rename the engine's quantity fields to a unit-neutral name (`quantity…`), or brand them.
- `src/engine/simulation/stages/etf-flows.ts:340-350 vs :671` — a region's AP capacity is spent twice in one
  week: once rationing creation/redemption flow (`fillRatio`), and again in full as the share book's
  `primaryOfferingUSD` (`apCreationShares`). Rule 14 (finite capacity). Fix: net the share book's offering
  against what the flow pass already consumed.
- `src/engine/simulation/stages/12-portfolio-and-positions.ts:461-467,558` — the player's
  `weeklyFinancingCostUSD` and `weeklyInterestIncomeUSD` have no counterparty: nothing is `pay()`ed, no bank
  books the interest, no desk earns the financing. `carryEst.weeklyCarryUSD` (which is already income minus
  financing) is added to `attributionCarry` while `financingCostUSD` is ALSO accumulated and subtracted in
  `13-news:25`, so the financing leg is counted twice in the player's cash. Rules 3/14. Fix: route both through
  the ledger, and take financing out of one of the two paths.

**MINOR**
- `07e:500` `comp.stockPrice = Number(newPrice.toFixed(2))` — every mark, cash leg and fee uses the rounded
  price, but `settlePricedOfferings:552` values the primary proceeds at the UNROUNDED `clearedStat` while
  `primaryTakes:568` values the paper leg at the rounded one. Two prices for one deal.
- `07e:512,526` — a fill of `0 < shares <= 0.0001` is dropped from the register but still charged in the cash
  loop: the holder pays for shares it does not receive (dust).
- `07e:330` — `pendingDirectEquitySaleUSD` is cleared only when a household participant was built; if the
  residual value is ≤1 the announcement persists forever.
- `07e:113,289` `riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04` and `pe-lifecycle:513` the same — a silent
  magic fallback for the risk-free rate.
- `money-market-fund.ts:174` — comment says an unfilled redemption "carries to the next session"; nothing
  records the unfilled amount, so it is simply dropped.
- `money-market-fund.ts:278` — `Object.assign(c, …)` mutates a company inside a `.map`, mixing mutation with
  the immutable rebuild used two lines away.
- `institutional-balance-sheet.ts:110-121` — module doc still describes crediting corporate coupons and loan
  interest here; the code only walks GOV_BOND rows.
- `12-portfolio:56-57,166,244,289,376,430,470` — maintenance margin is `marginReq × 0.65`, `× 0.6`, `× 0.75`
  and `× 0.5` depending on branch, with no stated reason; `:508` FX uses a literal `0.05` instead of
  `getUnifiedInitialMarginRate('FX_SPOT')`, which is the same number written twice.
- `12-portfolio:63,105` — `pos.isClosed = true` mutates the input position before the spread copy is returned.
- `dealers.ts:139` — a full desk quotes `bookSpreadBps * 10`, a magic "nobody trades here" level.
- `dealers.ts:68` — `dealerDeskCapacityUSD({ …, book: '' })`: an empty book name relies on no book being named
  `''` to make the netting a no-op.
- `etf-flows.ts:722` — `funds.find((f) => f.id === fundId)!` inside the apply loop: a non-null assertion that
  throws if a holder carries a row for a fund no longer in `funds`.
- `etf-flows.ts:42,44` — `publicComparableEvMultiple`, `householdPrivateBusinessEquityUSD`, `MarketIndex`,
  `mandatePctOf`(partly) and `ETF_EXPENSE_RATIO_ANNUAL` are imported and unused / used once; `etf-demand.ts:25`
  `NO_RESERVATION_YIELD_BPS` duplicates the same device twice.
- `domain/portfolio.ts` — `HistoricalBenchmarkRecord.benchmark6040` and `cashHurdle` name a 60/40 benchmark
  that nothing in the engine constructs; `ReturnAttribution` is the five-way split 12-portfolio fills with
  fixed fractions.
- `carryCalculator.ts:1-238` — the file's name collides with private-equity CARRY (carried interest), which
  does not exist anywhere; this is cost-of-carry.

**NOTES (checked, fine or out of scope)**
- `equity-valuation.ts` really is the one answer: `companyGenerator:518`, `bootstrap/carriers:313`,
  `stage08-back:2035` and 07e all route through `fairValuePerShare`. No parallel share-price formula survives;
  `pricing.ts` only re-uses the risk-premium constant. Rule 3 clean here.
- 07e's per-holder disagreement, the household forced-seller channel, and `unsoldStaysWithHolder` are all
  coherent; the desk build/float ordering (`07e:250-286`) is correct as written.
- MMF share price is genuinely fixed at $1 and the income identity is right: `paidToHolders = book − fee −
  shares` (`money-market-fund.ts:250`) does NOT double-deduct the fee across weeks (checked algebraically), and
  the shares are issued to real holders pro rata (`:266-283`).
- `dealer-desks.ts` inventory is issuer/instrument-keyed and the credit books' registers are tranche-keyed, but
  nothing in these files nets or compares the two — the desk's own `clearedBookDelta` wires by instrument id.
- `apWeeklyCapacityUSD` (etf.ts:117) is a genuine derivation off measured volatility, not a constant.
- ETF creation/redemption is two-sided and in kind for institutions, cash for households, with the household
  leg trimmed at the holding — that half is sound.
- [13c-site] `institutional-balance-sheet.ts:192` and `pe-lifecycle.ts:229,308,342,436,516` value a private
  company as `evMultiple × ebitda − ladderTotalUSD(...)`: the debt is subtracted at LADDER FACE, so every
  sponsor NAV, every LBO/recap/IPO/take-private price and every household private-business mark assumes par
  for the target's credit.
- [13c-site] `12-portfolio:110` a matured/missing tranche marks at `100` (or `recoveryRate × 100`) points of
  par as the contractual payout.
- `indexes.ts` is a rule, not a list, and `LARGE_CAP_CUMULATIVE_SHARE` is defensible as published methodology.
- `distribution.ts` is fully derived from registry physics — clean; nothing to report.
- `domain/fund.ts` `distributable`/`redeemable` are the one bound, used on both sides. Clean.
- `ETF_INCEPTION_NAV_PER_SHARE` is used only as an inception/empty-fund convention (per instruction, not
  reported).

### A7 — Banking, settlement, resolution, sovereign fiscal

Files: stages/{settlement, bank-lending, 02b-bank-diversification, bank-resolution, estate-resolution,
repo-clearing, securities-lending, prime-brokerage, overdraft-sweep, bank-funding-close, central-bank,
central-bank-demand, sme-pools, trade-settlement, 10-mergers, 11-fiscal-and-sovereign-debt,
sovereign-calendar, shared-helpers}.ts; engine/macro/banking.ts; domain/{banking, bank-pricing,
bank-resolution, central-bank, repo, securities-lending, prime-brokerage, collateral, sme-pool, estate,
government, government-entity, household-credit}.ts. (Confirmations followed into ledger/bank-transfer.ts,
ledger/accounts.ts, stages/bill-accretion.ts, domain/stated.ts, stages/context.ts, core.ts.)

**CRITICAL**

- `src/domain/bank-resolution.ts:92-93` + `src/engine/ledger/bank-transfer.ts:79,82` — `planBankResolution`
  nets the failed bank's OWN BOND LADDER against the CENTRAL BANK's loan (`ladderStaysUSD = min(cbLoan,
  ownLadder)`, `transferableUSD = cbLoan − ladderStays`); `assumeBankBooks` then transfers only
  `wholesaleAssumedUSD` and sets `target.centralBankLoanUSD = 0`. The un-assumed remainder of the CB loan
  is erased with the shell while `centralBankSheet.loansToBanksUSD` still carries the asset — a liability
  deleted with no counterparty, and two different liabilities (a traded ladder on the tranche ledger, an
  unsecured CB loan on the sheet) treated as one. Rule/lens: 3/14, bug. Fix: bail the ladder in on its own
  rows and transfer the whole CB loan, reducing `loansToBanksUSD` by anything not assumed.

- `src/engine/simulation/stages/estate-resolution.ts:530` vs `:189-205,230` — `estate.assets.cashUSD` is
  written once at `openEstate` and NEVER updated (only receivables/inventory/PPE are re-read each week),
  but the close test is `estateAssetsUSD(estate.assets) <= 1`, which sums it. Any estate opened with more
  than $1 of cash can never close: `writeOffResidual` never runs, holders keep the defaulted paper at its
  last mark for ever, and `rebuildLadder(…, [])` never extinguishes the dead issuer's debt — precisely the
  absence G5 exists to abolish. Reachable today: a resolved bank's shell is paid `plan.estateUSD` into its
  account (bank-resolution.ts:207) and its estate opens the FOLLOWING week with that cash. Rule/lens: bug,
  13. Fix: set `assets.cashUSD` from `cashOf(estateComp)` each week beside the other three.

- `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:565,619,636` (+ context.ts:331) — the
  quarterly bond block is sized as `waysAndMeans + 13 × marketFundedDeficitUSD` where the deficit is THIS
  week's, floored at zero. `issuanceCalendarWeek` (`nextWeek % 13 === 0`) is exactly `isQuarterEnd`
  (`((nextWeek−1)%13)+1 === 13`), i.e. the one week of the quarter when the whole quarter's SME and
  consumption tax remits — so the run rate is extrapolated ×13 from the least representative week in the
  quarter and the `Math.max(0, …)` floor discards the surplus. Twelve zero-revenue weeks fund themselves on
  the ways-and-means advance instead. Rule/lens: 9 (period), 2 (floor), logic. Fix: extrapolate a trailing
  13-week mean of outlays−revenue, signed.

- `src/engine/simulation/stages/shared-helpers.ts:753-880` (`applyHolderInterestAccruals`) — the coupon
  accrual splits an issuer's weekly interest across the INSTITUTIONAL REGISTER ONLY
  (`shareUSD = weeklyUSD × qty/registerTotal`, summing to the full amount). The banks' dealer desks
  (`dealerDeskInventory['corporate bond'|'leveraged loan']`) hold the same paper and are neither accrued
  nor paid, so their share of every coupon is paid to the other holders instead. The principal path in
  `applyPendingCorporateActionSettlements:437-467` was given a desk pass for exactly this reason ("THE
  DESKS ARE HOLDERS OF RECORD TOO"); the interest path and the `pendingHolderCashUSD` path (call premium,
  dividend, :552-566) still have none. Rule/lens: 3/14, bug. Fix: give both cash paths the desk pass the
  ratio path already has.

- `src/domain/government-entity.ts:66-68` — `Government.interestWeeklyUSD()` = coupon expense **plus**
  `weeklyBillDiscountAccrualUSD`, and `week():84` feeds it into `decomposeGovernmentSpending`. But
  `domain/government.ts:80-89` states in terms the bill accrual "is deliberately not added to the expense:
  the cost is already in the redemption leg, and charging it here as well is the double count", and stage
  11 (`:534`) sets `governmentInterestWeeklyUSD` from the coupon alone. So the object advertised as "THE
  ONE DECOMPOSITION … so they cannot disagree" disagrees with the stage by the whole bill accretion (~21%
  of the stack) and double-charges it, shrinking the primary budget every reader of the façade sees.
  Rule/lens: 3, double count. Fix: drop the accrual term from `interestWeeklyUSD()`.

- `src/engine/simulation/stages/repo-clearing.ts:358,585,610-637` — the ON RRP has a posted rate and NO
  quantity response: `creditRrpOnUnlentSleeves` pays `CENTRAL_BANK → INSTITUTION` interest on
  `institutionSpendableUSD × 0.5 − lent`, a balance that is never booked as a position on either side
  (`evolveBankingSector` hard-sets `onRrpLendingUSD: 0`; `CentralBank` carries no RRP liability). The same
  dollar earns the administered rate and stays fully spendable in every book that week. Rule 1's single
  sanctioned exception is "a posted rate **with a real quantity response**"; this is a posted rate paying
  interest on a phantom balance. Rule/lens: 1, 3, 14. Fix: make the RRP a real seat with a booked position,
  as the SRF already is.

**MAJOR**

- `src/engine/simulation/stages/settlement.ts:224,244` — `pay`/`payByIds` skip `addPending` when
  `settleWeek > week`, and nothing ever adds the row when its week ARRIVES: the carried row sits in the
  journal from the start of its due week while `pendingNetById` was cleared at the end of the prior pass.
  A dated obligation (corporate tax) is therefore invisible to every budget that reads
  `pendingSettlementUSD` on the very week it is paid. Rule/lens: 14, bug. Fix: seed the running net from
  the carried journal's due rows at the start of the week.
- `src/engine/simulation/stages/overdraft-sweep.ts:33-40` — the close sweep re-derives every party's
  balance by walking the journal because `pendingNetById` misses everything the paying agent journals
  (`journalPayment` does not touch the running net). So `pendingSettlementUSD` — read by repo-clearing's
  surplus/shortfall, `institutionSpendableUSD`, the PB close sweep and every bid sizer — is short by the
  week's dividends, coupons and redemptions. Two representations of one running net (rule 3). Fix: have
  `journalPayment` update the net, or make the agent use `pay`.
- `src/engine/simulation/stages/bank-funding-close.ts:39` + `bank-lending.ts:915,925` — the LOLR draw is
  sized against `householdDepositsAt × bankCashBufferRatioOf` (2% of HOUSEHOLD deposits only) while
  `repayCentralBankLoanUSD` releases cash only above `stressedOutflowUSD × LCR` (10% retail + 40%
  wholesale). Two definitions of one operating buffer (a third at repo-clearing.ts:299), and the repay
  threshold sits far above the raise threshold, so the central bank's loan ratchets up and is essentially
  never repaid. The file header still describes the counterparty as "the unmodeled wholesale lender"; it is
  the central bank. Rule/lens: 3, 9, stale comment.
- `src/engine/simulation/stages/bank-funding-close.ts` + `bank-lending.ts:930` — the lender of last resort
  has no collateral test, no eligibility test and no capacity: every bank is funded to its buffer every
  week, unsecured. A liquidity failure cannot happen. Rule/lens: 8/13 (a counterparty with no finite
  capacity).
- `src/engine/macro/banking.ts:463-476` — `weeklyNetIncomeUSD`, the base for `regularDividendUSD` and the
  special dividend, counts interest income less funding cost and EXCLUDES the loan losses `bookPnL` writes
  in bank-lending.ts. A bank writing off credit still distributes 40–90% of gross interest income. Rule/lens:
  logic, accounting. Fix: net the week's provisions into the payout base.
- `src/engine/macro/banking.ts:437` vs `02b:494` — the CB loan is charged at `policy + own OAS` in the NIM
  and net-income statistic but PAID at `policy + SRF_SPREAD + CENTRAL_BANK_LOAN_PENALTY_BPS`. One
  liability, two prices, and the mis-measured one drives the dividend (rule 3).
- `src/engine/simulation/stages/sme-pools.ts:43` — the pools' entire income statement is read from
  `ctx.lastSettlementReport` immediately after the INTRADAY pass. `lastSettlementReport` is rebuilt from
  scratch every week (context.ts restores only `paymentJournal`), so every pool flow settled in the close
  and funding cycles is never counted — margin, revenue, capex and the measured default rate all run on
  part of the week. Same shape for `household-balance-sheet.ts:52`. Rule/lens: bug, 3.
- `src/engine/simulation/stages/sme-pools.ts:100` — `pool.capexUSD = min(annualRevenue × 0.05,
  investableUSD × 52)`: a cash STOCK annualised and compared with an annual flow (rule 9, stock-as-flow).
  `:95` calls all operating cost the "weekly wage bill" and sizes the 6-week buffer off it.
- `src/engine/simulation/stages/sme-pools.ts:150` — `defaultRateAnnualPct = 0.015 + coverageDistress×0.04
  + cashStressIntegral×0.06`: the pool's default rate — which prices every SME loan in the model — is a
  three-constant formula, none of them in `domain/stated.ts` (rules 13/19).
- `src/engine/simulation/stages/10-mergers.ts:258-260` — `purchasePrice = marketCap × 1.15` with a fixed
  50/50 cash/stock mix: the takeover premium and the consideration structure are posted, not negotiated or
  cleared (rules 1/13/19). `:287-288` then deletes 15% of the target's revenue and 25% of its headcount on
  the merger week with no counterparty — the workers are not laid off through the labour market and the
  revenue leaves no book (rule 14).
- `src/engine/simulation/stages/bank-lending.ts:~800` (CREDIT_CARD reprice) — `quoteHouseholdMarginBps` is
  called WITHOUT `requiredReturnAnnual`, so the card book silently prices off the fallback
  `BANK_TARGET_ROE` while the CONSUMER_TERM branch (:~845) passes `bankHurdle`. Copy-paste drift: two banks
  with different costs of equity quote the same card rate. Fix: pass `bankHurdle`.
- `src/engine/simulation/stages/bank-lending.ts:656-658` — the household origination headroom is
  `equityUSD / 0.08 − (businessLoans + householdBookRwa)`: a literal duplicating `BANK_MIN_CAPITAL_RATIO`
  (used properly in the SME pass at :279), and an RWA base that omits the facility book and everything else
  `bankRwaUSD` counts, so the headroom is overstated and origination over-runs the capital constraint.
- `src/domain/prime-brokerage.ts:52` — `maxDrawnUSD` floors the haircut at 0.01, i.e. up to 99× leverage in
  any week the measured haircuts are ~0. The stage's own comment says week 1 has no measured move and "the
  broker lends against it unprotected". Rule 2 floor with a real consequence.
- `src/engine/simulation/stages/overdraft-sweep.ts:158` — the SME facility a pool's overdraft becomes is
  written at a HARDCODED `marginBps: 350` (`:50` has the same literal as a fallback), while the identical
  conversion in 02b prices it through `facilityMarginBpsFor`. Unpriced credit + rule 3.
- `src/engine/simulation/stages/overdraft-sweep.ts` (all three legs) — no lender here tests capacity: the
  house bank, the prime broker and the region's banks (split by an imposed `bankMarketShare`) fund every
  overdraft in full. Rules 13/14.
- `src/engine/simulation/stages/securities-lending.ts:390` — stock-loan collateral is struck at market
  value once and never re-marked; there is no variation margin over the loan's life, so a squeeze produces
  no funding stress on either side and `stockLoanNetUSD` is an unfunded statistic. Rule 14.
- `src/domain/central-bank.ts:131,160,180` — `CENTRAL_BANK_SOVEREIGN_SHARE = 0.15` is both the seed share
  AND the level QT normalises the book back to; `QE_MAX_PACE_ANNUAL_SHARE_OF_STOCK = 0.10` is justified in
  its own comment by the Fed's observed peak purchase pace, and `CENTRAL_BANK_MAX_STOCK_SHARE = 0.50` by
  the Bank of Japan's actual JGB holding. Real-world OUTCOMES imported as bounds (rule 4) and used as caps
  (rule 2) — the brief's own example of what rule 4 forbids.
- `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:574-576,622-630` — the treasury's funding
  MIX is posted: `billShareTarget = max(0.15, min(0.25, 0.18 + costLean))`, bill programme split
  `[0.4,0.35,0.25]`, bond weights `{t2:.30,t5:.30,t10:.25,t30:.15}` with `steepnessAdjustment × 3` and
  floors. A real issuance profile is a policy choice, but none of these is declared and all are clamped
  (rules 2/19).
- `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:157-163` — the measured GDP growth rate is
  clamped to ±4%/wk; the code's own comment says "RULE 2, OPEN, and worse than an ordinary clamp: this
  bounds a MEASUREMENT". `:139` also floors the level at 1e11 and substitutes 1e12 on a non-finite sum.
- `src/engine/simulation/stages/estate-resolution.ts:213-215` — the workout's asset price is
  `sold × (1 − min(0.9, hurdle × weeks/52))`, a formula with a cap, and `sellAssetsToPeers:303-306`
  allocates the assets to peers pro rata to their CASH rather than to any bid. A price that is not cleared
  and a quantity that is imposed (rules 1/2/13/15).
- `src/engine/simulation/stages/shared-helpers.ts:290-311` — `attributeItemizedHoldings` fills the seed's
  institutional book greedily, largest issue first, with a hard "no single sector holds more than 40% of
  any one issue" cap (`initialization.ts:795-796`). An ownership distribution imposed at the cold start
  (rules 4/13), and a cap (rule 2).
- `src/engine/simulation/stages/shared-helpers.ts:130-133` — the PD's ladder read falls back to `0.05`
  coupon / `200` bps margin as bare literals and uses a hardcoded `0.05` as the policy rate for every
  floating tranche. Those two fallbacks ARE declared (`stated.ts` TRANCHE_DEFAULT_COUPON /
  TRANCHE_DEFAULT_MARGIN_BPS, owner `engine2/front-core.ts`) — this file re-states them instead of
  importing them (rule 3), and the 5% policy proxy is a third invented number.
- `src/domain/bank-pricing.ts:50,96` — every loan quote is floored (`Math.max(25, …)`, `Math.max(50, …)`
  bps). A floor standing in for a price (rules 2/15).
- `src/domain/bank-resolution.ts:98` — `wholesaleHaircutUSD = 0` unconditionally, so the loss order the
  file's header describes ("the unmodeled wholesale lenders take the next slice as a haircut") never
  happens and the treasury's guarantee absorbs the whole shortfall. A documented bail-in that is dead code.
- `src/domain/bank-resolution.ts:168-170` / `src/engine/macro/banking.ts:503` —
  `restateBankSheetStatistics` sets `centralBankReservesUSD = Math.max(0, cashUSD)` (an overdrawn reserve
  account silently reads zero, and `11-fiscal:643`'s "reserves cannot be negative" invariant can therefore
  never fire), falls back to a magic `0.13` capital ratio (duplicated in evolveBankingSector), and computes
  `moneySupplyM2USD` from household+corporate only while `depositsOf` counts four classes plus margin.

**MINOR**

- `settlement.ts:452` vs `:601` — the zero-instruction early return yields the MERGED report; the normal
  path returns the un-merged pass. It also skips `clearPendingNet`.
- `settlement.ts:120` — the wire for a dated row is written in the week the instruction is RECORDED, not
  the week the money moves; the payment journal row settles later. The two ledgers disagree on the week.
- `settlement.ts:97-106` — `undueOwedByPayerUSD`/`dueToPayeeUSD` are O(journal) linear scans; called per
  payer they are O(n²) over a ~160k-row journal.
- `stage-deps.ts:45` — "last week's report by name; readers want the prior close" is stale:
  `lastSettlementReport` is never restored from state, so it is within-week only.
- `02b-bank-diversification.ts:179-180` — `segmentCashUSD` and `regionBankShareTotal` are computed and
  never used. `bank-lending.ts:472` — `fundingNeedUSD` computed and never used.
- `02b:245,299` — `reg.unemploymentRate * (0.6 + riskFactor * 0.4)` duplicated verbatim at two call sites.
- `shared-helpers.ts:23` — `FOREIGN_GROWTH_SENSITIVITY = 3.0` is dead (single occurrence in the tree).
- `shared-helpers.ts:673` — `kept` is accumulated per row and then discarded by `void kept`.
- `estate-resolution.ts:531` — the opening `receivablesUSD = annualRevenue × WORKING_CAPITAL_SHARE × 0.6`
  is overwritten from the real invoice book at `:189` in the same pass: a dead formula with a magic 0.6.
- `estate-resolution.ts:441` — `e.equityCapitalUSD = Math.max(0, …)` floors an institution's capital at
  zero, hiding insolvency (rule 2). `domain/estate.ts:33` — the `COMPANY` claim holder is never constructed.
- `domain/government.ts:246` — `sovereignCouponDueShare`'s doc says "NOT WIRED YET, DELIBERATELY, AND THIS
  IS THE CONDITION"; `sovereign-calendar.ts:127` wires it. Stale, and it names a condition already met.
- `domain/banking.ts:322-334` — the "RULE 1, OPEN … Owner: HSG" block for
  `MORTGAGE_SPREAD_OVER_10Y_BPS` is immediately followed by the block saying it is gone. Contradictory
  comment pair. `:170` still documents the deleted `UNMODELED` boundary line (§7.351 removed it).
- `central-bank.ts:92` — `lastReserveDrainUSD = −sovereignCouponPaidUSD`: the name says reserve drain, the
  value is the coupon.
- `11-fiscal.ts:656` — `void issuanceCalendarWeek; void marketFundedDeficitUSD;` beside live uses of both;
  `:661` `lastIssuanceProceedsUSD = 0` is a dead write; `updatedInstitutionalSector` is copied unchanged.
- `sovereign-calendar.ts:158-168` — step 5 walks the whole accrual map once per bank (O(banks × accruals));
  an accrual belonging to a party that later ceases to exist (a defaulted institution) is never paid and
  never cleared, so `sovereignCouponPayableUSD` drifts up for ever.
- `prime-brokerage.ts:142` — a fund is priced at `annualDefaultProbability: 0`;
  `domain/prime-brokerage.ts:66` `weeklyFinancingUSD` is exported but the stage inlines the same formula.
- `sme-pools.ts:57` — receipts/costs are classified by `reason.includes('origination')` string matching
  while `ledger/payment-category.ts` exists to answer exactly that.
- `repo-clearing.ts:520` — `sheetByTicker.get(ticker)!` / `encumberedWorking.get(ticker)!` non-null
  assertions inside `strike`.
- Undeclared shape constants in these files (none in `domain/stated.ts`, rule 19): SME_WEEKLY_DEMAND_TAKEUP
  0.01, SME_SERVICEABLE_LEVERAGE 3.0, the smePoolAnnualPd band [0.002,0.25], the household appetite
  `1 + (cci−100)/100 × 0.5 − (policy−neutral) × 4` clamped to [0,2], vBurden [0.25,4], bookLtv min 2,
  `bankShare || 0.25` (bank-lending); consumerAnnualLossRate's base `max(.005,min(.12,max(0,u−.03)×1.2))`,
  its tier multipliers 0.2/1/3/10 and fallback shares .25/.50/.15/.10, CONSUMER_TERM_LOSS_SHARE_OF_CARD 0.5
  (bank-pricing); the payout ladder 0.90/0.05/0.40 at 0.14/0.11, the 0.140/0.145 special-dividend
  thresholds, `creditConditionsIndex = (0.12 − ratio)×8 + (0.025 − NIM)×10`, the 0.025/0.13 statistic
  fallbacks (macro/banking); CASH_SLEEVE_OVERNIGHT_SHARE 0.5, SRF_SEAT_STEP_BPS 1 (repo-clearing);
  TGA_TARGET_WEEKS_OF_SPENDING 10, CASH_BRIDGE_CLOSE_RATE_WEEKLY 0.34, RATE_TOOL_HEADROOM 0.02,
  QE_STOCK_SHARE_PER_RATE_POINT_ANNUAL 0.10 (central-bank); TARGET_CASH_WEEKS_OF_WAGES 6,
  TARGET_CAPEX_TO_REVENUE 0.05, the default-rate triple, `blendedMarginBps ?? 300` (sme-pools);
  FISCAL_STANCE_PROCUREMENT_SENSITIVITY 0.25, GOV_HIRING_RESPONSE_TO_STANCE 0.0004,
  PROCUREMENT_PER_PAYROLL_DOLLAR 1.07, SOCIAL_BENEFIT_REPLACEMENT_RATE 0.52 (government);
  OPERATING_LEVERAGE 2.0, MIN/MAX_ANNUAL_EBITDA_VOL 0.18/1.2, RECOVERY_PRIOR_WEIGHT 8, the 40% attribution
  cap (shared-helpers); OVERDRAFT_PENALTY_BPS 200, `haircutRate: 0.5` (overdraft-sweep);
  CENTRAL_BANK_LOAN_PENALTY_BPS 100, the 1e6 raise/repay thresholds (bank-lending);
  CREDIT_COLLATERAL_DURATION_YEARS 5 (prime-brokerage); the merger's 1.15/0.5/0.85/0.75 and the
  divestiture's [0.05,0.9] clamp (10-mergers); the estate's 156-week / 260-week / ÷100 / 0.9 discount
  constants (estate-resolution).

**NOTES (checked, fine, or already owned)**

- Settle-week carry: a due row is applied exactly once — `runSettlementStage` applies rows with
  `rowDue`, then rebuilds `ctx.paymentJournal` from the undue rows only, and no wire is re-written. No
  double settlement and no lost row across the three cycles (settlement / settlement-close /
  settlement-funding) or the extra passes bank-resolution and bank-funding-close run inline.
- `comp.cash` has one mover: every cash write in my files goes through `pay`/`payByIds`/`journalPayment`
  and `projectBooks`; the direct account calls I found (`adjustSectorRow`, `adjustBankReserves`,
  `moveSectorRowsToBank`, `moveBankReserves`) are ledger operations with both legs in the same pass.
- The SRF's quantity response IS real (repo-clearing.ts:400-415: a seat with `maxHoldingUSD = needUSD` at
  `srfBps − 1`, taking the residual) — rule 1's exception is satisfied on the SRF side. Only the RRP side
  is not (CRITICAL above).
- Bill economics: bills are issued at face and repaid at the ACCRETED holding, so the treasury does bear
  the full accretion cost and the holders' weekly accretion (`bill-accretion.ts`) is not money from
  nowhere; the CB's remittance of its own accretion is matched by its book writing up. The remaining gap
  (bills sold at face rather than discounted) is named in 11-fiscal:672 with an owner.
- PCA / least-cost P&A: `isBankUnderPca` and `assumingCapitalUSD` both read `bankRwaUSD`, which counts only
  the two loan books — sovereigns, desks, repo-lent and PB loans consume no capital in the test, so PCA
  fires late and the assuming bank is under-capitalised for what it takes; consistent with the (also
  partial) RWA base used for origination headroom, so it is one definition, not two.
- `assumeBankBooks` does move the whole sheet both ways and `bank-resolution.ts:180` throws if anything is
  left on the shell — rule 14 is honoured for every line except the CB loan named above.
- The estate waterfall respects absolute priority (SECURED → UNSECURED → EQUITY, pro rata within a class,
  `distribute:355-380`) and never overdraws the debtor's account.
- [13c-site] `estate-resolution.ts:497-520` — estate claims are opened at the holder row's `qtyUSD`
  (marked value), while the bank facility claim uses ladder PRINCIPAL. Two bases in one waterfall; at par
  today, wrong the week credit marks move.
- [13c-site] `sovereign-calendar.ts:100-115` — the institutions' coupon accrues on `H.qtyUSD[r]`, the
  banks' on the sheet's tenor book; both are value, not face.
- [13c-site] `repo-clearing.ts:96-108` — collateral capacity and haircuts are applied to
  `sovereignBondHoldingsByTenor` USD, treated as face throughout (`encumberedFaceByBucket`, the
  over-pledge check). A pledge is a claim on FACE.
- [13c-site] `11-fiscal.ts:270-300` — redemption pays each holder `heldUSD × redeemedFraction`, i.e. the
  marked/accreted holding rather than the maturing face; `lastUnsoldMaturedUSD` is then face minus a value.
- `bookPnL` is the single bank-P&L write in every file here (bank-lending, estate-resolution,
  sovereign-calendar, bill-accretion); the only other equity mover is settlement's
  `bankEquityDeltaByBank` projection, which is the own-account legs. Consistent.
- `mergeSettlementReports` spreads `...b` first, so every non-merged field takes the LATER pass's value —
  correct for the maps it then overwrites.
- `sme-pool.ts`, `household-credit.ts`, `collateral.ts`, `domain/repo.ts` and `domain/securities-lending.ts`
  read clean.

### A8 — The real economy, labour, goods, FX, commodities, indices

**RAW NOTES (to be sorted)**
- `src/engine/simulation/stages/05-unit-bidding.ts:660` — dead-supplier contract sets `custUp.inputSupplyConstraintFactor = min(x, 0.70)`: a bare 0.70 shape constant (undeclared, rule 19) standing in for "how much a lost supplier throttles you".
- `05-unit-bidding.ts:118` CONTRACTED_DEMAND_SHARE=0.6, :150 PROGRESS_PAYMENT_SHARE=0.30, :139 SUPPLIER_MIN_SOURCING_WEIGHT=0.05 — self-documented as rule-4/13 open items (owner named) — check stated.ts declaration.
- `05-unit-bidding.ts:597` `T.priceUSD[r] = Number((...).toFixed(4))` inside the portable "pure arithmetic" core — string round-trip contradicts the roundN relabel at :59.
- `05-unit-bidding.ts:626` fillRate<0.95 threshold — undeclared shape constant.

**05-unit-bidding.ts (2655 lines, read in full)**
- :2427 `if (random() >= 0.15) return;` — 15%/wk contract-formation hazard, undeclared (rule 19).
- :2434-2437 supplierPowerFactor `0.5+(share-0.25)*0.5`, customerBargainingPower `(rel>1?0.6:0.4)`, price `*(1-(cbp-0.3)*0.05)`, `duration = 12+rand*40` — a stack of invented bargaining constants; the contract price is a FORMULA off the published print, not a cleared/negotiated outcome (rule 1/13/19).
- :2452-2455 SECOND PD MODEL: `impliedPd = 1/(1+exp(interestCoverage*0.8 - leverage*0.4))`, `costOfCapital = 0.05 + impliedPd*0.60`, `contractPrice *= 1+coc*0.20` — directly contradicts the ":1180 ONE PD model (§6.1's three-PD-models row)" comment which uses computeAnnualDefaultProbability. rule 3 (two representations) + stale comment.
- :1182-1183 `expectedLoss = pd*0.60; costOfCapital = 0.05 + expectedLoss` — LGD 0.60 and a flat 5% cost of capital invented in the goods stage while the model clears real rates/curves (rule 1/19). Duplicated verbatim at :2453.
- :1198 `marginPremium = costOfCapital * 1.5` — 1.5 undeclared.
- :841 `warehouseCapacityUSD = comp.annualRevenue * 0.15`; :851 throttle slope `*0.7`; :896 `SECTOR_PPE_INTENSITY[sector] ?? 0.5`; :898 acc-dep fallback `*0.45` — undeclared shapes.
- :1602-1611 `if (subUnitId === 'passenger_vehicles')` — the stage switches on ONE product id and hardcodes a durable-stock model (scrappage 0.12/yr, stock multiple 3.5, target share 0.10, adjustment 0.05). Rule 17 (a stage may not switch on industry/product) + rule 19. Second site at :2247.
- :906 `if (subUnitId === 'commercial_rental_services' && CRE_SUPPLY_X)` and :2593 `CRE_MARKET_LIVE=0 && subUnit.unitId==='commercial_rental_services'` — the same rule-17 switch, env-gated.
- :1319 `cashConstrainedQtyModifier = cashRatio < 0.02*riskAversion ? 0.70 : 1.0` — bang-bang capital rationing, 0.02 and 0.70 undeclared.
- :1626 `smoothedUnitPriceUSD = basis*0.75 + anchor*0.25` — undeclared EWMA weight, and it feeds the produce/idle decision.
- :660 `inputSupplyConstraintFactor = min(x, 0.70)` on a dead supplier — undeclared.
- :626 `fillRate < 0.95` short-week test — undeclared threshold (twice, :735).
- :2648-2652 `baselineVol = 0.16` and `regimeVolPremium = Recession?0.08:Slowdown?0.03:0` — the comment at :2637 says the local 0.16 fallback was deleted; it is still here. Also a switch on the USA regime only: `marketVolComponent` (used world-wide) is a function of the USA composite alone.
- :597 `T.priceUSD[r] = Number((...).toFixed(4))` inside the "portable pure arithmetic" core — string round-trip; the file's own :59 roundN relabel exists to avoid exactly this.
- CURRENCY UNITS: :1747 `convertLocal(clearedPriceUSD, origin, buyer, fx)` then :1943 `payByIds(..., l.units*exWorksBuyerMoney, R_EXWORKS)` — the ledger's `amountUSD` is fed BUYER-LOCAL money throughout the goods auction (comment at :1979 admits "keeps today's buyer-money convention"). Every `...USD` field in this stage (clearedPriceUSD, salesUSD, purchasesUSD, invoicedUSD, sellerTotalUSD) is region-local money. rule 9 ("a field named USD is not a share" / periodicity+unit), and it makes cross-region sums (bilateralTradeWeeklyUSD is correctly converted; the pay legs are not) inconsistent.
- RULE 14 (both legs same pass, same pairing): the household/government/segment GOODS leg moves lot-by-lot with its real seller (:2213 `deliverGoods(partyOfKey(l.sellerKey...))`), but the CASH leg for those same buyers is spread PRO RATA across every seller in the book by revenue share (:2201-2210 `sale.amount/sellerTotalUSD`). The two legs of one trade use different counterparties; a household pays a seller it never bought from.
- :2149 `hhUsdAll = hhUnitsAll * book.clearedPriceUSD` vs `aggregateUSD = sellerTotal - corporate - segment`: the household's implied payment is a residual, not what its own fills cost; if the residual and the claim disagree the difference is silently redistributed.
- :2244 government spend converted with `convertLocal(spendOriginMoney, origin, regionId)` while the gov CASH leg at :2216 pays the raw origin-money amount — same number, two units.

**01/02/03/04/06/07**
- 02-region-macro.ts:43 `bottomUpUnemploymentDelta = -employmentChangePct * 0.1` — a stock (unemployment rate) moved by a flow (% change in employment) times an invented 0.1; no labour force in the denominator. rule 19 + stock-vs-flow.
- 02:48 `baselineExpectedCapEx = baseGdp*0.03/52` — a 3%-of-GDP capex norm is a real-world equilibrium (rule 4) and undeclared (19). :50 `boundedGdpContribution` is named "bounded" and is not bounded (dead/misleading name).
- 02:22-23 `globalInflationShock=(random()-0.5)*0.0008`, `globalGdpShock=*0.001` — undeclared, period unnamed.
- 02:29-32 four `if (regionId === 'USA'/'EUR'/'UK'/'JPN')` lines picking the composite — a stage switching on region identity instead of a registry lookup (rule 17 in spirit); adding a region is 4+ edits.
- 02:135 `creditConditionsSpilloverAdjustment = (globalStanceAvg - stanceOf(r)) * 0.05` — invented transmission coefficient.
- 01-macro-feedback.ts:63 `Math.min(1, ...)` clamps systemic stress; :56 `creditRating === 'CCC'` literal cohort test.
- 03-category-demand.ts:270-272 smoothing 0.1/0.05/0.08 selected by `buyerMix.HOUSEHOLD > 0.5` / `GOVERNMENT > 0.5` — undeclared shape constants chosen by a threshold switch.
- 03:141 `laggedCorporateDemandBase*0.95 + raw*0.05`; :296 `crowdingIntensity = clamp((supplyGrowth*8 - growthAnnual),0,1)` (magic 8 + a clamp, rule 2); :313/:317 `newLevel*0.10` inventory seed.
- 03:293 `rawGrowthAnnual = ((newLevel/prevLevel)-1)*52` — a weekly ratio linearly annualised and stored as `demandGrowthAnnual` (rule 9: ×52 is not compounding, and the reader treats it as an annual rate).
- 04-input-output.ts:129 `targetPriceIndex = 1 + (clearingRatio-1)*0.4`, :130 `newPriceIndex = old*0.85 + target*0.15` — a PRICE INDEX SET BY FORMULA from a demand/supply ratio, with three invented coefficients (rule 1, rule 15). This `upstreamScarcityIndex`/`inputCostPressure` is a SECOND, disconnected representation of the input price that stage 05 actually clears (rule 3).
- 04:120 `inventoryHoldingDecayRate = (0.015 + glut*0.35)/52` — invented obsolescence; :123 supply is `weeklySupplyUnits*spotPrice` rationed to a region by its share of global bids — an imposed allocation, not a clearing (rule 13).
- 04 has NO cash leg anywhere: inventory is consumed and a price index moves with nobody paying anyone (rule 14).
- 04:145 `supplier.inventoryLevelUSD` is a third inventory beside the goods ledger's real stock and stage 03's seed.
- 07-commodities.ts (16 lines) does NOT supersede `macro/evolution.ts:1424-1427`; it is a thin wrapper and evolution.ts is the ONLY writer of `spotPrice`. But that writer is `spot*exp(drift*0.4 + clamp(±0.04,(ratio-1)*0.12))` with `Math.max(0.5, …)` — the commodity spot is a DRIFT FORMULA with a hard floor and a hard clamp, not a cleared price (rule 1, rule 2, rule 15). The cleared thing beside it is the futures curve (07i), so spot and the curve are two disconnected representations.
- evolution.ts:1444 `inventoryLevelPct = clamp(0,100, pct + (random()-0.5)*3 - yieldLoss*40)` — a physical stock moved by noise and clamped (rule 13/2).
- 07-commodities.ts:14 passes `updatedRegions.USA.gdpGrowth` and `USA.zeroRates.tenor3M` into every commodity: the world commodity price is driven by one region's growth (`demandShock = globalGrowth*0.8`, evolution.ts:1400).
- 06-fx-and-trade.ts:59-60 `exportsUSD = weekly*52` — correctly named annualised run-rate; fine.

**labor-market.ts (854 lines)**
- :585-596 THE WAGE DOES NOT BUY LABOUR. `fillRatioByOcc[occ] = hires/vacancies` is one number per occupation and `filledFor()` applies it to every employer identically — a firm's `offeredWageIndex` has ZERO effect on how many of its vacancies fill. The comment at :578 ("the constraint HH6 lets it answer by paying more") is false: paying more only lowers quits (:262). Labour is rationed pro rata by posted vacancies, not cleared on price (rule 1/15).
- :592 `Math.max(1, Math.round(comp.employeeCount + hired - layoffs - quits))` — a hard floor of one employee per firm; a firm can never shed to zero (rule 2).
- :502 `supplyForOcc = totalLaborForce * shares[occ]` (fallback `?? 0.2` twice, :503/:806) — occupational labour supply is an imposed fixed share with NO mobility between occupations, so an occupational shortage can never be relieved (rule 13/19).
- :186 `inflationAnnual = reg.inflation ?? 0.02` — a 2% fallback is a real-world equilibrium (rule 4).
- :318 `realRevenueUSD = comp.annualRevenue / Math.max(0.05, outputPriceVsBaselineOf(...))` — 0.05 floor (rule 2).
- No cash leg anywhere for the labour flows: layoffs cost nothing (the header at :23 claims "severance and notice are real frictions" — no severance is ever paid), hires cost nothing, and only the wage BILL is paid elsewhere (rule 14 / stale comment).
- The whole mechanism runs on ~13 bare exported constants in `domain/region-macro.ts:489-621` (LABOR_PRODUCTIVITY_GROWTH_ANNUAL 0.012, VACANCY_WITHDRAWAL_RATE_WEEKLY 0.10, WAGE_PUSH… 0.10, COST_OF_LIVING_PASS_THROUGH 0.6, WAGE_PULL… 0.45, MARKET_WAGE_CATCHUP_SPEED_WEEKLY 0.15, RENT_SHARE_TO_LABOUR 0.12, NEUTRAL_LABOR_TIGHTNESS 0.95, MATCHING_ELASTICITY 0.5, HIRING_ADJUSTMENT_SPEED_MULTIPLE 1.1, LAYOFF_SPEED_MULTIPLE 0.6, DISTRESS_LAYOFF_SPEED 0.10) — none declared via `stated()` (rule 19). These ARE the labour market's answer.
- :760 `reg.governmentEmployment` enters the employment stock but never posts a vacancy or a layoff — government headcount is exogenous and constant (defensible as POLICY, flagged only because it silently anchors u).
- NOTES-fine: seekers = supply − employedBefore + separations is a correct gross-flow stock; `unemploymentRate` is a pure identity off the real stock (the old 50% cap is genuinely gone); the vacancy>laborForce `throw` at :845 is a real guard, not a clamp.

**The goods auction core (double-auction.ts, followed to confirm 05's price)**
- `double-auction.ts:116` `if (guard++ > 10000) break;` — the discovery walk advances one index per iteration, so a book with more than ~10,000 orders (household ladders: cohorts x rungs, plus every corporate rung x 4 origins) SILENTLY stops clearing partway: clearedPrice and clearedQuantity are struck on a truncated book, with no defect and no trace.
- `double-auction.ts:126` `clearedPrice = (bid.maxPrice + offer.minPrice)/2` — the print is the MIDPOINT of the marginal buyer's reservation and the marginal seller's floor. In a saturated (short) market the clearing point is the marginal buyer's reservation; averaging it with the seller's cost floor parks half the print on a bound (rule 15) and makes every price a fixed blend of the two sides' bounds regardless of which side is constrained.

**Other files**
- price-index.ts:150-155 `seedCpiHistory` fabricates 53 weeks of CPI compounding at the inflation TARGET; 11-fiscal:86-93 reads `cpiHistory[0]` for YoY from week 1, so `reg.inflation` is a fabricated YoY for the first 52 weeks — and it feeds the Taylor rule, the labour deflator and the news. Rule 9 names this exactly ("a missing change is information, a fabricated one is a lie") and rule 4 (a CB that hit its target is a real-world outcome).
- price-index.ts:71 `FOOD_AND_ENERGY_SUBUNITS` is a hardcoded set of sub-unit ids outside the registry (rule 17).
- macro/indices.ts:66 `if (firms.length === 0) return baseIndex;` — the function returns a fractional CHANGE everywhere else (:105 `prevUS * (1 + usChange)`), so an empty region or sector multiplies its index by ~1001 in one week. Latent, and fires the first time a sector empties.
- macro/indices.ts:175 `generate52WeekHistory(val, 0.015)` fabricates a year of history for EVERY index at inception (rule 9).
- macro/indices.ts:230-236 the PMI: `50 + 50*tanh(g*4)`, `tanh(g*52*3)`, `tanh(g*52*5)` — three invented scalings, and it is computed from USA firms/regions only while being published as a global composite.
- macro/indices.ts:257 comment contains a Cyrillic word ("a name's риск premium").
- weather.ts:180-184 `yieldScale` 0.35/0.20/0.30/0.25, :156 hazard `Math.min(0.5, totalWeight*0.4)`, :171 `intensity = min(1, |season|*(0.4+random()))`, :123 `2 + floor(random()*4)` — all undeclared shape constants (rule 19).
- weather.ts:196 documents `yieldImpactPct` as "a share of THIS REGION's supply", but `macro/evolution.ts:1416-1421` sums it across regions and applies it to the GLOBAL `supplyUnits`, clamped at 0.9: a drought in one region cuts world supply by the full share. Producer and consumer of the field disagree (rule 3) + a clamp (rule 2).
- fx-market.ts:112 `MAX_WEEKLY_FX_MOVE_PCT = 8` is a DEAD export — no use site anywhere in the tree (only two comments). Its 15-line doc describes a damper binding 38 of 40 weeks that no longer exists; fx-clearing.ts has no such bound. Delete it or the doc misleads the next reader.
- fx-clearing.ts:104 `Math.abs(deltaUSD) < 1e5` — an undeclared $100k dust threshold on the cross-border securities FX leg.
- fx-market.ts:99 `CENTRAL_BANK_FX_INTERVENTION_SHARE = 0.10` undeclared.
- freight-clearing.ts:210/:239/:246 `laneFillRatio`, `shippedShareByLaneSubUnit`, `laneCapacityTonnes`, `laneBookedTonnes`, `carrierFuelBurnedTonnes` are computed every week and READ BY NOTHING in the live engine (only the seed reads revenue/tonnes). The header claims "so the goods auction sources only what can arrive": it does not. Freight capacity never rations goods — 05 ships and pays freight on every lot regardless — and `profiles/carrier.ts:41` then clamps `utilization` at 1, hiding the physical overshoot (rule 2, rule 13).
- profiles/carrier.ts:44-55 `annualFuel` is booked as a cost with NO purchase: a carrier's `productLines` is `[]` (bootstrap/carriers.ts:358) and `PROFILE_INPUT_BASKET` (industry-registry.ts:863) has NO `CARRIER` row, so `firmInputIntensities` returns {} and a carrier bids for NOTHING in stage 05. The world fleet's bunker demand never reaches the refined_products market and nobody is paid for the fuel (rule 14). It also has no premises, software or maintenance basket at all, unlike BANK/INSURER/ASSET_MANAGER.
- foreign-direct-investment.ts:145-150 the parent's capitalisation `pay()` crosses a border with NO FX conversion, while the file header claims it goes "through the same FX path every cross-border payment takes" (rule 9 + stale comment). :133 `annualRevenueUSD: revenueUSD` imposes the subsidiary's revenue rather than letting it be produced (rule 13); :136 `Math.max(0.02, margin)` floor.
- sourcing-intent.ts:246 `regions[r]?.policyRate ?? 0.045` — a 4.5% fallback (rule 4).
- trade-invoice.ts:78 `Math.max(1, Math.floor(weeks))` — a seller that can fund no credit still extends one week (rule 2, minor).
- cross-border.ts:41-49 `HOME_BIAS_BY_ENTITY_TYPE` — seven stated levels, self-documented as rule-19 PREFERENCE but not declared in `domain/stated.ts`.
- 09-concentration-risk.ts:25 `CONCENTRATION_FLAG_THRESHOLD = 0.40` undeclared (disclosure convention, low severity).
- news-derivation.ts:311 reports `after.inflation` as "annualised inflation" — for 52 weeks that is the fabricated YoY above.
- 13-news-and-turn-summary.ts:33 `marginUtilizationPct: navUSD > 0 ? … : 100` — a NAV<=0 account reports exactly 100% utilisation rather than a defect.

**NOTES (checked, fine)**
- index-calculation.ts chain-links correctly: level struck on the pre-rebalance membership, value re-based after (no rebalance return).
- invoice-currency.ts seeds NO dollar dominance: the vehicle currency falls out of measured pair illiquidity, and the all-zero-illiquidity case resolves to the short side's own money. Rule 4 satisfied.
- carrier.ts / geography.ts / goods-physical.ts are genuine physics primitives (value density, hull specs, lane distances); nothing imported is an equilibrium.
- fx-clearing.ts: `toFixed(4)` on the rate is safe because every seeded rate is O(1) (productivity ratios, bootstrap/commodities-and-fx.ts:107).
- 02-region-macro.ts:41's employment asymmetry is not a persistent bias: stage08-back.ts:1891 zeroes both counts on default.
- labor-market.ts: `seekers = supply − employedBefore + separations` is a correct gross-flow stock; the unemployment rate is a pure identity with no cap.

### A9 — The derivative layer

**MAJOR**
- `src/domain/derivatives/classes/cds.ts:58-66` + `src/engine/simulation/stages/derivative-lifecycle.ts:122` —
  **a credit event pays par less a REGIONAL AVERAGE, not the defaulted name's own workout.** The
  profile's own doc says "the seller pays par less what the workout ACTUALLY recovers (G5, §7.192)",
  but the provider wired in is `recoveryRate: (r) => creditRecoveryRate(region(r))` — the region's
  blended prior/realised rate. Meanwhile `estate-resolution.ts` runs a real per-issuer waterfall
  whose recovery is computable. Two representations of one quantity (rule 3), and the protection
  buyer's payout is an imposed number rather than the outcome (rule 13). It also removes the thing
  that makes CDS interesting: basis risk between the hedge and the actual claim. Fix: settle the
  event against the estate's realised recovery on THAT issuer (defer to the workout, as a real
  auction does), and keep the regional rate only as the pre-default mark.
- `src/domain/derivatives/classes/irs.ts:47-53` and `cds.ts:69-75` — **close-out replacement values are
  undiscounted.** The IRS sums `notional × (strike − par) / 52` over every remaining week to maturity
  with no discount factor; the CDS multiplies the spread change by `remainingYears` flat, with no
  discounting and no survival weighting. A replacement value is a present value. On a 10-year swap
  this overstates the close-out by roughly the duration effect, and it is real money: close-out is
  what a defaulting counterparty's estate is charged. The IRS comment defends the shape ("the same
  leg arithmetic the live contract pays, so close-out and carry can never disagree") — that argues
  for consistency, not for omitting discounting from both.

**MINOR**
- `src/domain/derivatives/classes/fx-forward.ts:30` — `HEDGE_RATIO_EQUITY_RETURN_SEEKING = 0.35` is a
  genuine SHAPE parameter (how much of its foreign equity a return-seeking book hedges) standing in
  for a decision the brains could now make; undeclared in `stated.ts`. Its two neighbours (1.0 for
  fixed income, 1.0 for liability-driven) are argued as regulatory/mandate facts and are fine.
- `src/domain/derivatives/registry.ts:43` — `DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM = 0.25` is a defensible
  POLICY primitive (a desk's risk appetite) but is undeclared.

**NOTES**
- **This is the best rule-14 implementation in the tree.** `registry.ts:34-88`: one PFE budget across
  every class on one balance sheet, charged on BOTH sides of a contract, consumed in pipeline order,
  and `deskNotionalCapacityUSD` genuinely reaches zero — "a desk at zero is why a hedge can be
  unavailable at any price, which no formula-priced hedge can express". Finite capacity with a named
  counterparty, exactly as rule 14 asks.
- Rule 9 is clean across the classes: every periodic leg divides an annual figure by 52 at the point
  of use (`irs.ts:44`, `cds.ts:52`), and the identifiers name their period (`strike` documented as
  "bps of notional per year", `PHYSICAL_STORAGE_COST_ANNUAL`).
- `commodity-future.ts:11-18` records a closed rule-14 defect worth keeping visible: the old book
  re-marked carried positions with NO cash leg, so weekly variation margin was structurally zero for
  the book's whole life. The fix (cumulative-value-settled-as-delta) is the right shape.
- `PHYSICAL_STORAGE_COST_ANNUAL` (`commodity-future.ts:33-37`) and `CDS_TENOR_WEEKS` / `FX_FORWARD_TENOR_WEEKS`
  are TECHNOLOGY and market-convention primitives — rule 4 admits both. `LARGE_EXPOSURE_LIMIT_OF_CAPITAL`
  is a regulatory primitive and turns 09-concentration's measurement into a decision. Correct.
- `equityHedgeRatioFor` (`fx-forward.ts:32-38`) dispatches through the institution and strategy
  registries rather than switching on entity type — rule 17 satisfied.

### A10 — Domain modules and the company generator

Files: src/domain/{industry-registry, industry, company, instruments, markets, preferences, stated,
units, assets/index, defect, events, game-state, index, sovereign-id, institution-profiles,
volatility, market-microstructure}.ts; src/engine/simulation/stages/profiles/*.ts; src/types.ts;
src/engine/companyGenerator.ts (all 1305); src/engine/bootstrap/{firms, carriers, population,
labor-and-wages, close-seed, commodities-and-fx, category-demand}.ts.

**CRITICAL**

- `src/engine/bootstrap/carriers.ts:284,336,338` — a carrier is seeded with `totalDebt: debtBase`
  (up to 55% of hull value) and `debtTranches: []`. `Company.totalDebt` is not a field any more
  (`domain/company.ts:329`); the engine's `totalDebt` lane is a READ of the ladder
  (`engine2/company-store.ts:83-89` `ladderTotalUSD`) and `core.ts:123` `seedLadder(v2, c.id,
  c.debtTranches)` seeds an EMPTY ladder. So every carrier opens with ZERO debt in the engine while
  its seeded `annualInterest` (`:285`), `coverage` (`:286`), `leverage` (`:287`), `creditRating`
  (`:291`), `netIncome`/`eps` (`:332-333`) and `stockPrice` (`:306-314`) were all struck against
  that debt — and no bank or investor holds the loan. Rule/lens: 1.3 (two representations), 1.13/1.14
  (a liability with no counterparty), §7.4 (seed shape ≠ engine shape). Fix: issue the ladder through
  `issueTranche`/`seedLadder` with a named lender, or derive the seed metrics from the empty ladder.

- `src/engine/companyGenerator.ts:741-790, 827-835, 933-941` — the three places a firm's revenue is
  RESCALED (roster padding clone, `UNIVERSE_SCALE` thinning lift, `normalizeProducingSectorRevenue`)
  scale `annualRevenue`, `baselineAnnualRevenue`, `sharesOutstanding`, PP&E, tranche principals and
  opening cash but NOT `ebitda`, `ebit`, `netIncome`, `eps`, `capex`, `maintenanceCapex`,
  `growthCapex` or `currentLiabilities` — all copied unscaled via `...parent` / left in place. A
  padding clone at `revenueScale = 0.3` therefore carries 100% of the parent's EBITDA and net income
  on 30% of its revenue (implied margin >1), and `front-core.ts:680` reads exactly that ratio
  (`S.ebitda[row] / annualRevenue`). Only BANKS are repaired downstream
  (`simulation/initialization.ts:1080-1092`). It also means the clone's seed `stockPrice` (the
  parent's) times its scaled shares prices the parent's earnings. Rule/lens: 1.3 / bug. Fix: scale
  the P&L lines with revenue in all three sites, or re-derive them from `baselineEbitdaMargin`.

**MAJOR**

- `src/engine/companyGenerator.ts:19-21` `FIXED_SHARE_BY_RATING` (AAA 0.90 → CCC 0.10) — an imported
  real-world ratings→fixed/floating funding mix; the comment at `:341-345` argues it from observed
  market behaviour. A SHAPE/OUTCOME, not declared in `domain/stated.ts`. Rule 4/19. Fix: derive the
  split from the issuer's own covenant/coupon economics, or declare it with a scheduled death.
- `src/domain/industry-registry.ts:1283-1310` `derivedLabourShareOfValueAdded` — the doc (`:1266-67`)
  says the cross-sector weighting is "each sector's own share of the economy's OUTPUT"; the code does
  `total += 1` per sub-unit, i.e. an UNWEIGHTED mean over 37 sub-units (a count weighting). This one
  number sets every occupation's base wage (`bootstrap/labor-and-wages.ts:94-98`), hence household
  income, every payroll and the crew cost. Rule/lens: bug / 1.9. Fix: weight by each sub-unit's own
  output (or state that the weighting is by count).
- `src/engine/companyGenerator.ts:545-548` — argument swap. The signature is
  `(… oasSpreadBps, marketCap, dividendYield, prevSnapshot …)` (`:153-156`); all four seed snapshots
  pass `(oasSpreadBps, 0.02, marketCap, snapQn)`, so `marketCap = 0.02` and `dividendYield =
  marketCap`. Harmless today ONLY because the single use is their product (`:271`). Rule/lens: bug.
  Fix: swap the two arguments.
- `src/engine/companyGenerator.ts:633-637` `leveragedLoan: { pricePar: 98.75, tenorYears: 5,
  recoveryRate: 0.65 }` — a loan PRICE stamped on at generation, plus real-world loan-market recovery.
  `:552-553` sets `quotedMarginBps = oas*0.85 + 35` and `discountMarginBps = oas*0.85` by formula.
  Rule 1/15 (a price/margin that is not cleared). Fix: open the quote from 07d's first clearing.
- `src/engine/companyGenerator.ts:554` and `src/domain/company.ts:228` — `'SOFR' | 'EURIBOR' |
  'SONIA' | 'TONA'` as a benchmark name AND as a TYPE. Real-world identifiers. Rule 4. Same class as
  `src/domain/markets.ts:21-45` (`usaComposite`, `usIgOas`, `global10YBenchmark`, …), which the file's
  own header already flags "RULE 4, OPEN". Fix: rename both halves together (IDX).
- `src/engine/companyGenerator.ts:575-582` — `technicalReservesUSD = rev*4`, `insuranceClaimsPaidUSD
  = rev*0.70`, `aumUSD = rev*60` (hedge fund `rev*20`), `managementFeeRate = 0.0225 / 0.0075`. The
  comment names "2-and-20" outright. Real-world equilibria (fee levels, loss ratio, AUM multiples),
  none declared in stated.ts. Rule 4/19. Same number again at
  `profiles/insurer.ts:35` (`lossRatio = 0.70 ± 0.10`) and disagreeing at
  `profiles/asset-manager.ts:23` (`0.005 + U*0.005` — a THIRD fee rate for the same firms, rule 3).
- `src/engine/companyGenerator.ts:400-418` — the sector→ProductCategory map is written out TWICE,
  verbatim, as an if-chain, and `Financials`/`Banks` map to `'SoftwareDigitalServices'`, so insurers,
  asset managers and pension funds size their opening revenue off SOFTWARE demand. Rule 17 (a switch
  on sector outside a registry/profile) + copy-paste. Fix: read `INDUSTRY_REGISTRY`'s sector map once.
- `src/engine/companyGenerator.ts:436` — a bank's opening revenue is `NIM × assets × share × 2.2`.
  The bare `2.2` has no derivation anywhere; `:430` also falls back to `bankShare ?? 0.25` (an
  imposed 1/4 market share, repeated at `profiles/bank.ts:21`). Rule 13/19. Fix: derive from the
  bank's own opening earning assets (the `initialization.ts:1080` rule already does).
- `src/engine/bootstrap/firms.ts:153-160` `SECTOR_PROFILE` — margin (Tech 0.42 … Consumer 0.17),
  leverage, cashToEbitda and beta per sector. The file itself marks margin and beta "RULE 13, OPEN";
  `leverage` and `cashToEbitda` carry no such note and are the same kind of claim. Recognisably
  real-world sector levels. None declared in stated.ts. Rule 4/13/19.
- `src/engine/bootstrap/firms.ts:130` `SME_WAGE_GAP = 0.22`, justified in its own comment as "a
  robust, well-documented fact in every developed economy (roughly a fifth to a quarter)". That is a
  real-world OUTCOME imported as an input, and it is load-bearing (the comment says so). Also
  `:115 SME_MARGIN_DISCOUNT = 0.35`, `:179 MIN_COVENANT_TAKEUP = 0.15`, `:166 FIRM_SCALE_UNIT_USD`,
  `:170 INTEREST_RATE_ASSUMPTION = 0.045` (the comment admits the curve is already bootstrapped and
  could be read). None declared. Rule 4/19.
- `src/engine/bootstrap/firms.ts:335-350` — asset-manager institutional shares are hardcoded
  `0.17 / 0.10 / 0.06` and the pension fund `0.18`, while the comment at `:331-334` claims "the 0.33
  sector slice is split between them by size" on the firm-size curve. 0.17/0.10/0.06 is a decay of
  ~0.59, not `SEED_FIRM_CONCENTRATION_DECAY = 0.80`; the insurers (`:323-329`) and hedge funds
  (`:354-362`) DO use the curve. Imposed ownership shares of the institutional pool (only the
  insurers' 0.42 is declared in stated.ts). Rule 4/13/19 + code/comment mismatch.
- `src/domain/industry-registry.ts:1027-1029, 1042-1047` — `CAPEX_ORDER` and `LINKAGE_ORDER` hardcode
  the five capital-goods ids and the nine commodity ids with `!` assertions. A new capital-goods
  sub-unit carrying a `capexBasketWeight`, or a new `linkedCommodities` entry, silently does NOT
  appear in `VIEW_CAPEX_SUPPLIER_WEIGHTS` / `VIEW_BASE_COMMODITY_CATEGORY_LINKAGE`. Rule 17's
  targeted-change test fails for both (the price-tier view at `:1037` already has the right fallback).
  Fix: build both views from the registry and use the order lists only to order what is found.
- `src/domain/assets/index.ts:173-174` — `heldInShares` tests `'MMF_SHARE'`, which is not a member of
  `HoldingType`, the superset this module exists to be the single owner of (`:88-90`, `:68-87`).
  `HOLDING_CLASS`, `hedgedAsFixedIncome`, `carriesRateDuration` and `isVehicleClaim` therefore all
  return undefined/false for a money-fund share. Rule 3/17 — exactly the drift the header forbids.
- `src/engine/bootstrap/carriers.ts:271` — `usefulLife` is taken from `assets[0].mode` only, and the
  round-robin at `:169-182` routinely gives one carrier both ocean hulls and domestic trucks. The
  whole fleet then depreciates on the first asset's life, so `ebit`, the rating and the seed price
  are wrong for every mixed-mode carrier. Fix: sum `spec.capitalCostUSD / spec.usefulLifeYears`
  per asset. (`:283` likewise hardcodes `COVENANT_LEVERAGE_CEILING.B` for every carrier.)
- `src/domain/institution-profiles.ts:66,76` — an insurer's and a pension's derived hurdle rate is
  clamped to `[0.02, 0.30]`. Rule 2 (a bound standing in for the mechanism). `:81`
  `subInvestmentGradeSizeFactor: 2.0` for ASSET_MANAGER is justified in its own comment by the price
  print it prevents ("every name cleared at saturation") — a constant sized to close a number
  (rule 18/19), undeclared.
- `src/engine/simulation/stages/profiles/asset-manager.ts:19-22` — `flows = (random() - 0.4) * 0.01`
  is a BIASED weekly AUM flow (+0.1%/wk ≈ +5.3%/yr) arriving from no counterparty, applied whenever
  no `InstitutionalEntity` backs the shell; the fallback AUM is `annualRevenue * 50`. Rule 14 (a
  one-sided flow) / rule 1. `:17` also picks the composite index by a region if-chain that silently
  falls through to JPN for any unlisted region.
- `src/engine/companyGenerator.ts:38-59` `getCategoryDemandSeedUSD` — a 14-arm switch on category
  with hand-set shares of `income*0.95 / *0.18 / *0.08`. Rule 17 (a switch on industry outside the
  registry) + rule 19 (14 undeclared SHAPE constants). The function's own successor
  (`producingSectorNamedTierDemandUSD:84-100`) already reads the registry; this one is still live at
  `:424`. Fix: delete it in favour of the registry-derived demand vector.
- `src/engine/bootstrap/labor-and-wages.ts:38-44` `BASELINE_OCCUPATION_LABOR_FORCE_SHARE`
  (0.55/0.15/0.12/0.08/0.10) and `:29 SKILL_TIER_WAGE_STEP = 1.35` — a real-world occupational
  composition and wage ladder, undeclared, and the whole wage table is normalised against them.
  Rule 4/19. (`:55` and `:71` still cite `LABOR_SHARE_OF_OUTPUT`, deleted at COH3 — stale comments.)

**MINOR**

- `companyGenerator.ts:25,28` `DEFAULT_PPE_INTENSITY = 0.5` and `INITIAL_ACCUM_DEPRECIATION_FRACTION
  = 0.45` are re-spelled as bare literals in the private path (`:1216 ?? 0.5`, `:1217 /0.65`,
  `:1250 *0.35`) and again in carriers (`carriers.ts:305,345` `*0.35`) — three different opening
  accumulated-depreciation fractions for the same question.
- Copy-paste drift, public vs private firm generator: D&A `457: rev*0.05` vs `1208: rev*0.045`;
  capex `499: 0.06` vs `1214: 0.05`; currentLiabilities `601: debt*0.25 + rev*0.08` vs
  `1245: debt*0.2 + rev*0.06` vs `carriers.ts:337: debt*0.2`.
- `companyGenerator.ts:486` `interestRate = 0.045` hardcoded two lines from `regionPolicyRate`;
  `:699` `seniorBondYield = 0.05 + oas/1e4`; `:189` fallback interest `oas/1e4 + 0.03`.
- `companyGenerator.ts:191` `taxExpense` uses a literal `0.21` while `CORPORATE_TAX_RATE_BY_REGION`
  is imported and used 300 lines later (`:491`) — the §5-TAXR one-owner fix missed this site.
- `companyGenerator.ts:200` `driverScale` clamps the COGS drivers to 90% of COGS (rule 2);
  `:1100` the IPF ratio is clamped to `[0.25, 4]`; `industry-registry.ts:1298` clamps recipe
  intensity to 0.95.
- `companyGenerator.ts:557-565` dealer consensus is `eps × 0.97/1.01/1.06` — fabricated coverage.
- `companyGenerator.ts:733` `while (companies.filter(...).length < targetCount)` re-filters the whole
  array every iteration; `:421` `group.findIndex` inside a per-template loop. O(n²) both.
- `companyGenerator.ts:785` `[...parent.historicalFundamentals]` is a SHALLOW copy — every clone in a
  family shares the parent's snapshot OBJECTS (and their unscaled revenue/balance sheet).
- `companyGenerator.ts:116` `(INDUSTRY_REGISTRY as any)[…]`; `:571,693-694` three `as any` casts;
  `:1016 let lines: any[]`; `:1300 as unknown as Company` (so no field is type-checked at all).
- `profiles/carrier.ts:3,11` — `random` imported unused; `entityById, annualInterest, taxRate,
  perShare, weeklyPayrollUSD` destructured and never used.
- `domain/company.ts:269` a THIRD copy of the entity-type union (`'INSURER'|'ASSET_MANAGER'|
  'PENSION_FUND'`) beside the 4-member copy at `:490` (marked "RULE 3, OPEN") and the 7-member
  `InstitutionalEntityType`. `companyGenerator.ts:693` casts past it.
- `domain/market-microstructure.ts:139-144` `crowdingIntensity: 0.1` and `inventoryLevelUSD =
  demandLevelAnnualUSD * 0.10` — an ANNUAL flow × 0.1 opening as a STOCK (≈5 weeks of demand);
  no period in the derivation (rule 9).
- `bootstrap/firms.ts:82,97` name/ticker generation falls back to `'XXXX'` and a numeric suffix after
  100/200 attempts — two firms would then share an id (`${region}_XXXX`).
- Undeclared SHAPE/RESOLUTION constants found in these files, none in `domain/stated.ts`:
  `companyGenerator.ts:19,25,28,109,153-155,185-186,188,189,191,231-233,238,317-321,363,430,436,457,
  486,499-500,514,522,552-553,575-582,601,633-637,644-645,649-650,690,699,718,1203,1208,1214,1217,
  1245,1250,1302`; `domain/company.ts:678,679,742,743,795`; `domain/industry.ts:87,90`;
  `domain/industry-registry.ts:1070,1099` + every `smeShareOfActivity`, `fixedRateTilt`,
  `capexBasketWeight` and `PROFILE_INPUT_BASKET` row; `domain/institution-profiles.ts:80-86,120-125`;
  `bootstrap/firms.ts:115,130,166,170,179,210,286-296`; `bootstrap/carriers.ts:44,51,285,304,305,345`;
  `bootstrap/population.ts:13,16,20-26,60-62,95-96,123,132,134`;
  `bootstrap/labor-and-wages.ts:19-29,38-44`; `bootstrap/category-demand.ts:23,24,27`.
  Rule-19 classification: TECHNOLOGY/POLICY (fine) — the registry's recipes, value densities,
  shelf lives, lead weeks, seasonality, `WAREHOUSE_USD_PER_TONNE_YEAR`, `maxPayoutRatio`,
  `ANTITRUST_*`, `RETIREMENT_AGE_YEARS`, `WORKFORCE_ENTRY_AGE_YEARS`, the Gompertz pair,
  `SHIP_FINANCE_LOAN_TO_VALUE`, the institution `targets` (rule 5), `COMMODITY_QUANTITY_UNIT`,
  `extractionCostPerTonne`/`unitsPerTonne`. PREFERENCE (fine) — the four in `preferences.ts`
  (declared). RESOLUTION (fine, invariance untested) — `targetCount 200`, `SECTOR_FIRM_COUNT`,
  `BANKS_PER_REGION 4`, `INSURERS_PER_REGION 3`, `CARRIERS_PER_REGION 3`,
  `SME_POOL_STRATA_COUNT 20`, ladder rungs 6/3, `FIRM_SCALE_UNIT_USD`, the 200-iteration Leontief
  solve. Everything else in the list above is SHAPE/OUTCOME and is a finding.

**NOTES (checked, fine or already known)**

- `domain/defect.ts`, `index.ts`, `units.ts`, `sovereign-id.ts`, `events.ts`, `volatility.ts`,
  `preferences.ts`, `types.ts` (a 6-line re-export shim), `profiles/types.ts` and
  `profiles/index.ts` — clean. `preferences.ts`'s four constants ARE declared in stated.ts.
- `assets/index.ts` and `institution-profiles.ts` are the right rule-17 shape; the findings above are
  drift inside them, not the pattern.
- `industry-registry.ts` load-time guards (`:841-846`, `:948`, `:1024`) and the memoisation
  (`:886-887`, `:923`, `:1281`) are correct; the WeakMap key lifetime argument at `:876-885` holds.
- `game-state.ts` — no stale field found; the UI fields were removed and `estates` correctly required.
- `close-seed.ts:110-115` rescales `govDebtTranches[].principalUSD` down to what the named holders
  hold. It is a plug in the opposite direction (the issued stock is set from holdings), but it is the
  declared §5-CLOSE C2 identity, sized and owned. Not re-reported.
- [13c-site] `assets/index.ts:169-174` — `heldInShares === false` is documented as "FACE at par"; the
  par assumption is encoded in the taxonomy itself, so 13c must change it here, not only in the books.
- [13c-site] `domain/instruments.ts:27-74` `Position` carries `entryPrice`, `currentPrice`,
  `notional` and `quantity` as four independent numbers with no invariant tying `notional` to
  `quantity × price` — a face-vs-value seam 13c will meet.
- [13c-site] `companyGenerator.ts:541-543` and `:1205-1207` compute a tranche's annual interest with
  `?? 0.05` / `?? 200bps` inline, duplicating `TRANCHE_DEFAULT_COUPON`/`TRANCHE_DEFAULT_MARGIN_BPS`
  from `stated.ts` rather than importing them.
- `commodities-and-fx.ts` — the NAT1 rewrite is genuinely cost-based; `getInitialFxRate` uses
  productivity as a price-level proxy, which inverts the usual sign intuition (a more productive
  region's currency buys fewer quote units), but it is declared a proxy and is internally consistent.
- `population.ts` — the demographic derivation (Gompertz → stationary distribution → life
  expectancy) is clean and the constants are biological/policy primitives.
- `bank-lending`/`02b` are outside this area; `bankMarketShare ?? 0.25` is only a fallback for a bank
  with no sheet, and the comment says 02b measures the real share from week 1.

### A11 — The harness, the gates, the tests, the UI, config

Files: scripts/harness.ts (2792), scripts/check-hygiene.sh (139), all 20 test/*.ts (1388),
src/ui/**/*.ts|tsx (46 files, 3,4xx), src/App.tsx, src/main.tsx, src/shims/*, src/engine/formatters.ts,
src/engine/newsGenerator.ts, package.json, tsconfig.json, eslint.config.js, vite.config.ts,
.github/workflows/*.yml.

**CRITICAL**
- `scripts/harness.ts:2430` — THE PER-BANK BALANCE-SHEET IDENTITY HAS NEVER FIRED. The residual
  subtracts `bs.businessLoanBookUSD` and `bs.consumerLoanBookUSD`, **fields that do not exist on
  `BankingSector`** (§5-WIRES D deleted them; the reads are `businessLoanBookOf(bs, facilityBookOf(v2,
  ticker))` / `consumerLoanBookOf(bs)` — grep confirms the only other mentions in the tree are
  comments and `bank-identity-trace.ts:54`, which uses the reads). `c` is typed `any`, so
  `residualUSD` is `NaN` every week for every bank, `Math.abs(NaN) > 5e6` is false, and no violation
  can ever be pushed; the `[bank-identity]` trace at :2452 prints `NaN`. `bank-identity-trace.ts`
  states it "duplicates the harness residual FORMULA by design — the two must agree": they do not.
  Rule 14/3, bug. Fix: use the two reads + `facilityBookOf(ensureV2(state), c.ticker)`.
- `scripts/harness.ts:2600-2613` — the bank capital and NIM band checks read
  `state.regions[rid].bankingSector.bankCapitalRatio` / `.netInterestMarginPct`, which
  `stages/02b-bank-diversification.ts:484` builds as a **book-weighted average over the region's
  banks**. A minority of banks under the 5% floor or at a negative margin is arithmetically
  invisible behind the mean — a threshold that is a quota. §2.4 advertises "bank capital/NIM bands
  (all regions)". Fix: iterate the named banks (BANKCAP already walks them).

**MAJOR**
- `harness.ts:592` — `void assets; void reserves;` in `checkCentralBankIdentity`: the sovereign
  book, FX reserves and summed bank reserves are computed and discarded. The function named for the
  identity checks no identity (only the order/fill rule and negative positions). Dead instrument;
  the comment defers to audit M1 but the name and §2.4's claim were never updated.
- `harness.ts:296` — `if (o <= 0) return;` skips the minting test for any class whose outstanding
  is zero. Books still holding claims against a fully retired ladder is the purest mint, and it
  passes vacuously.
- `harness.ts:298` — `h > o * 1.02`: an undeclared 2% tolerance on "a ledger is minting claims"
  (hundreds of millions at USA corp scale, no §7 record, not in `domain/stated.ts`). Same shape:
  `:527` category shares `> 1.02 || < 0.5`; `:601` `filledUSD > orderedUSD * 1.01 + 1e6`;
  `:2469`/`:2477` a flat $5M per bank per week under a comment claiming the identity holds "to the
  dollar (small tolerance for per-field rounding)". Rule 2/15.
- `harness.ts:802-834` — `checkNaNAndPurity` covers 4 company fields, 6 region fields and 2 index
  fields. No holdings, prices, yields, contracts, accounts, institutional entities or derivatives;
  and only `isNaN` (not `isFinite`) for the composite indices, so an Infinity index passes. The
  plan sells this as "NaN purity" over the world.
- `harness.ts:2690` — the >20x revenue check is `if (initRev && ...)`: every company BORN during
  the run has no entry in `initialRevenueByTicker`, so `initRev === 0` and the check is skipped for
  exactly the population (HC-wave births, carve-outs) whose growth is least anchored.
- `harness.ts:1721` — the IND battery prints "capex … vs depreciation … = Nx [1.0x replaces the
  stock]" with depreciation computed as `grossPPEUSD / 12` — a harness-side 12-year life, not the
  engine's own schedule (`usefulLifeYears` per firm, double-declining on the tax basis). §7.246's
  rule is that the instrument reads the engine's definitions. Same re-derivation: the `1 + 0.02*t`
  tenure premium (:1618, :1668) and the `0.12`/`0.3` rent-share target (:1697).
- `scripts/check-hygiene.sh:110` — the FRACTION ratchet's grep ends `| grep -vE 'toFixed\('`,
  which drops the WHOLE LINE. Any stated fraction written on a line that also formats
  (`x = Number((a * 0.37).toFixed(4))` — the exact idiom used at bank-lending.ts:476,
  evolution.ts:1429, sme-pools.ts:67…) is invisible to the budget. A reformat defeats the ratchet.
- `scripts/check-hygiene.sh:36` — the ASSET_SWITCH ratchet only matches `===|!==|case ` followed by
  the literal. `'EQUITY' === x` (literal first), `==`, and `['EQUITY','CORP_BOND'].includes(x)` are
  all uncounted; moving a switch into an array membership test lowers the number without removing a
  single switch. The FRACTION scan also covers only `src/engine src/engine2 src/domain` — a shape
  constant in `src/ui/` or `scripts/` is unowned and uncounted.
- `scripts/check-hygiene.sh:56` — the test-purity gate only greps for `advanceWeeklyStep|
  createInitialGameState`, but §2.4 claims "test/ holds PURE-FUNCTION tests over `domain/` only —
  hygiene enforces the boundary". It does not: `test/bank-resolution.test.ts:10` imports
  `src/engine/ledger/bank-transfer` and `test/preferences.test.ts:7` imports `src/engine/rng`.
- `eslint.config.js:6-18` — the header names four paid-for defect classes; only `eqeqeq` and
  `no-fallthrough` are actually configured. `no-floating-promises` and `no-unnecessary-condition`
  are type-checked rules and there is no `parserOptions.project`, so neither runs. The rule §7.234
  credits with finding a check that had never fired (`no-unnecessary-condition`) is not enabled —
  and it is exactly the rule that would have caught the CRITICAL above. The counts in the comments
  ("77 remain", verify.yml's "existing 437") are stale against the measured 347.
- `src/engine/formatters.ts:7` vs `src/ui/calendar.ts:5` — TWO CALENDARS. The engine's stages
  (02-region-macro, 10-mergers, bank-resolution, initialization, stage08-back) stamp news and
  filings with week 1 = **5 Jan 2026**; the UI renders every date, month and quarter with week 0 =
  **1 Jan 2027**. The same week is printed as two dates a year apart on one screen. Rule 3/9.
- `src/engine/formatters.ts:97,150,163,170,178` — every formatter renders a missing or NaN input as
  a real number: `'$0.00'`, `'0.00%'`, `'0.0 bps'`, `'0.0x'`, and `formatParPrice` → `'100.00% Par'`
  (a NaN price displays as par). Rule 9: a fabricated value is a lie, and it hides NaN in the one
  layer that should expose it. `src/ui/format.ts` gets this right (`'—'`).
- `src/ui/objects/commodity.tsx:37` — `pctLevel(r.obj.change1W, 1)` renders as a percentage a field
  that `engine/macro/evolution.ts:1429` writes as `newSpot - comm.spotPrice`, an **absolute USD
  price move**. A $2.00 move on a $78 commodity prints "200.0%". A USD field displayed as a share
  (rule 9, §7.165). Same defect for FX: `objects/fx.tsx:29` and the "1 week" Stat, over
  `fx-clearing.ts:382`'s `Number((rate - fx.rate).toFixed(4))`.
- `src/ui/objects/commodity.tsx:39,50` — `pctLevel(inventoryLevelPct, 0)` multiplies by 100 a field
  `evolution.ts:1443` clamps to `[0,100]` and seeds at 48: the stock column reads "4800%". It is the
  one `…Pct` field in the tree that really is 0–100 (`marginPct`, `defaultRateAnnualPct`,
  `debtToGdpPctBottomUp`, `nonEmployablePct` are all decimals) — the naming is the trap.
- `src/ui/functions/macro.tsx:79` — `pctLevel((hm?.ownershipRatePct ?? 0) / 100, 0)` where the
  engine uses `ownershipRatePct` as a DECIMAL everywhere (`= 0.62`; bank-lending.ts:501 and
  household-balance-sheet.ts:159 multiply it by counts directly). Home ownership displays as
  "0.6%" instead of 62% — a 100× display error in the opposite direction to the two above.
- `src/ui/functions/macro.tsx:63` — "current account, of gdp" renders `r.currentAccountPctGdp`,
  which is written **once, as `0`, at `engine/macro/initialization.ts:580` and never again**. The
  dashboard reports a permanent 0.0% current account for regions that have real exports and
  imports. A fabricated number for a quantity nothing computes (rule 9/13).
- `src/ui/functions/all.tsx:46` — `RATE_KEY.test(k) && Math.abs(v) <= 5 ? pct(v, 2) : …`: the `all`
  view GUESSES the unit by magnitude. This is precisely the defect §7.241 killed when it made
  `formatPercent`'s `isDecimal` required ("a display helper that guesses units is a unit-confusion
  machine"), reintroduced one layer over. A rate crossing 5.0 silently switches format.
- `src/ui/functions/statements.tsx:174` — the UI calls `internReason(CORPORATE_TAX_REASON)` and
  `partyId({kind:'COMPANY', ticker})` **during render**. Both MUTATE engine module-global tables
  (`settlement.ts:160-167` pushes into `reasonById`/`reasonCategoryById`;
  `ledger/party.ts:77-87` pushes into `partyKeyById`), and both id spaces are positional — §7.325
  seeds a worker's reason table id-for-id from `reasonTableSize`/`reasonTextsFrom`. Opening a
  statements tab can therefore change the ids the engine allocates. `world.ts:6` states "Nothing
  here writes engine state" (§5-AU); it does. Rule 1.22 (byte-identical dumps) hazard on the
  browser path.
- `src/ui/world.ts:236` — `bankLinesTo` returns a hardcoded `status: 'PERFORMING'` for every
  facility row. A defaulted borrower's bank line is displayed as performing; the field is a
  constant wearing a state's name (rule 3/13).
- `src/engine/newsGenerator.ts:139` — the default headline states outcomes as literal text:
  "interest coverage below 0.8x" and "Senior bond recovery established at 40%, equity shares
  cancelled". The coverage floor is a per-firm parameter (`isInDefault({coverageFloor})`, pinned at
  1.0 in `test/credit-standing.test.ts`) and the recovery is `CREDIT_RECOVERY_RATE`; neither is read.
  A displayed number that is a sentence rather than the print (rule 1/3).

**MINOR**
- `harness.ts:846-853` — `checkOwnershipConservation` tests four conditions of which only two are
  distinct (`total > 1.001` ⟺ `impliedHousehold < -0.001`). Dead branches.
- `harness.ts:2673` — `newViols.slice(0, VERBOSE ? … : 6)`: the live line hides all but six per
  week, so a week with one new family behind six repeats reads as "…+N more".
- `harness.ts:1237` — `negativeTga` counts `waysAndMeansOf(...) > 0` (an advance drawn), not a
  negative TGA; the name says the opposite of the test even though the printed label is right.
- `harness.ts:2445` — the harness's own trace flag is `BANK_ID_TRACE`, one character-class away
  from the engine's `BANK_IDENTITY_TRACE`; two flags, two formats, same subject.
- `src/engine/formatters.ts` — `formatPercent`, `formatParPrice`, `formatBps`, `formatMultiple`,
  `formatStockPrice`, `formatBondName`, `formatSimulationDateShort`, `cleanLatexTokens` have ZERO
  callers in the tree (grep). ~100 lines of dead display code, including the §7.241 `isDecimal`
  fix, which now protects a function nobody calls. `cleanLatexTokens`' existence is itself a
  fossil of generated prose.
- `package.json:26` — `@google/genai` is a dependency with no import anywhere in `src/` (grep for
  gemini/genai/apiKey returns nothing). Dead LLM SDK in the shipped dependency set; adjacent to
  rule 16 even though no model identifier is committed (checked: none in src/, index.html,
  workflows).
- `src/ui/calendar.ts:47` — `WEEKS_PER_MONTH = 4` (28 days) drives every "m/m", while
  `formatSpan` uses `52/12` (30.4 days) for the same word. One file, two months.
- `src/ui/functions/holders.tsx:153` — "the rest of the stock sits with foreign and **unmodeled**
  holders": §7.351/CLOSE C3 deleted `UNMODELED` and the boundary party. Stale text that tells the
  reader a residual with no holder is legitimate.
- `src/ui/objects/company.tsx:139` and `functions/statements.tsx:90` — "floor 8% · closed at 2%"
  is typed as prose; the numbers live in `BANK_MIN_CAPITAL_RATIO` (0.08) and `PCA_CAPITAL_RATIO`
  (0.02). They agree today. (`stages/bank-lending.ts:658` writes the same 0.08 as a bare literal.)
- `src/ui/functions/contracts.tsx:73` — `{institutionOf(world, ref.id) ? '' : ''}`: both branches
  empty, a lookup done for nothing (the class §7.235's linter was added to catch).
- `src/ui/functions/contracts.tsx:22-31` — the list never filters `maturityWeek > currentWeek`,
  while the harness's DRV battery counts "live" that way; a matured contract still on the book
  shows in the UI as an open one.
- `src/engine/newsGenerator.ts:150` — `RATING_LADDER` is a local copy of the rating order
  (rule 17: the ladder is registry data). `impactSector: er.sector as any` at :74.
- `scripts/check-hygiene.sh` — two consecutive sections both numbered `# 4.`; the CASH_STRAY rule
  is a hand-maintained list of variable names (`c|comp|company|…`), so `firms[i].cash` or any
  other identifier escapes it. Declared as a heuristic, but it is the only guard left after A4.
- `test/bank-pricing.test.ts:14` recomputes the implementation's own formula from the same
  exported constants and asserts equality — it restates the implementation rather than an
  invariant (the other tests in the file are real).
- `test/inventory.test.ts:66` and `:79` pin CLAMPS as invariants ("carrying cost never drives a
  stock value negative"; `fulfillmentRatio(50,10) === 1`). Rule 2 allows a mathematical floor, but
  the first one silently destroys the unpaid carrying charge (a one-sided flow, rule 14) and the
  test locks it in.

**NOTES (checked, fine or explained)**
- The pre-run shock checks deliberately do not re-seed the RNG (`harness.ts:2226`); documented, and
  it is why SHOCKS=0 runs a different world. Fine.
- The damper diagnostic reports and never violates (`harness.ts:2560`) — deliberate, §6.1.
- The EPS check is scoped to newly-appearing tickers only, so the whole seed population is never
  EPS-checked; the comment declares this, so it is a scope not a bug.
- `recordTape` pads missing series with NaN and `changePct` refuses a NaN/0 base, so the UI's
  m/m·y/y genuinely show "short"/level where history is short (rule 9 satisfied — chart.tsx:88-92,
  common.tsx:30).
- `formatPercent`'s `isDecimal` contract is correct; the problem is that nothing calls it.
- `vite.config.ts` `define: {'process.env': {}}` really does read every engine flag as off; the
  `node:module` shim throws only if called, and native-kernels guards on `process.versions.node`.
- Deploy chain is coherent: verify.yml gates lint+hygiene+test on push/PR (harness deliberately
  out, §7.233), deploy-pages.yml builds `dist` on main, android-apk.yml rebuilds only on
  `android/**`. `--max-warnings 354` matches the plan's ceiling.
- Every env-gated instrument the plan names (OWN_TRACE, W2_TRACE, SPLIT_TRACE, WIRE_TRACE,
  DESK_TRACE, MINT_TRACE, NIM_TRACE, OD_TRACE, PNL_TRACE, BYPASS_TRACE, RECON_TRACE, CAPEX_TRACE,
  BOUNDARY_TRACE, LEFTOVER_TRACE, EQ_CONS_TRACE, HH_EQ_TRACE, SEED_RECON, CARRIER, FREIGHT_TRACE,
  DEFAULT_TRACE, LABOR_CAUSES, STAGE_TRACE) exists in the tree; no dead flag.
- OWN_TRACE prints desks INSIDE `held` and says so; the MINT_TRACE key is (issuer, CLASS) after
  §7.292's self-inflicted double count. No double counting found in either.
- `App.tsx:30` `worldDigest` sums `stockPrice + cashOf` — mixed units and float-order dependent,
  but it is declared a cheap checksum and only compared like-for-like.
- The test tree's invariants are real (derivatives telescoping mark, fund double bound, FIFO
  lots, tax carryforward asymmetry, SME lock-out, preferences median); none pins a SHAPE outcome
  except `learning.test.ts:8`, which pins the seeded firm to `LEGACY_PRODUCTIVITY_DRIFT_ANNUAL` —
  a calibration test of `seedCumulativeUnits`, declared as such.

## 9. THE LOG — WHAT IS DONE

A finished step leaves §3 and lands here: what changed, why, and the measured numbers.

**1. The interest that is never paid.** (a, `5454934`) `trancheWeekAccrual` made CP due only in
its maturity week and the register's accrual loop skipped exactly that week, so **CP interest
accrued to holders from issue and was never once paid**, and every bond/loan whose term is a
whole number of periods lost its final coupon. The skip is gone from both sides
(`front-core.ts:561` the issuer's expense, `stage08-back.ts:1144` the holders' accrual) and,
because 07f retires matured CP before stage 08 runs, the coupon is marked due where the paper is
redeemed (`07f:782`). Measured (COUPON_TRACE=1, 16 weeks — a 13-week run CANNOT show this: CP is
issued in-run at +13 weeks, so the first maturity is w16): CP paid 0.000B for ever → **0.157B at
w16**, owed 0.286B → 0.141B instead of growing without bound; loans pay 7.807B at w13. One week's
accrual on maturing CP is missed on BOTH sides equally (the row is gone before stage 08) —
symmetric, and it closes when step 13 makes CP a discount instrument like the bills beside it.
(b, `8edb476`) `applyHolderInterestAccruals` split interest over the institutional register
alone; the dealer desks hold the same paper and their share was paid to the other holders. The
same hole ran through `pendingHolderCashUSD` — a call premium went entirely to the register and
an equity dividend paid the desks' shares to households as part of the float. A desk's position
is ISSUER-keyed where a register row names a tranche, so it now holds the issuer's stack in the
register's own proportions (and all of it where the register holds none), accrues on the same
nested ledger, and is paid at the same coupon date; a cash action's denominator is the register,
the desks and, for equity, the float. **A desk's receipt is INCOME** — cash on the securities
account, no paper out — so it goes through `bookPnL`; without that leg M5 lit up for six banks
over ten weeks in the first gate run, which is what named the missing write. Measured
(COUPON_TRACE=1 SHOCKS=0 WEEKS=16): **99 violations in 24 families → 95 in 24**, money clean,
unowned 0.00B; at w16 the desks accrue 0.078B of the week's 0.597B corporate-bond interest,
0.205B of 0.902B on loans, 0.015B of 0.023B on CP, and are owed 1.579B / 0.564B / 0.102B.
COUPON_TRACE now carries the desks' slice of accrued/paid/owed per type.

**2. The residual delivered twice.** (`9268624`) `primary-settlement.ts` moved the lead's
underwriting residual to its desk twice — a kind-dispatched movement (new shares issued onto the
lead for equity, a transfer off the clearing house for credit) followed by an unconditional
second transfer off the house with the identical spec. Both emit a wire, so the house was debited
twice for one delivery and the equity path attributed one movement to two senders. The second
block is gone. Measured (SHOCKS=0 WEEKS=16): **95 violations in 24 families → 95 in 24**, money
clean, unowned 0.00B. **The plan named this as the suspect behind the standing W2 dust and it is
not** — the whole effect is JPN CORP_BOND moving from −0.00B to 0.00B in weeks 15–16, under
0.005B. Most primaries are taken in full so the residual is small, and what the duplicate did
wire, `debitRow` silently truncated on the second pass. W2's dust has another owner; do not
re-derive this one.

**3. The silent truncations.** (`81b6efc`) Four paths moved less than they were told to and said
nothing. `holdings-ledger.debitRow` took `min(left, row)` per row and dropped the remainder,
while `transferHolding`/`retireHolding` had already WIRED the full quantity — paper minted on
the receiving side that never left the payer's book; it now defects, as `retireTranche` already
did. `holdings-store.addShares` returned with an undeliverable remainder while the receiving leg
is a separate call; it now defects. `pruneEmptyRows` kept a row only at `qtyUSD > 1` — a DOLLAR
test that destroyed SHARES — and now keeps any row holding anything in either unit. The store's
by-position pairing of book objects to persistent row ids is checked for length and instrument
where it is made, because `finalize` keeps and frees off it. The free paths now clear the row
they release, as the tranche store's does.
**The guards immediately named two live minting callers, and fixing them is rule 2's pairing:**
`etf-flows` struck the share count at the pre-flow NAV and valued the same shares at the
post-flow one, so the two legs of one transaction disagreed — paper now leaves a book at what
the book CARRIES it at, and the difference against the NAV the cash transacted at is the
holder's gain; `securities-lending` let a recalled borrower 0.0001 shares short deliver the
loan's full size, and now delivers what it holds. Both guards measure their residue RELATIVE to
the quantities the walk touched, because a row-by-row subtraction's leftover is float noise.
Measured (SHOCKS=0 WEEKS=16): **95 violations → 95**, money clean, unowned 0.00B, and sixteen
weeks now run with all four invariants asserted.

**4. The goods mint.** (`437f556`) `settleOutputInventory` wrote a seller's finished stock as
`max(0, held)` and booked the shortfall as `mintedUnits`: the wires said the goods had left, the
stock said they were never there, and the difference was created so the identity would still
close. A stock cannot be negative and no sale may make it one — the sale that oversold is now the
defect, named at the write site, with float noise on a sum of thousands of lots treated as zero.
`deliverGoods`'s `priceUSD: Math.max(0, unitPriceUSD)` turned a negative price into a free
delivery and defeated `wirePush`'s own guard; it defects. With the mint impossible `mintedUnits`
can never be non-zero, so the field, the **W4b check that read it** and its term in the goods
identity are deleted from the ledger, the wire journal, the state type and the audit; W4's real
identity check stands. **The rationing the plan asked for already existed** — contracts settle at
`min(owed, available)` and the open market is offered only what they left, which is why W4b never
fired; the clamp was latent, not absent. Measured (SHOCKS=0 WEEKS=16): **95 violations in 26
families → 95 in 26**, money clean, unowned 0.00B, every week count unmoved.

**5. The estate that never closes.** (`4bda75c`) Three things kept the close test false.
(i) `openEstate` wrote `assets.cashUSD` once and nothing decremented it while the other three
assets were re-read weekly, so any estate opened with cash could never close — cash is now the
account, re-read after the waterfall. (ii) The disposal sold a fixed SHARE of what was left each
week, so the tail halved for ever; both schedules now run from the week the estate opened and
the last week of each takes the remainder in one lot. (iii) `writeOffResidual` walks CLAIMS, and
a claim opens only above a dollar, so a smaller row survived the close and then named an
extinguished instrument; every row of the dead issuer now goes. Claims are on ONE BASIS, FACE,
and what the register claims of each tranche is checked against the ladder's own face for it.
**The burn-in probe gained `open estates`** and paid for itself at once: 41 open at week 16
against 6 defaults in the last week alone is what named (ii) and (iii). Measured (SHOCKS=0
WEEKS=16): **95 violations in 26 families → 92 in 25**; O3 (rows naming an instrument that does
not exist) and the goods-wedge X2 line are gone, money clean, unowned 0.00B, open estates 41 →
37 with the horizons now finite. The workout's 0.9-capped sale price and its pro-rata-to-cash
allocation are untouched — step 20's.

**6. Bank resolution transfers the whole sheet.** (`b1111d7`) `planBankResolution` netted the
failed bank's own BOND LADDER against the CENTRAL BANK's loan and transferred only the
remainder, while `assumeBankBooks` then zeroed the shell's balance outright — the un-assumed
part was erased with no counterparty while `loansToBanksUSD` still carried the asset, and two
different liabilities were treated as one line. The whole central-bank loan now moves with the
books, and the ladder is bailed in where it lives: on the shell's own rows, its holders taking
their loss through the estate like any other issuer's bondholders. `wholesaleHaircutUSD` was
identically zero, so the loss order it documented was dead code and its equity line bypassed
`bookPnL`; with the central bank whole by construction there is no wholesale lender to haircut,
so the field, the line and the news sentence quoting it are gone. Measured (SHOCKS=0 WEEKS=16):
**92 in 25, unchanged — no bank is resolved in the reference run**, so this one is verified by
the pure-function tests (rewritten to the new shape) and by reading, not by the run.

**7. The treasury's own books.** (`e3f598a`) (i) `Government.interestWeeklyUSD()` returned the
coupon PLUS the bills' discount accrual, which `government.ts` states in terms is the double
count — bills are ~21% of the stack, stage 11 always used the coupon alone, and the inflated
figure is what the fiscal red line tests a region against. The accrual term is gone. (ii) **The
reverse repo window is now a real position.** It paid the administered rate on a balance booked
nowhere, so the same dollar earned the floor and stayed spendable; the money-market session now
decides the size, a `reverse-repo-draw` stage takes it at the close — before the settlement and
funding closes, so banks losing the deposits can square up — and the next session returns it with
interest at the rate it was struck at. The central bank carries `reverseRepoBorrowedUSD` (M1
counts it), the institution carries `rrpLentUSD` (in its book, not its purchase capacity), and
every reader of `repoLentUSD` reads it too. (iii) The LOLR's raise and repay read ONE buffer:
the draw was sized against 2% of household deposits while the repayment released cash only above
the LCR's HQLA requirement — which the sovereign book also satisfies — so the loan ratcheted and
was never repaid. Measured (SHOCKS=0 WEEKS=16): **92 violations in 25 families → 107 in 29**,
money clean, unowned 0.00B, no fund overdrawn. **The rise is named:** the non-banks' idle cash
genuinely leaves the banking system now, so bank NIM compresses (X1 4/16 → 9/16 weeks, a EUR
NIM-out-of-band line appears) and the credit books clear on smaller budgets. That drain is the
correction of a real double count — the same deposits were counted as parked at the central bank
AND available in the banking system — and its SIZE is decided by `CASH_SLEEVE_OVERNIGHT_SHARE =
0.5`, now step 30b. P1's breaching issuers fell 1096 → 815 on the way.

**8. The register's remaining holes.** (`31755c9`) Eight sites where a claim, a price or a
residual had no owner. `12-portfolio`'s IRS/CDS/XCS maturities added the same P&L to both the
realized-P&L and realized-cash lines and stage 13 sums both into cash — paid twice; the corp and
sov branches had already been converted and say why. `etf-flows` floored every participant's
target at what it held, so no holder could sell and the print was pinned at the reservation
whenever AP capacity was short. `dealer-desks` charged a negative session residual to equity as a
"fee" and discarded a positive one; the residual is the desk's trading result and is booked
signed. The beneficiary claim was set once and kept for every kind but pensions, so an insurer's,
asset manager's and hedge fund's household claim was frozen at week 1 — it now grows by the
week's measured investment income in ONE place, and that income no longer keeps last week's
number in a week with none. `holdings-view` set sector EQUITY to total ASSETS (A = L + E with the
liabilities left out) and counted overnight cash lent inside sector CASH while it sits in the
borrower's; both fixed. `householdDirectEquityUSD` subtracted only the register from market cap,
counting the banks' whole equity desk book as household net worth while 07e computed the same
residual with the desks out. `pe-lifecycle` wrote a flat 70% sponsor stake on an IPO and dropped
the company from the fund's portfolio, so the retained stake left the sponsor's assets with no
sale and, unregistered, was credited to households; the sponsor now keeps what it did not sell as
real shares and its percentage is a read of them. Measured (SHOCKS=0 WEEKS=16): **107 in 29 →
108 in 27**, money clean, unowned 0.00B — flat, with eight holes closed.

**9. One running settlement net.** (`35fa0ea`) `pendingSettlementUSD` — read by repo's surplus,
every bid sizer, the prime-brokerage sweep and the close sweep — was short for two independent
reasons, and a second representation had been written to work around the first. `journalPayment`
wrote the journal and nothing else, so every coupon, dividend, call premium and redemption the
paying agent made existed to no budget until it settled; it now updates the net like `pay`. A
DATED ROW never joined the net even in its due week — `pay` skips it when recorded, correctly,
and nothing added it when its week arrived — so a corporate tax obligation was invisible on the
week it is paid; the net is seeded from the carried journal when the week's context is built.
With both closed the close sweep stops re-deriving the net by walking the journal and reads the
one total. `sme-pools` read the week's own report (the intraday pass only), losing every pool
flow the close and funding cycles settle; the complete week is now persisted and it reads the
prior one whole. **The household stage has the same hole and deliberately does not get the same
fix** — its fields are a one-week lag consumed the week after, so the prior week makes them two
weeks stale and breaks M6 — now step 9b. Measured (SHOCKS=0 WEEKS=16): **108 in 27 → 115 in
33**, unowned 0.00B, M1/M2/M4/M5/M7 clean, **M6 grazing its band in 1 of 16 weeks** (2.69B
against ~2.5B): a threshold crossing on a week whose flows moved, and the first thing to bisect
when step 27 gives M6 a real band.
