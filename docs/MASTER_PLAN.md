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
- HEAD on `claude/master-plan-cleanup-ld1oh1`, pushed to `main` too (rule 16). Tree clean.
- **Take the FIRST step in §3 and do not skip.** §3 is the only work list and it holds only what
  is still OPEN — a finished step leaves it and lands in §9. Do not write a "next step" note here
  that names anything but §3's first line; one was written, it disagreed with §3's order, and two
  steps were skipped behind it.
- **The reference to judge a change against:** `SHOCKS=0 WEEKS=16` after step 13 part 2 —
  **231 violations in 46 families**, and **"the money that is not anyone's" is 0.00B across ZERO
  lines — the money family is clean.** The rise from 181/36 is O1, O6 and O7 becoming able to see
  300B of desk inventory that named no tranche (§9.12); step 11f owns what they report.
  **The money family is down to one check** (M7's dust, worth 0.00B): M1–M6 all print nothing.
  The rise from 134/33 is W5 and then O7 arriving and reporting real findings (§9.11e, §9.11f) —
  a new check that fires is the instrument working, not a regression. **O7 alone accounts for 15
  of it and step 11f owns closing it.** Read the number off the run, not off this line.
  (The family count is partly cosmetic: the P1 seniority line names example issuers and they move.)
  (The older 13-week 82/20 figure is NOT comparable: three fewer weeks of accumulation. Judge a
  13-week change against a 13-week run and a 16-week one against this.)
- **Recording a step:** delete the step from §3 and write its record in §9 — what changed, why,
  and the measured numbers, for a reader who was not here. A lesson that a FUTURE step could
  trip over goes in §5 as well; nothing else does.
- Gates at HEAD: `tsc` 0, ESLint 341/354, hygiene pass, 126 tests.

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
   are statistics DERIVED from a cleared price, never the mechanism that sets it.
   **Restated by the user (2026-09-03) because a draft of step 13 inverted it:** every asset is
   measured in UNITS — par value, shares, tonnes, contracts — and carries the cleared PRICE those
   units trade at. **Every asset trades on price.** You VALUE a loan on its discount margin and
   you TRADE it on price; the margin is what you inferred, the price is what was decided. A
   mechanism that clears a spread and derives a price from it has the causation backwards, and
   `financial-clearing-engine.ts:956`'s `statKind === 'PRICE_LIKE' ? clearedStat : 1` is where
   that is written down today. One exception:
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

28. **A TOLERANCE IS FLOAT DUST, NEVER A PERCENTAGE** (user, 2026-09-03: "tolerances shouldn't be
    based on %, it should only allow machine number discrepancies. If 1000 disappears without a
    reason something is wrong"). An identity either holds or it does not. The only thing a check
    may forgive is the error the FLOATING-POINT ARITHMETIC ITSELF introduced — which is derived,
    not chosen: about `n × eps × Σ|terms|` for a sum of n terms, so it is bounded by the size and
    the COUNT of what was added, and it is many orders of magnitude below anything the model
    trades. A percentage band is a business judgement wearing a numerical costume: it says a
    thousand dollars may go missing if the book is large enough, and rule 3 says a dollar is a
    dollar whatever it sits next to. **A check that only passes with a percentage band is
    reporting a defect, and the band is hiding it.** The corollary for a NEW check: set the
    tolerance from the arithmetic, watch it fail, and fix what it names — never widen it (rule 20
    forbids the rollback and this forbids the quieter version of it).

29. **FIX THE CAUSE, NOT THE SYMPTOM** (user, 2026-09-03: *"Don't fix the symptoms, fix the
    cause."*). A finding is not understood until you can name the thing that MADE it, and the
    test of that is whether the fix deletes the symptom's plumbing rather than fencing it. Two
    worked examples from the day the rule was written, both of which I first got wrong:
    · the central bank lending without limit is not "the facility lacks a collateral test" — it
      is that the money market clears at stage 3 of fifty, before every book that moves reserves,
      so the plug is a market that was shut when the need arose. The fix MOVES the session and
      DELETES `raiseCentralBankLoanUSD`; a collateral test, a penalty rate and depositor flight
      are the questions that come after, and are unanswerable before;
    · the auction printing its bracket is not "the adapters need an UNTRADED state" — it is that
      `solveClearingStat` returns `number` for a domain where no answer may exist. A total
      function over a partial domain must invent something. The fix is the SIGNATURE, which then
      makes every adapter say what it does; a new state bolted beside it leaves the function free
      to keep inventing.
    The tell that you are patching a symptom: the fix is a LIST (add a bound, add a test, add a
    flag), it leaves the original mechanism in place, and every item on it is independently
    arguable. A cause has one fix and it removes code.

## 2. THE MAP

### What the `§` markers in the code mean

**`§7.N` is a FINDING ID, not a section.** There is no §7 in this file and there never will be:
the number is the id namespace an earlier sweep used, and **699 comments across `src` and
`scripts` carry one**. Read `§7.241` as "the decision recorded under finding 7.241", not as a
pointer into this document. The same is true of `§5-WIRES`, `§5-CLOSE`, `§5-STRUCT`, `§5-SCALE`,
`§4.C`, `§6.1`, and the letter-number tags (`A3.6c`, `OWN7`, `WS5`, `G3b`, `XB6`, `IND11`, `HH3`,
`SEG1`, `DIST`, `CAL`, `PUB2b`, `SETL6`, `M1`…`W5`) — all of them are work-package or check ids
from the projects that wrote the code, and they are useful as searchable handles precisely because
they are stable. **`§1.N` and `§3.N` and `§9.N` DO point here** (rules, work, log).

A marker whose project is finished is history, not a live reference. Do not chase one expecting to
find a section, and do not add new `§7.N` ids — a new decision cites the rule it follows (`rule
29`) or the step that made it (`§3.13c`).



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

12. **ONE THING, ONE KEY** (user, 2026-09-03). *(Mostly done — §9.12. What is left is the tail.)*
    **THE POLICY, stated once so a check can test it:**
    · a COMPANY is its `id`; its `ticker` is a display name and a party address, never a key into
      a store (`company.id` is `${region}_${ticker}`, so the two are derivable but not equal);
    · an INSTITUTION is its `id`;
    · a PIECE OF PAPER is the instrument it IS — a TRANCHE id for credit, the company id for
      equity, the bucket id for a sovereign, the fund's id for a fund share;
    · a GOOD is its sub-unit id, a CONTRACT its own id, and what a contract is ON is keyed the
      way that thing is keyed above.
    `O8` tests every arm of it, every week. **Swept and CLEAN:** contract parties, CDS reference
    entities, and every register row — each resolves in exactly one space. The miskeying was ONE
    place, not systemic, and it is now closed to 0.1% (§9.12).
    **What is left (0.42B on 219 positions):** `register-split.ts:62` names the ISSUER when a firm
    has no live tranche of the kind, so a desk holding paper of an issuer whose ladder of that
    kind is momentarily empty still lands on the issuer key. That is the same fallback 11f names,
    and it dies with step 13 — a position in paper that does not exist should be nothing, not a
    row under a different name.

### PART II — THE INSTRUMENTS ARE REAL

12b. **Pricing is centralised; now use it.** `domain/pricing/` owns the time value of money
    (§9.12b): `discountFactor`, `annuityFactor`, `levelPaymentFactor`, `presentValuePerFace`, and
    step 13's pair `priceFromSpreadBps`/`spreadBpsFromPrice` with `zeroRateAt`. Eight modules that
    wrote the formulas out by hand now call it. What is LEFT is the consumers that still price by
    their own arithmetic rather than off a cleared print, and each belongs to the step that owns
    its mechanism: `engine/pricing.ts`'s `priceCorporateBond`/`priceLeveragedLoan` are used by ONE
    caller, `12-portfolio:141`, which step 26 deletes outright (a round trip through Nelson-Siegel
    cannot return the cleared price); `carryCalculator.ts` is step 26's; `index-calculation.ts:52`
    now uses the shared PV but still discounts a bond it should be able to READ a price for, which
    is step 13. **One holdout on the convention:** `engine/nelsonSiegel.ts` discounts continuously
    (`exp(-z·t)`) where everything else compounds discretely. Unify it in the same commit as 13's
    sovereign pricing — moving it alone re-prices every sovereign for no gain.
13. **EVERY ASSET TRADES ON PRICE — AND THE STRUCTURE HAS TO CHANGE, NOT THE CREDIT BOOKS**
    (user, 2026-09-03: *"every asset is measured in units (be it par value, or number of shares,
    etc), every asset has a price attached to it as the cleared price. Every asset trades on
    price. DMs and OASs and all else is a measure derived… This needs to apply to everything that
    has a price that differs from the units it represents, not only financial assets… it shouldn't
    be byte identical, there should be issues coming out of these changes."*)

    **THE SURVEY — how every owned thing is stored today.** Read this before proposing anything;
    two earlier drafts of this step failed by treating it as a credit-book problem.

    | What is owned | Stored as | Units | Price | Value |
    |---|---|---|---|---|
    | Equity | row `quantityShares` + `quantityOrNotionalUSD`; `comp.stockPrice` | yes | **yes** | stored too |
    | Corporate bond / loan / CP | row `quantityOrNotionalUSD` | no | no | yes |
    | Sovereign | `sovereignBondHoldingsByTenor: Record<tenor, USD>` | no | no | yes |
    | Finished goods | `{ unitsHeld, valueUSD }` | yes | **discarded** | yes |
    | Work in progress | `{ units, valueUSD }[]` | yes | no | yes |
    | Input lots | `units` + `unitPriceUSD` | yes | **cost** | derived |
    | Goods in transit | `units` + `landedCostPerUnit` | yes | **cost** | derived |
    | Dealer inventory | `{ inventoryUSD, units? }` | optional | no | yes |
    | Plant | `grossPPEUSD` − `accumulatedDepreciationUSD` | **no** | no | yes |
    | Housing | `housingStockUSD` | **no** | no | yes |
    | Category inventory | `categoryDemand[c].inventoryLevelUSD` | no | no | yes |

    **EQUITY IS THE ONLY ASSET IN THE MODEL THAT STORES A PRICE.** Everywhere else the price is
    computed and thrown away (`goods-ledger.ts:123` — `setOutputStock` takes a `unitPriceUSD`,
    multiplies by it, and keeps only the product, so next week nothing can re-mark that stock
    because the price is gone), or assumed to be 1 (credit, sovereign), or a historical COST
    (lots, consignments), or absent entirely (plant, housing).

    **THAT IS THE DEFECT, and it is structural.** Value is a stored FIELD in ten of eleven
    classes. A stored value cannot be re-marked, because the number that produced it no longer
    exists — so "what is this worth" is answered by whatever happened to be true when it was
    written: a cost, a par, a stale mark. Every identity that compares two subsystems is then
    comparing two different vintages of that answer, and wherever units and value are stored
    SIDE BY SIDE they drift (which is exactly what killed §9.13 part 3).

    **THE STRUCTURE IT SHOULD BE:**
    · a POSITION is `(asset, units)` — nothing else;
    · an asset has ONE cleared price a week, in a price store, written only by its market;
    · **value is a FUNCTION, `units × price(asset)`, never a field**;
    · MONEY is the single degenerate case: its price is 1 by definition. That is what "a dollar is
      a dollar" means, and it is the only place a hard-coded 1 is allowed;
    · an asset genuinely not traded is carried at COST, and *carried at cost* is a DECLARED
      property in the asset registry — a fact about the asset, not an accident of nobody having
      written it a market.

    **WHAT THIS FORCES — the depth the credit-only reading was missing:**
    1. **Plant and housing have no units at all.** They cannot be priced until it is decided what
       a unit of plant IS. That is step 26's "one asset or a stack of dated vintages" question,
       and it stops being a cleanup: it is load-bearing and unavoidable here.
    2. **Lots and consignments carry COST where the model wants price.** Inventory held at the
       cleared price, against inventory bought at cost, is a real holding gain or loss that this
       model never books. That is a NEW MECHANISM, not a refactor.
    3. **The goods auction already computes the price it needs and discards it.** It has to be
       stored per `region|subUnit|week` — the cheapest half of the whole step.
    4. **The equity row's stored value has to go**, or it drifts exactly as face did.
    5. **Sovereign holdings are a `Record<tenor, USD>` with no instrument in them** — there is
       nothing to attach a price TO. They have to become positions in bucket instruments first.
    6. **The clearing engine's `unitValueUSD = statKind === 'PRICE_LIKE' ? clearedStat : 1`**
       (`financial-clearing-engine.ts:956`) is the financial half's one line, with
       `assets/index.ts:45-47` declaring the credit books `SPREAD_LIKE` and the sovereign book
       `YIELD_LIKE`. A participant VALUES on its spread and BIDS a price:
       `priceFromSpreadBps` moves to the participant's side, `spreadBpsFromPrice` to after the
       clear, and the OAS at `07b:271` stops being an input and becomes a report.

    **IT MUST NOT BE BYTE-IDENTICAL.** The moment value becomes units × cleared price, every
    balance sheet in the model moves, because today's stored values are costs, pars and stale
    marks. Bank capital moves, ratios move, NAVs move, and identities that have been quietly
    comparing a cost to a mark start failing. **That failure is the finding.** Seeding at par to
    keep week 1 unchanged — which an earlier draft of this step proposed — preserves the defect
    and proves nothing. The measurement to keep is `P5`'s sizing (≈140B on the credit book alone)
    and its equivalents for goods, plant and housing once they have prices at all.

    **ORDER — set by the user, 2026-09-03:** *"Isn't government bonds in the current financial
    assets category? Start with refactoring that then move in order of higher to lower
    difficulty."* So: **sovereign** (13-SOV, the hardest and the one with five parallel
    structures) → **credit** (price clears instead of a spread) → **equity** (the stored value
    goes) → **inventory at cost versus price** (the new holding-gain mechanism) → **goods**
    (the price already exists and is discarded) → **plant and housing** (units must be defined
    before anything else is possible — step 26 owns that decision). Each class is its own commit
    and each is expected to move the numbers.

    **AND IT OWNS 11f.** `O7` reports ~55 tranches a week claimed beyond their face because
    `register-split.ts:65` spreads an ISSUER-level position across tranches with no cap, while
    `07b:530` clears one instrument per COMPANY. Clearing per tranche in price space closes it.
    Two hypotheses are spent: incomplete claims — DISPROVED; the issuer/tranche oscillation —
    DISPROVED AND MEASURED (it made O7 worse, 105 tranches and 0.10B against 55 and 0.01B).
13c. **CURRENCY IS THE OTHER UNIVERSAL CHARACTERISTIC** (user, 2026-09-03: *"Every single asset
    has a specific currency in which it's issued and in which is priced on, that's another key
    universal characteristic… why is so much stuff called USD?"*)

    **The suffix is a lie, repeated 11,243 times** (1,395 distinct `…USD` identifiers across
    `src`; 518 in `src/domain` alone). `domain/currency.ts` states the design in its own header:
    every monetary figure is stored in the price level of the region that OWNS it, and *"nobody
    re-denominates their books."* So a German firm's `cashUSD` is euros, its `principalUSD` is
    euros, its `payrollUSD` is euros. Rule 9 — the unit is part of the number — failing at the
    largest scale in the tree. It is exactly the `countedIn` defect one axis over: a bare number
    whose meaning lives in a comment instead of in the type.

    **And the ledger is currency-blind, which makes it more than cosmetic.**
    · `grep "currency"` across ALL of `engine/ledger/*.ts` and ALL of `engine2/*.ts` → **one
      hit**, and it is `formatCurrency`, a display helper. An account has no currency field; its
      currency is implied by its owner's region and never read.
    · `pay()` (`settlement.ts:227`) takes `amountUSD` and converts NOTHING. A German firm paying
      a US supplier subtracts N euros from one balance and adds N dollars to the other. The wire
      ledger balances perfectly, because it is comparing two numbers that are not the same kind
      of thing.
    · Only **19 `convertLocal` call sites exist, in 6 files** (`currency.ts`, `initialization`,
      `05-unit-bidding`, `sourcing-intent`, `freight-clearing`, `foreign-direct-investment`) —
      every one a DECISION stage comparing a foreign quote. **Zero in settlement, accounts,
      holdings, or any audit.** Conversion happens where somebody remembered, and nowhere money
      actually moves.
    · **No entity has per-currency books.** One balance per party.

    **THE STRUCTURE IT SHOULD BE — the same abstraction, one field wider:** an asset declares
    `countedIn` (done, §9.13 part 4) **and `quoteCurrency`**; a price is per unit IN THE ASSET'S
    QUOTE CURRENCY; value in any numéraire is `units × price × fx(quote → numéraire)` — one
    expression that cannot be evaluated without naming a currency. **Cash becomes an asset like
    any other**: a position in a currency, whose price in its own currency is 1 by definition
    (step 13's one allowed hard-coded 1). Per-currency books then FALL OUT of the position
    abstraction instead of being bolted on — an entity holding EUR and USD holds two positions,
    the way it already holds two bonds — and `pay()` gains a currency because a payment is a
    transfer of units of a currency asset. This subsumes step 30c's `Money<C>` brand and the
    journal's currency column, which were parked in PART VI for want of exactly this.

    **Order, set by the user 2026-09-03** (*"The first thing is currency is a needed field in the
    clearing and cash settlement systems. Everything that touches money or assets need to have a
    currency. and each entity needs a bank account per currency… Implement it, let the code throw
    errors and fix them. also rename the variables so that they actually make sense. Then do
    sovereign and the rest. this is a move fast break things kind of job."*): **13c runs BEFORE
    13-SOV.** The TYPE first, then SETTLEMENT and ACCOUNTS, then CLEARING, then the audits, then
    the RENAME — mechanical once the type carries the truth, and last so the compiler has been
    doing the work.

    **PARTS 1 AND 2 ARE DONE (§9.13c).** What is LEFT of 13c:
    · **the rename** — 11,243 `…USD` identifiers, of which a handful are now literally true
      (`foreignOfficialClaimsUSD` is a numéraire claim and says so). Mechanical, and last;
    · **clearing** — an instrument's quote currency. Every book still clears in the money of the
      region that runs it, which is right for a domestic auction and unexamined for a
      cross-listed one; and `financial-clearing-engine`'s `unitValueUSD` has no currency at all;
    · **the contracts with no denomination.** `SecurityLoan`, `DerivativeContract` and the PE
      commitments carry no currency field, so every payment they generate reads its money off
      the obligation's OWNER (`obligationCurrencyOf`) or off the market it trades in
      (`c.regionId`). `TradeInvoice` is the one obligation in the model that already carries its
      own denomination, and it is the shape the other three want;
    · **13c-FX-3 — THE NET IMBALANCE STILL ACCUMULATES, AND THAT IS §6.1'S FX ROW.** §9.13c-FX-2
      stopped the runaway and did not stop the drift: the desks' book opens at −45.8B in week 1
      (was −390.6B) and reaches −181.3B net / 227.2B gross by week 16, about −8.5B a week off a
      small base rather than +53B a week off a huge one. What is left is a persistent ONE-WAY net
      trade flow that the elastic side of the FX book cannot absorb — `residualByPair`, which the
      stage already publishes as its own liquidity diagnostic. Three candidates and none of them
      is obvious, which is why this is a step and not a fix: the elastic side is genuinely too
      small (a capacity question — XB2b's number); the flow is genuinely one-way and something
      real should be financing it (a capital-account question, and a persistent trade imbalance
      financed by the banking system IS a real phenomenon); or the invoice-currency convention in
      `05-unit-bidding` makes it one-way by construction (buyer money for firms at :1957, ORIGIN
      money for households at :2191 — two conventions in one auction, which is worth settling on
      its own). Measure which before touching any of them, and per rule 12 do not judge the
      levels on the way.
    · ~~**13c-FX — CONVERTING AT THE LEDGER IS THE WRONG MECHANISM, AND IT IS MINE**~~ (DONE,
      §9.13c-FX; kept here because the reasoning is the step) (user, 2026-09-03:
      *"is that the cleanest and the real world way of doing that?"* — it is not).
      §9.13c part 2 settles a cross-currency payment by debiting the payer in its own money and
      crediting the payee in its. That conserves value and closes every identity, and it is wrong
      three ways:
      **(a) it makes the per-currency account dead code.** No party ever ends a week holding a
      second currency, so the structure this whole step exists to build is never used;
      **(b) rule 3 — the conversion is ALREADY modelled.** `fx-clearing.ts:108` reads *"an
      importer sells its own money to pay an exporter in the exporter's"* and puts that flow in
      the book that clears the rate. The ledger now performs the same conversion a second time,
      at mid, with no counterparty, at last week's snapshot rate while the market prices the
      identical flow at this week's. One real event, two representations, one of them priced by
      nobody;
      **(c) it has no payer.** `05-unit-bidding:2126` already charges an FX spread on exactly
      this flow, to a named desk, from a named payer (`R_FX_SPREAD`). A firm pays the spread in
      stage 05 and then converts free at the ledger.
      **THE MECHANISM.** A payment moves ONE currency: both legs land in the payment's own money.
      A party short of that money BUYS it — a real order in the FX book at the cleared rate plus
      the desk's spread — and a party paid in a money it does not want SELLS it. Held foreign
      balances then revalue, which is the next bullet. The measured "every US bank short 23B of
      euros, 8B of sterling, 22B of yen after one week" is not an argument against this: it is
      the missing purchase showing up as a negative balance, and the model already has that shape
      for a different scarcity (`overdraft-sweep.ts` turns an overdrawn balance into a facility
      draw). **And it pays for itself:** once the shorts are real orders,
      `ctx.bilateralTradeWeeklyUSD` at `fx-clearing:108` — a derived aggregate standing in for
      orders nobody places — is deleted, which is rule 1 on the flow that sets the rate;
    · **stage 05's household leg.** `05-unit-bidding:2191` pays `units × book.clearedPriceUSD`
      for a household, segment or treasury buyer — the ORIGIN auction's money — where the firm
      loop two hundred lines above converts to buyer money first (`exWorksBuyerMoney`). Both are
      now honestly labelled, so the household leg converts at the ledger instead of not at all;
      that it was ever a raw number was a 34% discount on every foreign good a household bought.

13-SOV. **THE SOVEREIGN IS A BOND — CONVERT IT COMPLETELY** (user, 2026-09-03: *"the
    sovereign needs to be completely converted. it should have the same construction of a normal
    bond, they are a normal bond with some different characteristics."*)

    `GovDebtTranche` (`region-macro.ts:312`) is `{ id, principalUSD, couponRate, originationWeek,
    maturityWeek, tenorAtIssuanceYears }` — a **strict subset** of `DebtTranche`
    (`company.ts:75`), field for field. A sovereign here is a fixed-rate senior bullet bond whose
    issuer is a government; it has no characteristic a corporate bond lacks, it only LACKS ones
    (no seniority stack, no call protection, no floating leg). For that non-difference it carries
    **five parallel structures**:

    | | corporate | sovereign |
    |---|---|---|
    | type | `DebtTranche` | `GovDebtTranche` — a subset |
    | store | the engine2 tranche store | `reg.govDebtTranches`, a plain array |
    | holdings | itemized, per instrument, per holder | `sovereignBondHoldingsByTenor: Record<tenorKey, USD>` — **a bucket with no instrument in it** |
    | clearing | clears a **price** | `07c` clears a **YIELD**, then writes `reg.zeroRates` |
    | curve | derived from cleared prices | `reg.zeroRates` / `computeSovereignBookAnnualYield`, its own object |

    Row 3 is step 12's miskeying still standing: you cannot ask who holds a given government
    bond, because the holding is keyed by TENOR BUCKET, not by instrument. Row 4 is rule 1
    failing outright — the sovereign is the one asset in the model that does not trade on a
    price. Row 5 is step 25's two-curve-owners defect, which cannot be fixed while the curve is
    the thing that clears rather than a read of what cleared.

    **The conversion.** A sovereign becomes a `DebtTranche` issued by a GOVERNMENT party: same
    type, same store, same itemized holdings, cleared to a PRICE by the same engine, with the
    zero curve DERIVED from those cleared prices. `GovDebtTranche`,
    `sovereignBondHoldingsByTenor` and the parallel curve path are deleted. This subsumes the
    sovereign half of step 25 and `assets/index.ts`'s `YIELD_LIKE` row.
    Known consumers to move: `macro/banking.ts:91,170,566`, `macro/evolution.ts:815`,
    `macro/initialization.ts:392,491`, `audit/ownership.ts:46`, `audit/money.ts:126`,
    `companyGenerator.ts:673`, `ledger/bank-transfer.ts:42-46`, `repo-clearing.ts:99,119,712`,
    `holdings-view.ts:109,316`, `07f:197,478`, `07c`, `11-fiscal-and-sovereign-debt.ts`,
    `government.ts`, `government-entity.ts`.

13b. **Coupon accruals are dated wires.** `pendingHolderAccrualUSD` is a side map beside the
    paper. It should be a dated wire that RE-KEYS with the paper when the paper moves, landing on
    the per-tranche register — the same treatment every other claim now gets. Step 13 keeps
    accrual on FACE; this makes the accrual itself an instruction rather than a number in a bag.

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
15b. **News slice 2.** The derivation cites the books and ranks by size; what it still cannot
    tell is a story that develops. Follow-ups through an estate, an auction that failed or came
    in under-subscribed, and contract-break streaks. (The fourth item on the original list,
    damper binds, is moot — step 19 deletes the damper machinery.)

16. **A tap, not a new facility** (user). An issuer that wants more of the same debt REOPENS an
    existing tranche: face is added at the week's clearing price, the proceeds are the price × the
    added face, and holders of record are unaffected. This replaces the proliferation the audit kept
    finding (`overdraft-sweep.ts:158` writes a fresh hardcoded 350bp facility per sweep;
    `tranches.ts:355` has a bare 350 fallback). Requires step 13 (a tap prices off a real price).
16b. **Insurance is a market, not three price-takers.** A policy moves to the insurer that
    prices lower, and an insurer's price answers its own losses and its own capital. The three
    insurers exist; the market between them does not. Verify: premium shares move week to week,
    and an insurer under a capital action loses book before it loses its licence.

17. **Derivatives are centrally cleared, and margin is risk-based** (user). Today a contract is
    bilateral (`contract.ts:39-41`, parties `a`/`b`) and `initialMarginRate` is a flat stated
    number per class — **0 for CDS, IRS and commodity futures, 0.02 for FX forwards**
    (`classes/*.ts`), so three of the four classes are uncollateralised and the fourth charges
    every ticket the same 2% whatever it is. **Margin does not work that way and must not be a
    stated shape** (user, rule 19): initial margin covers the move a position can make before it
    can be closed — the reference's own volatility over a close-out horizon, scaled by the
    portfolio's netting — and variation margin is the mark, daily. Both fall out of quantities
    this model already clears, so neither needs a number. Novate every
    contract to the region's CCP: each side faces the CCP, initial margin is posted TO it, variation
    flows THROUGH it, and a default is its waterfall (IM → default fund → mutualisation) rather than
    a bilateral close-out. Capacity becomes a clearing-member limit, keeping rule 14. Then the market
    view is open interest, margin held and net position per member, by class — the "stats on the
    derivative markets overall" the user asked for. While here: the close-out replacement values are
    undiscounted (`irs.ts:47`, `cds.ts:69`) and a credit event pays a REGIONAL AVERAGE recovery
    (`cds.ts:58` + `derivative-lifecycle.ts:122`) instead of the estate's own workout on that issuer.

17b. **An options class, and the FX swap lines.** Premium is a periodic leg paid once and
    exercise is an event termination at intrinsic value — two profile methods on the one contract.
    The real work is its MARKET; until it exists, stage 12's player options stay on the legacy
    layer instead of the one book, which is the last thing outside it. FX swap lines need an FX
    funding market first — build the market, then the lines — and that gate has not moved.

17c. **Credit protection has ONE buyer and ONE reason** (user). `derivative-markets/cds.ts:60`
    builds hedge demand from the region's BANKS only, and within a bank only from
    `facilityRowsOf` — its loan book. So a bank's BOND book is unhedged, and nobody else in the
    world can buy protection at all. Three demands are missing and each is a real one:
    (a) the bank's bond and desk exposure to the same names, on the same large-exposure rule;
    (b) **a non-financial firm's counterparty exposure** — a long-term supply contract or a large
    receivable is credit risk on a named buyer, and a firm carrying it has every reason to lay it
    off. The contracts and invoices already exist as objects on the lane; this is the first thing
    that would price them;
    (c) an asset manager or credit fund taking a VIEW rather than a hedge — the other side of the
    market, and the reason a spread is a price rather than a bank's internal transfer.
17d. **The credit index** (user). `cds.ts:83` builds one instrument per reference entity: there is
    no index product. A CDX is a fixed basket of names traded as one line, which is how broad
    credit risk is actually bought and sold, and it is the natural instrument for an asset
    manager that wants the asset class rather than the name. It also creates the index-versus-
    single-name basis — a second measurable relationship, and one of 17f's comparables. Needs the
    contract to carry a basket reference, and a credit event to settle the one name's weight.
17e. **Futures on government bonds, and the basis trade** (user). `commodity-future.ts` is the
    only future in the tree. A deliverable govie future plus the cash-futures basis is the largest
    single source of real repo demand in a real market: the basis trader is long the cash bond,
    financed in repo, and short the future. **Step 7 made the repo and reverse-repo flows
    load-bearing for the whole banking system's liquidity, and step 30b is about to make the
    overnight sleeve a decision — this is the demand side those two are missing.** Requires
    step 13 (the future prices off a real cash price) and pairs with 17's margin.
17f. **The relative-value book, and it need not be written strategy by strategy** (user: "is there
    a programmatic way to do that across asset classes?"). **There is, and the model already holds
    the list.** Today a hedge fund's strategy is a row of hand-written boolean flags in
    `HEDGE_FUND_STRATEGY_PROFILES` (`institution-profiles.ts:117`) — `shortsEquity`,
    `tradesCommodityFutures`, `runsFxDirectional` — one flag per market somebody remembered to
    add. An arbitrage is not a flag. It is **two prices for the same risk**, and every such pair
    in this world is ALREADY DECLARED, because the audit measures them:
    - CDS spread against the cash bond's OAS — the basis, `P2`, failing 7 weeks of 16 at HEAD;
    - a future against spot plus carry — `X2`, failing 2 of 16;
    - one good's price across regions in one currency — `X2`'s wedge, 1 of 16;
    - an ETF's price against its own NAV — the premium, named in step 38's unmeasured reads;
    - the swap spread (IRS against the govie curve) and the cross-currency basis (`fx-forward`'s
      CIP basis), both already computed;
    - seniority across one issuer's capital structure — `P1`, failing 16 of 16.
    So the mechanism is ONE mechanism: a **registry of comparables** — two priced things and the
    relationship that should hold between them — and a book that reads the registry, sizes by the
    deviation, and trades BOTH legs (rule 14). A new asset class joins by declaring its comparable,
    not by growing a flag. `RELATIVE_VALUE` becomes a fifth strategy, and the four existing ones
    keep their directional books.
    **The design constraint that decides whether this is a mechanism or a plug:** the arb book
    must be CAPITAL-CONSTRAINED and able to LOSE — funded in repo or prime brokerage, posting real
    margin, forced to cut when it draws down. Limits to arbitrage are why real bases persist. A
    fund that always closes the gap is a clamp wearing a fund's clothes, which rules 1 and 2
    forbid, and it would mask exactly the defects P2 and X2 exist to report. **The audit keeps
    measuring after the funds exist:** a basis that survives a well-capitalised arb book is a
    finding; one that only survives because nobody could trade it was never a price.

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

20b. **The interbank unsecured market.** The last boundary line's named successor, and it was
    never built: surplus banks lend to short ones at policy plus the borrower's own spread, and
    only what no bank will lend reaches a standing facility. Today a short bank goes straight to
    the window. Pairs with step 20's lending capacity.
20c. **A solvent bank answers its own margin.** X1 reports a solvent bank running a negative
    margin (UK: ORDO, 6 of 16 weeks at HEAD) and the bank does nothing about it. Run off the book,
    reprice deposits, cut costs — the bank profile's response to its own margin. Step 30b owns the
    likeliest CAUSE of the compression; this is the bank's reaction to it, which is missing
    whatever the cause. Measure on the reference before building (rule 12).
20d. **Management is a state that decides.** `management-review` reviews; it does not decide.
    Capital-allocation policy (target leverage, payout versus reinvestment), growth-versus-margin
    orientation, risk appetite, product-line entry and exit, acquisition intent, guidance — each a
    real decision with a real consequence, replacing a coefficient that stands in for one.

### PART IV — EVERY PRICE IS CLEARED (rule 1)

20-LLR. **NOTHING CAN FAIL FOR WANT OF LIQUIDITY, AND THAT IS THE MONEY SYSTEM'S LARGEST HOLE**
    (user, 2026-09-03, asking whether the desks and the central bank are buyers of last resort so
    that an auction cannot fail — half right, and the half that is right is not in the auctions).

    **THE AUCTIONS ARE FINE, and the reasons are worth keeping.** A stock book hands nothing to a
    residual dealer: `unsoldStaysWithHolder: true` in 07b/07c/07d/07e/07f means a seller that
    finds no buyer KEEPS ITS PAPER (OWN7). The desks are capacity-bounded participants with real
    reservations (`dealer-desks.ts:106,153`), not a backstop. The central bank's auction order is
    `plannedPurchasesByTenor`, sized by `openMarketPolicy` from the policy rate against the
    Taylor target — a policy quantity, NOT a response to weak demand, so it cannot rescue a bad
    auction. And a primary deal is PULLED past the issuer's walk-away
    (`financial-clearing-engine.ts:779`), while unplaced sovereign issuance is retired outright
    (`withdrawUnplacedIssuance`). A treasury CAN fail to place its debt here.

    **WHAT CANNOT FAIL IS A BANK.** `raiseCentralBankLoanUSD` (`bank-lending.ts`) is four lines:
    it computes the shortfall against the operating buffer and lends **exactly that, always**.
    No collateral, no haircut, no eligibility test, no penalty rate, no cap, and no path on which
    the central bank refuses. `bank-funding-close.ts` calls it for every bank every week, up to
    eight rounds, until every reserve account is at its buffer. **Sized at week 16 of the
    reference: loans to banks 53,972M USA, 84,231M UK, 77,005M JPN, 11,018M EUR** — the UK's
    banks are carrying 84B of central-bank credit against 6.4B of reserves.

    Three failures compound into one:
    · **the facility is unbounded** where the model's OTHER central-bank credit is properly
      collateral-bounded (`repo-clearing`'s `unencumberedBorrowingCapacityUSD` with real
      haircuts from `computeSovereignRepoHaircuts`). That is rule 3: two ways to borrow from the
      same central bank, one of which is disciplined and one of which is not, and the
      undisciplined one is the escape hatch from the disciplined one;
    · **resolution triggers on CAPITAL ONLY** (`isBankUnderPca`, `BANK_MIN_CAPITAL_RATIO`), so a
      bank fails on solvency and never on liquidity — the reverse of the real world, where the
      overwhelming majority of bank failures are funding events;
    · **no depositor ever runs.** A grep for depositor flight across the tree returns nothing.
      Household and corporate deposits move by market share and by the lending book, never
      because a bank looks weak, so the one mechanism that turns a weak bank into a failed bank
      does not exist.

    Together these mean the FUNDING CHANNEL cannot transmit anything. A bank can be bleeding
    reserves, short in four currencies and financed entirely by its central bank, and nothing in
    the model will price that, withdraw from it, or close it. Bagehot's actual rule — lend freely,
    against good collateral, at a penalty rate, to the solvent — is three constraints and the
    model has none of them.

    **THE CAUSE IS AN ORDERING DEFECT, AND EVERYTHING ABOVE IS ITS SYMPTOM** (user, 2026-09-03:
    *"Don't fix the symptoms, fix the cause."* — the four constraints this step first proposed
    were all symptom patches; they are struck).

    **The money market clears at stage 3 of about fifty.** `runRegionalRepoSession` — the session
    where reserve-poor banks fund against collateral, reserve-rich banks and institutional idle
    cash lend, and the standing facility sits in the book as the posted-rate seat of last resort
    — is called from **`02b-bank-diversification.ts:413`**. Every book that MOVES reserves runs
    after it: 07b, 07c, 07d, 07e, 07f, the derivatives, the whole of stage 08's cash walk, and
    settlement itself at stage 308.

    The two comments in the tree contradict each other and the second one is right.
    `02b:407` claims *"Every real flow has posted"* — at stage 3, almost nothing has.
    `bank-funding-close.ts`'s header states the truth: *"the shortfall is made by the books that
    clear AFTER 02b … A repo session or a raise struck in the morning cannot see any of it. **A
    real treasury funds its day at the end of the day; this is that.**"* It has the diagnosis
    exactly right and then implements the wrong thing: instead of moving the MARKET to the close,
    it puts an unbounded CENTRAL BANK at the close. `02b:409` even asserts *"there is no separate
    'facility draw' step to run afterwards"*, and `bank-funding-close` at stage 417 is one.

    **So the unbounded loan is a plug for a market that was already closed when the need arose.**
    In aggregate the banking system's reserves barely move on a week of customer flow — they are
    REDISTRIBUTED, one bank's drain is another's gain — so a session held after the flows would
    match almost all of it bank to bank, against collateral, at a cleared rate. The session that
    runs before them cannot see a single one, so the whole redistribution falls to the central
    bank: it lends 54–84B a region to the banks that lost reserves while taking 87–250B back
    through the reverse-repo window from the institutions whose cash the market never placed.
    **The central bank is doing the interbank market's job because the interbank market is
    closed by the time there is a job to do.**

    **THE FIX IS TO MOVE THE SESSION, NOT TO BOUND THE LOAN.** Run the money market at the close,
    where the shortfall is, and the rest follows without being added: borrowing is
    collateral-bounded because repo already is; the facility is the corridor's ceiling because it
    is already a seat in that book; a bank that still cannot fund faces a real constraint; and
    `raiseCentralBankLoanUSD` is DELETED rather than fenced. What 02b keeps is the morning roll
    (`unrenewedWholesaleUSD`) — the repayment of yesterday's funding, which genuinely belongs at
    the open — and `reg.repoRateAnnual`, `repoFundableNeedUSD` and `repoClearedVolumeUSD` become
    reads of the close's session.

    Only after that is it worth asking the three questions the symptom list was reaching for — a
    penalty rate, a solvency test, depositor flight — because only then does a bank that cannot
    fund have anywhere to be. Expect the run to get worse before it gets better, and per rule 12
    do not judge the levels on the way.

21-BRACKET. **THE BRACKET IS STILL A PRINT, AND IT IS MEASURED: 206 TIMES IN 16 WEEKS.**
    Step 21 below names this; instrumenting `solveClearingStat` counted it. Over the 16-week
    reference, cumulative: **67 solves returned the TIGHT bracket** (`demandAtU(uLo) > targetUSD`
    — oversubscribed even at the extreme, printing −2000bp for a spread or 1% of last week's
    price) and **139 returned the WIDE one** (the segment walk found no crossing, printing
    100,000bp — a 1000% spread — or 100× the price). Both counts grow monotonically with the run
    (tight: 0, 1, 5, 18, … 67).

    **And there is no damper to absorb them.** `financial-clearing-engine.ts:793` records the
    user's own instruction — *"THERE IS NO CAP. The book prints where demand met supply this
    week"* — which was right about caps and leaves the bracket reaching the books directly:
    `comp.oasSpreadBps`, the curve's observed point, every mark derived from them.

    **THE CAUSE IS THE SIGNATURE.** `solveClearingStat` returns `number`. There are books for
    which no clearing level exists — no demand at any level (the 139: `targetUSD` is zero, the
    walk's `slope > 0` test fails at every segment, and the fall-through prints the bound), and
    demand that exceeds the float at every level (the 67: level-independent mandated cores summing
    past what exists, which is not a mandate but an inconsistency). **A total function over a
    partial domain has to invent something, and what it invents is the bracket.** Adding an
    `UNTRADED` state to the adapters — which is what this step first proposed — is a symptom
    patch: it leaves the function free to keep inventing and asks every caller to notice.

    The fix is that the solve RETURNS whether it cleared, so a book with no price cannot be
    mistaken for one with a price, and the compiler makes every adapter say what it does about
    that: carry last week's mark and say so, or trade nothing. The saturation retreat
    (`targetUSD = min(float, demandAtWideEnd × 0.999999)`) stays — it is right for a book whose
    demand merely cannot ABSORB the float, and it is exactly why the wide-end fall-through is
    reachable only when there is no demand at all.



21. **A bracket can never be a print.** *(MEASURED — see **21-BRACKET** above: 67 tight and 139
    wide prints over the 16-week reference, growing monotonically, with no damper between them and
    the books. The saturation retreat added since this step was written handles a book whose
    demand cannot ABSORB the float; it cannot handle one with NO demand, which is the 139, because
    there is no level to retreat to.)*
    `financial-clearing-engine.ts` returns the numerical
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
25. **One curve owner. SIZED: `P6` measures all 20 tenor points disagreeing, worst 36bp.** `07f:461` refits `yieldCurveParams` through bills+bonds while leaving
    `zeroRates.tenor2Y…30Y` at 07c's cleared values, against 07c's own header claiming sole
    ownership — one real curve in two disagreeing representations, with consumers split between
    them. One owner refits once through all cleared points and derives every field from that fit.
26. **The remaining formula prices, deleted — and WHAT PLANT IS, decided once.** *(11e's last
    slice folded in here, deliberately: the seed and every birth assign `grossPPEUSD` with no
    wire and there is no asset kind for plant — `ASSET_KINDS` carries `HOUSE`, not plant. You
    cannot wire a thing before deciding what it is, and the shape is exactly what the two
    disagreeing depreciation schedules below are a symptom of: `capexUnderConstruction` already
    carries plant as a stack of DATED vintages while the sheet carries it as one number. Decide
    it once, here, and the wire follows; deciding it twice guarantees they diverge again.)* `12-portfolio:141` re-derives a bond price from the
    cleared OAS through Nelson-Siegel (a round trip that cannot return the cleared price) and splits
    P&L attribution by invented 70/30, 80/20 and 40/60 fractions that reach the user through the turn
    summary; `carryCalculator.ts:56-236` is a whole invented spread/yield world beside the cleared
    one; `stage08-back.ts:1861` falls back to deriving the CDS spread from the OAS, destroying the
    basis; `05-unit-bidding.ts:2430` runs a SECOND PD model 1,250 lines after the comment claiming
    there is one; `05-unit-bidding.ts:1182` prices the seller's floor off an invented 5% cost of
    capital and 60% LGD; `dealer-desk.ts:117` charges a stated real-market spread table as a real
    cost in five books; `front-core.ts:750` vs `capital-programme.ts:190` run two depreciation
    schedules that cannot reconcile.

26b. **Housing clears.** `housingStockUSD`, a median price and an ownership rate are an
    aggregate marked by formula — dwellings have no owners and no price anyone struck, which
    rule 1 does not allow and no step currently covers. Households, builders and estates clear
    dwellings by price; the aggregate becomes a read of units with owners, and houses get their
    wires.

### PART V — THE INSTRUMENT TELLS THE TRUTH

27. **The audit measures what it claims — and its tolerances are float dust (rule 28).** The
    percentage bands are an inventory of their own and every one of them can hide a real number:
    `estate-resolution.ts:591` forgives `1e-6 × face` on a register-versus-ladder identity (0.6M on
    a 528M tranche is 1000× that and it is a real over-issuance — §9.11f); `money.ts` M1 forgives
    `assets × 1e-4`, M5 `assets × 2e-3`, M6 `moneyBefore × 0.005`; `ownership.ts` O6 forgives
    `max(1e7, issued × AUDIT_BOOKS_TOLERANCE)`; `accounts.ts:194` allows 5% on an exact two-legged
    identity. Each becomes an ABSOLUTE dust bound derived from the sum actually performed, and
    whatever then fires is a step. The rest of this step: `audit/index.ts:45` omits `'W'` from the scoreboard, so
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

28b. **The units sweep, once, at the source.** Rule 9 is a rule with no sweep behind it. Walk
    every rate, flow and index at the point it is WRITTEN, establish its periodicity and unit, and
    pin each with a test. Step 15 fixes the unit bugs the audit found at the point they are
    RENDERED, which is the same class of error caught later. `historicalInflation` and
    `historicalZeroCurves` carry a one-week lag that belongs at the type.

33. **SENIORITY IS DECORATIVE, AND IT IS WHY `P1` CAN FAIL FOREVER** (found by the atlas pilot,
    `docs/systems/corporate-credit.md` node G5). `DebtTranche.seniority` is
    `'SENIOR' | 'SUBORDINATED'`, stamped at issuance and priced into the spread by every
    participant's view. The estate assigns recovery seniority by instrument **TYPE** instead
    (`estate-resolution.ts:547-579`): LEVERAGED_LOAN and BANK_FACILITY → `SECURED`, CORP_BOND and
    COMMERCIAL_PAPER → `UNSECURED`, EQUITY → `EQUITY`. **`SUBORDINATED` appears nowhere in the
    estate machinery.** A subordinated bond and a senior bond of the same issuer therefore recover
    identically in every state of the world.

    That is the CAUSE of a failing audit nobody had connected to it: `P1 seniority orders the
    spreads` breaches on 841–1073 issuers a week, and it CAN, because holding a subordinated bond
    is economically identical to holding a senior one — there is no state in which the
    subordination costs the holder anything, so nothing makes it trade wider. A seniority that
    changes the price and not the payout is not a seniority. Fix the waterfall to read the
    instrument's own seniority (rule 29: `P1`'s count is the symptom, this is the cause) and
    `P1` becomes a real measurement instead of a permanent line.

34. **A CREDIT EVENT IS ONLY EVER A MISSED PAYMENT** (atlas nodes B5, G1, G2). Three absences,
    one shape:
    · **no covenants.** `DebtTranche` carries none. The only occurrences of the word in `src` are
      a bank's own lending heuristic (`bank-lending.ts:12`, "a covenant-style 3x") — a sizing
      rule, not a term of any instrument. An issuer cannot breach anything;
    · **no acceleration.** A default does not make the principal due. Both `accelerat` hits in the
      tree are tax depreciation;
    · **no observable event.** A missed payment is a state of the firm, not something a holder is
      notified of and acts on.
    Covenants are how credit risk is observed BEFORE a default, and their absence is why the only
    credit dynamic this model has is the binary one. This is the mechanism behind `A4`'s
    divergence too: with nothing to observe between "paying" and "gone", an assessment has
    nothing to update on but the accounts.

35. **THERE IS NO RESTRUCTURING** (atlas node G7). Zero occurrences of `restructur` or an exchange
    offer across `src`. Default's only path is liquidation through the estate, and recovery is
    whatever the assets fetch. Most real corporate defaults are negotiated — terms amended, debt
    exchanged for equity, holders voting — and the choice between workout and liquidation is a
    large part of what SETS recovery. Until it exists, `LGD` is a property of the asset sale and
    not of the credit.

36. **ONE RATING, HELD BY NOBODY** (atlas node A4). `Company.creditRating` is a property of the
    firm, computed at `stage08-back.ts:1230`. In a real market an assessment is an OPINION:
    agencies publish theirs, holders run their own, and the disagreement is a large part of why a
    book has two sides. One universal rating means every participant agrees about credit by
    construction, which removes a source of the demand dispersion the auction needs — and is a
    rule-3 shape (one representation of a thing that should have an owner, or several).

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
30c. **The type level's deferred three, and the security as a union.** The `Money<C>` brand at
    `pay()` (it lands with the journal's currency column), the `details`-bag discriminated union,
    and the security as a discriminated union with behaviour extracted from the stages. Each is a
    representation question, which is why they sit in this part: a union the compiler checks is
    one representation where a bag of optional fields is many.

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
31b. **The last three stated costs and bases.** The insurer's claims loss ratio and the card
    operating cost become measured loss and servicing events; the corporate tax BASE is the
    statement's own rather than a stated one. Transfer pricing was deferred with a reason — re-read
    that reason here.

32. **Rule 17's remaining violations.** `05-unit-bidding.ts:1430,1475,2288` switches on the product id
    `passenger_vehicles` with a hardcoded durable-stock model (and `:906` on
    `commercial_rental_services`); `companyGenerator.ts:400-418` maps Financials and Banks to
    `SoftwareDigitalServices` to size their revenue, and `:38-59` keeps a 14-arm category switch with
    hand-set income shares beside its registry-derived successor; `industry-registry.ts:1027-1047`
    hardcodes capex and linkage ids with `!`, so a new capital good silently misses its view;
    `assets/index.ts:173` tests `'MMF_SHARE'`, absent from the `HoldingType` this module owns.

### PART VII — THE ATLAS IS MAPPED (the absences come out)

37. **MAP ALL 45 TREES ONTO THE CODE.** The required side is finished — 45 of 45 written from the
    domain with the code shut, committed before any mapping, which is what makes an uncited node a
    FINDING rather than an unwritten tree (§9, THE SYSTEM ATLAS). What is left is the other two
    thirds of the method: **the mapping** (one `path/to/file.ts:symbolName` citation per node) and
    **the diff** (what is MISSING, what DIVERGES, what is present but in the WRONG PLACE). Every
    node that ends with no citation is a finding, and each finding either becomes a step here or
    is recorded in the tree as OUT OF SCOPE with the reason — those are different answers and the
    file must say which (`docs/systems/README.md`).

    **The pilot already proved the yield.** Corporate credit alone produced steps 33–36: seniority
    priced but never honoured, a credit event that can only ever be a missed payment, no
    restructuring at all, one rating held by nobody. Four absences, none of which any sweep had
    ever reported, from ONE tree of forty-five.

    **Order.** Credit's own mapping is marked STALE and is re-walked first, against the depth-3
    node ids it now has. Then the trees whose systems the code most plausibly HAS — the register,
    the clearing engine, money and settlement, the banks, goods, equity — because a citation that
    fails to resolve there is the strongest kind of finding. The trees whose systems the code may
    not have at all (the derivative contract's twelve, trade credit, freight, housing, ratings)
    come last, and a wholly uncited tree is itself the report.

    **The gate already holds the citations honest**: `scripts/check-atlas.sh` fails when a cited
    `file:symbol` stops resolving, and when a `core.ts` stage or a file under `src` appears in
    neither a tree nor `docs/systems/UNMAPPED` — so `UNMAPPED` shrinks as this step proceeds and
    the count is printed on every commit (today: 34 citations, 295 files accounted for). Rule 25's
    harness applies per commit as usual; a mapping commit changes no code and gates on §4's static
    half.

### PART VIII — MEASURE ONCE (rule 12)

38. **The long run.** Only when 1–37 are done: `WEEKS=60 SHOCKS=1` (`npm run verify`), the batteries,
    the burn-in convergence gate. Then the standing measurements: the 1e-8 week-1 drift bisected one
    dump per step; the level and the unemployment ratchet; the state-growth drift on device; UK/EUR
    bank margins and the mint drift (the NIM measure with the sovereign-book accretion, and the
    paydown sweep of claims on issuers that left the book); logistics scale. And the finer reads
    still owed, which have never been taken:
    - the equity market's LEVEL (today the float change moves it by construction);
    - bank NIM against household interest income — a liquid bank whose depositors are not leaving
      pays zero, which may be the mechanism's own answer or may be a missing payment-services fee;
    - the derivative layer's verify list: swap spread and CDS-cash basis calm and stressed;
      contango when inventory is high and backwardation when it is scarce; convergence at expiry;
      a hedged firm feeling less P&L from a shock it hedged;
    - the newer books' first prints: stock borrow clears, fee distribution, recall cascades; an ETF
      premium near zero in a calm week; channel margin a sensible fraction of shelf price.

    A number that is still wrong here is a missing mechanism named at last, not a tuning target
    (rule 18).

### PARKED BY THE USER — not steps, and not to be started without being asked

Two whole projects stand half-built outside this list because the user parked them. They are
recorded here so that "§3 is the only list" stays true and neither is discovered a third time.
Do NOT resume either without the user saying so.

**SCALE — the columnar universe scale-up.** Parked 2026-09-01, mid-Stage-II. **Exact resume
point: `productLines`** (63 read sites across 18 files; staging is store → dual-write → check →
readers file by file → declared delete), then `historicalFundamentals` + `dealerConsensus`, then
the 85 scalars (the object becomes a view; dump-from-columns is a declared re-baseline), then
III ∥ IV, V, VI (gated on III), VII. Scoreboard at park: 1,558 → 1,305 ms/wk battery-verified on
the dev box; ~950–1,015 ms/wk on the user's phone with the clearing pool at 6–7 workers. Two
inputs bear on Stage III's go/no-go: the on-device state-growth drift (§6) and the browser worker
precedent — the clearing pool's ~20% cut of the 07x sum on device, the campaign's first positive
parallel measurement anywhere. It also owns the damper's float half (the small-cap equity tail),
which step 19 must not delete blindly.
**The lesson it already paid for, which applies to any step here:** in this codebase an object
structure's cost is its ALLOCATION (views, rebuilds, spreads), not its traversal — a flip that
deletes traversal but adds materialization can LOSE, so views materialize dirty-only or not at
all.

**AU — Aurora's remainders, and the game layer.** The object registry is wide (eighteen object
kinds, twenty-three functions) and reviewed whole; what is left, each its own bounded commit:
`money` — the payment trace by reason and category, the "a dollar is a dollar" screen (needs the
journal read by party); `watch` — a grid of `object function` cells refreshed each week (the tape
already records what it would show); `curves` beyond the sovereign — secured, swap-spread, credit
by rating, commodity, cross-currency basis; `book` — the derivative book by class; supply
contracts and invoices as addressable objects. **The game layer stays parked by the user's order
until they say otherwise.** Steps 14 and 15 are UI work but a different scope (naming,
searchability, unit bugs) and do not stand in for these.
**Verification discipline if either resumes:** every function on every kind is walked by the
Chromium tour at 390×844 and the screenshots read before a commit; a table header must not
truncate on the phone, and a screen with nothing to show says why.

## 4. THE GATES

| Command | Cost | When |
|---|---|---|
| `npx tsc --noEmit`, `npm run build` | seconds | always, before every commit |
| `npx eslint src scripts test --no-warn-ignored --max-warnings 354`, `npm test` | seconds | always; both ratchet (may fall, never rise) |
| `bash scripts/check-hygiene.sh` | seconds | always |
| `PROFILE=1 WEEKS=4 npx tsx scripts/harness.ts` | ~30 s | a profile is not a run; allowed any time |
| `WEEKS=2 SHOCKS=0 VERBOSE=1 npx tsx scripts/harness.ts` | ~50 s | the probe before the one run, for a settlement-touching step |
| `WEEKS=13 SHOCKS=0 VERBOSE=1 NODE_OPTIONS=--max-semi-space-size=64 npx tsx scripts/harness.ts` | ~5 min | **THE ONE RUN per commit** (rule 25) |
| `WEEKS=60 SHOCKS=1` (`npm run verify`) | ~25 min+ | **END OF PROJECT ONLY** (rule 12; step 38) |

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
| The money family (M1–M7) and "the money that is not anyone's" | At HEAD: **0.00B unowned on one line** — M7's 11 dust rows, worth nothing, in one week of sixteen. **M1 through M6 all print nothing.** A new line here is a defect at its site, not a tolerance to widen. |
| O4's two dust facilities | 2 facilities worth 0.00B naming a lender with no sheet, one week of sixteen, arrived on §9.11d's re-path. Dust; re-measure before treating it as open. |
| The 1e-8 week-1 drift (§7.370) | Three firms differ at the eighth digit at week 1; 13% price gap by week 13. Bisect by file, ONE dump per step. Watch it to zero; never widen a tolerance for it. |
| The state-growth drift (§7.335, §7.380) | Weekly cost +45% over weeks 5→80 on two independent device runs, all stages inflating proportionally. First suspect: the contract book's row growth. |
| TGA over a quarter; occupational mismatch; top-down vs bottom-up household income; the private tier that sells nothing; loan-book Spearman noise | Watch the TGA's LEVEL not its shape; mismatch is composition outrunning retraining; `estimatedHouseholdIncomeUSD` is still the anchor; ~300 seeded private firms per region carry `productLines: []`; Spearman 0.26–0.76 at 23–32 names — re-measure as the universe grows. |
| Sovereign price elasticity to a size-only bidder | The books ARE thin, which is consistent with the equity tail the parked SCALE project owns. Measure; do not tune the depth. |
| The two credit-ETF dust singles | 0.01B, standing since well before the wires campaign. Likeliest an in-kind slice edge, or pending-settlement timing at a boundary. May already be closed by the wires and no-caps work — re-measure before treating it as open. |

## 8. THE AUDIT IN FULL — moved to `docs/AUDIT_ARCHIVE_2026-09-02.md`

The 2026-09-02 sweep, as the reviewers wrote it: 1,771 lines of findings by area (A1–A11), with
its own step→area index. It was a RECORD and not a work list — §3 cites none of its rows — so it
lives in its own dated file and the plan keeps one live list.

**It was never re-verified**, its line numbers are from 2026-09-02, and at least one of its rows
was measured wrong. Treat a row there as a lead with a file:line, not a fact.

## 9. THE LOG — WHAT IS DONE

A finished step leaves §3 and lands here: what changed, why, and the measured numbers.

**THE SYSTEM ATLAS — THE REQUIRED SIDE, 45 OF 45.** Authorised by the user 2026-09-03 (*"Do the
pilot. I like the idea of forcing it to be updated"* → *"Proceed with the other systems"* → *"move
instrument contracts to their own directory, and finish the whole set of trees"*), so it is no
longer PARKED; what remains of it is §3 step 37, the mapping.

**Why it exists, in the user's words:** *"I've asked to do multiple full sweeps of the code and
never once it was reported the credit didn't have a price or FX didn't exist."* The reason is
structural, not effort. **A sweep reads code and asks whether it is correct, and an absence has no
line number to be read at.** Every file in this repo does something plausible and is heavily
commented; nothing in the credit stage says "and there is no price" — it clears a discount margin,
coherently, and the missing price is invisible unless you arrive already expecting one. FX was
found the same way: not by reading code, but by the user asking why everything was called USD.
**A sweep finds defects; only a reference model finds absences.**

**The one decision that decides whether it works, and it is an ordering decision.** A tree derived
FROM the code reproduces the code's blind spots exactly, looks complete, and finds nothing: a
credit tree built by reading `07d-leveraged-loan-clearing.ts` would have a "clear the DM" node and
no "price" node, because the file has none. So every required tree is written from the DOMAIN with
the code shut and **committed before any mapping** — the git history is the proof — and the empty
nodes are the finding.

**What is in the repo now.** `docs/systems/` — a README carrying the method, the rules and the
45-row status table, and **45 required trees**, all depth 3. `docs/instruments/` — the instrument
CONTRACTS, which are not systems: `bond.md` (fourteen characteristics, cited by both credit trees
and short-term debt) and `derivative.md` (twelve, cited by CDS, IRS, FX forwards/XCS and commodity
futures). A tree whose subject is an instrument cites a contract and states only where its type
answers a node differently — which is what keeps "this type answers N5 differently" distinct from
"nobody ever answered N5", the whole point of the exercise.

**The node-type rule, and it came from the user** (*"not imposed, a consequence (just apply this
comment everywhere)"*). **NOTHING IN A TREE IS IMPOSED. A node states a REASON, never an
OUTCOME.** "Surplus banks lend and deficit banks borrow" is not a requirement, it is what happens;
the requirement is that each bank posts a schedule out of its own position, cost and constraints,
and who ends up on which side is the RESULT. A tree written in outcomes reads as complete and then
licenses code that assigns the outcome directly — rule 1's defect wearing the atlas's clothes. So
every node is marked as one of three, and a node that is none of them does not belong:
- **REASON** — "it has a cost of funds and a position it wants": checkable, and cannot be
  short-circuited by writing the answer down.
- **VERIFY** — "worse credit trades wider": a thing to MEASURE, never to enforce. A verify node
  that fails is a finding about the mechanism, not a licence to clamp the number.
- **FORBID** — "there is no central-bank overdraft for the treasury": a requirement that something
  be ABSENT. **These are the nodes a code-derived tree can never contain, because the code cannot
  show you what it should not have.** They are where this method earns its keep, and the ones this
  week's work produced include: no buyer of last resort by construction and no mechanism adding
  demand to make itself clear (the clearing engine); no conversion at the ledger boundary and no
  numéraire as the place value lives (currency — both of them defects actually found and fixed in
  §13c-FX, written down afterwards as requirements); no exogenous default event; no fixed recovery
  rate; no rating derived from the price; no representative SME and no representative household;
  no instantaneous costless transport; no sale that settles instantly by construction; no fund
  that cannot fail.

**What keeps it from rotting** — the part most likely to fail, and this repo has three dead
documents proving it (a `CLAUDE.md` describing sections that no longer existed, an
`ARCHITECTURE.md` referenced from code and never written, 699 markers pointing at a deleted
section). The code side of every node is a MACHINE-VERIFIED citation. `scripts/check-atlas.sh`
(the one new file in `scripts/`, by the user's explicit grant, recorded in the hygiene allowlist)
runs inside `check-hygiene.sh` and so gates every commit. It does two checks: **RESOLUTION** —
every `path:symbol` in every tree resolves, in `docs/systems/*.md` and `docs/instruments/*.md`
alike; and **COVERAGE** — every stage `core.ts` runs and every file under `src` appears in a tree
or in `docs/systems/UNMAPPED`. Today it prints: 34 citations resolve, 295 source files accounted
for. `UNMAPPED` shrinks as step 37 proceeds, and the count is on every commit.

**The pilot's yield, which is the argument for step 37.** Corporate credit alone produced §3 steps
33–36: seniority priced into every spread and never honoured in a waterfall, a credit event that
can only ever be a missed payment, no restructuring anywhere in the codebase, one rating held by
nobody. Four absences from ONE tree of forty-five, none of which any previous sweep reported.

**Scale, measured:** 68,788 lines over 295 files, 76 stages, 72 domain modules. The 45 systems are
grouped INFRASTRUCTURE (6), MARKETS (16), FINANCIAL INSTITUTIONS (7), PUBLIC SECTOR (2), FIRMS (5),
THE REAL ECONOMY (6), CROSS-CUTTING (3); granularity rule, stated in the README so the count can be
argued with: **a system is something with its own required tree — its own instrument, actor or
mechanism that could be wholly absent.** That is why banks are three trees and derivatives are five.

**Also fixed here:** two §3 steps both numbered 33 (the atlas pilot's findings collided with the
long run), so the long run is now 38 and its precondition reads 1–37; the parts renumbered so the
new mapping part is VII and MEASURE ONCE is VIII, which keeps the long run last where it belongs.

**13c-FX-2 — THE DESKS SQUARE WITH EACH OTHER, AND THE TRADE AGGREGATE IS DELETED.** Two halves.

**THE SWEEP: a firm does not keep money it has no use for.** Any foreign balance beyond what a
party is about to pay out in that money is sold back to the desks. That is what a treasury does,
and it is what keeps a foreign-currency account MEANINGFUL rather than dead (nobody holds one) or
unbounded (everybody hoards): a party with a real ongoing obligation in a money keeps enough to
meet it and sells the rest. Measured: non-bank foreign holdings went from **+88.3B across 3,528
non-zero rows to 0.0B across 48** — the rows that survive are the parties that genuinely owe in
that money next week.

**AND IT WAS NOT ENOUGH, WHICH TAUGHT ME THE ACTUAL STRUCTURE.** The desks' book kept growing
(−390.6B week 1 → −601.4B week 4) because the sweep can never reach the other side: a US desk
sells euros to a client, the euros land on a euro-area payee as its HOME money, and home money is
never swept. The desk's short is real, unfunded and one-directional.

**But the shorts are SYMMETRIC, and that is the mechanism.** US clients buying euros leave US
desks short euros; euro clients buying dollars leave euro desks short dollars. A US desk short
euros holds dollars; a euro desk short dollars holds euros. **They swap, and both books go flat**
— no third party, no warehoused residual, no unowned leftover, which is why this needed none of
the residual-ownership decisions `fx-clearing`'s XB6 comment deliberately left open. That is what
an interbank FX market IS: dealers offsetting each other's client flow, with only the net ever
reaching anyone else. Week 1 fell from **−390.6B to −45.8B**.

**THEN THE AGGREGATE COULD GO.** `fx-clearing.ts:108` read
`ctx.bilateralTradeWeeklyUSD[exporter][importer]` — a derived aggregate standing in for orders
nobody places, and a second representation (rule 3) of a conversion the ledger now performs for
real. It is replaced by the desks' actual books: inelastic, because a desk short a money it does
not issue must cover and an uncovered nostro is an overdraft rather than a position it chose. The
flow the auction prices is now ~50B of real net imbalance instead of the gross it stood in for.

**MEASURED, 16 weeks: 243 in 48 → 241 in 47.** Against the 231-in-46 baseline what remains is
sovereign and register, not money: `O1 sovereign held = outstanding` (EUR, JPN), `O3 register rows
name a live instrument`, and the harness's EUR sovereign-bond invariant — all 13-SOV's. 4 weeks
stays at the baseline's 50 in 19.

**WHAT IT DID NOT DO, stated plainly.** The book is bounded per week but the NET still drifts:
−45.8B in week 1 to −181.3B by week 16, gross 45.8B to 227.2B. The runaway is gone (+53B a week
off a huge base became −8.5B a week off a small one) and the drift is not. It is the one-way flow
the elastic side cannot absorb, it is `residualByPair`, and it is §6.1's FX row — logged as
13c-FX-3 with the three candidate causes and the instruction to measure before touching any.


**13c-REVAL — A BALANCE IN SOMEBODY ELSE'S MONEY IS WORTH SOMETHING ELSE WHEN THE RATE MOVES.**
Nobody pays anybody, so it is not a payment and it cannot go through `pay()`: it is a MARK, and
the holder takes it as an unrealised gain or loss. Until this stage the model had nowhere to put
one — `trade-settlement.ts`'s invoice gap was the only instance anybody had written.

**Most of it needed no booking at all**, which is the point of §3.13's rule that value is a
function and never a field: `cashOf`, `entityCashOf` and `bankReservesOf` convert every row at the
rate in force, so a firm's cash is worth what it is worth the moment the rate changes. What broke
were the STORED numbers beside those reads — a bank's equity, a central bank's sheet — written in
a week whose rate is gone.

**The method is two reads, not a formula.** Value the book at the OLD rate, promote the rate,
value it again, book the difference. No assumed exposure: the difference between two reads of the
same balances IS the exposure. A bank's equity takes the whole of its move (it is the residual
claim; a depositor's foreign balance revalues on the depositor's book and against the bank as a
liability, and the two net). A central bank gets the thing a central bank actually has for this,
a **revaluation account** — two lines on its sheet are held in the numéraire rather than locally,
the official claim (which must be, or the world's bilateral sum is an exchange rate) and the FX
reserves, so a rate move changes their worth in that book while nothing else moves. It is not
remitted: the sheet's "no retained earnings" note is about INCOME, and a translation gain is not
income until it is realised.

**MEASURED, 16 weeks: 251 in 51 → 243 in 48. The whole M family is gone** — `M1 central bank
closes` in all four regions and `M5 bank sheet closes` on all three US banks that carried a
foreign position. Against the 231-in-46 baseline exactly two families remain, and neither is a
money identity: `O1 sovereign held = outstanding` (2.33% USA week 6, 3.33% EUR week 12 — holdings
converted against an outstanding that is not, which is 13-SOV's) and `O3 register rows name a live
instrument` (13 rows worth 0.00B). 4 weeks stays at the baseline's 50 in 19.


**13c-FX — A PARTY THAT MUST PAY IN A MONEY IT DOES NOT HOLD BUYS IT.** §9.13c part 2 settled a
cross-currency payment by debiting the payer in its own money and crediting the payee in its. Asked
whether that was the real-world mechanism, the answer was no, three ways:

  **(a) it made the per-currency account dead code.** No party ever ended a week holding a second
  currency, so the structure the whole step exists to build was never used — which is the tell;
  **(b) rule 3 — the conversion was already modelled.** `fx-clearing.ts:108` reads *"an importer
  sells its own money to pay an exporter in the exporter's"* and puts that flow in the book that
  clears the rate. The ledger did the same conversion a second time, at mid, with no counterparty,
  at last week's snapshot rate while the market priced the identical flow at this week's;
  **(c) it had no payer.** `05-unit-bidding:2126` already charges a desk spread on exactly this
  flow, from a named payer, and the ledger's free conversion undercut it.

**The mechanism instead.** A payment moves ONE currency: the payer pays euros, the payee receives
euros and HOLDS them. A party short of a money BUYS it — from its own region's desks, at the
cleared rate, paying the pip (`fx-funding.ts`, at the head of every settlement pass, so the
purchase and the payment that forced it settle together, rule 14). A party short of its OWN money
while holding somebody else's SELLS, rather than overdrawing, which is what stops a seller paid in
a foreign currency hoarding it forever. **The "every US bank short 23B of euros after one week"
that made me convert at the ledger was never an argument against this: it was the missing purchase
showing up as a negative balance.**

**THE ONE TALLY THE ROWS CANNOT GIVE, AND WHY IT BROKE.** A bank's own income and expense is not
readable off its rows' deltas — the deltas cannot tell a customer's money from the bank's — so it
is accumulated leg by leg as it settles (`ownNetByParty`). Accumulating four currencies into it RAW
put a US bank's equity at **−23.75B** in week one, the first week its desk sold euros. It converts
into the bank's own money now, at the pass's rate.

**THREE THINGS THE PASS FOUND, EACH ONE A READ DISAGREEING WITH ANOTHER READ.**

1. **A bank's own income cannot be summed across currencies.** It is the one tally the rows'
   deltas cannot give — the deltas cannot tell a customer's money from the bank's — so it is
   accumulated leg by leg as it settles (`ownNetByParty`). Accumulating four currencies into it
   RAW put a US bank's equity at **−23.75B** in week one, the first week its desk sold euros.
2. **A resolution assumes a POSITION, not its value.** The failed bank's foreign rows stayed on
   the shell when only the home-money total was paid across, and the guard found **16.7M still on
   QYTV** in week 12. It moves money by money now, and the legs sum to exactly the `cashUSD` the
   plan struck the shell's equity on.
3. **THE RATE CANNOT MOVE INSIDE A WEEK.** With `v2.fx` written by the auction mid-pipeline, a
   resolution valued a failed bank's book at the post-auction rate (`bankReservesOf`, off the
   world) while settlement paid it away at the pre-auction one (`ctx.fx`, a snapshot) — and the
   **134.8M** difference, which is a revaluation, was reported as money left on the shell. It had
   already shown up once as a 0.04B hole between settlement's gross and the wire summary, and I
   had patched THAT by copying the table onto the context, which fixed one pair of reads and left
   every other pair broken. The real rule is one rate per week: the auction writes `v2.fxNext`
   and the next week's open promotes it (`openFxWeek`). `ctx.fx` is the world's table again, so a
   stage, an audit and the UI cannot read one balance three ways.

**AND A BANK IS THE MARKET, NOT A CLIENT.** Every kind excluded from the funding pass is one whose
foreign position is a POSITION rather than a shortfall: a desk's is its inventory, a bank's own
account is its nostro — and a nostro runs overdrawn, which is exactly what an unsquared spot book
looks like on a balance sheet.

**MEASURED.** 2 weeks 20/12, 4 weeks **50 violations in 19 families — the baseline, family for
family**, with parties genuinely holding and trading four currencies: 2,579 home-currency rows and
5,257 foreign, 3,528 of them non-zero. 16 weeks: 251 in 51 against the baseline's 231 in 46, and
every new family is downstream of the two mechanisms this step does NOT yet have — nothing books
an FX gain, and nothing flattens the desks' book. The desks carry the other side, as they must:
−537.7B of foreign currency against +88.3B held by everyone else at week 3, and by week 16 the UK
central bank's reserves have run from 92.5B to 6.4B behind it. That is a real position going
unsquared, which is 13c-FX-2, not a defect in this one. Per rule 20, nothing is rolled back
because the 16-week print is 20 violations uglier than the version this replaced: that version was
structurally wrong — its per-currency accounts were dead code and its conversion was a second
representation of an event the FX book already prices.


**13c — CURRENCY IS A UNIVERSAL CHARACTERISTIC (parts 1 and 2).** The `USD` suffix was a lie
repeated 11,243 times across 1,395 identifiers. `currency.ts` said in its own header that every
figure is held in the money of whoever owns it and that nobody re-denominates — and then `pay()`
took an amount, a payer and a payee and converted **nothing**, so a German firm paying a US
supplier took euros out of one balance and put dollars into another, and the wire ledger balanced
because it was adding two numbers that are not the same kind of thing. Nineteen `convertLocal`
call sites existed, every one in a DECISION stage comparing a foreign quote, and **none where
money actually moves**. `grep "currency"` across all of `engine/ledger` and all of `engine2`
returned one hit, and it was a formatter.

**What landed.** `CurrencyCode` is a type, not a suffix, and `currency.ts`'s primitive is keyed by
currency rather than by region — a region is a place, money is money. `v2.fx` is the world's one
rate table, written by the FX auction and by the seed and read by the ledger, the audits and the
UI; it lives on the world because a balance cannot be read without it and reads happen where there
is no context. **An account is (party, currency, bank)**: a party holds as many rows as it holds
currencies, and what it is WORTH is a conversion, never a bare sum. `pay()`, `payByIds()` and the
payment journal carry a currency, and ~120 call sites now say which money they move. Money is
**four assets** in the wire ledger, not one called `USD`; a unit of a currency costs one of itself,
which is the one hard-coded 1 that belongs (§3.13's degenerate case).

**THE RULE THE LEDGER SETTLES BY, and the measurement that chose it.** The first cut landed the
raw foreign amount on both books. Measured after ONE WEEK: **every US bank short 23B of euros, 8B
of sterling and 22B of yen** — a payer with no balance in a money it never held simply went
negative in it. A party short a currency it does not keep is not a funding position, it is a
missing conversion. So: **a payment is denominated in ONE currency and each side lands in the money
it keeps its books in.** The payer's bank debits it in its own money and delivers the currency the
obligation is in; the payee's bank credits it in ITS own money. Value is conserved because both
legs are the same amount of the same currency through the same rate, and it is exactly
`currency.ts`'s own rule that nobody re-denominates. 155 violations → 88.

**WHAT A PAYMENT'S CURRENCY IS, and where it comes from.** The obligation's, and the obligation
belongs to somebody: a wage to the employer, a coupon and a redemption to the paper (off the
holding row's own `regionRef`), a tax to the treasury, a derivative's margin to the market it
trades in (`c.regionId`), a stock loan's collateral to the money the shares are quoted in, a
fund's call and fee and distribution to the FUND — never reflexively to the payer, because a
capital call is paid BY the LP and owned BY the fund. `obligationCurrencyOf(v2, obligor)` names the
owner and reads the money its account was opened in, which the seed took from its region. Nothing
is left settling on a convention.

**EVERY LEDGER IS ONE BOOK'S, SO EVERY LEDGER READS IN THAT BOOK'S MONEY.** The settlement report
was adding euros to dollars in six places at once — the treasury's flow statement, the household
sector's, the pools', the cross-border position, the banks' reserve tallies, and the world's
central-bank identity. Each is now struck in the money of the book that reports it, and the two
figures that genuinely span every book — the settled gross and the central banks' residual — in the
numéraire, computed while the ROWS are in hand rather than by summing four per-book maps. 88 → 51.

**THREE THINGS ONLY THE CONVERSION COULD HAVE FOUND.**
1. **`ctx.fx` cannot be a live reference.** Settlement converted the week's gross at the pre-auction
   rate and the wire summary valued the same wires at the post-auction one: W1 reported a 0.04B
   hole that was an exchange rate moving between two reads. The week's rates are snapshotted at
   the open; this week's auction sets next week's.
2. **W1 can never be exact in one money.** A dated row is wired in one week and settles in another,
   at another rate. The identity is now per currency, in that currency's own units, where it is
   exact and needs no rate at all — the `moneyByCurrency` / `grossByCurrency` pair.
3. **A bilateral claim needs ONE denomination.** `foreignOfficialClaimsUSD` booked in each central
   bank's local money left the world's sum non-zero by 3.0M whenever a rate moved after the flow —
   a revaluation, not a missing leg. It is carried in the numéraire on both sides now (one of the
   few fields whose `USD` suffix is literally true) and `centralBankAssetsUSD` converts it into the
   book's money.

**A `!` IS A CLAIM, AND TWO OF MINE WERE FALSE.** `securities-lending.ts` read
`currencyOf(issuer!.region)` inside the branch whose CONDITION is `!comp || !issuer` — the branch
that exists precisely because the issuer may be gone — and it threw in week 5 of the reference run,
after four clean weeks. `shared-helpers.ts` did the same at a site where `issuer` is `undefined`
for every non-equity instrument. The lesson is not "check for undefined": it is that a currency
should be read off the PARTY that owes the money (`obligationCurrencyOf`), which always has one,
rather than off an object that may have stopped existing. A short run is not evidence; four weeks
passed and the fifth was where the name died.

**Two defects of my own, caught by the same process.** The seed's funding residual read a bank's
deposit line before the bank had a currency, so the SME line came back zero and the household
residual swallowed it — **10.6B on the largest US bank**; a deposit line now takes the bank's
currency from the caller, because every caller holds the bank. And the read paths were calling
`internString`, which MUTATES: a lookup that misses appends, renumbering every id assigned after
it. `stringRef` reads without appending.

**MEASURED, 4 weeks, SHOCKS=0.** Baseline 50 violations in 19 families. With every region forced
onto one currency the run is unchanged through week 3. With the real four currencies and the whole
ledger converting: **50 violations in 19 families — the baseline, family for family.** Every
identity that broke has been made to read in one money and every one closes.

**MEASURED, 16 weeks: 248 in 48 against the baseline's 231 in 46.** Four families go and six
arrive, and the six ARE THE NEXT FINDING rather than plumbing left undone. They fire late (weeks
6, 12–14) and they are small (`M1` 0.04B EUR, 0.20B JPN, 0.27B UK on sheets of ~180B), and every
one of them is downstream of the same missing mechanism:

  **NOBODY BOOKS AN FX GAIN OR LOSS.** A balance held in a money that is not yours is worth a
  different number when the rate moves, and this model has nowhere to put that. The central banks'
  claims on each other are the clearest case: the claim is one bilateral number in the numéraire
  (it has to be, or the world's sum is a revaluation — see above), the reserves that funded it are
  in each region's own money, and when a rate moves the two sides revalue by different amounts.
  `M1`'s residual IS that revaluation, and `centralBankAssetsUSD` converting the claim at this
  week's rate is what makes it visible rather than what causes it. The same shape reaches
  `M5` on the one US bank that funds a foreign customer, and `O1 sovereign held = outstanding`
  (2.3% USA week 6, 3.9% EUR week 12) is holdings converted against an outstanding that is not.

  This is a MECHANISM, not a bug: an unhedged foreign position has a P&L, and until it is booked
  the identities that span two currencies cannot close. It is 13c's next slice and it is what the
  transaction-FX gap in `trade-settlement.ts` (`tradeInvoiceFxGainUSD`, already computed and
  already real) is the one existing instance of. Per rule 20 nothing here is rolled back to make
  the print smaller; per rule 12 no judgement is offered on the levels.

Tests 135, eslint 341, hygiene and build pass.

**The levels move, and they should.** A US household buying a euro-priced lot used to pay the euro
number as if it were dollars — a 34% discount on every foreign good. That is corrected, and it
moves reserves, trade and bank balance sheets. Per rule 12 no judgement is offered on whether the
new levels are right; only that the identities close.


**O8 — one piece of paper, one name.** (`PENDING`) Asked why one holding has two possible keys,
the answer turned out to be worth measuring rather than asserting. The first version of O8 counted
issuer-named rows in the REGISTER and came back **clean** — the register is entirely tranche-keyed
(the seed opens issuer-named at `initialization.ts:548` and the books convert it in week 1). So
the second key is not in the register at all. It is the **dealer desks**, and they are not partly
on it: **11,655 credit positions worth 301B are keyed by ISSUER and not one names a tranche.**

The two key-spaces are disjoint, which is the worst case: every move between a desk and the
register crosses them, wiring a sale of one name against a purchase of another for the same paper.
They net in USD within a kind, which is why `W2` reports only the residue rather than the whole
301B — and that residue is a real one, 32 findings a run, and it feeds `O7`.

The history is plain enough: the register was migrated to per-tranche rows and the desks were left
behind. Folded into step 13, which owns the per-tranche world; O8 is the number to drive to zero.
Measured: 165 in 35 → **181 in 36**, the whole rise being O8 firing every week on a defect that
was always there.

**13 (part 4). The abstraction forces units.** (`PENDING`) The previous attempt bolted a price
onto the side of a value, which is not foundational: a side table can be absent, ignored, or
disagreed with. The type has to make a valueless position impossible to express, and the
compiler has to find every place that made one.

Two changes, and between them they are the foundation:

**Every asset kind declares what its quantity is COUNTED IN.** `AssetModule.countedIn` —
`PAR_USD`, `SHARES`, `GOODS_UNITS`, `CONTRACTS`, `USD` — is required, so a new kind does not
build until it has answered. Rule 9 says periodicity and the unit of meaning are part of a
number; this is that rule applied to the quantity, and it is the half that was missing. **Money is
the one kind counted in dollars, and its price is 1 BY DEFINITION** — a test asserts nothing else
claims that.

**A holding carries `units`, required.** The compiler named every writer that did not set one:
**21 errors across 12 files**, which is the whole set — small, because writers are few and readers
are many, and this is the cheap end to start from. Units are shares where the instrument is
share-counted and par everywhere else. The store's column follows: what was added as `faceUSD`
last commit IS the units column and is now named that, because face for credit is exactly "how
many units" — one column whose meaning is the registry's `countedIn`, not two that overlap.

**Nothing reads units for value yet, so the run is unchanged at 231 in 46** — and that is the
last commit for which that is true. Units are now written everywhere and correct; the next step is
that value STOPS being a stored field and becomes `units × price`, and the balance sheets move.

**13 (part 3). The mark: built, measured, and deliberately not wired.** (`PENDING`) This is the
big one and it did not land. The record is what it produced, because the next attempt should start
from here rather than from the top.

**What is in the tree and staying.** The register carries `faceUSD` beside `quantityShares` — the
same idea, for the same reason: storing only the value makes the size of the book depend on the
price the book is supposed to set. `markCreditBook` in the holdings ledger walks a holder's credit
rows, fixes the face from the value a book wrote it with, and re-marks the value to face × price —
no wire, because a price move is not a trade, which is the rule `markHolding` already stated for
one row. `engine/credit-price.ts` is the ONE adapter between the world's stores and
`domain/pricing`, so the stage that marks and the check that tests the mark cannot disagree about
what the price is. `stages/credit-marking.ts` is the stage. The books write `faceUSD` on their
fills.

**What it does.** With the stage wired, 130,000–200,000 rows re-mark each week and **25B–38B of
value moves**. That is the defect being removed, and it is the right order of magnitude against
P5's sizing.

**Why it is not wired.** Turning it on takes the run from **231 in 46 to 426 in 61**, and the
cause is not the mark — it is that the model is not ready to hold face and value as two numbers:

1. **Face leaks.** `creditRow` adds to the value and only adds to the face when its caller passes
   one, so every non-book path that touches a credit row drives face below value. This was
   isolated by running with the mark OFF and only the audit reading face: `O1` fired 16 weeks of
   16 at −92B, −128B and −237B, and `O6` at −461B. With face and value identical the same run is
   231 in 46. The divergence is the leak, and it is a small enumerable set of call sites.
2. **The mark is not the last word.** Wired after `holdings-writeback`, stages after it and next
   week's books write rows back in par space, so the register ends the week part marked and part
   not — and P5 then reports 357.89B marked against 424.50B implied, which is the un-marked half.

**The lesson, and it is the same one twice now.** A value that two subsystems disagree about
cannot be introduced by marking one of them: every writer and every reader has to move in the same
commit, or the identities that compare them start measuring the price instead of the ownership.
The keying step (§9.12) worked precisely because the desks' store and the auction's read were
separated FIRST and the key changed second. Face needs the same: make every writer maintain face
while face still equals value — where nothing can break, because the two numbers are the same —
and only then let them diverge.

**13 (part 2). The two curves, measured — and the coupon moved onto the cleared one.** (`PENDING`)
A new issue's coupon is struck at "the cleared terms", which sounded settled until you ask WHICH
curve. `stage08-back:1498` read the Nelson-Siegel FIT (`yieldCurveParams`) while `zeroRates` — the
points the auctions actually cleared — is what P5 and most consumers value the resulting paper
against. `P6` now measures the gap: **all twenty tenor points disagree, worst 36bp.** A coupon set
on one curve and a price taken on the other puts a brand-new bond away from par the week it is
born, and that is not a market moving.

The coupon now reads `zeroRateAt(zeroRates, STANDARD_CORP_TENOR_YEARS)` — the cleared points, at
the tranche's OWN tenor, so the two stay linked if that tenor changes. **It picks a side of a
two-sided defect**, and the side is rule 1's: a cleared price is the truth and a fit is a
convenience. `index-calculation` and `12-portfolio` still discount with the fit, so the model is
not yet consistent — that is step 25, which P6 now sizes.

**It did not improve the number and it is kept anyway** (rule 20). Measured (SHOCKS=0 WEEKS=16):
232 in 46 → **231 in 46**; P5's mismark moved 127.9B → 143.5B and P6's worst 28.5bp → 36.0bp,
both on the re-path rather than on the mechanism — the fitted 5Y sat 3bp BELOW the struck one, so
the direct effect was to raise coupons slightly and make the book worth MORE. Two curves cannot be
made consistent by choosing between them at one call site; they are made consistent by there
being one, which is step 25.

**13 (part 1). What "credit trades at par" is worth: 127.9B.** (`PENDING`) The defect has been
in the plan since the audit and nobody had ever put a number on it. `P5` does, using the pricing
module 12b built: take every live tranche, take the spread its own book cleared — the issuer's OAS
for a bond, its discount margin for a loan — and price the paper's real cash flows against the
region's real curve. Then compare with what the register says it is worth, which is its face,
because `holdings-ledger.ts`'s `priceOf` returns 1.00 for every notional instrument.

**1,033.5B of face is worth 905.6B. The mismark is 127.9B, about 12% of the credit book**, and it
points the honest way: spreads widened over the run, so the book is worth less than the par it is
carried at. A bond whose issuer's spread doubled is still marked at 100.

Two caveats recorded at the check rather than left for someone to rediscover. A floater is
compared against its ISSUER's cleared discount margin, because that is the only cleared margin
there is, so a tranche whose own locked margin sits far above it prices far above par — and the
widest of those trace straight back to `P1`'s inverted spreads (a 5540bp facility against a
1011bp bond). They are a handful of small tranches and they do not move the aggregate. Where they
DO matter is as a second reading on P1: a spread that produces a price of 15× face is not a
spread, and P5 makes that visible in dollars rather than basis points.

Measured (SHOCKS=0 WEEKS=16): 200 in 44 → **216 in 45**, the whole rise being P5 reporting every
week.

**12b. Pricing is centralised.** (`PENDING`) The time value of money was written out by hand in
eight modules — `Math.pow(1 + r, -t)` and `(1 - that) / r` and `r / (1 - that)` — each copy with
its own variable names and its own edge cases, so a reader had to prove to themselves that three
files computing `rWeekly / (1 - (1 + rWeekly) ** -n)` meant the same thing. They do.

`domain/pricing/` owns it now, in two modules with one job each: `discount.ts` for the primitives
and `bond.ts` for price-from-spread and its inverse. Nothing in either reads the world, which is
what makes them testable and what keeps the pricing out of the stages. Migrated:
`call-protection.ts` (which was carrying its own complete bond PV), `company-week/debt-ladder.ts`,
`engine2/stage08-back.ts`, `index-calculation.ts` (a fourth copy of the bond PV), the mortgage
level payment in `domain/banking.ts`, `bank-lending.ts` and `evolution.ts` — three byte-identical
copies — and `asset-allocation.ts`.

**Three bounds died with them.** Each hand-written annuity carried `Math.max(1e-6, rate)` because
`(1 - DF) / r` divides by zero. The shared one takes the limit exactly — ten payments of one are
worth ten — so the floor is unnecessary, and with it goes the quiet lie that a negative rate is
0.0001 (rule 2, and the model's own policy floor is −1%).

The new pair `priceFromSpreadBps`/`spreadBpsFromPrice` is step 13's foundation and has no callers
yet. It is solved rather than approximated: price falls monotonically in spread, so the inverse
bisects and a price fed back gives the spread it came from. **Every cash flow is discounted at its
OWN tenor** — the curve's rate where that payment lands, plus the spread, which is what an OAS is
(one spread over the WHOLE curve, not over a single point on it). The first draft took the
shortcut and discounted the schedule at one rate; `engine/pricing.ts`'s condemned
`priceCorporateBond` does the term structure properly, and a replacement that is worse than what
it replaces is not a replacement. Eight tests pin the properties: the round trip, the zero-rate
limits, and that a steep curve prices a coupon bond ABOVE a flat one at the same long rate —
the assertion the shortcut fails.

Measured (SHOCKS=0 WEEKS=16): 197 in 44 → **200 in 44**, the difference being the three floors no
longer rounding negative and near-zero rates up, plus the P- and X-family re-path that follows
(X1 improved, 9 weeks → 5). Tests 126 → 134.

**12. One thing, one key.** (`PENDING`) Asked whether anything else was miskeyed, the answer had
to be a sweep rather than an opinion. `O8` now states the policy and tests every arm of it every
week: a company is its id, an institution is its id, a piece of paper is the instrument it is, a
good is its sub-unit, a contract is its own id and what it is written ON is keyed the way that
thing is keyed.

**The sweep came back with exactly one offender.** Contract parties resolve, CDS reference
entities resolve, and every register row names something that exists — three arms clean. The
desks were the whole of it, and they were not partly wrong: **12,043 credit positions worth
365.5B on the issuer key and not one on a tranche**, because a credit book's clearing INSTRUMENT
is the company (`dealer-desks.ts` keys the book by `inst.id` and 07b's instruments are
`regionCompanies`), while the register had already migrated to tranches.

The fix separates the two: **the desk STORES the paper's name and the auction READS the issuer's.**
`clearingKeyOf` maps a stored tranche back to the instrument the book prices; `priorByClearingKey`
gives the auction the aggregated view it always had; and a credit fill is split across the
issuer's tranches on the way into the book, by the same face weights the register uses, with a
short position keeping its sign. Nothing about the clearing changed — only where its result is
filed.

Measured (SHOCKS=0 WEEKS=16): **365.50B on the wrong key → 0.42B, 20,341 positions now named by
the paper they are.** And **"the money that is not anyone's" reaches 0.00B across ZERO lines** —
the money family is completely clean for the first time.

The count went 181 in 36 → **197 in 44**, and the rise is worth stating plainly: `O1`, `O6` and
`O7` can now SEE the desks. A position naming no tranche could never be compared to a ladder row,
so 300B of credit inventory sat outside every per-tranche check in the audit. On the right key it
is measurable, and what it measures is 11f — the register and the desks together hold more of some
tranches than were issued. That defect did not arrive with this commit; it stopped being
invisible.

**11f (part 1). O7 — the invariant that only ever fired as a crash, and two dead hypotheses.**
(`PENDING`) `estate-resolution.ts` carried a `defect()` that killed the run when an estate's
register claims exceeded the ladder's face on one tranche. It fired for the first time this
session, on a re-path, at 0.626M against 528.1M — and under rule 28 that is not dust, it is a real
over-issuance. But the guard could only ever speak about a firm that happened to DIE inside the
measured window, so what it really reported was which firm died first.

**`O7` replaces it: no tranche is claimed beyond its face, measured every week for every issuer**,
with a dust bound derived from the row count and the face rather than a percentage. It fires
immediately and widely — **~55 tranches in a typical week**, up to 105, and it names SICM's
week-11 primary at exactly the +0.626M the estate died on. The `defect()` is gone: one invariant,
one reporter, and a number instead of a landmine.

Two hypotheses were spent and both are recorded in §3 so nobody repeats them. The second cost a
full run and is the more useful: a position IS re-keyed between tranche-named and issuer-named
rows every week (the split's issuer fallback fires 3,620 times in 13 weeks), and keeping an
untouched position's rows verbatim **made O7 worse — 105 tranches and 0.10B against 55 and
0.01B** — while moving W2 not at all. The oscillation is a real defect and it is not this one.

**11g. The stock loan's missing wire, and the fund that lent to itself.** (`PENDING`) Landed once
O7 retired the crash that was blocking it. `securities-lending.ts`'s `deliver` moved shares
between two books with `store.addShares` on each side and no instruction — the last such path in
the tree. It now emits `wireHoldingMove` first: a new export of `holdings-ledger.ts`, the
instruction alone, for a mover that owns its own row writes, which is what a stage inside the
clearing store's window is.

Wiring it exposed the second half immediately, because the ledger refuses a move from a party to
itself: **the borrow demand was spread across every lender INCLUDING the borrower**, so a fund
borrowed its own shares — posting collateral to itself, paying itself a fee, delivering from a
book to the same book. It cancelled silently for the life of the model. The borrower is now
skipped in its own lender pool and fills LESS rather than more, because re-spreading that slice
over the other lenders would let one of them lend what it does not have.

Measured (SHOCKS=0 WEEKS=16): 157 in 35 → **165 in 35**. W5 fires in more weeks (8 → 12) but the
gross it reports collapsed from **~300M shares a week across ~40 books to ~9M**, and every
remaining gap turned the same sign — which is 11f. The rest of the rise is P- and X-family
market-behaviour lines that rule 12 says not to judge yet.

**11e (part 4). W5 — the register's replay, and what it caught immediately.** (`PENDING`) The
register was wired in part 3 but nothing CHECKED it. W5 does: the register's change is the replay
of its wires, **in shares, never dollars** — a value-keyed register would move every week on the
marks and could never equal its wires, which is the same reason W3 works on ladder FACE and W4 on
goods UNITS. Only kinds held in shares that are asset kinds in their own right are claimed; the
notional kinds join when step 13 gives a holding a face separate from its value.

Two things had to be got right and the first attempt got both wrong, which the instrument said
straight away:
- **An issuer is not a holder of its own instrument.** A vehicle's shares are issued BY the
  vehicle, an institution like its holders but with no register row of itself, so its leg moves no
  row and must not net against the holder's. Without that, every ETF creation cancelled itself and
  W5 reported 777M phantom shares in week 1.
- **Entity ids are not unique across kinds.** The fix for the above tested `party.id === asset`,
  and a seeded institution carries its COMPANY's id (`initialization.ts:918`), so ordinary equity
  wires started dropping real holders' legs and EQUITY lit up instead. The test is now asked only
  of a vehicle claim, where the id genuinely identifies the issuer.

Measured: **142 in 34 against 134 in 33, and the ONLY new line is W5's** — nothing else moved by
one violation, which is also the proof the audit stays pure (it reads the register through
`materializeBook` and perturbs nothing).

**And it found something on its first run.** W5 fires in 8 weeks of 16 on EQUITY, always with the
same sign — the register grows by more than its wires. That is now step 11f.

**11e (part 3). The register opens by wire too.** (`PENDING`) `ensureBooksSynced` mirrored
`itemizedHoldings` straight into rows, so the world's opening holdings existed because an array
said so — the issuers' side of the same gap `seedLadder` had. `seedBook` claims the chain empty
and ISSUES each opening position through `issueHolding`, the same call a primary settlement or an
ETF creation uses, with the issuer the instrument itself names: the firm for equity and corporate
paper (the instrument id IS the company's id), the treasury for a sovereign bucket, the fund for
its own shares.

Two details worth keeping. `ensureBooksSynced` STAYS as the read-side catch-up — `holdings-view`
calls it three times from paths where no wire journal is active, so the wires could not live
inside it; the seed runs first in core and leaves it a no-op. And rows MERGE by (type, instrument)
on the way in where the mirror made one row per array entry, which is lossless: it is what
`consolidateRegister` does to the register at the close of every week anyway.

The hygiene gate earned its keep on this one. The first version asked
`h.instrumentType === 'GOV_BOND'`, and the asset-switch ratchet refused it at 55 against a budget
of 54 — the registry answers that question (`holdingClassOf(...) === 'SOVEREIGN'`), which is both
shorter and right for a kind nobody has added yet.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, violation set identical line for line** — the third
slice in a row that costs nothing and buys provenance.

**11e (part 2). The goods were never seeded at all.** (`PENDING`) The step listed the opening
goods pipeline as unwired. It is not: no firm is generated holding finished stock
(`companyGenerator.ts:703,1303` open `outputInventoryBySubUnit: {}`), no input lot is seeded, and
the seeded in-transit consignments carry no `carrierTicker`, which is exactly the case
`goodsUnitsByKey` does not count as stock — they pass through a sink at dispatch and reappear by
wire on arrival. **The world starts with no goods**, so week 1's stock is precisely what week 1
produced plus what its wires brought in: W4's own identity, with nothing special about it.

So the slice is the audit's half alone — `goodsUnitsByKey: {}` in the opening snapshot — and
**W4 does not fire.** Measured: 134 in 33, violation set identical again.

The lesson is worth more than the line: **check whether the thing you are about to wire exists.**
A step written from a file:line read said the pipeline was seeded without wires; it was seeded
without goods. One grep of the generator would have said so before any of it was designed.

**11e (part 1). The world's opening ladders open by wire.** (`PENDING`) `seedLadder` installed a
seeded or born firm's ladder by mirroring `comp.debtTranches` into rows with `wireRef` set to −1
on every one — face that existed because an array said so. Its own doc said as much: "installed
without wires — principle B's gap". It now claims the chain empty and ISSUES each tranche through
`issueTranche`, the same call every other week uses, so the wire names the issuer and the holder
the tranche names.

That could not work where it stood, and the reason is the finding: **the ladder catch-up ran
BEFORE the week's wire journal was installed**, so a wire written there would have thrown. It now
runs immediately after `setActiveWireJournal` and still before the first stage, which is the
constraint that put it where it was.

The other half is the audit's. Week 1 had no "before", so every week-over-week check skipped it
and the opening world was the one state nothing ever proved. It has a before — the EMPTY world —
and `lastSnapshot` now starts as one, claiming the ladders only. **W3 does not fire: the seed's
wires reproduce the world's opening ladders exactly.** The goods and register keys stay absent
(an absent key skips its check) until those are wired too, which is 11e's remainder.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, and the violation set is IDENTICAL line for line** —
a week of the model's history that nothing could check is now checked, at no cost. One new reason
string needed registering in `payment-category.ts`, which the gates caught immediately and which
is the whole reason that check exists.

**11d (part 2). The margin a client posts and never gets back.** (`PENDING`) Six hypotheses had
died (part 1, below) and the seventh was retracted before it cost a run. What found it was the
user's question: **can the individual wires not be followed to see what appears or goes missing?**
They can, and the answer was one line away.

`depositsOf` — the money stock's own definition — is four deposit classes PLUS
`bankBalanceSheet.clientMarginUSD`. Every other term in it is an account ROW; that one is a field
on the SHEET, so it moves without any settled row moving and no tally can see it. Putting the
region's week-on-week move of that single field into M6's message: **the client-margin line moved
2.55B — the gap to the dollar, first time of asking.**

Behind it were three defects in one mechanism:

**1. The margin is never returned.** `initialMarginUSD`'s own doc says it is "the A side's cash,
held by the B side". The tree contained exactly ONE margin payment — the posting, at
`fx-forward.ts:362` — and no second one anywhere. A contract matured, terminated on an event or
was closed out and the client's cash stayed with the desk for good. Every FX forward is written at
a 2% initial margin, so this ran every week of every run the model has ever done.
`releaseInitialMargin` now pays it back from the desk's securities account, on all three paths a
contract leaves the book by, to the party that posted it (a party that has ceased to exist has
nowhere to receive it — the same rule the close-out legs already follow).

**2. The sheet's line only ever grew.** `clientMarginUSD` ACCUMULATED each week's new margin and
nothing subtracted from it, while `initialMarginHeldUSD` beside it was summed from the live book —
two representations of one quantity (rule 3), one of which could only diverge upward. The sheet's
line is now a read of the live book.

**3. Encumbered collateral was counted as money.** Even with 1 and 2 fixed the identity does not
close: a client posting margin moves its deposit down and the desk's SECURITIES account up, which
every tally reads as the BANK absorbing the money, while the margin line put it straight back into
the stock — the same dollars on both sides. Posted margin is a bank liability and belongs in
`depositsOf` for the balance-sheet identity, but it is not money: the client cannot pay anyone with
it. `spendableDepositsOf` names that once and is used by M6, the audit snapshot and the UI — which
was already subtracting it inline, the tell that nobody thought it was a deposit either.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, unchanged in total, but M6 goes CLEAN** and the money
family is down to ONE check — M7's 11 dust rows worth 0.00B. **M5 staying clean is the proof the
release fires:** had the cash stayed on the securities account while the liability line fell to the
live book's value, assets would have exceeded liabilities on every dealer bank. A new O4 line
arrives in its place, 2 facilities worth 0.00B in one week — dust, and a re-path, not a leak; it is
on the watchlist.

**The lesson: a money stock with a term that is not an account row cannot be audited.** Six
hypotheses and three runs went into the aggregates; the answer came from asking which part of the
stock had no wire behind it. When an identity will not close, look for the term that settlement
never touches.

**11d (part 1). Two silent drops closed, four hypotheses killed.** (`PENDING`) M6 stays open; what
this commit did was make it answerable. `core.ts`'s `byRegion` keyed the per-bank tallies off
companies filtered to `isBankEntity`, so a bank that stopped being one during the week — resolved,
or merged with its sheet cleared — had its whole delta dropped on the floor without a word. It is
now keyed off every company, with `state.companies` behind it, and whatever still finds no region
is NAMED (`bankTallyUnmappedUSD`) instead of absorbed. M6 reports it, and reports the active-bank
filter too whenever summing the stock over all of a region's banks gives a different answer.

Neither turned out to be the cause — both measured zero — and that is the value: **four
hypotheses are now disproved and recorded in §3's step 11d so nobody spends the afternoon on them
again.** The one that took longest to kill was the clearing house: its legs really are the bulk of
the cross-border total (UK week 8, hub −72.8B against real cross-region flows of −4.7B), which
looks damning until you check that money genuinely does move between regions through the hub. Two
more died cheaply afterwards and neither needed a run — the domicile-versus-bank-region suspicion
(every home bank is picked from the party's own region, so they are never different) and the hub
holding margin across a pass (M2's clearing-house residual is clean every week). A seventh was written down and then
talked out of on the arithmetic before it cost a run. What is left is a method rather than a
hypothesis: decompose M6 term by term across the two weeks, the way 11c was found.

`XBORDER_TRACE=1` prints the official-settlement leg per region, split hub and real, and stays.
Measured: **134 in 33, unchanged, and the family scoreboard is byte-identical** — which is what a
commit that only sharpens the instrument should look like.

**11c. The central bank's book drifts — the remittance under-counted its own expense.** (`PENDING`)
EUR's M1 missed by 0.08B and 0.10B in the last two weeks of sixteen: reserves plus the reverse
repo exceeded the assets they stand against. The plan guessed the reverse-repo book, which step 7
had just built. It was the wrong end.

The instrument found it, again, and the way it found it is the point. M1's message named two of
the six asset lines; it now names all ten components on both sides, and a `CB_TRACE=1` flag prints
the sheet EVERY week for every region, breach or not — necessary because the residual is
CUMULATIVE, so the week a leak is made is invisible in the week it finally breaches. Two runs of
that trace put the whole thing on one line: the residual sat at 0.1M through week 14, jumped 75.0M
in week 15, and in that same week the remittance collapsed to −0.1M from a −43M/−61M run rate while
interest on reserves halved to 38.2M with reserves unchanged.

**The central bank keeps no retained earnings** — its income less its expenses is remitted to the
treasury (or covered by it) the same week, which is exactly what makes its assets equal its
liabilities. Its interest on reserves is PAID by stage 02b, bank by bank, at stage 219. The
remittance then RE-DERIVED that expense at stage 395 by summing `reservesInterestWeeklyUSD` over
the region's ACTIVE banks — two representations of one number (rule 3), read 176 stages apart from
a set that `bank-resolution` (stage 390) had changed in between. A bank paid its interest and then
resolved dropped out of the expense; the reserves it had been paid stayed in the world, standing
against nothing. Week 15 measured it exactly: **113.2M paid, 38.2M counted, 75.0M short — the
residual's jump to the dollar.**

The expense is now accumulated on the central bank's sheet where it is paid, like the four smaller
lines beside it (`lastReverseRepoInterestUSD`, `lastLoanInterestUSD`, …), and the remittance reads
what was paid. `lastCouponIncomeUSD` and `lastInterestOnReservesUSD` complete the sheet's income
statement, so it can be read rather than recomputed.

Measured (SHOCKS=0 WEEKS=16): **136 in 34 → 134 in 33**, family diff a single line — **M1 goes
from 2/16 weeks (worst 0.10B) to CLEAN** — and **"the money that is not anyone's" 0.10B across 2
lines → 0.00B across 1**, which is M7's dust. The money family now prints one line in one week,
worth nothing.

Also added on the way, and it earns its place though it found nothing: **M2 reverse repo book =
lenders' parked cash**, the two-sided identity the loan book already had. It was written to test
the plan's hypothesis, proved it clean, and now stands as the check that the window closes.

**11b (part 2). A dead firm's goods still move — the deliveries follow the books.** (`PENDING`)
The money half closed earlier (below); what was left was `O5`, up to 196 consignments in transit
to a firm that is gone. The plan's diagnosis pointed at an estate that had closed and been
dropped. It was wrong, and the instrument said so on the first run: the O5 line now buckets a
dead buyer by WHY it is dead and whether the consignment has landed, and the answer was **100%
`bank/afloat`** in every failing week — not one estate, not one merger, every single one a bank
with goods still on the water.

`rekeyBankLinks` in `bank-resolution.ts` opens with "every link in the world that names the failed
bank now names the assuming one" and re-keys eleven of them — house banks, facility rows, repo,
prime brokerage, the offering pipeline, sovereign and desk accruals, derivatives. Consignments
were the twelfth and were not there. A bank buys goods like any other firm; the assuming bank took
the business and left the shipments behind, so what was afloat named a bank that no longer existed
and stayed afloat against nobody. Both bank outcomes are covered by this one site: a failing bank
is either recapitalised by its treasury (it lives, nothing to move) or resolved into an acquirer,
and the re-key runs on that path before the shell is marked defaulted.

The merger stage had its own copy of the same re-key. There is now ONE — `reassignConsignments` in
`goods-arrival.ts`, which owns the shipment type — used by the merger and by the resolution
(rule 3).

Measured (SHOCKS=0 WEEKS=16): **138 in 35 → 136 in 34**, and the family diff is a single line:
**O5 goes from 2/16 weeks (worst 196) to CLEAN**. Nothing else moved by one violation.
M7's 5–6 remaining rows are worth 0.00B and ride with 11c.

**The lesson, and it is the second time this project has paid for it:** the plan's written
diagnosis of an open defect is a HYPOTHESIS, not a finding. Make the instrument name the cause
before writing the fix — one extra field on the audit line turned a guess about estates into a
one-word answer, and the fix was four lines.

**9b. The household week has no lag.** (`PENDING`) `household-balance-sheet.ts` recorded what
households earned mid-week, reading the week's OWN settlement report — which at that point holds
the intraday pass only. **Every household flow the close and the funding cycle settled was
lost**: not double counted, not deferred, simply absent from the income the economy runs on. It
then parked the answer in three region fields for stage 02 to read the following week.

The lag is deleted rather than lengthened. Stage 02 reads the household week at the top of the
week from `ctx.priorWeekFlows.householdFlowsByRegion` — last week COMPLETE across all three
settlement cycles, which was already persisted and unused — and passes it to `evolveRegionMacro`
as `householdWeek`. The staleness is unchanged (it was already a week old by the time stage 02
consumed it), the data is whole, and `lastWeekHouseholdReceiptsUSD`, `lastWeekHouseholdTaxPaidUSD`
and `lastWeekHouseholdDividendsUSD` are retired (rule 19). Week 1 has no prior week and falls back
to the bootstrap identity exactly as before.

The measured income moves a long way, because the close settles a large share of it: weekly
household income USA 731.9B → 527.9B, EUR 283.7B → 503.6B, UK 235.8B → 194.4B, JPN 294.2B →
170.2B. The dispersion is the point — each region's close settles a different mix of receipts and
tax, and the intraday-only read had been flattening all four toward the same wrong shape.

Measured (SHOCKS=0 WEEKS=16): **131 in 32 → 138 in 35**, and **"the money that is not anyone's"
0.47B across 3 lines → 0.10B across 2**. The money family is what this step is about and it
improved: M5 (bank sheet closes, 2/16) and O3 (register rows name a live instrument, 2/16) went
CLEAN, M1 4/16 → 2/16, M7 3/16 → 1/16. The count rose because household income drives
consumption, consumption drives the goods auction, and the whole run re-paths: the +7 is P- and
X-family market-behaviour lines (rule 12 — not evaluated mid-project) plus one new money line.
Not rolled back (rule 20): the derivation is right and the print is a path.

**The new money line is a real finding and is now step 11d.** M6 fires once (week 8, UK) at 2.55B
unexplained. It CANNOT be mechanically caused by this change — M6's inputs are the settlement
report plus `householdBookDepositFlowWeeklyUSD` and `householdDepositInterestWeeklyUSD`, none of
which this step touches — so it is a pre-existing gap in M6's list of money creators that a large
cross-border week exposes (that week: cross-border +27.82B and banks' own account −21.25B against
a 0.36B move in the stock).

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

**10. Both legs, same money, same counterparty.** (`8daa2ba`) A household's, a treasury's or a
segment pool's goods move lot by lot with the seller that sold them, while the CASH was spread
across every seller in the book pro rata — so a household paid sellers it never bought from, and
its own bill was a residual (the book's total less what firms and segments paid) rather than what
its fills cost, with any disagreement smeared across the sellers. Both legs now walk the same
lots and the residual arithmetic is gone. A SELLER'S REVENUE IS WHAT ITS BUYERS PAID IT: a
cross-border buyer pays in its money while the seller booked the auction's origin-money value, so
statement and account differed by the rate; revenue is now accumulated from the payment legs, the
discipline the freight leg already states. FDI capitalised a foreign subsidiary with no
conversion at all — the two sides in different money, compared raw — and now converts, as its own
header always claimed. Stock-loan collateral is RE-MARKED weekly: struck once and never touched,
there was no variation margin, a squeeze cost nobody anything and `stockLoanNetUSD` was
unfunded. Measured (SHOCKS=0 WEEKS=16): **115 in 33 → 110 in 33**, unowned 0.00B; P2 6/16 → 3/16
weeks, P3 (rating) 16/16 → 14/16, and M6's graze 2.69B → 2.42B.

**11. The wild swings, by named cause.** (`56dc3ee`) (a) **A firm's size scales whole.** All three
resize sites — the padding clone, the thinning lift, the sector normalisation — scaled revenue,
shares, plant, ladder and cash but left the INCOME STATEMENT alone, so a clone at 30% of its
parent carried 100% of its EBITDA (margin above one) and 0.3× its leverage. One helper now scales
every size-proportional line at all three; eps and the margin ratios are left alone because two
scaled lines make an invariant. (b) **A bank is rated on a continuum**: leverage was `revenue ×
0.4` and coverage took exactly TWO VALUES either side of a 5% capital ratio. Now debt against
equity, and years of its own expected losses its capital absorbs. Measured against the buffer
above the regulatory floor first — the default probability's construction — it went NEGATIVE for
a thin but solvent bank and rated it below a corporate with no earnings; on a ladder shared with
corporates the whole capital base is the right base. A test pins the continuum. (c) An empty
index membership returned the BASE LEVEL where callers multiply a fractional change (×1001 in one
week); it now reports no move. (d) **The fabricated CPI year is gone** — 53 weeks compounding at
the target, feeding the Taylor rule, the labour deflator and the news as measurement. History
begins where the world does; until 53 real weeks exist `inflationIsMeasured` is false and the
LEVEL is reported.
Two of my own guards fired and both were right: the debit guard's tolerance was keyed to the spec
rather than the position walked (addReserves' lesson, §9.3), and with that fixed it named
`keepsRow`'s $1 threshold dropping rows of OTHER instruments during a relink — one predicate now,
the same one `pruneEmptyRows` uses, and the ETF basket takes one slice per instrument rather than
per row. Measured (SHOCKS=0 WEEKS=16): **110 in 33 → 134 in 31**. The driver is (a) and it is the
truth the unscaled EBITDA hid — open estates 41 → 77, active firms 2461 → 2427 — and the A/B came
free: the harsher bank coverage gave 79 open estates against 77, so (b) is not the driver. The
deaths expose steps 11b and 11c, both now sized rather than asserted.

**12. Carriers, and the fuel nobody sells.** (`aac7a6e`) `totalDebt` stopped being a field when
the ladder became authoritative, so a carrier seeded with `totalDebt: debtBase` and an EMPTY
ladder opened with NO debt — while its seeded interest, coverage, leverage, rating, net income,
eps and share price were all struck against that debt and no lender held a dollar of it. It now
gets a real ladder from the same generator every other seeded firm uses. And a carrier sells
nothing in the goods book, so it had no input basket and its fuel was expensed off a physics
formula against a purchase that never happened: the world fleet's bunker demand never reached
`refined_products`. Moving goods IS `facilities_and_logistics`, and the registry already states
what a dollar of it consumes — that recipe is now the carrier's basket, no new stated constant,
and the profile's separate fuel charge goes with it. The physics stays as a measurement
(`lastWeekFuelBurnedTonnes`), which is what a bunker bid should eventually be sized from rather
than a share of revenue. Measured (SHOCKS=0 WEEKS=16): **134 in 31 → 131 in 32**, money family
unchanged in kind; O5's consignments 207 → 132.

---

**PART I is closed except 11b and 11c**, the two leaks the doubled death rate exposed. Everything
else in the closed circuit — the interest that was never paid, the residual wired twice, the
silent truncations, the goods mint, the estate that never closed, bank resolution, the treasury's
books, the register's holes, the settlement net, both legs of every trade, the wild swings and
the carriers — is done and recorded above.

**11b (part). The dead firm's money, and half its goods.** (`bf2ecf9`) M7 reported a COUNT of
settled rows whose party the account store has no row for — a hole with no size and no name. Step
11 gave it a size; this gave it a NAME, and the name found the cause in one run: every unmapped
row was `payee BANK_SECURITIES`. **A resolved bank's desk keeps its unpaid coupons** — the dealer
books merge into the acquirer but what that paper had already earned sat on the accrual ledger
under the failed bank's own desk id, so the coupon date paid a desk whose bank has no account and
the settlement store dropped both legs. Re-keyed now in `rekeyBankLinks`, where every other link
to a failed bank already is. **Both ends of a shipment follow the books**: a merger re-keyed the
BUYER and left the SELLER, and an estate swept only what was on its way TO the dead firm. Measured
(SHOCKS=0 WEEKS=16): 131 in 32, unchanged in total; **M7 30 rows → 5** (0.00B either way) and O3's
dangling rows 6 → 4. O5's 132 consignments survive both fixes and keep step 11b open.
