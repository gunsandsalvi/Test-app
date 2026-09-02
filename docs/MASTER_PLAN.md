# THE MASTER PLAN — one file, one project: a closed circuit

**Read §1 before touching anything.** §2 is the map, §3 IS THE WORK (one ordered project; take the
first unfinished step), §4 the gates, §5 the lessons, §6 the watchlist. There is no second rules
file and no second defect list. The full 468-record history and the superseded plan are in git at
`79c239b:docs/MASTER_PLAN.md`; §5 keeps every lesson the code still cites at its original number,
so a `§7.N` citation in a comment still resolves.

**WHERE THE WORK STANDS — read this first on a handover.**
- HEAD `5454934` on `claude/master-plan-review-j2z20v`, pushed to `main` too (rule 16). Tree clean.
- **Next step: §3 step 1(b)**, then 2, 3, … in order. §3 is the only work list.
- **The reference to judge a change against:** `COUPON_TRACE=1 SHOCKS=0 WEEKS=16` at `5454934` —
  **99 violations in 24 families**, money family CLEAN, "the money that is not anyone's" 0.00B.
  (The older 13-week 82/20 figure is NOT comparable: three fewer weeks of accumulation. Judge a
  13-week change against a 13-week run and a 16-week one against this.)
- **Recording a step:** the step's own §3 entry is its record — mark it DONE in place and put the
  measured numbers there, so the work list and the history are one thing. A lesson that a FUTURE
  step could trip over goes in §5 as well; nothing else does.
- Gates at HEAD: `tsc` 0, ESLint 347/354, hygiene pass, 125 tests.

**Where this list came from (2026-09-02): a line-by-line audit of ~230 files / ~55k lines**, which
found ~380 defects. Every material one is a step below, at its file:line; the per-area working
reports were session scratch and are deliberately NOT committed (rule: no second defect list), and
steps 30–31 give the METHOD and the exemplars rather than a list that would go stale — regenerate
the exhaustive one with a grep when you get there. The headline that set the order: money and ownership do NOT close (interest accrued and
never paid — step 1(a), now fixed; a residual wired twice; three ledger paths dropping value
silently; an estate that can never close), price is NOT universal (credit trades at par, commodity
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
commit, gated by §4, and its own entry here is its record (mark it DONE in place with the measured
numbers). Later parts depend on earlier ones — do not reorder.

### PART I — THE CIRCUIT CLOSES (money and ownership leak nowhere)

1. **The interest that is never paid — (a) DONE, (b) OPEN.** `trancheWeekAccrual` makes CP due only
   in its maturity week; the register's accrual loop skipped exactly that week; `payHoldersAccruedInterest`
   has ONE call site, inside it. So **CP interest accrued to holders from issue and was never once
   paid**, and every bond/loan whose term is a whole number of periods lost its final coupon.
   (a) The skip is gone from both sides (`front-core.ts:561` the issuer's expense,
   `stage08-back.ts:1144` the holders' accrual) and, because 07f retires matured CP *before* stage
   08 runs, the coupon is marked due where the paper is redeemed (`07f:782`). **Measured**
   (COUPON_TRACE=1, 16 weeks — a 13-week run CANNOT show this: CP is issued in-run at +13 weeks, so
   the first maturity is w16): CP paid 0.000B for ever → **0.157B at w16**, owed 0.286B → 0.141B
   instead of growing without bound; loans pay 7.807B at w13; money family clean, unowned 0.00B.
   One week's accrual on maturing CP is missed on BOTH sides equally (the row is gone before stage
   08) — symmetric, and it closes when step 13 makes CP a discount instrument like the bills beside it.
   (b) OPEN: `shared-helpers.ts:753-880` splits interest over the institutional register only — the
   dealer desks hold the same paper, accrue nothing, and their share is paid to the other holders.
   The principal path got its desk pass at `:437`; interest and `pendingHolderCashUSD` never did.
2. **The residual delivered twice.** `primary-settlement.ts:147-150` and `:155-159` move the
   identical spec to the identical lead desk; neither writes a register row (`holdings-ledger.ts:44`
   resolves only INSTITUTION), so both are pure wires off the clearing house. This is the named
   suspect for the standing W2 dust (12 of last run's 82 violations). Delete the second block.
3. **The silent truncations.** `holdings-ledger.ts:79-103` (`debitRow`) takes what the rows hold and
   drops the remainder with no defect after the full quantity was wired; `holdings-store.ts:155-176`
   (`addShares`) drops an undeliverable remainder; `engine2/holdings.ts:313` (`pruneEmptyRows`)
   tests DOLLARS and destroys SHARES; `holdings-store.ts:74-76` pairs week-start objects to
   persistent row ids BY POSITION with no check, and finalize keeps and frees off that pairing.
   Each becomes a `defect()`. Also: the free paths (`holdings.ts:118,191,226`) clear nothing, so a
   freed row reads as live.
4. **The goods mint.** `goods-ledger.ts:92-99` sells units that never existed and records
   `mintedUnits` so W4 can name it. The auction must not be able to sell what does not exist:
   ration the sale at the stock. Delete the `Math.max(0, held)` and the `Math.max(0, unitPriceUSD)`
   at `:125` with it.
5. **The estate that never closes.** `estate-resolution.ts:530` sets `assets.cashUSD` once and
   nothing decrements it, so the close test at `:230` can never pass and holders keep dead paper for
   ever. Re-read cash weekly. Same step: claims open at the holder row's marked value (`:497-520`)
   while bank facility claims use ladder principal — **one basis, FACE**; and `:213` prices the
   asset sale by formula with a 0.9 cap instead of clearing it (see step 20).
6. **Bank resolution transfers the whole sheet.** `bank-resolution.ts:92` nets the shell's own bond
   ladder against the CENTRAL BANK's loan; `bank-transfer.ts:79,82` transfers the remainder and
   zeroes `target.centralBankLoanUSD` while `centralBankSheet.loansToBanksUSD` keeps the asset.
   Bail the ladder in on its own rows and move the whole CB loan. `wholesaleHaircutUSD ≡ 0` (`:97`)
   makes the documented bail-in dead code — make it real or delete the branch.
7. **The treasury's own books.** `government-entity.ts:65-68` returns coupon + bill-discount accrual
   while `government.ts:74-84` states in terms that this is the double count — bills are ~21% of the
   stack, stage 11 uses coupon only, and the inflated figure is what `evolution.ts:197-201` tests
   against the fiscal red line, biasing every region toward consolidation. One decomposition.
   Same step: `repo-clearing.ts:610-637` pays ON RRP interest on a position booked nowhere while the
   dollar stays spendable — rule 1's exception needs a real position on both sheets, or the RRP goes;
   and the LOLR's raise buffer (2% of household deposits) and repay buffer (`stressedOutflow × LCR`)
   are two definitions of one number, so the loan ratchets and never repays (`bank-funding-close.ts:39`,
   `bank-lending.ts:915,925`).
8. **The register's remaining holes.** `12-portfolio:276,328,333,499` adds derivative maturity P&L
   to BOTH the realized-P&L and realized-cash lines and `13-news:25` sums both; `etf-flows.ts:682`
   sets `maxHolding = max(shares, shares+want)` so no ETF holder can ever sell (a one-sided book);
   `etf-flows.ts:499` vs `:727` breaks the NAV identity (pre-flow NAV over post-flow share count);
   `dealer-desks.ts:220` charges a negative residual to equity and silently discards a positive one;
   `household-balance-sheet.ts:85-92` freezes every non-pension beneficiary claim at week 1;
   `holdings-view.ts:209` sets sector equity := total assets (A = L + E cannot hold);
   `holdings-view.ts:68` counts repo-lent dollars on both sides; `pe-lifecycle.ts:680` hands a
   sponsor 70% of a company with no sale and no cash.
9. **One running settlement net.** `settlement.ts:224,244` never adds a dated row to
   `pendingNetById` even in its due week, and `overdraft-sweep.ts:33` re-derives the close balance by
   walking the journal because the paying agent's payments are missing — so `pendingSettlementUSD`
   (read by repo surplus, every bid sizer, the PB sweep) is systematically short by the week's
   coupons and dividends. One representation. Same step: `sme-pools.ts:43` and
   `household-balance-sheet.ts:52` read the INTRADAY report only, so close-cycle flows are lost.
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
`PNL_TRACE`, `DEFAULT_TRACE`, `LABOR_CAUSES`, `SEED_BURN_IN`, `COUPON_TRACE` (step 1: accrued /
paid / owed per week by instrument type — the register's interest, visible without its own run).

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
three cycles, because a day has more than one. §7.377/§7.384 a balance is an ACCOUNT, not a field.
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
| The money family (M1–M7) and "the money that is not anyone's" | Clean every run since §7.364; the scoreboard is the watch. A line here is a defect at its site. |
| The 1e-8 week-1 drift (§7.370) | Three firms differ at the eighth digit at week 1; 13% price gap by week 13. Bisect by file, ONE dump per step. Watch it to zero; never widen a tolerance for it. |
| The state-growth drift (§7.335, §7.380) | Weekly cost +45% over weeks 5→80 on two independent device runs, all stages inflating proportionally. First suspect: the contract book's row growth. |
| TGA over a quarter; occupational mismatch; top-down vs bottom-up household income; the private tier that sells nothing; loan-book Spearman noise | Watch the TGA's LEVEL not its shape; mismatch is composition outrunning retraining; `estimatedHouseholdIncomeUSD` is still the anchor; ~300 seeded private firms per region carry `productLines: []`; Spearman 0.26–0.76 at 23–32 names — re-measure as the universe grows. |
