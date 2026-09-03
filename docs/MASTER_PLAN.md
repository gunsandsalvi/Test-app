# THE MASTER PLAN — one file, one project: a closed circuit

**Read §1 before touching anything.** §2 is the map, §3 IS THE WORK (one ordered project; take the
first step), §4 the gates, §5 the lessons, §6 the watchlist, **§8 the full audit record behind
§3's steps**, §9 the ledger of what is done. §1–6 are the plan and stay brief; §8 and
`docs/LOG_ARCHIVE.md` are appendices you read at the step that needs one. There is no second rules
file and no second work list — §3 is the only list and it holds only what is still open.

**A note on `§7.N`.** ~400 code comments cite `§7.N` — the ORIGINAL numbered records, which live in
git at `79c239b:docs/MASTER_PLAN.md`. §5 keeps every lesson the code still cites at its original
number, so a `§7.N` citation still resolves. There is deliberately no section 7 here, so the
citation can never be misread as one.

**WHERE THE WORK STANDS — read this first on a handover.**
- HEAD on `claude/master-plan-cleanup-ld1oh1`, pushed to `main` too (rule 14).
- **Take §3's first open step, finish it, stop** (rule 10 states it in full). Do not write a "next
  step" note here naming anything but §3's first line; one was written, it disagreed with §3's
  order, and two steps were skipped behind it.
- **There is no current violation count and there is not meant to be one** (rule 11). The harness
  is deliberately red: what it prints is the unbuilt half of §3, so a count taken now measures how
  much list is left, not whether a change was good. The reference to judge against is
  `SHOCKS=0 WEEKS=16` at step 38, and the last one taken — **231 in 46**, money family clean — is
  history, not a target. Do not open a run to explain a print.
- **Recording a step:** delete it from §3 and write ONE LINE in §9 — what changed, why, the
  measured numbers. A lesson a FUTURE step could trip over goes in §5 as well; nothing else does.

**Where this list came from (2026-09-02): a line-by-line audit of ~230 files / ~55k lines**, which
found ~380 defects. Every material one is a step in §3 at its file:line (or, once done, in §9), and
**the sweep in full is in §8 so nobody re-derives it** — including the long tail that did not earn a
step. §8 is a record, not a work list, and it was NOT re-verified: treat a finding there as a lead
with a file:line. The headline that set the order: money and ownership do NOT close, price is NOT
universal (credit trades at par, commodity spot is a drift formula), and the instrument that
measures all this is itself broken (the wires family never prints, the per-bank identity check has
never fired). The atlas (§9, `docs/systems/`) then found what a sweep structurally cannot: what is
ABSENT.

## 1. RULES OF ENGAGEMENT

Standing user directives. Not suggestions. Eighteen; none of them restates another.

### The world

1. **Reflect the real mechanism.** When in doubt the answer is how it actually works, with real
   named counterparties. Ask before a large scope decision.

2. **The fewest primitives that generate the world.** A number is a legitimate primitive ONLY if no
   mechanism can produce it: **TECHNOLOGY** (what a process physically takes), **PREFERENCE** (time
   and risk), **POLICY** (what an institution chooses). Everything else — ownership, prices,
   quantities, capacities, allocations, shares — is an OUTCOME, and a stated value for one is a
   defect with a scheduled death. So a real-world PRIMITIVE may be imported (a tax rate, a
   replacement rate, a regulatory ratio, a haircut, a storage cost) and a real-world EQUILIBRIUM may
   not (invoicing dominance, a foreign ownership share, a CB market share, a sector growth rate):
   import the answer and the model can never tell you anything about it. A target allocation is a
   long-term policy guide, never what a participant buys this week. **A residual with no holder is a
   defect, not a boundary.** RESOLUTION parameters (strata count, grid size) are numerical choices
   tested by INVARIANCE; SHAPE parameters (a Pareto alpha, a tier share, an MPC ladder) are claims
   about THE ANSWER, and their count measures how much mechanism is missing. Keep it falling.

3. **Every price is the result of real supply/demand clearing.** Every asset is measured in UNITS —
   par, shares, tonnes, contracts — and carries the cleared PRICE those units trade at. OAS,
   discount margin, yield and P/E are statistics DERIVED from a cleared price, never the mechanism
   that sets it: you VALUE a loan on its discount margin and you TRADE it on price. A mechanism that
   clears a spread and derives a price from it has the causation backwards. One exception:
   central-bank ADMINISTERED rates (SRF / ON RRP) — a posted rate with a REAL QUANTITY RESPONSE,
   booked on both sheets. A posted rate with no position is not the exception.

4. **"1$ is 1$" — one representation per real thing.** Every dollar and every share traces to a
   named counterparty, and every fact has ONE writer. The anti-pattern to hunt and kill is two
   disconnected representations of one real thing: a cleared ledger and a parallel formula that
   overwrites or ignores it.

5. **Every flow has two sides, and both legs go in the same pass.** A security movement has a cash
   leg; a derivative has a counterparty with finite capacity; a payment leaving one book arrives on
   another. **A one-sided flow is a defect even when nothing fails and every test passes.**

6. **No bounds of any kind** (user, 2026-09-02: "no more boundaries, no more dampeners, no more
   clamps; none of that anymore"). No cap, floor, ceiling, clamp, damper, rescale, guard-break or
   `Math.max(0, …)` standing in for a decision — and never a print parked on a bound, the subtlest
   form being a bound that looks like dollars and is a percentage in dollars' clothing. The ONLY
   admissible bound is arithmetic impossibility: a price cannot be negative, a count cannot be
   fractional, a share cannot exceed its whole. If a number explodes, the mechanism that should
   compensate is missing — build it. A bound covering a missing mechanism is deleted WITH that
   mechanism built, in one step; that pairing is the only sequencing allowed and it is not an excuse.

7. **A tolerance is float dust, never a percentage** (user, 2026-09-03: "if 1000 disappears without
   a reason something is wrong"). An identity holds or it does not. A check may forgive only the
   error the FLOATING-POINT ARITHMETIC ITSELF introduced — about `n × eps × Σ|terms|`, derived from
   the size and the COUNT of what was added, orders of magnitude below anything the model trades. A
   percentage band is a business judgement in a numerical costume: it says a thousand dollars may go
   missing if the book is large enough, and rule 4 says a dollar is a dollar whatever it sits next
   to. **A check that only passes with a percentage band is reporting a defect and the band is
   hiding it.** Set a new check's tolerance from the arithmetic, watch it fail, and fix what it
   names — never widen it (rule 13 forbids the rollback; this forbids the quieter version).

8. **Periodicity, price level and unit of meaning are part of the number.** Every rate, flow and
   index carries a period; confirm it at the source and name it in the identifier (`…WeeklyUSD`,
   `…Annual`, `…YoY`). A field named USD is not a share. **A displayed change where no history
   exists is a lie — show the level.**

9. **Instruments are named, keyed and shown as a market names them** (user, 2026-09-02, extended
   2026-09-03). A bond is issuer + coupon + maturity; a loan is issuer + margin + maturity; a bill
   is issuer + tenor. An internal id is fine as an id and is never the display name — and never an
   invented GROUPING (a tenor bucket, a band, a bucket key) standing in for the instrument: a book
   is keyed by the thing that was bought. Every asset that has a price shows it, fixed income with
   BOTH the price and the spread; an asset with no displayed price is one nobody can judge.

### The work

10. **§3 IS THE ONLY WORK LIST, IT IS WORKED STRICTLY IN ORDER, AND ONE STEP AT A TIME**
    (user, 2026-09-03). Three parts, none of them optional:
    · **In order.** Take §3's FIRST open step. Not the interesting one, not the one that unblocks
      something else, not the one a print made look urgent — later parts depend on earlier ones,
      and a step taken out of order is built against a world that has not arrived yet.
    · **One at a time.** Finish the step you started — gates green, §3 entry deleted, §9 line
      written, commit pushed — before opening the next. A step half-done is worse than not
      started: the next reader cannot tell which half is true.
    · **A new idea is INSERTED, not appended.** When the user proposes something mid-project, it
      does not become a note, a side file, or a job for later — it goes into §3 at the position
      its dependencies put it, which is often BEFORE the step in hand. Say where it landed and
      why there. If it belongs before the current step, finish the current step first, then take it.
    A step leaves §3 for §9 when it is done. Anything worth keeping goes in this file: there is no
    second rules file and no side plan.

11. **Do not measure, evaluate or diagnose mid-project** (user, 2026-09-03: *"I forbid you to do any
    test or run or verification until you finish the plan"*, and *"you're trying to diagnose issues
    of a simulation with tons of errors left to fix, that makes no sense"*). BUILD THE WHOLE LIST,
    THEN MEASURE. Numbers taken halfway describe an economy that does not exist yet, and the harness
    is DELIBERATELY RED: a violation it prints is one of hundreds whose causes are unbuilt steps, so
    diagnosing one of them is work on a world that does not exist. Do not chase a moved baseline, do
    not A/B, do not open a run to explain a print, do not add a step because a number looked wrong.
    **A misbehaving number is not a work item; the missing MECHANISM is** — the single exception
    being a number so far out that it BLOCKS mechanism work, and then the work is naming which
    missing mechanism it is the accumulated cost of. Mid-project, only §4's cheap gates run, and
    they are gates, not experiments. Every harness run belongs to the measurement section (step 38).

12. **Fix the cause, not the symptom** (user, 2026-09-03: *"Don't fix the symptoms, fix the
    cause."*). A finding is not understood until you can name the thing that MADE it, and the test of
    that is whether the fix DELETES the symptom's plumbing rather than fencing it. The tell that you
    are patching a symptom: the fix is a LIST (add a bound, add a test, add a flag), it leaves the
    original mechanism in place, and every item on it is independently arguable. A cause has one fix
    and it removes code. Two worked examples in §5.

13. **Never roll back.** When a change makes a print worse the answer is never to restore the old
    number. A derivation that replaced an invented constant does not become wrong because the world
    it now describes is uglier — the ugliness was there and the constant was covering it. **A bad
    print is a finding, not a regression.** Only a change WRONG ON ITS OWN TERMS may be undone.

14. **One bounded commit per step, pushed to `claude/master-plan-cleanup-ld1oh1` AND `main`.** Never
    one large unreviewable change. The message says what changed and WHY, for a reader who was not
    here. **No model identifiers in any committed artifact.** No PR unless asked.

15. **The targeted-change test.** Adding a product line, a lead time, a revenue rule or a fund type
    must be ONE change: a registry entry, or one profile module. All DATA lives in a registry; all
    BEHAVIOR that varies by kind lives in a profile behind a dispatch table. **A stage may not switch
    on an industry, sector, entity type or product id.**

16. **Brevity — in the code and in this file.** A comment earns its place by saying what the code
    cannot: why a constant has its value, what a non-obvious mechanism is, what was tried and failed.
    **A comment describing code that no longer exists is a defect**, and so is a stale rule or
    section reference. This file is a work list and a ledger of OUTCOMES, not a diary: a §9 entry is
    a line or two — what changed, why, and the measured numbers — never a narrative of the session
    that produced it. Clean up as you go.

17. **No forecast without a falsification test.** A record may state an expectation only with the
    measurement that would kill it.

18. **Performance campaigns: depth is untouchable, representation is free.** Mechanisms, economics
    and named boundaries never change under one; storage layout, fold order, parallel decomposition
    and scaffolding deletion are the campaign's to decide. Use the strongest gate the change admits —
    byte-identical dumps wherever possible; a change that is inherently a relabel is a DECLARED
    re-baseline, named in its record. New column stores are SAB-backed with copy-on-grow, and every
    growth path copies.

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
    · a PIECE OF PAPER is the instrument it IS — a TRANCHE id for credit AND for a sovereign
      (rule 9: there is no bucket), the company id for equity, the fund's id for a fund share;
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
    *(37-SEED handed this step two findings it already owns. **(a)** the seed's spread table is the
    permanent CASH FLOW of every bond the world opened with — `RATING_OAS_SPREADS` sets
    `oasSpreadBps`, and `generateDebtTranches` derives every coupon and loan margin from the same
    table, so a cleared spread in week one moves the print and never the coupon. It has nowhere
    else to go until a clear produces the spread (atlas the-seed E1). **(b)** `O7`, 409 tranches
    claimed beyond their face by $439.28 — the seed rounds each holder's slice on its own, so the
    slices sum past the face. Both die when the allocation becomes a per-tranche clear.)*
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
    | Sovereign | `sovereignBondHoldingsByBond: Record<tenor, USD>` | no | no | yes |
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
    5. *(Done — 13-SOV row 3: sovereign holdings are register rows naming a bond, so there is
       something to attach a price to.)*
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
      its own). Measure which before touching any of them, and per rule 11 do not judge the
      levels on the way.
    · ~~**13c-FX — CONVERTING AT THE LEDGER IS THE WRONG MECHANISM, AND IT IS MINE**~~ (DONE,
      §9.13c-FX; kept here because the reasoning is the step) (user, 2026-09-03:
      *"is that the cleanest and the real world way of doing that?"* — it is not).
      §9.13c part 2 settles a cross-currency payment by debiting the payer in its own money and
      crediting the payee in its. That conserves value and closes every identity, and it is wrong
      three ways:
      **(a) it makes the per-currency account dead code.** No party ever ends a week holding a
      second currency, so the structure this whole step exists to build is never used;
      **(b) rule 4 — the conversion is ALREADY modelled.** `fx-clearing.ts:108` reads *"an
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
      orders nobody places — is deleted, which is rule 3 on the flow that sets the rate;
    · **stage 05's household leg.** `05-unit-bidding:2191` pays `units × book.clearedPriceUSD`
      for a household, segment or treasury buyer — the ORIGIN auction's money — where the firm
      loop two hundred lines above converts to buyer money first (`exWorksBuyerMoney`). Both are
      now honestly labelled, so the household leg converts at the ledger instead of not at all;
      that it was ever a raw number was a 34% discount on every foreign good a household bought.

13-SOV. **THE SOVEREIGN IS A BOND — FINISH THE CONVERSION.** *(Rows 1, 3 and 4 done; row 2 all
    but — §9.13-SOV.)* (user, 2026-09-03: *"the sovereign needs to be completely converted. it
    should have the same construction of a normal bond, they are a normal bond with some different
    characteristics."*) A sovereign is a fixed-rate senior bullet bond whose issuer is a
    government: it has no characteristic a corporate bond lacks, it only LACKS some (no seniority
    stack, no call protection, no floating leg). Two of the five parallel structures are left.

    · **Row 2's declared delete.** Make the rebuild write the store directly, then delete
      `reg.govDebtTranches`, `tenorAtIssuanceYears` (provably derivable) and
      `reconcileLadderByWire`, which exists only to keep store and array in step.
      `macro/evolution.ts`'s one array read comes with it — it takes a bare `region` and needs a
      `v2` handle it does not have.
    · **Row 5, the parallel curve.** `reg.zeroRates` is written BY the clearing rather than read
      FROM it. It becomes a derived read of the cleared bond prices, which is step 25's
      two-curve-owners defect and cannot be fixed before row 4 (done). Deletes
      `computeSovereignBookAnnualYield`'s separate path and `assets/index.ts`'s `YIELD_LIKE` row.


13b. **Coupon accruals are dated wires.** `pendingHolderAccrualUSD` is a side map beside the
    paper. It should be a dated wire that RE-KEYS with the paper when the paper moves, landing on
    the per-tranche register — the same treatment every other claim now gets. Step 13 keeps
    accrual on FACE; this makes the accrual itself an instruction rather than a number in a bag.

14. **Nomenclature** (rule 9). A tranche's display name is issuer + coupon + maturity
    (`KRLN 4.75% 2031`), a loan issuer + margin + maturity (`KRLN L+350 2029`), a bill issuer +
    tenor, a sovereign the same. `ui/objects/tranche.tsx:50` currently labels with the internal id.
    One naming function in `domain/instruments.ts`, used by the UI, the news and every trace.
15. **Search by asset, price and spread together** (rule 9). `ui/objects/tranche.tsx:50` is
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
    stated shape** (user, rule 2): initial margin covers the move a position can make before it
    can be closed — the reference's own volatility over a close-out horizon, scaled by the
    portfolio's netting — and variation margin is the mark, daily. Both fall out of quantities
    this model already clears, so neither needs a number. Novate every
    contract to the region's CCP: each side faces the CCP, initial margin is posted TO it, variation
    flows THROUGH it, and a default is its waterfall (IM → default fund → mutualisation) rather than
    a bilateral close-out. Capacity becomes a clearing-member limit, keeping rule 5. Then the market
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
    deviation, and trades BOTH legs (rule 5). A new asset class joins by declaring its comparable,
    not by growing a flag. `RELATIVE_VALUE` becomes a fifth strategy, and the four existing ones
    keep their directional books.
    **The design constraint that decides whether this is a mechanism or a plug:** the arb book
    must be CAPITAL-CONSTRAINED and able to LOSE — funded in repo or prime brokerage, posting real
    margin, forced to cut when it draws down. Limits to arbitrage are why real bases persist. A
    fund that always closes the gap is a clamp wearing a fund's clothes, which rules 3 and 6
    forbid, and it would mask exactly the defects P2 and X2 exist to report. **The audit keeps
    measuring after the funds exist:** a basis that survives a well-capitalised arb book is a
    finding; one that only survives because nobody could trade it was never a price.

### PART III — NOTHING IS BOUNDED (rule 6)

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
    as bounds, rule 2 as well); `double-auction.ts:116` (a 10,000-iteration guard that silently
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
20. **Where a bound covered a missing mechanism, BUILD THE MECHANISM** (rule 6's pairing). Named:
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
    whatever the cause. Measure on the reference before building (rule 11).
20d. **Management is a state that decides.** `management-review` reviews; it does not decide.
    Capital-allocation policy (target leverage, payout versus reinvestment), growth-versus-margin
    orientation, risk appetite, product-line entry and exit, acquisition intent, guidance — each a
    real decision with a real consequence, replacing a coefficient that stands in for one.

### PART IV — EVERY PRICE IS CLEARED (rule 3)

20-LLR. **NOTHING CAN FAIL FOR WANT OF LIQUIDITY, AND THAT IS THE MONEY SYSTEM'S LARGEST HOLE**
    (user, 2026-09-03, asking whether the desks and the central bank are buyers of last resort so
    that an auction cannot fail — half right, and the half that is right is not in the auctions).

    **THE AUCTIONS ARE FINE, and the reasons are worth keeping.** A stock book hands nothing to a
    residual dealer: `unsoldStaysWithHolder: true` in 07b/07c/07d/07e/07f means a seller that
    finds no buyer KEEPS ITS PAPER (OWN7). The desks are capacity-bounded participants with real
    reservations (`dealer-desks.ts:106,153`), not a backstop. The central bank's auction order is
    `plannedPurchasesByBond`, sized by `openMarketPolicy` from the policy rate against the
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
      haircuts from `computeSovereignRepoHaircuts`). That is rule 4: two ways to borrow from the
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
    fund have anywhere to be. Expect the run to get worse before it gets better, and per rule 11
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
    market's answer today (rule 2).
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
    rule 3 does not allow and no step currently covers. Households, builders and estates clear
    dwellings by price; the aggregate becomes a read of units with owners, and houses get their
    wires.

### PART V — THE INSTRUMENT TELLS THE TRUTH

27. **The audit measures what it claims — and its tolerances are float dust (rule 7).** The
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
28. **The harness's own defects.** *(The first — the NaN per-bank identity — is DONE, with the
    over-pledge and SME-cash reads that were dead the same way; §9's lint entry.)*
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
    instrument's own seniority (rule 12: `P1`'s count is the symptom, this is the cause) and
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

### PART VI — THE PRIMITIVES FALL (rule 2)

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
    (`BANK_BALANCE_SHEET_RATIOS`, including a central-bank balance sheet at 44% of GDP — rule 2 names
    a fixed CB share as the forbidden class), `:239-241,280-284,297-301,305,323`, `:105-106`;
    `pricing.ts:38` (per-sector growth and vol, read LIVE every quarter at `stage08-back.ts:1948` to
    manufacture a three-analyst consensus from hard-coded 0.96/1.08 multipliers — rule 17 as well);
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

### PART VII — WHAT THE ATLAS FOUND

Step 37 is DONE (§9, THE SYSTEM ATLAS — MAPPED). 45 trees and 2 instrument contracts walked onto
the code, ~1,400 nodes marked, 910 machine-checked citations. It produced **331 findings**, of
which 217 were already steps here or are measurements for step 38. The remaining **114 are new**,
and they are consolidated below into the steps that actually close them — a finding is not a step,
and twenty trees reporting one cause is one step, not twenty.

**Ids are suffixed on 37 because that is where they came from**, matching the plan's own convention
(13-SOV, 20-LLR, 21-BRACKET). Each step names the tree NODES it closes, so the atlas and the plan
cannot drift apart: when the step lands, those nodes are re-marked in the same commit.

**Ordered by what unblocks what.** The two verification steps went to the head of PART I (below);
what is left here opens with the single causes that each disable a whole channel, then the absent
systems, in the order their absence distorts the most. **37-GOODS-RECIPE is deliberately last** —
it moves every input-output number in the model, so it needs a stable measurement to land against.

**37-SEED and 37-ZEROSUM have MOVED to the head of PART I.** They are verification steps: one
makes week zero auditable, the other adds the three invariants that would have found much of this
list without a person reading anything. Leaving them here — behind forty-seven steps — would have
meant every one of those steps was verified by an instrument the atlas had just shown to be blind
at week zero. The rest of PART VII stays in the order below.

37-LOSSRATE. **A LOSS RATE IS NOT A DEFAULT, AND FOUR SYSTEMS RUN ON ONE.** (banks-lending E1/E2;
    sme-pools E1; firm-birth-and-death C2.a pooled tier, E3; housing C4/C4.a; cds D1.)
    **The named-firm tier is CLEAN** — no hazard rate, no PD against a random draw; every named
    default is a state test taken after the revolver is drawn, and the structural PD only prices.
    Everywhere else it is arithmetic:
    · `bank-lending.ts:243` — `lossUSD = principal × PD × LGD / 52`, weekly, for the SME tier. The
      debt is extinguished by subtraction: no event, no borrower, no cash, no recovery;
    · `BankLoan.status = 'DEFAULTED'` is declared and **assigned nowhere**, so a bank loan cannot
      default, it erodes — no reclassification, no workout, no write-off date, and no provision
      stock either (`loanLossProvisionRateAnnualPct` is a realised loss rate);
    · housing default is a loss rate with **no foreclosure** — no house seized and no foreclosed
      supply back into the price, which removes the loop that makes a housing bust a housing bust;
    · inside an SME pool, entry is the accounting identity of exit, so the population is constant
      by construction (E3's FORBID).
    One mechanism closes all four: a pooled borrower that can cross a threshold, default as an
    event with a date, and a recovery that is what something fetched. Large, and it is the single
    largest hole in the credit channel now that the atlas has separated it from the clean half.

37-MARGIN. **AN UNMET CALL BECOMES A LOAN — THREE INDEPENDENT SIGHTINGS OF ONE SHAPE.**
    (prime-brokerage C3/C5/D1–D3, E4; hedge-funds D3/D6/E3, D5/D5.a; the-derivative-layer D4/D4.a,
    D1/D5/F2; fund-shares C2.b/C4.a, F2.) The forced-seller channel is the mechanism four trees are
    built around, and it is floored shut at one line each time:
    · `prime-brokerage.ts` genuinely cuts the line and takes the cash back — then writes
      `primeBrokerageAvailableUSD: Math.max(0, lineUSD − targetDrawnUSD)`, floored at zero, so the
      forced-sale path that `institutional-balance-sheet.ts`'s own comment describes **has never
      run**; then `overdraft-sweep.ts` lends the whole shortfall back from the same broker at
      +200bp;
    · in the derivative layer `payToB` has no cash test, so a variation-margin shortfall becomes a
      revolver draw. Margin is a stated RATE, so it cannot rise when it matters — which deletes the
      procyclicality that IS the contagion mechanism;
    · household and MMF redemptions are **rationed by the fund's cash** rather than met by selling,
      and a hedge fund has no redeemable share at all.
    `grep "liquidat" stages/` returns five comments and zero code. Nothing in this model is ever
    forced to sell anything, which is why no shock has ever propagated through a price.
    Large. Sequence after 37-LOSSRATE; both need the same "a claim goes unpaid" primitive.

37-IMMORTAL. **NOTHING CAN FAIL EXCEPT A FIRM AND A BANK.** (hedge-funds E3; insurers-and-pensions
    A3/D3; prime-brokerage D4; private-equity D5/A4.) `InstitutionalEntity.isDefaulted` is read in
    16 places and **written only by the seed**. Every fund, insurer, pension and sponsor is
    immortal; a PE fund never winds up and the LP's claim is frozen at the seed. An underfunded
    pension's `pensionHurdle` makes it reach for MORE risk with no solvency consequence. Small in
    code — the reads already exist — and it is what makes 37-MARGIN's chain terminate somewhere.

37-COSTOFCAPITAL. **NOBODY PAYS FOR MONEY, SO PRICE CANNOT REACH A DECISION.** (banks-funding B2/B2.a;
    banks-lending C1/C1.a; the-capital-programme B1/B1.b/B5/B3; dealer-desks D3.) The transmission
    channel this whole model exists to have, broken at three joints:
    · **a bank has no cost of funds.** `quoteLoanMarginBps` has no funding term; the all-in rate is
      `policyRate + margin`, so every bank prices loans as if it funded at the policy rate whatever
      its own position. The central-bank loan even carries TWO rates — the NIM statistic charges
      the bank's own cleared OAS and never debits equity, while the cash pays policy + 125bp flat;
    · **investment is a rate on revenue.** `desiredGrowthCapex = revenue × ratio × six multipliers`
      — B5's FORBID exactly — and **nothing anywhere compares an expected return to a cost of
      capital.** The drag term that does exist reads `annualInterest / totalDebt`, the average
      coupon on debt already outstanding, not the cleared marginal cost; the equity cost never
      enters at all;
    · a dealer's inventory consumes cash and capital and is **never charged rent**, so carrying a
      position is free and the desk has no reason to shed it.
    Large, and it is the step that makes every cleared price in Part IV actually do something.

37-FX-CROSS. **THE MARKET CLEARS SIX PAIRS AND THE LEDGER READS THREE.** (fx-spot E3/A3/C3;
    currency-and-fx C3/C3.a; fx-forwards B3/C4, A1.c/B1/E1, A4, C1/C1.a/C3, D3, A1.b/A2/E3.)
    `fx-clearing.ts`'s XB6 header sets out at length why each pair must clear on its own flow — so
    the USD stops being the cheapest vehicle currency BY CONSTRUCTION, with triangular consistency
    demoted from an identity to an outcome that bounded desk arbitrageurs may fail to enforce. Then
    `publishFxRates` promotes only the three legs against USA and every conversion triangulates
    through the numéraire. **The market half of the fix landed and the ledger half never did**: the
    arbitrage has no consequence and cannot be measured, and the USD is still the vehicle currency
    by construction for every payment in the model. The same seam carries the rest of the FX gap:
    · the **forward rate is not cleared** — `strike = spot × (1 − basis/10000)`, carrying no
      interest differential, so it is not CIP either and carry is absent from the instrument;
    · there are **two cross-currency bases with nothing to do with each other** — the cleared
      `reg.crossCurrencyBasisBps`, and `evolveFxPair`'s cumulative random walk on
      `basisSpreadBps + noise + (rDomestic − rForeign) × 20`, which is the one the player sees,
      trades and books P&L on;
    · **no XCS and no FX swap**, so the forward never delivers and the banks — who need this market
      most — are not in it.
    Medium. The cross half is small and at a seam; the forward and swap half is a real build.

37-BENCHMARK. **THE THINGS EVERYTHING PRICES OFF ARE NOT PRICES.** (indices D1/E1/E2, D3/D3.a/D3.b,
    D4/D4.a, A3; goods G1/G1.a.) Three of them, and each contaminates everything downstream:
    · **two index systems, and the one everything reads is the invented one.**
      `index-calculation.ts` builds a rule-based level from constituents and is read NOWHERE. What
      is read is `macro/indices.ts:calculateCompositeIndices` — a stored level moved by a delta,
      whose 52-week opening history is `generate52WeekHistory`, a random walk. `stage08-back:2016`
      measures every beta off that history, so **for year one every beta in the model is a
      covariance against a random walk** — and beta is the discount rate in `07e`'s
      `fairValuePerShare`, in `bank-lending`, in `labor-market` and in `freight-clearing`;
    · **the benchmark is a posted policy rate.** ~25 sites fix floating coupons on
      `reg.policyRate`, set by a Taylor rule; `Company.referenceBenchmark` is a label nothing
      prices off. A cleared overnight rate already exists (`repo-clearing` → `reg.repoRateAnnual`)
      and nothing fixes on it, which makes this small;
    · **there is no PPI** — one index wears both names, real growth is deflated by CPI, and the
      input price is already cleared and distinguished at `price-index.ts:52`. The margin story
      (user, 2026-09-03) has no second series to be a story about.
    The first is large and urgent; the second and third are small.

37-CDS-DIRECTION. **THE DEFAULT PROBABILITY IS AN INPUT TO THE SPREAD, NOT A READ FROM IT.**
    (cds C2, A1.d, D5/E2/E3, B1/B3/B4.) `derivative-markets/cds.ts:88` computes
    `computeAnnualDefaultProbability` from the firm's accounts, feeds it to every seller's
    reservation and clears from those. Nothing anywhere inverts a spread. **The CDS market cannot
    disagree with the accounting model**, which is rule 3 inverted in the one instrument whose
    whole purpose is to hold a second opinion about a credit. With one tenor and `termKey: ''`
    there is also no CDS curve and therefore no term structure of credit anywhere in the model.
    Medium. Pair it with 37-LOSSRATE: a spread can only disagree once a default is an event.

37-ESTATE. **A DEAD PARTY'S DERIVATIVES ARE PAID IN FULL, AHEAD OF EVERY RANKED CLAIM.**
    (the-derivative-layer E2/E3; trade-credit D2; firm-birth-and-death D6.a, D1, D4/D4.a.)
    `estate-resolution.ts:152` closes out derivatives at filing and `pay()`s replacement value out
    of the estate's account, while the claim list built at `:520` carries five instrument types and
    **no derivative** — accidental super-seniority over every secured lender. In the same estate,
    **trade creditors rank nowhere while the estate COLLECTS the dead firm's receivables as an
    asset**, so recoveries — and the model's calibrated recovery rate — are biased high by exactly
    that asymmetry. Also here: a dead firm with no claims opens no estate and keeps its cash for
    ever (rule 2), estate assets are sold to peers at a formula discount off book rather than
    cleared, and a firm's death drops its headcount with no separation event. Medium; it is
    §3.13's waterfall work seen from the liability side.

37-DVP. **DELIVERY AND PAYMENT ARE TWO EVENTS, AND THE PAPER LEG IS THE LARGER ONE.**
    (the-register C3.a/C3.b, D4; the-clearing-engine E4.) Securities wire at `holdings-writeback`,
    cash at `settlement`, two stages apart — and `book-settlement.ts:89` caps the issuer's cash at
    `min(takeTotal, tradingUSD)` while `:97` moves the **whole** take of paper, with `leftoverUSD`
    zero in that case so the defect guard cannot fire. That is also why a settlement FAIL has no
    code: there is no single event to fail. Two riders on the same commit: **nothing records what a
    position cost** (no basis anywhere in `src`, so no realised gain and no tax base), and **a
    market with no trades still prints** (`runClearingKernel` writes `clearedStat = currentStat` on
    skip with no flag), which folds into 21-BRACKET's signature change.

37-MMF. **THE MONEY FUND'S NAV IS ONE DOLLAR BY CONSTRUCTION.** (fund-shares D4, A3, B1.)
    `mmfSharesOutstandingUSD` is measured in DOLLARS, not shares; income is distributed as new
    shares and losses are swallowed by a `Math.max(0, …)`; redemption pays $1 per $1. Breaking the
    buck is a harness measurement rather than an event, which is D4's FORBID exactly. It matters
    beyond the fund: the MMF is the household's alternative to a deposit (user, 2026-09-03), so a
    money fund that cannot break is a risk-free deposit substitute, and the substitution it is
    supposed to drive is riskless in one direction. Small, and step-13-shaped — it needs a share
    count.

37-PENSION. **THE LIABILITY IS A CASH BALANCE, NOT A PRESENT VALUE.** (insurers-and-pensions
    B1/B2/B2.a/B2.b/E3, A2.a/A2.b, B4/C3.) `beneficiaryLiabilityUSD` accumulates
    `contributions − benefits + investment income`. No schedule, no discount rate, no discounting —
    so B2.b's forbidden outcome, a liability that never moves when rates move, is reached by a
    shorter road than a fixed rate, and solvency is measured against exactly the stored value E3
    forbids. The sector is also a fund share rather than a liability: the investment result passes
    straight to the beneficiary. This is the model's largest holder of duration having no duration.
    Large.

37-BOP. **THERE IS NO BALANCE OF PAYMENTS.** (cross-border D1/D2/D3/D3.a/D4.) `currentAccountPctGdp`
    has **no writer at all** — seeded 0, rendered on two screens, permanently 0.0%. No financial
    account exists. §3 step 15 lists that 0.0% among UI FORMATTING errors, which is the symptom and
    not the cause (rule 12). Every ingredient exists and is unjoined: exports and imports from real
    fills, income via the register, and `fx-clearing` already computes each entity's change in
    foreign holdings by issuer region. Small-to-medium, and it is the read that would have shown
    every cross-border defect this atlas found by hand.

37-COMMODITY. **THERE IS NO COMMODITY STOCK — NOT A BAD ONE, NONE.** (commodities-spot
    D2/D2.a/D5/F1/F2, A1.a/A4/D3/C3/B4, E1/E3/E4; commodity-futures C4.a/D2, B3.a/D3/E3,
    B4/C1.a, A1.a/A2.) `Commodity.inventoryLevelPct` is a **percentage on a random walk in [0,100]**,
    untouched by production or consumption and not an input to the price; supply and demand units
    are two independent elasticity formulas never reconciled against each other. So the identity
    `produced + opening = consumed + closing` has no terms. Every commodity exists TWICE — a
    written price series, and a real goods sub-unit that genuinely clears — and the join runs one
    way only. Downstream, futures converge by an ENFORCED boundary because nothing can be
    delivered, there is no roll, and the carry arbitrageur cannot store. Large; step 22 owns the
    spot walk and this is the half it does not cover. The goods side's W4 units identity is the
    machinery it needs.

37-HOUSING. **NO DWELLING EXISTS AS AN OBJECT.** (housing C5, C4/C4.a, and 26b/13's item 1.) Stock is
    `population/2.5 × ownershipRate × medianHomePrice`; `HOME_OWNERSHIP_RATE` is written once at
    init and never again; construction output never enters the stock; the wire ledger **declares an
    asset kind `'HOUSE'` and no wire of that kind is ever written.** And **the lending standard
    never tightens** — `MORTGAGE_DSTI_LIMIT` and `MORTGAGE_LTV_AT_ORIGINATION` are constants no
    code path writes — so half the housing cycle is missing and only the rate channel loops.
    The price itself is honest and worth protecting (a real marginal-buyer walk over tier
    affordability at the keenest bank quote, floored at build cost). Medium; needs step 26's
    unit-of-plant decision first.

37-MANDA. **THERE IS NO M&A MARKET. THERE IS A COIN FLIP.** (m-and-a B5/B2/B2.a/B3/B4/C1/C2/C3,
    E3/A4, D4.) `merger.ts:24` fires `random() < 0.20`, quarterly, at most one deal in the world,
    at `marketCap × 1.15`. No funding test, no acceptance, no rival bidder, no walk-away — so the
    credit market does not decide which deals happen and a target's owners cannot refuse. Two
    synergies are assumed straight into the combined firm (`revenue × 0.85`, `heads × 0.75`) and
    the headcount saving destroys jobs with no separation event. `D5` is one of the few present
    nodes: the money really does move acquirer → target → holders of record. §3 has no M&A step at
    all. Medium.

37-SECLENDING. **THE LENDER LOSES THE DIVIDEND AND PAYS FOR THE PRIVILEGE.** (securities-lending
    A3/A5.b, C1, C5/B3, D1.) No manufactured payment exists anywhere — `payHoldersCash` pays the
    register, i.e. the BORROWER — so A3's defining property of a stock loan (title moves, economics
    do not) is inverted. Collateral exactly equals the loan (`shares × stockPrice`, re-marked to
    the same), so there is no haircut and the one-week gap is covered by nothing; there is no
    chain, no agent, and a failed return never terminates. Small, and the tree's FORBID nodes
    (no short without a borrow) are clean, so this is a completion rather than a rebuild.

37-TRADECREDIT. **TRADE CREDIT HAS NO PRICE AND CANNOT BE WITHDRAWN.** (trade-credit A3/B4/C2,
    B2/B3/D4.a, D1/D3.a, E1.) The system EXISTS and is real — domestic and cross-border, genuine
    receivables and payables, cash both ways, terms derived from the buyer's PD and the seller's
    own funding. What is missing is its price (no early-payment discount, so no implicit rate and
    no factoring), its discretion (terms are a formula, so a worried supplier cannot tighten — the
    mechanism by which a solvent firm dies of a rumour), and lateness, which does not exist at all.
    The SME tier pays cash, and it is the tier that lives on trade credit. Medium.

37-SURFACE. **THERE IS NO ACTOR, AND THE DEAD ONE WOULD BE PRIVILEGED.** (news-and-the-player-surface
    C1–C4, E1/A5.a, B4, A4.) `executeTrade` has **zero callers**, and if wired it would break C2.a
    three ways: `updatedCash = cash − spreadCostUSD` so the notional never leaves the account while
    the desk IS charged it (money created at the ticket), the fill price arrives from the caller,
    and `PartyRef` has ten kinds and no PLAYER. The read surface is a full god-view — correct for
    an inspector, disqualifying for a player — and that is **a decision this step must take first,
    not a bug**. Also here: `newsGenerator.ts` still asserts a stated 40% recovery on every default
    while the estate computes a real one, and two display-only numbers are shown that no code
    writes. B2.a holds — no mechanism reads the news feed. Blocked on the game layer, which the
    user has parked; the DELETE half (dead code, invented news, display-only numbers) is not.

37-SMALL. **THE ONES THAT ARE ONE COMMIT EACH.** Grouped because each is small, independent, and
    would otherwise never be scheduled. Every one names its node so the tree can be re-marked:
    · **ratings E1** — the sovereign rating's complete consumer list is five UI strings, and
      **ratings C3** — collateral haircuts are one per instrument TYPE from the region's median
      move, so a CCC and a AAA bond are identical collateral. That is the one leg of the downgrade
      loop that is wholly absent, and a per-issuer OAS ring closes it with no rating table;
    · **sovereign-credit F2** — a bill accretes at this week's interpolated curve point rather than
      at the yield it was bought at, breaking the accretion stage's own conservation claim;
    · **short-term-debt A2/E2** — the short end clears a YIELD, so a bill's return is re-set weekly
      (13's shape, at the short end), and **B4** — a committed backstop is free, with no commitment
      fee on undrawn headroom;
    · **households D5.a** — MMF shares are issued pro rata and never chosen, so the deposit / money
      fund / bill substitution never happens, and **F2** — nobody inherits anything;
    · **labour B1** — participation moves by a constant keyed off a regime label with the wage
      nowhere in it, and **C2/C3** — firing has no cost, only a pair of speeds;
    · **freight E2** — `laneFillRatio` and `shippedShareByLaneSubUnit` are computed and read by
      nobody, so capacity sets the PRICE of distance and never the QUANTITY;
    · **goods B1.b** — `inputSupplyConstraintFactor` reaches only the UI;
    · **equity A5/F3** — there is no vote, so a take-private extinguishes the register without a
      tender anyone can refuse, and **C4** — `accrueInstitutionalIncome` skips every EQUITY row, so
      a holder's equity P&L reaches no income statement;
    · **private-equity B5** — LBO sources and uses do not balance: sellers are paid the equity
      cheque while the debt proceeds stop at the target;
    · **banks-lending F3** — no large-exposure limit, and `09-concentration-risk.ts:82` says in its
      own comment that it measures something else.

37-GOODS-RECIPE. **THE RECIPE IS A VALUE SHARE, SO EVERY INPUT SUBSTITUTES UNIT-ELASTICALLY.**
    (goods A2.a.) `recipeInputs` is cents-per-dollar-of-revenue and the draw is
    `neededUnits = neededUSD / inputUnitPrice`, so **a price doubling halves the physical draw.**
    That is the strongest substitution assumption there is, sitting where the tree chose Leontief,
    and it is invisible from the code — which reads as an ordinary units calculation. It changes
    every input-output result in the model, so it is listed last deliberately: it must land when
    there is a stable measurement to land it against, and its A/B is the whole point of it.
    Large. **Do not start it before 37-SEED and 37-ZEROSUM.**

### PART VIII — MEASURE ONCE (rule 11)

38. **The long run.** Only when 1–36 and every `37-*` are done: `WEEKS=60 SHOCKS=1` (`npm run verify`), the batteries,
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

    **And the atlas's forty VERIFY nodes**, which are measurements and not mechanism gaps —
    each one a "this should follow, measure whether it does" that nothing currently reads. They are
    listed per tree in each file's §3 THE DIFF under *"A measurement, for §3 step 38"*, and they are
    the standing reads this step exists to take. The ones worth naming here because they test a
    CAUSAL CHAIN rather than a number: a credit tightening reducing investment through the cost of
    capital and then output, with the build lag (the-capital-programme E4); a rate move showing as
    liability, hedge and cash in three different places for a pension (insurers D5); inventories low
    ⇒ backwardation (commodity-futures C3); heavier issuance moving the sovereign clearing price
    (the-treasury E4); the fiscal balance against private net saving (the-treasury F4); a commodity
    shock reaching margins, then inflation, then policy, in that order and never directly
    (commodities-spot E4); one defect lighting one audit family (the-audit B8).

    A number that is still wrong here is a missing mechanism named at last, not a tuning target
    (rule 11).

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

Rule 11: mid-project these are the ONLY things that run. All five are seconds, deterministic, and
none of them steps a week of the simulation. Green before every commit.

| Command | Note |
|---|---|
| `npx tsc --noEmit` | |
| `npx eslint src scripts test --no-warn-ignored --max-warnings 0` | **zero.** It used to ratchet; the backlog is gone and a warning is now a failure |
| `npm test` | the unit suite: contracts and arithmetic, never a run |
| `bash scripts/check-hygiene.sh` | carries `check-atlas.sh` and the stated-literal ratchets |
| `npm run build` | |

**No harness run until step 38** — not to check a change, not to explain a violation. The
violations ARE the unbuilt steps. When the list is finished, step 38 runs the ladder:

| `PROFILE=1 WEEKS=4 npx tsx scripts/harness.ts` | ~30 s | a profile, for the performance campaign |
| `WEEKS=13 SHOCKS=0 VERBOSE=1 NODE_OPTIONS=--max-semi-space-size=64 npx tsx scripts/harness.ts` | ~5 min | the working run |
| `WEEKS=60 SHOCKS=1` (`npm run verify`) | ~25 min+ | the close |

`--max-semi-space-size=64` is worth 7.5%; past ~14 weeks add `--max-old-space-size=10240` (16 weeks
OOMs without it). `UNIVERSE_SCALE<1` is iteration speed only — the rule-2 invariance test FAILS on
the current world. A 10-week probe samples ONE season; price behaviour is judged on whole years.
Dump/diff: `STATE_DUMP=<f> STATE_DUMP_WEEK=<n>`, then `DIFF_STATE=a.json,b.json npx tsx scripts/harness.ts`.

**Instruments, env-gated.** Adding one costs nothing now and step 38's runs carry it free, so a
step that needs evidence later leaves an instrument behind instead of a run: `FP`, `STAGE_TRACE`,
`BANK_IDENTITY_TRACE`, `COMPANY_STORE_AUDIT`, `TRANCHE_SYNC_CHECK`, `HOLDINGS_SYNC_CHECK`,
`OWN_TRACE`, `W2_TRACE`, `SPLIT_TRACE`, `WIRE_TRACE`, `DESK_TRACE`, `PNL_TRACE`, `DEFAULT_TRACE`,
`LABOR_CAUSES`, `SEED_BURN_IN`, `COUPON_TRACE`, `SOV_TRACE`, `BILL_TRACE`.


## 5. LESSONS — DO NOT RE-LEARN
Numbers are the original record's and never change; the full text is in git at `79c239b`.

**Method.** §7.4 the seed must open in the shape the engine produces (cited 91×). §7.222 permute the
loop order and hash the world — that is what "order-independent" means. §7.226 read the run's TOTAL,
not its first twenty weeks. §7.229 a rule with nowhere to live ends up locked in a stage. §7.241 what
wrong code still compiles is the question. §7.246 one wrong-signed factor cost CPI ×2.71.
§7.288/§7.289 three standing issues fixed in one pass, and the reference to judge against. §7.301 the
first full-pipeline reference found a three-defect regression the bisection named. §7.305 do not move
the goalposts: state the forecast and the measurement that kills it (rule 17). §7.307 run the
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
bound is not a price — recorded four times before rule 6 became absolute. §7.77/§7.82/§7.189 auction
the currency being SOLD; one defect, both directions, invisible to sign checks. §7.194 the swap's
floating leg is the compounded overnight print. §7.208 one party-keyed ledger for the sovereign
coupon calendar. §7.241 a mark leg that never pays is a book whose whole life collects nothing.
§7.337 a derivative is a CONTRACT, a class is its PROFILE, capacity is ONE budget. §7.382 one stage,
one standing index, byte-identical — 9.0 → 5.5 s.

**Behaviour and the world.** §7.122 a firm that sells nothing still BUYS. §7.138 the measured year is
the review's horizon. §7.158/§7.177 a shape parameter STANDS IN for a missing mechanism — deleting it
first makes the model wrong, not more bottom-up; the order is forced (rule 6's pairing). §7.165 a
field named USD is not a share. §7.181 people age; the seed's age structure is the stationary
distribution of its own birth rate. §7.238 seven pure rule objects, and the kernel's line count ROSE
— that is the point. §7.247 a self-referential growth signal is a shed driver. §7.344 two preference
primitives on every deciding entity; every threshold they parameterise becomes a median, not a rule.
§7.346 news is DERIVED — a story with no traceable cause is decoration. §7.347 behaviour switches
move into registries; lookups stay (rule 15).

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

## 8. THE APPENDICES — the two records that are not the plan

The 2026-09-02 sweep, as the reviewers wrote it: 1,771 lines of findings by area (A1–A11), with
its own step→area index. It was a RECORD and not a work list — §3 cites none of its rows — so it
lives in its own dated file and the plan keeps one live list.

**It was never re-verified**, its line numbers are from 2026-09-02, and at least one of its rows
was measured wrong. Treat a row there as a lead with a file:line, not a fact.

`docs/LOG_ARCHIVE.md` is the second: the long-form record §9's ledger lines were compressed from,
kept for the few entries whose reasoning a line cannot carry. Neither file governs.

## 9. THE LOG — WHAT IS DONE

A finished step leaves §3 and lands here as ONE LINE (rule 16): what changed, why, and the measured
numbers. The long-form record it was compressed from is `docs/LOG_ARCHIVE.md` — reasoning, not
governance. Violation counts are 4 weeks / `SHOCKS=0` unless the line says otherwise, and after
rule 11 they are step 38's to move, not a step's.

**37-SEED — the opening world, closed.** `F1`: `scaleFirmSize` resized a firm's revenue, shares,
plant, ladder and account and left its FILED STATEMENTS at the parent's or the pre-lift figure, so
**685 firms opened the world filing somebody else's balance sheet, 78.80B net**. They scale with the
firm now; a clone also deep-copies its snapshots, which it had been SHARING with its parent.
`D2`: the accrual ledgers opened empty against aged ladders. The cause was one line under it —
`paymentAnchorWeek` is optional and nothing had ever set it, so every reader fell back to `?? 0` and
**every bond in the model paid on one global cycle anchored at week zero**, whatever its issue date.
The anchor defaults to the ORIGINATION week (`tranchePaymentAnchorWeek`, resolved for the store's
rows by `trancheScheduleOf` — which also replaces two spellings of the same defaults, front seam and
back pass), and `seedOpeningAccruals` opens both ledgers at `annual × weeks since this bond's own
last coupon date / 52`. Neither split is re-implemented: the corporate side hands one opening accrual
to `applyHolderInterestAccruals`, the sovereign side calls the calendar's own holder walk, extracted
for the two callers. `tranchePaymentDue`, a second dead implementation of the due test, deleted.
E1's coupon half and `O7` are step 13's, where the allocation becomes a clear.

**13-SOV — the sovereign becomes an instrument.** Five rows, one commit each.
- **Row 1, the type.** `GovDebtTranche = DebtTranche & { couponRate; tenorAtIssuanceYears }` — the
  standalone interface was a fifth representation of a tranche (rule 4).
- **Row 2, the store.** Government ladders joined `v2.tranches` by the staged migration (store →
  dual-write → check → readers → declared delete). It put sovereign paper under W3 and the store's
  sync check for the first time, and found the seed rounding one span twice.
- **Row 3, the holders.** 1852.61B of government paper sat in four stores keyed by a TENOR BUCKET —
  banks 295.04B, central banks 676.30B, desks 11.84B, register 869.43B over 933 rows, none naming a
  tranche — so "who holds this bond" had no answer and `ownership.ts:o3` opened with an explicit
  `GOV_BOND` carve-out. `O11` sized it; the bucket concept is deleted and every store keys by bond
  id. Also deleted: `SOVEREIGN_COUPON_PERIOD_WEEKS`, declared twice beside `COUPON_PERIOD_WEEKS`.
- **Row 4, the price.** 07c and 07f cleared a YIELD and the engine values a `YIELD_LIKE` fill at
  `unitValueUSD = 1`, so a government bond changed hands at FACE whatever the curve said (rule 3).
  Both books now clear a PRICE with the yield derived; each instrument keeps its own convention
  (`priceFromYield`/`yieldFromPrice` for bonds, simple-interest discount for bills). `P8` measures
  the ladder's face against the cleared curve: **57.34B away from par** at the time. 70 in 24.
  Its own prerequisite, fixed first: `toFixed(4)` in the clearing engine was an absolute print grid
  that pinned a bill rate and quantised FX to a pip — now `toPrecision(10)`.
- **Row 5** — the parallel curve — is still open, in §3 under step 25.

**THE LINT RATCHET IS ZERO, AND THREE DEAD CHECKS FELL OUT OF IT** (user: *"can't you just clean up
all lint warnings in one go"*). 342 warnings → 0, and `--max-warnings` goes from 354 to **0**: a
warning is a failure now, not a budget. 128 unused symbols and 13 dead assignments deleted; 201
`any`s given their real types. The `any`s were load-bearing — each of these was a check that could
not fail, hidden by a cast:
- the harness's own per-bank identity check subtracted `bs.businessLoanBookUSD` and
  `bs.consumerLoanBookUSD`, **fields that stopped existing** when the loan books became reads of the
  rows (§5-WIRES D). `number - undefined` is NaN, `Math.abs(NaN) > 5e6` is false, so it passed every
  bank every week. Now reads `businessLoanBookOf`/`consumerLoanBookOf`, as `audit/money.ts:m5` does;
- the harness's over-pledge check read `p.bucketKey` off a repo pledge, renamed to `bondId` by
  13-SOV row 3, so it keyed every pledge under `undefined`;
- the SME diagnostic read `pool.cashUSD`, deleted by §5-WIRES A3.3, so "pool cash negative" was
  always zero. Now `poolCashOf`.
Also: `EarningsReport` was declared twice (rule 4) — once in `newsGenerator.ts` with `sector: string`
and once as `any[]` on the context — now one type in `domain/events.ts`; a `sector === 'RealEstate'`
test that `Sector` has never had a value for; and §8's two dead-code findings (`realYieldSignal`,
`demandAtStat` and their constants) deleted with their atlas nodes re-marked.

**37 — THE SYSTEM ATLAS.** `docs/systems/`: 45 required trees saying what must exist for each system
to be a system, written from the domain with the code shut, then mapped to `file:symbol` and
diffed; plus the instrument contracts in `docs/instruments/`. ~1,400 nodes, 910 machine-checked
citations, **331 findings, 114 of them new** (§3 PART VII). It is the only instrument here that can
find an ABSENCE — a sweep reads code and asks whether it is correct, and a missing price has no line
number (which is why credit had no price and FX did not exist through several full sweeps). Kept
alive by `scripts/check-atlas.sh` inside `check-hygiene.sh`: every citation must resolve and every
source file must appear in some tree.

**37-SEED — the seed is audited, and it finishes itself.** The audit ran from week 1, so the seed
was the one state nothing ever checked. `auditSeed` runs all six families at week 0 (separately from
`auditWeek`, which would retire week 1's empty-world baseline); the seed opens its own wire journal
so seeded ladders and books exist as wires rather than as arrays nothing minted. 50 in 19 → 53 in 19.
Rollover: seeded ladders are aged by a deterministic per-tranche fraction — **3,713 tranches, maturity
min 2 / median 183 / max 775, 189 inside 16 weeks against ZERO before** — which exposed immortal
debt (`maturityWeek === nextWeek` is a single-frame test; now `<=`).

**37-ZEROSUM — three invariants, all three fired on the first run.** `O10` a receivable is somebody's
payable (**13.73B with no payable**); `O9` every derivative carries a mark (**939 contracts on
357.83B of notional, unmarked**); `M8` the FX revaluation is the rate move on the world's open
position. 54 in 20 → 67 in 24.

**13c — CURRENCY IS A UNIVERSAL CHARACTERISTIC.** Four parts. The `USD` suffix was a lie on every
foreign balance; a party that must pay in a money it does not hold now BUYS it (13c-FX); a balance
in someone else's money is revalued when the rate moves, by two reads and not a formula (13c-REVAL,
251 in 51 → 243 in 48, the whole M family gone); the desks square with each other and the trade
aggregate is deleted (13c-FX-2, 243 in 48 → 241 in 47). What it did not do: the desks' NET still
drifts — that is step 25's.

**PART I — the settlement leaks, twelve of them**, each a flow with one leg. Interest never paid;
the underwriting residual delivered twice; four silent truncations; a goods mint; an estate that
never closes; bank resolution transferring a whole sheet; the treasury's own books; the register's
eight remaining holes; one running settlement net; both legs same money same counterparty; the wild
swings by named cause; carriers and the fuel nobody sells. Then the dead firm's money and goods
(11b), the central bank's remittance under-counting its own expense (11c), two silent drops (11d),
the household week's missing lag (9b), W5's register replay (11e), O7 (11f), the two curves and the
coupon moved onto the cleared one (13 part 2), and O8 — one piece of paper, one name.
248 in 48 against the baseline's 231 in 46.
